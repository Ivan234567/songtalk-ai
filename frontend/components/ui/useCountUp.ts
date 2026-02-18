'use client';

import { useEffect, useRef, useState } from 'react';

type UseCountUpOptions = {
  target: number;
  duration?: number;
  decimals?: number;
  enabled?: boolean;
};

export function useCountUp({
  target,
  duration = 600,
  decimals = 0,
  enabled = true,
}: UseCountUpOptions): string {
  const [display, setDisplay] = useState(enabled ? '0' : format(target, decimals));
  const prevTarget = useRef(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      setDisplay(format(target, decimals));
      return;
    }

    const from = prevTarget.current;
    prevTarget.current = target;
    const diff = target - from;
    if (Math.abs(diff) < 0.01) {
      setDisplay(format(target, decimals));
      return;
    }

    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + diff * eased;
      setDisplay(format(current, decimals));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, decimals, enabled]);

  return display;
}

function format(value: number, decimals: number): string {
  return decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
}
