# Privacidade e armazenamento

O conteúdo do editor é processado no navegador. A ortografia é executada pelo Hunspell compilado para WebAssembly em um Web Worker local, usando os arquivos Hunspell distribuídos com a aplicação. A revisão básica usa regras determinísticas locais.

Não há APIs de correção, IA, analytics, rastreadores, contas ou endpoints para receber documentos. As dependências JavaScript e CSS são empacotadas; não são carregadas de CDNs. Fontes são locais ao sistema, sem requisições a provedores de fontes.

## Dados persistidos

O localStorage guarda apenas preferências de aparência/comportamento e palavras adicionadas ao dicionário pessoal, com separação de idioma. O texto em edição e as palavras ignoradas não são salvos permanentemente. Se o armazenamento local for bloqueado, a aplicação pode continuar a funcionar durante a sessão, mas as preferências não serão restauradas.

O Cache Storage guarda arquivos estáticos da aplicação e dicionários baixados. Nenhum documento digitado é colocado nesse cache. Não há armazenamento de texto em IndexedDB ou em nuvem.

Para remover dados locais, use as ferramentas de dados do site no navegador. Isso também pode remover dicionários e a instalação offline. Remover uma palavra nas configurações a retira do dicionário pessoal daquele idioma.

## Rede e área de transferência

Durante o primeiro acesso, a hospedagem recebe requisições dos recursos estáticos e seus metadados usuais de conexão. Baixar um dicionário ou verificar uma atualização também pode gerar uma requisição do recurso. Essas requisições não incluem o texto do editor.

Copiar ou colar ocorre somente por ação explícita do usuário. O sistema operacional e o navegador controlam o conteúdo e as permissões da área de transferência. Importação lê o TXT local escolhido; exportação cria um download local em UTF-8.

O corretor nativo do navegador está desativado no editor. Navegadores podem oferecer recursos próprios, extensões ou políticas corporativas que processam texto externamente. O Grafelume não depende desses recursos nem controla extensões instaladas pelo usuário.

## Verificar

É possível acompanhar a aba Network das ferramentas do navegador durante a digitação e a correção. Devem aparecer somente recursos locais e atualizações do aplicativo, sem requisições contendo documentos. Para testar offline, prepare os dicionários, aguarde a conclusão, ative Offline nas ferramentas e recarregue a página dentro de `/Grafelume/`.
