// backend/config/videoConfig.js
//
// STRICTLY FREE-TIER VIDEO PIPELINE — no paid APIs, no credits, no API keys
// required at all.
//
// How it works:
//   1. A free text LLM (OpenRouter "deepseek free" → Gemini free tier →
//      local fallback) breaks the topic into a scene-by-scene script.
//   2. Each scene's image is generated for free via Pollinations
//      (image.pollinations.ai — no key needed).
//   3. Each scene's narration audio is generated for free via Pollinations
//      TTS (text.pollinations.ai?model=openai-audio — no key needed). If
//      that endpoint is ever unavailable, the scene silently falls back to
//      a silent clip so the video still completes.
//   4. ffmpeg (already bundled via ffmpeg-static, also free/local) turns
//      every still image into a moving "Ken Burns" clip (slow zoom/pan),
//      burns in synced captions, and merges everything into one long-form
//      video.
//
// Every single one of the above is free with no usage-based billing. The
// previous version of this file tried to call Fal, Runware, JSON2Video,
// Flatkey, Higgsfield, CometAPI, SiliconFlow and Replicate — all of which
// are paid/credit-metered APIs and have been fully removed.

// Optional best-effort REAL motion clip via Hugging Face's free monthly
// inference quota (uses the HF_API_KEY already in .env). When the free
// quota is unavailable/exhausted, the pipeline silently falls back to the
// zero-cost Ken Burns clip below — the video never fails either way.
const HF_TEXT_TO_VIDEO_MODEL = 'ali-vilab/text-to-video-ms-1.7b';
const HF_TIMEOUT_MS = 60000;

const POLLINATIONS_IMAGE_BASE = 'https://image.pollinations.ai/prompt';
const POLLINATIONS_TTS_BASE = 'https://text.pollinations.ai';

// Duration constraints — long-form is fully supported since cost scales
// only with local CPU/ffmpeg time, not API spend.
const MIN_DURATION = 6;           // seconds
const MAX_DURATION = 30;          // seconds (hard cap per current requirement)
const DEFAULT_DURATION = 20;      // seconds

// Target spoken pace used to size each scene's narration (words/sec)
const WORDS_PER_SECOND = 2.3;

// Bounds for an individual scene's length, in seconds
const MIN_SCENE_DURATION = 4;
const MAX_SCENE_DURATION = 14;

// Ken Burns zoom intensity (per-frame zoom increment used by ffmpeg zoompan)
const ZOOM_INCREMENT = 0.0012;
const ZOOM_MAX = 1.18;

// Caption styling (burned in via ffmpeg drawtext)
const CAPTION_FONT_SIZE = 40;
const CAPTION_MAX_CHARS_PER_LINE = 46;

// Output video settings
const OUTPUT_FPS = 25;
const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 720;

module.exports = {
    POLLINATIONS_IMAGE_BASE,
    POLLINATIONS_TTS_BASE,
    HF_TEXT_TO_VIDEO_MODEL,
    HF_TIMEOUT_MS,
    MIN_DURATION,
    MAX_DURATION,
    DEFAULT_DURATION,
    WORDS_PER_SECOND,
    MIN_SCENE_DURATION,
    MAX_SCENE_DURATION,
    ZOOM_INCREMENT,
    ZOOM_MAX,
    CAPTION_FONT_SIZE,
    CAPTION_MAX_CHARS_PER_LINE,
    OUTPUT_FPS,
    OUTPUT_WIDTH,
    OUTPUT_HEIGHT,
};
