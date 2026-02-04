/**
 * DOUGH_FORMULATOR - Main Application
 * Connects UI elements to the calculator
 */

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

/**
 * Initialize the application
 */
function initApp() {
    // Initialize theme
    initTheme();

    // Set up all event listeners
    initSliders();
    initAdjustButtons();
    initToggles();
    initBakingControls();
    initActions();
    initModal();

    // Load saved recipes
    renderSavedRecipes();

    // Initial UI update
    updateUI();
}

/**
 * Initialize theme toggle
 */
function initTheme() {
    const themeBtn = document.getElementById('theme-toggle');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Check for saved preference or system preference
    const savedTheme = localStorage.getItem('dough_formulator_theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (prefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('dough_formulator_theme', next);
    });
}

/**
 * Initialize all sliders
 */
function initSliders() {
    const sliderMap = {
        'total-flour': { key: 'totalFlour', display: 'total-flour-display', suffix: 'g' },
        'hydration': { key: 'hydration', display: 'hydration-display', suffix: '%' },
        'starter': { key: 'starter', display: 'starter-display', suffix: 'g' },
        'starter-hydration': { key: 'starterHydration', display: 'starter-hydration-display', suffix: '%' },
        'salt-pct': { key: 'saltPct', display: 'salt-pct-display', suffix: '%', decimals: 1 },
        'main-flour-pct': { key: 'mainFlourPct', display: 'main-flour-pct-display', suffix: '%' },
        'num-loaves': { key: 'numLoaves', display: 'num-loaves-display', suffix: '' },
        'bake-temp-1': { key: 'bakeTemp1', display: 'bake-temp-1-display', suffix: '°', isTemp: true },
        'bake-time-1': { key: 'bakeTime1', display: 'bake-time-1-display', suffix: ' min' },
        'bake-temp-2': { key: 'bakeTemp2', display: 'bake-temp-2-display', suffix: '°', isTemp: true },
        'bake-time-2': { key: 'bakeTime2', display: 'bake-time-2-display', suffix: ' min' }
    };

    for (const [sliderId, config] of Object.entries(sliderMap)) {
        const slider = document.getElementById(sliderId);
        if (!slider) continue;

        slider.addEventListener('input', () => {
            let value = parseFloat(slider.value);

            // Update calculator
            calculator.update(config.key, value);

            // Update display
            updateUI();
        });
    }
}

/**
 * Initialize +/- adjustment buttons
 */
function initAdjustButtons() {
    document.querySelectorAll('.adjust-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            const delta = parseFloat(btn.dataset.delta);
            const slider = document.getElementById(target);

            if (!slider) return;

            let newValue = parseFloat(slider.value) + delta;
            newValue = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), newValue));
            slider.value = newValue;

            // Trigger the slider's input event
            slider.dispatchEvent(new Event('input'));
        });
    });
}

/**
 * Initialize toggle switches
 */
function initToggles() {
    // Two flour toggle
    const twoFlourToggle = document.getElementById('two-flour-toggle');
    const flourBlendCard = document.getElementById('flour-blend-card');

    twoFlourToggle.addEventListener('change', () => {
        calculator.update('useTwoFlours', twoFlourToggle.checked);
        flourBlendCard.style.display = twoFlourToggle.checked ? 'block' : 'none';
        updateUI();
    });
}

/**
 * Initialize baking controls
 */
function initBakingControls() {
    const tempUnitBtn = document.getElementById('temp-unit-btn');

    tempUnitBtn.addEventListener('click', () => {
        const newUnit = calculator.toggleTempUnit();
        tempUnitBtn.textContent = `Switch to °${newUnit === 'F' ? 'C' : 'F'}`;

        // Update slider ranges for temperature
        updateTempSliderRanges(newUnit);
        updateUI();
    });
}

/**
 * Update temperature slider min/max based on unit
 */
function updateTempSliderRanges(unit) {
    const temp1 = document.getElementById('bake-temp-1');
    const temp2 = document.getElementById('bake-temp-2');

    if (unit === 'C') {
        temp1.min = 200; temp1.max = 260;
        temp2.min = 175; temp2.max = 245;
    } else {
        temp1.min = 400; temp1.max = 500;
        temp2.min = 350; temp2.max = 475;
    }
}

/**
 * Initialize action buttons
 */
function initActions() {
    // Save button
    document.getElementById('save-btn').addEventListener('click', () => {
        const modal = document.getElementById('save-modal');
        const nameInput = document.getElementById('save-recipe-name');
        nameInput.value = document.getElementById('recipe-name').value;
        modal.classList.add('active');
        nameInput.focus();
    });

    // Copy button
    document.getElementById('copy-btn').addEventListener('click', copyToClipboard);

    // Export button
    document.getElementById('export-btn').addEventListener('click', exportRecipes);

    // Import input
    document.getElementById('import-input').addEventListener('change', importRecipes);
}

/**
 * Initialize save modal
 */
function initModal() {
    const modal = document.getElementById('save-modal');
    const confirmBtn = document.getElementById('save-confirm');
    const cancelBtn = document.getElementById('save-cancel');

    confirmBtn.addEventListener('click', () => {
        const name = document.getElementById('save-recipe-name').value.trim();
        const notes = document.getElementById('save-recipe-notes').value.trim();

        if (!name) {
            showToast('Please enter a recipe name');
            return;
        }

        // Save the recipe
        const recipeData = calculator.exportRecipe();
        storage.saveRecipe(recipeData, name, notes);

        // Update UI
        document.getElementById('recipe-name').value = name;
        document.getElementById('recipe-status').textContent = 'Saved';
        renderSavedRecipes();
        modal.classList.remove('active');
        showToast('Recipe saved!');
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

/**
 * Update all UI displays based on calculator state
 */
function updateUI() {
    const state = calculator.getState();
    const results = calculator.getResults();

    // Update slider values and displays
    setSliderAndDisplay('total-flour', state.totalFlour, `${state.totalFlour}g`);
    setSliderAndDisplay('hydration', state.hydration, `${state.hydration}%`);
    setSliderAndDisplay('starter', state.starter, `${state.starter}g`);
    setSliderAndDisplay('starter-hydration', state.starterHydration, `${state.starterHydration}%`);
    setSliderAndDisplay('salt-pct', state.saltPct, `${state.saltPct.toFixed(1)}%`);
    setSliderAndDisplay('main-flour-pct', state.mainFlourPct, `${state.mainFlourPct}%`);
    setSliderAndDisplay('num-loaves', state.numLoaves, `${state.numLoaves}`);

    // Baking displays
    const unit = state.tempUnit;
    setSliderAndDisplay('bake-temp-1', state.bakeTemp1, `${state.bakeTemp1}°${unit}`);
    setSliderAndDisplay('bake-time-1', state.bakeTime1, `${state.bakeTime1} min`);
    setSliderAndDisplay('bake-temp-2', state.bakeTemp2, `${state.bakeTemp2}°${unit}`);
    setSliderAndDisplay('bake-time-2', state.bakeTime2, `${state.bakeTime2} min`);

    // Water display (under hydration)
    document.getElementById('water-display').textContent = `${results.totalWater}g`;

    // Salt display (under salt pct)
    document.getElementById('salt-display').textContent = `${results.salt}g`;

    // Starter percentages
    document.getElementById('starter-flour-pct').textContent = `(${results.starterFlourPct}% of flour)`;
    document.getElementById('starter-total-pct').textContent = `(${results.starterTotalPct}% of total)`;

    // Flour split display
    document.getElementById('main-flour-display').textContent = `${results.mainFlour}g`;
    document.getElementById('second-flour-display').textContent = `${results.secondFlour}g`;

    // Results card
    document.getElementById('total-dough-display').textContent = `${results.totalDough}g`;
    document.getElementById('loaf-weight-display').textContent = `${results.loafWeight}g`;
    document.getElementById('flour-to-add-display').textContent = `${results.flourToAdd}g`;
    document.getElementById('water-to-add-display').textContent = `${results.waterToAdd}g`;
    document.getElementById('result-starter-display').textContent = `${state.starter}g`;
    document.getElementById('result-salt-display').textContent = `${results.salt}g`;
}

/**
 * Helper to set slider value and display text
 */
function setSliderAndDisplay(sliderId, value, displayText) {
    const slider = document.getElementById(sliderId);
    const display = document.getElementById(sliderId + '-display');

    if (slider) slider.value = value;
    if (display) display.textContent = displayText;
}

/**
 * Copy recipe to clipboard
 */
function copyToClipboard() {
    const state = calculator.getState();
    const results = calculator.getResults();
    const name = document.getElementById('recipe-name').value;

    let text = `${name}\n`;
    text += `${'='.repeat(name.length)}\n\n`;
    text += `Total Dough: ${results.totalDough}g\n`;
    text += `Loaf Weight: ${results.loafWeight}g (${state.numLoaves} loaves)\n`;
    text += `Hydration: ${state.hydration}%\n\n`;
    text += `INGREDIENTS:\n`;
    text += `- Flour: ${results.flourToAdd}g\n`;
    text += `- Water: ${results.waterToAdd}g\n`;
    text += `- Starter: ${state.starter}g (${state.starterHydration}% hydration)\n`;
    text += `- Salt: ${results.salt}g (${state.saltPct}%)\n\n`;
    text += `BAKING:\n`;
    text += `- ${state.bakeTemp1}°${state.tempUnit} for ${state.bakeTime1} min\n`;
    text += `- ${state.bakeTemp2}°${state.tempUnit} for ${state.bakeTime2} min\n`;

    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!');
    }).catch(() => {
        showToast('Failed to copy');
    });
}

/**
 * Export all recipes to JSON file
 */
function exportRecipes() {
    const data = storage.exportRecipes();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'dough_formulator_recipes.json';
    a.click();

    URL.revokeObjectURL(url);
    showToast('Recipes exported!');
}

/**
 * Import recipes from JSON file
 */
function importRecipes(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const count = storage.importRecipes(event.target.result);
            renderSavedRecipes();
            showToast(`Imported ${count} recipe(s)!`);
        } catch (error) {
            showToast('Failed to import recipes');
        }
    };
    reader.readAsText(file);

    // Reset input
    e.target.value = '';
}

/**
 * Render saved recipes list
 */
function renderSavedRecipes() {
    const container = document.getElementById('saved-recipes-list');
    const recipes = storage.getRecipesList();

    if (recipes.length === 0) {
        container.innerHTML = '<p class="empty-state">No saved recipes yet</p>';
        return;
    }

    container.innerHTML = recipes.map(recipe => {
        const date = new Date(recipe.date).toLocaleDateString();
        return `
            <div class="saved-recipe-item" data-id="${recipe.id}">
                <div class="saved-recipe-info" onclick="loadRecipe('${recipe.id}')">
                    <div class="saved-recipe-name">${escapeHtml(recipe.name)}</div>
                    <div class="saved-recipe-meta">${date}</div>
                </div>
                <div class="saved-recipe-actions">
                    <button class="load-btn" onclick="loadRecipe('${recipe.id}')">↵</button>
                    <button class="delete-btn" onclick="deleteRecipe('${recipe.id}')">×</button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Load a saved recipe
 */
function loadRecipe(id) {
    const recipe = storage.loadRecipe(id);
    if (!recipe) {
        showToast('Recipe not found');
        return;
    }

    // Load into calculator
    calculator.loadRecipe(recipe.data);

    // Update UI
    document.getElementById('recipe-name').value = recipe.name;
    document.getElementById('recipe-status').textContent = 'Saved';

    // Update two flour toggle state
    const twoFlourToggle = document.getElementById('two-flour-toggle');
    const flourBlendCard = document.getElementById('flour-blend-card');
    twoFlourToggle.checked = calculator.getState().useTwoFlours;
    flourBlendCard.style.display = twoFlourToggle.checked ? 'block' : 'none';

    updateUI();
    showToast(`Loaded: ${recipe.name}`);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Delete a saved recipe
 */
function deleteRecipe(id) {
    if (confirm('Delete this recipe?')) {
        storage.deleteRecipe(id);
        renderSavedRecipes();
        showToast('Recipe deleted');
    }
}

/**
 * Show a toast notification
 */
function showToast(message) {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Remove after delay
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
