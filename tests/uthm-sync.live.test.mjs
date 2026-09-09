import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CookieJar,
  ENDPOINTS,
  fetchText,
  parseBatchFaculties,
  parseCohortOptions,
  parseCohortSchedulePage,
  parseCourseSchedulePage,
  parseLecturerFaculties,
  parseOptionsMarkup,
  parseRoomBuildings,
  parseRoomSchedulePage,
  parseSemesterCode,
} from '../scripts/uthm-sync-lib.mjs';

async function fetchSelectionPage(endpoint, initialForm, finalForm) {
  const cookieJar = new CookieJar();
  await fetchText(endpoint, { cookieJar });
  const selectionHtml = await fetchText(endpoint, {
    method: 'POST',
    cookieJar,
    referer: endpoint,
    form: initialForm,
  });
  const finalHtml = finalForm
    ? await fetchText(endpoint, {
      method: 'POST',
      cookieJar,
      referer: endpoint,
      form: finalForm,
    })
    : selectionHtml;

  return {
    selectionHtml,
    finalHtml,
  };
}

test('live course BIW30503 returns expected workload and schedule', { timeout: 120_000 }, async () => {
  const { finalHtml } = await fetchSelectionPage(
    ENDPOINTS.course,
    {
      'Dummy[text2]': '50',
      'Dummy[text4]': 'FSKTM',
    },
    {
      'Dummy[text2]': '50',
      'Dummy[text4]': 'FSKTM',
      'Dummy[text5]': 'BIW30503',
    }
  );

  const parsed = parseCourseSchedulePage(finalHtml);

  assert.equal(parsed.workloadText, '06 H 00 M');
  assert.ok(parsed.sessions.length > 0);
});

test('live cohort FSKTM-3BIW returns non-empty schedule with BIW33103 and BIW30503', { timeout: 120_000 }, async () => {
  const batchHome = await fetchText(ENDPOINTS.batch, { cookieJar: new CookieJar() });
  assert.ok(parseBatchFaculties(batchHome).some(option => option.value === 'FSKTM'));

  const { selectionHtml, finalHtml } = await fetchSelectionPage(
    ENDPOINTS.batch,
    {
      'Dummy[text2]': '50',
      'Dummy[text4]': 'FSKTM',
    },
    {
      'Dummy[text2]': '50',
      'Dummy[text4]': 'FSKTM',
      'Dummy[text5]': 'FSKTM-3BIW',
    }
  );

  assert.ok(parseCohortOptions(selectionHtml, 'FSKTM').some(option => option.id === 'FSKTM-3BIW'));

  const parsed = parseCohortSchedulePage(finalHtml);
  const courseCodes = new Set(parsed.sessions.map(session => session.courseCode));

  assert.ok(parsed.sessions.length > 0);
  assert.ok(courseCodes.has('BIW33103'));
  assert.ok(courseCodes.has('BIW30503'));
});

test('live room I-BT1 returns expected workload and occupancy', { timeout: 120_000 }, async () => {
  const roomHome = await fetchText(ENDPOINTS.room, { cookieJar: new CookieJar() });
  assert.ok(parseRoomBuildings(roomHome).some(option => option.value === 'FSKTM'));

  const { finalHtml } = await fetchSelectionPage(
    ENDPOINTS.room,
    {
      'Dummy[text2]': '50',
      'Dummy[text3]': 'FSKTM',
    },
    {
      'Dummy[text2]': '50',
      'Dummy[text3]': 'FSKTM',
      'Dummy[text4]': 'I-BT1',
    }
  );

  const parsed = parseRoomSchedulePage(finalHtml);

  assert.equal(parsed.workloadText, '04 H 00 M');
  assert.ok(parsed.sessions.length > 0);
});

test('live lecturer search returns option markup for a sample query', { timeout: 120_000 }, async () => {
  const cookieJar = new CookieJar();
  const lecturerHome = await fetchText(ENDPOINTS.lecturer, { cookieJar });

  assert.ok(parseLecturerFaculties(lecturerHome).some(option => option.value === 'FSKTM'));

  const semesterCode = parseSemesterCode(lecturerHome);
  assert.ok(semesterCode);

  const searchHtml = await fetchText(ENDPOINTS.searchLecturer, {
    method: 'POST',
    cookieJar,
    referer: ENDPOINTS.lecturer,
    form: {
      semester: semesterCode,
      value: 'syafiq',
    },
  });

  const options = parseOptionsMarkup(searchHtml).filter(option => option.value);

  assert.ok(options.length > 0);
});
