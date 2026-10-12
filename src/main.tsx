import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TestRunProvider } from "./hooks/useTestRunContext";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { installGlobalErrorLogging } from "./lib/crash-reporting";
import "./styles/fonts.css";
import "./styles/globals.css";

installGlobalErrorLogging();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TestRunProvider>
        <App />
      </TestRunProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
