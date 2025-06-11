const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const ragClient = require('../utils/ragClient');
const config = require('../config/config');

const router = express.Router();

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

// Health check - Updated endpoint
router.get('/health', async (req, res) => {
    try {
        const backendHealth = await ragClient.healthCheck();
        res.json({
            frontend: 'OK',
            backend: backendHealth.success ? 'OK' : 'ERROR',
            backendError: backendHealth.error || null,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            frontend: 'OK',
            backend: 'ERROR',
            backendError: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Stats - Updated endpoint
router.get('/stats', async (req, res) => {
    try {
        const result = await ragClient.getSearchStats();
        if (result.success) {
            res.json(result.data);
        } else {
            res.status(500).json({
                total_pdfs: 0,
                searchable_pdfs: 0,
                total_searches: 0
            });
        }
    } catch (error) {
        res.status(500).json({
            total_pdfs: 0,
            searchable_pdfs: 0,
            total_searches: 0
        });
    }
});

// Get PDFs - Updated endpoint
router.get('/pdfs', async (req, res) => {
    try {
        const axios = require('axios');
        const response = await axios.get(`${config.ragApi.baseUrl}/api/pdf/`);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching PDFs:', error.message);
        res.json([]); // Return empty array on error
    }
});

// Upload PDF - Updated endpoint
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

        const result = await ragClient.uploadPDF(formData);

        if (result.success) {
            console.log('Upload successful:', result.data.id);
            res.json(result.data);
        } else {
            console.error('Upload failed:', result.error);
            res.status(500).json({ error: result.error });
        }
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search documents - Updated endpoint
router.post('/search', async (req, res) => {
    try {
        const { query, ...options } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        console.log('Search query:', query, 'Options:', options);

        const result = await ragClient.searchDocuments(query, options);

        if (result.success) {
            res.json(result.data);
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// RAG Query - Updated endpoint
router.post('/rag', async (req, res) => {
    try {
        const { question, ...options } = req.body;

        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        console.log('RAG query:', question, 'Options:', options);

        const result = await ragClient.ragQuery(question, options);

        if (result.success) {
            res.json(result.data);
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (error) {
        console.error('RAG query error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete PDF - New endpoint
router.delete('/pdf/:id', async (req, res) => {
    try {
        const pdfId = req.params.id;
        const axios = require('axios');

        const response = await axios.delete(`${config.ragApi.baseUrl}/api/pdf/${pdfId}`);
        res.json(response.data);
    } catch (error) {
        console.error('Delete PDF error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reprocess PDF - New endpoint
router.post('/pdf/:id/reprocess', async (req, res) => {
    try {
        const pdfId = req.params.id;
        const axios = require('axios');

        const response = await axios.post(`${config.ragApi.baseUrl}/api/pdf/${pdfId}/reprocess`);
        res.json(response.data);
    } catch (error) {
        console.error('Reprocess PDF error:', error);
        res.status(500).json({ error: error.message });
    }
});

// View PDF - New endpoint
router.get('/pdf/:id/view', async (req, res) => {
    try {
        const pdfId = req.params.id;
        const axios = require('axios');

        const response = await axios.get(`${config.ragApi.baseUrl}/api/pdf/${pdfId}/view`, {
            responseType: 'stream'
        });

        res.setHeader('Content-Type', 'application/pdf');
        response.data.pipe(res);
    } catch (error) {
        console.error('View PDF error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
