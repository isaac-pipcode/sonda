"""Configuração mínima, lida do ambiente.

Princípio (README §4): corta-se infraestrutura, nunca princípio. Um só serviço
de banco. A URL do Postgres é o único parâmetro essencial.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


# Release pública deste repositório; o conteúdo é conferido pelo pin data/fsa.db.sha256.
FSA_URL_PADRAO = "https://github.com/isaac-pipcode/sonda/releases/download/fsa.db/fsa.db"


@dataclass(frozen=True)
class Config:
    database_url: str
    # default do regime de retenção: a classificação é adiada à prática (decisão 7).
    regime_retencao_default: str = "a definir pela prática"
    # pool de conexões — importa para Postgres gerenciado que escala (Neon/Supabase).
    pool_max: int = 10
    # base FSA (SQLite de segunda ordem) lida in-place pelo motor DuckDB.
    fsa_db_path: str = "data/fsa.db"
    # onde a FSA está hospedada; se o arquivo local faltar, é baixada no primeiro uso.
    fsa_url: str = ""
    # diretório gravável para extensões do DuckDB (httpfs, sqlite); vazio = padrão do DuckDB.
    duckdb_dir: str = ""
    # RIDAB (Parquet remoto no Hugging Face), fixado a uma revisão (commit).
    ridab_revisao: str = "6c5e6ae1ce5a866b76039e1f3dce7776cf22dfe1"
    # prefixo alternativo dos Parquet (diretório local ou espelho); vazio = Hugging Face.
    ridab_base: str = ""
    # CORS: origens exatas separadas por vírgula; vazio = "*" (só para desenvolvimento).
    cors_origens: tuple[str, ...] = ()
    # regex opcional de origens (ex.: previews da Vercel); combina com as exatas.
    cors_origem_regex: str = ""

    @classmethod
    def from_env(cls) -> "Config":
        # Em função serverless (Vercel) só /tmp é gravável.
        serverless = bool(os.environ.get("VERCEL"))
        return cls(
            # SONDA_DATABASE_URL tem precedência; DATABASE_URL/POSTGRES_URL são as que a
            # integração Neon–Vercel cria. O default é só para desenvolvimento.
            database_url=(os.environ.get("SONDA_DATABASE_URL") or os.environ.get("DATABASE_URL")
                          or os.environ.get("POSTGRES_URL") or "postgresql://sonda:sonda@localhost:5432/sonda"),
            pool_max=int(os.environ.get("SONDA_POOL_MAX", "10")),
            fsa_db_path=os.environ.get("SONDA_FSA_DB", "/tmp/sonda/fsa.db" if serverless else "data/fsa.db"),
            # padrão: a release pública; SONDA_FSA_URL="" desliga o download.
            fsa_url=os.environ.get("SONDA_FSA_URL", FSA_URL_PADRAO).strip(),
            duckdb_dir=os.environ.get("SONDA_DUCKDB_DIR", "/tmp/sonda/duckdb" if serverless else ""),
            ridab_revisao=os.environ.get(
                "SONDA_RIDAB_REV", "6c5e6ae1ce5a866b76039e1f3dce7776cf22dfe1"),
            ridab_base=os.environ.get("SONDA_RIDAB_BASE", ""),
            cors_origens=tuple(
                o.strip().rstrip("/") for o in os.environ.get("SONDA_CORS_ORIGINS", "").split(",") if o.strip()),
            cors_origem_regex=os.environ.get("SONDA_CORS_ORIGIN_REGEX", "").strip(),
        )


CONFIG = Config.from_env()
