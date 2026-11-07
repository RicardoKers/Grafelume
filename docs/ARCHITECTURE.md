# Arquitetura

O Grafelume é uma aplicação estática Vue 3 e TypeScript construída com Vite. Não há servidor de aplicação em produção. JavaScript, WebAssembly, CSS, ícones, manifesto, Service Worker e dados Hunspell são servidos no mesmo caminho-base.

## Editor

CodeMirror 6 fornece documento imutável, transações, seleção, rolagem, composição IME e histórico. Os sublinhados são decorações do editor, não uma camada HTML sobre um textarea; por isso as coordenadas de texto e a quebra de linha usam o próprio mecanismo de layout do editor.

Uma correção é uma transação delimitada por offsets UTF-16 `from`/`to`. A ocorrência é validada contra o texto atual antes de substituir, evitando aplicar uma sugestão antiga a um trecho que foi editado. A alteração entra no mesmo histórico de desfazer da digitação. Atualizar decorações não reescreve o documento nem adiciona entradas ao histórico.

Menus e painel de revisão recebem ocorrências, não cópias editáveis do documento. As operações de copiar, colar e arquivos são disparadas por ações explícitas. O navegador continua responsável pelas permissões de área de transferência.

## Correções em lote

`src/review/BatchCorrections.ts` define os intervalos selecionados e o plano de aplicação. A seleção guarda o texto original e a substituição escolhida para cada ocorrência, sem selecionar a primeira sugestão automaticamente. O plano contém uma cópia do documento em memória; a aplicação é rejeitada se o documento mudou, se há sobreposições ou se um intervalo é inválido. O modo em lote protege spans técnicos reconhecíveis independentemente da preferência do filtro ortográfico.

`useBatchCorrections` gerencia o modo, as escolhas e a prévia temporária. Alterações no texto, idioma ou contexto de verificação descartam as escolhas. Fechar a prévia preserva a seleção; aplicar ou sair do modo a limpa. Não existe persistência dessa fila nem envio de dados pela rede.

A prévia apresenta contexto curto por ocorrência, com linha/coluna por grafemas e marcas explícitas para espaços, quebras de linha e remoções. O contexto é o do documento original ao redor de cada ocorrência; não é uma duplicação do documento completo nem uma simulação de todas as edições combinadas.

`TextEditor.applyBatch` revalida o plano contra o estado atual e despacha um array de alterações em uma única transação. A anotação [`isolateHistory.of('full')`](https://codemirror.net/docs/ref/#commands.isolateHistory) separa o lote das edições anterior e seguinte no histórico. O CodeMirror mapeia a seleção pelos intervalos alterados; a transação não pede rolagem nem substitui todo o conteúdo do editor.

## Ortografia

`src/spelling/` contém a tokenização, a carga dos dados locais e a integração do Hunspell C++ via `hunspell-wasm`. O módulo WebAssembly é distribuído junto da aplicação, sem download de CDN. O Web Worker executa o processamento mais custoso fora da interface. Resultados antigos são descartados por identificador de requisição; as sugestões são solicitadas sob demanda em vez de calcular alternativas para toda palavra desconhecida a cada tecla.

Os dados `.aff` e `.dic` são ambos necessários: o primeiro contém regras de afixos, o segundo o léxico e suas flags. Os dicionários PT-BR e EN-US são carregados sob demanda. A aplicação usa seu próprio motor e desativa a correção nativa no editor, evitando depender da correção aprimorada do navegador.

Um cache de palavras evita repetir consultas ao motor. O Worker reutiliza os tokens de parágrafos não modificados; a mensagem de verificação ainda transporta o texto integral após debounce. O processamento é agrupado com debounce; a atualização de decorações preserva o estado do editor. Os filtros técnicos são configuráveis e baseados em padrões reconhecíveis, sem descartar toda palavra desconhecida.

## Revisão e preferências

`src/grammar/RuleEngine.ts` expõe regras determinísticas com offsets e substituições explícitas. Elas não inferem concordância, sentido ou intenção. Ortografia e revisão são opções independentes e usam categorias visuais distintas.

`src/services/` concentra persistência de preferências e dicionários pessoais, Clipboard API e leitura/exportação TXT. O texto permanece em memória. Palavras pessoais são separadas por idioma; ignoradas valem somente para a sessão.

## PWA e caminhos

Em produção, o caminho-base do Vite é `/Grafelume/`; no desenvolvimento é `/`. O manifesto usa escopo e início relativos. URLs de dicionários são construídas com `import.meta.env.BASE_URL`; o Worker é uma entrada reconhecida pelo Vite.

O vite-plugin-pwa gera um Service Worker com Workbox. A interface, os módulos com hash e o binário WebAssembly entram em precache, com limpeza do precache antigo. Dicionários ficam em cache runtime **CacheFirst**, separados do shell por serem relativamente grandes. Não são baixados em todos os acessos nem copiados automaticamente junto do shell.

`src/pwa.ts` fornece registro, preparação explícita dos dois idiomas e inspeção de disponibilidade. A presença de um idioma exige os dois arquivos no cache. A preparação valida o formato para detectar respostas HTML de caminhos inválidos. O nome `grafelume-dictionaries-v1` deve ser incrementado em `src/pwa.ts` e `vite.config.ts` quando os arquivos dos dicionários mudarem; versões incompatíveis nunca compartilham o mesmo cache. Os arquivos originais com licenças continuam junto dos dados publicados.

A atualização do Service Worker é oferecida ao usuário em vez de recarregar silenciosamente o editor. A aplicação precisa alertar que o documento em memória será perdido ao aceitar. O cache do navegador é conveniência local, não armazenamento durável garantido.

## Extensões

Um idioma adicional precisa de dados locais com licença compatível, registro de linguagem, testes e adaptação do seletor. Um novo motor pode manter o contrato de ocorrências sem alterar a edição. Regras novas devem incluir exemplos positivos e falsos positivos antes de serem ativadas.
