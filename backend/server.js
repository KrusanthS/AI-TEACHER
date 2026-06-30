require('dotenv').config();
// Clear any system-wide proxy settings that might redirect requests
process.env.HTTP_PROXY = '';
process.env.HTTPS_PROXY = '';
process.env.http_proxy = '';
process.env.https_proxy = '';

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const apiRoutes = require('./routes/apiRoutes');
const videoRoutes = require('./routes/videoRoutes');

const app = express();

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Allow non-browser requests (no Origin header) and any localhost port,
        // since Vite auto-bumps to 5174/5175/etc. whenever the default port is busy.
        if (!origin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
            return callback(null, true);
        }
        callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Increase response size limit
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
});

// Connect to Database
connectDB();

// Routes
app.use('/api', apiRoutes);
app.use('/api', videoRoutes);

// Root route
app.get('/', (req, res) => {
    res.send('AI Assistant API is running...');
});

const PORT = 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
