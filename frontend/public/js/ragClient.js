// RAG Chat Application - Client Library
// Frontend client for communicating with the RAG API

class RAGClient {
    constructor(baseURL = null) {
    this.baseURL = baseURL || window.API_BASE_URL;
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

    // Search Operations
    async search(query, options = {}) {
        const payload = {
            query,
            limit: options.limit || 10,
            similarity_threshold: options.similarity_threshold || 0.7,
            ...options
        };

        return await this.request('/search/', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async ragQuery(query, options = {}) {
    try {
        const payload = {
            query: query, // Note: backend expects 'query', not 'question'
            max_results: options.max_results || options.n_results || 5,
            similarity_threshold: options.similarity_threshold || 0.7,
            model: options.model || 'llama3.2:latest',
            document_ids: options.document_ids || options.pdf_ids || null,
            category: options.category || null,
            include_context: options.include_context || false
        };

        // Remove null values
        Object.keys(payload).forEach(key => {
            if (payload[key] === null || payload[key] === undefined) {
                delete payload[key];
            }
        });

        const response = await this.client.post('/rag', payload, { // Note: endpoint is '/rag', not '/search/rag'
            timeout: 120000 // 2 minutes for RAG queries
        });

        return {
            success: true,
            data: response.data
        };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.detail || error.message
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
            errors: errors,
            file: {
                name: file.name,
                size: file.size,
                type: file.type,
                extension: extension,
                sizeFormatted: this.formatFileSize(file.size)
            }
        };
    }

    // Helper method to format file size
    formatFileSize(bytes) {
        if (!bytes || isNaN(bytes)) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Helper method to format search results
    formatSearchResults(results) {
        if (!results || !Array.isArray(results)) {
            return [];
        }

        return results.map(result => ({
            ...result,
            relevanceScore: result.score || result.similarity || 0,
            relevancePercentage: Math.round((result.score || result.similarity || 0) * 100),
            preview: result.content ? result.content.substring(0, 200) + '...' : '',
            source: {
                document_id: result.document_id || result.pdf_id,
                filename: result.filename || result.document_name,
                page: result.page_number || result.page,
                chunk_index: result.chunk_index
            }
        }));
    }

    // Helper method to format RAG response
    formatRAGResponse(response) {
        if (!response) {
            return null;
        }

        return {
            answer: response.answer || response.response || '',
            confidence: response.confidence || 0,
            confidencePercentage: Math.round((response.confidence || 0) * 100),
            sources: this.formatSearchResults(response.sources || []),
            metadata: {
                model: response.model || 'unknown',
                tokens: response.total_tokens || 0,
                responseTime: response.response_time || 0,
                searchTime: response.vector_search_time || 0,
                llmTime: response.llm_response_time || 0
            },
            timestamp: response.timestamp || new Date().toISOString()
        };
    }
    // Helper method to poll processing status
    async pollProcessingStatus(documentId, options = {}) {
        const maxAttempts = options.maxAttempts || 60; // 5 minutes with 5-second intervals
        const interval = options.interval || 5000; // 5 seconds
        const onUpdate = options.onUpdate || null;

        let attempts = 0;

        return new Promise((resolve, reject) => {
            const poll = async () => {
                try {
                    attempts++;
                    const result = await this.getDocumentStatus(documentId);

                    if (!result.success) {
                        reject(new Error(result.error));
                        return;
                    }

                    const status = result.data.processing_status;

                    // Call update callback if provided
                    if (onUpdate) {
                        onUpdate(result.data, attempts);
                    }

                    // Check if processing is complete
                    if (status === 'completed') {
                        resolve(result.data);
                        return;
                    }

                    // Check if processing failed
                    if (status === 'failed' || status === 'error') {
                        reject(new Error(result.data.error_message || 'Processing failed'));
                        return;
                    }

                    // Check if max attempts reached
                    if (attempts >= maxAttempts) {
                        reject(new Error('Processing timeout - maximum attempts reached'));
                        return;
                    }

                    // Continue polling if still processing
                    if (status === 'processing' || status === 'pending') {
                        setTimeout(poll, interval);
                    } else {
                        resolve(result.data);
                    }

                } catch (error) {
                    reject(error);
                }
            };

            // Start polling
            poll();
        });
    }

    // Helper method to handle file downloads
    async handleFileDownload(documentId, filename) {
        try {
            const result = await this.downloadDocument(documentId);

            if (result.success) {
                // Create blob URL and trigger download
                const blob = result.data;
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename || `document_${documentId}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);

                return { success: true };
            } else {
                return result;
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Helper method to create search filters
    createSearchFilters(options = {}) {
        const filters = {};

        if (options.categories && options.categories.length > 0) {
            filters.categories = options.categories;
        }

        if (options.documentIds && options.documentIds.length > 0) {
            filters.pdf_ids = options.documentIds;
        }

        if (options.dateRange) {
            if (options.dateRange.start) {
                filters.start_date = options.dateRange.start;
            }
            if (options.dateRange.end) {
                filters.end_date = options.dateRange.end;
            }
        }

        if (options.minScore !== undefined) {
            filters.similarity_threshold = options.minScore;
        }

        if (options.fileTypes && options.fileTypes.length > 0) {
            filters.file_types = options.fileTypes;
        }

        return filters;
    }

    // Helper method to get error message from response
    getErrorMessage(error) {
        if (typeof error === 'string') {
            return error;
        }

        if (error.response?.data?.detail) {
            return error.response.data.detail;
        }

        if (error.response?.data?.message) {
            return error.response.data.message;
        }

        if (error.message) {
            return error.message;
        }

        return 'An unknown error occurred';
    }

    // Helper method to check if service is available
    async isServiceAvailable() {
        try {
            const result = await this.healthCheck();
            return result.success && result.data?.status === 'healthy';
        } catch (error) {
            return false;
        }
    }

    // Helper method to get service status
    async getServiceStatus() {
        try {
            const [health, stats] = await Promise.allSettled([
                this.healthCheck(),
                this.getStats()
            ]);

            const healthResult = health.status === 'fulfilled' ? health.value : null;
            const statsResult = stats.status === 'fulfilled' ? stats.value : null;

            return {
                available: healthResult?.success || false,
                healthy: healthResult?.success && healthResult.data?.status === 'healthy',
                database: healthResult?.data?.database || 'unknown',
                documents: statsResult?.success ? statsResult.data : null,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                available: false,
                healthy: false,
                error: this.getErrorMessage(error),
                timestamp: new Date().toISOString()
            };
        }
    }

    // Configuration methods
    setTimeout(timeout) {
        this.timeout = timeout;
    }

    setRetryConfig(attempts, delay) {
        this.retryAttempts = attempts;
        this.retryDelay = delay;
    }

    setBaseURL(baseURL) {
        this.baseURL = baseURL;
    }

    // Method to get current configuration
    getConfig() {
        return {
            baseURL: this.baseURL,
            timeout: this.timeout,
            retryAttempts: this.retryAttempts,
            retryDelay: this.retryDelay
        };
    }

    // Batch operations
    async batchRequest(requests) {
        const promises = requests.map(async (req) => {
            try {
                const result = await this.request(req.url, req.options);
                return {
                    id: req.id,
                    success: true,
                    data: result.data,
                    url: req.url
                };
            } catch (error) {
                return {
                    id: req.id,
                    success: false,
                    error: error.message,
                    url: req.url
                };
            }
        });

        return await Promise.allSettled(promises);
    }

    // Streaming support for RAG queries
    async ragQueryStream(question, options = {}, onChunk = null) {
        const payload = {
            question,
            max_results: options.max_results || 5,
            similarity_threshold: options.similarity_threshold || 0.7,
            model: options.model || 'llama3.2:latest',
            temperature: options.temperature || 0.7,
            max_tokens: options.max_tokens || 1000,
            include_sources: options.include_sources !== false,
            stream: true,
            ...options
        };

        try {
            const response = await fetch(`${this.baseURL}/search/rag`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.trim() === '') continue;

                    try {
                        const chunk = JSON.parse(line);
                        if (onChunk) {
                            onChunk(chunk);
                        }
                    } catch (e) {
                        console.warn('Failed to parse chunk:', line);
                    }
                }
            }

            // Process any remaining buffer
            if (buffer.trim()) {
                try {
                    const chunk = JSON.parse(buffer);
                    if (onChunk) {
                        onChunk(chunk);
                    }
                } catch (e) {
                    console.warn('Failed to parse final chunk:', buffer);
                }
            }

            return { success: true };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // WebSocket support for real-time updates
    createWebSocket(endpoint, options = {}) {
        const wsUrl = this.baseURL.replace('http', 'ws') + endpoint;

        try {
            const ws = new WebSocket(wsUrl);

            ws.onopen = function(event) {
                console.log('WebSocket connected:', wsUrl);
                if (options.onOpen) {
                    options.onOpen(event);
                }
            };

            ws.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    if (options.onMessage) {
                        options.onMessage(data);
                    }
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };

            ws.onerror = function(event) {
                console.error('WebSocket error:', event);
                if (options.onError) {
                    options.onError(event);
                }
            };

            ws.onclose = function(event) {
                console.log('WebSocket closed:', event.code, event.reason);
                if (options.onClose) {
                    options.onClose(event);
                }
            };

            return ws;

        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            return null;
        }
    }

    // Analytics and tracking
    async trackEvent(event, data = {}) {
        const payload = {
            event: event,
            data: data,
            timestamp: new Date().toISOString(),
            session_id: this.getSessionId(),
            user_agent: navigator.userAgent,
            url: window.location.href
        };

        try {
            return await this.request('/analytics/track', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        } catch (error) {
            console.warn('Failed to track event:', error);
            return { success: false, error: error.message };
        }
    }

    getSessionId() {
        let sessionId = sessionStorage.getItem('rag_session_id');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('rag_session_id', sessionId);
        }
        return sessionId;
    }

    // Cache management
    createCache(ttl = 300000) { // 5 minutes default TTL
        const cache = new Map();

        return {
            get: (key) => {
                const item = cache.get(key);
                if (!item) return null;

                if (Date.now() > item.expiry) {
                    cache.delete(key);
                    return null;
                }

                return item.data;
            },

            set: (key, data) => {
                cache.set(key, {
                    data: data,
                    expiry: Date.now() + ttl
                });
            },

            delete: (key) => {
                cache.delete(key);
            },

            clear: () => {
                cache.clear();
            },

            size: () => cache.size
        };
    }

    // Request interceptors
    addRequestInterceptor(interceptor) {
        this.requestInterceptors = this.requestInterceptors || [];
        this.requestInterceptors.push(interceptor);
    }

    addResponseInterceptor(interceptor) {
        this.responseInterceptors = this.responseInterceptors || [];
        this.responseInterceptors.push(interceptor);
    }

    // Performance monitoring
    async measurePerformance(name, operation) {
        const start = performance.now();
        try {
            const result = await operation();
            const end = performance.now();
            const duration = end - start;

            console.log(`⏱️ ${name} took ${duration.toFixed(2)}ms`);

            // Track performance metric
            this.trackEvent('performance', {
                operation: name,
                duration: duration,
                success: true
            });

            return result;
        } catch (error) {
            const end = performance.now();
            const duration = end - start;

            console.error(`❌ ${name} failed after ${duration.toFixed(2)}ms:`, error);

            // Track performance metric
            this.trackEvent('performance', {
                operation: name,
                duration: duration,
                success: false,
                error: error.message
            });

            throw error;
        }
    }
}

// Create and export global instance
window.ragClient = window.ragClient || new RAGClient();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAGClient;
}

// Additional utility functions
window.createRAGClient = function(baseURL) {
    return new RAGClient(baseURL);
};

// Initialize connection check on load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('RAGClient initialized');

    // Test initial connection
    try {
        const status = await window.ragClient.testConnection();
        if (status.connected) {
            console.log('✅ RAG API connection established');
        } else {
            console.warn('⚠️ RAG API connection failed');
        }
    } catch (error) {
        console.error('❌ Failed to test RAG API connection:', error);
    }
});

console.log('RAG Client library loaded');

