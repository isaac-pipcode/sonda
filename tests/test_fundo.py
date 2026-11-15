"""Receitas do fundo: agrupamento por fonte e razões descritivas. Dados sintéticos."""
import sqlite3

import pytest

from sonda import fundo


@pytest.fixture()
def con():
    sq = sqlite3.connect(":memory:")
    sq.execute("CREATE TABLE fato_receita (ano INTEGER, fonte_receita TEXT, valor REAL)")
    sq.executemany("INSERT INTO fato_receita VALUES (?,?,?)", [
        (2019, "condecine - teles", 800e6), (2019, "condecine - titulo", 100e6),
        (2019, "retorno de investimentos", 10e6), (2019, "retorno de financiamento", 40e6),
        (2020, "retorno de investimentos", 5e6), (2020, "fonte nova", 45e6),
    ])
    sq.execute("CREATE TABLE fato_contrato_serie (ano_contrato INTEGER, valor_contratado REAL, valor_liberado REAL)")
    sq.executemany("INSERT INTO fato_contrato_serie VALUES (?,?,?)", [(2019, 300e6, 290e6), (2021, 100e6, 0.0)])
    return sq


def test_agrupa_condecine_e_separa_retorno_das_obras_do_de_emprestimos(con):
    r = fundo.calcular(con)
    a19 = r["linhas"][0]
    assert a19["por_fonte_mi"]["Condecine"] == 900.0
    assert a19["retorno_obras_mi"] == 10.0 and a19["retornos_mi"] == 50.0
    assert a19["contratado_mi"] == 300.0


def test_fonte_desconhecida_vai_para_outras_e_ano_sem_contrato_e_nulo(con):
    a20 = fundo.calcular(con)["linhas"][1]
    assert a20["por_fonte_mi"]["Outras"] == 45.0
    assert a20["contratado_mi"] is None


def test_resumo_descreve_a_parte_das_obras_na_receita(con):
    s = fundo.calcular(con)["resumo"]
    assert s["periodo"] == "2019–2020"
    assert s["receita_total_mi"] == 1000.0
    assert s["parte_obras_na_receita"] == 1.5                  # 15 / 1000
    assert s["obras_sobre_contratado"] == 5.0                  # 15 / 300 (só anos com receita)
