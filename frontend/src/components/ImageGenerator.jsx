import React, { useState, useRef, useCallback } from 'react';
import { Wand2, Download } from 'lucide-react';
import { generateImage } from '../services/api';

const LOADING_STEPS = [
    "Analyzing your prompt...",
    "Enhancing with AI...",
    "Crafting your masterpiece...",
    "Finalizing image...",
];

const ImageGenerator = () => {
    const [prompt, setPrompt] = useState('');
    const [image, setImage] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState(0);
    const [error, setError] = useState('');

    // Keep interval ref so we can clear it on unmount or early exit
    const stepIntervalRef = useRef(null);

    const clearStepInterval = () => {
        if (stepIntervalRef.current) {
            clearInterval(stepIntervalRef.current);
            stepIntervalRef.current = null;
        }
    };

    const handleGenerate = useCallback(async (e) => {
        e.preventDefault();
        const trimmed = prompt.trim();
        if (!trimmed || loading) return;

        setLoading(true);
        setError('');
        setImage(null);
        setLoadingStep(0);

        // Cycle loading messages every 4 seconds
        stepIntervalRef.current = setInterval(() => {
            setLoadingStep((prev) => (prev + 1) % LOADING_STEPS.length);
        }, 4000);

        try {
            const data = await generateImage(trimmed);
            setImage(data.imageUrl);
        } catch (err) {
            const serverMsg = err.response?.data?.error;
            const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');

            setError(
                isTimeout
                    ? "Request timed out. Image generation is taking too long — please try again."
                    : serverMsg || "Failed to generate image. Please try again."
            );
        } finally {
            clearStepInterval();
            setLoading(false);
        }
    }, [prompt, loading]);

    const handlePromptChange = useCallback((e) => {
        setPrompt(e.target.value);
    }, []);

    const downloadImage = useCallback(() => {
        if (!image) return;
        const link = document.createElement('a');
        link.href = image;
        link.download = `ai-image-${Date.now()}.jpg`;
        link.click();
    }, [image]);

    return (
        <div className="main-content">
            <div style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
                    <h1 style={{ marginBottom: '1rem' }}>Generate AI Art</h1>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                        Transform your words into stunning visuals using high-quality AI models.
                    </p>

                    <form className="input-wrapper" onSubmit={handleGenerate} style={{ marginBottom: '2rem' }}>
                        <input
                            type="text"
                            placeholder="Describe what you want to see..."
                            value={prompt}
                            onChange={handlePromptChange}
                            disabled={loading}
                        />
                        <button type="submit" className="send-btn" disabled={loading || !prompt.trim()}>
                            {loading ? <div className="spinner"></div> : <Wand2 size={20} />}
                        </button>
                    </form>

                    {error && (
                        <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>
                    )}

                    <div style={{
                        width: '100%',
                        aspectRatio: '1',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '1rem',
                        overflow: 'hidden',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                    }}>
                        {image ? (
                            <>
                                <img
                                    src={image}
                                    alt="Generated"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                                <button className="download-btn" style={{ opacity: 1 }} onClick={downloadImage}>
                                    <Download size={20} />
                                </button>
                            </>
                        ) : (
                            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                                {loading ? LOADING_STEPS[loadingStep] : "Your image will appear here"}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageGenerator;
