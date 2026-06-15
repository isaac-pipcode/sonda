import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O app consome os componentes canônicos da raiz do repositório (SondaApp.jsx,
// sonda_api_client.js) — sem duplicá-los. A API real é apontada por VITE_SONDA_API.
export default defineConfig({
  plugins: [react()],
  server: {
    // permite importar arquivos fora de web/ no dev server
    fs: { allow: [".."] },
  },
});
