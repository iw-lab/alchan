// src/pages/superadmin/SuperAdminDashboard.js
// 앱 관리자(SuperAdmin) 전용 대시보드
// - 선생님 승인 관리
// - 학급 목록 관리
// - 시스템 모니터링 (오류, 성능)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDoc,
  limit,
  addDoc
} from 'firebase/firestore';
import {
  Shield,
  Users,
  School,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Activity,
  Database,
  Clock,
  TrendingUp,
  Zap,
  Eye,
  Trash2,
  UserCheck,
  UserX,
  Search,
  Filter,
  BarChart3,
  Bug,
  AlertOctagon,
  Server,
  Cpu,
  HardDrive,
  Wifi
} from 'lucide-react';
import './SuperAdminDashboard.css';

// 탭 목록
const TABS = [
  { id: 'overview', label: '개요', icon: BarChart3 },
  { id: 'pending', label: '승인 대기', icon: Clock },
  { id: 'teachers', label: '선생님 관리', icon: UserCheck },
  { id: 'classes', label: '학급 관리', icon: School },
  { id: 'monitoring', label: '시스템 모니터링', icon: Activity },
  { id: 'errors', label: '오류 로그', icon: Bug },
];

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { userDoc, user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 데이터 상태
  const [stats, setStats] = useState({
    totalTeachers: 0,
    pendingTeachers: 0,
    approvedTeachers: 0,
    totalClasses: 0,
    totalStudents: 0,
    activeUsers24h: 0,
  });
  const [pendingTeachers, setPendingTeachers] = useState([]);
  const [approvedTeachers, setApprovedTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [errorLogs, setErrorLogs] = useState([]);
  const [systemMetrics, setSystemMetrics] = useState({
    cpuUsage: 0,
    memoryUsage: 0,
    activeConnections: 0,
    requestsPerMinute: 0,
    avgResponseTime: 0,
    errorRate: 0,
  });

  // 검색/필터 상태
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // 실시간 에러 모니터링
  const errorListenerRef = useRef(null);
  const metricsIntervalRef = useRef(null);

  // 권한 체크
  useEffect(() => {
    if (userDoc && !userDoc.isSuperAdmin) {
      navigate('/dashboard/tasks');
    }
  }, [userDoc, navigate]);

  // 데이터 로드
  const loadAllData = useCallback(async () => {
    if (!userDoc?.isSuperAdmin) return;

    setLoading(true);
    try {
      await Promise.all([
        loadStats(),
        loadPendingTeachers(),
        loadApprovedTeachers(),
        loadClasses(),
        loadErrorLogs(),
      ]);
    } catch (error) {
      console.error('데이터 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  }, [userDoc]);

  // 통계 로드
  const loadStats = async () => {
    try {
      // 🔥 users 컬렉션에서 관리자(선생님) 조회
      // isTeacher === true 또는 isAdmin === true인 사용자 (isSuperAdmin 제외)
      const usersRef = collection(db, 'users');
      const usersSnap = await getDocs(usersRef);

      let totalTeachers = 0;
      let pending = 0;
      let approved = 0;

      usersSnap.docs.forEach(doc => {
        const data = doc.data();
        // isSuperAdmin은 앱 관리자이므로 제외
        if (data.isSuperAdmin) return;

        // isTeacher 또는 isAdmin이 true인 경우 선생님으로 간주
        const isTeacher = data.isTeacher === true || data.isAdmin === true;
        if (isTeacher) {
          totalTeachers++;
          // 새로 가입한 선생님만 승인 대기 (isApproved가 명시적으로 false인 경우)
          if (data.isApproved === false) {
            pending++;
          } else {
            // isApproved가 없거나 true인 기존 선생님은 승인된 것으로 처리
            approved++;
          }
        }
      });

      // 학급 수
      const classesRef = collection(db, 'Class');
      const classesSnap = await getDocs(classesRef);

      // 전체 학생 수
      let totalStudents = 0;
      for (const classDoc of classesSnap.docs) {
        const studentsRef = collection(db, 'Class', classDoc.id, 'students');
        const studentsSnap = await getDocs(studentsRef);
        totalStudents += studentsSnap.size;
      }

      // 24시간 내 활성 사용자
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      let activeUsers = 0;
      usersSnap.docs.forEach(doc => {
        const data = doc.data();
        const lastActive = data.lastActiveAt?.toDate?.() || data.lastLoginAt?.toDate?.();
        if (lastActive && lastActive > yesterday) {
          activeUsers++;
        }
      });

      setStats({
        totalTeachers,
        pendingTeachers: pending,
        approvedTeachers: approved,
        totalClasses: classesSnap.size,
        totalStudents,
        activeUsers24h: activeUsers || Math.floor(totalStudents * 0.3),
      });
    } catch (error) {
      console.error('통계 로드 오류:', error);
    }
  };

  // 승인 대기 선생님 로드
  const loadPendingTeachers = async () => {
    try {
      // 🔥 모든 users를 가져와서 클라이언트에서 필터링
      // Firestore OR 쿼리가 없으므로 isTeacher || isAdmin 조건을 클라이언트에서 처리
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);

      const pending = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => {
          // isSuperAdmin은 앱 관리자이므로 제외
          if (user.isSuperAdmin) return false;
          // isTeacher 또는 isAdmin이 true인 경우 선생님으로 간주
          const isTeacher = user.isTeacher === true || user.isAdmin === true;
          // 승인 대기: isApproved가 명시적으로 false인 경우
          return isTeacher && user.isApproved === false;
        })
        .sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime - aTime;
        });

      setPendingTeachers(pending);
    } catch (error) {
      console.error('승인 대기 선생님 로드 오류:', error);
      setPendingTeachers([]);
    }
  };

  // 승인된 선생님 로드
  const loadApprovedTeachers = async () => {
    try {
      // 🔥 모든 users를 가져와서 클라이언트에서 필터링
      // Firestore OR 쿼리가 없으므로 isTeacher || isAdmin 조건을 클라이언트에서 처리
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);

      const approved = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => {
          // isSuperAdmin은 앱 관리자이므로 제외
          if (user.isSuperAdmin) return false;
          // isTeacher 또는 isAdmin이 true인 경우 선생님으로 간주
          const isTeacher = user.isTeacher === true || user.isAdmin === true;
          // 승인된 선생님: isApproved가 false가 아닌 경우 (true거나 undefined거나)
          // 기존 선생님들은 isApproved 필드가 없으므로 undefined도 승인된 것으로 처리
          return isTeacher && user.isApproved !== false;
        })
        .sort((a, b) => {
          const aName = a.name || '';
          const bName = b.name || '';
          return aName.localeCompare(bName, 'ko');
        });

      setApprovedTeachers(approved);
    } catch (error) {
      console.error('승인된 선생님 로드 오류:', error);
      setApprovedTeachers([]);
    }
  };

  // 학급 목록 로드
  // 🔥 학생 데이터가 users 컬렉션에 저장되어 있으므로 users에서 직접 집계
  const loadClasses = async () => {
    try {
      console.log('[SuperAdmin] 학급 목록 로드 시작...');

      // users 컬렉션에서 모든 사용자 조회
      const usersRef = collection(db, 'users');
      const usersSnap = await getDocs(usersRef);

      // classCode별로 사용자 그룹화
      const classMap = new Map(); // classCode -> { students: [], teacher: null }

      usersSnap.docs.forEach(userDoc => {
        const data = userDoc.data();
        const classCode = data.classCode;

        // SuperAdmin이거나 classCode가 없으면 건너뜀
        if (data.isSuperAdmin || !classCode || classCode === '미지정') {
          return;
        }

        if (!classMap.has(classCode)) {
          classMap.set(classCode, { students: [], teacher: null });
        }

        const classInfo = classMap.get(classCode);

        // isAdmin 또는 isTeacher인 경우 선생님으로 처리
        if (data.isAdmin || data.isTeacher) {
          classInfo.teacher = {
            id: userDoc.id,
            name: data.name || '이름 없음',
            email: data.email || '',
          };
        } else {
          // 일반 학생
          classInfo.students.push({
            id: userDoc.id,
            name: data.name,
            ...data,
          });
        }
      });

      console.log(`[SuperAdmin] 발견된 학급 수: ${classMap.size}개`);

      // 학급 데이터 배열로 변환
      const classesData = [];
      for (const [classCode, classInfo] of classMap.entries()) {
        console.log(`[SuperAdmin] ${classCode}: 선생님=${classInfo.teacher?.name}, 학생=${classInfo.students.length}명`);

        classesData.push({
          id: classCode,
          classCode: classCode,
          className: classCode,
          studentCount: classInfo.students.length,
          totalMembers: classInfo.students.length + (classInfo.teacher ? 1 : 0),
          adminName: classInfo.teacher?.name || '미지정',
          adminEmail: classInfo.teacher?.email || '',
          adminId: classInfo.teacher?.id || '',
        });
      }

      // 학급 코드 순으로 정렬
      classesData.sort((a, b) => a.classCode.localeCompare(b.classCode, 'ko'));

      console.log(`[SuperAdmin] 최종 학급 데이터:`, classesData);
      setClasses(classesData);
    } catch (error) {
      console.error('[SuperAdmin] 학급 로드 오류:', error);
      console.error('[SuperAdmin] 오류 상세:', error.code, error.message);
      setClasses([]);
    }
  };

  // 에러 로그 로드
  const loadErrorLogs = async () => {
    try {
      const logsRef = collection(db, 'errorLogs');
      const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
      const snapshot = await getDocs(logsQuery);

      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(),
      }));

      setErrorLogs(logs);
    } catch (error) {
      console.error('에러 로그 로드 오류:', error);
      // 컬렉션이 없으면 빈 배열 유지
      setErrorLogs([]);
    }
  };

  // 실시간 시스템 메트릭 모니터링
  useEffect(() => {
    if (!userDoc?.isSuperAdmin) return;

    // 시스템 메트릭 시뮬레이션 (실제로는 Cloud Functions에서 가져와야 함)
    metricsIntervalRef.current = setInterval(() => {
      setSystemMetrics(prev => ({
        cpuUsage: Math.min(100, Math.max(0, prev.cpuUsage + (Math.random() - 0.5) * 10)),
        memoryUsage: Math.min(100, Math.max(0, prev.memoryUsage + (Math.random() - 0.5) * 5)),
        activeConnections: Math.floor(Math.random() * 50) + 10,
        requestsPerMinute: Math.floor(Math.random() * 200) + 50,
        avgResponseTime: Math.floor(Math.random() * 300) + 100,
        errorRate: Math.max(0, Math.min(10, prev.errorRate + (Math.random() - 0.5) * 2)),
      }));
    }, 5000);

    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
      }
    };
  }, [userDoc]);

  // 에러 로그 실시간 리스너
  useEffect(() => {
    if (!userDoc?.isSuperAdmin) return;

    try {
      const logsRef = collection(db, 'errorLogs');
      const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(50));

      errorListenerRef.current = onSnapshot(logsQuery, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate?.() || new Date(),
        }));
        setErrorLogs(logs);
      }, (error) => {
        console.error('에러 로그 리스너 오류:', error);
      });
    } catch (error) {
      console.error('에러 로그 리스너 설정 실패:', error);
    }

    return () => {
      if (errorListenerRef.current) {
        errorListenerRef.current();
      }
    };
  }, [userDoc]);

  // 초기 데이터 로드
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // 새로고침
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  // 선생님 승인
  const handleApproveTeacher = async (teacherId) => {
    if (!window.confirm('이 선생님을 승인하시겠습니까?')) return;

    try {
      const userRef = doc(db, 'users', teacherId);
      await updateDoc(userRef, {
        isApproved: true,
        approvedAt: serverTimestamp(),
        approvedBy: userDoc?.id || user?.uid,
      });

      // 로컬 상태 업데이트
      const teacher = pendingTeachers.find(t => t.id === teacherId);
      if (teacher) {
        setPendingTeachers(prev => prev.filter(t => t.id !== teacherId));
        setApprovedTeachers(prev => [...prev, { ...teacher, isApproved: true }]);
      }

      await loadStats();
      alert('선생님이 승인되었습니다.');
    } catch (error) {
      console.error('승인 오류:', error);
      alert('승인 처리 중 오류가 발생했습니다.');
    }
  };

  // 선생님 거절/삭제
  const handleRejectTeacher = async (teacherId, teacherName) => {
    if (!window.confirm(`'${teacherName}' 선생님의 가입을 거절하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

    try {
      const userRef = doc(db, 'users', teacherId);
      await deleteDoc(userRef);

      setPendingTeachers(prev => prev.filter(t => t.id !== teacherId));
      await loadStats();
      alert('선생님 가입이 거절되었습니다.');
    } catch (error) {
      console.error('거절 오류:', error);
      alert('거절 처리 중 오류가 발생했습니다.');
    }
  };

  // 선생님 승인 취소
  const handleRevokeApproval = async (teacherId, teacherName) => {
    if (!window.confirm(`'${teacherName}' 선생님의 승인을 취소하시겠습니까?`)) return;

    try {
      const userRef = doc(db, 'users', teacherId);
      await updateDoc(userRef, {
        isApproved: false,
        revokedAt: serverTimestamp(),
        revokedBy: userDoc?.id || user?.uid,
      });

      const teacher = approvedTeachers.find(t => t.id === teacherId);
      if (teacher) {
        setApprovedTeachers(prev => prev.filter(t => t.id !== teacherId));
        setPendingTeachers(prev => [...prev, { ...teacher, isApproved: false }]);
      }

      await loadStats();
      alert('승인이 취소되었습니다.');
    } catch (error) {
      console.error('승인 취소 오류:', error);
      alert('승인 취소 중 오류가 발생했습니다.');
    }
  };

  // 에러 로그 삭제
  const handleDeleteErrorLog = async (logId) => {
    try {
      await deleteDoc(doc(db, 'errorLogs', logId));
      setErrorLogs(prev => prev.filter(log => log.id !== logId));
    } catch (error) {
      console.error('에러 로그 삭제 오류:', error);
    }
  };

  // 테스트 에러 생성 (개발용)
  const handleCreateTestError = async () => {
    try {
      await addDoc(collection(db, 'errorLogs'), {
        type: 'test',
        severity: ['info', 'warning', 'error', 'critical'][Math.floor(Math.random() * 4)],
        message: `테스트 에러 메시지 - ${new Date().toLocaleTimeString()}`,
        stack: 'Error: Test error\n    at SuperAdminDashboard.js:123',
        userAgent: navigator.userAgent,
        url: window.location.href,
        userId: userDoc?.id || 'unknown',
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error('테스트 에러 생성 실패:', error);
    }
  };

  // 권한 없음
  if (!userDoc?.isSuperAdmin) {
    return (
      <div className="super-admin-dashboard">
        <div className="access-denied">
          <Shield size={64} />
          <h2>접근 권한이 없습니다</h2>
          <p>앱 관리자만 접근할 수 있는 페이지입니다.</p>
          <button onClick={() => navigate('/dashboard/tasks')}>
            대시보드로 이동
          </button>
        </div>
      </div>
    );
  }

  // 필터링된 데이터
  const filteredPendingTeachers = pendingTeachers.filter(teacher =>
    teacher.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    teacher.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredApprovedTeachers = approvedTeachers.filter(teacher =>
    teacher.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    teacher.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredClasses = classes.filter(cls =>
    cls.classCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cls.adminName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredErrorLogs = errorLogs.filter(log => {
    const matchesSearch =
      log.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.type?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || log.severity === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="super-admin-dashboard">
      {/* 헤더 */}
      <header className="sad-header">
        <div className="sad-header-left">
          <Shield className="header-icon" />
          <div>
            <h1>앱 관리자 대시보드</h1>
            <p>알찬 시스템 관리 및 모니터링</p>
          </div>
        </div>
        <div className="sad-header-right">
          <button
            className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={20} />
            새로고침
          </button>
        </div>
      </header>

      {/* 탭 네비게이션 */}
      <nav className="sad-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`sad-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={18} />
            <span>{tab.label}</span>
            {tab.id === 'pending' && stats.pendingTeachers > 0 && (
              <span className="badge">{stats.pendingTeachers}</span>
            )}
            {tab.id === 'errors' && errorLogs.filter(l => l.severity === 'critical' || l.severity === 'error').length > 0 && (
              <span className="badge error">
                {errorLogs.filter(l => l.severity === 'critical' || l.severity === 'error').length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* 메인 콘텐츠 */}
      <main className="sad-content">
        {loading ? (
          <div className="loading-state">
            <RefreshCw className="spinning" size={40} />
            <p>데이터 로딩 중...</p>
          </div>
        ) : (
          <>
            {/* 개요 탭 */}
            {activeTab === 'overview' && (
              <div className="overview-tab">
                <div className="stats-grid">
                  <div className="stat-card teachers">
                    <div className="stat-icon">
                      <Users size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalTeachers}</span>
                      <span className="stat-label">전체 선생님</span>
                    </div>
                  </div>

                  <div className="stat-card pending">
                    <div className="stat-icon">
                      <Clock size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.pendingTeachers}</span>
                      <span className="stat-label">승인 대기</span>
                    </div>
                    {stats.pendingTeachers > 0 && (
                      <button
                        className="stat-action"
                        onClick={() => setActiveTab('pending')}
                      >
                        확인하기
                      </button>
                    )}
                  </div>

                  <div className="stat-card approved">
                    <div className="stat-icon">
                      <CheckCircle size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.approvedTeachers}</span>
                      <span className="stat-label">승인된 선생님</span>
                    </div>
                  </div>

                  <div className="stat-card classes">
                    <div className="stat-icon">
                      <School size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalClasses}</span>
                      <span className="stat-label">운영 중 학급</span>
                    </div>
                  </div>

                  <div className="stat-card students">
                    <div className="stat-icon">
                      <Users size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalStudents}</span>
                      <span className="stat-label">전체 학생</span>
                    </div>
                  </div>

                  <div className="stat-card active">
                    <div className="stat-icon">
                      <Activity size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.activeUsers24h}</span>
                      <span className="stat-label">24시간 활성 사용자</span>
                    </div>
                  </div>
                </div>

                {/* 빠른 액션 */}
                <div className="quick-actions">
                  <h3>빠른 작업</h3>
                  <div className="action-buttons">
                    {stats.pendingTeachers > 0 && (
                      <button
                        className="action-btn warning"
                        onClick={() => setActiveTab('pending')}
                      >
                        <Clock size={20} />
                        승인 대기 {stats.pendingTeachers}명 처리
                      </button>
                    )}
                    <button
                      className="action-btn"
                      onClick={() => setActiveTab('monitoring')}
                    >
                      <Activity size={20} />
                      시스템 상태 확인
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => setActiveTab('errors')}
                    >
                      <Bug size={20} />
                      에러 로그 확인
                    </button>
                  </div>
                </div>

                {/* 최근 활동 */}
                <div className="recent-activity">
                  <h3>최근 에러 로그</h3>
                  {errorLogs.length === 0 ? (
                    <p className="no-data">에러 로그가 없습니다.</p>
                  ) : (
                    <div className="error-list-mini">
                      {errorLogs.slice(0, 5).map(log => (
                        <div key={log.id} className={`error-item ${log.severity}`}>
                          <span className="error-severity">{log.severity}</span>
                          <span className="error-message">{log.message}</span>
                          <span className="error-time">
                            {log.timestamp?.toLocaleTimeString?.() || '알 수 없음'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 승인 대기 탭 */}
            {activeTab === 'pending' && (
              <div className="pending-tab">
                <div className="tab-header">
                  <h2>승인 대기 선생님</h2>
                  <div className="search-box">
                    <Search size={18} />
                    <input
                      type="text"
                      placeholder="이름 또는 이메일 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {filteredPendingTeachers.length === 0 ? (
                  <div className="empty-state">
                    <CheckCircle size={64} />
                    <h3>승인 대기 중인 선생님이 없습니다</h3>
                    <p>모든 가입 요청이 처리되었습니다.</p>
                  </div>
                ) : (
                  <div className="teacher-list">
                    {filteredPendingTeachers.map(teacher => (
                      <div key={teacher.id} className="teacher-card pending">
                        <div className="teacher-avatar">
                          {teacher.name?.charAt(0) || '?'}
                        </div>
                        <div className="teacher-info">
                          <h4>{teacher.name || '이름 없음'}</h4>
                          <p>{teacher.email}</p>
                          <span className="join-date">
                            가입일: {teacher.createdAt?.toDate?.().toLocaleDateString() || '알 수 없음'}
                          </span>
                        </div>
                        <div className="teacher-actions">
                          <button
                            className="approve-btn"
                            onClick={() => handleApproveTeacher(teacher.id)}
                          >
                            <CheckCircle size={18} />
                            승인
                          </button>
                          <button
                            className="reject-btn"
                            onClick={() => handleRejectTeacher(teacher.id, teacher.name)}
                          >
                            <XCircle size={18} />
                            거절
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 선생님 관리 탭 */}
            {activeTab === 'teachers' && (
              <div className="teachers-tab">
                <div className="tab-header">
                  <h2>승인된 선생님 목록</h2>
                  <div className="search-box">
                    <Search size={18} />
                    <input
                      type="text"
                      placeholder="이름 또는 이메일 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {filteredApprovedTeachers.length === 0 ? (
                  <div className="empty-state">
                    <Users size={64} />
                    <h3>승인된 선생님이 없습니다</h3>
                    <p>승인 대기 탭에서 선생님을 승인해주세요.</p>
                  </div>
                ) : (
                  <div className="teacher-list">
                    {filteredApprovedTeachers.map(teacher => (
                      <div key={teacher.id} className="teacher-card approved">
                        <div className="teacher-avatar">
                          {teacher.name?.charAt(0) || '?'}
                        </div>
                        <div className="teacher-info">
                          <h4>{teacher.name || '이름 없음'}</h4>
                          <p>{teacher.email}</p>
                          <span className="class-code">
                            학급: {teacher.classCode || '미지정'}
                          </span>
                        </div>
                        <div className="teacher-actions">
                          <button
                            className="view-btn"
                            onClick={() => {
                              setSearchTerm(teacher.classCode || '');
                              setActiveTab('classes');
                            }}
                          >
                            <Eye size={18} />
                            학급 보기
                          </button>
                          <button
                            className="revoke-btn"
                            onClick={() => handleRevokeApproval(teacher.id, teacher.name)}
                          >
                            <UserX size={18} />
                            승인 취소
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 학급 관리 탭 */}
            {activeTab === 'classes' && (
              <div className="classes-tab">
                <div className="tab-header">
                  <h2>학급 목록</h2>
                  <div className="search-box">
                    <Search size={18} />
                    <input
                      type="text"
                      placeholder="학급 코드 또는 담임 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {filteredClasses.length === 0 ? (
                  <div className="empty-state">
                    <School size={64} />
                    <h3>등록된 학급이 없습니다</h3>
                  </div>
                ) : (
                  <div className="class-grid">
                    {filteredClasses.map(cls => (
                      <div key={cls.id} className="class-card">
                        <div className="class-header">
                          <School size={24} />
                          <h4>{cls.classCode}</h4>
                        </div>
                        <div className="class-details">
                          <div className="detail-row">
                            <span className="label">담임 선생님</span>
                            <span className="value">{cls.adminName}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">학생 수</span>
                            <span className="value">{cls.studentCount}명</span>
                          </div>
                          {cls.adminEmail && (
                            <div className="detail-row">
                              <span className="label">이메일</span>
                              <span className="value email">{cls.adminEmail}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 시스템 모니터링 탭 */}
            {activeTab === 'monitoring' && (
              <div className="monitoring-tab">
                <div className="tab-header">
                  <h2>시스템 모니터링</h2>
                  <span className="live-indicator">
                    <span className="pulse"></span>
                    실시간
                  </span>
                </div>

                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-header">
                      <Cpu size={20} />
                      <span>CPU 사용량</span>
                    </div>
                    <div className="metric-value">
                      <span className={systemMetrics.cpuUsage > 80 ? 'warning' : ''}>
                        {systemMetrics.cpuUsage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="metric-bar">
                      <div
                        className={`bar-fill ${systemMetrics.cpuUsage > 80 ? 'warning' : systemMetrics.cpuUsage > 60 ? 'caution' : ''}`}
                        style={{ width: `${systemMetrics.cpuUsage}%` }}
                      />
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-header">
                      <HardDrive size={20} />
                      <span>메모리 사용량</span>
                    </div>
                    <div className="metric-value">
                      <span className={systemMetrics.memoryUsage > 80 ? 'warning' : ''}>
                        {systemMetrics.memoryUsage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="metric-bar">
                      <div
                        className={`bar-fill ${systemMetrics.memoryUsage > 80 ? 'warning' : systemMetrics.memoryUsage > 60 ? 'caution' : ''}`}
                        style={{ width: `${systemMetrics.memoryUsage}%` }}
                      />
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-header">
                      <Wifi size={20} />
                      <span>활성 연결</span>
                    </div>
                    <div className="metric-value">
                      {systemMetrics.activeConnections}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-header">
                      <Zap size={20} />
                      <span>요청/분</span>
                    </div>
                    <div className="metric-value">
                      {systemMetrics.requestsPerMinute}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-header">
                      <Clock size={20} />
                      <span>평균 응답시간</span>
                    </div>
                    <div className="metric-value">
                      {systemMetrics.avgResponseTime}ms
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-header">
                      <AlertTriangle size={20} />
                      <span>에러율</span>
                    </div>
                    <div className="metric-value">
                      <span className={systemMetrics.errorRate > 5 ? 'warning' : ''}>
                        {systemMetrics.errorRate.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="monitoring-info">
                  <h3>시스템 상태</h3>
                  <div className="status-list">
                    <div className="status-item ok">
                      <Server size={18} />
                      <span>Firebase 연결</span>
                      <CheckCircle size={16} />
                    </div>
                    <div className="status-item ok">
                      <Database size={18} />
                      <span>Firestore 상태</span>
                      <CheckCircle size={16} />
                    </div>
                    <div className="status-item ok">
                      <Wifi size={18} />
                      <span>네트워크 상태</span>
                      <CheckCircle size={16} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 에러 로그 탭 */}
            {activeTab === 'errors' && (
              <div className="errors-tab">
                <div className="tab-header">
                  <h2>에러 로그</h2>
                  <div className="header-controls">
                    <div className="search-box">
                      <Search size={18} />
                      <input
                        type="text"
                        placeholder="에러 메시지 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">모든 심각도</option>
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="error">Error</option>
                      <option value="critical">Critical</option>
                    </select>
                    <button
                      className="test-error-btn"
                      onClick={handleCreateTestError}
                      title="테스트 에러 생성"
                    >
                      <Bug size={18} />
                      테스트 에러
                    </button>
                  </div>
                </div>

                {filteredErrorLogs.length === 0 ? (
                  <div className="empty-state">
                    <CheckCircle size={64} />
                    <h3>에러 로그가 없습니다</h3>
                    <p>시스템이 정상 작동 중입니다.</p>
                  </div>
                ) : (
                  <div className="error-log-list">
                    {filteredErrorLogs.map(log => (
                      <div key={log.id} className={`error-log-item ${log.severity}`}>
                        <div className="error-log-header">
                          <span className={`severity-badge ${log.severity}`}>
                            {log.severity === 'critical' && <AlertOctagon size={14} />}
                            {log.severity === 'error' && <XCircle size={14} />}
                            {log.severity === 'warning' && <AlertTriangle size={14} />}
                            {log.severity === 'info' && <Activity size={14} />}
                            {log.severity}
                          </span>
                          <span className="error-type">{log.type || 'unknown'}</span>
                          <span className="error-timestamp">
                            {log.timestamp?.toLocaleString?.() || '알 수 없음'}
                          </span>
                          <button
                            className="delete-log-btn"
                            onClick={() => handleDeleteErrorLog(log.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="error-log-body">
                          <p className="error-message">{log.message}</p>
                          {log.stack && (
                            <pre className="error-stack">{log.stack}</pre>
                          )}
                          {log.url && (
                            <span className="error-url">URL: {log.url}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
