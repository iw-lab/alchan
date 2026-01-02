// src/FirestoreExample.js
import React, { useState, useEffect, useCallback } from "react";
import {
  db,
  addData,
  updateData,
  deleteData,
  fetchCollection, // 데이터를 한번만 가져오는 함수로 변경
  // subscribeToCollection, // 실시간 구독이 필요할 경우 이 함수를 사용
} from "./firebase";

function FirestoreExample() {
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ name: "", age: "", email: "" });
  const [editingUser, setEditingUser] = useState(null); // 수정 중인 사용자 정보
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const COLLECTION_NAME = "users";

  // Firestore에서 데이터를 한 번만 가져옵니다.
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const userData = await fetchCollection(COLLECTION_NAME);
      // createdAt 필드가 있는지 확인하고, 없으면 현재 시간으로 임시 설정 (정렬을 위해)
      const sortedUsers = userData.sort((a, b) => {
        const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA; // 최신 순으로 정렬
      });
      setUsers(sortedUsers);
    } catch (err) {
      setError("사용자 데이터를 불러오는 중 오류가 발생했습니다: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      setError(
        "Firestore가 초기화되지 않았습니다. Firebase 설정을 확인해주세요."
      );
      return;
    }
    loadUsers();

    /*
    // [참고] 실시간 데이터 구독이 꼭 필요한 경우 아래 코드를 사용하세요.
    // 이 경우, firebase.js에서 subscribeToCollection을 import 해야 합니다.
    const unsubscribe = subscribeToCollection(COLLECTION_NAME, (data) => {
      const sortedData = data.sort((a, b) => {
          const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
          const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
          return dateB - dateA;
      });
      setUsers(sortedData);
      setLoading(false);
    });

    // 컴포넌트 언마운트 시 구독 취소
    return () => unsubscribe();
    */
  }, [loadUsers]);

  // 입력 필드 변경 핸들러
  const handleNewUserChange = (e) => {
    const { name, value } = e.target;
    setNewUser(prev => ({ ...prev, [name]: value }));
  };
  
  const handleEditingUserChange = (e) => {
    const { name, value } = e.target;
    setEditingUser(prev => ({ ...prev, [name]: value }));
  };

  // 새 사용자 추가
  const handleAddUser = useCallback(async (e) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email) {
      setError("이름과 이메일을 모두 입력해주세요.");
      return;
    }

    setLoading(true);
    setError(null);
    
    const userData = {
      name: newUser.name,
      age: newUser.age ? parseInt(newUser.age, 10) : null,
      email: newUser.email,
    };

    try {
      await addData(COLLECTION_NAME, userData);
      setNewUser({ name: "", age: "", email: "" }); // 폼 초기화
      await loadUsers(); // 데이터 새로고침
    } catch (err) {
      setError("사용자 추가 중 오류가 발생했습니다: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [newUser, loadUsers]);

  // 사용자 정보 업데이트
  const handleUpdateUser = useCallback(async (e) => {
    e.preventDefault();
    if (!editingUser || !editingUser.name || !editingUser.email) {
      setError("수정할 이름과 이메일을 모두 입력해주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    const { id, ...dataToUpdate } = editingUser;

    try {
      await updateData(COLLECTION_NAME, id, {
        name: dataToUpdate.name,
        email: dataToUpdate.email,
        age: dataToUpdate.age ? parseInt(dataToUpdate.age, 10) : null,
      });
      setEditingUser(null); // 수정 모드 종료
      await loadUsers(); // 데이터 새로고침
    } catch (err) {
      setError("사용자 업데이트 중 오류가 발생했습니다: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [editingUser, loadUsers]);

  // 사용자 삭제
  const handleDeleteUser = useCallback(async (userId) => {
    if (!window.confirm("정말 이 사용자를 삭제하시겠습니까?")) return;
    
    setLoading(true);
    setError(null);

    try {
      await deleteData(COLLECTION_NAME, userId);
      await loadUsers(); // 데이터 새로고침
    } catch (err) {
      setError("사용자 삭제 중 오류가 발생했습니다: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [loadUsers]);
  
  return (
    <div className="firestore-example" style={{ fontFamily: 'sans-serif', padding: '20px' }}>
      <h1>Firebase Firestore CRUD 예제 (최적화 버전)</h1>

      {error && (
        <div
          className="error-message"
          style={{
            color: "white", backgroundColor: "#e53e3e", padding: "12px",
            borderRadius: "4px", margin: "16px 0",
          }}
        >
          {error}
        </div>
      )}

      <div
        className="firestore-container"
        style={{
          display: "grid", gridTemplateColumns: "1fr 2fr",
          gap: "20px", marginTop: "20px",
        }}
      >
        {/* 새 사용자 추가 또는 수정 폼 */}
        <div
          className="form-container"
          style={{
            backgroundColor: editingUser ? "#fffbeb" : "#f0f9ff",
            padding: "16px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          <h2 style={{ marginBottom: "16px" }}>
            {editingUser ? "사용자 정보 수정" : "새 사용자 추가"}
          </h2>
          <form
            onSubmit={editingUser ? handleUpdateUser : handleAddUser}
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {/* 공통 입력 필드 */}
            <input
              type="text"
              name="name"
              value={editingUser ? editingUser.name : newUser.name}
              onChange={editingUser ? handleEditingUserChange : handleNewUserChange}
              placeholder="이름 입력" required
              style={{ width: "calc(100% - 16px)", padding: "8px", border: "1px solid #cbd5e0", borderRadius: "4px" }}
            />
            <input
              type="number"
              name="age"
              value={editingUser ? (editingUser.age || "") : newUser.age}
              onChange={editingUser ? handleEditingUserChange : handleNewUserChange}
              placeholder="나이 입력 (선택사항)"
              style={{ width: "calc(100% - 16px)", padding: "8px", border: "1px solid #cbd5e0", borderRadius: "4px" }}
            />
            <input
              type="email"
              name="email"
              value={editingUser ? editingUser.email : newUser.email}
              onChange={editingUser ? handleEditingUserChange : handleNewUserChange}
              placeholder="이메일 입력" required
              style={{ width: "calc(100% - 16px)", padding: "8px", border: "1px solid #cbd5e0", borderRadius: "4px" }}
            />
            
            {/* 버튼 영역 */}
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  backgroundColor: editingUser ? "#38a169" : "#4299e1",
                  color: "white", padding: "8px 16px", borderRadius: "4px",
                  border: "none", cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1, flex: 1,
                }}
              >
                {loading ? "처리 중..." : (editingUser ? "수정 완료" : "사용자 추가")}
              </button>
              {editingUser && (
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  style={{
                    backgroundColor: "#e2e8f0", color: "#4a5568",
                    padding: "8px 16px", borderRadius: "4px", border: "none", cursor: "pointer",
                  }}
                >
                  취소
                </button>
              )}
            </div>
          </form>
        </div>

        {/* 사용자 목록 */}
        <div
          className="users-list"
          style={{
            backgroundColor: "#f7fafc", padding: "16px", borderRadius: "8px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          <h2 style={{ marginBottom: "16px" }}>사용자 목록</h2>
          {loading ? (
            <p>데이터를 불러오는 중...</p>
          ) : users.length === 0 ? (
            <p>등록된 사용자가 없습니다.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "12px" }}>
              {users.map((user) => (
                <li key={user.id} style={{
                    backgroundColor: "white", padding: "16px", borderRadius: "6px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)", display: "flex",
                    justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <h3 style={{ margin: "0 0 8px 0" }}>{user.name}</h3>
                    {user.age && <p style={{ margin: "4px 0", color: "#4a5568" }}>나이: {user.age}세</p>}
                    <p style={{ margin: "4px 0", color: "#4a5568" }}>이메일: {user.email}</p>
                    <p style={{ margin: "4px 0", fontSize: "12px", color: "#718096" }}>ID: {user.id}</p>
                    {user.createdAt && (
                      <p style={{ margin: "4px 0", fontSize: "12px", color: "#718096" }}>
                        가입일: {new Date(user.createdAt.toDate()).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <button 
                      onClick={() => setEditingUser(user)}
                      style={{ backgroundColor: "#4299e1", color: "white", border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
                    >수정</button>
                    <button 
                      onClick={() => handleDeleteUser(user.id)}
                      style={{ backgroundColor: "#f56565", color: "white", border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
                      disabled={loading}
                    >삭제</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default FirestoreExample;