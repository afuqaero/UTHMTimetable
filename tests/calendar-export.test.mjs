import assert from 'node:assert/strict';
import test from 'node:test';
import { formatICSDateUtc } from '../src/calendar-export.js';

test('formatICSDateUtc emits DTSTAMP values in UTC', () => {
  const date = new Date('2026-09-18T02:04:05.000Z');

  assert.equal(formatICSDateUtc(date), '20260918T020405Z');
});
