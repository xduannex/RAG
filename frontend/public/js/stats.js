// RAG Chat Application - Statistics Management
// Handles loading and displaying application statistics

class StatsManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
        this.stats = {};
        this.isLoading = false;
        this.refreshInterval = null;
        this.init();
    }

    init() {
        console.log('Initializing Stats Manager...');
        this.setupElements();

        // Register globally
        window.statsManager = this;

        // Load initial stats
        this.loadStats();

        // Set up auto-refresh (every 30 seconds)
        this.startAutoRefresh(30000);

        console.log('Stats manager initialized');
    }

    setupElements() {
        this.elements = {
            totalDocs: document.getElementById('totalDocs'),
            totalSearches: document.getElementById('totalSearches'),
            recentSearches: document.getElementById('recentSearches'),
            processedDocs: document.getElementById('processedDocs'),
            searchableDocs: document.getElementById('searchableDocs'),
            avgResponseTime: document.getElementById('avgResponseTime'),
            vectorStoreSize: document.getElementById('vectorStoreSize'),
            lastUpdated: document.getElementById('lastUpdated')
        };
    }

    async loadStats() {
        if (this.isLoading) {
            console.log('Stats already loading, skipping...');
            return;
        }

        this.isLoading = true;
        this.showLoadingState();

        try {
            console.log('Loading statistics...');

            const response = await fetch(`${this.apiBaseUrl}/search/stats`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Stats API response:', data);

            this.stats = data;
            this.updateStatsDisplay(data);

            if (window.showStatus) {
                window.showStatus('Statistics updated successfully', 'success', 3000);
            }

        } catch (error) {
            console.error('Failed to load stats:', error);
            this.showErrorState(error.message);

            if (window.showStatus) {
                window.showStatus('Failed to load statistics: ' + error.message, 'error');
            }
        } finally {
            this.isLoading = false;
        }
    }

    updateStatsDisplay(stats) {
        try {
            console.log('Updating stats display with:', stats);

            // Basic document stats
            this.updateElement('totalDocs', stats.total_documents || 0);
            this.updateElement('processedDocs', stats.processed_documents || 0);
            this.updateElement('searchableDocs', stats.searchable_documents || 0);

            // Search stats
            this.updateElement('totalSearches', stats.total_searches || 0);
            this.updateElement('recentSearches', stats.recent_searches_24h || 0);

            // Performance stats
            if (stats.avg_response_time) {
                this.updateElement('avgResponseTime', `${(stats.avg_response_time * 1000).toFixed(0)}ms`);
            } else {
                this.updateElement('avgResponseTime', 'N/A');
            }

            // Vector store stats
            if (stats.vector_store) {
                const vectorStats = stats.vector_store;
                let vectorInfo = '';

                if (vectorStats.total_chunks) {
                    vectorInfo += `${vectorStats.total_chunks.toLocaleString()} chunks`;
                }
                if (vectorStats.collection_size) {
                    vectorInfo += vectorInfo ? `, ${this.formatBytes(vectorStats.collection_size)}` : this.formatBytes(vectorStats.collection_size);
                }

                this.updateElement('vectorStoreSize', vectorInfo || 'N/A');
            }

            // Update last updated time
            this.updateElement('lastUpdated', new Date().toLocaleTimeString());

            // Update additional stats if elements exist
            this.updateAdditionalStats(stats);

            console.log('Stats display updated successfully');

        } catch (error) {
            console.error('Error updating stats display:', error);
        }
    }

    updateAdditionalStats(stats) {
        // Top queries
        if (stats.top_queries && stats.top_queries.length > 0) {
            this.updateTopQueries(stats.top_queries);
        }

        // Document types breakdown
        if (stats.document_types) {
            this.updateDocumentTypes(stats.document_types);
        }

        // Recent activity
        if (stats.recent_activity) {
            this.updateRecentActivity(stats.recent_activity);
        }

        // System health
        if (stats.system_health) {
            this.updateSystemHealth(stats.system_health);
        }
    }

    updateTopQueries(topQueries) {
        const container = document.getElementById('topQueries');
        if (!container) return;

        const queriesHTML = topQueries.slice(0, 5).map((query, index) => `
            <div class="top-query-item">
                <span class="query-rank">${index + 1}</span>
                <span class="query-text">${this.escapeHtml(query.query)}</span>
                <span class="query-count">${query.count}</span>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="top-queries-list">
                ${queriesHTML}
            </div>
        `;
    }

    updateDocumentTypes(documentTypes) {
        const container = document.getElementById('documentTypes');
        if (!container) return;

        const typesHTML = Object.entries(documentTypes).map(([type, count]) => `
            <div class="doc-type-item">
                <span class="doc-type-name">${type.toUpperCase()}</span>
                <span class="doc-type-count">${count}</span>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="doc-types-list">
                ${typesHTML}
            </div>
        `;
    }

    updateRecentActivity(recentActivity) {
        const container = document.getElementById('recentActivity');
        if (!container) return;

        const activitiesHTML = recentActivity.slice(0, 10).map(activity => `
            <div class="activity-item">
                <span class="activity-type">${activity.type}</span>
                <span class="activity-description">${this.escapeHtml(activity.description)}</span>
                <span class="activity-time">${this.formatRelativeTime(activity.timestamp)}</span>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="recent-activities-list">
                ${activitiesHTML}
            </div>
        `;
    }

    updateSystemHealth(systemHealth) {
        const container = document.getElementById('systemHealth');
        if (!container) return;

        const healthItems = Object.entries(systemHealth).map(([service, status]) => {
            const statusClass = status === 'healthy' ? 'success' :
                               status === 'degraded' ? 'warning' : 'danger';

            return `
                <div class="health-item">
                    <span class="health-service">${service}</span>
                    <span class="health-status status-${statusClass}">${status}</span>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="system-health-list">
                ${healthItems}
            </div>
        `;
    }

    updateElement(elementId, value) {
        const element = this.elements[elementId] || document.getElementById(elementId);
        if (element) {
            if (typeof value === 'number') {
                element.textContent = value.toLocaleString();
            } else {
                element.textContent = String(value);
            }
        }
    }

    showLoadingState() {
        Object.values(this.elements).forEach(element => {
            if (element) {
                element.textContent = '...';
            }
        });
    }

    showErrorState(errorMessage) {
        Object.values(this.elements).forEach(element => {
            if (element) {
                element.textContent = '?';
                element.title = `Error loading stats: ${errorMessage}`;
            }
        });
    }

    startAutoRefresh(interval = 30000) {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        this.refreshInterval = setInterval(() => {
            if (!document.hidden) { // Only refresh if page is visible
                this.loadStats();
            }
        }, interval);

        console.log(`Auto-refresh started with ${interval}ms interval`);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            console.log('Auto-refresh stopped');
        }
    }

    // Utility methods
    formatBytes(bytes) {
        if (!bytes || isNaN(bytes)) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatRelativeTime(timestamp) {
        try {
            const now = new Date();
            const time = new Date(timestamp);
            const diffMs = now - time;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return time.toLocaleDateString();
        } catch (error) {
            return 'Unknown';
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        try {
            const div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        } catch (error) {
            return String(text);
        }
    }

    // Public API methods
    getStats() {
        return this.stats;
    }

    refresh() {
        return this.loadStats();
    }

    isRefreshing() {
        return this.isLoading;
    }

    setAutoRefreshInterval(interval) {
        this.startAutoRefresh(interval);
    }
}

// Initialize stats manager when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (typeof API_BASE_URL !== 'undefined') {
        window.statsManager = new StatsManager(API_BASE_URL);
        console.log('Stats manager created and registered');
    } else {
        console.error('API_BASE_URL not defined, cannot initialize stats manager');
    }
});

// Stop auto-refresh when page is hidden to save resources
document.addEventListener('visibilitychange', function() {
    if (window.statsManager) {
        if (document.hidden) {
            console.log('Page hidden, pausing stats refresh');
        } else {
            console.log('Page visible, resuming stats refresh');
            // Refresh immediately when page becomes visible
            window.statsManager.loadStats();
        }
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StatsManager;
}