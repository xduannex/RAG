// RAG Chat Application - Enhanced Search Management
// Handles search suggestions, history, and advanced filtering

class SearchManager {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
        this.searchHistory = [];
        this.searchSuggestions = [];
        this.currentFilters = {};
        this.isSearching = false;
        this.suggestionIndex = -1;
        this.init();
    }

    init() {
        console.log('Initializing Search Manager...');
        this.setupElements();
        this.setupEventListeners();
        this.loadSearchHistory();
        this.loadCategories();

        // Register globally
        window.searchManager = this;
        console.log('Search manager initialized');
    }

    setupElements() {
        this.messageInput = document.getElementById('messageInput');
        this.chatForm = document.getElementById('chatForm');
        this.advancedPanel = document.getElementById('advancedSearchPanel');
        this.filterCategory = document.getElementById('filterCategory');
        this.filterDocType = document.getElementById('filterDocType');
        this.filterDateRange = document.getElementById('filterDateRange');
        this.maxResults = document.getElementById('maxResults');
        this.similarityThreshold = document.getElementById('similarityThreshold');
        this.thresholdValue = document.getElementById('thresholdValue');
    }

    setupEventListeners() {
        if (this.messageInput) {
            // Search input events
            this.messageInput.addEventListener('input', (e) => {
                this.handleSearchInput(e);
            });

            this.messageInput.addEventListener('keydown', (e) => {
                this.handleSearchKeydown(e);
            });

            this.messageInput.addEventListener('focus', () => {
                this.showRecentSearches();
            });

            this.messageInput.addEventListener('blur', () => {
                // Delay hiding suggestions to allow clicking
                setTimeout(() => this.hideSuggestions(), 200);
            });
        }

        // Advanced search controls
        if (this.similarityThreshold && this.thresholdValue) {
            this.similarityThreshold.addEventListener('input', (e) => {
                this.thresholdValue.textContent = e.target.value;
            });
        }

        // Document click to hide suggestions
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-input-container')) {
                this.hideSuggestions();
            }
        });
    }

    async handleSearchInput(e) {
        const query = e.target.value.trim();

        if (query.length < 2) {
            this.hideSuggestions();
            return;
        }

        // Debounce search suggestions
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(async () => {
            await this.fetchSearchSuggestions(query);
        }, 300);
    }

    handleSearchKeydown(e) {
        const suggestions = document.querySelector('.search-suggestions');
        if (!suggestions || suggestions.style.display === 'none') {
            return;
        }

        const suggestionItems = suggestions.querySelectorAll('.search-suggestion');

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.suggestionIndex = Math.min(this.suggestionIndex + 1, suggestionItems.length - 1);
                this.updateSuggestionSelection(suggestionItems);
                break;

            case 'ArrowUp':
                e.preventDefault();
                this.suggestionIndex = Math.max(this.suggestionIndex - 1, -1);
                this.updateSuggestionSelection(suggestionItems);
                break;

            case 'Enter':
                if (this.suggestionIndex >= 0 && suggestionItems[this.suggestionIndex]) {
                    e.preventDefault();
                    this.selectSuggestion(suggestionItems[this.suggestionIndex]);
                }
                break;

            case 'Escape':
                e.preventDefault();
                this.hideSuggestions();
                break;
        }
    }

    async fetchSearchSuggestions(query) {
    try {
        this.isSearching = true;

        const response = await fetch(`${this.apiBaseUrl}/search/suggestions?query=${encodeURIComponent(query)}&limit=5`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            this.searchSuggestions = data.suggestions || [];
            this.showSuggestions(query);
        }
    } catch (error) {
        console.error('Failed to fetch search suggestions:', error);
    } finally {
        this.isSearching = false;
    }
}

    showSuggestions(query) {
        const container = document.querySelector('.chat-input-container');
        if (!container) return;

        // Remove existing suggestions
        const existingSuggestions = container.querySelector('.search-suggestions');
        if (existingSuggestions) {
            existingSuggestions.remove();
        }

        if (this.searchSuggestions.length === 0) {
            return;
        }

        // Create suggestions container
        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'search-suggestions';
        suggestionsDiv.style.display = 'block';

        // Add suggestions
        this.searchSuggestions.forEach((suggestion, index) => {
            const suggestionDiv = document.createElement('div');
            suggestionDiv.className = 'search-suggestion';
            suggestionDiv.dataset.index = index;

            let icon = 'fas fa-search';
            let content = suggestion.text || suggestion.query;

            if (suggestion.type === 'history') {
                icon = 'fas fa-history';
            } else if (suggestion.type === 'document') {
                icon = this.getFileTypeIcon(suggestion.filename);
                content = `${suggestion.filename}: ${suggestion.content}`;
            } else if (suggestion.type === 'completion') {
                icon = 'fas fa-lightbulb';
            }

            // Highlight matching text
            const highlightedContent = this.highlightMatch(content, query);

            suggestionDiv.innerHTML = `
                <i class="${icon}"></i>
                <span>${highlightedContent}</span>
            `;

            suggestionDiv.addEventListener('click', () => {
                this.selectSuggestion(suggestionDiv);
            });

            suggestionsDiv.appendChild(suggestionDiv);
        });

        container.appendChild(suggestionsDiv);
        this.suggestionIndex = -1;
    }

    showRecentSearches() {
        if (this.messageInput.value.trim()) {
            return; // Don't show recent searches if there's already text
        }

        const recentSearches = this.getRecentSearches(5);
        if (recentSearches.length === 0) {
            return;
        }

        this.searchSuggestions = recentSearches.map(search => ({
            type: 'history',
            text: search.query,
            query: search.query,
            timestamp: search.timestamp
        }));

        this.showSuggestions('');
    }

    selectSuggestion(suggestionElement) {
        const index = parseInt(suggestionElement.dataset.index);
        const suggestion = this.searchSuggestions[index];

        if (suggestion && this.messageInput) {
            this.messageInput.value = suggestion.query || suggestion.text;
            this.messageInput.focus();

            // Position cursor at end
            this.messageInput.setSelectionRange(
                this.messageInput.value.length,
                this.messageInput.value.length
            );
        }

        this.hideSuggestions();
    }

    updateSuggestionSelection(suggestionItems) {
        suggestionItems.forEach((item, index) => {
            item.classList.toggle('active', index === this.suggestionIndex);
        });
    }

    hideSuggestions() {
        const suggestions = document.querySelector('.search-suggestions');
        if (suggestions) {
            suggestions.remove();
        }
        this.suggestionIndex = -1;
    }

    highlightMatch(text, query) {
        if (!query || !text) return this.escapeHtml(text);

        const escapedText = this.escapeHtml(text);
        const escapedQuery = this.escapeHtml(query);

        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return escapedText.replace(regex, '<mark>$1</mark>');
    }

    getFileTypeIcon(filename) {
        if (!filename) return 'fas fa-file';

        const extension = filename.split('.').pop()?.toLowerCase();
        const iconMap = {
            'pdf': 'fas fa-file-pdf file-type-pdf',
            'doc': 'fas fa-file-word file-type-word',
            'docx': 'fas fa-file-word file-type-word',
            'xls': 'fas fa-file-excel file-type-excel',
            'xlsx': 'fas fa-file-excel file-type-excel',
            'ppt': 'fas fa-file-powerpoint file-type-powerpoint',
            'pptx': 'fas fa-file-powerpoint file-type-powerpoint',
            'txt': 'fas fa-file-alt file-type-text',
            'md': 'fas fa-file-alt file-type-text',
            'csv': 'fas fa-file-csv file-type-csv',
            'json': 'fas fa-file-code file-type-json',
            'xml': 'fas fa-file-code file-type-xml',
            'html': 'fas fa-file-code file-type-html'
        };

        return iconMap[extension] || 'fas fa-file';
    }

    // Search History Management
    addToSearchHistory(query, mode, resultCount = 0) {
        const historyItem = {
            query: query,
            mode: mode,
            resultCount: resultCount,
            timestamp: new Date().toISOString()
        };

        // Remove duplicate
        this.searchHistory = this.searchHistory.filter(item => item.query !== query);

        // Add to beginning
        this.searchHistory.unshift(historyItem);

        // Keep only last 100 searches
        this.searchHistory = this.searchHistory.slice(0, 100);

        this.saveSearchHistory();
    }

    getSearchHistory(limit = 20) {
        return this.searchHistory.slice(0, limit);
    }

    getRecentSearches(limit = 5) {
        return this.searchHistory.slice(0, limit);
    }

    clearSearchHistory() {
        this.searchHistory = [];
        this.saveSearchHistory();
    }

    saveSearchHistory() {
        try {
            localStorage.setItem('rag_search_history', JSON.stringify(this.searchHistory));
        } catch (error) {
            console.warn('Failed to save search history:', error);
        }
    }

    loadSearchHistory() {
        try {
            const saved = localStorage.getItem('rag_search_history');
            if (saved) {
                this.searchHistory = JSON.parse(saved);
            }
        } catch (error) {
            console.warn('Failed to load search history:', error);
            this.searchHistory = [];
        }
    }

    exportSearchHistory() {
        try {
            const data = {
                exported_at: new Date().toISOString(),
                search_history: this.searchHistory
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rag_search_history_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Failed to export search history:', error);
            if (window.showStatus) {
                window.showStatus('Failed to export search history', 'error');
            }
        }
    }

    // Advanced Search Management
    setAdvancedFilters(filters) {
        this.currentFilters = { ...filters };
        console.log('Advanced filters set:', this.currentFilters);
    }

    getAdvancedFilters() {
        return { ...this.currentFilters };
    }

    resetAdvancedFilters() {
        this.currentFilters = {};

        // Reset UI elements
        if (this.filterDocType) this.filterDocType.value = '';
        if (this.filterCategory) this.filterCategory.value = '';
        if (this.filterDateRange) this.filterDateRange.value = '';
        if (this.maxResults) this.maxResults.value = '10';
        if (this.similarityThreshold) {
            this.similarityThreshold.value = '0.0';
            if (this.thresholdValue) this.thresholdValue.textContent = '0.0';
        }
    }

    async loadCategories() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/documents/categories`);
            if (response.ok) {
                const data = await response.json();
                this.populateCategoryFilter(data.categories || []);
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
        }
    }

    populateCategoryFilter(categories) {
        if (!this.filterCategory) return;

        // Clear existing options (except "All Categories")
        const firstOption = this.filterCategory.querySelector('option[value=""]');
        this.filterCategory.innerHTML = '';
        if (firstOption) {
            this.filterCategory.appendChild(firstOption);
        }

        // Add category options
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            this.filterCategory.appendChild(option);
        });
    }

    // Search Mode Management
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

        localStorage.setItem('rag_search_mode', mode);
        console.log('Search mode set to:', mode);
    }

    getSearchMode() {
        return this.currentSearchMode || 'rag';
    }

    // Utility methods
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

        formatTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                return date.toLocaleTimeString();
            } else if (diffDays === 1) {
                return 'Yesterday';
            } else if (diffDays < 7) {
                return `${diffDays} days ago`;
            } else {
                return date.toLocaleDateString();
            }
        } catch (error) {
            return 'Unknown';
        }
    }

    // Public API methods
    performSearch(query, mode = null) {
        if (!query.trim()) return;

        const searchMode = mode || this.getSearchMode();

        // Add to history
        this.addToSearchHistory(query, searchMode);

        // Trigger search through chat manager
        if (window.chatManager) {
            window.chatManager.setSearchMode(searchMode);

            // Set the input value and trigger form submission
            if (this.messageInput) {
                this.messageInput.value = query;
                if (this.chatForm) {
                    this.chatForm.dispatchEvent(new Event('submit'));
                }
            }
        }
    }

    getSearchSuggestions() {
        return [...this.searchSuggestions];
    }

    isSearchInProgress() {
        return this.isSearching;
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

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SearchManager;
}