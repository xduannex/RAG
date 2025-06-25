// RAG Search Application - Main Application Controller
// Updated for search-focused interface

class RAGSearchApp {
    constructor() {
        this.apiBaseUrl = window.API_BASE_URL || 'http://localhost:8000';
        this.ragClient = null;
        this.searchManager = null;
        this.advancedSearchManager = null;
        this.documentManager = null;
        this.uploadManager = null;
        this.statsManager = null;
        this.isInitialized = false;

        console.log('RAG Search Application starting...');
    }

    async initialize() {
        if (this.isInitialized) {
            console.log('App already initialized');
            return;
        }

        try {
            console.log('Initializing RAG Search Application...');

            // Initialize core services
            await this.initializeCore();

            // Initialize managers
            await this.initializeManagers();

            // Setup global event handlers
            this.setupGlobalEventHandlers();

            // Check initial connection
            await this.checkConnection();

            // Load initial data
            await this.loadInitialData();

            this.isInitialized = true;
            console.log('✅ RAG Search Application initialized successfully');

            this.showStatus('Application loaded successfully', 'success');

        } catch (error) {
            console.error('❌ Failed to initialize RAG Search Application:', error);
            this.showStatus('Failed to initialize application: ' + error.message, 'error');
            throw error;
        }
    }

    async initializeCore() {
        // Initialize RAG Client
        if (window.RAGClient) {
            this.ragClient = new window.RAGClient(this.apiBaseUrl);
            console.log('✅ RAG Client initialized');
        } else {
            console.warn('⚠️ RAGClient not available, using fallback');
        }
    }

    createFallbackClient() {
        return {
            baseURL: this.apiBaseUrl,
            async ragQuery(query, options = {}) {
                const response = await fetch(`${this.apiBaseUrl}/search/rag`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: query,
                        max_results: options.max_results || 5,
                        similarity_threshold: options.similarity_threshold || 0.7,
                        model: options.model || 'llama3.2:latest'
                    })
                });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.json();
            },
            async search(query, options = {}) {
                const response = await fetch(`${this.apiBaseUrl}/search/search`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: query,
                        n_results: options.limit || 10,
                        similarity_threshold: options.similarity_threshold || 0.7
                    })
                });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.json();
            }
        };
    }

    async initializeManagers() {
        try {
            // Initialize Search Manager (formerly Chat Manager)
            if (window.SearchManager) {
                this.searchManager = new window.SearchManager(this.ragClient);
                window.searchManager = this.searchManager;
                console.log('✅ Search Manager initialized');
            } else if (window.ChatManager) {
                // Backward compatibility
                this.searchManager = new window.ChatManager(this.ragClient);
                window.searchManager = this.searchManager;
                console.log('✅ Search Manager initialized (using ChatManager)');
            }

            // Initialize Advanced Search Manager
            if (window.AdvancedSearchManager) {
                this.advancedSearchManager = new window.AdvancedSearchManager(this.ragClient);
                await this.advancedSearchManager.initialize();
                window.advancedSearchManager = this.advancedSearchManager;
                console.log('✅ Advanced Search Manager initialized');
            }

            // Initialize Document Manager
            if (window.DocumentManager) {
                this.documentManager = new window.DocumentManager(this.ragClient);
                await this.documentManager.initialize();
                window.documentManager = this.documentManager;
                console.log('✅ Document Manager initialized');
            }

            // Initialize Upload Manager
            if (window.UploadManager) {
                this.uploadManager = new window.UploadManager(this.ragClient);
                await this.uploadManager.initialize();
                window.uploadManager = this.uploadManager;
                console.log('✅ Upload Manager initialized');
            }

            // Initialize Stats Manager
            if (window.StatsManager) {
                this.statsManager = new window.StatsManager(this.ragClient);
                await this.statsManager.initialize();
                window.statsManager = this.statsManager;
                console.log('✅ Stats Manager initialized');
            }

        } catch (error) {
            console.error('Failed to initialize managers:', error);
            throw error;
        }
    }

    setupGlobalEventHandlers() {
        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + K: Focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.focusSearch();
            }

            // Ctrl/Cmd + L: Clear search results
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                this.clearSearchResults();
            }

            // Escape: Close modals or clear search
            if (e.key === 'Escape') {
                this.handleEscapeKey();
            }
        });

        // Global error handler
        window.addEventListener('error', (e) => {
            console.error('Global error:', e.error);
            this.showStatus('An unexpected error occurred', 'error');
        });

        // Global unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (e) => {
            console.error('Unhandled promise rejection:', e.reason);
            this.showStatus('An unexpected error occurred', 'error');
        });

        // Online/offline status
        window.addEventListener('online', () => {
            this.showStatus('Connection restored', 'success');
            this.checkConnection();
        });

        window.addEventListener('offline', () => {
            this.showStatus('Connection lost', 'warning');
            this.updateConnectionStatus(false);
        });

        // Visibility change (tab focus)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isInitialized) {
                // Refresh stats when tab becomes visible
                this.refreshStats();
            }
        });

        console.log('✅ Global event handlers setup complete');
    }

    focusSearch() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }

    clearSearchResults() {
        if (this.searchManager && this.searchManager.clearResults) {
            this.searchManager.clearResults();
        }
    }

    handleEscapeKey() {
        // Close any open modals
        const modals = document.querySelectorAll('.modal[style*="display: block"], .modal.show');
        modals.forEach(modal => {
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
        });

        // Hide search suggestions
        const suggestions = document.getElementById('searchSuggestions');
        if (suggestions) {
            suggestions.style.display = 'none';
        }
    }

    async checkConnection() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health`, {
                method: 'GET',
                timeout: 5000
            });

            if (response.ok) {
                const data = await response.json();
                this.updateConnectionStatus(true, data);
                return true;
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Connection check failed:', error);
            this.updateConnectionStatus(false);
            return false;
        }
    }

    updateConnectionStatus(isConnected, data = null) {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');

        if (statusDot && statusText) {
            if (isConnected) {
                statusDot.className = 'connection-dot connected';
                statusText.textContent = 'Connected';

                if (data && data.status) {
                    statusText.textContent = `Connected (${data.status})`;
                }
            } else {
                statusDot.className = 'connection-dot disconnected';
                statusText.textContent = 'Disconnected';
            }
        }
    }

    async loadInitialData() {
        try {
            // Load statistics
            await this.refreshStats();

            // Load available categories for filters
            if (this.advancedSearchManager) {
                await this.advancedSearchManager.loadCategories();
            }

            console.log('✅ Initial data loaded');
        } catch (error) {
            console.warn('Failed to load some initial data:', error);
        }
    }

    async refreshStats() {
        if (this.statsManager) {
            try {
                await this.statsManager.loadStats();
                console.log('Stats refreshed');
            } catch (error) {
                console.warn('Failed to refresh stats:', error);
            }
        }
    }

    // Public API methods
    async performSearch(query, mode = 'rag') {
        if (this.searchManager) {
            return await this.searchManager.performSearch(query, mode);
        }
    }

    showStatus(message, type = 'info', duration = 3000) {
        if (window.showStatus) {
            window.showStatus(message, type, duration);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    // Analytics and tracking
    trackEvent(category, action, label, value) {
        try {
            const event = {
                category: category,
                action: action,
                label: label,
                value: value,
                timestamp: Date.now(),
                url: window.location.href,
                userAgent: navigator.userAgent
            };

            // Store locally
            this.saveEvent(event);

            // Send to analytics service if available
            if (window.gtag) {
                window.gtag('event', action, {
                    event_category: category,
                    event_label: label,
                    value: value
                });
            }

            console.log('Event tracked:', event);
        } catch (error) {
            console.warn('Failed to track event:', error);
        }
    }

    saveEvent(event) {
        try {
            let events = JSON.parse(localStorage.getItem('rag_events') || '[]');
            events.push(event);

            // Keep only last 100 events
            if (events.length > 100) {
                events = events.slice(-100);
            }

            localStorage.setItem('rag_events', JSON.stringify(events));
        } catch (error) {
            console.warn('Failed to save event:', error);
        }
    }

    getAnalytics() {
        try {
            const events = JSON.parse(localStorage.getItem('rag_events') || '[]');
            const searchAnalytics = this.advancedSearchManager ?
                this.advancedSearchManager.getSearchAnalytics() : [];

            return {
                events: events,
                searches: searchAnalytics,
                summary: this.generateAnalyticsSummary(events, searchAnalytics)
            };
        } catch (error) {
            console.warn('Failed to get analytics:', error);
            return { events: [], searches: [], summary: {} };
        }
    }

    generateAnalyticsSummary(events, searches) {
        const summary = {
            totalEvents: events.length,
            totalSearches: searches.length,
            searchModes: {},
            popularQueries: {},
            avgResponseTime: 0
        };

        // Analyze search modes
        searches.forEach(search => {
            summary.searchModes[search.mode] = (summary.searchModes[search.mode] || 0) + 1;

            if (search.query) {
                summary.popularQueries[search.query] = (summary.popularQueries[search.query] || 0) + 1;
            }
        });

        // Calculate average response time
        const responseTimes = searches.filter(s => s.responseTime).map(s => s.responseTime);
        if (responseTimes.length > 0) {
            summary.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        }

        return summary;
    }

    // Export functionality
    exportData() {
        try {
            const data = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                analytics: this.getAnalytics(),
                settings: {
                    searchMode: localStorage.getItem('rag_search_mode'),
                    theme: localStorage.getItem('rag_theme'),
                    filters: this.advancedSearchManager ?
                        this.advancedSearchManager.getActiveFilters() : {}
                }
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rag_export_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showStatus('Data exported successfully', 'success');
        } catch (error) {
            console.error('Failed to export data:', error);
            this.showStatus('Failed to export data', 'error');
        }
    }

    // Cleanup and shutdown
    cleanup() {
        console.log('Cleaning up RAG Search Application...');

        // Cleanup managers
        if (this.searchManager && this.searchManager.cleanup) {
            this.searchManager.cleanup();
        }

        if (this.advancedSearchManager && this.advancedSearchManager.cleanup) {
            this.advancedSearchManager.cleanup();
        }

        if (this.documentManager && this.documentManager.cleanup) {
            this.documentManager.cleanup();
        }

        if (this.uploadManager && this.uploadManager.cleanup) {
            this.uploadManager.cleanup();
        }

        if (this.statsManager && this.statsManager.cleanup) {
            this.statsManager.cleanup();
        }

        // Remove global references
        delete window.ragApp;
        delete window.searchManager;
        delete window.advancedSearchManager;
        delete window.documentManager;
        delete window.uploadManager;
        delete window.statsManager;

        this.isInitialized = false;
        console.log('Cleanup complete');
    }
}

// Global functions for HTML onclick handlers
window.loadStats = function() {
    if (window.ragApp) {
        window.ragApp.refreshStats();
    }
};

window.checkConnection = function() {
    if (window.ragApp) {
        return window.ragApp.checkConnection();
    }
};

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        window.ragApp = new RAGSearchApp();
        await window.ragApp.initialize();
    } catch (error) {
        console.error('Failed to initialize RAG Search Application:', error);

        // Show error message to user
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-banner';
        errorContainer.innerHTML = `
            <div class="error-content">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Failed to initialize application. Please refresh the page.</span>
                <button onclick="location.reload()" class="btn btn-sm btn-primary">
                    <i class="fas fa-sync"></i> Refresh
                </button>
            </div>
        `;
        document.body.insertBefore(errorContainer, document.body.firstChild);
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.ragApp) {
        window.ragApp.cleanup();
    }
});

console.log('RAG Search Application loaded');