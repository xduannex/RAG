module.exports = {
    ragApi: {
        baseUrl: process.env.RAG_API_URL || 'http://localhost:8000'
    },
    upload: {
        maxFileSize: 50 * 1024 * 1024, // 50MB
        allowedTypes: ['pdf', 'doc', 'docx'] // Added Word document support
    },
    server: {
        port: process.env.PORT || 3000
    }
};
