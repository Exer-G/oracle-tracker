// Oracle Time Tracker - Task Allocation & Onboarding
// Admin: Assign tasks to team, invite members by email+station
// ============================================================

let taskAllocations = [];
let onboardingInvites = [];
let editingAllocationId = null;

// ============================================================
// TASK ALLOCATION — CRUD
// ============================================================
async function loadTaskAllocations() {
    if (!supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from('tt_task_allocations')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        taskAllocations = data || [];
        debug('[Tasks] Loaded', taskAllocations.length, 'allocations');
    } catch (err) {
        console.error('[Tasks] Load error:', err);
        taskAllocations = [];
    }
}

async function saveTaskAllocation(allocation) {
    if (!supabaseClient || !isAdmin) return { error: 'Unauthorized' };

    try {
        const row = {
            team_member_id: allocation.teamMemberId,
            team_member_name: allocation.teamMemberName,
            team_member_email: allocation.teamMemberEmail,
            project_id: allocation.projectId,
            project_name: allocation.projectName,
            task_description: allocation.taskDescription || '',
            hours_per_week: parseFloat(allocation.hoursPerWeek) || 10,
            priority: allocation.priority || 'medium',
            status: allocation.status || 'active',
            start_date: allocation.startDate || new Date().toISOString().split('T')[0],
            end_date: allocation.endDate || null,
            notes: allocation.notes || '',
            created_by: currentUser?.email || ''
        };

        let result;
        if (allocation.id) {
            // Update existing
            row.updated_at = new Date().toISOString();
            result = await supabaseClient
                .from('tt_task_allocations')
                .update(row)
                .eq('id', allocation.id)
                .select();
        } else {
            // Insert new
            result = await supabaseClient
                .from('tt_task_allocations')
                .insert(row)
                .select();
        }

        if (result.error) throw result.error;

        await loadTaskAllocations();
        return { data: result.data };
    } catch (err) {
        console.error('[Tasks] Save error:', err);
        return { error: err.message };
    }
}

async function deleteTaskAllocation(id) {
    if (!supabaseClient || !isAdmin) return { error: 'Unauthorized' };

    try {
        const { error } = await supabaseClient
            .from('tt_task_allocations')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await loadTaskAllocations();
        return {};
    } catch (err) {
        console.error('[Tasks] Delete error:', err);
        return { error: err.message };
    }
}

// ============================================================
// TASK ALLOCATION — UI
// ============================================================
function renderTaskAllocations() {
    if (!isAdmin) {
        // Freelancer view: show only my allocations
        renderMyAllocations();
        return;
    }

    const container = document.getElementById('taskAllocationList');
    if (!container) return;

    const active = taskAllocations.filter(a => a.status === 'active');
    const paused = taskAllocations.filter(a => a.status === 'paused');
    const completed = taskAllocations.filter(a => a.status === 'completed');

    // Group active by team member
    const byMember = {};
    active.forEach(a => {
        const key = a.team_member_id;
        if (!byMember[key]) byMember[key] = { name: a.team_member_name, allocations: [] };
        byMember[key].allocations.push(a);
    });

    let html = '';

    // Summary stats
    const totalWeeklyHours = active.reduce((s, a) => s + parseFloat(a.hours_per_week || 0), 0);
    const uniqueMembers = new Set(active.map(a => a.team_member_id)).size;
    const uniqueProjects = new Set(active.map(a => a.project_id)).size;

    html += `
        <div class="stats-row stats-row--spaced">
            <div class="stat-card">
                <div class="stat-value">${uniqueMembers}</div>
                <div class="stat-label">Assigned Members</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${uniqueProjects}</div>
                <div class="stat-label">Active Projects</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${totalWeeklyHours.toFixed(0)}h</div>
                <div class="stat-label">Weekly Hours</div>
            </div>
        </div>
    `;

    // Allocations grouped by member
    Object.keys(byMember).forEach(memberId => {
        const group = byMember[memberId];
        const memberHours = group.allocations.reduce((s, a) => s + parseFloat(a.hours_per_week || 0), 0);
        const initials = group.name.split(' ').map(n => n[0]).join('').toUpperCase();

        html += `
            <div class="allocation-group">
                <div class="allocation-group-header">
                    <div class="flex-align-gap-sm">
                        <div class="team-avatar">${initials}</div>
                        <div>
                            <div class="font-semibold">${escapeHtml(group.name)}</div>
                            <div class="text-meta">${memberHours.toFixed(0)}h/week allocated</div>
                        </div>
                    </div>
                </div>
                ${group.allocations.map(a => renderAllocationRow(a)).join('')}
            </div>
        `;
    });

    if (active.length === 0) {
        html += '<div class="empty-state">No active task allocations. Click "Assign Task" to create one.</div>';
    }

    // Paused/completed
    if (paused.length > 0) {
        html += `<div class="section-divider-label">Paused (${paused.length})</div>`;
        html += paused.map(a => renderAllocationRow(a, true)).join('');
    }

    container.innerHTML = html;
}

function renderAllocationRow(a, dimmed = false) {
    const priorityColors = { urgent: 'badge-danger', high: 'badge-warning', medium: 'badge-info', low: 'badge-neutral' };
    const priorityBadge = priorityColors[a.priority] || 'badge-neutral';

    return `
        <div class="allocation-row${dimmed ? ' dimmed' : ''}">
            <div class="allocation-project">
                <div class="font-medium">${escapeHtml(a.project_name)}</div>
                ${a.task_description ? `<div class="text-meta">${escapeHtml(a.task_description)}</div>` : ''}
            </div>
            <div class="flex-align-gap-xs">
                <span class="badge ${priorityBadge} capitalize">${a.priority}</span>
                <span class="hours-label">${a.hours_per_week}h/wk</span>
            </div>
            <div class="allocation-actions">
                <button class="btn btn-secondary btn-sm" onclick="editAllocation('${a.id}')">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteAllocation('${a.id}')">Del</button>
            </div>
        </div>
    `;
}

function renderMyAllocations() {
    const container = document.getElementById('taskAllocationList');
    if (!container || !currentTeamMember) return;

    const myAllocations = taskAllocations.filter(
        a => a.team_member_id === currentTeamMember.id && a.status === 'active'
    );

    const totalHours = myAllocations.reduce((s, a) => s + parseFloat(a.hours_per_week || 0), 0);

    let html = `
        <div class="allocation-summary">
            You have <strong>${myAllocations.length}</strong> active task${myAllocations.length !== 1 ? 's' : ''} totalling <strong>${totalHours.toFixed(0)}h/week</strong>.
        </div>
    `;

    if (myAllocations.length === 0) {
        html += '<div class="empty-state">No tasks assigned to you yet.</div>';
    } else {
        html += myAllocations.map(a => {
            const priorityColors = { urgent: 'badge-danger', high: 'badge-warning', medium: 'badge-info', low: 'badge-neutral' };
            return `
                <div class="allocation-row">
                    <div class="allocation-project">
                        <div class="font-medium">${escapeHtml(a.project_name)}</div>
                        ${a.task_description ? `<div class="text-meta">${escapeHtml(a.task_description)}</div>` : ''}
                    </div>
                    <div class="flex-align-gap-xs">
                        <span class="badge ${priorityColors[a.priority] || 'badge-neutral'} capitalize">${a.priority}</span>
                        <span class="hours-label">${a.hours_per_week}h/wk</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    container.innerHTML = html;
}

// ============================================================
// TASK ALLOCATION — MODAL
// ============================================================
function openAssignTaskModal() {
    if (!isAdmin) { toast('Access denied', 'error'); return; }
    editingAllocationId = null;
    document.getElementById('allocationModalTitle').textContent = 'Assign Task';
    document.getElementById('allocationForm').reset();
    document.getElementById('allocPriority').value = 'medium';
    document.getElementById('allocStatus').value = 'active';
    document.getElementById('allocStartDate').value = new Date().toISOString().split('T')[0];

    // Populate member dropdown
    const select = document.getElementById('allocMember');
    select.innerHTML = '<option value="">Select team member...</option>';
    teamMembers.filter(m => m.status === 'active' && m.role !== 'admin').forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        opt.dataset.email = m.email;
        opt.dataset.name = m.name;
        select.appendChild(opt);
    });

    // Populate project dropdown
    const projSelect = document.getElementById('allocProject');
    projSelect.innerHTML = '<option value="">Select project...</option>';
    mergedProjects.filter(p => p.status === 'active').forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        projSelect.appendChild(opt);
    });

    openModal('allocationModal');
}

function editAllocation(id) {
    const alloc = taskAllocations.find(a => a.id === id);
    if (!alloc) return;

    editingAllocationId = id;
    openAssignTaskModal();
    document.getElementById('allocationModalTitle').textContent = 'Edit Allocation';
    document.getElementById('allocMember').value = alloc.team_member_id;
    document.getElementById('allocProject').value = alloc.project_id;
    document.getElementById('allocDescription').value = alloc.task_description || '';
    document.getElementById('allocHours').value = alloc.hours_per_week;
    document.getElementById('allocPriority').value = alloc.priority;
    document.getElementById('allocStatus').value = alloc.status;
    document.getElementById('allocStartDate').value = alloc.start_date || '';
    document.getElementById('allocEndDate').value = alloc.end_date || '';
    document.getElementById('allocNotes').value = alloc.notes || '';
}

async function saveAllocationForm(e) {
    e.preventDefault();
    if (!isAdmin) { toast('Access denied', 'error'); return; }

    const memberSelect = document.getElementById('allocMember');
    const projectSelect = document.getElementById('allocProject');
    const selectedMember = memberSelect.options[memberSelect.selectedIndex];
    const selectedProject = projectSelect.options[projectSelect.selectedIndex];

    if (!memberSelect.value || !projectSelect.value) {
        toast('Select a team member and project', 'error');
        return;
    }

    const allocation = {
        id: editingAllocationId || null,
        teamMemberId: memberSelect.value,
        teamMemberName: selectedMember.dataset.name || selectedMember.textContent,
        teamMemberEmail: selectedMember.dataset.email || '',
        projectId: projectSelect.value,
        projectName: selectedProject.textContent,
        taskDescription: document.getElementById('allocDescription').value.trim(),
        hoursPerWeek: document.getElementById('allocHours').value,
        priority: document.getElementById('allocPriority').value,
        status: document.getElementById('allocStatus').value,
        startDate: document.getElementById('allocStartDate').value,
        endDate: document.getElementById('allocEndDate').value || null,
        notes: document.getElementById('allocNotes').value.trim()
    };

    const result = await saveTaskAllocation(allocation);
    if (result.error) {
        toast('Error: ' + result.error, 'error');
        return;
    }

    closeModal('allocationModal');
    toast(editingAllocationId ? 'Allocation updated' : 'Task assigned', 'success');
    renderTaskAllocations();
}

function confirmDeleteAllocation(id) {
    if (confirm('Delete this task allocation?')) {
        deleteTaskAllocation(id).then(() => {
            toast('Allocation deleted', 'success');
            renderTaskAllocations();
        });
    }
}

// ============================================================
// ONBOARDING — INVITE BY EMAIL + STATION
// ============================================================
async function loadOnboardingInvites() {
    if (!supabaseClient || !isAdmin) return;

    try {
        const { data, error } = await supabaseClient
            .from('tt_onboarding_invites')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        onboardingInvites = data || [];
    } catch (err) {
        console.error('[Onboarding] Load error:', err);
        onboardingInvites = [];
    }
}

function openInviteMemberModal() {
    if (!isAdmin) { toast('Access denied', 'error'); return; }

    document.getElementById('inviteForm').reset();
    document.getElementById('inviteRole').value = 'freelancer';
    document.getElementById('inviteCurrency').value = 'USD';

    // Populate station dropdown
    const stationSelect = document.getElementById('inviteStation');
    stationSelect.innerHTML = '<option value="">Select station...</option>';
    (typeof TT_STATIONS !== 'undefined' ? TT_STATIONS : ['HQ', 'Remote', 'Cloud']).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        stationSelect.appendChild(opt);
    });

    openModal('inviteModal');
}

async function submitInviteForm(e) {
    e.preventDefault();
    if (!isAdmin) { toast('Access denied', 'error'); return; }

    const email = document.getElementById('inviteEmail').value.trim();
    const name = document.getElementById('inviteName').value.trim();
    const station = document.getElementById('inviteStation').value;
    const role = document.getElementById('inviteRole').value;
    const title = document.getElementById('inviteTitle').value.trim();
    const hourlyRate = document.getElementById('inviteRate').value;
    const currency = document.getElementById('inviteCurrency').value;

    if (!email || !name) {
        toast('Email and name are required', 'error');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Inviting...';

    try {
        const res = await fetch('/.netlify/functions/invite-member', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email, name, station, role, title, hourlyRate, currency,
                invitedBy: currentUser?.email || 'admin'
            })
        });

        const result = await res.json();

        if (!res.ok || result.error) {
            throw new Error(result.error || 'Invite failed');
        }

        closeModal('inviteModal');
        toast(`${name} invited successfully! They can sign in at ${window.location.origin}/tracker/`, 'success');

        // Reload team data
        await loadTeamMembers();
        await loadOnboardingInvites();
        renderTeamManagement();
        renderOnboardingStatus();

    } catch (err) {
        console.error('[Onboarding] Invite error:', err);
        toast('Invite failed: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send Invite';
    }
}

function renderOnboardingStatus() {
    const container = document.getElementById('onboardingList');
    if (!container || !isAdmin) return;

    if (onboardingInvites.length === 0) {
        container.innerHTML = '<div class="empty-state">No pending invites. Use "Invite by Email" to onboard new team members.</div>';
        return;
    }

    container.innerHTML = onboardingInvites.map(inv => {
        const statusBadge = inv.status === 'accepted'
            ? '<span class="badge badge-success">Accepted</span>'
            : inv.status === 'expired'
                ? '<span class="badge badge-neutral">Expired</span>'
                : '<span class="badge badge-warning">Pending</span>';

        const stationBadge = inv.station
            ? `<span class="badge badge-info">${escapeHtml(inv.station)}</span>`
            : '';

        return `
            <div class="onboarding-row">
                <div class="onboarding-info">
                    <div class="font-medium">${escapeHtml(inv.name)}</div>
                    <div class="text-meta">${escapeHtml(inv.email)}</div>
                </div>
                <div class="flex-align-gap-xs">
                    ${stationBadge}
                    ${statusBadge}
                </div>
                <div class="text-meta">
                    ${new Date(inv.created_at).toLocaleDateString()}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// AUTO-ONBOARD: Mark member as onboarded on first login
// ============================================================
async function markAsOnboarded() {
    if (!supabaseClient || !currentTeamMember) return;

    try {
        // Check if already onboarded
        const { data } = await supabaseClient
            .from('tt_team_members')
            .select('onboarded')
            .eq('id', currentTeamMember.id)
            .single();

        if (data && !data.onboarded) {
            await supabaseClient
                .from('tt_team_members')
                .update({ onboarded: true, onboarded_at: new Date().toISOString() })
                .eq('id', currentTeamMember.id);

            // Also update the invite status
            await supabaseClient
                .from('tt_onboarding_invites')
                .update({ status: 'accepted', accepted_at: new Date().toISOString() })
                .eq('email', currentTeamMember.email)
                .eq('status', 'pending');

            debug('[Onboarding] Marked as onboarded:', currentTeamMember.name);
        }
    } catch (err) {
        // Non-critical, silently fail
        console.warn('[Onboarding] Auto-onboard error:', err);
    }
}
