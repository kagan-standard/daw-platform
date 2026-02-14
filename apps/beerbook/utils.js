/* ============================================
   BeerBook — Utility Functions
   ============================================ */

const Utils = {
    // Toast notifications
    toast(message, type = 'info', duration = 3500) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    // Generate star display
    stars(rating) {
        const full = Math.floor(rating);
        const half = rating % 1 >= 0.5 ? 1 : 0;
        const empty = 5 - full - half;
        return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
    },

    // Relative time
    timeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);

        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    // Format date
    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    },

    // Generate unique ID
    uid() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    // Debounce
    debounce(fn, ms = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    },

    // Get initials from name
    initials(name) {
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    },

    // Truncate text
    truncate(str, len = 100) {
        if (!str || str.length <= len) return str || '';
        return str.slice(0, len).trim() + '…';
    },

    // Rating labels
    ratingLabel(val) {
        const labels = { 1: 'Poor', 2: 'Below Average', 3: 'Average', 4: 'Great', 5: 'Outstanding' };
        return labels[val] || 'Select a rating';
    },

    // Local storage helpers
    storage: {
        get(key, fallback = null) {
            try {
                const val = localStorage.getItem(`beerbook_${key}`);
                return val ? JSON.parse(val) : fallback;
            } catch { return fallback; }
        },
        set(key, val) {
            try { localStorage.setItem(`beerbook_${key}`, JSON.stringify(val)); }
            catch (e) { console.warn('Storage write failed:', e); }
        },
        remove(key) {
            localStorage.removeItem(`beerbook_${key}`);
        }
    },

    // Sanitize HTML
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // Compute average
    average(arr) {
        if (!arr.length) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    },

    // Group array by key
    groupBy(arr, key) {
        return arr.reduce((acc, item) => {
            const k = typeof key === 'function' ? key(item) : item[key];
            (acc[k] = acc[k] || []).push(item);
            return acc;
        }, {});
    },

    // Count occurrences
    countBy(arr, key) {
        return arr.reduce((acc, item) => {
            const k = typeof key === 'function' ? key(item) : item[key];
            acc[k] = (acc[k] || 0) + 1;
            return acc;
        }, {});
    }
};
