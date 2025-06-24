// RAG Chat Application - Upload Management
// Handles file uploads and processing

class UploadManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl || window.API_BASE_URL;
        this.uploadQueue = [];
        this.isUploading = false;
        this.maxFileSize = 100 * 1024 * 1024; // 100MB
        this.maxFiles = 100;
        this.allowedTypes = [
    'pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'csv',
    'xlsx', 'xlsm', 'xls', 'pptx', 'ppt', 'json', 'xml', 'html', 'htm',  // Added xlsm
    'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'tif', 'gif', 'webp'
];
        this.init();
    }

    init() {
        console.log('Initializing Upload Manager...');
        this.setupElements();
        this.setupEventListeners();
        window.uploadManager = this;
        console.log('Upload manager initialized');
    }

    setupElements() {
        this.uploadForm = document.getElementById('uploadForm');
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.titleInput = document.getElementById('titleInput');
        this.categoryInput = document.getElementById('categoryInput');
        this.uploadProgress = document.getElementById('uploadProgress');
        this.uploadStatus = document.getElementById('uploadStatus');

        if (!this.uploadForm || !this.uploadArea || !this.fileInput) {
            console.error('Required upload elements not found');
        }
    }

    setupEventListeners() {
        if (this.uploadForm) {
            this.uploadForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        if (this.uploadArea) {
            // Click to browse
            this.uploadArea.addEventListener('click', () => {
                if (this.fileInput) {
                    this.fileInput.click();
                }
            });

            // Drag and drop
            this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
            this.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        }

        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        // Prevent default drag behaviors on document
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());
    }

    handleFormSubmit(e) {
        e.preventDefault();

        if (this.isUploading) {
            console.log('Upload already in progress');
            return;
        }

        const files = this.fileInput?.files;
        if (!files || files.length === 0) {
            if (window.showStatus) {
                window.showStatus('Please select files to upload', 'warning');
            }
            return;
        }

        this.uploadFiles(Array.from(files));
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.uploadArea) {
            this.uploadArea.classList.add('dragover');
        }
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.uploadArea) {
            this.uploadArea.classList.remove('dragover');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        if (this.uploadArea) {
            this.uploadArea.classList.remove('dragover');
        }

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            this.uploadFiles(files);
        }
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            this.uploadFiles(files);
        }
    }

    async uploadFiles(files) {
        console.log('Uploading files:', files.map(f => f.name));

        // Validate files
        const validationResult = this.validateFiles(files);
        if (!validationResult.valid) {
            if (window.showStatus) {
                window.showStatus(validationResult.message, 'error');
            }
            return;
        }

        this.isUploading = true;
        this.showProgress(true);

        try {
            const results = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                this.updateProgress((i / files.length) * 100, `Uploading ${file.name}...`);

                try {
                    const result = await this.uploadSingleFile(file);
                    results.push({ file: file.name, success: true, result });
                } catch (error) {
                    console.error(`Failed to upload ${file.name}:`, error);
                    results.push({ file: file.name, success: false, error: error.message });
                }
            }

            this.handleUploadResults(results);

        } catch (error) {
            console.error('Upload process failed:', error);
            if (window.showStatus) {
                window.showStatus('Upload failed: ' + error.message, 'error');
            }
        } finally {
            this.isUploading = false;
            this.showProgress(false);
            this.resetForm();
        }
    }

    async uploadSingleFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        // Add optional metadata
        if (this.titleInput?.value.trim()) {
            formData.append('title', this.titleInput.value.trim());
        }

        if (this.categoryInput?.value.trim()) {
            formData.append('category', this.categoryInput.value.trim());
        }

        const response = await fetch(`${this.apiBaseUrl}/pdf/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errorData.detail || response.statusText}`);
        }

        return await response.json();
    }

    validateFiles(files) {
        // Check file count
        if (files.length > this.maxFiles) {
            return {
                valid: false,
                message: `Too many files. Maximum ${this.maxFiles} files allowed.`
            };
        }

        // Check each file
        for (const file of files) {
            // Check file size
            if (file.size > this.maxFileSize) {
                return {
                    valid: false,
                    message: `File "${file.name}" is too large. Maximum size is ${window.formatFileSize(this.maxFileSize)}.`
                };
            }

            // Check file type
            const extension = file.name.split('.').pop()?.toLowerCase();
            if (!extension || !this.allowedTypes.includes(extension)) {
                return {
                    valid: false,
                    message: `File type ".${extension}" is not supported for file "${file.name}".`
                };
            }
        }

        return { valid: true };
    }

    handleUploadResults(results) {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        if (successful.length > 0) {
            const message = `Successfully uploaded ${successful.length} file${successful.length !== 1 ? 's' : ''}`;
            if (window.showStatus) {
                window.showStatus(message, 'success');
            }

            // Refresh document list
            if (window.documentManager) {
                window.documentManager.loadDocuments();
            }

            // Update stats
            if (window.statsManager) {
                window.statsManager.loadStats();
            }
        }

        if (failed.length > 0) {
            const message = `Failed to upload ${failed.length} file${failed.length !== 1 ? 's' : ''}`;
            if (window.showStatus) {
                window.showStatus(message, 'error');
            }

            // Show detailed errors
            failed.forEach(result => {
                console.error(`Upload failed for ${result.file}:`, result.error);
            });
        }
    }

    showProgress(show) {
        if (this.uploadProgress) {
            this.uploadProgress.style.display = show ? 'block' : 'none';
        }
    }

    updateProgress(percentage, status) {
        const progressBar = this.uploadProgress?.querySelector('.progress-bar');
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }

        if (this.uploadStatus) {
            this.uploadStatus.textContent = status || 'Uploading...';
        }
    }

    resetForm() {
        if (this.uploadForm) {
            this.uploadForm.reset();
        }

        if (this.uploadArea) {
            this.uploadArea.classList.remove('dragover');
        }

        this.updateProgress(0, '');
    }

    // Public API methods
    isUploadInProgress() {
        return this.isUploading;
    }

    getUploadQueue() {
        return [...this.uploadQueue];
    }

    getSupportedTypes() {
        return [...this.allowedTypes];
    }

    getMaxFileSize() {
        return this.maxFileSize;
    }

    getMaxFiles() {
        return this.maxFiles;
    }
}

// Initialize upload manager when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (window.API_BASE_URL) {
        window.uploadManager = new UploadManager(window.API_BASE_URL);
        console.log('Upload manager created and registered');
    } else {
        console.error('API_BASE_URL not defined, cannot initialize upload manager');
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UploadManager;
}

console.log('Upload manager loaded');
