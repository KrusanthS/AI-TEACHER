const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
    prompt: {
        type: String,
        required: true
    },
    imageUrl: {
        type: String, // We'll store the base64 or URL
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Image', imageSchema);
