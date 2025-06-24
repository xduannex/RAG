// RAG Chat Application - Document Manager
// Handles document operations and viewer functionality

class DocumentManager {
    constructor(apiBaseUrl) {
        // Fix apiBaseUrl handling to ensure it's always a string
        if (typeof apiBaseUrl === 'string') {
            this.apiBaseUrl = apiBaseUrl;
        } else if (apiBaseUrl && typeof apiBaseUrl === 'object' && apiBaseUrl.baseURL) {
            // If passed a RAGClient object, extract the baseURL
            this.apiBaseUrl = String(apiBaseUrl.baseURL);
        } else if (apiBaseUrl && typeof apiBaseUrl === 'object' && apiBaseUrl.apiBaseUrl) {
            // If passed another manager object, extract apiBaseUrl
            this.apiBaseUrl = String(apiBaseUrl.apiBaseUrl);
        } else {
            // Fallback to global or default
            this.apiBaseUrl = window.API_BASE_URL || 'http://localhost:8000';
        }

        // Ensure it's definitely a string and clean - FIX THE DOUBLE PORT ISSUE
        this.apiBaseUrl = String(this.apiBaseUrl)
            .replace(/\/+$/, '') // Remove trailing slashes
            .replace(/:8000:8000/, ':8000') // Fix double port issue
            .replace(/(:8000)+/, ':8000'); // Remove multiple :8000 occurrences

        console.log('DocumentManager created with API base URL:', this.apiBaseUrl);
        console.log('API base URL type:', typeof this.apiBaseUrl);
        this.documents = []
        this.currentDocument = null
        this.isLoading = false
        this.sortBy = 'created_at'
        this.sortOrder = 'desc'
        this.filters = {}
        this.currentPdfBlobUrl = null

        this.init()
    }

    init() {
        this.setupElements()
        this.setupEventListeners()
        this.loadDocuments()
    }

    setupElements() {
        // Document list elements
        this.documentsList = window.document.getElementById('documentsList')
        this.documentsCount = window.document.getElementById('documentsCount')
        this.loadingIndicator = window.document.getElementById('documentsLoading')

        // Document viewer modal elements
        this.documentViewerModal = window.document.getElementById('documentViewerModal')
        this.documentViewerTitle = window.document.getElementById('documentViewerTitle')
        this.documentViewerContent = window.document.getElementById('documentViewerContent')
        this.closeDocumentViewer = window.document.getElementById('closeDocumentViewer')
        this.modalDownloadBtn = window.document.getElementById('modalDownloadBtn')

        // Create document viewer modal if it doesn't exist
        if (!this.documentViewerModal) {
            this.createDocumentViewerModal()
        }
    }

    createDocumentViewerModal() {
        const modalHTML = `
            <div id="documentViewerModal" class="modal">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3 id="documentViewerTitle">Document Viewer</h3>
                        <div class="modal-actions">
                            <button class="btn btn-sm btn-outline" id="modalDownloadBtn" title="Download Original">
                                <i class="fas fa-download"></i> Download
                            </button>
                            <button class="btn btn-sm btn-outline" id="viewChunksBtn" title="View Chunks">
                                <i class="fas fa-list"></i> Chunks
                            </button>
                            <button class="btn btn-sm btn-outline" id="searchInDocBtn" title="Search in Document">
                                <i class="fas fa-search"></i> Search
                            </button>
                            <span class="close" id="closeDocumentViewer">&times;</span>
                        </div>
                    </div>
                    <div class="modal-body">
                        <div id="documentViewerContent">
                            <div id="documentLoadingContainer" class="loading-container">
                                <div class="loading-spinner"></div>
                                <div class="loading-text">Loading document...</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `

        window.document.body.insertAdjacentHTML('beforeend', modalHTML)

        // Re-setup elements
        this.documentViewerModal = window.document.getElementById('documentViewerModal')
        this.documentViewerTitle = window.document.getElementById('documentViewerTitle')
        this.documentViewerContent = window.document.getElementById('documentViewerContent')
        this.closeDocumentViewer = window.document.getElementById('closeDocumentViewer')
        this.modalDownloadBtn = window.document.getElementById('modalDownloadBtn')
        this.viewChunksBtn = window.document.getElementById('viewChunksBtn')
        this.searchInDocBtn = window.document.getElementById('searchInDocBtn')
    }

    setupEventListeners() {
        // Modal close events
        if (this.closeDocumentViewer) {
            this.closeDocumentViewer.addEventListener('click', () => {
                this.closeDocumentViewerModal()
            })
        }

        // Modal action buttons
        if (this.modalDownloadBtn) {
            this.modalDownloadBtn.addEventListener('click', () => {
                const documentId = this.documentViewerModal.getAttribute('data-current-document-id')
                if (documentId) {
                    this.downloadDocument(documentId)
                }
            })
        }

        if (this.viewChunksBtn) {
            this.viewChunksBtn.addEventListener('click', () => {
                const documentId = this.documentViewerModal.getAttribute('data-current-document-id')
                if (documentId) {
                    this.viewDocumentChunks(documentId)
                }
            })
        }

        if (this.searchInDocBtn) {
            this.searchInDocBtn.addEventListener('click', () => {
                const documentId = this.documentViewerModal.getAttribute('data-current-document-id')
                if (documentId) {
                    this.searchInDocument(documentId)
                }
            })
        }

        // Close on outside click
        if (this.documentViewerModal) {
            this.documentViewerModal.addEventListener('click', (e) => {
                if (e.target === this.documentViewerModal) {
                    this.closeDocumentViewerModal()
                }
            })
        }

        // Close on Escape key
        window.document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.documentViewerModal && this.documentViewerModal.style.display === 'block') {
                this.closeDocumentViewerModal()
            }
        })

        // Refresh button
        const refreshButton = window.document.getElementById('refreshDocuments')
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                this.refreshDocuments()
            })
        }

        // Setup sort and filter controls
        this.setupSortAndFilterControls()
    }

    setupSortAndFilterControls() {
        const sortSelect = window.document.getElementById('documentSort')
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                const [sortBy, sortOrder] = e.target.value.split(':')
                this.setSorting(sortBy, sortOrder)
            })
        }

        const filterInput = window.document.getElementById('documentFilter')
        if (filterInput) {
            filterInput.addEventListener('input', this.debounce((e) => {
                this.setFilter('search', e.target.value)
            }, 300))
        }
    }

    async loadDocuments() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoadingIndicator();

        try {
            // Use the correct list endpoint - match your backend
            const response = await fetch(`${this.apiBaseUrl}/pdf/`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            this.documents = await response.json();
            this.renderDocuments();
            this.updateDocumentsCount();
            console.log(`Loaded ${this.documents.length} documents`);

        } catch (error) {
            console.error('Error loading documents:', error);
            this.showError('Failed to load documents: ' + error.message);
        } finally {
            this.isLoading = false;
            this.hideLoadingIndicator();
        }
    }

    renderDocuments() {
        if (!this.documentsList) return

        if (this.documents.length === 0) {
            this.documentsList.innerHTML = `
                <div class="no-documents">
                    <div class="no-documents-icon">
                        <i class="fas fa-file-alt"></i>
                    </div>
                    <h3>No documents uploaded yet</h3>
                    <p>Use the upload form to add your first document.</p>
                    <button class="btn btn-primary" onclick="window.document.getElementById('fileInput').click()">
                        <i class="fas fa-upload"></i> Upload Document
                    </button>
                </div>
            `
            return
        }

        // Apply filters and sorting
        const filteredDocs = this.applyFiltersAndSorting(this.documents)

        const documentsHTML = filteredDocs.map(doc => this.renderDocumentItem(doc)).join('')
        this.documentsList.innerHTML = documentsHTML
    }

    applyFiltersAndSorting(documents) {
        let filtered = [...documents]

        // Apply search filter
        if (this.filters.search) {
            const searchTerm = this.filters.search.toLowerCase()
            filtered = filtered.filter(doc =>
                (doc.title || doc.original_filename || '').toLowerCase().includes(searchTerm) ||
                (doc.description || '').toLowerCase().includes(searchTerm) ||
                (doc.category || '').toLowerCase().includes(searchTerm)
            )
        }

        // Apply status filter
        if (this.filters.status) {
            filtered = filtered.filter(doc => doc.processing_status === this.filters.status)
        }

        // Apply type filter
        if (this.filters.type) {
            filtered = filtered.filter(doc => doc.file_type === this.filters.type)
        }

        // Apply sorting
        filtered.sort((a, b) => {
            let aValue = a[this.sortBy]
            let bValue = b[this.sortBy]

            // Handle different data types
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase()
                bValue = bValue.toLowerCase()
            }

            if (this.sortOrder === 'asc') {
                return aValue > bValue ? 1 : -1
            } else {
                return aValue < bValue ? 1 : -1
            }
        })

        return filtered
    }

    renderDocumentItem(doc) {
        const statusClass = this.getStatusClass(doc.processing_status)
        const fileSize = this.formatFileSize(doc.file_size)
        const uploadDate = this.formatTimestamp(doc.created_at)
        const fileTypeIcon = this.getFileTypeIcon(doc.original_filename)

        return `
            <div class="document-item" data-id="${doc.id}">
                <div class="document-icon">
                    <i class="${fileTypeIcon}"></i>
                </div>
                <div class="document-info">
                    <div class="document-header">
                        <h4 class="document-title" title="${this.escapeHtml(doc.original_filename)}">
                            ${this.escapeHtml(doc.title || doc.original_filename)}
                        </h4>
                        <span class="document-status ${statusClass}">
                            ${doc.processing_status}
                        </span>
                    </div>
                    <div class="document-meta">
                        <span class="document-type">${doc.file_type.toUpperCase()}</span>
                        <span class="document-size">${fileSize}</span>
                        ${doc.total_pages ? `<span class="document-pages">${doc.total_pages} pages</span>` : ''}
                        <span class="document-date">${uploadDate}</span>
                    </div>
                    ${doc.description ? `<p class="document-description">${this.escapeHtml(doc.description)}</p>` : ''}
                    ${doc.category ? `<span class="document-category"><i class="fas fa-tag"></i> ${this.escapeHtml(doc.category)}</span>` : ''}
                </div>
                <div class="document-actions">
                    <button class="btn btn-sm btn-primary" onclick="window.documentManager.openDocumentViewer(${doc.id})" title="View Document">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="window.documentManager.downloadDocument(${doc.id})" title="Download Document">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-sm btn-info" onclick="window.documentManager.searchInDocument(${doc.id})" title="Search in Document">
                        <i class="fas fa-search"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="window.documentManager.deleteDocument(${doc.id})" title="Delete Document">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `
    }

    getStatusClass(status) {
        const statusClasses = {
            'completed': 'status-success',
            'processing': 'status-warning',
            'pending': 'status-info',
            'failed': 'status-error',
            'error': 'status-error'
        }
        return statusClasses[status] || 'status-info'
    }

    getFileTypeIcon(filename) {
        if (!filename) return 'fas fa-file'
        const extension = filename.toLowerCase().split('.').pop()
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
        }
        return iconMap[extension] || 'fas fa-file'
    }

    updateDocumentsCount() {
        if (this.documentsCount) {
            const completedCount = this.documents.filter(doc => doc.processing_status === 'completed').length
            this.documentsCount.textContent = `${completedCount} of ${this.documents.length} documents ready`
        }
    }

    showLoadingIndicator() {
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = 'block'
        }
    }

    hideLoadingIndicator() {
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = 'none'
        }
    }

    showError(message) {
        if (this.documentsList) {
            this.documentsList.innerHTML = `
                <div class="error-message">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="error-content">
                        <h3>Error Loading Documents</h3>
                        <p>${message}</p>
                        <button class="btn btn-primary" onclick="window.documentManager.refreshDocuments()">
                            <i class="fas fa-refresh"></i> Retry
                        </button>
                    </div>
                </div>
            `;
        }
    }

    async refreshDocuments() {
        console.log('Refreshing documents...');
        await this.loadDocuments();

        if (window.showStatus) {
            window.showStatus('Documents refreshed', 'success');
        }
    }

    // Document Viewer Methods
    async openDocumentViewer(documentId) {
        console.log('Opening document viewer for ID:', documentId);

        if (!this.documentViewerModal) {
            this.createDocumentViewerModal();
        }

        // Show modal immediately with loading state
        this.documentViewerModal.style.display = 'flex';
        this.documentViewerModal.classList.add('show');
        window.document.body.classList.add('modal-open');

        // Set document ID
        this.documentViewerModal.setAttribute('data-current-document-id', documentId);

        // Show loading state
        this.showDocumentViewerLoading();

        // Load document
        await this.loadDocumentById(documentId);
    }

     async loadDocumentById(documentId) {
        try {
            console.log('Loading document with API URL:', this.apiBaseUrl);

            // Use the correct PDF info endpoint
            const response = await fetch(`${this.apiBaseUrl}/pdf/${documentId}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const document = await response.json();
            this.currentDocument = document;

            // Update modal title
            if (this.documentViewerTitle) {
                this.documentViewerTitle.textContent = document.title || document.original_filename;
            }

            // Load document content
            await this.loadDocumentContent(document);

        } catch (error) {
            console.error('Error loading document:', error);
            this.showDocumentViewerError(error.message);
        }
    }

    async loadDocumentContent(document) {
        if (!document || !this.documentViewerContent) return;

        const fileType = document.file_type.toLowerCase();
        const baseUrl = this.apiBaseUrl;

        try {
            if (fileType === 'pdf') {
                await this.loadPDFViewer(document, baseUrl);
            } else if (['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'tif', 'gif', 'webp'].includes(fileType)) {
                await this.loadImageViewer(document, baseUrl);
            } else {
                // Try to convert to PDF for viewing
                await this.loadConvertedPDFViewer(document, baseUrl);
            }
        } catch (error) {
            console.error('Error loading document content:', error);
            this.showPreviewError('Failed to load document preview: ' + error.message);
        }
    }

    async loadPDFViewer(document, baseUrl) {
    try {
        console.log('Loading PDF using PDF endpoint...');

        // Use the PDF viewing endpoint that serves with inline headers
        const pdfUrl = `${baseUrl}/documents/${document.id}/pdf`;

        this.documentViewerContent.innerHTML = `
            <div class="pdf-viewer-container">
                <div class="pdf-viewer-toolbar">
                    <div class="pdf-controls">
                        <button class="btn btn-sm" onclick="window.documentManager.downloadDocument(${document.id})" title="Download PDF">
                            <i class="fas fa-download"></i>
                            <span>Download</span>
                        </button>
                        <button class="btn btn-sm" onclick="window.documentManager.toggleFullscreen()" title="Toggle Fullscreen">
                            <i class="fas fa-expand"></i>
                            <span>Fullscreen</span>
                        </button>
                    </div>
                    <div class="pdf-info">
                        <span class="document-name">${this.escapeHtml(document.original_filename)}</span>
                        <span class="document-size">${this.formatFileSize(document.file_size)}</span>
                        ${document.total_pages ? `<span class="document-pages">${document.total_pages} pages</span>` : ''}
                    </div>
                </div>
                <div class="pdf-viewer-frame">
                    <iframe src="${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1&page=1&view=FitH" 
                            width="100%" 
                            height="100%" 
                            frameborder="0"
                            title="PDF Document Viewer"
                            id="pdfViewerFrame"
                            onload="window.documentManager.onPDFLoaded()"
                            onerror="window.documentManager.onPDFError()">
                    </iframe>
                </div>
            </div>
        `;

        // Set modal to show state
        if (this.documentViewerModal) {
            this.documentViewerModal.classList.add('show');
        }

    } catch (error) {
        console.error('Error loading PDF viewer:', error);
        this.showPreviewError('Failed to load PDF: ' + error.message);
    }
}

    async loadConvertedPDFViewer(document, baseUrl) {
        // Show conversion loading with better UI
        this.documentViewerContent.innerHTML = `
            <div class="conversion-container">
                <div class="conversion-status">
                    <div class="conversion-spinner"></div>
                    <h3>Converting Document</h3>
                    <p>Converting ${document.file_type.toUpperCase()} to PDF for viewing...</p>
                    <div class="conversion-progress">
                        <div class="progress-bar">
                            <div class="progress-fill"></div>
                        </div>
                        <small>This may take a few moments</small>
                    </div>
                </div>
            </div>
        `;

        try {
            const convertUrl = `${baseUrl}/documents/${document.id}/view-as-pdf`;

            const response = await fetch(convertUrl);

            if (response.ok && response.headers.get('content-type')?.includes('application/pdf')) {
                const blob = await response.blob();
                const pdfUrl = URL.createObjectURL(blob);

                this.documentViewerContent.innerHTML = `
                    <div class="pdf-viewer-container">
                        <div class="pdf-viewer-toolbar">
                            <div class="pdf-controls">
                                <button class="btn btn-sm" onclick="window.documentManager.printDocument()" title="Print Converted PDF">
                                    <i class="fas fa-print"></i>
                                    <span>Print</span>
                                </button>
                                <button class="btn btn-sm" onclick="window.documentManager.downloadDocument(${document.id})" title="Download Original File">
                                    <i class="fas fa-download"></i>
                                    <span>Download Original</span>
                                </button>
                                <button class="btn btn-sm" onclick="window.documentManager.downloadConvertedPDF()" title="Download PDF Version">
                                    <i class="fas fa-file-pdf"></i>
                                    <span>Download PDF</span>
                                </button>
                                <button class="btn btn-sm" onclick="window.documentManager.searchInPDF()" title="Search in PDF">
                                    <i class="fas fa-search"></i>
                                    <span>Search</span>
                                </button>
                            </div>
                            <div class="pdf-info">
                                <div class="conversion-notice">
                                    <i class="fas fa-info-circle"></i>
                                    <span>Converted from ${document.file_type.toUpperCase()} for viewing</span>
                                </div>
                                <span class="document-name">${this.escapeHtml(document.original_filename)}</span>
                            </div>
                        </div>
                        <div class="pdf-viewer-frame">
                            <iframe src="${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1&page=1&view=FitH" 
                                    width="100%" 
                                    height="100%" 
                                    frameborder="0"
                                    title="Converted PDF Viewer"
                                    id="pdfViewerFrame"
                                    onload="window.documentManager.onPDFLoaded()"
                                    onerror="window.documentManager.onPDFError()">
                                <div class="pdf-fallback">
                                    <div class="fallback-content">
                                        <i class="fas fa-exclamation-triangle fa-3x"></i>
                                        <h3>PDF Conversion Failed</h3>
                                        <p>Unable to convert document to PDF for viewing.</p>
                                        <button class="btn btn-primary" onclick="window.documentManager.downloadDocument(${document.id})">
                                            <i class="fas fa-download"></i> Download Original
                                        </button>
                                    </div>
                                </div>
                            </iframe>
                        </div>
                    </div>
                `;

                // Store blob URL for cleanup and download
                this.currentPdfBlobUrl = pdfUrl;
                this.currentDocument = document;

                // Set modal to show state
                if (this.documentViewerModal) {
                    this.documentViewerModal.classList.add('show');
                }

            } else {
                throw new Error('Conversion to PDF failed');
            }

        } catch (error) {
            console.error('Error converting document:', error);
            this.showUnsupportedPreview(document);
        }
    }

     async loadImageViewer(document, baseUrl) {
        // Use the download endpoint for images too
        const imageUrl = `${baseUrl}/pdf/${document.id}/download`;

        this.documentViewerContent.innerHTML = `
            <div class="image-viewer-container">
                <div class="image-viewer-toolbar">
                    <div class="image-controls">
                        <button class="btn btn-sm" onclick="window.documentManager.downloadDocument(${document.id})" title="Download Image">
                            <i class="fas fa-download"></i>
                            <span>Download</span>
                        </button>
                        <button class="btn btn-sm" onclick="window.documentManager.printDocument()" title="Print Image">
                            <i class="fas fa-print"></i>
                            <span>Print</span>
                        </button>
                        <button class="btn btn-sm" onclick="window.documentManager.toggleImageZoom()" title="Toggle Zoom">
                            <i class="fas fa-search-plus"></i>
                            <span>Zoom</span>
                        </button>
                    </div>
                    <div class="pdf-info">
                        <span class="document-name">${this.escapeHtml(document.original_filename)}</span>
                        <span class="document-size">${this.formatFileSize(document.file_size)}</span>
                    </div>
                </div>
                <div class="image-viewer-frame">
                    <div class="image-zoom-controls">
                        <button class="btn btn-sm" onclick="window.documentManager.zoomIn()" title="Zoom In">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn btn-sm" onclick="window.documentManager.zoomOut()" title="Zoom Out">
                            <i class="fas fa-minus"></i>
                        </button>
                        <button class="btn btn-sm" onclick="window.documentManager.resetZoom()" title="Reset Zoom">
                            <i class="fas fa-expand-arrows-alt"></i>
                        </button>
                    </div>
                    <img src="${imageUrl}" alt="${this.escapeHtml(document.original_filename)}" 
                         id="documentImage" 
                         onload="window.documentManager.onImageLoaded()"
                         onerror="window.documentManager.onImageError()">
                </div>
            </div>
        `;
    }

    showUnsupportedPreview(document) {
        this.documentViewerContent.innerHTML = `
            <div class="unsupported-preview">
                <div class="unsupported-icon">
                    <i class="fas fa-file-alt fa-4x"></i>
                </div>
                <h3>Preview Not Available</h3>
                <p>This file type (${document.file_type.toUpperCase()}) cannot be previewed in the browser.</p>
                <p><strong>${this.escapeHtml(document.original_filename)}</strong></p>
                <p class="file-info">
                    Size: ${this.formatFileSize(document.file_size)} • 
                    Uploaded: ${this.formatTimestamp(document.created_at)}
                </p>
                <div class="preview-actions">
                    <button class="btn btn-primary" onclick="window.documentManager.downloadDocument(${document.id})">
                        <i class="fas fa-download"></i> Download File
                    </button>
                    <button class="btn btn-secondary" onclick="window.documentManager.viewDocumentChunks(${document.id})">
                        <i class="fas fa-list"></i> View Text Content
                    </button>
                    <button class="btn btn-outline" onclick="window.documentManager.searchInDocument(${document.id})">
                        <i class="fas fa-search"></i> Search in Document
                    </button>
                </div>
            </div>
        `;
    }

    showDocumentViewerLoading() {
        if (this.documentViewerTitle) {
            this.documentViewerTitle.textContent = 'Loading Document...';
        }

        if (this.documentViewerContent) {
            this.documentViewerContent.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">Loading document...</div>
                </div>
            `;
        }
    }

    showDocumentViewerError(message) {
        if (this.documentViewerTitle) {
            this.documentViewerTitle.textContent = 'Error Loading Document';
        }

        if (this.documentViewerContent) {
            this.documentViewerContent.innerHTML = `
                <div class="error-container">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle fa-3x"></i>
                    </div>
                    <div class="error-content">
                        <h3>Failed to Load Document</h3>
                        <p class="error-message">${message}</p>
                        <div class="error-actions">
                            <button class="btn btn-primary" onclick="window.documentManager.retryLoadDocument()">
                                <i class="fas fa-retry"></i> Retry
                            </button>
                            <button class="btn btn-secondary" onclick="window.documentManager.closeDocumentViewerModal()">
                                <i class="fas fa-times"></i> Close
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        if (this.documentViewerModal) {
            this.documentViewerModal.style.display = 'flex';
        }
    }

    showPreviewError(message) {
        this.documentViewerContent.innerHTML = `
            <div class="preview-error">
                <div class="error-icon">
                    <i class="fas fa-exclamation-circle fa-3x"></i>
                </div>
                <h3>Preview Error</h3>
                <p>${message}</p>
                <div class="error-actions">
                    <button class="btn btn-primary" onclick="window.documentManager.downloadDocument(${this.currentDocument?.id})">
                        <i class="fas fa-download"></i> Download Instead
                    </button>
                    <button class="btn btn-secondary" onclick="window.documentManager.retryLoadDocument()">
                        <i class="fas fa-retry"></i> Retry
                    </button>
                </div>
            </div>
        `;
    }

    retryLoadDocument() {
        const documentId = this.documentViewerModal?.getAttribute('data-current-document-id');
        if (documentId) {
            this.loadDocumentById(documentId);
        }
    }

    closeDocumentViewerModal() {
        if (this.documentViewerModal) {
            this.documentViewerModal.style.display = 'none';
            this.documentViewerModal.classList.remove('show');
            this.documentViewerModal.removeAttribute('data-current-document-id');
            window.document.body.classList.remove('modal-open');
        }

        // Clean up blob URLs
        if (this.currentPdfBlobUrl) {
            URL.revokeObjectURL(this.currentPdfBlobUrl);
            this.currentPdfBlobUrl = null;
        }

        // Reset fullscreen button if needed
        this.updateFullscreenButton(false);

        this.currentDocument = null;
    }

    // PDF Viewer Methods
    onPDFLoaded() {
        console.log('PDF loaded successfully');
        const loadingElements = window.document.querySelectorAll('.loading-container, .conversion-container');
        loadingElements.forEach(el => el.style.display = 'none');

        if (window.showStatus) {
            window.showStatus('Document loaded successfully', 'success', 2000);
        }
    }

    onPDFError() {
        console.error('PDF failed to load');
        this.showPreviewError('Failed to load PDF document');
    }

    onImageLoaded() {
        console.log('Image loaded successfully');
        if (window.showStatus) {
            window.showStatus('Image loaded successfully', 'success', 2000);
        }
    }

    onImageError() {
        console.error('Image failed to load');
        this.showPreviewError('Failed to load image');
    }

    printDocument() {
        const iframe = window.document.getElementById('pdfViewerFrame');
        if (iframe && iframe.contentWindow) {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (error) {
                console.warn('Direct PDF printing failed, falling back to window print');
                window.print();
            }
        } else {
            window.print();
        }
    }

    searchInPDF() {
        const iframe = window.document.getElementById('pdfViewerFrame');
        if (iframe && iframe.contentWindow) {
            try {
                iframe.contentWindow.focus();
                const event = new KeyboardEvent('keydown', {
                    key: 'f',
                    ctrlKey: true,
                    bubbles: true
                });
                iframe.contentWindow.document.dispatchEvent(event);
            } catch (error) {
                console.warn('PDF search trigger failed');
            }
        }

        if (window.showStatus) {
            window.showStatus('Use Ctrl+F to search within the PDF', 'info', 3000);
        }
    }

    toggleFullscreen() {
        const modal = this.documentViewerModal;
        if (!modal) return;

        if (window.document.fullscreenElement) {
            window.document.exitFullscreen();
            this.updateFullscreenButton(false);
        } else {
            modal.requestFullscreen().then(() => {
                this.updateFullscreenButton(true);
            }).catch(err => {
                console.warn('Fullscreen request failed:', err);
                if (window.showStatus) {
                    window.showStatus('Fullscreen not supported', 'warning');
                }
            });
        }
    }

    updateFullscreenButton(isFullscreen) {
        const button = window.document.querySelector('[onclick="window.documentManager.toggleFullscreen()"]');
        if (button) {
            const icon = button.querySelector('i');
            const text = button.querySelector('span');

            if (isFullscreen) {
                if (icon) icon.className = 'fas fa-compress';
                if (text) text.textContent = 'Exit Fullscreen';
                button.title = 'Exit Fullscreen';
            } else {
                if (icon) icon.className = 'fas fa-expand';
                if (text) text.textContent = 'Fullscreen';
                button.title = 'Toggle Fullscreen';
            }
        }
    }

    // Image Viewer Methods
    toggleImageZoom() {
        const img = window.document.getElementById('documentImage');
        if (img) {
            img.classList.toggle('zoomed');
            const button = window.document.querySelector('[onclick="window.documentManager.toggleImageZoom()"]');
            if (button) {
                const icon = button.querySelector('i');
                const text = button.querySelector('span');
                if (img.classList.contains('zoomed')) {
                    if (icon) icon.className = 'fas fa-search-minus';
                    if (text) text.textContent = 'Zoom Out';
                } else {
                    if (icon) icon.className = 'fas fa-search-plus';
                    if (text) text.textContent = 'Zoom In';
                }
            }
        }
    }

    zoomIn() {
        const img = window.document.getElementById('documentImage');
        if (img) {
            const currentScale = parseFloat(img.style.transform?.match(/scale\(([^)]+)\)/)?.[1] || 1);
            const newScale = Math.min(currentScale * 1.2, 3);
            img.style.transform = `scale(${newScale})`;
        }
    }

    zoomOut() {
        const img = window.document.getElementById('documentImage');
        if (img) {
            const currentScale = parseFloat(img.style.transform?.match(/scale\(([^)]+)\)/)?.[1] || 1);
            const newScale = Math.max(currentScale / 1.2, 0.5);
            img.style.transform = `scale(${newScale})`;
        }
    }

    resetZoom() {
        const img = window.document.getElementById('documentImage');
        if (img) {
            img.style.transform = 'scale(1)';
            img.classList.remove('zoomed');
        }
    }

    downloadConvertedPDF() {
        if (this.currentPdfBlobUrl && this.currentDocument) {
            const a = window.document.createElement('a');
            a.href = this.currentPdfBlobUrl;
            a.download = `${this.currentDocument.original_filename.replace(/\.[^/.]+$/, '')}.pdf`;
            window.document.body.appendChild(a);
            a.click();
            window.document.body.removeChild(a);

            if (window.showStatus) {
                window.showStatus('Converted PDF downloaded', 'success');
            }
        }
    }

    // Document Operations
    async deleteDocument(documentId) {
        if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/documents/${documentId}`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
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
            window.document.dispatchEvent(event);

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
        console.log('📥 Downloading document ID:', documentId);

        try {
            // Use the correct download endpoint
            const response = await fetch(`${this.apiBaseUrl}/pdf/${documentId}/download`, {
                method: 'GET'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const blob = await response.blob();
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `document_${documentId}`;

            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (filenameMatch && filenameMatch[1]) {
                    filename = filenameMatch[1].replace(/['"]/g, '');
                }
            }

            const url = window.URL.createObjectURL(blob);
            const a = window.document.createElement('a');
            a.href = url;
            a.download = filename;
            window.document.body.appendChild(a);
            a.click();
            window.document.body.removeChild(a);
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
            const response = await fetch(`${this.apiBaseUrl}/documents/${documentId}/chunks`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
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
                chunksHTML += `
                    <div class="chunk-item">
                        <div class="chunk-header">
                            <h5>Chunk ${i + 1}</h5>
                            <div class="chunk-meta">
                                <span class="chunk-size">${chunk.content.length} characters</span>
                                ${chunk.metadata?.page ? `<span class="chunk-page">Page: ${chunk.metadata.page}</span>` : ''}
                            </div>
                        </div>
                        <div class="chunk-content">
                            <pre>${this.escapeHtml(chunk.content)}</pre>
                        </div>
                        ${chunk.metadata ? `
                            <div class="chunk-metadata">
                                <small>
                                    ${Object.entries(chunk.metadata).map(([key, value]) => 
                                        `${key}: ${value}`
                                    ).join(' • ')}
                                </small>
                            </div>
                        ` : ''}
                    </div>
                `;
            }

            this.documentViewerContent.innerHTML = `
                <div class="chunks-viewer">
                    <div class="chunks-header">
                        <h4>Document Chunks (${chunks.length} total)</h4>
                        <div class="chunks-actions">
                            <button class="btn btn-secondary" onclick="window.documentManager.openDocumentViewer(${documentId})">
                                <i class="fas fa-arrow-left"></i> Back to Document
                            </button>
                            <button class="btn btn-outline" onclick="window.documentManager.exportChunks(${documentId})">
                                <i class="fas fa-download"></i> Export Chunks
                            </button>
                        </div>
                    </div>
                    <div class="chunks-container">
                        ${chunksHTML}
                    </div>
                </div>
            `;
        }
    }

    async exportChunks(documentId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/documents/${documentId}/chunks`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

                        if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const chunks = await response.json();
            const document = this.documents.find(doc => doc.id == documentId);

            const exportData = {
                document: {
                    id: documentId,
                    filename: document?.original_filename || 'Unknown',
                    title: document?.title || '',
                    exported_at: new Date().toISOString()
                },
                chunks: chunks,
                total_chunks: chunks.length
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = window.document.createElement('a');
            a.href = url;
            a.download = `${document?.original_filename || 'document'}_chunks.json`;
            window.document.body.appendChild(a);
            a.click();
            window.document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (window.showStatus) {
                window.showStatus('Chunks exported successfully', 'success');
            }

        } catch (error) {
            console.error('Error exporting chunks:', error);
            if (window.showStatus) {
                window.showStatus('Failed to export chunks: ' + error.message, 'error');
            }
        }
    }

    searchInDocument(documentId) {
        // Close document viewer if open
        this.closeDocumentViewerModal();

        // Set document filter in search manager
        if (window.searchManager) {
            if (typeof window.searchManager.setDocumentFilter === 'function') {
                window.searchManager.setDocumentFilter([documentId]);
            }
        }

        // Focus search input
        const messageInput = window.document.getElementById('messageInput');
        if (messageInput) {
            messageInput.focus();
            messageInput.placeholder = 'Search in selected document...';
        }

        if (window.showStatus) {
            window.showStatus('Document filter applied. Start typing to search.', 'info');
        }
    }

    // Filter and Sort Methods
    setFilter(key, value) {
        if (value && value.trim() !== '') {
            this.filters[key] = value.trim();
        } else {
            delete this.filters[key];
        }
        this.renderDocuments();
    }

    setSorting(sortBy, sortOrder = 'desc') {
        this.sortBy = sortBy;
        this.sortOrder = sortOrder;
        this.renderDocuments();

        // Update UI
        const sortSelect = window.document.getElementById('documentSort');
        if (sortSelect) {
            sortSelect.value = `${sortBy}:${sortOrder}`;
        }
    }

    clearFilters() {
        this.filters = {};
        this.renderDocuments();

        // Reset UI
        const filterInput = window.document.getElementById('documentFilter');
        if (filterInput) {
            filterInput.value = '';
        }
    }

    // Helper Methods for Keyboard Manager Integration
    isViewerOpen() {
        return this.documentViewerModal &&
               this.documentViewerModal.style.display !== 'none' &&
               this.documentViewerModal.classList.contains('show');
    }

    getCurrentDocument() {
        return this.currentDocument;
    }

    // Statistics Methods
    getDocumentStats() {
        const stats = {
            total: this.documents.length,
            completed: this.documents.filter(doc => doc.processing_status === 'completed').length,
            processing: this.documents.filter(doc => doc.processing_status === 'processing').length,
            failed: this.documents.filter(doc => doc.processing_status === 'failed').length,
            by_type: {}
        };

        // Count by file type
        this.documents.forEach(doc => {
            const type = doc.file_type.toLowerCase();
            stats.by_type[type] = (stats.by_type[type] || 0) + 1;
        });

        return stats;
    }

    // Utility Methods
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
            if (isNaN(date.getTime())) return 'Unknown';
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } catch (error) {
            console.error('Error formatting timestamp:', error);
            return 'Invalid Date';
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        try {
            const div = window.document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        } catch (error) {
            console.error('Error escaping HTML:', error);
            return String(text);
        }
    }

    debounce(func, wait, immediate = false) {
        let timeout;
        return function executedFunction(...args) {
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

    // Batch Operations
    async deleteMultipleDocuments(documentIds) {
        if (!documentIds || documentIds.length === 0) return;

        const confirmMessage = `Are you sure you want to delete ${documentIds.length} document(s)? This action cannot be undone.`;
        if (!confirm(confirmMessage)) return;

        let successCount = 0;
        let errorCount = 0;

        for (const documentId of documentIds) {
            try {
                const response = await fetch(`${this.apiBaseUrl}/documents/${documentId}`, {
                    method: 'DELETE',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    successCount++;
                    // Remove from local array
                    this.documents = this.documents.filter(doc => doc.id !== documentId);
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error deleting document ${documentId}:`, error);
                errorCount++;
            }
        }

        // Re-render and update UI
        this.renderDocuments();
        this.updateDocumentsCount();

        // Show status
        if (window.showStatus) {
            if (errorCount === 0) {
                window.showStatus(`Successfully deleted ${successCount} document(s)`, 'success');
            } else {
                window.showStatus(`Deleted ${successCount} document(s), ${errorCount} failed`, 'warning');
            }
        }

        // Dispatch events
        documentIds.forEach(documentId => {
            const event = new CustomEvent('documentDeleted', {
                detail: { documentId: documentId }
            });
            window.document.dispatchEvent(event);
        });
    }

    // Document Selection Methods
    toggleDocumentSelection(documentId) {
        const checkbox = window.document.querySelector(`[data-document-id="${documentId}"] input[type="checkbox"]`);
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            this.updateSelectionUI();
        }
    }

    selectAllDocuments() {
        const checkboxes = window.document.querySelectorAll('.document-item input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        this.updateSelectionUI();
    }

    deselectAllDocuments() {
        const checkboxes = window.document.querySelectorAll('.document-item input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        this.updateSelectionUI();
    }

    getSelectedDocumentIds() {
        const checkboxes = window.document.querySelectorAll('.document-item input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(checkbox => {
            return parseInt(checkbox.closest('.document-item').dataset.id);
        });
    }

    updateSelectionUI() {
        const selectedIds = this.getSelectedDocumentIds();
        const selectionActions = window.document.getElementById('selectionActions');

        if (selectionActions) {
            if (selectedIds.length > 0) {
                selectionActions.style.display = 'flex';
                selectionActions.querySelector('.selection-count').textContent = `${selectedIds.length} selected`;
            } else {
                selectionActions.style.display = 'none';
            }
        }
    }

    // Advanced Features
    async duplicateDocument(documentId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/documents/${documentId}/duplicate`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const newDocument = await response.json();

            // Add to local array
            this.documents.unshift(newDocument);
            this.renderDocuments();
            this.updateDocumentsCount();

            if (window.showStatus) {
                window.showStatus('Document duplicated successfully', 'success');
            }

        } catch (error) {
            console.error('Error duplicating document:', error);
            if (window.showStatus) {
                window.showStatus('Failed to duplicate document: ' + error.message, 'error');
            }
        }
    }

    async shareDocument(documentId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/documents/${documentId}/share`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    expires_in: 24 * 60 * 60 // 24 hours
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const shareData = await response.json();

            // Copy to clipboard
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(shareData.share_url);
                if (window.showStatus) {
                    window.showStatus('Share link copied to clipboard', 'success');
                }
            } else {
                // Fallback for older browsers
                const textArea = window.document.createElement('textarea');
                textArea.value = shareData.share_url;
                window.document.body.appendChild(textArea);
                textArea.select();
                window.document.execCommand('copy');
                window.document.body.removeChild(textArea);

                if (window.showStatus) {
                    window.showStatus('Share link copied to clipboard', 'success');
                }
            }

        } catch (error) {
            console.error('Error sharing document:', error);
            if (window.showStatus) {
                window.showStatus('Failed to create share link: ' + error.message, 'error');
            }
        }
    }

    // Cleanup method
    cleanup() {
        // Clean up any blob URLs
        if (this.currentPdfBlobUrl) {
            URL.revokeObjectURL(this.currentPdfBlobUrl);
            this.currentPdfBlobUrl = null;
        }

        // Clean up any resources
        this.documents = [];
        this.currentDocument = null;

        // Remove event listeners if needed
        if (this.documentViewerModal) {
            this.documentViewerModal.style.display = 'none';
            this.documentViewerModal.classList.remove('show');
        }
    }

    // Public API Methods for integration
    async refreshDocumentById(documentId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/documents/${documentId}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const updatedDocument = await response.json();

            // Update in local array
            const index = this.documents.findIndex(doc => doc.id === documentId);
            if (index !== -1) {
                this.documents[index] = updatedDocument;
                this.renderDocuments();
            }

            return updatedDocument;

        } catch (error) {
            console.error('Error refreshing document:', error);
            throw error;
        }
    }

    // Event handlers for upload integration
    onDocumentUploaded(documentData) {
        // Add new document to the beginning of the list
        this.documents.unshift(documentData);
        this.renderDocuments();
        this.updateDocumentsCount();

        console.log('Document added to list:', documentData);
    }

    onDocumentProcessed(documentId, status) {
        // Update document status
        const document = this.documents.find(doc => doc.id === documentId);
        if (document) {
            document.processing_status = status;
            this.renderDocuments();
        }
    }
}

// Create the DocumentManager class globally available
if (typeof window !== 'undefined') {
    window.DocumentManager = DocumentManager;
}

// Auto-initialize if elements are present
window.document.addEventListener('DOMContentLoaded', function() {
    // Only auto-initialize if not already done by app.js
    if (!window.documentManager && window.document.getElementById('documentsList')) {
        console.log('Auto-initializing DocumentManager...');
        window.documentManager = new DocumentManager();
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DocumentManager;
}

console.log('DocumentManager loaded successfully');
