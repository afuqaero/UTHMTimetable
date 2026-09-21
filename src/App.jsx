import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, X, Trash2, MapPin, User, Download, Image as ImageIcon, Calendar, Clock, ChevronDown, RefreshCcw, Search, GripVertical, Share2, Copy } from 'lucide-react';
import subjectList from './data/subjects.json';
import roomList from './data/rooms.json';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Link } from 'react-router-dom';
import { buildSessionLayout, formatHour, formatTimeRange, getSessionLayoutKey } from './timetable-layout.js';
import { isTapGesture } from './timetable-interactions.js';
import { formatICSDateUtc } from './calendar-export.js';
import { getSectionOptions } from './section-options.js';
import { getMobileExportLayout } from './export-layout.js';
import { createTimetableShareUrl, readTimetableFromLocation, SHARE_QUERY_PARAM } from './share-state.js';
import './index.css';
import './planner.css';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIME_FORMAT_STORAGE_KEY = 'timetable_time_format_v1';

// Timings: 0800 to 0000
const timeSlots = [
  '0800 - 0900', '0900 - 1000', '1000 - 1100', '1100 - 1200',
  '1200 - 1300', '1300 - 1400', '1400 - 1500', '1500 - 1600',
  '1600 - 1700', '1700 - 1800', '1800 - 1900', '1900 - 2000',
  '2000 - 2100', '2100 - 2200', '2200 - 2300', '2300 - 0000'
];

const colors = [
  '#FF595E', '#FF924C', '#FFCA3A', '#8AC926', '#1982C4',
  '#4267AC', '#6A4C93', '#F15BB5', '#F43F5E', '#06B6D4',
  '#10B981', '#D946EF'
];

const getGridPosition = (grid, x, y) => {
  const rect = grid.getBoundingClientRect();
  const style = window.getComputedStyle(grid);
  const findTrack = (tracks, position) => {
    let edge = 0;
    return tracks.split(' ').findIndex(track => { edge += parseFloat(track); return position < edge; });
  };
  return {
    colIndex: x < rect.left || x >= rect.right ? -1 : findTrack(style.gridTemplateColumns, x - rect.left) - 1,
    rowIndex: y < rect.top || y >= rect.bottom ? -1 : findTrack(style.gridTemplateRows, y - rect.top) - 1,
  };
};

// ID Generator Helper
const generateId = () => Math.random().toString(36).substr(2, 9);
const getRandomColor = () => colors[Math.floor(Math.random() * colors.length)];

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

const escapeICSText = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\r\n|\r|\n/g, '\\n')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,');

export default function App() {
  const sharedTimetable = useMemo(() => (
    typeof window !== 'undefined' ? readTimetableFromLocation() : null
  ), []);
  const [subjects, setSubjects] = useState(() => {
    if (sharedTimetable) return sharedTimetable.subjects;

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
  const timetableLayout = useMemo(() => buildSessionLayout(subjects, days), [subjects]);

  const [modalOpen, setModalOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [timeFormat, setTimeFormat] = useState(() => {
    if (sharedTimetable) return sharedTimetable.timeFormat;

    if (typeof window !== 'undefined' && window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY) === '12h') {
      return '12h';
    }
    return '24h';
  });
  const gridRef = useRef(null);
  const wrapperRef = useRef(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

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

  // Searchable locations state
  const [activeLocationDropdown, setActiveLocationDropdown] = useState(null);
  const locationDropdownRef = useRef(null);
  const [showSectionDropdown, setShowSectionDropdown] = useState(false);
  const sectionDropdownRef = useRef(null);

  const closeSubjectModal = useCallback(() => {
    setModalOpen(false);
    setShowSubjectDropdown(false);
    setActiveLocationDropdown(null);
    setShowSectionDropdown(false);
  }, []);

  // Save changes
  useEffect(() => {
    localStorage.setItem('timetable_subjects_v2', JSON.stringify(subjects));
  }, [subjects]);

  useEffect(() => {
    localStorage.setItem(TIME_FORMAT_STORAGE_KEY, timeFormat);
  }, [timeFormat]);

  // Consume a shared snapshot once, then remove it from the address bar so a refresh
  // continues with the latest local edits instead of re-importing the old snapshot.
  useEffect(() => {
    if (!sharedTimetable || typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    url.searchParams.delete(SHARE_QUERY_PARAM);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [sharedTimetable]);

  // Handle clicking outside custom dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.dropdown-container')) {
        setExportMenuOpen(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !e.target.closest('.search-input-wrapper')) {
        setShowSubjectDropdown(false);
      }
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target) && !e.target.closest('.location-input-wrapper')) {
        setActiveLocationDropdown(null);
      }
      if (sectionDropdownRef.current && !sectionDropdownRef.current.contains(e.target) && !e.target.closest('.section-input-wrapper')) {
        setShowSectionDropdown(false);
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

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeSubjectModal();
      }
    };
    if (modalOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [closeSubjectModal, modalOpen]);

  const openNewSubjectModal = (defaultSession = null) => {
    setEditingId(null);
    setSubjectSearch('');
    setShowSubjectDropdown(false);
    setActiveLocationDropdown(null);
    setShowSectionDropdown(false);
    setFormData({
      name: '',
      section: 'S1',
      color: getRandomColor(),
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
    setActiveLocationDropdown(null);
    setShowSectionDropdown(false);
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
  const sectionOptions = getSectionOptions(formData.section);

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
    closeSubjectModal();
  };

  const handleDelete = () => {
    if (editingId) {
      setSubjects(subjects.filter(s => s.id !== editingId));
    }
    closeSubjectModal();
  };

  const handleReset = () => {
    if (window.confirm("Are you sure you want to completely reset your timetable? This action cannot be undone.")) {
      setSubjects([]);
      localStorage.removeItem('timetable_subjects_v2');
    }
  };

  const toggleTimeFormat = () => {
    setTimeFormat(prevFormat => prevFormat === '24h' ? '12h' : '24h');
  };

  const copyShareLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
  };

  const handleShare = async () => {
    const url = createTimetableShareUrl(subjects, timeFormat);
    setShareLink(url);
    setShareCopied(false);
    setShareDialogOpen(true);

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'UTHM Timetable Planner',
          text: 'Continue editing this timetable',
          url,
        });
        setShareDialogOpen(false);
      } catch (error) {
        // Closing the native share sheet is not an error; keep the link dialog open.
        if (error?.name !== 'AbortError') await copyShareLink(url);
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await copyShareLink(url);
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
    // Keep the gesture on the timetable instead of letting the page scroll.
    e.preventDefault();
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
    e.preventDefault();
    const touch = e.touches[0];

    // Update touchState for visual follow
    setTouchState(prev => ({ ...prev, currentX: touch.clientX, currentY: touch.clientY }));

    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = element?.closest('.grid-cell');

    if (cell) {
      // Find what day/time it is from parents or attributes
      // Simple way: check parent's position or classes
      // But instead, we'll use coordinates to match the grid
      const { colIndex, rowIndex } = getGridPosition(gridRef.current, touch.clientX, touch.clientY);

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
    e.preventDefault();

    const touch = e.changedTouches[0];
    const isTap = isTapGesture(touchState, touch);

    if (draggedItem.type === 'move' && isTap) {
      const subject = subjects.find(item => item.id === draggedItem.subjectId);
      if (subject) handleSubjectClick(e, subject);
    } else if (draggedItem.type === 'move') {
      const { colIndex, rowIndex } = getGridPosition(gridRef.current, touch.clientX, touch.clientY);

      if (rowIndex >= 0 && rowIndex < 5 && colIndex >= 0 && colIndex < maxEndIndex) {
        performMove(draggedItem.subjectId, draggedItem.sessionIndex, days[rowIndex], colIndex, draggedItem.grabOffset || 0);
      }
    }

    setDraggedItem(null);
    setTouchState(null);
  };

  const maxEndIndex = timeSlots.length;

  // ----- Export Functions ----- //

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const getExportMaxCol = () => Math.max(
    10, // At least show until 18:00
    ...subjects.flatMap(s => s.sessions.map(sess => parseInt(sess.endIndex, 10) || 0))
  );

  const createExportCanvas = async (orientation = 'landscape') => {
    const maxCol = getExportMaxCol();
    const isPortrait = orientation === 'portrait';
    const isMobile = orientation === 'mobile';
    const mobileExportLayout = getMobileExportLayout(days.length);
    const exportWidth = isMobile
      ? mobileExportLayout.exportWidth
      : isPortrait
      ? 125 + (days.length * 180)
      : 135 + (maxCol * 110);
    const mobileRowHeight = Math.max(84, Math.floor((1398 - 55) / maxCol));

    return html2canvas(gridRef.current, {
      scale: 2,
      backgroundColor: '#1e293b',
      useCORS: true,
      width: exportWidth,
      windowWidth: Math.max(1600, exportWidth),
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc) => {
        const clonedWrapper = clonedDoc.querySelector('.timetable-wrapper');
        if (clonedWrapper) {
          clonedWrapper.classList.remove('is-horizontally-scrolled');
          clonedWrapper.scrollLeft = 0;
          clonedWrapper.scrollTop = 0;
        }

        const clonedGrid = clonedDoc.querySelector('.timetable-grid');
        if (!clonedGrid) return;

        clonedGrid.style.width = `${exportWidth}px`;
        clonedGrid.style.minWidth = `${exportWidth}px`;

        if (isPortrait || isMobile) {
          const dayColumnWidth = isMobile ? mobileExportLayout.dayColumnWidth : 180;
          const timeColumnWidth = isMobile ? mobileExportLayout.timeColumnWidth : 125;
          const rowHeight = isMobile ? mobileRowHeight : 135;
          clonedGrid.style.gridTemplateColumns = `${timeColumnWidth}px repeat(${days.length}, ${dayColumnWidth}px)`;
          clonedGrid.style.gridTemplateRows = `55px repeat(${maxCol}, ${rowHeight}px)`;

          const cornerCell = clonedGrid.querySelector('[data-export-role="corner"]');
          if (cornerCell) cornerCell.textContent = 'Time \\ Day';

          Array.from(clonedGrid.querySelectorAll('[data-time-index]')).forEach(cell => {
            const timeIndex = parseInt(cell.dataset.timeIndex, 10);
            if (timeIndex >= maxCol) {
              cell.style.display = 'none';
              return;
            }
            cell.style.gridColumn = '1';
            cell.style.gridRow = `${timeIndex + 2}`;
          });

          Array.from(clonedGrid.querySelectorAll('[data-day-index]')).forEach(cell => {
            const dayIndex = parseInt(cell.dataset.dayIndex, 10);
            cell.style.gridColumn = `${dayIndex + 2}`;
            cell.style.gridRow = '1';
          });

          Array.from(clonedGrid.querySelectorAll('[data-grid-day-index]')).forEach(cell => {
            const dayIndex = parseInt(cell.dataset.gridDayIndex, 10);
            const timeIndex = parseInt(cell.dataset.gridTimeIndex, 10);
            if (timeIndex >= maxCol) {
              cell.style.display = 'none';
              return;
            }
            cell.style.gridColumn = `${dayIndex + 2}`;
            cell.style.gridRow = `${timeIndex + 2}`;
          });

          Array.from(clonedGrid.querySelectorAll('[data-session-day-index]')).forEach(item => {
            const dayIndex = parseInt(item.dataset.sessionDayIndex, 10);
            const startIndex = parseInt(item.dataset.sessionStartIndex, 10);
            const endIndex = parseInt(item.dataset.sessionEndIndex, 10);
            const laneIndex = parseInt(item.dataset.sessionLaneIndex, 10) || 0;
            const laneCount = parseInt(item.dataset.sessionLaneCount, 10) || 1;
            item.style.gridColumn = `${dayIndex + 2}`;
            item.style.gridRow = `${startIndex + 2} / ${endIndex + 2}`;
            item.style.alignSelf = 'stretch';
            item.style.height = 'auto';
            item.style.top = '0';
            item.style.width = laneCount > 1 ? `calc(${100 / laneCount}% - 10px)` : 'auto';
            item.style.left = laneCount > 1 ? `${laneIndex * (100 / laneCount)}%` : '0';
          });
        } else {
          clonedGrid.style.setProperty('--cols', maxCol);
          clonedGrid.style.gridTemplateColumns = `135px repeat(${maxCol}, 110px)`;
        }

        Array.from(clonedGrid.querySelectorAll('.header-cell')).forEach(cell => {
          cell.style.position = 'static';
        });
        Array.from(clonedGrid.querySelectorAll('.day-cell')).forEach(cell => {
          cell.style.position = 'static';
        });

        // Strip interactive effects so the export doesn't depend on hover/scroll/touch state.
        Array.from(clonedGrid.querySelectorAll('.subject-item')).forEach(item => {
          item.style.boxShadow = 'none';
          item.style.borderTop = 'none';
          item.style.borderRight = 'none';
          item.style.borderBottom = 'none';
          item.style.transform = 'none';
          item.style.filter = 'none';
          item.style.opacity = '1';
          item.style.transition = 'none';
        });

        Array.from(clonedGrid.querySelectorAll('.resize-handle')).forEach(handle => {
          handle.style.display = 'none';
        });

        Array.from(clonedGrid.querySelectorAll('.type-badge')).forEach(badge => {
          badge.style.backdropFilter = 'none';
          badge.style.webkitBackdropFilter = 'none';
        });

        if (!isPortrait) {
          // Hide cells beyond the latest occupied hour so the export width stays predictable.
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
  };

  const exportPNG = async (orientation = 'landscape') => {
    if (!gridRef.current) return;
    try {
      const canvas = await createExportCanvas(orientation);
      const image = await new Promise((resolve, reject) => canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Could not create PNG file'));
      }, 'image/png'));
      const label = orientation === 'mobile' ? 'iPhone-Wallpaper' : orientation === 'portrait' ? 'Portrait' : 'Landscape';
      downloadBlob(image, `Timetable-${label}.png`);
    } catch (e) {
      console.error("Export PNG failed", e);
    }
  };

  const exportPDF = async (orientation = 'landscape') => {
    if (!gridRef.current) return;
    try {
      const canvas = await createExportCanvas(orientation);
      const imgData = canvas.toDataURL('image/jpeg', 1);
      const pxToPt = 72 / 96;
      const pdfWidth = canvas.width * pxToPt;
      const pdfHeight = canvas.height * pxToPt;

      // Use PDF points and a JPEG snapshot for broader viewer compatibility.
      const pdf = new jsPDF({
        orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [pdfWidth, pdfHeight],
        compress: true
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      const label = orientation === 'mobile' ? 'iPhone-Wallpaper' : orientation === 'portrait' ? 'Portrait' : 'Landscape';
      downloadBlob(pdf.output('blob'), `Timetable-${label}.pdf`);
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
        const summary = subj.section ? `${subj.name} (${subj.section})` : subj.name;
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
        icsContent += `DTSTAMP:${formatICSDateUtc(now)}\r\n`;
        icsContent += `DTSTART:${formatICSDate(eventStart)}\r\n`;
        icsContent += `DTEND:${formatICSDate(eventEnd)}\r\n`;
        icsContent += `RRULE:FREQ=WEEKLY;COUNT=14\r\n`; // Assumes 14 weeks typical semester length!
        icsContent += `SUMMARY:${escapeICSText(summary)}\r\n`;
        if (session.location) icsContent += `LOCATION:${escapeICSText(session.location)}\r\n`;
        if (session.lecturer) {
          icsContent += `DESCRIPTION:${escapeICSText(`Lecturer: ${session.lecturer}`)}\r\n`;
        }
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
    <div className="app-container planner">
      <header className="planner-header">
        <div className="header-info">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <h1>UTHM Timetable Planner</h1>
          </Link>
          <p className="header-subtitle desktop-instruction">Click anywhere on the grid to add subject. Drag to move, or pull the sides to resize.</p>
          <p className="header-subtitle" style={{ marginTop: '4px', fontWeight: '500', color: 'var(--text-muted)' }}>by <a href="https://www.threads.net/@feeq_azmir" target="_blank" rel="noopener noreferrer" className="creator-link">feeq</a></p>
        </div>

        <div className="header-actions">
          <div className="dropdown-container">
            <button className="btn btn-secondary" aria-label="Export timetable" aria-expanded={exportMenuOpen} onClick={() => setExportMenuOpen(!exportMenuOpen)}>
              <Download size={18} />
              <span className="hide-on-mobile">Export File</span>
              <ChevronDown size={14} className="hide-on-mobile" style={{ marginLeft: '4px' }} />
            </button>
            {exportMenuOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-heading">PNG image</div>
                <button className="dropdown-item" onClick={() => { exportPNG('landscape'); setExportMenuOpen(false); }}>
                  <ImageIcon size={16} /> Landscape
                </button>
                <button className="dropdown-item" onClick={() => { exportPNG('portrait'); setExportMenuOpen(false); }}>
                  <ImageIcon size={16} /> Portrait
                </button>
                <button className="dropdown-item" onClick={() => { exportPNG('mobile'); setExportMenuOpen(false); }}>
                  <ImageIcon size={16} /> iPhone wallpaper
                </button>
                <div className="dropdown-divider" />
                <div className="dropdown-heading">PDF document</div>
                <button className="dropdown-item" onClick={() => { exportPDF('landscape'); setExportMenuOpen(false); }}>
                  <Download size={16} /> Landscape
                </button>
                <button className="dropdown-item" onClick={() => { exportPDF('portrait'); setExportMenuOpen(false); }}>
                  <Download size={16} /> Portrait
                </button>
                <button className="dropdown-item" onClick={() => { exportPDF('mobile'); setExportMenuOpen(false); }}>
                  <Download size={16} /> iPhone wallpaper
                </button>
              </div>
            )}
          </div>
          <button
            className="btn btn-secondary"
            aria-label="Share timetable"
            title="Share timetable"
            onClick={handleShare}
          >
            <Share2 size={18} />
            <span className="hide-on-mobile">Share Timetable</span>
          </button>
          <button
            className="btn btn-primary add-subject-btn"
            aria-label="Add subject"
            onClick={() => openNewSubjectModal()}
          >
            <Plus size={18} />
            <span className="hide-on-mobile">Add Subject</span>
          </button>
        </div>
      </header>

      <section className="planner-toolbar" aria-label="Timetable overview">
        <div className="planner-overview">
          <div className="planner-week"><Calendar size={18} /><h2>Weekly timetable</h2><span className="planner-recurring">Recurring</span></div>
          <p>{subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'}<span>·</span>{subjects.reduce((total, subject) => total + subject.sessions.length, 0)} sessions<span>·</span>{subjects.reduce((total, subject) => total + subject.sessions.reduce((hours, session) => hours + Number(session.endIndex) - Number(session.startIndex), 0), 0)} hours of classes</p>
        </div>
        <div className="planner-toolbar-actions">
          <div className="planner-reset-group">
            <button type="button" className="btn planner-reset" onClick={handleReset}><RefreshCcw size={15} />Reset timetable</button>
            <p className="mobile-instruction"><GripVertical size={13} aria-hidden="true" />Hold and drag a class, or tap it then tap an empty slot.</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary time-format-toggle"
            aria-label={`Switch to ${timeFormat === '24h' ? '12-hour' : '24-hour'} time`}
            aria-pressed={timeFormat === '12h'}
            title={`Switch to ${timeFormat === '24h' ? '12-hour' : '24-hour'} time`}
            onClick={toggleTimeFormat}
          >
            <Clock size={16} />{timeFormat === '24h' ? '24-hour' : '12-hour'}
          </button>
          <button className="btn btn-secondary calendar-save" onClick={exportICS}><Calendar size={16} />Save to Calendar</button>
        </div>
      </section>

      <main className={`timetable-wrapper ${isScrolled ? 'is-horizontally-scrolled' : ''}`} ref={wrapperRef}>
        <div
          className="timetable-grid"
          ref={gridRef}
          data-time-format={timeFormat}
          style={{
            '--cols': timeSlots.length,
            ...Object.fromEntries(days.map((day, index) => [
              `--day-${index}-lanes`,
              timetableLayout.dayLaneCounts[day],
            ])),
          }}
        >
          {/* Top Header Row */}
          <div className="header-cell" data-export-role="corner" style={{ gridColumn: 1, gridRow: 1 }}>
            Day \ Time
          </div>
          {timeSlots.map((_, i) => (
            <div key={`header-${i}`} className="header-cell" data-time-index={i} style={{ gridColumn: i + 2, gridRow: 1 }}>
              <span className="header-time-range" aria-label={formatTimeRange(i, timeFormat)}>{formatTimeRange(i, timeFormat)}</span>
            </div>
          ))}

          {/* Days and Empty Slots */}
          {days.map((day, dIdx) => (
            <React.Fragment key={`day-row-${day}`}>
              <div
                className="day-cell"
                data-day-index={dIdx}
                style={{ gridColumn: 1, gridRow: dIdx + 2 }}
              >
                {day}
              </div>

              {timeSlots.map((_, tIdx) => (
                <div
                  key={`cell-${day}-${tIdx}`}
                  className="grid-cell"
                  data-grid-day-index={dIdx}
                  data-grid-time-index={tIdx}
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
              const layout = timetableLayout.sessions[getSessionLayoutKey(subject.id, sIdx)] || {
                laneIndex: 0,
                laneCount: 1,
              };

              return (
                <div
                  key={`session-${subject.id}-${sIdx}`}
                  className="subject-item"
                  role="button"
                  tabIndex={0}
                  aria-label={`${subject.name}, ${session.day}, ${formatHour(session.startIndex, timeFormat)} to ${formatHour(session.endIndex, timeFormat)}. Edit subject`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSubjectClick(e, subject); } }}
                  data-session-day-index={dayIdx}
                  data-session-start-index={session.startIndex}
                  data-session-end-index={session.endIndex}
                  data-session-lane-index={layout.laneIndex}
                  data-session-lane-count={layout.laneCount}
                  draggable
                  onDragStart={(e) => handleDragStart(e, subject, sIdx)}
                  onDragEnd={handleDragEnd}
                  style={{
                    gridColumn: `${startCol} / ${endCol}`,
                    gridRow: row,
                    backgroundColor: subject.color,
                    borderLeftColor: subject.color,
                    '--subject-color': subject.color,
                    '--session-lane-index': layout.laneIndex,
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
                  <GripVertical className="subject-drag-handle" size={16} aria-hidden="true" />
                  <div className="type-badge">{getShortType(session.type || 'Lecture')}</div>
                  <div className="subject-name" title={subject.name}>{subject.name}</div>
                  {subject.section && (
                    <div className="subject-section">{subject.section} {session.type && `– ${session.type}`}</div>
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

      <footer className="planner-footer">
        <div className="subject-legend" aria-label="Subject colors">
          {subjects.map(subject => <span key={subject.id}><i style={{ backgroundColor: subject.color }} aria-hidden="true" />{subject.name}</span>)}
          {subjects.length === 0 && <span>Your subjects will appear here.</span>}
        </div>
      </footer>

      {/* Share dialog */}
      {shareDialogOpen && (
        <div className="modal-overlay" onMouseDown={() => setShareDialogOpen(false)}>
          <div className="modal-content share-dialog-content" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Continue on another device</h2>
              <button className="close-button" aria-label="Close share dialog" onClick={() => setShareDialogOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body share-dialog-body">
              <p className="share-dialog-hint">
                Open or send this link on your tablet or desktop to continue editing this timetable. The link captures the current version, so create a new one after making more changes.
              </p>
              <div className="share-link-row">
                <input
                  className="form-control share-link-input"
                  value={shareLink}
                  readOnly
                  onFocus={e => e.target.select()}
                  aria-label="Timetable share link"
                />
                <button className="btn btn-primary share-copy-button" onClick={() => copyShareLink(shareLink)}>
                  <Copy size={16} />
                  {shareCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="share-privacy-note">Anyone with this link can view and edit a copy of the timetable data in it.</p>
            </div>
          </div>
        </div>
      )}

      {/* Subject form modal */}
      {modalOpen && (
        <div className="modal-overlay" onMouseDown={closeSubjectModal}>
          <div className="modal-content" onMouseDown={e => {
            // Close dropdowns if clicking elsewhere in the modal
            if (!e.target.closest('.search-input-wrapper') && !e.target.closest('.location-input-wrapper') && !e.target.closest('.subject-dropdown')) {
              setShowSubjectDropdown(false);
              setActiveLocationDropdown(null);
            }
            e.stopPropagation();
          }}>
            <div className="modal-header">
              <h2 className="modal-title">{editingId ? 'Edit Subject' : 'Add Subject'}</h2>
              <button className="close-button" onClick={closeSubjectModal}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <form id="subject-form" onSubmit={handleSave}>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 3, position: 'relative', zIndex: showSubjectDropdown ? 100 : 1 }}>
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

                  <div className="form-group section-input-wrapper" style={{ flex: 1, zIndex: showSectionDropdown ? 100 : 1 }}>
                    <label>Section</label>
                    <input
                      className="form-control"
                      placeholder="e.g. S1 or custom"
                      value={formData.section}
                      onFocus={() => setShowSectionDropdown(true)}
                      onChange={e => setFormData({ ...formData, section: e.target.value })}
                      aria-label="Section name"
                    />
                    {showSectionDropdown && (
                      <div className="subject-dropdown section-dropdown" ref={sectionDropdownRef}>
                        {sectionOptions.customValue && (
                          <div className="subject-option custom-entry" onClick={() => setShowSectionDropdown(false)}>
                            <Plus size={14} className="mr-2" />Use custom: "{sectionOptions.customValue}"
                          </div>
                        )}
                        {sectionOptions.options.map(section => (
                          <div key={section} className="subject-option" onClick={() => { setFormData({ ...formData, section }); setShowSectionDropdown(false); }}>
                            {section}
                          </div>
                        ))}
                      </div>
                    )}
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
                        <div className="form-group location-input-wrapper" style={{ position: 'relative', zIndex: activeLocationDropdown === sIdx ? 100 : 1 }}>
                          <label>Location (Optional)</label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Search or type room name"
                            value={session.location}
                            onFocus={() => setActiveLocationDropdown(sIdx)}
                            onChange={(e) => {
                              handleSessionChange(sIdx, 'location', e.target.value);
                              setActiveLocationDropdown(sIdx);
                            }}
                          />
                          {activeLocationDropdown === sIdx && (
                            <div className="custom-dropdown subject-dropdown" ref={locationDropdownRef} style={{ maxHeight: '160px' }}>
                              {session.location.trim() ? (
                                <div
                                  className="subject-option custom-entry"
                                  onClick={() => setActiveLocationDropdown(null)}
                                >
                                  <Plus size={14} className="mr-2" style={{ display: 'inline' }} />
                                  Use custom: "{session.location}"
                                </div>
                              ) : (
                                <div className="subject-no-results custom-location-hint">
                                  Type a location above to use a custom room name.
                                </div>
                              )}

                              {roomList
                                .filter(r => r.toLowerCase().includes(session.location.toLowerCase()))
                                .slice(0, 30)
                                .map((r, i) => (
                                  <div
                                    key={i}
                                    className="subject-option"
                                    onClick={() => {
                                      handleSessionChange(sIdx, 'location', r);
                                      setActiveLocationDropdown(null);
                                    }}
                                  >
                                    <MapPin size={14} style={{ display: 'inline', marginRight: '6px', color: 'var(--text-muted)' }} />
                                    {r}
                                  </div>
                                ))}

                              {session.location && roomList.filter(r => r.toLowerCase().includes(session.location.toLowerCase())).length === 0 && (
                                <div className="subject-no-results">No matches. Use custom name above.</div>
                              )}
                            </div>
                          )}
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
                            {timeSlots.map((_, i) => (
                              <option key={`start-${i}`} value={i}>{formatHour(i, timeFormat)}</option>
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
                            {timeSlots.map((_, i) => (
                              <option
                                key={`end-${i}`}
                                value={i + 1}
                                disabled={i + 1 <= session.startIndex}
                              >
                                {formatHour(i + 1, timeFormat)}
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
              <button type="button" className="btn btn-secondary" onClick={closeSubjectModal}>
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
