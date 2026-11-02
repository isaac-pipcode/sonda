import React, { Component, useState, useEffect, useCallback } from "react";
import { SondaAPI } from "./sonda_api_client";

/*
  SONDA — Protótipo unificado (apontado à API real)
  ==================================================
  Reúne as quatro visões na identidade Espectro 1.0 (Observatório de Dados e
  Políticas do Audiovisual — UFF), agora consumindo o backend FastAPI:

   1. CATÁLOGO    — bases agregadas, na língua própria (porosidade ontológica)
   2. PERCURSO    — rede de caminhos + Sonda generativa (elo ausente → contrato)
   3. TRAJETÓRIA  — cruzamento como série temporal (estoque → fluxo)
   4. CRUZAMENTOS — objetos persistentes: autoria, versão, execução, bifurcação

  Toda resposta da API traz `proveniencia`; nenhuma visão a descarta (porosidade 2).
*/

const S = {
  carbono: "#0E1116", carbonoSoft: "#171C24", carbonoLine: "#252B35",
  sinal: "#FF3D2E", sinalDark: "#C42A1E",
  sonar: "#00C2A8", sonarDark: "#0A7D6C",
  osso: "#F2EEE5", pergaminho: "#FAF7F0",
  sedimento: "#6B6A66", sedimentoSoft: "#9B9A94",
};

// cor por base (estrutura neutra até a base se declarar)
const COR_BASE = { oca: S.sinal, lpg: S.sonar, mapa_cultural: S.sedimentoSoft };
const corDaBase = (b) => COR_BASE[b] || S.sedimentoSoft;

// ——— isótipo SVG inline (a marca como componente) ———
function Isotipo({ size = 40, ativo = true }) {
  const linhas = [10, 22, 34, 50, 62, 78, 90];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ flexShrink: 0 }}>
      {linhas.map((y, i) => {
        const curva = i === 2 || i === 3 || i === 4;
        const sinal = i === 3;
        const d = curva ? `M 8 ${y} Q 50 ${y - 12} 92 ${y}` : `M 8 ${y} L 92 ${y}`;
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

// ——— estados de carga/erro (a costura também aparece aqui) ———
function Estado({ carregando, erro, vazio, children }) {
  if (carregando) return <Mono cor={S.sedimentoSoft}>↳ sondando a API…</Mono>;
  if (erro) return <Mono cor={S.sinal}>⚠ {erro} — a API está no ar? (VITE_SONDA_API)</Mono>;
  if (vazio) return <Mono cor={S.sedimentoSoft}>catálogo vazio — rode o seed.py / coleta_real_mapas.py</Mono>;
  return children;
}

const mensagem = (e) => String(e?.message || e);

// falha de uma ação do usuário (executar, bifurcar…): visível e anunciada, nunca silenciosa.
function Falha({ erro }) {
  if (!erro) return null;
  return <div role="alert"><Mono cor={S.sinal}>⚠ {erro}</Mono></div>;
}

// limite de erro: um defeito de renderização numa visão não pode derrubar o app inteiro.
class LimiteDeErro extends Component {
  state = { erro: null };
  static getDerivedStateFromError(erro) { return { erro }; }
  componentDidCatch(erro, info) {
    console.error("SONDA: falha ao renderizar a visão", erro, info?.componentStack);
  }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div role="alert" style={{ background: S.carbonoSoft, border: `1px solid ${S.sinal}`, borderRadius: 8, padding: "18px 20px" }}>
        <Mono cor={S.sinal}>⚠ esta visão falhou ao carregar — {mensagem(this.state.erro)}</Mono>
        <Botao cor={S.sonar} onClick={() => this.setState({ erro: null })}>tentar de novo</Botao>
      </div>
    );
  }
}

// hook mínimo de fetch que PRESERVA o envelope (dados + proveniencia).
// `fn` pode devolver null (ainda sem id) ou lançar de imediato: Promise.resolve().then(fn)
// absorve os dois casos, em vez de quebrar com "null.then" na primeira renderização.
function useEnvelope(fn, deps = []) {
  const [env, setEnv] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const recarregar = useCallback(() => {
    setCarregando(true); setErro(null);
    Promise.resolve().then(fn).then(setEnv).catch((e) => setErro(mensagem(e))).finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { recarregar(); }, [recarregar]);
  return { env, erro, carregando, recarregar };
}

// ============ VISÃO 1: CATÁLOGO ============
function Catalogo() {
  const { env, erro, carregando } = useEnvelope(() => SondaAPI.catalogo());
  const bases = env?.dados || [];
  // proveniência vem como lista [{fonte, snapshots:[...]}] — lado a lado.
  const provPorFonte = Array.isArray(env?.proveniencia) ? env.proveniencia : [];
  const snapsDaBase = (entidade) =>
    provPorFonte.flatMap((p) => (p.snapshots || []).filter((s) => s.entidade === entidade)
      .map((s) => ({ ...s, fonte: p.fonte })));

  return (
    <div>
      <Lead n="01" titulo="Catálogo" sub="As bases agregadas, cada uma na sua língua. Nada é reconciliado à força." />
      <div style={{ marginTop: 20 }}>
        <Estado carregando={carregando} erro={erro} vazio={bases.length === 0}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
            {bases.map((b) => {
              const cor = corDaBase(b.base);
              const snaps = snapsDaBase(b.entidade_nativa);
              const s0 = snaps[0];
              return (
                <div key={`${b.base}:${b.entidade_nativa}`} style={{ background: S.carbonoSoft, border: `1px solid ${S.carbonoLine}`, borderTop: `3px solid ${cor}`, borderRadius: 8, padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: cor }} />
                    <span style={{ fontSize: 17, fontWeight: 700, color: S.osso, fontFamily: "'Archivo',sans-serif" }}>{b.base}</span>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.7, fontFamily: "'IBM Plex Mono',monospace", color: S.sedimentoSoft }}>
                    <div><span style={{ color: S.sedimento }}>entidade nativa:</span> <span style={{ color: S.osso }}>{b.entidade_nativa}</span></div>
                    <div><span style={{ color: S.sedimento }}>registros:</span> <span style={{ color: S.osso }}>{b.n_registros}</span></div>
                    {s0 && <div><span style={{ color: S.sedimento }}>fonte:</span> <span style={{ color: S.osso }}>{s0.fonte}</span></div>}
                    {s0 && <div><span style={{ color: S.sedimento }}>versão:</span> <span style={{ color: S.osso }}>{s0.instancia_versao}</span></div>}
                  </div>
                  {/* proveniência ao alcance de um clique (porosidade 2) */}
                  {s0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: S.sonar }}>proveniência · {snaps.length} snapshot(s)</summary>
                      {snaps.map((s) => (
                        <div key={s.snapshot_id} style={{ marginTop: 6, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: S.sedimentoSoft, lineHeight: 1.5 }}>
                          <div>↳ {s.capturado_em}</div>
                          <div style={{ color: S.sedimento }}>fixity: {String(s.fixity).slice(0, 16)}…</div>
                          <div style={{ color: S.sedimento }}>retenção: {s.politica_retencao?.regime}</div>
                        </div>
                      ))}
                    </details>
                  )}
                </div>
              );
            })}
            {/* a vaga: o convite à expansão */}
            <div style={{ background: "transparent", border: `1.5px dashed ${S.sinalDark}`, borderRadius: 8, padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: S.sinal, fontFamily: "'Archivo',sans-serif" }}>+ base faltante</div>
              <div style={{ fontSize: 11.5, color: S.sedimentoSoft, fontFamily: "'IBM Plex Mono',monospace", marginTop: 6, lineHeight: 1.5 }}>
                a Sonda cresce nas bordas. Cada elo ausente especifica o dataset que o preencheria.
              </div>
            </div>
          </div>
        </Estado>
      </div>
    </div>
  );
}

// ============ VISÃO 2: PERCURSO (rede de caminhos — lida do backend) ============
// Layout por id de nó; a estrutura (nós/arestas) e os achados vêm da API.
const LAYOUT = {
  filme:  { x: 40,  y: 60,  w: 170, h: 54 },
  salas:  { x: 320, y: 60,  w: 160, h: 54 },
  preco:  { x: 470, y: 210, w: 170, h: 54 },
  origem: { x: 60,  y: 300, w: 190, h: 56 },
};
const _fallbackLayout = (i) => ({ x: 40 + (i % 3) * 220, y: 60 + Math.floor(i / 3) * 110, w: 175, h: 54 });
const corTipo = (t) => (t === "derivado" ? S.sonar : S.sinal);

function Percurso() {
  const [sel, setSel] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState(null);

  const { env: lista } = useEnvelope(() => SondaAPI.percursos());
  const pid = lista?.dados?.[0]?.id;
  const { env: det, erro: erroDet, carregando: carDet } = useEnvelope(
    () => (pid ? SondaAPI.percurso(pid) : null), [pid]);
  const { env: ult, carregando: carUlt, recarregar } = useEnvelope(
    () => (pid ? SondaAPI.percursoUltima(pid) : null), [pid]);

  const definicao = det?.dados?.definicao;
  const saltos = ult?.dados?.saltos || [];
  const resumo = ult?.dados?.resumo;
  const saltoDe = (de, para) => saltos.find((s) => s.de === de && s.para === para);

  const reexecutar = async () => {
    if (!pid) return;
    setOcupado(true); setFalha(null);
    try { await SondaAPI.executarPercurso(pid); recarregar(); }
    catch (e) { setFalha(`não foi possível re-executar a travessia — ${mensagem(e)}`); }
    finally { setOcupado(false); }
  };

  const nos = definicao?.nos || [];
  const pos = {}; nos.forEach((n, i) => { pos[n.id] = { ...(LAYOUT[n.id] || _fallbackLayout(i)), ...n }; });
  const centro = (id) => ({ x: pos[id].x + pos[id].w / 2, y: pos[id].y + pos[id].h / 2 });

  return (
    <div>
      <Lead n="02" titulo="Percurso" sub="O caminho do dado é o objeto — travessia multi-salto lida do backend. Clique no elo tracejado: a ausência é um gerador." />

      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "16px 0 4px", flexWrap: "wrap" }}>
        <Botao cor={S.sinal} onClick={reexecutar} ocupado={ocupado}>▶ re-executar travessia</Botao>
        {resumo && (
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: S.sedimentoSoft }}>
            <span style={{ color: S.sonar }}>{resumo.ligados_total} ligados</span> ·{" "}
            <span style={{ color: S.sinal }}>{resumo.orfaos_total} órfãos</span> ·{" "}
            <span style={{ color: S.sinal }}>{resumo.n_elos_ausentes} elo(s) ausente(s)</span> ·{" "}
            {resumo.n_derivados} derivado(s)
          </span>
        )}
      </div>
      <Falha erro={falha} />

      <Estado carregando={carDet || carUlt} erro={erroDet} vazio={!definicao}>
        <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 18, marginTop: 12, alignItems: "start" }}>
          <div style={{ background: S.carbonoSoft, border: `1px solid ${S.carbonoLine}`, borderRadius: 8, padding: 6 }}>
            <svg viewBox="0 0 680 410" style={{ width: "100%", height: "auto" }}>
              <defs>
                <marker id="au" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M2 2 L8 5 L2 8" fill="none" stroke="context-stroke" strokeWidth="1.6" />
                </marker>
              </defs>
              <line x1="24" y1="20" x2="24" y2="396" stroke={S.sedimento} strokeWidth="1.2" strokeDasharray="3 5" opacity="0.4" />
              {(definicao?.arestas || []).map((a, i) => {
                if (!pos[a.de] || !pos[a.para]) return null;
                const e1 = centro(a.de), e2 = centro(a.para);
                const s = saltoDe(a.de, a.para);
                const tipo = s?.tipo || a.tipo || "factual";
                const col = corTipo(tipo);
                const on = sel === `e${i}`;
                const mx = (e1.x + e2.x) / 2, my = (e1.y + e2.y) / 2;
                return (
                  <g key={i} onClick={() => setSel(tipo === "ausente" ? a.para : `e${i}`)} style={{ cursor: "pointer" }}>
                    <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} stroke="transparent" strokeWidth="16" />
                    <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} stroke={col} strokeWidth={on ? 3.5 : 2}
                      strokeDasharray={tipo === "ausente" ? "6 5" : "0"} markerEnd="url(#au)" opacity={on ? 1 : 0.7} />
                    {tipo === "factual" && s && (
                      <text x={mx} y={my - 6} textAnchor="middle" fontSize="10" fill={S.sonar} fontFamily="'IBM Plex Mono',monospace">
                        {s.ligados} ligados
                      </text>
                    )}
                  </g>
                );
              })}
              {nos.map((no) => {
                const p = pos[no.id];
                const col = no.tipo === "derivado" ? S.sonar : S.sinal;
                const on = sel === no.id;
                return (
                  <g key={no.id} onClick={() => setSel(no.id)} style={{ cursor: "pointer" }}>
                    <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={7}
                      fill={on ? col : S.carbono} stroke={col}
                      strokeWidth={no.tipo === "ausente" ? 1.5 : on ? 2 : 1}
                      strokeDasharray={no.tipo === "ausente" ? "6 5" : "0"} />
                    <text x={p.x + p.w / 2} y={p.y + p.h / 2 - 5} textAnchor="middle" fontSize="13" fontWeight="700"
                      fill={on ? S.carbono : S.osso} fontFamily="'Archivo',sans-serif">{no.rotulo}</text>
                    <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 12} textAnchor="middle" fontSize="10"
                      fill={on ? S.carbono : S.sedimentoSoft} fontFamily="'IBM Plex Mono',monospace">{no.tipo}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <PainelPercurso sel={sel} nos={pos} saltos={saltos} arestas={definicao?.arestas || []} />
        </div>
      </Estado>
    </div>
  );
}

function PainelPercurso({ sel, nos, saltos, arestas }) {
  // seleção de um nó ausente → contrato real (do salto ausente da travessia).
  const noSel = sel && nos[sel];
  if (noSel && noSel.tipo === "ausente") {
    const salto = saltos.find((s) => s.para === sel && s.tipo === "ausente");
    const contrato = salto?.contrato;
    return (
      <div style={{ background: S.carbonoSoft, border: `1.5px dashed ${S.sinal}`, borderRadius: 8, padding: "18px 18px" }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, fontWeight: 700, color: S.sinal, letterSpacing: ".05em" }}>
          ⚠ ELO AUSENTE · CONTRATO DE BASE FALTANTE
        </div>
        {!contrato && <Mono cor={S.sedimentoSoft}>execute a travessia para gerar o contrato</Mono>}
        {contrato && (
          <>
            <div style={{ marginTop: 14, padding: "13px 14px", background: "rgba(255,61,46,.06)", borderLeft: `3px solid ${S.sinal}`, borderRadius: 3 }}>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: S.sinal, fontWeight: 700, marginBottom: 6 }}>PERGUNTA DE PESQUISA</div>
              <div style={{ fontSize: 14.5, fontStyle: "italic", color: S.osso, lineHeight: 1.5, fontFamily: "'Newsreader',serif" }}>
                {contrato.pergunta_de_pesquisa}
              </div>
            </div>
            <div style={{ marginTop: 12, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: S.sedimento, fontWeight: 700 }}>
              EIXO DE LIGAÇÃO ({contrato.eixo_de_ligacao_hipotese?.eixo}) — hipótese a confirmar
            </div>
            {(contrato.eixo_de_ligacao_hipotese?.hipoteses || []).map((h, i) => (
              <div key={i} style={{ fontSize: 12, color: S.sedimentoSoft, fontFamily: "'IBM Plex Mono',monospace", padding: "4px 0" }}>
                <span style={{ color: S.sinal }}>?</span> {h}
              </div>
            ))}
            <div style={{ marginTop: 10, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: S.sedimento }}>
              retenção: {contrato.regime_retencao}
            </div>
          </>
        )}
      </div>
    );
  }

  // seleção de aresta factual → métricas reais + amostra de órfãos (achado).
  let salto = null;
  if (typeof sel === "string" && sel.startsWith("e")) {
    const a = arestas[Number(sel.slice(1))];
    if (a) salto = saltos.find((s) => s.de === a.de && s.para === a.para);
  }
  return (
    <div style={{ background: S.carbonoSoft, border: `1px solid ${S.carbonoLine}`, borderRadius: 8, padding: "18px 18px", minHeight: 120 }}>
      {!noSel && !salto && <div style={{ color: S.sedimentoSoft, fontStyle: "italic", fontSize: 13.5, fontFamily: "'Newsreader',serif" }}>Selecione um nó ou aresta para inspecionar a articulação. O elo tracejado abre o contrato da base faltante.</div>}
      {noSel && noSel.tipo !== "ausente" && (
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: S.osso, fontFamily: "'Archivo',sans-serif" }}>{noSel.rotulo}</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: S.sedimentoSoft, marginTop: 3 }}>
            {noSel.tipo === "derivado" ? "nó derivado · não é dado primário" : "nó factual · registro nativo"}
          </div>
          {noSel.derivacao && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: S.carbono, borderRadius: 4, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: S.sedimentoSoft }}>
              ↳ {noSel.derivacao}
            </div>
          )}
        </div>
      )}
      {salto && salto.tipo === "factual" && (
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: S.osso }}>
            {salto.rotulo_de} → {salto.rotulo_para} · eixo {salto.eixo}
          </div>
          <div style={{ marginTop: 8, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>
            <span style={{ color: S.sonar }}>{salto.ligados} ligados</span> ·{" "}
            <span style={{ color: S.sinal }}>{salto.orfaos_esquerda + salto.orfaos_direita} órfãos</span>
            <span style={{ color: S.sedimento }}> (achado, não escondido)</span>
          </div>
          {(salto.amostra_orfaos_esquerda || []).slice(0, 5).map((o, i) => (
            <div key={i} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: S.sedimentoSoft, paddingTop: 3 }}>
              <span style={{ color: S.sinal }}>órfão</span> {o.rotulo}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ VISÃO 3: TRAJETÓRIA (série temporal real) ============
function Trajetoria() {
  // escolhe o primeiro cruzamento executável e lê sua série.
  const { env: lista } = useEnvelope(() => SondaAPI.cruzamentos());
  const candidatos = (lista?.dados || []).filter((c) => c.execucoes > 0 && !/faltante/i.test(c.nome));
  const cid = candidatos[0]?.id;
  const { env, erro, carregando } = useEnvelope(async () => (cid ? SondaAPI.cruzamento(cid) : null), [cid]);
  const serie = (env?.dados?.serie || []).map((s) => ({
    d: new Date(s.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    lig: s.ligados, orf: s.orfaos, mig: s.tipo === "migracao",
  }));

  return (
    <div>
      <Lead n="03" titulo="Trajetória" sub="O cruzamento como série temporal. A regra é fixa; a variação mede o mundo." />
      <div style={{ marginTop: 20 }}>
        <Estado carregando={carregando} erro={erro} vazio={serie.length === 0}>
          <GraficoSerie serie={serie} nome={env?.dados?.nome} />
        </Estado>
      </div>
    </div>
  );
}

function GraficoSerie({ serie, nome }) {
  const [hv, setHv] = useState(null);
  const W = 640, H = 240, pL = 38, pR = 16, pT = 18, pB = 42;
  const iW = W - pL - pR, iH = H - pT - pB;
  const maxY = Math.max(1, ...serie.flatMap((s) => [s.lig, s.orf])) * 1.2;
  const n = serie.length;
  const x = (i) => pL + (n > 1 ? (i / (n - 1)) * iW : iW / 2);
  const y = (v) => pT + iH - (v / maxY) * iH;
  const line = (key) => serie.map((s, i) => `${i ? "L" : "M"} ${x(i)} ${y(s[key])}`).join(" ");
  const ult = serie[n - 1] || { lig: 0, orf: 0 };
  const prim = serie[0] || { lig: 0, orf: 0 };
  const taxa = ult.lig + ult.orf ? Math.round((ult.lig / (ult.lig + ult.orf)) * 100) : 0;
  return (
    <>
      {nome && <Mono cor={S.sedimentoSoft}>↳ {nome}</Mono>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, margin: "12px 0 16px" }}>
        <Metric label="taxa de ligação" v={`${taxa}%`} cor={S.sonar} />
        <Metric label="Δ ligações" v={`${ult.lig - prim.lig >= 0 ? "+" : ""}${ult.lig - prim.lig}`} cor={S.sonar} />
        <Metric label="Δ órfãos" v={`${ult.orf - prim.orf >= 0 ? "+" : ""}${ult.orf - prim.orf}`} cor={S.sinal} />
      </div>
      <div style={{ background: S.carbonoSoft, border: `1px solid ${S.carbonoLine}`, borderRadius: 8, padding: "14px 16px 6px" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
          {[0, 0.5, 1].map((f, i) => { const yy = pT + iH - f * iH; return <line key={i} x1={pL} y1={yy} x2={W - pR} y2={yy} stroke={S.carbonoLine} strokeDasharray="2 4" />; })}
          <path d={line("orf")} fill="none" stroke={S.sinal} strokeWidth="2" strokeDasharray="5 4" opacity="0.85" />
          <path d={line("lig")} fill="none" stroke={S.sonar} strokeWidth="2.5" />
          {serie.map((s, i) => (
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
          {hv != null && serie[hv] && (
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: serie[hv].mig ? S.sinal : S.sedimentoSoft }}>
              {serie[hv].mig ? "⚠ " : "→ "}{serie[hv].d} · ligações {serie[hv].lig} · órfãos {serie[hv].orf}
              {serie[hv].mig ? " · variação por migração de esquema, não fenômeno real" : ""}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

// ============ VISÃO 4: CRUZAMENTOS ============
function Cruzamentos() {
  const { env, erro, carregando, recarregar } = useEnvelope(() => SondaAPI.cruzamentos());
  const cruzamentos = env?.dados || [];
  return (
    <div>
      <Lead n="04" titulo="Cruzamentos" sub="Objetos persistentes: assinados, versionados, bifurcáveis. A receita, não o resultado." />
      <div style={{ marginTop: 20 }}>
        <Estado carregando={carregando} erro={erro} vazio={cruzamentos.length === 0}>
          <div style={{ display: "grid", gap: 14 }}>
            {cruzamentos.map((c) => <CartaoCruzamento key={c.id} c={c} aoMudar={recarregar} />)}
          </div>
        </Estado>
      </div>
    </div>
  );
}

function CartaoCruzamento({ c, aoMudar }) {
  const [det, setDet] = useState(null);
  const [exec, setExec] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [falha, setFalha] = useState(null);
  const ausente = /faltante/i.test(c.nome);

  const abrir = async () => {
    if (det) return;
    setAbrindo(true); setFalha(null);
    try { setDet((await SondaAPI.cruzamento(c.id)).dados); }
    catch (e) { setFalha(`não foi possível abrir a receita — ${mensagem(e)}`); }
    finally { setAbrindo(false); }
  };
  const executar = async () => {
    setOcupado(true); setFalha(null);
    try { setExec((await SondaAPI.executar(c.id)).dados); aoMudar?.(); }
    catch (e) { setFalha(`não foi possível executar o cruzamento — ${mensagem(e)}`); }
    finally { setOcupado(false); }
  };
  const bifurcar = async () => {
    setOcupado(true); setFalha(null);
    try {
      const base = det || (await SondaAPI.cruzamento(c.id)).dados;
      await SondaAPI.bifurcar(c.id, {
        nome: `${c.nome} (bifurcação)`, autor: c.autor, eixo: base.receita.eixo,
        esquerda: base.receita.esquerda, direita: base.receita.direita,
        regra: base.receita.regra === "igualdade_estrita" ? "igualdade_normalizada" : "igualdade_estrita",
        versoes_fonte: base.receita.versoes_fonte || [], versao_regra: "v2",
        base_faltante: base.receita.base_faltante || null,
      });
      aoMudar?.();
    } catch (e) { setFalha(`não foi possível bifurcar o cruzamento — ${mensagem(e)}`); }
    finally { setOcupado(false); }
  };

  const cor = ausente ? S.sinal : S.osso;
  return (
    <div style={{ background: S.carbonoSoft, border: `1px solid ${S.carbonoLine}`, borderTop: `4px solid ${cor}`, borderRadius: 8, padding: "18px 20px" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: S.osso, fontFamily: "'Archivo',sans-serif" }}>{c.nome}</div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: S.sedimentoSoft, marginTop: 4 }}>
        {String(c.id).slice(0, 8)} · regra {c.versao_regra} · assinado por <span style={{ color: S.osso }}>{c.autor}</span>
        {c.derivado_de && <> · <span style={{ color: S.sonar }}>⑂ derivado de {String(c.derivado_de).slice(0, 8)}</span></>}
        {" · "}<span style={{ color: S.sonar }}>{c.execucoes} execução(ões)</span>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <Botao cor={S.sonar} onClick={abrir} ocupado={abrindo}>ver receita</Botao>
        <Botao cor={S.sinal} onClick={executar} ocupado={ocupado}>▶ executar</Botao>
        <Botao cor={S.sonar} onClick={bifurcar} ocupado={ocupado}>⑂ bifurcar (discordar da regra)</Botao>
      </div>
      <Falha erro={falha} />

      {det && (
        <div style={{ marginTop: 14, padding: "12px 14px", background: S.carbono, borderRadius: 4, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: S.sedimentoSoft, lineHeight: 1.7 }}>
          <div style={{ color: S.osso, fontWeight: 700, marginBottom: 4 }}>↳ receita (re-executável)</div>
          <div><span style={{ color: S.sedimento }}>eixo:</span> {det.receita.eixo}</div>
          <div><span style={{ color: S.sedimento }}>regra:</span> {det.receita.regra}</div>
          {det.receita.base_faltante && <div><span style={{ color: S.sinal }}>base faltante:</span> {det.receita.base_faltante.pergunta}</div>}
        </div>
      )}

      {exec && (
        <div style={{ marginTop: 12, padding: "11px 13px", background: S.carbono, borderLeft: `3px solid ${exec.executavel ? S.sonar : S.sinal}`, borderRadius: 3, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5 }}>
          {exec.executavel ? (
            <span style={{ color: S.osso }}>
              <span style={{ color: S.sonar }}>{exec.ligados} ligados</span> ·{" "}
              <span style={{ color: S.sinal }}>{exec.orfaos_esquerda + exec.orfaos_direita} órfãos</span> (achado, não escondido)
            </span>
          ) : (
            <span style={{ color: S.sinal }}>⚠ base faltante — contrato gerado: “{exec.achados?.contrato?.pergunta_de_pesquisa}”</span>
          )}
        </div>
      )}
    </div>
  );
}

// ——— helpers ———
function Botao({ cor, onClick, ocupado, children }) {
  return (
    <button onClick={onClick} disabled={ocupado}
      style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 600, padding: "9px 14px", borderRadius: 4, border: `1px solid ${cor}`, background: "transparent", color: cor, cursor: ocupado ? "wait" : "pointer", opacity: ocupado ? 0.5 : 1 }}>
      {children}
    </button>
  );
}
function Mono({ cor, children }) {
  return <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: cor, padding: "8px 0" }}>{children}</div>;
}
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
  const [v, setV] = useState("catalogo");
  const Atual = VISOES.find((x) => x.id === v).comp;
  return (
    <div style={{ minHeight: "100vh", background: S.carbono, color: S.osso, fontFamily: "'Newsreader',Georgia,serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;700;800&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=IBM+Plex+Mono:wght@400;600;700&display=swap');
        * { box-sizing: border-box; }
        .nav-btn { transition: all .15s ease; cursor: pointer; }
        .nav-btn:hover { color: ${S.osso}; }
        @keyframes fade { from {opacity:0; transform: translateY(6px);} to {opacity:1; transform:none;} }
        .view { animation: fade .25s ease; }
        summary::-webkit-details-marker { color: ${S.sonar}; }
      `}</style>

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "32px 26px 70px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, paddingBottom: 20, borderBottom: `1px solid ${S.carbonoLine}` }}>
          <Wordmark />
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: S.sedimento }}>protótipo unificado · espectro 1.0 · API real</span>
        </header>

        <nav style={{ display: "flex", gap: 4, margin: "20px 0 28px", flexWrap: "wrap", background: S.carbonoSoft, padding: 5, borderRadius: 8, border: `1px solid ${S.carbonoLine}`, width: "fit-content" }}>
          {VISOES.map((x) => (
            <button key={x.id} className="nav-btn" onClick={() => setV(x.id)}
              style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, fontWeight: 600, padding: "8px 16px", borderRadius: 5, border: "none",
                background: v === x.id ? S.sinal : "transparent", color: v === x.id ? S.carbono : S.sedimentoSoft, cursor: "pointer" }}>
              {x.rotulo}
            </button>
          ))}
        </nav>

        <div className="view" key={v}><LimiteDeErro><Atual /></LimiteDeErro></div>

        <footer style={{ borderTop: `1px solid ${S.carbonoLine}`, marginTop: 44, paddingTop: 16, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: S.sedimento, lineHeight: 1.7 }}>
          <div>Carbono ancora · Sinal interfere · Sonar lê. Dados servidos pela API real, com proveniência em toda resposta.</div>
          <div>UFF · Observatório de Dados e Políticas do Audiovisual · incomensurabilidade · proveniência · generatividade.</div>
        </footer>
      </div>
    </div>
  );
}
