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
    Promise.resolve().then(fn).then(setEnv).catch((e) => setErro(mensagem(e))).finally(() => setCarregando(false));
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

function LinhaSerie({ s, n, anos, idx, ano, aoMudarAno }) {
  const casas = CASAS[s.id] ?? 1;
  const valores = s.dados.map((d) => d.valor);
  const max = Math.max(0, ...valores.filter((v) => v != null)) * 1.06 || 1;
  const v = valores[idx];
  const p = idx > 0 ? valores[idx - 1] : null;
  let delta = "fora da cobertura desta base";
  if (v != null && p != null && p !== 0) {
    const dd = (v / p - 1) * 100;
    delta = `${dd >= 0 ? "▲" : "▼"} ${fmtNum(Math.abs(dd), 0)}% em relação a ${anos[idx - 1]}`;
  } else if (v != null) {
    delta = "sem ano anterior para comparação";
  }
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${S.linha}` }}>
      <div style={{ flex: "0 0 320px", boxSizing: "border-box", padding: "22px 28px 22px 0", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontFamily: FONTE_NUM, fontSize: 12.5, fontWeight: 600, letterSpacing: ".1em", color: S.mudo }}>{ROTULO_BASE[s.base] || s.base} · {DOMINIO[s.id] || ""}</span>
        <h3 style={{ margin: 0, fontFamily: FONTE_UI, fontWeight: 800, fontStretch: "68%", textTransform: "uppercase", fontSize: 28, lineHeight: 1, letterSpacing: ".01em" }}>{s.titulo}</h3>
        <span style={{ fontSize: 14, color: S.mudo }}>{s.unidade}</span>
        <span style={{ marginTop: 8, fontFamily: FONTE_NUM, fontSize: 36, fontWeight: 600, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{fmtNum(v, casas)}</span>
        <span style={{ fontSize: 14, color: S.tinta }}>{delta}{s.dados[idx]?.parcial ? " · ano parcial" : ""}</span>
        <span style={{ fontSize: 13, color: S.mudo }}>ver ressalva {n}</span>
      </div>
      <div style={{ flex: "1 1 0", minWidth: 0, display: "grid", gridTemplateColumns: `repeat(${anos.length}, minmax(0,1fr))` }}>
        {s.dados.map((d) => {
          const sel = d.ano === ano;
          const cor = sel ? S.sinal : S.tinta;
          const bg = d.parcial ? `repeating-linear-gradient(135deg, ${cor} 0 3px, ${S.papel} 3px 5px)` : cor;
          return (
            <button key={d.ano} type="button" tabIndex={-1} onClick={() => aoMudarAno(d.ano)} onMouseEnter={() => aoMudarAno(d.ano)}
              aria-label={`${d.ano}: ${d.valor == null ? "sem dado" : `${fmtNum(d.valor, casas)} ${s.unidade}`}`}
              style={{ position: "relative", height: 160, padding: 0, border: "none", background: "transparent", cursor: "crosshair", display: "block" }}>
              {d.valor == null
                ? <span aria-hidden="true" style={{ position: "absolute", left: "14%", right: "14%", bottom: 0, height: 26, background: HACHURA_VAZIO }} />
                : <span aria-hidden="true" style={{ position: "absolute", left: "14%", right: "14%", bottom: 0, height: `${Math.max(2, (d.valor / max) * 100)}%`, background: bg }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const USOS = [
  { t: "Consultar bases na linguagem de cada fonte", d: "O Catálogo apresenta cada base com a sua entidade nativa, versão, regime de retenção e marca de integridade (fixity), sem imposição de esquema unificado.", acao: "Abrir o Catálogo", alvo: "catalogo" },
  { t: "Comparar séries em eixo temporal comum", d: "Este painel permite ler, ano a ano, séries de domínios distintos — fomento direto e indireto, demanda, oferta de salas e preço — sem harmonizá-las, com as respectivas ressalvas à vista.", nota: "Disponível neste painel." },
  { t: "Cruzar bases mediante chaves explícitas", d: "Um cruzamento é registrado como receita (eixo de ligação, regra e versões das fontes) e reexecutado sob demanda. O resultado distingue elementos ligados e órfãos; estes são tratados como achado, e não como descarte.", acao: "Abrir Cruzamentos", alvo: "cruzamentos" },
  { t: "Percorrer cadeias de entidades entre bases", d: "O Percurso encadeia entidades de bases distintas e classifica cada articulação como factual, derivada ou ausente, de modo que a inferência se distinga do dado.", acao: "Abrir Percurso", alvo: "percurso" },
  { t: "Acompanhar um cruzamento ao longo do tempo", d: "Execuções sucessivas de um mesmo cruzamento constituem série temporal; variações decorrentes de migração de esquema são sinalizadas, para que não sejam lidas como fenômeno.", acao: "Abrir Trajetória", alvo: "trajetoria" },
  { t: "Documentar lacunas como contrato de base faltante", d: "Quando nenhuma base fecha um elo, a Sonda formula a pergunta de pesquisa e a hipótese de eixo de ligação que a base ausente deveria satisfazer, convertendo a lacuna em especificação.", acao: "Abrir Percurso", alvo: "percurso" },
  { t: "Divergir de uma regra sem perder a linhagem", d: "A bifurcação deriva nova receita a partir de outra, preservando autoria e filiação, de modo que a discordância metodológica se torne objeto rastreável.", acao: "Abrir Cruzamentos", alvo: "cruzamentos" },
  { t: "Citar e reproduzir", d: "Toda resposta traz proveniência, revisão da fonte e marca de integridade, e as ressalvas acompanham os dados. A mesma consulta, sobre a mesma revisão, reproduz o mesmo resultado.", nota: "Ver as bases lidas ao fim deste painel." },
];

const QUESTOES = [
  { q: "Em que medida a retração da oferta de salas em 2020 repercutiu sobre o público das obras brasileiras e sobre a contratação do FSA?", s: "salas abertas · público · fomento direto" },
  { q: "O fomento direto (FSA) e o fomento indireto (renúncia fiscal) acompanham trajetórias semelhantes ou se compensam?", s: "fomento direto · fomento indireto" },
  { q: "O preço médio do ingresso, em R$ de 2024, manteve-se estável enquanto o público oscilava?", s: "preço do ingresso · público" },
  { q: "A recomposição do parque exibidor após 2020 foi acompanhada de recomposição da demanda por obras brasileiras?", s: "salas abertas · público" },
];

function Painel({ ir }) {
  const [moeda, setMoeda] = useState("real");
  const [anoSel, setAnoSel] = useState(null);
  const { env, erro, carregando } = useEnvelope(() => SondaAPI.series({ de: 2009, ate: 2026, moeda }), [moeda]);
  const dados = env?.dados;
  const anos = dados?.anos || [];
  const series = dados?.series || [];
  const ano = anoSel ?? (series.length ? anoPadrao(series, anos) : null);
  const idx = anos.indexOf(ano);
  const prov = Array.isArray(env?.proveniencia) ? env.proveniencia : [];
  const real = moeda === "real";
  const botaoMoeda = (valor, rotulo, primeiro) => (
    <button type="button" onClick={() => setMoeda(valor)} aria-pressed={moeda === valor}
      style={{ minHeight: 44, padding: "0 18px", border: `2px solid ${S.tinta}`, borderRight: primeiro ? "none" : `2px solid ${S.tinta}`, background: moeda === valor ? S.tinta : S.papel, color: moeda === valor ? S.papel : S.tinta, fontFamily: FONTE_UI, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
      {rotulo}
    </button>
  );
  const passo = (d) => setAnoSel(Math.min(anos[anos.length - 1], Math.max(anos[0], ano + d)));
  const secao = { display: "flex", flexDirection: "column", gap: 18 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 56, fontFamily: FONTE_UI }}>

      <section style={{ display: "flex", flexWrap: "wrap", gap: "28px 64px", alignItems: "flex-end", borderBottom: `4px solid ${S.tinta}`, paddingBottom: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, letterSpacing: ".14em", color: S.mudo }}>ANO LIDO PELA SONDA</span>
          <span aria-live="polite" style={{ fontWeight: 800, fontStretch: "62%", fontSize: 184, lineHeight: 0.8, letterSpacing: "-.02em", color: S.sinal, fontVariantNumeric: "tabular-nums", minHeight: 148 }}>{ano ?? "····"}</span>
        </div>
        <div style={{ flex: "1 1 440px", maxWidth: 700, display: "flex", flexDirection: "column", gap: 18 }}>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.3, fontWeight: 600, letterSpacing: "-.005em" }}>
            Este painel dispõe, sobre o único eixo que lhes é comum — o ano —, cinco séries oriundas de duas bases distintas: o banco de pesquisa sobre o Fundo Setorial do Audiovisual (FSA) e o repositório RIDAB.
          </h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55 }}>
            Cada série conserva a sua unidade, a sua escala e as suas ressalvas; nenhuma foi somada, indexada ou reconciliada com as demais, em observância ao princípio da incomensurabilidade que orienta a Sonda. Desloque a sonda pelos anos — com o cursor, o controle deslizante ou as setas — para ler, em cada série, o valor do ano selecionado.
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "8px 22px", fontSize: 14, color: S.tinta }}>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 14, height: 14, background: S.sinal, display: "inline-block" }} />ano lido</li>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 14, height: 14, background: S.tinta, display: "inline-block" }} />demais anos</li>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 14, height: 14, display: "inline-block", boxSizing: "border-box", border: `1px solid ${S.tinta}`, background: `repeating-linear-gradient(135deg, ${S.tinta} 0 3px, ${S.papel} 3px 5px)` }} />dado parcial</li>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 14, height: 14, display: "inline-block", background: HACHURA_VAZIO }} />sem dado</li>
            <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 0, height: 16, borderLeft: `2px dashed ${S.sonar}`, display: "inline-block" }} />a sonda</li>
          </ul>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 16px" }}>
            <span id="rot-moeda" style={{ fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, letterSpacing: ".1em", color: S.mudo }}>VALORES EM</span>
            <div role="group" aria-labelledby="rot-moeda" style={{ display: "flex" }}>
              {botaoMoeda("nominal", "R$ correntes", true)}
              {botaoMoeda("real", "R$ de 2024 (IPCA)", false)}
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: S.mudo }}>O seletor aplica-se às séries monetárias (fomento direto, fomento indireto e preço do ingresso). Em R$ de 2024, o fator do IPCA corresponde ao ano do evento.</p>
        </div>
      </section>

      <Estado carregando={carregando} erro={erro} vazio={series.length === 0} vazioMsg="Nenhuma série disponível. Verifique se a base FSA está instalada (baixar_fsa.py).">
        <section aria-label="Escolher o ano" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button type="button" onClick={() => passo(-1)} aria-label="Ano anterior" style={{ flex: "0 0 44px", height: 44, border: `2px solid ${S.tinta}`, background: S.papel, color: S.tinta, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>◀</button>
          <input type="range" min={anos[0]} max={anos[anos.length - 1]} step={1} value={ano ?? anos[0]} onChange={(e) => setAnoSel(parseInt(e.target.value, 10))} aria-label="Ano lido pela sonda" style={{ flex: "1 1 auto", minWidth: 0, height: 44, accentColor: S.tinta, cursor: "pointer" }} />
          <button type="button" onClick={() => passo(1)} aria-label="Próximo ano" style={{ flex: "0 0 44px", height: 44, border: `2px solid ${S.tinta}`, background: S.papel, color: S.tinta, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>▶</button>
        </section>

        <section aria-label="Séries lidas pela sonda" style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 920, position: "relative" }}>
            <div style={{ display: "flex" }}>
              <div style={{ flex: "0 0 320px" }} />
              <div style={{ flex: "1 1 0", minWidth: 0, display: "grid", gridTemplateColumns: `repeat(${anos.length}, minmax(0,1fr))`, fontFamily: FONTE_NUM, fontSize: 12.5, textAlign: "center", paddingBottom: 8, borderBottom: `2px solid ${S.tinta}` }}>
                {anos.map((a) => <span key={a} style={{ fontWeight: a === ano ? 700 : 400, color: a === ano ? S.sinalTxt : S.mudo }}>{a}</span>)}
              </div>
            </div>
            {series.map((s, i) => <LinhaSerie key={s.id} s={s} n={i + 1} anos={anos} idx={idx} ano={ano} aoMudarAno={setAnoSel} />)}
            <div aria-hidden="true" style={{ position: "absolute", top: 30, bottom: 0, left: `calc(320px + (100% - 320px) * ${(idx + 0.5) / anos.length})`, width: 0, borderLeft: `2px dashed ${S.sonar}`, pointerEvents: "none" }} />
          </div>
        </section>

        <section aria-labelledby="sec-diversidade" style={secao}>
          <TituloSecao id="sec-diversidade">Diversidade das séries</TituloSecao>
          <p style={{ margin: 0, maxWidth: 820, fontSize: 16, lineHeight: 1.55 }}>
            As séries diferem quanto à base de origem, ao domínio, à unidade e à cobertura temporal. Tal heterogeneidade é preservada e declarada, não suprimida; cabe ao pesquisador decidir se, e sob que critérios, as séries podem ser confrontadas.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760, fontSize: 15 }}>
              <caption style={{ position: "absolute", left: -9999 }}>Quadro comparativo das séries do painel</caption>
              <thead>
                <tr style={{ borderBottom: `2px solid ${S.tinta}` }}>
                  {["Série", "Domínio", "Base", "Unidade", "Cobertura", "Anos com dado"].map((h) => <th key={h} scope="col" style={{ textAlign: "left", padding: "10px 14px 10px 0", fontWeight: 700 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${S.linha}` }}>
                    <th scope="row" style={{ textAlign: "left", fontWeight: 600, padding: "12px 14px 12px 0" }}>{s.titulo}</th>
                    <td style={{ padding: "12px 14px 12px 0" }}>{DOMINIO[s.id] || "—"}</td>
                    <td style={{ padding: "12px 14px 12px 0", fontFamily: FONTE_NUM, fontSize: 14 }}>{ROTULO_BASE[s.base] || s.base}</td>
                    <td style={{ padding: "12px 14px 12px 0" }}>{s.unidade}</td>
                    <td style={{ padding: "12px 14px 12px 0", fontFamily: FONTE_NUM, fontSize: 14 }}>{s.cobertura.de ?? "—"}–{s.cobertura.ate ?? "—"}</td>
                    <td style={{ padding: "12px 0", fontFamily: FONTE_NUM, fontSize: 14 }}>{s.dados.filter((d) => d.valor != null).length} de {anos.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="sec-ressalvas" style={{ display: "flex", flexWrap: "wrap", gap: "24px 56px" }}>
          <div style={{ flex: "0 0 240px" }}><TituloSecao id="sec-ressalvas">Ressalvas de cada série</TituloSecao></div>
          <ol style={{ flex: "1 1 560px", margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 14, fontSize: 15.5, lineHeight: 1.5 }}>
            {series.map((s, i) => (
              <li key={s.id} style={{ display: "flex", gap: 16 }}>
                <span style={{ flex: "0 0 22px", fontFamily: FONTE_NUM, fontWeight: 600, color: S.sinalTxt }}>{i + 1}</span>
                <span><strong>{s.titulo}.</strong> {s.ressalvas.join(" ")}</span>
              </li>
            ))}
          </ol>
        </section>
      </Estado>

      <section aria-labelledby="sec-usos" style={{ ...secao, borderTop: `4px solid ${S.tinta}`, paddingTop: 28 }}>
        <TituloSecao id="sec-usos">Possibilidades de uso da Sonda</TituloSecao>
        <p style={{ margin: 0, maxWidth: 860, fontSize: 16, lineHeight: 1.55 }}>
          A Sonda é concebida como agregador de segunda ordem: não substitui as bases de origem, mas permite consultá-las em sua linguagem própria, confrontá-las mediante chaves explícitas e documentar o percurso analítico. Ao pesquisador são facultadas as operações descritas a seguir, cada qual acessível por uma das visões da aplicação.
        </p>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: "28px 48px" }}>
          {USOS.map((u, i) => (
            <li key={u.t} style={{ borderTop: `2px solid ${S.tinta}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, color: S.mudo }}>{String(i + 1).padStart(2, "0")}</span>
              <h3 style={{ margin: 0, fontSize: 19, lineHeight: 1.25, fontWeight: 700 }}>{u.t}</h3>
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55 }}>{u.d}</p>
              {u.alvo
                ? <button type="button" onClick={() => ir(u.alvo)} style={{ alignSelf: "flex-start", minHeight: 44, padding: 0, border: "none", background: "transparent", color: S.sonar, fontFamily: FONTE_UI, fontWeight: 700, fontSize: 15, textDecoration: "underline", cursor: "pointer" }}>{u.acao} →</button>
                : <span style={{ fontSize: 14, color: S.mudo }}>{u.nota}</span>}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="sec-questoes" style={secao}>
        <TituloSecao id="sec-questoes">Questões que o painel permite formular</TituloSecao>
        <p style={{ margin: 0, maxWidth: 820, fontSize: 16, lineHeight: 1.55 }}>As questões a seguir são ilustrativas. A coincidência temporal entre séries sugere hipóteses; não estabelece causalidade.</p>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
          {QUESTOES.map((x, i) => (
            <li key={i} style={{ display: "flex", flexWrap: "wrap", gap: "6px 24px", padding: "16px 0", borderTop: `1px solid ${S.linha}` }}>
              <span style={{ flex: "0 0 28px", fontFamily: FONTE_NUM, fontWeight: 600, color: S.mudo }}>{i + 1}.</span>
              <span style={{ flex: "1 1 460px", fontSize: 18, lineHeight: 1.4, fontWeight: 600 }}>{x.q}</span>
              <span style={{ flex: "0 1 260px", fontFamily: FONTE_NUM, fontSize: 12.5, color: S.mudo }}>séries: {x.s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Bases lidas" style={{ display: "flex", flexWrap: "wrap", gap: "24px 48px", borderTop: `4px solid ${S.tinta}`, paddingTop: 24 }}>
        {prov.map((p) => (
          <div key={p.fonte} style={{ flex: "1 1 440px", display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={{ margin: 0, fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, letterSpacing: ".1em", color: S.mudo }}>{p.fonte}</h3>
            {p.descricao && <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.5 }}>{p.descricao}</p>}
            <p style={{ margin: 0, fontFamily: FONTE_NUM, fontSize: 13, color: S.tinta, wordBreak: "break-all" }}>
              versão: {p.instancia_versao}{p.licenca ? ` · licença: ${p.licenca}` : ""}
            </p>
            <p style={{ margin: 0, fontFamily: FONTE_NUM, fontSize: 13, color: S.mudo, wordBreak: "break-all" }}>fixity: {p.fixity}</p>
          </div>
        ))}
      </section>
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
      <span id="rot-moeda-t" style={{ fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, letterSpacing: ".1em", color: S.mudo }}>VALORES EM</span>
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
      <h3 style={{ margin: 0, fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, letterSpacing: ".1em", lineHeight: 1.4 }}>
        {titulo}<br /><span style={{ color: S.mudo }}>{subtitulo}</span>
      </h3>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 44, fontFamily: FONTE_UI }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 16, borderBottom: `4px solid ${S.tinta}`, paddingBottom: 30 }}>
        <span style={{ fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, letterSpacing: ".14em", color: S.mudo }}>TERRITÓRIO · FOMENTO DO FSA E SALAS DE EXIBIÇÃO, POR UF</span>
        <h1 style={{ margin: 0, fontWeight: 800, fontStretch: "62%", textTransform: "uppercase", fontSize: "clamp(48px, 8vw, 104px)", lineHeight: 0.92, letterSpacing: "-.01em" }}>
          {conc ? <>{conc.ufs.join(" e ")}: <span style={{ color: S.sinal }}>{fmtNum(conc.parte_salas, 0)}%</span> das salas, <span style={{ color: S.sinal }}>{fmtNum(conc.parte_fomento, 0)}%</span> do fomento</> : "Território"}
        </h1>
        <p style={{ margin: 0, maxWidth: 840, fontSize: 16, lineHeight: 1.55 }}>
          Cada quadrado representa uma unidade da federação, todas de igual tamanho: o cartograma indica posição, não área. O fomento corresponde ao valor contratado entre 2009 e 2024 pelo FSA, atribuído à UF da produtora proponente, e não ao local de realização da obra. Selecione uma UF — por clique ou pela lista — para ler os seus indicadores.
        </p>
        <SeletorMoeda moeda={moeda} aoMudar={setMoeda} />
      </section>

      <Estado carregando={carregando} erro={erro} vazio={!sel} vazioMsg="Nenhum dado territorial disponível. Verifique se a base FSA está instalada.">
        {sel && (
          <section style={{ display: "flex", flexWrap: "wrap", gap: "40px 56px", alignItems: "flex-start" }}>
            <div style={{ flex: "0 1 788px", minWidth: 0, display: "flex", flexWrap: "wrap", gap: "36px 40px", alignItems: "flex-start" }}>
              <MapaUF titulo="■ A · FOMENTO FSA ACUMULADO" subtitulo={unidade.toUpperCase()} ufs={ufs} ufSel={sel.sigla} aoSel={setUf}
                texto={(u) => ({ curto: fmtNum(u.fomento_mi, 0), aria: `${fmtNum(u.fomento_mi, 1)} ${unidade} de fomento` })}
                cor={(u) => ({ bg: RAMPA_FOMENTO[binFomento(u.fomento_mi)], fg: TEXTO_RAMPA[binFomento(u.fomento_mi)] })}
                legenda={[["<10", 0], ["10–30", 1], ["30–100", 2], ["100–300", 3], ["≥300", 4]].map(([rotulo, i]) => ({ rotulo, cor: RAMPA_FOMENTO[i] }))} />
              <MapaUF titulo="▲ B · SALAS POR 100 MIL HABITANTES" subtitulo={`MÉDIA NACIONAL ${fmtNum(d.media_nacional_salas_100mil, 2)}`} ufs={ufs} ufSel={sel.sigla} aoSel={setUf}
                texto={(u) => (u.verificar ? { curto: "?", aria: "população a verificar" } : { curto: fmtNum(u.salas_por_100mil, 2), aria: `${fmtNum(u.salas_por_100mil, 2)} salas por 100 mil habitantes` })}
                cor={(u) => (u.verificar ? { bg: HACHURA_VERIFICAR, fg: S.tinta } : { bg: RAMPA_SALAS[binSalas(u.salas_por_100mil)], fg: TEXTO_RAMPA[binSalas(u.salas_por_100mil)] })}
                legenda={[["<1,0", 0], ["1,0–1,5", 1], ["1,5–2,0", 2], ["2,0–2,5", 3], ["≥2,5", 4]].map(([rotulo, i]) => ({ rotulo, cor: RAMPA_SALAS[i] })).concat([{ rotulo: "a verificar", cor: HACHURA_VERIFICAR }])} />
            </div>

            <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor="uf-sel" style={{ fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, letterSpacing: ".1em", color: S.mudo }}>UF LIDA</label>
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
                  {linhaDl("Parte do fomento com UF", `${fmtNum(sel.parte_fomento, 1)}%`)}
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
                <h3 style={{ margin: 0, fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, letterSpacing: ".1em", lineHeight: 1.4 }}>
                  PARTE DAS SALAS × PARTE DO FOMENTO<br /><span style={{ color: S.mudo }}>ACIMA DA DIAGONAL: MAIS FOMENTO QUE SALAS</span>
                </h3>
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

        <section aria-labelledby="sec-terr-notas" style={{ display: "flex", flexWrap: "wrap", gap: "24px 56px", borderTop: `4px solid ${S.tinta}`, paddingTop: 24 }}>
          <div style={{ flex: "0 0 240px" }}><TituloSecao id="sec-terr-notas">Ressalvas do mapa</TituloSecao></div>
          <ul style={{ flex: "1 1 560px", margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12, fontSize: 15.5, lineHeight: 1.5 }}>
            {ressalvas.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </section>
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
      <div style={{ flex: "0 0 300px", maxWidth: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontFamily: FONTE_NUM, fontSize: 12.5, fontWeight: 600, letterSpacing: ".1em", color: ausente ? S.sinalTxt : S.mudo }}>SALTO {n} · {tipo}</span>
        <h3 style={{ margin: 0, fontWeight: 800, fontStretch: "68%", textTransform: "uppercase", fontSize: 34, lineHeight: 1 }}>{titulo}</h3>
        <span style={{ fontSize: 14.5 }}>{chave}</span>
        {fonte && <span style={{ fontFamily: FONTE_NUM, fontSize: 12.5, color: S.mudo }}>{fonte}</span>}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 56, fontFamily: FONTE_UI }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 16, borderBottom: `4px solid ${S.tinta}`, paddingBottom: 30 }}>
        <span style={{ fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, letterSpacing: ".14em", color: S.mudo }}>LIGAÇÕES · DO CONTRATO À BILHETERIA</span>
        <h1 style={{ margin: 0, fontWeight: 800, fontStretch: "62%", textTransform: "uppercase", fontSize: "clamp(48px, 8vw, 104px)", lineHeight: 0.92, letterSpacing: "-.01em" }}>
          {seg ? <><span style={{ color: S.sinal }}>{f0(seg.sem_obra.parte)}%</span> dos contratos do FSA não chegam a uma obra</> : "Ligações"}
        </h1>
        <p style={{ margin: 0, maxWidth: 860, fontSize: 16, lineHeight: 1.55 }}>
          {d ? `${f0(d.contratos.total)} contratos, R$ ${fmtNum(d.contratos.valor_mi / 1000, 2)} bi correntes. ` : ""}
          Cruzar bases é ligar a chave de uma à chave de outra, e o que não se liga constitui resultado: cada salto abaixo indica o que se liga, o que sobra e o que nenhuma base fecha. Os que sobram são tratados como achado, e não como descarte.
        </p>
      </section>

      <Estado carregando={carregando} erro={erro} vazio={!d} vazioMsg="Nenhum dado disponível. Verifique se a base FSA está instalada.">
        {d && (
          <>
            <section aria-label="Os três saltos" style={{ display: "flex", flexDirection: "column" }}>
              <Salto n={1} tipo="FACTUAL" titulo="Contrato → Obra" chave="chave: nº do contrato (conj. 11) e, na falta dele, título único" fonte="FSA · fato_contrato_serie">
                <div style={{ display: "flex", height: 76, border: `2px solid ${S.tinta}` }}>
                  <Segmento peso={seg.seguro.parte} fundo={S.tinta} cor="#FFFFFF" grande={f0(seg.seguro.contratos)} pequeno={`ligados · ${f1(seg.seguro.parte)}%`} />
                  <Segmento peso={Math.max(seg.ambiguo.parte, 0.4)} fundo={`repeating-linear-gradient(135deg, ${S.tinta} 0 2px, ${S.papel} 2px 5px)`} />
                  <Segmento peso={seg.sem_obra.parte} fundo={S.sinal} cor={S.tinta} grande={f0(seg.sem_obra.contratos)} pequeno={`sem obra · ${f1(seg.sem_obra.parte)}%`} />
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "8px 28px", fontSize: 14.5 }}>
                  <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 14, height: 14, background: S.tinta, display: "inline-block" }} />vínculo seguro: R$ {fmtNum(seg.seguro.valor_mi, 1)} mi</li>
                  <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 14, height: 14, display: "inline-block", border: `1px solid ${S.tinta}`, boxSizing: "border-box", background: `repeating-linear-gradient(135deg, ${S.tinta} 0 2px, ${S.papel} 2px 5px)` }} />título ambíguo ({f0(seg.ambiguo.contratos)}): R$ {fmtNum(seg.ambiguo.valor_mi, 1)} mi</li>
                  <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 14, height: 14, background: S.sinal, display: "inline-block" }} />sem obra: R$ {fmtNum(seg.sem_obra.valor_mi, 1)} mi</li>
                </ul>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>
                  {f0(nMetodo("num_contrato"))} contratos ligam pelo número do contrato (confiança 1,00) e {f0(nMetodo("titulo"))} pelo título único (0,95). Os {f0(seg.ambiguo.contratos)} de título ambíguo (0,60) ficam fora das análises até triagem manual. Valores em R$ correntes.
                </p>
              </Salto>

              <Salto n={2} tipo="FACTUAL" titulo="Obra → Bilheteria" chave="chave: CPB (certificado da obra), conj. 28 da ANCINE" fonte="FSA · fato_bilheteria">
                <div style={{ display: "flex", height: 76, border: `2px solid ${S.tinta}` }}>
                  <Segmento peso={ob.parte_com_bilheteria} fundo={S.tinta} cor="#FFFFFF" grande={f0(ob.com_bilheteria)} pequeno={`com bilheteria · ${f1(ob.parte_com_bilheteria)}%`} />
                  <Segmento peso={100 - ob.parte_com_bilheteria} fundo={HACHURA_VAZIO} grande={f0(ob.sem_bilheteria)} pequeno={`sem bilheteria · ${f1(100 - ob.parte_com_bilheteria)}%`} hachura />
                </div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>
                  De {f0(ob.obras_com_vinculo_seguro)} obras com vínculo seguro, {f0(ob.com_bilheteria)} constam no conj. 28, que só registra cinema. Hipótese para as demais: obras de TV ou VoD, ou ainda sem lançamento em sala. A Sonda não verificou essa hipótese.
                </p>
              </Salto>

              <Salto n={3} tipo="ELO AUSENTE" titulo={`${ausente.de} → ${ausente.para}`} chave="chave: nenhuma base do catálogo fecha este elo" ausente>
                <div style={{ border: `2px dashed ${S.sinalTxt}`, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
                  <span style={{ fontFamily: FONTE_NUM, fontSize: 12.5, fontWeight: 600, letterSpacing: ".12em", color: S.sinalTxt }}>PERGUNTA DE PESQUISA</span>
                  <p style={{ margin: 0, fontSize: 28, lineHeight: 1.2, fontWeight: 700, letterSpacing: "-.01em" }}>{ausente.pergunta}</p>
                  <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.5 }}>
                    <strong>Candidato no catálogo:</strong> {ausente.candidato.base} <span style={{ fontFamily: FONTE_NUM, fontSize: 14 }}>{ausente.candidato.tabela}</span>, com {f0(ausente.candidato.linhas)} linhas de público por município, filme e ano. As chaves possíveis são {ausente.candidato.chaves.map((c, i) => <React.Fragment key={c}>{i > 0 ? " ou " : ""}<span style={{ fontFamily: FONTE_NUM, fontSize: 14 }}>{c}</span></React.Fragment>)}. {ausente.candidato.observacao}
                  </p>
                  <button type="button" onClick={() => ir("percurso")} style={{ alignSelf: "flex-start", minHeight: 44, padding: "0 20px", border: `2px solid ${S.tinta}`, background: S.papel, color: S.tinta, fontFamily: FONTE_UI, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Ver o contrato de base faltante no Percurso →</button>
                </div>
              </Salto>
            </section>

            <section style={{ display: "flex", flexWrap: "wrap", gap: "40px 56px", alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                <TituloSecao>Quem sobra, ano a ano</TituloSecao>
                <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.5 }}>Parte dos contratos sem obra vinculada, por ano de publicação no DOU. Abaixo de cada ano, o número de contratos (n): nos primeiros anos são poucos, e a porcentagem oscila.</p>
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
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>
                  Nos anos mais recentes, mais de 60% dos contratos ainda não têm obra vinculada. Hipótese: obras ainda não lançadas ou certificadas. A taxa de retorno do fomento, portanto, não pode ser lida sem considerar o ano do contrato.
                </p>
              </div>

              <div style={{ flex: "1 1 440px", minWidth: 0, display: "flex", flexDirection: "column", gap: 32 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <TituloSecao>Onde estão os órfãos</TituloSecao>
                  <p style={{ margin: 0, fontSize: 14.5 }}>Chamadas com mais contratos sem obra, e a parte que isso representa em cada uma:</p>
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
                  <TituloSecao>Os maiores sem obra</TituloSecao>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420, fontSize: 14.5 }}>
                      <caption style={{ textAlign: "left", fontSize: 13.5, color: S.mudo, paddingBottom: 8 }}>Cinco maiores contratos sem obra, em R$ mi correntes.</caption>
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

            <section aria-labelledby="sec-chaves" style={{ display: "flex", flexDirection: "column", gap: 20, borderTop: `4px solid ${S.tinta}`, paddingTop: 28 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 32px" }}>
                <TituloSecao id="sec-chaves">Mapa de chaves</TituloSecao>
                <p style={{ margin: 0, fontSize: 15.5, maxWidth: 780 }}>As chaves que cada tabela carrega definem o que pode ser cruzado com o quê. ● possui · ± parcial · ○ não possui. Verificado em 2026-11-02 (ver docs/RIDAB_INVENTARIO.md).</p>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, fontSize: 15 }}>
                  <caption style={{ position: "absolute", left: -9999 }}>Chaves de junção presentes em cada tabela</caption>
                  <thead><tr style={{ borderBottom: `2px solid ${S.tinta}` }}>{CHAVES_COLUNAS.map((h) => <th key={h} scope="col" style={{ textAlign: "left", padding: "10px 12px 10px 0", fontWeight: 700 }}>{h}</th>)}</tr></thead>
                  <tbody style={{ fontFamily: FONTE_NUM, fontSize: 14 }}>
                    {CHAVES.map((linha, i) => (
                      <tr key={linha[0]} style={{ borderBottom: i === CHAVES.length - 1 ? `2px solid ${S.tinta}` : `1px solid ${S.linha}` }}>
                        <th scope="row" style={{ textAlign: "left", fontFamily: FONTE_UI, fontSize: 15, fontWeight: 600, padding: "12px 12px 12px 0" }}>{linha[0]}</th>
                        {linha.slice(1).map((c, j) => <td key={j} style={{ padding: "12px 12px 12px 0" }}>{c ?? `± ${fmtNum(seg.seguro.parte, 1)}%`}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 40px" }}>
                {[["91,5%", "dos contratos ganham o código IBGE do município via CNPJ (4.094 de 4.473, pelo cadastro atual de agentes do RIDAB)."],
                  ["89,1%", "das obras com fomento indireto ganham o valor captado via SALIC (2.780 de 3.120 projetos distintos)."],
                  [`${f1(seg.seguro.parte)}%`, "dos contratos do FSA ligam a uma obra. O RIDAB não traz CPB nos contratos e, isoladamente, não melhora essa taxa."]].map(([n, t]) => (
                  <div key={n} style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontFamily: FONTE_NUM, fontSize: 34, fontWeight: 600, lineHeight: 1.05 }}>{n}</span>
                    <span style={{ fontSize: 14.5, lineHeight: 1.45 }}>{t}</span>
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="sec-lig-notas" style={{ display: "flex", flexWrap: "wrap", gap: "24px 56px", borderTop: `4px solid ${S.tinta}`, paddingTop: 24 }}>
              <div style={{ flex: "0 0 240px" }}><TituloSecao id="sec-lig-notas">Ressalvas</TituloSecao></div>
              <ul style={{ flex: "1 1 560px", margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12, fontSize: 15.5, lineHeight: 1.5 }}>
                {d.ressalvas.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </section>
          </>
        )}
      </Estado>
    </div>
  );
}

// ============ CATÁLOGO: as bases agregadas, cada uma na sua língua ============
const ORDEM = {
  1: "1ª ordem · coletada da fonte pela Sonda",
  2: "2ª ordem · base de pesquisa já constituída",
  3: "3ª ordem · dados oficiais tratados por terceiros",
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
    + `Marca de integridade (fixity): ${p.fixity || "—"}. Acesso em: ${hoje}.`;
}

function BaseCatalogo({ b, snaps, ir }) {
  const [copiado, setCopiado] = useState(null);
  const nome = NOME_BASE[b.base] || b.base;
  // proveniência: a que a API envia por base (FSA, RIDAB) ou o snapshot mais recente (bases coletadas).
  const s0 = snaps[0];
  const p = b.proveniencia || (s0 ? { fonte: s0.fonte, instancia_versao: s0.instancia_versao, fixity: s0.fixity, regime_retencao: s0.politica_retencao?.regime } : null);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(citacao(nome, p)); setCopiado("Citação copiada para a área de transferência."); }
    catch { setCopiado("Não foi possível copiar automaticamente; selecione e copie o texto da proveniência."); }
  };
  const linha = (rotulo, valor, mono) => valor == null || valor === "" ? null : (
    <React.Fragment key={rotulo}>
      <dt style={{ color: S.mudo, fontSize: 14.5 }}>{rotulo}</dt>
      <dd style={{ margin: 0, fontFamily: mono ? FONTE_NUM : FONTE_UI, fontSize: mono ? 13.5 : 15.5, wordBreak: "break-all" }}>{valor}</dd>
    </React.Fragment>
  );
  return (
    <li style={{ display: "flex", flexWrap: "wrap", gap: "20px 40px", padding: "28px 0", borderBottom: `1px solid ${S.linha}` }}>
      <div style={{ flex: "0 0 300px", maxWidth: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontFamily: FONTE_NUM, fontSize: 12.5, fontWeight: 600, letterSpacing: ".1em", color: S.mudo }}>{ORDEM[b.ordem] || "—"}</span>
        <h3 style={{ margin: 0, fontWeight: 800, fontStretch: "68%", textTransform: "uppercase", fontSize: 38, lineHeight: 1, letterSpacing: ".01em" }}>{nome}</h3>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{DESCRICAO_BASE[b.base] || ""}</p>
        <p style={{ margin: "8px 0 0", display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: FONTE_NUM, fontSize: 34, fontWeight: 600, lineHeight: 1 }}>{fmtNum(b.n_registros, 0)}</span>
          <span style={{ fontSize: 14.5, color: S.mudo }}>{b.unidade_registro || "registros"}</span>
        </p>
      </div>
      <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "150px 1fr", gap: "8px 20px", alignItems: "baseline" }}>
          {linha("Entidade nativa", b.entidade_nativa)}
          {linha("Fonte", p?.fonte)}
          {linha("Versão", p?.instancia_versao, true)}
          {linha("Fixity", p?.fixity, true)}
          {linha("Retenção", p?.regime_retencao)}
          {linha("Autoria", p?.autoria)}
          {linha("Licença", p?.licenca)}
          {linha("Origem declarada", p?.origem_declarada)}
          {b.tabelas_e_visoes != null && linha("Estrutura", `${b.tabelas_e_visoes} tabelas e visões`)}
          {b.tabelas_lidas && linha("Tabelas lidas", b.tabelas_lidas.join(" · "), true)}
        </dl>
        {!p && <p style={{ margin: 0, fontSize: 14.5, color: S.mudo }}>Sem proveniência registrada para esta base.</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          {p && <button type="button" onClick={copiar} style={{ minHeight: 44, padding: "0 20px", border: `2px solid ${S.tinta}`, background: S.papel, color: S.tinta, fontFamily: FONTE_UI, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Copiar citação</button>}
          {(b.base === "fsa" || b.base === "ridab") && <button type="button" onClick={() => ir("painel")} style={{ minHeight: 44, padding: 0, border: "none", background: "transparent", color: S.sonar, fontFamily: FONTE_UI, fontWeight: 700, fontSize: 15, textDecoration: "underline", cursor: "pointer" }}>Ler no Painel →</button>}
          <span role="status" style={{ fontSize: 14, color: S.mudo }}>{copiado}</span>
        </div>
      </div>
    </li>
  );
}

function Catalogo({ ir }) {
  const { env, erro, carregando } = useEnvelope(() => SondaAPI.catalogo());
  const bases = env?.dados || [];
  // proveniência vem como lista [{fonte, snapshots:[...]}] — lado a lado, não fundida.
  const provPorFonte = Array.isArray(env?.proveniencia) ? env.proveniencia : [];
  const snapsDaBase = (entidade) =>
    provPorFonte.flatMap((p) => (p.snapshots || []).filter((s) => s.entidade === entidade).map((s) => ({ ...s, fonte: p.fonte })));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40, fontFamily: FONTE_UI }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 16, borderBottom: `4px solid ${S.tinta}`, paddingBottom: 30 }}>
        <span style={{ fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, letterSpacing: ".14em", color: S.mudo }}>CATÁLOGO · BASES AGREGADAS</span>
        <h1 style={{ margin: 0, fontWeight: 800, fontStretch: "62%", textTransform: "uppercase", fontSize: "clamp(48px, 8vw, 104px)", lineHeight: 0.92, letterSpacing: "-.01em" }}>
          {bases.length ? <><span style={{ color: S.sinal }}>{bases.length}</span> bases, cada uma na sua língua</> : "Catálogo"}
        </h1>
        <p style={{ margin: 0, maxWidth: 860, fontSize: 16, lineHeight: 1.55 }}>
          As bases são apresentadas com a sua entidade nativa, versão e marca de integridade (fixity), sem imposição de esquema unificado. Cada base declara a sua ordem de agregação — coletada da fonte, constituída por pesquisa ou tratada por terceiros —, porque a distância entre o dado e a fonte de origem condiciona o que dele se pode afirmar.
        </p>
      </section>
      <Estado carregando={carregando} erro={erro} vazio={bases.length === 0} vazioMsg="Catálogo vazio: execute a ingestão (seed.py ou coleta_real_mapas.py).">
        <ol style={{ margin: 0, padding: 0, listStyle: "none", borderTop: `2px solid ${S.tinta}` }}>
          {bases.map((b) => <BaseCatalogo key={`${b.base}:${b.entidade_nativa}`} b={b} snaps={snapsDaBase(b.entidade_nativa)} ir={ir} />)}
        </ol>
        <section aria-labelledby="sec-falta" style={{ display: "flex", flexWrap: "wrap", gap: "16px 40px", alignItems: "center", border: `2px dashed ${S.sinalTxt}`, padding: "24px 28px" }}>
          <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 6 }}>
            <TituloSecao id="sec-falta">Base faltante</TituloSecao>
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.5 }}>A Sonda cresce pelas bordas: cada elo ausente especifica o conjunto de dados que o preencheria.</p>
          </div>
          <button type="button" onClick={() => ir("ligacoes")} style={{ minHeight: 44, padding: "0 20px", border: `2px solid ${S.tinta}`, background: S.papel, color: S.tinta, fontFamily: FONTE_UI, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Ver os elos ausentes →</button>
        </section>
      </Estado>
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
        <Botao cor={S.sinalTxt} onClick={reexecutar} ocupado={ocupado}>▶ re-executar travessia</Botao>
        {resumo && (
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: S.mudo }}>
            <span style={{ color: S.sonar }}>{resumo.ligados_total} ligados</span> ·{" "}
            <span style={{ color: S.sinalTxt }}>{resumo.orfaos_total} órfãos</span> ·{" "}
            <span style={{ color: S.sinalTxt }}>{resumo.n_elos_ausentes} elo(s) ausente(s)</span> ·{" "}
            {resumo.n_derivados} derivado(s)
          </span>
        )}
      </div>
      <Falha erro={falha} />

      <Estado carregando={carDet || carUlt} erro={erroDet} vazio={!definicao}>
        <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 18, marginTop: 12, alignItems: "start" }}>
          <div style={{ background: S.papel, border: `1px solid ${S.linha}`, borderRadius: 8, padding: 6 }}>
            <svg viewBox="0 0 680 410" style={{ width: "100%", height: "auto" }}>
              <defs>
                <marker id="au" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M2 2 L8 5 L2 8" fill="none" stroke="context-stroke" strokeWidth="1.6" />
                </marker>
              </defs>
              <line x1="24" y1="20" x2="24" y2="396" stroke={S.mudo} strokeWidth="1.2" strokeDasharray="3 5" opacity="0.4" />
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
                      fill={on ? S.painel : S.papel} stroke={col}
                      strokeWidth={on ? 3.5 : no.tipo === "ausente" ? 1.5 : 1.5}
                      strokeDasharray={no.tipo === "ausente" ? "6 5" : "0"} />
                    <text x={p.x + p.w / 2} y={p.y + p.h / 2 - 5} textAnchor="middle" fontSize="13" fontWeight="700"
                      fill={S.tinta} fontFamily="'Archivo',sans-serif">{no.rotulo}</text>
                    <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 12} textAnchor="middle" fontSize="10"
                      fill={S.mudo} fontFamily="'IBM Plex Mono',monospace">{no.tipo}</text>
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
      <div style={{ background: S.papel, border: `1.5px dashed ${S.sinal}`, borderRadius: 8, padding: "18px 18px" }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, fontWeight: 700, color: S.sinalTxt, letterSpacing: ".05em" }}>
          ⚠ ELO AUSENTE · CONTRATO DE BASE FALTANTE
        </div>
        {!contrato && <Mono cor={S.mudo}>execute a travessia para gerar o contrato</Mono>}
        {contrato && (
          <>
            <div style={{ marginTop: 14, padding: "13px 14px", background: "rgba(255,61,46,.06)", borderLeft: `3px solid ${S.sinal}`, borderRadius: 3 }}>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: S.sinalTxt, fontWeight: 700, marginBottom: 6 }}>PERGUNTA DE PESQUISA</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: S.tinta, lineHeight: 1.4, fontFamily: "'Archivo',sans-serif" }}>
                {contrato.pergunta_de_pesquisa}
              </div>
            </div>
            <div style={{ marginTop: 12, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: S.mudo, fontWeight: 700 }}>
              EIXO DE LIGAÇÃO ({contrato.eixo_de_ligacao_hipotese?.eixo}) — hipótese a confirmar
            </div>
            {(contrato.eixo_de_ligacao_hipotese?.hipoteses || []).map((h, i) => (
              <div key={i} style={{ fontSize: 12, color: S.mudo, fontFamily: "'IBM Plex Mono',monospace", padding: "4px 0" }}>
                <span style={{ color: S.sinalTxt }}>?</span> {h}
              </div>
            ))}
            <div style={{ marginTop: 10, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: S.mudo }}>
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
    <div style={{ background: S.papel, border: `1px solid ${S.linha}`, borderRadius: 8, padding: "18px 18px", minHeight: 120 }}>
      {!noSel && !salto && <div style={{ color: S.mudo, fontSize: 14, fontFamily: "'Archivo',sans-serif" }}>Selecione um nó ou aresta para inspecionar a articulação. O elo tracejado abre o contrato da base faltante.</div>}
      {noSel && noSel.tipo !== "ausente" && (
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: S.tinta, fontFamily: "'Archivo',sans-serif" }}>{noSel.rotulo}</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: S.mudo, marginTop: 3 }}>
            {noSel.tipo === "derivado" ? "nó derivado · não é dado primário" : "nó factual · registro nativo"}
          </div>
          {noSel.derivacao && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: S.painel, borderRadius: 4, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: S.mudo }}>
              ↳ {noSel.derivacao}
            </div>
          )}
        </div>
      )}
      {salto && salto.tipo === "factual" && (
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: S.tinta }}>
            {salto.rotulo_de} → {salto.rotulo_para} · eixo {salto.eixo}
          </div>
          <div style={{ marginTop: 8, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>
            <span style={{ color: S.sonar }}>{salto.ligados} ligados</span> ·{" "}
            <span style={{ color: S.sinalTxt }}>{salto.orfaos_esquerda + salto.orfaos_direita} órfãos</span>
            <span style={{ color: S.mudo }}> (achado, não escondido)</span>
          </div>
          {(salto.amostra_orfaos_esquerda || []).slice(0, 5).map((o, i) => (
            <div key={i} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: S.mudo, paddingTop: 3 }}>
              <span style={{ color: S.sinalTxt }}>órfão</span> {o.rotulo}
            </div>
          ))}
        </div>
      )}
    </div>
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
    return `${dd > 0 ? "▲" : "▼"} ${dd > 0 ? "+" : ""}${dd} desde a 1ª execução${piora ? (dd > 0 ? " (mais órfãos)" : " (menos órfãos)") : ""}`;
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
      <section style={{ display: "flex", flexDirection: "column", gap: 16, borderBottom: `4px solid ${S.tinta}`, paddingBottom: 30 }}>
        <span style={{ fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, letterSpacing: ".14em", color: S.mudo }}>TRAJETÓRIA · UM CRUZAMENTO AO LONGO DO TEMPO</span>
        <h1 style={{ margin: 0, fontWeight: 800, fontStretch: "62%", textTransform: "uppercase", fontSize: "clamp(48px, 8vw, 104px)", lineHeight: 0.92, letterSpacing: "-.01em" }}>
          A regra é fixa; a variação mede o mundo
        </h1>
        <p style={{ margin: 0, maxWidth: 860, fontSize: 16, lineHeight: 1.55 }}>
          Execuções sucessivas de um mesmo cruzamento constituem uma série temporal. Como a regra permanece fixa, a variação entre execuções decorre de mudança nas fontes — ou, quando assinalado, de migração de esquema, que não deve ser lida como fenômeno.
        </p>
        {candidatos.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 680 }}>
            <label htmlFor="cruz-sel" style={{ fontFamily: FONTE_NUM, fontSize: 13, fontWeight: 600, letterSpacing: ".1em", color: S.mudo }}>CRUZAMENTO LIDO</label>
            <select id="cruz-sel" value={cid || ""} onChange={(e) => setEscolhido(e.target.value)} style={{ minHeight: 48, border: `2px solid ${S.tinta}`, background: S.papel, padding: "0 12px", fontFamily: FONTE_UI, fontWeight: 600, fontSize: 16, color: S.tinta }}>
              {candidatos.map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.execucoes} execução(ões)</option>)}
            </select>
          </div>
        )}
      </section>

      <Estado carregando={carregando} erro={erro} vazio={n === 0} vazioMsg="Nenhum cruzamento com execuções registradas. Execute um cruzamento em Cruzamentos para iniciar a série.">
        {n > 0 && (
          <>
            <section aria-label="Resumo" style={{ display: "flex", flexWrap: "wrap", gap: "20px 32px" }}>
              {tile("TAXA DE LIGAÇÃO", `${fmtNum(taxa, 0)}%`, "ligados ÷ (ligados + órfãos), na última execução")}
              {tile("LIGADOS", fmtNum(ult.lig, 0), delta(prim.lig, ult.lig, false))}
              {tile("ÓRFÃOS", fmtNum(ult.orf, 0), delta(prim.orf, ult.orf, true))}
            </section>

            <section aria-labelledby="sec-traj" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 32px", alignItems: "baseline", justifyContent: "space-between" }}>
                <TituloSecao id="sec-traj">Ligados e órfãos por execução</TituloSecao>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "8px 24px", fontSize: 14.5 }}>
                  <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 14, height: 14, background: S.tinta, display: "inline-block" }} />ligados</li>
                  <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 14, height: 14, background: S.sinal, display: "inline-block" }} />órfãos</li>
                  <li style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 18, height: 18, border: `2px solid ${S.sinalTxt}`, boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: S.sinalTxt }}>!</span>migração de esquema na fonte</li>
                </ul>
              </div>
              <div style={{ overflowX: "auto" }}>
                <div role="img" aria-label={`Barras de ligados e órfãos em ${n} execuções. Na última: ${ult.lig} ligados e ${ult.orf} órfãos.`} style={{ minWidth: Math.max(520, n * 96 + 60), display: "flex", gap: 12 }}>
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
                {n < 2 && <p style={{ margin: 0 }}>Há uma única execução: a série começa com duas. Registre uma nova execução em Cruzamentos.</p>}
                {identicas && <p style={{ margin: 0 }}>As {n} execuções registradas não diferem entre si{mesmoDia ? ` e foram feitas no mesmo dia (${fmtData(prim.data)})` : ""}: as fontes não mudaram no intervalo. Para ler uma tendência, é preciso registrar execuções ao longo do tempo.</p>}
                {serie.some((s) => s.mig) && <p style={{ margin: 0 }}><strong style={{ color: S.sinalTxt }}>Migração de esquema.</strong> Nas execuções assinaladas com “!”, a variação decorre de mudança no esquema da fonte, e não de fenômeno real.</p>}
              </div>
              <details style={{ borderTop: `1px solid ${S.linha}`, paddingTop: 14 }}>
                <summary style={{ fontWeight: 700, fontSize: 15, color: S.sonar, cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>Ver os dados em tabela</summary>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", minWidth: 480, fontSize: 15, marginTop: 8 }}>
                    <caption style={{ textAlign: "left", fontSize: 13.5, color: S.mudo, paddingBottom: 8 }}>Resultado por execução</caption>
                    <thead><tr style={{ borderBottom: `2px solid ${S.tinta}` }}>{["Execução", "Data e hora", "Ligados", "Órfãos", "Nota"].map((h) => <th key={h} scope="col" style={{ textAlign: "left", padding: "10px 16px 10px 0", fontWeight: 700 }}>{h}</th>)}</tr></thead>
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

  const cor = ausente ? S.sinal : S.tinta;
  return (
    <div style={{ background: S.papel, border: `1px solid ${S.linha}`, borderTop: `4px solid ${cor}`, borderRadius: 8, padding: "18px 20px" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: S.tinta, fontFamily: "'Archivo',sans-serif" }}>{c.nome}</div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: S.mudo, marginTop: 4 }}>
        {String(c.id).slice(0, 8)} · regra {c.versao_regra} · assinado por <span style={{ color: S.tinta }}>{c.autor}</span>
        {c.derivado_de && <> · <span style={{ color: S.sonar }}>⑂ derivado de {String(c.derivado_de).slice(0, 8)}</span></>}
        {" · "}<span style={{ color: S.sonar }}>{c.execucoes} execução(ões)</span>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <Botao cor={S.sonar} onClick={abrir} ocupado={abrindo}>ver receita</Botao>
        <Botao cor={S.sinalTxt} onClick={executar} ocupado={ocupado}>▶ executar</Botao>
        <Botao cor={S.sonar} onClick={bifurcar} ocupado={ocupado}>⑂ bifurcar (discordar da regra)</Botao>
      </div>
      <Falha erro={falha} />

      {det && (
        <div style={{ marginTop: 14, padding: "12px 14px", background: S.painel, borderRadius: 4, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: S.mudo, lineHeight: 1.7 }}>
          <div style={{ color: S.tinta, fontWeight: 700, marginBottom: 4 }}>↳ receita (re-executável)</div>
          <div><span style={{ color: S.mudo }}>eixo:</span> {det.receita.eixo}</div>
          <div><span style={{ color: S.mudo }}>regra:</span> {det.receita.regra}</div>
          {det.receita.base_faltante && <div><span style={{ color: S.sinalTxt }}>base faltante:</span> {det.receita.base_faltante.pergunta}</div>}
        </div>
      )}

      {exec && (
        <div style={{ marginTop: 12, padding: "11px 13px", background: S.painel, borderLeft: `3px solid ${exec.executavel ? S.sonar : S.sinal}`, borderRadius: 3, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5 }}>
          {exec.executavel ? (
            <span style={{ color: S.tinta }}>
              <span style={{ color: S.sonar }}>{exec.ligados} ligados</span> ·{" "}
              <span style={{ color: S.sinalTxt }}>{exec.orfaos_esquerda + exec.orfaos_direita} órfãos</span> (achado, não escondido)
            </span>
          ) : (
            <span style={{ color: S.sinalTxt }}>⚠ base faltante — contrato gerado: “{exec.achados?.contrato?.pergunta_de_pesquisa}”</span>
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
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: S.sinalTxt, fontWeight: 700 }}>{n}</span>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: S.tinta, fontFamily: "'Archivo',sans-serif", letterSpacing: "-.01em" }}>{titulo}</h2>
      </div>
      <p style={{ fontSize: 14, color: S.mudo, margin: "6px 0 0", fontFamily: "'Archivo',sans-serif" }}>{sub}</p>
    </div>
  );
}
const VISOES = [
  { id: "painel", rotulo: "PAINEL", comp: Painel },
  { id: "territorio", rotulo: "TERRITÓRIO", comp: Territorio },
  { id: "ligacoes", rotulo: "LIGAÇÕES", comp: Ligacoes },
  { id: "catalogo", rotulo: "CATÁLOGO", comp: Catalogo },
  { id: "percurso", rotulo: "PERCURSO", comp: Percurso },
  { id: "trajetoria", rotulo: "TRAJETÓRIA", comp: Trajetoria },
  { id: "cruzamentos", rotulo: "CRUZAMENTOS", comp: Cruzamentos },
];

export default function SondaApp() {
  const [v, setV] = useState("painel");
  const Atual = VISOES.find((x) => x.id === v).comp;
  const ir = (id) => { setV(id); if (typeof window !== "undefined") window.scrollTo(0, 0); };
  const larg = ["painel", "territorio", "ligacoes", "catalogo", "trajetoria"].includes(v) ? 1280 : 940;
  return (
    <div style={{ minHeight: "100vh", background: S.papel, color: S.tinta, fontFamily: "'Archivo',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        button:focus-visible, input:focus-visible, a:focus-visible, summary:focus-visible { outline: 3px solid ${S.sinal}; outline-offset: 2px; }
        .nav-btn:hover { color: #FFFFFF; }
        summary::-webkit-details-marker { color: ${S.sonar}; }
        @media (prefers-reduced-motion: no-preference) {
          @keyframes fade { from {opacity:0;} to {opacity:1;} }
          .view { animation: fade .2s ease; }
        }
      `}</style>

      <header style={{ background: S.tinta }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(16px, 4vw, 40px)", display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: "0 48px", minHeight: 64 }}>
          <div style={{ display: "flex", alignItems: "center" }}><Wordmark /></div>
          <nav aria-label="Principal" style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>
            {VISOES.map((x) => (
              <button key={x.id} type="button" className="nav-btn" onClick={() => ir(x.id)} aria-current={v === x.id ? "page" : undefined}
                style={{ padding: "0 20px", border: "none", borderBottom: `4px solid ${v === x.id ? S.sinal : "transparent"}`, background: "transparent", color: v === x.id ? "#FFFFFF" : "#B9BEC6", fontFamily: "'Archivo',sans-serif", fontWeight: 700, fontStretch: "75%", fontSize: 16, letterSpacing: ".1em", cursor: "pointer" }}>
                {x.rotulo}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: larg, margin: "0 auto", padding: "40px clamp(16px, 4vw, 40px) 80px" }}>
        <div className="view" key={v}><LimiteDeErro><Atual ir={ir} /></LimiteDeErro></div>
      </main>

      <footer style={{ borderTop: `1px solid ${S.linha}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px clamp(16px, 4vw, 40px) 40px", fontSize: 14, color: S.mudo, lineHeight: 1.6 }}>
          <div>Sonda — Observatório de Dados e Políticas do Audiovisual (UFF). Os dados são servidos pela API com proveniência, revisão da fonte e ressalvas em cada resposta.</div>
        </div>
      </footer>
    </div>
  );
}
