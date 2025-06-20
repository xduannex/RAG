// RAG Chat Application - Main Application Controller
// Coordinates all managers and handles global functionality

class RAGApplication {
    constructor() {
        this.apiBaseUrl = window.API_BASE_URL || 'http://localhost:8000';
        this.isOnline = navigator.onLine;
        this.connectionStatus = 'disconnected';
        this.managers = {};

        try {
            this.setupManagers();
        } catch (error) {
            console.error('❌ Failed to setup managers:', error);
            this.showCriticalError('Failed to setup managers: ' + error.message);
            return;
        }

        this.init();
    }

    setupManagers() {
        console.log('Setting up managers...');

        // Add checks for required dependencies
        if (!window.API_BASE_URL) {
            console.warn('API_BASE_URL not defined, using default');
            window.API_BASE_URL = this.apiBaseUrl;
        }

        try {
            // Initialize each manager with error handling
            console.log('Creating SearchManager...');
            if (typeof SearchManager !== 'undefined') {
                this.searchManager = new SearchManager(this.apiBaseUrl);
                this.managers.search = this.searchManager;
            } else {
                console.warn('SearchManager class not found');
            }

            console.log('Creating UploadManager...');
            if (typeof UploadManager !== 'undefined') {
                this.uploadManager = new UploadManager(this.apiBaseUrl);
                this.managers.upload = this.uploadManager;
            } else {
                console.warn('UploadManager class not found');
            }

            console.log('Creating DocumentManager...');
            if (typeof DocumentManager !== 'undefined') {
                this.documentManager = new DocumentManager(this.apiBaseUrl);
                this.managers.document = this.documentManager;
            } else {
                console.warn('DocumentManager class not found');
            }

            console.log('Creating StatsManager...');
            if (typeof StatsManager !== 'undefined') {
                this.statsManager = new StatsManager(this.apiBaseUrl);
                this.managers.stats = this.statsManager;
            } else {
                console.warn('StatsManager class not found');
            }

            // Create ChatManager if it exists
            console.log('Creating ChatManager...');
            if (typeof ChatManager !== 'undefined') {
                this.chatManager = new ChatManager(this.apiBaseUrl);
                this.managers.chat = this.chatManager;
            } else {
                console.warn('ChatManager class not found - creating basic chat functionality');
                this.createBasicChatManager();
            }

            console.log('✅ All available managers created successfully');

        } catch (error) {
            console.error('❌ Error creating managers:', error);
            throw new Error('Manager creation failed: ' + error.message);
        }
    }

    createBasicChatManager() {
        // Create a basic chat manager if the full one doesn't exist
        this.chatManager = {
            messages: [],
            currentMode: 'rag',

            async sendMessage(message, mode = 'rag') {
                try {
                    const response = await fetch(this.apiBaseUrl + '/search/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            query: message,
                            mode: mode,
                            limit: 10
                        })
                    });

                    if (!response.ok) {
                        throw new Error('HTTP error! status: ' + response.status);
                    }

                    return await response.json();
                } catch (error) {
                    console.error('Chat error:', error);
                    throw error;
                }
            },

            clearChat: function() {
                this.messages = [];
                const chatMessages = document.getElementById('chatMessages');
                if (chatMessages) {
                    chatMessages.innerHTML = '';
                }
            },

            setSearchMode: function(mode) {
                this.currentMode = mode;
                console.log('Chat mode set to: ' + mode);
            }
        };

        this.managers.chat = this.chatManager;
    }

    async init() {
        console.log('🚀 Initializing RAG Application...');

        try {
            // Initialize theme
            this.initializeTheme();

            // Setup global event listeners
            this.setupGlobalEventListeners();

            // Initialize connection monitoring
            this.initializeConnectionMonitoring();

            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.initializeManagers());
            } else {
                await this.initializeManagers();
            }

            // Setup keyboard shortcuts
            this.setupKeyboardShortcuts();

            // Initialize service worker if available
            this.initializeServiceWorker();

            // Setup manager communication
            this.setupManagerCommunication();

            // Perform initial data load
            await this.performInitialLoad();

            console.log('✅ RAG Application initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize RAG Application:', error);
            this.showCriticalError('Failed to initialize application: ' + error.message);
        }
    }

    async initializeManagers() {
        try {
            console.log('🔄 Starting manager initialization...');

            const managers = [
                { name: 'searchManager', manager: this.searchManager },
                { name: 'uploadManager', manager: this.uploadManager },
                { name: 'documentManager', manager: this.documentManager },
                { name: 'statsManager', manager: this.statsManager },
                { name: 'chatManager', manager: this.chatManager }
            ];

            // Initialize managers that exist and have initialize method
            for (const item of managers) {
                const name = item.name;
                const manager = item.manager;

                if (manager) {
                    try {
                        if (typeof manager.initialize === 'function') {
                            console.log('Initializing ' + name + '...');
                            await manager.initialize();
                            console.log('✅ ' + name + ' initialized');
                        } else {
                            console.log('ℹ️ ' + name + ' has no initialize method - already initialized');
                        }
                    } catch (error) {
                        console.error('❌ ' + name + ' initialization failed:', error);
                        // Continue with other managers
                    }
                } else {
                    console.warn('⚠️ ' + name + ' is not available');
                }
            }

            // Set global references for backward compatibility
            window.searchManager = this.searchManager;
            window.uploadManager = this.uploadManager;
            window.documentManager = this.documentManager;
            window.statsManager = this.statsManager;
            window.chatManager = this.chatManager;

            console.log('✅ All managers initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize managers:', error);
            throw error;
        }
    }

    setupManagerCommunication() {
        // Setup event listeners for manager communication
        document.addEventListener('documentUploaded', (e) => {
            console.log('Document uploaded event received');
            if (this.managers.document) {
                this.managers.document.refreshDocuments();
            }
            if (this.managers.stats) {
                this.managers.stats.updateStats();
            }
        });

        document.addEventListener('documentDeleted', (e) => {
            console.log('Document deleted event received');
            if (this.managers.document) {
                this.managers.document.refreshDocuments();
            }
            if (this.managers.stats) {
                this.managers.stats.updateStats();
            }
        });

        document.addEventListener('searchPerformed', (e) => {
            console.log('Search performed event received');
            if (this.managers.search && e.detail) {
                this.managers.search.addToSearchHistory(
                    e.detail.query,
                    e.detail.mode,
                    e.detail.resultCount
                );
            }
        });
    }

    async performInitialLoad() {
        console.log('📊 Performing initial data load...');

        try {
            // Check API health
            await this.checkAPIHealth();

            // Load initial data in parallel
            const loadPromises = [];

            if (this.managers.document && typeof this.managers.document.loadDocuments === 'function') {
                loadPromises.push(this.managers.document.loadDocuments());
            }

            if (this.managers.stats && typeof this.managers.stats.loadStats === 'function') {
                loadPromises.push(this.managers.stats.loadStats());
            }

            await Promise.allSettled(loadPromises);

            // Load chat history if available
            if (this.managers.chat && typeof this.managers.chat.loadMessageHistory === 'function') {
                this.managers.chat.loadMessageHistory();
            }

            console.log('✅ Initial data load completed');

        } catch (error) {
            console.warn('⚠️ Some initial data failed to load:', error);
        }
    }

    async checkAPIHealth() {
        try {
            const response = await fetch(this.apiBaseUrl + '/health', {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (response.ok) {
                const health = await response.json();
                this.updateConnectionStatus('connected');
                console.log('🟢 API health check passed:', health);
            } else {
                throw new Error('Health check failed: ' + response.status);
            }

        } catch (error) {
            console.warn('🟡 API health check failed:', error);
            this.updateConnectionStatus('disconnected');
        }
    }

    initializeTheme() {
        // Load saved theme preference
        const savedTheme = localStorage.getItem('rag_theme') || 'light';
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        const body = document.body;
        const themeIcon = document.getElementById('themeIcon');

        if (theme === 'dark') {
            body.classList.add('theme-dark');
            if (themeIcon) {
                themeIcon.className = 'fas fa-sun';
            }
            window.isDarkMode = true;
        } else {
            body.classList.remove('theme-dark');
            if (themeIcon) {
                themeIcon.className = 'fas fa-moon';
            }
            window.isDarkMode = false;
        }

        localStorage.setItem('rag_theme', theme);
        console.log('🎨 Theme set to: ' + theme);
    }

    toggleTheme() {
        const currentTheme = window.isDarkMode ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);

        if (window.showStatus) {
            window.showStatus('Switched to ' + newTheme + ' theme', 'success');
        }
    }

    setupGlobalEventListeners() {
        // Online/offline detection
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.hideOfflineIndicator();
            this.checkAPIHealth();
            if (window.showStatus) {
                window.showStatus('Connection restored', 'success');
            }
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showOfflineIndicator();
            this.updateConnectionStatus('disconnected');
            if (window.showStatus) {
                window.showStatus('Connection lost - working offline', 'warning');
            }
        });

        // Visibility change detection
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isOnline) {
                // Page became visible, refresh connection status
                this.checkAPIHealth();
            }
        });

        // Unload event for cleanup
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        // Error handling
        window.addEventListener('error', (e) => {
            console.error('Global error:', e.error);
            this.handleGlobalError(e.error);
        });

        window.addEventListener('unhandledrejection', (e) => {
            console.error('Unhandled promise rejection:', e.reason);
            this.handleGlobalError(e.reason);
        });
    }

    initializeConnectionMonitoring() {
        // Periodic health checks
        setInterval(async () => {
            if (this.isOnline) {
                await this.checkAPIHealth();
            }
        }, 30000); // Check every 30 seconds

        // Initial connection status
        this.updateConnectionStatus('connecting');
    }

    updateConnectionStatus(status) {
        this.connectionStatus = status;

        const indicator = document.getElementById('connectionIndicator');
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');

        if (!indicator || !statusText || !statusDot) return;

        // Remove all status classes
        indicator.classList.remove('connected', 'disconnected', 'connecting');

        switch (status) {
            case 'connected':
                indicator.classList.add('connected');
                statusText.textContent = 'Connected';
                break;
            case 'disconnected':
                indicator.classList.add('disconnected');
                statusText.textContent = 'Disconnected';
                break;
            case 'connecting':
                indicator.classList.add('connecting');
                statusText.textContent = 'Connecting...';
                break;
        }

        window.isConnected = status === 'connected';
    }

    showOfflineIndicator() {
        const indicator = document.getElementById('offlineIndicator');
        if (indicator) {
            indicator.style.display = 'flex';
        }
    }

    hideOfflineIndicator() {
        const indicator = document.getElementById('offlineIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs (except for specific cases)
            const isInputFocused = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'l':
                        if (!isInputFocused) {
                            e.preventDefault();
                            this.clearChat();
                        }
                        break;
                    case 'r':
                        if (!isInputFocused) {
                            e.preventDefault();
                            this.refreshStats();
                        }
                        break;
                    case 'k':
                        e.preventDefault();
                        this.focusSearch();
                        break;
                    case 'd':
                                                if (!isInputFocused) {
                            e.preventDefault();
                            this.toggleTheme();
                        }
                        break;
                    case 'u':
                        if (!isInputFocused) {
                            e.preventDefault();
                            this.focusUpload();
                        }
                        break;
                }
            } else {
                switch (e.key) {
                    case 'F1':
                        e.preventDefault();
                        this.showHelp();
                        break;
                    case '?':
                        if (!isInputFocused) {
                            e.preventDefault();
                            this.showHelp();
                        }
                        break;
                    case 'Escape':
                        this.handleEscapeKey();
                        break;
                }
            }
        });
    }

    initializeServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('🔧 Service Worker registered:', registration);
                })
                .catch(error => {
                    console.log('⚠️ Service Worker registration failed:', error);
                });
        }
    }

    // Keyboard shortcut handlers
    clearChat() {
        if (this.managers.chat) {
            this.managers.chat.clearChat();
        }
    }

    refreshStats() {
        if (this.managers.stats && typeof this.managers.stats.loadStats === 'function') {
            this.managers.stats.loadStats();
        }
        if (this.managers.document && typeof this.managers.document.refreshDocuments === 'function') {
            this.managers.document.refreshDocuments();
        }
    }

    focusSearch() {
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.focus();
        }
    }

    focusUpload() {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    showHelp() {
        const helpModal = document.getElementById('helpModal');
        if (helpModal) {
            helpModal.style.display = 'flex';
            helpModal.classList.add('show');

            // Focus management
            const closeButton = helpModal.querySelector('.modal-close');
            if (closeButton) {
                closeButton.focus();
            }
        }
    }

    hideHelp() {
        const helpModal = document.getElementById('helpModal');
        if (helpModal) {
            helpModal.style.display = 'none';
            helpModal.classList.remove('show');
        }
    }

    handleEscapeKey() {
        // Close any open modals
        const modals = document.querySelectorAll('.modal.show, .modal[style*="flex"]');
        modals.forEach(modal => {
            modal.style.display = 'none';
            modal.classList.remove('show');
        });

        // Hide search suggestions
        if (this.managers.search && typeof this.managers.search.hideSuggestions === 'function') {
            this.managers.search.hideSuggestions();
        }
    }

    handleGlobalError(error) {
        console.error('Handling global error:', error);

        // Don't show status for network errors if offline
        if (!this.isOnline && error.message && error.message.includes('fetch')) {
            return;
        }

        if (window.showStatus) {
            window.showStatus('An unexpected error occurred', 'error');
        }
    }

    showCriticalError(message) {
        const errorHTML = '<div class="critical-error">' +
            '<div class="error-icon">' +
            '<i class="fas fa-exclamation-triangle"></i>' +
            '</div>' +
            '<div class="error-message">' +
            '<h3>Application Error</h3>' +
            '<p>' + message + '</p>' +
            '<button class="btn btn-primary" onclick="location.reload()">' +
            '<i class="fas fa-refresh"></i> Reload Application' +
            '</button>' +
            '</div>' +
            '</div>';

        document.body.innerHTML = errorHTML;
    }

    cleanup() {
        console.log('🧹 Cleaning up application...');

        // Close any open connections
        Object.values(this.managers).forEach(manager => {
            if (manager && typeof manager.cleanup === 'function') {
                manager.cleanup();
            }
        });
    }

    // Public API methods
    getConnectionStatus() {
        return this.connectionStatus;
    }

    isApplicationOnline() {
        return this.isOnline && this.connectionStatus === 'connected';
    }

    getManagers() {
        return Object.assign({}, this.managers);
    }

    async exportApplicationData() {
        try {
            const data = {
                exported_at: new Date().toISOString(),
                version: '1.0.0',
                theme: localStorage.getItem('rag_theme'),
                search_mode: localStorage.getItem('rag_search_mode'),
                chat_history: (this.managers.chat && this.managers.chat.getMessageHistory) ? this.managers.chat.getMessageHistory() : [],
                search_history: (this.managers.search && this.managers.search.getSearchHistory) ? this.managers.search.getSearchHistory() : []
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'rag_app_data_' + new Date().toISOString().split('T')[0] + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (window.showStatus) {
                window.showStatus('Application data exported successfully', 'success');
            }

        } catch (error) {
            console.error('Failed to export application data:', error);
            if (window.showStatus) {
                window.showStatus('Failed to export application data', 'error');
            }
        }
    }

    async importApplicationData(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Validate data structure
            if (!data.version || !data.exported_at) {
                throw new Error('Invalid data file format');
            }

            // Import theme
            if (data.theme) {
                this.setTheme(data.theme);
            }

            // Import search mode
            if (data.search_mode && this.managers.chat) {
                this.managers.chat.setSearchMode(data.search_mode);
            }

            // Import search history
            if (data.search_history && this.managers.search && typeof this.managers.search.importSearchHistory === 'function') {
                this.managers.search.importSearchHistory(data.search_history);
            }

            // Import chat history
            if (data.chat_history && this.managers.chat && typeof this.managers.chat.importMessageHistory === 'function') {
                this.managers.chat.importMessageHistory(data.chat_history);
            }

            if (window.showStatus) {
                window.showStatus('Application data imported successfully', 'success');
            }

        } catch (error) {
            console.error('Failed to import application data:', error);
            if (window.showStatus) {
                window.showStatus('Failed to import application data: ' + error.message, 'error');
            }
        }
    }

    // Analytics and monitoring
    trackEvent(category, action, label, value) {
        label = label || null;
        value = value || null;

        const event = {
            category: category,
            action: action,
            label: label,
            value: value,
            timestamp: new Date().toISOString(),
            session_id: this.getSessionId()
        };

        console.log('📊 Event tracked:', event);

        // Store in local storage for potential sync later
        try {
            const events = JSON.parse(localStorage.getItem('rag_analytics') || '[]');
            events.push(event);

            // Keep only last 100 events
            if (events.length > 100) {
                events.splice(0, events.length - 100);
            }

            localStorage.setItem('rag_analytics', JSON.stringify(events));
        } catch (error) {
            console.warn('Failed to store analytics event:', error);
        }
    }

    getSessionId() {
        let sessionId = sessionStorage.getItem('rag_session_id');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('rag_session_id', sessionId);
        }
        return sessionId;
    }

    // Performance monitoring
    measurePerformance(name, fn) {
        const start = performance.now();
        const result = fn();
        const end = performance.now();

        console.log('⏱️ ' + name + ' took ' + (end - start).toFixed(2) + 'ms');

        this.trackEvent('performance', name, null, Math.round(end - start));

        return result;
    }

    async measureAsyncPerformance(name, fn) {
        const start = performance.now();
        const result = await fn();
        const end = performance.now();

        console.log('⏱️ ' + name + ' took ' + (end - start).toFixed(2) + 'ms');

        this.trackEvent('performance', name, null, Math.round(end - start));

        return result;
    }

    // Document management methods
    async uploadDocument(file, metadata) {
        metadata = metadata || {};

        if (this.managers.upload && typeof this.managers.upload.uploadFile === 'function') {
            return await this.managers.upload.uploadFile(file, metadata);
        } else {
            throw new Error('Upload manager not available');
        }
    }

    async deleteDocument(documentId) {
        if (this.managers.document && typeof this.managers.document.deleteDocument === 'function') {
            return await this.managers.document.deleteDocument(documentId);
        } else {
            throw new Error('Document manager not available');
        }
    }

    async searchDocuments(query, options) {
        options = options || {};

        if (this.managers.search && typeof this.managers.search.performSearch === 'function') {
            return await this.managers.search.performSearch(query, options);
        } else {
            throw new Error('Search manager not available');
        }
    }

    // Chat functionality
    async sendChatMessage(message, mode) {
        mode = mode || 'rag';

        if (this.managers.chat && typeof this.managers.chat.sendMessage === 'function') {
            return await this.managers.chat.sendMessage(message, mode);
        } else {
            throw new Error('Chat manager not available');
        }
    }

    // Status and notification system
    showStatus(message, type, duration) {
        type = type || 'info';
        duration = duration || 3000;

        const statusContainer = this.getOrCreateStatusContainer();

        const statusElement = document.createElement('div');
        statusElement.className = 'status-message status-' + type;
        statusElement.innerHTML = '<span class="status-icon">' + this.getStatusIcon(type) + '</span>' +
            '<span class="status-text">' + message + '</span>' +
            '<button class="status-close" onclick="this.parentElement.remove()">×</button>';

        statusContainer.appendChild(statusElement);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                if (statusElement.parentElement) {
                    statusElement.remove();
                }
            }, duration);
        }

        // Make it globally available
        window.showStatus = this.showStatus.bind(this);
    }

    getOrCreateStatusContainer() {
        let container = document.getElementById('statusContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'statusContainer';
            container.className = 'status-container';
            document.body.appendChild(container);
        }
        return container;
    }

    getStatusIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }

    // Utility methods
    formatFileSize(bytes) {
        if (!bytes || isNaN(bytes)) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'Unknown';
        try {
            const date = new Date(timestamp);
            return date.toLocaleString();
        } catch (error) {
            return 'Invalid date';
        }
    }

    debounce(func, wait, immediate) {
        immediate = immediate || false;

        let timeout;
        return function executedFunction() {
            const args = Array.prototype.slice.call(arguments);
            const later = () => {
                timeout = null;
                if (!immediate) func.apply(this, args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(this, args);
        };
    }

    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = Array.prototype.slice.call(arguments);
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}

// Enhanced DocumentManager class if it doesn't exist
if (typeof DocumentManager === 'undefined') {
    window.DocumentManager = class DocumentManager {
        constructor(apiBaseUrl) {
            this.apiBaseUrl = apiBaseUrl || window.API_BASE_URL || 'http://localhost:8000';
            this.documents = [];
            this.currentDocument = null;
            this.isLoading = false;
            console.log('DocumentManager created with API base URL:', this.apiBaseUrl);
        }

        async initialize() {
            console.log('Initializing DocumentManager...');
            try {
                this.setupElements();
                this.setupEventListeners();
                await this.loadDocuments();
                console.log('DocumentManager initialized successfully');
            } catch (error) {
                console.error('DocumentManager initialization failed:', error);
                throw error;
            }
        }

        setupElements() {
            // Document list elements
            this.documentsList = document.getElementById('documentsList');
            this.documentsCount = document.getElementById('documentsCount');
                        this.loadingIndicator = document.getElementById('documentsLoading');

            // Document viewer modal elements
            this.documentViewerModal = document.getElementById('documentViewerModal');
            this.documentViewerTitle = document.getElementById('documentViewerTitle');
            this.documentViewerContent = document.getElementById('documentViewerContent');
            this.closeDocumentViewer = document.getElementById('closeDocumentViewer');

            // Create document viewer modal if it doesn't exist
            if (!this.documentViewerModal) {
                this.createDocumentViewerModal();
            }
        }

        createDocumentViewerModal() {
            const modalHTML = '<div id="documentViewerModal" class="modal" style="display: none;">' +
                '<div class="modal-content">' +
                '<div class="modal-header">' +
                '<h3 id="documentViewerTitle">Document Viewer</h3>' +
                '<span class="close" id="closeDocumentViewer">&times;</span>' +
                '</div>' +
                '<div class="modal-body">' +
                '<div id="documentViewerContent">' +
                '<div class="loading">Loading document...</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>';

            document.body.insertAdjacentHTML('beforeend', modalHTML);

            // Re-setup elements
            this.documentViewerModal = document.getElementById('documentViewerModal');
            this.documentViewerTitle = document.getElementById('documentViewerTitle');
            this.documentViewerContent = document.getElementById('documentViewerContent');
            this.closeDocumentViewer = document.getElementById('closeDocumentViewer');
        }

        setupEventListeners() {
            // Modal close events
            if (this.closeDocumentViewer) {
                this.closeDocumentViewer.addEventListener('click', () => {
                    this.closeDocumentViewerModal();
                });
            }

            // Close on outside click
            if (this.documentViewerModal) {
                this.documentViewerModal.addEventListener('click', (e) => {
                    if (e.target === this.documentViewerModal) {
                        this.closeDocumentViewerModal();
                    }
                });
            }

            // Close on Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.documentViewerModal && this.documentViewerModal.style.display === 'block') {
                    this.closeDocumentViewerModal();
                }
            });

            // Refresh button
            const refreshButton = document.getElementById('refreshDocuments');
            if (refreshButton) {
                refreshButton.addEventListener('click', () => {
                    this.refreshDocuments();
                });
            }
        }

        async loadDocuments() {
            if (this.isLoading) return;

            this.isLoading = true;
            this.showLoadingIndicator();

            try {
                const response = await fetch(this.apiBaseUrl + '/pdf/', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }

                this.documents = await response.json();
                this.renderDocuments();
                this.updateDocumentsCount();

                console.log('Loaded ' + this.documents.length + ' documents');

            } catch (error) {
                console.error('Error loading documents:', error);
                this.showError('Failed to load documents: ' + error.message);
            } finally {
                this.isLoading = false;
                this.hideLoadingIndicator();
            }
        }

        renderDocuments() {
            if (!this.documentsList) return;

            if (this.documents.length === 0) {
                this.documentsList.innerHTML = '<div class="no-documents">' +
                    '<p>No documents uploaded yet.</p>' +
                    '<p>Use the upload form to add your first document.</p>' +
                    '</div>';
                return;
            }

            const documentsHTML = this.documents.map(doc => this.renderDocumentItem(doc)).join('');
            this.documentsList.innerHTML = documentsHTML;
        }

        renderDocumentItem(doc) {
            const statusClass = this.getStatusClass(doc.processing_status);
            const fileSize = this.formatFileSize(doc.file_size);
            const uploadDate = this.formatTimestamp(doc.created_at);

            return '<div class="document-item" data-id="' + doc.id + '">' +
                '<div class="document-info">' +
                '<div class="document-header">' +
                '<h4 class="document-title" title="' + this.escapeHtml(doc.original_filename) + '">' +
                this.escapeHtml(doc.title || doc.original_filename) +
                '</h4>' +
                '<span class="document-status ' + statusClass + '">' +
                doc.processing_status +
                '</span>' +
                '</div>' +
                '<div class="document-meta">' +
                '<span class="document-type">' + doc.file_type.toUpperCase() + '</span>' +
                '<span class="document-size">' + fileSize + '</span>' +
                (doc.total_pages ? '<span class="document-pages">' + doc.total_pages + ' pages</span>' : '') +
                '<span class="document-date">' + uploadDate + '</span>' +
                '</div>' +
                (doc.description ? '<p class="document-description">' + this.escapeHtml(doc.description) + '</p>' : '') +
                '</div>' +
                '<div class="document-actions">' +
                '<button class="btn btn-sm btn-primary" onclick="window.openDocumentViewer(' + doc.id + ')" title="View Document">' +
                '<i class="fas fa-eye"></i>' +
                '</button>' +
                '<button class="btn btn-sm btn-secondary" onclick="window.downloadDocument(' + doc.id + ')" title="Download Document">' +
                '<i class="fas fa-download"></i>' +
                '</button>' +
                '<button class="btn btn-sm btn-danger" onclick="window.deleteDocument(' + doc.id + ')" title="Delete Document">' +
                '<i class="fas fa-trash"></i>' +
                '</button>' +
                '</div>' +
                '</div>';
        }

        getStatusClass(status) {
            const statusClasses = {
                'completed': 'status-success',
                'processing': 'status-warning',
                'pending': 'status-info',
                'failed': 'status-error',
                'error': 'status-error'
            };
            return statusClasses[status] || 'status-info';
        }

        updateDocumentsCount() {
            if (this.documentsCount) {
                const completedCount = this.documents.filter(doc => doc.processing_status === 'completed').length;
                this.documentsCount.textContent = completedCount + ' of ' + this.documents.length + ' documents ready';
            }
        }

        showLoadingIndicator() {
            if (this.loadingIndicator) {
                this.loadingIndicator.style.display = 'block';
            }
        }

        hideLoadingIndicator() {
            if (this.loadingIndicator) {
                this.loadingIndicator.style.display = 'none';
            }
        }

        showError(message) {
            if (this.documentsList) {
                this.documentsList.innerHTML = '<div class="error-message">' +
                    '<p><i class="fas fa-exclamation-triangle"></i> ' + message + '</p>' +
                    '<button class="btn btn-primary" onclick="window.documentManager.refreshDocuments()">' +
                    '<i class="fas fa-refresh"></i> Retry' +
                    '</button>' +
                    '</div>';
            }
        }

        async refreshDocuments() {
            console.log('Refreshing documents...');
            await this.loadDocuments();

            if (window.showStatus) {
                window.showStatus('Documents refreshed', 'success');
            }
        }

        async openDocumentViewer(documentId) {
            console.log('Opening document viewer for ID:', documentId);

            if (!this.documentViewerModal) {
                this.createDocumentViewerModal();
            }

            try {
                this.showDocumentViewerLoading();

                const document = await this.getDocumentById(documentId);
                if (!document) {
                    throw new Error('Document not found');
                }

                this.displayDocumentInViewer(document);
                this.documentViewerModal.style.display = 'block';
                document.body.classList.add('modal-open');

            } catch (error) {
                console.error('Error opening document viewer:', error);
                this.showDocumentViewerError(error.message);
            }
        }

        showDocumentViewerLoading() {
            if (this.documentViewerTitle) {
                this.documentViewerTitle.textContent = 'Loading Document...';
            }
            if (this.documentViewerContent) {
                this.documentViewerContent.innerHTML = '<div class="loading-container">' +
                    '<div class="spinner"></div>' +
                    '<p>Loading document content...</p>' +
                    '</div>';
            }
        }

        showDocumentViewerError(message) {
            if (this.documentViewerTitle) {
                this.documentViewerTitle.textContent = 'Error Loading Document';
            }
            if (this.documentViewerContent) {
                this.documentViewerContent.innerHTML = '<div class="error-container">' +
                    '<p class="error-message"><i class="fas fa-exclamation-triangle"></i> ' + message + '</p>' +
                    '<button class="btn btn-primary" onclick="window.documentManager.closeDocumentViewerModal()">Close</button>' +
                    '</div>';
            }
            if (this.documentViewerModal) {
                this.documentViewerModal.style.display = 'block';
            }
        }

        displayDocumentInViewer(document) {
            if (this.documentViewerTitle) {
                this.documentViewerTitle.textContent = document.title || document.original_filename;
            }

            if (this.documentViewerContent) {
                this.documentViewerContent.innerHTML = '<div class="document-viewer-info">' +
                    '<div class="document-details">' +
                    '<h4>Document Information</h4>' +
                    '<div class="detail-grid">' +
                    '<div class="detail-item">' +
                    '<strong>Filename:</strong>' +
                    '<span>' + this.escapeHtml(document.original_filename) + '</span>' +
                    '</div>' +
                    '<div class="detail-item">' +
                    '<strong>File Type:</strong>' +
                    '<span>' + document.file_type.toUpperCase() + '</span>' +
                    '</div>' +
                    '<div class="detail-item">' +
                    '<strong>File Size:</strong>' +
                    '<span>' + this.formatFileSize(document.file_size) + '</span>' +
                    '</div>' +
                    (document.total_pages ? '<div class="detail-item">' +
                        '<strong>Pages:</strong>' +
                        '<span>' + document.total_pages + '</span>' +
                        '</div>' : '') +
                    '<div class="detail-item">' +
                    '<strong>Status:</strong>' +
                    '<span class="status-badge ' + this.getStatusClass(document.processing_status) + '">' +
                    document.processing_status +
                    '</span>' +
                    '</div>' +
                    '<div class="detail-item">' +
                    '<strong>Uploaded:</strong>' +
                    '<span>' + this.formatTimestamp(document.created_at) + '</span>' +
                    '</div>' +
                    (document.processed_at ? '<div class="detail-item">' +
                        '<strong>Processed:</strong>' +
                        '<span>' + this.formatTimestamp(document.processed_at) + '</span>' +
                        '</div>' : '') +
                    (document.total_chunks ? '<div class="detail-item">' +
                        '<strong>Text Chunks:</strong>' +
                        '<span>' + document.total_chunks + '</span>' +
                        '</div>' : '') +
                    (document.word_count ? '<div class="detail-item">' +
                        '<strong>Word Count:</strong>' +
                        '<span>' + document.word_count.toLocaleString() + '</span>' +
                        '</div>' : '') +
                    '</div>' +
                    (document.description ? '<div class="document-description">' +
                        '<strong>Description:</strong>' +
                        '<p>' + this.escapeHtml(document.description) + '</p>' +
                        '</div>' : '') +
                    (document.keywords ? '<div class="document-keywords">' +
                        '<strong>Keywords:</strong>' +
                        '<p>' + this.escapeHtml(document.keywords) + '</p>' +
                        '</div>' : '') +
                    '</div>' +
                    '<div class="document-actions-panel">' +
                    '<button class="btn btn-primary" onclick="window.downloadDocument(' + document.id + ')">' +
                    '<i class="fas fa-download"></i> Download' +
                    '</button>' +
                    '<button class="btn btn-secondary" onclick="window.viewDocumentChunks(' + document.id + ')">' +
                    '<i class="fas fa-list"></i> View Chunks' +
                    '</button>' +
                    '<button class="btn btn-info" onclick="window.searchInDocument(' + document.id + ')">' +
                    '<i class="fas fa-search"></i> Search in Document' +
                    '</button>' +
                    '</div>' +
                    '</div>';
            }
        }

        closeDocumentViewerModal() {
            if (this.documentViewerModal) {
                this.documentViewerModal.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        }

        async getDocumentById(documentId) {
            try {
                const response = await fetch(this.apiBaseUrl + '/pdf/' + documentId, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }

                return await response.json();
            } catch (error) {
                console.error('Error fetching document:', error);
                throw error;
            }
        }

        async deleteDocument(documentId) {
            if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
                return;
            }

            try {
                const response = await fetch(this.apiBaseUrl + '/pdf/' + documentId, {
                    method: 'DELETE',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                                    });

                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }

                // Remove from local array
                this.documents = this.documents.filter(doc => doc.id !== documentId);

                // Re-render
                this.renderDocuments();
                this.updateDocumentsCount();

                // Dispatch event
                const event = new CustomEvent('documentDeleted', {
                    detail: { documentId: documentId }
                });
                document.dispatchEvent(event);

                if (window.showStatus) {
                    window.showStatus('Document deleted successfully', 'success');
                }

                console.log('Document deleted:', documentId);

            } catch (error) {
                console.error('Error deleting document:', error);
                if (window.showStatus) {
                    window.showStatus('Failed to delete document: ' + error.message, 'error');
                }
            }
        }

        async downloadDocument(documentId) {
            try {
                const response = await fetch(this.apiBaseUrl + '/pdf/' + documentId + '/download', {
                    method: 'GET'
                });

                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }

                const blob = await response.blob();
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = 'document_' + documentId;

                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                    if (filenameMatch) {
                        filename = filenameMatch[1];
                    }
                }

                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);

                if (window.showStatus) {
                    window.showStatus('Document downloaded successfully', 'success');
                }

            } catch (error) {
                console.error('Error downloading document:', error);
                if (window.showStatus) {
                    window.showStatus('Failed to download document: ' + error.message, 'error');
                }
            }
        }

        async viewDocumentChunks(documentId) {
            try {
                const response = await fetch(this.apiBaseUrl + '/pdf/' + documentId + '/chunks', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }

                const chunks = await response.json();
                this.displayDocumentChunks(chunks, documentId);

            } catch (error) {
                console.error('Error fetching document chunks:', error);
                if (window.showStatus) {
                    window.showStatus('Failed to load document chunks: ' + error.message, 'error');
                }
            }
        }

        displayDocumentChunks(chunks, documentId) {
            if (this.documentViewerContent) {
                let chunksHTML = '';
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    chunksHTML += '<div class="chunk-item">' +
                        '<div class="chunk-header">' +
                        '<h5>Chunk ' + (i + 1) + '</h5>' +
                        '<span class="chunk-size">' + chunk.content.length + ' characters</span>' +
                        '</div>' +
                        '<div class="chunk-content">' +
                        '<pre>' + this.escapeHtml(chunk.content) + '</pre>' +
                        '</div>' +
                        (chunk.metadata ? '<div class="chunk-metadata">' +
                            '<small>Page: ' + (chunk.metadata.page || 'N/A') + '</small>' +
                            '</div>' : '') +
                        '</div>';
                }

                this.documentViewerContent.innerHTML = '<div class="chunks-viewer">' +
                    '<div class="chunks-header">' +
                    '<h4>Document Chunks (' + chunks.length + ' total)</h4>' +
                    '<button class="btn btn-secondary" onclick="window.documentManager.openDocumentViewer(' + documentId + ')">' +
                    '<i class="fas fa-arrow-left"></i> Back to Document Info' +
                    '</button>' +
                    '</div>' +
                    '<div class="chunks-container">' +
                    chunksHTML +
                    '</div>' +
                    '</div>';
            }
        }

        formatFileSize(bytes) {
            if (!bytes || isNaN(bytes)) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        formatTimestamp(timestamp) {
            if (!timestamp) return 'Unknown';
            try {
                const date = new Date(timestamp);
                return date.toLocaleString();
            } catch (error) {
                console.error('Error formatting timestamp:', error);
                return 'Invalid Date';
            }
        }

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

        cleanup() {
            // Clean up any resources
            this.documents = [];
            this.currentDocument = null;
        }
    };
}

// Global functions for HTML onclick handlers
window.toggleTheme = function() {
    if (window.ragApp) {
        window.ragApp.toggleTheme();
    }
};

window.showHelp = function() {
    if (window.ragApp) {
        window.ragApp.showHelp();
    }
};

window.hideHelp = function() {
    if (window.ragApp) {
        window.ragApp.hideHelp();
    }
};

window.clearChat = function() {
    if (window.ragApp) {
        window.ragApp.clearChat();
    }
};

window.loadStats = function() {
    if (window.ragApp) {
        window.ragApp.refreshStats();
    }
};

window.exportAppData = function() {
    if (window.ragApp) {
        window.ragApp.exportApplicationData();
    }
};

window.refreshDocuments = function() {
    if (window.ragApp && window.ragApp.managers.document) {
        window.ragApp.managers.document.refreshDocuments();
    }
};

window.openDocumentViewer = function(documentId) {
    if (window.ragApp && window.ragApp.managers.document) {
        window.ragApp.managers.document.openDocumentViewer(documentId);
    }
};

window.deleteDocument = function(documentId) {
    if (window.ragApp && window.ragApp.managers.document) {
        window.ragApp.managers.document.deleteDocument(documentId);
    }
};

window.downloadDocument = function(documentId) {
    if (window.ragApp && window.ragApp.managers.document) {
        window.ragApp.managers.document.downloadDocument(documentId);
    }
};

window.viewDocumentChunks = function(documentId) {
    if (window.ragApp && window.ragApp.managers.document) {
        window.ragApp.managers.document.viewDocumentChunks(documentId);
    }
};

window.searchInDocument = function(documentId) {
    if (window.ragApp && window.ragApp.managers.search) {
        // Set document filter and focus search
        const searchManager = window.ragApp.managers.search;
        if (searchManager.setDocumentFilter) {
            searchManager.setDocumentFilter([documentId]);
        }

        // Focus search input
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.focus();
            messageInput.placeholder = 'Search in selected document...';
        }

        if (window.showStatus) {
            window.showStatus('Document filter applied. Start typing to search.', 'info');
        }
    }
};

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('🌟 Starting RAG Application...');

    try {
        window.ragApp = new RAGApplication();

        // Make managers globally available for backward compatibility
        window.addEventListener('load', () => {
            if (window.ragApp) {
                window.searchManager = window.ragApp.searchManager;
                window.uploadManager = window.ragApp.uploadManager;
                window.documentManager = window.ragApp.documentManager;
                window.statsManager = window.ragApp.statsManager;
                window.chatManager = window.ragApp.chatManager;
            }
        });

    } catch (error) {
        console.error('❌ Failed to initialize RAG Application:', error);

        // Show fallback error message
        document.body.innerHTML = '<div class="critical-error">' +
            '<div class="error-icon">' +
            '<i class="fas fa-exclamation-triangle"></i>' +
            '</div>' +
            '<div class="error-message">' +
            '<h3>Critical Application Error</h3>' +
            '<p>Failed to initialize the RAG application: ' + error.message + '</p>' +
            '<button class="btn btn-primary" onclick="location.reload()">' +
            '<i class="fas fa-refresh"></i> Reload Application' +
            '</button>' +
            '</div>' +
            '</div>';
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAGApplication;
}

// Add some basic error handling for common issues
window.addEventListener('error', function(e) {
    console.error('Global JavaScript error:', e.error);

    // Don't show critical errors for minor issues
    if (e.error && e.error.message && e.error.message.includes('Script error')) {
        return;
    }

    // Show user-friendly error for major issues
    if (window.showStatus) {
        window.showStatus('A JavaScript error occurred. Please refresh the page if you experience issues.', 'warning', 5000);
    }
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);

    // Don't show status for network errors
    if (e.reason && e.reason.message && e.reason.message.includes('fetch')) {
        return;
    }

    if (window.showStatus) {
        window.showStatus('A network error occurred. Please check your connection.', 'warning', 3000);
    }
});

// Add polyfill for older browsers
if (!Element.prototype.closest) {
    Element.prototype.closest = function(selector) {
        let element = this;
        while (element && element.nodeType === 1) {
            if (element.matches(selector)) {
                return element;
            }
            element = element.parentElement;
        }
        return null;
    };
}

if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}

// Add fetch polyfill check
if (!window.fetch) {
    console.warn('Fetch API not supported. Please use a modern browser or include a polyfill.');
}

// Add console.log polyfill for very old browsers
if (!window.console) {
    window.console = {
        log: function() {},
        error: function() {},
        warn: function() {},
        info: function() {}
    };
}

console.log('RAG Application script loaded successfully');

