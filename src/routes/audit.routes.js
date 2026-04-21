/**
 * src/routes/audit.routes.js
 */
const express = require('express')
const router = express.Router()
const auditController = require('../controllers/audit.controller')
const auth = require('../middlewares/auth.middleware')
const requireRole = require('../middlewares/role.middleware')

// Somente admin pode ver o histórico de auditoria
router.get('/', auth, requireRole('admin'), auditController.list)

module.exports = router
