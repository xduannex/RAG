// RAG Chat Application - Enhanced Chat Management with Typing Animation
// Handles chat interface, message sending, and RAG responses with elegant animations

class ChatManager {
    constructor(apiBaseUrlOrClient) {
        // Ensure apiBaseUrl is properly set with fallbacks
        this.apiBaseUrl = apiBaseUrlOrClient || window.API_BASE_URL || 'http://localhost:8000';

        console.log('ChatManager API Base URL:', this.apiBaseUrl);

        if (typeof apiBaseUrlOrClient === 'string') {
            this.apiBaseUrl = apiBaseUrlOrClient;
        } else if (apiBaseUrlOrClient && typeof apiBaseUrlOrClient === 'object' && apiBaseUrlOrClient.baseURL) {
            // Extract baseURL string from RAGClient object
            this.apiBaseUrl = String(apiBaseUrlOrClient.baseURL);
            this.ragClient = apiBaseUrlOrClient;
        } else {
            this.apiBaseUrl = 'http://localhost:8000';
        }

        // Force ensure it's a string, not an object
        this.apiBaseUrl = String(this.apiBaseUrl);

        console.log('ChatManager API Base URL (final):', this.apiBaseUrl);
        console.log('Type check:', typeof this.apiBaseUrl);

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
        this.isProcessingMessage = false;
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
        // Use dynamic container references for panel support
        Object.defineProperty(this, 'chatContainer', {
            get: function() {
                return window.getCurrentContainer ? window.getCurrentContainer() : document.getElementById('chatContainer');
            }
        });

        Object.defineProperty(this, 'messageInput', {
            get: function() {
                return window.getCurrentInput ? window.getCurrentInput() : document.getElementById('messageInput');
            }
        });

        this.sendButton = document.getElementById('sendButton');
        this.chatForm = document.getElementById('chatForm');

        // Also set up references for panels
        this.setupPanelReferences();

        if (!this.chatContainer && !document.getElementById('chatContainer')) {
            console.error('No chat container found');
        }
    }

    setupPanelReferences() {
        // Set up references for both panels
        this.ragChatContainer = document.getElementById('ragChatContainer');
        this.searchChatContainer = document.getElementById('searchChatContainer');
        this.ragMessageInput = document.getElementById('ragMessageInput');
        this.searchMessageInput = document.getElementById('searchMessageInput');
        this.ragChatForm = document.getElementById('ragChatForm');
        this.searchChatForm = document.getElementById('searchChatForm');
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
        const currentContainer = this.getCurrentActiveContainer();
        if (!currentContainer || !this.typingIndicator) return;

        // Update typing text
        const typingLabel = this.typingIndicator.querySelector('.typing-label');
        if (typingLabel) {
            typingLabel.textContent = customText;
        }

        // Add to current container if not already there
        if (!this.typingIndicator.parentNode) {
            currentContainer.appendChild(this.typingIndicator);
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

    getCurrentActiveContainer() {
        if (window.getCurrentContainer) {
            return window.getCurrentContainer();
        }
        return this.chatContainer || document.getElementById('chatContainer');
    }

    getCurrentActiveInput() {
        if (window.getCurrentInput) {
            return window.getCurrentInput();
        }
        return this.messageInput || document.getElementById('messageInput');
    }

    async handleSubmit(e) {
    e.preventDefault();

    // Prevent duplicate processing
    if (this.isProcessingMessage) {
        console.log('Already processing a message, skipping');
        return;
    }

    const query = this.messageInput?.value?.trim();
    if (!query) {
        return;
    }

    // Set processing flag
    this.isProcessingMessage = true;

    try {
        this.updateSendButton(true);

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
        // Always reset processing flag
        this.isProcessingMessage = false;
        this.updateSendButton(false);
    }
}

    clearInputWithAnimation() {
        const input = this.getCurrentActiveInput();
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

    async sendOpenAIRAGQuery(query, config) {
    try {
        console.log('Sending OpenAI RAG query:', query);
        console.log('Using OpenAI config:', config);

        const payload = {
            message: query,
            config: config,
            mode: 'rag'
        };

        const url = `${this.apiBaseUrl}/api/openai/rag`;
        console.log('OpenAI request URL:', url);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI API response status:', response.status);
            console.error('OpenAI API response text:', errorText);
            throw new Error(`OpenAI RAG query failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('OpenAI RAG query error:', error);
        throw error;
    }
}


   async sendRAGQuery(query) {
    try {
        // Check if OpenAI is enabled
        const ragConfig = window.getCurrentRagConfig ? window.getCurrentRagConfig() : null;

        console.log('Current RAG config:', ragConfig); // Add this debug line

        if (ragConfig && ragConfig.useOpenAI && ragConfig.openAI && ragConfig.openAI.api_key) {
            console.log('OpenAI detected - using OpenAI endpoint'); // Add this debug line
            return await this.sendOpenAIRAGQuery(query, ragConfig);
        } else {
            console.log('OpenAI not detected - using local LLM'); // Add this debug line
            console.log('ragConfig.useOpenAI:', ragConfig?.useOpenAI); // Add this debug line
            console.log('ragConfig.openAI.api_key:', ragConfig?.openAI?.api_key ? 'present' : 'missing'); // Add this debug line
            return await this.sendLocalRAGQuery(query);
        }
    } catch (error) {
        console.error('RAG query routing error:', error);
        throw error;
    }
}

async sendLocalRAGQuery(query) {
    try {
        console.log('Sending local RAG query:', query);
        console.log('Using API Base URL:', this.apiBaseUrl);

        const payload = {
            query: query,
            max_results: 5,
            similarity_threshold: 0.3,
            model: 'qwen2.5:7b'
        };

        const url = `${this.apiBaseUrl}/search/rag`;
        console.log('Local RAG request URL:', url);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Local RAG response status:', response.status);
            console.error('Local RAG response text:', errorText);
            throw new Error(`Local RAG query failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Local RAG query error:', error);
        throw error;
    }
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

    // Handle OpenAI response format
    if (response.response && response.model_used) {
        const answer = response.response;
        const sources = response.sources || [];

        this.addMessageWithTypingAnimation('assistant', answer, {
            sources: sources,
            model: response.model_used,
            responseTime: response.processing_time,
            totalSources: sources.length,
            tokensUsed: response.tokens_used,
            provider: 'OpenAI'
        });
        return;
    }

    // Handle local LLM response format
    const answer = response.answer || 'No answer generated';
    const sources = response.sources || [];

    this.addMessageWithTypingAnimation('assistant', answer, {
        sources: sources,
        query: response.query,
        model: response.model_used,
        responseTime: response.response_time,
        totalSources: response.total_sources,
        provider: 'Local LLM'
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

    addMessage(type, content, metadata = {}) {
        // Get the current active container
        const currentContainer = this.getCurrentActiveContainer();

        if (!currentContainer) {
            console.error('No active container found');
            return;
        }

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

        currentContainer.appendChild(messageElement);

        // Trigger animation
        setTimeout(() => {
            messageElement.style.opacity = '1';
            messageElement.style.transform = 'translateY(0)';
        }, 10);

        // Scroll to bottom
        this.scrollToBottom();

        // Also add to legacy container for compatibility
        if (this.chatContainer && this.chatContainer !== currentContainer) {
            const legacyElement = messageElement.cloneNode(true);
            this.chatContainer.appendChild(legacyElement);
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }

        this.saveMessageHistory();
        return messageElement;
    }

    addMessageWithTypingAnimation(type, content, metadata = {}) {
        if (type !== 'assistant') {
            // For non-assistant messages, use regular add
            this.addMessage(type, content, metadata);
            return;
        }

        // Get the current active container
        const currentContainer = this.getCurrentActiveContainer();

        if (!currentContainer) {
            console.error('No active container found for typing animation');
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
        currentContainer.appendChild(messageElement);

        // Also add to legacy container
        if (this.chatContainer && this.chatContainer !== currentContainer) {
            const legacyElement = messageElement.cloneNode(true);
            this.chatContainer.appendChild(legacyElement);
        }

        // Scroll to bottom
        this.scrollToBottom();
        if (this.chatContainer && this.chatContainer !== currentContainer) {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }

        // Start typing animation
        this.simulateTyping(messageElement, content, metadata);
    }
        simulateTyping(messageElement, fullContent, metadata) {
        const contentElement = messageElement.querySelector('.message-text');
        if (!contentElement) {
            console.error('Message text element not found');
            return;
        }

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
                // Typing complete, show formatted content
                contentElement.innerHTML = this.formatContent(fullContent);
                this.addSourcesAfterTyping(messageElement, metadata);
                this.saveMessageHistory();

                // Update legacy container if it exists
                if (this.chatContainer) {
                    const legacyMessage = this.chatContainer.querySelector(`#${messageElement.id}`);
                    if (legacyMessage) {
                        const legacyContentElement = legacyMessage.querySelector('.message-text');
                        if (legacyContentElement) {
                            legacyContentElement.innerHTML = this.formatContent(fullContent);
                        }
                        this.addSourcesAfterTyping(legacyMessage, metadata);
                    }
                }
            }
        };

        typeCharacter();
    }

    addSourcesAfterTyping(messageElement, metadata) {
        const sources = metadata.sources || [];
        if (sources.length === 0) return;

        // Check if sources already exist to prevent duplicates
        const existingSources = messageElement.querySelector('.message-sources');
        if (existingSources) {
            console.log('Sources already exist, skipping...');
            return;
        }

        const sourcesHTML = this.createSourcesHTML(sources);
        const sourcesElement = document.createElement('div');
        sourcesElement.innerHTML = sourcesHTML;

        const messageBubble = messageElement.querySelector('.message-bubble');
        if (messageBubble) {
            messageBubble.appendChild(sourcesElement);
        } else {
            messageElement.appendChild(sourcesElement);
        }
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
            // Fix relevance percentage calculation
            const score = source.score || source.similarity_score || 0;
            const relevancePercentage = Math.round(score * 100);
            const displayPercentage = isNaN(relevancePercentage) ? 0 : relevancePercentage;
            const previewText = this.truncateText(source.content, 150);

            return `
                <div class="source-item" data-document-id="${source.document_id}">
                    <div class="source-header">
                        <div class="source-title">
                            <i class="fas fa-file-alt"></i>
                            <span>${this.escapeHtml(source.title || source.filename || 'Unknown Document')}</span>
                        </div>
                        <div class="source-relevance">
                            <span class="relevance-score">${displayPercentage}%</span>
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
            // Fix relevance percentage calculation
            const score = result.score || result.similarity_score || 0;
            const relevancePercentage = Math.round(score * 100);
            const displayPercentage = isNaN(relevancePercentage) ? 0 : relevancePercentage;
            const previewText = this.truncateText(result.content, 200);

            return `
                <div class="search-result-item" data-document-id="${result.document_id}">
                    <div class="result-header">
                        <div class="result-number">${index + 1}</div>
                        <div class="result-title">
                            <span>${this.escapeHtml(result.title || result.filename || 'Unknown Document')}</span>
                        </div>
                        <div class="result-relevance">
                            <span class="relevance-score">${displayPercentage}%</span>
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
        const sendButtons = [
            this.sendButton,
            document.getElementById('ragSendButton'),
            document.getElementById('searchSendButton')
        ].filter(btn => btn);

        sendButtons.forEach(button => {
            const icon = button.querySelector('i');
            if (isProcessing) {
                button.disabled = true;
                button.classList.add('processing');
                if (icon) {
                    icon.className = 'fas fa-spinner fa-spin';
                }
            } else {
                button.disabled = false;
                button.classList.remove('processing');
                if (icon) {
                    icon.className = 'fas fa-paper-plane';
                }
            }
        });
    }

    scrollToBottom() {
        const currentContainer = this.getCurrentActiveContainer();
        if (currentContainer) {
            currentContainer.scrollTop = currentContainer.scrollHeight;
        }
    }

    setupEventListeners() {
    // Check if new panel system is active
    const hasNewPanels = document.getElementById('ragChatForm') && document.getElementById('searchChatForm');

    if (!hasNewPanels) {
        // Only set up legacy event listeners if new panel system isn't active
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
    } else {
        console.log('New panel system detected, skipping legacy event listeners');
    }

    // Search mode buttons (these can stay as they might be used by both systems)
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

    setupInputEventListeners() {
        const inputs = [
            this.messageInput,
            this.ragMessageInput,
            this.searchMessageInput
        ].filter(input => input);

        inputs.forEach(input => {
            // Auto-resize textarea
            input.addEventListener('input', () => {
                                this.autoResizeTextarea({ target: input });
            });

            // Handle Enter key
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const form = input.closest('form');
                    if (form) {
                        this.handleSubmit(e);
                    }
                }
            });

            // Handle focus/blur for elegant styling
            input.addEventListener('focus', () => {
                input.parentElement.classList.add('focused');
            });

            input.addEventListener('blur', () => {
                input.parentElement.classList.remove('focused');
            });
        });
    }

    autoResizeTextarea(event) {
        const textarea = event?.target || this.getCurrentActiveInput();
        if (!textarea) return;

        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        const maxHeight = 120; // Maximum height in pixels

        if (scrollHeight > maxHeight) {
            textarea.style.height = maxHeight + 'px';
            textarea.style.overflowY = 'auto';
        } else {
            textarea.style.height = scrollHeight + 'px';
            textarea.style.overflowY = 'hidden';
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
        const currentInput = this.getCurrentActiveInput();
        if (currentInput) {
            const placeholder = mode === 'rag'
              ? 'Ask a question about your documents...'
              : 'Search for specific content in your documents...';
            currentInput.placeholder = placeholder;
        }

        console.log(`Search mode set to: ${mode}`);
    }

    clearChat() {
        const currentContainer = this.getCurrentActiveContainer();
        if (!currentContainer) return;

        // Fade out all messages
        const messages = currentContainer.querySelectorAll('.chat-message');
        messages.forEach((message, index) => {
            setTimeout(() => {
                message.style.opacity = '0';
                message.style.transform = 'translateY(-20px)';
            }, index * 50);
        });

        // Clear after animation
        setTimeout(() => {
            currentContainer.innerHTML = '';
            this.messageHistory = [];
            this.saveMessageHistory();

            // Show welcome message
            this.addMessage('assistant', 'Chat cleared. How can I help you today?');
        }, messages.length * 50 + 300);

        // Also clear legacy container
        const legacyContainer = document.getElementById('chatContainer');
        if (legacyContainer && legacyContainer !== currentContainer) {
            const legacyMessages = legacyContainer.querySelectorAll('.chat-message');
            legacyMessages.forEach((message, index) => {
                setTimeout(() => {
                    message.style.opacity = '0';
                    message.style.transform = 'translateY(-20px)';
                }, index * 50);
            });

            setTimeout(() => {
                legacyContainer.innerHTML = '';
            }, legacyMessages.length * 50 + 300);
        }

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
        const currentContainer = this.getCurrentActiveContainer();
        if (!currentContainer) return;

        currentContainer.innerHTML = '';

        this.messageHistory.forEach((messageData, index) => {
            const messageElement = this.createMessageElement(messageData);

            // Add with staggered animation
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateY(20px)';

            currentContainer.appendChild(messageElement);

            setTimeout(() => {
                messageElement.style.opacity = '1';
                messageElement.style.transform = 'translateY(0)';
            }, index * 100);
        });

        setTimeout(() => {
            this.scrollToBottom();
        }, this.messageHistory.length * 100 + 200);
    }

    // Public API methods
    performQuery(query, mode = null) {
        const currentInput = this.getCurrentActiveInput();
        if (currentInput) {
            currentInput.value = query;
        }

        if (mode) {
            this.setSearchMode(mode);
        }

        return this.handleSubmit({ preventDefault: () => {} });
    }

    getMessageHistory() {
        return [...this.messageHistory]; // Return copy
    }

    // Cleanup
    cleanup() {
        console.log('Cleaning up ChatManager...');

        // Clear timers
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        // Remove event listeners
        if (this.chatForm) {
            this.chatForm.removeEventListener('submit', this.handleSubmit);
        }

        if (this.ragChatForm) {
            this.ragChatForm.removeEventListener('submit', this.handleSubmit);
        }

        if (this.searchChatForm) {
            this.searchChatForm.removeEventListener('submit', this.handleSubmit);
        }

        // Clean up typing indicator
        if (this.typingIndicator && this.typingIndicator.parentNode) {
            this.typingIndicator.remove();
        }
    }
}

// Helper functions for global access
window.getCurrentContainer = function() {
    const currentPanel = window.currentChatPanel ? window.currentChatPanel() : 'rag';
    return document.getElementById(currentPanel === 'rag' ? 'ragChatContainer' : 'searchChatContainer');
};

window.getCurrentInput = function() {
    const currentPanel = window.currentChatPanel ? window.currentChatPanel() : 'rag';
    return document.getElementById(currentPanel === 'rag' ? 'ragMessageInput' : 'searchMessageInput');
};

// Enhanced ChatManager initialization for panels
document.addEventListener('DOMContentLoaded', function() {
    // Wait for all scripts to load
    setTimeout(() => {
        console.log('Initializing ChatManager with panel support...');

        // Initialize ChatManager with proper container references
        if (window.ragClient) {
            window.chatManager = new ChatManager(window.ragClient);
            console.log('ChatManager initialized with panel support');
        } else {
            console.warn('RAGClient not found, retrying...');
            setTimeout(() => {
                if (window.ragClient) {
                    window.chatManager = new ChatManager(window.ragClient);
                    console.log('ChatManager initialized with panel support (retry)');
                } else {
                    console.error('Failed to initialize ChatManager: RAGClient not found');
                }
            }, 1000);
        }
    }, 600);
});

// Legacy compatibility functions
window.handleMessage = function(message) {
    if (window.chatManager) {
        const currentInput = window.getCurrentInput();
        if (currentInput) {
            currentInput.value = message;
        }
        return window.chatManager.handleSubmit({ preventDefault: () => {} });
    }
};

window.clearChat = function() {
    if (window.chatManager) {
        return window.chatManager.clearChat();
    }
};

window.setSearchMode = function(mode) {
    if (window.chatManager) {
        return window.chatManager.setSearchMode(mode);
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatManager;
}

