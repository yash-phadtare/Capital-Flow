/* Capital Flow — View Expenses */
(function () {
    'use strict';

    const state = {
        search: '',
        category: 'all',
        sortKey: 'date',
        sortDir: -1
    };

    document.addEventListener('DOMContentLoaded', function () {
        if (!CF.requireAuth()) return;

        populateCategoryFilter();
        bindEvents();
        loadExpenses();
    });

    /* ---- Data access ---- */
    function getUserExpenses() {
        const expenses = CF.getExpenses();
        const userExpenses = expenses[CF.getUser()] || [];
        return userExpenses;
    }

    function saveUserExpenses(userExpenses) {
        const expenses = CF.getExpenses();
        expenses[CF.getUser()] = userExpenses;
        CF.saveExpenses(expenses);
    }

    // Lazily assign stable ids to records created before this version
    function ensureIds() {
        const userExpenses = getUserExpenses();
        let changed = false;
        userExpenses.forEach(function (exp) {
            if (!exp.id) {
                exp.id = CF.uid();
                changed = true;
            }
            exp.amount = Number(exp.amount) || 0;
        });
        if (changed) saveUserExpenses(userExpenses);
        return userExpenses;
    }

    /* ---- Filtering & sorting ---- */
    function getVisible() {
        let list = ensureIds();

        if (state.category !== 'all') {
            list = list.filter(function (exp) { return exp.category === state.category; });
        }

        if (state.search) {
            const q = state.search.toLowerCase();
            list = list.filter(function (exp) {
                return (exp.expense || '').toLowerCase().indexOf(q) !== -1 ||
                    (exp.category || '').toLowerCase().indexOf(q) !== -1;
            });
        }

        list = list.slice();
        list.sort(compareRows);
        return list;
    }

    function compareRows(a, b) {
        const key = state.sortKey;
        let result = 0;
        if (key === 'amount') {
            result = (a.amount || 0) - (b.amount || 0);
        } else if (key === 'date') {
            result = new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
        } else {
            result = String(a[key] || '').localeCompare(String(b[key] || ''), undefined, { sensitivity: 'base' });
        }
        return state.sortDir * result;
    }

    /* ---- Events ---- */
    function bindEvents() {
        document.getElementById('search').addEventListener('input', function (e) {
            state.search = e.target.value.trim();
            toggleClearButton();
            render();
        });

        document.getElementById('category-filter').addEventListener('change', function (e) {
            state.category = e.target.value;
            toggleClearButton();
            render();
        });

        document.getElementById('clear-filters').addEventListener('click', function () {
            document.getElementById('search').value = '';
            document.getElementById('category-filter').value = 'all';
            state.search = '';
            state.category = 'all';
            toggleClearButton();
            render();
        });

        document.querySelector('.export-btn').addEventListener('click', exportCSV);

        document.querySelectorAll('#expense-table th.sortable').forEach(function (th) {
            th.addEventListener('click', function () {
                const key = th.dataset.sort;
                if (state.sortKey === key) {
                    state.sortDir = -state.sortDir;
                } else {
                    state.sortKey = key;
                    state.sortDir = key === 'date' ? -1 : 1;
                }
                render();
            });
        });

        document.querySelector('#expense-table tbody').addEventListener('click', function (e) {
            const btn = e.target.closest('.action-btn');
            if (!btn) return;
            const id = btn.dataset.id;
            if (btn.dataset.action === 'edit') openEditModal(id);
            if (btn.dataset.action === 'delete') deleteExpense(id);
        });
    }

    function toggleClearButton() {
        document.getElementById('clear-filters').hidden = !(state.search || state.category !== 'all');
    }

    /* ---- Rendering ---- */
    function render() {
        const visible = getVisible();
        const all = ensureIds();
        const tbody = document.querySelector('#expense-table tbody');
        const heading = document.querySelector('#filter-summary');

        if (visible.length === 0) {
            const hasFilters = Boolean(state.search || state.category !== 'all');
            tbody.innerHTML = hasFilters
                ? '<tr><td colspan="6"><div class="empty-state">' +
                '<i class="fas fa-magnifying-glass"></i><strong>No matching expenses</strong>' +
                '<p>Try adjusting your search or filters.</p></div></td></tr>'
                : '<tr><td colspan="6"><div class="empty-state">' +
                '<i class="fas fa-wallet"></i><strong>No expenses yet</strong>' +
                '<p>Track your first expense to see it here.</p>' +
                '<a class="btn btn-primary btn-sm mt-2" href="add-expense.html"><i class="fas fa-plus"></i> Add Expense</a>' +
                '</div></td></tr>';
        } else {
            tbody.innerHTML = visible.map(rowMarkup).join('');
        }

        const countLabel = hasFilters(visible) ? visible.length + ' of ' + all.length : String(all.length);
        document.querySelector('#expense-count').textContent = 'Showing ' + countLabel + ' expense(s)';
        document.querySelector('#total-amount').textContent = CF.formatINR(sum(visible));
        if (heading) {
            heading.textContent = hasFilters
                ? 'Showing ' + visible.length + ' of ' + all.length + ' expenses'
                : all.length + ' expenses in total';
        }
        markSortedColumn();
    }

    function hasFilters() {
        return Boolean(state.search || state.category !== 'all');
    }

    function rowMarkup(exp) {
        return '<tr data-id="' + CF.escapeHtml(exp.id) + '">' +
            '<td class="expense-name">' + CF.escapeHtml(exp.expense) + '</td>' +
            '<td>' + CF.categoryBadge(exp.category) + '</td>' +
            '<td class="amount-cell">' + CF.formatINR(exp.amount) + '</td>' +
            '<td class="date-cell">' + CF.formatDate(exp.date) + '</td>' +
            '<td class="date-cell">' + CF.formatTime(exp.time) + '</td>' +
            '<td><div class="row-actions">' +
            '<button class="action-btn edit" data-action="edit" data-id="' + CF.escapeHtml(exp.id) +
            '" title="Edit expense" aria-label="Edit expense"><i class="fas fa-pen"></i></button>' +
            '<button class="action-btn delete" data-action="delete" data-id="' + CF.escapeHtml(exp.id) +
            '" title="Delete expense" aria-label="Delete expense"><i class="fas fa-trash"></i></button>' +
            '</div></td></tr>';
    }

    function markSortedColumn() {
        const headers = document.querySelectorAll('#expense-table th.sortable');
        headers.forEach(function (th) {
            th.classList.remove('sorted');
            const icon = th.querySelector('.sort-icon');
            icon.className = 'fas sort-icon fa-sort';
        });
        headers.forEach(function (th) {
            if (th.dataset.sort === state.sortKey) {
                th.classList.add('sorted');
                const icon = th.querySelector('.sort-icon');
                icon.className = 'fas sort-icon ' + (state.sortDir === 1 ? 'fa-sort-up' : 'fa-sort-down');
            }
        });
    }

    function sum(list) {
        return list.reduce(function (acc, exp) { return acc + (Number(exp.amount) || 0); }, 0);
    }

    function loadExpenses() {
        render();
    }

    /* ---- Category filter options ---- */
    function populateCategoryFilter() {
        const select = document.getElementById('category-filter');
        const options = CF.CATEGORIES.slice();
        options.sort(function (a, b) { return a.name.localeCompare(b.name); });
        options.unshift({ name: 'All Categories' });
        options.forEach(function (cat) {
            const option = document.createElement('option');
            option.value = cat.name === 'All Categories' ? 'all' : cat.name;
            option.textContent = cat.name;
            select.appendChild(option);
        });
    }

    /* ---- Delete ---- */
    async function deleteExpense(id) {
        const confirmed = await CF.confirmDialog(
            'This will permanently remove this expense. You cannot undo this action.',
            { title: 'Delete expense', confirmText: 'Delete', danger: true, icon: 'fa-trash' }
        );
        if (!confirmed) return;

        const userExpenses = getUserExpenses();
        const index = userExpenses.findIndex(function (exp) { return exp.id === id; });
        if (index === -1) return;

        userExpenses.splice(index, 1);
        saveUserExpenses(userExpenses);
        render();
        CF.toast('Expense deleted.', 'info');
    }

    /* ---- Edit ---- */
    function openEditModal(id) {
        const userExpenses = getUserExpenses();
        const exp = userExpenses.find(function (item) { return item.id === id; });
        if (!exp) return;

        const options = CF.CATEGORIES.map(function (cat) {
            return '<option value="' + CF.escapeHtml(cat.name) + '"' +
                (cat.name === exp.category ? ' selected' : '') + '>' + CF.escapeHtml(cat.name) + '</option>';
        }).join('');

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML =
            '<div class="modal-box" role="dialog" aria-modal="true" aria-label="Edit expense">' +
            '<div class="modal-header"><h3><i class="fas fa-pen"></i> Edit Expense</h3>' +
            '<button class="modal-close js-close" aria-label="Close"><i class="fas fa-xmark"></i></button></div>' +
            '<form class="edit-form">' +
            '<div class="form-group"><label for="edit-expense">Expense Name</label>' +
            '<input type="text" id="edit-expense" class="form-control" maxlength="120">' +
            '<small class="input-error" id="edit-expense-error"></small></div>' +
            '<div class="form-group"><label for="edit-category">Category</label>' +
            '<select id="edit-category" class="form-control">' + options + '</select></div>' +
            '<div class="form-grid">' +
            '<div class="form-group"><label for="edit-amount">Amount (₹)</label>' +
            '<div class="amount-input-wrap"><input type="number" id="edit-amount" class="form-control" min="0.01" step="0.01" inputmode="decimal">' +
            '</div><small class="input-error" id="edit-amount-error"></small></div>' +
            '<div class="form-group"><label for="edit-date">Date</label>' +
            '<input type="date" id="edit-date" class="form-control">' +
            '<small class="input-error" id="edit-date-error"></small></div>' +
            '<div class="form-group"><label for="edit-time">Time</label>' +
            '<input type="time" id="edit-time" class="form-control"></div>' +
            '</div>' +
            '<div class="modal-footer">' +
            '<button type="button" class="btn btn-ghost js-close">Cancel</button>' +
            '<button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Changes</button>' +
            '</div></form></div>';

        document.body.appendChild(overlay);

        document.getElementById('edit-expense').value = exp.expense || '';
        document.getElementById('edit-category').value = exp.category || '';
        document.getElementById('edit-amount').value = exp.amount;
        document.getElementById('edit-date').value = exp.date || '';
        document.getElementById('edit-time').value = exp.time || '';

        overlay.querySelectorAll('.js-close').forEach(function (btn) {
            btn.addEventListener('click', function () { overlay.remove(); });
        });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });
        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') overlay.remove();
        });

        overlay.querySelector('.edit-form').addEventListener('submit', function (e) {
            e.preventDefault();
            saveEdit(id, overlay);
        });

        document.getElementById('edit-expense').focus();
    }

    function saveEdit(id, overlay) {
        const expense = document.getElementById('edit-expense').value.trim();
        const category = document.getElementById('edit-category').value;
        const amount = parseFloat(document.getElementById('edit-amount').value);
        const date = document.getElementById('edit-date').value;
        const time = document.getElementById('edit-time').value;

        let valid = true;
        const set = function (ok, inputId, msg) {
            if (!ok) {
                document.getElementById(inputId).classList.add('is-invalid');
                document.getElementById(inputId + '-error').textContent = msg;
                document.getElementById(inputId + '-error').classList.add('show');
                valid = false;
            }
        };
        set(expense.length >= 2, 'edit-expense', 'Name must be at least 2 characters.');
        set(Number.isFinite(amount) && amount > 0, 'edit-amount', 'Enter a valid amount.');
        set(date !== '', 'edit-date', 'Pick a date.');
        if (!valid) return;

        const userExpenses = getUserExpenses();
        const exp = userExpenses.find(function (item) { return item.id === id; });
        if (!exp) return;
        exp.expense = expense;
        exp.category = category;
        exp.amount = Math.round(amount * 100) / 100;
        exp.date = date;
        exp.time = time;
        saveUserExpenses(userExpenses);
        overlay.remove();
        render();
        CF.toast('Expense updated.', 'success');
    }

    /* ---- Export ---- */
    function exportCSV() {
        const visible = getVisible();
        if (visible.length === 0) {
            CF.toast('Nothing to export. Add an expense first.', 'info');
            return;
        }

        const header = ['Expense', 'Category', 'Amount (INR)', 'Date', 'Time'];
        const rows = visible.map(function (exp) {
            return [exp.expense, exp.category, Number(exp.amount || 0).toFixed(2),
            CF.formatDate(exp.date), CF.formatTime(exp.time)];
        });

        const lines = [header].concat(rows).map(function (row) {
            return row.map(csvField).join(',');
        });
        const csv = '\uFEFF' + lines.join('\r\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'capital-flow-expenses_' + new Date().toISOString().split('T')[0] + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        CF.toast('Report exported.', 'success');
    }

    // Mitigate CSV formula injection: cells starting with =, +, -, @ or control chars are neutralized.
    function csvField(value) {
        let text = String(value == null ? '' : value);
        if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
    }
})();