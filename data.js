// Oracle Time Tracker - Data Layer
// Supabase queries: team members, projects, time blocks, sync
// ============================================================

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
                debug('[Projects] Merged', data.length, 'Supabase projects with', TT_PROJECTS.length, 'local projects');
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
            debug('[Team] Loaded', teamMembers.length, 'members from Supabase');
        } else {
            teamMembers = [...TT_TEAM];
            debug('[Team] No Supabase data, using config.js fallback');
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
// TIME BLOCKS
// ============================================================
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
        debug('[Data] Loaded', timeBlocks.length, 'time blocks');
    } catch (err) {
        console.error('[Data] Load error:', err);
    }
}

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
        pending.push({
            ...block,
            screenshotUrl,
            projectId: window.timerEngine?.projectId || '',
            timestamp: Date.now()
        });
        localStorage.setItem('tt_pending_blocks', JSON.stringify(pending));
        debug('[Data] Block stored locally for later sync (' + pending.length + ' pending)');
    } catch (err) {
        console.error('[Data] Local storage error:', err);
    }
}

async function syncPendingBlocks() {
    if (!supabaseClient || !currentTeamMember) return;

    let pending;
    try {
        pending = JSON.parse(localStorage.getItem('tt_pending_blocks') || '[]');
    } catch (parseErr) {
        console.error('[Sync] Corrupted pending blocks in localStorage, clearing:', parseErr);
        localStorage.removeItem('tt_pending_blocks');
        return;
    }
    if (!pending.length) return;

    debug('[Sync] Attempting to sync', pending.length, 'pending blocks...');
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
        debug('[Sync] Synced', synced, 'pending blocks.', failed.length, 'remaining.');
        toast('Synced ' + synced + ' pending time blocks', 'success');
        await loadTimeBlocks();
    }
    if (failed.length > 0) {
        console.warn('[Sync]', failed.length, 'blocks still pending (auth or RLS issue)');
    }
}

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
