# RIDAB × Sonda — inventário e verificação de chaves

Verificação feita em 2026-11-01 sobre o **RIDAB** (Repositório Independente dos
Dados do Audiovisual Brasileiro): 110 datasets, 471 tabelas, 7 fontes
(ANCINE, CNC, BFI, INCAA, ACAU, Lumière, IBGE), CC-BY-4.0 (dados) e MIT (código).

- Catálogo: <https://riabr-dados.github.io/riab/datasets/>
- Dados: <https://huggingface.co/datasets/riabr-dados/riab> (pasta `cleaned/`, Parquet)
- **Revisão verificada (fixity):** `6c5e6ae1ce5a866b76039e1f3dce7776cf22dfe1`
  (última modificação 2026-09-09). Toda leitura abaixo fixa essa revisão.

Complementa `MAPA_CRUZAMENTOS_SONDA.md`. O RIDAB é uma base **tratada por
terceiros**: entra na Sonda com autoria e proveniência próprias, sem fundir-se
ao vocabulário da `fsa.db` (decisão 3).

## 1. Resultado principal

| Pergunta | Resposta verificada |
|---|---|
| `fomento_fsa` do RIDAB é validação independente da nossa `fato_contrato_serie`? | **Não.** É a mesma fonte (conj. 22). Valor contratado: R$ 3.658,8 mi em ambas; valor liberado: R$ 3.576,8 mi em ambas. Agregando por CNPJ + data DOU, as 4.235 chaves coincidem 100%, com valores iguais. |
| Por que 4.588 linhas lá e 4.473 aqui? | Granularidade: nós somamos parcelas por obra+CNPJ+data. A agregação preserva os totais, o que valida nossa soma de parcelas, **não** os vínculos ao CPB. |
| O RIDAB resolve a UF/município do proponente? | **Em grande parte.** `agentes_economicos` traz `codigo_municipio_ibge`: 4.094 dos 4.473 contratos (91,5%) recebem código IBGE via CNPJ. Onde há UF nas duas bases, concordam em 3.970 de 3.989 (99,5%). Preenche 105 das 392 UFs ausentes. |
| Resolve o valor captado do fomento indireto? | **Em grande parte.** `renuncia_fiscal` traz `total_captado` por SALIC. Dos 3.120 SALIC distintos de `fato_fomento_indireto`, 2.780 (89,1%) casam, somando R$ 4.999,1 mi nominais. |
| Resolve a deflação? | **Sim.** `deflator_ipca` cobre 2008–2024 (`fator_real_2024` de 1,0 a 2,455). Todos os 4.473 contratos têm ano coberto. |
| Há CPB no RIDAB? | `fomento_fsa` **não** tem. `obras_fomento_indireto` tem (`cpb`, `numero_salic`). A ponte contrato→CPB (conj. 11) continua só na Sonda. |

## 2. Ressalvas que devem acompanhar qualquer número

1. **Formatos de chave divergem.** O RIDAB grava CNPJ pontuado (`68.610.302/0001-15`) e SALIC como `00-0040`; a Sonda usa só dígitos (`02825596000194`, `030147`). Sem normalizar (`regexp_replace(x, '[^0-9]', '', 'g')`), os cruzamentos retornam **zero** correspondências. Registrar a normalização na proveniência do cruzamento.
2. **Município é o do cadastro atual.** `agentes_economicos` é retrato recente (campo `data_registro`), não a sede à época do contrato. Usar o último registro por CNPJ é aproximação.
3. **Valores nominais.** `total_captado` e `valor_contrato_brl` não vêm deflacionados; aplicar `fator_real_2024` pelo ano do evento.
4. **Duplicidade aparente.** 39 grupos de (CNPJ, data, valor) se repetem em `fomento_fsa`; pode ser parcela real ou duplicata. Não tratado.
5. **O ensaio "fomento-fsa" não é fonte primária.** Declara-se trabalho em andamento e opinião do autor. Seu universo de 855 obras (lançadas em sala, 2014–2023) é um recorte distinto do nosso (749 obras); **não** há evidência de que a diferença seja de critério de ligação.
6. **`riabr-dados/riab` ≠ ensaio.** A grafia do repositório varia entre RIDAB, RIAB e `riabr-dados`; usar `riabr-dados/riab`.

## 3. Tabelas do RIDAB com maior valor para a Sonda

Colunas lidas diretamente dos Parquet (revisão acima).

| Tabela (`cleaned/…`) | Linhas | Chaves / campos relevantes | Uso na Sonda |
|---|---|---|---|
| `agentes_economicos` | 18.962 | `cnpj`, `uf`, `municipio`, `codigo_municipio_ibge`, `natureza_juridica`, `brasileiro_independente` | `dim_agente`; liga FSA, OCA e Mapa Cultural ao município IBGE |
| `renuncia_fiscal` | 4.315 | `numero_salic`, `total_captado` e 17 colunas `captado_*` por mecanismo, `cnpj_proponente`, `municipio_proponente` | valor do fomento indireto |
| `obras_fomento_indireto` | 3.179 | `cpb`, `numero_salic` | ponte CPB↔SALIC (já temos 3.155) |
| `fomento_fsa` | 4.588 | `cnpj_proponente`, `cnpj_produtora`, `cnpj_programadora`, `valor_contrato_brl`, `valor_total_liberado_brl` | comparação de totais; **sem CPB** |
| `deflator_ipca` | 17 | `ano`, `ipca_pct`, `fator_real_2024` | deflação |
| `salas_exibicao_complexos` | 6.405 | `cnpj_exibidor`, `municipio_complexo`, `uf_complexo`, assentos | parque exibidor (conj. 6) |

Não localizados com o nome presumido (404; nomes reais a confirmar no catálogo):
`fsa_projetos`, `obras_nao_publicitarias`, `obras_investimento_fsa`,
`bilheteria_consolidada`.

Do catálogo (colunas não verificadas): Condecine (7 datasets), Ibermedia e
coprodução internacional (país parceiro), Lumière (filmes brasileiros na
Europa), "Brasil no Mundo" (6 tabelas, com nível de evidência por linha), CNC,
BFI, INCAA e ACAU para a dimensão comparada.

## 4. Reprodução

```python
import duckdb
REV = "6c5e6ae1ce5a866b76039e1f3dce7776cf22dfe1"
B = f"https://huggingface.co/datasets/riabr-dados/riab/resolve/{REV}/cleaned/"
con = duckdb.connect(); con.execute("INSTALL httpfs; LOAD httpfs;")
con.execute(f"""
  create table r_fsa as
  select *, regexp_replace(cnpj_proponente, '[^0-9]', '', 'g') as cnpj,
         cast(data_extrato_contrato_dou as date) as d
  from read_parquet('{B}fomento_fsa.parquet')""")
```

Observação técnica: o `sqlite_scanner` do DuckDB falhou ao anexar `data/fsa.db`
(a view `vw_producao_x_exibicao` usa `RIGHT/FULL OUTER JOIN`, não suportado ao
preparar o esquema). Nesta verificação as tabelas foram lidas com `sqlite3` e
carregadas no DuckDB; é o caminho de fallback já previsto em `sonda/engine.py`.

## 5. Estado e próximos passos

Feito (`sonda/ridab.py`, `GET /api/ridab/contratos-enriquecidos`, `POST /api/ridab/registrar`, `tests/test_ridab.py`):
leitura remota fixada por revisão, normalização de CNPJ, enriquecimento com código IBGE e fator IPCA como **visão**, ressalvas por coluna derivada.
Contra o Hugging Face real a visão reproduz 4.094 de 4.473 contratos com código IBGE.

Pendente:
1. `registrar_snapshot` não foi exercitado contra Postgres (os testes são offline); validar no CI com o serviço Postgres.
2. Aresta `derivado` no percurso para `valor_captado` via SALIC (ressalvas 2 e 3).
3. Abrir o dicionário de cada dataset de interesse para confirmar chaves (CPB, IBGE) antes de novos cruzamentos.
4. ~~Decidir se `data/fsa.db` continua versionado~~ — decidido: hospedada fora do git; o repositório guarda só o pin `data/fsa.db.sha256` e `baixar_fsa.py`. O arquivo segue no histórico dos commits anteriores (reescrever o histórico não foi feito).
