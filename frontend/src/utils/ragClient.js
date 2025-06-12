const axios = require('axios');
const config = require('../config/config');

class RAGClient {
    constructor() {
        this.baseURL = config.ragApi.baseUrl;
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
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
                error: error.message
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
                error: error.message
            };
        }
    }

    async uploadPDF(formData) {
        try {
            const response = await this.client.post('/pdf/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
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

    async searchDocuments(query, options = {}) {
        try {
            const payload = {
                query,
                ...options
            };
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
                ...options
            };
            const response = await this.client.post('/search/rag', payload);
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
}

module.exports = new RAGClient();