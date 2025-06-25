// Global utility functions for RAG Search Application

// Search mode management
window.setSearchMode = function(mode) {
    if (window.searchManager && window.searchManager.setSearchMode) {
        window.searchManager.setSearchMode(mode);
    }

    if (window.chatManager && window.chatManager.setSearchMode) {
        window.chatManager.setSearchMode(mode);
    }

    console.log(`Search mode set to: ${mode}`);
};

// Advanced search panel toggle
window.toggleAdvancedSearch = function() {
    const panel = document.getElementById('advancedSearchPanel');
    const button = document.querySelector('[onclick="toggleAdvancedSearch()"]');

    if (panel) {
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';

        if (button) {
            button.classList.toggle('active', !isVisible);
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = !isVisible ? 'fas fa-cog fa-spin' : 'fas fa-cog';
            }
        }

        // Animate panel
        if (!isVisible) {
            panel.style.opacity = '0';
            panel.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                panel.style.opacity = '1';
                panel.style.transform = 'translateY(0)';
                panel.style.transition = 'all 0.3s ease';
            }, 10);
        }
    }
};

// Apply advanced search filters
window.applyAdvancedSearch = function() {
    if (window.advancedSearchManager) {
        window.advancedSearchManager.updateFilters();

        // Show filter indicator
        const activeFilters = window.advancedSearchManager.getActiveFilters();
        const filterCount = Object.keys(activeFilters).filter(key => activeFilters[key]).length;

        if (filterCount > 0) {
            showFilterIndicator(filterCount);
        } else {
            hideFilterIndicator();
        }
    }

    // Trigger search if there's a current query
    const searchInput = document.getElementById('searchInput') || document.getElementById('messageInput');
    if (searchInput && searchInput.value.trim()) {
        const form = document.getElementById('searchForm') || document.getElementById('chatForm');
        if (form) {
            const event = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(event);
        }
    }

    // Show success message
    if (window.showStatus) {
        window.showStatus('Search filters applied', 'success');
    }
};

// Reset search filters
window.resetSearchFilters = function() {
    if (window.advancedSearchManager) {
        window.advancedSearchManager.resetFilters();
    }

    // Reset UI elements
    const docTypeFilter = document.getElementById('filterDocType');
    const categoryFilter = document.getElementById('filterCategory');
    const maxResults = document.getElementById('maxResults');

    if (docTypeFilter) docTypeFilter.value = '';
    if (categoryFilter) categoryFilter.value = '';
    if (maxResults) maxResults.value = '10';

    // Hide filter indicator
    hideFilterIndicator();

    if (window.showStatus) {
        window.showStatus('Search filters reset', 'success');
    }
};

function showFilterIndicator(count) {
    let indicator = document.querySelector('.filter-indicator');

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'filter-indicator';

        const searchHeader = document.querySelector('.search-section .section-header');
        if (searchHeader) {
            searchHeader.appendChild(indicator);
        }
    }

    indicator.innerHTML = `
        <i class="fas fa-filter"></i>
        <span class="filter-count">${count} filter${count !== 1 ? 's' : ''} active</span>
        <button class="btn btn-sm btn-ghost" onclick="resetSearchFilters()" title="Clear filters">
            <i class="fas fa-times"></i>
        </button>
    `;

    indicator.style.display = 'flex';
}

function hideFilterIndicator() {
    const indicator = document.querySelector('.filter-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// Help modal management
window.showHelp = function() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.classList.add('modal-open');

        // Focus trap for accessibility
        const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
    }
};

window.hideHelp = function() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    }
};

// Document management functions
window.retryLoadDocument = function() {
    if (window.documentManager && window.documentManager.retryLoadDocument) {
        window.documentManager.retryLoadDocument();
    } else {
        // Fallback: reload the document viewer
        const iframe = document.getElementById('documentViewerIframe');
        if (iframe && iframe.src) {
            iframe.src = iframe.src;
        }
    }
};

window.downloadDocument = function() {
    if (window.documentManager && window.documentManager.downloadCurrentDocument) {
        window.documentManager.downloadCurrentDocument();
    } else {
        console.warn('Document download not available');
        if (window.showStatus) {
            window.showStatus('Download not available', 'warning');
        }
    }
};

// Theme management
window.toggleTheme = function() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('rag_theme', newTheme);

    // Update theme icon
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }

    // Dispatch theme change event
    const event = new CustomEvent('themeChanged', { detail: { theme: newTheme } });
    document.dispatchEvent(event);

    if (window.showStatus) {
        window.showStatus(`Switched to ${newTheme} theme`, 'success');
    }
};

// Initialize theme on load
window.initializeTheme = function() {
    const savedTheme = localStorage.getItem('rag_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.className = savedTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
};

// Connection status management
window.checkConnection = function() {
    if (window.ragApp && window.ragApp.checkConnection) {
        return window.ragApp.checkConnection();
    }

    // Fallback connection check
    return fetch(window.API_BASE_URL + '/health', {
        method: 'GET',
        timeout: 5000
    }).then(response => {
        const isConnected = response.ok;
        updateConnectionStatus(isConnected);
        return isConnected;
    }).catch(error => {
        console.error('Connection check failed:', error);
        updateConnectionStatus(false);
        return false;
    });
};

function updateConnectionStatus(isConnected) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (statusDot && statusText) {
        if (isConnected) {
            statusDot.className = 'connection-dot connected';
            statusText.textContent = 'Connected';
        } else {
            statusDot.className = 'connection-dot disconnected';
            statusText.textContent = 'Disconnected';
        }
    }
}

// Statistics management
window.loadStats = function() {
    if (window.ragApp && window.ragApp.refreshStats) {
        window.ragApp.refreshStats();
    } else if (window.statsManager && window.statsManager.loadStats) {
        window.statsManager.loadStats();
    } else {
        console.warn('Stats loading not available');
    }
};

// Clear functions
window.clearChat = function() {
    if (window.searchManager && window.searchManager.clearResults) {
        window.searchManager.clearResults();
    } else if (window.chatManager && window.chatManager.clearChat) {
        window.chatManager.clearChat();
    }
};

window.clearSearchResults = function() {
    const resultsContainer = document.getElementById('searchResults');
    if (resultsContainer) {
        // Fade out animation
        resultsContainer.style.opacity = '0.5';
        resultsContainer.style.transition = 'opacity 0.3s ease';

        setTimeout(() => {
            resultsContainer.innerHTML = `
                <div class="welcome-message">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">
                                <i class="fas fa-search"></i> Ready to Search
                            </h3>
                        </div>
                        <div class="card-body">
                            <p>Enter a query above to search your documents or ask questions using AI.</p>
                        </div>
                    </div>
                </div>
            `;
            resultsContainer.style.opacity = '1';
        }, 300);
    }

    if (window.showStatus) {
        window.showStatus('Search results cleared', 'success');
    }
};

// Search history management
window.showSearchHistory = function() {
    if (window.searchManager && window.searchManager.showSearchHistory) {
        window.searchManager.showSearchHistory();
    } else {
        console.warn('Search history not available');
    }
};

// Document viewer functions
window.openDocumentViewer = function(documentId) {
    if (window.documentManager && window.documentManager.openDocumentViewer) {
        window.documentManager.openDocumentViewer(documentId);
    } else {
        console.warn('Document viewer not available');
    }
};

window.closeDocumentViewer = function() {
    const modal = document.getElementById('documentViewerModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    }
};

// Keyboard shortcuts
window.initializeKeyboardShortcuts = function() {
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput') || document.getElementById('messageInput');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }

        // Ctrl/Cmd + L: Clear results
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault();
            clearSearchResults();
        }

        // Ctrl/Cmd + /: Show help
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            showHelp();
        }

        // Escape: Close modals and dropdowns
        if (e.key === 'Escape') {
            // Close modals
            const modals = document.querySelectorAll('.modal[style*="display: block"], .modal.show');
            modals.forEach(modal => {
                modal.style.display = 'none';
            });
            document.body.classList.remove('modal-open');

            // Hide advanced search panel
            const advancedPanel = document.getElementById('advancedSearchPanel');
            if (advancedPanel && advancedPanel.style.display === 'block') {
                toggleAdvancedSearch();
            }

            // Hide suggestions
            const suggestions = document.querySelectorAll('.search-suggestions-dropdown');
            suggestions.forEach(dropdown => {
                dropdown.style.display = 'none';
            });
        }
    });
};

// Utility functions
window.formatFileSize = function(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

window.formatRelativeTime = function(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days !== 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    return 'Just now';
};

window.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

window.escapeHtml = function(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

// Error handling
window.handleGlobalError = function(error, context = '') {
    console.error(`Global error ${context}:`, error);

    if (window.showStatus) {
        window.showStatus(`An error occurred${context ? ' ' + context : ''}: ${error.message}`, 'error');
    }

    // Track error if analytics available
    if (window.ragApp && window.ragApp.trackEvent) {
        window.ragApp.trackEvent('error', 'global_error', error.message, 1);
    }
};

// Performance monitoring
window.measurePerformance = function(name, fn) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    const duration = end - start;

    console.log(`Performance: ${name} took ${duration.toFixed(2)}ms`);

    // Track performance if analytics available
    if (window.ragApp && window.ragApp.trackEvent) {
        window.ragApp.trackEvent('performance', name, '', Math.round(duration));
    }

    return result;
};

// Initialize global functionality
window.initializeGlobals = function() {
    console.log('Initializing global functions...');

    // Initialize theme
    initializeTheme();

    // Initialize keyboard shortcuts
    initializeKeyboardShortcuts();

    // Check connection periodically
    checkConnection();
    setInterval(checkConnection, 30000); // Every 30 seconds

    // Load initial stats
    setTimeout(loadStats, 1000);

    // Set up modal close handlers
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
            document.body.classList.remove('modal-open');
        }

        if (e.target.classList.contains('close') || e.target.classList.contains('modal-close')) {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        }
    });

    // Handle online/offline status
    window.addEventListener('online', function() {
        if (window.showStatus) {
            window.showStatus('Connection restored', 'success');
        }
        checkConnection();
    });

    window.addEventListener('offline', function() {
        if (window.showStatus) {
            window.showStatus('Connection lost', 'warning');
        }
        updateConnectionStatus(false);
    });

    console.log('Global functions initialized');
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGlobals);
} else {
    initializeGlobals();
}

console.log('Global functions loaded');