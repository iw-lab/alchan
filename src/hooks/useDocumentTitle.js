import { useEffect } from 'react';

const BASE_TITLE = '알찬 - 학급경제 시뮬레이션';

/**
 * SEO: 페이지별 document.title 설정 훅
 * 검색엔진과 브라우저 탭에 페이지별 제목을 표시합니다.
 * @param {string} pageTitle - 페이지 제목 (예: '로그인', '개인정보처리방침')
 */
export function useDocumentTitle(pageTitle) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = pageTitle ? `${pageTitle} | ${BASE_TITLE}` : BASE_TITLE;

    return () => {
      document.title = previousTitle;
    };
  }, [pageTitle]);
}

export default useDocumentTitle;
