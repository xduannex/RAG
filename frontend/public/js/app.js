// RAG Chat Application JavaScript - Main App Controller

// Configuration
const API_BASE_URL = 'http://localhost:8000';

// Application configuration
const APP_CONFIG = {
    upload: {
        maxFileSize: 50 * 1024 * 1024, // 50MB
        maxBulkFiles: 10,
        allowedTypes: ['pdf', 'doc', 'docx', 'txt']
    },
    search: {
        defaultLimit: 10,
        maxLimit: 50,
        suggestionsLimit: 5
    }
};

// Global state
let isConnected = false;
let currentFileId = null;
let currentSearchMode = 'rag';
let isDarkMode = false;

// DOM elements
let chatContainer, messageInput, chatForm, uploadForm, statusContainer;
let documentList, statusDot, statusText, uploadArea, fileInput;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing RAG Chat Application...');
    // Wait a bit for other modules to load
    setTimeout(initializeApp, 100);
});

async function initializeApp() {
    try {
        console.log('🚀 Initializing RAG Chat Application...');

        // Initialize DOM elements first
        initializeDOMElements();

        // Initialize theme
        initializeTheme();

        // Check server connection
        await checkServerConnection();

        // Wait for managers to be ready and load data
        await waitForManagersAndLoadData();

        // Load stats with fallback
        await loadStatsWithFallback();

        // Setup event listeners
        setupEventListeners();

        // Load saved settings
        loadSettings();

        console.log('✅ Application initialized successfully');

        // Show welcome message if no chat history
        setTimeout(() => {
            const chatContainer = document.getElementById('chatContainer');
            if (chatContainer && chatContainer.children.length <= 1) {
                showWelcomeMessage();
            }
        }, 1000);

    } catch (error) {
        console.error('❌ Failed to initialize application:', error);
        if (window.showStatus) {
            window.showStatus('Failed to connect to server. Please check if the backend is running.', 'error');
        }
    }
}

async function waitForManagersAndLoadData() {
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 20;

        const checkAndLoad = async () => {
            attempts++;

            if (window.documentManager && typeof window.documentManager.loadDocuments === 'function') {
                try {
                    console.log('Document manager ready, loading documents...');
                    await window.documentManager.loadDocuments();
                    resolve();
                    return;
                } catch (error) {
                    console.error('Error loading documents:', error);
                }
            }

            if (attempts >= maxAttempts) {
                console.warn('Document manager not ready after timeout');
                resolve();
                return;
            }

            setTimeout(checkAndLoad, 250);
        };

        setTimeout(checkAndLoad, 100);
    });
}

function initializeDOMElements() {
    chatContainer = document.getElementById('chatContainer');
    messageInput = document.getElementById('messageInput');
    chatForm = document.getElementById('chatForm');
    uploadForm = document.getElementById('uploadForm');
    statusContainer = document.getElementById('statusContainer');
    documentList = document.getElementById('documentList');
    statusDot = document.getElementById('statusDot');
    statusText = document.getElementById('statusText');
    uploadArea = document.getElementById('uploadArea');
    fileInput = document.getElementById('fileInput');

    // Validate required elements
    if (!chatContainer || !messageInput || !chatForm) {
        throw new Error('Required DOM elements not found');
    }

    // Set global references for backward compatibility
    window.chatContainer = chatContainer;
    window.messageInput = messageInput;
    window.chatForm = chatForm;
    window.uploadForm = uploadForm;
    window.fileInput = fileInput;
    window.uploadArea = uploadArea;
    window.documentList = documentList;
}

function initializeTheme() {
    try {
        // Load saved theme
        const savedTheme = localStorage.getItem('rag_theme') || 'light';
        isDarkMode = savedTheme === 'dark';

        if (isDarkMode) {
            document.body.classList.add('dark-theme');
            const themeIcon = document.getElementById('themeIcon');
            if (themeIcon) {
                themeIcon.className = 'fas fa-sun';
            }
        }
    } catch (error) {
        console.warn('Failed to initialize theme:', error);
    }
}

function loadSettings() {
    try {
        const savedMode = localStorage.getItem('rag_search_mode');
        if (savedMode && (savedMode === 'rag' || savedMode === 'search')) {
            setSearchMode(savedMode);
        }
    } catch (error) {
        console.warn('Failed to load settings:', error);
    }
}

async function checkServerConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            updateConnectionStatus(true);
            return true;
        } else {
            throw new Error(`Server responded with status: ${response.status}`);
        }
    } catch (error) {
        console.error('Connection check failed:', error);
        updateConnectionStatus(false);
        return false;
    }
}

function updateConnectionStatus(connected) {
    isConnected = connected;
    window.isConnected = connected; // Set global reference

    const connectionIndicator = document.getElementById('connectionIndicator');

    if (connectionIndicator && statusText) {
        if (connected) {
            connectionIndicator.className = 'connection-indicator connected';
            statusText.textContent = 'Connected';
        } else {
            connectionIndicator.className = 'connection-indicator disconnected';
            statusText.textContent = 'Disconnected';
        }
    }
}

function setupEventListeners() {
    // Chat form submission
    if (chatForm) {
        chatForm.addEventListener('submit', handleChatSubmit);
    }

    // Upload form submission
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleUploadSubmit);
    }

    // Auto-resize textarea
    if (messageInput) {
        messageInput.addEventListener('input', autoResizeTextarea);
        messageInput.addEventListener('keydown', handleChatKeydown);
    }

    // Drag and drop for file upload
    if (uploadArea) {
        setupDragAndDrop();
    }

    // Click to browse files
    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());
    }

    // File input change event
    if (fileInput) {
        fileInput.addEventListener('change', handleFileInputChange);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', handleGlobalKeydown);

    // Periodic connection check
    setInterval(checkServerConnection, 30000);

    // Close modals when clicking outside
    document.addEventListener('click', handleModalClose);
}

// Chat functionality
async function handleChatSubmit(e) {
    e.preventDefault();

    if (!isConnected) {
        showStatus('Not connected to server. Please wait for connection to be established.', 'error');
        return;
    }

    const message = messageInput.value?.trim();
    if (!message) return;

    try {
        // Clear input and add user message
        messageInput.value = '';
        autoResizeTextarea();
        addMessage(message, 'user');

        // Show typing indicator
        const typingId = showTypingIndicator();

        let response;

        // Use search manager if available, otherwise fallback to direct API calls
        if (window.searchManager && typeof window.searchManager.performSearch === 'function') {
            response = await window.searchManager.performSearch(message);
        } else {
            // Fallback to direct API calls
            if (currentSearchMode === 'rag') {
                response = await performRAGQuery(message);
            } else {
                response = await performSearch(message);
            }
        }

        // Remove typing indicator
        removeTypingIndicator(typingId);

        // Add assistant response with proper formatting
        addMessage(response.answer || response.message || 'No response received', 'assistant', response.sources);

    } catch (error) {
        console.error('Chat error:', error);
        removeTypingIndicator();
        addMessage('Sorry, I encountered an error processing your request. Please try again.', 'assistant');
        showStatus('Failed to process your message: ' + error.message, 'error');
    }
}

// Fallback API functions (in case managers aren't loaded)
async function performRAGQuery(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/search/rag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                max_results: 5,
                similarity_threshold: 0.0,
                model: "llama3.2:latest",
                include_context: true
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`RAG query failed: ${response.statusText} - ${errorData.detail || ''}`);
        }

        return await response.json();
    } catch (error) {
        console.error('RAG query error:', error);
        throw error;
    }
}

async function performSearch(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                limit: 10
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Search failed: ${response.statusText} - ${errorData.detail || ''}`);
        }

        const data = await response.json();
        return {
            answer: `Found ${data.results?.length || 0} results for "${query}"`,
            sources: data.results || []
        };
    } catch (error) {
        console.error('Search error:', error);
        throw error;
    }
}

function updateStats(stats) {
    try {
        console.log('Updating stats display with:', stats);

        // Basic stats
        const totalDocsElement = document.getElementById('totalDocs');
        const totalSearchesElement = document.getElementById('totalSearches');

        if (totalDocsElement) {
            const docCount = stats.total_documents || 0;
            totalDocsElement.textContent = String(docCount);
            console.log('Updated total docs:', docCount);
        }

        if (totalSearchesElement) {
            totalSearchesElement.textContent = String(stats.total_searches || 0);
            console.log('Updated total searches:', stats.total_searches);
        }

        // Additional stats if elements exist
        const elements = {
            'avgResponseTime': stats.avg_response_time ? `${stats.avg_response_time}s` : '?',
            'recentSearches': stats.recent_searches_24h || '?',
            'processedDocs': stats.processed_documents || '?',
            'searchableDocs': stats.searchable_documents || '?'
        };

        Object.entries(elements).forEach(([elementId, value]) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = String(value);
                console.log(`Updated ${elementId}:`, value);
            }
        });

        console.log('Stats updated successfully');
    } catch (error) {
        console.error('Error updating stats display:', error);
    }
}


// Stats loading with fallback
async function loadStatsWithFallback() {
    console.log('Loading stats with fallback...');

    const totalDocsElement = document.getElementById('totalDocs');
    const totalSearchesElement = document.getElementById('totalSearches');

    // Show loading state
    if (totalDocsElement) totalDocsElement.textContent = '...';
    if (totalSearchesElement) totalSearchesElement.textContent = '...';

    try {
        console.log('Attempting to load stats from /search/stats endpoint...');

        const response = await fetch(`${API_BASE_URL}/search/stats`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        console.log('Stats endpoint response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Raw stats API response:', data);

        // Map the response from the backend to match frontend expectations
        const stats = {
            total_documents: data.total_documents || data.processed_documents || 0,
            total_searches: data.total_searches || 0,
            recent_searches_24h: data.recent_searches_24h || 0,
            processed_documents: data.processed_documents || 0,
            searchable_documents: data.searchable_documents || 0,
            avg_response_time: data.avg_response_time || 0,
            top_queries: data.top_queries || [],
            vector_store: data.vector_store || {}
        };

        console.log('Processed stats for display:', stats);
        updateStats(stats);

        // Show success status
        if (window.showStatus) {
            window.showStatus(`Stats loaded: ${stats.total_documents} docs, ${stats.total_searches} searches`, 'success', 3000);
        }

    } catch (error) {
        console.error('Failed to load stats:', error);

        // Use fallback values
        const fallbackStats = {
            total_documents: '?',
            total_searches: '?',
            recent_searches_24h: '?',
            processed_documents: '?',
            searchable_documents: '?',
            avg_response_time: '?'
        };

        updateStats(fallbackStats);

        if (window.showStatus) {
            window.showStatus('Failed to load statistics: ' + error.message, 'warning', 5000);
        }
    }
}


// Upload functionality
async function handleUploadSubmit(e) {
    e.preventDefault();

    if (!isConnected) {
        showStatus('Not connected to server. Please wait for connection to be established.', 'error');
        return;
    }

    try {
        const titleInput = document.getElementById('titleInput');
        const categoryInput = document.getElementById('categoryInput');

        if (!fileInput || !fileInput.files || !fileInput.files[0]) {
            showStatus('Please select a file to upload.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        if (titleInput?.value?.trim()) {
            formData.append('title', titleInput.value.trim());
        }

        if (categoryInput?.value?.trim()) {
            formData.append('category', categoryInput.value.trim());
        }

        // Show upload progress
        showUploadProgress(true);

        const response = await fetch(`${API_BASE_URL}/pdf/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Upload failed: ${response.statusText} - ${errorData.detail || ''}`);
        }

        const result = await response.json();

        // Clear form
        if (uploadForm) {
            uploadForm.reset();
        }

        // Reset upload area text
        const uploadText = uploadArea?.querySelector('.upload-text');
        if (uploadText) {
            uploadText.textContent = 'Drop files here or click to browse';
        }

        // Show success message
        showStatus(`File "${result.filename || 'Unknown'}" uploaded successfully!`, 'success');

        // Reload documents list using document manager if available
        if (window.documentManager && typeof window.documentManager.loadDocuments === 'function') {
            await window.documentManager.loadDocuments();
        }

        // Reload stats
        await loadStatsWithFallback();

    } catch (error) {
        console.error('Upload error:', error);
        showStatus('Failed to upload file: ' + error.message, 'error');
    } finally {
        showUploadProgress(false);
    }
}

function showUploadProgress(show) {
    try {
        const progressDiv = document.getElementById('uploadProgress');
        const uploadButton = uploadForm?.querySelector('button[type="submit"]');

        if (show) {
            if (progressDiv) progressDiv.style.display = 'block';
            if (uploadButton) {
                uploadButton.disabled = true;
                uploadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
            }
        } else {
            if (progressDiv) progressDiv.style.display = 'none';
            if (uploadButton) {
                uploadButton.disabled = false;
                uploadButton.innerHTML = '<i class="fas fa-upload"></i> Upload Document';
            }
        }
    } catch (error) {
        console.error('Error updating upload progress:', error);
    }
}

// Message handling
function addMessage(content, sender, sources = null) {
    if (!chatContainer) return;

    try {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}-message`;

        // Add message header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';
        headerDiv.innerHTML = `
            <span class="message-sender">${sender === 'user' ? 'You' : 'Assistant'}</span>
            <span class="message-time">${new Date().toLocaleTimeString()}</span>
        `;

        // Add message content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // Format content with markdown-like styling
        const formattedContent = formatMessageContent(content);
        contentDiv.innerHTML = formattedContent;

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);

                // Add sources if available
        if (sources && Array.isArray(sources) && sources.length > 0) {
            const sourcesDiv = document.createElement('div');
            sourcesDiv.className = 'message-sources';
            sourcesDiv.innerHTML = '<strong>Sources:</strong>';

            sources.forEach((source, index) => {
                const sourceDiv = document.createElement('div');
                sourceDiv.className = 'source-item';
                sourceDiv.onclick = () => openDocumentViewer(source);

                sourceDiv.innerHTML = `
                    <div class="source-title">${escapeHtml(source.title || source.filename || `Source ${index + 1}`)}</div>
                    <div class="source-content">${truncateText(source.content || '', 150)}</div>
                    <div class="source-meta">
                        <span>${escapeHtml(source.filename || 'Unknown file')}</span>
                        ${source.score ? `<span class="source-relevance">${(source.score * 100).toFixed(1)}%</span>` : ''}
                    </div>
                `;

                sourcesDiv.appendChild(sourceDiv);
            });

            contentDiv.appendChild(sourcesDiv);
        }

        chatContainer.appendChild(messageDiv);

        // Remove welcome message if it exists
        const welcomeMessage = chatContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (error) {
        console.error('Error adding message:', error);
    }
}

function formatMessageContent(content) {
    if (!content) return '';

    try {
        // Basic markdown-like formatting
        let formatted = escapeHtml(String(content))
            // Bold text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic text
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Code blocks
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            // Inline code
            .replace(/`(.*?)`/g, '<code>$1</code>')
            // Line breaks
            .replace(/\n/g, '<br>');

        // Convert URLs to links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        formatted = formatted.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

        return formatted;
    } catch (error) {
        console.error('Error formatting message content:', error);
        return escapeHtml(String(content));
    }
}

function showTypingIndicator() {
    if (!chatContainer) return null;

    try {
        const typingId = 'typing-' + Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message assistant-message';
        messageDiv.id = typingId;

        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="loading-dots">
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
            </div>
            <span>Assistant is typing...</span>
        `;

        messageDiv.appendChild(typingDiv);
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        return typingId;
    } catch (error) {
        console.error('Error showing typing indicator:', error);
        return null;
    }
}

function removeTypingIndicator(typingId) {
    try {
        if (typingId) {
            const typingElement = document.getElementById(typingId);
            if (typingElement) {
                typingElement.remove();
            }
        } else {
            // Remove any typing indicators if no specific ID provided
            const typingElements = document.querySelectorAll('.typing-indicator');
            typingElements.forEach(el => el.parentElement?.remove());
        }
    } catch (error) {
        console.error('Error removing typing indicator:', error);
    }
}

// File handling
function handleFileInputChange(e) {
    try {
        const files = e.target.files;
        if (files && files.length > 0) {
            const fileName = files[0].name;
            const uploadText = uploadArea?.querySelector('.upload-text');
            if (uploadText) {
                uploadText.textContent = `Selected: ${fileName}`;
            }
        }
    } catch (error) {
        console.error('Error handling file input change:', error);
    }
}

function setupDragAndDrop() {
    if (!uploadArea) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });

    uploadArea.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight() {
    uploadArea?.classList.add('drag-over');
}

function unhighlight() {
    uploadArea?.classList.remove('drag-over');
}

function handleDrop(e) {
    try {
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files && files.length > 0) {
            fileInput.files = files;
            handleFileInputChange({ target: { files } });
        }
    } catch (error) {
        console.error('Error handling file drop:', error);
    }
}

// Keyboard handling
function handleChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleChatSubmit(e);
    }
}

function autoResizeTextarea() {
    const messageInput = document.getElementById('messageInput');
    if (messageInput && messageInput.style) {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    }
}

function handleGlobalKeydown(e) {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 'l':
                e.preventDefault();
                clearChat();
                break;
            case 'r':
                e.preventDefault();
                loadStatsWithFallback();
                break;
            case 'k':
                e.preventDefault();
                if (messageInput) messageInput.focus();
                break;
            case 'd':
                e.preventDefault();
                toggleTheme();
                break;
        }
    }

    if (e.key === 'Escape') {
        // Close any open modals
        document.querySelectorAll('.modal').forEach(modal => {
            if (modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
        });
    }

    if (e.key === 'F1' || e.key === '?') {
        e.preventDefault();
        showHelp();
    }
}

function handleModalClose(e) {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
}

// Theme functionality
function toggleTheme() {
    try {
        isDarkMode = !isDarkMode;

        const themeIcon = document.getElementById('themeIcon');

        if (isDarkMode) {
            document.body.classList.add('dark-theme');
            if (themeIcon) themeIcon.className = 'fas fa-sun';
        } else {
            document.body.classList.remove('dark-theme');
            if (themeIcon) themeIcon.className = 'fas fa-moon';
        }

        // Save theme preference
        localStorage.setItem('rag_theme', isDarkMode ? 'dark' : 'light');
    } catch (error) {
        console.error('Error toggling theme:', error);
    }
}

// Search mode functionality
function setSearchMode(mode) {
    if (!mode || (mode !== 'rag' && mode !== 'search')) {
        console.warn('Invalid search mode:', mode);
        return;
    }

    try {
        currentSearchMode = mode;

        // Update UI
        document.querySelectorAll('.search-mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.querySelector(`[data-mode="${mode}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // Save preference
        localStorage.setItem('rag_search_mode', mode);

        // Update placeholder text
        if (messageInput) {
            if (mode === 'rag') {
                messageInput.placeholder = 'Ask a question about your documents...';
            } else {
                messageInput.placeholder = 'Search for content in your documents...';
            }
        }

        // Update search manager if available
        if (window.searchManager && typeof window.searchManager.setSearchMode === 'function') {
            window.searchManager.setSearchMode(mode);
        }
    } catch (error) {
        console.error('Error setting search mode:', error);
    }
}

// Chat management
function clearChat() {
    if (chatContainer) {
        // Clear all messages except welcome message
        chatContainer.innerHTML = `
            <div class="welcome-message">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">
                            <i class="fas fa-info-circle"></i> Welcome to RAG Document Search!
                        </h3>
                    </div>
                    <div class="card-body">
                        <p>You can:</p>
                        <ul>
                            <li>Upload PDF, DOC, DOCX, or TXT documents</li>
                            <li>Ask questions about your documents using AI</li>
                            <li>Search for specific content across all documents</li>
                            <li>Get AI-powered answers with source citations</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        // Show success message
        showStatus('Chat cleared successfully', 'success');
    }
}

// Document viewer functionality
function openDocumentViewer(docIdOrSource) {
    try {
        console.log('openDocumentViewer called with:', docIdOrSource);

        // Handle both source objects and direct document IDs
        let docId, docTitle;

        if (typeof docIdOrSource === 'object' && docIdOrSource !== null) {
            // It's a source object from search results
            console.log('Processing source object:', docIdOrSource);

            // Try multiple possible field names for document ID
            docId = docIdOrSource.document_id ||
                   docIdOrSource.id ||
                   docIdOrSource.doc_id ||
                   docIdOrSource.file_id ||
                   docIdOrSource.pdf_id;

            docTitle = docIdOrSource.title ||
                      docIdOrSource.filename ||
                      docIdOrSource.original_filename ||
                      docIdOrSource.name ||
                      'Document';

            console.log('Extracted docId:', docId, 'docTitle:', docTitle);
        } else {
            // It's a direct document ID
            docId = docIdOrSource;
            docTitle = 'Document';
            console.log('Using direct docId:', docId);
        }

        if (!docId) {
            console.error('No document ID found in:', docIdOrSource);
            showStatus('Cannot open document: No document ID found', 'error');
            return;
        }

        // Convert to string and validate
        docId = String(docId);
        if (docId === 'undefined' || docId === 'null' || docId === '') {
            console.error('Invalid document ID:', docId);
            showStatus('Cannot open document: Invalid document ID', 'error');
            return;
        }

        console.log('Opening document viewer for ID:', docId);

        // Use document manager if available
        if (window.documentManager && typeof window.documentManager.openDocumentViewer === 'function') {
            console.log('Using document manager');
            window.documentManager.openDocumentViewer(docId);
            return;
        }

        // Fallback implementation
        console.log('Using fallback document viewer');
        const modal = document.getElementById('documentViewerModal');
        if (!modal) {
            console.error('Document viewer modal not found');
            showStatus('Document viewer not available', 'error');
            return;
        }

        const modalTitle = modal.querySelector('.modal-title');
        const modalBody = modal.querySelector('.modal-body');

        if (modalTitle) modalTitle.textContent = `Viewing: ${docTitle}`;
        if (modalBody) modalBody.innerHTML = '<div class="loading"><div class="loading-spinner"></div> Loading document...</div>';

        modal.style.display = 'flex';

        // Load document content
        loadDocumentContent(docId, modalBody);
    } catch (error) {
        console.error('Error opening document viewer:', error);
        showStatus('Failed to open document viewer: ' + error.message, 'error');
    }
}

async function loadDocumentContent(docId, container) {
    if (!container) return;

    console.log('Loading document content for ID:', docId);

    try {
        // Validate and convert docId to integer
        const documentId = parseInt(docId, 10);
        if (isNaN(documentId) || documentId <= 0) {
            throw new Error(`Invalid document ID: "${docId}" cannot be converted to a positive integer`);
        }

        console.log(`Attempting to fetch: ${API_BASE_URL}/api/documents/${documentId}/view`);

        const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}/view`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                console.error('Error response data:', errorData);
                if (errorData.detail) {
                    errorDetail += ` - ${errorData.detail}`;
                }
            } catch (jsonError) {
                const textError = await response.text();
                console.error('Error response text:', textError);
                if (textError) {
                    errorDetail += ` - ${textError}`;
                }
            }
            throw new Error(errorDetail);
        }

        const data = await response.json();
        console.log('Document data received:', data);

        container.innerHTML = `
            <div class="document-content">
                <div class="document-header mb-3">
                    <h5>${escapeHtml(data.title || data.filename || 'Document')}</h5>
                    <div class="document-meta text-muted">
                        <small>
                            Type: ${(data.file_type || 'unknown').toUpperCase()} | 
                            Words: ${(data.word_count || 0).toLocaleString()} | 
                            Pages: ${data.total_pages || 0}
                        </small>
                    </div>
                </div>
                <div class="document-text">
                    ${formatDocumentContent(data.content)}
                </div>
            </div>
        `;

    } catch (error) {
        console.error('Failed to load document content:', error);
        console.error('Original Document ID was:', docId);

        container.innerHTML = `
            <div class="text-center text-danger">
                <i class="fas fa-exclamation-triangle"></i>
                <h5>Failed to load document content</h5>
                <p><strong>Error:</strong> ${error.message}</p>
                <p><strong>Document ID:</strong> ${docId}</p>
                <small class="text-muted">Check the browser console for more details</small>
            </div>
        `;
    }
}

function formatDocumentContent(content) {
    if (!content) return '<p>No content available</p>';

    try {
        // Basic formatting for document content
        return escapeHtml(String(content))
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^/, '<p>')
            .replace(/$/, '</p>');
    } catch (error) {
        console.error('Error formatting document content:', error);
        return '<p>Error formatting content</p>';
    }
}

function closeDocumentViewer() {
    try {
        const modal = document.getElementById('documentViewerModal');
        if (modal) {
            modal.style.display = 'none';
        }
    } catch (error) {
        console.error('Error closing document viewer:', error);
    }
}

// Help functionality
function showHelp() {
    try {
        const modal = document.getElementById('helpModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    } catch (error) {
        console.error('Error showing help:', error);
    }
}

function hideHelp() {
    try {
        const modal = document.getElementById('helpModal');
        if (modal) {
            modal.style.display = 'none';
        }
    } catch (error) {
        console.error('Error hiding help:', error);
    }
}

// Utility functions
function escapeHtml(text) {
    if (!text) return '';
    try {
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    } catch (error) {
        console.error('Error escaping HTML:', error);
        return String(text);
    }
}

function truncateText(text, maxLength) {
    if (!text) return '';
    const textStr = String(text);
    if (textStr.length <= maxLength) return escapeHtml(textStr);
    return escapeHtml(textStr.substring(0, maxLength)) + '...';
}

function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';

    try {
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    } catch (error) {
        console.error('Error formatting file size:', error);
        return '0 B';
    }
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown';

    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return 'Unknown';
        return date.toLocaleDateString();
    } catch (error) {
        console.error('Error formatting timestamp:', error);
        return 'Unknown';
    }
}

// Document management functions (fallback if document manager not available)
function selectDocument(docId, filename) {
    try {
        // Use document manager if available
        if (window.documentManager && typeof window.documentManager.selectDocument === 'function') {
            window.documentManager.selectDocument(docId, filename);
            return;
        }

        // Fallback implementation
        currentFileId = docId;
        console.log('Selected document:', filename, 'ID:', docId);

        // Visual feedback
        document.querySelectorAll('.pdf-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Find the clicked element using data attribute
        const clickedElement = document.querySelector(`[data-doc-id="${docId}"]`);
        if (clickedElement) {
            clickedElement.classList.add('selected');
        }

        showStatus('Selected document: ' + filename, 'info');
    } catch (error) {
        console.error('Error selecting document:', error);
    }
}

async function deleteDocument(docId) {
    if (!confirm('Are you sure you want to delete this document?')) {
        return;
    }

    try {
        // Use document manager if available
        if (window.documentManager && typeof window.documentManager.deleteDocument === 'function') {
            await window.documentManager.deleteDocument(docId);
            return;
        }

        // Fallback implementation
        const response = await fetch(`${API_BASE_URL}/pdf/${docId}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to delete document: ${response.statusText} - ${errorData.detail || ''}`);
        }

        showStatus('Document deleted successfully', 'success');

        // Reload documents and stats
        if (window.documentManager && typeof window.documentManager.loadDocuments === 'function') {
            await window.documentManager.loadDocuments();
        }
        await loadStatsWithFallback();

    } catch (error) {
        console.error('Delete error:', error);
        showStatus('Failed to delete document: ' + error.message, 'error');
    }
}

// Global functions for backward compatibility and HTML onclick handlers
window.setSearchMode = setSearchMode;
window.toggleTheme = toggleTheme;
window.showHelp = showHelp;
window.hideHelp = hideHelp;
window.closeDocumentViewer = closeDocumentViewer;
window.clearChat = clearChat;
window.selectDocument = selectDocument;
window.deleteDocument = deleteDocument;
window.openDocumentViewer = openDocumentViewer;

// Global functions that delegate to managers when available
window.loadDocuments = async function() {
    try {
        if (window.documentManager && typeof window.documentManager.loadDocuments === 'function') {
            await window.documentManager.loadDocuments();
        } else {
            console.warn('Document manager not available, cannot load documents');
            showStatus('Document manager not ready yet', 'warning');
        }
    } catch (error) {
        console.error('Error loading documents:', error);
        showStatus('Failed to load documents: ' + error.message, 'error');
    }
};

window.loadStats = async () => {
    try {
        await loadStatsWithFallback();
    } catch (error) {
        console.error('Error in window.loadStats:', error);
        if (window.showStatus) {
            window.showStatus('Failed to load stats: ' + error.message, 'error');
        }
    }
};

// Enhanced error handling for async operations
function handleAsyncError(error, operation) {
    console.error(`Error in ${operation}:`, error);

    let userMessage = `Failed to ${operation}`;
    if (error.message) {
        userMessage += `: ${error.message}`;
    }

    showStatus(userMessage, 'error');
}

// Network request wrapper with better error handling
async function makeRequest(url, options = {}) {
    try {
        const defaultOptions = {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 30000
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        const response = await fetch(url, mergedOptions);

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

            try {
                const errorData = await response.json();
                if (errorData.detail) {
                    errorMessage += ` - ${errorData.detail}`;
                } else if (errorData.message) {
                    errorMessage += ` - ${errorData.message}`;
                }
            } catch (jsonError) {
                // If we can't parse the error response, use the status text
                console.warn('Could not parse error response:', jsonError);
            }

            throw new Error(errorMessage);
        }

        return response;
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Network error: Unable to connect to server');
        }
        throw error;
    }
}

// Debounce function for performance optimization
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Enhanced connection check with retry logic
async function checkServerConnectionWithRetry(maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const connected = await checkServerConnection();
            if (connected) return true;

            // Wait before retry (exponential backoff)
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            }
        } catch (error) {
            console.error(`Connection attempt ${i + 1} failed:`, error);
        }
    }
    return false;
}

// Performance monitoring
function logPerformanceMetrics() {
    try {
        if (window.performance && window.performance.timing) {
            const timing = window.performance.timing;
            const loadTime = timing.loadEventEnd - timing.navigationStart;
            const domReadyTime = timing.domContentLoadedEventEnd - timing.navigationStart;

            console.log('Performance Metrics:', {
                'Total Load Time': loadTime + 'ms',
                'DOM Ready Time': domReadyTime + 'ms',
                'Network Time': (timing.responseEnd - timing.fetchStart) + 'ms'
            });
        }
    } catch (error) {
        console.warn('Performance monitoring failed:', error);
    }
}

// Log performance metrics after page load
window.addEventListener('load', () => {
    setTimeout(logPerformanceMetrics, 1000);
});

// Handle online/offline status
function handleConnectionStatus() {
    function updateOnlineStatus() {
        const isOnline = navigator.onLine;
        if (!isOnline) {
            showStatus('You are currently offline. Some features may not work.', 'warning', 10000);
        } else {
            showStatus('Connection restored.', 'success', 3000);
            // Retry any failed operations
            checkServerConnection();
        }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
}

// Initialize connection status handling
document.addEventListener('DOMContentLoaded', handleConnectionStatus);

// Auto-save chat history to localStorage
function saveChatHistory() {
    try {
        if (!chatContainer) return;

        const messages = Array.from(chatContainer.querySelectorAll('.chat-message')).map(msg => {
            const sender = msg.classList.contains('user-message') ? 'user' : 'assistant';
            const content = msg.querySelector('.message-content')?.textContent || '';
            const time = msg.querySelector('.message-time')?.textContent || new Date().toLocaleTimeString();

            return { sender, content, time };
        });

        localStorage.setItem('rag_chat_history', JSON.stringify(messages));
    } catch (error) {
        console.warn('Failed to save chat history:', error);
    }
}

// Load chat history from localStorage
function loadChatHistory() {
    try {
        const savedHistory = localStorage.getItem('rag_chat_history');
        if (savedHistory && chatContainer) {
            const messages = JSON.parse(savedHistory);

            // Clear existing messages except welcome message
            const welcomeMsg = chatContainer.querySelector('.welcome-message');
            chatContainer.innerHTML = '';

            if (messages.length === 0 && welcomeMsg) {
                chatContainer.appendChild(welcomeMsg);
                return;
            }

            messages.forEach(msg => {
                addMessage(msg.content, msg.sender);
            });
        }
    } catch (error) {
        console.warn('Failed to load chat history:', error);
    }
}

// Auto-save chat periodically
setInterval(saveChatHistory, 30000); // Save every 30 seconds

// Save chat when page is unloaded
window.addEventListener('beforeunload', saveChatHistory);

// Initialize welcome message on load
function initializeWelcomeMessage() {
    if (chatContainer && chatContainer.children.length === 0) {
        showWelcomeMessage();
    }
}

function showWelcomeMessage() {
    if (!chatContainer) return;

    try {
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'welcome-message';
        welcomeDiv.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-robot"></i>
                        Welcome to RAG Document Search!
                    </h3>
                </div>
                <div class="card-body">
                    <p>Get started by:</p>
                    <ul>
                        <li>Uploading PDF, DOC, DOCX, or TXT documents</li>
                        <li>Asking questions about your documents using AI</li>
                        <li>Searching for specific content across all documents</li>
                        <li>Getting AI-powered answers with source citations</li>
                    </ul>
                    <p class="text-muted">
                        <strong>Tip:</strong> Use <kbd>Ctrl+L</kbd> to clear chat and <kbd>Ctrl+R</kbd> to refresh stats.
                    </p>
                </div>
            </div>
        `;

        chatContainer.appendChild(welcomeDiv);
    } catch (error) {
        console.error('Error showing welcome message:', error);
    }
}

// Call welcome message initialization after DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initializeWelcomeMessage, 200);
});

// Load chat history on initialization
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(loadChatHistory, 500);
});

// Add window error handler for uncaught errors
window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
    showStatus('An unexpected error occurred. Please refresh the page if problems persist.', 'error');
});

// Add unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showStatus('An unexpected error occurred. Please refresh the page if problems persist.', 'error');
    event.preventDefault(); // Prevent the default browser behavior
});

// Development mode helpers
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.RAG_DEBUG = {
        clearStorage: () => {
            localStorage.clear();
            sessionStorage.clear();
            console.log('Storage cleared');
        },
        getState: () => ({
            isConnected,
            currentFileId,
            currentSearchMode,
            isDarkMode
        }),
        testConnection: checkServerConnection,
        loadTestData: () => {
            console.log('Loading test data...');
            // Add test data loading logic here if needed
        },
        managers: {
            get documentManager() { return window.documentManager; },
            get searchManager() { return window.searchManager; },
            get uploadManager() { return window.uploadManager; },
            get notificationManager() { return window.notificationManager; }
        }
    };

    console.log('Development mode enabled. Use window.RAG_DEBUG for debugging.');
}

// Export functions for testing (if in development environment)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatFileSize,
        formatTimestamp,
        escapeHtml,
        truncateText,
        formatMessageContent,
        debounce,
        makeRequest
    };
}

// Initialize application state
console.log('RAG Chat Application main controller loaded successfully');

// Global state management
window.RAG_STATE = {
    isConnected: () => isConnected,
    getCurrentSearchMode: () => currentSearchMode,
    getCurrentFileId: () => currentFileId,
    isDarkMode: () => isDarkMode
};

// Manager registration system for other modules
window.RAG_MANAGERS = {
    register: (name, manager) => {
        window[name] = manager;
        console.log(`Manager registered: ${name}`);
    },
    get: (name) => window[name],
    isReady: (name) => window[name] && typeof window[name] === 'object'
};

// Wait for all managers to be ready before final initialization
function waitForManagers() {
    const requiredManagers = ['notificationManager'];
    const optionalManagers = ['documentManager', 'searchManager', 'uploadManager'];

    let attempts = 0;
    const maxAttempts = 30; // Reduced from 50

    const checkManagers = () => {
        attempts++;

        const requiredReady = requiredManagers.every(name => window[name] && typeof window[name] === 'object');
        const optionalReady = optionalManagers.filter(name => window[name] && typeof window[name] === 'object');

        console.log(`Manager check ${attempts}/${maxAttempts}: Required(${requiredReady}), Optional(${optionalReady.join(', ')})`);

        if (requiredReady || attempts >= maxAttempts) {
            console.log(`Managers ready: Required(${requiredReady}), Optional(${optionalReady.join(', ')})`);

            // Load initial data now that managers are ready
            setTimeout(async () => {
                try {
                    if (window.documentManager && typeof window.documentManager.loadDocuments === 'function') {
                        console.log('Loading documents via document manager...');
                        await window.documentManager.loadDocuments();
                    } else {
                        console.warn('Document manager not available');
                    }

                    console.log('Loading stats...');
                    await loadStatsWithFallback();

                } catch (error) {
                    console.error('Error loading initial data:', error);
                }
            }, 500);

            return;
        }

        if (attempts < maxAttempts) {
            setTimeout(checkManagers, 200); // Increased interval
        } else {
            console.warn('Timeout waiting for managers, proceeding anyway');
        }
    };

    setTimeout(checkManagers, 200);
}

// Start waiting for managers after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(waitForManagers, 50);
});

// Fallback showStatus function (will be overridden by notification manager)
if (!window.showStatus) {
    window.showStatus = function(message, type = 'info', duration = 5000) {
        console.log(`[${type.toUpperCase()}] ${message}`);

        // Create a simple fallback notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : type === 'warning' ? '#ffc107' : '#17a2b8'};
            color: white;
            padding: 12px 16px;
            border-radius: 4px;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, duration);
        }

        return Date.now();
    };
}

// Service worker registration for offline support
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('Service Worker registered:', registration);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    }
}

// Register service worker after page load
window.addEventListener('load', registerServiceWorker);

// Accessibility improvements
function setupAccessibilityFeatures() {
    try {
        // Add ARIA labels dynamically
        const chatInput = document.getElementById('messageInput');
        if (chatInput && !chatInput.getAttribute('aria-label')) {
            chatInput.setAttribute('aria-label', 'Type your message here');
        }

        // Add role attributes
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer && !chatContainer.getAttribute('role')) {
            chatContainer.setAttribute('role', 'log');
            chatContainer.setAttribute('aria-live', 'polite');
        }

        // Add skip links if not present
        if (!document.querySelector('.skip-link')) {
            const skipLink = document.createElement('a');
            skipLink.href = '#main-content';
            skipLink.className = 'skip-link';
            skipLink.textContent = 'Skip to main content';
            skipLink.style.cssText = `
                position: absolute;
                top: -40px;
                left: 6px;
                background: #000;
                color: #fff;
                padding: 8px;
                text-decoration: none;
                z-index: 9999;
            `;
            skipLink.addEventListener('focus', () => {
                skipLink.style.top = '6px';
            });
            skipLink.addEventListener('blur', () => {
                skipLink.style.top = '-40px';
            });
            document.body.insertBefore(skipLink, document.body.firstChild);
        }
    } catch (error) {
        console.warn('Accessibility setup failed:', error);
    }
}

// Initialize accessibility features
document.addEventListener('DOMContentLoaded', setupAccessibilityFeatures);

// Keyboard accessibility improvements
function setupKeyboardNavigation() {
    try {
        // Focus management for modals
        document.addEventListener('keydown', function(event) {
            // Additional keyboard shortcuts
            if (event.ctrlKey || event.metaKey) {
                switch (event.key) {
                    case 'u':
                        event.preventDefault();
                        if (fileInput) fileInput.click();
                        break;
                    case 'Enter':
                        if (event.target === messageInput) {
                            event.preventDefault();
                            handleChatSubmit(event);
                        }
                        break;
                }
            }

            // Tab navigation improvements
            if (event.key === 'Tab') {
                // Ensure proper tab order in modals
                const activeModal = document.querySelector('.modal[style*="flex"]');
                if (activeModal) {
                    const focusableElements = activeModal.querySelectorAll(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );

                    if (focusableElements.length > 0) {
                        const firstElement = focusableElements[0];
                        const lastElement = focusableElements[focusableElements.length - 1];

                        if (event.shiftKey && document.activeElement === firstElement) {
                            event.preventDefault();
                            lastElement.focus();
                        } else if (!event.shiftKey && document.activeElement === lastElement) {
                            event.preventDefault();
                            firstElement.focus();
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.warn('Keyboard navigation setup failed:', error);
    }
}

// Initialize keyboard navigation
document.addEventListener('DOMContentLoaded', setupKeyboardNavigation);

// Enhanced error recovery
function setupErrorRecovery() {
    // Retry failed operations
    window.retryFailedOperation = async function(operation, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                await operation();
                return true;
            } catch (error) {
                console.warn(`Operation failed (attempt ${i + 1}/${maxRetries}):`, error);
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                }
            }
        }
        return false;
    };

    // Auto-recovery for connection issues
    let connectionRetryCount = 0;
    const maxConnectionRetries = 5;

    window.addEventListener('online', async () => {
        if (connectionRetryCount < maxConnectionRetries) {
            connectionRetryCount++;
            console.log(`Attempting to reconnect (${connectionRetryCount}/${maxConnectionRetries})...`);

            const success = await window.retryFailedOperation(async () => {
                await checkServerConnection();
                if (window.documentManager && typeof window.documentManager.loadDocuments === 'function') {
                    await window.documentManager.loadDocuments();
                }
                await loadStatsWithFallback();
            });

            if (success) {
                connectionRetryCount = 0;
                showStatus('Successfully reconnected and refreshed data', 'success');
            } else {
                showStatus('Failed to fully reconnect. Some features may not work.', 'warning');
            }
        }
    });
}

// Initialize error recovery
document.addEventListener('DOMContentLoaded', setupErrorRecovery);

// Application health monitoring
function setupHealthMonitoring() {
    const healthCheck = async () => {
        try {
            const isHealthy = await checkServerConnection();

            if (!isHealthy && isConnected) {
                console.warn('Health check failed - server may be down');
                showStatus('Connection to server lost. Retrying...', 'warning', 10000);
            }

            // Check for memory leaks
            if (performance.memory) {
                const memoryUsage = performance.memory.usedJSHeapSize / 1024 / 1024;
                if (memoryUsage > 100) { // 100MB threshold
                    console.warn(`High memory usage detected: ${memoryUsage.toFixed(2)}MB`);
                }
            }

        } catch (error) {
            console.error('Health check error:', error);
        }
    };

    // Run health check every 2 minutes
    setInterval(healthCheck, 120000);

    // Initial health check after 30 seconds
    setTimeout(healthCheck, 30000);
}

// Initialize health monitoring
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(setupHealthMonitoring, 5000);
});

// Data persistence and recovery
function setupDataPersistence() {
    // Save application state periodically
    const saveAppState = () => {
        try {
            const state = {
                searchMode: currentSearchMode,
                theme: isDarkMode ? 'dark' : 'light',
                selectedDocument: currentFileId,
                timestamp: Date.now()
            };

            localStorage.setItem('rag_app_state', JSON.stringify(state));
        } catch (error) {
            console.warn('Failed to save app state:', error);
        }
    };

    // Restore application state
    const restoreAppState = () => {
        try {
            const savedState = localStorage.getItem('rag_app_state');
            if (savedState) {
                const state = JSON.parse(savedState);

                // Only restore if saved recently (within 24 hours)
                if (Date.now() - state.timestamp < 24 * 60 * 60 * 1000) {
                    if (state.searchMode) {
                        setSearchMode(state.searchMode);
                    }

                    if (state.selectedDocument) {
                        currentFileId = state.selectedDocument;
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to restore app state:', error);
        }
    };

    // Save state every 30 seconds
    setInterval(saveAppState, 30000);

    // Save state on page unload
    window.addEventListener('beforeunload', saveAppState);

    // Restore state on load
    setTimeout(restoreAppState, 1000);
}

// Initialize data persistence
document.addEventListener('DOMContentLoaded', setupDataPersistence);

// Final initialization check
function performFinalInitializationCheck() {
    setTimeout(() => {
        const checks = {
            'DOM Elements': !!(document.getElementById('chatContainer') && document.getElementById('messageInput')),
            'Server Connection': isConnected,
            'Document Manager': !!(window.documentManager),
            'Search Manager': !!(window.searchManager),
            'Upload Manager': !!(window.uploadManager),
            'Notification Manager': !!(window.notificationManager)
        };

        console.log('🔍 Final Initialization Check:');
        Object.entries(checks).forEach(([check, passed]) => {
            console.log(`  ${passed ? '✅' : '❌'} ${check}`);
        });

        const passedChecks = Object.values(checks).filter(Boolean).length;
        const totalChecks = Object.keys(checks).length;

        console.log(`📊 Initialization Score: ${passedChecks}/${totalChecks} (${Math.round(passedChecks/totalChecks*100)}%)`);

        if (passedChecks >= totalChecks * 0.5) { // Lowered threshold to 50%
            console.log('✅ Application successfully initialized');
            if (window.showStatus) {
                window.showStatus('Application ready!', 'success', 3000);
            }
        } else {
            console.warn('⚠️ Application partially initialized - some features may not work');
            if (window.showStatus) {
                window.showStatus('Application partially loaded. Some features may not work properly.', 'warning', 8000);
            }
        }
    }, 2000);
}

// Run final check
document.addEventListener('DOMContentLoaded', performFinalInitializationCheck);

// Application ready event
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        // Dispatch custom event when app is ready
        const appReadyEvent = new CustomEvent('ragAppReady', {
            detail: {
                version: '1.0.0',
                managers: {
                    document: !!window.documentManager,
                    search: !!window.searchManager,
                    upload: !!window.uploadManager,
                    notification: !!window.notificationManager
                },
                connected: isConnected
            }
        });

        document.dispatchEvent(appReadyEvent);
        console.log('🎉 RAG Application Ready Event Dispatched');
    }, 1500);
});

console.log('🚀 RAG Chat Application main controller fully loaded');


