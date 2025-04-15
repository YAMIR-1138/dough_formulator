# Sourdough 1-2-3 Calculator

A comprehensive, client-side sourdough bread calculator that helps bakers create, save, and plan their sourdough bakes with precision.

## Features

- **Dynamic Calculation Engine**: Calculate recipes based on dough weight, flour weight, starter amount, or target hydration
- **Flexible Flour Blends**: Create and save custom flour combinations
- **Interactive Timeline**: Generate baking schedules based on start or end times, with temperature adjustments
- **Recipe Management**: Save, load, and organize your favorite recipes
- **Import/Export**: Share recipes with other bakers via JSON exports
- **Responsive Design**: Works on desktop and mobile devices
- **Client-Side Only**: No backend required, works offline after initial load
- **Dark/Light Mode**: Choose your preferred theme

## Usage

The calculator has two modes:

1. **Simple Mode**: Quick calculations with basic flour blend options
2. **Advanced Mode**: More detailed control over flour blends and recipe parameters

### Basic Operation

1. Choose your anchor point (what you want to calculate from)
2. Enter your desired values (dough weight, hydration, etc.)
3. Adjust flour blend to your preference
4. View the calculated recipe and timeline
5. Save or export your recipe if desired

### Timeline Generation

The timeline feature helps you plan your baking schedule:

1. Choose whether to calculate from start time or desired completion time
2. Set the date and time
3. Adjust room temperature to get more accurate fermentation estimates
4. Follow the generated step-by-step schedule

### Saving & Loading Recipes

- Click "Save Recipe" to store a recipe in your browser's local storage
- View and manage saved recipes in the "Saved Recipes" section
- Use "Export Recipes" to download all your recipes as a JSON file
- Use "Import Recipes" to load previously exported recipes

## Installation & Deployment

### Local Use

Simply download or clone this repository and open `index.html` in your web browser.

```
git clone https://github.com/yourusername/sourdough-calculator.git
cd sourdough-calculator
```

Then open `index.html` in your browser.

### GitHub Pages Deployment

To deploy the calculator on GitHub Pages:

1. Fork this repository to your GitHub account
2. Go to the repository settings
3. Scroll down to the "GitHub Pages" section
4. Select the main branch as the source
5. Click Save

Your calculator will be available at `https://yourusername.github.io/sourdough-calculator/`

### Other Static Hosting Options

The calculator can be hosted on any static hosting service:

1. Download the repository files
2. Upload them to your hosting service
3. Ensure `index.html` is set as the entry point

## Technical Information

The calculator is built with:

- HTML5
- CSS3 with CSS Custom Properties (variables)
- Vanilla JavaScript (ES6+)
- FontAwesome icons
- LocalStorage API for data persistence

The code is organized into modular components:

- `calculator.js`: Core calculation engine
- `timeline.js`: Baking schedule generation
- `storage.js`: Recipe saving/loading functionality
- `ui.js`: User interface interactions
- `app.js`: Main application logic and integration

## Browser Compatibility

The calculator works in all modern browsers that support ES6+ JavaScript features:

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Thanks to all the sourdough bakers who shared their knowledge and formulas
- Inspired by baker's percentages and traditional bread mathematics 