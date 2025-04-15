/**
 * Sourdough Calculator - Core Calculation Module
 * Handles all the baker's math and formula calculations
 */

class SourdoughCalculator {
    constructor() {
        // Default formula settings (Tartine recipe)
        this.settings = {
            doughWeight: 1220, // Calculated: 1000g flour + 200g leaven + 20g salt
            flourWeight: 1000, // 900g bread flour + 100g whole wheat
            hydration: 75,
            starter: {
                amount: 200, // Tartine uses 200g leaven
                unit: 'grams', // 'grams' or 'percentage'
                hydration: 100
            },
            salt: 2, // 20g salt is 2% of total flour weight
            flourBlend: [
                { type: 'bread', percentage: 90 }, // 900g / 1000g = 90%
                { type: 'wholeWheat', percentage: 10 } // 100g / 1000g = 10%
            ],
            locked: {
                doughWeight: false,
                flourWeight: false,
                hydration: false,
                starter: false
            }
        };
        
        // Calculated values
        this.recipe = {
            totalFlour: 0,
            totalWater: 0,
            starterFlour: 0,
            starterWater: 0,
            starterAmount: 0,
            flourBreakdown: [],
            salt: 0,
            actualHydration: 0,
            totalDoughWeight: 0,
            flourToAdd: 0,
            waterToAdd: 0
        };
    }
    
    /**
     * Updates a setting and recalculates the recipe
     * @param {string} key - The setting key to update
     * @param {any} value - The new value
     */
    updateSetting(key, value) {
        // Handle nested properties (e.g., 'starter.hydration')
        if (key.includes('.')) {
            const [parent, child] = key.split('.');
            this.settings[parent][child] = value;
        } else {
            this.settings[key] = value;
        }
        
        this.calculate();
        return this.recipe;
    }
    
    /**
     * Validates the current lock combination.
     * Returns true if valid, false if over-constrained.
     */
    _isValidLockCombination(newLocks = null) {
        // Only allow up to 2 locks, except for special starter % case
        const locked = newLocks || this.settings.locked;
        const lockedFields = Object.entries(locked).filter(([k, v]) => v).map(([k]) => k);
        if (lockedFields.length > 2) {
            if (
                lockedFields.length === 3 &&
                locked.doughWeight && locked.hydration && locked.starter &&
                this.settings.starter.unit === 'percentage'
            ) {
                return true;
            }
            return false;
        }
        return true;
    }

    /**
     * Sets whether a value is locked or not
     * @param {string} field - The field to lock (e.g., 'doughWeight', 'flourWeight')
     * @param {boolean} isLocked - Whether to lock or unlock
     */
    lockValue(field, isLocked) {
        // Only allow locking doughWeight, flourWeight, hydration, starter
        if (!['doughWeight', 'flourWeight', 'hydration', 'starter'].includes(field)) {
            throw new Error(`Field '${field}' is not lockable.`);
        }
        const newLocks = { ...this.settings.locked, [field]: isLocked };
        if (!this._isValidLockCombination(newLocks)) {
            throw new Error('Too many fields locked. Please unlock another field first.');
        }
        this.settings.locked[field] = isLocked;
        return this.settings.locked;
    }
    
    /**
     * Updates multiple settings at once and recalculates
     * @param {Object} newSettings - Object with settings to update
     */
    updateSettings(newSettings) {
        for (const [key, value] of Object.entries(newSettings)) {
            if (key === 'locked' && typeof value === 'object') {
                Object.assign(this.settings.locked, value);
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                for (const [nestedKey, nestedValue] of Object.entries(value)) {
                    this.settings[key][nestedKey] = nestedValue;
                }
            } else {
                this.settings[key] = value;
            }
        }
        
        this.calculate();
        return this.recipe;
    }
    
    /**
     * Updates the flour blend
     * @param {Array} blend - Array of flour objects with type and percentage
     */
    updateFlourBlend(blend) {
        // Validate total is 100%
        const total = blend.reduce((sum, flour) => sum + flour.percentage, 0);
        
        // If not exact 100%, normalize
        if (total !== 100) {
            blend = blend.map(flour => ({
                type: flour.type,
                percentage: (flour.percentage / total) * 100
            }));
        }
        
        this.settings.flourBlend = blend;
        this.calculate();
        return this.recipe;
    }
    
    /**
     * Main calculation function that computes all recipe values
     * based on which values are locked
     */
    calculate() {
        const s = this.settings;
        const r = this.recipe;
        const locked = s.locked;
        
        // Initialize starter values
        this._calculateStarterComponents();
        
        // Determine which calculation to use based on locked values
        if (locked.doughWeight && locked.hydration && (locked.starter || s.starter.unit === 'percentage')) {
            this._calculateFromDoughWeightAndHydration();
        } else if (locked.flourWeight && locked.hydration && locked.starter) {
            this._calculateFromFlourAndStarter();
        } else if (locked.flourWeight && locked.doughWeight) {
            this._calculateFromFlourAndDoughWeight();
        } else if (locked.flourWeight && locked.hydration) {
            this._calculateFromFlourAndHydration();
        } else if (locked.doughWeight && locked.starter) {
            this._calculateFromDoughWeightAndStarter();
        } else if (locked.flourWeight) {
            this._calculateFromFlourWeight();
        } else if (locked.doughWeight) {
            this._calculateFromDoughWeight();
        } else if (locked.hydration) {
            this._calculateFromHydration();
        } else if (locked.starter) {
            this._calculateFromStarter();
        } else {
            this._calculateFromFlourWeight();
        }
        
        // Calculate flour breakdown
        r.flourBreakdown = s.flourBlend.map(flour => {
            const flourAmount = (r.totalFlour - r.starterFlour) * (flour.percentage / 100);
            return {
                type: flour.type,
                amount: Math.round(flourAmount * 10) / 10,
                percentage: flour.percentage
            };
        });
        
        // Calculate actual hydration (water ÷ flour) × 100
        r.actualHydration = Math.round((r.totalWater / r.totalFlour) * 1000) / 10;
        
        // Calculate salt amount (always use r.salt)
        r.salt = Math.round((r.totalFlour * (s.salt / 100)) * 10) / 10;
        
        // Calculate total dough weight
        r.totalDoughWeight = r.totalFlour + r.totalWater + r.salt;
        
        // Calculate flour and water to add (excluding what's in the starter)
        r.flourToAdd = Math.round((r.totalFlour - r.starterFlour) * 10) / 10;
        r.waterToAdd = Math.round((r.totalWater - r.starterWater) * 10) / 10;
        
        return r;
    }
    
    /**
     * Calculate starter flour and water components
     * @private
     */
    _calculateStarterComponents() {
        const s = this.settings;
        const r = this.recipe;
        if (s.starter.unit === 'percentage') {
            // Use the most up-to-date flour value
            const flour = r.totalFlour || s.flourWeight;
            r.starterAmount = flour * (s.starter.amount / 100);
        } else {
            // Always use the user-supplied value in grams mode
            r.starterAmount = s.starter.amount;
        }
        r.starterFlour = r.starterAmount / (1 + (s.starter.hydration / 100));
        r.starterWater = r.starterAmount - r.starterFlour;
    }
    
    /**
     * Calculate recipe when flour weight and hydration are locked
     * @private
     */
    _calculateFromFlourAndHydration() {
        const s = this.settings;
        const r = this.recipe;
        
        console.log(`[DEBUG] Calculating from hydration: ${s.hydration}%`);
        
        // Check which values are locked to determine calculation flow
        if (s.locked.flourWeight && s.locked.doughWeight) {
            // Flour weight and dough weight are locked
            r.totalFlour = s.flourWeight;
            r.saltWeight = r.totalFlour * (s.salt / 100);
            
            // Calculate water based on dough weight and flour
            r.totalWater = s.doughWeight - r.totalFlour - r.saltWeight;
            
            // Calculate starter components
            // Calculate starter amount in grams
            if (s.starter.unit === 'percentage') {
                r.starterAmount = (s.starter.amount / 100) * r.totalFlour;
            } else {
                r.starterAmount = s.starter.amount;
            }
            
            r.starterFlour = r.starterAmount / (1 + (s.starter.hydration / 100));
            r.starterWater = r.starterAmount - r.starterFlour;
            
            console.log(`[DEBUG] Locked flour ${r.totalFlour}g and dough weight ${s.doughWeight}g`);
            console.log(`[DEBUG] Calculated water: ${r.totalWater.toFixed(2)}g`);
        } else {
            // Default to flour weight as reference
            r.totalFlour = s.flourWeight;
            
            // Calculate starter amount in grams
            if (s.starter.unit === 'percentage') {
                r.starterAmount = (s.starter.amount / 100) * r.totalFlour;
            } else {
                r.starterAmount = s.starter.amount;
            }
            
            // Calculate starter flour and water components
            r.starterFlour = r.starterAmount / (1 + (s.starter.hydration / 100));
            r.starterWater = r.starterAmount - r.starterFlour;
            
            console.log(`[DEBUG] Starter amount: ${r.starterAmount}g (${r.starterFlour.toFixed(2)}g flour, ${r.starterWater.toFixed(2)}g water)`);
            
            // Calculate total water needed for target hydration
            // This is the critical calculation to account for starter's water contribution
            const totalFlourIncludingStarter = r.totalFlour;
            const targetTotalWater = totalFlourIncludingStarter * (s.hydration / 100);
            console.log(`[DEBUG] Target water for ${s.hydration}% hydration: ${targetTotalWater.toFixed(2)}g`);
            
            // Calculate water to add (total needed minus what's in starter)
            r.totalWater = targetTotalWater;
            const waterToAdd = targetTotalWater - r.starterWater;
            console.log(`[DEBUG] Water to add (excluding starter): ${waterToAdd.toFixed(2)}g`);
            
            // Calculate salt
            r.saltWeight = r.totalFlour * (s.salt / 100);
            
            // Update dough weight
            s.doughWeight = r.totalFlour + r.totalWater + r.saltWeight;
            console.log(`[DEBUG] Total dough weight: ${s.doughWeight.toFixed(2)}g`);
        }
        
        // Calculate actual hydration to verify
        const actualHydration = (r.totalWater / r.totalFlour) * 100;
        console.log(`[DEBUG] Actual hydration: ${actualHydration.toFixed(2)}%`);
    }
    
    /**
     * Calculate recipe when flour weight and starter are locked
     * @private
     */
    _calculateFromFlourAndStarter() {
        const s = this.settings;
        const r = this.recipe;
        
        // Set total flour from settings
        r.totalFlour = s.flourWeight;
        
        // Calculate water based on hydration
        r.totalWater = r.totalFlour * (s.hydration / 100);
        
        // Update dough weight
        s.doughWeight = Math.round(r.totalFlour + r.totalWater + (r.totalFlour * (s.salt / 100)));
    }
    
    /**
     * Calculate recipe when dough weight and hydration are locked (Scenario 1)
     * @private
     */
    _calculateFromDoughWeightAndHydration() {
        const s = this.settings;
        const r = this.recipe;
        
        // Calculate total flour (excluding starter) based on dough weight
        const denominator = 1 + (s.hydration / 100) + (s.salt / 100);
        let baseFlour = s.doughWeight / denominator;
        
        // If starter is percentage, we need to solve for flour considering starter contribution
        if (s.starter.unit === 'percentage') {
            // Complex formula accounting for starter contribution when it's a percentage
            // Formula derived from solving:
            // doughWeight = totalFlour + totalWater + salt
            // totalFlour = baseFlour + starterFlour
            // starterFlour = starterAmount / (1 + starter.hydration/100)
            // starterAmount = totalFlour * (starter.amount/100)
            
            // This simplifies to solving for totalFlour:
            const starterRatio = s.starter.amount / 100;
            const starterFlourFactor = 1 / (1 + (s.starter.hydration / 100));
            const starterWaterFactor = 1 - starterFlourFactor;
            
            // Calculate total flour weight
            r.totalFlour = s.doughWeight / (
                1 + (s.hydration / 100) + (s.salt / 100) + 
                starterRatio * (starterWaterFactor - (s.hydration / 100) * starterFlourFactor)
            );
            
            // Now calculate starter amount based on total flour
            r.starterAmount = r.totalFlour * (s.starter.amount / 100);
            r.starterFlour = r.starterAmount / (1 + (s.starter.hydration / 100));
            r.starterWater = r.starterAmount - r.starterFlour;
            
            // Calculate total water based on hydration
            r.totalWater = r.totalFlour * (s.hydration / 100);
            
            // Update flour weight setting
            s.flourWeight = Math.round(r.totalFlour);
        } else {
            // Starter amount is fixed in grams
            // Calculate flour with fixed starter
            baseFlour = (s.doughWeight - r.starterAmount - (baseFlour * (s.salt / 100))) / (1 + (s.hydration / 100));
            
            // Calculate total flour and water
            r.totalFlour = baseFlour + r.starterFlour;
            r.totalWater = baseFlour * (s.hydration / 100) + r.starterWater;
            
            // Update flour weight setting
            s.flourWeight = Math.round(r.totalFlour);
        }
    }
    
    /**
     * Calculate recipe when flour weight and dough weight are locked
     * @private
     */
    _calculateFromFlourAndDoughWeight() {
        const s = this.settings;
        const r = this.recipe;
        
        // Set total flour from settings
        r.totalFlour = s.flourWeight;
        
        // Calculate starter amount if it's a percentage
        if (s.starter.unit === 'percentage') {
            r.starterAmount = r.totalFlour * (s.starter.amount / 100);
            r.starterFlour = r.starterAmount / (1 + (s.starter.hydration / 100));
            r.starterWater = r.starterAmount - r.starterFlour;
        }
        
        // Calculate water (total dough weight minus flour minus salt)
        const salt = r.totalFlour * (s.salt / 100);
        r.totalWater = s.doughWeight - r.totalFlour - salt;
        
        // Calculate actual hydration
        s.hydration = Math.round((r.totalWater / r.totalFlour) * 100);
    }
    
    /**
     * Calculate recipe when dough weight and starter are locked
     * @private
     */
    _calculateFromDoughWeightAndStarter() {
        const s = this.settings;
        const r = this.recipe;
        
        // Calculate total flour (excluding starter) based on dough weight
        const denominator = 1 + (s.hydration / 100) + (s.salt / 100);
        let baseFlour = s.doughWeight / denominator;
        
        // Adjust base flour to exclude starter flour
        baseFlour = (s.doughWeight - r.starterAmount - (baseFlour * (s.salt / 100))) / (1 + (s.hydration / 100));
        
        // Calculate total flour and water
        r.totalFlour = baseFlour + r.starterFlour;
        r.totalWater = baseFlour * (s.hydration / 100) + r.starterWater;
        
        // Update flour weight setting
        s.flourWeight = Math.round(r.totalFlour);
    }
    
    /**
     * Calculate recipe based on dough weight as primary value
     * @private
     */
    _calculateFromDoughWeight() {
        const s = this.settings;
        const r = this.recipe;
        
        console.log(`[DEBUG] Calculating from dough weight: ${s.doughWeight}g`);
        
        // Calculate base flour based on hydration
        if (s.locked.flourWeight) {
            // If flour weight is locked, calculate hydration from it
            r.totalFlour = s.flourWeight;
            console.log(`[DEBUG] Using locked flour weight: ${r.totalFlour}g`);
            
            // Calculate salt weight
            r.saltWeight = r.totalFlour * (s.salt / 100);
            
            // Calculate water weight from dough weight and flour
            r.totalWater = s.doughWeight - r.totalFlour - r.saltWeight;
            
            // Calculate resulting hydration
            s.hydration = (r.totalWater / r.totalFlour) * 100;
            console.log(`[DEBUG] Calculated hydration: ${s.hydration.toFixed(2)}%`);
        } else if (s.locked.hydration) {
            // If hydration is locked, use it to calculate flour
            const hydrationDecimal = s.hydration / 100;
            const saltCoefficient = s.salt / 100;
            
            // Formula: doughWeight = flour + (flour * hydration/100) + (flour * salt/100)
            // Solving for flour:
            r.totalFlour = s.doughWeight / (1 + hydrationDecimal + saltCoefficient);
            console.log(`[DEBUG] Using locked hydration ${s.hydration}% to calculate flour: ${r.totalFlour.toFixed(2)}g`);
            
            // Calculate water based on hydration
            r.totalWater = r.totalFlour * hydrationDecimal;
            console.log(`[DEBUG] Calculated water: ${r.totalWater.toFixed(2)}g`);
            
            // Calculate salt weight
            r.saltWeight = r.totalFlour * saltCoefficient;
        } else {
            // Default calculation using current hydration
            const hydrationDecimal = s.hydration / 100;
            const saltCoefficient = s.salt / 100;
            
            r.totalFlour = s.doughWeight / (1 + hydrationDecimal + saltCoefficient);
            r.totalWater = r.totalFlour * hydrationDecimal;
            r.saltWeight = r.totalFlour * saltCoefficient;
            console.log(`[DEBUG] Using hydration ${s.hydration}% to calculate flour: ${r.totalFlour.toFixed(2)}g`);
            console.log(`[DEBUG] Calculated water: ${r.totalWater.toFixed(2)}g`);
        }
        
        // Calculate starter amount
        if (s.starter.unit === 'percentage') {
            r.starterAmount = (s.starter.amount / 100) * r.totalFlour;
            console.log(`[DEBUG] Starter amount: ${s.starter.amount}% of flour = ${r.starterAmount.toFixed(2)}g`);
        } else {
            r.starterAmount = s.starter.amount;
            console.log(`[DEBUG] Starter amount: ${r.starterAmount}g`);
        }
        
        // Calculate starter flour and water components
        r.starterFlour = r.starterAmount / (1 + (s.starter.hydration / 100));
        r.starterWater = r.starterAmount - r.starterFlour;
        console.log(`[DEBUG] Starter hydration: ${s.starter.hydration}%`);
        console.log(`[DEBUG] Starter components: flour=${r.starterFlour.toFixed(2)}g, water=${r.starterWater.toFixed(2)}g`);
        
        // Update flour weight in settings
        s.flourWeight = Math.round(r.totalFlour);
        
        // Calculate actual hydration to verify
        const actualHydration = (r.totalWater / r.totalFlour) * 100;
        console.log(`[DEBUG] Actual hydration: ${actualHydration.toFixed(2)}%`);
    }
    
    /**
     * Calculate recipe based on flour weight as primary value
     * @private
     */
    _calculateFromFlourWeight() {
        const s = this.settings;
        const r = this.recipe;
        
        console.log(`[DEBUG] Calculating from flour weight: ${s.flourWeight}g`);
        
        // Set total flour
        r.totalFlour = s.flourWeight;
        
        // Calculate starter amount if needed
        if (s.starter.unit === 'percentage') {
            r.starterAmount = (s.starter.amount / 100) * r.totalFlour;
            console.log(`[DEBUG] Starter amount: ${s.starter.amount}% of flour = ${r.starterAmount.toFixed(2)}g`);
        } else {
            r.starterAmount = s.starter.amount;
            console.log(`[DEBUG] Starter amount: ${r.starterAmount}g`);
        }
        
        // Calculate starter flour and water components
        r.starterFlour = r.starterAmount / (1 + (s.starter.hydration / 100));
        r.starterWater = r.starterAmount - r.starterFlour;
        console.log(`[DEBUG] Starter hydration: ${s.starter.hydration}%`);
        console.log(`[DEBUG] Starter components: flour=${r.starterFlour.toFixed(2)}g, water=${r.starterWater.toFixed(2)}g`);
        
        // Calculate total water based on hydration
        if (s.locked.hydration) {
            // If hydration is locked, use it to calculate water
            // Total water required for desired hydration 
            const targetWater = r.totalFlour * (s.hydration / 100);
            
            // Subtract starter water to get additional water needed
            r.totalWater = targetWater;
            
            // Calculate the base water (excluding starter contribution)
            const baseWater = targetWater - r.starterWater;
            console.log(`[DEBUG] Using locked hydration ${s.hydration}% to calculate water: ${r.totalWater.toFixed(2)}g`);
            console.log(`[DEBUG] Base water (excluding starter): ${baseWater.toFixed(2)}g`);
        } else if (s.locked.doughWeight) {
            // If dough weight is locked, calculate water from that
            const saltWeight = r.totalFlour * (s.salt / 100);
            r.totalWater = s.doughWeight - r.totalFlour - saltWeight;
            
            // Calculate resulting hydration
            s.hydration = (r.totalWater / r.totalFlour) * 100;
            console.log(`[DEBUG] Calculated water from dough weight: ${r.totalWater.toFixed(2)}g`);
            console.log(`[DEBUG] Resulting hydration: ${s.hydration.toFixed(2)}%`);
        } else {
            // Default to using the set hydration
            // Total water required for desired hydration
            const targetWater = r.totalFlour * (s.hydration / 100);
            
            // Set total water
            r.totalWater = targetWater;
            
            // Calculate the base water (excluding starter contribution)
            const baseWater = targetWater - r.starterWater;
            console.log(`[DEBUG] Using hydration ${s.hydration}% to calculate water: ${r.totalWater.toFixed(2)}g`);
            console.log(`[DEBUG] Base water (excluding starter): ${baseWater.toFixed(2)}g`);
        }
        
        // Calculate dough weight
        s.doughWeight = Math.round(r.totalFlour + r.totalWater + (r.totalFlour * (s.salt / 100)));
        console.log(`[DEBUG] Calculated dough weight: ${s.doughWeight}g`);
        
        // Calculate salt weight
        r.saltWeight = r.totalFlour * (s.salt / 100);
        console.log(`[DEBUG] Salt weight: ${r.saltWeight.toFixed(2)}g`);
        
        // Calculate actual hydration to verify
        const actualHydration = (r.totalWater / r.totalFlour) * 100;
        console.log(`[DEBUG] Actual hydration: ${actualHydration.toFixed(2)}%`);
    }
    
    /**
     * Calculate recipe based on starter amount as primary value
     * @private
     */
    _calculateFromStarter() {
        const s = this.settings;
        const r = this.recipe;
        
        console.log(`[DEBUG] Calculating from starter: ${s.starter.amount}${s.starter.unit === 'percentage' ? '%' : 'g'}`);
        console.log(`[DEBUG] Starter hydration: ${s.starter.hydration}%`);
        
        // Calculate starter amount in grams if needed
        if (s.starter.unit === 'percentage') {
            // If we have flour weight available, use it
            if (s.locked.flourWeight) {
                r.totalFlour = s.flourWeight;
                r.starterAmount = (s.starter.amount / 100) * r.totalFlour;
                console.log(`[DEBUG] Using flour weight (${r.totalFlour}g) to calculate starter: ${r.starterAmount.toFixed(2)}g`);
            } 
            // Otherwise use dough weight to estimate
            else if (s.locked.doughWeight) {
                // We need to solve for flour weight and starter amount together
                // This is an approximation as starter affects the total flour
                // Estimate flour weight from dough weight (excluding salt for now)
                const estimatedFlourPercent = 100 / (100 + s.hydration);
                const estimatedFlour = s.doughWeight * estimatedFlourPercent / 100;
                
                // Calculate starter based on estimated flour
                r.starterAmount = (s.starter.amount / 100) * estimatedFlour;
                console.log(`[DEBUG] Estimated flour from dough weight: ${estimatedFlour.toFixed(2)}g`);
                console.log(`[DEBUG] Estimated starter amount: ${r.starterAmount.toFixed(2)}g`);
                
                // Now calculate actual flour weight factoring in starter
                r.totalFlour = (s.doughWeight - r.starterAmount) / (1 + (s.hydration / 100) + (s.salt / 100));
                r.starterAmount = (s.starter.amount / 100) * r.totalFlour;
                console.log(`[DEBUG] Refined flour weight: ${r.totalFlour.toFixed(2)}g`);
                console.log(`[DEBUG] Refined starter amount: ${r.starterAmount.toFixed(2)}g`);
            }
            // If neither flour nor dough weight is locked, use hydration as reference
            else {
                // Start with a conventional amount of flour (1000g) and adjust later
                r.totalFlour = 1000;
                r.starterAmount = (s.starter.amount / 100) * r.totalFlour;
                console.log(`[DEBUG] Using default flour (${r.totalFlour}g) to calculate starter: ${r.starterAmount.toFixed(2)}g`);
            }
        } else {
            // Starter is specified directly in grams
            r.starterAmount = s.starter.amount;
            console.log(`[DEBUG] Starter amount: ${r.starterAmount}g`);
            
            // If flour weight is locked, use it as reference
            if (s.locked.flourWeight) {
                r.totalFlour = s.flourWeight;
                console.log(`[DEBUG] Using locked flour weight: ${r.totalFlour}g`);
            }
            // If dough weight is locked, calculate flour from that
            else if (s.locked.doughWeight) {
                // Calculate flour weight factoring in starter, hydration and salt
                r.totalFlour = (s.doughWeight - r.starterAmount) / (1 + (s.hydration / 100) + (s.salt / 100));
                console.log(`[DEBUG] Calculated flour weight from dough weight: ${r.totalFlour.toFixed(2)}g`);
            }
            // If neither is locked, use a conventional amount
            else {
                r.totalFlour = 1000;
                console.log(`[DEBUG] Using default flour weight: ${r.totalFlour}g`);
            }
        }
        
        // Calculate starter flour and water components
        r.starterFlour = r.starterAmount / (1 + (s.starter.hydration / 100));
        r.starterWater = r.starterAmount - r.starterFlour;
        console.log(`[DEBUG] Starter components: flour=${r.starterFlour.toFixed(2)}g, water=${r.starterWater.toFixed(2)}g`);
        
        // Calculate total water based on hydration
        r.totalWater = r.totalFlour * (s.hydration / 100);
        console.log(`[DEBUG] Target water based on hydration ${s.hydration}%: ${r.totalWater.toFixed(2)}g`);
        
        // Calculate dough weight
        s.doughWeight = Math.round(r.totalFlour + r.totalWater + (r.totalFlour * (s.salt / 100)));
        console.log(`[DEBUG] Calculated dough weight: ${s.doughWeight}g`);
        
        // Calculate actual hydration to verify
        const actualHydration = (r.totalWater / r.totalFlour) * 100;
        console.log(`[DEBUG] Actual hydration: ${actualHydration.toFixed(2)}%`);
    }
    
    /**
     * Calculate recipe when hydration is locked (and no other anchor is set)
     * @private
     */
    _calculateFromHydration() {
        const s = this.settings;
        const r = this.recipe;
        // We'll use a default flour weight if nothing else is locked
        r.totalFlour = s.flourWeight;
        // Calculate starter amount
        if (s.starter.unit === 'percentage') {
            r.starterAmount = (s.starter.amount / 100) * r.totalFlour;
        } else {
            r.starterAmount = s.starter.amount;
        }
        // Calculate starter flour and water
        r.starterFlour = r.starterAmount / (1 + (s.starter.hydration / 100));
        r.starterWater = r.starterAmount - r.starterFlour;
        // Calculate total water for target hydration
        r.totalWater = r.totalFlour * (s.hydration / 100);
        // Calculate salt
        r.salt = Math.round((r.totalFlour * (s.salt / 100)) * 10) / 10;
        // Calculate dough weight
        r.totalDoughWeight = r.totalFlour + r.totalWater + r.salt;
        // Update settings for flourWeight and doughWeight
        s.flourWeight = Math.round(r.totalFlour);
        s.doughWeight = Math.round(r.totalDoughWeight);
    }
    
    /**
     * Get the current recipe
     * @returns {Object} The calculated recipe
     */
    getRecipe() {
        return this.recipe;
    }
    
    /**
     * Get the current settings
     * @returns {Object} The current calculator settings
     */
    getSettings() {
        return this.settings;
    }
    
    /**
     * Load a complete recipe (used for saved recipes)
     * @param {Object} recipe - Recipe object with settings
     */
    loadRecipe(recipe) {
        if (recipe && recipe.settings) {
            // Add locked property if it doesn't exist in the saved recipe
            if (!recipe.settings.locked) {
                recipe.settings.locked = {
                    doughWeight: false,
                    flourWeight: false,
                    hydration: false,
                    starter: false
                };
            }
            
            this.settings = { ...recipe.settings };
            this.calculate();
            return this.recipe;
        }
        return null;
    }
    
    /**
     * Reset calculator to default values
     */
    reset() {
        this.settings = {
            doughWeight: 1220, // Calculated: 1000g flour + 200g leaven + 20g salt
            flourWeight: 1000, // 900g bread flour + 100g whole wheat
            hydration: 75,
            starter: {
                amount: 200, // Tartine uses 200g leaven
                unit: 'grams', // 'grams' or 'percentage'
                hydration: 100
            },
            salt: 2, // 20g salt is 2% of total flour weight
            flourBlend: [
                { type: 'bread', percentage: 90 }, // 900g / 1000g = 90%
                { type: 'wholeWheat', percentage: 10 } // 100g / 1000g = 10%
            ],
            locked: {
                doughWeight: false,
                flourWeight: false,
                hydration: false,
                starter: false
            }
        };
        
        this.calculate();
        return this.recipe;
    }
}

// Export the calculator
const sourdoughCalculator = new SourdoughCalculator();
sourdoughCalculator.calculate(); // Initialize calculations 