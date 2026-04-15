/**
 * src/server.js
 *
 * Ponto de entrada da aplicação.
 * Inicia o servidor HTTP na porta configurada.
 */

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('');
  console.log('🏍️  MotoVendas API iniciada!');
  console.log(`🚀  Servidor rodando em http://localhost:${PORT}`);
  console.log(`🌍  Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`❤️   Health check: http://localhost:${PORT}/health`);
  console.log('');
});
