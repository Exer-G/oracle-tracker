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

    // This week's cost
    const weekBlocks = timeBlocks.filter(b => isThisWeek(new Date(b.start_time)));
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
            : b.status === 'disputed'
                ? '<span class="badge badge-danger">Disputed</span>'
                : '<span class="badge badge-warning">Pending</span>';

        return `
            <div class="screenshot-card" data-block-id="${b.id}">
                ${b.screenshot_url
                    ? `<img src="${b.screenshot_url}" alt="Screenshot" onclick="viewScreenshotAdmin('${b.id}')">`
                    : `<div style="width:100%;aspect-ratio:16/9;background:var(--grey-100);display:flex;align-items:center;justify-content:center;color:var(--grey-400);font-size:12px;border-bottom:1px solid var(--grey-100);">No Screenshot</div>`
                }
                <div class="screenshot-card-body">
                    <div class="screenshot-card-time">${formatTimeRange(b.start_time, b.end_time)}</div>
                    <div class="screenshot-card-project">${escapeHtml(b.user_name || '')} &middot; ${escapeHtml(b.project_name || 'No Project')}</div>
                    <div class="activity-bar" style="margin:8px 0 4px;">
                        <div class="activity-bar-fill ${activityPercent >= 60 ? '' : activityPercent >= 30 ? 'medium' : 'low'}" style="width:${activityPercent}%"></div>
                    </div>
                    <div class="screenshot-card-footer">
                        ${statusBadge}
                        <div class="screenshot-card-actions">
                            ${b.status === 'pending' ? `
                                <button class="btn btn-success btn-sm" onclick="approveBlockById('${b.id}')">Approve</button>
                                <button class="btn btn-danger btn-sm" onclick="disputeBlockById('${b.id}')">Dispute</button>
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
    await updateBlockStatus(blockId, 'approved');
    toast('Block approved', 'success');
    loadTimeReview();
}

async function disputeBlockById(blockId) {
    await updateBlockStatus(blockId, 'disputed');
    toast('Block disputed', 'error');
    loadTimeReview();
}

function approveBlock() {
    if (currentReviewBlockId) {
        approveBlockById(currentReviewBlockId);
        closeModal('screenshotModal');
    }
}

function disputeBlock() {
    if (currentReviewBlockId) {
        disputeBlockById(currentReviewBlockId);
        closeModal('screenshotModal');
    }
}

async function updateBlockStatus(blockId, status) {
    if (!supabaseClient) return;

    try {
        const { error } = await supabaseClient
            .from('tt_time_blocks')
            .update({ status })
            .eq('id', blockId);

        if (error) {
            console.error('[Admin] Update status error:', error);
            return;
        }

        // Update local cache
        const block = timeBlocks.find(b => b.id === blockId);
        if (block) block.status = status;
    } catch (err) {
        console.error('[Admin] Update error:', err);
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
        const totalSecs = blocks.reduce((s, b) => s + (b.duration_seconds || 0), 0);
        const hours = totalSecs / 3600;
        const cost = hours * f.hourlyRate;
        const avgActivity = blocks.length > 0
            ? Math.round(blocks.reduce((s, b) => s + (b.activity_percent || 0), 0) / blocks.length)
            : 0;

        totalCost += cost;
        totalHours += hours;

        if (blocks.length === 0 && currentWeekOffset !== 0) return;

        const initials = f.name.split(' ').map(n => n[0]).join('').toUpperCase();
        const approved = blocks.filter(b => b.status === 'approved').length;
        const pending = blocks.filter(b => b.status === 'pending').length;
        const disputed = blocks.filter(b => b.status === 'disputed').length;

        let statusBadge;
        if (blocks.length === 0) {
            statusBadge = '<span class="badge badge-neutral">No Data</span>';
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
                <div style="text-align:center;">${statusBadge}</div>
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
}

function changeWeek(direction) {
    currentWeekOffset += direction;
    renderWeeklyReports();
}

async function approveAllForUser(userId) {
    const weekStart = getWeekStart(new Date(), currentWeekOffset);
    const weekEnd = getWeekEnd(weekStart);

    const pendingBlocks = timeBlocks.filter(b =>
        b.user_id === userId &&
        b.status === 'pending' &&
        new Date(b.start_time) >= weekStart &&
        new Date(b.start_time) <= weekEnd
    );

    for (const block of pendingBlocks) {
        await updateBlockStatus(block.id, 'approved');
    }

    toast(`Approved ${pendingBlocks.length} blocks`, 'success');
    renderWeeklyReports();
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
            <div style="padding:16px 20px;font-size:12px;color:var(--grey-500);text-transform:uppercase;letter-spacing:0.5px;border-top:2px solid var(--grey-200);margin-top:8px;">
                Inactive Members (${inactive.length})
            </div>
        `;
        list.innerHTML += inactive.map(m => {
            const initials = m.name.split(' ').map(n => n[0]).join('').toUpperCase();
            return `
                <div class="team-mgmt-row" style="opacity:0.5;">
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
