import { logger } from './logger';
const API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY;

const CACHE_TTL = 30 * 60 * 1000; // 30분
const getCacheKey = (query) => `yt_search_${query.trim().toLowerCase()}`;

const getCachedResults = (query) => {
  try {
    const item = localStorage.getItem(getCacheKey(query));
    if (!item) return null;
    const { data, timestamp } = JSON.parse(item);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(getCacheKey(query));
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

const setCachedResults = (query, data) => {
  try {
    localStorage.setItem(getCacheKey(query), JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // localStorage 용량 초과 등, 무시
  }
};

export const searchVideos = async (query) => {
  // 캐시 먼저 확인 (30분 TTL)
  const cached = getCachedResults(query);
  if (cached) {
    logger.log('[YouTube] 캐시에서 결과 반환:', query);
    return cached;
  }

  if (!API_KEY) {
    throw new Error('YouTube API 키가 설정되지 않았습니다.');
  }

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${API_KEY}&maxResults=10`
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    logger.error("YouTube API Error:", errorData);
    const reason = errorData?.error?.errors?.[0]?.reason;
    if (response.status === 403 || reason === 'quotaExceeded') {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw new Error('YouTube 검색에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }

  const data = await response.json();
  const items = data.items || [];

  // 결과 캐시에 저장
  setCachedResults(query, items);
  return items;
};

// YouTube URL 또는 ID에서 videoId 추출
export const parseVideoId = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace('/', '').trim();
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    const id = url.searchParams.get('v');
    return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null;
  } catch {
    return null;
  }
};
