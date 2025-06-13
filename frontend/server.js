const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const os = require('os');

const app = express();
const PORT = 3000;

// Function to get network interfaces
function getNetworkInterfaces() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                addresses.push(interface.address);
            }
        }
    }
    return addresses;
}

const networkIPs = getNetworkInterfaces();
const serverIP = networkIPs[0] || 'localhost'; // Get primary network IP

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

// API endpoint to provide server configuration to frontend
app.get('/config', (req, res) => {
    const host = req.get('host');
    const isNetworkAccess = !host.includes('localhost') && !host.includes('127.0.0.1');

    res.json({
        serverIP: serverIP,
        isNetworkAccess: isNetworkAccess,
        apiBaseUrl: isNetworkAccess ? `http://${serverIP}:3000/api` : 'http://localhost:3000/api',
        backendUrl: `http://${serverIP}:8000`
    });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Frontend server running on http://localhost:${PORT}`);
    console.log(`Proxying /api/* requests to http://localhost:8000`);

    if (networkIPs.length > 0) {
        console.log('\n📡 Network Access URLs:');
        networkIPs.forEach(ip => {
            console.log(`   http://${ip}:${PORT}`);
        });
        console.log(`\n🔧 Make sure your backend is also accessible on network:`);
        console.log(`   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`);
    }
});
