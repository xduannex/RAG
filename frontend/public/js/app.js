// API configuration - Use proxy
const API_BASE_URL = '';

class RAGChatApp {
    constructor() {
        this.selectedPdfs = [];
        this.isConnected = false;
        this.uploadedPdfs = [];
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        await this.checkConnection();
        await this.loadStats();
        await this.loadPDFs();
        this.startPeriodicUpdates();
    }

    async checkConnection() {
        try {
            console.log('Checking connection to:', `${API_BASE_URL}/health`);
            const response = await fetch(`${API_BASE_URL}/health`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                // Check if response is JSON
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    console.log('Health check response:', data);
                    this.isConnected = data.status === 'healthy';
                } else {
                    // Response is not JSON (likely HTML error page)
                    const text = await response.text();
                    console.error('Health check returned non-JSON response:', text.substring(0, 200));
                    this.isConnected = false;
                }
            } else {
                console.error('Health check failed:', response.status, response.statusText);

                // Try to get error details
                try {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const errorData = await response.json();
                        console.error('Error details:', errorData);
                    } else {
                        const errorText = await response.text();
                        console.error('Error response (non-JSON):', errorText.substring(0, 200));
                    }
                } catch (parseError) {
                    console.error('Could not parse error response:', parseError);
                }

                this.isConnected = false;
            }
        } catch (error) {
            console.error('Connection check failed:', error);
            this.isConnected = false;

            // Show more specific error messages
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                console.error('Network error: Cannot reach the server. Check if the backend is running.');
            } else if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
                console.error('Server returned invalid JSON response. This might indicate a server error or wrong endpoint.');
            }
        }

        this.updateConnectionStatus();
    }

    async loadStats() {
        try {
            console.log('Loading stats from:', `${API_BASE_URL}/admin/dashboard`);
            const response = await fetch(`${API_BASE_URL}/admin/dashboard`);

            if (response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    console.log('Stats loaded:', data);
                    document.getElementById('totalPdfs').textContent = data.total_pdfs || 0;
                    document.getElementById('searchablePdfs').textContent = data.searchable_pdfs || 0;
                    document.getElementById('totalSearches').textContent = data.total_searches || 0;
                } else {
                    console.error('Stats endpoint returned non-JSON response');
                    this.setDefaultStats();
                }
            } else {
                console.error('Stats loading failed:', response.status);
                this.setDefaultStats();
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
            this.setDefaultStats();
        }
    }

    setDefaultStats() {
        document.getElementById('totalPdfs').textContent = '0';
        document.getElementById('searchablePdfs').textContent = '0';
        document.getElementById('totalSearches').textContent = '0';
    }

    async loadPDFs() {
        try {
            console.log('Loading PDFs from:', `${API_BASE_URL}/pdf/`);
            const response = await fetch(`${API_BASE_URL}/pdf/`);

            if (response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const pdfs = await response.json();
                    console.log('PDFs loaded:', pdfs);
                    this.uploadedPdfs = pdfs;
                    this.renderPDFList(pdfs);
                } else {
                    console.error('PDF endpoint returned non-JSON response');
                    this.renderErrorPDFList();
                }
            } else {
                console.error('PDF loading failed:', response.status);
                this.renderEmptyPDFList();
            }
        } catch (error) {
            console.error('Failed to load PDFs:', error);
            this.renderErrorPDFList();
        }
    }

    renderPDFList(pdfs) {
        const pdfList = document.getElementById('pdfList');

        if (!pdfList) {
            console.error('PDF list element not found');
            return;
        }

        if (pdfs.length === 0) {
            this.renderEmptyPDFList();
            return;
        }

        pdfList.innerHTML = pdfs.map(pdf => `
            <div class="pdf-item ${this.selectedPdfs.includes(pdf.id) ? 'selected' : ''}" 
                 data-pdf-id="${pdf.id}" 
                 onclick="app.togglePdfSelection(${pdf.id})">
                <div class="pdf-item-header">
                    <div class="pdf-item-title" title="${this.escapeHtml(pdf.title || pdf.filename)}">
                        ${this.truncateText(this.escapeHtml(pdf.title || pdf.filename), 25)}
                    </div>
                    <div class="pdf-item-actions">
                        <button class="btn btn-sm btn-outline-light" 
                                onclick="event.stopPropagation(); app.viewPDF(${pdf.id})" 
                                title="View PDF">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" 
                                onclick="event.stopPropagation(); app.deletePDF(${pdf.id})" 
                                title="Delete PDF">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="pdf-item-info">
                    <span>${pdf.total_pages || 0} pages</span>
                    <span>•</span>
                    <span>${this.formatFileSize(pdf.file_size || 0)}</span>
                </div>
                <div class="pdf-status-container">
                    <span class="pdf-status ${pdf.processing_status || 'unknown'}" 
                          title="Processing Status: ${pdf.processing_status || 'unknown'}">
                        ${this.getStatusIcon(pdf.processing_status)} ${pdf.processing_status || 'unknown'}
                    </span>
                    ${pdf.processing_status === 'failed' ? 
                        `<button class="btn btn-sm btn-warning" 
                                onclick="event.stopPropagation(); app.reprocessPDF(${pdf.id})" 
                                title="Retry Processing">
                            <i class="fas fa-redo"></i>
                        </button>` : ''
                    }
                </div>
            </div>
        `).join('');
    }

    renderEmptyPDFList() {
        const pdfList = document.getElementById('pdfList');
        if (pdfList) {
            pdfList.innerHTML = '<div class="text-muted small">No documents uploaded yet</div>';
        }
    }

    renderErrorPDFList() {
        const pdfList = document.getElementById('pdfList');
        if (pdfList) {
            pdfList.innerHTML = '<div class="text-danger small">Failed to load documents</div>';
        }
    }

    getStatusIcon(status) {
        switch(status) {
            case 'completed': return '<i class="fas fa-check-circle text-success"></i>';
            case 'processing': return '<i class="fas fa-spinner fa-spin text-info"></i>';
            case 'pending': return '<i class="fas fa-clock text-warning"></i>';
            case 'failed': return '<i class="fas fa-exclamation-triangle text-danger"></i>';
            default: return '<i class="fas fa-question-circle text-muted"></i>';
        }
    }

    setupEventListeners() {
        // Chat form
        const chatForm = document.getElementById('chatForm');
        if (chatForm) {
            chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendMessage();
            });
        }

        // Upload form
        const uploadForm = document.getElementById('uploadForm');
        if (uploadForm) {
            uploadForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.uploadFile();
            });
        }

        // Clear chat
        const clearChat = document.getElementById('clearChat');
        if (clearChat) {
            clearChat.addEventListener('click', () => {
                this.clearChat();
            });
        }

        // Refresh stats
        const refreshStats = document.getElementById('refreshStats');
        if (refreshStats) {
            refreshStats.addEventListener('click', () => {
                this.loadStats();
                this.loadPDFs();
            });
        }

        // File input change
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileSelection(e);
            });
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Enter to send message
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.sendMessage();
            }

            // Escape to clear selection
            if (e.key === 'Escape') {
                this.clearPdfSelection();
            }
        });
    }

    handleFileSelection(event) {
        const file = event.target.files[0];
        if (file) {
            // Auto-fill title from filename
            const titleInput = document.getElementById('titleInput');
            if (titleInput && !titleInput.value) {
                const filename = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
                titleInput.value = filename;
            }
        }
    }

    togglePdfSelection(pdfId) {
        const pdfItem = document.querySelector(`[data-pdf-id="${pdfId}"]`);
        if (!pdfItem) return;

        if (this.selectedPdfs.includes(pdfId)) {
            this.selectedPdfs = this.selectedPdfs.filter(id => id !== pdfId);
            pdfItem.classList.remove('selected');
        } else {
            this.selectedPdfs.push(pdfId);
            pdfItem.classList.add('selected');
        }

        this.updateSelectionInfo();
    }

    clearPdfSelection() {
        this.selectedPdfs = [];
        document.
