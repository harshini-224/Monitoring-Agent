let cachedUser = null;

/**
 * Get current user from API
 */
async function getCurrentUser() {
    try {
        const user = await api.getCurrentUser();
        cachedUser = user;
        return user;
    } catch (error) {
        console.error('Failed to get current user:', error);
        return null;
    }
}

/**
 * Get currently cached user
 */
function getUser() {
    return cachedUser;
}

/**
 * Check if user has required role
 */
function hasRole(user, allowedRoles) {
    if (!user || !user.role) return false;
    return allowedRoles.includes(user.role);
}

/**
 * Redirect to login if not authenticated
 */
async function requireAuth(allowedRoles = null) {
    const token = localStorage.getItem('auth_token');

    if (!token) {
        window.location.href = '/frontend/auth/login.html';
        return null;
    }

    const user = await getCurrentUser();

    if (!user) {
        window.location.href = '/frontend/auth/login.html';
        return null;
    }

    if (allowedRoles && !hasRole(user, allowedRoles)) {
        showToast('Access Denied', 'You do not have permission to access this page', 'error');
        setTimeout(() => {
            window.location.href = getDashboardForRole(user.role);
        }, 2000);
        return null;
    }

    return user;
}

/**
 * Get appropriate dashboard URL for user role
 */
function getDashboardForRole(role) {
    const dashboards = {
        'admin': '/frontend/admin/dashboard.html',
        'staff': '/frontend/staff/dashboard.html',
        'nurse': '/frontend/nurse/dashboard.html',
        'doctor': '/frontend/doctor/dashboard.html',
    };

    return dashboards[role] || '/frontend/auth/login.html';
}

/**
 * Logout user
 */
async function logout() {
    await api.logout();
}

/**
 * Initialize auth for page
 */
async function initAuth(allowedRoles = null) {
    const user = await requireAuth(allowedRoles);
    if (user) {
        // Update header with user info
        updateUserHeader(user);
    }
    return user;
}

/**
 * Update header with user information
 */
function updateUserHeader(user) {
    const userNameEl = document.getElementById('user-name');
    const userRoleEl = document.getElementById('user-role');

    if (userNameEl) {
        userNameEl.textContent = user.name || user.email;
    }

    if (userRoleEl) {
        userRoleEl.textContent = user.role.toUpperCase();
    }
}
// Export as global object for easier access
window.auth = {
    getCurrentUser,
    getUser,
    hasRole,
    requireAuth,
    getDashboardForRole,
    logout,
    initAuth,
    updateUserHeader
};
