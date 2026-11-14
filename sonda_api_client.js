/*
  SONDA — cliente JS mínimo para apontar o SondaApp.jsx à API real.

  Toda resposta da API vem embrulhada num envelope { dados, proveniencia,
  avisos, servido_em }. Este cliente NUNCA descarta a proveniência: devolve o
  envelope inteiro, para que a interface possa exibi-la a um clique (porosidade
  2). Descartar `proveniencia` seria um antipadrão.
*/

// Em produção a API é servida no MESMO domínio (função Python da Vercel em /api):
// BASE vazio = caminho relativo. Em desenvolvimento, o padrão é o uvicorn local.
// VITE_SONDA_API, se definida, prevalece nos dois casos (ex.: backend em outro domínio).
// (acesso literal a import.meta.env.X: é o que o Vite substitui no build.)
const BASE = import.meta.env.VITE_SONDA_API ?? (import.meta.env.DEV ? "http://localhost:8000" : "");

async function get(rota) {
  const r = await fetch(`${BASE}${rota}`);
  if (!r.ok) throw new Error(`SONDA ${rota} → HTTP ${r.status}`);
  return r.json(); // envelope completo: { dados, proveniencia, avisos, servido_em }
}

async function post(rota, corpo) {
  const r = await fetch(`${BASE}${rota}`, {
    method: "POST",
    headers: corpo ? { "Content-Type": "application/json" } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`SONDA ${rota} → HTTP ${r.status}`);
  return r.json();
}

export const SondaAPI = {
  catalogo: () => get("/api/catalogo"),
  territorio: ({ moeda = "real" } = {}) => get(`/api/territorio?moeda=${moeda}`),
  funil: () => get("/api/ligacoes/funil"),
  // séries anuais (FSA + RIDAB), cada uma na sua unidade; moeda: "real" | "nominal"
  series: ({ de = 2009, ate = 2026, moeda = "real" } = {}) =>
    get(`/api/series?de=${de}&ate=${ate}&moeda=${moeda}`),
  snapshots: () => get("/api/snapshots"),
  raw: (base, { entidade, limite = 50, pagina = 1 } = {}) =>
    get(`/api/raw/${base}?limite=${limite}&pagina=${pagina}` + (entidade ? `&entidade=${encodeURIComponent(entidade)}` : "")),
  cruzamentos: () => get("/api/cruzamentos"),
  cruzamento: (id) => get(`/api/cruzamentos/${id}`),
  executar: (id) => post(`/api/cruzamentos/${id}/executar`),
  criar: (receita) => post("/api/cruzamentos", receita),
  bifurcar: (id, receita) => post(`/api/cruzamentos/${id}/fork`, receita),
  // rede de caminhos (percurso multi-salto)
  percursos: () => get("/api/percursos"),
  percurso: (id) => get(`/api/percursos/${id}`),
  percursoUltima: (id) => get(`/api/percursos/${id}/ultima`),
  executarPercurso: (id) => post(`/api/percursos/${id}/executar`),
};
