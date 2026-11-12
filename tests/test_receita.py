"""A receita aceita a justificativa de uma bifurcação, e só ela (limite de tamanho)."""
import pytest
from pydantic import ValidationError

from sonda.api import ReceitaIn

BASE = {"nome": "x", "autor": "a", "eixo": "agente",
        "esquerda": {"snapshot_id": "s1", "campo_chave": "nome"}}


def test_justificativa_e_opcional_e_persiste_na_receita():
    assert ReceitaIn(**BASE).model_dump()["justificativa"] is None
    r = ReceitaIn(**BASE, justificativa="acentos distinguem homônimos")
    assert r.model_dump(exclude={"nome", "autor", "versao_regra"})["justificativa"] == "acentos distinguem homônimos"


def test_justificativa_longa_demais_e_recusada():
    with pytest.raises(ValidationError):
        ReceitaIn(**BASE, justificativa="x" * 1001)
