/**
 * src/controllers/users.controller.js
 * Com logs de auditoria em: criar, atualizar, ativar/desativar
 */
const bcrypt = require('bcryptjs')
const prisma = require('../config/prisma')
const { audit } = require('../utils/audit')

const usersController = {
  async list(req, res) {
    try {
      const { role } = req.query
      const users = await prisma.user.findMany({
        where: role ? { role } : undefined,
        select: { id:true, name:true, email:true, role:true, active:true, createdAt:true, _count:{ select:{ sales:true } } },
        orderBy: { name: 'asc' },
      })
      return res.json(users)
    } catch (e) { console.error('[USERS] list:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async create(req, res) {
    try {
      const { name, email, password, role } = req.body
      if (!name || !email || !password) return res.status(400).json({ error:'Nome, email e senha são obrigatórios.' })
      if (password.length < 6) return res.status(400).json({ error:'Senha deve ter mínimo 6 caracteres.' })
      if (role && !['admin','seller'].includes(role)) return res.status(400).json({ error:'Role inválido.' })
      const existing = await prisma.user.findUnique({ where:{ email: email.toLowerCase().trim() } })
      if (existing) return res.status(409).json({ error:'Email já cadastrado.' })

      const passwordHash = await bcrypt.hash(password, 10)
      const user = await prisma.user.create({
        data: { name:name.trim(), email:email.toLowerCase().trim(), passwordHash, role:role||'seller' },
        select: { id:true, name:true, email:true, role:true, active:true, createdAt:true },
      })

      await audit(prisma, {
        action: 'user_created',
        description: `Usuário "${user.name}" (${user.email}) criado com perfil ${user.role}`,
        userId: req.user?.id,
        targetId: user.id,
        targetType: 'user',
        metadata: { name:user.name, email:user.email, role:user.role },
      })

      return res.status(201).json(user)
    } catch (e) { console.error('[USERS] create:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async getById(req, res) {
    try {
      const { id } = req.params
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id:true, name:true, email:true, role:true, active:true, createdAt:true,
          sales: { select:{ id:true, status:true, total:true, paymentMethod:true, createdAt:true, event:{ select:{ name:true } } }, orderBy:{ createdAt:'desc' }, take:10 },
          _count: { select:{ sales:true } },
        },
      })
      if (!user) return res.status(404).json({ error:'Usuário não encontrado.' })
      return res.json(user)
    } catch (e) { console.error('[USERS] getById:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async update(req, res) {
    try {
      const { id } = req.params
      const { name, email, password } = req.body
      const existing = await prisma.user.findUnique({ where:{ id } })
      if (!existing) return res.status(404).json({ error:'Usuário não encontrado.' })

      const updateData = {}
      const changes = []

      if (name && name !== existing.name) { updateData.name = name.trim(); changes.push(`nome: "${existing.name}" → "${name.trim()}"`) }
      if (email) {
        const emailInUse = await prisma.user.findFirst({ where:{ email:email.toLowerCase().trim(), NOT:{ id } } })
        if (emailInUse) return res.status(409).json({ error:'Email já em uso.' })
        if (email.toLowerCase().trim() !== existing.email) { updateData.email = email.toLowerCase().trim(); changes.push(`email alterado`) }
      }
      if (password) {
        if (password.length < 6) return res.status(400).json({ error:'Senha deve ter mínimo 6 caracteres.' })
        updateData.passwordHash = await bcrypt.hash(password, 10)
        changes.push('senha alterada')
      }

      const user = await prisma.user.update({ where:{ id }, data:updateData, select:{ id:true, name:true, email:true, role:true, active:true } })

      if (changes.length > 0) {
        await audit(prisma, {
          action: 'user_updated',
          description: `Dados de "${existing.name}" atualizados: ${changes.join(', ')}`,
          userId: req.user?.id, targetId: user.id, targetType: 'user', metadata: { changes },
        })
      }
      return res.json(user)
    } catch (e) { console.error('[USERS] update:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },

  async toggleActive(req, res) {
    try {
      const { id } = req.params
      if (id === req.user.id) return res.status(400).json({ error:'Não pode desativar sua própria conta.' })
      const existing = await prisma.user.findUnique({ where:{ id } })
      if (!existing) return res.status(404).json({ error:'Usuário não encontrado.' })

      const user = await prisma.user.update({ where:{ id }, data:{ active:!existing.active }, select:{ id:true, name:true, active:true } })

      await audit(prisma, {
        action: 'user_toggled',
        description: `Usuário "${existing.name}" foi ${user.active ? 'ativado' : 'desativado'} por ${req.user.name}`,
        userId: req.user?.id, targetId: user.id, targetType: 'user', metadata: { active:user.active },
      })

      return res.json({ ...user, message: user.active ? 'Usuário ativado.' : 'Usuário desativado.' })
    } catch (e) { console.error('[USERS] toggle:', e); return res.status(500).json({ error:'Erro interno.' }) }
  },
}

module.exports = usersController
