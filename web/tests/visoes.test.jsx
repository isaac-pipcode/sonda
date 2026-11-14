// @vitest-environment jsdom
// Teste de fumaça: cada visão abre sem derrubar o app, também quando a API falha
// ou devolve listas vazias, e a visão ativa acompanha o hash da URL.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, act, waitFor } from "@testing-library/react";
import SondaApp from "../../SondaApp.jsx";

const IDS = ["indicadores/investimento", "indicadores/territorio", "indicadores/telas", "cruzar/cruzamentos",
  "cruzar/encadear", "cruzar/historico", "cruzar/chaves", "bases/catalogo"];
const envelope = (dados) => ({ ok: true, status: 200, json: async () => ({ dados, proveniencia: [], avisos: [], servido_em: "" }) });

beforeEach(() => { window.scrollTo = () => {}; window.location.hash = ""; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe.each([
  ["API fora do ar", () => ({ ok: false, status: 500, json: async () => ({}) })],
  ["API sem dados (null)", () => envelope(null)],
])("%s", (_, resposta) => {
  it.each(IDS)("a visão %s abre sem falha de renderização", async (id) => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta()));
    window.location.hash = `/${id}`;
    render(<SondaApp />);
    await waitFor(() => expect(document.querySelector("[aria-current=page]")).not.toBeNull());
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.queryByText(/esta visão falhou/)).toBeNull();
  });
});

describe("rotas por hash", () => {
  it("hash desconhecido cai na tela inicial", () => {
    vi.stubGlobal("fetch", vi.fn(async () => envelope([])));
    window.location.hash = "/inexistente";
    render(<SondaApp />);
    expect(document.querySelector("nav [aria-current=page]").textContent).toBe("Consultar indicadores");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Quanto se investe/);
  });

  it("endereços antigos continuam valendo", () => {
    vi.stubGlobal("fetch", vi.fn(async () => envelope([])));
    window.location.hash = "/trajetoria";
    render(<SondaApp />);
    expect(document.querySelector("nav [aria-current=page]").textContent).toBe("Cruzar bases");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Histórico/);
  });

  it("clicar na navegação grava o hash, e mudar o hash troca a visão", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => envelope([])));
    render(<SondaApp />);
    await act(async () => { screen.getByRole("button", { name: "Cruzar bases" }).click(); });
    expect(window.location.hash).toBe("#/cruzar/cruzamentos");
    await act(async () => { window.location.hash = "/bases/catalogo"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(document.querySelector("nav [aria-current=page]").textContent).toBe("Baixar e citar");
  });
});
