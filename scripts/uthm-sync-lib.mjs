const BASE_URL = 'https://timetable.uthm.edu.my';

const DEFAULT_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
};

const ENTITY_MAP = {
  '&amp;': '&',
  '&quot;': '"',
  '&#039;': "'",
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
};

export const ENDPOINTS = {
  home: '/',
  course: '/index.php/site/course',
  room: '/index.php/site/room',
  batch: '/index.php/site/batch',
  lecturer: '/index.php/site/lecturer',
  searchLecturer: '/index.php/site/searchLecturer',
  showScheduleDetail: '/index.php/site/showScheduleDetail',
};

export class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  getCookieHeader() {
    return [...this.cookies.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  capture(headers) {
    if (typeof headers.getSetCookie !== 'function') {
      return;
    }

    for (const line of headers.getSetCookie()) {
      const [pair] = line.split(';');
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (name) {
        this.cookies.set(name, value);
      }
    }
  }
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchText(endpoint, {
  method = 'GET',
  form = null,
  body = null,
  headers = {},
  cookieJar = null,
  timeoutMs = 30_000,
  referer = null,
} = {}) {
  const requestHeaders = new Headers({
    ...DEFAULT_HEADERS,
    ...headers,
  });

  if (cookieJar) {
    const cookieHeader = cookieJar.getCookieHeader();
    if (cookieHeader) {
      requestHeaders.set('cookie', cookieHeader);
    }
  }

  if (referer) {
    requestHeaders.set('referer', new URL(referer, BASE_URL).toString());
  }

  let requestBody = body;
  if (form) {
    requestBody = new URLSearchParams(form).toString();
    if (!requestHeaders.has('content-type')) {
      requestHeaders.set('content-type', 'application/x-www-form-urlencoded; charset=UTF-8');
    }
  }

  const url = new URL(endpoint, BASE_URL).toString();
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (cookieJar) {
    cookieJar.capture(response.headers);
  }

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&(amp|quot|#039|nbsp|lt|gt);/g, match => ENTITY_MAP[match] ?? match)
    .replace(/&#(\d+);/g, (_, codePoint) => String.fromCharCode(Number(codePoint)));
}

export function stripTags(value) {
  return decodeHtmlEntities(
    String(value ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
}

export function cleanText(value) {
  return decodeHtmlEntities(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitLines(value) {
  return stripTags(value)
    .split('\n')
    .map(line => cleanText(line))
    .filter(Boolean);
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function slugify(value, maxLength = 96) {
  const slug = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'untitled';
  return slug.slice(0, maxLength).replace(/-+$/g, '') || 'untitled';
}

export function formatTimestamp(value = new Date()) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function parseMinutesFromWorkload(value) {
  const match = cleanText(value).match(/(\d+)\s*H\s*(\d+)\s*M/i);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function parseSemesterLabel(html) {
  const decoded = decodeHtmlEntities(html);
  const match = decoded.match(/JADUAL WAKTU KULIAH AKADEMIK\s*([^<\n]+)/i);
  return match ? cleanText(match[0]) : null;
}

export function parseSemesterCode(html) {
  const decoded = decodeHtmlEntities(html);
  const match = decoded.match(/semester'\s*:\s*'(\d+)'/i);
  return match ? match[1] : null;
}

export function parseOptionsMarkup(markup) {
  return [...String(markup ?? '').matchAll(/<option([^>]*)value="([^"]*)"([^>]*)>([\s\S]*?)<\/option>/gi)]
    .map(([, beforeAttrs, value, afterAttrs, label]) => ({
      value: cleanText(value),
      label: cleanText(stripTags(label)),
      selected: /selected/i.test(`${beforeAttrs} ${afterAttrs}`),
    }));
}

export function extractSelectOptionsById(html, selectId) {
  const selectRegex = new RegExp(
    `<select[^>]*id="${escapeRegExp(selectId)}"[^>]*>([\\s\\S]*?)<\\/select>`,
    'i'
  );
  const match = String(html ?? '').match(selectRegex);
  return match ? parseOptionsMarkup(match[1]) : [];
}

export function parseCoursePrograms(html) {
  return extractSelectOptionsById(html, 'Dummy_text4')
    .filter(option => option.value && !option.label.startsWith('-'));
}

export function parseCourseOptions(html) {
  return extractSelectOptionsById(html, 'Dummy_text5')
    .filter(option => option.value && option.label.includes(' - '))
    .map(option => {
      const [code, ...nameParts] = option.label.split(' - ');
      return {
        code: cleanText(code),
        name: cleanText(nameParts.join(' - ')),
        label: option.label,
      };
    });
}

export function parseRoomBuildings(html) {
  return extractSelectOptionsById(html, 'Dummy_text3')
    .filter(option => option.value && !option.label.startsWith('-'));
}

export function parseRoomOptions(html, building = null) {
  return extractSelectOptionsById(html, 'Dummy_text4')
    .filter(option => option.value && !option.value.startsWith('-----'))
    .filter(option => /\(\d+\)\s*-\s*/.test(option.label))
    .map(option => {
      const match = option.label.match(/^(.*?)\s*\((\d+)\)\s*-\s*(.+)$/);
      return {
        code: cleanText(option.value),
        building,
        capacity: match ? Number(match[2]) : null,
        roomType: match ? cleanText(match[3]) : null,
        label: option.label,
      };
    });
}

export function parseBatchFaculties(html) {
  return extractSelectOptionsById(html, 'Dummy_text4')
    .filter(option => option.value && !option.label.startsWith('-'));
}

export function parseCohortOptions(html, faculty = null) {
  return extractSelectOptionsById(html, 'Dummy_text5')
    .filter(option => option.value && !option.label.startsWith('-'))
    .map(option => ({
      id: option.value,
      label: option.label,
      faculty,
    }));
}

export function parseLecturerFaculties(html) {
  return extractSelectOptionsById(html, 'Dummy_text4')
    .filter(option => option.value && !option.label.startsWith('-'));
}

export function parseLecturerOptions(html, faculty = null) {
  return extractSelectOptionsById(html, 'Dummy_text5')
    .filter(option => option.value && !option.label.startsWith('-'))
    .map(option => ({
      id: option.value,
      label: option.label,
      faculty,
    }));
}

export function normalizeRoomCode(value) {
  return cleanText(String(value ?? '').replace(/\s*\([^)]*\)\s*$/, ''));
}

export function splitVenueLabel(value) {
  const cleanValue = cleanText(value);
  const match = cleanValue.match(/^(.*?)\s*\(([^()]*)\)$/);
  if (!match) {
    return {
      venueCode: cleanValue,
      venueContext: null,
    };
  }

  return {
    venueCode: cleanText(match[1]),
    venueContext: cleanText(match[2]),
  };
}

export function extractDetailIdMap(html) {
  const result = new Map();
  const regex = /on\('click','#([^']+)',function\(\)\{jQuery\.ajax\(\{'type':'POST','data':\{'id':(\d+),'readOnly':1,'source':'([^']+)'/g;
  for (const [, anchorId, detailId, source] of String(html ?? '').matchAll(regex)) {
    result.set(anchorId, {
      detailId: Number(detailId),
      source,
    });
  }
  return result;
}

export function parseScheduleBlocks(html) {
  const detailIds = extractDetailIdMap(html);
  const anchorRegex = /<a[^>]*id="([^"]+)"[^>]*><span[^>]*title="Click to view details \(([^:]+?) : ([0-9]{2}:[0-9]{2}) - ([0-9]{2}:[0-9]{2})\)">([\s\S]*?)<\/span><\/a>/gi;

  return [...String(html ?? '').matchAll(anchorRegex)].map(([, anchorId, day, startTime, endTime, blockHtml]) => {
    const lines = splitLines(blockHtml);
    const groupLine = lines[2] ?? '';
    const groupMatch = groupLine.match(/^\((.*?)\)\s+(.+)$/);
    const venue = splitVenueLabel(lines[3] ?? '');
    const detail = detailIds.get(anchorId) ?? null;

    return {
      anchorId,
      detailId: detail?.detailId ?? null,
      source: detail?.source ?? null,
      day: cleanText(day),
      startTime,
      endTime,
      courseCode: lines[0] ?? '',
      courseName: lines[1] ?? '',
      group: groupMatch ? cleanText(groupMatch[1]) : null,
      classTypeCode: groupMatch ? cleanText(groupMatch[2]) : null,
      venueLabel: lines[3] ?? '',
      venueCode: venue.venueCode,
      venueContext: venue.venueContext,
    };
  });
}

export function parseCourseSchedulePage(html) {
  const decoded = decodeHtmlEntities(html);
  const courseCode = decoded.match(/Course Schedule\s*:\s*([^<\n]+)/i)?.[1] ?? null;
  const workloadText = decoded.match(/Total Workload\s*:\s*([^<\n]+)/i)?.[1] ?? null;

  return {
    courseCode: cleanText(courseCode),
    workloadText: cleanText(workloadText),
    workloadMinutes: parseMinutesFromWorkload(workloadText),
    sessions: parseScheduleBlocks(html),
  };
}

export function parseCohortSchedulePage(html) {
  const decoded = decodeHtmlEntities(html);
  const cohortId = decoded.match(/Cohort Schedule\s*:\s*([^<\n]+)/i)?.[1] ?? null;
  const workloadText = decoded.match(/Total Workload\s*:\s*([^<\n]+)/i)?.[1] ?? null;
  const coursesList = decoded.match(/(?:Courses List|Course\(s\) List)\s*:\s*([^<\n]+)/i)?.[1] ?? null;

  return {
    cohortId: cleanText(cohortId),
    workloadText: cleanText(workloadText),
    workloadMinutes: parseMinutesFromWorkload(workloadText),
    coursesList: cleanText(coursesList),
    sessions: parseScheduleBlocks(html),
  };
}

export function parseRoomSchedulePage(html) {
  const decoded = decodeHtmlEntities(html);
  const roomLabel = decoded.match(/Room Schedule\s*:\s*([^<\n]+)/i)?.[1] ?? null;
  const workloadText = decoded.match(/Total Workload\s*:\s*([^<\n]+)/i)?.[1] ?? null;

  return {
    roomLabel: cleanText(roomLabel),
    workloadText: cleanText(workloadText),
    workloadMinutes: parseMinutesFromWorkload(workloadText),
    sessions: parseScheduleBlocks(html),
  };
}

export function parseDetailPage(html) {
  const rows = [...String(html ?? '').matchAll(/<tr[\s\S]*?<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)];
  const fields = {};

  for (const [, keyMarkup, valueMarkup] of rows) {
    const key = cleanText(stripTags(keyMarkup));
    const value = cleanText(stripTags(valueMarkup));
    if (key) {
      fields[key] = value;
    }
  }

  const courseValue = fields.Course ?? '';
  const [courseCode, ...courseNameParts] = courseValue.split(' - ');

  return {
    fields,
    day: fields.Day ?? null,
    timeRange: fields.Time ?? null,
    venue: fields.Venue ?? null,
    courseCode: cleanText(courseCode),
    courseName: cleanText(courseNameParts.join(' - ')),
    group: fields.Group ?? null,
    classTypeCode: fields['Class Type'] ?? null,
    classDuration: fields['Class Duration'] ?? null,
    department: fields.Department ?? null,
    studentCountCourse: Number(fields['Number of Student in Course']?.match(/^\d+/)?.[0] ?? NaN),
    studentCountClass: Number(fields['Number of Student in Class']?.match(/^\d+/)?.[0] ?? NaN),
  };
}

export function sortObjectsByKey(items, key) {
  return [...items].sort((left, right) => String(left[key]).localeCompare(String(right[key])));
}

export function uniqueSorted(values) {
  return [...new Set(values.map(value => cleanText(value)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export { BASE_URL };
