// src/LearningGames.js (수정)
import React, { useState, useEffect } from "react";
import OmokGame from "./OmokGame"; // 오목 게임 컴포넌트 import
import "./LearningGames.css";

const games = [
  {
    id: 1,
    title: "타자 연습",
    description: "타자 실력을 향상시키세요!",
    url: "https://tazadak.com/",
  },
  {
    id: 2,
    title: "지리 학습 게임",
    description: "전 세계의 지리를 재미있게 배우세요.",
    url: "https://world-geography-games.com/ko/",
  },
  {
    id: 3,
    title: "과학 학습 게임",
    description: "다양한 과학 원리를 게임으로!",
    url: "https://www.sciencegames.net/",
  },
  {
    id: 4,
    title: "오목",
    description: "친구와 함께 오목 게임을 즐겨보세요!",
    component: <OmokGame />, // 컴포넌트 렌더링 방식
  },
];

function LearningGames({ isFullScreen, setFullScreen }) {
  const [selectedGame, setSelectedGame] = useState(games[0]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setFullScreen(false);
      }
    };

    if (isFullScreen) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullScreen, setFullScreen]);

  const regularContainerStyle = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  };

  const fullScreenContainerStyle = {
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
  };

  return (
    <div
      className="learning-games-container"
      style={isFullScreen ? fullScreenContainerStyle : regularContainerStyle}
    >
      <div className="learning-games-header">
        {!isFullScreen && (
          <>
            <h2>학습 게임</h2>
            <p>다양한 학습 게임을 통해 즐겁게 배워보세요!</p>
          </>
        )}
        <button
          onClick={() => setFullScreen(!isFullScreen)}
          className="fullscreen-button"
        >
          {isFullScreen ? "전체 화면 종료 (Esc)" : "전체 화면으로 보기"}
        </button>
      </div>

      {!isFullScreen && (
        <div className="game-selector">
          {games.map((game) => (
            <button
              key={game.id}
              className={`game-button ${
                selectedGame.id === game.id ? "active" : ""
              }`}
              onClick={() => setSelectedGame(game)}
            >
              {game.title}
            </button>
          ))}
        </div>
      )}

      <div className="game-content">
        {selectedGame.url ? (
          <iframe
            src={selectedGame.url}
            title="Learning Game"
            width="100%"
            height="100%"
            style={{ border: "none" }}
            sandbox="allow-scripts allow-same-origin allow-popups"
            allowFullScreen
          ></iframe>
        ) : selectedGame.component ? (
          selectedGame.component
        ) : (
          <p>플레이할 게임을 선택하세요.</p>
        )}
      </div>
    </div>
  );
}

export default LearningGames;