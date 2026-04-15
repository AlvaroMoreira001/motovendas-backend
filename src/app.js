/**
 * src/app.js
 *
 * Configura e exporta o app Express.
 * Separado do server.js para facilitar testes automatizados.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// =============================================
// MIDDLEWARES GLOBAIS
// =============================================

// Permite requisições de qualquer origem (necessário para o app mobile e portal web)
// Em produção, restrinja para os domínios reais:
// app.use(cors({ origin: ['https://meuportal.com', 'capacitor://localhost'] }))
app.use(cors());

// Interpreta o body das requisições como JSON
app.use(express.json());

// =============================================
// ROTAS
// =============================================

const authRoutes      = require('./routes/auth.routes');
const usersRoutes     = require('./routes/users.routes');
const productsRoutes  = require('./routes/products.routes');
const eventsRoutes    = require('./routes/events.routes');
const salesRoutes     = require('./routes/sales.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

app.use('/auth',      authRoutes);
app.use('/users',     usersRoutes);
app.use('/products',  productsRoutes);
app.use('/events',    eventsRoutes);
app.use('/sales',     salesRoutes);
app.use('/dashboard', dashboardRoutes);

// =============================================
// ROTA DE HEALTH CHECK
// Usada pelo Railway/Render para saber se o servidor está ok
// =============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// =============================================
// HANDLER DE ROTAS NÃO ENCONTRADAS
// =============================================
app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

// =============================================
// HANDLER GLOBAL DE ERROS
// Captura qualquer erro não tratado nos controllers
// =============================================
app.use((err, req, res, next) => {
  console.error('[ERRO GLOBAL]', err);
  res.status(500).json({ error: 'Erro interno inesperado.' });
});

module.exports = app;
