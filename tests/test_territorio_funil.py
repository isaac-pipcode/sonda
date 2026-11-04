"""Testes de território e funil de ligação. Sem rede e sem Postgres: dados sintéticos."""
import sqlite3

import duckdb
import pytest

from sonda import api, funil, fsa, territorio


@pytest.fixture()
def fontes(tmp_path):
    sq = sqlite3.connect(":memory:")
    sq.execute("""CREATE TABLE fato_contrato_serie (titulo_projeto TEXT, razao_proponente TEXT,
        uf_proponente TEXT, ano_contrato INTEGER, valor_contratado REAL, chamada_publica TEXT,
        cpb TEXT, cpb_metodo TEXT, cpb_score REAL)""")
    sq.executemany("INSERT INTO fato_contrato_serie VALUES (?,?,?,?,?,?,?,?,?)", [
        ("A", "P1", "SP", 2019, 100e6, "PRODAV 01", "B1", "num_contrato", 1.0),
        ("B", "P2", "SP", 2019, 50e6, "PRODAV 01", "B2", "titulo", 0.95),
        ("C", "P3", "RJ", 2020, 30e6, "PRODAV 02", "B3", "titulo_ambiguo", 0.6),
        ("D", "P4", "RJ", 2020, 20e6, "PRODAV 02", None, None, 0.0),
        ("E", "P5", None, 2020, 10e6, "PRODAV 02", None, None, 0.0),
    ])
    sq.execute("CREATE TABLE fato_bilheteria (cpb TEXT)")
    sq.execute("INSERT INTO fato_bilheteria VALUES ('B1')")
    sq.execute("CREATE TABLE fato_exibicao_uf (uf TEXT, assentos INTEGER, salas INTEGER, populacao INTEGER, salas_por_100mil_hab REAL)")
    sq.executemany("INSERT INTO fato_exibicao_uf VALUES (?,?,?,?,?)", [
        ("SP", 0, 90, 9_000_000, 0), ("RJ", 0, 10, 1_000_000, 0), ("RO", 0, 5, 500_000, 0)])
    sq.execute("CREATE TABLE fato_exibicao_municipio (uf TEXT, populacao INTEGER)")
    sq.executemany("INSERT INTO fato_exibicao_municipio VALUES (?,?)", [("RO", 800_000), ("SP", 4_000_000)])
    d = duckdb.connect()
    d.execute(f"""COPY (SELECT * FROM (VALUES (2019, 4.3, 2.0), (2020, 4.5, 1.5)) t(ano, ipca_pct, fator_real_2024))
        TO '{tmp_path}/deflator_ipca.parquet' (FORMAT PARQUET)""")
    d.close()
    return sq, str(tmp_path)


# ── território ──────────────────────────────────────────────────────────────────
def test_territorio_real_deflaciona_e_calcula_partes_so_sobre_contratos_com_uf(fontes):
    sq, base = fontes
    r = territorio.calcular("real", fsa_con=sq, base=base)
    uf = {u["sigla"]: u for u in r["ufs"]}
    assert uf["SP"]["fomento_mi"] == pytest.approx(300.0)           # 150 mi × 2,0
    assert uf["RJ"]["fomento_mi"] == pytest.approx(75.0)            # 50 mi × 1,5
    assert uf["SP"]["parte_fomento"] == pytest.approx(80.0)         # 300 / 375
    assert r["sem_uf"] == {"contratos": 1, "fomento_mi": 15.0}      # 10 mi × 1,5, fora das partes
    assert r["unidade"] == "R$ mi de 2024"


def test_territorio_nominal_nao_deflaciona(fontes):
    sq, base = fontes
    uf = {u["sigla"]: u for u in territorio.calcular("nominal", fsa_con=sq, base=base)["ufs"]}
    assert uf["SP"]["fomento_mi"] == pytest.approx(150.0)


def test_territorio_salas_e_razao_por_100_mil(fontes):
    sq, base = fontes
    r = territorio.calcular("nominal", fsa_con=sq, base=base)
    uf = {u["sigla"]: u for u in r["ufs"]}
    assert uf["SP"]["salas_por_100mil"] == pytest.approx(1.0)
    assert uf["SP"]["parte_salas"] == pytest.approx(90 / 105 * 100, abs=0.01)
    assert r["media_nacional_salas_100mil"] == pytest.approx(105 * 1e5 / 10_500_000)
    assert r["concentracao"]["ufs"] == ["SP", "RJ"]


def test_populacao_menor_que_a_dos_municipios_e_sinalizada_nao_corrigida(fontes):
    sq, base = fontes
    uf = {u["sigla"]: u for u in territorio.calcular("nominal", fsa_con=sq, base=base)["ufs"]}
    assert "(800.000), o que é impossível" in uf["RO"]["verificar"]   # milhar com ponto, vírgula preservada
    assert uf["RO"]["populacao"] == 500_000                  # o dado nativo é preservado
    assert uf["RO"]["fomento_por_habitante"] is None        # mas não vira per capita
    assert uf["SP"]["verificar"] is None


def test_territorio_moeda_invalida(fontes):
    sq, base = fontes
    with pytest.raises(ValueError):
        territorio.calcular("dolar", fsa_con=sq, base=base)


# ── funil ───────────────────────────────────────────────────────────────────────
def test_funil_segmentos_sao_exclusivos_e_somam_o_total(fontes):
    sq, _ = fontes
    r = funil.calcular(fsa_con=sq)
    seg = r["salto_contrato_obra"]["segmentos"]
    assert {k: v["contratos"] for k, v in seg.items()} == {"seguro": 2, "ambiguo": 1, "sem_obra": 2}
    assert sum(v["contratos"] for v in seg.values()) == r["contratos"]["total"] == 5
    assert seg["sem_obra"]["parte"] == pytest.approx(40.0)
    assert seg["seguro"]["valor_mi"] == pytest.approx(150.0)


def test_funil_obra_para_bilheteria(fontes):
    sq, _ = fontes
    s = funil.calcular(fsa_con=sq)["salto_obra_bilheteria"]
    assert (s["obras_com_vinculo_seguro"], s["com_bilheteria"], s["sem_bilheteria"]) == (2, 1, 1)
    assert s["parte_com_bilheteria"] == pytest.approx(50.0)


def test_funil_orfaos_por_ano_chamada_e_maiores(fontes):
    sq, _ = fontes
    r = funil.calcular(fsa_con=sq)
    por_ano = {a["ano"]: a for a in r["por_ano"]}
    assert por_ano[2019]["parte_sem_obra"] == 0.0
    assert por_ano[2020]["sem_obra"] == 2 and por_ano[2020]["parte_sem_obra"] == pytest.approx(66.7)
    assert r["por_chamada"][0] == {"chamada": "PRODAV 02", "sem_obra": 2, "contratos": 3, "parte_sem_obra": 66.7}
    assert [m["projeto"] for m in r["maiores_sem_obra"]] == ["D", "E"]
    assert r["elo_ausente"]["para"] == "Município de exibição"


# ── rotas ───────────────────────────────────────────────────────────────────────
@pytest.fixture()
def cliente(monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setattr(fsa, "disponivel", lambda: True)
    monkeypatch.setattr(fsa, "proveniencia_base", lambda: {"fonte": "fsa"})
    monkeypatch.setattr(api.ridab, "proveniencia_base", lambda tabelas=None, com_sha=True: {"fonte": "ridab"})
    monkeypatch.setattr(api.territorio_mod, "calcular", lambda moeda: {"moeda": moeda, "ressalvas": ["r1"]})
    monkeypatch.setattr(api.funil_mod, "calcular", lambda: {"ressalvas": ["r2"]})
    return TestClient(api.app)


def test_rotas_devolvem_envelope_com_proveniencia_e_avisos(cliente):
    t = cliente.get("/api/territorio?moeda=nominal").json()
    assert t["dados"]["moeda"] == "nominal" and t["avisos"] == ["r1"]
    assert [p["fonte"] for p in t["proveniencia"]] == ["fsa", "ridab"]
    f = cliente.get("/api/ligacoes/funil").json()
    assert f["proveniencia"] == {"fonte": "fsa"} and f["avisos"] == ["r2"]


def test_territorio_recusa_moeda_invalida_com_422(cliente, monkeypatch):
    def recusa(moeda):
        raise ValueError("moeda inválida")

    monkeypatch.setattr(api.territorio_mod, "calcular", recusa)
    assert cliente.get("/api/territorio?moeda=dolar").status_code == 422
