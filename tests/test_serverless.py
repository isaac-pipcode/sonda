"""Execução serverless (Vercel): defaults em /tmp, URL do banco da integração Neon e
download preguiçoso da FSA. Sem rede: file:// e arquivos sintéticos."""
import dataclasses
import hashlib
import logging

from sonda import fsa
from sonda.config import Config


def test_vercel_usa_tmp_e_aceita_a_url_da_integracao_neon(monkeypatch):
    for v in ("SONDA_DATABASE_URL", "SONDA_FSA_DB", "SONDA_DUCKDB_DIR", "POSTGRES_URL"):
        monkeypatch.delenv(v, raising=False)
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("DATABASE_URL", "postgresql://neon/db")
    c = Config.from_env()
    assert c.database_url == "postgresql://neon/db"
    assert c.fsa_db_path.startswith("/tmp/") and c.duckdb_dir.startswith("/tmp/")


def test_sonda_database_url_tem_precedencia(monkeypatch):
    monkeypatch.setenv("SONDA_DATABASE_URL", "postgresql://sonda/a")
    monkeypatch.setenv("DATABASE_URL", "postgresql://neon/b")
    assert Config.from_env().database_url == "postgresql://sonda/a"


def _config(monkeypatch, tmp_path, url, conteudo=b"fsa-sintetica"):
    destino = tmp_path / "tmp" / "fsa.db"
    monkeypatch.setattr(fsa, "CONFIG", dataclasses.replace(fsa.CONFIG, fsa_db_path=str(destino), fsa_url=url))
    monkeypatch.setattr("sonda.baixa.hash_esperado", lambda pin=None: hashlib.sha256(conteudo).hexdigest())
    return destino


def test_base_ausente_e_baixada_no_primeiro_uso(monkeypatch, tmp_path):
    origem = tmp_path / "origem.db"
    origem.write_bytes(b"fsa-sintetica")
    destino = _config(monkeypatch, tmp_path, origem.as_uri())
    assert fsa.disponivel() and destino.read_bytes() == b"fsa-sintetica"


def test_sem_url_a_base_fica_indisponivel(monkeypatch, tmp_path):
    destino = _config(monkeypatch, tmp_path, "")
    assert not fsa.disponivel() and not destino.exists()


def test_download_falho_nao_derruba_e_registra_aviso(monkeypatch, tmp_path, caplog):
    destino = _config(monkeypatch, tmp_path, (tmp_path / "nao_existe").as_uri())
    with caplog.at_level(logging.WARNING, logger="uvicorn.error"):
        assert not fsa.disponivel()
    assert not destino.exists() and any("falha ao baixar" in r.getMessage() for r in caplog.records)


def test_motivo_explica_a_indisponibilidade(monkeypatch, tmp_path):
    _config(monkeypatch, tmp_path, "")
    fsa.disponivel()
    assert "SONDA_FSA_URL não está definida" in fsa.motivo_indisponivel()
    _config(monkeypatch, tmp_path, (tmp_path / "nao_existe").as_uri())
    fsa.disponivel()
    assert "falha ao baixar" in fsa.motivo_indisponivel()
