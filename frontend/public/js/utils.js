// RAG Chat Application - Utility Functions
// Common utility functions used throughout the application

class Utils {
    // ID Generation
    static generateId(prefix = 'id') {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    static generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0
            const v = c == 'x' ? r : (r & 0x3 | 0x8)
            return v.toString(16)
        })
    }

    // String Utilities
    static escapeHtml(text) {
        if (!text) return ''
        try {
            const div = document.createElement('div')
            div.textContent = String(text)
            return div.innerHTML
        } catch (error) {
            console.error('Error escaping HTML:', error)
            return String(text)
        }
    }

    static unescapeHtml(html) {
        if (!html) return ''
        try {
            const div = document.createElement('div')
            div.innerHTML = html
            return div.textContent || div.innerText || ''
        } catch (error) {
            console.error('Error unescaping HTML:', error)
            return html
        }
    }

    static truncateText(text, maxLength, suffix = '...') {
        if (!text) return ''
        const textStr = String(text)
        if (textStr.length <= maxLength) return textStr
        return textStr.substring(0, maxLength - suffix.length) + suffix
    }

    static capitalizeFirst(str) {
        if (!str) return ''
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
    }

    static camelCase(str) {
        return str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
    }

    static kebabCase(str) {
        return str.replace(/([a-z])([A-Z])/g, '$1-$2')
                  .replace(/[\s_]+/g, '-')
                  .toLowerCase()
    }

    static slugify(str) {
        return str.toLowerCase()
                  .replace(/[^\w\s-]/g, '')
                  .replace(/[\s_-]+/g, '-')
                  .replace(/^-+|-+$/g, '')
    }

    // Number Utilities
    static formatNumber(num, decimals = 0) {
        if (isNaN(num)) return '0'
        return Number(num).toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        })
    }

    static formatFileSize(bytes) {
        if (!bytes || isNaN(bytes)) return '0 B'

        try {
            const k = 1024
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
            const i = Math.floor(Math.log(bytes) / Math.log(k))
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
        } catch (error) {
            console.error('Error formatting file size:', error)
            return '0 B'
        }
    }

    static formatPercentage(value, total, decimals = 1) {
        if (!total || total === 0) return '0%'
        const percentage = (value / total) * 100
        return `${percentage.toFixed(decimals)}%`
    }

    // Date Utilities
    static formatTimestamp(timestamp, options = {}) {
        if (!timestamp) return 'Unknown'

        try {
            const date = new Date(timestamp)
            if (isNaN(date.getTime())) return 'Invalid Date'

            const defaultOptions = {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }

            return date.toLocaleDateString(undefined, { ...defaultOptions, ...options })
        } catch (error) {
            console.error('Error formatting timestamp:', error)
            return 'Unknown'
        }
    }

    static formatRelativeTime(timestamp) {
        if (!timestamp) return 'Unknown'

        try {
            const date = new Date(timestamp)
            const now = new Date()
            const diffMs = now - date
            const diffSecs = Math.floor(diffMs / 1000)
            const diffMins = Math.floor(diffSecs / 60)
            const diffHours = Math.floor(diffMins / 60)
            const diffDays = Math.floor(diffHours / 24)

            if (diffSecs < 60) return 'Just now'
            if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
            if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
            if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`

            return this.formatTimestamp(timestamp, { year: 'numeric', month: 'short', day: 'numeric' })
        } catch (error) {
            console.error('Error formatting relative time:', error)
            return 'Unknown'
        }
    }

    static isToday(timestamp) {
        try {
            const date = new Date(timestamp)
            const today = new Date()
            return date.toDateString() === today.toDateString()
        } catch (error) {
            return false
        }
    }

    // Array Utilities
    static unique(array) {
        return [...new Set(array)]
    }

    static groupBy(array, key) {
        return array.reduce((groups, item) => {
            const group = typeof key === 'function' ? key(item) : item[key]
            groups[group] = groups[group] || []
            groups[group].push(item)
            return groups
        }, {})
    }

    static sortBy(array, key, direction = 'asc') {
        return [...array].sort((a, b) => {
            const aVal = typeof key === 'function' ? key(a) : a[key]
            const bVal = typeof key === 'function' ? key(b) : b[key]

            if (aVal < bVal) return direction === 'asc' ? -1 : 1
            if (aVal > bVal) return direction === 'asc' ? 1 : -1
            return 0
        })
    }

    static chunk(array, size) {
        const chunks = []
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size))
        }
        return chunks
    }

    // Object Utilities
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj
        if (obj instanceof Date) return new Date(obj.getTime())
        if (obj instanceof Array) return obj.map(item => this.deepClone(item))
        if (typeof obj === 'object') {
            const cloned = {}
            Object.keys(obj).forEach(key => {
                cloned[key] = this.deepClone(obj[key])
            })
            return cloned
        }
    }

    static deepMerge(target, source) {
        const result = { ...target }

        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key])
            } else {
                result[key] = source[key]
            }
        }

        return result
    }

    static pick(obj, keys) {
        const result = {}
        keys.forEach(key => {
            if (key in obj) {
                result[key] = obj[key]
            }
        })
        return result
    }

    static omit(obj, keys) {
        const result = { ...obj }
        keys.forEach(key => {
            delete result[key]
        })
        return result
    }

    // DOM Utilities
    static createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag)

        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value
            } else if (key === 'innerHTML') {
                element.innerHTML = value
            } else if (key === 'textContent') {
                element.textContent = value
            } else if (key.startsWith('data-')) {
                element.setAttribute(key, value)
            } else {
                element[key] = value
            }
        })

        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child))
            } else if (child instanceof Node) {
                element.appendChild(child)
            }
        })

        return element
    }

    static getElementPosition(element) {
        const rect = element.getBoundingClientRect()
        return {
            top: rect.top + window.scrollY,
            left: rect.left + window.scrollX,
            width: rect.width,
            height: rect.height
        }
    }

    static isElementInViewport(element) {
        const rect = element.getBoundingClientRect()
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        )
    }

    static scrollToElement(element, options = {}) {
        const defaultOptions = {
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
        }

        element.scrollIntoView({ ...defaultOptions, ...options })
    }

    // Event Utilities
    static debounce(func, wait, immediate = false) {
        let timeout
        return function executedFunction(...args) {
            const later = () => {
                timeout = null
                if (!immediate) func(...args)
            }
            const callNow = immediate && !timeout
            clearTimeout(timeout)
            timeout = setTimeout(later, wait)
            if (callNow) func(...args)
        }
    }

    static throttle(func, limit) {
        let inThrottle
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args)
                inThrottle = true
                setTimeout(() => inThrottle = false, limit)
            }
        }
    }

    // Storage Utilities
    static setStorage(key, value, type = 'localStorage') {
        try {
            const storage = type === 'sessionStorage' ? sessionStorage : localStorage
            storage.setItem(key, JSON.stringify(value))
            return true
        } catch (error) {
            console.error(`Error setting ${type}:`, error)
            return false
        }
    }

    static getStorage(key, defaultValue = null, type = 'localStorage') {
        try {
            const storage = type === 'sessionStorage' ? sessionStorage : localStorage
            const item = storage.getItem(key)
            return item ? JSON.parse(item) : defaultValue
        } catch (error) {
            console.error(`Error getting ${type}:`, error)
            return defaultValue
        }
    }

    static removeStorage(key, type = 'localStorage') {
        try {
            const storage = type === 'sessionStorage' ? sessionStorage : localStorage
            storage.removeItem(key)
            return true
        } catch (error) {
            console.error(`Error removing ${type}:`, error)
            return false
        }
    }

    static clearStorage(type = 'localStorage') {
        try {
            const storage = type === 'sessionStorage' ? sessionStorage : localStorage
            storage.clear()
            return true
        } catch (error) {
            console.error(`Error clearing ${type}:`, error)
            return false
        }
    }

    // URL Utilities
    static getQueryParams() {
        const params = {}
        const searchParams = new URLSearchParams(window.location.search)
        for (const [key, value] of searchParams) {
            params[key] = value
        }
        return params
    }

    static setQueryParam(key, value) {
        const url = new URL(window.location)
        url.searchParams.set(key, value)
        window.history.replaceState({}, '', url)
    }

    static removeQueryParam(key) {
        const url = new URL(window.location)
        url.searchParams.delete(key)
        window.history.replaceState({}, '', url)
    }

    // Validation Utilities
    static isEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
    }

    static isUrl(url) {
        try {
            new URL(url)
            return true
        } catch {
            return false
        }
    }

    static isEmpty(value) {
        if (value == null) return true
        if (typeof value === 'string') return value.trim().length === 0
        if (Array.isArray(value)) return value.length === 0
        if (typeof value === 'object') return Object.keys(value).length === 0
        return false
    }

    // File Utilities
    static getFileExtension(filename) {
        return filename.toLowerCase().split('.').pop() || ''
    }

    static getMimeType(filename) {
        const ext = this.getFileExtension(filename)
        const mimeTypes = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'txt': 'text/plain',
            'md': 'text/markdown',
            'json': 'application/json',
            'csv': 'text/csv',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif'
        }
        return mimeTypes[ext] || 'application/octet-stream'
    }

    static readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (e) => resolve(e.target.result)
            reader.onerror = (e) => reject(e)
            reader.readAsText(file)
        })
    }

    static readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
                        reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
        });
    }

    static downloadFile(data, filename, mimeType = 'application/octet-stream') {
        try {
            const blob = new Blob([data], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return true;
        } catch (error) {
            console.error('Error downloading file:', error);
            return false;
        }
    }

    // Color Utilities
    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    static rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    static getContrastColor(hexColor) {
        const rgb = this.hexToRgb(hexColor);
        if (!rgb) return '#000000';

        const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
    }

    // Performance Utilities
    static measurePerformance(name, fn) {
        const start = performance.now();
        const result = fn();
        const end = performance.now();
        console.log(`${name} took ${end - start} milliseconds`);
        return result;
    }

    static async measureAsyncPerformance(name, fn) {
        const start = performance.now();
        const result = await fn();
        const end = performance.now();
        console.log(`${name} took ${end - start} milliseconds`);
        return result;
    }

    // Error Handling Utilities
    static safeExecute(fn, fallback = null, context = 'Unknown') {
        try {
            return fn();
        } catch (error) {
            console.error(`Error in ${context}:`, error);
            return fallback;
        }
    }

    static async safeExecuteAsync(fn, fallback = null, context = 'Unknown') {
        try {
            return await fn();
        } catch (error) {
            console.error(`Async error in ${context}:`, error);
            return fallback;
        }
    }

    // Network Utilities
    static async fetchWithTimeout(url, options = {}, timeout = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms`);
            }
            throw error;
        }
    }

    static async retryRequest(fn, maxRetries = 3, delay = 1000) {
        let lastError;

        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
                }
            }
        }

        throw lastError;
    }

    // Browser Detection
    static getBrowserInfo() {
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

    static isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    static isTouch() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    // Feature Detection
    static supportsLocalStorage() {
        try {
            const test = '__localStorage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch {
            return false;
        }
    }

    static supportsWebWorkers() {
        return typeof Worker !== 'undefined';
    }

    static supportsServiceWorkers() {
        return 'serviceWorker' in navigator;
    }

    static supportsWebSockets() {
        return 'WebSocket' in window;
    }

    // Animation Utilities
    static animate(element, keyframes, options = {}) {
        if (!element.animate) {
            console.warn('Web Animations API not supported');
            return null;
        }

        const defaultOptions = {
            duration: 300,
            easing: 'ease-in-out',
            fill: 'forwards'
        };

        return element.animate(keyframes, { ...defaultOptions, ...options });
    }

    static fadeIn(element, duration = 300) {
        return this.animate(element, [
            { opacity: 0 },
            { opacity: 1 }
        ], { duration });
    }

    static fadeOut(element, duration = 300) {
        return this.animate(element, [
            { opacity: 1 },
            { opacity: 0 }
        ], { duration });
    }

    static slideDown(element, duration = 300) {
        const height = element.scrollHeight;
        return this.animate(element, [
            { height: '0px', overflow: 'hidden' },
            { height: `${height}px`, overflow: 'hidden' }
        ], { duration });
    }

    static slideUp(element, duration = 300) {
        return this.animate(element, [
            { height: `${element.scrollHeight}px`, overflow: 'hidden' },
            { height: '0px', overflow: 'hidden' }
        ], { duration });
    }

    // Cookie Utilities
    static setCookie(name, value, days = 7) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
    }

    static getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    static deleteCookie(name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    }

    // Math Utilities
    static clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    static lerp(start, end, factor) {
        return start + (end - start) * factor;
    }

    static randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    static roundTo(value, decimals) {
        return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
    }

    // Search Utilities
    static fuzzySearch(query, items, key = null) {
        if (!query) return items;

        const searchTerm = query.toLowerCase();

        return items.filter(item => {
            const searchText = key ? item[key] : item;
            return searchText.toLowerCase().includes(searchTerm);
        }).sort((a, b) => {
            const aText = key ? a[key] : a;
            const bText = key ? b[key] : b;
            const aIndex = aText.toLowerCase().indexOf(searchTerm);
            const bIndex = bText.toLowerCase().indexOf(searchTerm);

            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });
    }

    static highlightText(text, query) {
        if (!query) return text;

        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    // Clipboard Utilities
    static async copyToClipboard(text) {
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
    }

    static async readFromClipboard() {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                return await navigator.clipboard.readText();
            } else {
                throw new Error('Clipboard API not available');
            }
        } catch (error) {
            console.error('Failed to read from clipboard:', error);
            return null;
        }
    }

    // Logging Utilities
    static createLogger(name, level = 'info') {
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        const currentLevel = levels[level] || 2;

        return {
            error: (...args) => {
                if (currentLevel >= 0) console.error(`[${name}]`, ...args);
            },
            warn: (...args) => {
                if (currentLevel >= 1) console.warn(`[${name}]`, ...args);
            },
            info: (...args) => {
                if (currentLevel >= 2) console.info(`[${name}]`, ...args);
            },
            debug: (...args) => {
                if (currentLevel >= 3) console.debug(`[${name}]`, ...args);
            }
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}

// Make available globally
window.Utils = Utils;

console.log('Utils loaded successfully');