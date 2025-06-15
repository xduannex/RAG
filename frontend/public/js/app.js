// RAG Chat Application JavaScript

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

// Store original functions before wrapping them
const originalFunctions = {};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing RAG Chat Application...');
    initializeApp();
});

async function initializeApp() {
    try {
        // Initialize DOM elements
        initializeDOMElements();

        // Initialize theme
        initializeTheme();

        // Check server connection
        await checkServerConnection();

        // Load initial data
        await loadDocuments();
        await loadStats();

        // Setup event listeners
        setupEventListeners();

        // Load saved settings
        loadSettings();

        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Failed to initialize application:', error);
        showStatus('Failed to connect to server. Please check if the backend is running.', 'error');
    }
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
            },
            timeout: 10000
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

function handleChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleChatSubmit(e);
    }
}

function autoResizeTextarea() {
    if (messageInput) {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
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

function handleGlobalKeydown(e) {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 'l':
                e.preventDefault();
                clearChat();
                break;
            case 'r':
                e.preventDefault();
                loadStats();
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
}

function handleModalClose(e) {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
}

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

        if (currentSearchMode === 'rag') {
            response = await performRAGQuery(message);
        } else {
            response = await performSearch(message);
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

async function performRAGQuery(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/search/rag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query,  // or question: query, depending on your backend
                max_results: 5,
                similarity_threshold: 0.0,  // Add this for better results
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

function truncateText(text, maxLength) {
    if (!text) return '';
    const textStr = String(text);
    if (textStr.length <= maxLength) return escapeHtml(textStr);
    return escapeHtml(textStr.substring(0, maxLength)) + '...';
}

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

        // Reload documents list
        await loadDocuments();
        await loadStats();

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

// Store original functions to prevent recursion
originalFunctions.loadDocuments = async function() {
    if (!documentList) return;

    try {
        // Try the primary endpoint first
        let response = await fetch(`${API_BASE_URL}/pdf/list`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        // If primary endpoint fails, try the alternative
        if (!response.ok) {
            console.warn('Primary endpoint failed, trying alternative...');
            response = await fetch(`${API_BASE_URL}/api/pdfs`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
        }

        if (!response.ok) {
            throw new Error(`Failed to load documents: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Documents API response:', data);

        // Handle different possible response structures
        let documents = [];
        if (Array.isArray(data)) {
            documents = data;
        } else if (data.documents && Array.isArray(data.documents)) {
            documents = data.documents;
        } else if (data.pdfs && Array.isArray(data.pdfs)) {
            documents = data.pdfs;
        } else if (data.results && Array.isArray(data.results)) {
            documents = data.results;
        }

        console.log('Processed documents:', documents);
        displayDocuments(documents);

        // Show success message only if we have documents
        if (documents.length > 0) {
            showStatus(`Loaded ${documents.length} documents successfully`, 'success', 3000);
        }

    } catch (error) {
        console.error('Failed to load documents:', error);
        documentList.innerHTML = '<div class="loading">Failed to load documents</div>';
        showStatus('Failed to load documents: ' + error.message, 'error');
    }
};

// Create a wrapper function for loadDocuments
async function loadDocuments() {
    return await originalFunctions.loadDocuments();
}

function displayDocuments(documents) {
    if (!documentList) return;

    try {
        if (!documents || !Array.isArray(documents) || documents.length === 0) {
            documentList.innerHTML = '<div class="text-center text-muted">No documents uploaded yet</div>';
            return;
        }

        console.log(`Displaying ${documents.length} documents`);

        documentList.innerHTML = documents.map(doc => {
            // Safely extract document properties with better fallbacks
            const docId = escapeHtml(String(doc.id || doc._id || ''));
            const filename = escapeHtml(String(doc.filename || doc.original_filename || doc.name || 'Unknown'));
            const title = escapeHtml(String(doc.title || doc.filename || doc.original_filename || doc.name || 'Unknown'));
            const category = escapeHtml(String(doc.category || 'Uncategorized'));
            const status = escapeHtml(String(doc.status || doc.processing_status || 'unknown'));

            return `
            <div class="pdf-item" data-doc-id="${docId}" onclick="selectDocument('${docId}', '${filename}')">
                <div class="pdf-icon">
                    <i class="fas fa-file-${getFileIcon(doc.file_type || 'unknown')}"></i>
                </div>
                <div class="pdf-info">
                    <div class="pdf-title">${title}</div>
                    <div class="pdf-meta">
                        <span>${category}</span>
                        <span>${formatFileSize(doc.file_size || doc.size || 0)}</span>
                        <span>${formatTimestamp(doc.created_at || doc.upload_date)}</span>
                    </div>
                </div>
                <div class="pdf-status">
                    <span class="status-badge status-${status.toLowerCase()}">${status}</span>
                </div>
                <div class="pdf-actions">
                    <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); openDocumentViewer('${docId}')" title="View Document">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); deleteDocument('${docId}')" title="Delete Document">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
        }).join('');

        console.log('Documents displayed successfully');
    } catch (error) {
        console.error('Error displaying documents:', error);
        documentList.innerHTML = '<div class="loading">Error displaying documents</div>';
    }
}

// Helper function for file icons
function getFileIcon(fileType) {
    const iconMap = {
        'pdf': 'pdf',
        'doc': 'word',
        'docx': 'word',
        'txt': 'alt',
        'md': 'markdown',
        'csv': 'csv',
        'json': 'code',
        'xml': 'code',
        'html': 'code',
        'jpg': 'image',
        'jpeg': 'image',
        'png': 'image',
        'gif': 'image',
        'bmp': 'image',
        'tiff': 'image'
    };
    return iconMap[fileType?.toLowerCase()] || 'file';
}

function selectDocument(docId, filename) {
    try {
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
        await loadDocuments();
        await loadStats();

    } catch (error) {
        console.error('Delete error:', error);
        showStatus('Failed to delete document: ' + error.message, 'error');
    }
}

function openDocumentViewer(docId) {
    try {
        // Find the document data from the current list
        const docElement = document.querySelector(`[data-doc-id="${docId}"]`);
        if (!docElement) {
            showStatus('Document not found', 'error');
            return;
        }

        const modal = document.getElementById('documentViewerModal');
        if (!modal) {
            showStatus('Document viewer not available', 'error');
            return;
        }

        const modalTitle = modal.querySelector('.modal-title');
        const modalBody = modal.querySelector('.modal-body');

        if (modalTitle) modalTitle.textContent = 'Document Viewer';
        if (modalBody) modalBody.innerHTML = '<div class="loading"><div class="loading-spinner"></div> Loading document...</div>';

        modal.style.display = 'flex';

        // Load document content
        loadDocumentContent(docId, modalBody);
    } catch (error) {
        console.error('Error opening document viewer:', error);
        showStatus('Failed to open document viewer', 'error');
    }
}

async function loadDocumentContent(docId, container) {
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE_URL}/pdf/${docId}/chunks`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to load document content: ${response.statusText}`);
        }

        const data = await response.json();

        // Handle different possible response structures
        let content = '';
        if (typeof data === 'string') {
            content = data;
        } else if (data.content) {
            content = data.content;
        } else if (data.chunks && Array.isArray(data.chunks)) {
            content = data.chunks.map(chunk => chunk.content || chunk.text || '').join('\n\n');
        } else if (Array.isArray(data)) {
            content = data.map(item => item.content || item.text || '').join('\n\n');
        }

                container.innerHTML = `
            <div class="document-content">
                ${formatDocumentContent(content || 'No content available')}
            </div>
        `;

    } catch (error) {
        console.error('Failed to load document content:', error);
        container.innerHTML = `
            <div class="text-center text-danger">
                <i class="fas fa-exclamation-triangle"></i>
                Failed to load document content: ${error.message}
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

// Store original loadStats function to prevent recursion
originalFunctions.loadStats = async function() {
    try {
        console.log('Loading stats from /search/stats endpoint...');

        // Use the correct search stats endpoint from your backend
        const response = await fetch(`${API_BASE_URL}/search/stats`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        console.log('Stats endpoint response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Stats endpoint error:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        console.log('Raw stats API response:', data);

        // Map the response from the backend to match frontend expectations
        // Based on your backend response structure
        const stats = {
            total_pdfs: data.total_documents || data.processed_documents || 0,
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
        showStatus(`Stats loaded: ${stats.total_documents} docs, ${stats.total_searches} searches`, 'success', 3000);

    } catch (error) {
        console.error('Failed to load stats:', error);

        // Use fallback values
        const fallbackStats = {
            total_pdfs: '?',
            total_documents: '?',
            total_searches: '?',
            recent_searches_24h: '?',
            processed_documents: '?',
            searchable_documents: '?',
            avg_response_time: '?'
        };

        updateStats(fallbackStats);
        showStatus('Failed to load statistics: ' + error.message, 'warning', 5000);

        // Re-throw the error so the fallback function can handle it
        throw error;
    }
};

// Create a wrapper function for loadStats
async function loadStats() {
    return await originalFunctions.loadStats();
}

// Enhanced updateStats function to handle all the stats from your backend
function updateStats(stats) {
    try {
        console.log('Updating stats display with:', stats);

        // Basic stats
        const totalDocsElement = document.getElementById('totalDocs');
        const totalSearchesElement = document.getElementById('totalSearches');

        if (totalDocsElement) {
            const docCount = stats.total_documents || stats.total_pdfs || 0;
            totalDocsElement.textContent = String(docCount);
            console.log('Updated total docs:', docCount);
        } else {
            console.warn('totalDocs element not found');
        }

        if (totalSearchesElement) {
            totalSearchesElement.textContent = String(stats.total_searches || 0);
            console.log('Updated total searches:', stats.total_searches);
        } else {
            console.warn('totalSearches element not found');
        }

        // Additional stats if elements exist
        const avgResponseTimeElement = document.getElementById('avgResponseTime');
        if (avgResponseTimeElement && stats.avg_response_time !== undefined) {
            avgResponseTimeElement.textContent = `${stats.avg_response_time}s`;
            console.log('Updated avg response time:', stats.avg_response_time);
        }

        const recentSearchesElement = document.getElementById('recentSearches');
        if (recentSearchesElement && stats.recent_searches_24h !== undefined) {
            recentSearchesElement.textContent = String(stats.recent_searches_24h);
            console.log('Updated recent searches:', stats.recent_searches_24h);
        }

        const processedDocsElement = document.getElementById('processedDocs');
        if (processedDocsElement && stats.processed_documents !== undefined) {
            processedDocsElement.textContent = String(stats.processed_documents);
            console.log('Updated processed docs:', stats.processed_documents);
        }

        const searchableDocsElement = document.getElementById('searchableDocs');
        if (searchableDocsElement && stats.searchable_documents !== undefined) {
            searchableDocsElement.textContent = String(stats.searchable_documents);
            console.log('Updated searchable docs:', stats.searchable_documents);
        }

        // Display top queries if element exists
        const topQueriesElement = document.getElementById('topQueries');
        if (topQueriesElement && stats.top_queries && Array.isArray(stats.top_queries)) {
            if (stats.top_queries.length > 0) {
                topQueriesElement.innerHTML = stats.top_queries
                    .slice(0, 5) // Show top 5 queries
                    .map(query => `
                        <div class="top-query-item">
                            <span class="query-text">${escapeHtml(query.query)}</span>
                            <span class="query-count">${query.count}</span>
                        </div>
                    `).join('');
            } else {
                topQueriesElement.innerHTML = '<div class="text-muted">No queries yet</div>';
            }
            console.log('Updated top queries:', stats.top_queries);
        }

        // Display vector store stats if element exists
        const vectorStoreElement = document.getElementById('vectorStore');
        if (vectorStoreElement && stats.vector_store) {
            const vectorStats = stats.vector_store;
            vectorStoreElement.innerHTML = `
                <div class="vector-stat">
                    <span>Collections: ${vectorStats.collections || 0}</span>
                </div>
                <div class="vector-stat">
                    <span>Documents: ${vectorStats.documents || 0}</span>
                </div>
                <div class="vector-stat">
                    <span>Embeddings: ${vectorStats.embeddings || 0}</span>
                </div>
            `;
            console.log('Updated vector store stats:', vectorStats);
        }

        console.log('Stats updated successfully');
    } catch (error) {
        console.error('Error updating stats display:', error);
    }
}


function clearChat() {
    if (!chatContainer) return;

    try {
        const messages = chatContainer.querySelectorAll('.chat-message');
        messages.forEach(message => message.remove());

        // Show welcome message again
        showWelcomeMessage();

        showStatus('Chat cleared', 'info');
    } catch (error) {
        console.error('Error clearing chat:', error);
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

function showStatus(message, type, duration) {
    type = type || 'info';
    duration = duration || 5000;

    try {
        if (!statusContainer) {
            createStatusContainer();
        }

        const statusDiv = document.createElement('div');
        statusDiv.className = 'status-message status-' + type;

        const iconMap = {
            info: 'fa-info-circle',
            success: 'fa-check-circle',
            warning: 'fa-exclamation-triangle',
            error: 'fa-exclamation-circle'
        };

        statusDiv.innerHTML = `
            <i class="status-icon fas ${iconMap[type] || 'fa-info-circle'}"></i>
            <span class="status-text">${escapeHtml(String(message))}</span>
            <button class="status-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        statusContainer.appendChild(statusDiv);

        // Auto remove after duration
        if (duration > 0) {
            setTimeout(function() {
                if (statusDiv.parentNode) {
                    statusDiv.remove();
                }
            }, duration);
        }
    } catch (error) {
        console.error('Error showing status:', error);
    }
}

function createStatusContainer() {
    try {
        statusContainer = document.createElement('div');
        statusContainer.id = 'statusContainer';
        statusContainer.className = 'status-container';
        document.body.appendChild(statusContainer);
    } catch (error) {
        console.error('Error creating status container:', error);
    }
}

// Utility functions
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

// Search mode functions
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
    } catch (error) {
        console.error('Error setting search mode:', error);
    }
}

// Theme functions
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

// Help functions
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

// Document viewer functions
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

// Initialize connection check with retry
async function initializeConnectionCheck() {
    const connected = await checkServerConnectionWithRetry();
    if (!connected) {
        showStatus('Unable to connect to server after multiple attempts. Please check if the backend is running.', 'error', 10000);
    }
}

// Enhanced document loading with better error handling
async function loadDocumentsWithRetry() {
    const maxRetries = 2;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Loading documents (attempt ${attempt}/${maxRetries})...`);
            await originalFunctions.loadDocuments();
            return; // Success, exit the retry loop

        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error);
            lastError = error;

            // If this isn't the last attempt, wait before retrying
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }

    // All attempts failed
    console.error('All retry attempts failed:', lastError);
    if (documentList) {
        documentList.innerHTML = '<div class="loading">Failed to load documents after multiple attempts</div>';
    }
    showStatus('Failed to load documents: ' + lastError.message, 'error');
}

// Enhanced stats loading with fallback
async function loadStatsWithFallback() {
    console.log('loadStatsWithFallback called');
    try {
        await originalFunctions.loadStats();
        console.log('Stats loaded successfully via loadStatsWithFallback');
    } catch (error) {
        console.error('Failed to load stats in fallback, using placeholder values:', error);
        updateStats({
            total_pdfs: '?',
            total_documents: '?',
            total_searches: '?',
            recent_searches_24h: '?',
            processed_documents: '?',
            searchable_documents: '?',
            avg_response_time: '?'
        });
    }
}

// Make functions globally available with error handling wrappers
window.setSearchMode = (mode) => {
    try {
        setSearchMode(mode);
    } catch (error) {
        handleAsyncError(error, 'set search mode');
    }
};
window.toggleTheme = () => {
    try {
        toggleTheme();
    } catch (error) {
        handleAsyncError(error, 'toggle theme');
    }
};

window.showHelp = () => {
    try {
        showHelp();
    } catch (error) {
        handleAsyncError(error, 'show help');
    }
};

window.hideHelp = () => {
    try {
        hideHelp();
    } catch (error) {
        handleAsyncError(error, 'hide help');
    }
};

window.closeDocumentViewer = () => {
    try {
        closeDocumentViewer();
    } catch (error) {
        handleAsyncError(error, 'close document viewer');
    }
};

window.clearChat = () => {
    try {
        clearChat();
    } catch (error) {
        handleAsyncError(error, 'clear chat');
    }
};

window.loadDocuments = async () => {
    try {
        await originalFunctions.loadDocuments();
    } catch (error) {
        console.error('Error in window.loadDocuments:', error);
        handleAsyncError(error, 'load documents');
    }
};

window.loadStats = async () => {
    try {
        await loadStatsWithFallback();
    } catch (error) {
        handleAsyncError(error, 'load stats');
    }
};

window.selectDocument = (docId, filename) => {
    try {
        selectDocument(docId, filename);
    } catch (error) {
        handleAsyncError(error, 'select document');
    }
};

window.deleteDocument = async (docId) => {
    try {
        await deleteDocument(docId);
    } catch (error) {
        handleAsyncError(error, 'delete document');
    }
};

window.openDocumentViewer = (docId) => {
    try {
        openDocumentViewer(docId);
    } catch (error) {
        handleAsyncError(error, 'open document viewer');
    }
};

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

// Enhanced initialization with better error recovery
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Initializing RAG Chat Application...');

    try {
        await initializeApp();
    } catch (error) {
        console.error('Critical initialization error:', error);
        showStatus('Failed to initialize application. Please refresh the page.', 'error', 0);

        // Try to at least show a basic interface
        try {
            initializeDOMElements();
            initializeTheme();
            setupEventListeners();
        } catch (fallbackError) {
            console.error('Fallback initialization also failed:', fallbackError);
        }
    }
});

// Initialize welcome message on load
function initializeWelcomeMessage() {
    if (chatContainer && chatContainer.children.length === 0) {
        showWelcomeMessage();
    }
}

// Call welcome message initialization after DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initializeWelcomeMessage, 100);
});

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

// Keyboard accessibility improvements
function setupKeyboardNavigation() {
    try {
        // Focus management for modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                const activeModal = document.querySelector('.modal[style*="flex"]');
                if (activeModal) {
                    const focusableElements = activeModal.querySelectorAll(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );

                    if (focusableElements.length === 0) return;

                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];

                    if (e.shiftKey) {
                        if (document.activeElement === firstElement) {
                            e.preventDefault();
                            lastElement.focus();
                        }
                    } else {
                        if (document.activeElement === lastElement) {
                            e.preventDefault();
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

// Load chat history on initialization
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(loadChatHistory, 500);
});

// Export functions for testing (if in development environment)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatFileSize,
        formatTimestamp,
        escapeHtml,
        truncateText,
        formatMessageContent,
        debounce
    };
}

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
        }
    };

    console.log('Development mode enabled. Use window.RAG_DEBUG for debugging.');
}

// Initialize application state
console.log('RAG Chat Application script loaded successfully');

async function testRAGQuery() {
    try {
        console.log('Testing RAG query...');
        const result = await performRAGQuery('Dennis');
        console.log('Test successful:', result);
        return result;
    } catch (error) {
        console.error('Test failed:', error);
        throw error;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('Page loaded, running RAG test...');
    testRAGQuery().catch(err => console.error('Auto-test failed:', err));
});



