const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios'); // Make sure axios is imported
const config = require('../config/config');

const router = express.Router();

// FastAPI backend URL - adjust port if needed
const FASTAPI_BASE_URL = 'http://localhost:8000';

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: config.upload.maxFileSize
    },
    fileFilter: (req, file, cb) => {
        const fileExtension = file.originalname.split('.').pop().toLowerCase();
        if (config.upload.allowedTypes.includes(fileExtension)) {
            cb(null, true);
        } else {
            cb(new Error(`Only ${config.upload.allowedTypes.join(', ')} files are allowed`));
        }
    }
});

// Health check - Fixed to properly proxy to FastAPI
router.get('/health', async (req, res) => {
    try {
        console.log('Health check: Proxying to FastAPI backend...');

        const response = await axios.get(`${FASTAPI_BASE_URL}/health`, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        console.log('FastAPI health response:', response.data);

        // Return the FastAPI response directly
        res.json(response.data);

    } catch (error) {
        console.error('Health check proxy error:', error.message);

        // Return error in expected format
        res.status(500).json({
            status: 'unhealthy',
            database: 'unknown',
            database_error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Detailed health check
router.get('/health/detailed', async (req, res) => {
    try {
        console.log('Detailed health check: Proxying to FastAPI backend...');

        const response = await axios.get(`${FASTAPI_BASE_URL}/health/detailed`, {
            timeout: 15000,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

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

// Stats - Fixed to proxy to FastAPI
router.get('/stats', async (req, res) => {
    try {
        const response = await axios.get(`${FASTAPI_BASE_URL}/api/stats`, {
            timeout: 10000
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching stats:', error.message);
        res.status(500).json({
            total_pdfs: 0,
            searchable_pdfs: 0,
            total_searches: 0,
            processing_pdfs: 0
        });
    }
});

// Get PDFs - Fixed to proxy to FastAPI
router.get('/pdfs', async (req, res) => {
    try {
        const response = await axios.get(`${FASTAPI_BASE_URL}/api/pdf/`, {
            timeout: 10000
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching PDFs:', error.message);
        res.json([]); // Return empty array on error
    }
});

// Upload PDF - Fixed to proxy to FastAPI
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

        if (req.body.title) formData.append('title', req.body.title);
        if (req.body.category) formData.append('category', req.body.category);
        if (req.body.description) formData.append('description', req.body.description);

        const response = await axios.post(`${FASTAPI_BASE_URL}/api/pdf/upload`, formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 60000, // 60 seconds for file upload
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

// Search documents - Fixed to proxy to FastAPI
router.post('/search', async (req, res) => {
    try {
        const { query, ...options } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        console.log('Search query:', query, 'Options:', options);

        const response = await axios.post(`${FASTAPI_BASE_URL}/api/search`, {
            query,
            ...options
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        res.json(response.data);

    } catch (error) {
        console.error('Search error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// RAG Query - Fixed to proxy to FastAPI
router.post('/rag', async (req, res) => {
    try {
        const { question, ...options } = req.body;

        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        console.log('RAG query:', question, 'Options:', options);

        const response = await axios.post(`${FASTAPI_BASE_URL}/api/rag`, {
            question,
            ...options
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 60000 // RAG queries can take longer
        });

        res.json(response.data);

    } catch (error) {
        console.error('RAG query error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// Delete PDF - Fixed to proxy to FastAPI
router.delete('/pdf/:id', async (req, res) => {
    try {
        const pdfId = req.params.id;
        const response = await axios.delete(`${FASTAPI_BASE_URL}/api/pdf/${pdfId}`, {
            timeout: 30000
        });
        res.json(response.data);
    } catch (error) {
        console.error('Delete PDF error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// Reprocess PDF - Fixed to proxy to FastAPI
router.post('/pdf/:id/reprocess', async (req, res) => {
    try {
        const pdfId = req.params.id;
        const response = await axios.post(`${FASTAPI_BASE_URL}/api/pdf/${pdfId}/reprocess`, {}, {
            timeout: 60000
        });
        res.json(response.data);
    } catch (error) {
        console.error('Reprocess PDF error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// View PDF - Fixed to proxy to FastAPI
router.get('/pdf/:id/view', async (req, res) => {
    try {
        const pdfId = req.params.id;
        const response = await axios.get(`${FASTAPI_BASE_URL}/api/pdf/${pdfId}/view`, {
            responseType: 'stream',
            timeout: 30000
        });

        res.setHeader('Content-Type', 'application/pdf');
        response.data.pipe(res);
    } catch (error) {
        console.error('View PDF error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// Download PDF - New endpoint
router.get('/pdf/:id/download', async (req, res) => {
    try {
        const pdfId = req.params.id;
        const response = await axios.get(`${FASTAPI_BASE_URL}/api/pdf/${pdfId}/download`, {
            responseType: 'stream',
            timeout: 30000
        });

        // Set appropriate headers for download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="document-${pdfId}.pdf"`);
        response.data.pipe(res);
    } catch (error) {
        console.error('Download PDF error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.detail || error.message
        });
    }
});

// Generic proxy for any other API calls
router.all('*', async (req, res) => {
    try {
        console.log(`Proxying ${req.method} ${req.originalUrl} to FastAPI`);

        const fastApiPath = req.originalUrl.replace('/api', '/api');
        const response = await axios({
            method: req.method,
            url: `${FASTAPI_BASE_URL}${fastApiPath}`,
            data: req.body,
            headers: {
                'Content-Type': req.headers['content-type'] || 'application/json',
                'Accept': 'application/json'
            },
            timeout: 30000
        });

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
