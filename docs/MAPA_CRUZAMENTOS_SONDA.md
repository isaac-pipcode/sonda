# Mapa de Cruzamentos — Dados Abertos ANCINE → Sonda

## 1. As chaves que existem (e as que não existem)

O ecossistema de dados da ANCINE tem **três chaves primárias distintas**, e entender qual conjunto tem qual é o que determina o que se pode cruzar:

| Chave | O que identifica | Conjuntos que a trazem |
|---|---|---|
| **CPB** | a obra certificada | 7, 8, 9, 10, **11**, 12, 17, 19, 21, **28**, 30 |
| **CNPJ** | o agente econômico | 1, 2, **3**, 6, 8, 17, 18, **22**, 23, 24, 28 |
| **Nº contrato FSA** | o contrato de fomento | **11**, e os Relatórios de Gestão |

**A descoberta que estrutura tudo:** o conjunto **11** é o único que liga `nº contrato FSA` ↔ `CPB`. Ele é a ponte entre o universo do *fomento* e o universo da *obra*. Sem ele, o cruzamento fomento×mercado seria probabilístico.

**A armadilha:** o conjunto **22** (contratos FSA) **não traz o nº do contrato**. Então a rota 22 → 11 → 28 exige título como intermediário. Verificado: 97,9% dos títulos do conj.11 mapeiam para um CPB único, então o risco é baixo — mas o método deve ser registrado por vínculo (ver `13_serie_historica.py`, campo `cpb_metodo`/`cpb_score`).

---

## 2. Cruzamentos VÁLIDOS (implementados ou prontos para implementar)

### ✅ Implementados

| Rota | Chave | Confiança | O que responde |
|---|---|---|---|
| 22 → 11 → 28 | contrato→CPB→CPB | 0,95–1,00 | fomento × bilheteria (4.473 contratos, 749 obras) |
| Relatórios → 11 → 28 | nº contrato | **1,00** | idem, determinístico, mas só 2021-22 |
| 22 ⟷ Relatórios | CNPJ+data+valor | — | **validação cruzada** (concordância 99,5%) |

### ✅ Prontos para implementar (alto valor)

| Rota | Chave | O que responde |
|---|---|---|
| **22 → 3** | CNPJ produtora | **UF e município da produtora em TODA a série** — hoje só temos UF de 2021-22. Resolve a análise de concentração regional histórica. |
| **22 → 7** | título/CNPJ | tipo/subtipo da obra, ano de produção → separa longa de série de curta com rigor |
| **11 → 10** | CPB | **obras com FSA *e* Lei de Incentivo** → isola o efeito do FSA. Metodologicamente crítico: sem isso, atribui-se ao FSA um desempenho que teve outras fontes. |
| **11 → 30** | CPB | coproduções internacionais → participação patrimonial brasileira |
| **28 → 6** | CNPJ exibidor | bilheteria × parque exibidor (concentração da exibição) |

### ⚠️ Cruzamentos com ressalva

| Rota | Problema |
|---|---|
| 22 → 23 (renúncia fiscal) | chave é SALIC, não CPB. Junção só por CNPJ+título → probabilística. |
| 17/21 (bilheteria diária) | granularidade excessiva (milhões de linhas). Só vale para estudar padrões de exibição — semanas em cartaz, distribuição geográfica das sessões. |

---

## 3. Arquitetura para a Sonda

O modelo de dados que emergiu é um **grafo de três núcleos**:

```
   [AGENTE]                [FOMENTO]                  [OBRA]                [MERCADO]
   conj. 1,2,3      →      conj. 22        →       conj. 7,11      →      conj. 28
   CNPJ, UF,               contratos,              CPB, tipo,            público,
   município,             valores,                 coprodução           renda,
   nível                  desembolso                                    distribuidora
       │                       │                        │                     │
       └───────CNPJ────────────┴────nº contrato─────────┴────────CPB──────────┘
                                    (conj. 11 = a ponte)
```

**Tabelas canônicas sugeridas para a Sonda:**

- `dim_agente` (CNPJ, razão social, UF, município, nível, tipo) ← conj. 1, 3, 6
- `dim_obra` (CPB, título, tipo, subtipo, ano produção, coprodução) ← conj. 7, 30
- `fato_fomento` (contrato, CNPJ, CPB, chamada, valor contratado, valor liberado, data DOU) ← conj. 22 + 11
- `fato_mercado` (CPB, data lançamento, público, renda, distribuidora) ← conj. 28
- `fato_retorno` (ano, objeto, nº operações, valor recuperado) ← **Relatórios de Gestão** (não há conjunto aberto!)
- `fato_receita` (ano, fonte, valor) ← **Relatórios de Gestão**

**Nota crítica para a Sonda:** os dois últimos — retorno e receita — **não existem nos dados abertos**. Só os Relatórios de Gestão os têm. Isso significa que o pipeline de OCR **não é descartável**: ele é a única fonte para exatamente as variáveis que sustentam a análise da retornabilidade.

---

## 4. Lacunas de dados (declarar na pesquisa)

1. **Retorno por contrato/obra**: a ANCINE publica o retorno *agregado por objeto financiável* (Tabela 13 dos relatórios), nunca por contrato. Impossível, com dado público, calcular a taxa de retorno de uma coorte ao longo da vida comercial.
2. **UF do proponente na série**: ausente do conj. 22; recuperável via conj. 3 (CNPJ).
3. **Relatório de 2018**: o arquivo do projeto é duplicata do de 2017 (MD5 idêntico). Rebaixar.
4. **Fomento indireto (Lei de Incentivo)**: sem cruzar o conj. 10, análises de "eficácia do FSA" confundem o efeito do FSA com o de outras fontes.
