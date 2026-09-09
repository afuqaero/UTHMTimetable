import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CookieJar,
  ENDPOINTS,
  cleanText,
  delay,
  fetchText,
  formatTimestamp,
  normalizeRoomCode,
  parseBatchFaculties,
  parseCohortOptions,
  parseCohortSchedulePage,
  parseCourseOptions,
  parseCoursePrograms,
  parseCourseSchedulePage,
  parseDetailPage,
  parseLecturerFaculties,
  parseLecturerOptions,
  parseOptionsMarkup,
  parseRoomBuildings,
  parseRoomOptions,
  parseRoomSchedulePage,
  parseSemesterCode,
  parseSemesterLabel,
  slugify,
  sortObjectsByKey,
  uniqueSorted,
} from './uthm-sync-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const DATA_DIR = path.join(ROOT_DIR, 'src', 'data');
const UTHM_DATA_DIR = path.join(DATA_DIR, 'uthm');
const RAW_ROOT_DIR = path.join(ROOT_DIR, 'misc', 'uthm-scrape');

const REQUEST_DELAY_MS = 75;

const SAMPLE_PROGRAM = 'FSKTM';
const SAMPLE_COURSE = 'BIW30503';
const SAMPLE_FACULTY = 'FSKTM';
const SAMPLE_COHORT = 'FSKTM-3BIW';
const SAMPLE_ROOM_BUILDING = 'FSKTM';
const SAMPLE_ROOM = 'I-BT1';
const SAMPLE_LECTURER_QUERY = 'syafiq';

async function readJson(filePath, fallbackValue) {
  try {
    const contents = await fs.readFile(filePath, 'utf8');
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallbackValue;
    }
    throw error;
  }
}

async function writeText(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

async function writeJson(filePath, value) {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function toRelativeRepoPath(filePath) {
  return path.relative(ROOT_DIR, filePath).split(path.sep).join('/');
}

function createCourseRecord(existingRecord, course, program) {
  const nextRecord = existingRecord ?? {
    code: course.code,
    name: course.name,
    programs: [],
  };

  if (!nextRecord.name && course.name) {
    nextRecord.name = course.name;
  }

  if (program) {
    nextRecord.programs = uniqueSorted([...(nextRecord.programs ?? []), program]);
  }

  return nextRecord;
}

function createLecturerRecord(existingRecord, lecturer, faculty) {
  const nextRecord = existingRecord ?? {
    id: lecturer.id,
    label: lecturer.label,
    faculties: [],
  };

  if (!nextRecord.label && lecturer.label) {
    nextRecord.label = lecturer.label;
  }

  if (faculty) {
    nextRecord.faculties = uniqueSorted([...(nextRecord.faculties ?? []), faculty]);
  }

  return nextRecord;
}

function createRoomRecord(existingRecord, room) {
  const nextRecord = existingRecord ?? {
    code: room.code,
    building: room.building ?? null,
    capacity: room.capacity ?? null,
    roomType: room.roomType ?? null,
    label: room.label ?? room.code,
  };

  if (!nextRecord.building && room.building) {
    nextRecord.building = room.building;
  }

  if (nextRecord.capacity == null && room.capacity != null) {
    nextRecord.capacity = room.capacity;
  }

  if (!nextRecord.roomType && room.roomType) {
    nextRecord.roomType = room.roomType;
  }

  if ((!nextRecord.label || nextRecord.label === nextRecord.code) && room.label) {
    nextRecord.label = room.label;
  }

  return nextRecord;
}

function computeSubjectDrift(previousSubjects, nextSubjects) {
  const previous = uniqueSorted(previousSubjects);
  const next = uniqueSorted(nextSubjects);
  const previousSet = new Set(previous);
  const nextSet = new Set(next);
  const overlap = next.filter(subject => previousSet.has(subject));
  const previousOnly = previous.filter(subject => !nextSet.has(subject));
  const nextOnly = next.filter(subject => !previousSet.has(subject));

  return {
    previousCount: previous.length,
    nextCount: next.length,
    overlapCount: overlap.length,
    previousOnlyCount: previousOnly.length,
    nextOnlyCount: nextOnly.length,
    previousOnlySample: previousOnly.slice(0, 15),
    nextOnlySample: nextOnly.slice(0, 15),
  };
}

function computeRoomDrift(previousRooms, nextRooms) {
  const previousRaw = uniqueSorted(previousRooms);
  const previousBuckets = new Map();

  for (const room of previousRaw) {
    const normalized = normalizeRoomCode(room);
    const variants = previousBuckets.get(normalized) ?? [];
    variants.push(room);
    previousBuckets.set(normalized, variants);
  }

  const previousNormalized = [...previousBuckets.keys()].sort((left, right) => left.localeCompare(right));
  const nextNormalized = uniqueSorted(nextRooms.map(room => normalizeRoomCode(room)));
  const previousNormalizedSet = new Set(previousNormalized);
  const nextNormalizedSet = new Set(nextNormalized);
  const previousOnly = previousNormalized.filter(room => !nextNormalizedSet.has(room));
  const nextOnly = nextNormalized.filter(room => !previousNormalizedSet.has(room));
  const duplicateNormalizedLocal = [...previousBuckets.entries()]
    .filter(([, variants]) => variants.length > 1)
    .map(([code, variants]) => ({
      code,
      variants,
    }))
    .sort((left, right) => left.code.localeCompare(right.code));

  return {
    previousCount: previousRaw.length,
    previousNormalizedCount: previousNormalized.length,
    nextCount: nextNormalized.length,
    overlapCount: nextNormalized.filter(room => previousNormalizedSet.has(room)).length,
    previousOnlyCount: previousOnly.length,
    nextOnlyCount: nextOnly.length,
    previousOnlySample: previousOnly.slice(0, 15),
    nextOnlySample: nextOnly.slice(0, 15),
    duplicateNormalizedLocalCount: duplicateNormalizedLocal.length,
    duplicateNormalizedLocalSample: duplicateNormalizedLocal.slice(0, 15),
  };
}

function validateGeneratedSubjects(subjects) {
  const sorted = subjects.every((subject, index) => index === 0 || subjects[index - 1].localeCompare(subject) <= 0);
  const unique = new Set(subjects).size === subjects.length;
  const nonEmpty = subjects.length > 0;

  return {
    ok: sorted && unique && nonEmpty,
    sorted,
    unique,
    nonEmpty,
    count: subjects.length,
  };
}

function validateGeneratedRooms(rooms) {
  const sorted = rooms.every((room, index) => index === 0 || rooms[index - 1].localeCompare(room) <= 0);
  const unique = new Set(rooms).size === rooms.length;
  const nonEmpty = rooms.length > 0;
  const normalizedUnique = new Set(rooms.map(room => normalizeRoomCode(room))).size === rooms.length;

  return {
    ok: sorted && unique && nonEmpty && normalizedUnique,
    sorted,
    unique,
    nonEmpty,
    normalizedUnique,
    count: rooms.length,
  };
}

function timeToMinutes(value) {
  const match = String(value ?? '').match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function validateCohortSessions(sessions) {
  const invalidSessions = [];

  for (const session of sessions) {
    const startMinutes = timeToMinutes(session.startTime);
    const endMinutes = timeToMinutes(session.endTime);
    const valid =
      Boolean(session.cohortId) &&
      Boolean(session.courseCode) &&
      Boolean(session.day) &&
      startMinutes != null &&
      endMinutes != null &&
      startMinutes < endMinutes;

    if (!valid) {
      invalidSessions.push(session);
    }
  }

  return {
    ok: sessions.length > 0 && invalidSessions.length === 0,
    nonEmpty: sessions.length > 0,
    invalidCount: invalidSessions.length,
    invalidSample: invalidSessions.slice(0, 10),
    count: sessions.length,
  };
}

async function fetchSelectionPage(endpoint, initialForm = null, finalForm = null) {
  const cookieJar = new CookieJar();
  const homeHtml = await fetchText(endpoint, { cookieJar });
  let selectionHtml = homeHtml;
  let finalHtml = homeHtml;

  if (initialForm) {
    await delay(REQUEST_DELAY_MS);
    selectionHtml = await fetchText(endpoint, {
      method: 'POST',
      cookieJar,
      referer: endpoint,
      form: initialForm,
    });
    finalHtml = selectionHtml;
  }

  if (finalForm) {
    await delay(REQUEST_DELAY_MS);
    finalHtml = await fetchText(endpoint, {
      method: 'POST',
      cookieJar,
      referer: endpoint,
      form: finalForm,
    });
  }

  return {
    cookieJar,
    homeHtml,
    selectionHtml,
    finalHtml,
  };
}

async function main() {
  const startedAt = new Date();
  const scrapeTimestamp = formatTimestamp(startedAt);
  const subjectsPath = path.join(DATA_DIR, 'subjects.json');
  const roomsPath = path.join(DATA_DIR, 'rooms.json');
  const warnings = [];

  const [previousSubjects, previousRooms] = await Promise.all([
    readJson(subjectsPath, []),
    readJson(roomsPath, []),
  ]);

  console.log('Fetching UTHM landing pages...');

  const [
    homeHtml,
    courseHome,
    roomHome,
    batchHome,
    lecturerHome,
  ] = await Promise.all([
    fetchText(ENDPOINTS.home, { cookieJar: new CookieJar() }),
    fetchText(ENDPOINTS.course, { cookieJar: new CookieJar() }),
    fetchText(ENDPOINTS.room, { cookieJar: new CookieJar() }),
    fetchText(ENDPOINTS.batch, { cookieJar: new CookieJar() }),
    fetchText(ENDPOINTS.lecturer, { cookieJar: new CookieJar() }),
  ]);

  const semesterLabel =
    parseSemesterLabel(homeHtml) ??
    parseSemesterLabel(courseHome) ??
    parseSemesterLabel(batchHome) ??
    'UTHM timetable semester';
  const semesterCode =
    parseSemesterCode(courseHome) ??
    parseSemesterCode(roomHome) ??
    parseSemesterCode(batchHome) ??
    parseSemesterCode(lecturerHome) ??
    null;
  const semesterSlug = slugify(semesterLabel);
  const rawSnapshotDir = path.join(RAW_ROOT_DIR, semesterSlug, scrapeTimestamp);

  await Promise.all([
    fs.mkdir(UTHM_DATA_DIR, { recursive: true }),
    fs.mkdir(rawSnapshotDir, { recursive: true }),
  ]);

  await Promise.all([
    writeText(path.join(rawSnapshotDir, 'home.html'), homeHtml),
    writeText(path.join(rawSnapshotDir, 'course-home.html'), courseHome),
    writeText(path.join(rawSnapshotDir, 'room-home.html'), roomHome),
    writeText(path.join(rawSnapshotDir, 'batch-home.html'), batchHome),
    writeText(path.join(rawSnapshotDir, 'lecturer-home.html'), lecturerHome),
  ]);

  const coursePrograms = parseCoursePrograms(courseHome);
  const roomBuildings = parseRoomBuildings(roomHome);
  const batchFaculties = parseBatchFaculties(batchHome);
  const lecturerFaculties = parseLecturerFaculties(lecturerHome);

  const courseMap = new Map();
  for (const course of parseCourseOptions(courseHome)) {
    courseMap.set(course.code, createCourseRecord(courseMap.get(course.code), course, null));
  }

  console.log(`Scraping ${coursePrograms.length} course program views...`);
  for (const program of coursePrograms) {
    const { selectionHtml } = await fetchSelectionPage(ENDPOINTS.course, {
      'Dummy[text2]': '50',
      'Dummy[text4]': program.value,
    });

    await writeText(
      path.join(rawSnapshotDir, 'course-programs', `${slugify(program.value)}.html`),
      selectionHtml
    );

    for (const course of parseCourseOptions(selectionHtml)) {
      courseMap.set(course.code, createCourseRecord(courseMap.get(course.code), course, program.value));
    }
  }

  const roomMap = new Map();
  for (const room of parseRoomOptions(roomHome)) {
    roomMap.set(room.code, createRoomRecord(roomMap.get(room.code), room));
  }

  console.log(`Scraping ${roomBuildings.length} room building views...`);
  for (const building of roomBuildings) {
    const { selectionHtml } = await fetchSelectionPage(ENDPOINTS.room, {
      'Dummy[text2]': '50',
      'Dummy[text3]': building.value,
    });

    await writeText(
      path.join(rawSnapshotDir, 'room-buildings', `${slugify(building.value)}.html`),
      selectionHtml
    );

    for (const room of parseRoomOptions(selectionHtml, building.value)) {
      roomMap.set(room.code, createRoomRecord(roomMap.get(room.code), room));
    }
  }

  const cohortMap = new Map();
  const cohortDetails = [];
  const cohortSessions = [];
  let sampleCohortCheck = null;

  console.log(`Scraping cohort catalogs and schedules from ${batchFaculties.length} faculties...`);
  for (const faculty of batchFaculties) {
    const facultyFlow = await fetchSelectionPage(ENDPOINTS.batch, {
      'Dummy[text2]': '50',
      'Dummy[text4]': faculty.value,
    });

    await writeText(
      path.join(rawSnapshotDir, 'batch-faculties', `${slugify(faculty.value)}.html`),
      facultyFlow.selectionHtml
    );

    const cohorts = parseCohortOptions(facultyFlow.selectionHtml, faculty.value);
    for (const cohort of cohorts) {
      cohortMap.set(cohort.id, {
        id: cohort.id,
        label: cohort.label,
        faculty: cohort.faculty,
      });
    }

    console.log(`Faculty ${faculty.value}: ${cohorts.length} cohorts`);
    for (const cohort of cohorts) {
      await delay(REQUEST_DELAY_MS);
      const cohortHtml = await fetchText(ENDPOINTS.batch, {
        method: 'POST',
        cookieJar: facultyFlow.cookieJar,
        referer: ENDPOINTS.batch,
        form: {
          'Dummy[text2]': '50',
          'Dummy[text4]': faculty.value,
          'Dummy[text5]': cohort.id,
        },
      });

      await writeText(
        path.join(
          rawSnapshotDir,
          'batch-cohorts',
          slugify(faculty.value),
          `${slugify(cohort.id)}.html`
        ),
        cohortHtml
      );

      const parsedSchedule = parseCohortSchedulePage(cohortHtml);
      const sessions = parsedSchedule.sessions.map(session => ({
        cohortId: cohort.id,
        faculty: faculty.value,
        courseCode: cleanText(session.courseCode),
        courseName: cleanText(session.courseName),
        day: cleanText(session.day),
        startTime: session.startTime,
        endTime: session.endTime,
        group: session.group,
        classTypeCode: session.classTypeCode,
        venueCode: session.venueCode,
        venueContext: session.venueContext,
      }));

      cohortDetails.push({
        id: cohort.id,
        label: cohort.label,
        faculty: faculty.value,
        workloadText: parsedSchedule.workloadText,
        workloadMinutes: parsedSchedule.workloadMinutes,
        sessionCount: sessions.length,
        courseCodes: uniqueSorted(sessions.map(session => session.courseCode)),
      });
      cohortSessions.push(...sessions);

      if (cohort.id === SAMPLE_COHORT) {
        sampleCohortCheck = {
          workloadText: parsedSchedule.workloadText,
          sessionCount: sessions.length,
          containsBIW33103: sessions.some(session => session.courseCode === 'BIW33103'),
          containsBIW30503: sessions.some(session => session.courseCode === 'BIW30503'),
        };
      }
    }
  }

  const lecturerMap = new Map();
  for (const lecturer of parseLecturerOptions(lecturerHome)) {
    lecturerMap.set(lecturer.id, createLecturerRecord(lecturerMap.get(lecturer.id), lecturer, null));
  }

  console.log(`Scraping lecturer faculty views from ${lecturerFaculties.length} faculties...`);
  for (const faculty of lecturerFaculties) {
    try {
      const { selectionHtml } = await fetchSelectionPage(ENDPOINTS.lecturer, {
        'Dummy[text2]': '50',
        'Dummy[text4]': faculty.value,
      });

      await writeText(
        path.join(rawSnapshotDir, 'lecturer-faculties', `${slugify(faculty.value)}.html`),
        selectionHtml
      );

      for (const lecturer of parseLecturerOptions(selectionHtml, faculty.value)) {
        lecturerMap.set(
          lecturer.id,
          createLecturerRecord(lecturerMap.get(lecturer.id), lecturer, faculty.value)
        );
      }
    } catch (error) {
      warnings.push(`Lecturer faculty view failed for ${faculty.value}: ${error.message}`);
    }
  }

  const courseSampleFlow = await fetchSelectionPage(
    ENDPOINTS.course,
    {
      'Dummy[text2]': '50',
      'Dummy[text4]': SAMPLE_PROGRAM,
    },
    {
      'Dummy[text2]': '50',
      'Dummy[text4]': SAMPLE_PROGRAM,
      'Dummy[text5]': SAMPLE_COURSE,
    }
  );
  const sampleCoursePage = parseCourseSchedulePage(courseSampleFlow.finalHtml);

  const roomSampleFlow = await fetchSelectionPage(
    ENDPOINTS.room,
    {
      'Dummy[text2]': '50',
      'Dummy[text3]': SAMPLE_ROOM_BUILDING,
    },
    {
      'Dummy[text2]': '50',
      'Dummy[text3]': SAMPLE_ROOM_BUILDING,
      'Dummy[text4]': SAMPLE_ROOM,
    }
  );
  const sampleRoomPage = parseRoomSchedulePage(roomSampleFlow.finalHtml);

  await Promise.all([
    writeText(path.join(rawSnapshotDir, 'samples', `course-${slugify(SAMPLE_COURSE)}.html`), courseSampleFlow.finalHtml),
    writeText(path.join(rawSnapshotDir, 'samples', `room-${slugify(SAMPLE_ROOM)}.html`), roomSampleFlow.finalHtml),
  ]);

  let sampleDetailRecord = null;
  const sampleDetailSession = sampleCoursePage.sessions.find(session => session.detailId && session.source);
  if (sampleDetailSession) {
    try {
      await delay(REQUEST_DELAY_MS);
      const detailHtml = await fetchText(ENDPOINTS.showScheduleDetail, {
        method: 'POST',
        cookieJar: courseSampleFlow.cookieJar,
        referer: ENDPOINTS.course,
        form: {
          id: String(sampleDetailSession.detailId),
          readOnly: '1',
          source: sampleDetailSession.source,
        },
      });
      sampleDetailRecord = parseDetailPage(detailHtml);
      await writeText(
        path.join(rawSnapshotDir, 'samples', `detail-${sampleDetailSession.detailId}.html`),
        detailHtml
      );
    } catch (error) {
      warnings.push(`showScheduleDetail sample fetch failed: ${error.message}`);
    }
  } else {
    warnings.push('No detail id was found on the BIW30503 sample course page.');
  }

  let lecturerSearchHtml = '';
  let lecturerSearchOptions = [];
  if (semesterCode) {
    const lecturerSearchJar = new CookieJar();
    await fetchText(ENDPOINTS.lecturer, { cookieJar: lecturerSearchJar });
    await delay(REQUEST_DELAY_MS);
    lecturerSearchHtml = await fetchText(ENDPOINTS.searchLecturer, {
      method: 'POST',
      cookieJar: lecturerSearchJar,
      referer: ENDPOINTS.lecturer,
      form: {
        semester: semesterCode,
        value: SAMPLE_LECTURER_QUERY,
      },
    });
    lecturerSearchOptions = parseOptionsMarkup(lecturerSearchHtml).filter(option => option.value);
    await writeText(
      path.join(rawSnapshotDir, 'samples', `search-lecturer-${slugify(SAMPLE_LECTURER_QUERY)}.html`),
      lecturerSearchHtml
    );
  } else {
    warnings.push('Semester code was not detected, so lecturer search verification was skipped.');
  }

  const courseRecords = sortObjectsByKey(
    [...courseMap.values()].map(course => ({
      ...course,
      programs: uniqueSorted(course.programs ?? []),
    })),
    'code'
  );

  const roomRecords = sortObjectsByKey([...roomMap.values()], 'code');
  const cohortRecords = sortObjectsByKey([...cohortMap.values()], 'id');
  const lecturerRecords = sortObjectsByKey(
    [...lecturerMap.values()].map(lecturer => ({
      ...lecturer,
      faculties: uniqueSorted(lecturer.faculties ?? []),
    })),
    'label'
  );

  const sortedCohortDetails = sortObjectsByKey(cohortDetails, 'id');
  const sortedCohortSessions = [...cohortSessions].sort((left, right) =>
    [
      left.cohortId,
      left.day,
      left.startTime,
      left.endTime,
      left.courseCode,
      left.group ?? '',
    ].join('|').localeCompare(
      [
        right.cohortId,
        right.day,
        right.startTime,
        right.endTime,
        right.courseCode,
        right.group ?? '',
      ].join('|')
    )
  );

  const generatedSubjects = uniqueSorted(courseRecords.map(course => `${course.code} - ${course.name}`));
  const generatedRooms = uniqueSorted(roomRecords.map(room => normalizeRoomCode(room.code)));

  const subjectDrift = computeSubjectDrift(previousSubjects, generatedSubjects);
  const roomDrift = computeRoomDrift(previousRooms, generatedRooms);
  const subjectValidation = validateGeneratedSubjects(generatedSubjects);
  const roomValidation = validateGeneratedRooms(generatedRooms);
  const sessionValidation = validateCohortSessions(sortedCohortSessions);

  const liveChecks = {
    courseBIW30503: {
      ok: sampleCoursePage.workloadText === '06 H 00 M' && sampleCoursePage.sessions.length > 0,
      workloadText: sampleCoursePage.workloadText,
      sessionCount: sampleCoursePage.sessions.length,
    },
    cohortFSKTM_3BIW: {
      ok:
        Boolean(sampleCohortCheck) &&
        sampleCohortCheck.sessionCount > 0 &&
        sampleCohortCheck.containsBIW33103 &&
        sampleCohortCheck.containsBIW30503,
      workloadText: sampleCohortCheck?.workloadText ?? null,
      sessionCount: sampleCohortCheck?.sessionCount ?? 0,
      containsBIW33103: sampleCohortCheck?.containsBIW33103 ?? false,
      containsBIW30503: sampleCohortCheck?.containsBIW30503 ?? false,
    },
    roomI_BT1: {
      ok: sampleRoomPage.workloadText === '04 H 00 M' && sampleRoomPage.sessions.length > 0,
      workloadText: sampleRoomPage.workloadText,
      sessionCount: sampleRoomPage.sessions.length,
    },
    lecturerSearchSyafiq: {
      ok: lecturerSearchOptions.length > 0,
      optionCount: lecturerSearchOptions.length,
      optionsSample: lecturerSearchOptions.slice(0, 10).map(option => option.label),
    },
  };

  const findings = [
    'The site is scrapeable with session-preserving HTTP; no browser automation is required.',
    `subjects.json drift against the live semester catalog is ${subjectDrift.overlapCount} overlaps, ${subjectDrift.previousOnlyCount} local-only, and ${subjectDrift.nextOnlyCount} site-only entries.`,
    `rooms.json overlap after normalization is ${roomDrift.overlapCount} of ${roomDrift.nextCount} live rooms already present locally; the local file still has ${roomDrift.duplicateNormalizedLocalCount} duplicate normalized room codes from suffix variants.`,
    sampleDetailRecord
      ? 'showScheduleDetail exposes day, time, venue, course, group, class type, department, and student counts, but not lecturer name.'
      : 'showScheduleDetail could not be verified in this run.',
  ];

  const completedAt = new Date();
  const summary = {
    semester: {
      label: semesterLabel,
      code: semesterCode,
      slug: semesterSlug,
    },
    scrape: {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      requestDelayMs: REQUEST_DELAY_MS,
      rawSnapshotDir: toRelativeRepoPath(rawSnapshotDir),
      sourceBaseUrl: 'https://timetable.uthm.edu.my/',
    },
    counts: {
      coursePrograms: coursePrograms.length,
      courses: courseRecords.length,
      roomBuildings: roomBuildings.length,
      rooms: roomRecords.length,
      batchFaculties: batchFaculties.length,
      cohorts: cohortRecords.length,
      lecturers: lecturerRecords.length,
      cohortSchedules: sortedCohortDetails.length,
      cohortSessions: sortedCohortSessions.length,
    },
    drift: {
      subjects: subjectDrift,
      rooms: roomDrift,
    },
    validations: {
      subjects: subjectValidation,
      rooms: roomValidation,
      cohortSessions: sessionValidation,
    },
    liveChecks,
    findings,
    warnings,
    files: {
      catalog: toRelativeRepoPath(path.join(UTHM_DATA_DIR, 'catalog.json')),
      cohortSchedules: toRelativeRepoPath(path.join(UTHM_DATA_DIR, 'cohort-schedules.json')),
      summary: toRelativeRepoPath(path.join(UTHM_DATA_DIR, 'summary.json')),
      subjects: toRelativeRepoPath(subjectsPath),
      rooms: toRelativeRepoPath(roomsPath),
    },
  };

  const catalog = {
    semester: summary.semester,
    scrape: summary.scrape,
    programs: coursePrograms.map(program => program.value),
    roomBuildings: roomBuildings.map(building => building.value),
    faculties: batchFaculties.map(faculty => faculty.value),
    lecturerFaculties: lecturerFaculties.map(faculty => faculty.value),
    courses: courseRecords,
    rooms: roomRecords,
    cohorts: cohortRecords,
    lecturers: lecturerRecords,
    samples: {
      courseBIW30503: {
        workloadText: sampleCoursePage.workloadText,
        sessionCount: sampleCoursePage.sessions.length,
      },
      roomI_BT1: {
        workloadText: sampleRoomPage.workloadText,
        sessionCount: sampleRoomPage.sessions.length,
      },
      lecturerSearchSyafiq: {
        optionCount: lecturerSearchOptions.length,
      },
      showScheduleDetail: sampleDetailRecord,
    },
  };

  const cohortSchedules = {
    semester: summary.semester,
    scrape: summary.scrape,
    cohorts: sortedCohortDetails,
    sessions: sortedCohortSessions,
  };

  await Promise.all([
    writeJson(path.join(UTHM_DATA_DIR, 'catalog.json'), catalog),
    writeJson(path.join(UTHM_DATA_DIR, 'cohort-schedules.json'), cohortSchedules),
    writeJson(path.join(UTHM_DATA_DIR, 'summary.json'), summary),
    writeJson(subjectsPath, generatedSubjects),
    writeJson(roomsPath, generatedRooms),
  ]);

  const criticalChecks = [
    subjectValidation.ok,
    roomValidation.ok,
    sessionValidation.ok,
    liveChecks.courseBIW30503.ok,
    liveChecks.cohortFSKTM_3BIW.ok,
    liveChecks.roomI_BT1.ok,
    liveChecks.lecturerSearchSyafiq.ok,
  ];

  if (!criticalChecks.every(Boolean)) {
    process.exitCode = 1;
  }

  console.log(`UTHM sync completed for ${semesterLabel}`);
  console.log(`Catalog courses: ${courseRecords.length}, rooms: ${roomRecords.length}, cohorts: ${cohortRecords.length}`);
  console.log(`Generated subjects: ${generatedSubjects.length}, generated rooms: ${generatedRooms.length}`);
  if (warnings.length > 0) {
    console.log(`Warnings: ${warnings.length}`);
  }
}

await main();
