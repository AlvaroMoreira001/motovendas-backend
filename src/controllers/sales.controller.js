/**
 * src/controllers/sales.controller.js
 *
 * O coração do sistema. Gerencia todo o ciclo de vida das vendas.
 *
 * FLUXO COMPLETO:
 *   1. Vendedor no APP cria a venda (POST /sales) → status: "open"
 *   2. Estoque é debitado automaticamente na criação
 *   3. Admin no PORTAL finaliza (PUT /sales/:id/complete) → status: "completed"
 *   4. Admin pode cancelar (PUT /sales/:id/cancel) → estoque devolvido
 *
 * ROTAS:
 *   POST   /sales                  → cria venda (seller ou admin)
 *   GET    /sales                  → lista todas as vendas (admin)
 *   GET    /sales/my               → minhas vendas (seller)
 *   GET    /sales/:id              → detalhes com itens
 *   PUT    /sales/:id/complete     → finaliza venda (admin)
 *   PUT    /sales/:id/cancel       → cancela e devolve estoque (admin)
 */

const prisma = require('../config/prisma');

const salesController = {

  /**
   * CRIAR VENDA - Endpoint mais importante do sistema
   *
   * Usa transação do banco para garantir que:
   *   - O estoque seja suficiente antes de criar
   *   - A venda e o débito do estoque ocorram juntos
   *   - Se qualquer passo falhar, TUDO é revertido (rollback)
   *
   * Body: {
   *   eventId: "uuid",
   *   paymentMethod: "dinheiro" | "pix" | "cartao",
   *   notes: "opcional",
   *   items: [
   *     { productId: "uuid", quantity: 2 },
   *     { productId: "uuid", quantity: 1 },
   *   ]
   * }
   */
  async create(req, res) {
    try {
      const { eventId, paymentMethod, notes, items } = req.body;
      const sellerId = req.user.id;

      // --- VALIDAÇÕES INICIAIS ---

      if (!eventId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          error: 'eventId e ao menos um item são obrigatórios.',
        });
      }

      const validPayments = ['dinheiro', 'pix', 'cartao', 'cortesia'];
      if (paymentMethod && !validPayments.includes(paymentMethod)) {
        return res.status(400).json({
          error: `Forma de pagamento inválida. Use: ${validPayments.join(', ')}.`,
        });
      }

      // Verifica se o evento existe e está ativo
      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) {
        return res.status(404).json({ error: 'Evento não encontrado.' });
      }
      if (!event.active) {
        return res.status(400).json({ error: 'Este evento não está ativo.' });
      }

      // --- TRANSAÇÃO ATÔMICA ---
      // Tudo dentro deste bloco ocorre de forma atômica.
      // Se qualquer linha lançar erro, o banco reverte tudo automaticamente.

      const sale = await prisma.$transaction(async (tx) => {

        let total = 0;
        const enrichedItems = [];

        // PASSO 1: Verifica estoque e busca preços para cada item
        for (const item of items) {
          if (!item.productId || !item.quantity || item.quantity < 1) {
            throw new Error(`Item inválido: informe productId e quantity >= 1.`);
          }

          // Busca estoque do produto neste evento
          const stock = await tx.eventStock.findUnique({
            where: {
              eventId_productId: { eventId, productId: item.productId },
            },
            include: {
              product: { select: { id: true, name: true, price: true, active: true } },
            },
          });

          // Produto não cadastrado nesse evento
          if (!stock) {
            throw new Error(`Produto "${item.productId}" não está no estoque deste evento.`);
          }

          // Produto desativado
          if (!stock.product.active) {
            throw new Error(`Produto "${stock.product.name}" está desativado.`);
          }

          // Estoque insuficiente
          if (stock.currentQuantity < item.quantity) {
            throw new Error(
              `Estoque insuficiente para "${stock.product.name}". ` +
              `Disponível: ${stock.currentQuantity}, solicitado: ${item.quantity}.`
            );
          }

          const unitPrice = Number(stock.product.price);
          const subtotal = unitPrice * item.quantity;
          total += subtotal;

          enrichedItems.push({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice,
            subtotal,
            stockId: stock.id,
            productName: stock.product.name,
          });
        }

        // PASSO 2: Cria o cabeçalho da venda
        const newSale = await tx.sale.create({
          data: {
            eventId,
            sellerId,
            status: 'open',
            total,
            paymentMethod: paymentMethod || null,
            notes: notes || null,
          },
        });

        // PASSO 3: Cria os itens e debita o estoque de cada produto
        for (const item of enrichedItems) {
          // Cria o item da venda
          await tx.saleItem.create({
            data: {
              saleId: newSale.id,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
            },
          });

          // Debita o estoque (operação atômica com decrement)
          await tx.eventStock.update({
            where: {
              eventId_productId: { eventId, productId: item.productId },
            },
            data: {
              currentQuantity: { decrement: item.quantity },
            },
          });
        }

        return newSale;
      });

      // Busca a venda criada com todos os detalhes para retornar
      const saleWithDetails = await prisma.sale.findUnique({
        where: { id: sale.id },
        include: {
          seller: { select: { id: true, name: true } },
          event: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, category: true } },
            },
          },
        },
      });

      return res.status(201).json(saleWithDetails);

    } catch (error) {
      // Erros de regra de negócio (estoque insuficiente, etc.)
      if (error.message && !error.code) {
        return res.status(400).json({ error: error.message });
      }
      console.error('[SALES] Erro ao criar venda:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Lista TODAS as vendas (admin)
   * Suporta filtros: ?eventId=&sellerId=&status=&date=
   */
  async list(req, res) {
    try {
      const { eventId, sellerId, status, date } = req.query;

      const where = {};
      if (eventId) where.eventId = eventId;
      if (sellerId) where.sellerId = sellerId;
      if (status) where.status = status;
      if (date) {
        // Filtra por dia: pega todas as vendas do dia informado
        const start = new Date(date);
        const end = new Date(date);
        end.setDate(end.getDate() + 1);
        where.createdAt = { gte: start, lt: end };
      }

      const sales = await prisma.sale.findMany({
        where,
        include: {
          seller: { select: { id: true, name: true } },
          event: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(sales);

    } catch (error) {
      console.error('[SALES] Erro ao listar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Lista as vendas do PRÓPRIO vendedor logado
   * GET /sales/my
   */
  async listMy(req, res) {
    try {
      const { eventId, status } = req.query;

      const where = { sellerId: req.user.id };
      if (eventId) where.eventId = eventId;
      if (status) where.status = status;

      const sales = await prisma.sale.findMany({
        where,
        include: {
          event: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, category: true, imageUrl: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(sales);

    } catch (error) {
      console.error('[SALES] Erro ao listar minhas vendas:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Detalhes de uma venda com todos os itens
   */
  async getById(req, res) {
    try {
      const { id } = req.params;

      const sale = await prisma.sale.findUnique({
        where: { id },
        include: {
          seller: { select: { id: true, name: true, email: true } },
          event: { select: { id: true, name: true, location: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, category: true, imageUrl: true } },
            },
          },
        },
      });

      if (!sale) {
        return res.status(404).json({ error: 'Venda não encontrada.' });
      }

      // Vendedor só pode ver suas próprias vendas
      if (req.user.role === 'seller' && sale.sellerId !== req.user.id) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      return res.json(sale);

    } catch (error) {
      console.error('[SALES] Erro ao buscar venda:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * FINALIZAR VENDA (admin)
   * Muda o status de "open" para "completed"
   * O estoque já foi debitado na criação, então só marca como finalizada
   *
   * PUT /sales/:id/complete
   */
  async complete(req, res) {
    try {
      const { id } = req.params;

      const sale = await prisma.sale.findUnique({ where: { id } });
      if (!sale) {
        return res.status(404).json({ error: 'Venda não encontrada.' });
      }

      if (sale.status !== 'open') {
        return res.status(400).json({
          error: `Não é possível finalizar uma venda com status "${sale.status}".`,
        });
      }

      const updated = await prisma.sale.update({
        where: { id },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
        include: {
          seller: { select: { name: true } },
          event: { select: { name: true } },
        },
      });

      return res.json(updated);

    } catch (error) {
      console.error('[SALES] Erro ao finalizar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * CANCELAR VENDA (admin)
   * Muda para "cancelled" e DEVOLVE o estoque de todos os itens
   *
   * PUT /sales/:id/cancel
   */
  async cancel(req, res) {
    try {
      const { id } = req.params;

      const sale = await prisma.sale.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!sale) {
        return res.status(404).json({ error: 'Venda não encontrada.' });
      }

      if (sale.status === 'cancelled') {
        return res.status(400).json({ error: 'Venda já está cancelada.' });
      }

      if (sale.status === 'completed') {
        return res.status(400).json({
          error: 'Não é possível cancelar uma venda já finalizada. Contate o suporte.',
        });
      }

      // Transação: cancela a venda e devolve o estoque de cada item
      await prisma.$transaction(async (tx) => {

        // Marca como cancelada
        await tx.sale.update({
          where: { id },
          data: { status: 'cancelled' },
        });

        // Devolve o estoque de cada item
        for (const item of sale.items) {
          await tx.eventStock.update({
            where: {
              eventId_productId: {
                eventId: sale.eventId,
                productId: item.productId,
              },
            },
            data: {
              currentQuantity: { increment: item.quantity },
            },
          });
        }
      });

      return res.json({ message: 'Venda cancelada e estoque devolvido com sucesso.' });

    } catch (error) {
      console.error('[SALES] Erro ao cancelar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },
};

module.exports = salesController;
