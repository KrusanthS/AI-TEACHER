import React from 'react';
import { Download } from 'lucide-react';

const ImageCard = ({ image }) => {
    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = image.imageUrl;
        link.download = `ai-image-${image._id}.png`;
        link.click();
    };

    return (
        <div className="image-card">
            <img src={image.imageUrl} alt={image.prompt} loading="lazy" />
            <div className="image-info">
                <p className="image-prompt" title={image.prompt}>{image.prompt}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    {new Date(image.createdAt).toLocaleDateString()}
                </p>
            </div>
            <button className="download-btn" onClick={handleDownload}>
                <Download size={18} />
            </button>
        </div>
    );
};

export default ImageCard;
