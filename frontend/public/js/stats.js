// RAG Chat Application - Statistics Management
// Handles application statistics and metrics

class StatsManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl || window.API_BASE_URL;
        this.stats = {
            totalDocuments: 0,
            totalSearches: 0,
            totalUploads: 0,
            avgResponseTime: 0,
            successRate: 0
        };
        this.init();
    }

    init() {
        console.log('Initializing Stats Manager...');
        this.setupElements();
        this.loadStats();
        window.statsManager = this;
        console.log('Stats manager initialized');
    }

        setupElements() {
        this.totalDocsElement = document.getElementById('totalDocs');
        this.totalSearchesElement = document.getElementById('totalSearches');
        this.totalUploadsElement = document.getElementById('totalUploads');
        this.avgResponseTimeElement = document.getElementById('avgResponseTime');
        this.successRateElement = document.getElementById('successRate');
    }

    async loadStats() {
        try {
            console.log('Loading statistics...');

            // Load from multiple sources
            const [documentStats, searchStats, uploadStats] = await Promise.allSettled([
                this.loadDocumentStats(),
                this.loadSearchStats(),
                this.loadUploadStats()
            ]);

            // Combine stats
            this.stats = {
                totalDocuments: documentStats.status === 'fulfilled' ? documentStats.value.total : 0,
                totalSearches: searchStats.status === 'fulfilled' ? searchStats.value.total : 0,
                totalUploads: uploadStats.status === 'fulfilled' ? uploadStats.value.total : 0,
                avgResponseTime: searchStats.status === 'fulfilled' ? searchStats.value.avgResponseTime : 0,
                successRate: searchStats.status === 'fulfilled' ? searchStats.value.successRate : 0
            };

            this.updateUI();
            console.log('Statistics loaded:', this.stats);

        } catch (error) {
            console.error('Failed to load statistics:', error);
            this.handleStatsError(error);
        }
    }

    async loadDocumentStats() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/pdf/stats/summary`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                total: data.total_documents || 0,
                processed: data.processed_documents || 0,
                failed: data.failed_documents || 0,
                totalSize: data.total_size || 0
            };
        } catch (error) {
            console.warn('Failed to load document stats:', error);
            return { total: 0, processed: 0, failed: 0, totalSize: 0 };
        }
    }

    async loadSearchStats() {
        try {
            // Get search stats from search manager if available
            if (window.searchManager) {
                const searchStats = window.searchManager.getSearchStats();
                return {
                    total: searchStats.totalSearches,
                    successful: searchStats.successfulSearches,
                    avgResponseTime: searchStats.avgResponseTime,
                    successRate: searchStats.successRate
                };
            }

            // Fallback to API
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
            return {
                total: data.total_searches || 0,
                successful: data.successful_searches || 0,
                avgResponseTime: data.avg_response_time || 0,
                successRate: data.success_rate || 0
            };
        } catch (error) {
            console.warn('Failed to load search stats:', error);
            return { total: 0, successful: 0, avgResponseTime: 0, successRate: 0 };
        }
    }

    async loadUploadStats() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/documents/upload-stats`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                total: data.total_uploads || 0,
                successful: data.successful_uploads || 0,
                failed: data.failed_uploads || 0,
                totalSize: data.total_size_uploaded || 0
            };
        } catch (error) {
            console.warn('Failed to load upload stats:', error);
            return { total: 0, successful: 0, failed: 0, totalSize: 0 };
        }
    }

    updateUI() {
        // Update total documents
        if (this.totalDocsElement) {
            this.totalDocsElement.textContent = window.formatNumber(this.stats.totalDocuments);
        }

        // Update total searches
        if (this.totalSearchesElement) {
            this.totalSearchesElement.textContent = window.formatNumber(this.stats.totalSearches);
        }

        // Update other stats if elements exist
        if (this.totalUploadsElement) {
            this.totalUploadsElement.textContent = window.formatNumber(this.stats.totalUploads);
        }

        if (this.avgResponseTimeElement) {
            this.avgResponseTimeElement.textContent = `${(this.stats.avgResponseTime * 1000).toFixed(0)}ms`;
        }

        if (this.successRateElement) {
            this.successRateElement.textContent = `${this.stats.successRate.toFixed(1)}%`;
        }
    }

    handleStatsError(error) {
        console.error('Stats error:', error);

        // Show fallback values
        if (this.totalDocsElement) {
            this.totalDocsElement.textContent = '-';
        }
        if (this.totalSearchesElement) {
            this.totalSearchesElement.textContent = '-';
        }
        if (this.totalUploadsElement) {
            this.totalUploadsElement.textContent = '-';
        }
        if (this.avgResponseTimeElement) {
            this.avgResponseTimeElement.textContent = '-';
        }
        if (this.successRateElement) {
            this.successRateElement.textContent = '-';
        }
    }

    // Increment counters for local tracking
    incrementDocumentCount() {
        this.stats.totalDocuments++;
        this.updateUI();
    }

    incrementSearchCount() {
        this.stats.totalSearches++;
        this.updateUI();
    }

    incrementUploadCount() {
        this.stats.totalUploads++;
        this.updateUI();
    }

    updateResponseTime(responseTime) {
        // Simple moving average
        const alpha = 0.1; // Smoothing factor
        this.stats.avgResponseTime = this.stats.avgResponseTime * (1 - alpha) + responseTime * alpha;
        this.updateUI();
    }

    // Public API methods
    getStats() {
        return { ...this.stats };
    }

    async refreshStats() {
        await this.loadStats();
    }
}

// Initialize stats manager when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (window.API_BASE_URL) {
        window.statsManager = new StatsManager(window.API_BASE_URL);
        console.log('Stats manager created and registered');
    } else {
        console.error('API_BASE_URL not defined, cannot initialize stats manager');
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StatsManager;
}

console.log('Stats manager loaded');

