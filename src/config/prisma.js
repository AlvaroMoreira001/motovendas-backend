/**
 * src/config/prisma.js
 *
 * Exporta uma única instância do PrismaClient para toda a aplicação.
 * Usar singleton evita criar múltiplas conexões com o banco durante o
 * desenvolvimento com hot-reload (nodemon).
 */

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL nao definida no ambiente.');
}

const adapter = new PrismaPg({ connectionString });

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'warn', 'error']  // No dev, mostra as queries no terminal
    : ['error'],                  // Em produção, só erros
});

module.exports = prisma;
