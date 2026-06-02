# AVVI Clinica Web

Sistema web para gestao da AVVI Clinica, com agenda, financeiro, receitas, custos, pagamento profissional, cadastros, metas e dashboard.

## Supabase

O sistema usa persistencia real no Supabase via `@supabase/supabase-js`.

1. Crie o projeto no Supabase.
2. Execute `supabase/schema.sql` no SQL Editor.
3. Configure `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=sua_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon
```

Os dados sao salvos na tabela `avvi_records`, separados por entidade:

- `patients`
- `professionals`
- `procedures`
- `appointments`
- `financial_entries`
- `revenues`
- `fixed_costs`
- `receipts`
- `professional_receipts`
- `monthly_goals`

O schema tambem cria tabelas auxiliares para usuarios, prontuarios, observacoes e historico/auditoria.

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

A aplicacao roda por padrao em `http://localhost:3000`.

## Persistencia

Ao abrir o sistema, os dados sao carregados do Supabase. Se o banco estiver vazio, a aplicacao envia a base inicial/importada para o Supabase. Criacoes, edicoes, exclusoes, status, receitas, custos, agendamentos, procedimentos, pacientes, recibos e metas sao sincronizados automaticamente no banco.
