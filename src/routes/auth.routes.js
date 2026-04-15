/**
 * src/routes/auth.routes.js
 *
 * Rotas públicas (sem autenticação): login
 * Rotas protegidas: /me (precisa do token)
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const auth = require('../middlewares/auth.middleware');

// POST /auth/login → retorna token JWT
router.post('/login', authController.login);

// GET /auth/me → dados do usuário logado (valida token)
router.get('/me', auth, authController.me);

module.exports = router;
