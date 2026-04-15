/**
 * src/controllers/dashboard.controller.js
 *
 * Fornece os dados analíticos para o painel do admin.
 * Todas as rotas são exclusivas para administradores.
 *
 * GET /dashboard/summary        → resumo geral do evento ativo
 * GET /dashboard/by-seller      → ranking de vendas por vendedor
 * GET /dashboard/stock-alert    → produtos com estoque baixo
 * GET /dashboard/by-category    → vendas por categoria de produto
 */

const prisma = require('../config/prisma');

const dashboardController = {

  /**
   * Resumo geral do evento ativo
   * Retorna: total vendido, nº de vendas, ticket médio, top produto
   */
  async summary(req, res) {
    try {
      // Pega o evento ativo
      const activeEvent = await prisma.event.findFirst({
        where: { active: true },
      });

      if (!activeEvent) {
        return res.json({
          message: 'Nenhum evento ativo no momento.',
          event: null,
          totalRevenue: 0,
          totalSales: 0,
          averageTicket: 0,
          openSales: 0,
          completedSales: 0,
        });
      }

      // Busca todas as vendas do evento (exceto canceladas)
      const sales = await prisma.sale.findMany({
        where: {
          eventId: activeEvent.id,
          status: { not: 'cancelled' },
        },
        select: { status: true, total: true },
      });

      const totalSales = sales.length;
      const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
      const openSales = sales.filter((s) => s.status === 'open').length;
      const completedSales = sales.filter((s) => s.status === 'completed').length;
      const averageTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

      // Produto mais vendido no evento
      const topProducts = await prisma.saleItem.groupBy({
        by: ['productId'],
        where: {
          sale: {
            eventId: activeEvent.id,
            status: { not: 'cancelled' },
          },
        },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      });

      // Busca nomes dos produtos top
      const topProductsWithNames = await Promise.all(
        topProducts.map(async (tp) => {
          const product = await prisma.product.findUnique({
            where: { id: tp.productId },
            select: { name: true, category: true },
          });
          return {
            productId: tp.productId,
            name: product?.name,
            category: product?.category,
            quantitySold: tp._sum.quantity,
            revenue: Number(tp._sum.subtotal || 0),
          };
        })
      );

      return res.json({
        event: {
          id: activeEvent.id,
          name: activeEvent.name,
          location: activeEvent.location,
          eventDate: activeEvent.eventDate,
        },
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalSales,
        openSales,
        completedSales,
        averageTicket: Number(averageTicket.toFixed(2)),
        topProducts: topProductsWithNames,
      });

    } catch (error) {
      console.error('[DASHBOARD] Erro no summary:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Ranking de vendas por vendedor no evento ativo
   * Útil para ver quem está vendendo mais
   */
  async bySeller(req, res) {
    try {
      const { eventId } = req.query;

      // Usa o evento informado ou o ativo
      let targetEventId = eventId;
      if (!targetEventId) {
        const activeEvent = await prisma.event.findFirst({ where: { active: true } });
        if (!activeEvent) {
          return res.json([]);
        }
        targetEventId = activeEvent.id;
      }

      // Agrupa vendas por vendedor
      const salesBySeller = await prisma.sale.groupBy({
        by: ['sellerId'],
        where: {
          eventId: targetEventId,
          status: { not: 'cancelled' },
        },
        _count: { id: true },
        _sum: { total: true },
        orderBy: { _sum: { total: 'desc' } },
      });

      // Enriquece com nome do vendedor e últimas vendas
      const result = await Promise.all(
        salesBySeller.map(async (s) => {
          const seller = await prisma.user.findUnique({
            where: { id: s.sellerId },
            select: { name: true, email: true },
          });

          return {
            sellerId: s.sellerId,
            sellerName: seller?.name,
            sellerEmail: seller?.email,
            totalSales: s._count.id,
            totalRevenue: Number(s._sum.total || 0),
            averageTicket: s._count.id > 0
              ? Number((Number(s._sum.total || 0) / s._count.id).toFixed(2))
              : 0,
          };
        })
      );

      return res.json(result);

    } catch (error) {
      console.error('[DASHBOARD] Erro no bySeller:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Produtos com estoque baixo no evento ativo
   * "Baixo" = 2 ou menos unidades restantes
   */
  async stockAlert(req, res) {
    try {
      const { threshold = 2, eventId } = req.query;

      let targetEventId = eventId;
      if (!targetEventId) {
        const activeEvent = await prisma.event.findFirst({ where: { active: true } });
        if (!activeEvent) return res.json({ event: null, alerts: [] });
        targetEventId = activeEvent.id;
      }

      const lowStock = await prisma.eventStock.findMany({
        where: {
          eventId: targetEventId,
          currentQuantity: { lte: Number(threshold) },
        },
        include: {
          product: { select: { id: true, name: true, category: true, price: true } },
          event: { select: { id: true, name: true } },
        },
        orderBy: { currentQuantity: 'asc' },
      });

      const alerts = lowStock.map((s) => ({
        product: s.product,
        event: s.event,
        initialQuantity: s.initialQuantity,
        currentQuantity: s.currentQuantity,
        sold: s.initialQuantity - s.currentQuantity,
        isEmpty: s.currentQuantity === 0,
      }));

      return res.json({
        threshold: Number(threshold),
        count: alerts.length,
        alerts,
      });

    } catch (error) {
      console.error('[DASHBOARD] Erro no stockAlert:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Vendas agrupadas por categoria de produto
   * Ex: capacetes = R$1.200, jaquetas = R$3.400
   */
  async byCategory(req, res) {
    try {
      const { eventId } = req.query;

      let targetEventId = eventId;
      if (!targetEventId) {
        const activeEvent = await prisma.event.findFirst({ where: { active: true } });
        if (!activeEvent) return res.json([]);
        targetEventId = activeEvent.id;
      }

      // Busca todos os itens vendidos nesse evento
      const items = await prisma.saleItem.findMany({
        where: {
          sale: {
            eventId: targetEventId,
            status: { not: 'cancelled' },
          },
        },
        include: {
          product: { select: { category: true } },
        },
      });

      // Agrupa manualmente por categoria
      const grouped = {};
      for (const item of items) {
        const cat = item.product.category;
        if (!grouped[cat]) {
          grouped[cat] = { category: cat, quantitySold: 0, revenue: 0 };
        }
        grouped[cat].quantitySold += item.quantity;
        grouped[cat].revenue += Number(item.subtotal);
      }

      const result = Object.values(grouped)
        .map((g) => ({ ...g, revenue: Number(g.revenue.toFixed(2)) }))
        .sort((a, b) => b.revenue - a.revenue);

      return res.json(result);

    } catch (error) {
      console.error('[DASHBOARD] Erro no byCategory:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },
};

module.exports = dashboardController;
