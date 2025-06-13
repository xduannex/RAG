// API configuration - Use relative URLs for network compatibility
const API_BASE_URL = '/api';

class RAGChatApp {
    constructor() {
        this.selectedPdfs = [];
        this.isConnected = false;
        this.uploadedPdfs = [];
        this.healthCheckInterval = null;
        this.reconnectAttempts = 0;
        this.currentFileId = null;
        this.bulkUploadData = null;
        this.CONFIG = {
            API_BASE_URL: '/api',
            HEALTH_CHECK_INTERVAL: 30000,
            MAX_FILE_SIZE: 50 * 1024 * 1024,
            ALLOWED_TYPES: ['pdf', 'doc', 'docx'],
            RECONNECT_ATTEMPTS: 3,
            RECONNECT_DELAY: 5000
        };
    }

    async init() {
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.setupDragAndDrop();
        await this.checkConnection();
        await this.loadStats();
        await this.loadPDFs();
        this.startPeriodicUpdates();
        console.log('RAG Chat App initialized successfully');
    }

    setupEventListeners() {
        // Upload form
        const uploadForm = document.getElementById('uploadForm');
        if (uploadForm) {
            uploadForm.addEventListener('submit', (e) => this.handleUpload(e));
        }

        // Bulk upload form
        const bulkUploadForm = document.getElementById('bulkUploadForm');
        if (bulkUploadForm) {
            bulkUploadForm.addEventListener('submit', (e) => this.handleBulkUpload(e));
        }

        // Chat form
        const chatForm = document.getElementById('chatForm');
        if (chatForm) {
            chatForm.addEventListener('submit', (e) => this.handleChat(e));
        }

        // Clear chat button
        const clearChatBtn = document.getElementById('clearChat');
        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', () => this.clearChat());
        }

        // Refresh stats button
        const refreshStatsBtn = document.getElementById('refreshStats');
        if (refreshStatsBtn) {
            refreshStatsBtn.addEventListener('click', () => this.loadStats());
        }

        // File input validation
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.validateFile(e.target));
        }

        // Bulk file input validation
        const bulkFileInput = document.getElementById('bulkFileInput');
        if (bulkFileInput) {
            bulkFileInput.addEventListener('change', (e) => this.validateBulkFiles(e.target));
        }

        // Message input auto-resize
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.addEventListener('input', () => this.autoResizeTextarea(messageInput));
            messageInput.addEventListener('keydown', (e) => this.handleMessageKeydown(e));
        }
    }

    setupDragAndDrop() {
        const dropZone = document.getElementById('dropZone');
        let dragCounter = 0;

        document.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dragCounter++;
            if (dropZone) dropZone.style.display = 'flex';
        });

        document.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter === 0 && dropZone) {
                dropZone.style.display = 'none';
            }
        });

        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            dragCounter = 0;
            if (dropZone) dropZone.style.display = 'none';

            const files = Array.from(e.dataTransfer.files);
            this.handleDroppedFiles(files);
        });
    }

    handleDroppedFiles(files) {
        const validFiles = files.filter(file => {
            const extension = file.name.split('.').pop().toLowerCase();
            return this.CONFIG.ALLOWED_TYPES.includes(extension) && file.size <= this.CONFIG.MAX_FILE_SIZE;
        });

        if (validFiles.length === 0) {
            this.showMessage('No valid files found. Please upload PDF, DOC, or DOCX files under 50MB.', 'warning');
            return;
        }

        if (validFiles.length === 1) {
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                fileInput.files = this.createFileList(validFiles);
                this.showMessage(`File "${validFiles[0].name}" ready for upload`, 'success');
            }
        } else {
            const bulkFileInput = document.getElementById('bulkFileInput');
            if (bulkFileInput) {
                bulkFileInput.files = this.createFileList(validFiles);
                this.showMessage(`${validFiles.length} files ready for bulk upload`, 'success');
            }
        }
    }

    createFileList(files) {
        const dt = new DataTransfer();
        files.forEach(file => dt.items.add(file));
        return dt.files;
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                this.clearChat();
            }
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                this.loadStats();
            }
            if (e.ctrlKey && e.key === 'u' && !e.shiftKey) {
                e.preventDefault();
                const fileInput = document.getElementById('fileInput');
                if (fileInput) fileInput.focus();
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'U') {
                e.preventDefault();
                const bulkFileInput = document.getElementById('bulkFileInput');
                if (bulkFileInput) bulkFileInput.focus();
            }
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault();
                this.showUploadHistory();
            }
        });
    }

    async checkConnection() {
        try {
            console.log('Checking connection to:', `${API_BASE_URL}/health`);
            const response = await fetch(`${API_BASE_URL}/health`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                // Add timeout to prevent hanging requests
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });

            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers.get('content-type'));

            // Handle different response scenarios
            if (response.ok) {
                // Check if response is JSON
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    console.log('Health check response:', data);

                    // Match the backend response format from health.py
                    const isHealthy = data.status === 'healthy';
                    this.isConnected = isHealthy;

                    // Update UI with detailed health info
                    this.updateConnectionStatus(isHealthy, data);

                    // Reset reconnection attempts on successful connection
                    this.reconnectAttempts = 0;

                    return data;
                } else {
                    // Response is not JSON (likely HTML error page)
                    const text = await response.text();
                    console.error('Health check returned non-JSON response:', text.substring(0, 200));
                    this.isConnected = false;
                    this.updateConnectionStatus(false, null, 'Invalid response format');
                    throw new Error('Invalid response format - expected JSON');
                }
            } else {
                // Handle HTTP error responses
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

                try {
                    // Try to get error details from JSON response
                    const errorData = await response.json();
                    if (errorData.database_error) {
                        errorMessage += ` - Database: ${errorData.database_error}`;
                    }
                } catch (e) {
                    // If response is not JSON, use status text
                    console.warn('Could not parse error response as JSON');
                }

                console.error('Health check failed:', errorMessage);
                this.isConnected = false;
                this.updateConnectionStatus(false, null, errorMessage);
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Connection check failed:', error);
            this.isConnected = false;

            // Handle different types of errors
            let errorMessage = 'Connection failed';
            if (error.name === 'AbortError') {
                errorMessage = 'Request timeout';
            } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = 'Network error - server may be offline';
            } else {
                errorMessage = error.message;
            }

            this.updateConnectionStatus(false, null, errorMessage);
            this.handleConnectionError();
            throw error;
        }
    }

    updateConnectionStatus(isConnected, healthData = null, errorMessage = null) {
        // Update the main connection status
        this.isConnected = isConnected;

        // Update status indicator in sidebar
        const statusElement = document.getElementById('statusIndicator');
        const statusText = statusElement?.querySelector('.status-text');

        if (statusElement && statusText) {
            statusElement.className = 'status-indicator';

            if (isConnected) {
                statusElement.classList.add('connected');
                statusText.textContent = 'Connected';

                // Show additional health info if available
                if (healthData && healthData.database) {
                    const dbStatus = healthData.database === 'healthy' ? '✓' : '✗';
                    statusText.textContent = `Connected ${dbStatus}`;
                }
            } else {
                statusElement.classList.add('disconnected');
                statusText.textContent = 'Disconnected';
            }
        }

        // Update connection banner
        this.updateConnectionBanner(isConnected, errorMessage);

        // Log health status for debugging
        if (healthData) {
            console.log('Health Status:', {
                overall: healthData.status,
                database: healthData.database,
                timestamp: healthData.timestamp,
                error: healthData.database_error
            });
        }
    }

    updateConnectionBanner(isConnected, errorMessage = null) {
        const banner = document.getElementById('connectionBanner');
        const messageElement = document.getElementById('connectionMessage');

        if (!banner || !messageElement) return;

        if (!isConnected && errorMessage) {
            messageElement.textContent = errorMessage;
            banner.style.display = 'block';

            // Auto-hide banner after 10 seconds
            setTimeout(() => {
                if (banner.style.display === 'block') {
                    banner.style.display = 'none';
                }
            }, 10000);
        } else if (isConnected) {
            banner.style.display = 'none';
        }
    }

    handleConnectionError() {
        this.reconnectAttempts++;

        // Implement exponential backoff for reconnection attempts
        if (this.reconnectAttempts <= 3) {
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
            console.log(`Attempting reconnection ${this.reconnectAttempts}/3 in ${delay}ms`);

            setTimeout(() => {
                this.checkConnection();
            }, delay);
        } else {
            console.error('Max reconnection attempts reached');
            this.showMessage('Unable to connect to server. Please check your connection and refresh the page.', 'error');
        }
    }

    async checkDetailedHealth() {
        try {
            const response = await fetch(`${API_BASE_URL}/health/detailed`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(15000) // 15 second timeout for detailed check
            });

            if (response.ok) {
                const healthData = await response.json();
                console.log('Detailed health check:', healthData);

                // Update UI with service-specific status
                this.updateDetailedHealthStatus(healthData);

                return healthData;
            } else {
                throw new Error(`Detailed health check failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Detailed health check failed:', error);
            return null;
        }
    }

    updateDetailedHealthStatus(healthData) {
        // You can add UI elements to show detailed service status
        const services = healthData.services || {};

        // Example: Update a detailed status panel (if you add one to your HTML)
        const statusPanel = document.getElementById('detailedStatusPanel');
        if (statusPanel) {
            let statusHtml = '<div class="service-status">';

            Object.entries(services).forEach(([serviceName, serviceData]) => {
                const statusClass = serviceData.status === 'healthy' ? 'text-success' : 'text-danger';
                const statusIcon = serviceData.status === 'healthy' ? 'fa-check-circle' : 'fa-exclamation-triangle';

                statusHtml += `
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="text-capitalize">${serviceName}:</span>
                        <span class="${statusClass}">
                            <i class="fas ${statusIcon}"></i> ${serviceData.status}
                        </span>
                    </div>
                `;

                if (serviceData.error) {
                    statusHtml += `<div class="text-muted small mb-2">${serviceData.error}</div>`;
                }
            });

            statusHtml += '</div>';
            statusPanel.innerHTML = statusHtml;
        }
    }

    // Periodic health checks with smart intervals
    startPeriodicHealthChecks() {
        // Initial health check
        this.checkConnection();

        // Set up periodic checks with different intervals based on connection status
        this.healthCheckInterval = setInterval(() => {
            if (this.isConnected) {
                // Less frequent checks when connected
                this.checkConnection();
            } else {
                // More frequent checks when disconnected
                this.checkConnection();
            }
        }, this.isConnected ? 30000 : 10000); // 30s when connected, 10s when disconnected

        // Detailed health check every 5 minutes
        setInterval(() => {
            if (this.isConnected) {
                this.checkDetailedHealth();
            }
        }, 300000); // 5 minutes
    }

        // Manual health check trigger (for refresh button)
    async refreshHealthStatus() {
        try {
            this.showMessage('Checking connection...', 'info');

            const statusIndicator = document.getElementById('statusIndicator');
            if (statusIndicator) {
                statusIndicator.classList.remove('connected', 'disconnected');
                statusIndicator.classList.add('connecting');
                statusIndicator.querySelector('.status-text').textContent = 'Checking...';
            }

            await this.checkConnection();

            if (this.isConnected) {
                this.showMessage('Connection verified', 'success');
                // Also refresh other data
                await Promise.all([
                    this.loadStats(),
                    this.loadPDFs()
                ]);
            }
        } catch (error) {
            this.showMessage('Connection check failed', 'error');
        }
    }

    async loadStats() {
        try {
            const response = await fetch(`${API_BASE_URL}/search/stats`);
            if (response.ok) {
                const stats = await response.json();
                this.updateStatsDisplay(stats);
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
            this.updateStatsDisplay({
                total_pdfs: 0,
                searchable_pdfs: 0,
                total_searches: 0,
                processing_pdfs: 0
            });
        }
    }

    updateStatsDisplay(stats) {
        const elements = {
            'totalPdfs': stats.total_pdfs || 0,
            'searchablePdfs': stats.searchable_pdfs || 0,
            'totalSearches': stats.total_searches || 0,
            'processingPdfs': stats.processing_pdfs || 0
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    async loadPDFs() {
        try {
            const response = await fetch(`${API_BASE_URL}/pdf/`);
            if (response.ok) {
                const pdfs = await response.json();
                this.uploadedPdfs = pdfs;
                this.updatePDFList(pdfs);
            }
        } catch (error) {
            console.error('Failed to load PDFs:', error);
            const pdfList = document.getElementById('pdfList');
            if (pdfList) {
                pdfList.innerHTML = '<div class="text-danger small">Error loading documents</div>';
            }
        }
    }

    updatePDFList(pdfs) {
        const pdfList = document.getElementById('pdfList');
        if (!pdfList) return;

        if (!pdfs || pdfs.length === 0) {
            pdfList.innerHTML = '<div class="text-muted small">No documents uploaded yet</div>';
            return;
        }

        pdfList.innerHTML = pdfs.map(pdf => `
            <div class="file-item p-2 mb-1 bg-light rounded cursor-pointer" onclick="app.showFileDetails('${pdf.id}')">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="flex-grow-1">
                        <div class="small fw-bold text-truncate">${pdf.title || pdf.filename}</div>
                        <div class="text-muted" style="font-size: 0.75rem;">
                            ${pdf.category || 'Uncategorized'} • ${this.formatFileSize(pdf.file_size || 0)}
                        </div>
                    </div>
                    <div class="flex-shrink-0">
                        <span class="badge ${this.getStatusBadgeClass(pdf.status)}">
                            ${pdf.status || 'unknown'}
                        </span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    getStatusBadgeClass(status) {
        const classes = {
            'processed': 'bg-success',
            'processing': 'bg-warning',
            'failed': 'bg-danger',
            'uploaded': 'bg-info'
        };
        return classes[status] || 'bg-secondary';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async handleUpload(e) {
        e.preventDefault();

        const fileInput = document.getElementById('fileInput');
        const titleInput = document.getElementById('titleInput');
        const categoryInput = document.getElementById('categoryInput');

        if (!fileInput || !fileInput.files[0]) {
            this.showMessage('Please select a file', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        if (titleInput && titleInput.value) formData.append('title', titleInput.value);
        if (categoryInput && categoryInput.value) formData.append('category', categoryInput.value);

        try {
            this.showMessage('Uploading...', 'info');

            const response = await fetch(`${API_BASE_URL}/pdf/upload`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                this.showMessage('Upload successful!', 'success');

                // Reset form
                if (fileInput) fileInput.value = '';
                if (titleInput) titleInput.value = '';
                if (categoryInput) categoryInput.value = '';

                // Save to history
                this.saveToUploadHistory({
                    id: result.id,
                    filename: fileInput.files[0].name,
                    title: titleInput ? titleInput.value : '',
                    status: 'uploaded',
                    size: fileInput.files[0].size
                });

                // Reload data
                await this.loadPDFs();
                await this.loadStats();
            } else {
                const error = await response.json();
                this.showMessage(`Upload failed: ${error.detail || error.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showMessage('Upload failed: Network error', 'error');
        }
    }

    async handleBulkUpload(e) {
        e.preventDefault();

        const fileInput = document.getElementById('bulkFileInput');
        const categoryInput = document.getElementById('bulkCategoryInput');
        const descriptionInput = document.getElementById('bulkDescriptionInput');

        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            this.showMessage('Please select files to upload', 'warning');
            return;
        }

        try {
            this.showMessage('Starting bulk upload...', 'info');

            // Use bulk upload endpoint
            const formData = new FormData();
            Array.from(fileInput.files).forEach(file => {
                formData.append('files', file);
            });

            if (categoryInput && categoryInput.value) {
                formData.append('category', categoryInput.value);
            }
            if (descriptionInput && descriptionInput.value) {
                formData.append('description', descriptionInput.value);
            }

            const response = await fetch(`${API_BASE_URL}/bulk/start`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                this.showMessage(`Bulk upload started! Bulk ID: ${result.bulk_id}`, 'success');

                // Reset form
                fileInput.value = '';
                if (categoryInput) categoryInput.value = '';
                if (descriptionInput) descriptionInput.value = '';

                // Monitor progress
                this.monitorBulkUpload(result.bulk_id);

                // Reload data
                await this.loadPDFs();
                await this.loadStats();
            } else {
                const error = await response.json();
                this.showMessage(`Bulk upload failed: ${error.detail || error.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('Bulk upload error:', error);
            this.showMessage('Bulk upload failed: Network error', 'error');
        }
    }

    async monitorBulkUpload(bulkId) {
        const progressContainer = document.getElementById('bulkUploadProgress');
        const progressBar = document.getElementById('bulkProgressBar');
        const progressText = document.getElementById('bulkProgressText');
        const currentFileElement = document.getElementById('bulkCurrentFile');

        if (progressContainer) progressContainer.style.display = 'block';

        const checkProgress = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/bulk/progress/${bulkId}`);
                if (response.ok) {
                    const progress = await response.json();

                    if (progressBar) progressBar.style.width = `${progress.percentage}%`;
                    if (progressText) progressText.textContent = `${progress.percentage}%`;
                    if (currentFileElement) currentFileElement.textContent = progress.current_file || 'Processing...';

                    if (progress.status === 'completed') {
                        this.showMessage('Bulk upload completed!', 'success');
                        if (progressContainer) {
                            setTimeout(() => {
                                progressContainer.style.display = 'none';
                            }, 3000);
                        }
                        await this.loadPDFs();
                        await this.loadStats();
                        return;
                    } else if (progress.status === 'failed') {
                        this.showMessage('Bulk upload failed', 'error');
                        if (progressContainer) progressContainer.style.display = 'none';
                        return;
                    }

                    // Continue monitoring
                    setTimeout(checkProgress, 2000);
                }
            } catch (error) {
                console.error('Error monitoring bulk upload:', error);
            }
        };

        checkProgress();
    }

    async previewBulkUpload() {
        const fileInput = document.getElementById('bulkFileInput');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            this.showMessage('Please select files first', 'warning');
            return;
        }

        const files = Array.from(fileInput.files);
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));

        try {
            const response = await fetch(`${API_BASE_URL}/bulk/preview`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const preview = await response.json();
                this.showBulkPreviewModal(preview);
            } else {
                this.showMessage('Failed to preview files', 'error');
            }
        } catch (error) {
            console.error('Preview error:', error);
            this.showMessage('Preview failed: Network error', 'error');
        }
    }

    showBulkPreviewModal(preview) {
        const modal = document.getElementById('bulkPreviewModal');
        const content = document.getElementById('bulkPreviewContent');

        if (content) {
            content.innerHTML = `
                <div class="row">
                    <div class="col-md-6">
                        <h6>Upload Summary</h6>
                        <ul class="list-unstyled">
                            <li><strong>Total Files:</strong> ${preview.total_files}</li>
                            <li><strong>Valid Files:</strong> ${preview.valid_files}</li>
                            <li><strong>Total Size:</strong> ${this.formatFileSize(preview.total_size)}</li>
                            <li><strong>Duplicates:</strong> ${preview.duplicates || 0}</li>
                        </ul>
                    </div>
                    <div class="col-md-6">
                        <h6>File List</h6>
                        <div style="max-height: 200px; overflow-y: auto;">
                            ${preview.files.map(file => `
                                <div class="small d-flex justify-content-between align-items-center mb-1">
                                    <span class="text-truncate me-2" title="${file.name}">${file.name}</span>
                                    <span class="badge ${file.valid ? 'bg-success' : 'bg-danger'}">
                                        ${file.valid ? 'Valid' : 'Invalid'}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }

        if (modal && typeof bootstrap !== 'undefined') {
            new bootstrap.Modal(modal).show();
        }
    }

    confirmBulkUpload() {
        const modal = document.getElementById('bulkPreviewModal');
        if (modal && typeof bootstrap !== 'undefined') {
            bootstrap.Modal.getInstance(modal)?.hide();
        }

        const form = document.getElementById('bulkUploadForm');
        if (form) {
            form.dispatchEvent(new Event('submit'));
        }
    }

    async handleChat(e) {
        e.preventDefault();

        const messageInput = document.getElementById('messageInput');
        if (!messageInput) return;

        const message = messageInput.value.trim();
        if (!message) return;

        const queryType = document.querySelector('input[name="queryType"]:checked')?.value || 'rag';

        // Add user message to chat
        this.addChatMessage(message, 'user');
        messageInput.value = '';

        // Show typing indicator
        const typingId = this.addTypingIndicator();

        try {
            let endpoint, payload;

            if (queryType === 'rag') {
                endpoint = `${API_BASE_URL}/search/rag`;
                payload = { question: message };
            } else {
                endpoint = `${API_BASE_URL}/search/`;
                payload = { query: message };
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();

                if (queryType === 'rag') {
                    this.addRAGResponse(result);
                } else {
                    this.addSearchResults(result);
                }
            } else {
                const error = await response.json();
                this.addChatMessage(`Error: ${error.detail || error.error || 'Query failed'}`, 'system', 'error');
            }
        } catch (error) {
            console.error('Chat error:', error);
            this.addChatMessage(`Error: ${error.message}`, 'system', 'error');
        } finally {
            this.removeTypingIndicator(typingId);
            await this.loadStats();
        }
    }

        addChatMessage(content, type, variant = '') {
        const chatContainer = document.getElementById('chatContainer');
        if (!chatContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';

        let iconClass = '';
        let bgClass = '';

        switch (type) {
            case 'user':
                iconClass = 'fas fa-user';
                bgClass = 'bg-primary text-white';
                break;
            case 'assistant':
                iconClass = 'fas fa-robot';
                bgClass = 'bg-light';
                break;
            case 'system':
                iconClass = variant === 'error' ? 'fas fa-exclamation-triangle' : 'fas fa-info-circle';
                bgClass = variant === 'error' ? 'bg-danger text-white' : 'bg-info text-white';
                break;
        }

        messageDiv.innerHTML = `
            <div class="d-flex ${type === 'user' ? 'justify-content-end' : 'justify-content-start'}">
                <div class="message-bubble ${bgClass} p-3 rounded-3 position-relative" style="max-width: 80%;">
                    <div class="d-flex align-items-start">
                        <i class="${iconClass} me-2 mt-1"></i>
                        <div class="message-content">${content}</div>
                    </div>
                    <div class="message-time small mt-2 opacity-75">
                        ${new Date().toLocaleTimeString()}
                    </div>
                </div>
            </div>
        `;

        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return messageDiv;
    }

    addRAGResponse(result) {
        const content = `
            <div class="rag-response">
                <div class="mb-3">
                    <strong>Answer:</strong>
                    <div class="mt-2">${result.answer || 'No answer generated'}</div>
                </div>
                ${result.sources && result.sources.length > 0 ? `
                    <div class="sources">
                        <strong>Sources (${result.sources.length}):</strong>
                        <div class="mt-2">
                            ${result.sources.map((source, index) => `
                                <div class="source-item small bg-white p-2 rounded border mb-2">
                                    <div class="d-flex justify-content-between align-items-start mb-1">
                                        <div class="fw-bold">${source.title || source.filename || 'Unknown Document'}</div>
                                        <small class="text-muted">Score: ${source.score || 0}%</small>
                                    </div>
                                    <div class="text-muted mb-1">${source.content || 'No content available'}</div>
                                    <div class="small">
                                        <span class="badge bg-secondary me-1">${source.category || 'Uncategorized'}</span>
                                        <span class="text-muted">Page ${source.page_number || 1}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : '<div class="text-muted small mt-2">No sources found</div>'}
                ${result.confidence_score ? `
                    <div class="mt-2">
                        <small class="text-muted">
                            Confidence: ${result.confidence_score}% | 
                            Processing time: ${result.processing_time || 0}s
                        </small>
                    </div>
                ` : ''}
            </div>
        `;

        this.addChatMessage(content, 'assistant');
    }

    addSearchResults(results) {
        if (!results.results || results.results.length === 0) {
            this.addChatMessage('No results found for your search query.', 'assistant');
            return;
        }

        const content = `
            <div class="search-results">
                <div class="mb-2">
                    <strong>Found ${results.results.length} result(s):</strong>
                </div>
                ${results.results.map((result, index) => `
                    <div class="result-item bg-white p-3 rounded border mb-2 cursor-pointer" onclick="app.showFileDetails('${result.pdf_id}')">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div class="fw-bold">${result.title || result.filename}</div>
                            <small class="text-muted">Score: ${(result.score * 100).toFixed(1)}%</small>
                        </div>
                        <div class="small text-muted mb-2">${result.content}</div>
                        <div class="small">
                            <span class="badge bg-secondary">${result.category || 'Uncategorized'}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.addChatMessage(content, 'assistant');
    }

    addTypingIndicator() {
        const chatContainer = document.getElementById('chatContainer');
        if (!chatContainer) return null;

        const typingDiv = document.createElement('div');
        const id = Date.now();

        typingDiv.id = `typing-${id}`;
        typingDiv.className = 'chat-message typing-indicator';
        typingDiv.innerHTML = `
            <div class="d-flex justify-content-start">
                <div class="message-bubble bg-light p-3 rounded-3">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-robot me-2"></i>
                        <div class="typing-animation">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        chatContainer.appendChild(typingDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return id;
    }

    removeTypingIndicator(id) {
        if (id) {
            const typingElement = document.getElementById(`typing-${id}`);
            if (typingElement) {
                typingElement.remove();
            }
        }
    }

    clearChat() {
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            chatContainer.innerHTML = `
                <div class="welcome-message">
                    <div class="alert alert-info">
                        <h6><i class="fas fa-info-circle"></i> Welcome to RAG PDF Search!</h6>
                        <p class="mb-2">You can:</p>
                        <ul class="mb-0">
                            <li>Upload single PDF documents or bulk upload multiple files</li>
                            <li>Ask questions about your documents using RAG</li>
                            <li>Search for specific content across all documents</li>
                            <li>Get AI-powered answers with source citations</li>
                            <li>Preview files before bulk uploading</li>
                        </ul>
                    </div>
                </div>
            `;
        }
    }

    handleMessageKeydown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            const chatForm = document.getElementById('chatForm');
            if (chatForm) {
                chatForm.dispatchEvent(new Event('submit'));
            }
        }
    }

    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    validateFile(input) {
        if (!input.files[0]) return;

        const file = input.files[0];
        const extension = file.name.split('.').pop().toLowerCase();

        if (!this.CONFIG.ALLOWED_TYPES.includes(extension)) {
            this.showMessage(`Invalid file type. Only ${this.CONFIG.ALLOWED_TYPES.join(', ')} files are allowed.`, 'error');
            input.value = '';
            return;
        }

        if (file.size > this.CONFIG.MAX_FILE_SIZE) {
            this.showMessage(`File too large. Maximum size is ${this.formatFileSize(this.CONFIG.MAX_FILE_SIZE)}.`, 'error');
            input.value = '';
            return;
        }

        this.showMessage(`File "${file.name}" is ready for upload.`, 'success');
    }

    validateBulkFiles(input) {
        if (!input.files || input.files.length === 0) return;

        const files = Array.from(input.files);
        const validFiles = [];
        const invalidFiles = [];

        files.forEach(file => {
            const extension = file.name.split('.').pop().toLowerCase();
            if (this.CONFIG.ALLOWED_TYPES.includes(extension) && file.size <= this.CONFIG.MAX_FILE_SIZE) {
                validFiles.push(file);
            } else {
                invalidFiles.push(file);
            }
        });

        if (invalidFiles.length > 0) {
            this.showMessage(`${invalidFiles.length} files are invalid and will be skipped.`, 'warning');
        }

        if (validFiles.length > 0) {
            this.showMessage(`${validFiles.length} files are ready for bulk upload.`, 'success');
        } else {
            this.showMessage('No valid files selected.', 'error');
            input.value = '';
        }
    }

    async showFileDetails(fileId) {
        try {
            this.currentFileId = fileId;
            const modal = document.getElementById('fileDetailsModal');
            const content = document.getElementById('fileDetailsContent');

            if (modal && typeof bootstrap !== 'undefined') {
                new bootstrap.Modal(modal).show();
            }

            if (content) {
                content.innerHTML = `
                    <div class="text-center">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="mt-2">Loading file details...</p>
                    </div>
                `;
            }

            const response = await fetch(`${API_BASE_URL}/pdf/${fileId}`);
            if (response.ok) {
                const fileDetails = await response.json();
                this.displayFileDetails(fileDetails);
            } else {
                throw new Error('Failed to load file details');
            }
        } catch (error) {
            console.error('Error loading file details:', error);
            this.showMessage('Error loading file details', 'error');
        }
    }

    displayFileDetails(fileDetails) {
        const content = document.getElementById('fileDetailsContent');
        if (!content) return;

        content.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>File Information</h6>
                    <table class="table table-sm">
                        <tr><td><strong>Filename:</strong></td><td>${fileDetails.filename || 'N/A'}</td></tr>
                        <tr><td><strong>Title:</strong></td><td>${fileDetails.title || 'N/A'}</td></tr>
                        <tr><td><strong>Category:</strong></td><td>${fileDetails.category || 'N/A'}</td></tr>
                        <tr><td><strong>Status:</strong></td><td>
                            <span class="badge ${this.getStatusBadgeClass(fileDetails.status)}">
                                ${fileDetails.status || 'unknown'}
                            </span>
                        </td></tr>
                        <tr><td><strong>Upload Date:</strong></td><td>${fileDetails.upload_date ? new Date(fileDetails.upload_date).toLocaleString() : 'N/A'}</td></tr>
                        <tr><td><strong>File Size:</strong></td><td>${this.formatFileSize(fileDetails.file_size || 0)}</td></tr>
                        <tr><td><strong>Pages:</strong></td><td>${fileDetails.pages || 'N/A'}</td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6>Actions</h6>
                    <div class="d-grid gap-2">
                        <button class="btn btn-outline-primary btn-sm" onclick="app.viewFile('${fileDetails.id}')">
                            <i class="fas fa-eye"></i> View Document
                        </button>
                        <button class="btn btn-outline-success btn-sm" onclick="app.downloadFile('${fileDetails.id}')">
                            <i class="fas fa-download"></i> Download
                        </button>
                        <button class="btn btn-outline-warning btn-sm" onclick="app.reprocessFile('${fileDetails.id}')">
                            <i class="fas fa-redo"></i> Reprocess
                        </button>
                        <button class="btn btn-outline-info btn-sm" onclick="app.showSimilarDocuments('${fileDetails.id}')">
                            <i class="fas fa-search"></i> Find Similar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    viewFile(fileId) {
        window.open(`${API_BASE_URL}/pdf/${fileId}/view`, '_blank');
    }

    downloadFile(fileId) {
        const link = document.createElement('a');
        link.href = `${API_BASE_URL}/pdf/${fileId}/view`;
        link.download = '';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async reprocessFile(fileId = null) {
        const id = fileId || this.currentFileId;
        if (!id) return;

        try {
            this.showMessage('Starting reprocessing...', 'info');

            const response = await fetch(`${API_BASE_URL}/pdf/${id}/reprocess`, {
                method: 'POST'
            });

            if (response.ok) {
                const result = await response.json();
                this.showMessage('File reprocessing started successfully', 'success');

                const modal = document.getElementById('fileDetailsModal');
                if (modal && typeof bootstrap !== 'undefined') {
                    bootstrap.Modal.getInstance(modal)?.hide();
                }

                await this.loadPDFs();
                await this.loadStats();
            } else {
                const error = await response.json();
                throw new Error(error.detail || error.error || 'Reprocessing failed');
            }
        } catch (error) {
            console.error('Reprocess error:', error);
            this.showMessage(`Reprocessing failed: ${error.message}`, 'error');
        }
    }

    async deleteFile(fileId = null) {
        const id = fileId || this.currentFileId;
        if (!id) return;

        const confirmed = await this.showConfirmation(
            'Delete File',
            'Are you sure you want to delete this file? This action cannot be undone.'
        );

        if (!confirmed) return;

        try {
            this.showMessage('Deleting file...', 'info');

            const response = await fetch(`${API_BASE_URL}/pdf/${id}`, {
                method: 'DELETE'
            });
                        if (response.ok) {
                this.showMessage('File deleted successfully', 'success');

                const modal = document.getElementById('fileDetailsModal');
                if (modal && typeof bootstrap !== 'undefined') {
                    bootstrap.Modal.getInstance(modal)?.hide();
                }

                await this.loadPDFs();
                await this.loadStats();
            } else {
                const error = await response.json();
                throw new Error(error.detail || error.error || 'Deletion failed');
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showMessage(`Deletion failed: ${error.message}`, 'error');
        }
    }

    async showSimilarDocuments(fileId) {
        try {
            const response = await fetch(`${API_BASE_URL}/search/similar/${fileId}`);
            if (response.ok) {
                const similar = await response.json();
                this.displaySimilarDocuments(similar);
            } else {
                this.showMessage('Failed to find similar documents', 'error');
            }
        } catch (error) {
            console.error('Error finding similar documents:', error);
            this.showMessage('Error finding similar documents', 'error');
        }
    }

    displaySimilarDocuments(similar) {
        if (!similar.results || similar.results.length === 0) {
            this.addChatMessage('No similar documents found.', 'assistant');
            return;
        }

        const content = `
            <div class="similar-documents">
                <div class="mb-2">
                    <strong>Found ${similar.results.length} similar document(s):</strong>
                </div>
                ${similar.results.map((doc, index) => `
                    <div class="result-item bg-white p-3 rounded border mb-2 cursor-pointer" onclick="app.showFileDetails('${doc.id}')">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div class="fw-bold">${doc.title || doc.filename}</div>
                            <small class="text-muted">Similarity: ${(doc.similarity * 100).toFixed(1)}%</small>
                        </div>
                        <div class="small text-muted mb-2">${doc.description || 'No description available'}</div>
                        <div class="small">
                            <span class="badge bg-secondary">${doc.category || 'Uncategorized'}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.addChatMessage(content, 'assistant');
    }

    showUploadHistory() {
        const modal = document.getElementById('uploadHistoryModal');
        const content = document.getElementById('uploadHistoryContent');

        if (modal && typeof bootstrap !== 'undefined') {
            new bootstrap.Modal(modal).show();
        }

        if (content) {
            content.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-2">Loading upload history...</p>
                </div>
            `;
        }

        setTimeout(() => {
            const history = JSON.parse(localStorage.getItem('uploadHistory') || '[]');

            if (content) {
                if (history.length === 0) {
                    content.innerHTML = `
                        <div class="text-center text-muted">
                            <i class="fas fa-history fa-3x mb-3"></i>
                            <p>No upload history available</p>
                        </div>
                    `;
                    return;
                }

                content.innerHTML = `
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>File</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                    <th>Size</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${history.map(item => `
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <i class="fas fa-file-pdf text-danger me-2"></i>
                                                <div>
                                                    <div class="fw-bold">${item.filename}</div>
                                                    <small class="text-muted">${item.title || 'No title'}</small>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span class="badge ${this.getStatusBadgeClass(item.status)}">
                                                ${item.status}
                                            </span>
                                        </td>
                                        <td>${new Date(item.date).toLocaleString()}</td>
                                        <td>${this.formatFileSize(item.size)}</td>
                                        <td>
                                            <button class="btn btn-sm btn-outline-primary" onclick="app.showFileDetails('${item.id}')">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
        }, 1000);
    }

    clearUploadHistory() {
        localStorage.removeItem('uploadHistory');
        this.showMessage('Upload history cleared', 'success');

        const modal = document.getElementById('uploadHistoryModal');
        if (modal && typeof bootstrap !== 'undefined') {
            bootstrap.Modal.getInstance(modal)?.hide();
        }
    }

    showConfirmation(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmationModal');
            const titleElement = document.getElementById('confirmationModalLabel');
            const messageElement = document.getElementById('confirmationMessage');
            const confirmBtn = document.getElementById('confirmActionBtn');

            if (titleElement) titleElement.textContent = title;
            if (messageElement) messageElement.textContent = message;

            const handleConfirm = () => {
                if (modal && typeof bootstrap !== 'undefined') {
                    bootstrap.Modal.getInstance(modal)?.hide();
                }
                resolve(true);
            };

            const handleCancel = () => {
                resolve(false);
            };

            if (confirmBtn) confirmBtn.onclick = handleConfirm;

            if (modal) {
                modal.addEventListener('hidden.bs.modal', handleCancel, { once: true });
                if (typeof bootstrap !== 'undefined') {
                    new bootstrap.Modal(modal).show();
                }
            }
        });
    }

    showMessage(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastBody = document.getElementById('toastBody');
        const toastTime = document.getElementById('toastTime');
        const toastHeader = toast?.querySelector('.toast-header');

        if (!toast || !toastBody || !toastTime || !toastHeader) return;

        toastBody.textContent = message;
        toastTime.textContent = new Date().toLocaleTimeString();

        const iconElement = toastHeader.querySelector('i');
        if (iconElement) {
            iconElement.className = '';

            switch (type) {
                case 'success':
                    iconElement.className = 'fas fa-check-circle text-success me-2';
                    break;
                case 'error':
                    iconElement.className = 'fas fa-exclamation-triangle text-danger me-2';
                    break;
                case 'warning':
                    iconElement.className = 'fas fa-exclamation-circle text-warning me-2';
                    break;
                default:
                    iconElement.className = 'fas fa-info-circle text-primary me-2';
            }
        }

        if (typeof bootstrap !== 'undefined') {
            const bsToast = new bootstrap.Toast(toast);
            bsToast.show();
        }
    }

    saveToUploadHistory(fileData) {
        const history = JSON.parse(localStorage.getItem('uploadHistory') || '[]');
        history.unshift({
            ...fileData,
            date: new Date().toISOString()
        });

        if (history.length > 100) {
            history.splice(100);
        }

        localStorage.setItem('uploadHistory', JSON.stringify(history));
    }

    startPeriodicUpdates() {
        // Check connection every 30 seconds
        this.healthCheckInterval = setInterval(() => {
            this.checkConnection();
        }, this.CONFIG.HEALTH_CHECK_INTERVAL);

        // Update stats every 60 seconds
        setInterval(() => {
            this.loadStats();
        }, 60000);
    }

    destroy() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.app = new RAGChatApp();
    window.app.init();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (window.app) {
            window.app.destroy();
        }
    });

    // Handle offline/online events
    window.addEventListener('offline', () => {
        if (window.app) {
            window.app.showMessage('You are now offline. Some features may not work.', 'warning');
        }
    });

    window.addEventListener('online', () => {
        if (window.app) {
            window.app.showMessage('Connection restored.', 'success');
            window.app.checkConnection();
        }
    });

    // Handle visibility change for tab switching
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && window.app) {
            setTimeout(() => {
                window.app.checkConnection();
                window.app.loadStats();
            }, 1000);
        }
    });

    console.log('RAG Chat App fully loaded and initialized');
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    if (window.app) {
        window.app.showMessage('An unexpected error occurred. Please refresh the page.', 'error');
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    if (window.app) {
        window.app.showMessage('An unexpected error occurred. Please try again.', 'error');
    }
});

// Export for global access
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAGChatApp;
}

