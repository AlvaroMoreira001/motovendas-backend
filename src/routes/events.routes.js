/**
 * src/routes/events.routes.js
 */
const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/events.controller');
const auth = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/role.middleware');

// Leitura: qualquer autenticado (seller precisa ver o evento ativo e o estoque)
router.get('/', auth, eventsController.list);
router.get('/:id', auth, eventsController.getById);
router.get('/:id/stock', auth, eventsController.getStock);

// Escrita: apenas admin
router.post('/', auth, requireRole('admin'), eventsController.create);
router.put('/:id', auth, requireRole('admin'), eventsController.update);
router.patch('/:id/activate', auth, requireRole('admin'), eventsController.activate);
router.post('/:id/stock', auth, requireRole('admin'), eventsController.setStock);
router.patch('/:id/stock/adjust', auth, requireRole('admin'), eventsController.adjustStock);

module.exports = router;
