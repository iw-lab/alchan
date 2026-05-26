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

// HAIR/ITEM CRITICAL: 모든 hair PNG는 반드시 FULLY OPAQUE solid color여야 함.
// 사용자가 반복적으로 "투명/흐림" 불만 → 강제 명시.
const OPACITY_RULE = "CRITICAL OPACITY: the entire hair body must be FULLY OPAQUE 100% solid filled color (NO translucent areas, NO transparency, NO see-through, NO gradient fade, NO white-washed lightness). Bold saturated solid color throughout. The hair color must be VIBRANT and CLEARLY VISIBLE, not pale washed-out or faded. Thick black 2-3px outline around the entire hair silhouette.";

const ITEM_ONLY_STYLE = `${STYLE_BASE} The item floating alone in middle of frame, NO person, NO mannequin, NO head, NO body part, just the standalone clothing/accessory item. ${OPACITY_RULE}`;

// 의상(outfit/luxury) — base 캐릭터와 동일 비율의 풀바디 chibi 학생이 이 옷을 입은 모습.
// 머리/얼굴 영역(vertical 0-27%)은 반드시 PURE WHITE → 후처리 script에서 강제 알파.
// 결과: base의 머리(헤어/얼굴)는 그대로 보이고, outfit 캐릭터의 몸이 base 몸을 자연스럽게 덮음.
const OUTFIT_STYLE = `${STYLE_BASE} A chibi Korean elementary student wearing this outfit, FULL BODY front view. CRITICAL: match base character body proportions EXACTLY.

📐 BODY ANATOMY — COMPACT HALF-HEIGHT (about half the typical body length):
- SHOULDERS at vertical 30-33% (horizontal 33-67%, shoulder width 34% of canvas)
- Arms hanging STRAIGHT DOWN at sides, hands at vertical ~45%
- Waist at vertical 43%
- Knees at vertical 54%
- Feet at vertical 62% (shoes sit there; everything below 62% is empty white space)
- The character body occupies vertical 25% to 62% ONLY — short compact chibi-stub body, NOT a full-height standing figure
- Everything from vertical 62% down to 100% MUST be PURE WHITE empty space (no shoes, no shadow, no character)
- Standing straight, symmetric, facing camera

⚠️ HEAD AREA — MUST BE EMPTY WHITE (#ffffff):
- ONLY the area from vertical 0% to vertical 25% must be PURE WHITE background (head/face area)
- NO head, NO face, NO hair, NO helmet, NO hat in that top 25% — empty white space
- Base character's head will be composited on top

🧣 NECK + COLLAR — MUST be drawn (vertical 25-33%):
- This is CRITICAL: the outfit MUST have a visible NECK area (vertical 25-30%, horizontal 45-55%, skin tone or matching outfit fabric) connecting up to where the chin will be at 25%
- Then a COLLAR/NECKLINE wrapping that neck at vertical 28-33% (covers shoulders horizontal 33-67%)
- NO empty white gap between the head area (0-25%) and the outfit body — the neck/collar MUST fill 25-33% so the head appears to sit on the outfit naturally
- For high-collar outfits (turtleneck/spacesuit) the collar wraps the neck fully; for v-neck/shirt outfits the skin-tone neck is visible above the collar

👕 OUTFIT — COMPACT BODY FROM SHOULDERS (30%) TO FEET (62%):
- Body must occupy ONLY vertical 30% to 62% — short compact half-height body (about half of normal student height)
- Skin tone visible at hands (~45%) and ankles if pants short
- Arms straight down, legs short and stubby, parallel
- Korean cartoon flat illustration, thick 2-3px black outlines, vibrant solid colors`;

const SCENE_STYLE = `${STYLE_BASE.replace("isolated on PURE WHITE background (#ffffff), centered, no shadows on background, ", "")} Square 1:1 scene, full bleed background, vibrant atmospheric colors.`;

const EFFECT_STYLE = `${STYLE_BASE} Magical particle effect, glowing sparkles, semi-transparent, centered, NO subject, NO character, just the visual effect / aura / pattern.`;

const PRESET_STYLE = `${STYLE_BASE} Cute chibi character, head-and-shoulders bust portrait, large expressive eyes, simple round face, big head ratio. Front view, looking forward with friendly expression. Child-friendly cartoon style, isolated on plain pastel solid background.`;

// 베이스 캐릭터 (전신 chibi) - 머리부터 발끝까지 풀바디.
// 헤어/모자는 머리에 합성, 의상은 상체~허벅지, 신발은 발에 합성.
// CRITICAL: 평범한 만화 눈 + 검정 솔리드 외곽선 (사용자 명시).
// 백내장/흐릿/거의-흰자 회피, 동공이 분명히 보이게.
const EYE_RULE = "Eyes: round shape with VERY DARK SOLID BLACK filled-in pupils that take up 60-70% of the eye area (large prominent black circles, NOT tiny dots, NOT just outline rings, the pupils MUST be solid black-filled). White sclera (visible white around the black pupil). Thick black eyelid line above each eye. The black pupils must be the most visible feature of the face. NOT cataract-looking, NOT blurry, NOT mostly-white, NOT pink, NOT all-white-with-tiny-dot.";
const OUTLINE_RULE = "SOLID CONTINUOUS BLACK outline lines (2-3px thick, pure black #000000), NOT dotted, NOT dashed, NOT pink, NOT colored, NOT broken. Clean confident line art.";

// Body 규칙 (사용자 명시 v2): head 비율 약 25% (chibi 너무 크지 않게), 풀바디, 단정한 의상
const BODY_RULE = "FULL BODY proportions like a Korean elementary student: head about 25% of total body height (NOT giant chibi 1:2 head, more like normal child proportion 1:4), normal-length neck visible, normal-length torso, normal-length arms reaching mid-thigh, normal-length legs. Character takes up 90% of canvas vertically from very top of head to bottom of shoes. NO cropping at feet or head.";
const OUTFIT_RULE = "Neat properly-dressed outfit: LONG-SLEEVE crew-neck cotton sweatshirt or t-shirt in soft gray/cream color (sleeves down to wrists, hem down to hips, FULLY COVERING the torso, NO bare skin, NO crop top), long full-length pants (jeans or chinos, ankle-length, NOT shorts), plain white low-top sneakers with simple laces. Arms hanging naturally at sides.";

const BASE_STYLE_MALE = `${STYLE_BASE.replace("isolated on PURE WHITE background (#ffffff), centered, no shadows on background, ", "")} Cute illustration of a Korean BOY elementary student base character, standing pose front view. ${BODY_RULE} ${EYE_RULE} ${OUTLINE_RULE} VERY SHORT clean neat dark hair (buzz cut), low-profile hairstyle. ${OUTFIT_RULE} Friendly slight smile (small simple curved line mouth). Standing straight on invisible ground. Isolated on plain SOFT PASTEL solid background (single color). Character CENTERED with proportions: TOP OF HEAD at vertical 5%, CHIN at 25%, NECK at 27%, SHOULDERS at 30%, WAIST at 55%, KNEES at 78%, FEET at 95%. Full body visible. No accessories. No glasses.`;

const BASE_STYLE_FEMALE = `${STYLE_BASE.replace("isolated on PURE WHITE background (#ffffff), centered, no shadows on background, ", "")} Cute illustration of a Korean GIRL elementary student base character, standing pose front view. ${BODY_RULE} ${EYE_RULE} ${OUTLINE_RULE} Short tidy SHOULDER-LENGTH BOB hairstyle, neat. ${OUTFIT_RULE} Friendly soft smile (small simple curved line mouth). Standing straight on invisible ground. Isolated on plain SOFT PASTEL solid background. Character CENTERED: TOP OF HEAD at 5%, CHIN at 25%, NECK at 27%, SHOULDERS at 30%, WAIST at 55%, KNEES at 78%, FEET at 95%. Full body visible. No accessories. No glasses.`;

// 'BALD'와 'chibi'가 충돌 → codex가 흉상으로 그림. 'chibi' 단어 자체 제거 + 일반
// "Korean elementary student" 명시. base_male 프롬프트 구조와 동일하게 두고 머리만 변경.
const BASE_STYLE_BALD = `${STYLE_BASE.replace("isolated on PURE WHITE background (#ffffff), centered, no shadows on background, ", "")} Cute illustration of a Korean elementary student standing FROM HEAD TO FEET (full body visible). ${BODY_RULE} ${EYE_RULE} ${OUTLINE_RULE} The character has NO HAIR — completely shaved bald head, smooth scalp showing skin only, NO stubble, NO hair strands, NO buzz cut texture. The bald skin tone matches the face skin tone exactly. ${OUTFIT_RULE} Friendly slight smile. Standing straight. Isolated on plain SOFT PASTEL solid background. Character CENTERED: TOP OF HEAD at 5%, CHIN at 25%, NECK at 27%, SHOULDERS at 30%, WAIST at 55%, KNEES at 78%, FEET at 95%. FULL BODY MUST be visible (NOT bust, NOT half-body).`;

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
    prompt: `${ITEM_ONLY_STYLE} A natural curly wavy hairstyle wig that fits on top of a human head — head-shaped silhouette with crown, fringe/bangs, and side strands like a real haircut. Multi-color RAINBOW streaks/highlights throughout the curls (red, orange, yellow, green, blue, purple strands woven naturally into the curly hair). Soft fluffy curls with visible strand texture. NOT a balloon, NOT a poof ball, NOT a sphere, NOT a hat — MUST look like wearable hair sitting naturally on a person's scalp, with a fringe over the forehead and side hair near the ears.`,
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
    prompt: `${ITEM_ONLY_STYLE} A golden princess braided hairstyle wig viewed FROM FRONT: smooth golden honey blonde hair covering the top of the head with simple center parting, hair sweeping down past the ears, gathered into ONE single SLENDER braid (1 single braid, NOT thick, NOT body-width, the braid should be only about 15-20% as wide as a typical torso) hanging down in front of the chest, the braid ends with a small ribbon or bow at the tail. Hair is shoulder-length around the head with the braid extending down to mid-torso. Warm honey blonde color, FULLY OPAQUE solid color (NOT translucent). Simple flat cartoon shape with CLEAN 2-3px black outlines, centered.`,
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
    name: "포니테일 (앞머리)",
    description: "앞머리 있는 갈색 포니테일",
    rarity: "rare",
    price: 350000,
    prompt: `${ITEM_ONLY_STYLE} A brown ponytail hairstyle wig viewed FROM FRONT: smooth solid chestnut brown hair tightly pulled back from the forehead and gathered at the back-top of the head with a small black rubber band, a long thick ponytail tail visible behind/beside the head extending downward, neat straight front bangs covering the forehead, the side hair smoothly swept back. The hair completely covers the entire top of the head (full helmet-shape silhouette, NOT just lines). FULLY OPAQUE solid warm chestnut brown color (NOT pale, NOT translucent). Thick clean 2-3px black outlines.`,
  },
  {
    id: "hair_ponytail_no_bangs_brown",
    slot: "hair",
    name: "포니테일 (앞머리 없음)",
    description: "이마 시원하게 앞머리 없는 포니테일",
    rarity: "rare",
    price: 350000,
    prompt: `${ITEM_ONLY_STYLE} A brown high ponytail hairstyle wig viewed FROM FRONT, NO bangs (forehead must be COMPLETELY EXPOSED, no hair on the forehead at all): solid chestnut brown hair pulled back tightly and smoothly from the hairline to the back-top of the head, gathered with a small black rubber band, a long thick ponytail tail visible behind/beside the head. The hair covers the top and sides of the head but the entire forehead area is COMPLETELY clear of hair. FULLY OPAQUE solid warm chestnut brown color. Thick clean 2-3px black outlines.`,
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
// CRITICAL: 정면 평면 뷰 강제 (사용자 명시 — 사선/측면 X).
// ============================================================================
const HAT_RULE = "STRICT FRONT VIEW (perfectly symmetric front-facing flat 2D illustration, NOT 3/4 view, NOT side angle, NOT tilted, NOT 3D perspective, NOT top-down view): the hat shown straight from the front so both sides are equally visible. Thick clean SOLID BLACK outline (3-4px). Flat sticker style with vibrant solid colors.";
const HAT_ITEMS = [
  {
    id: "hat_crown_gold",
    slot: "hat",
    name: "황금 왕관",
    description: "왕족의 황금 왕관",
    rarity: "legendary",
    price: 8000000,
    prompt: `${ITEM_ONLY_STYLE} A royal golden crown viewed STRAIGHT FROM THE FRONT (completely flat 2D sticker view, perfectly symmetric left-right, NO 3D rendering, NO perspective tilt, NO side curvature visible — only the frontal silhouette of the crown). Wide gold base band at the bottom with multiple tall pointed spikes/peaks on top, three large gemstones embedded in the center band (red ruby in middle, blue sapphire on left, green emerald on right). Solid OPAQUE bright gold fill throughout. VERY THICK 5-6px solid pure black outline around the entire crown silhouette and around each gemstone. ${HAT_RULE}`,
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
    prompt: `${ITEM_ONLY_STYLE} A red baseball cap viewed STRAIGHT FROM THE FRONT (symmetric front view, NOT 3/4 angle, NOT side view): the rounded cap dome on top and the curved brim extending forward and clearly visible at the bottom (brim shown as a horizontal symmetric curved shape below the dome). Solid OPAQUE bright red color filling the entire cap. NO logo, NO star, NO letter, NO text, NO emblem on the front — completely plain solid red. ${HAT_RULE}`,
  },
  {
    id: "hat_beanie_yellow",
    slot: "hat",
    name: "노란 비니",
    description: "겨울 감성 노란 비니",
    rarity: "common",
    price: 60000,
    prompt: `${ITEM_ONLY_STYLE} A yellow knitted beanie hat viewed STRAIGHT FROM THE FRONT (completely flat 2D sticker view, perfectly symmetric, NO 3D rendering, NO side curvature visible, NO depth shading on sides — only the frontal silhouette of the beanie). Round dome shape with a small pom-pom on top center, wide rolled cuff at the bottom edge. Solid OPAQUE bright yellow fill throughout, visible chunky knit texture lines as light gray vertical/braid pattern. VERY THICK 5-6px solid pure black outline around the entire silhouette. ${HAT_RULE}`,
  },
  {
    id: "hat_chef",
    slot: "hat",
    name: "셰프 모자",
    description: "요리 마스터의 셰프 모자",
    rarity: "rare",
    price: 350000,
    prompt: `${ITEM_ONLY_STYLE} A classic white chef toque hat viewed STRAIGHT FROM THE FRONT (symmetric front view, NOT angled, NOT 3/4 view): tall puffy mushroom-shaped pleated top with vertical fluffy folds and a WIDE TALL solid white band at the bottom (the white band is 30% of the total hat height — wide enough to fully cover the wearer's hairline and forehead, NOT a thin strip). Solid OPAQUE pure white fill throughout (with light gray pleat shading lines for the puffy top). NO visor, NO black band, NO dark band, NO headband, NO brim. VERY THICK 5-6px solid pure black outline around the entire hat silhouette (NOT gray, NOT faint, NOT dotted — completely solid dark black border). ${HAT_RULE}`,
  },
  {
    id: "hat_graduation",
    slot: "hat",
    name: "졸업 모자",
    description: "졸업식의 검은 학사모",
    rarity: "rare",
    price: 400000,
    prompt: `${ITEM_ONLY_STYLE} A LARGE DARK BLACK graduation mortarboard cap viewed STRAIGHT FROM THE FRONT (symmetric front view, NOT top-down view, NOT 3/4 angle, cap fills 75% of canvas width). CRITICAL: the entire cap is FILLED with pure DARK BLACK color #000000 (NOT white, NOT light gray, NOT empty outline — completely solid opaque jet-black fill throughout the whole cap body, must be CLEARLY VISIBLE AS SOLID BLACK silhouette). Structure: (1) wide flat square mortarboard top shown as a horizontal flat black rectangle, (2) round black cap base below it that wraps the head with a visible thick black band, (3) one bright gold tassel hanging straight down from the right edge of the square top. VERY THICK 5-6px outline. ${HAT_RULE}`,
  },
  {
    id: "hat_devil_horns",
    slot: "hat",
    name: "악마 뿔",
    description: "장난스러운 빨간 악마 뿔",
    rarity: "epic",
    price: 1000000,
    prompt: `${ITEM_ONLY_STYLE} A pair of bright red devil horns headband viewed STRAIGHT FROM THE FRONT (perfectly symmetric, NOT tilted, NOT 3D perspective): two small curved devil horns on top of a thin headband arch. Solid OPAQUE bright red fill (NO dotted texture, NO speckled pattern, NO stippled shading, NO sketchy fill — completely smooth solid red surface). VERY THICK 5-6px solid pure black continuous outline around the entire silhouette (NO dotted line, NO dashed line, NO broken line, NO gaps — ONE continuous smooth solid black border). NO head visible, just the headband accessory floating in empty space. ${HAT_RULE}`,
  },
  {
    id: "hat_angel_halo",
    slot: "hat",
    name: "천사 후광",
    description: "신성한 황금 후광",
    rarity: "legendary",
    price: 3500000,
    prompt: `${ITEM_ONLY_STYLE} A wearable angel headpiece viewed STRAIGHT FROM THE FRONT (symmetric front view): a glowing golden halo ring at the top center (thick 30-40px golden donut shape with bright yellow-gold gradient and visible radiant light rays) AND a pair of small fluffy WHITE feathered angel wings (one on each side of the halo, like a headband attachment) — both elements combined fill 80% of canvas width. The wings have soft fluffy feather texture in pure white with thin gray feather lines. Solid OPAQUE colors throughout (saturated gold halo, pure white wings). NO character, NO head, NO body — just the headpiece itself. VERY THICK 5-6px solid black outline around the halo ring AND around each wing silhouette (NOT faint, NOT dotted). Flat sticker style.`,
  },
];

// ============================================================================
// 안경/마스크 (8종)
// CRITICAL: 정면 평면 뷰 + 또렷한 검정 외곽선 강제 (사용자 명시).
// 안경 알이 비틀어지거나 3D 사선 뷰로 그려지는 문제 회피.
// ============================================================================
// 사용자 명시: 안경다리(temple arms) X, 끈/체인/귀고리 X. 정면 렌즈 + 작은 브릿지만.
const GLASSES_RULE = "STRICT FRONT VIEW only the front part visible (perfectly symmetric, NOT 3D perspective, NOT tilted, NOT rotated): both lenses as flat 2D shapes facing the viewer straight on, EQUAL SIZE, SAME horizontal line, connected by a small bridge at the center. NO temple arms, NO side arms extending to the ears, NO ear hooks, NO straps, NO strings, NO chains, NO ribbons — JUST the frontal lens portion with the central bridge. Thick clean SOLID BLACK outline (2-3px). Flat sticker style.";
const GLASSES_ITEMS = [
  {
    id: "glasses_round_black",
    slot: "glasses",
    name: "동그란 안경",
    description: "지적인 검은 둥근 안경",
    rarity: "common",
    price: 40000,
    prompt: `${ITEM_ONLY_STYLE} A pair of round black-rimmed eyeglasses with two perfect circular lenses (both lenses perfectly round and same size, large prominent circles filling 70% of canvas width). ${GLASSES_RULE} CRITICAL: VERY THICK 12-15px solid pure black #000000 OPAQUE rim around each lens (must be clearly visible as bold dark border, NOT thin, NOT light gray, NOT faint). Lenses are COMPLETELY EMPTY transparent see-through (NO fill, NO blue tint, NO color inside — just empty hole showing through to background). Small black bridge connecting two lenses. Intellectual nerdy look.`,
  },
  {
    id: "glasses_aviator",
    slot: "glasses",
    name: "에이비에이터",
    description: "쿨한 비행사 선글라스",
    rarity: "rare",
    price: 300000,
    prompt: `${ITEM_ONLY_STYLE} A pair of aviator sunglasses with two teardrop-shaped lenses (both lenses same shape and size, large filling 60% canvas width). ${GLASSES_RULE} CRITICAL: lenses are FULLY OPAQUE solid dark color filling the entire lens area (deep slate-gray to near-black, NOT transparent, NOT empty, NOT see-through — the dark lens fill must be completely visible and solid). Thick gold metal frame outline around each lens. Classic pilot style.`,
  },
  {
    id: "glasses_star",
    slot: "glasses",
    name: "별모양 안경",
    description: "톡톡 튀는 별 모양 안경",
    rarity: "epic",
    price: 900000,
    prompt: `${ITEM_ONLY_STYLE} A pair of star-shaped sunglasses with two five-pointed star lenses (both stars same size and orientation). ${GLASSES_RULE} Hot pink frame, playful idol style.`,
  },
  {
    id: "glasses_heart_pink",
    slot: "glasses",
    name: "하트 선글라스",
    description: "사랑스러운 하트 선글라스",
    rarity: "rare",
    price: 250000,
    prompt: `${ITEM_ONLY_STYLE} A pair of heart-shaped sunglasses with two heart-shaped lenses (both hearts same size and upright orientation). ${GLASSES_RULE} Pink frame, transparent pink tint lenses, cute style.`,
  },
  {
    id: "glasses_eyepatch",
    slot: "glasses",
    name: "해적 안대",
    description: "용감한 해적의 검은 안대",
    rarity: "epic",
    price: 1100000,
    prompt: `${ITEM_ONLY_STYLE} A LARGE black pirate eyepatch viewed STRAIGHT FROM THE FRONT (flat 2D, not tilted, oval covers 70% of canvas width). CRITICAL: the entire oval patch is COMPLETELY FILLED with pure JET BLACK color #000000 throughout (FULLY OPAQUE solid black interior, NOT white interior, NOT empty, NOT outline-only — must be CLEARLY VISIBLE as a solid black silhouette against any background). A clearly visible LARGE bright WHITE skull-and-crossbones drawing in the center of the black patch (skull occupying 45% of the patch area, bold white outlined skull with crossed bones, easy to see against the solid black background). NO string, NO strap, NO rope, NO band — ONLY the oval patch shape. VERY THICK 6-8px solid black outline around the oval edge. Flat sticker style.`,
  },
  {
    id: "glasses_mask_medic",
    slot: "glasses",
    name: "마스크",
    description: "보건의 흰 마스크",
    rarity: "common",
    price: 30000,
    prompt: `${ITEM_ONLY_STYLE} A white medical face mask viewed STRAIGHT FROM THE FRONT (flat 2D, not tilted, mask body fills 70% of canvas width): a rectangular pleated mask body with rounded corners. CRITICAL: the mask body is FULLY OPAQUE solid pure white #FFFFFF color (NOT transparent, NOT see-through, NOT empty outline — the white fill must be completely solid). MEDIUM-DARK gray pleat lines (RGB 80,80,80 — clearly visible horizontal pleat shading, NOT light gray, NOT faint). NO ear loops, NO straps, NO strings, NO bands — ONLY the mask body shape. VERY THICK 6-8px solid pure black #000000 outline around the entire mask edge (must be CLEARLY VISIBLE bold dark border). Flat sticker style.`,
  },
  {
    id: "glasses_3d",
    slot: "glasses",
    name: "3D 안경",
    description: "복고 감성 3D 안경",
    rarity: "rare",
    price: 280000,
    prompt: `${ITEM_ONLY_STYLE} A pair of retro 3D movie glasses with two rectangular lenses (left lens red, right lens cyan-blue, both lenses same size). ${GLASSES_RULE} Simple cardboard frame, vintage cinema style.`,
  },
  {
    id: "glasses_monocle",
    slot: "glasses",
    name: "외알 안경",
    description: "신사의 외알 안경",
    rarity: "epic",
    price: 950000,
    prompt: `${ITEM_ONLY_STYLE} A single small golden monocle eyeglass viewed STRAIGHT FROM THE FRONT (flat 2D, not tilted): ONE small circular lens sized to fit a single human eye (lens diameter takes only 25-30% of canvas width, small object centered in frame, NOT a giant decorative mirror, NOT a picture frame, NOT a hand mirror, NOT a portal — just a tiny eye-sized monocle). Simple thin gold metal circular rim around a light blue-tinted glass lens. NO chain, NO string, NO temple arm, NO ornate decorative scrollwork, NO baroque frame, NO handle. Thick clean SOLID BLACK outline (2-3px) on the gold rim. Flat sticker style.`,
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
    prompt: `${OUTFIT_STYLE} A traditional Korean hanbok top (jeogori), deep cobalt blue color with white collar and ribbon (otgoreum), shoulders to chest area, no person inside, flat lay style.`,
  },
  {
    id: "outfit_astronaut",
    slot: "outfit",
    name: "우주복",
    description: "꿈을 향한 우주복",
    rarity: "legendary",
    price: 4500000,
    prompt: `${OUTFIT_STYLE} A white astronaut spacesuit — NO HELMET (head area must remain pure white). The suit MUST have a clearly visible round white NECK COLLAR / neck ring at the top (just below the chin area, snug around the neck) so it visually connects to the character's neck (NOT floating below the neck — the collar wraps the neck like a turtleneck base). Chest control panel with colorful buttons, mission patches on shoulders, NASA-style badge, white gloves at hands, white boots at feet.`,
  },
  {
    id: "outfit_chef",
    slot: "outfit",
    name: "셰프복",
    description: "요리사의 흰 셰프복",
    rarity: "rare",
    price: 400000,
    prompt: `${OUTFIT_STYLE} A white chef jacket, double-breasted with two rows of buttons, a SMALL red neckerchief tied snugly around the collar (small triangle knot, NOT large or flowing, NOT covering the chin), professional kitchen wear, white chef pants, white kitchen shoes.`,
  },
  {
    id: "outfit_school",
    slot: "outfit",
    name: "교복",
    description: "단정한 교복",
    rarity: "common",
    price: 80000,
    prompt: `${OUTFIT_STYLE} A Korean school uniform top, navy blazer with red striped tie and white shirt collar, simple emblem on chest pocket, no person inside.`,
  },
  {
    id: "outfit_kpop_idol",
    slot: "outfit",
    name: "아이돌 무대의상",
    description: "반짝이는 아이돌 무대의상",
    rarity: "legendary",
    price: 6000000,
    prompt: `${OUTFIT_STYLE} A sparkly silver K-pop idol stage outfit jacket, glittery sequins, decorative tassels and chains, dazzling colorful gems on the chest, no person.`,
  },
  {
    id: "outfit_police",
    slot: "outfit",
    name: "경찰복",
    description: "정의의 경찰복",
    rarity: "rare",
    price: 500000,
    prompt: `${OUTFIT_STYLE} A police officer uniform top, navy blue blazer with badge on chest, shoulder epaulets, gold buttons, professional look, no person inside.`,
  },
  {
    id: "outfit_doctor",
    slot: "outfit",
    name: "의사 가운",
    description: "흰 의사 가운",
    rarity: "rare",
    price: 450000,
    prompt: `${OUTFIT_STYLE} A white doctor lab coat with a stethoscope around the collar, name tag on chest pocket, professional medical wear, no person.`,
  },
  {
    id: "outfit_robe_wizard",
    slot: "outfit",
    name: "마법사 로브",
    description: "신비로운 마법사 로브",
    rarity: "epic",
    price: 1700000,
    prompt: `${OUTFIT_STYLE} A purple wizard robe with golden star patterns and moons embroidered, wide flowing sleeves, mystical magical aesthetic, no person inside.`,
  },
  // ===== 명품 초고가 의상 8종 (저작권 회피 - 가공의 럭셔리 디자인) =====
  {
    id: "luxury_suit_gold",
    slot: "outfit",
    name: "황금 명품 정장",
    description: "황금 자수 + 다이아 시계 + 명품 목걸이가 어우러진 최고급 정장",
    rarity: "legendary",
    price: 15000000,
    prompt: `${OUTFIT_STYLE} An ultra luxury formal suit jacket with ornate golden embroidery on the lapels, a sparkling diamond-encrusted wristwatch peeking from one sleeve, a thick golden chain necklace visible above the collar, deep navy fabric with gold pinstripes, premium designer aesthetic, NO brand logos, NO recognizable celebrity, generic ultra-luxury cartoon style, opulent and ornate.`,
  },
  {
    id: "luxury_dress_diamond",
    slot: "outfit",
    name: "다이아몬드 드레스",
    description: "다이아몬드가 박힌 빛나는 최고급 드레스",
    rarity: "legendary",
    price: 25000000,
    prompt: `${OUTFIT_STYLE} An ultra luxurious diamond-encrusted evening dress upper portion, sparkling silver fabric covered in tiny diamond gemstones, plunging V-neckline with elaborate diamond necklace, off-shoulder design with delicate gold trim, glamorous red-carpet style, NO brand logos, generic ultra-luxury cartoon look, dazzling and opulent.`,
  },
  {
    id: "luxury_royal_robe",
    slot: "outfit",
    name: "왕족 망토",
    description: "황실의 최고급 황금 자수 망토",
    rarity: "legendary",
    price: 30000000,
    prompt: `${OUTFIT_STYLE} An imperial royal robe with rich red velvet fabric, white ermine fur trim around the neckline and shoulders, elaborate gold embroidery patterns, crown jewels brooch on the chest, regal majestic appearance, NOT any specific country's royal family design, generic fantasy royalty.`,
  },
  {
    id: "luxury_designer_coat",
    slot: "outfit",
    name: "명품 디자이너 코트",
    description: "감각적인 패션의 정점 - 명품 디자이너 코트",
    rarity: "legendary",
    price: 12000000,
    prompt: `${OUTFIT_STYLE} A high-fashion designer trench coat in cream tan color, oversized lapels, leather belt with gold buckle (NO logo), gold buttons, an expensive looking leather handbag visible on one shoulder strap (NO brand logo, generic luxury bag design), runway fashion week aesthetic, NO brand markings.`,
  },
  {
    id: "luxury_hanbok_gold",
    slot: "outfit",
    name: "황금 명품 한복",
    description: "황금 자수가 화려한 명품 전통 한복",
    rarity: "legendary",
    price: 18000000,
    prompt: `${OUTFIT_STYLE} A luxury traditional Korean hanbok top (jeogori), deep royal purple silk with intricate gold thread embroidery of phoenix and clouds, white collar with gold trim, elaborate otgoreum ribbon with jade pendant, ornate jeweled hair pin visible, high-end ceremonial hanbok, dignified and opulent.`,
  },
  {
    id: "luxury_athletic_set",
    slot: "outfit",
    name: "명품 트레이닝복",
    description: "디자이너 컬렉션의 최고급 트레이닝복",
    rarity: "epic",
    price: 8000000,
    prompt: `${OUTFIT_STYLE} A high-end designer athletic tracksuit top, sleek black with gold metallic stripes down the sleeves, premium technical fabric texture, expensive looking gold zipper, a thick golden chain visible at the neckline, NO brand logos, generic ultra-premium streetwear style, hip-hop luxury aesthetic.`,
  },
  {
    id: "luxury_fur_coat",
    slot: "outfit",
    name: "명품 모피 코트",
    description: "부드러운 모피로 만든 최고급 겨울 코트",
    rarity: "legendary",
    price: 22000000,
    prompt: `${OUTFIT_STYLE} A luxurious faux fur coat in soft white cream color, plush thick fur texture, large fur collar wrapping around the neck, an elegant pearl necklace draped over the collar, sleek tailored silhouette, winter glamour, NO brand logos, ultra-rich aesthetic.`,
  },
  {
    id: "luxury_kpop_stage",
    slot: "outfit",
    name: "명품 무대의상",
    description: "스타가 입을 법한 화려한 무대의상",
    rarity: "legendary",
    price: 20000000,
    prompt: `${OUTFIT_STYLE} A dazzling K-pop idol stage outfit jacket fully covered in iridescent rhinestones and silver sequins, elaborate gold chain decorations, decorative epaulets on the shoulders with tassels, plunging V-neck with multiple layered chain necklaces, NO brand logos, NO recognizable celebrity face, generic ultra-glamorous stage costume.`,
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
    prompt: `${BASE_STYLE_MALE} Skin tone: light beige. Background color: soft pale blue (#dbeafe).`,
  },
  {
    id: "base_female",
    slot: "base",
    name: "여자 (단정한 단발)",
    description: "단정한 단발의 여자 얼굴",
    rarity: "common",
    price: 0,
    prompt: `${BASE_STYLE_FEMALE} Skin tone: light beige. Background color: soft pale pink (#fce7f3).`,
  },
  {
    id: "editor_bald",
    slot: "base",
    name: "편집기 대머리 베이스",
    description: "편집기 전용 대머리 (위치 조정용)",
    rarity: "common",
    price: 0,
    active: false,
    prompt: `${BASE_STYLE_BALD} Skin tone: light beige. Background color: soft pale blue (#dbeafe).`,
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
  imageUrl: item.active === false ? "" : `/avatar-shop/${item.id}.png?v=20260523d`,
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
