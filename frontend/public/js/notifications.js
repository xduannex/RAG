// RAG Chat Application - Notification System
// Handles status messages, alerts, and user notifications

class NotificationManager {
    constructor() {
        this.notifications = new Map();
        this.container = null;
        this.maxNotifications = 5;
        this.defaultDuration = 5000;
        this.init();
    }

    init() {
        console.log('Initializing Notification Manager...');
        this.createContainer();
        this.setupGlobalFunction();

        // Register globally
        window.notificationManager = this;

        console.log('Notification manager initialized');
    }

    createContainer() {
        // Check if container already exists
        this.container = document.getElementById('notificationContainer');

        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'notificationContainer';
            this.container.className = 'notification-container';
            this.container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                pointer-events: none;
                max-width: 400px;
            `;
            document.body.appendChild(this.container);
        }
    }

    setupGlobalFunction() {
        // Create global showStatus function
        window.showStatus = (message, type = 'info', duration = this.defaultDuration) => {
            return this.show(message, type, duration);
        };
    }

    show(message, type = 'info', duration = this.defaultDuration, options = {}) {
        const id = this.generateId();

        const notification = {
            id: id,
            message: message,
            type: type,
            duration: duration,
            timestamp: Date.now(),
            options: options
        };

        // Remove oldest notification if we're at the limit
        if (this.notifications.size >= this.maxNotifications) {
            const oldestId = Array.from(this.notifications.keys())[0];
            this.remove(oldestId);
        }

        // Add to notifications map
        this.notifications.set(id, notification);

        // Create and show notification element
        const element = this.createElement(notification);
        this.container.appendChild(element);

        // Auto-remove after duration (if duration > 0)
        if (duration > 0) {
            setTimeout(() => {
                this.remove(id);
            }, duration);
        }

        console.log(`Notification shown: [${type.toUpperCase()}] ${message}`);
        return id;
    }

    createElement(notification) {
        const { id, message, type, options } = notification;

        const element = document.createElement('div');
        element.id = `notification-${id}`;
        element.className = `notification notification-${type}`;
        element.style.cssText = `
            background: ${this.getBackgroundColor(type)};
            color: ${this.getTextColor(type)};
            padding: 12px 16px;
            margin-bottom: 8px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border-left: 4px solid ${this.getBorderColor(type)};
            pointer-events: auto;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            position: relative;
            word-wrap: break-word;
            max-width: 100%;
        `;

        // Create content
        const content = document.createElement('div');
        content.className = 'notification-content';
        content.style.cssText = `
            display: flex;
            align-items: flex-start;
            gap: 8px;
        `;

        // Add icon
        const icon = document.createElement('i');
        icon.className = this.getIcon(type);
        icon.style.cssText = `
            margin-top: 2px;
            flex-shrink: 0;
        `;

        // Add message
        const messageDiv = document.createElement('div');
        messageDiv.className = 'notification-message';
        messageDiv.style.cssText = `
            flex: 1;
            line-height: 1.4;
        `;
        messageDiv.textContent = message;

        // Add close button
        const closeButton = document.createElement('button');
        closeButton.className = 'notification-close';
        closeButton.innerHTML = '×';
        closeButton.style.cssText = `
            background: none;
            border: none;
            color: inherit;
            font-size: 18px;
            cursor: pointer;
            padding: 0;
            margin-left: 8px;
            opacity: 0.7;
            flex-shrink: 0;
        `;
        closeButton.onclick = () => this.remove(id);

        content.appendChild(icon);
        content.appendChild(messageDiv);
        content.appendChild(closeButton);
        element.appendChild(content);

        // Add progress bar for timed notifications
        if (notification.duration > 0) {
            const progressBar = document.createElement('div');
            progressBar.className = 'notification-progress';
            progressBar.style.cssText = `
                position: absolute;
                bottom: 0;
                left: 0;
                height: 2px;
                background: ${this.getBorderColor(type)};
                width: 100%;
                transform-origin: left;
                animation: notificationProgress ${notification.duration}ms linear;
            `;
            element.appendChild(progressBar);

            // Add CSS animation
            if (!document.getElementById('notification-styles')) {
                const style = document.createElement('style');
                style.id = 'notification-styles';
                style.textContent = `
                    @keyframes notificationProgress {
                        from { transform: scaleX(1); }
                        to { transform: scaleX(0); }
                    }
                    .notification:hover .notification-progress {
                        animation-play-state: paused;
                    }
                `;
                document.head.appendChild(style);
            }
        }

        // Animate in
        setTimeout(() => {
            element.style.opacity = '1';
            element.style.transform = 'translateX(0)';
        }, 10);

        return element;
    }

    remove(id) {
        const notification = this.notifications.get(id);
        if (!notification) return;

        const element = document.getElementById(`notification-${id}`);
        if (element) {
            // Animate out
            element.style.opacity = '0';
            element.style.transform = 'translateX(100%)';

            setTimeout(() => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            }, 300);
        }

        this.notifications.delete(id);
    }

    removeAll() {
        Array.from(this.notifications.keys()).forEach(id => {
            this.remove(id);
        });
    }

    // Convenience methods
    success(message, duration = this.defaultDuration) {
        return this.show(message, 'success', duration);
    }

    error(message, duration = 0) { // Errors don't auto-dismiss by default
        return this.show(message, 'error', duration);
    }

    warning(message, duration = this.defaultDuration) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration = this.defaultDuration) {
        return this.show(message, 'info', duration);
    }

    loading(message, duration = 0) {
        return this.show(message, 'loading', duration);
    }

    // Utility methods
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getBackgroundColor(type) {
        const colors = {
            success: '#d4edda',
            error: '#f8d7da',
            warning: '#fff3cd',
            info: '#d1ecf1',
            loading: '#e2e3e5'
        };
        return colors[type] || colors.info;
    }

    getTextColor(type) {
        const colors = {
            success: '#155724',
            error: '#721c24',
            warning: '#856404',
            info: '#0c5460',
            loading: '#383d41'
        };
        return colors[type] || colors.info;
    }

    getBorderColor(type) {
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8',
            loading: '#6c757d'
        };
        return colors[type] || colors.info;
    }

    getIcon(type) {
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-triangle',
            warning: 'fas fa-exclamation-circle',
            info: 'fas fa-info-circle',
            loading: 'fas fa-spinner fa-spin'
        };
        return icons[type] || icons.info;
    }

    // Public API
    getActiveNotifications() {
        return Array.from(this.notifications.values());
    }

    getNotificationCount() {
        return this.notifications.size;
    }

    setMaxNotifications(max) {
        this.maxNotifications = max;
    }

    setDefaultDuration(duration) {
        this.defaultDuration = duration;
    }
}

// Initialize notification manager immediately
window.notificationManager = new NotificationManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationManager;
}
