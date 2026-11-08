/**
 * AI Tutor "analytical engine": real offline telemetry from the tracker, injected into the system prompt.
 * Pure + deterministic (no DOM), so the numbers the model sees are unit-tested — the model never has to do arithmetic.
 */

export const NA = 'NOT_AVAILABLE';

const pad = (n) => String(n).padStart(2, '0');
export const localDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const round1 = (n) => Math.round(n * 10) / 10;
const DIFF_RANK = { Hard: 3, Medium: 2, Easy: 1 };

function parseExamDate(e) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(e?.date ?? ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * input: {
 *   subjects: [{ name, shortName, units:[{ name, subTopics:[{ name, completed, completedDate, completedTime, important, difficulty }] }] }],
 *   dayMinutes: { 'YYYY-MM-DD': minutes }, dailyLogs: [{ date, topicsCompleted }],
 *   exams: [{ label, date, time }], mcq: { total, correct }, now?: Date
 * }
 */
export function buildTelemetry(input) {
  const { subjects = [], dayMinutes = {}, dailyLogs = [], exams = [], mcq = { total: 0, correct: 0 } } = input || {};
  const now = input?.now instanceof Date ? input.now : new Date();
  const today = dayStart(now);

  // ── syllabus ──
  let total = 0, done = 0;
  const completedByDate = {};
  let lastDone = null; // { si, ui, key }
  subjects.forEach((s, si) => (s.units ?? []).forEach((u, ui) => (u.subTopics ?? []).forEach((t) => {
    total++;
    if (t.completed) {
      done++;
      if (t.completedDate) {
        completedByDate[t.completedDate] = (completedByDate[t.completedDate] || 0) + 1;
        const key = `${t.completedDate} ${t.completedTime ?? ''}`;
        if (!lastDone || key > lastDone.key) lastDone = { si, ui, key };
      }
    }
  })));
  const remaining = total - done;
  const completionRate = total > 0 ? round1((done / total) * 100) : null;

  // ── current unit / topic ──
  const hasPending = (u) => (u.subTopics ?? []).some(t => !t.completed);
  let active = null;
  if (lastDone) {
    const s = subjects[lastDone.si];
    if (hasPending(s.units[lastDone.ui])) active = { si: lastDone.si, ui: lastDone.ui };
    else {
      const next = s.units.findIndex((u, i) => i > lastDone.ui && hasPending(u));
      if (next >= 0) active = { si: lastDone.si, ui: next };
    }
  }
  if (!active) {
    outer: for (let si = 0; si < subjects.length; si++) {
      for (let ui = 0; ui < (subjects[si].units ?? []).length; ui++) {
        if (hasPending(subjects[si].units[ui])) { active = { si, ui }; break outer; }
      }
    }
  }
  let currentUnit = null, currentTopic = null, unitRemaining = null;
  if (active) {
    const s = subjects[active.si], u = s.units[active.ui];
    currentUnit = `${s.shortName || s.name} › ${u.name}`;
    const pending = (u.subTopics ?? []).map((t, i) => ({ t, i })).filter(x => !x.t.completed);
    unitRemaining = pending.length;
    pending.sort((a, b) =>
      (b.t.important ? 1 : 0) - (a.t.important ? 1 : 0)
      || (DIFF_RANK[b.t.difficulty] || 0) - (DIFF_RANK[a.t.difficulty] || 0)
      || a.i - b.i);
    if (pending[0]) {
      const t = pending[0].t;
      const tags = [t.difficulty, t.important ? 'Important' : null].filter(Boolean).join(', ');
      currentTopic = tags ? `${t.name} [${tags}]` : t.name;
    }
  }

  // ── exam ──
  const upcoming = exams
    .map(e => ({ e, d: parseExamDate(e) }))
    .filter(x => x.d && x.d >= today)
    .sort((a, b) => a.d - b.d)[0];
  const daysRemaining = upcoming ? Math.round((upcoming.d - today) / 86400000) : null;
  const examDate = upcoming ? `${localDateStr(upcoming.d)} (${upcoming.e.label || 'exam'})` : null;

  // ── last 7 days (today included) ──
  const logTopics = {};
  dailyLogs.forEach(l => { if (l?.date) logTopics[l.date] = Math.max(logTopics[l.date] || 0, Number(l.topicsCompleted) || 0); });
  const recentLogs = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const date = localDateStr(d);
    recentLogs.push({
      date,
      minutes: Math.max(0, Math.round(Number(dayMinutes[date]) || 0)),
      topics_completed: Math.max(completedByDate[date] || 0, logTopics[date] || 0),
    });
  }
  const sumMin = recentLogs.reduce((a, r) => a + r.minutes, 0);
  const sumTopics = recentLogs.reduce((a, r) => a + r.topics_completed, 0);

  // ── MCQ ──
  const mcqTotal = Math.max(0, Math.round(Number(mcq?.total) || 0));
  const mcqCorrect = Math.max(0, Math.min(mcqTotal, Math.round(Number(mcq?.correct) || 0)));
  const accuracy = mcqTotal > 0 ? round1((mcqCorrect / mcqTotal) * 100) : null;

  // ── derived (computed here so the model never does its own arithmetic) ──
  const observedPace = round1(sumTopics / 7);
  const requiredPace = daysRemaining == null ? null : daysRemaining > 0 ? round1(remaining / daysRemaining) : remaining;
  let paceVerdict = null;
  if (requiredPace != null && total > 0) {
    if (remaining === 0) paceVerdict = 'SYLLABUS_COMPLETE';
    else if (daysRemaining === 0) paceVerdict = 'EXAM_TODAY';
    else paceVerdict = observedPace >= requiredPace ? 'ON_TRACK' : `BEHIND (gap ${round1(requiredPace - observedPace)} topics/day)`;
  }

  return {
    currentUnit: currentUnit ?? NA,
    currentTopic: currentTopic ?? NA,
    completionRate: completionRate ?? NA,
    examDate: examDate ?? NA,
    daysRemaining: daysRemaining ?? NA,
    recentLogs,
    recentLogsJson: JSON.stringify(recentLogs),
    totalMcqs: mcqTotal,
    accuracyRate: accuracy ?? NA,
    derived: {
      totalTopics: total, completedTopics: done, remainingTopics: remaining,
      remainingInActiveUnit: unitRemaining ?? NA,
      requiredPace: requiredPace ?? NA,
      observedPace,
      avgMinutesPerDay7d: round1(sumMin / 7),
      studyDays7d: recentLogs.filter(r => r.minutes > 0 || r.topics_completed > 0).length,
      paceVerdict: paceVerdict ?? NA,
    },
  };
}

export const ENGINE_TEMPLATE = `You are the core analytical engine of a high-efficiency Offline Study Tracker. Your primary directives are precision, mathematical grounding, and zero hallucination.

You are being injected with real-time, offline database telemetry from the user's application. You must analyze their custom query using only the structural parameters provided below.

[DATABASE TELEMETRY PARAMETERS]
- CURRENT_ACTIVE_UNIT: {{current_unit}}
- CURRENT_TOPIC_FOCUS: {{current_topic}}
- COMPLETED_SYLLABUS_PERCENTAGE: {{completion_rate}}%
- TARGET_EXAM_DATE: {{exam_date}}
- DAYS_UNTIL_EXAM: {{days_remaining}}
- HISTORICAL_STUDY_LOGS_7D: {{recent_logs_json}}
- CUMULATIVE_MCQS_PRACTICED: {{total_mcqs}}
- ACCURACY_RATE (measured from the MCQ practice log): {{accuracy_rate}}%

[APP-COMPUTED DERIVED METRICS — exact values; use these instead of doing your own arithmetic]
- TOPICS_TOTAL / COMPLETED / REMAINING: {{topics_total}} / {{topics_done}} / {{topics_remaining}}
- REMAINING_TOPICS_IN_ACTIVE_UNIT: {{unit_remaining}}
- REQUIRED_PACE (remaining topics ÷ days until exam): {{required_pace}} topics/day
- OBSERVED_PACE (topics completed in the last 7 days ÷ 7): {{observed_pace}} topics/day
- AVERAGE_STUDY_MINUTES_PER_DAY_7D: {{avg_minutes}}
- STUDY_DAYS_IN_LAST_7: {{study_days}}
- PACE_VERDICT: {{pace_verdict}}

[ANTI-GRAVITY EXECUTION ARCHITECTURE (OPERATIONAL RULES)]
1. STRICT BOUNDARY RETENTION: Do not drift into generic motivational speeches, standard internet study tips (like Pomodoro, unless requested), or speculative timelines. Every strategic adjustment you offer must be mathematically tethered to the DAYS_UNTIL_EXAM and COMPLETED_SYLLABUS_PERCENTAGE.
2. DISCRETE SYLLABUS TRACKING: Treat the CURRENT_ACTIVE_UNIT as the absolute bottleneck. Assess whether the user's daily study duration logs are mathematically sufficient to clear the remaining syllabus units before the TARGET_EXAM_DATE.
3. EMPIRICAL BENCHMARKING: Evaluate MCQ patterns strictly. If the user's current metrics show a low accuracy rate or low daily practice numbers, prioritize targeted diagnostic revision blocks over moving forward to new units.
4. TONE AND REASONING: Maintain a direct, objective, and analytical posture. Provide actionable, high-density study directives. If data columns are empty or missing, state that you cannot evaluate that metric instead of guessing.

[HANDLING OF THE VALUE ${'NOT_AVAILABLE'}]
A parameter equal to NOT_AVAILABLE is missing data: say you cannot evaluate that metric. Never estimate it.

[SUBJECT-KNOWLEDGE QUESTIONS]
When the question is about nursing / exam subject content (not about study strategy), answer it accurately and concisely for B.Sc. Nursing / NORCET preparation: definition first, then bullet points; for drugs give class, dose, route, side effects and nursing considerations; add a mnemonic only when it genuinely helps. If you are unsure of a fact, say so — never invent guidelines, statistics or doses. Do not apply the study-strategy rules above to pure content questions.

[FORMAT]
Markdown, direct and high-density, no filler or emojis. Reply in the user's language (English, Hindi or Hinglish).

[USER QUERY]
The user's question is the latest message of this conversation.`;

const fill = (v) => String(v);

/** Fill the template with a telemetry object from buildTelemetry(). */
export function renderEnginePrompt(t) {
  const d = t.derived;
  const map = {
    current_unit: t.currentUnit, current_topic: t.currentTopic, completion_rate: t.completionRate,
    exam_date: t.examDate, days_remaining: t.daysRemaining, recent_logs_json: t.recentLogsJson,
    total_mcqs: t.totalMcqs, accuracy_rate: t.accuracyRate,
    topics_total: d.totalTopics, topics_done: d.completedTopics, topics_remaining: d.remainingTopics,
    unit_remaining: d.remainingInActiveUnit, required_pace: d.requiredPace, observed_pace: d.observedPace,
    avg_minutes: d.avgMinutesPerDay7d, study_days: d.studyDays7d, pace_verdict: d.paceVerdict,
  };
  return ENGINE_TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? fill(map[k]) : NA));
}
