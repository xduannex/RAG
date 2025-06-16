// RAG Chat Application - Document Management
// Handles document loading, display, and management

class DocumentManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
        this.documents = [];
        this.selectedDocumentId = null;
        this.isLoading = false;
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
                const filename = this.escapeHtml(String(doc.filename || doc.original_filename || doc.name || 'Unknown'));
                const title = this.escapeHtml(String(doc.title || doc.filename || doc.original_filename || doc.name || 'Unknown'));
                const category = this.escapeHtml(String(doc.category || 'Uncategorized'));
                const status = this.escapeHtml(String(doc.status || doc.processing_status || 'unknown'));

                return `
                <div class="pdf-item" data-doc-id="${docId}" onclick="window.documentManager.selectDocument('${docId}', '${filename}')">
                    <div class="pdf-icon">
                        <i class="fas fa-file-${this.getFileIcon(doc.file_type || 'unknown')}"></i>
                    </div>
                    <div class="pdf-info">
                        <div class="pdf-title">${title}</div>
                        <div class="pdf-meta">
                            <span>${category}</span>
                            <span>${this.formatFileSize(doc.file_size || doc.size || 0)}</span>
                            <span>${this.formatTimestamp(doc.created_at || doc.upload_date)}</span>
                        </div>
                    </div>
                    <div class="pdf-status">
                        <span class="status-badge status-${status.toLowerCase()}">${status}</span>
                    </div>
                    <div class="pdf-actions">
                        <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); window.documentManager.openDocumentViewer('${docId}')" title="View Document">
                            <i class="fas fa-eye"></i>
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

    openDocumentViewer(docId) {
        try {
            const modal = document.getElementById('documentViewerModal');
            if (!modal) {
                if (window.showStatus) {
                    window.showStatus('Document viewer not available', 'error');
                }
                return;
            }

            const modalTitle = modal.querySelector('.modal-title');
            const modalBody = modal.querySelector('.modal-body');

            if (modalTitle) modalTitle.textContent = 'Document Viewer';
            if (modalBody) modalBody.innerHTML = '<div class="loading"><div class="loading-spinner"></div> Loading document...</div>';

            modal.style.display = 'flex';

            // Load document content
            this.loadDocumentContent(docId, modalBody);
        } catch (error) {
            console.error('Error opening document viewer:', error);
            if (window.showStatus) {
                window.showStatus('Failed to open document viewer', 'error');
            }
        }
    }

    async loadDocumentContent(docId, container) {
        if (!container) return;

        try {
            const response = await fetch(`${this.apiBaseUrl}/pdf/${docId}/chunks`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to load document content: ${response.statusText}`);
            }

            const data = await response.json();

            // Handle different possible response structures
            let content = '';
            if (typeof data === 'string') {
                content = data;
            } else if (data.content) {
                content = data.content;
            } else if (data.chunks && Array.isArray(data.chunks)) {
                content = data.chunks.map(chunk => chunk.content || chunk.text || '').join('\n\n');
            } else if (Array.isArray(data)) {
                content = data.map(item => item.content || item.text || '').join('\n\n');
            }

            container.innerHTML = `
                <div class="document-content">
                    ${this.formatDocumentContent(content || 'No content available')}
                </div>
            `;

        } catch (error) {
            console.error('Failed to load document content:', error);
            container.innerHTML = `
                <div class="text-center text-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    Failed to load document content: ${error.message}
                </div>
            `;
        }
    }

    // Utility methods
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
            'html': 'code'
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

    formatDocumentContent(content) {
        if (!content) return '<p>No content available</p>';

        try {
            // Basic formatting for document content
            return this.escapeHtml(String(content))
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')
                .replace(/^/, '<p>')
                .replace(/$/, '</p>');
        } catch (error) {
            console.error('Error formatting document content:', error);
            return '<p>Error formatting content</p>';
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

    // Public API
    getDocuments() {
        return this.documents;
    }

    getSelectedDocument() {
        return this.documents.find(doc => doc.id === this.selectedDocumentId);
    }

    refresh() {
        return this.loadDocuments();
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

