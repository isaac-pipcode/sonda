"""Séries anuais — o tempo como único eixo comum entre bases incomensuráveis.

Decisão 3 (incomensurabilidade): cada série mantém a sua unidade e a sua escala;
nada é somado, indexado nem reconciliado entre bases. O que as une é só o ano,
uma chave projetada no momento da consulta (decisão 4), nunca gravada.

Decisão 2 (transparência): cada série devolve as suas RESSALVAS junto com os
números, a cobertura real da fonte e, onde há, o que ficou de fora (`extras`).
Ano sem dado é `null`, nunca zero: a ausência é resultado.

Fontes: `fsa.db` (SQLite, lido por `fsa`) e o RIDAB (Parquet remoto fixado por
revisão, lido por `ridab`). Núcleo puro: recebe a conexão da FSA e o prefixo do
RIDAB, para ser testado offline.
"""
from __future__ import annotations

import sqlite3
from typing import Any, Optional

from . import fsa, ridab

MOEDAS = ("real", "nominal")
ANO_PISO, ANO_TETO, JANELA_MAX = 1990, 2100, 60

# tabelas do RIDAB lidas por este módulo (para a proveniência da resposta).
TABELAS_RIDAB = ("deflator_ipca", "renuncia_fiscal", "salas_exibicao_evolucao", "preco_ingresso")

_cache_ridab: dict[str, dict] = {}


def _num(v: Any) -> Optional[float]:
    return None if v is None else float(v)


# ── agregados do RIDAB (uma leitura por revisão: a revisão é imutável) ─────────
_cache_fator: dict[str, dict] = {}


def _fator_ipca(base: Optional[str]) -> dict[int, float]:
    """Fator IPCA (R$ de 2024) por ano, lido do RIDAB; leve e cacheado por revisão."""
    chave = ridab.revisao()
    if base is None and chave in _cache_fator:
        return _cache_fator[chave]
    con = ridab._conexao(base)
    try:
        linhas = con.execute("SELECT ano, fator_real_2024 FROM read_parquet(?)",
                             [ridab.url_tabela("deflator_ipca", base)]).fetchall()
    finally:
        con.close()
    fator = {int(a): float(f) for a, f in linhas}
    if base is None:
        _cache_fator[chave] = fator
    return fator


def _agregados_ridab(base: Optional[str]) -> dict:
    chave = ridab.revisao()
    if base is None and chave in _cache_ridab:
        return _cache_ridab[chave]

    con = ridab._conexao(base)
    try:
        def consulta(sql: str, tabela: str) -> list[tuple]:
            return con.execute(sql, [ridab.url_tabela(tabela, base)]).fetchall()

        fator = _fator_ipca(base)

        renuncia: dict[int, tuple[float, int]] = {}
        sem_ano = (0, 0.0)
        for a, n, v in consulta(
            "SELECT CAST(EXTRACT(year FROM data_pub_aprovacao_projeto) AS INTEGER), "
            "COUNT(*), SUM(total_captado) FROM read_parquet(?) GROUP BY 1",
            "renuncia_fiscal",
        ):
            if a is None:
                sem_ano = (int(n), float(v or 0))
            else:
                renuncia[int(a)] = (float(v or 0), int(n))

        salas = {int(a): int(n) for a, n in consulta(
            "SELECT CAST(ano AS INTEGER), COUNT(*) FROM read_parquet(?) "
            "WHERE status = 'ABERTA' GROUP BY 1", "salas_exibicao_evolucao")}

        ingresso = {int(a): (float(nom), float(real)) for a, nom, real in consulta(
            "SELECT ano, pmi_nominal, pmi_real_2024 FROM read_parquet(?) "
            "WHERE pmi_nominal IS NOT NULL ORDER BY ano", "preco_ingresso")}
    finally:
        con.close()

    # o RIDAB repete o último valor nos anos seguintes: valor repetido não é dado.
    omitidos: list[int] = []
    anos_ord = sorted(ingresso)
    while len(anos_ord) >= 2 and ingresso[anos_ord[-1]] == ingresso[anos_ord[-2]]:
        omitidos.append(anos_ord.pop())
        del ingresso[omitidos[-1]]

    res = {"fator": fator, "renuncia": renuncia, "renuncia_sem_ano": sem_ano,
           "salas": salas, "ingresso": ingresso, "ingresso_omitidos": sorted(omitidos)}
    if base is None:
        _cache_ridab[chave] = res
    return res


# ── agregados da FSA ────────────────────────────────────────────────────────────
def _agregados_fsa(con: sqlite3.Connection) -> dict:
    contratos = {int(a): (float(v or 0), int(n)) for a, n, v in con.execute(
        "SELECT ano_contrato, COUNT(*), SUM(valor_contratado) FROM fato_contrato_serie "
        "WHERE ano_contrato IS NOT NULL GROUP BY 1")}
    publico: dict[int, tuple[float, int]] = {}
    ultima_data = None
    for a, n, p, d in con.execute(
        "SELECT ano_lancamento, COUNT(*), SUM(publico), MAX(data_lancamento) "
        "FROM fato_bilheteria WHERE ano_lancamento IS NOT NULL GROUP BY 1"):
        publico[int(a)] = (float(p or 0), int(n))
        if ultima_data is None or (d and d > ultima_data):
            ultima_data = d
    return {"contratos": contratos, "publico": publico, "ultima_data_bilheteria": ultima_data}


def _serie(id_: str, base: str, titulo: str, unidade: str, anos: list[int],
           valores: dict[int, tuple[Optional[float], Optional[int]]], casas: int,
           ressalvas: list[str], parcial: frozenset = frozenset(), extras: Optional[dict] = None) -> dict:
    com_dado = sorted(a for a, (v, _) in valores.items() if v is not None)
    dados = []
    for a in anos:
        v, n = valores.get(a, (None, None))
        dados.append({"ano": a, "valor": None if v is None else round(v, casas),
                      "n": n, "parcial": a in parcial and v is not None})
    return {"id": id_, "base": base, "titulo": titulo, "unidade": unidade,
            "cobertura": {"de": com_dado[0] if com_dado else None,
                          "ate": com_dado[-1] if com_dado else None},
            "dados": dados, "ressalvas": ressalvas, "extras": extras or {}}


def calcular(de: int, ate: int, moeda: str = "real",
             fsa_con: Optional[sqlite3.Connection] = None, base: Optional[str] = None) -> dict:
    """Calcula as cinco séries anuais entre `de` e `ate` (inclusive).

    `moeda`: "real" (R$ de 2024, pelo IPCA do ano do evento) ou "nominal"
    (R$ correntes). `fsa_con` e `base` são injetáveis para testes offline.
    """
    if moeda not in MOEDAS:
        raise ValueError(f"moeda deve ser uma de {MOEDAS}")
    if not (ANO_PISO <= de <= ate <= ANO_TETO) or ate - de + 1 > JANELA_MAX:
        raise ValueError("intervalo de anos inválido")
    anos = list(range(de, ate + 1))
    real = moeda == "real"

    fechar = fsa_con is None
    if fechar:
        fsa_con = fsa._conn_sqlite()
    try:
        f = _agregados_fsa(fsa_con)
    finally:
        if fechar:
            fsa_con.close()
    r = _agregados_ridab(base)
    fator = r["fator"]

    def em_mi(valor_nominal: float, ano: int) -> Optional[float]:
        if not real:
            return valor_nominal / 1e6
        return valor_nominal * fator[ano] / 1e6 if ano in fator else None

    un_moeda = "R$ mi de 2024" if real else "R$ mi correntes"
    nota_ipca = ("Em R$ de 2024, o fator IPCA é o do ano do evento (RIDAB/IBGE), "
                 "não o do desembolso ou da captação.")

    fomento = {a: (em_mi(v, a), n) for a, (v, n) in f["contratos"].items()}
    renuncia = {a: (em_mi(v, a), n) for a, (v, n) in r["renuncia"].items()}
    publico = {a: (v / 1e6, n) for a, (v, n) in f["publico"].items()}
    salas = {a: (float(n), None) for a, n in r["salas"].items()}
    ingresso = {a: ((real_ if real else nom), None) for a, (nom, real_) in r["ingresso"].items()}

    parcial_pub: frozenset = frozenset()
    ud = f["ultima_data_bilheteria"]
    if ud and len(ud) >= 7 and int(ud[5:7]) < 12:
        parcial_pub = frozenset({int(ud[:4])})

    n_sem, v_sem = r["renuncia_sem_ano"]
    omitidos = r["ingresso_omitidos"]
    ressalvas_ing = ["Preço médio informado pela ANCINE; o valor real usa o fator IPCA base 2024 do RIDAB."]
    if omitidos:
        ressalvas_ing.append("O RIDAB repete o último valor em " + ", ".join(map(str, omitidos))
                             + "; esses anos foram omitidos (valor repetido não é dado).")

    series = [
        _serie("fomento_fsa", "fsa", "Fomento contratado", un_moeda, anos, fomento, 1, [
            "Valor do contrato por ano de publicação no DOU, com as parcelas somadas por obra, CNPJ e data.",
            nota_ipca,
            "Hipótese: o último ano da fonte pode estar incompleto; confira o número de contratos (n).",
        ]),
        _serie("renuncia_fiscal", "ridab", "Renúncia fiscal captada", un_moeda, anos, renuncia, 1, [
            "Total captado por ano de aprovação do projeto, não de captação.",
            f"{n_sem} projetos sem data de aprovação (R$ {v_sem / 1e6:.1f} mi correntes) ficam fora das séries.",
            nota_ipca,
        ], extras={"sem_ano": {"projetos": n_sem, "valor_mi_correntes": round(v_sem / 1e6, 1)}}),
        _serie("publico_obras_brasileiras", "fsa", "Público das obras brasileiras",
               "milhões de espectadores", anos, publico, 2, [
            "Espectadores acumulados em salas das obras brasileiras, por ano de lançamento (conj. 28 da ANCINE).",
            "Só cinema: obras de TV e VoD não aparecem.",
            *(["O último ano é parcial: lançamentos até " + ud + "."] if parcial_pub else []),
        ], parcial=parcial_pub),
        _serie("salas_abertas", "ridab", "Salas abertas", "salas com status aberta", anos, salas, 0, [
            "Salas com status \"ABERTA\" em cada ano no cadastro da ANCINE; "
            "salas \"fechadas temporariamente\" não entram (em 2020 foram a maioria).",
        ]),
        _serie("preco_ingresso", "ridab", "Preço médio do ingresso",
               "R$ por ingresso, de 2024" if real else "R$ por ingresso, correntes",
               anos, ingresso, 2, ressalvas_ing),
    ]

    avisos = ["Cada série tem a sua própria unidade e escala: nada foi somado nem indexado entre bases.",
              "Ano sem dado é nulo, não zero."]
    if not real:
        avisos.append("Valores em R$ correntes: não comparáveis entre anos sem deflacionar.")
    return {"moeda": moeda, "de": de, "ate": ate, "anos": anos, "series": series, "avisos": avisos}
