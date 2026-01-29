// src/components/Avatar.js - 아바타 렌더링 컴포넌트 (개선 버전)
import React from "react";
import {
  SKIN_TONES,
  FACE_SHAPES,
  EYE_STYLES,
  EYE_COLORS,
  MOUTH_STYLES,
  HAIRSTYLES,
  HAIR_COLORS,
  OUTFITS,
  OUTFIT_COLORS,
  ACCESSORIES,
  BACKGROUNDS,
  BORDERS,
  DEFAULT_AVATAR,
} from "../utils/avatarSystem";

/**
 * 색상을 약간 어둡게 만드는 함수
 */
function darkenColor(hex, percent = 15) {
  if (!hex || hex === 'none' || hex === 'transparent') return hex;

  // hex를 RGB로 변환
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);

  // 어둡게
  r = Math.max(0, Math.floor(r * (100 - percent) / 100));
  g = Math.max(0, Math.floor(g * (100 - percent) / 100));
  b = Math.max(0, Math.floor(b * (100 - percent) / 100));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * 아바타 컴포넌트 - SVG 기반 렌더링 (개선 버전)
 * 상반신까지 보이도록 viewBox 확장
 */
export default function Avatar({ config = {}, size = 100, showBorder = true, onClick }) {
  const avatarConfig = { ...DEFAULT_AVATAR, ...config };

  // 설정값 찾기
  const skinTone = SKIN_TONES.find(s => s.id === avatarConfig.skinTone) || SKIN_TONES[1];
  const faceShape = FACE_SHAPES.find(f => f.id === avatarConfig.faceShape) || FACE_SHAPES[1];
  const eyeStyle = EYE_STYLES.find(e => e.id === avatarConfig.eyeStyle) || EYE_STYLES[0];
  const eyeColor = EYE_COLORS.find(e => e.id === avatarConfig.eyeColor) || EYE_COLORS[1];
  const mouthStyle = MOUTH_STYLES.find(m => m.id === avatarConfig.mouthStyle) || MOUTH_STYLES[0];
  const hairstyle = HAIRSTYLES.find(h => h.id === avatarConfig.hairstyle) || HAIRSTYLES[1];
  const hairColor = HAIR_COLORS.find(h => h.id === avatarConfig.hairColor) || HAIR_COLORS[0];
  const outfit = OUTFITS.find(o => o.id === avatarConfig.outfit) || OUTFITS[1];
  const outfitColor = OUTFIT_COLORS.find(o => o.id === avatarConfig.outfitColor) || OUTFIT_COLORS[0];
  const accessory = ACCESSORIES.find(a => a.id === avatarConfig.accessory);
  const background = BACKGROUNDS.find(b => b.id === avatarConfig.background) || BACKGROUNDS[0];
  const border = BORDERS.find(b => b.id === avatarConfig.border);

  // 코 색상 (피부색보다 약간 어둡게)
  const noseColor = darkenColor(skinTone.color, 12);

  // 배경 스타일 생성
  const getBackgroundStyle = () => {
    if (!background || background.id === "none") return "#1a1a2e";
    if (background.gradient) {
      return `url(#bg-gradient-${background.id})`;
    }
    return background.color;
  };

  // 테두리 스타일
  const getBorderStyle = () => {
    if (!border || border.id === "none" || !showBorder) return null;
    return {
      stroke: border.gradient ? `url(#border-gradient-${border.id})` : border.color,
      strokeWidth: border.width || 3,
      filter: border.glow ? `drop-shadow(0 0 ${border.width * 2}px ${border.glowColor || border.color})` : undefined,
    };
  };

  const borderStyle = getBorderStyle();

  // 실제 머리 색상 (그라디언트 또는 단색)
  const getHairFill = () => {
    if (hairColor?.gradient) {
      return "url(#hair-rainbow)";
    }
    return hairColor?.color || "#1a1a1a";
  };

  // 항상 상반신까지 보이도록 viewBox 설정
  const viewBoxY = -25; // 머리카락 위쪽 공간
  const viewBoxHeight = 150; // 항상 몸까지 보이게

  return (
    <svg
      width={size}
      height={size}
      viewBox={`-15 ${viewBoxY} 130 ${viewBoxHeight}`}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default", overflow: "visible" }}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* 배경 그라디언트 */}
        {background?.gradient && (
          <linearGradient id={`bg-gradient-${background.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            {background.gradient.map((color, idx) => (
              <stop
                key={idx}
                offset={`${(idx / (background.gradient.length - 1)) * 100}%`}
                stopColor={color}
              />
            ))}
          </linearGradient>
        )}

        {/* 테두리 그라디언트 */}
        {border?.gradient && (
          <linearGradient id={`border-gradient-${border.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            {border.gradient.map((color, idx) => (
              <stop
                key={idx}
                offset={`${(idx / (border.gradient.length - 1)) * 100}%`}
                stopColor={color}
              />
            ))}
          </linearGradient>
        )}

        {/* 머리 그라디언트 (무지개) */}
        {hairColor?.gradient && (
          <linearGradient id="hair-rainbow" x1="0%" y1="0%" x2="100%" y2="0%">
            {hairColor.gradient.map((color, idx) => (
              <stop
                key={idx}
                offset={`${(idx / (hairColor.gradient.length - 1)) * 100}%`}
                stopColor={color}
              />
            ))}
          </linearGradient>
        )}

        {/* 그림자 필터 */}
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3" />
        </filter>

        {/* 클리핑 마스크 - 얼굴 영역 */}
        <clipPath id="face-clip">
          <path d={faceShape.path} />
        </clipPath>
      </defs>

      {/* ======= 배경 ======= */}
      {background && background.id !== "none" && (
        <rect
          x="-15"
          y={viewBoxY}
          width="130"
          height={viewBoxHeight}
          fill={getBackgroundStyle()}
          rx="10"
        />
      )}

      {/* 배경 별 (은하수) */}
      {background?.stars && (
        <g>
          <circle cx="15" cy="10" r="1.5" fill="white" opacity="0.9" />
          <circle cx="85" cy="15" r="2" fill="white" opacity="0.8" />
          <circle cx="45" cy="-5" r="1.2" fill="white" opacity="0.9" />
          <circle cx="70" cy="0" r="1.5" fill="white" opacity="0.7" />
          <circle cx="25" cy="20" r="1" fill="white" opacity="0.8" />
          <circle cx="95" cy="25" r="1.2" fill="white" opacity="0.7" />
          <circle cx="5" cy="30" r="1.5" fill="white" opacity="0.6" />
          <circle cx="60" cy="100" r="1" fill="white" opacity="0.9" />
          <circle cx="30" cy="110" r="1.2" fill="white" opacity="0.7" />
        </g>
      )}

      {/* ======= 목 ======= */}
      <rect
        x="42"
        y="85"
        width="16"
        height="12"
        fill={skinTone.color}
      />

      {/* ======= 의상 ======= */}
      {outfit && outfit.id !== "none" && (
        <g>
          {/* 의상 본체 */}
          <path
            d={outfit.path}
            fill={outfitColor?.color || outfit.baseColor}
          />
          {/* 칼라 (교복) */}
          {outfit.collar && (
            <g>
              <path d="M40,95 L50,103 L60,95" stroke="#ffffff" strokeWidth="3" fill="none" />
            </g>
          )}
          {/* 버튼 (교복) */}
          {outfit.buttons && (
            <g>
              <circle cx="50" cy="103" r="2" fill="#f1c40f" />
              <circle cx="50" cy="110" r="2" fill="#f1c40f" />
            </g>
          )}
          {/* 넥타이 (정장) */}
          {outfit.tie && (
            <g>
              <path d="M47,95 L50,98 L53,95" fill="#c0392b" />
              <path d="M48,98 L50,118 L52,98 Z" fill="#e74c3c" />
            </g>
          )}
          {/* 후드 */}
          {outfit.hood && (
            <path
              d="M25,92 Q22,80 35,75 L65,75 Q78,80 75,92"
              fill={darkenColor(outfitColor?.color || outfit.baseColor, 15)}
            />
          )}
        </g>
      )}

      {/* ======= 얼굴 ======= */}
      <g>
        {/* 얼굴형에 따른 귀 위치 계산 - 얼굴 path 바깥에 위치해야 보임 */}
        {(() => {
          // 얼굴형별 귀 위치 (얼굴 path 바깥쪽으로!)
          // round/square/heart: x=10~90, oval: x=12~88, long: x=20~80
          const earPositions = {
            round: { leftX: 7, rightX: 93, y: 50 },
            oval: { leftX: 9, rightX: 91, y: 48 },
            square: { leftX: 7, rightX: 93, y: 50 },
            heart: { leftX: 7, rightX: 93, y: 48 },
            long: { leftX: 17, rightX: 83, y: 50 },
          };
          const earPos = earPositions[faceShape.id] || earPositions.round;
          return (
            <>
              {/* 귀 (왼쪽) - 얼굴 뒤에 배치 */}
              <ellipse
                cx={earPos.leftX}
                cy={earPos.y}
                rx="5"
                ry="8"
                fill={skinTone.color}
              />
              <ellipse
                cx={earPos.leftX + 1}
                cy={earPos.y}
                rx="2"
                ry="4"
                fill={darkenColor(skinTone.color, 12)}
              />
              {/* 귀 (오른쪽) */}
              <ellipse
                cx={earPos.rightX}
                cy={earPos.y}
                rx="5"
                ry="8"
                fill={skinTone.color}
              />
              <ellipse
                cx={earPos.rightX - 1}
                cy={earPos.y}
                rx="2"
                ry="4"
                fill={darkenColor(skinTone.color, 12)}
              />
            </>
          );
        })()}
        {/* 얼굴 윤곽 */}
        <path
          d={faceShape.path}
          fill={skinTone.color}
        />
        {/* 볼 홍조 */}
        <ellipse cx="30" cy="60" rx="8" ry="5" fill="#ffb6c1" opacity="0.3" />
        <ellipse cx="70" cy="60" rx="8" ry="5" fill="#ffb6c1" opacity="0.3" />
      </g>

      {/* ======= 눈 ======= */}
      <g>
        {/* 왼쪽 눈 */}
        <ellipse
          cx={eyeStyle.leftX}
          cy={eyeStyle.y}
          rx={eyeStyle.size}
          ry={eyeStyle.size * 0.75}
          fill="white"
        />
        <circle
          cx={eyeStyle.leftX}
          cy={eyeStyle.y}
          r={eyeStyle.size * 0.55}
          fill={eyeColor.color}
        />
        <circle
          cx={eyeStyle.leftX - 1}
          cy={eyeStyle.y - 1}
          r={eyeStyle.size * 0.22}
          fill="white"
        />

        {/* 오른쪽 눈 */}
        <ellipse
          cx={eyeStyle.rightX}
          cy={eyeStyle.y}
          rx={eyeStyle.size}
          ry={eyeStyle.size * 0.75}
          fill="white"
        />
        <circle
          cx={eyeStyle.rightX}
          cy={eyeStyle.y}
          r={eyeStyle.size * 0.55}
          fill={eyeColor.color}
        />
        <circle
          cx={eyeStyle.rightX - 1}
          cy={eyeStyle.y - 1}
          r={eyeStyle.size * 0.22}
          fill="white"
        />

        {/* 눈썹 - 머리색 또는 검은색 */}
        <path
          d={`M${eyeStyle.leftX - 7},${eyeStyle.y - 11} Q${eyeStyle.leftX},${eyeStyle.y - 14} ${eyeStyle.leftX + 7},${eyeStyle.y - 11}`}
          stroke={hairColor?.gradient ? "#1a1a1a" : (hairColor?.color || "#1a1a1a")}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M${eyeStyle.rightX - 7},${eyeStyle.y - 11} Q${eyeStyle.rightX},${eyeStyle.y - 14} ${eyeStyle.rightX + 7},${eyeStyle.y - 11}`}
          stroke={hairColor?.gradient ? "#1a1a1a" : (hairColor?.color || "#1a1a1a")}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      </g>

      {/* ======= 코 ======= */}
      <path
        d="M48,53 L50,60 L52,53"
        stroke={noseColor}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ======= 입 ======= */}
      <path
        d={mouthStyle.path}
        stroke={mouthStyle.stroke ? "#c0392b" : "none"}
        strokeWidth="2.5"
        fill={mouthStyle.fill ? "#c0392b" : "none"}
        strokeLinecap="round"
      />

      {/* ======= 앞머리 및 메인 헤어 ======= */}
      {hairstyle && hairstyle.id !== "none" && (
        <g>
          {/* 메인 헤어 */}
          {hairstyle.paths && hairstyle.paths[0] && (
            <path
              d={hairstyle.paths[0]}
              fill={getHairFill()}
              stroke={hairColor?.color === "#1a1a1a" ? "#333" : "none"}
              strokeWidth="1"
            />
          )}
          {/* 뒤쪽 머리 (긴머리/포니테일 등) */}
          {hairstyle.paths && hairstyle.paths.slice(1).map((p, i) => (
            <path
              key={`hair-${i}`}
              d={p}
              fill={getHairFill()}
              stroke={hairColor?.color === "#1a1a1a" ? "#333" : "none"}
              strokeWidth="1"
            />
          ))}
          {/* 앞머리 */}
          {hairstyle.bangsPath && (
            <path
              d={hairstyle.bangsPath}
              fill={getHairFill()}
              stroke={hairColor?.color === "#1a1a1a" ? "#333" : "none"}
              strokeWidth="1"
            />
          )}
        </g>
      )}

      {/* ======= 악세서리 ======= */}
      {accessory && accessory.id !== "none" && (
        <g>
          {/* 안경 */}
          {accessory.id === "glasses" && (
            <g>
              {/* 왼쪽 렌즈 */}
              <circle cx="35" cy="45" r="10" fill="none" stroke="#1a1a1a" strokeWidth="2" />
              {/* 오른쪽 렌즈 */}
              <circle cx="65" cy="45" r="10" fill="none" stroke="#1a1a1a" strokeWidth="2" />
              {/* 브릿지 */}
              <path d="M45,45 Q50,42 55,45" fill="none" stroke="#1a1a1a" strokeWidth="2" />
              {/* 다리 */}
              <path d="M25,45 L10,42" stroke="#1a1a1a" strokeWidth="2" />
              <path d="M75,45 L90,42" stroke="#1a1a1a" strokeWidth="2" />
            </g>
          )}
          {/* 선글라스 */}
          {accessory.id === "sunglasses" && (
            <g>
              <ellipse cx="35" cy="45" rx="12" ry="8" fill="#1a1a1a" />
              <ellipse cx="65" cy="45" rx="12" ry="8" fill="#1a1a1a" />
              <path d="M47,45 Q50,42 53,45" fill="none" stroke="#1a1a1a" strokeWidth="2" />
              <path d="M23,45 L8,42" stroke="#1a1a1a" strokeWidth="2" />
              <path d="M77,45 L92,42" stroke="#1a1a1a" strokeWidth="2" />
              {/* 반사광 */}
              <ellipse cx="32" cy="43" rx="3" ry="2" fill="white" opacity="0.3" />
              <ellipse cx="62" cy="43" rx="3" ry="2" fill="white" opacity="0.3" />
            </g>
          )}
          {/* 귀걸이 */}
          {accessory.id === "earrings" && (
            <g>
              <circle cx="6" cy="58" r="4" fill="#f1c40f" />
              <circle cx="94" cy="58" r="4" fill="#f1c40f" />
              <circle cx="5" cy="56" r="1" fill="white" opacity="0.6" />
              <circle cx="93" cy="56" r="1" fill="white" opacity="0.6" />
            </g>
          )}
          {/* 목걸이 */}
          {accessory.id === "necklace" && (
            <g>
              <path d="M30,88 Q50,95 70,88" fill="none" stroke="#f1c40f" strokeWidth="2" />
              <circle cx="50" cy="94" r="4" fill="#f1c40f" />
              <circle cx="49" cy="92" r="1" fill="white" opacity="0.5" />
            </g>
          )}
          {/* 모자 */}
          {accessory.id === "hat" && (
            <g>
              <ellipse cx="50" cy="8" rx="45" ry="8" fill="#e74c3c" />
              <path d="M15,8 Q15,-15 50,-18 Q85,-15 85,8" fill="#e74c3c" />
              <rect x="15" y="5" width="70" height="5" fill="#c0392b" />
            </g>
          )}
          {/* 왕관 */}
          {accessory.id === "crown" && (
            <g>
              <path
                d="M18,12 L22,0 L32,-12 L42,5 L50,-15 L58,5 L68,-12 L78,0 L82,12 Z"
                fill="#f1c40f"
                stroke="#d4ac0d"
                strokeWidth="1"
              />
              <circle cx="32" cy="-2" r="4" fill="#e74c3c" />
              <circle cx="50" cy="-5" r="5" fill="#3498db" />
              <circle cx="68" cy="-2" r="4" fill="#2ecc71" />
              <circle cx="31" cy="-4" r="1.5" fill="white" opacity="0.5" />
              <circle cx="49" cy="-7" r="2" fill="white" opacity="0.5" />
              <circle cx="67" cy="-4" r="1.5" fill="white" opacity="0.5" />
            </g>
          )}
          {/* 머리띠 */}
          {accessory.id === "headband" && (
            <path
              d="M10,22 Q50,15 90,22"
              fill="none"
              stroke="#ff69b4"
              strokeWidth="4"
            />
          )}
          {/* 리본 */}
          {accessory.id === "bow" && (
            <g transform="translate(78, 15)">
              <ellipse cx="-10" cy="0" rx="10" ry="6" fill="#ff69b4" />
              <ellipse cx="10" cy="0" rx="10" ry="6" fill="#ff69b4" />
              <circle cx="0" cy="0" r="5" fill="#e91e8c" />
            </g>
          )}
          {/* 마스크 */}
          {accessory.id === "mask" && (
            <g>
              <path
                d="M20,55 Q50,72 80,55 L80,70 Q50,88 20,70 Z"
                fill="#ffffff"
                stroke="#e0e0e0"
                strokeWidth="1"
              />
              <path d="M35,62 L65,62" stroke="#e0e0e0" strokeWidth="1" />
            </g>
          )}
        </g>
      )}

      {/* ======= 테두리 ======= */}
      {borderStyle && showBorder && (
        <rect
          x="-13"
          y={viewBoxY + 2}
          width="126"
          height={viewBoxHeight - 4}
          fill="none"
          stroke={borderStyle.stroke}
          strokeWidth={borderStyle.strokeWidth}
          rx="12"
          style={{ filter: borderStyle.filter }}
        />
      )}
    </svg>
  );
}

/**
 * 헤더용 미니 아바타
 * 확장된 viewBox에 맞게 얼굴이 중앙에 오도록 조정
 */
export function MiniAvatar({ config, size = 40, onClick }) {
  return (
    <div
      onClick={onClick}
      className="rounded-full overflow-hidden relative"
      style={{
        width: size,
        height: size,
        cursor: onClick ? "pointer" : "default",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        border: "2px solid rgba(255,255,255,0.3)",
      }}
    >
      <div className="absolute top-1/2 left-1/2" style={{ transform: "translate(-50%, -60%)" }}>
        <Avatar config={config} size={size * 1.6} showBorder={false} />
      </div>
    </div>
  );
}
