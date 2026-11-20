// The Overview greeting: says hello in a way that fits the moment.
// Some lines use your name, some don't, so it feels like a person talking, not a mail merge.
// One variant is picked per moment per day, so it doesn't change every time the page re-renders.

import { hm, phaseAt, isWorkday } from './schedule.js';
import { dayKey, fmtHM } from './time.js';

function pick(list, seed) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

/**
 * ctx = { now, name, wh, todayMs, goalMs, lastActiveAt, firstToday, tracking, wasOffYesterday }
 * returns { title, sub }
 */
export function greeting(ctx) {
  const { now, wh, todayMs = 0, goalMs = 0, lastActiveAt, firstToday, tracking, wasOffYesterday } = ctx;
  const first = (ctx.name || '').trim().split(/\s+/)[0];
  // `n(a, b)`: line a with the name, line b without (used when no name is set).
  const n = (withName, without) => (first ? withName.replace('{n}', first) : without);
  const d = new Date(now);
  const mins = d.getHours() * 60 + d.getMinutes();
  const day = d.getDay();
  const seed = (k) => `${dayKey(now)}|${k}`;
  const start = hm(wh.start);
  const end = hm(wh.end);
  const lunchEnd = hm(wh.lunchEnd);
  const left = Math.max(0, goalMs - todayMs);
  const away = lastActiveAt ? now - lastActiveAt : 0;
  const soFar = todayMs > 0 ? `${fmtHM(todayMs)} so far today.` : '';
  const toGoal = left ? ` About ${fmtHM(left)} to your goal.` : '';
  const counting = tracking ? "I'm counting. Just do your thing." : "Open what you're working on and I'll start counting.";

  if (!isWorkday(now, wh)) {
    return {
      title: pick([n('Enjoy your day off, {n}', 'Enjoy your day off'), 'No work today', n('Rest up, {n}', 'Rest up'), 'A day for you'], seed('off')),
      sub: todayMs > 0 ? `${fmtHM(todayMs)} counted today. It shows as extra time.` : "Nothing to track. I'll be here when you're back.",
    };
  }
  if (wasOffYesterday && !todayMs && mins < start + 180) {
    return { title: pick([n('Welcome back, {n}', 'Welcome back'), 'Good to have you back', 'Easing back in?'], seed('back-leave')), sub: 'Your day starts fresh.' };
  }
  if (mins >= end) {
    if (day === 5) return { title: pick(['Happy Friday', "That's the week", n('Weekend’s calling, {n}', 'Weekend’s calling')], seed('fri-eve')), sub: `${soFar} Anything now counts as overtime. Go enjoy the weekend.`.trim() };
    return {
      title: pick(['Wrapping up?', n('Nice work today, {n}', 'Nice work today'), "Day's done", 'Time to log off?'], seed('eve')),
      sub: `${soFar} Anything from here counts as overtime.`.trim(),
    };
  }
  if (goalMs && todayMs >= goalMs) {
    return { title: pick(['Goal reached', n('You did it, {n}', 'You did it'), `That's your ${fmtHM(goalMs)}`], seed('goal')), sub: 'Everything from here is a bonus. Take it easy.' };
  }
  if (away > 60 * 60000 && todayMs > 0 && phaseAt(now, wh) !== 'lunch') {
    return { title: pick([n('Welcome back, {n}', 'Welcome back'), 'Good to see you again', 'Picking up where you left off'], seed('away')), sub: `You were away ${fmtHM(away)}. ${soFar}`.trim() };
  }
  if (phaseAt(now, wh) === 'lunch') {
    return { title: pick(['Lunch time', n('Go eat, {n}', 'Go eat'), 'Time for a proper break'], seed('lunch')), sub: `Your break runs ${wh.lunchStart}–${wh.lunchEnd}. ${soFar}`.trim() };
  }
  if (mins >= lunchEnd && mins < lunchEnd + 45 && todayMs > 0) {
    return { title: pick([n('Back at it, {n}', 'Back at it'), 'Hope lunch was good', 'Welcome back from lunch', 'Round two'], seed('after-lunch')), sub: `${soFar}${toGoal}`.trim() };
  }
  if (mins < start) {
    return { title: pick([n("You're up early, {n}", "You're up early"), 'Early start', 'The quiet hours'], seed('early')), sub: `Work hours start at ${wh.start}. Time before then counts as overtime.` };
  }
  if (mins < 12 * 60) {
    if (day === 1 && (firstToday || !todayMs)) return { title: pick([n('Good morning, {n}', 'Good morning'), 'New week, fresh start', 'Happy Monday'], seed('mon')), sub: counting };
    return {
      title: pick([n('Good morning, {n}', 'Good morning'), "Morning. Let's get started", n('Morning, {n}', 'Morning'), 'Ready when you are'], seed('am')),
      sub: todayMs ? `${soFar}${toGoal}`.trim() : counting,
    };
  }
  if (day === 5) return { title: pick(['Almost the weekend', n('Friday afternoon, {n}', 'Friday afternoon'), 'Last stretch of the week'], seed('fri')), sub: `${soFar}${toGoal}`.trim() || counting };
  return {
    title: pick([n('Good afternoon, {n}', 'Good afternoon'), 'Keep it going', 'Afternoon, steady pace', n('Still going strong, {n}', 'Still going strong')], seed('pm')),
    sub: `${soFar}${toGoal}`.trim() || counting,
  };
}
