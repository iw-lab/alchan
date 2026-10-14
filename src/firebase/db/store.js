import {
  doc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
  increment,
  query as originalFirebaseQuery,
  where as originalFirebaseWhere,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { addActivityLog } from "./users";


// =================================================================
// 인벤토리
// =================================================================
export const addItemToInventory = async (userId, storeItemId, quantity, itemDetails = {}) => {
  if (!db) throw new Error("Firestore is not initialized.");
  if (!userId || !storeItemId || typeof quantity !== "number" || quantity <= 0) {
    throw new Error("사용자 ID, 아이템 ID 또는 수량이 유효하지 않습니다.");
  }
  const inventoryColRef = collection(db, "users", userId, "inventory");
  const q = originalFirebaseQuery(inventoryColRef, originalFirebaseWhere("itemId", "==", storeItemId));
  const querySnapshot = await getDocs(q);
  const itemName = itemDetails.name || "Unknown Item";
  if (!querySnapshot.empty) {
    const inventoryDoc = querySnapshot.docs[0];
    const inventoryItemRef = doc(db, "users", userId, "inventory", inventoryDoc.id);
    await updateDoc(inventoryItemRef, { quantity: increment(quantity), updatedAt: serverTimestamp() });
  } else {
    const newItemRef = doc(inventoryColRef);
    const newItemData = {
      itemId: storeItemId,
      quantity: quantity,
      name: itemName,
      icon: itemDetails.icon || "\u{2753}",
      type: itemDetails.type || "item",
      purchasedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    // 🎰 랜덤뽑기면 추첨 메타도 보존 (MyItems 돌림판 분기 + drawRandomItem 추첨용)
    if (itemDetails.type === "randomDraw") {
      newItemData.drawSource = itemDetails.drawSource || "food";
      newItemData.loseEnabled = itemDetails.loseEnabled === true;
      newItemData.losePercent = Number(itemDetails.losePercent) || 0;
      newItemData.drawCandidates = Array.isArray(itemDetails.drawCandidates)
        ? itemDetails.drawCandidates
        : [];
    }
    await setDoc(newItemRef, newItemData);
  }
  await addActivityLog(userId, "아이템 획득", `${itemName} ${quantity}개를 획득했습니다.`);
  return true;
};


