import assert from 'node:assert/strict';
import test from 'node:test';
import { getMobileExportLayout } from '../src/export-layout.js';

test('12-hour iPhone wallpaper export reserves enough width for time labels', () => {
  const layout = getMobileExportLayout(5);

  assert.equal(layout.exportWidth, 645);
  assert.equal(layout.timeColumnWidth, 140);
  assert.equal(layout.dayColumnWidth, 101);
  assert.equal(layout.timeColumnWidth + (layout.dayColumnWidth * 5), layout.exportWidth);
});

test('24-hour iPhone wallpaper export uses the same comfortable spacing', () => {
  const layout = getMobileExportLayout(5);

  assert.equal(layout.exportWidth, 645);
  assert.equal(layout.timeColumnWidth, 140);
  assert.equal(layout.dayColumnWidth, 101);
  assert.equal(layout.timeColumnWidth + (layout.dayColumnWidth * 5), layout.exportWidth);
});
