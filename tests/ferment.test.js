import { test, eq, close, ok } from './assert.js';
import {
    tempFactor, inoculationFactor, wholeGrainFactor, bulkMinutes,
    buildSteps, totalMinutes, schedule, waterTempForDDT, T_REF, BASE_BULK_MIN,
} from '../js/ferment.js';
import { defaultState, derive } from '../js/model.js';

test('Q10: reference temp returns factor 1', () => {
    close(tempFactor(T_REF), 1, 1e-9, 'at 22°C');
});

test('Q10: spot values (32°C → ×0.4, 18°C → ×~1.44)', () => {
    close(tempFactor(32), 1 / 2.5, 1e-9, 'ten degrees warmer = 2.5x faster');
    close(tempFactor(18), Math.pow(2.5, 0.4), 1e-9, 'four degrees cooler');
});

test('Baseline bulk reproduces known-good 4h', () => {
    // The user's baseline: 22°C, 20% starter, 10% whole grain → exactly 4h
    close(bulkMinutes({ roomTemp: 22, starterPct: 20, wholeGrainPct: 10 }), BASE_BULK_MIN, 1e-9, 'baseline');
});

test('Bulk spot values at other temps', () => {
    close(bulkMinutes({ roomTemp: 32, starterPct: 20, wholeGrainPct: 10 }), BASE_BULK_MIN * 0.4, 0.01, '32°C');
    close(bulkMinutes({ roomTemp: 18, starterPct: 20, wholeGrainPct: 10 }), BASE_BULK_MIN * Math.pow(2.5, 0.4), 0.01, '18°C ≈ 5.8h');
});

test('Inoculation factor is monotonic decreasing', () => {
    ok(inoculationFactor(10) > inoculationFactor(20), 'less starter = slower');
    ok(inoculationFactor(20) > inoculationFactor(40), 'more starter = faster');
    close(inoculationFactor(20), 1, 1e-9, 'calibrated at 20%');
});

test('Whole grain factor is monotonic, clamped', () => {
    ok(wholeGrainFactor(0) > wholeGrainFactor(50), 'more WG = faster');
    close(wholeGrainFactor(0), 1, 1e-9, 'no WG');
    close(wholeGrainFactor(200), 0.6, 1e-9, 'clamped at 0.6');
});

test('buildSteps: fold window is carved out of bulk, not added to it', () => {
    const recipe = derive(defaultState());
    const env = { roomTemp: 22, retardHours: 12, starterFed: true };
    const steps = buildSteps(recipe, env);
    const mixIdx = steps.findIndex(s => s.id === 'mix');
    const bulkEndIdx = steps.findIndex(s => s.id === 'bulkEnd');
    const bulkSpan = steps.slice(mixIdx, bulkEndIdx).reduce((sum, s) => sum + s.minutes, 0);
    // Bulk starts when the starter goes in: mix(30) + fold waits must total
    // exactly the computed bulk time (240 at baseline), folds carved from it.
    close(bulkSpan, 240, 0.5, 'mix-to-bulk-end span equals bulk total');
});

test('buildSteps: unfed starter prepends a feed step', () => {
    const recipe = derive(defaultState());
    const fed = buildSteps(recipe, { roomTemp: 22, starterFed: true });
    const unfed = buildSteps(recipe, { roomTemp: 22, starterFed: false });
    eq(fed[0].id, 'autolyse', 'fed starts at autolyse');
    eq(unfed[0].id, 'feed', 'unfed starts with feed');
    close(totalMinutes(unfed) - totalMinutes(fed), 300, 0.01, 'feed adds ~5h at 22°C');
});

test('schedule forward: steps chain start→end with no gaps', () => {
    const recipe = derive(defaultState());
    const steps = buildSteps(recipe, { roomTemp: 22, retardHours: 12, starterFed: true });
    const anchor = new Date('2026-07-11T09:00:00');
    const sched = schedule(steps, { mode: 'start', anchorTime: anchor });
    eq(sched[0].start.getTime(), anchor.getTime(), 'starts at anchor');
    for (let i = 1; i < sched.length; i++) {
        eq(sched[i].start.getTime(), sched[i - 1].end.getTime(), `step ${i} starts when ${i - 1} ends`);
    }
});

test('schedule reverse: ends exactly at ready time, same span as forward', () => {
    const recipe = derive(defaultState());
    const steps = buildSteps(recipe, { roomTemp: 22, retardHours: 12, starterFed: true });
    const ready = new Date('2026-07-12T18:00:00');
    const sched = schedule(steps, { mode: 'ready', anchorTime: ready });
    const last = sched[sched.length - 1];
    eq(last.end.getTime(), ready.getTime(), 'last step ends at ready time');
    const span = (last.end - sched[0].start) / 60000;
    close(span, totalMinutes(steps), 1e-9, 'reverse span equals total minutes');
});

test('Water temp for DDT', () => {
    // DDT 25, flour 21, room 22, starter 24 → water = 100 - 67 = 33
    close(waterTempForDDT({ ddt: 25, flourTemp: 21, roomTemp: 22, starterTemp: 24 }), 33, 1e-9, 'four-factor formula');
});
