const { chatWithGemini } = require('../services/aiService');

const handleChat = async (req, res) => {
    try {
        const { prompt, image, mimeType } = req.body;
        if (!prompt && !image) return res.status(400).json({ error: "Prompt or Image is required" });

        const response = await chatWithGemini(prompt || "Describe this image", image, mimeType);
        res.status(200).json({ response });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { handleChat };
