import React from "react";
import { createRoot } from "react-dom/client";
// componente canônico, na raiz do repositório (não duplicado).
import SondaApp from "../../SondaApp.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SondaApp />
  </React.StrictMode>
);
