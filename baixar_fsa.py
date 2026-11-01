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

import hashlib
import os
import pathlib
import sys
import urllib.request
from typing import Optional

from sonda import fsa

PIN = pathlib.Path(__file__).resolve().parent / "data" / "fsa.db.sha256"
_BLOCO = 1 << 20


def sha256_arquivo(caminho: pathlib.Path) -> str:
    """sha256 de um arquivo, lido em blocos."""
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(_BLOCO), b""):
            h.update(bloco)
    return h.hexdigest()


def hash_esperado(pin: pathlib.Path = PIN) -> str:
    """Lê o hash do arquivo de pin (formato do `sha256sum`: hash + nome)."""
    return pin.read_text(encoding="utf-8").split()[0].lower()


def baixar(
    url: str,
    destino: Optional[pathlib.Path] = None,
    esperado: Optional[str] = None,
    token: Optional[str] = None,
) -> pathlib.Path:
    """Baixa `url` para `destino` e só o instala se o sha256 bater com o pin.

    Levanta `ValueError` (e não deixa resíduo) se o hash divergir.
    """
    destino = destino or fsa.caminho_db()
    esperado = (esperado or hash_esperado()).lower()
    if destino.exists() and sha256_arquivo(destino) == esperado:
        return destino

    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_name(destino.name + ".part")
    cabecalhos = {"Authorization": f"Bearer {token}"} if token else {}
    req = urllib.request.Request(url, headers=cabecalhos)
    h = hashlib.sha256()
    try:
        with urllib.request.urlopen(req, timeout=60) as r, open(parcial, "wb") as f:  # noqa: S310
            for bloco in iter(lambda: r.read(_BLOCO), b""):
                h.update(bloco)
                f.write(bloco)
        if h.hexdigest() != esperado:
            raise ValueError(
                f"sha256 divergente: esperado {esperado[:12]}…, obtido {h.hexdigest()[:12]}…"
            )
        os.replace(parcial, destino)
    finally:
        parcial.unlink(missing_ok=True)
    return destino


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
