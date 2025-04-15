/**
 * Sourdough Timeline Module
 * Generates and manages baking timelines based on recipe and environmental factors
 */

class SourdoughTimeline {
    constructor() {
        this.settings = {
            startTime: new Date(),
            mode: 'start', // 'start' or 'end'
            roomTemp: 22, // degrees Celsius
            starter: {
                isFed: true,
                lastFedTime: null
            },
            recipe: null // Will be linked to the main calculator
        };
        
        this.timeline = [];
        this.calculator = null;
    }
    
    /**
     * Link the timeline to the calculator for recipe data
     * @param {SourdoughCalculator} calculator - Reference to the calculator instance
     */
    setCalculator(calculator) {
        this.calculator = calculator;
        return this;
    }
    
    /**
     * Update a timeline setting
     * @param {string} key - Setting key
     * @param {any} value - Setting value
     */
    updateSetting(key, value) {
        // Handle date string conversion
        if (key === 'startTime' && typeof value === 'string') {
            value = new Date(value);
        }
        
        // Handle nested properties
        if (key.includes('.')) {
            const [parent, child] = key.split('.');
            this.settings[parent][child] = value;
        } else {
            this.settings[key] = value;
        }
        
        this.generate();
        return this.timeline;
    }
    
    /**
     * Generate the timeline based on current settings
     */
    generate() {
        if (!this.calculator) {
            console.error('Timeline not linked to calculator');
            return [];
        }
        
        const recipe = this.calculator.getRecipe();
        const settings = this.calculator.getSettings();
        this.timeline = [];
        
        // If calculating from end time, work backwards
        let startTime = new Date(this.settings.startTime);
        let currentTime = new Date(startTime);
        
        if (this.settings.mode === 'end') {
            // Working backwards from end time
            this._generateBackwardTimeline(currentTime, recipe, settings);
        } else {
            // Working forwards from start time
            this._generateForwardTimeline(currentTime, recipe, settings);
        }
        
        return this.timeline;
    }
    
    /**
     * Generate timeline working forwards from start time
     * @private
     */
    _generateForwardTimeline(startTime, recipe, settings) {
        const timeline = [];
        let currentTime = new Date(startTime);
        
        // Add starter feeding step if needed
        if (!this.settings.starter.isFed) {
            timeline.push({
                step: 'Feed Starter',
                description: 'Feed your starter with equal parts flour and water by weight.',
                time: this._formatTime(currentTime),
                date: this._formatDate(currentTime),
                isoTime: new Date(currentTime).toISOString()
            });
            
            // Starter needs 4-6 hours to rise (adjust based on room temp)
            const starterReadyHours = this._adjustTimeForTemperature(5, this.settings.roomTemp);
            currentTime = this._addHours(currentTime, starterReadyHours);
        }
        
        // Autolyse step (optional but recommended)
        timeline.push({
            step: 'Autolyse',
            description: `Mix ${Math.round(recipe.totalFlour - recipe.starterFlour)}g flour with ${Math.round(recipe.totalWater - recipe.starterWater)}g water. Let rest.`,
            time: this._formatTime(currentTime),
            date: this._formatDate(currentTime),
            isoTime: new Date(currentTime).toISOString()
        });
        
        // Rest for 30-60 minutes
        currentTime = this._addMinutes(currentTime, 45);
        
        // Add starter and salt
        timeline.push({
            step: 'Mix Starter & Salt',
            description: `Add ${Math.round(recipe.starterAmount)}g starter and ${recipe.salt}g salt to the autolyse. Mix thoroughly.`,
            time: this._formatTime(currentTime),
            date: this._formatDate(currentTime),
            isoTime: new Date(currentTime).toISOString()
        });
        
        // First fold (after 30 minutes)
        currentTime = this._addMinutes(currentTime, 30);
        timeline.push({
            step: 'First Fold',
            description: 'Perform first set of stretch and folds to build dough strength.',
            time: this._formatTime(currentTime),
            date: this._formatDate(currentTime),
            isoTime: new Date(currentTime).toISOString()
        });
        
        // Additional folds every 30 minutes, for 3 more times
        for (let i = 2; i <= 4; i++) {
            currentTime = this._addMinutes(currentTime, 30);
            timeline.push({
                step: `Fold #${i}`,
                description: 'Perform another set of stretch and folds to continue building strength.',
                time: this._formatTime(currentTime),
                date: this._formatDate(currentTime),
                isoTime: new Date(currentTime).toISOString()
            });
        }
        
        // Bulk fermentation - adjusted for temperature and starter percentage
        const starterPercentage = (recipe.starterAmount / recipe.totalFlour) * 100;
        let bulkHours = this._adjustTimeForTemperature(4, this.settings.roomTemp);
        
        // Adjust for starter percentage - more starter = faster fermentation
        if (starterPercentage > 20) {
            bulkHours *= 0.8;
        } else if (starterPercentage < 10) {
            bulkHours *= 1.2;
        }
        
        // Adjust for whole grain content
        const wholeGrainPercentage = settings.flourBlend.reduce((total, flour) => {
            if (flour.type === 'wholeWheat' || flour.type === 'rye') {
                return total + flour.percentage;
            }
            return total;
        }, 0);
        
        if (wholeGrainPercentage > 30) {
            bulkHours *= 0.85; // Whole grains ferment faster
        }
        
        currentTime = this._addHours(currentTime, bulkHours);
        
        // Bulk fermentation end
        timeline.push({
            step: 'End Bulk Fermentation',
            description: 'Dough should have risen by about 30-50% and feel airy. Gently turn out onto work surface.',
            time: this._formatTime(currentTime),
            date: this._formatDate(currentTime),
            isoTime: new Date(currentTime).toISOString()
        });
        
        // Pre-shape
        currentTime = this._addMinutes(currentTime, 5);
        timeline.push({
            step: 'Pre-shape',
            description: 'Gently pre-shape the dough and let it rest.',
            time: this._formatTime(currentTime),
            date: this._formatDate(currentTime),
            isoTime: new Date(currentTime).toISOString()
        });
        
        // Bench rest
        currentTime = this._addMinutes(currentTime, 20);
        
        // Final shape
        timeline.push({
            step: 'Final Shape',
            description: 'Shape the dough and place in proofing basket or container.',
            time: this._formatTime(currentTime),
            date: this._formatDate(currentTime),
            isoTime: new Date(currentTime).toISOString()
        });
        
        // Final proof (room temperature or refrigerator)
        // For demonstration, we'll do a cold proof
        currentTime = this._addMinutes(currentTime, 30);
        timeline.push({
            step: 'Refrigerate',
            description: 'Place the shaped dough in the refrigerator for cold fermentation (8-14 hours).',
            time: this._formatTime(currentTime),
            date: this._formatDate(currentTime),
            isoTime: new Date(currentTime).toISOString()
        });
        
        // Cold proof
        currentTime = this._addHours(currentTime, 12);
        
        // Preheat oven
        timeline.push({
            step: 'Preheat Oven',
            description: 'Preheat oven with Dutch oven or baking stone to 500°F/260°C.',
            time: this._formatTime(currentTime),
            date: this._formatDate(currentTime),
            isoTime: new Date(currentTime).toISOString()
        });
        
        // Bake time
        currentTime = this._addMinutes(currentTime, 45);
        timeline.push({
            step: 'Bake',
            description: 'Score and bake at high heat with steam for 20 minutes, then reduce to 450°F/230°C for 20-25 minutes more.',
            time: this._formatTime(currentTime),
            date: this._formatDate(currentTime),
            isoTime: new Date(currentTime).toISOString()
        });
        
        // Cooling
        currentTime = this._addMinutes(currentTime, 45);
        timeline.push({
            step: 'Cool',
            description: 'Remove bread from oven and let cool for at least 1 hour before slicing.',
            time: this._formatTime(currentTime),
            date: this._formatDate(currentTime),
            isoTime: new Date(currentTime).toISOString()
        });
        
        // Ready to eat
        currentTime = this._addHours(currentTime, 1);
        timeline.push({
            step: 'Enjoy!',
            description: 'Your sourdough bread is ready to slice and enjoy!',
            time: this._formatTime(currentTime),
            date: this._formatDate(currentTime),
            isoTime: new Date(currentTime).toISOString()
        });
        
        this.timeline = timeline;
    }
    
    /**
     * Generate timeline working backwards from end time
     * @private
     */
    _generateBackwardTimeline(endTime, recipe, settings) {
        // Create a forward timeline first
        let forwardTimeline = [];
        const tempStartTime = new Date();
        this._generateForwardTimeline(tempStartTime, recipe, settings);
        forwardTimeline = [...this.timeline];
        
        // Calculate total duration
        const totalDuration = (new Date(forwardTimeline[forwardTimeline.length - 1].isoTime) - new Date(forwardTimeline[0].isoTime)) / 1000 / 60; // in minutes
        
        // Calculate new start time by subtracting total duration from desired end time
        const adjustedStartTime = new Date(endTime.getTime() - (totalDuration * 60 * 1000));
        
        // Regenerate timeline with correct start time
        this.settings.startTime = adjustedStartTime;
        this.settings.mode = 'start';
        this.generate();
        
        // Switch mode back
        this.settings.mode = 'end';
        this.settings.startTime = endTime;
    }
    
    /**
     * Adjusts a base time (in hours) based on room temperature
     * @param {number} baseHours - The base time in hours at 22°C
     * @param {number} temperature - The actual room temperature in °C
     * @private
     */
    _adjustTimeForTemperature(baseHours, temperature) {
        // Fermentation is roughly 30% slower at 18°C and 30% faster at 26°C compared to 22°C
        // Simple linear adjustment
        const tempFactor = 1 - ((temperature - 22) * 0.05);
        return baseHours * tempFactor;
    }
    
    /**
     * Add hours to a date
     * @param {Date} date - The date to add hours to
     * @param {number} hours - Hours to add
     * @private
     */
    _addHours(date, hours) {
        return new Date(date.getTime() + (hours * 60 * 60 * 1000));
    }
    
    /**
     * Add minutes to a date
     * @param {Date} date - The date to add minutes to
     * @param {number} minutes - Minutes to add
     * @private
     */
    _addMinutes(date, minutes) {
        return new Date(date.getTime() + (minutes * 60 * 1000));
    }
    
    /**
     * Format a date for display (MM/DD/YYYY)
     * @param {Date} date - The date to format
     * @private
     */
    _formatDate(date) {
        return date.toLocaleDateString();
    }
    
    /**
     * Format a time for display (HH:MM AM/PM)
     * @param {Date} date - The date to extract time from
     * @private
     */
    _formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    /**
     * Get the current timeline
     * @returns {Array} The generated timeline
     */
    getTimeline() {
        return this.timeline;
    }
}

// Export timeline object
const sourdoughTimeline = new SourdoughTimeline(); 