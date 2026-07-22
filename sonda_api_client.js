/*
  SONDA — cliente JS mínimo para apontar o SondaApp.jsx à API real.

  Toda resposta da API vem embrulhada num envelope { dados, proveniencia,
  avisos, servido_em }. Este cliente NUNCA descarta a proveniência: devolve o
  envelope inteiro, para que a interface possa exibi-la a um clique (porosidade
  2). Descartar `proveniencia` seria um antipadrão.
*/

const BASE = import.meta?.env?.VITE_SONDA_API || "http://localhost:8000";

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
