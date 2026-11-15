"""Circulação por obra: municípios, UFs, capitais e complexos no ano de pico. Sem rede."""
from sonda import circulacao, obras


def test_agrega_municipios_capitais_e_pico():
    mun = [
        ("B1", 2019, "SP", "São Paulo", 600.0), ("B1", 2019, "SP", "CAMPINAS", 300.0),
        ("B1", 2019, "RO", "PORTO VELHO", 50.0), ("B1", 2019, "RO", "Ji-Paraná", 50.0),
        ("B1", 2020, "SP", "CAMPINAS", 0.0),                           # ano sem público não conta
        ("B2", 2018, "RO", "VILHENA", 10.0),
    ]
    exi = [("B1", 2019, 30, 900.0), ("B1", 2019, 5, 100.0), ("B1", 2020, 2, 0.0)]
    r = circulacao.agregar(mun, exi)
    assert r["B1"]["municipios"] == 4 and r["B1"]["ufs"] == 2 and r["B1"]["anos_em_cartaz"] == 1
    assert r["B1"]["publico_fora_capitais_pct"] == 35.0                # (300+50)/1000
    assert r["B1"]["complexos_pico"] == 35                             # 2019 é o ano de maior público
    assert r["B2"]["publico_fora_capitais_pct"] == 100.0 and r["B2"]["complexos_pico"] is None


def test_obras_so_recebem_circulacao_se_tem_bilheteria():
    import sqlite3
    sq = sqlite3.connect(":memory:")
    sq.execute("CREATE TABLE fato_bilheteria (cpb, titulo, ano_lancamento, tipo_obra, publico, renda, distribuidora)")
    sq.execute("INSERT INTO fato_bilheteria VALUES ('B1','A',2019,'FICÇÃO',1000,1e4,'D')")
    sq.execute("CREATE TABLE fato_contrato_serie (cpb, cpb_score, titulo_projeto, ano_contrato, valor_contratado, "
               "valor_liberado, chamada_publica, uf_proponente, razao_proponente)")
    sq.execute("INSERT INTO fato_contrato_serie VALUES ('B3',1.0,'C',2020,1e6,1e6,'PRODAV 01','SP','P')")
    sq.execute("CREATE TABLE fato_fomento_indireto (cpb, numero_salic)")
    circ = {"B1": {"municipios": 4}, "B3": {"municipios": 9}}
    o = {x["cpb"]: x for x in obras.calcular(fsa_con=sq, captado={}, circulacao=circ)["obras"]}
    assert o["B1"]["municipios"] == 4 and o["B3"]["municipios"] is None


def test_publico_divergente_e_sinalizado_e_nao_corrigido():
    import sqlite3
    sq = sqlite3.connect(":memory:")
    sq.execute("CREATE TABLE fato_bilheteria (cpb, titulo, ano_lancamento, tipo_obra, publico, renda, distribuidora)")
    sq.executemany("INSERT INTO fato_bilheteria VALUES (?,?,?,?,?,?,?)", [
        ("B1", "RECENTE", 2024, "FICÇÃO", 738, 8e3, "D"), ("B2", "OK", 2019, "FICÇÃO", 50_000, 5e5, "D"),
        ("B3", "PEQUENO", 2019, "DOC", 100, 1e3, "D")])
    sq.execute("CREATE TABLE fato_contrato_serie (cpb, cpb_score, titulo_projeto, ano_contrato, valor_contratado, "
               "valor_liberado, chamada_publica, uf_proponente, razao_proponente)")
    sq.execute("CREATE TABLE fato_fomento_indireto (cpb, numero_salic)")
    circ = {"B1": {"publico_diario": 5_729_617}, "B2": {"publico_diario": 49_000}, "B3": {"publico_diario": 900}}
    r = obras.calcular(fsa_con=sq, captado={}, circulacao=circ)
    o = {x["cpb"]: x for x in r["obras"]}
    assert o["B1"]["publico_verificar"] and o["B1"]["publico"] == 738        # sinalizado, não corrigido
    assert not o["B2"]["publico_verificar"]
    assert not o["B3"]["publico_verificar"]                                   # abaixo do limiar de 10 mil
    assert r["totais"]["publico_a_verificar"] == 1
