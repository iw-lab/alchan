import React, { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  collectionGroup,
  query,
  limit,
  orderBy,
  startAfter,
  where
} from 'firebase/firestore';
import { db, functions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../contexts/AuthContext';
import './AdminUserManagement.css';

const AdminUserManagement = () => {
  const { userDoc } = useAuth();
  const [users, setUsers] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastDocRef, setLastDocRef] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [remoteSearchTerm, setRemoteSearchTerm] = useState('');

  const isSuperAdmin = userDoc?.isSuperAdmin === true;
  const isAdmin = userDoc?.isAdmin === true;
  const classCode = userDoc?.classCode;
  const PAGE_SIZE = 50;

  const buildQueryConstraints = useCallback((baseRef, nextCursor, searchTerm) => {
    const constraints = [orderBy('name'), limit(PAGE_SIZE)];
    if (searchTerm) {
      const term = searchTerm.trim();
      constraints.push(startAt(term));
      constraints.push(endAt(term + '\uf8ff'));
    }
    if (nextCursor) {
      constraints.push(startAfter(nextCursor));
    }
    return constraints;
  }, []);

  const fetchUsers = useCallback(async (reset = false) => {
    if (!userDoc) {
      setIsLoading(false);
      return;
    }

    const searchTerm = remoteSearchTerm.trim();
    setIsLoading(reset);
    try {
      let usersData = [];
      const nextCursor = reset ? null : lastDocRef;

      if (isSuperAdmin) {
        const baseRef = collectionGroup(db, 'students');
        const constraints = buildQueryConstraints(baseRef, nextCursor, searchTerm);
        const snapshot = await getDocs(query(baseRef, ...constraints));
        usersData = snapshot.docs.map(studentDoc => {
          const data = studentDoc.data();
          return {
            id: studentDoc.id,
            classCode: data.classCode,
            ...data,
            money: data.money ?? 0,
          };
        });
        setLastDocRef(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(snapshot.size === PAGE_SIZE);
      } else if (isAdmin && classCode) {
        const studentsCollectionRef = collection(db, 'Class', classCode, 'students');
        const constraints = buildQueryConstraints(studentsCollectionRef, nextCursor, searchTerm);
        const querySnapshot = await getDocs(query(studentsCollectionRef, ...constraints));
        usersData = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            classCode: classCode,
            ...data,
            money: data.money ?? 0,
          };
        });
        setLastDocRef(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.size === PAGE_SIZE);
      } else {
        usersData = [];
        setHasMore(false);
      }

      setUsers(prev => (reset ? usersData : [...prev, ...usersData]));
    } catch (error) {
      console.error("학생 정보를 불러오는 데 실패했습니다:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [userDoc, isSuperAdmin, isAdmin, classCode, buildQueryConstraints, lastDocRef, remoteSearchTerm]);

  useEffect(() => {
    // 초기 로드 또는 관리자/클래스/검색어 변경 시 상태 리셋 후 재조회
    setUsers([]);
    setLastDocRef(null);
    setHasMore(true);
    fetchUsers(true);
  }, [userDoc, isSuperAdmin, isAdmin, classCode, remoteSearchTerm, fetchUsers]);

  const handleRehabilitate = async (studentId, studentName, studentClassCode) => {
    if (window.confirm(`정말로 '${studentName}' 학생을 개인회생 처리하시겠습니까?\n해당 학생의 모든 자산(돈, 주식, 부동산 등)이 0으로 초기화되고 모든 빚이 청산됩니다. 이 작업은 되돌릴 수 없습니다.`)) {
      try {
        const executeRehabilitation = httpsCallable(functions, 'executePersonalRehabilitation');
        const result = await executeRehabilitation({ classCode: studentClassCode, studentId });

        alert(result.data.message);
        setUsers(prevUsers =>
          prevUsers.map(user =>
            user.id === studentId ? { ...user, money: 0 } : user
          )
        );
      } catch (error) {
        console.error("개인회생 처리 중 오류 발생:", error);
        alert(`오류가 발생했습니다: ${error.message}`);
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
      console.error("비밀번호 초기화 중 오류 발생:", error);
      alert(`비밀번호 초기화에 실패했습니다: ${error.message}`);
    }
  };

  const handleResetAllPasswords = async () => {
    const defaultPassword = prompt('모든 사용자의 비밀번호를 초기화할 기본 비밀번호를 입력하세요:', 'test1234');

    if (!defaultPassword) {
      return;
    }

    if (!window.confirm(`정말로 모든 사용자(${filteredUsers.length}명)의 비밀번호를 '${defaultPassword}'로 초기화하시겠습니까?`)) {
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const user of filteredUsers) {
      try {
        const updatePassword = httpsCallable(functions, 'updateUserPassword');
        await updatePassword({
          email: user.email,
          newPassword: defaultPassword
        });
        successCount++;
      } catch (error) {
        console.error(`${user.name} 비밀번호 초기화 실패:`, error);
        failCount++;
      }
    }

    alert(`비밀번호 초기화 완료\n성공: ${successCount}명\n실패: ${failCount}명`);
  };

  const handleEdit = (user) => {
    setEditingUserId(user.id);
    setEditFormData({ ...user });
  };

  const handleCancel = () => {
    setEditingUserId(null);
    setEditFormData({});
  };

  const handleToggleAdmin = async (user) => {
    const isCurrentlyAdmin = user.isAdmin === true;
    const actionText = isCurrentlyAdmin ? '관리자 권한을 제거' : '관리자로 지정';

    if (!window.confirm(`정말로 '${user.name}' 학생을 ${actionText}하시겠습니까?`)) {
      return;
    }

    try {
      const userDocRef = doc(db, 'Class', user.classCode, 'students', user.id);
      await updateDoc(userDocRef, {
        isAdmin: !isCurrentlyAdmin
      });

      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === user.id ? { ...u, isAdmin: !isCurrentlyAdmin } : u
        )
      );

      alert(`${user.name} 학생이 ${actionText}되었습니다.`);
    } catch (error) {
      console.error("관리자 권한 변경 중 오류 발생:", error);
      alert(`권한 변경에 실패했습니다: ${error.message}`);
    }
  };

  const handleSave = async (id) => {
    const userToEdit = users.find(u => u.id === id);
    if (!userToEdit) return;

    const userClassCode = userToEdit.classCode;

    try {
      const userDocRef = doc(db, 'Class', userClassCode, 'students', id);
      const dataToSave = {
        ...editFormData,
        money: Number(editFormData.money) || 0,
        level: Number(editFormData.level) || 0,
      };
      delete dataToSave.password;
      delete dataToSave.classCode; // classCode는 업데이트하지 않음

      await updateDoc(userDocRef, dataToSave);

      // 관리자이고 비밀번호가 입력된 경우에만 비밀번호 변경
      if ((isAdmin || isSuperAdmin) && editFormData.password && editFormData.password.trim() !== '') {
        const updatePassword = httpsCallable(functions, 'updateUserPassword');
        await updatePassword({
          email: editFormData.email,
          newPassword: editFormData.password
        });
        alert('학생 정보 및 비밀번호가 성공적으로 업데이트되었습니다.');
      } else {
        alert('학생 정보가 성공적으로 업데이트되었습니다.');
      }

      setUsers(prevUsers =>
        prevUsers.map(user => (user.id === id ? { ...user, ...dataToSave, classCode: userClassCode } : user))
      );
      setEditingUserId(null);
      setEditFormData({});
    } catch (error) {
      console.error("학생 정보 업데이트 중 오류 발생:", error);
      alert(`정보 업데이트에 실패했습니다: ${error.message}`);
    }
  };

  const handleDelete = async (id) => {
    const userToDelete = users.find(u => u.id === id);
    if (!userToDelete) return;

    const userClassCode = userToDelete.classCode;

    if (window.confirm('정말로 이 학생을 삭제하시겠습니까? 모든 데이터가 사라집니다.')) {
      try {
        await deleteDoc(doc(db, 'Class', userClassCode, 'students', id));
        setUsers(prevUsers => prevUsers.filter(user => user.id !== id));
        alert('학생이 삭제되었습니다.');
      } catch (error) {
        console.error("학생 삭제 중 오류 발생:", error);
        alert('학생 삭제에 실패했습니다.');
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };

  const filteredUsers = users.filter(user =>
    (user.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.classCode?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return <div className="loading-container">데이터를 불러오는 중입니다...</div>;
  }

  if (!isAdmin && !isSuperAdmin) {
    return <div className="loading-container">관리자 권한이 필요합니다.</div>;
  }

  const pageTitle = isSuperAdmin
    ? '전체 학생 정보 관리 (슈퍼 관리자)'
    : `학생 정보 관리 (학급: ${classCode})`;

  return (
    <div className="admin-user-management">
      <h2 className="management-title">{pageTitle}</h2>

      <div className="top-controls">
        <div className="search-container">
          <input
            type="text"
            placeholder={isSuperAdmin ? "이름, 이메일 또는 학급 코드로 검색" : "이름 또는 이메일로 검색"}
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value;
              setSearchTerm(val);
              setRemoteSearchTerm(val.trim());
            }}
            className="search-input"
          />
        </div>

        <div className="bulk-actions">
          <button
            onClick={handleResetAllPasswords}
            className="bulk-action-button reset-all"
          >
            모든 사용자 비밀번호 초기화
          </button>
          <div className="user-count">
            총 {filteredUsers.length}명
          </div>
        </div>
      </div>

      <div className="user-cards-container">
        {filteredUsers.map(user => (
          <div key={user.id} className="user-card">
            {editingUserId === user.id ? (
              <div className="edit-form">
                <div className="form-grid">
                  <div className="form-group">
                    <label>이름</label>
                    <input type="text" name="name" value={editFormData.name || ''} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label>이메일</label>
                    <input type="email" name="email" readOnly value={editFormData.email || ''} />
                  </div>
                  {isSuperAdmin && (
                    <div className="form-group">
                      <label>학급 코드</label>
                      <input type="text" name="classCode" readOnly value={editFormData.classCode || ''} />
                    </div>
                  )}
                  {(isAdmin || isSuperAdmin) && (
                    <div className="form-group">
                      <label>비밀번호 (변경시에만 입력)</label>
                      <input
                        type="password"
                        name="password"
                        value={editFormData.password || ''}
                        onChange={handleInputChange}
                        placeholder="변경하지 않으려면 비워두세요"
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label>직업</label>
                    <input type="text" name="jobName" value={editFormData.job?.name || editFormData.jobName || ''} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label>레벨</label>
                    <input type="number" name="level" value={editFormData.level || 0} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label>잔액</label>
                    <input type="number" name="money" value={editFormData.money} onChange={handleInputChange} />
                  </div>
                </div>
                <div className="card-actions">
                  <button onClick={() => handleSave(user.id)} className="action-button save">저장</button>
                  <button onClick={handleCancel} className="action-button cancel">취소</button>
                </div>
              </div>
            ) : (
              <div className="view-mode">
                <div className="user-header">
                  <div className="user-avatar">
                    {user.name?.charAt(0) || '?'}
                  </div>
                  <div className="user-basic-info">
                    <div className="name-with-badge">
                      <h3 className="user-name">{user.name}</h3>
                      {user.isAdmin ? (
                        <span className="role-badge admin-badge">관리자</span>
                      ) : (
                        <span className="role-badge student-badge">학생</span>
                      )}
                    </div>
                    <p className="user-email">{user.email}</p>
                  </div>
                </div>

                <div className="user-info">
                  {isSuperAdmin && (
                    <div className="info-item">
                      <span className="info-label">학급</span>
                      <span className="info-value badge-class">{user.classCode}</span>
                    </div>
                  )}
                  <div className="info-item">
                    <span className="info-label">직업</span>
                    <span className="info-value">{user.job?.name || user.jobName || '미지정'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">레벨</span>
                    <span className="info-value badge-level">Lv. {user.level || 0}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">잔액</span>
                    <span className={`info-value ${user.money < 0 ? 'negative-balance' : 'positive-balance'}`}>
                      {user.money?.toLocaleString() || 0}원
                    </span>
                  </div>
                </div>

                <div className="card-actions">
                  <button onClick={() => handleEdit(user)} className="action-button edit">
                    수정
                  </button>
                  <button
                    onClick={() => handleToggleAdmin(user)}
                    className={`action-button ${user.isAdmin ? 'remove-admin' : 'make-admin'}`}
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
                    className="action-button reset-password"
                  >
                    비밀번호 초기화
                  </button>
                  <button
                    onClick={() => handleRehabilitate(user.id, user.name, user.classCode)}
                    className="action-button rehabilitate"
                  >
                    개인회생
                  </button>
                  <button onClick={() => handleDelete(user.id)} className="action-button delete">
                    삭제
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="pagination-controls">
          <button
            className="action-button load-more"
            disabled={isLoadingMore}
            onClick={() => {
              setIsLoadingMore(true);
              fetchUsers(false);
            }}
          >
            {isLoadingMore ? '불러오는 중...' : '더 불러오기'}
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminUserManagement;
