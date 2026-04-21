/**
 * src/controllers/audit.controller.js
 *
 * Expõe os logs de auditoria para o portal web.
 * Apenas admins podem acessar.
 *
 * GET /audit          → lista todos os logs (mais recentes primeiro)
 * GET /audit?limit=50 → limita a quantidade
 * GET /audit?action=stock_adjust → filtra por tipo de ação
 */

const prisma = require('../config/prisma')

const auditController = {

  /**
   * Lista os logs de auditoria
   * Ordena do mais recente para o mais antigo
   */
  async list(req, res) {
    try {
      const { action, limit = 200 } = req.query

      const where = {}
      if (action) where.action = action

      const logs = await prisma.auditLog.findMany({
        where,
        include: {
          // Nome do usuário que executou a ação
          user: {
            select: { id: true, name: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
      })

      return res.json(logs)

    } catch (error) {
      console.error('[AUDIT] Erro ao listar logs:', error)
      return res.status(500).json({ error: 'Erro interno do servidor.' })
    }
  },
}

module.exports = auditController
