# Histórico de versões

## 1.1.0 — 7 de novembro de 2026

- Correções em lote no painel de revisão, com escolha explícita de uma sugestão por ocorrência.
- Prévia Antes/Depois com contexto, linha/coluna e indicação de espaços, quebras de linha e remoções.
- Aplicação em uma única transação, permitindo desfazer ou refazer o lote inteiro sem misturá-lo à digitação.
- Seleções podem ser trocadas, removidas ou descartadas; fechar a prévia conserva as escolhas.
- Validação contra documento alterado, intervalos inválidos e correções sobrepostas; proteção de termos técnicos no modo em lote.
- Escolhas e prévia permanecem apenas na memória, com suporte offline nos dois idiomas.
- Painel sem cartões sobrepostos no celular e prévia longa com título e botões sempre visíveis.

## 1.0.1 — 7 de novembro de 2026

- Melhor contraste e tamanho de texto nas ações de revisão, nas informações do documento e no rodapé, nos temas claro e escuro.
- Sugestões para espaços e quebras de linha com descrições explícitas, inclusive para leitores de tela.
- O menu pelo teclado preserva o trecho selecionado. Copiar e recortar ficam desativados quando a seleção está vazia.
- O menu se reposiciona quando as sugestões chegam ou a janela muda de tamanho, mantendo os comandos dentro da tela.
- Desativar o corretor limpa mensagens de falha pendentes e mantém a revisão básica independente.
- Uma nova tentativa pode recriar o Worker após falha de carregamento ou tempo esgotado, preservando o documento.
- Resultados assíncronos de disponibilidade offline e sugestões respeitam o idioma atual.

## 1.0.0 — 6 de novembro de 2026

- Editor de texto simples com histórico, seleção, importação e exportação TXT.
- Hunspell local em WebAssembly e Web Worker, com dicionários PT-BR e EN-US.
- Revisão básica determinística, painel de ocorrências, menu de sugestões e dicionário pessoal por idioma.
- Preferências locais, temas claro e escuro e interface responsiva com cabeçalho compacto.
- PWA instalável, recursos e dicionários disponíveis offline após o download.
- Publicação automática no GitHub Pages depois dos testes.
