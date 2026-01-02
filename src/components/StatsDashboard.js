// src/components/StatsDashboard.js
// 학습 통계 대시보드

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import {
  TrendingUp, TrendingDown, Minus, BarChart3, PieChart,
  Calendar, Trophy, Target, Coins, Gamepad2, Users, ArrowRight
} from 'lucide-react';

// 간단한 바 차트 컴포넌트
function BarChart({ data, height = 120, className = '' }) {
  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className={`flex items-end justify-between gap-1 ${className}`} style={{ height }}>
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className={`w-full rounded-t-md transition-all duration-500 ${item.color || 'bg-indigo-500'}`}
            style={{ height: `${(item.value / maxValue) * 100}%`, minHeight: item.value > 0 ? 4 : 0 }}
          />
          <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate w-full text-center">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// 도넛 차트 컴포넌트
function DonutChart({ data, size = 100, strokeWidth = 12, className = '' }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* 배경 원 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-100 dark:text-gray-700"
        />

        {/* 데이터 세그먼트 */}
        {data.map((item, i) => {
          const percentage = total > 0 ? item.value / total : 0;
          const dashLength = circumference * percentage;
          const dashOffset = circumference * currentOffset;
          currentOffset += percentage;

          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={-dashOffset}
              className="transition-all duration-500"
            />
          );
        })}
      </svg>

      {/* 중앙 텍스트 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-gray-900 dark:text-white">{total}</span>
      </div>
    </div>
  );
}

// 통계 카드 컴포넌트
function StatCard({ title, value, change, icon: Icon, color = 'indigo', trend = 'neutral' }) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-400';

  const colorClasses = {
    indigo: 'from-indigo-500 to-violet-600',
    green: 'from-green-500 to-emerald-600',
    amber: 'from-amber-500 to-orange-600',
    pink: 'from-pink-500 to-rose-600',
    blue: 'from-blue-500 to-cyan-600'
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center`}>
          <Icon size={20} className="text-white" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 ${trendColor}`}>
            <TrendIcon size={14} />
            <span className="text-xs font-medium">{change}%</span>
          </div>
        )}
      </div>
      <h3 className="text-sm text-gray-500 dark:text-gray-400 mb-1">{title}</h3>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

// 메인 통계 대시보드
export function StatsDashboard({ userId, classCode, isAdmin = false }) {
  const [stats, setStats] = useState(null);
  const [weeklyData, setWeeklyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week'); // week, month, all

  useEffect(() => {
    if (!userId && !classCode) {
      setLoading(false);
      return;
    }

    loadStats();
  }, [userId, classCode, period]);

  const loadStats = async () => {
    setLoading(true);
    try {
      // 기본 통계 계산
      const userStats = {
        totalEarned: 0,
        totalSpent: 0,
        tasksCompleted: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        donationCount: 0,
        loginDays: 0
      };

      // 주간 데이터 (최근 7일)
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      const today = new Date();
      const weekData = [];

      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        weekData.push({
          label: days[date.getDay()],
          value: Math.floor(Math.random() * 100), // 실제로는 DB에서 가져옴
          color: i === 0 ? 'bg-indigo-500' : 'bg-indigo-300 dark:bg-indigo-600'
        });
      }

      setWeeklyData(weekData);
      setStats({
        ...userStats,
        totalEarned: Math.floor(Math.random() * 10000),
        totalSpent: Math.floor(Math.random() * 5000),
        tasksCompleted: Math.floor(Math.random() * 50),
        gamesPlayed: Math.floor(Math.random() * 30),
        gamesWon: Math.floor(Math.random() * 15),
        donationCount: Math.floor(Math.random() * 10),
        loginDays: Math.floor(Math.random() * 30)
      });
    } catch (error) {
      console.error('통계 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          ))}
        </div>
        <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        통계 데이터를 불러올 수 없습니다.
      </div>
    );
  }

  const categoryData = [
    { label: '수입', value: stats.totalEarned, color: '#22c55e' },
    { label: '지출', value: stats.totalSpent, color: '#ef4444' },
    { label: '저축', value: stats.totalEarned - stats.totalSpent, color: '#3b82f6' }
  ];

  return (
    <div className="space-y-6">
      {/* 기간 선택 */}
      <div className="flex gap-2">
        {[
          { id: 'week', label: '이번 주' },
          { id: 'month', label: '이번 달' },
          { id: 'all', label: '전체' }
        ].map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              period === p.id
                ? 'bg-indigo-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 주요 지표 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="총 수입"
          value={`${stats.totalEarned.toLocaleString()}원`}
          change={12}
          trend="up"
          icon={Coins}
          color="green"
        />
        <StatCard
          title="완료한 할일"
          value={stats.tasksCompleted}
          change={8}
          trend="up"
          icon={Target}
          color="amber"
        />
        <StatCard
          title="게임 승률"
          value={stats.gamesPlayed > 0 ? `${Math.round(stats.gamesWon / stats.gamesPlayed * 100)}%` : '0%'}
          icon={Gamepad2}
          color="pink"
        />
        <StatCard
          title="접속일"
          value={`${stats.loginDays}일`}
          icon={Calendar}
          color="blue"
        />
      </div>

      {/* 차트 섹션 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 주간 활동 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <BarChart3 size={18} className="text-indigo-500" />
              주간 활동
            </h3>
          </div>
          <BarChart data={weeklyData} height={120} />
        </div>

        {/* 자산 분포 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <PieChart size={18} className="text-indigo-500" />
              자산 분포
            </h3>
          </div>
          <div className="flex items-center justify-center gap-8">
            <DonutChart data={categoryData} size={100} />
            <div className="space-y-2">
              {categoryData.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{item.label}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {item.value.toLocaleString()}원
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 성취 현황 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Trophy size={18} className="text-amber-500" />
            이번 주 성취
          </h3>
          <button className="text-sm text-indigo-500 hover:text-indigo-600 flex items-center gap-1">
            전체 보기 <ArrowRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: '할일 완료', current: stats.tasksCompleted, goal: 10, color: 'bg-emerald-500' },
            { label: '게임 승리', current: stats.gamesWon, goal: 5, color: 'bg-purple-500' },
            { label: '기부 횟수', current: stats.donationCount, goal: 3, color: 'bg-rose-500' },
            { label: '연속 출석', current: stats.loginDays, goal: 7, color: 'bg-blue-500' }
          ].map((item, i) => {
            const progress = Math.min((item.current / item.goal) * 100, 100);
            return (
              <div key={i} className="text-center">
                <div className="relative w-16 h-16 mx-auto mb-2">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="6"
                      className="text-gray-100 dark:text-gray-700"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      strokeWidth="6"
                      strokeDasharray={`${progress * 1.76} 176`}
                      className={item.color}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {item.current}/{item.goal}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default StatsDashboard;
