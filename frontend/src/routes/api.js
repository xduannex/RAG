const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const config = require('../config/config');

const router = express.Router();

// FastAPI backend URL
const FASTAPI_BASE_URL = config.ragApi.baseUrl;

// Configure multer for file uploads with enhanced settings
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: config.upload.maxFileSize,
        files: config.upload.maxBulkFiles
    },
    fileFilter: (req, file, cb) => {
        const fileExtension = file.originalname.split('.').pop().toLowerCase();
        const mimeType = file.mimetype;

        // Check both extension and MIME type
        const isValidExtension = config.upload.allowedTypes.includes(fileExtension);
        const isValidMimeType = config.upload.allowedMimeTypes.includes(mimeType);

        if (isValidExtension && isValidMimeType) {
            cb(null, true);
        } else {
            cb(new Error(`File type not supported. Allowed types: ${config.upload.allowedTypes.join(', ')}`));
        }
    }
});

// Enhanced axios instance with retry logic
const createAxiosInstance = () => {
    const instance = axios.create({
        baseURL: FASTAPI_BASE_URL,
        timeout: config.ragApi.timeout,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    });

    // Add retry interceptor
    instance.interceptors.response.use(
        (response) => response,
        async (error) => {
            const { config: axiosConfig } = error;

            if (!axiosConfig || !axiosConfig.retry) {
                axiosConfig.retry = 0;
            }

            if (axiosConfig.retry < config.ragApi.retryAttempts &&
                (error.code === 'ECONNREFUSED' || error.response?.status >= 500)) {

                axiosConfig.retry += 1;

                // Wait before retry
                await new Promise(resolve =>
                    setTimeout(resolve, config.ragApi.retryDelay * axiosConfig.retry)
                );

                return instance(axiosConfig);
            }

            return Promise.reject(error);
        }
    );

    return instance;
};

const apiClient = createAxiosInstance();

// Health check endpoints
router.get('/health', async (req, res) => {
    try {
        console.log('Health check: Proxying to FastAPI backend...');

        const response = await apiClient.get('/health');
        console.log('FastAPI health response:', response.data);

        res.json(response.data);

    } catch (error) {
        console.error('Health check proxy error:', error.message);

        res.status(500).json({
            status: 'unhealthy',
            database: 'unknown',
            database_error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/health/detailed', async (req, res) => {
    try {
        console.log('Detailed health check: Proxying to FastAPI backend...');

        const response = await apiClient.get('/health/detailed');
        res.json(response.data);

    } catch (error) {
        console.error('Detailed health check proxy error:', error.message);

        res.status(500).json({
            status: 'unhealthy',
            services: {},
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Stats endpoint
router.get('/stats', async (req, res) => {
    try {
        const response = await apiClient.get('/api/stats');
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching stats:', error.message);
        res.status(500).json({
            total_pdfs: 0,
            searchable_pdfs: 0,
            total_searches: 0,
            processing_pdfs: 0,
            error: error.message
        });
    }
});

// Document management endpoints
router.get('/documents', async (req, res) => {
    try {
        const { page = 1, limit = 20, category, status, file_type } = req.query;

        const params = new URLSearchParams({
            skip: (page - 1) * limit,
            limit: limit
        });

        if (category) params.append('category', category);
        if (status) params.append('status', status);
        if (file_type) params.append('file_type', file_type);

        const response = await apiClient.get(`/api/pdfs?${params}`);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching documents:', error.message);
        res.status(error.response?.status || 500).json({
            documents: [],
            total: 0,
            error: error.response?.data?.detail || error.message
        });
    }
});

// Legacy endpoint for backward compatibility
router.get('/pdfs', async (req, res) => {
    req.url = '/documents';
    router.handle(req, res);
});

router.get('/documents/:id', async (req, res) => {
    try {
        const response = await apiClient.get(`/api/pdfs/${req.params.id}`);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching document:', error.message);
        res.status(error.response?.status || 404).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// Categories endpoint
router.get('/categories', async (req, res) => {
    try {
        const response = await apiClient.get('/api/categories');
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching categories:', error.message);
        res.json({ categories: [] });
    }
});

// Single file upload
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('Uploading file:', req.file.originalname, 'Size:', req.file.size);

        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        // Add optional metadata
        if (req.body.title) formData.append('title', req.body.title);
        if (req.body.category) formData.append('category', req.body.category);
        if (req.body.description) formData.append('description', req.body.description);
        if (req.body.auto_process !== undefined) formData.append('auto_process', req.body.auto_process);

        const response = await apiClient.post('/pdf/upload', formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 120000, // 2 minutes for file upload
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        console.log('Upload successful:', response.data);
        res.json(response.data);

    } catch (error) {
        console.error('Upload error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// Bulk upload
router.post('/bulk-upload', upload.array('files', config.upload.maxBulkFiles), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        if (req.files.length > config.upload.maxBulkFiles) {
            return res.status(400).json({
                error: `Maximum ${config.upload.maxBulkFiles} files allowed per batch`
            });
        }

        console.log(`Bulk uploading ${req.files.length} files`);

        const formData = new FormData();

        // Add all files
        req.files.forEach(file => {
            formData.append('files', file.buffer, {
                filename: file.originalname,
                contentType: file.mimetype
            });
        });

        // Add optional metadata
        if (req.body.category) formData.append('category', req.body.category);
        if (req.body.description) formData.append('description', req.body.description);
        if (req.body.auto_process !== undefined) formData.append('auto_process', req.body.auto_process);

        const response = await apiClient.post('/bulk/upload', formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 300000, // 5 minutes for bulk upload
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        console.log('Bulk upload successful:', response.data);
        res.json(response.data);

    } catch (error) {
        console.error('Bulk upload error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// Bulk upload status
router.get('/bulk-upload/:uploadId/status', async (req, res) => {
    try {
        const response = await apiClient.get(`/bulk/status/${req.params.uploadId}`);
        res.json(response.data);
    } catch (error) {
        console.error('Bulk upload status error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// Search endpoints
router.post('/search', async (req, res) => {
    try {
        const {
            query,
            limit = config.search.defaultLimit,
            similarity_threshold = config.search.defaultSimilarityThreshold,
            pdf_ids,
            categories,
            file_types,
            include_content = true
        } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        console.log('Search query:', query, 'Options:', { limit, similarity_threshold, pdf_ids, categories });

        const searchPayload = {
            query,
            limit: Math.min(limit, config.search.maxLimit),
            similarity_threshold,
            include_content
        };

        if (pdf_ids && pdf_ids.length > 0) searchPayload.pdf_ids = pdf_ids;
        if (categories && categories.length > 0) searchPayload.categories = categories;
        if (file_types && file_types.length > 0) searchPayload.file_types = file_types;

        const response = await apiClient.post('/search/', searchPayload, {
            timeout: 60000 // 1 minute for search
        });

        res.json(response.data);

    } catch (error) {
        console.error('Search error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message,
            results: [],
            total: 0
        });
    }
});

// RAG query endpoint
router.post('/search/rag', async (req, res) => {
    try {
        const {
            question,  // Accept 'question' from frontend
            query,     // Also accept 'query' for direct API calls
            model = config.rag.defaultModel,
            limit = 5,
            similarity_threshold = config.search.defaultSimilarityThreshold,
            include_sources = config.rag.defaultIncludeSources,
            pdf_ids,
            categories,
            stream = config.rag.streamResponse
        } = req.body;

        // Use either 'question' or 'query' - prioritize 'query' if both are provided
        const searchQuery = query || question;

        if (!searchQuery) {
            return res.status(400).json({ error: 'Question or query is required' });
        }

        console.log('RAG query:', searchQuery, 'Model:', model);

        // FIXED: Match exact parameters from working curl request
        const ragPayload = {
            query: searchQuery,                    // ✅ Same as curl
            max_results: limit,                    // ✅ Changed from 'limit' to 'max_results'
            similarity_threshold,                  // ✅ Same as curl
            model,                                // ✅ Same as curl
            include_context: include_sources       // ✅ Changed from 'include_sources' to 'include_context'
        };

        // Only add optional parameters if they exist
        if (pdf_ids && pdf_ids.length > 0) ragPayload.document_ids = pdf_ids;
        if (categories && categories.length > 0) ragPayload.category = categories[0];

        // Remove stream parameter as it's not in the working curl request
        // if (stream !== undefined) ragPayload.stream = stream;

        console.log('Sending RAG payload:', ragPayload); // Debug log

        const response = await apiClient.post('/search/rag', ragPayload, {
            timeout: 120000 // 2 minutes for RAG queries
        });

        res.json(response.data);

    } catch (error) {
        console.error('RAG query error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message,
            answer: "I'm sorry, I couldn't generate an answer at this time.",
            sources: []
        });
    }
});
// Search suggestions
router.get('/search/suggestions', async (req, res) => {
    try {
        const { query, limit = config.search.suggestionsLimit } = req.query;

        if (!query || query.length < 2) {
            return res.json({ suggestions: [] });
        }

        const response = await apiClient.get('/search/suggestions', {
            params: { query, limit }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Search suggestions error:', error.message);
        res.json({ suggestions: [] });
    }
});

// Search history
router.get('/search/history', async (req, res) => {
    try {
        const { limit = 50, query_type, user_session } = req.query;

        const params = { limit };
        if (query_type) params.query_type = query_type;
        if (user_session) params.user_session = user_session;

        const response = await apiClient.get('/search/history', { params });
        res.json(response.data);
    } catch (error) {
        console.error('Search history error:', error.message);
        res.status(error.response?.status || 500).json({
            history: [],
            error: error.message
        });
    }
});

// Clear search history
router.delete('/search/history', async (req, res) => {
    try {
        const { user_session, older_than_days } = req.body;

        const response = await apiClient.delete('/search/history', {
            data: { user_session, older_than_days }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Clear search history error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.message
        });
    }
});

// Search feedback
router.post('/search/feedback', async (req, res) => {
    try {
        const { search_id, rating, feedback } = req.body;

        if (!search_id || !rating) {
            return res.status(400).json({ error: 'Search ID and rating are required' });
        }

        const response = await apiClient.post('/search/feedback', {
            search_id,
            rating,
            feedback
        });

        res.json(response.data);     } catch (error) {
        console.error('Search feedback error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.message
        });
    }
});

// Export search results
router.post('/search/export', async (req, res) => {
    try {
        const { search_results, format = 'json', filename } = req.body;

        if (!search_results || !Array.isArray(search_results)) {
            return res.status(400).json({ error: 'Search results are required' });
        }

        const response = await apiClient.post('/search/export', {
            search_results,
            format,
            filename
        }, {
            responseType: 'stream'
        });

        // Set appropriate headers for download
        const contentType = format === 'csv' ? 'text/csv' :
                           format === 'txt' ? 'text/plain' : 'application/json';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename || 'search_results'}.${format}"`);

        response.data.pipe(res);

    } catch (error) {
        console.error('Export search error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.message
        });
    }
});

// Similar documents
router.get('/search/similar/:id', async (req, res) => {
    try {
        const { limit = 5, similarity_threshold = 0.7 } = req.query;

        const response = await apiClient.get(`/search/similar/${req.params.id}`, {
            params: { limit, similarity_threshold }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Similar documents error:', error.message);
        res.status(error.response?.status || 500).json({
            similar_documents: [],
            error: error.message
        });
    }
});

// Document operations
router.delete('/documents/:id', async (req, res) => {
    try {
        const response = await apiClient.delete(`/api/pdfs/${req.params.id}`);
        res.json(response.data);
    } catch (error) {
        console.error('Delete document error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// Legacy endpoint
router.delete('/pdf/:id', async (req, res) => {
    req.url = `/documents/${req.params.id}`;
    router.handle(req, res);
});

router.post('/documents/:id/reprocess', async (req, res) => {
    try {
        const { force_reprocess = false } = req.body;

        const response = await apiClient.post(`/pdf/${req.params.id}/reprocess`, {
            force_reprocess
        }, {
            timeout: 120000 // 2 minutes for reprocessing
        });

        res.json(response.data);
    } catch (error) {
        console.error('Reprocess document error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// Legacy endpoint
router.post('/pdf/:id/reprocess', async (req, res) => {
    req.url = `/documents/${req.params.id}/reprocess`;
    router.handle(req, res);
});

// Document preview/view
router.get('/documents/:id/view', async (req, res) => {
    try {
        const response = await apiClient.get(`/api/pdfs/${req.params.id}/view`, {
            responseType: 'stream',
            timeout: 60000
        });

        // Set appropriate content type based on file type
        const contentType = req.query.content_type || 'application/pdf';
        res.setHeader('Content-Type', contentType);

        response.data.pipe(res);
    } catch (error) {
        console.error('View document error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// Legacy endpoint
router.get('/pdf/:id/view', async (req, res) => {
    req.url = `/documents/${req.params.id}/view`;
    router.handle(req, res);
});

// Document download
router.get('/documents/:id/download', async (req, res) => {
    try {
        const response = await apiClient.get(`/api/pdfs/${req.params.id}/download`, {
            responseType: 'stream',
            timeout: 60000
        });

        // Get document info for filename
        try {
            const docResponse = await apiClient.get(`/api/pdfs/${req.params.id}`);
            const filename = docResponse.data.original_filename || `document-${req.params.id}`;
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        } catch {
            res.setHeader('Content-Disposition', `attachment; filename="document-${req.params.id}"`);
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        response.data.pipe(res);
    } catch (error) {
        console.error('Download document error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// Legacy endpoint
router.get('/pdf/:id/download', async (req, res) => {
    req.url = `/documents/${req.params.id}/download`;
    router.handle(req, res);
});

// Document chunks
router.get('/documents/:id/chunks', async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const response = await apiClient.get(`/api/pdfs/${req.params.id}/chunks`, {
            params: {
                skip: (page - 1) * limit,
                limit
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Get document chunks error:', error.message);
        res.status(error.response?.status || 500).json({
            chunks: [],
            total: 0,
            error: error.message
        });
    }
});

// Admin endpoints
router.get('/admin/system-info', async (req, res) => {
    try {
        const response = await apiClient.get('/admin/system-info');
        res.json(response.data);
    } catch (error) {
        console.error('System info error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.message
        });
    }
});

router.post('/admin/rebuild-index', async (req, res) => {
    try {
        const { force = false } = req.body;

        const response = await apiClient.post('/admin/rebuild-index', {
            force
        }, {
            timeout: 300000 // 5 minutes for index rebuild
        });

        res.json(response.data);
    } catch (error) {
        console.error('Rebuild index error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.message
        });
    }
});

router.post('/admin/clear-cache', async (req, res) => {
    try {
        const response = await apiClient.post('/admin/clear-cache');
        res.json(response.data);
    } catch (error) {
        console.error('Clear cache error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.message
        });
    }
});

router.get('/admin/logs', async (req, res) => {
    try {
        const { level, component, limit = 100, skip = 0 } = req.query;

        const params = { limit, skip };
        if (level) params.level = level;
        if (component) params.component = component;

        const response = await apiClient.get('/admin/logs', { params });
        res.json(response.data);
    } catch (error) {
        console.error('Get logs error:', error.message);
        res.status(error.response?.status || 500).json({
            logs: [],
            total: 0,
            error: error.message
        });
    }
});

router.delete('/admin/logs', async (req, res) => {
    try {
        const { older_than_days = 30, level, component } = req.body;

        const response = await apiClient.delete('/admin/logs', {
            data: { older_than_days, level, component }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Clear logs error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.message
        });
    }
});

router.get('/admin/processing-queue', async (req, res) => {
    try {
        const { status, limit = 50, skip = 0 } = req.query;

        const params = { limit, skip };
        if (status) params.status = status;

        const response = await apiClient.get('/admin/processing-queue', { params });
        res.json(response.data);
    } catch (error) {
        console.error('Get processing queue error:', error.message);
        res.status(error.response?.status || 500).json({
            queue: [],
            total: 0,
            statistics: {},
            error: error.message
        });
    }
});

router.post('/admin/reprocess-failed', async (req, res) => {
    try {
        const { max_retries = 3 } = req.body;

        const response = await apiClient.post('/admin/reprocess-failed', {
            max_retries
        }, {
            timeout: 120000 // 2 minutes
        });

        res.json(response.data);
    } catch (error) {
        console.error('Reprocess failed documents error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.message
        });
    }
});

router.get('/admin/storage-usage', async (req, res) => {
    try {
        const response = await apiClient.get('/admin/storage-usage');
        res.json(response.data);
    } catch (error) {
        console.error('Storage usage error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.message
        });
    }
});

// Analytics endpoints
router.get('/analytics/search-stats', async (req, res) => {
    try {
        const { days = 30, group_by = 'day' } = req.query;

        const response = await apiClient.get('/analytics/search-stats', {
            params: { days, group_by }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Search stats error:', error.message);
        res.status(error.response?.status || 500).json({
            stats: [],
            error: error.message
        });
    }
});

router.get('/analytics/popular-queries', async (req, res) => {
    try {
        const { days = 30, limit = 10 } = req.query;

        const response = await apiClient.get('/analytics/popular-queries', {
            params: { days, limit }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Popular queries error:', error.message);
        res.status(error.response?.status || 500).json({
            queries: [],
            error: error.message
        });
    }
});

// User session management
router.post('/session/start', async (req, res) => {
    try {
        const { user_agent, metadata } = req.body;
        const ip_address = req.ip || req.connection.remoteAddress;

        const response = await apiClient.post('/session/start', {
            user_agent,
            ip_address,
            metadata
        });

        res.json(response.data);
    } catch (error) {
        console.error('Start session error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.message
        });
    }
});

router.post('/session/update', async (req, res) => {
    try {
        const { session_id, activity_type, metadata } = req.body;

        const response = await apiClient.post('/session/update', {
            session_id,
            activity_type,
            metadata
        });

        res.json(response.data);
    } catch (error) {
        console.error('Update session error:', error.message);
        res.status(error.response?.status || 500).json({
            error: error.message
        });
    }
});

// Error handling middleware
router.use((error, req, res, next) => {
    console.error('API route error:', error);

    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: `File size exceeds the maximum limit of ${config.upload.maxFileSize / (1024 * 1024)}MB`
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: `Maximum ${config.upload.maxBulkFiles} files allowed per batch`
            });
        }
    }

    res.status(500).json({
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// Generic proxy for any other API calls
router.all('*', async (req, res) => {
    try {
        console.log(`Proxying ${req.method} ${req.originalUrl} to FastAPI`);

        const fastApiPath = req.originalUrl.replace('/api', '');
        const config = {
            method: req.method,
            url: fastApiPath,
            timeout: 30000
        };

        // Add request body for non-GET requests
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            config.data = req.body;
        }

        // Add query parameters
        if (Object.keys(req.query).length > 0) {
            config.params = req.query;
        }

        // Set appropriate headers
        config.headers = {
            'Content-Type': req.headers['content-type'] || 'application/json',
            'Accept': 'application/json'
        };

        const response = await apiClient(config);
        res.status(response.status).json(response.data);

    } catch (error) {
        console.error('Generic proxy error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
