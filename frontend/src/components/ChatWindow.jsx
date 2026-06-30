import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Paperclip } from 'lucide-react';
import { chatWithAI } from '../services/api';

const ChatWindow = () => {
    const [messages, setMessages] = useState([
        { role: 'ai', content: 'Hello! I am your AI assistant. How can I help you today?' }
    ]);
    const [input, setInput] = useState('');
    const [image, setImage] = useState(null);
    const [mimeType, setMimeType] = useState(null);
    const [loading, setLoading] = useState(false);
    const chatEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Remove the data:image/jpeg;base64, prefix for Gemini
                const base64Data = reader.result.split(',')[1];
                setImage(base64Data);
                setMimeType(file.type);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() && !image) return;

        const userMsg = { role: 'user', content: input, image: image ? `data:${mimeType};base64,${image}` : null };
        setMessages(prev => [...prev, userMsg]);
        
        const currentInput = input;
        const currentImage = image;
        const currentMimeType = mimeType;

        setInput('');
        setImage(null);
        setMimeType(null);
        setLoading(true);

        try {
            const data = await chatWithAI(currentInput || "Describe this image", currentImage, currentMimeType);
            setMessages(prev => [...prev, { role: 'ai', content: data.response }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'ai', content: "Sorry, I'm having trouble analyzing this. Please try again later." }]);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveImage = () => {
        setImage(null);
        setMimeType(null);
    };

    const handleUploadClick = () => {
        fileInputRef.current.click();
    };

    return (
        <div className="main-content">
            <div className="chat-window">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.role === 'user' ? 'user-message' : 'ai-message'}`}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', opacity: 0.7 }}>
                            {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{msg.role === 'user' ? 'You' : 'AI'}</span>
                        </div>
                        {msg.content}
                        {msg.image && <img src={msg.image} className="message-image" alt="Uploaded" />}
                    </div>
                ))}
                {loading && (
                    <div className="message ai-message">
                        <div className="spinner"></div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            <div className="input-container">
                {image && (
                    <div className="image-preview-container">
                        <div className="preview-box">
                            <img src={`data:${mimeType};base64,${image}`} alt="Preview" />
                            <button className="remove-img" onClick={handleRemoveImage}>X</button>
                        </div>
                    </div>
                )}
                <form className="input-wrapper" onSubmit={handleSend}>
                    <input 
                        type="file" 
                        accept="image/*" 
                        style={{ display: 'none' }} 
                        ref={fileInputRef} 
                        onChange={handleFileChange}
                    />
                    <button type="button" className="upload-btn" onClick={handleUploadClick}>
                        <Paperclip size={20} />
                    </button>
                    <input 
                        type="text" 
                        placeholder={image ? "Ask something about this image..." : "Ask me anything..."}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={loading}
                    />
                    <button type="submit" className="send-btn" disabled={loading || (!input.trim() && !image)}>
                        <Send size={20} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChatWindow;
