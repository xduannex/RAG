// RAG Chat Application - Upload Manager
// Handles file uploads with progress tracking and validation

class UploadManager {
    constructor(ragClient) {
        this.ragClient = ragClient || window.ragClient;
        this.uploadQueue = [];
        this.isUploading = false;
        this.currentUpload = null;
        this.maxConcurrentUploads = 3;
        this.retryAttempts = 3;

        console.log('UploadManager initialized with ragClient');
        this.init();
    }

    init() {
        this.setupElements();
        this.setupEventListeners();
        this.setupDragAndDrop();
    }

    setupElements() {
        this.uploadForm = document.getElementById('uploadForm');
        this.fileInput = document.getElementById('fileInput');
        this.uploadArea = document.getElementById('uploadArea');
        this.uploadProgress = document.getElementById('uploadProgress');
        this.uploadStatus = document.getElementById('uploadStatus');
        this.progressBar = this.uploadProgress?.querySelector('.progress-bar');
        this.titleInput = document.getElementById('titleInput');
        this.categoryInput = document.getElementById('categoryInput');
    }

    setupEventListeners() {
        if (this.uploadForm) {
            this.uploadForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        if (this.uploadArea) {
            this.uploadArea.addEventListener('click', () => {
                if (this.fileInput) this.fileInput.click();
            });
        }
    }

    setupDragAndDrop() {
        if (!this.uploadArea) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, (e) => this.preventDefaults(e), false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, () => this.highlight(), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, () => this.unhighlight(), false);
        });

        this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e), false);
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    highlight() {
        this.uploadArea?.classList.add('drag-over');
    }

    unhighlight() {
        this.uploadArea?.classList.remove('drag-over');
    }

    handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        this.handleFiles(files);
    }

    handleFormSubmit(e) {
        e.preventDefault();
        if (this.fileInput?.files.length > 0) {
            this.handleFiles(this.fileInput.files);
        }
    }

    handleFileSelect(e) {
        this.handleFiles(e.target.files);
    }

    handleFiles(fileList) {
        const files = Array.from(fileList);
        console.log(`Processing ${files.length} files for upload`);

        // Validate files
        const validFiles = [];
        const errors = [];

        files.forEach(file => {
            const validation = this.ragClient.validateFile(file);
            if (validation.valid) {
                validFiles.push(file);
            } else {
                errors.push(`${file.name}: ${validation.errors.join(', ')}`);
            }
        });

        // Show validation errors
        if (errors.length > 0) {
            this.showErrors(errors);
        }

        // Upload valid files
        if (validFiles.length > 0) {
            this.queueUploads(validFiles);
        }
    }

    queueUploads(files) {
        const options = {
            title: this.titleInput?.value || '',
            category: this.categoryInput?.value || ''
        };

        files.forEach(file => {
            this.uploadQueue.push({
                file: file,
                options: { ...options },
                id: this.generateUploadId(),
                status: 'queued',
                progress: 0,
                attempts: 0
            });
        });

        this.processUploadQueue();
    }

    async processUploadQueue() {
        if (this.isUploading || this.uploadQueue.length === 0) return;

        this.isUploading = true;
        this.showUploadProgress();

        const activeUploads = [];

        while (this.uploadQueue.length > 0 || activeUploads.length > 0) {
            // Start new uploads up to concurrent limit
            while (activeUploads.length < this.maxConcurrentUploads && this.uploadQueue.length > 0) {
                const upload = this.uploadQueue.shift();
                activeUploads.push(this.uploadFile(upload));
            }

            // Wait for at least one upload to complete
            if (activeUploads.length > 0) {
                await Promise.race(activeUploads);
                // Remove completed uploads
                for (let i = activeUploads.length - 1; i >= 0; i--) {
                    if (activeUploads[i].completed) {
                        activeUploads.splice(i, 1);
                    }
                }
            }
        }

        this.isUploading = false;
        this.hideUploadProgress();
        this.resetForm();
    }

    async uploadFile(uploadItem) {
        const { file, options, id } = uploadItem;
        uploadItem.status = 'uploading';

        try {
            console.log(`Starting upload: ${file.name}`);
            this.updateUploadStatus(`Uploading ${file.name}...`);

            const formData = this.ragClient.createUploadFormData(file, options);

            const result = await this.ragClient.uploadDocument(formData, (progress) => {
                uploadItem.progress = progress;
                this.updateUploadProgress(uploadItem);
            });

            if (result.success) {
                uploadItem.status = 'completed';
                uploadItem.completed = true;

                console.log(`Upload completed: ${file.name}`);
                this.handleUploadSuccess(result.data, file);

                // Dispatch event for other components
                const event = new CustomEvent('documentUploaded', {
                    detail: {
                        document: result.data,
                        filename: file.name
                    }
                });
                document.dispatchEvent(event);

            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error(`Upload failed: ${file.name}`, error);
            uploadItem.attempts++;

            if (uploadItem.attempts < this.retryAttempts) {
                uploadItem.status = 'retrying';
                console.log(`Retrying upload: ${file.name} (attempt ${uploadItem.attempts + 1})`);

                // Add back to queue for retry
                setTimeout(() => {
                    this.uploadQueue.unshift(uploadItem);
                }, 2000 * uploadItem.attempts); // Exponential backoff

            } else {
                uploadItem.status = 'failed';
                uploadItem.completed = true;
                this.handleUploadError(error, file);
            }
        }

        return uploadItem;
    }

    updateUploadProgress(uploadItem) {
        if (this.progressBar) {
            this.progressBar.style.width = `${uploadItem.progress}%`;
        }

        this.updateUploadStatus(`Uploading ${uploadItem.file.name}... ${Math.round(uploadItem.progress)}%`);
    }

    updateUploadStatus(message) {
        if (this.uploadStatus) {
            this.uploadStatus.textContent = message;
        }
    }

    showUploadProgress() {
        if (this.uploadProgress) {
            this.uploadProgress.style.display = 'block';
        }
    }

    hideUploadProgress() {
        if (this.uploadProgress) {
            this.uploadProgress.style.display = 'none';
        }

        if (this.progressBar) {
            this.progressBar.style.width = '0%';
        }
    }

    handleUploadSuccess(document, file) {
        const message = `${file.name} uploaded successfully`;
        console.log(message, document);

        if (window.showStatus) {
            window.showStatus(message, 'success');
        }
    }

    handleUploadError(error, file) {
        const message = `Failed to upload ${file.name}: ${error.message}`;
        console.error(message);

        if (window.showStatus) {
            window.showStatus(message, 'error');
        }
    }

    showErrors(errors) {
        const message = 'File validation errors:\n' + errors.join('\n');
        console.error(message);

        if (window.showStatus) {
            window.showStatus('Some files were rejected due to validation errors', 'warning');
        }
    }

    resetForm() {
        if (this.uploadForm) {
            this.uploadForm.reset();
        }

        if (this.titleInput) this.titleInput.value = '';
        if (this.categoryInput) this.categoryInput.value = '';
    }

    generateUploadId() {
        return 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Public API methods
    async uploadSingleFile(file, options = {}) {
        const validation = this.ragClient.validateFile(file);
        if (!validation.valid) {
            throw new Error('File validation failed: ' + validation.errors.join(', '));
        }

        const formData = this.ragClient.createUploadFormData(file, options);
        const result = await this.ragClient.uploadDocument(formData);

        if (!result.success) {
            throw new Error(result.error);
        }

        return result.data;
    }

    getUploadQueue() {
        return [...this.uploadQueue];
    }

    clearUploadQueue() {
        this.uploadQueue = [];
    }

    isUploadInProgress() {
        return this.isUploading;
    }

    // Cleanup method
    cleanup() {
        this.uploadQueue = [];
        this.isUploading = false;
        this.currentUpload = null;
    }
}

// Create global instance if it doesn't exist
if (!window.uploadManager) {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.ragClient) {
            window.uploadManager = new UploadManager(window.ragClient);
            console.log('Global UploadManager created');
        }
    });
}

console.log('Upload manager loaded');