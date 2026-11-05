"""CORS por ambiente: sem variáveis, aberto (desenvolvimento); com elas, só as origens declaradas."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from sonda.api import opcoes_cors
from sonda.config import Config


def _cliente(origens=(), regex=""):
    app = FastAPI()
    app.add_middleware(CORSMiddleware, **opcoes_cors(origens, regex))

    @app.get("/x")
    def x():
        return {}

    return TestClient(app)


def _acao(cli, origem):
    return cli.get("/x", headers={"Origin": origem}).headers.get("access-control-allow-origin")


def test_sem_variaveis_libera_qualquer_origem():
    assert _acao(_cliente(), "https://qualquer.site") == "*"


def test_origens_declaradas_passam_e_as_demais_nao():
    cli = _cliente(("https://sonda.vercel.app",))
    assert _acao(cli, "https://sonda.vercel.app") == "https://sonda.vercel.app"
    assert _acao(cli, "https://outro.site") is None


def test_regex_cobre_previews_sem_abrir_o_resto():
    cli = _cliente((), r"^https://sonda-[a-z0-9-]+-pipcode-dev\.vercel\.app$")
    assert _acao(cli, "https://sonda-git-ramo-pipcode-dev.vercel.app")
    assert _acao(cli, "https://sonda-git-ramo-pipcode-dev.vercel.app.evil.com") is None


def test_preflight_so_aceita_metodos_e_cabecalhos_da_api():
    cli = _cliente(("https://sonda.vercel.app",))
    ok = cli.options("/x", headers={"Origin": "https://sonda.vercel.app",
                                    "Access-Control-Request-Method": "POST",
                                    "Access-Control-Request-Headers": "content-type"})
    assert ok.status_code == 200
    nao = cli.options("/x", headers={"Origin": "https://sonda.vercel.app",
                                     "Access-Control-Request-Method": "DELETE"})
    assert nao.status_code == 400


def test_config_le_e_normaliza_as_variaveis(monkeypatch):
    monkeypatch.setenv("SONDA_CORS_ORIGINS", " https://a.app/ , https://b.app ,")
    monkeypatch.setenv("SONDA_CORS_ORIGIN_REGEX", "^https://x$")
    c = Config.from_env()
    assert c.cors_origens == ("https://a.app", "https://b.app")
    assert c.cors_origem_regex == "^https://x$"


def test_aviso_so_quando_o_cors_esta_aberto():
    from sonda.api import aviso_cors
    assert "qualquer origem" in aviso_cors((), "")
    assert aviso_cors(("https://a.app",), "") is None
    assert aviso_cors((), "^https://x$") is None


import dataclasses
import logging

import pytest


@pytest.mark.parametrize("origens,deve_avisar", [((), True), (("https://a.app",), False)])
def test_boot_registra_o_aviso_so_com_cors_aberto(caplog, monkeypatch, origens, deve_avisar):
    from sonda import api
    monkeypatch.setattr(api, "init_schema", lambda: None)
    monkeypatch.setattr(api, "CONFIG", dataclasses.replace(api.CONFIG, cors_origens=origens, cors_origem_regex=""))
    with caplog.at_level(logging.WARNING, logger="uvicorn.error"):
        api._startup()
    assert any("CORS aberto" in r.message for r in caplog.records) is deve_avisar
