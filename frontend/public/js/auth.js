// Simple authentication system with hardcoded access key
const AUTH_CONFIG = {
    ACCESS_KEY: 'RAG2024', // Your access key
    STORAGE_KEY: 'rag_auth_token',
    LOGIN_PAGE: 'login.html',
    MAIN_PAGE: 'index.html'
};

class AuthManager {
    constructor() {
        this.isAuthenticated = false;
        this.init();
    }

    init() {
        // Check if user is already authenticated
        this.checkAuthStatus();
    }

    checkAuthStatus() {
        const token = localStorage.getItem(AUTH_CONFIG.STORAGE_KEY);
        this.isAuthenticated = token === 'authenticated';
        return this.isAuthenticated;
    }

    login(accessKey) {
        if (accessKey === AUTH_CONFIG.ACCESS_KEY) {
            localStorage.setItem(AUTH_CONFIG.STORAGE_KEY, 'authenticated');
            this.isAuthenticated = true;
            return true;
        }
        return false;
    }

    logout() {
        localStorage.removeItem(AUTH_CONFIG.STORAGE_KEY);
        this.isAuthenticated = false;
        this.redirectToLogin();
    }

    requireAuth() {
        if (!this.checkAuthStatus()) {
            this.redirectToLogin();
            return false;
        }
        return true;
    }

    redirectToLogin() {
        if (window.location.pathname !== '/' + AUTH_CONFIG.LOGIN_PAGE) {
            window.location.href = AUTH_CONFIG.LOGIN_PAGE;
        }
    }

    redirectToMain() {
        window.location.href = AUTH_CONFIG.MAIN_PAGE;
    }
}

// Global auth manager instance
window.authManager = new AuthManager();

// Global logout function for the UI
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        window.authManager.logout();
    }
}
