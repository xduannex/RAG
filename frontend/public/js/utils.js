// RAG Chat Application - Utility Functions
// Common utility functions used throughout the application

class Utils {
    constructor() {
        this.init();
    }

    init() {
        // Make utilities available globally
        window.utils = this;
        console.log('Utils initialized');
    }

    // Text and HTML utilities
    escapeHtml(text) {
        if (!text) return '';
        try {
            const div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        } catch (error) {
            console.error('Error escaping HTML:', error);
            return String(text);
        }
    }

    unescapeHtml(html) {
        if (!html) return '';
        try {
            const div = document.createElement('div');
            div.innerHTML = html;
            return div.textContent || div.innerText || '';
        } catch (error) {
            console.error('Error unescaping HTML:', error);
            return String(html);
        }
    }

    truncateText(text, maxLength, suffix = '...') {
        if (!text) return '';
        const textStr = String(text);
        if (textStr.length <= maxLength) return textStr;
        return textStr.substring(0, maxLength - suffix.length) + suffix;
    }

    highlightText(text, searchTerm, className = 'highlight') {
        if (!text || !searchTerm) return text;

        try {
            const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');
            return text.replace(regex, `<span class="${className}">$1</span>`);
        } catch (error) {
            console.error('Error highlighting text:', error);
            return text;
        }
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // File and size utilities
    formatFileSize(bytes) {
        if (!bytes || isNaN(bytes)) return '0 B';

        try {
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        } catch (error) {
            console.error('Error formatting file size:', error);
            return '0 B';
        }
    }

    getFileExtension(filename) {
        if (!filename) return '';
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    getFileIcon(fileType) {
        const iconMap = {
            'pdf': 'file-pdf',
            'doc': 'file-word',
            'docx': 'file-word',
            'txt': 'file-alt',
            'md': 'file-alt',
            'csv': 'file-csv',
            'json': 'file-code',
            'xml': 'file-code',
            'html': 'file-code',
            'xlsx': 'file-excel',
            'xls': 'file-excel',
            'pptx': 'file-powerpoint',
            'ppt': 'file-powerpoint',
            'rtf': 'file-alt',
            'odt': 'file-alt',
            'ods': 'file-excel',
            'odp': 'file-powerpoint',
            'zip': 'file-archive',
            'rar': 'file-archive',
            '7z': 'file-archive',
            'jpg': 'file-image',
            'jpeg': 'file-image',
            'png': 'file-image',
            'gif': 'file-image',
            'bmp': 'file-image',
            'svg': 'file-image',
            'mp4': 'file-video',
            'avi': 'file-video',
            'mov': 'file-video',
            'mp3': 'file-audio',
            'wav': 'file-audio',
            'flac': 'file-audio'
        };
        return iconMap[fileType?.toLowerCase()] || 'file';
    }

    // Date and time utilities
    formatTimestamp(timestamp, options = {}) {
        if (!timestamp) return 'Unknown';

        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return 'Unknown';

            const defaultOptions = {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            };

            return date.toLocaleDateString(undefined, { ...defaultOptions, ...options });
        } catch (error) {
            console.error('Error formatting timestamp:', error);
            return 'Unknown';
        }
    }

    formatRelativeTime(timestamp) {
        if (!timestamp) return 'Unknown';

        try {
            const now = new Date();
            const time = new Date(timestamp);
            const diffMs = now - time;
            const diffSecs = Math.floor(diffMs / 1000);
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffSecs < 60) return 'Just now';
            if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
            if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
            if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
            if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`;
            if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? 's' : ''} ago`;
            return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) !== 1 ? 's' : ''} ago`;
        } catch (error) {
            console.error('Error formatting relative time:', error);
            return 'Unknown';
        }
    }

    formatDuration(milliseconds) {
        if (!milliseconds || isNaN(milliseconds)) return '0ms';

        const ms = Math.floor(milliseconds);
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else if (seconds > 0) {
            return `${seconds}s`;
        } else {
            return `${ms}ms`;
        }
    }

    // URL and validation utilities
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    sanitizeFilename(filename) {
        if (!filename) return '';
        return filename.replace(/[^a-z0-9.-]/gi, '_').replace(/_{2,}/g, '_');
    }

    // Array and object utilities
    debounce(func, wait, immediate = false) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func(...args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func(...args);
        };
    }

    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (typeof obj === 'object') {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = this.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    }

    isEmpty(value) {
        if (value == null) return true;
        if (typeof value === 'string') return value.trim().length === 0;
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    }

    // DOM utilities
    createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);

        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else if (key === 'textContent') {
                element.textContent = value;
            } else if (key.startsWith('on') && typeof value === 'function') {
                element.addEventListener(key.slice(2).toLowerCase(), value);
            } else {
                element.setAttribute(key, value);
            }
        });

        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                element.appendChild(child);
            }
        });

        return element;
    }

    findAncestor(element, selector) {
        while (element && element !== document) {
            if (element.matches && element.matches(selector)) {
                return element;
            }
            element = element.parentElement;
        }
        return null;
    }

    isElementInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    scrollToElement(element, options = {}) {
        if (!element) return;

        const defaultOptions = {
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
        };

        element.scrollIntoView({ ...defaultOptions, ...options });
    }

    // Storage utilities
    setLocalStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Error setting localStorage:', error);
            return false;
        }
    }

    getLocalStorage(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Error getting localStorage:', error);
            return defaultValue;
        }
    }

    removeLocalStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Error removing localStorage:', error);
            return false;
        }
    }

    clearLocalStorage() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Error clearing localStorage:', error);
            return false;
        }
    }

    // Network utilities
    async makeRequest(url, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 30000
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), mergedOptions.timeout);

            const response = await fetch(url, {
                ...mergedOptions,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

                try {
                    const errorData = await response.json();
                    if (errorData.detail) {
                        errorMessage += ` - ${errorData.detail}`;
                    } else if (errorData.message) {
                        errorMessage += ` - ${errorData.message}`;
                    }
                } catch (jsonError) {
                    // If we can't parse the error response, use the status text
                    console.warn('Could not parse error response:', jsonError);
                }

                throw new Error(errorMessage);
            }

            return response;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error: Unable to connect to server');
            }
            throw error;
        }
    }

    // Validation utilities
    validateFileType(file, allowedTypes) {
        if (!file || !allowedTypes) return false;

        const fileExtension = this.getFileExtension(file.name);
        return allowedTypes.includes(fileExtension);
    }

    validateFileSize(file, maxSize) {
        if (!file || !maxSize) return false;
        return file.size <= maxSize;
    }

    // Color utilities
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    // Random utilities
    generateId(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Performance utilities
    measurePerformance(name, fn) {
        const start = performance.now();
        const result = fn();
        const end = performance.now();
        console.log(`${name} took ${end - start} milliseconds`);
        return result;
    }

    async measureAsyncPerformance(name, fn) {
        const start = performance.now();
        const result = await fn();
        const end = performance.now();
        console.log(`${name} took ${end - start} milliseconds`);
        return result;
    }

    // Browser detection utilities
    getBrowserInfo() {
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        let version = 'Unknown';

        if (ua.includes('Chrome')) {
            browser = 'Chrome';
            version = ua.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
        } else if (ua.includes('Firefox')) {
            browser = 'Firefox';
            version = ua.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
        } else if (ua.includes('Safari')) {
            browser = 'Safari';
            version = ua.match(/Version\/(\d+)/)?.[1] || 'Unknown';
        } else if (ua.includes('Edge')) {
            browser = 'Edge';
            version = ua.match(/Edge\/(\d+)/)?.[1] || 'Unknown';
        }

        return { browser, version, userAgent: ua };
    }

    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    isOnline() {
        return navigator.onLine;
    }

    // Error handling utilities
    handleError(error, context = 'Unknown') {
        console.error(`Error in ${context}:`, error);

        if (window.showStatus) {
            let message = `Error in ${context}`;
            if (error.message) {
                message += `: ${error.message}`;
            }
            window.showStatus(message, 'error');
        }

        // You could also send errors to a logging service here
        // this.logError(error, context);
    }

    // Development utilities
    isDevelopment() {
        return window.location.hostname === 'localhost' ||
               window.location.hostname === '127.0.0.1' ||
               window.location.hostname.includes('dev');
    }

    log(...args) {
        if (this.isDevelopment()) {
            console.log('[RAG]', ...args);
        }
    }

    warn(...args) {
        if (this.isDevelopment()) {
            console.warn('[RAG]', ...args);
        }
    }

    error(...args) {
        console.error('[RAG]', ...args);
    }
}

// Initialize utils
window.utils = new Utils();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}

