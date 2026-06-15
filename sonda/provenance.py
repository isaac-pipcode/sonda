"""Proveniência: o envelope que acompanha TODA resposta da API.

Decisão 2 (transparência radical) e porosidade 2 (proveniência): todo dado
exibido carrega origem/versão/query/coleta/saneamento ao alcance de um clique.
Aqui isso é estrutural — nenhuma resposta sai sem `proveniencia`.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from typing import Any, Optional


def agora_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def fixity(payload: Any) -> str:
    """sha256 canônico de um payload — a marca d'água de integridade."""
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    ).hexdigest()


def envelope(
    dados: Any,
    *,
    proveniencia: dict | list,
    avisos: Optional[list[str]] = None,
) -> dict:
    """Embrulha qualquer resposta da API.

    `proveniencia` pode ser um dict (uma fonte) ou uma lista (várias fontes,
    quando o recurso agrega bases — porosidade ontológica: as proveniências
    ficam lado a lado, não fundidas).
    """
    return {
        "dados": dados,
        "proveniencia": proveniencia,
        "avisos": avisos or [],
        "servido_em": agora_utc(),
    }
