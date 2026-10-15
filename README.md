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

Os cartões continuam ordenados pelo valor recebido nos lançamentos de procedimentos, preservando os cálculos de custos, taxas, descontos, lucro, parte da empresa e parte do profissional. O total pago e o progresso da meta permanecem visíveis. Lucro total, receita da empresa e valor recebido pelo profissional ficam ocultos inicialmente; “Ver valores financeiros” abre somente os valores do cartão. “Mostrar valores de todos” abre esses três valores em todos os cartões, sem abrir rankings. “Ocultar valores de todos” recolhe todos os valores financeiros.

Clique no nome/seta ou em “Ver rankings individuais” para abrir quatro Top 5 do profissional: serviços mais realizados, pacientes por faturamento, por lucro e por quantidade de serviços. Pacientes são agrupados pelo identificador, inclusive quando têm o mesmo nome; vínculos com cadastro removido aparecem como “Paciente não cadastrado”. Registros sem paciente continuam nos totais financeiros, mas não são agrupados como se fossem uma única pessoa.

Faturamento e lucro por paciente usam a mesma base dos valores existentes: lançamentos de procedimentos do período, inclusive as edições independentes desses lançamentos. O ranking de lucro considera o lucro total do lançamento (recebimento menos custos e taxas), antes da divisão com o profissional. Serviços são contados pelos itens do fechamento ou pelos serviços de agendamentos Compareceu/Finalizado; linhas antigas manuais contam apenas quando vinculadas explicitamente a um serviço. Quantidades de produtos não viram quantidades de serviços, e lançamentos vinculados a um fechamento não duplicam os serviços da agenda.

O filtro aceita mês completo ou intervalo inclusivo de datas; todos os rankings e valores respeitam o período. A permissão “Relatório Profissional” concede leitura dos cadastros e atendimentos necessários aos rankings, sem liberar edição ou acesso às outras abas. A mudança é somente leitura e não exige migração dos dados clínicos.

Validação: `tests/professional-reports.mjs` verifica cálculos, agrupamentos, Top 5, períodos, metas, registros antigos, separação produto/serviço e permissões; `tests/professional-reports-ui.mjs` verifica os controles independentes, filtros e layout de celular usando dados fictícios apenas no navegador de teste.

O painel de valores financeiros também mostra o ticket médio: total pago pelos clientes nos lançamentos dividido pela quantidade de pacientes com conta fechada no período. Cada paciente é contado uma vez por profissional e período, mesmo com vários fechamentos. Contas abertas e simples comparecimentos não entram no divisor. Registros antigos explicitamente marcados como conta fechada também entram; sem pacientes com conta fechada, o ticket fica em zero. Lucro usa verde, receita da empresa amarelo queimado e valor do profissional azul. Fotos usam a imagem atual do cadastro de profissionais nos dois relatórios.

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
- Estoque de produtos: a lista inicial exibe nomes com bioestimulador, botox, combo, fios de PDO, enzimas, PDO espiculado, PDO multilaser, liala peeling/peel, preenchedor, preenchimento ou protocolo. **+ Produto** permite incluir outros itens do Cadastro de Procedimentos, preservando o saldo existente. A seleção `visibleInStock` fica nos registros de estoque existentes e sobrevive às baixas de consumo. Itens fora da lista permanecem salvos.
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
