import React, { useState, useEffect, useCallback } from 'react';
import { Film, Download, Trash2 } from 'lucide-react';
import { getVideos, deleteVideo } from '../services/videoApi';

const VideoGallery = () => {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        getVideos()
            .then(setVideos)
            .catch(() => setError('Failed to load videos.'))
            .finally(() => setLoading(false));
    }, []);

    const handleDelete = useCallback(async (id) => {
        try {
            await deleteVideo(id);
            setVideos(prev => prev.filter(v => v._id !== id));
        } catch {
            setError('Failed to delete video. Please try again.');
        }
    }, []);

    const handleDownload = useCallback((videoUrl, createdAt) => {
        const link = document.createElement('a');
        link.href = videoUrl;
        link.download = `ai-video-${new Date(createdAt).getTime()}.mp4`;
        link.click();
    }, []);

    return (
        <div className="main-content" style={{ overflowY: 'auto' }}>
            <div style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                    <Film size={32} style={{ color: 'var(--accent-primary)' }} />
                    <h1>Video Gallery</h1>
                </div>

                {error && (
                    <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>
                )}

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                        <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
                    </div>
                ) : videos.length > 0 ? (
                    <div className="image-grid">
                        {videos.map(video => (
                            <div key={video._id} className="image-card">
                                <video
                                    src={video.videoUrl}
                                    controls
                                    loop
                                    style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }}
                                />
                                <div className="image-info">
                                    <p className="image-prompt">{video.prompt}</p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                        {new Date(video.createdAt).toLocaleString()}
                                    </p>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                        <button
                                            onClick={() => handleDownload(video.videoUrl, video.createdAt)}
                                            className="send-btn"
                                            style={{ flex: 1, padding: '0.5rem', gap: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <Download size={16} /> Download
                                        </button>
                                        <button
                                            onClick={() => handleDelete(video._id)}
                                            style={{
                                                flex: 1,
                                                padding: '0.5rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.4rem',
                                                background: 'transparent',
                                                border: '1px solid #ef4444',
                                                color: '#ef4444',
                                                borderRadius: '0.5rem',
                                                cursor: 'pointer',
                                                transition: 'var(--transition)',
                                            }}
                                        >
                                            <Trash2 size={16} /> Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                        <p>No videos generated yet. Start creating!</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VideoGallery;
