// RAG Chat Application - Configuration

// Dynamic base URL configuration - SINGLE SOURCE OF TRUTH
function getBaseUrl() {
    const hostname = window.location.hostname;
    const port = window.location.port;

    // This condition checks if you are running on your local machine for development.
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port !== '8000') {
        console.log('Detected local development environment. API calls will target http://localhost:8000');
        return 'http://localhost:8000';
    }

    // For all other cases (like accessing via 192.168.1.252 or a real domain),
    // return an empty string. This makes all API calls relative to the current domain
    // (e.g., /search/rag), and the reverse proxy will handle routing.
    return '';
}


// Initialize base URL immediately - UNIFIED SOURCE
window.API_BASE_URL = getBaseUrl();

window.APP_CONFIG = {
    // API Configuration
    auth: {
        baseUrl: window.API_BASE_URL, // CHANGE THIS TO YOUR DESIRED ACCESS KEY
        sessionDuration: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
        debugMode: false, // Set to true to show access key in console
        enableAutoLogout: true, // Auto logout after session expires
        showDebugInfo: false // Show debug info on login page
    },

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
        noDocuments: 'No documents found. Please upload some documents first.',
         // ADD AUTHENTICATION ERROR MESSAGES
        authRequired: 'Authentication required. Please login to continue.',
        invalidAccessKey: 'Invalid access key. Please try again.',
        sessionExpired: 'Your session has expired. Please login again.',
        accessDenied: 'Access denied. Invalid credentials.'
    },

    // Success Messages
    successMessages: {
        uploadSuccess: 'File uploaded successfully!',
        deleteSuccess: 'Document deleted successfully!',
        searchComplete: 'Search completed successfully.',
        settingsSaved: 'Settings saved successfully.',
         loginSuccess: 'Login successful! Welcome to RAG Document Search.',
        logoutSuccess: 'Logged out successfully.',
        accessGranted: 'Access granted. Redirecting...'
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
