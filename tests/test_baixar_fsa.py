"""Testes do baixador da FSA. Sem rede: usa file:// e arquivos sintéticos."""
import hashlib

import pytest

import baixar_fsa


def _fonte(tmp_path, conteudo=b"base-sintetica"):
    origem = tmp_path / "origem.db"
    origem.write_bytes(conteudo)
    return origem.as_uri(), hashlib.sha256(conteudo).hexdigest()


def test_baixa_e_instala_quando_o_hash_bate(tmp_path):
    url, esperado = _fonte(tmp_path)
    destino = tmp_path / "data" / "fsa.db"
    assert baixar_fsa.baixar(url, destino, esperado) == destino
    assert destino.read_bytes() == b"base-sintetica"


def test_hash_divergente_recusa_e_nao_deixa_residuo(tmp_path):
    url, _ = _fonte(tmp_path)
    destino = tmp_path / "data" / "fsa.db"
    with pytest.raises(ValueError, match="sha256 divergente"):
        baixar_fsa.baixar(url, destino, "0" * 64)
    assert not destino.exists()
    assert not list(destino.parent.glob("*.part"))


def test_idempotente_nao_rebaixa_arquivo_ja_conferido(tmp_path):
    url, esperado = _fonte(tmp_path)
    destino = tmp_path / "fsa.db"
    destino.write_bytes(b"base-sintetica")
    # URL inexistente: se tentasse baixar, falharia
    assert baixar_fsa.baixar((tmp_path / "nao_existe").as_uri(), destino, esperado) == destino


def test_pin_versionado_tem_formato_valido():
    h = baixar_fsa.hash_esperado()
    assert len(h) == 64 and int(h, 16) >= 0
