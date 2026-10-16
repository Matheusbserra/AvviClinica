# Regras de regressão do projeto

Regra solicitada pelo usuário: toda correção de bug ou comportamento quebrado deve incluir um teste de regressão.

- Crie ou atualize um teste que reproduza o problema relatado, usando o mesmo cenário e os mesmos resultados esperados. Quando possível, confirme que ele falha antes da correção e passa depois.
- Antes de entregar uma atualização, execute o teste da correção e os testes existentes das partes afetadas. Corrija as falhas relacionadas antes de considerar o trabalho concluído.
- Preserve os testes anteriores. Não remova verificações nem altere resultados esperados apenas para fazer um teste passar; mudanças de comportamento precisam corresponder ao pedido do usuário.
- Use dados fictícios e ambientes isolados nos testes. Não modifique pacientes, contas ou registros reais na nuvem para testar. Segredos devem vir de variáveis de ambiente e não aparecer nas saídas.
- Informe quais verificações passaram. Se alguma não puder ser executada, explique a limitação; não declare validação que não foi feita.

## Regressões essenciais do lançamento de procedimentos

- Preço e custo calculados pela quantidade antes de qualquer edição manual.
- Valor total editado preservado ao salvar, reabrir e recarregar, sem multiplicação adicional.
- Custo visível de cada produto acompanhando a quantidade e o resumo, sem multiplicação duplicada ao salvar.
- Valor recebido correspondendo aos pagamentos informados, incluindo descontos, pagamento dividido e zero.

Testes existentes para esses fluxos:

```text
node tests/procedure-entry-pricing.mjs
node tests/procedure-entry-total-ui.mjs
```

O teste de tela usa uma prévia local isolada na porta 3107 e a variável `AVVI_TEST_ADMIN_PASSWORD`.
