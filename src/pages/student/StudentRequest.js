import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { searchVideos } from '../../utils/youtube-api';

const StudentRequest = () => {
    const { roomId } = useParams();
    const [roomName, setRoomName] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [videos, setVideos] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [requesterName, setRequesterName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [requestSuccess, setRequestSuccess] = useState(false); // 신청 성공 상태 추가
    const navigate = useNavigate();

    useEffect(() => {
        const fetchRoomInfo = async () => {
            const roomDoc = await getDoc(doc(db, 'musicRooms', roomId));
            if (roomDoc.exists()) {
                setRoomName(roomDoc.data().name);
            } else {
                setError('존재하지 않는 방입니다.');
            }
        };
        fetchRoomInfo();
    }, [roomId]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchTerm.trim()) return;
        setIsLoading(true);
        setError('');
        try {
            const results = await searchVideos(searchTerm);
            setVideos(results);
            setRequestSuccess(false); // 새로운 검색 시 성공 상태 초기화
        } catch (err) {
            setError('YouTube 영상을 검색하는 중 오류가 발생했습니다.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRequest = async () => {
        if (!selectedVideo || !requesterName.trim()) {
            alert('영상과 신청자 이름을 모두 입력해주세요.');
            return;
        }
        try {
            await addDoc(collection(db, 'musicRooms', roomId, 'playlist'), {
                videoId: selectedVideo.id.videoId,
                title: selectedVideo.snippet.title,
                requesterName: requesterName.trim(),
                requestedAt: serverTimestamp()
            });
            setRequestSuccess(true); // 신청 성공 상태로 변경
        } catch (err) {
            setError('음악을 신청하는 중 오류가 발생했습니다.');
            console.error(err);
        }
    };

    const resetForNextRequest = () => {
        setRequestSuccess(false);
        setSelectedVideo(null);
        setSearchTerm('');
        setVideos([]);
    };

    if (error) {
        return <div className="student-request-container error-container">{error}</div>;
    }

    return (
        <div className="student-request-container">
            <h2>{roomName}</h2>
            
            {requestSuccess ? (
                <div className="success-section">
                    <h3>"{selectedVideo.snippet.title}"</h3>
                    <p>음악 신청이 완료되었습니다!</p>
                    <div className="success-actions">
                        <button onClick={resetForNextRequest} className="action-btn continue-btn">계속 신청하기</button>
                        <button onClick={() => navigate('/learning-board/music-request')} className="action-btn back-btn">돌아가기</button>
                    </div>
                </div>
            ) : (
                <>
                    <form onSubmit={handleSearch} className="search-form">
                        <input
                            type="text"
                            className="search-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="신청할 노래 제목이나 아티스트를 검색하세요"
                        />
                        <button type="submit" className="search-btn" disabled={isLoading}>
                            {isLoading ? '검색 중...' : '검색'}
                        </button>
                    </form>

                    {videos.length > 0 && (
                        <div className="search-results">
                            <h4>검색 결과</h4>
                            <ul className="video-list">
                                {videos.map(video => (
                                    <li
                                        key={video.id.videoId}
                                        className={`video-item ${selectedVideo?.id.videoId === video.id.videoId ? 'selected' : ''}`}
                                        onClick={() => setSelectedVideo(video)}
                                    >
                                        <img src={video.snippet.thumbnails.default.url} alt={video.snippet.title} />
                                        <p>{video.snippet.title}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {selectedVideo && (
                        <div className="request-section">
                            <h4>신청 정보</h4>
                            <p>선택된 곡: {selectedVideo.snippet.title}</p>
                            <input
                                type="text"
                                className="requester-name-input"
                                value={requesterName}
                                onChange={(e) => setRequesterName(e.target.value)}
                                placeholder="신청자 이름을 입력하세요"
                            />
                            <button onClick={handleRequest} className="request-btn">
                                이 곡으로 신청하기
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default StudentRequest;