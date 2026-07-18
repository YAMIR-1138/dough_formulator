/**
 * model.js - the baker's math engine.
 *
 * Canonical state is flour-normalized baker's percentages with total flour
 * (grams) as the single scaling anchor. Every user edit maps to exactly one
 * closed-form pure function on this state - no lock matrix, no iteration,
 * no over-constraint. Grams shown in the UI are always derived.
 *
 * Conventions (documented in the UI):
 * - flourTotal INCLUDES the flour contributed by the starter.
 * - hydration % = total water / flourTotal, where total water includes
 *   starter water AND liquid add-ins. Because hydration is the stored
 *   quantity, changing the starter, its hydration, or a liquid add-in
 *   automatically rebalances the added water to preserve true hydration
 *   (the "hydration lock").
 * - salt % is of TOTAL flour, including starter flour (standard bakers' math).
 * - starter.pct = starter MASS as % of flourTotal.
 * - add-in pct = % of flourTotal. Liquid add-ins count fully as water.
 * - Flour blend percentages apply to flourTotal; the starter's flour is
 *   assumed to be the first blend component (typically bread flour) when
 *   computing the "flour to add" breakdown.
 */

export const FLOUR_TYPES = {
    bread: { label: 'Bread Flour', wholeGrain: false },
    allPurpose: { label: 'All Purpose', wholeGrain: false },
    wholeWheat: { label: 'Whole Wheat', wholeGrain: true },
    rye: { label: 'Rye', wholeGrain: true },
    spelt: { label: 'Spelt', wholeGrain: true },
    semolina: { label: 'Semolina', wholeGrain: false },
};

export const LIMITS = {
    flourTotal: { min: 100, max: 20000 },
    hydration: { min: 40, max: 120 },
    saltPct: { min: 0, max: 5 },
    starterPct: { min: 1, max: 100 },
    starterHydration: { min: 30, max: 200 },
    doughWeight: { min: 200, max: 50000 },
    prefermentedFlour: { min: 0.5, max: 60 },
    addInPct: { min: 0, max: 100 },
    numLoaves: { min: 1, max: 40 },
    bakeLossPct: { min: 0, max: 30 },
    reservedWaterPct: { min: 0, max: 50 },
};

/** The user's default formula: Tartine country loaf. */
export function defaultState() {
    return {
        v: 1,
        flourTotal: 1000,
        hydration: 75,
        saltPct: 2,
        starter: { pct: 20, hydration: 100 },
        flours: [
            { key: 'bread', pct: 90 },
            { key: 'wholeWheat', pct: 10 },
        ],
        addIns: [],                    // { name, pct, liquid }
        numLoaves: 1,
        bakeLossPct: 12,               // typical crust-bake evaporation
        reservedWaterPct: 0,           // held back for bassinage
        pinFlour: false,
    };
}

const clampTo = (x, { min, max }) => Math.min(max, Math.max(min, x));

/** Sum of non-liquid add-in percentages (they add mass beyond flour+water+salt). */
function solidAddInPct(state) {
    return state.addIns.reduce((sum, a) => sum + (a.liquid ? 0 : a.pct), 0);
}

/** doughWeight / flourTotal - the closed-form scaling factor. */
function doughFactor(state) {
    return 1 + state.hydration / 100 + state.saltPct / 100 + solidAddInPct(state) / 100;
}

/**
 * Derive every displayable quantity from the canonical state.
 * All values are exact floats - rounding is format.js's job.
 */
export function derive(state) {
    const { flourTotal, hydration, saltPct, starter } = state;

    const starterMass = flourTotal * starter.pct / 100;
    const starterFlour = starterMass / (1 + starter.hydration / 100);
    const starterWater = starterMass - starterFlour;

    const totalWater = flourTotal * hydration / 100;
    const salt = flourTotal * saltPct / 100;

    const addIns = state.addIns.map(a => ({ ...a, grams: flourTotal * a.pct / 100 }));
    const liquidAddInWater = addIns.reduce((sum, a) => sum + (a.liquid ? a.grams : 0), 0);
    const solidAddInMass = addIns.reduce((sum, a) => sum + (a.liquid ? 0 : a.grams), 0);

    const flourToAdd = flourTotal - starterFlour;
    // Liquid add-ins count as water, so plain water shrinks to compensate -
    // true hydration holds without the user doing anything.
    const waterToAdd = Math.max(0, totalWater - starterWater - liquidAddInWater);
    const reservedWater = waterToAdd * (state.reservedWaterPct / 100);
    const mixingWater = waterToAdd - reservedWater;

    // Starter and liquid add-ins are already inside flourTotal/totalWater,
    // so they cancel out; only solid add-ins add mass on top.
    const doughWeight = flourTotal * doughFactor(state);

    const weightPerLoaf = doughWeight / state.numLoaves;
    const bakedWeightPerLoaf = weightPerLoaf * (1 - state.bakeLossPct / 100);

    const prefermentedFlourPct = (starterFlour / flourTotal) * 100;

    const flourBreakdown = state.flours.map((f, i) => {
        const total = flourTotal * f.pct / 100;
        const added = i === 0 ? Math.max(0, total - starterFlour) : total;
        return { key: f.key, pct: f.pct, total, added };
    });

    const wholeGrainPct = state.flours.reduce(
        (sum, f) => sum + (FLOUR_TYPES[f.key]?.wholeGrain ? f.pct : 0), 0);

    return {
        flourTotal,
        hydration,
        saltPct,
        starterPct: starter.pct,
        starterHydration: starter.hydration,
        starterMass,
        starterFlour,
        starterWater,
        totalWater,
        salt,
        addIns,
        liquidAddInWater,
        solidAddInMass,
        flourToAdd,
        waterToAdd,
        mixingWater,
        reservedWater,
        reservedWaterPct: state.reservedWaterPct,
        doughWeight,
        numLoaves: state.numLoaves,
        bakeLossPct: state.bakeLossPct,
        weightPerLoaf,
        bakedWeightPerLoaf,
        prefermentedFlourPct,
        flourBreakdown,
        wholeGrainPct,
    };
}

/* ------------------------------------------------------------------ */
/* Pure edit functions - each returns a NEW state.                     */
/* ------------------------------------------------------------------ */

export function setHydration(state, pct) {
    return { ...state, hydration: clampTo(pct, LIMITS.hydration) };
}

export function setSalt(state, pct) {
    return { ...state, saltPct: clampTo(pct, LIMITS.saltPct) };
}

export function setStarterPercent(state, pct) {
    return {
        ...state,
        starter: { ...state.starter, pct: clampTo(pct, LIMITS.starterPct) },
    };
}

/** Grams is just an entry mode for starter - it converts to a percentage. */
export function setStarterGrams(state, grams) {
    return setStarterPercent(state, (grams / state.flourTotal) * 100);
}

export function setStarterHydration(state, pct) {
    return {
        ...state,
        starter: { ...state.starter, hydration: clampTo(pct, LIMITS.starterHydration) },
    };
}

/**
 * Set the prefermented flour % directly; starter mass follows.
 * PFF = starterFlour/flourTotal, so starter.pct = PFF * (1 + hyd/100).
 */
export function setPrefermentedFlour(state, pff) {
    const clamped = clampTo(pff, LIMITS.prefermentedFlour);
    return setStarterPercent(state, clamped * (1 + state.starter.hydration / 100));
}

/** Changing total flour is a pure scale: every gram scales, no % changes. */
export function setFlourTotal(state, grams) {
    return { ...state, flourTotal: clampTo(grams, LIMITS.flourTotal) };
}

/**
 * Hit a target dough weight.
 * Default: rescale the whole recipe (all percentages preserved).
 * With pinFlour: keep flour fixed and back-solve hydration instead.
 */
export function scaleToDoughWeight(state, grams) {
    const target = clampTo(grams, LIMITS.doughWeight);
    if (state.pinFlour) {
        const nonWaterFactor = 1 + state.saltPct / 100 + solidAddInPct(state) / 100;
        const hydration = (target / state.flourTotal - nonWaterFactor) * 100;
        return { ...state, hydration: clampTo(hydration, LIMITS.hydration) };
    }
    return { ...state, flourTotal: clampTo(target / doughFactor(state), LIMITS.flourTotal) };
}

/** Scale so each of numLoaves weighs `grams` before baking. */
export function setLoafWeight(state, grams) {
    return scaleToDoughWeight(state, grams * state.numLoaves);
}

/** Change loaf count, keeping the per-loaf weight (total rescales). */
export function setNumLoaves(state, n, { keepPerLoaf = true } = {}) {
    const loaves = Math.round(clampTo(n, LIMITS.numLoaves));
    if (!keepPerLoaf) return { ...state, numLoaves: loaves };
    const perLoaf = derive(state).weightPerLoaf;
    return scaleToDoughWeight({ ...state, numLoaves: loaves }, perLoaf * loaves);
}

export function setBakeLoss(state, pct) {
    return { ...state, bakeLossPct: clampTo(pct, LIMITS.bakeLossPct) };
}

export function setReservedWater(state, pct) {
    return { ...state, reservedWaterPct: clampTo(pct, LIMITS.reservedWaterPct) };
}

export function setPinFlour(state, pinned) {
    return { ...state, pinFlour: !!pinned };
}

/* ---------- add-ins ---------- */

export function setAddIns(state, addIns) {
    return {
        ...state,
        addIns: addIns
            .filter(a => a && typeof a.name === 'string')
            .map(a => ({
                name: a.name.slice(0, 40),
                pct: clampTo(Number(a.pct) || 0, LIMITS.addInPct),
                liquid: !!a.liquid,
            })),
    };
}

/** Grams entry mode for an add-in - converts to % of flour. */
export function addInGramsToPct(state, grams) {
    return (grams / state.flourTotal) * 100;
}

/* ---------- flour blend ---------- */

/** Normalize blend percentages to sum to exactly 100. */
export function normalizeFlours(flours) {
    const positive = flours.filter(f => f.pct > 0);
    const list = positive.length ? positive : [{ key: 'bread', pct: 100 }];
    const total = list.reduce((sum, f) => sum + f.pct, 0);
    return list.map(f => ({ key: f.key, pct: (f.pct / total) * 100 }));
}

export function setFlourBlend(state, flours) {
    return { ...state, flours: normalizeFlours(flours) };
}

/* ------------------------------------------------------------------ */
/* Validation / hydration of untrusted state (URL hash, imports).      */
/* ------------------------------------------------------------------ */

/**
 * Coerce an untrusted object into a valid State, falling back to defaults
 * per-field. Returns null only if the input isn't an object at all.
 */
export function sanitizeState(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const d = defaultState();
    const num = (x, fallback, limits) =>
        Number.isFinite(x) ? (limits ? clampTo(x, limits) : x) : fallback;

    const flours = Array.isArray(raw.flours)
        ? raw.flours
            .filter(f => f && typeof f.key === 'string' && FLOUR_TYPES[f.key] && Number.isFinite(f.pct) && f.pct > 0)
            .map(f => ({ key: f.key, pct: f.pct }))
        : [];

    const addIns = Array.isArray(raw.addIns)
        ? raw.addIns
            .filter(a => a && typeof a.name === 'string' && Number.isFinite(a.pct))
            .slice(0, 12)
            .map(a => ({ name: a.name.slice(0, 40), pct: clampTo(a.pct, LIMITS.addInPct), liquid: !!a.liquid }))
        : [];

    return {
        v: 1,
        flourTotal: num(raw.flourTotal, d.flourTotal, LIMITS.flourTotal),
        hydration: num(raw.hydration, d.hydration, LIMITS.hydration),
        saltPct: num(raw.saltPct, d.saltPct, LIMITS.saltPct),
        starter: {
            pct: num(raw.starter?.pct, d.starter.pct, LIMITS.starterPct),
            hydration: num(raw.starter?.hydration, d.starter.hydration, LIMITS.starterHydration),
        },
        flours: flours.length ? normalizeFlours(flours) : d.flours,
        addIns,
        numLoaves: Math.round(num(raw.numLoaves, d.numLoaves, LIMITS.numLoaves)),
        bakeLossPct: num(raw.bakeLossPct, d.bakeLossPct, LIMITS.bakeLossPct),
        reservedWaterPct: num(raw.reservedWaterPct, d.reservedWaterPct, LIMITS.reservedWaterPct),
        pinFlour: !!raw.pinFlour,
    };
}
