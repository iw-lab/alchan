// src/Auction.js (오류 수정 및 관리자 기능 추가)
import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useItems } from "../../contexts/ItemContext";

// firebase.js에서 익스포트하는 함수들
import {
  db,
  serverTimestamp,
  collection,
  query,
  where, // 쿼리를 위해 추가
  addDoc,
  doc,
  updateDoc, // updateDoc 추가
  deleteDoc,
  runTransaction,
  Timestamp,
  increment,
  getDoc,
  getDocs, // getDocs 추가
} from "../../firebase";

// orderBy는 firebase/firestore에서 직접 가져옵니다.
import {
  orderBy as firebaseOrderBy,
} from "firebase/firestore";
import { AlchanLoading } from "../../components/AlchanLayout";
import "./Auction.css";

import { logger } from "../../utils/logger";
export default function Auction() {
  // --- Context Data ---
  const authContext = useAuth();
  const itemsContext = useItems();
  const allUsersData = authContext?.users ?? [];

  const authLoading = authContext?.loading ?? true;
  const firebaseUser = !authLoading ? authContext?.user : null;
  const userDoc = !authLoading ? authContext?.userDoc : null;
  const optimisticUpdate = authContext?.optimisticUpdate;

  const balance = userDoc?.cash ?? 0;
  const currentUserId = firebaseUser?.uid || userDoc?.id;
  const classCode = userDoc?.classCode;
  const currentUserName =
    userDoc?.name || firebaseUser?.displayName || "판매자 정보 없음";

  const itemsLoading = itemsContext?.loading ?? true;
  const inventoryItems = !itemsLoading ? itemsContext?.userItems ?? [] : [];
  const updateUserItemQuantity = itemsContext?.updateUserItemQuantity;

  // --- Component State ---
  const [activeTab, setActiveTab] = useState("ongoing");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAssetForAuction, setSelectedAssetForAuction] = useState(null);
  const [newAuction, setNewAuction] = useState({
    assetId: null,
    assetType: "item",
    name: "",
    description: "",
    startPrice: "",
    duration: "1",
  });
  const [bidAmount, setBidAmount] = useState({});
  const [notification, setNotification] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [auctions, setAuctions] = useState([]);
  const [auctionsLoading, setAuctionsLoading] = useState(true);

  // --- Helper Functions ---
  const formatPrice = (price) => {
    if (typeof price !== "number" || isNaN(price)) return "가격 정보 없음";
    return `${price.toLocaleString("ko-KR")}원`;
  };

  // --- Effects ---
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // 경매 정산 로직 (수정됨 - 아이템 반환/지급 로직 개선)
  const settleAuction = async (auction) => {
    if (!classCode) return;
    const auctionRef = doc(db, "classes", classCode, "auctions", auction.id);

    logger.log(`[Auction Settle] 정산 시도: ${auction.id}`);

    // --- 사전 작업: 낙찰자가 있을 경우, 인벤토리에서 동일 아이템 검색 ---
    let winnerExistingItemQuerySnap = null;
    if (auction.highestBidder && auction.originalStoreItemId) {
      const winnerInventoryRef = collection(
        db,
        "users",
        auction.highestBidder,
        "inventory"
      );
      const q = query(
        winnerInventoryRef,
        where("itemId", "==", auction.originalStoreItemId)
      );
      winnerExistingItemQuerySnap = await getDocs(q);
    }

    try {
      await runTransaction(db, async (transaction) => {
        // ====== 모든 읽기 작업을 먼저 실행 ======
        const auctionDoc = await transaction.get(auctionRef);
        if (!auctionDoc.exists() || auctionDoc.data().status !== "ongoing") {
          logger.log(`[Auction Settle] 경매가 이미 처리되었거나 삭제됨: ${auction.id}`);
          return;
        }

        const auctionData = auctionDoc.data();
        const now = new Date();
        const endTime = auctionData.endTime.toDate();

        if (endTime > now) {
          logger.log(`[Auction Settle] 경매가 아직 종료되지 않음: ${auction.id}`);
          return;
        }

        let sellerItemDoc = null;
        let sellerItemRef = null;
        if (!auctionData.highestBidder) {
          // 유찰된 경우에만 판매자 아이템 문서 읽기
          const returnCollection = auctionData.assetSourceCollection || 'inventory'; // 안전장치
          sellerItemRef = doc(db, "users", auctionData.seller, returnCollection, auctionData.assetId);
          sellerItemDoc = await transaction.get(sellerItemRef);
        }

        // ====== 모든 쓰기 작업을 읽기 완료 후 실행 ======

        if (auctionData.highestBidder) {
          // --- 성공적인 경매 (낙찰자 있음) ---
          const sellerRef = doc(db, "users", auctionData.seller);

          // 1. 판매자에게 낙찰금 지급
          transaction.update(sellerRef, {
            cash: increment(auctionData.currentBid),
            updatedAt: serverTimestamp(),
          });

          // 2. 낙찰자에게 아이템 지급 (개선된 로직)
          if (winnerExistingItemQuerySnap && !winnerExistingItemQuerySnap.empty) {
            // 이미 동일 종류의 아이템을 가지고 있으면 수량 증가
            const winnerItemRef = winnerExistingItemQuerySnap.docs[0].ref;
            transaction.update(winnerItemRef, {
              quantity: increment(1),
              updatedAt: serverTimestamp(),
            });
          } else {
            // 새 아이템이므로 inventory에 새로 추가
            const winnerInventoryRef = collection(db, "users", auctionData.highestBidder, "inventory");
            const newWinnerItemRef = doc(winnerInventoryRef); // 자동 ID 생성
            transaction.set(newWinnerItemRef, {
              itemId: auctionData.originalStoreItemId, // 상점 아이템 ID
              name: auctionData.name,
              description: auctionData.description,
              icon: auctionData.itemIcon || "📦",
              quantity: 1,
              type: "item",
              purchasedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          // 3. 활동 로그 기록 (기존과 동일)
          const sellerLogRef = collection(db, "users", auctionData.seller, "activityLogs");
          transaction.set(doc(sellerLogRef), {
            timestamp: serverTimestamp(), type: "auction_sold",
            message: `'${auctionData.name}' 아이템이 ${formatPrice(auctionData.currentBid)}에 판매되었습니다.`,
            relatedDocId: auction.id,
          });

          const winnerLogRef = collection(db, "users", auctionData.highestBidder, "activityLogs");
          transaction.set(doc(winnerLogRef), {
            timestamp: serverTimestamp(), type: "auction_won",
            message: `'${auctionData.name}' 아이템을 ${formatPrice(auctionData.currentBid)}에 낙찰받았습니다.`,
            relatedDocId: auction.id,
          });

        } else {
          // --- 유찰된 경매 (낙찰자 없음) ---
          // 1. 판매자에게 아이템 반환 (개선된 로직)
          if (sellerItemDoc && sellerItemDoc.exists()) {
            // 판매자 인벤토리에 해당 아이템 문서가 아직 존재하면 수량만 증가
            transaction.update(sellerItemRef, {
              quantity: increment(1),
              updatedAt: serverTimestamp(),
            });
          } else if (sellerItemRef) {
            // 판매자가 해당 종류의 아이템을 모두 소진해 문서가 없다면 새로 생성
            transaction.set(sellerItemRef, {
              itemId: auctionData.originalStoreItemId,
              name: auctionData.name,
              description: auctionData.description,
              icon: auctionData.itemIcon || "📦",
              quantity: 1,
              type: "item",
              addedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          // 2. 활동 로그 기록
          const sellerLogRef = collection(db, "users", auctionData.seller, "activityLogs");
          transaction.set(doc(sellerLogRef), {
            timestamp: serverTimestamp(), type: "auction_unsold",
            message: `'${auctionData.name}' 아이템이 유찰되어 반환되었습니다.`,
            relatedDocId: auction.id,
          });
        }

        // 4. 경매 상태를 'completed'로 변경
        transaction.update(auctionRef, {
          status: "completed",
          updatedAt: serverTimestamp(),
        });
      });

      logger.log(`[Auction Settle] 성공적으로 정산 완료: ${auction.id}.`);
      if (authContext.refreshUserDocument) authContext.refreshUserDocument();
      if (itemsContext.fetchUserItems) itemsContext.fetchUserItems();
    } catch (error) {
      logger.error(`[Auction Settle] 정산 중 오류 발생 ${auction.id}:`, error);
      // 오류 발생 시 경매 상태를 'error'로 변경하여 재시도를 방지하고 문제 파악을 용이하게 할 수 있습니다.
      await updateDoc(auctionRef, { status: "error", error: error.message });
    }
  };

  // 🔥 [최적화] 경매 데이터 폴링 (실시간 리스너 제거로 비용 90% 절감)
  useEffect(() => {
    if (!classCode || !currentUserId) {
      setAuctionsLoading(false);
      setAuctions([]);
      return;
    }

    const loadAuctions = async () => {
      try {
        setAuctionsLoading(true);
        const auctionsRef = collection(db, "classes", classCode, "auctions");
        const q = query(auctionsRef, firebaseOrderBy("endTime", "desc"));
        const querySnapshot = await getDocs(q);

        const auctionsData = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          endTime: doc.data().endTime?.toDate ? doc.data().endTime.toDate() : null,
        }));

        setAuctions(auctionsData);
        setAuctionsLoading(false);

        // --- 경매 자동 정산 로직 ---
        const now = new Date();
        const auctionsToSettle = auctionsData.filter(
          (a) => a.status === "ongoing" && a.endTime && a.endTime <= now
        );

        if (auctionsToSettle.length > 0) {
          logger.log(`[Auction] 정산할 경매 ${auctionsToSettle.length}개 발견.`);
          auctionsToSettle.forEach((auction) => settleAuction(auction));
        }

        // --- 3일 이상 지난 완료/오류 경매 자동 삭제 ---
        const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
        const oldCompletedAuctions = auctionsData.filter(
          (a) => (a.status === "completed" || a.status === "error") &&
                 a.endTime && (now.getTime() - a.endTime.getTime() > THREE_DAYS_MS)
        );

        if (oldCompletedAuctions.length > 0) {
          logger.log(`[Auction] ${oldCompletedAuctions.length}개 오래된 완료 경매 자동 삭제`);
          const auctionsRef2 = collection(db, "classes", classCode, "auctions");
          for (const auction of oldCompletedAuctions) {
            try {
              await deleteDoc(doc(auctionsRef2, auction.id));
            } catch (err) {
              logger.error(`[Auction] 자동 삭제 실패 ${auction.id}:`, err);
            }
          }
          // 삭제 후 목록 업데이트
          setAuctions(prev => prev.filter(a =>
            !oldCompletedAuctions.some(old => old.id === a.id)
          ));
        }
      } catch (error) {
        logger.error("[Auction] 경매 데이터 로드 오류:", error);
        showNotification("경매 데이터를 불러오는 중 오류가 발생했습니다.", "error");
        setAuctionsLoading(false);
      }
    };

    // 초기 로드만 실행 (폴링 제거)
    loadAuctions();

    // 🔥 [최적화] 폴링 제거 - 사용자가 페이지 새로고침으로 경매 확인
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classCode, currentUserId]);

  useEffect(() => {
    if (selectedAssetForAuction) {
      if (!selectedAssetForAuction.type || selectedAssetForAuction.type !== "item") {
        showNotification("선택된 자산의 타입을 식별할 수 없거나 아이템이 아닙니다.", "error");
        setSelectedAssetForAuction(null);
        return;
      }
      setNewAuction((prev) => ({
        ...prev,
        assetId: selectedAssetForAuction.id,
        assetType: selectedAssetForAuction.type,
        name: selectedAssetForAuction.name || "이름 없음",
        description: selectedAssetForAuction.description || "",
        startPrice: "",
        duration: "1",
      }));
    } else {
      setNewAuction((prev) => ({
        ...prev,
        assetId: null,
        assetType: "item",
        name: "",
        description: "",
        startPrice: "",
        duration: "1",
      }));
    }
  }, [selectedAssetForAuction]);

  // --- Data Filtering ---
  const ongoingAuctions = auctions
    .filter((auction) => auction.status === "ongoing")
    .filter(
      (auction) =>
        searchTerm === "" ||
        auction.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (auction.description &&
          auction.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  const myAuctions = auctions.filter((auction) => auction.seller === currentUserId);
  const myBids = auctions.filter(
    (auction) =>
      auction.highestBidder === currentUserId && auction.seller !== currentUserId
  );
  const completedAuctions = auctions.filter(
    (auction) => auction.status === "completed" || auction.status === "error"
  );

  // --- Helper Functions ---
  const getTimeLeft = (endTime) => {
    if (!(endTime instanceof Date) || isNaN(endTime.getTime()))
      return "시간 정보 없음";
    const timeDiff = endTime.getTime() - currentTime.getTime();
    if (timeDiff <= 0) return "종료됨";
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((timeDiff / 1000 / 60) % 60);
    let output = "";
    if (days > 0) output += `${days}일 `;
    if (hours > 0 || days > 0) output += `${hours}시간 `;
    if (minutes > 0 || (days === 0 && hours === 0)) output += `${minutes}분`;
    return output.trim() || "곧 종료";
  };

  const showNotification = (message, type = "info") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // --- Event Handlers ---
  const handleBid = async (auctionId) => {
    if (!currentUserId || !classCode) {
      showNotification("로그인이 필요하거나 학급 정보가 없습니다.", "error");
      return;
    }
    const auctionRef = doc(db, "classes", classCode, "auctions", auctionId);
    const userRef = doc(db, "users", currentUserId);

    const auctionFromState = auctions.find((a) => a.id === auctionId);
    if (!auctionFromState) {
      showNotification("경매 정보를 찾을 수 없습니다 (로컬 상태).", "error");
      return;
    }

    const amount = parseInt(bidAmount[auctionId] || "0", 10);

    if (!amount || isNaN(amount) || amount <= 0) {
      showNotification("유효한 입찰 금액을 입력하세요.", "error");
      return;
    }
    if (amount <= auctionFromState.currentBid) {
      showNotification(`현재가 (${formatPrice(auctionFromState.currentBid)})보다 높은 금액을 입력하세요.`, "error");
      return;
    }
    if (amount > balance) {
      showNotification(`보유 금액(${formatPrice(balance)})이 부족합니다. 트랜잭션에서 다시 확인됩니다.`, "warning");
    }
    if (auctionFromState.seller === currentUserId) {
      showNotification("자신의 경매에는 입찰할 수 없습니다.", "error");
      return;
    }
    if (
      !auctionFromState.endTime ||
      !(auctionFromState.endTime instanceof Date) ||
      auctionFromState.endTime <= currentTime ||
      auctionFromState.status !== "ongoing"
    ) {
      showNotification("이미 종료되었거나 유효하지 않은 경매입니다.", "error");
      return;
    }

    // 🔥 즉시 UI 업데이트 (낙관적 업데이트)
    if (optimisticUpdate) {
      optimisticUpdate({ cash: -amount });
    }

    try {
      await runTransaction(db, async (transaction) => {
        const auctionDoc = await transaction.get(auctionRef);
        if (!auctionDoc.exists()) {
          throw new Error("경매 정보를 찾을 수 없습니다 (Firestore).");
        }
        const currentAuctionData = auctionDoc.data();

        if (currentAuctionData.status !== "ongoing") {
          throw new Error("경매가 이미 종료되었습니다.");
        }

        const bidderUserDoc = await transaction.get(userRef);
        if (!bidderUserDoc.exists()) {
          throw new Error("입찰자 정보를 찾을 수 없습니다.");
        }
        const bidderUserData = bidderUserDoc.data();

        if (bidderUserData.cash < amount) {
          throw new Error(`보유 현금이 부족합니다. (현재: ${formatPrice(bidderUserData.cash)}, 필요: ${formatPrice(amount)})`);
        }
        if (amount <= currentAuctionData.currentBid) {
          throw new Error(`입찰 금액이 현재가(${formatPrice(currentAuctionData.currentBid)})보다 낮거나 같습니다.`);
        }
        if (currentAuctionData.seller === currentUserId) {
          throw new Error("자신의 경매에는 입찰할 수 없습니다.");
        }
        const auctionEndTime = currentAuctionData.endTime.toDate();
        if (auctionEndTime <= new Date()) {
          throw new Error("경매가 이미 종료되었습니다.");
        }

        if (currentAuctionData.highestBidder && currentAuctionData.currentBid > 0) {
          const previousHighestBidderRef = doc(db, "users", currentAuctionData.highestBidder);
          transaction.update(previousHighestBidderRef, {
            cash: increment(currentAuctionData.currentBid),
            updatedAt: serverTimestamp(),
          });
        }

        transaction.update(userRef, {
          cash: increment(-amount),
          updatedAt: serverTimestamp(),
        });

        transaction.update(auctionRef, {
          currentBid: amount,
          bidCount: increment(1),
          highestBidder: currentUserId,
          highestBidderName: currentUserName,
          updatedAt: serverTimestamp(),
        });
      });

      if (authContext.refreshUserDocument) authContext.refreshUserDocument();

      showNotification("입찰이 성공적으로 완료되었습니다.", "success");
      setBidAmount({ ...bidAmount, [auctionId]: "" });
    } catch (error) {
      logger.error("[Auction Bid] 입찰 오류:", error);
      showNotification(`입찰 실패: ${error.message}`, "error");

      // 실패 시 롤백
      if (optimisticUpdate) {
        optimisticUpdate({ cash: amount });
      }
    }
  };

  const handleCreateAuction = async (e) => {
    e.preventDefault();
    if (!currentUserId || !classCode || !firebaseUser) {
      showNotification("로그인이 필요하거나 학급 또는 사용자 정보가 없습니다.", "error");
      return;
    }
    if (typeof updateUserItemQuantity !== "function") {
      showNotification("아이템 상태 업데이트 기능을 사용할 수 없습니다.", "error");
      return;
    }
    if (!selectedAssetForAuction || !newAuction.assetId || newAuction.assetType !== "item") {
      showNotification("경매에 등록할 아이템을 선택해주세요.", "error");
      return;
    }
    const startPrice = parseFloat(newAuction.startPrice);
    if (isNaN(startPrice) || startPrice <= 0) {
      showNotification("유효한 시작가를 입력해주세요.", "error");
      return;
    }
    const durationHours = parseInt(newAuction.duration, 10);
    if (isNaN(durationHours) || durationHours < 1 || durationHours > 24) {
      showNotification("유효한 경매 기간(1-24시간)을 선택해주세요.", "error");
      return;
    }

    let itemDeducted = false;
    try {
      const itemUpdateResult = await updateUserItemQuantity(newAuction.assetId, -1);
      if (!itemUpdateResult || (typeof itemUpdateResult === "object" && !itemUpdateResult.success)) {
        throw new Error(itemUpdateResult?.error || "아이템 수량 변경에 실패했습니다.");
      }
      itemDeducted = true;

      const auctionsRef = collection(db, "classes", classCode, "auctions");
      const endTime = new Date(Date.now() + durationHours * 60 * 60 * 1000);

      await addDoc(auctionsRef, {
        assetId: newAuction.assetId,
        assetType: newAuction.assetType,
        name: newAuction.name,
        description: newAuction.description,
        startPrice: startPrice,
        currentBid: startPrice,
        bidCount: 0,
        endTime: Timestamp.fromDate(endTime),
        highestBidder: null,
        seller: currentUserId,
        sellerName: currentUserName,
        status: "ongoing",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        classCode: classCode,
        itemIcon: selectedAssetForAuction.icon || "📦",
        // --- 버그 수정을 위해 추가된 필드 ---
        assetSourceCollection: selectedAssetForAuction.source || 'inventory',
        originalStoreItemId: selectedAssetForAuction.itemId, // 아이템 종류를 식별하기 위한 고유 ID
      });

      setNewAuction({
        assetId: null, assetType: "item", name: "", description: "",
        startPrice: "", duration: "1",
      });
      setSelectedAssetForAuction(null);
      showNotification("경매가 성공적으로 등록되었습니다.", "success");
      setActiveTab("myAuctions");
    } catch (error) {
      logger.error("[Auction Create] 경매 생성 오류:", error);
      showNotification(`경매 등록 실패: ${error.message}`, "error");
      if (itemDeducted && newAuction.assetId && typeof updateUserItemQuantity === "function") {
        await updateUserItemQuantity(newAuction.assetId, 1);
        logger.log("[Auction Create Error] 아이템 수량 롤백 성공:", newAuction.assetId);
      }
    }
  };

  const handleCancelAuction = async (auctionId) => {
    if (!currentUserId || !classCode) return;
    if (typeof updateUserItemQuantity !== "function") {
      showNotification("아이템 상태 업데이트 기능을 사용할 수 없습니다.", "error");
      return;
    }

    const auctionRef = doc(db, "classes", classCode, "auctions", auctionId);
    const auction = auctions.find((a) => a.id === auctionId);

    if (!auction || auction.seller !== currentUserId) {
      showNotification("취소 권한이 없거나 존재하지 않는 경매입니다.", "error");
      return;
    }
    if (auction.status !== "ongoing") {
      showNotification("진행 중인 경매만 취소할 수 있습니다.", "info");
      return;
    }

    try {
      const auctionDocSnap = await getDoc(auctionRef);
      if (!auctionDocSnap.exists()) {
        showNotification("경매 정보를 Firestore에서 찾을 수 없습니다.", "error");
        return;
      }
      const firestoreAuctionData = auctionDocSnap.data();

      if (firestoreAuctionData.status !== "ongoing") {
        showNotification("이미 처리된 경매는 취소할 수 없습니다 (Firestore 확인).", "info");
        return;
      }
      if (firestoreAuctionData.bidCount > 0) {
        showNotification("입찰이 진행된 경매는 취소할 수 없습니다 (Firestore 확인).", "error");
        return;
      }

      // 아이템 반환 로직을 updateUserItemQuantity를 사용하도록 수정하지 않고,
      // settleAuction과 동일한 강력한 로직을 사용하기 위해 트랜잭션으로 처리합니다.
      const returnCollection = firestoreAuctionData.assetSourceCollection || 'inventory';
      const sellerItemRef = doc(db, "users", firestoreAuctionData.seller, returnCollection, firestoreAuctionData.assetId);

      await runTransaction(db, async (transaction) => {
        const sellerItemDoc = await transaction.get(sellerItemRef);
        if (sellerItemDoc.exists()) {
          transaction.update(sellerItemRef, { quantity: increment(1) });
        } else {
          transaction.set(sellerItemRef, {
            itemId: firestoreAuctionData.originalStoreItemId,
            name: firestoreAuctionData.name,
            icon: firestoreAuctionData.itemIcon,
            description: firestoreAuctionData.description,
            quantity: 1,
            type: "item",
          });
        }
        transaction.delete(auctionRef);
      });

      showNotification("경매가 취소되었습니다.", "success");
      if (itemsContext.fetchUserItems) itemsContext.fetchUserItems();

    } catch (error) {
      logger.error("[Auction Cancel] 경매 취소 오류:", error);
      showNotification(`경매 취소 실패: ${error.message}`, "error");
    }
  };

  // --- [신규] 관리자용 경매 강제 취소 함수 ---
  const handleAdminCancelAuction = async (auction) => {
    if (!authContext.isAdmin()) {
      showNotification("관리자 권한이 없습니다.", "error");
      return;
    }
    if (!classCode || !auction || auction.status !== 'ongoing') {
      showNotification("진행 중인 경매만 취소할 수 있습니다.", "error");
      return;
    }
    if (!window.confirm(`[관리자] '${auction.name}' 경매를 강제로 취소하고 아이템을 판매자에게 반환하시겠습니까? 입찰금이 있다면 최고 입찰자에게 환불됩니다.`)) {
      return;
    }

    const auctionRef = doc(db, "classes", classCode, "auctions", auction.id);
    logger.log(`[Admin Cancel] 관리자 취소 시도: ${auction.id}`);

    try {
      await runTransaction(db, async (transaction) => {
        const auctionDoc = await transaction.get(auctionRef);
        if (!auctionDoc.exists() || auctionDoc.data().status !== 'ongoing') {
          throw new Error("경매가 이미 처리되었거나 삭제되었습니다.");
        }
        const auctionData = auctionDoc.data();

        // 1. 최고 입찰자가 있으면 입찰금 환불
        if (auctionData.highestBidder && auctionData.currentBid > 0) {
          const bidderRef = doc(db, "users", auctionData.highestBidder);
          transaction.update(bidderRef, {
            cash: increment(auctionData.currentBid),
            updatedAt: serverTimestamp(),
          });
        }

        // 2. 판매자에게 아이템 반환 (settleAuction의 유찰 로직과 동일)
        const returnCollection = auctionData.assetSourceCollection || 'inventory';
        const sellerItemRef = doc(db, "users", auctionData.seller, returnCollection, auctionData.assetId);
        const sellerItemDoc = await transaction.get(sellerItemRef);

        if (sellerItemDoc.exists()) {
          transaction.update(sellerItemRef, { quantity: increment(1) });
        } else {
          transaction.set(sellerItemRef, {
            itemId: auctionData.originalStoreItemId,
            name: auctionData.name,
            icon: auctionData.itemIcon || "📦",
            description: auctionData.description,
            quantity: 1,
            type: "item",
          });
        }

        // 3. 경매 문서 삭제
        transaction.delete(auctionRef);
      });

      showNotification(`'${auction.name}' 경매가 관리자에 의해 취소되었습니다.`, "success");
      if (itemsContext.fetchUserItems) itemsContext.fetchUserItems();
      if (authContext.fetchAllUsers) authContext.fetchAllUsers(true);

    } catch (error) {
      logger.error("[Admin Cancel] 관리자 경매 취소 오류:", error);
      showNotification(`관리자 취소 실패: ${error.message}`, "error");
    }
  };


  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "startPrice" && value && !/^\d*\.?\d*$/.test(value)) {
      return;
    }
    setNewAuction({ ...newAuction, [name]: value });
  };

  const handleSelectAssetForAuction = (event) => {
    const selectedId = event.target.value;
    if (!selectedId) {
      setSelectedAssetForAuction(null);
      return;
    }
    const foundItem = inventoryItems.find((i) => i.id === selectedId);
    if (foundItem) {
      if (!foundItem.type || foundItem.type !== "item") {
        showNotification("선택된 자산 정보에 타입 속성이 없거나 아이템이 아닙니다.", "error");
        setSelectedAssetForAuction(null);
        return;
      }
      setSelectedAssetForAuction(foundItem);
    } else {
      showNotification("선택한 ID에 해당하는 아이템을 찾을 수 없습니다.", "error");
      setSelectedAssetForAuction(null);
    }
  };

  const handleBidAmountChange = (e, auctionId) => {
    const value = e.target.value;
    if (value === "" || /^\d+$/.test(value)) {
      setBidAmount({ ...bidAmount, [auctionId]: value });
    }
  };

  // --- 로딩 및 사용자/학급 코드 확인 ---
  if (authLoading || itemsLoading) {
    return <AlchanLoading />;
  }
  if (!firebaseUser || !currentUserId) {
    return <div className="login-required-container">경매장을 이용하려면 로그인이 필요합니다.</div>;
  }
  if (!userDoc) {
    return <AlchanLoading />;
  }
  if (!classCode) {
    return <div className="login-required-container">경매장을 이용하려면 학급 코드가 사용자 정보에 설정되어 있어야 합니다. (학급 코드: 없음)</div>;
  }
  if (auctionsLoading) {
    return <AlchanLoading />;
  }

  const durationOptions = [];
  for (let i = 1; i <= 24; i++) {
    durationOptions.push(<option key={i} value={i}>{i}시간</option>);
  }

  const availableItems = inventoryItems.filter(
    (item) => item.quantity >= 1 && item.type === "item"
  );

  return (
    <div className="auction-container">
      {notification && (
        <div className={`notification notification-${notification.type}`}>{notification.message}</div>
      )}

      <header className="auction-header">
        <h1>경매장 (학급: {classCode || "정보 없음"})</h1>
        <div className="auction-balance">
          <span>보유 금액: </span>
          <span className="balance-amount">{formatPrice(balance)}</span>
        </div>
      </header>

      <nav className="tab-container">
        <button className={`tab ${activeTab === "ongoing" ? "active" : ""}`} onClick={() => setActiveTab("ongoing")}>진행중</button>
        <button className={`tab ${activeTab === "myAuctions" ? "active" : ""}`} onClick={() => setActiveTab("myAuctions")}>내 경매</button>
        <button className={`tab ${activeTab === "myBids" ? "active" : ""}`} onClick={() => setActiveTab("myBids")}>내 입찰</button>
        <button className={`tab ${activeTab === "completed" ? "active" : ""}`} onClick={() => setActiveTab("completed")}>종료됨</button>
        <button className={`tab register-tab ${activeTab === "register" ? "active" : ""}`} onClick={() => setActiveTab("register")}>경매 등록</button>
      </nav>

      <main className="tab-content">
        {activeTab === "ongoing" && (
          <div className="ongoing-auctions-content">
            <div className="search-bar">
              <input type="text" placeholder="경매 물품 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="경매 물품 검색" />
              <button onClick={() => setSearchTerm("")} className="search-reset-button" aria-label="검색어 초기화">{searchTerm ? "초기화" : "검색"}</button>
            </div>
            {ongoingAuctions.length > 0 ? (
              <div className="auctions-grid">
                {ongoingAuctions.map((auction) => (
                  <article key={auction.id} className="auction-card">
                    <div className="auction-info">
                      <header className="card-header">
                        <h3><span style={{ marginRight: "5px" }}>{auction.itemIcon || "📦"}</span>{auction.name}</h3>
                        <span className={`time-left-badge ${!(auction.endTime instanceof Date) || isNaN(auction.endTime.getTime()) ? "error" : ""}`} title={auction.endTime instanceof Date ? auction.endTime.toLocaleString() : "종료 시간 정보 없음"}>
                          {getTimeLeft(auction.endTime)}
                        </span>
                      </header>
                      <p className="auction-description">{auction.description || "설명 없음"}</p>
                      <div className="auction-price-details">
                        <p>시작가: <span className="price start-price">{formatPrice(auction.startPrice)}</span></p>
                        <p>현재가: <span className="price current-price">{formatPrice(auction.currentBid)}</span></p>
                      </div>
                      <p className="auction-meta">
                        <span>입찰: {auction.bidCount}회</span> | <span>판매자: {auction.seller === currentUserId ? "나" : auction.sellerName || auction.seller?.substring(0, 6)}</span>
                      </p>
                      {auction.highestBidder === currentUserId && auction.seller !== currentUserId && (
                        <p className="bid-status-indicator highest">현재 최고 입찰자입니다!</p>
                      )}
                    </div>

                    {/* --- 사용자 입찰 영역 --- */}
                    {auction.seller !== currentUserId && auction.status === "ongoing" && auction.endTime instanceof Date && auction.endTime > currentTime && (
                      <footer className="auction-actions">
                        <div className="bid-input-group">
                          <input type="text" inputMode="numeric" pattern="[0-9]*" className="bid-input" placeholder={`${formatPrice(auction.currentBid + 1)} 이상`} value={bidAmount[auction.id] || ""} onChange={(e) => handleBidAmountChange(e, auction.id)} aria-label={`${auction.name} 입찰 금액`} />
                          <button className="bid-button" onClick={() => handleBid(auction.id)} disabled={!bidAmount[auction.id] || isNaN(parseInt(bidAmount[auction.id] || "0", 10)) || parseInt(bidAmount[auction.id] || "0", 10) <= auction.currentBid}>입찰</button>
                        </div>
                      </footer>
                    )}

                    {/* --- 내 경매 물품 표시 --- */}
                    {auction.seller === currentUserId && auction.status === "ongoing" && (
                      <footer className="auction-actions owner-notice">
                        <span>내 경매 물품</span>
                      </footer>
                    )}

                    {/* --- [신규] 관리자 취소 버튼 --- */}
                    {authContext.isAdmin() && auction.status === 'ongoing' && (
                      <footer className="auction-actions admin-actions">
                        <button
                          className="action-button admin-cancel-button"
                          onClick={() => handleAdminCancelAuction(auction)}
                        >
                          관리자 취소
                        </button>
                      </footer>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="no-results-message">{searchTerm ? "검색 결과가 없습니다." : "현재 진행 중인 경매가 없습니다."}</div>
            )}
          </div>
        )}
        {activeTab === "myAuctions" && (
          <div className="my-auctions-content">
            <h2>내 경매 물품</h2>
            {myAuctions.length > 0 ? (
              <div className="list-view">
                {myAuctions.map((auction) => (
                  <article key={auction.id} className="list-item my-auction-item">
                    <div className="item-info">
                      <h3><span style={{ marginRight: "5px" }}>{auction.itemIcon || "📦"}</span>{auction.name}</h3>
                      <p className="item-description">{auction.description || "설명 없음"}</p>
                      <div className="price-details">
                        <span>시작가: {formatPrice(auction.startPrice)}</span>
                        <span>현재가: {formatPrice(auction.currentBid)}</span>
                      </div>
                      <p className="meta-details">
                        <span>입찰: {auction.bidCount}회</span> | <span>남은 시간: {getTimeLeft(auction.endTime)}</span>
                      </p>
                      <p className={`status-indicator ${auction.status === "ongoing" ? "ongoing" : "completed"}`}>
                        상태: {auction.status === "ongoing" ? "진행 중" : auction.highestBidder ? "판매 완료" : "유찰됨"}
                        {auction.status === 'error' && <span className="error-text">(오류)</span>}
                      </p>
                      {auction.highestBidder && (<p className="highest-bidder-info">최고 입찰자: {auction.highestBidder === currentUserId ? "나" : allUsersData?.find((u) => u.id === auction.highestBidder)?.name || auction.highestBidder?.substring(0, 6)}</p>)}
                    </div>
                    <div className="item-actions">
                      {auction.status === "ongoing" && auction.bidCount === 0 && auction.seller === currentUserId && (<button className="action-button cancel-button" onClick={() => handleCancelAuction(auction.id)}>등록 취소</button>)}
                      {auction.status === "ongoing" && auction.bidCount > 0 && (<span className="action-status-text">입찰 진행 중</span>)}

                      {/* --- [신규] 관리자 취소 버튼 (내 경매 탭) --- */}
                      {authContext.isAdmin() && auction.status === 'ongoing' && (
                        <button
                          className="action-button admin-cancel-button"
                          onClick={() => handleAdminCancelAuction(auction)}
                        >
                          관리자 취소
                        </button>
                      )}

                      {auction.status === "completed" && auction.highestBidder && (<span className="action-status-text sold">판매 완료</span>)}
                      {auction.status === "completed" && !auction.highestBidder && (<span className="action-status-text unsold">유찰됨</span>)}
                      {auction.status === "error" && (<span className="action-status-text error">오류 발생</span>)}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="no-results-message">
                <p>등록한 경매 물품이 없습니다.</p>
                <button className="action-button primary" onClick={() => setActiveTab("register")}>경매 등록하기</button>
              </div>
            )}
          </div>
        )}
        {/* '내 입찰', '종료됨', '경매 등록' 탭의 JSX는 기존과 동일하게 유지됩니다. */}
        {/* ... (기존 JSX 코드 복사) ... */}
        {activeTab === "myBids" && (
          <div className="my-bids-content">
            <h2>내 입찰 현황</h2>
            {myBids.length > 0 ? (
              <div className="list-view">
                {myBids.map((auction) => (
                  <article key={auction.id} className={`list-item my-bid-item ${auction.highestBidder === currentUserId ? "status-highest" : "status-outbid"}`}>
                    <div className="item-info">
                      <h3><span style={{ marginRight: "5px" }}>{auction.itemIcon || "📦"}</span>{auction.name}</h3>
                      <p className="item-description">{auction.description || "설명 없음"}</p>
                      <p className="bid-info">내 최고 입찰가: <span className="price">{formatPrice(auction.currentBid)}</span></p>
                      <p className="meta-details">
                        <span>남은 시간: {getTimeLeft(auction.endTime)}</span> | <span>판매자: {auction.seller === currentUserId ? "나" : auction.sellerName || auction.seller?.substring(0, 6)}</span>
                      </p>
                      <p className="status-indicator">
                        상태:
                        {auction.status === "completed" ? (
                          auction.highestBidder === currentUserId ? (<span className="won">낙찰 완료</span>) : (<span className="lost">패찰</span>)
                        ) : auction.highestBidder === currentUserId ? (<span className="highest">최고 입찰 중</span>) : (<span className="outbid">상회 입찰됨</span>)}
                      </p>
                    </div>
                    {auction.status === "ongoing" && auction.highestBidder !== currentUserId && (
                      <div className="item-actions rebid-section">
                        <input type="text" inputMode="numeric" pattern="[0-9]*" className="bid-input small" placeholder={`${formatPrice(auction.currentBid + 1)} 이상`} value={bidAmount[auction.id] || ""} onChange={(e) => handleBidAmountChange(e, auction.id)} aria-label={`${auction.name} 재입찰 금액`} />
                        <button className="action-button rebid-button" onClick={() => handleBid(auction.id)} disabled={!bidAmount[auction.id] || isNaN(parseInt(bidAmount[auction.id] || "0", 10)) || parseInt(bidAmount[auction.id] || "0", 10) <= auction.currentBid}>재입찰</button>
                      </div>
                    )}
                    {auction.status === "ongoing" && auction.highestBidder === currentUserId && (<div className="item-actions highest-bid-notice"><span>최고 입찰자</span></div>)}
                    {auction.status === "completed" && (<div className="item-actions"><span className={`action-status-text ${auction.highestBidder === currentUserId ? "won" : "lost"}`}>{auction.highestBidder === currentUserId ? "낙찰" : "패찰"}</span></div>)}
                  </article>
                ))}
              </div>
            ) : (
              <div className="no-results-message">
                <p>입찰한 경매가 없습니다.</p>
                <button className="action-button primary" onClick={() => setActiveTab("ongoing")}>경매 둘러보기</button>
              </div>
            )}
          </div>
        )}
        {activeTab === "completed" && (
          <div className="completed-auctions-content">
            <h2>종료된 경매</h2>
            {completedAuctions.length > 0 ? (
              <div className="list-view">
                {completedAuctions.map((auction) => (
                  <article key={auction.id} className={`list-item completed-item ${auction.highestBidder === currentUserId ? "result-won" : ""} ${auction.seller === currentUserId ? "result-sold" : ""} ${!auction.highestBidder ? "result-unsold" : ""}`}>
                    <div className="item-info">
                      <h3><span style={{ marginRight: "5px" }}>{auction.itemIcon || "📦"}</span>{auction.name}</h3>
                      <p className="item-description">{auction.description || "설명 없음"}</p>
                      <p className="final-result">
                        {auction.status === 'error' ? `오류 발생: ${auction.error || '알 수 없는 오류'}` :
                          auction.highestBidder ? `최종 낙찰가: ${formatPrice(auction.currentBid)}` : `유찰됨 (시작가: ${formatPrice(auction.startPrice)})`}
                      </p>
                      <p className="meta-details">
                        <span>총 입찰: {auction.bidCount}회</span> | <span>판매자: {auction.seller === currentUserId ? "나" : auction.sellerName || auction.seller?.substring(0, 6)}</span>
                      </p>
                      {auction.highestBidder && (<p className="winner-info">낙찰자: {auction.highestBidder === currentUserId ? "나" : allUsersData?.find((u) => u.id === auction.highestBidder)?.name || auction.highestBidder?.substring(0, 6)}</p>)}
                      {!auction.highestBidder && auction.status !== 'error' && (<p className="status-indicator unsold">유찰됨</p>)}
                    </div>
                    <div className="item-actions result-badge">
                      {auction.highestBidder === currentUserId && (<span className="badge won">낙찰 받음</span>)}
                      {auction.seller === currentUserId && auction.highestBidder && (<span className="badge sold">판매 완료</span>)}
                      {auction.seller === currentUserId && !auction.highestBidder && (<span className="badge unsold">유찰됨</span>)}
                      {auction.seller !== currentUserId && auction.highestBidder !== currentUserId && auction.highestBidder && (<span className="badge neutral">종료됨</span>)}
                      {auction.seller !== currentUserId && auction.highestBidder !== currentUserId && !auction.highestBidder && (<span className="badge unsold">유찰됨</span>)}
                      {auction.status === 'error' && (<span className="badge error">오류</span>)}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="no-results-message"><p>종료된 경매가 없습니다.</p></div>
            )}
          </div>
        )}
        {activeTab === "register" && (
          <div className="register-auction-content">
            <h2>경매 물품 등록</h2>
            <form className="auction-form" onSubmit={handleCreateAuction}>
              <div className="form-group">
                <label htmlFor="auctionAssetSelect">등록할 아이템 선택 *</label>
                <select id="auctionAssetSelect" name="auctionAssetSelect" className="form-control" value={selectedAssetForAuction ? selectedAssetForAuction.id : ""} onChange={handleSelectAssetForAuction} required aria-describedby="assetSelectHint">
                  <option value="">-- 보유 아이템 목록 --</option>
                  {availableItems.length > 0 && (
                    <optgroup label="아이템 (수량 1개 이상)">
                      {availableItems.map((item) => (
                        <option key={`item-${item.id}`} value={item.id}>
                          {item.icon} {item.name} (수량: {item.quantity})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {availableItems.length === 0 && (<p id="assetSelectHint" className="form-hint error">경매에 등록할 수 있는 아이템(수량 1개 이상)이 없습니다.</p>)}
              </div>
              <div className="form-group">
                <label htmlFor="name">물품명</label>
                <input type="text" id="name" name="name" className="form-control" placeholder="등록할 아이템을 선택하세요" value={newAuction.name} readOnly aria-label="선택된 물품명" />
              </div>
              <div className="form-group">
                <label htmlFor="description">물품 설명</label>
                <textarea id="description" name="description" className="form-control" rows="3" placeholder="자동 입력된 설명을 수정할 수 있습니다." value={newAuction.description} onChange={handleInputChange} aria-label="물품 설명" />
              </div>
              <div className="form-group">
                <label htmlFor="startPrice">시작가 (원) *</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" id="startPrice" name="startPrice" className="form-control" placeholder="경매 시작가를 숫자로 입력 (예: 10000)" value={newAuction.startPrice} onChange={handleInputChange} required aria-required="true" aria-label="경매 시작가" />
              </div>
              <div className="form-group">
                <label htmlFor="duration">경매 기간 *</label>
                <select id="duration" name="duration" className="form-control" value={newAuction.duration} onChange={handleInputChange} required aria-required="true" aria-label="경매 기간 선택">
                  {durationOptions}
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" className="action-button primary register-button" disabled={!selectedAssetForAuction || !newAuction.startPrice || isNaN(parseFloat(newAuction.startPrice)) || parseFloat(newAuction.startPrice) <= 0 || !newAuction.duration || selectedAssetForAuction.type !== "item"}>경매 등록</button>
                <button type="button" className="action-button cancel-button" onClick={() => { setSelectedAssetForAuction(null); setActiveTab("ongoing"); }}>취소</button>
              </div>
            </form>
          </div>
        )}
      </main>

      <style>{`
        /* --- Cyberpunk Dark Theme Styles --- */

        /* Admin Buttons */
        .action-button.admin-cancel-button {
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(139, 92, 246, 0.1));
            color: #a78bfa;
            border: 1px solid rgba(139, 92, 246, 0.5);
        }
        .action-button.admin-cancel-button:hover {
            background: rgba(139, 92, 246, 0.4);
            box-shadow: 0 0 15px rgba(139, 92, 246, 0.3);
        }

        .auction-actions.admin-actions {
            background-color: rgba(139, 92, 246, 0.1);
            border-top: 1px solid rgba(139, 92, 246, 0.3);
            padding: 10px 15px;
        }

        .badge.error {
            background-color: rgba(239, 68, 68, 0.8);
        }
        .action-status-text.error {
          color: #f87171;
          background-color: rgba(239, 68, 68, 0.1);
          font-weight: 600;
        }
        .error-text {
            color: #f87171;
            font-weight: bold;
            margin-left: 5px;
        }
        .completed-item .final-result {
            font-size: 1em;
            font-weight: 600;
            margin-bottom: 8px;
            word-break: break-all;
        }

        /* --- Global & Layout - Dark Theme --- */
        .auction-container {
          font-family: "Rajdhani", "Noto Sans KR", sans-serif;
          max-width: 1200px;
          margin: 0 auto;
          padding: 15px;
          color: #e2e8f0;
          background-color: transparent;
        }
        .loading-container, .login-required-container {
          text-align: center;
          padding: 40px 20px;
          font-size: 1.1em;
          color: #94a3b8;
        }
        .auction-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid rgba(0, 255, 242, 0.2);
        }
        .auction-header h1 {
          font-size: 1.8em;
          font-weight: 600;
          color: #00fff2;
          text-shadow: 0 0 10px rgba(0, 255, 242, 0.3);
          margin: 0;
        }
        .auction-balance {
          background: rgba(0, 255, 242, 0.1);
          border: 1px solid rgba(0, 255, 242, 0.3);
          padding: 8px 15px;
          border-radius: 15px;
          font-size: 0.95em;
          color: #e2e8f0;
        }
        .auction-balance .balance-amount {
          font-weight: 600;
          color: #00fff2;
          text-shadow: 0 0 5px rgba(0, 255, 242, 0.5);
          margin-left: 5px;
        }

        /* --- Tabs - Dark Theme --- */
        .tab-container {
          display: flex;
          flex-wrap: wrap;
          margin-bottom: 25px;
          border-bottom: 2px solid rgba(255, 255, 255, 0.1);
          gap: 8px;
        }
        .tab {
          padding: 10px 18px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          font-size: 1em;
          font-weight: 500;
          color: #94a3b8;
          transition: all 0.2s ease;
          white-space: nowrap;
          position: relative;
          top: 2px;
        }
        .tab:hover {
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.05);
        }
        .tab.active {
          color: #00fff2;
          font-weight: 600;
          border-bottom-color: #00fff2;
          text-shadow: 0 0 5px rgba(0, 255, 242, 0.3);
        }

        /* --- Search Bar - Dark Theme --- */
        .search-bar { display: flex; margin-bottom: 25px; gap: 8px; }
        .search-bar input[type="text"] {
          flex-grow: 1;
          padding: 10px 15px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          font-size: 1em;
          background: rgba(20, 20, 35, 0.8);
          color: #e2e8f0;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .search-bar input[type="text"]:focus {
          border-color: #00fff2;
          box-shadow: 0 0 0 2px rgba(0, 255, 242, 0.2);
          outline: none;
        }
        .search-reset-button {
          padding: 10px 18px;
          background: rgba(100, 116, 139, 0.3);
          border: 1px solid rgba(100, 116, 139, 0.5);
          color: #e2e8f0;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          font-weight: 500;
          transition: all 0.2s;
        }
        .search-reset-button:hover {
          background: rgba(100, 116, 139, 0.5);
        }

        /* --- Grid & Card Styles - Dark Theme --- */
        .auctions-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .auction-card {
          background: rgba(20, 20, 35, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
          overflow: hidden;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          backdrop-filter: blur(10px);
        }
        .auction-card:hover {
          transform: translateY(-4px);
          border-color: rgba(0, 255, 242, 0.3);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4), 0 0 15px rgba(0, 255, 242, 0.1);
        }
        .auction-info { padding: 15px; flex-grow: 1; display: flex; flex-direction: column; }
        .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .card-header h3 {
          font-size: 1.15em;
          font-weight: 600;
          color: #fff;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: calc(100% - 85px);
          display: flex;
          align-items: center;
        }
        .time-left-badge {
          background: rgba(0, 255, 242, 0.1);
          border: 1px solid rgba(0, 255, 242, 0.3);
          color: #00fff2;
          padding: 3px 8px;
          border-radius: 10px;
          font-size: 0.8em;
          font-weight: 500;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .auction-description { color: #94a3b8; font-size: 0.9em; line-height: 1.5; margin-bottom: 12px; }
        .auction-price-details {
          display: flex;
          justify-content: space-between;
          font-size: 0.9em;
          margin-bottom: 8px;
          color: #94a3b8;
          background: rgba(0, 0, 0, 0.2);
          padding: 10px;
          border-radius: 8px;
        }
        .auction-price-details .price { font-weight: 600; }
        .auction-price-details .current-price { color: #fbbf24; text-shadow: 0 0 5px rgba(251, 191, 36, 0.3); }
        .auction-meta { font-size: 0.85em; color: #64748b; margin-bottom: 10px; }
        .bid-status-indicator.highest {
          color: #34d399;
          font-weight: 600;
          font-size: 0.9em;
          margin-top: auto;
          background: rgba(16, 185, 129, 0.1);
          padding: 8px;
          border-radius: 6px;
          text-align: center;
        }
        .auction-actions {
          padding: 12px 15px;
          background: rgba(0, 0, 0, 0.3);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .owner-notice {
          text-align: center;
          font-size: 0.9em;
          color: #00fff2;
          font-weight: 500;
        }
        .bid-input-group { display: flex; gap: 8px; }
        .bid-input {
          flex-grow: 1;
          padding: 8px 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.3);
          color: #e2e8f0;
          border-radius: 6px;
          font-size: 0.9em;
        }
        .bid-input:focus {
          outline: none;
          border-color: #00fff2;
          box-shadow: 0 0 0 2px rgba(0, 255, 242, 0.2);
        }
        .bid-button {
          padding: 8px 15px;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(16, 185, 129, 0.1));
          border: 1px solid rgba(16, 185, 129, 0.5);
          color: #34d399;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          font-weight: 600;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .bid-button:hover:not(:disabled) {
          background: rgba(16, 185, 129, 0.4);
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
        }
        .bid-button:disabled {
          background: rgba(75, 85, 99, 0.3);
          border-color: rgba(75, 85, 99, 0.5);
          color: #64748b;
          cursor: not-allowed;
        }

        /* --- List View Styles - Dark Theme --- */
        .my-auctions-content h2, .my-bids-content h2, .completed-auctions-content h2 {
          font-size: 1.5em;
          color: #00fff2;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(0, 255, 242, 0.2);
          text-shadow: 0 0 10px rgba(0, 255, 242, 0.3);
        }
        .list-view { display: flex; flex-direction: column; gap: 15px; }
        .list-item {
          background: rgba(20, 20, 35, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          display: flex;
          align-items: center;
          padding: 15px;
          transition: all 0.2s ease;
          border-left: 4px solid transparent;
        }
        .list-item:hover {
          border-color: rgba(0, 255, 242, 0.3);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }
        .list-item .item-info { flex-grow: 1; padding-right: 15px; }
        .list-item h3 {
          font-size: 1.1em;
          font-weight: 600;
          color: #fff;
          margin: 0 0 5px 0;
          display: flex;
          align-items: center;
        }
        .list-item .item-description { font-size: 0.9em; color: #94a3b8; margin-bottom: 8px; }
        .list-item .price-details, .list-item .meta-details { font-size: 0.85em; color: #64748b; margin-bottom: 5px; }
        .list-item .bid-info .price { color: #00fff2; font-weight: 600; }
        .list-item .status-indicator { font-size: 0.9em; font-weight: 500; margin-top: 8px; }
        .list-item .status-indicator .won, .list-item .status-indicator .highest { color: #34d399; font-weight: 600; }
        .list-item .status-indicator .outbid { color: #fbbf24; font-weight: 600; }
        .list-item .item-actions { flex-shrink: 0; display: flex; align-items: center; gap: 10px; }

        /* --- Action Buttons (공통) - Dark Theme --- */
        .action-button {
          padding: 8px 15px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          font-weight: 500;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .action-button.primary {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.1));
          border: 1px solid rgba(59, 130, 246, 0.5);
          color: #60a5fa;
        }
        .action-button.primary:hover {
          background: rgba(59, 130, 246, 0.4);
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
        }
        .action-button.cancel-button {
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(239, 68, 68, 0.1));
          border: 1px solid rgba(239, 68, 68, 0.5);
          color: #f87171;
        }
        .action-button.cancel-button:hover {
          background: rgba(239, 68, 68, 0.4);
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.3);
        }
        .action-button.rebid-button {
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(251, 191, 36, 0.1));
          border: 1px solid rgba(251, 191, 36, 0.5);
          color: #fbbf24;
        }
        .action-button.rebid-button:hover {
          background: rgba(251, 191, 36, 0.4);
          box-shadow: 0 0 15px rgba(251, 191, 36, 0.3);
        }

        /* --- Status Text/Badge - Dark Theme --- */
        .action-status-text {
          font-size: 0.9em;
          font-weight: 500;
          padding: 5px 10px;
          border-radius: 4px;
        }
        .action-status-text.sold {
          color: #60a5fa;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.3);
        }
        .action-status-text.unsold {
          color: #f87171;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .badge {
          font-size: 0.8em;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 12px;
          color: white;
        }
        .badge.won { background: linear-gradient(135deg, #10b981, #059669); }
        .badge.sold { background: linear-gradient(135deg, #3b82f6, #2563eb); }
        .badge.unsold { background: linear-gradient(135deg, #ef4444, #dc2626); }
        .badge.neutral { background: linear-gradient(135deg, #6b7280, #4b5563); }

        /* --- My Bids Specific --- */
        .my-bid-item.status-highest { border-left-color: #10b981; }
        .my-bid-item.status-outbid { border-left-color: #f59e0b; }

        /* --- Completed Auctions Specific --- */
        .completed-item.result-won { border-left-color: #10b981; }
        .completed-item.result-sold { border-left-color: #3b82f6; }
        .completed-item.result-unsold { border-left-color: #ef4444; }

        /* --- Auction Form Styles - Dark Theme --- */
        .register-auction-content h2 {
          font-size: 1.5em;
          color: #00fff2;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(0, 255, 242, 0.2);
          text-shadow: 0 0 10px rgba(0, 255, 242, 0.3);
        }
        .auction-form {
          background: rgba(20, 20, 35, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 25px;
          border-radius: 12px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
          max-width: 650px;
          margin: 0 auto;
          backdrop-filter: blur(10px);
        }
        .form-group { margin-bottom: 20px; }
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #e2e8f0;
        }
        .form-control {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.3);
          color: #e2e8f0;
          border-radius: 6px;
          font-size: 1em;
        }
        .form-control:focus {
          outline: none;
          border-color: #00fff2;
          box-shadow: 0 0 0 2px rgba(0, 255, 242, 0.2);
        }
        .form-control[readOnly] {
          background: rgba(75, 85, 99, 0.3);
          color: #94a3b8;
        }
        .form-actions { display: flex; gap: 15px; margin-top: 30px; }
        .register-button {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(16, 185, 129, 0.1)) !important;
          border: 1px solid rgba(16, 185, 129, 0.5) !important;
          color: #34d399 !important;
        }
        .register-button:hover:not(:disabled) {
          background: rgba(16, 185, 129, 0.4) !important;
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
        }
        .register-button:disabled {
          background: rgba(75, 85, 99, 0.3) !important;
          border-color: rgba(75, 85, 99, 0.5) !important;
          color: #64748b !important;
        }

        /* --- Notification - Dark Theme --- */
        .notification {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          padding: 12px 24px;
          border-radius: 12px;
          color: white;
          animation: fadeInOut 3.5s ease-in-out forwards;
          z-index: 1001;
          backdrop-filter: blur(10px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        }
        .notification.success {
          background: rgba(16, 185, 129, 0.9);
          border: 1px solid rgba(16, 185, 129, 0.5);
        }
        .notification.error {
          background: rgba(239, 68, 68, 0.9);
          border: 1px solid rgba(239, 68, 68, 0.5);
        }
        .notification.info {
          background: rgba(59, 130, 246, 0.9);
          border: 1px solid rgba(59, 130, 246, 0.5);
        }
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translate(-50%, 15px); }
          10% { opacity: 1; transform: translate(-50%, 0); }
          90% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -5px); }
        }

        /* --- No results - Dark Theme --- */
        .no-results-message {
          text-align: center;
          padding: 30px 20px;
          color: #94a3b8;
          background: rgba(20, 20, 35, 0.6);
          border: 1px dashed rgba(255, 255, 255, 0.1);
          border-radius: 12px;
        }

        /* --- Responsive --- */
        @media (max-width: 768px) {
          .auction-header { flex-direction: column; align-items: flex-start; gap: 10px; }
          .auctions-grid { grid-template-columns: 1fr; }
          .list-item { flex-direction: column; align-items: flex-start; }
          .list-item .item-actions { width: 100%; margin-top: 10px; justify-content: flex-end; }
        }
      `}</style>
    </div>
  );
}