// RAG Chat Application - Search Management
// Handles search functionality, query processing, and result display

class SearchManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
        this.searchHistory = [];
        this.currentQuery = '';
        this.searchMode = 'rag'; // 'rag' or 'search'
        this.isSearching = false;
        this.searchCache = new Map();
        this.maxCacheSize = 100;
        this.searchSuggestions = [];
        this.suggestionsEnabled = true;
        this.advancedFilters = {};
        this.searchStats = {
            totalSearches: 0,
            successfulSearches: 0,
            averageResponseTime: 0,
            lastSearchTime: null
        };
        this.debounceTimer = null;
        this.abortController = null;
        this.init();
    }

    init() {
        console.log('Initializing Search Manager...');
        this.loadSearchHistory();
        this.loadSearchStats();
        this.setupEventListeners();
        this.setupSearchSuggestions();
        this.loadSearchMode();
        this.setupAdvancedSearch();
        this.setupKeyboardShortcuts();

        // Register this manager globally
        if (window.RAG_MANAGERS) {
            window.RAG_MANAGERS.register('searchManager', this);
        } else {
            window.searchManager = this;
        }

        console.log('Search manager initialized successfully');
    }

    setupEventListeners() {
        // Search input events - Only add if not already handled by chat
        const searchInput = document.getElementById('messageInput');
        if (searchInput && !searchInput.hasAttribute('data-search-initialized')) {
            // Mark as initialized to prevent duplicate listeners
            searchInput.setAttribute('data-search-initialized', 'true');

            // Debounced input handler for suggestions
            searchInput.addEventListener('input', (e) => {
                this.currentQuery = e.target.value;
                this.debouncedShowSuggestions(e.target.value);
            });

            // Focus handler for suggestions
            searchInput.addEventListener('focus', () => {
                if (this.suggestionsEnabled && searchInput.value.length > 2) {
                    this.showSearchSuggestions(searchInput.value);
                }
            });

            // Handle arrow keys for suggestions navigation
            searchInput.addEventListener('keydown', (e) => {
                if (this.isSuggestionsVisible()) {
                    const handled = this.handleSearchKeydown(e);
                    if (handled) return;
                }

                // Handle other keyboard shortcuts
                this.handleGlobalKeydown(e);
            });

            // Hide suggestions when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.chat-input-container')) {
                    this.hideSearchSuggestions();
                }
            });
        }

        // Search mode buttons
        document.querySelectorAll('.search-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                if (mode) this.setSearchMode(mode);
            });
        });

        // Advanced search toggle
        const advancedToggle = document.querySelector('[onclick="toggleAdvancedSearch()"]');
        if (advancedToggle) {
            advancedToggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleAdvancedSearch();
            });
        }
    }

    setupSearchSuggestions() {
        // Create suggestions container if it doesn't exist
        const searchContainer = document.querySelector('.chat-input-container');
        if (searchContainer && !document.getElementById('search-suggestions')) {
            const suggestionsDiv = document.createElement('div');
            suggestionsDiv.id = 'search-suggestions';
            suggestionsDiv.className = 'search-suggestions';
            suggestionsDiv.style.cssText = `
                display: none;
                position: absolute;
                bottom: 100%;
                left: 0;
                right: 0;
                z-index: 1000;
                background: var(--bg-color);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                max-height: 200px;
                overflow-y: auto;
                margin-bottom: 8px;
            `;

            // Make the container relative for positioning
            searchContainer.style.position = 'relative';
            searchContainer.appendChild(suggestionsDiv);
        }
    }

    setupAdvancedSearch() {
        // Setup advanced search form elements
        const similaritySlider = document.getElementById('similarityThreshold');
        const thresholdValue = document.getElementById('thresholdValue');

        if (similaritySlider && thresholdValue) {
            similaritySlider.addEventListener('input', (e) => {
                thresholdValue.textContent = e.target.value;
                this.advancedFilters.similarityThreshold = parseFloat(e.target.value);
            });
        }

        // Setup other advanced search controls
        const advancedControls = [
            'filterDocType',
            'filterCategory',
            'filterDateRange',
            'maxResults'
        ];

        advancedControls.forEach(controlId => {
            const control = document.getElementById(controlId);
            if (control) {
                control.addEventListener('change', (e) => {
                    this.advancedFilters[controlId] = e.target.value;
                });
            }
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + / for search focus
            if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                e.preventDefault();
                const searchInput = document.getElementById('messageInput');
                if (searchInput) {
                    searchInput.focus();
                }
            }

            // Escape to close suggestions
            if (e.key === 'Escape') {
                this.hideSearchSuggestions();
            }
        });
    }

    debouncedShowSuggestions = this.debounce((query) => {
        if (this.suggestionsEnabled && query && query.length > 2) {
            this.showSearchSuggestions(query);
        } else {
            this.hideSearchSuggestions();
        }
    }, 300);

    debounce(func, wait) {
        return (...args) => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => func.apply(this, args), wait);
        };
    }

    isSuggestionsVisible() {
        const container = document.getElementById('search-suggestions');
        return container && container.style.display !== 'none';
    }

    handleSearchKeydown(e) {
        const suggestions = document.querySelectorAll('.search-suggestion');
        if (suggestions.length === 0) return false;

        const activeSuggestion = document.querySelector('.search-suggestion.active');

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.navigateSuggestions('down', suggestions);
                return true;
            case 'ArrowUp':
                e.preventDefault();
                this.navigateSuggestions('up', suggestions);
                return true;
            case 'Enter':
                if (activeSuggestion) {
                    e.preventDefault();
                    this.selectSuggestion(activeSuggestion.textContent.trim());
                    return true;
                }
                break;
            case 'Escape':
                e.preventDefault();
                this.hideSearchSuggestions();
                return true;
        }
        return false;
    }

    handleGlobalKeydown(e) {
        // Additional keyboard shortcuts for search functionality
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'h':
                    if (!e.target.matches('input, textarea')) {
                        e.preventDefault();
                        this.showSearchHistory();
                    }
                    break;
                case 'f':
                    if (!e.target.matches('input, textarea')) {
                        e.preventDefault();
                        this.toggleAdvancedSearch();
                    }
                    break;
            }
        }
    }

    navigateSuggestions(direction, suggestions) {
        if (suggestions.length === 0) return;

        const activeIndex = Array.from(suggestions).findIndex(s => s.classList.contains('active'));

        // Remove current active
        suggestions.forEach(s => s.classList.remove('active'));

        let newIndex;
        if (direction === 'down') {
            newIndex = activeIndex < suggestions.length - 1 ? activeIndex + 1 : 0;
        } else {
            newIndex = activeIndex > 0 ? activeIndex - 1 : suggestions.length - 1;
        }

        suggestions[newIndex].classList.add('active');
        suggestions[newIndex].scrollIntoView({ block: 'nearest' });
    }

    async showSearchSuggestions(query) {
        if (!this.suggestionsEnabled || !query || query.length < 2) {
            this.hideSearchSuggestions();
            return;
        }

        try {
            // Get suggestions from multiple sources
            const historySuggestions = this.getHistorySuggestions(query);
            const contextualSuggestions = await this.getContextualSuggestions(query);

            // Combine and deduplicate suggestions
            const allSuggestions = [
                ...historySuggestions,
                ...contextualSuggestions
            ].filter((suggestion, index, self) =>
                self.findIndex(s => s.text === suggestion.text) === index
            ).slice(0, 8);

            if (allSuggestions.length > 0) {
                this.displaySearchSuggestions(allSuggestions);
            } else {
                this.hideSearchSuggestions();
            }
        } catch (error) {
            console.error('Error showing search suggestions:', error);
            this.hideSearchSuggestions();
        }
    }

    getHistorySuggestions(query) {
        const queryLower = query.toLowerCase();
        return this.searchHistory
            .filter(item =>
                item.query.toLowerCase().includes(queryLower) &&
                item.query.toLowerCase() !== queryLower
            )
            .map(item => ({
                text: item.query,
                type: 'history',
                icon: 'fas fa-history',
                meta: `${item.mode.toUpperCase()} • ${item.resultCount} results`
            }))
            .slice(0, 5);
    }

    async getContextualSuggestions(query) {
        // Get contextual suggestions based on document content
        try {
            const response = await fetch(`${this.apiBaseUrl}/search/suggestions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    limit: 3
                })
            });

            if (response.ok) {
                const data = await response.json();
                return (data.suggestions || []).map(suggestion => ({
                    text: suggestion.text || suggestion,
                    type: 'contextual',
                    icon: 'fas fa-lightbulb',
                    meta: 'Suggested'
                }));
            }
        } catch (error) {
            console.warn('Failed to get contextual suggestions:', error);
        }

        return [];
    }

    displaySearchSuggestions(suggestions) {
        const container = document.getElementById('search-suggestions');
        if (!container || suggestions.length === 0) {
            this.hideSearchSuggestions();
            return;
        }

        container.innerHTML = suggestions.map((suggestion, index) => `
            <div class="search-suggestion ${index === 0 ? 'active' : ''}" 
                 data-suggestion="${this.escapeHtml(suggestion.text)}"
                 onclick="searchManager.selectSuggestion('${this.escapeHtml(suggestion.text)}')"
                 style="padding: 12px 16px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); transition: background-color 0.2s ease;">
                <div style="display: flex; align-items: center; flex: 1; min-width: 0;">
                    <i class="${suggestion.icon}" style="margin-right: 12px; opacity: 0.6; width: 16px; text-align: center;"></i>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 500; margin-bottom: 2px;">
                            ${this.highlightText(this.escapeHtml(suggestion.text), this.currentQuery)}
                        </div>
                        ${suggestion.meta ? `<div style="font-size: 12px; color: var(--text-muted); opacity: 0.8;">${suggestion.meta}</div>` : ''}
                    </div>
                </div>
                <div style="margin-left: 8px;">
                    <i class="fas fa-arrow-right" style="opacity: 0.4; font-size: 12px;"></i>
                </div>
            </div>
        `).join('');

        // Add hover effects
        container.querySelectorAll('.search-suggestion').forEach(suggestion => {
            suggestion.addEventListener('mouseenter', () => {
                container.querySelectorAll('.search-suggestion').forEach(s => s.classList.remove('active'));
                suggestion.classList.add('active');
            });
        });

        container.style.display = 'block';
    }

    hideSearchSuggestions() {
        const container = document.getElementById('search-suggestions');
        if (container) {
            container.style.display = 'none';
        }
    }

    selectSuggestion(suggestion) {
        const searchInput = document.getElementById('messageInput');
        if (searchInput) {
            searchInput.value = suggestion;
            searchInput.focus();

            // Trigger input event to update any listeners
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));

            // Auto-resize if it's a textarea
            if (searchInput.tagName === 'TEXTAREA' && window.autoResizeTextarea) {
                window.autoResizeTextarea(searchInput);
            }
        }
        this.hideSearchSuggestions();
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    highlightText(text, query) {
        if (!query || query.length < 2) return text;

        try {
            const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
            return text.replace(regex, '<mark style="background: var(--highlight-color, #fff3cd); padding: 1px 2px; border-radius: 2px;">$1</mark>');
        } catch (error) {
            console.warn('Error highlighting text:', error);
            return text;
        }
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    async performSearch(query, options = {}) {
        if (this.isSearching) {
            console.log('Search already in progress, aborting previous search');
            this.abortCurrentSearch();
        }

        if (!query || !query.trim()) {
            throw new Error('Search query is required');
        }

        const startTime = Date.now();
        this.isSearching = true;
        this.abortController = new AbortController();

        try {
            console.log(`Performing ${this.searchMode} search:`, query);

            // Check cache first
            const cacheKey = this.getCacheKey(query, options);
            if (this.searchCache.has(cacheKey)) {
                console.log('Returning cached result');
                const cachedResult = this.searchCache.get(cacheKey);
                this.addToSearchHistory(query, cachedResult, 0);
                return cachedResult;
            }

            // Prepare search parameters
            const searchParams = this.prepareSearchParams(query, options);

            // Perform the search based on mode
            let result;
            if (this.searchMode === 'rag') {
                result = await this.performRAGSearch(searchParams);
            } else {
                result = await this.performDocumentSearch(searchParams);
            }

            // Calculate response time
            const responseTime = Date.now() - startTime;

            // Cache the result
            this.cacheSearchResult(cacheKey, result);

            // Add to search history
            this.addToSearchHistory(query, result, responseTime);

            // Update search stats
            this.updateSearchStats(responseTime, true);

            console.log(`Search completed in ${responseTime}ms`);
            return result;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.updateSearchStats(responseTime, false);

            console.error('Search error:', error);

            if (error.name === 'AbortError') {
                throw new Error('Search was cancelled');
            }

            throw new Error(`Search failed: ${error.message}`);
        } finally {
            this.isSearching = false;
            this.abortController = null;
        }
    }

    prepareSearchParams(query, options = {}) {
        const params = {
            query: query.trim(),
            mode: this.searchMode,
            max_results: options.maxResults || this.advancedFilters.maxResults || 10,
            similarity_threshold: options.similarityThreshold || this.advancedFilters.similarityThreshold || 0.0,
            include_context: true,
            ...options
        };

        // Add advanced filters
        if (this.advancedFilters.filterDocType) {
            params.document_type = this.advancedFilters.filterDocType;
        }

        if (this.advancedFilters.filterCategory) {
            params.category = this.advancedFilters.filterCategory;
        }

        if (this.advancedFilters.filterDateRange) {
            params.date_range = this.advancedFilters.filterDateRange;
        }

        return params;
    }

    async performRAGSearch(params) {
        const response = await fetch(`${this.apiBaseUrl}/search/rag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...params,
                model: params.model || "llama3.2:latest"
            }),
            signal: this.abortController?.signal
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`RAG search failed: ${response.statusText} - ${errorData.detail || ''}`);
        }

        const data = await response.json();

        return {
            answer: data.answer || 'No answer generated',
            sources: data.sources || [],
            query: params.query,
            mode: 'rag',
            total_results: data.sources?.length || 0,
            response_time: data.response_time || 0,
            model_used: data.model_used || params.model,
            context_used: data.context_used || false
        };
    }

    async performDocumentSearch(params) {
        const response = await fetch(`${this.apiBaseUrl}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: params.query,
                limit: params.max_results,
                similarity_threshold: params.similarity_threshold,
                document_type: params.document_type,
                category: params.category,
                date_range: params.date_range
            }),
            signal: this.abortController?.signal
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Document search failed: ${response.statusText} - ${errorData.detail || ''}`);
        }

        const data = await response.json();

        return {
            answer: `Found ${data.results?.length || 0} results for "${params.query}"`,
            sources: data.results || [],
            query: params.query,
            mode: 'search',
            total_results: data.total || data.results?.length || 0,
            response_time: data.response_time || 0,
            search_metadata: data.metadata || {}
        };
    }

    abortCurrentSearch() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.isSearching = false;
    }

    getCacheKey(query, options = {}) {
        const keyData = {
            query: query.toLowerCase().trim(),
            mode: this.searchMode,
            ...this.advancedFilters,
            ...options
        };
        return JSON.stringify(keyData);
    }

    cacheSearchResult(key, result) {
        // Implement LRU cache behavior
        if (this.searchCache.size >= this.maxCacheSize) {
            const firstKey = this.searchCache.keys().next().value;
            this.searchCache.delete(firstKey);
        }

        this.searchCache.set(key, {
            ...result,
            cached_at: Date.now()
        });
    }

    addToSearchHistory(query, result, responseTime) {
        const historyItem = {
            query: query,
            mode: this.searchMode,
            resultCount: result.total_results || 0,
            responseTime: responseTime,
            timestamp: new Date().toISOString(),
            success: true
        };

        // Remove duplicate queries (keep most recent)
        this.searchHistory = this.searchHistory.filter(item =>
            item.query.toLowerCase() !== query.toLowerCase()
        );

        // Add to beginning of history
        this.searchHistory.unshift(historyItem);

        // Limit history size
        if (this.searchHistory.length > 100) {
            this.searchHistory = this.searchHistory.slice(0, 100);
        }

        this.saveSearchHistory();
    }

    updateSearchStats(responseTime, success) {
        this.searchStats.totalSearches++;
        if (success) {
            this.searchStats.successfulSearches++;
        }

        // Update average response time
        if (this.searchStats.successfulSearches > 0) {
            this.searchStats.averageResponseTime =
                (this.searchStats.averageResponseTime * (this.searchStats.successfulSearches - 1) + responseTime) /
                this.searchStats.successfulSearches;
        }

        this.searchStats.lastSearchTime = new Date().toISOString();
        this.saveSearchStats();
    }

    setSearchMode(mode) {
        if (!mode || (mode !== 'rag' && mode !== 'search')) {
            console.warn('Invalid search mode:', mode);
            return;
        }

        console.log('Setting search mode to:', mode);
        this.searchMode = mode;

        // Update UI
        document.querySelectorAll('.search-mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.querySelector(`[data-mode="${mode}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // Update placeholder text
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            if (mode === 'rag') {
                messageInput.placeholder = 'Ask a question about your documents...';
            } else {
                messageInput.placeholder = 'Search for content in your documents...';
            }
        }

        // Save preference
        localStorage.setItem('rag_search_mode', mode);

        // Clear cache when mode changes
        this.searchCache.clear();

        if (window.showStatus) {
            const modeText = mode === 'rag' ? 'AI-powered Q&A' : 'Document Search';
            window.showStatus(`Search mode: ${modeText}`, 'info', 3000);
        }
    }

    loadSearchMode() {
        const savedMode = localStorage.getItem('rag_search_mode');
        if (savedMode && (savedMode === 'rag' || savedMode === 'search')) {
            this.setSearchMode(savedMode);
        }
    }

    setAdvancedFilters(filters) {
        this.advancedFilters = { ...this.advancedFilters, ...filters };
        this.searchCache.clear(); // Clear cache when filters change
        console.log('Advanced filters updated:', this.advancedFilters);
    }

    toggleAdvancedSearch() {
        const panel = document.getElementById('advancedSearchPanel');
        if (panel) {
            const isVisible = panel.style.display !== 'none';
            panel.style.display = isVisible ? 'none' : 'block';

            // Update button state
            const button = document.querySelector('[onclick="toggleAdvancedSearch()"]');
            if (button) {
                button.classList.toggle('active', !isVisible);
            }

            if (window.showStatus) {
                window.showStatus(
                    isVisible ? 'Advanced search hidden' : 'Advanced search shown',
                    'info',
                    2000
                );
            }
        }
    }

    resetAdvancedSearch() {
        // Reset form values
        const controls = {
            'filterDocType': '',
            'filterCategory': '',
            'filterDateRange': '',
            'maxResults': '10',
            'similarityThreshold': '0.0'
        };

        Object.entries(controls).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.value = value;
            }
        });

        // Update threshold display
        const thresholdValue = document.getElementById('thresholdValue');
        if (thresholdValue) {
            thresholdValue.textContent = '0.0';
        }

        // Clear filters
        this.advancedFilters = {};
        this.searchCache.clear();

        if (window.showStatus) {
            window.showStatus('Advanced search filters reset', 'success', 3000);
        }
    }

    applyAdvancedSearch() {
        const filters = {
            filterDocType: document.getElementById('filterDocType')?.value || '',
            filterCategory: document.getElementById('filterCategory')?.value || '',
            filterDateRange: document.getElementById('filterDateRange')?.value || '',
            maxResults: parseInt(document.getElementById('maxResults')?.value) || 10,
            similarityThreshold: parseFloat(document.getElementById('similarityThreshold')?.value) || 0.0
        };

        this.setAdvancedFilters(filters);

        if (window.showStatus) {
            window.showStatus('Advanced search filters applied', 'success', 3000);
        }
    }

    // Search History Management
    getSearchHistory(limit = 50) {
        return this.searchHistory.slice(0, limit);
    }

    loadSearchHistory() {
        try {
            const saved = localStorage.getItem('rag_search_history');
            if (saved) {
                this.searchHistory = JSON.parse(saved);
                console.log(`Loaded ${this.searchHistory.length} search history items`);
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
        this.searchHistory = [];
        this.saveSearchHistory();
        console.log('Search history cleared');
    }

    exportSearchHistory() {
        try {
            const data = {
                exported_at: new Date().toISOString(),
                total_searches: this.searchHistory.length,
                search_history: this.searchHistory,
                search_stats: this.searchStats
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rag-search-history-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('Search history exported successfully');
        } catch (error) {
            console.error('Failed to export search history:', error);
            throw error;
        }
    }

    // Search Statistics
    loadSearchStats() {
        try {
            const saved = localStorage.getItem('rag_search_stats');
            if (saved) {
                this.searchStats = { ...this.searchStats, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.warn('Failed to load search stats:', error);
        }
    }

    saveSearchStats() {
        try {
            localStorage.setItem('rag_search_stats', JSON.stringify(this.searchStats));
        } catch (error) {
            console.warn('Failed to save search stats:', error);
        }
    }

    getSearchStats() {
        return {
            ...this.searchStats,
            successRate: this.searchStats.totalSearches > 0
                ? (this.searchStats.successfulSearches / this.searchStats.totalSearches * 100).toFixed(1)
                : 0,
            cacheSize: this.searchCache.size,
            historySize: this.searchHistory.length
        };
    }

    // Utility Methods
    async getSearchSuggestions(query, limit = 5) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/search/suggestions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    limit: limit
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.suggestions || [];
            }
        } catch (error) {
            console.warn('Failed to get search suggestions:', error);
        }
        return [];
    }

    async getPopularQueries(limit = 10) {
                try {
            const response = await fetch(`${this.apiBaseUrl}/search/popular`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (response.ok) {
                const data = await response.json();
                return data.popular_queries || [];
            }
        } catch (error) {
            console.warn('Failed to get popular queries:', error);
        }

        // Fallback: return most frequent queries from local history
        const queryFrequency = {};
        this.searchHistory.forEach(item => {
            const query = item.query.toLowerCase();
            queryFrequency[query] = (queryFrequency[query] || 0) + 1;
        });

        return Object.entries(queryFrequency)
            .sort(([,a], [,b]) => b - a)
            .slice(0, limit)
            .map(([query, count]) => ({ query, count }));
    }

    async getRelatedQueries(query, limit = 5) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/search/related`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    limit: limit
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.related_queries || [];
            }
        } catch (error) {
            console.warn('Failed to get related queries:', error);
        }

        // Fallback: find similar queries from history
        const queryWords = query.toLowerCase().split(/\s+/);
        const relatedQueries = this.searchHistory
            .filter(item => {
                const itemWords = item.query.toLowerCase().split(/\s+/);
                const commonWords = queryWords.filter(word =>
                    itemWords.some(itemWord => itemWord.includes(word) || word.includes(itemWord))
                );
                return commonWords.length > 0 && item.query.toLowerCase() !== query.toLowerCase();
            })
            .slice(0, limit)
            .map(item => item.query);

        return relatedQueries;
    }

    // Search Analytics
    getSearchAnalytics() {
        const analytics = {
            totalSearches: this.searchStats.totalSearches,
            successfulSearches: this.searchStats.successfulSearches,
            failedSearches: this.searchStats.totalSearches - this.searchStats.successfulSearches,
            successRate: this.searchStats.totalSearches > 0
                ? (this.searchStats.successfulSearches / this.searchStats.totalSearches * 100).toFixed(1)
                : 0,
            averageResponseTime: Math.round(this.searchStats.averageResponseTime),
            cacheHitRate: this.calculateCacheHitRate(),
            searchModeDistribution: this.getSearchModeDistribution(),
            topQueries: this.getTopQueries(10),
            searchTrends: this.getSearchTrends(),
            lastSearchTime: this.searchStats.lastSearchTime
        };

        return analytics;
    }

    calculateCacheHitRate() {
        // This would need to be tracked more precisely in a real implementation
        // For now, estimate based on cache size vs total searches
        if (this.searchStats.totalSearches === 0) return 0;
        return Math.min(100, (this.searchCache.size / this.searchStats.totalSearches * 100)).toFixed(1);
    }

    getSearchModeDistribution() {
        const distribution = { rag: 0, search: 0 };
        this.searchHistory.forEach(item => {
            if (distribution.hasOwnProperty(item.mode)) {
                distribution[item.mode]++;
            }
        });
        return distribution;
    }

    getTopQueries(limit = 10) {
        const queryCount = {};
        this.searchHistory.forEach(item => {
            const query = item.query.toLowerCase();
            if (!queryCount[query]) {
                queryCount[query] = { query: item.query, count: 0, avgResponseTime: 0, totalResponseTime: 0 };
            }
            queryCount[query].count++;
            queryCount[query].totalResponseTime += item.responseTime || 0;
            queryCount[query].avgResponseTime = queryCount[query].totalResponseTime / queryCount[query].count;
        });

        return Object.values(queryCount)
            .sort((a, b) => b.count - a.count)
            .slice(0, limit)
            .map(item => ({
                query: item.query,
                count: item.count,
                avgResponseTime: Math.round(item.avgResponseTime)
            }));
    }

    getSearchTrends() {
        // Group searches by day for the last 30 days
        const trends = {};
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        this.searchHistory.forEach(item => {
            const searchDate = new Date(item.timestamp);
            if (searchDate >= thirtyDaysAgo) {
                const dateKey = searchDate.toISOString().split('T')[0];
                if (!trends[dateKey]) {
                    trends[dateKey] = { date: dateKey, count: 0, modes: { rag: 0, search: 0 } };
                }
                trends[dateKey].count++;
                if (trends[dateKey].modes.hasOwnProperty(item.mode)) {
                    trends[dateKey].modes[item.mode]++;
                }
            }
        });

        return Object.values(trends).sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    // Search Quality Metrics
    async evaluateSearchQuality(query, results) {
        const metrics = {
            relevanceScore: this.calculateRelevanceScore(results),
            diversityScore: this.calculateDiversityScore(results),
            completenessScore: this.calculateCompletenessScore(query, results),
            responseTime: results.response_time || 0,
            resultCount: results.total_results || 0
        };

        // Overall quality score (weighted average)
        metrics.overallScore = (
            metrics.relevanceScore * 0.4 +
            metrics.diversityScore * 0.2 +
            metrics.completenessScore * 0.3 +
            (metrics.responseTime < 2000 ? 100 : Math.max(0, 100 - (metrics.responseTime - 2000) / 100)) * 0.1
        );

        return metrics;
    }

    calculateRelevanceScore(results) {
        if (!results.sources || results.sources.length === 0) return 0;

        const avgScore = results.sources.reduce((sum, source) => {
            return sum + (source.score || source.similarity || 0);
        }, 0) / results.sources.length;

        return Math.round(avgScore * 100);
    }

    calculateDiversityScore(results) {
        if (!results.sources || results.sources.length === 0) return 0;

        // Calculate diversity based on unique documents and content variety
        const uniqueDocuments = new Set(results.sources.map(s => s.document_id || s.id));
        const documentDiversity = (uniqueDocuments.size / results.sources.length) * 100;

        // Calculate content diversity (simplified)
        const contentWords = new Set();
        results.sources.forEach(source => {
            if (source.content) {
                const words = source.content.toLowerCase().split(/\s+/).slice(0, 10);
                words.forEach(word => contentWords.add(word));
            }
        });

        const contentDiversity = Math.min(100, contentWords.size * 2);

        return Math.round((documentDiversity + contentDiversity) / 2);
    }

    calculateCompletenessScore(query, results) {
        if (!results.sources || results.sources.length === 0) return 0;

        // Simple heuristic: check if key terms from query appear in results
        const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
        const resultText = results.sources.map(s => s.content || '').join(' ').toLowerCase();

        const foundTerms = queryTerms.filter(term => resultText.includes(term));
        const completeness = queryTerms.length > 0 ? (foundTerms.length / queryTerms.length) * 100 : 0;

        return Math.round(completeness);
    }

    // Search Optimization
    optimizeSearchQuery(query) {
        // Basic query optimization
        let optimized = query.trim();

        // Remove common stop words for better search
        const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        const words = optimized.split(/\s+/);

        if (words.length > 3) {
            const filteredWords = words.filter(word =>
                !stopWords.includes(word.toLowerCase()) || words.length <= 3
            );
            if (filteredWords.length > 0) {
                optimized = filteredWords.join(' ');
            }
        }

        // Suggest query improvements
        const suggestions = [];

        if (query.length < 3) {
            suggestions.push('Try using more specific terms');
        }

        if (query.length > 200) {
            suggestions.push('Consider shortening your query for better results');
        }

        if (!/[?]$/.test(query) && this.searchMode === 'rag') {
            suggestions.push('Try phrasing as a question for better AI responses');
        }

        return {
            optimized,
            suggestions,
            original: query
        };
    }

    // Batch Search Operations
    async performBatchSearch(queries, options = {}) {
        const results = [];
        const batchSize = options.batchSize || 5;
        const delay = options.delay || 1000;

        for (let i = 0; i < queries.length; i += batchSize) {
            const batch = queries.slice(i, i + batchSize);
            const batchPromises = batch.map(query =>
                this.performSearch(query, options).catch(error => ({
                    query,
                    error: error.message,
                    success: false
                }))
            );

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // Add delay between batches to avoid overwhelming the server
            if (i + batchSize < queries.length) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        return results;
    }

    // Search Result Processing
    processSearchResults(results) {
        if (!results || !results.sources) return results;

        // Enhance results with additional metadata
        const processedSources = results.sources.map((source, index) => ({
            ...source,
            rank: index + 1,
            relevanceCategory: this.categorizeRelevance(source.score || source.similarity || 0),
            snippet: this.generateSnippet(source.content, results.query),
            highlightedContent: this.highlightSearchTerms(source.content, results.query)
        }));

        return {
            ...results,
            sources: processedSources,
            metadata: {
                ...results.metadata,
                processed_at: new Date().toISOString(),
                total_sources: processedSources.length,
                high_relevance_count: processedSources.filter(s => s.relevanceCategory === 'high').length,
                medium_relevance_count: processedSources.filter(s => s.relevanceCategory === 'medium').length,
                low_relevance_count: processedSources.filter(s => s.relevanceCategory === 'low').length
            }
        };
    }

    categorizeRelevance(score) {
        if (score >= 0.8) return 'high';
        if (score >= 0.5) return 'medium';
        return 'low';
    }

    generateSnippet(content, query, maxLength = 200) {
        if (!content) return '';

        const queryTerms = query.toLowerCase().split(/\s+/);
        const sentences = content.split(/[.!?]+/);

        // Find sentence with most query terms
        let bestSentence = sentences[0] || '';
        let maxMatches = 0;

        sentences.forEach(sentence => {
            const sentenceLower = sentence.toLowerCase();
            const matches = queryTerms.filter(term => sentenceLower.includes(term)).length;
            if (matches > maxMatches) {
                maxMatches = matches;
                bestSentence = sentence;
            }
        });

        // Truncate if too long
        if (bestSentence.length > maxLength) {
            bestSentence = bestSentence.substring(0, maxLength - 3) + '...';
        }

        return bestSentence.trim();
    }

    highlightSearchTerms(content, query) {
        if (!content || !query) return content;

        const queryTerms = query.split(/\s+/).filter(term => term.length > 2);
        let highlighted = content;

        queryTerms.forEach(term => {
            const regex = new RegExp(`\\b(${this.escapeRegex(term)})\\b`, 'gi');
            highlighted = highlighted.replace(regex, '<mark>$1</mark>');
        });

        return highlighted;
    }

    // Public API Methods
    isSearchInProgress() {
        return this.isSearching;
    }

    getCurrentSearchMode() {
        return this.searchMode;
    }

    getAdvancedFilters() {
        return { ...this.advancedFilters };
    }

    clearSearchCache() {
        this.searchCache.clear();
        console.log('Search cache cleared');
    }

    // Cleanup and disposal
    dispose() {
        // Clear timers
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Abort any ongoing search
        this.abortCurrentSearch();

        // Clear cache
        this.searchCache.clear();

        // Save final state
        this.saveSearchHistory();
        this.saveSearchStats();

        console.log('Search manager disposed');
    }
}

// Initialize search manager when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (typeof API_BASE_URL !== 'undefined') {
        window.searchManager = new SearchManager(API_BASE_URL);
        console.log('Search manager created and registered');
    } else {
        console.error('API_BASE_URL not defined, cannot initialize search manager');
    }
});

// Global functions for backward compatibility
window.setSearchMode = function(mode) {
    if (window.searchManager) {
        window.searchManager.setSearchMode(mode);
    } else {
        console.warn('Search manager not available');
    }
};

window.toggleAdvancedSearch = function() {
    if (window.searchManager) {
        window.searchManager.toggleAdvancedSearch();
    } else {
        console.warn('Search manager not available');
    }
};

window.resetAdvancedSearch = function() {
    if (window.searchManager) {
        window.searchManager.resetAdvancedSearch();
    } else {
        console.warn('Search manager not available');
        }
};

window.applyAdvancedSearch = function() {
    if (window.searchManager) {
        window.searchManager.applyAdvancedSearch();
    } else {
        console.warn('Search manager not available');
    }
};

window.showSearchHistory = function() {
    if (window.searchManager) {
        const modal = document.getElementById('searchHistoryModal');
        const historyList = document.getElementById('searchHistoryList');

        if (modal && historyList) {
            const history = window.searchManager.getSearchHistory(20);

            if (history.length === 0) {
                historyList.innerHTML = '<div class="text-center text-muted p-4">No search history yet</div>';
            } else {
                historyList.innerHTML = history.map(item => `
                    <div class="search-history-item" onclick="selectHistoryItem('${window.searchManager.escapeHtml(item.query)}')" 
                         style="padding: 12px 16px; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background-color 0.2s ease;">
                        <div class="search-history-query" style="font-weight: 500; margin-bottom: 4px;">
                            ${window.searchManager.escapeHtml(item.query)}
                        </div>
                        <div class="search-history-meta" style="font-size: 12px; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span class="search-mode-badge ${item.mode}" style="background: ${item.mode === 'rag' ? 'var(--primary-color)' : 'var(--info-color)'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-right: 8px;">
                                    ${item.mode.toUpperCase()}
                                </span>
                                <span>${item.resultCount} results</span>
                                ${item.responseTime ? `<span style="margin-left: 8px;">${item.responseTime}ms</span>` : ''}
                            </div>
                            <span>${window.searchManager.formatTimestamp ? window.searchManager.formatTimestamp(item.timestamp) : new Date(item.timestamp).toLocaleDateString()}</span>
                        </div>
                    </div>
                `).join('');
            }

            modal.style.display = 'flex';
        }
    } else {
        console.warn('Search manager not available');
    }
};

window.hideSearchHistory = function() {
    const modal = document.getElementById('searchHistoryModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

window.selectHistoryItem = function(query) {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.value = query;
        messageInput.focus();

        // Trigger input event
        messageInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Auto-resize if textarea
        if (messageInput.tagName === 'TEXTAREA' && window.autoResizeTextarea) {
            window.autoResizeTextarea(messageInput);
        }
    }
    window.hideSearchHistory();
};

window.exportSearchHistory = function() {
    if (window.searchManager) {
        try {
            window.searchManager.exportSearchHistory();
            if (window.showStatus) {
                window.showStatus('Search history exported successfully', 'success', 3000);
            }
        } catch (error) {
            console.error('Export failed:', error);
            if (window.showStatus) {
                window.showStatus('Failed to export search history', 'error');
            }
        }
    } else {
        console.warn('Search manager not available');
    }
};

window.clearSearchHistory = function() {
    if (confirm('Are you sure you want to clear your search history? This action cannot be undone.')) {
        if (window.searchManager) {
            window.searchManager.clearSearchHistory();
            window.hideSearchHistory();
            if (window.showStatus) {
                window.showStatus('Search history cleared', 'success', 3000);
            }
        } else {
            console.warn('Search manager not available');
        }
    }
};

// Enhanced search functionality for integration with chat
window.performEnhancedSearch = async function(query, options = {}) {
    if (!window.searchManager) {
        throw new Error('Search manager not available');
    }

    try {
        // Show loading state
        if (window.showStatus) {
            window.showStatus('Searching...', 'info', 0);
        }

        // Optimize query
        const optimization = window.searchManager.optimizeSearchQuery(query);
        if (optimization.suggestions.length > 0) {
            console.log('Query optimization suggestions:', optimization.suggestions);
        }

        // Perform search
        const results = await window.searchManager.performSearch(optimization.optimized, options);

        // Process results
        const processedResults = window.searchManager.processSearchResults(results);

        // Evaluate quality
        const quality = await window.searchManager.evaluateSearchQuality(query, processedResults);
        console.log('Search quality metrics:', quality);

        // Hide loading state
        if (window.showStatus) {
            window.showStatus(`Found ${processedResults.total_results} results`, 'success', 3000);
        }

        return processedResults;

    } catch (error) {
        console.error('Enhanced search failed:', error);
        if (window.showStatus) {
            window.showStatus('Search failed: ' + error.message, 'error');
        }
        throw error;
    }
};

// Search analytics dashboard
window.showSearchAnalytics = function() {
    if (!window.searchManager) {
        console.warn('Search manager not available');
        return;
    }

    const analytics = window.searchManager.getSearchAnalytics();

    // Create analytics modal if it doesn't exist
    let modal = document.getElementById('searchAnalyticsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'searchAnalyticsModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2 class="modal-title">Search Analytics</h2>
                    <button class="modal-close" onclick="hideSearchAnalytics()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" id="analyticsContent">
                    <!-- Content will be populated by JavaScript -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Populate analytics content
    const content = document.getElementById('analyticsContent');
    if (content) {
        content.innerHTML = `
            <div class="analytics-dashboard">
                <div class="analytics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
                    <div class="analytics-card" style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; text-align: center;">
                        <div class="analytics-value" style="font-size: 24px; font-weight: bold; color: var(--primary-color);">${analytics.totalSearches}</div>
                        <div class="analytics-label" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Total Searches</div>
                    </div>
                    <div class="analytics-card" style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; text-align: center;">
                        <div class="analytics-value" style="font-size: 24px; font-weight: bold; color: var(--success-color);">${analytics.successRate}%</div>
                        <div class="analytics-label" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Success Rate</div>
                    </div>
                    <div class="analytics-card" style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; text-align: center;">
                        <div class="analytics-value" style="font-size: 24px; font-weight: bold; color: var(--info-color);">${analytics.averageResponseTime}ms</div>
                        <div class="analytics-label" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Avg Response Time</div>
                    </div>
                    <div class="analytics-card" style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; text-align: center;">
                        <div class="analytics-value" style="font-size: 24px; font-weight: bold; color: var(--warning-color);">${analytics.cacheHitRate}%</div>
                        <div class="analytics-label" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Cache Hit Rate</div>
                    </div>
                </div>

                <div class="analytics-section" style="margin-bottom: 24px;">
                    <h4 style="margin-bottom: 12px;">Search Mode Distribution</h4>
                    <div class="mode-distribution" style="display: flex; gap: 16px;">
                        <div class="mode-item" style="flex: 1; background: var(--bg-secondary); padding: 12px; border-radius: 6px;">
                            <div style="font-weight: bold;">RAG Queries</div>
                            <div style="font-size: 18px; color: var(--primary-color);">${analytics.searchModeDistribution.rag || 0}</div>
                        </div>
                        <div class="mode-item" style="flex: 1; background: var(--bg-secondary); padding: 12px; border-radius: 6px;">
                            <div style="font-weight: bold;">Document Searches</div>
                            <div style="font-size: 18px; color: var(--info-color);">${analytics.searchModeDistribution.search || 0}</div>
                        </div>
                    </div>
                </div>

                <div class="analytics-section" style="margin-bottom: 24px;">
                    <h4 style="margin-bottom: 12px;">Top Queries</h4>
                    <div class="top-queries" style="max-height: 200px; overflow-y: auto;">
                        ${analytics.topQueries.map(item => `
                            <div class="query-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--border-color);">
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-weight: 500; truncate">${window.searchManager.escapeHtml(item.query)}</div>
                                </div>
                                <div style="display: flex; gap: 12px; font-size: 12px; color: var(--text-muted);">
                                    <span>${item.count} times</span>
                                    <span>${item.avgResponseTime}ms avg</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                ${analytics.searchTrends.length > 0 ? `
                <div class="analytics-section">
                    <h4 style="margin-bottom: 12px;">Search Trends (Last 30 Days)</h4>
                    <div class="trends-chart" style="max-height: 150px; overflow-y: auto;">
                        ${analytics.searchTrends.map(trend => `
                            <div class="trend-item" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; border-bottom: 1px solid var(--border-color);">
                                <div>${trend.date}</div>
                                <div style="display: flex; gap: 8px; font-size: 12px;">
                                    <span style="color: var(--primary-color);">RAG: ${trend.modes.rag}</span>
                                    <span style="color: var(--info-color);">Search: ${trend.modes.search}</span>
                                    <span style="font-weight: bold;">Total: ${trend.count}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }

    modal.style.display = 'flex';
};

window.hideSearchAnalytics = function() {
    const modal = document.getElementById('searchAnalyticsModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// Search performance monitoring
window.monitorSearchPerformance = function() {
    if (!window.searchManager) {
        console.warn('Search manager not available');
        return;
    }

    const stats = window.searchManager.getSearchStats();

    console.group('🔍 Search Performance Monitor');
    console.log('Total Searches:', stats.totalSearches);
    console.log('Success Rate:', stats.successRate + '%');
    console.log('Average Response Time:', stats.averageResponseTime + 'ms');
    console.log('Cache Hit Rate:', stats.cacheHitRate + '%');
    console.log('History Size:', stats.historySize);
    console.log('Cache Size:', stats.cacheSize);
    console.groupEnd();

    // Performance warnings
    if (stats.averageResponseTime > 5000) {
        console.warn('⚠️ High average response time detected');
    }

    if (parseFloat(stats.successRate) < 80) {
        console.warn('⚠️ Low search success rate detected');
    }

    if (parseFloat(stats.cacheHitRate) < 20) {
        console.warn('⚠️ Low cache hit rate - consider optimizing queries');
    }

    return stats;
};

// Batch search utility
window.performBatchSearch = async function(queries, options = {}) {
    if (!window.searchManager) {
        throw new Error('Search manager not available');
    }

    if (!Array.isArray(queries) || queries.length === 0) {
        throw new Error('Queries must be a non-empty array');
    }

    try {
        if (window.showStatus) {
            window.showStatus(`Starting batch search for ${queries.length} queries...`, 'info', 0);
        }

        const results = await window.searchManager.performBatchSearch(queries, options);

        const successful = results.filter(r => r.success !== false).length;
        const failed = results.length - successful;

        if (window.showStatus) {
            window.showStatus(
                `Batch search completed: ${successful} successful, ${failed} failed`,
                failed === 0 ? 'success' : 'warning',
                5000
            );
        }

        return results;

    } catch (error)
          {
        console.error('Batch search failed:', error);
        if (window.showStatus) {
            window.showStatus('Batch search failed: ' + error.message, 'error');
        }
        throw error;
    }
};

// Search query builder utility
window.buildSearchQuery = function(options = {}) {
    const {
        keywords = [],
        phrases = [],
        exclude = [],
        fileTypes = [],
        dateRange = null,
        category = null,
        mode = 'rag'
    } = options;

    let query = '';

    // Add keywords
    if (keywords.length > 0) {
        query += keywords.join(' ');
    }

    // Add exact phrases
    if (phrases.length > 0) {
        const quotedPhrases = phrases.map(phrase => `"${phrase}"`);
        query += (query ? ' ' : '') + quotedPhrases.join(' ');
    }

    // Add exclusions (simplified - would need backend support)
    if (exclude.length > 0) {
        const excludeTerms = exclude.map(term => `-${term}`);
        query += (query ? ' ' : '') + excludeTerms.join(' ');
    }

    // Return query with metadata for advanced filtering
    return {
        query: query.trim(),
        filters: {
            fileTypes,
            dateRange,
            category
        },
        mode
    };
};

// Search result export utility
window.exportSearchResults = function(results, format = 'json') {
    if (!results) {
        console.warn('No results to export');
        return;
    }

    try {
        let exportData;
        let filename;
        let mimeType;

        switch (format.toLowerCase()) {
            case 'json':
                exportData = JSON.stringify(results, null, 2);
                filename = `search-results-${Date.now()}.json`;
                mimeType = 'application/json';
                break;

            case 'csv':
                exportData = convertResultsToCSV(results);
                filename = `search-results-${Date.now()}.csv`;
                mimeType = 'text/csv';
                break;

            case 'txt':
                exportData = convertResultsToText(results);
                filename = `search-results-${Date.now()}.txt`;
                mimeType = 'text/plain';
                break;

            default:
                throw new Error('Unsupported export format: ' + format);
        }

        // Create and download file
        const blob = new Blob([exportData], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (window.showStatus) {
            window.showStatus(`Results exported as ${format.toUpperCase()}`, 'success', 3000);
        }

    } catch (error) {
        console.error('Export failed:', error);
        if (window.showStatus) {
            window.showStatus('Export failed: ' + error.message, 'error');
        }
    }
};

function convertResultsToCSV(results) {
    if (!results.sources || results.sources.length === 0) {
        return 'No results to export';
    }

    const headers = ['Rank', 'Title', 'Filename', 'Content', 'Score', 'Document ID'];
    const rows = results.sources.map((source, index) => [
        index + 1,
        `"${(source.title || '').replace(/"/g, '""')}"`,
        `"${(source.filename || '').replace(/"/g, '""')}"`,
        `"${(source.content || '').substring(0, 200).replace(/"/g, '""')}"`,
        source.score || source.similarity || 0,
        source.document_id || source.id || ''
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

function convertResultsToText(results) {
    if (!results.sources || results.sources.length === 0) {
        return 'No results to export';
    }

    let text = `Search Results for: "${results.query}"\n`;
    text += `Search Mode: ${results.mode}\n`;
    text += `Total Results: ${results.total_results}\n`;
    text += `Generated: ${new Date().toISOString()}\n`;
    text += '=' .repeat(50) + '\n\n';

    results.sources.forEach((source, index) => {
        text += `Result ${index + 1}:\n`;
        text += `Title: ${source.title || 'Untitled'}\n`;
        text += `Filename: ${source.filename || 'Unknown'}\n`;
        text += `Score: ${source.score || source.similarity || 'N/A'}\n`;
        text += `Content: ${source.content || 'No content available'}\n`;
        text += '-'.repeat(30) + '\n\n';
    });

    return text;
}

// Search suggestions management
window.manageSearchSuggestions = {
    enable: function() {
        if (window.searchManager) {
            window.searchManager.suggestionsEnabled = true;
            if (window.showStatus) {
                window.showStatus('Search suggestions enabled', 'success', 2000);
            }
        }
    },

    disable: function() {
        if (window.searchManager) {
            window.searchManager.suggestionsEnabled = false;
            window.searchManager.hideSearchSuggestions();
            if (window.showStatus) {
                window.showStatus('Search suggestions disabled', 'info', 2000);
            }
        }
    },

    toggle: function() {
        if (window.searchManager) {
            if (window.searchManager.suggestionsEnabled) {
                this.disable();
            } else {
                this.enable();
            }
        }
    },

    isEnabled: function() {
        return window.searchManager ? window.searchManager.suggestionsEnabled : false;
    }
};

// Search cache management
window.manageSearchCache = {
    clear: function() {
        if (window.searchManager) {
            window.searchManager.clearSearchCache();
            if (window.showStatus) {
                window.showStatus('Search cache cleared', 'success', 2000);
            }
        }
    },

    getSize: function() {
        return window.searchManager ? window.searchManager.searchCache.size : 0;
    },

    getStats: function() {
        if (!window.searchManager) return null;

        return {
            size: window.searchManager.searchCache.size,
            maxSize: window.searchManager.maxCacheSize,
            hitRate: window.searchManager.calculateCacheHitRate()
        };
    },

    optimize: function() {
        if (window.searchManager) {
            // Remove old cache entries
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours

            for (const [key, value] of window.searchManager.searchCache.entries()) {
                if (value.cached_at && (now - value.cached_at) > maxAge) {
                    window.searchManager.searchCache.delete(key);
                }
            }

            if (window.showStatus) {
                window.showStatus('Search cache optimized', 'success', 2000);
            }
        }
    }
};

// Search debugging utilities
window.debugSearch = {
    logSearchState: function() {
        if (!window.searchManager) {
            console.log('Search manager not available');
            return;
        }

        console.group('🔍 Search Manager Debug Info');
        console.log('Current Mode:', window.searchManager.searchMode);
        console.log('Is Searching:', window.searchManager.isSearching);
        console.log('Current Query:', window.searchManager.currentQuery);
        console.log('Suggestions Enabled:', window.searchManager.suggestionsEnabled);
        console.log('Advanced Filters:', window.searchManager.advancedFilters);
        console.log('Cache Size:', window.searchManager.searchCache.size);
        console.log('History Length:', window.searchManager.searchHistory.length);
        console.log('Search Stats:', window.searchManager.searchStats);
        console.groupEnd();
    },

    testSearch: async function(query = 'test query') {
        if (!window.searchManager) {
            console.error('Search manager not available');
            return;
        }

        console.log('Testing search with query:', query);

        try {
            const startTime = Date.now();
            const results = await window.searchManager.performSearch(query);
            const endTime = Date.now();

            console.group('🧪 Search Test Results');
            console.log('Query:', query);
            console.log('Mode:', results.mode);
            console.log('Results Count:', results.total_results);
            console.log('Response Time:', endTime - startTime, 'ms');
            console.log('Sources:', results.sources);
            console.groupEnd();

            return results;
        } catch (error) {
            console.error('Search test failed:', error);
            return null;
        }
    },

    simulateSearchLoad: async function(queries = ['test', 'document', 'search'], concurrent = false) {
        if (!window.searchManager) {
            console.error('Search manager not available');
            return;
        }

        console.log('Simulating search load...');
        const startTime = Date.now();

        try {
            let results;
            if (concurrent) {
                // Run searches concurrently
                const promises = queries.map(query =>
                    window.searchManager.performSearch(query).catch(error => ({ error: error.message }))
                );
                results = await Promise.all(promises);
            } else {
                // Run searches sequentially
                results = [];
                for (const query of queries) {
                    try {
                        const result = await window.searchManager.performSearch(query);
                        results.push(result);
                    } catch (error) {
                        results.push({ error: error.message });
                    }
                }
            }

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            console.group('📊 Search Load Test Results');
            console.log('Total Queries:', queries.length);
            console.log('Concurrent:', concurrent);
            console.log('Total Time:', totalTime, 'ms');
            console.log('Average Time per Query:', Math.round(totalTime / queries.length), 'ms');
            console.log('Successful Searches:', results.filter(r => !r.error).length);
            console.log('Failed Searches:', results.filter(r => r.error).length);
            console.groupEnd();

            return results;
        } catch (error) {
            console.error('Search load test failed:', error);
            return null;
        }
    }
};

// Performance monitoring
let searchPerformanceMonitor = null;

window.startSearchPerformanceMonitoring = function(interval = 30000) {
    if (searchPerformanceMonitor) {
        clearInterval(searchPerformanceMonitor);
    }

    searchPerformanceMonitor = setInterval(() => {
        if (window.searchManager) {
            const stats = window.searchManager.getSearchStats();

            // Log performance warnings
            if (stats.averageResponseTime > 10000) {
                console.warn('🐌 Search performance degraded - average response time:', stats.averageResponseTime + 'ms');
            }

            if (parseFloat(stats.successRate) < 70) {
                console.warn('⚠️ Low search success rate:', stats.successRate + '%');
            }

            // Memory usage check
            if (window.searchManager.searchCache.size > window.searchManager.maxCacheSize * 0.9) {
                console.warn('💾 Search cache nearly full - consider clearing');
            }
        }
    }, interval);

    console.log('Search performance monitoring started (interval:', interval + 'ms)');
};

window.stopSearchPerformanceMonitoring = function() {
    if (searchPerformanceMonitor) {
        clearInterval(searchPerformanceMonitor);
        searchPerformanceMonitor = null;
        console.log('Search performance monitoring stopped');
    }
};

// Auto-start performance monitoring in development
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (window.searchManager) {
                window.startSearchPerformanceMonitoring(60000); // Every minute in dev
            }
        }, 5000);
    });
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.searchManager) {
        window.searchManager.dispose();
    }

    if (searchPerformanceMonitor) {
        clearInterval(searchPerformanceMonitor);
    }
});

// Error recovery for search manager
window.recoverSearchManager = function() {
    try {
        if (!window.searchManager && typeof API_BASE_URL !== 'undefined') {
            console.log('Attempting to recover search manager...');
            window.searchManager = new SearchManager(API_BASE_URL);

            if (window.showStatus) {
                window.showStatus('Search manager recovered', 'success', 3000);
            }

            return true;
        }
        return false;
    } catch (error) {
        console.error('Failed to recover search manager:', error);
        if (window.showStatus) {
            window.showStatus('Failed to recover search manager', 'error');
        }
        return false;
    }
};

// Export search manager class for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SearchManager };
}

// Development helpers
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.SEARCH_DEBUG = {
        manager: () => window.searchManager,
        state: () => window.debugSearch.logSearchState(),
        test: (query) => window.debugSearch.testSearch(query),
        loadTest: (queries, concurrent) => window.debugSearch.simulateSearchLoad(queries, concurrent),
        analytics: () => window.showSearchAnalytics(),
        performance: () => window.monitorSearchPerformance(),
        cache: window.manageSearchCache,
        suggestions: window.manageSearchSuggestions,
        recover: () => window.recoverSearchManager()
    };

    console.log('🔍 Search debugging tools available at window.SEARCH_DEBUG');
}

console.log('🔍 RAG Search Manager loaded successfully');


