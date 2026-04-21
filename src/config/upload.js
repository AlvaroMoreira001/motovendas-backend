/**
 * src/config/upload.js
 *
 * Configura o Multer para salvar imagens de produtos no disco.
 *
 * - Aceita apenas imagens (jpeg, png, webp, gif)
 * - Limite de 5MB por arquivo
 * - Salva em /uploads/products/ com nome único baseado em timestamp
 * - Também exporta um middleware pronto para usar nas rotas
 */

const multer = require('multer')
const path = require('path')
const fs = require('fs')

// Garante que a pasta de uploads existe
const UPLOAD_DIR = path.join(__dirname, '../../uploads/products')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// Configuração de onde e como salvar o arquivo
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR)
  },
  filename: (req, file, cb) => {
    // Ex: product_1712345678901_abc123.jpg
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
    cb(null, `product_${uniqueSuffix}${ext}`)
  },
})

// Filtro: só aceita imagens
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg']
  if (allowed.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Tipo de arquivo não permitido. Use: JPEG, PNG, WEBP ou GIF.'), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
})

module.exports = upload
