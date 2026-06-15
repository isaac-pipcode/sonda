"""Acesso ao PostgreSQL e inicialização do esquema.

Um só serviço (decisão de arquitetura). psycopg3 com row_factory dict.
"""
from __future__ import annotations

import pathlib
from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from .config import CONFIG

SCHEMA_PATH = pathlib.Path(__file__).resolve().parent.parent / "schema.sql"


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    """Conexão de curta duração com row_factory dict e autocommit desligado."""
    conn = psycopg.connect(CONFIG.database_url, row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_schema() -> None:
    """Aplica schema.sql (idempotente)."""
    ddl = SCHEMA_PATH.read_text(encoding="utf-8")
    with connect() as conn:
        conn.execute(ddl)
