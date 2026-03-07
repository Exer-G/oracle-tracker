// Oracle Time Tracker - Core Application
// Auth, Navigation, State, Freelancer Views
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
let teamMembers = []; // Loaded from Supabase (or fallback to TT_TEAM)
let mergedProjects = []; // Merged TT_PROJECTS + Supabase projects

console.log('[Tracker] Starting...');

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.supabase === 'undefined') {
        toast('Failed to load Supabase. Refresh the page.', 'error');
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
            console.log('[Auth] State change:', event);
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
});

// ============================================================
// AUTH
// ============================================================
async function signInWithGoogle() {
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + window.location.pathname,
                queryParams: { prompt: 'select_account' }
            }
        });
        if (error) throw error;
    } catch (err) {
        console.error('[Auth] Sign in error:', err);
        toast('Sign in failed: ' + err.message, 'error');
    }
}

async function signOut() {
    try {
        // Stop timer if running
        if (window.timerEngine?.state === 'running') {
            window.timerEngine.stop();
        }
        if (window.screenshotCapture) {
            window.screenshotCapture.revokePermission();
        }
        if (window.activityTracker) {
            window.activityTracker.stop();
        }

        await supabaseClient.auth.signOut();
        showLogin();
    } catch (err) {
        console.error('[Auth] Sign out error:', err);
    }
}

function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('app').classList.remove('visible');
    document.getElementById('app').style.display = 'none';
}

function showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('app').classList.add('visible');
    document.getElementById('app').style.display = 'flex';
}

// ============================================================
// APP INIT
// ============================================================
async function initializeApp() {
    const email = currentUser.email?.toLowerCase();

    // Load team from Supabase (fallback to config.js)
    await loadTeamMembers();

    // Determine role from loaded team
    currentTeamMember = teamMembers.find(m => m.email.toLowerCase() === email);
    isAdmin = currentTeamMember?.role === 'admin' || TT_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email);

    if (!currentTeamMember) {
        toast('Your account is not registered in this team. Contact admin.', 'error');
        return;
    }

    // Strip sensitive data for non-admins: freelancers should only see their own rate
    if (!isAdmin) {
        teamMembers = teamMembers.map(m => {
            if (m.id === currentTeamMember.id) return m; // Keep own data
            return { ...m, hourlyRate: 0, currency: '' }; // Strip other members' rates
        });
    }

    // Update UI
    showApp();
    updateUserCard();
    applyRoleViewport();
    await populateProjectDropdowns();

    // Sync any pending blocks from localStorage, then load data
    await syncPendingBlocks();
    await loadTimeBlocks();

    // Setup timer callbacks
    setupTimerCallbacks();

    // Restore timer if was running
    window.timerEngine.restore();
    if (window.timerEngine.state === 'running') {
        updateTimerUI();
    }

    // Setup realtime
    setupRealtime();

    // Navigate to default page
    if (isAdmin) {
        navigateTo('team-overview');
    } else {
        navigateTo('timer');
    }

    // Render settings
    renderSettings();

    console.log('[App] Initialized as', isAdmin ? 'admin' : 'freelancer', '-', currentTeamMember.name);
}

function updateUserCard() {
    const initials = currentTeamMember.name.split(' ').map(n => n[0]).join('').toUpperCase();
    document.getElementById('userAvatar').textContent = initials;
    document.getElementById('userName').textContent = currentTeamMember.name;
    document.getElementById('userRole').textContent = isAdmin ? 'Admin' : 'Freelancer';
}

function applyRoleViewport() {
    // Show/hide admin nav
    document.querySelectorAll('.admin-nav').forEach(el => {
        el.style.display = isAdmin ? 'block' : 'none';
    });

    // Show/hide freelancer nav
    document.querySelectorAll('.freelancer-nav').forEach(el => {
        el.style.display = isAdmin ? 'none' : 'block';
    });

    // Admin can also access freelancer views (add both)
    if (isAdmin) {
        document.querySelectorAll('.freelancer-nav').forEach(el => {
            el.style.display = 'block';
        });
    }

    // Admin-only buttons in modals
    document.querySelectorAll('.admin-only-btn').forEach(el => {
        el.style.display = isAdmin ? 'inline-flex' : 'none';
    });
}

async function populateProjectDropdowns() {
    // Merge hardcoded projects with Supabase projects table
    let allProjects = [...TT_PROJECTS];

    try {
        if (supabaseClient) {
            const { data } = await supabaseClient
                .from('projects')
                .select('id, name, status')
                .eq('status', 'active')
                .order('name');

            if (data && data.length > 0) {
                const existingIds = new Set(TT_PROJECTS.map(p => p.id));
                const existingNames = new Set(TT_PROJECTS.map(p => p.name.toLowerCase()));
                data.forEach(p => {
                    if (!existingIds.has(p.id) && !existingNames.has(p.name.toLowerCase())) {
                        allProjects.push({ id: p.id, name: p.name, client: '', status: p.status });
                    }
                });
                console.log('[Projects] Merged', data.length, 'Supabase projects with', TT_PROJECTS.length, 'local projects');
            }
        }
    } catch (err) {
        console.warn('[Projects] Could not load from Supabase, using local only:', err);
    }

    mergedProjects = allProjects;
    const activeProjects = allProjects.filter(p => p.status === 'active');
    const selects = ['trackerProject', 'reviewProject'];

    selects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        // Keep first option
        const firstOption = select.options[0];
        select.innerHTML = '';
        select.appendChild(firstOption);

        activeProjects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            select.appendChild(opt);
        });
    });

    // Populate freelancer dropdown for admin
    const reviewFreelancer = document.getElementById('reviewFreelancer');
    if (reviewFreelancer) {
        const freelancers = teamMembers.filter(m => m.role === 'freelancer' && m.status === 'active');
        freelancers.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.name;
            reviewFreelancer.appendChild(opt);
        });
    }

    // Set default date to today
    const reviewDate = document.getElementById('reviewDate');
    if (reviewDate) {
        reviewDate.value = new Date().toISOString().split('T')[0];
    }
}

// ============================================================
// TEAM DATA (Supabase-backed with config.js fallback)
// ============================================================
async function loadTeamMembers() {
    if (!supabaseClient) {
        teamMembers = [...TT_TEAM];
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('tt_team_members')
            .select('*')
            .order('name');

        if (error) throw error;

        if (data && data.length > 0) {
            teamMembers = data.map(m => ({
                id: m.id,
                email: m.email,
                name: m.name,
                role: m.role,
                title: m.title || '',
                hourlyRate: parseFloat(m.hourly_rate) || 0,
                currency: m.currency || 'USD',
                status: m.status || 'active'
            }));
            console.log('[Team] Loaded', teamMembers.length, 'members from Supabase');
        } else {
            teamMembers = [...TT_TEAM];
            console.log('[Team] No Supabase data, using config.js fallback');
        }
    } catch (err) {
        console.error('[Team] Load error, using fallback:', err);
        teamMembers = [...TT_TEAM];
    }
}

async function saveTeamMember(member) {
    if (!supabaseClient || !isAdmin) return { error: 'Unauthorized' };

    try {
        const row = {
            id: member.id,
            email: member.email,
            name: member.name,
            role: member.role || 'freelancer',
            title: member.title || '',
            hourly_rate: member.hourlyRate,
            currency: member.currency || 'USD',
            status: member.status || 'active',
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabaseClient
            .from('tt_team_members')
            .upsert(row, { onConflict: 'id' })
            .select();

        if (error) throw error;

        // Reload team
        await loadTeamMembers();
        return { data };
    } catch (err) {
        console.error('[Team] Save error:', err);
        return { error: err.message };
    }
}

async function deleteTeamMember(memberId) {
    if (!supabaseClient || !isAdmin) return { error: 'Unauthorized' };

    try {
        const { error } = await supabaseClient
            .from('tt_team_members')
            .delete()
            .eq('id', memberId);

        if (error) throw error;

        await loadTeamMembers();
        return {};
    } catch (err) {
        console.error('[Team] Delete error:', err);
        return { error: err.message };
    }
}

// ============================================================
// NAVIGATION
// ============================================================
const PAGE_TITLES = {
    'timer': { title: 'Timer', subtitle: 'Track your work time' },
    'my-time': { title: 'My Time', subtitle: 'View your tracked time entries' },
    'my-weekly': { title: 'Weekly Summary', subtitle: 'Your weekly hours and earnings' },
    'team-overview': { title: 'Team Overview', subtitle: 'Monitor team activity in real-time' },
    'time-review': { title: 'Time Review', subtitle: 'Review screenshots and approve time' },
    'weekly-reports': { title: 'Weekly Reports', subtitle: 'Team hours and costs by week' },
    'team-management': { title: 'Team Management', subtitle: 'Manage team members and rates' },
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

const ADMIN_ONLY_PAGES = ['team-overview', 'time-review', 'weekly-reports', 'team-management'];

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
        case 'team-overview':
            if (typeof renderTeamOverview === 'function') renderTeamOverview();
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
        // Update display
        document.getElementById('trackerDisplay').textContent = formatTime(data.totalElapsed);

        // Update block progress
        updateBlockProgress(data.blockProgress);

        // Update block label
        const blockMin = Math.floor(data.blockElapsed / 60);
        const blockSec = data.blockElapsed % 60;
        document.getElementById('blockLabel').textContent =
            `10-minute block: ${blockMin}:${String(blockSec).padStart(2, '0')} / 10:00`;

        // Update activity
        const activity = window.activityTracker?.getLivePercent() || 0;
        updateActivityDisplay(activity);

        // Update session stats
        document.getElementById('sessionBlocks').textContent = data.completedBlocks;
        document.getElementById('sessionDuration').textContent = formatDuration(data.totalElapsed);
        document.getElementById('sessionActivity').textContent = activity + '%';

        // Update header status
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
            console.log('[Timer] Screenshot captured for block', engine.currentBlockNumber);
        }
    };

    engine.onStateChange = (state) => {
        updateTimerUI();
    };
}

async function toggleTimer() {
    const engine = window.timerEngine;

    if (engine.state === 'running') {
        // Stop
        engine.stop();
        window.activityTracker.stop();
        window.screenshotCapture.stopPreviewUpdates();
        // Don't revoke permission - user can restart
        updateTimerUI();
        updateHeaderStatus(false);
        toast('Timer stopped', 'success');
    } else {
        // Start
        const projectId = document.getElementById('trackerProject').value;
        const memo = document.getElementById('trackerMemo').value;

        if (!projectId) {
            toast('Please select a project first', 'error');
            return;
        }

        // Request screen capture permission
        const hasCapture = await window.screenshotCapture.requestPermission();
        if (!hasCapture) {
            toast('Screen capture declined. Timer will run without screenshots.', 'error');
        }

        // Start systems
        window.activityTracker.start();
        engine.start(projectId, memo);

        // Start preview updates
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

    // Reset UI
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

    // Reload time blocks
    await loadTimeBlocks();
}

function updateTimerUI() {
    const engine = window.timerEngine;
    const isRunning = engine.state === 'running';
    const btn = document.getElementById('btnStartStop');

    // Toggle play/stop icons
    document.getElementById('playIcon').style.display = isRunning ? 'none' : 'block';
    document.getElementById('stopIcon').style.display = isRunning ? 'block' : 'none';

    // Button style
    btn.classList.toggle('running', isRunning);

    // Status indicator
    const statusInline = document.getElementById('trackerStatusInline');
    if (statusInline) {
        const dot = statusInline.querySelector('.status-dot');
        const text = statusInline.querySelector('span:last-child');
        dot.classList.toggle('running', isRunning);
        text.textContent = isRunning ? 'Running - Block ' + engine.currentBlockNumber : 'Stopped';
    }

    // Restore project selection
    if (isRunning && engine.projectId) {
        document.getElementById('trackerProject').value = engine.projectId;
    }
    if (isRunning && engine.memo) {
        document.getElementById('trackerMemo').value = engine.memo;
    }

    // Disable inputs while running
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
// DATA PERSISTENCE
// ============================================================
async function saveTimeBlock(block, screenshotUrl) {
    if (!supabaseClient) return;

    try {
        const projectName = (mergedProjects.length > 0 ? mergedProjects : TT_PROJECTS).find(p => p.id === window.timerEngine.projectId)?.name || '';

        const { error } = await supabaseClient.from('tt_time_blocks').insert({
            user_id: currentTeamMember.id,
            user_name: currentTeamMember.name,
            user_email: currentTeamMember.email,
            session_id: window.timerEngine.sessionId,
            project_id: window.timerEngine.projectId,
            project_name: projectName,
            block_number: block.blockNumber,
            start_time: new Date(block.startTime).toISOString(),
            end_time: new Date(block.endTime).toISOString(),
            duration_seconds: block.durationSeconds,
            screenshot_url: screenshotUrl,
            screenshot_taken_at: block.screenshotTime ? new Date(block.screenshotTime).toISOString() : null,
            activity_percent: block.activityPercent,
            activity_keyboard: block.activityKeyboard || 0,
            activity_mouse: block.activityMouse || 0,
            memo: window.timerEngine.memo,
            hourly_rate: currentTeamMember.hourlyRate,
            currency: currentTeamMember.currency,
            status: 'pending'
        });

        if (error) {
            console.error('[Data] Save block error:', error);
            // Store locally for later sync
            storeBlockLocally(block, screenshotUrl);
        }
    } catch (err) {
        console.error('[Data] Save block error:', err);
        storeBlockLocally(block, screenshotUrl);
    }
}

function storeBlockLocally(block, screenshotUrl) {
    try {
        const pending = JSON.parse(localStorage.getItem('tt_pending_blocks') || '[]');
        pending.push({ ...block, screenshotUrl, timestamp: Date.now() });
        localStorage.setItem('tt_pending_blocks', JSON.stringify(pending));
        console.log('[Data] Block stored locally for later sync (' + pending.length + ' pending)');
    } catch (err) {
        console.error('[Data] Local storage error:', err);
    }
}

async function syncPendingBlocks() {
    if (!supabaseClient || !currentTeamMember) return;

    const pending = JSON.parse(localStorage.getItem('tt_pending_blocks') || '[]');
    if (!pending.length) return;

    console.log('[Sync] Attempting to sync', pending.length, 'pending blocks...');
    const failed = [];
    let synced = 0;

    for (const block of pending) {
        try {
            const projectName = (mergedProjects.length > 0 ? mergedProjects : TT_PROJECTS).find(p => p.id === block.projectId)?.name || block.projectName || '';
            const { error } = await supabaseClient.from('tt_time_blocks').insert({
                user_id: currentTeamMember.id,
                user_name: currentTeamMember.name,
                user_email: currentTeamMember.email,
                session_id: block.sessionId || '',
                project_id: block.projectId || '',
                project_name: projectName,
                block_number: block.blockNumber || 0,
                start_time: block.startTime ? new Date(block.startTime).toISOString() : new Date(block.timestamp).toISOString(),
                end_time: block.endTime ? new Date(block.endTime).toISOString() : new Date(block.timestamp + (block.durationSeconds || 600) * 1000).toISOString(),
                duration_seconds: block.durationSeconds || 600,
                screenshot_url: block.screenshotUrl || null,
                activity_percent: block.activityPercent || 0,
                activity_keyboard: block.activityKeyboard || 0,
                activity_mouse: block.activityMouse || 0,
                memo: block.memo || '',
                hourly_rate: currentTeamMember.hourlyRate || 0,
                currency: currentTeamMember.currency || 'USD',
                status: 'pending'
            });

            if (error) {
                console.warn('[Sync] Block failed:', error.message);
                failed.push(block);
            } else {
                synced++;
            }
        } catch (err) {
            console.warn('[Sync] Block exception:', err);
            failed.push(block);
        }
    }

    localStorage.setItem('tt_pending_blocks', JSON.stringify(failed));
    if (synced > 0) {
        console.log('[Sync] Synced', synced, 'pending blocks.', failed.length, 'remaining.');
        toast('Synced ' + synced + ' pending time blocks', 'success');
        await loadTimeBlocks();
    }
    if (failed.length > 0) {
        console.warn('[Sync]', failed.length, 'blocks still pending (auth or RLS issue)');
    }
}

async function loadTimeBlocks() {
    if (!supabaseClient || !currentTeamMember) return;

    try {
        let query = supabaseClient
            .from('tt_time_blocks')
            .select('*')
            .order('start_time', { ascending: false });

        // Freelancers only see their own
        if (!isAdmin) {
            query = query.eq('user_id', currentTeamMember.id);
        }

        // Limit to last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query = query.gte('start_time', thirtyDaysAgo.toISOString());

        const { data, error } = await query.limit(500);

        if (error) {
            console.error('[Data] Load blocks error:', error);
            return;
        }

        timeBlocks = data || [];
        console.log('[Data] Loaded', timeBlocks.length, 'time blocks');
    } catch (err) {
        console.error('[Data] Load error:', err);
    }
}

// ============================================================
// MY TIME VIEW
// ============================================================
function filterMyTime(filter) {
    currentFilter = filter;

    // Update active filter button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    renderMyTime(filter);
}

function renderMyTime(filter) {
    const myBlocks = timeBlocks.filter(b => b.user_id === currentTeamMember.id);
    const now = new Date();
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

    // Render list
    const list = document.getElementById('myTimeList');
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">No time entries for this period.</div>';
        return;
    }

    list.innerHTML = filtered.map(b => `
        <div class="list-item">
            ${b.screenshot_url
                ? `<img class="screenshot-thumb" src="${b.screenshot_url}" alt="Block" onclick="viewScreenshot('${b.screenshot_url}', ${b.block_number})">`
                : `<div class="list-icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>`
            }
            <div class="list-info">
                <div class="list-title">${b.project_name || 'No Project'} ${b.memo ? '- ' + escapeHtml(b.memo) : ''}</div>
                <div class="list-meta">${formatTimeRange(b.start_time, b.end_time)} &middot; Block ${b.block_number}</div>
            </div>
            <span class="badge ${getActivityBadgeClass(b.activity_percent)}">${b.activity_percent || 0}%</span>
            <div class="list-amount">${Math.round((b.duration_seconds || 0) / 60)}m</div>
        </div>
    `).join('');
}

// ============================================================
// MY WEEKLY VIEW
// ============================================================
function renderMyWeekly() {
    const myBlocks = timeBlocks.filter(b => b.user_id === currentTeamMember.id && isThisWeek(new Date(b.start_time)));
    const totalSecs = myBlocks.reduce((s, b) => s + (b.duration_seconds || 0), 0);
    const totalHours = totalSecs / 3600;
    const earnings = calculateEarnings(totalSecs, currentTeamMember.hourlyRate);
    const avgActivity = myBlocks.length > 0
        ? Math.round(myBlocks.reduce((s, b) => s + (b.activity_percent || 0), 0) / myBlocks.length)
        : 0;

    document.getElementById('weeklyTotalHours').textContent = formatDuration(totalSecs);
    document.getElementById('weeklyEarnings').textContent = formatCurrency(earnings, currentTeamMember.currency);
    document.getElementById('weeklyActivity').textContent = avgActivity + '%';
    document.getElementById('weeklyBlocks').textContent = myBlocks.length;

    // Chart
    renderWeeklyChart(myBlocks);

    // Daily breakdown
    renderDailyBreakdown(myBlocks);
}

function renderWeeklyChart(blocks) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekStart = getWeekStart(new Date());
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
            plugins: {
                legend: { display: false },
            },
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

function openModal(id) {
    document.getElementById(id)?.classList.add('active');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
        e.target.classList.remove('active');
    }
});

// ============================================================
// REALTIME
// ============================================================
function setupRealtime() {
    if (!supabaseClient) return;

    supabaseClient
        .channel('tt_time_blocks_changes')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'tt_time_blocks' },
            (payload) => {
                const newBlock = payload.new;
                // Add if not already present
                if (!timeBlocks.find(b => b.id === newBlock.id)) {
                    timeBlocks.unshift(newBlock);
                }
                // Refresh admin views
                if (isAdmin && typeof renderTeamOverview === 'function') {
                    renderTeamOverview();
                }
            }
        )
        .subscribe();
}

// ============================================================
// UTILITY FUNCTIONS
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

// ============================================================
// SYNC PROJECTS & ALLOCATIONS
// ============================================================
async function syncProjectsAndAllocations() {
    if (!supabaseClient) {
        toast('Not connected to Supabase', 'error');
        return;
    }

    try {
        // Sync projects from Supabase
        const { data: supaProjects } = await supabaseClient
            .from('projects')
            .select('id, name, status, hourly_rate, source, description')
            .order('name');

        if (supaProjects && supaProjects.length > 0) {
            const existingNames = new Set(TT_PROJECTS.map(p => p.name.toLowerCase()));
            mergedProjects = [...TT_PROJECTS, ...supaProjects.filter(p => !existingNames.has(p.name.toLowerCase())).map(p => ({
                id: p.id, name: p.name, client: '', status: p.status || 'active'
            }))];
            await populateProjectDropdowns();
        }

        // Sync team members
        const { data: supaTeam } = await supabaseClient
            .from('tt_team_members')
            .select('*')
            .order('name');

        if (supaTeam && supaTeam.length > 0) {
            teamMembers = supaTeam.map(m => ({
                id: m.id, email: m.email, name: m.name, role: m.role,
                title: m.title || '', hourlyRate: parseFloat(m.hourly_rate) || 0,
                currency: m.currency || 'USD', status: m.status || 'active'
            }));
        }

        toast('Synced projects & team data', 'success');
    } catch (err) {
        console.error('[Sync] Error:', err);
        toast('Sync failed: ' + err.message, 'error');
    }
}

window.syncProjectsAndAllocations = syncProjectsAndAllocations;
