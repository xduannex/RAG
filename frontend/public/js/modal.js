// RAG Chat Application - Modal Management
// Handles modal dialogs, popups, and overlays

class ModalManager {
    constructor() {
        this.modals = new Map();
        this.activeModal = null;
        this.modalStack = [];
        this.init();
    }

    init() {
        console.log('Initializing Modal Manager...');
        this.setupEventListeners();
        this.registerExistingModals();

        // Register globally
        window.modalManager = this;

        console.log('Modal manager initialized');
    }

    setupEventListeners() {
        // Close modal when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.close(e.target.id);
            }
        });

        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModal) {
                this.close(this.activeModal);
            }
        });

        // Handle modal close
                document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close')) {
                const modal = e.target.closest('.modal');
                if (modal) {
                    this.close(modal.id);
                }
            }
        });
    }

    registerExistingModals() {
        // Register existing modals in the DOM
        document.querySelectorAll('.modal').forEach(modal => {
            if (modal.id) {
                this.register(modal.id, modal);
            }
        });
    }

    register(id, modalElement) {
        if (!modalElement) {
            modalElement = document.getElementById(id);
        }

        if (modalElement) {
            this.modals.set(id, {
                element: modalElement,
                isOpen: false,
                options: {}
            });
            console.log(`Modal registered: ${id}`);
        } else {
            console.warn(`Modal element not found: ${id}`);
        }
    }

    create(id, options = {}) {
        const defaultOptions = {
            title: 'Modal',
            content: '',
            size: 'medium', // small, medium, large, fullscreen
            closable: true,
            backdrop: true,
            keyboard: true,
            className: '',
            buttons: []
        };

        const modalOptions = { ...defaultOptions, ...options };

        // Create modal HTML
        const modalHTML = `
            <div class="modal ${modalOptions.className}" id="${id}" style="display: none;">
                <div class="modal-content modal-${modalOptions.size}">
                    <div class="modal-header">
                        <h2 class="modal-title">${modalOptions.title}</h2>
                        ${modalOptions.closable ? `
                            <button class="modal-close" type="button">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                    </div>
                    <div class="modal-body">
                        ${modalOptions.content}
                    </div>
                    ${modalOptions.buttons.length > 0 ? `
                        <div class="modal-footer">
                            ${modalOptions.buttons.map(btn => `
                                <button class="btn ${btn.className || 'btn-secondary'}" 
                                        onclick="${btn.onclick || ''}"
                                        ${btn.attributes || ''}>
                                    ${btn.text}
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        // Add to DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Register the modal
        const modalElement = document.getElementById(id);
        this.register(id, modalElement);

        return modalElement;
    }

    open(id, options = {}) {
        const modal = this.modals.get(id);
        if (!modal) {
            console.warn(`Modal not found: ${id}`);
            return false;
        }

        // Close current modal if specified
        if (options.closeOthers && this.activeModal && this.activeModal !== id) {
            this.close(this.activeModal);
        }

        // Add to modal stack
        if (!this.modalStack.includes(id)) {
            this.modalStack.push(id);
        }

        // Show modal
        modal.element.style.display = 'flex';
        modal.isOpen = true;
        this.activeModal = id;

        // Add body class to prevent scrolling
        document.body.classList.add('modal-open');

        // Focus management
        this.manageFocus(modal.element);

        // Trigger custom event
        const event = new CustomEvent('modalOpen', { detail: { id, modal } });
        document.dispatchEvent(event);

        console.log(`Modal opened: ${id}`);
        return true;
    }

    close(id) {
        const modal = this.modals.get(id);
        if (!modal || !modal.isOpen) {
            return false;
        }

        // Hide modal
        modal.element.style.display = 'none';
        modal.isOpen = false;

        // Remove from modal stack
        const index = this.modalStack.indexOf(id);
        if (index > -1) {
            this.modalStack.splice(index, 1);
        }

        // Update active modal
        if (this.activeModal === id) {
            this.activeModal = this.modalStack.length > 0 ?
                this.modalStack[this.modalStack.length - 1] : null;
        }

        // Remove body class if no modals are open
        if (this.modalStack.length === 0) {
            document.body.classList.remove('modal-open');
        }

        // Restore focus
        this.restoreFocus();

        // Trigger custom event
        const event = new CustomEvent('modalClose', { detail: { id, modal } });
        document.dispatchEvent(event);

        console.log(`Modal closed: ${id}`);
        return true;
    }

    closeAll() {
        const openModals = [...this.modalStack];
        openModals.forEach(id => this.close(id));
    }

    toggle(id) {
        const modal = this.modals.get(id);
        if (!modal) return false;

        return modal.isOpen ? this.close(id) : this.open(id);
    }

    isOpen(id) {
        const modal = this.modals.get(id);
        return modal ? modal.isOpen : false;
    }

    setTitle(id, title) {
        const modal = this.modals.get(id);
        if (modal) {
            const titleElement = modal.element.querySelector('.modal-title');
            if (titleElement) {
                titleElement.textContent = title;
            }
        }
    }

    setContent(id, content) {
        const modal = this.modals.get(id);
        if (modal) {
            const bodyElement = modal.element.querySelector('.modal-body');
            if (bodyElement) {
                bodyElement.innerHTML = content;
            }
        }
    }

    setSize(id, size) {
        const modal = this.modals.get(id);
        if (modal) {
            const contentElement = modal.element.querySelector('.modal-content');
            if (contentElement) {
                // Remove existing size classes
                contentElement.classList.remove('modal-small', 'modal-medium', 'modal-large', 'modal-fullscreen');
                // Add new size class
                contentElement.classList.add(`modal-${size}`);
            }
        }
    }

    manageFocus(modalElement) {
        // Store currently focused element
        this.previouslyFocused = document.activeElement;

        // Focus first focusable element in modal
        const focusableElements = modalElement.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
    }

    restoreFocus() {
        // Restore focus to previously focused element
        if (this.previouslyFocused && typeof this.previouslyFocused.focus === 'function') {
            this.previouslyFocused.focus();
        }
    }

    // Utility methods for common modal types
    alert(title, message, options = {}) {
        const id = 'alertModal';

        if (!this.modals.has(id)) {
            this.create(id, {
                title: title,
                content: `<p>${message}</p>`,
                size: 'small',
                buttons: [
                    {
                        text: 'OK',
                        className: 'btn-primary',
                        onclick: `window.modalManager.close('${id}')`
                    }
                ],
                ...options
            });
        } else {
            this.setTitle(id, title);
            this.setContent(id, `<p>${message}</p>`);
        }

        this.open(id);
    }

    confirm(title, message, onConfirm, onCancel, options = {}) {
        const id = 'confirmModal';

        if (!this.modals.has(id)) {
            this.create(id, {
                title: title,
                content: `<p>${message}</p>`,
                size: 'small',
                buttons: [
                    {
                        text: 'Cancel',
                        className: 'btn-secondary',
                        onclick: `window.modalManager.close('${id}'); ${onCancel ? onCancel.toString() + '()' : ''}`
                    },
                    {
                        text: 'Confirm',
                        className: 'btn-primary',
                        onclick: `window.modalManager.close('${id}'); ${onConfirm ? onConfirm.toString() + '()' : ''}`
                    }
                ],
                ...options
            });
        } else {
            this.setTitle(id, title);
            this.setContent(id, `<p>${message}</p>`);
        }

        this.open(id);
    }

    prompt(title, message, defaultValue = '', onSubmit, options = {}) {
        const id = 'promptModal';
        const inputId = 'promptInput';

        const content = `
            <p>${message}</p>
            <div class="form-group">
                <input type="text" class="form-control" id="${inputId}" 
                       value="${defaultValue}" placeholder="Enter value...">
            </div>
        `;

        if (!this.modals.has(id)) {
            this.create(id, {
                title: title,
                content: content,
                size: 'small',
                buttons: [
                    {
                        text: 'Cancel',
                        className: 'btn-secondary',
                        onclick: `window.modalManager.close('${id}')`
                    },
                    {
                        text: 'Submit',
                        className: 'btn-primary',
                        onclick: `
                            const value = document.getElementById('${inputId}').value;
                            window.modalManager.close('${id}');
                            ${onSubmit ? `(${onSubmit.toString()})(value)` : ''}
                        `
                    }
                ],
                ...options
            });
        } else {
            this.setTitle(id, title);
            this.setContent(id, content);
        }

        this.open(id);

        // Focus the input after modal opens
        setTimeout(() => {
            const input = document.getElementById(inputId);
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
    }

    loading(title = 'Loading...', message = 'Please wait...') {
        const id = 'loadingModal';

        const content = `
            <div class="text-center">
                <div class="loading-spinner large mb-3"></div>
                <p>${message}</p>
            </div>
        `;

        if (!this.modals.has(id)) {
            this.create(id, {
                title: title,
                content: content,
                size: 'small',
                closable: false,
                backdrop: false,
                keyboard: false
            });
        } else {
            this.setTitle(id, title);
            this.setContent(id, content);
        }

        this.open(id);
        return id;
    }

    hideLoading() {
        this.close('loadingModal');
    }

    // Document viewer modal
    showDocument(title, content, options = {}) {
        const id = 'documentViewerModal';

        if (!this.modals.has(id)) {
            this.create(id, {
                title: title,
                content: content,
                size: 'large',
                className: 'document-viewer-modal',
                buttons: [
                    {
                        text: 'Close',
                        className: 'btn-secondary',
                        onclick: `window.modalManager.close('${id}')`
                    }
                ],
                ...options
            });
        } else {
            this.setTitle(id, title);
            this.setContent(id, content);
        }

        this.open(id);
    }

    // Image viewer modal
    showImage(src, title = 'Image Viewer', options = {}) {
        const id = 'imageViewerModal';

        const content = `
            <div class="image-viewer">
                <img src="${src}" alt="${title}" style="max-width: 100%; height: auto;">
            </div>
        `;

        if (!this.modals.has(id)) {
            this.create(id, {
                title: title,
                content: content,
                size: 'large',
                className: 'image-viewer-modal',
                ...options
            });
        } else {
            this.setTitle(id, title);
            this.setContent(id, content);
        }

        this.open(id);
    }

    // Public API
    getActiveModal() {
        return this.activeModal;
    }

    getOpenModals() {
        return [...this.modalStack];
    }

    getModal(id) {
        return this.modals.get(id);
    }

    getAllModals() {
        return Array.from(this.modals.keys());
    }

    destroy(id) {
        const modal = this.modals.get(id);
        if (modal) {
            // Close if open
            if (modal.isOpen) {
                this.close(id);
            }

            // Remove from DOM
            if (modal.element && modal.element.parentNode) {
                modal.element.parentNode.removeChild(modal.element);
            }

            // Remove from registry
            this.modals.delete(id);

            console.log(`Modal destroyed: ${id}`);
        }
    }
}

// Initialize modal manager
document.addEventListener('DOMContentLoaded', function() {
    window.modalManager = new ModalManager();
    console.log('Modal manager created and registered');
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModalManager;
}

