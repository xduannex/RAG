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
        console.log('Initializing Notification Manager...');
        this.setupContainer();
        window.notificationManager = this;
        console.log('Notification manager initialized');
    }

    setupContainer() {
        this.container = document.getElementById('statusContainer');
        if (!this.container) {
            // Create container if it doesn't exist
            this.container = document.createElement('div');
            this.container.id = 'statusContainer';
            this.container.className = 'status-container';
            document.body.appendChild(this.container);
        }
    }

    show(message, type = 'info', duration = this.defaultDuration, options = {}) {
        const notification = {
            id: window.generateId('notification'),
            message: message,
            type: type,
            duration: duration,
            timestamp: new Date(),
            options: options
        };

        this.notifications.push(notification);
        this.renderNotification(notification);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                this.remove(notification.id);
            }, duration);
        }

        // Limit number of notifications
        if (this.notifications.length > this.maxNotifications) {
            const oldestId = this.notifications[0].id;
            this.remove(oldestId);
        }

        return notification.id;
    }

    remove(id) {
        const index = this.notifications.findIndex(n => n.id === id);
        if (index === -1) return;

        const notification = this.notifications[index];
        const element = document.getElementById(notification.id);

        if (element) {
            element.style.animation = 'slideOutRight 0.3s ease-in-out';
            setTimeout(() => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            }, 300);
        }

        this.notifications.splice(index, 1);
    }

    renderNotification(notification) {
        if (!this.container) return;

        const element = document.createElement('div');
        element.id = notification.id;
        element.className = `status-message status-${notification.type}`;

        const icon = this.getIcon(notification.type);
        const closeButton = notification.duration === 0 || notification.options.persistent ?
            '<button class="status-close" onclick="window.notificationManager.remove(\'' + notification.id + '\')">&times;</button>' : '';

        element.innerHTML = `
            <div class="status-icon">${icon}</div>
            <div class="status-text">${window.escapeHtml(notification.message)}</div>
            ${closeButton}
        `;

        // Add click handler for actions
        if (notification.options.action) {
            element.style.cursor = 'pointer';
            element.addEventListener('click', notification.options.action);
        }

        this.container.appendChild(element);

        // Trigger animation
        setTimeout(() => {
            element.style.animation = 'slideInRight 0.3s ease-out';
        }, 10);
    }

    getIcon(type) {
        const icons = {
            'info': '<i class="fas fa-info-circle"></i>',
            'success': '<i class="fas fa-check-circle"></i>',
            'warning': '<i class="fas fa-exclamation-triangle"></i>',
            'error': '<i class="fas fa-times-circle"></i>',
            'loading': '<i class="fas fa-spinner fa-spin"></i>'
        };
        return icons[type] || icons['info'];
    }

    // Convenience methods
    info(message, duration, options) {
        return this.show(message, 'info', duration, options);
    }

    success(message, duration, options) {
        return this.show(message, 'success', duration, options);
    }

    warning(message, duration, options) {
        return this.show(message, 'warning', duration, options);
    }

    error(message, duration, options) {
        return this.show(message, 'error', duration, options);
    }

    loading(message, options) {
        return this.show(message, 'loading', 0, { persistent: true, ...options });
    }

    // Clear all notifications
    clear() {
        this.notifications.forEach(notification => {
            this.remove(notification.id);
        });
    }

    // Get all notifications
    getAll() {
        return [...this.notifications];
    }

    // Update existing notification
    update(id, message, type) {
        const notification = this.notifications.find(n => n.id === id);
        if (!notification) return false;

        notification.message = message;
        if (type) notification.type = type;

        const element = document.getElementById(id);
        if (element) {
            const textElement = element.querySelector('.status-text');
            const iconElement = element.querySelector('.status-icon');

            if (textElement) {
                textElement.textContent = message;
            }

            if (iconElement && type) {
                iconElement.innerHTML = this.getIcon(type);
                element.className = `status-message status-${type}`;
            }
        }

        return true;
    }
}

// Global notification function
window.showStatus = function(message, type = 'info', duration = 5000, options = {}) {
    if (window.notificationManager) {
        return window.notificationManager.show(message, type, duration, options);
    } else {
        // Fallback to console if notification manager not available
        console.log(`[${type.toUpperCase()}] ${message}`);
        return null;
    }
};

// Additional global convenience functions
window.showSuccess = function(message, duration = 3000, options = {}) {
    return window.showStatus(message, 'success', duration, options);
};

window.showError = function(message, duration = 7000, options = {}) {
    return window.showStatus(message, 'error', duration, options);
};

window.showWarning = function(message, duration = 5000, options = {}) {
    return window.showStatus(message, 'warning', duration, options);
};

window.showInfo = function(message, duration = 4000, options = {}) {
    return window.showStatus(message, 'info', duration, options);
};

window.showLoading = function(message, options = {}) {
    return window.showStatus(message, 'loading', 0, { persistent: true, ...options });
};

window.hideNotification = function(id) {
    if (window.notificationManager) {
        window.notificationManager.remove(id);
    }
};

window.clearNotifications = function() {
    if (window.notificationManager) {
        window.notificationManager.clear();
    }
};

// Initialize notification manager immediately
window.notificationManager = new NotificationManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationManager;
}

console.log('Notification manager loaded');