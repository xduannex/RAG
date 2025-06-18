// RAG Chat Application - Keyboard Shortcuts
// Handles keyboard shortcuts and accessibility

class KeyboardManager {
    constructor() {
        this.shortcuts = new Map();
        this.isEnabled = true;
        this.init();
    }

    init() {
        console.log('Initializing Keyboard Manager...');
        this.setupEventListeners();
        this.registerDefaultShortcuts();
        window.keyboardManager = this;
        console.log('Keyboard manager initialized');
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (!this.isEnabled) return;
            this.handleKeyDown(e);
        });
    }

    handleKeyDown(e) {
        // Don't trigger shortcuts when typing in inputs (except for specific cases)
        const isInputFocused = e.target.tagName === 'INPUT' ||
                              e.target.tagName === 'TEXTAREA' ||
                              e.target.contentEditable === 'true';

        // Build shortcut key
        const key = this.buildShortcutKey(e);
        const shortcut = this.shortcuts.get(key);

        if (shortcut) {
            // Check if shortcut should work in inputs
            if (isInputFocused && !shortcut.allowInInputs) {
                return;
            }

            // Check if shortcut is enabled
            if (shortcut.enabled === false) {
                return;
            }

            // Prevent default behavior
            e.preventDefault();
            e.stopPropagation();

            // Execute shortcut
            try {
                shortcut.handler(e);
            } catch (error) {
                console.error('Shortcut handler error:', error);
            }
        }
    }

    buildShortcutKey(e) {
        const parts = [];

        if (e.ctrlKey || e.metaKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');

        // Handle special keys
        let key = e.key.toLowerCase();
        if (key === ' ') key = 'space';
        if (key === 'escape') key = 'esc';
        if (key === 'arrowup') key = 'up';
        if (key === 'arrowdown') key = 'down';
        if (key === 'arrowleft') key = 'left';
        if (key === 'arrowright') key = 'right';

        parts.push(key);

        return parts.join('+');
    }

    register(shortcut, handler, options = {}) {
        this.shortcuts.set(shortcut, {
            handler: handler,
            description: options.description || '',
            allowInInputs: options.allowInInputs || false,
            enabled: options.enabled !== false
        });
    }

    unregister(shortcut) {
        return this.shortcuts.delete(shortcut);
    }

    enable() {
        this.isEnabled = true;
    }

    disable() {
        this.isEnabled = false;
    }

    enableShortcut(shortcut) {
        const s = this.shortcuts.get(shortcut);
        if (s) {
            s.enabled = true;
        }
    }

    disableShortcut(shortcut) {
        const s = this.shortcuts.get(shortcut);
        if (s) {
            s.enabled = false;
        }
    }

    getShortcuts() {
        return Array.from(this.shortcuts.entries()).map(([key, value]) => ({
            shortcut: key,
            description: value.description,
            enabled: value.enabled
        }));
    }

    registerDefaultShortcuts() {
        // Chat shortcuts
        this.register('ctrl+l', () => {
            if (window.chatManager) {
                window.chatManager.clearChat();
            }
        }, { description: 'Clear chat' });

        this.register('ctrl+k', () => {
            const messageInput = document.getElementById('messageInput');
            if (messageInput) {
                messageInput.focus();
            }
        }, { description: 'Focus search input', allowInInputs: true });

        this.register('ctrl+r', () => {
            if (window.statsManager) {
                window.statsManager.refreshStats();
            }
        }, { description: 'Refresh statistics' });

        this.register('ctrl+d', () => {
            window.toggleTheme();
        }, { description: 'Toggle dark mode' });

        this.register('ctrl+u', () => {
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                fileInput.click();
            }
        }, { description: 'Upload files' });

        // Modal shortcuts
        this.register('esc', () => {
            if (window.modalManager) {
                window.modalManager.closeTopModal();
            }
        }, { description: 'Close modal/suggestions', allowInInputs: true });

        this.register('f1', () => {
            window.showHelp();
        }, { description: 'Show help' });

        this.register('shift+/', () => {
            window.showHelp();
        }, { description: 'Show help' });

        // Navigation shortcuts
        this.register('ctrl+shift+h', () => {
            window.showSearchHistory();
        }, { description: 'Show search history' });

        this.register('ctrl+shift+d', () => {
            if (window.documentManager) {
                window.documentManager.loadDocuments();
            }
                }, { description: 'Refresh documents' });

        // Search mode shortcuts
        this.register('ctrl+1', () => {
            window.setSearchMode('rag');
        }, { description: 'Switch to RAG mode' });

        this.register('ctrl+2', () => {
            window.setSearchMode('search');
        }, { description: 'Switch to search mode' });

        // Advanced search shortcuts
        this.register('ctrl+shift+a', () => {
            window.toggleAdvancedSearch();
        }, { description: 'Toggle advanced search' });

        // Input shortcuts (work in text areas)
        this.register('enter', (e) => {
            if (e.target.id === 'messageInput' && !e.shiftKey) {
                const chatForm = document.getElementById('chatForm');
                if (chatForm) {
                    chatForm.dispatchEvent(new Event('submit'));
                }
            }
        }, { description: 'Send message', allowInInputs: true });

        this.register('shift+enter', (e) => {
            if (e.target.tagName === 'TEXTAREA') {
                // Allow new line - don't prevent default
                return;
            }
        }, { description: 'New line in message', allowInInputs: true });

        // Search suggestions navigation
        this.register('up', (e) => {
            if (window.searchManager && window.searchManager.hasSuggestions()) {
                window.searchManager.navigateSuggestions('up');
            }
        }, { description: 'Navigate suggestions up', allowInInputs: true });

        this.register('down', (e) => {
            if (window.searchManager && window.searchManager.hasSuggestions()) {
                window.searchManager.navigateSuggestions('down');
            }
        }, { description: 'Navigate suggestions down', allowInInputs: true });

        this.register('enter', (e) => {
            if (window.searchManager && window.searchManager.hasActiveSuggestion()) {
                window.searchManager.selectActiveSuggestion();
            }
        }, { description: 'Select suggestion', allowInInputs: true });

        // Document viewer shortcuts
        this.register('ctrl+p', () => {
            if (window.modalManager && window.modalManager.isOpen('documentViewerModal')) {
                window.printDocument();
            }
        }, { description: 'Print document' });

        this.register('ctrl+s', () => {
            if (window.modalManager && window.modalManager.isOpen('documentViewerModal')) {
                window.downloadDocument();
            }
        }, { description: 'Download document' });

        // Accessibility shortcuts
        this.register('alt+1', () => {
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.focus();
            }
        }, { description: 'Focus main content' });

        this.register('alt+2', () => {
            const sidebar = document.querySelector('.col-sidebar');
            if (sidebar) {
                const firstFocusable = sidebar.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (firstFocusable) {
                    firstFocusable.focus();
                }
            }
        }, { description: 'Focus sidebar' });

        this.register('alt+3', () => {
            const chatInput = document.getElementById('messageInput');
            if (chatInput) {
                chatInput.focus();
            }
        }, { description: 'Focus chat input' });

        // Development shortcuts (only in development mode)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            this.register('ctrl+shift+i', () => {
                console.log('Application State:', {
                    chatManager: window.chatManager,
                    uploadManager: window.uploadManager,
                    documentManager: window.documentManager,
                    searchManager: window.searchManager,
                    statsManager: window.statsManager,
                    modalManager: window.modalManager,
                    notificationManager: window.notificationManager,
                    keyboardManager: window.keyboardManager
                });
            }, { description: 'Log application state (dev)' });

            this.register('ctrl+shift+c', () => {
                window.clearNotifications();
            }, { description: 'Clear notifications (dev)' });
        }
    }

    // Show keyboard shortcuts help
    showShortcutsHelp() {
        const shortcuts = this.getShortcuts()
            .filter(s => s.description && s.enabled)
            .sort((a, b) => a.description.localeCompare(b.description));

        const shortcutsHTML = shortcuts.map(s => `
            <div class="shortcut-item">
                <kbd>${s.shortcut.replace(/\+/g, '</kbd> + <kbd>')}</kbd>
                <span>${s.description}</span>
            </div>
        `).join('');

        const content = `
            <div class="shortcuts-help">
                <p>Available keyboard shortcuts:</p>
                <div class="shortcuts-grid">
                    ${shortcutsHTML}
                </div>
            </div>
        `;

        if (window.modalManager) {
            const modalId = window.modalManager.create({
                title: 'Keyboard Shortcuts',
                content: content,
                buttons: [
                    {
                        text: 'Close',
                        class: 'btn-primary',
                        onclick: () => {
                            window.modalManager.close(modalId);
                            window.modalManager.destroy(modalId);
                        }
                    }
                ]
            });
            window.modalManager.open(modalId);
        }
    }
}

// Global keyboard functions
window.registerShortcut = function(shortcut, handler, options = {}) {
    if (window.keyboardManager) {
        window.keyboardManager.register(shortcut, handler, options);
    }
};

window.unregisterShortcut = function(shortcut) {
    if (window.keyboardManager) {
        return window.keyboardManager.unregister(shortcut);
    }
    return false;
};

window.showKeyboardHelp = function() {
    if (window.keyboardManager) {
        window.keyboardManager.showShortcutsHelp();
    }
};

// Initialize keyboard manager immediately
window.keyboardManager = new KeyboardManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KeyboardManager;
}

console.log('Keyboard manager loaded');
