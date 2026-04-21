/**
 * prisma/seed.js
 *
 * Popula o banco com dados iniciais para desenvolvimento e teste.
 *
 * Como rodar:
 *   node prisma/seed.js
 *
 * O que cria:
 *   - 1 usuário admin (admin@motovendas.com / admin123)
 *   - 3 vendedores (joao, maria, pedro)
 *   - 8 produtos (capacete, jaqueta, bota, bone, camisa)
 *   - 1 evento ativo com estoque de todos os produtos
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...\n');

  // =============================================
  // USUÁRIOS
  // =============================================
  console.log('👤 Criando usuários...');

  const adminHash = await bcrypt.hash('admin123', 10);
  const sellerHash = await bcrypt.hash('seller123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@motovendas.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@motovendas.com',
      passwordHash: adminHash,
      role: 'admin',
    },
  });

  const joao = await prisma.user.upsert({
    where: { email: 'joao@motovendas.com' },
    update: {},
    create: {
      name: 'João Silva',
      email: 'joao@motovendas.com',
      passwordHash: sellerHash,
      role: 'seller',
    },
  });

  const maria = await prisma.user.upsert({
    where: { email: 'maria@motovendas.com' },
    update: {},
    create: {
      name: 'Maria Souza',
      email: 'maria@motovendas.com',
      passwordHash: sellerHash,
      role: 'seller',
    },
  });

  const pedro = await prisma.user.upsert({
    where: { email: 'pedro@motovendas.com' },
    update: {},
    create: {
      name: 'Pedro Costa',
      email: 'pedro@motovendas.com',
      passwordHash: sellerHash,
      role: 'seller',
    },
  });

  console.log('  ✅ Admin criado:    admin@motovendas.com / admin123');
  console.log('  ✅ Sellers criados: joao, maria, pedro — senha: seller123\n');

  // =============================================
  // PRODUTOS
  // =============================================
  console.log('📦 Criando produtos...');

  const produtos = [
    { name: 'Capacete X-11 Escorpion',   category: 'capacete', price: 389.90 },
    { name: 'Capacete Norisk FF391',      category: 'capacete', price: 459.00 },
    { name: 'Jaqueta Texx Armor',         category: 'jaqueta',  price: 319.90 },
    { name: 'Jaqueta Forza Preta',        category: 'jaqueta',  price: 279.90 },
    { name: 'Bota Forma Adventure',       category: 'bota',     price: 499.00 },
    { name: 'Boné Moto Speed',            category: 'bone',     price: 59.90  },
    { name: 'Camisa Dry Fit MotoRiders',  category: 'camisa',   price: 89.90  },
    { name: 'Camisa Polo Moto Club',      category: 'camisa',   price: 99.90  },
  ];

  const createdProducts = [];
  for (const p of produtos) {
    const product = await prisma.product.upsert({
      where: { id: p.name }, // fallback, upsert por nome não funciona bem, veja abaixo
      update: {},
      create: p,
    }).catch(async () => {
      // Se upsert falhar (id não existe), cria direto
      return await prisma.product.create({ data: p });
    });
    createdProducts.push(product);
    console.log(`  ✅ ${p.category.padEnd(8)} | ${p.name} — R$ ${p.price}`);
  }

  // Busca todos os produtos criados
  const allProducts = await prisma.product.findMany({ where: { active: true } });

  // =============================================
  // EVENTO ATIVO
  // =============================================
  console.log('\n🏟️  Criando evento ativo...');

  // Desativa todos os eventos existentes
  await prisma.event.updateMany({ data: { active: false } });

  const evento = await prisma.event.create({
    data: {
      name: 'Moto Fest SP 2025',
      location: 'Anhembi, São Paulo - SP',
      eventDate: new Date('2025-08-15'),
      active: true,
    },
  });

  console.log(`  ✅ Evento: ${evento.name} — ${evento.location}`);

  // =============================================
  // ESTOQUE DO EVENTO
  // =============================================
  console.log('\n📊 Definindo estoque do evento...');

  const quantities = {
    capacete: 15,
    jaqueta: 20,
    bota: 10,
    bone: 50,
    camisa: 40,
  };

  for (const product of allProducts) {
    const qty = quantities[product.category] || 10;
    await prisma.eventStock.upsert({
      where: {
        eventId_productId: { eventId: evento.id, productId: product.id },
      },
      update: { initialQuantity: qty, currentQuantity: qty },
      create: {
        eventId: evento.id,
        productId: product.id,
        initialQuantity: qty,
        currentQuantity: qty,
      },
    });
    console.log(`  ✅ ${product.name.padEnd(30)} → ${qty} unidades`);
  }

  // =============================================
  // RESUMO FINAL
  // =============================================
  console.log('\n' + '='.repeat(50));
  console.log('✅ Seed concluído com sucesso!');
  console.log('='.repeat(50));
  console.log('\n🔑 Credenciais para teste:');
  console.log('   Admin:  admin@motovendas.com / admin123');
  console.log('   Seller: joao@motovendas.com  / seller123');
  console.log('\n🌐 Inicie o servidor com: npm run dev');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

  // =============================================
  // LOGS DE AUDITORIA (exemplos para testar)
  // =============================================
  console.log('\n📋 Criando logs de auditoria de exemplo...')

  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@motovendas.com' } })

  const exemploLogs = [
    {
      action: 'user_created',
      description: 'Usuário "João Silva" (joao@motovendas.com) criado com perfil seller',
      userId: adminUser.id,
      targetType: 'user',
      metadata: { name: 'João Silva', role: 'seller' },
    },
    {
      action: 'user_created',
      description: 'Usuário "Maria Souza" (maria@motovendas.com) criado com perfil seller',
      userId: adminUser.id,
      targetType: 'user',
      metadata: { name: 'Maria Souza', role: 'seller' },
    },
    {
      action: 'event_created',
      description: 'Evento "Moto Fest SP 2025" criado por Administrador',
      userId: adminUser.id,
      targetType: 'event',
      metadata: { name: 'Moto Fest SP 2025' },
    },
    {
      action: 'event_activated',
      description: 'Evento "Moto Fest SP 2025" ativado por Administrador',
      userId: adminUser.id,
      targetType: 'event',
    },
  ]

  for (const log of exemploLogs) {
    await prisma.auditLog.create({ data: log })
    console.log(`  ✅ Log: ${log.action}`)
  }

