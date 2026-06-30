// backend/services/videoService.js
//
// 100% FREE long-form video generation pipeline. No paid API, no API key,
// no credit system, no pay-as-you-go billing is used anywhere in this file.
//
// Pipeline per scene:
//   topic ─▶ free LLM script ─▶ Pollinations image (free) ─▶ Pollinations
//   TTS narration (free, optional) ─▶ ffmpeg Ken Burns zoom + burned-in
//   captions + audio ─▶ concatenated into one long-form MP4.

const fs = require('fs');
const os = require('os');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { generateScript } = require('./scriptService');
const {
    POLLINATIONS_IMAGE_BASE,
    POLLINATIONS_TTS_BASE,
    HF_TEXT_TO_VIDEO_MODEL,
    HF_TIMEOUT_MS,
    MIN_SCENE_DURATION,
    MAX_SCENE_DURATION,
    ZOOM_INCREMENT,
    ZOOM_MAX,
    CAPTION_FONT_SIZE,
    CAPTION_MAX_CHARS_PER_LINE,
    OUTPUT_FPS,
    OUTPUT_WIDTH,
    OUTPUT_HEIGHT,
} = require('../config/videoConfig');

ffmpeg.setFfmpegPath(ffmpegPath);
try {
    // ffprobe-static gives us a bundled, free, local ffprobe binary so we
    // can read each narration clip's exact duration (no API call).
    const ffprobePath = require('ffprobe-static').path;
    ffmpeg.setFfprobePath(ffprobePath);
} catch {
    console.warn('[Video] ffprobe-static not installed — run `npm install ffprobe-static`.');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = (name) => path.join(os.tmpdir(), name);

const withTimeout = (promise, ms, label) =>
    Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
    ]);

const fetchBuffer = async (url, timeoutMs = 60000) => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(tid);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    } catch (err) {
        clearTimeout(tid);
        throw err;
    }
};

// Resolve a usable TTF font for ffmpeg drawtext across Linux/macOS/Windows.
// Captions are skipped gracefully (never crash the pipeline) if none found.
let cachedFontPath;
const resolveFontPath = () => {
    if (cachedFontPath !== undefined) return cachedFontPath;
    const candidates = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
        'C:\\Windows\\Fonts\\arialbd.ttf',
        'C:\\Windows\\Fonts\\arial.ttf',
    ];
    cachedFontPath = candidates.find((p) => {
        try { return fs.existsSync(p); } catch { return false; }
    }) || null;
    if (!cachedFontPath) console.warn('[Video] No system font found — captions will be skipped.');
    return cachedFontPath;
};

// Word-wrap narration into lines for the burned-in caption.
const wrapCaption = (text, maxChars = CAPTION_MAX_CHARS_PER_LINE) => {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
        if ((line + ' ' + word).trim().length > maxChars) {
            if (line) lines.push(line.trim());
            line = word;
        } else {
            line = `${line} ${word}`.trim();
        }
    }
    if (line) lines.push(line.trim());
    return lines.join('\n');
};

// ─── Free image generation (Pollinations, no key required) ────────────────

// ─── Best-effort REAL motion clip via Hugging Face's free monthly quota ───
// Returns a short raw (silent, ~2-4s) motion video buffer, or null if the
// free quota/model is unavailable for any reason. Never throws.

const fetchHFMotionClip = async (scenePrompt, sceneIndex) => {
    if (!process.env.HF_API_KEY) return null;
    try {
        console.log(`[Video] Scene ${sceneIndex + 1}: trying real motion via HF free quota...`);
        const res = await withTimeout(
            fetch(`https://api-inference.huggingface.co/models/${HF_TEXT_TO_VIDEO_MODEL}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.HF_API_KEY}`,
                    'Content-Type': 'application/json',
                    'x-wait-for-model': 'true',
                },
                body: JSON.stringify({ inputs: scenePrompt }),
            }),
            HF_TIMEOUT_MS,
            `Scene ${sceneIndex + 1} HF motion`
        );

        if (!res.ok) {
            // 503 (loading), 429 (rate limited), 402 (quota exhausted) etc.
            // all just mean: skip the free real-motion tier for this scene.
            const text = await res.text().catch(() => '');
            throw new Error(`HF HTTP ${res.status}: ${text.substring(0, 150)}`);
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        // A real mp4 will always be more than a few KB; tiny payloads are
        // usually JSON error bodies that slipped through with a 200.
        if (!buffer || buffer.length < 5000) throw new Error('HF response too small to be valid video');

        console.log(`[Video] Scene ${sceneIndex + 1}: ✓ real motion clip (${buffer.length} bytes)`);
        return buffer;
    } catch (err) {
        console.warn(`[Video] Scene ${sceneIndex + 1}: HF motion unavailable (${err.message}) — using Ken Burns fallback.`);
        return null;
    }
};

const fetchSceneImage = async (imagePrompt, sceneIndex) => {
    const seed = Date.now() + sceneIndex;
    const url = `${POLLINATIONS_IMAGE_BASE}/${encodeURIComponent(imagePrompt)}?width=${OUTPUT_WIDTH}&height=${OUTPUT_HEIGHT}&nologo=true&model=flux&seed=${seed}`;
    return withTimeout(fetchBuffer(url, 90000), 95000, `Scene ${sceneIndex + 1} image`);
};

// ─── Free narration TTS (Pollinations, no key required) ───────────────────
// Returns null on any failure so the pipeline can fall back to a silent
// clip instead of failing the whole video.

const fetchSceneNarration = async (narrationText, sceneIndex) => {
    try {
        const voices = ['nova', 'alloy', 'shimmer', 'echo'];
        const voice = voices[sceneIndex % voices.length];
        const url = `${POLLINATIONS_TTS_BASE}/${encodeURIComponent(narrationText)}?model=openai-audio&voice=${voice}`;
        const buffer = await withTimeout(fetchBuffer(url, 45000), 50000, `Scene ${sceneIndex + 1} narration`);
        if (!buffer || buffer.length < 500) throw new Error('Narration audio too small / empty');
        return buffer;
    } catch (err) {
        console.warn(`[Video] Scene ${sceneIndex + 1} narration unavailable (${err.message}) — using silent clip.`);
        return null;
    }
};

// ─── ffprobe duration lookup ───────────────────────────────────────────────

const probeDuration = (filePath) =>
    new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, data) => {
            if (err || !data?.format?.duration) return resolve(null);
            resolve(data.format.duration);
        });
    });

// ─── Build one Ken-Burns scene clip (image + optional narration + caption) ─

const buildSceneClip = async (scene, sceneIndex, fallbackDuration) => {
    // Tier 1 (best-effort, free quota): try a real motion clip from HF.
    const motionBuffer = await fetchHFMotionClip(scene.imagePrompt, sceneIndex);

    let visualPath;
    let isMotionClip = false;
    if (motionBuffer) {
        visualPath = tmp(`scene-motion-${Date.now()}-${sceneIndex}.mp4`);
        fs.writeFileSync(visualPath, motionBuffer);
        isMotionClip = true;
    } else {
        // Tier 2 (always free, always works): Pollinations still image,
        // animated afterwards with a Ken Burns zoom in ffmpeg.
        const imageBuffer = await fetchSceneImage(scene.imagePrompt, sceneIndex);
        visualPath = tmp(`scene-img-${Date.now()}-${sceneIndex}.jpg`);
        fs.writeFileSync(visualPath, imageBuffer);
    }

    const narrationBuffer = await fetchSceneNarration(scene.narration, sceneIndex);
    let audioPath = null;
    let duration = fallbackDuration;

    if (narrationBuffer) {
        audioPath = tmp(`scene-audio-${Date.now()}-${sceneIndex}.mp3`);
        fs.writeFileSync(audioPath, narrationBuffer);
        const probed = await probeDuration(audioPath);
        if (probed && probed > 0.5) {
            duration = Math.min(Math.max(probed + 0.4, MIN_SCENE_DURATION), MAX_SCENE_DURATION);
        }
    }

    const outPath = tmp(`scene-clip-${Date.now()}-${sceneIndex}.mp4`);
    const totalFrames = Math.round(duration * OUTPUT_FPS);

    const zoomDirection = sceneIndex % 2 === 0 ? 'in' : 'out';
    const zoomExpr =
        zoomDirection === 'in'
            ? `min(zoom+${ZOOM_INCREMENT},${ZOOM_MAX})`
            : `if(lte(zoom,1.0),${ZOOM_MAX},max(1.0,zoom-${ZOOM_INCREMENT}))`;

    const fontPath = resolveFontPath();
    let captionFile = null;

    await new Promise((resolve, reject) => {
        const command = ffmpeg();

        if (isMotionClip) {
            // Loop the short real-motion clip so it fills the full scene
            // duration (narration is usually longer than the raw clip).
            command.input(visualPath).inputOptions(['-stream_loop -1']);
        } else {
            command.input(visualPath).inputOptions(['-loop 1']);
        }

        if (audioPath) {
            command.input(audioPath);
        } else {
            command.input('anullsrc=channel_layout=stereo:sample_rate=44100').inputOptions(['-f lavfi']);
        }

        let videoFilter = isMotionClip
            ? `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},fps=${OUTPUT_FPS}`
            : `scale=${OUTPUT_WIDTH * 2}:${OUTPUT_HEIGHT * 2},` +
              `zoompan=z='${zoomExpr}':d=${totalFrames}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${OUTPUT_FPS}`;

        if (fontPath && scene.narration) {
            captionFile = tmp(`caption-${Date.now()}-${sceneIndex}.txt`);
            fs.writeFileSync(captionFile, wrapCaption(scene.narration));
            const escapedFontPath = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');
            const escapedCaptionFile = captionFile.replace(/\\/g, '/').replace(/:/g, '\\:');
            videoFilter +=
                `,drawtext=fontfile='${escapedFontPath}':textfile='${escapedCaptionFile}':` +
                `fontsize=${CAPTION_FONT_SIZE}:fontcolor=white:line_spacing=6:` +
                `box=1:boxcolor=black@0.55:boxborderw=14:` +
                `x=(w-text_w)/2:y=h-th-50`;
        }

        command
            .complexFilter([`[0:v]${videoFilter}[v]`])
            .outputOptions([
                '-map [v]',
                '-map 1:a',
                `-t ${duration}`,
                '-c:v libx264',
                '-preset fast',
                '-crf 20',
                '-pix_fmt yuv420p',
                '-c:a aac',
                '-ar 44100',
                '-ac 2',
                '-shortest',
            ])
            .output(outPath)
            .on('end', resolve)
            .on('error', (err) => reject(new Error(`Scene ${sceneIndex + 1} render failed: ${err.message}`)))
            .run();
    });

    [visualPath, audioPath, captionFile].forEach((p) => {
        if (p) { try { fs.unlinkSync(p); } catch (_) {} }
    });

    return outPath;
};

// ─── Merge all scene clips into the final long-form video ─────────────────

const mergeClips = (clipPaths) =>
    new Promise((resolve, reject) => {
        const outPath = tmp(`merged-${Date.now()}.mp4`);
        const listFile = tmp(`list-${Date.now()}.txt`);

        fs.writeFileSync(
            listFile,
            clipPaths.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "\\'")}'`).join('\n')
        );

        console.log(`[FFmpeg] Merging ${clipPaths.length} scenes → ${outPath}`);

        ffmpeg()
            .input(listFile)
            .inputOptions(['-f concat', '-safe 0'])
            .outputOptions([
                '-c:v libx264',
                '-preset fast',
                '-crf 20',
                `-r ${OUTPUT_FPS}`,
                '-pix_fmt yuv420p',
                '-c:a aac',
                '-ar 44100',
                '-ac 2',
                '-movflags +faststart',
            ])
            .output(outPath)
            .on('end', () => {
                try { fs.unlinkSync(listFile); } catch (_) {}
                resolve(outPath);
            })
            .on('error', (err) => {
                try { fs.unlinkSync(listFile); } catch (_) {}
                reject(new Error(`FFmpeg merge failed: ${err.message}`));
            })
            .run();
    });

// ─── Main entry point ──────────────────────────────────────────────────────
// onProgress(info) is called after each scene completes so the controller
// can persist live progress for the frontend to poll.

const generateVideo = async (topic, sceneCount, sceneDuration, onProgress = () => {}) => {
    console.log(`[Video] Building free-tier script: ${sceneCount} scenes...`);
    const script = await generateScript(topic, sceneCount);
    onProgress({ phase: 'script', totalScenes: script.length });

    const clipPaths = [];

    try {
        for (let i = 0; i < script.length; i++) {
            console.log(`[Video] Scene ${i + 1}/${script.length}: "${script[i].narration.substring(0, 60)}..."`);
            const clipPath = await buildSceneClip(script[i], i, sceneDuration);
            clipPaths.push(clipPath);
            onProgress({
                phase: 'rendering',
                completedScenes: i + 1,
                totalScenes: script.length,
                lastNarration: script[i].narration,
            });
        }

        let finalPath;
        if (clipPaths.length === 1) {
            finalPath = clipPaths[0];
        } else {
            onProgress({ phase: 'merging', totalScenes: script.length });
            finalPath = await mergeClips(clipPaths);
            clipPaths.forEach((p) => { try { fs.unlinkSync(p); } catch (_) {} });
        }

        const merged = fs.readFileSync(finalPath);
        try { fs.unlinkSync(finalPath); } catch (_) {}

        const base64 = merged.toString('base64');
        console.log(`[Video] ✓ Final video: ${merged.length} bytes, ${script.length} scenes`);
        return { base64, provider: 'free-pollinations-pipeline', script };
    } catch (err) {
        clipPaths.forEach((p) => { try { fs.unlinkSync(p); } catch (_) {} });
        throw err;
    }
};

module.exports = { generateVideo };
