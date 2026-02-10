// src/BankingProductService.js
import { convertAdminProductsToAccountFormat } from "./BankingProductAdapter";
import { logger } from '../../utils/logger';

/**
 * 뱅킹 상품 정보를 가져오고 관리하는 서비스
 */
export class BankingProductService {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.products = null;
  }

  /**
   * 전체 상품 목록을 가져옵니다.
   * 로컬 스토리지에 데이터가 있으면 로컬 스토리지를 우선 사용하고, 없으면 API를 호출합니다.
   *
   * @returns {Promise<Array>} - 상품 목록
   */
  async getAllProducts() {
    // 로컬 스토리지에서 먼저 상품 정보를 불러옵니다.
    let localDepositProducts, localSavingProducts, localLoanProducts;
    try {
      localDepositProducts = JSON.parse(localStorage.getItem("depositProducts"));
      localSavingProducts = JSON.parse(localStorage.getItem("savingProducts"));
      localLoanProducts = JSON.parse(localStorage.getItem("loanProducts"));
    } catch {
      localDepositProducts = null;
      localSavingProducts = null;
      localLoanProducts = null;
    }

    // 로컬 스토리지에 데이터가 있으면 로컬 데이터를 우선적으로 사용합니다.
    if (localDepositProducts || localSavingProducts || localLoanProducts) {
      const localProducts = {
        deposits: localDepositProducts || [],
        savings: localSavingProducts || [],
        loans: localLoanProducts || [],
      };
      this.products = convertAdminProductsToAccountFormat(localProducts);
      return this.products;
    }

    // 캐시된 데이터가 있으면 반환
    if (this.products) {
      return this.products;
    }

    // 로컬 스토리지에 데이터가 없으면 API를 통해 가져옵니다.
    try {
      const response = await this.apiClient.get("/banking/products");
      this.products = convertAdminProductsToAccountFormat(response.data);

      // API에서 가져온 데이터를 로컬 스토리지에 저장하여 초기화합니다.
      localStorage.setItem("depositProducts", JSON.stringify(response.data.deposits || []));
      localStorage.setItem("savingProducts", JSON.stringify(response.data.savings || []));
      localStorage.setItem("loanProducts", JSON.stringify(response.data.loans || []));

      return this.products;
    } catch (error) {
      logger.error("상품 목록을 가져오는데 실패했습니다:", error);
      return [];
    }
  }

  /**
   * 상품 유형에 따라 필터링된 상품 목록을 가져옵니다.
   *
   * @param {string} productType - 상품 유형 ('deposit', 'savings', 'loan')
   * @returns {Promise<Array>} - 필터링된 상품 목록
   */
  async getProductsByType(productType) {
    const allProducts = await this.getAllProducts();
    return allProducts.filter((product) => product.productType === productType);
  }

  /**
   * 상품 ID로 특정 상품 정보를 가져옵니다.
   *
   * @param {string|number} productId - 상품 ID
   * @returns {Promise<Object|null>} - 상품 정보
   */
  async getProductById(productId) {
    const allProducts = await this.getAllProducts();
    return (
      allProducts.find(
        (product) => product.id.toString() === productId.toString()
      ) || null
    );
  }
}