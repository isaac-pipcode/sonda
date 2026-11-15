"""O fundo — o que entra no FSA, o que sai e o que volta, por ano.

Base: `fato_receita` da fsa.db (receitas por fonte, extraídas por OCR dos
Relatórios de Gestão; não existem em dado aberto) e os contratos da série.
Decisão 3: receita, contratação e retorno ficam lado a lado, em R$ correntes,
sem índice composto. A razão retorno ÷ receita é descrita como tal, não como
"taxa de retorno" das obras (há defasagem entre contratar e retornar).
"""
from __future__ import annotations

import sqlite3
from typing import Optional

from . import fsa

# fonte_receita da fsa.db → grupo legível; a ordem é a da exibição.
GRUPOS = {
    "retorno de investimentos": "Retorno das obras (investimentos)",
    "retorno de financiamento": "Retorno de empréstimos (financiamento)",
    "restituicao de recursos de fomento": "Restituição de recursos",
    "condecine - teles": "Condecine",
    "condecine - titulo": "Condecine",
    "condecine - remessa": "Condecine",
    "condecine - intra": "Condecine",
    "condecine - divida ativa": "Condecine",
    "fistel": "Fistel",
    "remuneracao depositos": "Remuneração de depósitos",
    "nao aplicacao lei audiovisual": "Não aplicação da Lei do Audiovisual",
}
RETORNOS = ("Retorno das obras (investimentos)", "Retorno de empréstimos (financiamento)", "Restituição de recursos")
ORDEM = list(dict.fromkeys(GRUPOS.values())) + ["Outras"]


def calcular(fsa_con: Optional[sqlite3.Connection] = None) -> dict:
    fechar = fsa_con is None
    if fechar:
        fsa_con = fsa._conn_sqlite()
    try:
        receitas = fsa_con.execute("SELECT ano, fonte_receita, SUM(valor) FROM fato_receita "
                                   "WHERE ano IS NOT NULL GROUP BY 1, 2").fetchall()
        contratos = {int(a): (float(c or 0), float(lib or 0), int(n)) for a, c, lib, n in fsa_con.execute(
            "SELECT ano_contrato, SUM(valor_contratado), SUM(valor_liberado), COUNT(*) FROM fato_contrato_serie "
            "WHERE ano_contrato IS NOT NULL GROUP BY 1")}
    finally:
        if fechar:
            fsa_con.close()

    por_ano: dict[int, dict[str, float]] = {}
    for ano, fonte, valor in receitas:
        g = GRUPOS.get((fonte or "").strip().lower(), "Outras")
        d = por_ano.setdefault(int(ano), {})
        d[g] = d.get(g, 0.0) + float(valor or 0)

    anos = sorted(por_ano)
    mi = lambda v: round(v / 1e6, 1)  # noqa: E731
    linhas = []
    for a in anos:
        d = por_ano[a]
        total = sum(d.values())
        c = contratos.get(a)
        linhas.append({
            "ano": a,
            "receita_total_mi": mi(total),
            "por_fonte_mi": {g: mi(d[g]) for g in ORDEM if g in d},
            "retornos_mi": mi(sum(d.get(g, 0.0) for g in RETORNOS)),
            "retorno_obras_mi": mi(d.get(RETORNOS[0], 0.0)),
            "contratado_mi": mi(c[0]) if c else None,
            "contratos": c[2] if c else None,
        })

    soma = lambda k: sum(x[k] or 0 for x in linhas)  # noqa: E731
    total = soma("receita_total_mi")
    obras = soma("retorno_obras_mi")
    contratado = soma("contratado_mi")
    periodo = f"{anos[0]}–{anos[-1]}" if anos else "—"
    return {
        "anos": anos,
        "linhas": linhas,
        "fontes": [g for g in ORDEM if any(g in x["por_fonte_mi"] for x in linhas)],
        "resumo": {
            "periodo": periodo,
            "receita_total_mi": round(total, 1),
            "retorno_obras_mi": round(obras, 1),
            "retorno_emprestimos_mi": round(sum(x["por_fonte_mi"].get(RETORNOS[1], 0) for x in linhas), 1),
            "restituicao_mi": round(sum(x["por_fonte_mi"].get(RETORNOS[2], 0) for x in linhas), 1),
            "contratado_mi": round(contratado, 1),
            "parte_obras_na_receita": round(obras / total * 100, 1) if total else None,
            "obras_sobre_contratado": round(obras / contratado * 100, 1) if contratado else None,
        },
        "ressalvas": [
            "Receitas extraídas por OCR dos Relatórios de Gestão do FSA; não existem em dado aberto.",
            "Valores em R$ correntes, sem deflacionar.",
            "Retorno das obras (investimentos) e retorno de empréstimos (financiamento) são mecanismos distintos: "
            "só o primeiro mede o que as obras devolveram.",
            "Contratado no ano não é o que deveria retornar no ano: o retorno de uma obra chega anos depois do contrato.",
            "Os contratos somam todas as linhas do FSA, reembolsáveis ou não; a fonte não informa a modalidade de cada contrato.",
        ],
    }
