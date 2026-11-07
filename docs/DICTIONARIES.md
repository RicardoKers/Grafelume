# Dicionários e motor ortográfico

O Grafelume distribui os arquivos `.aff` e `.dic` sem alterações, junto dos avisos
originais de licença. `npm run dictionaries` deve executar
`node scripts/copy-dictionaries.mjs`; o build também deve chamar esse comando.
`public/dictionaries/sources.json` registra as versões efetivamente instaladas.
Nenhum pacote de dicionário é importado no bundle do navegador: somente os dados
estáticos do idioma solicitado são baixados da própria origem.

| Recurso                 | Origem primária                                                                                                                          | Licença                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `hunspell-wasm` 0.3.0   | https://github.com/rotemdan/hunspell-wasm                                                                                                | LGPL-2.0 **ou** GPL-2.0 **ou** MPL-1.1 |
| `dictionary-pt` / PT-BR | https://github.com/wooorm/dictionaries/tree/main/dictionaries/pt, dados de https://github.com/LibreOffice/dictionaries/tree/master/pt_BR | LGPL-3.0 **ou** MPL-2.0                |
| `dictionary-en` / EN-US | https://github.com/wooorm/dictionaries/tree/main/dictionaries/en, dados de http://wordlist.aspell.net/dicts/                             | MIT **e** BSD                          |

Os avisos completos do motor ficam em `public/engine/COPYING*`; `SOURCE.txt`
indica o pacote exato com fontes do wrapper e o projeto com fontes C++ de origem.
O metadado npm menciona LGPL-2.0, mas o arquivo `COPYING.LESSER` contém LGPL 2.1;
os textos originais completos são preservados, incluindo a alternativa MPL-1.1.
O código de aplicação
MIT não altera as licenças independentes do motor e dos dados.

O projeto VERO, da comunidade brasileira do LibreOffice, é atribuído a Raimundo
Santos Moura e colaboradores nos avisos do pacote PT-BR. Não se deve substituir a
licença dos dados pela licença MIT do empacotador ou do código do Grafelume.
Os fontes redistribuídos dos dados são os próprios `.aff`/`.dic` e seus avisos
ficam disponíveis na pasta pública. Atualizações devem manter esses arquivos.

## Compatibilidade e manutenção

As fontes primárias e avisos foram consultados em 6 de novembro de 2026.
`wooorm/dictionaries` normaliza e empacota dados; problemas lexicais devem ser
reportados ao projeto original. Os pacotes de dados usados são `dictionary-pt`
4.0.0 e `dictionary-en` 4.0.0. O aviso interno PT-BR identifica VERO 3.2, de
outubro de 2013: não se afirma que o vocabulário inclua todas as mudanças recentes.
O motor `hunspell-wasm` tem API pequena, não tem dependências de produção e usa
o próprio Hunspell C++ compilado para WebAssembly, preservando as regras `.aff`
de prefixos, sufixos, flexões, capitalização e compostos. As formas ausentes
podem ser adicionadas ao dicionário pessoal.

A alternativa nspell foi avaliada com o VERO integral e descartada porque sua
expansão antecipada das flexões não terminou em mais de dois minutos no ambiente
de desenvolvimento. A versão WASM passou o corpus completo, incluindo carga
de ambos os dicionários, em aproximadamente um segundo. Essa decisão evita
reduzir o vocabulário ou simular regras linguísticas.

O corpus real de testes verifica acentos, Unicode decomposto, flexões,
capitalização, compostos existentes, contrações inglesas e sugestões reais.
Não há análise de concordância: “dos documento” é aceito pelo corretor lexical.

## Processamento

As posições são offsets UTF-16 compatíveis com CodeMirror. A tokenização retém
apóstrofos e hífens e exclui padrões técnicos reconhecíveis, quando a opção está
ativada. Siglas maiúsculas de duas a oito letras são ignoradas nessa opção;
isso é uma escolha configurável, não prova de validade lexical. Desativar a
opção permite verificar também essas palavras.

Para os idiomas PT-BR e EN-US, expressões Unicode de letras e marcas mantêm
compostos e contrações como uma unidade lexical. `Intl.Segmenter` foi considerado,
mas sua segmentação padrão separa componentes com hífen e exigiria reconstrução
posterior; o tokenizer explícito preserva essas unidades e os offsets originais
sem depender de diferenças dos dados de segmentação de cada navegador. Idiomas
futuros sem separação por espaços devem introduzir tokenização específica com
`Intl.Segmenter` por meio dessa interface.

O Worker mantém um motor por idioma, cache limitado por palavra e cache de
tokens dos parágrafos presentes. Uma alteração retokeniza apenas parágrafos
novos/modificados; offsets globais e ocorrências são reconstruídos para manter
o resultado correto após inserções. O texto completo ainda é enviado ao Worker
após debounce; não há protocolo de patches nesta versão. Sugestões são calculadas
sob demanda e limitadas a cinco. Tokens acima de 64 caracteres continuam sendo
verificados, mas não disparam busca de sugestões potencialmente cara.

O cache lexical é independente do dicionário pessoal e das palavras ignoradas.
Assim, remover uma palavra pessoal ou alternar o idioma não deixa resultados
obsoletos. Falhas de download são removidas do cache de promises para permitir
nova tentativa. O modo offline depende de o motor WASM e os recursos do idioma já terem sido
baixados e armazenados pelo Service Worker.

## Desempenho reproduzível

Execute `npx vitest run tests/unit/spelling.test.ts --reporter=verbose`. O teste com 10.000 palavras,
incluindo 2.000 ocorrências desconhecidas e 1.001 formas desconhecidas distintas, imprime `SPELL_PERFORMANCE` com tempos
de uma passagem inicial e de uma edição incremental. Não se impõe um limite de
latência que dependa da máquina. A carga inicial do dicionário ocorre no Worker
e é medida separadamente da digitação quando necessário.

Medição real em 6 de novembro de 2026, Windows, Node 24.19.0, Vitest 5.1.0:
47,41 ms na primeira análise; 5,95 ms após adicionar um parágrafo. O teste com
15 casos reais passou em 1,34 s (inclui leitura, carga WASM e testes de falha/retry).
Os números representam uma execução nesse ambiente, não uma garantia para todos
os dispositivos. Sugestões são medidas à parte e nunca calculadas para todos os
erros enquanto o usuário digita.

Com a prévia de produção ativa, execute `node scripts/benchmark-browser.mjs`
(ou informe a URL como primeiro argumento). O resultado, sem o texto de teste,
fica em `artifacts/performance.json`. Medição real no Chromium 158.0.8127.18
headless, 1440 × 960, no mesmo ambiente: carga inicial até o corretor pronto em
1.310 ms, importação TXT de 10.000 palavras em 352,1 ms, colagem de texto simples
em 298,2 ms e uma edição incremental em 314,7 ms. Esses tempos de interface
incluem o debounce de 260 ms, revisão, contagem e renderização. Durante a
digitação de 29 teclas com o documento carregado, o tempo de evento até o próximo
frame foi de 12,2 ms na mediana e 14,5 ms no percentil 95; não foram observadas
long tasks na thread principal. A colagem usa `ClipboardEvent` para exercitar o
handler real do CodeMirror sem alterar a área de transferência do sistema.

`locator.fill()` foi comparado e descartado como método desse benchmark: a
inserção massiva no DOM editável por esse helper levou 4,88 s, incluindo uma
long task de 4,47 s. A importação e a colagem reais acima confirmam que esse
tempo não representa o custo do motor ortográfico ou dos fluxos normais de
entrada de documentos. Nenhuma dessas medições é um limite garantido para
outros computadores ou navegadores.
