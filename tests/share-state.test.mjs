import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTimetableShareUrl,
  decodeTimetable,
  encodeTimetable,
  readTimetableFromLocation,
} from '../src/share-state.js';

const subjects = [
  {
    id: 'math-1',
    name: 'Mathematics & Signals',
    section: 'S1',
    color: '#6A4C93',
    sessions: [
      { id: 'session-1', day: 'Monday', startIndex: 2, endIndex: 4, location: 'Dewan Kuliah', lecturer: 'Dr. Áfiq', type: 'Lecture' },
    ],
  },
];

test('shared timetable payload round-trips unicode timetable data', () => {
  const encoded = encodeTimetable(subjects, '12h');
  assert.deepEqual(decodeTimetable(encoded), { subjects, timeFormat: '12h' });
});

test('invalid shared timetable payloads are ignored', () => {
  assert.equal(decodeTimetable('not-a-timetable'), null);
  assert.equal(decodeTimetable(encodeTimetable({ nope: true })), null);
});

test('share URL can be read back from a location', () => {
  const shareUrl = createTimetableShareUrl(subjects, '24h', new URL('https://example.com/planner'));
  const location = new URL(shareUrl);
  assert.deepEqual(readTimetableFromLocation(location), { subjects, timeFormat: '24h' });
  assert.equal(location.pathname, '/planner');
});
