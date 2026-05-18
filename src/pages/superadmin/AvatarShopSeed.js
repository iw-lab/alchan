// src/pages/superadmin/AvatarShopSeed.js
// 아바타 상점 아이템 일괄 시드 (슈퍼관리자 전용)
import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { functions } from "../../firebase";
import { httpsCallable } from "firebase/functions";
import { logger } from "../../utils/logger";

// 아이템 카탈로그를 require로 가져옴 (Node 형식이지만 webpack도 처리 가능)
import { ALL_AVATAR_ITEMS } from "../../data/avatarShopCatalog";

export default function AvatarShopSeed() {
  const { userDoc } = useAuth() || {};
  const [seeding, setSeeding] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  if (!userDoc?.isSuperAdmin) {
    return (
      <div className="p-8 text-center text-red-500">
        슈퍼관리자만 접근 가능합니다.
      </div>
    );
  }

  const handleSeed = async () => {
    if (!window.confirm(`총 ${ALL_AVATAR_ITEMS.length}개 아이템을 시드합니다. 진행하시겠습니까?`)) return;

    setSeeding(true);
    setError(null);
    setResult(null);

    try {
      const fn = httpsCallable(functions, "seedAvatarShop");
      // Cloud Function 200개 제한 - batch로 나눠서 호출
      const BATCH_SIZE = 100;
      let totalWritten = 0;
      for (let i = 0; i < ALL_AVATAR_ITEMS.length; i += BATCH_SIZE) {
        const batch = ALL_AVATAR_ITEMS.slice(i, i + BATCH_SIZE);
        const res = await fn({ items: batch });
        totalWritten += res?.data?.written || 0;
      }
      setResult({ written: totalWritten, total: ALL_AVATAR_ITEMS.length });
    } catch (err) {
      logger.error("seed 실패:", err);
      setError(err?.message || String(err));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-slate-800">🎭 아바타 상점 시드</h1>
      <p className="text-sm text-slate-600 mb-6">
        아바타 상점 카탈로그(<b>{ALL_AVATAR_ITEMS.length}개</b>)를 Firestore <code>avatarShopItems</code> 컬렉션에 일괄 등록합니다.
        <br />이미 등록된 아이템은 <code>merge</code>로 덮어쓰기 됩니다 (안전).
      </p>

      <button
        onClick={handleSeed}
        disabled={seeding}
        className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold mb-4"
      >
        {seeding ? "시드 중..." : `${ALL_AVATAR_ITEMS.length}개 시드 실행`}
      </button>

      {result && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-4">
          ✅ 성공: <b>{result.written}</b>/{result.total}개 등록 완료
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-4 text-red-700">
          ❌ 실패: {error}
        </div>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-slate-500">
          시드 카탈로그 미리보기 ({ALL_AVATAR_ITEMS.length}개)
        </summary>
        <div className="mt-3 max-h-[400px] overflow-y-auto bg-slate-50 rounded-lg p-3 text-xs">
          {ALL_AVATAR_ITEMS.map((item) => (
            <div key={item.id} className="border-b border-slate-200 py-1.5 flex justify-between">
              <span className="font-mono text-slate-700">{item.id}</span>
              <span className="text-slate-500">
                [{item.slot}] {item.name} · {item.rarity} · {item.price.toLocaleString()}원
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
