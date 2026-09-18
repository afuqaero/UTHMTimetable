import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { getSectionOptions } from '../src/section-options.js';

const indexCss = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const sectionDropdownRule = indexCss.match(/\.section-dropdown\s*\{[^}]*\}/)?.[0] ?? '';

test('section options expose S1 through S40 and preserve custom fallback', () => {
  const emptyValue = getSectionOptions('');
  assert.equal(emptyValue.options.length, 40);
  assert.equal(emptyValue.options.at(-1), 'S40');
  assert.equal(emptyValue.customValue, null);

  const listedValue = getSectionOptions('S1');
  assert.equal(listedValue.customValue, null);
  assert.ok(listedValue.options.includes('S1'));
  assert.ok(listedValue.options.includes('S10'));

  const customValue = getSectionOptions('Lab A');
  assert.deepEqual(customValue.options, []);
  assert.equal(customValue.customValue, 'Lab A');
});

test('section dropdown remains scrollable and touch-friendly on mobile', () => {
  assert.match(sectionDropdownRule, /max-height:\s*220px/);
  assert.match(sectionDropdownRule, /overflow-y:\s*scroll/);
  assert.match(sectionDropdownRule, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(sectionDropdownRule, /scrollbar-width:\s*thin/);
});
