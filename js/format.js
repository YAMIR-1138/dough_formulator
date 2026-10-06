/**
 * format.js - rounding, number formatting, and sum reconciliation.
 * Pure module: no DOM, no state. All model math stays in full floats;
 * rounding happens here, at display time only.
 */

/** Round to nearest gram. */
export function roundG(x) {
    return Math.round(x);
}

/** Round to 0.1 g - used for salt and other small amounts. */
export function round1(x) {
    return Math.round(x * 10) / 10;
}

/**
 * Display-round a gram amount: 0.1 g precision under 50 g, whole grams above.
 */
export function displayGrams(x) {
    return x < 50 ? round1(x) : roundG(x);
}

/** Format a percentage with 1 decimal, trimming a trailing ".0". */
export function formatPct(x) {
    const s = (Math.round(x * 10) / 10).toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Format a gram amount for display, with unit. */
export function formatGrams(x) {
    return `${displayGrams(x)}g`;
}

/**
 * Reconcile a list of rounded parts against a total so they sum exactly.
 * Each part: { key, value } (value = exact float). Returns
 * { parts: [{key, value}], total } where every value is display-rounded and
 * the residual (from rounding) is absorbed by the largest part, so the
 * displayed lines always add up to the displayed total.
 */
export function reconcileSum(parts) {
    const rounded = parts.map(p => ({ key: p.key, value: displayGrams(p.value) }));
    const exactTotal = parts.reduce((s, p) => s + p.value, 0);
    const total = displayGrams(exactTotal);
    const roundedSum = rounded.reduce((s, p) => s + p.value, 0);
    // Absorb the residual into the largest part (avoids off-by-a-gram totals)
    const residual = round1(total - roundedSum);
    if (residual !== 0 && rounded.length > 0) {
        let largest = rounded[0];
        for (const p of rounded) {
            if (p.value > largest.value) largest = p;
        }
        largest.value = round1(largest.value + residual);
    }
    return { parts: rounded, total };
}

/** Clamp a number into [min, max]. */
export function clamp(x, min, max) {
    return Math.min(max, Math.max(min, x));
}

/** Format minutes as "2h 30m" / "45m" / "3h". */
export function formatDuration(minutes) {
    const m = Math.round(minutes);
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h === 0) return `${rem}m`;
    if (rem === 0) return `${h}h`;
    return `${h}h ${rem}m`;
}

/** Celsius → Fahrenheit. */
export function cToF(c) {
    return c * 9 / 5 + 32;
}

/** Fahrenheit → Celsius. */
export function fToC(f) {
    return (f - 32) * 5 / 9;
}
