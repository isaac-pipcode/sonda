import React, { Component, useState, useEffect, useCallback, useRef } from "react";
import { SondaAPI } from "./sonda_api_client";

/*
  SONDA — interface (Observatório de Dados e Políticas do Audiovisual, UFF)
  ========================================================================
  Três áreas, nomeadas pelo que se faz nelas:

   1. Consultar indicadores — séries anuais, território e o caminho do contrato à tela
   2. Cruzar bases          — cruzamentos, encadeamento, histórico e chaves disponíveis
   3. Baixar e citar        — as bases reunidas, com download e citação

  Regras de tela: gráfico antes de texto; ressalvas a um clique de cada número
  (nunca suprimidas); todo gráfico tem download. A API traz `proveniencia` em
  toda resposta e nenhuma tela a descarta.
*/

const S = {
  tinta: "#0B0D10",      // texto e traços fortes (sobre papel: 19,5:1)
  papel: "#FFFFFF",      // fundo
  painel: "#F2F3F5",     // superfícies internas
  linha: "#D9DCE0",      // réguas e bordas finas (decorativas)
  mudo: "#5B6068",       // texto secundário (6,3:1 sobre papel)
  sinal: "#FF3D2E",      // marca e realce gráfico; NÃO usar como cor de texto sobre papel (3,5:1)
  sinalTxt: "#C42A1E",   // texto de achado, órfão e alerta (5,7:1)
  sonar: "#00796B",      // leitura, ligados, links, a sonda (5,3:1)
  hachura: "#8A909A",    // ausência de dado
};

// ——— isótipo SVG inline (a marca como componente; versão para o cabeçalho escuro) ———
function Isotipo({ size = 40 }) {
  const linhas = [10, 22, 34, 50, 62, 78, 90];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ flexShrink: 0 }} aria-hidden="true">
      {linhas.map((y, i) => {
        const curva = i === 2 || i === 3 || i === 4;
        const sinal = i === 3;
        const d = curva ? `M 8 ${y} Q 50 ${y - 12} 92 ${y}` : `M 8 ${y} L 92 ${y}`;
        return <path key={i} d={d} fill="none" stroke={sinal ? S.sinal : S.hachura}
          strokeWidth={sinal ? 4 : 2.6} strokeLinecap="round" />;
      })}
      <line x1="50" y1="4" x2="50" y2="96" stroke="#00C2A8" strokeWidth="1.8" strokeDasharray="3 4" />
      <circle cx="50" cy="42" r="6" fill={S.sinal} />
    </svg>
  );
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Isotipo size={34} />
      <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontStretch: "72%", fontSize: 32, letterSpacing: ".02em", lineHeight: 1, color: "#FFFFFF" }}>
        S<span style={{ color: S.sinal }}>O</span>NDA
      </span>
    </div>
  );
}

// ——— estados de carga/erro (a costura também aparece aqui) ———
function Estado({ carregando, erro, vazio, vazioMsg = "Nenhum dado para exibir.", children }) {
  if (carregando) return <div role="status"><Mono cor={S.mudo}>Consultando a API…</Mono></div>;
  if (erro) return <div role="alert"><Mono cor={S.sinalTxt}>Não foi possível obter os dados: {erro}</Mono></div>;
  if (vazio) return <Mono cor={S.mudo}>{vazioMsg}</Mono>;
  return children;
}

const mensagem = (e) => String(e?.message || e);

// falha de uma ação do usuário (executar, bifurcar…): visível e anunciada, nunca silenciosa.
function Falha({ erro }) {
  if (!erro) return null;
  return <div role="alert"><Mono cor={S.sinalTxt}>⚠ {erro}</Mono></div>;
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
      <div role="alert" style={{ background: S.papel, border: `1px solid ${S.sinal}`, borderRadius: 8, padding: "18px 20px" }}>
        <Mono cor={S.sinalTxt}>⚠ esta visão falhou ao carregar — {mensagem(this.state.erro)}</Mono>
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
    return Promise.resolve().then(fn).then(setEnv).catch((e) => setErro(mensagem(e))).finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { recarregar(); }, [recarregar]);
  return { env, erro, carregando, recarregar };
}

// ============ PAINEL: séries anuais de duas bases sobre o único eixo comum (o ano) ============
const FONTE_UI = "'Archivo',sans-serif";
const FONTE_NUM = "'IBM Plex Mono',monospace";
const DOMINIO = {
  fomento_fsa: "Fomento direto",
  renuncia_fiscal: "Fomento indireto",
  publico_obras_brasileiras: "Demanda",
  salas_abertas: "Oferta de salas",
  preco_ingresso: "Preço",
};
const CASAS = { fomento_fsa: 1, renuncia_fiscal: 1, publico_obras_brasileiras: 2, salas_abertas: 0, preco_ingresso: 2 };
const ROTULO_BASE = { fsa: "■ fsa.db", ridab: "▲ RIDAB" };
const HACHURA_VAZIO = `repeating-linear-gradient(135deg, ${S.hachura} 0 1px, transparent 1px 6px)`;

const fmtNum = (v, d) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));

// ano de leitura inicial: o mais recente em que ao menos quatro séries têm dado.
function anoPadrao(series, anos) {
  for (let i = anos.length - 1; i >= 0; i--) {
    if (series.filter((s) => s.dados[i]?.valor != null).length >= 4) return anos[i];
  }
  return anos[anos.length - 1];
}

function TituloSecao({ id, children }) {
  return (
    <h2 id={id} style={{ margin: 0, fontFamily: FONTE_UI, fontWeight: 800, fontStretch: "68%", textTransform: "uppercase", fontSize: 30, lineHeight: 1, letterSpacing: ".01em", color: S.tinta }}>
      {children}
    </h2>
  );
}

// ——— blocos comuns das telas: título curto, ressalvas sob demanda, download e citação ———
function baixarCSV(nome, cabecalho, linhas) {
  const cel = (v) => (v == null ? "" : /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const texto = [cabecalho, ...linhas].map((l) => l.map(cel).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const BTN_LEVE = { minHeight: 44, padding: "0 14px", border: `1px solid ${S.tinta}`, background: S.papel, color: S.tinta, fontFamily: FONTE_UI, fontWeight: 600, fontSize: 14.5, cursor: "pointer" };

function TituloTela({ titulo, sub, children }) {
  return (
    <header style={{ display: "flex", flexWrap: "wrap", gap: "16px 40px", alignItems: "flex-end", justifyContent: "space-between" }}>
      <div style={{ flex: "1 1 420px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ margin: 0, fontWeight: 800, fontStretch: "68%", fontSize: "clamp(30px, 4.4vw, 46px)", lineHeight: 1.05, letterSpacing: "-.005em" }}>{titulo}</h1>
        {sub && <p style={{ margin: 0, maxWidth: 760, fontSize: 16, lineHeight: 1.5, color: S.mudo }}>{sub}</p>}
      </div>
      {children && <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>{children}</div>}
    </header>
  );
}

// ressalvas: a um clique de cada número, sem ocupar a página (o asterisco continua lá).
function Notas({ itens, rotulo = "Ressalvas" }) {
  const lista = (itens || []).filter(Boolean);
  if (!lista.length) return null;
  return (
    <details style={{ fontSize: 14.5, lineHeight: 1.5 }}>
      <summary style={{ cursor: "pointer", minHeight: 44, display: "inline-flex", alignItems: "center", color: S.sonar, fontWeight: 600 }}>{rotulo} ({lista.length})</summary>
      <ul style={{ margin: "4px 0 8px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
        {lista.map((r, i) => <li key={i}>{r}</li>)}
      </ul>
    </details>
  );
}

function CopiarCitacao({ texto }) {
  const [msg, setMsg] = useState("");
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setMsg("Citação copiada."); }
    catch { setMsg(texto); }
  };
  return (
    <>
      <button type="button" onClick={copiar} style={BTN_LEVE}>Copiar citação</button>
      <span role="status" style={{ fontSize: 13.5, color: S.mudo }}>{msg}</span>
    </>
  );
}
const hoje = () => new Date().toLocaleDateString("pt-BR");

// ============ INDICADORES · séries anuais (FSA e RIDAB), um gráfico por série ============
const COR_BASE = { fsa: S.tinta, ridab: S.sonar };
const NOME_BASE_CURTO = { fsa: "FSA", ridab: "RIDAB" };
const compacto = (v) => (v === 0 ? "0" : v >= 1000 ? `${fmtNum(v / 1000, v >= 10000 ? 0 : 1)} mil` : fmtNum(v, v < 10 ? 1 : 0));

function CartaoSerie({ s, anos, ano, aoAno }) {
  const casas = CASAS[s.id] ?? 1;
  const idx = anos.indexOf(ano);
  const d = s.dados[idx];
  const ant = idx > 0 ? s.dados[idx - 1]?.valor : null;
  const max = Math.max(0, ...s.dados.map((x) => x.valor ?? 0)) || 1;
  const cor = COR_BASE[s.base] || S.tinta;
  const W = 560, H = 190, E = 66, D = 8, T = 10, B = 26;
  const larg = (W - E - D) / anos.length;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let delta = null;
  if (d?.valor != null && ant != null && ant !== 0) {
    const dd = (d.valor / ant - 1) * 100;
    delta = `${dd >= 0 ? "▲" : "▼"} ${fmtNum(Math.abs(dd), 0)}% sobre ${anos[idx - 1]}`;
  }
  const csv = () => baixarCSV(`sonda_${s.id}.csv`, ["serie", "base", "unidade", "ano", "valor", "n_registros", "parcial"],
    s.dados.map((x) => [s.titulo, s.base, s.unidade, x.ano, x.valor, x.n, x.parcial ? "sim" : ""]));
  return (
    <article style={{ border: `1px solid ${S.linha}`, borderTop: `4px solid ${cor}`, padding: "16px 18px 8px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>{s.titulo}</h2>
          <span style={{ fontSize: 14, color: S.mudo }}>{s.unidade} · fonte: {NOME_BASE_CURTO[s.base] || s.base}</span>
        </div>
        <div style={{ textAlign: "right", flex: "0 0 auto" }}>
          <div style={{ fontFamily: FONTE_NUM, fontSize: 28, fontWeight: 600, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{d?.valor == null ? "sem dado" : fmtNum(d.valor, casas)}</div>
          <div style={{ fontSize: 13.5, color: S.mudo }}>em {ano}{d?.parcial ? " (ano parcial)" : ""}{delta ? ` · ${delta}` : ""}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.titulo}, ${s.unidade}, de ${s.cobertura.de} a ${s.cobertura.ate}. Em ${ano}: ${d?.valor == null ? "sem dado" : fmtNum(d.valor, casas)}.`}
        style={{ width: "100%", height: "auto", display: "block" }} onMouseLeave={() => aoAno(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={E} x2={W - D} y1={y(max * f)} y2={y(max * f)} stroke={f === 0 ? S.tinta : S.linha} strokeWidth={f === 0 ? 1.5 : 1} />
            <text x={E - 8} y={y(max * f) + 4} textAnchor="end" fontFamily="'IBM Plex Mono',monospace" fontSize="12" fill={S.mudo}>{compacto(max * f)}</text>
          </g>
        ))}
        {s.dados.map((x, i) => {
          const sel = x.ano === ano;
          const x0 = E + i * larg;
          return (
            <g key={x.ano} onMouseEnter={() => aoAno(x.ano)} onClick={() => aoAno(x.ano)} style={{ cursor: "pointer" }}>
              <rect x={x0} y={T} width={larg} height={H - T - B} fill={sel ? S.painel : "transparent"} />
              {x.valor == null
                ? <line x1={x0 + larg * 0.3} x2={x0 + larg * 0.7} y1={H - B - 5} y2={H - B - 5} stroke={S.hachura} strokeWidth="2" strokeDasharray="2 2" />
                : <rect x={x0 + larg * 0.16} width={larg * 0.68} y={Math.min(y(x.valor), H - B - 2)} height={Math.max(2, H - B - y(x.valor))} fill={sel ? S.sinal : cor} opacity={x.parcial && !sel ? 0.45 : 1} />}
              {(i % 3 === 0 || sel) && <text x={x0 + larg / 2} y={H - 8} textAnchor="middle" fontFamily="'IBM Plex Mono',monospace" fontSize="12" fontWeight={sel ? 700 : 400} fill={sel ? S.sinalTxt : S.mudo}>{sel || i % 3 === 0 ? x.ano : ""}</text>}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}><Notas itens={s.ressalvas} /></div>
        <button type="button" onClick={csv} style={{ ...BTN_LEVE, border: "none", padding: 0, color: S.sonar, textDecoration: "underline" }}>Baixar CSV</button>
      </div>
    </article>
  );
}

function Investimento() {
  const [moeda, setMoeda] = useState("real");
  const [fixo, setFixo] = useState(null);      // ano escolhido na lista
  const [sobre, setSobre] = useState(null);    // ano sob o cursor
  const { env, erro, carregando } = useEnvelope(() => SondaAPI.series({ de: 2009, ate: 2026, moeda }), [moeda]);
  const anos = env?.dados?.anos || [];
  const series = env?.dados?.series || [];
  const ano = sobre ?? fixo ?? (series.length ? anoPadrao(series, anos) : null);
  const prov = Array.isArray(env?.proveniencia) ? env.proveniencia : [];
  const citacao = `SONDA — Observatório de Dados e Políticas do Audiovisual (UFF). Séries anuais do audiovisual brasileiro, 2009–2026. Fontes: ${prov.map((p) => `${p.fonte} (versão ${String(p.instancia_versao).slice(0, 12)})`).join("; ")}. Consultado em ${hoje()}.`;
  const csvTudo = () => baixarCSV("sonda_series_anuais.csv", ["serie", "base", "unidade", "ano", "valor", "n_registros", "parcial"],
    series.flatMap((s) => s.dados.map((x) => [s.titulo, s.base, s.unidade, x.ano, x.valor, x.n, x.parcial ? "sim" : ""])));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONTE_UI }}>
      <TituloTela titulo="Quanto se investe e quanto se vê" sub="Cinco séries anuais do audiovisual brasileiro. Passe o cursor sobre um ano para comparar as séries.">
        <SeletorMoeda moeda={moeda} aoMudar={setMoeda} />
      </TituloTela>

      <Estado carregando={carregando && !env} erro={erro} vazio={series.length === 0} vazioMsg="Nenhuma série disponível no momento.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", alignItems: "center", fontSize: 14.5 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>Ano
              <select value={ano ?? ""} onChange={(e) => setFixo(parseInt(e.target.value, 10))} style={{ minHeight: 44, border: `1px solid ${S.tinta}`, background: S.papel, padding: "0 10px", fontFamily: FONTE_UI, fontSize: 15 }}>
                {anos.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            {Object.entries(NOME_BASE_CURTO).map(([k, n]) => (
              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span aria-hidden="true" style={{ width: 12, height: 12, background: COR_BASE[k], display: "inline-block" }} />{n}</span>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button type="button" onClick={csvTudo} style={BTN_LEVE}>Baixar tudo (CSV)</button>
            <CopiarCitacao texto={citacao} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(460px, 100%), 1fr))", gap: 20 }}>
          {series.map((s) => <CartaoSerie key={s.id} s={s} anos={anos} ano={ano} aoAno={setSobre} />)}
        </div>
      </Estado>
    </div>
  );
}

// ============ TERRITÓRIO: fomento do FSA e salas de exibição, por UF ============
// Cartograma de quadrados iguais: indica posição, não área. [coluna, linha] em grade 7 × 8.
const GRADE = {
  RR: [3, 1], AP: [5, 1],
  AM: [2, 2], PA: [4, 2], MA: [5, 2], CE: [6, 2], RN: [7, 2],
  AC: [1, 3], RO: [2, 3], MT: [3, 3], TO: [4, 3], PI: [5, 3], PE: [6, 3], PB: [7, 3],
  MS: [3, 4], GO: [4, 4], BA: [5, 4], AL: [6, 4], SE: [7, 4],
  DF: [4, 5], MG: [5, 5], ES: [6, 5],
  SP: [5, 6], RJ: [6, 6],
  PR: [5, 7],
  RS: [4, 8], SC: [5, 8],
};
// rampas monotônicas em luminosidade: a ordem se lê sem depender do matiz.
const RAMPA_FOMENTO = ["#ECEEF0", "#C3C8CE", "#8C939C", "#4A5058", "#0B0D10"];
const RAMPA_SALAS = ["#E4F3F0", "#A6DCD3", "#4DB8A8", "#00796B", "#00443C"];
const TEXTO_RAMPA = [S.tinta, S.tinta, S.tinta, "#FFFFFF", "#FFFFFF"];
const binFomento = (v) => (v < 10 ? 0 : v < 30 ? 1 : v < 100 ? 2 : v < 300 ? 3 : 4);
const binSalas = (v) => (v < 1 ? 0 : v < 1.5 ? 1 : v < 2 ? 2 : v < 2.5 ? 3 : 4);
const HACHURA_VERIFICAR = `repeating-linear-gradient(135deg, ${S.hachura} 0 1px, ${S.papel} 1px 5px)`;

function SeletorMoeda({ moeda, aoMudar }) {
  const b = (valor, rotulo, primeiro) => (
    <button type="button" onClick={() => aoMudar(valor)} aria-pressed={moeda === valor}
      style={{ minHeight: 44, padding: "0 18px", border: `2px solid ${S.tinta}`, borderRight: primeiro ? "none" : `2px solid ${S.tinta}`, background: moeda === valor ? S.tinta : S.papel, color: moeda === valor ? S.papel : S.tinta, fontFamily: FONTE_UI, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
      {rotulo}
    </button>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 16px" }}>
      <span id="rot-moeda-t" style={{ fontSize: 14.5, color: S.mudo }}>Valores em</span>
      <div role="group" aria-labelledby="rot-moeda-t" style={{ display: "flex" }}>
        {b("nominal", "R$ correntes", true)}
        {b("real", "R$ de 2024 (IPCA)", false)}
      </div>
    </div>
  );
}

function MapaUF({ titulo, subtitulo, ufs, ufSel, aoSel, texto, cor, legenda }) {
  return (
    <div style={{ flex: "0 0 374px", maxWidth: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>
        {titulo}<br /><span style={{ color: S.mudo, fontWeight: 400, fontSize: 14.5 }}>{subtitulo}</span>
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 50px)", gridTemplateRows: "repeat(8, 50px)", gap: 4 }}>
        {ufs.map((u) => {
          const pos = GRADE[u.sigla];
          if (!pos) return null;
          const c = cor(u);
          return (
            <button key={u.sigla} type="button" tabIndex={-1} onClick={() => aoSel(u.sigla)} onMouseEnter={() => aoSel(u.sigla)}
              aria-label={`${u.nome}: ${texto(u).aria}`}
              style={{ gridColumn: pos[0], gridRow: pos[1], background: c.bg, color: c.fg, boxShadow: u.sigla === ufSel ? `inset 0 0 0 4px ${S.sinal}` : "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, fontFamily: FONTE_NUM, lineHeight: 1.05 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{u.sigla}</span>
              <span style={{ fontSize: 12 }}>{texto(u).curto}</span>
            </button>
          );
        })}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "6px 14px", fontFamily: FONTE_NUM, fontSize: 12, color: S.tinta }}>
        {legenda.map((l) => (
          <li key={l.rotulo} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ width: 14, height: 14, display: "inline-block", boxSizing: "border-box", background: l.cor, border: `1px solid ${S.linha}` }} />{l.rotulo}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Territorio() {
  const [moeda, setMoeda] = useState("real");
  const [uf, setUf] = useState("RJ");
  const { env, erro, carregando } = useEnvelope(() => SondaAPI.territorio({ moeda }), [moeda]);
  const d = env?.dados;
  const ufs = d?.ufs || [];
  const sel = ufs.find((u) => u.sigla === uf) || ufs[0];
  const conc = d?.concentracao;
  const ressalvas = d?.ressalvas || [];
  const unidade = d?.unidade || "";

  const X = (v) => 48 + (v / 35) * 380;
  const Y = (v) => 388 - (v / 35) * 376;
  const linhaDl = (rotulo, valor) => (
    <React.Fragment key={rotulo}>
      <dt style={{ color: S.tinta, fontSize: 15 }}>{rotulo}</dt>
      <dd style={{ margin: 0, fontFamily: FONTE_NUM, fontWeight: 600, fontSize: 17, textAlign: "right" }}>{valor}</dd>
    </React.Fragment>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONTE_UI }}>
      <TituloTela
        titulo={conc ? <>{conc.ufs.join(" e ")} têm <span style={{ color: S.sinalTxt }}>{fmtNum(conc.parte_salas, 0)}%</span> das salas e <span style={{ color: S.sinalTxt }}>{fmtNum(conc.parte_fomento, 0)}%</span> do fomento</> : "Onde está o fomento e onde estão as salas"}
        sub="Fomento do FSA de 2009 a 2024, pela UF da produtora, e salas de cinema por habitante. Clique numa UF para ver os números.">
        <SeletorMoeda moeda={moeda} aoMudar={setMoeda} />
        <button type="button" style={BTN_LEVE} onClick={() => baixarCSV("sonda_territorio.csv",
          ["uf", "nome", "contratos", `fomento_${unidade}`, "parte_fomento_%", "salas", "parte_salas_%", "populacao", "salas_por_100mil", "fomento_por_habitante_R$", "verificar"],
          ufs.map((u) => [u.sigla, u.nome, u.contratos, u.fomento_mi, u.parte_fomento, u.salas, u.parte_salas, u.populacao, u.salas_por_100mil, u.fomento_por_habitante, u.verificar]))}>Baixar CSV</button>
      </TituloTela>

      <Estado carregando={carregando} erro={erro} vazio={!sel} vazioMsg="Nenhum dado territorial disponível. Verifique se a base FSA está instalada.">
        {sel && (
          <section style={{ display: "flex", flexWrap: "wrap", gap: "40px 56px", alignItems: "flex-start" }}>
            <div style={{ flex: "0 1 788px", minWidth: 0, display: "flex", flexWrap: "wrap", gap: "36px 40px", alignItems: "flex-start" }}>
              <MapaUF titulo="Fomento do FSA" subtitulo={unidade} ufs={ufs} ufSel={sel.sigla} aoSel={setUf}
                texto={(u) => ({ curto: fmtNum(u.fomento_mi, 0), aria: `${fmtNum(u.fomento_mi, 1)} ${unidade} de fomento` })}
                cor={(u) => ({ bg: RAMPA_FOMENTO[binFomento(u.fomento_mi)], fg: TEXTO_RAMPA[binFomento(u.fomento_mi)] })}
                legenda={[["<10", 0], ["10–30", 1], ["30–100", 2], ["100–300", 3], ["≥300", 4]].map(([rotulo, i]) => ({ rotulo, cor: RAMPA_FOMENTO[i] }))} />
              <MapaUF titulo="Salas por 100 mil habitantes" subtitulo={`média nacional: ${fmtNum(d.media_nacional_salas_100mil, 2)}`} ufs={ufs} ufSel={sel.sigla} aoSel={setUf}
                texto={(u) => (u.verificar ? { curto: "?", aria: "população a verificar" } : { curto: fmtNum(u.salas_por_100mil, 2), aria: `${fmtNum(u.salas_por_100mil, 2)} salas por 100 mil habitantes` })}
                cor={(u) => (u.verificar ? { bg: HACHURA_VERIFICAR, fg: S.tinta } : { bg: RAMPA_SALAS[binSalas(u.salas_por_100mil)], fg: TEXTO_RAMPA[binSalas(u.salas_por_100mil)] })}
                legenda={[["<1,0", 0], ["1,0–1,5", 1], ["1,5–2,0", 2], ["2,0–2,5", 3], ["≥2,5", 4]].map(([rotulo, i]) => ({ rotulo, cor: RAMPA_SALAS[i] })).concat([{ rotulo: "a verificar", cor: HACHURA_VERIFICAR }])} />
            </div>

            <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="uf-sel" style={{ fontSize: 14.5, color: S.mudo }}>UF</label>
                <select id="uf-sel" value={sel.sigla} onChange={(e) => setUf(e.target.value)} style={{ minHeight: 48, border: `2px solid ${S.tinta}`, background: S.papel, padding: "0 12px", fontFamily: FONTE_UI, fontWeight: 600, fontSize: 16, color: S.tinta }}>
                  {ufs.map((u) => <option key={u.sigla} value={u.sigla}>{u.sigla} · {u.nome}</option>)}
                </select>
              </div>

              <div style={{ borderTop: `4px solid ${S.tinta}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                  <span style={{ fontWeight: 800, fontStretch: "62%", fontSize: 104, lineHeight: 0.82, color: S.sinal }}>{sel.sigla}</span>
                  <span style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.2 }}>{sel.nome}</span>
                </div>
                <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr auto", gap: "10px 16px", alignItems: "baseline" }}>
                  {linhaDl(`Fomento FSA, ${unidade}`, fmtNum(sel.fomento_mi, 1))}
                  {linhaDl("Parte do fomento do país", `${fmtNum(sel.parte_fomento, 1)}%`)}
                  {linhaDl("Contratos", fmtNum(sel.contratos, 0))}
                  {linhaDl("Fomento por habitante, R$", fmtNum(sel.fomento_por_habitante, 1))}
                  {linhaDl("Salas", fmtNum(sel.salas, 0))}
                  {linhaDl("Parte das salas do país", `${fmtNum(sel.parte_salas, 1)}%`)}
                  {linhaDl("Salas por 100 mil hab.", sel.verificar ? `${fmtNum(sel.salas_por_100mil, 2)} (a verificar)` : fmtNum(sel.salas_por_100mil, 2))}
                </dl>
                {sel.verificar && (
                  <p role="note" style={{ margin: 0, border: `2px solid ${S.sinalTxt}`, padding: "12px 14px", fontSize: 14.5, lineHeight: 1.45 }}>
                    <strong style={{ color: S.sinalTxt }}>A verificar.</strong> {sel.verificar}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>
                  Parte das salas × parte do fomento<br /><span style={{ color: S.mudo, fontWeight: 400, fontSize: 14.5 }}>acima da diagonal: mais fomento que salas</span>
                </h2>
                <svg viewBox="0 0 440 420" role="img" aria-label="Dispersão da parte das salas do país (eixo horizontal) contra a parte do fomento (eixo vertical), por UF." style={{ width: "100%", maxWidth: 440, height: "auto", display: "block" }}>
                  <g stroke={S.linha} strokeWidth="1">
                    {[0, 10, 20, 30].map((v) => <line key={`h${v}`} x1="48" y1={Y(v)} x2="428" y2={Y(v)} />)}
                    {[10, 20, 30].map((v) => <line key={`v${v}`} x1={X(v)} y1="12" x2={X(v)} y2="388" />)}
                  </g>
                  <line x1="48" y1="388" x2="428" y2="12" stroke={S.sonar} strokeWidth="2" strokeDasharray="6 5" />
                  <g fontFamily="'IBM Plex Mono',monospace" fontSize="12" fill={S.mudo}>
                    {[0, 10, 20, 30].map((v) => <text key={`ty${v}`} x="40" y={Y(v) + 4} textAnchor="end">{v === 0 ? "0" : `${v}%`}</text>)}
                    {[0, 10, 20, 30].map((v) => <text key={`tx${v}`} x={X(v)} y="408" textAnchor="middle">{v === 0 ? "0" : `${v}%`}</text>)}
                  </g>
                  {ufs.map((u) => (
                    <circle key={u.sigla} cx={X(u.parte_salas)} cy={Y(u.parte_fomento)} r={u.sigla === sel.sigla ? 9 : 6} fill={u.sigla === sel.sigla ? S.sinal : S.tinta} stroke={S.papel} strokeWidth="2"
                      onMouseEnter={() => setUf(u.sigla)} onClick={() => setUf(u.sigla)} style={{ cursor: "pointer" }} />
                  ))}
                  {ufs.filter((u) => u.sigla === sel.sigla || conc?.ufs.includes(u.sigla)).map((u) => (
                    <text key={`l${u.sigla}`} x={X(u.parte_salas) + 11} y={Y(u.parte_fomento) - 8} fontFamily="'IBM Plex Mono',monospace" fontSize="13" fontWeight="600" fill={u.sigla === sel.sigla ? S.sinalTxt : S.tinta}>{u.sigla}</text>
                  ))}
                </svg>
              </div>
            </div>
          </section>
        )}

        <Notas itens={ressalvas} />
      </Estado>
    </div>
  );
}

// ============ LIGAÇÕES: do contrato do FSA à obra e à bilheteria ============
const CHAVES_COLUNAS = ["Tabela", "CNPJ", "CPB", "Nº contrato", "SALIC", "Município", "Ano"];
// Verificado em 2026-11-02 sobre a fsa.db e o RIDAB@6c5e6ae (docs/RIDAB_INVENTARIO.md).
const CHAVES = [
  ["■ FSA · contratos", "● sim", null, "○ não", "○ não", "± só nome", "● DOU"],
  ["■ FSA · ponte contrato↔CPB", "○ não", "● sim", "● sim", "○ não", "○ não", "○ não"],
  ["■ FSA · bilheteria (conj. 28)", "● distribuidora", "● sim", "○ não", "○ não", "○ não", "● lançamento"],
  ["▲ RIDAB · agentes econômicos", "● sim", "○ não", "○ não", "○ não", "● código IBGE", "● registro"],
  ["▲ RIDAB · renúncia fiscal", "● sim", "○ não", "○ não", "● sim", "± só nome", "● aprovação"],
  ["▲ RIDAB · obras com fomento indireto", "○ não", "● sim", "○ não", "● sim", "○ não", "○ não"],
  ["▲ RIDAB · projetos FSA", "● sim", "○ não", "○ não", "○ não", "○ não", "● DOU"],
];

function Salto({ n, tipo, titulo, chave, fonte, children, ausente }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 40px", padding: "28px 0", borderBottom: ausente ? `2px solid ${S.tinta}` : `1px solid ${S.linha}` }}>
      <div style={{ flex: "0 0 260px", maxWidth: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: ausente ? S.sinalTxt : S.mudo }}>{tipo}</span>
        <h2 style={{ margin: 0, fontWeight: 700, fontSize: 24, lineHeight: 1.15 }}>{titulo}</h2>
        <span style={{ fontSize: 14.5, color: S.mudo }}>{chave}</span>
      </div>
      <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

function Segmento({ peso, fundo, cor, grande, pequeno, hachura }) {
  return (
    <div style={{ flex: `${peso} 1 0`, minWidth: 0, background: fundo, color: cor, display: "flex", flexDirection: "column", justifyContent: "center", padding: peso < 3 ? 0 : "0 16px", fontFamily: FONTE_NUM }}>
      {grande && (hachura
        ? <span style={{ alignSelf: "flex-start", background: S.papel, color: S.tinta, padding: "0 8px" }}><span style={{ fontSize: 22, fontWeight: 600 }}>{grande}</span> <span style={{ fontSize: 13 }}>{pequeno}</span></span>
        : <><span style={{ fontSize: 22, fontWeight: 600 }}>{grande}</span><span style={{ fontSize: 13 }}>{pequeno}</span></>)}
    </div>
  );
}

function Ligacoes({ ir }) {
  const { env, erro, carregando } = useEnvelope(() => SondaAPI.funil());
  const d = env?.dados;
  const seg = d?.salto_contrato_obra?.segmentos;
  const ob = d?.salto_obra_bilheteria;
  const metodos = d?.salto_contrato_obra?.metodos || [];
  const nMetodo = (m) => metodos.filter((x) => x.metodo === m).reduce((s, x) => s + x.contratos, 0);
  const porAno = d?.por_ano || [];
  const maxChamada = Math.max(1, ...(d?.por_chamada || []).map((c) => c.sem_obra));
  const ausente = d?.elo_ausente;
  const f0 = (v) => fmtNum(v, 0);
  const f1 = (v) => fmtNum(v, 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONTE_UI }}>
      <TituloTela
        titulo={seg ? <><span style={{ color: S.sinalTxt }}>{f0(seg.sem_obra.parte)}%</span> dos contratos do FSA ainda não têm obra identificada</> : "O que chega às telas"}
        sub={d?.contratos ? `Do contrato à obra, e da obra à bilheteria: ${f0(d.contratos.total)} contratos do FSA, R$ ${fmtNum(d.contratos.valor_mi / 1000, 2)} bi em valores correntes.` : null}>
        {d && <button type="button" style={BTN_LEVE} onClick={() => baixarCSV("sonda_contratos_sem_obra_por_ano.csv", ["ano", "contratos", "sem_obra", "parte_sem_obra_%"], porAno.map((a) => [a.ano, a.contratos, a.sem_obra, a.parte_sem_obra]))}>Baixar CSV</button>}
      </TituloTela>

      <Estado carregando={carregando} erro={erro} vazio={!d} vazioMsg="Nenhum dado disponível. Verifique se a base FSA está instalada.">
        {d && (
          <>
            <section aria-label="Os três saltos" style={{ display: "flex", flexDirection: "column" }}>
              <Salto tipo="Etapa 1" titulo="Do contrato à obra" chave="ligados pelo número do contrato ou pelo título">
                <div style={{ display: "flex", height: 76, border: `2px solid ${S.tinta}` }}>
                  <Segmento peso={seg.seguro.parte} fundo={S.tinta} cor="#FFFFFF" grande={f0(seg.seguro.contratos)} pequeno={`com obra · ${f1(seg.seguro.parte)}%`} />
                  <Segmento peso={Math.max(seg.ambiguo.parte, 0.4)} fundo={`repeating-linear-gradient(135deg, ${S.tinta} 0 2px, ${S.papel} 2px 5px)`} />
                  <Segmento peso={seg.sem_obra.parte} fundo={S.sinal} cor={S.tinta} grande={f0(seg.sem_obra.contratos)} pequeno={`sem obra · ${f1(seg.sem_obra.parte)}%`} />
                </div>
                <Notas rotulo="Como a ligação é feita" itens={[
                  `${f0(nMetodo("num_contrato"))} contratos ligam pelo número do contrato (confiança 1,00) e ${f0(nMetodo("titulo"))} pelo título único (0,95).`,
                  `Os ${f0(seg.ambiguo.contratos)} de título ambíguo (0,60) ficam fora das análises até triagem manual.`,
                  `Em R$ mi correntes: com obra ${fmtNum(seg.seguro.valor_mi, 1)}; título ambíguo ${fmtNum(seg.ambiguo.valor_mi, 1)}; sem obra ${fmtNum(seg.sem_obra.valor_mi, 1)}.`,
                ]} />
              </Salto>

              <Salto tipo="Etapa 2" titulo="Da obra à bilheteria" chave="ligadas pelo certificado da obra (CPB)">
                <div style={{ display: "flex", height: 76, border: `2px solid ${S.tinta}` }}>
                  <Segmento peso={ob.parte_com_bilheteria} fundo={S.tinta} cor="#FFFFFF" grande={f0(ob.com_bilheteria)} pequeno={`com bilheteria · ${f1(ob.parte_com_bilheteria)}%`} />
                  <Segmento peso={100 - ob.parte_com_bilheteria} fundo={HACHURA_VAZIO} grande={f0(ob.sem_bilheteria)} pequeno={`sem bilheteria · ${f1(100 - ob.parte_com_bilheteria)}%`} hachura />
                </div>
                <Notas rotulo="Por que há obras sem bilheteria" itens={[
                  `De ${f0(ob.obras_com_vinculo_seguro)} obras identificadas, ${f0(ob.com_bilheteria)} constam na base de bilheteria da ANCINE, que só registra cinema.`,
                  "Hipótese para as demais, não verificada: obras de TV ou de vídeo sob demanda, ou ainda sem lançamento em sala.",
                ]} />
              </Salto>

              <Salto tipo="Etapa 3 · falta uma base" titulo="Da obra ao município de exibição" chave="nenhuma base reunida aqui responde a isto" ausente>
                <div style={{ border: `2px dashed ${S.sinalTxt}`, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <p style={{ margin: 0, fontSize: 20, lineHeight: 1.3, fontWeight: 700 }}>{ausente.pergunta}</p>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
                    Base candidata: {ausente.candidato.base}, tabela de bilheteria por município, filme e ano ({f0(ausente.candidato.linhas)} linhas). {ausente.candidato.observacao}
                  </p>
                  <button type="button" onClick={() => ir("cruzar/encadear")} style={{ alignSelf: "flex-start", minHeight: 44, padding: "0 20px", border: `2px solid ${S.tinta}`, background: S.papel, color: S.tinta, fontFamily: FONTE_UI, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Ver em Cruzar bases →</button>
                </div>
              </Salto>
            </section>

            <section style={{ display: "flex", flexWrap: "wrap", gap: "40px 56px", alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Contratos sem obra, por ano (%)</h2>
                <div role="img" aria-label={`Porcentagem de contratos sem obra, de ${porAno[0]?.ano} a ${porAno[porAno.length - 1]?.ano}.`} style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 260, borderBottom: `2px solid ${S.tinta}`, paddingTop: 8 }}>
                  {porAno.map((a) => (
                    <div key={a.ano} style={{ flex: "1 1 0", minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                      <span style={{ fontFamily: FONTE_NUM, fontSize: 12, fontWeight: 600, color: a.parte_sem_obra >= 60 ? S.sinalTxt : S.tinta }}>{f1(a.parte_sem_obra)}</span>
                      <span style={{ width: "100%", height: `${(a.parte_sem_obra / 75) * 100}%`, background: a.parte_sem_obra >= 60 ? S.sinal : S.tinta, display: "block" }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4, fontFamily: FONTE_NUM, fontSize: 12, color: S.mudo, textAlign: "center" }}>
                  {porAno.map((a) => <div key={a.ano} style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column" }}><span style={{ color: S.tinta, fontWeight: 500 }}>{a.ano}</span><span>{a.contratos}</span></div>)}
                </div>
                <p style={{ margin: 0, fontSize: 14, color: S.mudo }}>Sob cada ano, o número de contratos. Contratos recentes podem ser de obras ainda não lançadas.</p>
              </div>

              <div style={{ flex: "1 1 440px", minWidth: 0, display: "flex", flexDirection: "column", gap: 32 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Chamadas com mais contratos sem obra</h2>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                    {d.por_chamada.map((c) => (
                      <li key={c.chamada} style={{ display: "grid", gridTemplateColumns: "140px 1fr 96px", gap: 12, alignItems: "center", fontSize: 14.5 }}>
                        <span style={{ fontWeight: 600 }}>{c.chamada}</span>
                        <span aria-hidden="true" style={{ display: "block", height: 18, width: `${(c.sem_obra / maxChamada) * 100}%`, background: S.tinta }} />
                        <span style={{ fontFamily: FONTE_NUM, fontWeight: 600, textAlign: "right" }}>{f0(c.sem_obra)} · {f0(c.parte_sem_obra)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Maiores contratos sem obra</h2>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420, fontSize: 14.5 }}>
                      <caption style={{ textAlign: "left", fontSize: 13.5, color: S.mudo, paddingBottom: 8 }}>Em R$ mi correntes.</caption>
                      <thead><tr style={{ borderBottom: `2px solid ${S.tinta}` }}>{["Projeto", "Proponente", "UF", "Ano", "R$ mi"].map((h) => <th key={h} scope="col" style={{ textAlign: "left", padding: "8px 12px 8px 0", fontWeight: 700 }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {d.maiores_sem_obra.map((m) => (
                          <tr key={m.projeto} style={{ borderBottom: `1px solid ${S.linha}` }}>
                            <th scope="row" style={{ textAlign: "left", fontWeight: 600, padding: "8px 12px 8px 0" }}>{m.projeto}</th>
                            <td style={{ padding: "8px 12px 8px 0" }}>{m.proponente}</td>
                            <td style={{ padding: "8px 12px 8px 0", fontFamily: FONTE_NUM }}>{m.uf || "sem UF"}</td>
                            <td style={{ padding: "8px 12px 8px 0", fontFamily: FONTE_NUM }}>{m.ano}</td>
                            <td style={{ padding: "8px 0", fontFamily: FONTE_NUM }}>{fmtNum(m.valor_mi, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            <Notas itens={d.ressalvas} />
          </>
        )}
      </Estado>
    </div>
  );
}

// ============ CRUZAR · o que cruza com o quê (chaves de cada tabela) ============
function Chaves() {
  const { env } = useEnvelope(() => SondaAPI.funil());
  const parte = env?.dados?.salto_contrato_obra?.segmentos?.seguro?.parte;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONTE_UI }}>
      <TituloTela titulo="O que cruza com o quê" sub="Duas tabelas só se cruzam se tiverem um identificador em comum. ● tem · ± tem em parte · ○ não tem." />
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860, fontSize: 15 }}>
          <caption style={{ position: "absolute", left: -9999 }}>Identificadores presentes em cada tabela</caption>
          <thead><tr style={{ borderBottom: `2px solid ${S.tinta}` }}>{CHAVES_COLUNAS.map((h) => <th key={h} scope="col" style={{ textAlign: "left", padding: "10px 12px 10px 0", fontWeight: 700 }}>{h}</th>)}</tr></thead>
          <tbody style={{ fontFamily: FONTE_NUM, fontSize: 14 }}>
            {CHAVES.map((linha) => (
              <tr key={linha[0]} style={{ borderBottom: `1px solid ${S.linha}` }}>
                <th scope="row" style={{ textAlign: "left", fontFamily: FONTE_UI, fontSize: 15, fontWeight: 600, padding: "12px 12px 12px 0" }}>{linha[0]}</th>
                {linha.slice(1).map((c, j) => <td key={j} style={{ padding: "12px 12px 12px 0" }}>{c ?? (parte == null ? "±" : `± ${fmtNum(parte, 1)}%`)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 40px" }}>
        {[["91,5%", "dos contratos do FSA ganham o município da produtora, pelo CNPJ (4.094 de 4.473)."],
          ["89,1%", "das obras com incentivo fiscal ganham o valor captado, pelo número SALIC (2.780 de 3.120)."]].map(([n, x]) => (
          <div key={n} style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: FONTE_NUM, fontSize: 30, fontWeight: 600, lineHeight: 1.05 }}>{n}</span>
            <span style={{ fontSize: 14.5, lineHeight: 1.45 }}>{x}</span>
          </div>
        ))}
      </div>
      <Notas itens={["Verificado em 2026-11-02 sobre a fsa.db e a revisão fixada do RIDAB (docs/RIDAB_INVENTARIO.md).", "O município vem do cadastro atual de agentes, não da data do contrato."]} />
    </div>
  );
}

// ============ CATÁLOGO: as bases agregadas, cada uma na sua língua ============
const ORDEM = {
  1: "Coletada da fonte pela Sonda",
  2: "Base de pesquisa",
  3: "Dados oficiais organizados por terceiros",
};
const NOME_BASE = { mapa_cultural: "Mapa Cultural", oca: "OCA", fsa: "FSA", ridab: "RIDAB" };
const DESCRICAO_BASE = {
  mapa_cultural: "Agentes culturais de cinema coletados da rede de mapas do Ministério da Cultura.",
  oca: "Salas de exibição registradas na ANCINE, publicadas pelo Observatório Brasileiro do Cinema.",
  fsa: "Base de pesquisa sobre o fomento do Fundo Setorial do Audiovisual: fatos, dimensões e visões, com as ressalvas de cada coluna.",
  ridab: "Repositório Independente dos Dados do Audiovisual Brasileiro: dados oficiais da ANCINE e do IBGE, organizados por terceiros.",
};

function citacao(nome, p) {
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  return `SONDA. Observatório de Dados e Políticas do Audiovisual (UFF). ${nome}. Versão: ${p.instancia_versao || "—"}. `
    + (p.autoria ? `Dados: ${p.autoria}${p.licenca ? `, ${p.licenca}` : ""}. ` : "")
    + `Integridade (sha256): ${p.fixity || "—"}. Acesso em: ${hoje}.`;
}

const LINK_BASE = {
  fsa: { href: "https://github.com/isaac-pipcode/sonda/releases/download/fsa.db/fsa.db", rotulo: "Baixar a base (SQLite, 5 MB)" },
  ridab: { href: "https://huggingface.co/datasets/riabr-dados/riab", rotulo: "Abrir no Hugging Face" },
};

function BaseCatalogo({ b, snaps }) {
  const nome = NOME_BASE[b.base] || b.base;
  // proveniência: a que a API envia por base (FSA, RIDAB) ou o snapshot mais recente (bases coletadas).
  const s0 = snaps[0];
  const p = b.proveniencia || (s0 ? { fonte: s0.fonte, instancia_versao: s0.instancia_versao, fixity: s0.fixity, regime_retencao: s0.politica_retencao?.regime } : null);
  const link = LINK_BASE[b.base] || { href: SondaAPI.urlRaw(b.base), rotulo: "Baixar os registros (JSON)" };
  const linha = (rotulo, valor, mono) => valor == null || valor === "" ? null : (
    <React.Fragment key={rotulo}>
      <dt style={{ color: S.mudo, fontSize: 14 }}>{rotulo}</dt>
      <dd style={{ margin: 0, fontFamily: mono ? FONTE_NUM : FONTE_UI, fontSize: mono ? 13 : 14.5, wordBreak: "break-all" }}>{valor}</dd>
    </React.Fragment>
  );
  return (
    <li style={{ border: `1px solid ${S.linha}`, borderTop: `4px solid ${S.tinta}`, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <span style={{ fontSize: 13.5, color: S.mudo }}>{ORDEM[b.ordem] || ""}</span>
      <h2 style={{ margin: 0, fontWeight: 800, fontStretch: "68%", fontSize: 30, lineHeight: 1 }}>{nome}</h2>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>{DESCRICAO_BASE[b.base] || ""}</p>
      <p style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: FONTE_NUM, fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{fmtNum(b.n_registros, 0)}</span>
        <span style={{ fontSize: 14.5, color: S.mudo }}>{b.unidade_registro || "registros"}{(b.base === "mapa_cultural" || b.base === "oca") && b.n_registros <= 20 ? " (amostra de exemplo)" : ""}</span>
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: "auto" }}>
        <a href={link.href} target="_blank" rel="noreferrer" style={{ ...BTN_LEVE, display: "inline-flex", alignItems: "center", textDecoration: "none", background: S.tinta, color: S.papel }}>{link.rotulo}</a>
        {p && <CopiarCitacao texto={citacao(nome, p)} />}
      </div>
      {p && (
        <details style={{ fontSize: 14.5 }}>
          <summary style={{ cursor: "pointer", minHeight: 44, display: "inline-flex", alignItems: "center", color: S.sonar, fontWeight: 600 }}>Origem e versão</summary>
          <dl style={{ margin: "4px 0 0", display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 16px", alignItems: "baseline" }}>
            {linha("Fonte", p.fonte)}
            {linha("Versão", p.instancia_versao, true)}
            {linha("Integridade (sha256)", p.fixity, true)}
            {linha("Autoria", p.autoria)}
            {linha("Licença", p.licenca)}
            {linha("Origem declarada", p.origem_declarada)}
            {linha("Unidade nativa", b.entidade_nativa)}
            {b.tabelas_lidas && linha("Tabelas lidas", b.tabelas_lidas.join(" · "), true)}
          </dl>
        </details>
      )}
    </li>
  );
}

function Catalogo({ ir }) {
  const { env, erro, carregando } = useEnvelope(() => SondaAPI.catalogo());
  const bases = env?.dados || [];
  const provPorFonte = Array.isArray(env?.proveniencia) ? env.proveniencia : [];
  const snapsDaBase = (entidade) =>
    provPorFonte.flatMap((p) => (p.snapshots || []).filter((s) => s.entidade === entidade).map((s) => ({ ...s, fonte: p.fonte })));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONTE_UI }}>
      <TituloTela titulo="Bases reunidas" sub="Baixe cada base na forma original e copie a citação, com a versão exata que a Sonda lê." />
      <Estado carregando={carregando} erro={erro} vazio={bases.length === 0} vazioMsg="Nenhuma base disponível no momento.">
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 20 }}>
          {bases.map((b) => <BaseCatalogo key={`${b.base}:${b.entidade_nativa}`} b={b} snaps={snapsDaBase(b.entidade_nativa)} />)}
        </ol>
        <p style={{ margin: 0, fontSize: 15 }}>
          Falta alguma base? <button type="button" onClick={() => ir("cruzar/encadear")} style={{ minHeight: 44, padding: 0, border: "none", background: "transparent", color: S.sonar, fontFamily: FONTE_UI, fontWeight: 600, fontSize: 15, textDecoration: "underline", cursor: "pointer" }}>Veja as bases que ainda faltam</button>.
        </p>
      </Estado>
    </div>
  );
}

// ============ ações e blocos comuns (Percurso e Cruzamentos) ============
const BTN = { minHeight: 44, padding: "0 20px", border: `2px solid ${S.tinta}`, background: S.papel, color: S.tinta, fontFamily: FONTE_UI, fontWeight: 700, fontSize: 15, cursor: "pointer" };
function Btn({ forte, ocupado, children, ...p }) {
  return (
    <button type="button" disabled={ocupado} {...p}
      style={{ ...BTN, ...(forte ? { background: S.tinta, color: S.papel } : {}), opacity: ocupado ? 0.55 : 1, cursor: ocupado ? "wait" : "pointer" }}>
      {children}
    </button>
  );
}
const fmtQuando = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : `${d.toLocaleDateString("pt-BR")}, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};
const plural = (n, um, varios) => `${fmtNum(n, 0)} ${n === 1 ? um : varios}`;

// confirmação antes de gravar um ponto permanente na série (decisão 6: append-only).
function Confirmacao({ id, titulo, children, rotuloConfirmar, ocupado, aoConfirmar, aoCancelar }) {
  return (
    <div role="group" aria-labelledby={id} style={{ border: `2px solid ${S.tinta}`, background: S.painel, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <strong id={id} style={{ fontSize: 16 }}>{titulo}</strong>
      <div style={{ fontSize: 15, lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Btn forte ocupado={ocupado} onClick={aoConfirmar}>{ocupado ? "Registrando…" : rotuloConfirmar}</Btn>
        <Btn ocupado={ocupado} onClick={aoCancelar}>Cancelar</Btn>
      </div>
    </div>
  );
}

// amostra de sem par: o que não liga é achado, nunca filtro (porosidade 4).
function AmostraOrfaos({ itens, total }) {
  if (!itens.length) return null;
  return (
    <details style={{ fontSize: 14.5 }}>
      <summary style={{ cursor: "pointer", minHeight: 32, color: S.sinalTxt, fontWeight: 700 }}>
        Ver registros sem par ({itens.length} de {fmtNum(total, 0)})
      </summary>
      <ul style={{ margin: "8px 0 0", padding: "0 0 0 20px", fontFamily: FONTE_NUM, fontSize: 13, lineHeight: 1.7, color: S.mudo }}>
        {itens.map((o, i) => <li key={i}>{o.rotulo ?? "(sem rótulo)"} <span style={{ color: S.mudo }}>· {o.lado}</span></li>)}
      </ul>
    </details>
  );
}

function Contrato({ contrato }) {
  if (!contrato) return null;
  return (
    <div style={{ border: `2px dashed ${S.sinalTxt}`, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontFamily: FONTE_NUM, fontSize: 12.5, fontWeight: 600, letterSpacing: ".1em", color: S.sinalTxt }}>BASE QUE FALTA</span>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.4 }}>{contrato.pergunta_de_pesquisa}</p>
      {contrato.eixo_de_ligacao_hipotese && (
        <>
          <span style={{ fontSize: 14, color: S.mudo }}>Eixo de ligação ({contrato.eixo_de_ligacao_hipotese.eixo}), hipóteses a confirmar:</span>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14.5, lineHeight: 1.6 }}>
            {(contrato.eixo_de_ligacao_hipotese.hipoteses || []).map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        </>
      )}
      <span style={{ fontSize: 14, color: S.mudo }}>Retenção: {contrato.regime_retencao}</span>
    </div>
  );
}

// ============ PERCURSO: a rede de caminhos como lista navegável de saltos ============
const GLIFO = { factual: "●", derivado: "◇", ausente: "┄" };
const NOME_TIPO = { factual: "medida nas bases", derivado: "calculada", ausente: "falta uma base" };

function Percurso() {
  const [pid, setPid] = useState(null);
  const [selIdx, setSelIdx] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState(null);
  const [aviso, setAviso] = useState(null);

  const { env: lista, erro: erroLista, carregando: carLista } = useEnvelope(() => SondaAPI.percursos());
  const percursos = lista?.dados || [];
  const id = pid || percursos[0]?.id;
  const { env: det, erro: erroDet, carregando: carDet, recarregar: recDet } = useEnvelope(
    () => (id ? SondaAPI.percurso(id) : null), [id]);
  const { env: ult, erro: erroUlt, carregando: carUlt, recarregar: recUlt } = useEnvelope(
    () => (id ? SondaAPI.percursoUltima(id) : null), [id]);

  const p = det?.dados;
  const nos = Object.fromEntries((p?.definicao?.nos || []).map((n) => [n.id, n]));
  const arestas = p?.definicao?.arestas || [];
  const ultExec = ult?.dados;
  const saltos = ultExec?.saltos || [];
  const resumo = ultExec?.resumo;
  const itens = arestas.map((a) => {
    const s = saltos.find((x) => x.de === a.de && x.para === a.para);
    const tipo = s?.tipo || a.tipo || nos[a.para]?.tipo || "factual";
    return { a, s, tipo, de: nos[a.de], para: nos[a.para] };
  });
  const atual = itens[Math.min(selIdx, itens.length - 1)];
  const ultimaSerie = p?.serie?.[p.serie.length - 1];

  const escolher = (novo) => { setPid(novo); setSelIdx(0); setConfirmando(false); setFalha(null); setAviso(null); };
  const registrar = async () => {
    setOcupado(true); setFalha(null); setAviso(null);
    try {
      await SondaAPI.executarPercurso(id);
      setConfirmando(false);
      await Promise.all([recDet(), recUlt()]);
      setAviso("Execução registrada no histórico.");
    } catch (e) { setFalha(`Não foi possível executar: ${mensagem(e)}`); }
    finally { setOcupado(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, fontFamily: FONTE_UI }}>
      <TituloTela titulo="Encadear cruzamentos" sub="Um cruzamento depois do outro. Cada etapa é medida nas bases, calculada a partir delas ou depende de uma base que falta." />

      <Estado carregando={(carLista || carDet || carUlt) && !p} erro={erroLista || erroDet || erroUlt} vazio={percursos.length === 0} vazioMsg="Nenhum encadeamento registrado.">
        {p && (
          <>
            <section aria-labelledby="sec-perc" style={{ display: "flex", flexWrap: "wrap", gap: "16px 32px", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <TituloSecao id="sec-perc">{p.nome}</TituloSecao>
                <span style={{ fontFamily: FONTE_NUM, fontSize: 13, color: S.mudo }}>
                  regra {p.versao_regra} · assinado por <span style={{ color: S.tinta }}>{p.autor}</span> · {plural(p.serie.length, "execução", "execuções")}
                </span>
                {percursos.length > 1 && (
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, marginTop: 6 }}>
                    Percurso
                    <select value={id} onChange={(e) => escolher(e.target.value)} style={{ minHeight: 44, fontFamily: FONTE_UI, fontSize: 15, padding: "0 10px", border: `2px solid ${S.tinta}`, background: S.papel }}>
                      {percursos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <Btn forte aria-expanded={confirmando} onClick={() => setConfirmando((v) => !v)}>Executar de novo</Btn>
            </section>

            {confirmando && (
              <Confirmacao id="conf-perc" titulo="Executar o encadeamento de novo?" rotuloConfirmar="Confirmar e executar" ocupado={ocupado}
                aoConfirmar={registrar} aoCancelar={() => setConfirmando(false)}>
                <span>A execução fica <strong>registrada no histórico</strong> e não pode ser apagada.</span>
                <span style={{ color: S.mudo }}>
                  {ultimaSerie
                    ? `Última execução: ${fmtQuando(ultimaSerie.data)}, com ${fmtNum(ultimaSerie.ligados_total, 0)} ligados e ${fmtNum(ultimaSerie.orfaos_total, 0)} sem par. Se as fontes não mudaram, o resultado será o mesmo.`
                    : "Este encadeamento ainda não foi executado."}
                </span>
              </Confirmacao>
            )}
            <Falha erro={falha} />
            <p role="status" style={{ margin: 0, fontSize: 15, color: S.sonar, fontWeight: 600 }}>{aviso}</p>

            {resumo && (
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6 }}>
                Execução de {fmtQuando(ultExec.data)}: <strong>{fmtNum(resumo.ligados_total, 0)}</strong> ligados, <strong style={{ color: S.sinalTxt }}>{fmtNum(resumo.orfaos_total, 0)}</strong> sem par,{" "}
                {plural(resumo.n_derivados, "etapa calculada", "etapas calculadas")} e {plural(resumo.n_elos_ausentes, "base que falta", "bases que faltam")}.
              </p>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: "24px 40px", alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 380px", minWidth: 0 }}>
                <p style={{ margin: "0 0 10px", fontSize: 14, color: S.mudo }}>
                  <span aria-hidden="true">●</span> medida nas bases · <span aria-hidden="true">◇</span> calculada · <span aria-hidden="true">┄</span> falta uma base
                </p>
                <ol aria-label="Etapas do encadeamento" style={{ margin: 0, padding: 0, listStyle: "none", borderTop: `2px solid ${S.tinta}` }}>
                  {itens.map((it, i) => {
                    const on = atual === it;
                    const resumoSalto = it.tipo === "factual" && it.s
                      ? `${fmtNum(it.s.ligados, 0)} ligados · ${fmtNum(it.s.orfaos_esquerda + it.s.orfaos_direita, 0)} sem par`
                      : it.tipo === "factual" ? "ainda não executada" : "";
                    return (
                      <li key={i} style={{ borderBottom: `1px solid ${S.linha}` }}>
                        <button type="button" aria-pressed={on} onClick={() => setSelIdx(i)}
                          style={{ width: "100%", minHeight: 64, display: "flex", alignItems: "center", gap: 14, textAlign: "left", padding: "10px 12px", border: "none", outline: on ? `3px solid ${S.tinta}` : "none", outlineOffset: -3, background: on ? S.painel : S.papel, color: S.tinta, fontFamily: FONTE_UI, cursor: "pointer" }}>
                          <span aria-hidden="true" style={{ fontFamily: FONTE_NUM, fontSize: 22, color: it.tipo === "ausente" ? S.sinalTxt : S.sonar, width: 24, textAlign: "center" }}>{GLIFO[it.tipo]}</span>
                          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                            <span style={{ fontWeight: 700, fontSize: 16 }}>{it.de?.rotulo || it.a.de} → {it.para?.rotulo || it.a.para}</span>
                            <span style={{ fontSize: 14, color: S.mudo }}>{NOME_TIPO[it.tipo]}{resumoSalto ? ` · ${resumoSalto}` : ""}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <aside aria-label="Detalhe da etapa" style={{ flex: "1 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                {atual ? <DetalheSalto it={atual} /> : <p style={{ margin: 0, color: S.mudo }}>Este encadeamento não tem etapas.</p>}
              </aside>
            </div>
          </>
        )}
      </Estado>
    </div>
  );
}

function DetalheSalto({ it }) {
  const { s, tipo, de, para, a } = it;
  const titulo = `${de?.rotulo || a.de} → ${para?.rotulo || a.para}`;
  const orfaos = s ? [
    ...(s.amostra_orfaos_esquerda || []).slice(0, 5).map((o) => ({ ...o, lado: de?.rotulo || "esquerda" })),
    ...(s.amostra_orfaos_direita || []).slice(0, 5).map((o) => ({ ...o, lado: para?.rotulo || "direita" })),
  ] : [];
  return (
    <>
      <h3 style={{ margin: 0, fontWeight: 800, fontStretch: "68%", textTransform: "uppercase", fontSize: 28, lineHeight: 1.05 }}>{titulo}</h3>
      <span style={{ fontFamily: FONTE_NUM, fontSize: 13, color: S.mudo }}>etapa {NOME_TIPO[tipo]}{a.eixo ? ` · ligação por ${a.eixo}` : ""}</span>
      {tipo === "factual" && !s && <p style={{ margin: 0, fontSize: 15 }}>Esta etapa ainda não foi executada.</p>}
      {tipo === "factual" && s && (
        <>
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55 }}>
            <strong style={{ fontFamily: FONTE_NUM, fontSize: 26 }}>{fmtNum(s.ligados, 0)}</strong> ligados ·{" "}
            <strong style={{ fontFamily: FONTE_NUM, fontSize: 26, color: S.sinalTxt }}>{fmtNum(s.orfaos_esquerda + s.orfaos_direita, 0)}</strong> sem par
            <br /><span style={{ color: S.mudo, fontSize: 14 }}>{fmtNum(s.orfaos_esquerda, 0)} sem par à esquerda, {fmtNum(s.orfaos_direita, 0)} à direita. </span>
          </p>
          <AmostraOrfaos itens={orfaos} total={s.orfaos_esquerda + s.orfaos_direita} />
        </>
      )}
      {tipo === "derivado" && (
        <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55 }}>
          <strong>{para?.rotulo}</strong> não vem de uma base: é calculado.
          {(s?.derivacao || para?.derivacao) && <><br /><span style={{ color: S.mudo }}>Cálculo: {s?.derivacao || para?.derivacao}</span></>}
        </p>
      )}
      {tipo === "ausente" && (
        s?.contrato ? <Contrato contrato={s.contrato} />
          : <p style={{ margin: 0, fontSize: 15 }}>Falta uma base. Execute o encadeamento para descrever a base que falta.</p>
      )}
    </>
  );
}

// ============ TRAJETÓRIA: um cruzamento como série temporal ============
const fmtData = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtHora = (d) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function Trajetoria({ ir }) {
  const { env: lista } = useEnvelope(() => SondaAPI.cruzamentos());
  const candidatos = (lista?.dados || []).filter((c) => c.execucoes > 0 && !/faltante/i.test(c.nome));
  const [escolhido, setEscolhido] = useState(null);
  const cid = escolhido ?? candidatos[0]?.id;
  const { env, erro, carregando } = useEnvelope(async () => (cid ? SondaAPI.cruzamento(cid) : null), [cid]);
  const serie = (env?.dados?.serie || []).map((s) => ({ data: new Date(s.data), lig: s.ligados, orf: s.orfaos, mig: s.tipo === "migracao" }));
  const n = serie.length;
  const prim = serie[0], ult = serie[n - 1];
  const taxa = ult && ult.lig + ult.orf ? (ult.lig / (ult.lig + ult.orf)) * 100 : 0;
  const maxV = Math.max(1, ...serie.flatMap((s) => [s.lig, s.orf]));
  const passo = Math.ceil(maxV / 4);
  const topo = passo * 4;
  const ticks = [0, 1, 2, 3, 4].map((i) => i * passo);
  const identicas = n > 1 && serie.every((s) => s.lig === prim.lig && s.orf === prim.orf);
  const mesmoDia = n > 1 && serie.every((s) => fmtData(s.data) === fmtData(prim.data));
  const delta = (a, b, piora) => {
    const dd = b - a;
    if (dd === 0) return `= sem variação desde a 1ª execução (${a} → ${b})`;
    return `${dd > 0 ? "▲" : "▼"} ${dd > 0 ? "+" : ""}${dd} desde a 1ª execução${piora ? (dd > 0 ? " (mais sem par)" : " (menos sem par)") : ""}`;
  };
  const tile = (rotulo, valor, apoio) => (
    <div style={{ flex: "1 1 260px", borderTop: `4px solid ${S.tinta}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: FONTE_NUM, fontSize: 12.5, fontWeight: 600, letterSpacing: ".1em", color: S.mudo }}>{rotulo}</span>
      <span style={{ fontWeight: 800, fontStretch: "62%", fontSize: 76, lineHeight: 0.9 }}>{valor}</span>
      <span style={{ fontSize: 14.5, color: S.tinta }}>{apoio}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 44, fontFamily: FONTE_UI }}>
      <TituloTela titulo="Histórico de um cruzamento" sub="Cada execução fica registrada. Se o resultado muda de uma para outra, mudaram as fontes." />
        {candidatos.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 680 }}>
            <label htmlFor="cruz-sel" style={{ fontSize: 14.5, color: S.mudo }}>Cruzamento</label>
            <select id="cruz-sel" value={cid || ""} onChange={(e) => setEscolhido(e.target.value)} style={{ minHeight: 48, border: `2px solid ${S.tinta}`, background: S.papel, padding: "0 12px", fontFamily: FONTE_UI, fontWeight: 600, fontSize: 16, color: S.tinta }}>
              {candidatos.map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.execucoes} execução(ões)</option>)}
            </select>
          </div>
        )}


      <Estado carregando={carregando} erro={erro} vazio={n === 0} vazioMsg="Nenhum cruzamento com execuções registradas. Execute um cruzamento em Cruzamentos para iniciar a série.">
        {n > 0 && (
          <>
            <section aria-label="Resumo" style={{ display: "flex", flexWrap: "wrap", gap: "20px 32px" }}>
              {tile("COM PAR", `${fmtNum(taxa, 0)}%`, "dos registros têm par, na última execução")}
              {tile("LIGADOS", fmtNum(ult.lig, 0), delta(prim.lig, ult.lig, false))}
              {tile("SEM PAR", fmtNum(ult.orf, 0), delta(prim.orf, ult.orf, true))}
            </section>

            <section aria-labelledby="sec-traj" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 32px", alignItems: "baseline", justifyContent: "space-between" }}>
                <TituloSecao id="sec-traj">Com par e sem par, por execução</TituloSecao>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "8px 24px", fontSize: 14.5 }}>
                  <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 14, height: 14, background: S.tinta, display: "inline-block" }} />com par</li>
                  <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 14, height: 14, background: S.sinal, display: "inline-block" }} />sem par</li>
                  <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 18, height: 18, border: `2px solid ${S.sinalTxt}`, boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: S.sinalTxt }}>!</span>migração de esquema na fonte</li>
                </ul>
              </div>
              <div style={{ overflowX: "auto" }}>
                <div role="img" aria-label={`Barras de ligados e sem par em ${n} execuções. Na última: ${ult.lig} ligados e ${ult.orf} sem par.`} style={{ minWidth: Math.max(520, n * 96 + 60), display: "flex", gap: 12 }}>
                  <div aria-hidden="true" style={{ flex: "0 0 36px", height: 300, display: "flex", flexDirection: "column-reverse", justifyContent: "space-between", alignItems: "flex-end", fontFamily: FONTE_NUM, fontSize: 12.5, color: S.mudo, lineHeight: 1 }}>
                    {ticks.map((t) => <span key={t}>{fmtNum(t, 0)}</span>)}
                  </div>
                  <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ position: "relative", height: 300, borderLeft: `2px solid ${S.tinta}`, borderBottom: `2px solid ${S.tinta}` }}>
                      {ticks.slice(1).map((t, i) => <div key={t} aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: `${(1 - t / topo) * 100}%`, borderTop: `1px solid ${S.linha}` }} />)}
                      <div style={{ position: "absolute", inset: 0, display: "flex" }}>
                        {serie.map((s, i) => (
                          <div key={i} style={{ flex: "1 1 0", minWidth: 0, height: "100%", display: "flex", gap: 8, alignItems: "flex-end", justifyContent: "center", position: "relative" }}>
                            {s.mig && <span aria-hidden="true" style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 22, height: 22, border: `2px solid ${S.sinalTxt}`, boxSizing: "border-box", background: S.papel, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: S.sinalTxt }}>!</span>}
                            {[[s.lig, S.tinta], [s.orf, S.sinal]].map(([v, cor], j) => (
                              <div key={j} style={{ width: "min(36%, 64px)", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                                <span style={{ fontFamily: FONTE_NUM, fontSize: 15, fontWeight: 600 }}>{fmtNum(v, 0)}</span>
                                <span style={{ width: "100%", height: `${(v / topo) * 100}%`, minHeight: v > 0 ? 2 : 0, background: cor, display: "block" }} />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex" }}>
                      {serie.map((s, i) => (
                        <div key={i} style={{ flex: "1 1 0", minWidth: 0, textAlign: "center", display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 600, fontSize: 14.5 }}>Execução {i + 1}</span>
                          <span style={{ fontFamily: FONTE_NUM, fontSize: 12.5, color: S.mudo }}>{fmtData(s.data)} · {fmtHora(s.data)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${S.linha}`, paddingTop: 18, fontSize: 15.5, lineHeight: 1.5, maxWidth: 860 }}>
                {n < 2 && <p style={{ margin: 0 }}>Há uma única execução. O histórico começa com duas.</p>}
                {identicas && <p style={{ margin: 0 }}>As {n} execuções registradas não diferem entre si{mesmoDia ? ` e foram feitas no mesmo dia (${fmtData(prim.data)})` : ""}: as fontes não mudaram no intervalo. Para ler uma tendência, é preciso registrar execuções ao longo do tempo.</p>}
                {serie.some((s) => s.mig) && <p style={{ margin: 0 }}><strong style={{ color: S.sinalTxt }}>Migração de esquema.</strong> Nas execuções assinaladas com “!”, a variação decorre de mudança no esquema da fonte, e não de fenômeno real.</p>}
              </div>
              <details style={{ borderTop: `1px solid ${S.linha}`, paddingTop: 14 }}>
                <summary style={{ fontWeight: 700, fontSize: 15, color: S.sonar, cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>Ver os dados em tabela</summary>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", minWidth: 480, fontSize: 15, marginTop: 8 }}>
                    <caption style={{ textAlign: "left", fontSize: 13.5, color: S.mudo, paddingBottom: 8 }}>Resultado por execução</caption>
                    <thead><tr style={{ borderBottom: `2px solid ${S.tinta}` }}>{["Execução", "Data e hora", "Ligados", "Sem par", "Nota"].map((h) => <th key={h} scope="col" style={{ textAlign: "left", padding: "10px 16px 10px 0", fontWeight: 700 }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {serie.map((s, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${S.linha}` }}>
                          <th scope="row" style={{ textAlign: "left", fontWeight: 500, padding: "10px 16px 10px 0" }}>{i + 1}</th>
                          <td style={{ padding: "10px 16px 10px 0", fontFamily: FONTE_NUM, fontSize: 14 }}>{fmtData(s.data)} {fmtHora(s.data)}</td>
                          <td style={{ padding: "10px 16px 10px 0", fontFamily: FONTE_NUM }}>{s.lig}</td>
                          <td style={{ padding: "10px 16px 10px 0", fontFamily: FONTE_NUM }}>{s.orf}</td>
                          <td style={{ padding: "10px 0" }}>{s.mig ? "migração de esquema" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>

            <section aria-label="Proveniência desta série" style={{ display: "flex", flexWrap: "wrap", gap: "8px 32px", borderTop: `4px solid ${S.tinta}`, paddingTop: 20, fontSize: 15, color: S.mudo }}>
              <span><strong style={{ color: S.tinta, fontWeight: 600 }}>Cruzamento</strong> {env?.dados?.nome}</span>
              <span><strong style={{ color: S.tinta, fontWeight: 600 }}>Execuções</strong> {n}</span>
              <button type="button" onClick={() => ir("cruzamentos")} style={{ minHeight: 44, padding: 0, border: "none", background: "transparent", color: S.sonar, fontFamily: FONTE_UI, fontWeight: 700, fontSize: 15, textDecoration: "underline", cursor: "pointer" }}>Ver a receita e registrar nova execução →</button>
            </section>
          </>
        )}
      </Estado>
    </div>
  );
}

// ============ CRUZAMENTOS: receitas persistentes, assinadas, versionadas, bifurcáveis ============
const REGRAS = {
  igualdade_estrita: "Igualdade estrita (a chave deve coincidir exatamente)",
  igualdade_normalizada: "Igualdade normalizada (sem acento, caixa e espaços duplos)",
};
const proximaVersao = (v) => `v${(parseInt(String(v).replace(/\D/g, ""), 10) || 1) + 1}`;

function Cruzamentos() {
  const { env, erro, carregando, recarregar } = useEnvelope(() => SondaAPI.cruzamentos());
  const [destaque, setDestaque] = useState(null);
  const cs = env?.dados || [];
  const criado = async (novo) => {
    await recarregar();
    setDestaque(novo);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, fontFamily: FONTE_UI }}>
      <TituloTela titulo="Cruzamentos" sub="Cada cruzamento liga duas bases por um campo em comum e mostra o que tem par e o que fica sem par." />
      <p role="status" style={{ margin: 0, fontSize: 15, fontWeight: 600, color: S.sonar }}>
        {destaque && "Variante criada. Ela está destacada na lista."}
      </p>
      <Estado carregando={carregando && !env} erro={erro} vazio={cs.length === 0} vazioMsg="Nenhum cruzamento registrado.">
        <ol style={{ margin: 0, padding: 0, listStyle: "none", borderTop: `2px solid ${S.tinta}` }}>
          {cs.map((c) => <CartaoCruzamento key={c.id} c={c} nomes={cs} destacado={c.id === destaque} aoMudar={recarregar} aoCriar={criado} />)}
        </ol>
      </Estado>
    </div>
  );
}

function CartaoCruzamento({ c, nomes, destacado, aoMudar, aoCriar }) {
  const { env: detEnv, erro: erroDet, recarregar: recDet } = useEnvelope(() => SondaAPI.cruzamento(c.id), [c.id, c.execucoes]);
  const det = detEnv?.dados;
  const r = det?.receita;
  const [receitaAberta, setReceitaAberta] = useState(false);
  const [painel, setPainel] = useState(null); // null | "executar" | "bifurcar"
  const [exec, setExec] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState(null);
  const ref = useRef(null);
  useEffect(() => { if (destacado) ref.current?.scrollIntoView?.({ block: "center" }); }, [destacado]);

  const faltante = r ? !r.direita : /faltante/i.test(c.nome);
  const ultima = det?.serie?.[det.serie.length - 1];
  const pai = c.derivado_de && nomes.find((x) => x.id === c.derivado_de);
  const idc = `cz-${c.id}`;

  const abrir = (qual) => { setPainel((p) => (p === qual ? null : qual)); setFalha(null); };
  const executar = async () => {
    setOcupado(true); setFalha(null);
    try {
      const out = (await SondaAPI.executar(c.id)).dados;
      setExec(out); setPainel(null);
      await aoMudar?.();
      recDet();
    } catch (e) { setFalha(`Não foi possível ${faltante ? "descrever a base" : "executar o cruzamento"}: ${mensagem(e)}`); }
    finally { setOcupado(false); }
  };

  return (
    <li ref={ref} style={{ padding: "28px 0", borderBottom: `1px solid ${S.linha}`, outline: destacado ? `4px solid ${S.sonar}` : "none", outlineOffset: 8, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontFamily: FONTE_NUM, fontSize: 12.5, fontWeight: 600, letterSpacing: ".1em", color: faltante ? S.sinalTxt : S.mudo }}>
          {faltante ? "Falta uma base" : "Cruzamento"}{c.derivado_de ? " · variante" : ""}
        </span>
        <h3 style={{ margin: 0, fontWeight: 800, fontStretch: "68%", textTransform: "uppercase", fontSize: 32, lineHeight: 1.05 }}>{c.nome}</h3>
        <span style={{ fontFamily: FONTE_NUM, fontSize: 13, color: S.mudo }}>
          {String(c.id).slice(0, 8)} · regra {c.versao_regra} · assinado por <span style={{ color: S.tinta }}>{c.autor}</span>
          {c.derivado_de && <> · derivado de {pai ? pai.nome : String(c.derivado_de).slice(0, 8)}</>}
          {" · "}{plural(c.execucoes, "execução", "execuções")}
          {ultima && <> · última em {fmtQuando(ultima.data)}</>}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Btn aria-expanded={receitaAberta} aria-controls={`${idc}-receita`} onClick={() => setReceitaAberta((v) => !v)}>
          {receitaAberta ? "Ocultar configuração" : "Ver configuração"}
        </Btn>
        <Btn forte aria-expanded={painel === "executar"} onClick={() => abrir("executar")} ocupado={!det && !erroDet}>
          {faltante ? "Descrever a base que falta" : c.execucoes ? "Executar de novo" : "Executar"}
        </Btn>
        <Btn aria-expanded={painel === "bifurcar"} onClick={() => abrir("bifurcar")} ocupado={!det && !erroDet}>Criar variante</Btn>
      </div>
      {erroDet && <Falha erro={`Não foi possível abrir a configuração: ${erroDet}`} />}

      {receitaAberta && r && (
        <dl id={`${idc}-receita`} style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(110px, 160px) 1fr", gap: "8px 20px", alignItems: "baseline", background: S.painel, padding: "16px 18px" }}>
          {[
            ["Eixo", r.eixo],
            ["Regra", REGRAS[r.regra] || r.regra],
            ["Versão da regra", det.versao_regra],
            ["Fontes (versões)", r.versoes_fonte?.length ? r.versoes_fonte.join(" · ") : "não declaradas"],
            ["Lado esquerdo", `${r.esquerda.snapshot_id} · campo ${r.esquerda.campo_chave}`],
            ["Lado direito", r.direita ? `${r.direita.snapshot_id} · campo ${r.direita.campo_chave}` : "ausente (base faltante)"],
            r.justificativa && ["Justificativa", r.justificativa],
            r.base_faltante && ["Pergunta de pesquisa", r.base_faltante.pergunta],
          ].filter(Boolean).map(([k, v]) => (
            <React.Fragment key={k}>
              <dt style={{ color: S.mudo, fontSize: 14.5 }}>{k}</dt>
              <dd style={{ margin: 0, fontFamily: /Eixo|Fontes|Lado|Versão/.test(k) ? FONTE_NUM : FONTE_UI, fontSize: 14.5, wordBreak: "break-word" }}>{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}

      {painel === "executar" && det && (
        <Confirmacao id={`${idc}-conf`} titulo={faltante ? "Descrever a base que falta?" : "Executar este cruzamento?"}
          rotuloConfirmar={faltante ? "Confirmar e gerar" : "Confirmar e executar"} ocupado={ocupado}
          aoConfirmar={executar} aoCancelar={() => setPainel(null)}>
          <span>A execução fica <strong>registrada no histórico</strong> e não pode ser apagada.</span>
          <span style={{ color: S.mudo }}>
            {ultima
              ? `Última execução: ${fmtQuando(ultima.data)}, com ${fmtNum(ultima.ligados, 0)} ligados e ${fmtNum(ultima.orfaos, 0)} sem par. Se as fontes não mudaram, o resultado será o mesmo.`
              : "Este cruzamento ainda não foi executado."}
          </span>
        </Confirmacao>
      )}

      {painel === "bifurcar" && det && (
        <FormBifurcacao c={c} det={det} aoCancelar={() => setPainel(null)} aoCriar={(novo) => { setPainel(null); aoCriar(novo); }} />
      )}
      <Falha erro={falha} />

      {exec && <ResultadoExecucao exec={exec} />}
    </li>
  );
}

function ResultadoExecucao({ exec }) {
  const orfaos = exec.orfaos_esquerda + exec.orfaos_direita;
  const m = exec.mudanca;
  const itens = [
    ...(exec.achados?.amostra_orfaos_esquerda || []).slice(0, 8).map((o) => ({ ...o, lado: "esquerda" })),
    ...(exec.achados?.amostra_orfaos_direita || []).slice(0, 8).map((o) => ({ ...o, lado: "direita" })),
  ];
  return (
    <div role="status" style={{ borderLeft: `4px solid ${exec.executavel ? S.sonar : S.sinalTxt}`, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontFamily: FONTE_NUM, fontSize: 13, color: S.mudo }}>Execução registrada em {fmtQuando(exec.data)}</span>
      {exec.executavel ? (
        <>
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55 }}>
            <strong style={{ fontFamily: FONTE_NUM, fontSize: 26 }}>{fmtNum(exec.ligados, 0)}</strong> ligados ·{" "}
            <strong style={{ fontFamily: FONTE_NUM, fontSize: 26, color: S.sinalTxt }}>{fmtNum(orfaos, 0)}</strong> sem par
          </p>
          {m && (m.d_ligados === 0 && m.d_orfaos === 0
            ? <span style={{ fontSize: 14.5, color: S.mudo }}>Resultado idêntico ao da execução anterior: as fontes não mudaram.</span>
            : <span style={{ fontSize: 14.5, color: S.mudo }}>Em relação à execução anterior: {m.d_ligados > 0 ? "+" : ""}{fmtNum(m.d_ligados, 0)} ligados, {m.d_orfaos > 0 ? "+" : ""}{fmtNum(m.d_orfaos, 0)} sem par.</span>)}
          <AmostraOrfaos itens={itens} total={orfaos} />
        </>
      ) : (
        <>
          <span style={{ fontSize: 15 }}>Não há base do outro lado. Esta é a descrição da base que falta:</span>
          <Contrato contrato={exec.achados?.contrato} />
        </>
      )}
    </div>
  );
}

function FormBifurcacao({ c, det, aoCancelar, aoCriar }) {
  const r = det.receita;
  const outra = r.regra === "igualdade_estrita" ? "igualdade_normalizada" : "igualdade_estrita";
  const [nome, setNome] = useState(`${c.nome} (${outra === "igualdade_estrita" ? "regra estrita" : "regra normalizada"})`);
  const [regra, setRegra] = useState(outra);
  const [just, setJust] = useState("");
  const [autor, setAutor] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState(null);
  const id = `bif-${c.id}`;
  const valido = nome.trim() && just.trim() && autor.trim() && regra !== r.regra;
  const campo = { minHeight: 44, width: "100%", padding: "8px 10px", border: `2px solid ${S.tinta}`, background: S.papel, color: S.tinta, fontFamily: FONTE_UI, fontSize: 15 };
  const rotulo = { display: "flex", flexDirection: "column", gap: 4, fontSize: 14.5, fontWeight: 600 };

  const enviar = async (ev) => {
    ev.preventDefault();
    if (!valido) return;
    setOcupado(true); setFalha(null);
    try {
      const novo = (await SondaAPI.bifurcar(c.id, {
        nome: nome.trim(), autor: autor.trim(), eixo: r.eixo, esquerda: r.esquerda, direita: r.direita || null,
        regra, limiar: r.limiar ?? null, versoes_fonte: r.versoes_fonte || [], base_faltante: r.base_faltante || null,
        versao_regra: proximaVersao(det.versao_regra), justificativa: just.trim(),
      })).dados;
      aoCriar(novo.id);
    } catch (e) { setFalha(`Não foi possível criar a variante: ${mensagem(e)}`); setOcupado(false); }
  };

  return (
    <form onSubmit={enviar} aria-labelledby={`${id}-t`} style={{ border: `2px solid ${S.tinta}`, background: S.painel, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <strong id={`${id}-t`} style={{ fontSize: 16 }}>Criar variante com outra regra</strong>
      <span style={{ fontSize: 15, lineHeight: 1.55 }}>
        Cria um novo cruzamento a partir deste. O original não muda.
      </span>
      <label style={rotulo}>Nome do novo cruzamento
        <input value={nome} onChange={(e) => setNome(e.target.value)} required style={campo} />
      </label>
      <label style={rotulo}>Regra de ligação
        <select value={regra} onChange={(e) => setRegra(e.target.value)} style={campo}>
          {Object.entries(REGRAS).map(([k, v]) => <option key={k} value={k}>{v}{k === r.regra ? " (a atual)" : ""}</option>)}
        </select>
      </label>
      {regra === r.regra && <span role="alert" style={{ fontSize: 14, color: S.sinalTxt }}>Escolha uma regra diferente da atual.</span>}
      <label style={rotulo}>Justificativa (por que a regra deve mudar)
        <textarea value={just} onChange={(e) => setJust(e.target.value)} required rows={3} maxLength={1000} style={{ ...campo, resize: "vertical" }} />
      </label>
      <label style={rotulo}>Assinado por
        <input value={autor} onChange={(e) => setAutor(e.target.value)} required style={campo} />
      </label>
      <Falha erro={falha} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <button type="submit" disabled={!valido || ocupado} style={{ ...BTN, background: S.tinta, color: S.papel, opacity: !valido || ocupado ? 0.55 : 1, cursor: ocupado ? "wait" : valido ? "pointer" : "not-allowed" }}>
          {ocupado ? "Registrando…" : "Criar variante"}
        </button>
        <Btn ocupado={ocupado} onClick={aoCancelar}>Cancelar</Btn>
      </div>
    </form>
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
// Navegação: três áreas nomeadas pelo que se faz nelas; cada uma com as suas telas.
const AREAS = [
  { id: "indicadores", rotulo: "Consultar indicadores", telas: [
    { id: "investimento", rotulo: "Quanto se investe e se vê", comp: Investimento },
    { id: "territorio", rotulo: "Onde", comp: Territorio },
    { id: "telas", rotulo: "O que chega às telas", comp: Ligacoes },
  ] },
  { id: "cruzar", rotulo: "Cruzar bases", telas: [
    { id: "cruzamentos", rotulo: "Cruzamentos", comp: Cruzamentos },
    { id: "encadear", rotulo: "Encadear", comp: Percurso },
    { id: "historico", rotulo: "Histórico", comp: Trajetoria },
    { id: "chaves", rotulo: "O que cruza com o quê", comp: Chaves },
  ] },
  { id: "bases", rotulo: "Baixar e citar", telas: [{ id: "catalogo", rotulo: "Bases", comp: Catalogo }] },
];
// endereços antigos (#/painel…) continuam valendo.
const ALIAS = {
  painel: "indicadores/investimento", territorio: "indicadores/territorio", ligacoes: "indicadores/telas",
  catalogo: "bases/catalogo", percurso: "cruzar/encadear", trajetoria: "cruzar/historico", cruzamentos: "cruzar/cruzamentos",
};
const ROTA_PADRAO = "indicadores/investimento";

// resolve "area", "area/tela" ou um endereço antigo; desconhecido cai na tela inicial.
function resolverRota(bruto) {
  const r = ALIAS[bruto] || bruto;
  const [a, tl] = r.split("/");
  const area = AREAS.find((x) => x.id === a);
  if (!area) return ROTA_PADRAO;
  const tela = area.telas.find((x) => x.id === tl) || area.telas[0];
  return `${area.id}/${tela.id}`;
}
const rotaDoHash = () => resolverRota((typeof window !== "undefined" ? window.location.hash : "").replace(/^#\/?/, ""));

export default function SondaApp() {
  // a tela ativa vive no hash da URL (#/cruzar/historico): link compartilhável e botão voltar funcional.
  const [rota, setRota] = useState(rotaDoHash);
  useEffect(() => {
    const aoMudar = () => setRota(rotaDoHash());
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);
  const [aid, tid] = rota.split("/");
  const area = AREAS.find((x) => x.id === aid);
  const Atual = area.telas.find((x) => x.id === tid).comp;
  const ir = (destino) => {
    window.location.hash = `/${resolverRota(destino)}`; // dispara hashchange, que atualiza a rota
    window.scrollTo?.(0, 0);
  };
  return (
    <div style={{ minHeight: "100vh", background: S.papel, color: S.tinta, fontFamily: "'Archivo',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        button:focus-visible, input:focus-visible, a:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 3px solid ${S.sinal}; outline-offset: 2px; }
        .nav-btn:hover { color: #FFFFFF; }
        .sub-btn:hover { color: ${S.tinta}; }
        summary::-webkit-details-marker { color: ${S.sonar}; }
        @media (prefers-reduced-motion: no-preference) {
          @keyframes fade { from {opacity:0;} to {opacity:1;} }
          .view { animation: fade .2s ease; }
        }
      `}</style>

      <header style={{ background: S.tinta }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(16px, 4vw, 40px)", display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: "0 40px", minHeight: 60 }}>
          <div style={{ display: "flex", alignItems: "center" }}><Wordmark /></div>
          <nav aria-label="Principal" style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>
            {AREAS.map((x) => (
              <button key={x.id} type="button" className="nav-btn" onClick={() => ir(x.id)} aria-current={aid === x.id ? "page" : undefined}
                style={{ minHeight: 48, padding: "0 18px", border: "none", borderBottom: `4px solid ${aid === x.id ? S.sinal : "transparent"}`, background: "transparent", color: aid === x.id ? "#FFFFFF" : "#B9BEC6", fontFamily: "'Archivo',sans-serif", fontWeight: 600, fontSize: 16, cursor: "pointer" }}>
                {x.rotulo}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {area.telas.length > 1 && (
        <nav aria-label={area.rotulo} style={{ borderBottom: `1px solid ${S.linha}` }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(16px, 4vw, 40px)", display: "flex", flexWrap: "wrap" }}>
            {area.telas.map((x) => (
              <button key={x.id} type="button" className="sub-btn" onClick={() => ir(`${area.id}/${x.id}`)} aria-current={tid === x.id ? "page" : undefined}
                style={{ minHeight: 48, padding: "0 16px 0 0", marginRight: 16, border: "none", borderBottom: `3px solid ${tid === x.id ? S.tinta : "transparent"}`, background: "transparent", color: tid === x.id ? S.tinta : S.mudo, fontFamily: "'Archivo',sans-serif", fontWeight: tid === x.id ? 700 : 500, fontSize: 15.5, cursor: "pointer" }}>
                {x.rotulo}
              </button>
            ))}
          </div>
        </nav>
      )}

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "28px clamp(16px, 4vw, 40px) 64px" }}>
        {aid === "cruzar" && tid !== "chaves" && (
          <p role="note" style={{ margin: "0 0 24px", padding: "10px 14px", background: S.painel, borderLeft: `4px solid ${S.sinal}`, fontSize: 14.5, lineHeight: 1.45 }}>
            <strong>Dados de demonstração.</strong> Esta área ainda opera sobre 6 agentes e 6 salas de exemplo, não sobre as bases completas.
          </p>
        )}
        <div className="view" key={rota}><LimiteDeErro><Atual ir={ir} /></LimiteDeErro></div>
      </main>

      <footer style={{ borderTop: `1px solid ${S.linha}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px clamp(16px, 4vw, 40px) 40px", fontSize: 14, color: S.mudo, lineHeight: 1.6 }}>
          Sonda — Observatório de Dados e Políticas do Audiovisual (UFF).
        </div>
      </footer>
    </div>
  );
}
