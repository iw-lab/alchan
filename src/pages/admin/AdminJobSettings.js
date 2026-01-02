// src/Header.js - 관리자 패널 버튼 추가 및 스타일 개선 버전
import React, { useState } from "react";
// import { useAuth } from "./App"; // App.js에서 useAuth를 import -> AuthContext에서 직접 import
import { useAuth } from "../../contexts/AuthContext"; // AuthContext에서 useAuth를 import
import "../../Header.css";
import { formatKoreanCurrency } from '../../numberFormatter';
import { useNavigate } from "react-router-dom"; // navigate 사용을 위해 임포트

// AuthContext의 userDoc (Firestore 사용자 정보)를 prop으로 받도록 수정
// isAdmin 정보도 userDoc에서 오므로 prop으로 받아 사용
const Header = ({ toggleSidebar, user, logout, isAdmin }) => {
  // useAuth 훅을 여기서 다시 호출할 필요 없음. 필요한 user, logout, isAdmin은 props로 받음
  // const auth = useAuth();
  // const user = auth?.user; // 이 user는 Auth 객체의 user (uid, email 등 기본 정보)
  // const userDoc = auth?.userDoc; // Firestore의 상세 사용자 정보
  // const isAdmin = auth?.isAdmin(); // 관리자 여부 함수

  const navigate = useNavigate(); // navigate 훅 사용

  // 사용자 메뉴 상태
  const [showUserMenu, setShowUserMenu] = useState(false);

  // 사용자 메뉴 토글
  const toggleUserMenu = () => {
    setShowUserMenu(!showUserMenu);
  };

  // 로그아웃 처리 (props로 받은 logout 함수 사용)
  const handleLogout = () => {
    if (logout) {
      logout(); // AuthContext의 logout 함수 호출
      setShowUserMenu(false); // 메뉴 닫기
    } else {
      console.error("logout 함수를 찾을 수 없습니다.");
    }
  };

  // 닉네임 변경
  const handleChangeNickname = () => {
    // 이 기능은 AuthContext의 updateUserData를 사용하도록 수정 필요
    const newNickname = prompt("새로운 닉네임을 입력하세요:");
    if (newNickname && newNickname.trim() !== "") {
      // TODO: 닉네임 변경 로직 구현 (AuthContext의 updateUserData 호출)
      console.log("TODO: 닉네임 변경 로직 구현 필요 - AuthContext 사용");
      // 예시: auth.updateUserData({ nickname: newNickname });
      alert(`닉네임 변경 요청: '${newNickname}' (기능 구현 필요)`);
    }
    setShowUserMenu(false);
  };

  // 학급코드 확인
  const handleClassCode = () => {
    // user (userDoc) 객체에서 classCode 정보 확인
    alert(`현재 학급코드: ${user?.classCode || "미지정"}`); // props로 받은 user(userDoc) 사용
    setShowUserMenu(false);
  };

  // 비밀번호 변경
  const handleChangePassword = () => {
    // TODO: 비밀번호 변경 페이지로 이동 또는 모달 표시 구현 필요
    console.log("TODO: 비밀번호 변경 기능 구현 필요");
    alert("비밀번호 변경 기능은 구현 중입니다.");
    setShowUserMenu(false);
  };

  // 계정 삭제
  const handleDeleteAccount = () => {
    const confirmed = window.confirm(
      "정말로 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
    );
    if (confirmed) {
      // TODO: 계정 삭제 로직 구현 필요
      console.log("TODO: 계정 삭제 로직 구현 필요");
      alert("계정 삭제 기능은 구현 중입니다.");
      // 삭제 성공 시 자동으로 로그아웃 처리 필요
      // if (logout) logout();
    }
    setShowUserMenu(false);
  };

  // 관리자 패널 열기
  const handleAdminPanelClick = () => {
    navigate("/admin-panel"); // AdminPanel 경로로 이동
    setShowUserMenu(false); // 메뉴 닫기
  };

  return (
    <header
      className="header"
      style={{
        backgroundColor: "#4f46e5",
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        padding: "10px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        position: "fixed", // 헤더 고정
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50, // 사이드바보다 위에 있도록 z-index 설정
        height: "80px", // 헤더 높이 고정 (App.js 스타일과 일치)
      }}
    >
      <div className="header-left">
        {/* 메뉴 토글 버튼 */}
        <button
          onClick={toggleSidebar}
          className="menu-button"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "rgba(255, 255, 255, 0.15)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "8px",
            padding: "8px 12px",
            color: "white",
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            width="20"
            height="20"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16m-7 6h7"
            />
          </svg>
          <span style={{ fontWeight: "500" }}>메뉴</span>
        </button>
      </div>

      <div className="header-center">
        {/* 앱 타이틀 */}
        {/* 클릭 시 대시보드 자산 페이지로 이동 */}
        <a
          href="/dashboard/assets" // 대시보드 자산 페이지 경로
          className="header-title"
          style={{
            fontSize: "1.5rem",
            fontWeight: "bold",
            color: "white",
            textDecoration: "none",
          }}
          onClick={(e) => {
            // SPA에서 링크 클릭 시 새로고침 방지 및 react-router-dom 사용
            e.preventDefault();
            navigate("/dashboard/assets");
          }}
        >
          Ineconomy<span style={{ color: "#ffd700" }}>s</span>U Clas
          <span style={{ color: "#ffd700" }}>S</span>
        </a>
      </div>

      {/* 헤더 오른쪽 영역: 관리자 버튼 + 계정 버튼 */}
      <div
        className="header-right"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          position: "relative",
        }}
      >
        {/* 관리자 패널 열기 버튼 */}
        {isAdmin && ( // isAdmin prop 사용
          <button
            className="admin-panel-button"
            onClick={handleAdminPanelClick} // AdminPanel 열기 함수 연결
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              borderRadius: "8px",
              color: "white",
              padding: "8px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
              transition: "all 0.2s ease",
            }}
            title="관리자 패널 열기"
          >
            {/* 설정(톱니바퀴) 아이콘 */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              width="20"
              height="20"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.004.827c-.29.24-.438.613-.431.992a6.759 6.759 0 0 1 0 1.618c-.007.379.14.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.29-.24.438.613.43-.992a6.759 6.759 0 0 1 0-1.618c.007-.379-.14-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.217.456c.355.133.75.072 1.075-.124a6.57 6.57 0 0 1 .22-.128c.332-.183.582-.495.644-.869l.213-1.28c.09-.543.56-.94 1.11-.94Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
            <span style={{ fontWeight: "500" }}>관리자 패널</span>
          </button>
        )}

        {/* 계정 버튼 (props로 받은 user 사용) */}
        {user ? ( // user (userDoc) 객체가 있을 때만 표시
          <button
            onClick={toggleUserMenu}
            className="account-button"
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              borderRadius: "50%",
              width: "40px",
              height: "40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
              transition: "all 0.2s ease",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                backgroundColor: "rgba(165, 180, 252, 0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                color: "white",
              }}
            >
              {user?.nickname
                ? user.nickname.charAt(0).toUpperCase()
                : user?.name
                ? user.name.charAt(0).toUpperCase()
                : "U"}{" "}
              {/* 닉네임 또는 이름의 첫 글자 */}
            </div>
          </button>
        ) : // user 객체가 없을 때 (로그아웃 상태 또는 로딩 중)
        // 로그인 페이지로 이동하는 버튼 등을 표시할 수 있습니다.
        // 현재는 로그인 리디렉션이 App.js에서 처리되므로 버튼 제거
        null}

        {/* 사용자 드롭다운 메뉴 */}
        {showUserMenu &&
          user && ( // user (userDoc) 객체가 있고 메뉴가 열려있을 때만 표시
            <div
              className="user-dropdown-menu" // 클래스 추가
              style={{
                position: "absolute",
                top: "55px", // 버튼 아래에 위치하도록 조정
                right: "0",
                backgroundColor: "white",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                borderRadius: "12px",
                padding: "10px 0",
                width: "220px",
                zIndex: 1000, // 다른 요소 위에 오도록
                border: "1px solid rgba(229, 231, 235, 0.5)",
              }}
            >
              <div
                style={{
                  padding: "15px",
                  borderBottom: "1px solid #f1f5f9",
                  color: "#333",
                  fontWeight: "bold",
                }}
              >
                {user?.nickname || user?.name || "사용자"}{" "}
                {/* 닉네임 또는 이름 */}
                {isAdmin && ( // isAdmin prop 사용
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#4f46e5",
                      marginLeft: "5px",
                      padding: "3px 8px",
                      borderRadius: "20px",
                      backgroundColor: "#e0e7ff",
                      fontWeight: "normal",
                    }}
                  >
                    관리자
                  </span>
                )}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {/* 드롭다운 메뉴 항목들 */}
                <li>
                  <button
                    onClick={handleChangeNickname}
                    className="dropdown-item-button"
                  >
                    닉네임 변경
                  </button>
                </li>
                <li>
                  <button
                    onClick={handleClassCode}
                    className="dropdown-item-button"
                  >
                    학급코드 확인
                  </button>
                </li>
                <li>
                  <button
                    onClick={handleChangePassword}
                    className="dropdown-item-button"
                  >
                    비밀번호 변경
                  </button>
                </li>
                <li>
                  <button
                    onClick={handleDeleteAccount}
                    className="dropdown-item-button dropdown-item-delete"
                  >
                    계정 삭제
                  </button>
                </li>
                <li
                  style={{ borderTop: "1px solid #f1f5f9", marginTop: "5px" }}
                >
                  <button
                    onClick={handleLogout}
                    className="dropdown-item-button dropdown-item-logout"
                  >
                    로그아웃
                  </button>
                </li>
              </ul>
            </div>
          )}
      </div>
    </header>
  );
};

export default Header;

/* Header.css 에 추가하면 좋은 스타일 (선택 사항) */
/*
.dropdown-item-button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 12px 18px;
  color: #374151;
  background-color: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 14px;
}
.dropdown-item-button:hover {
  background-color: #f9fafb;
}
.dropdown-item-delete {
  color: #ef4444;
}
.dropdown-item-delete:hover {
  background-color: #fee2e2;
}
.dropdown-item-logout {
  color: #4f46e5;
  font-weight: bold;
}
.dropdown-item-logout:hover {
  background-color: #eff6ff;
}
.admin-panel-button:hover {
  background-color: rgba(255, 255, 255, 0.25) !important; // 호버 효과 추가
}
.account-button:hover {
  background-color: rgba(255, 255, 255, 0.25) !important; // 호버 효과 추가
}
.menu-button:hover {
  background-color: rgba(255, 255, 255, 0.25) !important; // 호버 효과 추가
}
*/
