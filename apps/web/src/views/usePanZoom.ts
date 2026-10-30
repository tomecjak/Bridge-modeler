import { type PointerEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { pan, type Size, type View, zoomAt } from './viewTransform.ts';

const ZOOM_PER_WHEEL_STEP = 1.15;
const INTERACTIVE = 'button, input, select, textarea, a, label, [role="button"]';

/**
 * Pohľad s posunom ťahaním a priblížením kolieskom. `fit` je predvolený pohľad (aj po „Prispôsobiť“).
 * Koliesko sa registruje natívne s `passive: false`, aby sa dalo zrušiť posúvanie stránky.
 */
export function usePanZoom(ref: RefObject<HTMLElement | null>, size: Size, fit: View | undefined) {
  const [custom, setCustom] = useState<View>();
  const view = custom ?? fit;
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<{ x: number; y: number; x0: number; y0: number; moved: boolean } | undefined>(
    undefined,
  );
  const lastWasDrag = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const current = viewRef.current;
      if (!current) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? ZOOM_PER_WHEEL_STEP : 1 / ZOOM_PER_WHEEL_STEP;
      setCustom(
        zoomAt(current, size, { x: e.clientX - rect.left, y: e.clientY - rect.top }, factor),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref, size]);

  const handlers = {
    onPointerDown(e: PointerEvent<Element>) {
      if (e.button !== 0) return;
      // tlačidlá a polia vo výkrese (lišta, prázdny stav) musia dostať klik — nezachytávať ukazovateľ
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false };
    },
    onPointerUp(e: PointerEvent<Element>) {
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      lastWasDrag.current = drag.current?.moved ?? false;
      drag.current = undefined;
    },
  };

  /** Vráti true, ak práve prebieha ťahanie (a posunie pohľad). */
  function dragMove(e: PointerEvent<Element>): boolean {
    const d = drag.current;
    const current = viewRef.current;
    if (!d || !current) return false;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    // posun o viac ako 3 px = ťahanie (nie klik)
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 3) d.moved = true;
    setCustom(pan(current, dx, dy));
    return true;
  }

  return {
    view,
    handlers,
    dragMove,
    /** skončilo posledné stlačenie ťahaním? (vtedy klik neznamená akciu) */
    wasDrag: () => lastWasDrag.current,
    reset: () => setCustom(undefined),
  };
}
