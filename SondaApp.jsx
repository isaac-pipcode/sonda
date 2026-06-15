import React, { useState, useMemo } from "react";

/*
  SONDA — Protótipo unificado (esqueleto do produto)
  ==================================================
  Reúne as quatro visões construídas ao longo do projeto numa interface única,
  vestida com a identidade Espectro 1.0 (Observatório de Dados e Políticas do
  Audiovisual — UFF).

  Identidade aplicada:
   - Carbono (#0E1116) ancora o fundo;
   - Sinal (#FF3D2E) é interferência: o achado, a aresta factual, a incompletude;
   - Sonar (#00C2A8) é leitura: o derivado, a articulação;
   - Osso/Pergaminho são superfícies claras; Sedimento é estrutura/repouso;
   - tipografia pesada e geométrica no wordmark, mono para proveniência.
   - o isótipo (linhas paralelas, uma interferida por um nó, leitura vertical
     tracejada) aparece como marca e como motivo estrutural.

  Quatro visões:
   1. CATÁLOGO    — as bases agregadas, em suas línguas próprias (porosidade ontológica)
   2. PERCURSO    — a rede de caminhos navegável + Sonda generativa (elo ausente → contrato)
   3. TRAJETÓRIA  — o cruzamento como série temporal (estoque → fluxo)
   4. CRUZAMENTOS — objetos persistentes: autoria, versão, bifurcação

  Dados: fac-símiles de estrutura, fiéis ao que a sondagem revelou.
*/

const S = {
  carbono: "#0E1116", carbonoSoft: "#171C24", carbonoLine: "#252B35",
  sinal: "#FF3D2E", sinalDark: "#C42A1E",
  sonar: "#00C2A8", sonarDark: "#0A7D6C",
  osso: "#F2EEE5", pergaminho: "#FAF7F0",
  sedimento: "#6B6A66", sedimentoSoft: "#9B9A94",
};

const BASES = {
  OCA:  { label: "OCA", desc: "Ancine · regulação", cor: S.sinal,
          regime: "aberto · CSV não-proprietário", entidade: "obra (CPB), agente regulado, sala" },
  LPG:  { label: "LPG", desc: "MinC · fomento", cor: S.sonar,
          regime: "disperso · PDF / planilha / diário oficial", entidade: "edital local, projeto contemplado" },
  MAPA: { label: "Mapa Cultural", desc: "MinC · colaborativo", cor: S.sedimentoSoft,
          regime: "API REST · JSON federado", entidade: "agente, espaço, evento, projeto" },
};

// ——— isótipo SVG inline (a marca como componente) ———
function Isotipo({ size = 40, ativo = true }) {
  const linhas = [10, 22, 34, 50, 62, 78, 90];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ flexShrink: 0 }}>
      {linhas.map((y, i) => {
        const curva = i === 2 || i === 3 || i === 4;
        const sinal = i === 3;
        const d = curva
          ? `M 8 ${y} Q 50 ${y - 12} 92 ${y}`
          : `M 8 ${y} L 92 ${y}`;
        return <path key={i} d={d} fill="none"
          stroke={sinal && ativo ? S.sinal : S.sedimento}
          strokeWidth={sinal ? 3.4 : 2.2} strokeLinecap="round"
          opacity={sinal ? 1 : 0.55} />;
      })}
      <line x1="50" y1="4" x2="50" y2="96" stroke={S.sedimentoSoft} strokeWidth="1.4" strokeDasharray="3 4" opacity="0.6" />
      <circle cx="50" cy="42" r="5.5" fill={ativo ? S.sinal : S.sedimento} />
      <circle cx="50" cy="42" r="2.2" fill={S.carbono} />
    </svg>
  );
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Isotipo size={42} />
      <div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.01em", lineHeight: 1, color: S.osso, fontFamily: "'Archivo','Helvetica Neue',sans-serif" }}>
          S<span style={{ color: S.sinal }}>O</span>NDA
        </div>
        <div style={{ fontSize: 8.5, letterSpacing: ".22em", color: S.sedimentoSoft, fontFamily: "'IBM Plex Mono',monospace", marginTop: 3 }}>
          OBSERVATÓRIO DE DADOS E POLÍTICAS DO AUDIOVISUAL
        </div>
      </div>
    </div>
  );
}

// ============ VISÃO 1: CATÁLOGO ============
function Catalogo() {
  return (
    <div>
      <Lead n="01" titulo="Catálogo" sub="As bases agregadas, cada uma na sua língua. Nada é reconciliado à força." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, marginTop: 20 }}>
        {Object.entries(BASES).map(([k, b]) => (
          <div key={k} style={{ background: S.carbonoSoft, border: `1px solid ${S.carbonoLine}`, borderTop: `3px solid ${b.cor}`, borderRadius: 8, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: b.cor }} />
              <span style={{ fontSize: 17, fontWeight: 700, color: S.osso, fontFamily: "'Archivo',sans-serif" }}>{b.label}</span>
            </div>
            <div style={{ fontSize: 11.5, color: S.sedimentoSoft, fontFamily: "'IBM Plex Mono',monospace", marginTop: 3 }}>{b.desc}</div>
            <div style={{ marginTop: 14, fontSize: 12.5, lineHeight: 1.6, fontFamily: "'IBM Plex Mono',monospace", color: S.sedimentoSoft }}>
              <div><span style={{ color: S.sedimento }}>regime:</span> <span style={{ color: S.osso }}>{b.regime}</span></div>
              <div style={{ marginTop: 5 }}><span style={{ color: S.sedimento }}>entidade nativa:</span> <span style={{ color: S.osso }}>{b.entidade}</span></div>
            </div>
          </div>
        ))}
        {/* a vaga: o convite à expansão */}
        <div style={{ background: "transparent", border: `1.5px dashed ${S.sinalDark}`, borderRadius: 8, padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: S.sinal, fontFamily: "'Archivo',sans-serif" }}>+ base faltante</div>
          <div style={{ fontSize: 11.5, color: S.sedimentoSoft, fontFamily: "'IBM Plex Mono',monospace", marginTop: 6, lineHeight: 1.5 }}>
            a Sonda cresce nas bordas. Cada elo ausente especifica o dataset que o preencheria.
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ VISÃO 2: PERCURSO (rede generativa) ============
const NOS = {
  filme:      { t: "Filmes 2026", s: "lançados no ano", tipo: "factual", base: "OCA", x: 30, y: 60, w: 150, h: 54 },
  salas:      { t: "Salas", s: "onde passou", tipo: "factual", base: "OCA", x: 280, y: 60, w: 150, h: 54 },
  territorio: { t: "Território", s: "distribuição", tipo: "factual", base: "OCA", x: 280, y: 165, w: 150, h: 54 },
  publico:    { t: "Público", s: "ingressos", tipo: "factual", base: "OCA", x: 60, y: 220, w: 150, h: 54 },
  preco:      { t: "Preço médio", s: "renda ÷ público", tipo: "derivado", base: "—", x: 470, y: 220, w: 160, h: 54 },
  origem:     { t: "Origem do público", s: "elo ausente", tipo: "ausente", base: "—", x: 60, y: 330, w: 175, h: 56 },
};
const ARESTAS = [
  ["filme", "salas", "factual"], ["salas", "territorio", "factual"],
  ["salas", "publico", "factual"], ["publico", "preco", "derivado"],
  ["publico", "origem", "ausente"],
];
function corTipo(t) { return t === "derivado" ? S.sonar : t === "ausente" ? S.sinal : S.sinal; }

function Percurso() {
  const [sel, setSel] = useState(null);
  const c = (k) => ({ x: NOS[k].x + NOS[k].w / 2, y: NOS[k].y + NOS[k].h / 2 });
  return (
    <div>
      <Lead n="02" titulo="Percurso" sub="O caminho do dado é o objeto. Clique no elo tracejado: a ausência é um gerador." />
      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 18, marginTop: 20, alignItems: "start" }}>
        <div style={{ background: S.carbonoSoft, border: `1px solid ${S.carbonoLine}`, borderRadius: 8, padding: 6 }}>
          <svg viewBox="0 0 680 410" style={{ width: "100%", height: "auto" }}>
            <defs>
              <marker id="au" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M2 2 L8 5 L2 8" fill="none" stroke="context-stroke" strokeWidth="1.6" />
              </marker>
            </defs>
            <line x1="50" y1="20" x2="50" y2="396" stroke={S.sedimento} strokeWidth="1.2" strokeDasharray="3 5" opacity="0.4" />
            {ARESTAS.map(([de, pa, tipo], i) => {
              const e1 = c(de), e2 = c(pa); const col = corTipo(tipo);
              const on = sel === `e${i}`;
              return (
                <g key={i} onClick={() => setSel(`e${i}`)} style={{ cursor: "pointer" }}>
                  <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} stroke="transparent" strokeWidth="16" />
                  <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} stroke={col} strokeWidth={on ? 3.5 : 2}
                    strokeDasharray={tipo === "ausente" ? "6 5" : "0"} markerEnd="url(#au)" opacity={on ? 1 : 0.7} />
                </g>
              );
            })}
            {Object.entries(NOS).map(([k, n]) => {
              const col = n.tipo === "ausente" ? S.sinal : n.tipo === "derivado" ? S.sonar : S.sinal;
              const on = sel === k;
              return (
                <g key={k} onClick={() => setSel(k)} style={{ cursor: "pointer" }}>
                  <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={7}
                    fill={on ? col : S.carbono} stroke={col}
                    strokeWidth={n.tipo === "ausente" ? 1.5 : on ? 2 : 1}
                    strokeDasharray={n.tipo === "ausente" ? "6 5" : "0"} />
                  <text x={n.x + n.w / 2} y={n.y + n.h / 2 - 5} textAnchor="middle" fontSize="13" fontWeight="700"
                    fill={on ? S.carbono : S.osso} fontFamily="'Archivo',sans-serif">{n.t}</text>
                  <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 12} textAnchor="middle" fontSize="10"
                    fill={on ? S.carbono : S.sedimentoSoft} fontFamily="'IBM Plex Mono',monospace">{n.s}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <PainelPercurso sel={sel} />
      </div>
    </div>
  );
}

function PainelPercurso({ sel }) {
  if (sel === "origem" || sel === "e4") {
    return (
      <div style={{ background: S.carbonoSoft, border: `1.5px dashed ${S.sinal}`, borderRadius: 8, padding: "18px 18px" }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, fontWeight: 700, color: S.sinal, letterSpacing: ".05em" }}>
          ⚠ ELO AUSENTE · CONTRATO DE BASE FALTANTE
        </div>
        <div style={{ fontSize: 13, color: S.osso, lineHeight: 1.55, marginTop: 10 }}>
          <b>O dado não existe</b> em nenhuma base agregada. Para prosseguir, é preciso nova coleta.
        </div>
        <div style={{ marginTop: 14, padding: "13px 14px", background: "rgba(255,61,46,.06)", borderLeft: `3px solid ${S.sinal}`, borderRadius: 3 }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: S.sinal, fontWeight: 700, marginBottom: 6 }}>PERGUNTA DE PESQUISA</div>
          <div style={{ fontSize: 14.5, fontStyle: "italic", color: S.osso, lineHeight: 1.5, fontFamily: "'Newsreader',serif" }}>
            De onde vem o público que assiste aos filmes — e como a procedência do espectador se relaciona com a origem territorial da obra?
          </div>
        </div>
        <div style={{ marginTop: 12, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: S.sedimento, fontWeight: 700 }}>
          EIXO DE LIGAÇÃO — hipótese a confirmar
        </div>
        {["por CEP do espectador → sala", "por sessão → amostra de público", "por município de residência declarado"].map((h, i) => (
          <div key={i} style={{ fontSize: 12, color: S.sedimentoSoft, fontFamily: "'IBM Plex Mono',monospace", padding: "4px 0" }}>
            <span style={{ color: S.sinal }}>?</span> {h}
          </div>
        ))}
      </div>
    );
  }
  const k = sel && !sel.startsWith("e") ? sel : null;
  const n = k ? NOS[k] : null;
  return (
    <div style={{ background: S.carbonoSoft, border: `1px solid ${S.carbonoLine}`, borderRadius: 8, padding: "18px 18px", minHeight: 120 }}>
      {!n && <div style={{ color: S.sedimentoSoft, fontStyle: "italic", fontSize: 13.5, fontFamily: "'Newsreader',serif" }}>Selecione um nó ou aresta para inspecionar a proveniência. O elo tracejado abre o contrato da base faltante.</div>}
      {n && (
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: S.osso, fontFamily: "'Archivo',sans-serif" }}>{n.t}</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: S.sedimentoSoft, marginTop: 3 }}>
            {n.tipo === "derivado" ? "nó derivado · não é dado primário" : `nó factual · base ${n.base}`}
          </div>
          <div style={{ marginTop: 12, padding: "10px 12px", background: S.carbono, borderRadius: 4, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: S.sedimentoSoft }}>
            ↳ {n.tipo === "derivado" ? "preço = renda / público (mesma sessão)" : "proveniência: ligação registrada no OCA por CPB/sessão"}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ VISÃO 3: TRAJETÓRIA (série temporal) ============
const SERIE = [
  { d: "11/25", lig: 41, orf: 96, mig: false },
  { d: "01/26", lig: 53, orf: 88, mig: false },
  { d: "03/26", lig: 57, orf: 90, mig: false },
  { d: "04/26", lig: 55, orf: 92, mig: true },
  { d: "05/26", lig: 69, orf: 81, mig: false },
];
function Trajetoria() {
  const [hv, setHv] = useState(null);
  const W = 640, H = 240, pL = 38, pR = 16, pT = 18, pB = 42;
  const iW = W - pL - pR, iH = H - pT - pB;
  const maxY = Math.max(...SERIE.flatMap(s => [s.lig, s.orf])) * 1.2;
  const x = i => pL + (i / (SERIE.length - 1)) * iW;
  const y = v => pT + iH - (v / maxY) * iH;
  const line = key => SERIE.map((s, i) => `${i ? "L" : "M"} ${x(i)} ${y(s[key])}`).join(" ");
  const taxa = Math.round(SERIE[4].lig / (SERIE[4].lig + SERIE[4].orf) * 100);
  return (
    <div>
      <Lead n="03" titulo="Trajetória" sub="O cruzamento como série temporal. A regra é fixa; a variação mede o mundo." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, margin: "20px 0 16px" }}>
        <Metric label="taxa de ligação" v={`${taxa}%`} cor={S.sonar} />
        <Metric label="Δ ligações" v={`+${SERIE[4].lig - SERIE[0].lig}`} cor={S.sonar} />
        <Metric label="Δ órfãos" v={`${SERIE[4].orf - SERIE[0].orf}`} cor={S.sinal} />
      </div>
      <div style={{ background: S.carbonoSoft, border: `1px solid ${S.carbonoLine}`, borderRadius: 8, padding: "14px 16px 6px" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
          {[0, 0.5, 1].map((f, i) => { const yy = pT + iH - f * iH; return <line key={i} x1={pL} y1={yy} x2={W - pR} y2={yy} stroke={S.carbonoLine} strokeDasharray="2 4" />; })}
          <path d={line("orf")} fill="none" stroke={S.sinal} strokeWidth="2" strokeDasharray="5 4" opacity="0.85" />
          <path d={line("lig")} fill="none" stroke={S.sonar} strokeWidth="2.5" />
          {SERIE.map((s, i) => (
            <g key={i} onMouseEnter={() => setHv(i)} onMouseLeave={() => setHv(null)} style={{ cursor: "pointer" }}>
              <rect x={x(i) - 14} y={pT} width="28" height={iH} fill={hv === i ? "rgba(255,255,255,.03)" : "transparent"} />
              <circle cx={x(i)} cy={y(s.orf)} r={hv === i ? 5.5 : 3.5} fill={S.sinal} />
              <circle cx={x(i)} cy={y(s.lig)} r={hv === i ? 5.5 : 3.5} fill={S.sonar} />
              {s.mig && <text x={x(i)} y={y(s.lig) - 11} textAnchor="middle" fontSize="12" fill={S.sinal}>⚠</text>}
              <text x={x(i)} y={H - 22} textAnchor="middle" fontSize="9.5" fill={S.sedimentoSoft} fontFamily="'IBM Plex Mono',monospace">{s.d}</text>
            </g>
          ))}
          <g fontFamily="'IBM Plex Mono',monospace" fontSize="10">
            <circle cx={pL + 4} cy={H - 6} r="4" fill={S.sonar} /><text x={pL + 13} y={H - 3} fill={S.osso}>ligações</text>
            <circle cx={pL + 90} cy={H - 6} r="4" fill={S.sinal} /><text x={pL + 99} y={H - 3} fill={S.osso}>órfãos</text>
          </g>
        </svg>
        <div style={{ minHeight: 30, padding: "6px 2px" }}>
          {hv != null && (
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: SERIE[hv].mig ? S.sinal : S.sedimentoSoft }}>
              {SERIE[hv].mig ? "⚠ " : "→ "}{SERIE[hv].d} · ligações {SERIE[hv].lig} · órfãos {SERIE[hv].orf}
              {SERIE[hv].mig ? " · variação por migração de esquema, não fenômeno real" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ VISÃO 4: CRUZAMENTOS ============
function Cruzamentos() {
  const [forks, setForks] = useState([]);
  return (
    <div>
      <Lead n="04" titulo="Cruzamentos" sub="Objetos persistentes: assinados, versionados, bifurcáveis. A receita, não o resultado." />
      <div style={{ background: S.carbonoSoft, border: `1px solid ${S.carbonoLine}`, borderTop: `4px solid ${S.osso}`, borderRadius: 8, padding: "18px 20px", marginTop: 20 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: S.osso, fontFamily: "'Archivo',sans-serif" }}>Fomento LPG → obras formalizadas no OCA</div>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: S.sedimentoSoft, marginTop: 4 }}>
          x-0001 · regra v2 · assinado por <span style={{ color: S.osso }}>Isaac (UFF)</span>
        </div>
        <div style={{ marginTop: 14, padding: "12px 14px", background: S.carbono, borderRadius: 4, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: S.sedimentoSoft, lineHeight: 1.7 }}>
          <div style={{ color: S.osso, fontWeight: 700, marginBottom: 4 }}>↳ receita (re-executável)</div>
          <div><span style={{ color: S.sedimento }}>eixo:</span> CNPJ do proponente</div>
          <div><span style={{ color: S.sedimento }}>regra:</span> igualdade estrita; pessoa-física entra como órfão</div>
          <div><span style={{ color: S.sedimento }}>versões-fonte:</span> LPG[rel. gestão] · OCA[PDA 2023-24]</div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={() => setForks(f => [...f, f.length])}
            style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 600, padding: "9px 14px", borderRadius: 4, border: `1px solid ${S.sonar}`, background: "transparent", color: S.sonar, cursor: "pointer" }}>
            ⑂ bifurcar (discordar da regra)
          </button>
        </div>
        {forks.map((f, i) => (
          <div key={i} style={{ marginTop: 10, padding: "11px 13px", background: S.carbono, borderLeft: `3px solid ${S.sonar}`, borderRadius: 3 }}>
            <div style={{ fontSize: 13.5, color: S.osso, fontWeight: 600 }}>Fomento LPG → obras (bifurcação {i + 1})</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: S.sonar, marginTop: 4 }}>
              x-{String(i + 2).padStart(4, "0")} · derivado de x-0001 · regra alterada: incluir match por nome+município
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ——— helpers ———
function Lead({ n, titulo, sub }) {
  return (
    <div style={{ borderLeft: `3px solid ${S.sinal}`, paddingLeft: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: S.sinal, fontWeight: 700 }}>{n}</span>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: S.osso, fontFamily: "'Archivo',sans-serif", letterSpacing: "-.01em" }}>{titulo}</h2>
      </div>
      <p style={{ fontSize: 14, color: S.sedimentoSoft, margin: "6px 0 0", fontFamily: "'Newsreader',serif", fontStyle: "italic" }}>{sub}</p>
    </div>
  );
}
function Metric({ label, v, cor }) {
  return (
    <div style={{ background: S.carbonoSoft, border: `1px solid ${S.carbonoLine}`, borderRadius: 6, padding: "12px 14px" }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor, fontFamily: "'Archivo',sans-serif" }}>{v}</div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: S.sedimentoSoft, marginTop: 2, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
    </div>
  );
}

const VISOES = [
  { id: "catalogo", rotulo: "Catálogo", comp: Catalogo },
  { id: "percurso", rotulo: "Percurso", comp: Percurso },
  { id: "trajetoria", rotulo: "Trajetória", comp: Trajetoria },
  { id: "cruzamentos", rotulo: "Cruzamentos", comp: Cruzamentos },
];

export default function SondaApp() {
  const [v, setV] = useState("percurso");
  const Atual = VISOES.find(x => x.id === v).comp;
  return (
    <div style={{ minHeight: "100vh", background: S.carbono, color: S.osso, fontFamily: "'Newsreader',Georgia,serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;700;800&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=IBM+Plex+Mono:wght@400;600;700&display=swap');
        * { box-sizing: border-box; }
        .nav-btn { transition: all .15s ease; cursor: pointer; }
        .nav-btn:hover { color: ${S.osso}; }
        @keyframes fade { from {opacity:0; transform: translateY(6px);} to {opacity:1; transform:none;} }
        .view { animation: fade .25s ease; }
      `}</style>

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "32px 26px 70px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, paddingBottom: 20, borderBottom: `1px solid ${S.carbonoLine}` }}>
          <Wordmark />
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: S.sedimento }}>protótipo unificado · espectro 1.0</span>
        </header>

        <nav style={{ display: "flex", gap: 4, margin: "20px 0 28px", flexWrap: "wrap", background: S.carbonoSoft, padding: 5, borderRadius: 8, border: `1px solid ${S.carbonoLine}`, width: "fit-content" }}>
          {VISOES.map(x => (
            <button key={x.id} className="nav-btn" onClick={() => setV(x.id)}
              style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, fontWeight: 600, padding: "8px 16px", borderRadius: 5, border: "none",
                background: v === x.id ? S.sinal : "transparent", color: v === x.id ? S.carbono : S.sedimentoSoft, cursor: "pointer" }}>
              {x.rotulo}
            </button>
          ))}
        </nav>

        <div className="view" key={v}><Atual /></div>

        <footer style={{ borderTop: `1px solid ${S.carbonoLine}`, marginTop: 44, paddingTop: 16, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: S.sedimento, lineHeight: 1.7 }}>
          <div>Carbono ancora · Sinal interfere · Sonar lê. Dados: fac-símiles de estrutura, fiéis à sondagem das bases.</div>
          <div>UFF · Observatório de Dados e Políticas do Audiovisual · incomensurabilidade · proveniência · generatividade.</div>
        </footer>
      </div>
    </div>
  );
}
