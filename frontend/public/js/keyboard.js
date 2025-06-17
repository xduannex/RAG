// RAG Chat Application - Keyboard Shortcuts
// Handles global keyboard shortcuts and navigation

class KeyboardManager {
    constructor() {
        this.shortcuts = new Map();
        this.isEnabled = true;
        this.init();
    }

    init() {
        console.log('Initializing Keyboard Manager...');
        this.setupDefaultShortcuts();
        this.setupEventListeners();

        // Register globally
        window.keyboardManager = this;

        console.log('Keyboard manager initialized');
    }

    setupDefaultShortcuts() {
        // Chat shortcuts
        this.addShortcut('ctrl+l', () => this.clearChat(), 'Clear chat');
        this.addShortcut('ctrl+k', () => this.focusSearch(), 'Focus search input');
        this.addShortcut('ctrl+enter', () => this.sendMessage(), 'Send message');

        // Navigation shortcuts
        this.addShortcut('ctrl+r', () => this.refreshStats(), 'Refresh statistics');
        this.addShortcut('ctrl+u', () => this.focusUpload(), 'Focus file upload');
        this.addShortcut('ctrl+d', () => this.toggleTheme(), 'Toggle dark mode');

        // Modal shortcuts
        this.addShortcut('escape', () => this.closeModals(), 'Close modals');
        this.addShortcut('f1', () => this.showHelp(), 'Show help');
        this.addShortcut('shift+?', () => this.showHelp(), 'Show help');

        // Document shortcuts
        this.addShortcut('ctrl+shift+d', () => this.loadDocuments(), 'Reload documents');
        this.addShortcut('ctrl+shift+s', () => this.toggleSearchMode(), 'Toggle search mode');

        // Advanced shortcuts
        this.addShortcut('ctrl+shift+c', () => this.copyLastResponse(), 'Copy last response');
        this.addShortcut('ctrl+shift+h', () => this.showShortcuts(), 'Show shortcuts');
        this.addShortcut('ctrl+shift+r', () => this.resetApplication(), 'Reset application');
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Handle special navigation keys
        document.addEventListener('keydown', (e) => this.handleNavigationKeys(e));
    }

    handleKeyDown(e) {
        if (!this.isEnabled) return;

        // Don't trigger shortcuts when typing in inputs (except for specific cases)
        const isInputFocused = this.isInputFocused(e.target);
        const shortcutKey = this.getShortcutKey(e);

        // Check if we have a registered shortcut
        const shortcut = this.shortcuts.get(shortcutKey);
        if (shortcut) {
            // Some shortcuts should work even in inputs
            const allowInInput = ['escape', 'f1', 'shift+?', 'ctrl+enter'];

            if (!isInputFocused || allowInInput.includes(shortcutKey)) {
                e.preventDefault();
                try {
                    shortcut.handler();
                    console.log(`Executed shortcut: ${shortcutKey}`);
                } catch (error) {
                    console.error(`Error executing shortcut ${shortcutKey}:`, error);
                }
            }
        }
    }

    handleKeyUp(e) {
        // Handle any key up events if needed
    }

    handleNavigationKeys(e) {
        // Handle arrow keys for suggestion navigation
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (this.isSearchSuggestionsVisible()) {
                e.preventDefault();
                this.navigateSearchSuggestions(e.key === 'ArrowDown' ? 1 : -1);
            }
        }

        // Handle Enter key for suggestions
        if (e.key === 'Enter') {
            if (this.isSearchSuggestionsVisible()) {
                const activeSuggestion = document.querySelector('.search-suggestion.active');
                if (activeSuggestion) {
                    e.preventDefault();
                    this.selectSearchSuggestion(activeSuggestion);
                }
            }
        }

        // Handle Tab key for better navigation
        if (e.key === 'Tab') {
            this.handleTabNavigation(e);
        }
    }

    // Shortcut management
    addShortcut(key, handler, description = '') {
        this.shortcuts.set(key, { handler, description });
    }

    removeShortcut(key) {
        this.shortcuts.delete(key);
    }

    getShortcuts() {
        return Array.from(this.shortcuts.entries()).map(([key, data]) => ({
            key,
            description: data.description
        }));
    }

    // Utility methods
    getShortcutKey(e) {
        const parts = [];

        if (e.ctrlKey || e.metaKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');

        let key = e.key.toLowerCase();

        // Handle special keys
        if (key === ' ') key = 'space';
        if (key === 'arrowup') key = 'up';
        if (key === 'arrowdown') key = 'down';
        if (key === 'arrowleft') key = 'left';
        if (key === 'arrowright') key = 'right';

        parts.push(key);

        return parts.join('+');
    }

    isInputFocused(element) {
        const inputTypes = ['INPUT', 'TEXTAREA', 'SELECT'];
        return inputTypes.includes(element.tagName) ||
               element.contentEditable === 'true' ||
               element.isContentEditable;
    }

    // Shortcut handlers
    clearChat() {
        if (window.chatManager && typeof window.chatManager.clearChat === 'function') {
            window.chatManager.clearChat();
        } else if (typeof window.clearChat === 'function') {
            window.clearChat();
        } else {
            console.warn('Clear chat function not available');
        }
    }

    focusSearch() {
        const searchInput = document.getElementById('messageInput');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }

    sendMessage() {
        const chatForm = document.getElementById('chatForm');
        if (chatForm) {
            chatForm.dispatchEvent(new Event('submit'));
        }
    }

    refreshStats() {
        if (window.statsManager && typeof window.statsManager.refresh === 'function') {
            window.statsManager.refresh();
        } else if (typeof window.loadStats === 'function') {
            window.loadStats();
        } else {
            console.warn('Refresh stats function not available');
        }
    }

    focusUpload() {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    toggleTheme() {
        if (typeof window.toggleTheme === 'function') {
            window.toggleTheme();
        } else {
            console.warn('Toggle theme function not available');
        }
    }

    closeModals() {
        // Close any open modals
        document.querySelectorAll('.modal').forEach(modal => {
            if (modal.style.display === 'flex' || modal.style.display === 'block') {
                modal.style.display = 'none';
            }
        });

        // Hide search suggestions
        if (window.searchManager && typeof window.searchManager.hideSearchSuggestions === 'function') {
            window.searchManager.hideSearchSuggestions();
        }

        // Close any dropdowns
        document.querySelectorAll('.dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }

    showHelp() {
        if (typeof window.showHelp === 'function') {
            window.showHelp();
        } else {
            console.warn('Show help function not available');
        }
    }

    loadDocuments() {
        if (window.documentManager && typeof window.documentManager.loadDocuments === 'function') {
            window.documentManager.loadDocuments();
        } else if (typeof window.loadDocuments === 'function') {
            window.loadDocuments();
        } else {
            console.warn('Load documents function not available');
        }
    }

    toggleSearchMode() {
        if (window.chatManager && typeof window.chatManager.getSearchMode === 'function') {
            const currentMode = window.chatManager.getSearchMode();
            const newMode = currentMode === 'rag' ? 'search' : 'rag';

            if (typeof window.chatManager.setSearchMode === 'function') {
                window.chatManager.setSearchMode(newMode);
            } else if (typeof window.setSearchMode === 'function') {
                window.setSearchMode(newMode);
            }
        } else if (typeof window.setSearchMode === 'function') {
            // Fallback - toggle between modes
            const currentMode = localStorage.getItem('rag_search_mode') || 'rag';
            const newMode = currentMode === 'rag' ? 'search' : 'rag';
            window.setSearchMode(newMode);
        }
    }

    copyLastResponse() {
        try {
            const lastAssistantMessage = document.querySelector('.chat-message.assistant-message:last-of-type .message-text');
            if (lastAssistantMessage) {
                const text = lastAssistantMessage.textContent || lastAssistantMessage.innerText;
                navigator.clipboard.writeText(text).then(() => {
                    if (window.showStatus) {
                        window.showStatus('Response copied to clipboard', 'success');
                    }
                }).catch(err => {
                    console.error('Failed to copy text:', err);
                    if (window.showStatus) {
                        window.showStatus('Failed to copy response', 'error');
                    }
                });
            } else {
                if (window.showStatus) {
                    window.showStatus('No response to copy', 'warning');
                }
            }
        } catch (error) {
            console.error('Error copying last response:', error);
        }
    }

    showShortcuts() {
        const shortcuts = this.getShortcuts();
        const shortcutsHTML = shortcuts.map(shortcut => `
            <div class="shortcut-item">
                <kbd>${shortcut.key.replace(/\+/g, '</kbd> + <kbd>')}</kbd>
                <span>${shortcut.description}</span>
            </div>
        `).join('');

        // Create or update shortcuts modal
        let modal = document.getElementById('shortcutsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'shortcutsModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title">Keyboard Shortcuts</h2>
                        <button class="modal-close" onclick="this.closest('.modal').style.display='none'">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="shortcuts-grid">
                            ${shortcutsHTML}
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            modal.querySelector('.shortcuts-grid').innerHTML = shortcutsHTML;
        }

        modal.style.display = 'flex';
    }

    resetApplication() {
        if (confirm('Are you sure you want to reset the application? This will clear all local data.')) {
            try {
                // Clear localStorage
                localStorage.clear();

                // Clear sessionStorage
                sessionStorage.clear();

                // Reload the page
                window.location.reload();
            } catch (error) {
                console.error('Error resetting application:', error);
                if (window.showStatus) {
                    window.showStatus('Failed to reset application', 'error');
                }
            }
        }
    }

    // Search suggestions navigation
    isSearchSuggestionsVisible() {
        const suggestions = document.querySelector('.search-suggestions');
        return suggestions && suggestions.style.display !== 'none';
    }

    navigateSearchSuggestions(direction) {
        const suggestions = document.querySelectorAll('.search-suggestion');
        if (suggestions.length === 0) return;

        const currentActive = document.querySelector('.search-suggestion.active');
        let newIndex = 0;

        if (currentActive) {
            const currentIndex = Array.from(suggestions).indexOf(currentActive);
            newIndex = currentIndex + direction;

            // Wrap around
            if (newIndex < 0) newIndex = suggestions.length - 1;
            if (newIndex >= suggestions.length) newIndex = 0;

            currentActive.classList.remove('active');
        }

        suggestions[newIndex].classList.add('active');
    }

    selectSearchSuggestion(suggestion) {
        if (window.searchManager && typeof window.searchManager.selectSuggestion === 'function') {
            const text = suggestion.textContent.trim();
            window.searchManager.selectSuggestion(text);
        }
    }

    // Tab navigation improvements
    handleTabNavigation(e) {
        // Improve tab navigation in modals
        const activeModal = document.querySelector('.modal[style*="flex"]');
        if (activeModal) {
            const focusableElements = activeModal.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );

            if (focusableElements.length > 0) {
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];

                if (e.shiftKey && document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                } else if (!e.shiftKey && document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        }
    }

    // Enable/disable keyboard shortcuts
    enable() {
        this.isEnabled = true;
        console.log('Keyboard shortcuts enabled');
    }

    disable() {
        this.isEnabled = false;
        console.log('Keyboard shortcuts disabled');
    }

    toggle() {
        this.isEnabled = !this.isEnabled;
        console.log(`Keyboard shortcuts ${this.isEnabled ? 'enabled' : 'disabled'}`);
    }

    // Public API
    isShortcutsEnabled() {
        return this.isEnabled;
    }

    getShortcutDescription(key) {
        const shortcut = this.shortcuts.get(key);
        return shortcut ? shortcut.description : null;
    }
}

// Initialize keyboard manager
document.addEventListener('DOMContentLoaded', function() {
    window.keyboardManager = new KeyboardManager();
    console.log('Keyboard manager created and registered');
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KeyboardManager;
}