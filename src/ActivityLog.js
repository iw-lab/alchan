// src/ActivityLog.js - 최적화된 전역 캐시 버전
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAuth } from "./contexts/AuthContext";
import { useOptimizedActivityLogs, useDebouncedRefresh, usePolling, useStatistics } from "./hooks/useOptimizedData";
import "./ActivityLog.css";
// Fixed duplicate statistics declaration

const ActivityLog = () => {
  const { userDoc } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLogType, setSelectedLogType] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("");

  // 🔥 [최적화] 전역 캐시를 사용한 데이터 로딩
  // filters를 문자열로 직렬화하여 비교 가능하게 만듦
  const filtersKey = useMemo(() =>
    JSON.stringify({
      dateFilter,
      logType: selectedLogType,
      user: userFilter,
    }), [dateFilter, selectedLogType, userFilter]);

  const filters = useMemo(() =>
    JSON.parse(filtersKey), [filtersKey]);

  const {
    logs,
    loading,
    error,
    refresh,
    fetchMore,
    hasMore
  } = useOptimizedActivityLogs(userDoc?.classCode, filters);
  
  const { stats: statistics, loading: statsLoading, error: statsError, refresh: refreshStats } = useStatistics();

  // 디바운스된 새로고침
  const debouncedRefresh = useDebouncedRefresh(refresh, 500);

  // 폴링 설정 (10분마다)
  usePolling(refresh, { interval: 600000, enabled: !!userDoc?.classCode });

  // 🔥 [수정] 한국어 로그 타입들 - 인코딩 문제 해결
  const allowedLogTypes = useMemo(() => [
    // 쿠폰 관련 (한글 + 영문)
    '쿠폰 획득',
    '쿠폰 사용',
    '쿠폰 지급',
    '쿠폰 회수',
    '쿠폰 정리',
    '쿠폰 수정',
    '쿠폰 기부',
    'COUPON_EARNED',
    'COUPON_USED',
    'COUPON_GIVEN',

    // 주식 관련
    '주식 매수',
    '주식 매도',

    // 아이템 관련 (한글 + 영문)
    '아이템 사용',
    '아이템 획득',
    '아이템 구매',
    '아이템 실제 등록',
    '아이템 실제 구매',
    '상품 판매',
    '상품 구매',
    'ITEM_PURCHASED',
    'ITEM_USED',
    'ITEM_ACQUIRED',

    // 현금/송금 관련
    '현금 입금',
    '현금 출금',
    '정리',
    '정리 수정',
    '월급 지급',

    // 세금/관리자 관련
    '세금 납부',
    '벌금 납부',
    'TAX_PAYMENT',
    'ADMIN_CASH_SEND',

    // 활동 관련
    '과제 완료',
    '과제 보상',
    '게임 승리',
    '게임 패배',
    '게임 보상',
    '온라인 게임',
    '친구 게임',

    // 기타 영문 타입들
    'TASK_COMPLETED',
    'GAME_REWARD',
    'LEVEL_UP'
  ], []);

  // 로그 타입별 카테고리 정의
  const logCategories = useMemo(() => ({
    coupon: ['쿠폰 획득', '쿠폰 사용', '쿠폰 지급', '쿠폰 회수', '쿠폰 정리', '쿠폰 수정', '쿠폰 기부', 'COUPON_EARNED', 'COUPON_USED', 'COUPON_GIVEN'],
    cash: ['현금 입금', '현금 출금', '정리', '정리 수정', '월급 지급', 'ADMIN_CASH_SEND'],
    item: ['아이템 사용', '아이템 획득', '아이템 구매', '아이템 실제 등록', '아이템 실제 구매', '상품 판매', '상품 구매', 'ITEM_PURCHASED', 'ITEM_USED', 'ITEM_ACQUIRED'],
    stock: ['주식 매수', '주식 매도'],
    tax: ['세금 납부', '벌금 납부', 'TAX_PAYMENT'],
    task: ['과제 완료', '과제 보상', 'TASK_COMPLETED', 'GAME_REWARD', 'LEVEL_UP'],
    game: ['게임 승리', '게임 패배', '게임 보상', '온라인 게임', '친구 게임']
  }), []);

  // 🔥 [최적화] 필터 변경 시 디바운스된 새로고침
  useEffect(() => {
    if (dateFilter !== "all" || selectedLogType !== "all" || userFilter) {
      debouncedRefresh();
    }
  }, [dateFilter, selectedLogType, userFilter, debouncedRefresh]);

  // 이벤트 핸들러들
  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  const handleLogTypeChange = useCallback((e) => {
    setSelectedLogType(e.target.value);
  }, []);

  const handleDateFilterChange = useCallback((e) => {
    setDateFilter(e.target.value);
  }, []);

  const handleUserFilterChange = useCallback((e) => {
    setUserFilter(e.target.value);
  }, []);

  const handleForceRefresh = useCallback(() => {
    refresh();
    if (refreshStats) {
      refreshStats();
    }
  }, [refresh, refreshStats]);

  // 메모화된 유틸리티 함수들
  const formatTimestamp = useCallback((timestamp) => {
    if (timestamp && timestamp.toDate) {
      return timestamp.toDate().toLocaleString("ko-KR", {
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      });
    }
    return "N/A";
  }, []);

  const getLogTypeColor = useCallback((type) => {
    if (logCategories.coupon.includes(type)) return "#10b981";
    if (logCategories.cash.includes(type)) return "#3b82f6";
    if (logCategories.item.includes(type)) return "#f59e0b";
    if (logCategories.stock.includes(type)) return "#8b5cf6";
    if (logCategories.tax.includes(type)) return "#ef4444";
    if (logCategories.task.includes(type)) return "#06b6d4";
    if (logCategories.game.includes(type)) return "#ec4899";
    return "#6b7280";
  }, [logCategories]);

  // 상세 로그 설명을 생성하는 함수
  const getDetailedDescription = useCallback((log) => {
    const { description, metadata, type } = log;

    if (!metadata) return description;

    let detailInfo = [];

    // 할일 관련 상세 정보
    if (type === '과제 완료' && metadata.taskTitle) {
      detailInfo.push(`📋 할일: "${metadata.taskTitle}"`);
      if (metadata.taskDescription) {
        detailInfo.push(`📝 내용: ${metadata.taskDescription}`);
      }
      if (metadata.cashReward) {
        detailInfo.push(`💰 현금 보상: ${metadata.cashReward.toLocaleString()}원`);
      }
      if (metadata.couponReward) {
        detailInfo.push(`🎫 쿠폰 보상: ${metadata.couponReward}개`);
      }
    }

    // 쿠폰 획득 관련 상세 정보
    if (type === '쿠폰 획득' && metadata.activity) {
      detailInfo.push(`🎯 활동: ${metadata.activity}`);
      if (metadata.couponAmount) {
        detailInfo.push(`🎫 획득 쿠폰: ${metadata.couponAmount}개`);
      }
    }

    // 송금 관련 상세 정보
    if ((type === '송금' || type === '송금 수신') && metadata) {
      if (metadata.senderName) {
        detailInfo.push(`👤 송금자: ${metadata.senderName}`);
      }
      if (metadata.receiverName) {
        detailInfo.push(`👤 수신자: ${metadata.receiverName}`);
      }
      if (metadata.amount) {
        detailInfo.push(`💰 금액: ${metadata.amount.toLocaleString()}원`);
      }
      if (metadata.message) {
        detailInfo.push(`💬 메시지: "${metadata.message}"`);
      }
    }

    // 쿠폰 송금 관련 상세 정보
    if ((type === '쿠폰 송금' || type === '쿠폰 수신') && metadata) {
      if (metadata.senderName) {
        detailInfo.push(`👤 송금자: ${metadata.senderName}`);
      }
      if (metadata.receiverName) {
        detailInfo.push(`👤 수신자: ${metadata.receiverName}`);
      }
      if (metadata.amount) {
        detailInfo.push(`🎫 쿠폰: ${metadata.amount}개`);
      }
      if (metadata.message) {
        detailInfo.push(`💬 메시지: "${metadata.message}"`);
      }
    }

    // 아이템 관련 상세 정보
    if (type === '아이템 사용' && metadata) {
      if (metadata.itemName) {
        detailInfo.push(`🎁 아이템: ${metadata.itemName}`);
      }
      if (metadata.quantity) {
        detailInfo.push(`📦 수량: ${metadata.quantity}개`);
      }
      if (metadata.effect) {
        detailInfo.push(`✨ 효과: ${metadata.effect}`);
      }
      if (metadata.context) {
        detailInfo.push(`📍 사용 환경: ${metadata.context}`);
      }
    }

    // 게임 관련 상세 정보
    if ((type === '게임 승리' || type === '게임 패배' || type === '게임 보상') && metadata) {
      if (metadata.gameName) {
        detailInfo.push(`🎮 게임: ${metadata.gameName}`);
      }
      if (metadata.result) {
        detailInfo.push(`🏆 결과: ${metadata.result === 'win' ? '승리' : metadata.result === 'lose' ? '패배' : metadata.result}`);
      }
      if (metadata.gameDetails?.score) {
        detailInfo.push(`📊 점수: ${metadata.gameDetails.score}`);
      }
      if (metadata.gameDetails?.duration) {
        detailInfo.push(`⏱️ 시간: ${metadata.gameDetails.duration}분`);
      }
    }

    // 관리자 관련 상세 정보
    if ((type === '관리자 지급' || type === '관리자 회수') && metadata) {
      if (metadata.adminName) {
        detailInfo.push(`👨‍💼 관리자: ${metadata.adminName}`);
      }
      if (metadata.baseAmount) {
        detailInfo.push(`💰 기본 금액: ${metadata.baseAmount.toLocaleString()}원`);
      }
      if (metadata.taxAmount && metadata.taxAmount > 0) {
        detailInfo.push(`🏛️ 세금: ${metadata.taxAmount.toLocaleString()}원`);
      }
      if (metadata.finalAmount) {
        detailInfo.push(`💵 최종 금액: ${metadata.finalAmount.toLocaleString()}원`);
      }
    }

    // 상세 정보가 있으면 원래 설명에 추가
    if (detailInfo.length > 0) {
      return (
        <div>
          <div style={{ marginBottom: '8px', fontWeight: '500' }}>{description}</div>
          <div style={{
            fontSize: '0.9em',
            color: '#6b7280',
            backgroundColor: '#f9fafb',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #e5e7eb'
          }}>
            {detailInfo.map((info, index) => (
              <div key={index} style={{ marginBottom: index < detailInfo.length - 1 ? '4px' : '0' }}>
                {info}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return description;
  }, []);

  // 로그 타입을 한국어로 변환하는 함수
  const getKoreanLogType = useCallback((type) => {
    const typeMapping = {
      // 현금 관련
      '현금 입금': '💰 현금 입금',
      '현금 출금': '💸 현금 출금',
      '송금': '💳 송금 발송',
      '송금 수신': '💳 송금 수신',
      '관리자 지급': '👨‍💼 관리자 지급',
      '관리자 회수': '👨‍💼 관리자 회수',
      'CASH_INCOME': '💰 현금 입금',
      'CASH_EXPENSE': '💸 현금 출금',
      'CASH_TRANSFER_SEND': '💳 송금 발송',
      'CASH_TRANSFER_RECEIVE': '💳 송금 수신',
      'ADMIN_CASH_SEND': '👨‍💼 관리자 지급',
      'ADMIN_CASH_TAKE': '👨‍💼 관리자 회수',

      // 쿠폰 관련
      '쿠폰 획득': '🎫 쿠폰 획득',
      '쿠폰 사용': '🎫 쿠폰 사용',
      '쿠폰 지급': '🎫 쿠폰 지급',
      '쿠폰 회수': '🎫 쿠폰 회수',
      '쿠폰 송금': '🎫 쿠폰 송금',
      '쿠폰 수신': '🎫 쿠폰 수신',
      'COUPON_EARN': '🎫 쿠폰 획득',
      'COUPON_USE': '🎫 쿠폰 사용',
      'COUPON_GIVE': '🎫 쿠폰 지급',
      'COUPON_TAKE': '🎫 쿠폰 회수',
      'COUPON_TRANSFER_SEND': '🎫 쿠폰 송금',
      'COUPON_TRANSFER_RECEIVE': '🎫 쿠폰 수신',

      // 아이템 관련
      '아이템 구매': '🛒 아이템 구매',
      '아이템 사용': '🎁 아이템 사용',
      '아이템 판매': '💰 아이템 판매',
      '아이템 시장 등록': '🏪 아이템 시장 등록',
      '아이템 시장 구매': '🛒 아이템 시장 구매',
      '아이템 획득': '🎁 아이템 획득',
      '아이템 이동': '📦 아이템 이동',
      'ITEM_PURCHASE': '🛒 아이템 구매',
      'ITEM_USE': '🎁 아이템 사용',
      'ITEM_SELL': '💰 아이템 판매',
      'ITEM_MARKET_LIST': '🏪 아이템 시장 등록',
      'ITEM_MARKET_BUY': '🛒 아이템 시장 구매',
      'ITEM_OBTAIN': '🎁 아이템 획득',
      'ITEM_MOVE': '📦 아이템 이동',

      // 과제 관련
      '과제 완료': '📋 과제 완료',
      '과제 보상': '🏆 과제 보상',
      'TASK_COMPLETE': '📋 과제 완료',
      'TASK_REWARD': '🏆 과제 보상',

      // 게임 관련
      '게임 승리': '🏆 게임 승리',
      '게임 패배': '😔 게임 패배',
      '게임 보상': '🎮 게임 보상',
      '오목 게임': '⚫ 오목 게임',
      '체스 게임': '♟️ 체스 게임',
      'GAME_WIN': '🏆 게임 승리',
      'GAME_LOSE': '😔 게임 패배',
      'GAME_REWARD': '🎮 게임 보상',
      'OMOK_GAME': '⚫ 오목 게임',
      'CHESS_GAME': '♟️ 체스 게임',

      // 주식 관련
      '주식 매수': '📈 주식 매수',
      '주식 매도': '📉 주식 매도',
      'STOCK_BUY': '📈 주식 매수',
      'STOCK_SELL': '📉 주식 매도',

      // 세금 관련
      '세금 납부': '🏛️ 세금 납부',
      '세금 환급': '🏛️ 세금 환급',
      '벌금 납부': '⚖️ 벌금 납부',
      'TAX_PAYMENT': '🏛️ 세금 납부',
      'TAX_REFUND': '🏛️ 세금 환급',
      'FINE_PAYMENT': '⚖️ 벌금 납부',

      // 급여 관련
      '월급 지급': '💼 월급 지급',
      '보너스 지급': '💎 보너스 지급',
      'SALARY_PAYMENT': '💼 월급 지급',
      'BONUS_PAYMENT': '💎 보너스 지급',

      // 시스템 관련
      '시스템': '⚙️ 시스템',
      '관리자 조치': '👨‍💼 관리자 조치',
      '금고 입금': '🏦 금고 입금',
      '금고 출금': '🏦 금고 출금',
      'SYSTEM': '⚙️ 시스템',
      'ADMIN_ACTION': '👨‍💼 관리자 조치',
      'TREASURY_DEPOSIT': '🏦 금고 입금',
      'TREASURY_WITHDRAW': '🏦 금고 출금'
    };

    return typeMapping[type] || type;
  }, []);

  if (loading && logs.length === 0) {
    return (
      <div className="activity-log-container">
        <h1>활동 기록</h1>
        <div className="loading">로그 데이터를 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="activity-log-container">
      <h1>활동 기록</h1>

      {/* 🔥 [최적화] 간소화된 상태 정보 */}
      {error && (
        <div style={{
          background: '#ffe6e6',
          padding: '10px',
          margin: '10px 0',
          borderRadius: '5px',
          color: 'red',
          fontWeight: 'bold'
        }}>
          ⚠️ 오류: {error.message || '로그 데이터를 불러오는 중 문제가 발생했습니다.'}
        </div>
      )}

      {!loading && logs.length === 0 && !error && (
        <div style={{
          background: '#fff3cd',
          padding: '10px',
          margin: '10px 0',
          borderRadius: '5px',
          color: '#856404',
          textAlign: 'center'
        }}>
          활동 로그가 없습니다. 학생들의 활동이 기록되면 여기에 표시됩니다.
        </div>
      )}
      
      {/* 통계 섹션 */}
      <div className="statistics-section">
        <div className="stat-card">
          <span className="stat-label">전체 기록</span>
          <span className="stat-value">{logs.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">쿠폰 사용</span>
          <span className="stat-value">{statistics?.coupon_used_total || 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">송금/현금</span>
          <span className="stat-value">0</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">아이템 관련</span>
          <span className="stat-value">0</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">활성 사용자</span>
          <span className="stat-value">{new Set(logs.map(log => log.userId)).size}</span>
        </div>
      </div>

      <div className="controls-container">
        {/* 검색 바 */}
        <div className="search-bar-container">
          <input
            type="text"
            placeholder="이름, 활동 종류, 내용 등으로 검색..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="search-input"
          />
        </div>

        {/* 필터 컨트롤 */}
        <div className="filters-container">
          <div className="filter-group">
            <label htmlFor="logType">활동 유형: </label>
            <select id="logType" value={selectedLogType} onChange={handleLogTypeChange}>
              <option value="all">전체</option>
              <option value="coupon">쿠폰 관련</option>
              <option value="cash">송금/현금</option>
              <option value="item">아이템</option>
              <option value="stock">주식</option>
              <option value="tax">세금/벌금</option>
              <option value="task">과제</option>
              <option value="game">게임</option>
              <optgroup label="개별 유형">
                {allowedLogTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="dateFilter">기간: </label>
            <select id="dateFilter" value={dateFilter} onChange={handleDateFilterChange}>
              <option value="all">전체 기간</option>
              <option value="today">오늘</option>
              <option value="week">최근 1주일</option>
              <option value="month">최근 1개월</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="userFilter">사용자: </label>
            <input
              type="text"
              id="userFilter"
              placeholder="사용자 이름"
              value={userFilter}
              onChange={handleUserFilterChange}
              className="user-filter-input"
            />
          </div>
          
          <button onClick={handleForceRefresh} className="refresh-button" disabled={loading}>
            {loading ? '로딩 중...' : '새로고침'}
          </button>
        </div>
      </div>

      <div className="log-table-container">
        <table className="log-table">
          <thead>
            <tr>
              <th>시간</th>
              <th>사용자</th>
              <th>활동 종류</th>
              <th>상세 내용</th>
            </tr>
          </thead>
          <tbody>
            {logs.length > 0 ? (
              logs.map((log) => (
                <tr key={log.id}>
                  <td data-label="시간" className="timestamp-cell">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td data-label="사용자" className="user-cell">
                    {log.userName || "시스템"}
                  </td>
                  <td data-label="활동 종류" className="type-cell">
                    <span
                      className="log-type-badge"
                      style={{ backgroundColor: getLogTypeColor(log.type) }}
                    >
                      {getKoreanLogType(log.type)}
                    </span>
                  </td>
                  <td data-label="상세 내용" className="description-cell">
                    {getDetailedDescription(log)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="no-data">표시할 기록이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="pagination-container">
          <button onClick={fetchMore} disabled={loading} className="load-more-button">
            {loading ? '로딩 중...' : '더 보기'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ActivityLog;