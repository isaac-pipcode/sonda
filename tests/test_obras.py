"""Visão de obras: uma linha por CPB, sem somar entre bases. Sem rede: dados sintéticos."""
import sqlite3

import pytest

from sonda import obras


@pytest.fixture()
def con():
    sq = sqlite3.connect(":memory:")
    sq.execute("""CREATE TABLE fato_bilheteria (cpb TEXT, titulo TEXT, ano_lancamento INTEGER, tipo_obra TEXT,
        publico INTEGER, renda REAL, distribuidora TEXT)""")
    sq.executemany("INSERT INTO fato_bilheteria VALUES (?,?,?,?,?,?,?)", [
        ("B1", "GRANDE", 2018, "FICÇÃO", 1_000_000, 15e6, "D1"),
        ("B2", "PEQUENO", 2019, "DOCUMENTÁRIO", 20_000, 2e5, "D2"),
    ])
    sq.execute("""CREATE TABLE fato_contrato_serie (cpb TEXT, cpb_score REAL, titulo_projeto TEXT, ano_contrato INTEGER,
        valor_contratado REAL, valor_liberado REAL, chamada_publica TEXT, uf_proponente TEXT, razao_proponente TEXT)""")
    sq.executemany("INSERT INTO fato_contrato_serie VALUES (?,?,?,?,?,?,?,?,?)", [
        ("B1", 1.0, "GRANDE", 2016, 3e6, 3e6, "PRODECINE 01", "RJ", "P1"),
        ("B1", 1.0, "GRANDE", 2018, 5e5, 4e5, "COMERCIALIZAÇÃO EM CINEMA", "RJ", "P1"),
        ("B2", 0.6, "PEQUENO", 2017, 1e6, 1e6, "PRODAV 01", "RO", "P2"),     # vínculo ambíguo: fora
        ("B3", 0.95, "SEM BILHETERIA", 2022, 2e6, 0.0, "PRODAV 01", "SP", "P3"),
    ])
    sq.execute("CREATE TABLE fato_fomento_indireto (cpb TEXT, numero_salic TEXT)")
    sq.executemany("INSERT INTO fato_fomento_indireto VALUES (?,?)", [
        ("B1", "100067"), ("B2", "0200301"), ("B9", "300000"), ("B2", "100067")])
    return sq


def test_uma_linha_por_obra_sem_somar_entre_bases(con):
    r = obras.calcular(fsa_con=con, captado={"100067": 7e6, "200301": 3e5})
    o = {x["cpb"]: x for x in r["obras"]}
    assert set(o) == {"B1", "B2", "B3"}                       # B9 só tem incentivo: fora
    assert o["B1"]["fsa_contratado"] == pytest.approx(3.5e6)
    assert o["B1"]["fsa_comercializacao"] == pytest.approx(5e5)
    assert o["B1"]["publico"] == 1_000_000 and o["B1"]["captado"] == pytest.approx(7e6)


def test_vinculo_ambiguo_fica_fora_e_ausencia_e_nula(con):
    o = {x["cpb"]: x for x in obras.calcular(fsa_con=con, captado={})["obras"]}
    assert o["B2"]["fsa_contratado"] is None and o["B2"]["contratos_fsa"] == 0
    assert o["B3"]["publico"] is None                          # sem bilheteria ≠ público zero
    assert o["B2"]["captado"] is None


def test_salic_normalizado_e_projeto_compartilhado_sinalizado(con):
    o = {x["cpb"]: x for x in obras.calcular(fsa_con=con, captado={"100067": 7e6, "200301": 3e5})["obras"]}
    assert o["B2"]["captado"] == pytest.approx(7.3e6)          # '0200301' casa com '200301'
    assert o["B1"]["captado_compartilhado"] and o["B2"]["captado_compartilhado"]


def test_sem_ridab_a_coluna_sai_nula_e_a_ressalva_declara(con):
    r = obras.calcular(fsa_con=con, captado=None)
    assert all(x["captado"] is None for x in r["obras"])
    assert "RIDAB não respondeu" in r["ressalvas"][0]
