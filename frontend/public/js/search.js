// RAG Chat Application - Search Manager
// Handles search operations, suggestions, and search history

class SearchManager {
    constructor(ragClient) {
        this.ragClient = ragClient;

        // Add null checks for ragClient
        if (!this.ragClient) {
            console.warn('⚠️ RAGClient not provided to SearchManager, creating fallback');
            this.ragClient = this.createFallbackClient();
        }

        // Validate ragClient has required methods
        if (!this.ragClient.ragQuery || !this.ragClient.search) {
            console.warn('⚠️ RAGClient missing required methods, adding fallbacks');
            this.addFallbackMethods();
        }

        this.searchHistory = [];
        this.suggestions = [];
        this.currentQuery = '';
        this.searchMode = 'rag';
        this.filters = {};
        this.isSearching = false;
        this.searchCache = new Map();
        this.cacheTimeout = 300000; // 5 minutes

        console.log('SearchManager initialized');
    }

    createFallbackClient() {
        const baseURL = window.API_BASE_URL || 'http://localhost:8000';

        return {
            baseURL: baseURL,

            async ragQuery(query, options = {}) {
                try {
                    const response = await fetch(`${baseURL}/search/rag`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            query: query,
                            max_results: options.max_results || 5,
                            similarity_threshold: options.similarity_threshold || 0.7,
                            model: options.model || 'llama3.2:latest'
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    return { success: true, data: data };
                } catch (error) {
                    console.error('Fallback RAG query error:', error);
                    return { success: false, error: error.message };
                }
            },

            async search(query, options = {}) {
                try {
                    const response = await fetch(`${baseURL}/search/search`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            query: query,
                            n_results: options.n_results || 10,
                            similarity_threshold: options.similarity_threshold || 0.7
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    return { success: true, data: data };
                } catch (error) {
                    console.error('Fallback search error:', error);
                    return { success: false, error: error.message };
                }
            }
        };
    }

    addFallbackMethods() {
        const fallbackClient = this.createFallbackClient();

        if (!this.ragClient.ragQuery) {
            this.ragClient.ragQuery = fallbackClient.ragQuery;
        }

        if (!this.ragClient.search) {
            this.ragClient.search = fallbackClient.search;
        }
    }

    async initialize() {
        console.log('Initializing SearchManager...');

        try {
            this.setupElements();
            this.setupEventListeners();
            this.loadSearchHistory();
            this.loadSearchMode();

            console.log('SearchManager initialized successfully');
        } catch (error) {
            console.error('SearchManager initialization failed:', error);
            throw error;
        }
    }

    setupElements() {
        // Search input elements - now using panel-aware getters
        Object.defineProperty(this, 'messageInput', {
            get: function() {
                return window.getCurrentInput ? window.getCurrentInput() : document.getElementById('messageInput');
            }
        });

        Object.defineProperty(this, 'chatContainer', {
            get: function() {
                return window.getCurrentContainer ? window.getCurrentContainer() : document.getElementById('chatContainer');
            }
        });

        this.sendButton = document.getElementById('sendButton');
        this.chatForm = document.getElementById('chatForm');

        // Panel-specific elements
        this.ragMessageInput = document.getElementById('ragMessageInput');
        this.searchMessageInput = document.getElementById('searchMessageInput');
        this.ragChatContainer = document.getElementById('ragChatContainer');
        this.searchChatContainer = document.getElementById('searchChatContainer');

        // Search mode elements
        this.searchModeButtons = document.querySelectorAll('.search-mode-btn');

        // Advanced search elements
        this.advancedSearchPanel = document.getElementById('advancedSearchPanel');
        this.filterDocType = document.getElementById('filterDocType');
        this.filterCategory = document.getElementById('filterCategory');
        this.maxResults = document.getElementById('maxResults');

        // Search suggestions
        this.suggestionsContainer = this.getOrCreateSuggestionsContainer();

        // Search history
        this.searchHistoryContainer = this.getOrCreateSearchHistoryContainer();
    }

    getOrCreateSuggestionsContainer() {
        let container = document.getElementById('searchSuggestions');
        if (!container) {
            container = document.createElement('div');
            container.id = 'searchSuggestions';
            container.className = 'search-suggestions';
            container.style.display = 'none';

            // Append to current input's parent
            const currentInput = this.getCurrentActiveInput();
            if (currentInput) {
                currentInput.parentNode.appendChild(container);
            }
        }
        return container;
    }

    getOrCreateSearchHistoryContainer() {
        let container = document.getElementById('searchHistoryModal');
        if (!container) {
            container = document.createElement('div');
            container.id = 'searchHistoryModal';
            container.className = 'modal';
            container.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Search History</h3>
                        <div class="modal-actions">
                            <button class="btn btn-sm btn-outline" id="clearSearchHistory">
                                <i class="fas fa-trash"></i> Clear All
                            </button>
                            <span class="close" id="closeSearchHistory">&times;</span>
                        </div>
                    </div>
                    <div class="modal-body">
                        <div id="searchHistoryContent">
                            <!-- Search history items will be populated here -->
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(container);
        }
        return container;
    }

    getCurrentActiveInput() {
        return window.getCurrentInput ? window.getCurrentInput() : document.getElementById('messageInput');
    }

    getCurrentActiveContainer() {
        return window.getCurrentContainer ? window.getCurrentContainer() : document.getElementById('chatContainer');
    }

    setupEventListeners() {
        // Search form submission - handle both legacy and panel forms
        if (this.chatForm) {
            this.chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSearch();
            });
        }

        // Panel-specific form handlers
        const ragForm = document.getElementById('ragChatForm');
        if (ragForm) {
            ragForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSearch();
            });
        }

        const searchForm = document.getElementById('searchChatForm');
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSearch();
            });
        }

        // Search input events - handle all inputs
        this.setupInputEventListeners();

        // Search mode buttons
        this.searchModeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setSearchMode(btn.dataset.mode);
            });
        });

        // Search history modal events
        const closeSearchHistory = document.getElementById('closeSearchHistory');
        if (closeSearchHistory) {
            closeSearchHistory.addEventListener('click', () => {
                this.hideSearchHistory();
            });
        }

        const clearSearchHistory = document.getElementById('clearSearchHistory');
        if (clearSearchHistory) {
            clearSearchHistory.addEventListener('click', () => {
                this.clearSearchHistory();
            });
        }

        // Close modal on outside click
        if (this.searchHistoryContainer) {
            this.searchHistoryContainer.addEventListener('click', (e) => {
                if (e.target === this.searchHistoryContainer) {
                    this.hideSearchHistory();
                }
            });
        }

        // Advanced search filters
        if (this.filterDocType) {
            this.filterDocType.addEventListener('change', () => {
                this.updateFilters();
            });
        }

        if (this.filterCategory) {
            this.filterCategory.addEventListener('change', () => {
                this.updateFilters();
            });
        }

        if (this.maxResults) {
            this.maxResults.addEventListener('change', () => {
                this.updateFilters();
            });
        }
    }

    setupInputEventListeners() {
        const inputs = [
            this.messageInput,
            this.ragMessageInput,
            this.searchMessageInput
        ].filter(input => input);

        inputs.forEach(input => {
            input.addEventListener('input', this.debounce(() => {
                this.handleInputChange(input);
            }, 300));

            input.addEventListener('keydown', (e) => {
                this.handleKeyDown(e);
            });

            input.addEventListener('focus', () => {
                this.showSuggestions();
            });

            input.addEventListener('blur', () => {
                // Delay hiding suggestions to allow for clicks
                setTimeout(() => this.hideSuggestions(), 150);
            });
        });
    }

    async handleSearch() {
        const currentInput = this.getCurrentActiveInput();
        const query = currentInput?.value?.trim();

        if (!query) {
            return;
        }

        if (this.isSearching) {
            console.log('Search already in progress');
            return;
        }

        try {
            this.isSearching = true;
            this.updateSearchButton(true);

            // Add to search history
            this.addToSearchHistory(query, this.searchMode);

            // Clear input
            if (currentInput) {
                currentInput.value = '';
            }

            // Hide suggestions
            this.hideSuggestions();

            // Show typing indicator
            this.showTypingIndicator();

            // Perform search based on mode
            let result;
            if (this.searchMode === 'rag') {
                result = await this.performRAGQuery(query);
            } else {
                result = await this.performSearch(query);
            }

            // Hide typing indicator
            this.hideTypingIndicator();

            // Display results
            this.displaySearchResults(query, result);

        } catch (error) {
            console.error('Search error:', error);
            this.hideTypingIndicator();
            this.displaySearchError(query, error.message);
        } finally {
            this.isSearching = false;
            this.updateSearchButton(false);
        }
    }

        async performRAGQuery(question) {
        // Get RAG-specific configuration from the global object set by chat-panels.js
        const ragConfig = window.ragConfig || {};

        const options = {
            max_results: this.getMaxResults(),
            similarity_threshold: 0.7, // This could also be part of ragConfig
            include_sources: true,

            // --- Key Change: Use the category from the RAG advanced panel ---
            // The 'category' key must match what the backend endpoint expects.
            category: ragConfig.filterCategory || null,

            // Pass along OpenAI settings as well
            useOpenAI: ragConfig.useOpenAI || false,
            // The ragClient will use these nested options if available
            openAI: ragConfig.openAI || null
        };

        // Check cache first, now including the category in the key
        const cacheKey = `rag:${question}:${JSON.stringify(options)}`;
        const cachedResult = this.getFromCache(cacheKey);
        if (cachedResult) {
            console.log('Using cached RAG result for category:', options.category);
            return cachedResult;
        }

        // Add safety check for ragClient
        if (!this.ragClient || typeof this.ragClient.ragQuery !== 'function') {
            console.error('❌ RAGClient or ragQuery method not available');
            return {
                success: false,
                error: 'Search service not available. Please refresh the page.'
            };
        }

        try {
            // The ragClient.ragQuery method will pass these options to the backend.
            const result = await this.ragClient.ragQuery(question, options);

            if (result.success) {
                // Cache the result
                this.addToCache(cacheKey, result);

                // Track event
                this.trackSearchEvent('rag_query', question, result.data);
            }

            return result;
        } catch (error) {
            console.error('RAG query error:', error);
            return {
                success: false,
                error: 'Failed to perform search. Please try again.'
            };
        }
    }

        async performSearch(query) {
        // Get search-specific configuration from the global object set by chat-panels.js
        const searchConfig = (window.currentAdvancedSettings && window.currentAdvancedSettings.panel === 'search')
            ? window.currentAdvancedSettings
            : {};

        const options = {
            n_results: this.getMaxResults(),
            similarity_threshold: 0.7, // You can make this configurable
            // --- Key Change: Use the category from the search advanced panel ---
            category: searchConfig.category || null
        };

        // Check cache first, now including the category in the key
        const cacheKey = `search:${query}:${JSON.stringify(options)}`;
        const cachedResult = this.getFromCache(cacheKey);
        if (cachedResult) {
            console.log('Using cached search result for category:', options.category);
            return cachedResult;
        }

        // Add safety check for ragClient
        if (!this.ragClient || typeof this.ragClient.search !== 'function') {
            console.error('❌ RAGClient or search method not available');
            return {
                success: false,
                error: 'Search service not available. Please refresh the page.'
            };
        }

        try {
            // The ragClient.search method will pass these options to the backend.
            const result = await this.ragClient.search(query, options);

            if (result.success) {
                // Cache the result
                this.addToCache(cacheKey, result);

                // Track event
                this.trackSearchEvent('search', query, result.data);
            }

            return result;
        } catch (error) {
            console.error('Search error:', error);
            return {
                success: false,
                error: 'Failed to perform search. Please try again.'
            };
        }
    }

    displaySearchResults(query, result) {
        // Use ChatManager to display results if available
        if (window.chatManager) {
            if (result.success) {
                if (this.searchMode === 'rag') {
                    window.chatManager.handleRAGResponse(result.data || result);
                } else {
                    window.chatManager.handleSearchResponse(result.data || result);
                }
            } else {
                window.chatManager.addMessage('error', result.error || 'Search failed');
            }
            return;
        }

        // Fallback to manual display
        const currentContainer = this.getCurrentActiveContainer();
        if (!currentContainer) return;

        // Create message container
        const messageContainer = document.createElement('div');
        messageContainer.className = 'message-container';

        // Add user message
        const userMessage = this.createUserMessage(query);
        messageContainer.appendChild(userMessage);

        // Add assistant response
        if (result.success) {
            const assistantMessage = this.searchMode === 'rag' ?
                this.createRAGResponse(result.data || result) :
                this.createSearchResponse(result.data || result);
            messageContainer.appendChild(assistantMessage);
        } else {
            const errorMessage = this.createErrorMessage(result.error);
            messageContainer.appendChild(errorMessage);
        }

        // Add to chat container
        currentContainer.appendChild(messageContainer);

        // Scroll to bottom
        this.scrollToBottom();
    }

    createUserMessage(query) {
        const userMessage = document.createElement('div');
        userMessage.className = 'chat-message user-message';
        userMessage.innerHTML = `
            <div class="message-content">
                <div class="message-avatar user-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="message-bubble user-bubble">
                    <div class="message-text">${this.escapeHtml(query)}</div>
                    <div class="message-meta">
                        <span class="message-mode">${this.searchMode.toUpperCase()}</span>
                        <span class="message-time">${this.formatTime(new Date())}</span>
                    </div>
                </div>
            </div>
        `;
        return userMessage;
    }

    createRAGResponse(data) {
        const response = this.ragClient.formatRAGResponse ?
            this.ragClient.formatRAGResponse(data) : data;

        const assistantMessage = document.createElement('div');
        assistantMessage.className = 'chat-message assistant-message';

        let sourcesHTML = '';
        if (response.sources && response.sources.length > 0) {
            sourcesHTML = `
                <div class="message-sources">
                    <h4><i class="fas fa-book"></i> Sources:</h4>
                    <div class="sources-grid">
                        ${response.sources.map((source, index) => {
                            // Fix relevance percentage calculation
                            const score = source.score || source.similarity_score || 0;
                            const relevancePercentage = Math.round(score * 100);
                            const displayPercentage = isNaN(relevancePercentage) ? 0 : relevancePercentage;
                            
                            return `
                                <div class="source-item" onclick="window.documentManager?.openDocumentViewer(${source.source?.document_id || source.document_id})">
                                    <div class="source-header">
                                        <span class="source-number">${index + 1}</span>
                                        <span class="source-title">${this.escapeHtml(source.source?.filename || source.filename || 'Unknown')}</span>
                                        <span class="source-score">${displayPercentage}%</span>
                                    </div>
                                    <div class="source-preview">${this.escapeHtml(source.preview || source.content || '')}</div>
                                    <div class="source-meta">
                                        ${source.source?.page || source.page_number ? `Page ${source.source.page || source.page_number}` : ''}
                                        ${source.source?.chunk_index || source.chunk_index ? `• Chunk ${source.source.chunk_index || source.chunk_index}` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        assistantMessage.innerHTML = `
            <div class="message-content">
                <div class="message-avatar assistant-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="message-bubble assistant-bubble">
                    <div class="message-text">${this.escapeHtml(response.answer || data.answer || 'No response generated')}</div>
                    ${sourcesHTML}
                    <div class="message-meta">
                        <span class="message-time">${this.formatTime(new Date())}</span>
                        <span class="message-stats">
                            ${response.sources ? response.sources.length : 0} sources • 
                            ${response.metadata ? Math.round(response.metadata.responseTime * 1000) : 0}ms
                        </span>
                    </div>
                </div>
            </div>
        `;

        return assistantMessage;
    }

    createSearchResponse(data) {
        const assistantMessage = document.createElement('div');
        assistantMessage.className = 'chat-message assistant-message';

        let resultsHTML = '';
        if (data.results && data.results.length > 0) {
            resultsHTML = `
                <div class="search-results">
                    <h4><i class="fas fa-search"></i> Search Results (${data.results.length}):</h4>
                    <div class="results-list">
                        ${data.results.map((result, index) => {
                            // Fix similarity score calculation
                            const score = result.similarity_score || 0;
                            const relevancePercentage = Math.round(score * 100);
                            const displayPercentage = isNaN(relevancePercentage) ? 0 : relevancePercentage;
                            
                            return `
                                <div class="result-item" onclick="window.documentManager?.openDocumentViewer(${result.document_id})">
                                    <div class="result-header">
                                        <span class="result-number">${index + 1}</span>
                                        <span class="result-title">${this.escapeHtml(result.filename || result.title || 'Untitled')}</span>
                                        <span class="result-score">${displayPercentage}%</span>
                                    </div>
                                    <div class="result-content">${this.escapeHtml(result.content.substring(0, 200))}...</div>
                                    <div class="result-meta">
                                        ${result.page_number ? `Page ${result.page_number}` : ''}
                                        ${result.chunk_index ? `• Chunk ${result.chunk_index}` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        } else {
            resultsHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <p>No results found for your search query.</p>
                </div>
            `;
        }

        assistantMessage.innerHTML = `
            <div class="message-content">
                <div class="message-avatar search-avatar">
                    <i class="fas fa-search"></i>
                </div>
                                <div class="message-bubble search-bubble">
                    ${resultsHTML}
                    <div class="message-meta">
                        <span class="message-time">${this.formatTime(new Date())}</span>
                        <span class="message-stats">
                            ${data.total_results || 0} total results • 
                            ${Math.round((data.response_time || 0) * 1000)}ms
                        </span>
                    </div>
                </div>
            </div>
        `;

        return assistantMessage;
    }

    createErrorMessage(error) {
        const errorMessage = document.createElement('div');
        errorMessage.className = 'chat-message assistant-message error-message';
        errorMessage.innerHTML = `
            <div class="message-content">
                <div class="message-avatar error-avatar">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="message-bubble error-bubble">
                    <div class="message-text error-text">
                        <strong>Search Error</strong><br>
                        ${this.escapeHtml(error)}
                        <div class="error-actions">
                            <button class="btn btn-sm btn-outline" onclick="this.closest('.message-container').remove()">
                                <i class="fas fa-times"></i> Dismiss
                            </button>
                            <button class="btn btn-sm btn-primary" onclick="window.searchManager.handleSearch()">
                                <i class="fas fa-sync"></i> Retry Search
                            </button>
                        </div>
                    </div>
                    <div class="message-meta">
                        <span class="message-time">${this.formatTime(new Date())}</span>
                    </div>
                </div>
            </div>
        `;

        return errorMessage;
    }

    displaySearchError(query, error) {
        this.displaySearchResults(query, {
            success: false,
            error: error
        });
    }

    handleInputChange(input) {
        const query = input?.value?.trim();

        if (!query) {
            this.hideSuggestions();
            return;
        }

        this.currentQuery = query;
        this.generateSuggestions(query);
    }

    handleKeyDown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.navigateSuggestions('down');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.navigateSuggestions('up');
        } else if (e.key === 'Enter') {
            if (this.hasActiveSuggestion()) {
                e.preventDefault();
                this.selectActiveSuggestion();
            }
        } else if (e.key === 'Escape') {
            this.hideSuggestions();
        }
    }

    generateSuggestions(query) {
        // Generate suggestions based on search history and common patterns
        const suggestions = [];

        // Add suggestions from search history
        const historySuggestions = this.searchHistory
            .filter(item => item.query.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 3);

        suggestions.push(...historySuggestions.map(item => ({
            text: item.query,
            type: 'history',
            mode: item.mode
        })));

        // Add common search patterns
        const patterns = [
            'What is',
            'How to',
            'Explain',
            'Summarize',
            'Find information about',
            'Show me documents about'
        ];

        patterns.forEach(pattern => {
            if (pattern.toLowerCase().startsWith(query.toLowerCase())) {
                suggestions.push({
                    text: `${pattern} ${query}`,
                    type: 'pattern',
                    mode: this.searchMode
                });
            }
        });

        this.suggestions = suggestions.slice(0, 5);
        this.renderSuggestions();
    }

    renderSuggestions() {
        if (!this.suggestionsContainer || this.suggestions.length === 0) {
            this.hideSuggestions();
            return;
        }

        const suggestionsHTML = this.suggestions.map((suggestion, index) => `
            <div class="suggestion-item ${index === 0 ? 'selected' : ''}" data-index="${index}">
                <div class="suggestion-content">
                    <span class="suggestion-text">${this.escapeHtml(suggestion.text)}</span>
                    <span class="suggestion-type ${suggestion.type}">${suggestion.type}</span>
                </div>
                <div class="suggestion-mode">${suggestion.mode.toUpperCase()}</div>
            </div>
        `).join('');

        this.suggestionsContainer.innerHTML = suggestionsHTML;

        // Add click event listeners
        this.suggestionsContainer.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectSuggestion(parseInt(item.dataset.index));
            });
        });

        this.showSuggestions();
    }

    showSuggestions() {
        if (this.suggestionsContainer && this.suggestions.length > 0) {
            this.suggestionsContainer.style.display = 'block';
        }
    }

    hideSuggestions() {
        if (this.suggestionsContainer) {
            this.suggestionsContainer.style.display = 'none';
        }
    }

    navigateSuggestions(direction) {
        const items = this.suggestionsContainer?.querySelectorAll('.suggestion-item');
        if (!items || items.length === 0) return;

        const currentIndex = Array.from(items).findIndex(item => item.classList.contains('selected'));
        let newIndex;

        if (direction === 'down') {
            newIndex = currentIndex + 1 >= items.length ? 0 : currentIndex + 1;
        } else {
            newIndex = currentIndex - 1 < 0 ? items.length - 1 : currentIndex - 1;
        }

        items.forEach((item, index) => {
            item.classList.toggle('selected', index === newIndex);
        });
    }

    hasActiveSuggestion() {
        const suggestions = this.suggestionsContainer?.querySelectorAll('.suggestion-item');
        if (!suggestions?.length) return false;

        return Array.from(suggestions).some(item => item.classList.contains('selected'));
    }

    selectActiveSuggestion() {
        const selectedItem = this.suggestionsContainer?.querySelector('.suggestion-item.selected');
        if (selectedItem) {
            const index = parseInt(selectedItem.dataset.index);
            this.selectSuggestion(index);
        }
    }

    selectSuggestion(index) {
        if (index >= 0 && index < this.suggestions.length) {
            const suggestion = this.suggestions[index];
            const currentInput = this.getCurrentActiveInput();

            if (currentInput) {
                currentInput.value = suggestion.text;
                currentInput.focus();
            }

            this.setSearchMode(suggestion.mode);
            this.hideSuggestions();
        }
    }

    setSearchMode(mode) {
        if (mode !== 'rag' && mode !== 'search') {
            console.warn('Invalid search mode:', mode);
            return;
        }

        this.searchMode = mode;
        localStorage.setItem('rag_search_mode', mode);

        // Update UI
        this.searchModeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Update placeholders for all inputs
        this.updatePlaceholders(mode);

        // Update current panel if using panel system
        if (window.switchChatPanel) {
            window.switchChatPanel(mode);
        }

        console.log(`Search mode set to: ${mode}`);
    }

    updatePlaceholders(mode) {
        const ragPlaceholder = 'Ask a question about your documents...';
        const searchPlaceholder = 'Search for specific content...';

        // Update all input placeholders
        const inputs = [
            { element: this.messageInput, mode: 'legacy' },
            { element: this.ragMessageInput, mode: 'rag' },
            { element: this.searchMessageInput, mode: 'search' }
        ];

        inputs.forEach(({ element, mode: inputMode }) => {
            if (element) {
                if (inputMode === 'legacy') {
                    element.placeholder = mode === 'rag' ? ragPlaceholder : searchPlaceholder;
                } else if (inputMode === 'rag') {
                    element.placeholder = ragPlaceholder;
                } else if (inputMode === 'search') {
                    element.placeholder = searchPlaceholder;
                }
            }
        });
    }

    loadSearchMode() {
        const savedMode = localStorage.getItem('rag_search_mode') || 'rag';
        this.setSearchMode(savedMode);
    }

    updateSearchButton(isSearching) {
        const sendButtons = [
            this.sendButton,
            document.getElementById('ragSendButton'),
            document.getElementById('searchSendButton')
        ].filter(btn => btn);

        sendButtons.forEach(button => {
            const icon = button.querySelector('i');
            if (isSearching) {
                button.disabled = true;
                if (icon) {
                    icon.className = 'fas fa-spinner fa-spin';
                }
            } else {
                button.disabled = false;
                if (icon) {
                    icon.className = 'fas fa-paper-plane';
                }
            }
        });
    }

    showTypingIndicator() {
        const currentContainer = this.getCurrentActiveContainer();
        if (!currentContainer) return;

        const indicator = document.createElement('div');
        indicator.id = 'typingIndicator';
        indicator.className = 'chat-message assistant-message typing-indicator';
        indicator.innerHTML = `
            <div class="message-content">
                <div class="message-avatar assistant-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="message-bubble assistant-bubble">
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <div class="typing-text">Searching...</div>
                </div>
            </div>
        `;

        currentContainer.appendChild(indicator);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    scrollToBottom() {
        const currentContainer = this.getCurrentActiveContainer();
        if (currentContainer) {
            currentContainer.scrollTop = currentContainer.scrollHeight;
        }
    }

    // Search History Management
    addToSearchHistory(query, mode, resultCount = 0) {
        const historyItem = {
            query: query,
            mode: mode,
            timestamp: Date.now(),
            resultCount: resultCount
        };

        // Remove duplicates
        this.searchHistory = this.searchHistory.filter(item => item.query !== query);

        // Add to beginning
        this.searchHistory.unshift(historyItem);

        // Keep only last 50 searches
        if (this.searchHistory.length > 50) {
            this.searchHistory = this.searchHistory.slice(0, 50);
        }

        this.saveSearchHistory();
    }

    loadSearchHistory() {
        try {
            const stored = localStorage.getItem('rag_search_history');
            if (stored) {
                this.searchHistory = JSON.parse(stored);
            }
        } catch (error) {
            console.warn('Failed to load search history:', error);
            this.searchHistory = [];
        }
    }

    saveSearchHistory() {
        try {
            localStorage.setItem('rag_search_history', JSON.stringify(this.searchHistory));
        } catch (error) {
            console.warn('Failed to save search history:', error);
        }
    }

    clearSearchHistory() {
        if (confirm('Are you sure you want to clear all search history?')) {
            this.searchHistory = [];
            this.saveSearchHistory();
            this.hideSearchHistory();

            if (window.showStatus) {
                window.showStatus('Search history cleared', 'success');
            }
        }
    }

    showSearchHistory() {
        if (!this.searchHistoryContainer) return;

        const content = document.getElementById('searchHistoryContent');
        if (!content) return;

        if (this.searchHistory.length === 0) {
            content.innerHTML = `
                <div class="no-history">
                    <i class="fas fa-history"></i>
                    <p>No search history available</p>
                </div>
            `;
        } else {
            const historyHTML = this.searchHistory.map(item => `
                <div class="history-item" onclick="window.searchManager.selectHistoryItem('${this.escapeHtml(item.query)}', '${item.mode}')">
                    <div class="history-content">
                        <div class="history-query">${this.escapeHtml(item.query)}</div>
                        <div class="history-meta">
                            <span class="history-mode ${item.mode}">${item.mode.toUpperCase()}</span>
                            <span class="history-time">${this.formatRelativeTime(item.timestamp)}</span>
                            <span class="history-results">${item.resultCount || 0} results</span>
                        </div>
                    </div>
                    <button class="history-delete" onclick="event.stopPropagation(); window.searchManager.deleteHistoryItem('${this.escapeHtml(item.query)}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');

            content.innerHTML = `
                <div class="history-list">
                    ${historyHTML}
                </div>
            `;
        }

        this.searchHistoryContainer.style.display = 'block';
        document.body.classList.add('modal-open');
    }

    hideSearchHistory() {
        if (this.searchHistoryContainer) {
            this.searchHistoryContainer.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
    }

    selectHistoryItem(query, mode) {
        const currentInput = this.getCurrentActiveInput();
        if (currentInput) {
            currentInput.value = query;
            currentInput.focus();
        }

        this.setSearchMode(mode);
        this.hideSearchHistory();
    }

    deleteHistoryItem(query) {
        this.searchHistory = this.searchHistory.filter(item => item.query !== query);
        this.saveSearchHistory();
        this.showSearchHistory(); // Refresh the display
    }

    // Cache Management
    addToCache(key, value) {
        this.searchCache.set(key, {
            data: value,
            timestamp: Date.now()
        });

        // Clean old cache entries
        this.cleanCache();
    }

    getFromCache(key) {
        const cached = this.searchCache.get(key);
        if (!        cached) return null;

        // Check if cache is still valid
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.searchCache.delete(key);
            return null;
        }

        return cached.data;
    }

    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.searchCache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.searchCache.delete(key);
            }
        }
    }

    clearCache() {
        this.searchCache.clear();
    }

    // Filter Management
    updateFilters() {
        this.filters = {
            docType: this.filterDocType?.value || '',
            category: this.filterCategory?.value || '',
            maxResults: parseInt(this.maxResults?.value) || 10
        };

        // Clear cache when filters change
        this.clearCache();

        console.log('Search filters updated:', this.filters);
    }

    getSearchFilters() {
        const filters = {};

        if (this.filters.docType) {
            filters.file_types = [this.filters.docType];
        }

        if (this.filters.category) {
            filters.categories = [this.filters.category];
        }

        return filters;
    }

    getMaxResults() {
        return this.filters.maxResults || 10;
    }

    setFilters(filters) {
        this.filters = { ...this.filters, ...filters };

        // Update UI
        if (this.filterDocType && filters.docType !== undefined) {
            this.filterDocType.value = filters.docType;
        }

        if (this.filterCategory && filters.category !== undefined) {
            this.filterCategory.value = filters.category;
        }

        if (this.maxResults && filters.maxResults !== undefined) {
            this.maxResults.value = filters.maxResults;
        }

        // Clear cache
        this.clearCache();
    }

    resetFilters() {
        this.filters = {};

        // Reset UI
        if (this.filterDocType) this.filterDocType.value = '';
        if (this.filterCategory) this.filterCategory.value = '';
        if (this.maxResults) this.maxResults.value = '10';

        // Clear cache
        this.clearCache();
    }

    // Document Filter Management
    setDocumentFilter(documentIds) {
        this.filters.documentIds = documentIds;
        this.clearCache();
    }

    clearDocumentFilter() {
        delete this.filters.documentIds;
        this.clearCache();
    }

    // Event Tracking
    trackSearchEvent(type, query, data) {
        try {
            const event = {
                type: type,
                query: query,
                timestamp: Date.now(),
                resultCount: Array.isArray(data) ? data.length : (data.results ? data.results.length : 0),
                searchMode: this.searchMode,
                filters: this.filters
            };

            // Track with analytics if available
            if (window.ragApp && window.ragApp.trackEvent) {
                window.ragApp.trackEvent('search', type, query, event.resultCount);
            }

            console.log('Search event tracked:', event);
        } catch (error) {
            console.warn('Failed to track search event:', error);
        }
    }

    // Export/Import functionality
    exportSearchHistory() {
        try {
            const data = {
                searchHistory: this.searchHistory,
                exportDate: new Date().toISOString(),
                version: '1.0'
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `search_history_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (window.showStatus) {
                window.showStatus('Search history exported successfully', 'success');
            }
        } catch (error) {
            console.error('Failed to export search history:', error);
            if (window.showStatus) {
                window.showStatus('Failed to export search history', 'error');
            }
        }
    }

    importSearchHistory(data) {
        try {
            if (data.searchHistory && Array.isArray(data.searchHistory)) {
                // Merge with existing history
                const existingQueries = new Set(this.searchHistory.map(item => item.query));
                const newItems = data.searchHistory.filter(item => !existingQueries.has(item.query));

                this.searchHistory = [...newItems, ...this.searchHistory];

                // Keep only last 100 items
                if (this.searchHistory.length > 100) {
                    this.searchHistory = this.searchHistory.slice(0, 100);
                }

                this.saveSearchHistory();

                if (window.showStatus) {
                    window.showStatus(`Imported ${newItems.length} search history items`, 'success');
                }
            }
        } catch (error) {
            console.error('Failed to import search history:', error);
            if (window.showStatus) {
                window.showStatus('Failed to import search history', 'error');
            }
        }
    }

    // Utility Methods
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    debounce(func, wait) {
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

    // Public API methods
    performQuery(query, mode = null) {
        const currentInput = this.getCurrentActiveInput();
        if (currentInput) {
            currentInput.value = query;
        }

        if (mode) {
            this.setSearchMode(mode);
        }

        return this.handleSearch();
    }

    getSearchHistory() {
        return [...this.searchHistory]; // Return copy
    }

    getSearchSuggestions(query) {
        if (!query) return [];

        return this.searchHistory
            .filter(item => item.query.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 5)
            .map(item => ({
                text: item.query,
                type: 'history',
                mode: item.mode,
                timestamp: item.timestamp
            }));
    }

    // Cleanup
    cleanup() {
        console.log('Cleaning up SearchManager...');

        // Clear cache
        this.clearCache();

        // Remove event listeners
        if (this.chatForm) {
            this.chatForm.removeEventListener('submit', this.handleSearch);
        }

        // Clean up DOM elements
        if (this.suggestionsContainer && this.suggestionsContainer.parentElement) {
            this.suggestionsContainer.remove();
        }

        if (this.searchHistoryContainer && this.searchHistoryContainer.parentElement) {
            this.searchHistoryContainer.remove();
        }
    }
}

// Global functions for HTML onclick handlers
window.searchManager = null;

// Global search history functions for panel compatibility
window.showSearchHistory = function(panelType) {
    if (window.searchManager) {
        window.searchManager.showSearchHistory();
    }
};

// Override setSearchMode to work with new panels
const originalSetSearchMode = window.setSearchMode;

window.setSearchMode = function(mode) {
    console.log('Setting search mode to:', mode);

    // Ensure mode is valid
    if (mode !== 'rag' && mode !== 'search') {
        console.warn('Invalid search mode:', mode);
        return;
    }

    // Set the mode in various places to ensure consistency
    window.currentSearchMode = mode;

    // Update ChatManager if it exists
    if (window.chatManager) {
        window.chatManager.currentSearchMode = mode;
    }

    // Update SearchManager if it exists
    if (window.searchManager) {
        window.searchManager.searchMode = mode;
    }

    // Update panel state
    if (window.currentChatPanel) {
        window.currentChatPanel = mode === 'rag' ? 'rag' : 'search';
    }

    // Update UI
    updateSearchModeUI(mode);

    // Store in localStorage
    localStorage.setItem('rag_search_mode', mode);

    console.log('Search mode set successfully:', mode);
};

function updateSearchModeUI(mode) {
    // Update search mode buttons
    document.querySelectorAll('.search-mode-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
        }
    });

    // Update input placeholders
    const ragInput = document.getElementById('ragMessageInput');
    const searchInput = document.getElementById('searchMessageInput');
    const legacyInput = document.getElementById('messageInput');

    if (mode === 'rag') {
        if (ragInput) ragInput.placeholder = 'Ask a question about your documents...';
        if (legacyInput) legacyInput.placeholder = 'Ask a question about your documents...';
    } else {
        if (searchInput) searchInput.placeholder = 'Search for specific content...';
        if (legacyInput) legacyInput.placeholder = 'Search for specific content...';
    }
}

function updateSearchUI(mode) {
    // Update placeholders and UI elements based on mode
    const ragInput = document.getElementById('ragMessageInput');
    const searchInput = document.getElementById('searchMessageInput');
    const messageInput = document.getElementById('messageInput');

    if (ragInput && mode === 'rag') {
        ragInput.placeholder = 'Ask a question about your documents...';
    }

    if (searchInput && mode === 'search') {
        searchInput.placeholder = 'Search for specific content...';
    }

    if (messageInput) {
        messageInput.placeholder = mode === 'rag' ?
            'Ask a question about your documents...' :
            'Search for specific content...';
    }
}

// Initialize SearchManager when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        console.log('Initializing SearchManager...');

        if (window.ragClient) {
            window.searchManager = new SearchManager(window.ragClient);
            window.searchManager.initialize().then(() => {
                console.log('SearchManager initialized successfully');

                // Set default search mode
                window.setSearchMode('rag');
            }).catch(error => {
                console.error('Failed to initialize SearchManager:', error);
            });
        } else {
            console.warn('RAGClient not found, retrying SearchManager initialization...');
            setTimeout(() => {
                if (window.ragClient) {
                    window.searchManager = new SearchManager(window.ragClient);
                    window.searchManager.initialize().then(() => {
                        console.log('SearchManager initialized successfully (retry)');
                        window.setSearchMode('rag');
                    }).catch(error => {
                        console.error('Failed to initialize SearchManager (retry):', error);
                    });
                } else {
                    console.error('Failed to initialize SearchManager: RAGClient not found');
                }
            }, 1000);
        }
    }, 700);
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SearchManager;
}

