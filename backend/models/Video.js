const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
    prompt: { type: String, required: true },
    videoUrl: { type: String },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    provider: { type: String },
    errorMessage: { type: String },
    duration: { type: Number },
    resolution: { type: String },
    // Long-form progress tracking
    phase: { type: String, enum: ['script', 'rendering', 'merging', 'completed', 'failed'], default: 'script' },
    totalScenes: { type: Number, default: 0 },
    completedScenes: { type: Number, default: 0 },
    script: [{ type: String }],
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Video', videoSchema);
