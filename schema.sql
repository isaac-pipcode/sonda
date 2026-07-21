-- SONDA — esquema mínimo (PostgreSQL).
--
-- Este NÃO é um esquema normalizado das entidades do audiovisual. É o
-- *envelope* em torno do dado nativo (decisão 4: schema-on-read). O payload
-- original vive intacto em colunas JSONB; a estrutura é projetada na consulta,
-- nunca imposta na ingestão.
--
-- Decisão 6 e 7: snapshot e execucao são append-only. Reforçamos isso com
-- gatilhos que recusam UPDATE/DELETE — o histórico só cresce.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ───────────────────────────────────────────────────────────────────────────
-- raw_record: o dado nativo, preservado. `nativo` é o payload original intacto.
-- `proveniencia` acompanha cada registro (decisão 2: transparência radical).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS raw_record (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base          TEXT NOT NULL,            -- ex.: 'mapa_cultural', 'oca', 'lpg'
    entidade      TEXT NOT NULL,            -- termo NATIVO da base (não reconciliado)
    nativo        JSONB NOT NULL,           -- payload original, intacto
    proveniencia  JSONB NOT NULL,           -- ver §5 do README (fonte, query, fixity...)
    snapshot_id   UUID,                     -- snapshot que originou este registro
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_raw_base_entidade ON raw_record (base, entidade);
CREATE INDEX IF NOT EXISTS idx_raw_nativo_gin    ON raw_record USING GIN (nativo);

-- ───────────────────────────────────────────────────────────────────────────
-- snapshot: instantâneo imutável de uma fonte (decisão 7). NUNCA UPDATE/DELETE.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS snapshot (
    snapshot_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fonte              TEXT NOT NULL,
    instancia_versao   TEXT,
    entidade           TEXT NOT NULL,
    capturado_em       TIMESTAMPTZ NOT NULL,
    carga              JSONB NOT NULL,        -- lote nativo completo (lista de registros)
    fixity             TEXT NOT NULL,         -- sha256 da carga
    politica_retencao  JSONB NOT NULL,
    criado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snapshot_fonte ON snapshot (fonte, entidade, capturado_em);

-- ───────────────────────────────────────────────────────────────────────────
-- cruzamento: a RECEITA (decisão 5). Persiste-se a receita, não o resultado.
-- Autoral, versionado, bifurcável (derivado_de aponta o pai do fork).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cruzamento (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome         TEXT NOT NULL,
    autor        TEXT NOT NULL,
    versao_regra TEXT NOT NULL DEFAULT 'v1',
    receita      JSONB NOT NULL,    -- {eixo, esquerda, direita, regra, limiar, versoes_fonte}
    derivado_de  UUID REFERENCES cruzamento (id),  -- fork
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- execucao: série temporal (decisão 6). Cada execução é evento datado imutável.
-- Guarda MÉTRICAS e ACHADOS (amostra de órfãos), NÃO a tabela de resultado
-- materializada (antipadrão: pré-computar cruzamentos). NUNCA UPDATE/DELETE.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS execucao (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cruzamento_id  UUID NOT NULL REFERENCES cruzamento (id),
    data           TIMESTAMPTZ NOT NULL DEFAULT now(),
    ligados        INTEGER NOT NULL,
    orfaos         INTEGER NOT NULL,
    mudanca        JSONB,             -- delta vs. execução anterior
    tipo           TEXT NOT NULL DEFAULT 'base',  -- 'base' | 'migracao'
    achados        JSONB NOT NULL,    -- amostra de órfãos/elos ausentes (não a verdade materializada)
    proveniencia   JSONB NOT NULL     -- versões-fonte usadas, fixities, regra aplicada
);
CREATE INDEX IF NOT EXISTS idx_execucao_cruz ON execucao (cruzamento_id, data);

-- ───────────────────────────────────────────────────────────────────────────
-- percurso: a REDE DE CAMINHOS (Documento 02). O objeto não é a junção A×B, é o
-- traversal multi-salto: cadeia de nós (entidades) e arestas (articulações),
-- possivelmente entre bases distintas. Como o cruzamento, persiste-se a RECEITA
-- (a definição), não o resultado (decisão 5).
--   definicao (JSONB): { nos:[{id,rotulo,tipo,fonte?,derivacao?,base_faltante?}],
--                        arestas:[{de,para,tipo?,eixo?,regra?}] }
--   tipo do nó/aresta: 'factual' | 'derivado' | 'ausente'
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS percurso (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome         TEXT NOT NULL,
    autor        TEXT NOT NULL,
    versao_regra TEXT NOT NULL DEFAULT 'v1',
    definicao    JSONB NOT NULL,
    derivado_de  UUID REFERENCES percurso (id),   -- bifurcação do percurso
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- execucao_percurso: série temporal do percurso (decisão 6). Cada travessia é um
-- evento datado imutável, com o resultado POR ARESTA (achados, órfãos, contratos
-- de base faltante). NÃO materializa tabela de resultado como verdade.
CREATE TABLE IF NOT EXISTS execucao_percurso (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    percurso_id    UUID NOT NULL REFERENCES percurso (id),
    data           TIMESTAMPTZ NOT NULL DEFAULT now(),
    ligados_total  INTEGER NOT NULL,
    orfaos_total   INTEGER NOT NULL,
    elos_ausentes  INTEGER NOT NULL,
    saltos         JSONB NOT NULL,   -- resultado por aresta (achados como dado)
    proveniencia   JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_execpercurso ON execucao_percurso (percurso_id, data);

-- ── Gatilhos de imutabilidade (append-only) ────────────────────────────────
CREATE OR REPLACE FUNCTION sonda_recusa_mutacao() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'SONDA: % é append-only (decisões 6 e 7). Mutação recusada.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS snapshot_imutavel ON snapshot;
CREATE TRIGGER snapshot_imutavel
    BEFORE UPDATE OR DELETE ON snapshot
    FOR EACH ROW EXECUTE FUNCTION sonda_recusa_mutacao();

DROP TRIGGER IF EXISTS execucao_imutavel ON execucao;
CREATE TRIGGER execucao_imutavel
    BEFORE UPDATE OR DELETE ON execucao
    FOR EACH ROW EXECUTE FUNCTION sonda_recusa_mutacao();

DROP TRIGGER IF EXISTS execpercurso_imutavel ON execucao_percurso;
CREATE TRIGGER execpercurso_imutavel
    BEFORE UPDATE OR DELETE ON execucao_percurso
    FOR EACH ROW EXECUTE FUNCTION sonda_recusa_mutacao();
