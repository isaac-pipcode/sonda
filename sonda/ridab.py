"""RIDAB — dataset de terceira ordem, lido remotamente (Parquet, sem cópia local).

O RIDAB (Repositório Independente dos Dados do Audiovisual Brasileiro) reúne
dados oficiais (ANCINE, IBGE, CNC, BFI…) já TRATADOS por terceiros. Na Sonda ele
entra com autoria e proveniência próprias, sem fundir-se à FSA (decisão 3): a
origem oficial é declarada, mas a transformação feita pelo RIDAB também.

Princípios encarnados:
  • NENHUM DADO É VERSIONADO: o Parquet é lido por DuckDB direto do Hugging Face,
    fixado a uma REVISÃO (commit) — a fixity é a revisão, não uma cópia.
  • decisão 4 (schema-on-read): o nativo não é alterado; o enriquecimento é uma
    VISÃO calculada na consulta (`enriquecer_contratos`), não uma tabela gravada.
  • 4ª porosidade (incompletude): junções são LEFT; contratos sem correspondência
    permanecem, com campo nulo — nunca são filtrados.
  • asteriscos: toda coluna derivada traz sua ressalva (ver `RESSALVAS`).

Verificação empírica das chaves: docs/RIDAB_INVENTARIO.md.
"""
from __future__ import annotations

import functools
import json
import urllib.request
from typing import Any, Optional

import duckdb

from . import duck, fsa
from .config import CONFIG
from .provenance import fixity

BASE = "ridab"

# Whitelist de tabelas conhecidas (evita injeção em nomes de arquivo).
TABELAS = frozenset({
    "agentes_economicos",
    "renuncia_fiscal",
    "obras_fomento_indireto",
    "fomento_fsa",
    "deflator_ipca",
    "salas_exibicao_complexos",
    "salas_exibicao_evolucao",
    "preco_ingresso",
})

_HF_REPO = "riabr-dados/riab"
_HF_RESOLVE = "https://huggingface.co/datasets/{repo}/resolve/{rev}/cleaned/"
_HF_API = "https://huggingface.co/api/datasets/{repo}/revision/{rev}?blobs=true"

# Normalização de chaves: o RIDAB grava CNPJ/SALIC com pontuação; a FSA, só dígitos.
# Sem isto o cruzamento devolve ZERO correspondências (docs/RIDAB_INVENTARIO.md §2).
_DIGITOS = "regexp_replace(CAST({} AS VARCHAR), '[^0-9]', '', 'g')"

RESSALVAS: dict[str, dict] = {
    "codigo_municipio_ibge": {
        "descricao": "Código IBGE do município do proponente, via CNPJ em agentes_economicos (RIDAB).",
        "ressalva": "Município do cadastro ATUAL da ANCINE, não a sede à época do contrato; "
                    "usa o último registro por CNPJ. Nulo quando o CNPJ não consta no cadastro.",
    },
    "uf_agente": {
        "descricao": "UF do cadastro atual do agente econômico (RIDAB).",
        "ressalva": "Retrato recente; comparar com uf_proponente (FSA) antes de substituir.",
    },
    "valor_contratado_real_2024": {
        "descricao": "valor_contratado × fator_real_2024 (deflator IPCA do RIDAB/IBGE).",
        "ressalva": "Deflacionado pelo ANO DO DOU (ano_contrato), não pelo ano do desembolso. "
                    "Nulo se o ano não consta no deflator.",
    },
    "valor_liberado_real_2024": {
        "descricao": "valor_liberado × fator_real_2024.",
        "ressalva": "Mesmo fator do ano do DOU, embora o desembolso ocorra em parcelas ao longo "
                    "dos anos: superestima/subestima conforme o calendário de liberação.",
    },
}


# ── localização e proveniência ──────────────────────────────────────────────
def revisao() -> str:
    return CONFIG.ridab_revisao


def _prefixo(base: Optional[str] = None) -> str:
    """Prefixo onde moram os Parquet: URL do Hugging Face (padrão) ou diretório/URL
    injetado (testes offline, espelho institucional)."""
    b = base if base is not None else CONFIG.ridab_base
    if b:
        return b.rstrip("/") + "/"
    return _HF_RESOLVE.format(repo=_HF_REPO, rev=revisao())


def url_tabela(tabela: str, base: Optional[str] = None) -> str:
    if tabela not in TABELAS:
        raise ValueError(f"'{tabela}' não é uma tabela RIDAB conhecida")
    return f"{_prefixo(base)}{tabela}.parquet"


def _conexao(base: Optional[str] = None) -> duckdb.DuckDBPyConnection:
    con = duck.conectar()
    if _prefixo(base).startswith(("http://", "https://")):
        con.execute("INSTALL httpfs; LOAD httpfs;")
    return con


@functools.lru_cache(maxsize=8)
def _sha256_arquivos(rev: str) -> dict[str, str]:
    """sha256 por arquivo informado pela API do Hugging Face (LFS). Vazio se a
    rede falhar — a revisão (commit) segue sendo a fixity suficiente."""
    try:
        url = _HF_API.format(repo=_HF_REPO, rev=rev)
        with urllib.request.urlopen(url, timeout=15) as r:  # noqa: S310 (URL fixa https)
            dados = json.load(r)
        return {s["rfilename"]: s["lfs"]["sha256"]
                for s in dados.get("siblings", []) if s.get("lfs")}
    except Exception:
        return {}


def proveniencia_base(tabelas: Optional[list[str]] = None, com_sha: bool = True) -> dict:
    """Proveniência do RIDAB: autoria, licença, origem declarada, revisão e fixity."""
    tabelas = sorted(tabelas or TABELAS)
    rev = revisao()
    shas = _sha256_arquivos(rev) if com_sha and not CONFIG.ridab_base else {}
    arquivos = {t: shas.get(f"cleaned/{t}.parquet") for t in tabelas}
    return {
        "fonte": "RIDAB · Repositório Independente dos Dados do Audiovisual Brasileiro",
        "descricao": "Dados oficiais (ANCINE, IBGE) TRATADOS por terceiros; a transformação "
                     "do RIDAB não é a do órgão de origem.",
        "entidade": "parquet_remoto_ridab",
        "autoria": "riabr-dados",
        "licenca": "CC-BY-4.0 (dados) · MIT (código)",
        "origem_declarada": "ANCINE (dados abertos), IBGE",
        "url": f"https://huggingface.co/datasets/{_HF_REPO}",
        "instancia_versao": f"hf:{_HF_REPO}@{rev}",
        "fixity": fixity({"revisao": rev, "arquivos": arquivos}),
        "sha256_por_arquivo": arquivos,
        "regime_retencao": CONFIG.regime_retencao_default,
        "documentacao": ["docs/RIDAB_INVENTARIO.md"],
    }


# ── leitura crua ────────────────────────────────────────────────────────────
def ler(tabela: str, limite: int = 50, pagina: int = 1, base: Optional[str] = None) -> dict:
    """Lê uma tabela do RIDAB tal como está (nativo, sem normalizar)."""
    url = url_tabela(tabela, base)
    limite = max(1, min(limite, 500))
    offset = (max(1, pagina) - 1) * limite
    con = _conexao(base)
    try:
        cur = con.execute("SELECT * FROM read_parquet(?) LIMIT ? OFFSET ?", [url, limite, offset])
        cols = [d[0] for d in cur.description]
        return {"colunas": cols, "linhas": [dict(zip(cols, r)) for r in cur.fetchall()]}
    finally:
        con.close()


# ── visão: contratos da FSA enriquecidos com RIDAB ───────────────────────────
_SQL_ENRIQUECIMENTO = f"""
WITH ag AS (
    -- último registro por CNPJ (normalizado): evita multiplicar linhas na junção
    SELECT DISTINCT ON (cnpjn) cnpjn, codigo_municipio_ibge, uf AS uf_agente
    FROM (SELECT {_DIGITOS.format('cnpj')} AS cnpjn, codigo_municipio_ibge, uf, data_registro
          FROM agentes) t
    WHERE cnpjn <> ''
    ORDER BY cnpjn, data_registro DESC NULLS LAST
)
SELECT c.*,
       CAST(CAST(ag.codigo_municipio_ibge AS BIGINT) AS VARCHAR) AS codigo_municipio_ibge,
       ag.uf_agente,
       d.fator_real_2024,
       c.valor_contratado * d.fator_real_2024 AS valor_contratado_real_2024,
       c.valor_liberado   * d.fator_real_2024 AS valor_liberado_real_2024
FROM contratos c
LEFT JOIN ag ON ag.cnpjn = {_DIGITOS.format('c.cnpj_proponente')}
LEFT JOIN deflator d ON d.ano = c.ano_contrato
ORDER BY c.contrato_serie_id
"""


def enriquecer(con: duckdb.DuckDBPyConnection) -> tuple[list[str], list[tuple]]:
    """Núcleo puro: espera as tabelas `contratos`, `agentes` e `deflator` em `con`.

    `contratos` = fato_contrato_serie da FSA (cnpj_proponente, ano_contrato,
    valor_contratado, valor_liberado, contrato_serie_id…). Devolve (colunas, linhas).
    """
    cur = con.execute(_SQL_ENRIQUECIMENTO)
    return [d[0] for d in cur.description], cur.fetchall()


def enriquecer_contratos(limite: int = 50, pagina: int = 1, base: Optional[str] = None) -> dict:
    """Contratos FSA + código IBGE do proponente + valores em R$ de 2024.

    Lê `fato_contrato_serie` da fsa.db (sqlite3) e as tabelas do RIDAB (Parquet),
    junta em DuckDB e devolve uma página. Nada é gravado.
    """
    if not fsa.disponivel():
        raise FileNotFoundError(f"base FSA não encontrada em {fsa.caminho_db()}")
    limite = max(1, min(limite, 500))
    offset = (max(1, pagina) - 1) * limite

    con = _conexao(base)
    try:
        sq = fsa._conn_sqlite()
        try:
            cur = sq.execute("SELECT * FROM fato_contrato_serie")
            cols = [d[0] for d in cur.description]
            linhas = [tuple(r) for r in cur.fetchall()]
        finally:
            sq.close()
        tipos = []
        for i in range(len(cols)):
            v = next((r[i] for r in linhas if r[i] is not None), None)
            tipos.append("DOUBLE" if isinstance(v, float) else "BIGINT" if isinstance(v, int) else "VARCHAR")
        con.execute("CREATE TABLE contratos (" + ", ".join(f'"{c}" {t}' for c, t in zip(cols, tipos)) + ")")
        con.executemany(f"INSERT INTO contratos VALUES ({', '.join('?' * len(cols))})", linhas)
        for destino, tabela in (("agentes", "agentes_economicos"), ("deflator", "deflator_ipca")):
            con.execute(f"CREATE TABLE {destino} AS SELECT * FROM read_parquet(?)", [url_tabela(tabela, base)])

        colunas, todas = enriquecer(con)
        total = len(todas)
        casados = sum(1 for r in todas if r[colunas.index("codigo_municipio_ibge")] is not None)
        pagina_linhas = [dict(zip(colunas, r)) for r in todas[offset:offset + limite]]
    finally:
        con.close()

    mapa = fsa.ressalvas_por_coluna()
    ressalvas = {c: mapa[c] for c in colunas if c in mapa and (mapa[c].get("ressalva") or mapa[c].get("descricao"))}
    ressalvas.update({c: v for c, v in RESSALVAS.items() if c in colunas})
    return {
        "colunas": colunas,
        "linhas": pagina_linhas,
        "total": total,
        "com_codigo_ibge": casados,
        "ressalvas": ressalvas,
    }


# ── snapshot imutável (referência, não cópia) ────────────────────────────────
def registrar_snapshot(conn=None) -> dict:
    """Registra o RIDAB como snapshot imutável da Sonda. `conn` injetável.

    A `carga` é a REFERÊNCIA (revisão + sha256 por arquivo + tabelas), nunca as
    linhas. Idempotente por fixity.
    """
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

    carga: dict[str, Any] = {
        "tipo": "parquet_ref",
        "repositorio": prov["url"],
        "revisao": revisao(),
        "tabelas": sorted(TABELAS),
        "sha256_por_arquivo": prov["sha256_por_arquivo"],
    }
    row = conn.execute(
        """INSERT INTO snapshot (fonte, instancia_versao, entidade, capturado_em,
                                 carga, fixity, politica_retencao)
           VALUES (%s, %s, %s, now(), %s, %s, %s) RETURNING snapshot_id""",
        (prov["fonte"], prov["instancia_versao"], prov["entidade"], Jsonb(carga), fx,
         Jsonb({"regime": prov["regime_retencao"],
                "nota": "campo reservado; referência a dados abertos de terceiros"})),
    ).fetchone()
    return {"snapshot_id": str(row["snapshot_id"]), "novo": True, "fixity": fx}
