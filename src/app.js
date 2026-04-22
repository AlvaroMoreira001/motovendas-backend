/**
 * src/app.js
 */
require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const path    = require('path')

const app = express()

// ── CORS ──────────────────────────────────────────────────
// Configuração explícita — necessária para funcionar corretamente
// em produção atrás do proxy do Railway.
//
// FRONTEND_URL deve ser definida nas variáveis de ambiente do Railway.
// Ex: https://motovendas-web.vercel.app
//
// Se não definida, libera todas as origens (útil em desenvolvimento).
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000']
  : true // libera tudo — seguro apenas em dev

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204,
}))

// Responde preflight OPTIONS em todas as rotas explicitamente
app.options('*', cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204,
}))

// ── Body parser ───────────────────────────────────────────
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Imagens estáticas ─────────────────────────────────────
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
