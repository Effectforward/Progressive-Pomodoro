// Pure stats computation — no DOM, no `state` import. Callers pass data plus
// an injectable clock so day boundaries / DST edge cases are testable.
// All sessions are focus sessions; `length` is seconds.

const DAY_MS = 86400000;
const WEEK_LEN = 7;
const YEAR_CELLS = 53 * WEEK_LEN;

export function localDateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// One pass over sessions: totals + per-local-day minutes. Shared by every view.
function bucket(sessions) {
  const list = sessions || [];
  let totalSec = 0;
  let bestSec = 0;
  const daySec = new Map();
  for (const s of list) {
    const sec = Number(s.length) || 0;
    totalSec += sec;
    if (sec > bestSec) bestSec = sec;
    const t = new Date(s.timestamp).getTime();
    if (!Number.isFinite(t)) continue;
    const key = localDateKey(t);
    daySec.set(key, (daySec.get(key) || 0) + sec);
  }
  return { totalSec, bestSec, daySec };
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function computeStats(sessions, nextFocusSec, now = new Date()) {
  const list = sessions || [];
  const { totalSec, bestSec, daySec } = bucket(list);

  // Calendar week (Mon start, local time) — count sessions in the current week
  const currentOffset = (now.getDay() + 6) % 7;
  const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - currentOffset).getTime();
  let thisWeekSec = 0;
  for (const s of list) {
    const t = new Date(s.timestamp).getTime();
    if (Number.isFinite(t) && t >= currentWeekStart) thisWeekSec += s.length;
  }

  // Last 7 rolling days, oldest first. Subtracting whole days from local
  // midnight drifts ±1h across DST but localDateKey still yields the right day.
  const todayStart = startOfDay(now);
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart.getTime() - i * DAY_MS);
    last7.push({
      label: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
      minutes: Math.round((daySec.get(localDateKey(d)) || 0) / 60),
      isToday: i === 0,
    });
  }

  // Month heatmap: 35 days ending today, laid out as columns of weeks with
  // weekdays as rows (Sunday first, GitHub style).
  const gridStart = new Date(todayStart.getTime() - todayStart.getDay() * DAY_MS);
  let monthTotalSec = 0;
  const month = [];
  for (let i = 0; i < 35; i++) {
    const d = new Date(gridStart.getTime() + i * DAY_MS);
    const sec = daySec.get(localDateKey(d)) || 0;
    monthTotalSec += sec;
    month.push({
      date: d,
      minutes: Math.round(sec / 60),
      isToday: d.getTime() === todayStart.getTime(),
    });
  }

  return {
    level: Math.round((nextFocusSec || 0) / 60),
    total: Math.round(totalSec / 60),
    best: Math.round(bestSec / 60),
    count: list.length,
    thisWeek: Math.round(thisWeekSec / 60),
    last7,
    monthTotal: Math.round(monthTotalSec / 60),
    month,
  };
}

// Year heatmap: 53 weeks ending today, GitHub style (Sunday-first columns).
// Aligned with the 365-day retention so the grid is fully populated.
export function computeYear(sessions, now = new Date()) {
  const { daySec } = bucket(sessions);
  const todayStart = startOfDay(now);
  let gridStart = new Date(todayStart.getTime() - (52 * 7 * DAY_MS));
  gridStart = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() - gridStart.getDay());
  const cells = [];
  for (let i = 0; i < YEAR_CELLS; i++) {
    const d = new Date(gridStart.getTime() + i * DAY_MS);
    cells.push({
      date: d,
      minutes: Math.round((daySec.get(localDateKey(d)) || 0) / 60),
      isToday: d.getTime() === todayStart.getTime(),
    });
  }
  return { weeks: YEAR_CELLS / WEEK_LEN, cells };
}

// Rating quality insight. Null until enough rated sessions exist so a lucky
// first rating can't read as "100% Flow" (gated at `min` rated sessions).
export function ratingInsight(sessions, min = 5) {
  const rated = (sessions || []).filter(s => s.rating === 'flow' || s.rating === 'focused' || s.rating === 'good' || s.rating === 'distracted');
  if (rated.length < min) return null;
  const good = rated.filter(s => s.rating === 'flow' || s.rating === 'focused').length;
  return { rated: rated.length, good, pct: Math.round((good / rated.length) * 100) };
}
