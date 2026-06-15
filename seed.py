#!/usr/bin/env python3
"""Seed do protótipo SONDA — satisfaz a 'definição de pronto' (README §9).

Faz, contra um Postgres vivo:
  1. init do esquema;
  2. ingestão de dois lotes nativos (Mapa Cultural · OCA salas) → snapshots imutáveis;
  3. cria UM cruzamento real (eixo território) e o executa 2× → série temporal;
  4. cria um cruzamento com BASE FALTANTE (origem do público) → contrato com a
     pergunta de pesquisa no topo.

Uso:
  export SONDA_DATABASE_URL=postgresql://sonda:sonda@localhost:5432/sonda
  python3 seed.py
"""
from __future__ import annotations

import json
import pathlib

from psycopg.types.json import Jsonb

from sonda.db import connect, init_schema
from sonda.ingest import ingerir_envelope

FIX = pathlib.Path(__file__).resolve().parent / "fixtures"


def _load(nome: str) -> dict:
    return json.loads((FIX / nome).read_text(encoding="utf-8"))


def main() -> None:
    print("[seed] init esquema…")
    init_schema()

    with connect() as conn:
        print("[seed] ingerindo Mapa Cultural (agentes cinema)…")
        m = ingerir_envelope(_load("mapa_cultural_cinema.json"), base="mapa_cultural", conn=conn)
        print(f"        snapshot {m['snapshot_id']} · {m['n_registros']} registros")

        print("[seed] ingerindo OCA (salas)…")
        o = ingerir_envelope(_load("oca_salas.json"), base="oca", conn=conn)
        print(f"        snapshot {o['snapshot_id']} · {o['n_registros']} registros")

        # ── cruzamento real: agentes de cinema × salas, pelo eixo TERRITÓRIO ──
        receita = {
            "eixo": "territorio",
            "esquerda": {"snapshot_id": m["snapshot_id"], "campo_chave": "location.municipio", "id_chave": "name"},
            "direita": {"snapshot_id": o["snapshot_id"], "campo_chave": "municipio", "id_chave": "razao_social"},
            "regra": "igualdade_normalizada",
            "limiar": None,
            "versoes_fonte": [m["fixity"], o["fixity"]],
        }
        cruz = conn.execute(
            """INSERT INTO cruzamento (nome, autor, versao_regra, receita)
               VALUES (%s,%s,%s,%s) RETURNING id""",
            ("Agentes de cinema × salas de exibição (por município)", "Isaac (UFF)", "v1", Jsonb(receita)),
        ).fetchone()
        cid = cruz["id"]
        print(f"[seed] cruzamento {cid} criado.")

        # ── cruzamento de BASE FALTANTE: origem do público (Sonda generativa) ─
        receita_ausente = {
            "eixo": "agente",
            "esquerda": {"snapshot_id": o["snapshot_id"], "campo_chave": "municipio", "id_chave": "razao_social"},
            "direita": None,
            "regra": "igualdade_normalizada",
            "base_faltante": {
                "pergunta": "De onde vem o público que assiste aos filmes — e como a "
                            "procedência do espectador se relaciona com a origem territorial da obra?",
                "hipoteses_de_ligacao": [
                    "por CEP do espectador → sala",
                    "por sessão → amostra de público",
                    "por município de residência declarado",
                ],
                "regime_retencao": "dado de pessoas → agregado + fixity, nunca rastro nominal",
                "forma_esperada": "tabela agregada município_origem × sala, sem identificação individual",
            },
        }
        conn.execute(
            """INSERT INTO cruzamento (nome, autor, versao_regra, receita)
               VALUES (%s,%s,%s,%s)""",
            ("Origem do público × filmes (BASE FALTANTE)", "Isaac (UFF)", "v1", Jsonb(receita_ausente)),
        )
        print("[seed] cruzamento de base faltante criado (contrato gerativo).")

    # Executa o cruzamento real 2× via API interna → 2 pontos de série temporal.
    from sonda.api import executar_cruzamento  # import tardio: usa conexões próprias

    print("[seed] executando cruzamento 2× (série temporal)…")
    for i in (1, 2):
        out = executar_cruzamento(str(cid))
        d = out["dados"]
        print(f"        execução {i}: ligados={d['ligados']} "
              f"órfãos_esq={d['orfaos_esquerda']} órfãos_dir={d['orfaos_direita']}")

    print("[seed] pronto. Suba a API: uvicorn sonda.api:app --reload")


if __name__ == "__main__":
    main()
