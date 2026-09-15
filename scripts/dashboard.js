/* Capital Flow — Dashboard (index.html) */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        const user = CF.requireAuth();
        if (!user) return;

        const users = CF.getUsers();
        const profile = users.find(function (u) { return u.username === user; });
        const firstName = profile ? profile.name.split(' ')[0] : user;
        CF.setNavUser(firstName);
        document.getElementById('user-name').textContent = firstName;

        const expenses = (CF.getExpenses()[user] || []).map(function (exp) {
            exp.amount = Number(exp.amount) || 0;
            return exp;
        });

        renderStats(expenses);
        renderDonut(expenses);
        renderMonthly(expenses);
        renderRecent(expenses);
        initBudget(expenses);
    });

    function currentMonthPrefix() {
        const now = new Date();
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }

    function sumMonth(list, monthPrefix) {
        return list.reduce(function (acc, exp) {
            return acc + ((exp.date || '').slice(0, 7) === monthPrefix ? exp.amount : 0);
        }, 0);
    }

    function total(list) {
        return list.reduce(function (acc, exp) { return acc + exp.amount; }, 0);
    }

    function setStat(id, value, sub) {
        const el = document.getElementById(id);
        el.textContent = value;
        const subEl = el.nextElementSibling;
        if (subEl && subEl.classList.contains('stat-sub')) subEl.textContent = sub || '';
    }

    function renderStats(expenses) {
        const currentMonth = currentMonthPrefix();
        const monthSpend = sumMonth(expenses, currentMonth);
        const all = total(expenses);
        const count = expenses.length;
        const avg = count ? all / count : 0;

        setStat('stat-total', CF.formatINR(all), count ? 'across ' + count + ' expense(s)' : 'no expenses yet');
        setStat('stat-month', CF.formatINR(monthSpend), 'this month');
        setStat('stat-count', String(count), avg ? 'avg ' + CF.formatINR(avg) + ' each' : 'start tracking today');
    }

    /* ---- Category donut + legend ---- */
    function byCategory(expenses) {
        const map = {};
        expenses.forEach(function (exp) {
            const name = exp.category || 'Other';
            map[name] = (map[name] || 0) + exp.amount;
        });
        return Object.keys(map).map(function (name) {
            return { name: name, value: map[name] };
        }).sort(function (a, b) { return b.value - a.value; });
    }

    function renderDonut(expenses) {
        const totalSpend = total(expenses);
        const el = document.getElementById('category-donut');
        const listEl = document.getElementById('category-list');
        const totalEl = document.getElementById('donut-total');

        totalEl.textContent = totalSpend ? CF.formatINR(totalSpend) : '₹0';

        if (!totalSpend) {
            el.style.background = '#e2e8f0';
            listEl.innerHTML = '<p class="muted" style="font-size:.85rem">No spending yet. Add an expense to see your breakdown.</p>';
            return;
        }

        const categories = byCategory(expenses);
        let acc = 0;
        const stops = categories.map(function (cat) {
            const start = (acc / totalSpend) * 100;
            acc += cat.value;
            const end = (acc / totalSpend) * 100;
            return CF.categoryColor(cat.name) + ' ' + start.toFixed(2) + '% ' + end.toFixed(2) + '%';
        });
        el.style.background = 'conic-gradient(' + stops.join(', ') + ')';

        const max = categories[0].value;
        listEl.innerHTML = categories.slice(0, 6).map(function (cat) {
            const color = CF.categoryColor(cat.name);
            return '<div class="category-row">' +
                '<span class="category-dot" style="background:' + color + '"></span>' +
                '<div class="category-row-info" title="' + CF.escapeHtml(cat.name) + '">' +
                '<span class="cat-name">' +
                '<i class="fas fa-fw ' + CF.categoryMeta(cat.name).icon + '" style="color:' + color + '"></i>' +
                CF.escapeHtml(cat.name) + '</span>' +
                '<span class="cat-amount">' + CF.formatINR(cat.value) + '</span></div>' +
                '<div class="category-row-bar"><div class="category-row-bar-fill" style="width:' +
                Math.max(2, (cat.value / max) * 100).toFixed(1) + '%;background:' + color + '"></div></div></div>';
        }).join('');
    }

    /* ---- Monthly bar chart ---- */
    function monthLabel(prefix) {
        return new Date(prefix + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short' });
    }

    function renderMonthly(expenses) {
        const container = document.getElementById('monthly-chart');
        const now = new Date();
        const prefixes = [];
        for (let offset = 5; offset >= 0; offset--) {
            const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            prefixes.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
        }

        const values = prefixes.map(function (prefix) { return sumMonth(expenses, prefix); });
        const max = Math.max.apply(null, values.concat([1]));
        const isEmpty = total(expenses) === 0;

        if (isEmpty) {
            container.innerHTML = '<p class="muted" style="font-size:.85rem;padding:1.5rem 0;text-align:center">' +
                'Your spending trend will appear here after you add expenses.</p>';
            return;
        }

        container.innerHTML = prefixes.map(function (prefix, idx) {
            const value = values[idx];
            const height = Math.max(2, (value / max) * 100);
            const isEmpty = value === 0;
            return '<div class="bar-item' + (isEmpty ? ' empty' : '') + '">' +
                '<span class="bar-value">' + (value ? CF.formatINR(value) : '') + '</span>' +
                '<div class="bar-fill" style="height:' + height.toFixed(1) +
                '%" title="' + CF.formatINR(value) + '"></div>' +
                '<div class="bar-label">' + monthLabel(prefix) + '</div></div>';
        }).join('');
    }

    /* ---- Recent expenses ---- */
    function renderRecent(expenses) {
        const container = document.getElementById('recent-expenses');
        const sorted = expenses.slice().sort(function (a, b) {
            const t = function (exp) { return (exp.date || '') + ' ' + (exp.time || ''); };
            return t(b).localeCompare(t(a));
        }).slice(0, 5);

        if (sorted.length === 0) {
            container.innerHTML = '<div class="empty-state">' +
                '<i class="fas fa-receipt"></i><strong>No expenses yet</strong>' +
                '<p>You have not recorded anything so far.</p></div>';
            return;
        }

        container.innerHTML =
            '<div class="table-responsive"><table id="expense-table">' +
            '<thead><tr><th>Expense</th><th>Category</th><th>Amount</th><th>Date</th></tr></thead>' +
            '<tbody>' + sorted.map(function (exp) {
                return '<tr><td class="expense-name">' + CF.escapeHtml(exp.expense) + '</td>' +
                    '<td>' + CF.categoryBadge(exp.category) + '</td>' +
                    '<td class="amount-cell">' + CF.formatINR(exp.amount) + '</td>' +
                    '<td class="date-cell">' + CF.formatDate(exp.date) + '</td></tr>';
            }).join('') + '</tbody></table></div>';
    }

    /* ---- Monthly budget ---- */
    function initBudget(expenses) {
        const user = CF.getUser();
        const budgets = CF.getBudgets();
        const current = (budgets[user] || {}).monthly || 0;

        const input = document.getElementById('budget-input');
        const fill = document.getElementById('budget-bar');
        const status = document.getElementById('budget-status');
        const saveBtn = document.getElementById('save-budget');

        if (current) input.value = Number(current).toFixed(2);
        updateBudgetStatus();

        input.addEventListener('input', function () {
            const value = parseFloat(input.value);
            input.classList.toggle('is-invalid', Number.isFinite(value) && value < 0);
        });

        saveBtn.addEventListener('click', function () {
            const value = parseFloat(input.value);
            if (!Number.isFinite(value) || value < 0) {
                CF.toast('Enter a valid budget amount.', 'error');
                input.focus();
                return;
            }
            budgets[user] = { monthly: Math.round(value * 100) / 100 };
            CF.saveBudgets(budgets);
            updateBudgetStatus();
            CF.toast('Monthly budget updated.', 'success');
        });

        function updateBudgetStatus() {
            const monthly = parseFloat(input.value);
            const monthSpend = sumMonth(expenses, currentMonthPrefix());

            if (!Number.isFinite(monthly) || monthly <= 0) {
                fill.style.width = '0%';
                fill.className = 'budget-progress-fill';
                status.textContent = 'Set a monthly budget to track your spending limits.';
                status.classList.remove('over');
                setStat('stat-budget', '—', 'set a monthly budget below');
                return;
            }

            const ratio = monthSpend / monthly;
            fill.style.width = Math.min(100, ratio * 100).toFixed(1) + '%';
            fill.className = 'budget-progress-fill' +
                (ratio > 1 ? ' over' : ratio >= 0.8 ? ' warn' : '');

            const remaining = monthly - monthSpend;
            if (remaining >= 0) {
                status.textContent = CF.formatINR(monthSpend) + ' spent of ' + CF.formatINR(monthly) +
                    ' — ' + CF.formatINR(remaining) + ' remaining.';
                status.classList.remove('over');
            } else {
                status.textContent = CF.formatINR(monthSpend) + ' spent of ' + CF.formatINR(monthly) +
                    ' — ' + CF.formatINR(Math.abs(remaining)) + ' over budget.';
                status.classList.add('over');
            }
            setStat('stat-budget', CF.formatINR(remaining < 0 ? Math.abs(remaining) : remaining),
                remaining < 0 ? 'over budget this month' : 'remaining this month');
        }
    }
})();