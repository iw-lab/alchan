// src/pages/admin/SystemMonitoring.js - 시스템 모니터링 컴포넌트
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import "./SystemMonitoring.css";
import { logger } from "../../utils/logger";

const SystemMonitoring = ({ isSuperAdmin }) => {
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [errorCount, setErrorCount] = useState(0);

  // httpsCallable을 useMemo로 안정화 (매 렌더마다 새 참조 생성 방지)
  const getSystemStatus = useMemo(
    () => httpsCallable(functions, "getSystemStatus"),
    [],
  );
  const resolveSystemAlert = useMemo(
    () => httpsCallable(functions, "resolveSystemAlert"),
    [],
  );
  const errorCountRef = useRef(0);

  // errorCount 동기화
  useEffect(() => {
    errorCountRef.current = errorCount;
  }, [errorCount]);

  // 시스템 상태 조회
  const fetchSystemStatus = useCallback(async () => {
    if (!isSuperAdmin) return;

    setLoading(true);
    setError(null);

    try {
      const result = await getSystemStatus();
      if (result.data.success) {
        setSystemStatus(result.data.data);
        setLastUpdate(new Date());
        setErrorCount(0);
      } else {
        throw new Error(result.data.message || "시스템 상태 조회 실패");
      }
    } catch (err) {
      logger.error("[SystemMonitoring] 상태 조회 오류:", err);
      setError(err.message || "시스템 상태를 불러오는 중 오류가 발생했습니다.");

      setErrorCount((prev) => {
        const next = prev + 1;
        if (next >= 3) {
          setAutoRefresh(false);
          logger.warn(
            "[SystemMonitoring] 연속 에러 발생으로 자동 새로고침을 중지합니다.",
          );
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, getSystemStatus]);

  // 경고 해결 처리
  const handleResolveAlert = useCallback(
    async (alertId) => {
      if (!window.confirm("이 경고를 해결 처리하시겠습니까?")) {
        return;
      }

      try {
        const result = await resolveSystemAlert({ alertId });
        if (result.data.success) {
          alert("경고가 해결되었습니다.");
          fetchSystemStatus();
        }
      } catch (err) {
        logger.error("[SystemMonitoring] 경고 해결 오류:", err);
        alert(`경고 해결 중 오류가 발생했습니다: ${err.message}`);
      }
    },
    [resolveSystemAlert, fetchSystemStatus],
  );

  // 초기 로드 (한 번만 실행)
  useEffect(() => {
    if (isSuperAdmin) {
      fetchSystemStatus();
    }
  }, [isSuperAdmin, fetchSystemStatus]);

  // 자동 새로고침 (2분마다)
  useEffect(() => {
    if (!autoRefresh || !isSuperAdmin) return;

    const intervalId = setInterval(
      () => {
        fetchSystemStatus();
      },
      2 * 60 * 1000,
    );

    return () => clearInterval(intervalId);
  }, [autoRefresh, isSuperAdmin, fetchSystemStatus]);

  // 자동 새로고침 활성화 시 에러 카운트 리셋
  useEffect(() => {
    if (autoRefresh) {
      setErrorCount(0);
    }
  }, [autoRefresh]);

  if (!isSuperAdmin) {
    return (
      <div className="system-monitoring section-card">
        <h3>🔒 서버 상태 모니터링</h3>
        <p className="admin-section-desc">최고 관리자만 접근할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="system-monitoring section-card">
      <div className="monitoring-header">
        <h3>🖥️ 서버 상태 모니터링</h3>
        <div className="monitoring-controls">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>자동 새로고침 (30초)</span>
          </label>
          <button
            onClick={fetchSystemStatus}
            disabled={loading}
            className="refresh-button"
          >
            {loading ? "⏳ 조회 중..." : "🔄 새로고침"}
          </button>
        </div>
      </div>

      {lastUpdate && (
        <p className="last-update">
          마지막 업데이트: {lastUpdate.toLocaleTimeString("ko-KR")}
        </p>
      )}

      {error && (
        <div className="error-message">
          <p>❌ {error}</p>
          {errorCount >= 3 && (
            <p style={{ marginTop: "8px", fontSize: "14px" }}>
              ⚠️ 연속 에러가 발생하여 자동 새로고침이 중지되었습니다. 수동으로
              새로고침하거나 자동 새로고침을 다시 활성화해주세요.
            </p>
          )}
        </div>
      )}

      {systemStatus && (
        <>
          {/* 초기화 메시지 표시 */}
          {systemStatus.message && (
            <div
              className="info-message"
              style={{
                padding: "12px",
                background: "#e3f2fd",
                border: "1px solid #90caf9",
                borderRadius: "4px",
                marginBottom: "15px",
                color: "#1976d2",
              }}
            >
              <p style={{ margin: 0 }}>ℹ️ {systemStatus.message}</p>
            </div>
          )}

          {/* 전체 시스템 상태 */}
          <div className="system-health-card">
            <h4>시스템 상태</h4>
            <div className={`health-indicator health-${systemStatus.health}`}>
              <span className="health-icon">
                {systemStatus.health === "healthy"
                  ? "✅"
                  : systemStatus.health === "warning"
                    ? "⚠️"
                    : "🚨"}
              </span>
              <span className="health-text">
                {systemStatus.health === "healthy"
                  ? "정상"
                  : systemStatus.health === "warning"
                    ? "주의"
                    : "위험"}
              </span>
            </div>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">전체 사용자</span>
                <span className="stat-value">{systemStatus.totalUsers}</span>
              </div>
            </div>
          </div>

          {/* 실시간 통계 */}
          <div className="stats-card">
            <h4>최근 1분 통계</h4>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">읽기 작업</span>
                <span className="stat-value">
                  {systemStatus.stats.lastMinute.reads.toLocaleString()}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">쓰기 작업</span>
                <span className="stat-value">
                  {systemStatus.stats.lastMinute.writes.toLocaleString()}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">에러 수</span>
                <span className="stat-value">
                  {systemStatus.stats.lastMinute.errors}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">에러율</span>
                <span className="stat-value">
                  {(systemStatus.stats.lastMinute.errorRate * 100).toFixed(2)}%
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">평균 응답 시간</span>
                <span className="stat-value">
                  {systemStatus.stats.lastMinute.avgResponseTime.toFixed(0)}ms
                </span>
              </div>
            </div>
          </div>

          {/* 비정상 패턴 감지 */}
          {systemStatus.anomalies && systemStatus.anomalies.length > 0 && (
            <div className="anomalies-card">
              <h4>⚠️ 비정상 패턴 감지</h4>
              <div className="anomalies-list">
                {systemStatus.anomalies.map((anomaly, index) => (
                  <div
                    key={index}
                    className={`anomaly-item anomaly-${anomaly.severity}`}
                  >
                    <div className="anomaly-header">
                      <span className="anomaly-severity">
                        {anomaly.severity === "critical"
                          ? "🚨 심각"
                          : anomaly.severity === "error"
                            ? "❌ 오류"
                            : "⚠️ 경고"}
                      </span>
                      <span className="anomaly-type">{anomaly.type}</span>
                    </div>
                    <p className="anomaly-message">{anomaly.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 활성 경고 */}
          {systemStatus.alerts && systemStatus.alerts.length > 0 && (
            <div className="alerts-card">
              <h4>🔔 활성 경고 ({systemStatus.alerts.length})</h4>
              <div className="alerts-list">
                {systemStatus.alerts.map((alert) => {
                  const alertTime = alert.timestamp?.toDate
                    ? alert.timestamp.toDate()
                    : new Date(alert.timestamp?.seconds * 1000 || Date.now());

                  return (
                    <div
                      key={alert.id}
                      className={`alert-item alert-${alert.severity}`}
                    >
                      <div className="alert-header">
                        <span className="alert-time">
                          {alertTime.toLocaleString("ko-KR")}
                        </span>
                        <button
                          onClick={() => handleResolveAlert(alert.id)}
                          className="resolve-alert-button"
                        >
                          해결
                        </button>
                      </div>
                      <p className="alert-message">{alert.message}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 최근 에러 로그 */}
          {systemStatus.errorLogs && systemStatus.errorLogs.length > 0 && (
            <div className="error-logs-card">
              <h4>📝 최근 에러 로그 (1시간)</h4>
              <div className="error-logs-list">
                {systemStatus.errorLogs.slice(0, 10).map((log) => {
                  const logTime = log.timestamp?.toDate
                    ? log.timestamp.toDate()
                    : new Date(log.timestamp?.seconds * 1000 || Date.now());

                  return (
                    <div key={log.id} className="error-log-item">
                      <span className="log-time">
                        {logTime.toLocaleTimeString("ko-KR")}
                      </span>
                      <span className="log-message">
                        {log.message || "알 수 없는 오류"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 최근 5분 통계 */}
          <div className="stats-card">
            <h4>최근 5분 통계</h4>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">총 읽기 작업</span>
                <span className="stat-value">
                  {systemStatus.stats.last5Minutes.reads.toLocaleString()}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">총 쓰기 작업</span>
                <span className="stat-value">
                  {systemStatus.stats.last5Minutes.writes.toLocaleString()}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">총 에러</span>
                <span className="stat-value">
                  {systemStatus.stats.last5Minutes.errors}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {!systemStatus && !loading && !error && (
        <div className="no-data-message">
          <p>시스템 상태 데이터를 불러오려면 새로고침 버튼을 클릭하세요.</p>
        </div>
      )}
    </div>
  );
};

export default SystemMonitoring;
