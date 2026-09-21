import LZString from 'lz-string';

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = LZString;

export const SHARE_QUERY_PARAM = 'timetable';
const SHARE_VERSION = 2;

const fromBase64Url = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};

const toCompactPayload = (subjects, timeFormat) => ({
  v: SHARE_VERSION,
  f: timeFormat === '12h' ? 1 : 0,
  s: subjects.map(subject => [
    subject.id,
    subject.name,
    subject.section || '',
    subject.color,
    subject.sessions.map(session => [
      session.id,
      session.day,
      session.startIndex,
      session.endIndex,
      session.location || '',
      session.lecturer || '',
      session.type || 'Lecture',
    ]),
  ]),
});

const fromCompactPayload = (payload) => {
  if (
    payload?.v !== SHARE_VERSION ||
    !Array.isArray(payload.s) ||
    !payload.s.every(subject => Array.isArray(subject) && subject.length === 5 && Array.isArray(subject[4]))
  ) {
    return null;
  }

  const subjects = payload.s.map(([id, name, section, color, sessions]) => ({
    id,
    name,
    section,
    color,
    sessions: sessions.map(([sessionId, day, startIndex, endIndex, location, lecturer, type]) => ({
      id: sessionId,
      day,
      startIndex,
      endIndex,
      location,
      lecturer,
      type,
    })),
  }));

  return {
    subjects,
    timeFormat: payload.f === 1 ? '12h' : '24h',
  };
};

const decodeLegacyPayload = (encoded) => {
  try {
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
    if (
      decoded?.version !== 1 ||
      !Array.isArray(decoded.subjects) ||
      !decoded.subjects.every(subject => subject && typeof subject === 'object' && Array.isArray(subject.sessions))
    ) {
      return null;
    }

    return {
      subjects: decoded.subjects,
      timeFormat: decoded.timeFormat === '12h' ? '12h' : '24h',
    };
  } catch {
    return null;
  }
};

export const encodeTimetable = (subjects, timeFormat = '24h') => (
  compressToEncodedURIComponent(JSON.stringify(toCompactPayload(subjects, timeFormat)))
);

export const decodeTimetable = (encoded) => {
  if (!encoded) return null;

  try {
    const compressedPayload = decompressFromEncodedURIComponent(encoded);
    const decoded = compressedPayload ? fromCompactPayload(JSON.parse(compressedPayload)) : null;
    return decoded || decodeLegacyPayload(encoded);
  } catch {
    return decodeLegacyPayload(encoded);
  }
};

export const readTimetableFromLocation = (location = window.location) => {
  const encoded = new URLSearchParams(location.search).get(SHARE_QUERY_PARAM);
  return decodeTimetable(encoded);
};

export const createTimetableShareUrl = (subjects, timeFormat = '24h', location = window.location) => {
  const url = new URL('/planner', location.origin);
  url.searchParams.set(SHARE_QUERY_PARAM, encodeTimetable(subjects, timeFormat));
  return url.toString();
};
