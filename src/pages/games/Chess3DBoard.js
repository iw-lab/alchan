// src/pages/games/Chess3DBoard.js
// 3D 체스 보드 컴포넌트 (Three.js + React Three Fiber)

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CylinderGeometry, BoxGeometry, SphereGeometry, ConeGeometry, PlaneGeometry, MathUtils } from 'three';

// 공통 재질 설정
const getMaterial = (color, isSelected, isCheck) => {
  if (color === 'w') {
    return {
      color: '#faf8f0',
      metalness: 0.05,
      roughness: 0.3,
      emissive: isSelected ? '#00ffcc' : isCheck ? '#ff3366' : '#f5f5ee',
      emissiveIntensity: isSelected ? 0.6 : isCheck ? 0.8 : 0.15
    };
  } else {
    // 검은 말: 더 밝은 회색톤 + 강한 emissive로 잘 보이게
    return {
      color: '#4a4a4a',
      metalness: 0.4,
      roughness: 0.25,
      emissive: isSelected ? '#00ffcc' : isCheck ? '#ff3366' : '#777777',
      emissiveIntensity: isSelected ? 0.6 : isCheck ? 0.8 : 0.45
    };
  }
};

// 테두리 라인 색상 - 검은 말은 밝게, 흰 말은 어둡게
const getEdgeColor = (color) => color === 'w' ? '#999999' : '#dddddd';
const getEdgeOpacity = (color) => color === 'w' ? 0.4 : 0.7;

// 실루엣 라인 컴포넌트 - 세련된 외곽선
const OutlineEdge = ({ geometry, position, rotation, color, opacity = 0.5 }) => (
  <lineSegments position={position} rotation={rotation}>
    <edgesGeometry args={[geometry]} />
    <lineBasicMaterial color={color} transparent opacity={opacity} />
  </lineSegments>
);

// 킹 기물
const King = ({ color, isSelected, isCheck }) => {
  const mat = getMaterial(color, isSelected, isCheck);
  const edgeCol = getEdgeColor(color);
  const edgeOp = getEdgeOpacity(color);

  return (
    <group scale={[1, 1, 1]}>
      {/* 넓은 베이스 */}
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.38, 0.42, 0.08, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 베이스 링 */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.38, 0.04, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 하단 몸체 */}
      <mesh position={[0, 0.26, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 0.28, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 중간 띠 */}
      <mesh position={[0, 0.44, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.06, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 상단 몸체 */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.22, 0.26, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 목 부분 */}
      <mesh position={[0, 0.78, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.18, 0.1, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 왕관 베이스 */}
      <mesh position={[0, 0.88, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.16, 0.1, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 십자가 세로 */}
      <mesh position={[0, 1.08, 0]} castShadow>
        <boxGeometry args={[0.05, 0.3, 0.05]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 십자가 가로 */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.18, 0.05, 0.05]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 외곽선 - 베이스 */}
      <OutlineEdge geometry={new CylinderGeometry(0.38, 0.42, 0.08, 32)} position={[0, 0.04, 0]} color={edgeCol} opacity={edgeOp} />
      {/* 외곽선 - 몸체 실루엣 */}
      <OutlineEdge geometry={new CylinderGeometry(0.22, 0.32, 0.28, 16)} position={[0, 0.26, 0]} color={edgeCol} opacity={edgeOp} />
      {/* 외곽선 - 왕관 */}
      <OutlineEdge geometry={new CylinderGeometry(0.2, 0.16, 0.1, 16)} position={[0, 0.88, 0]} color={edgeCol} opacity={edgeOp} />
      {/* 외곽선 - 십자가 */}
      <OutlineEdge geometry={new BoxGeometry(0.05, 0.3, 0.05)} position={[0, 1.08, 0]} color={edgeCol} opacity={edgeOp} />
      <OutlineEdge geometry={new BoxGeometry(0.18, 0.05, 0.05)} position={[0, 1.0, 0]} color={edgeCol} opacity={edgeOp} />
    </group>
  );
};

// 퀸 기물
const Queen = ({ color, isSelected, isCheck }) => {
  const mat = getMaterial(color, isSelected, isCheck);
  const edgeCol = getEdgeColor(color);
  const edgeOp = getEdgeOpacity(color);

  return (
    <group scale={[0.95, 0.95, 0.95]}>
      {/* 넓은 베이스 */}
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.36, 0.4, 0.08, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 베이스 링 */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.36, 0.04, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 하단 몸체 */}
      <mesh position={[0, 0.26, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.3, 0.28, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 중간 띠 */}
      <mesh position={[0, 0.44, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.06, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 상단 몸체 */}
      <mesh position={[0, 0.58, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.22, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 목 부분 */}
      <mesh position={[0, 0.74, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.14, 0.1, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 왕관 몸체 */}
      <mesh position={[0, 0.86, 0]} castShadow>
        <sphereGeometry args={[0.16, 32, 24]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 왕관 꼭대기 구슬 */}
      <mesh position={[0, 1.02, 0]} castShadow>
        <sphereGeometry args={[0.07, 24, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 외곽선 */}
      <OutlineEdge geometry={new CylinderGeometry(0.36, 0.4, 0.08, 32)} position={[0, 0.04, 0]} color={edgeCol} opacity={edgeOp} />
      <OutlineEdge geometry={new CylinderGeometry(0.18, 0.3, 0.28, 16)} position={[0, 0.26, 0]} color={edgeCol} opacity={edgeOp} />
      <OutlineEdge geometry={new SphereGeometry(0.16, 16, 12)} position={[0, 0.86, 0]} color={edgeCol} opacity={edgeOp} />
    </group>
  );
};

// 룩 기물
const Rook = ({ color, isSelected, isCheck }) => {
  const mat = getMaterial(color, isSelected, isCheck);
  const edgeCol = getEdgeColor(color);
  const edgeOp = getEdgeOpacity(color);

  return (
    <group scale={[0.9, 0.9, 0.9]}>
      {/* 넓은 베이스 */}
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.38, 0.08, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 베이스 링 */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.34, 0.04, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 하단 몸체 */}
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.28, 0.32, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 중간 띠 */}
      <mesh position={[0, 0.48, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.06, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 상단 몸체 */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.24, 0.22, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 성벽 받침대 */}
      <mesh position={[0, 0.76, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.24, 0.06, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 성벽 톱니 */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[
          Math.cos(i * Math.PI * 2 / 5) * 0.2,
          0.88,
          Math.sin(i * Math.PI * 2 / 5) * 0.2
        ]} castShadow>
          <boxGeometry args={[0.1, 0.18, 0.1]} />
          <meshStandardMaterial {...mat} />
        </mesh>
      ))}
      {/* 외곽선 */}
      <OutlineEdge geometry={new CylinderGeometry(0.34, 0.38, 0.08, 32)} position={[0, 0.04, 0]} color={edgeCol} opacity={edgeOp} />
      <OutlineEdge geometry={new CylinderGeometry(0.24, 0.28, 0.32, 16)} position={[0, 0.28, 0]} color={edgeCol} opacity={edgeOp} />
      <OutlineEdge geometry={new CylinderGeometry(0.28, 0.24, 0.06, 16)} position={[0, 0.76, 0]} color={edgeCol} opacity={edgeOp} />
      {/* 톱니 외곽선 */}
      {[0, 1, 2, 3, 4].map((i) => (
        <OutlineEdge key={`e${i}`} geometry={new BoxGeometry(0.1, 0.18, 0.1)} position={[
          Math.cos(i * Math.PI * 2 / 5) * 0.2,
          0.88,
          Math.sin(i * Math.PI * 2 / 5) * 0.2
        ]} color={edgeCol} opacity={edgeOp} />
      ))}
    </group>
  );
};

// 비숍 기물
const Bishop = ({ color, isSelected, isCheck }) => {
  const mat = getMaterial(color, isSelected, isCheck);
  const edgeCol = getEdgeColor(color);
  const edgeOp = getEdgeOpacity(color);
  const slitColor = color === 'w' ? '#888888' : '#cccccc';

  return (
    <group scale={[0.9, 0.9, 0.9]}>
      {/* 넓은 베이스 */}
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.36, 0.08, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 베이스 링 */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.04, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 하단 몸체 */}
      <mesh position={[0, 0.26, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.26, 0.28, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 중간 띠 */}
      <mesh position={[0, 0.44, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.06, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 목 부분 */}
      <mesh position={[0, 0.56, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.18, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 주교 모자 꼭대기 */}
      <mesh position={[0, 0.76, 0]} castShadow>
        <coneGeometry args={[0.16, 0.36, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 대각선 홈 */}
      <mesh position={[0, 0.78, 0.1]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.08, 0.025, 0.01]} />
        <meshBasicMaterial color={slitColor} />
      </mesh>
      {/* 꼭대기 구슬 */}
      <mesh position={[0, 0.98, 0]} castShadow>
        <sphereGeometry args={[0.055, 24, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 외곽선 */}
      <OutlineEdge geometry={new CylinderGeometry(0.32, 0.36, 0.08, 32)} position={[0, 0.04, 0]} color={edgeCol} opacity={edgeOp} />
      <OutlineEdge geometry={new CylinderGeometry(0.18, 0.26, 0.28, 16)} position={[0, 0.26, 0]} color={edgeCol} opacity={edgeOp} />
      <OutlineEdge geometry={new ConeGeometry(0.16, 0.36, 16)} position={[0, 0.76, 0]} color={edgeCol} opacity={edgeOp} />
    </group>
  );
};

// 나이트 기물
const Knight = ({ color, isSelected, isCheck }) => {
  const mat = getMaterial(color, isSelected, isCheck);
  const edgeCol = getEdgeColor(color);
  const edgeOp = getEdgeOpacity(color);
  const eyeColor = color === 'w' ? '#333333' : '#eeeeee';

  return (
    <group scale={[0.9, 0.9, 0.9]}>
      {/* 넓은 베이스 */}
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.36, 0.08, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 베이스 링 */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.04, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 하단 몸체 */}
      <mesh position={[0, 0.24, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.26, 0.24, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 중간 띠 */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.06, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 목 */}
      <mesh position={[0, 0.54, 0.04]} rotation={[-0.35, 0, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.22, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 머리 뒷부분 (갈기) */}
      <mesh position={[0, 0.72, -0.02]} rotation={[-0.4, 0, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 0.26, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 머리 앞부분 */}
      <mesh position={[0, 0.68, 0.14]} rotation={[-0.7, 0, 0]} castShadow>
        <boxGeometry args={[0.14, 0.22, 0.2]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 주둥이 */}
      <mesh position={[0, 0.58, 0.3]} rotation={[-0.5, 0, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, 0.18, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 코끝 */}
      <mesh position={[0, 0.52, 0.38]} castShadow>
        <sphereGeometry args={[0.07, 24, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 귀 */}
      <mesh position={[-0.06, 0.88, 0.02]} rotation={[-0.2, 0, -0.3]} castShadow>
        <coneGeometry args={[0.035, 0.12, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0.06, 0.88, 0.02]} rotation={[-0.2, 0, 0.3]} castShadow>
        <coneGeometry args={[0.035, 0.12, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 눈 */}
      <mesh position={[-0.06, 0.7, 0.22]}>
        <sphereGeometry args={[0.025, 16, 12]} />
        <meshBasicMaterial color={eyeColor} />
      </mesh>
      <mesh position={[0.06, 0.7, 0.22]}>
        <sphereGeometry args={[0.025, 16, 12]} />
        <meshBasicMaterial color={eyeColor} />
      </mesh>
      {/* 외곽선 */}
      <OutlineEdge geometry={new CylinderGeometry(0.32, 0.36, 0.08, 32)} position={[0, 0.04, 0]} color={edgeCol} opacity={edgeOp} />
      <OutlineEdge geometry={new BoxGeometry(0.14, 0.22, 0.2)} position={[0, 0.68, 0.14]} rotation={[-0.7, 0, 0]} color={edgeCol} opacity={edgeOp} />
    </group>
  );
};

// 폰 기물
const Pawn = ({ color, isSelected, isCheck }) => {
  const mat = getMaterial(color, isSelected, isCheck);
  const edgeCol = getEdgeColor(color);
  const edgeOp = getEdgeOpacity(color);

  return (
    <group scale={[0.75, 0.75, 0.75]}>
      {/* 넓은 베이스 */}
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.08, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 베이스 링 */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.28, 0.04, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 하단 몸체 */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.22, 0.2, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 중간 띠 */}
      <mesh position={[0, 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.06, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 목 부분 */}
      <mesh position={[0, 0.46, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 0.14, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 둥근 머리 */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <sphereGeometry args={[0.12, 32, 24]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* 외곽선 */}
      <OutlineEdge geometry={new CylinderGeometry(0.28, 0.32, 0.08, 32)} position={[0, 0.04, 0]} color={edgeCol} opacity={edgeOp} />
      <OutlineEdge geometry={new SphereGeometry(0.12, 16, 12)} position={[0, 0.6, 0]} color={edgeCol} opacity={edgeOp} />
    </group>
  );
};

// 체스 기물 래퍼 컴포넌트
const ChessPiece = ({ piece, position, isSelected, isCheck, onClick }) => {
  const groupRef = useRef();
  const [hovered, setHovered] = useState(false);
  const baseY = useRef(0);

  useFrame((state) => {
    if (groupRef.current) {
      let targetY = baseY.current;
      if (isSelected) {
        targetY = 0.2 + Math.sin(state.clock.elapsedTime * 4) * 0.08;
      } else if (hovered) {
        targetY = 0.1;
      }
      groupRef.current.position.y = MathUtils.lerp(
        groupRef.current.position.y, targetY, 0.15
      );
    }
  });

  if (!piece) return null;

  const pieceColor = piece[0];
  const pieceType = piece[1];

  return (
    <group
      ref={groupRef}
      position={[position[0], 0, position[2]]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'auto'; }}
    >
      {pieceType === 'K' && <King color={pieceColor} isSelected={isSelected} isCheck={isCheck} />}
      {pieceType === 'Q' && <Queen color={pieceColor} isSelected={isSelected} isCheck={isCheck} />}
      {pieceType === 'R' && <Rook color={pieceColor} isSelected={isSelected} isCheck={isCheck} />}
      {pieceType === 'B' && <Bishop color={pieceColor} isSelected={isSelected} isCheck={isCheck} />}
      {pieceType === 'N' && <Knight color={pieceColor} isSelected={isSelected} isCheck={isCheck} />}
      {pieceType === 'P' && <Pawn color={pieceColor} isSelected={isSelected} isCheck={isCheck} />}
    </group>
  );
};

// 체스판 한 칸
const BoardSquare = ({ position, isLight, isSelected, isPossibleMove, onClick }) => {
  const [hovered, setHovered] = useState(false);

  const baseColor = isLight ? '#F0D9B5' : '#B58863';
  let finalColor = baseColor;

  if (isSelected) {
    finalColor = '#00fff2';
  } else if (isPossibleMove) {
    finalColor = isLight ? '#aaffaa' : '#88cc88';
  } else if (hovered) {
    finalColor = isLight ? '#ffffd0' : '#daa060';
  }

  return (
    <group position={[position[0], 0.01, position[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={finalColor} />
      </mesh>
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <edgesGeometry args={[new PlaneGeometry(1, 1)]} />
        <lineBasicMaterial color="#222222" linewidth={2} />
      </lineSegments>
    </group>
  );
};

// 이동 가능 표시
const MoveIndicator = ({ position, hasEnemy }) => {
  const meshRef = useRef();

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = 0.02 + Math.sin(state.clock.elapsedTime * 3) * 0.01;
    }
  });

  if (hasEnemy) {
    return (
      <mesh ref={meshRef} position={[position[0], 0.02, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.42, 32]} />
        <meshBasicMaterial color="#ff4444" transparent opacity={0.8} />
      </mesh>
    );
  }

  return (
    <mesh ref={meshRef} position={[position[0], 0.02, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.15, 32]} />
      <meshBasicMaterial color="#44cc44" transparent opacity={0.8} />
    </mesh>
  );
};

// 메인 3D 체스판
const ChessBoard3D = ({ board, selectedPiece, possibleMoves, onSquareClick, myColor, isInCheck }) => {
  const rotation = myColor === 'b' ? Math.PI : 0;

  const checkPosition = useMemo(() => {
    if (!board) return null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece[1] === 'K') {
          const color = piece[0];
          if (isInCheck(board, color)) {
            return { row: r, col: c };
          }
        }
      }
    }
    return null;
  }, [board, isInCheck]);

  return (
    <group rotation={[0, rotation, 0]}>
      {/* 보드 베이스 (나무 프레임) */}
      <mesh position={[0, -0.1, 0]} receiveShadow castShadow>
        <boxGeometry args={[9.2, 0.2, 9.2]} />
        <meshStandardMaterial color="#5d3a1a" metalness={0.1} roughness={0.8} />
      </mesh>

      {/* 보드 표면 */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.2, 8.2]} />
        <meshBasicMaterial color="#654321" />
      </mesh>

      {/* 체스판 칸들 */}
      {board && board.map((row, rIndex) =>
        row.map((piece, cIndex) => {
          const x = cIndex - 3.5;
          const z = rIndex - 3.5;
          const isLight = (rIndex + cIndex) % 2 === 0;
          const isSquareSelected = selectedPiece?.row === rIndex && selectedPiece?.col === cIndex;
          const isPossibleMove = possibleMoves.some(([r, c]) => r === rIndex && c === cIndex);

          return (
            <BoardSquare
              key={`square-${rIndex}-${cIndex}`}
              position={[x, 0, z]}
              isLight={isLight}
              isSelected={isSquareSelected}
              isPossibleMove={isPossibleMove}
              onClick={() => onSquareClick(rIndex, cIndex)}
            />
          );
        })
      )}

      {/* 이동 가능 위치 표시 */}
      {possibleMoves.map(([r, c]) => {
        const x = c - 3.5;
        const z = r - 3.5;
        const hasEnemy = board[r][c] !== null;

        return (
          <MoveIndicator
            key={`move-${r}-${c}`}
            position={[x, 0, z]}
            hasEnemy={hasEnemy}
          />
        );
      })}

      {/* 체스 기물들 */}
      {board && board.map((row, rIndex) =>
        row.map((piece, cIndex) => {
          if (!piece) return null;

          const x = cIndex - 3.5;
          const z = rIndex - 3.5;
          const isPieceSelected = selectedPiece?.row === rIndex && selectedPiece?.col === cIndex;
          const isCheckSquare = checkPosition && checkPosition.row === rIndex && checkPosition.col === cIndex;

          return (
            <ChessPiece
              key={`piece-${rIndex}-${cIndex}`}
              piece={piece}
              position={[x, 0, z]}
              isSelected={isPieceSelected}
              isCheck={isCheckSquare && piece[1] === 'K'}
              onClick={() => onSquareClick(rIndex, cIndex)}
            />
          );
        })
      )}
    </group>
  );
};

// 카메라 컨트롤러 - 우클릭 드래그로 회전 (좌클릭은 기물 선택용)
const CameraController = ({ myColor }) => {
  const { camera, gl } = useThree();
  const isDragging = useRef(false);
  const prevMouse = useRef({ x: 0, y: 0 });
  const spherical = useRef({ theta: 0, phi: Math.PI / 4, radius: 11 });

  useEffect(() => {
    spherical.current.theta = myColor === 'b' ? Math.PI : 0;

    const updateCamera = () => {
      const { theta, phi, radius } = spherical.current;
      camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = radius * Math.cos(phi);
      camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(0, 0, 0);
    };

    updateCamera();

    const handleMouseDown = (e) => {
      if (e.button === 2) {
        isDragging.current = true;
        prevMouse.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const dx = e.clientX - prevMouse.current.x;
      const dy = e.clientY - prevMouse.current.y;
      spherical.current.theta -= dx * 0.008;
      spherical.current.phi = Math.max(0.4, Math.min(1.3, spherical.current.phi + dy * 0.008));
      prevMouse.current = { x: e.clientX, y: e.clientY };
      updateCamera();
    };

    const handleMouseUp = () => { isDragging.current = false; };

    const handleWheel = (e) => {
      e.preventDefault();
      spherical.current.radius = Math.max(7, Math.min(18, spherical.current.radius + e.deltaY * 0.02));
      updateCamera();
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        isDragging.current = true;
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        prevMouse.current = { x: midX, y: midY };
      }
    };

    const handleTouchMove = (e) => {
      if (!isDragging.current || e.touches.length !== 2) return;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const dx = midX - prevMouse.current.x;
      const dy = midY - prevMouse.current.y;
      spherical.current.theta -= dx * 0.008;
      spherical.current.phi = Math.max(0.4, Math.min(1.3, spherical.current.phi + dy * 0.008));
      prevMouse.current = { x: midX, y: midY };
      updateCamera();
    };

    const handleTouchEnd = () => { isDragging.current = false; };
    const handleContextMenu = (e) => { e.preventDefault(); };

    const canvas = gl.domElement;
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [camera, gl, myColor]);

  return null;
};

// 메인 Canvas 래퍼
const Chess3DCanvas = ({ board, selectedPiece, possibleMoves, onSquareClick, myColor, isInCheck }) => {
  return (
    <div style={{ width: '100%', height: '600px', background: '#1a1a2e' }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 50, position: [0, 10, 10], near: 0.1, far: 100 }}
        gl={{ antialias: true }}
      >
        <CameraController myColor={myColor} />

        {/* 환경 조명 - 밝게 */}
        <ambientLight intensity={0.8} />

        {/* 메인 조명 */}
        <directionalLight
          position={[8, 15, 8]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={50}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-bias={-0.0001}
        />

        {/* 보조 조명들 */}
        <directionalLight position={[-5, 10, -5]} intensity={0.7} />
        <pointLight position={[0, 8, 0]} intensity={0.7} color="#ffffff" />
        <hemisphereLight args={['#ffffff', '#8b7355', 0.7]} />

        {/* 체스판 */}
        <ChessBoard3D
          board={board}
          selectedPiece={selectedPiece}
          possibleMoves={possibleMoves}
          onSquareClick={onSquareClick}
          myColor={myColor}
          isInCheck={isInCheck}
        />

        {/* 배경 바닥 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color="#1a1a28" />
        </mesh>

        {/* 안개 */}
        <fog attach="fog" args={['#1a1a28', 20, 45]} />
      </Canvas>
    </div>
  );
};

export default Chess3DCanvas;
