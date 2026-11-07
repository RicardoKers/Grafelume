# Modelos de tradução local

O Grafelume usa dois modelos Marian/OPUS-MT convertidos para ONNX por Xenova, com pesos quantizados q8. A tradução português brasileiro ↔ inglês é opcional e exige download explícito na primeira utilização. Os arquivos publicados são servidos pela própria origem do Grafelume; a tradução ocorre no navegador.

O manifesto [src/translation/models.json](../src/translation/models.json) fixa revisões imutáveis, caminhos, tamanhos e SHA-256 de todos os arquivos de runtime, cards, licenças e atribuições. O campo `totalBytes` soma os sete arquivos necessários para inferência de cada direção; `totalNoticeBytes` soma seus avisos. Os arquivos ficam em `public/translation/models/{id}/`.

| Direção e alias | Modelo ONNX | Revisão fixada | Bytes de runtime |
| --- | --- | --- | ---: |
| EN → PT-BR, `en-pt` | [Xenova/opus-mt-en-ROMANCE](https://huggingface.co/Xenova/opus-mt-en-ROMANCE/tree/9d2ba69ac80c8e8453c3d9a1e2323a0e7b8ca3cd) | `9d2ba69ac80c8e8453c3d9a1e2323a0e7b8ca3cd` | 119.232.615 |
| PT-BR → EN, `pt-en` | [Xenova/opus-mt-ROMANCE-en](https://huggingface.co/Xenova/opus-mt-ROMANCE-en/tree/f60feaabe8bb435a5871e7702b25f53a01e770f8) | `f60feaabe8bb435a5871e7702b25f53a01e770f8` | 119.234.926 |

São 238.467.541 bytes de modelos, aproximadamente 227,4 MiB. O maior arquivo individual tem 60.212.804 bytes. O pacote inclui `config.json`, `generation_config.json`, `tokenizer.json`, `tokenizer_config.json`, `special_tokens_map.json`, `onnx/encoder_model_quantized.onnx` e `onnx/decoder_model_merged_quantized.onnx`. O tokenizer JSON incorpora seu vocabulário; não é necessário distribuir também os arquivos SentencePiece `.spm` e `vocab.json` para o carregador JavaScript.

O modelo EN → PT é multilíngue. Cada entrada tokenizada recebe o ID 51, correspondente a `>>pt_br<<`, para selecionar português brasileiro. O Worker insere o ID diretamente: Transformers.js 4.3.2 divide incorretamente a representação textual desse token. `>>por<<` não existe no vocabulário fixado; a variante `>>pt<<` tem ID 45. O modelo PT → EN tem destino inglês fixo e recebe o texto sem prefixo de idioma. Os aliases locais identificam a direção disponibilizada pelo aplicativo, sem alterar os modelos originais.

## Obter e conferir os arquivos

Na raiz do projeto, com Node.js 22.12 ou posterior:

```powershell
node scripts/download-translation-models.mjs
node scripts/download-translation-models.mjs --verify
```

O primeiro comando baixa apenas os arquivos ausentes ou inválidos a partir das revisões fixadas. Confere o tamanho e o SHA-256 antes de substituir o destino. Um download parcial ou de conteúdo divergente não é publicado. `--verify` usa somente arquivos locais, não acessa a rede e encerra com erro se qualquer arquivo estiver ausente ou divergente. Use `--model en-pt` ou `--model pt-en` para trabalhar com uma direção. O script não altera o manifesto, não procura automaticamente modelos mais recentes e não executa código remoto.

Os arquivos devem ser incluídos no artefato estático publicado. O download inicial feito pelo usuário transfere arquivos de modelo, sem enviar o conteúdo do editor. O carregamento local e o cache offline precisam ser mantidos na integração do runtime e do Service Worker.

## Autoria, licenças e dados

Os modelos originais são do grupo Helsinki-NLP / Universidade de Helsinki, no projeto OPUS-MT. Xenova (Joshua Lochner) disponibiliza a conversão ONNX compatível com Transformers.js. O Grafelume redistribui os arquivos q8 sem alterar os pesos.

Há duas declarações oficiais de licença preservadas: os cards originais no Hugging Face declaram **Apache-2.0**, enquanto o README do projeto OPUS-MT declara **CC-BY-4.0** para modelos pré-treinados. Os cards de conversão de Xenova identificam o modelo original, mas não apresentam uma declaração própria de licença. Por isso a distribuição mantém as duas declarações, ambos os textos integrais e a atribuição, sem tratar a licença MIT do aplicativo como licença dos modelos.

As fontes fixadas são:

- [Card original EN → ROMANCE, revisão f8f3a28](https://huggingface.co/Helsinki-NLP/opus-mt-en-ROMANCE/blob/f8f3a28e8b6272d0ccc0290b832f699e154ae431/README.md), cujo conjunto de pesos original é `opus-2020-04-21.zip`.
- [Card original ROMANCE → EN, revisão e9ca997](https://huggingface.co/Helsinki-NLP/opus-mt-ROMANCE-en/blob/e9ca9975e3972afd80732f08ce01d3a1339f47f8/README.md), cujo conjunto de pesos original é `opus-2020-04-01.zip`.
- [README do projeto OPUS-MT, revisão d5e932c](https://github.com/Helsinki-NLP/OPUS-MT-train/blob/d5e932c96d77596378010aa7e7f1caeb8ccaa9f8/README.md). O manifesto também contém os URLs fixados dos READMEs de cada par de idiomas, copiados junto aos modelos.
- [Texto Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt) e [texto Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.txt), preservados integralmente com SHA-256 no manifesto.

Os cards identificam a coleção **OPUS** como fonte dos dados, mas não enumeram uma versão única de todos os corpora de treinamento nem uma licença única dessa coleção. Os dados de treinamento não são redistribuídos pelo Grafelume. Os READMEs originais preservam as fontes, agradecimentos e referências; não se atribui uma licença única a todos os corpora OPUS.

O projeto OPUS-MT solicita citar:

- Tiedemann et al. (2023), [Democratizing neural machine translation with OPUS-MT](https://doi.org/10.1007/s10579-023-09704-w), Language Resources and Evaluation.
- Tiedemann e Thottingal (2020), [OPUS-MT — Building open translation services for the World](https://aclanthology.org/2020.eamt-1.61/), EAMT.

Os arquivos `NOTICE.md`, `MODEL_CARD.md`, `UPSTREAM_MODEL_CARD.md`, `OPUS-MT_MODEL_README.md`, `OPUS-MT_PROJECT_README.md`, `LICENSE-APACHE-2.0.txt` e `LICENSE-CC-BY-4.0.txt` são distribuídos junto a cada direção para manter esses avisos disponíveis também no pacote estático.
