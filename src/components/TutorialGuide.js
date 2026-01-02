// src/components/TutorialGuide.js
// 신규 사용자 온보딩 튜토리얼

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  X, ChevronLeft, ChevronRight, Sparkles, Wallet, Target,
  Gamepad2, ShoppingBag, TrendingUp, Users, Check, Play
} from 'lucide-react';

// 튜토리얼 단계 정의
const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: '알찬에 오신 것을 환영해요! ✨',
    description: '알찬은 학급 경제를 체험하며 배우는 교육 앱이에요. 함께 알아볼까요?',
    icon: Sparkles,
    color: 'from-indigo-500 to-violet-600',
    tips: [
      '실제 경제처럼 돈을 벌고 쓸 수 있어요',
      '다양한 활동으로 보상을 받아요',
      '친구들과 함께 게임도 즐길 수 있어요'
    ]
  },
  {
    id: 'assets',
    title: '나의 자산 관리하기 💰',
    description: '현금과 쿠폰을 확인하고 관리할 수 있어요.',
    icon: Wallet,
    color: 'from-emerald-500 to-teal-600',
    tips: [
      '현금: 물건을 사거나 서비스를 이용할 때 사용해요',
      '쿠폰: 특별한 혜택을 받을 수 있어요',
      '자산 페이지에서 거래 내역을 확인해요'
    ],
    action: {
      label: '자산 보기',
      path: '/my-assets'
    }
  },
  {
    id: 'tasks',
    title: '할일 완료하고 보상받기 ✅',
    description: '선생님이 내주신 할일을 완료하면 보상을 받아요!',
    icon: Target,
    color: 'from-amber-500 to-orange-600',
    tips: [
      '매일 할일을 확인해요',
      '완료하면 현금이나 쿠폰을 받아요',
      '연속으로 완료하면 추가 보상!'
    ],
    action: {
      label: '할일 보기',
      path: '/dashboard/tasks'
    }
  },
  {
    id: 'shop',
    title: '아이템 상점 이용하기 🛒',
    description: '번 돈으로 아이템을 구매할 수 있어요.',
    icon: ShoppingBag,
    color: 'from-pink-500 to-rose-600',
    tips: [
      '다양한 아이템을 구경해보세요',
      '아이템을 사서 사용하거나 되팔 수 있어요',
      '특별한 아이템은 한정 판매!'
    ],
    action: {
      label: '상점 가기',
      path: '/item-shop'
    }
  },
  {
    id: 'games',
    title: '게임으로 실력 겨루기 🎮',
    description: '친구들과 오목, 타자연습 등 게임을 즐겨요!',
    icon: Gamepad2,
    color: 'from-purple-500 to-violet-600',
    tips: [
      '오목, 고누, 체스 게임이 있어요',
      '타자연습으로 실력을 키워요',
      '게임에서 이기면 보상을 받을 수도!'
    ],
    action: {
      label: '게임 하기',
      path: '/learning-games/omok'
    }
  },
  {
    id: 'finance',
    title: '금융 활동 체험하기 💹',
    description: '은행, 주식, 경매 등 금융 활동을 체험해요.',
    icon: TrendingUp,
    color: 'from-blue-500 to-cyan-600',
    tips: [
      '은행에서 저축하면 이자를 받아요',
      '주식을 사고 팔아 수익을 내요',
      '경매에서 특별한 아이템을 얻어요'
    ],
    action: {
      label: '은행 가기',
      path: '/banking'
    }
  },
  {
    id: 'community',
    title: '학급 활동 참여하기 👥',
    description: '법원, 국회, 정부 등 공공기관 활동에 참여해요.',
    icon: Users,
    color: 'from-teal-500 to-emerald-600',
    tips: [
      '국회에서 법안에 투표해요',
      '법원에서 분쟁을 해결해요',
      '학급 목표를 위해 기부할 수 있어요'
    ],
    action: {
      label: '둘러보기',
      path: '/government'
    }
  },
  {
    id: 'complete',
    title: '준비 완료! 🎉',
    description: '이제 알찬의 모든 기능을 사용할 준비가 됐어요!',
    icon: Check,
    color: 'from-green-500 to-emerald-600',
    tips: [
      '궁금한 점은 선생님께 물어보세요',
      '매일 접속하면 더 많은 혜택을!',
      '즐거운 학급 경제 생활 되세요!'
    ]
  }
];

// 메인 튜토리얼 컴포넌트
export function TutorialGuide({ onComplete, onSkip }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const step = TUTORIAL_STEPS[currentStep];
  const Icon = step.icon;
  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = useCallback(() => {
    if (isLastStep) {
      onComplete?.();
      return;
    }

    setIsAnimating(true);
    setTimeout(() => {
      setCurrentStep(prev => prev + 1);
      setIsAnimating(false);
    }, 200);
  }, [isLastStep, onComplete]);

  const handlePrev = useCallback(() => {
    if (isFirstStep) return;

    setIsAnimating(true);
    setTimeout(() => {
      setCurrentStep(prev => prev - 1);
      setIsAnimating(false);
    }, 200);
  }, [isFirstStep]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl">
        {/* 헤더 */}
        <div className={`bg-gradient-to-r ${step.color} p-6 text-white relative`}>
          <button
            onClick={onSkip}
            className="absolute top-4 right-4 p-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X size={20} />
          </button>

          <div className="flex items-center justify-center mb-4">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
              <Icon size={40} />
            </div>
          </div>

          <h2 className="text-xl font-bold text-center">{step.title}</h2>

          {/* 진행 표시 */}
          <div className="flex justify-center gap-1 mt-4">
            {TUTORIAL_STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === currentStep ? 'w-6 bg-white' : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 콘텐츠 */}
        <div className={`p-6 transition-opacity duration-200 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
          <p className="text-gray-600 dark:text-gray-300 text-center mb-6">
            {step.description}
          </p>

          <div className="space-y-3 mb-6">
            {step.tips.map((tip, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
              >
                <div className={`w-6 h-6 rounded-full bg-gradient-to-r ${step.color} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-white text-xs font-bold">{i + 1}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">{tip}</p>
              </div>
            ))}
          </div>

          {step.action && (
            <a
              href={step.action.path}
              className={`block w-full py-3 bg-gradient-to-r ${step.color} text-white rounded-xl font-semibold text-center mb-4 hover:opacity-90 transition-opacity`}
              onClick={(e) => {
                e.preventDefault();
                // 튜토리얼 중에는 이동하지 않고 다음 단계로
                handleNext();
              }}
            >
              <Play size={16} className="inline mr-2" />
              {step.action.label}
            </a>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handlePrev}
            disabled={isFirstStep}
            className={`flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
              isFirstStep
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <ChevronLeft size={18} />
            이전
          </button>
          <button
            onClick={handleNext}
            className={`flex-1 py-3 bg-gradient-to-r ${step.color} text-white rounded-xl font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2`}
          >
            {isLastStep ? '시작하기' : '다음'}
            {!isLastStep && <ChevronRight size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// 튜토리얼 훅
export function useTutorial() {
  const { user } = useAuth();
  const [showTutorial, setShowTutorial] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const checkTutorial = async () => {
      try {
        const tutorialRef = doc(db, 'users', user.uid, 'settings', 'tutorial');
        const tutorialDoc = await getDoc(tutorialRef);

        if (!tutorialDoc.exists() || !tutorialDoc.data().completed) {
          setShowTutorial(true);
        }
      } catch (error) {
        console.error('튜토리얼 체크 오류:', error);
      } finally {
        setLoading(false);
      }
    };

    checkTutorial();
  }, [user?.uid]);

  const completeTutorial = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const tutorialRef = doc(db, 'users', user.uid, 'settings', 'tutorial');
      await setDoc(tutorialRef, {
        completed: true,
        completedAt: serverTimestamp()
      });
      setShowTutorial(false);
    } catch (error) {
      console.error('튜토리얼 완료 저장 오류:', error);
    }
  }, [user?.uid]);

  const skipTutorial = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const tutorialRef = doc(db, 'users', user.uid, 'settings', 'tutorial');
      await setDoc(tutorialRef, {
        completed: true,
        skipped: true,
        skippedAt: serverTimestamp()
      });
      setShowTutorial(false);
    } catch (error) {
      console.error('튜토리얼 스킵 저장 오류:', error);
    }
  }, [user?.uid]);

  const resetTutorial = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const tutorialRef = doc(db, 'users', user.uid, 'settings', 'tutorial');
      await setDoc(tutorialRef, {
        completed: false
      });
      setShowTutorial(true);
    } catch (error) {
      console.error('튜토리얼 리셋 오류:', error);
    }
  }, [user?.uid]);

  return {
    showTutorial,
    loading,
    completeTutorial,
    skipTutorial,
    resetTutorial
  };
}

// 단일 기능 가이드 툴팁
export function FeatureTooltip({ children, title, description, position = 'bottom' }) {
  const [show, setShow] = useState(false);

  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2'
  };

  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className={`absolute ${positionClasses[position]} left-1/2 -translate-x-1/2 w-48 p-3 bg-gray-900 text-white rounded-xl shadow-xl z-50`}>
          <h4 className="font-semibold text-sm mb-1">{title}</h4>
          <p className="text-xs text-gray-300">{description}</p>
          <div className="absolute w-2 h-2 bg-gray-900 transform rotate-45 left-1/2 -translate-x-1/2 -top-1" />
        </div>
      )}
    </div>
  );
}

export default TutorialGuide;
