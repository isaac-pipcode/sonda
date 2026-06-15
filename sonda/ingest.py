"""Ingestão: do envelope coletado → snapshot imutável + raw_record (JSONB).

Consome o envelope produzido por `coleta_real_mapas.py` (proveniência +
fixity + registros nativos). Não normaliza nada: o `nativo` entra intacto
(decisão 4). Cria primeiro um snapshot datado (decisão 7) e ancora cada
raw_record nele.
"""
from __future__ import annotations

import json
from typing import Any

from psycopg.types.json import Jsonb

from .config import CONFIG
from .db import connect
from .provenance import fixity


def _politica_retencao(prov: dict) -> dict:
    """Regime de retenção: classificação adiada à prática (decisão 7)."""
    return {
        "regime": prov.get("regime_retencao", CONFIG.regime_retencao_default),
        "nota": "campo reservado; não classificar 'pessoal' no código (antipadrão)",
    }


def ingerir_envelope(envelope: dict, base: str, conn=None) -> dict:
    """Ingere um envelope. `conn` injetável para testes; senão abre uma própria.

    Retorna {snapshot_id, n_registros, fixity}.
    """
    if conn is None:
        with connect() as c:
            return ingerir_envelope(envelope, base, conn=c)

    prov: dict[str, Any] = envelope.get("proveniencia", {})
    registros: list[dict] = envelope.get("registros", [])
    entidade = prov.get("entidade", "desconhecida")
    capturado_em = prov.get("coletado_em")
    carga_fixity = envelope.get("fixity_do_lote") or fixity(registros)

    # snapshot imutável primeiro.
    row = conn.execute(
        """
        INSERT INTO snapshot (fonte, instancia_versao, entidade, capturado_em,
                              carga, fixity, politica_retencao)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING snapshot_id
        """,
        (
            prov.get("fonte", base),
            prov.get("instancia_versao"),
            entidade,
            capturado_em,
            Jsonb(registros),
            carga_fixity,
            Jsonb(_politica_retencao(prov)),
        ),
    ).fetchone()
    snapshot_id = row["snapshot_id"]

    # cada registro nativo, ancorado no snapshot, com proveniência própria.
    for rec in registros:
        rec_prov = dict(prov)
        rec_prov.setdefault("regime_retencao", CONFIG.regime_retencao_default)
        rec_prov["fixity_registro"] = fixity(rec)
        conn.execute(
            """
            INSERT INTO raw_record (base, entidade, nativo, proveniencia, snapshot_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (base, entidade, Jsonb(rec), Jsonb(rec_prov), snapshot_id),
        )

    return {
        "snapshot_id": str(snapshot_id),
        "n_registros": len(registros),
        "fixity": carga_fixity,
    }


def ingerir_arquivo(caminho: str, base: str) -> dict:
    """Carrega um arquivo JSON (saída de coleta_real_mapas.py) e o ingere."""
    with open(caminho, encoding="utf-8") as f:
        envelope = json.load(f)
    return ingerir_envelope(envelope, base)
