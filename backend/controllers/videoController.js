const Video = require('../models/Video');
const { generateVideo } = require('../services/videoService');
const {
    MIN_DURATION,
    MAX_DURATION,
    DEFAULT_DURATION,
    WORDS_PER_SECOND,
    MIN_SCENE_DURATION,
    MAX_SCENE_DURATION,
} = require('../config/videoConfig');

// Compute how many scenes a long-form video should be split into, and the
// nominal length of each scene. The actual per-scene clip length is later
// adjusted by videoService to match each scene's narration audio duration,
// so this is just a starting point used for the LLM script request.
const calcScenes = (duration) => {
    const d = Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(duration)));
    const targetSceneDuration = Math.min(
        MAX_SCENE_DURATION,
        Math.max(MIN_SCENE_DURATION, Math.round((MIN_SCENE_DURATION + MAX_SCENE_DURATION) / 2))
    );
    const count = Math.max(2, Math.round(d / targetSceneDuration));
    const perScene = Math.round(d / count);
    return { count, perScene, totalDuration: d };
};

// POST /api/generate-video
const handleGenerateVideo = async (req, res) => {
    const { prompt, duration } = req.body;
    if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: 'Prompt is required.' });
    }

    const rawDuration = Number(duration);
    const requestedDuration = (!duration || isNaN(rawDuration) || rawDuration <= 0)
        ? DEFAULT_DURATION
        : rawDuration;

    const { count: sceneCount, perScene: sceneDuration, totalDuration } = calcScenes(requestedDuration);

    console.log(
        `[Video] Duration requested: ${requestedDuration}s → ${sceneCount} scenes (~${sceneDuration}s each, total ~${totalDuration}s)`
    );

    const video = await Video.create({
        prompt: prompt.trim(),
        status: 'processing',
        duration: totalDuration,
        totalScenes: sceneCount,
        completedScenes: 0,
        phase: 'script',
    });
    console.log('[Video] Job created:', video._id, '| Prompt:', prompt.trim().substring(0, 80));

    // Respond immediately with job id so the client can poll
    res.status(202).json({ jobId: video._id, status: 'processing', totalScenes: sceneCount });

    // Generate in background
    try {
        const result = await generateVideo(
            prompt.trim(),
            sceneCount,
            sceneDuration,
            async (progress) => {
                try {
                    await Video.findByIdAndUpdate(video._id, {
                        phase: progress.phase,
                        completedScenes: progress.completedScenes ?? 0,
                        totalScenes: progress.totalScenes ?? sceneCount,
                    });
                } catch (_) { /* progress updates are best-effort */ }
            }
        );

        const videoDataUrl = `data:video/mp4;base64,${result.base64}`;
        await Video.findByIdAndUpdate(video._id, {
            status: 'completed',
            videoUrl: videoDataUrl,
            provider: result.provider,
            phase: 'completed',
            script: result.script.map((s) => s.narration),
        });
        console.log('[Video] ✓ Completed:', video._id, '| Provider:', result.provider);
    } catch (err) {
        console.error('[Video] Generation failed:', video._id, err.message);
        await Video.findByIdAndUpdate(video._id, {
            status: 'failed',
            errorMessage: err.message,
            phase: 'failed',
        });
    }
};

// GET /api/video-job/:id
const getVideoJob = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id).lean();
        if (!video) return res.status(404).json({ error: 'Job not found.' });
        res.json(video);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch job status.' });
    }
};

// GET /api/videos
const getVideos = async (req, res) => {
    try {
        const videos = await Video.find({ status: 'completed' }).sort({ createdAt: -1 }).lean();
        res.json(videos);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch videos.' });
    }
};

// DELETE /api/videos/:id
const deleteVideo = async (req, res) => {
    try {
        const deleted = await Video.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Video not found.' });
        res.json({ message: 'Video deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete video.' });
    }
};

module.exports = { handleGenerateVideo, getVideoJob, getVideos, deleteVideo, calcScenes };
