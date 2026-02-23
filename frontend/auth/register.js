/**
 * Registration Page JavaScript
 */

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Setup form handler
    const form = document.getElementById('register-form');
    form.addEventListener('submit', handleRegister);

    // Password validation
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirm-password');

    confirmPassword.addEventListener('input', () => {
        if (confirmPassword.value && password.value !== confirmPassword.value) {
            confirmPassword.setCustomValidity('Passwords do not match');
        } else {
            confirmPassword.setCustomValidity('');
        }
    });
});

/**
 * Handle registration form submission
 */
async function handleRegister(e) {
    e.preventDefault();

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const role = document.getElementById('role').value;
    const department = document.getElementById('department').value.trim() || null;

    // Validation
    if (!name || !email || !password || !role) {
        showToast('Error', 'Please fill in all required fields', 'error');
        return;
    }

    if (password.length < 8) {
        showToast('Error', 'Password must be at least 8 characters', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showToast('Error', 'Passwords do not match', 'error');
        return;
    }

    if (!validateEmail(email)) {
        showToast('Error', 'Please enter a valid email address', 'error');
        return;
    }

    // Disable submit button
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        await api.register({
            name,
            email,
            password,
            role,
            department,
        });

        showToast(
            'Request Submitted',
            'Your access request has been submitted for approval',
            'success',
            5000
        );

        // Show success message
        showSuccessScreen();

    } catch (error) {
        console.error('Registration error:', error);

        let errorMessage = 'Registration failed. Please try again.';
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            errorMessage = 'This email is already registered.';
        }

        showToast('Registration Failed', errorMessage, 'error');

        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
    }
}

/**
 * Show success screen after registration
 */
function showSuccessScreen() {
    const form = document.getElementById('register-form');
    form.innerHTML = `
    <div style="text-align: center; padding: 2rem 0;">
      <div style="font-size: 4rem; margin-bottom: 1rem;">✓</div>
      <h3 style="color: var(--success); margin-bottom: 1rem;">Request Submitted!</h3>
      <p style="color: var(--text-secondary); margin-bottom: 2rem;">
        An administrator will review your access request. You'll be able to login once approved.
      </p>
      <a href="login.html" class="btn btn-primary">
        Return to Login
      </a>
    </div>
  `;
}
