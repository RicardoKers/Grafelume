# OPUS-MT — atribuição e procedência

Modelo original: Helsinki-NLP/opus-mt-en-ROMANCE, desenvolvido pelo grupo Helsinki-NLP / Universidade de Helsinki, projeto OPUS-MT.
Conversão de pesos para ONNX/Transformers.js: Xenova (Joshua Lochner), Xenova/opus-mt-en-ROMANCE.
O Grafelume redistribui os arquivos quantizados q8 sem alterar os pesos. O alias local en-pt não identifica um modelo novo.

O card original fixado declara Apache-2.0; o README do projeto OPUS-MT fixado declara CC-BY-4.0 para os modelos pré-treinados. As duas declarações são preservadas junto com os textos completos das licenças; o card de conversão ONNX não declara outra licença própria. A licença MIT do aplicativo não relicencia esses arquivos.

Dados de treinamento: coleção OPUS, conforme os cards. Eles não enumeram uma versão única nem todas as licenças dos corpora; não se atribui uma licença única à coleção OPUS. Os dados de treinamento não são redistribuídos pelo Grafelume. A documentação original fixada em OPUS-MT_MODEL_README.md e OPUS-MT_PROJECT_README.md preserva as fontes, agradecimentos e referências.

Referências solicitadas pelo projeto:
- Jörg Tiedemann et al. (2023), Democratizing neural machine translation with OPUS-MT, Language Resources and Evaluation. https://doi.org/10.1007/s10579-023-09704-w
- Jörg Tiedemann e Santhosh Thottingal (2020), OPUS-MT — Building open translation services for the World, EAMT. https://aclanthology.org/2020.eamt-1.61/

Fontes fixadas:
- https://huggingface.co/Xenova/opus-mt-en-ROMANCE/resolve/9d2ba69ac80c8e8453c3d9a1e2323a0e7b8ca3cd/README.md
- https://huggingface.co/Helsinki-NLP/opus-mt-en-ROMANCE/resolve/f8f3a28e8b6272d0ccc0290b832f699e154ae431/README.md
- https://raw.githubusercontent.com/Helsinki-NLP/OPUS-MT-train/d5e932c96d77596378010aa7e7f1caeb8ccaa9f8/models/en-fr+fr_BE+fr_CA+fr_FR+wa+frp+oc+ca+rm+lld+fur+lij+lmo+es+es_AR+es_CL+es_CO+es_CR+es_DO+es_EC+es_ES+es_GT+es_HN+es_MX+es_NI+es_PA+es_PE+es_PR+es_SV+es_UY+es_VE+pt+pt_br+pt_BR+pt_PT+gl+lad+an+mwl+it+it_IT+co+nap+scn+vec+sc+ro+la/README.md
- https://raw.githubusercontent.com/Helsinki-NLP/OPUS-MT-train/d5e932c96d77596378010aa7e7f1caeb8ccaa9f8/README.md

Os hashes SHA-256 e tamanhos de todos os arquivos distribuídos constam em src/translation/models.json no repositório Grafelume.
