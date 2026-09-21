import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import { ArrowRight, Calendar, Clock3, Link2, Sparkles, X } from 'lucide-react';
import './Landing.css';

const WHATS_NEW_STORAGE_KEY = 'uthm_timetable_whats_new_v1';

export default function Landing() {
  const navigate = useNavigate();
  const [showWhatsNew, setShowWhatsNew] = useState(() => {
    try {
      return window.localStorage.getItem(WHATS_NEW_STORAGE_KEY) !== 'seen';
    } catch {
      return true;
    }
  });

  const dismissWhatsNew = () => {
    try {
      window.localStorage.setItem(WHATS_NEW_STORAGE_KEY, 'seen');
    } catch {
      // The popup can still be dismissed when storage is unavailable.
    }
    setShowWhatsNew(false);
  };

  useEffect(() => {
    if (!showWhatsNew) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') dismissWhatsNew();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showWhatsNew]);

  const openPlanner = () => {
    dismissWhatsNew();
    navigate('/planner');
  };

  return (
    <div className="landing-container">
      {/* Background animated gradients */}
      <div className="gradient-bg">
        <div className="gradient-sphere sphere-1"></div>
        <div className="gradient-sphere sphere-2"></div>
        <div className="gradient-sphere sphere-3"></div>
      </div>

      <div className="landing-content">
        <Motion.div 
          className="badge"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <Sparkles size={16} />
          <span>The best way to plan your semester</span>
        </Motion.div>

        <Motion.h1 
          className="landing-title"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        >
          UTHM Timetable <br />
          <span className="text-gradient">Planner</span>
        </Motion.h1>

        <Motion.p 
          className="landing-subtitle"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
        >
          Build your perfect schedule in seconds. Drag, drop, and export your timetable with a beautiful, seamless experience.
        </Motion.p>

        <Motion.div 
          className="landing-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
        >
          <button className="btn-glow" onClick={openPlanner}>
            <Calendar size={20} />
            <span>Build Timetable</span>
            <ArrowRight size={20} className="arrow-icon" />
          </button>
        </Motion.div>
      </div>

      <Motion.div 
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
      </Motion.div>

      {showWhatsNew && (
        <div className="whats-new-overlay" onMouseDown={dismissWhatsNew}>
          <Motion.div
            className="whats-new-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="whats-new-header">
              <div className="whats-new-heading">
                <span className="whats-new-icon"><Sparkles size={18} /></span>
                <div>
                  <p className="whats-new-eyebrow">Fresh updates</p>
                  <h2 id="whats-new-title">What&apos;s new</h2>
                </div>
              </div>
              <button className="whats-new-close" aria-label="Close what's new" onClick={dismissWhatsNew}>
                <X size={20} />
              </button>
            </div>

            <p className="whats-new-intro">Plan your timetable more comfortably and continue your edits wherever you are.</p>

            <div className="whats-new-features">
              <div className="whats-new-feature">
                <span className="whats-new-feature-icon"><Clock3 size={20} /></span>
                <div>
                  <h3>12/24-hour time format</h3>
                  <p>Switch between 12-hour and 24-hour time from the planner toolbar.</p>
                </div>
              </div>
              <div className="whats-new-feature">
                <span className="whats-new-feature-icon"><Link2 size={20} /></span>
                <div>
                  <h3>Shareable timetable links</h3>
                  <p>Send your current timetable to yourself and continue editing on desktop, tablet, or another phone.</p>
                </div>
              </div>
            </div>

            <div className="whats-new-actions">
              <button className="whats-new-secondary" onClick={dismissWhatsNew}>Maybe later</button>
              <button className="whats-new-primary" onClick={openPlanner}>
                Build timetable <ArrowRight size={17} />
              </button>
            </div>
          </Motion.div>
        </div>
      )}
    </div>
  );
}
