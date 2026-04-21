/**
 * src/controllers/products.controller.js
 *
 * CRUD de produtos com suporte a upload real de imagem.
 *
 * Fluxo de imagem:
 *  1. POST /products          → cria o produto (sem imagem ainda)
 *  2. POST /products/:id/image → faz upload da imagem e salva a URL no banco
 *     OU
 *  1. POST /products/with-image (multipart) → cria + imagem num único request
 */

const path = require('path')
const fs = require('fs')
const prisma = require('../config/prisma')
const { audit } = require('../utils/audit')

// Monta a URL pública da imagem a partir do nome do arquivo
function buildImageUrl(req, filename) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol
  const host = req.headers['x-forwarded-host'] || req.get('host')
  return `${protocol}://${host}/uploads/products/${filename}`
}

// Remove um arquivo de imagem antigo do disco (silenciosamente)
function deleteOldImage(imageUrl) {
  if (!imageUrl || imageUrl.startsWith('http') === false) return
  try {
    const filename = imageUrl.split('/uploads/products/').pop()
    if (!filename) return
    const filepath = path.join(__dirname, '../../uploads/products', filename)
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath)
  } catch (e) {
    console.warn('[PRODUCTS] Erro ao deletar imagem antiga:', e.message)
  }
}

const productsController = {

  async list(req, res) {
    try {
      const { category, showAll } = req.query
      const isAdmin = req.user.role === 'admin'
      const where = {}
      if (!isAdmin || showAll !== 'true') where.active = true
      if (category) where.category = category.toLowerCase()
      const products = await prisma.product.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      })
      return res.json(products)
    } catch (e) {
      console.error('[PRODUCTS] list:', e)
      return res.status(500).json({ error: 'Erro interno.' })
    }
  },

  async create(req, res) {
    try {
      const { name, category, price, imageUrl } = req.body

      if (!name || !category || price === undefined)
        return res.status(400).json({ error: 'Nome, categoria e preço são obrigatórios.' })

      const validCategories = ['capacete', 'jaqueta', 'bota', 'bone', 'camisa']
      if (!validCategories.includes(category.toLowerCase()))
        return res.status(400).json({ error: `Categoria inválida. Use: ${validCategories.join(', ')}.` })
      if (isNaN(price) || Number(price) <= 0)
        return res.status(400).json({ error: 'Preço deve ser positivo.' })

      // Se veio uma imagem via upload junto com o create (multipart)
      let finalImageUrl = imageUrl || null
      if (req.file) {
        finalImageUrl = buildImageUrl(req, req.file.filename)
      }

      const product = await prisma.product.create({
        data: {
          name: name.trim(),
          category: category.toLowerCase(),
          price: Number(price),
          imageUrl: finalImageUrl,
        },
      })

      await audit(prisma, {
        action: 'product_created',
        description: `Produto "${product.name}" (${product.category}) criado por ${req.user.name} — R$ ${Number(price).toFixed(2)}`,
        userId: req.user?.id, targetId: product.id, targetType: 'product',
        metadata: { name: product.name, category: product.category, price: product.price },
      })

      return res.status(201).json(product)
    } catch (e) {
      console.error('[PRODUCTS] create:', e)
      return res.status(500).json({ error: 'Erro interno.' })
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params
      const product = await prisma.product.findUnique({
        where: { id },
        include: { stocks: { include: { event: { select: { id: true, name: true, active: true } } } } },
      })
      if (!product) return res.status(404).json({ error: 'Produto não encontrado.' })
      return res.json(product)
    } catch (e) {
      console.error('[PRODUCTS] getById:', e)
      return res.status(500).json({ error: 'Erro interno.' })
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params
      const { name, category, price, imageUrl } = req.body
      const existing = await prisma.product.findUnique({ where: { id } })
      if (!existing) return res.status(404).json({ error: 'Produto não encontrado.' })

      const updateData = {}
      const changes = []

      if (name && name !== existing.name) {
        updateData.name = name.trim()
        changes.push(`nome: "${existing.name}" → "${name.trim()}"`)
      }
      if (category) {
        const validCategories = ['capacete', 'jaqueta', 'bota', 'bone', 'camisa']
        if (!validCategories.includes(category.toLowerCase()))
          return res.status(400).json({ error: `Categoria inválida. Use: ${validCategories.join(', ')}.` })
        if (category.toLowerCase() !== existing.category) {
          updateData.category = category.toLowerCase()
          changes.push(`categoria: ${existing.category} → ${category.toLowerCase()}`)
        }
      }
      if (price !== undefined) {
        if (isNaN(price) || Number(price) <= 0)
          return res.status(400).json({ error: 'Preço deve ser positivo.' })
        if (Number(price) !== Number(existing.price)) {
          updateData.price = Number(price)
          changes.push(`preço: R$${Number(existing.price).toFixed(2)} → R$${Number(price).toFixed(2)}`)
        }
      }
      // URL manual de imagem (sem upload de arquivo)
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl

      const product = await prisma.product.update({ where: { id }, data: updateData })

      if (changes.length > 0) {
        await audit(prisma, {
          action: 'product_updated',
          description: `Produto "${existing.name}" atualizado por ${req.user.name}: ${changes.join(', ')}`,
          userId: req.user?.id, targetId: id, targetType: 'product', metadata: { changes },
        })
      }

      return res.json(product)
    } catch (e) {
      console.error('[PRODUCTS] update:', e)
      return res.status(500).json({ error: 'Erro interno.' })
    }
  },

  /**
   * POST /products/:id/image
   *
   * Faz upload de uma imagem para um produto existente.
   * Aceita multipart/form-data com campo "image".
   * Deleta a imagem anterior do disco automaticamente.
   *
   * Funciona tanto para o portal web (FormData com File)
   * quanto para o app mobile (FormData com uri/blob do Expo)
   */
  async uploadImage(req, res) {
    try {
      const { id } = req.params

      if (!req.file) {
        return res.status(400).json({ error: 'Nenhuma imagem enviada. Use o campo "image" no FormData.' })
      }

      const existing = await prisma.product.findUnique({ where: { id } })
      if (!existing) {
        // Remove o arquivo recém-enviado se o produto não existir
        fs.unlinkSync(req.file.path)
        return res.status(404).json({ error: 'Produto não encontrado.' })
      }

      // Deleta imagem anterior se era um arquivo local
      if (existing.imageUrl && existing.imageUrl.includes('/uploads/products/')) {
        deleteOldImage(existing.imageUrl)
      }

      // Monta URL pública e salva no banco
      const imageUrl = buildImageUrl(req, req.file.filename)

      const product = await prisma.product.update({
        where: { id },
        data: { imageUrl },
      })

      return res.json({
        message: 'Imagem atualizada com sucesso.',
        imageUrl: product.imageUrl,
        product,
      })
    } catch (e) {
      // Remove arquivo se houve erro após o upload
      if (req.file) {
        try { fs.unlinkSync(req.file.path) } catch {}
      }
      console.error('[PRODUCTS] uploadImage:', e)
      return res.status(500).json({ error: 'Erro interno ao salvar imagem.' })
    }
  },

  async toggleActive(req, res) {
    try {
      const { id } = req.params
      const existing = await prisma.product.findUnique({ where: { id } })
      if (!existing) return res.status(404).json({ error: 'Produto não encontrado.' })
      const product = await prisma.product.update({
        where: { id },
        data: { active: !existing.active },
        select: { id: true, name: true, active: true },
      })
      return res.json({ ...product, message: product.active ? 'Produto ativado.' : 'Produto desativado.' })
    } catch (e) {
      console.error('[PRODUCTS] toggle:', e)
      return res.status(500).json({ error: 'Erro interno.' })
    }
  },
}

module.exports = productsController
