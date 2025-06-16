// RAG Chat Application - File Upload Management
// Handles file uploads, drag & drop, and upload progress

class FileUploadManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
        this.activeUploads = new Map();
        this.uploadHistory = [];
        this.maxConcurrentUploads = 3;
        this.init();
    }

    init() {
        console.log('Initializing Upload Manager...');
        this.setupDragAndDrop();
        this.setupEventListeners();
        this.loadUploadHistory();

        // Register this manager globally
        if (window.RAG_MANAGERS) {
            window.RAG_MANAGERS.register('uploadManager', this);
        } else {
            window.uploadManager = this;
        }

        console.log('Upload manager initialized');
    }

    setupEventListeners() {
        // File input change event
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileInputChange(e));
        }

        // Upload form submission
        const uploadForm = document.getElementById('uploadForm');
        if (uploadForm) {
            uploadForm.addEventListener('submit', (e) => this.handleUploadSubmit(e));
        }
    }

    setupDragAndDrop() {
        const uploadArea = document.getElementById('uploadArea');
        if (!uploadArea) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => {
                uploadArea.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => {
                uploadArea.classList.remove('drag-over');
            }, false);
        });

        uploadArea.addEventListener('drop', (e) => this.handleDrop(e), false);

        // Click to browse files
        uploadArea.addEventListener('click', () => {
            const fileInput = document.getElementById('fileInput');
            if (fileInput) fileInput.click();
        });
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    handleDrop(e) {
        try {
            const dt = e.dataTransfer;
            const files = Array.from(dt.files);

            if (files.length > 0) {
                this.handleMultipleFiles(files);
            }
        } catch (error) {
            console.error('Error handling file drop:', error);
            if (window.showStatus) {
                window.showStatus('Error handling dropped files', 'error');
            }
        }
    }

    handleFileInputChange(e) {
        try {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                if (files.length === 1) {
                    this.updateUploadAreaText(files[0].name);
                } else {
                    this.handleMultipleFiles(files);
                }
            }
        } catch (error) {
            console.error('Error handling file input change:', error);
        }
    }

    updateUploadAreaText(fileName) {
        const uploadArea = document.getElementById('uploadArea');
        const uploadText = uploadArea?.querySelector('.upload-text');
        if (uploadText) {
            uploadText.textContent = `Selected: ${fileName}`;
        }
    }

    async handleUploadSubmit(e) {
        e.preventDefault();

        // Check if connected (assuming this is available globally)
        if (window.RAG_STATE && !window.RAG_STATE.isConnected()) {
            if (window.showStatus) {
                window.showStatus('Not connected to server. Please wait for connection to be established.', 'error');
            }
            return;
        }

        try {
            const titleInput = document.getElementById('titleInput');
            const categoryInput = document.getElementById('categoryInput');
            const fileInput = document.getElementById('fileInput');

            if (!fileInput || !fileInput.files || !fileInput.files[0]) {
                if (window.showStatus) {
                    window.showStatus('Please select a file to upload.', 'error');
                }
                return;
            }

            const file = fileInput.files[0];
            const options = {
                title: titleInput?.value?.trim() || '',
                category: categoryInput?.value?.trim() || ''
            };

            // Show upload progress
            this.showUploadProgress(true);

            const result = await this.uploadFile(file, options);

            // Clear form
            this.resetUploadForm();

            // Show success message
            if (window.showStatus) {
                window.showStatus(`File "${result.filename || 'Unknown'}" uploaded successfully!`, 'success');
            }

            // Reload documents list and stats
            if (window.documentManager && typeof window.documentManager.loadDocuments === 'function') {
                await window.documentManager.loadDocuments();
            }
            if (window.loadStats && typeof window.loadStats === 'function') {
                await window.loadStats();
            }

        } catch (error) {
            console.error('Upload error:', error);
            if (window.showStatus) {
                window.showStatus('Failed to upload file: ' + error.message, 'error');
            }
        } finally {
            this.showUploadProgress(false);
        }
    }

    async handleMultipleFiles(files) {
        const maxBulkFiles = window.APP_CONFIG?.upload?.maxBulkFiles || 10;

        if (files.length > maxBulkFiles) {
            if (window.showStatus) {
                window.showStatus(`Too many files. Maximum ${maxBulkFiles} files allowed.`, 'error');
            }
            return;
        }

        const results = [];
        let successCount = 0;
        let failedCount = 0;

        for (const file of files) {
            try {
                const result = await this.uploadFile(file);
                results.push({ file: file.name, success: true, result });
                successCount++;
            } catch (error) {
                results.push({ file: file.name, success: false, error: error.message });
                failedCount++;
            }
        }

        if (failedCount === 0) {
            if (window.showStatus) {
                window.showStatus(`All ${successCount} files uploaded successfully!`, 'success');
            }
        } else if (successCount === 0) {
            if (window.showStatus) {
                window.showStatus(`Failed to upload all ${files.length} files`, 'error');
            }
        } else {
            if (window.showStatus) {
                window.showStatus(`Uploaded ${successCount} files, ${failedCount} failed`, 'warning');
            }
        }

        // Show detailed results
        this.showUploadResults(results);

        // Reload documents and stats
        if (window.documentManager && typeof window.documentManager.loadDocuments === 'function') {
            await window.documentManager.loadDocuments();
        }
        if (window.loadStats && typeof window.loadStats === 'function') {
            await window.loadStats();
        }
    }

    async uploadFile(file, options = {}) {
        // Validate file
        this.validateFile(file);

        const formData = new FormData();
        formData.append('file', file);

        if (options.title) {
            formData.append('title', options.title);
        }

        if (options.category) {
            formData.append('category', options.category);
        }

        // Create upload tracking
        const uploadId = Date.now() + Math.random();
        this.activeUploads.set(uploadId, {
            file: file.name,
            size: file.size,
            startTime: Date.now()
        });

        try {
            const response = await fetch(`${this.apiBaseUrl}/pdf/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Upload failed: ${response.statusText} - ${errorData.detail || ''}`);
            }

            const result = await response.json();

            // Record successful upload
            this.recordUpload(file, true, result);

            return result;

        } catch (error) {
            // Record failed upload
            this.recordUpload(file, false, null, error.message);
            throw error;
        } finally {
            this.activeUploads.delete(uploadId);
        }
    }

    validateFile(file) {
        const allowedTypes = window.APP_CONFIG?.upload?.allowedTypes || ['pdf', 'doc', 'docx', 'txt'];
        const maxFileSize = window.APP_CONFIG?.upload?.maxFileSize || 50 * 1024 * 1024;

        // Check file type
        const fileExtension = file.name.toLowerCase().split('.').pop();
        if (!allowedTypes.includes(fileExtension)) {
            throw new Error(`File type .${fileExtension} is not supported. Allowed types: ${allowedTypes.join(', ')}`);
        }

        // Check file size
        if (file.size > maxFileSize) {
            throw new Error(`File too large. Maximum size: ${this.formatFileSize(maxFileSize)}`);
        }

        // Check if file is empty
        if (file.size === 0) {
            throw new Error('File is empty');
        }
    }

    recordUpload(file, success, result = null, error = null) {
        const record = {
            filename: file.name,
            size: file.size,
            type: file.type,
            success,
            timestamp: Date.now(),
            result,
            error
        };

        this.uploadHistory.unshift(record);

        // Limit history size
        if (this.uploadHistory.length > 100) {
            this.uploadHistory = this.uploadHistory.slice(0, 100);
        }

        // Save to localStorage
        try {
            localStorage.setItem('rag_upload_history', JSON.stringify(this.uploadHistory.slice(0, 20)));
        } catch (e) {
            console.warn('Failed to save upload history:', e);
        }
    }

    showUploadProgress(show) {
        try {
            const progressDiv = document.getElementById('uploadProgress');
            const uploadForm = document.getElementById('uploadForm');
            const uploadButton = uploadForm?.querySelector('button[type="submit"]');

            if (show) {
                if (progressDiv) progressDiv.style.display = 'block';
                if (uploadButton) {
                    uploadButton.disabled = true;
                    uploadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
                }
            } else {
                if (progressDiv) progressDiv.style.display = 'none';
                if (uploadButton) {
                    uploadButton.disabled = false;
                    uploadButton.innerHTML = '<i class="fas fa-upload"></i> Upload Document';
                }
            }
        } catch (error) {
            console.error('Error updating upload progress:', error);
        }
    }

    resetUploadForm() {
        try {
            const uploadForm = document.getElementById('uploadForm');
            if (uploadForm) {
                uploadForm.reset();
            }

            // Reset upload area text
            const uploadArea = document.getElementById('uploadArea');
            const uploadText = uploadArea?.querySelector('.upload-text');
            if (uploadText) {
                uploadText.textContent = 'Drop files here or click to browse';
            }
        } catch (error) {
            console.error('Error resetting upload form:', error);
        }
    }

    showUploadResults(results) {
        // Create results modal or notification
        const resultsHtml = results.map(result => `
            <div class="upload-result ${result.success ? 'success' : 'error'}">
                <i class="fas fa-${result.success ? 'check-circle' : 'exclamation-circle'}"></i>
                <span class="filename">${this.escapeHtml(result.file)}</span>
                ${result.success ? 
                    '<span class="status">Uploaded</span>' : 
                    `<span class="error-msg">${this.escapeHtml(result.error)}</span>`
                }
            </div>
        `).join('');

        // Show in a temporary modal or notification
        this.showResultsModal(resultsHtml);
    }

    showResultsModal(content) {
        // Create temporary modal
        const modal = document.createElement('div');
        modal.className = 'upload-results-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        modal.innerHTML = `
            <div class="modal-content" style="background: white; padding: 20px; border-radius: 8px; max-width: 500px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3>Upload Results</h3>
                    <button class="modal-close" onclick="this.closest('.upload-results-modal').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 10000);
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

    getUploadStats() {
        const successful = this.uploadHistory.filter(u => u.success);
        const failed = this.uploadHistory.filter(u => !u.success);
        const totalSize = successful.reduce((sum, u) => sum + u.size, 0);

        return {
            total: this.uploadHistory.length,
            successful: successful.length,
            failed: failed.length,
            totalSize,
            averageSize: successful.length > 0 ? totalSize / successful.length : 0,
            recentUploads: this.uploadHistory.slice(0, 5)
        };
    }

    clearUploadHistory() {
        this.uploadHistory = [];
        localStorage.removeItem('rag_upload_history');
        if (window.showStatus) {
            window.showStatus('Upload history cleared', 'success');
        }
    }

    loadUploadHistory() {
            const saved = localStorage.getItem('rag_upload_history');
            if (saved) {
                this.uploadHistory = JSON.parse(saved);
            }
        } catch (error) {
            console.warn('Failed to load upload history:', error);
            return [];
        }
    }}

// Initialize upload manager when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (typeof API_BASE_URL !== 'undefined') {
        window.uploadManager = new FileUploadManager(API_BASE_URL);
        console.log('Upload manager created and registered');
    } else {
        console.error('API_BASE_URL not defined, cannot initialize upload manager');
    }
});

// Global functions for backward compatibility
window.handleUploadSubmit = (e) => {
    if (window.uploadManager) {
        window.uploadManager.handleUploadSubmit(e);
    } else {
        console.error('Upload manager not available');
    }
};

console.log('Upload manager script loaded');
