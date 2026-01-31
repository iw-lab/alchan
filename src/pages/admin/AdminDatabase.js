// src/AdminDatabase.js
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getActivityLogs,
  clearClassCache,
  getTransactionsData,
  convertTransactionsToLogs
} from '../../services/AdminDatabaseService';
import './AdminDatabase.css';
import { logger } from '../../utils/logger';

const AdminDatabase = () => {
  const { userDoc, allClassMembers } = useAuth();
  const [selectedUser, setSelectedUser] = useState('all');
  const [activityData, setActivityData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [debugInfo, setDebugInfo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activityTypeFilter, setActivityTypeFilter] = useState('all');

  const classCode = userDoc?.classCode;

  const loadData = useCallback(async (refresh = false, lastDocForPagination = null) => {
    if (!classCode || classCode === '미지정') {
      setError('학급이 설정되지 않았습니다.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 🔥 최적화: 필터나 검색이 활성화되어 있으면 더 많은 데이터를 가져옴
      const isFiltered = activityTypeFilter !== 'all' || searchTerm.trim() !== '';
      const limitCount = isFiltered ? 100 : 10; // 필터 사용 시 100개, 기본 10개

      const options = {
        userId: selectedUser !== 'all' ? selectedUser : null,
        limitCount: limitCount,
        lastDoc: refresh ? null : lastDocForPagination,
        useCache: !refresh
      };

      const result = await getActivityLogs(classCode, options);

      if (result.logs.length === 0 && allClassMembers.length > 0 && refresh) {
        const userIds = selectedUser !== 'all'
          ? [selectedUser]
          : allClassMembers.map(m => m.id || m.uid);
        const transactions = await getTransactionsData(userIds, { limitCount: 100 });

        if (transactions.length > 0) {
          result.logs = convertTransactionsToLogs(transactions);
          result.hasMore = false;
        }
      }

      if (refresh) {
        setActivityData(result.logs);
      } else {
        setActivityData(prev => [...prev, ...result.logs]);
      }
      setHasMore(result.hasMore);
      setLastDoc(result.lastDoc);

    } catch (err) {
      logger.error('[AdminDatabase] 데이터 로드 오류:', err);
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [classCode, selectedUser, allClassMembers, activityTypeFilter, searchTerm]);

  useEffect(() => {
    setActivityData([]);
    setLastDoc(null);
    setHasMore(false);
    loadData(true, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, classCode]); // loadData 추가하면 무한 루프 발생

  // 🔥 필터나 검색이 변경되면 데이터 다시 로드
  useEffect(() => {
    if (activityData.length > 0) {
      setActivityData([]);
      setLastDoc(null);
      setHasMore(false);
      loadData(true, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityTypeFilter, searchTerm]); // loadData와 activityData 추가하면 무한 루프 발생

  const handleRefresh = () => {
    clearClassCache(classCode);
    setActivityData([]);
    setLastDoc(null);
    setHasMore(false);
    setDebugInfo('');
    loadData(true, null);
  };

  const handleDebugFirestore = async () => {
    setDebugInfo('조회 중...');
    try {
      let info = [];

      // 현재 로드된 데이터의 타입 분석
      const typeCounts = {};
      const typeExamples = {};

      activityData.forEach(log => {
        const type = log.type || 'undefined';
        typeCounts[type] = (typeCounts[type] || 0) + 1;

        if (!typeExamples[type]) {
          typeExamples[type] = {
            description: log.description,
            userName: log.userName,
            timestamp: log.timestamp
          };
        }
      });

      info.push('=== 현재 로드된 데이터 타입 분포 ===');
      info.push(`총 ${activityData.length}개의 로그`);
      info.push('');

      Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          info.push(`${type}: ${count}개`);
          if (typeExamples[type]) {
            info.push(`  예시: ${typeExamples[type].description}`);
          }
          // 쿠폰이나 아이템 관련 타입 강조
          if (type.includes('COUPON') || type.includes('쿠폰') ||
              type.includes('ITEM') || type.includes('아이템')) {
            info.push(`  ⭐ 쿠폰/아이템 관련 타입 발견!`);
          }
        });

      info.push('');
      info.push('=== 필터별 매칭 결과 ===');

      // 각 필터별로 매칭되는 로그 수 계산
      const filters = {
        'coupon': (log) => {
          const type = log.type?.toString() || '';
          const desc = log.description?.toString() || '';
          const couponTypes = [
            '쿠폰 획득', '쿠폰 사용', '쿠폰 지급', '쿠폰 회수',
            '쿠폰 송금', '쿠폰 수신', '쿠폰 기부', '쿠폰 판매',
            'COUPON_EARN', 'COUPON_USE', 'COUPON_GIVE', 'COUPON_TAKE',
            'COUPON_TRANSFER_SEND', 'COUPON_TRANSFER_RECEIVE',
            'COUPON_DONATE', 'COUPON_SELL'
          ];
          return couponTypes.some(t => type === t) ||
                 type.includes('쿠폰') ||
                 desc.includes('쿠폰');
        },
        'item': (log) => {
          const type = log.type?.toString() || '';
          const desc = log.description?.toString() || '';
          const itemTypes = [
            '아이템 구매', '아이템 사용', '아이템 판매',
            '아이템 시장 등록', '아이템 시장 구매', '아이템 획득', '아이템 이동',
            'ITEM_PURCHASE', 'ITEM_USE', 'ITEM_SELL',
            'ITEM_MARKET_LIST', 'ITEM_MARKET_BUY', 'ITEM_OBTAIN', 'ITEM_MOVE'
          ];
          return itemTypes.some(t => type === t) ||
                 type.includes('아이템') ||
                 desc.includes('아이템');
        },
        'cash': (log) => {
          const type = log.type?.toString() || '';
          return type.includes('CASH') || type.includes('송금') ||
                 type.includes('입금') || type.includes('출금') ||
                 type.includes('ADMIN_CASH') || type.includes('TRANSFER') ||
                 type.includes('현금');
        },
        'stock': (log) => {
          const type = log.type?.toString() || '';
          return type.includes('STOCK') || type.includes('주식') ||
                 type.includes('거래세') || type.includes('TAX');
        },
        'game': (log) => {
          const type = log.type?.toString() || '';
          return type.includes('GAME') || type.includes('게임');
        }
      };

      Object.entries(filters).forEach(([filterName, filterFunc]) => {
        const matchedLogs = activityData.filter(log => filterFunc(log));
        info.push(`${filterName}: ${matchedLogs.length}개`);

        const matchedTypes = new Set(matchedLogs.map(log => log.type));
        if (matchedTypes.size > 0) {
          info.push(`  매칭된 타입: ${Array.from(matchedTypes).join(', ')}`);
        }
      });

      const debugText = info.join('\n');
      setDebugInfo(debugText);

    } catch (error) {
      logger.error('[AdminDatabase DEBUG] 오류:', error);
      setDebugInfo(`오류: ${error.message}`);
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadData(false, lastDoc);
    }
  };

  const getActivityTypeText = (type) => {
    const typeMap = {
      '쿠폰 획득': '쿠폰 획득',
      '쿠폰 사용': '쿠폰 사용',
      '쿠폰 지급': '쿠폰 지급',
      '쿠폰 회수': '쿠폰 회수',
      '아이템 구매': '아이템 구매',
      '아이템 사용': '아이템 사용',
      '아이템 판매': '아이템 판매',
      '아이템 시장 등록': '아이템 시장 등록',
      '아이템 시장 구매': '아이템 시장 구매',
      '주식 매수': '주식 매수',
      '주식 매도': '주식 매도',
      '주식 거래세': '주식 거래세',
      '거래세': '주식 거래세',
      '송금': '송금',
      '송금 수신': '송금 수신',
      '돈 송금': '송금',
      '돈 출금': '출금',
      '돈 입금': '입금',
      '현금 출금': '출금',
      '현금 입금': '입금',
      'COUPON_EARN': '쿠폰 획득',
      'COUPON_USE': '쿠폰 사용',
      'COUPON_GIVE': '쿠폰 지급',
      'COUPON_TAKE': '쿠폰 회수',
      'COUPON_TRANSFER_SEND': '쿠폰 송금',
      'COUPON_TRANSFER_RECEIVE': '쿠폰 수신',
      'ITEM_PURCHASE': '아이템 구매',
      'ITEM_USE': '아이템 사용',
      'ITEM_SELL': '아이템 판매',
      'ITEM_MARKET_LIST': '아이템 시장 등록',
      'ITEM_MARKET_BUY': '아이템 시장 구매',
      'CASH_TRANSFER_SEND': '송금',
      'CASH_TRANSFER_RECEIVE': '송금 수신',
      'CASH_WITHDRAW': '출금',
      'CASH_DEPOSIT': '입금',
      'STOCK_BUY': '주식 매수',
      'STOCK_SELL': '주식 매도',
      'STOCK_TAX': '주식 거래세',
      'TAX_PAYMENT': '주식 거래세',
      'ADMIN_CASH_SEND': '관리자 지급',
      'ADMIN_CASH_TAKE': '관리자 회수',
      'ADMIN_COUPON_GIVE': '관리자 쿠폰 지급',
      'ADMIN_COUPON_TAKE': '관리자 쿠폰 회수',
      'TASK_COMPLETE': '과제 완료',
      'GAME_WIN': '게임 승리',
      'GAME_LOSE': '게임 패배',
    };
    return typeMap[type] || type;
  };

  const getActivityTypeColor = (type) => {
    if (!type) return 'text-gray-600';
    const typeStr = type.toString().toLowerCase();
    if (typeStr.includes('쿠폰') && (typeStr.includes('획득') || typeStr.includes('지급'))) return 'text-green-600';
    if (typeStr.includes('쿠폰') && (typeStr.includes('사용') || typeStr.includes('회수'))) return 'text-red-600';
    if (type === 'COUPON_EARN' || type === 'COUPON_GIVE' || type === 'COUPON_TRANSFER_RECEIVE' || type === 'ADMIN_COUPON_GIVE') return 'text-green-600';
    if (type === 'COUPON_USE' || type === 'COUPON_TAKE' || type === 'COUPON_TRANSFER_SEND' || type === 'ADMIN_COUPON_TAKE') return 'text-red-600';
    if (typeStr.includes('아이템') && typeStr.includes('구매')) return 'text-blue-600';
    if (typeStr.includes('아이템') && typeStr.includes('사용')) return 'text-orange-600';
    if (typeStr.includes('아이템') && (typeStr.includes('판매') || typeStr.includes('등록'))) return 'text-purple-600';
    if (type === 'ITEM_PURCHASE' || type === 'ITEM_MARKET_BUY') return 'text-blue-600';
    if (type === 'ITEM_USE') return 'text-orange-600';
    if (type === 'ITEM_SELL' || type === 'ITEM_MARKET_LIST') return 'text-purple-600';
    if (typeStr.includes('지급') || typeStr.includes('입금') || typeStr.includes('수신')) return 'text-green-600';
    if (typeStr.includes('회수') || typeStr.includes('출금') || typeStr.includes('송금')) return 'text-red-600';
    if (type === 'ADMIN_CASH_SEND' || type === 'CASH_TRANSFER_RECEIVE' || type === 'CASH_DEPOSIT' || type === '현금 입금') return 'text-green-600';
    if (type === 'ADMIN_CASH_TAKE' || type === 'CASH_TRANSFER_SEND' || type === 'CASH_WITHDRAW' || type === '현금 출금') return 'text-red-600';
    if (typeStr.includes('매수')) return 'text-blue-600';
    if (typeStr.includes('매도')) return 'text-indigo-600';
    if (typeStr.includes('거래세') || typeStr.includes('세금')) return 'text-yellow-600';
    if (type === 'STOCK_BUY') return 'text-blue-600';
    if (type === 'STOCK_SELL') return 'text-indigo-600';
    if (type === 'STOCK_TAX' || type === 'TAX_PAYMENT') return 'text-yellow-600';
    if (type === 'GAME_WIN') return 'text-green-600';
    if (type === 'GAME_LOSE') return 'text-red-600';
    return 'text-gray-600';
  };

  const formatDate = (date) => {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredActivityData = activityData.filter(log => {
    // 검색어 필터
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesSearch = (
        log.description?.toLowerCase().includes(term) ||
        log.userName?.toLowerCase().includes(term) ||
        log.type?.toLowerCase().includes(term)
      );
      if (!matchesSearch) return false;
    }

    // 활동 타입 필터
    if (activityTypeFilter !== 'all') {
      const logType = log.type?.toString() || '';
      const logDesc = log.description?.toString() || '';

      if (activityTypeFilter === 'coupon') {
        // 쿠폰 관련 - Functions에서 사용하는 한글 타입들
        const couponTypes = [
          '쿠폰 획득', '쿠폰 사용', '쿠폰 지급', '쿠폰 회수',
          '쿠폰 송금', '쿠폰 수신', '쿠폰 기부', '쿠폰 판매',
          'COUPON_EARN', 'COUPON_USE', 'COUPON_GIVE', 'COUPON_TAKE',
          'COUPON_TRANSFER_SEND', 'COUPON_TRANSFER_RECEIVE',
          'COUPON_DONATE', 'COUPON_SELL'
        ];
        const isCouponType = couponTypes.some(type => logType === type) ||
                            logType.includes('쿠폰') ||
                            logDesc.includes('쿠폰');
        if (!isCouponType) return false;
      } else if (activityTypeFilter === 'item') {
        // 아이템 관련 - Functions에서 사용하는 한글 타입들
        const itemTypes = [
          '아이템 구매', '아이템 사용', '아이템 판매',
          '아이템 시장 등록', '아이템 시장 구매', '아이템 획득', '아이템 이동',
          'ITEM_PURCHASE', 'ITEM_USE', 'ITEM_SELL',
          'ITEM_MARKET_LIST', 'ITEM_MARKET_BUY', 'ITEM_OBTAIN', 'ITEM_MOVE'
        ];
        const isItemType = itemTypes.some(type => logType === type) ||
                          logType.includes('아이템') ||
                          logDesc.includes('아이템');
        if (!isItemType) return false;
      } else if (activityTypeFilter === 'cash') {
        // 현금 관련
        const isCashType = logType.includes('CASH') || logType.includes('송금') ||
                          logType.includes('입금') || logType.includes('출금') ||
                          logType.includes('ADMIN_CASH') || logType.includes('TRANSFER') ||
                          logType.includes('현금');
        if (!isCashType) return false;
      } else if (activityTypeFilter === 'stock') {
        // 주식 관련
        const isStockType = logType.includes('STOCK') || logType.includes('주식') ||
                           logType.includes('거래세') || logType.includes('TAX');
        if (!isStockType) return false;
      } else if (activityTypeFilter === 'game') {
        // 게임 관련
        const isGameType = logType.includes('GAME') || logType.includes('게임');
        if (!isGameType) return false;
      }
    }

    return true;
  });

  const renderActivityLogs = () => {
    if (filteredActivityData.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">{searchTerm ? '검색 결과가 없습니다.' : '활동 내역이 없습니다.'}</p>
          <p className="text-sm">전체 데이터: {activityData.length}개</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-600 mb-4">
          총 {filteredActivityData.length}개의 활동 (검색: {activityData.length}개 중)
        </div>

        {filteredActivityData.map((log, index) => {
          return (
            <div key={log.id || index} className="bg-white border-2 border-gray-300 rounded-lg p-4 hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`font-bold text-base ${getActivityTypeColor(log.type)}`}>
                      {getActivityTypeText(log.type)}
                    </span>
                    <span className="text-sm font-medium text-gray-700">{log.userName || '알 수 없음'}</span>
                    <span className="text-xs text-gray-500">{formatDate(log.timestamp)}</span>
                  </div>
                  <p className="text-gray-800 text-sm mb-2 font-medium">{log.description || '설명 없음'}</p>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 border border-gray-200">
                      {log.metadata.activity && (
                        <div className="mb-1"><strong>활동:</strong> {log.metadata.activity}</div>
                      )}
                      {log.metadata.reason && (
                        <div className="mb-1"><strong>사유:</strong> {log.metadata.reason}</div>
                      )}
                      {log.metadata.itemName && (
                        <div className="mb-1"><strong>아이템:</strong> {log.metadata.itemName}</div>
                      )}
                      {log.metadata.quantity && (
                        <div className="mb-1"><strong>수량:</strong> {log.metadata.quantity}</div>
                      )}
                      {log.metadata.amount !== undefined && (
                        <div className="mb-1"><strong>금액:</strong> {log.metadata.amount.toLocaleString()}원</div>
                      )}
                      {log.metadata.couponAmount !== undefined && (
                        <div className="mb-1"><strong>쿠폰:</strong> {log.metadata.couponAmount}개</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {hasMore && (
          <div className="text-center py-4">
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300"
            >
              {loading ? '로딩 중...' : '더보기'}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="admin-database p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">학급 데이터베이스</h2>
        <p className="text-gray-600">학급 학생들의 모든 활동 내역을 확인할 수 있습니다.</p>
      </div>

      {/* 필터 및 컨트롤 */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          {/* 학생 선택 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">학생 선택</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full p-2 border rounded-md"
            >
              <option value="all">전체 학생</option>
              {allClassMembers && allClassMembers.map(member => (
                <option key={member.id || member.uid} value={member.id || member.id}>
                  {member.name || member.nickname || '이름 없음'}
                </option>
              ))}
            </select>
          </div>

          {/* 활동 타입 필터 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">활동 타입</label>
            <select
              value={activityTypeFilter}
              onChange={(e) => setActivityTypeFilter(e.target.value)}
              className="w-full p-2 border rounded-md"
            >
              <option value="all">전체 활동</option>
              <option value="coupon">쿠폰 관련</option>
              <option value="item">아이템 관련</option>
              <option value="cash">현금 관련</option>
              <option value="stock">주식 관련</option>
              <option value="game">게임 관련</option>
            </select>
          </div>

          {/* 검색창 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">검색</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="학생명, 활동 내용 검색..."
              className="w-full p-2 border rounded-md"
            />
          </div>

          {/* 새로고침 버튼 */}
          <div className="flex items-end gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300"
            >
              새로고침
            </button>
            <button
              onClick={handleDebugFirestore}
              className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600"
            >
              디버그
            </button>
          </div>
        </div>

        {/* 디버그 정보 표시 */}
        {debugInfo && (
          <div className="mt-4 p-4 bg-gray-100 rounded-md">
            <h4 className="font-semibold mb-2">디버그 정보:</h4>
            <pre className="text-xs whitespace-pre-wrap">{debugInfo}</pre>
          </div>
        )}
      </div>

      {/* 통계 요약 */}
      {activityData.length > 0 && (() => {
        const couponCount = activityData.filter(log => {
          const type = log.type?.toString() || '';
          const desc = log.description?.toString() || '';
          const couponTypes = [
            '쿠폰 획득', '쿠폰 사용', '쿠폰 지급', '쿠폰 회수',
            '쿠폰 송금', '쿠폰 수신', '쿠폰 기부', '쿠폰 판매',
            'COUPON_EARN', 'COUPON_USE', 'COUPON_GIVE', 'COUPON_TAKE',
            'COUPON_TRANSFER_SEND', 'COUPON_TRANSFER_RECEIVE',
            'COUPON_DONATE', 'COUPON_SELL'
          ];
          return couponTypes.some(t => type === t) ||
                 type.includes('쿠폰') ||
                 desc.includes('쿠폰');
        }).length;

        const itemCount = activityData.filter(log => {
          const type = log.type?.toString() || '';
          const desc = log.description?.toString() || '';
          const itemTypes = [
            '아이템 구매', '아이템 사용', '아이템 판매',
            '아이템 시장 등록', '아이템 시장 구매', '아이템 획득', '아이템 이동',
            'ITEM_PURCHASE', 'ITEM_USE', 'ITEM_SELL',
            'ITEM_MARKET_LIST', 'ITEM_MARKET_BUY', 'ITEM_OBTAIN', 'ITEM_MOVE'
          ];
          return itemTypes.some(t => type === t) ||
                 type.includes('아이템') ||
                 desc.includes('아이템');
        }).length;

        const cashCount = activityData.filter(log => {
          const type = log.type?.toString() || '';
          return type.includes('CASH') || type.includes('송금') ||
                 type.includes('입금') || type.includes('출금') ||
                 type.includes('ADMIN_CASH') || type.includes('TRANSFER');
        }).length;

        const stockCount = activityData.filter(log => {
          const type = log.type?.toString() || '';
          return type.includes('STOCK') || type.includes('주식') ||
                 type.includes('거래세') || type.includes('TAX');
        }).length;

        const gameCount = activityData.filter(log => {
          const type = log.type?.toString() || '';
          return type.includes('GAME') || type.includes('게임');
        }).length;

        return (
          <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">활동 통계 (클릭하여 필터)</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div
                className="bg-blue-50 p-3 rounded cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setActivityTypeFilter('all')}
              >
                <div className="text-xs text-gray-600 mb-1">전체 활동</div>
                <div className="text-xl font-bold text-blue-600">
                  {activityData.length}
                </div>
              </div>
              <div
                className={`p-3 rounded transition-shadow ${
                  couponCount > 0
                    ? 'bg-green-50 cursor-pointer hover:shadow-md'
                    : 'bg-gray-100 cursor-not-allowed opacity-50'
                }`}
                onClick={() => couponCount > 0 && setActivityTypeFilter('coupon')}
                title={couponCount === 0 ? '아직 쿠폰 관련 활동이 없습니다' : '클릭하여 쿠폰 관련 활동만 보기'}
              >
                <div className="text-xs text-gray-600 mb-1">쿠폰 관련</div>
                <div className={`text-xl font-bold ${couponCount > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {couponCount}
                </div>
              </div>
              <div
                className={`p-3 rounded transition-shadow ${
                  itemCount > 0
                    ? 'bg-purple-50 cursor-pointer hover:shadow-md'
                    : 'bg-gray-100 cursor-not-allowed opacity-50'
                }`}
                onClick={() => itemCount > 0 && setActivityTypeFilter('item')}
                title={itemCount === 0 ? '아직 아이템 관련 활동이 없습니다' : '클릭하여 아이템 관련 활동만 보기'}
              >
                <div className="text-xs text-gray-600 mb-1">아이템 관련</div>
                <div className={`text-xl font-bold ${itemCount > 0 ? 'text-purple-600' : 'text-gray-400'}`}>
                  {itemCount}
                </div>
              </div>
              <div
                className={`p-3 rounded transition-shadow ${
                  cashCount > 0
                    ? 'bg-yellow-50 cursor-pointer hover:shadow-md'
                    : 'bg-gray-100 cursor-not-allowed opacity-50'
                }`}
                onClick={() => cashCount > 0 && setActivityTypeFilter('cash')}
                title={cashCount === 0 ? '아직 현금 관련 활동이 없습니다' : '클릭하여 현금 관련 활동만 보기'}
              >
                <div className="text-xs text-gray-600 mb-1">현금 관련</div>
                <div className={`text-xl font-bold ${cashCount > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                  {cashCount}
                </div>
              </div>
              <div
                className={`p-3 rounded transition-shadow ${
                  stockCount > 0
                    ? 'bg-indigo-50 cursor-pointer hover:shadow-md'
                    : 'bg-gray-100 cursor-not-allowed opacity-50'
                }`}
                onClick={() => stockCount > 0 && setActivityTypeFilter('stock')}
                title={stockCount === 0 ? '아직 주식 관련 활동이 없습니다' : '클릭하여 주식 관련 활동만 보기'}
              >
                <div className="text-xs text-gray-600 mb-1">주식 관련</div>
                <div className={`text-xl font-bold ${stockCount > 0 ? 'text-indigo-600' : 'text-gray-400'}`}>
                  {stockCount}
                </div>
              </div>
              <div
                className={`p-3 rounded transition-shadow ${
                  gameCount > 0
                    ? 'bg-red-50 cursor-pointer hover:shadow-md'
                    : 'bg-gray-100 cursor-not-allowed opacity-50'
                }`}
                onClick={() => gameCount > 0 && setActivityTypeFilter('game')}
                title={gameCount === 0 ? '아직 게임 관련 활동이 없습니다' : '클릭하여 게임 관련 활동만 보기'}
              >
                <div className="text-xs text-gray-600 mb-1">게임 관련</div>
                <div className={`text-xl font-bold ${gameCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {gameCount}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 제목 */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-gray-800">전체 활동 내역</h3>
        <p className="text-sm text-gray-600 mt-1">시간순으로 정렬된 모든 활동을 확인할 수 있습니다.</p>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* 로딩 상태 */}
      {loading && activityData.length === 0 && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
        </div>
      )}

      {/* 내용 */}
      {!loading || activityData.length > 0 ? (
        <div>
          {renderActivityLogs()}
        </div>
      ) : null}
    </div>
  );
};

export default AdminDatabase;