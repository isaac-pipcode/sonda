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

## Componentes

| Arquivo | Papel |
|---|---|
| `sonda/api.py` | FastAPI: catálogo, raw, snapshots, cruzamentos, execução, fork |
| `sonda/engine.py` | motor DuckDB de cruzamento (junção, órfãos, contrato gerativo) |
| `sonda/ingest.py` | envelope coletado → snapshot imutável + raw_record |
| `sonda/db.py` · `schema.sql` | Postgres, esquema, gatilhos append-only |
| `sonda/provenance.py` | envelope de proveniência + fixity |
| `coleta_real_mapas.py` | coletor da API do Mapa Cultural (rodar em rede aberta) |
| `SondaApp.jsx` · `sonda_api_client.js` | frontend e cliente para a API real |
| `seed.py` · `fixtures/` | popula o protótipo (fac-símiles offline) |

## Base FSA (dataset de segunda ordem)

`data/fsa.db` é uma base de pesquisa madura sobre o **Fundo Setorial do
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
