/**
 * خلوة شهر 11 — Google Apps Script (Web App)
 * - doGet?action=time  → وقت الخادم بتوقيت مصر (لحساب اليوم الحالي)
 * - doPost             → استقبال إجابات الطالب والتحقق منها وتسجيلها في Google Sheet
 *
 * الإعداد: انسخ الملف كله في Apps Script (من داخل الـSheet: Extensions → Apps Script)
 * ثم شغّل الدالة setup() مرة واحدة، ثم Deploy → New deployment → Web app.
 */

var CONFIG = {
  // اتركه فارغاً إذا فتحت Apps Script من داخل الـSheet (Extensions → Apps Script).
  // أو ضع هنا ID الجدول (الجزء بين /d/ و /edit في رابط الـSheet).
  SPREADSHEET_ID: '',
  START_DATE: '2026-10-30',     // اليوم الأول — لازم يطابق الموقع
  TOTAL_DAYS: 28,
  TIMEZONE: 'Africa/Cairo',
  ALLOW_PAST_DAYS: false,       // false = ارفض أي يوم انتهى (حسب توقيت مصر على الخادم)
  RESPONSES_SHEET: 'Responses', // صف لكل تسليم
  ANSWERS_SHEET: 'Answers',     // صف لكل سؤال
  GRADES: ['أولى إعدادي', 'تانية إعدادي', 'تالتة إعدادي']
};

var RESPONSES_HEADERS = ['SubmissionID', 'Timestamp (Cairo)', 'الاسم', 'السنة الدراسية', 'رقم اليوم', 'تاريخ الخلوة',
  'رقم الأسبوع', 'عنوان الأسبوع', 'عنوان اليوم', 'الجزء الكتابي', 'الإجابات (مقروءة)', 'تطبيق اليوم - اختيار', 'تطبيق اليوم - كتابة', 'DedupeKey'];
var ANSWERS_HEADERS = ['SubmissionID', 'Timestamp (Cairo)', 'الاسم', 'السنة الدراسية', 'رقم اليوم', 'تاريخ الخلوة',
  'رقم السؤال', 'نوع السؤال', 'السؤال', 'الإجابة'];

/* ---------------- أدوات ---------------- */
function getSS_() {
  return CONFIG.SPREADSHEET_ID ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function cairoDate_(d) { return Utilities.formatDate(d || new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd'); }
function cairoStamp_(d) { return Utilities.formatDate(d || new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'); }
function utc_(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function dayNumberFor_(iso) { return Math.round((utc_(iso) - utc_(CONFIG.START_DATE)) / 86400000) + 1; }
function addDays_(iso, n) { return new Date(utc_(iso) + n * 86400000).toISOString().slice(0, 10); }
function clean_(v, max) {
  var s = (v === null || v === undefined) ? '' : String(v);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\r\n?/g, '\n').trim();
  return s.length > max ? s.slice(0, max) : s;
}
function normName_(s) { return clean_(s, 80).replace(/\s+/g, ' '); }
function fail_(code, message) { return json_({ ok: false, code: code, message: message }); }

/* ---------------- تهيئة الجدول (شغّلها مرة واحدة) ---------------- */
function setup() {
  var ss = getSS_();
  [[CONFIG.RESPONSES_SHEET, RESPONSES_HEADERS], [CONFIG.ANSWERS_SHEET, ANSWERS_HEADERS]].forEach(function (x) {
    var sh = ss.getSheetByName(x[0]) || ss.insertSheet(x[0]);
    sh.getRange(1, 1, 1, x[1].length).setValues([x[1]]).setFontWeight('bold').setBackground('#7a1f17').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
    // نص عادي لكل الأعمدة حتى لا تتحول الإجابات إلى معادلات أو تواريخ
    sh.getRange(1, 1, sh.getMaxRows(), x[1].length).setNumberFormat('@');
    if (!sh.getFilter()) sh.getRange(1, 1, Math.max(2, sh.getLastRow()), x[1].length).createFilter();
  });
  var s1 = ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(s1);
  return 'تمت التهيئة: ' + ss.getName();
}

/* ---------------- GET ---------------- */
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'time') {
    var now = new Date();
    return json_({ ok: true, epochMs: now.getTime(), cairoDate: cairoDate_(now), cairoTime: cairoStamp_(now),
      dayNumber: dayNumberFor_(cairoDate_(now)), totalDays: CONFIG.TOTAL_DAYS });
  }
  return json_({ ok: true, service: 'retreat-11', message: 'الخدمة شغالة.' });
}

/* ---------------- POST ---------------- */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(25000)) return fail_('BUSY', 'الخادم مشغول، حاول تاني بعد لحظات.');
    if (!e || !e.postData || !e.postData.contents) return fail_('BAD_REQUEST', 'طلب فارغ.');
    if (e.postData.contents.length > 200000) return fail_('TOO_LARGE', 'حجم الإجابات كبير جداً.');
    var p;
    try { p = JSON.parse(e.postData.contents); } catch (err) { return fail_('BAD_JSON', 'صيغة الطلب غير صحيحة.'); }
    if (!p || p.action !== 'submit') return fail_('BAD_ACTION', 'إجراء غير معروف.');

    // --- التحقق من الحقول ---
    var sid = String(p.submissionId || '');
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(sid)) return fail_('BAD_ID', 'رقم التسليم غير صالح.');
    var name = normName_(p.student && p.student.name);
    var grade = clean_(p.student && p.student.grade, 40);
    var words = name.split(' ');
    if (name.length < 5 || words.length < 2) return fail_('BAD_NAME', 'اكتب الاسم الكامل.');
    if (CONFIG.GRADES.indexOf(grade) < 0) return fail_('BAD_GRADE', 'السنة الدراسية غير صحيحة.');
    var day = Number(p.dayNumber);
    if (!isFinite(day) || day % 1 !== 0 || day < 1 || day > CONFIG.TOTAL_DAYS) return fail_('BAD_DAY', 'رقم اليوم غير صحيح.');
    var date = addDays_(CONFIG.START_DATE, day - 1);
    if (String(p.retreatDate) !== date) return fail_('BAD_DATE', 'تاريخ الخلوة لا يطابق رقم اليوم.');
    if (!Array.isArray(p.answers) || p.answers.length < 1 || p.answers.length > 40) return fail_('BAD_ANSWERS', 'الإجابات غير صحيحة.');

    // --- التحقق من اليوم على الخادم (توقيت مصر) ---
    var now = new Date();
    var serverDay = dayNumberFor_(cairoDate_(now));
    if (serverDay < 1) return fail_('NOT_STARTED', 'الخلوة لسه مبدأتش.');
    if (day > serverDay) return fail_('FUTURE_DAY', 'الخلوة دي لسه مفتحتش.');
    if (day < serverDay && !CONFIG.ALLOW_PAST_DAYS) return fail_('DAY_CLOSED', 'الخلوة دي انتهت ومبقاش ينفع نبعت إجاباتها.');
    if (serverDay > CONFIG.TOTAL_DAYS && !CONFIG.ALLOW_PAST_DAYS) return fail_('FINISHED', 'الخلوة خلصت.');

    // --- منع التكرار ---
    var ss = getSS_();
    var rs = ss.getSheetByName(CONFIG.RESPONSES_SHEET), as = ss.getSheetByName(CONFIG.ANSWERS_SHEET);
    if (!rs || !as) return fail_('NOT_SETUP', 'الجدول لم يُهيّأ بعد. شغّل setup() من Apps Script.');
    var dedupe = day + '|' + grade + '|' + name.toLowerCase();
    var last = rs.getLastRow();
    if (last > 1) {
      var ids = rs.getRange(2, 1, last - 1, 1).getValues();
      var keys = rs.getRange(2, 14, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (ids[i][0] === sid || keys[i][0] === dedupe) {
          return json_({ ok: true, duplicate: true, message: 'إجابات اليوم ده مستلمة قبل كده.', timestamp: null });
        }
      }
    }

    // --- تنظيف الإجابات ---
    var answers = p.answers.map(function (a, idx) {
      return [clean_(a && a.no, 5) || String(idx + 1), clean_(a && a.type, 12), clean_(a && a.question, 600), clean_(a && a.answer, 3000)];
    });
    var app = p.application || {};
    var appChoice = clean_(app.choice, 500), appText = clean_(app.text, 3000);
    var stamp = cairoStamp_(now);
    var readable = answers.map(function (a) { return 'س' + a[0] + ': ' + a[3]; }).join('\n');

    rs.appendRow([sid, stamp, name, grade, String(day), date, String(Number(p.weekNumber) || ''), clean_(p.weekTitle, 100),
      clean_(p.dayTitle, 60), clean_(p.biblePassage, 100), readable.slice(0, 40000), appChoice, appText, dedupe]);
    var rows = answers.map(function (a) { return [sid, stamp, name, grade, String(day), date, a[0], a[1], a[2], a[3]]; });
    as.getRange(as.getLastRow() + 1, 1, rows.length, ANSWERS_HEADERS.length).setValues(rows);
    SpreadsheetApp.flush();
    return json_({ ok: true, duplicate: false, message: 'تم استلام الإجابات.', timestamp: stamp });
  } catch (err) {
    console.error(err);
    return fail_('SERVER_ERROR', 'حصل خطأ في الخادم. حاول تاني بعد شوية.');
  } finally {
    try { lock.releaseLock(); } catch (x) { /* ignore */ }
  }
}

/* ---------------- اختبار يدوي من محرر Apps Script ---------------- */
// يرسل تسليم تجريبي لليوم الحالي (يعمل فقط بين ٣٠ أكتوبر و٢٦ نوفمبر ٢٠٢٦ بتوقيت مصر). احذف الصف التجريبي بعدها.
function testSubmit() {
  var day = dayNumberFor_(cairoDate_());
  var payload = { action: 'submit', submissionId: 'TEST' + Utilities.getUuid().replace(/-/g, '').slice(0, 20),
    student: { name: 'اختبار تجريبي ثالث', grade: CONFIG.GRADES[0] }, dayNumber: day, retreatDate: addDays_(CONFIG.START_DATE, day - 1),
    weekNumber: 1, weekTitle: 'تجربة', dayTitle: 'تجربة', biblePassage: 'تجربة',
    answers: [{ no: 1, type: 'short', question: 'سؤال تجريبي؟', answer: 'إجابة تجريبية بالعربي ✓' }], application: { choice: '', text: 'تطبيق تجريبي' } };
  var out = doPost({ postData: { contents: JSON.stringify(payload) } });
  Logger.log(out.getContent());
}
