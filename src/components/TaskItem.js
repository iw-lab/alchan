// src/TaskItem.js
import React, { useState, useEffect, memo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";
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

      // 🔥 모든 할일은 관리자 승인 필수: onRequestApproval 호출 (보상 미지급)
      if (typeof onRequestApproval === "function") {
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
    backgroundColor: isCompleted ? "var(--bg-secondary)" : "var(--bg-card)",
    border: `1px solid ${isCompleted ? "var(--border-secondary)" : "var(--border-primary)"}`,
    opacity: isCompleted ? 0.6 : 1,
    padding: isMobile ? "10px 12px" : "14px 16px",
    boxShadow: isCompleted ? "none" : "var(--shadow-sm)",
    borderRadius: "12px",
  };

  const taskInfoStyle = {
    gap: isMobile ? "6px" : "10px",
  };

  const taskNameStyle = {
    color: isCompleted ? "var(--text-muted)" : "var(--text-primary)",
    fontSize: isMobile ? "13px" : "15px",
    lineHeight: "1.4",
    fontWeight: 500,
  };

  const taskActionsStyle = {
    gap: isMobile ? "4px" : "8px",
  };

  const couponStyle = {
    backgroundColor: isJobTask ? "var(--accent-light)" : "var(--success-bg)",
    color: isJobTask ? "var(--accent)" : "var(--success)",
    border: isJobTask ? "1px solid var(--border-accent)" : "1px solid rgba(16, 185, 129, 0.3)",
    padding: isMobile ? "3px 6px" : "4px 10px",
    fontSize: isMobile ? "10px" : "13px",
  };

  const renderCardModal = () => {
    if (!showCardModal || !rewardData) return null;

    const mobileModalContentStyle = {
      ...modalContentStyle,
      padding: isMobile ? "24px" : "40px",
    };

    const mobileModalTitleStyle = {
      ...modalTitleStyle,
      fontSize: isMobile ? "20px" : "26px",
    };

    const mobileModalSubtitleStyle = {
      ...modalSubtitleStyle,
      fontSize: isMobile ? "13px" : "15px",
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
      fontSize: isMobile ? "50px" : "72px",
      marginBottom: isMobile ? "10px" : "20px",
    };

    const mobileCardTextStyle = {
      ...cardTextStyle,
      fontSize: isMobile ? "18px" : "22px",
    };

    const mobileRewardAmountStyle = {
      ...rewardAmountStyle,
      fontSize: isMobile ? "24px" : "32px",
    };

    const mobileRewardLabelStyle = {
      ...rewardLabelStyle,
      fontSize: isMobile ? "14px" : "16px",
    };

    return createPortal(
      <div className="fixed inset-0 flex items-center justify-center z-[10000]" style={modalOverlayStyle} onClick={() => setShowCardModal(false)}>
        <div className="rounded-2xl max-w-[600px]" style={{...mobileModalContentStyle, width: isMobile ? "95%" : "90%"}} onClick={(e) => e.stopPropagation()}>
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
        className="flex flex-row items-center justify-between relative mb-2 transition-all"
        style={{
          ...taskItemStyle,
          cursor: isCompleted ? "default" : "pointer",
          gap: isMobile ? "6px" : "8px",
        }}
        onClick={isCompleted ? null : handleInternalClick}
      >
        <div className="flex items-center flex-grow min-w-0 overflow-hidden" style={taskInfoStyle}>
          <span className="font-medium overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0" style={taskNameStyle} title={task.name}>
            {task.name}
          </span>
        </div>

        <div className="flex items-center flex-shrink-0" style={taskActionsStyle}>
          {/* 진행 횟수 표시 */}
          {task.maxClicks > 0 && (
            <span className="rounded-lg font-medium whitespace-nowrap" style={{
              backgroundColor: isCompleted ? "var(--bg-hover)" : "var(--accent-light)",
              color: isCompleted ? "var(--text-muted)" : "var(--accent)",
              border: `1px solid ${isCompleted ? "var(--border-secondary)" : "var(--border-accent)"}`,
              padding: isMobile ? "2px 6px" : "4px 8px",
              fontSize: isMobile ? "10px" : "12px",
            }}>
              {task.clicks}/{task.maxClicks}
            </span>
          )}
          {/* 🔥 모든 할일 승인필요 뱃지 */}
          <span
            className="rounded-lg font-medium whitespace-nowrap inline-flex items-center gap-1"
            style={approvalBadgeStyle}
          >
            <Clock size={12} strokeWidth={2.3} />
            승인필요
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
          <div className="absolute left-1/2 -translate-x-1/2 rounded-lg font-medium whitespace-nowrap z-10 pointer-events-none" style={bubbleStyle}>
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
  backgroundColor: "var(--warning-bg)",
  color: "var(--warning)",
  border: "1px solid rgba(245, 158, 11, 0.3)",
  padding: "4px 10px",
  fontSize: "12px",
  borderRadius: "8px",
};

const adminButtonStyles = {
  background: "none",
  border: "none",
  fontSize: "16px",
  color: "var(--text-muted)",
};

const bubbleStyle = {
  bottom: "calc(100% + 8px)",
  backgroundColor: "var(--bg-card)",
  color: "var(--text-primary)",
  padding: "6px 12px",
  fontSize: "12px",
  boxShadow: "var(--shadow-lg)",
  border: "1px solid var(--border-primary)",
};

const bubbleTailStyle = {
  content: '""',
  top: "100%",
  left: "50%",
  marginLeft: "-5px",
  borderWidth: "5px",
  borderStyle: "solid",
  borderColor: "var(--bg-card) transparent transparent transparent",
};

// 카드 모달 스타일
const modalOverlayStyle = {
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  animation: "fadeIn 0.3s ease",
};

const modalContentStyle = {
  backgroundColor: "var(--bg-card)",
  border: "1px solid var(--border-primary)",
  boxShadow: "var(--shadow-lg)",
  animation: "slideUp 0.3s ease",
};

const modalTitleStyle = {
  color: "var(--text-primary)",
};

const modalSubtitleStyle = {
  color: "var(--text-secondary)",
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
  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  boxShadow: "0 8px 24px rgba(99, 102, 241, 0.25)",
  border: "none",
};

const cardBackStyle = {
  backgroundColor: "var(--bg-card)",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)",
  border: "2px solid #6366f1",
  transform: "rotateY(180deg)",
  opacity: 0,
  transition: "opacity 0.3s ease 0.4s",
};

const cardBackVisibleStyle = {
  opacity: 1,
};

const cardIconStyle = {
  fontSize: "72px",
  marginBottom: "20px",
};

const cardTextStyle = {
  color: "white",
};

const rewardAmountStyle = {
  color: "#6366f1",
};

const rewardLabelStyle = {
  color: "var(--text-secondary)",
};
