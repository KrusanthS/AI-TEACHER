import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import ImageGenerator from './components/ImageGenerator';
import Gallery from './pages/Gallery';
import VideoGenerate from './pages/VideoGenerate';
import VideoGallery from './pages/VideoGallery';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Sidebar />
        <Routes>
          <Route path="/" element={<ChatWindow />} />
          <Route path="/generate" element={<ImageGenerator />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/video-generate" element={<VideoGenerate />} />
          <Route path="/video-gallery" element={<VideoGallery />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
