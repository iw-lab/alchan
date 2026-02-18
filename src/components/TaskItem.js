// src/TaskItem.js
import React, { useState, useEffect, memo, useCallback } from "react";
import { createPortal } from "react-dom";
import { generateJobTaskReward } from "../utils/jobTaskRewards";

import { logger } from "../utils/logger";
const TaskItem = memo(function TaskItem({
  task,
  onEarnCoupon,
  onRequestApproval,
  isJobTask,
  isAdmin,
  onEditTask,
  onDeleteTask,
  taskId, // taskId prop 추가
  jobId = null, // jobId prop 추가 (직업 할일일 경우)
}) {
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const [showCardModal, setShowCardModal] = useState(false);
  const [rewardData, setRewardData] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [isFlipping, setIsFlipping] = useState(false);

  const handleInternalClick = () => {
    logger.log("[TaskItem] handleInternalClick 호출됨:", { taskName: task?.name, isJobTask, taskId, jobId });

    // 기본 검증
    if (
      !task ||
      typeof task.clicks !== "number" ||
      typeof task.maxClicks !== "number"
    ) {
      logger.error("Invalid task prop:", task);
      return;
    }
    if (task.maxClicks > 0 && task.clicks >= task.maxClicks) {
      return;
    }

    // 🔥 모든 할일에 랜덤 보상 카드 모달 표시
    logger.log("[TaskItem] 카드 모달 열기");
    const rewards = generateJobTaskReward();
    setRewardData(rewards);
    setSelectedCard(null);
    setIsFlipping(false);
    setShowCardModal(true);
  };

  const handleCardSelect = (cardType) => {
    if (isFlipping || selectedCard) return;

    logger.log("[TaskItem] 카드 선택:", { cardType, taskId, jobId, isJobTask, requiresApproval: task.requiresApproval });

    setSelectedCard(cardType);
    setIsFlipping(true);

    // 800ms 후 보상 적용
    setTimeout(() => {
      const reward = cardType === "cash" ? rewardData.cash : rewardData.coupon;
      const rewardText = cardType === "cash" ? `${reward.toLocaleString()}원` : `${reward}개`;

      // 🔥 승인 필요 할일: onRequestApproval 호출 (보상 미지급)
      if (task.requiresApproval && typeof onRequestApproval === "function") {
        logger.log("[TaskItem] onRequestApproval 호출:", { taskId, jobId, isJobTask, cardType, reward });
        onRequestApproval(taskId || task.id, jobId, isJobTask, cardType, reward);
        setShowCardModal(false);
        setBubbleText("승인 요청 완료! 관리자 승인 후 보상이 지급됩니다.");
        setShowBubble(true);
        setIsFlipping(false);
        return;
      }

      logger.log("[TaskItem] onEarnCoupon 호출 준비:", { taskId, jobId, isJobTask, cardType, reward });

      // onEarnCoupon 호출 - taskId, jobId, isJobTask, cardType, reward 전달
      if (typeof onEarnCoupon === "function") {
        onEarnCoupon(taskId || task.id, jobId, isJobTask, cardType, reward);
      }

      setShowCardModal(false);
      setBubbleText(`${cardType === "cash" ? "💰 현금" : "🎫 쿠폰"} ${rewardText} 획득!`);
      setShowBubble(true);
      setIsFlipping(false);
    }, 800);
  };

  useEffect(() => {
    let timer;
    if (showBubble) {
      timer = setTimeout(() => {
        setShowBubble(false);
        setBubbleText("");
      }, 2000);
    }
    return () => clearTimeout(timer);
  }, [showBubble]);

  const isCompleted =
    task && task.maxClicks > 0 && task.clicks >= task.maxClicks;

  if (!task) return null;

  const isMobile = window.innerWidth <= 768;

  const taskItemStyle = {
    backgroundColor: isCompleted ? "rgba(20, 20, 35, 0.4)" : "rgba(30, 30, 50, 0.6)",
    border: `1px solid ${isCompleted ? "rgba(100, 116, 139, 0.1)" : "rgba(0, 255, 242, 0.15)"}`,
    opacity: isCompleted ? 0.6 : 1,
    padding: isMobile ? "8px 10px" : "12px",
    boxShadow: isCompleted ? "none" : "0 4px 12px rgba(0, 0, 0, 0.1)",
  };

  const taskInfoStyle = {
    gap: isMobile ? "6px" : "10px",
  };

  const taskNameStyle = {
    color: isCompleted ? "#64748b" : "#e8e8ff",
    fontSize: isMobile ? "12px" : "16px",
    lineHeight: "1.4",
  };

  const taskActionsStyle = {
    gap: isMobile ? "4px" : "8px",
  };

  const couponStyle = {
    backgroundColor: isJobTask ? "rgba(79, 70, 229, 0.3)" : "rgba(16, 185, 129, 0.3)",
    color: isJobTask ? "#818cf8" : "#34d399",
    border: isJobTask ? "1px solid rgba(99, 102, 241, 0.5)" : "1px solid rgba(52, 211, 153, 0.5)",
    padding: isMobile ? "3px 6px" : "4px 10px",
    fontSize: isMobile ? "10px" : "13px",
  };

  const renderCardModal = () => {
    if (!showCardModal || !rewardData) return null;

    const mobileModalContentStyle = {
      ...modalContentStyle,
      padding: isMobile ? "20px" : "40px",
    };

    const mobileModalTitleStyle = {
      ...modalTitleStyle,
      fontSize: isMobile ? "20px" : "28px",
    };

    const mobileModalSubtitleStyle = {
      ...modalSubtitleStyle,
      fontSize: isMobile ? "13px" : "16px",
    };

    const mobileCardsContainerStyle = {
      ...cardsContainerStyle,
      gap: isMobile ? "15px" : "20px",
    };

    const mobileCardStyle = {
      ...cardStyle,
      width: isMobile ? "140px" : "200px",
      height: isMobile ? "200px" : "280px",
    };

    const mobileCardIconStyle = {
      ...cardIconStyle,
      fontSize: isMobile ? "50px" : "80px",
      marginBottom: isMobile ? "10px" : "20px",
    };

    const mobileCardTextStyle = {
      ...cardTextStyle,
      fontSize: isMobile ? "18px" : "24px",
    };

    const mobileRewardAmountStyle = {
      ...rewardAmountStyle,
      fontSize: isMobile ? "24px" : "36px",
    };

    const mobileRewardLabelStyle = {
      ...rewardLabelStyle,
      fontSize: isMobile ? "14px" : "18px",
    };

    return createPortal(
      <div className="fixed inset-0 flex items-center justify-center z-[10000]" style={modalOverlayStyle} onClick={() => setShowCardModal(false)}>
        <div className="rounded-[20px] max-w-[600px]" style={{...mobileModalContentStyle, width: isMobile ? "95%" : "90%"}} onClick={(e) => e.stopPropagation()}>
          <h3 className="text-center font-bold" style={{...mobileModalTitleStyle, marginBottom: isMobile ? "8px" : "10px"}}>🎁 보상 선택</h3>
          <p className="text-center" style={{...mobileModalSubtitleStyle, marginBottom: isMobile ? "20px" : "30px"}}>두 개의 카드 중 하나를 선택하세요!</p>

          <div className="flex justify-center flex-wrap" style={mobileCardsContainerStyle}>
            {/* 현금 카드 */}
            <div
              className="cursor-pointer"
              style={{
                ...mobileCardStyle,
                ...(selectedCard === "cash" && selectedCardStyle),
              }}
              onClick={() => !selectedCard && handleCardSelect("cash")}
            >
              <div className="relative w-full h-full" style={{
                ...cardInnerStyle,
                transform: selectedCard === "cash" ? "rotateY(180deg)" : "rotateY(0deg)",
              }}>
                <div className="absolute w-full h-full rounded-2xl flex flex-col items-center justify-center" style={{...cardFrontStyle, backfaceVisibility: "hidden"}}>
                  <div style={mobileCardIconStyle}>💰</div>
                  <div className="text-2xl font-bold" style={mobileCardTextStyle}>현금</div>
                </div>
                <div className="absolute w-full h-full rounded-2xl flex flex-col items-center justify-center" style={{ ...cardBackStyle, ...(selectedCard === "cash" && cardBackVisibleStyle), backfaceVisibility: "hidden" }}>
                  <div className="text-4xl font-bold mb-2.5" style={mobileRewardAmountStyle}>{rewardData.cash.toLocaleString()}원</div>
                  <div className="text-lg" style={mobileRewardLabelStyle}>💰 현금 획득!</div>
                </div>
              </div>
            </div>

            {/* 쿠폰 카드 */}
            <div
              className="cursor-pointer"
              style={{
                ...mobileCardStyle,
                ...(selectedCard === "coupon" && selectedCardStyle),
              }}
              onClick={() => !selectedCard && handleCardSelect("coupon")}
            >
              <div className="relative w-full h-full" style={{
                ...cardInnerStyle,
                transform: selectedCard === "coupon" ? "rotateY(180deg)" : "rotateY(0deg)",
              }}>
                <div className="absolute w-full h-full rounded-2xl flex flex-col items-center justify-center" style={{...cardFrontStyle, backfaceVisibility: "hidden"}}>
                  <div style={mobileCardIconStyle}>🎫</div>
                  <div className="text-2xl font-bold" style={mobileCardTextStyle}>쿠폰</div>
                </div>
                <div className="absolute w-full h-full rounded-2xl flex flex-col items-center justify-center" style={{ ...cardBackStyle, ...(selectedCard === "coupon" && cardBackVisibleStyle), backfaceVisibility: "hidden" }}>
                  <div className="text-4xl font-bold mb-2.5" style={mobileRewardAmountStyle}>{rewardData.coupon}개</div>
                  <div className="text-lg" style={mobileRewardLabelStyle}>🎫 쿠폰 획득!</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <>
      <div
        className="flex flex-row items-center justify-between relative rounded-lg mb-2 transition-all"
        style={{
          ...taskItemStyle,
          cursor: isCompleted ? "default" : "pointer",
          gap: isMobile ? "6px" : "8px",
        }}
        onClick={isCompleted ? null : handleInternalClick}
      >
        <div className="flex items-center flex-grow min-w-0 overflow-hidden" style={taskInfoStyle}>
          <span className="font-semibold overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0" style={taskNameStyle} title={task.name}>
            {task.name}
          </span>
        </div>

        <div className="flex items-center flex-shrink-0" style={taskActionsStyle}>
          {/* 🔥 승인필요/랜덤보상 뱃지 */}
          <span className="rounded-lg font-medium whitespace-nowrap" style={task.requiresApproval ? approvalBadgeStyle : couponStyle}>
            {task.requiresApproval ? "⏳ 승인필요" : "🎁 랜덤보상"}
          </span>

          {isAdmin && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditTask();
                }}
                className="cursor-pointer p-1 flex items-center justify-center"
                style={adminButtonStyles}
                aria-label="할일 수정"
              >
                ✏️
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTask();
                }}
                className="cursor-pointer p-1 flex items-center justify-center"
                style={adminButtonStyles}
                aria-label="할일 삭제"
              >
                🗑️
              </button>
            </>
          )}
        </div>

        {showBubble && (
          <div className="absolute left-1/2 -translate-x-1/2 rounded-md font-medium whitespace-nowrap z-10 pointer-events-none" style={bubbleStyle}>
            {bubbleText}
            <div className="absolute" style={bubbleTailStyle}></div>
          </div>
        )}
      </div>

      {renderCardModal()}
    </>
  );
});

export default TaskItem;

const approvalBadgeStyle = {
  backgroundColor: "rgba(245, 158, 11, 0.3)",
  color: "#fbbf24",
  border: "1px solid rgba(245, 158, 11, 0.5)",
  padding: "4px 10px",
  fontSize: "13px",
};

const adminButtonStyles = {
  background: "none",
  border: "none",
  fontSize: "16px",
  color: "#94a3b8",
};

const bubbleStyle = {
  bottom: "calc(100% + 8px)",
  backgroundColor: "rgba(0, 0, 0, 0.75)",
  color: "white",
  padding: "5px 10px",
  fontSize: "12px",
  boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
};

const bubbleTailStyle = {
  content: '""',
  top: "100%",
  left: "50%",
  marginLeft: "-5px",
  borderWidth: "5px",
  borderStyle: "solid",
  borderColor: "rgba(0, 0, 0, 0.75) transparent transparent transparent",
};

// 카드 모달 스타일
const modalOverlayStyle = {
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  animation: "fadeIn 0.3s ease",
};

const modalContentStyle = {
  backgroundColor: "#1a1a2e",
  border: "1px solid rgba(0, 255, 242, 0.3)",
  boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)",
  animation: "zoomIn 0.3s ease",
};

const modalTitleStyle = {
  color: "#ffffff",
  textShadow: "0 0 10px rgba(0, 255, 242, 0.5)",
};

const modalSubtitleStyle = {
  color: "#a0a0c0",
};

const cardsContainerStyle = {
  gap: "20px",
};

const cardStyle = {
  perspective: "1000px",
  transition: "transform 0.2s ease",
};

const selectedCardStyle = {
  transform: "scale(1.05)",
};

const cardInnerStyle = {
  transition: "transform 0.8s",
  transformStyle: "preserve-3d",
};

const cardFrontStyle = {
  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  boxShadow: "0 8px 16px rgba(0, 0, 0, 0.2)",
  border: "3px solid #fff",
};

const cardBackStyle = {
  backgroundColor: "#fff",
  boxShadow: "0 8px 16px rgba(0, 0, 0, 0.2)",
  border: "3px solid #667eea",
  transform: "rotateY(180deg)",
  opacity: 0,
  transition: "opacity 0.3s ease 0.4s",
};

const cardBackVisibleStyle = {
  opacity: 1,
};

const cardIconStyle = {
  fontSize: "80px",
  marginBottom: "20px",
};

const cardTextStyle = {
  color: "white",
};

const rewardAmountStyle = {
  color: "#667eea",
};

const rewardLabelStyle = {
  color: "#666",
};