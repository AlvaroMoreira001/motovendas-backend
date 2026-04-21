/**
 * src/utils/audit.js
 *
 * Utilitário para registrar logs de auditoria.
 * Chamado em todos os pontos que modificam dados importantes.
 *
 * Uso:
 *   await audit(prisma, {
 *     action: 'stock_adjust',
 *     description: 'Estoque de "Capacete X-11" ajustado de 10 para 8',
 *     userId: req.user.id,
 *     targetId: stockId,
 *     targetType: 'stock',
 *     reason: 'Contagem física revelou diferença',
 *     metadata: { from: 10, to: 8 }
 *   })
 *
 * Ações registradas:
 *   stock_adjust    → Ajuste manual de estoque
 *   user_created    → Novo usuário criado
 *   user_updated    → Dados do usuário alterados
 *   user_toggled    → Usuário ativado ou desativado
 *   sale_completed  → Venda finalizada pelo admin
 *   sale_cancelled  → Venda cancelada pelo admin
 *   event_created   → Novo evento criado
 *   event_activated → Evento definido como ativo
 *   product_created → Novo produto cadastrado
 *   product_updated → Produto editado
 */

/**
 * Registra um log de auditoria no banco.
 * Nunca lança exceção — se falhar, apenas loga no console.
 * O fluxo principal não deve ser interrompido por falha de log.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} params
 * @param {string}  params.action      - Identificador da ação (snake_case)
 * @param {string}  params.description - Texto legível do que aconteceu
 * @param {string}  [params.userId]    - ID do usuário que executou
 * @param {string}  [params.targetId]  - ID do recurso afetado
 * @param {string}  [params.targetType]- Tipo do recurso ('sale','user','stock','event','product')
 * @param {string}  [params.reason]    - Justificativa (obrigatório em ajustes manuais)
 * @param {object}  [params.metadata]  - Dados extras (ex: { from: 5, to: 3 })
 */
async function audit(prisma, {
  action,
  description,
  userId = null,
  targetId = null,
  targetType = null,
  reason = null,
  metadata = null,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        description,
        userId,
        targetId,
        targetType,
        reason,
        metadata,
      },
    })
  } catch (err) {
    // Nunca interrompe o fluxo principal
    console.error('[AUDIT] Falha ao registrar log:', err.message)
  }
}

module.exports = { audit }
