/**
 * Sourdough 1-2-3 Calculator - Main Application Module
 * Integrates all components and initializes the application
 */

const MAX_TIMELINE_STEPS = 20;

document.addEventListener('DOMContentLoaded', () => {
    // Set document title to match new branding
    document.title = 'DOUGH_FORMULATOR';
    
    // Initialize calculator and timeline
    sourdoughTimeline.setCalculator(sourdoughCalculator);
    
    // Set up event listeners for inputs
    initializeEventListeners();
    
    // Load saved flour blends
    loadSavedFlourBlends();
    
    // Load saved recipes
    loadSavedRecipes();
    
    // Make sure the anchor point is set correctly
    const settings = sourdoughCalculator.getSettings();
    if (!settings.anchorPoint) {
        // Default to flourWeight if anchorPoint isn't set
        sourdoughCalculator.updateSetting('anchorPoint', 'flourWeight');
    }
    
    // Calculate initial recipe
    updateRecipe();
    
    // Generate initial timeline
    updateTimeline();
    
    // Initialize with the correct anchor highlighted
    updateInputVisibility();
    
    // Initialize lock icons and classes
    updateLockIcons();
    
    // Initialize lock toggle functionality
    initLockToggles();
});

/**
 * Initialize event listeners for calculator inputs
 */
function initializeEventListeners() {
    // Dough weight change
    const doughWeightInput = document.getElementById('dough-weight');
    doughWeightInput.addEventListener('change', function() {
        // Lock dough weight when user changes it
        sourdoughCalculator.lockValue('doughWeight', true);
        sourdoughCalculator.updateSetting('doughWeight', parseFloat(this.value));
        updateInputVisibility();
        updateRecipe();
    });
    
    const doughWeightSlider = document.getElementById('dough-weight-slider');
    if (doughWeightSlider) {
        doughWeightSlider.addEventListener('input', function() {
            doughWeightInput.value = this.value;
            sourdoughCalculator.lockValue('doughWeight', true);
            sourdoughCalculator.updateSetting('doughWeight', parseFloat(this.value));
            updateInputVisibility();
            updateRecipe();
        });
    }
    
    // Also add input event handler for dough weight
    doughWeightInput.addEventListener('input', function() {
        if (doughWeightSlider) doughWeightSlider.value = this.value;
        sourdoughCalculator.lockValue('doughWeight', true);
        sourdoughCalculator.updateSetting('doughWeight', parseFloat(this.value));
        updateInputVisibility();
        updateRecipe();
    });
    
    document.getElementById('dough-weight').addEventListener('focus', function() {
        highlightField('doughWeight');
    });
    
    // Flour weight change
    const flourWeightInput = document.getElementById('flour-weight');
    flourWeightInput.addEventListener('change', function() {
        sourdoughCalculator.lockValue('flourWeight', true);
        sourdoughCalculator.updateSetting('flourWeight', parseFloat(this.value));
        updateInputVisibility();
        updateRecipe();
    });
    
    const flourWeightSlider = document.getElementById('flour-weight-slider');
    if (flourWeightSlider) {
        flourWeightSlider.addEventListener('input', function() {
            flourWeightInput.value = this.value;
            sourdoughCalculator.lockValue('flourWeight', true);
            sourdoughCalculator.updateSetting('flourWeight', parseFloat(this.value));
            updateInputVisibility();
            updateRecipe();
        });
    }
    
    document.getElementById('flour-weight').addEventListener('focus', function() {
        highlightField('flourWeight');
    });
    
    // Hydration change
    const hydrationInput = document.getElementById('hydration');
    const hydrationSlider = document.getElementById('hydration-slider');
    if (hydrationSlider) {
        hydrationSlider.addEventListener('input', function() {
            hydrationInput.value = this.value;
            sourdoughCalculator.lockValue('hydration', true);
            sourdoughCalculator.updateSetting('hydration', parseFloat(this.value));
            updateInputVisibility();
            updateRecipe();
        });
    }
    
    document.getElementById('hydration').addEventListener('focus', function() {
        highlightField('hydration');
    });
    
    // Hydration number input change
    hydrationInput.addEventListener('input', function() {
        if (hydrationSlider) hydrationSlider.value = this.value;
        sourdoughCalculator.lockValue('hydration', true);
        sourdoughCalculator.updateSetting('hydration', parseFloat(this.value));
        updateInputVisibility();
        updateRecipe();
    });
    
    // Starter amount change
    const starterAmountInput = document.getElementById('starter-amount');
    const starterAmountSlider = document.getElementById('starter-amount-slider');
    const starterAmountSliderContainer = document.getElementById('starter-amount-slider-container');

    starterAmountInput.addEventListener('change', function() {
        // Lock starter when user changes it
        sourdoughCalculator.lockValue('starter', true);
        sourdoughCalculator.updateSetting('starter.amount', parseFloat(this.value));
        updateInputVisibility();
        updateRecipe();
    });

    // Add input event listener to starter amount
    starterAmountInput.addEventListener('input', function() {
        if (starterAmountSlider && document.getElementById('starter-unit').value === 'grams') {
            starterAmountSlider.value = this.value;
        }
        sourdoughCalculator.lockValue('starter', true);
        sourdoughCalculator.updateSetting('starter.amount', parseFloat(this.value));
        updateInputVisibility();
        updateRecipe();
    });

    // Add event listener for the starter amount slider
    if (starterAmountSlider) {
        starterAmountSlider.addEventListener('input', function() {
            starterAmountInput.value = this.value;
            sourdoughCalculator.lockValue('starter', true);
            sourdoughCalculator.updateSetting('starter.amount', parseFloat(this.value));
            updateInputVisibility();
            updateRecipe();
        });
    }

    document.getElementById('starter-amount').addEventListener('focus', function() {
        highlightField('starter');
    });
    
    // Starter unit change
    document.getElementById('starter-unit').addEventListener('change', function() {
        const settings = sourdoughCalculator.getSettings();
        const recipe = sourdoughCalculator.getRecipe();
        const newUnit = this.value;
        const oldUnit = settings.starter.unit;
        
        console.log(`[DEBUG] Starter unit change from ${oldUnit} to ${newUnit}`);
        
        // Show/hide starter amount slider based on unit
        if (starterAmountSliderContainer) {
            if (newUnit === 'grams') {
                starterAmountSliderContainer.style.display = 'block';
            } else {
                starterAmountSliderContainer.style.display = 'none';
            }
        }
        
        // Convert the starter amount based on the unit change
        if (newUnit !== oldUnit) {
            const currentAmount = parseFloat(starterAmountInput.value);
            
            if (newUnit === 'percentage' && oldUnit === 'grams') {
                // Convert from grams to percentage of flour
                const percentValue = Math.round((currentAmount / recipe.totalFlour) * 100);
                console.log(`[DEBUG] Converting ${currentAmount}g to ${percentValue}% of flour (${recipe.totalFlour}g)`);
                starterAmountInput.value = percentValue;
                sourdoughCalculator.updateSetting('starter.amount', percentValue);
            } else if (newUnit === 'grams' && oldUnit === 'percentage') {
                // Convert from percentage to grams
                const gramsValue = Math.round(recipe.totalFlour * (currentAmount / 100));
                console.log(`[DEBUG] Converting ${currentAmount}% to ${gramsValue}g of flour (${recipe.totalFlour}g)`);
                starterAmountInput.value = gramsValue;
                sourdoughCalculator.updateSetting('starter.amount', gramsValue);
            }
        }
        
        // Update the unit in the calculator
        sourdoughCalculator.updateSetting('starter.unit', newUnit);
        updateRecipe();
    });
    
    // Starter hydration change
    const starterHydrationInput = document.getElementById('starter-hydration');
    const starterHydrationSlider = document.getElementById('starter-hydration-slider');

    starterHydrationInput.addEventListener('change', function() {
        sourdoughCalculator.updateSetting('starter.hydration', parseFloat(this.value));
        updateRecipe();
    });

    if (starterHydrationSlider) {
        starterHydrationSlider.addEventListener('input', function() {
            starterHydrationInput.value = this.value;
            sourdoughCalculator.updateSetting('starter.hydration', parseFloat(this.value));
            updateRecipe();
        });
    }

    starterHydrationInput.addEventListener('input', function() {
        if (starterHydrationSlider) starterHydrationSlider.value = this.value;
        sourdoughCalculator.updateSetting('starter.hydration', parseFloat(this.value));
        updateRecipe();
    });
    
    // Salt percentage change
    const saltInput = document.getElementById('salt-percentage');
    saltInput.addEventListener('change', function() {
        sourdoughCalculator.updateSetting('salt', parseFloat(this.value));
        updateRecipe();
    });
    
    const saltSlider = document.getElementById('salt-percentage-slider');
    if (saltSlider) {
        saltSlider.addEventListener('input', function() {
            saltInput.value = this.value;
            sourdoughCalculator.updateSetting('salt', parseFloat(this.value));
            updateRecipe();
        });
    }
    
    document.getElementById('salt-percentage').addEventListener('focus', function() {
        highlightField('salt');
    });
    
    // Salt number input change
    saltInput.addEventListener('input', function() {
        if (saltSlider) saltSlider.value = this.value;
        sourdoughCalculator.updateSetting('salt', parseFloat(this.value));
        updateRecipe();
    });
    
    // Timeline mode change
    document.getElementById('timeline-mode').addEventListener('change', function() {
        sourdoughTimeline.updateSetting('mode', this.value);
        updateTimeline();
    });
    
    // Timeline date change
    document.getElementById('timeline-date').addEventListener('change', function() {
        sourdoughTimeline.updateSetting('startTime', this.value);
        updateTimeline();
    });
    
    // Room temperature change
    document.getElementById('room-temp').addEventListener('change', function() {
        sourdoughTimeline.updateSetting('roomTemp', parseFloat(this.value));
        updateTimeline();
    });
    
    // Save recipe button
    document.getElementById('save-recipe-confirm').addEventListener('click', function() {
        saveCurrentRecipe();
    });
    
    // Copy recipe button
    document.getElementById('copy-recipe-btn').addEventListener('click', function() {
        copyRecipeToClipboard();
    });
    
    // Export recipes button
    document.getElementById('export-recipes-btn').addEventListener('click', function() {
        exportRecipes();
    });
    
    // Import recipes input
    document.getElementById('import-recipes-input').addEventListener('change', function(event) {
        importRecipes(event);
    });
    
    // Save flour blend button
    document.getElementById('save-blend-confirm').addEventListener('click', function() {
        saveCurrentFlourBlend();
    });
    
    // Load flour blend preset
    document.getElementById('flour-presets').addEventListener('change', function() {
        if (this.value) {
            loadFlourBlend(this.value);
        }
    });
    
    // Flour weight number input change
    flourWeightInput.addEventListener('input', function() {
        if (flourWeightSlider) flourWeightSlider.value = this.value;
        sourdoughCalculator.lockValue('flourWeight', true);
        sourdoughCalculator.updateSetting('flourWeight', parseFloat(this.value));
        updateInputVisibility();
        updateRecipe();
    });

    const flourItemsContainer = document.getElementById('flour-items-container');
    if (flourItemsContainer) {
        flourItemsContainer.addEventListener('change', function(e) {
            if (
                e.target.classList.contains('advanced-flour-percent') ||
                e.target.classList.contains('advanced-flour-slider') ||
                e.target.classList.contains('flour-type-select')
            ) {
                updateFlourBlend();
            }
        });
    }
}

/**
 * Toggle the lock state for a field
 * @param {string} field - The field to toggle lock state for (e.g., 'doughWeight', 'flourWeight')
 * @returns {void}
 */
function toggleLock(field) {
    // Get current lock state from calculator
    const settings = sourdoughCalculator.getSettings();
    const isCurrentlyLocked = settings.locked[field];
    try {
        // Toggle lock state in calculator
        sourdoughCalculator.lockValue(field, !isCurrentlyLocked);
        // Update UI to reflect new state
        updateLockIcons();
        updateInputVisibility();
        updateRecipe();
        // Log the locked state after the change
        const newSettings = sourdoughCalculator.getSettings();
    } catch (error) {
        // Show a user-friendly error message if too many fields are locked
        alert(error.message || 'Too many fields locked. Please unlock another field first.');
    }
}

/**
 * Convert field name to input element ID
 */
function fieldToInputId(field) {
    const mapping = {
        'doughWeight': 'dough-weight',
        'flourWeight': 'flour-weight',
        'hydration': 'hydration',
        'starter': 'starter-amount',
        'salt': 'salt-percentage'
    };
    return mapping[field];
}

/**
 * Initialize event listeners for lock toggle buttons
 */
function initLockToggles() {
    const lockToggles = document.querySelectorAll('.lock-toggle');
    lockToggles.forEach(toggle => {
        // Only allow lock toggles for doughWeight, flourWeight, hydration, starter
        if (!['doughWeight', 'flourWeight', 'hydration', 'starter'].includes(toggle.dataset.field)) {
            toggle.style.display = 'none';
            return;
        }
        // Clear any existing event handlers by cloning and replacing the element
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        // Add new event listener
        newToggle.addEventListener('click', function(event) {
            const field = this.dataset.field;
            this.classList.add('toggle-animation');
            setTimeout(() => {
                this.classList.remove('toggle-animation');
            }, 300);
            toggleLock(field);
        });
    });
}

/**
 * Update the lock icons to reflect current lock state
 */
function updateLockIcons() {
    const settings = sourdoughCalculator.getSettings();
    const locked = settings.locked;
    
    // Update all lock icons
    Object.entries(locked).forEach(([field, isLocked]) => {
        const toggles = document.querySelectorAll(`.lock-toggle[data-field="${field}"]`);
        
        toggles.forEach(toggle => {
            // Update the toggle button appearance
            if (isLocked) {
                toggle.classList.add('locked');
                toggle.innerHTML = '<i class="fas fa-lock"></i>';
            } else {
                toggle.classList.remove('locked');
                toggle.innerHTML = '<i class="fas fa-unlock"></i>';
            }
            
            // Also update the corresponding input element
            const inputId = fieldToInputId(field);
            if (inputId) {
                const input = document.getElementById(inputId);
                if (input) {
                    if (isLocked) {
                        input.classList.add('locked');
                    } else {
                        input.classList.remove('locked');
                    }
                }
            }
        });
    });
    
    // Update the active locks display
    updateActiveLocksDisplay();
}

/**
 * Update which inputs are visible based on locked state
 */
function updateInputVisibility() {
    const settings = sourdoughCalculator.getSettings();
    const locked = settings.locked;
    // Always show hydration input group
    const hydrationInputGroup = document.querySelector('.input-group:has(#hydration)');
    const hydrationInput = document.getElementById('hydration');
    const hydrationSlider = document.getElementById('hydration-slider');
    let hydrationMsg = document.getElementById('hydration-locked-msg');
    if (!hydrationMsg && hydrationInputGroup) {
        hydrationMsg = document.createElement('div');
        hydrationMsg.id = 'hydration-locked-msg';
        hydrationMsg.style.color = '#e67e22';
        hydrationMsg.style.fontSize = '0.9em';
        hydrationMsg.style.marginTop = '4px';
        hydrationInputGroup.appendChild(hydrationMsg);
    }
    if (hydrationInputGroup) {
        hydrationInputGroup.style.display = 'block';
        if (locked.doughWeight && locked.flourWeight) {
            if (hydrationInput) hydrationInput.disabled = true;
            if (hydrationSlider) hydrationSlider.disabled = true;
            if (hydrationMsg) hydrationMsg.textContent = 'Hydration is determined by locked Dough Weight and Flour Weight.';
        } else {
            if (hydrationInput) hydrationInput.disabled = false;
            if (hydrationSlider) hydrationSlider.disabled = false;
            if (hydrationMsg) hydrationMsg.textContent = '';
        }
    }
}

/**
 * Update the active locks display
 */
function updateActiveLocksDisplay() {
    const settings = sourdoughCalculator.getSettings();
    const locked = settings.locked;
    
    // Get all locked fields
    const lockedFields = Object.entries(locked)
        .filter(([field, isLocked]) => isLocked)
        .map(([field]) => formatFieldName(field));
    
    // Update the display
    const activeLocksDisplay = document.getElementById('active-locks-display');
    if (activeLocksDisplay) {
        if (lockedFields.length === 0) {
            activeLocksDisplay.textContent = 'None';
        } else {
            activeLocksDisplay.textContent = lockedFields.join(', ');
        }
    }
}

/**
 * Format field name for display
 */
function formatFieldName(field) {
    switch (field) {
        case 'doughWeight': return 'Dough Weight';
        case 'flourWeight': return 'Flour Weight';
        case 'hydration': return 'Hydration';
        case 'starter': return 'Starter';
        case 'salt': return 'Salt';
        default: return field;
    }
}

/**
 * Update the recipe calculation and UI
 */
function updateRecipe() {
    // Calculate recipe
    const recipe = sourdoughCalculator.calculate();
    const settings = sourdoughCalculator.getSettings();
    
    // Update UI with calculated values
    sourdoughUI.updateRecipeDisplay(recipe);
    
    // Update all calculator input fields to stay in sync
    // Only update fields that aren't locked
    const locked = settings.locked;
    
    if (!locked.doughWeight) {
        document.getElementById('dough-weight').value = Math.round(recipe.totalDoughWeight);
        // Update slider if it exists
        const doughWeightSlider = document.getElementById('dough-weight-slider');
        if (doughWeightSlider) {
            doughWeightSlider.value = Math.round(recipe.totalDoughWeight);
        }
    }
    
    if (!locked.flourWeight) {
        document.getElementById('flour-weight').value = Math.round(recipe.totalFlour);
        // Update slider if it exists
        const flourWeightSlider = document.getElementById('flour-weight-slider');
        if (flourWeightSlider) {
            flourWeightSlider.value = Math.round(recipe.totalFlour);
        }
    }
    
    if (!locked.hydration) {
        const hydrationValue = recipe.actualHydration;
        document.getElementById('hydration').value = hydrationValue;
        // Only update slider if it exists
        const hydrationSlider = document.getElementById('hydration-slider');
        if (hydrationSlider) {
            hydrationSlider.value = hydrationValue;
        }
    }
    
    if (!locked.starter) {
        document.getElementById('starter-amount').value = Math.round(recipe.starterAmount);
        // Update starter amount slider if the unit is grams
        const starterAmountSlider = document.getElementById('starter-amount-slider');
        if (starterAmountSlider && settings.starter.unit === 'grams') {
            starterAmountSlider.value = Math.round(recipe.starterAmount);
        }
    }
    
    // Always update starter unit (not directly lockable)
    document.getElementById('starter-unit').value = settings.starter.unit;
    
    // Show/hide starter amount slider based on unit
    const starterAmountSliderContainer = document.getElementById('starter-amount-slider-container');
    if (starterAmountSliderContainer) {
        if (settings.starter.unit === 'grams') {
            starterAmountSliderContainer.style.display = 'block';
        } else {
            starterAmountSliderContainer.style.display = 'none';
        }
    }
    
    // Always update starter hydration (not directly lockable)
    document.getElementById('starter-hydration').value = settings.starter.hydration;
    // Only update slider if it exists
    const starterHydrationSlider = document.getElementById('starter-hydration-slider');
    if (starterHydrationSlider) {
        starterHydrationSlider.value = settings.starter.hydration;
    }
    
    // Update salt if not locked
    if (!locked.salt) {
        document.getElementById('salt-percentage').value = settings.salt;
        // Only update slider if it exists
        const saltSlider = document.getElementById('salt-percentage-slider');
        if (saltSlider) {
            saltSlider.value = settings.salt;
        }
    }
    
    // Update timeline
    updateTimeline();
}

/**
 * Update flour blend from UI and recalculate recipe
 */
function updateFlourBlend() {
    // Get flour blend from UI
    const flourBlend = sourdoughUI.getFlourBlend();
    
    // Update calculator
    sourdoughCalculator.updateFlourBlend(flourBlend);
    
    // Update recipe
    updateRecipe();
    
    // Remove the check for currentMode since we only have advanced mode now
    // No need to update simple mode UI elements
}

/**
 * Generate and update the timeline
 */
function updateTimeline() {
    // Generate timeline
    const timeline = sourdoughTimeline.generate();
    
    // Update UI
    sourdoughUI.updateTimelineDisplay(timeline);
}

/**
 * Save the current recipe to localStorage
 */
function saveCurrentRecipe() {
    const recipeName = document.getElementById('recipe-name').value.trim();
    const recipeNotes = document.getElementById('recipe-notes').value.trim();
    
    if (!recipeName) {
        alert('Please enter a recipe name');
        return;
    }
    
    // Create recipe object
    const recipeData = {
        settings: sourdoughCalculator.getSettings(),
        recipe: sourdoughCalculator.getRecipe(),
        timeline: sourdoughTimeline.getTimeline()
    };
    
    // Save recipe
    const recipeId = sourdoughStorage.saveRecipe(recipeData, recipeName, recipeNotes);
    
    // Update recipes display
    loadSavedRecipes();
    
    // Close modal
    document.getElementById('recipe-modal').style.display = 'none';
}

/**
 * Load a recipe by ID
 * @param {string} recipeId - The recipe ID to load
 */
function loadRecipe(recipeId) {
    // Get recipe from storage
    const recipe = sourdoughStorage.loadRecipe(recipeId);
    
    if (recipe && recipe.recipe && recipe.recipe.settings) {
        // Load recipe into calculator
        sourdoughCalculator.loadRecipe(recipe.recipe);
        
        // Update UI values
        updateUIFromSettings(recipe.recipe.settings);
        
        // Update recipe display
        updateRecipe();
        
        // Scroll to calculator
        document.getElementById('calculator').scrollIntoView({ behavior: 'smooth' });
    }
}

/**
 * Delete a recipe by ID
 * @param {string} recipeId - The recipe ID to delete
 */
function deleteRecipe(recipeId) {
    // Delete recipe from storage
    sourdoughStorage.deleteRecipe(recipeId);
    
    // Update recipes display
    loadSavedRecipes();
}

/**
 * Update UI input values from settings
 * @param {Object} settings - Calculator settings
 */
function updateUIFromSettings(settings) {
    // Update locked values
    if (settings.locked) {
        sourdoughCalculator.updateSettings({ locked: settings.locked });
    } else {
        // Backward compatibility - set default locked values
        sourdoughCalculator.updateSettings({ 
            locked: {
                doughWeight: false,
                flourWeight: true,
                hydration: false,
                starter: false,
                salt: false
            }
        });
    }
    
    // Update basic values
    document.getElementById('dough-weight').value = settings.doughWeight;
    // Update dough weight slider if it exists
    const doughWeightSlider = document.getElementById('dough-weight-slider');
    if (doughWeightSlider) {
        doughWeightSlider.value = settings.doughWeight;
    }
    
    document.getElementById('flour-weight').value = settings.flourWeight;
    // Only update slider if it exists
    const flourWeightSlider = document.getElementById('flour-weight-slider');
    if (flourWeightSlider) {
        flourWeightSlider.value = settings.flourWeight;
    }
    
    document.getElementById('hydration').value = settings.hydration;
    
    // Only update slider if it exists
    const hydrationSlider = document.getElementById('hydration-slider');
    if (hydrationSlider) {
        hydrationSlider.value = settings.hydration;
    }
    
    document.getElementById('starter-amount').value = settings.starter.amount;
    document.getElementById('starter-unit').value = settings.starter.unit;
    document.getElementById('starter-hydration').value = settings.starter.hydration;
    
    // Update starter amount slider if in grams mode
    const starterAmountSlider = document.getElementById('starter-amount-slider');
    const starterAmountSliderContainer = document.getElementById('starter-amount-slider-container');
    if (starterAmountSlider && starterAmountSliderContainer) {
        starterAmountSlider.value = settings.starter.amount;
        // Show/hide slider based on unit
        if (settings.starter.unit === 'grams') {
            starterAmountSliderContainer.style.display = 'block';
        } else {
            starterAmountSliderContainer.style.display = 'none';
        }
    }
    
    // Update starter hydration slider if it exists
    const starterHydrationSlider = document.getElementById('starter-hydration-slider');
    if (starterHydrationSlider) {
        starterHydrationSlider.value = settings.starter.hydration;
    }
    
    // Update salt if not locked
    if (!settings.locked.salt) {
        document.getElementById('salt-percentage').value = settings.salt;
        // Only update slider if it exists
        const saltSlider = document.getElementById('salt-percentage-slider');
        if (saltSlider) {
            saltSlider.value = settings.salt;
        }
    }
    
    // Update lock toggle icons
    updateLockIcons();
    
    // Update input visibility based on locked values
    updateInputVisibility();
    
    // Update flour blend
    // Clear and recreate flour inputs
    document.getElementById('flour-items-container').innerHTML = '';

    // Add each flour type
    settings.flourBlend.forEach(flour => {
        sourdoughUI.addAdvancedFlourItem(flour.type, flour.percentage);
    });
}

/**
 * Load saved recipes from storage and update UI
 */
function loadSavedRecipes() {
    const recipes = sourdoughStorage.getAllRecipes();
    sourdoughUI.updateRecipesDisplay(recipes);
    
    // Add event listeners to load and delete buttons
    document.querySelectorAll('.load-recipe').forEach(btn => {
        btn.addEventListener('click', function() {
            loadRecipe(this.dataset.id);
        });
    });
    
    document.querySelectorAll('.delete-recipe').forEach(btn => {
        btn.addEventListener('click', function() {
            if (confirm('Are you sure you want to delete this recipe?')) {
                deleteRecipe(this.dataset.id);
            }
        });
    });
}

/**
 * Save the current flour blend
 */
function saveCurrentFlourBlend() {
    const blendName = document.getElementById('blend-name').value.trim();
    
    if (!blendName) {
        alert('Please enter a blend name');
        return;
    }
    
    // Get flour blend from UI
    const flourBlend = sourdoughUI.getFlourBlend();
    
    // Save to storage
    sourdoughStorage.saveFlourBlend(flourBlend, blendName);
    
    // Update flour presets
    loadSavedFlourBlends();
    
    // Close modal
    document.getElementById('flour-modal').style.display = 'none';
}

/**
 * Load a saved flour blend
 * @param {string} blendId - The blend ID to load
 */
function loadFlourBlend(blendId) {
    const blends = sourdoughStorage.getAllFlourBlends();
    const blend = blends[blendId];
    
    if (blend && blend.blend) {
        // Remove the mode check since we only have one mode now
        
        // Clear container
        document.getElementById('flour-items-container').innerHTML = '';
        
        // Add each flour type
        blend.blend.forEach(flour => {
            sourdoughUI.addAdvancedFlourItem(flour.type, flour.percentage);
        });
        
        // Update recipe
        updateFlourBlend();
    }
}

/**
 * Load saved flour blends and update UI
 */
function loadSavedFlourBlends() {
    const blends = sourdoughStorage.getAllFlourBlends();
    const blendSelect = document.getElementById('flour-presets');
    
    // Clear existing options
    while (blendSelect.options.length > 1) {
        blendSelect.remove(1);
    }
    
    // Sort blends by name
    const sortedBlends = Object.entries(blends).sort((a, b) => a[1].name.localeCompare(b[1].name));
    
    // Add options for each blend
    sortedBlends.forEach(([id, blend]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = blend.name;
        blendSelect.appendChild(option);
    });
}

/**
 * Copy the current recipe to clipboard
 */
function copyRecipeToClipboard() {
    const recipe = sourdoughCalculator.getRecipe();
    const settings = sourdoughCalculator.getSettings();
    
    let recipeText = '=== DOUGH_FORMULATOR ===\n\n';
    
    // Add basic info
    recipeText += `Total Dough Weight: ${Math.round(recipe.totalDoughWeight)}g\n`;
    recipeText += `Hydration: ${recipe.actualHydration}%\n\n`;
    
    // Add ingredients with clarified flour and water amounts
    recipeText += 'INGREDIENTS:\n';
    recipeText += `Total Flour: ${Math.round(recipe.totalFlour)}g\n`;
    recipeText += `Flour to add: ${Math.round(recipe.flourToAdd)}g\n`;
    recipeText += `Total Water: ${Math.round(recipe.totalWater)}g\n`;
    recipeText += `Water to add: ${Math.round(recipe.waterToAdd)}g\n`;
    recipeText += `Starter: ${Math.round(recipe.starterAmount)}g (${settings.starter.hydration}% hydration)\n`;
    recipeText += `  - Contains: ${Math.round(recipe.starterFlour)}g flour, ${Math.round(recipe.starterWater)}g water\n`;
    recipeText += `Salt: ${recipe.salt}g\n\n`;
    
    // Add flour breakdown
    recipeText += 'FLOUR BREAKDOWN:\n';
    recipe.flourBreakdown.forEach(flour => {
        const flourName = sourdoughUI.state.flourTypes.find(f => f.id === flour.type)?.name || flour.type;
        recipeText += `${flourName}: ${Math.round(flour.amount)}g (${flour.percentage}%)\n`;
    });
    
    // Create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = recipeText;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    
    alert('Formula copied to clipboard!');
}

/**
 * Export recipes to a file
 */
function exportRecipes() {
    const recipes = sourdoughStorage.exportRecipes();
    
    // Check if there are recipes
    if (recipes === '{}') {
        alert('No formulas to export');
        return;
    }
    
    // Create download link
    const blob = new Blob([recipes], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dough_formulator_export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Import recipes from a file
 * @param {Event} event - File input change event
 */
function importRecipes(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Read file
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const recipesJson = e.target.result;
            const count = sourdoughStorage.importRecipes(recipesJson);
            
            // Update recipes display
            loadSavedRecipes();
            
            // Clear input
            event.target.value = '';
            
            alert(`Successfully imported ${count} formulas`);
        } catch (error) {
            console.error('Error importing formulas:', error);
            alert('Error importing formulas: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// Add helper methods to sourdoughUI
sourdoughUI._loadRecipe = loadRecipe;
sourdoughUI._deleteRecipe = deleteRecipe;
sourdoughUI._copyRecipeToClipboard = copyRecipeToClipboard;
sourdoughUI._exportRecipes = exportRecipes;
sourdoughUI._importRecipes = importRecipes;
sourdoughUI._saveRecipe = saveCurrentRecipe;
sourdoughUI._saveFlourBlend = saveCurrentFlourBlend; 