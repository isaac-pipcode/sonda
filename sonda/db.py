"""Acesso ao PostgreSQL e inicialização do esquema.

Um só serviço (decisão de arquitetura). psycopg3 com row_factory dict.

Usa um pool de conexões (psycopg_pool): num contêiner sempre-ligado contra um
Postgres gerenciado que escala (Neon/Supabase), reusar conexões evita esgotar o
limite do banco. O pool é criado preguiçosamente (min_size=0), então importar
este módulo sem banco — em testes do motor, por exemplo — não abre conexão.
"""
from __future__ import annotations

import pathlib
from contextlib import contextmanager
from typing import Iterator, Optional

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import CONFIG

SCHEMA_PATH = pathlib.Path(__file__).resolve().parent.parent / "schema.sql"

_pool: Optional[ConnectionPool] = None


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            CONFIG.database_url,
            min_size=0,                       # não conecta até o primeiro uso
            max_size=CONFIG.pool_max,
            kwargs={"row_factory": dict_row},
            open=True,
        )
    return _pool


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    """Conexão tirada do pool, com commit/rollback explícito."""
    with _get_pool().connection() as conn:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def init_schema() -> None:
    """Aplica schema.sql (idempotente)."""
    ddl = SCHEMA_PATH.read_text(encoding="utf-8")
    with connect() as conn:
        conn.execute(ddl)
