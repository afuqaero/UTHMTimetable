import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Trash2, MapPin, User, Download, Image as ImageIcon, Calendar, ChevronDown, RefreshCcw, Search } from 'lucide-react';
import subjectList from './data/subjects.json';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Link } from 'react-router-dom';
import './index.css';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Timings: 0800 to 2000
const timeSlots = [
  '0800 - 0900', '0900 - 1000', '1000 - 1100', '1100 - 1200',
  '1200 - 1300', '1300 - 1400', '1400 - 1500', '1500 - 1600',
  '1600 - 1700', '1700 - 1800', '1800 - 1900', '1900 - 2000'
];

const colors = [
  '#FF595E', '#FF924C', '#FFCA3A', '#8AC926', '#1982C4',
  '#4267AC', '#6A4C93', '#F15BB5', '#F43F5E', '#06B6D4',
  '#10B981', '#D946EF'
];

const sections = Array.from({ length: 50 }, (_, i) => `S${i + 1}`);

// ID Generator Helper
const generateId = () => Math.random().toString(36).substr(2, 9);

const getShortType = (type) => {
  switch (type) {
    case 'Tutorial': return 'Tut';
    case 'Lab': return 'Lab';
    case 'Workshop': return 'Wks';
    case 'Lecture':
    default:
      return 'Lec';
  }
};

export default function App() {
  const [subjects, setSubjects] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('timetable_subjects_v2');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse timetable info", e);
        }
      }
    }
    return [];
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const gridRef = useRef(null);
  const wrapperRef = useRef(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);

  // Form state
  const [editingId, setEditingId] = useState(null); // ID of subject being edited
  const [touchState, setTouchState] = useState(null); // { type, subjectId, sessionIndex, startX, startY, currentX, currentY }
  const [formData, setFormData] = useState({
    name: '',
    section: 'S1',
    color: colors[6],
    sessions: [] // { id, day, startIndex, endIndex, location, lecturer }
  });

  // Searchable subjects state
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState('');
  const dropdownRef = useRef(null);

  // Save changes
  useEffect(() => {
    localStorage.setItem('timetable_subjects_v2', JSON.stringify(subjects));
  }, [subjects]);

  // Handle clicking outside custom dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.dropdown-container')) {
        setExportMenuOpen(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !e.target.closest('.search-input-wrapper')) {
        setShowSubjectDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle horizontal scroll to hide/fade day column
  useEffect(() => {
    const handleScroll = () => {
      if (wrapperRef.current) {
        setIsScrolled(wrapperRef.current.scrollLeft > 20);
      }
    };
    const wrapper = wrapperRef.current;
    if (wrapper) {
      wrapper.addEventListener('scroll', handleScroll, { passive: true });
    }
    return () => wrapper?.removeEventListener('scroll', handleScroll);
  }, []);

  const openNewSubjectModal = (defaultSession = null) => {
    setEditingId(null);
    setSubjectSearch('');
    setShowSubjectDropdown(false);
    setFormData({
      name: '',
      section: 'S1',
      color: colors[Math.floor(Math.random() * colors.length)],
      sessions: defaultSession ? [defaultSession] : [
        { id: generateId(), day: 'Monday', startIndex: 0, endIndex: 1, location: '', lecturer: '', type: 'Lecture' }
      ]
    });
    setModalOpen(true);
  };

  const handleCellClick = (day, tIndex) => {
    const defaultSession = {
      id: generateId(),
      day,
      startIndex: tIndex,
      endIndex: Math.min(tIndex + 1, timeSlots.length),
      location: '',
      lecturer: '',
      type: 'Lecture'
    };
    openNewSubjectModal(defaultSession);
  };

  const handleSubjectClick = (e, subject) => {
    e.stopPropagation();
    setEditingId(subject.id);
    setSubjectSearch('');
    setShowSubjectDropdown(false);
    // Deep copy to prevent accidental mutations before save
    setFormData({
      ...subject,
      sessions: subject.sessions.map(s => ({ ...s }))
    });
    setModalOpen(true);
  };

  const handleNameChange = (e) => {
    const newName = e.target.value;
    setSubjectSearch(newName);
    setShowSubjectDropdown(true);
    setFormData(prev => {
      // Auto-sync color if name exactly matches another existing subject
      const existing = subjects.find(s => s.name.toLowerCase() === newName.toLowerCase() && s.id !== editingId);
      return {
        ...prev,
        name: newName,
        color: existing ? existing.color : prev.color
      };
    });
  };

  const selectSubject = (subjectName) => {
    setFormData(prev => {
      const existing = subjects.find(s => s.name.toLowerCase() === subjectName.toLowerCase() && s.id !== editingId);
      return {
        ...prev,
        name: subjectName,
        color: existing ? existing.color : prev.color
      };
    });
    setSubjectSearch(subjectName);
    setShowSubjectDropdown(false);
  };

  const filteredSubjects = subjectList.filter(s =>
    s.toLowerCase().includes(subjectSearch.toLowerCase())
  ).slice(0, 50); // Limit to 50 for performance

  const handleSessionChange = (index, field, value) => {
    let newSessions = [...formData.sessions];
    newSessions[index] = { ...newSessions[index], [field]: value };

    // Auto adjust end time if start time is pushed past it
    if (field === 'startIndex') {
      const start = parseInt(value, 10);
      if (newSessions[index].endIndex <= start) {
        newSessions[index].endIndex = Math.min(start + 1, timeSlots.length);
      }
    }

    // Auto-sync lecturer across all sessions
    if (field === 'lecturer') {
      newSessions = newSessions.map(session => ({
        ...session,
        lecturer: value
      }));
    }

    setFormData({ ...formData, sessions: newSessions });
  };

  const addSession = () => {
    setFormData(prev => {
      const lastSession = prev.sessions[prev.sessions.length - 1];
      const defaultLecturer = lastSession ? lastSession.lecturer : '';
      const defaultType = lastSession ? lastSession.type : 'Lecture';

      return {
        ...prev,
        sessions: [
          ...prev.sessions,
          { id: generateId(), day: 'Monday', startIndex: 0, endIndex: 1, location: '', lecturer: defaultLecturer, type: defaultType }
        ]
      };
    });
  };

  const removeSession = (index) => {
    const newSessions = [...formData.sessions];
    newSessions.splice(index, 1);
    setFormData({ ...formData, sessions: newSessions });
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingId) {
      setSubjects(subjects.map(s => s.id === editingId ? { ...formData, id: editingId } : s));
    } else {
      setSubjects([...subjects, { ...formData, id: generateId() }]);
    }
    setModalOpen(false);
  };

  const handleDelete = () => {
    if (editingId) {
      setSubjects(subjects.filter(s => s.id !== editingId));
    }
    setModalOpen(false);
  };

  const handleReset = () => {
    if (window.confirm("Are you sure you want to completely reset your timetable? This action cannot be undone.")) {
      setSubjects([]);
      localStorage.removeItem('timetable_subjects_v2');
    }
  };

  // ----- Drag and Drop Functions ----- //

  const handleDragStart = (e, subject, sessionIndex) => {
    const session = subject.sessions[sessionIndex];
    const duration = session.endIndex - session.startIndex;

    // Calculate which "box" of the subject they grabbed for smoother dragging of long boxes
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const cellWidth = rect.width / duration;
    let grabOffset = Math.floor(clickX / cellWidth);
    if (grabOffset < 0) grabOffset = 0;
    if (grabOffset >= duration) grabOffset = duration - 1;

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ subjectId: subject.id, sessionIndex, type: 'move', grabOffset }));

    // Defer setting state to allow browser to grab the element visually before we change opacity/pointer-events
    setTimeout(() => {
      setDraggedItem({ subjectId: subject.id, sessionIndex, type: 'move', grabOffset });
    }, 0);
  };

  const handleResizeStart = (e, subject, sessionIndex, type) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';

    // Transparent drag image so we don't see a huge drag ghost for a tiny little handle
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);

    setTimeout(() => {
      setDraggedItem({ subjectId: subject.id, sessionIndex, type }); // type = 'resize-left' | 'resize-right'
    }, 0);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const handleDragEnterCell = (e, targetDay, targetTimeIndex) => {
    // Use DragEnter for resizing instantly over cells as you stretch it
    if (draggedItem && draggedItem.type.startsWith('resize')) {
      e.preventDefault();

      setSubjects(prevSubjects => {
        const next = [...prevSubjects];
        const subIndex = next.findIndex(s => s.id === draggedItem.subjectId);
        if (subIndex === -1) return prevSubjects;

        const sub = { ...next[subIndex], sessions: [...next[subIndex].sessions] };
        const session = { ...sub.sessions[draggedItem.sessionIndex] };

        // Prevent moving across days during resize
        if (session.day !== targetDay) return prevSubjects;

        let changed = false;
        if (draggedItem.type === 'resize-left' && targetTimeIndex < session.endIndex) {
          if (session.startIndex !== targetTimeIndex) {
            session.startIndex = targetTimeIndex;
            changed = true;
          }
        } else if (draggedItem.type === 'resize-right' && targetTimeIndex >= session.startIndex) {
          if (session.endIndex !== targetTimeIndex + 1) {
            session.endIndex = targetTimeIndex + 1;
            changed = true;
          }
        }

        if (changed) {
          sub.sessions[draggedItem.sessionIndex] = session;
          next[subIndex] = sub;
          return next;
        }
        return prevSubjects;
      });
    }
  };

  const handleDragOverCell = (e, targetDay, targetTimeIndex) => {
    e.preventDefault();
    if (draggedItem && draggedItem.type.startsWith('resize')) {
      handleDragEnterCell(e, targetDay, targetTimeIndex); // For smoother resizing on drag over
    } else if (draggedItem && draggedItem.type === 'move') {
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDrop = (e, targetDay, targetTimeIndex) => {
    e.preventDefault();
    if (!draggedItem) return;

    if (draggedItem.type === 'move') {
      performMove(draggedItem.subjectId, draggedItem.sessionIndex, targetDay, targetTimeIndex, draggedItem.grabOffset || 0);
    }

    setDraggedItem(null);
  };

  const performMove = (subjectId, sessionIndex, targetDay, targetTimeIndex, grabOffset) => {
    setSubjects(prevSubjects => prevSubjects.map(sub => {
      if (sub.id === subjectId) {
        const newSessions = [...sub.sessions];
        const session = { ...newSessions[sessionIndex] };
        const duration = session.endIndex - session.startIndex;

        let newStartIndex = targetTimeIndex - grabOffset;

        // Boundaries check
        if (newStartIndex < 0) newStartIndex = 0;
        if (newStartIndex + duration > timeSlots.length) {
          newStartIndex = timeSlots.length - duration;
        }

        session.day = targetDay;
        session.startIndex = newStartIndex;
        session.endIndex = newStartIndex + duration;

        newSessions[sessionIndex] = session;
        return { ...sub, sessions: newSessions };
      }
      return sub;
    }));
  };

  // ----- Touch Handling for Mobile ----- //

  const handleTouchStart = (e, subject, sessionIndex, type = 'move') => {
    // Determine grabOffset if move
    let grabOffset = 0;
    if (type === 'move') {
      const rect = e.currentTarget.getBoundingClientRect();
      const touch = e.touches[0];
      const clickX = touch.clientX - rect.left;
      const session = subject.sessions[sessionIndex];
      const duration = session.endIndex - session.startIndex;
      const cellWidth = rect.width / duration;
      grabOffset = Math.floor(clickX / cellWidth);
      if (grabOffset < 0) grabOffset = 0;
      if (grabOffset >= duration) grabOffset = duration - 1;
    }

    setDraggedItem({ subjectId: subject.id, sessionIndex, type, grabOffset });
    setTouchState({
      type,
      subjectId: subject.id,
      sessionIndex,
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      currentX: e.touches[0].clientX,
      currentY: e.touches[0].clientY
    });
  };

  const handleTouchMove = (e) => {
    if (!draggedItem || !touchState) return;
    const touch = e.touches[0];

    // Update touchState for visual follow
    setTouchState(prev => ({ ...prev, currentX: touch.clientX, currentY: touch.clientY }));

    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = element?.closest('.grid-cell');

    if (cell) {
      // Find what day/time it is from parents or attributes
      // Simple way: check parent's position or classes
      // But instead, we'll use coordinates to match the grid
      const gridRect = gridRef.current.getBoundingClientRect();
      const relativeX = touch.clientX - gridRect.left;
      const relativeY = touch.clientY - gridRect.top;

      // Header row height = 60px, Header col width = 135px
      const colWidth = (gridRect.width - 135) / 12;
      const rowHeight = (gridRect.height - 60) / 5;

      const colIndex = Math.floor((relativeX - 135) / colWidth);
      const rowIndex = Math.floor((relativeY - 60) / rowHeight);

      if (rowIndex >= 0 && rowIndex < 5 && colIndex >= 0 && colIndex < maxEndIndex) {
        const targetDay = days[rowIndex];
        const targetTimeIndex = colIndex;

        if (draggedItem.type.startsWith('resize')) {
          handleDragEnterCell(e, targetDay, targetTimeIndex);
        }
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (!draggedItem || !touchState) return;

    if (draggedItem.type === 'move') {
      const touch = e.changedTouches[0];
      const gridRect = gridRef.current.getBoundingClientRect();
      const relativeX = touch.clientX - gridRect.left;
      const relativeY = touch.clientY - gridRect.top;

      const colWidth = (gridRect.width - 135) / maxEndIndex;
      const rowHeight = (gridRect.height - 60) / 5;

      const colIndex = Math.floor((relativeX - 135) / colWidth);
      const rowIndex = Math.floor((relativeY - 60) / rowHeight);

      if (rowIndex >= 0 && rowIndex < 5 && colIndex >= 0 && colIndex < maxEndIndex) {
        performMove(draggedItem.subjectId, draggedItem.sessionIndex, days[rowIndex], colIndex, draggedItem.grabOffset || 0);
      }
    }

    setDraggedItem(null);
    setTouchState(null);
  };

  const maxEndIndex = 12;

  // ----- Export Functions ----- //

  const getExportMaxCol = () => Math.max(
    10, // At least show until 18:00
    ...subjects.flatMap(s => s.sessions.map(sess => parseInt(sess.endIndex, 10) || 0))
  );

  const exportPNG = async () => {
    if (!gridRef.current) return;
    try {
      const maxCol = getExportMaxCol();
      const exportWidth = 135 + (maxCol * 110);

      const canvas = await html2canvas(gridRef.current, {
        scale: 2,
        backgroundColor: '#1e293b',
        useCORS: true,
        width: exportWidth,
        windowWidth: 1600, // Force desktop width for capture
        onclone: (clonedDoc) => {
          const clonedWrapper = clonedDoc.querySelector('.timetable-wrapper');
          if (clonedWrapper) clonedWrapper.classList.remove('is-horizontally-scrolled');

          const clonedGrid = clonedDoc.querySelector('.timetable-grid');
          if (clonedGrid) {
            clonedGrid.style.setProperty('--cols', maxCol);
            clonedGrid.style.width = `${exportWidth}px`;
            clonedGrid.style.minWidth = `${exportWidth}px`;

            // Hide cells beyond maxCol
            Array.from(clonedGrid.children).forEach(cell => {
              const colStyle = cell.style.gridColumn;
              if (colStyle) {
                const colStart = parseInt(colStyle.split(' / ')[0], 10);
                if (colStart > maxCol + 1) {
                  cell.style.display = 'none';
                }
              }
            });
          }
        }
      });
      const image = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = image;
      a.download = "Timetable.png";
      a.click();
    } catch (e) {
      console.error("Export PNG failed", e);
    }
  };

  const exportPDF = async () => {
    if (!gridRef.current) return;
    try {
      const maxCol = getExportMaxCol();
      const exportWidth = 135 + (maxCol * 110);

      const canvas = await html2canvas(gridRef.current, {
        scale: 2,
        backgroundColor: '#1e293b',
        useCORS: true,
        width: exportWidth,
        windowWidth: 1600,
        onclone: (clonedDoc) => {
          const clonedWrapper = clonedDoc.querySelector('.timetable-wrapper');
          if (clonedWrapper) clonedWrapper.classList.remove('is-horizontally-scrolled');

          const clonedGrid = clonedDoc.querySelector('.timetable-grid');
          if (clonedGrid) {
            clonedGrid.style.setProperty('--cols', maxCol);
            clonedGrid.style.width = `${exportWidth}px`;
            clonedGrid.style.minWidth = `${exportWidth}px`;

            Array.from(clonedGrid.children).forEach(cell => {
              const colStyle = cell.style.gridColumn;
              if (colStyle) {
                const colStart = parseInt(colStyle.split(' / ')[0], 10);
                if (colStart > maxCol + 1) {
                  cell.style.display = 'none';
                }
              }
            });
          }
        }
      });
      const imgData = canvas.toDataURL("image/png");

      // Create the PDF with the exact dimensions of the image canvas to prevent whitespace
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save("Timetable.pdf");
    } catch (e) {
      console.error("Export PDF failed", e);
    }
  };

  const exportICS = () => {
    if (subjects.length === 0) return;

    let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//UTHM Timetable Planner//EN\r\n";
    const now = new Date();

    const pad = (n) => n < 10 ? `0${n}` : n;
    const formatICSDate = (date) => {
      // Floating time format (local time) YYYYMMDDTHHMMSS
      return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
    };

    subjects.forEach((subj) => {
      subj.sessions.forEach(session => {
        const targetDayIdx = days.indexOf(session.day) + 1; // 1 to 5 (Mon to Fri)
        const currentDayIdx = now.getDay() || 7; // Sunday is 0 mapping to 7

        let dayOffset = targetDayIdx - currentDayIdx;
        const startHour = 8 + session.startIndex;

        // If today is past the class time, or it's a past day this week, move to next week
        if (dayOffset < 0 || (dayOffset === 0 && now.getHours() > startHour)) {
          dayOffset += 7;
        }

        const eventStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, startHour, 0, 0);
        const duration = session.endIndex - session.startIndex;
        const eventEnd = new Date(eventStart.getTime() + duration * 60 * 60 * 1000);

        icsContent += "BEGIN:VEVENT\r\n";
        icsContent += `UID:${generateId()}@uthmtimetable\r\n`;
        icsContent += `DTSTAMP:${formatICSDate(now)}Z\r\n`; // Z implies UTC, but we just use it to pacify validators
        icsContent += `DTSTART:${formatICSDate(eventStart)}\r\n`;
        icsContent += `DTEND:${formatICSDate(eventEnd)}\r\n`;
        icsContent += `RRULE:FREQ=WEEKLY;COUNT=14\r\n`; // Assumes 14 weeks typical semester length!
        icsContent += `SUMMARY:${subj.name} (${subj.section})\r\n`;
        if (session.location) icsContent += `LOCATION:${session.location}\r\n`;
        if (session.lecturer) icsContent += `DESCRIPTION:Lecturer: ${session.lecturer}\\n\r\n`; // \\n for newline in ICS
        icsContent += "END:VEVENT\r\n";
      });
    });

    icsContent += "END:VCALENDAR\r\n";

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'UTHM_Timetable.ics';
    a.click();
    URL.revokeObjectURL(u);
  };


  return (
    <div className="app-container">
      <header>
        <div className="header-info">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <h1>UTHM Timetable Planner</h1>
          </Link>
          <p className="header-subtitle">Click anywhere on the grid to add subject. Drag to move, or pull the sides to resize.</p>
          <p className="header-subtitle" style={{ marginTop: '4px', fontWeight: '500', color: 'var(--text-muted)' }}>by <a href="https://www.threads.net/@feeq_azmir" target="_blank" rel="noopener noreferrer" className="creator-link">feeq</a></p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-danger-outline"
            onClick={() => handleReset()}
            title="Reset Timetable"
          >
            <RefreshCcw size={18} />
            <span className="hide-on-mobile">Reset</span>
          </button>

          <button className="btn btn-secondary" onClick={exportICS}>
            <Calendar size={18} />
            <span className="hide-on-mobile">Save to Calendar</span>
          </button>

          <div className="dropdown-container">
            <button className="btn btn-secondary" onClick={() => setExportMenuOpen(!exportMenuOpen)}>
              <Download size={18} />
              <span className="hide-on-mobile">Export File</span>
              <ChevronDown size={14} className="hide-on-mobile" style={{ marginLeft: '4px' }} />
            </button>
            {exportMenuOpen && (
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => { exportPNG(); setExportMenuOpen(false); }}>
                  <ImageIcon size={16} /> PNG Image
                </button>
                <button className="dropdown-item" onClick={() => { exportPDF(); setExportMenuOpen(false); }}>
                  <Download size={16} /> PDF Document
                </button>
              </div>
            )}
          </div>
          <button
            className="btn btn-primary add-subject-btn"
            onClick={() => openNewSubjectModal()}
          >
            <Plus size={18} />
            <span className="hide-on-mobile">Add Subject</span>
          </button>
        </div>
      </header>

      <main className={`timetable-wrapper ${isScrolled ? 'is-horizontally-scrolled' : ''}`} ref={wrapperRef}>
        <div className="timetable-grid" ref={gridRef} style={{ '--cols': 12 }}>
          {/* Top Header Row */}
          <div className="header-cell" style={{ gridColumn: 1, gridRow: 1 }}>
            Day \ Time
          </div>
          {timeSlots.map((time, i) => (
            <div key={`header-${i}`} className="header-cell" style={{ gridColumn: i + 2, gridRow: 1 }}>
              {time}
            </div>
          ))}

          {/* Days and Empty Slots */}
          {days.map((day, dIdx) => (
            <React.Fragment key={`day-row-${day}`}>
              <div
                className="day-cell"
                style={{ gridColumn: 1, gridRow: dIdx + 2 }}
              >
                {day}
              </div>

              {timeSlots.map((_, tIdx) => (
                <div
                  key={`cell-${day}-${tIdx}`}
                  className="grid-cell"
                  style={{ gridColumn: tIdx + 2, gridRow: dIdx + 2 }}
                  onClick={() => handleCellClick(day, tIdx)}
                  onDragEnter={(e) => handleDragEnterCell(e, day, tIdx)}
                  onDragOver={(e) => handleDragOverCell(e, day, tIdx)}
                  onDrop={(e) => handleDrop(e, day, tIdx)}
                />
              ))}
            </React.Fragment>
          ))}

          {/* Subject Items Overlaid */}
          {subjects.length === 0 && (
            <div className="empty-state-overlay" style={{ gridColumn: '2 / -1', gridRow: '2 / -1' }}>
              <div className="empty-state-content">
                <div className="icon-wrapper">
                  <Calendar size={40} className="empty-icon" />
                </div>
                <h3>Your Schedule is Empty</h3>
                <p>Click anywhere on the grid or tap "Add Subject" to begin your master plan.</p>
              </div>
            </div>
          )}

          {subjects.map(subject =>
            subject.sessions.map((session, sIdx) => {
              const dayIdx = days.indexOf(session.day);
              if (dayIdx === -1) return null;

              const startCol = parseInt(session.startIndex, 10) + 2;
              const endCol = parseInt(session.endIndex, 10) + 2;
              const row = dayIdx + 2;

              return (
                <div
                  key={`session-${subject.id}-${sIdx}`}
                  className="subject-item"
                  draggable
                  onDragStart={(e) => handleDragStart(e, subject, sIdx)}
                  onDragEnd={handleDragEnd}
                  style={{
                    gridColumn: `${startCol} / ${endCol}`,
                    gridRow: row,
                    backgroundColor: subject.color,
                    opacity: (draggedItem && draggedItem.subjectId === subject.id && draggedItem.sessionIndex === sIdx && draggedItem.type === 'move') ? 0.5 : 1,
                    pointerEvents: (draggedItem && draggedItem.subjectId === subject.id && draggedItem.sessionIndex === sIdx && draggedItem.type.startsWith('resize')) ? 'none' : 'auto',
                    transform: (touchState && touchState.subjectId === subject.id && touchState.sessionIndex === sIdx && touchState.type === 'move')
                      ? `translate(${touchState.currentX - touchState.startX}px, ${touchState.currentY - touchState.startY}px) scale(1.02)`
                      : undefined,
                    zIndex: (touchState && touchState.subjectId === subject.id && touchState.sessionIndex === sIdx) ? 1000 : 2,
                    boxShadow: (touchState && touchState.subjectId === subject.id && touchState.sessionIndex === sIdx) ? '0 15px 30px rgba(0,0,0,0.5)' : undefined,
                    transition: (touchState && touchState.subjectId === subject.id && touchState.sessionIndex === sIdx) ? 'none' : 'transform 0.2s, box-shadow 0.2s'
                  }}
                  onClick={(e) => handleSubjectClick(e, subject)}
                  onTouchStart={(e) => handleTouchStart(e, subject, sIdx, 'move')}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <div
                    className="resize-handle left"
                    draggable
                    onDragStart={(e) => handleResizeStart(e, subject, sIdx, 'resize-left')}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => e.preventDefault()}
                    onTouchStart={(e) => { e.stopPropagation(); handleTouchStart(e, subject, sIdx, 'resize-left'); }}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  />
                  <div
                    className="resize-handle right"
                    draggable
                    onDragStart={(e) => handleResizeStart(e, subject, sIdx, 'resize-right')}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => e.preventDefault()}
                    onTouchStart={(e) => { e.stopPropagation(); handleTouchStart(e, subject, sIdx, 'resize-right'); }}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  />
                  <div className="type-badge">{getShortType(session.type || 'Lecture')}</div>
                  <div className="subject-name">{subject.name}</div>
                  {subject.section && (
                    <div className="subject-section">{subject.section} {session.type && `- ${session.type}`}</div>
                  )}
                  {session.location && (
                    <div className="subject-details flex items-center gap-2 mt-1">
                      <MapPin size={10} /> {session.location}
                    </div>
                  )}
                  {session.lecturer && (
                    <div className="subject-details flex items-center gap-2 mt-1">
                      <User size={10} /> {session.lecturer}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Subject Form Modal */}
      {modalOpen && (
        <div className="modal-overlay" onMouseDown={() => setModalOpen(false)}>
          <div className="modal-content" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingId ? 'Edit Subject' : 'Add Subject'}</h2>
              <button className="close-button" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <form id="subject-form" onSubmit={handleSave}>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 3, position: 'relative' }}>
                    <label>Subject Name</label>
                    <div className="search-input-wrapper">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Search or type subject name…"
                        value={formData.name}
                        onChange={handleNameChange}
                        required
                        autoFocus
                      />
                      <Search className="search-icon" size={16} />
                    </div>

                    {showSubjectDropdown && subjectSearch && (
                      <div className="subject-dropdown" ref={dropdownRef}>
                        {/* Custom Entry Option */}
                        <div
                          className="subject-option custom-entry"
                          onClick={() => setShowSubjectDropdown(false)}
                        >
                          <Plus size={14} className="mr-2" />
                          Use custom: "{subjectSearch}"
                        </div>

                        {filteredSubjects.length > 0 ? (
                          filteredSubjects.map((s, i) => (
                            <div
                              key={i}
                              className="subject-option"
                              onClick={() => selectSubject(s)}
                            >
                              {s}
                            </div>
                          ))
                        ) : (
                          <div className="subject-no-results">No matches. Use custom name above.</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Section</label>
                    <select
                      className="form-control"
                      value={formData.section}
                      onChange={e => setFormData({ ...formData, section: e.target.value })}
                    >
                      {sections.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group pb-2">
                  <label>Subject Color Indicator</label>
                  <div className="color-picker">
                    {colors.map(c => (
                      <button
                        key={c}
                        type="button"
                        className={`color-option ${formData.color === c ? 'selected' : ''}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setFormData({ ...formData, color: c })}
                      />
                    ))}

                    <div
                      className={`custom-color-wrapper ${!colors.includes(formData.color) ? 'selected' : ''}`}
                      title="Pick a Custom Color"
                      style={{
                        background: !colors.includes(formData.color) ? formData.color : undefined
                      }}
                    >
                      {colors.includes(formData.color) && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.8)', pointerEvents: 'none' }}>
                          <Plus size={16} strokeWidth={3} />
                        </div>
                      )}
                      <input
                        type="color"
                        className="custom-color-input"
                        value={colors.includes(formData.color) ? '#ffffff' : formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* SESSIONS ARRAY */}
                <div className="sessions-container">
                  <div className="sessions-header">
                    <h3>Sessions ({formData.sessions.length})</h3>
                    <button
                      type="button"
                      className="btn btn-secondary text-sm px-3 py-1"
                      onClick={addSession}
                    >
                      <Plus size={14} /> Add Session
                    </button>
                  </div>

                  {formData.sessions.map((session, sIdx) => (
                    <div key={session.id || sIdx} className="session-box">
                      <div className="session-box-header">
                        <span>Session {sIdx + 1}</span>
                        {formData.sessions.length > 1 && (
                          <button
                            type="button"
                            className="remove-session-btn"
                            onClick={() => removeSession(sIdx)}
                            title="Remove Session"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>

                      <div className="form-row mt-2">
                        <div className="form-group">
                          <label>Location (Optional)</label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="e.g. Hall 1"
                            value={session.location}
                            onChange={e => handleSessionChange(sIdx, 'location', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Lecturer (Optional)</label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="e.g. Dr. Jane"
                            value={session.lecturer}
                            onChange={e => handleSessionChange(sIdx, 'lecturer', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="form-row mt-2 time-row">
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Session Type</label>
                          <select
                            className="form-control"
                            value={session.type || 'Lecture'}
                            onChange={e => handleSessionChange(sIdx, 'type', e.target.value)}
                          >
                            <option value="Lecture">Lecture</option>
                            <option value="Tutorial">Tutorial</option>
                            <option value="Lab">Lab</option>
                            <option value="Workshop">Workshop</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: 2 }}>
                          <label>Day</label>
                          <select
                            className="form-control"
                            value={session.day}
                            onChange={e => handleSessionChange(sIdx, 'day', e.target.value)}
                          >
                            {days.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="form-row time-row">
                        <div className="form-group">
                          <label>Start Time</label>
                          <select
                            className="form-control"
                            value={session.startIndex}
                            onChange={e => handleSessionChange(sIdx, 'startIndex', parseInt(e.target.value))}
                          >
                            {timeSlots.map((t, i) => (
                              <option key={`start-${i}`} value={i}>{t.split(' - ')[0]}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>End Time</label>
                          <select
                            className="form-control"
                            value={session.endIndex}
                            onChange={e => handleSessionChange(sIdx, 'endIndex', parseInt(e.target.value))}
                          >
                            {timeSlots.map((t, i) => (
                              <option
                                key={`end-${i}`}
                                value={i + 1}
                                disabled={i + 1 <= session.startIndex}
                              >
                                {t.split(' - ')[1]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}

                  {formData.sessions.length === 0 && (
                    <div className="text-center" style={{ color: 'var(--text-muted)' }}>
                      No sessions added. Click "Add Session".
                    </div>
                  )}
                </div>
              </form>
            </div>

            <div className="modal-footer">
              {editingId && (
                <button type="button" className="btn btn-danger" onClick={handleDelete}>
                  <Trash2 size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Delete Subject
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" form="subject-form" className="btn btn-primary" disabled={formData.sessions.length === 0}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
