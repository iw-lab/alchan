import { logger } from './logger';
const API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY; // .env 파일에서 API 키를 불러옵니다.

export const searchVideos = async (query) => {
    if (!API_KEY) {
        throw new Error('YouTube API 키가 설정되지 않았습니다.');
    }

    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${API_KEY}&maxResults=10`);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error("YouTube API Error:", errorData);
        const reason = errorData?.error?.errors?.[0]?.reason;
        if (response.status === 403 || reason === 'quotaExceeded') {
            throw new Error('YouTube API 일일 사용량을 초과했습니다. 내일 다시 시도해주세요.');
        }
        throw new Error('YouTube 검색에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }

    const data = await response.json();
    return data.items || [];
};