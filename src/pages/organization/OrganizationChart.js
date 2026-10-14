// src/pages/organization/OrganizationChart.js
import React, { useState, useCallback, useMemo } from "react";
import "./OrganizationChart.css";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import {
  doc,
  collection,
  query,
  where,
  updateDoc,
  setDoc,
  getDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { usePolling } from "../../hooks/usePolling";
import { useBackClose } from "../../hooks/useBackClose";
import { invalidateCache as invalidateFetchCache } from "../../utils/fetchCache";

import { logger } from "../../utils/logger";
import { hasAppointedJobTitle, toJobIdArray } from "../../utils/jobPermissions";
import { formatLawFine } from "../../utils/numberFormatter";
import { toast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmDialog";
import { promptDialog } from "../../utils/promptDialog";
// 재의결 필요 찬성수 기본값 — 국회 화면(NationalAssembly)의 기본값(25명 × 2/3)과 같다.
const DEFAULT_VETO_OVERRIDE = 17;
// 🔴 2026-10-14: 이 화면의 설정은 전엔 최상위 governmentSettings/{classCode} 에 저장돼, 교사가 바꿔도
//   국회 재의결 판정(classes/{code}/nationalAssemblySettings/government)에는 반영되지 않았다.
//   같은 문서를 읽고 쓴다. (쓰이지 않던 «관리자 비밀번호» 칸도 지웠다 — 같은 반 학생이 읽을 수 있는
//   문서에 평문으로 저장되고 있었다.)
const govSettingsRef = (classCode) =>
  doc(db, "classes", classCode, "nationalAssemblySettings", "government");

const OrganizationChart = ({ classCode }) => {
  const { isAdmin: isAuthAdmin, userDoc } = useAuth() || {};

  // 직업 목록 로드 (selectedJobIds 기반 대통령 체크용)
  const { data: jobs, loading: jobsLoading } = usePolling(
    async () => {
      if (!classCode) return [];
      const jobsRef = collection(db, "jobs");
      const q = query(jobsRef, where("classCode", "==", classCode));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    {
      interval: 30 * 60 * 1000,
      enabled: !!classCode,
      deps: [classCode],
      // 🔥 [읽기 절감 1단계] 정부 계열 5개 페이지가 같은 jobs 쿼리 공유 → 세션 캐시
      cacheKey: classCode ? `jobs:${classCode}` : null,
    },
  );

  // 대통령은 교사 지정 직업(appointedJobIds)만 — 자가선택(selectedJobIds)은 보지 않는다. 화면 표시용.
  const isPresident = useMemo(
    () => hasAppointedJobTitle(userDoc, jobs, "대통령"),
    [userDoc, jobs],
  );

  // rules 가 대통령을 직접 확인한다(firestore.rules naIsPresident) — 승인·거부 쓰기에 내 «대통령» 직업 id 를 함께 보낸다.
  const presidentJobId = useMemo(() => {
    const mine = toJobIdArray(userDoc?.appointedJobIds);
    return (jobs || []).find((j) => j.title === "대통령" && mine.includes(j.id))?.id || null;
  }, [userDoc, jobs]);
  const presidentStamp = presidentJobId ? { presidentJobId } : {};

  const isAdminUser =
    typeof isAuthAdmin === "function" ? isAuthAdmin() : !!isAuthAdmin;
  const canManage = isAdminUser || isPresident; // 관리자 또는 대통령 직업

  const [pendingGovLaws, setPendingGovLaws] = useState([]);
  const [vetoPendingLaws, setVetoPendingLaws] = useState([]);
  const [vetoOverrideRequired, setVetoOverrideRequired] = useState(DEFAULT_VETO_OVERRIDE);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newVetoOverride, setNewVetoOverride] = useState(DEFAULT_VETO_OVERRIDE);
  const [loadingLaws, setLoadingLaws] = useState(true);
  // fetch 에러 표시 (학생/대통령 권한 디버그용)
  const [fetchError, setFetchError] = useState(null);

  // 뒤로가기 = 취소 단추와 동일하게 모달 닫기
  useBackClose(showSettingsModal, () => setShowSettingsModal(false));

  // 재의결 필요 찬성수 로드 — 문서가 없으면 기본값(생성은 국회 화면이 한다)
  const fetchSettings = useCallback(async () => {
    if (!classCode) return;
    try {
      const snap = await getDoc(govSettingsRef(classCode));
      const v = snap.exists() ? Number(snap.data().vetoOverrideRequired) : NaN;
      setVetoOverrideRequired(v > 0 ? v : DEFAULT_VETO_OVERRIDE);
    } catch (error) {
      logger.error("정부 설정 로드 오류:", error);
    }
  }, [classCode]);

  // 🔥 [비용 최적화] 5분 → 1시간 (정부 설정은 거의 안 바뀜)
  usePolling(fetchSettings, { interval: 60 * 60 * 1000, enabled: !!classCode });

  // 정부 이송 법안 + 재의결 진행 중(거부권 행사된) 법안 — 쿼리 하나로.
  //   🔴 2026-10-14: 재의결 목록은 전엔 최상위 `laws` 컬렉션(운영 0건 — 아무도 안 쓴다)을 읽어
  //   거부권이 행사된 법안이 여기 한 번도 안 보였다(운영 vetoed 9건).
  const fetchGovLaws = useCallback(async () => {
    if (!classCode) return;
    try {
      const q = query(
        collection(db, "classes", classCode, "nationalAssemblyLaws"),
        where("status", "in", ["pending_government_approval", "vetoed"]),
      );
      const snapshot = await getDocs(q);
      const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPendingGovLaws(all.filter((l) => l.status === "pending_government_approval"));
      setVetoPendingLaws(all.filter((l) => l.status === "vetoed"));
      setFetchError(null);
    } catch (error) {
      logger.error("정부 이송 법안 로드 오류:", error);
      setFetchError(`정부 이송 법안 로드 실패 (${error.code || "unknown"}): ${error.message}`);
    } finally {
      setLoadingLaws(false);
    }
  }, [classCode]);

  usePolling(fetchGovLaws, { interval: 15 * 60 * 1000, enabled: !!classCode });

  // 정부 이송 법안 승인
  const approveGovLaw = async (law) => {
    if (!canManage || !classCode) {
      toast.error("대통령 또는 관리자만 법안을 승인할 수 있습니다.");
      return;
    }
    if (!(await confirmDialog("이 법안을 최종 승인하시겠습니까?"))) return;
    const lawDocRef = doc(
      db,
      "classes",
      classCode,
      "nationalAssemblyLaws",
      law.id,
    );
    try {
      await updateDoc(lawDocRef, {
        status: "approved",
        finalStatus: "final_approved",
        finalApprovalDate: serverTimestamp(),
        ...presidentStamp,
      });
      // 🔥 [읽기 절감 1단계] 법안 상태 변경 → 국회(naLaws)·경찰서(naLawsApproved) 세션 캐시 무효화
      invalidateFetchCache("naLaws");
      await fetchGovLaws();
      toast.success(`"${law.title}" 법안이 최종 승인되었습니다.`);
    } catch (error) {
      logger.error("정부 이송 법안 승인 오류:", error);
      toast.error("법안 승인 중 오류가 발생했습니다.");
    }
  };

  // 정부 이송 법안 거부권
  const vetoGovLaw = async (law) => {
    if (!canManage || !classCode) {
      toast.error("대통령 또는 관리자만 거부권을 행사할 수 있습니다.");
      return;
    }
    const reason = await promptDialog(
      "거부권 행사 사유를 입력해주세요.",
      "",
      { confirmText: "거부권 행사", danger: true, multiline: true },
    );
    if (!reason || !reason.trim()) {
      toast.error("거부 사유를 반드시 입력해야 합니다.");
      return;
    }
    const lawDocRef = doc(
      db,
      "classes",
      classCode,
      "nationalAssemblyLaws",
      law.id,
    );
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);
    try {
      await updateDoc(lawDocRef, {
        status: "vetoed",
        vetoReason: reason,
        vetoDate: serverTimestamp(),
        vetoDeadline: deadline,
        approvals: 0,
        disapprovals: 0,
        voters: {},
        ...presidentStamp,
      });
      // 🔥 [읽기 절감 1단계] 법안 상태 변경 → 관련 세션 캐시 무효화
      invalidateFetchCache("naLaws");
      await fetchGovLaws();
      toast.error(`"${law.title}" 법안에 거부권이 행사되었습니다.`);
    } catch (error) {
      logger.error("정부 이송 법안 거부 오류:", error);
      toast.error("거부권 행사 중 오류가 발생했습니다.");
    }
  };

  // 관리자 설정 저장 (Firestore)
  const saveSettings = async () => {
    if (!classCode) return;
    const n = parseInt(newVetoOverride, 10);
    if (!n || n < 1) {
      toast.error("재의결 필요 찬성수는 1 이상이어야 합니다.");
      return;
    }
    try {
      await setDoc(
        govSettingsRef(classCode),
        { vetoOverrideRequired: n, lastUpdated: serverTimestamp() },
        { merge: true },
      );
      // 국회 화면의 세션 캐시도 비워 다음 방문에 새 값으로 판정하게 한다
      invalidateFetchCache(`naSettings:gov:${classCode}`);
      setVetoOverrideRequired(n);
      setShowSettingsModal(false);
      toast.success("설정이 저장되었습니다.");
    } catch (error) {
      logger.error("설정 저장 오류:", error);
      toast.error("설정 저장 중 오류가 발생했습니다.");
    }
  };

  // 날짜 포맷 함수
  const formatDate = (dateStringOrTimestamp) => {
    if (!dateStringOrTimestamp) return "날짜 정보 없음";
    let date;
    if (dateStringOrTimestamp.toDate) {
      // Firestore Timestamp 객체인 경우
      date = dateStringOrTimestamp.toDate();
    } else {
      // ISO 문자열인 경우
      date = new Date(dateStringOrTimestamp);
    }
    if (isNaN(date.getTime())) return "유효하지 않은 날짜";
    return `${date.getFullYear()}년 ${
      date.getMonth() + 1
    }월 ${date.getDate()}일 ${date.getHours()}시 ${date.getMinutes()}분`;
  };

  // 남은 시간 계산 함수
  const getRemainingTime = (deadline) => {
    if (!deadline) return "기한 정보 없음";
    const now = new Date();
    // 거부권 기한은 Firestore Timestamp 로 저장된다 — new Date(Timestamp) 는 NaN 이라 «NaN시간»이 떴다
    const deadlineDate = deadline.toDate ? deadline.toDate() : new Date(deadline);
    const diff = deadlineDate - now;
    if (isNaN(diff)) return "기한 정보 없음";

    if (diff <= 0) return "시간 만료";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}시간 ${minutes}분 남음`;
  };

  if (!classCode) {
    return (
      <div className="org-chart-container">
        <p>선택된 학급이 없습니다. 학급을 먼저 선택해주세요.</p>
      </div>
    );
  }

  // 학생/대통령은 governmentSettings 쓰기 권한이 없어 loadingSettings가 늦거나 실패할 수 있음
  // → loadingLaws만 게이트로 사용. settings는 default로 진행
  if (loadingLaws) {
    return (
      <div className="org-chart-container">
        <p>정부 조직도 정보를 불러오는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="org-chart-container">
      <div className="org-header">
        {/* 사이드바 메뉴명("대통령실")과 페이지 제목이 달라 다른 페이지로 오해하기 쉬웠다(2026-07-25 리뷰 C8). */}
        <h1 className="org-title">대통령실</h1>
        <div className="admin-controls">
          {canManage && (
            <div className="admin-indicator">
              {isAdminUser ? "관리자" : "대통령"} 권한 활성화
            </div>
          )}

          {isAdminUser && (
            <button
              className="settings-button"
              onClick={() => {
                setNewVetoOverride(vetoOverrideRequired);
                setShowSettingsModal(true);
              }}
            >
              설정
            </button>
          )}
        </div>
      </div>

      {fetchError && (
        <div
          style={{
            background: "#fee",
            border: "1px solid #f99",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 16,
            color: "#933",
            fontSize: 14,
          }}
        >
          ⚠️ 데이터 로드 오류: {fetchError}
          <br />
          <small>이 메시지를 선생님께 그대로 보여주세요.</small>
        </div>
      )}

      <div className="president-section">
        <div className="president-office">
          <h2>대통령실</h2>
          {/* 🔴 2026-08-30: 여기는 **세 가지 상태**다. 전에는 두 가지로 그려서,
              권한이 없는 학생에게 "권한 확인 중..."이 **영원히** 떠 있었다.
              끝난 판정을 진행 중이라고 말하면 학생은 기다리다 새로고침을 반복한다
              (진짜 '확인 중'은 jobs 쿼리가 도착하기 전 잠깐뿐이다). */}
          {canManage ? (
            <div className="admin-indicator">
              {isPresident ? "대통령 권한" : "관리자 권한"}
            </div>
          ) : jobsLoading ? (
            <div className="admin-indicator" style={{ opacity: 0.6 }}>
              권한 확인 중...
            </div>
          ) : (
            <div className="admin-indicator" style={{ opacity: 0.6 }}>
              열람 전용 · 대통령만 처리할 수 있어요
            </div>
          )}
        </div>

        {/* 정부 이송 법안 (nationalAssemblyLaws 컬렉션) */}
        <div className="law-approval-section">
          <h3>정부 이송 법안</h3>
          {pendingGovLaws.length === 0 ? (
            <div className="empty-state">정부로 이송된 법안이 없습니다.</div>
          ) : (
            <div className="pending-laws">
              {pendingGovLaws.map((law) => (
                <div key={law.id} className="law-card">
                  <div className="law-header">
                    <h3 className="law-title">{law.title}</h3>
                    <div className="law-status">정부 심의중</div>
                  </div>
                  <div className="law-content">
                    <p>
                      <strong>제안자:</strong> {law.proposerName || "정보 없음"}
                    </p>
                    <p>
                      <strong>취지:</strong> {law.purpose}
                    </p>
                    <p>
                      <strong>설명:</strong> {law.description}
                    </p>
                    <p>
                      <strong>벌금:</strong>{" "}
                      {formatLawFine(law.fine)}
                    </p>
                    <p>
                      <strong>국회 통과일:</strong>{" "}
                      {formatDate(law.approvalDate)}
                    </p>
                  </div>
                  <div className="law-actions">
                    <button
                      className="approve-button"
                      onClick={() => approveGovLaw(law)}
                      disabled={!canManage}
                    >
                      승인
                    </button>
                    <button
                      className="veto-button"
                      onClick={() => vetoGovLaw(law)}
                      disabled={!canManage}
                    >
                      거부권 행사
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="vetoed-laws-section">
          <h3>재의결 진행 중인 법안 (대통령 거부)</h3>
          {vetoPendingLaws.length === 0 ? (
            <div className="empty-state">재의결 진행 중인 법안이 없습니다.</div>
          ) : (
            <div className="vetoed-laws">
              {vetoPendingLaws.map((law) => (
                <div key={law.id} className="law-card vetoed">
                  <div className="law-header">
                    <h3 className="law-title">{law.title}</h3>
                    <div className="veto-status">
                      거부권 행사됨 (재의결 필요)
                    </div>
                  </div>
                  <div className="law-content">
                    <p>
                      <strong>취지:</strong> {law.purpose}
                    </p>
                    <p>
                      <strong>설명:</strong> {law.description}
                    </p>
                    <p>
                      <strong>벌금:</strong>{" "}
                      {formatLawFine(law.fine)}
                    </p>
                    <p>
                      <strong>거부 사유:</strong> {law.vetoReason}
                    </p>
                    <p>
                      <strong>거부 시간:</strong> {formatDate(law.vetoDate)}
                    </p>
                    <p>
                      <strong>재의결 마감:</strong>{" "}
                      {formatDate(law.vetoDeadline)} (
                      {getRemainingTime(law.vetoDeadline)})
                    </p>
                    <p>
                      <strong>현재 재의결 현황 (국회):</strong> 찬성{" "}
                      {law.approvals || 0}명 / 필요{" "}
                      {vetoOverrideRequired}명
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 관리자 설정 모달 */}
      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h2 className="modal-title">관리자 설정</h2>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label className="form-label">재의결 필요 찬성수</label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  value={newVetoOverride}
                  onChange={(e) => setNewVetoOverride(parseInt(e.target.value) || 0)}
                />
                <p className="form-hint">
                  거부권 행사 후 법안이 최종 가결되기 위해 필요한 국회 찬성표 수
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="modal-button cancel"
                onClick={() => setShowSettingsModal(false)}
              >
                취소
              </button>
              <button className="modal-button submit" onClick={saveSettings}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizationChart;
