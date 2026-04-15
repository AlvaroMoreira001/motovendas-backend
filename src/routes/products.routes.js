/**
 * src/routes/products.routes.js
 */
const express = require('express');
const router = express.Router();
const productsController = require('../controllers/products.controller');
const auth = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/role.middleware');

// Leitura: qualquer usuário autenticado (admin e seller)
router.get('/', auth, productsController.list);
router.get('/:id', auth, productsController.getById);

// Escrita: apenas admin
router.post('/', auth, requireRole('admin'), productsController.create);
router.put('/:id', auth, requireRole('admin'), productsController.update);
router.patch('/:id/toggle-active', auth, requireRole('admin'), productsController.toggleActive);

module.exports = router;
