const express = require('express');
const router = express.Router();
const { handleGenerateVideo, getVideoJob, getVideos, deleteVideo } = require('../controllers/videoController');

router.post('/generate-video', handleGenerateVideo);
router.get('/video-job/:id', getVideoJob);
router.get('/videos', getVideos);
router.delete('/videos/:id', deleteVideo);

module.exports = router;
