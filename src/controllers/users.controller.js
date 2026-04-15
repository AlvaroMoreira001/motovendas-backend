/**
 * src/controllers/users.controller.js
 *
 * CRUD completo de usuários. Apenas admins podem acessar.
 *
 * GET    /users          → lista todos os usuários
 * POST   /users          → cria novo usuário (seller ou admin)
 * GET    /users/:id      → detalhes de um usuário
 * PUT    /users/:id      → atualiza dados
 * PATCH  /users/:id/toggle-active → ativa ou desativa o usuário
 */

const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');

const usersController = {

  /**
   * Lista todos os usuários
   * Suporte a filtro por role: GET /users?role=seller
   */
  async list(req, res) {
    try {
      const { role } = req.query;

      const users = await prisma.user.findMany({
        where: role ? { role } : undefined,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
          // Conta quantas vendas esse usuário tem
          _count: { select: { sales: true } },
        },
        orderBy: { name: 'asc' },
      });

      return res.json(users);

    } catch (error) {
      console.error('[USERS] Erro ao listar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Cria novo usuário
   * Body: { name, email, password, role }
   */
  async create(req, res) {
    try {
      const { name, email, password, role } = req.body;

      // Validações
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
      }

      if (role && !['admin', 'seller'].includes(role)) {
        return res.status(400).json({ error: 'Role inválido. Use "admin" ou "seller".' });
      }

      // Verifica se o email já está em uso
      const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (existing) {
        return res.status(409).json({ error: 'Este email já está cadastrado.' });
      }

      // Gera o hash da senha (custo 10 = bom equilíbrio segurança/performance)
      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          name: name.trim(),
          email: email.toLowerCase().trim(),
          passwordHash,
          role: role || 'seller',
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
        },
      });

      return res.status(201).json(user);

    } catch (error) {
      console.error('[USERS] Erro ao criar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Detalhes de um usuário específico
   */
  async getById(req, res) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
          // Últimas 10 vendas do usuário
          sales: {
            select: {
              id: true,
              status: true,
              total: true,
              paymentMethod: true,
              createdAt: true,
              event: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          _count: { select: { sales: true } },
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      return res.json(user);

    } catch (error) {
      console.error('[USERS] Erro ao buscar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Atualiza dados do usuário (nome, email, senha)
   * Não é possível trocar o role aqui por segurança — use um endpoint dedicado
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, email, password } = req.body;

      // Verifica se existe
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      // Prepara os dados para atualizar (só o que foi enviado)
      const updateData = {};

      if (name) updateData.name = name.trim();
      if (email) {
        const emailInUse = await prisma.user.findFirst({
          where: { email: email.toLowerCase().trim(), NOT: { id } },
        });
        if (emailInUse) {
          return res.status(409).json({ error: 'Este email já está em uso.' });
        }
        updateData.email = email.toLowerCase().trim();
      }
      if (password) {
        if (password.length < 6) {
          return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
        }
        updateData.passwordHash = await bcrypt.hash(password, 10);
      }

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true, name: true, email: true, role: true, active: true,
        },
      });

      return res.json(user);

    } catch (error) {
      console.error('[USERS] Erro ao atualizar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Ativa ou desativa um usuário
   * Usuário desativado não consegue fazer login
   *
   * PATCH /users/:id/toggle-active
   */
  async toggleActive(req, res) {
    try {
      const { id } = req.params;

      // Não permite desativar a si mesmo
      if (id === req.user.id) {
        return res.status(400).json({ error: 'Você não pode desativar sua própria conta.' });
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      const user = await prisma.user.update({
        where: { id },
        data: { active: !existing.active },
        select: { id: true, name: true, active: true },
      });

      return res.json({
        ...user,
        message: user.active ? 'Usuário ativado.' : 'Usuário desativado.',
      });

    } catch (error) {
      console.error('[USERS] Erro ao toggle:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },
};

module.exports = usersController;
