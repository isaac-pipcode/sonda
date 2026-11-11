"""Conexão DuckDB em memória, com diretório de extensões configurável.

Em função serverless só /tmp é gravável; sem isso, `INSTALL httpfs` (RIDAB) e
`INSTALL sqlite` (FSA) falham ao tentar gravar em ~/.duckdb.
"""
from __future__ import annotations

import pathlib

import duckdb

from .config import CONFIG


def conectar() -> duckdb.DuckDBPyConnection:
    """Conexão em memória; usa `CONFIG.duckdb_dir` para extensões quando definido."""
    if not CONFIG.duckdb_dir:
        return duckdb.connect()
    d = pathlib.Path(CONFIG.duckdb_dir)
    (d / "extensions").mkdir(parents=True, exist_ok=True)
    return duckdb.connect(config={"home_directory": str(d), "extension_directory": str(d / "extensions")})
