// src/UserService.js
// 사용자 데이터 관리를 위한 서비스

// 로컬 스토리지 키
import { logger } from '../utils/logger';
const USERS_STORAGE_KEY = "learningSystemUsers";

// 초기 사용자 데이터 (로컬 스토리지에 데이터가 없을 경우 사용)
const initialUsers = [
  {
    id: "user1",
    name: "김민준",
    role: "student",
    coupons: 0,
    email: "minjun@example.com",
    classCode: "A-101",
  },
  {
    id: "user2",
    name: "이서연",
    role: "student",
    coupons: 0,
    email: "seoyeon@example.com",
    classCode: "B-202",
  },
  {
    id: "admin1",
    name: "관리자",
    role: "admin",
    isAdmin: true,
    coupons: 0,
    email: "admin@example.com",
    classCode: "ADMIN",
  },
  {
    id: "homework1",
    name: "숙제관리인",
    role: "homework_manager",
    job: "숙제관리인",
    coupons: 0,
    email: "homework@example.com",
    classCode: "STAFF",
  },
];

/**
 * 모든 사용자를 가져오는 함수
 * @returns {Promise<Array>} 사용자 목록
 */
export const getUsers = async () => {
  return new Promise((resolve) => {
    // 실제 애플리케이션에서는 API 호출이 있겠지만,
    // 예시에서는 로컬 스토리지를 사용합니다.
    try {
      const usersJson = localStorage.getItem(USERS_STORAGE_KEY);
      let users;

      if (usersJson) {
        users = JSON.parse(usersJson);
      } else {
        // 초기 데이터가 없으면 기본 사용자 목록 사용
        users = initialUsers;
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
      }

      // 서버 응답 시뮬레이션을 위한 짧은 지연
      setTimeout(() => {
        resolve(users);
      }, 300);
    } catch (error) {
      logger.error("사용자 데이터 로드 오류:", error);
      // 오류 발생 시 초기 데이터 반환
      resolve(initialUsers);
    }
  });
};

/**
 * 특정 사용자의 쿠폰 수량을 업데이트하는 함수
 * @param {string} userId - 사용자 ID
 * @param {number} amount - 추가할 쿠폰 개수
 * @returns {Promise<Object>} 업데이트된 사용자 객체
 */
export const updateUserCoupons = async (userId, amount) => {
  return new Promise((resolve, reject) => {
    try {
      // 현재 사용자 목록 가져오기
      const usersJson = localStorage.getItem(USERS_STORAGE_KEY);
      let users = usersJson ? JSON.parse(usersJson) : initialUsers;

      // 해당 사용자 찾기
      const userIndex = users.findIndex((user) => user.id === userId);

      if (userIndex === -1) {
        throw new Error(`사용자 ID(${userId})를 찾을 수 없습니다.`);
      }

      // 사용자 쿠폰 업데이트
      users[userIndex] = {
        ...users[userIndex],
        coupons: (users[userIndex].coupons || 0) + amount,
      };

      // 업데이트된 사용자 목록 저장
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));

      // 서버 응답 시뮬레이션을 위한 짧은 지연
      setTimeout(() => {
        resolve(users[userIndex]);
      }, 300);
    } catch (error) {
      logger.error("쿠폰 업데이트 오류:", error);
      reject(error);
    }
  });
};

/**
 * 사용자 상세 정보를 가져오는 함수
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} 사용자 객체
 */
export const getUserById = async (userId) => {
  return new Promise((resolve, reject) => {
    try {
      const usersJson = localStorage.getItem(USERS_STORAGE_KEY);
      let users = usersJson ? JSON.parse(usersJson) : initialUsers;

      const user = users.find((user) => user.id === userId);

      if (!user) {
        throw new Error(`사용자 ID(${userId})를 찾을 수 없습니다.`);
      }

      // 서버 응답 시뮬레이션을 위한 짧은 지연
      setTimeout(() => {
        resolve(user);
      }, 200);
    } catch (error) {
      logger.error("사용자 조회 오류:", error);
      reject(error);
    }
  });
};

/**
 * 사용자 정보를 업데이트하는 함수
 * @param {string} userId - 업데이트할 사용자의 ID
 * @param {object} updatedData - 업데이트할 사용자 정보 객체
 * @returns {Promise<object>} 업데이트된 사용자 객체
 */
export const updateUser = async (userId, updatedData) => {
  return new Promise((resolve, reject) => {
    try {
      const usersJson = localStorage.getItem(USERS_STORAGE_KEY);
      let users = usersJson ? JSON.parse(usersJson) : initialUsers;

      const userIndex = users.findIndex((user) => user.id === userId);

      if (userIndex === -1) {
        throw new Error(`사용자 ID(${userId})를 찾을 수 없습니다.`);
      }

      // 기존 사용자 정보에 새로운 데이터를 병합
      users[userIndex] = { ...users[userIndex], ...updatedData };

      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));

      setTimeout(() => {
        resolve(users[userIndex]);
      }, 200);
    } catch (error) {
      logger.error("사용자 정보 업데이트 오류:", error);
      reject(error);
    }
  });
};