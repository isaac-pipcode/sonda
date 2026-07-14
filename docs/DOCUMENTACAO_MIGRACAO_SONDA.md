# FSA Data — Documentação de Migração para a Sonda

> Base de dados reproduzível sobre o Fundo Setorial do Audiovisual (FSA/ANCINE),
> construída para alimentar a **Sonda** (agregadora de dados) e sustentar
> pesquisa acadêmica sobre política audiovisual brasileira.
>
> Este documento é o ponto de partida para retomar o trabalho no Claude Code.
> Ele registra **o que existe, como foi feito, o que se pode afirmar e o que não se pode**.

---

## 1. Estado atual — o que já está pronto

Um banco SQLite (`fsa.db`, ~5 MB) com **quatro núcleos de dados** integrados e auditados:

| Núcleo | Fonte | Cobertura | Granularidade |
|---|---|---|---|
| **Fomento** | Dados Abertos ANCINE (conj. 22) + OCR dos Relatórios de Gestão | 2008–2024 | contrato |
| **Obra/Mercado** | Dados Abertos (conj. 11, 28) | 1995–2026 | obra (CPB) |
| **Receita/Retorno** | OCR dos Relatórios de Gestão | 2016–2024 | ano × fonte |
| **Exibição** | ANCINE + IBGE (planilha) | atual | município |

Pipeline **reprodutível de ponta a ponta**, do PDF bruto ao dado analisável, com auditoria automatizada (`06_auditoria.py`) que fecha com **veredito APROVADO** (0 erros críticos).

---

## 2. Como o banco foi construído (a cadeia de scripts)

Os scripts são numerados na ordem de execução. Cada um faz UMA coisa e grava
suas correções no próprio código (princípio firme: *correção que não está no
script não existe* — aprendido quando correções feitas direto no banco se
perderam num rebuild).

```
 FASE 1-3  CORPUS E FOMENTO (dos relatórios em PDF/imagem)
   01_normaliza_corpus.py      ZIPs-de-JPEG → OCR (Tesseract PT) → texto
   02_schema_fsa.sql           esquema estrela inicial (dimensões + fatos)
   03_extrai_carrega.py        parser dos anexos DOU → receitas + contratos
   05_parser_templates_antigos.py  tabela UF 2009-15 via re-OCR 3x + checksum
   06_auditoria.py             auditoria em 5 eixos (rodar após QUALQUER carga)

 FASE 4  BILHETERIA E CRUZAMENTO (dos dados abertos)
   10_schema_cpb.sql           tabelas de bilheteria + ponte contrato↔CPB
   11_ingesta_oca.py           conj. 11 (ponte), 28 (bilheteria), 22 (contratos)
   12_validacao_cruzada.py     OCR × dados abertos → concordância 99,5%

 FASE 5  SÉRIE HISTÓRICA COMPLETA
   13_serie_historica.py       conj.22 → série 2008-23 + ponte híbrida ao CPB

 FASE 6-7  ENRIQUECIMENTO E CONTROLE
   15_enriquecimento.py        conj. 3 (UF/município) + conj. 10 (incentivo)
   17_ingesta_exibicao.py      salas por município (ANCINE+IBGE)

 ANÁLISES (leem o banco, não o modificam)
   14_analise_retornabilidade.py     hipótese da (não-)retornabilidade
   16_analise_controle_regional.py   confundimento FSA×incentivo + cota regional
```

**Scripts auxiliares** (rodam na máquina do pesquisador, exigem acesso a gov.br):
`00_verifica_oca.py` (inspeciona um CSV do OCA antes de ingerir),
`08/09` (versão probabilística do matcher — **substituída** pela determinística
via CPB, mantida só como referência histórica).

### Para reconstruir tudo do zero

```bash
python3 -c "import sqlite3; sqlite3.connect('fsa.db').executescript(open('02_schema_fsa.sql').read())"
python3 03_extrai_carrega.py
python3 05_parser_templates_antigos.py
python3 -c "import sqlite3; sqlite3.connect('fsa.db').executescript(open('10_schema_cpb.sql').read())"
python3 11_ingesta_oca.py --ponte conj11.csv --bilheteria conj28.csv --contratos conj22.csv
python3 13_serie_historica.py
python3 15_enriquecimento.py --produtoras conj3.csv --incentivo conj10.csv
python3 17_ingesta_exibicao.py salas.xlsx
python3 06_auditoria.py          # deve terminar em APROVADO
```

---

## 3. O modelo de dados

### Chaves (o que liga o quê)

Três chaves primárias distintas governam todo o ecossistema:

- **`CPB`** (Certificado de Produto Brasileiro) — identifica a OBRA. Formato `B` + 13 dígitos.
- **`CNPJ`** — identifica o AGENTE (produtora, distribuidora, exibidor).
- **`n_contrato`** — identifica o CONTRATO de fomento (`PR-04.293` nos relatórios; `04293` nos dados abertos → normalizado para `4293`).

**A ponte crítica** é `ponte_contrato_cpb` (conj. 11): é o ÚNICO elo entre o universo do fomento e o da obra. Sem ela, o cruzamento seria por título (probabilístico).

### Tabelas principais

```
FOMENTO
  fato_contrato_serie   4.473  contratos 2008-24 (fonte primária: dados abertos)
                               campos-chave: cpb, cpb_metodo, cpb_score,
                               valor_contratado, valor_liberado, uf/municipio_proponente
  fato_contrato           859  contratos 2021-22 (fonte: OCR, p/ validação cruzada)
  ponte_contrato_cpb    3.249  contrato ↔ CPB

OBRA / MERCADO
  fato_bilheteria       2.293  obras BR lançadas: público, renda, distribuidora
  fato_fomento_indireto 3.155  obras com Lei de Incentivo (CPB + SALIC; SEM valor)

RECEITA / RETORNO (só dos relatórios — NÃO há dado aberto)
  fato_receita             65  receita do FSA por ano × fonte
  fato_agregado_anual      72  distribuição regional 2009-15

EXIBIÇÃO
  fato_exibicao_municipio 502  salas/assentos/população por município
  fato_exibicao_uf         27  idem consolidado por UF

DIMENSÕES
  dim_uf, dim_proponente, dim_projeto, dim_chamada, dim_linha_acao, dim_relatorio
```

### Visões analíticas (o atalho para as perguntas de pesquisa)

| Visão | Responde |
|---|---|
| `vw_serie_fomento_mercado` | fomento × bilheteria por obra (749 obras pareadas) |
| `vw_fomento_controlado` | idem, SEPARANDO "só FSA" de "FSA + incentivo" |
| `vw_serie_funil` | do contrato à sala: sem_CPB / CPB_sem_sala / em_cartaz |
| `vw_producao_x_exibicao` | por UF: % do fomento × % das salas × densidade |
| `vw_receita_anual` | série de receitas do FSA |

---

## 4. Achados já estabelecidos (com suas ressalvas)

Cada achado abaixo está implementado e reproduzível. As ressalvas **não são
opcionais** — são o que separa uma afirmação defensável de uma frágil.

### 4.1 A retornabilidade das obras é marginal (`14_...`)
- Retorno de investimentos = **≤2,4% da receita** do FSA. O fundo vive de
  tributos (Condecine-Teles, FISTEL) e rendimentos, não das obras.
- Recuperação corrente = **2%–10% do desembolso** do exercício.
- *Ressalva*: não é a taxa de retorno de uma coorte ao longo da vida comercial
  (a ANCINE não publica retorno por contrato). Baixo retorno ≠ baixo valor
  público (a lei prevê "externalidades": emprego, cultura).

### 4.2 O efeito do FSA está confundido com o da Lei de Incentivo (`16_...`)
- **61%** das obras do FSA que chegaram às salas TAMBÉM tiveram incentivo indireto.
- Obras "só FSA": público mediano **637**, razão renda/FSA **0,04**.
- Obras "FSA + incentivo": público mediano **5.930**.
- *Ressalva*: associação, não causalidade (viés de seleção — obras com maior
  potencial atraem mais fontes). O conj. 10 traz só presença, não valor.

### 4.3 Concentração: não é "Sudeste", são duas cidades (`16_...`)
- **Rio + São Paulo = 53,1%** de todo o fomento (nível municipal).
- Cota legal de 30% p/ N+NE+CO: descumprida até ~2019, cumprida em 2020-24.
- *Ressalva*: valor liberado (a lei pode referir-se ao reservado); UF = sede
  da produtora, não local de filmagem; ~9% da série sem UF.

### 4.4 Desigualdade de exibição (`17_...`)
- Sudeste: **2,26 salas/100 mil hab**; Nordeste: **1,14** (metade).
- Rio produz 25,5% do fomento mas tem só 10,9% das salas (descompasso +14,6pp).

---

## 5. Como eu prepararia estes dados para pesquisadores usarem

*(resposta à pergunta central do projeto)*

O banco hoje é excelente para análise por quem entende sua construção. Para
que **pesquisadores externos** o usem com segurança — que é o propósito da
Sonda — faltam quatro camadas. Em ordem de prioridade:

### (a) Camada semântica: proveniência e confiança em CADA célula
O ativo mais valioso desta base não são os números — é saber **de onde cada
número veio e quanto confiar nele**. Isso já existe disperso (`cpb_metodo`,
`cpb_score`, `dim_relatorio.observacoes`, os `qa_*.tsv`). Proposta: consolidar
numa tabela `proveniencia` (entidade, campo, fonte, método, score, data) e
expor isso na API da Sonda. Um pesquisador precisa poder perguntar: *"este
valor de contrato veio do OCR ou do dado aberto? foi validado?"* — e o sistema
responder. **Sem isso, a base é um número sem asterisco; com isso, é ciência.**

### (b) Dicionário de dados legível (data dictionary)
Cada tabela e coluna documentada em linguagem que um pesquisador de cinema —
não de banco de dados — entenda: o que é `valor_liberado` vs `valor_contratado`,
por que `cpb_score < 1` importa, o que significa `estagio = 'CPB_sem_sala'`.
Gerável a partir dos comentários já nos scripts. Formato sugerido: um
`data_dictionary.md` + a mesma informação como tabela no banco (`meta_colunas`)
para a Sonda consumir.

### (c) Camada de "asteriscos" automatizada
Cada visão analítica deveria carregar suas ressalvas COM os dados, não à parte.
Ex.: `vw_producao_x_exibicao` deveria expor um campo `nota_metodologica` ou a
Sonda deveria anexar, a cada número, as limitações conhecidas (métrica usada,
% de cobertura, vieses). O objetivo: **tornar impossível citar um número sem
ver sua ressalva.** É a diferença entre um dado que informa e um que engana.

### (d) Contrato de estabilidade + versionamento
A Sonda vai reingerir dados (a ANCINE atualiza mensalmente). Proposta:
- versionar o banco (`schema_version`, `data_ingestao` por fonte);
- congelar os nomes de visões como "API pública" (o que pesquisadores citam
  não pode mudar de nome entre versões);
- um `CHANGELOG` de dados (não só de código): "em v2, o conj.22 de março/2026
  adicionou 340 contratos de 2024".

### Arquitetura sugerida para a Sonda

```
  camada 0  INGESTÃO   scripts 01-17 (idempotentes, reprodutíveis)
                        ↓ gravam em
  camada 1  BANCO      fsa.db (fatos + dimensões + proveniência + meta)
                        ↓ exposto por
  camada 2  API        views estáveis + endpoint de proveniência
                        ↓ consumido por
  camada 3  SONDA      agrega, cruza, e SEMPRE anexa as ressalvas
```

O princípio que orienta tudo: **um pesquisador deve conseguir reproduzir
qualquer número e ver sua proveniência e limitações sem falar com quem
construiu a base.** Essa é a definição operacional de "dado pronto para pesquisa".

---

## 6. Lacunas e próximos passos

**Lacunas de dados** (declarar em qualquer publicação):
1. Retorno POR CONTRATO — a ANCINE só publica agregado por objeto. Impede
   calcular taxa de retorno de coorte.
2. Valor do fomento indireto — conj. 10 traz só CPB+SALIC. Cruzar com base
   do SALIC (MinC) para obter valores.
3. Relatório de 2018 — o arquivo do projeto é duplicata do 2017 (MD5 idêntico).
   Rebaixar da ANCINE.
4. ~9% da série de contratos sem UF (CNPJs ausentes do conj. 3).

**Próximos passos técnicos:**
1. Implementar a tabela `proveniencia` e o `data_dictionary` (itens 5a, 5b).
2. Deflacionar valores por IPCA (hoje tudo em R$ correntes) — cria
   `fato_contrato_serie.valor_liberado_real` com ano-base a definir.
3. Cruzar exibição × bilheteria (conj. 28 → município da sala) para medir
   se as obras do FSA chegam aos municípios com menos salas.
4. Formalizar a API de visões para a Sonda (item 5d).

---

## 7. Arquivos do projeto

| Arquivo | Papel |
|---|---|
| `fsa.db` | **o banco** — ponto de partida no Claude Code |
| `01`–`17` (`.py`/`.sql`) | pipeline reprodutível (ver §2) |
| `README_metodologia.md` | detalhamento das fases 1-3 (corpus, OCR, auditoria) |
| `MAPA_CRUZAMENTOS_SONDA.md` | grafo de chaves e cruzamentos válidos entre conjuntos |
| `GUIA_ingestao_OCA.md`, `GUIA_conjuntos_3_e_10.md` | como baixar/ingerir dados novos |
| `relatorio_*.txt` | saídas das análises e auditorias |
| `qa_*.tsv` | linhas rejeitadas em cada extração (trilha de auditoria) |

**Primeiro comando no Claude Code:**
```bash
python3 06_auditoria.py    # confirma que o banco está íntegro (deve dar APROVADO)
```
