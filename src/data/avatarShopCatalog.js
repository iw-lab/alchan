/* eslint-disable */
/**
 * 아바타 상점 아이템 카탈로그 (63종)
 *
 * - slot: hair | hat | glasses | outfit | background | effect | preset
 * - rarity: common(3k~10k) | rare(15k~50k) | epic(80k~200k) | legendary(300k~1M)
 * - 이미지 생성 프롬프트는 scripts/avatar-prompts.mjs 로 분리됐다(브라우저 번들에서 제외).
 *
 * 공통 스타일 시드:
 *   "Cute flat illustration sticker, simple cartoon shapes,
 *    thick clean outlines, bright vibrant colors, child-friendly,
 *    isolated on PURE WHITE BACKGROUND, centered, no shadows on background,
 *    1024x1024 square, single object only, no text, no Korean letters."
 *
 * 슬롯별 추가 지시:
 *   hair/hat/glasses/outfit: 단일 아이템만, 인체나 마네킹 없이 객체만.
 *     "the item floating alone, no person, no mannequin, no head, no body part visible."
 *   background: 풍경 PNG, 정사각형 1:1 또는 4:3.
 *   effect: 입자/광채/마법 효과만, 투명한 일러스트풍.
 *   preset: 인물 단독 (정면 1/2 신, 어깨까지).
 */

// HAIR/ITEM CRITICAL: 모든 hair PNG는 반드시 FULLY OPAQUE solid color여야 함.
// 사용자가 반복적으로 "투명/흐림" 불만 → 강제 명시.

// 의상(outfit/luxury) — base 캐릭터와 동일 비율의 풀바디 chibi 학생이 이 옷을 입은 모습.
// 머리/얼굴 영역(vertical 0-27%)은 반드시 PURE WHITE → 후처리 script에서 강제 알파.
// 결과: base의 머리(헤어/얼굴)는 그대로 보이고, outfit 캐릭터의 몸이 base 몸을 자연스럽게 덮음.

// 베이스 캐릭터 (전신 chibi) - 머리부터 발끝까지 풀바디.
// 헤어/모자는 머리에 합성, 의상은 상체~허벅지, 신발은 발에 합성.
// CRITICAL: 평범한 만화 눈 + 검정 솔리드 외곽선 (사용자 명시).
// 백내장/흐릿/거의-흰자 회피, 동공이 분명히 보이게.

// Body 규칙 (사용자 명시 v2): head 비율 약 25% (chibi 너무 크지 않게), 풀바디, 단정한 의상

// 'BALD'와 'chibi'가 충돌 → codex가 흉상으로 그림. 'chibi' 단어 자체 제거 + 일반
// "Korean elementary student" 명시. base_male 프롬프트 구조와 동일하게 두고 머리만 변경.

// ============================================================================
// 헤어 (8종)
// ============================================================================
const HAIR_ITEMS = [
  {
    id: "hair_rainbow_curl",
    slot: "hair",
    name: "무지개 곱슬",
    description: "기분 좋아지는 무지개 곱슬머리",
    rarity: "epic",
    price: 1200000,
  },
  {
    id: "hair_silver_long",
    slot: "hair",
    name: "은빛 장발",
    description: "달빛처럼 빛나는 은발",
    rarity: "rare",
    price: 450000,
  },
  {
    id: "hair_pink_twin",
    slot: "hair",
    name: "핑크 트윈테일",
    description: "발랄한 핑크 트윈테일",
    rarity: "rare",
    price: 300000,
  },
  {
    id: "hair_braid_blonde",
    slot: "hair",
    name: "황금 땋은머리",
    description: "공주님 같은 황금색 땋은머리",
    rarity: "epic",
    price: 900000,
  },
  {
    id: "hair_fire",
    slot: "hair",
    name: "불꽃 머리",
    description: "활활 타오르는 불꽃 머리",
    rarity: "legendary",
    price: 4000000,
  },
  {
    id: "hair_galaxy",
    slot: "hair",
    name: "은하수 머리",
    description: "별이 박힌 우주빛 머리",
    rarity: "legendary",
    price: 5000000,
  },
  {
    id: "hair_short_brown",
    slot: "hair",
    name: "단정 단발",
    description: "단정한 갈색 단발",
    rarity: "common",
    price: 50000,
  },
  {
    id: "hair_mint",
    slot: "hair",
    name: "민트 단발",
    description: "상쾌한 민트색 머리",
    rarity: "rare",
    price: 250000,
  },
  // ===== 추가 헤어 6종 (포니테일·똥머리·남자스타일) =====
  {
    id: "hair_ponytail_brown",
    slot: "hair",
    name: "포니테일 (앞머리)",
    description: "앞머리 있는 갈색 포니테일",
    rarity: "rare",
    price: 350000,
  },
  {
    id: "hair_ponytail_no_bangs_brown",
    slot: "hair",
    name: "포니테일 (앞머리 없음)",
    description: "이마 시원하게 앞머리 없는 포니테일",
    rarity: "rare",
    price: 350000,
  },
  {
    id: "hair_bun_black",
    slot: "hair",
    name: "똥머리",
    description: "정수리 위에 묶은 똥머리",
    rarity: "rare",
    price: 300000,
  },
  {
    id: "hair_undercut_male",
    slot: "hair",
    name: "남자 언더컷",
    description: "스타일리쉬한 남자 언더컷",
    rarity: "rare",
    price: 280000,
  },
  {
    id: "hair_messy_male",
    slot: "hair",
    name: "남자 헝클어진머리",
    description: "자연스럽게 헝클어진 남자머리",
    rarity: "common",
    price: 80000,
  },
  {
    id: "hair_slick_back_male",
    slot: "hair",
    name: "남자 올백머리",
    description: "단정한 올백 스타일",
    rarity: "rare",
    price: 320000,
  },
  {
    id: "hair_long_wavy_brown",
    slot: "hair",
    name: "긴 웨이브",
    description: "우아한 갈색 긴 웨이브",
    rarity: "epic",
    price: 1000000,
  },
];

// ============================================================================
// 모자/관 (8종)
// CRITICAL: 정면 평면 뷰 강제 (사용자 명시 — 사선/측면 X).
// ============================================================================
const HAT_ITEMS = [
  {
    id: "hat_crown_gold",
    slot: "hat",
    name: "황금 왕관",
    description: "왕족의 황금 왕관",
    rarity: "legendary",
    price: 8000000,
  },
  {
    id: "hat_witch",
    slot: "hat",
    name: "마법사 모자",
    description: "별이 박힌 마법사 모자",
    rarity: "epic",
    price: 1300000,
  },
  {
    id: "hat_baseball_red",
    slot: "hat",
    name: "빨간 야구모자",
    description: "스포츠 감성 빨간 야구모자",
    rarity: "common",
    price: 70000,
  },
  {
    id: "hat_beanie_yellow",
    slot: "hat",
    name: "노란 비니",
    description: "겨울 감성 노란 비니",
    rarity: "common",
    price: 60000,
  },
  {
    id: "hat_chef",
    slot: "hat",
    name: "셰프 모자",
    description: "요리 마스터의 셰프 모자",
    rarity: "rare",
    price: 350000,
  },
  {
    id: "hat_graduation",
    slot: "hat",
    name: "졸업 모자",
    description: "졸업식의 검은 학사모",
    rarity: "rare",
    price: 400000,
  },
  {
    id: "hat_devil_horns",
    slot: "hat",
    name: "악마 뿔",
    description: "장난스러운 빨간 악마 뿔",
    rarity: "epic",
    price: 1000000,
  },
  {
    id: "hat_angel_halo",
    slot: "hat",
    name: "천사 후광",
    description: "신성한 황금 후광",
    rarity: "legendary",
    price: 3500000,
  },
  {
    id: "hat_ribbon_bow",
    slot: "hat",
    name: "리본 머리띠",
    description: "큼직한 리본이 달린 머리띠",
    rarity: "common",
    price: 50000,
  },
  {
    id: "hat_sun_hat",
    slot: "hat",
    name: "밀짚 썬햇",
    description: "챙 넓은 여름 밀짚모자",
    rarity: "rare",
    price: 250000,
  },
  {
    id: "hat_beret",
    slot: "hat",
    name: "베레모",
    description: "세련된 프렌치 베레모",
    rarity: "common",
    price: 70000,
  },
  {
    id: "hat_flower_crown",
    slot: "hat",
    name: "꽃 화관",
    description: "화사한 꽃으로 엮은 화관",
    rarity: "epic",
    price: 400000,
  },
  {
    id: "hat_tiara",
    slot: "hat",
    name: "티아라",
    description: "공주님의 보석 티아라",
    rarity: "epic",
    price: 1500000,
  },
];

// ============================================================================
// 안경/마스크 (8종)
// CRITICAL: 정면 평면 뷰 + 또렷한 검정 외곽선 강제 (사용자 명시).
// 안경 알이 비틀어지거나 3D 사선 뷰로 그려지는 문제 회피.
// ============================================================================
// 사용자 명시: 안경다리(temple arms) X, 끈/체인/귀고리 X. 정면 렌즈 + 작은 브릿지만.
const GLASSES_ITEMS = [
  {
    id: "glasses_round_black",
    slot: "glasses",
    name: "동그란 안경",
    description: "지적인 검은 둥근 안경",
    rarity: "common",
    price: 40000,
  },
  {
    id: "glasses_aviator",
    slot: "glasses",
    name: "에이비에이터",
    description: "쿨한 비행사 선글라스",
    rarity: "rare",
    price: 300000,
  },
  {
    id: "glasses_star",
    slot: "glasses",
    name: "별모양 안경",
    description: "톡톡 튀는 별 모양 안경",
    rarity: "epic",
    price: 900000,
  },
  {
    id: "glasses_heart_pink",
    slot: "glasses",
    name: "하트 선글라스",
    description: "사랑스러운 하트 선글라스",
    rarity: "rare",
    price: 250000,
  },
  {
    id: "glasses_eyepatch",
    slot: "glasses",
    name: "해적 안대",
    description: "용감한 해적의 검은 안대",
    rarity: "epic",
    price: 1100000,
  },
  {
    id: "glasses_mask_medic",
    slot: "glasses",
    name: "마스크",
    description: "보건의 흰 마스크",
    rarity: "common",
    price: 30000,
  },
  {
    id: "glasses_3d",
    slot: "glasses",
    name: "3D 안경",
    description: "복고 감성 3D 안경",
    rarity: "rare",
    price: 280000,
  },
  {
    id: "glasses_monocle",
    slot: "glasses",
    name: "외알 안경",
    description: "신사의 외알 안경",
    rarity: "epic",
    price: 950000,
  },
  {
    id: "glasses_rect_black",
    slot: "glasses",
    name: "사각 안경",
    description: "기본 검은 뿔테 사각 안경",
    rarity: "common",
    price: 35000,
  },
  {
    id: "glasses_rect_tort",
    slot: "glasses",
    name: "호피 뿔테 안경",
    description: "복고풍 호피 무늬 뿔테 안경",
    rarity: "common",
    price: 60000,
  },
  {
    id: "glasses_square_sun",
    slot: "glasses",
    name: "각진 안경",
    description: "각진 검은 뿔테 안경",
    rarity: "rare",
    price: 200000,
  },
  {
    id: "glasses_cat_eye",
    slot: "glasses",
    name: "캣아이 안경",
    description: "세련된 캣아이 안경",
    rarity: "rare",
    price: 230000,
  },
];

// ============================================================================
// 의상 (8종)
// ============================================================================
const OUTFIT_ITEMS = [
  {
    id: "outfit_hanbok_blue",
    slot: "outfit",
    name: "푸른 한복",
    description: "단아한 푸른 한복",
    rarity: "epic",
    price: 1500000,
  },
  {
    id: "outfit_astronaut",
    slot: "outfit",
    name: "우주복",
    description: "꿈을 향한 우주복",
    rarity: "legendary",
    price: 4500000,
  },
  {
    id: "outfit_chef",
    slot: "outfit",
    name: "셰프복",
    description: "요리사의 흰 셰프복",
    rarity: "rare",
    price: 400000,
  },
  {
    id: "outfit_school",
    slot: "outfit",
    name: "교복",
    description: "단정한 교복",
    rarity: "common",
    price: 80000,
  },
  {
    id: "outfit_kpop_idol",
    slot: "outfit",
    name: "아이돌 무대의상",
    description: "반짝이는 아이돌 무대의상",
    rarity: "legendary",
    price: 6000000,
  },
  {
    id: "outfit_police",
    slot: "outfit",
    name: "경찰복",
    description: "정의의 경찰복",
    rarity: "rare",
    price: 500000,
  },
  {
    id: "outfit_doctor",
    slot: "outfit",
    name: "의사 가운",
    description: "흰 의사 가운",
    rarity: "rare",
    price: 450000,
  },
  {
    id: "outfit_robe_wizard",
    slot: "outfit",
    name: "마법사 로브",
    description: "신비로운 마법사 로브",
    rarity: "epic",
    price: 1700000,
  },
  // ===== 명품 초고가 의상 8종 (저작권 회피 - 가공의 럭셔리 디자인) =====
  {
    id: "luxury_suit_gold",
    slot: "outfit",
    name: "황금 명품 정장",
    description: "황금 자수 + 다이아 시계 + 명품 목걸이가 어우러진 최고급 정장",
    rarity: "legendary",
    price: 15000000,
  },
  {
    id: "luxury_dress_diamond",
    slot: "outfit",
    name: "다이아몬드 드레스",
    description: "다이아몬드가 박힌 빛나는 최고급 드레스",
    rarity: "legendary",
    price: 25000000,
  },
  {
    id: "luxury_royal_robe",
    slot: "outfit",
    name: "왕족 망토",
    description: "황실의 최고급 황금 자수 망토",
    rarity: "legendary",
    price: 30000000,
  },
  {
    id: "luxury_designer_coat",
    slot: "outfit",
    name: "명품 디자이너 코트",
    description: "감각적인 패션의 정점 - 명품 디자이너 코트",
    rarity: "legendary",
    price: 12000000,
  },
  {
    id: "luxury_hanbok_gold",
    slot: "outfit",
    name: "황금 명품 한복",
    description: "황금 자수가 화려한 명품 전통 한복",
    rarity: "legendary",
    price: 18000000,
  },
  {
    id: "luxury_athletic_set",
    slot: "outfit",
    name: "명품 트레이닝복",
    description: "디자이너 컬렉션의 최고급 트레이닝복",
    rarity: "epic",
    price: 8000000,
  },
  {
    id: "luxury_fur_coat",
    slot: "outfit",
    name: "명품 모피 코트",
    description: "부드러운 모피로 만든 최고급 겨울 코트",
    rarity: "legendary",
    price: 22000000,
  },
  {
    id: "luxury_kpop_stage",
    slot: "outfit",
    name: "명품 무대의상",
    description: "스타가 입을 법한 화려한 무대의상",
    rarity: "legendary",
    price: 20000000,
  },
];

// ============================================================================
// 배경 (8종)
// ============================================================================
const BG_ITEMS = [
  {
    id: "bg_space",
    slot: "background",
    name: "우주 정거장",
    description: "별이 빛나는 우주 배경",
    rarity: "epic",
    price: 1000000,
  },
  {
    id: "bg_ocean",
    slot: "background",
    name: "바닷속 산호초",
    description: "다채로운 바다 산호초",
    rarity: "rare",
    price: 300000,
  },
  {
    id: "bg_library",
    slot: "background",
    name: "도서관",
    description: "지식의 마법 도서관",
    rarity: "rare",
    price: 250000,
  },
  {
    id: "bg_sunset_beach",
    slot: "background",
    name: "노을 해변",
    description: "황금빛 노을 해변",
    rarity: "common",
    price: 80000,
  },
  {
    id: "bg_castle",
    slot: "background",
    name: "마법의 성",
    description: "동화 속 마법의 성",
    rarity: "legendary",
    price: 3800000,
  },
  {
    id: "bg_forest",
    slot: "background",
    name: "신비의 숲",
    description: "반짝이는 신비의 숲",
    rarity: "common",
    price: 90000,
  },
  {
    id: "bg_neon_city",
    slot: "background",
    name: "네온 도시",
    description: "사이버펑크 네온 도시",
    rarity: "epic",
    price: 1400000,
  },
  {
    id: "bg_aurora",
    slot: "background",
    name: "오로라",
    description: "북극의 환상적인 오로라",
    rarity: "legendary",
    price: 3200000,
  },
];

// ============================================================================
// 이펙트 (8종)
// ============================================================================
const EFFECT_ITEMS = [
  {
    id: "effect_sparkle",
    slot: "effect",
    name: "반짝임",
    description: "주변을 빛나게 하는 반짝임",
    rarity: "common",
    price: 50000,
  },
  {
    id: "effect_hearts",
    slot: "effect",
    name: "하트 폭발",
    description: "사랑스러운 하트 폭발",
    rarity: "rare",
    price: 220000,
  },
  {
    id: "effect_lightning",
    slot: "effect",
    name: "번개",
    description: "강력한 번개 이펙트",
    rarity: "epic",
    price: 1000000,
  },
  {
    id: "effect_fire_aura",
    slot: "effect",
    name: "불꽃 오라",
    description: "활활 타오르는 불꽃 오라",
    rarity: "legendary",
    price: 2800000,
  },
  {
    id: "effect_petals",
    slot: "effect",
    name: "벚꽃잎",
    description: "흩날리는 벚꽃잎",
    rarity: "rare",
    price: 180000,
  },
  {
    id: "effect_snow",
    slot: "effect",
    name: "눈송이",
    description: "은은한 눈송이",
    rarity: "common",
    price: 40000,
  },
  {
    id: "effect_rainbow_ring",
    slot: "effect",
    name: "무지개 링",
    description: "주변에 도는 무지개 링",
    rarity: "epic",
    price: 1300000,
  },
  {
    id: "effect_butterflies",
    slot: "effect",
    name: "나비 떼",
    description: "아름다운 나비 떼",
    rarity: "rare",
    price: 250000,
  },
];

// ============================================================================
// 프리셋 캐릭터 (15종)
// ============================================================================
const PRESET_ITEMS = [
  {
    id: "preset_pirate_capt",
    slot: "preset",
    name: "해적 선장",
    description: "바다를 누비는 해적 선장",
    rarity: "epic",
    price: 2000000,
  },
  {
    id: "preset_princess",
    slot: "preset",
    name: "동화 공주",
    description: "동화 속 우아한 공주",
    rarity: "legendary",
    price: 5000000,
  },
  {
    id: "preset_ninja",
    slot: "preset",
    name: "닌자",
    description: "그림자 속의 닌자",
    rarity: "epic",
    price: 2200000,
  },
  {
    id: "preset_astronaut",
    slot: "preset",
    name: "우주비행사",
    description: "별을 향한 우주비행사",
    rarity: "legendary",
    price: 4800000,
  },
  {
    id: "preset_wizard",
    slot: "preset",
    name: "꼬마 마법사",
    description: "별을 다루는 꼬마 마법사",
    rarity: "epic",
    price: 1800000,
  },
  {
    id: "preset_chef",
    slot: "preset",
    name: "꼬마 셰프",
    description: "맛있는 음식을 만드는 셰프",
    rarity: "rare",
    price: 500000,
  },
  {
    id: "preset_doctor",
    slot: "preset",
    name: "꼬마 의사",
    description: "환자를 돌보는 친절한 의사",
    rarity: "rare",
    price: 500000,
  },
  {
    id: "preset_idol",
    slot: "preset",
    name: "K-팝 아이돌",
    description: "무대를 사로잡는 아이돌",
    rarity: "legendary",
    price: 5500000,
  },
  {
    id: "preset_robot",
    slot: "preset",
    name: "꼬마 로봇",
    description: "삐삐 신호를 보내는 로봇",
    rarity: "rare",
    price: 600000,
  },
  {
    id: "preset_vampire",
    slot: "preset",
    name: "귀여운 뱀파이어",
    description: "사랑스러운 어린 뱀파이어",
    rarity: "epic",
    price: 1600000,
  },
  {
    id: "preset_angel",
    slot: "preset",
    name: "꼬마 천사",
    description: "흰 날개를 가진 어린 천사",
    rarity: "legendary",
    price: 3800000,
  },
  {
    id: "preset_devil",
    slot: "preset",
    name: "꼬마 악마",
    description: "장난기 가득한 어린 악마",
    rarity: "epic",
    price: 1700000,
  },
  {
    id: "preset_mermaid",
    slot: "preset",
    name: "꼬마 인어",
    description: "바닷속에서 노래하는 인어",
    rarity: "epic",
    price: 1800000,
  },
  {
    id: "preset_dragon_tamer",
    slot: "preset",
    name: "용 조련사",
    description: "어깨에 작은 용을 데리고 다니는 조련사",
    rarity: "legendary",
    price: 6000000,
  },
  {
    id: "preset_student_default",
    slot: "preset",
    name: "기본 학생",
    description: "친근한 일반 학생",
    rarity: "common",
    price: 100000,
  },
];

// ============================================================================
// 베이스 캐릭터 (15종) - 기본 얼굴, 무료 또는 저가
// ============================================================================
const BASE_ITEMS = [
  {
    id: "base_male",
    slot: "base",
    name: "남자 (단정한 짧은 머리)",
    description: "단정한 짧은 머리의 남자 얼굴",
    rarity: "common",
    price: 0,
  },
  {
    id: "base_female",
    slot: "base",
    name: "여자 (단정한 단발)",
    description: "단정한 단발의 여자 얼굴",
    rarity: "common",
    price: 0,
  },
  {
    id: "editor_bald",
    slot: "base",
    name: "편집기 대머리 베이스",
    description: "편집기 전용 대머리 (위치 조정용)",
    rarity: "common",
    price: 0,
    active: false,
  },
];

// 옛 BASE_ITEMS deprecated IDs - Firestore에서 active=false로 표시 (시드 시 비활성화)
const DEPRECATED_BASE_IDS = [
  "base_default", "base_blushing_shy", "base_dark_neat", "base_fair_bob_f",
  "base_fair_short_m", "base_freckle_red", "base_pale_pink_cheek",
  "base_robot_circuit", "base_sleepy_calm", "base_smug_cool", "base_starry_eyes",
  "base_strong_brave", "base_sunshine_gold", "base_tan_curly", "base_wise_purple",
  "editor_bald",
];

const DEPRECATED_ITEMS = DEPRECATED_BASE_IDS.map((id) => ({
  id,
  slot: "base",
  name: "(deprecated)",
  description: "no longer in use",
  rarity: "common",
  price: 0,
  active: false,
}));

// 에셋 버전 — Avatar.js ASSET_VERSION 과 반드시 동시에 올릴 것(둘 중 하나만 올리면
// firebase max-age=0이어도 브라우저 디스크캐시로 옛 자산이 남는다).
// 어긋난 채로 배포되면 src/test/components/avatarAssets.test.js 가 빨간불이 된다.
const ASSET_VERSION = "20260812a";

// 2026-08-03 에셋 최적화: 아바타 PNG 111개(70MB)를 512px WebP로 변환(6.1MB, -91%).
//   그때 base/editor 5종만 PNG 로 남았다. 성능 판단이 아니라 **문자열 치환** 때문이었다 —
//   Avatar.js 가 `.png` 를 `_outfit.png` 로 바꿔 옷 입은 변종을 찾았기 때문에
//   확장자를 건드리면 그 탐색이 조용히 깨졌다.
// 2026-08-12: 그 치환을 확장자 무관(`outfitVariantUrl`)으로 고쳐 제약이 사라졌고
//   남은 5종도 WebP 로 옮겼다 — 3,489,987 B → 125,466 B (**-96.4%**).
//   base 이미지는 아바타를 하나도 안 산 학생까지 **모든 화면에서** 받는 파일이라
//   이 앱에서 가장 무겁게 체감되던 단일 자산이었다.
const assetExt = () => "webp";

const ALL_AVATAR_ITEMS = [
  ...BASE_ITEMS,
  ...DEPRECATED_ITEMS,
  ...HAIR_ITEMS,
  ...HAT_ITEMS,
  ...GLASSES_ITEMS,
  ...OUTFIT_ITEMS,
  ...BG_ITEMS,
  ...EFFECT_ITEMS,
  ...PRESET_ITEMS,
].map((item, idx) => ({
  ...item,
  active: item.active === false ? false : true,
  sortOrder: idx,
  imageUrl:
    item.active === false
      ? ""
      : `/avatar-shop/${item.id}.${assetExt()}?v=${ASSET_VERSION}`,
}));

// ES module export (webpack/React 및 Node ES module 호환)
export {
  ALL_AVATAR_ITEMS,
  BASE_ITEMS,
  HAIR_ITEMS,
  HAT_ITEMS,
  GLASSES_ITEMS,
  OUTFIT_ITEMS,
  BG_ITEMS,
  EFFECT_ITEMS,
  PRESET_ITEMS,
};
