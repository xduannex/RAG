// RAG Document Management
// Handles document listing, viewing, and management operations

class DocumentManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
        this.documents = [];
        this.currentPage = 1;
        this.documentsPerPage = 20;
        this.totalDocuments = 0;
        this.filters = {
            file_type: null,
            category: null,
            status: null
        };
        this.isLoading = false;
        this.init();
    }

    init() {
        console.log('Initializing Document Manager...');
        this.setupEventListeners();
        window.documentManager = this;
        console.log('Document manager initialized');
    }

    setupEventListeners() {
        // Document list refresh button
        const refreshBtn = document.getElementById('refreshDocsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshDocuments());
        }

        // Filter controls
        const filterControls = document.querySelectorAll('.filter-control');
        filterControls.forEach(control => {
            control.addEventListener('change', () => this.applyFilters());
        });

        // Clear filters button
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => this.clearFilters());
        }
    }

    async loadDocuments(page = 1) {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading();

        try {
            const skip = (page - 1) * this.documentsPerPage;
            const params = new URLSearchParams({
                skip: skip.toString(),
                limit: this.documentsPerPage.toString()
            });

            // Add filters
            Object.entries(this.filters).forEach(([key, value]) => {
                if (value) {
                    params.append(key, value);
                }
            });

            // Use the correct endpoint - check if documents are under /api/documents or /documents
            const response = await fetch(`${this.apiBaseUrl}/api/documents/?${params}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                // Try alternative endpoint if first one fails
                if (response.status === 404) {
                    const altResponse = await fetch(`${this.apiBaseUrl}/documents/?${params}`, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json'
                        }
                    });
                    if (altResponse.ok) {
                        const data = await altResponse.json();
                        this.handleDocumentsResponse(data, page);
                        return;
                    }
                }
                throw new Error(`Failed to load documents: ${response.statusText}`);
            }

            const data = await response.json();
            this.handleDocumentsResponse(data, page);

        } catch (error) {
            console.error('Error loading documents:', error);
            this.showError(`Failed to load documents: ${error.message}`);
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    handleDocumentsResponse(data, page) {
        this.documents = data.documents || [];
        this.totalDocuments = data.total || 0;
        this.currentPage = page;

        this.renderDocuments();
        this.renderPagination();

        console.log(`Loaded ${this.documents.length} documents (page ${page})`);
    }

    renderDocuments() {
        const container = document.getElementById('documentsContainer');
        if (!container) return;

        if (this.documents.length === 0) {
            container.innerHTML = this.renderEmptyState();
            return;
        }

        const documentsHTML = this.documents.map(doc => this.renderDocumentItem(doc)).join('');
        container.innerHTML = `<div class="pdf-list">${documentsHTML}</div>`;
    }

    renderDocumentItem(doc) {
        const fileIcon = this.getFileIcon(doc.file_type);
        const fileSize = this.formatFileSize(doc.file_size);
        const uploadDate = doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Unknown';
        const processedDate = doc.processed_at ? new Date(doc.processed_at).toLocaleDateString() : 'Not processed';

        // Ensure we have a valid document ID
        const documentId = doc.id || doc.document_id;
        if (!documentId) {
            console.warn('Document missing ID:', doc);
            return '';
        }

        return `
            <div class="pdf-item" data-document-id="${documentId}">
                <div class="pdf-icon" data-type="${doc.file_type}">
                    <i class="${fileIcon}"></i>
                </div>
                <div class="pdf-info">
                    <div class="pdf-title" title="${this.escapeHtml(doc.filename || doc.original_filename || 'Unknown')}">
                        ${this.escapeHtml(doc.title || doc.filename || doc.original_filename || 'Untitled')}
                    </div>
                    <div class="pdf-meta">
                        <div class="meta-item">
                            <i class="fas fa-file"></i>
                            ${this.escapeHtml(doc.original_filename || doc.filename || 'Unknown')}
                        </div>
                        <div class="meta-item">
                            <i class="fas fa-hdd"></i>
                            ${fileSize}
                        </div>
                        <div class="meta-item">
                            <i class="fas fa-calendar"></i>
                            Uploaded: ${uploadDate}
                        </div>
                        ${doc.word_count ? `
                        <div class="meta-item">
                            <i class="fas fa-font"></i>
                            ${doc.word_count.toLocaleString()} words
                        </div>
                        ` : ''}
                        ${doc.total_chunks ? `
                        <div class="meta-item">
                            <i class="fas fa-puzzle-piece"></i>
                            ${doc.total_chunks} chunks
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="pdf-status">
                    <span class="status-badge status-${doc.status || 'unknown'}">
                        ${this.getStatusIcon(doc.status)}
                        ${doc.status || 'Unknown'}
                    </span>
                    ${doc.processing_status && doc.processing_status !== doc.status ? `
                    <span class="status-badge status-${doc.processing_status}">
                        ${this.getProcessingStatusIcon(doc.processing_status)}
                        ${doc.processing_status}
                    </span>
                    ` : ''}
                </div>
                <div class="pdf-actions">
                    <button class="btn btn-sm btn-ghost" onclick="window.documentManager.openDocumentViewer('${documentId}')" title="View Document">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${doc.file_type === 'pdf' ? `
                    <button class="btn btn-sm btn-ghost" onclick="window.documentManager.viewPDF('${documentId}')" title="View PDF">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                    ` : ''}
                    <button class="btn btn-sm btn-ghost" onclick="window.documentManager.downloadDocument('${documentId}')" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    ${doc.status !== 'processing' ? `
                    <button class="btn btn-sm btn-ghost" onclick="window.documentManager.reprocessDocument('${documentId}')" title="Reprocess">
                        <i class="fas fa-sync"></i>
                    </button>
                    ` : ''}
                    <button class="btn btn-sm btn-ghost text-danger" onclick="window.documentManager.deleteDocument('${documentId}', '${this.escapeHtml(doc.filename || doc.original_filename || 'this document')}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    async viewDocumentDetails(documentId) {
        if (!documentId || documentId === 'null' || documentId === 'undefined') {
            console.error('Invalid document ID:', documentId);
            this.showError('Invalid document ID');
            return;
        }

        try {
            console.log('Loading document details for ID:', documentId);

            // Try primary endpoint first
            let response = await fetch(`${this.apiBaseUrl}/api/documents/${documentId}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            // If 404, try alternative endpoint
            if (!response.ok && response.status === 404) {
                response = await fetch(`${this.apiBaseUrl}/documents/${documentId}`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
            }

            if (!response.ok) {
                throw new Error(`Failed to load document details: ${response.statusText}`);
            }

            const document = await response.json();
            this.showDocumentModal(document);

        } catch (error) {
            console.error('Failed to view document details:', error);
            this.showError(`Failed to load document: ${error.message}`);
        }
    }

    async openDocumentViewer(documentId) {
        if (!documentId || documentId === 'null' || documentId === 'undefined') {
            console.error('Invalid document ID for viewer:', documentId);
            this.showError('Invalid document ID');
            return;
        }

        try {
            console.log('Opening document viewer for ID:', documentId);

            // Try to get document content
            let response = await fetch(`${this.apiBaseUrl}/api/documents/${documentId}/view`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            // If 404, try alternative endpoints
            if (!response.ok && response.status === 404) {
                // Try without /api prefix
                response = await fetch(`${this.apiBaseUrl}/documents/${documentId}/view`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                // If still 404, try content endpoint
                if (!response.ok && response.status === 404) {
                    response = await fetch(`${this.apiBaseUrl}/documents/${documentId}/content`, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json'
                        }
                    });
                }
            }

            if (!response.ok) {
                // Fallback to document details
                await this.viewDocumentDetails(documentId);
                return;
            }

            const documentData = await response.json();
            this.showDocumentViewer(documentData);

        } catch (error) {
            console.error('Failed to open document viewer:', error);
            // Fallback to showing basic document details
            await this.viewDocumentDetails(documentId);
        }
    }

    showDocumentViewer(documentData) {
        const modal = document.getElementById('documentViewerModal');
        if (!modal) {
            console.error('Document viewer modal not found');
            return;
        }

        // Update modal content
        const title = modal.querySelector('.modal-title');
        const body = modal.querySelector('.modal-body');

        if (title) {
            title.textContent = documentData.title || documentData.filename || 'Document Viewer';
        }

        if (body) {
            body.innerHTML = `
                <div class="document-viewer-content">
                    <div class="document-header">
                        <div class="document-icon">
                            <i class="${this.getFileIcon(documentData.file_type)}"></i>
                        </div>
                        <div class="document-info">
                            <h3>${this.escapeHtml(documentData.title || documentData.filename || 'Untitled')}</h3>
                            <p class="document-filename">${this.escapeHtml(documentData.filename || 'Unknown')}</p>
                            <div class="document-meta">
                                <span><i class="fas fa-file-alt"></i> ${documentData.file_type?.toUpperCase() || 'Unknown'}</span>
                                <span><i class="fas fa-hdd"></i> ${this.formatFileSize(documentData.file_size)}</span>
                                ${documentData.word_count ? `<span><i class="fas fa-font"></i> ${documentData.word_count.toLocaleString()} words</span>` : ''}
                                ${documentData.total_pages ? `<span><i class="fas fa-file"></i> ${documentData.total_pages} pages</span>` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div class="document-actions">
                        <button class="btn btn-primary" onclick="window.documentManager.downloadDocument('${documentData.document_id || documentData.id}')">
                            <i class="fas fa-download"></i> Download
                        </button>
                        ${documentData.file_type === 'pdf' ? `
                        <button class="btn btn-secondary" onclick="window.documentManager.viewPDF('${documentData.document_id || documentData.id}')">
                            <i class="fas fa-file-pdf"></i> View PDF
                        </button>
                        ` : ''}
                    </div>

                    <div class="document-content">
                        <h4><i class="fas fa-file-text"></i> Content</h4>
                        <div class="content-text">
                                                        ${documentData.content ? this.formatDocumentContent(documentData.content) : 
                              '<p class="text-muted">No content available for preview</p>'}
                        </div>
                    </div>

                    ${documentData.chunks && documentData.chunks.length > 0 ? `
                    <div class="document-chunks">
                        <h4><i class="fas fa-puzzle-piece"></i> Content Chunks</h4>
                        <div class="chunks-list">
                            ${documentData.chunks.map((chunk, index) => `
                                <div class="chunk-item">
                                    <div class="chunk-header">
                                        <span class="chunk-number">Chunk ${index + 1}</span>
                                        ${chunk.page_number ? `<span class="chunk-page">Page ${chunk.page_number}</span>` : ''}
                                    </div>
                                    <div class="chunk-content">${this.escapeHtml(chunk.content.substring(0, 200))}${chunk.content.length > 200 ? '...' : ''}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        }

        // Show modal
        modal.style.display = 'flex';
        modal.classList.add('show');

        // Store current document for actions
        this.currentViewDocument = documentData;
    }

    showDocumentModal(document) {
        // Create and show a modal with document details
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.style.display = 'flex';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">Document Details</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="document-details">
                        <div class="document-header">
                            <div class="document-icon">
                                <i class="${this.getFileIcon(document.file_type)}"></i>
                            </div>
                            <div class="document-info">
                                <h3>${this.escapeHtml(document.title || document.filename || 'Untitled')}</h3>
                                <p class="document-filename">${this.escapeHtml(document.original_filename || document.filename || 'Unknown')}</p>
                            </div>
                        </div>
                        
                        <div class="metadata-grid">
                            <div class="metadata-item">
                                <label>File Type:</label>
                                <span>${document.file_type?.toUpperCase() || 'Unknown'}</span>
                            </div>
                            <div class="metadata-item">
                                <label>File Size:</label>
                                <span>${this.formatFileSize(document.file_size)}</span>
                            </div>
                            <div class="metadata-item">
                                <label>Status:</label>
                                <span class="status-badge status-${document.status}">${document.status || 'Unknown'}</span>
                            </div>
                            <div class="metadata-item">
                                <label>Uploaded:</label>
                                <span>${document.created_at ? new Date(document.created_at).toLocaleString() : 'Unknown'}</span>
                            </div>
                            ${document.processed_at ? `
                            <div class="metadata-item">
                                <label>Processed:</label>
                                <span>${new Date(document.processed_at).toLocaleString()}</span>
                            </div>
                            ` : ''}
                            ${document.word_count ? `
                            <div class="metadata-item">
                                <label>Word Count:</label>
                                <span>${document.word_count.toLocaleString()}</span>
                            </div>
                            ` : ''}
                            ${document.total_pages ? `
                            <div class="metadata-item">
                                <label>Pages:</label>
                                <span>${document.total_pages}</span>
                            </div>
                            ` : ''}
                            ${document.total_chunks ? `
                            <div class="metadata-item">
                                <label>Chunks:</label>
                                <span>${document.total_chunks}</span>
                            </div>
                            ` : ''}
                            ${document.category ? `
                            <div class="metadata-item">
                                <label>Category:</label>
                                <span>${this.escapeHtml(document.category)}</span>
                            </div>
                            ` : ''}
                        </div>

                        <div class="action-buttons">
                            <button class="btn btn-primary" onclick="window.documentManager.downloadDocument('${document.id || document.document_id}')">
                                <i class="fas fa-download"></i> Download
                            </button>
                            ${document.file_type === 'pdf' ? `
                            <button class="btn btn-secondary" onclick="window.documentManager.viewPDF('${document.id || document.document_id}')">
                                <i class="fas fa-file-pdf"></i> View PDF
                            </button>
                            ` : ''}
                            <button class="btn btn-outline" onclick="window.documentManager.openDocumentViewer('${document.id || document.document_id}')">
                                <i class="fas fa-eye"></i> View Content
                            </button>
                            <button class="btn btn-warning" onclick="window.documentManager.reprocessDocument('${document.id || document.document_id}')">
                                <i class="fas fa-sync"></i> Reprocess
                            </button>
                            <button class="btn btn-danger" onclick="window.documentManager.deleteDocument('${document.id || document.document_id}', '${this.escapeHtml(document.filename || 'this document')}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Focus management
        const closeButton = modal.querySelector('.modal-close');
        if (closeButton) {
            closeButton.focus();
        }

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    async deleteDocument(documentId, filename) {
        if (!documentId || documentId === 'null') {
            this.showError('Invalid document ID');
            return;
        }

        if (!confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
            return;
        }

        try {
            // Try primary endpoint first
            let response = await fetch(`${this.apiBaseUrl}/api/documents/${documentId}`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json'
                }
            });

            // If 404, try alternative endpoint
            if (!response.ok && response.status === 404) {
                response = await fetch(`${this.apiBaseUrl}/documents/${documentId}`, {
                    method: 'DELETE',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to delete document: ${response.statusText}`);
            }

            // Remove from local list
            this.documents = this.documents.filter(doc =>
                (doc.id || doc.document_id) !== documentId
            );

            // Re-render
            this.renderDocuments();
            this.updateStats();

            // Show success message
            if (window.showStatus) {
                window.showStatus(`Document "${filename}" deleted successfully`, 'success');
            }

            // Dispatch event for other managers
            document.dispatchEvent(new CustomEvent('documentDeleted', {
                detail: { documentId, filename }
            }));

        } catch (error) {
            console.error('Error deleting document:', error);
            this.showError(`Failed to delete document: ${error.message}`);
        }
    }

    async downloadDocument(documentId) {
        if (!documentId || documentId === 'null') {
            this.showError('Invalid document ID');
            return;
        }

        try {
            // Try primary endpoint first
            let response = await fetch(`${this.apiBaseUrl}/api/documents/${documentId}/download`, {
                method: 'GET'
            });

            // If 404, try alternative endpoints
            if (!response.ok && response.status === 404) {
                response = await fetch(`${this.apiBaseUrl}/documents/${documentId}/download`, {
                    method: 'GET'
                });
            }

            if (!response.ok) {
                throw new Error(`Failed to download document: ${response.statusText}`);
            }

            // Get filename from header or use default
            const contentDisposition = response.headers.get('content-disposition');
            let filename = 'document';

            if (contentDisposition) {
                const matches = contentDisposition.match(/filename="(.+)"/);
                if (matches) {
                    filename = matches[1];
                }
            }

            // Download the file
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (window.showStatus) {
                window.showStatus('Document downloaded successfully', 'success');
            }

        } catch (error) {
            console.error('Error downloading document:', error);
            this.showError(`Failed to download document: ${error.message}`);
        }
    }

    async viewPDF(documentId) {
        if (!documentId || documentId === 'null') {
            this.showError('Invalid document ID');
            return;
        }

        try {
            // Try to get PDF content
            let response = await fetch(`${this.apiBaseUrl}/api/documents/${documentId}/pdf`, {
                method: 'GET'
            });

            // If 404, try alternative endpoint
            if (!response.ok && response.status === 404) {
                response = await fetch(`${this.apiBaseUrl}/documents/${documentId}/pdf`, {
                    method: 'GET'
                });
            }

            if (!response.ok) {
                throw new Error(`Failed to load PDF: ${response.statusText}`);
            }

            // Open PDF in new tab
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');

            // Clean up URL after a delay
            setTimeout(() => URL.revokeObjectURL(url), 1000);

        } catch (error) {
            console.error('Error viewing PDF:', error);
            this.showError(`Failed to view PDF: ${error.message}`);
        }
    }

    async reprocessDocument(documentId) {
        if (!documentId || documentId === 'null') {
            this.showError('Invalid document ID');
            return;
        }

        if (!confirm('Are you sure you want to reprocess this document? This will update its content and embeddings.')) {
            return;
        }

        try {
            // Try primary endpoint first
            let response = await fetch(`${this.apiBaseUrl}/api/documents/${documentId}/reprocess`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json'
                }
            });

            // If 404, try alternative endpoint
            if (!response.ok && response.status === 404) {
                response = await fetch(`${this.apiBaseUrl}/documents/${documentId}/reprocess`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to reprocess document: ${response.statusText}`);
            }

            if (window.showStatus) {
                window.showStatus('Document reprocessing started', 'success');
            }

            // Refresh documents list after a delay
            setTimeout(() => {
                this.refreshDocuments();
            }, 2000);

        } catch (error) {
            console.error('Error reprocessing document:', error);
            this.showError(`Failed to reprocess document: ${error.message}`);
        }
    }

    closeDocumentViewer() {
        const modal = document.getElementById('documentViewerModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
        }
        this.currentViewDocument = null;
    }

    formatDocumentContent(content) {
        if (!content) return '<p class="text-muted">No content available</p>';

        // Truncate very long content
        const maxLength = 5000;
        let truncated = content.length > maxLength;
        let displayContent = truncated ? content.substring(0, maxLength) + '...' : content;

        // Basic formatting
        displayContent = this.escapeHtml(displayContent)
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');

        let result = `<p>${displayContent}</p>`;

        if (truncated) {
            result += `<p class="text-muted"><em>Content truncated for display. Download the document to view the full content.</em></p>`;
        }

        return result;
    }

    renderEmptyState() {
        return `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-folder-open"></i>
                </div>
                <h3>No Documents Found</h3>
                <p>Upload your first document to get started with RAG search.</p>
                <button class="btn btn-primary" onclick="document.getElementById('fileInput').click()">
                    <i class="fas fa-upload"></i> Upload Document
                </button>
            </div>
        `;
    }

    renderPagination() {
        const totalPages = Math.ceil(this.totalDocuments / this.documentsPerPage);
        if (totalPages <= 1) return;

        const container = document.getElementById('paginationContainer');
        if (!container) return;

        let paginationHTML = '<div class="pagination">';

        // Previous button
        if (this.currentPage > 1) {
            paginationHTML += `<button class="btn btn-sm btn-outline" onclick="window.documentManager.loadDocuments(${this.currentPage - 1})">
                <i class="fas fa-chevron-left"></i> Previous
            </button>`;
        }

                // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === this.currentPage;
            paginationHTML += `<button class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline'}" 
                onclick="window.documentManager.loadDocuments(${i})" 
                ${isActive ? 'disabled' : ''}>${i}</button>`;
        }

        // Next button
        if (this.currentPage < totalPages) {
            paginationHTML += `<button class="btn btn-sm btn-outline" onclick="window.documentManager.loadDocuments(${this.currentPage + 1})">
                Next <i class="fas fa-chevron-right"></i>
            </button>`;
        }

        paginationHTML += '</div>';

        // Add page info
        paginationHTML += `<div class="pagination-info">
            Showing ${((this.currentPage - 1) * this.documentsPerPage) + 1} to 
            ${Math.min(this.currentPage * this.documentsPerPage, this.totalDocuments)} 
            of ${this.totalDocuments} documents
        </div>`;

        container.innerHTML = paginationHTML;
    }

    applyFilters() {
        // Get filter values
        const fileTypeFilter = document.getElementById('fileTypeFilter');
        const categoryFilter = document.getElementById('categoryFilter');
        const statusFilter = document.getElementById('statusFilter');

        this.filters = {
            file_type: fileTypeFilter?.value || null,
            category: categoryFilter?.value || null,
            status: statusFilter?.value || null
        };

        // Reset to first page and reload
        this.currentPage = 1;
        this.loadDocuments(1);
    }

    clearFilters() {
        // Reset filter values
        const fileTypeFilter = document.getElementById('fileTypeFilter');
        const categoryFilter = document.getElementById('categoryFilter');
        const statusFilter = document.getElementById('statusFilter');

        if (fileTypeFilter) fileTypeFilter.value = '';
        if (categoryFilter) categoryFilter.value = '';
        if (statusFilter) statusFilter.value = '';

        this.filters = {
            file_type: null,
            category: null,
            status: null
        };

        // Reset to first page and reload
        this.currentPage = 1;
        this.loadDocuments(1);

        if (window.showStatus) {
            window.showStatus('Filters cleared', 'success');
        }
    }

    async refreshDocuments() {
        console.log('Refreshing documents...');
        await this.loadDocuments(this.currentPage);

        if (window.showStatus) {
            window.showStatus('Documents refreshed', 'success');
        }
    }

    updateStats() {
        // Update document count in stats
        const totalDocsElement = document.getElementById('totalDocs');
        if (totalDocsElement) {
            totalDocsElement.textContent = this.totalDocuments.toString();
        }
    }

    showLoading() {
        const container = document.getElementById('documentsContainer');
        if (container) {
            container.innerHTML = `
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <span>Loading documents...</span>
                </div>
            `;
        }
    }

    hideLoading() {
        // Loading will be hidden when documents are rendered
    }

    showError(message) {
        const container = document.getElementById('documentsContainer');
        if (container) {
            container.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>Error Loading Documents</h3>
                    <p>${this.escapeHtml(message)}</p>
                    <button class="btn btn-primary" onclick="window.documentManager.refreshDocuments()">
                        <i class="fas fa-sync"></i> Try Again
                    </button>
                </div>
            `;
        }

        if (window.showStatus) {
            window.showStatus(message, 'error');
        }
    }

    getFileIcon(fileType) {
        if (!fileType) return 'fas fa-file';

        const iconMap = {
            'pdf': 'fas fa-file-pdf',
            'doc': 'fas fa-file-word',
            'docx': 'fas fa-file-word',
            'xlsx': 'fas fa-file-excel',
            'xls': 'fas fa-file-excel',
            'pptx': 'fas fa-file-powerpoint',
            'ppt': 'fas fa-file-powerpoint',
            'txt': 'fas fa-file-alt',
            'md': 'fas fa-file-alt',
            'rtf': 'fas fa-file-alt',
            'csv': 'fas fa-file-csv',
            'json': 'fas fa-file-code',
            'xml': 'fas fa-file-code',
            'html': 'fas fa-file-code',
            'htm': 'fas fa-file-code',
            'jpg': 'fas fa-file-image',
            'jpeg': 'fas fa-file-image',
            'png': 'fas fa-file-image',
            'bmp': 'fas fa-file-image',
            'tiff': 'fas fa-file-image',
            'tif': 'fas fa-file-image',
            'gif': 'fas fa-file-image',
            'webp': 'fas fa-file-image'
        };

        return iconMap[fileType.toLowerCase()] || 'fas fa-file';
    }

    getStatusIcon(status) {
        const iconMap = {
            'uploaded': 'fas fa-upload',
            'processing': 'fas fa-spinner fa-spin',
            'processed': 'fas fa-check',
            'completed': 'fas fa-check-circle',
            'failed': 'fas fa-exclamation-triangle',
            'error': 'fas fa-times-circle'
        };

        return iconMap[status] || 'fas fa-question-circle';
    }

    getProcessingStatusIcon(status) {
        const iconMap = {
            'extracting': 'fas fa-file-export',
            'chunking': 'fas fa-puzzle-piece',
            'embedding': 'fas fa-brain',
            'indexing': 'fas fa-database',
            'completed': 'fas fa-check-circle'
        };

        return iconMap[status] || 'fas fa-cog';
    }

    formatFileSize(bytes) {
        if (!bytes || isNaN(bytes)) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    // Search and filter functionality
    searchDocuments(query) {
        if (!query) {
            this.renderDocuments();
            return;
        }

        const filteredDocs = this.documents.filter(doc => {
            const searchFields = [
                doc.title,
                doc.filename,
                doc.original_filename,
                doc.category,
                doc.file_type
            ].filter(Boolean).join(' ').toLowerCase();

            return searchFields.includes(query.toLowerCase());
        });

        // Temporarily replace documents for rendering
        const originalDocs = this.documents;
        this.documents = filteredDocs;
        this.renderDocuments();
        this.documents = originalDocs;
    }

    // Bulk operations
    async bulkDeleteDocuments(documentIds) {
        if (!documentIds || documentIds.length === 0) return;

        const confirmed = confirm(`Are you sure you want to delete ${documentIds.length} documents? This action cannot be undone.`);
        if (!confirmed) return;

        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        // Show progress
        if (window.showStatus) {
            window.showStatus(`Deleting ${documentIds.length} documents...`, 'info');
        }

        for (const documentId of documentIds) {
            try {
                let response = await fetch(`${this.apiBaseUrl}/api/documents/${documentId}`, {
                    method: 'DELETE',
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok && response.status === 404) {
                    response = await fetch(`${this.apiBaseUrl}/documents/${documentId}`, {
                        method: 'DELETE',
                        headers: { 'Accept': 'application/json' }
                    });
                }

                if (response.ok) {
                    results.success++;
                } else {
                    results.failed++;
                    const errorData = await response.json().catch(() => ({}));
                    results.errors.push(`Document ${documentId}: ${errorData.detail || response.statusText}`);
                }
            } catch (error) {
                results.failed++;
                results.errors.push(`Document ${documentId}: ${error.message}`);
            }
        }

        // Show results
        if (results.success > 0) {
            window.showStatus(`Successfully deleted ${results.success} documents`, 'success');
        }

        if (results.failed > 0) {
            window.showStatus(`Failed to delete ${results.failed} documents`, 'error');
            console.error('Bulk delete errors:', results.errors);
        }

        // Refresh list
        await this.refreshDocuments();
    }

    async bulkReprocessDocuments(documentIds) {
        if (!documentIds || documentIds.length === 0) return;

        const confirmed = confirm(`Are you sure you want to reprocess ${documentIds.length} documents?`);
        if (!confirmed) return;

        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        // Show progress
        if (window.showStatus) {
            window.showStatus(`Reprocessing ${documentIds.length} documents...`, 'info');
        }

        for (const documentId of documentIds) {
            try {
                let response = await fetch(`${this.apiBaseUrl}/api/documents/${documentId}/reprocess`, {
                    method: 'POST',
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok && response.status === 404) {
                    response = await fetch(`${this.apiBaseUrl}/documents/${documentId}/reprocess`, {
                        method: 'POST',
                        headers: { 'Accept': 'application/json' }
                    });
                }

                if (response.ok) {
                    results.success++;
                } else {
                    results.failed++;
                    const errorData = await response.json().catch(() => ({}));
                    results.errors.push(`Document ${documentId}: ${errorData.detail || response.statusText}`);
                }
            } catch (error) {
                results.failed++;
                results.errors.push(`Document ${documentId}: ${error.message}`);
            }
        }

        // Show results
        if (results.success > 0) {
            window.showStatus(`Successfully started reprocessing ${results.success} documents`, 'success');
        }

        if (results.failed > 0) {
            window.showStatus(`Failed to reprocess ${results.failed} documents`, 'error');
            console.error('Bulk reprocess errors:', results.errors);
        }

        // Refresh list after delay
        setTimeout(() => {
            this.refreshDocuments();
        }, 2000);
    }

    // Export functionality
    exportDocumentsList() {
        const data = this.documents.map(doc => ({
            id: doc.id || doc.document_id,
            title: doc.title,
            filename: doc.filename || doc.original_filename,
            file_type: doc.file_type,
            file_size: doc.file_size,
            status: doc.status,
            category: doc.category,
            word_count: doc.word_count,
            total_pages: doc.total_pages,
            total_chunks: doc.total_chunks,
            created_at: doc.created_at,
            processed_at: doc.processed_at
        }));

        const csv = this.convertToCSV(data);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `documents_list_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (window.showStatus) {
            window.showStatus('Documents list exported', 'success');
        }
    }

    convertToCSV(data) {
        if (!data || data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];

        for (const row of data) {
            const values = headers.map(header => {
                const value = row[header];
                if (value === null || value === undefined) return '';
                const stringValue = String(value);
                // Escape quotes and wrap in quotes if contains comma
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            });
            csvRows.push(values.join(','));
        }

        return csvRows.join('\n');
    }

    // Public API methods
    getDocuments() {
        return [...this.documents];
    }

    getDocumentById(documentId) {
        return this.documents.find(doc => (doc.id || doc.document_id) === documentId);
    }

    getTotalDocuments() {
        return this.totalDocuments;
    }

    getCurrentPage() {
        return this.currentPage;
    }

    getFilters() {
        return { ...this.filters };
    }

    // Cleanup
    cleanup() {
        console.log('Cleaning up document manager...');
        this.documents = [];
        this.currentViewDocument = null;
    }
}

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

// Add event listeners for document list container
document.addEventListener('DOMContentLoaded', function() {
    const documentList = document.getElementById('documentList');
    if (documentList) {
        // Load documents initially
        if (window.documentManager) {
            window.documentManager.loadDocuments();
        }
    }
});

// Global helper functions for HTML onclick handlers
window.loadDocuments = function() {
    if (window.documentManager) {
        window.documentManager.refreshDocuments();
    }
};

window.clearDocumentFilters = function() {
    if (window.documentManager) {
        window.documentManager.clearFilters();
    }
};

window.exportDocumentsList = function() {
    if (window.documentManager) {
        window.documentManager.exportDocumentsList();
    }
};

window.closeDocumentViewer = function() {
    if (window.documentManager) {
        window.documentManager.closeDocumentViewer();
    }
};

// Add CSS for document-specific styling
const documentStyles = `
<style>
.document-details {
    max-width: 800px;
    margin: 0 auto;
}

.document-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border-color);
}

.document-icon {
    width: 60px;
    height: 60px;
    background: var(--primary-color);
    color: white;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    flex-shrink: 0;
}

.document-info h3 {
    margin: 0 0 0.5rem 0;
    color: var(--text-primary);
}

.document-filename {
    color: var(--text-secondary);
    font-size: 0.9rem;
    margin: 0;
}

.document-meta {
    display: flex;
    gap: 1rem;
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-muted);
}

.document-meta span {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.metadata-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
}

.metadata-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: var(--border-radius);
    border: 1px solid var(--border-color);
}

.metadata-item label {
    font-weight: 500;
    color: var(--text-secondary);
    margin: 0;
}

.metadata-item span {
    font-weight: 600;
    color: var(--text-primary);
}

.action-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 2rem;
}

.document-viewer-content {
    max-width: 1000px;
    margin: 0 auto;
}

.document-actions {
    display: flex;
    gap: 0.5rem;
    margin: 1rem 0;
    justify-content: center;
    flex-wrap: wrap;
}

.document-content {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    padding: 1.5rem;
    margin: 1rem 0;
}

.document-content h4 {
    margin: 0 0 1rem 0;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.content-text {
    max-height: 400px;
    overflow-y: auto;
    line-height: 1.6;
    font-family: Georgia, serif;
}

.document-chunks {
    margin-top: 2rem;
}

.document-chunks h4 {
    margin: 0 0 1rem 0;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.chunks-list {
    max-height: 300px;
    overflow-y: auto;
}

.chunk-item {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    padding: 1rem;
    margin-bottom: 0.5rem;
}

.chunk-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
}

.chunk-number {
    font-weight: 600;
    color: var(--primary-color);
}

.chunk-page {
    color: var(--text-secondary);
}

.chunk-content {
    color: var(--text-primary);
    line-height: 1.5;
    font-size: 0.9rem;
}

.empty-state,
.error-state {
    text-align: center;
    padding: 3rem 2rem;
    color: var(--text-secondary);
}

.empty-icon,
.error-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
    opacity: 0.5;
}

.error-icon {
    color: var(--danger-color);
}

.empty-state h3,
.error-state h3 {
    margin: 0 0 1rem 0;
    color: var(--text-primary);
}

.pagination {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    align-items: center;
    margin: 1rem 0;
}

.pagination-info {
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-top: 0.5rem;
}

@media (max-width: 768px) {
    .document-header {
        flex-direction: column;
        text-align: center;
    }
    
    .metadata-grid {
        grid-template-columns: 1fr;
    }
    
    .action-buttons,
    .document-actions {
        flex-direction: column;
    }
    
    .document-meta {
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .pagination {
        flex-wrap: wrap;
    }
}
</style>
`;

// Inject document styles
document.head.insertAdjacentHTML('beforeend', documentStyles);

