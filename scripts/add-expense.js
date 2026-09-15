/* Capital Flow — Add Expense */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        if (!CF.requireAuth()) return;

        const form = document.getElementById('expense-form');
        document.getElementById('date').valueAsDate = new Date();
        form.addEventListener('submit', handleSubmit);
        formatAmountInput();
    });

    function formatAmountInput() {
        const amount = document.getElementById('amount');
        amount.addEventListener('blur', function () {
            const value = parseFloat(amount.value);
            if (Number.isFinite(value)) amount.value = value.toFixed(2);
        });
    }

    function setFieldError(id, message) {
        const input = document.getElementById(id);
        input.classList.add('is-invalid');
        const error = document.getElementById(id + '-error');
        if (error) {
            error.textContent = message;
            error.classList.add('show');
        }
        if (!document.querySelector('.is-invalid:focus')) input.focus();
    }

    function clearErrors(form) {
        form.querySelectorAll('.is-invalid').forEach(function (el) { el.classList.remove('is-invalid'); });
        form.querySelectorAll('.input-error.show').forEach(function (el) { el.classList.remove('show'); });
    }

    function validate(form) {
        const expense = document.getElementById('expense').value.trim();
        const category = document.getElementById('category').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const date = document.getElementById('date').value;
        const time = document.getElementById('time').value;

        let valid = true;
        const set = function (ok, id, message) {
            if (!ok) { setFieldError(id, message); valid = false; }
            return ok;
        };

        if (set(expense.length >= 2, 'expense', 'Give this expense a short name (min 2 characters).')) {}
        if (set(category !== '', 'category', 'Please choose a category.')) {}
        if (set(Number.isFinite(amount) && amount > 0, 'amount', 'Amount must be a positive number.')) {}
        if (set(date !== '', 'date', 'Please pick a date.')) {}
        if (set(time !== '', 'time', 'Please pick a time.')) {}

        return valid;
    }

    function handleSubmit(e) {
        e.preventDefault();
        const form = e.target;
        clearErrors(form);
        if (!validate(form)) return;

        const expense = document.getElementById('expense').value.trim();
        const category = document.getElementById('category').value;
        const amount = Math.round(parseFloat(document.getElementById('amount').value) * 100) / 100;
        const date = document.getElementById('date').value;
        const time = document.getElementById('time').value;

        const username = CF.getUser();
        const expenses = CF.getExpenses();
        if (!expenses[username]) expenses[username] = [];
        expenses[username].push({
            id: CF.uid(),
            expense: expense,
            category: category,
            amount: amount,
            date: date,
            time: time
        });
        CF.saveExpenses(expenses);

        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;

        CF.toast('Expense saved successfully!', 'success');
        setTimeout(function () { window.location.href = 'view-expense.html'; }, 900);
    }
})();