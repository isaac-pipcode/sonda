// @vitest-environment jsdom
// Teste de fumaça: cada visão abre sem derrubar o app, também quando a API falha
// ou devolve listas vazias, e a visão ativa acompanha o hash da URL.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, act, waitFor } from "@testing-library/react";
import SondaApp from "../../SondaApp.jsx";

const IDS = ["painel", "territorio", "ligacoes", "catalogo", "percurso", "trajetoria", "cruzamentos"];
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
  it("hash desconhecido cai no Painel", () => {
    vi.stubGlobal("fetch", vi.fn(async () => envelope([])));
    window.location.hash = "/inexistente";
    render(<SondaApp />);
    expect(document.querySelector("[aria-current=page]").textContent).toBe("PAINEL");
  });

  it("clicar na navegação grava o hash, e mudar o hash troca a visão", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => envelope([])));
    render(<SondaApp />);
    await act(async () => { screen.getByRole("button", { name: "PERCURSO" }).click(); });
    expect(window.location.hash).toBe("#/percurso");
    await act(async () => { window.location.hash = "/cruzamentos"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(document.querySelector("[aria-current=page]").textContent).toBe("CRUZAMENTOS");
  });
});
