# خلوة شهر 11 — Interactive Retreat Website

A static Arabic (RTL) website for preparatory-school students: one retreat day per calendar day (Egypt time), starting **30 Oct 2026**, with answers saved to **your** Google Sheet through Google Apps Script. No frameworks, no paid backend.

## Files

| File | Purpose |
|---|---|
| `index.html`, `style.css` | Page shell and design |
| `script.js` | App logic. **The only place you edit: `CONFIG.APPS_SCRIPT_URL`** |
| `schedule.js` | Date logic (Egypt time) – shared with the Node tests |
| `retreat-data.js` | All 28 days extracted from the Month 11 PDF |
| `google-apps-script.gs` | Backend (paste into Apps Script) |
| `schedule.test.js` | Automated tests |

Schedule: Day 1 = 30 Oct 2026 … Day 28 = 26 Nov 2026. Before 30 Oct the site shows a countdown; after 26 Nov a completion screen with the booklet's closing message.

---

## Connect to your Google Sheet (step by step)

1. **Create the Sheet.** Go to <https://sheets.google.com> → *Blank spreadsheet*.
2. **Name it** (top-left), e.g. `خلوة شهر 11 – الإجابات`. You do **not** need to create the tabs by hand; step 6 creates `Responses` and `Answers`.
3. **Open Apps Script:** *Extensions → Apps Script*. A new project opens, bound to this Sheet.
4. **Paste the code:** delete everything in `Code.gs`, paste the full contents of `google-apps-script.gs`, press **Save** (💾).
5. **Settings.** At the top of the script, `CONFIG`:
   - `SPREADSHEET_ID`: leave `''` (it uses the Sheet the script is attached to). Only fill it if you created a standalone script (ID = the part between `/d/` and `/edit` in the Sheet URL).
   - `START_DATE`, `TOTAL_DAYS`: already `2026-10-02` / `28`.
   - `ALLOW_PAST_DAYS`: `false` means closed days are rejected by the server.
6. **Run `setup`.** In the function dropdown choose `setup` → **Run**. This creates the two tabs with headers, filters and plain-text formatting.
7. **Authorize.** Google shows "Authorization required" → *Review permissions* → choose your account. If it says "Google hasn't verified this app", click *Advanced → Go to (project name) (unsafe)* — it is your own script. It asks for permission to view/edit your spreadsheets (to write the answers). Nobody else gets this permission.
8. **Deploy:** *Deploy → New deployment* → ⚙️ *Select type* → **Web app**.
9. **Settings of the deployment:**
   - *Execute as:* **Me** (the script writes to your Sheet with your permission; students never touch your account).
   - *Who has access:* **Anyone** (not "Anyone with Google account"). Students aren't signed in; "Anyone" is required for that. Some Workspace (school/church) accounts or admins restrict this option; if you don't see "Anyone", use a personal Gmail account to own the Sheet and script, or ask your Workspace admin.
10. Click **Deploy** and **copy the Web app URL** (ends with `/exec`). *Not* the `/dev` test URL.
11. **Put it in the website:** open `script.js`, find
    `APPS_SCRIPT_URL: 'PASTE_YOUR_WEB_APP_URL_HERE'` and replace it with your URL.
12. **Test.** Open the Sheet URL in a browser: add `?action=time` to the Web app URL — you should see JSON with `"ok":true` and Cairo time. Then (between 30 Oct – 26 Nov 2026) open the site, enter a name, finish one day, submit, and check that a row appears in `Responses` and one row per question in `Answers`. You can also run `testSubmit` from the Apps Script editor (then delete the test row). Before 30 Oct, `testSubmit` correctly returns `NOT_STARTED`.
13. **Troubleshooting** — see below.
14. **After you change the script** you must publish a new version: *Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy*. The URL stays the same. Saving the code alone does **not** update the live Web app. (*New deployment* creates a different URL — then update `script.js` too.)

### Sheet structure

**`Responses`** (one row per submission): `SubmissionID | Timestamp (Cairo) | الاسم | السنة الدراسية | رقم اليوم | تاريخ الخلوة | رقم الأسبوع | عنوان الأسبوع | عنوان اليوم | الجزء الكتابي | الإجابات (مقروءة) | تطبيق اليوم - اختيار | تطبيق اليوم - كتابة | DedupeKey`

**`Answers`** (one row per question, easy to filter/pivot): `SubmissionID | Timestamp (Cairo) | الاسم | السنة الدراسية | رقم اليوم | تاريخ الخلوة | رقم السؤال | نوع السؤال | السؤال | الإجابة`

Filter by name, grade, date or day with the filter arrows on row 1. Multi-part answers (e.g. several statements) are joined with ` | ` in one cell.

### Duplicate protection
- Each submission gets a random `SubmissionID` created in the browser and reused on retries; the server checks it under a script lock, so double-clicks and network retries create one row.
- The server also allows **one submission per student (name + grade) per day**; a second attempt returns "already received". If a student must correct an answer, delete their row in both tabs.
- The site shows success **only** when the server replies `{"ok":true}`. If the network fails, it says it couldn't confirm and offers a safe retry.

---

## Deploy the website

**GitHub Pages:** create a repo, upload all files (keep `tests/` optional), *Settings → Pages → Deploy from branch → main / root*. Open `https://<user>.github.io/<repo>/`.
**Netlify:** drag-and-drop the folder at <https://app.netlify.com/drop>. No build command.

## Security and privacy — read this
- No secrets are in the front-end. The Web App URL is public by design; anyone with it can *send* data, which is why the server validates every field, the day, the grade, sizes, and de-duplicates. It can't read the Sheet back: the script exposes **no read endpoint** and no admin dashboard.
- The Sheet stays private to you and anyone you share it with. Don't share it publicly.
- Only name, grade and answers are stored. No phone/address/password.
- Student answers can contain personal reflections: share the Sheet only with leaders who need it.

## Limits of a client-side schedule (honest notes)
- The browser asks the Apps Script server for Egypt time (`?action=time`) and uses the offset, so a wrong device clock doesn't change the day. If the server can't be reached, it falls back to the device clock (a yellow notice is shown) and a student could fake the date.
- **Submissions are enforced on the server** (Egypt date): future days and closed days are rejected there.
- **Content is not secret.** Because this is a static site, all 28 days live in `retreat-data.js`; a technically skilled student can open it and read future days. The UI never shows them early, but it cannot *prevent* viewing the file. Real protection would require serving each day's content from Apps Script on the day itself (not implemented, to keep the site static and simple).
- Name/grade and drafts live in the browser's `localStorage`: they disappear if the student clears data, uses private mode, or switches device. "تعديل بياناتي" in the header corrects the name/grade. The "already submitted" screen is also local; the server still blocks duplicates from other devices.
- The server trusts the question text sent by the page (it has no copy of the booklet).

## Troubleshooting
| Symptom | Fix |
|---|---|
| "الموقع لسه مش مربوط…" | `APPS_SCRIPT_URL` still the placeholder or not ending in `/exec`. |
| Yellow notice "مش قادر أوصل للخادم" | Wrong URL; deployment access isn't "Anyone"; or offline. Open the URL + `?action=time` in a private window: it must show JSON, not a Google login page. |
| Login page / 401 / CORS error in the console | Access is not "Anyone", or you used the `/dev` URL. Redeploy with *Anyone* and use `/exec`. The site sends `Content-Type: text/plain` (a "simple" request), which avoids CORS preflight; Apps Script's redirect still returns readable JSON. |
| Old behavior after editing the script | Publish a **New version** (step 14). |
| `NOT_SETUP` | Run `setup()` once. |
| `DAY_CLOSED` / `FUTURE_DAY` | Server day ≠ the page's day (stale tab). Refresh. Check `?action=time`. |
| Arabic looks wrong in the Sheet | Re-run `setup()`; keep column format "plain text". The script writes UTF-8 and was designed for Arabic. |
| Authorization warning | Normal for your own script (step 7). |

## Test report
Verified here by running code (`node tests/schedule.test.js` → 17 passing; JS syntax checks for `script.js` and the `.gs`):
- Start date = 2 Oct 2026; Oct 3 = Day 2; **Oct 17 = Day 16**; Oct 29 = Day 28; Oct 30 = finished; Oct 1 = before start.
- Day flips exactly at Cairo midnight (tested across the 21:00 UTC boundary for UTC+3); month/year arithmetic.
- 28 days, 4×7, every day has passage/lesson/questions/application; all question types are supported by the renderer; the three grades.

**Not verifiable in this environment (please test once on your side):**
- Real Google Apps Script deployment, authorization, Sheet writes, Arabic stored correctly, the lock/duplicate behavior, and `Anyone` access.
- Rendering on real phones/tablets and RTL visual polish (no browser/visual check was run).
- Behavior of "Anyone" deployment on your specific Google account type.
- The checklist to run after setup: submit empty form (must be blocked) → submit once (row appears) → double-click send (one row) → refresh (shows "received") → try another day's number via `testSubmit` modification (must be rejected) → change device clock (day must not change when server reachable) → open at 00:00 Cairo (next day appears without reload).

## Extraction issues — please review the PDF vs. the site
The PDF text layer is partly corrupted (Arabic ligatures/emoji). I used both the text layer and the page appearance, and kept the booklet's dialect and spelling. Nothing was added to questions, options or prayers. Items to review (also stored per day in `reviewNotes` inside `retreat-data.js`):

**Content problems in the booklet itself (kept as-is):**
1. **Week 3 Day 2 and Day 3 are identical** (Acts 8:26-40 content), though Day 2's passage heading is 8:14-25. Day 2 probably needs its own content.
2. **Week 3 Day 7** mentions «بولس» and «الصيادين» for events of Acts 9:32-43 (which concern Peter); «إيناس» probably «إينياس».
3. **Week 4 cover** is «تحول شاول» but Week 4 covers Acts 10–11 (Cornelius, Antioch); Saul's conversion is in Week 3. The title is kept as printed.
4. No answer keys, so none are shown or invented. The booklet has no Bible text, only references, so only references are shown.
5. Prayers exist only on Week 1 Days 2, 3, 4 and 6 and Week 3 Days 2–3; Week 1 Day 6's "prayer" is an open prompt («كلم ربنا باللى جواك ...»).

**Words I had to read from damaged text (please confirm):** Week 1 Day 1: «ويوضا»→«ويوحنا», «يتكاموا»→«يتكلموا», «ينعى»→«يعنى» (and a doubled «بطرس»), «تظمل»→«تعمل», «اتنتمر»→«اتنمر»; Day 2: «الهديد»→«التهديد», «اسبب»→«اسيب»; Day 3: «المسحية», prayer opening «ا شكرك»→«يارب شكرك»; Day 4: «افى», «عازن», «ماجدش», «مشكلنهم», «عطاباك», «وأدبك»; Q4 reads oddly («فصار عظيم…» — probably a missing word) and has two blanks; Day 5: Q4 item «المؤمنين رجال ونساء» and application «ومخضره»→«وحضوره»; Day 7: «وحيب»→«وحكيم», «توداس» and the numbered options in Q4; Week 2 Day 7 application's middle line; Week 3 Day 1, 4, 6 applications (truncated lines).

**Format decisions:** "صح أم خطأ / صح أم غلط" wording is preserved per question; unnumbered options (Week 1 Day 1) show without letters. Questions are all required; the daily application is optional. The opening page (name/grade lines) became the form; the booklet's last page appears on the completion screen.
