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
        maxFileSize: 100 * 1024 * 1024, // 100MB (updated from 50MB)
        maxBulkFiles: 50, // Maximum files in bulk upload
        allowedTypes: [
            // Documents
            'pdf', 'docx', 'doc', 'txt', 'md', 'rtf',
            // Images (with OCR support)
            'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'gif',
            // Data formats
            'csv', 'json', 'xml', 'html'
        ],
        chunkSize: 1024 * 1024, // 1MB chunks for large file uploads
        allowedMimeTypes: [
            // Documents
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'text/plain',
            'text/markdown',
            'application/rtf',
            // Images
            'image/jpeg',
            'image/png',
            'image/bmp',
            'image/tiff',
            'image/gif',
            // Data formats
            'text/csv',
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
        defaultSimilarityThreshold: 0.7,
        minSimilarityThreshold: 0.1,
        maxSimilarityThreshold: 1.0,
        debounceMs: 300, // Debounce search input
        historyLimit: 50, // Max search history items to store locally
        suggestionsLimit: 5,
        exportFormats: ['json', 'csv', 'txt']
    },

    // RAG Configuration
    rag: {
        defaultModel: 'llama2',
        availableModels: ['llama2', 'mistral', 'codellama', 'llama2:13b'],
        maxContextLength: 4000,
        defaultIncludeSources: true,
        streamResponse: false // Set to true for streaming responses
    },

    // UI Configuration
    ui: {
        theme: 'light', // 'light' or 'dark'
        itemsPerPage: 20,
        maxRecentItems: 10,
        autoRefreshInterval: 30000, // 30 seconds
        notificationTimeout: 5000, // 5 seconds
        maxToastMessages: 3,
        animationDuration: 300, // milliseconds
        sidebarWidth: 320, // pixels
        chatMaxHeight: 600 // pixels
    },

    // Server Configuration
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || 'localhost',
        cors: {
            enabled: true,
            origins: [
                'http://localhost:3000',
                'http://127.0.0.1:3000',
                'http://localhost:8000',
                'http://127.0.0.1:8000',
                'http://localhost:5173',
                'http://127.0.0.1:5173'
            ]
        }
    },

    // Performance Configuration
    performance: {
        enableCaching: true,
        cacheTimeout: 300000, // 5 minutes
        maxCacheSize: 100, // Max cached items
        enableCompression: true,
        enableLazyLoading: true,
        virtualScrollThreshold: 100 // Items before virtual scrolling kicks in
    },

    // Feature Flags
    features: {
        enableBulkUpload: true,
        enableOCR: true,
        enableAdvancedSearch: true,
        enableSearchHistory: true,
        enableExport: true,
        enableFeedback: true,
        enableAnalytics: false, // Set to true to enable usage analytics
        enableDarkMode: true,
        enableNotifications: true,
        enableKeyboardShortcuts: true,
        enableDragAndDrop: true,
        enableAutoSave: true
    },

    // API Endpoints
    endpoints: {
        // Health & Status
        health: '/health',
        healthDetailed: '/health/detailed',

        // Document Management
        upload: '/pdf/upload',
        bulkUpload: '/bulk/upload',
        bulkStatus: '/bulk/status',
        documents: '/api/pdfs',
        documentById: '/api/pdfs/{id}',
        deleteDocument: '/api/pdfs/{id}',
        reprocessDocument: '/pdf/{id}/reprocess',

        // Search & RAG
        search: '/search/',
        rag: '/search/rag',
        similar: '/search/similar/{id}',
        suggestions: '/search/suggestions',
        searchHistory: '/search/history',
        searchStats: '/search/stats',
        searchFeedback: '/search/feedback',
        exportSearch: '/search/export',

        // Admin
        systemInfo: '/admin/system-info',
        rebuildIndex: '/admin/rebuild-index',
        clearCache: '/admin/clear-cache',
        logs: '/admin/logs',

        // Categories & Stats
        categories: '/api/categories',
        stats: '/api/stats'
    },

    // Error Messages
    errors: {
        connection: 'Unable to connect to the server. Please check your connection.',
        upload: 'File upload failed. Please try again.',
        search: 'Search failed. Please try again.',
        rag: 'Unable to generate answer. Please try again.',
        fileSize: 'File size exceeds the maximum limit of {maxSize}MB.',
        fileType: 'File type not supported. Allowed types: {allowedTypes}.',
        network: 'Network error. Please check your internet connection.',
        server: 'Server error. Please try again later.',
        timeout: 'Request timed out. Please try again.',
        validation: 'Please check your input and try again.'
    },

    // Success Messages
    messages: {
        uploadSuccess: 'File uploaded successfully!',
        bulkUploadSuccess: '{count} files uploaded successfully!',
        deleteSuccess: 'Document deleted successfully!',
        searchComplete: 'Search completed successfully!',
        feedbackSubmitted: 'Thank you for your feedback!',
        settingsSaved: 'Settings saved successfully!'
    },

    // Keyboard Shortcuts
    shortcuts: {
        search: 'Ctrl+K',
        upload: 'Ctrl+U',
        newChat: 'Ctrl+N',
        clearChat: 'Ctrl+L',
        toggleSidebar: 'Ctrl+B',
        toggleTheme: 'Ctrl+Shift+T',
        help: '?'
    },

    // Local Storage Keys
    storage: {
        theme: 'rag_theme',
        searchHistory: 'rag_search_history',
        userPreferences: 'rag_user_preferences',
        sessionId: 'rag_session_id',
        recentDocuments: 'rag_recent_documents',
        chatHistory: 'rag_chat_history'
    },

    // Development Configuration
    development: {
        enableDebugMode: process.env.NODE_ENV === 'development',
        enableMockData: false,
        logLevel: process.env.LOG_LEVEL || 'info',
        enablePerformanceMonitoring: true,
        enableErrorReporting: true
    },

    // Analytics Configuration (if enabled)
    analytics: {
        trackPageViews: false,
        trackSearchQueries: false,
        trackUploadEvents: false,
        trackErrorEvents: true,
        anonymizeData: true
    },

    // Notification Configuration
    notifications: {
        position: 'top-right', // top-right, top-left, bottom-right, bottom-left
        autoClose: true,
        autoCloseDelay: 5000,
        showProgress: true,
        enableSound: false,
        maxNotifications: 5
    },

    // Chat Configuration
    chat: {
        maxMessages: 100,
        enableMarkdown: true,
        enableCodeHighlighting: true,
        enableCopyToClipboard: true,
        showTimestamps: true,
        showSources: true,
        enableAutoScroll: true,
        typingIndicatorDelay: 1000
    },

    // Document Preview Configuration
    preview: {
        enablePreview: true,
        maxPreviewSize: 5 * 1024 * 1024, // 5MB
        supportedPreviewTypes: ['pdf', 'txt', 'md', 'json', 'xml', 'html'],
        previewHeight: 400,
        enableFullscreen: true
    },

    // Security Configuration
    security: {
        enableCSRF: true,
        enableXSSProtection: true,
        enableContentTypeValidation: true,
        maxRequestSize: 100 * 1024 * 1024, // 100MB
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
    },

    // Accessibility Configuration
    accessibility: {
        enableHighContrast: false,
        enableScreenReader: true,
        enableKeyboardNavigation: true,
        fontSize: 'medium', // small, medium, large
        reducedMotion: false
    },

    // Backup & Export Configuration
    backup: {
        enableAutoBackup: false,
        backupInterval: 24 * 60 * 60 * 1000, // 24 hours
        maxBackups: 7,
        includeSearchHistory: true,
        includeUserPreferences: true
    }
};
