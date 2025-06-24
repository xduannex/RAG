// RAG Chat Application - Statistics Manager
// Handles statistics display and data fetching

class StatsManager {
    constructor(ragClient) {
        this.ragClient = ragClient || window.ragClient;
        this.stats = {
            totalDocs: 0,
            totalSearches: 0,
            completedDocs: 0,
            processingDocs: 0,
            failedDocs: 0,
            totalStorage: 0,
            lastUpdated: null
        };
        this.isLoading = false;
        this.autoRefreshInterval = null;

        console.log('StatsManager initialized with ragClient');
        this.init();
    }

    init() {
        this.setupElements();
        this.loadStats();
        this.setupAutoRefresh();
    }

    setupElements() {
        this.totalDocsElement = document.getElementById('totalDocs');
        this.totalSearchesElement = document.getElementById('totalSearches');
        this.completedDocsElement = document.getElementById('completedDocs');
        this.processingDocsElement = document.getElementById('processingDocs');
        this.failedDocsElement = document.getElementById('failedDocs');
        this.storageUsedElement = document.getElementById('storageUsed');
        this.lastUpdatedElement = document.getElementById('lastUpdated');
    }

    async loadStats() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading();

        try {
            const result = await this.ragClient.getStats();

            if (result.success) {
                this.updateStats(result.data);
                console.log('Stats loaded successfully:', result.data);
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('Error loading stats:', error);
            this.showError(error.message);
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    updateStats(newStats) {
        // Update internal stats
        this.stats = {
            totalDocs: newStats.total_documents || 0,
            totalSearches: newStats.total_searches || 0,
            completedDocs: newStats.completed_documents || 0,
            processingDocs: newStats.processing_documents || 0,
            failedDocs: newStats.failed_documents || 0,
            totalStorage: newStats.total_storage_bytes || 0,
            lastUpdated: new Date().toISOString(),
            ...newStats
        };

        // Update UI elements
        this.updateStatsDisplay();
    }

    updateStatsDisplay() {
        // Update basic stats
        if (this.totalDocsElement) {
            this.totalDocsElement.textContent = this.formatNumber(this.stats.totalDocs);
        }

        if (this.totalSearchesElement) {
            this.totalSearchesElement.textContent = this.formatNumber(this.stats.totalSearches);
        }

        // Update detailed stats if elements exist
        if (this.completedDocsElement) {
            this.completedDocsElement.textContent = this.formatNumber(this.stats.completedDocs);
        }

        if (this.processingDocsElement) {
            this.processingDocsElement.textContent = this.formatNumber(this.stats.processingDocs);
        }

        if (this.failedDocsElement) {
            this.failedDocsElement.textContent = this.formatNumber(this.stats.failedDocs);
        }

        if (this.storageUsedElement) {
            this.storageUsedElement.textContent = this.formatFileSize(this.stats.totalStorage);
        }

        if (this.lastUpdatedElement) {
            this.lastUpdatedElement.textContent = this.formatTime(new Date(this.stats.lastUpdated));
        }

        // Update progress bars and charts if they exist
        this.updateProgressBars();
        this.updateCharts();
    }

    updateProgressBars() {
        // Document processing progress
        const docProgressBar = document.getElementById('docProcessingProgress');
        if (docProgressBar && this.stats.totalDocs > 0) {
            const completedPercentage = (this.stats.completedDocs / this.stats.totalDocs) * 100;
            docProgressBar.style.width = `${completedPercentage}%`;
            docProgressBar.setAttribute('aria-valuenow', completedPercentage);
        }

        // Storage usage progress (if max storage is defined)
        const storageProgressBar = document.getElementById('storageProgress');
        if (storageProgressBar && window.APP_CONFIG?.upload?.maxStorageSize) {
            const storagePercentage = (this.stats.totalStorage / window.APP_CONFIG.upload.maxStorageSize) * 100;
            storageProgressBar.style.width = `${Math.min(storagePercentage, 100)}%`;
            storageProgressBar.setAttribute('aria-valuenow', Math.min(storagePercentage, 100));
        }
    }

    updateCharts() {
        // Update document status chart
        this.updateDocumentStatusChart();

        // Update search history chart (if exists)
        this.updateSearchHistoryChart();
    }

    updateDocumentStatusChart() {
        const chartCanvas = document.getElementById('documentStatusChart');
        if (!chartCanvas) return;

        const ctx = chartCanvas.getContext('2d');
        const data = {
            labels: ['Completed', 'Processing', 'Failed'],
            datasets: [{
                data: [this.stats.completedDocs, this.stats.processingDocs, this.stats.failedDocs],
                backgroundColor: ['#28a745', '#ffc107', '#dc3545'],
                borderWidth: 0
            }]
        };

        // Simple chart implementation (replace with Chart.js if available)
        this.drawSimpleChart(ctx, data);
    }

    drawSimpleChart(ctx, data) {
        const canvas = ctx.canvas;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const total = data.datasets[0].data.reduce((sum, value) => sum + value, 0);
        if (total === 0) return;

        let currentAngle = -Math.PI / 2; // Start at top

        data.datasets[0].data.forEach((value, index) => {
            const sliceAngle = (value / total) * 2 * Math.PI;

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.lineTo(centerX, centerY);
            ctx.fillStyle = data.datasets[0].backgroundColor[index];
            ctx.fill();

            currentAngle += sliceAngle;
        });
    }

    updateSearchHistoryChart() {
        // Implementation for search history chart
        // This could show search trends over time
        const chartElement = document.getElementById('searchHistoryChart');
        if (!chartElement) return;

        // Simple implementation - could be enhanced with actual chart library
        console.log('Search history chart update not implemented');
    }

    showLoading() {
        // Show loading indicators on stat elements
                const statElements = [
            this.totalDocsElement,
            this.totalSearchesElement,
            this.completedDocsElement,
            this.processingDocsElement,
            this.failedDocsElement
        ];

        statElements.forEach(element => {
            if (element) {
                element.textContent = '...';
                element.classList.add('loading');
            }
        });
    }

    hideLoading() {
        const statElements = [
            this.totalDocsElement,
            this.totalSearchesElement,
            this.completedDocsElement,
            this.processingDocsElement,
            this.failedDocsElement
        ];

        statElements.forEach(element => {
            if (element) {
                element.classList.remove('loading');
            }
        });
    }

    showError(message) {
        console.error('Stats error:', message);

        // Update stat elements to show error state
        if (this.totalDocsElement) {
            this.totalDocsElement.textContent = '-';
        }
        if (this.totalSearchesElement) {
            this.totalSearchesElement.textContent = '-';
        }

        if (window.showStatus) {
            window.showStatus('Failed to load statistics: ' + message, 'error');
        }
    }

    setupAutoRefresh() {
        // Auto-refresh stats every 30 seconds
        this.autoRefreshInterval = setInterval(() => {
            if (!this.isLoading) {
                this.loadStats();
            }
        }, 30000);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    // Public API methods
    async refreshStats() {
        console.log('Manually refreshing stats...');
        await this.loadStats();

        if (window.showStatus) {
            window.showStatus('Statistics refreshed', 'success');
        }
    }

    getStats() {
        return { ...this.stats };
    }

    async getDetailedStats() {
        try {
            const result = await this.ragClient.getDetailedStats();

            if (result.success) {
                return result.data;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error getting detailed stats:', error);
            throw error;
        }
    }

    async getSystemStats() {
        try {
            const result = await this.ragClient.getSystemStats();

            if (result.success) {
                return result.data;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error getting system stats:', error);
            throw error;
        }
    }

    // Event handlers
    onDocumentUploaded(event) {
        // Update stats when document is uploaded
        this.stats.totalDocs++;
        this.stats.processingDocs++;
        this.updateStatsDisplay();

        // Refresh from server after a delay
        setTimeout(() => this.loadStats(), 2000);
    }

    onDocumentProcessed(event) {
        // Update stats when document processing completes
        if (this.stats.processingDocs > 0) {
            this.stats.processingDocs--;
        }
        this.stats.completedDocs++;
        this.updateStatsDisplay();

        // Refresh from server
        setTimeout(() => this.loadStats(), 1000);
    }

    onDocumentDeleted(event) {
        // Update stats when document is deleted
        if (this.stats.totalDocs > 0) {
            this.stats.totalDocs--;
        }
        if (this.stats.completedDocs > 0) {
            this.stats.completedDocs--;
        }
        this.updateStatsDisplay();

        // Refresh from server
        setTimeout(() => this.loadStats(), 1000);
    }

    onSearchPerformed(event) {
        // Update search count
        this.stats.totalSearches++;
        this.updateStatsDisplay();
    }

    // Utility methods
    formatNumber(num) {
        if (num === null || num === undefined || isNaN(num)) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    formatFileSize(bytes) {
        if (!bytes || isNaN(bytes)) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatTime(date) {
        if (!date) return 'Never';
        try {
            return date.toLocaleString();
        } catch (error) {
            return 'Unknown';
        }
    }

    formatPercentage(value, total) {
        if (!total || total === 0) return '0%';
        return Math.round((value / total) * 100) + '%';
    }

    // Export/Import functionality
    exportStats() {
        const exportData = {
            stats: this.stats,
            exported_at: new Date().toISOString(),
            version: '1.0.0'
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rag_stats_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (window.showStatus) {
            window.showStatus('Statistics exported successfully', 'success');
        }
    }

    // Enhanced stats display methods
    createStatsCards() {
        const statsContainer = document.getElementById('statsContainer');
        if (!statsContainer) return;

        const cards = [
            {
                title: 'Total Documents',
                value: this.stats.totalDocs,
                icon: 'fas fa-file-alt',
                color: 'primary'
            },
            {
                title: 'Completed',
                value: this.stats.completedDocs,
                icon: 'fas fa-check-circle',
                color: 'success'
            },
            {
                title: 'Processing',
                value: this.stats.processingDocs,
                icon: 'fas fa-spinner fa-spin',
                color: 'warning'
            },
            {
                title: 'Failed',
                value: this.stats.failedDocs,
                icon: 'fas fa-exclamation-triangle',
                color: 'danger'
            },
            {
                title: 'Total Searches',
                value: this.stats.totalSearches,
                icon: 'fas fa-search',
                color: 'info'
            },
            {
                title: 'Storage Used',
                value: this.formatFileSize(this.stats.totalStorage),
                icon: 'fas fa-hdd',
                color: 'secondary'
            }
        ];

        const cardsHTML = cards.map(card => `
            <div class="stat-card stat-card-${card.color}">
                <div class="stat-card-icon">
                    <i class="${card.icon}"></i>
                </div>
                <div class="stat-card-content">
                    <div class="stat-card-value">${typeof card.value === 'number' ? this.formatNumber(card.value) : card.value}</div>
                    <div class="stat-card-title">${card.title}</div>
                </div>
            </div>
        `).join('');

        statsContainer.innerHTML = cardsHTML;
    }

    createDetailedStatsView() {
        const detailsContainer = document.getElementById('statsDetails');
        if (!detailsContainer) return;

        const processingRate = this.stats.totalDocs > 0 ?
            this.formatPercentage(this.stats.completedDocs, this.stats.totalDocs) : '0%';

        const failureRate = this.stats.totalDocs > 0 ?
            this.formatPercentage(this.stats.failedDocs, this.stats.totalDocs) : '0%';

        const detailsHTML = `
            <div class="stats-details">
                <h4>Processing Statistics</h4>
                <div class="detail-row">
                    <span class="detail-label">Success Rate:</span>
                    <span class="detail-value">${processingRate}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Failure Rate:</span>
                    <span class="detail-value">${failureRate}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Average Processing Time:</span>
                    <span class="detail-value">${this.stats.averageProcessingTime || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Last Updated:</span>
                    <span class="detail-value">${this.formatTime(new Date(this.stats.lastUpdated))}</span>
                </div>
            </div>
        `;

        detailsContainer.innerHTML = detailsHTML;
    }

    // Performance monitoring
    async getPerformanceMetrics() {
        try {
            const result = await this.ragClient.getPerformanceMetrics();

            if (result.success) {
                return {
                    responseTime: result.data.average_response_time,
                    throughput: result.data.requests_per_minute,
                    errorRate: result.data.error_rate,
                    uptime: result.data.uptime
                };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error getting performance metrics:', error);
            return null;
        }
    }

    displayPerformanceMetrics(metrics) {
        if (!metrics) return;

        const performanceContainer = document.getElementById('performanceMetrics');
        if (!performanceContainer) return;

        const metricsHTML = `
            <div class="performance-metrics">
                <h4>System Performance</h4>
                <div class="metrics-grid">
                    <div class="metric-item">
                        <div class="metric-value">${metrics.responseTime}ms</div>
                        <div class="metric-label">Avg Response Time</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${metrics.throughput}</div>
                        <div class="metric-label">Requests/Min</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${metrics.errorRate}%</div>
                        <div class="metric-label">Error Rate</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${metrics.uptime}</div>
                        <div class="metric-label">Uptime</div>
                    </div>
                </div>
            </div>
        `;

        performanceContainer.innerHTML = metricsHTML;
    }

    // Cleanup method
    cleanup() {
        this.stopAutoRefresh();

        // Remove event listeners
        document.removeEventListener('documentUploaded', this.onDocumentUploaded);
        document.removeEventListener('documentProcessed', this.onDocumentProcessed);
        document.removeEventListener('documentDeleted', this.onDocumentDeleted);
        document.removeEventListener('searchPerformed', this.onSearchPerformed);
    }

    // Initialize event listeners
    setupEventListeners() {
        // Listen for document events
        document.addEventListener('documentUploaded', (e) => this.onDocumentUploaded(e));
        document.addEventListener('documentProcessed', (e) => this.onDocumentProcessed(e));
        document.addEventListener('documentDeleted', (e) => this.onDocumentDeleted(e));
        document.addEventListener('searchPerformed', (e) => this.onSearchPerformed(e));
    }
}

// Global functions for HTML onclick handlers
window.loadStats = function() {
    if (window.statsManager) {
        window.statsManager.refreshStats();
    } else if (window.ragApp?.managers?.stats) {
        window.ragApp.managers.stats.refreshStats();
    }
};

window.exportStats = function() {
    if (window.statsManager) {
        window.statsManager.exportStats();
    } else if (window.ragApp?.managers?.stats) {
        window.ragApp.managers.stats.exportStats();
    }
};

// Create global instance
document.addEventListener('DOMContentLoaded', () => {
    if (window.ragClient && !window.statsManager) {
        window.statsManager = new StatsManager(window.ragClient);
        window.statsManager.setupEventListeners();
        console.log('Global StatsManager created');
    }
});

console.log('Stats manager loaded');
