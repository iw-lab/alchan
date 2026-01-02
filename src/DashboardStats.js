// src/DashboardStats.js
// 집계 전용 문서(stats/{classCode})를 단건 읽기하여 보여주는 예시 컴포넌트
import React, { useEffect, useState } from 'react';
import { db } from './firebase';
import { doc, getDoc } from './firebase';
import { useAuth } from './contexts/AuthContext';

const DashboardStats = () => {
  const { userDoc } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!userDoc?.classCode) { setLoading(false); return; }
      const ref = doc(db, 'stats', userDoc.classCode);
      const snap = await getDoc(ref);
      setStats(snap || null);
      setLoading(false);
    })();
  }, [userDoc]);

  if (loading) return <div>로딩 중…</div>;
  if (!stats) return <div>집계 데이터가 없습니다.</div>;

  const data = stats?.data || stats; // getDoc 래퍼에 따라 구조 차이가 있을 수 있어 안전 처리
  return (
    <div className="dashboard-stats">
      <h3>대시보드 집계</h3>
      <ul>
        <li>전체 사용자 수: {data.userCount ?? '-'}</li>
        <li>총 현금 합계: {data.totalCash ?? '-'}</li>
        <li>총 쿠폰 합계: {data.totalCoupon ?? '-'}</li>
        <li>오늘 활동 로그 수: {data.todayActivityCount ?? '-'}</li>
      </ul>
      <p className="hint">※ stats/{userDoc?.classCode} 단일 문서만 읽습니다.</p>
    </div>
  );
};

export default DashboardStats;
