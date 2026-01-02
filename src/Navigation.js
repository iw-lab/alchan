import React from "react";
import { Link, useLocation } from "react-router-dom";

const Navigation = () => {
  const location = useLocation();

  // 현재 경로에 따라 활성화된 메뉴 표시
  const isActive = (path) => {
    return location.pathname === path
      ? "bg-blue-100 text-blue-700"
      : "text-gray-700 hover:bg-gray-100";
  };

  return (
    <nav className="bg-white shadow">
      <div className="container mx-auto px-4">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <span className="text-xl font-bold text-blue-600">
                IneconomysU
              </span>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-4">
              <Link
                to="/"
                className={`inline-flex items-center px-3 py-2 rounded-md ${isActive(
                  "/"
                )}`}
              >
                메인 페이지
              </Link>
              <Link
                to="/real-estate"
                className={`inline-flex items-center px-3 py-2 rounded-md ${isActive(
                  "/real-estate"
                )}`}
              >
                부동산 등기부
              </Link>
              <Link
                to="/national-assembly"
                className={`inline-flex items-center px-3 py-2 rounded-md ${isActive(
                  "/national-assembly"
                )}`}
              >
                국회
              </Link>
              <Link
                to="/stock-exchange"
                className={`inline-flex items-center px-3 py-2 rounded-md ${isActive(
                  "/stock-exchange"
                )}`}
              >
                주식거래소
              </Link>
              <Link
                to="/police"
                className={`inline-flex items-center px-3 py-2 rounded-md ${isActive(
                  "/police"
                )}`}
              >
                경찰서
              </Link>
            </div>
          </div>
          <div className="flex items-center">
            <div className="text-sm font-medium text-gray-500">
              보유 현금: 924,898원
            </div>
          </div>
        </div>
      </div>

      {/* 모바일 메뉴 */}
      <div className="sm:hidden">
        <div className="px-2 pt-2 pb-3 space-y-1">
          <Link
            to="/"
            className={`block px-3 py-2 rounded-md ${isActive(
              "/"
            )} text-base font-medium`}
          >
            메인 페이지
          </Link>
          <Link
            to="/real-estate"
            className={`block px-3 py-2 rounded-md ${isActive(
              "/real-estate"
            )} text-base font-medium`}
          >
            부동산 등기부
          </Link>
          <Link
            to="/national-assembly"
            className={`block px-3 py-2 rounded-md ${isActive(
              "/national-assembly"
            )} text-base font-medium`}
          >
            국회
          </Link>
          <Link
            to="/stock-exchange"
            className={`block px-3 py-2 rounded-md ${isActive(
              "/stock-exchange"
            )} text-base font-medium`}
          >
            주식거래소
          </Link>
          <Link
            to="/police"
            className={`block px-3 py-2 rounded-md ${isActive(
              "/police"
            )} text-base font-medium`}
          >
            경찰서
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
