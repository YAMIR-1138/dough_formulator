/**
 * lab-geometry.js — pure math and text helpers for THE LAB.
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

/**
 * Map grams ↔ jar pixels. jarTopY/jarBottomY define the interior in SVG
 * units. Capacity leaves headroom above the dough.
 */
export function makeJarScale(doughWeight, { jarTopY = 60, jarBottomY = 560, prevCapacity = null, freeze = false } = {}) {
    let capacity = niceCeil(Math.max(doughWeight * 1.3, 1200));
    // Hysteresis: keep the previous capacity while the fill stays sane, so
    // dragging doesn't rescale the ruler under the pointer. With freeze,
    // the previous capacity holds unconditionally (used during a live drag).
    if (prevCapacity && freeze) {
        capacity = prevCapacity;
    } else if (prevCapacity) {
        const fill = doughWeight / prevCapacity;
        if (fill <= 0.92 && fill >= 0.30) capacity = prevCapacity;
    }
    const heightPx = jarBottomY - jarTopY;
    const pxPerGram = heightPx / capacity;
    return {
        capacity,
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
        [62, 'tight and obedient — bagel country'],
        [68, 'sturdy, easy shaping, even crumb'],
        [74, 'the sweet spot: open but manageable'],
        [80, 'slack, open crumb; hard to shape — flour your hands'],
        [88, 'ciabatta territory; trust the scraper, not your palms'],
        [Infinity, 'basically batter. Brave. Use a pan.'],
    ],
    starter: [
        [8, 'a slow burn — an all-day (or overnight) bulk'],
        [15, 'relaxed pace, deeper flavor'],
        [25, 'the classic clip — bulk in an afternoon'],
        [35, 'fast mover; watch the dough, not the clock'],
        [Infinity, 'sprinting — don’t leave the house'],
    ],
    grain: [
        [1, 'all white: mild, tall, open'],
        [15, 'a whisper of wheat — the Tartine move'],
        [35, 'nutty and noticeably faster to ferment'],
        [Infinity, 'hearty, tighter crumb, drinks extra water'],
    ],
    salt: [
        [1.5, 'quiet — the flour does the talking'],
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
