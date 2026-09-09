import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCohortSchedulePage,
  parseCourseOptions,
  parseDetailPage,
  parseRoomOptions,
} from '../scripts/uthm-sync-lib.mjs';

test('parseCourseOptions extracts code and name pairs', () => {
  const html = `
    <select id="Dummy_text5">
      <option value="">-Select Course-</option>
      <option value="BIW30503">BIW30503 - PENGURUSAN PROJEK WEB</option>
      <option value="BIT34503">BIT34503 - SAINS DATA</option>
    </select>
  `;

  assert.deepEqual(parseCourseOptions(html), [
    {
      code: 'BIW30503',
      name: 'PENGURUSAN PROJEK WEB',
      label: 'BIW30503 - PENGURUSAN PROJEK WEB',
    },
    {
      code: 'BIT34503',
      name: 'SAINS DATA',
      label: 'BIT34503 - SAINS DATA',
    },
  ]);
});

test('parseRoomOptions extracts code, capacity, and type', () => {
  const html = `
    <select id="Dummy_text4">
      <option value="">-Select Room-</option>
      <option value="----- FSKTM -----">----- FSKTM -----</option>
      <option value="I-BT1">I-BT1 (40) - BT</option>
      <option value="I-FSKTM-BS1">I-FSKTM-BS1 (100) - DK</option>
    </select>
  `;

  assert.deepEqual(parseRoomOptions(html, 'FSKTM'), [
    {
      code: 'I-BT1',
      building: 'FSKTM',
      capacity: 40,
      roomType: 'BT',
      label: 'I-BT1 (40) - BT',
    },
    {
      code: 'I-FSKTM-BS1',
      building: 'FSKTM',
      capacity: 100,
      roomType: 'DK',
      label: 'I-FSKTM-BS1 (100) - DK',
    },
  ]);
});

test('parseCohortSchedulePage extracts timetable blocks and detail ids', () => {
  const html = `
    <h3>Cohort Schedule : FSKTM-3BIW</h3>
    <div>Total Workload : 42 H 00 M</div>
    <script>
      jQuery(document).on('click','#yt4',function(){jQuery.ajax({'type':'POST','data':{'id':276673,'readOnly':1,'source':'batch'}})});
      jQuery(document).on('click','#yt7',function(){jQuery.ajax({'type':'POST','data':{'id':276677,'readOnly':1,'source':'batch'}})});
    </script>
    <a id="yt4"><span title="Click to view details (Tuesday : 16:00 - 18:00)">
      BIW30503<br />
      PENGURUSAN PROJEK WEB<br />
      (S13) A<br />
      I-MTW-ARAS 3 (FSKTM)
    </span></a>
    <a id="yt7"><span title="Click to view details (Friday : 10:00 - 12:00)">
      BIW30503<br />
      PENGURUSAN PROJEK WEB<br />
      (S5) K<br />
      I-B8-T1-GS (INDUK GUNASAMA)
    </span></a>
  `;

  const parsed = parseCohortSchedulePage(html);

  assert.equal(parsed.cohortId, 'FSKTM-3BIW');
  assert.equal(parsed.workloadText, '42 H 00 M');
  assert.equal(parsed.sessions.length, 2);
  assert.deepEqual(parsed.sessions[0], {
    anchorId: 'yt4',
    detailId: 276673,
    source: 'batch',
    day: 'Tuesday',
    startTime: '16:00',
    endTime: '18:00',
    courseCode: 'BIW30503',
    courseName: 'PENGURUSAN PROJEK WEB',
    group: 'S13',
    classTypeCode: 'A',
    venueLabel: 'I-MTW-ARAS 3 (FSKTM)',
    venueCode: 'I-MTW-ARAS 3',
    venueContext: 'FSKTM',
  });
});

test('parseDetailPage extracts table fields from showScheduleDetail', () => {
  const html = `
    <table>
      <tr><th>Day</th><td>Tuesday</td></tr>
      <tr><th>Time</th><td>16:00 - 18:00</td></tr>
      <tr><th>Venue</th><td>I-MTW-ARAS 3 (FSKTM)</td></tr>
      <tr><th>Course</th><td>BIW30503 - PENGURUSAN PROJEK WEB</td></tr>
      <tr><th>Group</th><td>S13</td></tr>
      <tr><th>Class Type</th><td>A</td></tr>
      <tr><th>Class Duration</th><td>02 H 00 M</td></tr>
      <tr><th>Department</th><td>FSKTM</td></tr>
      <tr><th>Number of Student in Course</th><td>90 students</td></tr>
      <tr><th>Number of Student in Class</th><td>30 students</td></tr>
    </table>
  `;

  assert.deepEqual(parseDetailPage(html), {
    fields: {
      Day: 'Tuesday',
      Time: '16:00 - 18:00',
      Venue: 'I-MTW-ARAS 3 (FSKTM)',
      Course: 'BIW30503 - PENGURUSAN PROJEK WEB',
      Group: 'S13',
      'Class Type': 'A',
      'Class Duration': '02 H 00 M',
      Department: 'FSKTM',
      'Number of Student in Course': '90 students',
      'Number of Student in Class': '30 students',
    },
    day: 'Tuesday',
    timeRange: '16:00 - 18:00',
    venue: 'I-MTW-ARAS 3 (FSKTM)',
    courseCode: 'BIW30503',
    courseName: 'PENGURUSAN PROJEK WEB',
    group: 'S13',
    classTypeCode: 'A',
    classDuration: '02 H 00 M',
    department: 'FSKTM',
    studentCountCourse: 90,
    studentCountClass: 30,
  });
});
