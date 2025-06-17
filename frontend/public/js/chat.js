// RAG Chat Application - Chat Management
// Handles chat interface, message sending, and RAG responses

class ChatManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
        this.chatContainer = null;
        this.messageInput = null;
        this.sendButton = null;
        this.chatForm = null;
        this.currentSearchMode = 'rag'; // 'rag' or 'search'
        this.isProcessing = false;
        this.messageHistory = [];
        this.init();
    }

    init() {
        console.log('Initializing Chat Manager...');
        this.setupElements();
        this.setupEventListeners();

        // Register globally
        window.chatManager = this;

        // Load saved search mode
        const savedMode = localStorage.getItem('rag_search_mode') || 'rag';
        this.setSearchMode(savedMode);

        console.log('Chat manager initialized');
    }

    setupElements() {
        this.chatContainer = document.getElementById('chatContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.chatForm = document.getElementById('chatForm');

        if (!this.chatContainer || !this.messageInput || !this.sendButton || !this.chatForm) {
            console.error('Required chat elements not found');
        }
    }

    setupEventListeners() {
        if (this.chatForm) {
            this.chatForm.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        if (this.messageInput) {
            // Auto-resize textarea
            this.messageInput.addEventListener('input', () => {
                this.autoResizeTextarea();
            });

            // Handle Enter key
            this.messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSubmit(e);
                }
            });
        }

        // Search mode buttons
        document.querySelectorAll('.search-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                if (mode) {
                    this.setSearchMode(mode);
                }
            });
        });
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (this.isProcessing) {
            console.log('Already processing a message');
            return;
        }

        const query = this.messageInput.value.trim();
        if (!query) {
            return;
        }

        this.isProcessing = true;
        this.updateSendButton(true);

        try {
            // Add user message to chat
            this.addMessage('user', query);

            // Clear input
            this.messageInput.value = '';
            this.autoResizeTextarea();

            // Send to appropriate endpoint based on mode
            let response;
            if (this.currentSearchMode === 'rag') {
                response = await this.sendRAGQuery(query);
            } else {
                response = await this.sendSearchQuery(query);
            }

            // Add response to chat
            this.handleResponse(response);

        } catch (error) {
            console.error('Chat error:', error);
            this.addMessage('error', 'Sorry, I encountered an error processing your request: ' + error.message);

            if (window.showStatus) {
                window.showStatus('Failed to process message: ' + error.message, 'error');
            }
        } finally {
            this.isProcessing = false;
            this.updateSendButton(false);
        }
    }

    async sendRAGQuery(query) {
        console.log('Sending RAG query:', query);

        const requestData = {
            query: query,
            max_results: 5,
            model: "llama3.2:latest",
            similarity_threshold: 0.3,
            include_context: true
        };

        const response = await fetch(`${this.apiBaseUrl}/search/rag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`RAG query failed: ${response.statusText} - ${errorData.detail || ''}`);
        }

        return await response.json();
    }

    async sendSearchQuery(query) {
        console.log('Sending search query:', query);

        const requestData = {
            query: query,
            n_results: 10,
            similarity_threshold: 0.3
        };

        const response = await fetch(`${this.apiBaseUrl}/search/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Search query failed: ${response.statusText} - ${errorData.detail || ''}`);
        }

        return await response.json();
    }

    handleResponse(response) {
        console.log('Handling response:', response);

        if (this.currentSearchMode === 'rag') {
            this.handleRAGResponse(response);
        } else {
            this.handleSearchResponse(response);
        }
    }

    handleRAGResponse(response) {
        if (response.success === false) {
            this.addMessage('error', response.message || 'RAG query failed');
            return;
        }

        const answer = response.answer || 'No answer generated';
        const sources = response.sources || [];

        // Add the AI response
        this.addMessage('assistant', answer, {
            sources: sources,
            query: response.query,
            model: response.model_used,
            responseTime: response.response_time,
            totalSources: response.total_sources
        });
    }

    handleSearchResponse(response) {
        if (response.success === false) {
            this.addMessage('error', response.message || 'Search query failed');
            return;
        }

        const results = response.results || [];
        const total = response.total || 0;

        if (results.length === 0) {
            this.addMessage('assistant', 'No documents found matching your search query.');
            return;
        }

        // Format search results
        const searchSummary = `Found ${total} result${total !== 1 ? 's' : ''} for your search:`;

        this.addMessage('search-results', searchSummary, {
            results: results,
            query: response.query,
            total: total,
            parameters: response.parameters
        });
    }

    addMessage(type, content, metadata = {}) {
        if (!this.chatContainer) return;

        const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const timestamp = new Date();

        const messageData = {
            id: messageId,
            type: type,
            content: content,
            metadata: metadata,
            timestamp: timestamp
        };

        // Add to history
        this.messageHistory.push(messageData);

        // Create message element
        const messageElement = this.createMessageElement(messageData);

        // Add to container
        this.chatContainer.appendChild(messageElement);

        // Scroll to bottom
        this.scrollToBottom();

        // Save to localStorage
        this.saveMessageHistory();
    }

    createMessageElement(messageData) {
        const { id, type, content, metadata, timestamp } = messageData;

        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}`;
        messageDiv.id = id;

        let messageHTML = '';

        switch (type) {
            case 'user':
                messageHTML = this.createUserMessage(content, timestamp);
                break;
            case 'assistant':
                messageHTML = this.createAssistantMessage(content, metadata, timestamp);
                break;
            case 'search-results':
                messageHTML = this.createSearchResultsMessage(content, metadata, timestamp);
                break;
            case 'error':
                messageHTML = this.createErrorMessage(content, timestamp);
                break;
            default:
                messageHTML = this.createGenericMessage(content, timestamp);
        }

        messageDiv.innerHTML = messageHTML;
        return messageDiv;
    }

    createUserMessage(content, timestamp) {
        return `
            <div class="message-content user-message">
                <div class="message-header">
                    <span class="message-sender">You</span>
                    <span class="message-time">${this.formatTime(timestamp)}</span>
                </div>
                <div class="message-text">${this.escapeHtml(content)}</div>
            </div>
        `;
    }

    createAssistantMessage(content, metadata, timestamp) {
        const sources = metadata.sources || [];
        const sourcesHTML = sources.length > 0 ? this.createSourcesHTML(sources) : '';

        return `
            <div class="message-content assistant-message">
                <div class="message-header">
                    <span class="message-sender">
                        <i class="fas fa-robot"></i> RAG Assistant
                    </span>
                    <span class="message-time">${this.formatTime(timestamp)}</span>
                    ${metadata.model ? `<span class="message-model">${metadata.model}</span>` : ''}
                </div>
                <div class="message-text">${this.formatMessageContent(content)}</div>
                ${sourcesHTML}
                ${metadata.responseTime ? `<div class="message-meta">Response time: ${(metadata.responseTime * 1000).toFixed(0)}ms</div>` : ''}
            </div>
        `;
    }

    createSearchResultsMessage(content, metadata, timestamp) {
        const results = metadata.results || [];
        const resultsHTML = this.createSearchResultsHTML(results);

        return `
            <div class="message-content search-message">
                <div class="message-header">
                    <span class="message-sender">
                        <i class="fas fa-search"></i> Search Results
                    </span>
                    <span class="message-time">${this.formatTime(timestamp)}</span>
                </div>
                <div class="message-text">${this.escapeHtml(content)}</div>
                ${resultsHTML}
            </div>
        `;
    }

    createErrorMessage(content, timestamp) {
        return `
            <div class="message-content error-message">
                <div class="message-header">
                    <span class="message-sender">
                        <i class="fas fa-exclamation-triangle"></i> Error
                    </span>
                    <span class="message-time">${this.formatTime(timestamp)}</span>
                </div>
                <div class="message-text">${this.escapeHtml(content)}</div>
            </div>
        `;
    }

    createSourcesHTML(sources) {
        if (!sources || sources.length === 0) return '';

        const sourcesItems = sources.map((source, index) => {
            const filename = source.filename || 'Unknown Document';
            const similarity = source.similarity_score || 0;
            const documentId = source.document_id || source.pdf_id;

            return `
                <div class="source-item" onclick="window.documentManager?.openDocumentViewer('${documentId}')">
                    <div class="source-header">
                        <span class="source-filename">
                            <i class="fas fa-file"></i> ${this.escapeHtml(filename)}
                        </span>
                        <span class="source-similarity">${(similarity * 100).toFixed(1)}%</span>
                    </div>
                    ${source.page_number ? `<div class="source-page">Page ${source.page_number}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="message-sources">
                <div class="sources-header">
                    <i class="fas fa-link"></i> Sources (${sources.length})
                </div>
                <div class="sources-list">
                    ${sourcesItems}
                </div>
            </div>
        `;
    }

    createSearchResultsHTML(results) {
        if (!results || results.length === 0) return '';

        const resultsItems = results.map((result, index) => {
            const filename = result.filename || 'Unknown Document';
            const content = result.content || '';
            const similarity = result.similarity_score || 0;
            const documentId = result.document_id || result.pdf_id;

            // Truncate content for display
            const truncatedContent = content.length > 200 ?
                content.substring(0, 200) + '...' : content;

            return `
                <div class="search-result-item" onclick="window.documentManager?.openDocumentViewer('${documentId}')">
                    <div class="result-header">
                        <span class="result-filename">
                            <i class="fas fa-file"></i> ${this.escapeHtml(filename)}
                        </span>
                        <span class="result-similarity">${(similarity * 100).toFixed(1)}%</span>
                    </div>
                    <div class="result-content">${this.escapeHtml(truncatedContent)}</div>
                    ${result.page_number ? `<div class="result-page">Page ${result.page_number}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="search-results-container">
                ${resultsItems}
            </div>
        `;
    }

    setSearchMode(mode) {
        this.currentSearchMode = mode;

        // Update UI
        document.querySelectorAll('.search-mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.querySelector(`[data-mode="${mode}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // Update placeholder
        if (this.messageInput) {
            if (mode === 'rag') {
                this.messageInput.placeholder = 'Ask a question about your documents...';
            } else {
                this.messageInput.placeholder = 'Search for content in your documents...';
            }
        }

        // Save to localStorage
        localStorage.setItem('rag_search_mode', mode);

        console.log('Search mode set to:', mode);
    }

    updateSendButton(isProcessing) {
        if (!this.sendButton) return;

        this.sendButton.disabled = isProcessing;

        const icon = this.sendButton.querySelector('i');
        if (icon) {
            if (isProcessing) {
                icon.className = 'fas fa-spinner fa-spin';
            } else {
                icon.className = 'fas fa-paper-plane';
            }         }
    }

    autoResizeTextarea() {
        if (!this.messageInput) return;

        this.messageInput.style.height = 'auto';
        const newHeight = Math.min(this.messageInput.scrollHeight, 120);
        this.messageInput.style.height = newHeight + 'px';
    }

    scrollToBottom() {
        if (this.chatContainer) {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }
    }

    formatMessageContent(content) {
        if (!content) return '';

        try {
            // Basic markdown-like formatting
            let formatted = this.escapeHtml(String(content))
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
            return this.escapeHtml(String(content));
        }
    }

    formatTime(timestamp) {
        try {
            return new Date(timestamp).toLocaleTimeString();
        } catch (error) {
            return new Date().toLocaleTimeString();
        }
    }

    escapeHtml(text) {
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

    clearChat() {
        if (this.chatContainer) {
            this.chatContainer.innerHTML = '';
            this.messageHistory = [];
            this.saveMessageHistory();

            if (window.showStatus) {
                window.showStatus('Chat cleared', 'success');
            }
        }
    }

    saveMessageHistory() {
        try {
            const historyToSave = this.messageHistory.slice(-50); // Keep last 50 messages
            localStorage.setItem('rag_chat_history', JSON.stringify(historyToSave));
        } catch (error) {
            console.warn('Failed to save chat history:', error);
        }
    }

    loadMessageHistory() {
        try {
            const savedHistory = localStorage.getItem('rag_chat_history');
            if (savedHistory) {
                const history = JSON.parse(savedHistory);
                this.messageHistory = history;

                // Recreate messages in DOM
                if (this.chatContainer) {
                    this.chatContainer.innerHTML = '';
                    history.forEach(messageData => {
                        const messageElement = this.createMessageElement(messageData);
                        this.chatContainer.appendChild(messageElement);
                    });
                    this.scrollToBottom();
                }
            }
        } catch (error) {
            console.warn('Failed to load chat history:', error);
        }
    }

    // Public API methods
    getSearchMode() {
        return this.currentSearchMode;
    }

    getMessageHistory() {
        return this.messageHistory;
    }

    isProcessingMessage() {
        return this.isProcessing;
    }
}

// Initialize chat manager when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (typeof API_BASE_URL !== 'undefined') {
        window.chatManager = new ChatManager(API_BASE_URL);
        console.log('Chat manager created and registered');
    } else {
        console.error('API_BASE_URL not defined, cannot initialize chat manager');
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatManager;
}

