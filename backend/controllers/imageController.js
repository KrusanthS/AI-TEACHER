const { enhancePromptWithGemini, generateImageWithNvidia } = require("../services/aiService");
const Image = require("../models/Image");

const handleGenerateImage = async (req, res) => {
    try {
        const { prompt } = req.body;

        // Guard: missing or whitespace-only prompt
        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: "Prompt is required." });
        }

        const userPrompt = prompt.trim();
        console.log("\n─── New Image Request ───────────────────────────");
        console.log("[User Prompt]:", userPrompt);

        // Phase 1: Enhance prompt (OpenRouter → Gemini → Local fallback)
        const finalPrompt = await enhancePromptWithGemini(userPrompt);
        console.log("[Final → NVIDIA]:", finalPrompt.substring(0, 120) + (finalPrompt.length > 120 ? "..." : ""));

        // Phase 2: Generate image with NVIDIA
        const imageUrl = await generateImageWithNvidia(finalPrompt);

        // Phase 3: Save to MongoDB — store prompt + imageUrl
        // Use lean save and respond with in-memory imageUrl (not the mongoose doc)
        // to avoid any mongoose string truncation on large base64 values
        const newImage = await Image.create({ prompt: userPrompt, imageUrl });

        console.log("[Pipeline] ✓ Complete. Image saved with id:", newImage._id);

        // Return the in-memory imageUrl directly — guaranteed full and untouched
        res.status(201).json({
            _id: newImage._id,
            prompt: newImage.prompt,
            createdAt: newImage.createdAt,
            imageUrl,   // use in-memory value, not newImage.imageUrl
        });

    } catch (error) {
        console.error("[Image Controller] Error:", error.message);

        // Map internal errors to user-friendly messages
        let userMessage = "Failed to generate image. Please try again.";

        if (error.message.includes("timed out")) {
            userMessage = "Image generation timed out. Please try again.";
        } else if (error.message.includes("HTTP 4") || error.message.includes("HTTP 5")) {
            userMessage = "Image service is temporarily unavailable. Please try again shortly.";
        } else if (error.message.includes("AI Chat") || error.message.includes("Gemini")) {
            userMessage = "Prompt enhancement failed. Please try again.";
        } else if (error.message.includes("no image data")) {
            userMessage = "Image generation returned no result. Please try a different prompt.";
        }

        res.status(500).json({ error: userMessage });
    }
};

const getImages = async (req, res) => {
    try {
        const images = await Image.find().sort({ createdAt: -1 });
        res.status(200).json(images);
    } catch (error) {
        console.error("[getImages] Error:", error.message);
        res.status(500).json({ error: "Failed to fetch images." });
    }
};

module.exports = { handleGenerateImage, getImages };
