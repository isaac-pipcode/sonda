# Sonda — Observatório de Dados e Políticas do Cinema e Audiovisual

Stack: Python (definir framework)
Repositório: isaac-pipcode/sonda (privado)
Idioma: português do Brasil (código, commits, docs)

## Identidade do projeto

O Sonda é um **agregador de interoperabilidade de segunda ordem** — não é um banco de dados temático, mas um sistema que cruza, versiona e expõe ligações entre bases de dados do audiovisual brasileiro. Princípio fundador: **"a ligação é a resposta, não a premissa"**.

## Regras para o agente

- **Idioma**: todo código, comentário, commit e documentação em português do Brasil
- **Estilo de código**: Python com type hints, docstrings em pt-BR
- **Commits**: convencionais em pt-BR
- **Privacidade**: repositório privado
- **Dados**: nunca commitar bases de dados brutas — apenas scripts de ETL e documentação

## Arquitetura

- **Schema-on-read**: os esquemas são aplicados na leitura, não na ingestão
- **Cruzamentos versionados**: cada cruzamento entre bases gera uma versão rastreável
- **Interoperabilidade**: o Sonda não armazena os dados primários — mapeia e conecta
- **APIs e conectores**: ingestão de APIs públicas (Mapa Cultural, OCA/Ancine, LPG/MinC, FSA)

## Bases prioritárias

1. Mapa Cultural (prioridade)
2. OCA/Ancine
3. LPG/MinC — Lei Paulo Gustavo
4. FSA — Fundo Setorial do Audiovisual

## Referências

Projeto do Claude: conversas no projeto "Pesquisas". Documento de referência: "Projeto_SONDA_ANCINE.docx" (anexado ao projeto "Pesquisas" do Claude). Relatórios de gestão do FSA em `c:/c/Users/claude/projects/` (projeto "FSA", 7 docs).
