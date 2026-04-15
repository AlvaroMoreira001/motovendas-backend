/**
 * src/controllers/products.controller.js
 *
 * Gerencia o catálogo de produtos da loja.
 * Admin: pode criar, editar, desativar.
 * Seller: pode apenas listar (para montar a venda no app).
 *
 * GET    /products          → lista produtos ativos
 * POST   /products          → cria produto (admin)
 * GET    /products/:id      → detalhes do produto
 * PUT    /products/:id      → atualiza produto (admin)
 * PATCH  /products/:id/toggle-active → ativa/desativa (admin)
 */

const prisma = require('../config/prisma');

const productsController = {

  /**
   * Lista todos os produtos ativos
   * Suporta filtro por categoria: GET /products?category=capacete
   * Sellers veem só os ativos. Admin pode ver todos com ?showAll=true
   */
  async list(req, res) {
    try {
      const { category, showAll } = req.query;
      const isAdmin = req.user.role === 'admin';

      const where = {};

      // Sellers sempre veem só produtos ativos
      if (!isAdmin || showAll !== 'true') {
        where.active = true;
      }

      if (category) {
        where.category = category.toLowerCase();
      }

      const products = await prisma.product.findMany({
        where,
        orderBy: [
          { category: 'asc' },
          { name: 'asc' },
        ],
      });

      return res.json(products);

    } catch (error) {
      console.error('[PRODUCTS] Erro ao listar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Cria um novo produto
   * Body: { name, category, price, imageUrl }
   *
   * Categorias válidas: capacete, jaqueta, bota, bone, camisa
   */
  async create(req, res) {
    try {
      const { name, category, price, imageUrl } = req.body;

      // Validações
      if (!name || !category || price === undefined) {
        return res.status(400).json({
          error: 'Nome, categoria e preço são obrigatórios.',
        });
      }

      const validCategories = ['capacete', 'jaqueta', 'bota', 'bone', 'camisa'];
      if (!validCategories.includes(category.toLowerCase())) {
        return res.status(400).json({
          error: `Categoria inválida. Use: ${validCategories.join(', ')}.`,
        });
      }

      if (isNaN(price) || Number(price) <= 0) {
        return res.status(400).json({ error: 'Preço deve ser um número positivo.' });
      }

      const product = await prisma.product.create({
        data: {
          name: name.trim(),
          category: category.toLowerCase(),
          price: Number(price),
          imageUrl: imageUrl || null,
        },
      });

      return res.status(201).json(product);

    } catch (error) {
      console.error('[PRODUCTS] Erro ao criar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Retorna detalhes de um produto, incluindo o estoque nos eventos
   */
  async getById(req, res) {
    try {
      const { id } = req.params;

      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          // Estoque em cada evento onde esse produto está cadastrado
          stocks: {
            include: {
              event: { select: { id: true, name: true, active: true } },
            },
          },
        },
      });

      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado.' });
      }

      return res.json(product);

    } catch (error) {
      console.error('[PRODUCTS] Erro ao buscar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Atualiza dados do produto
   * Body: { name, category, price, imageUrl }
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, category, price, imageUrl } = req.body;

      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'Produto não encontrado.' });
      }

      const updateData = {};
      if (name) updateData.name = name.trim();
      if (category) {
        const validCategories = ['capacete', 'jaqueta', 'bota', 'bone', 'camisa'];
        if (!validCategories.includes(category.toLowerCase())) {
          return res.status(400).json({ error: `Categoria inválida. Use: ${validCategories.join(', ')}.` });
        }
        updateData.category = category.toLowerCase();
      }
      if (price !== undefined) {
        if (isNaN(price) || Number(price) <= 0) {
          return res.status(400).json({ error: 'Preço deve ser um número positivo.' });
        }
        updateData.price = Number(price);
      }
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

      const product = await prisma.product.update({
        where: { id },
        data: updateData,
      });

      return res.json(product);

    } catch (error) {
      console.error('[PRODUCTS] Erro ao atualizar:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * Ativa ou desativa um produto
   * Produto desativado não aparece para os vendedores
   */
  async toggleActive(req, res) {
    try {
      const { id } = req.params;

      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: 'Produto não encontrado.' });
      }

      const product = await prisma.product.update({
        where: { id },
        data: { active: !existing.active },
        select: { id: true, name: true, active: true },
      });

      return res.json({
        ...product,
        message: product.active ? 'Produto ativado.' : 'Produto desativado.',
      });

    } catch (error) {
      console.error('[PRODUCTS] Erro ao toggle:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },
};

module.exports = productsController;
