"""Circulação em salas, por obra — a partir dos relatórios diários de bilheteria (RIDAB).

Duas tabelas do RIDAB, chaveadas pelo CPB (`cpb_roe`), agregadas por obra:
  bilheteria_diaria_municipio_filme_ano  → municípios, UFs, público fora das capitais;
  bilheteria_diaria_exibidora_filme_ano  → complexos no ano de maior público.

Cobertura: os relatórios diários começam em 2014 e só ficam completos para
lançamentos a partir de 2017; antes disso a obra aparece sem circulação (nulo),
nunca com circulação zero.
"""
from __future__ import annotations

import unicodedata
from typing import Optional

from . import ridab

TABELAS = ("bilheteria_diaria_municipio_filme_ano", "bilheteria_diaria_exibidora_filme_ano")
_cache: dict[str, dict[str, dict]] = {}

CAPITAIS = {
    "AC": "RIO BRANCO", "AL": "MACEIO", "AM": "MANAUS", "AP": "MACAPA", "BA": "SALVADOR", "CE": "FORTALEZA",
    "DF": "BRASILIA", "ES": "VITORIA", "GO": "GOIANIA", "MA": "SAO LUIS", "MG": "BELO HORIZONTE",
    "MS": "CAMPO GRANDE", "MT": "CUIABA", "PA": "BELEM", "PB": "JOAO PESSOA", "PE": "RECIFE", "PI": "TERESINA",
    "PR": "CURITIBA", "RJ": "RIO DE JANEIRO", "RN": "NATAL", "RO": "PORTO VELHO", "RR": "BOA VISTA",
    "RS": "PORTO ALEGRE", "SC": "FLORIANOPOLIS", "SE": "ARACAJU", "SP": "SAO PAULO", "TO": "PALMAS",
}


def _norm(s: object) -> str:
    t = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return " ".join(t.upper().split())


def agregar(municipios: list[tuple], exibidoras: list[tuple]) -> dict[str, dict]:
    """Núcleo puro. `municipios`: (cpb, ano, uf, municipio, publico);
    `exibidoras`: (cpb, ano, n_complexos, publico)."""
    res: dict[str, dict] = {}
    for cpb, ano, uf, mun, pub in municipios:
        if not cpb:
            continue
        d = res.setdefault(cpb, {"_mun": set(), "_uf": set(), "_anos": set(), "_pub": 0.0, "_cap": 0.0})
        pub = float(pub or 0)
        d["_mun"].add((uf, _norm(mun)))
        d["_uf"].add(uf)
        if pub > 0:
            d["_anos"].add(int(ano))
        d["_pub"] += pub
        if CAPITAIS.get(uf) == _norm(mun):
            d["_cap"] += pub
    complexos: dict[str, dict[int, list[float]]] = {}
    for cpb, ano, n, pub in exibidoras:
        if cpb:
            a = complexos.setdefault(cpb, {}).setdefault(int(ano), [0.0, 0.0])
            a[0] += float(n or 0)
            a[1] += float(pub or 0)
    saida = {}
    for cpb, d in res.items():
        anos = complexos.get(cpb, {})
        pico = max(anos.items(), key=lambda kv: kv[1][1]) if anos else None
        saida[cpb] = {
            "municipios": len(d["_mun"]),
            "ufs": len(d["_uf"]),
            "anos_em_cartaz": len(d["_anos"]),
            "publico_fora_capitais_pct": round((1 - d["_cap"] / d["_pub"]) * 100, 1) if d["_pub"] > 0 else None,
            "complexos_pico": int(pico[1][0]) if pico else None,
            "publico_diario": int(d["_pub"]),
        }
    return saida


def por_obra(base: Optional[str] = None) -> dict[str, dict]:
    """Circulação por CPB, lida do RIDAB; cacheada por revisão (imutável)."""
    chave = ridab.revisao()
    if base is None and chave in _cache:
        return _cache[chave]
    con = ridab._conexao(base)
    try:
        mun = con.execute("SELECT cpb_roe, ano, uf, municipio, publico_total FROM read_parquet(?)",
                          [ridab.url_tabela(TABELAS[0], base)]).fetchall()
        exi = con.execute("SELECT cpb_roe, ano, n_complexos, publico_total FROM read_parquet(?)",
                          [ridab.url_tabela(TABELAS[1], base)]).fetchall()
    finally:
        con.close()
    res = agregar(mun, exi)
    if base is None:
        _cache[chave] = res
    return res
