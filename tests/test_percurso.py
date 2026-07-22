"""Testes do motor de percurso (rede de caminhos, Documento 02). Sem banco.

Cobrem: aresta factual (articulação real), nó derivado (dado inferido) e elo
ausente (incompletude topológica → contrato de base faltante gerador).
"""
import json
import pathlib

from sonda import percurso

FIX = pathlib.Path(__file__).resolve().parent.parent / "fixtures"


def _carga(nome):
    return json.loads((FIX / nome).read_text(encoding="utf-8"))["registros"]


def _definicao():
    return {
        "nos": [
            {"id": "filme", "rotulo": "Agentes", "tipo": "factual",
             "fonte": {"campo_chave": "location.municipio", "id_chave": "name"}},
            {"id": "salas", "rotulo": "Salas", "tipo": "factual",
             "fonte": {"campo_chave": "municipio", "id_chave": "razao_social"}},
            {"id": "preco", "rotulo": "Preço médio", "tipo": "derivado", "derivacao": "renda ÷ público"},
            {"id": "origem", "rotulo": "Origem do público", "tipo": "ausente",
             "base_faltante": {"pergunta": "De onde vem o público?",
                               "hipoteses_de_ligacao": ["por CEP → sala"]}},
        ],
        "arestas": [
            {"de": "filme", "para": "salas", "eixo": "territorio", "regra": "igualdade_normalizada"},
            {"de": "salas", "para": "preco", "tipo": "derivado"},
            {"de": "salas", "para": "origem", "tipo": "ausente", "eixo": "agente"},
        ],
    }


def _cargas():
    return {
        "filme": _carga("mapa_cultural_cinema.json"),
        "salas": _carga("oca_salas.json"),
        "preco": [], "origem": [],
    }


def test_travessia_multissalto_classifica_arestas():
    r = percurso.executar_percurso(_definicao(), _cargas())
    tipos = [s["tipo"] for s in r["saltos"]]
    assert tipos == ["factual", "derivado", "ausente"]
    resumo = r["resumo"]
    assert resumo["n_factuais"] == 1
    assert resumo["n_derivados"] == 1
    assert resumo["n_elos_ausentes"] == 1


def test_aresta_factual_liga_e_revela_orfaos():
    r = percurso.executar_percurso(_definicao(), _cargas())
    factual = r["saltos"][0]
    # Rio, Fortaleza, Belém, São Paulo coincidem ⇒ 4 ligações; órfãos são achado.
    assert factual["ligados"] == 4
    assert factual["orfaos_esquerda"] == 2
    assert factual["orfaos_direita"] == 2


def test_elo_ausente_gera_contrato_com_pergunta_no_topo():
    r = percurso.executar_percurso(_definicao(), _cargas())
    ausente = r["saltos"][2]
    assert ausente["contrato"]["pergunta_de_pesquisa"] == "De onde vem o público?"
    assert ausente["contrato"]["eixo_de_ligacao_hipotese"]["eixo"] == "agente"


def test_no_derivado_marcado_como_inferido():
    r = percurso.executar_percurso(_definicao(), _cargas())
    derivado = r["saltos"][1]
    assert derivado["derivacao"] == "renda ÷ público"
    assert "não é dado primário" in derivado["nota"]


def test_snapshots_referenciados():
    definicao = {"nos": [
        {"id": "a", "fonte": {"snapshot_id": "S1"}},
        {"id": "b", "fonte": {"snapshot_id": "S2"}},
        {"id": "c", "tipo": "ausente"},
    ]}
    assert percurso.snapshots_referenciados(definicao) == {"S1", "S2"}
