// Gráfica de líneas en canvas. Huecos (null) se dibujan como cortes.
import { useEffect, useRef } from 'react';
import { Sample } from '../../shared/telemetry';

export interface ChartSeries {
  label: string;
  color: string;
  data: () => Sample[];
}

interface Props {
  series: ChartSeries[];
  windowMs?: number;
  unit: string;
  yMin?: number;
  yMax?: number;
  /** Tiempo sin datos tras el cual se marca un hueco (ms). */
  gapMs?: number;
}

export function LineChart({ series, windowMs = 60000, unit, yMin, yMax, gapMs = 1500 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      if (ts - last < 200) return;
      last = ts;
      const c = ref.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const now = Date.now();
      const t0 = now - windowMs;
      const all = series.map((s) => s.data().filter((p) => p.t >= t0 - gapMs));
      let lo = Infinity;
      let hi = -Infinity;
      for (const arr of all) for (const p of arr) if (p.v !== null) {
        lo = Math.min(lo, p.v);
        hi = Math.max(hi, p.v);
      }
      if (yMin !== undefined) lo = Math.min(lo, yMin);
      if (yMax !== undefined) hi = Math.max(hi, yMax);
      if (!Number.isFinite(lo)) {
        lo = 0;
        hi = 1;
      }
      if (hi - lo < 1e-6) {
        hi += 1;
        lo -= 1;
      }
      const pad = (hi - lo) * 0.08;
      lo -= pad;
      hi += pad;
      const L = 40;
      const R = 6;
      const T = 6;
      const B = 16;
      const x = (t: number) => L + ((t - t0) / windowMs) * (w - L - R);
      const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (h - T - B);
      // rejilla
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.lineWidth = 1;
      g.fillStyle = '#8d93a2';
      g.font = '11px "JetBrains Mono", monospace';
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (let i = 0; i <= 3; i++) {
        const v = lo + ((hi - lo) * i) / 3;
        const yy = Math.round(y(v)) + 0.5;
        g.beginPath();
        g.moveTo(L, yy);
        g.lineTo(w - R, yy);
        g.stroke();
        g.fillText(Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2), L - 4, yy);
      }
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      const span = windowMs / 1000;
      const pxPerS = (w - L - R) / span;
      const stepS = [5, 10, 15, 20, 30, 60].find((st) => st * pxPerS >= 46) ?? span;
      for (let s = stepS; s <= span; s += stepS) {
        const xx = x(now - s * 1000);
        if (xx < L + 12) break;
        g.fillText(`-${s}s`, xx, h - 3);
      }
      g.textAlign = 'right';
      g.fillText('ahora', w - R, h - 3);
      g.textAlign = 'left';
      g.fillText(unit, 4, T + 6);
      // series
      all.forEach((arr, i) => {
        g.strokeStyle = series[i].color;
        g.lineWidth = 1.6;
        g.beginPath();
        let pen = false;
        let prevT = -Infinity;
        for (const p of arr) {
          if (p.v === null || p.t - prevT > gapMs) pen = false;
          if (p.v !== null) {
            const px = x(p.t);
            const py = y(p.v);
            if (!pen) g.moveTo(px, py);
            else g.lineTo(px, py);
            pen = true;
          }
          prevT = p.t;
        }
        g.stroke();
        // dato desactualizado: marca discontinua hasta "ahora"
        const lastP = arr[arr.length - 1];
        if (lastP && lastP.v !== null && now - lastP.t > gapMs) {
          g.setLineDash([3, 4]);
          g.strokeStyle = '#8d93a2';
          g.beginPath();
          g.moveTo(x(lastP.t), y(lastP.v));
          g.lineTo(x(now), y(lastP.v));
          g.stroke();
          g.setLineDash([]);
        }
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [series, windowMs, unit, yMin, yMax, gapMs]);
  return <canvas ref={ref} />;
}
