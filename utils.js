// Oracle Time Tracker - Utility Functions
// Pure helpers with no side effects — safe to call from any module
// ============================================================

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatTimeRange(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    const opts = { hour: 'numeric', minute: '2-digit', hour12: true };
    return s.toLocaleTimeString('en-US', opts) + ' - ' + e.toLocaleTimeString('en-US', opts);
}

function formatCurrency(amount, currency) {
    if (currency === 'ZAR') return 'R' + amount.toFixed(0);
    return '$' + amount.toFixed(2);
}

function calculateEarnings(totalSeconds, hourlyRate) {
    return (totalSeconds / 3600) * hourlyRate;
}

function isToday(date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

function isThisWeek(date) {
    const weekStart = getWeekStart(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return date >= weekStart && date < weekEnd;
}

function isThisMonth(date) {
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function getWeekStart(date, offset = 0) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : TT_CONFIG.weekStartDay);
    d.setDate(diff + (offset * 7));
    d.setHours(0, 0, 0, 0);
    return d;
}

function getWeekEnd(weekStart) {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
}

function getActivityBadgeClass(percent) {
    if (percent >= 60) return 'badge-success';
    if (percent >= 30) return 'badge-warning';
    return 'badge-danger';
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function toast(message, type = '') {
    const container = document.getElementById('toasts');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = message;
    container.appendChild(el);

    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        el.style.transition = 'all 0.2s';
        setTimeout(() => el.remove(), 200);
    }, 3500);
}

function openModal(id) {
    document.getElementById(id)?.classList.add('active');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
}
