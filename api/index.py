"""Ponto de entrada da API como função Python na Vercel.

O `vercel.json` reescreve `/api/*` para esta função; o FastAPI recebe o caminho
original e roteia normalmente. Fora da Vercel, use `uvicorn sonda.api:app`.
"""
from sonda.api import app  # noqa: F401
