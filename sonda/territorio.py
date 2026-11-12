"""Território — fomento do FSA e parque exibidor, por UF.

Decisão 3 (incomensurabilidade): fomento (R$) e salas (unidades) ficam em colunas
próprias; só a UF os aproxima, e é a UF da PRODUTORA proponente, não o lugar da
obra. A parte de cada UF é calculada sobre o conjunto que tem UF informada: os
contratos sem UF são reportados à parte, nunca distribuídos.

Decisão 2 (transparência): uma população que contradiz os próprios municípios da
base é sinalizada (`verificar`), não corrigida em silêncio.
"""
from __future__ import annotations

import sqlite3
from typing import Optional

from . import fsa, series

NOMES = {
    "AC": "Acre", "AL": "Alagoas", "AM": "Amazonas", "AP": "Amapá", "BA": "Bahia", "CE": "Ceará",
    "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão",
    "MG": "Minas Gerais", "MS": "Mato Grosso do Sul", "MT": "Mato Grosso", "PA": "Pará",
    "PB": "Paraíba", "PE": "Pernambuco", "PI": "Piauí", "PR": "Paraná", "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte", "RO": "Rondônia", "RR": "Roraima", "RS": "Rio Grande do Sul",
    "SC": "Santa Catarina", "SE": "Sergipe", "SP": "São Paulo", "TO": "Tocantins",
}

# Verificação manual (2026-11-02, sobre a fsa.db): nem toda inconsistência é detectável por regra.
VERIFICACAO_MANUAL = {
    "RR": "A população do UF (1.751.950) é 3,6 vezes a do único município com sala (485.477) e "
          "destoa de qualquer estimativa para Roraima; parece trocada com a de Rondônia.",
}


def _verificar(uf: str, pop_uf: int, pop_municipios: Optional[int]) -> Optional[str]:
    """Motivo da suspeita sobre a população do UF, ou None. Regra detectável: o total do
    UF não pode ser menor que a soma dos seus municípios com sala, na mesma base."""
    if pop_municipios is not None and pop_uf < pop_municipios:
        milhar = lambda n: f"{n:,}".replace(",", ".")  # noqa: E731
        return (f"A população do UF ({milhar(pop_uf)}) é menor que a soma dos seus municípios com sala "
                f"({milhar(pop_municipios)}), o que é impossível; parece trocada com a de Roraima.")
    return VERIFICACAO_MANUAL.get(uf)


def calcular(moeda: str = "real", fsa_con: Optional[sqlite3.Connection] = None,
             base: Optional[str] = None) -> dict:
    """Fomento contratado e salas por UF. `moeda`: "real" (R$ de 2024, IPCA do ano do DOU)
    ou "nominal". `fsa_con` e `base` são injetáveis para testes offline."""
    if moeda not in series.MOEDAS:
        raise ValueError(f"moeda deve ser uma de {series.MOEDAS}")
    real = moeda == "real"
    fator = series._fator_ipca(base) if real else {}

    fechar = fsa_con is None
    if fechar:
        fsa_con = fsa._conn_sqlite()
    try:
        contratos = fsa_con.execute(
            "SELECT uf_proponente, ano_contrato, COUNT(*), SUM(valor_contratado) "
            "FROM fato_contrato_serie GROUP BY 1, 2").fetchall()
        exibicao = {r[0]: r for r in fsa_con.execute(
            "SELECT uf, salas, populacao FROM fato_exibicao_uf")}
        municipal = {r[0]: r[1] for r in fsa_con.execute(
            "SELECT uf, SUM(populacao) FROM fato_exibicao_municipio GROUP BY uf")}
    finally:
        if fechar:
            fsa_con.close()

    por_uf: dict[str, list] = {}
    sem_uf = [0, 0.0]
    fora_fator = 0
    for uf, ano, n, v in contratos:
        valor = float(v or 0)
        if real:
            if ano not in fator:
                fora_fator += n
                continue
            valor *= fator[ano]
        if not uf:
            sem_uf[0] += n
            sem_uf[1] += valor
        else:
            d = por_uf.setdefault(uf, [0, 0.0])
            d[0] += n
            d[1] += valor

    total_fomento = sum(d[1] for d in por_uf.values())
    total_salas = sum(r[1] for r in exibicao.values())
    total_pop = sum(r[2] for r in exibicao.values())

    ufs = []
    for sigla in sorted(set(por_uf) | set(exibicao)):
        n, v = por_uf.get(sigla, [0, 0.0])
        _, salas, pop = exibicao.get(sigla, (sigla, None, None))
        motivo = _verificar(sigla, pop, municipal.get(sigla)) if pop else None
        ufs.append({
            "sigla": sigla, "nome": NOMES.get(sigla, sigla),
            "contratos": n, "fomento_mi": round(v / 1e6, 1),
            "parte_fomento": round(v / total_fomento * 100, 2) if total_fomento else None,
            "salas": salas, "parte_salas": round(salas / total_salas * 100, 2) if salas is not None and total_salas else None,
            "populacao": pop,
            "salas_por_100mil": round(salas * 1e5 / pop, 2) if salas is not None and pop else None,
            "fomento_por_habitante": None if (not pop or motivo) else round(v / pop, 1),
            "verificar": motivo,
        })

    top2 = sorted(ufs, key=lambda u: u["fomento_mi"], reverse=True)[:2]
    ressalvas = [
        "UF é a sede da produtora proponente, não o local de filmagem ou de exibição.",
        f"{sem_uf[0]} contratos (R$ {sem_uf[1] / 1e6:.1f} mi) não têm UF e ficam fora das partes e dos mapas.",
        ("Valores em R$ de 2024 pelo IPCA do ano do DOU, somados de 2009 a 2024."
         if real else "Valores em R$ correntes, somados de 2009 a 2024: não comparáveis entre anos."),
        "Salas e população vêm do cadastro atual da ANCINE e do IBGE, na tabela de exibição da FSA.",
    ]
    if any(u["verificar"] for u in ufs):
        ressalvas.append("UFs com população a verificar têm a razão salas por 100 mil omitida do mapa.")
    if fora_fator:
        ressalvas.append(f"{fora_fator} contratos de anos sem fator IPCA ficaram fora do cálculo em R$ de 2024.")

    return {
        "moeda": moeda,
        "unidade": "R$ mi de 2024" if real else "R$ mi correntes",
        "ufs": ufs,
        "totais": {"fomento_mi_com_uf": round(total_fomento / 1e6, 1), "salas": total_salas,
                   "populacao": total_pop},
        "sem_uf": {"contratos": sem_uf[0], "fomento_mi": round(sem_uf[1] / 1e6, 1)},
        "media_nacional_salas_100mil": round(total_salas * 1e5 / total_pop, 2) if total_pop else None,
        "concentracao": {
            "ufs": [u["sigla"] for u in top2],
            "parte_fomento": round(sum(u["parte_fomento"] or 0 for u in top2), 1),
            "parte_salas": round(sum(u["parte_salas"] or 0 for u in top2), 1),
        },
        "ressalvas": ressalvas,
    }
