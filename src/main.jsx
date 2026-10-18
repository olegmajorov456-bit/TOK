import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./themes.css";
// Keep the shared design system last so it resolves component and theme style conflicts.
import "./DesignSystem.css";
// Redesign layer: brand tokens from the logo (navy, blue, pink). Must stay last.
import "./redesign.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);