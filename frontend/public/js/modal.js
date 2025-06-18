// RAG Chat Application - Modal Management
// Handles modal dialogs and overlays

class ModalManager {
    constructor() {
        this.activeModals = new Set();
        this.init();
    }

    init() {
        console.log('Initializing Modal Manager...');
        this.setupEventListeners();
        window.modalManager = this;
        console.log('Modal manager initialized');
    }

    setupEventListeners() {
        // Close modal on escape key
                document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeTopModal();
            }
        });

        // Close modal on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.close(e.target.id);
            }
        });

        // Handle modal close buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
                const modal = e.target.closest('.modal');
                if (modal) {
                    this.close(modal.id);
                }
            }
        });
    }

    open(modalId, options = {}) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`Modal with id "${modalId}" not found`);
            return false;
        }

        // Add to active modals
        this.activeModals.add(modalId);

        // Show modal
        modal.style.display = 'flex';
        modal.classList.add('show');

        // Focus management
        if (options.focusElement) {
            const focusElement = modal.querySelector(options.focusElement);
            if (focusElement) {
                setTimeout(() => focusElement.focus(), 100);
            }
        } else {
            // Focus first focusable element
            const focusableElements = modal.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusableElements.length > 0) {
                setTimeout(() => focusableElements[0].focus(), 100);
            }
        }

        // Prevent body scroll
        if (this.activeModals.size === 1) {
            document.body.style.overflow = 'hidden';
        }

        // Trigger custom event
        modal.dispatchEvent(new CustomEvent('modal:open', { detail: options }));

        return true;
    }

    close(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`Modal with id "${modalId}" not found`);
            return false;
        }

        // Remove from active modals
        this.activeModals.delete(modalId);

        // Hide modal
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);

        // Restore body scroll if no modals are open
        if (this.activeModals.size === 0) {
            document.body.style.overflow = '';
        }

        // Trigger custom event
        modal.dispatchEvent(new CustomEvent('modal:close'));

        return true;
    }

    closeAll() {
        const modalIds = Array.from(this.activeModals);
        modalIds.forEach(id => this.close(id));
    }

    closeTopModal() {
        if (this.activeModals.size > 0) {
            const modalIds = Array.from(this.activeModals);
            const topModalId = modalIds[modalIds.length - 1];
            this.close(topModalId);
        }
    }

    isOpen(modalId) {
        return this.activeModals.has(modalId);
    }

    getActiveModals() {
        return Array.from(this.activeModals);
    }

    // Create dynamic modal
    create(options = {}) {
        const modalId = options.id || window.generateId('modal');
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal';

        const content = document.createElement('div');
        content.className = 'modal-content';

        // Header
        if (options.title) {
            const header = document.createElement('div');
            header.className = 'modal-header';
            header.innerHTML = `
                <h2 class="modal-title">${window.escapeHtml(options.title)}</h2>
                <button class="modal-close">
                    <i class="fas fa-times"></i>
                </button>
            `;
            content.appendChild(header);
        }

        // Body
        const body = document.createElement('div');
        body.className = 'modal-body';
        if (options.content) {
            if (typeof options.content === 'string') {
                body.innerHTML = options.content;
            } else {
                body.appendChild(options.content);
            }
        }
        content.appendChild(body);

        // Footer
        if (options.buttons && options.buttons.length > 0) {
            const footer = document.createElement('div');
            footer.className = 'modal-footer';

            options.buttons.forEach(button => {
                const btn = document.createElement('button');
                btn.className = `btn ${button.class || 'btn-primary'}`;
                btn.textContent = button.text;
                if (button.onclick) {
                    btn.addEventListener('click', button.onclick);
                }
                footer.appendChild(btn);
            });

            content.appendChild(footer);
        }

        modal.appendChild(content);
        document.body.appendChild(modal);

        return modalId;
    }

    // Confirm dialog
    confirm(message, title = 'Confirm', options = {}) {
        return new Promise((resolve) => {
            const modalId = this.create({
                title: title,
                content: `<p>${window.escapeHtml(message)}</p>`,
                buttons: [
                    {
                        text: options.cancelText || 'Cancel',
                        class: 'btn-secondary',
                        onclick: () => {
                            this.close(modalId);
                            this.destroy(modalId);
                            resolve(false);
                        }
                    },
                    {
                        text: options.confirmText || 'OK',
                        class: options.confirmClass || 'btn-primary',
                        onclick: () => {
                            this.close(modalId);
                            this.destroy(modalId);
                            resolve(true);
                        }
                    }
                ]
            });

            this.open(modalId);
        });
    }

    // Alert dialog
    alert(message, title = 'Alert', options = {}) {
        return new Promise((resolve) => {
            const modalId = this.create({
                title: title,
                content: `<p>${window.escapeHtml(message)}</p>`,
                buttons: [
                    {
                        text: options.buttonText || 'OK',
                        class: options.buttonClass || 'btn-primary',
                        onclick: () => {
                            this.close(modalId);
                            this.destroy(modalId);
                            resolve();
                        }
                    }
                ]
            });

            this.open(modalId);
        });
    }

    // Prompt dialog
    prompt(message, defaultValue = '', title = 'Input', options = {}) {
        return new Promise((resolve) => {
            const inputId = window.generateId('input');
            const content = `
                <p>${window.escapeHtml(message)}</p>
                <input type="text" id="${inputId}" class="form-control" value="${window.escapeHtml(defaultValue)}" placeholder="${window.escapeHtml(options.placeholder || '')}">
            `;

            const modalId = this.create({
                title: title,
                content: content,
                buttons: [
                    {
                        text: options.cancelText || 'Cancel',
                        class: 'btn-secondary',
                        onclick: () => {
                            this.close(modalId);
                            this.destroy(modalId);
                            resolve(null);
                        }
                    },
                    {
                        text: options.confirmText || 'OK',
                        class: options.confirmClass || 'btn-primary',
                        onclick: () => {
                            const input = document.getElementById(inputId);
                            const value = input ? input.value : '';
                            this.close(modalId);
                            this.destroy(modalId);
                            resolve(value);
                        }
                    }
                ]
            });

            this.open(modalId, { focusElement: `#${inputId}` });
        });
    }

    // Destroy modal
    destroy(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            this.close(modalId);
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }, 300);
        }
    }
}

// Global modal functions
window.openModal = function(modalId, options = {}) {
    if (window.modalManager) {
        return window.modalManager.open(modalId, options);
    }
    return false;
};

window.closeModal = function(modalId) {
    if (window.modalManager) {
        return window.modalManager.close(modalId);
    }
    return false;
};

window.showHelp = function() {
    return window.openModal('helpModal');
};

window.hideHelp = function() {
    return window.closeModal('helpModal');
};

window.showSearchHistory = function() {
    return window.openModal('searchHistoryModal');
};

window.hideSearchHistory = function() {
    return window.closeModal('searchHistoryModal');
};

window.openDocumentViewer = function(documentId) {
    if (window.documentManager) {
        return window.documentManager.openDocumentViewer(documentId);
    }
    return false;
};

window.closeDocumentViewer = function() {
    return window.closeModal('documentViewerModal');
};

// Initialize modal manager immediately
window.modalManager = new ModalManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModalManager;
}

console.log('Modal manager loaded');