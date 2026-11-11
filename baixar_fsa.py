#!/usr/bin/env python3
"""Baixa a base FSA (data/fsa.db) de hospedagem externa e confere o sha256.

A `fsa.db` não é versionada (regra do projeto: nunca commitar bases de dados
brutas). O que vai no git é só o PIN de integridade `data/fsa.db.sha256`: o
arquivo baixado só é aceito se bater com ele (fixity, decisão 7).

  $ export SONDA_FSA_URL=https://…/fsa.db      # onde a base está hospedada
  $ export SONDA_FSA_TOKEN=…                   # opcional (hospedagem privada)
  $ python3 baixar_fsa.py

Idempotente: se o arquivo local já bate com o pin, não baixa de novo.
Para publicar uma nova versão da base: hospede o arquivo, atualize o pin
(`sha256sum data/fsa.db > data/fsa.db.sha256`) e faça o commit do pin.
"""
from __future__ import annotations

import os
import pathlib
import sys
from typing import Optional

from sonda import fsa
from sonda.baixa import PIN_FSA as PIN, sha256_arquivo  # noqa: F401 (reexportados)
from sonda.baixa import baixar as _baixar, hash_esperado as _hash_esperado


def hash_esperado(pin: pathlib.Path = PIN) -> str:
    """Lê o hash do arquivo de pin (formato do `sha256sum`: hash + nome)."""
    return _hash_esperado(pin)


def baixar(
    url: str,
    destino: Optional[pathlib.Path] = None,
    esperado: Optional[str] = None,
    token: Optional[str] = None,
) -> pathlib.Path:
    """Baixa `url` para `destino` (padrão: o caminho configurado da FSA) e só o
    instala se o sha256 bater com o pin. Levanta `ValueError` se divergir."""
    return _baixar(url, destino or fsa.caminho_db(), esperado or hash_esperado(), token)


def main() -> int:
    url = os.environ.get("SONDA_FSA_URL")
    if not url:
        print("[baixar_fsa] defina SONDA_FSA_URL (onde a base está hospedada).", file=sys.stderr)
        return 2
    caminho = baixar(url, token=os.environ.get("SONDA_FSA_TOKEN"))
    print(f"[baixar_fsa] ok: {caminho} (sha256 conferido com o pin)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
