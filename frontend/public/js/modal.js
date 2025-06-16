// RAG Chat Application - Modal Management
// Handles modal dialogs, popups, and overlays

class ModalManager {
    constructor() {
        this.activeModals = [];
        this.modalStack = [];
        this.backdropClickClose = true;
        this.escapeKeyClose = true;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createBackdrop();
        this.setupStyles();
    }

    setupEventListeners() {
        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.escapeKeyClose && this.activeModals.length > 0) {
                this.closeTopModal();
            }
        });

        // Handle backdrop clicks
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-backdrop') && this.backdropClickClose) {
                this.closeTopModal();
            }
        });
    }

    createBackdrop() {
        if (document.getElementById('modal-backdrop')) return;

        const backdrop = document.createElement('div');
        backdrop.id = 'modal-backdrop';
        backdrop.className = 'modal-backdrop';
        backdrop.style.display = 'none';
        document.body.appendChild(backdrop);
    }

    setupStyles() {
        if (document.getElementById('modal-styles')) return;

        const style = document.createElement('style');
        style.id = 'modal-styles';
        style.textContent = `
            .modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 1000;
                opacity: 0;
                transition: opacity 0.3s ease;
            }

            .modal-backdrop.show {
                opacity: 1;
            }

            .modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 1001;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }

            .modal.show {
                display: flex;
            }

            .modal-content {
                background: var(--color-surface, white);
                border-radius: 8px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                max-width: 90vw;
                max-height: 90vh;
                overflow: hidden;
                transform: scale(0.7);
                opacity: 0;
                transition: all 0.3s ease;
            }

            .modal.show .modal-content {
                transform: scale(1);
                opacity: 1;
            }

            .modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 20px;
                border-bottom: 1px solid var(--color-border, #e0e0e0);
            }

            .modal-title {
                margin: 0;
                font-size: 1.25rem;
                font-weight: 600;
                color: var(--color-text, #333);
            }

            .modal-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                color: var(--color-text-secondary, #666);
                padding: 4px;
                border-radius: 4px;
                transition: all 0.2s ease;
            }

            .modal-close:hover {
                background: var(--color-hover, #f5f5f5);
                color: var(--color-text, #333);
            }

            .modal-body {
                padding: 20px;
                overflow-y: auto;
                max-height: calc(90vh - 140px);
            }

            .modal-footer {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 10px;
                padding: 20px;
                border-top: 1px solid var(--color-border, #e0e0e0);
            }

            .modal-sm .modal-content { max-width: 400px; }
            .modal-md .modal-content { max-width: 600px; }
            .modal-lg .modal-content { max-width: 800px; }
            .modal-xl .modal-content { max-width: 1200px; }

            .modal-fullscreen .modal-content {
                max-width: 100vw;
                max-height: 100vh;
                width: 100%;
                height: 100%;
                border-radius: 0;
            }

            @media (max-width: 768px) {
                .modal-content {
                    max-width: 95vw;
                    max-height: 95vh;
                }
                
                .modal-header,
                .modal-body,
                .modal-footer {
                    padding: 15px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    show(modalId, options = {}) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`Modal with id "${modalId}" not found`);
            return false;
        }

        const config = {
            backdrop: options.backdrop !== false,
            keyboard: options.keyboard !== false,
            focus: options.focus !== false,
            size: options.size || 'md',
            ...options
        };

        // Add size class
        if (config.size) {
            modal.classList.add(`modal-${config.size}`);
        }

        // Show backdrop
        if (config.backdrop) {
            this.showBackdrop();
        }

        // Add to active modals
        this.activeModals.push({
            id: modalId,
            element: modal,
            config
        });

        // Show modal
        modal.classList.add('show');
        modal.style.display = 'flex';

        // Focus management
        if (config.focus) {
            this.focusModal(modal);
        }

        // Trap focus
        if (config.trapFocus !== false) {
            this.trapFocus(modal);
        }

        // Trigger event
        this.triggerEvent(modal, 'modal:show', { config });

        console.log(`Modal "${modalId}" shown`);
        return true;
    }

    hide(modalId) {
        const modalIndex = this.activeModals.findIndex(m => m.id === modalId);
        if (modalIndex === -1) {
            console.warn(`Modal "${modalId}" is not active`);
            return false;
        }

        const modalData = this.activeModals[modalIndex];
        const modal = modalData.element;

        // Hide modal
        modal.classList.remove('show');

        // Wait for animation to complete
        setTimeout(() => {
            modal.style.display = 'none';

            // Remove size classes
            modal.classList.remove('modal-sm', 'modal-md', 'modal-lg', 'modal-xl');
        }, 300);

        // Remove from active modals
        this.activeModals.splice(modalIndex, 1);

        // Hide backdrop if no more modals
        if (this.activeModals.length === 0) {
            this.hideBackdrop();
        }

        // Restore focus
        this.restoreFocus();

        // Trigger event
        this.triggerEvent(modal, 'modal:hide');

        console.log(`Modal "${modalId}" hidden`);
        return true;
    }

    closeTopModal() {
        if (this.activeModals.length > 0) {
            const topModal = this.activeModals[this.activeModals.length - 1];
            this.hide(topModal.id);
        }
    }

    closeAll() {
        const modalIds = this.activeModals.map(m => m.id);
        modalIds.forEach(id => this.hide(id));
    }

    showBackdrop() {
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop) {
            backdrop.style.display = 'block';
            // Force reflow
            backdrop.offsetHeight;
            backdrop.classList.add('show');
        }
    }

    hideBackdrop() {
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop) {
            backdrop.classList.remove('show');
            setTimeout(() => {
                backdrop.style.display = 'none';
            }, 300);
        }
    }

    focusModal(modal) {
        // Find first focusable element
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
    }

    trapFocus(modal) {
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

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

        modal.addEventListener('keydown', handleTabKey);

        // Store cleanup function
        modal._focusTrapCleanup = () => {
            modal.removeEventListener('keydown', handleTabKey);
        };
    }

    restoreFocus() {
        // Restore focus to previously focused element
        if (this.previouslyFocused) {
            this.previouslyFocused.focus();
            this.previouslyFocused = null;
        }
    }

    triggerEvent(modal, eventName, detail = {}) {
        const event = new CustomEvent(eventName, {
            detail: { modal, ...detail },
            bubbles: true
        });
        modal.dispatchEvent(event);
    }

    createModal(options = {}) {
        const modalId = options.id || `modal-${Date.now()}`;
        const modal = document.createElement('div');

        modal.id = modalId;
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                ${options.header ? `
                    <div class="modal-header">
                        <h2 class="modal-title">${options.title || 'Modal'}</h2>
                        ${options.closable !== false ? `
                            <button class="modal-close" data-modal-close="${modalId}">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                    </div>
                ` : ''}
                <div class="modal-body">
                    ${options.content || ''}
                </div>
                ${options.footer ? `
                    <div class="modal-footer">
                        ${options.footer}
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);

        // Add close button event listener
        const closeBtn = modal.querySelector('[data-modal-close]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide(modalId));
        }

        return modalId;
    }

    confirm(message, options = {}) {
        return new Promise((resolve) => {
            const modalId = this.createModal({
                title: options.title || 'Confirm',
                content: `<p>${message}</p>`,
                footer: `
                    <button class="btn btn-secondary" data-action="cancel">
                        ${options.cancelText || 'Cancel'}
                    </button>
                    <button class="btn btn-primary" data-action="confirm">
                        ${options.confirmText || 'Confirm'}
                    </button>
                `,
                closable: options.closable !== false
            });

            const modal = document.getElementById(modalId);

            const handleAction = (e) => {
                const action = e.target.dataset.action;
                if (action === 'confirm') {
                    resolve(true);
                } else if (action === 'cancel') {
                    resolve(false);
                }
                this.hide(modalId);
                setTimeout(() => modal.remove(), 300);
            };

            modal.addEventListener('click', handleAction);
            modal.addEventListener('modal:hide', () => {
                resolve(false);
                setTimeout(() => modal.remove(), 300);
            });

            this.show(modalId, { size: 'sm' });
        });
    }

    alert(message, options = {}) {
        return new Promise((resolve) => {
            const modalId = this.createModal({
                title: options.title || 'Alert',
                content: `<p>${message}</p>`,
                footer: `
                    <button class="btn btn-primary" data-action="ok">
                        ${options.okText || 'OK'}
                    </button>
                `,
                closable: options.closable !== false
            });

            const modal = document.getElementById(modalId);

            const handleAction = () => {
                resolve(true);
                this.hide(modalId);
                setTimeout(() => modal.remove(), 300);
            };

            modal.addEventListener('click', (e) => {
                if (e.target.dataset.action === 'ok') {
                    handleAction();
                }
            });

            modal.addEventListener('modal:hide', () => {
                resolve(true);
                setTimeout(() => modal.remove(), 300);
            });

            this.show(modalId, { size: 'sm' });
        });
    }

    prompt(message, defaultValue = '', options = {}) {
        return new Promise((resolve) => {
            const modalId = this.createModal({
                title: options.title || 'Input',
                content: `
                    <p>${message}</p>
                    <input type="text" class="form-control" id="prompt-input" value="${defaultValue}" placeholder="${options.placeholder || ''}">
                `,
                footer: `
                    <button class="btn btn-secondary" data-action="cancel">
                        ${options.cancelText || 'Cancel'}
                    </button>
                    <button class="btn btn-primary" data-action="ok">
                        ${options.okText || 'OK'}
                    </button>
                `,
                closable: options.closable !== false
            });

            const modal = document.getElementById(modalId);
            const input = modal.querySelector('#prompt-input');

            const handleAction = (e) => {
                const action = e.target.dataset.action;
                if (action === 'ok') {
                    resolve(input.value);
                } else if (action === 'cancel') {
                    resolve(null);
                }
                this.hide(modalId);
                setTimeout(() => modal.remove(), 300);
            };

            modal.addEventListener('click', handleAction);
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target === input) {
                    resolve(input.value);
                    this.hide(modalId);
                    setTimeout(() => modal.remove(), 300);
                }
            });

            modal.addEventListener('modal:hide', () => {
                resolve(null);
                setTimeout(() => modal.remove(), 300);
            });

            this.show(modalId, { size: 'sm' });
            input.focus();
            input.select();
        });
    }

    loading(message = 'Loading...', options = {}) {
        const modalId = this.createModal({
            content: `
                <div class="text-center">
                    <div class="loading-spinner mb-3"></div>
                    <p>${message}</p>
                </div>
            `,
            closable: false
        });

        this.show(modalId, {
            backdrop: false,
            keyboard: false,
            size: 'sm',
            ...options
        });

        return {
            close: () => {
                this.hide(modalId);
                setTimeout(() => {
                    const modal = document.getElementById(modalId);
                    if (modal) modal.remove();
                }, 300);
            },
            updateMessage: (newMessage) => {
                const modal = document.getElementById(modalId);
                const messageEl = modal.querySelector('p');
                if (messageEl) {
                    messageEl.textContent = newMessage;
                }
            }
        };
    }

    getActiveModals() {
        return this.activeModals.map(m => ({
            id: m.id,
            config: m.config
        }));
    }

    isModalActive(modalId) {
        return this.activeModals.some(m => m.id === modalId);
    }
}

// Initialize modal manager
const modalManager = new ModalManager();

// Global functions
window.showModal = (id, options) => modalManager.show(id, options);
window.hideModal = (id) => modalManager.hide(id);
window.createModal = (options) => modalManager.createModal(options);
window.confirmDialog = (message, options) => modalManager.confirm(message, options);
window.alertDialog = (message, options) => modalManager.alert(message, options);
window.promptDialog = (message, defaultValue, options) => modalManager.prompt(message, defaultValue, options);
window.showLoadingModal = (message, options) => modalManager.loading(message, options);

// Auto-setup existing modals
document.addEventListener('DOMContentLoaded', () => {
    // Setup close buttons
    document.querySelectorAll('[data-modal-close]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.dataset.modalClose ||
                           e.target.closest('[data-modal-close]')?.dataset.modalClose;
            if (modalId) {
                modalManager.hide(modalId);
            }
        });
    });

    // Setup trigger buttons
    document.querySelectorAll('[data-modal-show]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.dataset.modalShow ||
                           e.target.closest('[data-modal-show]')?.dataset.modalShow;
            if (modalId) {
                modalManager.show(modalId);
            }
            });
    });
});

console.log('Modal manager loaded successfully');