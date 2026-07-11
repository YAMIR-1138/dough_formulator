import { test, eq, close, ok } from './assert.js';
import {
    DIAL, angleOf, valueOf, pointerAngle, angleDelta, arcPath,
    makeTimeScale, shadingBands, dayBoundaries,
    niceCeil, makeJarScale, numberWord, caption, batchCaption,
    makeFocusScale, hydrationZone, magneticSnap,
} from '../lab/lab-geometry.js';
import { defaultState, derive } from '../js/model.js';
import { buildSteps, schedule } from '../js/ferment.js';

test('Dial: angle/value round-trip with snapping and clamping', () => {
    close(angleOf(55, 100, 55), DIAL.start, 1e-9, 'min at sweep start');
    close(angleOf(55, 100, 100), DIAL.start + DIAL.sweep, 1e-9, 'max at sweep end');
    for (const v of [55, 62.5, 75, 88, 100]) {
        close(valueOf(55, 100, 0.5, angleOf(55, 100, v)), v, 1e-9, `round-trip ${v}`);
    }
    eq(valueOf(55, 100, 0.5, DIAL.start - 40), 55, 'clamped below');
    eq(valueOf(55, 100, 0.5, DIAL.start + DIAL.sweep + 40), 100, 'clamped above');
    eq(valueOf(0, 100, 5, angleOf(0, 100, 52.4)), 50, 'snaps to step');
});

test('Dial: pointer angle and deltas', () => {
    close(pointerAngle(150, 150, 150, 50), 0, 1e-9, 'straight up = 0');
    close(pointerAngle(150, 150, 250, 150), 90, 1e-9, 'right = 90');
    close(pointerAngle(150, 150, 150, 250), 180, 1e-9, 'down = 180');
    close(angleDelta(170, -170), 20, 1e-9, 'wraps positive');
    close(angleDelta(-170, 170), -20, 1e-9, 'wraps negative');
    ok(arcPath(150, 150, 100, -135, 135).startsWith('M '), 'arc path format');
});

test('Time scale: monotonic, compresses long steps to capPx', () => {
    const recipe = derive(defaultState());
    const steps = buildSteps(recipe, { roomTemp: 22, retardHours: 12, starterFed: false });
    const sched = schedule(steps, { mode: 'start', anchorTime: new Date('2026-07-11T09:00:00') });
    const scale = makeTimeScale(sched, { pxPerMin: 1.1, capMin: 150, capPx: 110 });

    // Monotonic over the whole span at 10-minute samples
    let prev = -Infinity;
    const t0 = sched[0].start.getTime();
    const t1 = sched[sched.length - 1].end.getTime();
    for (let t = t0; t <= t1; t += 600000) {
        const x = scale.x(new Date(t));
        ok(x >= prev, `monotonic at ${new Date(t).toISOString()}`);
        prev = x;
    }

    // Both long steps (feed ~5h, retard 12h) compressed to exactly 110px
    const compressed = scale.segments.filter(s => s.compressed);
    ok(compressed.length >= 2, 'feed and retard compressed');
    for (const seg of compressed) {
        close(seg.x1 - seg.x0, 110, 1e-9, `compressed ${seg.id}`);
    }

    // Segment boundaries map exactly
    for (const seg of scale.segments) {
        close(scale.x(new Date(seg.t0)), seg.x0, 1e-6, `${seg.id} start x`);
        close(scale.x(new Date(seg.t1)), seg.x1, 1e-6, `${seg.id} end x`);
    }

    // Uncompressed steps at base rate: 30-min fold = 33px
    const fold = scale.segments.find(s => s.id === 'fold1');
    close(fold.x1 - fold.x0, 33, 1e-6, 'fold width at base rate');
});

test('Time scale: shading bands and day boundaries stay in order', () => {
    const recipe = derive(defaultState());
    const steps = buildSteps(recipe, { roomTemp: 22, retardHours: 12, starterFed: true });
    const sched = schedule(steps, { mode: 'start', anchorTime: new Date('2026-07-11T18:00:00') });
    const scale = makeTimeScale(sched);
    const start = sched[0].start, end = sched[sched.length - 1].end;
    const bands = shadingBands(scale, start, end);
    ok(bands.length >= 2, 'crosses at least one day/night edge');
    for (let i = 0; i < bands.length; i++) {
        ok(bands[i].x1 >= bands[i].x0, `band ${i} ordered`);
        if (i) close(bands[i].x0, bands[i - 1].x1, 1e-6, `band ${i} contiguous`);
    }
    const days = dayBoundaries(scale, start, end);
    ok(days.length >= 1, 'spans midnight');
    ok(days[0].date.getHours() === 0, 'boundary at midnight');
});

test('Jar scale: round-trip and capacity hysteresis', () => {
    const s1 = makeJarScale(1770);
    close(s1.gramsAt(s1.yOf(1000)), 1000, 1e-6, 'px↔gram round-trip');
    close(s1.yOf(0), 560, 1e-9, 'zero at jar bottom');
    ok(s1.capacity >= 1770 * 1.3, 'headroom above dough');

    // Small change keeps the ruler stable
    const s2 = makeJarScale(1900, { prevCapacity: s1.capacity });
    eq(s2.capacity, s1.capacity, 'hysteresis holds on small change');
    // Big change rescales
    const s3 = makeJarScale(6000, { prevCapacity: s1.capacity });
    ok(s3.capacity > s1.capacity, 'rescales when overflowing');
    const s4 = makeJarScale(300, { prevCapacity: s1.capacity });
    ok(s4.capacity < s1.capacity, 'rescales when nearly empty');
});

test('niceCeil produces friendly numbers', () => {
    eq(niceCeil(2301), 2500, '2301 → 2500');
    eq(niceCeil(1201), 1500, '1201 → 1500');
    eq(niceCeil(999), 1000, '999 → 1000');
});

test('numberWord and captions', () => {
    eq(numberWord(1), 'one', 'one');
    eq(numberWord(2), 'two', 'two');
    eq(numberWord(40), '40', 'falls back to digits');
    eq(caption('hydration', 75), 'slack, open crumb; hard to shape - flour your hands', 'hydration band');
    eq(caption('hydration', 73.9), 'the sweet spot: open but manageable', 'band edge below');
    eq(caption('hydration', 74), 'slack, open crumb; hard to shape - flour your hands', 'band edge at');
    eq(caption('starter', 20), 'the classic clip - bulk in an afternoon', 'starter band');
    eq(caption('grain', 0), 'all white: mild, tall, open', 'grain zero');
    ok(batchCaption(2, 885).includes('two'), 'batch caption words the count');
});

test('Focus scale: stage gets stagePx, rest proportional, monotonic', () => {
    const items = [
        { id: 'water', grams: 650 }, { id: 'starter', grams: 200 },
        { id: 'salt', grams: 20 }, { id: 'bread', grams: 800 }, { id: 'ww', grams: 100 },
    ];
    const fs = makeFocusScale(items, 'salt', { jarTopY: 90, jarBottomY: 560, stagePx: 180, headroomPx: 50 });
    const salt = fs.get('salt');
    close(salt.y0 - salt.y1, 180, 1e-9, 'focused band = stagePx');
    const totalPx = fs.bands.reduce((s, b) => s + (b.y0 - b.y1), 0);
    close(totalPx, 560 - 90 - 50, 1e-6, 'bands fill usable height');
    for (let i = 1; i < fs.bands.length; i++) {
        close(fs.bands[i].y0, fs.bands[i - 1].y1, 1e-9, `band ${i} stacks on band ${i - 1}`);
    }
    ok(fs.magnification > 20, `salt magnified (x${fs.magnification.toFixed(0)})`);
    // Unfocused bands keep their ratio: bread/water = 800/650
    const bread = fs.get('bread'), water = fs.get('water');
    close((bread.y0 - bread.y1) / (water.y0 - water.y1), 800 / 650, 1e-6, 'rest proportional');
});

test('Hydration zones and magnetic snap', () => {
    eq(hydrationZone(60), 'bagel zone', 'bagel');
    eq(hydrationZone(75), 'country zone', 'country');
    eq(hydrationZone(85), 'ciabatta zone', 'ciabatta');
    close(magneticSnap(74.3, 0.5, [75]), 75, 1e-9, 'canonical captures from wide radius');
    close(magneticSnap(72.8, 0.5, [75]), 73, 1e-9, 'outside radius snaps to step');
    close(magneticSnap(1.94, 0.1, [2]), 2, 1e-9, 'salt canonical');
    close(magneticSnap(1.62, 0.1, [2]), 1.6, 1e-9, 'salt plain snap');
});
