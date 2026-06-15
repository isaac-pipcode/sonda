"""SONDA — agregador de segunda ordem de bases sobre o audiovisual.

Carbono ancora. Sinal interfere. Sonar lê.

Este pacote implementa o backend MVP descrito no README do projeto:
ingestão com proveniência → PostgreSQL (JSONB, camada raw) → snapshots
append-only → DuckDB como motor de cruzamento sob demanda → FastAPI com
proveniência em toda resposta.

As sete decisões invioláveis são tratadas como tese, não como detalhe de
implementação. Veja docs/README_Sonda.md.
"""

__version__ = "0.1.0"
