// src/LearningGamesPage.js
import React, { useState } from "react";
import TypingPracticeGame from "./TypingPracticeGame";
import GeographyGame from "./GeographyGame";
import ScienceGame from "./ScienceGame";
import "./LearningGames.css";

// 게임 목록 데이터
const games = [
  {
    id: "typing",
    title: "타자 연습 게임",
    description: "영어 단어의 올바른 한글 뜻을 입력하여 쿠폰을 획득하세요!",
    component: TypingPracticeGame,
    icon: "⌨️",
  },
  {
    id: "geography",
    title: "지리 게임",
    description: "지리 퀴즈를 풀며 지식도 쌓고 보상도 받으세요!",
    component: GeographyGame,
    icon: "🌍",
  },
  {
    id: "science",
    title: "과학 게임",
    description: "재미있는 과학 퀴즈에 도전해보세요!",
    component: ScienceGame,
    icon: "🔬",
  },
  // 다른 게임들도 여기에 추가할 수 있습니다.
];

const LearningGamesPage = () => {
  const [activeGame, setActiveGame] = useState(null);

  const handleGameStart = (gameId) => {
    setActiveGame(gameId);
  };

  const handleGameClose = () => {
    setActiveGame(null);
  };

  const ActiveGameComponent = games.find((g) => g.id === activeGame)?.component;

  if (activeGame && ActiveGameComponent) {
    return <ActiveGameComponent onClose={handleGameClose} />;
  }

  return (
    <div className="learning-games-container">
      <div className="page-header">
        <h1 className="page-title">🎓 학습 게임 센터</h1>
        <p className="page-subtitle">
          다양한 게임을 통해 즐겁게 학습하고 보상을 획득하세요!
        </p>
      </div>

      <div className="game-list">
        {games.map((game) => (
          <div
            key={game.id}
            className="game-card"
            onClick={() => handleGameStart(game.id)}
          >
            <div className="game-icon">{game.icon}</div>
            <div className="game-card-content">
              <h3 className="game-title">{game.title}</h3>
              <p className="game-description">{game.description}</p>
            </div>
            <div className="game-card-hover">
              <span>플레이하기 →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LearningGamesPage;