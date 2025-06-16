// RAG Chat Application - Keyboard Shortcuts and Navigation
// Handles keyboard shortcuts and accessibility features

class KeyboardManager {
    constructor() {
        this.shortcuts = new Map();
        this.isEnabled = true;
        this.focusableElements = [
            'input', 'textarea', 'select', 'button', 'a[href]',
            '[tabindex]:not([tabindex="-1"])', '[contenteditable]'
        ];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.registerDefaultShortcuts();
        this.setupFocusManagement();
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Handle focus visibility
        document.addEventListener('mousedown', () => {
            document.body.classList.add('using-mouse');
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                document.body.classList.remove('using-mouse');
            }
        });
    }

    registerDefaultShortcuts() {
        // Chat shortcuts
        this.addShortcut('ctrl+l', () => {
            if (typeof clearChat === 'function') {
                clearChat();
            }
        }, 'Clear chat');

        this.addShortcut('ctrl+r', (e) => {
            e.preventDefault();
            if (typeof loadStats === 'function') {
                loadStats();
            }
        }, 'Refresh stats');

        this.addShortcut('ctrl+/', () => {
            if (typeof showHelp === 'function') {
                showHelp();
            }
        }, 'Show help');

        // Theme shortcuts
        this.addShortcut('ctrl+shift+t', () => {
            if (typeof toggleTheme === 'function') {
                toggleTheme();
            }
        }, 'Toggle theme');

        // Focus shortcuts
        this.addShortcut('ctrl+shift+f', () => {
            this.focusSearchInput();
        }, 'Focus search input');

        this.addShortcut('ctrl+shift+u', () => {
            this.focusUploadArea();
        }, 'Focus upload area');

        // Navigation shortcuts
        this.addShortcut('escape', () => {
            this.handleEscape();
        }, 'Close modals/cancel');

        // Upload shortcuts
        this.addShortcut('ctrl+u', () => {
            this.triggerFileUpload();
        }, 'Upload file');
    }

    addShortcut(keys, callback, description = '') {
        const normalizedKeys = this.normalizeKeys(keys);
        this.shortcuts.set(normalizedKeys, {
            callback,
            description,
            keys: normalizedKeys
        });
        console.log(`Registered shortcut: ${keys} - ${description}`);
    }

    removeShortcut(keys) {
        const normalizedKeys = this.normalizeKeys(keys);
        return this.shortcuts.delete(normalizedKeys);
    }

    normalizeKeys(keys) {
        return keys.toLowerCase()
            .replace(/\s+/g, '')
            .split('+')
            .sort()
            .join('+');
    }

    handleKeyDown(e) {
        if (!this.isEnabled) return;

        // Don't handle shortcuts when typing in inputs (except for specific cases)
        if (this.isTypingInInput(e.target) && !this.isGlobalShortcut(e)) {
            return;
        }

        const keyCombo = this.getKeyCombo(e);
        const shortcut = this.shortcuts.get(keyCombo);

        if (shortcut) {
            try {
                shortcut.callback(e);
                console.log(`Executed shortcut: ${keyCombo}`);
            } catch (error) {
                console.error(`Error executing shortcut ${keyCombo}:`, error);
            }
        }
    }

    handleKeyUp(e) {
        // Handle any key up events if needed
    }

    getKeyCombo(e) {
        const keys = [];

        if (e.ctrlKey || e.metaKey) keys.push('ctrl');
        if (e.altKey) keys.push('alt');
        if (e.shiftKey) keys.push('shift');

        const key = e.key.toLowerCase();
        if (key !== 'control' && key !== 'alt' && key !== 'shift' && key !== 'meta') {
            keys.push(key);
        }

        return keys.sort().join('+');
    }

    isTypingInInput(element) {
        const tagName = element.tagName.toLowerCase();
        return tagName === 'input' ||
               tagName === 'textarea' ||
               tagName === 'select' ||
               element.contentEditable === 'true';
    }

    isGlobalShortcut(e) {
        const keyCombo = this.getKeyCombo(e);
        const globalShortcuts = ['escape', 'ctrl+/', 'ctrl+shift+t'];
        return globalShortcuts.includes(keyCombo);
    }

    focusSearchInput() {
        const searchInput = document.getElementById('messageInput');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }

    focusUploadArea() {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    triggerFileUpload() {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    handleEscape() {
        // Close any open modals
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (modal.style.display === 'flex' || modal.classList.contains('show')) {
                modal.style.display = 'none';
                modal.classList.remove('show');
            }
        });

        // Clear focus from active element
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }

        // Hide any dropdowns or suggestions
        const dropdowns = document.querySelectorAll('.dropdown.show, .search-suggestions');
        dropdowns.forEach(dropdown => {
            dropdown.classList.remove('show');
            dropdown.style.display = 'none';
        });
    }

    setupFocusManagement() {
        // Add focus styles
        const style = document.createElement('style');
        style.textContent = `
            .using-mouse *:focus {
                outline: none !important;
            }
            
            :not(.using-mouse) *:focus {
                outline: 2px solid var(--color-primary, #007bff) !important;
                outline-offset: 2px !important;
            }
            
            .skip-link {
                position: absolute;
                top: -40px;
                left: 6px;
                background: var(--color-primary, #007bff);
                color: white;
                padding: 8px;
                text-decoration: none;
                z-index: 9999;
                border-radius: 4px;
                transition: top 0.3s;
            }
            
            .skip-link:focus {
                top: 6px;
            }
        `;
        document.head.appendChild(style);

        // Add skip link if not present
        if (!document.querySelector('.skip-link')) {
            const skipLink = document.createElement('a');
            skipLink.href = '#main-content';
            skipLink.className = 'skip-link';
            skipLink.textContent = 'Skip to main content';
            document.body.insertBefore(skipLink, document.body.firstChild);
        }
    }

    getFocusableElements(container = document) {
        const selector = this.focusableElements.join(', ');
        return Array.from(container.querySelectorAll(selector))
            .filter(el => !el.disabled && el.offsetParent !== null);
    }

    trapFocus(container) {
        const focusableElements = this.getFocusableElements(container);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const handleTabKey = (e) => {
            if (e.key !== 'Tab') return;

            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } else {
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        };

        container.addEventListener('keydown', handleTabKey);

        // Focus first element
        if (firstElement) {
            firstElement.focus();
        }

        // Return cleanup function
        return () => {
            container.removeEventListener('keydown', handleTabKey);
        };
    }

    enable() {
        this.isEnabled = true;
        console.log('Keyboard shortcuts enabled');
    }

    disable() {
        this.isEnabled = false;
        console.log('Keyboard shortcuts disabled');
    }

    getShortcuts() {
        return Array.from(this.shortcuts.entries()).map(([keys, shortcut]) => ({
            keys,
            description: shortcut.description
        }));
    }

    showShortcutsHelp() {
        const shortcuts = this.getShortcuts();
        const helpContent = shortcuts.map(shortcut =>
            `<div class="shortcut-item">
                <kbd>${shortcut.keys.replace(/\+/g, '</kbd> + <kbd>')}</kbd>
                <span>${shortcut.description}</span>
            </div>`
        ).join('');

        // Create or update help modal content
        let helpModal = document.getElementById('shortcutsHelpModal');
        if (!helpModal) {
            helpModal = document.createElement('div');
            helpModal.id = 'shortcutsHelpModal';
            helpModal.className = 'modal';
            helpModal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Keyboard Shortcuts</h2>
                        <button class="modal-close" onclick="this.closest('.modal').style.display='none'">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="shortcuts-list">${helpContent}</div>
                    </div>
                </div>
            `;
            document.body.appendChild(helpModal);
        } else {
            helpModal.querySelector('.shortcuts-list').innerHTML = helpContent;
        }

        helpModal.style.display = 'flex';
        this.trapFocus(helpModal);
    }
}

// Initialize keyboard manager
const keyboardManager = new KeyboardManager();

// Global functions
window.showKeyboardShortcuts = () => keyboardManager.showShortcutsHelp();
window.addKeyboardShortcut = (keys, callback, description) =>
    keyboardManager.addShortcut(keys, callback, description);

console.log('Keyboard manager loaded successfully');