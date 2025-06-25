// RAG Search Application - Service Worker
// Provides offline functionality and caching

const CACHE_NAME = 'rag-search-v1.0.0';
const STATIC_CACHE_NAME = 'rag-search-static-v1.0.0';
const DYNAMIC_CACHE_NAME = 'rag-search-dynamic-v1.0.0';

// Files to cache for offline functionality
const STATIC_FILES = [
    '/',
    '/index.html',
    '/css/style.css',
    '/css/responsive.css',
    '/css/documents.css',
    '/css/search.css',
    '/js/config.js',
    '/js/ragClient.js',
    '/js/utils.js',
    '/js/theme.js',
    '/js/keyboard.js',
    '/js/modal.js',
    '/js/notifications.js',
    '/js/upload.js',
    '/js/search.js',
    '/js/chat.js',
    '/js/documents.js',
    '/js/stats.js',
    '/js/globals.js',
    '/js/app.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// API endpoints to cache dynamically
const API_CACHE_PATTERNS = [
    /\/api\/documents/,
    /\/api\/stats/,
    /\/search\//
];

// Install event - cache static files
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');

    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching static files');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                console.log('Service Worker: Static files cached');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('Service Worker: Failed to cache static files', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== STATIC_CACHE_NAME &&
                            cacheName !== DYNAMIC_CACHE_NAME &&
                            cacheName.startsWith('rag-search-')) {
                            console.log('Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Handle different types of requests
    if (isStaticFile(request.url)) {
        event.respondWith(handleStaticFile(request));
    } else if (isAPIRequest(request.url)) {
        event.respondWith(handleAPIRequest(request));
    } else if (isDocumentRequest(request.url)) {
        event.respondWith(handleDocumentRequest(request));
    } else {
        event.respondWith(handleOtherRequest(request));
    }
});

// Check if request is for a static file
function isStaticFile(url) {
    return STATIC_FILES.some(file => url.endsWith(file)) ||
           url.includes('cdnjs.cloudflare.com') ||
           url.includes('fonts.googleapis.com');
}

// Check if request is for API
function isAPIRequest(url) {
    return API_CACHE_PATTERNS.some(pattern => pattern.test(url)) ||
           url.includes('/api/') ||
           url.includes('/search/');
}

// Check if request is for a document
function isDocumentRequest(url) {
    return url.includes('/documents/') ||
           url.includes('/files/') ||
           /\.(pdf|doc|docx|txt|md)$/i.test(url);
}

// Handle static file requests
async function handleStaticFile(request) {
    try {
        // Try cache first
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Fetch from network and cache
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('Service Worker: Failed to handle static file', error);

        // Return cached version if available
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Return offline page for HTML requests
        if (request.destination === 'document') {
            return caches.match('/offline.html') || createOfflineResponse();
        }

        return new Response('Network error', { status: 503 });
    }
}

// Handle API requests
async function handleAPIRequest(request) {
    try {
        // Always try network first for API requests
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            // Cache successful responses
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('Service Worker: API request failed', error);

        // Try to return cached response
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            // Add offline indicator to cached response
            const clonedResponse = cachedResponse.clone();
            const data = await clonedResponse.json();
            data._offline = true;
            data._cached_at = new Date().toISOString();

            return new Response(JSON.stringify(data), {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Served-By': 'ServiceWorker-Cache'
                }
            });
        }

        // Return offline response
        return new Response(JSON.stringify({
            success: false,
            error: 'Network unavailable. Please check your connection.',
            _offline: true
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Handle document requests
async function handleDocumentRequest(request) {
    try {
        // Try network first
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            // Cache documents for offline viewing
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        // Try cached version
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        return new Response('Document not available offline', { status: 503 });
    }
}

// Handle other requests
async function handleOtherRequest(request) {
    try {
        return await fetch(request);
    } catch (error) {
        const cachedResponse = await caches.match(request);
        return cachedResponse || new Response('Network error', { status: 503 });
    }
}

// Create offline response
function createOfflineResponse() {
    const offlineHTML = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Offline - RAG Search</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    margin: 0;
                    padding: 2rem;
                    text-align: center;
                    background: #f5f5f5;
                    color: #333;
                }
                .offline-container {
                    max-width: 500px;
                    margin: 0 auto;
                    background: white;
                    padding: 3rem;
                    border-radius: 1rem;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                .offline-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                    opacity: 0.5;
                }
                .offline-title {
                    font-size: 1.5rem;
                    margin-bottom: 1rem;
                    color: #666;
                }
                .offline-message {
                    color: #888;
                    line-height: 1.6;
                    margin-bottom: 2rem;
                }
                .offline-button {
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    font-size: 1rem;
                }
                .offline-button:hover {
                    background: #0056b3;
                }
            </style>
        </head>
        <body>
            <div class="offline-container">
                <div class="offline-icon">📡</div>
                <h1 class="offline-title">You're Offline</h1>
                <p class="offline-message">
                    It looks like you've lost your internet connection. 
                    Some features may not be available until you're back online.
                </p>
                <button class="offline-button" onclick="window.location.reload()">
                    Try Again
                </button>
            </div>
        </body>
        </html>
    `;

    return new Response(offlineHTML, {
        headers: { 'Content-Type': 'text/html' }
    });
}

// Message handling for cache management
self.addEventListener('message', event => {
    const { type, data } = event.data;

    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'CLEAR_CACHE':
            clearCache(data?.cacheName)
                .then(success => {
                    event.ports[0].postMessage({ success });
                });
            break;

        case 'GET_CACHE_SIZE':
            getCacheSize()
                .then(size => {
                    event.ports[0].postMessage({ size });
                });
            break;

        case 'PREFETCH_DOCUMENTS':
            prefetchDocuments(data?.documentIds)
                .then(results => {
                    event.ports[0].postMessage({ results });
                });
            break;
    }
});

// Clear specific cache or all caches
async function clearCache(cacheName) {
    try {
        if (cacheName) {
            return await caches.delete(cacheName);
        } else {
            const cacheNames = await caches.keys();
            const deletePromises = cacheNames
                .filter(name => name.startsWith('rag-search-'))
                .map(name => caches.delete(name));

            await Promise.all(deletePromises);
            return true;
        }
    } catch (error) {
        console.error('Service Worker: Failed to clear cache', error);
        return false;
    }
}

// Get total cache size
async function getCacheSize() {
    try {
        const cacheNames = await caches.keys();
        let totalSize = 0;

        for (const cacheName of cacheNames) {
            if (cacheName.startsWith('rag-search-')) {
                const cache = await caches.open(cacheName);
                const requests = await cache.keys();

                for (const request of requests) {
                    const response = await cache.match(request);
                    if (response) {
                        const clone = response.clone();
                        const buffer = await clone.arrayBuffer();
                        totalSize += buffer.byteLength;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Service Worker: Failed to get cache size', error);
        return 0;
    }
}

// Prefetch documents for offline access
async function prefetchDocuments(documentIds) {
    if (!documentIds || !Array.isArray(documentIds)) {
        return { success: false, error: 'Invalid document IDs' };
    }

    const results = [];
    const cache = await caches.open(DYNAMIC_CACHE_NAME);

    for (const docId of documentIds) {
        try {
            const docUrl = `/api/documents/${docId}`;
            const response = await fetch(docUrl);

            if (response.ok) {
                await cache.put(docUrl, response.clone());
                results.push({ docId, success: true });
            } else {
                results.push({ docId, success: false, error: response.statusText });
            }
        } catch (error) {
            results.push({ docId, success: false, error: error.message });
        }
    }

    return { success: true, results };
}

// Background sync for failed requests
self.addEventListener('sync', event => {
    console.log('Service Worker: Background sync triggered', event.tag);

    if (event.tag === 'retry-failed-requests') {
        event.waitUntil(retryFailedRequests());
    } else if (event.tag === 'upload-documents') {
        event.waitUntil(processQueuedUploads());
    }
});

// Retry failed requests when back online
async function retryFailedRequests() {
    try {
        const failedRequests = await getFailedRequests();

        for (const requestData of failedRequests) {
            try {
                const response = await fetch(requestData.url, requestData.options);
                if (response.ok) {
                    // Remove from failed requests
                    await removeFailedRequest(requestData.id);

                    // Notify client of success
                    notifyClients({
                        type: 'REQUEST_RETRY_SUCCESS',
                        data: { id: requestData.id, response: await response.json() }
                    });
                }
            } catch (error) {
                console.error('Service Worker: Failed to retry request', error);
            }
        }
    } catch (error) {
        console.error('Service Worker: Failed to process retry queue', error);
    }
}

// Process queued document uploads
async function processQueuedUploads() {
    try {
        const queuedUploads = await getQueuedUploads();

        for (const upload of queuedUploads) {
            try {
                const formData = new FormData();
                formData.append('file', upload.file);
                formData.append('title', upload.title || '');
                formData.append('category', upload.category || '');

                const response = await fetch('/api/documents/upload', {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    // Remove from queue
                    await removeQueuedUpload(upload.id);

                    // Notify client
                    notifyClients({
                        type: 'UPLOAD_SUCCESS',
                        data: { id: upload.id, response: await response.json() }
                    });
                } else {
                    // Update retry count
                    await updateUploadRetryCount(upload.id);
                }
            } catch (error) {
                console.error('Service Worker: Failed to upload document', error);
                await updateUploadRetryCount(upload.id);
            }
        }
    } catch (error) {
        console.error('Service Worker: Failed to process upload queue', error);
    }
}

// Notify all clients
function notifyClients(message) {
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage(message);
        });
    });
}

// IndexedDB operations for offline queue management
async function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('RAGSearchDB', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = event => {
            const db = event.target.result;

            // Failed requests store
            if (!db.objectStoreNames.contains('failedRequests')) {
                const failedStore = db.createObjectStore('failedRequests', { keyPath: 'id' });
                failedStore.createIndex('timestamp', 'timestamp');
            }

            // Upload queue store
            if (!db.objectStoreNames.contains('uploadQueue')) {
                const uploadStore = db.createObjectStore('uploadQueue', { keyPath: 'id' });
                uploadStore.createIndex('timestamp', 'timestamp');
                uploadStore.createIndex('retryCount', 'retryCount');
            }

            // Cache metadata store
            if (!db.objectStoreNames.contains('cacheMetadata')) {
                db.createObjectStore('cacheMetadata', { keyPath: 'key' });
            }
        };
    });
}

async function getFailedRequests() {
    const db = await openDatabase();
    const transaction = db.transaction(['failedRequests'], 'readonly');
    const store = transaction.objectStore('failedRequests');

    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function removeFailedRequest(id) {
    const db = await openDatabase();
    const transaction = db.transaction(['failedRequests'], 'readwrite');
    const store = transaction.objectStore('failedRequests');

    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getQueuedUploads() {
    const db = await openDatabase();
    const transaction = db.transaction(['uploadQueue'], 'readonly');
    const store = transaction.objectStore('uploadQueue');

    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result.filter(upload => upload.retryCount < 3));
        request.onerror = () => reject(request.error);
    });
}

async function removeQueuedUpload(id) {
    const db = await openDatabase();
    const transaction = db.transaction(['uploadQueue'], 'readwrite');
    const store = transaction.objectStore('uploadQueue');

    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function updateUploadRetryCount(id) {
    const db = await openDatabase();
    const transaction = db.transaction(['uploadQueue'], 'readwrite');
    const store = transaction.objectStore('uploadQueue');

    return new Promise((resolve, reject) => {
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const upload = getRequest.result;
            if (upload) {
                upload.retryCount = (upload.retryCount || 0) + 1;
                upload.lastRetry = Date.now();

                const putRequest = store.put(upload);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            } else {
                resolve();
            }
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

// Push notification handling
self.addEventListener('push', event => {
    console.log('Service Worker: Push event received');

    if (!event.data) {
        return;
    }

    const data = event.data.json();
    const options = {
        body: data.body || 'New notification from RAG Search',
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: data.tag || 'rag-notification',
        requireInteraction: data.requireInteraction || false,
        actions: data.actions || [],
        data: data.data || {}
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'RAG Search', options)
    );
});

// Notification click handling
self.addEventListener('notificationclick', event => {
    console.log('Service Worker: Notification clicked');

    event.notification.close();

    const { action, data } = event;

    if (action === 'view_document' && data.documentId) {
        event.waitUntil(
            clients.openWindow(`/documents/${data.documentId}`)
        );
    } else if (action === 'open_search') {
        event.waitUntil(
            clients.openWindow('/')
        );
    } else {
        // Default action - focus existing window or open new one
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then(clientList => {
                if (clientList.length > 0) {
                    return clientList[0].focus();
                }
                return clients.openWindow('/');
            })
        );
    }
});

// Periodic cleanup
async function performPeriodicCleanup() {
    try {
        // Clean old cache entries
        const dynamicCache = await caches.open(DYNAMIC_CACHE_NAME);
        const requests = await dynamicCache.keys();
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

        for (const request of requests) {
            const response = await dynamicCache.match(request);
            if (response) {
                const dateHeader = response.headers.get('date');
                if (dateHeader) {
                    const responseDate = new Date(dateHeader).getTime();
                    if (now - responseDate > maxAge) {
                        await dynamicCache.delete(request);
                    }
                }
            }
        }

        // Clean failed requests older than 24 hours
        const db = await openDatabase();
        const transaction = db.transaction(['failedRequests'], 'readwrite');
        const store = transaction.objectStore('failedRequests');
        const index = store.index('timestamp');
        const cutoff = now - (24 * 60 * 60 * 1000);

        const range = IDBKeyRange.upperBound(cutoff);
        const deleteRequest = index.openCursor(range);

        deleteRequest.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        console.log('Service Worker: Periodic cleanup completed');
    } catch (error) {
        console.error('Service Worker: Cleanup failed', error);
    }
}

// Schedule periodic cleanup
setInterval(performPeriodicCleanup, 60 * 60 * 1000); // Every hour

// Error handling
self.addEventListener('error', event => {
    console.error('Service Worker: Global error', event.error);

    // Notify clients of service worker error
    notifyClients({
        type: 'SERVICE_WORKER_ERROR',
        data: {
            message: event.error.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        }
    });
});

self.addEventListener('unhandledrejection', event => {
    console.error('Service Worker: Unhandled promise rejection', event.reason);

    notifyClients({
        type: 'SERVICE_WORKER_ERROR',
        data: {
            message: 'Unhandled promise rejection',
            reason: event.reason
        }
    });
});

console.log('Service Worker: Script loaded');