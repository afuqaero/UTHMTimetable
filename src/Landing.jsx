import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, ArrowRight, Sparkles } from 'lucide-react';
import './Landing.css';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing-container">
      {/* Background animated gradients */}
      <div className="gradient-bg">
        <div className="gradient-sphere sphere-1"></div>
        <div className="gradient-sphere sphere-2"></div>
        <div className="gradient-sphere sphere-3"></div>
      </div>

      <div className="landing-content">
        <motion.div 
          className="badge"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <Sparkles size={16} />
          <span>The best way to plan your semester</span>
        </motion.div>

        <motion.h1 
          className="landing-title"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        >
          UTHM Timetable <br />
          <span className="text-gradient">Planner 2.0</span>
        </motion.h1>

        <motion.p 
          className="landing-subtitle"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
        >
          Build your perfect schedule in seconds. Drag, drop, and export your timetable with a beautiful, seamless experience.
        </motion.p>

        <motion.div 
          className="landing-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
        >
          <button className="btn-glow" onClick={() => navigate('/planner')}>
            <Calendar size={20} />
            <span>Build Timetable</span>
            <ArrowRight size={20} className="arrow-icon" />
          </button>
        </motion.div>
      </div>

      <motion.div 
        className="app-preview"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.8, ease: "easeOut" }}
      >
        <div className="preview-window">
          <div className="window-header">
            <div className="dot red"></div>
            <div className="dot yellow"></div>
            <div className="dot green"></div>
          </div>
          <div className="window-body">
            <div className="mock-grid">
              <div className="mock-item color-1" style={{width: '30%'}}></div>
              <div className="mock-item color-2" style={{width: '45%'}}></div>
              <div className="mock-item color-3" style={{width: '25%'}}></div>
              <div className="mock-item color-4" style={{width: '50%'}}></div>
              <div className="mock-item color-5" style={{width: '35%'}}></div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
