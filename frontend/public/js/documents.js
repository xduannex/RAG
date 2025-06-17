// RAG Chat Application - Document Management
// Handles document loading, display, and management

class DocumentManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
        this.documents = [];
        this.selectedDocumentId = null;
        this.isLoading = false;
        this.highlightText = null; // Store text to highlight
        this.init();
    }

    init() {
        console.log('Initializing Document Manager...');
        this.setupEventListeners();

        // Register this manager globally
        if (window.RAG_MANAGERS) {
            window.RAG_MANAGERS.register('documentManager', this);
        } else {
            window.documentManager = this;
        }

        console.log('Document manager initialized');
    }

    setupEventListeners() {
        // Document-specific event listeners can go here
    }

    async loadDocuments() {
        if (this.isLoading) {
            console.log('Documents already loading, skipping...');
            return;
        }

        const documentList = document.getElementById('documentList');
        if (!documentList) {
            console.warn('Document list element not found');
            return;
        }

        this.isLoading = true;

        try {
            console.log('Loading documents...');

            // Show loading state
            documentList.innerHTML = '<div class="loading"><div class="loading-spinner"></div> Loading documents...</div>';

            // Try the primary endpoint first
            let response = await fetch(`${this.apiBaseUrl}/pdf/list`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            // If primary endpoint fails, try the alternative
            if (!response.ok) {
                console.warn('Primary endpoint failed, trying alternative...');
                response = await fetch(`${this.apiBaseUrl}/api/documents`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
            }

            if (!response.ok) {
                throw new Error(`Failed to load documents: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Documents API response:', data);

            // Handle different possible response structures
            let documents = [];
            if (Array.isArray(data)) {
                documents = data;
            } else if (data.documents && Array.isArray(data.documents)) {
                documents = data.documents;
            } else if (data.pdfs && Array.isArray(data.pdfs)) {
                documents = data.pdfs;
            } else if (data.results && Array.isArray(data.results)) {
                documents = data.results;
            }

            console.log('Processed documents:', documents);
            this.documents = documents;
            this.displayDocuments(documents);

            // Show success message only if we have documents
            if (documents.length > 0) {
                if (window.showStatus) {
                    window.showStatus(`Loaded ${documents.length} documents successfully`, 'success', 3000);
                }
            }

        } catch (error) {
            console.error('Failed to load documents:', error);
            documentList.innerHTML = '<div class="loading">Failed to load documents</div>';
            if (window.showStatus) {
                window.showStatus('Failed to load documents: ' + error.message, 'error');
            }
        } finally {
            this.isLoading = false;
        }
    }

    displayDocuments(documents) {
        const documentList = document.getElementById('documentList');
        if (!documentList) return;

        try {
            if (!documents || !Array.isArray(documents) || documents.length === 0) {
                documentList.innerHTML = '<div class="text-center text-muted">No documents uploaded yet</div>';
                return;
            }

            console.log(`Displaying ${documents.length} documents`);

            documentList.innerHTML = documents.map(doc => {
                // Safely extract document properties with better fallbacks
                const docId = this.escapeHtml(String(doc.id || doc._id || ''));

                // Use the correct filename - prioritize 'filename' (final renamed) over 'original_filename'
                const displayFilename = this.escapeHtml(String(doc.filename || doc.original_filename || doc.name || 'Unknown'));
                const originalFilename = this.escapeHtml(String(doc.original_filename || doc.filename || doc.name || 'Unknown'));

                // Show both names if they're different (file was renamed)
                const filenameDisplay = doc.filename !== doc.original_filename && doc.original_filename ?
                    `${displayFilename} <small class="text-muted">(was: ${originalFilename})</small>` :
                    displayFilename;

                const title = this.escapeHtml(String(doc.title || doc.filename || doc.original_filename || doc.name || 'Unknown'));
                const category = this.escapeHtml(String(doc.category || 'Uncategorized'));
                const status = this.escapeHtml(String(doc.status || doc.processing_status || 'unknown'));

                return `
                <div class="pdf-item" data-doc-id="${docId}" onclick="window.documentManager.selectDocument('${docId}', '${displayFilename}')">
                    <div class="pdf-icon">
                        <i class="fas fa-file-${this.getFileIcon(doc.file_type || 'unknown')}"></i>
                    </div>
                    <div class="pdf-info">
                        <div class="pdf-title">${title}</div>
                        <div class="pdf-filename">${filenameDisplay}</div>
                        <div class="pdf-meta">
                            <span>${category}</span>
                            <span>${this.formatFileSize(doc.file_size || doc.size || 0)}</span>
                            <span>${this.formatTimestamp(doc.created_at || doc.upload_date)}</span>
                            ${doc.was_renamed ? '<span class="badge badge-info">Renamed</span>' : ''}
                        </div>
                    </div>
                    <div class="pdf-status">
                        <span class="status-badge status-${status.toLowerCase()}">${status}</span>
                    </div>
                    <div class="pdf-actions">
                        <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); window.documentManager.openDocumentViewer('${docId}')" title="View Document">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); window.documentManager.downloadDocument('${docId}', '${displayFilename}')" title="Download Document">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); window.documentManager.deleteDocument('${docId}')" title="Delete Document">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>`;
            }).join('');

            console.log('Documents displayed successfully');
        } catch (error) {
            console.error('Error displaying documents:', error);
            documentList.innerHTML = '<div class="loading">Error displaying documents</div>';
        }
    }

    selectDocument(docId, filename) {
        try {
            this.selectedDocumentId = docId;
            console.log('Selected document:', filename, 'ID:', docId);

            // Visual feedback
            document.querySelectorAll('.pdf-item').forEach(item => {
                item.classList.remove('selected');
            });

            // Find the clicked element using data attribute
            const clickedElement = document.querySelector(`[data-doc-id="${docId}"]`);
            if (clickedElement) {
                clickedElement.classList.add('selected');
            }

            if (window.showStatus) {
                window.showStatus('Selected document: ' + filename, 'info');
            }
        } catch (error) {
            console.error('Error selecting document:', error);
        }
    }

    async deleteDocument(docId) {
        if (!confirm('Are you sure you want to delete this document?')) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/pdf/${docId}`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Failed to delete document: ${response.statusText} - ${errorData.detail || ''}`);
            }

            if (window.showStatus) {
                window.showStatus('Document deleted successfully', 'success');
            }

            await this.loadDocuments();

            // Reload stats if available
            if (window.loadStats) {
                await window.loadStats();
            }

        } catch (error) {
            console.error('Delete error:', error);
            if (window.showStatus) {
                window.showStatus('Failed to delete document: ' + error.message, 'error');
            }
        }
    }

    async downloadDocument(docId, filename) {
        try {
            console.log('Downloading document:', docId, filename);

            if (window.showStatus) {
                window.showStatus('Preparing download...', 'info');
            }

            // Use the correct download endpoint from your backend
            const downloadUrl = `${this.apiBaseUrl}/api/documents/${docId}/download`;

            console.log('Trying download URL:', downloadUrl);

            const response = await fetch(downloadUrl, {
                method: 'GET',
                headers: {
                    'Accept': '*/*'
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const downloadObjectUrl = window.URL.createObjectURL(blob);

                // Get the actual filename from response headers if available
                const contentDisposition = response.headers.get('Content-Disposition');
                let actualFilename = filename;

                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                    if (filenameMatch && filenameMatch[1]) {
                        actualFilename = filenameMatch[1].replace(/['"]/g, '');
                    }
                }

                // Create download link
                const link = document.createElement('a');
                link.href = downloadObjectUrl;
                link.download = actualFilename || `document_${docId}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // Clean up
                window.URL.revokeObjectURL(downloadObjectUrl);

                if (window.showStatus) {
                    window.showStatus(`Download started: ${actualFilename}`, 'success');
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Download failed: ${response.statusText} - ${errorData.detail || ''}`);
            }

        } catch (error) {
            console.error('Download error:', error);
            if (window.showStatus) {
                window.showStatus('Failed to download document: ' + error.message, 'error');
            }
        }
    }

    openDocumentViewer(docIdOrSource, highlightText = null) {
        try {
            console.log('openDocumentViewer called with:', docIdOrSource, 'highlight:', highlightText);

            // Store highlight text for later use
            this.highlightText = highlightText;

            // Handle both source objects and direct document IDs
            let docId, docTitle, sourceContent;

            if (typeof docIdOrSource === 'object' && docIdOrSource !== null) {
                // It's a source object from search results
                console.log('Processing source object:', docIdOrSource);

                // Try multiple possible field names for document ID
                docId = docIdOrSource.document_id ||
                       docIdOrSource.id ||
                       docIdOrSource.doc_id ||
                       docIdOrSource.file_id ||
                       docIdOrSource.pdf_id ||
                       docIdOrSource.chunk_id;

                docTitle = docIdOrSource.title ||
                          docIdOrSource.filename ||
                          docIdOrSource.original_filename ||
                          docIdOrSource.name ||
                          'Document';

                // Extract content for highlighting
                sourceContent = docIdOrSource.content || docIdOrSource.text || null;
                if (sourceContent && !this.highlightText) {
                    this.highlightText = sourceContent.substring(0, 100); // First 100 chars for highlighting
                }

                console.log('Extracted docId:', docId, 'docTitle:', docTitle);
            } else {
                // It's a direct document ID or chunk ID
                docId = docIdOrSource;
                docTitle = 'Document';
                console.log('Using direct docId:', docId);
            }

            if (!docId) {
                console.error('No document ID found in:', docIdOrSource);
                if (window.showStatus) {
                    window.showStatus('Cannot open document: No document ID found', 'error');
                }
                return;
            }

            // Convert to string and validate
            docId = String(docId);
            if (docId === 'undefined' || docId === 'null' || docId === '') {
                console.error('Invalid document ID:', docId);
                if (window.showStatus) {
                    window.showStatus('Cannot open document: Invalid document ID', 'error');
                }
                return;
            }

            console.log('Opening document viewer for ID:', docId);

            const modal = document.getElementById('documentViewerModal');
            if (!modal) {
                console.error('Document viewer modal not found');
                if (window.showStatus) {
                    window.showStatus('Document viewer not available', 'error');
                }
                return;
            }

            const modalTitle = modal.querySelector('.modal-title');
            const modalBody = modal.querySelector('.modal-body');

            // Update title to indicate if this is from a search result
            const titleText = docId.includes('_chunk_') ?
                `Viewing Document (from search result): ${docTitle}` :
                `Viewing: ${docTitle}`;

            if (modalTitle) modalTitle.textContent = titleText;
            if (modalBody) modalBody.innerHTML = '<div class="loading"><div class="loading-spinner"></div> Loading document...</div>';

            modal.style.display = 'flex';

            // Load document content
            this.loadDocumentContent(docId, modalBody);
        } catch (error) {
            console.error('Error opening document viewer:', error);
            if (window.showStatus) {
                window.showStatus('Failed to open document viewer: ' + error.message, 'error');
            }
        }
    }

    async loadDocumentContent(docId, container) {
    if (!container) return;

    console.log('Loading document content for ID:', docId);

    try {
        let endpoint;
        let actualDocId = docId;

        // Check if this is a chunk ID and extract the document ID
        if (typeof docId === 'string' && docId.includes('_chunk_')) {
            console.log('Detected chunk ID:', docId);
            actualDocId = this.extractDocumentIdFromChunk(docId);

            if (!actualDocId) {
                throw new Error(`Could not extract document ID from chunk: ${docId}`);
            }

            console.log('Using extracted document ID:', actualDocId);
        }

        // Convert to integer for the API call
        const documentId = parseInt(actualDocId, 10);
        if (isNaN(documentId) || documentId <= 0) {
            throw new Error(`Invalid document ID: "${actualDocId}" cannot be converted to a positive integer`);
        }

        endpoint = `${this.apiBaseUrl}/api/documents/${documentId}/view`;
        console.log(`Attempting to fetch: ${endpoint}`);

        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                console.error('Error response data:', errorData);
                if (errorData.detail) {
                    errorDetail += ` - ${errorData.detail}`;
                }
            } catch (jsonError) {
                const textError = await response.text();
                console.error('Error response text:', textError);
                if (textError) {
                    errorDetail += ` - ${textError}`;
                }
            }
            throw new Error(errorDetail);
        }

        const data = await response.json();
        console.log('Document data received:', data);

        // Use the original docId for UI element IDs (to maintain consistency)
        // but use the actual document ID for API calls
        const uiId = docId;
        const fileType = (data.file_type || 'unknown').toLowerCase();
        let contentHtml = '';

        switch (fileType) {
            case 'pdf':
                contentHtml = this.renderPdfContent(data, uiId, data.filename, documentId);
                break;
            case 'docx':
            case 'doc':
                contentHtml = this.renderDocxContent(data, uiId, data.filename, documentId);
                break;
            case 'xlsx':
            case 'xls':
                contentHtml = this.renderExcelContent(data, uiId, data.filename, documentId);
                break;
            case 'txt':
                contentHtml = this.renderTextContent(data, uiId, data.filename, documentId);
                break;
            default:
                contentHtml = this.renderGenericContent(data, uiId, data.filename, documentId);
                break;
        }

        container.innerHTML = `
            <div class="document-content">
                <div class="document-header mb-3">
                    <h5>${this.escapeHtml(data.title || data.filename || 'Document')}</h5>
                    <div class="document-meta text-muted">
                        <small>
                            Type: ${fileType.toUpperCase()} | 
                            Words: ${(data.word_count || 0).toLocaleString()} | 
                            ${data.total_pages ? `Pages: ${data.total_pages} | ` : ''}
                            Size: ${this.formatFileSize(data.file_size || 0)}
                            ${docId !== documentId ? ` | Chunk: ${docId}` : ''}
                        </small>
                    </div>
                </div>
                ${contentHtml}
            </div>
        `;

    } catch (error) {
        console.error('Failed to load document content:', error);
        console.error('Original Document ID was:', docId);

        container.innerHTML = `
            <div class="text-center text-danger">
                <i class="fas fa-exclamation-triangle"></i>
                <h5>Failed to load document content</h5>
                <p><strong>Error:</strong> ${error.message}</p>
                <p><strong>Document ID:</strong> ${docId}</p>
                <div class="mt-3">
                    <button class="btn btn-primary" onclick="window.documentManager.downloadDocument('${docId}')">
                        <i class="fas fa-download"></i> Download Document
                    </button>
                </div>
                <small class="text-muted">Check the browser console for more details</small>
            </div>
        `;
    }
}

    renderPdfContent(data, documentId, filename) {
        const pdfUrl = `${this.apiBaseUrl}/api/documents/${documentId}/pdf`;

        return `
            <div class="pdf-viewer-container">
                <div class="pdf-viewer-toolbar mb-2">
                    <small class="text-muted">
                        <i class="fas fa-info-circle"></i>
                        PDF documents are displayed using your browser's built-in PDF viewer.
                        If the PDF doesn't display, please download it to view.
                    </small>
                </div>
                <div class="pdf-embed-container" style="height: 600px; border: 1px solid #ddd; border-radius: 4px;">
                    <iframe 
                        src="${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1" 
                        width="100%" 
                        height="100%" 
                        style="border: none;"
                        title="PDF Document Viewer">
                        <p>Your browser does not support PDF viewing. 
                           <a href="${pdfUrl}" target="_blank">Click here to download the PDF</a>
                        </p>
                    </iframe>
                </div>
                <div class="pdf-fallback mt-3">
                    <h6>Document Text Content:</h6>
                    <div class="document-text-content" style="max-height: 400px; overflow-y: auto; background: #f8f9fa; padding: 15px; border-radius: 4px;">
                        ${this.formatDocumentContent(data.content)}
                    </div>
                </div>
            </div>
        `;
    }

    renderDocxContent(data, uiId, filename, actualDocId = null) {
    const docId = actualDocId || this.extractDocumentIdFromChunk(uiId) || uiId;
    const downloadUrl = `${this.apiBaseUrl}/api/documents/${docId}/download`;
    const pdfViewUrl = `${this.apiBaseUrl}/api/documents/${docId}/view-as-pdf`;

    return `
        <div class="docx-viewer-container">
            <div class="document-viewer-options mb-3">
                <div class="btn-group" role="group">
                    <button class="btn btn-primary" id="viewAsPdf-${uiId}" onclick="window.documentManager.showPdfView('${uiId}')">
                        <i class="fas fa-file-pdf"></i> View as PDF
                    </button>
                    <button class="btn btn-outline-secondary" onclick="window.documentManager.showTextView('${uiId}')">
                        <i class="fas fa-file-text"></i> View Text
                    </button>
                    <button class="btn btn-outline-primary" onclick="window.documentManager.downloadDocument('${docId}', '${filename}')">
                        <i class="fas fa-download"></i> Download Original
                    </button>
                </div>
            </div>

            <div id="pdfView-${uiId}" class="pdf-view-container" style="display: none;">
                <div class="alert alert-info mb-3">
                    <i class="fas fa-info-circle"></i>
                    <strong>PDF Conversion:</strong> This document has been converted to PDF for easier viewing.
                    <button class="btn btn-sm btn-outline-primary float-right" onclick="window.open('${pdfViewUrl}', '_blank')">
                        <i class="fas fa-external-link-alt"></i> Open in New Tab
                    </button>
                </div>
                <div class="pdf-embed-container" style="height: 600px; border: 1px solid #ddd; border-radius: 4px;">
                    <iframe 
                        id="pdfIframe-${uiId}"
                        width="100%" 
                        height="100%" 
                        style="border: none;"
                        title="Converted PDF Viewer">
                    </iframe>
                    <div id="pdfLoading-${uiId}" class="pdf-loading text-center" style="padding: 50px;">
                        <div class="spinner-border text-primary" role="status">
                            <span class="sr-only">Converting to PDF...</span>
                        </div>
                        <p class="mt-2">Converting document to PDF for viewing...</p>
                    </div>
                </div>
            </div>

            <div id="textView-${uiId}" class="text-view-container">
                <div class="alert alert-warning mb-3">
                    <i class="fas fa-info-circle"></i>
                    <strong>Word Document:</strong> DOCX files cannot be displayed inline in browsers. 
                    You can view it as PDF above or see the extracted text content below.
                </div>
                <div class="document-text-content" style="background: #f8f9fa; padding: 20px; border-radius: 4px; line-height: 1.6; max-height: 600px; overflow-y: auto;">
                    ${this.formatDocumentContent(data.content)}
                </div>
            </div>
        </div>
    `;
}

    renderExcelContent(data, documentId, filename) {
        const downloadUrl = `${this.apiBaseUrl}/api/documents/${documentId}/download`;
        const pdfViewUrl = `${this.apiBaseUrl}/api/documents/${documentId}/view-as-pdf`;

        return `
            <div class="excel-viewer-container">
                <div class="document-viewer-options mb-3">
                    <div class="btn-group" role="group">
                        <button class="btn btn-primary" id="viewAsPdf-${documentId}" onclick="window.documentManager.showPdfView('${documentId}')">
                            <i class="fas fa-file-pdf"></i> View as PDF
                        </button>
                        <button class="btn btn-outline-secondary" onclick="window.documentManager.showTextView('${documentId}')">
                            <i class="fas fa-table"></i> View Data
                        </button>
                        <button class="btn btn-outline-primary" onclick="window.documentManager.downloadDocument('${documentId}', '${filename}')">
                            <i class="fas fa-download"></i> Download Original
                        </button>
                    </div>
                </div>

                <div id="pdfView-${documentId}" class="pdf-view-container" style="display: none;">
                    <div class="alert alert-info mb-3">
                        <i class="fas fa-info-circle"></i>
                        <strong>PDF Conversion:</strong> This Excel file has been converted to PDF for easier viewing.
                        <button class="btn btn-sm btn-outline-primary float-right" onclick="window.open('${pdfViewUrl}', '_blank')">
                            <i class="fas fa-external-link-alt"></i> Open in New Tab
                        </button>
                    </div>
                    <div class="pdf-embed-container" style="height: 600px; border: 1px solid #ddd; border-radius: 4px;">
                        <iframe 
                            id="pdfIframe-${documentId}"
                            width="100%" 
                            height="100%" 
                            style="border: none;"
                            title="Converted PDF Viewer">
                        </iframe>
                        <div id="pdfLoading-${documentId}" class="pdf-loading text-center" style="padding: 50px;">
                            <div class="spinner-border text-primary" role="status">
                                <span class="sr-only">Converting to PDF...</span>
                            </div>
                            <p class="mt-2">Converting Excel file to PDF for viewing...</p>
                        </div>
                    </div>
                </div>

                <div id="textView-${documentId}" class="text-view-container">
                    <div class="alert alert-warning mb-3">
                        <i class="fas fa-info-circle"></i>
                        <strong>Excel Document:</strong> Excel files cannot be displayed inline in browsers. 
                        You can view it as PDF above or see the extracted data below.
                    </div>
                    <div class="document-text-content" style="background: #f8f9fa; padding: 20px; border-radius: 4px; line-height: 1.6; max-height: 600px; overflow-y: auto;">
                        ${this.formatDocumentContent(data.content)}
                    </div>
                </div>
            </div>
        `;
    }

    renderTextContent(data, documentId, filename) {
        const downloadUrl = `${this.apiBaseUrl}/api/documents/${documentId}/download`;
        const pdfViewUrl = `${this.apiBaseUrl}/api/documents/${documentId}/view-as-pdf`;

        return `
            <div class="text-viewer-container">
                <div class="document-viewer-options mb-3">
                    <div class="btn-group" role="group">
                        <button class="btn btn-primary" id="viewAsPdf-${documentId}" onclick="window.documentManager.showPdfView('${documentId}')">
                            <i class="fas fa-file-pdf"></i> View as PDF
                        </button>
                        <button class="btn btn-outline-secondary" onclick="window.documentManager.showTextView('${documentId}')">
                            <i class="fas fa-file-text"></i> View Text
                        </button>
                        <button class="btn btn-outline-primary" onclick="window.documentManager.downloadDocument('${documentId}', '${filename}')">
                            <i class="fas fa-download"></i> Download Original
                        </button>
                    </div>
                </div>

                <div id="pdfView-${documentId}" class="pdf-view-container" style="display: none;">
                    <div class="alert alert-info mb-3">
                        <i class="fas fa-info-circle"></i>
                        <strong>PDF Conversion:</strong> This text file has been converted to PDF for easier viewing and printing.
                        <button class="btn btn-sm btn-outline-primary float-right" onclick="window.open('${pdfViewUrl}', '_blank')">
                            <i class="fas fa-external-link-alt"></i> Open in New Tab
                        </button>
                    </div>
                    <div class="pdf-embed-container" style="height: 600px; border: 1px solid #ddd; border-radius: 4px;">
                        <iframe 
                            id="pdfIframe-${documentId}"
                            width="100%" 
                            height="100%" 
                            style="border: none;"
                            title="Converted PDF Viewer">
                        </iframe>
                        <div id="pdfLoading-${documentId}" class="pdf-loading text-center" style="padding: 50px;">
                            <div class="spinner-border text-primary" role="status">
                                <span class="sr-only">Converting to PDF...</span>
                            </div>
                            <p class="mt-2">Converting text file to PDF for viewing...</p>
                        </div>
                    </div>
                </div>

                <div id="textView-${documentId}" class="text-view-container">
                    <div class="document-text-content" style="background: #f8f9fa; padding: 20px; border-radius: 4px; line-height: 1.6; max-height: 600px; overflow-y: auto; font-family: 'Courier New', monospace; white-space: pre-wrap;">
                        ${this.escapeHtml(data.content)}
                    </div>
                </div>
            </div>
        `;
    }

        renderGenericContent(data, documentId, filename) {
        const downloadUrl = `${this.apiBaseUrl}/api/documents/${documentId}/download`;

        return `
            <div class="generic-viewer-container">
                <div class="alert alert-info mb-3">
                    <i class="fas fa-info-circle"></i>
                    <strong>Document Preview:</strong> This file type cannot be displayed inline in browsers. 
                    You can download the original file or view the extracted text content below.
                </div>
                <div class="document-viewer-options mb-3">
                    <div class="btn-group" role="group">
                        <button class="btn btn-primary" onclick="window.documentManager.downloadDocument('${documentId}', '${filename}')">
                            <i class="fas fa-download"></i> Download Original
                        </button>
                        <button class="btn btn-outline-secondary" onclick="window.open('${downloadUrl}', '_blank')">
                            <i class="fas fa-external-link-alt"></i> Open in New Tab
                        </button>
                    </div>
                </div>
                <div class="document-text-content" style="background: #f8f9fa; padding: 20px; border-radius: 4px; line-height: 1.6; max-height: 600px; overflow-y: auto;">
                    ${this.formatDocumentContent(data.content)}
                </div>
            </div>
        `;
    }

    showPdfView(documentId) {
    try {
        // Extract actual document ID if this is a chunk ID
        const actualDocId = this.extractDocumentIdFromChunk(documentId) || documentId;

        const pdfView = document.getElementById(`pdfView-${documentId}`);
        const textView = document.getElementById(`textView-${documentId}`);
        const pdfIframe = document.getElementById(`pdfIframe-${documentId}`);
        const pdfLoading = document.getElementById(`pdfLoading-${documentId}`);

        if (!pdfView || !textView) {
            console.error('View containers not found');
            return;
        }

        textView.style.display = 'none';
        pdfView.style.display = 'block';

        if (pdfLoading) pdfLoading.style.display = 'block';
        if (pdfIframe) pdfIframe.style.display = 'none';

        // Use the actual document ID for the PDF conversion endpoint
        const pdfViewUrl = `${this.apiBaseUrl}/api/documents/${actualDocId}/view-as-pdf`;

        console.log('PDF view URL:', pdfViewUrl);

        if (pdfIframe) {
            pdfIframe.onload = () => {
                if (pdfLoading) pdfLoading.style.display = 'none';
                pdfIframe.style.display = 'block';
                console.log('PDF conversion loaded successfully');
            };

            pdfIframe.onerror = () => {
                if (pdfLoading) pdfLoading.style.display = 'none';
                this.showPdfError(documentId, 'Failed to load converted PDF');
            };

            pdfIframe.src = pdfViewUrl + '#toolbar=1&navpanes=1&scrollbar=1&view=FitH';
        }

        this.updateViewButtons(documentId, 'pdf');

    } catch (error) {
        console.error('Error showing PDF view:', error);
        this.showPdfError(documentId, 'Error loading PDF view: ' + error.message);
    }
}

    showTextView(documentId) {
        try {
            const pdfView = document.getElementById(`pdfView-${documentId}`);
            const textView = document.getElementById(`textView-${documentId}`);

            if (!pdfView || !textView) {
                console.error('View containers not found');
                return;
            }

            pdfView.style.display = 'none';
            textView.style.display = 'block';

            this.updateViewButtons(documentId, 'text');

        } catch (error) {
            console.error('Error showing text view:', error);
        }
    }

    updateViewButtons(documentId, activeView) {
        try {
            const pdfButton = document.querySelector(`#viewAsPdf-${documentId}`);
            const textButton = document.querySelector(`[onclick="window.documentManager.showTextView('${documentId}')"]`);

            if (pdfButton && textButton) {
                pdfButton.className = 'btn btn-outline-primary';
                textButton.className = 'btn btn-outline-secondary';

                if (activeView === 'pdf') {
                    pdfButton.className = 'btn btn-primary';
                } else {
                    textButton.className = 'btn btn-secondary';
                }
            }
        } catch (error) {
            console.error('Error updating view buttons:', error);
        }
    }

    showPdfError(documentId, errorMessage) {
        try {
            const pdfView = document.getElementById(`pdfView-${documentId}`);
            if (!pdfView) return;

            pdfView.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>PDF Conversion Failed</strong>
                    <p>${this.escapeHtml(errorMessage)}</p>
                    <div class="mt-3">
                        <button class="btn btn-secondary" onclick="window.documentManager.showTextView('${documentId}')">
                            <i class="fas fa-file-text"></i> View Text Instead
                        </button>
                        <button class="btn btn-primary ml-2" onclick="window.documentManager.downloadDocument('${documentId}')">
                            <i class="fas fa-download"></i> Download Original
                        </button>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error showing PDF error:', error);
        }
    }

    formatDocumentContent(content) {
        if (!content) return '<p>No content available</p>';

        try {
            let formattedContent = this.escapeHtml(String(content));

            // Apply highlighting if we have highlight text
            if (this.highlightText) {
                const highlightRegex = new RegExp(`(${this.escapeRegex(this.highlightText)})`, 'gi');
                formattedContent = formattedContent.replace(highlightRegex, '<mark class="search-highlight">$1</mark>');
            }

            // Basic formatting for document content
            return formattedContent
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')
                .replace(/^/, '<p>')
                .replace(/$/, '</p>');
        } catch (error) {
            console.error('Error formatting document content:', error);
            return '<p>Error formatting content</p>';
        }
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    getFileIcon(fileType) {
        const iconMap = {
            'pdf': 'pdf',
            'doc': 'word',
            'docx': 'word',
            'txt': 'alt',
            'md': 'markdown',
            'csv': 'csv',
            'json': 'code',
            'xml': 'code',
            'html': 'code',
            'xlsx': 'excel',
            'xls': 'excel',
            'pptx': 'powerpoint',
            'ppt': 'powerpoint',
            'rtf': 'alt',
            'odt': 'alt',
            'ods': 'excel',
            'odp': 'powerpoint'
        };
        return iconMap[fileType?.toLowerCase()] || 'file';
    }

    formatFileSize(bytes) {
        if (!bytes || isNaN(bytes)) return '0 B';

        try {
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        } catch (error) {
            console.error('Error formatting file size:', error);
            return '0 B';
        }
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'Unknown';

        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return 'Unknown';
            return date.toLocaleDateString();
        } catch (error) {
            console.error('Error formatting timestamp:', error);
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
            console.error('Error escaping HTML:', error);
            return String(text);
        }
    }

    // Public API methods
    getDocuments() {
        return this.documents;
    }

    getSelectedDocument() {
        return this.documents.find(doc => doc.id === this.selectedDocumentId);
    }

    refresh() {
        return this.loadDocuments();
    }

    // Search result highlighting
    setHighlightText(text) {
        this.highlightText = text;
    }

    clearHighlightText() {
        this.highlightText = null;
    }

    // Utility method to handle chunk IDs from search results
    extractDocumentIdFromChunk(chunkId) {
    if (typeof chunkId === 'string' && chunkId.includes('_chunk_')) {
        console.log('Extracting document ID from chunk:', chunkId);

        // Handle format: doc_X_chunk_Y
        const docMatch = chunkId.match(/doc_(\d+)_chunk_/);
        if (docMatch && docMatch[1]) {
            const docId = parseInt(docMatch[1], 10);
            console.log('Extracted document ID:', docId);
            return docId;
        }

        // Handle other possible formats
        const parts = chunkId.split('_chunk_');
        if (parts.length >= 2) {
            const docPart = parts[0];
            const numMatch = docPart.match(/(\d+)/);
            if (numMatch && numMatch[1]) {
                const docId = parseInt(numMatch[1], 10);
                console.log('Extracted document ID from parts:', docId);
                return docId;
            }
        }
    }

    // If it's already a number, return it
    if (typeof chunkId === 'number') {
        return chunkId;
    }

    // Try to parse as integer
    const parsed = parseInt(chunkId, 10);
    if (!isNaN(parsed)) {
        return parsed;
    }

    console.warn('Could not extract document ID from:', chunkId);
    return null;
}

    // Enhanced document viewer for search results
    openDocumentFromSearchResult(searchResult) {
        try {
            console.log('Opening document from search result:', searchResult);

            // Extract highlight text from search result
            const highlightText = searchResult.content || searchResult.text || null;
            if (highlightText) {
                this.setHighlightText(highlightText.substring(0, 100));
            }

            // Try to extract document ID from various possible fields
            let docId = searchResult.document_id ||
                       searchResult.id ||
                       searchResult.doc_id ||
                       searchResult.file_id ||
                       searchResult.pdf_id;

            // If we have a chunk ID, try to extract the document ID
            if (!docId && searchResult.chunk_id) {
                docId = this.extractDocumentIdFromChunk(searchResult.chunk_id);
            }

            if (docId) {
                this.openDocumentViewer(docId, highlightText);
            } else {
                console.error('Could not extract document ID from search result:', searchResult);
                if (window.showStatus) {
                    window.showStatus('Cannot open document: No valid document ID found', 'error');
                }
            }
        } catch (error) {
            console.error('Error opening document from search result:', error);
            if (window.showStatus) {
                window.showStatus('Failed to open document: ' + error.message, 'error');
            }
        }
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

