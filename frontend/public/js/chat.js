// RAG Chat Application - Chat Management
// Handles chat interface, messages, and conversation flow

class ChatManager {
    constructor() {
        this.messages = [];
        this.typingIndicators = new Map();
        this.messageHistory = [];
        this.maxHistorySize = 100;
        this.init();
    }

    init() {
        this.loadChatHistory();
        this.setupAutoSave();
    }

    addMessage(content, sender, sources = null) {
        if (!chatContainer) return;

        try {
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${sender}-message`;

            // Add message header
            const headerDiv = document.createElement('div');
            headerDiv.className = 'message-header';
            headerDiv.innerHTML = `
                <span class="message-sender">${sender === 'user' ? 'You' : 'Assistant'}</span>
                <span class="message-time">${new Date().toLocaleTimeString()}</span>
            `;

            // Add message content
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';

            // Format content with markdown-like styling
            const formattedContent = this.formatMessageContent(content);
            contentDiv.innerHTML = formattedContent;

            messageDiv.appendChild(headerDiv);
            messageDiv.appendChild(contentDiv);

            // Add sources if available
            if (sources && Array.isArray(sources) && sources.length > 0) {
                const sourcesDiv = this.createSourcesElement(sources);
                contentDiv.appendChild(sourcesDiv);
            }

            chatContainer.appendChild(messageDiv);

            // Remove welcome message if it exists
            const welcomeMessage = chatContainer.querySelector('.welcome-message');
            if (welcomeMessage) {
                welcomeMessage.remove();
            }

            // Scroll to bottom
            chatContainer.scrollTop = chatContainer.scrollHeight;

            // Store message
            this.messages.push({
                content,
                sender,
                sources,
                timestamp: Date.now()
            });

            // Limit message history
            if (this.messages.length > this.maxHistorySize) {
                this.messages = this.messages.slice(-this.maxHistorySize);
            }

        } catch (error) {
            console.error('Error adding message:', error);
        }
    }

    createSourcesElement(sources) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'message-sources';
        sourcesDiv.innerHTML = '<strong>Sources:</strong>';

        sources.forEach((source, index) => {
            const sourceDiv = document.createElement('div');
            sourceDiv.className = 'source-item';
            sourceDiv.onclick = () => this.openSourceDocument(source);

            sourceDiv.innerHTML = `
                <div class="source-title">${escapeHtml(source.title || source.filename || `Source ${index + 1}`)}</div>
                <div class="source-content">${this.truncateText(source.content || '', 150)}</div>
                <div class="source-meta">
                    <span>${escapeHtml(source.filename || 'Unknown file')}</span>
                </div>
            `;

            sourcesDiv.appendChild(sourceDiv);
        });

        return sourcesDiv;
    }

    formatMessageContent(content) {
        if (!content) return '';

        try {
            // Basic markdown-like formatting
            let formatted = escapeHtml(String(content))
                // Bold text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                // Italic text
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                // Code blocks
                .replace(/([\s\S]*?)/g, '<pre><code>$1</code></pre>')
                // Inline code
                .replace(/`(.*?)`/g, '<code>$1</code>')
                // Line breaks
                .replace(/\n/g, '<br>');

            // Convert URLs to links
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            formatted = formatted.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

            return formatted;
        } catch (error) {
            console.error('Error formatting message content:', error);
            return escapeHtml(String(content));
        }
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        const textStr = String(text);
        if (textStr.length <= maxLength) return escapeHtml(textStr);
        return escapeHtml(textStr.substring(0, maxLength)) + '...';
    }

    showTypingIndicator() {
        if (!chatContainer) return null;

        try {
            const typingId = 'typing-' + Date.now();
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message assistant-message';
            messageDiv.id = typingId;

            const typingDiv = document.createElement('div');
            typingDiv.className = 'typing-indicator';
            typingDiv.innerHTML = `
                <div class="loading-dots">
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                </div>
                <span>Assistant is typing...</span>
            `;

            messageDiv.appendChild(typingDiv);
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;

            this.typingIndicators.set(typingId, messageDiv);
            return typingId;
        } catch (error) {
            console.error('Error showing typing indicator:', error);
            return null;
        }
    }

    removeTypingIndicator(typingId) {
        try {
            if (typingId && this.typingIndicators.has(typingId)) {
                const element = this.typingIndicators.get(typingId);
                if (element && element.parentNode) {
                    element.parentNode.removeChild(element);
                }
                this.typingIndicators.delete(typingId);
            } else {
                // Remove any typing indicators if no specific ID provided
                this.typingIndicators.forEach((element, id) => {
                    if (element && element.parentNode) {
                        element.parentNode.removeChild(element);
                    }
                });
                this.typingIndicators.clear();
            }
        } catch (error) {
            console.error('Error removing typing indicator:', error);
        }
    }

    clearChat() {
        if (!chatContainer) return;

        try {
            // Clear messages array
            this.messages = [];

            // Clear DOM
            chatContainer.innerHTML = `
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
                                <li>Upload PDF, DOC, DOCX, or TXT documents</li>
                                <li>Ask questions about your documents using AI</li>
                                <li>Search for specific content across all documents</li>
                                <li>Get AI-powered answers with source citations</li>
                            </ul>
                        </div>
                    </div>
                </div>
            `;

            // Clear typing indicators
            this.typingIndicators.clear();

            // Show success message
            showStatus('Chat cleared successfully', 'success');
        } catch (error) {
            console.error('Error clearing chat:', error);
        }
    }

    openSourceDocument(source) {
        try {
            if (source.document_id && typeof openDocumentViewer === 'function') {
                openDocumentViewer(source.document_id, source.content);
            } else {
                showStatus('Document viewer not available', 'warning');
            }
        } catch (error) {
            console.error('Error opening source document:', error);
            showStatus('Failed to open document', 'error');
        }
    }

    loadChatHistory() {
        try {
            const savedHistory = localStorage.getItem('rag_chat_history');
            if (savedHistory) {
                const messages = JSON.parse(savedHistory);

                if (Array.isArray(messages) && messages.length > 0) {
                    // Clear welcome message
                    if (chatContainer) {
                        chatContainer.innerHTML = '';
                    }

                    // Restore messages
                    messages.forEach(msg => {
                        this.addMessage(msg.content, msg.sender, msg.sources);
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to load chat history:', error);
        }
    }

    saveChatHistory() {
        try {
            const historyToSave = this.messages.slice(-50); // Save last 50 messages
            localStorage.setItem('rag_chat_history', JSON.stringify(historyToSave));
        } catch (error) {
            console.warn('Failed to save chat history:', error);
        }
    }

    setupAutoSave() {
        // Auto-save chat periodically
        setInterval(() => {
            this.saveChatHistory();
        }, 30000); // Every 30 seconds

        // Save chat when page is unloaded
        window.addEventListener('beforeunload', () => {
            this.saveChatHistory();
        });
    }

    exportChat() {
        try {
            const chatData = {
                messages: this.messages,
                exportDate: new Date().toISOString(),
                totalMessages: this.messages.length
            };

            const blob = new Blob([JSON.stringify(chatData, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rag-chat-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showStatus('Chat exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting chat:', error);
            showStatus('Failed to export chat', 'error');
        }
    }

    importChat(file) {
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const chatData = JSON.parse(e.target.result);

                    if (chatData.messages && Array.isArray(chatData.messages)) {
                        // Clear current chat
                        this.clearChat();

                        // Import messages
                        chatData.messages.forEach(msg => {
                            this.addMessage(msg.content, msg.sender, msg.sources);
                        });

                        showStatus(`Imported ${chatData.messages.length} messages`, 'success');
                    } else {
                        throw new Error('Invalid chat file format');
                    }
                } catch (parseError) {
                    console.error('Error parsing chat file:', parseError);
                    showStatus('Invalid chat file format', 'error');
                }
            };

            reader.readAsText(file);
        } catch (error) {
            console.error('Error importing chat:', error);
            showStatus('Failed to import chat', 'error');
        }
    }

    getMessageStats() {
        const userMessages = this.messages.filter(m => m.sender === 'user');
        const assistantMessages = this.messages.filter(m => m.sender === 'assistant');
        const messagesWithSources = this.messages.filter(m => m.sources && m.sources.length > 0);

        return {
            total: this.messages.length,
            user: userMessages.length,
            assistant: assistantMessages.length,
            withSources: messagesWithSources.length,
            averageSourcesPerMessage: messagesWithSources.length > 0
                ? messagesWithSources.reduce((sum, m) => sum + m.sources.length, 0) / messagesWithSources.length
                : 0
        };
    }
}

// Input handling functions
function handleChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (chatForm) {
            chatForm.dispatchEvent(new Event('submit'));
        }
    }
}

function autoResizeTextarea() {
    if (messageInput) {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    }
}

// Initialize chat manager
const chatManager = new ChatManager();

// Global functions for backward compatibility
window.addMessage = (content, sender, sources) => chatManager.addMessage(content, sender, sources);
window.showTypingIndicator = () => chatManager.showTypingIndicator();
window.removeTypingIndicator = (id) => chatManager.removeTypingIndicator(id);
window.clearChat = () => chatManager.clearChat();

console.log('Chat manager loaded successfully');