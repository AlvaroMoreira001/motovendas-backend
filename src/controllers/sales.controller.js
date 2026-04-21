/**
 * src/controllers/sales.controller.js
 * Com logs de auditoria em: finalizar e cancelar venda
 */
const prisma = require('../config/prisma')
const { audit } = require('../utils/audit')

const salesController = {

  async create(req, res) {
    try {
      const { eventId, paymentMethod, notes, items } = req.body
      const sellerId = req.user.id

      if (!eventId || !items || !Array.isArray(items) || items.length === 0)
        return res.status(400).json({ error:'eventId e ao menos um item são obrigatórios.' })

      const validPayments = ['dinheiro','pix','cartao','cortesia']
      if (paymentMethod && !validPayments.includes(paymentMethod))
        return res.status(400).json({ error:`Forma de pagamento inválida. Use: ${validPayments.join(', ')}.` })

      const event = await prisma.event.findUnique({ where:{ id:eventId } })
      if (!event) return res.status(404).json({ error:'Evento não encontrado.' })
      if (!event.active) return res.status(400).json({ error:'Este evento não está ativo.' })

      const sale = await prisma.$transaction(async (tx) => {
        let total = 0
        const enrichedItems = []

        for (const item of items) {
          if (!item.productId || !item.quantity || item.quantity < 1)
            throw new Error('Item inválido: informe productId e quantity >= 1.')

          const stock = await tx.eventStock.findUnique({
            where: { eventId_productId:{ eventId, productId:item.productId } },
            include: { product:{ select:{ id:true, name:true, price:true, active:true } } },
          })

          if (!stock) throw new Error(`Produto "${item.productId}" não está no estoque deste evento.`)
          if (!stock.product.active) throw new Error(`Produto "${stock.product.name}" está desativado.`)
          if (stock.currentQuantity < item.quantity)
            throw new Error(`Estoque insuficiente para "${stock.product.name}". Disponível: ${stock.currentQuantity}, solicitado: ${item.quantity}.`)

          const unitPrice = Number(stock.product.price)
          const subtotal = unitPrice * item.quantity
          total += subtotal
          enrichedItems.push({ productId:item.productId, quantity:item.quantity, unitPrice, subtotal, productName:stock.product.name })
        }

        const newSale = await tx.sale.create({ data:{ eventId, sellerId, status:'open', total, paymentMethod:paymentMethod||null, notes:notes||null } })

        for (const item of enrichedItems) {
          await tx.saleItem.create({ data:{ saleId:newSale.id, productId:item.productId, quantity:item.quantity, unitPrice:item.unitPrice, subtotal:item.subtotal } })
          await tx.eventStock.update({ where:{ eventId_productId:{ eventId, productId:item.productId } }, data:{ currentQuantity:{ decrement:item.quantity } } })
        }

        return newSale
      })

      const saleWithDetails = await prisma.sale.findUnique({
        where: { id:sale.id },
        include: {
          seller:{ select:{ id:true, name:true } },
          event:{ select:{ id:true, name:true } },
          items:{ include:{ product:{ select:{ id:true, name:true, category:true } } } },
        },
      })

      return res.status(201).json(saleWithDetails)
    } catch (error) {
      if (error.message && !error.code) return res.status(400).json({ error:error.message })
      console.error('[SALES] create:', error)
      return res.status(500).json({ error:'Erro interno do servidor.' })
    }
  },

  async list(req, res) {
    try {
      const { eventId, sellerId, status, date } = req.query
      const where = {}
      if (eventId) where.eventId = eventId
      if (sellerId) where.sellerId = sellerId
      if (status) where.status = status
      if (date) {
        const start = new Date(date)
        const end = new Date(date)
        end.setDate(end.getDate() + 1)
        where.createdAt = { gte:start, lt:end }
      }
      const sales = await prisma.sale.findMany({
        where,
        include: {
          seller:{ select:{ id:true, name:true } },
          event:{ select:{ id:true, name:true } },
          _count:{ select:{ items:true } },
        },
        orderBy: { createdAt:'desc' },
      })
      return res.json(sales)
    } catch (e) { console.error('[SALES] list:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async listMy(req, res) {
    try {
      const { eventId, status } = req.query
      const where = { sellerId:req.user.id }
      if (eventId) where.eventId = eventId
      if (status) where.status = status
      const sales = await prisma.sale.findMany({
        where,
        include: {
          event:{ select:{ id:true, name:true } },
          items:{ include:{ product:{ select:{ id:true, name:true, category:true, imageUrl:true } } } },
        },
        orderBy: { createdAt:'desc' },
      })
      return res.json(sales)
    } catch (e) { console.error('[SALES] listMy:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async getById(req, res) {
    try {
      const { id } = req.params
      const sale = await prisma.sale.findUnique({
        where: { id },
        include: {
          seller:{ select:{ id:true, name:true, email:true } },
          event:{ select:{ id:true, name:true, location:true } },
          items:{ include:{ product:{ select:{ id:true, name:true, category:true, imageUrl:true } } } },
        },
      })
      if (!sale) return res.status(404).json({ error:'Venda não encontrada.' })
      if (req.user.role === 'seller' && sale.sellerId !== req.user.id)
        return res.status(403).json({ error:'Acesso negado.' })
      return res.json(sale)
    } catch (e) { console.error('[SALES] getById:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async complete(req, res) {
    try {
      const { id } = req.params
      const sale = await prisma.sale.findUnique({
        where: { id },
        include: { seller:{ select:{ name:true } }, event:{ select:{ name:true } }, _count:{ select:{ items:true } } },
      })
      if (!sale) return res.status(404).json({ error:'Venda não encontrada.' })
      if (sale.status !== 'open') return res.status(400).json({ error:`Não é possível finalizar uma venda com status "${sale.status}".` })

      const updated = await prisma.sale.update({
        where: { id },
        data: { status:'completed', completedAt:new Date() },
        include: { seller:{ select:{ name:true } }, event:{ select:{ name:true } } },
      })

      // ── Auditoria ──────────────────────────────────────
      await audit(prisma, {
        action: 'sale_completed',
        description: `Venda #${id.slice(-6).toUpperCase()} de ${sale.seller.name} no evento "${sale.event.name}" finalizada por ${req.user.name} — R$ ${Number(sale.total).toFixed(2)}`,
        userId: req.user?.id,
        targetId: id,
        targetType: 'sale',
        metadata: { sellerId:sale.sellerId, sellerName:sale.seller.name, total:sale.total, items:sale._count.items },
      })

      return res.json(updated)
    } catch (e) { console.error('[SALES] complete:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async cancel(req, res) {
    try {
      const { id } = req.params
      const sale = await prisma.sale.findUnique({
        where: { id },
        include: { items:true, seller:{ select:{ name:true } }, event:{ select:{ name:true } } },
      })
      if (!sale) return res.status(404).json({ error:'Venda não encontrada.' })
      if (sale.status === 'cancelled') return res.status(400).json({ error:'Venda já está cancelada.' })
      if (sale.status === 'completed') return res.status(400).json({ error:'Não é possível cancelar uma venda já finalizada.' })

      await prisma.$transaction(async (tx) => {
        await tx.sale.update({ where:{ id }, data:{ status:'cancelled' } })
        for (const item of sale.items) {
          await tx.eventStock.update({
            where: { eventId_productId:{ eventId:sale.eventId, productId:item.productId } },
            data: { currentQuantity:{ increment:item.quantity } },
          })
        }
      })

      // ── Auditoria ──────────────────────────────────────
      await audit(prisma, {
        action: 'sale_cancelled',
        description: `Venda #${id.slice(-6).toUpperCase()} de ${sale.seller.name} no evento "${sale.event.name}" cancelada por ${req.user.name} — estoque devolvido`,
        userId: req.user?.id,
        targetId: id,
        targetType: 'sale',
        metadata: { sellerId:sale.sellerId, sellerName:sale.seller.name, total:sale.total, itemsRestored:sale.items.length },
      })

      return res.json({ message:'Venda cancelada e estoque devolvido com sucesso.' })
    } catch (e) { console.error('[SALES] cancel:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },
}

module.exports = salesController
