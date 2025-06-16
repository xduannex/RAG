// RAG Chat Application - Statistics Management
// Handles loading and displaying application statistics

class StatsManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
        this.stats = {};
        this.refreshInterval = null;
        this.autoRefreshEnabled = false;
        this.init();
    }

    init() {
        this.loadStats();
        this.setupAutoRefresh();
    }

    async loadStats() {
        try {
            console.log('Loading stats from /search/stats endpoint...');

            // Show loading state
            this.showLoadingState();

            const response = await fetch(`${this.apiBaseUrl}/search/stats`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            console.log('Stats endpoint response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Stats endpoint error:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            console.log('Raw stats API response:', data);

            // Map the response from the backend to match frontend expectations
            this.stats = {
                total_pdfs: data.total_documents || data.processed_documents || 0,
                total_documents: data.total_documents || data.processed_documents || 0,
                total_searches: data.total_searches || 0,
                recent_searches_24h: data.recent_searches_24h || 0,
                processed_documents: data.processed_documents || 0,
                searchable_documents: data.searchable_documents || 0,
                avg_response_time: data.avg_response_time || 0,
                top_queries: data.top_queries || [],
                vector_store: data.vector_store || {}
            };

            console.log('Processed stats for display:', this.stats);
            this.updateStatsDisplay();

            // Show success status
            showStatus(`Stats loaded: ${this.stats.total_documents} docs, ${this.stats.total_searches} searches`, 'success', 3000);

        } catch (error) {
            console.error('Failed to load stats:', error);
            this.handleStatsError(error);
        }
    }

    showLoadingState() {
        const elements = ['totalDocs', 'totalSearches'];
        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '...';
            }
        });
    }

    handleStatsError(error) {
        // Use fallback values
        const fallbackStats = {
            total_pdfs: '?',
            total_documents: '?',
            total_searches: '?',
            recent_searches_24h: '?',
            processed_documents: '?',
            searchable_documents: '?',
            avg_response_time: '?'
        };

        this.updateStatsDisplay(fallbackStats);
        showStatus('Failed to load statistics: ' + error.message, 'warning', 5000);
    }

    updateStatsDisplay(statsData = null) {
        const stats = statsData || this.stats;

        try {
            console.log('Updating stats display with:', stats);

            // Basic stats
            const totalDocsElement = document.getElementById('totalDocs');
            const totalSearchesElement = document.getElementById('totalSearches');

            if (totalDocsElement) {
                const docCount = stats.total_documents || stats.total_pdfs || 0;
                totalDocsElement.textContent = String(docCount);
                console.log('Updated total docs:', docCount);
            }

            if (totalSearchesElement) {
                totalSearchesElement.textContent = String(stats.total_searches || 0);
                console.log('Updated total searches:', stats.total_searches);
            }

            // Additional stats if elements exist
            this.updateOptionalStats(stats);

            console.log('Stats updated successfully');
        } catch (error) {
            console.error('Error updating stats display:', error);
        }
    }

    updateOptionalStats(stats) {
        const optionalElements = [
            { id: 'avgResponseTime', value: stats.avg_response_time, suffix: 's' },
            { id: 'recentSearches', value: stats.recent_searches_24h },
            { id: 'processedDocs', value: stats.processed_documents },
            { id: 'searchableDocs', value: stats.searchable_documents }
        ];

        optionalElements.forEach(({ id, value, suffix = '' }) => {
            const element = document.getElementById(id);
            if (element && value !== undefined) {
                element.textContent = `${value}${suffix}`;
            }
        });

        // Update top queries
        this.updateTopQueries(stats.top_queries);

        // Update vector store stats
        this.updateVectorStoreStats(stats.vector_store);
    }

    updateTopQueries(topQueries) {
        const topQueriesElement = document.getElementById('topQueries');
        if (!topQueriesElement || !topQueries) return;

        if (Array.isArray(topQueries) && topQueries.length > 0) {
            topQueriesElement.innerHTML = topQueries
                .slice(0, 5) // Show top 5 queries
                .map(query => `
                    <div class="top-query-item">
                        <span class="query-count">${query.count}</span>
                    </div>
                `).join('');
        } else {
            topQueriesElement.innerHTML = '<div class="text-muted">No queries yet</div>';
        }
    }

    updateVectorStoreStats(vectorStore) {
        const vectorStoreElement = document.getElementById('vectorStore');
        if (!vectorStoreElement || !vectorStore) return;

        vectorStoreElement.innerHTML = `
            <div class="vector-stat">
                <span>Collections: ${vectorStore.collections || 0}</span>
            </div>
            <div class="vector-stat">
                <span>Documents: ${vectorStore.documents || 0}</span>
            </div>
            <div class="vector-stat">
                <span>Embeddings: ${vectorStore.embeddings || 0}</span>
            </div>
        `;
    }

    setupAutoRefresh() {
        // Auto-refresh every 30 seconds if enabled
        this.refreshInterval = setInterval(() => {
            if (this.autoRefreshEnabled) {
                this.loadStats();
            }
        }, 30000);
    }

    enableAutoRefresh() {
        this.autoRefreshEnabled = true;
        showStatus('Auto-refresh enabled', 'info');
    }

    disableAutoRefresh() {
        this.autoRefreshEnabled = false;
        showStatus('Auto-refresh disabled', 'info');
    }

    toggleAutoRefresh() {
        if (this.autoRefreshEnabled) {
            this.disableAutoRefresh();
        } else {
            this.enableAutoRefresh();
        }
    }

    getDetailedStats() {
        return {
            ...this.stats,
            lastUpdated: new Date().toISOString(),
            autoRefreshEnabled: this.autoRefreshEnabled
        };
    }

    exportStats() {
        try {
            const exportData = {
                stats: this.getDetailedStats(),
                exportDate: new Date().toISOString(),
                application: 'RAG Document Search'
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rag-stats-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showStatus('Statistics exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting stats:', error);
            showStatus('Failed to export statistics', 'error');
        }
    }

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
}

// Initialize stats manager
const statsManager = new StatsManager(API_BASE_URL);

// Global functions for backward compatibility
window.loadStats = () => statsManager.loadStats();

console.log('Stats manager loaded successfully');