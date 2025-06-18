// RAG Application Service Worker
// Provides offline functionality and caching

const CACHE_NAME = 'rag-app-v1';
const STATIC_CACHE_URLS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/css/chat.css',
    '/css/enhanced.css',
    '/js/app.js',
    '/js/chat.js',
    '/js/documents.js',
    '/js/upload.js',
    '/js/search.js',
    '/js/stats.js',
    '/js/utils.js',
    '/js/notifications.js',
    '/js/keyboard.js',
    '/js/modal.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Caching static resources...');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                console.log('✅ Static resources cached');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('❌ Failed to cache static resources:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker activating...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('🗑️ Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ Service Worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Handle API requests
    if (url.pathname.startsWith('/api/') || url.port === '8000') {
        event.respondWith(handleAPIRequest(request));
        return;
    }

    // Handle static resources
    event.respondWith(handleStaticRequest(request));
});

async function handleAPIRequest(request) {
    try {
        // Try network first for API requests
        const response = await fetch(request);

        // Cache successful GET requests
        if (request.method === 'GET' && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }

        return response;

    } catch (error) {
        console.log('🔌 Network failed, checking cache for:', request.url);

        // Try to serve from cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Return offline response for API requests
        return new Response(
            JSON.stringify({
                error: 'Offline',
                message: 'This feature requires an internet connection'
            }),
            {
                status: 503,
                statusText: 'Service Unavailable',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
    }
}

async function handleStaticRequest(request) {
    try {
        // Try cache first for static resources
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Try network
        const response = await fetch(request);

        // Cache successful responses
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }

        return response;

    } catch (error) {
        console.log('🔌 Failed to load resource:', request.url);

        // Return a basic offline page for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/index.html');
        }

        // Return empty response for other resources
        return new Response('', { status: 404 });
    }
}

// Handle background sync
self.addEventListener('sync', (event) => {
    console.log('🔄 Background sync triggered:', event.tag);

    if (event.tag === 'upload-documents') {
        event.waitUntil(syncPendingUploads());
    }
});

async function syncPendingUploads() {
    try {
        // Get pending uploads from IndexedDB or localStorage
        const pendingUploads = await getPendingUploads();

        for (const upload of pendingUploads) {
            try {
                await retryUpload(upload);
                await removePendingUpload(upload.id);
                console.log('✅ Synced upload:', upload.filename);
            } catch (error) {
                console.error('❌ Failed to sync upload:', upload.filename, error);
            }
        }

    } catch (error) {
        console.error('❌ Background sync failed:', error);
    }
}

async function getPendingUploads() {
    // Implementation would depend on how you store pending uploads
    // This is a placeholder
    return [];
}

async function retryUpload(upload) {
    // Implementation would retry the upload
    // This is a placeholder
    throw new Error('Not implemented');
}

async function removePendingUpload(uploadId) {
    // Implementation would remove the pending upload
    // This is a placeholder
}

// Handle push notifications (if implemented)
self.addEventListener('push', (event) => {
    console.log('📬 Push notification received');

    const options = {
        body: 'Your document has been processed',
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: 'document-processed',
        requireInteraction: true
    };

    event.waitUntil(
        self.registration.showNotification('RAG Application', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notification clicked');

    event.notification.close();

    event.waitUntil(
        clients.openWindow('/')
    );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
    console.log('💬 Message received:', event.data);

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('🔧 Service Worker script loaded');