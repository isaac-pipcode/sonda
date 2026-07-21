"""Percurso — a rede de caminhos (Documento 02) no backend.

A análise não é uma junção A×B: é um TRAVESSIA multi-salto por uma cadeia de nós
(entidades) e arestas (articulações), possivelmente entre bases distintas. Cada
salto carrega sua própria regra de ligação e sua própria proveniência — a aresta
exposta é a costura tornada visível (seamful design).

Tipos (Documento 02):
  • nó/aresta FACTUAL  — dado primário; a aresta é uma articulação real entre
    dois conjuntos, executada pelo motor de cruzamento (DuckDB).
  • nó/aresta DERIVADO — dado calculado, não medido (ex.: preço = renda ÷ público).
    Não há junção entre bases; marca-se explicitamente o que é inferido.
  • nó/aresta AUSENTE  — o elo que nenhuma base fecha. A incompletude é topológica
    (um fio interrompido), e vira GERADOR: emite o contrato de base faltante, com
    a pergunta de pesquisa no topo (a Sonda generativa).

Este módulo é puro: recebe a `definicao` do percurso e as cargas já resolvidas
por nó (`cargas_por_no`), e devolve o resultado da travessia. Quem resolve as
cargas (snapshot no Postgres, visão da FSA no SQLite…) é a API — assim o motor
permanece testável offline e agnóstico à fonte (incomensurabilidade).
"""
from __future__ import annotations

from typing import Optional

from . import engine


def _tipo_aresta(aresta: dict, no_para: dict) -> str:
    """A aresta herda o tipo do nó de destino, salvo se declarar o próprio."""
    return aresta.get("tipo") or no_para.get("tipo") or "factual"


def executar_percurso(definicao: dict, cargas_por_no: dict[str, list]) -> dict:
    """Executa a travessia. `cargas_por_no[no_id]` = lista de registros nativos
    do nó (vazia para nós derivado/ausente). Devolve saltos + resumo.
    """
    nos = {n["id"]: n for n in definicao.get("nos", [])}
    saltos = []

    for aresta in definicao.get("arestas", []):
        no_de = nos.get(aresta["de"], {})
        no_para = nos.get(aresta["para"], {})
        tipo = _tipo_aresta(aresta, no_para)
        base = {"de": aresta["de"], "para": aresta["para"],
                "rotulo_de": no_de.get("rotulo"), "rotulo_para": no_para.get("rotulo")}

        if tipo == "ausente":
            # incompletude topológica → contrato de base faltante (gerador).
            receita = {"eixo": aresta.get("eixo"),
                       "base_faltante": no_para.get("base_faltante", {})}
            saltos.append({**base, "tipo": "ausente",
                           "contrato": engine.contrato_base_faltante(receita)})

        elif tipo == "derivado":
            # nó derivado: dado inferido, não medido. Sem junção entre bases.
            saltos.append({**base, "tipo": "derivado",
                           "derivacao": no_para.get("derivacao"),
                           "nota": "nó derivado · não é dado primário"})

        else:  # factual — articulação real, executada pelo motor de cruzamento.
            f_de = no_de.get("fonte", {})
            f_para = no_para.get("fonte", {})
            receita = {
                "eixo": aresta.get("eixo"),
                "esquerda": {"campo_chave": f_de.get("campo_chave"),
                             "id_chave": f_de.get("id_chave", "id")},
                "direita": {"campo_chave": f_para.get("campo_chave"),
                            "id_chave": f_para.get("id_chave", "id")},
                "regra": aresta.get("regra", "igualdade_normalizada"),
            }
            r = engine.executar(receita, cargas_por_no.get(aresta["de"], []),
                                cargas_por_no.get(aresta["para"], []))
            saltos.append({
                **base, "tipo": "factual", "eixo": aresta.get("eixo"),
                "ligados": r["ligados"],
                "orfaos_esquerda": r["orfaos_esquerda"],
                "orfaos_direita": r["orfaos_direita"],
                "amostra_ligados": r["amostra_ligados"],
                "amostra_orfaos_esquerda": r["amostra_orfaos_esquerda"],
                "amostra_orfaos_direita": r["amostra_orfaos_direita"],
                "saneamento": r["saneamento"],
            })

    factuais = [s for s in saltos if s["tipo"] == "factual"]
    resumo = {
        "n_saltos": len(saltos),
        "n_factuais": len(factuais),
        "n_derivados": sum(1 for s in saltos if s["tipo"] == "derivado"),
        "n_elos_ausentes": sum(1 for s in saltos if s["tipo"] == "ausente"),
        "ligados_total": sum(s["ligados"] for s in factuais),
        "orfaos_total": sum(s["orfaos_esquerda"] + s["orfaos_direita"] for s in factuais),
    }
    return {"saltos": saltos, "resumo": resumo}


def snapshots_referenciados(definicao: dict) -> set[str]:
    """IDs de snapshot citados pelos nós (para a API pré-carregar as cargas)."""
    ids = set()
    for n in definicao.get("nos", []):
        f = n.get("fonte") or {}
        if f.get("snapshot_id"):
            ids.add(f["snapshot_id"])
    return ids
