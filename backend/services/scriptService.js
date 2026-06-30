// backend/services/scriptService.js
//
// Turns a topic + target duration into a scene-by-scene script:
//   [{ narration: "...", imagePrompt: "..." }, ...]
//
// Uses the SAME free-tier-only LLM chain already used elsewhere in this
// project (OpenRouter's free "deepseek/deepseek-v4-flash:free" model, then
// Gemini's free tier as a backup). If both are unavailable (no key / rate
// limited), a local template-based script builder guarantees the pipeline
// never breaks and never costs anything.

const { GoogleGenerativeAI } = require('@google/generative-ai');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_TIMEOUT_MS = 30000;
const GEMINI_TIMEOUT_MS = 30000;

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const SYSTEM_PROMPT = `You are a professional video script writer and storyboard artist.
Given a TOPIC and a NUMBER OF SCENES, write a complete narrated video script.

Return ONLY valid JSON — an array with exactly the requested number of scene objects, no markdown, no commentary, no code fences. Each object must have:
- "narration": one or two natural spoken sentences (no stage directions), continuing logically from the previous scene so the whole video flows as one coherent narrated piece.
- "imagePrompt": a short, vivid, highly visual English description (max 25 words) of what should be shown on screen for this scene, written for an AI image generator (include style/lighting/composition keywords).

Example shape: [{"narration":"...","imagePrompt":"..."}]`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripFences = (text) =>
    text.trim().replace(/^```(json)?/i, '').replace(/```$/i, '').trim();

const tryParseScript = (raw, expectedCount) => {
    const cleaned = stripFences(raw);
    const jsonStart = cleaned.indexOf('[');
    const jsonEnd = cleaned.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1) return null;
    try {
        const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        const scenes = parsed
            .filter((s) => s && typeof s.narration === 'string' && typeof s.imagePrompt === 'string')
            .map((s) => ({ narration: s.narration.trim(), imagePrompt: s.imagePrompt.trim() }));
        if (scenes.length === 0) return null;
        // Trim/pad to expected count without failing the whole pipeline
        return scenes.slice(0, expectedCount);
    } catch {
        return null;
    }
};

// ─── Tier 1: OpenRouter free model ─────────────────────────────────────────

const scriptWithOpenRouter = async (topic, sceneCount) => {
    if (!process.env.OPENROUTER_API_KEY) return null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

    try {
        console.log('[Script:OpenRouter] Generating script...');
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:5173',
                'X-Title': 'AI Video Generator',
            },
            body: JSON.stringify({
                model: 'deepseek/deepseek-v4-flash:free',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `TOPIC: "${topic}"\nNUMBER OF SCENES: ${sceneCount}` },
                ],
                max_tokens: 1600,
                temperature: 0.8,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content;
        if (!raw) throw new Error('OpenRouter returned empty content');
        const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        const scenes = tryParseScript(cleaned, sceneCount);
        if (!scenes) throw new Error('OpenRouter returned unparsable script');
        console.log(`[Script:OpenRouter] ✓ ${scenes.length} scenes`);
        return scenes;
    } catch (err) {
        clearTimeout(timeoutId);
        console.warn(`[Script:OpenRouter] Failed: ${err.message}`);
        return null;
    }
};

// ─── Tier 2: Gemini free tier ──────────────────────────────────────────────

const scriptWithGemini = async (topic, sceneCount) => {
    if (!genAI) return null;
    try {
        console.log('[Script:Gemini] Generating script (fallback)...');
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
        const prompt = `${SYSTEM_PROMPT}\n\nTOPIC: "${topic}"\nNUMBER OF SCENES: ${sceneCount}`;
        const resultPromise = model.generateContent(prompt);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Gemini timeout')), GEMINI_TIMEOUT_MS)
        );
        const result = await Promise.race([resultPromise, timeoutPromise]);
        const raw = result.response.text();
        const scenes = tryParseScript(raw, sceneCount);
        if (!scenes) throw new Error('Gemini returned unparsable script');
        console.log(`[Script:Gemini] ✓ ${scenes.length} scenes`);
        return scenes;
    } catch (err) {
        console.warn(`[Script:Gemini] Failed: ${err.message?.substring(0, 120)}`);
        return null;
    }
};

// ─── Tier 3: Local fallback (always works, zero API calls) ────────────────

const buildLocalScript = (topic, sceneCount) => {
    const beats = [
        `Let's explore ${topic}.`,
        `Here's an important part of ${topic} to understand.`,
        `This is where ${topic} really comes together.`,
        `Consider how this connects to the bigger picture of ${topic}.`,
        `Another key aspect of ${topic} worth knowing.`,
        `Let's go a little deeper into ${topic}.`,
        `This detail about ${topic} matters too.`,
        `Bringing it all together for ${topic}.`,
    ];
    return Array.from({ length: sceneCount }, (_, i) => ({
        narration: beats[i % beats.length],
        imagePrompt: `${topic}, scene ${i + 1}, cinematic lighting, ultra detailed, 8k`,
    }));
};

// ─── Main entry point ──────────────────────────────────────────────────────

const generateScript = async (topic, sceneCount) => {
    const openRouterResult = await scriptWithOpenRouter(topic, sceneCount);
    if (openRouterResult) return openRouterResult;

    const geminiResult = await scriptWithGemini(topic, sceneCount);
    if (geminiResult) return geminiResult;

    console.warn('[Script] All free LLM tiers unavailable — using local template script.');
    return buildLocalScript(topic, sceneCount);
};

module.exports = { generateScript };
