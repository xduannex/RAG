// RAG Document Management
// Handles document listing, viewing, and management operations

class DocumentManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl || window.API_BASE_URL;
        this.documents = [];
        this.currentPage = 1;
        this.totalPages = 1;
        this.totalDocuments = 0;
        this.documentsPerPage = 20;
        this.isLoading = false;
        this.filters = {
            file_type: null,
            category: null,
            status: null
        };

        // Document viewer state
        this.currentViewDocument = null;
        this.currentSearchIndex = -1;
        this.totalSearchResults = 0;

        // Cache for better performance
        this.documentCache = new Map();

        this.init();
    }

    // =====================================================
    // INITIALIZATION METHODS
    // =====================================================

    init() {
        console.log('🔄 Initializing Document Manager...');
        this.ensureCSSLoaded();
        this.setupElements();
        this.setupEventListeners();
        this.loadDocuments();

        // Register globally
        window.documentManager = this;
        console.log('✅ Document manager initialized');
    }

    ensureCSSLoaded() {
        // Check if documents.css is loaded
        const cssLoaded = Array.from(document.styleSheets).some(sheet => {
            try {
                return sheet.href && sheet.href.includes('documents.css');
            } catch (e) {
                return false;
            }
        });

        if (!cssLoaded) {
            console.warn('📋 documents.css not found, loading dynamically...');
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'css/documents.css';
            document.head.appendChild(link);
        }
    }

    setupElements() {
        // Main container elements
        this.documentsContainer = document.getElementById('documentsContainer');
        this.paginationContainer = document.getElementById('paginationContainer');

        // Document viewer modal elements
        this.documentViewerModal = document.getElementById('documentViewerModal');
        this.documentViewerTitle = document.getElementById('documentViewerTitle');
        this.documentViewerContent = document.getElementById('documentViewerContent');
        this.closeDocumentViewer = document.getElementById('closeDocumentViewer');

        // Create viewer elements if they don't exist
        this.ensureViewerElements();

        // Control elements
        this.refreshBtn = document.getElementById('refreshDocsBtn');
        this.clearFiltersBtn = document.getElementById('clearFiltersBtn');

        console.log('📋 Document manager elements setup complete');
    }

    ensureViewerElements() {
        if (!this.documentViewerModal) {
            console.log('📋 Creating document viewer modal...');
            this.createDocumentViewerModal();
        }

        // Ensure iframe exists within the modal
        let iframe = document.getElementById('documentViewerIframe');
        if (!iframe && this.documentViewerContent) {
            iframe = document.createElement('iframe');
            iframe.id = 'documentViewerIframe';
            iframe.style.width = '100%';
            iframe.style.height = '600px';
            iframe.style.border = '1px solid #ddd';
            iframe.style.borderRadius = '4px';
            iframe.style.display = 'none';

            // Create loading container
            const loadingContainer = document.createElement('div');
            loadingContainer.id = 'documentViewerLoading';
            loadingContainer.className = 'loading-container';
            loadingContainer.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading document...</div>
            `;

            // Create error container
            const errorContainer = document.createElement('div');
            errorContainer.id = 'documentViewerError';
            errorContainer.className = 'error-container';
            errorContainer.style.display = 'none';
            errorContainer.innerHTML = `
                <div class="error-icon"><i class="fas fa-exclamation-circle"></i></div>
                <div class="error-text" id="documentViewerErrorText">Failed to load document</div>
                <button class="btn btn-sm btn-primary" onclick="documentManager.retryLoadDocument()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            `;

            // Clear existing content and add new elements
            this.documentViewerContent.innerHTML = '';
            this.documentViewerContent.appendChild(loadingContainer);
            this.documentViewerContent.appendChild(iframe);
            this.documentViewerContent.appendChild(errorContainer);
        }
    }

    createDocumentViewerModal() {
        const modalHTML = `
            <div id="documentViewerModal" class="modal">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3 id="documentViewerTitle">Document Viewer</h3>
                        <div class="modal-actions">
                            <button class="btn btn-sm btn-outline" id="documentDownloadBtn" title="Download">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="btn btn-sm btn-outline" id="documentPrintBtn" title="Print">
                                <i class="fas fa-print"></i>
                            </button>
                            <span class="close" id="closeDocumentViewer">&times;</span>
                        </div>
                    </div>
                    <div class="modal-body">
                        <div id="documentViewerContent">
                            <!-- Content will be populated by ensureViewerElements -->
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Re-setup elements
        this.documentViewerModal = document.getElementById('documentViewerModal');
        this.documentViewerTitle = document.getElementById('documentViewerTitle');
        this.documentViewerContent = document.getElementById('documentViewerContent');
        this.closeDocumentViewer = document.getElementById('closeDocumentViewer');

        // Setup modal event listeners
        this.setupModalEventListeners();
    }

    setupEventListeners() {
        // Document list refresh button
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.refreshDocuments());
        }

        // Filter controls
        const filterControls = document.querySelectorAll('.filter-control');
        filterControls.forEach(control => {
            control.addEventListener('change', () => this.applyFilters());
        });

        // Clear filters button
        if (this.clearFiltersBtn) {
            this.clearFiltersBtn.addEventListener('click', () => this.clearFilters());
        }

        // Setup modal event listeners
        this.setupModalEventListeners();

        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.documentViewerModal &&
                this.documentViewerModal.style.display === 'block') {
                this.closeDocumentViewerModal();
            }
        });
    }

    setupModalEventListeners() {
        if (this.closeDocumentViewer) {
            this.closeDocumentViewer.addEventListener('click', () => {
                this.closeDocumentViewerModal();
            });
        }

        // Close on outside click
        if (this.documentViewerModal) {
            this.documentViewerModal.addEventListener('click', (e) => {
                if (e.target === this.documentViewerModal) {
                    this.closeDocumentViewerModal();
                }
            });
        }

        // Download button
        const downloadBtn = document.getElementById('documentDownloadBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                if (this.currentViewDocument) {
                    this.downloadDocument(this.currentViewDocument.id || this.currentViewDocument.document_id);
                }
            });
        }

        // Print button
        const printBtn = document.getElementById('documentPrintBtn');
        if (printBtn) {
            printBtn.addEventListener('click', () => this.printDocument());
        }
    }

    // =====================================================
    // DOCUMENT LOADING AND RENDERING METHODS
    // =====================================================

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

            console.log(`📋 Loading documents: page ${page}`);

            // Try primary endpoint first
            let response = await fetch(`${this.apiBaseUrl}/api/documents/?${params}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            // Fallback to alternative endpoint
            if (!response.ok && response.status === 404) {
                response = await fetch(`${this.apiBaseUrl}/documents/?${params}`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });
            }

            if (!response.ok) {
                throw new Error(`Failed to load documents: ${response.statusText}`);
            }

            const data = await response.json();
            this.handleDocumentsResponse(data, page);

        } catch (error) {
            console.error('❌ Error loading documents:', error);
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
        this.totalPages = Math.ceil(this.totalDocuments / this.documentsPerPage);

        // Cache documents
        this.documents.forEach(doc => {
            const docId = doc.id || doc.document_id;
            if (docId) {
                this.documentCache.set(docId, doc);
            }
        });

        this.renderDocuments();
        this.renderPagination();
        this.updateStats();

        console.log(`✅ Loaded ${this.documents.length} documents (page ${page})`);
    }

    renderDocuments() {
        if (!this.documentsContainer) return;

        if (this.documents.length === 0) {
            this.documentsContainer.innerHTML = this.renderEmptyState();
            return;
        }

        const documentsHTML = this.documents.map(doc => this.renderDocumentItem(doc)).join('');
        this.documentsContainer.innerHTML = `<div class="document-list">${documentsHTML}</div>`;
    }

    renderDocumentItem(doc) {
        const fileIcon = this.getFileIcon(doc.file_type);
        const fileSize = this.formatFileSize(doc.file_size);
        const uploadDate = doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Unknown';
        const documentId = doc.id || doc.document_id;

        if (!documentId) {
            console.warn('⚠️ Document missing ID:', doc);
            return '';
        }

        return `
            <div class="document-item" data-document-id="${documentId}">
                <div class="document-icon" data-type="${doc.file_type}">
                    <i class="${fileIcon}"></i>
                </div>
                <div class="document-info">
                    <div class="document-title" title="${this.escapeHtml(doc.filename || doc.original_filename || 'Unknown')}">
                        ${this.escapeHtml(doc.title || doc.filename || doc.original_filename || 'Untitled')}
                    </div>
                    <div class="document-meta">
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
                            ${uploadDate}
                        </div>
                        ${doc.word_count ? `
                        <div class="meta-item">
                            <i class="fas fa-font"></i>
                            ${doc.word_count.toLocaleString()} words
                        </div>` : ''}
                        ${doc.total_chunks ? `
                        <div class="meta-item">
                            <i class="fas fa-puzzle-piece"></i>
                            ${doc.total_chunks} chunks
                        </div>` : ''}
                    </div>
                </div>
                <div class="document-status">
                    <span class="status-badge status-${doc.status || 'unknown'}">
                        ${this.getStatusIcon(doc.status)}
                        ${doc.status || 'Unknown'}
                    </span>
                    ${doc.processing_status && doc.processing_status !== doc.status ? `
                    <span class="status-badge status-${doc.processing_status}">
                        ${this.getProcessingStatusIcon(doc.processing_status)}
                        ${doc.processing_status}
                    </span>` : ''}
                </div>
                <div class="document-actions">
                    <button class="btn btn-sm btn-ghost" onclick="documentManager.openDocumentViewer('${documentId}')" title="View Document">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${doc.file_type === 'pdf' ? `
                    <button class="btn btn-sm btn-ghost" onclick="documentManager.viewPDF('${documentId}')" title="View PDF">
                        <i class="fas fa-file-pdf"></i>
                    </button>`                    : ''}
                    <button class="btn btn-sm btn-ghost" onclick="documentManager.downloadDocument('${documentId}')" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-sm btn-ghost" onclick="documentManager.showDocumentOptions('${documentId}')" title="More Options">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </div>
            </div>
        `;
    }

    renderEmptyState() {
        return `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-file-text"></i>
                </div>
                <h3>No documents found</h3>
                <p>Upload your first document to get started, or try adjusting your search filters.</p>
                <div class="empty-actions">
                    <button class="btn btn-primary" onclick="document.getElementById('fileInput')?.click()">
                        <i class="fas fa-upload"></i> Upload Document
                    </button>
                    <button class="btn btn-outline" onclick="documentManager.clearFilters()">
                        <i class="fas fa-filter"></i> Clear Filters
                    </button>
                </div>
            </div>
        `;
    }

    renderPagination() {
        if (!this.paginationContainer || this.totalPages <= 1) {
            if (this.paginationContainer) {
                this.paginationContainer.innerHTML = '';
            }
            return;
        }

        const pagination = [];

        // Previous button
        if (this.currentPage > 1) {
            pagination.push(`
                <button class="pagination-btn" onclick="documentManager.loadDocuments(${this.currentPage - 1})">
                    <i class="fas fa-chevron-left"></i> Previous
                </button>
            `);
        }

        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(this.totalPages, this.currentPage + 2);

        if (startPage > 1) {
            pagination.push(`
                <button class="pagination-btn" onclick="documentManager.loadDocuments(1)">1</button>
            `);
            if (startPage > 2) {
                pagination.push('<span class="pagination-ellipsis">...</span>');
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === this.currentPage ? 'active' : '';
            pagination.push(`
                <button class="pagination-btn ${isActive}" onclick="documentManager.loadDocuments(${i})">${i}</button>
            `);
        }

        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                pagination.push('<span class="pagination-ellipsis">...</span>');
            }
            pagination.push(`
                <button class="pagination-btn" onclick="documentManager.loadDocuments(${this.totalPages})">${this.totalPages}</button>
            `);
        }

        // Next button
        if (this.currentPage < this.totalPages) {
            pagination.push(`
                <button class="pagination-btn" onclick="documentManager.loadDocuments(${this.currentPage + 1})">
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            `);
        }

        this.paginationContainer.innerHTML = `
            <div class="pagination">
                ${pagination.join('')}
            </div>
            <div class="pagination-info">
                Showing ${((this.currentPage - 1) * this.documentsPerPage) + 1}-${Math.min(this.currentPage * this.documentsPerPage, this.totalDocuments)} of ${this.totalDocuments} documents
            </div>
        `;
    }

    // =====================================================
    // DOCUMENT VIEWER METHODS
    // =====================================================

    async openDocumentViewer(documentId) {
        console.log(`📋 Opening document viewer for ID: ${documentId}`);

        if (!documentId) {
            console.error('❌ Document ID is required');
            this.showError('Document ID is required');
            return;
        }

        // Get document from cache or fetch
        let document = this.documentCache.get(documentId);
        if (!document) {
            document = await this.fetchDocument(documentId);
            if (!document) return;
        }

        this.currentViewDocument = document;

        // Show modal
        this.showDocumentViewerModal();

        // Set title
        const title = document.title || document.filename || document.original_filename || 'Document';
        if (this.documentViewerTitle) {
            this.documentViewerTitle.textContent = title;
        }

        // Load document content
        await this.loadDocumentContent(documentId, document);
    }

    async loadDocumentContent(documentId, document) {
    try {
        this.showDocumentLoading();

        console.log(`📋 Loading content for document: ${documentId}, type: ${document.file_type}`);

        // Try to load as PDF first (your backend converts non-PDF to PDF automatically)
        await this.loadAsPDF(documentId);

    } catch (error) {
        console.error(`❌ Error loading document content:`, error);

        // Fallback to text content if PDF conversion/loading fails
        try {
            console.log('📋 PDF loading failed, trying text content fallback');
            await this.loadTextContent(documentId);
        } catch (textError) {
            console.error(`❌ Text content fallback also failed:`, textError);
            this.showDocumentError(`Failed to load document: ${error.message}`);
        }
    }
}

    async loadAsPDF(documentId) {
    console.log(`📋 Loading document as PDF: ${documentId}`);

    // Use your PDF conversion endpoint
    const pdfEndpoints = [
        `${this.apiBaseUrl}/documents/${documentId}/view-as-pdf`,  // Your conversion endpoint
        `${this.apiBaseUrl}/api/documents/${documentId}/view-as-pdf`, // Alternative path
        `${this.apiBaseUrl}/pdf/${documentId}/download` // Direct download for PDFs
    ];

    let success = false;

    for (const endpoint of pdfEndpoints) {
        try {
            console.log(`📋 Trying PDF endpoint: ${endpoint}`);

            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'Accept': 'application/pdf,*/*'
                }
            });

            if (response.ok) {
                const contentType = response.headers.get('content-type');
                console.log(`📋 Response content-type: ${contentType}`);

                // Check if we got a PDF response
                if (contentType && (contentType.includes('application/pdf') || contentType.includes('pdf'))) {
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);

                    const iframe = document.getElementById('documentViewerIframe');
                    if (iframe) {
                        // Clean up any previous blob URL
                        if (iframe.src && iframe.src.startsWith('blob:')) {
                            URL.revokeObjectURL(iframe.src);
                        }

                        iframe.src = blobUrl;
                        this.hideAllContentContainers();
                        iframe.style.display = 'block';
                        this.hideDocumentLoading();
                        success = true;

                        // Check for conversion headers from your backend
                        const convertedFrom = response.headers.get('X-Converted-From');
                        const originalFilename = response.headers.get('X-Original-Filename');

                        if (convertedFrom) {
                            console.log(`✅ Document converted from ${convertedFrom} to PDF for viewing`);
                            this.showSuccess(`Document converted from ${convertedFrom.toUpperCase()} to PDF for viewing`);
                        } else {
                            console.log('✅ PDF loaded successfully in iframe');
                        }

                        return;
                    }
                }
            } else if (response.status === 400) {
                // Your backend returns 400 if file can't be converted
                const errorData = await response.json().catch(() => ({}));
                console.warn(`⚠️ Conversion not supported: ${errorData.detail || 'Unknown error'}`);
                // Don't try other endpoints, fall back to text content
                break;
            }
        } catch (error) {
            console.warn(`⚠️ Failed to load PDF from ${endpoint}:`, error);
        }
    }

    if (!success) {
        throw new Error('Unable to load document as PDF from any endpoint');
    }
}

    async loadImageContent(documentId) {
        const endpoint = `${this.apiBaseUrl}/api/documents/${documentId}/download`;

        try {
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);

            // Create or update image container
            let imageContainer = document.getElementById('documentImageContainer');
            if (!imageContainer) {
                imageContainer = document.createElement('div');
                imageContainer.id = 'documentImageContainer';
                imageContainer.style.textAlign = 'center';
                imageContainer.style.padding = '20px';
                this.documentViewerContent.appendChild(imageContainer);
            }

            imageContainer.innerHTML = `
                <img src="${imageUrl}" alt="Document Image" 
                     style="max-width: 100%; max-height: 500px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            `;

            imageContainer.style.display = 'block';
            this.hideDocumentLoading();

            console.log('✅ Image loaded successfully');

        } catch (error) {
            throw new Error(`Failed to load image: ${error.message}`);
        }
    }

    async loadTextContent(documentId) {
    console.log(`📋 Loading text content for document: ${documentId}`);

    const textEndpoints = [
        `${this.apiBaseUrl}/api/documents/${documentId}/view`, // Your working text endpoint
        `${this.apiBaseUrl}/documents/${documentId}/view`
    ];

    let success = false;

    for (const endpoint of textEndpoints) {
        try {
            console.log(`📋 Trying text endpoint: ${endpoint}`);

            const response = await fetch(endpoint, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();

                if (data.content) {
                    this.displayTextContent(data);
                    success = true;
                    console.log('✅ Text content loaded successfully');
                    break;
                }
            }
        } catch (error) {
            console.warn(`⚠️ Failed to load text from ${endpoint}:`, error);
        }
    }

    if (!success) {
        throw new Error('Unable to load document text content from any endpoint');
    }
}

    displayTextContent(data) {
    const textContainer = document.getElementById('documentTextContainer');
    if (!textContainer) {
        console.error('Text container not found');
        return;
    }

    // Hide other containers and show text container
    this.hideAllContentContainers();
    textContainer.style.display = 'block';

    // Format the content nicely
    const content = data.content || 'No content available';
    const title = data.title || data.filename || 'Document';

    textContainer.innerHTML = `
        <div class="text-document-viewer">
            <div class="text-document-header">
                <h2>${this.escapeHtml(title)}</h2>
                <div class="document-meta">
                    <span class="meta-item">
                        <i class="fas fa-file-alt"></i> ${data.file_type?.toUpperCase() || 'TEXT'}
                    </span>
                    <span class="meta-item">
                        <i class="fas fa-font"></i> ${data.word_count || 0} words
                    </span>
                    ${data.total_pages ? `<span class="meta-item"><i class="fas fa-file"></i> ${data.total_pages} pages</span>` : ''}
                </div>
            </div>
            <div class="text-document-content">
                ${this.formatTextContent(content)}
            </div>
        </div>
    `;

    this.hideDocumentLoading();
    console.log('✅ Text content displayed successfully');
}
    formatTextContent(content) {
    if (!content) return '<p>No content available</p>';

    // Convert line breaks to paragraphs and preserve formatting
    return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
            // Handle page separators
            if (line.startsWith('--- Page')) {
                return `<div class="page-separator">${this.escapeHtml(line)}</div>`;
            }
            return `<p>${this.escapeHtml(line)}</p>`;
        })
        .join('');
}


    async loadGenericContent(documentId, document) {
        // Show download option for unsupported file types
        const downloadUrl = `${this.apiBaseUrl}/api/documents/${documentId}/download`;

        const genericContainer = document.createElement('div');
        genericContainer.style.textAlign = 'center';
        genericContainer.style.padding = '40px';

        genericContainer.innerHTML = `
            <div class="generic-document-view">
                <div class="file-icon" style="font-size: 64px; color: #6c757d; margin-bottom: 20px;">
                    <i class="${this.getFileIcon(document.file_type)}"></i>
                </div>
                <h3>${this.escapeHtml(document.title || document.filename || 'Document')}</h3>
                <p class="text-muted">File Type: ${document.file_type?.toUpperCase() || 'Unknown'}</p>
                <p class="text-muted">Size: ${this.formatFileSize(document.file_size)}</p>
                <div style="margin-top: 30px;">
                    <a href="${downloadUrl}" class="btn btn-primary" download>
                        <i class="fas fa-download"></i> Download Document
                    </a>
                </div>
            </div>
        `;

        this.documentViewerContent.innerHTML = '';
        this.documentViewerContent.appendChild(genericContainer);

        console.log('✅ Generic document view loaded');
    }

    showDocumentViewerModal() {
        if (this.documentViewerModal) {
            this.documentViewerModal.style.display = 'block';
            this.documentViewerModal.classList.add('show');

            // Focus management
            if (this.closeDocumentViewer) {
                this.closeDocumentViewer.focus();
            }
        }
    }

    closeDocumentViewerModal() {
        if (this.documentViewerModal) {
            this.documentViewerModal.style.display = 'none';
            this.documentViewerModal.classList.remove('show');

            // Clean up iframe src to stop loading
            const iframe = document.getElementById('documentViewerIframe');
            if (iframe) {
                iframe.src = '';
                iframe.style.display = 'none';
            }

            // Hide other containers
            const imageContainer = document.getElementById('documentImageContainer');
            if (imageContainer) {
                imageContainer.style.display = 'none';
            }

            const textContainer = document.getElementById('documentTextContainer');
            if (textContainer) {
                textContainer.style.display = 'none';
            }

            this.currentViewDocument = null;
        }
    }

    hideAllContentContainers() {
    const iframe = document.getElementById('documentViewerIframe');
    const textContainer = document.getElementById('documentTextContainer');
    const imageContainer = document.getElementById('documentImageContainer');

    if (iframe) iframe.style.display = 'none';
    if (textContainer) textContainer.style.display = 'none';
    if (imageContainer) imageContainer.style.display = 'none';
}

    showDocumentLoading() {
    const loadingElement = document.getElementById('documentViewerLoading');
    const errorElement = document.getElementById('documentViewerError');

    this.hideAllContentContainers();

    if (errorElement) errorElement.style.display = 'none';
    if (loadingElement) {
        loadingElement.style.display = 'flex';
    }

    console.log('📋 Showing document loading state');
}


    hideDocumentLoading() {
    const loadingElement = document.getElementById('documentViewerLoading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
    console.log('📋 Hiding document loading state');
}

    showDocumentError(message) {
    const errorElement = document.getElementById('documentViewerError');
    const errorTextElement = document.getElementById('documentViewerErrorText');
    const loadingElement = document.getElementById('documentViewerLoading');

    this.hideAllContentContainers();

    if (loadingElement) loadingElement.style.display = 'none';

    if (errorTextElement) {
        errorTextElement.textContent = message || 'Failed to load document';
    }

    if (errorElement) {
        errorElement.style.display = 'flex';
    }

    console.error('📋 Showing document error:', message);
}


    retryLoadDocument() {
                if (this.currentViewDocument) {
            const documentId = this.currentViewDocument.id || this.currentViewDocument.document_id;
            this.loadDocumentContent(documentId, this.currentViewDocument);
        }
    }

    // =====================================================
    // DOCUMENT ACTIONS METHODS
    // =====================================================

   async fetchDocument(documentId) {
    try {
        console.log(`📋 Fetching document ${documentId}`);

        // Check cache first
        if (this.documentCache.has(documentId)) {
            return this.documentCache.get(documentId);
        }

        // Use the correct endpoint that works (from your curl test)
        const endpoints = [
            `${this.apiBaseUrl}/pdf/${documentId}`,  // This works based on your curl test
            `${this.apiBaseUrl}/api/documents/${documentId}`,
            `${this.apiBaseUrl}/documents/${documentId}`
        ];

        for (const endpoint of endpoints) {
            try {
                console.log(`📋 Trying fetch endpoint: ${endpoint}`);

                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });

                if (response.ok) {
                    const document = await response.json();
                    this.documentCache.set(documentId, document);
                    console.log('✅ Document fetched:', document);
                    return document;
                }
            } catch (error) {
                console.warn(`⚠️ Failed to fetch from ${endpoint}:`, error);
            }
        }

        throw new Error('Document not found');

    } catch (error) {
        console.error(`❌ Error fetching document ${documentId}:`, error);
        this.showError(`Failed to load document: ${error.message}`);
        return null;
    }
}

// Helper method to show success messages
showSuccess(message) {
    if (window.showStatus) {
        window.showStatus(message, 'success', 3000);
    }
}


    async downloadDocument(documentId) {
    try {
        console.log(`📋 Downloading document ${documentId}`);

        const downloadEndpoints = [
            `${this.apiBaseUrl}/pdf/${documentId}/download`,
            `${this.apiBaseUrl}/api/documents/${documentId}/download`,
            `${this.apiBaseUrl}/documents/${documentId}/download`
        ];

        let success = false;

        for (const endpoint of downloadEndpoints) {
            try {
                // Create a temporary link to trigger download
                const link = document.createElement('a');
                link.href = endpoint;
                link.target = '_blank';
                link.download = ''; // Let browser handle filename
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                this.showSuccess('Download started');
                success = true;
                break;
            } catch (error) {
                console.warn(`⚠️ Download failed from ${endpoint}:`, error);
            }
        }

        if (!success) {
            throw new Error('Download failed from all endpoints');
        }

    } catch (error) {
        console.error(`❌ Error downloading document:`, error);
        this.showError(`Download failed: ${error.message}`);
    }
}

    async deleteDocument(documentId) {
        if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
            return;
        }

        try {
            console.log(`📋 Deleting document ${documentId}`);

            const endpoints = [
                `${this.apiBaseUrl}/api/documents/${documentId}`,
                `${this.apiBaseUrl}/documents/${documentId}`,
                `${this.apiBaseUrl}/pdf/${documentId}`
            ];

            let success = false;

            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint, {
                        method: 'DELETE',
                        headers: { 'Accept': 'application/json' }
                    });

                    if (response.ok) {
                        success = true;
                        break;
                    }
                } catch (error) {
                    console.warn(`⚠️ Delete failed from ${endpoint}:`, error);
                }
            }

            if (success) {
                // Remove from cache
                this.documentCache.delete(documentId);

                // Refresh documents list
                await this.refreshDocuments();

                this.showSuccess('Document deleted successfully');
            } else {
                throw new Error('Unable to delete document');
            }

        } catch (error) {
            console.error(`❌ Error deleting document ${documentId}:`, error);
            this.showError(`Failed to delete document: ${error.message}`);
        }
    }

    async reprocessDocument(documentId) {
        try {
            console.log(`📋 Reprocessing document ${documentId}`);

            const endpoints = [
                `${this.apiBaseUrl}/api/documents/${documentId}/reprocess`,
                `${this.apiBaseUrl}/documents/${documentId}/reprocess`,
                `${this.apiBaseUrl}/pdf/${documentId}/reprocess`
            ];

            let success = false;

            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Accept': 'application/json' }
                    });

                    if (response.ok) {
                        success = true;
                        break;
                    }
                } catch (error) {
                    console.warn(`⚠️ Reprocess failed from ${endpoint}:`, error);
                }
            }

            if (success) {
                this.showSuccess('Document reprocessing started');

                // Refresh after a delay to show updated status
                setTimeout(() => {
                    this.refreshDocuments();
                }, 2000);
            } else {
                throw new Error('Unable to reprocess document');
            }

        } catch (error) {
            console.error(`❌ Error reprocessing document ${documentId}:`, error);
            this.showError(`Failed to reprocess document: ${error.message}`);
        }
    }

    printDocument() {
    const iframe = document.getElementById('documentViewerIframe');
    if (iframe && iframe.style.display !== 'none') {
        // Print PDF in iframe
        try {
            iframe.contentWindow.print();
        } catch (error) {
            console.warn('Direct print failed, opening in new window');
            window.open(iframe.src, '_blank');
        }
    } else {
        // Print text content
        const textContainer = document.getElementById('documentTextContainer');
        if (textContainer && textContainer.style.display !== 'none') {
            const printContent = textContainer.innerHTML;
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Print Document</title>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; }
                            .text-document-viewer { max-width: none; padding: 20px; }
                            .page-separator { background: #f0f0f0; padding: 10px; margin: 15px 0; }
                            @media print { .no-print { display: none; } }
                        </style>
                    </head>
                    <body>${printContent}</body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();
        }
    }
}

    async viewPDF(documentId) {
        // Open PDF in new tab
        const pdfUrl = `${this.apiBaseUrl}/api/documents/${documentId}/view`;
        window.open(pdfUrl, '_blank');
    }

    showDocumentOptions(documentId) {
        const document = this.documentCache.get(documentId);
        if (!document) {
            console.error('❌ Document not found in cache');
            return;
        }

        // Create context menu
        const contextMenu = document.createElement('div');
        contextMenu.className = 'context-menu';
        contextMenu.innerHTML = `
            <div class="context-menu-item" onclick="documentManager.openDocumentViewer('${documentId}')">
                <i class="fas fa-eye"></i> View
            </div>
            <div class="context-menu-item" onclick="documentManager.downloadDocument('${documentId}')">
                <i class="fas fa-download"></i> Download
            </div>
            <div class="context-menu-item" onclick="documentManager.reprocessDocument('${documentId}')">
                <i class="fas fa-sync"></i> Reprocess
            </div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item danger" onclick="documentManager.deleteDocument('${documentId}')">
                <i class="fas fa-trash"></i> Delete
            </div>
        `;

        // Position and show menu
        document.body.appendChild(contextMenu);

        // Position near the clicked element
        const element = document.querySelector(`[data-document-id="${documentId}"]`);
        if (element) {
            const rect = element.getBoundingClientRect();
            contextMenu.style.position = 'fixed';
            contextMenu.style.top = `${rect.top + rect.height}px`;
            contextMenu.style.left = `${rect.right - 200}px`;
        }

        // Remove menu when clicking outside
        const removeMenu = (e) => {
            if (!contextMenu.contains(e.target)) {
                contextMenu.remove();
                document.removeEventListener('click', removeMenu);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', removeMenu);
        }, 100);
    }

    // =====================================================
    // FILTER AND SEARCH METHODS
    // =====================================================

    applyFilters() {
        const fileTypeFilter = document.getElementById('fileTypeFilter');
        const categoryFilter = document.getElementById('categoryFilter');
        const statusFilter = document.getElementById('statusFilter');

        this.filters = {
            file_type: fileTypeFilter?.value || null,
            category: categoryFilter?.value || null,
            status: statusFilter?.value || null
        };

        // Reset to first page when applying filters
        this.loadDocuments(1);
    }

    clearFilters() {
        this.filters = {
            file_type: null,
            category: null,
            status: null
        };

        // Reset filter UI
        const fileTypeFilter = document.getElementById('fileTypeFilter');
        const categoryFilter = document.getElementById('categoryFilter');
        const statusFilter = document.getElementById('statusFilter');

        if (fileTypeFilter) fileTypeFilter.value = '';
        if (categoryFilter) categoryFilter.value = '';
        if (statusFilter) statusFilter.value = '';

        // Reload documents
        this.loadDocuments(1);
    }

    async searchDocuments(query, options = {}) {
        if (!query || query.trim().length === 0) {
            this.showError('Please enter a search query');
            return;
        }

        try {
            console.log(`📋 Searching documents: "${query}"`);

            const searchParams = new URLSearchParams({
                query: query.trim(),
                limit: options.limit || 20,
                ...options
            });

            const response = await fetch(`${this.apiBaseUrl}/search/documents?${searchParams}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`Search failed: ${response.statusText}`);
            }

            const results = await response.json();
            this.displaySearchResults(results, query);

        } catch (error) {
            console.error('❌ Error searching documents:', error);
            this.showError(`Search failed: ${error.message}`);
        }
    }

    displaySearchResults(results, query) {
        if (!this.documentsContainer) return;

        const resultsHTML = `
            <div class="search-results">
                <div class="search-header">
                    <h3>Search Results for "${this.escapeHtml(query)}"</h3>
                    <p>${results.total_results || 0} results found</p>
                    <button class="btn btn-outline btn-sm" onclick="documentManager.clearSearch()">
                        <i class="fas fa-times"></i> Clear Search
                    </button>
                </div>
                <div class="search-results-list">
                    ${results.results?.map(result => this.renderSearchResult(result)).join('') || '<p>No results found</p>'}
                </div>
            </div>
        `;

        this.documentsContainer.innerHTML = resultsHTML;
    }

    renderSearchResult(result) {
        const documentId = result.document_id;
        const snippets = result.matching_chunks?.map(chunk =>
            `<div class="search-snippet">${this.escapeHtml(chunk.snippet)}</div>`
        ).join('') || '';

        return `
            <div class="search-result-item" data-document-id="${documentId}">
                <div class="search-result-header">
                    <h4 class="search-result-title" onclick="documentManager.openDocumentViewer('${documentId}')">
                        ${this.escapeHtml(result.display_name || result.filename)}
                    </h4>
                    <span class="search-result-score">Score: ${(result.relevance_score || 0).toFixed(2)}</span>
                </div>
                <div class="search-result-meta">
                    <span class="meta-item">
                        <i class="fas fa-file"></i> ${result.file_type?.toUpperCase() || 'Unknown'}
                    </span>
                    <span class="meta-item">
                        <i class="fas fa-calendar"></i> ${result.created_at ? new Date(result.created_at).toLocaleDateString() : 'Unknown'}
                    </span>
                    ${result.category ? `<span class="meta-item"><i class="fas fa-tag"></i> ${result.category}</span>` : ''}
                </div>
                <div class="search-result-snippets">
                    ${snippets}
                </div>
                <div class="search-result-actions">
                    <button class="btn btn-sm btn-primary" onclick="documentManager.openDocumentViewer('${documentId}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="documentManager.downloadDocument('${documentId}')">
                        <i class="fas fa-download"></i> Download
                    </button>
                </div>
            </div>
        `;
    }

    clearSearch() {
        this.loadDocuments(1);
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    async refreshDocuments() {
        console.log('📋 Refreshing documents...');
        this.documentCache.clear();
        await this.loadDocuments(this.currentPage);
    }

    updateStats() {
        // Update document count in stats
        const totalDocsElement = document.getElementById('totalDocs');
        if (totalDocsElement) {
            totalDocsElement.textContent = this.totalDocuments.toLocaleString();
        }

        // Dispatch event for other components
        document.dispatchEvent(new CustomEvent('documentsUpdated', {
            detail: {
                total: this.totalDocuments,
                current: this.documents.length
            }
        }));
    }

    getFileIcon(fileType) {
        const iconMap = {
            pdf: 'fas fa-file-pdf',
            doc: 'fas fa-file-word',
            docx: 'fas fa-file-word',
            txt: 'fas fa-file-text',
            md: 'fas fa-file-text',
            rtf: 'fas fa-file-text',
                        csv: 'fas fa-file-csv',
            xlsx: 'fas fa-file-excel',
            xls: 'fas fa-file-excel',
            pptx: 'fas fa-file-powerpoint',
            ppt: 'fas fa-file-powerpoint',
            json: 'fas fa-file-code',
            xml: 'fas fa-file-code',
            html: 'fas fa-file-code',
            htm: 'fas fa-file-code',
            jpg: 'fas fa-file-image',
            jpeg: 'fas fa-file-image',
            png: 'fas fa-file-image',
            gif: 'fas fa-file-image',
            bmp: 'fas fa-file-image',
            tiff: 'fas fa-file-image',
            tif: 'fas fa-file-image',
            webp: 'fas fa-file-image'
        };

        return iconMap[fileType?.toLowerCase()] || 'fas fa-file';
    }

    getStatusIcon(status) {
        const iconMap = {
            uploaded: 'fas fa-upload',
            processing: 'fas fa-sync fa-spin',
            completed: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            failed: 'fas fa-times-circle'
        };

        return iconMap[status] || 'fas fa-question-circle';
    }

    getProcessingStatusIcon(status) {
        const iconMap = {
            pending: 'fas fa-clock',
            processing: 'fas fa-sync fa-spin',
            completed: 'fas fa-check',
            failed: 'fas fa-times',
            completed_no_vectors: 'fas fa-check-circle'
        };

        return iconMap[status] || 'fas fa-question';
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
        div.textContent = text;
        return div.innerHTML;
    }

    // =====================================================
    // UI STATE MANAGEMENT METHODS
    // =====================================================

    showLoading() {
        if (this.documentsContainer) {
            this.documentsContainer.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">Loading documents...</div>
                </div>
            `;
        }
    }

    hideLoading() {
        // Loading state will be replaced by renderDocuments()
    }

    showError(message) {
        if (this.documentsContainer) {
            this.documentsContainer.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="error-message">
                        <h3>Error</h3>
                        <p>${this.escapeHtml(message)}</p>
                    </div>
                    <div class="error-actions">
                        <button class="btn btn-primary" onclick="documentManager.refreshDocuments()">
                            <i class="fas fa-retry"></i> Try Again
                        </button>
                    </div>
                </div>
            `;
        }

        // Also show toast notification
        if (window.showStatus) {
            window.showStatus(message, 'error');
        }
    }

    showSuccess(message) {
        if (window.showStatus) {
            window.showStatus(message, 'success');
        }
    }

    // =====================================================
    // ADVANCED FEATURES
    // =====================================================

    async getDocumentStats() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/documents/stats`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn('⚠️ Could not fetch document stats:', error);
        }

        return null;
    }

    async bulkAction(action, documentIds) {
        if (!documentIds || documentIds.length === 0) {
            this.showError('No documents selected');
            return;
        }

        const confirmMessage = `Are you sure you want to ${action} ${documentIds.length} document(s)?`;
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            console.log(`📋 Performing bulk ${action} on ${documentIds.length} documents`);

            const promises = documentIds.map(id => {
                switch (action) {
                    case 'delete':
                        return this.deleteDocument(id);
                    case 'reprocess':
                        return this.reprocessDocument(id);
                    default:
                        throw new Error(`Unknown action: ${action}`);
                }
            });

            await Promise.allSettled(promises);
            await this.refreshDocuments();

            this.showSuccess(`Bulk ${action} completed`);

        } catch (error) {
            console.error(`❌ Error performing bulk ${action}:`, error);
            this.showError(`Bulk ${action} failed: ${error.message}`);
        }
    }

    toggleDocumentSelection(documentId) {
        const element = document.querySelector(`[data-document-id="${documentId}"]`);
        if (!element) return;

        element.classList.toggle('selected');

        // Update bulk actions visibility
        this.updateBulkActionsVisibility();
    }

    selectAllDocuments() {
        const documentElements = document.querySelectorAll('[data-document-id]');
        documentElements.forEach(element => {
            element.classList.add('selected');
        });

        this.updateBulkActionsVisibility();
    }

    clearSelection() {
        const selectedElements = document.querySelectorAll('[data-document-id].selected');
        selectedElements.forEach(element => {
            element.classList.remove('selected');
        });

        this.updateBulkActionsVisibility();
    }

    getSelectedDocumentIds() {
        const selectedElements = document.querySelectorAll('[data-document-id].selected');
        return Array.from(selectedElements).map(element =>
            element.getAttribute('data-document-id')
        );
    }

    updateBulkActionsVisibility() {
        const selectedIds = this.getSelectedDocumentIds();
        const bulkActionsContainer = document.getElementById('bulkActionsContainer');

        if (bulkActionsContainer) {
            if (selectedIds.length > 0) {
                bulkActionsContainer.style.display = 'block';
                bulkActionsContainer.innerHTML = `
                    <div class="bulk-actions">
                        <span class="bulk-count">${selectedIds.length} selected</span>
                        <button class="btn btn-sm btn-outline" onclick="documentManager.bulkAction('reprocess', documentManager.getSelectedDocumentIds())">
                            <i class="fas fa-sync"></i> Reprocess
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="documentManager.bulkAction('delete', documentManager.getSelectedDocumentIds())">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                        <button class="btn btn-sm btn-ghost" onclick="documentManager.clearSelection()">
                            <i class="fas fa-times"></i> Clear
                        </button>
                    </div>
                `;
            } else {
                bulkActionsContainer.style.display = 'none';
            }
        }
    }

    // =====================================================
    // EXPORT AND IMPORT METHODS
    // =====================================================

    async exportDocumentsList() {
        try {
            const documents = this.documents.map(doc => ({
                id: doc.id,
                title: doc.title,
                filename: doc.filename,
                original_filename: doc.original_filename,
                file_type: doc.file_type,
                file_size: doc.file_size,
                category: doc.category,
                status: doc.status,
                processing_status: doc.processing_status,
                created_at: doc.created_at,
                word_count: doc.word_count,
                total_chunks: doc.total_chunks
            }));

            const exportData = {
                exported_at: new Date().toISOString(),
                total_documents: documents.length,
                documents: documents
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `documents_export_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showSuccess('Documents list exported successfully');

        } catch (error) {
            console.error('❌ Error exporting documents:', error);
            this.showError(`Failed to export documents: ${error.message}`);
        }
    }

    // =====================================================
    // CLEANUP AND UTILITIES
    // =====================================================

    cleanup() {
        console.log('🧹 Cleaning up document manager...');

        // Clear caches
        this.documentCache.clear();

        // Remove event listeners
        if (this.documentViewerModal) {
            this.documentViewerModal.removeEventListener('click', this.handleModalClick);
        }

        // Clean up any blob URLs
        const iframe = document.getElementById('documentViewerIframe');
        if (iframe && iframe.src && iframe.src.startsWith('blob:')) {
            URL.revokeObjectURL(iframe.src);
        }
    }

    // =====================================================
    // PUBLIC API METHODS
    // =====================================================

    async initialize() {
        console.log('🔄 Initializing DocumentManager...');
        await this.loadDocuments(1);
        console.log('✅ DocumentManager initialized');
    }

    getDocuments() {
        return [...this.documents];
    }

    getDocument(documentId) {
        return this.documentCache.get(documentId) ||
               this.documents.find(doc => (doc.id || doc.document_id) === documentId);
    }

    getCurrentPage() {
        return this.currentPage;
    }

    getTotalPages() {
        return this.totalPages;
    }

    getTotalDocuments() {
        return this.totalDocuments;
    }

    getFilters() {
        return { ...this.filters };
    }

    setFilters(filters) {
        this.filters = { ...this.filters, ...filters };
        this.loadDocuments(1);
    }

    isLoading() {
        return this.isLoading;
    }
}

// =====================================================
// GLOBAL FUNCTIONS FOR HTML ONCLICK HANDLERS
// =====================================================

window.openDocumentViewer = function(documentId) {
    if (window.documentManager) {
        window.documentManager.openDocumentViewer(documentId);
    }
};

window.deleteDocument = function(documentId) {
    if (window.documentManager) {
        window.documentManager.deleteDocument(documentId);
    }
};

window.downloadDocument = function(documentId) {
    if (window.documentManager) {
        window.documentManager.downloadDocument(documentId);
    }
};

window.reprocessDocument = function(documentId) {
    if (window.documentManager) {
        window.documentManager.reprocessDocument(documentId);
    }
};

window.refreshDocuments = function() {
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

window.selectAllDocuments = function() {
    if (window.documentManager) {
        window.documentManager.selectAllDocuments();
    }
};

window.clearDocumentSelection = function() {
    if (window.documentManager) {
        window.documentManager.clearSelection();
    }
};

// =====================================================
// CSS INJECTION FOR DOCUMENT STYLES
// =====================================================

const documentStyles = `
<style id="document-manager-styles">
/* Document Manager Styles */
.document-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.document-item {
    display: flex;
    align-items: center;
    padding: 1rem;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    transition: all 0.2s ease;
    cursor: pointer;
}

.document-item:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    border-color: #007bff;
}

.document-item.selected {
    background: #f0f8ff;
    border-color: #007bff;
}

.document-icon {
    font-size: 2rem;
    margin-right: 1rem;
    color: #6c757d;
    min-width: 60px;
    text-align: center;
}

.document-icon[data-type="pdf"] { color: #dc3545; }
.document-icon[data-type="doc"], .document-icon[data-type="docx"] { color: #2b579a; }
.document-icon[data-type="txt"], .document-icon[data-type="md"] { color: #6c757d; }
.document-icon[data-type="csv"], .document-icon[data-type="xlsx"] { color: #107c41; }
.document-icon[data-type="jpg"], .document-icon[data-type="png"] { color: #fd7e14; }

.document-info {
    flex: 1;
    min-width: 0;
}

.document-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: #212529;
    margin-bottom: 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.document-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.875rem;
    color: #6c757d;
}

.meta-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.document-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    margin: 0 1rem;
}

.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
}

.status-uploaded { background: #e3f2fd; color: #1976d2; }
.status-processing { background: #fff3e0; color: #f57c00; }
.status-completed { background: #e8f5e8; color: #2e7d32; }
.status-error, .status-failed { background: #ffebee; color: #d32f2f; }
.status-pending { background: #f3e5f5; color: #7b1fa2; }

.document-actions {
    display: flex;
    gap: 0.5rem;
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    border: 1px solid transparent;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
}

.btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
}

.btn-primary {
    background: #007bff;
    color: white;
    border-color: #007bff;
}

.btn-primary:hover {
    background: #0056b3;
    border-color: #0056b3;
}

.btn-outline {
    background: transparent;
    color: #007bff;
    border-color: #007bff;
}

.btn-outline:hover {
    background: #007bff;
    color: white;
}

.btn-ghost {
    background: transparent;
    color: #6c757d;
    border-color: transparent;
}

.btn-ghost:hover {
    background: #f8f9fa;
    color: #212529;
}

.btn-danger {
    background: #dc3545;
    color: white;
    border-color: #dc3545;
}

.btn-danger:hover {
    background: #c82333;
    border-color: #bd2130;
}

/* Modal Styles */
.modal {
    display: none;
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.5);
    backdrop-filter: blur(2px);
}

.modal.show {
    display: flex !important;
    align-items: center;
    justify-content: center;
}

.modal-content {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow: hidden;
    animation: modalSlideIn 0.3s ease-out;
}

.modal-large .modal-content {
    max-width: 1200px;
    width: 95%;
    height: 90vh;
}

@keyframes modalSlideIn {
    from {
        opacity: 0;
        transform: translateY(-50px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e9ecef;
    background: #f8f9fa;
}

.modal-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #212529;
}

.modal-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.modal-body {
    padding: 0;
    height: calc(90vh - 60px);
    overflow: auto;
}

.close {
    background: none;
    border: none;
    font-size: 1.5rem;
    font-weight: bold;
    color: #6c757d;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;
}

.close:hover {
    color: #000;
    background: #f8f9fa;
}

/* Document Viewer Styles */
#documentViewerContent {
    height: 100%;
    position: relative;
    background: #f8f9fa;
}

#documentViewerIframe {
    width: 100%;
    height: 100%;
    border: none;
    background: white;
}

.loading-container, .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 2rem;
    text-align: center;
}

.loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #007bff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.loading-text {
    color: #6c757d;
    font-size: 1rem;
}

.error-container {
    color: #dc3545;
}

.error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.error-text {
    font-size: 1.1rem;
    margin-bottom: 1.5rem;
}

/* Empty State */
.empty-state {
    text-align: center;
    padding: 3rem 2rem;
    color: #6c757d;
}

.empty-icon {
    font-size: 4rem;
    color: #dee2e6;
    margin-bottom: 1.5rem;
}

.empty-state h3 {
    color: #495057;
    margin-bottom: 1rem;
}

.empty-state p {
    font-size: 1rem;
    margin-bottom: 2rem;
    max-width: 400px;
    margin-left: auto;
    margin-right: auto;
}

.empty-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
}

/* Loading State */
.loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    text-align: center;
}

/* Error State */
.error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    text-align: center;
    color: #dc3545;
}

.error-state .error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.error-state h3 {
    color: #dc3545;
    margin-bottom: 1rem;
}

.error-actions {
    margin-top: 1.5rem;
}

/* Pagination */
.pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    margin: 2rem 0;
}

.pagination-btn {
    padding: 0.5rem 1rem;
    border: 1px solid #dee2e6;
    background: white;
    color: #007bff;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
}

.pagination-btn:hover {
    background: #e9ecef;
    border-color: #adb5bd;
}

.pagination-btn.active {
    background: #007bff;
    color: white;
    border-color: #007bff;
}

.pagination-ellipsis {
    padding: 0.5rem;
    color: #6c757d;
}

.pagination-info {
    text-align: center;
    color: #6c757d;
    font-size: 0.875rem;
    margin-top: 1rem;
}

/* Context Menu */
.context-menu {
    position: fixed;
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 1001;
    min-width: 150px;
    overflow: hidden;
}

.context-menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
    font-size: 0.875rem;
}

.context-menu-item:hover {
    background: #f8f9fa;
}

.context-menu-item.danger {
    color: #dc3545;
}

.context-menu-item.danger:hover {
    background: #f8d7da;
}

.context-menu-divider {
    height: 1px;
    background: #dee2e6;
    margin: 0.25rem 0;
}

/* Bulk Actions */
.bulk-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #e3f2fd;
    border: 1px solid #bbdefb;
    border-radius: 4px;
    margin-bottom: 1rem;
}

.bulk-count {
    font-weight: 500;
    color: #1976d2;
}

/* Search Results */
.search-results {
    padding: 1rem 0;
}

.search-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 4px;
    margin-bottom: 1rem;
}

.search-header h3 {
    margin: 0;
    color: #212529;
}

.search-header p {
    margin: 0;
    color: #6c757d;
    font-size: 0.875rem;
}

.search-results-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.search-result-item {
    padding: 1.5rem;
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    transition: all 0.2s ease;
}

.search-result-item:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    border-color: #007bff;
}

.search-result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
}

.search-result-title {
    margin: 0;
    font-size: 1.1rem;
    color: #007bff;
    cursor: pointer;
    text-decoration: none;
}

.search-result-title:hover {
    text-decoration: underline;
}

.search-result-score {
    font-size: 0.75rem;
    color: #6c757d;
    background: #f8f9fa;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
}

.search-result-meta {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
    color: #6c757d;
}

.search-result-snippets {
    margin-bottom: 1rem;
}

.search-snippet {
    background: #fff3cd;
    padding: 0.75rem;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    line-height: 1.5;
    border-left: 3px solid #ffc107;
}

.search-result-actions {
    display: flex;
    gap: 0.5rem;
}

/* Responsive Design */
@media (max-width: 768px) {
    .document-item {
        flex-direction: column;
        align-items: flex-start;
        gap: 1rem;
    }
    
    .document-icon {
        margin-right: 0;
        margin-bottom: 0.5rem;
    }
    
    .document-meta {
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .document-actions {
        width: 100%;
        justify-content: center;
    }
    
    .modal-content {
        width: 95%;
        margin: 1rem;
    }
    
    .modal-large .modal-content {
        width: 98%;
        height: 95vh;
    }
    
    .search-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 1rem;
    }
    
    .search-result-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
    }
    
    .empty-actions {
        flex-direction: column;
        align-items: center;
    }
    
    .bulk-actions {
        flex-wrap: wrap;
        gap: 0.5rem;
    }
}

/* Dark Theme Support */
.theme-dark .document-item {
    background: #2d2d2d;
    border-color: #404040;
    color: #ffffff;
}

.theme-dark .document-item:hover {
    border-color: #007bff;
        box-shadow: 0 2px 8px rgba(255,255,255,0.1);
}

.theme-dark .document-title {
    color: #ffffff;
}

.theme-dark .modal-content {
    background: #2d2d2d;
    color: #ffffff;
}

.theme-dark .modal-header {
    background: #333333;
    border-bottom-color: #404040;
}

.theme-dark .btn-outline {
    color: #ffffff;
    border-color: #404040;
}

.theme-dark .btn-outline:hover {
    background: #404040;
    color: #ffffff;
}

.theme-dark .btn-ghost {
    color: #cccccc;
}

.theme-dark .btn-ghost:hover {
    background: #404040;
    color: #ffffff;
}

.theme-dark .empty-state {
    color: #cccccc;
}

.theme-dark .empty-state h3 {
    color: #ffffff;
}

.theme-dark .loading-state {
    color: #cccccc;
}

.theme-dark .error-state {
    color: #ff6b6b;
}

.theme-dark .search-result-item {
    background: #2d2d2d;
    border-color: #404040;
    color: #ffffff;
}

.theme-dark .search-snippet {
    background: #3d3d00;
    border-left-color: #ffeb3b;
}

.theme-dark .context-menu {
    background: #2d2d2d;
    border-color: #404040;
    color: #ffffff;
}

.theme-dark .context-menu-item:hover {
    background: #404040;
}

.theme-dark .pagination-btn {
    background: #2d2d2d;
    border-color: #404040;
    color: #ffffff;
}

.theme-dark .pagination-btn:hover {
    background: #404040;
}

.theme-dark .bulk-actions {
    background: #1a2332;
    border-color: #2d4a6b;
}

.theme-dark .search-header {
    background: #333333;
    color: #ffffff;
}

.theme-dark #documentViewerContent {
    background: #1a1a1a;
}

/* Print Styles */
@media print {
    .document-actions,
    .btn,
    .modal-header,
    .context-menu,
    .bulk-actions {
        display: none !important;
    }
    
    .document-item {
        border: 1px solid #000;
        margin-bottom: 1rem;
        break-inside: avoid;
    }
    
    .modal-content {
        box-shadow: none;
        border: 1px solid #000;
    }
}

/* Accessibility Improvements */
.btn:focus,
.pagination-btn:focus,
.context-menu-item:focus {
    outline: 2px solid #007bff;
    outline-offset: 2px;
}

.document-item:focus-within {
    outline: 2px solid #007bff;
    outline-offset: 2px;
}

/* Animation Classes */
.fade-in {
    animation: fadeIn 0.3s ease-in;
}

.fade-out {
    animation: fadeOut 0.3s ease-out;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
}

.slide-up {
    animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
    from {
        transform: translateY(20px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

/* Scrollbar Styling */
.modal-body::-webkit-scrollbar,
#documentViewerContent::-webkit-scrollbar {
    width: 6px;
}

.modal-body::-webkit-scrollbar-track,
#documentViewerContent::-webkit-scrollbar-track {
    background: #f1f1f1;
}

.modal-body::-webkit-scrollbar-thumb,
#documentViewerContent::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 3px;
}

.modal-body::-webkit-scrollbar-thumb:hover,
#documentViewerContent::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
}

.theme-dark .modal-body::-webkit-scrollbar-track,
.theme-dark #documentViewerContent::-webkit-scrollbar-track {
    background: #2d2d2d;
}

.theme-dark .modal-body::-webkit-scrollbar-thumb,
.theme-dark #documentViewerContent::-webkit-scrollbar-thumb {
    background: #555555;
}

.theme-dark .modal-body::-webkit-scrollbar-thumb:hover,
.theme-dark #documentViewerContent::-webkit-scrollbar-thumb:hover {
    background: #777777;
}
</style>
`;

// =====================================================
// INITIALIZATION AND MODULE COMPLETION
// =====================================================

// Inject CSS if not already present
function ensureDocumentStyles() {
    if (!document.getElementById('document-manager-styles')) {
        document.head.insertAdjacentHTML('beforeend', documentStyles);
    }
}

// Create document viewer modal if it doesn't exist
function createDocumentViewerModal() {
    if (document.getElementById('documentViewerModal')) {
        return; // Already exists
    }

    const modalHTML = `
        <div id="documentViewerModal" class="modal modal-large">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="documentViewerTitle">Document Viewer</h3>
                    <div class="modal-actions">
                        <button id="printDocumentBtn" class="btn btn-sm btn-outline" title="Print Document">
                            <i class="fas fa-print"></i>
                        </button>
                        <button id="downloadFromViewerBtn" class="btn btn-sm btn-outline" title="Download Document">
                            <i class="fas fa-download"></i>
                        </button>
                        <button id="closeDocumentViewer" class="close" title="Close Viewer">&times;</button>
                    </div>
                </div>
                <div class="modal-body">
                    <div id="documentViewerContent">
                        <!-- Loading State -->
                        <div id="documentViewerLoading" class="loading-container" style="display: none;">
                            <div class="loading-spinner"></div>
                            <div class="loading-text">Loading document...</div>
                        </div>
                        
                        <!-- Error State -->
                        <div id="documentViewerError" class="error-container" style="display: none;">
                            <div class="error-icon">
                                <i class="fas fa-exclamation-triangle"></i>
                            </div>
                            <div id="documentViewerErrorText" class="error-text">
                                Failed to load document
                            </div>
                            <button class="btn btn-primary" onclick="window.documentManager?.retryLoadDocument()">
                                <i class="fas fa-redo"></i> Try Again
                            </button>
                        </div>
                        
                        <!-- PDF Viewer -->
                        <iframe id="documentViewerIframe" style="display: none;"></iframe>
                        
                        <!-- Text Container (ADDED) -->
                        <div id="documentTextContainer" style="display: none; padding: 1rem; background: white; height: 100%; overflow-y: auto;"></div>
                        
                        <!-- Image Container -->
                        <div id="documentImageContainer" style="display: none;"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    setupDocumentViewerEventListeners();
}

function setupDocumentViewerEventListeners() {
    const modal = document.getElementById('documentViewerModal');
    const closeBtn = document.getElementById('closeDocumentViewer');
    const printBtn = document.getElementById('printDocumentBtn');
    const downloadBtn = document.getElementById('downloadFromViewerBtn');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (window.documentManager) {
                window.documentManager.closeDocumentViewerModal();
            }
        });
    }

    if (printBtn) {
        printBtn.addEventListener('click', () => {
            if (window.documentManager) {
                window.documentManager.printDocument();
            }
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (window.documentManager && window.documentManager.currentViewDocument) {
                const docId = window.documentManager.currentViewDocument.id || 
                            window.documentManager.currentViewDocument.document_id;
                window.documentManager.downloadDocument(docId);
            }
        });
    }

    if (modal) {
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal && window.documentManager) {
                window.documentManager.closeDocumentViewerModal();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block' && window.documentManager) {
                window.documentManager.closeDocumentViewerModal();
            }
        });
    }
}

// Enhanced DocumentManager prototype methods for better functionality
DocumentManager.prototype.ensureCSSLoaded = function() {
    ensureDocumentStyles();
};

DocumentManager.prototype.createDocumentViewerModal = function() {
    createDocumentViewerModal();
    this.setupElements(); // Re-setup elements after creation
};

// Event listeners for when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    ensureDocumentStyles();
    createDocumentViewerModal();
});

// Auto-initialization when DocumentManager class is instantiated
const originalDocumentManagerInit = DocumentManager.prototype.init;
DocumentManager.prototype.init = function() {
    ensureDocumentStyles();
    this.createDocumentViewerModal();
    return originalDocumentManagerInit.call(this);
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DocumentManager;
}

// AMD support
if (typeof define === 'function' && define.amd) {
    define([], function() {
        return DocumentManager;
    });
}

// Global registration
window.DocumentManager = DocumentManager;

console.log('📋 DocumentManager class loaded and ready');


