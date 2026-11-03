"""Testes das séries anuais. Sem rede e sem Postgres: SQLite e Parquet sintéticos."""
import sqlite3

import duckdb
import pytest

from sonda import api, fsa, series


@pytest.fixture()
def fontes(tmp_path):
    """FSA sintética (SQLite em memória) e mini-RIDAB local, com os formatos reais."""
    sq = sqlite3.connect(":memory:")
    sq.execute("CREATE TABLE fato_contrato_serie (ano_contrato INTEGER, valor_contratado REAL)")
    sq.executemany("INSERT INTO fato_contrato_serie VALUES (?, ?)",
                   [(2019, 100e6), (2019, 50e6), (2020, 10e6)])
    sq.execute("CREATE TABLE fato_bilheteria (ano_lancamento INTEGER, data_lancamento TEXT, publico INTEGER)")
    sq.executemany("INSERT INTO fato_bilheteria VALUES (?, ?, ?)",
                   [(2019, "2019-05-01", 2_000_000), (2020, "2020-03-01", 140_000), (2021, "2021-07-15", 1_000_000)])

    d = duckdb.connect()
    d.execute(f"""COPY (SELECT * FROM (VALUES (2019, 4.31, 2.0), (2020, 4.52, 1.5), (2021, 10.06, 1.0))
        t(ano, ipca_pct, fator_real_2024)) TO '{tmp_path}/deflator_ipca.parquet' (FORMAT PARQUET)""")
    d.execute(f"""COPY (SELECT * FROM (VALUES
        ('2019-02-01'::TIMESTAMP, 30000000.00::DECIMAL(38,2)),
        ('2019-06-01'::TIMESTAMP, 10000000.00::DECIMAL(38,2)),
        (NULL::TIMESTAMP, 5000000.00::DECIMAL(38,2))) t(data_pub_aprovacao_projeto, total_captado))
        TO '{tmp_path}/renuncia_fiscal.parquet' (FORMAT PARQUET)""")
    d.execute(f"""COPY (SELECT * FROM (VALUES ('2019', 'ABERTA'), ('2019', 'ABERTA'), ('2019', 'FECHADA'),
        ('2020', 'ABERTA'), ('2020', 'FECHADA TEMPORARIAMENTE')) t(ano, status))
        TO '{tmp_path}/salas_exibicao_evolucao.parquet' (FORMAT PARQUET)""")
    # 2021 repete 2020: carry-forward do RIDAB, que não é dado.
    d.execute(f"""COPY (SELECT * FROM (VALUES (2019, 15.0, 21.0), (2020, 16.0, 20.0), (2021, 16.0, 20.0))
        t(ano, pmi_nominal, pmi_real_2024)) TO '{tmp_path}/preco_ingresso.parquet' (FORMAT PARQUET)""")
    d.close()
    return sq, str(tmp_path)


def _por_id(res):
    return {s["id"]: s for s in res["series"]}


def _valor(serie, ano):
    return next(x for x in serie["dados"] if x["ano"] == ano)


def test_real_aplica_o_fator_do_ano_do_evento(fontes):
    sq, base = fontes
    s = _por_id(series.calcular(2019, 2021, "real", fsa_con=sq, base=base))
    assert _valor(s["fomento_fsa"], 2019)["valor"] == pytest.approx(300.0)    # 150 mi × 2,0
    assert _valor(s["fomento_fsa"], 2020)["valor"] == pytest.approx(15.0)     # 10 mi × 1,5
    assert _valor(s["fomento_fsa"], 2019)["n"] == 2
    assert s["fomento_fsa"]["unidade"] == "R$ mi de 2024"


def test_nominal_nao_deflaciona(fontes):
    sq, base = fontes
    s = _por_id(series.calcular(2019, 2021, "nominal", fsa_con=sq, base=base))
    assert _valor(s["fomento_fsa"], 2019)["valor"] == pytest.approx(150.0)
    assert _valor(s["renuncia_fiscal"], 2019)["valor"] == pytest.approx(40.0)
    assert s["preco_ingresso"]["unidade"].endswith("correntes")


def test_ano_sem_dado_e_nulo_nunca_zero(fontes):
    sq, base = fontes
    s = _por_id(series.calcular(2018, 2022, "real", fsa_con=sq, base=base))
    assert _valor(s["fomento_fsa"], 2018)["valor"] is None
    assert _valor(s["fomento_fsa"], 2022)["valor"] is None
    assert _valor(s["salas_abertas"], 2018)["valor"] is None
    assert s["fomento_fsa"]["cobertura"] == {"de": 2019, "ate": 2020}


def test_ano_sem_fator_fica_nulo_em_real_mas_nao_em_nominal(fontes):
    sq, base = fontes
    sq.execute("INSERT INTO fato_contrato_serie VALUES (2025, 7e6)")
    real = _por_id(series.calcular(2024, 2025, "real", fsa_con=sq, base=base))
    nominal = _por_id(series.calcular(2024, 2025, "nominal", fsa_con=sq, base=base))
    assert _valor(real["fomento_fsa"], 2025)["valor"] is None
    assert _valor(nominal["fomento_fsa"], 2025)["valor"] == pytest.approx(7.0)


def test_renuncia_declara_o_que_ficou_de_fora(fontes):
    sq, base = fontes
    s = _por_id(series.calcular(2019, 2020, "real", fsa_con=sq, base=base))
    assert s["renuncia_fiscal"]["extras"]["sem_ano"] == {"projetos": 1, "valor_mi_correntes": 5.0}
    assert any("sem data de aprovação" in r for r in s["renuncia_fiscal"]["ressalvas"])


def test_salas_so_contam_status_aberta(fontes):
    sq, base = fontes
    s = _por_id(series.calcular(2019, 2020, "real", fsa_con=sq, base=base))
    assert _valor(s["salas_abertas"], 2019)["valor"] == 2
    assert _valor(s["salas_abertas"], 2020)["valor"] == 1


def test_valor_repetido_do_ridab_e_omitido_e_declarado(fontes):
    sq, base = fontes
    s = _por_id(series.calcular(2019, 2021, "real", fsa_con=sq, base=base))
    assert _valor(s["preco_ingresso"], 2020)["valor"] == pytest.approx(20.0)
    assert _valor(s["preco_ingresso"], 2021)["valor"] is None
    assert any("2021" in r and "omitidos" in r for r in s["preco_ingresso"]["ressalvas"])


def test_ultimo_ano_do_publico_e_marcado_como_parcial(fontes):
    sq, base = fontes
    s = _por_id(series.calcular(2019, 2021, "real", fsa_con=sq, base=base))
    assert _valor(s["publico_obras_brasileiras"], 2021)["parcial"] is True   # última data: julho
    assert _valor(s["publico_obras_brasileiras"], 2020)["parcial"] is False
    assert _valor(s["publico_obras_brasileiras"], 2020)["valor"] == pytest.approx(0.14)


def test_parametros_invalidos_sao_recusados(fontes):
    sq, base = fontes
    with pytest.raises(ValueError):
        series.calcular(2019, 2020, "dolar", fsa_con=sq, base=base)
    with pytest.raises(ValueError):
        series.calcular(2020, 2019, "real", fsa_con=sq, base=base)
    with pytest.raises(ValueError):
        series.calcular(1900, 2020, "real", fsa_con=sq, base=base)


# ── rota ────────────────────────────────────────────────────────────────────────
@pytest.fixture()
def cliente(monkeypatch):
    from fastapi.testclient import TestClient

    chamadas = []

    def falso(de, ate, moeda):
        chamadas.append((de, ate, moeda))
        return {"moeda": moeda, "de": de, "ate": ate, "anos": [de], "series": [], "avisos": ["aviso x"]}

    monkeypatch.setattr(fsa, "disponivel", lambda: True)
    monkeypatch.setattr(fsa, "proveniencia_base", lambda: {"fonte": "fsa"})
    monkeypatch.setattr(api.ridab, "proveniencia_base", lambda tabelas=None, com_sha=True: {"fonte": "ridab"})
    monkeypatch.setattr(api.series_mod, "calcular", falso)
    c = TestClient(api.app)
    c.chamadas = chamadas
    return c


def test_rota_devolve_envelope_com_as_duas_proveniencias(cliente):
    r = cliente.get("/api/series?de=2015&ate=2020&moeda=nominal")
    assert r.status_code == 200
    j = r.json()
    assert [p["fonte"] for p in j["proveniencia"]] == ["fsa", "ridab"]
    assert j["avisos"] == ["aviso x"]
    assert cliente.chamadas[-1] == (2015, 2020, "nominal")


def test_rota_recusa_parametro_invalido_com_422(cliente, monkeypatch):
    def recusa(de, ate, moeda):
        raise ValueError("intervalo de anos inválido")

    monkeypatch.setattr(api.series_mod, "calcular", recusa)
    assert cliente.get("/api/series?de=2020&ate=2010").status_code == 422
