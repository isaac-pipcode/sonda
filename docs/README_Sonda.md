# SONDA — README para Agente de Prototipagem

> **Observatório de Dados e Políticas do Audiovisual (UFF)**
> Plataforma agregadora de dados de políticas públicas culturais — piloto: setor audiovisual brasileiro.
>
> Este documento é endereçado a um **agente de IA** que irá prototipar a Sonda. Leia-o inteiro antes de escrever código. As seções `🔒 INVIOLÁVEL` descrevem decisões já tomadas após longa deliberação conceitual: **não as reabra nem as "simplifique"** — elas são a tese do projeto, não detalhes de implementação. As seções `🚫 ANTIPADRÃO` descrevem otimizações que parecem sensatas e que destroem o projeto.

---

## 0. O que é a Sonda em uma frase

A Sonda **não é um banco de dados sobre o audiovisual**; é um **agregador de segunda ordem** das bases que pesquisadores produziram sobre o audiovisual — uma infraestrutura que reúne datasets dispersos, preserva sua heterogeneidade, permite cruzá-los sob demanda com proveniência total, e **cresce a partir do que lhe falta**.

Lema da identidade, que também resume a arquitetura: **Carbono ancora. Sinal interfere. Sonar lê.**

---

## 1. As sete decisões invioláveis

Cada uma foi decidida deliberadamente, contra a alternativa "mais fácil". A coluna *não faça* é o erro que um otimizador local cometeria.

| # | Decisão `🔒` | Por quê | 🚫 Não faça |
|---|---|---|---|
| 1 | **Agregadora, não base temática** | A entidade de primeira classe é o *dataset*, com proveniência e autoria. | Não modele "filmes/salas/editais" como se a Sonda fosse a fonte primária. |
| 2 | **Agregação profunda (cruzamento real) com transparência radical** | O valor está em cruzar; a confiança, em rastrear. | Não entregue só um catálogo de links (raso); não cruze sem registrar a linhagem. |
| 3 | **Incomensurabilidade é recurso, não defeito** | Bases têm ontologias distintas e devem permanecer distintas; o atrito é produtivo. | Não crie um "esquema unificado" que force todas as bases a um vocabulário comum. |
| 4 | **Parâmetros emergem da coleta (schema-on-read)** | Impor ontologia *a priori* é redutor; a estrutura se constrói na leitura. | Não defina um schema rígido na ingestão. Guarde o dado nativo; projete estrutura na consulta. |
| 5 | **O cruzamento é objeto persistente** | Autoral, versionado, bifurcável, com falibilidade exposta. Persiste-se a *receita*, não o resultado. | Não salve tabelas de resultado materializadas como se fossem verdade estável. |
| 6 | **O cruzamento é série temporal** | Cada execução é evento datado imutável; com regra fixa, a variação mede o mundo. | Não sobrescreva execuções. O histórico só cresce. |
| 7 | **Arquivamento estratificado e diferido** | Instantâneos imutáveis das fontes; retenção por tipo de dado; classificação adiada à prática. | Não arquive dado pessoal bruto. Não decida agora o que é "pessoal" — deixe o campo reservado. |

---

## 2. As bases-piloto (e o que cada uma exige)

| Base | Regime | Acesso técnico | Fricção a tratar |
|---|---|---|---|
| **Mapa Cultural** (MinC) | Federado, programático | API REST pública, JSON. `/api/{entidade}/find` com `@select`, `@limit`, `@page`, filtros `eq/like/BET/AND/OR/GEONEAR`, taxonomias `term:linguagem=LIKE(Cinema)`, e `/api/site/version`. | Federação de instâncias em versões distintas. **Comece por aqui** — é a mais tratável. |
| **OCA** (Ancine) | Aberto, estruturado | CSV não-proprietário (dados.gov.br); painéis. | CSV traz notas técnicas embutidas como linhas — exige saneamento estrutural antes da leitura. |
| **LPG** (MinC) | Disperso, documental | Transferegov, diários oficiais, PDFs, planilhas. | Não é uma base: é um arquipélago de milhares de prestações de contas. **Adie** — entra por último, sempre parcial. |

---

## 3. Conceitos centrais que a UI deve encarnar

### 3.1 As quatro porosidades
A interface é **porosa**: deixa passar a heterogeneidade em vez de filtrá-la (design *seamful*, não *seamless*).
1. **Ontológica** — entidades de cada base lado a lado, na língua própria; nunca um conceito médio.
2. **Proveniência** — todo dado exibido carrega origem/versão/query/coleta/saneamento ao alcance de um clique.
3. **Articulação** — o cruzamento é montado pelo pesquisador (eixos: agente, território, tempo, função), não pré-fabricado.
4. **Incompletude** — o que não se liga é *exibido como achado*, não escondido.

### 3.2 A rede de caminhos (traversal multi-salto)
A análise não é uma junção A×B, é um **percurso**: filme → salas → território → público → preço. Cada nó é entidade, cada aresta é articulação com proveniência. Distinga visualmente: nó **factual**, nó **derivado** (ex.: preço = renda÷público), elo **ausente** (tracejado).

### 3.3 A Sonda generativa (a contribuição central)
O elo ausente não diz só "não existe"; diz "não existe *ainda*, e tem esta forma". Ao clicá-lo, abre-se o **contrato de base faltante**:
- **Coração do contrato = a PERGUNTA de pesquisa** (não o eixo de ligação).
- O **eixo de ligação é hipótese a confirmar**, exibido abaixo, com "?" — "a ligação é a resposta, não a premissa".
- O contrato nasce com **regime de retenção reservado** (dado de pessoas → agregado + fixity, nunca rastro nominal).

A ausência é **gerador**: a Sonda é um agregador em permanente expansão das próprias bases.

---

## 4. Arquitetura mínima viável (para testes)

Princípio: **corta-se infraestrutura, nunca princípio.** Tudo que pode ser um só serviço, é.

```
FONTES            INGESTÃO              PERSISTÊNCIA          SERVIÇOS + FRONTEND
Mapa Cultural →   conector + PROV   →   PostgreSQL (JSONB)  →  FastAPI (catálogo,
OCA (fase 2)      (script Python)       = camada raw           raw, cruzamentos;
LPG (fase 3)      cron leve             snapshots append-only  proveniência sempre)
                                        cruzamentos (receita,  React (SondaApp.jsx)
                                        execução, fork)        DuckDB (motor: junções
                                                               sob demanda, lê snapshots)
```

| Camada | Escolha mínima | Razão |
|---|---|---|
| Coleta | Python + `requests` | `coleta_real_mapas.py` já existe. |
| Banco | PostgreSQL + JSONB | Um serviço. JSONB = dado nativo consultável (schema-on-read). |
| Motor de cruzamento | DuckDB embarcado | Junções analíticas sob demanda, sem mover dados, sem servidor próprio. |
| API | FastAPI | Proveniência em cada resposta; doc automática. |
| Frontend | React (`SondaApp.jsx`) | Quatro visões já construídas; apontar para a API. |
| Hospedagem | 1 VM/contêiner | Suficiente para 2–5 pesquisadores-teste. |

### Roteiro de 4 semanas
1. **Coleta** — rodar `coleta_real_mapas.py` (Mapa Cultural, linguagem Cinema) → JSON com proveniência + fixity.
2. **Persistência** — Postgres, carregar JSON em JSONB, gerar primeiro snapshot datado.
3. **Serviço** — FastAPI servindo catálogo + 1 cruzamento; DuckDB executando a junção.
4. **Interface e validação** — `SondaApp.jsx` na API real, frente a 2–3 pesquisadores.

---

## 5. Modelo de dados (orientação, não esquema rígido)

> Lembre da decisão 4: o dado nativo **não** é normalizado. As tabelas abaixo são o *envelope* em torno do dado, não uma reformatação dele.

- **`raw_record`**: `id`, `base`, `entidade`, `nativo (JSONB)`, `proveniencia (JSONB)`. O campo `nativo` guarda o payload original intacto.
- **`proveniencia`** (embutida): `fonte`, `fonte_url`, `instancia_versao`, `query`, `coletado_em`, `saneamento[]`, `regime_retencao` (default: `"a definir pela prática"`), `fixity` (sha256).
- **`snapshot`** (append-only, imutável): `snapshot_id`, `fonte`, `instancia_versao`, `entidade`, `capturado_em`, `carga (JSONB)`, `fixity`, `politica_retencao (JSONB)`. **Nunca** UPDATE/DELETE.
- **`cruzamento`** (a receita): `id`, `nome`, `autor`, `versao_regra`, `receita (JSONB: eixo, regra, limiar, versoes_fonte)`, `derivado_de` (para forks).
- **`execucao`** (série temporal): `cruzamento_id`, `data`, `ligados`, `orfaos`, `mudanca`, `tipo (base|migracao)`. Append-only.

---

## 6. Antipadrões — o que destrói a Sonda

- **🚫 Esquema unificado.** Mapear OCA, LPG e Mapa a um vocabulário comum "para facilitar o JOIN". Isto mata a decisão 3. Mantenha as ontologias distintas; cruze por eixos situados.
- **🚫 Pré-computar cruzamentos.** Materializar resultados "por performance". Mata as decisões 5 e 6. Persista a *receita*; execute sob demanda com DuckDB.
- **🚫 Esconder a incompletude.** Filtrar órfãos do resultado "para limpar a tela". Mata a 4ª porosidade. Órfãos e elos ausentes são *achados* — exiba-os (tracejado, cor Sinal).
- **🚫 Limpar o dado silenciosamente.** Remover notas técnicas do CSV do OCA sem registrar. Toda transformação vai no campo `saneamento[]`.
- **🚫 Arquivar dado pessoal bruto.** Guardar nomes/raça/geolocalização em snapshots. Use agregado + fixity. Mata a decisão 7 e fere a LGPD.
- **🚫 Classificar retenção agora.** Decidir no código o que é "pessoal". Deixe `regime_retencao = "a definir pela prática"`; projete o *lugar* da resposta, não a resposta.
- **🚫 Contrato de base faltante centrado no eixo técnico.** O coração é a *pergunta de pesquisa*; o eixo é hipótese. Inverter isto reduz a Sonda a um sistema de dados em vez de um programa de pesquisa.
- **🚫 Interface seamless.** Transições que fazem três bases parecerem um reservatório homogêneo. A costura é o motivo visual; exiba-a.

---

## 7. Identidade visual — Espectro 1.0

O isótipo **é** a tese: linhas de dados paralelas (bases), uma interferida por um nó que a desvia (Sinal = o achado/a anomalia/a incompletude), com leitura vertical tracejada (Sonar = o ato de sondar). Use os tokens de `sonda_design_tokens.js`.

| Cor | HEX | Papel **semântico** (não decorativo) |
|---|---|---|
| Carbono | `#0E1116` | Âncora. Fundo escuro; dado em repouso. |
| Sinal | `#FF3D2E` | **Interferência**: achado, aresta factual em foco, incompletude. Sempre o que desvia o fluxo. Raro e significativo. |
| Sonar | `#00C2A8` | Leitura: dado derivado, articulação, ligação efetiva. |
| Osso | `#F2EEE5` | Texto/superfícies sobre Carbono. |
| Pergaminho | `#FAF7F0` | Fundo claro alternativo. |
| Sedimento | `#6B6A66` | Estrutura neutra; rótulos secundários; linhas de fundo. |

**Tipografia:** Archivo 800 (display/wordmark, com o "O" em Sinal) · IBM Plex Mono (proveniência, metadados — a "marca d'água de origem") · Newsreader (prosa, perguntas de pesquisa). As três vozes = três registros: institucional, técnico-probatório, reflexivo. Mantenha-as separadas.

---

## 8. Artefatos já existentes (reutilize, não reescreva)

- `SondaApp.jsx` — protótipo unificado, 4 visões (Catálogo, Percurso, Trajetória, Cruzamentos). Ponto de partida do frontend.
- `coleta_real_mapas.py` — coletor da API do Mapa Cultural, com proveniência e fixity. Pronto para rodar em rede aberta.
- `sonda_ingest_mapas.py` — pipeline de ingestão (transporte injetável, testável).
- `sonda_arquivamento.py` — camada de arquivamento (snapshots imutáveis, retenção estratificada).
- `sonda_design_tokens.js` — tokens de cor/tipografia oficiais.
- Documentos `.docx` 01–04 — decisões fundadoras, rede de caminhos, arquitetura de teste, guia de design.

---

## 9. Definição de pronto (para o protótipo de teste)

- [ ] Coleta real do Mapa Cultural executada; JSON com proveniência + fixity gravado.
- [ ] Postgres carregado (JSONB), primeiro snapshot datado imutável criado.
- [ ] FastAPI servindo catálogo + 1 cruzamento, **com proveniência em toda resposta**.
- [ ] Cruzamento re-executável gerando ao menos 2 pontos de série temporal.
- [ ] Pelo menos 1 elo ausente exibido com contrato de base faltante (pergunta no topo).
- [ ] `SondaApp.jsx` apontando para a API real; as 4 porosidades visíveis.
- [ ] Nenhum antipadrão da seção 6 presente.

---

## 10. Em caso de dúvida

Se uma decisão técnica colide com um princípio, **o princípio vence** — registre a tensão e exponha-a (a transparência vale também para o processo de construção). Se algo não está especificado, prefira a opção que **preserva a heterogeneidade, a proveniência e a contestabilidade**, mesmo que pareça menos eficiente. A ineficiência aparente costuma ser a tese.
