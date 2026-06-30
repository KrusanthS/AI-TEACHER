import React, { useState, useEffect } from 'react';
import { getHistory } from '../services/api';
import ImageCard from '../components/ImageCard';
import { LayoutGrid } from 'lucide-react';

const Gallery = () => {
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchImages = async () => {
            try {
                const data = await getHistory();
                setImages(data);
            } catch (error) {
                console.error("Error fetching gallery:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchImages();
    }, []);

    return (
        <div className="main-content" style={{ overflowY: 'auto' }}>
            <div style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                    <LayoutGrid size={32} className="accent-text" />
                    <h1>Generated Gallery</h1>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                        <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
                    </div>
                ) : images.length > 0 ? (
                    <div className="image-grid">
                        {images.map(img => (
                            <ImageCard key={img._id} image={img} />
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                        <p>No images generated yet. Start creating!</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Gallery;
