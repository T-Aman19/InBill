import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
const PAD = 8; // spotlight padding around the target
const CARD_W = 320; // tooltip width
const GAP = 14; // gap between spotlight and tooltip
function getRect(target) {
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el)
        return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0)
        return null;
    return { top: r.top, left: r.left, width: r.width, height: r.height };
}
export function GuidedTour({ steps, onFinish, onSkip, }) {
    // Drop steps whose anchor isn't on screen for this role (e.g. Manager nav for a cashier).
    const liveSteps = useMemo(() => steps.filter((s) => !s.target || getRect(s.target) !== null), [steps]);
    const [idx, setIdx] = useState(0);
    const [rect, setRect] = useState(null);
    const step = liveSteps[idx];
    const recompute = useCallback(() => {
        setRect(step?.target ? getRect(step.target) : null);
    }, [step]);
    useLayoutEffect(() => {
        // Measuring the live DOM rect is a genuine React→DOM sync, not derived state.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        recompute();
        // Re-measure after layout settles (nav icons / fonts can shift the rect).
        const raf = requestAnimationFrame(recompute);
        window.addEventListener("resize", recompute);
        window.addEventListener("scroll", recompute, true);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", recompute);
            window.removeEventListener("scroll", recompute, true);
        };
    }, [recompute]);
    const finish = useCallback(() => onFinish?.(), [onFinish]);
    const skip = useCallback(() => (onSkip ?? onFinish)?.(), [onSkip, onFinish]);
    const next = useCallback(() => {
        if (idx >= liveSteps.length - 1)
            finish();
        else
            setIdx((i) => i + 1);
    }, [idx, liveSteps.length, finish]);
    const back = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape")
                skip();
            else if (e.key === "ArrowRight" || e.key === "Enter")
                next();
            else if (e.key === "ArrowLeft")
                back();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [skip, next, back]);
    if (!step)
        return null;
    const isLast = idx === liveSteps.length - 1;
    const spot = rect
        ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
        : null;
    // Tooltip position
    const card = computeCardPosition(spot, step.placement);
    return (_jsxs("div", { style: { position: "fixed", inset: 0, zIndex: 9998, fontFamily: "var(--font-sans)" }, children: [spot ? (_jsx("div", { style: {
                    position: "fixed",
                    top: spot.top,
                    left: spot.left,
                    width: spot.width,
                    height: spot.height,
                    borderRadius: 12,
                    boxShadow: "0 0 0 9999px rgba(15, 17, 21, .62)",
                    transition: "all .25s cubic-bezier(.4,0,.2,1)",
                    pointerEvents: "none",
                } })) : (_jsx("div", { style: { position: "fixed", inset: 0, background: "rgba(15, 17, 21, .62)" } })), _jsx("div", { style: { position: "fixed", inset: 0 } }), _jsxs("div", { style: {
                    position: "fixed",
                    ...card,
                    width: CARD_W,
                    maxWidth: "calc(100vw - 32px)",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-line)",
                    borderRadius: 16,
                    boxShadow: "var(--shadow-3)",
                    padding: 20,
                    boxSizing: "border-box",
                    animation: "tourPop .22s cubic-bezier(.34,1.3,.5,1)",
                }, onClick: (e) => e.stopPropagation(), children: [_jsx("div", { style: { display: "flex", alignItems: "center", gap: 5, marginBottom: 14 }, children: liveSteps.map((_, i) => (_jsx("div", { style: {
                                height: 4,
                                flex: i === idx ? "0 0 18px" : "0 0 4px",
                                borderRadius: 2,
                                background: i === idx ? "var(--color-accent)" : i < idx ? "var(--color-accent-soft)" : "var(--color-line-strong)",
                                transition: "all .25s",
                            } }, i))) }), _jsx("div", { style: { fontSize: 16, fontWeight: 600, color: "var(--color-ink)", marginBottom: 6, lineHeight: 1.25 }, children: step.title }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-2)", lineHeight: 1.5, marginBottom: 18 }, children: step.body }), _jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [_jsx("button", { onClick: skip, style: {
                                    background: "none", border: "none", padding: 0, cursor: "pointer",
                                    fontSize: 12, color: "var(--color-ink-3)", fontFamily: "inherit",
                                }, children: "Skip tour" }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsxs("span", { style: { fontSize: 12, color: "var(--color-ink-4)", fontFamily: "var(--font-mono)" }, children: [idx + 1, "/", liveSteps.length] }), idx > 0 && (_jsx("button", { onClick: back, style: {
                                            padding: "8px 14px", borderRadius: 9, border: "1px solid var(--color-line-strong)",
                                            background: "var(--color-surface)", color: "var(--color-ink-2)",
                                            fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                                        }, children: "Back" })), _jsxs("button", { onClick: next, style: {
                                            padding: "8px 16px", borderRadius: 9, border: "none",
                                            background: "var(--color-ink)", color: "var(--color-bg)",
                                            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                                            display: "flex", alignItems: "center", gap: 6,
                                        }, children: [step.primaryLabel ?? (isLast ? "Done" : "Next"), !isLast && (_jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12h14M13 6l6 6-6 6" }) }))] })] })] })] }), _jsx("style", { children: `@keyframes tourPop { from { opacity: 0; transform: translateY(6px) scale(.98) } to { opacity: 1; transform: none } }` })] }));
}
/** Pick a tooltip anchor (top/left CSS) that keeps the card on screen and clear of the spotlight. */
function computeCardPosition(spot, placement) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 16;
    // Centered (welcome / finish) steps.
    if (!spot) {
        return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }
    const estH = 210; // approximate card height for placement math
    const fitsBelow = spot.top + spot.height + GAP + estH < vh - margin;
    const fitsAbove = spot.top - GAP - estH > margin;
    const place = placement ?? (fitsBelow ? "bottom" : fitsAbove ? "top" : "bottom");
    // Horizontal centering on the target, clamped to viewport.
    const cx = spot.left + spot.width / 2;
    const left = clamp(cx - CARD_W / 2, margin, vw - CARD_W - margin);
    if (place === "bottom") {
        return { top: spot.top + spot.height + GAP, left };
    }
    if (place === "top") {
        return { top: Math.max(margin, spot.top - GAP - estH), left };
    }
    // left / right
    const cy = clamp(spot.top + spot.height / 2 - estH / 2, margin, vh - estH - margin);
    if (place === "right")
        return { top: cy, left: Math.min(spot.left + spot.width + GAP, vw - CARD_W - margin) };
    return { top: cy, left: Math.max(margin, spot.left - CARD_W - GAP) };
}
function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}
