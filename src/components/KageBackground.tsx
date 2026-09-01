import React, { useEffect, useRef } from 'react';

const HEX_POINTS = 'M256 89 401 172v168L256 423 111 340V172L256 89Z';

const MOTES = [
  { left: 12, size: 3, dur: 21, delay: 0,   drift: 40,  o: .6 },
  { left: 24, size: 2, dur: 27, delay: 4,   drift: -30, o: .5 },
  { left: 38, size: 3, dur: 18, delay: 9,   drift: 55,  o: .7 },
  { left: 52, size: 2, dur: 31, delay: 2,   drift: -45, o: .45 },
  { left: 63, size: 3, dur: 24, delay: 13,  drift: 35,  o: .55 },
  { left: 74, size: 2, dur: 29, delay: 7,   drift: -25, o: .5 },
  { left: 86, size: 3, dur: 22, delay: 16,  drift: 48,  o: .6 },
  { left: 95, size: 2, dur: 26, delay: 11,  drift: -38, o: .45 },
];

function HexRing({ variant, double }: { variant: string; double?: boolean }) {
  return (
    <span className={`kage-ring kage-ring--${variant}`} aria-hidden="true">
      <svg viewBox="0 0 512 512" fill="none">
        <path d={HEX_POINTS} stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {double && (
          <>
            <path d={HEX_POINTS} stroke="currentColor" strokeWidth="1.5" opacity=".5" transform="scale(.72) translate(99,99)" vectorEffect="non-scaling-stroke" />
            <path d={HEX_POINTS} stroke="currentColor" strokeWidth="1.5" opacity=".25" transform="scale(.46) translate(149,149)" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
    </span>
  );
}

export default function KageBackground({ quiet }: { quiet?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;

    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const tick = () => {
      cx += (tx - cx) * 0.045;
      cy += (ty - cy) * 0.045;
      el.style.setProperty('--kage-mx', cx.toFixed(4));
      el.style.setProperty('--kage-my', cy.toFixed(4));
      raf = requestAnimationFrame(tick);
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
      window.addEventListener('pointermove', onMove, { passive: true });
      raf = requestAnimationFrame(tick);
    }

    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={`kage${quiet ? ' kage--quiet' : ''}`} ref={rootRef} aria-hidden="true">
      <div className="kage-depth">
        <HexRing variant="a" double />
        <HexRing variant="b" double />
        <HexRing variant="c" />
        <HexRing variant="d" />
      </div>
      <span className="kage-floor" />
      <span className="kage-beam kage-beam--1" />
      <span className="kage-beam kage-beam--2" />
      <span className="kage-orb kage-orb--1" />
      <span className="kage-orb kage-orb--2" />
      <span className="kage-orb kage-orb--3" />
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="kage-mote"
          style={{
            left: `${m.left}%`,
            width: m.size, height: m.size,
            opacity: m.o,
            animationDuration: `${m.dur}s`,
            animationDelay: `${m.delay}s`,
            ['--kage-drift' as string]: `${m.drift}px`,
          }}
        />
      ))}
      <span className="kage-vignette" />
    </div>
  );
}
