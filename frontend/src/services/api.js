import axios from 'axios';

const API_URL = 'http://localhost:5001/api';

const api = axios.create({
    baseURL: API_URL,
    timeout: 150000, // 2.5 min — covers Gemini + NVIDIA time
});

export const chatWithAI = async (prompt, image = null, mimeType = null) => {
    const response = await api.post('/chat', { prompt, image, mimeType });
    return response.data;
};

export const generateImage = async (prompt) => {
    const response = await api.post('/generate-image', { prompt });
    return response.data;
};

export const getHistory = async () => {
    const response = await api.get('/images');
    return response.data;
};

export default api;
