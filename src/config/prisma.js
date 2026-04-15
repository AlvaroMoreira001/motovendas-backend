/**
 * src/config/prisma.js
 *
 * Exporta uma única instância do PrismaClient para toda a aplicação.
 * Usar singleton evita criar múltiplas conexões com o banco durante o
 * desenvolvimento com hot-reload (nodemon).
 */

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definido. Configure no arquivo .env.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'warn', 'error']  // No dev, mostra as queries no terminal
    : ['error'],                  // Em produção, só erros
});

module.exports = prisma;
