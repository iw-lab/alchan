/* eslint-disable */
/**
 * 아바타 상점 아이템 카탈로그 (63종)
 *
 * - slot: hair | hat | glasses | outfit | background | effect | preset
 * - rarity: common(3k~10k) | rare(15k~50k) | epic(80k~200k) | legendary(300k~1M)
 * - prompt: codex(\$imagegen)에 전달할 영문 prompt (1000자 이내)
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

const STYLE_BASE = `Cute flat illustration sticker, simple cartoon shapes, thick clean outlines (2-3px), bright vibrant colors with high saturation, child-friendly (for Korean elementary 5-6th graders), isolated on PURE WHITE background (#ffffff), centered, no shadows on background, 1024x1024 square, single object, no text, no Korean letters, no English letters, no logos.`;

const ITEM_ONLY_STYLE = `${STYLE_BASE} The item floating alone in middle of frame, NO person, NO mannequin, NO head, NO body part, just the standalone clothing/accessory item.`;

const SCENE_STYLE = `${STYLE_BASE.replace("isolated on PURE WHITE background (#ffffff), centered, no shadows on background, ", "")} Square 1:1 scene, full bleed background, vibrant atmospheric colors.`;

const EFFECT_STYLE = `${STYLE_BASE} Magical particle effect, glowing sparkles, semi-transparent, centered, NO subject, NO character, just the visual effect / aura / pattern.`;

const PRESET_STYLE = `${STYLE_BASE} Cute chibi character, head-and-shoulders bust portrait, large expressive eyes, simple round face, big head ratio. Front view, looking forward with friendly expression. Child-friendly cartoon style, isolated on plain pastel solid background.`;

// 베이스 캐릭터 (전신 chibi) - 머리부터 발끝까지 풀바디.
// 헤어/모자는 머리에 합성, 의상은 상체~허벅지, 신발은 발에 합성.
const BASE_STYLE_MALE = `${STYLE_BASE.replace("isolated on PURE WHITE background (#ffffff), centered, no shadows on background, ", "")} Cute chibi BOY base character, FULL BODY standing pose front view, big chibi head proportion (head about 35% of body height), tiny cute body. LARGE expressive eyes, simple round face. VERY SHORT clean neat dark hair (buzz cut or crew cut), low-profile hairstyle. Plain neutral gray crew-neck t-shirt, simple navy shorts or pants, plain white sneakers. Arms hanging naturally at sides. Friendly slight smile, neutral front view looking forward. Standing straight on invisible ground. Isolated on plain SOFT PASTEL solid background (single color). Character CENTERED with proportions: TOP OF HEAD at vertical 5%, EYES at 22%, mouth at 28%, NECK at 38%, SHOULDERS at 42%, WAIST at 60%, KNEES at 80%, FEET at 95%. Full body visible, NO cropping at feet. No accessories. No glasses.`;

const BASE_STYLE_FEMALE = `${STYLE_BASE.replace("isolated on PURE WHITE background (#ffffff), centered, no shadows on background, ", "")} Cute chibi GIRL base character, FULL BODY standing pose front view, big chibi head proportion (head about 35% of body height), tiny cute body. LARGE expressive eyes with long lashes, simple round face. Short tidy SHOULDER-LENGTH BOB hairstyle, neat. Plain neutral gray crew-neck t-shirt, simple skirt or pants (knee-length), plain white sneakers. Arms hanging naturally at sides. Friendly soft smile, front view looking forward. Standing straight on invisible ground. Isolated on plain SOFT PASTEL solid background. Character CENTERED: TOP OF HEAD at 5%, EYES at 22%, mouth at 28%, NECK at 38%, SHOULDERS at 42%, WAIST at 60%, KNEES at 80%, FEET at 95%. Full body visible, NO cropping at feet. No accessories. No glasses.`;

// 기본 BASE_STYLE = male (backward compat)
const BASE_STYLE = BASE_STYLE_MALE;

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
    prompt: `${ITEM_ONLY_STYLE} A HUGE round curly afro hairstyle wig, FULL VIVID RAINBOW SPECTRUM with clearly distinct color stripes/sections (RED at top, ORANGE, YELLOW, GREEN, BLUE, PURPLE at bottom - all 6 rainbow colors MUST be clearly visible and distinct), big bouncy poofy round shape like a rainbow puff ball, NOT pink, NOT just one color, MUST be multi-color rainbow.`,
  },
  {
    id: "hair_silver_long",
    slot: "hair",
    name: "은빛 장발",
    description: "달빛처럼 빛나는 은발",
    rarity: "rare",
    price: 450000,
    prompt: `${ITEM_ONLY_STYLE} A long straight silver hairstyle wig viewed FROM FRONT (complete head-covering wig piece): smooth shiny silver hair covering the entire top of the head with center parting, hair flowing straight down past the shoulders to mid-chest length on both sides framing where the face would be, full smooth bangs across the forehead, no curls just straight silky hair, polished metallic silver-white color with subtle pale blue highlights. The wig fills 75% of the frame vertically (from top of head to mid-chest). FULLY OPAQUE solid color (NOT translucent, NOT see-through, NOT shimmering glitter). Simple flat cartoon shape with CLEAN smooth outlines (2-3px thick black line), centered, NO sparkles, NO glow effects.`,
  },
  {
    id: "hair_pink_twin",
    slot: "hair",
    name: "핑크 트윈테일",
    description: "발랄한 핑크 트윈테일",
    rarity: "rare",
    price: 300000,
    prompt: `${ITEM_ONLY_STYLE} A pink twin-tail hairstyle wig with two pigtails tied with ribbons, bubblegum pink color, fluffy and cute.`,
  },
  {
    id: "hair_braid_blonde",
    slot: "hair",
    name: "황금 땋은머리",
    description: "공주님 같은 황금색 땋은머리",
    rarity: "epic",
    price: 900000,
    prompt: `${ITEM_ONLY_STYLE} A long golden braided hairstyle wig, one thick braid coming down from middle parting, princess style, warm honey blonde color.`,
  },
  {
    id: "hair_fire",
    slot: "hair",
    name: "불꽃 머리",
    description: "활활 타오르는 불꽃 머리",
    rarity: "legendary",
    price: 4000000,
    prompt: `${ITEM_ONLY_STYLE} A spiky hairstyle wig that looks like animated fire, gradient from red to orange to yellow with flame-shaped tips, dynamic flowing flames, cartoon style.`,
  },
  {
    id: "hair_galaxy",
    slot: "hair",
    name: "은하수 머리",
    description: "별이 박힌 우주빛 머리",
    rarity: "legendary",
    price: 5000000,
    prompt: `${ITEM_ONLY_STYLE} A long wavy hairstyle wig viewed from front, deep navy and dark purple cosmic colors with subtle nebula gradient, tiny white star/sparkle highlights scattered, shoulder-length straight-down wavy strands, CLEAN smooth outlines, simple cartoon shape (NOT messy, NOT rough edges).`,
  },
  {
    id: "hair_short_brown",
    slot: "hair",
    name: "단정 단발",
    description: "단정한 갈색 단발",
    rarity: "common",
    price: 50000,
    prompt: `${ITEM_ONLY_STYLE} A short brown bob haircut wig, neat and tidy, chin-length, warm chestnut brown color, simple shape.`,
  },
  {
    id: "hair_mint",
    slot: "hair",
    name: "민트 단발",
    description: "상쾌한 민트색 머리",
    rarity: "rare",
    price: 250000,
    prompt: `${ITEM_ONLY_STYLE} A short mint green colored bob wig, fresh pastel mint color, slightly fluffy, cute style.`,
  },
  // ===== 추가 헤어 6종 (포니테일·똥머리·남자스타일) =====
  {
    id: "hair_ponytail_brown",
    slot: "hair",
    name: "포니테일",
    description: "발랄한 갈색 포니테일",
    rarity: "rare",
    price: 350000,
    prompt: `${ITEM_ONLY_STYLE} A brown ponytail hairstyle wig viewed from the front, hair pulled back tightly and tied at the back of the head with a small black rubber band, a long ponytail tail visible on one side, warm chestnut brown color, neat tidy front bangs, cute girl style.`,
  },
  {
    id: "hair_bun_black",
    slot: "hair",
    name: "똥머리",
    description: "정수리 위에 묶은 똥머리",
    rarity: "rare",
    price: 300000,
    prompt: `${ITEM_ONLY_STYLE} A LARGE black hair top-knot bun hairstyle wig viewed from FRONT, dark glossy black hair shaped like a complete head-covering wig: thick smooth crown of hair covering the entire top of the head, side hair flowing down past the ears on both sides, a BIG round ball-shaped bun rising prominently ABOVE the top of the head (clearly visible silhouette), full straight bangs covering the forehead area, baby hairs framing the face, hair tied with a small black band at the base of the bun. The wig MUST fill 70% of the frame vertically (from very top of bun to below ear level). Solid jet-black color with subtle dark blue highlights for volume. Simple flat cartoon shape, CLEAN smooth outlines, centered, NOT tiny, NOT just a bun alone — full hairstyle wig.`,
  },
  {
    id: "hair_undercut_male",
    slot: "hair",
    name: "남자 언더컷",
    description: "스타일리쉬한 남자 언더컷",
    rarity: "rare",
    price: 280000,
    prompt: `${ITEM_ONLY_STYLE} A male undercut hairstyle wig viewed FROM FRONT, the wig is a complete head-covering hair piece: a FULL VOLUMINOUS TOP of medium-length hair (about 6-8cm long) covering the entire crown of the head and swept stylishly to one side (LEFT side parting), the top hair forms a smooth wave shape across the head, with very short neatly trimmed (shaved-look) sides covering the area where the ears would be in a thinner darker layer, dark chocolate brown color with subtle highlights. The TOP HAIR must be the main visible feature, NOT just side strips. The wig fills 60% of the frame vertically (top of head down to ear level). Simple flat cartoon shape with CLEAN smooth outlines, centered in frame.`,
  },
  {
    id: "hair_messy_male",
    slot: "hair",
    name: "남자 헝클어진머리",
    description: "자연스럽게 헝클어진 남자머리",
    rarity: "common",
    price: 80000,
    prompt: `${ITEM_ONLY_STYLE} A messy boy hairstyle wig viewed FROM FRONT (complete head-covering wig shape): smooth rounded helmet-shape of dark brown hair covering the entire top of the head and forehead, the surface of the hair has gentle natural waves and slightly tousled texture (NOT spiky, NOT extreme messy, NOT lightning bolt shape, NOT jagged peaks), short choppy ends visible at the hair edges around the ears, length covering down to just above the ears, dark chocolate brown color with subtle lighter highlights. The wig fills 45% of the frame vertically (top of head to ear level). FULLY OPAQUE solid color, NOT translucent. Simple flat cartoon shape with CLEAN 2-3px black outlines, centered, rounded silhouette.`,
  },
  {
    id: "hair_slick_back_male",
    slot: "hair",
    name: "남자 올백머리",
    description: "단정한 올백 스타일",
    rarity: "rare",
    price: 320000,
    prompt: `${ITEM_ONLY_STYLE} A slick-back hairstyle wig for a boy, hair combed straight back from the forehead, neat tidy appearance, glossy black color, mature dignified look, professional style.`,
  },
  {
    id: "hair_long_wavy_brown",
    slot: "hair",
    name: "긴 웨이브",
    description: "우아한 갈색 긴 웨이브",
    rarity: "epic",
    price: 1000000,
    prompt: `${ITEM_ONLY_STYLE} A long wavy brown hairstyle wig, soft cascading waves flowing down past the shoulders, warm chocolate brown color, gentle parted bangs in middle, elegant feminine style, voluminous and shiny.`,
  },
];

// ============================================================================
// 모자/관 (8종)
// ============================================================================
const HAT_ITEMS = [
  {
    id: "hat_crown_gold",
    slot: "hat",
    name: "황금 왕관",
    description: "왕족의 황금 왕관",
    rarity: "legendary",
    price: 8000000,
    prompt: `${ITEM_ONLY_STYLE} A royal golden crown with red ruby, blue sapphire and green emerald gemstones embedded in front, ornate medieval design, shimmering gold.`,
  },
  {
    id: "hat_witch",
    slot: "hat",
    name: "마법사 모자",
    description: "별이 박힌 마법사 모자",
    rarity: "epic",
    price: 1300000,
    prompt: `${ITEM_ONLY_STYLE} A purple witch hat, tall pointed cone shape, wide curved brim, decorated with small yellow stars and a crescent moon buckle.`,
  },
  {
    id: "hat_baseball_red",
    slot: "hat",
    name: "빨간 야구모자",
    description: "스포츠 감성 빨간 야구모자",
    rarity: "common",
    price: 70000,
    prompt: `${ITEM_ONLY_STYLE} A red baseball cap with a small white star logo on front, classic curved brim, casual sporty look.`,
  },
  {
    id: "hat_beanie_yellow",
    slot: "hat",
    name: "노란 비니",
    description: "겨울 감성 노란 비니",
    rarity: "common",
    price: 60000,
    prompt: `${ITEM_ONLY_STYLE} A yellow knitted beanie hat with a small pom-pom on top, cozy winter style, visible knit texture.`,
  },
  {
    id: "hat_chef",
    slot: "hat",
    name: "셰프 모자",
    description: "요리 마스터의 셰프 모자",
    rarity: "rare",
    price: 350000,
    prompt: `${ITEM_ONLY_STYLE} A classic white chef toque hat, tall puffy pleated top, simple band, professional cook style.`,
  },
  {
    id: "hat_graduation",
    slot: "hat",
    name: "졸업 모자",
    description: "졸업식의 검은 학사모",
    rarity: "rare",
    price: 400000,
    prompt: `${ITEM_ONLY_STYLE} A black graduation mortarboard cap with a gold tassel hanging from the side, academic style, square top.`,
  },
  {
    id: "hat_devil_horns",
    slot: "hat",
    name: "악마 뿔",
    description: "장난스러운 빨간 악마 뿔",
    rarity: "epic",
    price: 1000000,
    prompt: `${ITEM_ONLY_STYLE} A pair of red devil horns headband, small curved horns, cartoonish, no head visible, just the horn accessory floating in space.`,
  },
  {
    id: "hat_angel_halo",
    slot: "hat",
    name: "천사 후광",
    description: "신성한 황금 후광",
    rarity: "legendary",
    price: 3500000,
    prompt: `${ITEM_ONLY_STYLE} A glowing golden angel halo ring, floating circle of golden light with soft yellow glow rays around it, no character, just the halo.`,
  },
];

// ============================================================================
// 안경/마스크 (8종)
// ============================================================================
const GLASSES_ITEMS = [
  {
    id: "glasses_round_black",
    slot: "glasses",
    name: "동그란 안경",
    description: "지적인 검은 둥근 안경",
    rarity: "common",
    price: 40000,
    prompt: `${ITEM_ONLY_STYLE} A pair of round black-rimmed eyeglasses, simple circular lenses, intellectual look, thin black frame.`,
  },
  {
    id: "glasses_aviator",
    slot: "glasses",
    name: "에이비에이터",
    description: "쿨한 비행사 선글라스",
    rarity: "rare",
    price: 300000,
    prompt: `${ITEM_ONLY_STYLE} A pair of aviator sunglasses, teardrop-shaped lenses, dark gradient lenses, gold metal frame, classic pilot style.`,
  },
  {
    id: "glasses_star",
    slot: "glasses",
    name: "별모양 안경",
    description: "톡톡 튀는 별 모양 안경",
    rarity: "epic",
    price: 900000,
    prompt: `${ITEM_ONLY_STYLE} A pair of star-shaped sunglasses, five-pointed star outline lenses, hot pink frame, playful idol style.`,
  },
  {
    id: "glasses_heart_pink",
    slot: "glasses",
    name: "하트 선글라스",
    description: "사랑스러운 하트 선글라스",
    rarity: "rare",
    price: 250000,
    prompt: `${ITEM_ONLY_STYLE} A pair of heart-shaped sunglasses, pink heart-outline lenses, transparent pink tint, cute style.`,
  },
  {
    id: "glasses_eyepatch",
    slot: "glasses",
    name: "해적 안대",
    description: "용감한 해적의 검은 안대",
    rarity: "epic",
    price: 1100000,
    prompt: `${ITEM_ONLY_STYLE} A black pirate eyepatch with a small white skull drawing in the center, leather texture, single eye coverage with string strap.`,
  },
  {
    id: "glasses_mask_medic",
    slot: "glasses",
    name: "마스크",
    description: "보건의 흰 마스크",
    rarity: "common",
    price: 30000,
    prompt: `${ITEM_ONLY_STYLE} A white medical face mask with ear loops, simple folded design, hospital style, hanging in mid-air.`,
  },
  {
    id: "glasses_3d",
    slot: "glasses",
    name: "3D 안경",
    description: "복고 감성 3D 안경",
    rarity: "rare",
    price: 280000,
    prompt: `${ITEM_ONLY_STYLE} A pair of retro 3D movie glasses, one red lens and one blue/cyan lens, simple cardboard frame, vintage cinema style.`,
  },
  {
    id: "glasses_monocle",
    slot: "glasses",
    name: "외알 안경",
    description: "신사의 외알 안경",
    rarity: "epic",
    price: 950000,
    prompt: `${ITEM_ONLY_STYLE} A single golden monocle eyeglass with a long curled chain dangling from it, classic Victorian gentleman style, ornate frame.`,
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
    prompt: `${ITEM_ONLY_STYLE} A traditional Korean hanbok top (jeogori), deep cobalt blue color with white collar and ribbon (otgoreum), shoulders to chest area, no person inside, flat lay style. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "outfit_astronaut",
    slot: "outfit",
    name: "우주복",
    description: "꿈을 향한 우주복",
    rarity: "legendary",
    price: 4500000,
    prompt: `${ITEM_ONLY_STYLE} A white astronaut spacesuit upper portion, helmet with reflective visor and gold trim, chest control panel with patches, NASA-style mission badge, no person inside. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "outfit_chef",
    slot: "outfit",
    name: "셰프복",
    description: "요리사의 흰 셰프복",
    rarity: "rare",
    price: 400000,
    prompt: `${ITEM_ONLY_STYLE} A white chef jacket, double-breasted with two rows of buttons, neckerchief tied at the collar, professional kitchen wear, no person, just the jacket. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "outfit_school",
    slot: "outfit",
    name: "교복",
    description: "단정한 교복",
    rarity: "common",
    price: 80000,
    prompt: `${ITEM_ONLY_STYLE} A Korean school uniform top, navy blazer with red striped tie and white shirt collar, simple emblem on chest pocket, no person inside. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "outfit_kpop_idol",
    slot: "outfit",
    name: "아이돌 무대의상",
    description: "반짝이는 아이돌 무대의상",
    rarity: "legendary",
    price: 6000000,
    prompt: `${ITEM_ONLY_STYLE} A sparkly silver K-pop idol stage outfit jacket, glittery sequins, decorative tassels and chains, dazzling colorful gems on the chest, no person. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "outfit_police",
    slot: "outfit",
    name: "경찰복",
    description: "정의의 경찰복",
    rarity: "rare",
    price: 500000,
    prompt: `${ITEM_ONLY_STYLE} A police officer uniform top, navy blue blazer with badge on chest, shoulder epaulets, gold buttons, professional look, no person inside. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "outfit_doctor",
    slot: "outfit",
    name: "의사 가운",
    description: "흰 의사 가운",
    rarity: "rare",
    price: 450000,
    prompt: `${ITEM_ONLY_STYLE} A white doctor lab coat with a stethoscope around the collar, name tag on chest pocket, professional medical wear, no person. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "outfit_robe_wizard",
    slot: "outfit",
    name: "마법사 로브",
    description: "신비로운 마법사 로브",
    rarity: "epic",
    price: 1700000,
    prompt: `${ITEM_ONLY_STYLE} A purple wizard robe with golden star patterns and moons embroidered, wide flowing sleeves, mystical magical aesthetic, no person inside. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  // ===== 명품 초고가 의상 8종 (저작권 회피 - 가공의 럭셔리 디자인) =====
  {
    id: "luxury_suit_gold",
    slot: "outfit",
    name: "황금 명품 정장",
    description: "황금 자수 + 다이아 시계 + 명품 목걸이가 어우러진 최고급 정장",
    rarity: "legendary",
    price: 15000000,
    prompt: `${ITEM_ONLY_STYLE} An ultra luxury formal suit jacket with ornate golden embroidery on the lapels, a sparkling diamond-encrusted wristwatch peeking from one sleeve, a thick golden chain necklace visible above the collar, deep navy fabric with gold pinstripes, premium designer aesthetic, NO brand logos, NO recognizable celebrity, generic ultra-luxury cartoon style, opulent and ornate. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "luxury_dress_diamond",
    slot: "outfit",
    name: "다이아몬드 드레스",
    description: "다이아몬드가 박힌 빛나는 최고급 드레스",
    rarity: "legendary",
    price: 25000000,
    prompt: `${ITEM_ONLY_STYLE} An ultra luxurious diamond-encrusted evening dress upper portion, sparkling silver fabric covered in tiny diamond gemstones, plunging V-neckline with elaborate diamond necklace, off-shoulder design with delicate gold trim, glamorous red-carpet style, NO brand logos, generic ultra-luxury cartoon look, dazzling and opulent. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "luxury_royal_robe",
    slot: "outfit",
    name: "왕족 망토",
    description: "황실의 최고급 황금 자수 망토",
    rarity: "legendary",
    price: 30000000,
    prompt: `${ITEM_ONLY_STYLE} An imperial royal robe with rich red velvet fabric, white ermine fur trim around the neckline and shoulders, elaborate gold embroidery patterns, crown jewels brooch on the chest, regal majestic appearance, NOT any specific country's royal family design, generic fantasy royalty. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "luxury_designer_coat",
    slot: "outfit",
    name: "명품 디자이너 코트",
    description: "감각적인 패션의 정점 - 명품 디자이너 코트",
    rarity: "legendary",
    price: 12000000,
    prompt: `${ITEM_ONLY_STYLE} A high-fashion designer trench coat in cream tan color, oversized lapels, leather belt with gold buckle (NO logo), gold buttons, an expensive looking leather handbag visible on one shoulder strap (NO brand logo, generic luxury bag design), runway fashion week aesthetic, NO brand markings. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "luxury_hanbok_gold",
    slot: "outfit",
    name: "황금 명품 한복",
    description: "황금 자수가 화려한 명품 전통 한복",
    rarity: "legendary",
    price: 18000000,
    prompt: `${ITEM_ONLY_STYLE} A luxury traditional Korean hanbok top (jeogori), deep royal purple silk with intricate gold thread embroidery of phoenix and clouds, white collar with gold trim, elaborate otgoreum ribbon with jade pendant, ornate jeweled hair pin visible, high-end ceremonial hanbok, dignified and opulent. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "luxury_athletic_set",
    slot: "outfit",
    name: "명품 트레이닝복",
    description: "디자이너 컬렉션의 최고급 트레이닝복",
    rarity: "epic",
    price: 8000000,
    prompt: `${ITEM_ONLY_STYLE} A high-end designer athletic tracksuit top, sleek black with gold metallic stripes down the sleeves, premium technical fabric texture, expensive looking gold zipper, a thick golden chain visible at the neckline, NO brand logos, generic ultra-premium streetwear style, hip-hop luxury aesthetic. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "luxury_fur_coat",
    slot: "outfit",
    name: "명품 모피 코트",
    description: "부드러운 모피로 만든 최고급 겨울 코트",
    rarity: "legendary",
    price: 22000000,
    prompt: `${ITEM_ONLY_STYLE} A luxurious faux fur coat in soft white cream color, plush thick fur texture, large fur collar wrapping around the neck, an elegant pearl necklace draped over the collar, sleek tailored silhouette, winter glamour, NO brand logos, ultra-rich aesthetic. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
  },
  {
    id: "luxury_kpop_stage",
    slot: "outfit",
    name: "명품 무대의상",
    description: "스타가 입을 법한 화려한 무대의상",
    rarity: "legendary",
    price: 20000000,
    prompt: `${ITEM_ONLY_STYLE} A dazzling K-pop idol stage outfit jacket fully covered in iridescent rhinestones and silver sequins, elaborate gold chain decorations, decorative epaulets on the shoulders with tassels, plunging V-neck with multiple layered chain necklaces, NO brand logos, NO recognizable celebrity face, generic ultra-glamorous stage costume. FULL BODY OUTFIT SET - vertical composition: top/jacket at vertical 8-45%, pants/skirt at 45-75%, shoes at 80-95%. Arrange standing upright as if on invisible mannequin (NO person, NO body visible, just clothing items).`,
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
    prompt: `${SCENE_STYLE} A vibrant outer space scene, deep navy and purple cosmos with bright twinkling stars, a colorful nebula in the distance, a small planet, no characters or text.`,
  },
  {
    id: "bg_ocean",
    slot: "background",
    name: "바닷속 산호초",
    description: "다채로운 바다 산호초",
    rarity: "rare",
    price: 300000,
    prompt: `${SCENE_STYLE} An underwater coral reef scene, vibrant pink and orange corals, small colorful fish swimming, light beams from above, blue gradient water, no characters or text.`,
  },
  {
    id: "bg_library",
    slot: "background",
    name: "도서관",
    description: "지식의 마법 도서관",
    rarity: "rare",
    price: 250000,
    prompt: `${SCENE_STYLE} A cozy magical library interior, tall wooden bookshelves filled with colorful books, warm golden lamplight, floating glowing magical orbs, no characters or readable text on books.`,
  },
  {
    id: "bg_sunset_beach",
    slot: "background",
    name: "노을 해변",
    description: "황금빛 노을 해변",
    rarity: "common",
    price: 80000,
    prompt: `${SCENE_STYLE} A sunset beach scene, warm orange and pink sky, golden sun setting on the horizon, calm sea reflecting colors, sandy beach in foreground, palm tree silhouette, no characters.`,
  },
  {
    id: "bg_castle",
    slot: "background",
    name: "마법의 성",
    description: "동화 속 마법의 성",
    rarity: "legendary",
    price: 3800000,
    prompt: `${SCENE_STYLE} A fairy tale magical castle on a hill, blue and purple turrets with golden flags, glowing windows, rainbow in the sky, lush green grounds, fantasy vibe, no characters or text.`,
  },
  {
    id: "bg_forest",
    slot: "background",
    name: "신비의 숲",
    description: "반짝이는 신비의 숲",
    rarity: "common",
    price: 90000,
    prompt: `${SCENE_STYLE} An enchanted forest, tall green trees with glowing yellow firefly sparkles, soft sunlight beams through leaves, mushrooms on the ground, mystical atmosphere, no characters.`,
  },
  {
    id: "bg_neon_city",
    slot: "background",
    name: "네온 도시",
    description: "사이버펑크 네온 도시",
    rarity: "epic",
    price: 1400000,
    prompt: `${SCENE_STYLE} A cyberpunk neon city skyline at night, tall buildings with bright pink and cyan neon signs, rainy reflective streets, futuristic vibe, no readable text on signs (just neon shapes), no characters.`,
  },
  {
    id: "bg_aurora",
    slot: "background",
    name: "오로라",
    description: "북극의 환상적인 오로라",
    rarity: "legendary",
    price: 3200000,
    prompt: `${SCENE_STYLE} A polar aurora borealis scene, green and pink northern lights waving across a starry sky, snowy mountain silhouettes below, magical winter atmosphere, no characters.`,
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
    prompt: `${EFFECT_STYLE} Small white and gold sparkles, plus-shaped twinkles scattered around the frame, semi-transparent overlay.`,
  },
  {
    id: "effect_hearts",
    slot: "effect",
    name: "하트 폭발",
    description: "사랑스러운 하트 폭발",
    rarity: "rare",
    price: 220000,
    prompt: `${EFFECT_STYLE} Pink and red heart shapes floating up and around in various sizes, valentine vibe, semi-transparent.`,
  },
  {
    id: "effect_lightning",
    slot: "effect",
    name: "번개",
    description: "강력한 번개 이펙트",
    rarity: "epic",
    price: 1000000,
    prompt: `${EFFECT_STYLE} Bright yellow lightning bolts and electric arcs zigzagging from frame edges, electric blue glow, dynamic energy.`,
  },
  {
    id: "effect_fire_aura",
    slot: "effect",
    name: "불꽃 오라",
    description: "활활 타오르는 불꽃 오라",
    rarity: "legendary",
    price: 2800000,
    prompt: `${EFFECT_STYLE} Flame aura silhouette around an empty center, red orange yellow gradient flames licking upward from the bottom and sides, dynamic fire energy.`,
  },
  {
    id: "effect_petals",
    slot: "effect",
    name: "벚꽃잎",
    description: "흩날리는 벚꽃잎",
    rarity: "rare",
    price: 180000,
    prompt: `${EFFECT_STYLE} Pink cherry blossom petals (sakura) falling and floating, semi-transparent, gentle spring atmosphere.`,
  },
  {
    id: "effect_snow",
    slot: "effect",
    name: "눈송이",
    description: "은은한 눈송이",
    rarity: "common",
    price: 40000,
    prompt: `${EFFECT_STYLE} White snowflakes of various sizes drifting down, six-point crystalline shapes, semi-transparent winter feel.`,
  },
  {
    id: "effect_rainbow_ring",
    slot: "effect",
    name: "무지개 링",
    description: "주변에 도는 무지개 링",
    rarity: "epic",
    price: 1300000,
    prompt: `${EFFECT_STYLE} Rainbow colored ring/halo encircling the center, gradient red orange yellow green blue purple, magical glow.`,
  },
  {
    id: "effect_butterflies",
    slot: "effect",
    name: "나비 떼",
    description: "아름다운 나비 떼",
    rarity: "rare",
    price: 250000,
    prompt: `${EFFECT_STYLE} Several colorful butterflies (blue, purple, yellow) floating around the frame, peaceful magical mood.`,
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
    prompt: `${PRESET_STYLE} A cute chibi pirate captain character, head and shoulders bust, wearing a tricorne pirate hat with skull emblem, black eyepatch, red sailor coat with gold buttons, scarf around neck, smiling confidently. Solid teal background.`,
  },
  {
    id: "preset_princess",
    slot: "preset",
    name: "동화 공주",
    description: "동화 속 우아한 공주",
    rarity: "legendary",
    price: 5000000,
    prompt: `${PRESET_STYLE} A cute chibi princess character, head and shoulders bust, long golden braided hair, small tiara with pink jewel, pink frilly dress with white lace collar, gentle smile, sparkling eyes. Solid pastel pink background.`,
  },
  {
    id: "preset_ninja",
    slot: "preset",
    name: "닌자",
    description: "그림자 속의 닌자",
    rarity: "epic",
    price: 2200000,
    prompt: `${PRESET_STYLE} A cute chibi ninja character, head and shoulders bust, black ninja headband (hachimaki), black mask covering nose and mouth (only eyes visible), determined fierce eyes, black ninja outfit. Solid dark navy background.`,
  },
  {
    id: "preset_astronaut",
    slot: "preset",
    name: "우주비행사",
    description: "별을 향한 우주비행사",
    rarity: "legendary",
    price: 4800000,
    prompt: `${PRESET_STYLE} A cute chibi astronaut character, head and shoulders bust, white spacesuit, helmet visor reflecting stars and a nebula, friendly smile visible through the clear visor, NASA-style patch on chest. Solid deep blue background.`,
  },
  {
    id: "preset_wizard",
    slot: "preset",
    name: "꼬마 마법사",
    description: "별을 다루는 꼬마 마법사",
    rarity: "epic",
    price: 1800000,
    prompt: `${PRESET_STYLE} A cute chibi child wizard character, head and shoulders bust, purple pointed wizard hat with golden stars, round magic spectacles, dark blue robe with star pattern, mischievous smile. Solid purple background.`,
  },
  {
    id: "preset_chef",
    slot: "preset",
    name: "꼬마 셰프",
    description: "맛있는 음식을 만드는 셰프",
    rarity: "rare",
    price: 500000,
    prompt: `${PRESET_STYLE} A cute chibi child chef character, head and shoulders bust, tall white chef toque hat, white double-breasted chef jacket, red neckerchief, holding a wooden spoon up beside head, cheerful smile. Solid pale yellow background.`,
  },
  {
    id: "preset_doctor",
    slot: "preset",
    name: "꼬마 의사",
    description: "환자를 돌보는 친절한 의사",
    rarity: "rare",
    price: 500000,
    prompt: `${PRESET_STYLE} A cute chibi child doctor character, head and shoulders bust, white doctor lab coat, stethoscope around the neck, kind smile, neat hair. Solid pale mint green background.`,
  },
  {
    id: "preset_idol",
    slot: "preset",
    name: "K-팝 아이돌",
    description: "무대를 사로잡는 아이돌",
    rarity: "legendary",
    price: 5500000,
    prompt: `${PRESET_STYLE} A cute chibi K-pop idol character, head and shoulders bust, stylish pink hair with bangs, sparkly silver stage outfit with chains and gems, wireless headset microphone, vibrant cheerful expression. Solid hot pink background.`,
  },
  {
    id: "preset_robot",
    slot: "preset",
    name: "꼬마 로봇",
    description: "삐삐 신호를 보내는 로봇",
    rarity: "rare",
    price: 600000,
    prompt: `${PRESET_STYLE} A cute chibi robot character, head and shoulders bust, square metal robot head with antenna, glowing blue circular eyes, simple smile on display screen mouth, gray-blue metal body. Solid light gray background.`,
  },
  {
    id: "preset_vampire",
    slot: "preset",
    name: "귀여운 뱀파이어",
    description: "사랑스러운 어린 뱀파이어",
    rarity: "epic",
    price: 1600000,
    prompt: `${PRESET_STYLE} A cute chibi child vampire character, head and shoulders bust, black hair with a single white streak, small fangs in friendly smile, black cape with red lining around shoulders, golden bat-shape pendant. Solid dark red background.`,
  },
  {
    id: "preset_angel",
    slot: "preset",
    name: "꼬마 천사",
    description: "흰 날개를 가진 어린 천사",
    rarity: "legendary",
    price: 3800000,
    prompt: `${PRESET_STYLE} A cute chibi child angel character, head and shoulders bust, soft blond curly hair, glowing golden halo above head, small white feathered wings peeking from behind shoulders, white robe, gentle smile. Solid sky blue background.`,
  },
  {
    id: "preset_devil",
    slot: "preset",
    name: "꼬마 악마",
    description: "장난기 가득한 어린 악마",
    rarity: "epic",
    price: 1700000,
    prompt: `${PRESET_STYLE} A cute chibi child devil character (cartoon, not scary), head and shoulders bust, red curved horns, dark red hair, mischievous grin, small bat wings behind shoulders, black outfit. Solid dark crimson background.`,
  },
  {
    id: "preset_mermaid",
    slot: "preset",
    name: "꼬마 인어",
    description: "바닷속에서 노래하는 인어",
    rarity: "epic",
    price: 1800000,
    prompt: `${PRESET_STYLE} A cute chibi mermaid character, head and shoulders bust, long flowing teal-green wavy hair, pink seashells in hair, shell necklace, slight hint of teal fish-tail scales on shoulders, friendly smile. Solid ocean teal background.`,
  },
  {
    id: "preset_dragon_tamer",
    slot: "preset",
    name: "용 조련사",
    description: "어깨에 작은 용을 데리고 다니는 조련사",
    rarity: "legendary",
    price: 6000000,
    prompt: `${PRESET_STYLE} A cute chibi dragon tamer character, head and shoulders bust, brown adventurer outfit with leather strap, a tiny baby red dragon perched on the shoulder breathing a small flame, brave smile. Solid sunset orange background.`,
  },
  {
    id: "preset_student_default",
    slot: "preset",
    name: "기본 학생",
    description: "친근한 일반 학생",
    rarity: "common",
    price: 100000,
    prompt: `${PRESET_STYLE} A cute chibi elementary school student character, head and shoulders bust, neat short black hair, navy school uniform top with red striped tie, friendly bright smile. Solid pale blue background.`,
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
    prompt: `${BASE_STYLE_MALE} Skin tone: light beige. Eyes: medium round dark brown eyes. Expression: friendly slight smile. Background color: soft pale blue (#dbeafe).`,
  },
  {
    id: "base_female",
    slot: "base",
    name: "여자 (단정한 단발)",
    description: "단정한 단발의 여자 얼굴",
    rarity: "common",
    price: 0,
    prompt: `${BASE_STYLE_FEMALE} Skin tone: light beige. Eyes: large round dark brown eyes with long lashes. Expression: gentle soft smile. Background color: soft pale pink (#fce7f3).`,
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
  prompt: "deprecated",
}));

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
  imageUrl: item.active === false ? "" : `/avatar-shop/${item.id}.png`,
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
