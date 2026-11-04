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

// cor por base (estrutura neutra até a base se declarar)
const COR_BASE = { oca: S.sinal, lpg: S.sonar, mapa_cultural: S.mudo };
const corDaBase = (b) => COR_BASE[b] || S.mudo;

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
        <Estado carregando={carregando} erro={erro} vazio={bases.length === 0} vazioMsg="Catálogo vazio: execute a ingestão (seed.py ou coleta_real_mapas.py).">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
            {bases.map((b) => {
              const cor = corDaBase(b.base);
              const snaps = snapsDaBase(b.entidade_nativa);
              const s0 = snaps[0];
              return (
                <div key={`${b.base}:${b.entidade_nativa}`} style={{ background: S.papel, border: `1px solid ${S.linha}`, borderTop: `3px solid ${cor}`, borderRadius: 8, padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: cor }} />
                    <span style={{ fontSize: 17, fontWeight: 700, color: S.tinta, fontFamily: "'Archivo',sans-serif" }}>{b.base}</span>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.7, fontFamily: "'IBM Plex Mono',monospace", color: S.mudo }}>
                    <div><span style={{ color: S.mudo }}>entidade nativa:</span> <span style={{ color: S.tinta }}>{b.entidade_nativa}</span></div>
                    <div><span style={{ color: S.mudo }}>registros:</span> <span style={{ color: S.tinta }}>{b.n_registros}</span></div>
                    {s0 && <div><span style={{ color: S.mudo }}>fonte:</span> <span style={{ color: S.tinta }}>{s0.fonte}</span></div>}
                    {s0 && <div><span style={{ color: S.mudo }}>versão:</span> <span style={{ color: S.tinta }}>{s0.instancia_versao}</span></div>}
                  </div>
                  {/* proveniência ao alcance de um clique (porosidade 2) */}
                  {s0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: S.sonar }}>proveniência · {snaps.length} snapshot(s)</summary>
                      {snaps.map((s) => (
                        <div key={s.snapshot_id} style={{ marginTop: 6, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: S.mudo, lineHeight: 1.5 }}>
                          <div>↳ {s.capturado_em}</div>
                          <div style={{ color: S.mudo }}>fixity: {String(s.fixity).slice(0, 16)}…</div>
                          <div style={{ color: S.mudo }}>retenção: {s.politica_retencao?.regime}</div>
                        </div>
                      ))}
                    </details>
                  )}
                </div>
              );
            })}
            {/* a vaga: o convite à expansão */}
            <div style={{ background: "transparent", border: `1.5px dashed ${S.sinalTxt}`, borderRadius: 8, padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: S.sinalTxt, fontFamily: "'Archivo',sans-serif" }}>+ base faltante</div>
              <div style={{ fontSize: 11.5, color: S.mudo, fontFamily: "'IBM Plex Mono',monospace", marginTop: 6, lineHeight: 1.5 }}>
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
      {nome && <Mono cor={S.mudo}>↳ {nome}</Mono>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, margin: "12px 0 16px" }}>
        <Metric label="taxa de ligação" v={`${taxa}%`} cor={S.sonar} />
        <Metric label="Δ ligações" v={`${ult.lig - prim.lig >= 0 ? "+" : ""}${ult.lig - prim.lig}`} cor={S.sonar} />
        <Metric label="Δ órfãos" v={`${ult.orf - prim.orf >= 0 ? "+" : ""}${ult.orf - prim.orf}`} cor={S.sinalTxt} />
      </div>
      <div style={{ background: S.papel, border: `1px solid ${S.linha}`, borderRadius: 8, padding: "14px 16px 6px" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
          {[0, 0.5, 1].map((f, i) => { const yy = pT + iH - f * iH; return <line key={i} x1={pL} y1={yy} x2={W - pR} y2={yy} stroke={S.linha} strokeDasharray="2 4" />; })}
          <path d={line("orf")} fill="none" stroke={S.sinal} strokeWidth="2" strokeDasharray="5 4" opacity="0.85" />
          <path d={line("lig")} fill="none" stroke={S.sonar} strokeWidth="2.5" />
          {serie.map((s, i) => (
            <g key={i} onMouseEnter={() => setHv(i)} onMouseLeave={() => setHv(null)} style={{ cursor: "pointer" }}>
              <rect x={x(i) - 14} y={pT} width="28" height={iH} fill={hv === i ? "rgba(11,13,16,.06)" : "transparent"} />
              <circle cx={x(i)} cy={y(s.orf)} r={hv === i ? 5.5 : 3.5} fill={S.sinal} />
              <circle cx={x(i)} cy={y(s.lig)} r={hv === i ? 5.5 : 3.5} fill={S.sonar} />
              {s.mig && <text x={x(i)} y={y(s.lig) - 11} textAnchor="middle" fontSize="12" fill={S.sinalTxt}>⚠</text>}
              <text x={x(i)} y={H - 22} textAnchor="middle" fontSize="9.5" fill={S.mudo} fontFamily="'IBM Plex Mono',monospace">{s.d}</text>
            </g>
          ))}
          <g fontFamily="'IBM Plex Mono',monospace" fontSize="10">
            <circle cx={pL + 4} cy={H - 6} r="4" fill={S.sonar} /><text x={pL + 13} y={H - 3} fill={S.tinta}>ligações</text>
            <circle cx={pL + 90} cy={H - 6} r="4" fill={S.sinal} /><text x={pL + 99} y={H - 3} fill={S.tinta}>órfãos</text>
          </g>
        </svg>
        <div style={{ minHeight: 30, padding: "6px 2px" }}>
          {hv != null && serie[hv] && (
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: serie[hv].mig ? S.sinalTxt : S.mudo }}>
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
function Metric({ label, v, cor }) {
  return (
    <div style={{ background: S.papel, border: `1px solid ${S.linha}`, borderRadius: 6, padding: "12px 14px" }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor, fontFamily: "'Archivo',sans-serif" }}>{v}</div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: S.mudo, marginTop: 2, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
    </div>
  );
}

const VISOES = [
  { id: "painel", rotulo: "PAINEL", comp: Painel },
  { id: "catalogo", rotulo: "CATÁLOGO", comp: Catalogo },
  { id: "percurso", rotulo: "PERCURSO", comp: Percurso },
  { id: "trajetoria", rotulo: "TRAJETÓRIA", comp: Trajetoria },
  { id: "cruzamentos", rotulo: "CRUZAMENTOS", comp: Cruzamentos },
];

export default function SondaApp() {
  const [v, setV] = useState("painel");
  const Atual = VISOES.find((x) => x.id === v).comp;
  const ir = (id) => { setV(id); if (typeof window !== "undefined") window.scrollTo(0, 0); };
  const larg = v === "painel" ? 1200 : 940;
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
