/**
 * DOUGH_FORMULATOR - Calculator
 *
 * Conventions (the way home-baking recipes are usually written):
 *   - `flour`   is the flour you weigh out and add. It does NOT include starter flour.
 *   - `starter` is grams of starter at `starterHydration`.
 *   - Hydration and salt % are computed on TRUE total flour (added flour + starter
 *     flour), so the hydration you set is the real hydration of the dough.
 *
 * Example: 700g flour, 75% hydration, 150g starter @ 100%, 2.5% salt
 *   starter flour 75g, starter water 75g  ->  total flour 775g
 *   total water 581.25g                   ->  water to add 506g
 *   salt 19.4g                            ->  total dough 1375g
 */
(function (root) {
    'use strict';

    const DEFAULTS = Object.freeze({
        flour: 700,
        hydration: 75,
        starter: 150,
        starterHydration: 100,
        saltPct: 2,
        useTwoFlours: false,
        mainFlourPct: 80,
        numLoaves: 2,
        keepLoafWeight: false,
        bakeTemp1: 230,
        bakeTime1: 20,
        bakeTemp2: 220,
        bakeTime2: 25,
        tempUnit: 'C'
    });

    // Hard limits for typed values (sliders use a narrower, friendlier range)
    const LIMITS = {
        flour: [10, 50000],
        hydration: [20, 250],
        starter: [0, 50000],
        starterHydration: [20, 400],
        saltPct: [0, 10],
        mainFlourPct: [0, 100],
        numLoaves: [1, 200],
        bakeTime1: [0, 600],
        bakeTime2: [0, 600]
    };

    const TEMP_LIMITS = { F: [150, 600], C: [60, 320] };

    // Decimal places each input is stored with
    const DECIMALS = {
        flour: 0, hydration: 1, starter: 0, starterHydration: 0, saltPct: 1,
        mainFlourPct: 0, numLoaves: 0, bakeTemp1: 0, bakeTime1: 0, bakeTemp2: 0, bakeTime2: 0
    };

    function round(value, decimals = 0) {
        const f = Math.pow(10, decimals);
        return Math.round(value * f) / f;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    class DoughCalculator {
        constructor() {
            this.state = { ...DEFAULTS };
            this.results = {};
            this.calculate();
        }

        /** Compute every derived value from the current state. */
        calculate() {
            const s = this.state;

            const starterFlour = s.starter / (1 + s.starterHydration / 100);
            const starterWater = s.starter - starterFlour;
            const totalFlour = s.flour + starterFlour;
            const totalWater = totalFlour * (s.hydration / 100);
            const waterToAdd = totalWater - starterWater;
            const salt = totalFlour * (s.saltPct / 100);

            const r = {
                flour: round(s.flour),
                water: round(waterToAdd),
                starter: round(s.starter),
                salt: round(salt, 1),
                starterFlour: round(starterFlour),
                starterWater: round(starterWater),
                totalFlour: round(totalFlour),
                totalWater: round(totalWater),
                // The starter alone brings more water than the target hydration allows
                starterTooWet: waterToAdd < 0
            };

            // Total is built from the displayed amounts so the ingredient list adds up on screen
            r.totalDough = round(r.flour + r.water + r.starter + r.salt);
            r.loafWeight = round(r.totalDough / s.numLoaves);

            r.starterPctOfFlour = s.flour > 0 ? round((s.starter / s.flour) * 100, 1) : 0;
            r.starterPctOfDough = r.totalDough > 0 ? round((s.starter / r.totalDough) * 100, 1) : 0;

            if (s.useTwoFlours) {
                r.mainFlour = round(s.flour * (s.mainFlourPct / 100));
                r.secondFlour = r.flour - r.mainFlour;
            } else {
                r.mainFlour = r.flour;
                r.secondFlour = 0;
            }

            this.results = r;
            return r;
        }

        /** Allowed range for a key (temperature limits depend on the unit). */
        limits(key) {
            if (key === 'bakeTemp1' || key === 'bakeTemp2') return TEMP_LIMITS[this.state.tempUnit];
            return LIMITS[key] || [-Infinity, Infinity];
        }

        /** Set one input. Values are validated, clamped and rounded; junk is ignored. */
        set(key, value) {
            if (!(key in DEFAULTS)) return this.results;

            if (key === 'tempUnit') {
                if (value === 'F' || value === 'C') this.state.tempUnit = value;
            } else if (typeof DEFAULTS[key] === 'boolean') {
                this.state[key] = Boolean(value);
            } else {
                const isNumberLike = typeof value === 'number' ||
                    (typeof value === 'string' && value.trim() !== '');
                const n = isNumberLike ? Number(value) : NaN;
                if (!Number.isFinite(n)) return this.results;
                const [min, max] = this.limits(key);
                this.state[key] = round(clamp(n, min, max), DECIMALS[key] || 0);
            }
            return this.calculate();
        }

        /**
         * Scale the recipe (flour and starter together, so every ratio is preserved)
         * to hit a target total dough weight. Lands within 1g of the target.
         */
        setTotalDough(target) {
            target = Number(target);
            if (!Number.isFinite(target) || target <= 0 || this.results.totalDough <= 0) return this.results;

            const ratio = target / this.results.totalDough;
            this.set('flour', this.state.flour * ratio);
            this.set('starter', this.state.starter * ratio);

            // Rounding to whole grams can leave us a gram or two off; nudge flour to close the gap.
            // Each gram of flour adds (1 + hydration + salt) grams of dough.
            for (let i = 0; i < 3; i++) {
                const diff = target - this.results.totalDough;
                if (Math.abs(diff) <= 1) break;
                const perGram = 1 + this.state.hydration / 100 + this.state.saltPct / 100;
                const adjust = Math.round(diff / perGram);
                if (adjust === 0) break;
                this.set('flour', this.state.flour + adjust);
            }
            return this.results;
        }

        /** Scale the recipe so each loaf weighs `grams`. */
        setLoafWeight(grams) {
            grams = Number(grams);
            if (!Number.isFinite(grams) || grams <= 0) return this.results;
            return this.setTotalDough(grams * this.state.numLoaves);
        }

        /** Change the loaf count. With keepLoafWeight on, the recipe scales to keep each loaf the same. */
        setNumLoaves(n) {
            const loafWeight = this.results.loafWeight;
            this.set('numLoaves', n);
            if (this.state.keepLoafWeight) this.setTotalDough(loafWeight * this.state.numLoaves);
            return this.results;
        }

        /** Switch between °F and °C, converting both bake temperatures (snapped to 5°). */
        toggleTempUnit() {
            const to = this.state.tempUnit === 'F' ? 'C' : 'F';
            const convert = (t) => (to === 'C' ? (t - 32) * 5 / 9 : t * 9 / 5 + 32);
            const snap = (t) => Math.round(t / 5) * 5;
            const t1 = this.state.bakeTemp1;
            const t2 = this.state.bakeTemp2;
            this.state.tempUnit = to;
            this.set('bakeTemp1', snap(convert(t1)));
            this.set('bakeTemp2', snap(convert(t2)));
            return to;
        }

        /** Load a saved recipe (accepts `{ state }` or a bare state object). Missing/invalid fields fall back to defaults. */
        load(data) {
            const src = data && typeof data === 'object' && data.state && typeof data.state === 'object'
                ? data.state
                : (data && typeof data === 'object' ? data : {});

            this.state = { ...DEFAULTS };
            if (src.tempUnit === 'C' || src.tempUnit === 'F') this.state.tempUnit = src.tempUnit;
            for (const key of Object.keys(DEFAULTS)) {
                if (key === 'tempUnit' || src[key] === undefined) continue;
                this.set(key, src[key]);
            }
            return this.calculate();
        }

        reset() {
            this.state = { ...DEFAULTS };
            return this.calculate();
        }

        getState() {
            return { ...this.state };
        }

        getResults() {
            return { ...this.results };
        }

        /** Snapshot for saving. */
        exportRecipe() {
            return { state: { ...this.state }, results: { ...this.results } };
        }
    }

    DoughCalculator.DEFAULTS = DEFAULTS;
    DoughCalculator.LIMITS = LIMITS;
    DoughCalculator.TEMP_LIMITS = TEMP_LIMITS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DoughCalculator;
    } else {
        root.DoughCalculator = DoughCalculator;
    }
})(typeof window !== 'undefined' ? window : globalThis);
