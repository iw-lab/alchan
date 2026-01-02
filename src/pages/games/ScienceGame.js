// src/ScienceGame.js
import React from 'react';
import './GamePage.css';

const ScienceGame = () => {
  return (
    <div className="game-page-container">
      <h2>과학 학습 게임</h2>
      <p>다양한 과학 원리를 게임으로!</p>
      <div className="game-content">
        <iframe
          src="https://www.sciencegames.net/"
          title="Science Learning Game"
          width="100%"
          height="100%"
          style={{ border: 'none' }}
          allowFullScreen
        ></iframe>
      </div>
    </div>
  );
};

export default ScienceGame;