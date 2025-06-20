// RAG Chat Application - Enhanced Chat Management with Typing Animation
// Handles chat interface, message sending, and RAG responses with elegant animations

class ChatManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
        this.chatContainer = null;
        this.messageInput = null;
        this.sendButton = null;
        this.chatForm = null;
        this.currentSearchMode = 'rag';
        this.isProcessing = false;
        this.messageHistory = [];
        this.typingIndicator = null;
        this.typingTimeout = null;
        this.init();
    }

    init() {
        console.log('Initializing Chat Manager...');
        this.setupElements();
        this.setupEventListeners();
        this.createTypingIndicator();

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

    createTypingIndicator() {
        // Create elegant typing indicator
        this.typingIndicator = document.createElement('div');
        this.typingIndicator.className = 'typing-indicator';
        this.typingIndicator.innerHTML = `
            <div class="typing-bubble">
                <div class="typing-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="typing-content">
                    <div class="typing-text">
                        <span class="typing-label">AI is thinking</span>
                        <div class="typing-dots">
                            <span class="dot"></span>
                            <span class="dot"></span>
                            <span class="dot"></span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.typingIndicator.style.display = 'none';
    }

    showTypingIndicator(customText = 'AI is thinking') {
        if (!this.chatContainer || !this.typingIndicator) return;

        // Update typing text
        const typingLabel = this.typingIndicator.querySelector('.typing-label');
        if (typingLabel) {
            typingLabel.textContent = customText;
        }

        // Add to chat container if not already there
        if (!this.typingIndicator.parentNode) {
            this.chatContainer.appendChild(this.typingIndicator);
        }

        // Show with animation
        this.typingIndicator.style.display = 'block';
        setTimeout(() => {
            this.typingIndicator.classList.add('visible');
        }, 10);

        // Auto-scroll to bottom
        this.scrollToBottom();

        console.log('💬 Typing indicator shown:', customText);
    }

    hideTypingIndicator() {
        if (!this.typingIndicator) return;

        this.typingIndicator.classList.remove('visible');

        setTimeout(() => {
            this.typingIndicator.style.display = 'none';
            if (this.typingIndicator.parentNode) {
                this.typingIndicator.parentNode.removeChild(this.typingIndicator);
            }
        }, 300);

        console.log('💬 Typing indicator hidden');
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
            // Add user message to chat with elegant animation
            this.addMessage('user', query);

            // Clear input with smooth animation
            this.clearInputWithAnimation();

            // Show typing indicator
            if (this.currentSearchMode === 'rag') {
                this.showTypingIndicator('AI is analyzing your question');
            } else {
                this.showTypingIndicator('Searching documents');
            }

            // Send to appropriate endpoint based on mode
            let response;
            if (this.currentSearchMode === 'rag') {
                response = await this.sendRAGQuery(query);
            } else {
                response = await this.sendSearchQuery(query);
            }

            // Hide typing indicator before showing response
            this.hideTypingIndicator();

            // Small delay for better UX
            await new Promise(resolve => setTimeout(resolve, 500));

            // Add response to chat with typing animation
            this.handleResponse(response);

        } catch (error) {
            console.error('Chat error:', error);
            this.hideTypingIndicator();

            setTimeout(() => {
                this.addMessage('error', 'Sorry, I encountered an error processing your request: ' + error.message);
            }, 300);

            if (window.showStatus) {
                window.showStatus('Failed to process message: ' + error.message, 'error');
            }
        } finally {
            this.isProcessing = false;
            this.updateSendButton(false);
        }
    }

    clearInputWithAnimation() {
        const input = this.messageInput;
        if (!input) return;

        // Smooth clear animation
        input.style.transition = 'opacity 0.2s ease';
        input.style.opacity = '0.5';

        setTimeout(() => {
            input.value = '';
            this.autoResizeTextarea();
            input.style.opacity = '1';
        }, 100);
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

        // Add the AI response with typing animation
        this.addMessageWithTypingAnimation('assistant', answer, {
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

        const searchSummary = `Found ${total} result${total !== 1 ? 's' : ''} for your search:`;

        this.addMessage('search-results', searchSummary, {
            results: results,
            query: response.query,
            total: total,
            parameters: response.parameters
        });
    }

    addMessageWithTypingAnimation(type, content, metadata = {}) {
        if (type !== 'assistant') {
            // For non-assistant messages, use regular add
            this.addMessage(type, content, metadata);
            return;
        }

        // Create message placeholder
        const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const timestamp = new Date();

        const messageData = {
            id: messageId,
            type: type,
            content: '',
            metadata: metadata,
            timestamp: timestamp
        };

        this.messageHistory.push(messageData);

        // Create message element with empty content
        const messageElement = this.createMessageElement(messageData);
        this.chatContainer.appendChild(messageElement);
        this.scrollToBottom();

        // Start typing animation
        this.simulateTyping(messageElement, content, metadata);
    }

  simulateTyping(messageElement, fullContent, metadata) {
    const contentElement = messageElement.querySelector('.message-text');
    if (!contentElement) return;

    // Clear content and reset styles
    contentElement.innerHTML = '';
    contentElement.style.whiteSpace = 'normal';
    contentElement.style.wordBreak = 'normal';

    let currentIndex = 0;
    const typingSpeed = 5;

    // Clean the text
    const cleanText = fullContent
        .replace(/<[^>]*>/g, '')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const typeCharacter = () => {
        if (currentIndex < cleanText.length) {
            contentElement.textContent = cleanText.substring(0, currentIndex + 1);
            currentIndex++;
            setTimeout(typeCharacter, typingSpeed);
        } else {
            // FIXED: Just use the original content without calling formatMessageContent
            contentElement.innerHTML = fullContent;
            this.addSourcesAfterTyping(messageElement, metadata);
            this.saveMessageHistory();
        }
    };

    typeCharacter();
}

    addSourcesAfterTyping(messageElement, metadata) {
    const sources = metadata.sources || [];
    if (sources.length === 0) return;

    // CHECK: Don't add sources if they already exist
    const existingSources = messageElement.querySelector('.message-sources');
    if (existingSources) {
        console.log('Sources already exist, skipping...');
        return;
    }

    const sourcesHTML = this.createSourcesHTML(sources);
    const sourcesElement = document.createElement('div');
    sourcesElement.innerHTML = sourcesHTML;

    messageElement.querySelector('.message-bubble').appendChild(sourcesElement);
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

        this.messageHistory.push(messageData);

        // Create message element
        const messageElement = this.createMessageElement(messageData);

        // Add with slide-in animation
        messageElement.style.opacity = '0';
        messageElement.style.transform = 'translateY(20px)';
        messageElement.style.transition = 'all 0.3s ease';

        this.chatContainer.appendChild(messageElement);

        // Trigger animation
        setTimeout(() => {
            messageElement.style.opacity = '1';
            messageElement.style.transform = 'translateY(0)';
        }, 10);

        this.scrollToBottom();
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
            <div class="message-content">
                <div class="message-avatar user-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="message-bubble user-bubble">
                    <div class="message-text">${this.escapeHtml(content)}</div>
                    <div class="message-time">${this.formatTime(timestamp)}</div>
                </div>
            </div>
        `;
    }

    createAssistantMessage(content, metadata, timestamp) {
        const sources = metadata.sources || [];
        const sourcesHTML = sources.length > 0 ? this.createSourcesHTML(sources) : '';

        return `
            <div class="message-content">
                <div class="message-avatar assistant-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="message-bubble assistant-bubble">
                    <div class="message-text">${this.formatContent(content)}</div>
                    ${sourcesHTML}
                    <div class="message-time">${this.formatTime(timestamp)}</div>
                </div>
            </div>
        `;
    }

    createSearchResultsMessage(content, metadata, timestamp) {
        const results = metadata.results || [];
        const resultsHTML = this.createSearchResultsHTML(results);

        return `
            <div class="message-content">
                <div class="message-avatar search-avatar">
                    <i class="fas fa-search"></i>
                </div>
                <div class="message-bubble search-bubble">
                    <div class="message-text">${this.escapeHtml(content)}</div>
                    ${resultsHTML}
                    <div class="message-time">${this.formatTime(timestamp)}</div>
                </div>
            </div>
        `;
    }

    createErrorMessage(content, timestamp) {
        return `
            <div class="message-content">
                <div class="message-avatar error-avatar">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="message-bubble error-bubble">
                    <div class="message-text">
                        <strong>Error:</strong> ${this.escapeHtml(content)}
                    </div>
                    <div class="message-time">${this.formatTime(timestamp)}</div>
                </div>
            </div>
        `;
    }

    createGenericMessage(content, timestamp) {
        return `
            <div class="message-content">
                <div class="message-avatar system-avatar">
                    <i class="fas fa-info-circle"></i>
                </div>
                <div class="message-bubble system-bubble">
                    <div class="message-text">${this.escapeHtml(content)}</div>
                    <div class="message-time">${this.formatTime(timestamp)}</div>
                </div>
            </div>
        `;
    }

    createSourcesHTML(sources) {
        if (!sources || sources.length === 0) return '';

        const sourcesHTML = sources.map((source, index) => {
            const relevancePercentage = Math.round(source.score * 100);
            const previewText = this.truncateText(source.content, 150);

            return `
                <div class="source-item" data-document-id="${source.document_id}">
                    <div class="source-header">
                        <div class="source-title">
                            <i class="fas fa-file-alt"></i>
                            <span>${this.escapeHtml(source.title || source.filename || 'Unknown Document')}</span>
                        </div>
                        <div class="source-relevance">
                            <span class="relevance-score">${relevancePercentage}%</span>
                        </div>
                    </div>
                    <div class="source-preview">
                        "${this.escapeHtml(previewText)}"
                    </div>
                    <div class="source-actions">
                        <button class="btn btn-sm btn-outline" onclick="window.documentManager?.openDocumentViewer(${source.document_id})" title="View Document">
                            <i class="fas fa-eye"></i> View
                        </button>
                        ${source.page_number ? `<span class="source-page">Page ${source.page_number}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="message-sources">
                <div class="sources-header">
                    <i class="fas fa-link"></i>
                    <span>Sources (${sources.length})</span>
                </div>
                <div class="sources-list">
                    ${sourcesHTML}
                </div>
            </div>
        `;
    }

    createSearchResultsHTML(results) {
        if (!results || results.length === 0) return '';

        const resultsHTML = results.map((result, index) => {
            const relevancePercentage = Math.round(result.score * 100);
            const previewText = this.truncateText(result.content, 200);

            return `
                <div class="search-result-item" data-document-id="${result.document_id}">
                    <div class="result-header">
                        <div class="result-number">${index + 1}</div>
                        <div class="result-title">
                            <span>${this.escapeHtml(result.title || result.filename || 'Unknown Document')}</span>
                        </div>
                        <div class="result-relevance">
                            <span class="relevance-score">${relevancePercentage}%</span>
                        </div>
                    </div>
                    <div class="result-preview">
                        ${this.highlightSearchTerms(this.escapeHtml(previewText), result.query)}
                    </div>
                    <div class="result-actions">
                        <button class="btn btn-sm btn-primary" onclick="window.documentManager?.openDocumentViewer(${result.document_id})" title="View Document">
                            <i class="fas fa-eye"></i> View Document
                        </button>
                        ${result.page_number ? `<span class="result-page">Page ${result.page_number}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="search-results">
                ${resultsHTML}
            </div>
        `;
    }

    highlightSearchTerms(text, query) {
        if (!query) return text;

        const terms = query.split(' ').filter(term => term.length > 2);
        let highlightedText = text;

        terms.forEach(term => {
            const regex = new RegExp(`(${this.escapeRegExp(term)})`, 'gi');
            highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
        });

        return highlightedText;
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    formatContent(content) {
        if (!content) return '';

        // Convert markdown-style formatting to HTML
        let formatted = this.escapeHtml(content);

        // Bold text
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Italic text
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Line breaks
        formatted = formatted.replace(/\n/g, '<br>');

        return formatted;
    }

    formatTime(timestamp) {
        if (!timestamp) return '';

        const now = new Date();
        const messageTime = new Date(timestamp);
        const diff = now - messageTime;

        if (diff < 60000) { // Less than 1 minute
            return 'Just now';
        } else if (diff < 3600000) { // Less than 1 hour
            const minutes = Math.floor(diff / 60000);
            return `${minutes}m ago`;
        } else if (diff < 86400000) { // Less than 24 hours
            const hours = Math.floor(diff / 3600000);
            return `${hours}h ago`;
        } else {
            return messageTime.toLocaleDateString() + ' ' + messageTime.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateSendButton(isProcessing) {
        if (!this.sendButton) return;

        const icon = this.sendButton.querySelector('i');
        if (isProcessing) {
            this.sendButton.disabled = true;
            this.sendButton.classList.add('processing');
            if (icon) {
                icon.className = 'fas fa-spinner fa-spin';
            }
        } else {
            this.sendButton.disabled = false;
            this.sendButton.classList.remove('processing');
            if (icon) {
                icon.className = 'fas fa-paper-plane';
            }
        }
    }

    scrollToBottom() {
        if (this.chatContainer) {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
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

            // Handle focus/blur for elegant styling
            this.messageInput.addEventListener('focus', () => {
                this.messageInput.parentElement.classList.add('focused');
            });

            this.messageInput.addEventListener('blur', () => {
                this.messageInput.parentElement.classList.remove('focused');
            });
        }

        // Search mode buttons
        document.querySelectorAll('.search-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode || e.target.closest('.search-mode-btn').dataset.mode;
                if (mode) {
                    this.setSearchMode(mode);
                }
            });
        });

        // Clear chat button
        const clearChatBtn = document.getElementById('clearChatBtn');
        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', () => this.clearChat());
        }
    }

    autoResizeTextarea() {
        if (!this.messageInput) return;

        this.messageInput.style.height = 'auto';
        const scrollHeight = this.messageInput.scrollHeight;
        const maxHeight = 120; // Maximum height in pixels

        if (scrollHeight > maxHeight) {
            this.messageInput.style.height = maxHeight + 'px';
            this.messageInput.style.overflowY = 'auto';
        } else {
            this.messageInput.style.height = scrollHeight + 'px';
            this.messageInput.style.overflowY = 'hidden';
        }
    }

    setSearchMode(mode) {
        this.currentSearchMode = mode;
        localStorage.setItem('rag_search_mode', mode);

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
            const placeholder = mode === 'rag'
              ? 'Ask a question about your documents...'
              : 'Search for specific content in your documents...';
            this.messageInput.placeholder = placeholder;
        }

        console.log(`Search mode set to: ${mode}`);
    }

    clearChat() {
        if (!this.chatContainer) return;

        // Fade out all messages
        const messages = this.chatContainer.querySelectorAll('.chat-message');
        messages.forEach((message, index) => {
            setTimeout(() => {
                message.style.opacity = '0';
                message.style.transform = 'translateY(-20px)';
            }, index * 50);
        });

        // Clear after animation
        setTimeout(() => {
            this.chatContainer.innerHTML = '';
            this.messageHistory = [];
            this.saveMessageHistory();

            // Show welcome message
            this.addMessage('assistant', 'Chat cleared. How can I help you today?');
        }, messages.length * 50 + 300);

        console.log('Chat cleared');
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
                this.messageHistory = JSON.parse(savedHistory);
                this.renderMessageHistory();
            } else {
                // Show welcome message
                this.addMessage('assistant', 'Hello! I\'m your AI assistant. I can help you search through your documents and answer questions about them. What would you like to know?');
            }
        } catch (error) {
            console.warn('Failed to load chat history:', error);
            this.addMessage('assistant', 'Hello! I\'m your AI assistant. How can I help you today?');
        }
    }

    renderMessageHistory() {
        if (!this.chatContainer) return;

        this.chatContainer.innerHTML = '';

        this.messageHistory.forEach((messageData, index) => {
            const messageElement = this.createMessageElement(messageData);

            // Add with staggered animation
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateY(20px)';

            this.chatContainer.appendChild(messageElement);

            setTimeout(() => {
                messageElement.style.opacity = '1';
                messageElement.style.transform = 'translateY(0)';
            }, index * 100);
        });

        setTimeout(() => {
            this.scrollToBottom();
        }, this.messageHistory.length * 100 + 200);


    }
}