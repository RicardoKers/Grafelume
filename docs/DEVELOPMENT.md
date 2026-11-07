# Desenvolvimento e verificação

## Ambiente

Use Node.js 24 LTS e o npm fornecido com essa versão. O lockfile torna as dependências reproduzíveis. Para uma cópia limpa de CI, execute `npm ci`; para a primeira instalação de desenvolvimento, `npm install`.

```sh
npm run dev
npm run typecheck
npm test
npm run build
node scripts/check-build.mjs
npx playwright install chromium
npm run test:e2e -- --project=chromium
npm run preview
```

Os testes unitários usam Vitest. Os testes de interface usam Playwright e devem apontar para o build de produção com base `/Grafelume/`, permitindo verificar também o manifesto, o Worker, o cache e a reabertura offline. Instale os binários dos navegadores antes de rodar testes de interface. No Linux/CI use `npx playwright install --with-deps chromium` para incluir bibliotecas do sistema.

## O que verificar

- Ortografia real nos dois dicionários: acentos, flexões, maiúsculas, hífens, sugestões e palavras pessoais.
- Offsets UTF-16 com Unicode, URLs, e-mails, números e identificadores.
- Casos positivos e falsos positivos das regras de revisão.
- Digitação, substituição de uma única ocorrência, seleção, desfazer/refazer, menu por teclado e atualização dos sublinhados.
- Preferências persistidas sem persistir o documento.
- Respostas antigas do Worker durante digitação ou troca de idioma.
- Falha de carga recuperável e funcionamento offline após armazenamento dos dados.
- Recursos estáticos todos dentro da base da aplicação.

## Desempenho

Os testes de desempenho usam texto com pelo menos 10.000 palavras, incluindo desconhecidas. Deve-se registrar separadamente o custo inicial de carregar/interpretar o dicionário e o custo de verificar texto com motor aquecido. As medições dependem do equipamento e não constituem promessa de latência.

Resultados executados em 6 de novembro de 2026, Windows, Node 24.19.0:

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Aprovado |
| `npm test -- --reporter=verbose` | 31 testes aprovados, 3 arquivos, 1,26 s |
| Playwright Chromium 158 | 16 testes aprovados |
| Playwright Firefox 159 | 14 testes aprovados; 2 não aplicáveis |
| `npm run build` | Aprovado, base `/Grafelume/` |
| `node scripts/check-build.mjs` | Manifesto, ícones, WASM em precache, dicionários, base e licenças aprovados |
| `npm audit --omit=dev` | Nenhuma vulnerabilidade reportada nas dependências de produção |

Os dois testes não aplicáveis no Firefox usam permissões programáticas de clipboard do Playwright e composição IME via CDP, APIs específicas do Chromium. Digitação, seleção, correções, histórico, menu pelo teclado, TXT UTF-8, preferências, dicionário pessoal, falha 503 com recuperação e recarregamento totalmente offline em ambos os idiomas foram verificados nos dois navegadores. Clipboard e composição acentuada via CDP passaram no Chromium. A suíte também verifica que as requisições são locais, não contêm o documento e que o documento não é persistido.

Na validação inicial local não foram testados Edge, Linux, Safari, dispositivos móveis físicos ou teclados IME do sistema operacional. A publicação posteriormente também passou pelos testes unitários e de interface Chromium no runner Ubuntu do GitHub Actions. O layout móvel inicial foi verificado em viewport de 390 × 844 no Chromium e no Firefox. A instalação pelo menu do sistema do navegador não foi automatizada; manifesto e funcionamento offline foram verificados.

Com 10.000 palavras, 2.000 ocorrências desconhecidas e 1.001 formas desconhecidas distintas, o motor isolado levou **28,10 ms** na primeira análise e **3,95 ms** após uma edição incremental, com os dicionários já carregados.

Na interface Chromium headless (1440 × 960), a medição reproduzível em `artifacts/performance.json` registrou:

| Operação | Tempo medido |
| --- | --- |
| Navegação até corretor pronto em contexto novo | 1.310 ms |
| Importar TXT com 10.000 palavras até revisão pronta | 352,1 ms |
| Colagem de texto simples até revisão pronta | 298,2 ms |
| Edição incremental até revisão pronta | 314,7 ms |
| Evento de digitação até o próximo frame, mediana / percentil 95 | 12,2 / 14,5 ms |
| Long tasks na thread principal durante o cenário | 0 |

Os tempos de revisão na interface incluem o debounce de 260 ms, contagem, regras básicas, transporte, renderização e automação. O cenário de digitação usa 29 teclas, com intervalo solicitado de 25 ms. O cenário de colagem dispara um `ClipboardEvent` de texto simples; os testes E2E separados verificam a área de transferência real no Chromium. Uma medição preliminar com `locator.fill` de um contenteditable gigante levou cerca de 4,9 s, mas essa API modifica diretamente o DOM e não representa os fluxos de importação/colagem do editor. Nenhuma dessas medidas é uma garantia de latência em outros equipamentos.

Para repetir o benchmark, mantenha `npm run preview` aberto após o build e execute `node scripts/benchmark-browser.mjs`. Para incluir Firefox nos testes E2E, instale-o com `npx playwright install firefox` e defina `PLAYWRIGHT_ALL_BROWSERS=1` ao executar `npm run test:e2e`. No PowerShell: `$env:PLAYWRIGHT_ALL_BROWSERS='1'; npm run test:e2e`.

O build emite avisos de externalização de `fs/promises` e `module` nas ramificações Node do pacote Hunspell. Essas ramificações não são chamadas no Worker do navegador; os testes reais online e offline passaram com o WASM local.

A auditoria completa reporta quatro entradas de gravidade baixa na cadeia de build `deepmerge → @rollup/plugin-node-resolve → workbox-build → vite-plugin-pwa`, todas relacionadas ao mesmo aviso de prototype poisoning de `deepmerge` 4.3.1. Não havia versão corrigida de `deepmerge` publicada durante a verificação. A configuração de build é local e controlada pelo projeto; esse pacote não integra o bundle de produção. Os alertas críticos/moderados encontrados inicialmente foram resolvidos com atualização de Vitest e overrides de `glob`/`minimatch`. Reavalie a auditoria ao atualizar as dependências.

## Regressões da versão 1.0.1

Validação concluída em 7 de novembro de 2026, Windows, Node 24.19.0:

| Verificação | Resultado |
| --- | --- |
| TypeScript e build de produção | Aprovados |
| Vitest | 31 testes aprovados |
| Playwright Chromium 158 | 24 testes aprovados |
| Playwright Firefox 159 | 21 testes aprovados; 3 não aplicáveis |
| Suíte de interface completa | 45 aprovados, 3 não aplicáveis, nenhuma falha; 58,9 s |
| Recursos e caminhos do build | Aprovados |

As novas regressões verificam seleção integral ao abrir o menu pelo teclado, copiar/recortar com desfazer, comandos desativados sem seleção, saída do menu por Tab, sugestões que chegam depois da abertura e reposicionamento após resize. Também cobrem a remoção do erro ao desligar a ortografia, a recuperação de um Worker cujo carregamento falhou, os rótulos de espaços/quebras de linha e a aplicação das substituições. O terceiro caso não aplicável no Firefox é o novo teste de clipboard, pela mesma limitação de permissões dos testes anteriores.

Os testes de legibilidade calculam contraste a partir das cores computadas no DOM nos dois temas, verificam o tamanho das informações e ações revisadas e conferem ausência de rolagem horizontal em 390 e 320 px. O botão que alterna o painel deve ficar inteiramente visível em ambas as larguras. Capturas locais dos temas claro/escuro e da tela de 320 px foram inspecionadas.

O corretor é criado sob demanda. Quando uma instância falha ou excede o tempo de espera, os pedidos pendentes são rejeitados e a próxima tentativa pode criar outra instância. Mensagens antigas são descartadas por identidade da instância e geração da revisão; o conteúdo do editor não é substituído durante essa recuperação.

## Limites conhecidos

- O Hunspell real roda via WebAssembly. Sugestões e cobertura dependem dos dados escolhidos e podem diferir de uma instalação específica do LibreOffice. O dicionário PT-BR distribuído identifica-se como VERO 3.2 (2013); não se presume atualização linguística até 2026. Consulte `DICTIONARIES.md`.
- A correção trabalha com um idioma selecionado de cada vez. Misturar português e inglês pode produzir ocorrências esperadas; alternância automática não está habilitada.
- Os filtros técnicos reduzem falsos positivos, mas podem ocultar erros em trechos reconhecidos como códigos. Podem ser desativados.
- As regras de revisão são conservadoras; não avaliam concordância ou contexto semântico.
- A área de transferência depende de permissões e de contexto seguro. Atalhos nativos são uma alternativa quando o acesso programático é bloqueado.
- Não há salvamento de documentos. Recarregar ou encerrar uma janela descarta o texto em memória; exporte antes.
- O cache pode ser removido por políticas do navegador. O modo offline precisa de um download anterior concluído.
- PWA em desenvolvimento não equivale à versão produzida. Verifique o build servido em localhost ou HTTPS.

## Atualizar dependências e dicionários

Antes de atualizar, leia os changelogs, as licenças e os testes de regressão dos dois idiomas. Preserve os avisos dos pacotes e os originais `.aff`/`.dic`. Ao alterar os dados dos dicionários, incremente a versão do cache tanto em `src/pwa.ts` quanto em `vite.config.ts`. O nome versionado impede que um Service Worker novo reutilize dados incompatíveis de uma versão anterior.

Depois de mudar dependências, execute `node scripts/copy-licenses.mjs` para regenerar os avisos integrais a partir dos pacotes instalados e do lockfile. O script falha se um componente de produção não fornecer um aviso de licença, exigindo verificação antes da publicação.

As actions do workflow foram verificadas nas fontes primárias dos projetos. Consulte as tags de [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), [upload-pages-artifact](https://github.com/actions/upload-pages-artifact) e [deploy-pages](https://github.com/actions/deploy-pages) antes de atualizá-las. O job de deploy depende de todas as verificações e não executa para pull requests.
