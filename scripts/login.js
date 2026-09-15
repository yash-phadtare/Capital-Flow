/* Capital Flow — Login */
(function () {
    'use strict';

    const MAX_ATTEMPTS = 5;
    const LOCKOUT_MS = 30 * 1000; // 30 seconds
    const ATTEMPT_KEY = 'cf_login_attempts';

    document.addEventListener('DOMContentLoaded', function () {
        if (!CF.requireGuest()) return;

        const reason = new URLSearchParams(window.location.search).get('reason');
        if (reason === 'expired') {
            CF.toast('Your session expired. Please log in again.', 'warning');
        }

        const form = document.querySelector('.login-form');
        form.addEventListener('submit', handleSubmit);
        setupPasswordToggle();
    });

    function setupPasswordToggle() {
        const btn = document.querySelector('.toggle-pass');
        const input = document.getElementById('password');
        if (!btn || !input) return;
        btn.addEventListener('click', function () {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.querySelector('i').className = 'fas fa-fw ' + (show ? 'fa-eye-slash' : 'fa-eye');
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            btn.setAttribute('aria-pressed', String(show));
        });
    }

    function getAttempts() {
        return CF.safeParse(sessionStorage.getItem(ATTEMPT_KEY), {});
    }

    function saveAttempts(attempts) {
        sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempts));
    }

    function checkLocked(username) {
        const attempts = getAttempts();
        const record = attempts[username];
        if (!record) return null;
        if (Date.now() - record.time > LOCKOUT_MS) {
            delete attempts[username];
            saveAttempts(attempts);
            return null;
        }
        if (record.count >= MAX_ATTEMPTS) {
            const wait = Math.ceil((LOCKOUT_MS - (Date.now() - record.time)) / 1000);
            return wait;
        }
        return null;
    }

    function recordFailure(username) {
        const attempts = getAttempts();
        const record = attempts[username] || { count: 0, time: Date.now() };
        record.count += 1;
        record.time = Date.now();
        attempts[username] = record;
        saveAttempts(attempts);
        return record.count;
    }

    function clearFailures(username) {
        const attempts = getAttempts();
        delete attempts[username];
        saveAttempts(attempts);
    }

    function setFieldError(id, message) {
        const input = document.getElementById(id);
        const group = input.closest('.form-group');
        input.classList.add('is-invalid');
        const error = group.querySelector('.input-error');
        if (error) {
            error.textContent = message;
            error.classList.add('show');
        }
    }

    function clearErrors(form) {
        form.querySelectorAll('.is-invalid').forEach(function (el) { el.classList.remove('is-invalid'); });
        form.querySelectorAll('.input-error').forEach(function (el) { el.classList.remove('show'); });
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const form = e.target;
        clearErrors(form);

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username) { setFieldError('username', 'Username is required.'); return; }
        if (!password) { setFieldError('password', 'Password is required.'); return; }

        const locked = checkLocked(username);
        if (locked !== null) {
            setFieldError('password', 'Too many failed attempts. Please try again in ' + locked + 's.');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verifying...';

        const users = CF.getUsers();
        const user = users.find(function (u) { return u.username === username; });

        const matches = user ? await CF.verifyPassword(password, user) : false;

        if (!user || !matches) {
            const count = recordFailure(username);
            const remaining = MAX_ATTEMPTS - count;
            submitBtn.disabled = false;
            restoreButton(submitBtn);
            setFieldError('password', remaining > 0
                ? 'Invalid username or password. ' + remaining + ' attempt(s) left.'
                : 'Account temporarily locked due to multiple failed attempts.');
            CF.toast('Invalid username or password.', 'error');
            return;
        }

        // Successful login
        clearFailures(username);

        // Migrate legacy plaintext users to hashed credentials
        if (user.password !== undefined && !user.passwordHash) {
            try {
                const { salt, hash } = await CF.hashPassword(password);
                user.salt = salt;
                user.passwordHash = hash;
                delete user.password;
                CF.saveUsers(users);
            } catch (err) {
                // Migration failure isn't fatal; hashing will occur on next login.
            }
        }

        CF.startSession(user.username);
        CF.toast('Welcome back, ' + (user.name || user.username).split(' ')[0] + '!', 'success');
        setTimeout(function () { window.location.href = 'index.html'; }, 900);
    }

    function restoreButton(btn) {
        btn.innerHTML = 'Login';
    }
})();