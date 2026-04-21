/**
 * src/app.js
 */
require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')

const app = express()

// ── CORS ──────────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://motovendas.vercel.app/',  // URL do seu portal web no Vercel
    'http://localhost:5173',               // desenvolvimento local
  ],
  credentials: true,
}))

// ── Servir imagens de produtos como arquivos estáticos ────
// Qualquer URL /uploads/products/produto_xxx.jpg é servida diretamente
// Sem autenticação — as URLs são públicas por design (necessário para o app mobile e portal web exibirem as imagens)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// ── Rotas ─────────────────────────────────────────────────
const authRoutes      = require('./routes/auth.routes')
const usersRoutes     = require('./routes/users.routes')
const productsRoutes  = require('./routes/products.routes')
const eventsRoutes    = require('./routes/events.routes')
const salesRoutes     = require('./routes/sales.routes')
const dashboardRoutes = require('./routes/dashboard.routes')
const auditRoutes     = require('./routes/audit.routes')

app.use('/auth',      authRoutes)
app.use('/users',     usersRoutes)
app.use('/products',  productsRoutes)
app.use('/events',    eventsRoutes)
app.use('/sales',     salesRoutes)
app.use('/dashboard', dashboardRoutes)
app.use('/audit',     auditRoutes)

// ── Health check ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.2.0' })
})

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` })
})

// ── Handler global de erros ───────────────────────────────
app.use((err, req, res, next) => {
  // Erro do Multer (arquivo muito grande, tipo errado)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Imagem muito grande. Limite: 5MB.' })
  }
  if (err.message && err.message.includes('Tipo de arquivo')) {
    return res.status(400).json({ error: err.message })
  }
  console.error('[ERRO GLOBAL]', err)
  res.status(500).json({ error: 'Erro interno inesperado.' })
})

module.exports = app
