/**
 * DOUGH_FORMULATOR - Simple Sourdough Calculator
 * Clean baker's math calculations without complex lock systems
 */

class DoughCalculator {
    constructor() {
        this.state = {
            // Core inputs
            totalFlour: 700,           // Total flour in grams
            hydration: 75,             // Hydration percentage
            starter: 150,              // Starter amount in grams
            starterHydration: 100,     // Starter hydration percentage
            saltPct: 2.0,              // Salt as percentage of flour

            // Flour blend
            useTwoFlours: false,
            mainFlourPct: 80,          // Main flour percentage (when using 2 flours)

            // Loaves
            numLoaves: 2,

            // Baking settings (in Fahrenheit by default)
            bakeTemp1: 450,
            bakeTime1: 20,
            bakeTemp2: 425,
            bakeTime2: 25,
            tempUnit: 'F'              // 'F' or 'C'
        };

        this.results = {};
        this.calculate();
    }

    /**
     * Main calculation - computes all derived values
     */
    calculate() {
        const s = this.state;
        const r = this.results;

        // Starter components (based on starter hydration)
        // For 100% hydration starter: 50% flour, 50% water
        // Formula: starterFlour = starter / (1 + starterHydration/100)
        r.starterFlour = s.starter / (1 + s.starterHydration / 100);
        r.starterWater = s.starter - r.starterFlour;

        // Total water needed for target hydration
        r.totalWater = s.totalFlour * (s.hydration / 100);

        // Water to add (total water minus what's in starter)
        r.waterToAdd = r.totalWater - r.starterWater;

        // Flour to add (total flour minus what's in starter)
        r.flourToAdd = s.totalFlour - r.starterFlour;

        // Salt amount
        r.salt = s.totalFlour * (s.saltPct / 100);

        // Total dough weight
        r.totalDough = s.totalFlour + r.totalWater + r.salt;

        // Per-loaf weight
        r.loafWeight = r.totalDough / s.numLoaves;

        // Starter as percentage of flour
        r.starterFlourPct = (s.starter / s.totalFlour) * 100;

        // Starter as percentage of total dough
        r.starterTotalPct = (s.starter / r.totalDough) * 100;

        // Flour breakdown (when using 2 flours)
        if (s.useTwoFlours) {
            r.mainFlour = r.flourToAdd * (s.mainFlourPct / 100);
            r.secondFlour = r.flourToAdd - r.mainFlour;
        } else {
            r.mainFlour = r.flourToAdd;
            r.secondFlour = 0;
        }

        // Round all values for display
        r.starterFlour = this._round(r.starterFlour, 1);
        r.starterWater = this._round(r.starterWater, 1);
        r.totalWater = this._round(r.totalWater, 1);
        r.waterToAdd = this._round(r.waterToAdd, 1);
        r.flourToAdd = this._round(r.flourToAdd, 1);
        r.salt = this._round(r.salt, 1);
        r.totalDough = Math.round(r.totalDough);
        r.loafWeight = Math.round(r.loafWeight);
        r.starterFlourPct = this._round(r.starterFlourPct, 1);
        r.starterTotalPct = this._round(r.starterTotalPct, 1);
        r.mainFlour = Math.round(r.mainFlour);
        r.secondFlour = Math.round(r.secondFlour);

        return r;
    }

    /**
     * Update a single value and recalculate
     */
    update(key, value) {
        if (key in this.state) {
            this.state[key] = value;
            this.calculate();
        }
        return this.results;
    }

    /**
     * Update multiple values at once
     */
    updateMultiple(updates) {
        for (const [key, value] of Object.entries(updates)) {
            if (key in this.state) {
                this.state[key] = value;
            }
        }
        this.calculate();
        return this.results;
    }

    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Get current results
     */
    getResults() {
        return { ...this.results };
    }

    /**
     * Load a saved recipe
     */
    loadRecipe(recipe) {
        if (recipe && recipe.state) {
            // Merge with defaults to handle missing fields
            this.state = {
                ...this.state,
                ...recipe.state
            };
            this.calculate();
        }
        return this.results;
    }

    /**
     * Export current recipe for saving
     */
    exportRecipe() {
        return {
            state: { ...this.state },
            results: { ...this.results }
        };
    }

    /**
     * Convert temperature between F and C
     */
    convertTemp(temp, toUnit) {
        if (toUnit === 'C') {
            return Math.round((temp - 32) * 5 / 9);
        } else {
            return Math.round(temp * 9 / 5 + 32);
        }
    }

    /**
     * Toggle temperature unit and convert all temps
     */
    toggleTempUnit() {
        const newUnit = this.state.tempUnit === 'F' ? 'C' : 'F';

        this.state.bakeTemp1 = this.convertTemp(this.state.bakeTemp1, newUnit);
        this.state.bakeTemp2 = this.convertTemp(this.state.bakeTemp2, newUnit);
        this.state.tempUnit = newUnit;

        return newUnit;
    }

    /**
     * Reset to defaults
     */
    reset() {
        this.state = {
            totalFlour: 700,
            hydration: 75,
            starter: 150,
            starterHydration: 100,
            saltPct: 2.0,
            useTwoFlours: false,
            mainFlourPct: 80,
            numLoaves: 2,
            bakeTemp1: 450,
            bakeTime1: 20,
            bakeTemp2: 425,
            bakeTime2: 25,
            tempUnit: 'F'
        };
        this.calculate();
        return this.results;
    }

    /**
     * Round to specified decimal places
     */
    _round(value, decimals) {
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }
}

// Create global instance
const calculator = new DoughCalculator();
