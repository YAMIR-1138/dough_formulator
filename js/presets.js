/**
 * presets.js - built-in classic formulas. Pure data: each preset is a
 * canonical model State (flourTotal 1000 so the ratios read cleanly) plus
 * a note. Users rescale via dough weight or flour.
 */

export const PRESETS = [
    {
        id: 'tartine',
        name: 'Tartine Country',
        note: 'The classic. Mostly white, a touch of whole wheat, 75% hydration.',
        state: {
            v: 1, flourTotal: 1000, hydration: 75, saltPct: 2,
            starter: { pct: 20, hydration: 100 },
            flours: [{ key: 'bread', pct: 90 }, { key: 'wholeWheat', pct: 10 }],
            pinFlour: false,
        },
    },
    {
        id: 'fiftyWW',
        name: '50% Whole Wheat',
        note: 'Heartier loaf; extra hydration feeds the bran. Ferments faster.',
        state: {
            v: 1, flourTotal: 1000, hydration: 80, saltPct: 2.2,
            starter: { pct: 20, hydration: 100 },
            flours: [{ key: 'bread', pct: 50 }, { key: 'wholeWheat', pct: 50 }],
            pinFlour: false,
        },
    },
    {
        id: 'pizza',
        name: 'Sourdough Pizza',
        note: 'Neapolitan-leaning: lower hydration, saltier, light inoculation for a long cold proof.',
        state: {
            v: 1, flourTotal: 1000, hydration: 65, saltPct: 2.8,
            starter: { pct: 12, hydration: 100 },
            flours: [{ key: 'bread', pct: 100 }],
            pinFlour: false,
        },
    },
    {
        id: 'focaccia',
        name: 'Focaccia',
        note: 'Wet and easy-going. Fold in the pan, drown in olive oil before baking.',
        state: {
            v: 1, flourTotal: 1000, hydration: 82, saltPct: 2.5,
            starter: { pct: 20, hydration: 100 },
            flours: [{ key: 'bread', pct: 100 }],
            pinFlour: false,
        },
    },
    {
        id: 'baguette',
        name: 'Sourdough Baguette',
        note: 'Moderate hydration for open crumb you can still shape into a stick.',
        state: {
            v: 1, flourTotal: 1000, hydration: 72, saltPct: 2,
            starter: { pct: 15, hydration: 100 },
            flours: [{ key: 'bread', pct: 100 }],
            pinFlour: false,
        },
    },
    {
        id: 'rye40',
        name: '40% Rye',
        note: 'Sticky, fragrant, ferments fast - watch the bulk, not the clock.',
        state: {
            v: 1, flourTotal: 1000, hydration: 85, saltPct: 2,
            starter: { pct: 25, hydration: 100 },
            flours: [{ key: 'bread', pct: 60 }, { key: 'rye', pct: 40 }],
            pinFlour: false,
        },
    },
];

export function getPreset(id) {
    return PRESETS.find(p => p.id === id) || null;
}
