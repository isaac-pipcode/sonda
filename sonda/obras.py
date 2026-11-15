"""Obras — uma linha por obra (CPB), com o que cada base sabe sobre ela.

É a visão no nível em que as perguntas de pesquisa são feitas: o filme. Reúne,
sem somar nem indexar entre si (decisão 3), quatro medidas de bases distintas:

  bilheteria        — público e renda em salas (fsa.db · conj. 28 da ANCINE);
  FSA               — valor contratado e liberado, e a parte em comercialização
                      (lançamento), dos contratos com vínculo seguro (≥ 0,95);
  incentivo fiscal  — valor captado, pelo nº SALIC (RIDAB · renuncia_fiscal).

A chave é o CPB, projetada na consulta (decisão 4). Ausência é `null`, nunca
zero: obra sem bilheteria não é obra com público zero.
"""
from __future__ import annotations

import re
import sqlite3
from typing import Optional

from . import fsa, ridab

_cache_captado: dict[str, dict[str, float]] = {}
_COMERCIALIZACAO = "%COMERCIALIZA%"
# público dos relatórios diários acima do dobro do registrado (e acima disto) = a verificar.
LIMIAR_VERIFICAR = 10_000


def _so_digitos(v: object) -> str:
    return re.sub(r"\D", "", str(v or "")).lstrip("0")


def captado_por_salic(base: Optional[str] = None) -> dict[str, float]:
    """Total captado por nº SALIC (só dígitos, sem zeros à esquerda), do RIDAB.
    Cacheado por revisão, que é imutável."""
    chave = ridab.revisao()
    if base is None and chave in _cache_captado:
        return _cache_captado[chave]
    con = ridab._conexao(base)
    try:
        linhas = con.execute(
            "SELECT numero_salic, SUM(total_captado) FROM read_parquet(?) "
            "WHERE numero_salic IS NOT NULL GROUP BY 1", [ridab.url_tabela("renuncia_fiscal", base)]).fetchall()
    finally:
        con.close()
    res = {_so_digitos(s): float(v) for s, v in linhas if v is not None and _so_digitos(s)}
    if base is None:
        _cache_captado[chave] = res
    return res


def calcular(fsa_con: Optional[sqlite3.Connection] = None, captado: Optional[dict[str, float]] = None,
             circulacao: Optional[dict[str, dict]] = None) -> dict:
    """Uma linha por obra. `captado` é o mapa SALIC → valor e `circulacao` o mapa CPB →
    circulação em salas (None = RIDAB indisponível: as colunas saem nulas e a ressalva
    o declara). `fsa_con` é injetável para testes."""
    fechar = fsa_con is None
    if fechar:
        fsa_con = fsa._conn_sqlite()
    try:
        q = lambda sql, *a: fsa_con.execute(sql, a).fetchall()  # noqa: E731
        bilheteria = q("SELECT cpb, titulo, ano_lancamento, tipo_obra, publico, renda, distribuidora "
                       "FROM fato_bilheteria WHERE cpb IS NOT NULL")
        contratos = q(
            "SELECT cpb, MIN(titulo_projeto), COUNT(*), MIN(ano_contrato), SUM(valor_contratado), SUM(valor_liberado), "
            "SUM(CASE WHEN chamada_publica LIKE ? THEN valor_contratado END), MAX(uf_proponente), MAX(razao_proponente) "
            "FROM fato_contrato_serie WHERE cpb IS NOT NULL AND cpb_score >= 0.95 GROUP BY cpb", _COMERCIALIZACAO)
        indireto = q("SELECT DISTINCT cpb, numero_salic FROM fato_fomento_indireto "
                     "WHERE cpb IS NOT NULL AND numero_salic IS NOT NULL")
    finally:
        if fechar:
            fsa_con.close()

    salics: dict[str, list[str]] = {}
    obras_por_salic: dict[str, set[str]] = {}
    for cpb, s in indireto:
        d = _so_digitos(s)
        if d:
            salics.setdefault(cpb, []).append(d)
            obras_por_salic.setdefault(d, set()).add(cpb)

    obras: dict[str, dict] = {}

    def obra(cpb: str) -> dict:
        return obras.setdefault(cpb, {
            "cpb": cpb, "titulo": None, "ano_lancamento": None, "tipo": None, "publico": None, "renda": None,
            "distribuidora": None, "uf": None, "produtora": None, "contratos_fsa": 0, "ano_primeiro_contrato": None,
            "fsa_contratado": None, "fsa_liberado": None, "fsa_comercializacao": None,
            "projetos_incentivo": 0, "captado": None, "captado_compartilhado": False,
            "municipios": None, "ufs": None, "complexos_pico": None, "anos_em_cartaz": None,
            "publico_fora_capitais_pct": None, "publico_diario": None, "publico_verificar": False})

    for cpb, titulo, ano, tipo, publico, renda, distribuidora in bilheteria:
        obra(cpb).update(titulo=titulo, ano_lancamento=ano, tipo=tipo, publico=publico, renda=renda,
                         distribuidora=distribuidora)
    for cpb, titulo, n, ano, contratado, liberado, comerc, uf, produtora in contratos:
        o = obra(cpb)
        o.update(contratos_fsa=n, ano_primeiro_contrato=ano, fsa_contratado=contratado, fsa_liberado=liberado,
                 fsa_comercializacao=comerc, uf=uf, produtora=produtora)
        o["titulo"] = o["titulo"] or titulo
    n_captado = 0
    for cpb, lista in salics.items():
        if cpb not in obras:
            continue  # obra só com incentivo, sem bilheteria nem FSA: fora desta visão
        o = obras[cpb]
        o["projetos_incentivo"] = len(lista)
        if captado is not None:
            valores = [captado[s] for s in lista if s in captado]
            if valores:
                o["captado"] = round(sum(valores), 2)
                n_captado += 1
        o["captado_compartilhado"] = any(len(obras_por_salic[s]) > 1 for s in lista)

    n_circ = n_verificar = 0
    for cpb, c in (circulacao or {}).items():
        o = obras.get(cpb)
        if o is None or o["publico"] is None:
            continue
        o.update(c)
        n_circ += 1
        # decisão 2: as duas medidas ficam lado a lado; a divergência é sinalizada, não corrigida.
        diario = c.get("publico_diario") or 0
        if diario > 2 * o["publico"] and diario >= LIMIAR_VERIFICAR:
            o["publico_verificar"] = True
            n_verificar += 1

    linhas = sorted(obras.values(), key=lambda o: (-(o["publico"] or -1), o["titulo"] or ""))
    ressalvas = [
        "Valores em R$ correntes, sem deflacionar: compare obras de anos distantes com cuidado.",
        "Público e renda são o total acumulado em salas de cinema; não há série semanal nem número de salas.",
        "Renda é a bilheteria bruta, não a receita do produtor nem o retorno ao FSA.",
        "FSA: só contratos com vínculo seguro à obra (confiança ≥ 0,95). Comercialização é a parte contratada "
        "nas chamadas de comercialização (lançamento); o investimento privado das distribuidoras não consta em nenhuma base.",
        "Captado é o total do projeto de incentivo fiscal (RIDAB), ligado pelo nº SALIC. "
        "Quando um projeto cobre mais de uma obra, o valor aparece em todas e a obra é sinalizada.",
        "UF e produtora são as da proponente do contrato do FSA (sede da empresa), não o local da produção; "
        "obras sem FSA não têm UF e saem do filtro por UF.",
        "Circulação (municípios, UFs, complexos, público fora das capitais) vem dos relatórios diários de "
        "bilheteria do RIDAB, completos só para lançamentos a partir de 2017; obras anteriores ficam sem circulação. "
        "Complexos é a soma dos complexos de cada exibidora no ano de maior público; não há número de salas nem semanas.",
        "Público a verificar: obras cujo público pelos relatórios diários do RIDAB passa do dobro do registrado "
        "na fsa.db (e de 10 mil). Concentram-se em lançamentos recentes, cujo público na fsa.db parece ter sido "
        "registrado logo no lançamento. As duas medidas ficam lado a lado; nenhuma é corrigida.",
        "Vazio significa sem registro na base, não zero.",
    ]
    if captado is None or circulacao is None:
        ressalvas.insert(0, "O RIDAB não respondeu: valor captado e circulação estão vazios nesta consulta.")
    return {
        "obras": linhas,
        "totais": {
            "obras": len(linhas),
            "com_bilheteria": sum(1 for o in linhas if o["publico"] is not None),
            "com_fsa": sum(1 for o in linhas if o["contratos_fsa"]),
            "com_comercializacao": sum(1 for o in linhas if o["fsa_comercializacao"]),
            "com_captado": n_captado,
            "com_circulacao": n_circ,
            "publico_a_verificar": n_verificar,
        },
        "ressalvas": ressalvas,
    }
