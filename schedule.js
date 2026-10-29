/* schedule.js — منطق التاريخ (توقيت مصر). يعمل في المتصفح وفي Node للاختبار. */
(function (root) {
  'use strict';
  var TZ = 'Africa/Cairo';
  var START = '2026-10-30'; // اليوم الأول — ثابت
  var fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  function pad(n) { return String(n).padStart(2, '0'); }
  function parts(ms) {
    var o = {};
    fmt.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second };
  }
  function isoOf(ms) { var p = parts(ms); return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
  function toUTC(iso) { var a = iso.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); }
  function diffDays(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 864e5); }
  function addDays(iso, n) { return new Date(toUTC(iso) + n * 864e5).toISOString().slice(0, 10); }
  // رقم اليوم (1 = 2026-10-02). قيمة ≤ 0 قبل البداية.
  function dayNumber(iso, start) { return diffDays(start || START, iso) + 1; }
  // الثواني المتبقية حتى منتصف ليل بداية الخلوة بتوقيت مصر
  function secondsUntilStart(ms, start) {
    var p = parts(ms), t = toUTC(start || START);
    return Math.floor((t - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s)) / 1000);
  }
  var api = { TZ: TZ, START: START, parts: parts, isoOf: isoOf, diffDays: diffDays,
              addDays: addDays, dayNumber: dayNumber, secondsUntilStart: secondsUntilStart };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Schedule = api;
})(typeof window !== 'undefined' ? window : globalThis);
