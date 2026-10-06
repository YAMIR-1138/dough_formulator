/**
 * lab-geometry.js - pure math and text helpers for THE LAB.
 * No DOM, no Date.now(): everything here runs under Node for testing.
 */

/* ------------------------------------------------------------------ */
/* Rotary dial (Pocket Dial)                                           */
/* ------------------------------------------------------------------ */

/** Dial sweep: 270° starting at -135° (7 o'clock) ending at +135°. 0° = up. */
export const DIAL = { start: -135, sweep: 270 };

/** Angle (deg) for a value within [min, max]. */
export function angleOf(min, max, v) {
    const t = (Math.min(max, Math.max(min, v)) - min) / (max - min);
    return DIAL.start + t * DIAL.sweep;
}

/** Snapped value for an angle (deg), clamped to the sweep. */
export function valueOf(min, max, step, deg) {
    const t = Math.min(1, Math.max(0, (deg - DIAL.start) / DIAL.sweep));
    const raw = min + t * (max - min);
    const snapped = Math.round(raw / step) * step;
    // Avoid float dust like 74.9999999
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    return Math.min(max, Math.max(min, Number(snapped.toFixed(decimals))));
}

/** Pointer position → angle in degrees, 0 = straight up, positive clockwise. */
export function pointerAngle(cx, cy, x, y) {
    return Math.atan2(x - cx, cy - y) * 180 / Math.PI;
}

/** Smallest signed difference between two angles, in (-180, 180]. */
export function angleDelta(fromDeg, toDeg) {
    let d = toDeg - fromDeg;
    while (d > 180) d -= 360;
    while (d <= -180) d += 360;
    return d;
}

/** SVG path for an arc of radius r between two dial angles (0° = up). */
export function arcPath(cx, cy, r, fromDeg, toDeg) {
    const pt = deg => {
        const rad = (deg - 90) * Math.PI / 180; // 0°=up → rotate coordinate frame
        return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
    };
    const [x1, y1] = pt(fromDeg);
    const [x2, y2] = pt(toDeg);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    const sweepFlag = toDeg >= fromDeg ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} ${sweepFlag} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/* Broken-axis time scale (Mission Control)                            */
/* ------------------------------------------------------------------ */

/**
 * Build a piecewise-linear time→x scale over scheduled steps.
 * Steps longer than capMin minutes are compressed to exactly capPx pixels.
 * Returns { x(date), width, segments, breaks } where segments are
 * { t0, t1, x0, x1, compressed } (times in ms).
 */
export function makeTimeScale(scheduledSteps, { pxPerMin = 1.1, capMin = 150, capPx = 110 } = {}) {
    const segments = [];
    const breaks = [];
    let x = 0;
    for (const step of scheduledSteps) {
        const t0 = step.start.getTime();
        const t1 = step.end.getTime();
        const minutes = (t1 - t0) / 60000;
        if (minutes <= 0) continue;
        const compressed = minutes > capMin;
        const w = compressed ? capPx : minutes * pxPerMin;
        segments.push({ t0, t1, x0: x, x1: x + w, compressed, id: step.id });
        if (compressed) breaks.push({ x0: x, x1: x + w, id: step.id });
        x += w;
    }
    const width = x;

    function xOf(date) {
        const t = date.getTime();
        if (!segments.length) return 0;
        if (t <= segments[0].t0) {
            // Extrapolate before the first step at the base rate
            return segments[0].x0 - ((segments[0].t0 - t) / 60000) * pxPerMin;
        }
        for (const seg of segments) {
            if (t <= seg.t1) {
                if (t < seg.t0) return seg.x0; // gap (shouldn't happen; steps chain)
                const f = (t - seg.t0) / (seg.t1 - seg.t0);
                return seg.x0 + f * (seg.x1 - seg.x0);
            }
        }
        const last = segments[segments.length - 1];
        return last.x1 + ((t - last.t1) / 60000) * pxPerMin;
    }

    return { x: xOf, width, segments, breaks, pxPerMin };
}

/**
 * List day/night shading bands over a time range using the scale.
 * Night = 21:00–07:00 local. Returns [{x0, x1, night}] covering the span.
 */
export function shadingBands(scale, startDate, endDate) {
    const bands = [];
    const cur = new Date(startDate);
    cur.setMinutes(0, 0, 0);
    const isNight = d => d.getHours() >= 21 || d.getHours() < 7;
    let bandStart = new Date(startDate);
    let bandNight = isNight(startDate);
    while (cur < endDate) {
        cur.setTime(cur.getTime() + 3600000);
        const n = isNight(cur);
        if (n !== bandNight || cur >= endDate) {
            const bandEnd = cur >= endDate ? endDate : new Date(cur);
            bands.push({ x0: scale.x(bandStart), x1: scale.x(bandEnd), night: bandNight });
            bandStart = new Date(cur);
            bandNight = n;
        }
    }
    return bands;
}

/** Midnight boundaries within [start, end] → [{x, date}] for day labels. */
export function dayBoundaries(scale, startDate, endDate) {
    const out = [];
    const d = new Date(startDate);
    d.setHours(24, 0, 0, 0);
    while (d < endDate) {
        out.push({ x: scale.x(d), date: new Date(d) });
        d.setHours(24, 0, 0, 0);
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Jar scale (Dough Canvas)                                            */
/* ------------------------------------------------------------------ */

/** Round a gram capacity up to a friendly number. */
export function niceCeil(g) {
    const mag = Math.pow(10, Math.floor(Math.log10(g)));
    const unit = mag / 2;
    return Math.ceil(g / unit) * unit;
}

/** Friendly rounding quantum for a given dough weight. */
export function jarQuantum(doughWeight) {
    return doughWeight < 900 ? 50 : doughWeight < 2500 ? 100 : doughWeight < 6000 ? 250 : 500;
}

/**
 * Map grams ↔ jar pixels. The jar auto-zooms: capacity tracks the dough
 * (~85% fill) whatever the batch size, so a 300 g bake fills the glass
 * as proudly as an 1 800 g one. Hysteresis keeps the ruler stable across
 * small edits; freeze pins it during a live gesture.
 */
export function makeJarScale(doughWeight, { jarTopY = 60, jarBottomY = 560, prevCapacity = null, freeze = false } = {}) {
    const q = jarQuantum(doughWeight);
    let capacity = Math.max(200, Math.ceil((doughWeight * 1.15) / q) * q);
    if (prevCapacity && freeze) {
        capacity = prevCapacity;
    } else if (prevCapacity) {
        const fill = doughWeight / prevCapacity;
        if (fill <= 0.93 && fill >= 0.70) capacity = prevCapacity;
    }
    // Etched-scale steps: few enough labels to breathe, minors to read by
    const labelStep = [50, 100, 250, 500, 1000, 2500].find(s => capacity / s <= 6) || 5000;
    const minorStep = { 50: 25, 100: 25, 250: 50, 500: 100, 1000: 250, 2500: 500, 5000: 1000 }[labelStep];
    const heightPx = jarBottomY - jarTopY;
    const pxPerGram = heightPx / capacity;
    return {
        capacity,
        labelStep,
        minorStep,
        pxPerGram,
        gramsPerPx: capacity / heightPx,
        yOf: gramsFromBottom => jarBottomY - gramsFromBottom * pxPerGram,
        gramsAt: y => (jarBottomY - y) / pxPerGram,
    };
}

/* ------------------------------------------------------------------ */
/* Words & wisdom                                                       */
/* ------------------------------------------------------------------ */

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six',
    'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** Spell out small counts editorially ("two loaves"); fall back to digits. */
export function numberWord(n) {
    return WORDS[n] ?? String(n);
}

const CAPTION_BANDS = {
    hydration: [
        [62, 'tight and obedient - bagel country'],
        [68, 'sturdy, easy shaping, even crumb'],
        [74, 'the sweet spot: open but manageable'],
        [80, 'slack, open crumb; hard to shape - flour your hands'],
        [88, 'ciabatta territory; trust the scraper, not your palms'],
        [Infinity, 'basically batter. Brave. Use a pan.'],
    ],
    starter: [
        [8, 'a slow burn - an all-day (or overnight) bulk'],
        [15, 'relaxed pace, deeper flavor'],
        [25, 'the classic clip - bulk in an afternoon'],
        [35, 'fast mover; watch the dough, not the clock'],
        [Infinity, 'sprinting - don’t leave the house'],
    ],
    grain: [
        [1, 'all white: mild, tall, open'],
        [15, 'a whisper of wheat - the Tartine move'],
        [35, 'nutty and noticeably faster to ferment'],
        [Infinity, 'hearty, tighter crumb, drinks extra water'],
    ],
    salt: [
        [1.5, 'quiet - the flour does the talking'],
        [2.3, 'classic seasoning; steady fermentation'],
        [Infinity, 'assertive, and it slows the yeast down'],
    ],
};

/** Editorial one-liner for a value ("wisdom caption"). */
export function caption(kind, value) {
    const bands = CAPTION_BANDS[kind];
    if (!bands) return '';
    for (const [max, text] of bands) {
        if (value < max) return text;
    }
    return bands[bands.length - 1][1];
}

/** Caption for a batch, phrased around loaf count. */
export function batchCaption(numLoaves, perLoafG) {
    const size = perLoafG < 650 ? 'modest' : perLoafG < 1050 ? 'generous' : 'mighty';
    if (numLoaves === 1) return `one ${size} loaf`;
    if (numLoaves <= 3) return `${numberWord(numLoaves)} ${size} boules`;
    return 'a bakery morning';
}

/* ------------------------------------------------------------------ */
/* Focus scale + hydration zones (Dough Canvas v3)                     */
/* ------------------------------------------------------------------ */

/**
 * Broken-scale layout: the focused band gets exactly stagePx of height;
 * every other band shares the remaining space proportionally to grams.
 * items: [{ id, grams }] bottom -> top. Returns bands [{ id, y0, y1 }]
 * (y0 = bottom, y1 = top, SVG coords), plus the magnification factor of
 * the focused band vs its honest height.
 */
export function makeFocusScale(items, focusedId, { jarTopY = 90, jarBottomY = 560, stagePx = 180, headroomPx = 50 } = {}) {
    const total = items.reduce((s, i) => s + i.grams, 0);
    const usable = jarBottomY - jarTopY - headroomPx;
    const focused = items.find(i => i.id === focusedId);
    const restGrams = total - (focused?.grams || 0);
    const restPx = Math.max(0, usable - stagePx);
    const bands = [];
    let y = jarBottomY;
    for (const item of items) {
        const h = item.id === focusedId
            ? stagePx
            : (restGrams > 0 ? (item.grams / restGrams) * restPx : 0);
        bands.push({ id: item.id, y0: y, y1: y - h });
        y -= h;
    }
    const honestPx = focused && total > 0 ? (focused.grams / total) * usable : 0;
    const magnification = honestPx > 0 ? stagePx / honestPx : Infinity;
    return { bands, magnification, get: id => bands.find(b => b.id === id) };
}

/** Named hydration zones, for ruler etching and crossing flashes. */
export function hydrationZone(h) {
    if (h < 62) return 'bagel zone';
    if (h < 68) return 'sandwich zone';
    if (h < 78) return 'country zone';
    if (h < 88) return 'ciabatta zone';
    return 'batter zone';
}

/**
 * Magnetic snap: normal step snapping, but canonical values capture the
 * raw value from a wider radius so classic numbers take zero skill.
 */
export function magneticSnap(raw, step, canonicals = [], captureRadius = step * 3) {
    for (const c of canonicals) {
        if (Math.abs(raw - c) <= captureRadius) return c;
    }
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    return Number((Math.round(raw / step) * step).toFixed(decimals));
}
