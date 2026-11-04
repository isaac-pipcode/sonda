# SONDA

> **Observatório de Dados e Políticas do Audiovisual (UFF)**
> Agregador de segunda ordem das bases que pesquisadores produziram sobre o
> audiovisual brasileiro. **Carbono ancora. Sinal interfere. Sonar lê.**

A Sonda **não é um banco de dados sobre o audiovisual**; é uma infraestrutura
que reúne datasets dispersos, preserva sua heterogeneidade, e permite cruzá-los
sob demanda com proveniência total. A tese completa está em
[`docs/README_Sonda.md`](docs/README_Sonda.md) — leia antes de alterar o modelo.

Este repositório contém o **MVP do backend** (FastAPI + PostgreSQL/JSONB +
DuckDB) mais os artefatos de design e coleta.

## Arquitetura (README §4)

```
FONTES          INGESTÃO            PERSISTÊNCIA           SERVIÇO + FRONTEND
Mapa Cultural → conector + PROV  →  PostgreSQL (JSONB)  →  FastAPI (proveniência
OCA             (Python)            = camada raw            sempre)
LPG (fase 3)                        snapshots append-only   DuckDB (junções sob
                                    cruzamento (receita)    demanda, lê snapshots)
                                    execucao (série temp.)  React (SondaApp.jsx)
```

As **sete decisões invioláveis** são encarnadas no código, não só na doc:

| Decisão | Onde vive |
|---|---|
| 1 Agregadora, não base temática | `raw_record` guarda o dataset com autoria/proveniência |
| 2 Transparência radical | `sonda/provenance.py`: **toda** resposta da API traz `proveniencia` |
| 3 Incomensurabilidade | sem esquema unificado; entidade nativa preservada; junção por chave projetada |
| 4 Schema-on-read | `nativo` JSONB intacto; `engine.extrair_chave` projeta a chave na consulta |
| 5 Receita, não resultado | tabela `cruzamento`; execução é sob demanda no DuckDB |
| 6 Série temporal | tabela `execucao` append-only (gatilho recusa UPDATE/DELETE) |
| 7 Arquivamento estratificado | `snapshot` imutável; `regime_retencao = "a definir pela prática"` |

A **Sonda generativa**: um cruzamento com `direita: null` devolve o *contrato de
base faltante* — com a **pergunta de pesquisa no topo** e o eixo de ligação como
hipótese (`?`). Ver `engine.contrato_base_faltante`.

A **rede de caminhos** (Documento 02): a análise não é a junção A×B, é um
**percurso multi-salto** — cadeia de nós (entidades) e arestas (articulações),
possivelmente entre bases distintas. Cada aresta é `factual` (articulação real,
executada pelo motor), `derivado` (dado inferido, ex.: preço = renda÷público) ou
`ausente` (o elo que nenhuma base fecha → contrato de base faltante). O percurso
é objeto persistente (irmão do cruzamento) e sua execução é série temporal
append-only. Ver `sonda/percurso.py` e `/api/percursos`.

## Componentes

| Arquivo | Papel |
|---|---|
| `sonda/api.py` | FastAPI: catálogo, raw, snapshots, cruzamentos, execução, fork |
| `sonda/engine.py` | motor DuckDB de cruzamento (junção, órfãos, contrato gerativo) |
| `sonda/percurso.py` | motor de travessia multi-salto (rede de caminhos, Documento 02) |
| `sonda/ingest.py` | envelope coletado → snapshot imutável + raw_record |
| `sonda/db.py` · `schema.sql` | Postgres, esquema, gatilhos append-only |
| `sonda/provenance.py` | envelope de proveniência + fixity |
| `coleta_real_mapas.py` | coletor da API do Mapa Cultural (rodar em rede aberta) |
| `SondaApp.jsx` · `sonda_api_client.js` | frontend e cliente para a API real |
| `seed.py` · `fixtures/` | popula o protótipo (fac-símiles offline) |

## Base FSA (dataset de segunda ordem)

`data/fsa.db` (hospedada **fora do git**; ver abaixo) é uma base de pesquisa madura sobre o **Fundo Setorial do
Audiovisual** (ANCINE): fatos, dimensões, visões analíticas estáveis e uma
camada de proveniência/ressalvas embutida (`meta_tabela`, `meta_coluna`). Entra
na Sonda como **base de primeira classe** ao lado do Mapa Cultural — **sem** ser
fundida a um vocabulário comum (decisão 3). O motor DuckDB a lê **in-place**
(`sqlite_scanner`; fallback `sqlite3` offline), sem reformatar o nativo.

| Endpoint | O que devolve |
|---|---|
| `GET /api/fsa/tabelas` | inventário das tabelas/visões, na ontologia própria |
| `GET /api/fsa/dicionario` | descrição, fonte, cobertura e **ressalvas por coluna** |
| `GET /api/fsa/consulta/{nome}` | uma tabela/visão estável, **com as ressalvas das colunas anexadas** |
| `POST /api/fsa/registrar` | registra a FSA como snapshot imutável (idempotente por fixity) |

Princípio encarnado: **impossível citar um número sem ver seu asterisco** — cada
consulta devolve as ressalvas metodológicas das colunas retornadas. Docs da base:
`docs/DOCUMENTACAO_MIGRACAO_SONDA.md`, `docs/MAPA_CRUZAMENTOS_SONDA.md`.

**Obtendo a `fsa.db`.** A base não é versionada (só o pin `data/fsa.db.sha256`).
Defina `SONDA_FSA_URL` (e `SONDA_FSA_TOKEN`, se a hospedagem for privada) e rode
`python baixar_fsa.py`: o arquivo só é instalado se o sha256 bater com o pin.
No deploy, `fly deploy --build-arg SONDA_FSA_URL=…`; no CI, a variável de
repositório `SONDA_FSA_URL` (e o segredo opcional `SONDA_FSA_TOKEN`). Sem a
variável, os testes da FSA são pulados.

## Base RIDAB (dataset de terceira ordem)

O [RIDAB](https://huggingface.co/datasets/riabr-dados/riab) reúne dados oficiais
(ANCINE, IBGE…) **já tratados por terceiros**. É lido por DuckDB direto do Parquet
remoto, fixado a uma **revisão** (commit) — nenhum dado é versionado aqui. Entra
com autoria e proveniência próprias, sem fusão com a FSA (decisão 3).

| Endpoint | O que devolve |
|---|---|
| `GET /api/ridab/contratos-enriquecidos` | contratos da FSA + código IBGE do proponente (via CNPJ) + valores em R$ de 2024; **visão calculada**, nada gravado |
| `POST /api/ridab/registrar` | snapshot imutável (referência: revisão + sha256 por arquivo), idempotente |

Variáveis: `SONDA_RIDAB_REV` (revisão fixada) e `SONDA_RIDAB_BASE` (prefixo
alternativo dos Parquet, para testes offline/espelho). Chaves, cobertura e
ressalvas verificadas: `docs/RIDAB_INVENTARIO.md`.

## Séries anuais (o tempo como único eixo comum)

`GET /api/series?de=2009&ate=2026&moeda=real|nominal` devolve cinco séries —
fomento contratado (FSA), renúncia fiscal captada, público das obras brasileiras,
salas abertas e preço médio do ingresso (RIDAB) — **cada uma na sua unidade e
escala** (decisão 3: nada é somado nem indexado entre bases). Ano sem dado é
`null`, nunca zero; cada série traz `cobertura`, `ressalvas` e o que ficou de
fora (`extras`, ex.: projetos de renúncia sem data de aprovação). `real` aplica o
fator IPCA do **ano do evento** (RIDAB/IBGE). A proveniência das duas bases vem
lado a lado; os agregados do RIDAB são lidos uma vez por revisão (imutável).
Núcleo em `sonda/series.py`, testável offline.

`GET /api/territorio?moeda=real|nominal` devolve o fomento contratado do FSA e as
salas de exibição **por UF da produtora proponente** (não do local da obra): as
partes são calculadas sobre os contratos com UF, os sem UF vêm à parte, e uma
população que contradiz os municípios da própria base é sinalizada em `verificar`,
não corrigida. `GET /api/ligacoes/funil` mostra o que liga e o que sobra do contrato
à obra (CPB) e à bilheteria, com segmentos exclusivos (seguro · ambíguo · sem obra),
órfãos por ano e por chamada, os maiores contratos sem obra e o elo ausente.

## Como rodar

```bash
pip install -r requirements.txt

# 1. Postgres (um só serviço)
docker compose up -d db
export SONDA_DATABASE_URL=postgresql://sonda:sonda@localhost:5432/sonda

# 2. Coleta real (em rede aberta) OU fac-símile offline via seed
python coleta_real_mapas.py            # gera sonda_mapas_cinema_AAAA-MM-DD.json
python seed.py                         # esquema + ingestão + cruzamentos + 2 execuções

# 3. API (proveniência em toda resposta; docs em /docs)
uvicorn sonda.api:app --reload

# 4. Frontend: aponte o SondaApp.jsx ao cliente sonda_api_client.js
#    (VITE_SONDA_API=http://localhost:8000)
```

Ingerir um JSON coletado manualmente:

```bash
python -c "from sonda.ingest import ingerir_arquivo; \
  print(ingerir_arquivo('sonda_mapas_cinema_2026-05-02.json', 'mapa_cultural'))"
```

## Testes

```bash
pytest tests/ -q      # motor de cruzamento (DuckDB, sem banco)
```

## Deploy (estratégia Split)

O backend é um **contêiner sempre-ligado** (README §4: "1 VM/contêiner"); o
Postgres é **gerenciado e externo**, livre para escalar; o frontend é **estático
na Vercel**. Nenhuma das sete decisões muda — só a topologia.

```
Vercel (web/)  ──VITE_SONDA_API──▶  Backend FastAPI+DuckDB (Fly/Render)  ──▶  Postgres gerenciado (Neon/Supabase)
SondaApp.jsx                         Dockerfile · pool de conexões              JSONB · snapshots append-only
```

**1. Postgres gerenciado** (Neon/Supabase). Crie o banco e copie a connection
string **pooled** (no Neon, o host com `-pooler`). O pool de conexões
(`psycopg_pool`) evita esgotar o limite quando o banco escala.

**2. Backend** (Fly.io de exemplo; Render/Railway equivalem):
```bash
fly launch --no-deploy          # usa o Dockerfile e fly.toml
fly secrets set SONDA_DATABASE_URL="postgresql://…-pooler…/sonda?sslmode=require"
fly deploy
# carregar dados de teste (fac-símiles) uma vez:
fly ssh console -C "python seed.py"
```

**3. Frontend** (Vercel): o jeito limpo é apontar o **Root Directory = `web`**
nas configurações do projeto Vercel — assim a Vercel vê só o app Vite e nunca o
`requirements.txt` da raiz (que dispararia o builder Python por engano).
Como rede de segurança, há um `vercel.json` na raiz que força o build só do
frontend (`framework: null`, build de `web/`), caso o Root Directory fique na raiz.
Defina a variável de ambiente:
```
VITE_SONDA_API = https://<seu-backend>.fly.dev
```

Variáveis em `.env.example`. CORS já está liberado na API para o frontend.

### Cron de ingestão

`.github/workflows/coleta.yml` roda toda segunda (06:00 UTC) e por disparo
manual: coleta do Mapa Cultural (`coleta_real_mapas.py`) e ingere como **novo
snapshot datado** — append-only, o histórico só cresce (decisões 6 e 7). O JSON
coletado é guardado como artefato (proveniência). Requer o segredo de
repositório **`SONDA_DATABASE_URL`** (a mesma connection string pooled do banco
gerenciado). Defina em *Settings → Secrets and variables → Actions*.

## Definição de pronto (README §9) — estado

- [x] Coleta com proveniência + fixity (`coleta_real_mapas.py`; fac-símile em `fixtures/`)
- [x] Postgres JSONB + primeiro snapshot datado imutável
- [x] FastAPI catálogo + cruzamento, **proveniência em toda resposta**
- [x] Cruzamento re-executável gerando ≥ 2 pontos de série temporal
- [x] Elo ausente com contrato de base faltante (pergunta no topo)
- [x] Cliente JS para o `SondaApp.jsx` apontar à API real
- [x] Nenhum antipadrão da §6 introduzido

> Nota honesta de proveniência: as `fixtures/` são fac-símiles de estrutura para
> teste offline (o sandbox não tem acesso a `mapas.cultura.gov.br`). Em rede
> aberta, `coleta_real_mapas.py` produz o envelope real, ingerível pelo mesmo
> pipeline.
