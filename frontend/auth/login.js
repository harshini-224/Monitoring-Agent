/**
 * Login Page JavaScript
 */

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in
    const token = localStorage.getItem('auth_token');
    if (token) {
        checkExistingSession();
    }

    // Setup form handler
    const form = document.getElementById('login-form');
    form.addEventListener('submit', handleLogin);

    // Setup password toggle
    const togglePassword = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');

    togglePassword.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        togglePassword.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
    });
});

/**
 * Check if user already has valid session
 */
async function checkExistingSession() {
    try {
        const user = await api.getCurrentUser();
        if (user && user.role) {
            window.location.href = getDashboardForRole(user.role);
        }
    } catch (error) {
        // Invalid token, clear it
        localStorage.removeItem('auth_token');
    }
}

/**
 * Get dashboard URL for role
 */
function getDashboardForRole(role) {
    const dashboards = {
        'admin': '../admin/dashboard.html',
        'staff': '../staff/dashboard.html',
        'nurse': '../nurse/dashboard.html',
        'doctor': '../doctor/dashboard.html',
    };
    return dashboards[role] || 'login.html';
}

/**
 * Handle login form submission
 */
async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    // Validation
    if (!email || !password) {
        showToast('Error', 'Please enter both email and password', 'error');
        return;
    }

    // Disable submit button
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';


    try {
        const response = await api.login(email, password);

        if (response.role) {
            showToast('Success', 'Login successful!', 'success');

            // Redirect to appropriate dashboard
            setTimeout(() => {
                window.location.href = getDashboardForRole(response.role);
            }, 500);
        } else {
            throw new Error('Invalid response from server');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast(
            'Login Failed',
            error.message || 'Invalid email or password',
            'error'
        );

        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';

        // Clear password field
        document.getElementById('password').value = '';
    }
}
