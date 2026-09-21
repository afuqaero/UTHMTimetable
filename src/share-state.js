export const SHARE_QUERY_PARAM = 'timetable';
const SHARE_VERSION = 1;

const toBase64Url = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const fromBase64Url = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};

export const encodeTimetable = (subjects, timeFormat = '24h') => {
  const payload = JSON.stringify({
    version: SHARE_VERSION,
    subjects,
    timeFormat,
  });

  return toBase64Url(new TextEncoder().encode(payload));
};

export const decodeTimetable = (encoded) => {
  if (!encoded) return null;

  try {
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
    if (
      decoded?.version !== SHARE_VERSION ||
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

export const readTimetableFromLocation = (location = window.location) => {
  const encoded = new URLSearchParams(location.search).get(SHARE_QUERY_PARAM);
  return decodeTimetable(encoded);
};

export const createTimetableShareUrl = (subjects, timeFormat = '24h', location = window.location) => {
  const url = new URL('/planner', location.origin);
  url.searchParams.set(SHARE_QUERY_PARAM, encodeTimetable(subjects, timeFormat));
  return url.toString();
};
