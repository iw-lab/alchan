// src/pages/organization/OrganizationChart.js
import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  writeBatch,
} from "firebase/firestore";
import { usePolling } from "../../hooks/usePolling";

import { logger } from "../../utils/logger";
// 기본 관리자 설정 (Firestore에 없을 경우 사용)
const DEFAULT_ADMIN_SETTINGS = {
  vetoOverrideRequired: 17,
  adminPassword: process.env.REACT_APP_ADMIN_DEFAULT_PASSWORD || "",
  lastUpdated: null,
};

const OrganizationChart = ({ classCode }) => {
  const { isAdmin: isAuthAdmin, userDoc } = useAuth() || {};

  // 직업 목록 로드 (selectedJobIds 기반 대통령 체크용)
  const { data: jobs } = usePolling(
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
    },
  );

  const isPresident = useMemo(() => {
    if (!userDoc?.selectedJobIds || !jobs) return false;
    const selectedIds = Array.isArray(userDoc.selectedJobIds)
      ? userDoc.selectedJobIds
      : Object.keys(userDoc.selectedJobIds || {});
    const selectedJobs = jobs.filter((job) => selectedIds.includes(job.id));
    return selectedJobs.some((job) => job.title === "대통령");
  }, [userDoc?.selectedJobIds, jobs]);

  const isAdminUser =
    typeof isAuthAdmin === "function" ? isAuthAdmin() : !!isAuthAdmin;
  const canManage = isAdminUser || isPresident; // 관리자 또는 대통령 직업

  const [approvedLaws, setApprovedLaws] = useState([]);
  const [vetoPendingLaws, setVetoPendingLaws] = useState([]);
  const [pendingGovLaws, setPendingGovLaws] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedLaw, setSelectedLaw] = useState(null);
  const [vetoReason, setVetoReason] = useState("");
  const [adminSettings, setAdminSettings] = useState(DEFAULT_ADMIN_SETTINGS);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newSettings, setNewSettings] = useState({
    vetoOverrideRequired: DEFAULT_ADMIN_SETTINGS.vetoOverrideRequired,
    adminPassword: "",
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingLaws, setLoadingLaws] = useState(true);

  // Firestore에서 관리자 설정 로드 및 초기화
  const fetchSettings = useCallback(async () => {
    if (!classCode) return;
    setLoadingSettings(true);
    const settingsDocRef = doc(db, "governmentSettings", classCode);

    try {
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        setAdminSettings({ ...DEFAULT_ADMIN_SETTINGS, ...docSnap.data() });
        setNewSettings({
          // 모달용 설정도 업데이트
          vetoOverrideRequired:
            docSnap.data().vetoOverrideRequired ||
            DEFAULT_ADMIN_SETTINGS.vetoOverrideRequired,
          adminPassword: "", // 비밀번호는 직접 입력받도록 비워둠
        });
      } else {
        // 해당 classCode에 대한 설정이 없으면 기본값으로 생성
        await setDoc(settingsDocRef, {
          ...DEFAULT_ADMIN_SETTINGS,
          lastUpdated: serverTimestamp(),
        });
        setAdminSettings(DEFAULT_ADMIN_SETTINGS);
        setNewSettings({
          vetoOverrideRequired: DEFAULT_ADMIN_SETTINGS.vetoOverrideRequired,
          adminPassword: "",
        });
        logger.log(`[${classCode}] 정부 기본 설정 생성 완료`);
      }
    } catch (error) {
      logger.error("정부 설정 로드 오류:", error);
    } finally {
      setLoadingSettings(false);
    }
  }, [classCode]);

  // 🔥 [비용 최적화] 5분 → 1시간 (정부 설정은 거의 안 바뀜)
  usePolling(fetchSettings, { interval: 60 * 60 * 1000, enabled: !!classCode });

  // Firestore에서 법안 데이터 로드
  const fetchLaws = useCallback(async () => {
    if (!classCode) return;
    setLoadingLaws(true);
    const lawsCollectionRef = collection(db, "laws"); // 'laws'는 국회에서 사용하는 법안 컬렉션명과 동일해야 함
    const q = query(lawsCollectionRef, where("classCode", "==", classCode));

    try {
      const querySnapshot = await getDocs(q);
      const allLaws = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const approved = allLaws.filter(
        (law) => law.status === "approved" && !law.presidentAction, // 국회 통과, 대통령 조치 전
      );
      const vetoPending = allLaws.filter((law) => law.status === "vetoed"); // 대통령 거부, 재의결 대기

      setApprovedLaws(approved);
      setVetoPendingLaws(vetoPending);
    } catch (error) {
      logger.error("법안 데이터 로드 오류:", error);
    } finally {
      setLoadingLaws(false);
    }
  }, [classCode]);

  // 🔥 [비용 최적화] 5분 → 30분 (법안 데이터는 자주 안 바뀜)
  usePolling(fetchLaws, { interval: 30 * 60 * 1000, enabled: !!classCode });

  // 정부 이송 법안 (nationalAssemblyLaws 컬렉션) 로드
  const fetchGovLaws = useCallback(async () => {
    if (!classCode) return;
    try {
      const lawsRef = collection(
        db,
        "classes",
        classCode,
        "nationalAssemblyLaws",
      );
      const q = query(
        lawsRef,
        where("status", "==", "pending_government_approval"),
      );
      const snapshot = await getDocs(q);
      setPendingGovLaws(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      logger.error("정부 이송 법안 로드 오류:", error);
    }
  }, [classCode]);

  usePolling(fetchGovLaws, { interval: 15 * 60 * 1000, enabled: !!classCode });

  // 정부 이송 법안 승인
  const approveGovLaw = async (law) => {
    if (!canManage || !classCode) {
      alert("대통령 또는 관리자만 법안을 승인할 수 있습니다.");
      return;
    }
    if (!window.confirm("이 법안을 최종 승인하시겠습니까?")) return;
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
      });
      await fetchGovLaws();
      alert(`"${law.title}" 법안이 최종 승인되었습니다.`);
    } catch (error) {
      logger.error("정부 이송 법안 승인 오류:", error);
      alert("법안 승인 중 오류가 발생했습니다.");
    }
  };

  // 정부 이송 법안 거부권
  const vetoGovLaw = async (law) => {
    if (!canManage || !classCode) {
      alert("대통령 또는 관리자만 거부권을 행사할 수 있습니다.");
      return;
    }
    const reason = prompt("거부권 행사 사유를 입력해주세요.");
    if (!reason || !reason.trim()) {
      alert("거부 사유를 반드시 입력해야 합니다.");
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
      });
      await fetchGovLaws();
      alert(`"${law.title}" 법안에 거부권이 행사되었습니다.`);
    } catch (error) {
      logger.error("정부 이송 법안 거부 오류:", error);
      alert("거부권 행사 중 오류가 발생했습니다.");
    }
  };

  // 관리자 설정 저장 (Firestore)
  const saveSettings = async () => {
    if (!classCode) return;
    if (
      !newSettings.vetoOverrideRequired ||
      newSettings.vetoOverrideRequired < 1
    ) {
      alert("재의결 필요 찬성수는 1 이상이어야 합니다.");
      return;
    }

    const settingsDocRef = doc(db, "governmentSettings", classCode);
    const updatedSettingsData = {
      vetoOverrideRequired: parseInt(newSettings.vetoOverrideRequired),
      lastUpdated: serverTimestamp(),
    };

    if (newSettings.adminPassword) {
      updatedSettingsData.adminPassword = newSettings.adminPassword;
    }

    try {
      await updateDoc(settingsDocRef, updatedSettingsData);
      await fetchSettings();
      setShowSettingsModal(false);
      alert("설정이 저장되었습니다.");
    } catch (error) {
      logger.error("설정 저장 오류:", error);
      alert("설정 저장 중 오류가 발생했습니다.");
    }
  };

  // 법안 승인 처리 (Firestore)
  const approveLaw = async (law) => {
    if (!canManage || !classCode) {
      alert("대통령 또는 관리자만 법안을 승인할 수 있습니다.");
      return;
    }
    const lawDocRef = doc(db, "laws", law.id);
    try {
      await updateDoc(lawDocRef, {
        presidentAction: "approved", // 대통령 승인
        finalStatus: "final_approved", // 최종 상태: 승인
        finalApprovalDate: serverTimestamp(),
        status: "final_approved", // 상태도 최종 승인으로 변경 (혼선 방지)
      });
      await fetchLaws();
      alert(`"${law.title}" 법안이 최종 승인되었습니다.`);
    } catch (error) {
      logger.error("법안 승인 오류:", error);
      alert("법안 승인 중 오류가 발생했습니다.");
    }
  };

  // 거부권 행사 모달 열기
  const openVetoModal = (law) => {
    if (!canManage) {
      alert("대통령 또는 관리자만 거부권을 행사할 수 있습니다.");
      return;
    }
    setSelectedLaw(law);
    setVetoReason("");
    setShowModal(true);
  };

  // 거부권 행사 처리 (Firestore)
  const vetoLaw = async () => {
    if (!vetoReason) {
      alert("거부 사유를 입력해주세요.");
      return;
    }
    if (!selectedLaw || !classCode) return;

    const lawDocRef = doc(db, "laws", selectedLaw.id);
    // 국회 컴포넌트와 동일한 로직으로 거부권 행사 시 투표 관련 필드도 업데이트
    // (예: nationalAssemblyVotes 컬렉션에서 해당 법안 투표 이력 삭제 등은 NationalAssembly 컴포넌트의 역할과 중복될 수 있어, 여기서는 법안 상태만 변경)
    // 국회에서 재의결을 위해 사용하는 필드들을 초기화/설정해줍니다.
    const vetoDeadline = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString(); // 24시간 후

    try {
      await updateDoc(lawDocRef, {
        status: "vetoed", // 상태: 거부됨 (국회 재의결 대기)
        presidentAction: "vetoed", // 대통령 조치: 거부
        vetoReason: vetoReason,
        vetoDate: serverTimestamp(),
        approvals: 0, // 국회 재투표를 위해 초기화
        disapprovals: 0, // 국회 재투표를 위해 초기화
        voters: [], // 국회 재투표를 위해 초기화
        vetoDeadline: vetoDeadline, // 재의결 기한 설정
        finalStatus: null, // 최종 상태 초기화
      });
      await fetchLaws();

      // 국회 투표 이력(nationalAssemblyVotes)은 NationalAssembly 컴포넌트에서 관리하므로 여기서는 직접 건드리지 않음
      // 필요하다면, Cloud Function 등을 통해 국회 투표 이력도 초기화하는 로직을 고려할 수 있음

      setShowModal(false);
      setSelectedLaw(null);
      alert(
        `"${selectedLaw.title}" 법안에 거부권이 행사되었습니다. 국회에서 재의결 절차가 시작됩니다.`,
      );
    } catch (error) {
      logger.error("거부권 행사 오류:", error);
      alert("거부권 행사 중 오류가 발생했습니다.");
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
    const deadlineDate = new Date(deadline);
    const diff = deadlineDate - now;

    if (diff <= 0) return "시간 만료";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}시간 ${minutes}분 남음`;
  };

  // 자동 부결 처리 확인 (Firestore 데이터를 기반으로, NationalAssembly 컴포넌트에서 주로 처리)
  // OrganizationChart는 vetoPendingLaws 목록을 보여주는 역할에 집중하고,
  // 실제 법안의 최종 상태 변경(auto_rejected 등)은 NationalAssembly 또는 별도의 로직(예: Cloud Function)에서 담당하는 것이 더 적절할 수 있습니다.
  // 여기서는 UI 표시에 필요한 정보만 활용합니다.
  // 만약 이 컴포넌트에서 직접 상태를 변경해야 한다면, 아래 로직을 Firestore 쓰기와 함께 구현해야 합니다.
  // useEffect(() => {
  //   if (!classCode || vetoPendingLaws.length === 0) return;

  //   const now = new Date();
  //   const batch = writeBatch(db);
  //   let needsUpdate = false;

  //   vetoPendingLaws.forEach(law => {
  //     if (law.status === "vetoed" && law.vetoDeadline) {
  //       const deadlineDate = new Date(law.vetoDeadline);
  //       const currentApprovals = law.approvals || 0;

  //       if (now > deadlineDate && currentApprovals < adminSettings.vetoOverrideRequired) {
  //         const lawDocRef = doc(db, "laws", law.id);
  //         batch.update(lawDocRef, {
  //           status: "auto_rejected", // 자동 부결
  //           finalStatus: "rejected", // 최종 상태: 부결
  //           rejectionReason: "재의결 기한 만료 및 찬성 미달",
  //           finalDecisionDate: serverTimestamp(),
  //         });
  //         needsUpdate = true;
  //         logger.log(`법안 "${law.title}" 자동 부결 처리됨.`);
  //       }
  //     }
  //   });

  //   if (needsUpdate) {
  //     batch.commit()
  //       .then(() => logger.log("자동 부결 법안 상태 일괄 업데이트 완료."))
  //       .catch(error => logger.error("자동 부결 법안 상태 업데이트 오류:", error));
  //   }
  //   // 이 로직은 NationalAssembly.js에서 주기적으로 실행되거나 Cloud Function으로 처리하는 것이 더 적합합니다.
  //   // 여기서는 참고용으로만 남겨둡니다.
  // }, [vetoPendingLaws, adminSettings.vetoOverrideRequired, classCode]);

  if (!classCode) {
    return (
      <div className="org-chart-container">
        <p>선택된 학급이 없습니다. 학급을 먼저 선택해주세요.</p>
      </div>
    );
  }

  if (loadingSettings || loadingLaws) {
    return (
      <div className="org-chart-container">
        <p>정부 조직도 정보를 불러오는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="org-chart-container">
      <div className="org-header">
        <h1 className="org-title">정부 조직도</h1>
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
                setNewSettings({
                  vetoOverrideRequired: adminSettings.vetoOverrideRequired,
                  adminPassword: "",
                });
                setShowSettingsModal(true);
              }}
            >
              설정
            </button>
          )}
        </div>
      </div>

      <div className="president-section">
        <div className="president-office">
          <h2>대통령실</h2>
          {canManage && (
            <div className="admin-indicator">
              {isPresident ? "대통령 권한" : "관리자 권한"}
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
                      {law.fine
                        ? `${law.fine.toLocaleString()}원`
                        : "정보 없음"}
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

        {/* 승인 대기 법안 (laws 컬렉션) */}
        <div className="law-approval-section">
          <h3>승인 대기 중인 법안</h3>
          {approvedLaws.length === 0 ? (
            <div className="empty-state">승인 대기 중인 법안이 없습니다.</div>
          ) : (
            <div className="pending-laws">
              {approvedLaws.map((law) => (
                <div key={law.id} className="law-card">
                  <div className="law-header">
                    <h3 className="law-title">{law.title}</h3>
                    <div className="law-status">국회 가결 (승인 대기)</div>
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
                      {law.fine
                        ? `${law.fine.toLocaleString()}원`
                        : "정보 없음"}
                    </p>
                    <p>
                      <strong>국회 승인:</strong> 찬성 {law.approvals || 0}명,
                      반대 {law.disapprovals || 0}명
                    </p>
                    <p>
                      <strong>국회 가결일:</strong>{" "}
                      {formatDate(law.approvalDate)}
                    </p>
                  </div>
                  <div className="law-actions">
                    <button
                      className="approve-button"
                      onClick={() => approveLaw(law)}
                      disabled={!canManage}
                    >
                      최종 승인
                    </button>
                    <button
                      className="veto-button"
                      onClick={() => openVetoModal(law)}
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
                      {law.fine
                        ? `${law.fine.toLocaleString()}원`
                        : "정보 없음"}
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
                      {adminSettings.vetoOverrideRequired}명
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 거부권 행사 모달 */}
      {showModal && selectedLaw && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h2 className="modal-title">거부권 행사</h2>
            </div>
            <div className="modal-content">
              <h3>{selectedLaw.title}</h3>
              <p>이 법안에 대해 거부권을 행사하시겠습니까?</p>
              <p>
                국회 재의결을 위해서는{" "}
                <strong>{adminSettings.vetoOverrideRequired}명</strong> 이상의
                찬성이 필요합니다.
              </p>
              <div className="form-group">
                <label className="form-label">거부 사유 (필수)</label>
                <textarea
                  className="form-textarea"
                  rows="4"
                  value={vetoReason}
                  onChange={(e) => setVetoReason(e.target.value)}
                  placeholder="거부 사유를 상세히 작성해주세요."
                ></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="modal-button cancel"
                onClick={() => {
                  setShowModal(false);
                  setSelectedLaw(null);
                }}
              >
                취소
              </button>
              <button
                className="modal-button veto"
                onClick={vetoLaw}
                disabled={!vetoReason}
              >
                거부권 행사
              </button>
            </div>
          </div>
        </div>
      )}

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
                  value={newSettings.vetoOverrideRequired}
                  onChange={(e) =>
                    setNewSettings({
                      ...newSettings,
                      vetoOverrideRequired: parseInt(e.target.value) || 0,
                    })
                  }
                />
                <p className="form-hint">
                  거부권 행사 후 법안이 최종 가결되기 위해 필요한 국회 찬성표 수
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">
                  관리자 비밀번호 변경 (선택)
                </label>
                <input
                  type="password"
                  className="form-input"
                  value={newSettings.adminPassword}
                  onChange={(e) =>
                    setNewSettings({
                      ...newSettings,
                      adminPassword: e.target.value,
                    })
                  }
                  placeholder="변경하려면 입력, 아니면 비워두세요"
                />
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
