import { logger } from './logger';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY;

const LOCAL_CACHE_TTL = 30 * 60 * 1000; // 30분 (기기별 localStorage)
const SHARED_CACHE_TTL = 12 * 60 * 60 * 1000; // 12시간 (학급 공유 Firestore)

// 검색어 정규화: 같은 의미의 검색을 한 캐시 키로 모은다.
const normalizeQuery = (q) => (q || '').trim().toLowerCase().replace(/\s+/g, ' ');

const getLocalCacheKey = (query) => `yt_search_${normalizeQuery(query)}`;

// Firestore 문서 id로 안전한 키: 금지문자 '/'만 '_'로 치환(한글·공백은 ID에 허용) +
// 접두사 q_ 로 빈문자/'.'/'..'/'__x__' 예약패턴 회피 + 1500바이트 한도 안전 위해 길이 캡
const getSharedDocId = (query) =>
  `q_${normalizeQuery(query).replace(/\//g, '_').slice(0, 300)}`;

// 학급 공유 quota 상태: 한 학생이 한도를 맞으면 다른 학생도 헛검색 없이 바로 안내받는다.
// YouTube quota는 태평양시 자정에 리셋되므로 PT 날짜로 유효기간을 판단한다.
const ptDate = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const quotaStateRef = () => doc(db, 'youtubeSearchCache', '_quotaState');

// 오늘(PT) 검색 한도가 소진됐는지 — StudentRequest 진입 시 확인해 URL 탭으로 유도.
export const getQuotaExhausted = async () => {
  try {
    const snap = await getDoc(quotaStateRef());
    if (!snap.exists()) return false;
    const d = snap.data();
    return d.exhausted === true && d.ptDate === ptDate();
  } catch {
    return false;
  }
};

const markQuotaExhausted = async () => {
  try {
    await setDoc(quotaStateRef(), {
      exhausted: true,
      ptDate: ptDate(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // 무시 — 표시는 호출자가 throw로 처리
  }
};

const getLocalCached = (query) => {
  try {
    const item = localStorage.getItem(getLocalCacheKey(query));
    if (!item) return null;
    const { data, timestamp } = JSON.parse(item);
    if (Date.now() - timestamp > LOCAL_CACHE_TTL) {
      localStorage.removeItem(getLocalCacheKey(query));
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

const setLocalCached = (query, data) => {
  try {
    localStorage.setItem(
      getLocalCacheKey(query),
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {
    // localStorage 용량 초과 등, 무시
  }
};

export const searchVideos = async (query) => {
  // 1) 로컬 캐시 (기기별, Firestore 읽기 0)
  const localCached = getLocalCached(query);
  if (localCached) {
    logger.log('[YouTube] 로컬 캐시에서 반환:', query);
    return localCached;
  }

  // 2) Firestore 공유 캐시 (학급 전체 공유 — 읽기 1회는 YouTube 검색 100 units보다 압도적으로 저렴)
  try {
    const sharedRef = doc(db, 'youtubeSearchCache', getSharedDocId(query));
    const snap = await getDoc(sharedRef);
    if (snap.exists()) {
      const d = snap.data();
      const ts = d.cachedAt?.toMillis?.() ?? 0;
      if (Array.isArray(d.items) && Date.now() - ts < SHARED_CACHE_TTL) {
        logger.log('[YouTube] 공유 캐시 HIT:', query);
        setLocalCached(query, d.items); // 같은 기기 재검색은 다음부터 읽기 0
        return d.items;
      }
    }
  } catch (e) {
    logger.warn('[YouTube] 공유 캐시 조회 실패(무시):', e?.message);
  }

  if (!API_KEY) {
    throw new Error('YouTube API 키가 설정되지 않았습니다.');
  }

  // 3) YouTube Data API 호출 (search.list = 100 units)
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${API_KEY}&maxResults=10`
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    logger.error("YouTube API Error:", errorData);
    const reason = errorData?.error?.errors?.[0]?.reason;
    // 일일 한도 초과: 403 quotaExceeded 또는 429 rateLimitExceeded
    if (
      response.status === 403 ||
      response.status === 429 ||
      reason === 'quotaExceeded' ||
      reason === 'rateLimitExceeded'
    ) {
      markQuotaExhausted(); // 학급 공유 플래그 기록(fire-and-forget)
      throw new Error('QUOTA_EXCEEDED');
    }
    throw new Error('YouTube 검색에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }

  const data = await response.json();
  const items = data.items || [];

  // 양쪽 캐시에 기록 (공유 캐시 저장 실패는 무시 — 검색 자체는 성공)
  setLocalCached(query, items);
  try {
    await setDoc(doc(db, 'youtubeSearchCache', getSharedDocId(query)), {
      query: normalizeQuery(query),
      items,
      cachedAt: serverTimestamp(),
    });
  } catch (e) {
    logger.warn('[YouTube] 공유 캐시 저장 실패(무시):', e?.message);
  }

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
