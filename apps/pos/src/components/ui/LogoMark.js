import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Brand mark from @icons/inbill-mark.svg — orange dot + ink body, theme-aware via CSS vars
export function LogoMark({ size = 28, mono = false }) {
    return (_jsxs("svg", { viewBox: "0 0 64 64", width: size, height: size, xmlns: "http://www.w3.org/2000/svg", "aria-label": "InBill", children: [_jsx("circle", { cx: "20", cy: "14", r: "5", fill: mono ? "currentColor" : "var(--v2-marigold)" }), _jsx("path", { d: "M15 28 L25 28 L25 52 L15 52 Z", fill: "currentColor" }), _jsx("path", { d: "M30 26 L52 26 L52 30 L48 32 L52 34 L48 36 L52 38 L48 40 L52 42 L48 44 L52 46 L48 48 L52 50 L30 50 Z", fill: "currentColor" })] }));
}
