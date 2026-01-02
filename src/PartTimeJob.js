// src/PartTimeJob.js
import React, { useState } from "react";
import { useAuth } from "./contexts/AuthContext";
import "./PartTimeJob.css"; // 방금 만든 CSS 파일을 임포트합니다.
import "./TypingPracticeGame.css";

// 임시 데이터 (실제로는 서버에서 받아와야 합니다)
const initialJobs = [
  {
    id: 1,
    title: "도서관 연체 도서 반납하기",
    reward: 5000,
    poster: "관리자",
    status: "available", // available, in-progress, completed
    acceptor: null,
  },
  {
    id: 2,
    title: "1층 로비 화분에 물 주기",
    reward: 3000,
    poster: "김민준",
    status: "available",
    acceptor: null,
  },
  {
    id: 3,
    title: "컴퓨터실 A 백업 작업",
    reward: 15000,
    poster: "관리자",
    status: "in-progress",
    acceptor: "박서연",
  },
];

// 보상 생성 함수
const generateRandomReward = () => {
    // 쿠폰 보상: 1에 높은 가중치
    const couponWeights = [0.5, 0.2, 0.1, 0.05, 0.05, 0.03, 0.03, 0.02, 0.01, 0.01];
    const randomCoupon = Math.random();
    let couponSum = 0;
    let couponReward = 1;
    for (let i = 0; i < couponWeights.length; i++) {
        couponSum += couponWeights[i];
        if (randomCoupon < couponSum) {
            couponReward = i + 1;
            break;
        }
    }

    // 현금 보상: 100원에 높은 가중치
    const cashWeights = [0.6, 0.2, 0.1, 0.05, 0.05];
    const cashRanges = [100, 1000, 5000, 10000, 50000];
    const randomCash = Math.random();
    let cashSum = 0;
    let cashReward = 100;
    for (let i = 0; i < cashWeights.length; i++) {
        cashSum += cashWeights[i];
        if (randomCash < cashSum) {
            cashReward = cashRanges[i];
            break;
        }
    }
    
    // 실제 지급될 돈은 해당 범위 내에서 랜덤
    if (cashReward < 50000) {
        const nextRange = cashRanges[cashRanges.indexOf(cashReward) + 1] || cashReward;
        cashReward = Math.floor(Math.random() * (nextRange - cashReward + 1)) + cashReward;
    }


    return {
        cash: cashReward,
        coupon: couponReward,
    };
};


export default function PartTimeJob() {
  const { user, userDoc, addCash, addCouponsToUserById } = useAuth();
  const [jobs, setJobs] = useState(initialJobs);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobReward, setNewJobReward] = useState("");
  const [gameState, setGameState] = useState("list"); // list, cardSelection, reward
  const [selectedJob, setSelectedJob] = useState(null);
  const [rewardData, setRewardData] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [loading, setLoading] = useState(false);


  // 아르바이트 등록 처리 함수
  const handlePostJob = (e) => {
    e.preventDefault();
    if (!newJobTitle || !newJobReward) {
      alert("모든 항목을 입력해주세요.");
      return;
    }

    const newJob = {
      id: Date.now(), // 고유 ID 생성
      title: newJobTitle,
      reward: parseInt(newJobReward, 10),
      poster: userDoc.name,
      status: "available",
      acceptor: null,
    };

    setJobs([newJob, ...jobs]); // 새 작업을 목록 맨 위에 추가
    setNewJobTitle("");
    setNewJobReward("");
  };

  // 아르바이트 수락 함수 -> 카드 선택 화면으로 변경
  const handleAcceptJob = (jobId) => {
    const job = jobs.find((j) => j.id === jobId);
    setSelectedJob(job);
    const rewards = generateRandomReward();
    setRewardData(rewards);
    setSelectedCard(null);
    setIsFlipping(false);
    setGameState("cardSelection");
  };

  // 카드 선택 처리
  const handleCardSelect = async (cardType) => {
    if (isFlipping || selectedCard || !user) return;
  
    setSelectedCard(cardType);
    setIsFlipping(true);
  
    setTimeout(async () => {
      setLoading(true);
      const rewardAmount = cardType === "cash" ? rewardData.cash : rewardData.coupon;
      const rewardUnit = cardType === "cash" ? "원" : "개";
      const logMessage = `아르바이트 보상: ${selectedJob.title}`;
  
      try {
        if (cardType === "cash") {
          await addCash(rewardAmount, logMessage);
        } else {
          await addCouponsToUserById(user.uid, rewardAmount);
        }
  
        // 상태 업데이트
        setJobs(
          jobs.map((job) =>
            job.id === selectedJob.id
              ? { ...job, status: "in-progress", acceptor: userDoc.name }
              : job
          )
        );
  
        setTimeout(() => {
          setGameState("reward");
          setLoading(false);
        }, 1000);
  
      } catch (error) {
        console.error("보상 지급 중 오류 발생:", error);
        alert("보상 지급에 실패했습니다. 다시 시도해주세요.");
        setLoading(false);
        setIsFlipping(false);
        setSelectedCard(null);
      }
    }, 800);
  };


  // 알바비 지급 함수
  const handlePayReward = (jobId) => {
    const jobToPay = jobs.find((job) => job.id === jobId);
    if (
      window.confirm(
        `'${
          jobToPay.acceptor
        }'님에게 ${jobToPay.reward.toLocaleString()}원을 지급하시겠습니까?`
      )
    ) {
      setJobs(jobs.filter((job) => job.id !== jobId)); // 지급 완료된 작업은 목록에서 제거
      alert("지급이 완료되었습니다.");
    }
  };

  // 각 জব 카드에 표시될 버튼/상태를 결정하는 함수
  const renderJobAction = (job) => {
    if (!userDoc) return null;
    // 내가 올린 아르바이트인 경우
    if (job.poster === userDoc.name) {
      if (job.status === "available") {
        return <div className="status-info">수락 대기중</div>;
      }
      if (job.status === "in-progress") {
        return (
          <button
            className="job-btn pay-btn"
            onClick={() => handlePayReward(job.id)}
          >
            완료 및 알바비 지급
          </button>
        );
      }
    }
    // 다른 사람이 올린 아르바이트인 경우
    else {
      if (job.status === "available") {
        return (
          <button
            className="job-btn accept-btn"
            onClick={() => handleAcceptJob(job.id)}
          >
            수락하기
          </button>
        );
      }
      if (job.status === "in-progress" && job.acceptor === userDoc.name) {
        return <div className="status-inprogress">임무 수행중...</div>;
      }
    }

    return null; // 그 외의 경우 (예: 다른 사람이 수락한 경우)는 아무것도 표시하지 않음
  };

  const renderListView = () => (
    <>
    <header className="part-time-job-header">
    <h2>오늘의 아르바이트 📝</h2>
    <p>간단한 임무를 수행하고 리워드를 획득하세요!</p>
  </header>

  <section className="job-posting-form">
    <h3>✨ 새로운 아르바이트 등록하기</h3>
    <form onSubmit={handlePostJob}>
      <div className="form-group">
        <label htmlFor="job-title">무엇을 해야 하나요?</label>
        <input
          type="text"
          id="job-title"
          value={newJobTitle}
          onChange={(e) => setNewJobTitle(e.target.value)}
          placeholder="예: 3층 복도 청소"
        />
      </div>
      <div className="form-group">
        <label htmlFor="job-reward">얼마를 지급할 건가요? (원)</label>
        <input
          type="number"
          id="job-reward"
          value={newJobReward}
          onChange={(e) => setNewJobReward(e.target.value)}
          placeholder="예: 5000"
        />
      </div>
      <button type="submit" className="post-job-btn">
        등록하기
      </button>
    </form>
  </section>

  <section className="job-list-section">
    <h3>실시간 아르바이트 목록</h3>
    <div className="job-list">
      {jobs
        .filter((job) => {
          // '진행중'인 아르바이트는 등록자와 수락자에게만 보임
          if (job.status === "in-progress") {
            return (
              job.poster === currentUser.name ||
              job.acceptor === currentUser.name
            );
          }
          // '모집중'인 아르바이트는 모두에게 보임
          return true;
        })
        .map((job) => (
          <div className="job-card" key={job.id}>
            <div>
              <div className="job-card-header">
                <h4 className="job-title">{job.title}</h4>
                <p className="job-poster">등록자: {job.poster}</p>
              </div>
              <div className="job-reward">
                {job.reward.toLocaleString()} <span>원</span>
              </div>
            </div>
            <div className="job-actions">{renderJobAction(job)}</div>
          </div>
        ))}
    </div>
  </section>
  </>
  );

  const renderCardSelection = () => (
    <div className="card-selection-screen">
    <div className="card-selection-header">
      <h2>🎁 보상 카드를 선택하세요!</h2>
      <p>하나의 카드를 선택하면 랜덤 보상이 공개됩니다</p>
    </div>

    <div className="reward-cards">
      <div
        className={`reward-card ${selectedCard === 'cash' ? 'flipped' : ''} ${selectedCard && selectedCard !== 'cash' ? 'disabled' : ''}`}
        onClick={() => handleCardSelect('cash')}
      >
        <div className="card-inner">
          <div className="card-front">
            <div className="card-icon">💰</div>
            <div className="card-title">현금</div>
            <div className="card-hint">100원 ~ 50,000원</div>
          </div>
          <div className="card-back">
            <div className="reward-reveal">
              <div className="reward-icon">💰</div>
              <div className="reward-amount">{rewardData?.cash?.toLocaleString()}원</div>
              <div className="reward-label">현금 획득!</div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`reward-card ${selectedCard === 'coupon' ? 'flipped' : ''} ${selectedCard && selectedCard !== 'coupon' ? 'disabled' : ''}`}
        onClick={() => handleCardSelect('coupon')}
      >
        <div className="card-inner">
          <div className="card-front">
            <div className="card-icon">🎫</div>
            <div className="card-title">쿠폰</div>
            <div className="card-hint">1개 ~ 10개</div>
          </div>
          <div className="card-back">
            <div className="reward-reveal">
              <div className="reward-icon">🎫</div>
              <div className="reward-amount">{rewardData?.coupon}개</div>
              <div className="reward-label">쿠폰 획득!</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {loading && (
      <div className="processing-overlay">
        <div className="loading-spinner"></div>
        <p>보상 처리 중...</p>
      </div>
    )}
  </div>
  );

  const renderRewardView = () => {
    const rewardType = selectedCard;
    const rewardAmount = rewardType === 'cash' ? rewardData?.cash : rewardData?.coupon;

    return (
        <div className="typing-game-reward minigame-reward">
        <div className="reward-header">
          <h2>🎉 축하합니다!</h2>
          <p className="subtitle">보상을 획득했습니다</p>
        </div>

        <div className="reward-content">
          <div className="reward-display">
            <div className="reward-icon-large">
              {rewardType === 'cash' ? '💰' : '🎫'}
            </div>
            <div className="reward-text">
              {rewardType === 'cash'
                ? `${rewardAmount?.toLocaleString()}원`
                : `${rewardAmount}개`}
            </div>
            <div className="reward-type">
              {rewardType === 'cash' ? '현금' : '쿠폰'}
            </div>
          </div>
        </div>

        <div className="reward-actions">
          <button className="menu-btn" onClick={() => setGameState("list")}>
            목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  };


  return (
    <div className="part-time-job-container">
      {gameState === 'list' && renderListView()}
      {gameState === 'cardSelection' && renderCardSelection()}
      {gameState === 'reward' && renderRewardView()}
    </div>
  );
}
