/**
 * Capital Flow — Shared utilities & application core
 * Handles storage access, authentication/session, crypto, toasts,
 * sanitization and the global navigation behaviour.
 */
(function () {
    'use strict';

    const SESSION_KEY = 'cf_session';
    const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
    const PBKDF2_ITERATIONS = 150000;

    const CATEGORIES = [
        { name: 'Food & Dining', icon: 'fa-utensils', color: '#f59e0b' },
        { name: 'Transportation', icon: 'fa-car', color: '#3b82f6' },
        { name: 'Housing', icon: 'fa-home', color: '#8b5cf6' },
        { name: 'Utilities', icon: 'fa-bolt', color: '#06b6d4' },
        { name: 'Healthcare', icon: 'fa-heart-pulse', color: '#ef4444' },
        { name: 'Entertainment', icon: 'fa-gamepad', color: '#ec4899' },
        { name: 'Shopping', icon: 'fa-bag-shopping', color: '#f97316' },
        { name: 'Education', icon: 'fa-graduation-cap', color: '#22c55e' },
        { name: 'Personal Care', icon: 'fa-spa', color: '#a855f7' },
        { name: 'Travel', icon: 'fa-plane', color: '#0ea5e9' },
        { name: 'Gifts & Donations', icon: 'fa-gift', color: '#eab308' },
        { name: 'Investments', icon: 'fa-arrow-trend-up', color: '#14b8a6' },
        { name: 'Other', icon: 'fa-ellipsis', color: '#64748b' }
    ];

    function safeParse(json, fallback) {
        if (json == null) return fallback;
        try {
            const value = JSON.parse(json);
            return typeof value === 'undefined' ? fallback : value;
        } catch (err) {
            return fallback;
        }
    }

    function getUsers() {
        return safeParse(localStorage.getItem('users'), []);
    }

    function saveUsers(users) {
        localStorage.setItem('users', JSON.stringify(users));
    }

    function getExpenses() {
        return safeParse(localStorage.getItem('expenses'), {});
    }

    function saveExpenses(expenses) {
        localStorage.setItem('expenses', JSON.stringify(expenses));
    }

    function getBudgets() {
        return safeParse(localStorage.getItem('cf_budgets'), {});
    }

    function saveBudgets(budgets) {
        localStorage.setItem('cf_budgets', JSON.stringify(budgets));
    }

    /* ---- HTML escaping (XSS protection) ---- */
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    /* ---- Formatting helpers ---- */
    function formatINR(amount) {
        const num = Number(amount) || 0;
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function formatTime(timeString) {
        if (!timeString) return '—';
        const parts = String(timeString).split(':').map(Number);
        if (parts.length < 2 || isNaN(parts[0])) return timeString;
        const hours = parts[0];
        const minutes = parts[1];
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        return displayHours + ':' + String(minutes).padStart(2, '0') + ' ' + period;
    }

    /* ---- Category helpers ---- */
    function categoryMeta(name) {
        return CATEGORIES.find(function (c) { return c.name === name; }) || CATEGORIES[CATEGORIES.length - 1];
    }

    function categoryColor(name) {
        return categoryMeta(name).color;
    }

    function categoryBadge(name) {
        const color = categoryColor(name);
        const bg = hexToRgba(color, 0.12);
        return '<span class="category-badge" style="color:' + color + ';background:' + bg + ';">' +
            '<i class="fas fa-fw ' + categoryMeta(name).icon + '"></i>' + escapeHtml(name) + '</span>';
    }

    function hexToRgba(hex, alpha) {
        const value = hex.replace('#', '');
        const full = value.length === 3 ? value.split('').map(function (c) { return c + c; }).join('') : value;
        const num = parseInt(full, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    /* ---- Crypto: PBKDF2 password hashing ---- */
    function bytesToHex(bytes) {
        return Array.prototype.map.call(bytes, function (b) {
            return b.toString(16).padStart(2, '0');
        }).join('');
    }

    function hexToBytes(hex) {
        const out = new Uint8Array(hex.length / 2);
        for (let i = 0; i < out.length; i++) {
            out[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return out;
    }

    async function deriveKey(password, saltHex) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
        );
        const bits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: hexToBytes(saltHex),
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            256
        );
        return bytesToHex(new Uint8Array(bits));
    }

    async function hashPassword(password) {
        const saltBytes = crypto.getRandomValues(new Uint8Array(16));
        const salt = bytesToHex(saltBytes);
        const hash = await deriveKey(password, salt);
        return { salt: salt, hash: hash };
    }

    async function verifyPassword(password, user) {
        if (user.passwordHash && user.salt) {
            const hash = await deriveKey(password, user.salt);
            return hash === user.passwordHash;
        }
        // Legacy plaintext account (migrated on next successful login)
        return user.password === password;
    }

    /* ---- Authentication & session ---- */
    function getUser() {
        return localStorage.getItem('loggedInUser');
    }

    function sessionIsValid() {
        const username = getUser();
        if (!username) return false;
        const session = safeParse(localStorage.getItem(SESSION_KEY), null);
        if (!session || session.username !== username) return false;
        return (Date.now() - Number(session.loginTime)) < SESSION_TTL_MS;
    }

    function startSession(username) {
        localStorage.setItem('loggedInUser', username);
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            username: username,
            loginTime: Date.now()
        }));
    }

    function clearSession() {
        localStorage.removeItem('loggedInUser');
        localStorage.removeItem(SESSION_KEY);
    }

    function logout() {
        clearSession();
        window.location.href = 'login.html';
    }

    /**
     * Gate for pages that require an authenticated session.
     * Returns the username when valid, otherwise redirects to login.
     */
    function requireAuth() {
        if (!sessionIsValid()) {
            clearSession();
            window.location.href = 'login.html?reason=expired';
            return null;
        }
        return getUser();
    }

    /**
     * Gate for auth pages: an active session skips straight to the dashboard.
     */
    function requireGuest() {
        if (sessionIsValid()) {
            window.location.href = 'index.html';
            return false;
        }
        return true;
    }

    /* ---- Toasts ---- */
    const TOAST_ICONS = {
        success: 'fa-circle-check',
        error: 'fa-circle-exclamation',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
    };

    function toast(message, type) {
        type = TOAST_ICONS[type] ? type : 'success';
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const el = document.createElement('div');
        el.className = 'toast toast-' + type;
        el.setAttribute('role', 'status');
        el.innerHTML = '<i class="fas ' + TOAST_ICONS[type] + '"></i>' +
            '<div class="toast-message">' + escapeHtml(message) + '</div>';

        container.appendChild(el);
        setTimeout(function () {
            el.classList.add('toast-leave');
            setTimeout(function () { el.remove(); }, 260);
        }, 3500);
    }

    /* ---- Modal dialogs ---- */
    function confirmDialog(message, options) {
        options = options || {};
        return new Promise(function (resolve) {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML =
                '<div class="modal-box" role="dialog" aria-modal="true" aria-label="' + escapeHtml(options.title || 'Confirm') + '">' +
                '<div class="modal-header"><h3><i class="fas ' + (options.icon || 'fa-circle-question') + '"></i> ' +
                escapeHtml(options.title || 'Confirm action') + '</h3></div>' +
                '<div class="modal-body">' + escapeHtml(message) + '</div>' +
                '<div class="modal-footer">' +
                '<button class="btn btn-ghost js-cancel">Cancel</button>' +
                '<button class="btn ' + (options.danger ? 'btn-danger' : 'btn-primary') + ' js-confirm">' +
                escapeHtml(options.confirmText || 'Confirm') + '</button>' +
                '</div></div>';

            function close() { overlay.remove(); }

            overlay.querySelector('.js-cancel').addEventListener('click', function () { close(); resolve(false); });
            overlay.querySelector('.js-confirm').addEventListener('click', function () { close(); resolve(true); });
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) { close(); resolve(false); }
            });

            overlay.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') { close(); resolve(false); }
            });

            document.body.appendChild(overlay);
            overlay.querySelector('.js-cancel').focus();
        });
    }

    /* ---- Header / navigation wiring ---- */
    function setNavUser(name) {
        const el = document.querySelector('.nav-user-name');
        if (el) el.textContent = name;
        const userBadge = document.querySelector('.nav-user');
        if (userBadge && name) userBadge.hidden = false;
        if (userBadge && !name) userBadge.hidden = true;
    }

    function initNavigation() {
        const toggle = document.querySelector('.mobile-menu-toggle');
        const nav = document.querySelector('.main-nav');
        if (toggle && nav) {
            toggle.addEventListener('click', function () {
                nav.classList.toggle('active');
            });
        }

        document.querySelectorAll('[data-action="logout"]').forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                logout();
            });
        });

        // Close the mobile menu when a nav link is clicked
        nav && nav.addEventListener('click', function (e) {
            if (e.target.closest('a')) nav.classList.remove('active');
        });
    }

    function initFooterYear() {
        document.querySelectorAll('.current-year').forEach(function (el) {
            el.textContent = String(new Date().getFullYear());
        });
    }

    /* ---- Misc ---- */
    function uid() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    }

    function plausibleNumber(value) {
        const num = Number(value);
        return Number.isFinite(num);
    }

    /* ---- Expose ---- */
    window.CF = {
        CATEGORIES: CATEGORIES,
        safeParse: safeParse,
        getUsers: getUsers,
        saveUsers: saveUsers,
        getExpenses: getExpenses,
        saveExpenses: saveExpenses,
        getBudgets: getBudgets,
        saveBudgets: saveBudgets,
        escapeHtml: escapeHtml,
        formatINR: formatINR,
        formatDate: formatDate,
        formatTime: formatTime,
        categoryMeta: categoryMeta,
        categoryColor: categoryColor,
        categoryBadge: categoryBadge,
        hashPassword: hashPassword,
        verifyPassword: verifyPassword,
        getUser: getUser,
        sessionIsValid: sessionIsValid,
        startSession: startSession,
        clearSession: clearSession,
        logout: logout,
        requireAuth: requireAuth,
        requireGuest: requireGuest,
        toast: toast,
        confirmDialog: confirmDialog,
        setNavUser: setNavUser,
        initNavigation: initNavigation,
        initFooterYear: initFooterYear,
        uid: uid,
        plausibleNumber: plausibleNumber
    };

    // Wire up global behaviours on every page
    document.addEventListener('DOMContentLoaded', function () {
        CF.initNavigation();
        CF.initFooterYear();
        if (CF.sessionIsValid()) {
            const profile = CF.getUsers().find(function (u) { return u.username === CF.getUser(); });
            const displayName = profile ? profile.name.split(' ')[0] : CF.getUser();
            CF.setNavUser(displayName);
        }
    });
})();