// RAG Chat Application - Statistics Manager
// Handles statistics display and data fetching

class StatsManager {
    constructor(ragClient) {
    this.ragClient = ragClient; // Direct assignment, no fallback to window.ragClient
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

    // Only initialize if ragClient is available
    if (this.ragClient) {
        console.log('StatsManager initialized with ragClient');
        this.init();
    } else {
        console.warn('StatsManager initialized without ragClient - will retry initialization');
        this.retryInitialization();
    }
}
retryInitialization() {
    let attempts = 0;
    const maxAttempts = 50;

    const tryInit = () => {
        attempts++;

        if (window.ragClient) {
            console.log('StatsManager: RAGClient now available, initializing...');
            this.ragClient = window.ragClient;
            this.init();
        } else if (attempts < maxAttempts) {
            setTimeout(tryInit, 100);
        } else {
            console.error('StatsManager: Failed to initialize after maximum attempts');
            this.showError('Failed to initialize statistics client');
        }
    };

    setTimeout(tryInit, 100);
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

    if (!this.ragClient) {
        console.error('RAGClient not available in StatsManager. Cannot load stats.');
        this.showError('RAGClient not available');
        return;
    }

    if (typeof this.ragClient.getStats !== 'function') {
        console.error('RAGClient getStats method not available. Cannot load stats.');
        this.showError('getStats method not available');
        return;
    }

    this.isLoading = true;
    this.showLoading();

    try {
        console.log('StatsManager: Attempting to load stats...');

        const result = await this.ragClient.getStats();

        console.log('StatsManager: Raw API response:', result);

        if (result.success) {
            // FIX: Correctly extract the nested stats data
            const statsData = result.data?.stats || result.stats || result.data;

            if (statsData) {
                this.updateStats(statsData);
                console.log('StatsManager: Stats loaded successfully:', statsData);
            } else {
                throw new Error('No stats data found in response');
            }
        } else {
            throw new Error(result.error || 'Unknown API error');
        }

    } catch (error) {
        console.error('StatsManager: Error loading stats:', error);
        this.showError(error.message);
    } finally {
        this.isLoading = false;
        this.hideLoading();
    }
}

    updateStats(newStats) {
    console.log('StatsManager: Updating stats with data:', newStats);

    // Update internal stats with proper fallbacks for API response structure
    this.stats = {
        totalDocs: newStats.total_documents || newStats.totalDocs || 0,
        totalSearches: newStats.total_searches || newStats.totalSearches || 0,
        completedDocs: newStats.completed_documents || newStats.completedDocs || 0,
        processingDocs: newStats.processing_documents || newStats.processingDocs || 0,
        failedDocs: newStats.failed_documents || newStats.failedDocs || 0,
        totalStorage: newStats.total_storage_bytes || newStats.totalStorage || 0,
        lastUpdated: new Date().toISOString(),
        // Preserve any additional stats from the API
        ...newStats
    };

    console.log('StatsManager: Internal stats updated to:', this.stats);

    // Update UI elements
    this.updateStatsDisplay();
}

    updateStatsDisplay() {
    // Update basic stats
    if (this.totalDocsElement) {
        this.totalDocsElement.textContent = this.formatNumber(this.stats.totalDocs);

        // Make it clickable and add cursor pointer style
        this.totalDocsElement.style.cursor = 'pointer';
        this.totalDocsElement.style.color = '#3498db';
        this.totalDocsElement.title = 'Click to view all documents';

        // Remove existing listener if any
        this.totalDocsElement.replaceWith(this.totalDocsElement.cloneNode(true));
        // Get the new element reference
        this.totalDocsElement = document.getElementById('totalDocs');

        // Add click listener
        if (this.totalDocsElement) {
            this.totalDocsElement.addEventListener('click', () => {
                this.openDocumentList();
            });
        }
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

    /**
     * Opens the document list modal
     */
    openDocumentList() {
        const modal = document.getElementById('documentListModal');
        if (modal) {
            modal.style.display = 'block';
            this.loadDocumentList();
            this.setupDocumentListEventListeners();
        }
    }

    /**
     * Closes the document list modal
     */
    closeDocumentList() {
    const modal = document.getElementById('documentListModal');
    if (modal) {
        modal.style.display = 'none';
        this.clearDocumentSearch();
        console.log('Document list modal closed');
    }
}

    /**
     * Loads the list of documents from the API
     */
    async loadDocumentList() {
    const loadingEl = document.getElementById('documentListLoading');
    const errorEl = document.getElementById('documentListError');
    const tableEl = document.getElementById('documentListTable');
    const emptyEl = document.getElementById('documentListEmpty');

    // Show loading state
    if (loadingEl) loadingEl.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';
    if (tableEl) tableEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';

    try {
        if (!this.ragClient) {
            throw new Error('RAG Client not available');
        }

        console.log('Loading document list...');
        const result = await this.ragClient.listDocuments();

        console.log('Raw document list response:', result);

        if (result.success) {
            // Handle different possible response structures
            let documents = [];

            if (result.data) {
                // Check if result.data is an array
                if (Array.isArray(result.data)) {
                    documents = result.data;
                }
                // Check if result.data has a documents property
                else if (result.data.documents && Array.isArray(result.data.documents)) {
                    documents = result.data.documents;
                }
                // Check if result.data has a files property
                else if (result.data.files && Array.isArray(result.data.files)) {
                    documents = result.data.files;
                }
                // Check if result.data has a pdfs property
                else if (result.data.pdfs && Array.isArray(result.data.pdfs)) {
                    documents = result.data.pdfs;
                }
                // If result.data is an object, wrap it in an array
                else if (typeof result.data === 'object' && result.data !== null) {
                    documents = [result.data];
                }
            }
            // Check if result itself has documents
            else if (result.documents && Array.isArray(result.documents)) {
                documents = result.documents;
            }
            // Check if result itself is an array
            else if (Array.isArray(result)) {
                documents = result;
            }

            console.log('Processed documents array:', documents);
            console.log('Number of documents:', documents.length);

            this.renderDocumentList(documents);
        } else {
            throw new Error(result.error || 'Failed to load documents');
        }

    } catch (error) {
        console.error('Error loading document list:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) {
            errorEl.style.display = 'block';
            const errorText = errorEl.querySelector('.error-text');
            if (errorText) {
                errorText.textContent = `Failed to load documents: ${error.message}`;
            }
        }
    }
}

    /**
     * Renders the document list in the table
     */
    renderDocumentList(documents) {
    const loadingEl = document.getElementById('documentListLoading');
    const tableEl = document.getElementById('documentListTable');
    const emptyEl = document.getElementById('documentListEmpty');
    const tableBody = document.getElementById('documentListTableBody');

    if (loadingEl) loadingEl.style.display = 'none';

    console.log('Rendering document list:', documents);

    // Ensure documents is an array
    if (!Array.isArray(documents)) {
        console.error('Documents is not an array:', documents);
        if (emptyEl) {
            emptyEl.style.display = 'block';
            const emptyText = emptyEl.querySelector('p');
            if (emptyText) {
                emptyText.textContent = 'Error: Invalid document data format';
            }
        }
        return;
    }

    if (documents.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }

    if (tableEl) tableEl.style.display = 'table';

    if (tableBody) {
        try {
            tableBody.innerHTML = documents.map(doc => this.createDocumentRow(doc)).join('');
            console.log('Document table rendered successfully');
        } catch (mapError) {
            console.error('Error mapping documents:', mapError);
            if (emptyEl) {
                emptyEl.style.display = 'block';
                const emptyText = emptyEl.querySelector('p');
                if (emptyText) {
                    emptyText.textContent = 'Error rendering document list';
                }
            }
        }
    }

    // Store documents for search functionality
    this.allDocuments = documents;
    this.filteredDocuments = documents;
}

    /**
     * Creates a table row for a document
     */
    createDocumentRow(doc) {
        const docName = doc.title || doc.filename || doc.name || 'Unnamed Document';
        const category = doc.category || 'Uncategorized';
        const docId = doc.id || doc.document_id;

        return `
            <tr data-doc-id="${docId}">
                <td>
                    <span class="document-name" onclick="viewDocument('${docId}', '${docName.replace(/'/g, "\\'")}')">
                        ${docName}
                    </span>
                </td>
                <td>
                    <span class="document-category">${category}</span>
                </td>
                <td class="document-actions">
                    <button class="btn btn-sm btn-outline" onclick="viewDocument('${docId}', '${docName.replace(/'/g, "\\'")}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="downloadDocument('${docId}', '${docName.replace(/'/g, "\\'")}')">
                        <i class="fas fa-download"></i> Download
                    </button>
                    <button class="btn btn-sm btn-outline btn-danger" onclick="deleteDocument('${docId}', '${docName.replace(/'/g, "\\'")}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `;
    }

    /**
     * Filters documents based on search input
     */
    filterDocuments(searchTerm) {
        if (!this.allDocuments) return;

        const filtered = this.allDocuments.filter(doc => {
            const docName = (doc.title || doc.filename || doc.name || '').toLowerCase();
            const category = (doc.category || '').toLowerCase();
            const search = searchTerm.toLowerCase();

            return docName.includes(search) || category.includes(search);
        });

        this.filteredDocuments = filtered;
        this.renderDocumentList(filtered);
    }

    /**
     * Sets up event listeners for the document list modal
     */
    setupDocumentListEventListeners() {
        // Close modal listeners
        const closeBtn = document.getElementById('closeDocumentList');
        const modal = document.getElementById('documentListModal');

        if (closeBtn && !closeBtn.hasAttribute('data-listener-added')) {
            closeBtn.addEventListener('click', () => this.closeDocumentList());
            closeBtn.setAttribute('data-listener-added', 'true');
        }

        if (modal && !modal.hasAttribute('data-listener-added')) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeDocumentList();
                }
            });
            modal.setAttribute('data-listener-added', 'true');
        }

        // Search input listener
        const searchInput = document.getElementById('documentSearchInput');
        if (searchInput && !searchInput.hasAttribute('data-listener-added')) {
            searchInput.addEventListener('input', (e) => {
                this.filterDocuments(e.target.value);
            });
            searchInput.setAttribute('data-listener-added', 'true');
        }
    }

    /**
     * Clears the document search
     */
    clearDocumentSearch() {
        const searchInput = document.getElementById('documentSearchInput');
        if (searchInput) {
            searchInput.value = '';
            if (this.allDocuments) {
                this.renderDocumentList(this.allDocuments);
            }
        }
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
    // Wait for ragClient to be available before creating StatsManager
    function createStatsManager() {
        if (window.ragClient && !window.statsManager) {
            window.statsManager = new StatsManager(window.ragClient);
            window.statsManager.setupEventListeners();
            console.log('Global StatsManager created');
        } else if (!window.ragClient) {
            // Retry after a short delay
            setTimeout(createStatsManager, 100);
        }
    }

    createStatsManager();
});

window.refreshDocumentList = function() {
    if (window.statsManager && window.statsManager.loadDocumentList) {
        window.statsManager.loadDocumentList();
    }
};

window.clearDocumentSearch = function() {
    if (window.statsManager && window.statsManager.clearDocumentSearch) {
        window.statsManager.clearDocumentSearch();
    }
};

document.addEventListener('DOMContentLoaded', function() {
    const closeDocumentViewer = document.getElementById('closeDocumentViewer');
    if (closeDocumentViewer) {
        closeDocumentViewer.addEventListener('click', function() {
            // Clear document content first
            clearDocumentViewer();

            // Hide back button when closing document viewer
            const backBtn = document.getElementById('backToDocumentList');
            if (backBtn) {
                backBtn.style.display = 'none';
            }

            // Clear the previous modal reference
            if (window.statsManager) {
                window.statsManager.previousModal = null;
            }
        });
    }

    // Also handle clicking outside modal
    const documentViewerModal = document.getElementById('documentViewerModal');
    if (documentViewerModal) {
        documentViewerModal.addEventListener('click', function(e) {
            if (e.target === documentViewerModal) {
                // Clear content when closing by clicking outside
                clearDocumentViewer();

                // Hide back button when closing by clicking outside
                const backBtn = document.getElementById('backToDocumentList');
                if (backBtn) {
                    backBtn.style.display = 'none';
                }

                if (window.statsManager) {
                    window.statsManager.previousModal = null;
                }
            }
        });
    }
});


window.returnToDocumentList = function() {
    try {
        console.log('Back to document list button clicked');

        // Clear ALL document viewer content first
        clearDocumentViewer();

        // Close document viewer modal
        const documentViewer = document.getElementById('documentViewerModal');
        if (documentViewer) {
            documentViewer.style.display = 'none';
            console.log('Document viewer closed');
        }

        // Hide the back button
        const backBtn = document.getElementById('backToDocumentList');
        if (backBtn) {
            backBtn.style.display = 'none';
        }

        // Reopen document list after a short delay
        setTimeout(() => {
            if (window.statsManager && window.statsManager.openDocumentList) {
                console.log('Reopening document list');
                window.statsManager.openDocumentList();
            } else {
                console.error('StatsManager or openDocumentList method not available');
            }
        }, 100);

    } catch (error) {
        console.error('Error in returnToDocumentList:', error);
        if (window.showStatus) {
            window.showStatus('Error returning to document list: ' + error.message, 'error');
        }
    }
};

// Add this new function to clear document viewer content
function clearDocumentViewer() {
    console.log('Clearing document viewer content...');

    // Clear iframe
    const iframe = document.getElementById('documentViewerIframe');
    if (iframe) {
        iframe.src = 'about:blank'; // Clear the iframe
        console.log('Iframe cleared');
    }

    // Clear image container
    const imageContainer = document.getElementById('documentImageContainer');
    const documentImage = document.getElementById('documentImage');
    if (imageContainer) {
        imageContainer.style.display = 'none';
        if (documentImage) {
            documentImage.src = '';
            documentImage.alt = '';
        }
        console.log('Image container cleared');
    }

    // Clear text container
    const textContainer = document.getElementById('documentTextContainer');
    const documentText = document.getElementById('documentText');
    if (textContainer) {
        textContainer.style.display = 'none';
        if (documentText) {
            documentText.textContent = '';
        }
        console.log('Text container cleared');
    }

    // Hide loading and error containers
    const loadingContainer = document.getElementById('documentLoadingContainer');
    const errorContainer = document.getElementById('documentErrorContainer');

    if (loadingContainer) {
        loadingContainer.style.display = 'none';
    }

    if (errorContainer) {
        errorContainer.style.display = 'none';
    }

    // Reset document viewer title
    const viewerTitle = document.getElementById('documentViewerTitle');
    if (viewerTitle) {
        viewerTitle.textContent = 'Document Viewer';
    }

    console.log('Document viewer content cleared successfully');
}

window.loadDocumentList = function() {
    if (window.statsManager && window.statsManager.loadDocumentList) {
        window.statsManager.loadDocumentList();
    }
};

// Document action functions (these use your existing functionality)
window.viewDocument = function(docId, docName) {
    console.log('Opening document viewer for:', docName, 'ID:', docId);

    // Store reference to return to document list if needed
    if (window.statsManager) {
        window.statsManager.previousModal = 'documentList';
    }

    // Close the document list modal
    if (window.statsManager && window.statsManager.closeDocumentList) {
        window.statsManager.closeDocumentList();
    }

    // Show the back button
    setTimeout(() => {
        const backBtn = document.getElementById('backToDocumentList');
        if (backBtn) {
            backBtn.style.display = 'inline-block';
            console.log('Back button should now be visible');
        } else {
            console.error('Back button element not found!');
        }
    }, 100);

    // Open document viewer after a brief delay for smooth transition
    setTimeout(() => {
        // Try different possible function names for your document viewer
        if (window.openDocumentViewer) {
            window.openDocumentViewer(docId);
        } else if (window.showDocumentViewer) {
            window.showDocumentViewer(docId);
        } else if (window.viewPDF) {
            window.viewPDF(docId);
        } else if (window.openDocument) {
            window.openDocument(docId);
        } else {
            // If no viewer function found, show error
            console.error('Document viewer function not found');
            if (window.showStatus) {
                window.showStatus('Document viewer not available', 'error');
            }

            // Reopen document list modal since viewer failed
            if (window.statsManager && window.statsManager.openDocumentList) {
                window.statsManager.openDocumentList();
            }
        }
    }, 150);
};



window.downloadDocument = function(docId, docName) {
    if (window.ragClient && window.ragClient.downloadDocument) {
        window.ragClient.downloadDocument(docId).then(result => {
            if (result.success) {
                // Create download link
                const blob = result.data;
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = docName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);

                if (window.showStatus) {
                    window.showStatus(`Downloaded: ${docName}`, 'success');
                }
            } else {
                console.error('Download failed:', result.error);
                if (window.showStatus) {
                    window.showStatus(`Failed to download: ${docName}`, 'error');
                }
            }
        }).catch(error => {
            console.error('Download error:', error);
            if (window.showStatus) {
                window.showStatus(`Download error: ${error.message}`, 'error');
            }
        });
    } else {
        console.log('Download document:', docName, 'ID:', docId);
        if (window.showStatus) {
            window.showStatus('Download functionality not available', 'warning');
        }
    }
};

window.deleteDocument = function(docId, docName) {
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete "${docName}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    if (window.ragClient && window.ragClient.deleteDocument) {
        window.ragClient.deleteDocument(docId).then(result => {
            if (result.success) {
                // Remove the document row from the table
                const row = document.querySelector(`tr[data-doc-id="${docId}"]`);
                if (row) {
                    row.remove();
                }

                // Update the document count in stats
                if (window.statsManager && window.statsManager.loadStats) {
                    window.statsManager.loadStats();
                }

                // Refresh the document list
                if (window.statsManager && window.statsManager.loadDocumentList) {
                    window.statsManager.loadDocumentList();
                }

                if (window.showStatus) {
                    window.showStatus(`Deleted: ${docName}`, 'success');
                }
            } else {
                console.error('Delete failed:', result.error);
                if (window.showStatus) {
                    window.showStatus(`Failed to delete: ${docName}`, 'error');
                }
            }
        }).catch(error => {
            console.error('Delete error:', error);
            if (window.showStatus) {
                window.showStatus(`Delete error: ${error.message}`, 'error');
            }
        });
    } else {
        console.log('Delete document:', docName, 'ID:', docId);
        if (window.showStatus) {
            window.showStatus('Delete functionality not available', 'warning');
        }
    }
};

console.log('Stats manager loaded');
