const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

console.log('🚀 Starting FRESH test server...');

const app = express();

// Simple test route
app.get('/test', (req, res) => {
    console.log('✅ TEST ROUTE HIT!');
    res.json({ message: 'Fresh Node.js server works!' });
});

// Root route
app.get('/', (req, res) => {
    res.json({ message: 'Fresh server running' });
});

// Proxy for API
app.use('/api', createProxyMiddleware({
    target: 'http://localhost:8000',
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        console.log(`🔄 PROXY: ${req.url}`);
    },
    onError: (err, req, res) => {
        console.error(`❌ PROXY ERROR: ${err.message}`);
        res.status(500).send('Proxy Error');
    }
}));

app.listen(3000, () => {
    console.log('🌐 Fresh server on http://localhost:3000');
});
