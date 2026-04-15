/**
 * src/routes/sales.routes.js
 */
const express = require('express');
const router = express.Router();
const salesController = require('../controllers/sales.controller');
const auth = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/role.middleware');

// IMPORTANTE: /my deve vir ANTES de /:id para não ser capturado como ID
router.get('/my', auth, salesController.listMy);                             // seller: minhas vendas
router.get('/', auth, requireRole('admin'), salesController.list);           // admin: todas as vendas
router.get('/:id', auth, salesController.getById);                           // detalhes (acesso restrito no controller)

router.post('/', auth, salesController.create);                              // admin e seller criam vendas
router.put('/:id/complete', auth, requireRole('admin'), salesController.complete);  // admin finaliza
router.put('/:id/cancel', auth, requireRole('admin'), salesController.cancel);      // admin cancela

module.exports = router;
