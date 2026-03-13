// Oracle Time Tracker - Admin Dashboard
// Projects, Time Review (Work Diary), Weekly Reports
// ============================================================

let currentReviewBlockId = null;

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
    if (countEl) countEl.textContent = active.length + ' active' + (inactive.length ? ', ' + inactive.length + ' inactive' : '');

    if (active.length === 0) {
        list.innerHTML = '<div class="empty-state">No active projects. Add one above.</div>';
        return;
    }

    // Calculate hours and cost tracked per project (all time, billable only)
    const projectStats = {};
    timeBlocks.forEach(b => {
        if (b.status === 'removed' || b.status === 'disputed') return;
        const key = b.project_id || b.project_name || '';
        if (!projectStats[key]) projectStats[key] = { secs: 0, cost: 0, blocks: 0 };
        projectStats[key].secs += (b.duration_seconds || 0);
        projectStats[key].blocks += 1;
        const member = teamMembers.find(m => m.id === b.user_id);
        const rate = member ? member.hourlyRate : (b.hourly_rate || 0);
        projectStats[key].cost += ((b.duration_seconds || 0) / 3600) * rate;
    });

    let html = active.map(p => {
        const stats = projectStats[p.id] || projectStats[p.name] || { secs: 0, cost: 0, blocks: 0 };
        const hours = (stats.secs / 3600).toFixed(1);

        return `
            <div class="project-tile">
                <div class="project-tile-header">
                    <div>
                        <div class="project-tile-name">${escapeHtml(p.name)}</div>
                        ${p.client || p.description ? `<div class="project-tile-client">${escapeHtml(p.client || p.description)}</div>` : ''}
                    </div>
                    <span class="badge badge-success">Active</span>
                </div>
                <div class="project-tile-stats">
                    <div class="project-tile-stat">
                        <div class="project-tile-stat-value">${hours}h</div>
                        <div class="project-tile-stat-label">Hours</div>
                    </div>
                    <div class="project-tile-stat">
                        <div class="project-tile-stat-value">${stats.blocks}</div>
                        <div class="project-tile-stat-label">Blocks</div>
                    </div>
                    <div class="project-tile-stat">
                        <div class="project-tile-stat-value">$${stats.cost.toFixed(0)}</div>
                        <div class="project-tile-stat-label">Cost</div>
                    </div>
                </div>
                <div class="project-tile-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editProject('${p.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deactivateProject('${p.id}', '${escapeHtml(p.name)}')">Remove</button>
                </div>
            </div>
        `;
    }).join('');

    if (inactive.length > 0) {
        html += inactive.map(p => `
            <div class="project-tile dimmed">
                <div class="project-tile-header">
                    <div>
                        <div class="project-tile-name">${escapeHtml(p.name)}</div>
                        ${p.client || p.description ? `<div class="project-tile-client">${escapeHtml(p.client || p.description)}</div>` : ''}
                    </div>
                    <span class="badge badge-neutral">Inactive</span>
                </div>
                <div class="project-tile-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editProject('${p.id}')">Edit</button>
                    <button class="btn btn-secondary btn-sm" onclick="reactivateProject('${p.id}')">Reactivate</button>
                </div>
            </div>
        `).join('');
    }

    list.innerHTML = html;
}

function openAddProjectModal() {
    if (!isAdmin) { toast('Access denied', 'error'); return; }
    editingProjectId = null;
    document.getElementById('projectModalTitle').textContent = 'Add Project';
    document.getElementById('projectForm').reset();
    document.getElementById('projectCurrency').value = 'USD';
    openModal('projectModal');
}

function editProject(projectId) {
    if (!isAdmin) { toast('Access denied', 'error'); return; }
    const project = mergedProjects.find(p => p.id === projectId);
    if (!project) { toast('Project not found', 'error'); return; }

    editingProjectId = projectId;
    document.getElementById('projectModalTitle').textContent = 'Edit Project';
    document.getElementById('projectName').value = project.name || '';
    document.getElementById('projectDescription').value = project.description || project.client || '';
    document.getElementById('projectRate').value = project.hourlyRate || '';
    document.getElementById('projectCurrency').value = project.currency || 'USD';
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
            // Use upsert so edits to hardcoded-only projects get persisted to Supabase
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editingProjectId);
            let error;
            if (isUUID) {
                ({ error } = await supabaseClient
                    .from('projects')
                    .upsert({ id: editingProjectId, ...row }, { onConflict: 'id' }));
            } else {
                // Non-UUID id — try update by name, fall back to insert
                const oldProject = mergedProjects.find(p => p.id === editingProjectId);
                ({ error } = await supabaseClient
                    .from('projects')
                    .update(row)
                    .eq('name', oldProject?.name || name));
                if (error) {
                    ({ error } = await supabaseClient
                        .from('projects')
                        .insert(row));
                }
            }
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
        // Use upsert so hardcoded-only projects get inserted into Supabase as inactive
        const project = mergedProjects.find(p => p.id === projectId);
        const row = {
            name: projectName,
            description: project?.description || null,
            hourly_rate: project?.hourlyRate || null,
            currency: project?.currency || 'USD',
            source: 'tracker',
            status: 'inactive',
            updated_at: new Date().toISOString()
        };

        // Try upsert with existing id; if id isn't a valid UUID, fall back to insert
        let error;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
        if (isUUID) {
            ({ error } = await supabaseClient
                .from('projects')
                .upsert({ id: projectId, ...row }, { onConflict: 'id' }));
        } else {
            // Non-UUID id (e.g. 'internal') — update by name or insert new
            ({ error } = await supabaseClient
                .from('projects')
                .update(row)
                .eq('name', projectName));
            if (error) {
                ({ error } = await supabaseClient
                    .from('projects')
                    .insert(row));
            }
        }

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
        const project = mergedProjects.find(p => p.id === projectId);
        const { error } = await supabaseClient
            .from('projects')
            .upsert({
                id: projectId,
                name: project?.name || '',
                description: project?.description || null,
                hourly_rate: project?.hourlyRate || null,
                currency: project?.currency || 'USD',
                source: 'tracker',
                status: 'active',
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

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
