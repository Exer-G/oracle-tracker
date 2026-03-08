// Oracle Time Tracker - Authentication & App Initialization
// Handles Google OAuth, session management, and role-based UI setup
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

        // Unsubscribe from realtime channel
        if (realtimeChannel) {
            await supabaseClient.removeChannel(realtimeChannel);
            realtimeChannel = null;
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
// APP INITIALIZATION
// ============================================================
async function initializeApp() {
    const email = currentUser.email?.toLowerCase();

    // Load team from Supabase (fallback to config.js)
    await loadTeamMembers();

    // Determine role from loaded team (DB role only — no hardcoded bypass)
    currentTeamMember = teamMembers.find(m => m.email.toLowerCase() === email);
    isAdmin = currentTeamMember?.role === 'admin';

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

    // Auto-onboard on first login
    if (typeof markAsOnboarded === 'function') markAsOnboarded();

    debug('[App] Initialized as', isAdmin ? 'admin' : 'freelancer', '-', currentTeamMember.name);
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

    // Admin can also access freelancer views
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
