"""Testes do motor de cruzamento — sem banco, só DuckDB em memória.

Cobrem as decisões que o motor encarna: junção por eixo (schema-on-read),
órfãos como achado (porosidade 4) e contrato de base faltante (Sonda generativa).
"""
import json
import pathlib

from sonda import engine

FIX = pathlib.Path(__file__).resolve().parent.parent / "fixtures"


def _carga(nome):
    return json.loads((FIX / nome).read_text(encoding="utf-8"))["registros"]


def test_extrair_chave_pontilhada():
    rec = {"location": {"municipio": "Belém"}}
    assert engine.extrair_chave(rec, "location.municipio") == "Belém"
    assert engine.extrair_chave(rec, "location.uf") is None


def test_normalizar_remove_acento_e_caixa():
    assert engine.normalizar("São Paulo") == "sao paulo"
    assert engine.normalizar("  BELÉM  ") == "belem"
    assert engine.normalizar(None) is None


def test_cruzamento_territorio_liga_e_revela_orfaos():
    esquerda = _carga("mapa_cultural_cinema.json")  # agentes
    direita = _carga("oca_salas.json")              # salas
    receita = {
        "eixo": "territorio",
        "esquerda": {"campo_chave": "location.municipio", "id_chave": "name"},
        "direita": {"campo_chave": "municipio", "id_chave": "razao_social"},
        "regra": "igualdade_normalizada",
    }
    r = engine.executar(receita, esquerda, direita)
    assert r["executavel"] is True
    # Rio, Fortaleza, Belém, São Paulo coincidem ⇒ 4 ligações.
    assert r["ligados"] == 4
    # Tiradentes e Foz do Iguaçu ficam órfãos do lado dos agentes.
    assert r["orfaos_esquerda"] == 2
    # Curitiba e Salvador ficam órfãos do lado das salas — achado, não escondido.
    assert r["orfaos_direita"] == 2
    rotulos_orfaos_esq = {o["rotulo"] for o in r["amostra_orfaos_esquerda"]}
    assert "Tiradentes" in rotulos_orfaos_esq


def test_base_faltante_devolve_contrato_com_pergunta_no_topo():
    receita = {
        "eixo": "agente",
        "esquerda": {"campo_chave": "municipio"},
        "direita": None,
        "base_faltante": {
            "pergunta": "De onde vem o público?",
            "hipoteses_de_ligacao": ["por CEP do espectador → sala"],
        },
    }
    r = engine.executar(receita, _carga("oca_salas.json"), None)
    assert r["executavel"] is False
    contrato = r["contrato"]
    # o coração do contrato é a pergunta de pesquisa.
    assert contrato["pergunta_de_pesquisa"] == "De onde vem o público?"
    # o eixo é hipótese, exibido abaixo.
    assert contrato["eixo_de_ligacao_hipotese"]["eixo"] == "agente"
    assert "?" not in contrato["pergunta_de_pesquisa"][:5]  # pergunta real, não placeholder
