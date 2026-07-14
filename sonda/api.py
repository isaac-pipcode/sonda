"""FastAPI — catálogo, raw, cruzamentos. Proveniência em TODA resposta.

Decisão 2 / porosidade 2: nenhuma resposta sai sem `proveniencia` (garantido
pelo helper `envelope`). Decisão 5: persistimos a receita; a execução é sob
demanda. Decisão 6: cada execução é um evento datado append-only — a série
temporal só cresce.
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from . import engine, fsa
from .db import connect, init_schema
from .provenance import agora_utc, envelope, fixity

app = FastAPI(
    title="SONDA — API",
    description="Agregador de segunda ordem das bases sobre o audiovisual. "
    "Carbono ancora. Sinal interfere. Sonar lê.",
    version="0.1.0",
)
# CORS liberado para o SondaApp.jsx em desenvolvimento.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    # idempotente; garante o esquema no primeiro boot.
    try:
        init_schema()
    except Exception as e:  # pragma: no cover - boot sem banco não derruba import
        app.state.db_error = str(e)


# ── modelos de entrada ──────────────────────────────────────────────────────
class LadoReceita(BaseModel):
    snapshot_id: str
    campo_chave: str = Field(..., description="caminho pontilhado no JSON nativo, ex.: location.municipio")
    id_chave: str = "id"


class BaseFaltante(BaseModel):
    pergunta: str = Field(..., description="o CORAÇÃO do contrato: a pergunta de pesquisa")
    hipoteses_de_ligacao: list[str] = []
    regime_retencao: str = "a definir pela prática"
    forma_esperada: Optional[str] = None


class ReceitaIn(BaseModel):
    nome: str
    autor: str
    eixo: str = Field(..., description="agente | territorio | tempo | funcao")
    esquerda: LadoReceita
    direita: Optional[LadoReceita] = None  # None ⇒ base faltante (Sonda generativa)
    regra: str = "igualdade_normalizada"
    limiar: Optional[float] = None
    versoes_fonte: list[str] = []
    base_faltante: Optional[BaseFaltante] = None
    versao_regra: str = "v1"


# ── raiz ────────────────────────────────────────────────────────────────────
@app.get("/")
def raiz():
    return envelope(
        {
            "servico": "SONDA",
            "lema": "Carbono ancora. Sinal interfere. Sonar lê.",
            "recursos": ["/api/catalogo", "/api/raw/{base}", "/api/snapshots",
                         "/api/cruzamentos", "/api/fsa/tabelas",
                         "/api/fsa/dicionario", "/api/fsa/consulta/{nome}"],
        },
        proveniencia={"fonte": "sonda", "nota": "infraestrutura, não fonte primária"},
    )


@app.get("/health")
def health():
    """Healthcheck para a plataforma (Fly/Render). Verifica o banco."""
    try:
        with connect() as conn:
            conn.execute("SELECT 1")
        return {"status": "ok", "banco": "ok", "servido_em": agora_utc()}
    except Exception as e:
        raise HTTPException(503, f"banco indisponível: {type(e).__name__}")


# ── catálogo: as bases lado a lado, na língua própria (porosidade ontológica) ─
@app.get("/api/catalogo")
def catalogo():
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT base, entidade, COUNT(*) AS n,
                   MAX(criado_em) AS ultimo_registro
            FROM raw_record
            GROUP BY base, entidade
            ORDER BY base, entidade
            """
        ).fetchall()
        snaps = conn.execute(
            """
            SELECT snapshot_id, fonte, instancia_versao, entidade, capturado_em,
                   fixity, politica_retencao
            FROM snapshot ORDER BY capturado_em DESC
            """
        ).fetchall()

    # proveniência POR base (lado a lado, não fundida — incomensurabilidade).
    prov_por_base: dict[str, list] = {}
    for s in snaps:
        prov_por_base.setdefault(s["fonte"], []).append(
            {
                "snapshot_id": str(s["snapshot_id"]),
                "instancia_versao": s["instancia_versao"],
                "entidade": s["entidade"],
                "capturado_em": str(s["capturado_em"]),
                "fixity": s["fixity"],
                "politica_retencao": s["politica_retencao"],
            }
        )

    catalogo_dados = [
        {
            "base": r["base"],
            "entidade_nativa": r["entidade"],  # termo da base, NÃO reconciliado
            "n_registros": r["n"],
            "ultimo_registro": str(r["ultimo_registro"]),
        }
        for r in rows
    ]

    # FSA entra como base de primeira classe, na língua própria (não fundida).
    if fsa.disponivel():
        inv = fsa.inventario()["itens"]
        prov_fsa = fsa.proveniencia_base()  # calcula fixity uma vez
        catalogo_dados.append({
            "base": fsa.BASE,
            "entidade_nativa": "base_relacional_fsa (fatos · dimensões · visões)",
            "n_registros": sum(i["registros"] or 0 for i in inv),
            "tabelas_e_visoes": len(inv),
            "acesso": "/api/fsa/tabelas · /api/fsa/dicionario · /api/fsa/consulta/{nome}",
        })
        prov_por_base.setdefault(prov_fsa["fonte"], []).append(
            {"instancia_versao": prov_fsa["instancia_versao"],
             "entidade": "base_relacional_fsa", "fixity": prov_fsa["fixity"]}
        )
    return envelope(
        catalogo_dados,
        proveniencia=[{"fonte": k, "snapshots": v} for k, v in prov_por_base.items()],
        avisos=([] if catalogo_dados else ["catálogo vazio — rode a ingestão (seed.py / coleta_real_mapas.py)"]),
    )


# ── raw: o dado nativo, com proveniência (porosidade 2) ──────────────────────
@app.get("/api/raw/{base}")
def raw(base: str, entidade: Optional[str] = None, limite: int = 50, pagina: int = 1):
    limite = max(1, min(limite, 500))
    offset = (max(1, pagina) - 1) * limite
    with connect() as conn:
        sql = "SELECT id, entidade, nativo, proveniencia FROM raw_record WHERE base = %s"
        params: list = [base]
        if entidade:
            sql += " AND entidade = %s"
            params.append(entidade)
        sql += " ORDER BY criado_em LIMIT %s OFFSET %s"
        params += [limite, offset]
        rows = conn.execute(sql, params).fetchall()

    if not rows:
        raise HTTPException(404, f"nenhum raw_record para base '{base}'")
    dados = [{"id": str(r["id"]), "entidade": r["entidade"], "nativo": r["nativo"]} for r in rows]
    # proveniência: a do lote (toma a do primeiro; todos compartilham a coleta).
    return envelope(
        dados,
        proveniencia=rows[0]["proveniencia"],
        avisos=[f"página {pagina} · {len(dados)} registros · dado NATIVO, não reconciliado"],
    )


@app.get("/api/snapshots")
def snapshots():
    with connect() as conn:
        rows = conn.execute(
            """SELECT snapshot_id, fonte, instancia_versao, entidade, capturado_em,
                      fixity, politica_retencao,
                      CASE WHEN jsonb_typeof(carga) = 'array'
                           THEN jsonb_array_length(carga) END AS n
               FROM snapshot ORDER BY capturado_em DESC"""
        ).fetchall()
    dados = [
        {
            "snapshot_id": str(r["snapshot_id"]),
            "fonte": r["fonte"],
            "instancia_versao": r["instancia_versao"],
            "entidade": r["entidade"],
            "capturado_em": str(r["capturado_em"]),
            "fixity": r["fixity"],
            "n_registros": r["n"],
            "politica_retencao": r["politica_retencao"],
        }
        for r in rows
    ]
    return envelope(dados, proveniencia={"fonte": "sonda", "nota": "instantâneos imutáveis (append-only)"})


# ── base FSA: dataset de segunda ordem lido in-place (na língua própria) ──────
def _exige_fsa():
    if not fsa.disponivel():
        raise HTTPException(404, "base FSA indisponível (defina SONDA_FSA_DB ou inclua data/fsa.db)")


@app.get("/api/fsa/tabelas")
def fsa_tabelas():
    """Inventário das tabelas/visões da FSA — na ontologia própria da base."""
    _exige_fsa()
    inv = fsa.inventario()["itens"]
    return envelope(inv, proveniencia=fsa.proveniencia_base())


@app.get("/api/fsa/dicionario")
def fsa_dicionario():
    """Dicionário de dados: descrição, fonte, cobertura e RESSALVAS por coluna.

    É a camada de 'asteriscos' — as ressalvas viajam junto com o dado.
    """
    _exige_fsa()
    return envelope(fsa.dicionario(), proveniencia=fsa.proveniencia_base())


@app.get("/api/fsa/consulta/{nome}")
def fsa_consulta(nome: str, limite: int = 50, pagina: int = 1):
    """Consulta uma tabela/visão estável da FSA. Cada resposta anexa as
    ressalvas das colunas retornadas: impossível citar um número sem seu asterisco.
    """
    _exige_fsa()
    try:
        res = fsa.consultar(nome, limite=limite, pagina=pagina)
    except ValueError as e:
        raise HTTPException(404, str(e))
    prov = dict(fsa.proveniencia_base())
    prov["motor_leitura"] = res["motor_leitura"]
    prov["ressalvas"] = res["ressalvas"]  # asteriscos das colunas desta consulta
    return envelope(
        {"nome": nome, "colunas": res["colunas"], "linhas": res["linhas"]},
        proveniencia=prov,
        avisos=[f"página {pagina} · {len(res['linhas'])} linhas · dado NATIVO da FSA, não reconciliado"],
    )


@app.post("/api/fsa/registrar")
def fsa_registrar():
    """Registra a FSA como snapshot imutável da Sonda (idempotente por fixity)."""
    _exige_fsa()
    return envelope(fsa.registrar_snapshot(), proveniencia=fsa.proveniencia_base())


# ── cruzamentos: a receita persistente (decisão 5) ───────────────────────────
@app.post("/api/cruzamentos")
def criar_cruzamento(r: ReceitaIn):
    receita = r.model_dump(exclude={"nome", "autor", "versao_regra"})
    with connect() as conn:
        row = conn.execute(
            """INSERT INTO cruzamento (nome, autor, versao_regra, receita)
               VALUES (%s, %s, %s, %s) RETURNING id""",
            (r.nome, r.autor, r.versao_regra, Jsonb(receita)),
        ).fetchone()
    return envelope(
        {"id": str(row["id"]), "nome": r.nome, "receita": receita},
        proveniencia={"fonte": "sonda", "nota": "persiste-se a RECEITA, não o resultado (decisão 5)"},
    )


@app.get("/api/cruzamentos")
def listar_cruzamentos():
    with connect() as conn:
        rows = conn.execute(
            """SELECT c.id, c.nome, c.autor, c.versao_regra, c.derivado_de,
                      COUNT(e.id) AS execucoes
               FROM cruzamento c LEFT JOIN execucao e ON e.cruzamento_id = c.id
               GROUP BY c.id ORDER BY c.criado_em"""
        ).fetchall()
    dados = [
        {
            "id": str(r["id"]),
            "nome": r["nome"],
            "autor": r["autor"],
            "versao_regra": r["versao_regra"],
            "derivado_de": str(r["derivado_de"]) if r["derivado_de"] else None,
            "execucoes": r["execucoes"],
        }
        for r in rows
    ]
    return envelope(dados, proveniencia={"fonte": "sonda"})


@app.get("/api/cruzamentos/{cid}")
def obter_cruzamento(cid: str):
    with connect() as conn:
        c = conn.execute("SELECT * FROM cruzamento WHERE id = %s", (cid,)).fetchone()
        if not c:
            raise HTTPException(404, "cruzamento não encontrado")
        serie = conn.execute(
            """SELECT data, ligados, orfaos, tipo, mudanca FROM execucao
               WHERE cruzamento_id = %s ORDER BY data""",
            (cid,),
        ).fetchall()
    return envelope(
        {
            "id": str(c["id"]),
            "nome": c["nome"],
            "autor": c["autor"],
            "versao_regra": c["versao_regra"],
            "receita": c["receita"],
            "derivado_de": str(c["derivado_de"]) if c["derivado_de"] else None,
            # série temporal (decisão 6): cada ponto é um evento datado.
            "serie": [
                {"data": str(s["data"]), "ligados": s["ligados"], "orfaos": s["orfaos"],
                 "tipo": s["tipo"], "mudanca": s["mudanca"]}
                for s in serie
            ],
        },
        proveniencia={"fonte": "sonda", "nota": "receita + série temporal de execuções"},
    )


def _carga_do_snapshot(conn, snapshot_id: str) -> list[dict]:
    row = conn.execute("SELECT carga FROM snapshot WHERE snapshot_id = %s", (snapshot_id,)).fetchone()
    if not row:
        raise HTTPException(404, f"snapshot {snapshot_id} não encontrado")
    return row["carga"]


@app.post("/api/cruzamentos/{cid}/executar")
def executar_cruzamento(cid: str):
    """Executa a receita sob demanda (DuckDB) e grava um EVENTO datado."""
    with connect() as conn:
        c = conn.execute("SELECT * FROM cruzamento WHERE id = %s", (cid,)).fetchone()
        if not c:
            raise HTTPException(404, "cruzamento não encontrado")
        receita = c["receita"]

        esquerda = _carga_do_snapshot(conn, receita["esquerda"]["snapshot_id"])
        direita = None
        if receita.get("direita"):
            direita = _carga_do_snapshot(conn, receita["direita"]["snapshot_id"])

        resultado = engine.executar(receita, esquerda, direita)

        # delta vs. execução anterior (a variação mede o mundo — ou a migração).
        anterior = conn.execute(
            "SELECT ligados, orfaos FROM execucao WHERE cruzamento_id = %s ORDER BY data DESC LIMIT 1",
            (cid,),
        ).fetchone()
        orfaos_total = resultado["orfaos_esquerda"] + resultado["orfaos_direita"]
        mudanca = None
        if anterior:
            mudanca = {
                "d_ligados": resultado["ligados"] - anterior["ligados"],
                "d_orfaos": orfaos_total - anterior["orfaos"],
            }

        prov_exec = {
            "fonte": "sonda",
            "regra_aplicada": receita.get("regra"),
            "eixo": receita.get("eixo"),
            "versoes_fonte": receita.get("versoes_fonte", []),
            "saneamento": resultado.get("saneamento", []),
            "snapshots": {
                "esquerda": receita["esquerda"]["snapshot_id"],
                "direita": receita.get("direita", {}).get("snapshot_id") if receita.get("direita") else None,
            },
            "executado_em": agora_utc(),
        }
        achados = {
            "contrato": resultado.get("contrato"),
            "amostra_ligados": resultado.get("amostra_ligados", []),
            "amostra_orfaos_esquerda": resultado.get("amostra_orfaos_esquerda", []),
            "amostra_orfaos_direita": resultado.get("amostra_orfaos_direita", []),
        }
        prov_exec["fixity_achados"] = fixity(achados)

        # evento append-only (decisão 6).
        ev = conn.execute(
            """INSERT INTO execucao (cruzamento_id, ligados, orfaos, mudanca, tipo, achados, proveniencia)
               VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id, data""",
            (cid, resultado["ligados"], orfaos_total, Jsonb(mudanca) if mudanca else None,
             "base", Jsonb(achados), Jsonb(prov_exec)),
        ).fetchone()

    return envelope(
        {
            "execucao_id": str(ev["id"]),
            "data": str(ev["data"]),
            "executavel": resultado["executavel"],
            "ligados": resultado["ligados"],
            "orfaos_esquerda": resultado["orfaos_esquerda"],
            "orfaos_direita": resultado["orfaos_direita"],
            "mudanca": mudanca,
            "achados": achados,  # órfãos e elo ausente como ACHADO, nunca escondidos
        },
        proveniencia=prov_exec,
    )


@app.post("/api/cruzamentos/{cid}/fork")
def bifurcar(cid: str, r: ReceitaIn):
    """Bifurca um cruzamento (discordar da regra). Mantém a linhagem."""
    receita = r.model_dump(exclude={"nome", "autor", "versao_regra"})
    with connect() as conn:
        pai = conn.execute("SELECT id FROM cruzamento WHERE id = %s", (cid,)).fetchone()
        if not pai:
            raise HTTPException(404, "cruzamento pai não encontrado")
        row = conn.execute(
            """INSERT INTO cruzamento (nome, autor, versao_regra, receita, derivado_de)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (r.nome, r.autor, r.versao_regra, Jsonb(receita), cid),
        ).fetchone()
    return envelope(
        {"id": str(row["id"]), "derivado_de": cid, "nome": r.nome, "receita": receita},
        proveniencia={"fonte": "sonda", "nota": "fork: linhagem preservada (decisão 5)"},
    )
