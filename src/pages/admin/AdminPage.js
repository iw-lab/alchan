// src/AdminPage.js
// ========================================
// ⚠️ DEPRECATED - 레거시 관리자 페이지
// ========================================
// 이 컴포넌트는 더 이상 사용되지 않습니다.
// 모든 관리자 기능은 AdminSettingsModal.js로 통합되었습니다.
//
// 통합된 위치:
// - 금융 상품 관리 → AdminSettingsModal > "금융 상품" 탭
// - 데이터베이스 → AdminSettingsModal > "데이터베이스" 탭
// - 시장 제어 → AdminSettingsModal > "시장 제어" 탭
// - 사용자 관리 → AdminSettingsModal > "학생 관리" / "학급 구성원" 탭
//
// AdminSettingsModal.js 경로:
// src/components/modals/AdminSettingsModal.js
//
// 권한 체계:
// - isAdmin (관리자): 자기 학급만 관리
// - isSuperAdmin (최고관리자): 모든 학급 + 시스템 관리
// ========================================
import React, { useState, useEffect, useContext } from 'react';
import { db, functions } from '../../firebase';
import { doc, getDoc, collection, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import AdminPanel from './AdminPanel';
import AdminDatabase from './AdminDatabase';
import { AuthContext } from '../../contexts/AuthContext';
import './AdminPanel.css';

import { logger } from "../../utils/logger";
const AdminPage = () => {
  const { currentUser, classCode } = useContext(AuthContext);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [marketStatus, setMarketStatus] = useState({ isOpen: false });
  const [activeTab, setActiveTab] = useState('financial'); // 'financial', 'database', 'market', 'users'
  const [editingUserId, setEditingUserId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [classList, setClassList] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);

  // 백엔드 함수 이름과 정확히 일치시킵니다.
  const toggleMarketManually = httpsCallable(functions, 'toggleMarketManually');
  const refundOldMarketItems = httpsCallable(functions, 'refundOldMarketItems');

  useEffect(() => {
    if (!classCode) return;

    const fetchStudents = async () => {
      const studentsCollection = collection(db, `Class/${classCode}/students`);
      const studentSnapshot = await getDocs(studentsCollection);
      const studentList = studentSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStudents(studentList);
    };

    const fetchMarketStatus = async () => {
      // classCode를 포함한 정확한 DB 경로를 바라보도록 수정합니다.
      const marketStatusRef = doc(db, `ClassStock/${classCode}/marketStatus/status`);
      const docSnap = await getDoc(marketStatusRef);
      if (docSnap.exists()) {
        setMarketStatus(docSnap.data());
      } else {
        // 해당 경로에 문서가 없으면 기본값으로 생성해줍니다.
        await setDoc(marketStatusRef, { isOpen: false });
        setMarketStatus({ isOpen: false });
      }
    };

    fetchStudents();
    fetchMarketStatus();
  }, [classCode]);

  // 슈퍼 관리자: 모든 학급 목록 가져오기
  useEffect(() => {
    if (!currentUser?.isSuperAdmin) return;

    const fetchAllClasses = async () => {
      try {
        const classesRef = collection(db, 'Class');
        const classesSnapshot = await getDocs(classesRef);

        const classes = [];
        for (const classDoc of classesSnapshot.docs) {
          const classCodeValue = classDoc.id;
          const studentsRef = collection(db, 'Class', classCodeValue, 'students');
          const studentsSnapshot = await getDocs(studentsRef);

          classes.push({
            classCode: classCodeValue,
            studentCount: studentsSnapshot.size
          });
        }

        setClassList(classes);
      } catch (error) {
        logger.error("학급 목록 조회 중 오류:", error);
      }
    };

    fetchAllClasses();
  }, [currentUser]);

  const handleMoneyTransfer = async () => {
    if (!selectedStudent || !amount) {
      setMessage('학생과 금액을 모두 선택해주세요.');
      return;
    }
    // 돈 지급 로직... (여기에 화폐 지급 관련 로직을 구현하세요)
    // 예: const giveMoney = httpsCallable(functions, 'giveMoneyToStudent');
    // await giveMoney({ classCode, studentId: selectedStudent, amount: Number(amount) });
    setMessage(`${selectedStudent} 학생에게 ${amount}원을 지급하는 로직을 추가해야 합니다.`);
  };

  const handleMarketControl = async (newIsOpenState) => {
    try {
      const actionText = newIsOpenState ? '수동 개장' : '수동 폐장';
      if (!window.confirm(`정말로 시장을 '${actionText}' 상태로 변경하시겠습니까?`)) {
        return;
      }

      // 함수를 호출할 때 'classCode'와 'isOpen' 파라미터를 정확히 전달합니다.
      const result = await toggleMarketManually({
        classCode: classCode,
        isOpen: newIsOpenState
      });

      logger.log('Market status change result:', result.data);
      setMessage(result.data.message);

      // 프론트엔드 화면의 상태를 즉시 업데이트합니다.
      setMarketStatus({ isOpen: newIsOpenState });

    } catch (error) {
      logger.error("시장 상태 변경 오류:", error);
      setMessage(`오류가 발생했습니다: ${error.message}`);
    }
  };

  const handleRefundOldItems = async () => {
    try {
      if (!window.confirm('기존 경로에 있는 마켓 아이템들을 모두 환불하시겠습니까?\n(판매자들의 인벤토리로 아이템이 반환됩니다)')) {
        return;
      }

      setMessage('환불 처리 중...');
      const result = await refundOldMarketItems();

      logger.log('Refund result:', result.data);
      setMessage(result.data.message);

    } catch (error) {
      logger.error("마켓 아이템 환불 오류:", error);
      setMessage(`오류가 발생했습니다: ${error.message}`);
    }
  };

  // 사용자 관리 함수들
  const handleEditUser = (user) => {
    setEditingUserId(user.id);
    setEditFormData({ ...user });
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditFormData({});
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };

  const handleSaveUser = async (userId) => {
    try {
      const userDocRef = doc(db, 'Class', classCode, 'students', userId);
      const dataToSave = {
        ...editFormData,
        money: Number(editFormData.money) || 0,
        level: Number(editFormData.level) || 0,
      };
      delete dataToSave.password;

      await updateDoc(userDocRef, dataToSave);

      // 비밀번호 변경이 필요한 경우
      if (editFormData.password && editFormData.password.trim() !== '') {
        const updatePassword = httpsCallable(functions, 'updateUserPassword');
        await updatePassword({
          email: editFormData.email,
          newPassword: editFormData.password
        });
        alert('사용자 정보 및 비밀번호가 성공적으로 업데이트되었습니다.');
      } else {
        alert('사용자 정보가 성공적으로 업데이트되었습니다.');
      }

      // students 배열 업데이트
      setStudents(prevStudents =>
        prevStudents.map(student => (student.id === userId ? { ...student, ...dataToSave } : student))
      );
      setEditingUserId(null);
      setEditFormData({});
    } catch (error) {
      logger.error("사용자 정보 업데이트 중 오류 발생:", error);
      alert(`정보 업데이트에 실패했습니다: ${error.message}`);
    }
  };

  const handleToggleAdmin = async (user) => {
    const isCurrentlyAdmin = user.isAdmin === true;
    const actionText = isCurrentlyAdmin ? '관리자 권한을 제거' : '관리자로 지정';

    if (!window.confirm(`정말로 '${user.name}' 학생을 ${actionText}하시겠습니까?`)) {
      return;
    }

    try {
      const userDocRef = doc(db, 'Class', classCode, 'students', user.id);
      await updateDoc(userDocRef, {
        isAdmin: !isCurrentlyAdmin
      });

      setStudents(prevStudents =>
        prevStudents.map(u =>
          u.id === user.id ? { ...u, isAdmin: !isCurrentlyAdmin } : u
        )
      );

      alert(`${user.name} 학생이 ${actionText}되었습니다.`);
    } catch (error) {
      logger.error("관리자 권한 변경 중 오류 발생:", error);
      alert(`권한 변경에 실패했습니다: ${error.message}`);
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (window.confirm(`정말로 '${userName}' 학생을 삭제하시겠습니까? 모든 데이터가 사라집니다.`)) {
      try {
        await deleteDoc(doc(db, 'Class', classCode, 'students', userId));
        setStudents(prevStudents => prevStudents.filter(student => student.id !== userId));
        alert('학생이 삭제되었습니다.');
      } catch (error) {
        logger.error("학생 삭제 중 오류 발생:", error);
        alert('학생 삭제에 실패했습니다.');
      }
    }
  };

  const handleResetPassword = async (user, newPassword) => {
    try {
      const updatePassword = httpsCallable(functions, 'updateUserPassword');
      await updatePassword({
        email: user.email,
        newPassword: newPassword
      });
      alert(`${user.name} 학생의 비밀번호가 '${newPassword}'로 초기화되었습니다.`);
    } catch (error) {
      logger.error("비밀번호 초기화 중 오류 발생:", error);
      alert(`비밀번호 초기화에 실패했습니다: ${error.message}`);
    }
  };

  // 선택된 학급의 학생들 가져오기
  const fetchStudentsByClass = async (classCodeValue) => {
    try {
      const studentsRef = collection(db, 'Class', classCodeValue, 'students');
      const studentsSnapshot = await getDocs(studentsRef);

      const studentsList = studentsSnapshot.docs.map(studentDoc => {
        const data = studentDoc.data();
        return {
          id: studentDoc.id,
          classCode: classCodeValue,
          ...data,
          money: data.money !== undefined && data.money !== null ? data.money : 0,
        };
      });

      setStudents(studentsList);
    } catch (error) {
      logger.error("학생 정보를 불러오는 데 실패했습니다:", error);
    }
  };

  // 학급 선택 핸들러
  const handleClassSelect = (classCodeValue) => {
    setSelectedClass(classCodeValue);
    fetchStudentsByClass(classCodeValue);
  };

  if (!currentUser?.isAdmin && !currentUser?.isSuperAdmin) {
    return <div>관리자만 접근할 수 있는 페이지입니다.</div>;
  }

  return (
    <div className="admin-page-container">
      <div className="admin-content">
        <h1>관리자 페이지 (CLASS: {classCode})</h1>

        {/* 탭 메뉴 */}
        <div className="admin-tabs mb-6 border-b">
          <div className="flex flex-wrap">
            <button
              className={`py-2 px-4 font-medium ${
                activeTab === 'financial'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('financial')}
            >
              금융 상품 관리
            </button>
            <button
              className={`py-2 px-4 font-medium ${
                activeTab === 'database'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('database')}
            >
              데이터베이스
            </button>
            <button
              className={`py-2 px-4 font-medium ${
                activeTab === 'market'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('market')}
            >
              시장 제어
            </button>
            {currentUser?.isSuperAdmin && (
              <button
                className={`py-2 px-4 font-medium ${
                  activeTab === 'users'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500'
                }`}
                onClick={() => setActiveTab('users')}
              >
                사용자 관리
              </button>
            )}
          </div>
        </div>

        {/* 금융 상품 관리 탭 */}
        {activeTab === 'financial' && <AdminPanel />}

        {/* 데이터베이스 탭 */}
        {activeTab === 'database' && <AdminDatabase />}

        {/* 시장 제어 탭 */}
        {activeTab === 'market' && (
          <div>
            <div className="admin-section">
              <h2>주식 시장 제어</h2>
              <p>현재 상태: <span className={marketStatus.isOpen ? 'market-open' : 'market-closed'}>
                {marketStatus.isOpen ? '개장' : '폐장'}
              </span></p>
              <div className="market-controls">
                <button
                  onClick={() => handleMarketControl(true)}
                  disabled={marketStatus.isOpen}
                  className="control-button open"
                >
                  수동 개장
                </button>
                <button
                  onClick={() => handleMarketControl(false)}
                  disabled={!marketStatus.isOpen}
                  className="control-button close"
                >
                  수동 폐장
                </button>
              </div>
              <p className="description">
                버튼을 누르면 정해진 시간과 상관없이 시장 상태가 즉시 변경됩니다.<br/>
                자동 개장/폐장 시간(오전 8시/오후 3시)이 되면 자동으로 상태가 변경됩니다.
              </p>
            </div>

            <div className="admin-section">
              <h2>화폐 지급</h2>
              <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
                <option value="">학생 선택</option>
                {students.map(student => (
                  <option key={student.id} value={student.id}>{student.name} ({student.id})</option>
                ))}
              </select>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="금액 입력"
              />
              <button onClick={handleMoneyTransfer}>지급</button>
            </div>

            <div className="admin-section">
              <h2>아이템 마켓 데이터 정리</h2>
              <p className="description">
                기존 경로(루트 marketItems)에 있는 마켓 아이템들을 모두 환불합니다.<br/>
                판매자들의 인벤토리로 아이템이 자동 반환됩니다.
              </p>
              <button
                onClick={handleRefundOldItems}
                className="control-button close"
                style={{ marginTop: '10px' }}
              >
                기존 마켓 아이템 환불
              </button>
            </div>

            {message && <p className="message-box">{message}</p>}
          </div>
        )}

        {/* 사용자 관리 탭 */}
        {activeTab === 'users' && currentUser?.isSuperAdmin && (
          <div className="users-management-section">
            <h2 style={{ marginBottom: '20px', fontSize: '24px', fontWeight: 'bold' }}>사용자 관리</h2>

            {/* 학급 선택 UI */}
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: '600', color: '#4a5568' }}>학급 선택</h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '15px'
              }}>
                {classList.map(classItem => (
                  <button
                    key={classItem.classCode}
                    onClick={() => handleClassSelect(classItem.classCode)}
                    style={{
                      padding: '15px 20px',
                      borderRadius: '12px',
                      border: selectedClass === classItem.classCode ? '3px solid #667eea' : '2px solid #e2e8f0',
                      background: selectedClass === classItem.classCode
                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                        : 'white',
                      color: selectedClass === classItem.classCode ? 'white' : '#4a5568',
                      fontWeight: '700',
                      fontSize: '15px',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: selectedClass === classItem.classCode
                        ? '0 8px 20px rgba(102, 126, 234, 0.3)'
                        : '0 2px 8px rgba(0,0,0,0.1)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedClass !== classItem.classCode) {
                        e.currentTarget.style.transform = 'translateY(-3px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedClass !== classItem.classCode) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                      }
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>{classItem.classCode}</span>
                    <span style={{
                      fontSize: '12px',
                      opacity: 0.9,
                      fontWeight: '600'
                    }}>
                      {classItem.studentCount}명
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 선택된 학급이 없을 때 메시지 표시 */}
            {!selectedClass && (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                background: 'rgba(102, 126, 234, 0.05)',
                borderRadius: '15px',
                border: '2px dashed #667eea'
              }}>
                <p style={{ fontSize: '18px', color: '#667eea', fontWeight: '600', margin: 0 }}>
                  학급을 선택하여 학생 목록을 확인하세요
                </p>
              </div>
            )}

            {/* 학생 목록 */}
            {selectedClass && (
              <div>
                <h3 style={{ marginBottom: '15px', fontSize: '18px', fontWeight: '600', color: '#4a5568' }}>
                  {selectedClass} 학급 학생 목록 ({students.length}명)
                </h3>
                <div className="users-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                  gap: '20px',
                  padding: '10px'
                }}>
              {students.map(user => (
                <div key={user.id} style={{
                  background: 'white',
                  borderRadius: '15px',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                  overflow: 'hidden',
                  transition: 'transform 0.3s ease, box-shadow 0.3s ease'
                }} className="user-card-hover">
                  {editingUserId === user.id ? (
                    <div style={{
                      padding: '25px',
                      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                      animation: 'slideIn 0.3s ease'
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
                        <div>
                          <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', color: '#4a5568', fontSize: '13px' }}>이름</label>
                          <input
                            type="text"
                            name="name"
                            value={editFormData.name || ''}
                            onChange={handleInputChange}
                            style={{
                              width: '100%',
                              padding: '12px 16px',
                              borderRadius: '10px',
                              border: '2px solid #cbd5e0',
                              fontSize: '15px',
                              transition: 'all 0.3s ease'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', color: '#4a5568', fontSize: '13px' }}>이메일</label>
                          <input
                            type="email"
                            name="email"
                            value={editFormData.email || ''}
                            readOnly
                            style={{
                              width: '100%',
                              padding: '12px 16px',
                              borderRadius: '10px',
                              border: '2px solid #e2e8f0',
                              fontSize: '15px',
                              backgroundColor: '#edf2f7',
                              cursor: 'not-allowed'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', color: '#4a5568', fontSize: '13px' }}>비밀번호 (변경시에만 입력)</label>
                          <input
                            type="password"
                            name="password"
                            value={editFormData.password || ''}
                            onChange={handleInputChange}
                            placeholder="변경하지 않으려면 비워두세요"
                            style={{
                              width: '100%',
                              padding: '12px 16px',
                              borderRadius: '10px',
                              border: '2px solid #cbd5e0',
                              fontSize: '15px'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', color: '#4a5568', fontSize: '13px' }}>잔액</label>
                          <input
                            type="number"
                            name="money"
                            value={editFormData.money || 0}
                            onChange={handleInputChange}
                            style={{
                              width: '100%',
                              padding: '12px 16px',
                              borderRadius: '10px',
                              border: '2px solid #cbd5e0',
                              fontSize: '15px'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', color: '#4a5568', fontSize: '13px' }}>레벨</label>
                          <input
                            type="number"
                            name="level"
                            value={editFormData.level || 0}
                            onChange={handleInputChange}
                            style={{
                              width: '100%',
                              padding: '12px 16px',
                              borderRadius: '10px',
                              border: '2px solid #cbd5e0',
                              fontSize: '15px'
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '20px', paddingTop: '20px', borderTop: '2px solid rgba(102, 126, 234, 0.1)' }}>
                        <button
                          onClick={() => handleSaveUser(user.id)}
                          style={{
                            padding: '12px',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                            color: 'white',
                            fontWeight: '700',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          저장
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          style={{
                            padding: '12px',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #bdc3c7 0%, #95a5a6 100%)',
                            color: 'white',
                            fontWeight: '700',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px', paddingBottom: '15px', borderBottom: '2px solid rgba(102, 126, 234, 0.1)' }}>
                        <div style={{
                          width: '50px',
                          height: '50px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '20px',
                          fontWeight: '700'
                        }}>
                          {user.name?.charAt(0) || '?'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>{user.name}</h3>
                            {user.isAdmin ? (
                              <span style={{
                                fontSize: '11px',
                                fontWeight: '700',
                                padding: '4px 10px',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                                color: 'white'
                              }}>관리자</span>
                            ) : (
                              <span style={{
                                fontSize: '11px',
                                fontWeight: '700',
                                padding: '4px 10px',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                                color: 'white'
                              }}>학생</span>
                            )}
                          </div>
                          <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>{user.email}</p>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginBottom: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 15px', background: 'rgba(102, 126, 234, 0.05)', borderRadius: '8px', borderLeft: '3px solid #667eea' }}>
                          <span style={{ color: '#667eea', fontWeight: '600', fontSize: '13px' }}>직업</span>
                          <span style={{ fontWeight: '600', fontSize: '14px' }}>{user.job?.name || user.jobName || '미지정'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 15px', background: 'rgba(102, 126, 234, 0.05)', borderRadius: '8px', borderLeft: '3px solid #667eea' }}>
                          <span style={{ color: '#667eea', fontWeight: '600', fontSize: '13px' }}>레벨</span>
                          <span style={{
                            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>Lv. {user.level || 0}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 15px', background: 'rgba(102, 126, 234, 0.05)', borderRadius: '8px', borderLeft: '3px solid #667eea' }}>
                          <span style={{ color: '#667eea', fontWeight: '600', fontSize: '13px' }}>잔액</span>
                          <span style={{
                            color: user.money < 0 ? '#eb3349' : '#11998e',
                            fontWeight: '700',
                            fontSize: '14px'
                          }}>{user.money?.toLocaleString() || 0}원</span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <button
                          onClick={() => handleEditUser(user)}
                          style={{
                            padding: '10px',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            fontWeight: '600',
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleToggleAdmin(user)}
                          style={{
                            padding: '10px',
                            borderRadius: '10px',
                            border: 'none',
                            background: user.isAdmin
                              ? 'linear-gradient(135deg, #757F9A 0%, #D7DDE8 100%)'
                              : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                            color: 'white',
                            fontWeight: '600',
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          {user.isAdmin ? '관리자 해제' : '관리자 지정'}
                        </button>
                        <button
                          onClick={() => {
                            const newPassword = prompt(`${user.name} 학생의 새 비밀번호를 입력하세요:`, 'test1234');
                            if (newPassword) {
                              handleResetPassword(user, newPassword);
                            }
                          }}
                          style={{
                            padding: '10px',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                            color: 'white',
                            fontWeight: '600',
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          비밀번호 초기화
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.name)}
                          style={{
                            padding: '10px',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)',
                            color: 'white',
                            fontWeight: '600',
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;