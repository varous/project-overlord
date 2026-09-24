import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/design-system.css";
import "./styles/shell.css";
import "./styles/overrides.css";
import { bootTheme } from "./lib/theme.js";
import { App } from "./App.js";

bootTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
