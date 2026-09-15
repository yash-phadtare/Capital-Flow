/* Capital Flow — Sign Up */
(function () {
    'use strict';

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
    const HAS_LETTER = /[a-zA-Z]/;
    const HAS_NUMBER = /[0-9]/;

    document.addEventListener('DOMContentLoaded', function () {
        const form = document.querySelector('.signup-form');
        form.addEventListener('submit', handleSubmit);
        setupPasswordToggle('password');
        setupPasswordToggle('confirmPassword');
    });

    function setupPasswordToggle(id) {
        const input = document.getElementById(id);
        if (!input) return;
        const btn = input.closest('.password-wrapper').querySelector('.toggle-pass');
        btn.addEventListener('click', function () {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.querySelector('i').className = 'fas fa-fw ' + (show ? 'fa-eye-slash' : 'fa-eye');
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            btn.setAttribute('aria-pressed', String(show));
        });
    }

    function setFieldError(id, message) {
        const input = document.getElementById(id);
        input.classList.add('is-invalid');
        const group = input.closest('.form-group');
        const error = group.querySelector('.input-error');
        error.textContent = message;
        error.classList.add('show');
        if (!document.querySelector('.is-invalid:focus')) input.focus();
    }

    function clearErrors(form) {
        form.querySelectorAll('.is-invalid').forEach(function (el) { el.classList.remove('is-invalid'); });
        form.querySelectorAll('.input-error').forEach(function (el) { el.classList.remove('show'); });
    }

    function validate(form) {
        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        let valid = true;
        const set = function (ok, id, message) {
            if (!ok) { setFieldError(id, message); valid = false; }
            return ok;
        };

        if (set(name.length >= 2, 'name', 'Please enter your full name (min 2 characters).')) {}
        if (set(EMAIL_RE.test(email), 'email', 'Please enter a valid email address.')) {}
        if (set(USERNAME_RE.test(username), 'username', 'Username must be 3-20 characters (letters, numbers, underscore).')) {}
        if (!set(password.length >= 8, 'password', 'Password must be at least 8 characters.')) return valid;
        if (!set(HAS_LETTER.test(password) && HAS_NUMBER.test(password), 'password', 'Password must include a letter and a number.')) return valid;
        if (set(password === confirmPassword, 'confirmPassword', 'Passwords do not match.')) {}

        return valid;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const form = e.target;
        clearErrors(form);
        if (!validate(form)) return;

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        const users = CF.getUsers();
        if (users.some(function (u) { return u.username.toLowerCase() === username.toLowerCase(); })) {
            setFieldError('username', 'This username is already taken.');
            return;
        }
        if (users.some(function (u) { return u.email.toLowerCase() === email.toLowerCase(); })) {
            setFieldError('email', 'This email is already registered.');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Creating account...';

        let credentials;
        try {
            credentials = await CF.hashPassword(password);
        } catch (err) {
            CF.toast('Could not secure your password in this browser. Try a modern browser.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign Up';
            return;
        }

        users.push({
            name: name,
            email: email,
            username: username,
            salt: credentials.salt,
            passwordHash: credentials.hash
        });
        CF.saveUsers(users);

        CF.toast('Account created! You can now log in.', 'success');
        setTimeout(function () { window.location.href = 'login.html'; }, 800);
    }
})();