/**
 * ferment.js — fermentation model and bake scheduler.
 * Pure module: no DOM, no Date.now() — callers supply anchor times.
 *
 * Temperature model: Q10. Biological reaction rates roughly multiply by Q10
 * for every +10°C, so duration(T) = base * Q10^((T_ref − T)/10). This replaces
 * the old linear 5%/°C adjustment, which fell apart more than a few degrees
 * from the baseline.
 */
import { clamp } from './format.js';

export const Q10 = 2.5;
export const T_REF = 22;             // °C — calibration baseline
export const BASE_BULK_MIN = 240;    // 4h bulk at 22°C, 20% starter, ~10% WG
const REF_STARTER_PCT = 20;

/** Multiplier on fermentation duration for a given room temperature (°C). */
export function tempFactor(tempC) {
    return Math.pow(Q10, (T_REF - tempC) / 10);
}

/** More starter = faster. Calibrated so 20% starter = 1.0. */
export function inoculationFactor(starterPct) {
    const pct = Math.max(1, starterPct);
    return Math.pow(REF_STARTER_PCT / pct, 0.4);
}

/** Whole grains ferment faster; effect capped at -40%. */
export function wholeGrainFactor(wholeGrainPct) {
    return clamp(1 - 0.004 * wholeGrainPct, 0.6, 1);
}

/** Bulk fermentation duration in minutes. */
export function bulkMinutes({ roomTemp, starterPct, wholeGrainPct }) {
    return BASE_BULK_MIN
        * tempFactor(roomTemp)
        * inoculationFactor(starterPct)
        * wholeGrainFactor(wholeGrainPct)
        / wholeGrainNormalizer;
}

// The user's known-good baseline is 4h bulk at 22°C / 20% starter / 10% whole
// grain — normalize so that exact combination returns BASE_BULK_MIN.
const wholeGrainNormalizer = wholeGrainFactor(10);

/** Starter feed → peak time in minutes at a given room temp (~5h at 22°C). */
export function starterFeedMinutes(roomTemp) {
    return 300 * tempFactor(roomTemp);
}

/**
 * Build the step list for a bake.
 * recipe: output of model.derive(); env: { roomTemp (°C), retardHours,
 * starterFed (bool), folds (default 4) }.
 * Each step: { id, label, description, minutes } where minutes is the time
 * until the NEXT step begins.
 */
export function buildSteps(recipe, env) {
    const roomTemp = env.roomTemp ?? T_REF;
    const retardHours = env.retardHours ?? 12;
    const folds = env.folds ?? 4;
    const g = x => Math.round(x);

    const steps = [];

    if (!env.starterFed) {
        steps.push({
            id: 'feed',
            label: 'Feed Starter',
            description: `Feed your starter and let it peak (roughly ${Math.round(starterFeedMinutes(roomTemp) / 60 * 10) / 10}h at ${roomTemp}°C).`,
            minutes: starterFeedMinutes(roomTemp),
        });
    }

    steps.push({
        id: 'autolyse',
        label: 'Autolyse',
        description: `Mix ${g(recipe.flourToAdd)}g flour with ${g(recipe.waterToAdd)}g water until no dry spots remain. Cover and rest.`,
        minutes: 45,
    });

    steps.push({
        id: 'mix',
        label: 'Mix Starter & Salt',
        description: `Add ${g(recipe.starterMass)}g starter and ${Math.round(recipe.salt * 10) / 10}g salt. Squeeze and fold until fully incorporated.`,
        minutes: 30,
    });

    const bulk = bulkMinutes({
        roomTemp,
        starterPct: recipe.starterPct,
        wholeGrainPct: recipe.wholeGrainPct,
    });
    const foldWindow = 30 * folds;

    for (let i = 1; i <= folds; i++) {
        const last = i === folds;
        steps.push({
            id: `fold${i}`,
            label: `Stretch & Fold #${i}`,
            description: last
                ? 'Final set of stretch and folds. Then leave the dough alone for the rest of bulk.'
                : 'Stretch and fold all four sides to build strength.',
            // After the last fold, the remainder of bulk runs uninterrupted.
            minutes: last ? Math.max(30, bulk - foldWindow) : 30,
        });
    }

    steps.push({
        id: 'bulkEnd',
        label: 'End Bulk Fermentation',
        description: `Bulk total ≈ ${Math.round(bulk / 6) / 10}h at ${roomTemp}°C. Dough should be up ~30–50%, airy, with a domed edge. Turn out gently.`,
        minutes: 5,
    });

    steps.push({
        id: 'preshape',
        label: 'Pre-shape & Bench Rest',
        description: 'Pre-shape into a loose round; rest uncovered until relaxed.',
        minutes: 20,
    });

    steps.push({
        id: 'shape',
        label: 'Final Shape',
        description: 'Shape and place seam-side up in a floured banneton.',
        minutes: 10,
    });

    steps.push({
        id: 'retard',
        label: 'Cold Retard',
        description: `Refrigerate ${retardHours}h (covered). Flavor deepens and scoring gets easier.`,
        minutes: retardHours * 60,
    });

    steps.push({
        id: 'preheat',
        label: 'Preheat Oven',
        description: 'Preheat Dutch oven to 260°C / 500°F.',
        minutes: 45,
    });

    steps.push({
        id: 'bake',
        label: 'Bake',
        description: 'Score. Bake covered 20 min at 260°C, then uncovered 20–25 min at 230°C / 450°F until deep brown.',
        minutes: 42,
    });

    steps.push({
        id: 'cool',
        label: 'Cool',
        description: 'Cool on a rack at least 1 hour — the crumb is still setting.',
        minutes: 60,
    });

    steps.push({
        id: 'enjoy',
        label: 'Enjoy!',
        description: 'Slice it. You earned this.',
        minutes: 0,
    });

    return steps;
}

/** Total span of a step list in minutes. */
export function totalMinutes(steps) {
    return steps.reduce((sum, s) => sum + s.minutes, 0);
}

/**
 * Lay steps onto the clock.
 * mode 'start': anchorTime is when you begin.
 * mode 'ready': anchorTime is when you want to eat; start is back-computed.
 * Returns steps with start/end Date fields.
 */
export function schedule(steps, { mode, anchorTime }) {
    const total = totalMinutes(steps);
    let t = mode === 'ready'
        ? new Date(anchorTime.getTime() - total * 60000)
        : new Date(anchorTime);

    return steps.map(step => {
        const start = new Date(t);
        const end = new Date(t.getTime() + step.minutes * 60000);
        t = end;
        return { ...step, start, end };
    });
}

/**
 * Desired dough temperature → required water temperature (°C).
 * Four factors for hand-mixed sourdough: flour, room, starter, water.
 */
export function waterTempForDDT({ ddt, flourTemp, roomTemp, starterTemp, frictionFactor = 0 }) {
    return 4 * ddt - (flourTemp + roomTemp + starterTemp + frictionFactor);
}
