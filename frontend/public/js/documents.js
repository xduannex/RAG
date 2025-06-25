// RAG Chat Application - Document Management
// Handles document upload, viewing, and management operations

class DocumentManager {
    constructor(ragClient) {
        this.ragClient = ragClient;

        // Add null checks for ragClient
        if (!this.ragClient) {
            console.warn('⚠️ RAGClient not provided to DocumentManager, creating fallback');
            this.ragClient = this.createFallbackClient();
        }

        this.documents = [];
        this.selectedDocuments = [];
        this.isLoading = false;
        this.sortBy = 'created_at';
        this.sortOrder = 'desc';
        this.filterQuery = '';
        this.filterType = '';
        this.filterCategory = '';
        this.currentDocument = null;
        this.documentViewer = null;

        // DOM elements will be set in initialize()
        this.documentsContainer = null;
        this.searchInput = null;
        this.sortSelect = null;
        this.filterSelect = null;
        this.selectedCount = null;
        this.totalCount = null;

        console.log('DocumentManager created');
    }

    createFallbackClient() {
        const baseURL = window.API_BASE_URL || 'http://localhost:8000';

        return {
            baseURL: baseURL,

            async getDocuments() {
                try {
                    const response = await fetch(`${baseURL}/api/documents/`);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const data = await response.json();
                    return { success: true, data: data };
                } catch (error) {
                    console.error('Fallback getDocuments error:', error);
                    return { success: false, error: error.message };
                }
            },

            async deleteDocument(documentId) {
                try {
                    const response = await fetch(`${baseURL}/api/documents/${documentId}`, {
                        method: 'DELETE'
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return { success: true };
                } catch (error) {
                    console.error('Fallback deleteDocument error:', error);
                    return { success: false, error: error.message };
                }
            }
        };
    }

    async initialize() {
        console.log('Initializing DocumentManager...');

        try {
            this.setupElements();
            this.setupEventListeners();
            await this.loadDocuments();
            this.setupDocumentViewer();

            // Register globally
            window.documentManager = this;

            console.log('DocumentManager initialized successfully');
        } catch (error) {
            console.error('DocumentManager initialization failed:', error);
            throw error;
        }
    }

    setupElements() {
        // Document list elements
        this.documentsContainer = document.getElementById('documentsContainer');
        this.searchInput = document.getElementById('documentSearch');
        this.sortSelect = document.getElementById('documentSort');
        this.filterSelect = document.getElementById('documentFilter');
        this.selectedCount = document.getElementById('selectedCount');
        this.totalCount = document.getElementById('totalCount');

        // Document viewer elements
        this.documentViewer = document.getElementById('documentViewerModal');
        this.documentViewerTitle = document.getElementById('documentViewerTitle');
        this.documentViewerContent = document.getElementById('documentViewerContent');
        this.documentViewerIframe = document.getElementById('documentViewerIframe');
        this.documentImage = document.getElementById('documentImage');
        this.documentImageContainer = document.getElementById('documentImageContainer');
        this.documentText = document.getElementById('documentText');
        this.documentTextContainer = document.getElementById('documentTextContainer');
        this.documentLoadingContainer = document.getElementById('documentLoadingContainer');
        this.documentErrorContainer = document.getElementById('documentErrorContainer');

        // Buttons
        this.closeDocumentViewer = document.getElementById('closeDocumentViewer');
        this.modalDownloadBtn = document.getElementById('modalDownloadBtn');
        this.viewChunksBtn = document.getElementById('viewChunksBtn');
    }

    setupEventListeners() {
        // Document search
        if (this.searchInput) {
            this.searchInput.addEventListener('input', this.debounce(() => {
                this.filterQuery = this.searchInput.value.trim();
                this.filterAndSortDocuments();
            }, 300));
        }

        // Document sorting
        if (this.sortSelect) {
            this.sortSelect.addEventListener('change', () => {
                const [sortBy, sortOrder] = this.sortSelect.value.split(':');
                this.sortBy = sortBy;
                this.sortOrder = sortOrder;
                this.filterAndSortDocuments();
            });
        }

        // Document filtering
        if (this.filterSelect) {
            this.filterSelect.addEventListener('change', () => {
                this.filterType = this.filterSelect.value;
                this.filterAndSortDocuments();
            });
        }

        // Document viewer events
        if (this.closeDocumentViewer) {
            this.closeDocumentViewer.addEventListener('click', () => {
                this.closeDocumentViewerModal();
            });
        }

        if (this.modalDownloadBtn) {
            this.modalDownloadBtn.addEventListener('click', () => {
                this.downloadCurrentDocument();
            });
        }

        if (this.viewChunksBtn) {
            this.viewChunksBtn.addEventListener('click', () => {
                this.showDocumentChunks();
            });
        }

        // Close modal on outside click
        if (this.documentViewer) {
            this.documentViewer.addEventListener('click', (e) => {
                if (e.target === this.documentViewer) {
                    this.closeDocumentViewerModal();
                }
            });
        }
    }

    async loadDocuments() {
        if (this.isLoading) {
            console.log('Documents already loading...');
            return;
        }

        this.isLoading = true;
        this.showLoadingState();

        try {
            console.log('Loading documents...');

            // Use the correct API endpoint
            const baseURL = this.ragClient?.baseURL || window.API_BASE_URL || 'http://localhost:8000';
            const response = await fetch(`${baseURL}/api/documents/`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                this.documents = data.documents || data.data || [];
                console.log(`Loaded ${this.documents.length} documents`);
            } else {
                throw new Error(data.message || 'Failed to load documents');
            }

            this.filterAndSortDocuments();
            this.updateDocumentCounts();

        } catch (error) {
            console.error('Error loading documents:', error);
            this.showErrorState('Failed to load documents: ' + error.message);

            if (window.showStatus) {
                window.showStatus('Failed to load documents', 'error');
            }
        } finally {
            this.isLoading = false;
        }
    }

    showLoadingState() {
        if (this.documentsContainer) {
            this.documentsContainer.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">Loading documents...</div>
                </div>
            `;
        }
    }

    showErrorState(message) {
        if (this.documentsContainer) {
            this.documentsContainer.innerHTML = `
                <div class="error-container">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="error-message">${this.escapeHtml(message)}</div>
                    <button class="btn btn-primary" onclick="window.documentManager.loadDocuments()">
                        <i class="fas fa-retry"></i> Retry
                    </button>
                </div>
            `;
        }
    }

    showEmptyState() {
        if (this.documentsContainer) {
            this.documentsContainer.innerHTML = `
                <div class="empty-container">
                    <div class="empty-icon">
                        <i class="fas fa-file-alt"></i>
                    </div>
                    <div class="empty-title">No Documents Found</div>
                    <div class="empty-message">
                        ${this.filterQuery || this.filterType ? 
                            'Try adjusting your search or filter criteria.' : 
                            'Upload some documents to get started.'}
                    </div>
                    ${!this.filterQuery && !this.filterType ? `
                        <button class="btn btn-primary" onclick="document.getElementById('fileInput').click()">
                            <i class="fas fa-upload"></i> Upload Documents
                        </button>
                    ` : ''}
                </div>
            `;
        }
    }

    filterAndSortDocuments() {
        let filteredDocuments = [...this.documents];

        // Apply search filter
        if (this.filterQuery) {
            const query = this.filterQuery.toLowerCase();
            filteredDocuments = filteredDocuments.filter(doc =>
                (doc.title || doc.filename || '').toLowerCase().includes(query) ||
                (doc.category || '').toLowerCase().includes(query) ||
                (doc.content || '').toLowerCase().includes(query)
            );
        }

        // Apply type filter
        if (this.filterType) {
            filteredDocuments = filteredDocuments.filter(doc => {
                const fileType = this.getFileType(doc.filename);
                return fileType === this.filterType;
            });
        }

        // Apply category filter
        if (this.filterCategory) {
            filteredDocuments = filteredDocuments.filter(doc =>
                (doc.category || '').toLowerCase() === this.filterCategory.toLowerCase()
            );
        }

        // Sort documents
        filteredDocuments.sort((a, b) => {
            let aValue = a[this.sortBy] || '';
            let bValue = b[this.sortBy] || '';

            // Handle different sort types
            if (this.sortBy === 'created_at' || this.sortBy === 'updated_at') {
                aValue = new Date(aValue);
                bValue = new Date(bValue);
            } else if (this.sortBy === 'file_size') {
                aValue = parseInt(aValue) || 0;
                bValue = parseInt(bValue) || 0;
            } else {
                aValue = String(aValue).toLowerCase();
                bValue = String(bValue).toLowerCase();
            }

            let comparison = 0;
            if (aValue < bValue) comparison = -1;
            if (aValue > bValue) comparison = 1;

            return this.sortOrder === 'desc' ? -comparison : comparison;
        });

        this.renderDocuments(filteredDocuments);
        this.updateDocumentCounts(filteredDocuments.length);
    }

    renderDocuments(documents) {
        if (!this.documentsContainer) return;

        if (documents.length === 0) {
            this.showEmptyState();
            return;
        }

        const documentsHTML = documents.map(doc => this.createDocumentCard(doc)).join('');

        this.documentsContainer.innerHTML = `
            <div class="documents-grid">
                ${documentsHTML}
            </div>
        `;

        // Add animation
        const cards = this.documentsContainer.querySelectorAll('.document-card');
        cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
                card.style.transition = 'all 0.3s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 50);
        });
    }

    createDocumentCard(doc) {
        const fileType = this.getFileType(doc.filename);
        const fileIcon = this.getFileIcon(fileType);
        const fileSize = this.formatFileSize(doc.file_size || 0);
        const createdDate = this.formatDate(doc.created_at);
        const isSelected = this.selectedDocuments.includes(doc.id);

        return `
            <div class="document-card ${isSelected ? 'selected' : ''}" data-document-id="${doc.id}">
                <div class="document-header">
                    <div class="document-icon">
                        <i class="${fileIcon}"></i>
                    </div>
                    <div class="document-type">${fileType.toUpperCase()}</div>
                    <div class="document-actions">
                        <button class="btn btn-sm btn-ghost" onclick="window.documentManager.toggleDocumentSelection(${doc.id})" title="Select">
                            <i class="fas ${isSelected ? 'fa-check-square' : 'fa-square'}"></i>
                        </button>
                        <div class="dropdown">
                            <button class="btn btn-sm btn-ghost dropdown-toggle" title="More actions">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <div class="dropdown-menu">
                                <button class="dropdown-item" onclick="window.documentManager.openDocumentViewer(${doc.id})">
                                    <i class="fas fa-eye"></i> View
                                </button>
                                <button class="dropdown-item" onclick="window.documentManager.downloadDocument(${doc.id})">
                                    <i class="fas fa-download"></i> Download
                                </button>
                                <button class="dropdown-item" onclick="window.documentManager.editDocument(${doc.id})">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                                <div class="dropdown-divider"></div>
                                <button class="dropdown-item danger" onclick="window.documentManager.deleteDocument(${doc.id})">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="document-body" onclick="window.documentManager.openDocumentViewer(${doc.id})">
                    <div class="document-title" title="${this.escapeHtml(doc.title || doc.filename)}">
                        ${this.escapeHtml(this.truncateText(doc.title || doc.filename, 50))}
                    </div>
                    ${doc.category ? `
                        <div class="document-category">
                            <i class="fas fa-tag"></i>
                            ${this.escapeHtml(doc.category)}
                        </div>
                    ` : ''}
                    <div class="document-preview">
                        ${this.escapeHtml(this.truncateText(doc.content || 'No preview available', 120))}
                    </div>
                </div>
                <div class="document-footer">
                    <div class="document-meta">
                        <span class="document-size">
                            <i class="fas fa-hdd"></i>
                            ${fileSize}
                        </span>
                        <span class="document-date">
                            <i class="fas fa-calendar"></i>
                            ${createdDate}
                        </span>
                        ${doc.page_count ? `
                            <span class="document-pages">
                                <i class="fas fa-file-alt"></i>
                                ${doc.page_count} pages
                            </span>
                        ` : ''}
                    </div>
                    <div class="document-status">
                        <span class="status-badge ${doc.status || 'processed'}">
                            ${(doc.status || 'processed').charAt(0).toUpperCase() + (doc.status || 'processed').slice(1)}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }

    getFileType(filename) {
        if (!filename) return 'unknown';
        const extension = filename.toLowerCase().split('.').pop();

        const typeMap = {
            'pdf': 'pdf',
            'doc': 'word', 'docx': 'word',
            'txt': 'text', 'md': 'text', 'rtf': 'text',
            'xls': 'excel', 'xlsx': 'excel', 'csv': 'excel',
            'ppt': 'powerpoint', 'pptx': 'powerpoint',
            'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'bmp': 'image', 'tiff': 'image', 'webp': 'image',
            'json': 'code', 'xml': 'code', 'html': 'code', 'htm': 'code'
        };

        return typeMap[extension] || 'unknown';
    }

    getFileIcon(fileType) {
        const iconMap = {
            'pdf': 'fas fa-file-pdf text-red-500',
            'word': 'fas fa-file-word text-blue-500',
            'text': 'fas fa-file-alt text-gray-500',
            'excel': 'fas fa-file-excel text-green-500',
            'powerpoint': 'fas fa-file-powerpoint text-orange-500',
            'image': 'fas fa-file-image text-purple-500',
            'code': 'fas fa-file-code text-yellow-500',
            'unknown': 'fas fa-file text-gray-400'
        };

        return iconMap[fileType] || iconMap.unknown;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;
        if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
        if (days < 365) return `${Math.floor(days / 30)} months ago`;

        return date.toLocaleDateString();
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateDocumentCounts(filteredCount = null) {
        const total = this.documents.length;
        const filtered = filteredCount !== null ? filteredCount : total;
        const selected = this.selectedDocuments.length;

        if (this.totalCount) {
            this.totalCount.textContent = filtered === total ? total : `${filtered} of ${total}`;
        }

        if (this.selectedCount) {
            this.selectedCount.textContent = selected;
            this.selectedCount.style.display = selected > 0 ? 'inline' : 'none';
        }
    }

    toggleDocumentSelection(documentId) {
        const index = this.selectedDocuments.indexOf(documentId);

        if (index > -1) {
            this.selectedDocuments.splice(index, 1);
        } else {
            this.selectedDocuments.push(documentId);
        }

        this.updateDocumentSelectionUI();
        this.updateDocumentCounts();
    }

    updateDocumentSelectionUI() {
        const cards = document.querySelectorAll('.document-card');
        cards.forEach(card => {
            const documentId = parseInt(card.dataset.documentId);
            const isSelected = this.selectedDocuments.includes(documentId);

            card.classList.toggle('selected', isSelected);

            const checkbox = card.querySelector('.fas.fa-square, .fas.fa-check-square');
            if (checkbox) {
                checkbox.className = isSelected ? 'fas fa-check-square' : 'fas fa-square';
            }
        });

        // Update bulk actions visibility
        const bulkActions = document.querySelector('.bulk-actions');
        if (bulkActions) {
            bulkActions.style.display = this.selectedDocuments.length > 0 ? 'flex' : 'none';
        }
    }

    selectAllDocuments() {
        const visibleCards = document.querySelectorAll('.document-card');
        this.selectedDocuments = Array.from(visibleCards).map(card =>
            parseInt(card.dataset.documentId)
        );

        this.updateDocumentSelectionUI();
        this.updateDocumentCounts();
    }

    clearSelection() {
        this.selectedDocuments = [];
        this.updateDocumentSelectionUI();
        this.updateDocumentCounts();
    }

    async deleteSelectedDocuments() {
        if (this.selectedDocuments.length === 0) {
            if (window.showStatus) {
                window.showStatus('No documents selected', 'warning');
            }
            return;
        }

        const count = this.selectedDocuments.length;
        const message = `Are you sure you want to delete ${count} document${count > 1 ? 's' : ''}? This action cannot be undone.`;

        if (!confirm(message)) {
            return;
        }

        try {
            const deletePromises = this.selectedDocuments.map(id => this.deleteDocument(id, false));
            await Promise.all(deletePromises);

            this.selectedDocuments = [];
            await this.refreshDocuments();

            if (window.showStatus) {
                window.showStatus(`${count} document${count > 1 ? 's' : ''} deleted successfully`, 'success');
            }
        } catch (error) {
            console.error('Failed to delete documents:', error);
            if (window.showStatus) {
                window.showStatus('Failed to delete some documents', 'error');
            }
        }
    }

    async deleteDocument(documentId, confirmDelete = true) {
        if (confirmDelete && !confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
            return;
        }

        try {
            const baseURL = this.ragClient?.baseURL || window.API_BASE_URL || 'http://localhost:8000';
            const response = await fetch(`${baseURL}/api/documents/${documentId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Remove from local state
            this.documents = this.documents.filter(doc => doc.id !== documentId);
            this.selectedDocuments = this.selectedDocuments.filter(id => id !== documentId);

            // Refresh the display
            this.filterAndSortDocuments();

            if (confirmDelete && window.showStatus) {
                window.showStatus('Document deleted successfully', 'success');
            }

        } catch (error) {
            console.error('Failed to delete document:', error);
            if (confirmDelete && window.showStatus) {
                window.showStatus('Failed to delete document', 'error');
            }
            throw error;
        }
    }

    async downloadDocument(documentId) {
        try {
            const document = this.documents.find(doc => doc.id === documentId);
            if (!document) {
                throw new Error('Document not found');
            }

            const baseURL = this.ragClient?.baseURL || window.API_BASE_URL || 'http://localhost:8000';
            const response = await fetch(`${baseURL}/api/documents/${documentId}/download`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = document.filename || `document_${documentId}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            if (window.showStatus) {
                window.showStatus('Document downloaded successfully', 'success');
            }

        } catch (error) {
            console.error('Failed to download document:', error);
            if (window.showStatus) {
                window.showStatus('Failed to download document', 'error');
            }
        }
    }

    async editDocument(documentId) {
        const document = this.documents.find(doc => doc.id === documentId);
        if (!document) {
            if (window.showStatus) {
                window.showStatus('Document not found', 'error');
            }
            return;
        }

        // Create edit modal
        const modal = this.createEditModal(document);
        document.body.appendChild(modal);
        modal.style.display = 'block';
        document.body.classList.add('modal-open');

        // Focus on title input
        const titleInput = modal.querySelector('#editDocumentTitle');
        if (titleInput) {
            titleInput.focus();
            titleInput.select();
        }
    }

    createEditModal(document) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'editDocumentModal';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Edit Document</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove(); document.body.classList.remove('modal-open')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="editDocumentForm">
                        <div class="form-group">
                            <label class="form-label" for="editDocumentTitle">Title</label>
                            <input type="text" class="form-control" id="editDocumentTitle" 
                                   value="${this.escapeHtml(document.title || document.filename)}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="editDocumentCategory">Category</label>
                            <input type="text" class="form-control" id="editDocumentCategory" 
                                   value="${this.escapeHtml(document.category || '')}" 
                                   placeholder="Enter category (optional)">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="editDocumentDescription">Description</label>
                            <textarea class="form-control" id="editDocumentDescription" rows="3" 
                                      placeholder="Enter description (optional)">${this.escapeHtml(document.description || '')}</textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="this.closest('.modal').remove(); document.body.classList.remove('modal-open')">
                        Cancel
                    </button>
                    <button class="btn btn-primary" onclick="window.documentManager.saveDocumentChanges(${document.id})">
                        <i class="fas fa-save"></i> Save Changes
                    </button>
                </div>
            </div>
        `;

        // Handle form submission
        const form = modal.querySelector('#editDocumentForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveDocumentChanges(document.id);
        });

        return modal;
    }

    async saveDocumentChanges(documentId) {
        const modal = document.getElementById('editDocumentModal');
        if (!modal) return;

        const titleInput = modal.querySelector('#editDocumentTitle');
        const categoryInput = modal.querySelector('#editDocumentCategory');
        const descriptionInput = modal.querySelector('#editDocumentDescription');

        const updateData = {
            title: titleInput.value.trim(),
            category: categoryInput.value.trim() || null,
            description: descriptionInput.value.trim() || null
        };

        try {
            const baseURL = this.ragClient?.baseURL || window.API_BASE_URL || 'http://localhost:8000';
            const response = await fetch(`${baseURL}/api/documents/${documentId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Update local state
            const updatedDocument = await response.json();
            this.documents = this.documents.map(doc =>
                doc.id === documentId ? updatedDocument : doc
            );

            // Refresh the display
            this.filterAndSortDocuments();

            if (window.showStatus) {
                window.showStatus('Document updated successfully', 'success');
            }

        } catch (error) {
            console.error('Failed to update document:', error);
            if (window.showStatus) {
                window.showStatus('Failed to update document', 'error');
            }
            throw error;
        }
    }
}