// تشغيل: node schedule.test.js
const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const S = fs.existsSync(path.join(__dirname, 'schedule.js')) ? require('./schedule.js') : require('../schedule.js');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const cairo = (iso) => Date.parse(iso); // iso بتوقيت UTC

t('START is 2026-10-30', () => assert.strictEqual(S.START, '2026-10-30'));
t('Oct 30 = day 1', () => assert.strictEqual(S.dayNumber('2026-10-30'), 1));
t('Oct 31 = day 2', () => assert.strictEqual(S.dayNumber('2026-10-31'), 2));
t('Nov 1 = day 3', () => assert.strictEqual(S.dayNumber('2026-11-01'), 3));
t('Nov 15 = day 17', () => assert.strictEqual(S.dayNumber('2026-11-15'), 17));
t('Nov 26 = day 28', () => assert.strictEqual(S.dayNumber('2026-11-26'), 28));
t('Nov 27 = day 29 (after end)', () => assert.strictEqual(S.dayNumber('2026-11-27'), 29));
t('Oct 29 = day 0 (before)', () => assert.strictEqual(S.dayNumber('2026-10-29'), 0));
t('month boundary addDays', () => assert.strictEqual(S.addDays('2026-10-30', 2), '2026-11-01'));
t('year boundary addDays', () => assert.strictEqual(S.addDays('2026-12-31', 1), '2027-01-01'));

// البيانات
const ctx = { window: {} }; vm.createContext(ctx);
const dataPath = fs.existsSync(path.join(__dirname, 'retreat-data.js')) ? path.join(__dirname, 'retreat-data.js') : path.join(__dirname, '..', 'retreat-data.js');
vm.runInContext(fs.readFileSync(dataPath, 'utf8'), ctx);
const D = ctx.window.RETREAT_DATA;
t('28 days with sequential ids', () => { assert.strictEqual(D.days.length, 28); D.days.forEach((d, i) => assert.strictEqual(d.dayId, i + 1)); });
t('4 weeks x 7 days', () => [1, 2, 3, 4].forEach(w => assert.strictEqual(D.days.filter(d => d.weekNumber === w).length, 7)));
t('every day has passage, lesson, >=3 questions, application', () => D.days.forEach(d => {
  assert.ok(d.biblePassage && d.spiritualLesson && d.dailyApplication.prompt, 'day ' + d.dayId);
  assert.ok(d.questions.length >= 3, 'day ' + d.dayId);
}));
t('question types are all supported', () => D.days.forEach(d => d.questions.forEach(q =>
  assert.ok(['mc', 'tf', 'fill', 'short', 'parts', 'order'].includes(q.type)))));
t('grades are exactly the three required', () => assert.strictEqual(JSON.stringify(D.grades), JSON.stringify(['أولى إعدادي', 'تانية إعدادي', 'تالتة إعدادي'])));
console.log('\n' + n + ' tests passed');
