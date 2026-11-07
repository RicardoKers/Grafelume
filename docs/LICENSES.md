# Dependências, licenças e manutenção

O código original do Grafelume é distribuído sob MIT, conforme `LICENSE`. Isso não altera a licença dos dados e bibliotecas incorporados. O lockfile registra as versões efetivamente instaladas.

| Componente          | Uso                                                 | Licença declarada                             | Fonte primária                                                                      |
| ------------------- | --------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Vue 3               | Interface reativa e componentes                     | MIT                                           | [vuejs/core](https://github.com/vuejs/core)                                         |
| CodeMirror 6        | Edição, seleção, histórico e decorações             | MIT                                           | [CodeMirror](https://codemirror.net/)                                               |
| hunspell-wasm 0.3.0 | Hunspell C++ em WebAssembly, com wrapper TypeScript | LGPL-2.0 OR GPL-2.0 OR MPL-1.1 (metadado npm) | [rotemdan/hunspell-wasm](https://github.com/rotemdan/hunspell-wasm)                 |
| @lucide/vue         | Ícones da interface                                 | ISC, com avisos MIT herdados de Feather       | [lucide-icons/lucide](https://github.com/lucide-icons/lucide)                       |
| dictionary-pt       | Dados Hunspell português brasileiro/VERO            | LGPL-3.0 OR MPL-2.0                           | [dictionaries/pt](https://github.com/wooorm/dictionaries/tree/main/dictionaries/pt) |
| dictionary-en       | Dados Hunspell inglês americano                     | MIT AND BSD                                   | [dictionaries/en](https://github.com/wooorm/dictionaries/tree/main/dictionaries/en) |
| Vite                | Servidor de desenvolvimento e build                 | MIT                                           | [vitejs/vite](https://github.com/vitejs/vite)                                       |
| TypeScript          | Verificação estática                                | Apache-2.0                                    | [microsoft/TypeScript](https://github.com/microsoft/TypeScript)                     |
| vite-plugin-pwa     | Geração do manifesto e Service Worker               | MIT                                           | [vite-pwa/vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa)             |
| Workbox             | Runtime/cache do Service Worker                     | MIT                                           | [GoogleChrome/workbox](https://github.com/GoogleChrome/workbox)                     |
| Vitest              | Testes unitários                                    | MIT                                           | [vitest-dev/vitest](https://github.com/vitest-dev/vitest)                           |
| Playwright          | Testes reais em navegador                           | Apache-2.0                                    | [microsoft/playwright](https://github.com/microsoft/playwright)                     |

## Tradução

Transformers.js 4.3.2 usa Apache-2.0 e o ONNX Runtime usa MIT, com seus avisos de terceiros preservados em `public/translation/engine/notices/`. Os pacotes ONNX e guid-typescript omitem o arquivo de licença na distribuição npm; o gerador de avisos usa cópias locais das fontes oficiais fixadas. `SOURCES.txt` registra essas fontes e a origem do texto ISC padronizado para guid-typescript, cujo pacote declara ISC e autoria `nicolas`.

Os pesos Marian/OPUS-MT são redistribuídos com os cartões originais, atribuição, revisões fixadas e declarações Apache-2.0/CC-BY-4.0 preservadas. Veja [TRANSLATION-MODELS.md](TRANSLATION-MODELS.md). Esses termos são próprios dos modelos e não são substituídos pela licença MIT da aplicação.

## Dicionários

Os pacotes `dictionary-pt` e `dictionary-en` normalizam e redistribuem dados de projetos anteriores. A licença MIT do agregador **não** relicencia os arquivos `.aff` e `.dic`: cada conjunto conserva sua licença original. Os avisos copiados ficam em `public/dictionaries/`, junto dos arquivos publicados. Consulte também [DICTIONARIES.md](DICTIONARIES.md) para atribuição, versões e suporte do motor.

O código de integração usa os dados como arquivos separados e não modifica as regras ou o léxico original. Qualquer redistribuição ou alteração futura deve preservar os termos correspondentes e suas atribuições.

## Manutenção

As fontes primárias foram consultadas durante a implementação. `hunspell-wasm` 0.3.0 é um port pequeno, sem dependências de produção, do motor Hunspell real. Seu repositório fornece as fontes C++ em `lib/hunspell`, o wrapper TypeScript e o Makefile Emscripten; as instruções de compilação estão em `docs/Building.md`. O pacote tem manutenção menos frequente que os frameworks, razão para manter testes reais dos dois idiomas. O binário e seu carregador são distribuídos localmente.

Os textos integrais `COPYING`, `COPYING.LESSER` e `COPYING.MPL` são preservados em `public/engine/`. O metadado npm declara LGPL-2.0, enquanto o texto `COPYING.LESSER` fornecido identifica LGPL 2.1; para redistribuição, consulte os textos originais preservados e a alternativa MPL 1.1. A licença MIT do aplicativo não substitui esses termos. O metadado `gitHead` do pacote 0.3.0 identifica o commit `8f755ef64e8b047b77b676f9698b3dfa5cb1887d`: consulte as [fontes C++ correspondentes](https://github.com/rotemdan/hunspell-wasm/tree/8f755ef64e8b047b77b676f9698b3dfa5cb1887d/lib/hunspell) e as [instruções de compilação](https://github.com/rotemdan/hunspell-wasm/blob/8f755ef64e8b047b77b676f9698b3dfa5cb1887d/docs/Building.md). O pacote npm contém as fontes do wrapper TypeScript, enquanto as fontes C++ estão no repositório indicado.

O repositório central do CodeMirror foi movido em abril de 2026 para [code.haverbeke.berlin/codemirror/dev](https://code.haverbeke.berlin/codemirror/dev). O arquivo do espelho no GitHub registra essa mudança; seu estado arquivado não indica, por si só, abandono dos pacotes.

O agregador `wooorm/dictionaries` declara que a manutenção linguística pertence aos projetos de origem. Erros do léxico devem ser investigados nesses projetos, em vez de presumir que a atualização do pacote npm assegura conteúdo linguístico recente. Nenhuma dependência exige um servidor de produção ou conta paga.

Os avisos integrais das bibliotecas de produção encontram-se também em `public/licenses/THIRD-PARTY-NOTICES.txt`, distribuído no build. Os ícones e o logotipo Grafelume são originais do projeto.
