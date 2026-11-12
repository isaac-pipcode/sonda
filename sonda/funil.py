"""Funil de ligação — do contrato do FSA à obra e à bilheteria.

Cruzar bases é ligar uma chave de uma com a chave da outra; o que não liga também
é resultado (porosidade 4: órfãos são achado, nunca filtro). Cada salto devolve o
que liga, o que sobra e como a ligação foi feita (confiança do vínculo).

Os segmentos do salto 1 são EXCLUSIVOS e somam o total de contratos:
  seguro   — CPB por número de contrato (1,00) ou por título único (0,95);
  ambíguo  — título com mais de um CPB (0,60), fora das análises até triagem;
  sem obra — nenhum CPB encontrado.
"""
from __future__ import annotations

import sqlite3
from typing import Optional

from . import fsa

_SEGMENTO = ("CASE WHEN cpb IS NOT NULL AND cpb_score >= 0.95 THEN 'seguro' "
             "WHEN cpb_score > 0 AND cpb_score < 0.95 THEN 'ambiguo' ELSE 'sem_obra' END")

# O elo que nenhuma base do catálogo fecha, e a pista verificada em 2026-11-02 (docs/RIDAB_INVENTARIO.md).
ELO_AUSENTE = {
    "de": "Obra", "para": "Município de exibição",
    "pergunta": "Em que municípios as obras fomentadas pelo FSA foram exibidas?",
    "candidato": {
        "base": "RIDAB", "tabela": "bilheteria_diaria_municipio_filme_ano", "linhas": 378159,
        "chaves": ["cpb_roe", "titulo_brasil"],
        "observacao": "Falta confirmar se a chave cobre obras brasileiras.",
    },
}


def calcular(fsa_con: Optional[sqlite3.Connection] = None) -> dict:
    fechar = fsa_con is None
    if fechar:
        fsa_con = fsa._conn_sqlite()
    try:
        q = lambda sql, *a: fsa_con.execute(sql, a).fetchall()  # noqa: E731
        total_n, total_v = q("SELECT COUNT(*), SUM(valor_contratado) FROM fato_contrato_serie")[0]
        seg = {s: {"contratos": n, "valor_mi": round((v or 0) / 1e6, 1)} for s, n, v in q(
            f"SELECT {_SEGMENTO}, COUNT(*), SUM(valor_contratado) FROM fato_contrato_serie GROUP BY 1")}
        for s in ("seguro", "ambiguo", "sem_obra"):
            seg.setdefault(s, {"contratos": 0, "valor_mi": 0.0})
        for s in seg.values():
            s["parte"] = round(s["contratos"] / total_n * 100, 1) if total_n else 0.0
        metodos = [{"metodo": m or "sem", "confianca": c, "contratos": n} for m, c, n in q(
            "SELECT COALESCE(cpb_metodo, 'sem'), cpb_score, COUNT(*) FROM fato_contrato_serie "
            "GROUP BY 1, 2 ORDER BY 3 DESC")]

        obras = q("SELECT COUNT(DISTINCT cpb) FROM fato_contrato_serie "
                  "WHERE cpb IS NOT NULL AND cpb_score >= 0.95")[0][0]
        com_bilheteria = q(
            "SELECT COUNT(DISTINCT s.cpb) FROM fato_contrato_serie s "
            "JOIN fato_bilheteria b ON b.cpb = s.cpb WHERE s.cpb IS NOT NULL AND s.cpb_score >= 0.95")[0][0]

        por_ano = [{"ano": a, "contratos": n, "sem_obra": s, "parte_sem_obra": round(s / n * 100, 1)}
                   for a, n, s in q(
            f"SELECT ano_contrato, COUNT(*), SUM(CASE WHEN {_SEGMENTO} = 'sem_obra' THEN 1 ELSE 0 END) "
            "FROM fato_contrato_serie WHERE ano_contrato IS NOT NULL GROUP BY 1 ORDER BY 1")]

        por_chamada = [{"chamada": c, "sem_obra": s, "contratos": n, "parte_sem_obra": round(s / n * 100, 1)}
                       for c, n, s in q(
            f"SELECT chamada_publica, COUNT(*), SUM(CASE WHEN {_SEGMENTO} = 'sem_obra' THEN 1 ELSE 0 END) "
            "FROM fato_contrato_serie WHERE chamada_publica IS NOT NULL GROUP BY 1 "
            "HAVING SUM(CASE WHEN cpb IS NULL OR cpb_score = 0 THEN 1 ELSE 0 END) > 0 "
            "ORDER BY 3 DESC, 2 DESC LIMIT 5")]

        maiores = [{"projeto": t, "proponente": p, "uf": u, "ano": a, "valor_mi": round(v / 1e6, 2), "chamada": c}
                   for t, p, u, a, v, c in q(
            f"SELECT titulo_projeto, razao_proponente, uf_proponente, ano_contrato, valor_contratado, chamada_publica "
            f"FROM fato_contrato_serie WHERE {_SEGMENTO} = 'sem_obra' ORDER BY valor_contratado DESC, titulo_projeto LIMIT 5")]
    finally:
        if fechar:
            fsa_con.close()

    return {
        "contratos": {"total": total_n, "valor_mi": round((total_v or 0) / 1e6, 1)},
        "salto_contrato_obra": {"segmentos": seg, "metodos": metodos},
        "salto_obra_bilheteria": {
            "obras_com_vinculo_seguro": obras, "com_bilheteria": com_bilheteria,
            "sem_bilheteria": obras - com_bilheteria,
            "parte_com_bilheteria": round(com_bilheteria / obras * 100, 1) if obras else 0.0,
        },
        "por_ano": por_ano,
        "por_chamada": por_chamada,
        "maiores_sem_obra": maiores,
        "elo_ausente": ELO_AUSENTE,
        "ressalvas": [
            "Valores em R$ correntes, sem deflacionar.",
            "O vínculo por título único tem confiança 0,95; os de título ambíguo (0,60) ficam fora das análises até triagem manual.",
            "Sem obra não significa erro: pode ser obra ainda não lançada ou certificada (hipótese, não verificada).",
            "O conj. 28 da ANCINE só traz cinema: obra sem bilheteria pode ser de TV ou VoD (hipótese, não verificada).",
        ],
    }
