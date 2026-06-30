import React from 'react';
import { NavLink } from 'react-router-dom';
import { MessageSquare, Image, LayoutGrid, Cpu, Video, Film } from 'lucide-react';

const Sidebar = () => {
    return (
        <div className="sidebar">
            <div className="sidebar-logo">
                <Cpu size={32} />
                <span>AI Nexus</span>
            </div>
            <nav className="nav-links">
                <NavLink to="/" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                    <MessageSquare size={20} />
                    <span>AI Chat</span>
                </NavLink>
                <NavLink to="/generate" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                    <Image size={20} />
                    <span>Image Gen</span>
                </NavLink>
                <NavLink to="/gallery" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                    <LayoutGrid size={20} />
                    <span>Gallery</span>
                </NavLink>
                <NavLink to="/video-generate" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                    <Video size={20} />
                    <span>Video Gen</span>
                </NavLink>
                <NavLink to="/video-gallery" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                    <Film size={20} />
                    <span>Video Gallery</span>
                </NavLink>
            </nav>
        </div>
    );
};

export default Sidebar;
