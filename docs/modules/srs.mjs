                                                        
                                                                                               
export const DAY = 86_400_000;
// SM-2 adaptation: four grades and a one-minute relearning step.
export function schedule(p          , rating        , now = Date.now())           {
  const q = { Again: 1, Hard: 3, Good: 4, Easy: 5 }[rating];
  const ease = Math.max(1.3, p.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (rating === 'Again') return { repetitions: 0, interval: 0, ease, due: now + 60_000 };
  let interval = p.repetitions === 0 ? 1 : p.repetitions === 1 ? 6 : Math.round(p.interval * p.ease);
  if (rating === 'Hard') interval = Math.max(1, Math.round(Math.max(1, p.interval) * 1.2));
  if (rating === 'Easy') interval = Math.max(4, Math.round(interval * 1.3));
  return { repetitions: p.repetitions + 1, interval, ease, due: now + interval * DAY };
}
