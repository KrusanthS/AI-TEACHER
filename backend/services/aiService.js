const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini once at module level
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Constants ────────────────────────────────────────────────────────────────

const NVIDIA_API_URL = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const NVIDIA_TIMEOUT_MS = 120000;   // 2 minutes
const OPENROUTER_TIMEOUT_MS = 30000; // 30 seconds
const GEMINI_TIMEOUT_MS = 30000;     // 30 seconds

const SYSTEM_PROMPT = `You are an expert AI image prompt engineer specialized in NVIDIA FLUX image models.
Your ONLY job is to convert any user input into a single, professional, highly detailed image generation prompt.

RULES:
- Always add: cinematic lighting, sharp focus, ultra-detailed textures, composition details
- Always add quality keywords: 8K resolution, ultra-detailed, professional photography or digital art
- Auto-detect and apply the best visual style if user does not specify one
- Supported styles: Realistic, Cinematic, Anime, Fantasy, Digital Art, Photorealistic, Oil Painting, 3D Render, Cartoon, Cyberpunk
- Fix grammar and spelling in the user input
- Expand short prompts into rich, descriptive prompts
- Add camera/lens details for realistic/photographic prompts (e.g. "shot on Canon EOS R5, 85mm lens, f/1.8 aperture")
- Add artistic medium details for art-style prompts (e.g. "digital painting, concept art, trending on ArtStation")
- NEVER include explanations, greetings, or any text other than the final prompt
- NEVER use markdown formatting, bullet points, or headers
- Return ONLY the final optimized image prompt as a single paragraph`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sanitize = (text) =>
    text
        .trim()
        .replace(/^["'`]|["'`]$/g, "")
        .replace(/\n+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();

const isUsable = (text) => {
    if (!text || text.length < 15) return false;
    const bad = ["i cannot", "i can't", "i'm unable", "as an ai", "i don't",
        "please provide", "could you", "here is a prompt", "here's a prompt", "sure,", "certainly,"];
    const lower = text.toLowerCase();
    return !bad.some((p) => lower.startsWith(p));
};

// ─── Smart Local Fallback ─────────────────────────────────────────────────────
// Builds a decent prompt without any API call

const STYLE_KEYWORDS = {
    anime: "anime style, vibrant colors, Studio Ghibli inspired, detailed anime art",
    cartoon: "cartoon style, colorful, stylized illustration, Disney-Pixar inspired",
    realistic: "photorealistic, shot on Canon EOS R5, 85mm lens, f/1.8 aperture, natural lighting",
    photo: "photorealistic, professional photography, DSLR camera, sharp focus, natural lighting",
    fantasy: "epic fantasy art, magical atmosphere, dramatic lighting, concept art, ArtStation trending",
    cyberpunk: "cyberpunk aesthetic, neon lights, futuristic city, rain-soaked streets, blade runner style",
    painting: "oil painting, classical art style, rich textures, museum quality, detailed brushwork",
    "3d": "3D render, octane render, cinema 4D, physically based rendering, studio lighting",
    digital: "digital art, concept art, highly detailed, ArtStation trending, professional illustration",
    cinematic: "cinematic photography, anamorphic lens, dramatic lighting, film grain, movie still",
};

const buildLocalPrompt = (userPrompt) => {
    const lower = userPrompt.toLowerCase();

    // Detect style from user input
    let styleAddition = "";
    for (const [key, val] of Object.entries(STYLE_KEYWORDS)) {
        if (lower.includes(key)) {
            styleAddition = val;
            break;
        }
    }

    // Default style if none detected
    if (!styleAddition) {
        styleAddition = "photorealistic, cinematic lighting, ultra-detailed, professional photography";
    }

    return `${userPrompt}, ${styleAddition}, 8K resolution, ultra-detailed, sharp focus, high quality, masterpiece`;
};

// ─── Tier 1: OpenRouter (free, no daily quota issues) ─────────────────────────

const enhanceWithOpenRouter = async (userPrompt) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

    try {
        console.log("[OpenRouter] Enhancing prompt...");

        const response = await fetch(OPENROUTER_API_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:5173",
                "X-Title": "AI Image Generator",
            },
            body: JSON.stringify({
                model: "deepseek/deepseek-v4-flash:free",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: `Convert this into a professional image generation prompt: "${userPrompt}"` },
                ],
                max_tokens: 300,
                temperature: 0.7,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenRouter HTTP ${response.status}: ${err}`);
        }

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content;
        if (!raw) throw new Error("OpenRouter returned empty content.");

        // Strip <think>...</think> reasoning blocks that DeepSeek includes
        const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        const enhanced = sanitize(cleaned || raw);
        if (!isUsable(enhanced)) throw new Error(`OpenRouter unusable response: "${enhanced.substring(0, 60)}"`);

        console.log(`[OpenRouter] ✓ Enhanced: "${enhanced.substring(0, 100)}..."`);
        return enhanced;

    } catch (error) {
        clearTimeout(timeoutId);
        const isTimeout = error.name === "AbortError";
        console.warn(`[OpenRouter] Failed${isTimeout ? " (timeout)" : ""}: ${error.message}`);
        return null;
    }
};

// ─── Tier 2: Gemini (fallback if OpenRouter fails) ────────────────────────────

const enhanceWithGemini = async (userPrompt) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
        console.log("[Gemini] Enhancing prompt (fallback)...");

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

        const fullPrompt = `${SYSTEM_PROMPT}\n\nUser input: "${userPrompt}"\n\nOptimized image generation prompt:`;

        // Race against timeout
        const resultPromise = model.generateContent(fullPrompt);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Gemini timeout")), GEMINI_TIMEOUT_MS)
        );

        const result = await Promise.race([resultPromise, timeoutPromise]);
        clearTimeout(timeoutId);

        const raw = result.response.text();
        const enhanced = sanitize(raw);

        if (!isUsable(enhanced)) throw new Error(`Gemini unusable response: "${enhanced.substring(0, 60)}"`);

        console.log(`[Gemini] ✓ Enhanced: "${enhanced.substring(0, 100)}..."`);
        return enhanced;

    } catch (error) {
        clearTimeout(timeoutId);
        const isQuota = error.message?.includes("429") || error.message?.includes("quota");
        console.warn(`[Gemini] Failed${isQuota ? " (quota exceeded)" : ""}: ${error.message?.substring(0, 120)}`);
        return null;
    }
};

// ─── Main: 3-tier prompt enhancement ─────────────────────────────────────────

const enhancePromptWithGemini = async (userPrompt) => {
    // Tier 1: Try OpenRouter first (free, reliable)
    const openRouterResult = await enhanceWithOpenRouter(userPrompt);
    if (openRouterResult) return openRouterResult;

    // Tier 2: Try Gemini (may hit quota)
    const geminiResult = await enhanceWithGemini(userPrompt);
    if (geminiResult) return geminiResult;

    // Tier 3: Smart local fallback — always works, no API needed
    console.warn("[Pipeline] Both APIs failed — using smart local prompt builder.");
    const localResult = buildLocalPrompt(userPrompt);
    console.log(`[Local Fallback] Built prompt: "${localResult.substring(0, 100)}..."`);
    return localResult;
};

// ─── Chat with Gemini (ChatWindow — multimodal) ───────────────────────────────

const chatWithGemini = async (prompt, imageData = null, mimeType = "image/jpeg") => {
    // Try Gemini first
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
        let result;
        if (imageData) {
            result = await model.generateContent([
                prompt,
                { inlineData: { data: imageData, mimeType } },
            ]);
        } else {
            result = await model.generateContent(prompt);
        }
        return result.response.text();
    } catch (geminiError) {
        const isQuota = geminiError.message?.includes("429") || geminiError.message?.includes("quota");
        console.warn(`[Gemini Chat] Failed${isQuota ? " (quota)" : ""}: ${geminiError.message?.substring(0, 100)}`);

        // Fallback to OpenRouter for text chat
        if (!imageData) {
            console.log("[Chat] Falling back to OpenRouter for text chat...");
            try {
                const response = await fetch(OPENROUTER_API_URL, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "http://localhost:5173",
                        "X-Title": "AI Image Generator",
                    },
                    body: JSON.stringify({
                        model: "deepseek/deepseek-v4-flash:free",
                        messages: [{ role: "user", content: prompt }],
                        max_tokens: 1024,
                        temperature: 0.7,
                    }),
                });

                if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
                const data = await response.json();
                const raw = data.choices?.[0]?.message?.content;
                if (!raw) throw new Error("Empty response from OpenRouter");
                // Strip reasoning blocks
                const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() || raw;
                return text;

            } catch (orError) {
                console.error("[Chat OpenRouter] Failed:", orError.message);
                throw new Error("AI Chat is temporarily unavailable. Please try again later.");
            }
        }

        // Image analysis — can't fallback without vision model
        throw new Error("AI Chat failed: " + geminiError.message);
    }
};

// ─── Generate image with NVIDIA FLUX.1-dev ────────────────────────────────────

const generateImageWithNvidia = async (prompt, maxRetries = 2) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), NVIDIA_TIMEOUT_MS);

        try {
            console.log(`[NVIDIA] Generating image (attempt ${attempt}/${maxRetries}): "${prompt.substring(0, 80)}..."`);

            const response = await fetch(NVIDIA_API_URL, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ prompt, width: 1024, height: 1024, steps: 20 }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Read the FULL body first before any checks
            // Checking response.ok before reading body can partially consume the stream
            const rawText = await response.text();

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${rawText.substring(0, 200)}`);
            }

            const data = JSON.parse(rawText);

            if (data.artifacts?.[0]?.base64) {
                const b64 = data.artifacts[0].base64;
                console.log(`[NVIDIA] ✓ Image generated. Base64 length: ${b64.length}`);
                return `data:image/jpeg;base64,${b64}`;
            }

            throw new Error("NVIDIA response contained no image data.");

        } catch (error) {
            clearTimeout(timeoutId);
            const isAbort = error.name === "AbortError";
            console.error(`[NVIDIA] Attempt ${attempt} ${isAbort ? "timeout" : "error"}: ${error.message}`);

            if (attempt < maxRetries) {
                await sleep(2000 * attempt);
            } else {
                throw new Error(
                    isAbort
                        ? "Image generation timed out. Please try again."
                        : "Image generation failed: " + error.message
                );
            }
        }
    }
};

// ─── API Health Check ─────────────────────────────────────────────────────────

const checkAPIHealth = async () => {
    const results = { openrouter: false, gemini: false, nvidia: false };

    // Check OpenRouter
    try {
        const r = await fetch("https://openrouter.ai/api/v1/models", {
            headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        });
        results.openrouter = r.ok;
    } catch { results.openrouter = false; }

    // Check Gemini
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
        await model.generateContent("test");
        results.gemini = true;
    } catch (e) {
        results.gemini = e.message?.includes("429") ? "quota_exceeded" : false;
    }

    // Check NVIDIA (just validate key format)
    results.nvidia = !!process.env.NVIDIA_API_KEY?.startsWith("nvapi-");

    console.log("[API Health]", results);
    return results;
};

module.exports = {
    chatWithGemini,
    enhancePromptWithGemini,
    generateImageWithNvidia,
    checkAPIHealth,
};
