import React, { useEffect, useRef } from 'react';

/* ── True 3D cube — six faces ─────────────────────────────────────── */
function Cube({ size, tint, opacity, style }: {
  size: number; tint: string; opacity: number; style: React.CSSProperties;
}) {
  return (
    <div className="lcube-wrap" style={{ ...style, ['--s' as string]: size, ['--o' as string]: opacity } as React.CSSProperties}>
      <div className="lcube" data-tint={tint}>
        <div className="lcube-face f-front" />
        <div className="lcube-face f-back" />
        <div className="lcube-face f-right" />
        <div className="lcube-face f-left" />
        <div className="lcube-face f-top" />
        <div className="lcube-face f-bottom" />
      </div>
    </div>
  );
}

/* ── Orbital ring with traveling nodes ─────────────────────────────── */
function Orbit({ size, tint, tilt, duration, reverse }: {
  size: number; tint: string; tilt: number; duration: number; reverse?: boolean;
}) {
  return (
    <div
      className="orbit"
      data-tint={tint}
      style={{
        ['--sz' as string]: size,
        ['--tilt' as string]: `${tilt}deg`,
        animation: `orbit-rot ${duration}s linear infinite ${reverse ? 'reverse' : ''}`,
      } as React.CSSProperties}
    >
      <div className="orbit-spin" style={{ animationDuration: `${duration}s`, animationDirection: reverse ? 'reverse' : 'normal' }}>
        <span className="orbit-node" />
        <span className="orbit-node orbit-node--b" />
      </div>
    </div>
  );
  }


/* ── Rising diamond spark ──────────────────────────────────────────── */
const SPARKS = [
  { left: 8,  dx: 42,  dur: 24, delay: 0,  s: 5 },
  { left: 19, dx: -36, dur: 30, delay: 6,  s: 4 },
  { left: 33, dx: 55,  dur: 21, delay: 12, s: 6 },
  { left: 47, dx: -28, dur: 33, delay: 3,  s: 4 },
  { left: 58, dx: 38,  dur: 27, delay: 16, s: 5 },
  { left: 71, dx: -50, dur: 23, delay: 9,  s: 6 },
  { left: 84, dx: 30,  dur: 31, delay: 18, s: 4 },
  { left: 93, dx: -42, dur: 26, delay: 13, s: 5 },
];

export default function LatticeBackground({ quiet }: { quiet?: boolean }) {
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
      cx += (tx - cx) * 0.04;
      cy += (ty - cy) * 0.04;
      el.style.setProperty('--px', cx.toFixed(4));
      el.style.setProperty('--py', cy.toFixed(4));
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
    <div className={`lattice${quiet ? ' lattice--quiet' : ''}`} ref={rootRef} aria-hidden="true">
      {/* Aurora ribbons */}
      <span className="aurora aurora--1" />
      <span className="aurora aurora--2 q-hide" />

      {/* Far layer — slow parallax */}
      <div className="pxa" style={{ ['--d' as string]: 6 } as React.CSSProperties}>
        <Cube size={210} tint="violet" opacity={.34} style={{ top: '12%', left: '-4%' }} />
        <Cube size={150} tint="ink" opacity={.4} style={{ bottom: '16%', right: '6%' }} />
        <Cube size={120} tint="violet" opacity={.3} style={{ top: '58%', left: '4%' }} />
      </div>

      {/* Mid layer — the orbital system */}
      <div className="pxa" style={{ ['--d' as string]: 13 } as React.CSSProperties}>
        <div className="orbit-center">
          <Orbit size={640} tint="ink" tilt={66} duration={30} />
          <Orbit size={500} tint="orange" tilt={72} duration={22} reverse />
          <Orbit size={780} tint="violet" tilt={60} duration={44} />
          <span className="orbit-core" />
        </div>
      </div>

      {/* Near layer — fast parallax, larger cubes */}
      <div className="pxa" style={{ ['--d' as string]: 26 } as React.CSSProperties}>
        <Cube size={95} tint="orange" opacity={.6} style={{ top: '17%', right: '13%' }} />
        <Cube size={75} tint="ink" opacity={.55} style={{ bottom: '9%', left: '16%' }} />
        <Cube size={60} tint="orange" opacity={.5} style={{ top: '44%', left: '8%' }} />
        <Cube size={52} tint="violet" opacity={.45} style={{ bottom: '30%', right: '4%' }} />
      </div>

      {/* Rising sparks */}
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className="spark"
          style={{
            left: `${s.left}%`,
            width: s.s, height: s.s,
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
            ['--dx' as string]: `${s.dx}px`,
          }}
        />
      ))}

      <span className="lattice-vignette" />
    </div>
  );
}
