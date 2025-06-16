// RAG Chat Application - Notification System
// Handles status messages, alerts, and user notifications

class NotificationManager {
    constructor() {
        this.notifications = [];
        this.container = null;
        this.maxNotifications = 5;
        this.defaultDuration = 5000;
        this.init();
    }

    init() {
        this.createContainer();
        this.setupStyles();
    }

    createContainer() {
        // Remove existing container if it exists
        const existing = document.getElementById('notificationContainer');
        if (existing) {
            existing.remove();
        }

        this.container = document.createElement('div');
        this.container.id = 'notificationContainer';
        this.container.className = 'notification-container';
        document.body.appendChild(this.container);
    }

    setupStyles() {
        // Add CSS styles if not already present
        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                .notification-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 10000;
                    pointer-events: none;
                }

                .notification {
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    margin-bottom: 10px;
                    padding: 16px;
                    min-width: 300px;
                    max-width: 400px;
                    pointer-events: auto;
                    transform: translateX(100%);
                    transition: all 0.3s ease;
                    border-left: 4px solid #007bff;
                }

                .notification.show {
                    transform: translateX(0);
                }

                .notification.success {
                    border-left-color: #28a745;
                }

                .notification.error {
                    border-left-color: #dc3545;
                }

                .notification.warning {
                    border-left-color: #ffc107;
                }

                .notification.info {
                    border-left-color: #17a2b8;
                }

                .notification-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }

                .notification-icon {
                    margin-right: 8px;
                    font-size: 18px;
                }

                .notification-icon.success {
                    color: #28a745;
                }

                .notification-icon.error {
                    color: #dc3545;
                }

                .notification-icon.warning {
                    color: #ffc107;
                }

                .notification-icon.info {
                    color: #17a2b8;
                }

                .notification-close {
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    color: #6c757d;
                    padding: 0;
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .notification-close:hover {
                    color: #495057;
                }

                .notification-message {
                    font-size: 14px;
                    line-height: 1.4;
                    color: #495057;
                }

                .notification-progress {
                    height: 2px;
                    background: rgba(0, 0, 0, 0.1);
                    margin-top: 12px;
                    border-radius: 1px;
                    overflow: hidden;
                }

                .notification-progress-bar {
                    height: 100%;
                    background: currentColor;
                    transition: width linear;
                }

                @media (max-width: 768px) {
                    .notification-container {
                        left: 20px;
                        right: 20px;
                        top: 20px;
                    }

                    .notification {
                        min-width: auto;
                        max-width: none;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    show(message, type = 'info', options = {}) {
        const notification = this.createNotification(message, type, options);
        this.addNotification(notification);
        return notification.id;
    }

    createNotification(message, type, options) {
        const id = 'notification-' + Date.now() + Math.random();
        const duration = options.duration !== undefined ? options.duration : this.defaultDuration;
        const showProgress = options.showProgress !== false && duration > 0;

        const notification = {
            id,
            message,
            type,
            duration,
            showProgress,
            element: null,
            timeout: null,
            progressInterval: null
        };

        // Create DOM element
        const element = document.createElement('div');
        element.className = `notification ${type}`;
        element.id = id;

        const iconMap = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        element.innerHTML = `
            <div class="notification-header">
                <div>
                    <i class="notification-icon ${type} ${iconMap[type] || iconMap.info}"></i>
                    <span class="notification-title">${this.getTypeTitle(type)}</span>
                </div>
                <button class="notification-close" onclick="notificationManager.dismiss('${id}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="notification-message">${escapeHtml(message)}</div>
            ${showProgress ? '<div class="notification-progress"><div class="notification-progress-bar"></div></div>' : ''}
        `;

        notification.element = element;

        // Setup auto-dismiss
        if (duration > 0) {
            this.setupAutoDismiss(notification);
        }

        return notification;
    }

    getTypeTitle(type) {
        const titles = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Info'
        };
        return titles[type] || 'Notification';
    }

    addNotification(notification) {
        // Remove oldest notifications if we exceed the limit
        while (this.notifications.length >= this.maxNotifications) {
            const oldest = this.notifications.shift();
            this.dismiss(oldest.id);
        }

        // Add to container
        this.container.appendChild(notification.element);
        this.notifications.push(notification);

        // Trigger animation
        requestAnimationFrame(() => {
            notification.element.classList.add('show');
        });
    }

    setupAutoDismiss(notification) {
        if (notification.showProgress) {
            // Animate progress bar
            const progressBar = notification.element.querySelector('.notification-progress-bar');
            if (progressBar) {
                progressBar.style.width = '100%';
                progressBar.style.transitionDuration = notification.duration + 'ms';

                requestAnimationFrame(() => {
                    progressBar.style.width = '0%';
                });
            }
        }

        // Set timeout for dismissal
        notification.timeout = setTimeout(() => {
            this.dismiss(notification.id);
        }, notification.duration);
    }

    dismiss(id) {
        const index = this.notifications.findIndex(n => n.id === id);
        if (index === -1) return;

        const notification = this.notifications[index];

        // Clear timeouts
        if (notification.timeout) {
            clearTimeout(notification.timeout);
        }
        if (notification.progressInterval) {
            clearInterval(notification.progressInterval);
        }

        // Animate out
        if (notification.element) {
            notification.element.classList.remove('show');

            setTimeout(() => {
                if (notification.element && notification.element.parentNode) {
                    notification.element.parentNode.removeChild(notification.element);
                }
            }, 300);
        }

        // Remove from array
        this.notifications.splice(index, 1);
    }

    dismissAll() {
        const ids = this.notifications.map(n => n.id);
        ids.forEach(id => this.dismiss(id));
    }

    success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    error(message, options = {}) {
        return this.show(message, 'error', { duration: 0, ...options });
    }

    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    info(message, options = {}) {
        return this.show(message, 'info', options);
    }

    // Persistent notification that doesn't auto-dismiss
    persistent(message, type = 'info', options = {}) {
        return this.show(message, type, { duration: 0, ...options });
    }

    // Update an existing notification
    update(id, message, type) {
        const notification = this.notifications.find(n => n.id === id);
        if (!notification) return false;

        const messageElement = notification.element.querySelector('.notification-message');
        if (messageElement) {
            messageElement.textContent = message;
        }

        if (type && type !== notification.type) {
            notification.element.className = `notification ${type} show`;
            notification.type = type;
        }

        return true;
    }

    getNotificationCount() {
        return this.notifications.length;
    }

    getNotifications() {
        return this.notifications.map(n => ({
            id: n.id,
            message: n.message,
            type: n.type,
            duration: n.duration
        }));
    }
}

// Initialize notification manager
const notificationManager = new NotificationManager();

// Global showStatus function that uses the notification manager
window.showStatus = (message, type = 'info', duration = 5000) => {
    return notificationManager.show(message, type, { duration });
};

// Additional global functions
window.showSuccess = (message, options) => notificationManager.success(message, options);
window.showError = (message, options) => notificationManager.error(message, options);
window.showWarning = (message, options) => notificationManager.warning(message, options);
window.showInfo = (message, options) => notificationManager.info(message, options);

console.log('Notification manager loaded successfully');