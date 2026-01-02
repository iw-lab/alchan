// src/BankingProductAdapter.js

/**
 * 관리자 인터페이스에서 사용하는 상품 목록 형식을
 * ParkingAccount 컴포넌트에서 사용하는 형식으로 변환합니다.
 *
 * @param {Array<Object>} adminProducts - 관리자 형식의 상품 배열
 * - 예: { id, name, dailyRate, annualRate, termInDays, minAmount?, maxAmount? }
 * @returns {Array<Object>} ParkingAccount 형식의 상품 배열
 * - 예: { id, name, rate (dailyRate), term (termInDays), minAmount?, maxAmount? }
 */
export const convertAdminProductsToAccountFormat = (adminProducts) => {
  if (!Array.isArray(adminProducts)) {
    console.error(
      "BankingProductAdapter: adminProducts가 배열이 아닙니다.",
      adminProducts
    );
    return [];
  }

  return adminProducts.map((product) => {
    // 일별 이자율을 직접 사용 (연이율에서 일이율로 변환)
    const dailyRate =
      product.dailyRate !== undefined && !isNaN(parseFloat(product.dailyRate))
        ? parseFloat(product.dailyRate)
        : parseFloat((parseFloat(product.annualRate) / 365).toFixed(6));

    return {
      id: product.id,
      name: product.name,
      // 일단위 이율(%)을 'rate' 필드로 전달
      rate: dailyRate,
      // 기간(일)을 'term' 필드로 전달
      term: product.termInDays,
      // 최소/최대 금액은 그대로 전달
      minAmount: product.minAmount,
      maxAmount: product.maxAmount,
      // 상품 타입 추가 (예금, 적금, 대출)
      productType: product.productType || "deposit",
    };
  });
};
