"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useSpring, type HTMLMotionProps } from "motion/react";

const ease = [0.22, 1, 0.36, 1] as const;

/** Fade + rise on first entry into the viewport. */
export function Reveal({ children, delay = 0, y = 22, className, style, once = true }: { children: React.ReactNode; delay?: number; y?: number; className?: string; style?: React.CSSProperties; once?: boolean }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-8% 0px -8% 0px" }}
      transition={{ duration: 0.75, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered children: wrap items in <Item/>. */
export function Stagger({ children, className, gap = 0.08, style }: { children: React.ReactNode; className?: string; gap?: number; style?: React.CSSProperties }) {
  return (
    <motion.div className={className} style={style} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-8% 0px" }} variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}>
      {children}
    </motion.div>
  );
}
export function Item({ children, className, style, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div className={className} style={style} variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.65, ease } } }} {...rest}>
      {children}
    </motion.div>
  );
}

/** Number that springs from its previous value to the next one. */
export function Counter({ value, decimals = 2, prefix = "", suffix = "", className }: { value: number; decimals?: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 18, mass: 0.8 });
  const [text, setText] = useState(fmt(0, decimals));
  useEffect(() => { if (inView) mv.set(Number.isFinite(value) ? value : 0); }, [inView, value, mv]);
  useEffect(() => spring.on("change", (v) => setText(fmt(v, decimals))), [spring, decimals]);
  return <span ref={ref} className={className}>{prefix}{text}{suffix}</span>;
}
const fmt = (v: number, d: number) => v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * A value that keeps moving between on-chain reads. `value` is the last read (base units),
 * the hook measures the observed rate between reads and interpolates every frame so the
 * number never stands still while a job is live. The anchor is always the chain.
 */
export function useInterpolated(value: bigint, live: boolean, maxAheadMs = 8000): bigint {
  const [display, setDisplay] = useState(value);
  const last = useRef<{ v: bigint; at: number; reads: number }>({ v: value, at: Date.now(), reads: 0 });
  const rate = useRef(0);
  useEffect(() => {
    const now = Date.now();
    const prev = last.current;
    // A rate needs two real reads: the mount value (0 before the first poll) would make the first delta look like a spike.
    if (prev.reads >= 1 && now > prev.at && value > prev.v) rate.current = Number(value - prev.v) / (now - prev.at);
    if (value < prev.v) rate.current = 0;
    last.current = { v: value, at: now, reads: prev.reads + 1 };
    setDisplay(value);
  }, [value]);
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const tick = () => {
      const ahead = Math.min(Date.now() - last.current.at, maxAheadMs); // never run far past the last read
      setDisplay(last.current.v + BigInt(Math.floor(rate.current * ahead)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, maxAheadMs]);
  return display;
}

export { motion };
