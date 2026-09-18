import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSessionLayout,
  formatTimeRange,
  formatHour,
} from '../src/timetable-layout.js';
import { isTapGesture } from '../src/timetable-interactions.js';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

test('formatTimeRange keeps the complete hour range in each heading', () => {
  assert.equal(formatTimeRange(0), '08:00–09:00');
  assert.equal(formatTimeRange(15), '23:00–00:00');
});

test('time formatting supports 12-hour and 24-hour display modes', () => {
  assert.equal(formatHour(0, '24h'), '08:00');
  assert.equal(formatHour(0, '12h'), '8:00 AM');
  assert.equal(formatHour(4, '12h'), '12:00 PM');
  assert.equal(formatHour(12, '12h'), '8:00 PM');
  assert.equal(formatHour(16, '12h'), '12:00 AM');
  assert.equal(formatTimeRange(15, '12h'), '11:00 PM–12:00 AM');
});

test('buildSessionLayout puts conflicting sessions in separate lanes', () => {
  const subjects = [
    {
      id: 'solid-mechanics',
      sessions: [{ day: 'Tuesday', startIndex: 4, endIndex: 7 }],
    },
    {
      id: 'mechanics',
      sessions: [{ day: 'Tuesday', startIndex: 6, endIndex: 9 }],
    },
  ];

  const layout = buildSessionLayout(subjects, days);

  assert.deepEqual(layout.sessions['solid-mechanics:0'], {
    laneIndex: 0,
    laneCount: 2,
  });
  assert.deepEqual(layout.sessions['mechanics:0'], {
    laneIndex: 1,
    laneCount: 2,
  });
  assert.equal(layout.dayLaneCounts.Tuesday, 2);
});

test('adjacent sessions reuse one lane instead of being treated as conflicts', () => {
  const subjects = [
    {
      id: 'first',
      sessions: [{ day: 'Monday', startIndex: 0, endIndex: 1 }],
    },
    {
      id: 'second',
      sessions: [{ day: 'Monday', startIndex: 1, endIndex: 2 }],
    },
  ];

  const layout = buildSessionLayout(subjects, days);

  assert.deepEqual(layout.sessions['first:0'], { laneIndex: 0, laneCount: 1 });
  assert.deepEqual(layout.sessions['second:0'], { laneIndex: 0, laneCount: 1 });
  assert.equal(layout.dayLaneCounts.Monday, 1);
});

test('a stationary touch is treated as a tap while a moved touch remains a drag', () => {
  const start = { startX: 100, startY: 200 };

  assert.equal(isTapGesture(start, { clientX: 105, clientY: 204 }), true);
  assert.equal(isTapGesture(start, { clientX: 111, clientY: 200 }), false);
});
