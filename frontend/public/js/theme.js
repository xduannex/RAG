// RAG Chat Application - Theme Manager
// Handles theme switching and dark/light mode management

class ThemeManager {
    constructor() {
        this.currentTheme = 'light';
        this.systemPreference = 'light';
        this.autoDetect = true;

        this.init();
    }

    init() {
        console.log('Initializing ThemeManager...');

        try {
            this.detectSystemPreference();
            this.loadSavedTheme();
            this.setupEventListeners();
            this.applyTheme();

            console.log('ThemeManager initialized successfully');
        } catch (error) {
            console.error('ThemeManager initialization failed:', error);
        }
    }

        detectSystemPreference() {
        if (window.matchMedia) {
            const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
            this.systemPreference = darkModeQuery.matches ? 'dark' : 'light';

            // Listen for system theme changes
            darkModeQuery.addEventListener('change', (e) => {
                this.systemPreference = e.matches ? 'dark' : 'light';
                if (this.autoDetect) {
                    this.setTheme('auto');
                }
            });

            console.log('System theme preference:', this.systemPreference);
        }
    }

    loadSavedTheme() {
        try {
            const savedTheme = localStorage.getItem('rag_theme');
            const autoDetect = localStorage.getItem('rag_theme_auto_detect');

            this.autoDetect = autoDetect !== 'false';

            if (savedTheme) {
                this.currentTheme = savedTheme;
            } else if (this.autoDetect) {
                this.currentTheme = 'auto';
            }

            console.log('Loaded theme:', this.currentTheme, 'Auto-detect:', this.autoDetect);
        } catch (error) {
            console.warn('Failed to load saved theme:', error);
            this.currentTheme = 'light';
        }
    }

    setupEventListeners() {
        // Theme toggle button
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }

        // Alternative theme button (if exists)
        const themeButton = document.querySelector('[onclick="toggleTheme()"]');
        if (themeButton) {
            themeButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleTheme();
            });
        }

        // Listen for storage changes (for sync across tabs)
        window.addEventListener('storage', (e) => {
            if (e.key === 'rag_theme') {
                this.currentTheme = e.newValue || 'light';
                this.applyTheme();
            }
        });

        // Listen for visibility change to sync theme
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.syncTheme();
            }
        });
    }

    setTheme(theme) {
        const validThemes = ['light', 'dark', 'auto'];
        if (!validThemes.includes(theme)) {
            console.warn('Invalid theme:', theme);
            return;
        }

        this.currentTheme = theme;
        this.saveTheme();
        this.applyTheme();

        // Dispatch theme change event
        const event = new CustomEvent('themeChanged', {
            detail: {
                theme: theme,
                resolvedTheme: this.getResolvedTheme()
            }
        });
        document.dispatchEvent(event);

        console.log('Theme set to:', theme);
    }

    toggleTheme() {
        let newTheme;

        if (this.currentTheme === 'light') {
            newTheme = 'dark';
        } else if (this.currentTheme === 'dark') {
            newTheme = 'auto';
        } else {
            newTheme = 'light';
        }

        this.setTheme(newTheme);

        // Show status notification
        if (window.showStatus) {
            const resolvedTheme = this.getResolvedTheme();
            window.showStatus(`Switched to ${newTheme} theme (${resolvedTheme})`, 'success');
        }
    }

    getResolvedTheme() {
        if (this.currentTheme === 'auto') {
            return this.systemPreference;
        }
        return this.currentTheme;
    }

    applyTheme() {
        const resolvedTheme = this.getResolvedTheme();
        const body = document.body;
        const html = document.documentElement;

        // Remove existing theme classes
        body.classList.remove('theme-light', 'theme-dark');
        html.classList.remove('theme-light', 'theme-dark');

        // Apply new theme class
        body.classList.add(`theme-${resolvedTheme}`);
        html.classList.add(`theme-${resolvedTheme}`);

        // Update global state
        window.isDarkMode = resolvedTheme === 'dark';

        // Update theme icon
        this.updateThemeIcon();

        // Update meta theme-color
        this.updateMetaThemeColor(resolvedTheme);

        // Apply theme to specific elements
        this.applyThemeToElements(resolvedTheme);

        console.log('Theme applied:', resolvedTheme);
    }

    updateThemeIcon() {
        const themeIcons = document.querySelectorAll('#themeIcon, .theme-icon');
        const resolvedTheme = this.getResolvedTheme();

        themeIcons.forEach(icon => {
            if (this.currentTheme === 'auto') {
                icon.className = 'fas fa-adjust';
                icon.title = `Auto (${resolvedTheme})`;
            } else if (resolvedTheme === 'dark') {
                icon.className = 'fas fa-sun';
                icon.title = 'Switch to Light Mode';
            } else {
                icon.className = 'fas fa-moon';
                icon.title = 'Switch to Dark Mode';
            }
        });
    }

    updateMetaThemeColor(theme) {
        let themeColor = '#ffffff'; // Default light theme

        if (theme === 'dark') {
            themeColor = '#1a1a1a'; // Dark theme
        }

        // Update or create meta theme-color tag
        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (!metaThemeColor) {
            metaThemeColor = document.createElement('meta');
            metaThemeColor.name = 'theme-color';
            document.head.appendChild(metaThemeColor);
        }
        metaThemeColor.content = themeColor;

        // Update or create meta msapplication-TileColor tag
        let metaTileColor = document.querySelector('meta[name="msapplication-TileColor"]');
        if (!metaTileColor) {
            metaTileColor = document.createElement('meta');
            metaTileColor.name = 'msapplication-TileColor';
            document.head.appendChild(metaTileColor);
        }
        metaTileColor.content = themeColor;
    }

    applyThemeToElements(theme) {
        // Update charts if they exist
        this.updateCharts(theme);

        // Update code blocks
        this.updateCodeBlocks(theme);

        // Update modals
        this.updateModals(theme);

        // Update custom elements
        this.updateCustomElements(theme);
    }

    updateCharts(theme) {
        // Update any charts with theme-appropriate colors
        const charts = document.querySelectorAll('.chart, [data-chart]');
        charts.forEach(chart => {
            if (chart.chart && typeof chart.chart.update === 'function') {
                chart.chart.update();
            }
        });
    }

    updateCodeBlocks(theme) {
        const codeBlocks = document.querySelectorAll('pre, code');
        codeBlocks.forEach(block => {
            if (theme === 'dark') {
                block.classList.add('dark-code');
            } else {
                block.classList.remove('dark-code');
            }
        });
    }

    updateModals(theme) {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (theme === 'dark') {
                modal.classList.add('modal-dark');
            } else {
                modal.classList.remove('modal-dark');
            }
        });
    }

    updateCustomElements(theme) {
        // Update any custom elements that need theme adjustments
        const customElements = document.querySelectorAll('[data-theme-target]');
        customElements.forEach(element => {
            const property = element.dataset.themeTarget;
            const lightValue = element.dataset.themeLight;
            const darkValue = element.dataset.themeDark;

            if (property && lightValue && darkValue) {
                element.style[property] = theme === 'dark' ? darkValue : lightValue;
            }
        });
    }

    saveTheme() {
        try {
            localStorage.setItem('rag_theme', this.currentTheme);
            localStorage.setItem('rag_theme_auto_detect', this.autoDetect.toString());
        } catch (error) {
            console.warn('Failed to save theme:', error);
        }
    }

    syncTheme() {
        try {
            const savedTheme = localStorage.getItem('rag_theme');
            if (savedTheme && savedTheme !== this.currentTheme) {
                this.currentTheme = savedTheme;
                this.applyTheme();
            }
        } catch (error) {
            console.warn('Failed to sync theme:', error);
        }
    }

    // Theme presets
    getThemePresets() {
        return {
            light: {
                name: 'Light',
                icon: 'fas fa-sun',
                colors: {
                    primary: '#007bff',
                    background: '#ffffff',
                    surface: '#f8f9fa',
                    text: '#212529'
                }
            },
            dark: {
                name: 'Dark',
                icon: 'fas fa-moon',
                colors: {
                    primary: '#4dabf7',
                    background: '#1a1a1a',
                    surface: '#2d2d2d',
                    text: '#ffffff'
                }
            },
            auto: {
                name: 'Auto',
                icon: 'fas fa-adjust',
                description: 'Follows system preference'
            }
        };
    }

    // Custom theme support
    createCustomTheme(name, colors) {
        const customThemes = this.getCustomThemes();
        customThemes[name] = colors;

        try {
            localStorage.setItem('rag_custom_themes', JSON.stringify(customThemes));
            console.log('Custom theme created:', name);
        } catch (error) {
            console.error('Failed to save custom theme:', error);
        }
    }

    getCustomThemes() {
        try {
            const stored = localStorage.getItem('rag_custom_themes');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.warn('Failed to load custom themes:', error);
            return {};
        }
    }

    applyCustomTheme(name) {
        const customThemes = this.getCustomThemes();
        const theme = customThemes[name];

        if (!theme) {
            console.warn('Custom theme not found:', name);
            return;
        }

        // Apply custom CSS variables
        const root = document.documentElement;
        Object.entries(theme).forEach(([property, value]) => {
            root.style.setProperty(`--${property}`, value);
        });

        this.currentTheme = `custom-${name}`;
        this.saveTheme();

        console.log('Custom theme applied:', name);
    }

    // Theme animation
    enableThemeTransitions() {
        const style = document.createElement('style');
        style.textContent = `
            * {
                transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease !important;
            }
        `;
        document.head.appendChild(style);

        // Remove after animation
        setTimeout(() => {
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 300);
    }

    // Theme export/import
    exportThemeSettings() {
        const settings = {
            theme: this.currentTheme,
            autoDetect: this.autoDetect,
            customThemes: this.getCustomThemes(),
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(settings, null, 2)], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rag_theme_settings.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (window.showStatus) {
            window.showStatus('Theme settings exported', 'success');
        }
    }

    async importThemeSettings(file) {
        try {
            const text = await file.text();
            const settings = JSON.parse(text);

            if (settings.theme) {
                this.setTheme(settings.theme);
            }

            if (typeof settings.autoDetect === 'boolean') {
                this.autoDetect = settings.autoDetect;
            }

            if (settings.customThemes) {
                localStorage.setItem('rag_custom_themes', JSON.stringify(settings.customThemes));
            }

            this.saveTheme();

            if (window.showStatus) {
                window.showStatus('Theme settings imported', 'success');
            }

        } catch (error) {
            console.error('Failed to import theme settings:', error);
            if (window.showStatus) {
                window.showStatus('Failed to import theme settings', 'error');
            }
        }
    }

    // Theme accessibility
    checkContrastRatio(foreground, background) {
        // Simple contrast ratio calculation
        const getLuminance = (color) => {
            const rgb = parseInt(color.slice(1), 16);
            const r = (rgb >> 16) & 0xff;
            const g = (rgb >> 8) & 0xff;
            const b = (rgb >> 0) & 0xff;

            const [rs, gs, bs] = [r, g, b].map(c => {
                c = c / 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });

            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        };

        const l1 = getLuminance(foreground);
        const l2 = getLuminance(background);

        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        return ratio;
    }

    validateThemeAccessibility() {
        const resolvedTheme = this.getResolvedTheme();
        const preset = this.getThemePresets()[resolvedTheme];

        if (!preset) return true;

        const contrastRatio = this.checkContrastRatio(preset.colors.text, preset.colors.background);
        const isAccessible = contrastRatio >= 4.5; // WCAG AA standard

        if (!isAccessible) {
            console.warn(`Theme accessibility warning: contrast ratio ${contrastRatio.toFixed(2)} is below WCAG AA standard (4.5)`);
        }

        return isAccessible;
    }

    // High contrast mode
    enableHighContrast() {
        document.body.classList.add('high-contrast');
        localStorage.setItem('rag_high_contrast', 'true');

        if (window.showStatus) {
            window.showStatus('High contrast mode enabled', 'success');
        }
    }

    disableHighContrast() {
        document.body.classList.remove('high-contrast');
        localStorage.setItem('rag_high_contrast', 'false');

        if (window.showStatus) {
            window.showStatus('High contrast mode disabled', 'success');
        }
    }

    toggleHighContrast() {
        const isEnabled = document.body.classList.contains('high-contrast');
        if (isEnabled) {
            this.disableHighContrast();
        } else {
            this.enableHighContrast();
        }
    }

    loadHighContrastSetting() {
        try {
            const enabled = localStorage.getItem('rag_high_contrast') === 'true';
            if (enabled) {
                document.body.classList.add('high-contrast');
            }
        } catch (error) {
            console.warn('Failed to load high contrast setting:', error);
        }
    }

    // Reduced motion support
    checkReducedMotion() {
        if (window.matchMedia) {
            const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
            return reducedMotionQuery.matches;
        }
        return false;
    }

    applyReducedMotion() {
        if (this.checkReducedMotion()) {
            document.body.classList.add('reduced-motion');
            console.log('Reduced motion preferences detected and applied');
        }
    }

    // Theme utilities
    getCurrentTheme() {
        return {
            current: this.currentTheme,
            resolved: this.getResolvedTheme(),
            system: this.systemPreference,
            autoDetect: this.autoDetect
        };
    }

    isCurrentTheme(theme) {
        return this.currentTheme === theme;
    }

    isDarkMode() {
        return this.getResolvedTheme() === 'dark';
    }

    isLightMode() {
        return this.getResolvedTheme() === 'light';
    }

    // CSS custom properties management
    setCSSProperty(property, value) {
        document.documentElement.style.setProperty(`--${property}`, value);
    }

    getCSSProperty(property) {
        return getComputedStyle(document.documentElement).getPropertyValue(`--${property}`);
    }

    updateCSSProperties(properties) {
        Object.entries(properties).forEach(([property, value]) => {
            this.setCSSProperty(property, value);
        });
    }

    // Theme event handlers
    onThemeChange(callback) {
        document.addEventListener('themeChanged', callback);
    }

    offThemeChange(callback) {
        document.removeEventListener('themeChanged', callback);
    }

    // Cleanup method
    cleanup() {
        // Remove event listeners if needed
        console.log('ThemeManager cleanup completed');
    }

    // Debug methods
    getThemeDebugInfo() {
        return {
            currentTheme: this.currentTheme,
            resolvedTheme: this.getResolvedTheme(),
            systemPreference: this.systemPreference,
            autoDetect: this.autoDetect,
            isDarkMode: this.isDarkMode(),
            isHighContrast: document.body.classList.contains('high-contrast'),
            reducedMotion: this.checkReducedMotion(),
            customThemes: Object.keys(this.getCustomThemes()),
            accessibility: {
                contrastValid: this.validateThemeAccessibility()
            }
        };
    }

    printThemeInfo() {
        console.table(this.getThemeDebugInfo());
    }

    // Reset theme to defaults
    resetTheme() {
        this.currentTheme = 'auto';
        this.autoDetect = true;

        // Clear localStorage
        localStorage.removeItem('rag_theme');
        localStorage.removeItem('rag_theme_auto_detect');
        localStorage.removeItem('rag_high_contrast');
        localStorage.removeItem('rag_custom_themes');

        // Remove classes
        document.body.classList.remove('high-contrast');

        // Apply default theme
        this.applyTheme();

        if (window.showStatus) {
            window.showStatus('Theme settings reset to defaults', 'success');
        }

        console.log('Theme reset to defaults');
    }

    // Theme performance monitoring
    measureThemeSwitch() {
        const start = performance.now();

        return {
            end: () => {
                const duration = performance.now() - start;
                console.log(`Theme switch took ${duration.toFixed(2)}ms`);
                return duration;
            }
        };
    }

    // Auto theme scheduling
    setupAutoThemeSchedule(schedule) {
        // Schedule format: { start: '18:00', end: '06:00', theme: 'dark' }
        this.themeSchedule = schedule;

        const checkSchedule = () => {
            if (!this.themeSchedule) return;

            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes();

            const parseTime = (timeStr) => {
                const [hours, minutes] = timeStr.split(':').map(Number);
                return hours * 60 + minutes;
            };

            const startTime = parseTime(this.themeSchedule.start);
            const endTime = parseTime(this.themeSchedule.end);

            let shouldUseDark = false;

            if (startTime > endTime) {
                // Schedule crosses midnight
                shouldUseDark = currentTime >= startTime || currentTime <= endTime;
            } else {
                // Schedule within same day
                shouldUseDark = currentTime >= startTime && currentTime <= endTime;
            }

            const targetTheme = shouldUseDark ? this.themeSchedule.theme : 'light';

            if (this.currentTheme !== targetTheme) {
                this.setTheme(targetTheme);
                console.log(`Auto theme schedule: switched to ${targetTheme}`);
            }
        };

        // Check immediately
        checkSchedule();

        // Check every minute
        this.scheduleInterval = setInterval(checkSchedule, 60000);

        console.log('Auto theme schedule enabled:', schedule);
    }

    clearAutoThemeSchedule() {
        if (this.scheduleInterval) {
            clearInterval(this.scheduleInterval);
            this.scheduleInterval = null;
        }
        this.themeSchedule = null;
        console.log('Auto theme schedule disabled');
    }
}

// Global theme functions
window.toggleTheme = function() {
    if (window.themeManager) {
        window.themeManager.toggleTheme();
    } else if (window.ragApp?.toggleTheme) {
        window.ragApp.toggleTheme();
    } else {
        // Fallback theme toggle
        const body = document.body;
        const isDark = body.classList.contains('theme-dark');

        if (isDark) {
            body.classList.remove('theme-dark');
            body.classList.add('theme-light');
            localStorage.setItem('rag_theme', 'light');
        } else {
            body.classList.remove('theme-light');
            body.classList.add('theme-dark');
            localStorage.setItem('rag_theme', 'dark');
        }

        // Update icon
        const themeIcon = document.getElementById('themeIcon');
        if (themeIcon) {
            themeIcon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
        }

        window.isDarkMode = !isDark;
    }
};

window.setTheme = function(theme) {
    if (window.themeManager) {
        window.themeManager.setTheme(theme);
    }
};

window.getCurrentTheme = function() {
    if (window.themeManager) {
        return window.themeManager.getCurrentTheme();
    }
    return {
        current: localStorage.getItem('rag_theme') || 'light',
        resolved: document.body.classList.contains('theme-dark') ? 'dark' : 'light'
    };
};

window.toggleHighContrast = function() {
    if (window.themeManager) {
        window.themeManager.toggleHighContrast();
    }
};

window.exportThemeSettings = function() {
    if (window.themeManager) {
        window.themeManager.exportThemeSettings();
    }
};

window.resetTheme = function() {
    if (window.themeManager) {
        window.themeManager.resetTheme();
    }
};

// Initialize theme manager
document.addEventListener('DOMContentLoaded', () => {
    // Create global theme manager instance
    window.themeManager = new ThemeManager();

    // Load high contrast setting
    window.themeManager.loadHighContrastSetting();

    // Apply reduced motion preferences
    window.themeManager.applyReducedMotion();

    console.log('Global ThemeManager created and initialized');
});

// Keyboard shortcuts for theme switching
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Shift + T for theme toggle
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        window.toggleTheme();
    }

    // Ctrl/Cmd + Shift + H for high contrast toggle
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        window.toggleHighContrast();
    }
});

// Print CSS for themes
const themeCSS = `
/* Light Theme Variables */
:root {
    --primary-color: #007bff;
    --secondary-color: #6c757d;
    --success-color: #28a745;
    --danger-color: #dc3545;
    --warning-color: #ffc107;
    --info-color: #17a2b8;
    --light-color: #f8f9fa;
    --dark-color: #343a40;
    
    --bg-primary: #ffffff;
    --bg-secondary: #f8f9fa;
    --bg-tertiary: #e9ecef;
    
    --text-primary: #212529;
    --text-secondary: #6c757d;
    --text-muted: #6c757d;
    
    --border-color: #dee2e6;
    --border-light: #e9ecef;
    --border-dark: #adb5bd;
    
    --shadow-sm: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
    --shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
    --shadow-lg: 0 1rem 3rem rgba(0, 0, 0, 0.175);
}

/* Dark Theme Variables */
.theme-dark {
    --primary-color: #4dabf7;
    --secondary-color: #adb5bd;
    --success-color: #51cf66;
    --danger-color: #ff6b6b;
    --warning-color: #ffd43b;
    --info-color: #74c0fc;
    --light-color: #495057;
    --dark-color: #f8f9fa;
    
    --bg-primary: #1a1a1a;
    --bg-secondary: #2d2d2d;
    --bg-tertiary: #404040;
    
    --text-primary: #ffffff;
    --text-secondary: #ced4da;
    --text-muted: #adb5bd;
    
    --border-color: #495057;
    --border-light: #404040;
    --border-dark: #6c757d;
    
    --shadow-sm: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.3);
    --shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 1rem 3rem rgba(0, 0, 0, 0.5);
}

/* High Contrast Mode */
.high-contrast {
    --primary-color: #000000;
    --bg-primary: #ffffff;
    --bg-secondary: #ffffff;
    --text-primary: #000000;
    --border-color: #000000;
}

.high-contrast.theme-dark {
    --primary-color: #ffffff;
    --bg-primary: #000000;
    --bg-secondary: #000000;
    --text-primary: #ffffff;
    --border-color: #ffffff;
}

/* Reduced Motion */
.reduced-motion * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
}

/* Theme Transitions */
.theme-transition * {
    transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}
`;

// Inject theme CSS
if (!document.getElementById('theme-styles')) {
    const style = document.createElement('style');
    style.id = 'theme-styles';
    style.textContent = themeCSS;
    document.head.appendChild(style);
}

console.log('Theme manager loaded');