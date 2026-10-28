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
- `inventory`
- `services`
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

## Cadastro de Serviços

Em **Cadastros > Cadastro de Serviços**, cadastre ou edite nome, descrição, duração em minutos, categoria e preço. O preço pode ser fixo ou “A partir de”. Serviços desativados continuam nos agendamentos existentes e deixam de aparecer em novos agendamentos.

O catálogo inicial contém 99 serviços únicos do CSV `20261008180652_522b4dba_servicosDoEstabelecimento(in) (1).csv`, com os preços e durações reais. Duas repetições idênticas e as linhas vazias foram ignoradas. A importação automática adiciona apenas serviços ausentes, preservando cadastros e edições existentes.

Na agenda, selecione o serviço para preencher a duração. O agendamento guarda o serviço e o preço escolhido; alterações posteriores no catálogo não mudam o preço de agendamentos já salvos. Finalizar um agendamento não transforma o serviço em procedimento. Serviços e produtos têm cadastros e registros separados.

Serviços usam a entidade `services` na tabela `avvi_records`; não é necessária uma nova tabela SQL. Serviços e agendamentos também são preservados no navegador quando o Supabase não está configurado ou está indisponível. A sincronização segue a fila e o botão de retentativa existentes.

## Pós-procedimento

A data é escolhida em um campo simples, sem o calendário mensal do pós-procedimento. Os filtros de data, busca, profissional e etapa ficam na mesma barra das opções de período, reorganizando-se em telas menores. Os quatro indicadores superiores, a opção Todos pendentes e os três textos explicativos acima dos pacientes foram removidos. **Hoje** corresponde ao dia selecionado; **Atrasados** inclui somente os 7 dias anteriores, sem incluir o dia selecionado; **Próximos** inclui do dia seguinte até 7 dias depois. **Concluídos** mantém seu alcance completo. O teste `node tests/post-procedure-calendar-ui.mjs` cobre as fronteiras de ±7 dias, exclusão de ±8 dias, troca da referência pelo campo simples, a barra compacta e o calendário da Agenda preservado.

O bloco introdutório de descrição fica ao final da página, depois dos cartões dos pacientes, para priorizar os filtros e os contatos no início da tela.

Em **Operação > Pós-procedimento**, a agenda reúne **Hoje, Atrasados, Próximos e Concluídos**. É possível buscar paciente/serviço, filtrar profissional e etapa, abrir uma mensagem sugerida no WhatsApp e registrar situação, resposta, próxima tentativa e histórico. Abrir o WhatsApp não confirma envio: a equipe registra o resultado do contato. Os dias são corridos, calculados pela data de realização do atendimento, com referência diária no fuso de São Paulo.

**Editar mensagens** abre os textos das quatro etapas, preenchidos com os mesmos padrões anteriores. É possível editar, cancelar, restaurar o padrão da etapa selecionada e salvar. As variáveis `{primeiro_nome}`, `{paciente}`, `{procedimentos}`, `{data}`, `{profissionais}`, `{etapa}` e `{dias}` são substituídas nos links do WhatsApp e na mensagem sugerida do contato. `{primeiro_nome}` usa apenas a primeira palavra do nome, preservando acentos; `{paciente}` mantém o nome completo. A data corresponde à realização e os dias são calculados até a referência selecionada. Procedimentos do mesmo bloco continuam juntos em uma mensagem. O editor mostra uma prévia fictícia; não envia mensagens nem registra contatos. Apenas etapas alteradas são gravadas, preservando as demais configurações recebidas enquanto o editor estava aberto.

O utilitário `scripts/set-service-reactivations.mjs` faz backup local em `.avvi-local/backups`, confere alterações concorrentes e verifica a leitura após salvar. Use `--by-procedure` para os prazos por categoria descritos abaixo. O modo legado sem essa opção mantém a operação anterior de 180/365 dias apenas para compatibilidade; não representa a configuração atual solicitada. Testes isolados: `node tests/post-procedure-reactivation-defaults.mjs` e `node tests/service-reactivation-update.mjs`.

As mensagens usam `post_procedure_messages` na tabela compartilhada `avvi_records`, com os mesmos mecanismos de confirmação, recuperação de pendências e atualização por foco/salvamento. Não exigem migração SQL nem consulta periódica. Cópias antigas iniciam sem personalizações e usam os padrões. A API valida etapa, variáveis e texto não vazio de até 5.000 caracteres. Verificações: `node tests/post-procedure-messages.mjs`, `node tests/post-procedure-messages-ui.mjs` e `node tests/post-procedure-cloud.mjs` cobrem textos padrão, variáveis, agrupamento, descarte, restauração, recarga, acesso compartilhado, erros de gravação e permissões em dados isolados.

Os contatos são separados em quatro colunas sempre abertas, com contador e cores diferentes: **Primeiro contato** (azul), **Acompanhamento** (verde), **Resultado e satisfação** (violeta) e **Reativação** (âmbar). Todos os contatos do filtro aparecem na mesma página, sem limite de 30 nem paginação. Em telas menores as colunas se reorganizam, mantendo todas abertas. Cada cartão mostra quantos dias se passaram desde a realização até a data de referência, com singular/plural e indicação explícita quando o procedimento ainda não havia acontecido nessa referência. O teste `node tests/post-procedure-board-ui.mjs` verifica 160 contatos, colunas simultâneas, cores, contagem de 1/7/10 dias, filtros e adaptação ao celular/modo escuro.

Ao lado de **Sem telefone válido**, o botão **+** abre um formulário para preencher o telefone com DDD. Salvar altera somente o telefone do paciente, libera o WhatsApp em todos os seus contatos e usa a confirmação de salvamento já existente no topo. Cancelar não altera o cadastro. Para outro país, informe `+` e DDI; números brasileiros podem ser digitados com DDD e máscara. O usuário com Pós-procedimento tem uma exceção de escrita somente para esse campo de um paciente existente: a API preserva dados ocultos, rejeita mudanças em outros campos/criação/exclusão e impede que um formulário desatualizado substitua um telefone já válido. Não concede edição geral de pacientes nem exige migração SQL. Testes isolados: `node tests/post-procedure-phone.mjs`, `node tests/post-procedure-phone-ui.mjs` e `node tests/post-procedure-cloud.mjs`.

Dentro de cada coluna, procedimentos e atendimentos do mesmo paciente são reunidos em um único cartão pelo `patientId`. Pessoas com o mesmo nome não são misturadas. O contador da coluna mostra pacientes. Procedimentos da mesma data de realização e da mesma etapa formam um bloco com uma única data, dias decorridos, situação, Registrar contato e WhatsApp (ou aviso de telefone ausente). A mensagem reúne os serviços do bloco. Dias diferentes e etapas repetidas de acompanhamento/reativação continuam separados. Os prazos distintos dos serviços permanecem explícitos; sem reagendamento, salvar o contato mantém cada prazo. O registro atualiza em conjunto somente os itens listados no bloco, mantendo seus vínculos originais no banco e preservando outros dias/pacientes. O histórico agrupa uma mesma interação uma vez. Situações diferentes exigem escolha explícita antes de salvar; respostas antigas distintas são preservadas quando não editadas. O agrupamento acontece depois dos filtros. Verificações: `node tests/post-procedure-patient-groups-ui.mjs`, `node tests/post-procedure-day-contacts.mjs` e `node tests/post-procedure-day-contacts-ui.mjs`.

Em **Cadastro de Serviços > novo serviço ou lápis > Pós-procedimento**, configure primeiro contato, acompanhamentos, resultado/satisfação e reativações. Todos os serviços têm primeiro contato em 1 dia no padrão solicitado. Os prazos usam dias corridos: mês = 30 dias; ano = 365 dias. A identificação ignora maiúsculas e acentos. Glúteo/gluteus tem prioridade sobre outras categorias. As sugestões e a atualização em lote seguem esta tabela:

| Nome do serviço | Acompanhamento | Resultado e satisfação | Reativação |
| --- | --- | --- | --- |
| Preenchimento, exceto glúteo/gluteus | 25 | 120 | 300 |
| Botox / toxina botulínica | 10 | 30 | 150 |
| Bioestimulador | nenhum | 90 | 365 |
| Glúteo / gluteus | 30 | 90 | 365 |
| Lavien / Lavieen | nenhum | desativado | 30 |
| Fios / fios de PDO | 30 | 60 | 300 |
| Demais serviços | nenhum | desativado | 365 |

O controle **Ativar resultado e satisfação** permite desativar essa etapa sem usar dia zero. Planos anteriores sem `satisfactionEnabled` continuam gerando a etapa. **+ Acompanhamento** e **+ Reativação** mantêm a edição de múltiplas datas. O campo legado `reactivationDays` continua válido. Reativação é convite para avaliação, sem determinar nova aplicação. O comando `node scripts/set-service-reactivations.mjs --by-procedure` mostra a distribuição de serviços e mudanças previstas; adicionar `--apply` aplica os prazos solicitados com backup e confirmação. Reconfigura apenas o pós-procedimento dos serviços e habilita a fila para todos, sem alterar preços, duração, estado ativo/inativo, pacientes ou contatos salvos. Testes: `node tests/post-procedure-schedules.mjs` e `node tests/post-procedure-schedules-ui.mjs` verificam as categorias, prioridade glútea, primeiro contato universal, datas, etapas desativadas e edição/recarga.

São considerados atendimentos Compareceu/Finalizado ou com conta fechada, realizados até hoje. Os serviços do fechamento têm precedência sobre o agendado; venda de pacote não conta como realização, mas sessão consumida conta. Cancelados, reagendados, faltas e atendimentos futuros não entram. Serviços repetidos no mesmo atendimento geram uma etapa de cada tipo; sessões em atendimentos distintos mantêm seus próprios contatos. Alterações no plano também recalculam etapas pendentes de pacientes anteriores a partir da data original do procedimento, inclusive contatos já registrados sem reagendamento manual. Novas reativações valem para os atendimentos anteriores. Contatos concluídos preservam histórico/data; tentativas explicitamente reagendadas usam `rescheduled: true` e mantêm a data manual. O teste `node tests/post-procedure-reactivations-ui.mjs` verifica cadastro, remoção, recarga, prazos 60/90/120, aplicação retroativa e preservação do histórico. Queixas são encaminhadas à profissional sem aguardar o próximo prazo.

Os planos ficam no JSON de `services`; apenas os registros manuais de contatos são gravados em `post_procedure_contacts`, na tabela existente `avvi_records`, sem migração SQL. A fila é derivada dos atendimentos, sem gravações automáticas nem consultas periódicas. O salvamento valida somente os atendimentos/serviços referenciados, evitando baixar toda a agenda a cada contato. Usa a fila compartilhada de persistência, confirmação de nuvem e recuperação local existentes. Não depende da integração Meta nem envia mensagens automaticamente.

A permissão **Pós-procedimento** pode ser liberada por usuário em **Contas**; o administrador tem acesso. As permissões já existentes dos usuários padrão são preservadas. Uma conta somente com essa aba recebe nome/telefone, dados de identificação dos serviços e os vínculos necessários dos atendimentos, sem CPF, notas clínicas ou valores financeiros, e só pode gravar os contatos, os textos compartilhados das mensagens e preencher o telefone ausente/inválido sem alterar os outros campos do paciente.

Verificações isoladas: `node tests/post-procedure.mjs`, `node tests/post-procedure-cloud.mjs` e `node tests/post-procedure-ui.mjs` (prévia local na porta 3107). Cobrem prazos, reativação, validação, pacotes, cancelamentos, duplicidade, histórico e recarga, cadastro/edição de serviços, permissões, falhas de nuvem, celular e modo escuro. Testes não modificam pacientes ou registros reais.

## Estoque e fechamento de conta

Em **Operação > Estoque**, todos os procedimentos aparecem com sua quantidade. Use as setas para adicionar ou remover uma unidade, ou edite a quantidade diretamente. O saldo inicial é zero quando ainda não existe registro; o estoque permite quantidades negativas, exibidas em vermelho. Ao concluir o fechamento da conta, as quantidades dos procedimentos utilizados são descontadas automaticamente. Reabrir a mesma conta ajusta apenas a diferença; reduzir a quantidade ou remover um procedimento devolve as unidades correspondentes. Os saldos usam a entidade `inventory` da tabela `avvi_records`, além da persistência local existente.

Nos detalhes do agendamento, **Fechar conta** salva o agendamento e abre a cobrança. O serviço selecionado entra com o preço salvo. O botão **Serviços** adiciona serviços do cadastro à tabela de cobrança, com quantidades, preços e descontos editáveis. **Produtos** registra separadamente os materiais utilizados e as quantidades consumidas no estoque; esses produtos não entram na tabela de itens nem aumentam o valor cobrado. Marcar um pagamento preenche o saldo que falta; os valores podem ser divididos entre Pix, crédito, débito e as demais formas disponíveis.

O fechamento exige o pagamento completo ou a opção explícita de deixar o saldo como dívida. Recebimentos zerados continuam zerados. A conta e a receita ficam vinculadas ao agendamento; reabrir e fechar a mesma conta atualiza somente a cobrança e o consumo de estoque. Troco em dinheiro é descontado do valor registrado como recebido.

Na agenda, agendamentos aparecem em azul claro, confirmados e comparecimentos em verde, cancelados/faltas/reagendamentos em vermelho e finalizados em laranja. Contas concluídas recebem um check verde ao lado do paciente. A identificação do fechamento e as quantidades já baixadas ficam no registro do agendamento, inclusive após recarregar ou carregar do Supabase. O fechamento não exibe pontos de fidelidade e os detalhes do agendamento não exibem o seletor de procedimento opcional; dados históricos desses campos são preservados.

As alterações de uma mesma ação são enviadas em um único upsert à tabela `avvi_records`. O fechamento grava estoque, agendamento, lançamento e receita juntos. Em caso de erro, a fila mantém a alteração pendente e o botão de retentativa envia o mesmo conjunto, sem repetir a baixa de estoque. Exclusões explícitas continuam pela sincronização existente.

## Histórico de procedimentos e agenda compacta

No estoque, o botão **Histórico** ao lado da quantidade abre uma janela com data, profissional, quantidade utilizada e paciente, somente para o procedimento escolhido. Os registros são ordenados do mais recente para o mais antigo e paginados. O histórico usa as utilizações já gravadas nos agendamentos e os lançamentos financeiros anteriores ao controle automático, sem contar duas vezes o mesmo fechamento. Ajustes manuais de saldo não são exibidos como atendimentos.

A agenda ocupa a altura disponível na tela, mantendo os horários de 8h a 20h visíveis. O calendário e os filtros foram compactados. As colunas se ajustam à largura e os profissionais excedentes podem ser acessados pelas setas de páginas; quando há vários pacientes no mesmo horário, o botão `+N` abre a lista completa desse horário. Em telas pequenas, o calendário e os filtros abrem por um botão. Nomes e serviços longos têm o texto completo disponível ao passar o mouse ou abrir o agendamento.

Os serviços cobrados, pagamentos e produtos consumidos ficam em `appointments.closedAccount`, separados de `financial_entries`. Ao concluir uma conta com produtos, um lançamento de procedimentos é criado usando somente os produtos: quantidade utilizada, custo unitário registrado e `commissionPercent` do profissional. Os preços cadastrados são mantidos como ponto de partida, considerando as quantidades utilizadas e o desconto explícito da conta. Apenas a diferença entre esse total líquido e o recebido é dividida igualmente entre os produtos da lista, acrescentando ou reduzindo o valor de cada linha. O total líquido do lançamento corresponde ao recebido, inclusive em contas com dívida. O ajuste usa centavos e preserva o total exato; se uma redução zerar um produto, o restante é repartido entre os demais para evitar preços negativos. O lançamento pode ser editado normalmente. Reabrir ou alterar a cobrança não sobrescreve esse lançamento, e editar o lançamento não altera a conta nem o estoque. A receita do pagamento é registrada uma única vez pela conta; o lançamento gerado não duplica esse recebimento.

A lixeira ao lado de **Fechar conta**, nos detalhes e na janela de cobrança, exclui a conta, o lançamento de procedimentos gerado, a receita e a taxa de maquininha correspondentes. Devolve as quantidades consumidas ao estoque, estorna o crédito futuro utilizado e retorna o agendamento a **Agendado**, sem apagá-lo. O fechamento exige pelo menos um produto utilizado. Uma tentativa sem produtos mantém a conta aberta e informa o que falta; nenhum lançamento, recebimento ou consumo é registrado.

Contas antigas permanecem legíveis e mantêm seus valores. A separação ocorre somente ao confirmar novamente o fechamento: a cobrança anterior passa para o agendamento e o registro de procedimentos passa a conter exclusivamente os produtos. Nenhum cadastro ou lançamento manual é removido nessa conversão.

**Confirmação do salvamento:** depois de fechar a conta, a Agenda informa se está salvando, se o fechamento foi confirmado na nuvem ou se ainda é necessário tentar novamente. Fechar a janela de cobrança não comprova gravação na nuvem. Se a resposta HTTP se perder após a gravação, um usuário padrão pode reconhecer novamente os mesmos registros derivados já salvos, sem regravá-los, duplicar estoque ou ganhar permissão para alterar valores financeiros avulsos. Registros alterados por outro usuário continuam protegidos.

Regressões: `node tests/checkout-save-retry.mjs` valida repetição sem escrita e bloqueios financeiros; `node tests/agenda-cloud-saving-ui.mjs` reproduz perda da confirmação, atualização compartilhada, repetição, recarga e consulta pelo administrador. Com `AVVI_TEST_FULL_STANDARD=true`, usa as permissões do perfil padrão operacional completo; o padrão do teste preserva o cenário com acesso somente à Agenda. O teste usa nuvem simulada e uma sessão administrativa de teste (`AVVI_TEST_ADMIN_SESSION`) ou `AVVI_TEST_ADMIN_PASSWORD`, nunca registros reais.


## Menu do agendamento e consulta do fechamento

Clique no agendamento (ou use o botão direito) para abrir um menu pequeno abaixo dele, com uma animação suave. As ações são **Ver agendamento**, **Confirmado**, **Cancelado** e **Fechar conta** para contas abertas ou **Ver fechamento** para contas concluídas. Os detalhes só abrem pela ação **Ver agendamento**. Horários vazios continuam abrindo o formulário para agendar. As mesmas ações estão disponíveis para pacientes da lista de horários com vários agendamentos e em telas pequenas. O menu fecha ao clicar fora ou pressionar Escape, e admite navegação pelas setas do teclado.

**Ver fechamento** abre uma consulta sem campos editáveis: cliente, contatos, serviços, quantidades, preços, descontos, total a pagar, pagamentos por forma e bandeira, parcelas, total recebido, troco e eventual dívida. O botão **Produtos usados nos serviços** exibe as quantidades consumidas, sem editar ou baixar estoque novamente. A impressão contém somente os detalhes do fechamento. Fechamentos novos preservam o momento da conclusão e o troco, exibindo a data e hora no fuso de São Paulo. Consultas antigas continuam disponíveis com os dados já salvos.

## Follow Up no WhatsApp

Em **Operação > Follow Up**, crie regras por palavra-chave (contém ou mensagem exata, ignorando acentos), data e horário, antes da consulta, depois do atendimento finalizado ou intervalo após a última mensagem do paciente. Os quatro modelos são sugestões editáveis, salvas inicialmente pausadas. Horários usam São Paulo. Mensagens admitem nome, primeiro nome, serviço, profissional, data, hora e clínica.

**Simular atendimento** mostra a mensagem e o horário, inclusive para uma regra pausada, e registra o resultado como **Simulação**, sem chamar a API de envio. **Contatos** controla a autorização dos pacientes cadastrados e **Próximos contatos** mostra a programação. Mensagens de números desconhecidos não criam pacientes nem disparam respostas automaticamente. Rascunhos, autorizações e testes usam as entidades `followup_rules`, `followup_contacts` e `followup_logs` em `avvi_records`, com a persistência local e fila existentes. As novas entidades não substituem pacientes, agenda, estoque ou lançamentos antigos.

### Conectar o envio real

Anúncios que abrem o WhatsApp não comprovam uma conexão com a API. Esta implementação usa diretamente a **WhatsApp Cloud API da Meta**; para outro provedor será necessário adaptar o transporte e webhook. A prévia funciona sem credenciais, em modo de teste. Para execução real:

1. Execute **somente** `supabase/follow-up.sql` no banco existente. Cria a tabela privada `avvi_followup_runtime`, sem modificar os registros clínicos. Ela não permite acesso de `anon` ou `authenticated`; somente o servidor usa a chave `service_role`.
2. Configure as variáveis de `.env.follow-up.example` no servidor que executa Next.js. Preserve as duas variáveis públicas do Supabase já usadas pelo aplicativo. Nenhum token do WhatsApp ou chave `service_role` deve receber prefixo `NEXT_PUBLIC_` ou ser colocado no navegador.
3. Em `WHATSAPP_STAFF_USER_IDS`, informe os UUIDs dos usuários **Supabase Auth** autorizados a publicar e consultar envios. O servidor verifica o JWT com Supabase Auth e essa lista privada; não confia em permissões editáveis no navegador. O login local de demonstração não publica campanhas. O usuário deve possuir sessão Supabase real.
4. Cadastre o webhook HTTPS público `/api/follow-up/webhook` no aplicativo Meta e assine eventos `messages`. A verificação GET usa `WHATSAPP_VERIFY_TOKEN`; os eventos POST precisam de assinatura `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET` e do número correspondente a `WHATSAPP_PHONE_NUMBER_ID`.
5. Configure um agendador da hospedagem ou [Supabase Cron com pg_net e Vault](https://supabase.com/docs/guides/functions/schedule-functions) para executar **POST** em `/api/follow-up/process` a cada minuto, com `Authorization: Bearer <WHATSAPP_CRON_SECRET>`. Guarde a chave no serviço de segredos do agendador. O navegador não executa os disparos. Sem este agendador os contatos não serão enviados com o aplicativo fechado.
6. Confirme credenciais, número, versão Graph suportada e modelos aprovados. Defina `WHATSAPP_AUTOMATIONS_ENABLED=true`, verifique a conexão no painel, autorize os pacientes e **Publique automações** com um usuário autorizado. Cada publicação substitui o conjunto privado de regras e autorizações. Editar/pausar/excluir no painel modifica o rascunho; publique novamente para atualizar a execução na nuvem.

O histórico de envios reais é privado e exige o mesmo usuário autorizado. A conexão mostra o estado do servidor; os testes não comprovam entrega real nem aprovação de um modelo pela Meta. Fora da janela de 24 horas da última mensagem recebida, use um modelo aprovado; o texto livre é bloqueado se a janela expirou. A versão inicial suporta parâmetros de texto no **corpo** do modelo, em ordem; cabeçalhos, mídia, botões e parâmetros nomeados precisam de adaptação. O texto editável de um modelo é apenas sua prévia; a Meta envia o conteúdo do modelo aprovado.

Eventos de mensagem recebida atualizam a janela e os gatilhos por palavra-chave. Respostas `parar`, `sair`, `cancelar mensagens` ou `stop` bloqueiam contatos futuros, mesmo se o rascunho ainda indicar autorização. Uma nova autorização explícita precisará ser reconciliada no registro privado pelo administrador. Consultas canceladas, faltas e reagendamentos não geram lembretes. Consultas finalizadas podem gerar retorno; lembretes antigos com mais de cinco minutos de atraso são ignorados para evitar uma fila histórica ao ativar uma regra.

A fila possui IDs determinísticos e uma reserva condicional no banco para evitar disparos duplicados por eventos repetidos ou agendadores simultâneos. Antes do envio são conferidos regra publicada, autorização, telefone e agendamento. O servidor processa até 20 mensagens por rodada e registra falhas. Envios que falham ou ficam em `sending` após interrupção não são repetidos automaticamente, porque a API pode ter recebido a mensagem; confira o estado no provedor antes de reenviar. Nenhuma campanha, credencial, webhook ou agendador é ativado automaticamente por abrir a prévia.

Para verificar o motor e a integração sem rede real (Node.js com suporte a TypeScript):

```bash
node --experimental-strip-types tests/follow-up-engine.mjs
node --experimental-strip-types tests/follow-up-server.mjs
```

Os testes do servidor interceptam todas as chamadas HTTP, incluindo banco e Meta, e falham se surgir um destino inesperado. Não enviam mensagens reais.

## Editor visual de conversas

**Nova automação** e **Editar** abrem uma página de fluxo em **Operação > Follow Up**. O quadro possui blocos arrastáveis, conexões curvas, zoom, ajuste à tela, desfazer/refazer, duplicação e exclusão. O gatilho continua permitindo palavras-chave, horários e eventos da agenda. Regras antigas abrem com sua mensagem original e ganham um fluxo somente ao salvar no editor; nenhum cadastro é substituído.

Use **+** para adicionar **Mensagem**, **Espera**, **Condição** e **Encerrar**. Clique em um bloco para editar no painel. Arraste pelo corpo ou título de qualquer bloco, inclusive **Quando iniciar**, para mudar sua posição. Para conectar, puxe a bolinha de **Próximo** ou de uma condição e solte sobre o bloco de destino. Soltar em um espaço vazio abre a escolha do tipo de bloco e cria esse bloco já conectado naquele local. Também é possível clicar na bolinha e depois no destino, ou selecionar o destino pelo painel. **Esc** cancela o arraste ou a conexão; desfazer/refazer inclui as posições e conexões. Condições comparam a última resposta por conteúdo, igualdade ou começo da mensagem, ignorando acentos e maiúsculas. A primeira condição correspondente escolhe o caminho; **Outra resposta** define a alternativa. Para uma nova resposta, coloque uma **Espera > Uma resposta do paciente** antes da condição. A espera por tempo continua automaticamente pelo agendador; na prévia, **Avançar tempo de espera** testa essa continuação imediatamente. Destino vazio encerra o caminho.

Mensagens podem conter texto, imagem com legenda ou modelo aprovado. Imagens JPG, PNG ou WebP enviadas pelo editor são otimizadas em JPEG de até 1.200 pixels; ficam no próprio fluxo, junto ao registro no Supabase e à cópia local, inclusive após recarregar. Também é possível informar um link HTTPS público, que precisa ser acessível pelo WhatsApp. Cada imagem anexada admite até aproximadamente 400 KB após otimização, e cada fluxo até 2 MB em anexos; use links HTTPS para imagens adicionais. As mensagens com imagem têm legenda de até 1.024 caracteres.

**Salvar conversa** preserva a estrutura e posições em `followup_rules.flow`. O teste em **Prévia** mostra uma conversa sem envio real, aceitando respostas para percorrer todos os caminhos e exibindo imagens. Ele não dispara mensagens, nem altera agenda, estoque ou dados financeiros. **Salvar** modifica o rascunho; para atualizar uma automação em execução, publique o conjunto pelo Follow Up com a conexão configurada.

Para o processamento real, execute novamente `supabase/follow-up.sql` para acrescentar o índice que protege uma única conversa ativa por paciente. Os estados das conversas ficam na entidade privada `flow_runs`; cada mensagem possui registro próprio no histórico de envios. Webhooks com respostas de texto ou títulos de botões/listas retomam a etapa correspondente. Repetições do mesmo evento e agendadores concorrentes não repetem mensagens. Enquanto há uma conversa ativa, novos gatilhos para o mesmo paciente não iniciam outra conversa em paralelo. Alterar ou pausar uma regra publicada e revogar autorização cancela sua conversa ativa na próxima execução do agendador.

A publicação rejeita ciclos, destinos inexistentes e blocos desconectados. Fora da janela de atendimento, inicie com um modelo aprovado e aguarde a resposta do paciente antes de enviar texto ou imagem. Imagens anexadas são enviadas pelo servidor ao endpoint de mídia da [WhatsApp Cloud API](https://whatsappbusiness.com/blog/media-messages-via-app/) e usadas pelo ID retornado; URLs públicas são enviadas como links de mídia. Nenhuma credencial nova vai para o navegador. A prévia funciona sem credenciais, mas envios reais continuam dependentes da API, tabela privada, usuário autorizado e agendador descritos acima.

## Funil de conversas do Follow Up

**Operação > Follow Up** abre primeiro a aba **Conversas**, com cinco colunas vazias: **Leads de Entrada**, **Leads quentes**, **Leads frios**, **Agendamentos marcados** e **Pós-atendimento**. Não são criados leads de exemplo, nem a partir de pacientes existentes ou simulações. A aba **Automações** e o botão **Nova automação** mantêm o editor visual acessível.

Após configurar a conexão descrita acima, o webhook assinado cria um lead por telefone recebido, mesmo para quem ainda não é paciente. O nome vem do cadastro de pacientes ou do perfil do WhatsApp. Primeiro contato, última mensagem e datas ficam na entidade **leads** da tabela privada `avvi_followup_runtime`. Eventos repetidos não duplicam leads; mensagens antigas preservam o primeiro contato e não substituem a mensagem mais recente. Esses registros não ficam na tabela pública de cadastros da clínica. `/api/follow-up/leads` exige uma sessão Supabase de um usuário autorizado pela lista privada da equipe.

A classificação usa dias de calendário de **São Paulo**: primeiro contato hoje vai para entrada; de 1 a 7 dias, quente; após 7 dias sem agendamento, frio. Um paciente vinculado pelo cadastro ou telefone, com agendamento válido, vai para agendamentos marcados; conta fechada, para pós-atendimento. Quando houver vários agendamentos, o mais recente válido define a etapa. Cancelamentos, faltas e reagendamentos são desconsiderados. Uma nova consulta posterior a uma conta fechada volta a classificar o lead como agendado.

Arraste um cartão para outra coluna ou use sua seleção de etapa para movê-lo manualmente. A escolha é salva em **lead_stages** no Supabase privado e prevalece sobre a classificação automática; **Etapa automática** remove essa escolha. As conversas são atualizadas a cada 30 segundos e o quadro considera a passagem dos dias enquanto está aberto. Abaixo do funil há uma caixa de conversas no estilo WhatsApp Business: lista à esquerda e mensagens à direita. Clique em um cartão do funil ou na lista para abrir a conversa. A lista mostra todos os leads recebidos, mesmo quando já estiverem classificados nas colunas; arrastar da lista para uma coluna salva a mesma movimentação manual. Mensagens recebidas após a conexão ficam na entidade privada `messages`, e as respostas enviadas pelas automações são apresentadas a partir do histórico privado de envios. A consulta exige a sessão da equipe, atualiza a cada 15 segundos e carrega mensagens anteriores em páginas de 100. Leads gravados antes desta atualização continuam exibindo sua última mensagem disponível. Esta tela acompanha mensagens; o envio manual ainda não faz parte dela.

Teste sem rede real: `node tests/lead-funnel.mjs` verifica a classificação e os limites de dias, e `node tests/follow-up-server.mjs` verifica captura, duplicidade, acesso privado e movimentação. A prévia continua sem conexão real ou envio de mensagens.

## Vários serviços no agendamento

Nos detalhes do agendamento, o botão **+** ao lado de **Serviço** adiciona outro seletor. A lixeira remove somente o serviço adicional. A escolha atualiza a duração sugerida, que continua editável. Os serviços, nomes e preços escolhidos ficam em `appointments.services`; os campos antigos de um único serviço são preservados para compatibilidade. Agendamentos anteriores continuam legíveis, e contas já fechadas mantêm sua lista e valores originais. O fechamento de um agendamento aberto começa com todos os serviços selecionados. Produtos continuam separados e só baixam o estoque ao concluir a conta.

As abas do Follow Up ficam imediatamente abaixo do cabeçalho e mantêm sua posição ao trocar de seção. A navegação permanece visível enquanto a página rola.

`node tests/appointment-services.mjs` verifica compatibilidade e preservação dos serviços/preços salvos. Os testes de mensagens não consultam o banco real nem enviam mensagens.

## Estoque e brindes no fechamento

O título **Estoque de produtos** substitui somente a escrita anterior; os procedimentos, IDs, quantidades, histórico e regras existentes continuam no mesmo modelo. Em **Estoque**, as abas **Produtos** e **Brindes** separam as duas listas. Na aba Brindes, cadastre o nome, ajuste a quantidade diretamente ou pelas setas e edite o cadastro quando necessário. Os brindes começam vazios e ficam na entidade `gifts` de `avvi_records`, usando a mesma sincronização, cópia local e atualização em tempo real dos demais cadastros. Não é necessária uma alteração da tabela SQL existente.

O botão **+ Brindes** do fechamento permite selecionar um brinde e a quantidade entregue. Brindes não são cobrados, não entram na lista de serviços e não geram lançamentos de procedimentos ou comissão. Eles ficam no fechamento salvo e no **Ver fechamento**. A quantidade entregue é baixada somente ao concluir a conta; cancelar a janela não altera o estoque. O saldo pode ficar negativo, como no estoque de produtos. Reaplicar um fechamento movimenta apenas a diferença, e excluir a conta devolve os brindes e produtos consumidos. A exigência anterior de ao menos um produto utilizado continua valendo.

**Ver fechamento** usa o amarelo queimado padrão do aplicativo (`#b8862b`). A janela de detalhes do agendamento ficou mais larga e o campo de serviço ocupa toda a largura para facilitar a leitura.

`node tests/gifts.mjs` verifica consumo, saldo negativo, reaplicação sem duplicação, alteração de quantidade e estorno do estoque.


## Confirmação e recuperação do salvamento

A tela apresenta o **Status do salvamento**: carregando, salvando, confirmado na nuvem ou pendente. Os cadastros, agenda, contas fechadas, serviços, produtos, brindes, lançamentos, receitas, custos, recibos, metas e rascunhos do Follow Up usam essa confirmação. A prévia sem configuração do Supabase identifica que os dados ficam somente no navegador. Nenhum envio de WhatsApp foi ativado por esta alteração.

A cópia local guarda o estado atual e a última versão confirmada. Após falha ou recarga, o aplicativo reaplica somente as inclusões, alterações e exclusões pendentes sobre a versão atual da nuvem; registros não alterados localmente preservam mudanças feitas em outro navegador. Para o mesmo registro editado simultaneamente, a alteração local pendente prevalece. Pedidos em andamento não substituem uma cópia local mais recente. O retorno da rede, o botão **Tentar novamente** e tentativas automáticas a cada 15 segundos retomam o salvamento. Falha do armazenamento local é exibida sem impedir a tentativa de gravação na nuvem. Uma primeira conexão com falha também permite recuperar novas edições quando a consulta voltar a funcionar. A tela aguarda a primeira consulta antes de permitir edição, evitando substituir dados durante o carregamento.

Todos os perfis usam a mesma tabela `avvi_records`; permissões restringem as consultas e ações, sem criar bancos por usuário. Para reduzir transferência, a agenda não consulta mais a nuvem a cada três segundos. Abas visíveis do mesmo navegador recebem um aviso sem dados clínicos após um salvamento confirmado. Outros navegadores/computadores buscam as alterações ao voltar para a aba, recuperar a rede ou clicar em **Atualizar dados**. Abas em segundo plano não fazem essas consultas. A atualização aplica dados ao estado, sem recarregar a página ou limpar formulários abertos. Após publicar esta mudança, recarregue as abas antigas em todos os computadores para interromper os temporizadores da versão anterior. O tráfego já acumulado no ciclo das plataformas não é apagado pela otimização.

Anexar uma nota fiscal confirma tanto o envio ao armazenamento privado como o vínculo do PDF no atendimento antes de retornar sucesso. Essa gravação não depende do salvamento posterior do navegador. Alterações simultâneas são verificadas antes de gravar o vínculo; uma edição antiga de agendamento não remove a nota já salva. Falhas no vínculo são exibidas como erro e preservam o PDF anterior. A exclusão do fechamento continua revertendo a nota como antes.

Em **Nota Fiscal**, a lista é agrupada por mês/ano da data do atendimento. O filtro **Mês** funciona junto com busca, início/fim e status. O resumo e os subtotais mensais contam somente os atendimentos filtrados com PDF anexado (na nuvem ou na prévia local) e somam o valor de seus serviços, sem incluir produtos ou multiplicar pagamentos. Marcar apenas **Nota adicionada** não entra na soma. Notas excluídas ficam fora do resumo principal e podem ser consultadas na lista de anteriores/excluídas. **CPF inválido** é uma marcação manual por nota, salva no mesmo registro; tem prioridade visual vermelha sobre o verde, preserva o PDF e não altera o total. Desmarcar restaura a cor do status fiscal. Esses filtros e resumos usam os dados já carregados, sem consultas adicionais à nuvem.

Uma tentativa local de agendamento que conflita com um horário já ocupado aparece em **Agendamentos pendentes de revisão**. Ela e os efeitos do seu fechamento continuam na cópia local, mas não bloqueiam agendamentos/fechamentos independentes. Não são enviados à nuvem pacientes novos exclusivos dessa tentativa, seus lançamentos/receitas/taxas, consumo de produtos/brindes/disparos ou crédito correspondente. **Revisar horário** abre os dados preservados; **Descartar esta tentativa** pede confirmação e restaura somente os dados relacionados à versão já confirmada na nuvem. A aplicação não descarta essas pendências automaticamente. Consumos de pacote dependentes de uma venda pendente também aguardam revisão.

Ao recuperar um fechamento pendente, a baixa automática é recalculada sobre o saldo compartilhado atual, tanto para o usuário padrão como para quem também pode movimentar estoque. Ajustes manuais explícitos conservam seu comportamento. Isso evita repetir indefinidamente um saldo antigo rejeitado pelo servidor, inclusive após recarregar. Se o fechamento já foi gravado e apenas sua confirmação se perdeu, o consumo não é aplicado novamente. As permissões de estoque e financeiras do servidor permanecem ativas.

Regressões: `node tests/shared-agenda-recovery.mjs`, `node tests/shared-updates.mjs` e `node tests/agenda-cloud-saving-ui.mjs`. O último usa duas contas, servidor/API reais e Supabase simulado localmente; cobre pendência persistente por horário ocupado, recuperação sem apagar dados, salvamento independente, descarte confirmado, atualização de outras contas sem recarga e preservação de formulário. `AVVI_TEST_FULL_STANDARD=true` repete a verificação com as permissões usuais do perfil padrão. Nenhum desses testes altera registros reais.

As consultas carregam os registros em páginas de 500, incluindo bases com mais de 1.000 registros. Identificadores ausentes interrompem o salvamento em vez de gerar duplicações; requisições têm limite de 25 segundos. As inclusões/alterações relacionadas compartilham uma requisição, mas exclusões usam chamadas separadas; uma falha parcial permanece pendente para repetição. Isso não é uma transação única entre inclusão e exclusão, nem uma garantia absoluta contra falhas de rede, permissões, armazenamento cheio ou alterações simultâneas.

Testes: `node tests/persistence.mjs` verifica recuperação das 16 entidades e armazenamento local; `node tests/database.mjs` verifica paginação e falhas parciais. `node tests/persistence-ui.mjs` verifica falhas, recarga, reconexão e falta de espaço usando navegador e Supabase simulado, sem acessar o banco real. Esse teste requer Playwright e Chromium/Chrome; `PLAYWRIGHT_MODULE`, `CHROME_PATH` e `AVVI_TEST_URL` permitem indicar a instalação e a URL da prévia, compilada com `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3999` e uma chave de teste.

Os valores de custo dos procedimentos já salvos prevalecem sobre os valores iniciais do catálogo. Brindes são opcionais no fechamento; somente um produto utilizado continua sendo obrigatório.


## Contas, usuários e permissões

**Cadastros > Contas**, abaixo de Metas, permite aos administradores gerenciar usuários. Quando autorizada para um usuário padrão, mostra somente o resumo da própria conta e a opção de alterar sua senha. O login principal `admin` permanece fixo, com a mesma senha e acesso a todas as abas; não pode ser renomeado, rebaixado ou editado. O usuário existente `avviclinica` começa com os oito acessos anteriores. A tela permite criar usuários, editar nome/login/senha e escolher entre Administrador e Usuário padrão. Administradores adicionais têm acesso total; no perfil padrão, os checks definem as abas permitidas. O check Contas pode ser concedido ao perfil padrão, sem permitir gerenciar outros usuários ou alterar permissões.

As senhas dos usuários gerenciados podem ser visualizadas pelo administrador com o botão do olho, conforme solicitado. A senha do administrador principal permanece protegida e não é recuperável pela tela. As credenciais usam scrypt para autenticação e AES-256-GCM para proteger a cópia recuperável das demais senhas. Essa cópia fica somente na tabela privada `avvi_user_accounts`, acessada pelo servidor; não entra em `avvi_records`, em cópias clínicas locais ou em bundles do navegador. A resposta administrativa tem Cache-Control: no-store. Nenhum e-mail recebe automaticamente um perfil.

Sessões usam cookie assinado HttpOnly/SameSite=Strict, com validade de 12 horas. Cada requisição resolve as permissões atuais no servidor. Alterar senha, login, perfil ou checks incrementa a versão da conta e invalida suas sessões anteriores; a interface revalida a sessão ao voltar para a janela e a cada 30 segundos. O usuário precisará entrar novamente. Indicadores editáveis do navegador não concedem acesso. Cópias clínicas locais são separadas por usuário e versão de permissões; o administrador principal mantém sua chave antiga de cópia, preservando seus dados locais.

A API de dados verifica acesso às entidades e permissão de escrita independentemente das abas visíveis. Permissão de Relatórios libera os dados necessários para calcular os rankings, mas não autoriza editar lançamentos, receitas ou metas. Estoque/Agenda sem acesso financeiro recebem somente os dados necessários ao histórico. Fechamentos e estornos mantêm as exceções para os registros financeiros derivados da própria conta; derivados pendentes permanecem na recuperação local mesmo quando as abas financeiras estão ocultas. O Follow Up também verifica a autorização da aba nas sessões da clínica.

### Publicar Contas na nuvem

1. Preserve a URL e a chave pública do **mesmo** projeto Supabase utilizado pelo sistema. Preserve `AVVI_SESSION_SECRET` já configurada na Vercel; deve ter pelo menos 32 caracteres. **Mantenha esse valor estável:** ele também criptografa as senhas recuperáveis. Trocar a chave sem migrar as cópias criptografadas impede visualizá-las. Arquivos locais de configuração continuam ignorados pelo Git.
2. No SQL Editor do projeto existente, execute **somente** `supabase/accounts.sql`. Cria a tabela privada de contas e suas permissões, sem alterar ou apagar registros clínicos. Os dois logins anteriores continuam funcionando antes dessa preparação; Contas explica a configuração ausente e bloqueia alterações quando a tabela/chave administrativa não está pronta.
3. Na Vercel, configure `SUPABASE_SERVICE_ROLE_KEY` somente como variável do servidor, em Production. Nunca dê prefixo NEXT_PUBLIC_ a essa chave e nunca envie seu valor ao GitHub ou ao navegador.
4. Publique a versão. O gerenciamento de usuários ficará persistido no Supabase, incluindo edições no perfil existente. Não é necessário criar usuários em Supabase Auth para esses logins do sistema.
5. Para proteger também o acesso direto a `avvi_records`, configure `NEXT_PUBLIC_AVVI_PROTECTED_DATABASE=true`, publique/teste as rotas autenticadas e depois aplique `supabase/access-lockdown.sql`. As políticas antigas permitem acesso público com a chave anon até esse SQL ser aplicado. Essa restrição não foi aplicada automaticamente no banco real. A API protege seus endpoints independentemente, e os clientes da nova versão consultam/gravam através dela. Se esse SQL já foi aplicado anteriormente, mantenha as configurações existentes.

Na prévia sem Supabase e fora da Vercel, usuários de teste são guardados no arquivo privado `.avvi-local/accounts.json`, ignorado pelo Git. A tela identifica esse modo; criar um usuário nessa prévia não cria uma conta na nuvem. Não há fallback para arquivos locais num servidor Vercel ou numa conexão de nuvem com falha.

Testes: `tests/access.mjs`, `tests/accounts-server.mjs` e `tests/accounts-reports-ui.mjs` verificam os perfis, criptografia, criação/edição, exclusividade do administrador, checks, mudança de função e revogação de sessão. Os testes usam arquivos temporários e Supabase simulado, sem alterar pacientes ou usuários reais. `tests/persistence-ui.mjs` usa um servidor fictício local para testar falhas e recuperação da gravação através das rotas autenticadas.

## Relatórios e rankings

**Operação > Relatórios**, abaixo de Follow Up, reúne seis rankings: faturamento, ticket médio, quantidade de atendimentos e produtividade por profissional, além do Top 10 de produtos e Top 10 de serviços. Profissionais cadastrados, inclusive inativos e sem movimento, são exibidos; vínculos antigos com profissional removido são identificados. Os empates têm ordenação por nome. O administrador pode autorizar Relatórios para usuários padrão em Contas.

Escolha um mês completo ou um intervalo de início/fim inclusivos. As datas usam o dia registrado do atendimento, sem conversão para o fuso da máquina. A capacidade individual é 2 × quantidade de dias do intervalo, excluindo somente os domingos, inclusive para intervalos parciais e meses de 28/29/30/31 dias. A produtividade é atendimentos ÷ capacidade × 100%; valores acima de 100% permanecem visíveis quando há mais atendimentos que a capacidade prevista.

Atendimentos contam agendamentos Compareceu/Finalizado/com conta fechada, uma vez por agendamento, e lançamentos manuais antigos, uma vez por lançamento sem vínculo com um atendimento já contabilizado. Agendado, Confirmado, Cancelado, Faltou e Reagendado não contam como atendimento realizado. Faturamento usa o valor recebido no fechamento antes das taxas; nos lançamentos manuais anteriores, usa o cálculo de recebimento já existente. Contas com recebimento zero continuam zeradas. Ticket médio é esse faturamento dividido pelos atendimentos. O lançamento de produtos gerado pelo fechamento não duplica o recebimento ou o atendimento, mesmo que editado depois.

Procedimentos/produtos usam as quantidades consumidas no estoque pelo atendimento e lançamentos antigos independentes, sem duplicar o lançamento automático. Serviços usam as linhas do fechamento com suas quantidades; em comparecimentos/finalizações sem conta, usam os serviços do agendamento. Receitas antigas sem vínculo com profissional são indicadas separadamente e não distribuídas arbitrariamente. Os relatórios são somente leitura e não criam, alteram ou apagam dados.

`node tests/reports.mjs` testa cálculos, duplicação, preços/recebimentos, quantidades, estados, Top 10, datas, domingos, ano bissexto, períodos vazios e utilização acima da capacidade. `tests/accounts-reports-ui.mjs` verifica tabelas, filtros de mês/intervalo, navegação e largura de celular com dados fictícios.

## Foto dos profissionais na agenda

A foto adicionada na bolinha do Cadastro de Profissionais aparece também na bolinha ao lado do nome na Agenda. O upload atualiza o cadastro e o formulário de edição abertos; salvar os demais dados preserva a foto atual. O arquivo fica no campo existente `avatarDataUrl`, com o mesmo salvamento local e na nuvem. Sem foto, a inicial continua sendo exibida. O teste de acesso verifica upload, edição e recarga com um banco simulado.

## Relatório Profissional: detalhes individuais

Os cartões são ordenados pelo mesmo faturamento usado em Rankings: pagamentos do fechamento, contados uma única vez pela data do atendimento, mais os lançamentos avulsos pela sua própria data. Cópias vinculadas por ID de fechamento, lançamento gerado ou agendamento não são somadas novamente. Fechamentos sem produtos entram mesmo sem gerar lançamento. Para contas antigas sem métodos de pagamento salvos, o lançamento principal vinculado serve de base; pagamentos explicitamente zerados não recebem esse fallback. Custos e participação seguem o lançamento principal quando existe, com os mesmos cálculos de taxas, descontos, lucro, parte da empresa e parte do profissional. Nenhum registro salvo é alterado ou excluído por essa conciliação de leitura. O total pago e o progresso da meta permanecem visíveis. Lucro total, receita da empresa e valor recebido pelo profissional ficam ocultos inicialmente; “Ver valores financeiros” abre somente os valores do cartão. “Mostrar valores de todos” abre esses três valores em todos os cartões, sem abrir rankings. “Ocultar valores de todos” recolhe todos os valores financeiros.

Clique no nome/seta ou em “Ver rankings individuais” para abrir quatro Top 5 do profissional: serviços mais realizados, pacientes por faturamento, produtos mais utilizados e pacientes por quantidade de serviços. Pacientes são agrupados pelo identificador, inclusive quando têm o mesmo nome; vínculos com cadastro removido aparecem como “Paciente não cadastrado”. Registros sem paciente continuam nos totais financeiros, mas não são agrupados como se fossem uma única pessoa.

O faturamento por paciente usa a mesma base conciliada do total pago, inclusive quando só há fechamento na agenda. Editar uma cópia no lançamento de procedimentos não substitui o pagamento do fechamento no faturamento. Serviços são contados pelos itens do fechamento ou pelos serviços de agendamentos Compareceu/Finalizado; linhas antigas manuais contam apenas quando vinculadas explicitamente a um serviço. Quantidades de produtos não viram quantidades de serviços, e lançamentos vinculados a um fechamento não duplicam os serviços da agenda. Regressões: `tests/report-revenue-consistency.mjs` e `tests/report-revenue-consistency-ui.mjs` reproduzem a divergência de outubro e verificam duplicações, contas sem produtos, parcelas, dívida, datas, fallback antigo, projeção limitada e imutabilidade.

O filtro aceita mês completo ou intervalo inclusivo de datas; todos os rankings e valores respeitam o período. A permissão “Relatório Profissional” concede leitura dos cadastros e atendimentos necessários aos rankings, sem liberar edição ou acesso às outras abas. A mudança é somente leitura e não exige migração dos dados clínicos.

Validação: `tests/professional-reports.mjs` verifica cálculos, agrupamentos, Top 5, períodos, metas, registros antigos, separação produto/serviço e permissões; `tests/professional-reports-ui.mjs` verifica os controles independentes, filtros e layout de celular usando dados fictícios apenas no navegador de teste.

O painel de valores financeiros também mostra o ticket médio: total pago pelos clientes, sem duplicar cópias, dividido pela quantidade de pacientes com conta fechada no período. Cada paciente é contado uma vez por profissional e período, mesmo com vários fechamentos. Contas abertas e simples comparecimentos não entram no divisor. Registros antigos explicitamente marcados como conta fechada também entram; sem pacientes com conta fechada, o ticket fica em zero. Lucro usa verde, receita da empresa amarelo queimado e valor do profissional azul. Fotos usam a imagem atual do cadastro de profissionais nos dois relatórios.

A barra lateral ajusta a altura das opções à tela e exibe somente uma faixa pequena de identificação do perfil no rodapé, preservando as abas autorizadas e o botão Sair.

## Fechamento de avaliações e retornos

Quando algum serviço da conta contém “avaliação” ou “retorno” no nome, o fechamento permite não adicionar produtos. A identificação ignora acentos e diferenças de maiúsculas/minúsculas, inclusive avaliação estética e avaliação HOF. A regra acompanha os serviços atuais do fechamento: remover a avaliação/retorno remove a exceção. Nome de produto não libera essa regra. O preço e os descontos continuam editáveis; total a pagar zero permite fechar sem selecionar pagamento. Contas de outros serviços continuam exigindo ao menos um produto.

Sem produtos, o fechamento marca o atendimento como Finalizado, grava a conta e não cria um lançamento de procedimentos nem movimenta o estoque de produtos. Produtos ou brindes efetivamente utilizados mantêm suas regras de consumo. Se produtos forem adicionados, o lançamento de procedimentos segue a regra existente. Os registros são salvos pelo mesmo fluxo da agenda e não exigem migração dos dados existentes.

A aba Contas distingue chave pública indevida, chave de outro projeto, recusa da API, permissão negada e colunas incompatíveis. O diagnóstico não exibe chaves, senhas nem mensagens brutas do banco. Falhas na nuvem continuam bloqueando alterações; não há conversão automática para usuários locais.

Contas aceita a URL raiz do Supabase e configurações antigas terminadas em `/rest/v1/` ou `/auth/v1/`. Esses sufixos são removidos antes de criar o cliente, evitando duplicar o caminho da API (PGRST125) na consulta, gravação e autenticação dos usuários. O projeto e as chaves existentes são preservados.


Ultraformer MPT: nova aba em Operação com dez ponteiras (sete lineares e três Skin Booster), ícones vetoriais próprios e cores baseadas nas imagens da fabricante: https://classys.com/product/ultraformer-mpt/. Saldos começam em zero; editar a ponteira permite informar o saldo disponível, nome e cor. A seta abre registro de quantidade/data/paciente/profissional; o histórico conserva os nomes registrados. Saldo e utilizações ficam no mesmo registro `ultraformer_tips` da tabela existente `avvi_records`, com cópia local, recuperação de pendências e permissões pela aba Contas. Sem nova tabela, SQL ou variável de ambiente. Não interfere nos fechamentos da agenda nem no estoque de produtos. A permissão Ultraformer MPT pode ser concedida pelo administrador aos usuários desejados. Saldos negativos são exibidos em vermelho.

O histórico de disparos também exibe "Registrado por", com nome e login do usuário. Novas utilizações são identificadas pela sessão autenticada no servidor; tentativas de escolher outro autor são ignoradas. A autoria original permanece nos reenvios e ajustes de saldo. Registros legados sem autor exibem "Não informado".

Ultraformer MPT: tela compactada para exibir as dez ponteiras sem rolagem no desktop, com nomes apenas pela profundidade e "Booster" nas menores. Removidos filtros, descrições e botão de adicionar. Ícones e cores mantidos. O registro de uso abre uma janela, mantendo a lista compacta. A simplificação dos nomes antigos conserva os identificadores, saldos, histórico e autoria.

## Relatório profissional com acesso limitado

Em Contas, ao criar ou editar um usuário padrão com a aba Relatório Profissional autorizada, marque “Limitar a profissionais selecionados” e selecione um ou mais profissionais. Novas contas começam com essa limitação preparada; permissões completas já existentes são preservadas. O acesso limitado exibe os quatro rankings individuais, meta, total pago pelos clientes e ticket médio. Rankings de faturamento/lucro exibem a ordem e os pacientes, sem valores. Lucro total, receita da empresa e repasse profissional não são entregues ao navegador por essa consulta. Outras abas explicitamente autorizadas mantêm suas próprias permissões.

Antes de publicar esta alteração no projeto existente, execute `supabase/professional-report-access.sql` uma única vez no SQL Editor. Acrescenta apenas a coluna opcional `professional_report` na tabela privada de contas; não altera logins, senhas ou registros clínicos. Instalações novas usam `supabase/accounts.sql`, que já inclui esse campo. Não é necessário alterar variáveis do Vercel. O administrador principal continua protegido e com acesso completo. Mudanças de permissões revogam a sessão anterior do usuário.

A consulta limitada usa `/api/reports/professionals`, verifica a sessão e lê as permissões atuais no servidor, ignorando IDs de profissional enviados na URL. Na prévia sem Supabase, essa consulta demonstra os relatórios com dados de exemplo do servidor; em produção utiliza os registros existentes do Supabase. Testes: `tests/professional-report-access.mjs`, `tests/professional-report-access-ui.mjs` e `tests/accounts-server.mjs`.

## Cópia local quando o navegador fica sem espaço

O salvamento tenta o armazenamento antigo e usa IndexedDB automaticamente quando a cópia não cabe ou o armazenamento antigo está bloqueado. O usuário continua tendo uma chave separada por conta/revisão. Cópias antigas permanecem legíveis; a duplicata da mesma chave só é retirada após confirmar a gravação alternativa. Rascunho e base já sincronizada são preservados juntos, com gravações em sequência para evitar que uma operação antiga substitua a mais recente. A restauração consulta os dois locais e escolhe a cópia mais recente.

Falhas nos dois armazenamentos continuam sendo informadas. A falha da cópia local não impede a tentativa de salvar no Supabase; o indicador da nuvem permanece independente. Na prévia, o indicador aguarda concluir a cópia antes de dizer que foi salva. Não exige SQL ou novas variáveis do Vercel. Testes: `tests/browser-persistence.mjs` (limite real acima de 6 MB, isolamento, recarregamento e bloqueios) e `tests/persistence-ui.mjs` (falhas e recuperação com API simulada).


### Estratégias por profissional
A aba Estratégias, em Profissional, permite criar, editar e excluir objetivos por profissional com nome, período, meta numérica e plano de ação livre. Métricas automáticas: faturamento, pacientes distintos com conta fechada, quantidade de serviços, ticket médio e produtividade. Usam os mesmos critérios do relatório profissional; contas zeradas são excluídas. Produtividade considera dois pacientes por dia, exceto domingos. A opção Estratégia personalizada usa progresso registrado manualmente. Barras são limitadas visualmente a 100%, mas o valor e o percentual atingidos continuam visíveis acima da meta.

Objetivos são guardados na entidade `strategies` de `avvi_records` e participam do salvamento local, sincronização, recuperação de alterações pendentes e atualização remota. A nova categoria é normalizada como vazia em cópias antigas, sem alterar seus demais registros. Não exige SQL nem novas variáveis do Vercel. O administrador tem acesso; para liberar a outros usuários, marque Estratégias em Contas. Essa permissão permite gerenciar os objetivos, sem conceder leitura dos lançamentos financeiros, comissões, lucros ou dados de pacientes. O progresso desses usuários é calculado pela rota autenticada `/api/strategies/progress`, que retorna somente ID da estratégia e valor realizado. A rota de salvamento valida metas/profissionais e registra o autor pela sessão assinada.

Testes: `tests/strategies.mjs`, `tests/strategies-ui.mjs` e `tests/persistence.mjs` verificam os cálculos, períodos, contas repetidas/zeradas, validação, permissões, salvamento/edição, preservação de autoria, paginação, recuperação de cópias antigas e interface. Testes da nuvem usam rede simulada, sem alterações em produção.

### Seleção unificada de profissionais em Contas

No perfil padrão, **Acesso por profissional** reúne Relatório Profissional, Cadastro de Profissionais e Estratégias. Os checks de profissionais valem para as três abas, respeitando quais abas foram autorizadas. O relatório limitado mantém rankings, meta, total pago e ticket médio; lucro total, receita da empresa e repasse ficam ocultos. O cadastro continua sem comissão para usuários padrão. A agenda mantém sua própria visibilidade.

A seleção usa a coluna existente `professional_report`; a antiga `professional_registration` é espelhada quando disponível, sem exigir novo SQL ou variável do Vercel. Contas antigas com duas seleções diferentes usam a interseção até serem editadas, para não ampliar suas permissões. A seleção é preservada ao autorizar somente Estratégias. A API limita consultas, criação, edição, reatribuição, exclusão e cálculo do progresso aos profissionais permitidos. Cópias locais também são filtradas. Administradores mantêm acesso completo.

### Minha conta e progresso personalizado

O administrador pode liberar **Contas** para o perfil padrão. A API retorna somente o usuário autenticado, sem senha, hash, salt, senha criptografada, lista de usuários ou controles administrativos. A tela mostra nome, login, perfil e acessos; o botão **Alterar senha** pede senha atual, nova senha e confirmação. A rota privada `/api/accounts/password` não aceita ID/login/perfil/permissões no corpo e usa somente a identidade da sessão. A gravação muda apenas credenciais criptografadas e versão, preservando os demais campos. Atualizações simultâneas são recusadas pela versão; há limite de tentativas e validação de origem. A sessão deste navegador é renovada, outras sessões antigas são invalidadas e sua cópia clínica é preservada no novo identificador de versão. A credencial antiga lembrada pelo próprio navegador é removida. O administrador principal continua fixo. Não exige novo SQL ou variável de ambiente.

Estratégias personalizadas têm setas para aumentar ou diminuir o progresso em uma unidade diretamente no cartão. A barra se atualiza e participa do salvamento normal. O valor não fica negativo; a meta pode ser ultrapassada. O lápis continua disponível para editar os demais dados da estratégia.

Testes: `tests/own-account.mjs` verifica respostas privadas, identidade, permissões, senha, confirmação, tentativas, sessão, preservação de metadados, criptografia, concorrência e falhas na nuvem simulada. `tests/own-account-ui.mjs` verifica o check em Contas, a tela própria, troca de senha com preservação da cópia clínica e as setas com recarga.


### Serviços, pacotes, movimentações e grupos do menu

Cadastro de Serviços tem as opções Serviços e Pacotes. Mais serviços abre o cadastro em uma janela; o lápis usa a mesma janela para editar. Pacotes têm nome, descrição, serviços com quantidade e valor unitário, total dos itens, preço de venda, validade opcional em meses, comissão sobre venda e status ativo. Não há campo de valor fiscal. São guardados como `service_packages` na tabela existente `avvi_records`, com cópia local, sincronização, recuperação de rascunhos e atualização remota. Cópias anteriores recebem uma lista vazia, preservando seus demais registros. O cadastro exige a permissão Cadastro de Serviços; Agenda permite consultar os pacotes para usar no fechamento.

Mais pacote no fechamento inclui os serviços do pacote usando seu preço de venda, sem cobrar novamente os preços do catálogo. A distribuição preserva centavos exatos, quantidades e a identificação/validade/comissão do pacote naquele fechamento. Alterações futuras no catálogo não reescrevem contas fechadas. A comissão informada no pacote é usada para seus serviços; Paciente da clínica aplica a inversão existente. Serviços avulsos continuam usando a comissão cadastrada da profissional. Produtos usados continuam sendo registrados separadamente. Este cadastro não cria um sistema de sessões pré-pagas ou resgate de pacotes futuros.

Movimentações substitui a tela Receitas e consulta os fechamentos existentes. Permite filtrar ano inteiro, mês, intervalo, data do atendimento ou fechamento, profissional, paciente, descontos e crédito; expandir meses/dias; exportar CSV; e abrir o fechamento pelo ícone de lupa. Mostra serviços, pacotes, descontos, crédito guardado/utilizado, meios de pagamento, troco e total recebido. O fechamento, o lançamento derivado e a receita vinculada não são somados como três recebimentos. Histórico sem pagamentos informados não inventa valores recebidos. Receitas antigas sem fechamento vinculado continuam consultáveis como movimentações, com os campos efetivamente salvos. As datas de fechamento usam o fuso de São Paulo.

O menu lateral usa grupos recolhíveis: Operação (Agenda, Follow Up, Anamnese), Meu estabelecimento (Estoque, Ultraformer MPT), Profissional (Rankings, Relatório Profissional, Estratégias), Financeiro (Dashboard, Movimentações, Lançamento de Procedimentos, Pagamento Profissional, Recibos de Pagamento, Nota Fiscal, Custos) e Cadastros (procedimentos, serviços, profissionais, pacientes, Metas e Contas). Abre um grupo por vez e mostra somente abas autorizadas. Os identificadores de permissão Receitas e Relatórios são preservados; seus nomes visíveis passam a Movimentações e Rankings, inclusive em Contas.

Não exige novo SQL nem variáveis do Vercel. Publicação depende de enviar o código atualizado. Testes: `tests/packages-movements.mjs`, `tests/packages-movements-ui.mjs`, `tests/persistence.mjs`, `tests/checkout-invoices-ui.mjs`, `tests/own-account-ui.mjs` e `tests/strategies-ui.mjs`. Validação da nuvem utiliza fixtures isoladas e rede simulada; não altera a produção.

### Estoque e lista de notas fiscais

- Contas: o check **Permitir movimentação**, dentro de Estoque, libera ajustes de produtos e brindes. Desmarcado, o estoque é apenas consultado, com histórico disponível. Administradores têm acesso completo. A baixa e o estorno de consumo de um fechamento da Agenda continuam permitidos, com os valores conferidos no servidor. A permissão usa o identificador `Estoque: movimentação` no campo `tabs` existente; não é uma aba de navegação e não exige SQL novo. Contas padrão existentes começam sem a permissão de ajuste manual.
- Estoque de produtos: a lista inicial exibe nomes com bioestimulador, botox, combo, fios de PDO, enzimas, PDO espiculado, PDO multilaser, liala peeling/peel, preenchedor, preenchimento ou protocolo. **+ Produto** permite incluir outros itens do Cadastro de Produtos, preservando o saldo existente. A seleção `visibleInStock` fica nos registros de estoque existentes e sobrevive às baixas de consumo. Itens fora da lista permanecem salvos.
- Nota Fiscal: a lista principal começa nos atendimentos de **01/10/2026**. O corte é fixo, não muda a cada mês. **Excluir** retira o registro somente dessa lista; **Adicionar notas anteriores ou excluídas** permite restaurá-lo. A preferência `invoice.visibility` fica no agendamento, preservando o fechamento, o status fiscal e o PDF. Fechamentos zerados e os demais casos já excluídos não são oferecidos para restauração.
- Botões de inclusão usam o ícone + e o nome. Os botões Serviços, Pacotes, Produtos e Brindes do fechamento usam o amarelo queimado do sistema.
- Essas alterações não exigem migração no Supabase ou novas variáveis no Vercel; é necessário publicar o código atualizado para usá-las no sistema no ar.
- Validação: `tests/invoice-stock-access.mjs` e `tests/invoice-stock-ui.mjs`, além dos testes de contas, fechamento e pacotes.
- Movimentações: contagens abreviadas como `56 MOV.`; tabela compacta em painéis largos e valores em grade nos painéis menores, sem rolagem horizontal. Verificado de 320 a 1920 pixels de largura, preservando filtros, expansão de mês/dia, exportação e lupa do fechamento.

### Indicadores mensais do relatório profissional

Os indicadores agrupados em cada profissional mostram variação do ticket médio contra o mês anterior (somente percentual), quantidade de pacientes únicos atendidos no mês comparada ao mês anterior e pacientes novos para aquela profissional. A comparação usa somente o mês imediatamente anterior, inclusive na virada de ano; um mês sem pacientes elegíveis conta como zero. Retornos e avaliações fechados zerados ficam fora; contas repetidas do mesmo paciente não multiplicam a contagem. Pacientes atendidos e novos exigem conta fechada com valor positivo. As contagens clínicas separadas incluem pacientes únicos que realizaram avaliação e não fecharam outro serviço com aquela profissional no mesmo mês, e a quantidade de retornos realizados (incluindo os gratuitos). Agendamentos não atendidos, faltas e cancelamentos ficam fora dessas contagens; vínculos entre conta, agendamento e lançamento evitam duplicação. A quantidade de pacientes no mês anterior aparece ao lado da quantidade atendida; a seta usa a diferença entre essas duas contagens. Paciente novo é identificado pela primeira conta fechada com valor positivo com a profissional, independentemente de já ter consultado outra profissional. Pacientes sem identificação não podem ser classificados como novos. Alta em verde, queda em vermelho e ausência de comparação em cinza. Em intervalos de datas, o título identifica o último mês do intervalo; os indicadores continuam mensais e os totais/rankings mantêm o intervalo selecionado. A projeção de acesso limitado entrega os mesmos indicadores somente dos profissionais autorizados, sem lucro ou repasse. Não exige migração nem variáveis novas.

Validação: `tests/professional-insights.mjs`, `tests/professional-insights-ui.mjs`, testes existentes do relatório e de acesso limitado, TypeScript/build e ESLint.

### Recibos de pagamento com serviços

O recibo permite selecionar vários serviços do catálogo com busca por qualquer trecho do nome. Crédito Futuro fica disponível somente nas formas do recibo e pode ser emitido antes de escolher serviços. O PDF usa o logo da clínica, os nomes salvos dos serviços e paginação para textos extensos; recibos antigos continuam legíveis usando o campo procedure legado. Este cadastro de recibos documenta o recebimento e não altera automaticamente o saldo de crédito do paciente ou os lançamentos financeiros. Contas autorizadas apenas a Recibos de Pagamento recebem leitura do catálogo de serviços, sem permissão de edição. Não exige SQL nem novas variáveis. Verificação: tests/patient-receipts.mjs e tests/patient-receipts-ui.mjs.

Os recibos aceitam várias formas de pagamento, cada uma com seu valor, por exemplo Pix e cartão de crédito. O total é calculado pela soma em centavos e cada parcela deve ser positiva. A divisão fica salva no campo opcional payments e aparece no PDF, inclusive ao reabrir o histórico. Recibos antigos usam paymentMethod e amount como pagamento único. Não requer migração no Supabase.


### Ações no fechamento e ajustes rápidos na agenda

Ver fechamento oferece Excluir fechamento e Estorno para contas com acesso à Agenda. Estorno abre o fechamento preenchido para edição; abrir ou cancelar não altera o registro. Excluir usa a reversão já existente de lançamentos, estoque, brindes, crédito e nota fiscal, preservando o agendamento e a proteção contra crédito já utilizado. Nos detalhes do agendamento, o lápis ao lado de Histórico edita o cadastro do paciente em uma janela; o salvamento preserva saldo de crédito, fotos e demais dados fora do formulário.

A borda inferior do agendamento tem uma alça visível ao passar o mouse sobre ela, para ajustar a duração em passos de 30 minutos. Setas para cima/baixo também funcionam quando a alça está focada; Escape cancela o arraste. A agenda impede sobreposição, ausência e turno fechado. O ajuste mantém serviços, contas, estoque e status. Em blocos do mesmo paciente com vários agendamentos, só o término do último é ajustado. Ausências consecutivas aparecem em um único bloco com um rótulo; remover a ausência remove esse bloco. Horários fechados por turno ficam somente em azul claro. Não exige SQL nem variáveis novas. Validação: tests/checkout-invoices-ui.mjs, tests/agenda-resize-ui.mjs, tests/agenda-availability.mjs e tests/agenda-groups.mjs.


### Menu compacto e visualização de cancelados

A navegação desktop começa recolhida, com 72px e ícones dos cinco grupos autorizados. Clicar no ícone expande a barra para 256px, mostrando nomes e abas; somente o botão de seta volta ao modo compacto. Trocar de aba ou clicar no mesmo grupo mantém a barra aberta. A área principal acompanha a largura, liberando espaço para a agenda. As permissões existentes e a navegação móvel são preservadas.

Na Agenda, agendamentos com status Cancelado ficam ocultos por padrão. A bolinha vermelha e o texto Cancelados na legenda alternam sua exibição, inclusive nos filtros móveis. É apenas um filtro de visualização: os dados, fechamentos e regras de disponibilidade existentes são preservados. Faltou e Reagendado continuam visíveis. Testes: tests/sidebar-cancelled-ui.mjs e tests/agenda-groups-hover-ui.mjs.


### Anamnese facial e corporal por profissional

O Cadastro de Profissionais oferece Modelo de anamnese: Facial ou Corporal. Sem configuração, o modelo continua facial. Uma nova ficha usa a preferência do profissional; cada ficha salva conserva seu próprio modelo, mesmo que a preferência mude depois. Fichas antigas sem template continuam faciais. O servidor valida campos, opções e modelo, mantém autoria e impede trocar o modelo ou os vínculos de uma ficha existente.

O formulário corporal incorpora as três páginas da ficha fornecida, organizado em Dados e hábitos, Antecedentes e declaração, Avaliação corporal, Medidas e acompanhamento e Sessões e relatório. Opções são caixinhas, áreas de escrita são digitáveis, a figura corporal aceita marcações e há campos de medidas inicial/meio/última e 12 sessões. Fotos, histórico por profissional, edição e PDF ficam disponíveis como na facial. Na declaração corporal, fica somente a assinatura do paciente; dados da empresa e assinatura do esteticista não aparecem. As 12 sessões mantêm apenas a data, sem visto do paciente, e os quatro campos do Histórico do paciente usam entradas de uma linha. Respostas antigas desses campos retirados continuam válidas ao editar uma ficha, mas ficam ocultas no formulário e no PDF. Os registros usam os campos opcionais anamneseTemplate no profissional e template na ficha, no JSON já existente; não exige SQL nem variáveis novas. Verificação: tests/body-anamnese-ui.mjs, tests/anamnese-cloud.mjs e tests/anamnese-history-ui.mjs.


### Ultraformer no fechamento de conta

Ao lado de + Brindes, + Ultraformer permite buscar a ponteira e registrar os disparos usados, incluindo várias ponteiras no mesmo fechamento. O consumo é salvo ao confirmar a conta, com paciente, profissional e usuário responsável, e aparece no histórico do Ultraformer e em Ver fechamento. Disparos não adicionam cobrança: o preço vem dos serviços. Um serviço com disparos registrados pode ser fechado sem adicionar um produto fictício.

Reabrir ou cancelar a edição não consome disparos; salvar novamente reconcilia a quantidade sem duplicação, e excluir o fechamento devolve somente os disparos vinculados àquela conta. Registros manuais e demais contas são preservados. A Agenda carrega as ponteiras para este fluxo; contas padrão podem ajustar somente a utilização vinculada ao fechamento, validada no servidor. O saldo base das ponteiras continua editável apenas pelo administrador. Os novos campos ficam no JSON existente, sem SQL ou variáveis adicionais. Verificação: tests/checkout-ultraformer-ui.mjs, tests/ultraformer.mjs e tests/ultraformer-cloud.mjs.

O formulário de Lançamento de Procedimentos não exibe mais o campo Observações do lançamento. As observações específicas do fechamento e do agendamento permanecem separadas.


### E-mail e gênero no agendamento

Novo evento e Detalhes do agendamento incluem E-mail e Gênero junto dos dados do paciente. Selecionar um cadastro preenche ambos; salvar um novo paciente grava os campos, e salvar um paciente já cadastrado atualiza apenas esses dois campos, preservando crédito, fotos e os demais dados. A edição pelo lápis mantém o formulário sincronizado. O e-mail é opcional e sua validade é conferida tanto para salvar o agendamento quanto para abrir o fechamento; o fechamento imediato recebe o contato recém-digitado. Não exige SQL ou variáveis novas. Teste de regressão: tests/appointment-patient-details-ui.mjs.


### Valor total editável no lançamento de procedimentos

Valor total do produto começa com preço do catálogo × quantidade. Uma edição explícita substitui esse total, sem multiplicá-la novamente pela quantidade; o custo continua sendo custo unitário × quantidade. O total editado permanece ao salvar, reabrir, recarregar e ajustar a quantidade. Selecionar outro produto retorna ao cálculo automático do catálogo. Registros antigos mantêm os cálculos existentes. O campo opcional totalPriceOverride identifica a edição, enquanto servicePrice guarda o valor unitário equivalente, sem arredondar divisões intermediárias; os relatórios e o banco continuam usando a estrutura existente.

Alterar apenas custo, comissão ou quantidade de um item com total editado preserva os pagamentos. Quando o total ou desconto muda, a primeira forma de pagamento considera as demais formas para não duplicar valores. O catálogo permanece intacto. Não exige SQL nem novas variáveis. Regressão: tests/procedure-entry-pricing.mjs e tests/procedure-entry-total-ui.mjs; o teste de tela reproduziu a cobrança duplicada antes da correção.


O campo Custo médio de cada produto no lançamento também mostra o custo total daquela linha, acompanhando a quantidade e o resumo. Ao editar esse custo total, o sistema mantém internamente o custo unitário equivalente; salvar e reabrir não multiplica o custo uma segunda vez. Alterações de quantidade continuam aumentando ou reduzindo o custo exibido, sem alterar um valor de venda editado. Os testes de regressão de precificação e de tela cobrem o custo visível, o resumo, edição, centavos e recarregamento.


O resumo do lançamento inclui Valor recebido, calculado pela soma das formas de pagamento informadas, inclusive pagamentos divididos. O desconto já está aplicado no valor devido e não é abatido outra vez desse indicador. Pagamentos explicitamente zerados mostram R$ 0,00. A grade se adapta para acomodar o novo indicador sem rolagem horizontal. A regressão de tela cobre pagamento dividido, desconto e pagamento zero.

### Busca de produtos no estoque

A janela de + Produto reserva espaço para a busca e mantém a ação de adicionar no rodapé. Os resultados aparecem no fluxo da janela, com rolagem própria e nomes completos, sem ficarem cortados pelo contêiner. A opção `inlineResults` do seletor é usada somente nesse cadastro. Regressão: `tests/inventory-product-picker-ui.mjs`, com nomes longos, busca por trecho e sem acentos, seleção por mouse/teclado, saldo preservado e cinco tamanhos de tela, incluindo celular em paisagem.

### Agenda e salvamento por perfil

A agenda admite até três pacientes simultâneos com profissionais diferentes. Sobreposição na mesma profissional continua bloqueada, assim como turnos fechados e ausências. O limite considera os blocos de meia hora ocupados em cada instante, não a quantidade total de agendamentos que intersectam um atendimento longo; ausências e cancelamentos não consomem a capacidade da clínica. Criar, mudar duração/horário e reativar cancelamentos usam a validação na tela e no servidor. Editar dados de um agendamento existente não revalida horários históricos que já estavam salvos.

Após falha na primeira conexão, a cópia de trabalho e sua referência de sincronização são restauradas com as mesmas permissões. Isso impede que custos ou lançamentos iniciais, alheios à Agenda, gerem alterações proibidas e bloqueiem o salvamento de um usuário padrão. A cópia pendente mais recente é preservada nas novas tentativas de conexão.

Salvar uma edição de agendamento também conserva os metadados e o caminho do PDF da nota fiscal já vinculada. A regressão reproduz a perda desse vínculo antes da correção e verifica sua preservação depois.

Regressões: `tests/agenda-availability.mjs`, `tests/professional-registration-access.mjs` e `tests/agenda-cloud-saving-ui.mjs`. O último sobe uma prévia isolada na porta 3119 e um Supabase simulado na 3997, passando pelo login, API e SDK reais com pacientes fictícios. Confere agendamento, fechamento, pagamento dividido, taxa, brinde, crédito, edição, estorno, falha/repetição e recarregamento em perfis padrão e administrador. Requer Playwright/Chrome (`PLAYWRIGHT_MODULE` e `CHROME_PATH`, quando fora do padrão) e `AVVI_TEST_ADMIN_PASSWORD`; não usa dados ou credenciais da nuvem real. Não há SQL ou variável nova para publicar estas alterações.

### Agenda compartilhada entre usuários

A clínica utiliza uma única agenda em `avvi_records`, compartilhada por todas as contas autorizadas à Agenda. Usuário e revisão identificam somente as permissões e a cópia de recuperação no navegador. Agendamentos não são separados por usuário.

Sessões abertas consultam as alterações pelo gateway autenticado a cada 10 segundos, também ao voltar à janela, exibir a aba ou recuperar a conexão. A atualização funciona para contas padrão e administradores com o banco protegido, sem depender de uma assinatura Realtime com a chave pública. Um ETag privado por usuário e pelos identificadores/datas dos registros permite retornar 304 quando não houve alterações. A leitura de metadados é paginada e detecta exclusões; as categorias completas são consultadas somente quando a revisão muda. Campos e profissionais restritos seguem a mesma projeção das leituras individuais.

Leituras e salvamentos compartilham a fila para evitar que uma consulta anterior restaure dados antigos depois de um salvamento. A reconciliação reaplica somente edições locais pendentes sobre os dados recebidos, preserva registros de outras contas e incorpora exclusões sem reenviá-las como alterações locais. Falhas de atualização mantêm os dados na tela e exibem um aviso, com nova tentativa automática. A prévia sem Supabase permanece isolada no navegador; para compartilhar entre dispositivos, todos devem usar a mesma instalação e projeto Supabase.

Regressões: `tests/agenda-cloud-saving-ui.mjs` mantém duas sessões independentes abertas e verifica novas marcações nos dois sentidos, fechamento/reabertura, registros remotos durante falha de salvamento e exclusão remota sem ressurreição. `tests/professional-registration-access.mjs` verifica autenticação, escopos, comissão oculta, respostas condicionais e paginação da revisão; `tests/database.mjs` verifica 304 e falhas de leitura. Não exige migração SQL nem novas variáveis.

### Busca geral por palavras-chave

Os campos com lupa usam uma única regra de busca em qualquer posição do nome, para todos os itens do catálogo. Serviços, produtos, pacotes, pacientes e ponteiras ignoram maiúsculas/minúsculas, acentos e espaços extras. Quando há várias palavras, todas devem existir no nome, em qualquer ordem: `labial` encontra `Preenchimento labial` e `olheiras preenchimento` encontra `Preenchimento de olheiras`. A busca não depende de termos cadastrados manualmente nem de exemplos específicos. Os filtros de disponibilidade e as permissões de cada campo são preservados. Testes: `tests/search.mjs`, `tests/checkout-invoices-ui.mjs` e `tests/inventory-product-picker-ui.mjs`.

### Retorno à agenda com todos os profissionais

O filtro de profissional da agenda pertence somente à própria tela e começa em Todos a cada entrada pelo menu. Filtrar profissionais no dashboard ou nas telas financeiras não afeta mais as colunas da agenda; filtrar temporariamente a agenda também não altera o filtro dessas outras telas. Permanecem respeitados Mostrar na agenda e a paginação responsiva de profissionais. O teste `tests/agenda-return-professionals-ui.mjs` reproduz a falha anterior ao filtrar o dashboard e voltar à agenda, além de verificar retorno após filtro local, navegação móvel, perfil padrão e profissionais ocultos. Usa somente dados fictícios na prévia isolada 3107 e requer `AVVI_TEST_ADMIN_PASSWORD`.

### Agendamentos em datas passadas e horários cancelados

Datas passadas permitem novos agendamentos. Um agendamento cancelado permanece no histórico e no filtro de cancelados, mas libera o horário para outra marcação e para ausências. A mesma validação vale no navegador e na API; reativar um cancelamento verifica novamente conflitos, turnos fechados e capacidade da clínica. O menu Novo agendamento abre o formulário com o intervalo selecionado mesmo se outro usuário ocupar o horário durante a seleção; nesse caso, salvar apresenta o conflito antes de criar paciente ou agendamento.

Regressões: `tests/agenda-availability.mjs`, `tests/past-appointments-ui.mjs` (prévia isolada 3107) e `tests/agenda-cloud-saving-ui.mjs` (Supabase simulado). Cobrem abertura do formulário em horário cancelado oculto, datas de 2025/2026, salvamento e recarregamento com perfis padrão e administrador, sincronização entre usuários e conflito surgido com o menu aberto. Nenhum registro real é utilizado.

Com Cancelados desligado, a agenda mostra somente a marcação ativa, com largura inteira. Ao ligar o filtro, cancelamentos que sobrepõem outra marcação recebem cartões independentes lado a lado na mesma profissional, com seus horários, menus e cores. A organização é apenas visual: não altera status, histórico nem as validações de reserva. Cancelamentos não ocupam vaga; reativá-los continua exigindo horário livre. Regressões: `tests/agenda-groups.mjs` e `tests/agenda-cancelled-overlap-ui.mjs`, incluindo várias sobreposições, horários parciais, desligar/religar, recarregar, conta padrão e celular.

### Busca nos serviços do agendamento

O primeiro serviço e todas as linhas adicionais usam o mesmo campo com lupa e busca digitável por palavras-chave, sem distinção de acentos ou maiúsculas. Preços e indicação de serviço inativo já selecionado continuam visíveis. Selecionar, trocar, limpar e remover serviços mantém o cálculo da duração e os dados salvos de cada linha. A regressão `tests/appointment-services-search-ui.mjs` cobre várias linhas independentes, seleção por teclado/mouse, termos fora do início do nome, gravação/reabertura, serviços inativos preservados e uso no celular com perfil padrão. Os testes anteriores de duração, agenda, dados do paciente e salvamento compartilhado continuam exercitando suas verificações com os campos digitáveis.

### Saldo de fechamento como dívida

O controle Deixar o restante como dívida permite concluir um fechamento com pagamento parcial ou sem pagamento. Começa desligado em contas novas e ligado ao editar um fechamento com saldo pendente. O saldo é persistido em `closedAccount.balanceDue`, aparece em Ver fechamento e é recalculado ao ajustar os pagamentos; apenas o valor recebido compõe a receita. A opção de guardar excedentes como crédito permanece independente. Não exige migração SQL. Regressões: `tests/checkout-debt-ui.mjs` cobre desconto, pagamentos divididos, persistência, edição/quitação, crédito preservado, estoque sem baixa duplicada e perfil padrão; `tests/agenda-cloud-saving-ui.mjs` verifica gravação pelo gateway protegido e exibição do saldo ao administrador. O teste `tests/zero-dashboard-cpf-ui.mjs` continua garantindo que retornos zerados fecham sem pagamento ou ativação da dívida.

### Sessões de pacotes já pagos

No cadastro e edição de pacotes, Sessões é a quantidade de cada serviço incluído. No fechamento, + Pacotes oferece Vender pacote ou Usar pacote já pago. A segunda opção apresenta somente compras quitadas do próprio paciente, com saldo por serviço e validade da compra; o serviço correspondente sai da cobrança atual. É possível registrar produtos e disparos realmente usados, sem gerar outro recebimento pela sessão. Vender somente o pacote não exige consumo antecipado de produtos. O resumo do fechamento mostra quais sessões foram utilizadas.

O saldo é calculado das cópias salvas nas vendas e dos usos nos fechamentos. Alterar ou desativar o catálogo não altera o que o paciente já comprou. Editar uma utilização devolve apenas seu próprio saldo para conferência; excluir seu fechamento devolve sessões e estoque. Não é permitido excluir ou tornar insuficiente/não quitada uma venda que já possui sessões usadas. Pacotes vendidos antes desta atualização também são reconhecidos pela quantidade de seus serviços.

**Salvamento online:** vendas e utilizações ficam no próprio fechamento, na tabela `avvi_records` já existente. Não é necessário executar `supabase/package-sessions.sql` para usar pacotes. O gateway mantém as permissões e utiliza um registro interno de coordenação, com proprietário exclusivo e prazo de cinco minutos, para reler o saldo antes de gravar alterações concorrentes. O registro não aparece nos dados dos usuários; é liberado ao terminar e recuperado condicionalmente se o servidor for interrompido. A chave privada `SUPABASE_SERVICE_ROLE_KEY`, já usada pelo gateway protegido, continua necessária. Se a função opcional de `package-sessions.sql` já existir, ela é aproveitada nos fechamentos compatíveis para gravar o lote inteiro em uma transação; sem ela, usa-se a mesma persistência CRUD dos demais fechamentos, com alterações pendentes e repetição em caso de falha. Esse caminho não transforma várias requisições REST em uma transação de banco.

**Primeira sessão na venda:** depois de adicionar o pacote ao fechamento, use **Consumir uma sessão** ao lado do serviço em **Pacotes nesta conta**. Cada clique consome uma sessão daquele serviço, sem reduzir o preço da venda. A cobrança avulsa correspondente é substituída pela sessão; o pacote precisa estar integralmente pago para confirmar a utilização. Reabrir ou salvar novamente mantém o consumo existente. Produtos efetivamente usados continuam com sua baixa normal no estoque.

Testes: `node tests/package-sessions.mjs`, `node tests/package-sessions-ui.mjs` e `node tests/package-sessions-cloud.mjs`. O teste de tela usa a prévia 3107 e `AVVI_TEST_ADMIN_PASSWORD`. O teste de nuvem usa a API real contra PostgreSQL isolado em memória (PGlite), incluindo permissões, salvamento sem função SQL adicional, instalação opcional idempotente, concorrência de consumos, repetição, validade, primeira sessão na venda e rollback da função opcional; não acessa a nuvem real. Prepare somente a dependência isolada de testes com `npm install --prefix .avvi-local/package-session-tests --no-save @electric-sql/pglite@0.5.10 --ignore-scripts --no-audit --no-fund`, ou informe `AVVI_PGLITE_MODULE` com o módulo instalado. As verificações anteriores de pacotes/movimentações, descontos, crédito, dívida e lançamento de procedimentos são preservadas.


## Laboratório local de WhatsApp e IA para o vídeo da Meta

Abra **Operação > Follow Up > Testes WhatsApp**, usando o administrador na prévia local. A aba depende de `AVVI_WHATSAPP_LOCAL_TEST=true` no servidor e fica desabilitada quando `VERCEL` está definida, mesmo que a opção local esteja ativa. As rotas de configuração exigem sessão administrativa, origem correspondente e hostname local. Nenhuma credencial deve ser enviada pelo chat ou incluída em variáveis `NEXT_PUBLIC_`.

Os testes usam somente um destinatário autorizado e um agendamento de demonstração. Não consultam nem alteram pacientes, agenda, estoque ou financeiro reais. A configuração, o histórico, a autorização e o controle de atendimento ficam em `.avvi-local/whatsapp-lab/state.json`, ignorado pelo Git, sem exigir nova tabela ou SQL no Supabase. Token Meta, segredo do app e chave OpenAI não são devolvidos pela API nem gravados no armazenamento do navegador. Os campos de senha são limpos depois de salvar. O arquivo local contém segredos e deve permanecer no computador autorizado.

### Configuração e prévia

1. Se a prévia não estiver ativa, execute `powershell -File scripts/start-whatsapp-lab.ps1`. O script inicia os processos ocultos, preserva uma prévia já existente na porta 3108 e mantém o aplicativo sem conexão com os dados reais do Supabase. Se a porta já estiver ocupada por uma prévia sem a opção local, reinicie esse processo com `AVVI_WHATSAPP_LOCAL_TEST=true`.
2. Na Meta, abra o app → Casos de uso → Conectar no WhatsApp → Configuração básica → Etapa 1: Experimente / Configuração da API. Gere o token temporário, copie o ID do número de teste e autorize seu próprio telefone como destinatário. O ID do número é diferente do telefone exibido.
3. Em **Configuração** no laboratório, insira token, ID do número, versão da API do app e telefone destinatário com DDI. Para receber eventos, informe também o segredo do app, disponível nas configurações básicas da Meta. O ID da conta WhatsApp Business (WABA) permite consultar/criar modelos.
4. Salve e use **Verificar conexão salva**. Tokens temporários podem expirar; atualize o token quando necessário. Campos de segredo vazios preservam o valor salvo.
5. Para IA real, insira uma chave da API OpenAI e um modelo compatível com a Responses API e saída estruturada. A assinatura do ChatGPT não configura essa chave. O padrão é `gpt-5.4-mini`, editável. Revise a base de conhecimento e ative as respostas automáticas.

### Recebimento HTTPS sem publicar no Vercel

A Meta precisa alcançar o webhook pela internet, mesmo quando o aplicativo está na máquina local. `node scripts/whatsapp-lab-tunnel.mjs 3108 3110` inicia um proxy e um túnel temporário Cloudflare. O proxy aceita apenas GET/POST em `/api/follow-up/lab/webhook`, conserva o corpo e a assinatura, limita a carga a 1 MB e bloqueia páginas, login e rotas de configuração. Não encaminha cookies nem autorização da aplicação.

A ferramenta oficial `cloudflared` pode ficar em `.avvi-local/tools/cloudflared.exe` ou ser indicada por `AVVI_CLOUDFLARED_PATH`. Na preparação deste ambiente, o binário oficial foi baixado e seu SHA256 foi conferido contra o manifesto da versão 2026.10.1. Nenhum serviço do Windows foi instalado. Documentação: https://developers.cloudflare.com/tunnel/downloads/.

Quando o túnel estiver ativo, **Usar endereço do túnel** preenche a URL no laboratório. Cadastre na Meta essa URL completa e o **Token de verificação do webhook** mostrado na configuração; assine `messages`. A assinatura HMAC, o ID do número e o remetente autorizado são validados antes de registrar mensagens. O endereço é temporário e precisa ser atualizado se o túnel mudar. A prévia e o túnel devem ficar abertos durante a gravação.

### O que demonstrar

- **WhatsApp real:** envio de texto na janela válida ou de modelo aprovado, mensagem recebida pelo webhook e status reais enviados pela Meta. `hello_world` em `en_US` pode ser usado se estiver disponível na conta de teste. Apenas uma mensagem real do remetente autorizado abre a janela de 24 horas; o ensaio não abre essa janela. Quando a Meta devolve um identificador WhatsApp diferente da formatação digitada (como em números brasileiros), somente o identificador confirmado na resposta autenticada do envio é aceito como alternativa para aquele destinatário.
- **IA:** Responses API no servidor com `store:false`, contexto limitado à base aprovada e à conversa de teste, saída estruturada, remoção de identificadores comuns do contexto e encaminhamento de dúvidas clínicas ou não resolvidas. Essa remoção é uma medida de minimização, não uma garantia de anonimização completa nem autorização para treinar modelos.
- **Equipe:** “atendimento humano” pausa o assistente; a equipe assume e responde manualmente. Uma transferência solicitada durante a geração cancela a resposta automática pendente antes do envio. Repetir uma tentativa após perda da confirmação HTTP preserva a mesma identificação, evitando duplicar o envio.
- **Agenda:** crie um agendamento de demonstração, prepare a confirmação na conversa e responda “confirmo” com o assistente ativo. Só o registro isolado é confirmado.
- **Modelos:** consultar e criar modelos pela conta WABA. Um modelo criado permanece com o status que a Meta retornar; a interface não presume aprovação.
- **SAIR:** bloqueia novas mensagens, inclusive modelos, até nova autorização explícita. Limpar o histórico não remove essa recusa. A lista de mensagens é limitada a 1.000 registros de teste.

**Ensaio local** é separado de **WhatsApp real** em cada mensagem. Sem chave de IA, o ensaio responde apenas com trechos conhecidos da base e se identifica como **Base aprovada · ensaio sem IA**. Esse resultado não comprova IA ou transporte WhatsApp e não deve substituir as etapas reais no vídeo. A tela **Roteiro do vídeo** organiza os passos. Nenhum histórico antigo foi importado ou usado para treinar modelos.

Testes isolados: `node tests/whatsapp-lab.mjs`, `node tests/whatsapp-lab-proxy.mjs` e `node tests/whatsapp-lab-ui.mjs`. O teste de tela usa a porta 3107 com `AVVI_WHATSAPP_LOCAL_TEST=true`, `AVVI_WHATSAPP_LAB_DIRECTORY` apontando para uma pasta exclusiva de testes e `AVVI_TEST_ADMIN_PASSWORD`. Ele não configura credenciais de Meta/OpenAI. Os testes de servidor simulam essas APIs e proíbem outros destinos de rede. Os testes anteriores `follow-up-engine.mjs`, `follow-up-server.mjs` e `lead-funnel.mjs` continuam válidos.

### IA local do laboratório

Em **Testes WhatsApp → Configuração → Motor da IA**, selecione **IA local · neste computador (Ollama)**, informe o modelo instalado e salve. A opção local nunca usa a chave OpenAI nem faz fallback para um serviço pago. **Verificar IA local** consulta os modelos instalados; as respostas reais dependem da memória livre e do modelo carregado. O estado anterior sem provedor continua usando o fluxo OpenAI existente.

O runtime portátil oficial fica em `.avvi-local/tools/ollama/` e os modelos em `.avvi-local/ollama-models/`, ambos ignorados pelo Git. Execute `powershell -File scripts/start-local-ai.ps1` para iniciar. O processo escuta somente em `127.0.0.1:11434`, com nuvem desativada, um modelo e uma geração de cada vez. Nenhuma porta do Ollama é exposta pelo túnel do WhatsApp. Computador desligado ou suspenso interrompe a IA; uma falha encaminha a conversa para atendimento humano. O modelo e o runtime precisam de vários GB de disco; obtenha o pacote Windows oficial em https://github.com/ollama/ollama/releases e confira o SHA256 publicado antes de executar.

A **Base de conhecimento aprovada** é editável no sistema (até 16 mil caracteres). Ela aceita explicações gerais dos procedimentos, perguntas e respostas e exemplos revisados, sem dados de pacientes. O sistema seleciona trechos relevantes, limita o histórico e exige resposta estruturada com um trecho de apoio presente na base; informação sem apoio encaminha para a equipe. Isso é consulta a conhecimento aprovado, não treinamento dos pesos do modelo. Não há importação automática das conversas ou prontuários reais. A validação não garante exatidão clínica: publique apenas conteúdo revisado pela equipe e use atendimento humano para decisões individuais.

`node tests/whatsapp-local-ai.mjs` testa o adaptador sem rede. `AVVI_LOCAL_AI_LIVE_TEST=true node tests/whatsapp-local-ai-live.mjs` testa o Ollama instalado com uma base fictícia e perguntas variadas, sem enviar WhatsApp ou chamar a OpenAI. O modelo pode ser escolhido por `AVVI_LOCAL_AI_MODEL`. Os testes existentes do laboratório também verificam a seleção do provedor, persistência, resposta local ao webhook e ausência de chamadas pagas.
# Acesso restrito para análise da Meta

O avaliador usa uma conta padrão cadastrada em **Contas**, com as permissões `Follow Up` e `Follow Up: análise Meta`. O login, o menu e as sete abas são os componentes originais do aplicativo, na página inicial `/`. Não existe outro site ou layout de demonstração. A conta usa a autenticação, o cookie HttpOnly e a revogação por versão do próprio sistema. Está disponível apenas na prévia local autorizada; não foi publicada no Vercel.

Após compilar a prévia local, inicie `scripts/start-meta-review.ps1`. O proxy `scripts/meta-review-server.mjs` disponibiliza o próprio aplicativo, com acesso exclusivo ao Follow Up. As credenciais ficam em `.avvi-local/meta-review/credentials.txt`; a URL temporária fica em `tunnel.json` nessa pasta. Esses arquivos são ignorados pelo Git. Nunca forneça o acesso de administrador da clínica aos avaliadores.

O proxy encaminha a página original, seus arquivos estáticos e as rotas necessárias ao Follow Up. Exige uma sessão da conta de análise nas APIs, bloqueia origens externas nas alterações e limita solicitações. O usuário vê os contatos, os dados de serviços/profissionais e os horários usados pelo Follow Up existente. A projeção remove documentos, prontuários, fotos, pagamentos, comissões e registros financeiros. As outras áreas e as alterações de pacientes e da agenda continuam bloqueadas no servidor. O laboratório usa o mesmo histórico e configuração existentes; os campos de credenciais e configurações administrativas ficam restritos ao administrador. O canal WhatsApp real usa somente o destinatário já autorizado. A criação de modelos fica limitada a nomes `avvi_review_` e três tentativas por hora.

Esta URL exige o computador ligado e muda quando o túnel é reiniciado. O webhook usa seu túnel separado; o acesso de análise não altera sua configuração na Meta. A parte real precisa de token válido, assinatura do webhook e destinatário autorizado. O ensaio não comprova uso da API. Não há login pelo Facebook implementado nesta interface. Para revogar o acesso, entre como administrador em **Contas**, desmarque o perfil de análise e remova a permissão Follow Up da conta. A mudança de versão invalida as sessões existentes. Encerrar o proxy interrompe também o endereço público.

Verificações: `node tests/meta-review.mjs` testa conta fictícia, projeção, permissões, limites, segredos e revogação. `node tests/meta-review-system-ui.mjs` inicia uma prévia isolada na porta 3107 (deve estar livre) e testa a interface original, sete abas, contatos, editor/prévia, ensaio, atendimento manual, recarga, celular e logout. Usa apenas dados fictícios, sem chamadas Meta ou Supabase. `node scripts/check-meta-review.mjs` confere o HTTPS público e o login real por consultas, sem enviar mensagens ou alterar registros clínicos. Os testes de tela requerem Playwright e Chrome nos mesmos caminhos dos demais testes do projeto.

## Simulação de atendimento

**Operação > Simulação** permite combinar serviços, quantidades e custos de produtos, desconto, participação profissional e pagamentos divididos. Crédito inclui bandeira e 1 a 12 parcelas; débito e crédito permitem ajustar a taxa estimada. As taxas de referência são as mesmas do lançamento de procedimentos. O resumo usa os pagamentos informados, inclusive zero, e aponta valores ainda não distribuídos ou excedentes.

O rascunho existe apenas no estado do componente. Sair da aba, recarregar ou usar **Limpar simulação** descarta tudo. Não há salvamento, histórico, alteração de catálogo, baixa de estoque ou geração de conta, pagamento ou dívida. A simulação lê somente os catálogos já autorizados e não exige SQL ou tabela adicional.

O administrador libera por usuário em **Contas > Editar usuário > Permitir Simulação > Salvar usuário**. Essa permissão isolada autoriza somente a leitura de serviços e produtos, sem acesso a pacientes, agenda, estoque ou dados financeiros. Ela não é concedida automaticamente aos usuários existentes.

Verificações: `node tests/simulation.mjs` testa cálculos, taxas, valores zero e permissões; `node tests/simulation-ui.mjs` inicia a prévia 3107 isolada (porta livre), usa contas e catálogo fictícios e verifica o menu, pesquisa, custos, parcelas, ausência de gravação, descarte, revogação e liberação em Contas. Com `AVVI_SIMULATION_LEDGER_REGRESSION=true`, o mesmo comando executa também `tests/procedure-entry-total-ui.mjs` com uma sessão administrativa assinada exclusiva desse servidor de testes; todos os cenários anteriores são preservados. Nenhum teste altera dados reais na nuvem.
