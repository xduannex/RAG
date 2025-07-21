// RAG Chat Application - Upload Manager
// Handles file uploads with progress tracking and validation

class UploadManager {
    constructor(ragClient) {
        this.ragClient = ragClient || window.ragClient;
        this.isUploading = false;

        console.log('UploadManager initialized');
        // Defer initialization until DOM is loaded to ensure all elements are available
        document.addEventListener('DOMContentLoaded', () => this.init());
    }

    init() {
        this.setupElements();
        this.setupEventListeners();
        this.setupDragAndDrop();
        console.log('UploadManager elements and listeners are set up.');
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
        this.uploadAreaText = this.uploadArea?.querySelector('.upload-text');
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
            this.uploadArea.addEventListener(eventName, this.preventDefaults, false);
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

    handleFileSelect(e) {
        this.handleFiles(e.target.files);
    }

    handleFiles(fileList) {
        const files = Array.from(fileList);
        if (files.length === 0) return;

        // Update the file input so the form knows about the dropped/selected files
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        this.fileInput.files = dataTransfer.files;

        // Update UI to show selected files
        if (this.uploadAreaText) {
            if (files.length === 1) {
                this.uploadAreaText.textContent = `File selected: ${files[0].name}`;
            } else {
                this.uploadAreaText.textContent = `${files.length} files selected`;
            }
        }
    }

    handleFormSubmit(e) {
        e.preventDefault();
        if (this.isUploading) {
            this.showNotification('An upload is already in progress.', 'warning');
            return;
        }

        const files = this.fileInput?.files;
        if (!files || files.length === 0) {
            this.showNotification('Please select one or more files to upload.', 'error');
            return;
        }

        this.uploadFiles(Array.from(files));
    }

    async uploadFiles(files) {
        this.isUploading = true;
        this.showProgress();
        if (this.progressBar) this.progressBar.classList.remove('bg-danger', 'bg-success');

        try {
            const options = {
                title: this.titleInput?.value || '',
                category: this.categoryInput?.value || ''
            };

            // Simplified: Upload files one by one for clearer progress and error handling
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const progress = Math.round(((i) / files.length) * 100);
                this.updateProgress(progress, `Uploading ${i + 1}/${files.length}: ${file.name}...`);

                const result = await this.ragClient.upload(file, options);
                if (!result.success) {
                    // Stop on the first error to provide clear feedback
                    throw new Error(result.error || `Failed to upload ${file.name}`);
                }
            }

            this.updateProgress(100, `Successfully uploaded ${files.length} file(s)!`);
            if (this.progressBar) this.progressBar.classList.add('bg-success');
            this.showNotification(`Upload complete: ${files.length} file(s) processed.`, 'success');

            // Refresh documents list and stats in the UI
            if (window.documentsManager?.loadDocuments) window.documentsManager.loadDocuments();
            if (window.loadStats) window.loadStats();

        } catch (error) {
            console.error('Upload failed:', error);
            this.updateProgress(100, `Upload failed: ${error.message}`);
            if (this.progressBar) this.progressBar.classList.add('bg-danger');
            this.showNotification(`Upload failed: ${error.message}`, 'error');
        } finally {
            // CRITICAL FIX: Always reset the uploading state to prevent the UI from hanging
            this.isUploading = false;
            this.resetForm();
            // Hide progress bar after a delay to allow user to see the final status
            setTimeout(() => this.hideProgress(), 5000);
        }
    }

    showProgress() {
        if (this.uploadProgress) this.uploadProgress.style.display = 'block';
    }

    hideProgress() {
        if (this.uploadProgress) this.uploadProgress.style.display = 'none';
    }

    updateProgress(percentage, message) {
        if (this.progressBar) {
            this.progressBar.style.width = `${percentage}%`;
        }
        if (this.uploadStatus) {
            this.uploadStatus.textContent = message;
        }
    }

    resetForm() {
        if (this.uploadForm) this.uploadForm.reset();
        if (this.uploadAreaText) {
            this.uploadAreaText.textContent = 'Drop files here or click to browse';
        }
    }

    showNotification(message, type = 'info') {
        // Assumes a global showStatus or similar function exists (from a notifications.js file)
        if (window.showStatus) {
            window.showStatus(message, type);
        } else {
            // Fallback if the notification system isn't available
            console.log(`[${type.toUpperCase()}] ${message}`);
            if (type === 'error') alert(`ERROR: ${message}`);
        }
    }
}

// Global instance initialization, ensuring it only runs once
if (!window.uploadManager) {
    // The constructor now handles waiting for DOMContentLoaded
    window.uploadManager = new UploadManager(window.ragClient);
}
