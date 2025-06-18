// RAG Chat Application - Enhanced Document Management
// Handles document listing, viewing, and PDF conversion

class DocumentManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
        this.documents = [];
        this.currentDocument = null;
        this.isLoading = false;
        this.currentPage = 1;
        this.totalPages = 1;
        this.filters = {};
        this.init();
    }

    init() {
        console.log('Initializing Document Manager...');
        this.setupElements();
        this.setupEventListeners();
        this.loadDocuments();

        // Register globally
        window.documentManager = this;
        console.log('Document manager initialized');
    }

    setupElements() {
        this.documentList = document.getElementById('documentList');
        this.totalDocsElement = document.getElementById('totalDocs');
        this.documentViewerModal = document.getElementById('documentViewerModal');
        this.documentViewerTitle = document.getElementById('documentViewerTitle');
        this.documentContent = document.getElementById('documentContent');
    }

    setupEventListeners() {
        // Modal close events
        if (this.documentViewerModal) {
            this.documentViewerModal.addEventListener('click', (e) => {
                if (e.target === this.documentViewerModal) {
                    this.closeDocumentViewer();
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.documentViewerModal?.style.display === 'flex') {
                this.closeDocumentViewer();
            }
        });
    }

    async loadDocuments(page = 1, filters = {}) {
        if (this.isLoading) return;

        this.isLoading = true;
        this.currentPage = page;
        this.filters = { ...filters };

        try {
            this.showDocumentListLoading();

            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20',
                ...filters
            });

            const response = await fetch(`${this.apiBaseUrl}/documents/?${params}`);
            
            if (!response.ok) {
                throw new Error(`Failed to load documents: ${response.statusText}`);
            }

            const data = await response.json();
            this.documents = data.documents || [];
            this.totalPages = data.pagination?.pages || 1;

            this.renderDocumentList();
            this.updateStats();

        } catch (error) {
            console.error('Failed to load documents:', error);
            this.showDocumentListError(error.message);
            
            if (window.showStatus) {
                window.showStatus('Failed to load documents: ' + error.message, 'error');
            }
        } finally {
            this.isLoading = false;
        }
    }

    renderDocumentList() {
        if (!this.documentList) return;

        if (this.documents.length === 0) {
            this.documentList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-folder-open"></i>
                    </div>
                    <div class="empty-text">No documents found</div>
                    <div class="empty-subtext">Upload some documents to get started</div>
                </div>
            `;
            return;
        }

        const documentsHTML = this.documents.map(doc => this.createDocumentItemHTML(doc)).join('');
        this.documentList.innerHTML = documentsHTML;

        // Add pagination if needed
        if (this.totalPages > 1) {
            this.documentList.appendChild(this.createPaginationHTML());
        }
    }

    createDocumentItemHTML(document) {
        const fileTypeIcon = this.getFileTypeIcon(document.file_type);
        const statusBadge = this.getStatusBadge(document.status);
        const fileSize = this.formatFileSize(document.file_size);
        const uploadDate = this.formatDate(document.upload_date);
        const canViewAsPdf = document.can_convert_to_pdf || document.file_type.toLowerCase() === 'pdf';

        return `
            <div class="pdf-item" data-document-id="${document.id}" data-status="${document.status}">
                <div class="pdf-icon" data-type="${document.file_type.toUpperCase()}">
                    <i class="${fileTypeIcon}"></i>
                </div>
                <div class="pdf-info">
                    <div class="pdf-title" title="${this.escapeHtml(document.original_filename)}">
                        ${this.escapeHtml(document.title || document.filename)}
                    </div>
                    <div class="pdf-meta">
                        <div class="pdf-meta-row">
                            <span class="pdf-filename">${this.escapeHtml(document.original_filename)}</span>
                        </div>
                        <div class="pdf-meta-row">
                            <span class="pdf-size">${fileSize}</span>
                            <span class="pdf-date">${uploadDate}</span>
                            ${document.chunk_count ? `<span class="pdf-chunks">${document.chunk_count} chunks</span>` : ''}
                        </div>
                        ${document.category ? `<div class="pdf-category">${this.escapeHtml(document.category)}</div>` : ''}
                    </div>
                </div>
                <div class="pdf-status">
                    ${statusBadge}
                </div>
                <div class="pdf-actions">
                    ${canViewAsPdf ? `
                        <button class="btn btn-ghost btn-sm" onclick="window.documentManager.viewDocumentAsPdf('${document.id}')" title="View as PDF">
                            <i class="fas fa-eye"></i>
                        </button>
                    ` : ''}
                    <button class="btn btn-ghost btn-sm" onclick="window.documentManager.viewDocumentDetails('${document.id}')" title="View Details">
                        <i class="fas fa-info-circle"></i>
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="window.documentManager.downloadDocument('${document.id}')" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-ghost btn-sm btn-danger" onclick="window.documentManager.deleteDocument('${document.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    createPaginationHTML() {
        const paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-container';

        let paginationHTML = '<div class="pagination">';

        // Previous button
        if (this.currentPage > 1) {
            paginationHTML += `
                <button class="btn btn-outline btn-sm" onclick="window.documentManager.loadDocuments(${this.currentPage - 1}, window.documentManager.filters)">
                    <i class="fas fa-chevron-left"></i> Previous
                </button>
            `;
        }

        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(this.totalPages, this.currentPage + 2);

        if (startPage > 1) {
            paginationHTML += `
                <button class="btn btn-outline btn-sm" onclick="window.documentManager.loadDocuments(1, window.documentManager.filters)">1</button>
            `;
            if (startPage > 2) {
                paginationHTML += '<span class="pagination-ellipsis">...</span>';
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === this.currentPage;
            paginationHTML += `
                <button class="btn ${isActive ? 'btn-primary' : 'btn-outline'} btn-sm" 
                        onclick="window.documentManager.loadDocuments(${i}, window.documentManager.filters)">
                    ${i}
                </button>
            `;
        }

        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                paginationHTML += '<span class="pagination-ellipsis">...</span>';
            }
            paginationHTML += `
                <button class="btn btn-outline btn-sm" onclick="window.documentManager.loadDocuments(${this.totalPages}, window.documentManager.filters)">
                    ${this.totalPages}
                </button>
            `;
        }

        // Next button
        if (this.currentPage < this.totalPages) {
            paginationHTML += `
                <button class="btn btn-outline btn-sm" onclick="window.documentManager.loadDocuments(${this.currentPage + 1}, window.documentManager.filters)">
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            `;
        }

        paginationHTML += '</div>';
        paginationDiv.innerHTML = paginationHTML;
        return paginationDiv;
    }

    async viewDocumentAsPdf(documentId) {
        try {
            this.showLoadingOverlay('Loading PDF viewer...');

            // Open PDF in new tab/window
            const pdfUrl = `${this.apiBaseUrl}/documents/${documentId}/view-as-pdf`;
            window.open(pdfUrl, '_blank');

        } catch (error) {
            console.error('Failed to view document as PDF:', error);
            if (window.showStatus) {
                window.showStatus('Failed to open PDF viewer: ' + error.message, 'error');
            }
        } finally {
            this.hideLoadingOverlay();
        }
    }

    async viewDocumentDetails(documentId) {
        try {
            this.showLoadingOverlay('Loading document details...');

            const response = await fetch(`${this.apiBaseUrl}/documents/${documentId}`);
            if (!response.ok) {
                throw new Error(`Failed to load document details: ${response.statusText}`);
            }

            const document = await response.json();
            this.currentDocument = document;

            // Load document chunks
            const chunksResponse = await fetch(`${this.apiBaseUrl}/documents/${documentId}/chunks?limit=50`);
            let chunks = [];
            if (chunksResponse.ok) {
                const chunksData = await chunksResponse.json();
                chunks = chunksData.chunks || [];
            }

            this.showDocumentViewer(document, chunks);

        } catch (error) {
            console.error('Failed to view document details:', error);
            if (window.showStatus) {
                window.showStatus('Failed to load document details: ' + error.message, 'error');
            }
        } finally {
            this.hideLoadingOverlay();
        }
    }

    showDocumentViewer(document, chunks = []) {
        if (!this.documentViewerModal || !this.documentViewerTitle || !this.documentContent) {
            return;
        }

        // Set title
        this.documentViewerTitle.textContent = document.title || document.filename;

        // Create document details HTML
        const detailsHTML = this.createDocumentDetailsHTML(document, chunks);
        this.documentContent.innerHTML = detailsHTML;

        // Show modal
        this.documentViewerModal.style.display = 'flex';
        this.documentViewerModal.classList.add('show');

        // Focus management
        const closeButton = this.documentViewerModal.querySelector('.modal-close');
        if (closeButton) {
            closeButton.focus();
        }
    }

    createDocumentDetailsHTML(document, chunks) {
        const fileTypeIcon = this.getFileTypeIcon(document.file_type);
        const statusBadge = this.getStatusBadge(document.status);
        const fileSize = this.formatFileSize(document.file_size);
        const uploadDate = this.formatDate(document.upload_date);
        const processedDate = document.processed_date ? this.formatDate(document.processed_date) : 'Not processed';

        let chunksHTML = '';
        if (chunks.length > 0) {
            chunksHTML = `
                <div class="document-chunks">
                    <h4><i class="fas fa-puzzle-piece"></i> Document Chunks (${chunks.length})</h4>
                    <div class="chunks-list">
                        ${chunks.map((chunk, index) => `
                            <div class="chunk-item">
                                <div class="chunk-header">
                                    <span class="chunk-number">Chunk ${index + 1}</span>
                                    ${chunk.page_number ? `<span class="chunk-page">Page ${chunk.page_number}</span>` : ''}
                                </div>
                                <div class="chunk-content">
                                    ${this.escapeHtml(chunk.content || '').substring(0, 300)}${chunk.content && chunk.content.length > 300 ? '...' : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        return `
            <div class="document-details">
                <div class="document-header">
                    <div class="document-icon">
                        <i class="${fileTypeIcon}"></i>
                    </div>
                    <div class="document-info">
                        <h3 class="document-title">${this.escapeHtml(document.title || document.filename)}</h3>
                        <div class="document-filename">${this.escapeHtml(document.original_filename)}</div>
                        <div class="document-status">${statusBadge}</div>
                    </div>
                </div>

                <div class="document-metadata">
                    <div class="metadata-grid">
                        <div class="metadata-item">
                            <label>File Type</label>
                            <span>${document.file_type.toUpperCase()}</span>
                        </div>
                        <div class="metadata-item">
                            <label>File Size</label>
                            <span>${fileSize}</span>
                        </div>
                        <div class="metadata-item">
                            <label>Upload Date</label>
                            <span>${uploadDate}</span>
                        </div>
                        <div class="metadata-item">
                            <label>Processed Date</label>
                            <span>${processedDate}</span>
                        </div>
                        ${document.category ? `
                            <div class="metadata-item">
                                <label>Category</label>
                                <span>${this.escapeHtml(document.category)}</span>
                            </div>
                        ` : ''}
                        <div class="metadata-item">
                            <label>Chunks</label>
                            <span>${document.chunk_count || 0}</span>
                        </div>
                    </div>
                </div>

                ${document.vector_stats ? `
                    <div class="document-stats">
                        <h4><i class="fas fa-chart-bar"></i> Vector Store Statistics</h4>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <label>Embeddings</label>
                                <span>${document.vector_stats.embedding_count || 0}</span>
                            </div>
                            <div class="stat-item">
                                <label>Last Updated</label>
                                <span>${document.vector_stats.last_updated ? this.formatDate(document.vector_stats.last_updated) : 'Unknown'}</span>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <div class="document-actions">
                    <div class="action-buttons">
                        ${document.can_convert_to_pdf || document.file_type.toLowerCase() === 'pdf' ? `
                            <button class="btn btn-primary" onclick="window.documentManager.viewDocumentAsPdf('${document.id}')">
                                <i class="fas fa-eye"></i> View as PDF
                            </button>
                        ` : ''}
                        <button class="btn btn-outline" onclick="window.documentManager.downloadDocument('${document.id}')">
                            <i class="fas fa-download"></i> Download Original
                        </button>
                        <button class="btn btn-outline" onclick="window.documentManager.searchInDocument('${document.id}')">
                            <i class="fas fa-search"></i> Search in Document
                        </button>
                        <button class="btn btn-danger" onclick="window.documentManager.deleteDocument('${document.id}')">
                            <i class="fas fa-trash"></i> Delete Document
                        </button>
                    </div>
                </div>

                ${chunksHTML}
            </div>
        `;
    }

    closeDocumentViewer() {
        if (this.documentViewerModal) {
            this.documentViewerModal.style.display = 'none';
            this.documentViewerModal.classList.remove('show');
            this.currentDocument = null;
        }
    }

    async downloadDocument(documentId) {
        try {
            this.showLoadingOverlay('Preparing download...');

            const downloadUrl = `${this.apiBaseUrl}/documents/${documentId}/download`;

            // Create temporary link and trigger download
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            if (window.showStatus) {
                window.showStatus('Download started', 'success');
            }

        } catch (error) {
            console.error('Failed to download document:', error);
            if (window.showStatus) {
                window.showStatus('Failed to download document: ' + error.message, 'error');
            }
        } finally {
            this.hideLoadingOverlay();
        }
    }

    async deleteDocument(documentId) {
        const document = this.documents.find(doc => doc.id === documentId);
        const documentName = document ? (document.title || document.filename) : 'this document';

        if (!confirm(`Are you sure you want to delete "${documentName}"? This action cannot be undone.`)) {
            return;
        }

        try {
            this.showLoadingOverlay('Deleting document...');

            const response = await fetch(`${this.apiBaseUrl}/documents/${documentId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Delete failed: ${response.statusText}`);
            }

            // Remove from local list
            this.documents = this.documents.filter(doc => doc.id !== documentId);

            // Refresh the document list
            await this.loadDocuments(this.currentPage, this.filters);

            // Close viewer if this document was being viewed
            if (this.currentDocument && this.currentDocument.id === documentId) {
                this.closeDocumentViewer();
            }

            if (window.showStatus) {
                window.showStatus('Document deleted successfully', 'success');
            }

        } catch (error) {
            console.error('Failed to delete document:', error);
            if (window.showStatus) {
                window.showStatus('Failed to delete document: ' + error.message, 'error');
            }
        } finally {
            this.hideLoadingOverlay();
        }
    }

    searchInDocument(documentId) {
        const document = this.documents.find(doc => doc.id === documentId);
        if (!document) return;

        // Close the document viewer
        this.closeDocumentViewer();

        // Set search mode to search
        if (window.searchManager) {
            window.searchManager.setSearchMode('search');
        }

        // Focus on search input and add document filter hint
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.focus();
            messageInput.placeholder = `Search in "${document.title || document.filename}"...`;

            // You could implement document-specific search here
            // For now, we'll just focus the input
        }

        if (window.showStatus) {
            window.showStatus(`Ready to search in "${document.title || document.filename}"`, 'info');
        }
    }

    async updateStats() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/documents/stats`);
            if (response.ok) {
                const stats = await response.json();

                if (this.totalDocsElement) {
                    this.totalDocsElement.textContent = stats.total_documents || 0;
                }

                // Update other stats if elements exist
                const totalSearchesElement = document.getElementById('totalSearches');
                if (totalSearchesElement && window.searchManager) {
                    const searchHistory = window.searchManager.getSearchHistory();
                    totalSearchesElement.textContent = searchHistory.length;
                }
            }
        } catch (error) {
            console.error('Failed to update stats:', error);
        }
    }

    showDocumentListLoading() {
        if (this.documentList) {
            this.documentList.innerHTML = `
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <span>Loading documents...</span>
                </div>
            `;
        }
    }

    showDocumentListError(message) {
        if (this.documentList) {
            this.documentList.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="error-text">Failed to load documents</div>
                    <div class="error-subtext">${this.escapeHtml(message)}</div>
                    <button class="btn btn-primary" onclick="window.documentManager.loadDocuments()">
                        <i class="fas fa-refresh"></i> Try Again
                    </button>
                </div>
            `;
        }
    }

    showLoadingOverlay(message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');

        if (overlay) {
            if (loadingText) {
                loadingText.textContent = message;
            }
            overlay.style.display = 'flex';
        }
    }

    hideLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    // Utility methods
    getFileTypeIcon(fileType) {
        const iconMap = {
            'pdf': 'fas fa-file-pdf file-type-pdf',
            'doc': 'fas fa-file-word file-type-word',
            'docx': 'fas fa-file-word file-type-word',
            'xls': 'fas fa-file-excel file-type-excel',
            'xlsx': 'fas fa-file-excel file-type-excel',
            'ppt': 'fas fa-file-powerpoint file-type-powerpoint',
            'pptx': 'fas fa-file-powerpoint file-type-powerpoint',
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
            'gif': 'fas fa-file-image file-type-image',
            'webp': 'fas fa-file-image file-type-image'
        };

        return iconMap[fileType?.toLowerCase()] || 'fas fa-file file-type-text';
    }

    getStatusBadge(status) {
        const statusMap = {
            'uploaded': { class: 'status-uploaded', icon: 'fas fa-upload', text: 'Uploaded' },
            'processing': { class: 'status-processing', icon: 'fas fa-spinner fa-spin', text: 'Processing' },
            'processed': { class: 'status-processed', icon: 'fas fa-check', text: 'Processed' },
            'completed': { class: 'status-completed', icon: 'fas fa-check-circle', text: 'Completed' },
            'failed': { class: 'status-failed', icon: 'fas fa-exclamation-triangle', text: 'Failed' }
        };

        const statusInfo = statusMap[status?.toLowerCase()] || statusMap['uploaded'];

        return `
            <span class="status-badge ${statusInfo.class}">
                <i class="${statusInfo.icon}"></i>
                ${statusInfo.text}
            </span>
        `;
    }

    formatFileSize(bytes) {
        if (!bytes || isNaN(bytes)) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        if (!dateString) return 'Unknown';

        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Unknown';

            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                return 'Today';
            } else if (diffDays === 1) {
                return 'Yesterday';
            } else if (diffDays < 7) {
                return `${diffDays} days ago`;
            } else {
                return date.toLocaleDateString();
            }
        } catch (error) {
            return 'Unknown';
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    // Public API methods
    refreshDocuments() {
        return this.loadDocuments(this.currentPage, this.filters);
    }

    getDocuments() {
        return [...this.documents];
    }

    getCurrentDocument() {
        return this.currentDocument;
    }

    setFilters(filters) {
        this.filters = { ...filters };
        return this.loadDocuments(1, this.filters);
    }

    clearFilters() {
        this.filters = {};
        return this.loadDocuments(1, {});
    }

    openDocumentViewer(documentId) {
        return this.viewDocumentDetails(documentId);
    }
}

// Global functions for HTML onclick handlers
window.loadDocuments = function() {
    if (window.documentManager) {
        window.documentManager.refreshDocuments();
    }
};

window.closeDocumentViewer = function() {
    if (window.documentManager) {
        window.documentManager.closeDocumentViewer();
    }
};

// Initialize document manager when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (typeof API_BASE_URL !== 'undefined') {
        window.documentManager = new DocumentManager(API_BASE_URL);
        console.log('Document manager created and registered');
    } else {
        console.error('API_BASE_URL not defined, cannot initialize document manager');
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DocumentManager;
}