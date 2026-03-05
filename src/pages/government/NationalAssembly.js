// src/NationalAssembly.js
import React, { useState, useEffect, useCallback, useMemo } from "react";
import "./NationalAssembly.css";
import { useAuth } from "../../contexts/AuthContext";
import { db } from "../../firebase";
import { usePolling } from "../../hooks/usePolling";
import { AlchanLoading } from "../../components/AlchanLayout";

import { logger } from "../../utils/logger";
// Firestore v9 모듈식 API에서 필요한 함수들을 직접 한 번에 가져옵니다.
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  increment,
  writeBatch,
  setDoc,
  serverTimestamp,
  runTransaction, // ❗ runTransaction 함수 추가
} from "firebase/firestore";

const NationalAssembly = () => {
  const { userDoc: currentUser, loading: authLoading, isAdmin } = useAuth();

  const { data: jobs } = usePolling(
    async () => {
      if (!currentUser?.classCode) return [];
      const jobsRef = collection(db, "jobs");
      const q = query(jobsRef, where("classCode", "==", currentUser.classCode));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    },
    {
      // 🔥 [비용 최적화] 5분 → 30분 (직업 목록은 거의 안 바뀜)
      interval: 30 * 60 * 1000,
      enabled: !!currentUser?.classCode,
      deps: [currentUser?.classCode],
    }
  );

  const canProposeLaw = useCallback(() => {
    if (isAdmin()) return true;
    if (!currentUser?.selectedJobIds || !jobs || jobs.length === 0) return false;
    const selectedJobs = jobs.filter(job => currentUser.selectedJobIds.includes(job.id));
    return selectedJobs.some(job => job.title === '국회의원');
  }, [isAdmin, currentUser, jobs]);

  const classCode = currentUser?.classCode;

  const [activeTab, setActiveTab] = useState("propose");
  const [showProposeLawModal, setShowProposeLawModal] = useState(false);
  const [showEditLawModal, setShowEditLawModal] = useState(false);
  const [newLaw, setNewLaw] = useState({
    title: "",
    purpose: "",
    description: "",
    fine: "",
  });
  const [editingLaw, setEditingLaw] = useState(null);
  const [localAdminSettings, setLocalAdminSettings] = useState(null);
  const [localGovSettings, setLocalGovSettings] = useState(null);

  // 낙관적 업데이트를 위한 로컬 상태
  const [optimisticVotes, setOptimisticVotes] = useState({});
  const [optimisticUserVotes, setOptimisticUserVotes] = useState({});
  const [optimisticDeletedLaws, setOptimisticDeletedLaws] = useState(new Set());
  const [optimisticEditedLaws, setOptimisticEditedLaws] = useState({});
  const [optimisticNewLaws, setOptimisticNewLaws] = useState([]);

  // 관리자 설정 로드 및 초기화
  const { data: adminSettings, loading: adminSettingsLoading } = usePolling(
    async () => {
      if (!classCode) return { totalStudents: 25 };

      const adminSettingsDocRefNode = doc(
        db,
        "classes",
        classCode,
        "nationalAssemblySettings",
        "admin"
      );

      const docSnap = await getDoc(adminSettingsDocRefNode);

      if (docSnap.exists()) {
        return docSnap.data();
      } else {
        const defaultAdminSettings = { totalStudents: 25 };
        await setDoc(adminSettingsDocRefNode, defaultAdminSettings);
        return defaultAdminSettings;
      }
    },
    {
      interval: 60 * 60 * 1000, // 🔥 [비용 최적화] 5분 → 1시간 (설정은 거의 안 바뀜)
      enabled: !!classCode,
      deps: [classCode],
      defaultValue: { totalStudents: 25 },
      onError: (error) => {
        logger.error("Error fetching admin settings:", error);
      }
    }
  );

  // 정부 설정 로드 및 초기화
  const { data: governmentSettings, loading: govSettingsLoading } = usePolling(
    async () => {
      if (!classCode || adminSettingsLoading) {
        return {
          vetoOverrideRequired: Math.ceil(
            ((adminSettings?.totalStudents) || 25) * (2 / 3)
          ),
        };
      }

      const govSettingsDocRefNode = doc(
        db,
        "classes",
        classCode,
        "nationalAssemblySettings",
        "government"
      );

      const docSnap = await getDoc(govSettingsDocRefNode);

      if (docSnap.exists()) {
        return docSnap.data();
      } else {
        const defaultGovSettings = {
          vetoOverrideRequired: Math.ceil(
            ((adminSettings?.totalStudents) || 25) * (2 / 3)
          ),
        };
        await setDoc(govSettingsDocRefNode, defaultGovSettings);
        return defaultGovSettings;
      }
    },
    {
      interval: 60 * 60 * 1000, // 🔥 [비용 최적화] 5분 → 1시간 (설정은 거의 안 바뀜)
      enabled: !!classCode && !adminSettingsLoading,
      deps: [classCode, adminSettings?.totalStudents, adminSettingsLoading],
      defaultValue: {
        vetoOverrideRequired: Math.ceil(
          ((adminSettings?.totalStudents) || 25) * (2 / 3)
        ),
      },
      onError: (error) => {
        logger.error("Error fetching government settings:", error);
      }
    }
  );

  // 법안 데이터 로드
  const { data: laws, loading: lawsLoading, refetch: refetchLaws } = usePolling(
    async () => {
      if (!classCode) return [];

      const lawsCollectionRefNode = collection(
        db,
        "classes",
        classCode,
        "nationalAssemblyLaws"
      );
      const q = query(lawsCollectionRefNode, orderBy("timestamp", "desc"), limit(100));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate
          ? doc.data().timestamp.toDate().toISOString()
          : new Date().toISOString(),
        vetoDate: doc.data().vetoDate?.toDate
          ? doc.data().vetoDate.toDate().toISOString()
          : null,
        vetoDeadline: doc.data().vetoDeadline?.toDate
          ? doc.data().vetoDeadline.toDate().toISOString()
          : null,
        finalApprovalDate: doc.data().finalApprovalDate?.toDate
          ? doc.data().finalApprovalDate.toDate().toISOString()
          : null,
      }));
    },
    {
      interval: 10 * 60 * 1000, // 🔥 [비용 최적화] 5분 → 10분 (법안은 투표 시 수동 갱신됨)
      enabled: !!classCode,
      deps: [classCode],
      defaultValue: [],
      onError: (error) => {
        logger.error("Error fetching laws:", error);
      }
    }
  );

  // 사용자 투표 이력 로드
  const { data: userVotes, loading: userVotesLoading } = usePolling(
    async () => {
      if (!classCode || !currentUser?.id) return {};

      const userVotesDocRefNode = doc(
        db,
        "classes",
        classCode,
        "userVotes",
        currentUser.id
      );

      const docSnap = await getDoc(userVotesDocRefNode);

      if (docSnap.exists()) {
        return docSnap.data();
      } else {
        return {};
      }
    },
    {
      interval: 30 * 60 * 1000, // 🔥 [비용 최적화] 5분 → 30분 (투표 이력은 투표 시 업데이트됨)
      enabled: !!classCode && !!currentUser?.id,
      deps: [classCode, currentUser?.id],
      defaultValue: {},
      onError: (error) => {
        logger.error("Error fetching user votes:", error);
      }
    }
  );

  // --- 🔥 [수정] 새 법안 제안 함수 (낙관적 업데이트 적용) ---
  const handleProposeLaw = async () => {
    logger.log("[NationalAssembly] handleProposeLaw 시작");
    logger.log("[NationalAssembly] classCode:", classCode);
    logger.log("[NationalAssembly] currentUser:", currentUser);
    logger.log("[NationalAssembly] newLaw:", newLaw);

    if (!classCode || !currentUser) {
      logger.log("[NationalAssembly] 학급 정보 또는 유저 정보 없음");
      alert("학급 정보가 없거나 로그인되지 않았습니다.");
      return;
    }
    if (!newLaw.title || !newLaw.description || !newLaw.fine) {
      logger.log("[NationalAssembly] 필수 필드 누락");
      alert("모든 필드를 입력해주세요.");
      return;
    }

    // 임시 ID 생성 (낙관적 업데이트용)
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // 낙관적 업데이트: 즉시 UI에 새 법안 추가
    const optimisticLaw = {
      id: tempId,
      ...newLaw,
      proposerId: currentUser.id,
      proposerName: currentUser.name || "익명",
      approvals: 0,
      disapprovals: 0,
      status: "pending",
      timestamp: new Date().toISOString(),
      classCode: classCode,
      voters: {},
      isOptimistic: true, // 낙관적 업데이트 플래그
    };

    setOptimisticNewLaws(prev => [optimisticLaw, ...prev]);
    setShowProposeLawModal(false);
    const savedNewLaw = { ...newLaw };
    setNewLaw({ title: "", purpose: "", description: "", fine: "" });

    // 🔥 collection 함수의 올바른 사용법: db 인스턴스와 전체 경로를 인자로 전달합니다.
    const lawsCollectionRef = collection(db, "classes", classCode, "nationalAssemblyLaws");

    const newLawData = {
      ...savedNewLaw,
      proposerId: currentUser.id,
      proposerName: currentUser.name || "익명",
      approvals: 0,
      disapprovals: 0,
      status: "pending",
      timestamp: serverTimestamp(),
      classCode: classCode,
      voters: {},
    };

    try {
      // 🔥 수정된 collection 참조를 사용하여 문서를 추가합니다.
      const docRef = await addDoc(lawsCollectionRef, newLawData);
      logger.log("새 법안이 성공적으로 제안되었습니다:", newLawData.title);

      // 성공 시: 즉시 서버에서 최신 법안 목록을 가져옴
      await refetchLaws();

      // refetch 완료 후 임시 법안 제거
      setOptimisticNewLaws(prev => prev.filter(law => law.id !== tempId));
    } catch (error) {
      logger.error("Error proposing new law:", error);

      // 롤백: 낙관적으로 추가된 법안 제거
      setOptimisticNewLaws(prev => prev.filter(law => law.id !== tempId));

      alert("법안 제안 중 오류가 발생했습니다.");
    }
  };

  const handleOpenEditModal = (law) => {
    if (!isAdmin()) {
      alert("관리자만 법안을 수정할 수 있습니다.");
      return;
    }
    setEditingLaw({ ...law });
    setShowEditLawModal(true);
  };

  const handleSaveEditLaw = async () => {
    if (!classCode || !editingLaw || !editingLaw.id || !isAdmin()) {
      alert("수정 권한이 없거나 정보가 부족합니다.");
      return;
    }
    if (!editingLaw.title || !editingLaw.description || !editingLaw.fine) {
      alert("모든 필드를 입력해주세요.");
      return;
    }

    // 낙관적 업데이트: 즉시 UI에 반영
    setOptimisticEditedLaws(prev => ({
      ...prev,
      [editingLaw.id]: editingLaw
    }));
    setShowEditLawModal(false);
    const previousEditingLaw = editingLaw;
    setEditingLaw(null);

    const lawDocRef = doc(
      db,
      "classes",
      classCode,
      "nationalAssemblyLaws",
      previousEditingLaw.id
    );
    try {
      const {
        id,
        voters,
        timestamp,
        classCode: lawClassCode,
        proposerId,
        proposerName,
        ...dataToUpdate
      } = previousEditingLaw;
      await updateDoc(lawDocRef, {
        ...dataToUpdate,
        updatedAt: serverTimestamp(),
      });

      // 성공 시: 즉시 서버에서 최신 법안 목록을 가져옴
      await refetchLaws();

      // refetch 완료 후 낙관적 수정 상태 제거
      setOptimisticEditedLaws(prev => {
        const newState = { ...prev };
        delete newState[previousEditingLaw.id];
        return newState;
      });
    } catch (error) {
      logger.error("Error saving edited law:", error);

      // 롤백: 수정 취소
      setOptimisticEditedLaws(prev => {
        const newState = { ...prev };
        delete newState[previousEditingLaw.id];
        return newState;
      });

      alert("법안 저장 중 오류가 발생했습니다.");
    }
  };

  const handleVote = async (lawId, voteType) => {
    if (!classCode || !currentUser?.id) {
      alert("투표를 처리할 수 없습니다. (정보 부족)");
      return;
    }

    // 중복 투표 체크 (낙관적 상태 또는 서버 상태)
    const hasVotedOptimistic = optimisticUserVotes[lawId];
    const hasVotedServer = userVotes[lawId];
    if (!isAdmin() && (hasVotedOptimistic || hasVotedServer)) {
      alert("이미 이 법안에 투표하셨습니다.");
      return;
    }

    const law = laws.find(l => l.id === lawId);
    if (!law) {
      alert("법안을 찾을 수 없습니다.");
      return;
    }

    // 낙관적 업데이트: 즉시 UI 업데이트
    setOptimisticUserVotes(prev => ({ ...prev, [lawId]: voteType }));
    setOptimisticVotes(prev => ({
      ...prev,
      [lawId]: {
        approvals: (prev[lawId]?.approvals || law.approvals || 0) + (voteType === "approvals" ? 1 : 0),
        disapprovals: (prev[lawId]?.disapprovals || law.disapprovals || 0) + (voteType === "disapprovals" ? 1 : 0),
      }
    }));

    const userVotesDocRefNode = doc(
      db,
      "classes",
      classCode,
      "userVotes",
      currentUser.id
    );
    const lawRef = doc(db, "classes", classCode, "nationalAssemblyLaws", lawId);

    try {
      await runTransaction(db, async (transaction) => {
        const lawDoc = await transaction.get(lawRef);
        const userVotesDoc = await transaction.get(userVotesDocRefNode);

        if (!lawDoc.exists()) {
          throw new Error("법안이 존재하지 않습니다.");
        }

        const lawData = lawDoc.data();
        const userVotesData = userVotesDoc.exists() ? userVotesDoc.data() : {};

        // 재의결이 아닌 경우 중복 투표 확인
        if (!isAdmin() && userVotesData[lawId] && lawData.status !== "vetoed") {
          throw new Error("이미 이 법안에 투표하셨습니다.");
        }

        const totalStudents = adminSettings.totalStudents;
        const halfStudents = Math.ceil(totalStudents / 2);
        const vetoOverrideRequiredCount = governmentSettings.vetoOverrideRequired;

        const newApprovals = (lawData.approvals || 0) + (voteType === "approvals" ? 1 : 0);
        const newDisapprovals = (lawData.disapprovals || 0) + (voteType === "disapprovals" ? 1 : 0);

        const updates = { updatedAt: serverTimestamp() };

        if (voteType === "approvals") {
          updates.approvals = increment(1);
        } else {
          updates.disapprovals = increment(1);
        }

        if (!isAdmin()) {
          updates[`voters.${currentUser.id}`] = voteType;
        }

        // 법안 상태에 따라 로직 적용
        if (lawData.status === "vetoed") {
          if (voteType === "approvals" && newApprovals >= vetoOverrideRequiredCount) {
            updates.status = "veto_overridden";
            updates.finalStatus = "final_approved";
            updates.finalApprovalDate = serverTimestamp();
          }
        } else if (["pending", "rejected", "auto_rejected"].includes(lawData.status)) {
          if (voteType === "approvals" && newApprovals >= halfStudents) {
            updates.status = "pending_government_approval";
            updates.approvalDate = serverTimestamp();
          } else if (voteType === "disapprovals" && newDisapprovals >= halfStudents) {
            updates.status = "rejected";
          }
        } else {
          throw new Error("이미 처리되었거나 투표가 불가능한 법안입니다.");
        }

        transaction.update(lawRef, updates);

        if (!isAdmin()) {
          transaction.set(userVotesDocRefNode, { [lawId]: voteType }, { merge: true });
        }
      });

      // 트랜잭션 성공 시 낙관적 업데이트 상태 정리 (서버 데이터로 대체됨)
      // usePolling이 자동으로 최신 데이터를 가져올 것이므로 여기서는 별도 처리 불필요
    } catch (error) {
      logger.error("Error voting on law:", error);

      // 롤백: 낙관적 업데이트 취소
      setOptimisticUserVotes(prev => {
        const newState = { ...prev };
        delete newState[lawId];
        return newState;
      });
      setOptimisticVotes(prev => {
        const newState = { ...prev };
        delete newState[lawId];
        return newState;
      });

      alert(`투표 중 오류 발생: ${error.message || error}`);
    }
  };


  const handleResetVotes = async (lawId) => {
    if (!isAdmin() || !classCode) {
      alert("관리자만 이 작업을 수행할 수 있습니다.");
      return;
    }
    if (window.confirm("이 법안의 모든 투표를 초기화하시겠습니까?")) {
      const lawDocRef = doc(
        db,
        "classes",
        classCode,
        "nationalAssemblyLaws",
        lawId
      );
      try {
        // 낙관적 업데이트 상태 초기화
        setOptimisticVotes(prev => {
          const newState = { ...prev };
          delete newState[lawId];
          return newState;
        });
        setOptimisticUserVotes(prev => {
          const newState = { ...prev };
          delete newState[lawId];
          return newState;
        });

        await updateDoc(lawDocRef, {
          approvals: 0,
          disapprovals: 0,
          status: "pending",
          voters: {},
          updatedAt: serverTimestamp(),
          finalStatus: null,
          finalApprovalDate: null,
        });
        alert("법안 투표가 초기화되었습니다.");
      } catch (error) {
        logger.error("Error resetting votes:", error);
        alert("투표 초기화 중 오류가 발생했습니다.");
      }
    }
  };

  const handleDeleteLaw = async (id) => {
    if (!classCode) return;
    const lawToDelete = laws.find((law) => law.id === id);
    if (!lawToDelete) return;

    if (
      !isAdmin() &&
      !(
        (lawToDelete.status === "rejected" ||
          lawToDelete.status === "auto_rejected") &&
        lawToDelete.proposerId === currentUser?.id
      )
    ) {
      alert("관리자 또는 부결된 법안의 제안자만 삭제할 수 있습니다.");
      return;
    }
    if (window.confirm("정말로 이 법안을 삭제하시겠습니까?")) {
      // 낙관적 업데이트: 즉시 UI에서 제거
      setOptimisticDeletedLaws(prev => new Set([...prev, id]));

      const lawDocRef = doc(
        db,
        "classes",
        classCode,
        "nationalAssemblyLaws",
        id
      );
      try {
        await deleteDoc(lawDocRef);

        // 성공 시: 즉시 서버에서 최신 법안 목록을 가져옴
        await refetchLaws();

        // refetch 완료 후 낙관적 삭제 상태 제거
        setOptimisticDeletedLaws(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      } catch (error) {
        logger.error("Error deleting law:", error);

        // 롤백: 삭제 취소
        setOptimisticDeletedLaws(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });

        alert("법안 삭제 중 오류가 발생했습니다.");
      }
    }
  };

  const handleSaveAdminSettings = async () => {
    if (!classCode || !isAdmin()) {
      alert("관리자 권한이 없거나 학급 정보가 없습니다.");
      return;
    }
    const adminSettingsDocRefNode = doc(
      db,
      "classes",
      classCode,
      "nationalAssemblySettings",
      "admin"
    );
    try {
      const settingsToSave = localAdminSettings || adminSettings;
      await setDoc(
        adminSettingsDocRefNode,
        {
          totalStudents: parseInt(settingsToSave.totalStudents, 10) || 25,
        },
        { merge: true }
      );
      setLocalAdminSettings(null);
      alert("관리자 설정이 저장되었습니다.");
    } catch (error) {
      logger.error("Error saving admin settings:", error);
      alert("관리자 설정 저장 중 오류가 발생했습니다.");
    }
  };

  const handleSaveGovernmentSettings = async () => {
    if (!classCode || !isAdmin()) {
      alert("설정 저장 권한이 없거나 학급 정보가 없습니다.");
      return;
    }
    const govSettingsDocRefNode = doc(
      db,
      "classes",
      classCode,
      "nationalAssemblySettings",
      "government"
    );
    try {
      const settingsToSave = localGovSettings || governmentSettings;
      await setDoc(
        govSettingsDocRefNode,
        {
          vetoOverrideRequired:
            parseInt(settingsToSave.vetoOverrideRequired, 10) ||
            Math.ceil(adminSettings.totalStudents * (2 / 3)),
        },
        { merge: true }
      );
      setLocalGovSettings(null);
      alert("재의결 설정이 저장되었습니다.");
    } catch (error) {
      logger.error("Error saving government settings:", error);
      alert("재의결 설정 저장 중 오류가 발생했습니다.");
    }
  };

  // 낙관적 업데이트를 laws 배열에 반영
  const displayLaws = useMemo(() => {
    let result = (laws || [])
      // 낙관적으로 삭제된 법안 제외
      .filter(law => !optimisticDeletedLaws.has(law.id))
      // 낙관적으로 수정된 법안 반영
      .map(law => {
        if (optimisticEditedLaws[law.id]) {
          return { ...law, ...optimisticEditedLaws[law.id] };
        }
        return law;
      });

    // 낙관적으로 추가된 새 법안을 맨 앞에 추가
    if (optimisticNewLaws.length > 0) {
      result = [...optimisticNewLaws, ...result];
    }

    return result;
  }, [laws, optimisticDeletedLaws, optimisticEditedLaws, optimisticNewLaws]);

  // 투표 미참여 법안 알림 시스템
  const unvotedPendingLaws = useMemo(() => {
    if (!currentUser?.id || isAdmin()) return [];
    return (displayLaws || []).filter(law => {
      if (law.status !== "pending") return false;
      // 이미 투표했는지 확인 (낙관적 + 서버 + voters 필드)
      if (optimisticUserVotes[law.id]) return false;
      if (userVotes && userVotes[law.id]) return false;
      if (law.voters && law.voters[currentUser.id]) return false;
      return true;
    });
  }, [displayLaws, currentUser?.id, isAdmin, optimisticUserVotes, userVotes]);

  // 하루에 한번 투표 미참여 알림
  useEffect(() => {
    if (unvotedPendingLaws.length === 0 || !currentUser?.id) return;

    const storageKey = `alchan-vote-reminder-${currentUser.id}`;
    const today = new Date().toDateString();
    const lastReminder = localStorage.getItem(storageKey);

    if (lastReminder === today) return;

    // 오늘 처음 방문 시 알림 표시
    localStorage.setItem(storageKey, today);
    const lawTitles = unvotedPendingLaws.map(l => `• ${l.title}`).join('\n');
    setTimeout(() => {
      alert(
        `📢 투표 참여 안내\n\n아직 투표하지 않은 법안이 ${unvotedPendingLaws.length}건 있습니다:\n\n${lawTitles}\n\n법안 심의에 참여해주세요!`
      );
    }, 500);
  }, [unvotedPendingLaws, currentUser?.id]);

  const approvedLaws = displayLaws.filter(
    (law) =>
      law.status === "veto_overridden" ||
      law.finalStatus === "final_approved"
  );
  // ✨ 수정된 부분: pendingLaws 필터에 'pending_government_approval' 추가
  const pendingLaws = displayLaws.filter(
    (law) =>
      law.status === "pending" ||
      law.status === "rejected" ||
      law.status === "auto_rejected" ||
      law.status === "pending_government_approval"
  );
  const vetoedLaws = displayLaws.filter((law) => law.status === "vetoed");

  let displayedLaws;
  if (activeTab === "approved") {
    displayedLaws = approvedLaws;
  } else if (activeTab === "vetoed") {
    displayedLaws = vetoedLaws;
  } else {
    displayedLaws = pendingLaws;
  }

  const sortedLaws = [...displayedLaws];

  const getLawStatusDisplay = (law) => {
    if (law.finalStatus === "final_approved") {
      return <span className="law-status final-approved">최종 가결</span>;
    }
    switch (law.status) {
      // ✨ 추가된 부분: '정부 이송' 상태 표시
      case "pending_government_approval":
        return <span className="law-status pending-gov">정부 이송</span>;
      case "approved":
        return <span className="law-status approved">가결됨</span>;
      case "veto_overridden":
        return <span className="law-status override">재의결 가결</span>;
      case "vetoed":
        return <span className="law-status vetoed">거부권 행사됨</span>;
      case "rejected":
        return <span className="law-status rejected">부결됨</span>;
      case "auto_rejected":
        return <span className="law-status auto-rejected">자동 부결됨</span>;
      default:
        return <span className="law-status pending">심의중</span>;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "정보 없음";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "유효하지 않은 날짜";
      return `${date.getFullYear()}년 ${
        date.getMonth() + 1
      }월 ${date.getDate()}일 ${date.getHours()}시 ${date.getMinutes()}분`;
    } catch (e) {
      return "날짜 변환 오류";
    }
  };

  const getRemainingTime = (deadlineString) => {
    if (!deadlineString) return "기한 없음";
    const now = new Date();
    const deadlineDate = new Date(deadlineString);
    if (isNaN(deadlineDate.getTime())) return "유효하지 않은 기한";
    const diff = deadlineDate - now;

    if (diff <= 0) return "시간 만료";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    let remaining = "";
    if (days > 0) remaining += `${days}일 `;
    if (hours > 0 || days > 0) remaining += `${hours}시간 `;
    if (minutes > 0 || (days === 0 && hours === 0)) remaining += `${minutes}분`;

    return remaining.trim() + " 남음" || "곧 만료";
  };

  const renderAdminActions = (law) => {
    if (!isAdmin()) return null;
    return (
      <div className="admin-actions">
        <button
          onClick={() => handleOpenEditModal(law)}
          className="admin-button edit-button"
        >
          수정
        </button>
        <button
          onClick={() => handleDeleteLaw(law.id)}
          className="admin-button delete-button"
        >
          삭제
        </button>
        {(law.status === "pending" ||
          law.status === "rejected" ||
          law.status === "vetoed" ||
          law.status === "auto_rejected") && (
          <button
            onClick={() => handleResetVotes(law.id)}
            className="admin-button reset-button"
          >
            투표 초기화
          </button>
        )}
      </div>
    );
  };

  if (authLoading) {
    return <AlchanLoading />;
  }
  if (!currentUser) {
    return (
      <div className="loading-container">
        로그인이 필요합니다. 국회 기능을 사용하려면 다시 로그인해주세요.
      </div>
    );
  }
  if (!classCode) {
    return (
      <div className="loading-container">
        국회 기능을 사용하려면 학급 코드가 사용자 정보에 설정되어 있어야 합니다.
        프로필에서 학급 코드를 설정해주세요.
      </div>
    );
  }
  if (
    lawsLoading ||
    adminSettingsLoading ||
    govSettingsLoading ||
    userVotesLoading
  ) {
    return <AlchanLoading />;
  }

  if (!adminSettings) {
    return <AlchanLoading />;
  }

  return (
    <div className="national-assembly-container">
      <div className="assembly-header">
        <h1 className="assembly-title">국회 의사당 (학급: {classCode})</h1>
        <div className="assembly-tabs">
          <button
            className={`assembly-tab ${
              activeTab === "propose" ? "active" : ""
            }`}
            onClick={() => setActiveTab("propose")}
          >
            법안 올리기/심의
          </button>
          <button
            className={`assembly-tab ${
              activeTab === "approved" ? "active" : ""
            }`}
            onClick={() => setActiveTab("approved")}
          >
            우리반 법
          </button>
          <button
            className={`assembly-tab ${activeTab === "vetoed" ? "active" : ""}`}
            onClick={() => setActiveTab("vetoed")}
          >
            재의결 법안
          </button>
          {isAdmin() && (
            <button
              className={`assembly-tab ${
                activeTab === "admin" ? "active" : ""
              }`}
              onClick={() => setActiveTab("admin")}
            >
              관리자 설정
            </button>
          )}
        </div>
      </div>

      {/* 투표 미참여 법안 알림 배너 */}
      {unvotedPendingLaws.length > 0 && !isAdmin() && (
        <div className="vote-reminder-banner">
          <span className="vote-reminder-icon">📢</span>
          <div className="vote-reminder-content">
            <strong>투표 참여 안내</strong>
            <span>아직 투표하지 않은 심의중 법안이 <strong>{unvotedPendingLaws.length}건</strong> 있습니다. 찬반 투표에 참여해주세요!</span>
          </div>
          <button
            className="vote-reminder-btn"
            onClick={() => setActiveTab("propose")}
          >
            투표하러 가기
          </button>
        </div>
      )}

      <div className="assembly-content">
        {activeTab === "propose" && (
          <>
            {canProposeLaw() && (
              <div className="content-actions">
                <button
                  onClick={() => setShowProposeLawModal(true)}
                  className="action-button propose-button"
                >
                  새 법안 제안하기
                </button>
              </div>
            )}
            {sortedLaws.length === 0 ? (
              <div className="empty-state">
                아직 등록되거나 심의중인 법안이 없습니다. 새 법안을
                제안해보세요!
              </div>
            ) : (
              <div className="law-list">
                {sortedLaws.map((law) => (
                  <div key={law.id} className={`law-card ${law.status}`}>
                    <div className="law-content-wrapper">
                      <div className="law-header">
                        <h2 className="law-title">{law.title}</h2>
                        <div className="law-status-container">
                          {getLawStatusDisplay(law)}
                        </div>
                      </div>
                      <div className="law-content">
                        <p>
                          <strong>제안자:</strong>{" "}
                          {law.proposerName || "정보 없음"}
                        </p>
                        <p>
                          <strong>취지:</strong> {law.purpose}
                        </p>
                        <p>
                          <strong>설명:</strong> {law.description}
                        </p>
                        <p>
                          <strong>벌금:</strong> {law.fine}
                        </p>
                        <p className="law-timestamp">
                          제안일: {formatDate(law.timestamp)}
                        </p>
                      </div>
                      <div className="law-footer">
                        <div className="vote-stats">
                          <div className="vote-count">
                            <div className="vote-type approval">
                              찬성:{" "}
                              <span className="vote-number">
                                {optimisticVotes[law.id]?.approvals ?? law.approvals ?? 0}
                              </span>
                              {/* ✨ 수정된 부분: 필요 투표 수 안내 문구 변경 */}
                              <span className="vote-required">
                                /{Math.ceil(adminSettings.totalStudents / 2)}표 필요 (정부 이송)
                              </span>
                            </div>
                            <div className="vote-type disapproval">
                              반대:{" "}
                              <span className="vote-number">
                                {optimisticVotes[law.id]?.disapprovals ?? law.disapprovals ?? 0}
                              </span>
                              <span className="vote-required">
                                /{Math.ceil(adminSettings.totalStudents / 2)}{" "}
                                필요 (부결)
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="action-buttons">
                          {(law.status === "pending" ||
                            ((law.status === "rejected" ||
                              law.status === "auto_rejected") &&
                              law.proposerId === currentUser?.id)) && (
                            <div className="vote-actions">
                              <button
                                onClick={() => handleVote(law.id, "approvals")}
                                className={`vote-button approve ${
                                  !isAdmin() && (optimisticUserVotes[law.id] || userVotes[law.id] ||
                                  (law.voters && law.voters[currentUser?.id]))
                                    ? "voted"
                                    : ""
                                }`}
                                disabled={
                                  !isAdmin() && (optimisticUserVotes[law.id] || userVotes[law.id] ||
                                  (law.voters && law.voters[currentUser?.id]))
                                }
                              >
                                찬성
                              </button>
                              <button
                                onClick={() =>
                                  handleVote(law.id, "disapprovals")
                                }
                                className={`vote-button disapprove ${
                                  !isAdmin() && (optimisticUserVotes[law.id] || userVotes[law.id] ||
                                  (law.voters && law.voters[currentUser?.id]))
                                    ? "voted"
                                    : ""
                                }`}
                                disabled={
                                  !isAdmin() && (optimisticUserVotes[law.id] || userVotes[law.id] ||
                                  (law.voters && law.voters[currentUser?.id]))
                                }
                              >
                                반대
                              </button>
                            </div>
                          )}
                          {(law.status === "rejected" ||
                            law.status === "auto_rejected") &&
                            law.proposerId === currentUser?.id &&
                            !isAdmin() && (
                              <button
                                onClick={() => handleDeleteLaw(law.id)}
                                className="reject-delete-button"
                              >
                                부결 법안 삭제
                              </button>
                            )}
                          {renderAdminActions(law)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "approved" && (
          <div className="approved-laws-container">
            <h2 className="section-title">📜 우리반 법안 목록</h2>
            {approvedLaws.length === 0 ? (
              <div className="empty-state">아직 가결된 법안이 없습니다.</div>
            ) : (
              <div className="law-list">
                {approvedLaws.map((law) => (
                  <div
                    key={law.id}
                    className={`law-card ${law.finalStatus || law.status}`}
                  >
                    <div className="law-content-wrapper">
                      <div className="law-header">
                        <h2 className="law-title">{law.title}</h2>
                        {getLawStatusDisplay(law)}
                      </div>
                      <div className="law-content">
                        <p>
                          <strong>제안자:</strong>{" "}
                          {law.proposerName || "정보 없음"}
                        </p>
                        <p>
                          <strong>취지:</strong> {law.purpose}
                        </p>
                        <p>
                          <strong>설명:</strong> {law.description}
                        </p>
                        <p>
                          <strong>벌금:</strong> {law.fine}
                        </p>
                        <p className="law-timestamp">
                          {law.finalStatus === "final_approved" &&
                          law.finalApprovalDate
                            ? "최종 승인일: "
                            : "가결일: "}
                          {formatDate(law.finalApprovalDate || law.timestamp)}
                        </p>
                      </div>
                      <div className="law-footer">
                        <div className="vote-stats">
                          <div className="vote-count">
                            <div className="vote-type approval">
                              찬성:{" "}
                              <span className="vote-number">
                                {law.approvals || 0}
                              </span>
                            </div>
                            <div className="vote-type disapproval">
                              반대:{" "}
                              <span className="vote-number">
                                {law.disapprovals || 0}
                              </span>
                            </div>
                          </div>
                        </div>
                        {renderAdminActions(law)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "vetoed" && (
          <div className="vetoed-laws-container">
            <h2 className="section-title">🏛️ 재의결 진행 중인 법안</h2>
            {vetoedLaws.length === 0 ? (
              <div className="empty-state">재의결 중인 법안이 없습니다.</div>
            ) : (
              <div className="law-list">
                {vetoedLaws.map((law) => (
                  <div key={law.id} className="law-card vetoed">
                    <div className="law-content-wrapper">
                      <div className="law-header">
                        <h2 className="law-title">{law.title}</h2>
                        {getLawStatusDisplay(law)}
                      </div>
                      <div className="law-content">
                        <p>
                          <strong>제안자:</strong>{" "}
                          {law.proposerName || "정보 없음"}
                        </p>
                        <p>
                          <strong>취지:</strong> {law.purpose}
                        </p>
                        <p>
                          <strong>설명:</strong> {law.description}
                        </p>
                        <p>
                          <strong>벌금:</strong> {law.fine}
                        </p>
                        <p>
                          <strong>거부 사유:</strong>{" "}
                          {law.vetoReason || "사유 없음"}
                        </p>
                        <p>
                          <strong>거부 일시:</strong> {formatDate(law.vetoDate)}
                        </p>
                        <p>
                          <strong>재의결 기한:</strong>{" "}
                          {getRemainingTime(law.vetoDeadline)}
                        </p>
                      </div>
                      <div className="law-footer">
                        <div className="vote-stats">
                          <div className="vote-count">
                            <div className="vote-type approval">
                              찬성:{" "}
                              <span className="vote-number">
                                {optimisticVotes[law.id]?.approvals ?? law.approvals ?? 0}
                              </span>
                              <span className="vote-required">
                                /{governmentSettings.vetoOverrideRequired} 필요
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="action-buttons">
                          <div className="vote-actions">
                            <button
                              onClick={() => handleVote(law.id, "approvals")}
                              className={`vote-button approve ${
                                !isAdmin() && (optimisticUserVotes[law.id] === "approvals" ||
                                userVotes[law.id] === "approvals" ||
                                (law.voters &&
                                  law.voters[currentUser?.id] === "approvals"))
                                  ? "voted"
                                  : ""
                              }`}
                              disabled={
                                !isAdmin() && (optimisticUserVotes[law.id] === "approvals" ||
                                userVotes[law.id] === "approvals" ||
                                (law.voters &&
                                  law.voters[currentUser?.id] === "approvals"))
                              }
                            >
                              재의결 찬성
                            </button>
                          </div>
                          {renderAdminActions(law)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "admin" && isAdmin() && (
          <div className="admin-container">
            <h2 className="section-title">🔒 관리자 설정</h2>
            <div className="admin-content">
              <div className="admin-setting-card">
                <div className="setting-header">
                  <h3>총 학생 수 설정</h3>
                </div>
                <div className="setting-content">
                  <div className="form-group">
                    <div className="student-count-control">
                      <button
                        className="count-button decrease"
                        onClick={() =>
                          setLocalAdminSettings((prev) => ({
                            ...(prev || adminSettings),
                            totalStudents: Math.max(
                              1,
                              ((prev || adminSettings).totalStudents || 25) - 1
                            ),
                          }))
                        }
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        className="setting-input student-count"
                        value={(localAdminSettings || adminSettings).totalStudents || 25}
                        onChange={(e) =>
                          setLocalAdminSettings((prev) => ({
                            ...(prev || adminSettings),
                            totalStudents: Math.max(
                              1,
                              parseInt(e.target.value) || 1
                            ),
                          }))
                        }
                      />
                      <button
                        className="count-button increase"
                        onClick={() =>
                          setLocalAdminSettings((prev) => ({
                            ...(prev || adminSettings),
                            totalStudents: ((prev || adminSettings).totalStudents || 25) + 1,
                          }))
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="setting-info">
                    <p>
                      가결/부결 필요 투표 수:{" "}
                      <strong>
                        {Math.ceil(((localAdminSettings || adminSettings).totalStudents || 25) / 2)}
                      </strong>
                      명
                    </p>
                  </div>
                  <button
                    onClick={handleSaveAdminSettings}
                    className="admin-button save-settings-button"
                  >
                    학생 수 저장
                  </button>
                </div>
              </div>

              <div className="admin-setting-card">
                <div className="setting-header">
                  <h3>재의결 설정</h3>
                </div>
                <div className="setting-content">
                  <div className="form-group">
                    <label className="form-label">
                      재의결 필요 찬성수 (현재:{" "}
                      {(localGovSettings || governmentSettings).vetoOverrideRequired ||
                        Math.ceil(
                          (adminSettings.totalStudents || 25) * (2 / 3)
                        )}
                      )
                    </label>
                    <div className="student-count-control">
                      <button
                        className="count-button decrease"
                        onClick={() =>
                          setLocalGovSettings((prev) => ({
                            ...(prev || governmentSettings),
                            vetoOverrideRequired: Math.max(
                              1,
                              ((prev || governmentSettings).vetoOverrideRequired || 1) - 1
                            ),
                          }))
                        }
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max={adminSettings.totalStudents || 25}
                        className="setting-input student-count"
                        value={(localGovSettings || governmentSettings).vetoOverrideRequired || ""}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          const maxVal = adminSettings.totalStudents || 25;
                          setLocalGovSettings((prev) => ({
                            ...(prev || governmentSettings),
                            vetoOverrideRequired: Math.max(
                              1,
                              Math.min(val || 1, maxVal)
                            ),
                          }));
                        }}
                      />
                      <button
                        className="count-button increase"
                        onClick={() =>
                          setLocalGovSettings((prev) => ({
                            ...(prev || governmentSettings),
                            vetoOverrideRequired: Math.min(
                              adminSettings.totalStudents || 25,
                              ((prev || governmentSettings).vetoOverrideRequired || 0) + 1
                            ),
                          }))
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="setting-info">
                    <p className="setting-description">
                      거부권 행사 후 법안이 최종 가결되기 위해 필요한 찬성표
                      수입니다.
                    </p>
                  </div>
                  <button
                    onClick={handleSaveGovernmentSettings}
                    className="admin-button save-settings-button"
                  >
                    재의결 설정 저장
                  </button>
                </div>
              </div>

              <div className="admin-setting-card">
                <div className="setting-header">
                  <h3>법안 관리</h3>
                </div>
                <div className="setting-content">
                  <p>
                    법안 개수: <strong>{laws?.length || 0}</strong>개
                  </p>
                  <p>
                    가결된 법안: <strong>{approvedLaws.length}</strong>개
                  </p>
                  <p>
                    심의/부결 법안: <strong>{pendingLaws.length}</strong>개
                  </p>
                  <p>
                    재의결 중인 법안: <strong>{vetoedLaws.length}</strong>개
                  </p>
                  <button
                    className="admin-button danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          "모든 법안을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
                        )
                      ) {
                        const batch = writeBatch(db);
                        laws.forEach((law) => {
                          const lawDocRef = doc(
                            db,
                            "classes",
                            classCode,
                            "nationalAssemblyLaws",
                            law.id
                          );
                          batch.delete(lawDocRef);
                        });
                        // 사용자 투표 이력 문서들도 삭제 (선택적, 주의 필요)
                        // 예를 들어 모든 userVotes 문서를 가져와서 삭제하는 로직 추가 가능
                        batch
                          .commit()
                          .then(() => {
                            alert("모든 법안이 삭제되었습니다.");
                          })
                          .catch((err) => {
                            logger.error("Error deleting all laws:", err);
                            alert("모든 법안 삭제 중 오류가 발생했습니다.");
                          });
                      }
                    }}
                  >
                    모든 법안 삭제
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === "admin" && !isAdmin() && (
          <div className="empty-state">
            관리자만 접근할 수 있는 페이지입니다.
          </div>
        )}
      </div>

      {showProposeLawModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            logger.log("[NationalAssembly] 모달 오버레이 클릭됨 (닫기)");
            setShowProposeLawModal(false);
          }}
        >
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">✍️ 새 법안 제안</h2>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label className="form-label">법안 제목</label>
                <input
                  type="text"
                  className="form-input"
                  value={newLaw.title}
                  onChange={(e) =>
                    setNewLaw({ ...newLaw, title: e.target.value })
                  }
                  placeholder="법안의 제목을 입력하세요"
                />
              </div>
              <div className="form-group">
                <label className="form-label">법안 취지</label>
                <input
                  type="text"
                  className="form-input"
                  value={newLaw.purpose}
                  onChange={(e) =>
                    setNewLaw({ ...newLaw, purpose: e.target.value })
                  }
                  placeholder="법안의 취지를 간략히 설명하세요"
                />
              </div>
              <div className="form-group">
                <label className="form-label">법안 설명</label>
                <textarea
                  className="form-textarea"
                  rows="3"
                  value={newLaw.description}
                  onChange={(e) =>
                    setNewLaw({ ...newLaw, description: e.target.value })
                  }
                  placeholder="법안에 대한 자세한 설명을 작성하세요"
                ></textarea>
              </div>
              <div className="form-group">
                <label className="form-label">벌금</label>
                <input
                  type="text"
                  className="form-input"
                  value={newLaw.fine}
                  onChange={(e) =>
                    setNewLaw({ ...newLaw, fine: e.target.value })
                  }
                  placeholder="위반 시 벌금 (예: 5,000원)"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => {
                  logger.log("[NationalAssembly] 취소 버튼 클릭됨");
                  setShowProposeLawModal(false);
                }}
                className="modal-button cancel"
              >
                취소
              </button>
              <button
                onClick={() => {
                  logger.log("[NationalAssembly] 제안하기 버튼 클릭됨");
                  logger.log("[NationalAssembly] 버튼 disabled 상태:", !newLaw.title || !newLaw.description || !newLaw.fine);
                  handleProposeLaw();
                }}
                className="modal-button submit"
                disabled={!newLaw.title || !newLaw.description || !newLaw.fine}
              >
                제안하기
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditLawModal && editingLaw && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowEditLawModal(false);
            setEditingLaw(null);
          }}
        >
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">✏️ 법안 수정</h2>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label className="form-label">법안 제목</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingLaw.title}
                  onChange={(e) =>
                    setEditingLaw({ ...editingLaw, title: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">법안 취지</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingLaw.purpose}
                  onChange={(e) =>
                    setEditingLaw({ ...editingLaw, purpose: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">법안 설명</label>
                <textarea
                  className="form-textarea"
                  rows="3"
                  value={editingLaw.description}
                  onChange={(e) =>
                    setEditingLaw({
                      ...editingLaw,
                      description: e.target.value,
                    })
                  }
                ></textarea>
              </div>
              <div className="form-group">
                <label className="form-label">벌금</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingLaw.fine}
                  onChange={(e) =>
                    setEditingLaw({ ...editingLaw, fine: e.target.value })
                  }
                />
              </div>
              {isAdmin() && (
                <div className="form-group">
                  <label className="form-label">상태</label>
                  <select
                    className="form-input"
                    value={editingLaw.status}
                    onChange={(e) =>
                      setEditingLaw({ ...editingLaw, status: e.target.value })
                    }
                  >
                    <option value="pending">심의중</option>
                    <option value="pending_government_approval">정부 이송</option>
                    <option value="approved">가결됨</option>
                    <option value="rejected">부결됨</option>
                    <option value="vetoed">거부권 행사됨</option>
                    <option value="veto_overridden">재의결 가결됨</option>
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                onClick={() => {
                  setShowEditLawModal(false);
                  setEditingLaw(null);
                }}
                className="modal-button cancel"
              >
                취소
              </button>
              <button
                onClick={handleSaveEditLaw}
                className="modal-button submit"
                disabled={
                  !editingLaw.title ||
                  !editingLaw.description ||
                  !editingLaw.fine
                }
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NationalAssembly;