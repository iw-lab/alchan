// src/components/AppUpdateChecker.js
// GitHub Releases 기반 업데이트 체크 (Android APK + PWA)
import React, { useState, useEffect } from "react";
import { Download, X, RefreshCw } from "lucide-react";

const GITHUB_REPO = "iw-lab/alchan"; // GitHub 저장소
const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6시간마다 체크
const APP_VERSION_KEY = "alchan_app_version";

const isAndroidApp = () => window.navigator.userAgent.includes("AlchanApp");

const isPWA = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

// 현재 APK 버전 (User-Agent에서 추출)
const getCurrentAPKVersion = () => {
  const match = window.navigator.userAgent.match(/AlchanApp\/([\d.]+)/);
  return match ? match[1] : null;
};

// 마지막으로 확인한 웹 버전
const getLastKnownWebVersion = () => {
  try {
    return localStorage.getItem(APP_VERSION_KEY);
  } catch {
    return null;
  }
};

const setLastKnownWebVersion = (version) => {
  try {
    localStorage.setItem(APP_VERSION_KEY, version);
  } catch {}
};

// 버전 비교 (semver)
const isNewerVersion = (latest, current) => {
  if (!current) return false;
  const a = latest.replace(/^v/, "").split(".").map(Number);
  const b = current.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff > 0) return true;
    if (diff < 0) return false;
  }
  return false;
};

export default function AppUpdateChecker() {
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    const isApp = isAndroidApp();
    const isPwa = isPWA();

    // 일반 브라우저에서는 체크 불필요 (항상 최신)
    if (!isApp && !isPwa) return;

    const checkUpdate = async () => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
          { headers: { Accept: "application/vnd.github.v3+json" } },
        );
        if (!res.ok) return;

        const release = await res.json();
        const latestTag = release.tag_name; // "v1.0.123"

        if (isApp) {
          // Android APK: User-Agent 버전과 비교
          const currentVersion = getCurrentAPKVersion();
          if (isNewerVersion(latestTag, currentVersion)) {
            const apkAsset = release.assets?.find((a) =>
              a.name.endsWith(".apk"),
            );
            setUpdate({
              version: latestTag,
              downloadUrl: apkAsset?.browser_download_url,
              name: release.name || `알찬 ${latestTag}`,
              type: "apk",
            });
          }
        } else if (isPwa) {
          // PWA: 마지막 확인 버전과 비교
          const lastKnown = getLastKnownWebVersion();
          if (lastKnown && isNewerVersion(latestTag, lastKnown)) {
            setUpdate({
              version: latestTag,
              name: release.name || `알찬 ${latestTag}`,
              type: "pwa",
            });
          }
          // 현재 버전 기록 (첫 방문 시 또는 업데이트 후)
          if (!lastKnown) {
            setLastKnownWebVersion(latestTag);
          }
        }
      } catch {
        // 네트워크 오류 무시
      }
    };

    // 앱 시작 1분 후 첫 체크
    const initTimer = setTimeout(checkUpdate, 60 * 1000);

    // 이후 6시간마다
    const interval = setInterval(checkUpdate, CHECK_INTERVAL);

    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, []);

  const handlePWAUpdate = () => {
    // 버전 기록 업데이트 후 새로고침
    if (update?.version) {
      setLastKnownWebVersion(update.version);
    }
    window.location.reload();
  };

  if (!update) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[9990]">
      <div
        className="relative rounded-2xl overflow-hidden shadow-2xl border border-indigo-500/40"
        style={{ background: "linear-gradient(135deg, #1a1a2e, #111128)" }}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />

        <div className="p-4 flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            {update.type === "pwa" ? (
              <RefreshCw className="w-5 h-5 text-indigo-400" />
            ) : (
              <Download className="w-5 h-5 text-indigo-400" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-slate-800 dark:text-white font-semibold text-sm">
              {update.type === "pwa" ? "새 버전 사용 가능" : "앱 업데이트 가능"}
            </p>
            <p className="text-slate-400 text-xs">{update.name}</p>
          </div>

          {update.type === "pwa" ? (
            <button
              onClick={handlePWAUpdate}
              className="flex-shrink-0 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-slate-800 dark:text-white text-sm font-bold rounded-xl transition-colors"
            >
              새로고침
            </button>
          ) : update.downloadUrl ? (
            <a
              href={update.downloadUrl}
              className="flex-shrink-0 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-slate-800 dark:text-white text-sm font-bold rounded-xl transition-colors"
            >
              업데이트
            </a>
          ) : (
            <a
              href={`https://github.com/${GITHUB_REPO}/releases/latest`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-slate-800 dark:text-white text-sm font-bold rounded-xl transition-colors"
            >
              확인
            </a>
          )}

          <button
            onClick={() => setUpdate(null)}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/60 text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
