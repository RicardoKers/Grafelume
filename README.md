# Grafelume

**Escreva com clareza.** Editor de texto simples com correção ortográfica local em português brasileiro e inglês americano.

O Grafelume funciona inteiramente no navegador: sem contas, backend, inteligência artificial, rastreadores ou envio dos textos para servidores. O código da aplicação usa licença MIT; os dicionários e as dependências preservam suas próprias licenças.

## Executar localmente

Requer Node.js 24 LTS e npm.

```sh
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite. O servidor de desenvolvimento usa a raiz `/`; o build de produção usa `/Grafelume/`.

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run build
npm run test:e2e -- --project=chromium
npm run preview
```

O build está em **`dist/`**. Para verificar instalação e modo offline, utilize `npm run preview` e abra `http://localhost:4173/Grafelume/`. Service Workers exigem HTTPS ou localhost. Abrir `dist/index.html` diretamente como arquivo não funciona.

## Usar o editor

- Escreva ou cole texto simples e selecione Português (Brasil) ou English (US).
- Erros ortográficos recebem sublinhado vermelho. O botão direito apresenta sugestões; a revisão lateral também permite navegar e corrigir ocorrências.
- A revisão básica, opcional, identifica problemas determinísticos de espaços, repetição e pontuação com sublinhado azul. Não realiza análise gramatical de concordância.
- Adicione termos ao dicionário pessoal ou ignore-os durante a sessão. Cada idioma possui seu próprio dicionário pessoal.
- Copie, importe ou exporte TXT em UTF-8. Alterações e correções individuais podem ser desfeitas pelo histórico do editor.
- Ajuste tema, fonte, tamanho, largura, espaçamento e preferências nas configurações.

Somente as preferências e o dicionário pessoal são persistidos. **O texto em edição não é salvo automaticamente.** Copie ou exporte antes de fechar ou atualizar a aplicação. As permissões de área de transferência dependem do navegador; quando uma operação é bloqueada, os atalhos nativos continuam disponíveis.

## Instalação e funcionamento offline

O primeiro acesso precisa de conexão para baixar a aplicação. O idioma selecionado carrega seu dicionário sob demanda. A ação **Preparar offline** baixa e armazena os dois dicionários; aguarde a confirmação de conclusão. O indicador de disponibilidade distingue um dicionário ainda não armazenado de um disponível offline.

Depois do download, o Service Worker atende os recursos locais do cache. A instalação como aplicação está disponível quando o navegador oferece essa opção. O armazenamento pode ser removido pelo usuário, pelo modo privado ou pelas políticas de espaço do navegador. Não é possível garantir disponibilidade offline depois dessa remoção.

Quando houver uma nova versão, a atualização é oferecida mediante ação explícita. Exporte ou copie o texto antes de aceitar, pois a página será recarregada. A documentação técnica explica o versionamento de caches e dicionários.

## Publicar no GitHub Pages

O projeto está preparado para **`RicardoKers/Grafelume`**, com endereço esperado [ricardokers.github.io/Grafelume](https://ricardokers.github.io/Grafelume/). A existência ou publicação desse repositório não é presumida.

1. Crie um repositório público vazio chamado `Grafelume` na conta `RicardoKers`.
2. Versione os arquivos locais, incluindo `package-lock.json`, e envie a branch `main` ao repositório.
3. Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**.
4. Habilite Actions se necessário e acompanhe o workflow **Verificar e publicar no GitHub Pages**.

Exemplo para um diretório ainda sem Git:

```sh
git init -b main
git add .
git commit -m "feat: primeira versão do Grafelume"
git remote add origin https://github.com/RicardoKers/Grafelume.git
git push -u origin main
```

O workflow instala o lockfile, verifica tipos, executa testes unitários, gera o build e executa testes reais em Chromium antes de publicar `dist/`. Pull requests executam as verificações sem publicar. Somente o job de publicação recebe permissões de Pages e identidade OIDC. Consulte a [documentação oficial de configuração do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Se renomear o repositório, ajuste `base` em `vite.config.ts` e a URL dos testes. Os caminhos de dicionários, manifesto e Service Worker derivam da mesma base.

## Arquitetura e documentação

Vue 3 organiza a interface. CodeMirror 6 fornece edição, seleção, composição IME, histórico e decorações de sublinhado. O motor Hunspell compilado para WebAssembly processa os dicionários em um Web Worker e as regras simples de revisão ficam separadas. Dependências de produção são empacotadas localmente.

- [Arquitetura](docs/ARCHITECTURE.md)
- [Desenvolvimento, testes e limitações](docs/DEVELOPMENT.md)
- [Privacidade e armazenamento](docs/PRIVACY.md)
- [Licenças e fontes das dependências](docs/LICENSES.md)
- [Origem e limites dos dicionários](docs/DICTIONARIES.md)

## Limitações e evolução

A primeira versão corrige ocorrências individualmente. Correção em lote, DOCX/PDF, tradução, colaboração e análise gramatical completa ficam fora do escopo. Nomes próprios, termos recentes e combinações linguísticas não cobertas pelos dicionários podem precisar do dicionário pessoal. O motor utiliza o Hunspell real, mas a cobertura lexical depende das versões dos dicionários incluídos; não se promete equivalência com a configuração de uma instalação específica do LibreOffice.

Os resultados efetivamente medidos e os navegadores verificados devem ser consultados em [DEVELOPMENT.md](docs/DEVELOPMENT.md). O conjunto de testes disponível não equivale a certificação de todos os navegadores, teclados e métodos de composição.

Evoluções possíveis: novos idiomas, revisão conservadora com mais casos reais, correções em lote com prévia e testes adicionais de acessibilidade e IME. A arquitetura permite essas extensões sem transmitir textos.
