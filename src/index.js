// index.js - 비용 최적화 버전

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import './index.css'; // Tailwind CSS - 반드시 먼저 import


const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
