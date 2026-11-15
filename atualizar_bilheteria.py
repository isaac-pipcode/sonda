#!/usr/bin/env python3
"""Reconstrói a bilheteria da fsa.db a partir do arquivo oficial da ANCINE.

Fonte: Dados Abertos ANCINE, "Lançamentos comerciais por distribuidoras"
  https://dados.ancine.gov.br/dados-abertos/lancamentos-comerciais-por-distribuidoras.csv

Por que existe: o arquivo oficial traz UMA LINHA POR DISTRIBUIDORA. A versão
anterior da fsa.db guardou uma linha por obra e, nas obras com mais de uma
distribuidora, ficou às vezes com a linha menor (ex.: "Ainda Estou Aqui" com
738 espectadores de uma sala, em vez dos 5,86 milhões da Columbia).

Regra declarada (gravada em meta_tabela):
  · fato_bilheteria_distribuidora — todas as linhas oficiais das obras brasileiras
    (CPB iniciado por "B"), sem descarte;
  · fato_bilheteria — uma linha por obra: a da distribuidora com MAIOR público
    (empate: maior renda). Não se soma: em codistribuição o mesmo público pode ser
    informado duas vezes (ex.: "Chico Xavier", 3,4 mi + 3,1 mi);
  · obra da versão anterior ausente do arquivo oficial é mantida e sinalizada na
    coluna `fonte`.

Uso:
  $ python3 atualizar_bilheteria.py                 # baixa o oficial e atualiza data/fsa.db
  $ python3 atualizar_bilheteria.py --arquivo X.csv # usa um arquivo já baixado
Depois: `sha256sum data/fsa.db > data/fsa.db.sha256` e publicar a nova release.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import io
import re
import sqlite3
import sys
import unicodedata
import urllib.request
from typing import Iterable, Optional

URL_OFICIAL = "https://dados.ancine.gov.br/dados-abertos/lancamentos-comerciais-por-distribuidoras.csv"
_ARTIGOS = ("o ", "a ", "os ", "as ", "um ", "uma ", "uns ", "umas ", "the ")


def titulo_norm(t: str) -> str:
    """Como na fsa.db: minúsculas, sem acento, pontuação vira espaço, sem artigo inicial."""
    s = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    s = " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())
    for a in _ARTIGOS:
        if s.startswith(a):
            return s[len(a):]
    return s


def _inteiro(v: str) -> Optional[int]:
    v = re.sub(r"[^\d-]", "", v or "")
    return int(v) if v not in ("", "-") else None


def _reais(v: str) -> Optional[float]:
    v = (v or "").replace("R$", "").replace(".", "").replace(",", ".").strip()
    try:
        return float(v)
    except ValueError:
        return None


def _data_iso(v: str) -> Optional[str]:
    try:
        return dt.datetime.strptime((v or "").strip(), "%d/%m/%Y").date().isoformat()
    except ValueError:
        return None


def ler_oficial(texto: str) -> list[dict]:
    """Linhas das obras brasileiras (CPB iniciado por B), uma por distribuidora."""
    linhas = []
    for r in csv.DictReader(io.StringIO(texto.lstrip("\ufeff")), delimiter=";"):
        cpb = (r.get("CPB_ROE") or "").strip()
        if not cpb.startswith("B"):
            continue
        data = _data_iso(r.get("DATA_LANCAMENTO_OBRA"))
        linhas.append({
            "cpb": cpb, "titulo": (r.get("TITULO_ORIGINAL") or "").strip(), "data_lancamento": data,
            "ano_lancamento": int(data[:4]) if data else None, "tipo_obra": (r.get("TIPO_OBRA") or "").strip() or None,
            "publico": _inteiro(r.get("PUBLICO_TOTAL")), "renda": _reais(r.get("RENDA_TOTAL")),
            "distribuidora": (r.get("RAZAO_SOCIAL_DISTRIBUIDORA") or "").strip() or None,
            "cnpj_distribuidora": (r.get("CNPJ_DISTRIBUIDORA") or "").strip() or None,
        })
    return linhas


def linha_principal(linhas: Iterable[dict]) -> dict[str, dict]:
    """Uma linha por CPB: a de maior público; empate, maior renda. Conta as distribuidoras."""
    por_cpb: dict[str, list[dict]] = {}
    for r in linhas:
        por_cpb.setdefault(r["cpb"], []).append(r)
    res = {}
    for cpb, rs in por_cpb.items():
        p = max(rs, key=lambda r: (r["publico"] or 0, r["renda"] or 0))
        res[cpb] = {**p, "n_distribuidoras": len(rs)}
    return res


def aplicar(con: sqlite3.Connection, linhas: list[dict], rotulo_fonte: str) -> dict:
    """Reescreve fato_bilheteria e cria fato_bilheteria_distribuidora, numa transação."""
    principal = linha_principal(linhas)
    antigas = {r[0]: r for r in con.execute(
        "SELECT cpb, titulo, titulo_norm, data_lancamento, ano_lancamento, tipo_obra, publico, renda, "
        "distribuidora, cnpj_distribuidora, fonte FROM fato_bilheteria")}
    mudou = [c for c, p in principal.items() if c in antigas and antigas[c][6] != p["publico"]]
    so_antigas = [c for c in antigas if c not in principal]

    with con:
        con.execute("DROP TABLE IF EXISTS fato_bilheteria_distribuidora")
        con.execute("""CREATE TABLE fato_bilheteria_distribuidora (
            cpb TEXT NOT NULL, titulo TEXT, data_lancamento TEXT, ano_lancamento INTEGER, tipo_obra TEXT,
            publico INTEGER, renda REAL, distribuidora TEXT, cnpj_distribuidora TEXT, principal INTEGER, fonte TEXT)""")
        con.executemany("INSERT INTO fato_bilheteria_distribuidora VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
            (r["cpb"], r["titulo"], r["data_lancamento"], r["ano_lancamento"], r["tipo_obra"], r["publico"], r["renda"],
             r["distribuidora"], r["cnpj_distribuidora"], int(r is principal_original(principal, r)), rotulo_fonte)
            for r in linhas])
        con.execute("CREATE INDEX ix_bilh_dist_cpb ON fato_bilheteria_distribuidora(cpb)")

        cols = [r[1] for r in con.execute("PRAGMA table_info(fato_bilheteria)")]
        if "n_distribuidoras" not in cols:
            con.execute("ALTER TABLE fato_bilheteria ADD COLUMN n_distribuidoras INTEGER")
        con.execute("DELETE FROM fato_bilheteria")
        con.executemany(
            "INSERT INTO fato_bilheteria (cpb, titulo, titulo_norm, data_lancamento, ano_lancamento, tipo_obra, publico, "
            "renda, distribuidora, cnpj_distribuidora, fonte, n_distribuidoras) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [(p["cpb"], p["titulo"], titulo_norm(p["titulo"]), p["data_lancamento"], p["ano_lancamento"], p["tipo_obra"],
              p["publico"], p["renda"], p["distribuidora"], p["cnpj_distribuidora"], rotulo_fonte, p["n_distribuidoras"])
             for p in principal.values()]
            + [(*antigas[c][:10], f"{antigas[c][10]} (ausente do arquivo oficial de {rotulo_fonte.split(' · ')[-1]})", None)
               for c in so_antigas])

        con.execute("DELETE FROM meta_tabela WHERE tabela IN ('fato_bilheteria', 'fato_bilheteria_distribuidora')")
        con.executemany("INSERT INTO meta_tabela (tabela, descricao, fonte, cobertura) VALUES (?,?,?,?)", [
            ("fato_bilheteria",
             "Desempenho comercial das obras brasileiras lançadas em salas. Uma linha por obra: a da distribuidora "
             "com maior público (empate: maior renda); não se soma entre distribuidoras.",
             f"Dados Abertos ANCINE — {rotulo_fonte}", "granularidade: obra (CPB)"),
            ("fato_bilheteria_distribuidora",
             "Todas as linhas oficiais por obra e distribuidora, sem descarte; `principal` marca a linha usada em fato_bilheteria.",
             f"Dados Abertos ANCINE — {rotulo_fonte}", "granularidade: obra (CPB) × distribuidora"),
        ])
        con.execute("DELETE FROM meta_coluna WHERE tabela = 'fato_bilheteria' AND coluna = 'n_distribuidoras'")
        con.execute("INSERT INTO meta_coluna (tabela, coluna, descricao, ressalva) VALUES (?,?,?,?)", (
            "fato_bilheteria", "n_distribuidoras", "Quantas distribuidoras o arquivo oficial registra para a obra.",
            "Se > 1, público e renda são os da distribuidora principal; as demais linhas estão em fato_bilheteria_distribuidora."))
    return {"obras": len(principal), "linhas": len(linhas),
            "com_mais_de_uma_distribuidora": sum(1 for p in principal.values() if p["n_distribuidoras"] > 1),
            "publico_alterado": len(mudou), "novas": len([c for c in principal if c not in antigas]),
            "mantidas_ausentes_do_oficial": so_antigas}


def principal_original(principal: dict[str, dict], r: dict) -> Optional[dict]:
    """Devolve `r` se `r` for a linha principal da sua obra (para marcar `principal`)."""
    p = principal[r["cpb"]]
    chave = ("publico", "renda", "distribuidora", "cnpj_distribuidora")
    return r if all(p[k] == r[k] for k in chave) else None


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--arquivo", help="CSV oficial já baixado (padrão: baixar da ANCINE)")
    ap.add_argument("--db", default="data/fsa.db")
    a = ap.parse_args(argv)
    if a.arquivo:
        bruto = open(a.arquivo, "rb").read()
        quando = dt.date.today().isoformat()
    else:
        with urllib.request.urlopen(URL_OFICIAL, timeout=60) as r:  # noqa: S310 (URL fixa https)
            bruto = r.read()
            lm = r.headers.get("Last-Modified")
        quando = (dt.datetime.strptime(lm, "%a, %d %b %Y %H:%M:%S %Z").date().isoformat() if lm else dt.date.today().isoformat())
    sha = hashlib.sha256(bruto).hexdigest()
    rotulo = f"lancamentos-comerciais-por-distribuidoras.csv · sha256 {sha[:16]} · {quando}"
    linhas = ler_oficial(bruto.decode("utf-8-sig"))
    con = sqlite3.connect(a.db)
    try:
        res = aplicar(con, linhas, rotulo)
    finally:
        con.close()
    print(f"[bilheteria] {rotulo}")
    for k, v in res.items():
        print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
