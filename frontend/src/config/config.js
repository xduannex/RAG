module.exports = {
    // API Configuration
    ragApi: {
        baseUrl: process.env.RAG_API_URL || 'http://localhost:8000',
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

    // API Endpoints
    endpoints: {
        // Document endpoints
        uploadDocument: '/pdf/upload',
        listDocuments: '/documents/list',
        deleteDocument: '/documents/{id}',
        getDocument: '/documents/{id}',
        documentStats: '/documents/stats',

        // Search endpoints
        ragQuery: '/search/rag',
        searchDocuments: '/search/search',

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
    },

    // Development Configuration
    development: {
        enableDebugLogs: process.env.NODE_ENV === 'development',
        mockApi: false,
        enablePerformanceMetrics: true
    }
};
