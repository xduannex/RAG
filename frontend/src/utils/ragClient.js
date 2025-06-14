const axios = require('axios');
const config = require('../config/config');

class RAGClient {
    constructor() {
        this.baseURL = config.ragApi.baseUrl || 'http://localhost:8000';
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 60000, // Increased timeout for file uploads
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Add request interceptor for logging
        this.client.interceptors.request.use(
            (config) => {
                console.log(`Making request to: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                console.error('Request error:', error);
                return Promise.reject(error);
            }
        );

        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            (response) => {
                return response;
            },
            (error) => {
                console.error('Response error:', error.response?.data || error.message);
                return Promise.reject(error);
            }
        );
    }

    async healthCheck() {
        try {
            const response = await this.client.get('/health');
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

    async getSearchStats() {
        try {
            const response = await this.client.get('/stats');
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

    // PDF Management Methods
    async uploadPDF(formData, options = {}) {
        try {
            const config = {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                timeout: 300000, // 5 minutes for large files
                onUploadProgress: options.onProgress || null
            };

            const response = await this.client.post('/pdf/upload', formData, config);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.detail || error.message,
                status: error.response?.status
            };
        }
    }

    async bulkUploadPDFs(formData, options = {}) {
        try {
            const config = {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                timeout: 600000, // 10 minutes for bulk uploads
                onUploadProgress: options.onProgress || null
            };

            const response = await this.client.post('/pdf/bulk-upload', formData, config);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.detail || error.message,
                status: error.response?.status
            };
        }
    }

    async listPDFs(options = {}) {
        try {
            const params = {
                skip: options.skip || 0,
                limit: options.limit || 100,
                status: options.status || null
            };

            // Remove null values
            Object.keys(params).forEach(key => {
                if (params[key] === null || params[key] === undefined) {
                    delete params[key];
                }
            });

            const response = await this.client.get('/pdf/list', { params });
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

    async getPDF(pdfId) {
        try {
            const response = await this.client.get(`/pdf/${pdfId}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.detail || error.message,
                status: error.response?.status
            };
        }
    }

    async deletePDF(pdfId) {
        try {
            const response = await this.client.delete(`/pdf/${pdfId}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.detail || error.message,
                status: error.response?.status
            };
        }
    }

    async processPDF(pdfId) {
        try {
            const response = await this.client.post(`/pdf/${pdfId}/process`);
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

    async reprocessPDF(pdfId, force = false) {
        try {
            const response = await this.client.post(`/pdf/${pdfId}/reprocess`, { force });
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

    async getPDFStatus(pdfId) {
        try {
            const response = await this.client.get(`/pdf/${pdfId}/status`);
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

    async getPDFChunks(pdfId, options = {}) {
        try {
            const params = {
                skip: options.skip || 0,
                limit: options.limit || 50
            };

            const response = await this.client.get(`/pdf/${pdfId}/chunks`, { params });
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

    async downloadPDF(pdfId) {
        try {
            const response = await this.client.get(`/pdf/${pdfId}/download`, {
                responseType: 'blob'
            });
            return {
                success: true,
                data: response.data,
                headers: response.headers
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    async getPDFStats() {
        try {
            const response = await this.client.get('/pdf/stats/summary');
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

    // Search Methods
    async searchDocuments(query, options = {}) {
        try {
            const payload = {
                query,
                limit: options.limit || 10,
                similarity_threshold: options.similarity_threshold || 0.7,
                pdf_ids: options.pdf_ids || null,
                categories: options.categories || null,
                ...options
            };

            // Remove null values
            Object.keys(payload).forEach(key => {
                if (payload[key] === null || payload[key] === undefined) {
                    delete payload[key];
                }
            });

            const response = await this.client.post('/search/', payload);
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

    async ragQuery(question, options = {}) {
        try {
            const payload = {
                question,
                max_results: options.max_results || 5,
                similarity_threshold: options.similarity_threshold || 0.7,
                model: options.model || 'llama2',
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens || 1000,
                pdf_ids: options.pdf_ids || null,
                categories: options.categories || null,
                include_sources: options.include_sources !== false,
                stream: options.stream || false,
                ...options
            };

            // Remove null values
            Object.keys(payload).forEach(key => {
                if (payload[key] === null || payload[key] === undefined) {
                    delete payload[key];
                }
            });

            const response = await this.client.post('/search/rag', payload, {
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

    // Advanced Search Methods
    async semanticSearch(query, options = {}) {
        try {
            const payload = {
                query,
                search_type: 'semantic',
                ...options
            };

            const response = await this.client.post('/search/semantic', payload);
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

    async hybridSearch(query, options = {}) {
        try {
            const payload = {
                query,
                search_type: 'hybrid',
                semantic_weight: options.semantic_weight || 0.7,
                keyword_weight: options.keyword_weight || 0.3,
                ...options
            };

            const response = await this.client.post('/search/hybrid', payload);
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

    // Search History Methods
    async getSearchHistory(options = {}) {
        try {
            const params = {
                skip: options.skip || 0,
                limit: options.limit || 50,
                query_type: options.query_type || null,
                session: options.session || null
            };

            // Remove null values
            Object.keys(params).forEach(key => {
                if (params[key] === null || params[key] === undefined) {
                    delete params[key];
                }
            });

            const response = await this.client.get('/search/history', { params });
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

    async clearSearchHistory(session = null) {
        try {
            const payload = session ? { session } : {};
            const response = await this.client.delete('/search/history', { data: payload });
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

    // Admin Methods
    async getSystemStats() {
        try {
            const response = await this.client.get('/admin/stats');
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

    async resetDatabase() {
        try {
            const response = await this.client.post('/admin/reset-database');
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

    async optimizeDatabase() {
        try {
            const response = await this.client.post('/admin/optimize-database');
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

    async getSystemLogs(options = {}) {
        try {
            const params = {
                skip: options.skip || 0,
                limit: options.limit || 100,
                level: options.level || null,
                component: options.component || null,
                start_date: options.start_date || null,
                end_date: options.end_date || null
            };

            // Remove null values
            Object.keys(params).forEach(key => {
                if (params[key] === null || params[key] === undefined) {
                    delete params[key];
                }
            });

            const response = await this.client.get('/admin/logs', { params });
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

    // Utility Methods
    async testConnection() {
        try {
            const response = await this.client.get('/');
            return {
                success: true,
                data: response.data,
                connected: true
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                connected: false
            };
        }
    }

    async getApiInfo() {
        try {
            const response = await this.client.get('/');
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Helper method to create FormData for file uploads
    createUploadFormData(file, options = {}) {
        const formData = new FormData();
        formData.append('file', file);

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

        files.forEach((file, index) => {
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

    // Helper method to handle file downloads
    async handleFileDownload(pdfId, filename) {
        try {
            const result = await this.downloadPDF(pdfId);

            if (result.success) {
                // Create blob URL and trigger download
                const blob = new Blob([result.data], { type: 'application/pdf' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename || `document_${pdfId}.pdf`;
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

    // Helper method to poll PDF processing status
    async pollProcessingStatus(pdfId, options = {}) {
        const maxAttempts = options.maxAttempts || 60; // 5 minutes with 5-second intervals
        const interval = options.interval || 5000; // 5 seconds
        const onUpdate = options.onUpdate || null;

        let attempts = 0;

        return new Promise((resolve, reject) => {
            const poll = async () => {
                try {
                    attempts++;
                    const result = await this.getPDFStatus(pdfId);

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

                    // Continue polling
                    setTimeout(poll, interval);

                } catch (error) {
                    reject(error);
                }
            };

            // Start polling
            poll();
        });
    }

    // Helper method to validate file before upload
    validateFile(file, options = {}) {
        const maxSize = options.maxSize || 50 * 1024 * 1024; // 50MB default
        const allowedTypes = options.allowedTypes || [
            'pdf', 'docx', 'doc', 'txt', 'md', 'rtf',
            'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'gif',
            'csv', 'json', 'xml', 'html'
        ];

        const errors = [];

        // Check file size
        if (file.size > maxSize) {
            errors.push(`File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size (${(maxSize / (1024 * 1024)).toFixed(2)}MB)`);
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
                sizeFormatted: `${(file.size / (1024 * 1024)).toFixed(2)}MB`
            }
        };
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

    // Helper method to create search filters
    createSearchFilters(options = {}) {
        const filters = {};

        if (options.categories && options.categories.length > 0) {
            filters.categories = options.categories;
        }

        if (options.pdfIds && options.pdfIds.length > 0) {
            filters.pdf_ids = options.pdfIds;
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
            const [health, stats] = await Promise.all([
                this.healthCheck(),
                this.getPDFStats()
            ]);

            return {
                available: health.success,
                healthy: health.success && health.data?.status === 'healthy',
                database: health.data?.database || 'unknown',
                documents: stats.success ? stats.data : null,
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

    // Method to set custom headers (useful for authentication)
    setAuthHeader(token) {
        this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    // Method to remove auth header
    removeAuthHeader() {
        delete this.client.defaults.headers.common['Authorization'];
    }

    // Method to set custom timeout
    setTimeout(timeout) {
        this.client.defaults.timeout = timeout;
    }

    // Method to get current configuration
    getConfig() {
        return {
            baseURL: this.baseURL,
            timeout: this.client.defaults.timeout,
            headers: this.client.defaults.headers
        };
    }
}

// Create and export singleton instance
const ragClient = new RAGClient();

// Export both the class and instance
module.exports = ragClient;
module.exports.RAGClient = RAGClient;
module.exports.default = ragClient;

// Additional exports for specific use cases
module.exports.createClient = (config) => {
    const client = new RAGClient();
    if (config.baseURL) {
        client.baseURL = config.baseURL;
        client.client.defaults.baseURL = config.baseURL;
    }
    if (config.timeout) {
        client.setTimeout(config.timeout);
    }
    if (config.headers) {
        Object.assign(client.client.defaults.headers, config.headers);
    }
    return client;
};
