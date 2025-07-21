// RAG Chat Application - Client Library
// Frontend client for communicating with the RAG API

class RAGClient {
    constructor(baseURL = null) {
        this.baseURL = baseURL || window.API_BASE_URL || 'http://localhost:8000';
        this.timeout = 60000; // 60 seconds default
        this.retryAttempts = 3;
        this.retryDelay = 1000;

        console.log('RAGClient initialized with base URL:', this.baseURL);
    }

    // Helper method to make HTTP requests with retry logic
    async makeRequest(url, options = {}) {
        const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;

        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            timeout: this.timeout,
            ...options
        };

        let lastError;

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                console.log(`Making request (attempt ${attempt}): ${options.method || 'GET'} ${fullUrl}`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);

                const response = await fetch(fullUrl, {
                    ...defaultOptions,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorData = await response.text();
                    let error;
                    try {
                        const jsonError = JSON.parse(errorData);
                        error = jsonError.detail || jsonError.message || `HTTP ${response.status}`;
                    } catch {
                        error = errorData || `HTTP ${response.status}`;
                    }
                    throw new Error(error);
                }

                // Handle different response types
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return await response.json();
                } else if (options.responseType === 'blob') {
                    return {
                        data: await response.blob(),
                        headers: Object.fromEntries(response.headers.entries())
                    };
                } else {
                    return await response.text();
                }

            } catch (error) {
                lastError = error;
                console.warn(`Request attempt ${attempt} failed:`, error.message);

                // Don't retry on certain errors
                if (error.name === 'AbortError' ||
                    error.message.includes('404') ||
                    error.message.includes('403') ||
                    attempt === this.retryAttempts) {
                    break;
                }

                // Wait before retrying
                if (attempt < this.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                }
            }
        }

        throw lastError;
    }

    // Add the missing post method
    async post(endpoint, data = null, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...options.headers
                },
                body: data ? JSON.stringify(data) : null,
                ...options
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.detail || errorJson.message || errorText;
                } catch {
                    errorMessage = errorText || `HTTP ${response.status}`;
                }
                throw new Error(errorMessage);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            console.error('POST request failed:', error);
            throw error;
        }
    }

    // Add the missing get method
    async get(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.detail || errorJson.message || errorText;
                } catch {
                    errorMessage = errorText || `HTTP ${response.status}`;
                }
                throw new Error(errorMessage);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            console.error('GET request failed:', error);
            throw error;
        }
    }

    // Wrapper methods that return consistent response format
    async request(url, options = {}) {
        try {
            const data = await this.makeRequest(url, options);
            return {
                success: true,
                data: data
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Health check
    async healthCheck() {
        return await this.request('/health');
    }

    // Statistics
    async getStats() {
        return await this.request('/search/stats');
    }

    async getDetailedStats() {
        return await this.request('/stats/detailed');
    }

    async getSystemStats() {
        return await this.request('/admin/stats');
    }

    async getPerformanceMetrics() {
        return await this.request('/admin/performance');
    }

    // Document Management
    async uploadDocument(formData, onProgress = null) {
        const options = {
            method: 'POST',
            body: formData,
            headers: {} // Don't set Content-Type for FormData
        };

        if (onProgress) {
            // Note: Progress tracking would need XMLHttpRequest for upload progress
            console.log('Progress tracking not implemented with fetch API');
        }

        return await this.request('/pdf/upload', options);
    }

     async upload(file, options = {}) {
        // Use the existing helper to create the FormData
        const formData = this.createUploadFormData(file, options);

        // Call your existing, grayed-out uploadDocument method
        return await this.uploadDocument(formData);
    }


    async bulkUploadDocuments(formData, onProgress = null) {
        const options = {
            method: 'POST',
            body: formData,
            headers: {}
        };

        return await this.request('/pdf/bulk-upload', options);
    }

    async listDocuments(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = `/pdf/list${queryString ? '?' + queryString : ''}`;
        return await this.request(url);
    }

    async getDocument(documentId) {
        return await this.request(`/pdf/${documentId}`);
    }

    async deleteDocument(documentId) {
        return await this.request(`/pdf/${documentId}`, {
            method: 'DELETE'
        });
    }

    async downloadDocument(documentId) {
        try {
            const data = await this.makeRequest(`/pdf/${documentId}/download`, {
                responseType: 'blob'
            });
            return {
                success: true,
                data: data.data,
                headers: data.headers
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getDocumentChunks(documentId, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = `/pdf/${documentId}/chunks${queryString ? '?' + queryString : ''}`;
        return await this.request(url);
    }

    async getDocumentStatus(documentId) {
        return await this.request(`/pdf/${documentId}/status`);
    }

    async reprocessDocument(documentId, force = false) {
        return await this.request(`/pdf/${documentId}/reprocess`, {
            method: 'POST',
            body: JSON.stringify({ force })
        });
    }

    // Search Operations - Updated with better error handling
    async search(query, options = {}) {
        try {
            const payload = {
                query: query,
                n_results: options.n_results || options.limit || 10,
                similarity_threshold: options.similarity_threshold || 0.3,
                ...options
            };

            console.log('Search payload:', payload);

            const response = await this.post('/search/search', payload);

            return {
                success: true,
                data: response
            };
        } catch (error) {
            console.error('Search failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async ragQuery(query, options = {}) {
        try {
            const payload = {
                query: query,
                max_results: options.max_results || options.n_results || 5,
                similarity_threshold: options.similarity_threshold || 0.3,
                model: options.model || 'qwen2.5:7b',
                document_ids: options.document_ids || options.pdf_ids || null,
                category: options.category || null,
                include_context: options.include_context || false,
                ...options
            };

            // Remove null values
            Object.keys(payload).forEach(key => {
                if (payload[key] === null || payload[key] === undefined) {
                    delete payload[key];
                }
            });

            console.log('RAG Query payload:', payload);

            const response = await this.post('/search/rag', payload);

            return {
                success: true,
                data: response
            };
        } catch (error) {
            console.error('RAG query failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async semanticSearch(query, options = {}) {
        const payload = {
            query,
            search_type: 'semantic',
            ...options
        };

        return await this.request('/search/semantic', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async hybridSearch(query, options = {}) {
        const payload = {
            query,
            search_type: 'hybrid',
            semantic_weight: options.semantic_weight || 0.7,
            keyword_weight: options.keyword_weight || 0.3,
            ...options
        };

        return await this.request('/search/hybrid', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    // Search History
    async getSearchHistory(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = `/search/history${queryString ? '?' + queryString : ''}`;
        return await this.request(url);
    }

    async clearSearchHistory(session = null) {
        const payload = session ? { session } : {};
        return await this.request('/search/history', {
            method: 'DELETE',
            body: JSON.stringify(payload)
        });
    }

    // Admin Operations
    async resetDatabase() {
        return await this.request('/admin/reset-database', {
            method: 'POST'
        });
    }

    async optimizeDatabase() {
        return await this.request('/admin/optimize-database', {
            method: 'POST'
        });
    }

    async getSystemLogs(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = `/admin/logs${queryString ? '?' + queryString : ''}`;
        return await this.request(url);
    }

    // Utility Methods
    async testConnection() {
        try {
            const result = await this.healthCheck();
            return {
                success: result.success,
                connected: result.success,
                data: result.data,
                latency: Date.now() // Simple latency measurement
            };
        } catch (error) {
            return {
                success: false,
                connected: false,
                error: error.message
            };
        }
    }

    async getApiInfo() {
        return await this.request('/');
    }

    // Helper method to create FormData for file uploads
    createUploadFormData(file, options = {}) {
        const formData = new FormData();
        formData.append('file', file);

        if (options.title) {
            formData.append('title', options.title);
        }

        if (options.category) {
            formData.append('category', options.category);
        }

        if (options.description) {
            formData.append('description', options.description);
        }

        if (options.auto_process !== undefined) {
            formData.append('auto_process', options.auto_process.toString());
        }

        return formData;
    }

    // Helper method to create FormData for bulk uploads
    createBulkUploadFormData(files, options = {}) {
        const formData = new FormData();

        files.forEach(file => {
            formData.append('files', file);
        });

        if (options.category) {
            formData.append('category', options.category);
        }

        if (options.auto_process !== undefined) {
            formData.append('auto_process', options.auto_process.toString());
        }

        return formData;
    }

    // Helper method to validate file before upload
    validateFile(file, options = {}) {
        const maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB default
        const allowedTypes = options.allowedTypes || [
            'pdf', 'docx', 'doc', 'txt', 'md', 'rtf',
            'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'gif',
            'csv', 'json', 'xml', 'html', 'xlsx', 'xls', 'pptx', 'ppt'
        ];

        const errors = [];

        // Check file size
        if (file.size > maxSize) {
            errors.push(`File size (${this.formatFileSize(file.size)}) exceeds maximum allowed size (${this.formatFileSize(maxSize)})`);
        }

        // Check file type
        const extension = file.name.toLowerCase().split('.').pop();
        if (!allowedTypes.includes(extension)) {
            errors.push(`File type '${extension}' is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
        }

        // Check filename
        if (!file.name || file.name.trim() === '') {
            errors.push('File must have a valid name');
        }

                return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    // Helper method to format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Helper method to format response for display
    formatRAGResponse(response) {
        if (!response) return null;

        return {
            answer: response.answer || 'No answer generated',
            sources: response.sources || [],
            query: response.query || '',
            model: response.model_used || 'Unknown',
            metadata: {
                responseTime: response.response_time || 0,
                totalSources: response.total_sources || 0,
                parameters: response.parameters || {}
            }
        };
    }

    // Helper method to format search results
    formatSearchResponse(response) {
        if (!response) return null;

        return {
            results: response.results || [],
            total: response.total || 0,
            query: response.query || '',
            metadata: {
                responseTime: response.response_time || 0,
                parameters: response.parameters || {}
            }
        };
    }

    // Configuration methods
    setBaseURL(baseURL) {
        this.baseURL = baseURL;
        console.log('RAGClient baseURL updated to:', baseURL);
    }

    setTimeout(timeout) {
        this.timeout = timeout;
    }

    setRetryAttempts(attempts) {
        this.retryAttempts = attempts;
    }

    setRetryDelay(delay) {
        this.retryDelay = delay;
    }

    // Batch operations
    async batchSearch(queries, options = {}) {
        const payload = {
            queries: queries,
            ...options
        };

        return await this.request('/search/batch', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async batchRAGQuery(queries, options = {}) {
        const payload = {
            queries: queries,
            ...options
        };

        return await this.request('/search/batch-rag', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    // Document processing status
    async getProcessingStatus() {
        return await this.request('/processing/status');
    }

    async getProcessingQueue() {
        return await this.request('/processing/queue');
    }

    // Cache operations
    async clearCache(cacheType = 'all') {
        const payload = { cache_type: cacheType };
        return await this.request('/admin/clear-cache', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async getCacheStats() {
        return await this.request('/admin/cache-stats');
    }

    // Model management
    async getAvailableModels() {
        return await this.request('/models/available');
    }

    async getCurrentModel() {
        return await this.request('/models/current');
    }

    async switchModel(modelName) {
        const payload = { model: modelName };
        return await this.request('/models/switch', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    // Export/Import operations
    async exportDocuments(format = 'json', options = {}) {
        const payload = {
            format: format,
            ...options
        };

        try {
            const data = await this.makeRequest('/admin/export', {
                method: 'POST',
                body: JSON.stringify(payload),
                responseType: 'blob'
            });

            return {
                success: true,
                data: data.data,
                headers: data.headers
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async importDocuments(file, options = {}) {
        const formData = new FormData();
        formData.append('file', file);

        if (options.merge) {
            formData.append('merge', options.merge.toString());
        }

        if (options.overwrite) {
            formData.append('overwrite', options.overwrite.toString());
        }

        return await this.request('/admin/import', {
            method: 'POST',
            body: formData,
            headers: {} // Don't set Content-Type for FormData
        });
    }

    // Configuration management
    async getConfig() {
        return await this.request('/admin/config');
    }

    async updateConfig(config) {
        return await this.request('/admin/config', {
            method: 'PUT',
            body: JSON.stringify(config)
        });
    }

    // User session management
    async createSession(sessionData = {}) {
        return await this.request('/session/create', {
            method: 'POST',
            body: JSON.stringify(sessionData)
        });
    }

    async getSession(sessionId) {
        return await this.request(`/session/${sessionId}`);
    }

    async updateSession(sessionId, sessionData) {
        return await this.request(`/session/${sessionId}`, {
            method: 'PUT',
            body: JSON.stringify(sessionData)
        });
    }

    async deleteSession(sessionId) {
        return await this.request(`/session/${sessionId}`, {
            method: 'DELETE'
        });
    }

    // Advanced search operations
    async searchWithFilters(query, filters = {}) {
        const payload = {
            query: query,
            filters: filters
        };

        return await this.request('/search/filtered', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async searchSimilarDocuments(documentId, options = {}) {
        const payload = {
            document_id: documentId,
            ...options
        };

        return await this.request('/search/similar', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async searchByCategory(category, options = {}) {
        const payload = {
            category: category,
            ...options
        };

        return await this.request('/search/category', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    // Document analysis
    async analyzeDocument(documentId) {
        return await this.request(`/pdf/${documentId}/analyze`, {
            method: 'POST'
        });
    }

    async getDocumentSummary(documentId) {
        return await this.request(`/pdf/${documentId}/summary`);
    }

    async getDocumentKeywords(documentId) {
        return await this.request(`/pdf/${documentId}/keywords`);
    }

    async getDocumentEntities(documentId) {
        return await this.request(`/pdf/${documentId}/entities`);
    }

    // Feedback and rating
    async submitFeedback(feedback) {
        return await this.request('/feedback', {
            method: 'POST',
            body: JSON.stringify(feedback)
        });
    }

    async rateResponse(responseId, rating, comment = '') {
        const payload = {
            response_id: responseId,
            rating: rating,
            comment: comment
        };

        return await this.request('/feedback/rate', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    // Monitoring and alerts
    async getSystemAlerts() {
        return await this.request('/admin/alerts');
    }

    async acknowledgeAlert(alertId) {
        return await this.request(`/admin/alerts/${alertId}/acknowledge`, {
            method: 'POST'
        });
    }

    // Backup and restore
    async createBackup(options = {}) {
        return await this.request('/admin/backup', {
            method: 'POST',
            body: JSON.stringify(options)
        });
    }

    async restoreBackup(backupId) {
        return await this.request(`/admin/backup/${backupId}/restore`, {
            method: 'POST'
        });
    }

    async listBackups() {
        return await this.request('/admin/backups');
    }

    // Error handling utilities
    handleError(error, context = '') {
        console.error(`RAGClient error${context ? ` in ${context}` : ''}:`, error);

        // Common error messages
        const errorMessages = {
            'NetworkError': 'Network connection failed. Please check your internet connection.',
            'TimeoutError': 'Request timed out. Please try again.',
            'AbortError': 'Request was cancelled.',
            'QuotaExceededError': 'Storage quota exceeded.',
            'NotFoundError': 'Resource not found.',
            'UnauthorizedError': 'Unauthorized access.',
            'ForbiddenError': 'Access forbidden.',
            'ValidationError': 'Invalid input data.',
            'ServerError': 'Internal server error. Please try again later.'
        };

        // Return user-friendly error message
        const errorType = error.name || 'Error';
        return errorMessages[errorType] || error.message || 'An unexpected error occurred';
    }

    // Connection status
    async checkConnection() {
        try {
            const startTime = Date.now();
            const result = await this.healthCheck();
            const latency = Date.now() - startTime;

            return {
                connected: result.success,
                latency: latency,
                status: result.success ? 'healthy' : 'unhealthy',
                data: result.data
            };
        } catch (error) {
            return {
                connected: false,
                latency: -1,
                status: 'disconnected',
                error: this.handleError(error, 'connection check')
            };
        }
    }

    // Utility to get current timestamp
    getCurrentTimestamp() {
        return new Date().toISOString();
    }

    // Helper to create a unique request ID
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Method to track API usage
    trackAPIUsage(endpoint, method, duration, success) {
        const usage = {
            endpoint: endpoint,
            method: method,
            duration: duration,
            success: success,
            timestamp: this.getCurrentTimestamp()
        };

        // Store in localStorage for analytics
        try {
            const existingUsage = JSON.parse(localStorage.getItem('ragclient_usage') || '[]');
            existingUsage.push(usage);

            // Keep only last 100 records
            if (existingUsage.length > 100) {
                existingUsage.splice(0, existingUsage.length - 100);
            }

            localStorage.setItem('ragclient_usage', JSON.stringify(existingUsage));
        } catch (error) {
            console.warn('Failed to track API usage:', error);
        }
    }

    // Method to get API usage statistics
    getAPIUsageStats() {
        try {
            const usage = JSON.parse(localStorage.getItem('ragclient_usage') || '[]');

            const stats = {
                totalRequests: usage.length,
                successfulRequests: usage.filter(u => u.success).length,
                failedRequests: usage.filter(u => !u.success).length,
                averageResponseTime: usage.reduce((sum, u) => sum + (u.duration || 0), 0) / usage.length,
                endpointUsage: {}
            };

            // Calculate endpoint usage
            usage.forEach(u => {
                if (!stats.endpointUsage[u.endpoint]) {
                    stats.endpointUsage[u.endpoint] = 0;
                }
                stats.endpointUsage[u.endpoint]++;
            });

            return stats;
        } catch (error) {
            console.warn('Failed to get API usage stats:', error);
            return null;
        }
    }

    // Method to clear API usage history
    clearAPIUsageHistory() {
        try {
            localStorage.removeItem('ragclient_usage');
            console.log('API usage history cleared');
        } catch (error) {
            console.warn('Failed to clear API usage history:', error);
        }
    }
}

// Initialize global RAGClient instance
function initializeRAGClient() {
    const baseURL = window.API_BASE_URL || 'http://localhost:8000';
    window.ragClient = new RAGClient(baseURL);

    console.log('Global RAGClient initialized');

    // Set up periodic connection check
    setInterval(async () => {
        try {
            const status = await window.ragClient.checkConnection();
            if (window.updateConnectionStatus) {
                window.updateConnectionStatus(status);
            }
        } catch (error) {
            console.warn('Connection check failed:', error);
        }
    }, 30000); // Check every 30 seconds

    return window.ragClient;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRAGClient);
} else {
    initializeRAGClient();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAGClient;
}

// Export for ES6 modules
if (typeof window !== 'undefined') {
    window.RAGClient = RAGClient;
}

