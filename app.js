// Oracle Time Tracker - Core Application
// Global state, initialization, navigation, timer UI, and freelancer views
// Utilities → utils.js | Auth → auth.js | Data → data.js
// ============================================================

let supabaseClient = null;
let currentUser = null;
let currentTeamMember = null;
let isAdmin = false;
let timeBlocks = [];
let sessions = [];
let currentFilter = 'today';
let weeklyChart = null;
let currentWeekOffset = 0;
let teamMembers = [];
let mergedProjects = [];
let realtimeChannel = null;

debug('[Tracker] Starting...');

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.supabase === 'undefined') {
        toast('Failed to load Supabase. Refresh the page.', 'error');
        return;
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        toast('Supabase is not configured. Check environment variables.', 'error');
        console.error('[Init] Missing SUPABASE_URL or SUPABASE_ANON_KEY. Run `npm run build` locally or set env vars in Netlify.');
        return;
    }

    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                flowType: 'implicit',
                detectSessionInUrl: true
            }
        });

        supabaseClient.auth.onAuthStateChange((event, session) => {
            debug('[Auth] State change:', event);
            if (session && session.user) {
                currentUser = session.user;
                initializeApp();
            } else {
                currentUser = null;
                showLogin();
            }
        });

        // Handle OAuth redirect
        if (window.location.hash && window.location.hash.includes('access_token')) {
            supabaseClient.auth.getSession();
        }
    } catch (err) {
        console.error('[Init] Error:', err);
        toast('Initialization failed', 'error');
    }

    setupNavigation();

    // Close modal on overlay click
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
            e.target.classList.remove('active');
        }
    });
});

// ============================================================
// NAVIGATION
// ============================================================
const PAGE_TITLES = {
    'timer': { title: 'Timer', subtitle: 'Track your work time' },
    'my-time': { title: 'My Time', subtitle: 'View your tracked time entries' },
    'my-weekly': { title: 'Weekly Summary', subtitle: 'Your weekly hours and earnings' },
    'my-timesheets': { title: 'My Timesheets', subtitle: 'Review and dispute your timesheet entries' },
    'time-review': { title: 'Time Review', subtitle: 'Review screenshots and approve time' },
    'weekly-reports': { title: 'Weekly Reports', subtitle: 'Team hours and costs by week' },
    'team-management': { title: 'Team Management', subtitle: 'Manage team members and rates' },
    'projects': { title: 'Projects', subtitle: 'Manage active projects and budgets' },
    'settings': { title: 'Settings', subtitle: 'Profile and tracker configuration' },
};

function setupNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(item.dataset.page);
        });
    });
}

const ADMIN_ONLY_PAGES = ['time-review', 'weekly-reports', 'team-management', 'projects'];

function navigateTo(page) {
    // Block freelancers from accessing admin-only pages
    if (!isAdmin && ADMIN_ONLY_PAGES.includes(page)) {
        console.warn('[Nav] Access denied: freelancers cannot access', page);
        toast('Access denied. Admin only.', 'error');
        navigateTo('timer');
        return;
    }

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navItem) navItem.classList.add('active');

    // Update page visibility
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');

    // Update header
    const info = PAGE_TITLES[page] || { title: page, subtitle: '' };
    document.getElementById('pageTitle').textContent = info.title;
    document.getElementById('pageSubtitle').textContent = info.subtitle;

    // Load page data
    switch (page) {
        case 'my-time':
            renderMyTime(currentFilter);
            break;
        case 'my-weekly':
            renderMyWeekly();
            break;
        case 'my-timesheets':
            renderMyTimesheets();
            break;
        case 'time-review':
            if (typeof loadTimeReview === 'function') loadTimeReview();
            break;
        case 'weekly-reports':
            if (typeof renderWeeklyReports === 'function') renderWeeklyReports();
            break;
        case 'team-management':
            if (typeof renderTeamManagement === 'function') renderTeamManagement();
            break;
        case 'projects':
            if (typeof renderProjectManagement === 'function') renderProjectManagement();
            break;
    }

    // Close mobile sidebar
    document.querySelector('.sidebar')?.classList.remove('open');
}

function toggleSidebar() {
    document.querySelector('.sidebar')?.classList.toggle('open');
}

// ============================================================
// TIMER UI
// ============================================================
function setupTimerCallbacks() {
    const engine = window.timerEngine;

    engine.onTick = (data) => {
        document.getElementById('trackerDisplay').textContent = formatTime(data.totalElapsed);

        updateBlockProgress(data.blockProgress);

        const blockMin = Math.floor(data.blockElapsed / 60);
        const blockSec = data.blockElapsed % 60;
        document.getElementById('blockLabel').textContent =
            `10-minute block: ${blockMin}:${String(blockSec).padStart(2, '0')} / 10:00`;

        const activity = window.activityTracker?.getLivePercent() || 0;
        updateActivityDisplay(activity);

        document.getElementById('sessionBlocks').textContent = data.completedBlocks;
        document.getElementById('sessionDuration').textContent = formatDuration(data.totalElapsed);
        document.getElementById('sessionActivity').textContent = activity + '%';

        updateHeaderStatus(true, data.blockNumber);
    };

    engine.onBlockComplete = async (block) => {
        toast('Block ' + block.blockNumber + ' completed! (' + block.activityPercent + '% activity)', 'success');

        // Upload screenshot
        let screenshotUrl = null;
        if (block.screenshot && supabaseClient) {
            screenshotUrl = await window.screenshotCapture.uploadToStorage(
                supabaseClient,
                currentTeamMember.id,
                engine.sessionId,
                block.blockNumber
            );
        }

        // Save to Supabase
        await saveTimeBlock(block, screenshotUrl);

        // Update session blocks list
        renderSessionBlocks();
    };

    engine.onScreenshotNeeded = async () => {
        const frame = await window.screenshotCapture.captureFrame();
        if (frame) {
            updateScreenshotPreview(frame);
            debug('[Timer] Screenshot captured for block', engine.currentBlockNumber);
        }
    };

    engine.onStateChange = () => {
        updateTimerUI();
    };
}

async function toggleTimer() {
    const engine = window.timerEngine;

    if (engine.state === 'running') {
        engine.stop();
        window.activityTracker.stop();
        window.screenshotCapture.stopPreviewUpdates();
        updateTimerUI();
        updateHeaderStatus(false);
        toast('Timer stopped', 'success');
    } else {
        const projectId = document.getElementById('trackerProject').value;
        const memo = document.getElementById('trackerMemo').value;

        if (!projectId) {
            toast('Please select a project first', 'error');
            return;
        }

        const hasCapture = await window.screenshotCapture.requestPermission();
        if (!hasCapture) {
            toast('Screen capture declined. Timer will run without screenshots.', 'error');
        }

        window.activityTracker.start();
        engine.start(projectId, memo);

        if (hasCapture) {
            window.screenshotCapture.startPreviewUpdates((frame) => {
                updateScreenshotPreview(frame);
            });
        }

        updateTimerUI();
        toast('Timer started! Tracking in 10-minute blocks.', 'success');
    }
}

function resetTimer() {
    const engine = window.timerEngine;
    if (engine.state === 'running') {
        toast('Stop the timer before resetting', 'error');
        return;
    }

    engine.reset();
    window.activityTracker.stop();
    window.screenshotCapture.revokePermission();

    document.getElementById('trackerDisplay').textContent = '00:00:00';
    document.getElementById('blockLabel').textContent = '10-minute block: 0:00 / 10:00';
    document.getElementById('sessionBlocks').textContent = '0';
    document.getElementById('sessionDuration').textContent = '0:00';
    document.getElementById('sessionActivity').textContent = '0%';
    document.getElementById('activityPercent').textContent = '0%';
    document.getElementById('activityBarFill').style.width = '0%';
    resetBlockProgress();
    resetScreenshotPreview();
    renderSessionBlocks();
    updateHeaderStatus(false);

    toast('Timer reset', 'success');
}

async function saveSession() {
    const engine = window.timerEngine;
    if (engine.state === 'running') {
        toast('Stop the timer before saving', 'error');
        return;
    }

    if (engine.completedBlocks.length === 0) {
        toast('No blocks to save', 'error');
        return;
    }

    toast('Session saved! ' + engine.completedBlocks.length + ' blocks recorded.', 'success');
    engine.reset();
    window.screenshotCapture.revokePermission();
    resetTimer();

    await loadTimeBlocks();
}

function updateTimerUI() {
    const engine = window.timerEngine;
    const isRunning = engine.state === 'running';
    const btn = document.getElementById('btnStartStop');

    document.getElementById('playIcon').style.display = isRunning ? 'none' : 'block';
    document.getElementById('stopIcon').style.display = isRunning ? 'block' : 'none';

    btn.classList.toggle('running', isRunning);

    const statusInline = document.getElementById('trackerStatusInline');
    if (statusInline) {
        const dot = statusInline.querySelector('.status-dot');
        const text = statusInline.querySelector('span:last-child');
        dot.classList.toggle('running', isRunning);
        text.textContent = isRunning ? 'Running - Block ' + engine.currentBlockNumber : 'Stopped';
    }

    if (isRunning && engine.projectId) {
        document.getElementById('trackerProject').value = engine.projectId;
    }
    if (isRunning && engine.memo) {
        document.getElementById('trackerMemo').value = engine.memo;
    }

    document.getElementById('trackerProject').disabled = isRunning;
    document.getElementById('trackerMemo').disabled = isRunning;
}

function updateBlockProgress(progress) {
    const segments = document.querySelectorAll('.block-segment');
    const filledCount = Math.floor(progress * 10);
    const currentIdx = filledCount < 10 ? filledCount : 9;

    segments.forEach((seg, i) => {
        seg.classList.remove('filled', 'current');
        if (i < filledCount) {
            seg.classList.add('filled');
        } else if (i === currentIdx && progress < 1) {
            seg.classList.add('current');
        }
    });
}

function resetBlockProgress() {
    document.querySelectorAll('.block-segment').forEach(seg => {
        seg.classList.remove('filled', 'current');
    });
}

function updateActivityDisplay(percent) {
    document.getElementById('activityPercent').textContent = percent + '%';
    const fill = document.getElementById('activityBarFill');
    fill.style.width = percent + '%';
    fill.className = 'activity-bar-fill';
    if (percent < 30) fill.classList.add('low');
    else if (percent < 60) fill.classList.add('medium');
}

function updateScreenshotPreview(base64) {
    const preview = document.getElementById('screenshotPreview');
    preview.innerHTML = `<img src="${base64}" alt="Screen capture">`;
}

function resetScreenshotPreview() {
    const preview = document.getElementById('screenshotPreview');
    preview.innerHTML = `
        <div class="no-capture">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="32" height="32"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            <p>Screen capture starts when you begin tracking</p>
        </div>`;
}

function updateHeaderStatus(running, blockNumber) {
    const status = document.getElementById('headerTrackerStatus');
    if (!status) return;

    const dot = status.querySelector('.status-dot');
    const text = status.querySelector('.status-text');

    if (running) {
        status.classList.add('running');
        dot.classList.add('running');
        text.textContent = 'Tracking - Block ' + (blockNumber || 1);
    } else {
        status.classList.remove('running');
        dot.classList.remove('running');
        text.textContent = 'Idle';
    }
}

function renderSessionBlocks() {
    const list = document.getElementById('sessionBlocksList');
    const blocks = window.timerEngine?.completedBlocks || [];

    if (blocks.length === 0) {
        list.innerHTML = '<div class="empty-state">No blocks recorded yet</div>';
        return;
    }

    list.innerHTML = blocks.map(b => `
        <div class="list-item">
            ${b.screenshot
                ? `<img class="screenshot-thumb" src="${b.screenshot}" alt="Block ${b.blockNumber}" onclick="viewScreenshot('${b.screenshot}', ${b.blockNumber})">`
                : `<div class="list-icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>`
            }
            <div class="list-info">
                <div class="list-title">Block ${b.blockNumber}${b.isPartial ? ' (partial)' : ''}</div>
                <div class="list-meta">${formatTimeRange(b.startTime, b.endTime)}</div>
            </div>
            <span class="badge ${getActivityBadgeClass(b.activityPercent)}">${b.activityPercent}%</span>
        </div>
    `).join('');
}

// ============================================================
// MY TIME VIEW
// ============================================================
function filterMyTime(filter) {
    currentFilter = filter;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    renderMyTime(filter);
}

function renderMyTime(filter) {
    const myBlocks = timeBlocks.filter(b => b.user_id === currentTeamMember.id);
    let filtered;

    switch (filter) {
        case 'today':
            filtered = myBlocks.filter(b => isToday(new Date(b.start_time)));
            break;
        case 'week':
            filtered = myBlocks.filter(b => isThisWeek(new Date(b.start_time)));
            break;
        case 'month':
            filtered = myBlocks.filter(b => isThisMonth(new Date(b.start_time)));
            break;
        default:
            filtered = myBlocks;
    }

    // Update stats
    const todayBlocks = myBlocks.filter(b => isToday(new Date(b.start_time)));
    const weekBlocks = myBlocks.filter(b => isThisWeek(new Date(b.start_time)));

    const todaySecs = todayBlocks.reduce((s, b) => s + (b.duration_seconds || 0), 0);
    const weekSecs = weekBlocks.reduce((s, b) => s + (b.duration_seconds || 0), 0);
    const avgActivity = weekBlocks.length > 0
        ? Math.round(weekBlocks.reduce((s, b) => s + (b.activity_percent || 0), 0) / weekBlocks.length)
        : 0;
    const earnings = calculateEarnings(weekSecs, currentTeamMember.hourlyRate);

    document.getElementById('myTodayHours').textContent = formatDuration(todaySecs);
    document.getElementById('myWeekHours').textContent = formatDuration(weekSecs);
    document.getElementById('myActivityAvg').textContent = avgActivity + '%';
    document.getElementById('myEarnings').textContent = formatCurrency(earnings, currentTeamMember.currency);

    const list = document.getElementById('myTimeList');
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">No time entries for this period.</div>';
        return;
    }

    list.innerHTML = filtered.map(b => `
        <div class="list-item" id="block-row-${b.id}">
            ${b.screenshot_url
                ? `<img class="screenshot-thumb" src="${b.screenshot_url}" alt="Block" onclick="viewScreenshot('${b.screenshot_url}', ${b.block_number})">`
                : `<div class="list-icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>`
            }
            <div class="list-info">
                <div class="list-title">${escapeHtml(b.project_name || 'No Project')}${b.memo ? ' - ' + escapeHtml(b.memo) : ''}</div>
                <div class="list-meta">${formatTimeRange(b.start_time, b.end_time)} &middot; Block ${b.block_number}</div>
            </div>
            <span class="badge ${getActivityBadgeClass(b.activity_percent)}">${b.activity_percent || 0}%</span>
            <div class="list-amount">${Math.round((b.duration_seconds || 0) / 60)}m</div>
            <button class="btn btn-ghost btn-sm block-delete-btn" onclick="deleteMyBlock('${b.id}')" title="Remove this session" aria-label="Delete session">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
        </div>
    `).join('');
}

// ============================================================
// MY WEEKLY VIEW
// ============================================================
function renderMyWeekly() {
    const myBlocks = timeBlocks.filter(b => b.user_id === currentTeamMember.id && isThisWeek(new Date(b.start_time)));
    const totalSecs = myBlocks.reduce((s, b) => s + (b.duration_seconds || 0), 0);
    const earnings = calculateEarnings(totalSecs, currentTeamMember.hourlyRate);
    const avgActivity = myBlocks.length > 0
        ? Math.round(myBlocks.reduce((s, b) => s + (b.activity_percent || 0), 0) / myBlocks.length)
        : 0;

    document.getElementById('weeklyTotalHours').textContent = formatDuration(totalSecs);
    document.getElementById('weeklyEarnings').textContent = formatCurrency(earnings, currentTeamMember.currency);
    document.getElementById('weeklyActivity').textContent = avgActivity + '%';
    document.getElementById('weeklyBlocks').textContent = myBlocks.length;

    renderWeeklyChart(myBlocks);
    renderDailyBreakdown(myBlocks);
}

function renderWeeklyChart(blocks) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hoursPerDay = new Array(7).fill(0);

    blocks.forEach(b => {
        const date = new Date(b.start_time);
        let dayIdx = date.getDay() - 1;
        if (dayIdx < 0) dayIdx = 6; // Sunday
        hoursPerDay[dayIdx] += (b.duration_seconds || 0) / 3600;
    });

    const ctx = document.getElementById('weeklyChart');
    if (!ctx) return;

    if (weeklyChart) weeklyChart.destroy();

    weeklyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days,
            datasets: [{
                label: 'Hours',
                data: hoursPerDay.map(h => Math.round(h * 10) / 10),
                backgroundColor: '#18181B',
                borderRadius: 6,
                barThickness: 32,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#F4F4F5' },
                    ticks: { font: { family: "'JetBrains Mono'" } }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { family: "'Inter'" } }
                }
            }
        }
    });
}

function renderDailyBreakdown(blocks) {
    const container = document.getElementById('dailyBreakdown');
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const weekStart = getWeekStart(new Date());

    let html = '';
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + i);

        const dayBlocks = blocks.filter(b => {
            const bd = new Date(b.start_time);
            return bd.toDateString() === dayDate.toDateString();
        });

        const secs = dayBlocks.reduce((s, b) => s + (b.duration_seconds || 0), 0);
        const activity = dayBlocks.length > 0
            ? Math.round(dayBlocks.reduce((s, b) => s + (b.activity_percent || 0), 0) / dayBlocks.length)
            : 0;
        const earnings = calculateEarnings(secs, currentTeamMember.hourlyRate);

        html += `
            <div class="daily-row">
                <div class="daily-day">${days[i]}</div>
                <div class="daily-hours">${formatDuration(secs)}</div>
                <div class="daily-blocks">${dayBlocks.length} blocks</div>
                <div class="daily-activity">
                    <span class="badge ${getActivityBadgeClass(activity)}">${activity}%</span>
                </div>
                <div class="daily-earnings">${formatCurrency(earnings, currentTeamMember.currency)}</div>
            </div>`;
    }

    container.innerHTML = html || '<div class="empty-state">No data for this week</div>';
}

// ============================================================
// MY TIMESHEETS VIEW
// ============================================================
let currentTimesheetFilter = 'all';
let disputingBlockId = null;

function filterTimesheets(filter) {
    currentTimesheetFilter = filter;
    document.querySelectorAll('[data-tsfilter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tsfilter === filter);
    });
    renderMyTimesheets();
}

function renderMyTimesheets() {
    const myBlocks = timeBlocks.filter(b => b.user_id === currentTeamMember.id);

    const approved = myBlocks.filter(b => b.status === 'approved');
    const pending = myBlocks.filter(b => b.status === 'pending');
    const disputed = myBlocks.filter(b => b.status === 'disputed');
    const removed = myBlocks.filter(b => b.status === 'removed');

    document.getElementById('tsApprovedCount').textContent = approved.length;
    document.getElementById('tsPendingCount').textContent = pending.length;
    document.getElementById('tsDisputedCount').textContent = disputed.length + removed.length;

    const outstandingBlocks = myBlocks.filter(b => b.status !== 'disputed' && b.status !== 'removed');
    const outstandingSecs = outstandingBlocks.reduce((s, b) => s + (b.duration_seconds || 0), 0);
    const outstandingBalance = calculateEarnings(outstandingSecs, currentTeamMember.hourlyRate);
    document.getElementById('tsOutstandingBalance').textContent = formatCurrency(outstandingBalance, currentTeamMember.currency);

    let filtered;
    if (currentTimesheetFilter === 'all') {
        filtered = myBlocks;
    } else if (currentTimesheetFilter === 'disputed') {
        filtered = myBlocks.filter(b => b.status === 'disputed' || b.status === 'removed');
    } else {
        filtered = myBlocks.filter(b => b.status === currentTimesheetFilter);
    }

    filtered.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

    const list = document.getElementById('tsTimesheetList');
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">No timesheets found for this filter.</div>';
        return;
    }

    list.innerHTML = filtered.map(b => {
        const statusBadge = b.status === 'approved'
            ? '<span class="badge badge-success">Approved</span>'
            : b.status === 'removed'
                ? '<span class="badge badge-danger">Removed</span>'
                : b.status === 'disputed'
                    ? '<span class="badge badge-danger">Disputed</span>'
                    : '<span class="badge badge-warning">Pending</span>';

        const activityClass = getActivityBadgeClass(b.activity_percent || 0);
        const dateStr = new Date(b.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const earnings = calculateEarnings(b.duration_seconds || 0, currentTeamMember.hourlyRate);
        const canDispute = b.status === 'pending';

        return `
            <div class="list-item">
                ${b.screenshot_url
                    ? `<img class="screenshot-thumb" src="${b.screenshot_url}" alt="Block" onclick="viewScreenshot('${b.screenshot_url}', ${b.block_number})">`
                    : `<div class="list-icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>`
                }
                <div class="list-info">
                    <div class="list-title">${escapeHtml(b.project_name || 'No Project')}${b.memo ? ' - ' + escapeHtml(b.memo) : ''}</div>
                    <div class="list-meta">${dateStr} &middot; ${formatTimeRange(b.start_time, b.end_time)} &middot; Block ${b.block_number}</div>
                </div>
                <span class="badge ${activityClass}">${b.activity_percent || 0}%</span>
                ${statusBadge}
                <div class="list-amount">${formatCurrency(earnings, currentTeamMember.currency)}</div>
                <div class="list-actions">
                    ${canDispute ? `<button class="btn btn-danger btn-sm" onclick="openFreelancerDispute('${b.id}')">Dispute</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function openFreelancerDispute(blockId) {
    disputingBlockId = blockId;
    document.getElementById('disputeReason').value = '';
    document.getElementById('disputeNotes').value = '';
    openModal('disputeModal');
}

async function confirmFreelancerDispute() {
    if (!disputingBlockId) return;

    const reason = document.getElementById('disputeReason').value;
    if (!reason) {
        toast('Please select a reason for the dispute', 'error');
        return;
    }

    const notes = document.getElementById('disputeNotes').value.trim();
    const disputeInfo = reason + (notes ? ': ' + notes : '');

    try {
        const { error } = await supabaseClient
            .from('tt_time_blocks')
            .update({ status: 'disputed', dispute_reason: disputeInfo })
            .eq('id', disputingBlockId)
            .eq('user_id', currentTeamMember.id);

        if (error) {
            // Fallback: update without dispute_reason column if it doesn't exist
            const { error: fallbackError } = await supabaseClient
                .from('tt_time_blocks')
                .update({ status: 'disputed' })
                .eq('id', disputingBlockId)
                .eq('user_id', currentTeamMember.id);

            if (fallbackError) {
                toast('Failed to dispute timesheet: ' + fallbackError.message, 'error');
                return;
            }
        }

        const idx = timeBlocks.findIndex(b => b.id === disputingBlockId);
        if (idx !== -1) timeBlocks.splice(idx, 1);

        closeModal('disputeModal');
        toast('Timesheet disputed — entry removed from your list', 'success');
        disputingBlockId = null;
        renderMyTimesheets();
        renderMyTime(currentFilter);
    } catch (err) {
        console.error('[Dispute] Error:', err);
        toast('Failed to dispute timesheet', 'error');
    }
}

// ============================================================
// DELETE MY BLOCK
// ============================================================
async function deleteMyBlock(blockId) {
    if (!blockId || !currentTeamMember) return;

    const block = timeBlocks.find(b => b.id === blockId);
    if (!block) return;

    if (block.status === 'approved') {
        toast('Approved sessions cannot be removed — contact your admin', 'error');
        return;
    }

    const mins = Math.round((block.duration_seconds || 0) / 60);
    const label = `${escapeHtml(block.project_name || 'No Project')} — ${mins}m`;

    const confirmed = window.confirm(`Remove this session?\n\n${label}\n\nThis cannot be undone.`);
    if (!confirmed) return;

    const row = document.getElementById(`block-row-${blockId}`);
    if (row) {
        row.style.transition = 'opacity 0.2s, transform 0.2s';
        row.style.opacity = '0';
        row.style.transform = 'translateX(12px)';
    }

    try {
        const { error } = await supabaseClient
            .from('tt_time_blocks')
            .delete()
            .eq('id', blockId)
            .eq('user_id', currentTeamMember.id);

        if (error) throw error;

        const idx = timeBlocks.findIndex(b => b.id === blockId);
        if (idx !== -1) timeBlocks.splice(idx, 1);

        toast('Session removed', 'success');
        renderMyTime(currentFilter);
        renderMyWeekly();
    } catch (err) {
        if (row) { row.style.opacity = ''; row.style.transform = ''; }
        console.error('[DeleteBlock] Error:', err);
        toast('Failed to remove session: ' + (err.message || 'Unknown error'), 'error');
    }
}
window.deleteMyBlock = deleteMyBlock;

// ============================================================
// SETTINGS
// ============================================================
function renderSettings() {
    document.getElementById('settingsName').value = currentTeamMember.name;
    document.getElementById('settingsEmail').value = currentTeamMember.email;
    document.getElementById('settingsRole').value = isAdmin ? 'Admin' : 'Freelancer';
    document.getElementById('settingsRate').value = currentTeamMember.hourlyRate + ' ' + currentTeamMember.currency + '/hr';
}

// ============================================================
// SCREENSHOT MODAL
// ============================================================
function viewScreenshot(url, blockNumber) {
    document.getElementById('modalScreenshotImg').src = url;
    document.getElementById('modalScreenshotTitle').textContent = 'Block ' + blockNumber + ' Screenshot';
    openModal('screenshotModal');
}

// ============================================================
// REALTIME
// ============================================================
function setupRealtime() {
    if (!supabaseClient) return;

    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }

    realtimeChannel = supabaseClient
        .channel('tt_time_blocks_changes')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'tt_time_blocks' },
            (payload) => {
                const newBlock = payload.new;
                if (!timeBlocks.find(b => b.id === newBlock.id)) {
                    timeBlocks.unshift(newBlock);
                }
                if (isAdmin && typeof renderProjectManagement === 'function') {
                    renderProjectManagement();
                }
            }
        )
        .subscribe();
}
