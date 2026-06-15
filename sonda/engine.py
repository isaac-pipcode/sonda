"""Motor de cruzamento — DuckDB embarcado, junções sob demanda.

Decisões encarnadas aqui:
  • 3 (incomensurabilidade): não há esquema unificado. Cada lado é lido na sua
    língua; só projetamos uma CHAVE de ligação no momento da consulta.
  • 4 (schema-on-read): a chave é extraída do JSON nativo por um caminho pontilhado
    (ex.: "location.municipio"), nunca por reformatação do dado armazenado.
  • 5 (receita, não resultado): a função recebe a RECEITA e executa sob demanda.
  • 4ª porosidade (incompletude): órfãos de cada lado são ACHADOS, devolvidos
    explicitamente — nunca filtrados.
  • Sonda generativa: quando o lado direito não existe (`direita: null`), não há
    junção possível; devolve-se o CONTRATO DE BASE FALTANTE, com a PERGUNTA de
    pesquisa no topo e o eixo de ligação como hipótese ("?").

A junção em si roda no DuckDB (em memória), honrando a arquitetura: o motor lê
os lotes nativos e faz a junção analítica sem mover dados nem reformatá-los.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Optional

import duckdb


# ── extração de chave (schema-on-read) ──────────────────────────────────────
def extrair_chave(registro: dict, caminho: str) -> Optional[str]:
    """Lê uma chave do JSON nativo por caminho pontilhado. Não reformata o dado."""
    atual: Any = registro
    for parte in caminho.split("."):
        if isinstance(atual, dict) and parte in atual:
            atual = atual[parte]
        else:
            return None
    if atual is None:
        return None
    return str(atual)


def normalizar(valor: Optional[str]) -> Optional[str]:
    """Normalização leve para 'igualdade_normalizada' (acento/caixa/espaço).

    Atenção: normalizar é uma transformação. Ela é registrada em `saneamento`
    da execução — nunca silenciosa (antipadrão: limpar o dado em silêncio).
    """
    if valor is None:
        return None
    s = unicodedata.normalize("NFKD", valor)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s or None


# ── contrato de base faltante (Sonda generativa) ────────────────────────────
def contrato_base_faltante(receita: dict) -> dict:
    """Monta o contrato quando o lado direito da ligação não existe AINDA.

    Coração do contrato = a PERGUNTA de pesquisa (não o eixo). O eixo é hipótese.
    """
    ausente = receita.get("base_faltante", {})
    return {
        "tipo": "contrato_base_faltante",
        # o coração: a pergunta vem primeiro.
        "pergunta_de_pesquisa": ausente.get(
            "pergunta",
            "Qual base preencheria este elo — e o que ela permitiria perguntar?",
        ),
        # o eixo é hipótese a confirmar, exibido abaixo, com '?'.
        "eixo_de_ligacao_hipotese": {
            "eixo": receita.get("eixo"),
            "hipoteses": ausente.get("hipoteses_de_ligacao", []),
            "nota": "a ligação é a resposta, não a premissa",
        },
        "regime_retencao": ausente.get("regime_retencao", "a definir pela prática"),
        "forma_esperada": ausente.get("forma_esperada"),
    }


# ── execução de um cruzamento ───────────────────────────────────────────────
def executar(
    receita: dict,
    esquerda: list[dict],
    direita: Optional[list[dict]],
) -> dict:
    """Executa a receita sobre os lotes nativos e devolve o resultado da rodada.

    Parâmetros
      receita  — dict com: eixo, esquerda{campo_chave,id_chave}, direita{...}|None,
                 regra ('igualdade_estrita'|'igualdade_normalizada'), limiar.
      esquerda — lista de registros nativos do lado A.
      direita  — lista de registros nativos do lado B, ou None (base faltante).

    Não materializa a tabela de resultado como verdade: devolve métricas +
    amostras de achados. O chamador persiste isso como um EVENTO datado.
    """
    eixo = receita.get("eixo")
    regra = receita.get("regra", "igualdade_normalizada")

    # Lado direito ausente → Sonda generativa.
    if direita is None or receita.get("direita") is None:
        return {
            "executavel": False,
            "eixo": eixo,
            "ligados": 0,
            "orfaos_esquerda": len(esquerda),
            "orfaos_direita": 0,
            "contrato": contrato_base_faltante(receita),
            "saneamento": [],
        }

    cfg_e = receita["esquerda"]
    cfg_d = receita["direita"]
    norm = regra == "igualdade_normalizada"
    saneamento: list[str] = []
    if norm:
        saneamento.append(
            "chave normalizada (NFKD sem acento, minúscula, espaços colapsados) "
            "para a junção; dado nativo preservado intacto"
        )

    def projetar(lote: list[dict], cfg: dict) -> list[dict]:
        linhas = []
        for i, rec in enumerate(lote):
            bruto = extrair_chave(rec, cfg["campo_chave"])
            chave = normalizar(bruto) if norm else bruto
            ident = extrair_chave(rec, cfg.get("id_chave", "id")) or f"#{i}"
            linhas.append({"ident": str(ident), "chave": chave, "rotulo": bruto})
        return linhas

    le = projetar(esquerda, cfg_e)
    ld = projetar(direita, cfg_d)

    # A junção roda no DuckDB (em memória), lendo os lotes projetados.
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE e (ident TEXT, chave TEXT, rotulo TEXT)")
    con.execute("CREATE TABLE d (ident TEXT, chave TEXT, rotulo TEXT)")
    if le:
        con.executemany("INSERT INTO e VALUES (?,?,?)", [(r["ident"], r["chave"], r["rotulo"]) for r in le])
    if ld:
        con.executemany("INSERT INTO d VALUES (?,?,?)", [(r["ident"], r["chave"], r["rotulo"]) for r in ld])

    # Ligados: chave não-nula presente dos dois lados.
    ligados_rows = con.execute(
        """
        SELECT e.ident AS e_ident, d.ident AS d_ident, e.chave AS chave,
               e.rotulo AS e_rotulo, d.rotulo AS d_rotulo
        FROM e JOIN d ON e.chave = d.chave AND e.chave IS NOT NULL
        ORDER BY chave
        """
    ).fetchall()

    orfaos_e = con.execute(
        """
        SELECT e.ident, e.rotulo FROM e
        WHERE e.chave IS NULL
           OR e.chave NOT IN (SELECT chave FROM d WHERE chave IS NOT NULL)
        ORDER BY e.rotulo
        """
    ).fetchall()
    orfaos_d = con.execute(
        """
        SELECT d.ident, d.rotulo FROM d
        WHERE d.chave IS NULL
           OR d.chave NOT IN (SELECT chave FROM e WHERE chave IS NOT NULL)
        ORDER BY d.rotulo
        """
    ).fetchall()
    con.close()

    return {
        "executavel": True,
        "eixo": eixo,
        "regra": regra,
        "ligados": len(ligados_rows),
        "orfaos_esquerda": len(orfaos_e),
        "orfaos_direita": len(orfaos_d),
        # achados: amostras (não a verdade materializada). Órfãos são ACHADOS.
        "amostra_ligados": [
            {"esquerda": r[0], "direita": r[1], "chave": r[2],
             "rotulo_esquerda": r[3], "rotulo_direita": r[4]}
            for r in ligados_rows[:25]
        ],
        "amostra_orfaos_esquerda": [{"ident": r[0], "rotulo": r[1]} for r in orfaos_e[:25]],
        "amostra_orfaos_direita": [{"ident": r[0], "rotulo": r[1]} for r in orfaos_d[:25]],
        "saneamento": saneamento,
    }
