// localStorage를 사용한 간단한 데이터베이스 모의 구현
// 실제 프로젝트에서는 백엔드 API로 대체되어야 함

// 아이콘 목록 (30개)
const iconList = [
  { id: 1, name: "연필", imageUrl: "/icons/pencil.png" },
  { id: 2, name: "지우개", imageUrl: "/icons/eraser.png" },
  { id: 3, name: "책", imageUrl: "/icons/book.png" },
  { id: 4, name: "컴퓨터", imageUrl: "/icons/computer.png" },
  { id: 5, name: "시계", imageUrl: "/icons/clock.png" },
  { id: 6, name: "달력", imageUrl: "/icons/calendar.png" },
  { id: 7, name: "계산기", imageUrl: "/icons/calculator.png" },
  { id: 8, name: "노트", imageUrl: "/icons/notebook.png" },
  { id: 9, name: "하트", imageUrl: "/icons/heart.png" },
  { id: 10, name: "별", imageUrl: "/icons/star.png" },
  { id: 11, name: "메일", imageUrl: "/icons/mail.png" },
  { id: 12, name: "전화", imageUrl: "/icons/phone.png" },
  { id: 13, name: "카메라", imageUrl: "/icons/camera.png" },
  { id: 14, name: "음악", imageUrl: "/icons/music.png" },
  { id: 15, name: "비디오", imageUrl: "/icons/video.png" },
  { id: 16, name: "지도", imageUrl: "/icons/map.png" },
  { id: 17, name: "문서", imageUrl: "/icons/document.png" },
  { id: 18, name: "폴더", imageUrl: "/icons/folder.png" },
  { id: 19, name: "체크", imageUrl: "/icons/check.png" },
  { id: 20, name: "X표시", imageUrl: "/icons/x-mark.png" },
  { id: 21, name: "화살표", imageUrl: "/icons/arrow.png" },
  { id: 22, name: "검색", imageUrl: "/icons/search.png" },
  { id: 23, name: "설정", imageUrl: "/icons/settings.png" },
  { id: 24, name: "사용자", imageUrl: "/icons/user.png" },
  { id: 25, name: "그룹", imageUrl: "/icons/group.png" },
  { id: 26, name: "클라우드", imageUrl: "/icons/cloud.png" },
  { id: 27, name: "다운로드", imageUrl: "/icons/download.png" },
  { id: 28, name: "업로드", imageUrl: "/icons/upload.png" },
  { id: 29, name: "잠금", imageUrl: "/icons/lock.png" },
  { id: 30, name: "알림", imageUrl: "/icons/notification.png" },
];

// 초기 데이터
const initialData = {
  shopItems: [
    {
      id: 1,
      name: "경험치 부스터",
      function: "1시간 동안 경험치 획득량 50% 증가",
      stock: 5,
      price: 5000,
      priceIncreaseRate: 10,
      iconId: 5, // 시계 아이콘
    },
    {
      id: 2,
      name: "포인트 부스터",
      function: "1시간 동안 포인트 획득량 30% 증가",
      stock: 8,
      price: 3000,
      priceIncreaseRate: 5,
      iconId: 10, // 별 아이콘
    },
    {
      id: 3,
      name: "VIP 배지",
      function: "1일 동안 VIP 상태 활성화",
      stock: 3,
      price: 10000,
      priceIncreaseRate: 15,
      iconId: 9, // 하트 아이콘
    },
    {
      id: 4,
      name: "커스텀 프로필",
      function: "프로필 커스터마이징 옵션 활성화",
      stock: 10,
      price: 2000,
      priceIncreaseRate: 0,
      iconId: 24, // 사용자 아이콘
    },
  ],
  users: {
    user123: {
      id: "user123",
      name: "홍길동",
      email: "hong@example.com",
      points: 15000,
      isAdmin: true,
      items: [
        {
          id: 101,
          name: "경험치 부스터",
          function: "1시간 동안 경험치 획득량 50% 증가",
          isUsed: false,
          usedAt: null,
          iconId: 5,
        },
        {
          id: 102,
          name: "포인트 부스터",
          function: "1시간 동안 포인트 획득량 30% 증가",
          isUsed: false,
          usedAt: null,
          iconId: 10,
        },
      ],
      usedItems: [
        {
          id: 103,
          name: "VIP 배지",
          function: "1일 동안 VIP 상태 활성화",
          isUsed: true,
          usedAt: new Date(Date.now() - 30 * 60000).toISOString(), // 30분 전
          iconId: 9,
        },
      ],
    },
  },
  icons: iconList,
};

// localStorage 초기화
const initializeDatabase = () => {
  if (!localStorage.getItem("database")) {
    localStorage.setItem("database", JSON.stringify(initialData));
  }
};

// 전체 데이터베이스 가져오기
const getDatabase = () => {
  initializeDatabase();
  try {
    return JSON.parse(localStorage.getItem("database"));
  } catch {
    localStorage.removeItem("database");
    initializeDatabase();
    return JSON.parse(localStorage.getItem("database"));
  }
};

// 데이터베이스 업데이트
const updateDatabase = (data) => {
  localStorage.setItem("database", JSON.stringify(data));
};

// 상점 아이템 가져오기
const getShopItems = () => {
  const db = getDatabase();
  return db.shopItems;
};

// 상점 아이템 업데이트
const updateShopItems = (items) => {
  const db = getDatabase();
  db.shopItems = items;
  updateDatabase(db);
};

// 사용자 정보 가져오기
const getUser = (userId) => {
  const db = getDatabase();
  return db.users[userId];
};

// 사용자 정보 업데이트
const updateUser = (user) => {
  const db = getDatabase();
  db.users[user.id] = user;
  updateDatabase(db);
};

// 사용자의 아이템 목록 가져오기
const getUserItems = (userId) => {
  const user = getUser(userId);
  return user ? user.items : [];
};

// 사용자의 사용 중인 아이템 목록 가져오기
const getUserUsedItems = (userId) => {
  const user = getUser(userId);
  return user ? user.usedItems : [];
};

// 모든 아이콘 가져오기
const getAllIcons = () => {
  const db = getDatabase();
  return db.icons || iconList;
};

// 아이콘 정보 가져오기
const getIconById = (iconId) => {
  const icons = getAllIcons();
  return icons.find((icon) => icon.id === iconId) || null;
};

// 아이템 구매
const buyItem = (userId, itemId) => {
  const db = getDatabase();
  const user = db.users[userId];
  const shopItemIndex = db.shopItems.findIndex((item) => item.id === itemId);

  if (shopItemIndex === -1 || !user) {
    return {
      success: false,
      message: "아이템 또는 사용자를 찾을 수 없습니다.",
    };
  }

  const shopItem = db.shopItems[shopItemIndex];

  // 재고 확인
  if (shopItem.stock <= 0) {
    return { success: false, message: "재고가 없습니다." };
  }

  // 포인트 확인
  if (user.points < shopItem.price) {
    return { success: false, message: "포인트가 부족합니다." };
  }

  // 포인트 차감
  user.points -= shopItem.price;

  // 새 아이템 추가
  const newItem = {
    id: Date.now(), // 임시 ID 생성 방법
    name: shopItem.name,
    function: shopItem.function,
    isUsed: false,
    usedAt: null,
    iconId: shopItem.iconId,
  };

  user.items.push(newItem);

  // 재고 감소
  if (shopItem.stock === 1) {
    // 재고가 0이 되면 가격 증가 및 재고 복원
    const newPrice = Math.round(
      shopItem.price * (1 + shopItem.priceIncreaseRate / 100)
    );
    db.shopItems[shopItemIndex] = {
      ...shopItem,
      stock: 10, // 재고 복원
      price: newPrice, // 가격 상승
    };
  } else {
    db.shopItems[shopItemIndex] = {
      ...shopItem,
      stock: shopItem.stock - 1,
    };
  }

  // 데이터베이스 업데이트
  updateDatabase(db);

  return { success: true, item: newItem };
};

// 아이템 사용
const useItem = (userId, itemId) => {
  const db = getDatabase();
  const user = db.users[userId];

  if (!user) {
    return { success: false, message: "사용자를 찾을 수 없습니다." };
  }

  const itemIndex = user.items.findIndex((item) => item.id === itemId);

  if (itemIndex === -1) {
    return { success: false, message: "아이템을 찾을 수 없습니다." };
  }

  const item = user.items[itemIndex];

  // 아이템을 사용 중인 상태로 변경
  const usedItem = {
    ...item,
    isUsed: true,
    usedAt: new Date().toISOString(),
  };

  // 보유 아이템에서 제거
  user.items.splice(itemIndex, 1);

  // 사용 중인 아이템에 추가
  user.usedItems.push(usedItem);

  // 데이터베이스 업데이트
  updateDatabase(db);

  return { success: true, item: usedItem };
};

// 아이템 선물하기
const giftItem = (userId, itemId, recipientId) => {
  const db = getDatabase();
  const sender = db.users[userId];
  const recipient = db.users[recipientId];

  if (!sender || !recipient) {
    return { success: false, message: "사용자를 찾을 수 없습니다." };
  }

  const itemIndex = sender.items.findIndex((item) => item.id === itemId);

  if (itemIndex === -1) {
    return { success: false, message: "아이템을 찾을 수 없습니다." };
  }

  const item = sender.items[itemIndex];

  // 보내는 사람의 아이템에서 제거
  sender.items.splice(itemIndex, 1);

  // 받는 사람의 아이템에 추가
  recipient.items.push(item);

  // 데이터베이스 업데이트
  updateDatabase(db);

  return { success: true };
};

// 관리자: 새 아이템 추가
const addShopItem = (item) => {
  const db = getDatabase();

  const newItem = {
    ...item,
    id: Date.now(), // 임시 ID 생성 방법
  };

  db.shopItems.push(newItem);

  // 데이터베이스 업데이트
  updateDatabase(db);

  return { success: true, item: newItem };
};

// 관리자: 기존 아이템 수정
const updateShopItem = (itemId, updatedData) => {
  const db = getDatabase();
  const itemIndex = db.shopItems.findIndex((item) => item.id === itemId);

  if (itemIndex === -1) {
    return { success: false, message: "아이템을 찾을 수 없습니다." };
  }

  // 기존 아이템 유지하고 업데이트된 필드만 덮어쓰기
  db.shopItems[itemIndex] = {
    ...db.shopItems[itemIndex],
    ...updatedData,
  };

  // 데이터베이스 업데이트
  updateDatabase(db);

  return { success: true, item: db.shopItems[itemIndex] };
};

// 관리자: 아이템 삭제
const deleteShopItem = (itemId) => {
  const db = getDatabase();
  const itemIndex = db.shopItems.findIndex((item) => item.id === itemId);

  if (itemIndex === -1) {
    return { success: false, message: "아이템을 찾을 수 없습니다." };
  }

  // 아이템 제거
  db.shopItems.splice(itemIndex, 1);

  // 데이터베이스 업데이트
  updateDatabase(db);

  return { success: true };
};

// 아이템 자동 만료 처리 (실제로는 백엔드에서 처리)
const checkExpiredItems = (userId) => {
  const db = getDatabase();
  const user = db.users[userId];

  if (!user) return;

  const now = new Date().getTime();
  const oneHour = 3600000; // 1시간(ms)

  // 만료된 아이템 필터링
  const expiredItems = user.usedItems.filter((item) => {
    const usedTime = new Date(item.usedAt).getTime();
    return now - usedTime >= oneHour;
  });

  if (expiredItems.length > 0) {
    // 만료된 아이템 제거
    user.usedItems = user.usedItems.filter((item) => {
      const usedTime = new Date(item.usedAt).getTime();
      return now - usedTime < oneHour;
    });

    // 데이터베이스 업데이트
    updateDatabase(db);
  }
};

export {
  initializeDatabase,
  getShopItems,
  updateShopItems,
  getUser,
  updateUser,
  getUserItems,
  getUserUsedItems,
  buyItem,
  useItem,
  giftItem,
  addShopItem,
  updateShopItem,
  deleteShopItem,
  getAllIcons,
  getIconById,
  checkExpiredItems,
};
