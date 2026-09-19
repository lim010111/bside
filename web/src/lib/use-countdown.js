import { useEffect, useState } from 'react';

export function useCountdown(deadline = 0) {
  const [time, setTime] = useState(Date.now);
  useEffect(() => {
    if (deadline <= Date.now()) return;
    const timer = setInterval(() => {
      const next = Date.now();
      setTime(next);
      if (next >= deadline) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [deadline]);
  return Math.max(0, Math.ceil((deadline - time) / 1000));
}
