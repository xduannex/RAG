// RAG Chat Application - Theme Management
// Handles dark/light theme switching and persistence

class ThemeManager {
    constructor() {
        this.currentTheme = 'light';
        this.themes = {
            light: {
                name: 'Light',
                icon: 'fas fa-sun',
                class: ''
            },
            dark: {
                name: 'Dark',
                icon: 'fas fa-moon',
                class: 'dark-theme'
            }
        };
        this.init();
    }

    init() {
        this.loadSavedTheme();
        this.setupEventListeners();
        this.detectSystemTheme();
    }

    loadSavedTheme() {
        try {
            const savedTheme = localStorage.getItem('rag_theme');
            if (savedTheme && this.themes[savedTheme]) {
                this.setTheme(savedTheme, false);
            } else {
                                // Use system preference if no saved theme
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                this.setTheme(prefersDark ? 'dark' : 'light', false);
            }
        } catch (error) {
            console.warn('Failed to load saved theme:', error);
            this.setTheme('light', false);
        }
    }

    setupEventListeners() {
        // Listen for system theme changes
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', (e) => {
                // Only auto-switch if user hasn't manually set a theme
                const hasManualTheme = localStorage.getItem('rag_theme_manual');
                if (!hasManualTheme) {
                    this.setTheme(e.matches ? 'dark' : 'light', false);
                }
            });
        }

        // Setup theme toggle button
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
    }

    detectSystemTheme() {
        try {
            if (window.matchMedia) {
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                console.log('System prefers dark mode:', prefersDark);
                return prefersDark ? 'dark' : 'light';
            }
        } catch (error) {
            console.warn('Failed to detect system theme:', error);
        }
        return 'light';
    }

    setTheme(themeName, savePreference = true) {
        if (!this.themes[themeName]) {
            console.warn('Unknown theme:', themeName);
            return false;
        }

        try {
            const oldTheme = this.currentTheme;
            const newTheme = this.themes[themeName];

            // Remove old theme class
            if (oldTheme && this.themes[oldTheme]) {
                document.body.classList.remove(this.themes[oldTheme].class);
            }

            // Add new theme class
            if (newTheme.class) {
                document.body.classList.add(newTheme.class);
            }

            // Update current theme
            this.currentTheme = themeName;

            // Update theme icon
            this.updateThemeIcon();

            // Save preference
            if (savePreference) {
                localStorage.setItem('rag_theme', themeName);
                localStorage.setItem('rag_theme_manual', 'true');
            }

            // Emit theme change event
            this.emitThemeChange(oldTheme, themeName);

            console.log(`Theme changed from ${oldTheme} to ${themeName}`);
            return true;

        } catch (error) {
            console.error('Failed to set theme:', error);
            return false;
        }
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);

        // Show notification
        if (typeof showStatus === 'function') {
            showStatus(`Switched to ${this.themes[newTheme].name.toLowerCase()} theme`, 'info', 2000);
        }
    }

    updateThemeIcon() {
        const themeIcon = document.getElementById('themeIcon');
        if (themeIcon) {
            const theme = this.themes[this.currentTheme];
            themeIcon.className = theme.icon;
        }

        // Update button title
        const themeButton = document.querySelector('[onclick="toggleTheme()"]');
        if (themeButton) {
            const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
            themeButton.title = `Switch to ${this.themes[nextTheme].name} theme`;
        }
    }

    emitThemeChange(oldTheme, newTheme) {
        // Dispatch custom event
        const event = new CustomEvent('themeChanged', {
            detail: {
                oldTheme,
                newTheme,
                themes: this.themes
            }
        });
        document.dispatchEvent(event);
    }

    getCurrentTheme() {
        return {
            name: this.currentTheme,
            ...this.themes[this.currentTheme]
        };
    }

    getAvailableThemes() {
        return Object.keys(this.themes).map(key => ({
            key,
            ...this.themes[key]
        }));
    }

    addCustomTheme(key, theme) {
        if (this.themes[key]) {
            console.warn('Theme already exists:', key);
            return false;
        }

        this.themes[key] = {
            name: theme.name || key,
            icon: theme.icon || 'fas fa-palette',
            class: theme.class || `${key}-theme`,
            ...theme
        };

        console.log('Added custom theme:', key);
        return true;
    }

    removeCustomTheme(key) {
        if (key === 'light' || key === 'dark') {
            console.warn('Cannot remove default themes');
            return false;
        }

        if (!this.themes[key]) {
            console.warn('Theme does not exist:', key);
            return false;
        }

        // Switch to light theme if removing current theme
        if (this.currentTheme === key) {
            this.setTheme('light');
        }

        delete this.themes[key];
        console.log('Removed custom theme:', key);
        return true;
    }

    resetToSystemTheme() {
        const systemTheme = this.detectSystemTheme();
        this.setTheme(systemTheme, false);
        localStorage.removeItem('rag_theme_manual');

        if (typeof showStatus === 'function') {
            showStatus('Reset to system theme preference', 'info', 2000);
        }
    }

    exportThemeSettings() {
        return {
            currentTheme: this.currentTheme,
            isManuallySet: localStorage.getItem('rag_theme_manual') === 'true',
            systemTheme: this.detectSystemTheme(),
            availableThemes: this.getAvailableThemes()
        };
    }

    importThemeSettings(settings) {
        try {
            if (settings.currentTheme && this.themes[settings.currentTheme]) {
                this.setTheme(settings.currentTheme, settings.isManuallySet);

                if (settings.isManuallySet) {
                    localStorage.setItem('rag_theme_manual', 'true');
                } else {
                    localStorage.removeItem('rag_theme_manual');
                }

                return true;
            }
        } catch (error) {
            console.error('Failed to import theme settings:', error);
        }
        return false;
    }

    // CSS custom properties for theme colors
    setCSSCustomProperties(properties) {
        try {
            const root = document.documentElement;
            Object.entries(properties).forEach(([property, value]) => {
                root.style.setProperty(`--${property}`, value);
            });
        } catch (error) {
            console.error('Failed to set CSS custom properties:', error);
        }
    }

    // Get computed theme colors
    getThemeColors() {
        const computedStyle = getComputedStyle(document.documentElement);
        return {
            primary: computedStyle.getPropertyValue('--color-primary').trim(),
            secondary: computedStyle.getPropertyValue('--color-secondary').trim(),
            background: computedStyle.getPropertyValue('--color-background').trim(),
            surface: computedStyle.getPropertyValue('--color-surface').trim(),
            text: computedStyle.getPropertyValue('--color-text').trim(),
            textSecondary: computedStyle.getPropertyValue('--color-text-secondary').trim()
        };
    }

    // Apply theme-specific styles dynamically
    applyThemeStyles() {
        const theme = this.getCurrentTheme();

        // Remove existing theme styles
        const existingStyle = document.getElementById('dynamic-theme-styles');
        if (existingStyle) {
            existingStyle.remove();
        }

        // Add new theme styles if needed
        if (theme.customStyles) {
            const style = document.createElement('style');
            style.id = 'dynamic-theme-styles';
            style.textContent = theme.customStyles;
            document.head.appendChild(style);
        }
    }

    // Theme transition animation
    enableThemeTransition() {
        const style = document.createElement('style');
        style.textContent = `
            *, *::before, *::after {
                transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease !important;
            }
        `;
        document.head.appendChild(style);

        // Remove transition after animation completes
        setTimeout(() => {
            style.remove();
        }, 300);
    }
}

// Initialize theme manager
const themeManager = new ThemeManager();

// Global functions for backward compatibility
window.toggleTheme = () => {
    themeManager.enableThemeTransition();
    themeManager.toggleTheme();
};

window.setTheme = (theme) => themeManager.setTheme(theme);
window.getCurrentTheme = () => themeManager.getCurrentTheme();

// Listen for theme changes and update components
document.addEventListener('themeChanged', (event) => {
    console.log('Theme changed:', event.detail);

    // Update any theme-dependent components
    if (typeof updateChartsTheme === 'function') {
        updateChartsTheme(event.detail.newTheme);
    }

    // Update syntax highlighting theme if present
    if (typeof updateSyntaxHighlightingTheme === 'function') {
        updateSyntaxHighlightingTheme(event.detail.newTheme);
    }
});

console.log('Theme manager loaded successfully');
