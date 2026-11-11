"""Download de bases hospedadas fora do git, aceito só se o sha256 bater com o pin.

Núcleo do `baixar_fsa.py` (linha de comando) e do download preguiçoso da FSA em
ambiente serverless (`fsa.garantir`). Fixity (decisão 7): o arquivo baixado é
gravado num `.part` e só substitui o destino depois de conferido.
"""
from __future__ import annotations

import hashlib
import os
import pathlib
import urllib.request
from typing import Optional

PIN_FSA = pathlib.Path(__file__).resolve().parent.parent / "data" / "fsa.db.sha256"
_BLOCO = 1 << 20


def sha256_arquivo(caminho: pathlib.Path) -> str:
    """sha256 de um arquivo, lido em blocos."""
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(_BLOCO), b""):
            h.update(bloco)
    return h.hexdigest()


def hash_esperado(pin: pathlib.Path = PIN_FSA) -> str:
    """Lê o hash do arquivo de pin (formato do `sha256sum`: hash + nome)."""
    return pin.read_text(encoding="utf-8").split()[0].lower()


def baixar(url: str, destino: pathlib.Path, esperado: str, token: Optional[str] = None,
           timeout: int = 60) -> pathlib.Path:
    """Baixa `url` para `destino` e só o instala se o sha256 bater com `esperado`.

    Idempotente: se o destino já bate, não baixa. Levanta `ValueError` (sem deixar
    resíduo) se o hash divergir.
    """
    esperado = esperado.lower()
    if destino.exists() and sha256_arquivo(destino) == esperado:
        return destino

    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_name(f"{destino.name}.{os.getpid()}.part")
    cabecalhos = {"Authorization": f"Bearer {token}"} if token else {}
    req = urllib.request.Request(url, headers=cabecalhos)
    h = hashlib.sha256()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r, open(parcial, "wb") as f:  # noqa: S310
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
