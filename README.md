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

As consultas carregam os registros em páginas de 500, incluindo bases com mais de 1.000 registros. Identificadores ausentes interrompem o salvamento em vez de gerar duplicações; requisições têm limite de 25 segundos. As inclusões/alterações relacionadas compartilham uma requisição, mas exclusões usam chamadas separadas; uma falha parcial permanece pendente para repetição. Isso não é uma transação única entre inclusão e exclusão, nem uma garantia absoluta contra falhas de rede, permissões, armazenamento cheio ou alterações simultâneas.

Testes: `node tests/persistence.mjs` verifica recuperação das 16 entidades e armazenamento local; `node tests/database.mjs` verifica paginação e falhas parciais. `node tests/persistence-ui.mjs` verifica falhas, recarga, reconexão e falta de espaço usando navegador e Supabase simulado, sem acessar o banco real. Esse teste requer Playwright e Chromium/Chrome; `PLAYWRIGHT_MODULE`, `CHROME_PATH` e `AVVI_TEST_URL` permitem indicar a instalação e a URL da prévia, compilada com `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3999` e uma chave de teste.

Os valores de custo dos procedimentos já salvos prevalecem sobre os valores iniciais do catálogo. Brindes são opcionais no fechamento; somente um produto utilizado continua sendo obrigatório.


## Usuário padrão e permissões

O aplicativo tem os dois logins locais explícitos: o administrador existente e `avviclinica`, com o perfil **Usuário padrão**. Esse perfil acessa somente Agenda, Estoque, Follow Up, Custos, Cadastro de Procedimentos, Cadastro de Serviços, Cadastro de Profissionais e Cadastro de Pacientes. Metas, Dashboard, Receitas, Lançamento de Procedimentos, Pagamento Profissional, Relatório Profissional e recibos financeiros ficam restritos ao administrador. Nenhum e-mail autenticado recebe automaticamente um perfil local.

As credenciais são verificadas no servidor com scrypt; senhas e verificadores não entram no JavaScript enviado ao navegador. A sessão é um cookie assinado, HttpOnly e SameSite=Strict, com validade de 12 horas e atributo Secure em HTTPS. Indicadores no sessionStorage não concedem acesso. As cópias locais são separadas por perfil, sem importar a cópia financeira do administrador para o usuário padrão.

O usuário padrão consulta o banco por `/api/access/data`, que verifica a sessão e as permissões. Não carrega receitas, metas ou recibos; o histórico do estoque recebe apenas IDs, datas, paciente, profissional e quantidades, com valores financeiros ocultos. As alterações de estoque/cadastro/custos continuam permitidas. Fechar uma conta na Agenda continua gerando seus registros financeiros, e excluir a conta estorna somente os registros vinculados. Brindes continuam opcionais. Os dois logins locais têm acesso ao Follow Up autorizado; o funcionamento real continua dependente da configuração do WhatsApp descrita anteriormente.

**Para publicar esta versão:** configure `AVVI_SESSION_SECRET` na hospedagem, com um valor aleatório de pelo menos 32 caracteres. A configuração local foi preparada em `.env.development.local` e `.env.production.local`, arquivos ignorados pelo Git. Não publique esses arquivos nem exponha a chave no navegador. O exemplo sem valores está em `.env.access.example`. A versão recusa emitir sessões quando essa variável não está configurada.

**Proteção do acesso direto ao banco:** o esquema anterior permite acesso público a `avvi_records` com a chave anon. As restrições implementadas na interface e nas rotas não revogam esse acesso existente. Para ativar a proteção também no Supabase, configure `SUPABASE_SERVICE_ROLE_KEY` somente no servidor e `NEXT_PUBLIC_AVVI_PROTECTED_DATABASE=true`, publique e então aplique `supabase/access-lockdown.sql`. Esse SQL altera apenas permissões e não apaga registros. Com a flag ativa, o administrador também consulta e grava através das rotas autenticadas. Não aplique o SQL antes de configurar e publicar esse modo, pois bloquearia a versão anterior do cliente. A tabela privada do Follow Up mantém suas regras anteriores. Essa etapa não foi executada no banco real, pois a conexão administrativa não está disponível neste ambiente.

`node tests/access.mjs` testa as permissões, credenciais, assinatura, validade e adulteração da sessão. `node tests/access-ui.mjs` usa um banco fictício local para verificar desktop/celular, recarga, bloqueio das rotas, salvamento do estoque, fechamento sem brinde, lançamentos automáticos e estorno, e a manutenção do acesso do administrador. Não altera pacientes reais nem envia mensagens.


## Foto dos profissionais na agenda

A foto adicionada na bolinha do Cadastro de Profissionais aparece também na bolinha ao lado do nome na Agenda. O upload atualiza o cadastro e o formulário de edição abertos; salvar os demais dados preserva a foto atual. O arquivo fica no campo existente `avatarDataUrl`, com o mesmo salvamento local e na nuvem. Sem foto, a inicial continua sendo exibida. O teste de acesso verifica upload, edição e recarga com um banco simulado.
