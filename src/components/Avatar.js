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
  const outfit = OUTFITS.find(o => o.id === avatarConfig.outfit);
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

  // 의상이 있으면 상반신까지 보이도록 viewBox 확장
  const hasOutfit = outfit && outfit.id !== "none";
  const viewBoxY = -30; // 머리카락 위쪽 공간
  const viewBoxHeight = hasOutfit ? 155 : 135; // 의상 포함 시 더 넓게

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

      {/* 배경 */}
      <rect
        x="-15"
        y={viewBoxY}
        width="130"
        height={viewBoxHeight}
        rx="12"
        fill={getBackgroundStyle()}
      />

      {/* 배경 별 (은하수) */}
      {background?.stars && (
        <g>
          <circle cx="15" cy="10" r="1" fill="white" opacity="0.8" />
          <circle cx="85" cy="15" r="1.2" fill="white" opacity="0.7" />
          <circle cx="45" cy="8" r="0.8" fill="white" opacity="0.9" />
          <circle cx="70" cy="5" r="1" fill="white" opacity="0.6" />
          <circle cx="25" cy="20" r="0.6" fill="white" opacity="0.8" />
          <circle cx="90" cy="25" r="0.8" fill="white" opacity="0.7" />
          <circle cx="10" cy="30" r="1" fill="white" opacity="0.5" />
          <circle cx="60" cy="12" r="0.7" fill="white" opacity="0.9" />
        </g>
      )}

      {/* ======= 의상 (맨 아래 레이어) ======= */}
      {outfit && outfit.id !== "none" && (
        <g filter="url(#shadow)">
          {/* 목 */}
          <rect
            x="42"
            y="88"
            width="16"
            height="12"
            fill={skinTone.color}
          />
          {/* 의상 본체 */}
          <path
            d={outfit.path}
            fill={outfitColor?.color || outfit.baseColor}
          />
          {/* 칼라 */}
          {outfit.collar && (
            <path
              d="M40,95 L50,100 L60,95"
              stroke="#ffffff"
              strokeWidth="2"
              fill="none"
            />
          )}
          {/* 넥타이 */}
          {outfit.tie && (
            <path
              d="M50,95 L47,105 L50,125 L53,105 Z"
              fill="#e74c3c"
            />
          )}
          {/* 후드 */}
          {outfit.hood && (
            <path
              d="M25,90 Q20,80 30,75 L70,75 Q80,80 75,90"
              fill={darkenColor(outfitColor?.color || outfit.baseColor, 20)}
              stroke="none"
            />
          )}
        </g>
      )}

      {/* ======= 뒷머리 (긴 머리 등) ======= */}
      {hairstyle && hairstyle.paths && hairstyle.paths.length > 1 && (
        <g filter="url(#shadow)">
          {hairstyle.paths.slice(1).map((path, idx) => (
            <path
              key={`back-hair-${idx}`}
              d={path}
              fill={getHairFill()}
            />
          ))}
        </g>
      )}

      {/* ======= 얼굴 ======= */}
      <g filter="url(#shadow)">
        {/* 얼굴 윤곽 */}
        <path
          d={faceShape.path}
          fill={skinTone.color}
        />
        {/* 볼 홍조 */}
        <ellipse cx="28" cy="58" rx="7" ry="4" fill="#ffb6c1" opacity="0.35" />
        <ellipse cx="72" cy="58" rx="7" ry="4" fill="#ffb6c1" opacity="0.35" />
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
      {hairstyle && hairstyle.paths && hairstyle.paths.length > 0 && (
        <g filter="url(#shadow)">
          {/* 메인 헤어 */}
          <path
            d={hairstyle.paths[0]}
            fill={getHairFill()}
          />
          {/* 단발 앞머리 */}
          {hairstyle.bangsPath && (
            <path
              d={hairstyle.bangsPath}
              fill={getHairFill()}
            />
          )}
        </g>
      )}

      {/* ======= 악세서리 ======= */}
      {accessory && accessory.id !== "none" && (
        <g>
          {/* 일반 path 악세서리 */}
          {accessory.path && (
            <path
              d={accessory.path}
              stroke={accessory.fill ? "none" : accessory.color}
              strokeWidth="2.5"
              fill={accessory.fill ? accessory.color : "none"}
              strokeLinecap="round"
            />
          )}
          {/* 왕관 */}
          {accessory.type === "crown" && (
            <g filter="url(#shadow)">
              <path
                d="M25,-2 L30,15 L40,8 L50,18 L60,8 L70,15 L75,-2 Z"
                fill="#f1c40f"
              />
              <circle cx="40" cy="5" r="3" fill="#e74c3c" />
              <circle cx="50" cy="8" r="4" fill="#3498db" />
              <circle cx="60" cy="5" r="3" fill="#2ecc71" />
            </g>
          )}
          {/* 리본 */}
          {accessory.type === "bow" && (
            <g transform="translate(72, 18)" filter="url(#shadow)">
              <ellipse cx="-8" cy="0" rx="10" ry="6" fill={accessory.color} />
              <ellipse cx="8" cy="0" rx="10" ry="6" fill={accessory.color} />
              <circle cx="0" cy="0" r="5" fill={darkenColor(accessory.color, 20)} />
            </g>
          )}
          {/* 귀걸이 */}
          {accessory.type === "earrings" && (
            <g>
              <circle cx="10" cy="55" r="4" fill={accessory.color} filter="url(#shadow)" />
              <circle cx="90" cy="55" r="4" fill={accessory.color} filter="url(#shadow)" />
            </g>
          )}
        </g>
      )}

      {/* ======= 테두리 ======= */}
      {borderStyle && (
        <rect
          x="-13"
          y={viewBoxY + 2}
          width="126"
          height={viewBoxHeight - 4}
          rx="11"
          fill="none"
          {...borderStyle}
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
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        border: "2px solid rgba(255,255,255,0.3)",
        position: "relative",
      }}
    >
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -60%)", // 얼굴이 중앙에 오도록 조정
      }}>
        <Avatar config={config} size={size * 1.6} showBorder={false} />
      </div>
    </div>
  );
}
