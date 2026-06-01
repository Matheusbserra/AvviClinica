# AVVI Clínica Web

Sistema web para gestão da AVVI Clínica, unindo agenda clínica, fechamento financeiro, recibos, procedimentos base, custos fixos e dashboard de performance.

## Como rodar

```bash
pnpm install
pnpm build
pnpm start
```

Em desenvolvimento:

```bash
pnpm dev
```

A aplicação roda por padrão em `http://localhost:3000`.

## O que foi implementado

- Agenda diária com calendário lateral, filtro de profissionais, busca, colunas por profissional e horários de 8h às 20h.
- Modal de agendamento com paciente, procedimento, profissional, status e ações operacionais.
- Lançamento de procedimentos com cálculo automático de custos, taxas, descontos, lucro base, valor da empresa e comissão profissional.
- Pagamento misto por múltiplos itens de pagamento.
- Exportação Excel dos lançamentos filtrados.
- Geração de recibo em PDF e histórico local.
- Cadastro e ativação/desativação de procedimentos base.
- Cadastro de custos com status, replicação mensal e parcelamento no crédito.
- Dashboard com resultado mensal, receitas, despesas, cards por profissional, metas e gráficos.
- Schema inicial para Supabase/PostgreSQL em `supabase/schema.sql`.
- Persistência local no navegador com `localStorage` para manter cadastros, edições, exclusões, agenda, lançamentos, custos e recibos após recarregar a página.

## Observação

Esta v1 está implementada como aplicação funcional com persistência local no navegador para validar fluxo, layout e regras. O próximo passo natural é conectar as telas ao Supabase usando o schema fornecido, autenticação e políticas RLS por perfil.
