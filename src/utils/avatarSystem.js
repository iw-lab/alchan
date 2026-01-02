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

// 얼굴형 - 더 명확한 차이
export const FACE_SHAPES = [
  { id: "round", name: "둥근형", icon: "🔵", path: "M50,8 C85,8 92,35 92,55 C92,80 80,92 50,92 C20,92 8,80 8,55 C8,35 15,8 50,8" },
  { id: "oval", name: "계란형", icon: "🥚", path: "M50,5 C72,5 82,22 82,48 C82,78 68,95 50,95 C32,95 18,78 18,48 C18,22 28,5 50,5" },
  { id: "square", name: "각진형", icon: "🟧", path: "M15,12 L85,12 C88,12 92,16 92,20 L92,82 C92,86 88,90 85,90 L15,90 C12,90 8,86 8,82 L8,20 C8,16 12,12 15,12" },
  { id: "heart", name: "하트형", icon: "💜", path: "M50,8 C78,8 92,22 92,42 C92,68 72,88 50,95 C28,88 8,68 8,42 C8,22 22,8 50,8" },
  { id: "long", name: "긴형", icon: "📏", path: "M50,2 C68,2 75,18 75,42 C75,75 62,98 50,98 C38,98 25,75 25,42 C25,18 32,2 50,2" },
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
export const HAIRSTYLES = [
  {
    id: "none",
    name: "민머리",
    paths: [],
    compatibleFaces: ["round", "oval", "square", "heart", "long"],
  },
  {
    id: "short",
    name: "짧은 머리",
    paths: [
      "M15,35 Q15,5 50,5 Q85,5 85,35 L85,25 Q85,0 50,0 Q15,0 15,25 Z"
    ],
    compatibleFaces: ["round", "oval", "square", "heart", "long"],
    zIndex: 1,
  },
  {
    id: "medium",
    name: "중간 머리",
    paths: [
      "M10,45 Q5,10 50,5 Q95,10 90,45 L90,30 Q90,-5 50,-5 Q10,-5 10,30 Z",
      "M10,45 L8,55 Q5,60 10,55 L10,45",
      "M90,45 L92,55 Q95,60 90,55 L90,45"
    ],
    compatibleFaces: ["oval", "heart", "long"],
    zIndex: 1,
  },
  {
    id: "long",
    name: "긴 머리",
    paths: [
      "M5,50 Q0,10 50,0 Q100,10 95,50 L95,30 Q95,-10 50,-10 Q5,-10 5,30 Z",
      "M5,50 L3,85 Q5,95 15,85 L10,50",
      "M95,50 L97,85 Q95,95 85,85 L90,50"
    ],
    compatibleFaces: ["oval", "heart", "long", "round"],
    zIndex: 1,
  },
  {
    id: "bob",
    name: "단발",
    paths: [
      "M8,45 Q3,10 50,3 Q97,10 92,45 L92,30 Q92,-5 50,-5 Q8,-5 8,30 Z",
      "M8,45 Q5,55 8,65 Q12,75 20,70 L15,45",
      "M92,45 Q95,55 92,65 Q88,75 80,70 L85,45"
    ],
    compatibleFaces: ["round", "oval", "heart"],
    bangsPath: "M15,25 Q30,35 50,32 Q70,35 85,25 L85,15 Q70,25 50,22 Q30,25 15,15 Z",
    zIndex: 2,
  },
  {
    id: "ponytail",
    name: "포니테일",
    paths: [
      "M12,40 Q5,10 50,3 Q95,10 88,40 L88,25 Q88,-5 50,-5 Q12,-5 12,25 Z",
      "M85,20 Q100,15 105,35 Q108,55 95,70 Q85,60 88,40"
    ],
    compatibleFaces: ["oval", "heart", "long"],
    zIndex: 1,
  },
  {
    id: "twintail",
    name: "트윈테일",
    paths: [
      "M12,40 Q5,10 50,3 Q95,10 88,40 L88,25 Q88,-5 50,-5 Q12,-5 12,25 Z",
      "M10,35 Q-5,30 -8,55 Q-5,80 10,70 Q5,50 10,35",
      "M90,35 Q105,30 108,55 Q105,80 90,70 Q95,50 90,35"
    ],
    compatibleFaces: ["round", "heart"],
    zIndex: 1,
  },
  {
    id: "curly",
    name: "곱슬머리",
    paths: [
      "M5,50 Q-5,20 20,5 Q50,-10 80,5 Q105,20 95,50",
      "M5,50 Q0,60 8,65 Q15,55 10,45",
      "M95,50 Q100,60 92,65 Q85,55 90,45",
      "M20,10 Q15,20 25,25 Q20,15 30,10",
      "M80,10 Q85,20 75,25 Q80,15 70,10"
    ],
    compatibleFaces: ["oval", "round", "heart"],
    zIndex: 1,
  },
  {
    id: "mohawk",
    name: "모히칸",
    paths: [
      "M35,-15 Q50,-25 65,-15 L65,15 Q50,20 35,15 Z"
    ],
    compatibleFaces: ["square", "oval"],
    zIndex: 1,
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
  { id: "tshirt", name: "티셔츠", baseColor: "#3498db", path: "M25,90 L25,110 L75,110 L75,90 Q75,85 65,85 L55,88 L45,88 L35,85 Q25,85 25,90" },
  { id: "suit", name: "정장", baseColor: "#2c3e50", path: "M25,90 L25,115 L75,115 L75,90 Q75,85 65,85 L55,88 L45,88 L35,85 Q25,85 25,90", tie: true },
  { id: "hoodie", name: "후드티", baseColor: "#e74c3c", path: "M20,90 L20,115 L80,115 L80,90 Q80,82 65,82 L55,85 L45,85 L35,82 Q20,82 20,90", hood: true },
  { id: "dress", name: "원피스", baseColor: "#9b59b6", path: "M30,90 L25,120 L75,120 L70,90 Q70,85 60,85 L55,88 L45,88 L40,85 Q30,85 30,90" },
  { id: "uniform", name: "교복", baseColor: "#34495e", path: "M25,90 L25,115 L75,115 L75,90 Q75,85 65,85 L55,88 L45,88 L35,85 Q25,85 25,90", collar: true },
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
