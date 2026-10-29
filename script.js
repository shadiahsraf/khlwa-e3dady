/* خلوة شهر 11 — script.js
   يعتمد على: schedule.js (التاريخ) و retreat-data.js (المحتوى). */
'use strict';

/* ================== الإعدادات (عدّل هنا فقط) ================== */
const CONFIG = {
  // ضع هنا رابط الـWeb App بعد نشر google-apps-script.gs (ينتهي بـ /exec)
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwIEmXq3CoXRDWWIbf_QrCTAjgPr9IHJ5GC-9ZG7qAaNwkSFBjbdnNMBmkafhtymq2spA/exec',
  SYNC_EVERY_MS: 5 * 60 * 1000,
  REQUEST_TIMEOUT_MS: 20000
};

const S = window.Schedule;
const DATA = window.RETREAT_DATA;
const DAYS = DATA.days;
const TOTAL = DAYS.length;
const $ = (s, r) => (r || document).querySelector(s);
const ar = n => Number(n).toLocaleString('ar-EG');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- تخزين محلي آمن ---------- */
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
const K_PROFILE = 'retreat11.profile';

/* ---------- الحالة ---------- */
let profile = LS.get(K_PROFILE) || LS.get('retreat10.profile');
if (profile && !LS.get(K_PROFILE)) LS.set(K_PROFILE, profile);
let view = 'welcome';        // welcome | retreat
let editingProfile = false;
let serverOffsetMs = 0;
let timeSource = 'device';   // device | server
let lastKey = '';
let sending = false;

const urlOk = () => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(CONFIG.APPS_SCRIPT_URL);

/* ---------- الوقت (توقيت مصر) ---------- */
const nowMs = () => Date.now() + serverOffsetMs;
const todayISO = () => S.isoOf(nowMs());
const currentN = () => S.dayNumber(todayISO());
const statusOf = (i, n) => (i < n ? 'closed' : i === n ? 'available' : 'upcoming');
const STATUS_AR = { closed: 'الخلوة دي انتهت', available: 'متاحة النهاردة', upcoming: 'لسه مفتحتش' };

async function syncTime() {
  if (!urlOk()) { timeSource = 'device'; return; }
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 7000);
  try {
    const t0 = Date.now();
    const r = await fetch(CONFIG.APPS_SCRIPT_URL + '?action=time&_=' + t0, { signal: ctl.signal, cache: 'no-store' });
    const j = await r.json();
    const t1 = Date.now();
    if (j && j.ok && typeof j.epochMs === 'number') { serverOffsetMs = j.epochMs - (t0 + t1) / 2; timeSource = 'server'; }
    else timeSource = serverOffsetMs ? 'server' : 'device';
  } catch (e) { timeSource = serverOffsetMs ? 'server' : 'device'; }
  finally { clearTimeout(to); }
}

const fmtNow = new Intl.DateTimeFormat('ar-EG', { timeZone: S.TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('ar-EG', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dayDateISO = id => S.addDays(S.START, id - 1);
const dayDateAr = id => fmtDay.format(new Date(dayDateISO(id) + 'T12:00:00Z'));

/* ---------- الهيدر والتقويم ---------- */
function renderChrome(n) {
  $('#clock').textContent = fmtNow.format(new Date(nowMs()));
  const st = $('#status');
  st.textContent = n < 1 ? 'لسه مفتحتش' : n > TOTAL ? 'الخلوة خلصت' : 'اليوم ' + ar(n) + ' من ' + ar(TOTAL);
  const w = $('#timeWarn');
  if (timeSource === 'device') {
    w.hidden = false;
    w.textContent = urlOk() ? 'مش قادر أوصل للخادم دلوقتي، فبنحسب التاريخ من ساعة جهازك بتوقيت مصر.' : 'الخادم لسه مش مربوط، فبنحسب التاريخ من ساعة جهازك بتوقيت مصر.';
  } else w.hidden = true;
  $('#editProfile').hidden = !profile;
}
function renderCal(n) {
  $('#cal').innerHTML = DAYS.map(d => {
    const s = statusOf(d.dayId, n);
    return `<span class="cd ${s}" role="img" aria-label="اليوم ${ar(d.dayId)}: ${STATUS_AR[s]}" title="${STATUS_AR[s]}">${ar(d.dayId)}</span>`;
  }).join('');
}

/* ---------- مفاتيح الجهاز ---------- */
const normName = s => String(s || '').replace(/\s+/g, ' ').trim();
const skey = id => id + ':' + normName(profile && profile.name) + ':' + (profile && profile.grade);
const getSub = id => LS.get('retreat11.sub.' + skey(id));
const getDraft = id => LS.get('retreat11.draft.' + skey(id)) || {};
function getSid(id) {
  const k = 'retreat11.sid.' + skey(id);
  let v = LS.get(k);
  if (!v) {
    const a = new Uint8Array(20); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.random() * 256);
    v = 'S' + Array.from(a, x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
    LS.set(k, v);
  }
  return v;
}

/* ================== الشاشات ================== */
function render() {
  const n = currentN();
  renderChrome(n); renderCal(n);
  const app = $('#app');
  if (view === 'welcome') app.innerHTML = welcomeHTML(n), bindWelcome(n);
  else if (n < 1) app.innerHTML = beforeHTML(), tickCountdown();
  else if (n > TOTAL) app.innerHTML = finishedHTML();
  else {
    const day = DAYS[n - 1];
    if (getSub(day.dayId)) app.innerHTML = doneHTML(day);
    else app.innerHTML = dayHTML(day), bindDay(day);
  }
  lastKey = view + '|' + n + '|' + editingProfile + '|' + !!(profile && getSub(n));
}

/* ---------- الترحيب ---------- */
function welcomeHTML(n) {
  const dayLine = n < 1 ? 'الخلوة هتبدأ يوم ' + dayDateAr(1)
    : n > TOTAL ? 'الخلوة خلصت — ربنا يبارك حياتك'
    : `النهاردة: ${DAYS[n - 1].dayTitle} — الأسبوع ${ar(DAYS[n - 1].weekNumber)}`;
  const hero = `<section class="hero">
    <div class="big" aria-hidden="true">🔥</div>
    <h1>${esc(DATA.title)}</h1>
    <p>ربنا بيستناك في خلوة النهاردة. اقعد معاه شوية، اقرا كلمته، جاوب على الأسئلة، وخد خطوة عملية واحدة. «أعمال الرسل» مفتوح قدامك.</p>
    <p class="date">${esc(fmtNow.format(new Date(nowMs())).split('،')[0])} — ${esc(dayLine)}</p>
  </section>`;
  const showForm = !profile || editingProfile;
  if (!showForm) {
    return hero + `<section class="card center">
      <h2>أهلاً يا ${esc(profile.name.split(' ')[0])} 👋</h2>
      <p>${esc(profile.name)} — ${esc(profile.grade)}</p>
      <button class="btn" id="go" type="button">${n >= 1 && n <= TOTAL ? 'كمّل خلوة النهاردة' : 'ادخل'}</button>
    </section>`;
  }
  return hero + `<form class="card" id="pf" novalidate>
    <h2>بياناتك</h2>
    <div class="field"><label for="pn">الاسم الكامل</label>
      <input type="text" id="pn" name="name" autocomplete="name" maxlength="80" required value="${esc(profile ? profile.name : '')}" placeholder="مثال: مينا جرجس سمير">
      <div class="err" id="pnE" hidden></div></div>
    <div class="field"><label for="pg">السنة الدراسية</label>
      <select id="pg" name="grade" required>
        <option value="">اختر السنة الدراسية…</option>
        ${DATA.grades.map(g => `<option value="${esc(g)}"${profile && profile.grade === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}
      </select>
      <div class="err" id="pgE" hidden></div></div>
    <p class="hint">مش هنسألك عن رقم تليفون أو عنوان. اسمك وسنتك بيتحفظوا على جهازك علشان ما تكتبهمش كل يوم، وتقدر تعدّلهم في أي وقت.</p>
    <div class="center"><button class="btn" type="submit">${profile ? 'احفظ وكمّل' : 'ابدأ الخلوة'}</button></div>
  </form>`;
}
function validName(raw) {
  const s = normName(raw);
  if (!s) return 'اكتب اسمك الكامل.';
  const w = s.split(' ');
  if (w.length < 2 || w.some(x => x.length < 2)) return 'اكتب اسمك الكامل (اسمك واسم أبوك على الأقل).';
  if (s.length > 80) return 'الاسم طويل جداً (الحد الأقصى ٨٠ حرف).';
  if (!/^[\p{L}\p{M}'’.\- ]+$/u.test(s)) return 'الاسم لازم يكون حروف فقط (من غير أرقام أو رموز).';
  return '';
}
function bindWelcome() {
  const go = $('#go');
  if (go) go.onclick = () => { view = 'retreat'; render(); window.scrollTo(0, 0); };
  const f = $('#pf');
  if (!f) return;
  f.onsubmit = e => {
    e.preventDefault();
    const name = normName(f.name.value), grade = f.grade.value;
    const en = validName(name), eg = DATA.grades.includes(grade) ? '' : 'اختر السنة الدراسية.';
    $('#pnE').hidden = !en; $('#pnE').textContent = en; f.name.classList.toggle('invalid', !!en);
    $('#pgE').hidden = !eg; $('#pgE').textContent = eg; f.grade.classList.toggle('invalid', !!eg);
    if (en) return f.name.focus();
    if (eg) return f.grade.focus();
    profile = { name, grade };
    LS.set(K_PROFILE, profile);
    editingProfile = false; view = 'retreat'; render(); window.scrollTo(0, 0);
  };
}

/* ---------- قبل البداية / بعد النهاية ---------- */
function beforeHTML() {
  return `<section class="card center"><h2>الخلوة لسه مفتحتش</h2>
    <p>أول يوم: <b>${esc(dayDateAr(1))}</b></p>
    <div class="count" aria-live="off"><div><b id="cdD">٠</b><small>يوم</small></div><div><b id="cdH">٠</b><small>ساعة</small></div><div><b id="cdM">٠</b><small>دقيقة</small></div><div><b id="cdS">٠</b><small>ثانية</small></div></div>
    <p class="hint">هتفتح تلقائياً أول ما ييجي التاريخ بتوقيت مصر. مش محتاج تعمل حاجة.</p></section>`;
}
function tickCountdown() {
  if (!$('#cdD')) return;
  let t = Math.max(0, S.secondsUntilStart(nowMs()));
  $('#cdD').textContent = ar(Math.floor(t / 86400)); t %= 86400;
  $('#cdH').textContent = ar(Math.floor(t / 3600)); t %= 3600;
  $('#cdM').textContent = ar(Math.floor(t / 60));
  $('#cdS').textContent = ar(t % 60);
}
function finishedHTML() {
  return `<section class="card center"><h2>🎉 خلصت خلوة شهر 11</h2>
    <p>كملت ${ar(TOTAL)} يوم مع كلمة ربنا. ربنا يبارك حياتك.</p></section>
    <section class="card sec sec-pray"><p class="pre">${esc(DATA.closingMessage)}</p></section>`;
}
function doneHTML(day) {
  const sub = getSub(day.dayId);
  const last = day.dayId === TOTAL;
  return `<div class="daytitle"><div class="wk">الأسبوع ${ar(day.weekNumber)}: ${esc(day.weekTitle)}</div><h1>${esc(day.dayTitle)}</h1></div>
    <section class="ok" role="status"><p>✅ تم استلام إجابات خلوة النهاردة.ربنا يباركك!</p>
    <p class="hint">رقم الاستلام: <span dir="ltr">${esc(sub.sid)}</span></p></section>
    <p class="center hint">${last ? '' : 'خلوة بكرة هتفتح تلقائياً الساعة ١٢ بالليل بتوقيت مصر.'}</p>
    ${last ? `<section class="card sec sec-pray"><p class="pre">${esc(DATA.closingMessage)}</p></section>` : ''}`;
}

/* ---------- شاشة اليوم ---------- */
function qHTML(q) {
  let h = `<div class="q" data-q="${q.id}"><div class="qtext"><span class="qno">س${ar(q.no)}:</span> ${esc(q.text)}</div>`;
  if (q.type === 'mc') {
    h += q.options.map((o, i) => `<label class="opt"><input type="radio" name="${q.id}" value="${i}"><span>${o.label ? `<b>${o.label})</b> ` : ''}${esc(o.text)}</span></label>`).join('');
  } else if (q.type === 'tf') {
    const radios = name => `<div class="tfrow">${q.labels.map(l => `<label class="opt"><input type="radio" name="${name}" value="${esc(l)}"><span>${esc(l)}</span></label>`).join('')}</div>`;
    h += q.statements ? q.statements.map((s, i) => `<div class="stmt"><div>${esc(s)}</div>${radios(q.id + '_s' + i)}</div>`).join('') : radios(q.id);
  } else if (q.type === 'fill') {
    for (let i = 0; i < q.blanks; i++) h += `<input type="text" class="field" style="margin-bottom:.5rem" name="${q.id}_b${i}" maxlength="300" placeholder="${q.blanks > 1 ? 'الفراغ ' + ar(i + 1) : 'اكتب هنا'}" aria-label="${q.blanks > 1 ? 'الفراغ ' + ar(i + 1) : 'إجابتك'}">`;
  } else if (q.type === 'short') {
    h += `<textarea name="${q.id}" rows="${Math.max(2, q.lines + 1)}" maxlength="1500" placeholder="اكتب إجابتك هنا"></textarea>`;
  } else if (q.type === 'parts') {
    h += q.parts.map((p, i) => `<div class="field"><label for="${q.id}_p${i}">${esc(p)}</label><input type="text" id="${q.id}_p${i}" name="${q.id}_p${i}" maxlength="300"></div>`).join('');
  } else if (q.type === 'order') {
    h += `<p class="hint">اكتب رقم ترتيب كل عنصر (١ = الأول).</p>` + q.items.map((it, i) => `<div class="row"><span>${esc(it)}</span><select name="${q.id}_o${i}" aria-label="ترتيب: ${esc(it)}"><option value="">—</option>${q.items.map((_, k) => `<option value="${k + 1}">${ar(k + 1)}</option>`).join('')}</select></div>`).join('');
  }
  return h + '<div class="err" role="alert" hidden></div></div>';
}
function dayHTML(day) {
  const a = day.dailyApplication;
  let appIn = '';
  if (a.options) appIn += a.options.map(o => `<label class="opt"><input type="radio" name="app_choice" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('');
  if (a.listCount) for (let i = 0; i < a.listCount; i++) appIn += `<div class="field"><label for="app_i${i}">${ar(i + 1)}-</label><input type="text" id="app_i${i}" name="app_i${i}" maxlength="300"></div>`;
  else appIn += `<div class="field"><label for="app_text">خاطرتك أو التزامك (اختياري)</label><textarea id="app_text" name="app_text" maxlength="1500" placeholder="اكتب بصراحة — مفيش إجابة غلط هنا."></textarea></div>`;
  return `<div class="daytitle"><div class="wk">الأسبوع ${ar(day.weekNumber)}: ${esc(day.weekTitle)}</div>
      <h1>${esc(day.dayTitle)}</h1><div class="hint">${esc(dayDateAr(day.dayId))} — اليوم ${ar(day.dayId)} من ${ar(TOTAL)}</div></div>
    <form id="df" novalidate>
      <section class="card sec sec-bible"><h2>📖 الجزء الكتابي</h2><p class="passage">${esc(day.biblePassage)}</p>
        <p class="hint">افتح الكتاب المقدس واقرأ المقطع قبل ما تكمّل.</p></section>
      <section class="card sec sec-lesson"><h2>💡 الاستفادة</h2><p class="pre">${esc(day.spiritualLesson)}</p></section>
      <section class="card sec sec-q"><h2>❓ الأسئلة</h2>${day.questions.map(qHTML).join('')}</section>
      <section class="card sec sec-apply"><h2>🎯 تطبيق اليوم</h2><p class="pre">${esc(a.prompt)}</p>${appIn}
        <p class="hint">التطبيق بينك وبين ربنا — اكتب اللي تحب تشاركه.</p></section>
      ${day.prayer ? `<section class="card sec sec-pray"><h2>🙏 صلاة</h2><p class="pre">${esc(day.prayer)}</p></section>` : ''}
      <div class="submitbar"><button class="btn btn-gold" type="submit" id="submitBtn">إرسال إجابات الخلوة</button>
        <p class="hint">هتراجع إجاباتك قبل الإرسال. الإجابات بتتحفظ على جهازك لحد ما تبعتها.</p></div>
    </form>`;
}

/* ---------- قراءة وتحقق ---------- */
function read(q, f) {
  const g = n => { const e = f.elements[n]; if (!e) return ''; return (e.value || '').trim(); };
  switch (q.type) {
    case 'mc': { const v = g(q.id); const o = v === '' ? null : q.options[+v]; return [{ label: '', value: o ? (o.label ? o.label + ') ' : '') + o.text : '' }]; }
    case 'tf': return q.statements ? q.statements.map((s, i) => ({ label: s, value: g(q.id + '_s' + i) })) : [{ label: '', value: g(q.id) }];
    case 'fill': return Array.from({ length: q.blanks }, (_, i) => ({ label: q.blanks > 1 ? 'فراغ ' + (i + 1) : '', value: g(q.id + '_b' + i) }));
    case 'short': return [{ label: '', value: g(q.id) }];
    case 'parts': return q.parts.map((p, i) => ({ label: p, value: g(q.id + '_p' + i) }));
    case 'order': return q.items.map((it, i) => ({ label: it, value: g(q.id + '_o' + i) }));
  }
  return [];
}
const joinVals = v => v.map(x => (x.label ? x.label + ': ' : '') + x.value).join(' | ');
function collect(day, f) {
  const answers = [], bad = [];
  day.questions.forEach(q => {
    const vals = read(q, f);
    let msg = vals.every(v => v.value !== '') ? '' : 'جاوب على السؤال ده.';
    if (!msg && q.type === 'order' && new Set(vals.map(v => v.value)).size !== vals.length) msg = 'كل عنصر لازم ياخد رقم مختلف.';
    if (msg) bad.push({ q, msg });
    answers.push({ no: q.no, id: q.id, type: q.type, question: q.text, answer: joinVals(vals) });
  });
  const a = day.dailyApplication;
  const g = n => (f.elements[n] ? f.elements[n].value.trim() : '');
  const app = { choice: g('app_choice'), text: a.listCount ? Array.from({ length: a.listCount }, (_, i) => g('app_i' + i)).map((x, i) => (i + 1) + '- ' + x).join('\n') : g('app_text') };
  if (a.listCount && !Array.from({ length: a.listCount }, (_, i) => g('app_i' + i)).some(Boolean)) app.text = '';
  return { answers, bad, app };
}
function markErrors(f, bad) {
  f.querySelectorAll('.q').forEach(el => { el.classList.remove('invalid-q'); const e = $('.err', el); e.hidden = true; });
  bad.forEach(b => { const el = f.querySelector(`[data-q="${b.q.id}"]`); el.classList.add('invalid-q'); const e = $('.err', el); e.textContent = b.msg; e.hidden = false; });
  if (bad.length) { const el = f.querySelector(`[data-q="${bad[0].q.id}"]`); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); const inp = $('input,textarea,select', el); if (inp) inp.focus({ preventScroll: true }); }
}

/* ---------- المسودة ---------- */
function saveDraft(day, f) {
  const o = {};
  Array.from(f.elements).forEach(e => {
    if (!e.name) return;
    if (e.type === 'radio') { if (e.checked) o[e.name] = e.value; } else o[e.name] = e.value;
  });
  LS.set('retreat11.draft.' + skey(day.dayId), o);
}
function restoreDraft(day, f) {
  const d = getDraft(day.dayId);
  Object.keys(d).forEach(k => {
    const e = f.elements[k]; if (!e) return;
    if (e.length !== undefined && e.tagName !== 'SELECT') Array.from(e).forEach(r => { r.checked = r.value === d[k]; });
    else e.value = d[k];
  });
}

/* ---------- ربط الأحداث ---------- */
function bindDay(day) {
  const f = $('#df');
  restoreDraft(day, f);
  let t; f.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => saveDraft(day, f), 300); });
  f.addEventListener('change', () => saveDraft(day, f));
  f.onsubmit = e => {
    e.preventDefault();
    const r = collect(day, f);
    markErrors(f, r.bad);
    if (r.bad.length) return;
    openReview(day, r);
  };
}
function openReview(day, r) {
  const dlg = $('#review');
  $('#reviewBody').innerHTML =
    `<p class="hint">${esc(profile.name)} — ${esc(profile.grade)} — ${esc(day.dayTitle)}</p>` +
    r.answers.map(a => `<div class="rv"><small>س${ar(a.no)}: ${esc(a.question)}</small><div class="a">${esc(a.answer)}</div></div>`).join('') +
    `<div class="rv"><small>تطبيق اليوم</small><div class="a">${esc([r.app.choice, r.app.text].filter(Boolean).join('\n') || '— (مفيش إجابة)')}</div></div>
     <div id="sendMsg" role="alert" hidden></div>`;
  $('#reviewSend').disabled = false; $('#reviewSend').textContent = 'تأكيد وإرسال';
  $('#reviewBack').disabled = false;
  dlg.dataset.day = day.dayId;
  dlg._r = r;
  if (!dlg.open) dlg.showModal();
}
function showMsg(html, cls) { const m = $('#sendMsg'); if (!m) return; m.className = cls; m.innerHTML = html; m.hidden = false; }

async function send() {
  if (sending) return;
  const dlg = $('#review'), r = dlg._r, dayId = +dlg.dataset.day;
  const btn = $('#reviewSend');
  sending = true; btn.disabled = true; $('#reviewBack').disabled = true;
  btn.innerHTML = '<span class="spin"></span> جارٍ الإرسال…';
  $('#sendMsg').hidden = true;
  const fail = (m) => { sending = false; btn.disabled = false; $('#reviewBack').disabled = false; btn.textContent = 'حاول تاني'; showMsg(m, 'bad'); };
  try {
    if (!urlOk()) return fail('الموقع لسه مش مربوط بجدول الإجابات (رابط الـWeb App ناقص في script.js). إجاباتك محفوظة على جهازك — كلّم المسؤول.');
    await syncTime();
    if (currentN() !== dayId) { sending = false; dlg.close(); render(); return; }
    const day = DAYS[dayId - 1];
    const payload = {
      action: 'submit', submissionId: getSid(dayId),
      student: { name: profile.name, grade: profile.grade },
      dayNumber: day.dayId, retreatDate: dayDateISO(day.dayId), weekNumber: day.weekNumber, weekTitle: day.weekTitle,
      dayTitle: day.dayTitle, biblePassage: day.biblePassage, answers: r.answers, application: r.app
    };
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    let j;
    try {
      const res = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow', signal: ctl.signal });
      j = JSON.parse(await res.text());
    } catch (e) {
      return fail('مقدرناش نتأكد إن الإجابات وصلت (النت ضعيف أو الخادم مش بيرد). ماتقلقش، دوس «حاول تاني» — مش هيتسجل مرتين.');
    } finally { clearTimeout(to); }
    if (j && j.ok === true) {
      LS.set('retreat11.sub.' + skey(dayId), { sid: payload.submissionId, at: j.timestamp || null });
      LS.del('retreat11.draft.' + skey(dayId));
      sending = false; dlg.close(); render(); window.scrollTo(0, 0); return;
    }
    if (j && ['DAY_CLOSED', 'FUTURE_DAY', 'NOT_STARTED', 'FINISHED'].includes(j.code)) { sending = false; dlg.close(); await syncTime(); render(); alert(j.message || 'الخلوة دي مش متاحة دلوقتي.'); return; }
    fail(esc((j && j.message) || 'حصلت مشكلة في الإرسال. حاول تاني.'));
  } catch (e) { fail('حصلت مشكلة غير متوقعة. حاول تاني.'); }
}

/* ================== التشغيل ================== */
function tick() {
  const n = currentN();
  $('#clock').textContent = fmtNow.format(new Date(nowMs()));
  const key = view + '|' + n + '|' + editingProfile + '|' + !!(profile && getSub(n));
  if (key !== lastKey && !sending) render(); // تغيّر اليوم (منتصف الليل بتوقيت مصر) أو الحالة
  tickCountdown();
}
$('#brand').onclick = () => { view = 'welcome'; editingProfile = false; render(); };
$('#editProfile').onclick = () => { view = 'welcome'; editingProfile = true; render(); };
$('#reviewBack').onclick = () => $('#review').close();
$('#reviewSend').onclick = send;
$('#review').addEventListener('cancel', e => { if (sending) e.preventDefault(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncTime().then(tick); });

(async function init() {
  await syncTime();
  render();
  setInterval(tick, 1000);
  setInterval(() => syncTime(), CONFIG.SYNC_EVERY_MS);
})();
