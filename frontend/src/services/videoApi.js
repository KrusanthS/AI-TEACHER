import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:5001/api',
    timeout: 15000,
});

export const generateVideo = (prompt, duration) => api.post('/generate-video', { prompt, duration }).then(r => r.data);
export const pollVideoJob = (id) => api.get(`/video-job/${id}`).then(r => r.data);
export const getVideos = () => api.get('/videos').then(r => r.data);
export const deleteVideo = (id) => api.delete(`/videos/${id}`).then(r => r.data);
