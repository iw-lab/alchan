// src/Header.js - 최적화된 메모이제이션 버전
import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { verifyClassCode } from "./firebase";
import "./Header.css";
import { MiniAvatar } from "./components/Avatar";
import AvatarEditor from "./components/AvatarEditor";
import { getAvatarConfig } from "./utils/avatarSystem";
// Force dark theme background on header load
const headerStyle = {
    background: "linear-gradient(90deg, rgba(0, 255, 242, 0.05) 0%, rgba(10, 10, 18, 0.95) 50%, rgba(139, 92, 246, 0.05) 100%)",
    backgroundColor: "#0a0a12",
    color: "#e8e8ff",
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid rgba(0, 255, 242, 0.15)",
};
import { formatKoreanCurrency, formatCouponCount } from './numberFormatter';
import { useStableCallback, useSelectiveMemo, useRenderCount } from './hooks/useOptimizedMemo';
const MenuIcon = () => (
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
);

const UserIconPlaceholder = ({ userName, userId, avatarConfig, onClick }) => {
    // 아바타가 있으면 아바타를, 없으면 기존 아이콘 표시
    if (userId && avatarConfig) {
        return (
            <div className="my-info-icon-wrapper" onClick={onClick} style={{ padding: 0, overflow: "hidden" }}>
                <MiniAvatar config={avatarConfig} size={36} />
            </div>
        );
    }
    return (
        <div className="my-info-icon-wrapper">
            {userName ? userName.charAt(0).toUpperCase() : "👤"}
        </div>
    );
};

const Header = memo(({ toggleSidebar, isAdmin: isAdminProp }) => {
    // 🔥 [최적화] 렌더링 횟수 모니터링
    useRenderCount('Header');

    const navigate = useNavigate();

    // 🔥 [최적화] useAuth에서 필요한 데이터만 선택적으로 추출
    const {
        user,
        userDoc,
        logout,
        updateUser,
        changePassword,
        deleteCurrentUserAccount,
        loginWithEmailPassword
    } = useAuth();

    // 🔥 [최적화] 자주 변경되지 않는 사용자 정보만 메모이제이션
    const userInfo = useSelectiveMemo(userDoc, (doc) => ({
        name: doc?.name,
        nickname: doc?.nickname,
        classCode: doc?.classCode,
        cash: doc?.cash,
        coupons: doc?.coupons,
        isAdmin: doc?.isAdmin || doc?.isSuperAdmin
    }), [userDoc]);

    const [showUserMenu, setShowUserMenu] = useState(false);
    const userMenuRef = useRef(null);
    const [isLoading, setIsLoading] = useState(false); // 로딩 상태 추가

    // 닉네임 변경 상태
    const [isChangingNickname, setIsChangingNickname] = useState(false);
    const [newNickname, setNewNickname] = useState("");
    const [nicknameError, setNicknameError] = useState("");

    // 비밀번호 변경 상태
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [passwordSuccess, setPasswordSuccess] = useState(false);

    // 학급 코드 입력/변경 상태
    const [isEnteringClassCode, setIsEnteringClassCode] = useState(false);
    const [newClassCodeInput, setNewClassCodeInput] = useState("");
    const [classCodeEntryError, setClassCodeEntryError] = useState("");
    const [classCodeEntrySuccess, setClassCodeEntrySuccess] = useState(false);
    const [isVerifyingAndSavingCode, setIsVerifyingAndSavingCode] = useState(false);

    // 아바타 에디터 상태
    const [showAvatarEditor, setShowAvatarEditor] = useState(false);
    const [avatarConfig, setAvatarConfig] = useState(null);

    // 아바타 설정 로드
    useEffect(() => {
        if (user?.uid) {
            setAvatarConfig(getAvatarConfig(user.uid));
        }
    }, [user?.uid]);

    const isCurrentUserAdmin = userDoc?.isAdmin || userDoc?.role === "admin" || userDoc?.isSuperAdmin || isAdminProp;

    const toggleUserMenu = () => setShowUserMenu(!showUserMenu);

    const handleLogout = async () => {
        if (logout && typeof logout === 'function') {
            await logout();
            navigate('/login');
        }
        setShowUserMenu(false);
    };

    // --- 닉네임 변경 관련 함수들 (기존 로직 유지) ---
    const handleChangeNickname = () => {
        setNewNickname(userDoc?.name || userDoc?.nickname || "");
        setIsChangingNickname(true);
        setIsChangingPassword(false);
        setIsEnteringClassCode(false);
        setNicknameError("");
        setShowUserMenu(false);
    };

    const cancelNicknameChange = () => {
        setIsChangingNickname(false);
        setNewNickname("");
        setNicknameError("");
    };

    const saveNickname = async () => {
        const trimmedNickname = newNickname.trim();
        if (!trimmedNickname) return setNicknameError("닉네임을 입력해주세요.");
        if (trimmedNickname.length < 2) return setNicknameError("닉네임은 최소 2자 이상이어야 합니다.");
        if (trimmedNickname.length > 12) return setNicknameError("닉네임은 최대 12자까지 가능합니다.");
        if (trimmedNickname === (userDoc?.name || userDoc?.nickname)) return setNicknameError("현재 닉네임과 동일합니다.");

        setIsLoading(true);
        try {
            const success = await updateUser({ name: trimmedNickname });
            if (success) {
                alert("닉네임이 성공적으로 변경되었습니다.");
                cancelNicknameChange();
            } else {
                setNicknameError("닉네임 변경에 실패했습니다. 다시 시도해주세요.");
            }
        } catch (error) {
            console.error("닉네임 변경 중 오류:", error);
            setNicknameError(`닉네임 변경 중 오류: ${error.message}`);
        }
        setIsLoading(false);
    };

    // --- 🚀 비밀번호 변경 관련 함수들 (새로운 로직 적용) ---
    const handleChangePassword = () => {
        setIsChangingPassword(true);
        setIsChangingNickname(false);
        setIsEnteringClassCode(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordError("");
        setPasswordSuccess(false);
        setShowUserMenu(false);
    };

    const cancelPasswordChange = () => {
        setIsChangingPassword(false);
    };

    const savePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) return setPasswordError("모든 필드를 입력해주세요.");
        if (newPassword.length < 6) return setPasswordError("새 비밀번호는 6자 이상이어야 합니다.");
        if (newPassword === currentPassword) return setPasswordError("새 비밀번호가 현재 비밀번호와 동일합니다.");
        if (newPassword !== confirmPassword) return setPasswordError("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");

        setIsLoading(true);
        setPasswordError('');
        setPasswordSuccess(false);

        try {
            // 🚀 [수정됨] 세 번째 인자로 true를 전달하여 재인증임을 알림
            await loginWithEmailPassword(user.email, currentPassword, true);

            // 2. 재인증 성공 시 비밀번호 변경
            await changePassword(newPassword);

            setPasswordSuccess(true);
            setTimeout(() => {
                cancelPasswordChange();
            }, 3000);

        } catch (error) {
            console.error("비밀번호 변경 중 오류:", error);
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                setPasswordError("현재 비밀번호가 올바르지 않습니다.");
            } else {
                setPasswordError(`오류가 발생했습니다: ${error.message}`);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // --- 학급 코드 입력/변경 관련 함수들 (기존 로직 유지) ---
    const handleEnterClassCodeClick = () => {
        setNewClassCodeInput(userDoc?.classCode || "");
        setIsEnteringClassCode(true);
        setIsChangingNickname(false);
        setIsChangingPassword(false);
        setClassCodeEntryError("");
        setClassCodeEntrySuccess(false);
        setIsVerifyingAndSavingCode(false);
        setShowUserMenu(false);
    };

    const cancelClassCodeEntry = () => {
        setIsEnteringClassCode(false);
        setNewClassCodeInput("");
        setClassCodeEntryError("");
        setClassCodeEntrySuccess(false);
        setIsVerifyingAndSavingCode(false);
    };

    const saveEnteredClassCode = async () => {
        const trimmedNewClassCode = newClassCodeInput.trim().toUpperCase();
        if (!trimmedNewClassCode) return setClassCodeEntryError("학급 코드를 입력해주세요.");
        if (trimmedNewClassCode === userDoc?.classCode) return setClassCodeEntryError("현재 학급 코드와 동일합니다.");
        if (trimmedNewClassCode.length < 2) return setClassCodeEntryError("학급 코드는 최소 2자 이상이어야 합니다.");
        if (trimmedNewClassCode.length > 20) return setClassCodeEntryError("학급 코드는 최대 20자까지 가능합니다.");

        setIsVerifyingAndSavingCode(true);
        setClassCodeEntryError("");
        setClassCodeEntrySuccess(false);

        try {
            const isValid = await verifyClassCode(trimmedNewClassCode);
            if (!isValid) {
                setClassCodeEntryError(`'${trimmedNewClassCode}'는 유효하지 않은 학급 코드입니다.`);
                setIsVerifyingAndSavingCode(false);
                return;
            }

            const success = await updateUser({ classCode: trimmedNewClassCode });
            if (success) {
                setClassCodeEntrySuccess(true);
                setTimeout(() => {
                    alert(`학급 코드가 '${trimmedNewClassCode}'로 성공적으로 변경되었습니다!`);
                    cancelClassCodeEntry();
                }, 1500);
            } else {
                setClassCodeEntryError("학급 코드 저장에 실패했습니다. 다시 시도해주세요.");
            }
        } catch (error) {
            console.error("[Header] 학급 코드 저장 중 오류:", error);
            setClassCodeEntryError(`처리 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            setIsVerifyingAndSavingCode(false);
        }
    };

    const handleClassCodeKeyPress = (event) => {
        if (event.key === "Enter" && !isVerifyingAndSavingCode) {
            event.preventDefault();
            saveEnteredClassCode();
        }
    };

    // --- 🚀 계정 삭제 관련 함수 (새로운 로직 적용) ---
    const handleDeleteAccount = async () => {
        setShowUserMenu(false);
        const confirmation = window.prompt("정말로 계정을 삭제하시려면 '계정삭제'라고 입력해주세요. 이 작업은 되돌릴 수 없습니다.");

        if (confirmation === '계정삭제') {
            const password = window.prompt("계정 삭제를 위해 현재 비밀번호를 입력해주세요.");
            if (password) {
                setIsLoading(true);
                try {
                    // 🚀 [수정됨] 재인증임을 알리기 위해 true 전달
                    await loginWithEmailPassword(user.email, password, true);
                    // 2. 재인증 성공 시 계정 삭제
                    await deleteCurrentUserAccount();
                    alert("계정이 성공적으로 삭제되었습니다. 자동으로 로그아웃됩니다.");
                    // AuthContext의 리스너가 로그아웃을 처리합니다.
                } catch (error) {
                    console.error("계정 삭제 오류:", error);
                    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                        alert("비밀번호가 올바르지 않아 계정을 삭제할 수 없습니다.");
                    } else if (error.code === 'auth/requires-recent-login') {
                        alert("보안을 위해 재로그인 후 다시 시도해주세요.");
                    } else {
                        alert(`계정 삭제 중 오류가 발생했습니다: ${error.message}`);
                    }
                } finally {
                    setIsLoading(false);
                }
            } else if (password !== null) { // 사용자가 '취소'를 누르지 않았을 경우
                alert("비밀번호를 입력해야 계정을 삭제할 수 있습니다.");
            }
        } else if (confirmation !== null) {
            alert("입력이 일치하지 않아 계정 삭제가 취소되었습니다.");
        }
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const displayName = userDoc?.name || userDoc?.nickname || user?.displayName || "사용자";

    // UI 렌더링 부분은 보내주신 원본 구조를 최대한 유지합니다.
    return (
        <header className="header" style={headerStyle}>
            <div className="header-left">
                <button onClick={toggleSidebar} className="menu-button">
                    <MenuIcon />
                    <span className="menu-text">메뉴</span>
                </button>
            </div>

            <div className="header-center">
                <a href="/" className="header-title">
                    Ineconomy<span className="highlight-text">s</span>U Clas
                    <span className="highlight-text">S</span>
                </a>
            </div>

            <div className="header-right" ref={userMenuRef}>
                {user ? (
                    <>
                        {/* 닉네임 변경 UI */}
                        {isChangingNickname && (
                            <div className="nickname-change-container">
                                <input
                                    type="text"
                                    value={newNickname}
                                    onChange={(e) => setNewNickname(e.target.value)}
                                    placeholder="새 닉네임 (2-12자)"
                                    maxLength={12}
                                    className="nickname-input"
                                    autoFocus
                                    disabled={isLoading}
                                />
                                {nicknameError && <div className="nickname-error">{nicknameError}</div>}
                                <div className="nickname-buttons">
                                    <button onClick={saveNickname} className="save-nickname-btn" disabled={isLoading}>
                                        {isLoading ? "저장중..." : "저장"}
                                    </button>
                                    <button onClick={cancelNicknameChange} className="cancel-nickname-btn" disabled={isLoading}>
                                        취소
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 비밀번호 변경 UI */}
                        {isChangingPassword && (
                            <div className="password-change-container">
                                <h3 className="change-form-title">비밀번호 변경</h3>
                                <div className="password-form">
                                    <div className="password-form-group">
                                        <label htmlFor="current-password">현재 비밀번호</label>
                                        <input
                                            type="password"
                                            id="current-password"
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            className="password-input"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="password-form-group">
                                        <label htmlFor="new-password">새 비밀번호</label>
                                        <input
                                            type="password"
                                            id="new-password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="password-input"
                                        />
                                    </div>
                                    <div className="password-form-group">
                                        <label htmlFor="confirm-password">비밀번호 확인</label>
                                        <input
                                            type="password"
                                            id="confirm-password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="password-input"
                                        />
                                    </div>
                                </div>
                                {passwordError && <div className="error-message">{passwordError}</div>}
                                {passwordSuccess && <div className="success-message">비밀번호가 성공적으로 변경되었습니다!</div>}
                                <div className="password-buttons">
                                    <button onClick={savePassword} className="save-password-btn" disabled={isLoading || passwordSuccess}>
                                        {isLoading ? "변경 중..." : "변경하기"}
                                    </button>
                                    <button onClick={cancelPasswordChange} className="cancel-password-btn">
                                        취소
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 학급 코드 입력/변경 UI */}
                        {isEnteringClassCode && (
                            <div className="classcode-entry-container">
                                <h3 className="change-form-title">학급 코드 입력/변경</h3>
                                <div className="form-group">
                                    <label htmlFor="new-class-code-input" className="form-label">
                                        학급 코드
                                        {userDoc?.classCode && <span className="current-code-hint">(현재: {userDoc.classCode})</span>}
                                    </label>
                                    <input
                                        type="text"
                                        id="new-class-code-input"
                                        value={newClassCodeInput}
                                        onChange={(e) => setNewClassCodeInput(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                                        onKeyPress={handleClassCodeKeyPress}
                                        placeholder="선생님께 받은 학급 코드를 입력하세요"
                                        className="form-input"
                                        autoFocus
                                        disabled={isVerifyingAndSavingCode}
                                        maxLength={20}
                                    />
                                    <div className="input-hint">
                                        • 영문자와 숫자만 입력 가능합니다 • 자동으로 대문자로 변환됩니다
                                    </div>
                                </div>
                                {classCodeEntryError && <div className="error-message inline-error">❌ {classCodeEntryError}</div>}
                                {classCodeEntrySuccess && <div className="success-message inline-success">✅ 학급 코드가 성공적으로 저장되었습니다!</div>}
                                <div className="form-buttons">
                                    <button onClick={saveEnteredClassCode} className="save-button" disabled={isVerifyingAndSavingCode || !newClassCodeInput.trim()}>
                                        {isVerifyingAndSavingCode ? "검증 중..." : "저장"}
                                    </button>
                                    <button onClick={cancelClassCodeEntry} className="cancel-button" disabled={isVerifyingAndSavingCode}>
                                        취소
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 사용자 정보 버튼 및 드롭다운 메뉴 */}
                        {!isChangingNickname && !isChangingPassword && !isEnteringClassCode && (
                            <button onClick={toggleUserMenu} className="my-info-button">
                                <UserIconPlaceholder
                                    userName={displayName}
                                    userId={user?.uid}
                                    avatarConfig={avatarConfig}
                                />
                                <span className="my-info-text">{displayName}</span>
                            </button>
                        )}

                        {showUserMenu && (
                            <div className="user-dropdown-menu">
                                <div className="user-info-section">
                                    <span className="nickname">
                                        {displayName}
                                        {isCurrentUserAdmin && <span className="admin-badge">관리자</span>}
                                    </span>
                                    <span className="class-code">
                                        학급코드: {userDoc?.classCode || "미지정"}
                                    </span>
                                </div>
                                <ul>
                                    <li><button onClick={() => { setShowAvatarEditor(true); setShowUserMenu(false); }}>👤 아바타 꾸미기</button></li>
                                    <li><button onClick={handleChangeNickname}>닉네임 변경</button></li>
                                    <li><button onClick={handleChangePassword}>비밀번호 변경</button></li>
                                    <li><button onClick={handleEnterClassCodeClick}>학급 코드 입력/변경</button></li>
                                    <li className="separator"></li>
                                    <li><button onClick={handleDeleteAccount} className="delete-account-button">계정 삭제</button></li>
                                    <li className="separator"></li>
                                    <li><button onClick={handleLogout} className="logout-button">로그아웃</button></li>
                                </ul>
                            </div>
                        )}
                    </>
                ) : (
                    <a href="/login" className="my-info-button login-link">
                        <span className="my-info-text">로그인</span>
                    </a>
                )}
            </div>

            {/* 아바타 에디터 모달 */}
            <AvatarEditor
                isOpen={showAvatarEditor}
                onClose={() => setShowAvatarEditor(false)}
                userId={user?.uid}
                onSave={(newConfig) => setAvatarConfig(newConfig)}
            />
        </header>
    );
});

// 🔥 [최적화] props가 변경될 때만 재렌더링되도록 메모이제이션
export default memo(Header, (prevProps, nextProps) => {
    return prevProps.isAdmin === nextProps.isAdmin &&
        prevProps.toggleSidebar === nextProps.toggleSidebar;
});