# Dicionário de Dados — FSA / Sonda

*Gerado por `18_metadados.py`. Cada tabela traz sua fonte, cobertura e as colunas que exigem interpretação cuidadosa.*


## `fato_contrato_serie`  (4,473 registros)

Contratos de fomento do FSA — FONTE PRIMÁRIA.

- **Fonte:** Dados Abertos ANCINE (conj. 22) + ponte ao CPB (conj. 11)
- **Cobertura:** 2008–2024, granularidade: contrato (parcelas somadas por obra+CNPJ+data)


| Coluna | Descrição | Ressalva |
|---|---|---|
| `cpb_metodo` | Como o contrato foi ligado ao CPB da obra: 'num_contrato' (determinístico, via conj.11), 'titulo' (por título único), 'titulo_ambiguo' (título com >1 CPB). | Vínculos 'titulo_ambiguo' (score 0.60) ficam FORA das visões analíticas por padrão — precisam de triagem manual. |
| `cpb_score` | Confiança do vínculo ao CPB: 1.00 determinístico, 0.95 título único, 0.60 título ambíguo. | As visões usam score ≥ 0.95. Baixar o limiar amplia cobertura mas introduz risco de falso pareamento. |
| `uf_proponente` | UF da sede da produtora proponente. | É a SEDE da produtora, NÃO o local de filmagem. ~9% da série sem UF. |
| `valor_contratado` | Valor do contrato publicado no DOU (R$ correntes). | R$ correntes — NÃO deflacionado. Para série temporal, aplicar IPCA. |
| `valor_liberado` | Valor efetivamente desembolsado ao projeto (R$ correntes). Só os dados abertos trazem isto — os relatórios não. | Pode ser < valor_contratado (desembolso em parcelas ao longo dos anos). |

## `fato_contrato`  (859 registros)

Contratos extraídos por OCR dos Relatórios de Gestão. Usado para VALIDAÇÃO CRUZADA do conj.22 (concordância medida: 99,5%).

- **Fonte:** OCR dos Relatórios de Gestão do FSA (2021-22)
- **Cobertura:** 2021–2022, granularidade: contrato


## `ponte_contrato_cpb`  (3,249 registros)

Elo entre o nº de contrato do FSA e o CPB da obra. Chave do cruzamento fomento×mercado.

- **Fonte:** Dados Abertos ANCINE (conj. 11)
- **Cobertura:** granularidade: contrato × CPB (N:N)


## `fato_bilheteria`  (2,293 registros)

Desempenho comercial das obras brasileiras lançadas em salas.

- **Fonte:** Dados Abertos ANCINE (conj. 28)
- **Cobertura:** 1995–2026, granularidade: obra (CPB)


| Coluna | Descrição | Ressalva |
|---|---|---|
| `cpb` | Certificado de Produto Brasileiro — chave da obra. | — |
| `publico` | Espectadores acumulados em salas. | Só bilheteria de CINEMA. Obras de TV/VoD não aparecem aqui. |

## `fato_fomento_indireto`  (3,155 registros)

Obras que receberam fomento INDIRETO (Lei do Audiovisual/Rouanet). ATENÇÃO: traz apenas CPB+SALIC, SEM valor captado.

- **Fonte:** Dados Abertos ANCINE (conj. 10)
- **Cobertura:** granularidade: obra (CPB)


| Coluna | Descrição | Ressalva |
|---|---|---|
| `numero_salic` | Nº do projeto no SALIC (sistema das Leis de Incentivo, MinC). | Permite, no futuro, cruzar com a base do SALIC para obter o VALOR captado — que este conjunto não traz. |

## `fato_receita`  (65 registros)

Receita do FSA por fonte. NÃO EXISTE em dado aberto — só nos relatórios. Base da análise de retornabilidade.

- **Fonte:** OCR dos Relatórios de Gestão
- **Cobertura:** 2016–2024, granularidade: ano × fonte


| Coluna | Descrição | Ressalva |
|---|---|---|
| `fonte_receita` | Origem da receita do FSA (normalizada). | 'retorno de investimentos' = retorno das OBRAS. 'retorno de financiamento' = amortização de empréstimo (mecanismo distinto — não confundir na análise de retornabilidade). |

## `fato_agregado_anual`  (72 registros)

Distribuição regional do fomento (valor selecionado) por UF e ano.

- **Fonte:** OCR do Relatório 2015 (tabela cumulativa 2009-15)
- **Cobertura:** 2009–2015, granularidade: ano × UF


## `fato_exibicao_municipio`  (502 registros)

Parque exibidor: salas, assentos e população por município.

- **Fonte:** ANCINE (salas registradas) + IBGE (população)
- **Cobertura:** atual, granularidade: município


| Coluna | Descrição | Ressalva |
|---|---|---|
| `salas_por_100mil_hab` | Densidade de salas: salas × 100.000 / população. | Métrica de ACESSO. Média nacional ≈ 1,80. Compara desigualdade de infraestrutura entre regiões. |

## `fato_exibicao_uf`  (27 registros)

Idem consolidado por UF (subtotais validados por checksum).

- **Fonte:** ANCINE + IBGE
- **Cobertura:** atual, granularidade: UF
