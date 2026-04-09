// index.js - 비용 최적화 버전

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import './index.css'; // Tailwind CSS - 반드시 먼저 import

import * as serviceWorkerRegistration from './serviceWorkerRegistration';

import { logger } from "./utils/logger";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// 서비스 워커 해제 (캐시 문제 방지 - 새로고침만으로 최신 버전 로드)
serviceWorkerRegistration.unregister();
