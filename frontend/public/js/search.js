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
        this.maxCacheSize = 50;
        this.searchSuggestions = [];
        this.suggestionsEnabled = true;
        this.init();
    }

    init() {
        this.loadSearchHistory();
        this.setupEventListeners();
        this.setupSearchSuggestions();
        this.loadSearchMode();
    }

    setupEventListeners() {
        // Search input events - Only add if not already handled by chat
        const searchInput = document.getElementById('messageInput');
        if (searchInput && !searchInput.hasAttribute('data-search-initialized')) {
            // Mark as initialized to prevent duplicate listeners
            searchInput.setAttribute('data-search-initialized', 'true');

            // Only add search suggestions on focus, not on every input
            searchInput.addEventListener('focus', () => {
                if (this.suggestionsEnabled && searchInput.value.length > 2) {
                    this.showSearchSuggestions(searchInput.value);
                }
            });

            // Handle arrow keys for suggestions navigation only
            searchInput.addEventListener('keydown', (e) => {
                if (this.isSuggestionsVisible()) {
                    this.handleSearchKeydown(e);
                }
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
    }

    setupSearchSuggestions() {
        // Create suggestions container if it doesn't exist
        const searchContainer = document.querySelector('.chat-input-container');
        if (searchContainer && !document.getElementById('search-suggestions')) {
            const suggestionsDiv = document.createElement('div');
            suggestionsDiv.id = 'search-suggestions';
            suggestionsDiv.className = 'search-suggestions';
            suggestionsDiv.style.display = 'none';
            suggestionsDiv.style.position = 'absolute';
            suggestionsDiv.style.bottom = '100%';
            suggestionsDiv.style.left = '0';
            suggestionsDiv.style.right = '0';
            suggestionsDiv.style.zIndex = '1000';
            suggestionsDiv.style.backgroundColor = 'var(--bg-color)';
            suggestionsDiv.style.border = '1px solid var(--border-color)';
            suggestionsDiv.style.borderRadius = '8px';
            suggestionsDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
            suggestionsDiv.style.maxHeight = '200px';
            suggestionsDiv.style.overflowY = 'auto';

            // Make the container relative for positioning
            searchContainer.style.position = 'relative';
            searchContainer.appendChild(suggestionsDiv);
        }
    }

    isSuggestionsVisible() {
        const container = document.getElementById('search-suggestions');
        return container && container.style.display !== 'none';
    }

    handleSearchKeydown(e) {
        const suggestions = document.querySelectorAll('.search-suggestion');
        if (suggestions.length === 0) return;

        const activeSuggestion = document.querySelector('.search-suggestion.active');

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.navigateSuggestions('down', suggestions);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.navigateSuggestions('up', suggestions);
                break;
            case 'Enter':
                if (activeSuggestion) {
                    e.preventDefault();
                    this.selectSuggestion(activeSuggestion.textContent.trim());
                    return false; // Prevent form submission
                }
                break;
            case 'Escape':
                e.preventDefault();
                this.hideSearchSuggestions();
                break;
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
    }

    async showSearchSuggestions(query) {
        if (!this.suggestionsEnabled || !query || query.length < 2) {
            this.hideSearchSuggestions();
            return;
        }

        try {
            // Get suggestions from search history
            const historySuggestions = this.getHistorySuggestions(query);

            if (historySuggestions.length > 0) {
                this.displaySearchSuggestions(historySuggestions.slice(0, 5));
            } else {
                this.hideSearchSuggestions();
            }
        } catch (error) {
            console.error('Error showing search suggestions:', error);
        }
    }

    getHistorySuggestions(query) {
        const queryLower = query.toLowerCase();
        return this.searchHistory
            .filter(item =>
                item.query.toLowerCase().includes(queryLower) &&
                item.query.toLowerCase() !== queryLower
            )
            .map(item => item.query)
            .slice(0, 5);
    }

    displaySearchSuggestions(suggestions) {
        const container = document.getElementById('search-suggestions');
        if (!container || suggestions.length === 0) {
            this.hideSearchSuggestions();
            return;
        }

        container.innerHTML = suggestions.map((suggestion, index) => `
            <div class="search-suggestion ${index === 0 ? 'active' : ''}" 
                 onclick="searchManager.selectSuggestion('${this.escapeHtml(suggestion)}')"
                 style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; border-bottom: 1px solid var(--border-color);">
                <i class="fas fa-history" style="margin-right: 8px; opacity: 0.6;"></i>
                <span>${this.highlightText(this.escapeHtml(suggestion), this.currentQuery)}</span>
            </div>
        `).join('');

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
        }
        this.hideSearchSuggestions();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    highlightText(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    setSearchMode(mode) {
        if (!['rag', 'search'].includes(mode)) {
            console.warn('Invalid search mode:', mode);
            return;
        }

        this.searchMode = mode;

        // Update UI
        document.querySelectorAll('.search-mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.querySelector(`[data-mode="${mode}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // Update placeholder
        const searchInput = document.getElementById('messageInput');
        if (searchInput) {
            if (mode === 'rag') {
                searchInput.placeholder = 'Ask a question about your documents...';
            } else {
                searchInput.placeholder = 'Search for content in your documents...';
            }
        }

        // Save preference
        if (window.Utils) {
            Utils.setStorage('rag_search_mode', mode);
        } else {
            localStorage.setItem('rag_search_mode', mode);
        }

        console.log(`Search mode set to: ${mode}`);
    }

    loadSearchMode() {
        let savedMode;
        if (window.Utils) {
            savedMode = Utils.getStorage('rag_search_mode', 'rag');
        } else {
            savedMode = localStorage.getItem('rag_search_mode') || 'rag';
        }
        this.setSearchMode(savedMode);
    }

    async performSearch(query) {
        if (this.isSearching) {
            console.warn('Search already in progress');
            return null;
        }

        this.isSearching = true;

        try {
            // Check cache first
            const cacheKey = `${this.searchMode}:${query}`;
            if (this.searchCache.has(cacheKey)) {
                console.log('Returning cached result');
                return this.searchCache.get(cacheKey);
            }

            let result;
            if (this.searchMode === 'rag') {
                result = await this.performRAGQuery(query);
            } else {
                result = await this.performDocumentSearch(query);
            }

            // Cache result
            this.cacheSearchResult(cacheKey, result);

            // Add to search history
            this.addToSearchHistory(query, this.searchMode, result);

            return result;

        } catch (error) {
            console.error('Search error:', error);
            throw error;
        } finally {
            this.isSearching = false;
        }
    }

    async performRAGQuery(query) {
        const response = await fetch(`${this.apiBaseUrl}/search/rag`, {
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
    }

    async performDocumentSearch(query) {
        const response = await fetch(`${this.apiBaseUrl}/search`, {
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
    }

    cacheSearchResult(key, result) {
        // Implement LRU cache
        if (this.searchCache.size >= this.maxCacheSize) {
            const firstKey = this.searchCache.keys().next().value;
            this.searchCache.delete(firstKey);
        }

        this.searchCache.set(key, result);
    }

    addToSearchHistory(query, mode, result) {
        const historyItem = {
            query,
            mode,
            timestamp: Date.now(),
            resultCount: result.sources?.length || 0,
            hasAnswer: !!result.answer
        };

        // Remove duplicate queries
        this.searchHistory = this.searchHistory.filter(item => item.query !== query);

        // Add to beginning
        this.searchHistory.unshift(historyItem);

        // Limit history size
        if (this.searchHistory.length > 100) {
            this.searchHistory = this.searchHistory.slice(0, 100);
        }

        this.saveSearchHistory();
    }

    loadSearchHistory() {
        try {
            let saved;
            if (window.Utils) {
                saved = Utils.getStorage('rag_search_history', []);
            } else {
                saved = JSON.parse(localStorage.getItem('rag_search_history') || '[]');
            }
            this.searchHistory = Array.isArray(saved) ? saved : [];
        } catch (error) {
            console.warn('Failed to load search history:', error);
            this.searchHistory = [];
        }
    }

    saveSearchHistory() {
        try {
            if (window.Utils) {
                Utils.setStorage('rag_search_history', this.searchHistory.slice(0, 50));
            } else {
                localStorage.setItem('rag_search_history', JSON.stringify(this.searchHistory.slice(0, 50)));
            }
        } catch (error) {
            console.warn('Failed to save search history:', error);
        }
    }

    getSearchHistory(limit = 10) {
        return this.searchHistory.slice(0, limit);
    }

    clearSearchHistory() {
        this.searchHistory = [];
        this.saveSearchHistory();
        if (window.Utils) {
            Utils.removeStorage('rag_search_history');
        } else {
            localStorage.removeItem('rag_search_history');
        }
        console.log('Search history cleared');
    }

    getSearchStats() {
        const total = this.searchHistory.length;
        const ragQueries = this.searchHistory.filter(item => item.mode === 'rag').length;
        const searchQueries = this.searchHistory.filter(item => item.mode === 'search').length;
        const successfulQueries = this.searchHistory.filter(item => item.hasAnswer || item.resultCount > 0).length;

        return {
            total,
            ragQueries,
            searchQueries,
            successfulQueries,
                        successRate: total > 0 ? (successfulQueries / total * 100).toFixed(1) : 0,
            recentQueries: this.searchHistory.slice(0, 5),
            topQueries: this.getTopQueries()
        };
    }

    getTopQueries(limit = 5) {
        const queryCount = {};

        this.searchHistory.forEach(item => {
            queryCount[item.query] = (queryCount[item.query] || 0) + 1;
        });

        return Object.entries(queryCount)
            .sort(([,a], [,b]) => b - a)
            .slice(0, limit)
            .map(([query, count]) => ({ query, count }));
    }

    clearCache() {
        this.searchCache.clear();
        console.log('Search cache cleared');
    }

    enableSuggestions() {
        this.suggestionsEnabled = true;
    }

    disableSuggestions() {
        this.suggestionsEnabled = false;
        this.hideSearchSuggestions();
    }

    // Advanced search functionality
    async performAdvancedSearch(query, filters = {}) {
        const searchParams = {
            query,
            ...filters,
            limit: filters.limit || 10
        };

        try {
            const response = await fetch(`${this.apiBaseUrl}/search/advanced`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(searchParams)
            });

            if (!response.ok) {
                throw new Error(`Advanced search failed: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Advanced search error:', error);
            throw error;
        }
    }

    // Export search history
    exportSearchHistory() {
        const data = {
            searchHistory: this.searchHistory,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `rag-search-history-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Import search history
    importSearchHistory(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);

                    if (data.searchHistory && Array.isArray(data.searchHistory)) {
                        // Merge with existing history
                        const existingQueries = new Set(this.searchHistory.map(item => item.query));
                        const newItems = data.searchHistory.filter(item => !existingQueries.has(item.query));

                        this.searchHistory = [...this.searchHistory, ...newItems];
                        this.saveSearchHistory();

                        resolve(newItems.length);
                    } else {
                        reject(new Error('Invalid search history format'));
                    }
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }
}

// Initialize search manager
let searchManager;

// Wait for DOM and other dependencies
document.addEventListener('DOMContentLoaded', () => {
    // Initialize after a short delay to ensure other managers are ready
    setTimeout(() => {
        if (window.API_BASE_URL) {
            searchManager = new SearchManager(window.API_BASE_URL);
            window.searchManager = searchManager;
            console.log('Search manager initialized');
        } else {
            console.error('API_BASE_URL not defined, cannot initialize search manager');
        }
    }, 100);
});

// Export for global access
window.SearchManager = SearchManager;

console.log('Search manager module loaded');

