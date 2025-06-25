// RAG Search Application - Advanced Search Manager
// Handles advanced search operations, filters, and search suggestions

class AdvancedSearchManager {
    constructor(ragClient) {
        this.ragClient = ragClient;

        // Add null checks for ragClient
        if (!this.ragClient) {
            console.warn('⚠️ RAGClient not provided to AdvancedSearchManager, creating fallback');
            this.ragClient = this.createFallbackClient();
        }

        // Validate ragClient has required methods
        if (!this.ragClient.ragQuery || !this.ragClient.search) {
            console.warn('⚠️ RAGClient missing required methods, adding fallbacks');
            this.addFallbackMethods();
        }

        this.searchFilters = {};
        this.searchSuggestions = [];
        this.isAdvancedSearchVisible = false;
        this.searchCache = new Map();
        this.cacheTimeout = 300000; // 5 minutes

        console.log('AdvancedSearchManager initialized');
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
                            n_results: options.limit || 10,
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
        console.log('Initializing AdvancedSearchManager...');

        try {
            this.setupEventListeners();
            this.loadSearchFilters();
            await this.loadCategories();

            console.log('AdvancedSearchManager initialized successfully');
        } catch (error) {
            console.error('AdvancedSearchManager initialization failed:', error);
            throw error;
        }
    }

    setupEventListeners() {
        // Filter change listeners
        const docTypeFilter = document.getElementById('filterDocType');
        const categoryFilter = document.getElementById('filterCategory');
        const maxResults = document.getElementById('maxResults');

        if (docTypeFilter) {
            docTypeFilter.addEventListener('change', () => this.updateFilters());
        }

        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => this.updateFilters());
        }

        if (maxResults) {
            maxResults.addEventListener('change', () => this.updateFilters());
        }

        // Search input for suggestions
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(() => {
                this.generateSearchSuggestions();
            }, 300));
        }
    }

    updateFilters() {
        const docTypeFilter = document.getElementById('filterDocType');
        const categoryFilter = document.getElementById('filterCategory');
        const maxResults = document.getElementById('maxResults');

        this.searchFilters = {
            docType: docTypeFilter?.value || '',
            category: categoryFilter?.value || '',
            maxResults: parseInt(maxResults?.value) || 10
        };

        // Clear cache when filters change
        this.clearCache();
        this.saveSearchFilters();

        console.log('Search filters updated:', this.searchFilters);

        // Show filter indicator
        this.updateFilterIndicator();
    }

    updateFilterIndicator() {
        const activeFilters = Object.values(this.searchFilters).filter(value =>
            value && value !== '' && value !== 10
        );

        // Create or update filter indicator
        let indicator = document.getElementById('filterIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'filterIndicator';
            indicator.className = 'filter-indicator';

            const searchSection = document.querySelector('.search-section .section-header');
            if (searchSection) {
                searchSection.appendChild(indicator);
            }
        }

        if (activeFilters.length > 0) {
            indicator.innerHTML = `
                <span class="filter-count">${activeFilters.length} filter${activeFilters.length > 1 ? 's' : ''} active</span>
                <button class="btn btn-xs btn-outline" onclick="window.resetSearchFilters()">
                    <i class="fas fa-times"></i> Clear
                </button>
            `;
            indicator.style.display = 'inline-flex';
        } else {
            indicator.style.display = 'none';
        }
    }

    async loadCategories() {
        try {
            const response = await fetch(`${this.ragClient.baseURL}/documents/categories`);
            if (response.ok) {
                const categories = await response.json();
                this.updateCategoriesDropdown(categories);
            }
        } catch (error) {
            console.warn('Failed to load categories:', error);
        }
    }

    updateCategoriesDropdown(categories) {
        const categoryFilter = document.getElementById('filterCategory');
        if (!categoryFilter || !categories || categories.length === 0) return;

        // Clear existing options except "All Categories"
        const options = Array.from(categoryFilter.options);
        options.slice(1).forEach(option => option.remove());

        // Add category options
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
    }

    generateSearchSuggestions() {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput || !searchInput.value.trim()) {
            this.hideSearchSuggestions();
            return;
        }

        const query = searchInput.value.trim();

        // Generate suggestions based on common patterns
        const suggestions = [];

        // Question patterns for RAG mode
        const questionPatterns = [
            'What is',
            'How to',
            'Explain',
            'Summarize',
            'What are the benefits of',
            'How does',
            'Why is',
            'When should',
            'Where can I find'
        ];

        // Search patterns for search mode
        const searchPatterns = [
            'Find documents about',
            'Show me information on',
            'Search for',
            'Documents containing',
            'Files related to'
        ];

        const currentMode = window.searchManager?.currentSearchMode || 'rag';
        const patterns = currentMode === 'rag' ? questionPatterns : searchPatterns;
                patterns.forEach(pattern => {
            if (pattern.toLowerCase().includes(query.toLowerCase()) ||
                query.toLowerCase().length > 2) {
                suggestions.push({
                    text: `${pattern} ${query}`,
                    type: 'pattern',
                    mode: currentMode
                });
            }
        });

        // Add common document topics if available
        const commonTopics = [
            'policy', 'procedure', 'guidelines', 'manual', 'report',
            'analysis', 'summary', 'requirements', 'specifications',
            'documentation', 'training', 'process', 'workflow'
        ];

        commonTopics.forEach(topic => {
            if (topic.includes(query.toLowerCase()) && query.length > 1) {
                suggestions.push({
                    text: `${query} ${topic}`,
                    type: 'topic',
                    mode: currentMode
                });
            }
        });

        this.searchSuggestions = suggestions.slice(0, 5);
        this.showSearchSuggestions();
    }

    showSearchSuggestions() {
        if (this.searchSuggestions.length === 0) {
            this.hideSearchSuggestions();
            return;
        }

        let suggestionsContainer = document.getElementById('searchSuggestions');
        if (!suggestionsContainer) {
            suggestionsContainer = this.createSuggestionsContainer();
        }

        const suggestionsHTML = this.searchSuggestions.map((suggestion, index) => `
            <div class="suggestion-item" data-index="${index}" onclick="window.advancedSearchManager.selectSuggestion(${index})">
                <div class="suggestion-content">
                    <i class="fas fa-${suggestion.mode === 'rag' ? 'brain' : 'search'}"></i>
                    <span class="suggestion-text">${this.escapeHtml(suggestion.text)}</span>
                </div>
                <div class="suggestion-meta">
                    <span class="suggestion-type">${suggestion.type}</span>
                </div>
            </div>
        `).join('');

        suggestionsContainer.innerHTML = suggestionsHTML;
        suggestionsContainer.style.display = 'block';
    }

    hideSearchSuggestions() {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        if (suggestionsContainer) {
            suggestionsContainer.style.display = 'none';
        }
    }

    createSuggestionsContainer() {
        const container = document.createElement('div');
        container.id = 'searchSuggestions';
        container.className = 'search-suggestions-dropdown';

        const searchInputContainer = document.querySelector('.search-input-container');
        if (searchInputContainer) {
            searchInputContainer.appendChild(container);
        }

        return container;
    }

    selectSuggestion(index) {
        if (index >= 0 && index < this.searchSuggestions.length) {
            const suggestion = this.searchSuggestions[index];
            const searchInput = document.getElementById('searchInput');

            if (searchInput) {
                searchInput.value = suggestion.text;
                searchInput.focus();
            }

            if (window.searchManager) {
                window.searchManager.setSearchMode(suggestion.mode);
            }

            this.hideSearchSuggestions();
        }
    }

    // Advanced search functionality
    async performAdvancedSearch(query, options = {}) {
        const searchOptions = {
            ...this.getSearchFilters(),
            ...options
        };

        // Check cache first
        const cacheKey = `advanced:${query}:${JSON.stringify(searchOptions)}`;
        const cachedResult = this.getFromCache(cacheKey);
        if (cachedResult) {
            console.log('Using cached advanced search result');
            return cachedResult;
        }

        try {
            let result;
            const currentMode = window.searchManager?.currentSearchMode || 'rag';

            if (currentMode === 'rag') {
                result = await this.ragClient.ragQuery(query, {
                    max_results: searchOptions.maxResults,
                    similarity_threshold: 0.3,
                    ...searchOptions
                });
            } else {
                result = await this.ragClient.search(query, {
                    limit: searchOptions.maxResults,
                    similarity_threshold: 0.3,
                    ...searchOptions
                });
            }

            if (result.success) {
                this.addToCache(cacheKey, result);
            }

            return result;
        } catch (error) {
            console.error('Advanced search error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getSearchFilters() {
        const filters = {};

        if (this.searchFilters.docType) {
            filters.file_types = [this.searchFilters.docType];
        }

        if (this.searchFilters.category) {
            filters.categories = [this.searchFilters.category];
        }

        filters.maxResults = this.searchFilters.maxResults || 10;

        return filters;
    }

    resetFilters() {
        this.searchFilters = {};

        // Reset UI
        const docTypeFilter = document.getElementById('filterDocType');
        const categoryFilter = document.getElementById('filterCategory');
        const maxResults = document.getElementById('maxResults');

        if (docTypeFilter) docTypeFilter.value = '';
        if (categoryFilter) categoryFilter.value = '';
        if (maxResults) maxResults.value = '10';

        // Clear cache and update indicator
        this.clearCache();
        this.updateFilterIndicator();
        this.saveSearchFilters();

        console.log('Search filters reset');
    }

    // Document filtering
    async getDocumentsByFilter(filters) {
        try {
            const queryParams = new URLSearchParams();

            if (filters.docType) {
                queryParams.append('file_type', filters.docType);
            }

            if (filters.category) {
                queryParams.append('category', filters.category);
            }

            const response = await fetch(`${this.ragClient.baseURL}/documents/?${queryParams}`);

            if (response.ok) {
                return await response.json();
            } else {
                throw new Error('Failed to fetch filtered documents');
            }
        } catch (error) {
            console.error('Error fetching filtered documents:', error);
            return [];
        }
    }

    // Search analytics
    trackSearchAnalytics(query, mode, results, filters) {
        const analytics = {
            query: query,
            mode: mode,
            resultCount: results?.length || 0,
            filters: filters,
            timestamp: Date.now(),
            responseTime: performance.now()
        };

        // Store analytics locally
        this.saveSearchAnalytics(analytics);

        // Send to analytics service if available
        if (window.ragApp && window.ragApp.trackEvent) {
            window.ragApp.trackEvent('search', mode, query, analytics.resultCount);
        }
    }

    saveSearchAnalytics(analytics) {
        try {
            let searchAnalytics = JSON.parse(localStorage.getItem('rag_search_analytics') || '[]');
            searchAnalytics.push(analytics);

            // Keep only last 100 searches
            if (searchAnalytics.length > 100) {
                searchAnalytics = searchAnalytics.slice(-100);
            }

            localStorage.setItem('rag_search_analytics', JSON.stringify(searchAnalytics));
        } catch (error) {
            console.warn('Failed to save search analytics:', error);
        }
    }

    getSearchAnalytics() {
        try {
            return JSON.parse(localStorage.getItem('rag_search_analytics') || '[]');
        } catch (error) {
            console.warn('Failed to load search analytics:', error);
            return [];
        }
    }

    // Cache management
    addToCache(key, value) {
        this.searchCache.set(key, {
            data: value,
            timestamp: Date.now()
        });

        this.cleanCache();
    }

    getFromCache(key) {
        const cached = this.searchCache.get(key);
        if (!cached) return null;

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
        console.log('Search cache cleared');
    }

    // Storage management
    saveSearchFilters() {
        try {
            localStorage.setItem('rag_search_filters', JSON.stringify(this.searchFilters));
        } catch (error) {
            console.warn('Failed to save search filters:', error);
        }
    }

    loadSearchFilters() {
        try {
            const stored = localStorage.getItem('rag_search_filters');
            if (stored) {
                this.searchFilters = JSON.parse(stored);
                this.applyStoredFilters();
            }
        } catch (error) {
            console.warn('Failed to load search filters:', error);
            this.searchFilters = {};
        }
    }

    applyStoredFilters() {
        const docTypeFilter = document.getElementById('filterDocType');
        const categoryFilter = document.getElementById('filterCategory');
        const maxResults = document.getElementById('maxResults');

        if (docTypeFilter && this.searchFilters.docType) {
            docTypeFilter.value = this.searchFilters.docType;
        }

        if (categoryFilter && this.searchFilters.category) {
            categoryFilter.value = this.searchFilters.category;
        }

        if (maxResults && this.searchFilters.maxResults) {
            maxResults.value = this.searchFilters.maxResults.toString();
        }

        this.updateFilterIndicator();
    }

    // Export functionality
    exportSearchResults(results, query) {
        try {
            const exportData = {
                query: query,
                timestamp: new Date().toISOString(),
                resultCount: results.length,
                filters: this.searchFilters,
                results: results.map(result => ({
                    title: result.title || result.filename,
                    content: result.content,
                    score: result.score || result.similarity_score,
                    page_number: result.page_number,
                    document_id: result.document_id
                }))
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `search_results_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (window.showStatus) {
                window.showStatus('Search results exported successfully', 'success');
            }
        } catch (error) {
            console.error('Failed to export search results:', error);
            if (window.showStatus) {
                window.showStatus('Failed to export search results', 'error');
            }
        }
    }

    // Utility methods
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
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

    // Public API
    getActiveFilters() {
        return { ...this.searchFilters };
    }

    setFilters(filters) {
        this.searchFilters = { ...this.searchFilters, ...filters };
        this.applyStoredFilters();
        this.clearCache();
        this.saveSearchFilters();
    }

    // Cleanup
    cleanup() {
        console.log('Cleaning up AdvancedSearchManager...');
        this.clearCache();

        const suggestionsContainer = document.getElementById('searchSuggestions');
        if (suggestionsContainer && suggestionsContainer.parentElement) {
            suggestionsContainer.remove();
        }
    }
}

// Global functions for HTML onclick handlers
window.resetSearchFilters = function() {
    if (window.advancedSearchManager) {
        window.advancedSearchManager.resetFilters();
    }

    if (window.showStatus) {
        window.showStatus('Search filters reset', 'success');
    }
};

// Global instance
window.advancedSearchManager = null;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvancedSearchManager;
}

console.log('AdvancedSearchManager class loaded');

