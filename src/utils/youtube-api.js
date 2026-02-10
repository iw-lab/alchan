import { logger } from './logger';
const API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY; // .env 파일에서 API 키를 불러옵니다.

export const searchVideos = async (query) => {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${API_KEY}&maxResults=10`);
    
    if (!response.ok) {
        const errorData = await response.json();
        logger.error("YouTube API Error:", errorData);
        throw new Error('YouTube 영상을 검색하는 데 실패했습니다. API 키나 요청을 확인해주세요.');
    }
    
    const data = await response.json();
    return data.items;
};