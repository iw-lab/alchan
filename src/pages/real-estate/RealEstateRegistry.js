/* src/pages/real-estate/RealEstateRegistry.js (모든 함수가 포함된 최종본 - 관리자 기능 강화) */
import React, { useState, useEffect } from "react";
import "./RealEstateRegistry.css";
import { useAuth } from "../../contexts/AuthContext";

// firebase.js에서 익스포트하는 함수들
import {
  db,
  functions,
  serverTimestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  runTransaction,
  increment,
  addActivityLog,
} from "../../firebase";
import { httpsCallable } from "firebase/functions";
import { globalCache } from "../../services/globalCacheService";

import { logger } from "../../utils/logger";
// orderBy는 firebase/firestore에서 직접 가져옵니다.
import {
  orderBy as firebaseOrderBy,
} from "firebase/firestore";

const DEFAULT_SETTINGS = {
  totalProperties: 30,
  basePrice: 50000000,
  rentPercentage: 1,
  layoutColumns: 6,
  lastRentCollection: null,
};

const RealEstateRegistry = () => {
  const {
    userDoc: currentUser,
    loading: authLoading,
    isAdmin,
    refreshUserDocument,
    optimisticUpdate,
    allClassMembers, // 🔥 [추가] 학급 구성원 데이터
  } = useAuth();

  const classCode = currentUser?.classCode;

  const [properties, setProperties] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [allUsersData, setAllUsersData] = useState([]);

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [operationLoading, setOperationLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [showQuickAction, setShowQuickAction] = useState(null);
  const [adminInputs, setAdminInputs] = useState({ ...DEFAULT_SETTINGS });
  const [excludedFromAssign, setExcludedFromAssign] = useState(new Set());

  // 🔥 [제거] body 스크롤 조작 완전 제거 - CSS로만 처리
  // 모달 오버레이에 overflow-y: auto 설정으로 모달 내부 스크롤 허용
  // body는 전혀 건드리지 않아서 레이아웃 깨짐 방지

  // Settings 로드 Effect (폴링 방식으로 변경 - 무한 루프 방지)
  useEffect(() => {
    if (!classCode) {
      setSettings(DEFAULT_SETTINGS);
      setAdminInputs({ ...DEFAULT_SETTINGS });
      setSettingsLoading(false);
      return;
    }

    let mounted = true;
    setSettingsLoading(true);

    const settingsRefInstance = doc(
      db,
      "classes",
      classCode,
      "realEstateSettings",
      "settingsDoc"
    );

    const fetchSettings = async () => {
      if (!mounted) return;

      try {
        const docSnap = await getDoc(settingsRefInstance);
        if (!mounted) return;

        if (docSnap.exists()) {
          const fetchedSettings = docSnap.data();
          if (fetchedSettings.lastRentCollection?.toDate) {
            fetchedSettings.lastRentCollection =
              fetchedSettings.lastRentCollection.toDate();
          }
          setSettings(fetchedSettings);
          setAdminInputs({
            totalProperties: fetchedSettings.totalProperties.toString(),
            basePrice: fetchedSettings.basePrice.toString(),
            rentPercentage: fetchedSettings.rentPercentage.toString(),
            layoutColumns: fetchedSettings.layoutColumns.toString(),
          });
        } else {
          // 설정이 없으면 기본값 사용 (관리자만 생성 가능)
          if (mounted) {
            setSettings(DEFAULT_SETTINGS);
            setAdminInputs({ ...DEFAULT_SETTINGS });
          }

          // 관리자인 경우에만 기본 설정 생성 시도
          if (isAdmin && isAdmin()) {
            try {
              await setDoc(settingsRefInstance, {
                ...DEFAULT_SETTINGS,
                createdAt: serverTimestamp(),
                classCode: classCode,
                updatedAt: serverTimestamp(),
              });
            } catch (error) {
              logger.warn("[RealEstate] 기본 설정 생성 실패 (관리자만 가능):", error.message);
            }
          }
        }
        if (mounted) {
          setSettingsLoading(false);
        }
      } catch (error) {
        // 학생 계정은 settings 읽기 권한이 없을 수 있으므로 warn으로 처리
        logger.warn("[RealEstate] Settings 읽기 실패 (기본값 사용):", error.message);
        if (mounted) {
          setSettings(DEFAULT_SETTINGS);
          setAdminInputs({ ...DEFAULT_SETTINGS });
          setSettingsLoading(false);
        }
      }
    };

    fetchSettings(); // 초기 로드
    const interval = setInterval(fetchSettings, 15 * 60 * 1000); // 🔥 [최적화] 15분마다 폴링 (Firestore 읽기 최소화)

    return () => {
      mounted = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classCode]);

  // 🔥 Properties 새로고침 함수 (낙관적 업데이트 후 서버 데이터와 동기화)
  const refreshProperties = React.useCallback(async () => {
    if (!classCode) return;

    try {
      const propertiesCollectionRefInstance = collection(
        db,
        "classes",
        classCode,
        "realEstateProperties"
      );
      const q = query(propertiesCollectionRefInstance, firebaseOrderBy("id"));
      const querySnapshot = await getDocs(q);

      const propsData = querySnapshot.docs.map((doc) => ({
        firestoreDocId: doc.id,
        ...doc.data(),
        lastRentPayment: doc.data().lastRentPayment?.toDate
          ? doc.data().lastRentPayment.toDate()
          : null,
      }));
      propsData.sort((a, b) => parseInt(a.id) - parseInt(b.id));

      setProperties(propsData);
      logger.log('[RealEstate] Properties refreshed:', propsData.length);
    } catch (error) {
      logger.error("[RealEstate] Error refreshing properties:", error);
    }
  }, [classCode]);

  // Properties 로드 Effect (폴링 방식으로 변경 - 무한 루프 방지)
  useEffect(() => {
    if (!classCode) {
      setProperties([]);
      setPropertiesLoading(false);
      return;
    }

    let mounted = true;
    setPropertiesLoading(true);

    const propertiesCollectionRefInstance = collection(
      db,
      "classes",
      classCode,
      "realEstateProperties"
    );
    const q = query(propertiesCollectionRefInstance, firebaseOrderBy("id"));

    const fetchProperties = async () => {
      if (!mounted) return;

      try {
        const querySnapshot = await getDocs(q);
        if (!mounted) return;

        const propsData = querySnapshot.docs.map((doc) => ({
          firestoreDocId: doc.id,
          ...doc.data(),
          lastRentPayment: doc.data().lastRentPayment?.toDate
            ? doc.data().lastRentPayment.toDate()
            : null,
        }));
        propsData.sort((a, b) => parseInt(a.id) - parseInt(b.id));

        if (mounted) {
          setProperties(propsData);
          setPropertiesLoading(false);
        }
      } catch (error) {
        logger.error("[RealEstate] Error fetching properties:", error);
        if (mounted) {
          setProperties([]);
          setPropertiesLoading(false);
        }
      }
    };

    fetchProperties(); // 초기 로드
    const interval = setInterval(fetchProperties, 15 * 60 * 1000); // 🔥 [최적화] 15분마다 폴링 (Firestore 읽기 최소화)

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [classCode]);

  // 🔥 [최적화] 학급 사용자 목록 - AuthContext에서 제공하는 allClassMembers 사용 (중복 조회 제거)
  useEffect(() => {
    if (!classCode) {
      setAllUsersData([]);
      setUsersLoading(false);
      return;
    }

    // AuthContext에서 이미 학급 구성원 데이터를 제공하므로 재사용
    if (allClassMembers && allClassMembers.length > 0) {
      setAllUsersData(allClassMembers);
      setUsersLoading(false);
    } else {
      // AuthContext에서 데이터가 없을 경우에만 직접 조회
      setUsersLoading(true);
      const usersQuery = query(
        collection(db, "users"),
        where("classCode", "==", classCode)
      );
      getDocs(usersQuery)
        .then((snapshot) => {
          setAllUsersData(
            snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          );
        })
        .catch((error) => {
          logger.error("[RealEstate] Error fetching users by classCode:", error);
          setAllUsersData([]);
        })
        .finally(() => setUsersLoading(false));
    }
  }, [classCode, allClassMembers]);

  const handleInitializeProperties = async (skipConfirm = false) => {
    if (!classCode || !currentUser || !isAdmin()) {
      alert("초기화 권한이 없거나 학급 정보가 없습니다.");
      return;
    }
    if (
      !skipConfirm && !window.confirm(
        `정말로 학급 [${classCode}]의 모든 부동산을 정부 소유 초기값으로 되돌리시겠습니까? 이 작업은 되돌릴 수 없습니다.`
      )
    )
      return;
    setOperationLoading(true);
    try {
      const currentSettings = settings;
      const basePrice = currentSettings.basePrice;
      const rent = Math.round(
        basePrice * (currentSettings.rentPercentage / 100)
      );
      const batch = writeBatch(db);
      const propCollRef = collection(
        db,
        "classes",
        classCode,
        "realEstateProperties"
      );
      const existingPropsSnapshot = await getDocs(propCollRef);
      existingPropsSnapshot.forEach((doc) => batch.delete(doc.ref));
      for (let i = 1; i <= currentSettings.totalProperties; i++) {
        const propertyIdStr = i.toString();
        const propertyDocRef = doc(propCollRef, propertyIdStr);
        batch.set(propertyDocRef, {
          id: propertyIdStr,
          price: basePrice,
          owner: "government",
          ownerName: "정부",
          rent: rent,
          tenant: null,
          tenantId: null,
          tenantName: null,
          forSale: false,
          salePrice: 0,
          lastRentPayment: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          classCode: classCode,
        });
      }
      await batch.commit();

      // 🔥 로컬 상태 즉시 반영 — 새로고침 없이 화면 갱신
      const initialProperties = [];
      for (let i = 1; i <= currentSettings.totalProperties; i++) {
        const idStr = i.toString();
        initialProperties.push({
          firestoreDocId: idStr,
          id: idStr,
          price: basePrice,
          owner: "government",
          ownerName: "정부",
          rent: rent,
          tenant: null,
          tenantId: null,
          tenantName: null,
          forSale: false,
          salePrice: 0,
          lastRentPayment: null,
          classCode: classCode,
        });
      }
      setProperties(initialProperties);

      alert("부동산이 성공적으로 초기화되었습니다.");
      setShowAdminPanel(false);
    } catch (error) {
      logger.error("[RealEstate] Error initializing properties:", error);
      alert("부동산 초기화 중 오류 발생: " + error.message);
    } finally {
      setOperationLoading(false);
    }
  };

  const handlePurchaseProperty = async (propertyId) => {
    if (!currentUser || !classCode) {
      alert("로그인이 필요하거나 학급 정보가 없습니다.");
      return;
    }

    const property = properties.find(p => p.id === propertyId);
    if (!property) {
      alert("부동산 정보를 찾을 수 없습니다.");
      return;
    }

    const purchasePrice = property.salePrice || property.price;

    logger.log('[RealEstate] 부동산 구매 시작:', { propertyId, purchasePrice });

    // 🔥 낙관적 업데이트 1: 현금 차감
    if (optimisticUpdate) {
      optimisticUpdate({ cash: -purchasePrice });
    }

    // 🔥 낙관적 업데이트 2: 구매한 부동산에 즉시 입주 + 소유자 변경 (UI 업데이트)
    const previousPropertyState = { ...property };
    const previousProperties = [...properties];

    setProperties(prevProperties =>
      prevProperties.map(p =>
        p.id === propertyId
          ? {
              ...p,
              owner: currentUser.id,
              ownerName: currentUser.name,
              forSale: false,
              salePrice: null,
              tenant: currentUser.name,
              tenantId: currentUser.id,
              tenantName: currentUser.name,
            }
          : {
              ...p,
              // 다른 부동산에 입주 중이었다면 퇴거 처리
              tenant: p.tenantId === currentUser.id ? null : p.tenant,
              tenantId: p.tenantId === currentUser.id ? null : p.tenantId,
              tenantName: p.tenantId === currentUser.id ? null : p.tenantName,
            }
      )
    );

    setOperationLoading(true);

    try {
      const purchaseRealEstateFunction = httpsCallable(functions, 'purchaseRealEstate');
      const result = await purchaseRealEstateFunction({ propertyId });

      logger.log('[RealEstate] 구매 성공:', result.data);

      // 🔥 서버 데이터와 동기화 (낙관적 업데이트 확정)
      await refreshProperties();

      if (refreshUserDocument) refreshUserDocument();
      setShowQuickAction(null);
      setSelectedProperty(null);
      alert(`부동산 #${propertyId}를 성공적으로 구매했습니다.`);
    } catch (error) {
      logger.error('[RealEstate] 구매 실패:', error);

      // 실패 시 롤백 1: 현금 복구
      if (optimisticUpdate) {
        optimisticUpdate({ cash: purchasePrice });
      }

      // 실패 시 롤백 2: 부동산 상태 전체 복구 (이전 상태로 되돌림)
      setProperties(previousProperties);

      alert(error.message || '부동산 구매 중 오류가 발생했습니다.');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleSetForSale = async (propertyId) => {
    const property = properties.find((p) => p.id === propertyId);
    if (
      !property ||
      !currentUser ||
      property.owner !== currentUser.id ||
      !classCode
    ) {
      alert("소유한 부동산만 판매할 수 있거나 정보가 부족합니다.");
      return;
    }
    const salePriceInput = prompt("판매 가격을 입력하세요 (숫자만):");
    if (!salePriceInput) return;
    const salePrice = parseInt(salePriceInput);
    if (isNaN(salePrice) || salePrice <= 0) {
      alert("유효한 판매 가격을 입력하세요.");
      return;
    }

    // 🔥 낙관적 업데이트: 판매 상태 즉시 변경
    const previousPropertyState = { ...property };
    setProperties(prevProperties =>
      prevProperties.map(p =>
        p.id === propertyId
          ? { ...p, forSale: true, salePrice: salePrice }
          : p
      )
    );

    setOperationLoading(true);
    const propertyRef = doc(
      db,
      "classes",
      classCode,
      "realEstateProperties",
      propertyId
    );
    try {
      await updateDoc(propertyRef, {
        forSale: true,
        salePrice: salePrice,
        updatedAt: serverTimestamp(),
      });

      // 🔥 서버 데이터와 동기화
      await refreshProperties();

      setShowQuickAction(null);
      setSelectedProperty(null);
      alert("판매 설정이 완료되었습니다.");
    } catch (error) {
      logger.error("판매 설정 오류:", error);

      // 실패 시 롤백
      setProperties(prevProperties =>
        prevProperties.map(p =>
          p.id === propertyId ? previousPropertyState : p
        )
      );

      alert("판매 설정 중 오류 발생: " + error.message);
    } finally {
      setOperationLoading(false);
    }
  };

    // 관리자가 정부 소유 부동산 판매 설정
    const handleAdminSetForSale = async (propertyId) => {
        if (!isAdmin()) {
            alert("권한이 없습니다.");
            return;
        }
        const salePriceInput = prompt("판매 가격을 입력하세요 (숫자만):");
        if (!salePriceInput) return;
        const salePrice = parseInt(salePriceInput);
        if (isNaN(salePrice) || salePrice <= 0) {
            alert("유효한 판매 가격을 입력하세요.");
            return;
        }

        // 🔥 낙관적 업데이트: 판매 상태 즉시 변경
        const property = properties.find(p => p.id === propertyId);
        const previousPropertyState = property ? { ...property } : null;
        setProperties(prevProperties =>
          prevProperties.map(p =>
            p.id === propertyId
              ? { ...p, forSale: true, salePrice: salePrice }
              : p
          )
        );

        setOperationLoading(true);
        const propertyRef = doc(db, "classes", classCode, "realEstateProperties", propertyId);
        try {
            await updateDoc(propertyRef, {
                forSale: true,
                salePrice: salePrice,
                updatedAt: serverTimestamp(),
            });

            // 🔥 서버 데이터와 동기화
            await refreshProperties();

            setShowQuickAction(null);
            setSelectedProperty(null);
            alert("정부 소유 부동산 판매 설정이 완료되었습니다.");
        } catch (error) {
            logger.error("정부 소유 부동산 판매 설정 오류:", error);

            // 실패 시 롤백
            if (previousPropertyState) {
              setProperties(prevProperties =>
                prevProperties.map(p =>
                  p.id === propertyId ? previousPropertyState : p
                )
              );
            }

            alert("처리 중 오류 발생: " + error.message);
        } finally {
            setOperationLoading(false);
        }
    };

    // 관리자가 정부 소유 부동산 판매 취소
    const handleAdminCancelSale = async (propertyId) => {
        if (!isAdmin()) {
            alert("권한이 없습니다.");
            return;
        }

        // 🔥 낙관적 업데이트: 판매 취소 즉시 반영
        const property = properties.find(p => p.id === propertyId);
        const previousPropertyState = property ? { ...property } : null;
        setProperties(prevProperties =>
          prevProperties.map(p =>
            p.id === propertyId
              ? { ...p, forSale: false, salePrice: null }
              : p
          )
        );

        setOperationLoading(true);
        const propertyRef = doc(db, "classes", classCode, "realEstateProperties", propertyId);
        try {
            await updateDoc(propertyRef, {
                forSale: false,
                salePrice: 0,
                updatedAt: serverTimestamp(),
            });

            // 🔥 서버 데이터와 동기화
            await refreshProperties();

            setShowQuickAction(null);
            setSelectedProperty(null);
            alert("정부 소유 부동산 판매가 취소되었습니다.");
        } catch (error) {
            logger.error("정부 소유 부동산 판매 취소 오류:", error);

            // 실패 시 롤백
            if (previousPropertyState) {
              setProperties(prevProperties =>
                prevProperties.map(p =>
                  p.id === propertyId ? previousPropertyState : p
                )
              );
            }

            alert("처리 중 오류 발생: " + error.message);
        } finally {
            setOperationLoading(false);
        }
    };


  const handleCancelSale = async (propertyId) => {
    if (!classCode) return;

    // 🔥 낙관적 업데이트: 판매 취소 즉시 반영
    const property = properties.find(p => p.id === propertyId);
    const previousPropertyState = property ? { ...property } : null;
    setProperties(prevProperties =>
      prevProperties.map(p =>
        p.id === propertyId
          ? { ...p, forSale: false, salePrice: null }
          : p
      )
    );

    setOperationLoading(true);
    const propertyRef = doc(
      db,
      "classes",
      classCode,
      "realEstateProperties",
      propertyId
    );
    try {
      await updateDoc(propertyRef, {
        forSale: false,
        salePrice: 0,
        updatedAt: serverTimestamp(),
      });

      // 🔥 서버 데이터와 동기화
      await refreshProperties();

      setShowQuickAction(null);
      setSelectedProperty(null);
      alert("판매가 취소되었습니다.");
    } catch (error) {
      logger.error("판매 취소 오류:", error);

      // 실패 시 롤백
      if (previousPropertyState) {
        setProperties(prevProperties =>
          prevProperties.map(p =>
            p.id === propertyId ? previousPropertyState : p
          )
        );
      }

      alert("판매 취소 중 오류 발생: " + error.message);
    } finally {
      setOperationLoading(false);
    }
  };

  const handleTenancy = async (propertyId) => {
    if (!currentUser || !classCode) return;

    const property = properties.find(p => p.id === propertyId);
    if (!property) {
      alert("부동산 정보를 찾을 수 없습니다.");
      return;
    }

    const isAlreadyTenantElsewhere = properties.some(
      (p) => p.tenantId === currentUser.id && p.id !== propertyId
    );

    const isTenantOfThisProperty = property.tenantId === currentUser.id;

    // 🔥 [추가] 낙관적 업데이트: 퇴거인지 입주인지 판단
    const isVacating = isTenantOfThisProperty;

    // 이전 상태 저장 (롤백용)
    const previousProperties = [...properties];

    if (isVacating) {
      // 🔥 낙관적 업데이트: 퇴거 처리
      setProperties(prevProperties =>
        prevProperties.map(p =>
          p.id === propertyId
            ? {
                ...p,
                tenant: null,
                tenantId: null,
                tenantName: null,
              }
            : p
        )
      );
    } else {
      // 🔥 낙관적 업데이트: 입주 처리 + 현금 차감 + 기존 입주지 퇴거
      if (optimisticUpdate) {
        optimisticUpdate({ cash: -property.rent });
      }

      setProperties(prevProperties =>
        prevProperties.map(p =>
          p.id === propertyId
            ? {
                ...p,
                tenant: currentUser.name,
                tenantId: currentUser.id,
                tenantName: currentUser.name,
              }
            : {
                ...p,
                // 다른 부동산에 입주 중이었다면 퇴거 처리
                tenant: p.tenantId === currentUser.id ? null : p.tenant,
                tenantId: p.tenantId === currentUser.id ? null : p.tenantId,
                tenantName: p.tenantId === currentUser.id ? null : p.tenantName,
              }
        )
      );
    }

    setOperationLoading(true);
    const propertyRef = doc(
      db,
      "classes",
      classCode,
      "realEstateProperties",
      propertyId
    );
    const userRef = doc(db, "users", currentUser.id);

    try {
      let transactionResult = null;

      await runTransaction(db, async (transaction) => {
        const propertyDoc = await transaction.get(propertyRef);
        if (!propertyDoc.exists())
          throw new Error("부동산 정보를 찾을 수 없습니다.");
        const propertyData = propertyDoc.data();

        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists())
          throw new Error("사용자 정보를 찾을 수 없습니다.");
        const userData = userDoc.data();

        if (propertyData.tenantId === currentUser.id) {
          // 퇴거 처리
          transaction.update(propertyRef, {
            tenant: null,
            tenantId: null,
            tenantName: null,
            lastRentPayment: null,
            updatedAt: serverTimestamp(),
          });
          transactionResult = { type: 'vacate' };
          return;
        }

        if (propertyData.tenantId)
          throw new Error("이미 다른 사람이 입주해 있습니다.");
        if (isAlreadyTenantElsewhere)
          throw new Error(
            "이미 다른 부동산에 입주해 있습니다. 먼저 퇴거해야 합니다."
          );
        if (userData.cash < propertyData.rent)
          throw new Error("첫 월세를 낼 현금이 부족합니다.");

        transaction.update(userRef, {
          cash: increment(-propertyData.rent),
          updatedAt: serverTimestamp(),
        });

        if (propertyData.owner !== "government") {
          const ownerRef = doc(db, "users", propertyData.owner);
          // 자기 땅에 입주하는 경우, 자기 자신에게 월세를 내게 되므로 cash는 변동 없음
          if (propertyData.owner !== currentUser.id) {
            transaction.update(ownerRef, {
              cash: increment(propertyData.rent),
              updatedAt: serverTimestamp(),
            });
          }
        }

        transaction.update(propertyRef, {
          tenant: currentUser.name,
          tenantId: currentUser.id,
          tenantName: currentUser.name,
          lastRentPayment: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        transactionResult = { type: 'moveIn', rent: propertyData.rent };
      });

      // 🔥 트랜잭션 완료 후 처리
      if (transactionResult?.type === 'vacate') {
        alert("성공적으로 퇴거했습니다.");
      } else if (transactionResult?.type === 'moveIn') {
        alert("성공적으로 입주했습니다. 첫 월세가 지불되었습니다.");

        // 🔥 [중요] 유저 캐시 무효화 후 서버에서 최신 데이터 가져오기
        if (currentUser?.id) {
          globalCache.invalidate(`user_${currentUser.id}`);
          logger.log('[RealEstate] 입주 완료 - 유저 캐시 무효화:', currentUser.id);
        }
      }

      // 🔥 서버 데이터와 동기화
      await refreshProperties();
      if (refreshUserDocument) refreshUserDocument();
      setShowQuickAction(null);
      setSelectedProperty(null);
    } catch (error) {
      logger.error("입주/퇴거 처리 오류:", error);

      // 🔥 롤백: 이전 상태로 복구
      setProperties(previousProperties);
      if (!isVacating && optimisticUpdate) {
        optimisticUpdate({ cash: property.rent });
      }

      alert(`처리 중 오류 발생: ${error.message}`);
    } finally {
      setOperationLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!classCode || !isAdmin()) {
      alert("설정 저장 권한이 없거나 학급 정보가 없습니다.");
      return;
    }
    const newTotal = parseInt(adminInputs.totalProperties);
    const newBasePrice = parseInt(adminInputs.basePrice);
    const newRentPercentage = parseFloat(adminInputs.rentPercentage);
    const newLayoutColumns = parseInt(adminInputs.layoutColumns);
    if (
      isNaN(newTotal) ||
      isNaN(newBasePrice) ||
      isNaN(newRentPercentage) ||
      isNaN(newLayoutColumns) ||
      newTotal <= 0 ||
      newBasePrice <= 0 ||
      newRentPercentage < 0 ||
      newLayoutColumns <= 0
    ) {
      alert(
        "유효하지 않은 값이 있습니다. 가격, 부동산 개수, 칸 수는 0보다 커야합니다."
      );
      return;
    }
    setOperationLoading(true);
    const newSettingsData = {
      totalProperties: newTotal,
      basePrice: newBasePrice,
      rentPercentage: newRentPercentage,
      layoutColumns: newLayoutColumns,
      updatedAt: serverTimestamp(),
    };
    try {
      const settingsRefInstance = doc(
        db,
        "classes",
        classCode,
        "realEstateSettings",
        "settingsDoc"
      );
      await setDoc(settingsRefInstance, newSettingsData, { merge: true });
      // 로컬 상태도 즉시 업데이트
      setSettings(prev => ({ ...prev, ...newSettingsData, updatedAt: new Date() }));

      // 기존 부동산에 가격/월세 즉시 반영 (소유권/입주 유지)
      const newRent = Math.round(newBasePrice * newRentPercentage / 100);
      if (properties.length > 0) {
        const batch = writeBatch(db);
        properties.forEach(p => {
          const ref = doc(db, "classes", classCode, "realEstateProperties", p.id);
          batch.update(ref, { price: newBasePrice, rent: newRent, updatedAt: serverTimestamp() });
        });
        await batch.commit();
        // 로컬 상태도 반영
        setProperties(prev => prev.map(p => ({ ...p, price: newBasePrice, rent: newRent })));
      }

      // 부동산 개수가 변경된 경우에만 초기화 제안
      if (newTotal !== properties.length) {
        if (window.confirm(`부동산 개수가 ${properties.length}→${newTotal}개로 변경되었습니다.\n부동산을 초기화하시겠습니까? (소유권/입주 초기화)`)) {
          await handleInitializeProperties(true);
        }
      }

      alert("설정이 저장되고 기존 부동산에 반영되었습니다.");
      setShowAdminPanel(false);
    } catch (error) {
      logger.error("설정 저장 오류:", error);
      alert("설정 저장 중 오류 발생: " + error.message);
    } finally {
      setOperationLoading(false);
    }
  };

  // 🔥 [추가] 관리자가 학생을 강제로 빈 부동산에 입주시키는 함수
  const handleAdminAssignSeat = async (userId, userName) => {
    if (!classCode || !currentUser || !isAdmin()) {
      alert("권한이 없거나 학급 정보가 없습니다.");
      return;
    }

    // 빈 부동산 찾기 (세입자가 없는 부동산)
    const emptyProperties = properties.filter(p => !p.tenantId);

    if (emptyProperties.length === 0) {
      alert("배정할 수 있는 빈 부동산이 없습니다.");
      return;
    }

    // 첫 번째 빈 부동산 선택
    const targetProperty = emptyProperties[0];

    if (!window.confirm(
      `'${userName}' 학생을 부동산 #${targetProperty.id}에 강제로 입주시키시겠습니까?\n\n월세: ${(targetProperty.rent / 10000).toFixed(0)}만원\n소유자: ${targetProperty.owner === 'government' ? '정부' : targetProperty.ownerName}`
    )) {
      return;
    }

    setOperationLoading(true);

    // 🔥 낙관적 업데이트: 즉시 UI 업데이트
    const previousProperties = [...properties];
    setProperties(prevProperties =>
      prevProperties.map(p =>
        p.id === targetProperty.id
          ? {
              ...p,
              tenant: userName,
              tenantId: userId,
              tenantName: userName,
            }
          : {
              ...p,
              // 기존에 다른 곳에 입주해 있었다면 퇴거 처리
              tenant: p.tenantId === userId ? null : p.tenant,
              tenantId: p.tenantId === userId ? null : p.tenantId,
              tenantName: p.tenantId === userId ? null : p.tenantName,
            }
      )
    );

    try {
      const propertyRef = doc(
        db,
        "classes",
        classCode,
        "realEstateProperties",
        targetProperty.id
      );
      const userRef = doc(db, "users", userId);

      await runTransaction(db, async (transaction) => {
        const propertyDoc = await transaction.get(propertyRef);
        if (!propertyDoc.exists()) {
          throw new Error("부동산 정보를 찾을 수 없습니다.");
        }
        const propertyData = propertyDoc.data();

        const userDocSnap = await transaction.get(userRef);
        if (!userDocSnap.exists()) {
          throw new Error("사용자 정보를 찾을 수 없습니다.");
        }
        const userData = userDocSnap.data();

        // 이미 다른 사람이 입주했는지 확인
        if (propertyData.tenantId) {
          throw new Error("이미 다른 사람이 입주해 있습니다.");
        }

        // 🔥 관리자 강제 입주이므로 현금 확인 없이 입주 처리
        // 월세는 징수하지 않음 (첫 월세 무료)
        transaction.update(propertyRef, {
          tenant: userName,
          tenantId: userId,
          tenantName: userName,
          lastRentPayment: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      logger.log(`[RealEstate] 관리자 강제 입주 완료: ${userName} -> 부동산 #${targetProperty.id}`);
      alert(`'${userName}' 학생이 부동산 #${targetProperty.id}에 입주했습니다.`);

      // 🔥 서버 데이터와 동기화
      await refreshProperties();

      // 🔥 [중요] 유저 캐시 무효화
      if (userId) {
        globalCache.invalidate(`user_${userId}`);
        logger.log('[RealEstate] 강제 입주 - 유저 캐시 무효화:', userId);
      }

    } catch (error) {
      logger.error("[RealEstate] 강제 입주 오류:", error);

      // 🔥 롤백: 이전 상태로 복구
      setProperties(previousProperties);

      alert(`강제 입주 중 오류 발생: ${error.message}`);
    } finally {
      setOperationLoading(false);
    }
  };

  // 🔥 [최적화] 모든 미입주 학생을 자동으로 빈 부동산에 배정 - 배치 쓰기로 변경
  const handleAdminAssignAllSeats = async () => {
    if (!classCode || !currentUser || !isAdmin()) {
      alert("권한이 없거나 학급 정보가 없습니다.");
      return;
    }

    const tenantIds = new Set(properties.map((p) => p.tenantId).filter(Boolean));
    const nonTenantsList = allUsersData.filter(
      (user) => !tenantIds.has(user.id) && !user.isAdmin && !excludedFromAssign.has(user.id)
    );

    if (nonTenantsList.length === 0) {
      alert("모든 학생이 이미 입주해 있습니다.");
      return;
    }

    const emptyProperties = properties.filter(p => !p.tenantId);

    if (emptyProperties.length < nonTenantsList.length) {
      alert(`빈 부동산이 부족합니다.\n미입주 학생: ${nonTenantsList.length}명\n빈 부동산: ${emptyProperties.length}개`);
      return;
    }

    if (!window.confirm(
      `${nonTenantsList.length}명의 학생을 자동으로 빈 부동산에 배정하시겠습니까?`
    )) {
      return;
    }

    setOperationLoading(true);

    try {
      // 🔥 [최적화] 배치 쓰기로 모든 배정을 한 번에 처리 (N개 쓰기 → 1개 쓰기)
      const batch = writeBatch(db);
      const assignments = []; // 로컬 상태 업데이트용

      for (let i = 0; i < nonTenantsList.length; i++) {
        const user = nonTenantsList[i];
        const targetProperty = emptyProperties[i];

        const propertyRef = doc(
          db,
          "classes",
          classCode,
          "realEstateProperties",
          targetProperty.id
        );

        batch.update(propertyRef, {
          tenant: user.name,
          tenantId: user.id,
          tenantName: user.name,
          lastRentPayment: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        assignments.push({
          propertyId: targetProperty.id,
          userId: user.id,
          userName: user.name,
        });

        // 유저 캐시 무효화
        globalCache.invalidate(`user_${user.id}`);
      }

      // 🔥 한 번에 커밋 (Firestore 쓰기 비용 대폭 절감)
      await batch.commit();

      // 로컬 상태 일괄 업데이트
      setProperties(prevProperties =>
        prevProperties.map(p => {
          const assignment = assignments.find(a => a.propertyId === p.id);
          if (assignment) {
            return {
              ...p,
              tenant: assignment.userName,
              tenantId: assignment.userId,
              tenantName: assignment.userName,
            };
          }
          return p;
        })
      );

      logger.log(`[RealEstate] 배치 자동 배정 완료: ${assignments.length}명`);
      alert(`자동 배정 완료!\n\n성공: ${assignments.length}명`);

      // 🔥 서버 데이터와 동기화
      await refreshProperties();

    } catch (error) {
      logger.error("[RealEstate] 자동 배정 전체 오류:", error);
      alert(`자동 배정 중 오류 발생: ${error.message}`);
    } finally {
      setOperationLoading(false);
    }
  };

  // ⭐️ [수정된 함수] 월세 징수 로직 개선 (잔액 부족 시 전액 징수)
  // 🔥 [추가] 월세 0원인 부동산 수정 함수
  const handleFixZeroRent = async () => {
    if (!classCode || !currentUser || !isAdmin()) {
      alert("권한이 없거나 학급 정보가 없습니다.");
      return;
    }

    // 🔥 [중요] 현재 설정값 확인
    const currentRentPercentage = settings.rentPercentage || 1;
    logger.log(`[FixRent] 현재 월세 비율: ${currentRentPercentage}%`);

    if (!window.confirm(
      `월세가 0원인 부동산을 모두 수정하시겠습니까?\n\n현재 설정:\n- 월세 비율: ${currentRentPercentage}%\n- 기본 부동산 가격: ${(settings.basePrice / 10000).toFixed(0)}만원\n\n각 부동산의 가격 × ${currentRentPercentage}%로 월세가 설정됩니다.`
    )) {
      return;
    }

    setOperationLoading(true);
    try {
      const propCollRef = collection(db, "classes", classCode, "realEstateProperties");
      const allPropertiesSnapshot = await getDocs(propCollRef);

      const batch = writeBatch(db);
      let fixedCount = 0;

      allPropertiesSnapshot.forEach((propDoc) => {
        const data = propDoc.data();
        // 월세가 0이거나 없는 경우
        if (!data.rent || data.rent === 0) {
          // 🔥 [수정] settings의 rentPercentage 사용
          const propertyPrice = data.price || settings.basePrice;
          const calculatedRent = Math.round(propertyPrice * (currentRentPercentage / 100));

          batch.update(propDoc.ref, {
            rent: calculatedRent,
            updatedAt: serverTimestamp(),
          });
          fixedCount++;
          logger.log(`[FixRent] 부동산 #${data.id}: 가격 ${(propertyPrice / 10000).toFixed(0)}만원 × ${currentRentPercentage}% = 월세 ${(calculatedRent / 10000).toFixed(1)}만원`);
        }
      });

      if (fixedCount > 0) {
        await batch.commit();
        await refreshProperties();
        alert(`월세 수정 완료!\n\n${fixedCount}개 부동산의 월세를 수정했습니다.\n(월세 비율: ${currentRentPercentage}%)`);
      } else {
        alert("월세가 0원인 부동산이 없습니다.");
      }
    } catch (error) {
      logger.error("[FixRent] 오류:", error);
      alert("월세 수정 중 오류 발생: " + error.message);
    } finally {
      setOperationLoading(false);
    }
  };

  const handleCollectRent = async () => {
    if (!classCode || !currentUser || !isAdmin()) {
      alert("월세 징수 권한이 없거나 학급 정보가 없습니다.");
      return;
    }
    if (
      !window.confirm(
        `학급 [${classCode}]의 모든 세입자로부터 월세를 강제 징수하시겠습니까? (잔액 부족 시 가진 현금을 모두 징수)`
      )
    )
      return;

    setOperationLoading(true);
    let successCount = 0;
    let failCount = 0;
    let unpaidUsers = []; // 미납자 명단 (전액 납부 못한 경우)
    const now = serverTimestamp();
    const propCollRef = collection(
      db,
      "classes",
      classCode,
      "realEstateProperties"
    );
    const rentedPropertiesQuery = query(
      propCollRef,
      where("tenantId", "!=", null)
    );

    try {
      const rentedPropertiesSnapshot = await getDocs(rentedPropertiesQuery);
      if (rentedPropertiesSnapshot.empty) {
        alert("월세를 징수할 세입자가 있는 부동산이 없습니다.");
        setOperationLoading(false);
        return;
      }

      for (const propDoc of rentedPropertiesSnapshot.docs) {
        const property = propDoc.data();

        if (property.tenantId && property.rent > 0) {
          try {
            // Firestore 트랜잭션을 사용하여 데이터 일관성 보장
            // 🔥 중요: 트랜잭션 내에서 모든 읽기(get)를 먼저 수행하고, 그 다음 모든 쓰기(update)를 수행해야 함
            const result = await runTransaction(db, async (transaction) => {
              // ===== 1단계: 모든 읽기 작업 수행 =====
              const tenantDocRef = doc(db, "users", property.tenantId);
              const tenantSnap = await transaction.get(tenantDocRef);

              if (!tenantSnap.exists()) {
                // 세입자를 찾을 수 없으면 계약 해지 처리
                logger.warn(`세입자 ID ${property.tenantId}를 찾을 수 없습니다. 계약을 자동으로 해지합니다.`);
                transaction.update(propDoc.ref, {
                  tenantId: null,
                  tenant: null,
                  tenantName: null,
                  lastRentPayment: null,
                  updatedAt: now,
                });
                return {
                  status: "tenant_not_found",
                  propertyId: property.id,
                  tenantId: property.tenantId
                };
              }

              const tenantData = tenantSnap.data();
              const rentAmount = property.rent;

              // 집주인 문서 미리 읽기 (정부 소유 → 관리자에게 지급)
              let ownerSnap = null;
              const actualOwner = property.owner === "government" ? currentUser?.id : property.owner;
              if (actualOwner && actualOwner !== property.tenantId) {
                const ownerDocRef = doc(db, "users", actualOwner);
                ownerSnap = await transaction.get(ownerDocRef);
              }

              // ===== 2단계: 모든 쓰기 작업 수행 =====
              // 강제 징수: 마이너스 허용 (잔액 부족해도 전액 징수)
              const isNegative = tenantData.cash < rentAmount;

              transaction.update(tenantDocRef, {
                cash: increment(-rentAmount),
                updatedAt: now,
              });

              // 집주인에게 전액 지급
              if (ownerSnap && ownerSnap.exists()) {
                transaction.update(ownerSnap.ref, {
                  cash: increment(rentAmount),
                  updatedAt: now,
                });
              }

              transaction.update(propDoc.ref, {
                lastRentPayment: now,
                updatedAt: now,
              });

              const tenantNameLocal = tenantData.name || `ID: ${property.tenantId}`;
              const ownerNameLocal = ownerSnap?.exists() ? (ownerSnap.data().name || "집주인") : null;

              if (isNegative) {
                return {
                  status: "unpaid",
                  name: tenantNameLocal,
                  tenantId: property.tenantId,
                  ownerId: ownerSnap?.exists() ? ownerSnap.id : null,
                  ownerName: ownerNameLocal,
                  rentAmount,
                  propertyLabel: property.name || `부동산 #${property.id}`,
                  paidAmount: tenantData.cash > 0 ? tenantData.cash : 0,
                };
              }
              return {
                status: "success",
                name: tenantNameLocal,
                tenantId: property.tenantId,
                ownerId: ownerSnap?.exists() ? ownerSnap.id : null,
                ownerName: ownerNameLocal,
                rentAmount,
                propertyLabel: property.name || `부동산 #${property.id}`,
              };
            });

            // 트랜잭션 결과에 따라 카운터 및 미납자 명단 처리
            if (result.status === "unpaid") {
              unpaidUsers.push(result.name);
            } else if (result.status === "tenant_not_found") {
              logger.log(`부동산 ID ${result.propertyId}의 계약이 해지되었습니다 (세입자 ${result.tenantId} 미존재)`);
              // 계약 해지는 실패로 카운트하지 않음 (자동 처리)
            } else {
              successCount++;
            }

            // 활동 로그 기록 (학생들이 '내 자산'에서 확인할 수 있도록)
            if (result.status === "success" || result.status === "unpaid") {
              const tenantDesc = result.status === "unpaid"
                ? `${result.propertyLabel} 월세 ${result.rentAmount.toLocaleString()}원이 징수되었습니다. (잔액 부족으로 미납 처리)`
                : `${result.propertyLabel} 월세 ${result.rentAmount.toLocaleString()}원이 징수되었습니다.`;
              addActivityLog(result.tenantId, "월세 납부", tenantDesc).catch(
                (err) => logger.error("월세 납부 로그 기록 실패:", err)
              );
              if (result.ownerId && result.ownerId !== result.tenantId) {
                const ownerDesc = `${result.propertyLabel} 세입자 ${result.name}님으로부터 월세 ${result.rentAmount.toLocaleString()}원을 받았습니다.`;
                addActivityLog(result.ownerId, "월세 수입", ownerDesc).catch(
                  (err) => logger.error("월세 수입 로그 기록 실패:", err)
                );
              }
            }
          } catch (transactionError) {
            logger.error(
              `부동산 ID ${property.id} 월세 징수 트랜잭션 실패:`,
              transactionError
            );
            failCount++;
          }
        }
      }

      const settingsRefInstance = doc(
        db,
        "classes",
        classCode,
        "realEstateSettings",
        "settingsDoc"
      );
      await updateDoc(settingsRefInstance, {
        lastRentCollection: now,
        updatedAt: now,
      });

      let resultMessage = `월세 징수 완료: 성공 ${successCount}건, 실패 ${failCount}건, 미납(잔액부족) ${unpaidUsers.length}건.`;
      if (unpaidUsers.length > 0) {
        resultMessage += `\n\n[미납 학생 명단]\n${unpaidUsers.join(", ")}`;
      }
      alert(resultMessage);

      if (refreshUserDocument) refreshUserDocument();
    } catch (error) {
      logger.error("월세 징수 중 전체 오류:", error);
      alert("월세 징수 중 심각한 오류 발생: " + error.message);
    } finally {
      setOperationLoading(false);
    }
  };

  const renderPropertyLayout = () => {
    const layoutProperties = properties.slice(0, settings.totalProperties);
    return (
      <div className="property-layout">
        <h3>🏢 부동산 배치도</h3>
        <div
          className="layout-grid"
          style={{
            gridTemplateColumns: `repeat(${settings.layoutColumns}, 1fr)`,
          }}
        >
          {Array.from({ length: settings.totalProperties }, (_, index) => {
            const propertyId = (index + 1).toString();
            const property = layoutProperties.find((p) => p.id === propertyId);
            
            let statusClass = "layout-cell empty";
            let title = `#${propertyId}`;

            if (property) {
                const ownerData = allUsersData?.find((u) => u.id === property.owner);
                const ownerName = property.ownerName || (property.owner === "government" ? "정부" : ownerData?.name || "소유주 불명");
                const tenantData = allUsersData?.find((u) => u.id === property.tenantId);
                const tenantDisplayName = property.tenantName || tenantData?.name;

                title = `#${propertyId} - ${ownerName}`;
                if (property.tenantId) {
                    title += ` (임차인: ${tenantDisplayName || '세입자 불명'})`;
                }

                if (property.tenantId === currentUser?.id) {
                    statusClass = "layout-cell rented-by-me";
                    title = `#${propertyId} - ${ownerName} (내가 임차중)`;
                } 
                else if (property.forSale) {
                    statusClass = "layout-cell for-sale";
                } 
                else if (property.owner === currentUser?.id) {
                    statusClass = "layout-cell owned";
                } 
                else if (property.owner === "government") {
                    statusClass = "layout-cell government";
                } 
                else {
                    statusClass = "layout-cell occupied";
                }
            }

            const shortPrice = (v) => {
              if (!v) return '';
              if (v >= 100000000) return `${(v / 100000000).toFixed(v % 100000000 === 0 ? 0 : 1)}억`;
              if (v >= 10000) return `${Math.round(v / 10000)}만`;
              return v.toLocaleString();
            };

            return (
              <div
                key={propertyId}
                className={statusClass}
                onClick={() => property && setShowQuickAction(property)}
                title={title}
              >
                <span className="layout-cell-num">#{propertyId}</span>
                {property ? (
                  <>
                    <span className="layout-cell-owner">
                      {property.owner === "government" ? "정부" : (property.ownerName || "소유주")}
                    </span>
                    <span className="layout-cell-price">{shortPrice(property.price)}</span>
                    {property.tenantId && (
                      <span className="layout-cell-tenant">🏠 {property.tenantName || "세입자"}</span>
                    )}
                    {property.forSale && (
                      <span className="layout-cell-tenant" style={{color:'#f87171'}}>판매중</span>
                    )}
                  </>
                ) : (
                  <span className="layout-cell-owner" style={{opacity:0.3}}>빈 땅</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="layout-legend">
          <div className="legend-item">
            <div className="legend-color government"></div>
            <span>정부 소유</span>
          </div>
          <div className="legend-item">
            <div className="legend-color owned"></div>
            <span>내 소유</span>
          </div>
          <div className="legend-item">
            <div className="legend-color rented-by-me-legend"></div>
            <span>내가 임차중</span>
          </div>
          <div className="legend-item">
            <div className="legend-color for-sale"></div>
            <span>판매중</span>
          </div>
          <div className="legend-item">
            <div className="legend-color occupied"></div>
            <span>타인 소유</span>
          </div>
        </div>
      </div>
    );
  };

  const renderQuickActionModal = () => {
    if (!showQuickAction || !currentUser) return null;
    const property = showQuickAction;
    const isOwner = property.owner === currentUser.id;
    const isTenantOfThisProperty = property.tenantId === currentUser.id;
    const isTenantElsewhere = properties.some(
      (p) => p.tenantId === currentUser.id && p.id !== property.id
    );
    const isGovProperty = property.owner === 'government';


    const ownerData = allUsersData?.find((u) => u.id === property.owner);
    const ownerName =
      property.owner === "government"
        ? "정부"
        : property.ownerName || ownerData?.name || "소유주 불명";
    const tenantData = allUsersData?.find((u) => u.id === property.tenantId);
    const tenantName = property.tenantName || tenantData?.name;

    let tenancyButton;
    if (isTenantOfThisProperty) {
      tenancyButton = (
        <button
          className="quick-action-btn btn-rent"
          onClick={() => handleTenancy(property.id)}
          disabled={operationLoading}
        >
          퇴거하기
        </button>
      );
    } else if (property.tenantId) {
      tenancyButton = (
        <button className="quick-action-btn btn-rent" disabled>
          입주불가
        </button>
      );
    } else if (isTenantElsewhere) {
      tenancyButton = (
        <button
          className="quick-action-btn btn-rent"
          disabled
          title="다른 곳에 입주해 있습니다. 먼저 퇴거하세요."
        >
          입주하기
        </button>
      );
    } else {
      tenancyButton = (
        <button
          className="quick-action-btn btn-rent"
          onClick={() => handleTenancy(property.id)}
          disabled={operationLoading || currentUser.cash < property.rent}
        >
          입주하기
        </button>
      );
    }

    return (
      <div className="modal-overlay" onClick={() => setShowQuickAction(null)}>
        <div
          className="quick-action-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="quick-modal-header">
            <h3>⚡ 빠른 액션 #{property.id}</h3>
            <button
              className="close-btn"
              onClick={() => setShowQuickAction(null)}
            >
              ✕
            </button>
          </div>
          <div className="quick-modal-content">
            <div className="quick-property-info">
              <div className="quick-info-row">
                <span className="detail-label">소유자</span>
                <span className="detail-value">{ownerName}</span>
              </div>
              <div className="quick-info-row">
                <span className="detail-label">부동산 가격</span>
                <span className="detail-value">
                  {(property.price / 10000).toFixed(0)}만원
                </span>
              </div>
              <div className="quick-info-row">
                <span className="detail-label">월세</span>
                <span className="detail-value">
                  {(property.rent / 10000).toFixed(0)}만원
                </span>
              </div>
              {tenantName && (
                <div className="quick-info-row">
                  <span className="detail-label">세입자</span>
                  <span className="detail-value">{tenantName}</span>
                </div>
              )}
              {property.forSale && (
                <div className="quick-info-row">
                  <span className="detail-label">판매가격</span>
                  <span
                    className="detail-value"
                    style={{ color: "#ef4444", fontWeight: "bold" }}
                  >
                    {(property.salePrice / 10000).toFixed(0)}만원
                  </span>
                </div>
              )}
            </div>
            <div className="quick-actions">
              {(isGovProperty || property.forSale) &&
                !isOwner && (
                  <button
                    className="quick-action-btn btn-purchase"
                    onClick={() => handlePurchaseProperty(property.id)}
                    disabled={
                      operationLoading ||
                      currentUser.cash <
                        (property.forSale ? property.salePrice : property.price)
                    }
                  >
                    구매하기
                  </button>
                )}
              {tenancyButton}
              {isOwner && !property.forSale && (
                <button
                  className="quick-action-btn btn-sell"
                  onClick={() => handleSetForSale(property.id)}
                  disabled={operationLoading}
                >
                  판매하기
                </button>
              )}
              {isOwner && property.forSale && (
                <button
                  className="quick-action-btn btn-cancel"
                  onClick={() => handleCancelSale(property.id)}
                  disabled={operationLoading}
                >
                  판매취소
                </button>
              )}
              {isAdmin() && isGovProperty && !property.forSale && (
                <button
                    className="quick-action-btn btn-sell"
                    onClick={() => handleAdminSetForSale(property.id)}
                    disabled={operationLoading}
                >
                    (관리자) 판매설정
                </button>
              )}
              {isAdmin() && isGovProperty && property.forSale && (
                  <button
                      className="quick-action-btn btn-cancel"
                      onClick={() => handleAdminCancelSale(property.id)}
                      disabled={operationLoading}
                  >
                      (관리자) 판매취소
                  </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPropertyGrid = () => {
    const activeProperties = properties.slice(0, settings.totalProperties);
    if (activeProperties.length === 0 && !propertiesLoading)
      return (
        <div className="loading-message">
          부동산 데이터가 없습니다. 관리자가 초기화할 수 있습니다.
        </div>
      );

    const userIsTenantElsewhere = properties.some(
      (p) => p.tenantId === currentUser?.id
    );

    return (
      <div className="property-grid">
        {activeProperties.map((property) => {
          const isOwner = currentUser && property.owner === currentUser.id;
          const isTenantOfThisProperty =
            currentUser && property.tenantId === currentUser.id;
          const isGovProperty = property.owner === 'government';

          const ownerData = allUsersData?.find((u) => u.id === property.owner);
          const ownerName =
            property.owner === "government"
              ? "정부"
              : property.ownerName || ownerData?.name || "소유주 불명";
          const tenantData = allUsersData?.find(
            (u) => u.id === property.tenantId
          );
          const tenantNameDisplay = property.tenantName || tenantData?.name;
          let propertyClass = "property-card";
          if (property.owner === "government") propertyClass += " government";
          else if (isOwner) propertyClass += " owned";
          else if (property.forSale) propertyClass += " for-sale";
          else propertyClass += " other-owned";

          let tenancyButton;
          if (isTenantOfThisProperty) {
            tenancyButton = (
              <button
                className="btn-action btn-rent"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTenancy(property.id);
                }}
                disabled={operationLoading}
              >
                퇴거
              </button>
            );
          } else if (property.tenantId) {
            tenancyButton = (
              <button className="btn-action btn-rent" disabled>
                입주불가
              </button>
            );
          } else if (userIsTenantElsewhere) {
            tenancyButton = (
              <button
                className="btn-action btn-rent"
                disabled
                title="다른 곳에 입주해 있습니다."
              >
                입주
              </button>
            );
          } else {
            tenancyButton = (
              <button
                className="btn-action btn-rent"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTenancy(property.id);
                }}
                disabled={operationLoading || !currentUser || currentUser.cash < property.rent}
              >
                입주
              </button>
            );
          }

          return (
            <div
              key={property.id}
              className={propertyClass}
              onClick={() => setSelectedProperty(property)}
            >
              <div className="property-header">
                <h4>#{property.id}</h4>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {property.forSale && (
                    <span className="sale-badge">판매중</span>
                  )}
                  {property.tenantId && (
                    <span className="rent-badge">임대중</span>
                  )}
                </div>
              </div>
              <div className="property-info">
                <div className="info-row">
                  <span className="label">소유자</span>
                  <span className="value">{ownerName}</span>
                </div>
                <div className="info-row">
                  <span className="label">가격</span>
                  <span className="value">
                    {(property.price / 10000).toFixed(0)}만원
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">월세</span>
                  <span className="value">
                    {(property.rent / 10000).toFixed(0)}만원
                  </span>
                </div>
                {tenantNameDisplay && (
                  <div className="info-row">
                    <span className="label">세입자</span>
                    <span className="value">{tenantNameDisplay}</span>
                  </div>
                )}
                {property.forSale && (
                  <div className="info-row sale-price">
                    <span className="label">판매가</span>
                    <span className="value">
                      {(property.salePrice / 10000).toFixed(0)}만원
                    </span>
                  </div>
                )}
              </div>
              <div className="property-actions">
                {(isGovProperty || property.forSale) &&
                  !isOwner && (
                    <button
                      className="btn-action btn-purchase"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePurchaseProperty(property.id);
                      }}
                      disabled={
                        operationLoading ||
                        !currentUser ||
                        currentUser.cash <
                          (property.forSale
                            ? property.salePrice
                            : property.price)
                      }
                    >
                      구매
                    </button>
                  )}
                {tenancyButton}
                {isOwner && !property.forSale && (
                  <button
                    className="btn-action btn-sell"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetForSale(property.id);
                    }}
                    disabled={operationLoading}
                  >
                    판매설정
                  </button>
                )}
                {isOwner && property.forSale && (
                  <button
                    className="btn-action btn-cancel"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelSale(property.id);
                    }}
                    disabled={operationLoading}
                  >
                    판매취소
                  </button>
                )}
                {isAdmin() && isGovProperty && !property.forSale && (
                    <button
                        className="btn-action btn-sell"
                        onClick={(e) => { e.stopPropagation(); handleAdminSetForSale(property.id); }}
                        disabled={operationLoading}
                    >
                        (관리자)판매
                    </button>
                )}
                {isAdmin() && isGovProperty && property.forSale && (
                    <button
                        className="btn-action btn-cancel"
                        onClick={(e) => { e.stopPropagation(); handleAdminCancelSale(property.id); }}
                        disabled={operationLoading}
                    >
                        (관리자)취소
                    </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  
  if (authLoading || settingsLoading || propertiesLoading || usersLoading) {
    return <div className="loading-message">데이터를 불러오는 중입니다...</div>;
  }

  const tenantIds = new Set(
    properties.map((p) => p.tenantId).filter(Boolean)
  );
  const nonTenants = allUsersData.filter(
    (user) => !tenantIds.has(user.id) && !user.isAdmin
  );

  return (
    <>
      <div className="real-estate-exchange">
        {operationLoading && <div className="loading-overlay">처리 중...</div>}
        <div className="exchange-header">
          <div className="header-content">
            <h1>🏢 부동산 거래소</h1>
          </div>
        </div>
        <div className="stats-container">
          <div className="stats-bar">
            <div className="stat-item">
              <div className="stat-icon">🏘️</div>
              <div className="stat-content">
                <div className="stat-value">{settings.totalProperties}</div>
                <div className="stat-label">전체 부동산</div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">👥</div>
              <div className="stat-content">
                <div className="stat-value">
                  {properties.filter((p) => p.owner !== "government").length}
                </div>
                <div className="stat-label">개인 소유</div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">🏠</div>
              <div className="stat-content">
                <div className="stat-value">
                  {properties.filter((p) => p.tenantId).length}
                </div>
                <div className="stat-label">임대 중</div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <div className="stat-value">
                  {properties.filter((p) => p.forSale).length}
                </div>
                <div className="stat-label">판매 중</div>
              </div>
            </div>
          </div>
        </div>
        <div className="exchange-content">
          {renderPropertyLayout()}
          {isAdmin() && (
            <div className="admin-controls">
                <button
                    className="admin-btn settings"
                    onClick={() => setShowAdminPanel(true)}
                    style={{ textDecoration: "none" }}
                >
                    ⚙️ 관리자 설정
                </button>
              <button
                className="admin-btn collect"
                onClick={handleCollectRent}
                disabled={operationLoading}
              >
                💸 월세 징수
              </button>
              <button
                className="admin-btn settings"
                onClick={handleFixZeroRent}
                disabled={operationLoading}
              >
                🔧 월세 0원 수정
              </button>
            </div>
          )}
          <div className="properties-section">
            <h2>📊 부동산 목록</h2>
            {renderPropertyGrid()}
          </div>
        </div>
        
        {renderQuickActionModal()}
        {selectedProperty && (
          <div
            className="modal-overlay"
            onClick={() => setSelectedProperty(null)}
          >
            <div className="property-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>ℹ️ 부동산 #{selectedProperty.id} 상세정보</h3>
                <button
                  className="close-btn"
                  onClick={() => setSelectedProperty(null)}
                >
                  ✕
                </button>
              </div>
              <div className="modal-content">
                <div className="property-details">
                  <div className="detail-row">
                    <span className="detail-label">소유자</span>
                    <span className="detail-value">
                      {selectedProperty.owner === "government"
                        ? "정부"
                        : selectedProperty.ownerName ||
                          allUsersData?.find(
                            (u) => u.id === selectedProperty.owner
                          )?.name ||
                          "소유주 불명"}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">부동산 가격</span>
                    <span className="detail-value">
                      {selectedProperty.price.toLocaleString()}원
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">월세</span>
                    <span className="detail-value">
                      {selectedProperty.rent.toLocaleString()}원
                    </span>
                  </div>
                  {selectedProperty.tenantId && (
                    <div className="detail-row">
                      <span className="detail-label">세입자</span>
                      <span className="detail-value">
                        {selectedProperty.tenantName ||
                          allUsersData?.find(
                            (u) => u.id === selectedProperty.tenantId
                          )?.name ||
                          "세입자 불명"}
                      </span>
                    </div>
                  )}
                  {selectedProperty.forSale && (
                    <div className="detail-row sale-highlight">
                      <span className="detail-label">판매가격</span>
                      <span className="detail-value">
                        {selectedProperty.salePrice.toLocaleString()}원
                      </span>
                    </div>
                  )}
                  {selectedProperty.lastRentPayment && (
                    <div className="detail-row">
                      <span className="detail-label">최근 월세 납부일</span>
                      <span className="detail-value">
                        {selectedProperty.lastRentPayment instanceof Date
                          ? selectedProperty.lastRentPayment.toLocaleDateString()
                          : "정보 없음"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {showAdminPanel && isAdmin() && (
        <div
          className="modal-overlay"
          onClick={() => setShowAdminPanel(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            zIndex: 999999,
            padding: '2rem 1rem',
            overflowY: 'auto'
          }}
        >
          <div
            className="admin-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.15)',
              border: '1px solid #e2e8f0',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              zIndex: 1000000,
              color: '#0f172a'
            }}
          >
            <div className="panel-header">
              <h3>⚙️ 관리자 설정</h3>
              <button className="close-btn" onClick={() => setShowAdminPanel(false)}>✕</button>
            </div>
            <div className="panel-content">
              <div className="form-group">
                <label>활성화할 부동산 개수</label>
                <input type="number" min="1" max="100" value={adminInputs.totalProperties} onChange={(e) => setAdminInputs(prev => ({ ...prev, totalProperties: e.target.value }))} />
              </div>
              <div style={{display:'flex',gap:'12px'}}>
                <div className="form-group" style={{flex:1}}>
                  <label>한 줄당 칸 수</label>
                  <select value={adminInputs.layoutColumns} onChange={(e) => setAdminInputs(prev => ({ ...prev, layoutColumns: e.target.value }))}>
                    {[3, 4, 5, 6, 7, 8, 10].map(n => <option key={n} value={n.toString()}>{n}칸</option>)}
                  </select>
                </div>
                <div className="form-group" style={{flex:1}}>
                  <label>줄 수 (자동 계산: {Math.ceil(parseInt(adminInputs.totalProperties || 0) / parseInt(adminInputs.layoutColumns || 4))}줄)</label>
                  <input type="text" disabled value={`${Math.ceil(parseInt(adminInputs.totalProperties || 0) / parseInt(adminInputs.layoutColumns || 4))}줄 × ${adminInputs.layoutColumns}칸`} style={{opacity:0.6}} />
                </div>
              </div>
              <div className="form-group">
                <label>기본 부동산 가격 (원)</label>
                <input type="number" min="1000000" step="1000000" value={adminInputs.basePrice} onChange={(e) => setAdminInputs(prev => ({ ...prev, basePrice: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>월세 비율 (%)</label>
                <input type="number" min="0" max="20" step="0.1" value={adminInputs.rentPercentage} onChange={(e) => setAdminInputs(prev => ({ ...prev, rentPercentage: e.target.value }))} />
              </div>
              <p style={{fontSize:'0.8rem',color:'#818cf8',margin:'0 0 8px'}}>💡 설정 저장 시 부동산 초기화 여부를 묻습니다.</p>
              <div className="non-tenant-list">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0 }}>⚠️ 미입주 학생 ({nonTenants.length}명){excludedFromAssign.size > 0 && <span style={{color:'#f59e0b',fontSize:'0.85em'}}> / 제외 {excludedFromAssign.size}명</span>}</h4>
                  {nonTenants.length > 0 && (
                    <button
                      onClick={handleAdminAssignAllSeats}
                      disabled={operationLoading}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: operationLoading ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: '700',
                        opacity: operationLoading ? 0.6 : 1,
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                      onMouseOver={(e) => !operationLoading && (e.target.style.backgroundColor = '#059669')}
                      onMouseOut={(e) => !operationLoading && (e.target.style.backgroundColor = '#10b981')}
                    >
                      🏘️ {excludedFromAssign.size > 0 ? `선택된 ${nonTenants.length - excludedFromAssign.size}명 배정` : '모두 자동 배정'}
                    </button>
                  )}
                </div>
                {nonTenants.length > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0, maxHeight: '300px', overflowY: 'auto' }}>
                    {nonTenants.map(user => (
                      <li key={user.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        marginBottom: '6px',
                        backgroundColor: excludedFromAssign.has(user.id) ? '#f1f5f9' : '#f8fafc',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        color: '#0f172a',
                        opacity: excludedFromAssign.has(user.id) ? 0.5 : 1,
                      }}>
                        <input
                          type="checkbox"
                          checked={!excludedFromAssign.has(user.id)}
                          onChange={() => setExcludedFromAssign(prev => {
                            const next = new Set(prev);
                            if (next.has(user.id)) next.delete(user.id);
                            else next.add(user.id);
                            return next;
                          })}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#10b981' }}
                        />
                        <span style={{ fontWeight: '500', color: '#0f172a', flex: 1 }}>{user.name}</span>
                        <button
                          onClick={() => handleAdminAssignSeat(user.id, user.name)}
                          disabled={operationLoading}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: operationLoading ? 'not-allowed' : 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                            opacity: operationLoading ? 0.6 : 1,
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={(e) => !operationLoading && (e.target.style.backgroundColor = '#2563eb')}
                          onMouseOut={(e) => !operationLoading && (e.target.style.backgroundColor = '#3b82f6')}
                        >
                          🏠 배정
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ color: '#059669', fontWeight: '600', textAlign: 'center', padding: '20px' }}>✅ 모든 학생이 입주했습니다!</p>
                )}
              </div>
            </div>
            <div className="panel-actions">
              <button className="btn-primary" onClick={handleSaveSettings} disabled={operationLoading}>💾 설정 저장</button>
              <button className="btn-danger" onClick={handleInitializeProperties} disabled={operationLoading}>🔄 부동산 초기화</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RealEstateRegistry;