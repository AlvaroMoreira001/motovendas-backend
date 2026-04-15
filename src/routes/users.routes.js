/**
 * src/routes/users.routes.js
 */
const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users.controller');
const auth = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/role.middleware');

// Todas as rotas de usuário exigem admin
router.use(auth, requireRole('admin'));

router.get('/', usersController.list);
router.post('/', usersController.create);
router.get('/:id', usersController.getById);
router.put('/:id', usersController.update);
router.patch('/:id/toggle-active', usersController.toggleActive);

module.exports = router;
