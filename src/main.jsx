import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./themes.css";
import "./DesignSystem.css";
import "./VisualRefresh.css";
import "./Variant1.css";
// ENERGY SYSTEM — финальный визуальный слой. Перекрывает всё предыдущее.
import "./Energy.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);