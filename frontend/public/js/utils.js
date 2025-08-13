// RAG Chat Application - Utility Functions
// Common utility functions used across the application

// Safe localStorage wrapper
window.safeLocalStorage = {
    get: function(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn('Failed to get from localStorage:', error);
            return defaultValue;
        }
    },

    set: function(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('Failed to set localStorage:', error);
            return false;
        }
    },

    remove: function(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.warn('Failed to remove from localStorage:', error);
            return false;
        }
    },

    clear: function() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.warn('Failed to clear localStorage:', error);
            return false;
        }
    }
};

// Connection checker
window.checkConnection = async function() {
    try {
        const response = await fetch('/health', {
            method: 'GET',
            cache: 'no-cache'
        });

        const isConnected = response.ok;
        window.isConnected = isConnected;

        const indicator = document.getElementById('connectionIndicator');
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');

        if (indicator && statusText) {
            if (isConnected) {
                indicator.className = 'connection-indicator connected';
                statusText.textContent = 'Connected';
            } else {
                indicator.className = 'connection-indicator disconnected';
                statusText.textContent = 'Disconnected';
            }
        }

        return isConnected;
    } catch (error) {
        console.warn('Connection check failed:', error);
        window.isConnected = false;

        const indicator = document.getElementById('connectionIndicator');
        const statusText = document.getElementById('statusText');

        if (indicator && statusText) {
            indicator.className = 'connection-indicator disconnected';
            statusText.textContent = 'Disconnected';
        }

        return false;
    }
};
// Debounce function
window.debounce = function(func, wait, immediate) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func.apply(this, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(this, args);
    };
};

// Throttle function
window.throttle = function(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// Deep clone function
window.deepClone = function(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => window.deepClone(item));
    if (typeof obj === 'object') {
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = window.deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
};

// Generate unique ID
window.generateId = function(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Format bytes to human readable
window.formatFileSize = function(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format timestamp
window.formatTimestamp = function(timestamp) {
    if (!timestamp) return 'Unknown';
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return 'Unknown';
                return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (error) {
        return 'Unknown';
    }
};

// Format relative time (e.g., "2 hours ago")
window.formatRelativeTime = function(timestamp) {
    if (!timestamp) return 'Unknown';
    try {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        return window.formatTimestamp(timestamp);
    } catch (error) {
        return 'Unknown';
    }
};

// Get file type icon
window.getFileTypeIcon = function(filename) {
    if (!filename) return 'fas fa-file file-type-text';
    const extension = filename.split('.').pop()?.toLowerCase();
    const iconMap = {
        'pdf': 'fas fa-file-pdf file-type-pdf',
        'doc': 'fas fa-file-word file-type-word',
        'docx': 'fas fa-file-word file-type-word',
        'xlsx': 'fas fa-file-excel file-type-excel',
        'xls': 'fas fa-file-excel file-type-excel',
        'pptx': 'fas fa-file-powerpoint file-type-powerpoint',
        'ppt': 'fas fa-file-powerpoint file-type-powerpoint',
        'txt': 'fas fa-file-alt file-type-text',
        'md': 'fas fa-file-alt file-type-text',
        'rtf': 'fas fa-file-alt file-type-text',
        'csv': 'fas fa-file-csv file-type-csv',
        'json': 'fas fa-file-code file-type-json',
        'xml': 'fas fa-file-code file-type-xml',
        'html': 'fas fa-file-code file-type-html',
        'htm': 'fas fa-file-code file-type-html',
        'jpg': 'fas fa-file-image file-type-image',
        'jpeg': 'fas fa-file-image file-type-image',
        'png': 'fas fa-file-image file-type-image',
        'bmp': 'fas fa-file-image file-type-image',
        'tiff': 'fas fa-file-image file-type-image',
        'tif': 'fas fa-file-image file-type-image',
        'gif': 'fas fa-file-image file-type-image',
        'webp': 'fas fa-file-image file-type-image'
    };
    return iconMap[extension] || 'fas fa-file file-type-text';
};

// Get file type name
window.getFileTypeName = function(filename) {
    if (!filename) return 'Unknown';
    const extension = filename.split('.').pop()?.toLowerCase();
    const typeMap = {
        'pdf': 'PDF Document',
        'doc': 'Word Document',
        'docx': 'Word Document',
        'xlsx': 'Excel Spreadsheet',
        'xls': 'Excel Spreadsheet',
        'pptx': 'PowerPoint Presentation',
        'ppt': 'PowerPoint Presentation',
        'txt': 'Text File',
        'md': 'Markdown File',
        'rtf': 'Rich Text Format',
        'csv': 'CSV File',
        'json': 'JSON File',
        'xml': 'XML File',
        'html': 'HTML File',
        'htm': 'HTML File',
        'jpg': 'JPEG Image',
        'jpeg': 'JPEG Image',
        'png': 'PNG Image',
        'bmp': 'BMP Image',
        'tiff': 'TIFF Image',
        'tif': 'TIFF Image',
        'gif': 'GIF Image',
        'webp': 'WebP Image'
    };
    return typeMap[extension] || 'Unknown File Type';
};

// Escape HTML
window.escapeHtml = function(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
};

// Unescape HTML
window.unescapeHtml = function(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
};

// Truncate text
window.truncateText = function(text, maxLength, suffix = '...') {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
};

// Validate email
window.isValidEmail = function(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

// Validate URL
window.isValidUrl = function(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

// Copy to clipboard
window.copyToClipboard = async function(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const result = document.execCommand('copy');
            document.body.removeChild(textArea);
            return result;
        }
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
    }
};

// Download file
window.downloadFile = function(data, filename, type = 'text/plain') {
    try {
        const blob = new Blob([data], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return true;
    } catch (error) {
        console.error('Failed to download file:', error);
        return false;
    }
};

// Parse query string
window.parseQueryString = function(queryString) {
    const params = {};
    const pairs = (queryString || window.location.search.slice(1)).split('&');

    for (const pair of pairs) {
        if (pair) {
            const [key, value] = pair.split('=');
            params[decodeURIComponent(key)] = decodeURIComponent(value || '');
        }
    }

    return params;
};

// Build query string
window.buildQueryString = function(params) {
    return Object.entries(params)
        .filter(([key, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
};

// Scroll to element
window.scrollToElement = function(element, options = {}) {
    if (typeof element === 'string') {
        element = document.querySelector(element);
    }

    if (element) {
        element.scrollIntoView({
            behavior: options.behavior || 'smooth',
            block: options.block || 'start',
            inline: options.inline || 'nearest'
        });
    }
};

// Get element position
window.getElementPosition = function(element) {
    if (typeof element === 'string') {
        element = document.querySelector(element);
    }

    if (!element) return { top: 0, left: 0 };

    const rect = element.getBoundingClientRect();
    return {
        top: rect.top + window.pageYOffset,
        left: rect.left + window.pageXOffset,
        width: rect.width,
        height: rect.height
    };
};

// Check if element is in viewport
window.isElementInViewport = function(element) {
    if (typeof element === 'string') {
        element = document.querySelector(element);
    }

    if (!element) return false;

    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
};

// Wait for element to appear
window.waitForElement = function(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver((mutations, obs) => {
            const element = document.querySelector(selector);
            if (element) {
                obs.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
    });
};

// Format number with commas
window.formatNumber = function(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Parse number from formatted string
window.parseFormattedNumber = function(str) {
    if (!str) return 0;
    return parseFloat(str.toString().replace(/,/g, '')) || 0;
};

// Random string generator
window.randomString = function(length = 10, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Color utilities
window.colorUtils = {
    hexToRgb: function(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },

    rgbToHex: function(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    },

    lighten: function(color, amount) {
        const rgb = this.hexToRgb(color);
        if (!rgb) return color;

        const r = Math.min(255, rgb.r + amount);
        const g = Math.min(255, rgb.g + amount);
        const b = Math.min(255, rgb.b + amount);

        return this.rgbToHex(r, g, b);
    },

    darken: function(color, amount) {
        const rgb = this.hexToRgb(color);
        if (!rgb) return color;

        const r = Math.max(0, rgb.r - amount);
        const g = Math.max(0, rgb.g - amount);
        const b = Math.max(0, rgb.b - amount);

        return this.rgbToHex(r, g, b);
    }
};

// Device detection
window.deviceInfo = {
    isMobile: function() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    isTablet: function() {
        return /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent);
    },

    isDesktop: function() {
        return !this.isMobile() && !this.isTablet();
    },

    isTouchDevice: function() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    },

    getScreenSize: function() {
        return {
            width: window.innerWidth || document.documentElement.clientWidth,
            height: window.innerHeight || document.documentElement.clientHeight
        };
    }
};

// Performance utilities
window.performance = window.performance || {};
window.performanceUtils = {
    mark: function(name) {
        if (window.performance.mark) {
            window.performance.mark(name);
        }
    },

    measure: function(name, startMark, endMark) {
        if (window.performance.measure) {
            window.performance.measure(name, startMark, endMark);
        }
    },

    getEntries: function() {
        return window.performance.getEntries ? window.performance.getEntries() : [];
    },

    clearMarks: function() {
        if (window.performance.clearMarks) {
            window.performance.clearMarks();
        }
    }
};

// Initialize connection check on load
document.addEventListener('DOMContentLoaded', function() {
    // Initial connection check
    window.checkConnection();

    // Periodic connection check
    setInterval(window.checkConnection, 30000); // Check every 30 seconds
});

console.log('Utilities loaded');

