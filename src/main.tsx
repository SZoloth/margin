import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TestRunProvider } from "./hooks/useTestRunContext";
import "./styles/fonts.css";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TestRunProvider>
      <App />
    </TestRunProvider>
  </React.StrictMode>
);
