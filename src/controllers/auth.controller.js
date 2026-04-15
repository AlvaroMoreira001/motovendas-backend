/**
 * src/controllers/auth.controller.js
 *
 * Responsável pelo login e geração de token JWT.
 *
 * POST /auth/login
 *   Body: { email, password }
 *   Retorna: { token, user }
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const authController = {

  /**
   * Login do usuário (admin ou seller)
   *
   * 1. Busca o usuário pelo email
   * 2. Verifica se está ativo
   * 3. Compara a senha com o hash salvo no banco
   * 4. Gera e retorna o JWT
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Validação básica dos campos
      if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
      }

      // 1. Busca o usuário no banco
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (!user) {
        // Mensagem genérica para não revelar se o email existe
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      // 2. Verifica se o usuário está ativo
      if (!user.active) {
        return res.status(403).json({ error: 'Usuário desativado. Contate o administrador.' });
      }

      // 3. Compara a senha digitada com o hash do banco
      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      // 4. Gera o token JWT com os dados do usuário
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      // Retorna o token e dados básicos do usuário (sem o hash da senha)
      return res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });

    } catch (error) {
      console.error('[AUTH] Erro no login:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Retorna os dados do usuário logado
   * Útil para o app validar o token ao iniciar
   *
   * GET /auth/me
   */
  async me(req, res) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
        },
      });

      if (!user || !user.active) {
        return res.status(401).json({ error: 'Usuário não encontrado ou desativado.' });
      }

      return res.json(user);

    } catch (error) {
      console.error('[AUTH] Erro no /me:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },
};

module.exports = authController;
