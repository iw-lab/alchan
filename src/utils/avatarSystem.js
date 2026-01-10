// src/utils/avatarSystem.js - 아바타 커스터마이징 시스템

/**
 * 아바타 커스터마이징 시스템
 * 얼굴, 헤어스타일, 염색, 의상, 악세서리, 배경, 테두리 등을 포함
 */

// 피부색
export const SKIN_TONES = [
  { id: "fair", name: "밝은 피부", color: "#FFE4C4" },
  { id: "light", name: "연한 피부", color: "#F5DEB3" },
  { id: "medium", name: "중간 피부", color: "#DEB887" },
  { id: "tan", name: "그을린 피부", color: "#D2A679" },
  { id: "dark", name: "어두운 피부", color: "#8B7355" },
];

// 얼굴형 - 자연스러운 차이
export const FACE_SHAPES = [
  { id: "round", name: "둥근형", icon: "🔵", path: "M50,10 C82,10 90,32 90,55 C90,78 78,90 50,90 C22,90 10,78 10,55 C10,32 18,10 50,10" },
  { id: "oval", name: "계란형", icon: "🥚", path: "M50,8 C78,8 88,28 88,52 C88,80 72,92 50,92 C28,92 12,80 12,52 C12,28 22,8 50,8" },
  { id: "square", name: "각진형", icon: "🟧", path: "M50,10 C85,10 90,30 90,55 C90,80 82,90 50,90 C18,90 10,80 10,55 C10,30 15,10 50,10" },
  { id: "heart", name: "하트형", icon: "💜", path: "M50,10 C80,10 90,30 90,52 C90,78 70,90 50,92 C30,90 10,78 10,52 C10,30 20,10 50,10" },
  { id: "long", name: "긴형", icon: "📏", path: "M50,5 C72,5 80,25 80,50 C80,82 65,95 50,95 C35,95 20,82 20,50 C20,25 28,5 50,5" },
];

// 눈 스타일
export const EYE_STYLES = [
  { id: "normal", name: "기본", leftX: 35, rightX: 65, y: 45, size: 6 },
  { id: "big", name: "큰 눈", leftX: 35, rightX: 65, y: 45, size: 8 },
  { id: "small", name: "작은 눈", leftX: 35, rightX: 65, y: 45, size: 4 },
  { id: "almond", name: "아몬드형", leftX: 35, rightX: 65, y: 45, size: 6, shape: "almond" },
  { id: "round", name: "동그란 눈", leftX: 35, rightX: 65, y: 45, size: 7, shape: "round" },
];

// 눈 색상
export const EYE_COLORS = [
  { id: "black", name: "검은색", color: "#1a1a1a" },
  { id: "brown", name: "갈색", color: "#654321" },
  { id: "hazel", name: "헤이즐", color: "#8E7618" },
  { id: "blue", name: "파란색", color: "#1E90FF" },
  { id: "green", name: "초록색", color: "#228B22" },
  { id: "gray", name: "회색", color: "#696969" },
];

// 입 스타일
export const MOUTH_STYLES = [
  { id: "smile", name: "미소", path: "M35,65 Q50,75 65,65", stroke: true },
  { id: "grin", name: "활짝 웃음", path: "M30,62 Q50,80 70,62", stroke: true },
  { id: "neutral", name: "무표정", path: "M38,65 L62,65", stroke: true },
  { id: "small_smile", name: "작은 미소", path: "M40,65 Q50,70 60,65", stroke: true },
  { id: "open", name: "벌린 입", path: "M35,63 Q50,75 65,63 Q50,80 35,63", fill: true },
];

// 헤어스타일 (얼굴형과 매칭되도록 설계)
const ALL_FACES = ["round", "oval", "square", "heart", "long"];

export const HAIRSTYLES = [
  {
    id: "none",
    name: "민머리",
    paths: [],
    compatibleFaces: ALL_FACES,
  },
  {
    // 짧은 머리: 윗부분만 살짝 덮음 (크루컷 스타일)
    id: "short",
    name: "짧은 머리",
    paths: [
      "M15,28 Q15,8 50,5 Q85,8 85,28 Q85,18 50,15 Q15,18 15,28 Z"
    ],
    compatibleFaces: ALL_FACES,
  },
  {
    // 중간 머리: 귀까지 오는 자연스러운 머리
    id: "medium",
    name: "중간 머리",
    paths: [
      "M8,50 Q5,15 50,2 Q95,15 92,50 L88,48 Q88,20 50,12 Q12,20 12,48 Z"
    ],
    bangsPath: "M20,22 Q35,32 50,30 Q65,32 80,22 L80,12 Q65,22 50,20 Q35,22 20,12 Z",
    compatibleFaces: ALL_FACES,
  },
  {
    // 긴 머리: 어깨 아래까지 내려오는 긴 머리
    id: "long",
    name: "긴 머리",
    paths: [
      // 메인 머리 (양옆으로 길게)
      "M3,95 Q-2,40 50,0 Q102,40 97,95 L92,90 Q92,35 50,10 Q8,35 8,90 Z",
    ],
    bangsPath: "M15,25 Q30,38 50,35 Q70,38 85,25 L85,10 Q70,25 50,22 Q30,25 15,10 Z",
    compatibleFaces: ALL_FACES,
  },
  {
    // 단발: 턱선까지 오는 깔끔한 단발 + 앞머리
    id: "bob",
    name: "단발",
    paths: [
      "M5,70 L5,30 Q5,5 50,2 Q95,5 95,30 L95,70 Q95,75 90,75 L85,55 Q85,20 50,12 Q15,20 15,55 L10,75 Q5,75 5,70 Z"
    ],
    bangsPath: "M15,30 L20,18 Q35,30 50,28 Q65,30 80,18 L85,30 Q70,38 50,35 Q30,38 15,30 Z",
    compatibleFaces: ALL_FACES,
  },
  {
    // 포니테일: 묶은 머리
    id: "ponytail",
    name: "포니테일",
    paths: [
      // 앞머리
      "M15,35 Q12,12 50,5 Q88,12 85,35 Q85,22 50,15 Q15,22 15,35 Z",
      // 뒤로 묶은 포니테일
      "M75,15 Q95,10 100,25 Q105,50 95,75 Q90,85 82,70 Q88,50 85,30 Q82,20 75,15 Z"
    ],
    compatibleFaces: ALL_FACES,
  },
  {
    // 트윈테일: 양쪽 묶음
    id: "twintail",
    name: "트윈테일",
    paths: [
      // 앞머리
      "M18,35 Q15,12 50,5 Q85,12 82,35 Q82,22 50,15 Q18,22 18,35 Z",
      // 왼쪽 트윈테일
      "M12,35 Q0,40 -5,55 Q-8,80 5,90 Q12,85 8,65 Q5,50 12,35 Z",
      // 오른쪽 트윈테일
      "M88,35 Q100,40 105,55 Q108,80 95,90 Q88,85 92,65 Q95,50 88,35 Z"
    ],
    compatibleFaces: ALL_FACES,
  },
  {
    // 곱슬머리: 볼륨있는 웨이브
    id: "curly",
    name: "곱슬머리",
    paths: [
      // 메인 볼륨
      "M0,55 Q-5,25 50,0 Q105,25 100,55 Q100,35 50,12 Q0,35 0,55 Z",
      // 왼쪽 웨이브
      "M5,40 Q-2,50 5,60 Q-2,70 5,75 Q12,65 8,55 Q12,45 5,40 Z",
      // 오른쪽 웨이브
      "M95,40 Q102,50 95,60 Q102,70 95,75 Q88,65 92,55 Q88,45 95,40 Z",
    ],
    compatibleFaces: ALL_FACES,
  },
  {
    // 모히칸: 가운데만 세운 머리
    id: "mohawk",
    name: "모히칸",
    paths: [
      "M35,25 L40,-5 L45,-15 L50,-20 L55,-15 L60,-5 L65,25 Q60,20 50,18 Q40,20 35,25 Z"
    ],
    compatibleFaces: ALL_FACES,
  },
];

// 머리 색상
export const HAIR_COLORS = [
  { id: "black", name: "검은색", color: "#1a1a1a" },
  { id: "dark_brown", name: "진한 갈색", color: "#3d2314" },
  { id: "brown", name: "갈색", color: "#6b4423" },
  { id: "light_brown", name: "밝은 갈색", color: "#a0522d" },
  { id: "blonde", name: "금발", color: "#f4d03f" },
  { id: "red", name: "빨간색", color: "#c0392b" },
  { id: "orange", name: "주황색", color: "#e67e22" },
  { id: "pink", name: "핑크", color: "#ff69b4" },
  { id: "purple", name: "보라색", color: "#9b59b6" },
  { id: "blue", name: "파란색", color: "#3498db" },
  { id: "green", name: "초록색", color: "#27ae60" },
  { id: "gray", name: "회색", color: "#7f8c8d" },
  { id: "white", name: "흰색", color: "#ecf0f1" },
  { id: "rainbow", name: "무지개", gradient: ["#ff0000", "#ff7f00", "#ffff00", "#00ff00", "#0000ff", "#8b00ff"] },
];

// 의상
export const OUTFITS = [
  { id: "none", name: "없음", color: null },
  {
    id: "tshirt",
    name: "티셔츠",
    baseColor: "#3498db",
    path: "M20,95 L15,120 L85,120 L80,95 Q78,88 65,88 L58,92 L42,92 L35,88 Q22,88 20,95",
    sleeves: "M20,95 L8,105 L15,110 L22,100 M80,95 L92,105 L85,110 L78,100"
  },
  {
    id: "suit",
    name: "정장",
    baseColor: "#2c3e50",
    path: "M18,95 L15,120 L85,120 L82,95 Q80,88 65,88 L58,92 L42,92 L35,88 Q20,88 18,95",
    tie: true,
    lapels: true
  },
  {
    id: "hoodie",
    name: "후드티",
    baseColor: "#e74c3c",
    path: "M15,95 L12,120 L88,120 L85,95 Q82,86 65,86 L58,90 L42,90 L35,86 Q18,86 15,95",
    hood: true,
    pocket: true
  },
  {
    id: "dress",
    name: "원피스",
    baseColor: "#9b59b6",
    path: "M28,92 L22,125 L78,125 L72,92 Q70,88 60,88 L55,92 L45,92 L40,88 Q30,88 28,92"
  },
  {
    id: "uniform",
    name: "교복",
    baseColor: "#34495e",
    path: "M20,95 L18,120 L82,120 L80,95 Q78,88 65,88 L58,92 L42,92 L35,88 Q22,88 20,95",
    collar: true,
    buttons: true
  },
];

// 의상 색상
export const OUTFIT_COLORS = [
  { id: "blue", name: "파란색", color: "#3498db" },
  { id: "red", name: "빨간색", color: "#e74c3c" },
  { id: "green", name: "초록색", color: "#27ae60" },
  { id: "purple", name: "보라색", color: "#9b59b6" },
  { id: "yellow", name: "노란색", color: "#f1c40f" },
  { id: "orange", name: "주황색", color: "#e67e22" },
  { id: "pink", name: "핑크", color: "#ff69b4" },
  { id: "black", name: "검은색", color: "#2c3e50" },
  { id: "white", name: "흰색", color: "#ecf0f1" },
  { id: "navy", name: "네이비", color: "#2c3e50" },
];

// 악세서리
export const ACCESSORIES = [
  { id: "none", name: "없음" },
  { id: "glasses", name: "안경", path: "M25,43 L28,43 A8,8 0 1,1 42,43 L58,43 A8,8 0 1,1 72,43 L75,43", color: "#1a1a1a" },
  { id: "sunglasses", name: "선글라스", path: "M22,40 L25,40 C25,40 25,50 35,50 C45,50 45,40 45,40 L55,40 C55,40 55,50 65,50 C75,50 75,40 75,40 L78,40", color: "#1a1a1a", fill: true },
  { id: "earrings", name: "귀걸이", type: "earrings", color: "#f1c40f" },
  { id: "necklace", name: "목걸이", path: "M35,88 Q50,95 65,88", color: "#f1c40f" },
  { id: "hat", name: "모자", path: "M15,15 L85,15 L85,5 Q50,-5 15,5 Z", color: "#e74c3c" },
  { id: "crown", name: "왕관", type: "crown", color: "#f1c40f" },
  { id: "headband", name: "머리띠", path: "M12,25 Q50,18 88,25", color: "#ff69b4" },
  { id: "bow", name: "리본", type: "bow", color: "#ff69b4" },
  { id: "mask", name: "마스크", path: "M25,55 Q50,70 75,55 L75,65 Q50,80 25,65 Z", color: "#ffffff" },
];

// 배경
export const BACKGROUNDS = [
  { id: "none", name: "없음", color: "transparent" },
  { id: "sky_blue", name: "하늘색", color: "#87CEEB" },
  { id: "sunset", name: "석양", gradient: ["#ff7e5f", "#feb47b"] },
  { id: "night", name: "밤하늘", gradient: ["#0f0c29", "#302b63", "#24243e"] },
  { id: "forest", name: "숲", gradient: ["#134e5e", "#71b280"] },
  { id: "ocean", name: "바다", gradient: ["#2193b0", "#6dd5ed"] },
  { id: "pink", name: "핑크", gradient: ["#ee9ca7", "#ffdde1"] },
  { id: "purple", name: "보라", gradient: ["#667eea", "#764ba2"] },
  { id: "gold", name: "골드", gradient: ["#f7971e", "#ffd200"] },
  { id: "rainbow", name: "무지개", gradient: ["#ff0000", "#ff7f00", "#ffff00", "#00ff00", "#0000ff", "#8b00ff"] },
  { id: "galaxy", name: "은하수", gradient: ["#0f0c29", "#302b63", "#24243e"], stars: true },
];

// 테두리
export const BORDERS = [
  { id: "none", name: "없음", style: null },
  { id: "simple", name: "단순", color: "#ffffff", width: 3 },
  { id: "gold", name: "골드", color: "#f1c40f", width: 4, glow: true },
  { id: "silver", name: "실버", color: "#bdc3c7", width: 4, glow: true },
  { id: "bronze", name: "브론즈", color: "#cd7f32", width: 4, glow: true },
  { id: "rainbow", name: "무지개", gradient: ["#ff0000", "#ff7f00", "#ffff00", "#00ff00", "#0000ff", "#8b00ff"], width: 4, animated: true },
  { id: "neon_blue", name: "네온 블루", color: "#00fff2", width: 3, glow: true, glowColor: "#00fff2" },
  { id: "neon_pink", name: "네온 핑크", color: "#ff69b4", width: 3, glow: true, glowColor: "#ff69b4" },
  { id: "fire", name: "불꽃", gradient: ["#ff4500", "#ff6347", "#ffa500"], width: 4, animated: true },
  { id: "ice", name: "얼음", gradient: ["#00bfff", "#87ceeb", "#e0ffff"], width: 4, glow: true },
];

// 이모티콘/표정
export const EXPRESSIONS = [
  { id: "normal", name: "기본", eyeMod: null, mouthMod: null },
  { id: "happy", name: "행복", eyeMod: "happy", mouthMod: "grin" },
  { id: "sad", name: "슬픔", eyeMod: "sad", mouthMod: "sad" },
  { id: "angry", name: "화남", eyeMod: "angry", mouthMod: "angry" },
  { id: "surprised", name: "놀람", eyeMod: "wide", mouthMod: "open" },
  { id: "wink", name: "윙크", eyeMod: "wink", mouthMod: "smile" },
  { id: "love", name: "사랑", eyeMod: "hearts", mouthMod: "smile" },
  { id: "cool", name: "멋짐", eyeMod: "sunglasses", mouthMod: "smirk" },
];

// 기본 아바타 설정
export const DEFAULT_AVATAR = {
  skinTone: "light",
  faceShape: "oval",
  eyeStyle: "normal",
  eyeColor: "brown",
  mouthStyle: "smile",
  hairstyle: "short",
  hairColor: "black",
  outfit: "tshirt",
  outfitColor: "blue",
  accessory: "none",
  background: "sky_blue",
  border: "simple",
  expression: "normal",
};

/**
 * 아바타 설정을 로컬 스토리지에서 가져옵니다.
 */
export function getAvatarConfig(userId) {
  try {
    const saved = localStorage.getItem(`avatar_${userId}`);
    if (saved) {
      return { ...DEFAULT_AVATAR, ...JSON.parse(saved) };
    }
  } catch {
    // 오류 시 기본값 반환
  }
  return { ...DEFAULT_AVATAR };
}

/**
 * 아바타 설정을 로컬 스토리지에 저장합니다.
 */
export function saveAvatarConfig(userId, config) {
  try {
    localStorage.setItem(`avatar_${userId}`, JSON.stringify(config));
    // 아바타 변경 이벤트 발생 (다른 컴포넌트에서 감지할 수 있도록)
    window.dispatchEvent(new CustomEvent('avatarChanged', { detail: { userId, config } }));
    return true;
  } catch {
    return false;
  }
}

/**
 * 특정 카테고리의 옵션을 가져옵니다.
 */
export function getAvatarOptions(category) {
  switch (category) {
    case "skinTone": return SKIN_TONES;
    case "faceShape": return FACE_SHAPES;
    case "eyeStyle": return EYE_STYLES;
    case "eyeColor": return EYE_COLORS;
    case "mouthStyle": return MOUTH_STYLES;
    case "hairstyle": return HAIRSTYLES;
    case "hairColor": return HAIR_COLORS;
    case "outfit": return OUTFITS;
    case "outfitColor": return OUTFIT_COLORS;
    case "accessory": return ACCESSORIES;
    case "background": return BACKGROUNDS;
    case "border": return BORDERS;
    case "expression": return EXPRESSIONS;
    default: return [];
  }
}

/**
 * 헤어스타일이 얼굴형과 호환되는지 확인합니다.
 */
export function isHairstyleCompatible(hairstyleId, faceShapeId) {
  const hairstyle = HAIRSTYLES.find(h => h.id === hairstyleId);
  if (!hairstyle) return true;
  return hairstyle.compatibleFaces.includes(faceShapeId);
}

/**
 * 아바타 카테고리 목록
 * icon: 색상 코드 또는 null (색상 원으로 표시)
 */
export const AVATAR_CATEGORIES = [
  { id: "skinTone", name: "피부", icon: "#FFE4C4" },
  { id: "faceShape", name: "얼굴", icon: "#F5DEB3" },
  { id: "eyeStyle", name: "눈", icon: "#1E90FF" },
  { id: "eyeColor", name: "눈색", icon: "#654321" },
  { id: "mouthStyle", name: "입", icon: "#e74c3c" },
  { id: "hairstyle", name: "헤어", icon: "#3d2314" },
  { id: "hairColor", name: "머리색", icon: "#1a1a1a" },
  { id: "outfit", name: "의상", icon: "#3498db" },
  { id: "outfitColor", name: "의상색", icon: "#e74c3c" },
  { id: "accessory", name: "악세", icon: "#f1c40f" },
  { id: "background", name: "배경", icon: "#87CEEB" },
  { id: "border", name: "테두리", icon: "#a78bfa" },
];
