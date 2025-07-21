// Login page functionality
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const accessKeyInput = document.getElementById('accessKey');
    const loginButton = document.getElementById('loginButton');
    const errorMessage = document.getElementById('errorMessage');

    // Check if already authenticated
    if (window.authManager && window.authManager.checkAuthStatus()) {
        window.authManager.redirectToMain();
        return;
    }

    // Focus on access key input
    accessKeyInput.focus();

    // Handle form submission
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleLogin();
    });

    // Handle Enter key press
    accessKeyInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });

    function handleLogin() {
        const accessKey = accessKeyInput.value.trim();

        if (!accessKey) {
            showError('Please enter an access key');
            return;
        }

        // Show loading state
        setLoadingState(true);
        hideError();

        // Simulate a small delay for better UX
        setTimeout(() => {
            if (window.authManager.login(accessKey)) {
                // Success - redirect to main page
                showSuccess();
                setTimeout(() => {
                    window.authManager.redirectToMain();
                }, 500);
            } else {
                // Failed authentication
                setLoadingState(false);
                showError('Invalid access key. Please try again.');
                accessKeyInput.select(); // Select the text for easy replacement
            }
        }, 500);
    }

    function setLoadingState(loading) {
        loginButton.disabled = loading;
        const buttonText = loginButton.querySelector('span');
        const buttonIcon = loginButton.querySelector('i');

        if (loading) {
            buttonText.textContent = 'Verifying...';
            buttonIcon.className = 'loading-spinner';
        } else {
            buttonText.textContent = 'Access System';
            buttonIcon.className = 'fas fa-sign-in-alt';
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
        accessKeyInput.style.borderColor = '#dc2626';
    }

    function hideError() {
        errorMessage.classList.remove('show');
        accessKeyInput.style.borderColor = '';
    }

    function showSuccess() {
        const buttonText = loginButton.querySelector('span');
        const buttonIcon = loginButton.querySelector('i');

        buttonText.textContent = 'Access Granted!';
        buttonIcon.className = 'fas fa-check';
        loginButton.style.background = '#059669';
    }
});
