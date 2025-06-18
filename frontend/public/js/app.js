// RAG Chat Application - Main Application Controller
// Coordinates all managers and handles global functionality

class RAGApplication {
    constructor() {
        this.apiBaseUrl = window.API_BASE_URL || 'http://localhost:8000';
        this.isOnline = navigator.onLine;
        this.connectionStatus = 'disconnected';
        this.managers = {};
        this.init();
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

            console.log('✅ RAG Application initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize RAG Application:', error);
            this.showCriticalError('Failed to initialize application: ' + error.message);
        }
    }

    async initializeManagers() {
        console.log('📦 Initializing application managers...');

        try {
            // Wait for managers to be available
            await this.waitForManagers();

            // Store manager references
            this.managers = {
                chat: window.chatManager,
                search: window.searchManager,
                document: window.documentManager,
                upload: window.uploadManager,
                stats: window.statsManager
            };

            // Setup inter-manager communication
            this.setupManagerCommunication();

            // Perform initial data load
            await this.performInitialLoad();

            console.log('✅ All managers initialized');

        } catch (error) {
            console.error('❌ Failed to initialize managers:', error);
            throw error;
        }
    }

    async waitForManagers(timeout = 10000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            if (window.chatManager && window.searchManager &&
                window.documentManager && window.uploadManager) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        throw new Error('Managers failed to initialize within timeout');
    }

    setupManagerCommunication() {
        // Setup event listeners for manager communication
        document.addEventListener('documentUploaded', (e) => {
            if (this.managers.document) {
                this.managers.document.refreshDocuments();
            }
            if (this.managers.stats) {
                this.managers.stats.updateStats();
            }
        });

        document.addEventListener('documentDeleted', (e) => {
            if (this.managers.document) {
                this.managers.document.refreshDocuments();
            }
            if (this.managers.stats) {
                this.managers.stats.updateStats();
            }
        });

        document.addEventListener('searchPerformed', (e) => {
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

            if (this.managers.document) {
                loadPromises.push(this.managers.document.loadDocuments());
            }

            if (this.managers.stats) {
                loadPromises.push(this.managers.stats.loadStats());
            }

            await Promise.allSettled(loadPromises);

            // Load chat history if available
            if (this.managers.chat) {
                this.managers.chat.loadMessageHistory();
            }

            console.log('✅ Initial data load completed');

        } catch (error) {
            console.warn('⚠️ Some initial data failed to load:', error);
        }
    }

    async checkAPIHealth() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (response.ok) {
                const health = await response.json();
                this.updateConnectionStatus('connected');
                console.log('🟢 API health check passed:', health);
            } else {
                throw new Error(`Health check failed: ${response.status}`);
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
        console.log(`🎨 Theme set to: ${theme}`);
    }

    toggleTheme() {
        const currentTheme = window.isDarkMode ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);

        if (window.showStatus) {
            window.showStatus(`Switched to ${newTheme} theme`, 'success');
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
        if (this.managers.stats) {
            this.managers.stats.loadStats();
        }
        if (this.managers.document) {
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
        if (this.managers.search) {
            this.managers.search.hideSuggestions();
        }
    }

    handleGlobalError(error) {
        console.error('Handling global error:', error);

        // Don't show status for network errors if offline
        if (!this.isOnline && error.message?.includes('fetch')) {
            return;
        }

        if (window.showStatus) {
            window.showStatus('An unexpected error occurred', 'error');
        }
    }

    showCriticalError(message) {
        const errorHTML = `
            <div class="critical-error">
                <div class="error-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="error-message">
                    <h3>Application Error</h3>
                    <p>${message}</p>
                    <button class="btn btn-primary" onclick="location.reload()">
                        <i class="fas fa-refresh"></i> Reload Application
                    </button>
                </div>
            </div>
        `;

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
        return { ...this.managers };
    }

    async exportApplicationData() {
        try {
            const data = {
                exported_at: new Date().toISOString(),
                version: '1.0.0',
                theme: localStorage.getItem('rag_theme'),
                search_mode: localStorage.getItem('rag_search_mode'),
                chat_history: this.managers.chat?.getMessageHistory() || [],
                search_history: this.managers.search?.getSearchHistory() || []
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rag_app_data_${new Date().toISOString().split('T')[0]}.json`;
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
            if (data.search_history && this.managers.search) {
                this.managers.search.importSearchHistory(data.search_history);
            }

            // Import chat history
            if (data.chat_history && this.managers.chat) {
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
    trackEvent(category, action, label = null, value = null) {
        const event = {
            category,
            action,
            label,
            value,
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

        console.log(`⏱️ ${name} took ${(end - start).toFixed(2)}ms`);

        this.trackEvent('performance', name, null, Math.round(end - start));

        return result;
    }

    async measureAsyncPerformance(name, fn) {
        const start = performance.now();
        const result = await fn();
        const end = performance.now();

        console.log(`⏱️ ${name} took ${(end - start).toFixed(2)}ms`);

        this.trackEvent('performance', name, null, Math.round(end - start));

        return result;
    }
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

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('🌟 Starting RAG Application...');
    window.ragApp = new RAGApplication();
});

// Add critical error styles
const criticalErrorStyles = `
<style>
.critical-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    background: #f8f9fa;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.critical-error .error-icon {
    font-size: 4rem;
    color: #dc3545;
    margin-bottom: 2rem;
}

.critical-error .error-message {
    text-align: center;
    max-width: 500px;
}

.critical-error h3 {
    color: #212529;
    margin-bottom: 1rem;
    font-size: 2rem;
}

.critical-error p {
    color: #6c757d;
    margin-bottom: 2rem;
    font-size: 1.1rem;
    line-height: 1.5;
}

.critical-error .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 1rem;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.15s ease-in-out;
}

.critical-error .btn:hover {
    background: #0056b3;
}
</style>
`;

// Inject critical error styles
document.head.insertAdjacentHTML('beforeend', criticalErrorStyles);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAGApplication;
}
