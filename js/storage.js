/**
 * Sourdough Storage Module
 * Handles saving, loading, exporting, and importing of recipes using localStorage
 */

class SourdoughStorage {
    constructor() {
        // Define both old and new storage keys for backwards compatibility
        this.oldStorageKey = 'sourdough_recipes';
        this.oldBlendStorageKey = 'sourdough_flour_blends';
        
        // New storage keys
        this.storageKey = 'dough_formulator_recipes';
        this.blendStorageKey = 'dough_formulator_flour_blends';
        
        // Migrate data from old keys if needed
        this._migrateData();
    }
    
    /**
     * Migrate data from old storage keys to new ones
     * @private
     */
    _migrateData() {
        // Check if old data exists and new data doesn't
        const oldRecipes = localStorage.getItem(this.oldStorageKey);
        const oldBlends = localStorage.getItem(this.oldBlendStorageKey);
        
        // Migrate recipes if needed
        if (oldRecipes && !localStorage.getItem(this.storageKey)) {
            localStorage.setItem(this.storageKey, oldRecipes);
        }
        
        // Migrate blends if needed
        if (oldBlends && !localStorage.getItem(this.blendStorageKey)) {
            localStorage.setItem(this.blendStorageKey, oldBlends);
        }
    }
    
    /**
     * Save a recipe to localStorage
     * @param {Object} recipe - The recipe to save
     * @param {string} name - The recipe name
     * @param {string} notes - Optional recipe notes
     * @returns {string} The ID of the saved recipe
     */
    saveRecipe(recipe, name, notes = '') {
        const recipes = this.getAllRecipes();
        const recipeId = 'recipe_' + Date.now();
        
        recipes[recipeId] = {
            id: recipeId,
            name: name,
            notes: notes,
            date: new Date().toISOString(),
            recipe: recipe
        };
        
        localStorage.setItem(this.storageKey, JSON.stringify(recipes));
        return recipeId;
    }
    
    /**
     * Update an existing recipe
     * @param {string} recipeId - The recipe ID to update
     * @param {Object} recipe - The updated recipe
     * @param {string} name - The updated name
     * @param {string} notes - Updated notes
     * @returns {boolean} Success status
     */
    updateRecipe(recipeId, recipe, name, notes = '') {
        const recipes = this.getAllRecipes();
        
        // Check if recipe exists
        if (!recipes[recipeId]) {
            return false;
        }
        
        // Update recipe
        recipes[recipeId] = {
            ...recipes[recipeId],
            name: name,
            notes: notes,
            date: new Date().toISOString(), // Update date
            recipe: recipe
        };
        
        // Save to localStorage
        localStorage.setItem(this.storageKey, JSON.stringify(recipes));
        
        return true;
    }
    
    /**
     * Load a recipe by ID
     * @param {string} recipeId - The ID of the recipe to load
     * @returns {Object|null} The recipe or null if not found
     */
    loadRecipe(recipeId) {
        const recipes = this.getAllRecipes();
        return recipes[recipeId] || null;
    }
    
    /**
     * Delete a recipe by ID
     * @param {string} recipeId - The ID of the recipe to delete
     * @returns {boolean} Success status
     */
    deleteRecipe(recipeId) {
        const recipes = this.getAllRecipes();
        
        if (recipes[recipeId]) {
            delete recipes[recipeId];
            localStorage.setItem(this.storageKey, JSON.stringify(recipes));
            return true;
        }
        
        return false;
    }
    
    /**
     * Get all saved recipes
     * @returns {Object} Object containing all recipes
     */
    getAllRecipes() {
        // Try to get recipes from new storage key first
        let recipesJson = localStorage.getItem(this.storageKey);
        
        // If not found, try old key as fallback
        if (!recipesJson) {
            recipesJson = localStorage.getItem(this.oldStorageKey);
            // If found in old key, migrate it
            if (recipesJson) {
                localStorage.setItem(this.storageKey, recipesJson);
            }
        }
        
        return recipesJson ? JSON.parse(recipesJson) : {};
    }
    
    /**
     * Export all recipes to a JSON file
     * @returns {string} JSON string of all recipes
     */
    exportRecipes() {
        const recipes = this.getAllRecipes();
        return JSON.stringify(recipes, null, 2);
    }
    
    /**
     * Import recipes from a JSON file
     * @param {string} jsonData - JSON string containing recipes
     * @param {boolean} merge - Whether to merge with existing recipes or replace
     * @returns {number} Number of recipes imported
     */
    importRecipes(jsonData, merge = true) {
        try {
            // Parse the JSON data
            const importedRecipes = JSON.parse(jsonData);
            
            // Validate the format
            if (typeof importedRecipes !== 'object') {
                throw new Error('Invalid recipe format');
            }
            
            // Get existing recipes if merging
            let recipes = merge ? this.getAllRecipes() : {};
            
            // Add imported recipes, overwriting any with same ID
            let count = 0;
            for (const [id, recipe] of Object.entries(importedRecipes)) {
                // Ensure each recipe has required fields
                if (!recipe.name || !recipe.recipe) {
                    console.warn(`Skipping invalid recipe: ${id}`);
                    continue;
                }
                
                // Add or overwrite recipe
                recipes[id] = recipe;
                count++;
            }
            
            // Save to localStorage
            localStorage.setItem(this.storageKey, JSON.stringify(recipes));
            
            return count;
        } catch (error) {
            console.error('Error importing recipes:', error);
            throw error;
        }
    }
    
    /**
     * Save a flour blend to localStorage
     * @param {Array} blend - The flour blend to save
     * @param {string} name - The blend name
     * @returns {string} The ID of the saved blend
     */
    saveFlourBlend(blend, name) {
        const blends = this.getAllFlourBlends();
        const blendId = 'blend_' + Date.now();
        
        blends[blendId] = {
            id: blendId,
            name: name,
            date: new Date().toISOString(),
            blend: blend
        };
        
        localStorage.setItem(this.blendStorageKey, JSON.stringify(blends));
        return blendId;
    }
    
    /**
     * Get all saved flour blends
     * @returns {Object} Object containing all flour blends
     */
    getAllFlourBlends() {
        // Try to get blends from new storage key first
        let blendsJson = localStorage.getItem(this.blendStorageKey);
        
        // If not found, try old key as fallback
        if (!blendsJson) {
            blendsJson = localStorage.getItem(this.oldBlendStorageKey);
            // If found in old key, migrate it
            if (blendsJson) {
                localStorage.setItem(this.blendStorageKey, blendsJson);
            }
        }
        
        return blendsJson ? JSON.parse(blendsJson) : {};
    }
    
    /**
     * Delete a flour blend by ID
     * @param {string} blendId - The ID of the blend to delete
     * @returns {boolean} Success status
     */
    deleteFlourBlend(blendId) {
        const blends = this.getAllFlourBlends();
        
        if (blends[blendId]) {
            delete blends[blendId];
            localStorage.setItem(this.blendStorageKey, JSON.stringify(blends));
            return true;
        }
        
        return false;
    }
    
    /**
     * Clear all saved data (recipes and blends)
     * Use with caution!
     */
    clearAllData() {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.blendStorageKey);
    }
}

// Export storage object
const sourdoughStorage = new SourdoughStorage();