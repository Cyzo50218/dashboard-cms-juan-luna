/**
 * @file tasks.js
 * @description A "sub-router" that controls the tasks section.
 * It dynamically loads content for its own internal tabs (List, Board, etc.).
 */

// --- Module-Scoped Variables for Cleanup ---
// For the main section's listeners (the tabs themselves)
let tabClickListener = null;
const buttonListeners = [];
// For the currently loaded SUB-MODULE (the content of a tab like 'list.js')
let currentTabCleanup = null;

/**
 * Main initialization function for the entire tasks section.
 * @param {object} params - Route parameters from the main router.
 * @returns {function} The main cleanup function for the tasks section.
 */
// File: /dashboard/tasks/tasks.js

export function init(params) {
    // [FIX 1] Declare variables at the top of the function's scope.
    // This is crucial for currentTabCleanup to be accessible by all inner functions.
    let currentTabCleanup = null;
    let tabClickListener = null;
    
    // --- 1. Get Parameters and DOM Elements ---
    const { tabId = 'list', accountId, projectId } = params;
    
    const tabs = document.querySelectorAll('.tab-link');
    const shareButton = document.querySelector('.share-btn');
    const customizeButton = document.querySelector('.customize-btn');
    
    /**
 * Creates and injects the Share Modal into the DOM.
 * This function handles the creation of the modal's CSS and HTML structure.
 *
 * FIX: Now accepts the event object 'e' to stop propagation, preventing the
 * modal from instantly closing. Also checks if a modal already exists.
 *
 * @param {Event} e The click event that triggered the modal creation.
 */
const createShareModal = (e) => {
    // FIX: Stop the click that opened the modal from bubbling up to the body
    // and triggering the close listener.
    if (e) {
        e.stopPropagation();
    }

    // FIX: Prevent creating duplicate modals if one is already open.
    if (document.getElementById('shareproject-modal-backdrop')) {
        return;
    }

    // --- CSS Styles ---
    const styles = `
    .hidden { display: none !important; }
    .shareproject-modal-backdrop {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.6); display: flex;
        justify-content: center; align-items: center; z-index: 1000;
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .shareproject-modal {
        background-color: white; border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
        width: 750px; display: flex; flex-direction: column;
        font-family: 'Inter', sans-serif; animation: slideIn 0.3s ease-out;
        max-height: 90vh;
        margin: auto;
        position: relative; /* Needed for dropdown positioning */
    }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .shareproject-modal-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 16px 24px; border-bottom: 1px solid #f0f0f0;
    }
    .shareproject-modal-header h2 { margin: 0; font-size: 18px; font-weight: 600; color: #111; }
    .shareproject-icon-btn {
        background: none; border: none; cursor: pointer; padding: 6px;
        border-radius: 50%; display: inline-flex; color: #555;
    }
    .shareproject-icon-btn:hover { background-color: #f4f4f4; }
    .shareproject-modal-body { padding: 16px 24px; overflow-y: auto; }
    .shareproject-modal-body > p.shareproject-section-title { font-size: 14px; font-weight: 500; color: #333; margin: 16px 0 8px 0; }
    .shareproject-invite-input-wrapper {
        position: relative;
        display: flex; align-items: center; border: 1px solid #e0e0e0;
        border-radius: 8px; padding: 4px; margin-bottom: 16px;
        transition: all 0.2s ease;
    }
    .shareproject-invite-input-wrapper:focus-within { border-color: #1267FA; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
    .shareproject-email-tags-container { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-left: 8px; }
    .shareproject-email-tag {
        display: flex; align-items: center; background-color: #eef2ff; color: #4338ca;
        padding: 4px 10px; border-radius: 6px; font-size: 14px; font-weight: 500;
    }
    .shareproject-email-tag .shareproject-remove-tag { cursor: pointer; margin-left: 8px; font-size: 16px; }
    #shareproject-email-input {
        flex-grow: 1; border: none; outline: none; padding: 8px;
        font-size: 14px; background: transparent; min-width: 150px;
    }
    .shareproject-invite-controls { display: flex; align-items: center; gap: 8px; padding-right: 4px;}
    .shareproject-role-selector, .shareproject-member-role { position: relative; }
    .shareproject-dropdown-btn {
        background-color: #fff; border: 1px solid #e0e0e0; border-radius: 6px;
        padding: 8px 12px; cursor: pointer; display: flex; align-items: center;
        font-size: 14px; white-space: nowrap;
    }
    .shareproject-dropdown-btn:hover { background-color: #f9f9f9; }
    .shareproject-dropdown-btn:disabled { background-color: #f9fafb; cursor: not-allowed; color: #555;}
    .shareproject-dropdown-content {
        position: absolute; top: calc(100% + 5px); right: 0; background-color: white;
        border: 1px solid #f0f0f0; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08); z-index: 1010; width: 300px;
        overflow: hidden; animation: fadeIn 0.2s ease;
    }
    .shareproject-dropdown-action {
        display: block; width: 100%; padding: 12px 16px;
        text-decoration: none; color: #333; background: none; border: none;
        cursor: pointer; text-align: left; font-family: 'Inter', sans-serif; font-size: 14px;
    }
    .shareproject-dropdown-action:hover, .shareproject-dropdown-content a.shareproject-remove:hover {
        background-color: #f4f4f4;
    }
    .shareproject-dropdown-content a { display: block; padding: 12px 16px; text-decoration: none; color: #333; }
    .shareproject-dropdown-content strong { font-weight: 500; display: flex; align-items: center; gap: 8px; }
    .shareproject-dropdown-content p { font-size: 13px; color: #666; margin: 4px 0 0 0; line-height: 1.4; }
    .shareproject-invite-btn {
        background-color: #3F7EEB; color: white; border: none;
        padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;
        transition: background-color 0.2s ease;
    }
    .shareproject-invite-btn:hover { background-color: #1267FA; }
    .shareproject-access-settings-wrapper { position: relative; }
    .shareproject-access-settings-btn {
        display: flex;
        align-items: flex-start;
        width: 100%;
        text-align: left;
        padding: 12px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        background: none;
    }
    .shareproject-access-settings-btn:hover { background-color: #f9f9f9; }
    .shareproject-access-settings-btn .material-icons { margin-right: 12px; color: #555; line-height: 1.4; }
    .shareproject-access-settings-btn div { flex-grow: 1; }
    .shareproject-members-list { margin-top: 16px; }
    .shareproject-member-item, .shareproject-pending-item { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .shareproject-member-item:last-child, .shareproject-pending-item:last-child { border-bottom: none; }
    .shareproject-profile-pic {
        width: 36px; height: 36px; border-radius: 50%; display: flex;
        align-items: center; justify-content: center; color: white;
        font-weight: 500; font-size: 14px; margin-right: 12px;
    }
    .shareproject-pending-icon {
        width: 36px; height: 36px; border-radius: 50%; display: flex;
        align-items: center; justify-content: center; margin-right: 12px;
        background-color: #f3f4f6; color: #6b7280;
    }
    .shareproject-member-info { flex-grow: 1; }
    .shareproject-member-info strong { font-size: 14px; font-weight: 500; color: #111; }
    .shareproject-member-info p { font-size: 13px; color: #666; margin: 2px 0 0 0; }
    .shareproject-resend-link { color: #3F7EEB; cursor: pointer; text-decoration: underline; }
    .shareproject-member-role .shareproject-dropdown-btn { background: none; border: none; padding: 4px 8px; color: #555; }
    .shareproject-member-role .shareproject-dropdown-content { width: 300px; } /* Increased width for description */
    .shareproject-member-role .shareproject-dropdown-content a.shareproject-remove { color: #ef4444; }
    .shareproject-modal-footer {
        padding: 16px 24px; border-top: 1px solid #f0f0f0;
        background-color: #f9fafb; display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;
    }
    .shareproject-copy-link-btn, #shareproject-leave-btn {
        background: none; border: 1px solid #e0e0e0; border-radius: 6px;
        padding: 8px 12px; cursor: pointer; display: flex;
        align-items: center; font-size: 14px; font-weight: 500;
    }
    .shareproject-copy-link-btn:hover, #shareproject-leave-btn:hover { background-color: #f4f4f4; }
    #shareproject-leave-btn { color: #ef4444; }
    #shareproject-leave-btn:hover { background-color: #fee2e2; }
    #shareproject-leave-btn .material-icons, .shareproject-copy-link-btn .material-icons { margin-right: 8px; color: #555; }
    #shareproject-leave-btn .material-icons { color: #ef4444; }
    .shareproject-user-search-dropdown {
        position: absolute; top: 100%; left: 0; right: 0;
        background-color: white; border: 1px solid #e0e0e0;
        border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        z-index: 1010; max-height: 200px; overflow-y: auto;
    }
    .shareproject-user-search-dropdown a { display: flex; align-items: center; padding: 8px 16px; text-decoration: none; color: #333; }
    .shareproject-user-search-dropdown a:hover { background-color: #f4f4f4; }
    .shareproject-user-search-dropdown a strong { font-weight: 500; }
    .shareproject-user-search-dropdown a span { font-size: 13px; color: #666; margin-left: 8px; }
    .shareproject-user-search-dropdown a .material-icons { margin-right: 12px; color: #555; }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // --- HTML Structure ---
    const modalHTML = `
    <div class="shareproject-modal">
        <div class="shareproject-modal-header">
            <h2>Share Dresmond Shirt Barong Supplier</h2>
            <button id="shareproject-close-modal-btn" class="shareproject-icon-btn"><i class="material-icons">close</i></button>
        </div>
        <div class="shareproject-modal-body">
            <div class="shareproject-invite-input-wrapper">
                <div id="shareproject-email-tags" class="shareproject-email-tags-container"></div>
                <input type="text" id="shareproject-email-input" placeholder="Add members by email or name...">
                <div class="shareproject-invite-controls">
                    <div class="shareproject-role-selector">
                        <button id="shareproject-role-dropdown-btn" class="shareproject-dropdown-btn">
                            <span id="shareproject-selected-role">Editor</span><i class="material-icons">arrow_drop_down</i>
                        </button>
                    </div>
                    <button id="shareproject-invite-btn" class="shareproject-invite-btn">Invite</button>
                </div>
            </div>
            <div id="shareproject-role-dropdown" class="shareproject-dropdown-content hidden"></div>
            <div class="shareproject-access-settings-wrapper">
                <button id="shareproject-access-settings-btn" class="shareproject-access-settings-btn">
                    <i class="material-icons" id="shareproject-access-icon">public</i>
                    <div>
                        <strong id="shareproject-access-title">My Workspace</strong>
                        <p id="shareproject-access-desc">Everyone at workspace can find and access this project.</p>
                    </div>
                    <i class="material-icons">arrow_drop_down</i>
                </button>
            </div>
            <div id="shareproject-access-dropdown" class="shareproject-dropdown-content hidden" style="width: 100%;">
                <a href="#" data-access="workspace">
                    <strong><i class="material-icons">public</i> My Workspace</strong>
                    <p>Everyone at workspace can find and access this project.</p>
                </a>
                <a href="#" data-access="private">
                    <strong><i class="material-icons">lock</i> Private to Members</strong>
                    <p>Only invited members can find and access this project.</p>
                </a>
            </div>
            <p class="shareproject-section-title">Project Members</p>
            <div class="shareproject-members-list" id="shareproject-members-list"></div>
            <div id="shareproject-pending-list"></div>
        </div>
        <div class="shareproject-modal-footer">
            <div id="shareproject-footer-left"></div>
            <button class="shareproject-copy-link-btn"><i class="material-icons">link</i>Copy project link</button>
        </div>
    </div>
    `;
    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'shareproject-modal-backdrop';
    modalBackdrop.className = 'shareproject-modal-backdrop';
    modalBackdrop.innerHTML = modalHTML;
    document.body.appendChild(modalBackdrop);

    // After adding the modal to the DOM, set up its logic
    setupModalLogic();
};
const setupModalLogic = () => {
    // --- Mock Data, DOM Elements, and initial state variables ---
    const currentUserId = 3;
    let membersData = [
        { id: 1, name: 'Task collaborators', email: '', role: 'Editor', isGroup: true },
        { id: 2, name: 'My workspace', email: '2 members', role: 'Editor', isGroup: true },
        { id: 3, name: 'Clinton Ihegoro', email: 'myfavoritemappingswar@gmail.com', role: 'Project admin', isOwner: true },
        { id: 4, name: 'John Wick', email: 'john.wick@example.com', role: 'Editor' },
        { id: 5, name: 'Jane Doe', email: 'jane.doe@example.com', role: 'Viewer' }
    ];
    let pendingInvitations = [];
    const invitedEmails = [];
    const profileColors = ['#4A148C', '#004D40', '#BF360C', '#0D47A1', '#4E342E', '#AD1457', '#006064'];
    const rolesData = [
        { name: 'Project admin', description: 'Full access to change settings and modify.' },
        { name: 'Editor', description: 'Can add, edit, and delete anything.' },
        { name: 'Commenter', description: "Can comment, but can't edit." },
        { name: 'Viewer', description: "Can view, but can't add comments." }
    ];
    let projectAccessLevel = 'workspace';
    let activeDropdown = null;

    const modal = document.querySelector('.shareproject-modal');
    const modalBackdrop = document.getElementById('shareproject-modal-backdrop');
    const closeModalBtn = document.getElementById('shareproject-close-modal-btn');
    const emailInput = document.getElementById('shareproject-email-input');
    const emailTagsContainer = document.getElementById('shareproject-email-tags');
    const inviteInputWrapper = document.querySelector('.shareproject-invite-input-wrapper');
    const inviteBtn = document.getElementById('shareproject-invite-btn');
    const roleDropdownBtn = document.getElementById('shareproject-role-dropdown-btn');
    const roleDropdown = document.getElementById('shareproject-role-dropdown');
    const selectedRoleSpan = document.getElementById('shareproject-selected-role');
    const membersList = document.getElementById('shareproject-members-list');
    const pendingList = document.getElementById('shareproject-pending-list');
    const accessSettingsBtn = document.getElementById('shareproject-access-settings-btn');
    const accessDropdown = document.getElementById('shareproject-access-dropdown');
    const footerLeftContainer = document.getElementById('shareproject-footer-left');
    const modalFooter = document.querySelector('.shareproject-modal-footer');

    // --- All Helper Functions (logActivity, closeModal, renderAll, etc.) ---
    // (These functions are included here as in the previous version)
    const logActivity = (message) => {
        const timestamp = new Date().toISOString();
        console.log(`[Activity Log - ${timestamp}] ${message}`);
    };

    const closeModal = () => {
        const backdrop = document.getElementById('shareproject-modal-backdrop');
        if (backdrop) {
            backdrop.remove();
            logActivity("Share modal closed.");
        }
    };

    const createProfilePic = (name, isGroup = false) => {
        const pic = document.createElement('div');
        pic.className = 'shareproject-profile-pic';
        if (isGroup) {
            const icon = document.createElement('i');
            icon.className = 'material-icons';
            icon.textContent = name.includes('workspace') ? 'people' : 'work';
            pic.style.backgroundColor = '#e5e7eb';
            pic.style.color = '#4b5563';
            pic.appendChild(icon);
        } else {
            pic.textContent = name.split(' ').map(n => n[0]).join('').toUpperCase();
            const hash = name.split("").reduce((a, b) => (a = ((a << 5) - a) + b.charCodeAt(0), a & a), 0);
            pic.style.backgroundColor = profileColors[Math.abs(hash) % profileColors.length];
        }
        return pic;
    };

    const renderAll = () => {
        renderMembers();
        renderPendingInvitations();
        renderFooter();
    };

    const renderMembers = () => {
        membersList.innerHTML = '';
        const visibleMembers = projectAccessLevel === 'private' ?
            membersData.filter(m => !m.isGroup) :
            membersData;
        
        const adminCount = membersData.filter(m => m.isOwner && !m.isGroup).length;

        visibleMembers.forEach(member => {
            if (!member || !member.name) return;
            const item = document.createElement('div');
            item.className = 'shareproject-member-item';
            item.dataset.id = member.id;
            
            const isLocked = member.isOwner && adminCount <= 1;

            let dropdownLinks = '';
            if (!isLocked) {
                const applicableRoles = member.isGroup ?
                    rolesData.filter(r => r.name === 'Editor' || r.name === 'Viewer') :
                    rolesData;

                const memberRoleOptions = applicableRoles.map(role => `<button class="shareproject-dropdown-action" data-role="${role.name}"><strong>${role.name}</strong><p>${role.description}</p></button>`).join('');
                const removeMemberLink = !member.isGroup ? `<a href="#" class="shareproject-remove"><i class="material-icons">person_remove</i> Remove member</a>` : '';
                dropdownLinks = memberRoleOptions + removeMemberLink;
            }

            item.innerHTML = `
                <div class="shareproject-member-info">
                    <strong>${member.name}</strong>
                    <p>${member.email}</p>
                </div>
                <div class="shareproject-member-role">
                    <button class="shareproject-dropdown-btn shareproject-member-role-btn" ${isLocked ? 'disabled' : ''}>
                        <span>${member.role}</span>
                        ${!isLocked ? '<i class="material-icons">arrow_drop_down</i>' : ''}
                    </button>
                    <div id="member-dropdown-${member.id}" class="shareproject-dropdown-content hidden shareproject-member-dropdown-content">
                        ${dropdownLinks}
                    </div>
                </div>
            `;
            item.prepend(createProfilePic(member.name, member.isGroup));
            membersList.appendChild(item);
        });
    };

    const renderPendingInvitations = () => {
        pendingList.innerHTML = '';
        if (pendingInvitations.length > 0 && !document.querySelector('#shareproject-pending-list-title')) {
            const title = document.createElement('p');
            title.id = 'shareproject-pending-list-title';
            title.className = 'shareproject-section-title';
            title.textContent = 'Pending Invitations';
            membersList.insertAdjacentElement('afterend', title);
        } else if (pendingInvitations.length === 0) {
            document.querySelector('#shareproject-pending-list-title')?.remove();
        }

        pendingInvitations.forEach(invite => {
            const item = document.createElement('div');
            item.className = 'shareproject-pending-item';
            item.dataset.id = invite.id;
            const roleOptions = rolesData.map(role => `<button class="shareproject-dropdown-action" data-role="${role.name}"><strong>${role.name}</strong><p>${role.description}</p></button>`).join('');
            let statusHTML = invite.status === 'pending' ? `Invitation sent` : `<a href="#" class="shareproject-resend-link" data-id="${invite.id}">Resend invitation</a>`;

            item.innerHTML = `
                <div class="shareproject-pending-icon"><i class="material-icons">hourglass_top</i></div>
                <div class="shareproject-member-info">
                    <strong>${invite.email}</strong>
                    <p>${statusHTML}</p>
                </div>
                <div class="shareproject-member-role">
                    <button class="shareproject-dropdown-btn shareproject-member-role-btn">
                        <span>${invite.role}</span>
                        <i class="material-icons">arrow_drop_down</i>
                    </button>
                    <div id="pending-dropdown-${invite.id}" class="shareproject-dropdown-content hidden shareproject-member-dropdown-content">
                        ${roleOptions}
                    </div>
                </div>
            `;
            pendingList.appendChild(item);
        });
    };

    const renderFooter = () => {
        footerLeftContainer.innerHTML = '';
        const currentUser = membersData.find(m => m.id === currentUserId);

        if (currentUser) {
            const ownerCount = membersData.filter(m => m.isOwner && !m.isGroup).length;
            if (!currentUser.isOwner || (currentUser.isOwner && ownerCount > 1)) {
                const leaveButton = document.createElement('button');
                leaveButton.id = 'shareproject-leave-btn';
                leaveButton.innerHTML = `<i class="material-icons">logout</i>Leave project`;
                footerLeftContainer.appendChild(leaveButton);
            }
        }
    };

    const renderRoleOptions = () => {
        roleDropdown.innerHTML = rolesData.map(role => `
            <button class="shareproject-dropdown-action" data-role="${role.name}">
                <strong>${role.name}</strong>
                <p>${role.description}</p>
            </button>
        `).join('');
    };

    const addEmailTag = (emailOrName) => {
        const trimmedIdentifier = emailOrName.trim();
        if (trimmedIdentifier && !invitedEmails.includes(trimmedIdentifier)) {
            invitedEmails.push(trimmedIdentifier);
            renderEmailTags();
        }
        emailInput.value = '';
    };

    const renderEmailTags = () => {
        emailTagsContainer.innerHTML = '';
        invitedEmails.forEach(email => {
            const tag = document.createElement('div');
            tag.className = 'shareproject-email-tag';
            tag.innerHTML = `<span>${email}</span><span class="shareproject-remove-tag" data-email="${email}">&times;</span>`;
            emailTagsContainer.appendChild(tag);
        });
        emailTagsContainer.querySelectorAll('.shareproject-remove-tag').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = invitedEmails.indexOf(e.target.dataset.email);
                if (index > -1) {
                    invitedEmails.splice(index, 1);
                    renderEmailTags();
                }
            });
        });
    };
    
    const positionAndShowDropdown = (dropdownEl, buttonEl) => {
        if (activeDropdown && activeDropdown !== dropdownEl) {
            activeDropdown.classList.add('hidden');
        }
        modal.appendChild(dropdownEl);
        const modalRect = modal.getBoundingClientRect();
        const buttonRect = buttonEl.getBoundingClientRect();
        const top = buttonRect.bottom - modalRect.top + 2;
        const right = modalRect.right - buttonRect.right;
        dropdownEl.style.top = `${top}px`;
        dropdownEl.style.right = `${right}px`;
        dropdownEl.style.left = 'auto';
        dropdownEl.classList.remove('hidden');
        activeDropdown = dropdownEl;
    };

    // --- Event Handlers ---

    closeModalBtn.addEventListener('click', closeModal);

    modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeModal();
    });

    modal.addEventListener('click', (e) => {
        e.stopPropagation();

        const memberDropdownButton = e.target.closest('.shareproject-member-role-btn');
        const mainRoleDropdownButton = e.target.closest('#shareproject-role-dropdown-btn');
        const accessSettingsButton = e.target.closest('#shareproject-access-settings-btn');
        const roleActionButton = e.target.closest('.shareproject-dropdown-action[data-role]');
        const removeLink = e.target.closest('a.shareproject-remove');
        const resendLink = e.target.closest('a.shareproject-resend-link');
        const accessLink = e.target.closest('#shareproject-access-dropdown a[data-access]');

        if (memberDropdownButton || mainRoleDropdownButton || accessSettingsButton) {
            let button, dropdown, positioner;
            if (memberDropdownButton) {
                button = memberDropdownButton;
                dropdown = button.nextElementSibling;
                positioner = button;
            } else if (mainRoleDropdownButton) {
                button = mainRoleDropdownButton;
                dropdown = roleDropdown;
                positioner = button.parentElement;
            } else {
                button = accessSettingsButton;
                dropdown = accessDropdown;
                positioner = button;
            }

            if (dropdown && dropdown.classList.contains('hidden')) {
                positionAndShowDropdown(dropdown, positioner);
            } else if (activeDropdown) {
                activeDropdown.classList.add('hidden');
                activeDropdown = null;
            }
        } else if (roleActionButton) {
            const dropdown = roleActionButton.closest('.shareproject-dropdown-content');
            if (dropdown) {
                const newRole = roleActionButton.dataset.role;
                if (dropdown.id === 'shareproject-role-dropdown') {
                    selectedRoleSpan.textContent = newRole;
                } else {
                    const id = parseFloat(dropdown.id.split('-').pop());
                    let memberToUpdate = membersData.find(m => m.id === id) || pendingInvitations.find(p => p.id === id);

                    if (memberToUpdate && memberToUpdate.role !== newRole) {
                        const adminCount = membersData.filter(m => m.isOwner && !m.isGroup).length;
                        if (memberToUpdate.isOwner && newRole !== 'Project admin' && adminCount <= 1) {
                            alert('You cannot change the role of the last Project Admin. Please assign another Project Admin first.');
                            if (activeDropdown) activeDropdown.classList.add('hidden');
                            activeDropdown = null;
                            return;
                        }
                        logActivity(`Changed role for '${memberToUpdate.name || memberToUpdate.email}' from '${memberToUpdate.role}' to '${newRole}'.`);
                        memberToUpdate.role = newRole;
                        if (!memberToUpdate.isGroup) {
                            memberToUpdate.isOwner = (newRole === 'Project admin');
                        }
                    }
                }
                if (activeDropdown) {
                    activeDropdown.classList.add('hidden');
                }
                activeDropdown = null;
                renderAll();
            }
        } else if (removeLink) {
            const dropdown = removeLink.closest('.shareproject-dropdown-content');
            if (dropdown) {
                const id = parseFloat(dropdown.id.split('-').pop());
                membersData = membersData.filter(m => m.id !== id);
                if (activeDropdown) activeDropdown.classList.add('hidden');
                activeDropdown = null;
                renderAll();
            }
        } else if (accessLink) {
            projectAccessLevel = accessLink.dataset.access;
            if (activeDropdown) activeDropdown.classList.add('hidden');
            activeDropdown = null;
            renderAll();
        } else if (!e.target.closest('.shareproject-dropdown-content')) {
            if (activeDropdown) {
                activeDropdown.classList.add('hidden');
                activeDropdown = null;
            }
        }
    });

    modalFooter.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.closest('#shareproject-leave-btn')) {
            const currentUser = membersData.find(m => m.id === currentUserId);
            const ownerCount = membersData.filter(m => m.isOwner && !m.isGroup).length;

            if (currentUser && currentUser.isOwner && ownerCount <= 1) {
                alert('You cannot leave the project as you are the only owner. Please assign another Project Admin first.');
                return;
            }

            const confirmed = confirm('Are you sure you want to leave this project?');
            if (confirmed) {
                logActivity(`User '${currentUser.name}' (ID: ${currentUserId}) left the project.`);
                closeModal();
            }
        }
    });

    // FIX: Restored the missing event listeners for the email input field.
    emailInput.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim() !== "") {
            e.preventDefault();
            addEmailTag(e.target.value);
            let searchDropdown = inviteInputWrapper.querySelector('.shareproject-user-search-dropdown');
            if (searchDropdown) searchDropdown.remove();
        }
    });

    emailInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        let searchDropdown = inviteInputWrapper.querySelector('.shareproject-user-search-dropdown');
        if (searchDropdown) searchDropdown.remove();
        if (query.length === 0) return;

        searchDropdown = document.createElement('div');
        searchDropdown.className = 'shareproject-user-search-dropdown';

        const filteredMembers = membersData.filter(member =>
            !member.isGroup && (
                (member.name && member.name.toLowerCase().includes(query)) ||
                (member.email && member.email.toLowerCase().includes(query))
            )
        );

        filteredMembers.forEach(member => {
            const searchItem = document.createElement('a');
            searchItem.href = '#';
            searchItem.addEventListener('click', (event) => {
                event.preventDefault();
                addEmailTag(member.email);
                if (searchDropdown) searchDropdown.remove();
            });
            searchItem.innerHTML = `<strong>${member.name}</strong> <span>${member.email}</span>`;
            searchDropdown.appendChild(searchItem);
        });

        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i;
        if (filteredMembers.length === 0 && emailRegex.test(query)) {
            const inviteItem = document.createElement('a');
            inviteItem.href = '#';
            inviteItem.addEventListener('click', (event) => {
                event.preventDefault();
                addEmailTag(query);
                if (searchDropdown) searchDropdown.remove();
            });
            inviteItem.innerHTML = `<i class="material-icons">person_add</i> <strong>Invite team mate</strong> <span>${query}</span>`;
            searchDropdown.appendChild(inviteItem);
        }

        if (searchDropdown.hasChildNodes()) {
            inviteInputWrapper.appendChild(searchDropdown);
        }
    });

    inviteBtn.addEventListener('click', () => {
        if (emailInput.value.trim() !== "") {
            addEmailTag(emailInput.value);
        }
        if (invitedEmails.length === 0) return;

        const roleForInvite = selectedRoleSpan.textContent;
        invitedEmails.forEach(identifier => {
             const lowercasedIdentifier = identifier.toLowerCase();
             const existingMember = membersData.find(m =>
                !m.isGroup && (
                    (m.email && m.email.toLowerCase() === lowercasedIdentifier) ||
                    (m.name && m.name.toLowerCase() === lowercasedIdentifier)
                )
             );

            if (existingMember) {
                 const adminCount = membersData.filter(m => m.isOwner && !m.isGroup).length;
                 if (existingMember.isOwner && roleForInvite !== 'Project admin' && adminCount <= 1) {
                     alert('You cannot change the role of the last Project Admin. Please assign another Project Admin first.');
                     return;
                 }
                 const oldRole = existingMember.role;
                 if (oldRole !== roleForInvite) {
                     existingMember.role = roleForInvite;
                     existingMember.isOwner = roleForInvite === 'Project admin';
                     logActivity(`Updated role for existing member '${existingMember.name}' from '${oldRole}' to '${roleForInvite}'.`);
                 }
            } else {
                 if (pendingInvitations.some(p => p.email.toLowerCase() === lowercasedIdentifier)) return;
                 const newInvite = {
                     id: Date.now() + Math.random(),
                     email: identifier,
                     role: roleForInvite,
                     status: 'pending',
                     timerId: null
                 };
                 pendingInvitations.push(newInvite);
                 logActivity(`Invited '${newInvite.email}' to the project with the role '${newInvite.role}'.`);
            }
        });

        invitedEmails.length = 0;
        renderEmailTags();
        renderAll();
    });

    // --- Initial Setup ---
    renderAll();
    renderRoleOptions();
    logActivity("Share modal initialized.");
};
    document.getElementById('share-project-btn').addEventListener('click', () => {
        if (document.getElementById('modalBackdrop')) {
            return;
        }
        createShareModal();
    });
    
    // --- 2. Define Core Functions ---
    
    /**
     * Dynamically loads the HTML, CSS, and JS for a specific tab.
     * @param {string} targetTabId - The ID of the tab to load (e.g., 'list', 'board').
     */
    async function loadTabContent(targetTabId) {
        // Now this check will work correctly because currentTabCleanup is declared.
        if (typeof currentTabCleanup === 'function') {
            currentTabCleanup();
            currentTabCleanup = null;
        }
        
        const container = document.getElementById('tab-content-container');
        if (!container) return;
        
        container.innerHTML = '<div class="section-loader"></div>';
        document.getElementById('tab-specific-css')?.remove();
        
        const htmlPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.html`;
        const cssPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.css`;
        const jsPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.js?v=${new Date().getTime()}`;
        
        try {
            const htmlRes = await fetch(htmlPath);
            if (!htmlRes.ok) throw new Error(`HTML not found for tab: ${targetTabId}`);
            const tabHtml = await htmlRes.text();
            
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = cssPath;
            link.id = "tab-specific-css";
            document.head.appendChild(link);
            
            const tabModule = await import(jsPath);
            
            container.innerHTML = tabHtml;
            
            if (tabModule.init) {
                // Store the cleanup function for the NEWLY loaded tab
                currentTabCleanup = tabModule.init({ accountId, projectId });
            }
        } catch (err) {
            let userMessage = `<p>An unexpected error occurred while loading the <strong>${targetTabId}</strong> tab.</p>`;
            let logMessage = `Failed to load tab '${targetTabId}':`;
            
            if (err.message.startsWith('HTML not found for tab')) {
                userMessage = `<p>Could not load the necessary HTML file for the <strong>${targetTabId}</strong> tab.</p>`;
                logMessage = `[HTML Load Error] Failed to fetch ${htmlPath}.`;
            } else if (err instanceof SyntaxError) {
                userMessage = `<p>The <strong>${targetTabId}</strong> tab could not be loaded due to a code error.</p><p>Please check the console for details.</p>`;
                logMessage = `[JS Syntax Error] A syntax error was found in ${jsPath}.`;
            } else if (err.message.includes('Failed to fetch dynamically imported module')) {
                userMessage = `<p>Could not load the necessary script file for the <strong>${targetTabId}</strong> tab.</p>`;
                logMessage = `[JS Load Error] The JavaScript module at ${jsPath} could not be fetched (e.g., 404 Not Found).`;
            }
            
            container.innerHTML = userMessage;
            console.error(logMessage, err);
        }
    }
    
    /**
     * Updates the 'active' class on the tab navigation links.
     * @param {string} targetTabId - The ID of the tab to highlight.
     */
    function setActiveTabLink(targetTabId) {
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-tab') === targetTabId);
        });
    }
    
    // --- 3. Attach Event Listeners ---
    
    // Define the click listener function
    tabClickListener = (event) => {
        event.preventDefault();
        const currentTab = document.querySelector('.tab-link.active')?.getAttribute('data-tab');
        const newTabId = event.currentTarget.getAttribute('data-tab');
        
        // Prevent redundant loading
        if (newTabId && newTabId !== currentTab) {
            const newUrl = `/tasks/${accountId}/${newTabId}/${projectId}`;
            history.pushState({ path: newUrl }, '', newUrl);
            
            setActiveTabLink(newTabId);
            loadTabContent(newTabId);
        }
    };
    
    tabs.forEach(tab => {
        tab.addEventListener('click', tabClickListener);
    });
    
    // --- 4. Initial Load ---
    // This now runs correctly after all functions and variables are defined.
    setActiveTabLink(tabId);
    loadTabContent(tabId); // Load the content for the initial tab from the URL.
    
    // --- 5. Return the Main Cleanup Function ---
    // This cleans up the tasks section itself when navigating away (e.g., to 'home').
    return function cleanup() {
        console.log("Cleaning up 'tasks' section and its active tab...");
        // Clean up the last active tab's JS module
        if (typeof currentTabCleanup === 'function') {
            currentTabCleanup();
        }
        // Clean up the listeners for the main tabs
        tabs.forEach(tab => tab.removeEventListener('click', tabClickListener));
    };
}

