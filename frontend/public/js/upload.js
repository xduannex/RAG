// RAG Chat Application - Upload Manager
// Handles file uploads with progress tracking and validation

class UploadManager {
    constructor(ragClient) {
        this.ragClient = ragClient; // Directly assign the client
        this.isUploading = false;

        // The init call is now safely handled by the DOMContentLoaded listener below
        this.init();
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

        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        this.fileInput.files = dataTransfer.files;

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

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const progress = Math.round(((i) / files.length) * 100);
                this.updateProgress(progress, `Uploading ${i + 1}/${files.length}: ${file.name}...`);

                // This is where the error occurred. Now this.ragClient is guaranteed to exist.
                const result = await this.ragClient.upload(file, options);
                if (!result.success) {
                    throw new Error(result.error || `Failed to upload ${file.name}`);
                }
            }

            this.updateProgress(100, `Successfully uploaded ${files.length} file(s)!`);
            if (this.progressBar) this.progressBar.classList.add('bg-success');
            this.showNotification(`Upload complete: ${files.length} file(s) processed.`, 'success');

            if (window.documentsManager?.loadDocuments) window.documentsManager.loadDocuments();
            if (window.loadStats) window.loadStats();

        } catch (error) {
            console.error('Upload failed:', error);
            this.updateProgress(100, `Upload failed: ${error.message}`);
            if (this.progressBar) this.progressBar.classList.add('bg-danger');
            this.showNotification(`Upload failed: ${error.message}`, 'error');
        } finally {
            this.isUploading = false;
            this.resetForm();
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
        if (window.showStatus) {
            window.showStatus(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
            if (type === 'error') alert(`ERROR: ${message}`);
        }
    }
}

// CRITICAL FIX: Wrap initialization in a DOMContentLoaded listener.
// This ensures that this code runs only after ragClient.js has created window.ragClient.
document.addEventListener('DOMContentLoaded', () => {
    if (window.ragClient) {
        if (!window.uploadManager) {
            window.uploadManager = new UploadManager(window.ragClient);
        }
    } else {
        console.error('RAG Client not found. UploadManager could not be initialized.');
    }
});
