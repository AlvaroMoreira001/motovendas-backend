/**
 * src/controllers/events.controller.js
 * Com auditoria em: criar evento, ativar evento, ajuste de estoque
 * E o novo endpoint GET /events/:id/report para exportação XLSX
 */
const prisma = require('../config/prisma')
const { audit } = require('../utils/audit')

const eventsController = {

  // ── EVENTOS ─────────────────────────────────────────────

  async list(req, res) {
    try {
      const { active } = req.query
      const where = {}
      if (active !== undefined) where.active = active === 'true'
      const events = await prisma.event.findMany({
        where,
        include: { _count:{ select:{ stocks:true, sales:true } } },
        orderBy: { createdAt:'desc' },
      })
      return res.json(events)
    } catch (e) { console.error('[EVENTS] list:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async create(req, res) {
    try {
      const { name, location, eventDate } = req.body
      if (!name) return res.status(400).json({ error:'O nome do evento é obrigatório.' })

      const event = await prisma.event.create({
        data: { name:name.trim(), location:location?.trim()||null, eventDate:eventDate?new Date(eventDate):null, active:false },
      })

      await audit(prisma, {
        action: 'event_created',
        description: `Evento "${event.name}" criado por ${req.user.name}`,
        userId: req.user?.id, targetId: event.id, targetType: 'event',
        metadata: { name:event.name, location:event.location, eventDate:event.eventDate },
      })

      return res.status(201).json(event)
    } catch (e) { console.error('[EVENTS] create:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async getById(req, res) {
    try {
      const { id } = req.params
      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          stocks: { include:{ product:{ select:{ id:true, name:true, category:true, price:true, imageUrl:true } } }, orderBy:{ product:{ category:'asc' } } },
          _count: { select:{ sales:true } },
        },
      })
      if (!event) return res.status(404).json({ error:'Evento não encontrado.' })
      return res.json(event)
    } catch (e) { console.error('[EVENTS] getById:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async update(req, res) {
    try {
      const { id } = req.params
      const { name, location, eventDate } = req.body
      const existing = await prisma.event.findUnique({ where:{ id } })
      if (!existing) return res.status(404).json({ error:'Evento não encontrado.' })
      const updateData = {}
      if (name) updateData.name = name.trim()
      if (location !== undefined) updateData.location = location?.trim()||null
      if (eventDate !== undefined) updateData.eventDate = eventDate?new Date(eventDate):null
      const event = await prisma.event.update({ where:{ id }, data:updateData })
      return res.json(event)
    } catch (e) { console.error('[EVENTS] update:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async activate(req, res) {
    try {
      const { id } = req.params
      const event = await prisma.event.findUnique({ where:{ id } })
      if (!event) return res.status(404).json({ error:'Evento não encontrado.' })

      await prisma.$transaction([
        prisma.event.updateMany({ data:{ active:false } }),
        prisma.event.update({ where:{ id }, data:{ active:true } }),
      ])

      await audit(prisma, {
        action: 'event_activated',
        description: `Evento "${event.name}" ativado por ${req.user.name}. Todos os outros eventos foram desativados.`,
        userId: req.user?.id, targetId: id, targetType: 'event',
        metadata: { eventName:event.name },
      })

      return res.json({ message:`Evento "${event.name}" ativado com sucesso.` })
    } catch (e) { console.error('[EVENTS] activate:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  // ── ESTOQUE ──────────────────────────────────────────────

  async getStock(req, res) {
    try {
      const { id } = req.params
      const event = await prisma.event.findUnique({ where:{ id } })
      if (!event) return res.status(404).json({ error:'Evento não encontrado.' })

      const stocks = await prisma.eventStock.findMany({
        where: { eventId:id },
        include: { product:{ select:{ id:true, name:true, category:true, price:true, imageUrl:true } } },
        orderBy: { product:{ category:'asc' } },
      })

      const stockWithStats = stocks.map(s => ({
        ...s,
        sold: s.initialQuantity - s.currentQuantity,
        percentageRemaining: Math.round((s.currentQuantity / s.initialQuantity) * 100),
        alert: s.currentQuantity <= 2,
      }))

      return res.json({ event:{ id:event.id, name:event.name, active:event.active }, stocks:stockWithStats })
    } catch (e) { console.error('[EVENTS] getStock:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async setStock(req, res) {
    try {
      const { id: eventId } = req.params
      const { productId, quantity, items } = req.body
      const event = await prisma.event.findUnique({ where:{ id:eventId } })
      if (!event) return res.status(404).json({ error:'Evento não encontrado.' })

      const stockItems = items || [{ productId, quantity }]
      if (!stockItems.length || stockItems.some(i => !i.productId || i.quantity === undefined))
        return res.status(400).json({ error:'Informe productId e quantity para cada item.' })

      const results = []
      for (const item of stockItems) {
        if (isNaN(item.quantity) || Number(item.quantity) < 0)
          return res.status(400).json({ error:'Quantidade deve ser >= 0.' })

        const product = await prisma.product.findUnique({ where:{ id:item.productId } })
        if (!product) return res.status(404).json({ error:`Produto ${item.productId} não encontrado.` })

        const stock = await prisma.eventStock.upsert({
          where: { eventId_productId:{ eventId, productId:item.productId } },
          update: { initialQuantity:Number(item.quantity), currentQuantity:Number(item.quantity) },
          create: { eventId, productId:item.productId, initialQuantity:Number(item.quantity), currentQuantity:Number(item.quantity) },
          include: { product:{ select:{ name:true, category:true } } },
        })
        results.push(stock)
      }
      return res.status(201).json(results)
    } catch (e) { console.error('[EVENTS] setStock:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async adjustStock(req, res) {
    try {
      const { id: eventId } = req.params
      const { productId, newQuantity, reason } = req.body

      if (!productId || newQuantity === undefined)
        return res.status(400).json({ error:'productId e newQuantity são obrigatórios.' })
      if (isNaN(newQuantity) || Number(newQuantity) < 0)
        return res.status(400).json({ error:'Quantidade deve ser >= 0.' })

      const stock = await prisma.eventStock.findUnique({
        where: { eventId_productId:{ eventId, productId } },
        include: { product:{ select:{ name:true } } },
      })
      if (!stock) return res.status(404).json({ error:'Produto não encontrado no estoque desse evento.' })

      const updated = await prisma.eventStock.update({
        where: { eventId_productId:{ eventId, productId } },
        data: { currentQuantity:Number(newQuantity) },
        include: { product:{ select:{ name:true, category:true } } },
      })

      // ── Auditoria ──────────────────────────────────────
      await audit(prisma, {
        action: 'stock_adjust',
        description: `Estoque de "${stock.product.name}" ajustado de ${stock.currentQuantity} para ${newQuantity} unidades por ${req.user.name}`,
        userId: req.user?.id,
        targetId: stock.id,
        targetType: 'stock',
        reason: reason || null,
        metadata: { productName:stock.product.name, from:stock.currentQuantity, to:Number(newQuantity), eventId },
      })

      return res.json({
        ...updated,
        adjustment: { from:stock.currentQuantity, to:Number(newQuantity), reason:reason||'Ajuste manual', adjustedBy:req.user.name },
      })
    } catch (e) { console.error('[EVENTS] adjustStock:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  // ── RELATÓRIO DO EVENTO ───────────────────────────────────
  // GET /events/:id/report
  // Retorna todos os dados do evento para exportação XLSX no portal

  async getReport(req, res) {
    try {
      const { id } = req.params

      const event = await prisma.event.findUnique({ where:{ id } })
      if (!event) return res.status(404).json({ error:'Evento não encontrado.' })

      // 1. Todas as vendas (exceto canceladas) com itens
      const sales = await prisma.sale.findMany({
        where: { eventId:id },
        include: {
          seller:{ select:{ id:true, name:true } },
          items:{ include:{ product:{ select:{ name:true, category:true } } } },
        },
        orderBy: { createdAt:'asc' },
      })

      // 2. Estoque completo do evento
      const stocks = await prisma.eventStock.findMany({
        where: { eventId:id },
        include: { product:{ select:{ name:true, category:true, price:true } } },
        orderBy: { product:{ category:'asc' } },
      })

      // 3. Resumo por vendedor
      const sellerMap = {}
      for (const sale of sales) {
        if (sale.status === 'cancelled') continue
        const sid = sale.seller.id
        if (!sellerMap[sid]) sellerMap[sid] = { sellerId:sid, sellerName:sale.seller.name, totalSales:0, totalRevenue:0 }
        sellerMap[sid].totalSales += 1
        sellerMap[sid].totalRevenue += Number(sale.total || 0)
      }
      const bySeller = Object.values(sellerMap).sort((a,b) => b.totalRevenue - a.totalRevenue)

      // 4. Totais gerais
      const validSales = sales.filter(s => s.status !== 'cancelled')
      const totalRevenue = validSales.reduce((sum, s) => sum + Number(s.total || 0), 0)
      const averageTicket = validSales.length > 0 ? totalRevenue / validSales.length : 0

      return res.json({
        event,
        totalSales: validSales.length,
        totalRevenue,
        averageTicket,
        sales,
        stocks,
        bySeller,
      })
    } catch (e) {
      console.error('[EVENTS] getReport:', e)
      return res.status(500).json({ error:'Erro interno do servidor.' })
    }
  },
}

module.exports = eventsController
