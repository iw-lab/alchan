// src/components/SettingsPanel.js
// 사용자 설정 패널 (다크 모드, 폰트 크기 등)

import React, { useState } from "react";
import { useTheme, FONT_SIZES } from "../contexts/ThemeContext";
import { useTutorial } from "./TutorialGuide";
import {
  X,
  Moon,
  Sun,
  Type,
  RefreshCw,
  Bell,
  Volume2,
  Smartphone,
  ChevronRight,
  Check,
  HelpCircle,
} from "lucide-react";

export function SettingsPanel({ isOpen, onClose }) {
  const { isDarkMode, toggleDarkMode, fontSize, setFontSize } = useTheme();
  const { resetTutorial } = useTutorial();
  const [notifications, setNotifications] = useState(
    localStorage.getItem("alchan-notifications") !== "false",
  );
  const [sounds, setSounds] = useState(
    localStorage.getItem("alchan-sounds") !== "false",
  );

  const handleNotificationToggle = () => {
    const newValue = !notifications;
    setNotifications(newValue);
    localStorage.setItem("alchan-notifications", String(newValue));
  };

  const handleSoundToggle = () => {
    const newValue = !sounds;
    setSounds(newValue);
    localStorage.setItem("alchan-sounds", String(newValue));
  };

  const handleResetTutorial = () => {
    if (window.confirm("튜토리얼을 다시 보시겠습니까?")) {
      resetTutorial();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-3xl w-full max-w-md max-h-[90vh] overflow-hidden shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">설정</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-700 transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* 설정 목록 */}
        <div className="overflow-y-auto p-4 space-y-6">
          {/* 화면 설정 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
              화면
            </h3>

            {/* 다크 모드 */}
            <div className="bg-gray-700/50 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isDarkMode ? (
                    <Moon size={20} className="text-indigo-500" />
                  ) : (
                    <Sun size={20} className="text-amber-500" />
                  )}
                  <div>
                    <p className="font-medium text-white">다크 모드</p>
                    <p className="text-sm text-gray-400">
                      어두운 화면으로 눈의 피로를 줄여요
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleDarkMode}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    isDarkMode ? "bg-indigo-500" : "bg-gray-500"
                  }`}
                >
                  <div
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      isDarkMode ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {/* 폰트 크기 */}
              <div className="pt-4 border-t border-gray-600">
                <div className="flex items-center gap-3 mb-3">
                  <Type size={20} className="text-blue-500" />
                  <div>
                    <p className="font-medium text-white">글꼴 크기</p>
                    <p className="text-sm text-gray-400">
                      읽기 편한 크기를 선택하세요
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(FONT_SIZES).map(([key, { label }]) => (
                    <button
                      key={key}
                      onClick={() => setFontSize(key)}
                      className={`py-2 rounded-xl text-sm font-medium transition-all ${
                        fontSize === key
                          ? "bg-indigo-500 text-white"
                          : "bg-gray-600 text-gray-300 hover:bg-gray-500"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 알림 설정 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
              알림
            </h3>

            <div className="bg-gray-700/50 rounded-2xl divide-y divide-gray-600">
              {/* 푸시 알림 */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Bell size={20} className="text-green-500" />
                  <div>
                    <p className="font-medium text-white">푸시 알림</p>
                    <p className="text-sm text-gray-400">
                      새 소식을 알려드려요
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleNotificationToggle}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    notifications ? "bg-green-500" : "bg-gray-500"
                  }`}
                >
                  <div
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      notifications ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {/* 소리 */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Volume2 size={20} className="text-purple-500" />
                  <div>
                    <p className="font-medium text-white">소리</p>
                    <p className="text-sm text-gray-400">알림음과 효과음</p>
                  </div>
                </div>
                <button
                  onClick={handleSoundToggle}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    sounds ? "bg-purple-500" : "bg-gray-500"
                  }`}
                >
                  <div
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      sounds ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* 기타 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
              기타
            </h3>

            <div className="bg-gray-700/50 rounded-2xl divide-y divide-gray-600">
              {/* 튜토리얼 다시 보기 */}
              <button
                onClick={handleResetTutorial}
                className="flex items-center justify-between p-4 w-full hover:bg-gray-600/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <HelpCircle size={20} className="text-amber-500" />
                  <div className="text-left">
                    <p className="font-medium text-white">튜토리얼 다시 보기</p>
                    <p className="text-sm text-gray-400">
                      사용법을 다시 배워요
                    </p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-gray-400" />
              </button>

              {/* 앱 정보 */}
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <Smartphone size={20} className="text-gray-400" />
                  <div>
                    <p className="font-medium text-white">앱 버전</p>
                    <p className="text-sm text-gray-400">v1.0.0</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-semibold transition-colors"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
