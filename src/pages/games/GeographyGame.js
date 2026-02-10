// src/GeographyGame.js
import React from 'react';
import './GamePage.css';

const GeographyGame = () => {
  return (
    <div className="game-page-container">
      <h2>지리 학습 게임</h2>
      <p>전 세계의 지리를 재미있게 배우세요.</p>
      <div className="game-content">
        <iframe
          src="https://world-geography-games.com/ko/"
          title="Geography Learning Game"
          width="100%"
          height="100%"
          style={{ border: 'none' }}
          sandbox="allow-scripts allow-same-origin allow-popups"
          allowFullScreen
        ></iframe>
      </div>
    </div>
  );
};

export default GeographyGame;