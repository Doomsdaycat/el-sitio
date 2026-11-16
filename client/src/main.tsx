import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./style.css";

createRoot(document.getElementById("racine")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
