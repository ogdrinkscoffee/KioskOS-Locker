import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

export const EASE_SETTLE = [0.16, 1, 0.3, 1] as const;

export const SPRING_SNAPPY = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 34,
  mass: 0.78,
};

export const SPRING_MODAL = {
  type: 'spring' as const,
  stiffness: 390,
  damping: 30,
  mass: 0.85,
};

interface MotionWorkspacePanelProps {
  children: React.ReactNode;
  className?: string;
}

export const MotionWorkspacePanel: React.FC<MotionWorkspacePanelProps> = ({
  children,
  className,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -6 }}
    transition={{ duration: 0.17, ease: EASE_SETTLE }}
    className={className}
  >
    {children}
  </motion.div>
);

/**
 * 60fps HTML5 Canvas orbital security telemetry overlay for the Hero Shield showcase.
 * Zero React re-renders per frame; respects prefers-reduced-motion and pauses when tab is hidden.
 */
export const HeroSecurityCanvas: React.FC<{
  pointerX?: number;
  pointerY?: number;
  className?: string;
}> = ({ pointerX = 0.5, pointerY = 0.5, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef({ x: pointerX, y: pointerY });
  pointerRef.current.x = pointerX;
  pointerRef.current.y = pointerY;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotionQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId = 0;
    let startTs = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };

    const drawFrame = (now: number) => {
      if (width <= 0 || height <= 0) return;
      const elapsed = reduceMotionQuery?.matches ? 0 : (now - startTs) * 0.001;
      const px = (pointerRef.current.x - 0.5) * 10;
      const py = (pointerRef.current.y - 0.5) * 10;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5 + px;
      const cy = height * 0.5 + py;
      const baseR = Math.min(width, height) * 0.36;

      // Subtle pointer-responsive atmospheric glow
      const glow = ctx.createRadialGradient(cx, cy, baseR * 0.1, cx, cy, baseR * 1.45);
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.16)');
      glow.addColorStop(0.55, 'rgba(14, 165, 233, 0.05)');
      glow.addColorStop(1, 'rgba(10, 18, 32, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // Outer dashed telemetry ring (CW rotation)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(elapsed * 0.22);
      ctx.beginPath();
      ctx.setLineDash([4, 9]);
      ctx.arc(0, 0, baseR * 1.12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.28)';
      ctx.lineWidth = 1.25;
      ctx.stroke();

      // Cardinal perimeter ticks
      ctx.setLineDash([]);
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        const inner = baseR * (i % 3 === 0 ? 1.03 : 1.07);
        const outer = baseR * 1.16;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
        ctx.strokeStyle =
          i % 3 === 0 ? 'rgba(56, 189, 248, 0.55)' : 'rgba(148, 163, 184, 0.24)';
        ctx.lineWidth = i % 3 === 0 ? 1.6 : 1;
        ctx.stroke();
      }
      ctx.restore();

      // Inner lock arc (CCW rotation)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-elapsed * 0.36);
      for (let s = 0; s < 3; s += 1) {
        const startA = (s * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(0, 0, baseR * 0.86, startA, startA + 0.95);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
        ctx.lineWidth = 1.75;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Orbiting defense satellites (3 nodes)
      for (let n = 0; n < 3; n += 1) {
        const nodeA = (n * Math.PI * 2) / 3 + 0.45;
        const nx = Math.cos(nodeA) * baseR * 0.86;
        const ny = Math.sin(nodeA) * baseR * 0.86;
        ctx.beginPath();
        ctx.arc(nx, ny, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(186, 230, 253, 0.92)';
        ctx.fill();
      }
      ctx.restore();
    };

    const tick = (now: number) => {
      if (document.visibilityState === 'visible') {
        drawFrame(now);
      }
      if (!reduceMotionQuery?.matches) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    resize();
    drawFrame(performance.now());
    if (!reduceMotionQuery?.matches) {
      rafId = window.requestAnimationFrame(tick);
    }

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        startTs = performance.now();
        drawFrame(startTs);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none select-none ${className}`}
    />
  );
};

interface SvgProgressRingProps {
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  trackClassName?: string;
  progressClassName?: string;
  children?: React.ReactNode;
}

export const SvgProgressRing: React.FC<SvgProgressRingProps> = ({
  progress,
  size = 112,
  strokeWidth = 5,
  trackClassName = 'stroke-slate-700/60',
  progressClassName = 'stroke-sky-400',
  children,
}) => {
  const clamped = Math.max(0, Math.min(1, progress));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - clamped);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          className={trackClassName}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke-dashoffset 280ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          className={progressClassName}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
};
