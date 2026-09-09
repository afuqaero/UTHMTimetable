import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeRoomCode } from '../scripts/uthm-sync-lib.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath) {
  const contents = await fs.readFile(path.join(ROOT_DIR, relativePath), 'utf8');
  return JSON.parse(contents);
}

function isSorted(values) {
  return values.every((value, index) => index === 0 || values[index - 1].localeCompare(value) <= 0);
}

function timeToMinutes(value) {
  const match = String(value ?? '').match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

test('generated subjects are sorted, unique, and non-empty', async () => {
  const subjects = await readJson('src/data/subjects.json');

  assert.ok(Array.isArray(subjects));
  assert.ok(subjects.length > 0);
  assert.equal(new Set(subjects).size, subjects.length);
  assert.ok(isSorted(subjects));
});

test('generated rooms are sorted, unique, and normalized unique', async () => {
  const rooms = await readJson('src/data/rooms.json');

  assert.ok(Array.isArray(rooms));
  assert.ok(rooms.length > 0);
  assert.equal(new Set(rooms).size, rooms.length);
  assert.ok(isSorted(rooms));
  assert.equal(new Set(rooms.map(room => normalizeRoomCode(room))).size, rooms.length);
});

test('generated cohort sessions are non-empty and valid', async () => {
  const cohortSchedules = await readJson('src/data/uthm/cohort-schedules.json');

  assert.ok(Array.isArray(cohortSchedules.cohorts));
  assert.ok(Array.isArray(cohortSchedules.sessions));
  assert.ok(cohortSchedules.cohorts.length > 0);
  assert.ok(cohortSchedules.sessions.length > 0);

  for (const session of cohortSchedules.sessions) {
    assert.ok(session.cohortId);
    assert.ok(session.courseCode);
    assert.ok(session.day);
    assert.match(session.startTime, /^\d{2}:\d{2}$/);
    assert.match(session.endTime, /^\d{2}:\d{2}$/);
    assert.ok(timeToMinutes(session.startTime) < timeToMinutes(session.endTime));
  }
});

test('generated summary emits drift stats, findings, and warnings array', async () => {
  const summary = await readJson('src/data/uthm/summary.json');

  assert.ok(summary.semester?.label);
  assert.ok(summary.scrape?.rawSnapshotDir);
  assert.ok(summary.drift?.subjects);
  assert.ok(summary.drift?.rooms);
  assert.ok(Array.isArray(summary.findings));
  assert.ok(summary.findings.length >= 3);
  assert.ok(Array.isArray(summary.warnings));
  assert.ok(summary.validations?.subjects);
  assert.ok(summary.validations?.rooms);
  assert.ok(summary.validations?.cohortSessions);
  assert.ok(summary.liveChecks?.courseBIW30503);
  assert.ok(summary.liveChecks?.cohortFSKTM_3BIW);
  assert.ok(summary.liveChecks?.roomI_BT1);
  assert.ok(summary.liveChecks?.lecturerSearchSyafiq);
});
