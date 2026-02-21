// src/components/AppUpdateChecker.js
// Android 앱에서만 GitHub Releases 새 버전 체크
import React, { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

const GITHUB_REPO = "iw-lab/alchan"; // GitHub 저장소
const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6시간마다 체크

const isAndroidApp = () => window.navigator.userAgent.includes("AlchanApp");

// 현재 APK 버전 (User-Agent에서 추출)
const getCurrentVersion = () => {
  const match = window.navigator.userAgent.match(/AlchanApp\/([\d.]+)/);
  return match ? match[1] : null;
};

// 버전 비교 (semver)
const isNewerVersion = (latest, current) => {
  if (!current) return false;
  const a = latest.replace(/^v/, "").split(".").map(Number);
  const b = current.split(".").map(Number);
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
    if (!isAndroidApp()) return;

    const checkUpdate = async () => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
          { headers: { Accept: "application/vnd.github.v3+json" } },
        );
        if (!res.ok) return;

        const release = await res.json();
        const latestTag = release.tag_name; // "v1.0.5"
        const currentVersion = getCurrentVersion();

        if (isNewerVersion(latestTag, currentVersion)) {
          // APK 다운로드 URL 찾기
          const apkAsset = release.assets?.find((a) => a.name.endsWith(".apk"));
          if (apkAsset) {
            setUpdate({
              version: latestTag,
              downloadUrl: apkAsset.browser_download_url,
              name: release.name || `알찬 ${latestTag}`,
            });
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

  if (!update) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9990]">
      <div
        className="relative rounded-2xl overflow-hidden shadow-2xl border border-indigo-500/40"
        style={{ background: "linear-gradient(135deg, #1a1a2e, #111128)" }}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />

        <div className="p-4 flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <Download className="w-5 h-5 text-indigo-400" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">앱 업데이트 가능</p>
            <p className="text-slate-400 text-xs">{update.name}</p>
          </div>

          <a
            href={update.downloadUrl}
            className="flex-shrink-0 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-colors"
          >
            업데이트
          </a>

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
