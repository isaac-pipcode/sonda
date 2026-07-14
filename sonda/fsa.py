"""Base FSA — dataset de segunda ordem (SQLite) lido in-place.

A `fsa.db` é uma base de pesquisa madura sobre o Fundo Setorial do Audiovisual
(ANCINE): fatos, dimensões, visões analíticas ESTÁVEIS e — o mais valioso — uma
camada de proveniência/ressalvas embutida (`meta_tabela`, `meta_coluna`).

Na Sonda ela entra como base de PRIMEIRA CLASSE, ao lado do Mapa Cultural, SEM
ser fundida a um vocabulário comum (decisão 3). Preservamos seu esquema nativo e
suas visões; o motor DuckDB lê o SQLite in-place (decisão 4: não reformatar o
nativo). Cada resposta anexa as ressalvas de `meta_coluna` — torna-se impossível
citar um número sem ver seu asterisco (porosidade 4 / camada de "asteriscos").

Leitura: DuckDB + sqlite_scanner é o caminho preferido (permite cruzar FSA com
outras bases sem mover dados). Como a `fsa.db` já é SQLite, há fallback direto
via `sqlite3` — usado quando a extensão do DuckDB não está disponível (offline/CI).
"""
from __future__ import annotations

import hashlib
import pathlib
import sqlite3
from typing import Optional

from .config import CONFIG

BASE = "fsa"
_REPO_RAIZ = pathlib.Path(__file__).resolve().parent.parent


def caminho_db() -> pathlib.Path:
    p = pathlib.Path(CONFIG.fsa_db_path)
    return p if p.is_absolute() else (_REPO_RAIZ / p)


def disponivel() -> bool:
    return caminho_db().exists()


def fixity_arquivo() -> str:
    """sha256 do arquivo — fixity do snapshot desta base."""
    h = hashlib.sha256()
    with open(caminho_db(), "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


# ── inventário e dicionário (a base é autodescritiva) ───────────────────────
def _conn_sqlite() -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{caminho_db()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def inventario() -> dict:
    """Tabelas e visões da FSA, com contagem — na língua nativa da base."""
    con = _conn_sqlite()
    try:
        itens = []
        rows = con.execute(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') "
            "AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
        ).fetchall()
        for r in rows:
            try:
                n = con.execute(f'SELECT COUNT(*) FROM "{r["name"]}"').fetchone()[0]
            except sqlite3.Error:
                n = None
            itens.append({"nome": r["name"], "tipo": r["type"], "registros": n})
        return {"itens": itens}
    finally:
        con.close()


def nomes_consultaveis() -> set[str]:
    """Whitelist de tabelas/visões (evita injeção no endpoint de consulta)."""
    return {i["nome"] for i in inventario()["itens"]}


def dicionario() -> dict:
    """meta_tabela + meta_coluna — descrição, fonte, cobertura e RESSALVAS."""
    con = _conn_sqlite()
    try:
        tabelas = [dict(r) for r in con.execute("SELECT * FROM meta_tabela ORDER BY tabela")]
        colunas = [dict(r) for r in con.execute("SELECT * FROM meta_coluna ORDER BY tabela, coluna")]
        return {"tabelas": tabelas, "colunas": colunas}
    except sqlite3.Error:
        return {"tabelas": [], "colunas": []}
    finally:
        con.close()


def ressalvas_por_coluna() -> dict[str, dict]:
    """Mapa coluna → {descricao, ressalva}. Chaveado só pelo nome da coluna,
    para anexar asteriscos às visões (cujas colunas herdam das tabelas-fato)."""
    mapa: dict[str, dict] = {}
    for c in dicionario()["colunas"]:
        # a primeira ocorrência com ressalva não-nula vence
        if c["coluna"] not in mapa or (c.get("ressalva") and not mapa[c["coluna"]].get("ressalva")):
            mapa[c["coluna"]] = {"descricao": c.get("descricao"), "ressalva": c.get("ressalva")}
    return mapa


# ── leitura de uma tabela/visão (DuckDB in-place, fallback sqlite3) ──────────
def _tenta_duckdb(nome: str, limite: int, offset: int):
    """Lê via DuckDB + sqlite_scanner. Levanta se a extensão não carregar."""
    import duckdb

    con = duckdb.connect()
    try:
        con.execute("INSTALL sqlite; LOAD sqlite;")
        con.execute(f"ATTACH '{caminho_db()}' AS fsa (TYPE sqlite, READ_ONLY);")
        cur = con.execute(f'SELECT * FROM fsa."{nome}" LIMIT ? OFFSET ?', [limite, offset])
        cols = [d[0] for d in cur.description]
        linhas = [dict(zip(cols, row)) for row in cur.fetchall()]
        return cols, linhas, "duckdb+sqlite_scanner"
    finally:
        con.close()


def _fallback_sqlite(nome: str, limite: int, offset: int):
    con = _conn_sqlite()
    try:
        cur = con.execute(f'SELECT * FROM "{nome}" LIMIT ? OFFSET ?', (limite, offset))
        cols = [d[0] for d in cur.description]
        linhas = [dict(r) for r in cur.fetchall()]
        return cols, linhas, "sqlite3 (fallback; sqlite_scanner indisponível)"
    finally:
        con.close()


def proveniencia_base() -> dict:
    """Proveniência da base FSA como um todo (para o catálogo e o snapshot)."""
    inv = inventario()
    return {
        "fonte": "fsa.db (Fundo Setorial do Audiovisual · ANCINE)",
        "descricao": "Base de pesquisa reproduzível; agregada por pesquisador a "
                     "partir de Dados Abertos ANCINE + OCR de Relatórios de Gestão + IBGE.",
        "entidade": "base_relacional_fsa",
        "instancia_versao": f"sqlite · {len(inv['itens'])} tabelas/visões",
        "fixity": fixity_arquivo(),
        "regime_retencao": CONFIG.regime_retencao_default,
        "documentacao": ["docs/DOCUMENTACAO_MIGRACAO_SONDA.md",
                         "docs/MAPA_CRUZAMENTOS_SONDA.md", "docs/data_dictionary.md"],
    }


def registrar_snapshot(conn=None) -> dict:
    """Registra a FSA como um snapshot imutável da Sonda. `conn` injetável.

    A `carga` do snapshot é o INVENTÁRIO + DICIONÁRIO (metadados autodescritivos),
    não a cópia das linhas: o dado nativo permanece na fsa.db, lido in-place pelo
    motor. O snapshot ancora fixity, retenção e a proveniência da base.
    Idempotente por fixity: não duplica se já existe um snapshot igual.
    """
    if not disponivel():
        raise FileNotFoundError(f"base FSA não encontrada em {caminho_db()}")
    if conn is None:
        from .db import connect
        with connect() as c:
            return registrar_snapshot(conn=c)

    from psycopg.types.json import Jsonb

    prov = proveniencia_base()
    fx = prov["fixity"]
    ja = conn.execute("SELECT snapshot_id FROM snapshot WHERE fixity = %s", (fx,)).fetchone()
    if ja:
        return {"snapshot_id": str(ja["snapshot_id"]), "novo": False, "fixity": fx}

    carga = {"tipo": "sqlite_ref", "arquivo": str(CONFIG.fsa_db_path),
             "inventario": inventario()["itens"], "dicionario": dicionario()}
    row = conn.execute(
        """INSERT INTO snapshot (fonte, instancia_versao, entidade, capturado_em,
                                 carga, fixity, politica_retencao)
           VALUES (%s, %s, %s, now(), %s, %s, %s) RETURNING snapshot_id""",
        (prov["fonte"], prov["instancia_versao"], prov["entidade"],
         Jsonb(carga), fx, Jsonb({"regime": prov["regime_retencao"],
                                  "nota": "campo reservado; base contém agregados, sem rastro nominal"})),
    ).fetchone()
    return {"snapshot_id": str(row["snapshot_id"]), "novo": True, "fixity": fx}


def consultar(nome: str, limite: int = 50, pagina: int = 1) -> dict:
    """Consulta uma tabela/visão da FSA (sob demanda). Anexa as ressalvas das
    colunas retornadas — o dado NUNCA sai sem seu asterisco."""
    if nome not in nomes_consultaveis():
        raise ValueError(f"'{nome}' não é uma tabela/visão consultável da base FSA")
    limite = max(1, min(limite, 500))
    offset = (max(1, pagina) - 1) * limite

    try:
        cols, linhas, motor = _tenta_duckdb(nome, limite, offset)
    except Exception:
        cols, linhas, motor = _fallback_sqlite(nome, limite, offset)

    mapa = ressalvas_por_coluna()
    ressalvas = {c: mapa[c] for c in cols if c in mapa and (mapa[c].get("ressalva") or mapa[c].get("descricao"))}
    return {"colunas": cols, "linhas": linhas, "motor_leitura": motor, "ressalvas": ressalvas}
