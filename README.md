# Financeiro Back

API REST para controle financeiro pessoal, desenvolvida com NestJS, Prisma e PostgreSQL.

## Tecnologias

- **NestJS** - Framework Node.js
- **Prisma** - ORM para PostgreSQL
- **Zod** - Validação de schemas
- **JWT** - Autenticação
- **bcryptjs** - Hash de senhas

## Pré-requisitos

- Node.js 18+
- PostgreSQL

## Configuração

1. Clone o repositório e instale as dependências:

```bash
yarn install
```

2. Configure as variáveis de ambiente no `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/financial"
PORT=3333
JWT_PRIVATE_KEY="sua-chave-privada"
JWT_PUBLIC_KEY="sua-chave-publica"
```

3. Execute as migrations e o seed:

```bash
npx prisma migrate dev
yarn prisma:seed
```

4. Inicie o servidor:

```bash
yarn dev
```

## Autenticação

Todas as rotas (exceto criar conta e login) requerem o header:

```
Authorization: Bearer <access_token>
```

---

## Funcionalidades

### Autenticação

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/sessions` | Login - retorna `access_token` e dados do usuário |
| POST | `/accounts` | Criar conta |

**Body login:** `{ "email": "string", "password": "string" }`

**Body criar conta:** `{ "name": "string", "email": "string", "password": "string" }`

---

### Saldo

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/amount` | Retorna saldo atual. Processa entradas recorrentes automaticamente se for o dia de pagamento |

---

### Categorias

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/category` | Listar categorias do usuário |
| POST | `/category` | Criar categoria |
| DELETE | `/category/:id` | Deletar categoria (valida se é dono) |

**Body criar:** `{ "title": "string", "description": "string | null" }`

---

### Transações

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/transaction?month=&year=` | Listar transações do mês/ano |
| POST | `/transaction` | Criar transação |

**Body criar:** `{ "message": "string", "value": number, "type": "DEBIT" | "CREDIT" | "PAY", "categories": ["uuid"]? }`

- **DEBIT** - Débito (reduz saldo)
- **CREDIT** - Crédito (aumenta saldo)
- **PAY** - Pagamento (reduz saldo)

---

### Entradas Recorrentes

Cadastro de recebimentos fixos mensais (ex: salário). Ao acessar `/amount` no dia de pagamento, o valor é creditado automaticamente.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/recurring-income` | Listar entradas recorrentes |
| POST | `/recurring-income` | Criar entrada recorrente |
| DELETE | `/recurring-income/:id` | Deletar entrada recorrente |

**Body criar:** `{ "title": "string", "value": number, "dayOfMonth": number }` (dayOfMonth: 1-31)

---

### Pagamentos Recorrentes

Cadastro de pagamentos fixos mensais (ex: aluguel, assinaturas). O usuário paga manualmente a parcela do mês atual.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/recurring-payment` | Listar pagamentos recorrentes |
| POST | `/recurring-payment` | Criar pagamento recorrente |
| POST | `/recurring-payment/:id/pay` | Pagar parcela do mês atual (gera transação com `isRecurring: true`) |
| DELETE | `/recurring-payment/:id` | Deletar pagamento recorrente |

**Body criar:** `{ "title": "string", "value": number, "dayOfMonth": number }`

---

### Dívidas (Parceladas)

Dívidas com parcelas definidas (financiamentos, empréstimos).

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/debt` | Listar dívidas com parcelas |
| GET | `/debt/:id` | Buscar dívida por ID |
| POST | `/debt` | Criar dívida com parcelas manuais |
| POST | `/debt/recurrence` | Criar dívida com parcelas automáticas |
| DELETE | `/debt/:id` | Deletar dívida |

**Body criar (manual):** `{ "title": "string", "description": "string | null", "installments": [{ "value": number, "status": "PAY" | "SCHEDULE", "date": "YYYY-MM-DD" }] }`

**Body criar (recorrência):** `{ "title": "string", "description": "string | null", "value": number, "installmentsCount": number, "recurrence": "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY", "dayOfMonth": "string" }`

---

### Parcelas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/installment?month=&year=` | Listar parcelas do mês/ano |
| POST | `/installment` | Adicionar parcela a uma dívida |
| PATCH | `/installment/:id` | Pagar parcela |
| DELETE | `/installment/:id` | Deletar parcela |

**Body criar:** `{ "debtId": "uuid", "value": number, "date": "YYYY-MM-DD" }`

---

### Compras Futuras

Lista de desejos com valor e data prevista de aquisição.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/future-purchase` | Listar compras futuras |
| GET | `/future-purchase/:id` | Buscar compra futura |
| POST | `/future-purchase` | Criar compra futura |
| PATCH | `/future-purchase/:id/add-value` | Adicionar valor à caixinha (debita do saldo) |
| PATCH | `/future-purchase/:id/remove-value` | Remover valor da caixinha (credita no saldo) |
| DELETE | `/future-purchase/:id` | Deletar compra futura (apenas se valueAdded = 0) |

**Body criar:** `{ "name": "string", "value": number, "valueAdded": number?, "dateAcquisition": "YYYY-MM-DD" }`

**Body add-value / remove-value:** `{ "value": number }`

---

### Detalhamento

Resumo financeiro detalhado por mês.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/details?month=&year=` | Detalhes do mês: receitas, despesas, gastos por categoria, projeções de dívidas |

**Retorno:** `period`, `summary` (recurringIncome, recurringPayments, debts, netExpected, totalExpenses, balanceAfterExpenses), `recurringIncomeBreakdown`, `recurringPaymentsBreakdown`, `debtsBreakdown`, `expensesByCategory`, `debtProjections`

---

### Projeção Anual

Projeção de recebimentos e gastos para o ano.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/details/projection?year=` | Projeção anual mês a mês |

**Retorno:** `year`, `monthly` (para cada mês: income, expenses, net), `totals` (annualIncome, annualRecurringPayments, annualDebts, annualHistoricalExpenses, annualProjectedExpenses, annualNet)

A projeção considera: entradas recorrentes, pagamentos recorrentes, parcelas de dívidas e média histórica de gastos (transações PAY/DEBIT de meses anteriores).

---

## Scripts

```bash
yarn dev          # Desenvolvimento com watch
yarn build        # Build de produção
yarn start        # Iniciar produção
yarn prisma:seed  # Popular banco com dados iniciais
```
