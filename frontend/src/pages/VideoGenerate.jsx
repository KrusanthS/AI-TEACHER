import React, { useState, useRef, useCallback } from 'react';
import { Video, Download, Sparkles, Clock, Film, CheckCircle2 } from 'lucide-react';
import { generateVideo, pollVideoJob } from '../services/videoApi';

const POLL_INTERVAL_MS = 3000;

// Hard-capped at 30s — this pipeline tries real AI motion clips first
// (free Hugging Face quota), falling back to animated AI images, so videos
// stay free regardless of which preset is picked.
const DURATION_PRESETS = [
    { label: '10s', value: 10 },
    { label: '15s', value: 15 },
    { label: '20s', value: 20 },
    { label: '30s', value: 30 },
];

const PHASE_LABEL = {
    script: 'Writing script with free AI...',
    rendering: 'Rendering scenes (free images + narration)...',
    merging: 'Stitching final long-form video...',
    completed: 'Done!',
    failed: 'Generation failed',
};

const VideoGenerate = () => {
    const [prompt, setPrompt] = useState('');
    const [duration, setDuration] = useState(20);
    const [status, setStatus] = useState('idle'); // idle | processing | completed | failed
    const [videoUrl, setVideoUrl] = useState(null);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState({ phase: 'script', completedScenes: 0, totalScenes: 0 });
    const pollRef = useRef(null);

    const stopPolling = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    };

    const handleGenerate = useCallback(async (e) => {
        e.preventDefault();
        const trimmed = prompt.trim();
        if (!trimmed || status === 'processing') return;

        setStatus('processing');
        setError('');
        setVideoUrl(null);
        setProgress({ phase: 'script', completedScenes: 0, totalScenes: 0 });

        let jobId;
        try {
            const data = await generateVideo(trimmed, duration);
            jobId = data.jobId;
            setProgress((p) => ({ ...p, totalScenes: data.totalScenes || 0 }));
        } catch (err) {
            const msg = err.response?.data?.error;
            setError(msg || 'Failed to start video generation. Please try again.');
            setStatus('failed');
            return;
        }

        pollRef.current = setInterval(async () => {
            try {
                const job = await pollVideoJob(jobId);
                setProgress({
                    phase: job.phase || 'rendering',
                    completedScenes: job.completedScenes || 0,
                    totalScenes: job.totalScenes || 0,
                });

                if (job.status === 'completed') {
                    stopPolling();
                    setVideoUrl(job.videoUrl);
                    setStatus('completed');
                } else if (job.status === 'failed') {
                    stopPolling();
                    setError(job.errorMessage || 'Video generation failed. Please try a different prompt.');
                    setStatus('failed');
                }
            } catch {
                // transient poll error — keep trying, free public endpoints can hiccup
            }
        }, POLL_INTERVAL_MS);
    }, [prompt, duration, status]);

    const downloadVideo = () => {
        if (!videoUrl) return;
        const link = document.createElement('a');
        link.href = videoUrl;
        link.download = `ai-video-${Date.now()}.mp4`;
        link.click();
    };

    const percentDone = progress.totalScenes
        ? Math.min(100, Math.round((progress.completedScenes / progress.totalScenes) * 100))
        : 0;

    return (
        <div className="main-content" style={{ overflowY: 'auto' }}>
            <div style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ maxWidth: '720px', width: '100%' }}>

                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.35rem 0.9rem', borderRadius: '999px',
                            background: 'rgba(59,130,246,0.12)', border: '1px solid var(--accent-primary)',
                            color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '1rem',
                        }}>
                            <Sparkles size={14} /> 100% Free — no credits, no API cost
                        </div>
                        <h1 style={{ marginBottom: '0.5rem' }}>Generate a Free AI Video</h1>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            Describe a topic and get a narrated video up to 30 seconds — real AI motion
                            clips where available, animated AI scenes otherwise, all at zero cost.
                        </p>
                    </div>

                    <form onSubmit={handleGenerate} style={{ marginBottom: '1.5rem' }}>
                        <div className="input-wrapper" style={{ marginBottom: '1rem' }}>
                            <input
                                type="text"
                                placeholder="e.g. The history of the Roman Empire, explained simply"
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                disabled={status === 'processing'}
                            />
                            <button type="submit" className="send-btn" disabled={status === 'processing' || !prompt.trim()}>
                                {status === 'processing' ? <div className="spinner"></div> : <Video size={20} />}
                            </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                <Clock size={15} /> Length:
                            </span>
                            {DURATION_PRESETS.map((p) => (
                                <button
                                    key={p.value}
                                    type="button"
                                    disabled={status === 'processing'}
                                    onClick={() => setDuration(p.value)}
                                    style={{
                                        padding: '0.35rem 0.85rem',
                                        borderRadius: '999px',
                                        fontSize: '0.82rem',
                                        cursor: status === 'processing' ? 'not-allowed' : 'pointer',
                                        border: duration === p.value ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                                        background: duration === p.value ? 'var(--accent-primary)' : 'transparent',
                                        color: duration === p.value ? '#fff' : 'var(--text-secondary)',
                                        transition: 'var(--transition)',
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </form>

                    {error && (
                        <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>
                    )}

                    <div style={{
                        width: '100%',
                        aspectRatio: '16/9',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '1rem',
                        overflow: 'hidden',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                    }}>
                        {status === 'completed' && videoUrl ? (
                            <>
                                <video
                                    src={videoUrl}
                                    controls
                                    autoPlay
                                    style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                                />
                                <button className="download-btn" style={{ opacity: 1 }} onClick={downloadVideo}>
                                    <Download size={20} />
                                </button>
                            </>
                        ) : (
                            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem', width: '100%' }}>
                                {status === 'processing' && (
                                    <>
                                        <Film size={36} style={{ marginBottom: '0.75rem', color: 'var(--accent-primary)' }} />
                                        <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {PHASE_LABEL[progress.phase] || 'Working...'}
                                        </p>
                                        {progress.totalScenes > 0 && (
                                            <div style={{ maxWidth: '320px', margin: '1rem auto 0' }}>
                                                <div style={{
                                                    height: '8px', borderRadius: '999px', background: 'var(--border-color)', overflow: 'hidden',
                                                }}>
                                                    <div style={{
                                                        height: '100%', width: `${percentDone}%`,
                                                        background: 'var(--accent-primary)', transition: 'width 0.4s ease',
                                                    }} />
                                                </div>
                                                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                                    Scene {progress.completedScenes} of {progress.totalScenes}
                                                </p>
                                            </div>
                                        )}
                                        <p style={{ fontSize: '0.75rem', marginTop: '1rem', opacity: 0.7 }}>
                                            Long-form videos can take a few minutes — each scene is rendered with real narration.
                                        </p>
                                    </>
                                )}
                                {status === 'idle' && (
                                    <>
                                        <Video size={36} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                        <p>Your video will appear here</p>
                                    </>
                                )}
                                {status === 'failed' && <p style={{ color: '#ef4444' }}>Generation failed</p>}
                            </div>
                        )}
                    </div>

                    {status === 'completed' && (
                        <p style={{ marginTop: '1rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                            <CheckCircle2 size={16} /> Generation Complete
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VideoGenerate;
