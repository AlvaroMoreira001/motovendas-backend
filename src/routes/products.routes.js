/**
 * src/routes/products.routes.js
 */
const express = require('express')
const router = express.Router()
const productsController = require('../controllers/products.controller')
const auth = require('../middlewares/auth.middleware')
const requireRole = require('../middlewares/role.middleware')
const upload = require('../config/upload')

// Leitura: qualquer autenticado
router.get('/',    auth, productsController.list)
router.get('/:id', auth, productsController.getById)

// Escrita: apenas admin
router.post('/',
  auth, requireRole('admin'),
  upload.single('image'),   // aceita campo "image" opcionalmente
  productsController.create
)
router.put('/:id',
  auth, requireRole('admin'),
  productsController.update
)

// Upload de imagem — aceita campo "image" no FormData
// Funciona para web (File) e mobile (uri do Expo ImagePicker)
router.post('/:id/image',
  auth, requireRole('admin'),
  upload.single('image'),
  productsController.uploadImage
)

router.patch('/:id/toggle-active', auth, requireRole('admin'), productsController.toggleActive)

module.exports = router
