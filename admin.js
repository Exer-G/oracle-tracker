// Oracle Time Tracker - Admin Dashboard
// Team Overview, Time Review (Work Diary), Weekly Reports
// ============================================================

let currentReviewBlockId = null;

// ============================================================
// TEAM OVERVIEW
// ============================================================
function renderTeamOverview() {
    const freelancers = teamMembers.filter(m => m.role === 'freelancer' && m.status === 'active');
    const today = new Date();

    // Count currently tracking (check for recent blocks in last 15 min)
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentBlocks = timeBlocks.filter(b =>
        new Date(b.end_time) >= fifteenMinsAgo
    );
    const trackingUsers = [...new Set(recentBlocks.map(b => b.user_id))];

    // Today's blocks per user
    const todayBlocks = timeBlocks.filter(b => isToday(new Date(b.start_time)));
    const todaySecsByUser = {};
    todayBlocks.forEach(b => {
        todaySecsByUser[b.user_id] = (todaySecsByUser[b.user_id] || 0) + (b.duration_seconds || 0);
    });

    // This week's cost (exclude disputed and removed blocks)
    const weekBlocks = timeBlocks.filter(b => isThisWeek(new Date(b.start_time)) && b.status !== 'disputed' && b.status !== 'removed');
    let weekCost = 0;
    weekBlocks.forEach(b => {
        const member = teamMembers.find(m => m.id === b.user_id);
        if (member) {
            const hours = (b.duration_seconds || 0) / 3600;
            weekCost += hours * member.hourlyRate;
        }
    });

    const teamTodayHours = Object.values(todaySecsByUser).reduce((s, v) => s + v, 0);

    // Update stats
    document.getElementById('totalFreelancers').textContent = freelancers.length;
    document.getElementById('currentlyTracking').textContent = trackingUsers.length;
    document.getElementById('teamTodayHours').textContent = formatDuration(teamTodayHours);
    document.getElementById('teamWeekCost').textContent = '$' + weekCost.toFixed(0);

    // Update badge
    const badge = document.getElementById('teamOnlineBadge');
    if (badge) badge.textContent = trackingUsers.length;

    // Render team list
    const list = document.getElementById('teamList');
    list.innerHTML = freelancers.map(f => {
        const isTracking = trackingUsers.includes(f.id);
        const todaySecs = todaySecsByUser[f.id] || 0;
        const initials = f.name.split(' ').map(n => n[0]).join('').toUpperCase();

        // Find the most recent block to get project info
        const lastBlock = todayBlocks
            .filter(b => b.user_id === f.id)
            .sort((a, b) => new Date(b.end_time) - new Date(a.end_time))[0];

        const currentProject = lastBlock?.project_name || 'No activity today';

        return `
            <div class="team-member">
                <div class="team-avatar">${initials}</div>
                <div class="team-info">
                    <div class="team-name">${escapeHtml(f.name)}</div>
                    <div class="team-project">${escapeHtml(currentProject)}</div>
                </div>
                <div class="team-status">
                    <span class="status-dot ${isTracking ? 'running' : ''}"></span>
                    <span class="badge ${isTracking ? 'badge-success' : 'badge-neutral'}">${isTracking ? 'Tracking' : 'Offline'}</span>
                </div>
                <div class="team-hours">${formatDuration(todaySecs)}</div>
            </div>
        `;
    }).join('');
}

// ============================================================
// TIME REVIEW (Work Diary)
// ============================================================
function loadTimeReview() {
    const freelancerId = document.getElementById('reviewFreelancer')?.value;
    const dateStr = document.getElementById('reviewDate')?.value;
    const projectId = document.getElementById('reviewProject')?.value;

    let filtered = [...timeBlocks];

    // Filter by freelancer
    if (freelancerId) {
        filtered = filtered.filter(b => b.user_id === freelancerId);
    }

    // Filter by date
    if (dateStr) {
        const date = new Date(dateStr);
        filtered = filtered.filter(b => {
            const bd = new Date(b.start_time);
            return bd.toDateString() === date.toDateString();
        });
    }

    // Filter by project
    if (projectId) {
        filtered = filtered.filter(b => b.project_id === projectId);
    }

    // Sort by time
    filtered.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    const grid = document.getElementById('screenshotGrid');

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-state">No time entries found for the selected filters.</div>';
        return;
    }

    grid.innerHTML = filtered.map(b => {
        const activityClass = getActivityBadgeClass(b.activity_percent || 0);
        const activityPercent = b.activity_percent || 0;
        const statusBadge = b.status === 'approved'
            ? '<span class="badge badge-success">Approved</span>'
            : b.status === 'removed'
                ? '<span class="badge badge-danger">Removed</span>'
                : b.status === 'disputed'
                    ? '<span class="badge badge-danger">Disputed</span>'
                    : '<span class="badge badge-warning">Pending</span>';

        return `
            <div class="screenshot-card" data-block-id="${b.id}">
                ${b.screenshot_url
                    ? `<img src="${b.screenshot_url}" alt="Screenshot" onclick="viewScreenshotAdmin('${b.id}')">`
                    : `<div class="no-screenshot-placeholder">No Screenshot</div>`
                }
                <div class="screenshot-card-body">
                    <div class="screenshot-card-time">${formatTimeRange(b.start_time, b.end_time)}</div>
                    <div class="screenshot-card-project">${escapeHtml(b.user_name || '')} &middot; ${escapeHtml(b.project_name || 'No Project')}</div>
                    <div class="activity-bar activity-bar--card">
                        <div class="activity-bar-fill ${activityPercent >= 60 ? '' : activityPercent >= 30 ? 'medium' : 'low'}" style="width:${activityPercent}%"></div>
                    </div>
                    <div class="screenshot-card-footer">
                        ${statusBadge}
                        <div class="screenshot-card-actions">
                            ${b.status === 'pending' ? `
                                <button class="btn btn-success btn-sm" onclick="approveBlockById('${b.id}')">Approve</button>
                                <button class="btn btn-danger btn-sm" onclick="removeBlockById('${b.id}')">Remove</button>
                            ` : b.status === 'approved' ? `
                                <button class="btn btn-danger btn-sm" onclick="removeBlockById('${b.id}')">Remove</button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function viewScreenshotAdmin(blockId) {
    const block = timeBlocks.find(b => b.id === blockId);
    if (!block) return;

    currentReviewBlockId = blockId;
    document.getElementById('modalScreenshotImg').src = block.screenshot_url || '';
    document.getElementById('modalScreenshotTitle').textContent = 'Screenshot - ' + (block.user_name || 'Unknown');
    document.getElementById('modalScreenshotMeta').innerHTML = `
        <strong>Freelancer:</strong> ${escapeHtml(block.user_name || '')}<br>
        <strong>Project:</strong> ${escapeHtml(block.project_name || 'N/A')}<br>
        <strong>Time:</strong> ${formatTimeRange(block.start_time, block.end_time)}<br>
        <strong>Activity:</strong> ${block.activity_percent || 0}%<br>
        <strong>Status:</strong> ${block.status}
    `;

    openModal('screenshotModal');
}

async function approveBlockById(blockId) {
    const block = timeBlocks.find(b => b.id === blockId);
    if (!block) { toast('Block not found', 'error'); return; }
    if (block.status === 'approved') { toast('Already approved', 'success'); return; }

    const ok = await updateBlockStatus(blockId, 'approved');
    if (ok) {
        toast('Block approved', 'success');
        loadTimeReview();
    }
}

async function removeBlockById(blockId) {
    const block = timeBlocks.find(b => b.id === blockId);
    if (!block) { toast('Block not found', 'error'); return; }
    if (block.status === 'removed') { toast('Already removed', 'success'); return; }

    const mins = Math.round((block.duration_seconds || 0) / 60);
    const label = (block.user_name || 'Unknown') + ' — ' + (block.project_name || 'No Project') + ' (' + mins + 'm)';
    if (!confirm('Remove this time block?\n\n' + label + '\n\nThis will deduct the time from weekly reports.')) return;

    const ok = await updateBlockStatus(blockId, 'removed');
    if (ok) {
        toast('Block removed — deducted from reports', 'success');
        loadTimeReview();
    }
}

function approveBlock() {
    if (currentReviewBlockId) {
        approveBlockById(currentReviewBlockId);
        closeModal('screenshotModal');
    }
}

function removeBlock() {
    if (currentReviewBlockId) {
        removeBlockById(currentReviewBlockId);
        closeModal('screenshotModal');
    }
}

async function updateBlockStatus(blockId, status) {
    if (!supabaseClient) { toast('Not connected to database', 'error'); return false; }

    try {
        const { error } = await supabaseClient
            .from('tt_time_blocks')
            .update({ status })
            .eq('id', blockId);

        if (error) {
            console.error('[Admin] Update status error:', error);
            toast('Failed to update block: ' + error.message, 'error');
            return false;
        }

        // Update local cache
        const block = timeBlocks.find(b => b.id === blockId);
        if (block) block.status = status;
        return true;
    } catch (err) {
        console.error('[Admin] Update error:', err);
        toast('Failed to update block: ' + (err.message || 'Unknown error'), 'error');
        return false;
    }
}

// ============================================================
// WEEKLY REPORTS
// ============================================================
function renderWeeklyReports() {
    const weekStart = getWeekStart(new Date(), currentWeekOffset);
    const weekEnd = getWeekEnd(weekStart);

    // Update week display
    const opts = { month: 'short', day: 'numeric' };
    const yearOpts = { month: 'short', day: 'numeric', year: 'numeric' };
    document.getElementById('weekRangeDisplay').textContent =
        weekStart.toLocaleDateString('en-US', opts) + ' - ' + weekEnd.toLocaleDateString('en-US', yearOpts);

    // Filter blocks for this week
    const weekBlocks = timeBlocks.filter(b => {
        const d = new Date(b.start_time);
        return d >= weekStart && d <= weekEnd;
    });

    // Group by user
    const freelancers = teamMembers.filter(m => m.role === 'freelancer' && m.status === 'active');
    const userBlocks = {};
    freelancers.forEach(f => { userBlocks[f.id] = []; });
    weekBlocks.forEach(b => {
        if (userBlocks[b.user_id]) {
            userBlocks[b.user_id].push(b);
        }
    });

    let totalCost = 0;
    let totalHours = 0;

    const list = document.getElementById('reportsList');
    let html = '';

    freelancers.forEach(f => {
        const blocks = userBlocks[f.id] || [];
        // Exclude disputed and removed blocks from hours, cost, and outstanding balance
        const billableBlocks = blocks.filter(b => b.status !== 'disputed' && b.status !== 'removed');
        const totalSecs = billableBlocks.reduce((s, b) => s + (b.duration_seconds || 0), 0);
        const hours = totalSecs / 3600;
        const cost = hours * f.hourlyRate;
        const avgActivity = billableBlocks.length > 0
            ? Math.round(billableBlocks.reduce((s, b) => s + (b.activity_percent || 0), 0) / billableBlocks.length)
            : 0;

        totalCost += cost;
        totalHours += hours;

        if (blocks.length === 0 && currentWeekOffset !== 0) return;
        const billableCount = billableBlocks.length;

        const initials = f.name.split(' ').map(n => n[0]).join('').toUpperCase();
        const approved = blocks.filter(b => b.status === 'approved').length;
        const pending = blocks.filter(b => b.status === 'pending').length;
        const disputed = blocks.filter(b => b.status === 'disputed').length;
        const removed = blocks.filter(b => b.status === 'removed').length;

        let statusBadge;
        if (blocks.length === 0) {
            statusBadge = '<span class="badge badge-neutral">No Data</span>';
        } else if (removed > 0) {
            statusBadge = '<span class="badge badge-danger">Removed (' + removed + ')</span>';
        } else if (disputed > 0) {
            statusBadge = '<span class="badge badge-danger">Disputed (' + disputed + ')</span>';
        } else if (pending > 0) {
            statusBadge = '<span class="badge badge-warning">Pending (' + pending + ')</span>';
        } else {
            statusBadge = '<span class="badge badge-success">Approved</span>';
        }

        html += `
            <div class="report-card">
                <div class="report-avatar">${initials}</div>
                <div class="report-info">
                    <div class="report-name">${escapeHtml(f.name)}</div>
                    <div class="report-role">${escapeHtml(f.title)} &middot; ${f.hourlyRate} ${f.currency}/hr</div>
                </div>
                <div class="report-metrics">
                    <div class="report-metric">
                        <div class="report-metric-value">${hours.toFixed(1)}h</div>
                        <div class="report-metric-label">Hours</div>
                    </div>
                    <div class="report-metric">
                        <div class="report-metric-value">${blocks.length}</div>
                        <div class="report-metric-label">Blocks</div>
                    </div>
                    <div class="report-metric">
                        <div class="report-metric-value">${avgActivity}%</div>
                        <div class="report-metric-label">Activity</div>
                    </div>
                </div>
                <div class="report-cost">${formatCurrency(cost, f.currency)}</div>
                <div class="text-center">${statusBadge}</div>
                <div class="report-actions">
                    ${pending > 0 ? `<button class="btn btn-success btn-sm" onclick="approveAllForUser('${f.id}')">Approve All</button>` : ''}
                </div>
            </div>
        `;
    });

    list.innerHTML = html || '<div class="empty-state">No time entries for this week.</div>';

    // Totals
    const totalsCard = document.getElementById('reportTotals');
    if (weekBlocks.length > 0) {
        totalsCard.style.display = 'block';
        document.getElementById('reportTotalHours').textContent = totalHours.toFixed(1) + 'h';
        document.getElementById('reportTotalCost').textContent = '$' + totalCost.toFixed(0);
    } else {
        totalsCard.style.display = 'none';
    }

    // Cost by project breakdown
    renderProjectCosts(weekStart, weekEnd);
}

function changeWeek(direction) {
    currentWeekOffset += direction;
    renderWeeklyReports();
}

async function approveAllForUser(userId) {
    if (!supabaseClient) { toast('Not connected to database', 'error'); return; }

    const member = teamMembers.find(m => m.id === userId);
    const memberName = member ? member.name : 'this freelancer';

    const weekStart = getWeekStart(new Date(), currentWeekOffset);
    const weekEnd = getWeekEnd(weekStart);

    const pendingBlocks = timeBlocks.filter(b =>
        b.user_id === userId &&
        b.status === 'pending' &&
        new Date(b.start_time) >= weekStart &&
        new Date(b.start_time) <= weekEnd
    );

    if (pendingBlocks.length === 0) {
        toast('No pending blocks to approve', 'success');
        return;
    }

    if (!confirm('Approve all ' + pendingBlocks.length + ' pending blocks for ' + memberName + '?')) return;

    try {
        // Batch update in a single DB call instead of N round-trips
        const { error } = await supabaseClient
            .from('tt_time_blocks')
            .update({ status: 'approved' })
            .in('id', pendingBlocks.map(b => b.id));

        if (error) {
            console.error('[Admin] Batch approve error:', error);
            toast('Failed to approve blocks: ' + error.message, 'error');
            return;
        }

        // Update local cache
        pendingBlocks.forEach(b => {
            const cached = timeBlocks.find(t => t.id === b.id);
            if (cached) cached.status = 'approved';
        });

        toast('Approved ' + pendingBlocks.length + ' blocks for ' + memberName, 'success');
        renderWeeklyReports();
    } catch (err) {
        console.error('[Admin] Batch approve error:', err);
        toast('Failed to approve blocks: ' + (err.message || 'Unknown error'), 'error');
    }
}

// ============================================================
// TEAM MANAGEMENT
// ============================================================
let editingMemberId = null;

function renderTeamManagement() {
    if (!isAdmin) {
        toast('Access denied. Admin only.', 'error');
        return;
    }
    const list = document.getElementById('teamMgmtList');
    if (!list) return;

    const members = teamMembers.filter(m => m.status === 'active');
    const inactive = teamMembers.filter(m => m.status !== 'active');

    list.innerHTML = members.map(m => {
        const initials = m.name.split(' ').map(n => n[0]).join('').toUpperCase();
        const roleBadge = m.role === 'admin'
            ? '<span class="badge badge-info">Admin</span>'
            : '<span class="badge badge-neutral">Freelancer</span>';

        return `
            <div class="team-mgmt-row">
                <div class="team-avatar">${initials}</div>
                <div class="team-mgmt-info">
                    <div class="team-mgmt-name">${escapeHtml(m.name)}</div>
                    <div class="team-mgmt-email">${escapeHtml(m.email)}</div>
                </div>
                <div class="team-mgmt-title">${escapeHtml(m.title || '')}</div>
                <div class="team-mgmt-rate">
                    <span class="rate-value">${m.hourlyRate}</span>
                    <span class="rate-currency">${m.currency}/hr</span>
                </div>
                ${roleBadge}
                <div class="team-mgmt-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editTeamMember('${m.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="confirmRemoveMember('${m.id}', '${escapeHtml(m.name)}')">Remove</button>
                </div>
            </div>
        `;
    }).join('');

    if (inactive.length > 0) {
        list.innerHTML += `
            <div class="section-divider-label">
                Inactive Members (${inactive.length})
            </div>
        `;
        list.innerHTML += inactive.map(m => {
            const initials = m.name.split(' ').map(n => n[0]).join('').toUpperCase();
            return `
                <div class="team-mgmt-row dimmed">
                    <div class="team-avatar">${initials}</div>
                    <div class="team-mgmt-info">
                        <div class="team-mgmt-name">${escapeHtml(m.name)}</div>
                        <div class="team-mgmt-email">${escapeHtml(m.email)}</div>
                    </div>
                    <div class="team-mgmt-title">${escapeHtml(m.title || '')}</div>
                    <div class="team-mgmt-rate">
                        <span class="rate-value">${m.hourlyRate}</span>
                        <span class="rate-currency">${m.currency}/hr</span>
                    </div>
                    <span class="badge badge-neutral">Inactive</span>
                    <div class="team-mgmt-actions">
                        <button class="btn btn-secondary btn-sm" onclick="editTeamMember('${m.id}')">Edit</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Update count
    const countEl = document.getElementById('teamMgmtCount');
    if (countEl) countEl.textContent = members.length + ' active';
}

function openAddMemberModal() {
    if (!isAdmin) { toast('Access denied', 'error'); return; }
    editingMemberId = null;
    document.getElementById('memberModalTitle').textContent = 'Add Team Member';
    document.getElementById('memberForm').reset();
    document.getElementById('memberId').value = '';
    document.getElementById('memberId').disabled = false;
    document.getElementById('memberRole').value = 'freelancer';
    document.getElementById('memberCurrency').value = 'USD';
    document.getElementById('memberStatus').value = 'active';
    openModal('memberModal');
}

function editTeamMember(memberId) {
    if (!isAdmin) { toast('Access denied', 'error'); return; }
    const member = teamMembers.find(m => m.id === memberId);
    if (!member) return;

    editingMemberId = memberId;
    document.getElementById('memberModalTitle').textContent = 'Edit Team Member';
    document.getElementById('memberId').value = member.id;
    document.getElementById('memberId').disabled = true;
    document.getElementById('memberName').value = member.name;
    document.getElementById('memberEmail').value = member.email;
    document.getElementById('memberTitle').value = member.title || '';
    document.getElementById('memberRole').value = member.role;
    document.getElementById('memberRate').value = member.hourlyRate;
    document.getElementById('memberCurrency').value = member.currency;
    document.getElementById('memberStatus').value = member.status;
    openModal('memberModal');
}

async function saveMemberForm(e) {
    e.preventDefault();
    if (!isAdmin) { toast('Access denied', 'error'); return; }

    const id = editingMemberId || document.getElementById('memberId').value.trim();
    const name = document.getElementById('memberName').value.trim();
    const email = document.getElementById('memberEmail').value.trim().toLowerCase();
    const title = document.getElementById('memberTitle').value.trim();
    const role = document.getElementById('memberRole').value;
    const hourlyRate = parseFloat(document.getElementById('memberRate').value) || 0;
    const currency = document.getElementById('memberCurrency').value;
    const status = document.getElementById('memberStatus').value;

    if (!id || !name || !email) {
        toast('ID, Name, and Email are required', 'error');
        return;
    }

    const member = { id, name, email, title, role, hourlyRate, currency, status };
    const result = await saveTeamMember(member);

    if (result.error) {
        toast('Error: ' + result.error, 'error');
        return;
    }

    closeModal('memberModal');
    toast(editingMemberId ? 'Member updated' : 'Member added', 'success');
    renderTeamManagement();
    // Re-populate dropdowns with new team data
    populateProjectDropdowns();
}

function confirmRemoveMember(memberId, memberName) {
    if (!isAdmin) { toast('Access denied', 'error'); return; }
    if (confirm('Remove ' + memberName + ' from the team? This will set them as inactive.')) {
        removeMember(memberId);
    }
}

async function removeMember(memberId) {
    const member = teamMembers.find(m => m.id === memberId);
    if (!member) return;

    // Set to inactive rather than deleting
    const result = await saveTeamMember({ ...member, status: 'inactive' });
    if (result.error) {
        toast('Error: ' + result.error, 'error');
        return;
    }

    toast('Member deactivated', 'success');
    renderTeamManagement();
    populateProjectDropdowns();
}

// ============================================================
// PROJECT MANAGEMENT
// ============================================================
let editingProjectId = null;

function renderProjectManagement() {
    if (!isAdmin) { toast('Access denied', 'error'); return; }

    const active = mergedProjects.filter(p => p.status === 'active');
    const inactive = mergedProjects.filter(p => p.status !== 'active');

    const list = document.getElementById('projectList');
    if (!list) return;

    const countEl = document.getElementById('projectCount');
    if (countEl) countEl.textContent = active.length + ' active';

    if (active.length === 0) {
        list.innerHTML = '<div class="empty-state">No active projects. Add one above.</div>';
        return;
    }

    // Calculate hours tracked per project (all time)
    const projectHours = {};
    timeBlocks.forEach(b => {
        if (b.status === 'removed' || b.status === 'disputed') return;
        const key = b.project_id || b.project_name || '';
        projectHours[key] = (projectHours[key] || 0) + (b.duration_seconds || 0);
    });

    list.innerHTML = active.map(p => {
        const secs = projectHours[p.id] || projectHours[p.name] || 0;
        const hours = (secs / 3600).toFixed(1);

        return `
            <div class="team-mgmt-row">
                <div class="team-avatar" style="background:var(--grey-100);color:var(--grey-700);font-size:11px;">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                </div>
                <div class="team-mgmt-info">
                    <div class="team-mgmt-name">${escapeHtml(p.name)}</div>
                    <div class="team-mgmt-email">${escapeHtml(p.client || p.description || '')}</div>
                </div>
                <div class="team-mgmt-rate">
                    <span class="rate-value">${hours}h</span>
                    <span class="rate-currency">tracked</span>
                </div>
                <span class="badge badge-success">Active</span>
                <div class="team-mgmt-actions">
                    <button class="btn btn-danger btn-sm" onclick="deactivateProject('${p.id}', '${escapeHtml(p.name)}')">Remove</button>
                </div>
            </div>
        `;
    }).join('');

    if (inactive.length > 0) {
        list.innerHTML += '<div class="section-divider-label">Inactive Projects (' + inactive.length + ')</div>';
        list.innerHTML += inactive.map(p => `
            <div class="team-mgmt-row dimmed">
                <div class="team-avatar" style="background:var(--grey-100);color:var(--grey-400);font-size:11px;">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                </div>
                <div class="team-mgmt-info">
                    <div class="team-mgmt-name">${escapeHtml(p.name)}</div>
                    <div class="team-mgmt-email">${escapeHtml(p.client || p.description || '')}</div>
                </div>
                <span class="badge badge-neutral">Inactive</span>
                <div class="team-mgmt-actions">
                    <button class="btn btn-secondary btn-sm" onclick="reactivateProject('${p.id}')">Reactivate</button>
                </div>
            </div>
        `).join('');
    }
}

function openAddProjectModal() {
    if (!isAdmin) { toast('Access denied', 'error'); return; }
    editingProjectId = null;
    document.getElementById('projectModalTitle').textContent = 'Add Project';
    document.getElementById('projectForm').reset();
    document.getElementById('projectCurrency').value = 'USD';
    openModal('projectModal');
}

async function saveProjectForm(e) {
    e.preventDefault();
    if (!isAdmin || !supabaseClient) { toast('Access denied', 'error'); return; }

    const name = document.getElementById('projectName').value.trim();
    const description = document.getElementById('projectDescription').value.trim();
    const hourlyRate = parseFloat(document.getElementById('projectRate').value) || null;
    const currency = document.getElementById('projectCurrency').value;

    if (!name) { toast('Project name is required', 'error'); return; }

    // Check for duplicate name
    const exists = mergedProjects.some(p => p.name.toLowerCase() === name.toLowerCase() && p.status === 'active');
    if (exists && !editingProjectId) {
        toast('A project with this name already exists', 'error');
        return;
    }

    try {
        const row = {
            name,
            description: description || null,
            hourly_rate: hourlyRate,
            currency: currency || 'USD',
            status: 'active',
            source: 'tracker',
            updated_at: new Date().toISOString()
        };

        if (editingProjectId) {
            const { error } = await supabaseClient
                .from('projects')
                .update(row)
                .eq('id', editingProjectId);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from('projects')
                .insert(row);
            if (error) throw error;
        }

        closeModal('projectModal');
        toast(editingProjectId ? 'Project updated' : 'Project added', 'success');
        editingProjectId = null;

        // Refresh projects
        await populateProjectDropdowns();
        renderProjectManagement();
    } catch (err) {
        console.error('[Projects] Save error:', err);
        toast('Failed to save project: ' + (err.message || 'Unknown error'), 'error');
    }
}

async function deactivateProject(projectId, projectName) {
    if (!isAdmin || !supabaseClient) { toast('Access denied', 'error'); return; }

    if (!confirm('Remove "' + projectName + '" from active projects?\n\nExisting time entries will be preserved.')) return;

    try {
        const { error } = await supabaseClient
            .from('projects')
            .update({ status: 'inactive', updated_at: new Date().toISOString() })
            .eq('id', projectId);

        if (error) throw error;

        toast('Project deactivated', 'success');
        await populateProjectDropdowns();
        renderProjectManagement();
    } catch (err) {
        console.error('[Projects] Deactivate error:', err);
        toast('Failed to deactivate project: ' + (err.message || 'Unknown error'), 'error');
    }
}

async function reactivateProject(projectId) {
    if (!isAdmin || !supabaseClient) { toast('Access denied', 'error'); return; }

    try {
        const { error } = await supabaseClient
            .from('projects')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', projectId);

        if (error) throw error;

        toast('Project reactivated', 'success');
        await populateProjectDropdowns();
        renderProjectManagement();
    } catch (err) {
        console.error('[Projects] Reactivate error:', err);
        toast('Failed to reactivate project: ' + (err.message || 'Unknown error'), 'error');
    }
}

// ============================================================
// COST BY PROJECT (in Weekly Reports)
// ============================================================
function renderProjectCosts(weekStart, weekEnd) {
    const weekBlocks = timeBlocks.filter(b => {
        const d = new Date(b.start_time);
        return d >= weekStart && d <= weekEnd && b.status !== 'disputed' && b.status !== 'removed';
    });

    const card = document.getElementById('projectCostCard');
    const list = document.getElementById('projectCostList');

    if (weekBlocks.length === 0) {
        card.style.display = 'none';
        return;
    }

    // Group by project
    const byProject = {};
    weekBlocks.forEach(b => {
        const key = b.project_name || b.project_id || 'Unassigned';
        if (!byProject[key]) {
            byProject[key] = { name: key, totalSecs: 0, cost: 0, blocks: 0 };
        }
        byProject[key].totalSecs += (b.duration_seconds || 0);
        byProject[key].blocks += 1;

        // Calculate cost using the freelancer's rate from the block or team member
        const member = teamMembers.find(m => m.id === b.user_id);
        const rate = member ? member.hourlyRate : (b.hourly_rate || 0);
        byProject[key].cost += ((b.duration_seconds || 0) / 3600) * rate;
    });

    // Sort by cost descending
    const projects = Object.values(byProject).sort((a, b) => b.cost - a.cost);
    const totalCost = projects.reduce((s, p) => s + p.cost, 0);

    card.style.display = 'block';
    list.innerHTML = projects.map(p => {
        const hours = (p.totalSecs / 3600).toFixed(1);
        const pct = totalCost > 0 ? Math.round((p.cost / totalCost) * 100) : 0;

        return `
            <div class="report-card" style="grid-template-columns:1fr auto auto auto;">
                <div class="report-info">
                    <div class="report-name">${escapeHtml(p.name)}</div>
                    <div class="report-role">${p.blocks} blocks &middot; ${hours}h</div>
                </div>
                <div class="report-metrics">
                    <div class="report-metric">
                        <div class="report-metric-value">${hours}h</div>
                        <div class="report-metric-label">Hours</div>
                    </div>
                    <div class="report-metric">
                        <div class="report-metric-value">${pct}%</div>
                        <div class="report-metric-label">of Total</div>
                    </div>
                </div>
                <div class="report-cost">$${p.cost.toFixed(0)}</div>
            </div>
        `;
    }).join('');
}
