"""Testes da base FSA (leitura in-place). Sem Postgres, sem rede.

Usam o fallback sqlite3 quando o sqlite_scanner do DuckDB não está disponível.
"""
import pytest

from sonda import fsa

pytestmark = pytest.mark.skipif(not fsa.disponivel(), reason="data/fsa.db ausente")


def test_inventario_lista_tabelas_e_visoes():
    inv = fsa.inventario()["itens"]
    nomes = {i["nome"] for i in inv}
    # núcleos esperados da base
    assert "fato_contrato_serie" in nomes
    assert "vw_serie_fomento_mercado" in nomes
    # a visão pareada tem 767 obras na base de 2026-11-12 (749 na anterior)
    vw = next(i for i in inv if i["nome"] == "vw_serie_fomento_mercado")
    assert vw["registros"] == 767


def test_bilheteria_usa_a_distribuidora_principal():
    """Regressão: a base anterior guardava a linha menor (738 espectadores de uma sala)."""
    con = fsa._conn_sqlite()
    try:
        pub, dist, n = con.execute("SELECT publico, distribuidora, n_distribuidoras FROM fato_bilheteria "
                                   "WHERE cpb = 'B2400324700000'").fetchone()
        linhas = con.execute("SELECT COUNT(*) FROM fato_bilheteria_distribuidora WHERE cpb = 'B2400324700000'").fetchone()[0]
    finally:
        con.close()
    assert pub == 5856874 and dist.startswith("COLUMBIA") and n == 2 and linhas == 2


def test_dicionario_traz_ressalvas():
    dic = fsa.dicionario()
    assert any(t["tabela"] == "fato_contrato_serie" for t in dic["tabelas"])
    # valor_contratado carrega a ressalva do IPCA (asterisco)
    vc = next(c for c in dic["colunas"]
              if c["tabela"] == "fato_contrato_serie" and c["coluna"] == "valor_contratado")
    assert "IPCA" in (vc["ressalva"] or "")


def test_consulta_anexa_asteriscos_das_colunas():
    res = fsa.consultar("fato_contrato_serie", limite=5)
    assert len(res["linhas"]) == 5
    # a consulta devolve as ressalvas das colunas retornadas
    assert "valor_contratado" in res["ressalvas"]
    assert "IPCA" in res["ressalvas"]["valor_contratado"]["ressalva"]


def test_consulta_recusa_nome_fora_da_whitelist():
    with pytest.raises(ValueError):
        fsa.consultar("sqlite_master; DROP TABLE x")
