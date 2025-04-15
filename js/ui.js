/**
 * Sourdough UI Module
 * Handles all UI interactions and DOM manipulations
 */

class SourdoughUI {
    constructor() {
        // DOM references
        this.elements = {
            // Mode toggle buttons
            // simpleMode: document.getElementById('simple-mode-btn'),
            // advancedMode: document.getElementById('advanced-mode-btn'),
            themeToggle: document.getElementById('theme-toggle-btn'),
            
            // Calculator inputs
            doughWeight: document.getElementById('dough-weight'),
            flourWeight: document.getElementById('flour-weight'),
            hydration: document.getElementById('hydration'),
            hydrationSlider: document.getElementById('hydration-slider'),
            starterAmount: document.getElementById('starter-amount'),
            starterUnit: document.getElementById('starter-unit'),
            starterHydration: document.getElementById('starter-hydration'),
            starterHydrationSlider: document.getElementById('starter-hydration-slider'),
            saltPercentage: document.getElementById('salt-percentage'),
            saltPercentageSlider: document.getElementById('salt-percentage-slider'),
            
            // Advanced flour blend inputs
            flourItemsContainer: document.getElementById('flour-items-container'),
            addFlourBtn: document.getElementById('add-flour-btn'),
            flourPresets: document.getElementById('flour-presets'),
            saveBlendBtn: document.getElementById('save-blend-btn'),
            
            // Recipe results
            resultDoughWeight: document.getElementById('result-dough-weight'),
            resultHydration: document.getElementById('result-hydration'),
            resultFlour: document.getElementById('result-flour'),
            resultWater: document.getElementById('result-water'),
            resultStarter: document.getElementById('result-starter'),
            resultSalt: document.getElementById('result-salt'),
            flourBreakdownList: document.getElementById('flour-breakdown-list'),
            
            // Timeline inputs
            timelineMode: document.getElementById('timeline-mode'),
            timelineDate: document.getElementById('timeline-date'),
            roomTemp: document.getElementById('room-temp'),
            roomTempSlider: document.getElementById('room-temp-slider'),
            timelineSteps: document.getElementById('timeline-steps'),
            
            // Recipe actions
            saveRecipeBtn: document.getElementById('save-recipe-btn'),
            copyRecipeBtn: document.getElementById('copy-recipe-btn'),
            
            // Saved recipes
            recipesContainer: document.getElementById('recipes-container'),
            noRecipesMessage: document.getElementById('no-recipes-message'),
            exportRecipesBtn: document.getElementById('export-recipes-btn'),
            importRecipesInput: document.getElementById('import-recipes-input'),
            
            // Modals
            recipeModal: document.getElementById('recipe-modal'),
            recipeName: document.getElementById('recipe-name'),
            recipeNotes: document.getElementById('recipe-notes'),
            saveRecipeConfirm: document.getElementById('save-recipe-confirm'),
            cancelSave: document.getElementById('cancel-save'),
            flourModal: document.getElementById('flour-modal'),
            blendName: document.getElementById('blend-name'),
            saveBlendConfirm: document.getElementById('save-blend-confirm'),
            cancelBlendSave: document.getElementById('cancel-blend-save'),
            closeModalBtns: document.querySelectorAll('.close-modal'),
            
            // Active anchor display
            currentAnchor: document.getElementById('current-anchor'),
            
            // Temperature unit toggle
            tempUnitToggle: document.getElementById('temp-unit-toggle'),
            
            // Timeline toggle
            timelineToggle: document.getElementById('toggle-timeline-btn'),
            timelineContent: document.getElementById('timeline-content'),
            
            // Input field groups
            doughWeightGroup: document.getElementById('dough-weight-group'),
            flourWeightGroup: document.getElementById('flour-weight-group'),
            hydrationGroup: document.getElementById('hydration-group'),
            starterGroup: document.getElementById('starter-group'),
            saltGroup: document.getElementById('salt-group')
        };
        
        // State
        this.state = {
            isDarkTheme: false,
            editingRecipeId: null,
            flourTypes: [
                { id: 'bread', name: 'Bread Flour' },
                { id: 'allPurpose', name: 'All Purpose Flour' },
                { id: 'wholeWheat', name: 'Whole Wheat Flour' },
                { id: 'rye', name: 'Rye Flour' },
                { id: 'spelt', name: 'Spelt Flour' },
                { id: 'semolina', name: 'Semolina Flour' }
            ],
            temperatureUnit: 'C', // Default to Celsius
            timelineCollapsed: false
        };
        
        // Initialize the UI
        this._initUI();
    }
    
    /**
     * Initialize the UI and attach event listeners
     * @private
     */
    _initUI() {
        // Set current date/time for timeline
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getMinutes() % 5); // Round to nearest 5 minutes
        this.elements.timelineDate.value = now.toISOString().slice(0, 16);
        
        // Set default dark/light theme
        this._setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        // Add Advanced Flour Blend template
        this._initAdvancedFlourBlend();
        
        // Attach event listeners to UI elements
        this._attachEventListeners();
        
        // Initialize temperature unit toggle
        this.initTemperatureToggle();
        
        // Initialize timeline toggle
        this.initTimelineToggle();
        
        // Initialize input field highlighting
        this.initFieldHighlighting();
    }
    
    /**
     * Initialize the advanced flour blend UI
     * @private
     */
    _initAdvancedFlourBlend() {
        // Add default flour types
        this.addAdvancedFlourItem('bread', 80);
        this.addAdvancedFlourItem('wholeWheat', 20);
    }
    
    /**
     * Attach event listeners to UI elements
     * @private
     */
    _attachEventListeners() {
        // Theme toggle
        this.elements.themeToggle.addEventListener('click', () => this._toggleTheme());
        
        // Close modal buttons
        this.elements.closeModalBtns.forEach(btn => {
            btn.addEventListener('click', () => this._closeAllModals());
        });
        
        // Generic modal close by clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === this.elements.recipeModal) {
                this._closeAllModals();
            }
            if (e.target === this.elements.flourModal) {
                this._closeAllModals();
            }
        });
        
        // Add flour button
        this.elements.addFlourBtn.addEventListener('click', () => {
            this.addAdvancedFlourItem();
        });
        
        // Save flour blend button
        this.elements.saveBlendBtn.addEventListener('click', () => {
            this._openFlourModal();
        });
        
        // Confirm save blend
        this.elements.saveBlendConfirm.addEventListener('click', () => {
            this._saveFlourBlend();
        });
        
        // Cancel blend save
        this.elements.cancelBlendSave.addEventListener('click', () => {
            this._closeAllModals();
        });
        
        // Save recipe button
        this.elements.saveRecipeBtn.addEventListener('click', () => {
            this._openRecipeModal();
        });
        
        // Confirm save recipe
        this.elements.saveRecipeConfirm.addEventListener('click', () => {
            this._saveRecipe();
        });
        
        // Cancel recipe save
        this.elements.cancelSave.addEventListener('click', () => {
            this._closeAllModals();
        });
        
        // Copy recipe button
        this.elements.copyRecipeBtn.addEventListener('click', () => {
            this._copyRecipeToClipboard();
        });
        
        // Export recipes button
        this.elements.exportRecipesBtn.addEventListener('click', () => {
            this._exportRecipes();
        });
        
        // Import recipes input
        this.elements.importRecipesInput.addEventListener('change', (e) => {
            this._importRecipes(e);
        });
        
        // Slider value sync
        this._syncSliderValues();
    }
    
    /**
     * Synchronize values between sliders and number inputs
     * @private
     */
    _syncSliderValues() {
        // Dough weight slider and input
        this._syncSliderWithInput(document.getElementById('dough-weight-slider'), this.elements.doughWeight);
        
        // Hydration slider and input
        this._syncSliderWithInput(this.elements.hydrationSlider, this.elements.hydration);
        
        // Starter hydration slider and input
        this._syncSliderWithInput(this.elements.starterHydrationSlider, this.elements.starterHydration);
        
        // Salt percentage slider and input
        this._syncSliderWithInput(this.elements.saltPercentageSlider, this.elements.saltPercentage);
        
        // Room temperature slider and input
        this._syncSliderWithInput(this.elements.roomTempSlider, this.elements.roomTemp);
    }
    
    /**
     * Synchronize a slider with a number input
     * @param {HTMLElement} slider - The slider element
     * @param {HTMLElement} input - The number input element
     * @private
     */
    _syncSliderWithInput(slider, input) {
        slider.addEventListener('input', () => {
            input.value = slider.value;
            // Trigger change event on input to update calculations
            input.dispatchEvent(new Event('change'));
        });
        
        input.addEventListener('input', () => {
            slider.value = input.value;
            // Make sure changes on direct input also trigger a change event
            if (!slider._changeListenerAdded) {
                slider._changeListenerAdded = true;
                input.addEventListener('change', () => {
                    // Trigger a change event to update the calculator
                    input.dispatchEvent(new Event('change'));
                });
            }
        });
    }
    
    /**
     * Toggle between light and dark theme
     * @private
     */
    _toggleTheme() {
        this._setTheme(!this.state.isDarkTheme);
    }
    
    /**
     * Set the theme to light or dark
     * @param {boolean} isDark - Whether to set dark theme
     * @private
     */
    _setTheme(isDark) {
        this.state.isDarkTheme = isDark;
        
        if (isDark) {
            document.body.classList.add('dark-theme');
            this.elements.themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            document.body.classList.remove('dark-theme');
            this.elements.themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
    }
    
    /**
     * Add a flour item to the advanced flour blend UI
     * @param {string} flourType - The type of flour to add
     * @param {number} percentage - The percentage of the flour
     */
    addAdvancedFlourItem(flourType = 'bread', percentage = 0) {
        const flourItem = document.createElement('div');
        flourItem.className = 'advanced-flour-item';
        
        // Create flour type selector
        const flourSelect = document.createElement('select');
        flourSelect.className = 'flour-type-select';
        
        // Add options for flour types
        this.state.flourTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name;
            flourSelect.appendChild(option);
        });
        
        // Set selected flour type
        flourSelect.value = flourType;
        
        // Create percentage input
        const percentContainer = document.createElement('div');
        percentContainer.className = 'slider-with-value';
        
        const percentSlider = document.createElement('input');
        percentSlider.type = 'range';
        percentSlider.min = '0';
        percentSlider.max = '100';
        percentSlider.value = percentage;
        percentSlider.step = '5';
        percentSlider.className = 'advanced-flour-slider';
        
        const percentInput = document.createElement('input');
        percentInput.type = 'number';
        percentInput.min = '0';
        percentInput.max = '100';
        percentInput.value = percentage;
        percentInput.step = '5';
        percentInput.className = 'advanced-flour-percent';
        
        const percentSign = document.createElement('span');
        percentSign.textContent = '%';
        
        percentContainer.appendChild(percentSlider);
        percentContainer.appendChild(percentInput);
        percentContainer.appendChild(percentSign);
        
        // Create remove button
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.addEventListener('click', () => {
            flourItem.remove();
            // Trigger recalculation
            this._normalizeFlourPercentages();
        });
        
        // Sync slider and input
        this._syncSliderWithInput(percentSlider, percentInput);
        
        // Add change event listeners to recalculate percentages
        percentInput.addEventListener('change', () => {
            this._normalizeFlourPercentages();
        });
        
        flourSelect.addEventListener('change', () => {
            // Trigger recalculation
            this._normalizeFlourPercentages();
        });
        
        // Append elements to the flour item
        flourItem.appendChild(flourSelect);
        flourItem.appendChild(percentContainer);
        flourItem.appendChild(removeBtn);
        
        // Add to container
        this.elements.flourItemsContainer.appendChild(flourItem);
    }
    
    /**
     * Normalize flour percentages to total 100%
     * @private
     */
    _normalizeFlourPercentages() {
        // For advanced mode
        let total = 0;
        const percentInputs = Array.from(document.querySelectorAll('.advanced-flour-percent'));
        
        // Calculate total
        percentInputs.forEach(input => {
            total += parseFloat(input.value) || 0;
        });
        
        // If total is not 0, normalize
        if (total > 0) {
            const factor = 100 / total;
            percentInputs.forEach(input => {
                const newValue = Math.round((parseFloat(input.value) || 0) * factor);
                input.value = newValue;
                
                // Update corresponding slider
                const slider = input.previousElementSibling;
                if (slider && slider.type === 'range') {
                    slider.value = newValue;
                }
            });
        }
    }
    
    /**
     * Get the current flour blend from the UI
     * @returns {Array} Array of flour objects with type and percentage
     */
    getFlourBlend() {
        // Get advanced flour blend
        const blend = [];
        const flourItems = this.elements.flourItemsContainer.querySelectorAll('.advanced-flour-item');
        
        flourItems.forEach(item => {
            const flourSelect = item.querySelector('.flour-type-select');
            const percentInput = item.querySelector('.advanced-flour-percent');
            
            const flourType = flourSelect.value;
            const percentage = parseFloat(percentInput.value) || 0;
            
            if (percentage > 0) {
                blend.push({
                    type: flourType,
                    percentage: percentage
                });
            }
        });
        
        return blend;
    }
    
    /**
     * Update the recipe display with calculated values
     * @param {Object} recipe - The recipe object with calculated values
     */
    updateRecipeDisplay(recipe) {
        // Update result values
        this.elements.resultDoughWeight.textContent = Math.round(recipe.totalDoughWeight) + 'g';
        this.elements.resultHydration.textContent = recipe.actualHydration + '%';
        this.elements.resultFlour.textContent = Math.round(recipe.totalFlour) + 'g';
        
        // Update new "to add" values and starter components
        const flourToAddElement = document.getElementById('result-flour-to-add');
        if (flourToAddElement) {
            flourToAddElement.textContent = Math.round(recipe.flourToAdd) + 'g';
        }
        
        this.elements.resultWater.textContent = Math.round(recipe.totalWater) + 'g';
        
        const waterToAddElement = document.getElementById('result-water-to-add');
        if (waterToAddElement) {
            waterToAddElement.textContent = Math.round(recipe.waterToAdd) + 'g';
        }
        
        this.elements.resultStarter.textContent = Math.round(recipe.starterAmount) + 'g';
        
        const starterFlourElement = document.getElementById('result-starter-flour');
        if (starterFlourElement) {
            starterFlourElement.textContent = Math.round(recipe.starterFlour) + 'g';
        }
        
        const starterWaterElement = document.getElementById('result-starter-water');
        if (starterWaterElement) {
            starterWaterElement.textContent = Math.round(recipe.starterWater) + 'g';
        }
        
        this.elements.resultSalt.textContent = recipe.salt + 'g';
        
        // Update flour breakdown
        this.elements.flourBreakdownList.innerHTML = '';
        recipe.flourBreakdown.forEach(flour => {
            const flourName = this._getFlourName(flour.type);
            const li = document.createElement('li');
            li.innerHTML = `<span>${flourName}:</span> <span>${Math.round(flour.amount)}g (${flour.percentage}%)</span>`;
            this.elements.flourBreakdownList.appendChild(li);
        });
    }
    
    /**
     * Get a human-readable flour name
     * @param {string} flourType - The flour type ID
     * @returns {string} The readable flour name
     * @private
     */
    _getFlourName(flourType) {
        const flour = this.state.flourTypes.find(f => f.id === flourType);
        return flour ? flour.name : flourType;
    }
    
    /**
     * Update the timeline display
     * @param {Array} timeline - Array of timeline steps
     */
    updateTimelineDisplay(timeline) {
        this.elements.timelineSteps.innerHTML = '';
        
        timeline.forEach(step => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="timeline-step-header">
                    <strong>${step.step}</strong>
                    <span>${step.date} ${step.time}</span>
                </div>
                <p>${step.description}</p>
            `;
            this.elements.timelineSteps.appendChild(li);
        });
    }
    
    /**
     * Update the recipes list display
     * @param {Object} recipes - Object containing all recipes
     */
    updateRecipesDisplay(recipes) {
        const recipeKeys = Object.keys(recipes);
        
        // Show or hide no recipes message
        if (recipeKeys.length === 0) {
            this.elements.noRecipesMessage.style.display = 'block';
            this.elements.recipesContainer.innerHTML = '';
            return;
        }
        
        this.elements.noRecipesMessage.style.display = 'none';
        this.elements.recipesContainer.innerHTML = '';
        
        // Sort recipes by date (newest first)
        recipeKeys.sort((a, b) => new Date(recipes[b].date) - new Date(recipes[a].date));
        
        // Create recipe cards
        recipeKeys.forEach(id => {
            const recipe = recipes[id];
            const date = new Date(recipe.date).toLocaleDateString();
            
            const recipeCard = document.createElement('div');
            recipeCard.className = 'recipe-card';
            recipeCard.dataset.id = id;
            
            // Get recipe details
            const settings = recipe.recipe.settings;
            const hydration = Math.round(settings.hydration);
            const flourTypes = settings.flourBlend.map(flour => this._getFlourName(flour.type)).join(', ');
            
            recipeCard.innerHTML = `
                <div class="recipe-card-header">
                    <span class="recipe-card-title">${recipe.name}</span>
                    <span class="recipe-card-date">${date}</span>
                </div>
                <div class="recipe-card-details">
                    <span class="recipe-card-detail">${Math.round(settings.doughWeight)}g</span>
                    <span class="recipe-card-detail">${hydration}% hydration</span>
                </div>
                <div class="recipe-card-actions">
                    <button class="load-recipe secondary" data-id="${id}">Load</button>
                    <button class="delete-recipe secondary" data-id="${id}">Delete</button>
                </div>
            `;
            
            // Add event listeners to buttons
            recipeCard.querySelector('.load-recipe').addEventListener('click', (e) => {
                e.stopPropagation();
                this._loadRecipe(id);
            });
            
            recipeCard.querySelector('.delete-recipe').addEventListener('click', (e) => {
                e.stopPropagation();
                this._deleteRecipe(id);
            });
            
            this.elements.recipesContainer.appendChild(recipeCard);
        });
    }
    
    /**
     * Open the recipe modal
     * @private
     */
    _openRecipeModal() {
        // Clear previous values
        this.elements.recipeName.value = '';
        this.elements.recipeNotes.value = '';
        this.state.editingRecipeId = null;
        
        // Show modal
        this.elements.recipeModal.style.display = 'flex';
    }
    
    /**
     * Open the flour blend modal
     * @private
     */
    _openFlourModal() {
        // Clear previous values
        this.elements.blendName.value = '';
        
        // Show modal
        this.elements.flourModal.style.display = 'flex';
    }
    
    /**
     * Close all modals
     * @private
     */
    _closeAllModals() {
        this.elements.recipeModal.style.display = 'none';
        this.elements.flourModal.style.display = 'none';
    }
    
    /**
     * Save the current recipe
     * @private
     */
    _saveRecipe() {
        const name = this.elements.recipeName.value.trim();
        const notes = this.elements.recipeNotes.value.trim();
        
        if (!name) {
            alert('Please enter a formula name');
            return;
        }
        
        // Close modal
        this._closeAllModals();
    }
    
    /**
     * Save the current flour blend
     * @private
     */
    _saveFlourBlend() {
        const name = this.elements.blendName.value.trim();
        
        if (!name) {
            alert('Please enter a blend name');
            return;
        }
        
        // Close modal
        this._closeAllModals();
    }
    
    /**
     * Load a recipe
     * @param {string} recipeId - The ID of the recipe to load
     * @private
     */
    _loadRecipe(recipeId) {
        // Implementation will be added in app.js
    }
    
    /**
     * Delete a recipe
     * @param {string} recipeId - The ID of the recipe to delete
     * @private
     */
    _deleteRecipe(recipeId) {
        if (confirm('Are you sure you want to delete this formula?')) {
            // Implementation will be added in app.js
        }
    }
    
    /**
     * Copy the current recipe to clipboard
     * @private
     */
    _copyRecipeToClipboard() {
        // Implementation will be added in app.js
    }
    
    /**
     * Export recipes to a file
     * @private
     */
    _exportRecipes() {
        // Implementation will be added in app.js
    }
    
    /**
     * Import recipes from a file
     * @param {Event} event - The file input change event
     * @private
     */
    _importRecipes(event) {
        // Implementation will be added in app.js
    }
    
    // Update to show active anchor point
    updateActiveAnchor(anchorPoint) {
        if (this.elements.currentAnchor) {
            this.elements.currentAnchor.textContent = anchorPoint.replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase());
        }
    }
    
    // Initialize temperature unit toggle
    initTemperatureToggle() {
        if (this.elements.tempUnitToggle) {
            this.elements.tempUnitToggle.textContent = this.state.temperatureUnit;
            
            this.elements.tempUnitToggle.addEventListener('click', () => {
                const currentTemp = parseFloat(this.elements.roomTemp.value) || 0;
                
                if (this.state.temperatureUnit === 'C') {
                    // Convert to Fahrenheit
                    this.state.temperatureUnit = 'F';
                    this.elements.roomTemp.value = Math.round((currentTemp * 9/5) + 32);
                } else {
                    // Convert to Celsius
                    this.state.temperatureUnit = 'C';
                    this.elements.roomTemp.value = Math.round((currentTemp - 32) * 5/9);
                }
                
                this.elements.tempUnitToggle.textContent = this.state.temperatureUnit;
                
                // Trigger temp change event
                const event = new Event('input');
                this.elements.roomTemp.dispatchEvent(event);
            });
        }
    }
    
    // Get temperature in Celsius regardless of display unit
    getTemperatureInCelsius() {
        const displayedTemp = parseFloat(this.elements.roomTemp.value) || 0;
        if (this.state.temperatureUnit === 'F') {
            return (displayedTemp - 32) * 5/9;
        }
        return displayedTemp;
    }
    
    // Initialize timeline toggle
    initTimelineToggle() {
        if (this.elements.timelineToggle && this.elements.timelineContent) {
            this.elements.timelineToggle.addEventListener('click', () => {
                this.state.timelineCollapsed = !this.state.timelineCollapsed;
                this.elements.timelineContent.classList.toggle('collapsed', this.state.timelineCollapsed);
                this.elements.timelineToggle.classList.toggle('collapsed', this.state.timelineCollapsed);
                
                // Update icon (assuming font-awesome or similar)
                const iconElement = this.elements.timelineToggle.querySelector('i');
                if (iconElement) {
                    if (this.state.timelineCollapsed) {
                        iconElement.className = 'fas fa-chevron-down';
                    } else {
                        iconElement.className = 'fas fa-chevron-up';
                    }
                }
            });
        }
    }
    
    // Initialize input field highlighting for active anchor
    initFieldHighlighting() {
        const fieldGroups = {
            'doughWeight': this.elements.doughWeightGroup,
            'flourWeight': this.elements.flourWeightGroup,
            'hydration': this.elements.hydrationGroup,
            'starter': this.elements.starterGroup,
            'salt': this.elements.saltGroup
        };
        
        // Add event listeners to highlight active fields
        Object.entries(fieldGroups).forEach(([key, group]) => {
            if (!group) return;
            const inputs = group.querySelectorAll('input');
            
            inputs.forEach(input => {
                input.addEventListener('focus', () => {
                    // Remove active class from all groups
                    Object.values(fieldGroups).forEach(g => {
                        if (g) g.classList.remove('input-field-active');
                    });
                    
                    // Add active class to current group
                    group.classList.add('input-field-active');
                    
                    // Set this field as the active anchor point
                    if (key !== 'salt') { // Salt shouldn't be an anchor point
                        sourdoughCalculator.updateSetting('anchorPoint', key);
                        this.updateActiveAnchor(key);
                        
                        // Update highlight class on the actual group
                        document.querySelectorAll('.input-group').forEach(g => {
                            g.classList.remove('anchor-active');
                        });
                        group.classList.add('anchor-active');
                    }
                });
            });
        });
    }
}

// Export UI object
const sourdoughUI = new SourdoughUI();