"use client";
import { useEffect, useRef, useState } from "react";

export default function CountUp({ value, duration = 200 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      const v = Math.round(a + (value - a) * e);
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="tabular-nums">{shown.toLocaleString("en-US")}</span>;
}
