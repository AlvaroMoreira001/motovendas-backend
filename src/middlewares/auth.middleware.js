/**
 * src/middlewares/auth.middleware.js
 *
 * Verifica se a requisição possui um token JWT válido.
 * Todas as rotas protegidas usam este middleware.
 *
 * Fluxo:
 *  1. Lê o header "Authorization: Bearer <token>"
 *  2. Valida a assinatura do token com o JWT_SECRET
 *  3. Injeta req.user com os dados do usuário logado
 *  4. Chama next() para continuar para o controller
 */

const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  // 1. Pega o header de autorização
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  // 2. O formato esperado é "Bearer eyJhbGci..."
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Formato de token inválido. Use: Bearer <token>' });
  }

  const token = parts[1];

  // 3. Verifica e decodifica o token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Injeta no request para os controllers usarem
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado. Faça login novamente.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

module.exports = authMiddleware;
