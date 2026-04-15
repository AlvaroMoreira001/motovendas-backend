/**
 * src/controllers/events.controller.js
 *
 * Gerencia eventos e o estoque de produtos por evento.
 *
 * EVENTOS:
 *   GET    /events               → lista eventos
 *   POST   /events               → cria evento (admin)
 *   GET    /events/:id           → detalhes com estoque
 *   PUT    /events/:id           → atualiza (admin)
 *   PATCH  /events/:id/activate  → define como evento ativo (admin)
 *
 * ESTOQUE DO EVENTO:
 *   POST   /events/:id/stock          → adiciona/atualiza produto no estoque
 *   GET    /events/:id/stock          → lista estoque do evento
 *   PATCH  /events/:id/stock/adjust   → ajuste manual de quantidade (admin)
 */

const prisma = require('../config/prisma');

const eventsController = {

  // =============================================
  // EVENTOS
  // =============================================

  /**
   * Lista todos os eventos
   * Suporta filtro: GET /events?active=true
   */
  async list(req, res) {
    try {
      const { active } = req.query;

      const where = {};
      if (active !== undefined) {
        where.active = active === 'true';
      }

      const events = await prisma.event.findMany({
        where,
        include: {
          // Quantos produtos no estoque e quantas vendas
          _count: {
            select: { stocks: true, sales: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(events);

    } catch (error) {
      console.error('[EVENTS] Erro ao listar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Cria um novo evento
   * Body: { name, location, eventDate }
   */
  async create(req, res) {
    try {
      const { name, location, eventDate } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'O nome do evento é obrigatório.' });
      }

      const event = await prisma.event.create({
        data: {
          name: name.trim(),
          location: location?.trim() || null,
          eventDate: eventDate ? new Date(eventDate) : null,
          active: false, // Começa inativo até o admin ativar
        },
      });

      return res.status(201).json(event);

    } catch (error) {
      console.error('[EVENTS] Erro ao criar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Detalhes de um evento com seu estoque completo
   */
  async getById(req, res) {
    try {
      const { id } = req.params;

      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          stocks: {
            include: {
              product: {
                select: { id: true, name: true, category: true, price: true, imageUrl: true },
              },
            },
            orderBy: { product: { category: 'asc' } },
          },
          _count: { select: { sales: true } },
        },
      });

      if (!event) {
        return res.status(404).json({ error: 'Evento não encontrado.' });
      }

      return res.json(event);

    } catch (error) {
      console.error('[EVENTS] Erro ao buscar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Atualiza dados do evento
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, location, eventDate } = req.body;

      const existing = await prisma.event.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'Evento não encontrado.' });
      }

      const updateData = {};
      if (name) updateData.name = name.trim();
      if (location !== undefined) updateData.location = location?.trim() || null;
      if (eventDate !== undefined) updateData.eventDate = eventDate ? new Date(eventDate) : null;

      const event = await prisma.event.update({ where: { id }, data: updateData });

      return res.json(event);

    } catch (error) {
      console.error('[EVENTS] Erro ao atualizar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Ativa um evento (e desativa todos os outros)
   * Só um evento pode estar ativo por vez — é o evento atual do stand
   *
   * PATCH /events/:id/activate
   */
  async activate(req, res) {
    try {
      const { id } = req.params;

      const event = await prisma.event.findUnique({ where: { id } });
      if (!event) {
        return res.status(404).json({ error: 'Evento não encontrado.' });
      }

      // Transação: desativa todos e ativa o escolhido
      await prisma.$transaction([
        prisma.event.updateMany({ data: { active: false } }),
        prisma.event.update({ where: { id }, data: { active: true } }),
      ]);

      return res.json({ message: `Evento "${event.name}" ativado com sucesso.` });

    } catch (error) {
      console.error('[EVENTS] Erro ao ativar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  // =============================================
  // ESTOQUE POR EVENTO
  // =============================================

  /**
   * Lista o estoque do evento com situação de cada produto
   *
   * GET /events/:id/stock
   */
  async getStock(req, res) {
    try {
      const { id } = req.params;

      const event = await prisma.event.findUnique({ where: { id } });
      if (!event) {
        return res.status(404).json({ error: 'Evento não encontrado.' });
      }

      const stocks = await prisma.eventStock.findMany({
        where: { eventId: id },
        include: {
          product: {
            select: { id: true, name: true, category: true, price: true, imageUrl: true },
          },
        },
        orderBy: { product: { category: 'asc' } },
      });

      // Calcula quantos foram vendidos e percentual restante
      const stockWithStats = stocks.map((s) => ({
        ...s,
        sold: s.initialQuantity - s.currentQuantity,
        percentageRemaining: Math.round((s.currentQuantity / s.initialQuantity) * 100),
        alert: s.currentQuantity <= 2, // alerta de estoque baixo
      }));

      return res.json({
        event: { id: event.id, name: event.name, active: event.active },
        stocks: stockWithStats,
      });

    } catch (error) {
      console.error('[EVENTS] Erro ao buscar estoque:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Adiciona ou atualiza produto no estoque do evento
   * Se o produto já existe no estoque, SUBSTITUI a quantidade inicial
   *
   * POST /events/:id/stock
   * Body: { productId, quantity }
   *   ou: { items: [{ productId, quantity }, ...] }  → adiciona vários de uma vez
   */
  async setStock(req, res) {
    try {
      const { id: eventId } = req.params;
      const { productId, quantity, items } = req.body;

      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) {
        return res.status(404).json({ error: 'Evento não encontrado.' });
      }

      // Normaliza: aceita item único ou lista de itens
      const stockItems = items || [{ productId, quantity }];

      if (!stockItems.length || stockItems.some((i) => !i.productId || i.quantity === undefined)) {
        return res.status(400).json({ error: 'Informe productId e quantity para cada item.' });
      }

      const results = [];

      for (const item of stockItems) {
        if (isNaN(item.quantity) || Number(item.quantity) < 0) {
          return res.status(400).json({ error: 'Quantidade deve ser um número >= 0.' });
        }

        // Verifica se o produto existe
        const product = await prisma.product.findUnique({ where: { id: item.productId } });
        if (!product) {
          return res.status(404).json({ error: `Produto ${item.productId} não encontrado.` });
        }

        // Upsert: cria ou substitui o estoque do produto nesse evento
        const stock = await prisma.eventStock.upsert({
          where: {
            eventId_productId: { eventId, productId: item.productId },
          },
          update: {
            initialQuantity: Number(item.quantity),
            currentQuantity: Number(item.quantity),
          },
          create: {
            eventId,
            productId: item.productId,
            initialQuantity: Number(item.quantity),
            currentQuantity: Number(item.quantity),
          },
          include: {
            product: { select: { name: true, category: true } },
          },
        });

        results.push(stock);
      }

      return res.status(201).json(results);

    } catch (error) {
      console.error('[EVENTS] Erro ao definir estoque:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Ajuste manual de estoque (para correções)
   * Ex: contagem física revelou divergência
   *
   * PATCH /events/:id/stock/adjust
   * Body: { productId, newQuantity, reason }
   */
  async adjustStock(req, res) {
    try {
      const { id: eventId } = req.params;
      const { productId, newQuantity, reason } = req.body;

      if (!productId || newQuantity === undefined) {
        return res.status(400).json({ error: 'productId e newQuantity são obrigatórios.' });
      }

      if (isNaN(newQuantity) || Number(newQuantity) < 0) {
        return res.status(400).json({ error: 'Quantidade deve ser >= 0.' });
      }

      const stock = await prisma.eventStock.findUnique({
        where: { eventId_productId: { eventId, productId } },
      });

      if (!stock) {
        return res.status(404).json({ error: 'Produto não encontrado no estoque desse evento.' });
      }

      const updated = await prisma.eventStock.update({
        where: { eventId_productId: { eventId, productId } },
        data: { currentQuantity: Number(newQuantity) },
        include: {
          product: { select: { name: true, category: true } },
        },
      });

      return res.json({
        ...updated,
        adjustment: {
          from: stock.currentQuantity,
          to: Number(newQuantity),
          reason: reason || 'Ajuste manual',
          adjustedBy: req.user.name,
        },
      });

    } catch (error) {
      console.error('[EVENTS] Erro ao ajustar estoque:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },
};

module.exports = eventsController;
