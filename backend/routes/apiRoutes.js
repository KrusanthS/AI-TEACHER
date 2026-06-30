const express = require('express');
const router = express.Router();
const { handleChat } = require('../controllers/chatController');
const { handleGenerateImage, getImages } = require('../controllers/imageController');
const { checkAPIHealth } = require('../services/aiService');

router.post('/chat', handleChat);
router.post('/generate-image', handleGenerateImage);
router.get('/images', getImages);
router.get('/health', async (req, res) => {
    const health = await checkAPIHealth();
    res.json(health);
});

module.exports = router;
