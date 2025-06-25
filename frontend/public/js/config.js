// RAG Chat Application - Configuration

// Dynamic base URL configuration - SINGLE SOURCE OF TRUTH
function getBaseUrl() {
    const currentHost = window.location.hostname;
    const currentProtocol = window.location.protocol;

    // Check for URL parameter override
    const envApiUrl = window.location.search.includes('api_url=')
        ? new URLSearchParams(window.location.search).get('api_url')
        : null;

    if (envApiUrl) {
        return envApiUrl;
    }

    // Check if we're on localhost/127.0.0.1 (true development)
    const isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';

    // Check if we're on a local network IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    const isLocalNetwork = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(currentHost);

    // For localhost, use localhost for API
    if (isLocalhost) {
        return 'http://localhost:8000';
    }

    // For local network IPs, use same IP with API port
    if (isLocalNetwork) {
        return `${currentProtocol}//${currentHost}:8000`;
    }

    // For production, use same host with API port
    return `${currentProtocol}//${currentHost}:8000`;
}

// Initialize base URL immediately - UNIFIED SOURCE
window.API_BASE_URL = getBaseUrl();

window.APP_CONFIG = {
    // API Configuration
    api: {
        baseUrl: window.API_BASE_URL, // Reference the unified global
        timeout: 30000, // 30 seconds
        retryAttempts: 3,
        retryDelay: 1000 // 1 second
    },

    // File Upload Configuration
    upload: {
        maxFileSize: 100 * 1024 * 1024, // 100MB
        maxBulkFiles: 50, // Maximum files in bulk upload
        allowedTypes: [
            // Documents
            'pdf', 'docx', 'doc', 'txt', 'md', 'rtf',
            // Spreadsheets
            'xlsx', 'xls', 'csv',
            // Presentations
            'pptx', 'ppt',
            // Images (with OCR support)
            'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'tif', 'gif', 'webp',
            // Data formats
            'json', 'xml', 'html', 'htm'
        ],
        chunkSize: 1024 * 1024, // 1MB chunks for large file uploads
        allowedMimeTypes: [
            // Documents
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/markdown',
            'application/rtf',
            // Spreadsheets
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv',
            // Presentations
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            // Images
            'image/jpeg',
            'image/png',
            'image/bmp',
            'image/tiff',
            'image/gif',
            'image/webp',
            // Data formats
            'application/json',
            'application/xml',
            'text/xml',
            'text/html'
        ]
    },

    // Search Configuration
    search: {
        defaultLimit: 10,
        maxLimit: 100,
        similarityThreshold: 0.3,
        ragModel: 'llama3.2:latest',
        maxContextLength: 4000,
        suggestionsLimit: 5
    },

    // Chat Configuration
    chat: {
        maxMessageLength: 2000,
        maxHistorySize: 100,
        typingIndicatorDelay: 500,
        autoSaveInterval: 30000 // 30 seconds
    },

    // UI Configuration
    ui: {
        theme: 'light', // 'light' or 'dark'
        animationDuration: 300,
        notificationTimeout: 5000,
        autoRefreshInterval: 60000 // 1 minute
    },

    // API Endpoints (relative paths only)
    endpoints: {
        // Document endpoints
        uploadDocument: '/pdf/upload',
        listDocuments: '/pdf/',
        deleteDocument: '/pdf/{id}',
        getDocument: '/pdf/{id}',
        downloadDocument: '/pdf/{id}/download',
        documentChunks: '/pdf/{id}/chunks',

        // Search endpoints
        search: '/search/',
        ragQuery: '/search/rag',

        // Health check
        health: '/health',

        // Stats
        getStats: '/stats'
    },

    // Error Messages
    errorMessages: {
        networkError: 'Network connection failed. Please check your internet connection.',
        serverError: 'Server error occurred. Please try again later.',
        uploadError: 'File upload failed. Please check the file and try again.',
        searchError: 'Search failed. Please try again.',
        documentNotFound: 'Document not found.',
        invalidFileType: 'Invalid file type. Please select a supported file format.',
        fileTooLarge: 'File size exceeds the maximum limit.',
        noDocuments: 'No documents found. Please upload some documents first.'
    },

    // Success Messages
    successMessages: {
        uploadSuccess: 'File uploaded successfully!',
        deleteSuccess: 'Document deleted successfully!',
        searchComplete: 'Search completed successfully.',
        settingsSaved: 'Settings saved successfully.'
    }
};

// Utility function to get full API URL - USE THIS IN ALL OTHER FILES
window.getApiUrl = function(endpoint) {
    return window.API_BASE_URL + endpoint;
};

console.log('🔧 Configuration loaded');
console.log('🌐 API Base URL:', window.API_BASE_URL);
console.log('🏠 Current hostname:', window.location.hostname);
console.log('🔗 Full location:', window.location.href);
