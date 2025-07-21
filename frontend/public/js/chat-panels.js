// Chat Panel Management
let currentChatPanel = 'rag'
let chatHistories = {
    rag: [],
    search: []
}

// Auto-save timeout for configuration
let saveTimeout

// Store original functions for safe overriding
const originalClearChat = window.clearChat

// Switch between chat panels
function switchChatPanel(panelType) {
    console.log('Switching to panel:', panelType)

    // Update current panel
    currentChatPanel = panelType

    // Update tab buttons
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.classList.remove('active')
    })
    const tabElement = document.getElementById(panelType + 'Tab')
    if (tabElement) {
        tabElement.classList.add('active')
    }

    // Update panels
    document.querySelectorAll('.chat-panel').forEach(panel => {
        panel.classList.remove('active')
    })
    const panelElement = document.getElementById(panelType + 'Panel')
    if (panelElement) {
        panelElement.classList.add('active')
    }

    // Update search mode for backward compatibility
    if (window.setSearchMode) {
        window.setSearchMode(panelType === 'rag' ? 'rag' : 'search')
    }

    // Update the legacy elements to maintain compatibility
    updateLegacyElements(panelType)

    // Focus on the appropriate input
    const inputId = panelType === 'rag' ? 'ragMessageInput' : 'searchMessageInput'
    const input = document.getElementById(inputId)
    if (input) {
        input.focus()
    }

    // Load chat history for the panel
    loadChatHistory(panelType)
}

// Update legacy elements for backward compatibility
function updateLegacyElements(panelType) {
    const legacyInput = document.getElementById('messageInput')
    const legacyContainer = document.getElementById('chatContainer')

    // Point legacy elements to current panel elements
    const currentInput = document.getElementById(panelType === 'rag' ? 'ragMessageInput' : 'searchMessageInput')
    const currentContainer = document.getElementById(panelType === 'rag' ? 'ragChatContainer' : 'searchChatContainer')

    if (legacyInput && currentInput) {
        legacyInput.value = currentInput.value
    }

    if (legacyContainer && currentContainer) {
        // Sync the container reference for existing scripts
        legacyContainer.innerHTML = currentContainer.innerHTML
    }
}

// Load chat history for a specific panel
function loadChatHistory(panelType) {
    const containerId = panelType === 'rag' ? 'ragChatContainer' : 'searchChatContainer'
    const container = document.getElementById(containerId)

    if (!container) return

    // Keep welcome message, don't clear it
    const welcomeMessage = container.querySelector('.welcome-message')

    // Clear other messages
    const messages = container.querySelectorAll('.message')
    messages.forEach(msg => msg.remove())

    // Load history from storage or memory
    const history = chatHistories[panelType] || []
    history.forEach(message => {
        appendMessageToPanel(message, panelType)
    })
}

// Append message to specific panel
function appendMessageToPanel(message, panelType) {
    const containerId = panelType === 'rag' ? 'ragChatContainer' : 'searchChatContainer'
    const container = document.getElementById(containerId)

    if (!container) return

    const messageEl = document.createElement('div')
    messageEl.className = `message ${message.type}`
    messageEl.innerHTML = message.content

    container.appendChild(messageEl)
    container.scrollTop = container.scrollHeight
}

// Clear chat for specific panel - FIXED to prevent recursion
function clearChatPanel(panelType) {
    if (!panelType) {
        panelType = currentChatPanel
    }

    const containerId = panelType === 'rag' ? 'ragChatContainer' : 'searchChatContainer'
    const container = document.getElementById(containerId)

    if (!container) return

    // Clear messages except welcome message
    const messages = container.querySelectorAll('.message')
    messages.forEach(msg => msg.remove())

    // Clear history
    chatHistories[panelType] = []

    // Clear legacy container too
    const legacyContainer = document.getElementById('chatContainer')
    if (legacyContainer) {
        const legacyMessages = legacyContainer.querySelectorAll('.message')
        legacyMessages.forEach(msg => msg.remove())
    }

    // Show success notification
    if (window.showNotification) {
        window.showNotification('Chat cleared successfully', 'success')
    }
}

// Toggle advanced search for specific panel
function toggleAdvancedSearch(panelType) {
    if (!panelType) {
        panelType = currentChatPanel
    }

    const panelId = panelType === 'rag' ? 'ragAdvancedSearchPanel' : 'searchAdvancedSearchPanel'
    const panel = document.getElementById(panelId)

    if (!panel) {
        console.warn('Advanced search panel not found:', panelId)
        return
    }

    const isVisible = panel.style.display !== 'none'
    panel.style.display = isVisible ? 'none' : 'block'

    // Update button state if event exists
    if (typeof event !== 'undefined' && event.target) {
        const button = event.target.closest('button')
        if (button) {
            button.classList.toggle('active', !isVisible)
        }
    }
}

// Toggle OpenAI settings visibility
function toggleOpenAISettings() {
    const checkbox = document.getElementById('ragUseOpenAI')
    const settings = document.getElementById('ragOpenAISettings')
    const label = document.getElementById('ragProviderLabel')

    if (!checkbox || !settings || !label) {
        console.warn('OpenAI settings elements not found')
        return
    }

    if (checkbox.checked) {
        settings.style.display = 'block'
        label.textContent = 'Using OpenAI API'
        label.style.color = '#4CAF50'

        // Auto-save configuration
        autoSaveRagConfig()

        // Show notification
        if (window.showNotification) {
            window.showNotification('Switched to OpenAI API', 'success')
        }
    } else {
        settings.style.display = 'none'
        label.textContent = 'Using Ollama (Local)'
        label.style.color = ''

        // Auto-save configuration
        autoSaveRagConfig()

        // Show notification
        if (window.showNotification) {
            window.showNotification('Switched to local Ollama LLM', 'success')
        }
    }
}

// Toggle API key visibility
function toggleAPIKeyVisibility(inputId) {
    const input = document.getElementById(inputId)
    const icon = document.getElementById(inputId + 'Toggle')

    if (!input || !icon) {
        console.warn('API key toggle elements not found:', inputId)
        return
    }

    if (input.type === 'password') {
        input.type = 'text'
        icon.className = 'fas fa-eye-slash'
    } else {
        input.type = 'password'
        icon.className = 'fas fa-eye'
    }
}

// Get RAG configuration including OpenAI settings
function getRagConfiguration() {
    const useOpenAI = document.getElementById('ragUseOpenAI')
    const responseLength = document.getElementById('ragResponseLength')
    const contextDepth = document.getElementById('ragContextDepth')
    const citations = document.getElementById('ragCitations')
    const filterDocType = document.getElementById('ragFilterDocType')
    const filterCategory = document.getElementById('ragFilterCategory')

    const config = {
        responseLength: responseLength ? responseLength.value : 'medium',
        contextDepth: contextDepth ? contextDepth.value : 'balanced',
        citations: citations ? citations.value : 'standard',
        filterDocType: filterDocType ? filterDocType.value : '',
        filterCategory: filterCategory ? filterCategory.value : '',
        useOpenAI: useOpenAI ? useOpenAI.checked : false
    }

    if (config.useOpenAI) {
        const openAIKey = document.getElementById('ragOpenAIKey')
        const openAIModel = document.getElementById('ragOpenAIModel')
        const openAITemperature = document.getElementById('ragOpenAITemperature')

        config.openAI = {
    api_key: openAIKey ? openAIKey.value : '',
    model: openAIModel ? openAIModel.value : 'gpt-4-turbo',
    temperature: openAITemperature ? parseFloat(openAITemperature.value) : 0.3
}
    }

    return config
}

// Validate OpenAI settings
function validateOpenAISettings() {
    const useOpenAI = document.getElementById('ragUseOpenAI')

    if (!useOpenAI || !useOpenAI.checked) {
        return true
    }

    const apiKey = document.getElementById('ragOpenAIKey')
    if (!apiKey || !apiKey.value.trim()) {
        if (window.showNotification) {
            window.showNotification('Please enter your OpenAI API key', 'error')
        }
        return false
    }

    if (!apiKey.value.trim().startsWith('sk-')) {
        if (window.showNotification) {
            window.showNotification('Invalid OpenAI API key format', 'error')
        }
        return false
    }

    // Show that OpenAI will be used
    if (window.showNotification) {
        const model = document.getElementById('ragOpenAIModel')
        const modelName = model ? model.value : 'gpt-4-turbo'
        window.showNotification(`OpenAI ${modelName} will be used for responses`, 'info')
    }

    return true
}

// Reset advanced search for specific panel
function resetAdvancedSearch(panelType) {
    if (!panelType) {
        panelType = currentChatPanel
    }

    // Reset form elements based on panel type
    if (panelType === 'rag') {
        const responseLength = document.getElementById('ragResponseLength')
        const contextDepth = document.getElementById('ragContextDepth')
        const citations = document.getElementById('ragCitations')
        const filterDocType = document.getElementById('ragFilterDocType')
        const filterCategory = document.getElementById('ragFilterCategory')
        const useOpenAI = document.getElementById('ragUseOpenAI')
        const openAIKey = document.getElementById('ragOpenAIKey')
        const openAIModel = document.getElementById('ragOpenAIModel')
        const openAITemperature = document.getElementById('ragOpenAITemperature')

        if (responseLength) responseLength.value = 'medium'
        if (contextDepth) contextDepth.value = 'balanced'
        if (citations) citations.value = 'standard'
        if (filterDocType) filterDocType.value = ''
        if (filterCategory) filterCategory.value = ''
        if (useOpenAI) {
            useOpenAI.checked = false
            toggleOpenAISettings()
        }
        if (openAIKey) openAIKey.value = ''
        if (openAIModel) openAIModel.value = 'gpt-4-turbo'
        if (openAITemperature) openAITemperature.value = '0.3'

        // Clear stored configuration
        localStorage.removeItem('ragConfig')
        window.ragConfig = null
    } else {
        const searchType = document.getElementById('searchType')
        const maxResults = document.getElementById('searchMaxResults')
        const sortBy = document.getElementById('searchSortBy')
        const filterDocType = document.getElementById('searchFilterDocType')
        const filterCategory = document.getElementById('searchFilterCategory')
        const dateRange = document.getElementById('searchDateRange')

        if (searchType) searchType.value = 'semantic'
        if (maxResults) maxResults.value = '10'
        if (sortBy) sortBy.value = 'relevance'
        if (filterDocType) filterDocType.value = ''
        if (filterCategory) filterCategory.value = ''
        if (dateRange) dateRange.value = ''
    }

    if (window.showNotification) {
        window.showNotification('Advanced search settings reset', 'info')
    }
}

// Apply advanced search for specific panel
function applyAdvancedSearch(panelType) {
    if (!panelType) {
        panelType = currentChatPanel
    }

    // Get settings based on panel type
    let settings = {}

    if (panelType === 'rag') {
        // Validate OpenAI settings first
        if (!validateOpenAISettings()) {
            return
        }

        const config = getRagConfiguration()

        // Store configuration for use in RAG requests
        window.ragConfig = config

        // Save to localStorage for persistence
        localStorage.setItem('ragConfig', JSON.stringify(config))

        settings = config

        // Show which provider will be used
        if (window.showNotification) {
            const provider = config.useOpenAI ? `OpenAI (${config.openAI.model})` : 'Ollama (Local)'
            window.showNotification(`RAG settings applied - Using ${provider}`, 'success')
        }
    } else {
        // Search panel settings (unchanged)
        const searchType = document.getElementById('searchType')
        const maxResults = document.getElementById('searchMaxResults')
        const sortBy = document.getElementById('searchSortBy')
        const filterDocType = document.getElementById('searchFilterDocType')
        const filterCategory = document.getElementById('searchFilterCategory')
        const dateRange = document.getElementById('searchDateRange')

        settings = {
            searchType: searchType ? searchType.value : 'semantic',
            maxResults: maxResults ? maxResults.value : '10',
            sortBy: sortBy ? sortBy.value : 'relevance',
            docType: filterDocType ? filterDocType.value : '',
            category: filterCategory ? filterCategory.value : '',
            dateRange: dateRange ? dateRange.value : ''
        }

        if (window.showNotification) {
            window.showNotification('Search settings applied successfully', 'success')
        }
    }

    // Store settings globally for use in search
    window.currentAdvancedSettings = {
        panel: panelType,
        ...settings
    }

    // Hide the panel
    toggleAdvancedSearch(panelType)
}


// Load saved RAG configuration on page load
function loadSavedRagConfig() {
    const saved = localStorage.getItem('ragConfig')
    if (saved) {
        try {
            const config = JSON.parse(saved)

            // Restore basic settings
            const responseLength = document.getElementById('ragResponseLength')
            const contextDepth = document.getElementById('ragContextDepth')
            const citations = document.getElementById('ragCitations')
            const filterDocType = document.getElementById('ragFilterDocType')
            const filterCategory = document.getElementById('ragFilterCategory')
            const useOpenAI = document.getElementById('ragUseOpenAI')
            const openAIKey = document.getElementById('ragOpenAIKey')
            const openAIModel = document.getElementById('ragOpenAIModel')
            const openAITemperature = document.getElementById('ragOpenAITemperature')

            if (responseLength) responseLength.value = config.responseLength || 'medium'
            if (contextDepth) contextDepth.value = config.contextDepth || 'balanced'
            if (citations) citations.value = config.citations || 'standard'
            if (filterDocType) filterDocType.value = config.filterDocType || ''
            if (filterCategory) filterCategory.value = config.filterCategory || ''

            // Restore OpenAI settings
            if (config.useOpenAI && useOpenAI) {
                useOpenAI.checked = true
                toggleOpenAISettings()

                if (config.openAI) {
                    if (openAIKey) openAIKey.value = config.openAI.apiKey || ''
                    if (openAIModel) openAIModel.value = config.openAI.model || 'gpt-4-turbo'
                    if (openAITemperature) openAITemperature.value = config.openAI.temperature || '0.3'
                }
            }

            window.ragConfig = config
        } catch (e) {
            console.error('Error loading saved RAG config:', e)
        }
    }
}

// Show search history for specific panel
function showSearchHistory(panelType) {
    if (!panelType) {
        panelType = currentChatPanel
    }

    const history = chatHistories[panelType] || []
    const userHistory = history.filter(h => h.type === 'user')

    if (userHistory.length === 0) {
        if (window.showNotification) {
            window.showNotification('No search history available', 'info')
        }
        return
    }

    // Create and show history modal
    const modal = document.createElement('div')
    modal.className = 'modal'
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Search History - ${panelType.toUpperCase()}</h3>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="search-history-list">
                    ${userHistory.map(h => `
                        <div class="history-item" onclick="fillSearchInput('${h.query.replace(/'/g, "\\'")}', '${panelType}')">
                            <i class="fas fa-search"></i>
                            <span>${h.query}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `

    document.body.appendChild(modal)
    modal.style.display = 'block'
}

// Fill search input with historical query
function fillSearchInput(query, panelType) {
    const inputId = panelType === 'rag' ? 'ragMessageInput' : 'searchMessageInput'
    const input = document.getElementById(inputId)

    if (input) {
        input.value = query
        input.focus()
    }

    // Close modal
    const modal = document.querySelector('.modal')
    if (modal) {
        modal.remove()
    }
}

// Handle RAG form submission
function handleRagFormSubmit(event) {
    event.preventDefault()
    event.stopPropagation()

    const input = document.getElementById('ragMessageInput')
    const message = input.value.trim()

    if (!message) return

    // Check if this message was already processed recently (prevent duplicates)
    const now = Date.now()
    const lastMessage = chatHistories.rag[chatHistories.rag.length - 1]
    if (lastMessage && lastMessage.query === message && (now - lastMessage.timestamp.getTime()) < 1000) {
        console.log('Duplicate message detected, skipping')
        return
    }

    console.log('RAG form submit:', message)

    // Add to chat history
    chatHistories.rag.push({
        type: 'user',
        query: message,
        content: `<div class="message-content">${message}</div>`,
        timestamp: new Date()
    })

    // Clear input immediately
    input.value = ''

    // Ensure we stay in RAG mode
    currentChatPanel = 'rag'

    // Set search mode to RAG BEFORE processing
    if (window.setSearchMode) {
        window.setSearchMode('rag')
    }

    // Small delay to ensure mode is set
    setTimeout(() => {
        // Use only ONE message handler to prevent duplicates
        if (window.chatManager && typeof window.chatManager.handleSubmit === 'function') {
            // Use the ChatManager directly
            const originalInput = window.chatManager.messageInput
            if (originalInput) {
                originalInput.value = message
                const syntheticEvent = {
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    target: originalInput
                }
                window.chatManager.handleSubmit(syntheticEvent)
            }
        } else if (window.handleMessage && typeof window.handleMessage === 'function') {
            // Fallback to legacy handler
            window.handleMessage(message)
        } else {
            console.error('No message handler found')
        }
    }, 50)
}

// Handle Search form submission
function handleSearchFormSubmit(event) {
    event.preventDefault()
    event.stopPropagation()

    const input = document.getElementById('searchMessageInput')
    const message = input.value.trim()

    if (!message) return

    // Check if this message was already processed recently (prevent duplicates)
    const now = Date.now()
    const lastMessage = chatHistories.search[chatHistories.search.length - 1]
    if (lastMessage && lastMessage.query === message && (now - lastMessage.timestamp.getTime()) < 1000) {
        console.log('Duplicate message detected, skipping')
        return
    }

    console.log('Search form submit:', message)

    // Add to chat history
    chatHistories.search.push({
        type: 'user',
        query: message,
        content: `<div class="message-content">${message}</div>`,
        timestamp: new Date()
    })

    // Clear input immediately
    input.value = ''

    // Ensure we stay in search mode
    currentChatPanel = 'search'

    // Set search mode to search BEFORE processing
    if (window.setSearchMode) {
        window.setSearchMode('search')
    }

    // Small delay to ensure mode is set
    setTimeout(() => {
        // Use only ONE message handler to prevent duplicates
        if (window.chatManager && typeof window.chatManager.handleSubmit === 'function') {
            // Use the ChatManager directly
            const originalInput = window.chatManager.messageInput
            if (originalInput) {
                originalInput.value = message
                const syntheticEvent = {
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    target: originalInput
                }
                window.chatManager.handleSubmit(syntheticEvent)
            }
        } else if (window.handleMessage && typeof window.handleMessage === 'function') {
            // Fallback to legacy handler
            window.handleMessage(message)
        } else {
            console.error('No message handler found')
        }
    }, 50)
}

// Handle textarea enter key
function handleTextareaKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()

        const form = event.target.closest('form')
        if (form) {
            // Just trigger the form submit event, don't call handlers directly
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
            form.dispatchEvent(submitEvent)
        }
    }
}

// Handle keyboard shortcuts
function handleKeyboardShortcuts(event) {
    if (event.ctrlKey || event.metaKey) {
        switch(event.key) {
            case 'k':
                event.preventDefault()
                const activeInput = currentChatPanel === 'rag' ?
                    document.getElementById('ragMessageInput') :
                    document.getElementById('searchMessageInput')
                if (activeInput) activeInput.focus()
                break
            case 'l':
                event.preventDefault()
                clearChatPanel(currentChatPanel)
                break
            case '1':
                event.preventDefault()
                switchChatPanel('rag')
                break
            case '2':
                event.preventDefault()
                switchChatPanel('search')
                break
        }
    }
}

// Load categories for both panels
function loadCategoriesForPanels() {
    // This would typically load from your backend
    const categories = ['General', 'Technical', 'Legal', 'Financial', 'Medical']

    const ragCategorySelect = document.getElementById('ragFilterCategory')
    const searchCategorySelect = document.getElementById('searchFilterCategory')

    ;[ragCategorySelect, searchCategorySelect].forEach(select => {
        if (select) {
            // Clear existing options except first one
            const firstOption = select.querySelector('option')
            select.innerHTML = ''
            if (firstOption) {
                select.appendChild(firstOption)
            }

            categories.forEach(category => {
                const option = document.createElement('option')
                option.value = category.toLowerCase()
                option.textContent = category
                select.appendChild(option)
            })
        }
    })
}

// Get current active input (for backward compatibility)
function getCurrentActiveInput() {
    return currentChatPanel === 'rag' ?
        document.getElementById('ragMessageInput') :
        document.getElementById('searchMessageInput')
}

// Get current active container (for backward compatibility)
function getCurrentActiveContainer() {
    return currentChatPanel === 'rag' ?
        document.getElementById('ragChatContainer') :
        document.getElementById('searchChatContainer')
}

// Setup event listeners for panels
function setupPanelEventListeners() {
    // RAG form submission
    const ragForm = document.getElementById('ragChatForm')
    if (ragForm) {
        ragForm.addEventListener('submit', handleRagFormSubmit)
    }

    // Search form submission
    const searchForm = document.getElementById('searchChatForm')
    if (searchForm) {
        searchForm.addEventListener('submit', handleSearchFormSubmit)
    }

    // Textarea keydown events
    const ragInput = document.getElementById('ragMessageInput')
    if (ragInput) {
        ragInput.addEventListener('keydown', handleTextareaKeydown)
    }

    const searchInput = document.getElementById('searchMessageInput')
    if (searchInput) {
        searchInput.addEventListener('keydown', handleTextareaKeydown)
    }

    // Global keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts)

    // Load categories
    loadCategoriesForPanels()
}

// Auto-save RAG configuration
function autoSaveRagConfig() {
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
        try {
            const config = getRagConfiguration()
            window.ragConfig = config
            localStorage.setItem('ragConfig', JSON.stringify(config))
        } catch (error) {
            console.error('Error auto-saving RAG config:', error)
        }
    }, 1000)
}

// Enhanced clear chat function that safely handles all scenarios
function safeClearChat(panelType) {
    try {
        // If no panelType provided, use current panel
        if (!panelType) {
            panelType = currentChatPanel
        }

        // Clear the specific panel
        clearChatPanel(panelType)

        // Clear chat manager if it exists
        if (window.chatManager && typeof window.chatManager.clearChat === 'function') {
            // Call with a flag to prevent recursion
            window.chatManager.clearChat(true)
        }

        // Clear search manager if it exists
        if (window.searchManager && typeof window.searchManager.clearChat === 'function') {
            window.searchManager.clearChat()
        }

        console.log(`Chat cleared for panel: ${panelType}`)
    } catch (error) {
        console.error('Error in safeClearChat:', error)

        // Fallback: just clear the DOM elements
        try {
            const containers = [
                'ragChatContainer',
                'searchChatContainer',
                'chatContainer'
            ]

            containers.forEach(containerId => {
                const container = document.getElementById(containerId)
                if (container) {
                    const messages = container.querySelectorAll('.message')
                    messages.forEach(msg => msg.remove())
                }
            })
        } catch (fallbackError) {
            console.error('Fallback clear also failed:', fallbackError)
        }
    }
}

// Integration with existing chat system
function integrateChatPanels() {
    // Override the original handleMessage function to work with panels
    const originalHandleMessage = window.handleMessage

    window.handleMessage = function(message, panelType) {
        // If panelType is not specified, use current panel
        if (!panelType) {
            panelType = currentChatPanel
        }

        // Update the message input for compatibility
        const messageInput = document.getElementById('messageInput')
        if (messageInput) {
            messageInput.value = message
        }

        // Set the search mode based on panel
        if (window.setSearchMode) {
            window.setSearchMode(panelType === 'rag' ? 'rag' : 'search')
        }

        // Call the original handler
        if (originalHandleMessage && typeof originalHandleMessage === 'function') {
            originalHandleMessage(message)
        }
    }

    // Override addMessage to work with current panel
    const originalAddMessage = window.addMessage

    window.addMessage = function(type, content, metadata) {
        const currentPanel = currentChatPanel
        const containerId = currentPanel === 'rag' ? 'ragChatContainer' : 'searchChatContainer'
        const container = document.getElementById(containerId)

        if (!container) {
            // Fallback to original function
            if (originalAddMessage && typeof originalAddMessage === 'function') {
                return originalAddMessage(type, content, metadata)
            }
            return
        }

        // Create message element
        const messageEl = document.createElement('div')
        messageEl.className = `message ${type}`

        if (metadata && metadata.isStreaming) {
            messageEl.innerHTML = `<div class="message-content streaming">${content}</div>`
        } else {
            messageEl.innerHTML = `<div class="message-content">${content}</div>`
        }

        container.appendChild(messageEl)
        container.scrollTop = container.scrollHeight

        // Also add to legacy container for compatibility
        const legacyContainer = document.getElementById('chatContainer')
        if (legacyContainer) {
            const legacyMessageEl = messageEl.cloneNode(true)
            legacyContainer.appendChild(legacyMessageEl)
            legacyContainer.scrollTop = legacyContainer.scrollHeight
        }

        // Add to chat history
        if (chatHistories[currentPanel]) {
            chatHistories[currentPanel].push({
                type: type,
                content: content,
                timestamp: new Date(),
                metadata: metadata
            })
        }

        return messageEl
    }

    console.log('Chat panels integration completed')
}

// === IMMEDIATELY EXPORT ALL FUNCTIONS TO WINDOW ===
// This prevents the "toggleAdvancedSearch is not defined" error
window.switchChatPanel = switchChatPanel
window.clearChatPanel = clearChatPanel
window.toggleAdvancedSearch = toggleAdvancedSearch
window.resetAdvancedSearch = resetAdvancedSearch
window.applyAdvancedSearch = applyAdvancedSearch
window.showSearchHistory = showSearchHistory
window.fillSearchInput = fillSearchInput
window.handleRagFormSubmit = handleRagFormSubmit
window.handleSearchFormSubmit = handleSearchFormSubmit
window.handleTextareaKeydown = handleTextareaKeydown
window.handleKeyboardShortcuts = handleKeyboardShortcuts
window.loadCategoriesForPanels = loadCategoriesForPanels
window.toggleOpenAISettings = toggleOpenAISettings
window.toggleAPIKeyVisibility = toggleAPIKeyVisibility
window.getRagConfiguration = getRagConfiguration
window.validateOpenAISettings = validateOpenAISettings
window.loadSavedRagConfig = loadSavedRagConfig
window.setupPanelEventListeners = setupPanelEventListeners
window.autoSaveRagConfig = autoSaveRagConfig

// Export utility functions
window.getCurrentChatPanel = function() {
    return currentChatPanel
}

window.getCurrentInput = getCurrentActiveInput
window.getCurrentContainer = getCurrentActiveContainer

// Utility function to get current RAG configuration for use in API calls
window.getCurrentRagConfig = function() {
    return window.ragConfig || {
        responseLength: 'medium',
        contextDepth: 'balanced',
        citations: 'standard',
        useOpenAI: false
    }
}

// Utility function to check if OpenAI is enabled
window.isOpenAIEnabled = function() {
    const config = window.getCurrentRagConfig()
    return config.useOpenAI && config.openAI && config.openAI.apiKey
}

// Utility function to get OpenAI configuration
window.getOpenAIConfig = function() {
    const config = window.getCurrentRagConfig()
    if (config.useOpenAI && config.openAI) {
        return {
            apiKey: config.openAI.apiKey,
            model: config.openAI.model || 'gpt-4-turbo',
            temperature: config.openAI.temperature || 0.3
        }
    }
    return null
}

// Utility function to update RAG configuration from external sources
window.updateRagConfig = function(newConfig) {
    window.ragConfig = { ...window.ragConfig, ...newConfig }
    localStorage.setItem('ragConfig', JSON.stringify(window.ragConfig))
}

// Specific handler for RAG messages
window.handleRAGMessage = function(message) {
    console.log('Handling RAG message:', message)

    // Ensure we're in RAG mode
    if (window.setSearchMode) {
        window.setSearchMode('rag')
    }

    // Switch to RAG panel if not already there
    if (currentChatPanel !== 'rag') {
        switchChatPanel('rag')
    }

    // Call the chat manager with RAG mode
    if (window.chatManager) {
        window.chatManager.currentSearchMode = 'rag'
        window.chatManager.messageInput = document.getElementById('ragMessageInput')
        if (window.chatManager.messageInput) {
            window.chatManager.messageInput.value = message
            window.chatManager.handleSubmit(new Event('submit'))
        }
    }
}

// Specific handler for Search messages
window.handleSearchMessage = function(message) {
    console.log('Handling Search message:', message)

    // Ensure we're in search mode
    if (window.setSearchMode) {
        window.setSearchMode('search')
    }

    // Switch to search panel if not already there
    if (currentChatPanel !== 'search') {
        switchChatPanel('search')
    }

    // Call the chat manager with search mode
    if (window.chatManager) {
        window.chatManager.currentSearchMode = 'search'
        window.chatManager.messageInput = document.getElementById('searchMessageInput')
        if (window.chatManager.messageInput) {
            window.chatManager.messageInput.value = message
            window.chatManager.handleSubmit(new Event('submit'))
        }
    }
}

// Replace the problematic clearChat function
window.clearChat = safeClearChat

// Override global clearChat to prevent recursion
if (originalClearChat && typeof originalClearChat === 'function') {
    // Store reference to original for safe calling
    window.originalClearChat = originalClearChat
}

// Enhanced message handling that works with both panels
window.addMessageToCurrentPanel = function(type, content, metadata) {
    const currentPanel = currentChatPanel
    const containerId = currentPanel === 'rag' ? 'ragChatContainer' : 'searchChatContainer'
    const container = document.getElementById(containerId)

    if (!container) {
        console.warn('Container not found for panel:', currentPanel)
        return
    }

    // Create message element
    const messageEl = document.createElement('div')
    messageEl.className = `message ${type}`

    if (metadata && metadata.isStreaming) {
        messageEl.innerHTML = `<div class="message-content streaming">${content}</div>`
    } else {
        messageEl.innerHTML = `<div class="message-content">${content}</div>`
    }

    container.appendChild(messageEl)
    container.scrollTop = container.scrollHeight

    // Add to chat history
    if (chatHistories[currentPanel]) {
        chatHistories[currentPanel].push({
            type: type,
            content: content,
            timestamp: new Date(),
            metadata: metadata
        })
    }

    return messageEl
}

// Helper function to safely get element by ID
function safeGetElement(id) {
    try {
        return document.getElementById(id)
    } catch (error) {
        console.warn('Element not found:', id, error)
        return null
    }
}

// Enhanced panel switching with error handling
window.safeSwitchChatPanel = function(panelType) {
    try {
        if (!panelType || (panelType !== 'rag' && panelType !== 'search')) {
            console.warn('Invalid panel type:', panelType)
            return
        }

        switchChatPanel(panelType)
    } catch (error) {
        console.error('Error switching chat panel:', error)

        // Fallback to basic panel switching
        try {
            currentChatPanel = panelType

            // Update tabs
            const tabs = document.querySelectorAll('.chat-tab')
            tabs.forEach(tab => tab.classList.remove('active'))

            const activeTab = document.getElementById(panelType + 'Tab')
            if (activeTab) {
                activeTab.classList.add('active')
            }

            // Update panels
            const panels = document.querySelectorAll('.chat-panel')
            panels.forEach(panel => panel.classList.remove('active'))

            const activePanel = document.getElementById(panelType + 'Panel')
            if (activePanel) {
                activePanel.classList.add('active')
            }
        } catch (fallbackError) {
            console.error('Fallback panel switch also failed:', fallbackError)
        }
    }
}

// Initialize panels when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('Chat panels initializing...')

    try {
        // Load saved configuration first
        loadSavedRagConfig()

        // Set up RAG form
        const ragForm = document.getElementById('ragChatForm')
        const ragInput = document.getElementById('ragMessageInput')

        if (ragForm && ragInput) {
            ragForm.addEventListener('submit', handleRagFormSubmit)
            ragInput.addEventListener('keydown', handleTextareaKeydown)
        }

        // Set up Search form
        const searchForm = document.getElementById('searchChatForm')
        const searchInput = document.getElementById('searchMessageInput')

        if (searchForm && searchInput) {
            searchForm.addEventListener('submit', handleSearchFormSubmit)
            searchInput.addEventListener('keydown', handleTextareaKeydown)
        }

        // Add auto-save event listeners for OpenAI settings
        const openAIKey = document.getElementById('ragOpenAIKey')
        if (openAIKey) {
            openAIKey.addEventListener('input', autoSaveRagConfig)
        }

        const openAIModel = document.getElementById('ragOpenAIModel')
        if (openAIModel) {
            openAIModel.addEventListener('change', autoSaveRagConfig)
        }

        const openAITemperature = document.getElementById('ragOpenAITemperature')
        if (openAITemperature) {
            openAITemperature.addEventListener('change', autoSaveRagConfig)
        }

        const useOpenAI = document.getElementById('ragUseOpenAI')
        if (useOpenAI) {
            useOpenAI.addEventListener('change', function() {
                toggleOpenAISettings()
                autoSaveRagConfig()
            })
        }

        // Set up other event listeners
        setupPanelEventListeners()

        // Initialize default panel
        setTimeout(() => {
            switchChatPanel('rag')
        }, 100)

        console.log('Chat panels initialized successfully')
    } catch (error) {
        console.error('Error initializing chat panels:', error)
    }
})

// Initialize integration when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(integrateChatPanels, 200)
})

// Handle page visibility changes to maintain state
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        // Page became visible, refresh current panel
        try {
            loadCategoriesForPanels()
        } catch (error) {
            console.warn('Error refreshing categories:', error)
        }
    }
})

// Handle window resize for responsive behavior
window.addEventListener('resize', function() {
    // Ensure chat containers maintain proper scrolling
    const containers = ['ragChatContainer', 'searchChatContainer']
    containers.forEach(containerId => {
        const container = document.getElementById(containerId)
        if (container) {
            container.scrollTop = container.scrollHeight
        }
    })
})

// Export the main functions for external use
window.chatPanels = {
    switchPanel: switchChatPanel,
    clearPanel: clearChatPanel,
    getCurrentPanel: () => currentChatPanel,
    getHistory: (panelType) => chatHistories[panelType] || [],
    addMessage: window.addMessageToCurrentPanel,
    getRagConfig: window.getCurrentRagConfig,
    isOpenAIEnabled: window.isOpenAIEnabled,
    getOpenAIConfig: window.getOpenAIConfig
}

// Debug function for troubleshooting
window.debugChatPanels = function() {
    console.log('Chat Panels Debug Info:')
    console.log('Current Panel:', currentChatPanel)
    console.log('Chat Histories:', chatHistories)
    console.log('RAG Config:', window.ragConfig)
    console.log('Advanced Settings:', window.currentAdvancedSettings)

    // Check if all required elements exist
    const requiredElements = [
        'ragChatForm', 'ragMessageInput', 'ragChatContainer',
        'searchChatForm', 'searchMessageInput', 'searchChatContainer',
        'ragAdvancedSearchPanel', 'searchAdvancedSearchPanel'
    ]

    const missingElements = requiredElements.filter(id => !document.getElementById(id))
    if (missingElements.length > 0) {
        console.warn('Missing elements:', missingElements)
    }
}

console.log('Chat panels module loaded successfully')

