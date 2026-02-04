/**
 * DOUGH_FORMULATOR - Storage Module
 * Handles saving, loading, exporting, and importing recipes using localStorage
 */

class Storage {
    constructor() {
        this.storageKey = 'dough_formulator_recipes_v2';
    }

    /**
     * Save a recipe
     */
    saveRecipe(recipeData, name, notes = '') {
        const recipes = this.getAllRecipes();
        const id = 'recipe_' + Date.now();

        recipes[id] = {
            id,
            name,
            notes,
            date: new Date().toISOString(),
            data: recipeData
        };

        localStorage.setItem(this.storageKey, JSON.stringify(recipes));
        return id;
    }

    /**
     * Load a recipe by ID
     */
    loadRecipe(id) {
        const recipes = this.getAllRecipes();
        return recipes[id] || null;
    }

    /**
     * Delete a recipe
     */
    deleteRecipe(id) {
        const recipes = this.getAllRecipes();
        if (recipes[id]) {
            delete recipes[id];
            localStorage.setItem(this.storageKey, JSON.stringify(recipes));
            return true;
        }
        return false;
    }

    /**
     * Get all saved recipes
     */
    getAllRecipes() {
        const json = localStorage.getItem(this.storageKey);
        return json ? JSON.parse(json) : {};
    }

    /**
     * Get recipes as sorted array (newest first)
     */
    getRecipesList() {
        const recipes = this.getAllRecipes();
        return Object.values(recipes).sort((a, b) =>
            new Date(b.date) - new Date(a.date)
        );
    }

    /**
     * Export all recipes as JSON string
     */
    exportRecipes() {
        const recipes = this.getAllRecipes();
        return JSON.stringify(recipes, null, 2);
    }

    /**
     * Import recipes from JSON
     */
    importRecipes(jsonString, merge = true) {
        try {
            const imported = JSON.parse(jsonString);
            if (typeof imported !== 'object') {
                throw new Error('Invalid format');
            }

            let recipes = merge ? this.getAllRecipes() : {};
            let count = 0;

            for (const [id, recipe] of Object.entries(imported)) {
                if (recipe.name && recipe.data) {
                    recipes[id] = recipe;
                    count++;
                }
            }

            localStorage.setItem(this.storageKey, JSON.stringify(recipes));
            return count;
        } catch (error) {
            console.error('Import error:', error);
            throw error;
        }
    }
}

// Global instance
const storage = new Storage();
