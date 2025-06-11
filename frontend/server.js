const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3000;

const apiProxy = createProxyMiddleware({
    target: 'http://localhost:8000',
    changeOrigin: true,
    logLevel: 'debug',
    onProxyReq: (proxyReq, req, res) => {
        console.log(`Proxying: ${req.method} ${req.url} -> http://localhost:8000${req.url}`);
    },
    onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(500).json({
            error: 'Backend connection failed',
            message: err.message
        });
    }
});

// Proxy all /api requests to Python backend
app.use('/api', apiProxy);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Proxy all /api requests to Python backend on port 8000
app.use('/api', createProxyMiddleware({
    target: 'http://localhost:8000',
    changeOrigin: true,
    logLevel: 'info',
    onProxyReq: (proxyReq, req, res) => {
        console.log(`Proxying: ${req.method} ${req.url} -> http://localhost:8000${req.url}`);
    }
}));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Frontend server running on http://localhost:${PORT}`);
    console.log(`Proxying /api/* requests to http://localhost:8000`);
});