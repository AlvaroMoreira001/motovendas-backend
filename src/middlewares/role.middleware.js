/**
 * src/middlewares/role.middleware.js
 *
 * Verifica se o usuário autenticado possui o papel (role) necessário.
 * Deve ser usado DEPOIS do authMiddleware.
 *
 * Exemplo de uso na rota:
 *   router.post('/products', auth, requireRole('admin'), productController.create)
 *
 * Exemplo com múltiplos roles:
 *   router.get('/sales', auth, requireRole('admin', 'seller'), salesController.list)
 */

function requireRole(...roles) {
  return (req, res, next) => {
    // req.user foi injetado pelo authMiddleware
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Acesso negado. Requer perfil: ${roles.join(' ou ')}.`,
      });
    }

    next();
  };
}

module.exports = requireRole;
