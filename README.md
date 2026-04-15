# 🏍️ MotoVendas — Backend API

API REST completa para controle de vendas em eventos de moto.
Conecta o portal web do admin com o app mobile dos vendedores.

---

## 📁 Estrutura do Projeto

```
motovendas-backend/
├── prisma/
│   ├── schema.prisma        ← Modelo do banco de dados
│   └── seed.js              ← Popula o banco com dados de teste
├── src/
│   ├── config/
│   │   └── prisma.js        ← Instância única do Prisma
│   ├── controllers/
│   │   ├── auth.controller.js       ← Login e autenticação
│   │   ├── users.controller.js      ← CRUD de usuários
│   │   ├── products.controller.js   ← CRUD de produtos
│   │   ├── events.controller.js     ← Eventos + estoque
│   │   ├── sales.controller.js      ← Vendas (núcleo do sistema)
│   │   └── dashboard.controller.js  ← Analytics para o admin
│   ├── middlewares/
│   │   ├── auth.middleware.js        ← Valida token JWT
│   │   └── role.middleware.js        ← Controle de acesso por perfil
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── users.routes.js
│   │   ├── products.routes.js
│   │   ├── events.routes.js
│   │   ├── sales.routes.js
│   │   └── dashboard.routes.js
│   ├── app.js               ← Configura o Express
│   └── server.js            ← Inicia o servidor
├── .env.example             ← Modelo das variáveis de ambiente
├── .gitignore
└── package.json
```

---

## 🚀 Como rodar localmente (passo a passo)

### Pré-requisitos
- [Node.js](https://nodejs.org) v18 ou superior
- [PostgreSQL](https://www.postgresql.org/download/) instalado e rodando

---

### 1. Clone e instale as dependências

```bash
git clone <url-do-repositorio>
cd motovendas-backend
npm install
```

---

### 2. Configure as variáveis de ambiente

```bash
# Copia o arquivo de exemplo
cp .env.example .env
```

Abra o `.env` e preencha:

```env
# Troque pelos dados do seu PostgreSQL local
DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/motovendas"

# Gere uma chave segura com:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET="cole_aqui_uma_chave_longa_e_aleatoria"

JWT_EXPIRES_IN="8h"
PORT=3000
NODE_ENV="development"
```

---

### 3. Crie o banco de dados

No terminal do PostgreSQL ou em um client como DBeaver/TablePlus:

```sql
CREATE DATABASE motovendas;
```

---

### 4. Rode as migrations e gere o Prisma Client

```bash
# Cria as tabelas no banco com base no schema.prisma
npm run db:push

# Gera o cliente TypeScript do Prisma
npm run db:generate
```

---

### 5. Popule o banco com dados de teste

```bash
npm run db:seed
```

Isso cria:
- **Admin:** `admin@motovendas.com` / `admin123`
- **Vendedores:** `joao@motovendas.com`, `maria@motovendas.com`, `pedro@motovendas.com` / `seller123`
- **8 produtos** de exemplo (capacete, jaqueta, bota, bone, camisa)
- **1 evento ativo** com estoque de todos os produtos

---

### 6. Inicie o servidor

```bash
npm run dev    # desenvolvimento (hot-reload com nodemon)
npm start      # produção
```

O servidor estará disponível em: `http://localhost:3000`

Verifique com: `GET http://localhost:3000/health`

---

## 🌐 Deploy no Railway (recomendado)

O Railway oferece PostgreSQL + servidor Node em um só lugar, com ~$5/mês.

### Passo a passo:

1. Acesse [railway.app](https://railway.app) e crie uma conta

2. Clique em **New Project → Deploy from GitHub repo**
   - Conecte seu GitHub e selecione o repositório

3. Adicione o banco de dados:
   - No projeto, clique em **+ New** → **Database** → **PostgreSQL**

4. Configure as variáveis de ambiente:
   - Clique no serviço Node.js → **Variables**
   - Adicione:
     ```
     DATABASE_URL    → clique em "Add Reference" e selecione a variável do PostgreSQL
     JWT_SECRET      → sua chave secreta
     JWT_EXPIRES_IN  → 8h
     NODE_ENV        → production
     PORT            → 3000
     ```

5. Configure o comando de start:
   - Em **Settings** → **Start Command**: `npm start`

6. Após o deploy, rode o seed via Railway CLI:
   ```bash
   railway run node prisma/seed.js
   ```

7. Sua API estará disponível em uma URL como:
   `https://motovendas-backend.up.railway.app`

---

## 📡 Endpoints da API

### Auth
| Método | Rota         | Quem pode | Descrição              |
|--------|--------------|-----------|------------------------|
| POST   | /auth/login  | Todos     | Login, retorna JWT     |
| GET    | /auth/me     | Logados   | Dados do usuário atual |

### Usuários (apenas admin)
| Método | Rota                        | Descrição                |
|--------|-----------------------------|--------------------------|
| GET    | /users                      | Lista todos              |
| POST   | /users                      | Cria usuário             |
| GET    | /users/:id                  | Detalhes                 |
| PUT    | /users/:id                  | Atualiza                 |
| PATCH  | /users/:id/toggle-active    | Ativa/desativa           |

### Produtos
| Método | Rota                          | Quem pode    | Descrição        |
|--------|-------------------------------|--------------|------------------|
| GET    | /products                     | Admin+Seller | Lista produtos   |
| POST   | /products                     | Admin        | Cria produto     |
| GET    | /products/:id                 | Admin+Seller | Detalhes         |
| PUT    | /products/:id                 | Admin        | Atualiza         |
| PATCH  | /products/:id/toggle-active   | Admin        | Ativa/desativa   |

### Eventos e Estoque
| Método | Rota                          | Quem pode    | Descrição              |
|--------|-------------------------------|--------------|------------------------|
| GET    | /events                       | Admin+Seller | Lista eventos          |
| POST   | /events                       | Admin        | Cria evento            |
| GET    | /events/:id                   | Admin+Seller | Detalhes + estoque     |
| PUT    | /events/:id                   | Admin        | Atualiza               |
| PATCH  | /events/:id/activate          | Admin        | Define como ativo      |
| GET    | /events/:id/stock             | Admin+Seller | Estoque do evento      |
| POST   | /events/:id/stock             | Admin        | Define estoque         |
| PATCH  | /events/:id/stock/adjust      | Admin        | Ajuste manual          |

### Vendas
| Método | Rota                  | Quem pode    | Descrição                      |
|--------|-----------------------|--------------|--------------------------------|
| POST   | /sales                | Admin+Seller | Cria venda (debita estoque)    |
| GET    | /sales                | Admin        | Lista todas as vendas          |
| GET    | /sales/my             | Seller       | Minhas vendas                  |
| GET    | /sales/:id            | Admin+Seller | Detalhes com itens             |
| PUT    | /sales/:id/complete   | Admin        | Finaliza venda                 |
| PUT    | /sales/:id/cancel     | Admin        | Cancela e devolve estoque      |

### Dashboard (apenas admin)
| Método | Rota                    | Descrição                        |
|--------|-------------------------|----------------------------------|
| GET    | /dashboard/summary      | Resumo geral do evento ativo     |
| GET    | /dashboard/by-seller    | Ranking de vendas por vendedor   |
| GET    | /dashboard/stock-alert  | Produtos com estoque baixo       |
| GET    | /dashboard/by-category  | Vendas por categoria             |

---

## 🧪 Exemplos de Requisições

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@motovendas.com", "password": "admin123"}'
```

### Criar uma venda (com token)
```bash
curl -X POST http://localhost:3000/sales \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{
    "eventId": "ID_DO_EVENTO",
    "paymentMethod": "pix",
    "items": [
      { "productId": "ID_PRODUTO_1", "quantity": 1 },
      { "productId": "ID_PRODUTO_2", "quantity": 2 }
    ]
  }'
```

### Dashboard
```bash
curl http://localhost:3000/dashboard/summary \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

---

## 🔒 Segurança implementada

| Aspecto          | Solução                                           |
|------------------|---------------------------------------------------|
| Senhas           | bcrypt com salt factor 10                         |
| Autenticação     | JWT com expiração configurável                    |
| Autorização      | Middleware de role (admin/seller)                 |
| Estoque          | Transações atômicas (sem venda duplicada)         |
| Dados sensíveis  | passwordHash nunca é retornado nas respostas      |

---

## 🛠️ Scripts úteis

```bash
npm run dev          # Inicia com hot-reload
npm run db:studio    # Abre o Prisma Studio (GUI do banco)
npm run db:seed      # Popula o banco com dados de teste
npm run db:reset     # Reseta e repopula o banco (CUIDADO em produção)
```

---

## 📱 Integração com o App Mobile

O app React Native deve:

1. Fazer `POST /auth/login` e salvar o token no AsyncStorage
2. Enviar `Authorization: Bearer <token>` em todas as requisições
3. Ao criar venda, usar `POST /sales` com o `eventId` do evento ativo
4. Para listar produtos disponíveis, usar `GET /products` (retorna só os ativos)
5. Para ver o estoque atual, usar `GET /events/:id/stock`
