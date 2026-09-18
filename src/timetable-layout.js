export const formatHour = (index, timeFormat = '24h') => {
  const hour = (8 + Number(index)) % 24;

  if (timeFormat === '12h') {
    const meridiem = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:00 ${meridiem}`;
  }

  return `${String(hour).padStart(2, '0')}:00`;
};

export const formatTimeRange = (index, timeFormat = '24h') => `${formatHour(index, timeFormat)}–${formatHour(Number(index) + 1, timeFormat)}`;

export const getSessionLayoutKey = (subjectId, sessionIndex) => `${subjectId}:${sessionIndex}`;

export const buildSessionLayout = (subjects, days) => {
  const sessions = {};
  const dayLaneCounts = Object.fromEntries(days.map(day => [day, 1]));

  days.forEach(day => {
    const daySessions = subjects
      .flatMap(subject => subject.sessions.map((session, sessionIndex) => ({
        key: getSessionLayoutKey(subject.id, sessionIndex),
        day: session.day,
        start: Number(session.startIndex),
        end: Number(session.endIndex),
      })))
      .filter(session => session.day === day
        && Number.isFinite(session.start)
        && Number.isFinite(session.end)
        && session.end > session.start)
      .sort((left, right) => left.start - right.start || left.end - right.end || left.key.localeCompare(right.key));

    let cluster = [];
    let clusterEnd = -Infinity;
    let laneEnds = [];

    const finishCluster = () => {
      if (cluster.length === 0) return;

      const laneCount = laneEnds.length;
      cluster.forEach(session => {
        sessions[session.key] = {
          laneIndex: session.laneIndex,
          laneCount,
        };
      });
      dayLaneCounts[day] = Math.max(dayLaneCounts[day], laneCount);
    };

    daySessions.forEach(session => {
      if (cluster.length > 0 && session.start >= clusterEnd) {
        finishCluster();
        cluster = [];
        clusterEnd = -Infinity;
        laneEnds = [];
      }

      let laneIndex = laneEnds.findIndex(end => end <= session.start);
      if (laneIndex === -1) {
        laneIndex = laneEnds.length;
        laneEnds.push(session.end);
      } else {
        laneEnds[laneIndex] = session.end;
      }

      cluster.push({ ...session, laneIndex });
      clusterEnd = Math.max(clusterEnd, session.end);
    });

    finishCluster();
  });

  return { sessions, dayLaneCounts };
};
