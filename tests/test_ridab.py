"""Testes do conector RIDAB. Sem rede e sem Postgres: Parquet sintético local."""
import duckdb
import pytest

from sonda import fsa, ridab


@pytest.fixture()
def pasta_ridab(tmp_path):
    """Mini-RIDAB local, com os formatos REAIS (CNPJ pontuado, IBGE em double)."""
    con = duckdb.connect()
    con.execute("""
        COPY (SELECT * FROM (VALUES
            ('11.111.111/0001-11', 3550308.0, 'SP', '2010-01-01'::TIMESTAMP),
            ('11.111.111/0001-11', 3304557.0, 'RJ', '2020-01-01'::TIMESTAMP),
            ('22.222.222/0001-22', 3106200.0, 'MG', '2015-01-01'::TIMESTAMP)
        ) t(cnpj, codigo_municipio_ibge, uf, data_registro))
        TO '{}/agentes_economicos.parquet' (FORMAT PARQUET)""".format(tmp_path))
    con.execute("""
        COPY (SELECT * FROM (VALUES (2019, 1.5), (2020, 1.25)) t(ano, fator_real_2024))
        TO '{}/deflator_ipca.parquet' (FORMAT PARQUET)""".format(tmp_path))
    con.close()
    return str(tmp_path)


def _con_com_contratos(pasta, linhas):
    con = duckdb.connect()
    con.execute("""CREATE TABLE contratos (contrato_serie_id BIGINT, cnpj_proponente VARCHAR,
                   ano_contrato BIGINT, valor_contratado DOUBLE, valor_liberado DOUBLE)""")
    con.executemany("INSERT INTO contratos VALUES (?,?,?,?,?)", linhas)
    con.execute("CREATE TABLE agentes AS SELECT * FROM read_parquet(?)", [f"{pasta}/agentes_economicos.parquet"])
    con.execute("CREATE TABLE deflator AS SELECT * FROM read_parquet(?)", [f"{pasta}/deflator_ipca.parquet"])
    return con


def test_cnpj_pontuado_casa_com_cnpj_so_digitos(pasta_ridab):
    """Sem normalização o cruzamento devolve zero (docs/RIDAB_INVENTARIO.md §2)."""
    con = _con_com_contratos(pasta_ridab, [(1, "22222222000122", 2019, 100.0, 80.0)])
    cols, linhas = ridab.enriquecer(con)
    r = dict(zip(cols, linhas[0]))
    assert r["codigo_municipio_ibge"] == "3106200"
    assert r["uf_agente"] == "MG"


def test_ultimo_registro_do_cnpj_vence_e_nao_multiplica_linhas(pasta_ridab):
    con = _con_com_contratos(pasta_ridab, [(1, "11111111000111", 2019, 100.0, 80.0)])
    cols, linhas = ridab.enriquecer(con)
    assert len(linhas) == 1
    assert dict(zip(cols, linhas[0]))["codigo_municipio_ibge"] == "3304557"  # registro de 2020


def test_valores_deflacionados_pelo_ano_do_dou(pasta_ridab):
    con = _con_com_contratos(pasta_ridab, [(1, "11111111000111", 2020, 100.0, 80.0)])
    cols, linhas = ridab.enriquecer(con)
    r = dict(zip(cols, linhas[0]))
    assert r["valor_contratado_real_2024"] == pytest.approx(125.0)
    assert r["valor_liberado_real_2024"] == pytest.approx(100.0)
    assert r["valor_contratado"] == 100.0  # o nativo nominal é preservado


def test_orfaos_permanecem_com_campos_nulos(pasta_ridab):
    """4ª porosidade: contrato sem agente ou sem ano no deflator NÃO é filtrado."""
    con = _con_com_contratos(pasta_ridab, [
        (1, "99999999000199", 2019, 10.0, 10.0),   # CNPJ fora do cadastro
        (2, "22222222000122", 1999, 10.0, 10.0),   # ano fora do deflator
    ])
    cols, linhas = ridab.enriquecer(con)
    assert len(linhas) == 2
    r1, r2 = (dict(zip(cols, l)) for l in linhas)
    assert r1["codigo_municipio_ibge"] is None and r1["valor_contratado_real_2024"] == pytest.approx(15.0)
    assert r2["codigo_municipio_ibge"] == "3106200" and r2["valor_contratado_real_2024"] is None


def test_cnpj_nulo_ou_vazio_nao_casa_com_nada(pasta_ridab):
    con = _con_com_contratos(pasta_ridab, [(1, None, 2019, 1.0, 1.0), (2, "", 2019, 1.0, 1.0)])
    cols, linhas = ridab.enriquecer(con)
    assert all(dict(zip(cols, l))["codigo_municipio_ibge"] is None for l in linhas)


def test_ler_recusa_tabela_fora_da_whitelist(pasta_ridab):
    with pytest.raises(ValueError):
        ridab.ler("../../etc/passwd", base=pasta_ridab)
    assert ridab.ler("deflator_ipca", base=pasta_ridab)["linhas"][0]["ano"] == 2019


def test_proveniencia_declara_autoria_licenca_e_revisao():
    prov = ridab.proveniencia_base(com_sha=False)
    assert prov["licenca"].startswith("CC-BY-4.0")
    assert prov["instancia_versao"].endswith(ridab.revisao())
    assert len(prov["fixity"]) == 64


@pytest.mark.skipif(not fsa.disponivel(), reason="data/fsa.db ausente")
def test_enriquecer_contratos_nao_perde_nem_multiplica_linhas(pasta_ridab, monkeypatch):
    res = ridab.enriquecer_contratos(limite=5, base=pasta_ridab)
    n_fsa = fsa.inventario()["itens"]
    n_contratos = next(i["registros"] for i in n_fsa if i["nome"] == "fato_contrato_serie")
    assert res["total"] == n_contratos
    assert len(res["linhas"]) == 5
    assert "codigo_municipio_ibge" in res["ressalvas"]
    assert "valor_contratado" in res["ressalvas"]  # asterisco herdado da FSA
