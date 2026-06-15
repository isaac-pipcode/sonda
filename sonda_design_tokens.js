/*
  SONDA — Tokens de design oficiais
  Derivados da identidade visual "Espectro 1.0" (Observatório de Dados e
  Políticas do Audiovisual — UFF).

  Metáfora da marca: linhas de dados paralelas; uma (Sinal) é interferida
  por um nó que a desvia; a leitura vertical tracejada (Sonar) atravessa.
  "Carbono ancora. Sinal interfere. Sonar lê."

  Mapeamento semântico para a Sonda (fechado nas conversas anteriores):
   - Carbono     fundo escuro / âncora / dado institucional estável
   - Sinal       interferência / o achado / a aresta factual em destaque / OCA-acento
   - Sonar       a leitura / o derivado / a articulação / verde-diagnóstico
   - Osso        texto sobre carbono / superfície clara
   - Pergaminho  fundo claro / papel de trabalho
   - Sedimento   neutro / estrutura / dado em repouso / linhas de fundo
   - (incompletude reusa Sinal, pois interferência = o que desvia o fluxo)
*/

export const SONDA = {
  carbono:    "#0E1116",
  sinal:      "#FF3D2E",
  sonar:      "#00C2A8",
  osso:       "#F2EEE5",
  pergaminho: "#FAF7F0",
  sedimento:  "#6B6A66",

  // derivados de apoio (sombras e tons intermediários da mesma família)
  carbonoSoft: "#1A1F27",
  sinalDark:   "#C42A1E",
  sonarDark:   "#0A7D6C",
  sedimentoSoft: "#9B9A94",
  pergaminhoEdge: "#E7E0D2",
};

/* Mapeamento de papel por base, mantendo a identidade:
   - OCA  → sinal (a base institucional que "marca" o sinal de referência)
   - LPG  → sonar (a leitura territorial dispersa)
   - MAPA → sedimento+sonar (a federação colaborativa)
   Para distinção entre 3+ bases, usar Sinal / Sonar / Sedimento como trio,
   reservando Sinal sempre para o elemento "em foco/interferência". */
export const BASE_COR = {
  OCA:  SONDA.sinal,
  LPG:  SONDA.sonar,
  MAPA: SONDA.sedimento,
};

export const TIPO_COR = {
  factual:  SONDA.sinal,
  derivado: SONDA.sonar,
  ausente:  SONDA.sinal,   // incompletude = interferência, mas sempre tracejada
  neutro:   SONDA.sedimento,
};

export const FONTS = {
  display: "'Archivo', 'Helvetica Neue', Arial, sans-serif", // pesado, geométrico, como o lockup SONDA
  mono:    "'IBM Plex Mono', ui-monospace, monospace",       // proveniência, rótulos técnicos
  text:    "'Newsreader', Georgia, serif",                   // prosa de leitura
};
