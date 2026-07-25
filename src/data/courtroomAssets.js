// src/data/courtroomAssets.js
// 재판방(법정) 씬에 배치하는 개별 가구/소품 PNG 에셋 카탈로그.
// 학생 아바타(작게 렌더)는 이 위에 좌석 좌표대로 올라간다.
// 스타일: 앱 아바타와 동일한 귀여운 플랫 카툰, 정면 직교뷰, 투명 배경, 단일 오브젝트.

// 모든 프롬프트에 공통으로 붙는 스타일 헤더 (1000자 이내 유지)
// 약한 2.5D / 소프트 3D — 부드러운 그라데이션 음영 + 은은한 입체감.
export const COURT_STYLE_HEADER =
  "cute soft 2.5D game-asset illustration for a friendly Korean elementary school app, " +
  "gentle three-quarter front view with a slight top-down tilt giving light 3D depth and volume, " +
  "smooth gradient shading with soft ambient occlusion and subtle highlights (NOT flat), rounded shapes, clean outlines, " +
  "warm honey-wood tones, a soft semi-transparent contact shadow directly under the object, " +
  "single centered object, fully TRANSPARENT background (alpha), no scene, no people, " +
  "no text, no letters, no numbers, no logos, child-friendly cheerful mood.";

// 가구/구조물 = 약한 입체, 투명 배경, 잘림 없이
const PROP_RULE =
  "STRICT: render ONLY the single furniture/prop with light 3D volume (soft chunky depth), " +
  "whole object fully visible and centered with margin, NOT cropped, isolated on transparent background.";

export const COURTROOM_ASSETS = [
  {
    id: "bench_judge",
    name: "판사석",
    kind: "furniture",
    res: "1536x1024",
    prompt:
      "A grand WIDE raised judges' bench (long elevated wooden podium) for a courtroom, drawn STRAIGHT FROM THE FRONT — " +
      "flat head-on frontal view, perfectly symmetric, NOT three-quarter, NOT angled, NOT tilted (override any tilt in the style). " +
      "The bench is LONG AND WIDE, sized for THREE judges to sit side by side, one continuous tall front wood panel; " +
      "the CENTER section is slightly taller/raised for the presiding judge. " +
      "A round golden scales-of-justice emblem on the center of the front panel, warm polished oak wood, a low step base, dignified yet cute and friendly. " +
      "Fill the wide frame; whole bench fully visible and centered. " +
      PROP_RULE,
  },
  {
    id: "desk_prosecutor",
    name: "검사석",
    kind: "furniture",
    prompt:
      "A simple wooden courtroom desk (counsel table) seen from the front, " +
      "polished oak with a subtle deep-red accent panel on the front, a small stack of papers on top, " +
      "rounded friendly shape. " +
      PROP_RULE,
  },
  {
    id: "desk_lawyer",
    name: "변호사석",
    kind: "furniture",
    prompt:
      "A simple wooden courtroom desk (counsel table) seen from the front, " +
      "polished oak with a subtle deep-blue accent panel on the front, a small briefcase icon on top, " +
      "rounded friendly shape. " +
      PROP_RULE,
  },
  {
    id: "stand_witness",
    name: "증인석",
    kind: "furniture",
    prompt:
      "A small single wooden witness stand / testimony podium for a courtroom, " +
      "a compact box-like wooden booth with a low front rail, polished honey wood, cute and friendly, " +
      "room for one person to stand inside. " +
      PROP_RULE,
  },
  {
    id: "box_jury",
    name: "배심원석",
    kind: "furniture",
    res: "1536x1024",
    prompt:
      "A WIDE TIERED courtroom jury box / grandstand that seats about fifteen people in THREE rising rows, " +
      "a stepped wooden platform with a long front wooden railing, each row higher than the one in front, " +
      "the empty seats clearly oriented to FACE the viewer (toward the front of the courtroom / the judge), " +
      "polished honey wood with soft 3D depth, gentle isometric perspective, friendly. " +
      "Fill the wide frame; whole tiered box fully visible, isolated on transparent background.",
  },
  {
    id: "bench_gallery",
    name: "방청석",
    kind: "furniture",
    prompt:
      "A simple long wooden gallery pew bench (audience seating) seen from the front, " +
      "warm wood, rounded back, the kind of bench spectators sit on, cute and cozy. " +
      PROP_RULE,
  },
  {
    id: "flag_korea",
    name: "태극기",
    kind: "decor",
    prompt:
      "A South Korean Taegukgi flag (white field, red-and-blue taeguk circle in center, four black trigrams in corners) " +
      "hanging on a simple golden flagpole with a round finial, gentle cloth folds, cute flat style. " +
      "Render the flag accurately. " +
      PROP_RULE,
  },
  {
    id: "emblem_scale",
    name: "법원 휘장",
    kind: "decor",
    prompt:
      "A round golden courthouse emblem wall medallion featuring a balanced scales-of-justice symbol, " +
      "warm gold with a soft glow, laurel-leaf ring around it, decorative wall piece, cute flat style. " +
      PROP_RULE,
  },
  {
    id: "gavel",
    name: "의사봉",
    kind: "decor",
    prompt:
      "A wooden judge's gavel (small mallet) resting on its round sound block, warm polished wood, " +
      "cute chunky rounded shape, side view. " +
      PROP_RULE,
  },
  {
    id: "panel_wall",
    name: "우드 벽판",
    kind: "background",
    res: "1536x1024",
    prompt:
      "A WIDE PANORAMIC courtroom back wall banner made of warm wooden wainscoting panels (vertical wood slats with rectangular paneling below a top rail), " +
      "polished honey oak, even soft flat lighting, a continuous flat wall surface that runs the FULL WIDTH of a long horizontal frame, gentle cel shading, cute style. " +
      "Composition is a seamless horizontal strip: fill the ENTIRE wide rectangular frame edge to edge (all four edges), no transparent gaps, no objects, no furniture, no people on it.",
  },
  {
    id: "floor_wood",
    name: "바닥",
    kind: "background",
    res: "1536x1024",
    prompt:
      "A WIDE PANORAMIC courtroom floor banner made of warm wooden planks with a soft deep-red center carpet runner running front-to-back, " +
      "gentle top-down tilted perspective, even flat lighting, cute flat style. " +
      "Composition is a wide horizontal strip: fill the ENTIRE wide rectangular frame edge to edge (all four edges), no transparent gaps, no objects, no furniture, no people on it.",
  },
];

export default COURTROOM_ASSETS;
