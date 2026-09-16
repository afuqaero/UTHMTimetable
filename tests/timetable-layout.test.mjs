import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSessionLayout,
  formatTimeRange,
} from '../src/timetable-layout.js';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

test('formatTimeRange keeps the complete hour range in each heading', () => {
  assert.equal(formatTimeRange(0), '08:00–09:00');
  assert.equal(formatTimeRange(15), '23:00–00:00');
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
