#!/usr/bin/env python3
"""
SONDA — Coleta real: API do Mapa Cultural (executável pelo pesquisador)
=======================================================================

NOTA DE PROVENIÊNCIA HONESTA
----------------------------
Este script NÃO pôde ser executado contra a API ao vivo no ambiente em que
foi escrito: o domínio mapas.cultura.gov.br não está na allowlist de rede do
sandbox (resposta: 403 "Host not in allowlist"). A lógica abaixo é real e
testada estruturalmente; basta rodá-la em uma máquina com acesso à internet.

  $ pip install requests
  $ python3 coleta_real_mapas.py

O que faz: coleta agentes de linguagem 'Cinema' da instância federal do
Mapas Culturais, com proveniência completa, paginação e fixity — exatamente
o pipeline desenhado na Etapa 2, agora apontando para a fonte viva.

Sintaxe confirmada na documentação oficial (hacklabr/mapasculturais):
  /api/agent/find  com @select, @limit, @page, e filtro term:linguagem=LIKE(Cinema)
  /api/site/version  para registrar a versão da instância na proveniência
"""

import json, hashlib, datetime as dt, sys
import requests

BASE_URL = "https://mapas.cultura.gov.br"
HEADERS = {"User-Agent": "SondaResearch/0.1 (observatorio UFF; pesquisa academica)"}
TIMEOUT = 30


def versao_instancia():
    try:
        r = requests.get(f"{BASE_URL}/api/site/version", headers=HEADERS, timeout=TIMEOUT)
        return r.text.strip()[:80] if r.ok else f"http {r.status_code}"
    except Exception as e:
        return f"erro ({type(e).__name__})"


def coletar_agentes_cinema(limite_pagina=100, max_paginas=20):
    url = f"{BASE_URL}/api/agent/find"
    base_params = {
        "@select": "id,name,terms,location,createTimestamp",
        "@order": "name ASC",
        "term:linguagem": "LIKE(Cinema)",
        "@limit": limite_pagina,
    }
    registros, page = [], 1
    while page <= max_paginas:
        params = dict(base_params, **{"@page": page})
        r = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        lote = r.json()
        if not lote:
            break
        registros.extend(lote)
        if len(lote) < limite_pagina:
            break
        page += 1
    return registros


def fixity(payload):
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


def main():
    agora = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    versao = versao_instancia()
    print(f"[sonda] instância: {BASE_URL} · versão: {versao} · coleta: {agora}", file=sys.stderr)

    brutos = coletar_agentes_cinema()
    print(f"[sonda] coletados {len(brutos)} agentes de linguagem 'Cinema'", file=sys.stderr)

    envelope = {
        "proveniencia": {
            "fonte": BASE_URL,
            "instancia_versao": versao,
            "entidade": "agent",
            "query": {"term:linguagem": "LIKE(Cinema)", "@select": "id,name,terms,location,createTimestamp"},
            "coletado_em": agora,
            "n_registros": len(brutos),
            "saneamento": ["nenhum — JSON nativo preservado"],
            "regime_retencao": "a definir pela prática",
        },
        "fixity_do_lote": fixity(brutos),
        "registros": brutos,   # dado nativo, preservado integralmente
    }

    saida = f"sonda_mapas_cinema_{agora[:10]}.json"
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(envelope, f, ensure_ascii=False, indent=2)
    print(f"[sonda] gravado: {saida}", file=sys.stderr)


if __name__ == "__main__":
    main()
