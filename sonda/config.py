"""Configuração mínima, lida do ambiente.

Princípio (README §4): corta-se infraestrutura, nunca princípio. Um só serviço
de banco. A URL do Postgres é o único parâmetro essencial.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    database_url: str
    # default do regime de retenção: a classificação é adiada à prática (decisão 7).
    regime_retencao_default: str = "a definir pela prática"
    # pool de conexões — importa para Postgres gerenciado que escala (Neon/Supabase).
    pool_max: int = 10
    # base FSA (SQLite de segunda ordem) lida in-place pelo motor DuckDB.
    fsa_db_path: str = "data/fsa.db"

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            database_url=os.environ.get(
                "SONDA_DATABASE_URL",
                # default de desenvolvimento; sobrescreva em produção.
                "postgresql://sonda:sonda@localhost:5432/sonda",
            ),
            pool_max=int(os.environ.get("SONDA_POOL_MAX", "10")),
            fsa_db_path=os.environ.get("SONDA_FSA_DB", "data/fsa.db"),
        )


CONFIG = Config.from_env()
