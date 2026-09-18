import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const plannerCss = fs.readFileSync(new URL('../src/planner.css', import.meta.url), 'utf8');
const mobileCss = plannerCss.slice(plannerCss.indexOf('@media (max-width: 768px)'));

test('mobile planner toolbar wraps controls and keeps instructions in flow', () => {
  assert.match(mobileCss, /\.planner-toolbar-actions\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(mobileCss, /\.planner-reset-group \.mobile-instruction\s*\{[^}]*position:\s*static/);
  assert.match(mobileCss, /\.planner-reset-group \.mobile-instruction\s*\{[^}]*white-space:\s*normal/);
});
