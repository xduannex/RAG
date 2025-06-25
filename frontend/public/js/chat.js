// RAG Search Application - Search Manager (formerly ChatManager)
// Handles search interface and document results display

class SearchManager {
    constructor(apiBaseUrlOrClient) {
        // Ensure apiBaseUrl is properly set with fallbacks
        this.apiBaseUrl = apiBaseUrlOrClient || window.API_BASE_URL || 'http://localhost:8000';

        console.log('SearchManager API Base URL:', this.apiBaseUrl);

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

        console.log('SearchManager API Base URL (final):', this.apiBaseUrl);
        console.log('Type check:', typeof this.apiBaseUrl);

        this.searchResults = null;
        this.searchInput = null;
        this.searchButton = null;
        this.searchForm = null;
        this.searchLoading = null;
        this.currentSearchMode = 'rag';
        this.isSearching = false;
        this.searchCount = 0;
        this.init();
    }

    init() {
        console.log('Initializing Search Manager...');
        this.setupElements();
        this.setupEventListeners();

        // Register globally
        window.searchManager = this;

        // Load saved search mode
        const savedMode = localStorage.getItem('rag_search_mode') || 'rag';
        this.setSearchMode(savedMode);

        console.log('Search manager initialized');
    }

    setupElements() {
        this.searchResults = document.getElementById('searchResults');
        this.searchInput = document.getElementById('searchInput');
        this.searchButton = document.getElementById('searchButton');
        this.searchForm = document.getElementById('searchForm');
        this.searchLoading = document.getElementById('searchLoading');

        if (!this.searchResults || !this.searchInput || !this.searchButton || !this.searchForm) {
            console.error('Required search elements not found');
        }
    }

    setupEventListeners() {
        if (this.searchForm) {
            this.searchForm.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        if (this.searchInput) {
            // Handle Enter key
            this.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleSubmit(e);
                }
            });

            // Handle focus/blur for styling
            this.searchInput.addEventListener('focus', () => {
                this.searchInput.parentElement.classList.add('focused');
            });

            this.searchInput.addEventListener('blur', () => {
                this.searchInput.parentElement.classList.remove('focused');
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
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (this.isSearching) {
            console.log('Search already in progress');
            return;
        }

        const query = this.searchInput.value.trim();
        if (!query) {
            return;
        }

        this.isSearching = true;
        this.updateSearchButton(true);
        this.showLoading();

        try {
            // Send to appropriate endpoint based on mode
            let response;
            if (this.currentSearchMode === 'rag') {
                response = await this.sendRAGQuery(query);
            } else {
                response = await this.sendSearchQuery(query);
            }

            this.hideLoading();
            this.displaySearchResults(response, query);
            this.searchCount++;

        } catch (error) {
            console.error('Search error:', error);
            this.hideLoading();
            this.displayError('Sorry, I encountered an error processing your request: ' + error.message);

            if (window.showStatus) {
                window.showStatus('Search failed: ' + error.message, 'error');
            }
        } finally {
            this.isSearching = false;
            this.updateSearchButton(false);
        }
    }

    async sendRAGQuery(query) {
        try {
            console.log('Sending RAG query:', query);
            console.log('Using API Base URL:', this.apiBaseUrl);

            const payload = {
                query: query,
                max_results: this.getMaxResults(),
                similarity_threshold: 0.3,
                model: 'llama3.2:latest'
            };

            const url = `${this.apiBaseUrl}/search/rag`;
            console.log('Full request URL:', url);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Response status:', response.status);
                console.error('Response text:', errorText);
                throw new Error(`RAG query failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('RAG query error:', error);
            throw error;
        }
    }

    async sendSearchQuery(query) {
        console.log('Sending search query:', query);

        const requestData = {
            query: query,
            n_results: this.getMaxResults(),
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

    displaySearchResults(response, query) {
        console.log('Displaying search results:', response);

        if (this.currentSearchMode === 'rag') {
            this.displayRAGResults(response, query);
        } else {
            this.displaySearchOnlyResults(response, query);
        }
    }

    displayRAGResults(response, query) {
        if (response.success === false) {
            this.displayError(response.message || 'RAG query failed');
            return;
        }

        const answer = response.answer || 'No answer generated';
        const sources = response.sources || [];

        let resultsHTML = `
            <div class="search-result-header">
                <h3><i class="fas fa-brain"></i> AI Response</h3>
                <div class="search-meta">
                    <span>Query: "${this.escapeHtml(query)}"</span>
                    <span>•</span>
                    <span>${sources.length} sources found</span>
                </div>
            </div>
            
            <div class="ai-response">
                <div class="ai-answer">
                    ${this.formatContent(answer)}
                </div>
            </div>
        `;

        if (sources.length > 0) {
            resultsHTML += `
                <div class="sources-section">
                    <h4><i class="fas fa-link"></i> Sources (${sources.length})</h4>
                    <div class="sources-grid">
                        ${this.createSourcesList(sources)}
                    </div>
                </div>
            `;
        }

        this.searchResults.innerHTML = resultsHTML;
    }

    displaySearchOnlyResults(response, query) {
        if (response.success === false) {
            this.displayError(response.message || 'Search query failed');
            return;
        }

        const results = response.results || [];
        const total = response.total || 0;

        if (results.length === 0) {
            this.searchResults.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <h3>No Results Found</h3>
                    <p>No documents found matching your search query: "${this.escapeHtml(query)}"</p>
                    <div class="no-results-suggestions">
                        <p>Try:</p>
                        <ul>
                            <li>Using different keywords</li>
                            <li>Checking your spelling</li>
                            <li>Using more general terms</li>
                            <li>Uploading more documents</li>
                        </ul>
                    </div>
                </div>
            `;
            return;
        }

        let resultsHTML = `
            <div class="search-result-header">
                <h3><i class="fas fa-search"></i> Search Results</h3>
                <div class="search-meta">
                    <span>Query: "${this.escapeHtml(query)}"</span>
                    <span>•</span>
                    <span>${total} result${total !== 1 ? 's' : ''} found</span>
                </div>
            </div>
            
            <div class="results-list">
                ${this.createResultsList(results, query)}
            </div>
        `;

        this.searchResults.innerHTML = resultsHTML;
    }

    createSourcesList(sources) {
        return sources.map((source, index) => {
            const score = source.score || source.similarity_score || 0;
            const relevancePercentage = Math.round(score * 100);
            const displayPercentage = isNaN(relevancePercentage) ? 0 : relevancePercentage;
            const previewText = this.truncateText(source.content, 200);

            return `
                <div class="source-item" onclick="window.documentManager?.openDocumentViewer(${source.document_id})">
                    <div class="source-header">
                        <div class="source-info">
                            <i class="fas fa-file-alt"></i>
                            <span class="source-title">${this.escapeHtml(source.title || source.filename || 'Unknown Document')}</span>
                        </div>
                        <div class="source-relevance">
                            <span class="relevance-score">${displayPercentage}%</span>
                        </div>
                    </div>
                    <div class="source-preview">
                        ${this.escapeHtml(previewText)}
                    </div>
                    <div class="source-footer">
                        ${source.page_number ? `<span class="source-page"><i class="fas fa-file"></i> Page ${source.page_number}</span>` : ''}
                        <button class="btn btn-sm btn-primary source-view-btn" onclick="event.stopPropagation(); window.documentManager?.openDocumentViewer(${source.document_id})" title="View Document">
                            <i class="fas fa-eye"></i> View Document
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    createResultsList(results, query) {
        return results.map((result, index) => {
            const score = result.score || result.similarity_score || 0;
            const relevancePercentage = Math.round(score * 100);
            const displayPercentage = isNaN(relevancePercentage) ? 0 : relevancePercentage;
            const previewText = this.highlightSearchTerms(this.truncateText(result.content, 250), query);

            return `
                <div class="result-item" onclick="window.documentManager?.openDocumentViewer(${result.document_id})">
                    <div class="result-header">
                        <div class="result-number">${index + 1}</div>
                        <div class="result-info">
                            <i class="fas fa-file-alt"></i>
                            <span class="result-title">${this.escapeHtml(result.title || result.filename || 'Unknown Document')}</span>
                        </div>
                        <div class="result-relevance">
                            <span class="relevance-score">${displayPercentage}%</span>
                        </div>
                    </div>
                    <div class="result-preview">
                        ${previewText}
                    </div>
                    <div class="result-footer">
                        ${result.page_number ? `<span class="result-page"><i class="fas fa-file"></i> Page ${result.page_number}</span>` : ''}
                        <button class="btn btn-sm btn-primary result-view-btn" onclick="event.stopPropagation(); window.documentManager?.openDocumentViewer(${result.document_id})" title="View Document">
                            <i class="fas fa-eye"></i> View Document
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayError(message) {
        this.searchResults.innerHTML = `
            <div class="search-error">
                <div class="error-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Search Error</h3>
                <p>${this.escapeHtml(message)}</p>
                <div class="error-actions">
                    <button class="btn btn-primary" onclick="window.searchManager.clearResults()">
                        <i class="fas fa-times"></i> Clear
                    </button>
                    <button class="btn btn-outline" onclick="window.checkConnection?.()">
                        <i class="fas fa-wifi"></i> Check Connection
                    </button>
                </div>
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

    showLoading() {
        if (this.searchLoading) {
            this.searchLoading.style.display = 'block';
        }

        // Hide welcome message
        const welcomeMessage = this.searchResults?.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
    }

    hideLoading() {
        if (this.searchLoading) {
            this.searchLoading.style.display = 'none';
        }
    }

    updateSearchButton(isSearching) {
        if (!this.searchButton) return;

        const icon = this.searchButton.querySelector('i');
        if (isSearching) {
            this.searchButton.disabled = true;
            this.searchButton.classList.add('searching');
            if (icon) {
                icon.className = 'fas fa-spinner fa-spin';
            }
        } else {
            this.searchButton.disabled = false;
            this.searchButton.classList.remove('searching');
            if (icon) {
                icon.className = 'fas fa-search';
            }
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
        if (this.searchInput) {
            const placeholder = mode === 'rag'
              ? 'Ask a question about your documents...'
              : 'Search for specific content in your documents...';
            this.searchInput.placeholder = placeholder;
        }

        console.log(`Search mode set to: ${mode}`);
    }

    clearResults() {
        if (!this.searchResults) return;

        this.searchResults.innerHTML = `
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
                            <li>Upload various document types: PDF, Word, Excel, PowerPoint, Text, Markdown, and more</li>
                            <li>Ask questions about your documents using AI</li>
                            <li>Search for specific content across all documents</li>
                            <li>Get AI-powered answers with source citations</li>
                            <li>Process images with OCR for text extraction</li>
                        </ul>
                        <p class="text-muted">
                            <strong>Tip:</strong> Use the search input above to find information in your documents.
                        </p>
                    </div>
                </div>
            </div>
        `;

        // Clear search input
        if (this.searchInput) {
            this.searchInput.value = '';
        }

        console.log('Search results cleared');
    }

    getMaxResults() {
        const maxResultsSelect = document.getElementById('maxResults');
        return maxResultsSelect ? parseInt(maxResultsSelect.value) || 10 : 10;
    }

    getSearchFilters() {
        const docTypeFilter = document.getElementById('filterDocType');
        const categoryFilter = document.getElementById('filterCategory');

        const filters = {};

        if (docTypeFilter && docTypeFilter.value) {
            filters.file_type = docTypeFilter.value;
        }

        if (categoryFilter && categoryFilter.value) {
            filters.category = categoryFilter.value;
        }

        return filters;
    }

    // Public API methods
    performSearch(query, mode = null) {
        if (this.searchInput) {
            this.searchInput.value = query;
        }

        if (mode) {
            this.setSearchMode(mode);
        }

        const event = new Event('submit');
        return this.handleSubmit(event);
    }

    getSearchCount() {
        return this.searchCount;
    }
}

// Global functions for HTML onclick handlers
window.clearSearchResults = function() {
    if (window.searchManager) {
        window.searchManager.clearResults();
    }
};

window.setSearchMode = function(mode) {
    if (window.searchManager) {
        window.searchManager.setSearchMode(mode);
    }
};

window.resetSearchFilters = function() {
    const docTypeFilter = document.getElementById('filterDocType');
    const categoryFilter = document.getElementById('filterCategory');
    const maxResults = document.getElementById('maxResults');

    if (docTypeFilter) docTypeFilter.value = '';
    if (categoryFilter) categoryFilter.value = '';
    if (maxResults) maxResults.value = '10';

    if (window.showStatus) {
        window.showStatus('Search filters reset', 'success');
    }
};

// Export for backward compatibility
window.ChatManager = SearchManager;

console.log('SearchManager (formerly ChatManager) class loaded');