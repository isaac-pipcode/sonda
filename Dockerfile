# Backend SONDA — "1 contêiner" (README §4). FastAPI + DuckDB embarcado.
# O Postgres é gerenciado/externo (Neon, Supabase…), passado por SONDA_DATABASE_URL.
FROM python:3.12-slim

WORKDIR /app

# deps primeiro (cache de camada)
COPY requirements-backend.txt .
RUN pip install --no-cache-dir -r requirements-backend.txt

# código do backend + esquema + fixtures/seed
COPY sonda/ ./sonda/
COPY schema.sql seed.py ./
COPY fixtures/ ./fixtures/

ENV PYTHONUNBUFFERED=1
# plataformas (Fly/Render/Railway) injetam PORT; default 8000.
ENV PORT=8000
EXPOSE 8000

# o startup da API aplica o esquema (idempotente). Suba com 2 workers leves.
CMD ["sh", "-c", "uvicorn sonda.api:app --host 0.0.0.0 --port ${PORT} --workers 2"]
