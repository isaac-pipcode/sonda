"""Reconstrução da bilheteria a partir do arquivo oficial da ANCINE. Sem rede."""
import sqlite3

import pytest

import atualizar_bilheteria as ab

CSV = (
    "﻿DATA_LANCAMENTO_OBRA;TITULO_ORIGINAL;CPB_ROE;TIPO_OBRA;PAIS_OBRA;PUBLICO_TOTAL;RENDA_TOTAL;"
    "RAZAO_SOCIAL_DISTRIBUIDORA;REGISTRO_DISTRIBUIDORA;CNPJ_DISTRIBUIDORA\n"
    "19/09/2024;AINDA ESTOU AQUI;B1;FICÇÃO;BRASIL;738;R$ 8.403,00;CINE CAXAMBU LTDA;1;00.000.000/0001-01\n"
    "19/09/2024;AINDA ESTOU AQUI;B1;FICÇÃO;BRASIL;5856874;R$ 118.210.744,44;COLUMBIA;2;00.000.000/0001-02\n"
    "01/04/2010;CHICO XAVIER;B2;FICÇÃO;BRASIL;3413165;R$ 30.279.613,71;COLUMBIA;2;00.000.000/0001-02\n"
    "01/04/2010;CHICO XAVIER;B2;FICÇÃO;BRASIL;3127290;R$ 27.851.626,91;FREESPIRIT;3;00.000.000/0001-03\n"
    "04/09/2025;FILME ESTRANGEIRO;E9;FICÇÃO;CANADÁ;190;R$ 3.299,02;PLAYARTE;4;00.000.000/0001-04\n"
)


@pytest.fixture()
def con():
    sq = sqlite3.connect(":memory:")
    sq.execute("""CREATE TABLE fato_bilheteria (bilheteria_id INTEGER PRIMARY KEY, cpb TEXT NOT NULL UNIQUE,
        titulo TEXT NOT NULL, titulo_norm TEXT, data_lancamento TEXT, ano_lancamento INTEGER, tipo_obra TEXT,
        publico INTEGER, renda REAL, distribuidora TEXT, cnpj_distribuidora TEXT, fonte TEXT)""")
    sq.executemany("INSERT INTO fato_bilheteria (cpb, titulo, titulo_norm, publico, fonte) VALUES (?,?,?,?,?)", [
        ("B1", "AINDA ESTOU AQUI", "ainda estou aqui", 738, "antiga.csv"),
        ("B7", "SÓ NA BASE ANTIGA", "so na base antiga", 100, "antiga.csv")])
    sq.execute("CREATE TABLE meta_tabela (tabela, descricao, fonte, cobertura)")
    sq.execute("CREATE TABLE meta_coluna (tabela, coluna, descricao, ressalva)")
    return sq


def test_le_so_obras_brasileiras_e_converte_valores():
    ls = ab.ler_oficial(CSV)
    assert {r["cpb"] for r in ls} == {"B1", "B2"}
    r = next(x for x in ls if x["distribuidora"] == "COLUMBIA" and x["cpb"] == "B1")
    assert r["publico"] == 5856874 and r["renda"] == pytest.approx(118210744.44)
    assert r["data_lancamento"] == "2024-09-19" and r["ano_lancamento"] == 2024


def test_linha_principal_e_a_de_maior_publico_e_nao_soma():
    p = ab.linha_principal(ab.ler_oficial(CSV))
    assert p["B1"]["publico"] == 5856874 and p["B1"]["distribuidora"] == "COLUMBIA"
    assert p["B2"]["publico"] == 3413165                       # não 6,5 mi (codistribuição)
    assert p["B1"]["n_distribuidoras"] == 2


def test_aplicar_corrige_preserva_todas_as_linhas_e_sinaliza_ausentes(con):
    res = ab.aplicar(con, ab.ler_oficial(CSV), "oficial.csv · sha256 abc · 2026-11-12")
    b = {r[0]: r for r in con.execute("SELECT cpb, publico, distribuidora, n_distribuidoras, fonte FROM fato_bilheteria")}
    assert b["B1"][1] == 5856874 and b["B1"][3] == 2
    assert "ausente do arquivo oficial de 2026-11-12" in b["B7"][4]      # mantida e sinalizada
    todas = con.execute("SELECT cpb, distribuidora, principal FROM fato_bilheteria_distribuidora ORDER BY cpb, publico").fetchall()
    assert todas == [("B1", "CINE CAXAMBU LTDA", 0), ("B1", "COLUMBIA", 1), ("B2", "FREESPIRIT", 0), ("B2", "COLUMBIA", 1)]
    assert res["publico_alterado"] == 1 and res["novas"] == 1 and res["mantidas_ausentes_do_oficial"] == ["B7"]
    assert con.execute("SELECT COUNT(*) FROM meta_tabela").fetchone()[0] == 2


def test_titulo_norm_como_na_fsa_db():
    assert ab.titulo_norm("A PRIMEIRA MISSA") == "primeira missa"
    assert ab.titulo_norm("(DES)CONTROLE") == "des controle"
    assert ab.titulo_norm("UMA NOVA HISTÓRIA") == "nova historia"
