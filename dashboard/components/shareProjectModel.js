/**
 * @file shareProject.js
 * @description Manages the project sharing modal, including data fetching, role management, and user interactions.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, arrayUnion, arrayRemove, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

// Self-contained Firebase initialization
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

let isModalOpen = false;

export function openShareModal(e) {
    if (e) e.stopPropagation();
    if (isModalOpen) return;
    isModalOpen = true;

    createModalUI();

    fetchRequiredData()
        .then(data => setupModalWithData(data))
        .catch(error => {
            console.error("Error fetching share data:", error);
            const modalBody = document.querySelector('.shareproject-modal-body');
            if (modalBody) modalBody.innerHTML = `<p style="color: red; text-align: center; padding: 40px;">Could not load project sharing details.<br>${error.message}</p>`;
        });
}

async function fetchRequiredData() {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    const workspaceQuery = query(collection(db, `users/${user.uid}/myworkspace`), where("isSelected", "==", true));
    const workspaceSnapshot = await getDocs(workspaceQuery);
    if (workspaceSnapshot.empty) throw new Error("No selected workspace found.");
    
    const workspaceDoc = workspaceSnapshot.docs[0];
    const workspaceId = workspaceDoc.id;
    const workspaceMemberUIDs = workspaceDoc.data().members || [];

    const projectPath = `users/${user.uid}/myworkspace/${workspaceId}/projects`;
    const projectQuery = query(collection(db, projectPath), where("isSelected", "==", true));
    const projectSnapshot = await getDocs(projectQuery);
    if (projectSnapshot.empty) throw new Error("No selected project found.");
    
    const projectDoc = projectSnapshot.docs[0];
    const projectRef = projectDoc.ref;
    const projectData = { id: projectDoc.id, ...projectDoc.data() };
    
    const allUniqueUIDs = [...new Set([...workspaceMemberUIDs, ...(projectData.members || []).map(m => m.uid)])];

    const userProfilePromises = allUniqueUIDs.map(uid => getDoc(doc(db, "users", uid)));
    const userProfileDocs = await Promise.all(userProfilePromises);
    
    const userProfilesMap = {};
    userProfileDocs.forEach(docSnap => {
        if (docSnap.exists()) {
            userProfilesMap[docSnap.id] = docSnap.data();
        }
    });
    
    return { projectData, projectRef, workspaceMemberCount: workspaceMemberUIDs.length, userProfilesMap };
}

function createModalUI() {
    const styles = `
    .hidden { display: none !important; } .shareproject-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; animation: fadeIn 0.3s ease; } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .shareproject-modal { background-color: white; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); width: 750px; display: flex; flex-direction: column; font-family: 'Inter', sans-serif; animation: slideIn 0.3s ease-out; max-height: 90vh; margin: auto; position: relative; } @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } } .shareproject-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #f0f0f0; } .shareproject-modal-header h2 { margin: 0; font-size: 18px; font-weight: 600; color: #111; } .shareproject-icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 50%; display: inline-flex; color: #555; } .shareproject-icon-btn:hover { background-color: #f4f4f4; } .shareproject-modal-body { padding: 16px 24px; overflow-y: auto; min-height:200px; } .shareproject-modal-body > p.shareproject-section-title { font-size: 14px; font-weight: 500; color: #333; margin: 16px 0 8px 0; } .shareproject-invite-input-wrapper { position: relative; display: flex; align-items: center; border: 1px solid #e0e0e0; border-radius: 8px; padding: 4px; margin-bottom: 16px; transition: all 0.2s ease; } .shareproject-invite-input-wrapper:focus-within { border-color: #1267FA; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); } .shareproject-email-tags-container { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-left: 8px; } .shareproject-email-tag { display: flex; align-items: center; background-color: #eef2ff; color: #4338ca; padding: 4px 10px; border-radius: 6px; font-size: 14px; font-weight: 500; } .shareproject-email-tag .shareproject-remove-tag { cursor: pointer; margin-left: 8px; font-size: 16px; } #shareproject-email-input { flex-grow: 1; border: none; outline: none; padding: 8px; font-size: 14px; background: transparent; min-width: 150px; } .shareproject-invite-controls { display: flex; align-items: center; gap: 8px; padding-right: 4px;} .shareproject-role-selector, .shareproject-member-role { position: relative; } .shareproject-dropdown-btn { background-color: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; font-size: 14px; white-space: nowrap; } .shareproject-dropdown-btn:hover { background-color: #f9f9f9; } .shareproject-dropdown-btn:disabled { background-color: #f9fafb; cursor: not-allowed; color: #555;} .shareproject-dropdown-content { position: absolute; top: calc(100% + 5px); right: 0; background-color: white; border: 1px solid #f0f0f0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); z-index: 1010; width: 300px; overflow: hidden; animation: fadeIn 0.2s ease; } .shareproject-dropdown-action { display: block; width: 100%; padding: 12px 16px; text-decoration: none; color: #333; background: none; border: none; cursor: pointer; text-align: left; font-family: 'Inter', sans-serif; font-size: 14px; } .shareproject-dropdown-action:hover, .shareproject-dropdown-content a.shareproject-remove:hover { background-color: #f4f4f4; } .shareproject-dropdown-content a { display: block; padding: 12px 16px; text-decoration: none; color: #333; } .shareproject-dropdown-content strong { font-weight: 500; display: flex; align-items: center; gap: 8px; } .shareproject-dropdown-content p { font-size: 13px; color: #666; margin: 4px 0 0 0; line-height: 1.4; } .shareproject-invite-btn { background-color: #3F7EEB; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: background-color 0.2s ease; } .shareproject-invite-btn:hover { background-color: #1267FA; } .shareproject-access-settings-wrapper { position: relative; } .shareproject-access-settings-btn { display: flex; align-items: flex-start; width: 100%; text-align: left; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px; cursor: pointer; background: none; } .shareproject-access-settings-btn:hover { background-color: #f9f9f9; } .shareproject-access-settings-btn .material-icons { margin-right: 12px; color: #555; line-height: 1.4; } .shareproject-access-settings-btn div { flex-grow: 1; } .shareproject-members-list { margin-top: 16px; } .shareproject-member-item, .shareproject-pending-item { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; } .shareproject-member-item:last-child, .shareproject-pending-item:last-child { border-bottom: none; } .shareproject-profile-pic { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 500; font-size: 14px; margin-right: 12px; text-transform: uppercase; background-size: cover; background-position: center; } .shareproject-pending-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; background-color: #f3f4f6; color: #6b7280; } .shareproject-member-info { flex-grow: 1; } .shareproject-member-info strong { font-size: 14px; font-weight: 500; color: #111; } .shareproject-member-info p { font-size: 13px; color: #666; margin: 2px 0 0 0; } .shareproject-member-role .shareproject-dropdown-btn { background: none; border: none; padding: 4px 8px; color: #555; } .shareproject-member-role .shareproject-dropdown-content { width: 300px; } .shareproject-member-role .shareproject-dropdown-content a.shareproject-remove { color: #ef4444; } .shareproject-modal-footer { padding: 16px 24px; border-top: 1px solid #f0f0f0; background-color: #f9fafb; display: flex; justify-content: space-between; align-items: center; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; } .shareproject-copy-link-btn, #shareproject-leave-btn { background: none; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; font-size: 14px; font-weight: 500; } .shareproject-copy-link-btn:hover, #shareproject-leave-btn:hover { background-color: #f4f4f4; } #shareproject-leave-btn { color: #ef4444; } #shareproject-leave-btn:hover { background-color: #fee2e2; } #shareproject-leave-btn .material-icons, .shareproject-copy-link-btn .material-icons { margin-right: 8px; color: #555; } #shareproject-leave-btn .material-icons { color: #ef4444; } .section-loader { margin: 40px auto; border: 4px solid #f3f3f3; border-radius: 50%; border-top: 4px solid #3498db; width: 40px; height: 40px; animation: spin 2s linear infinite; } @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .shareproject-user-search-dropdown { position: absolute; top: 100%; left: 0; right: 0; background-color: white; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); z-index: 1010; max-height: 200px; overflow-y: auto; } .shareproject-user-search-dropdown a { display: flex; align-items: center; padding: 8px 16px; text-decoration: none; color: #333; } .shareproject-user-search-dropdown a:hover { background-color: #f4f4f4; }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.id = "share-project-styles";
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    
    const modalHTML = `
    <div class="shareproject-modal">
        <div class="shareproject-modal-header"><h2>Share Project</h2><button id="shareproject-close-modal-btn" class="shareproject-icon-btn"><i class="material-icons">close</i></button></div>
        <div class="shareproject-modal-body"><div class="section-loader"></div></div>
        <div class="shareproject-modal-footer"><div id="shareproject-footer-left"></div><button class="shareproject-copy-link-btn"><i class="material-icons">link</i>Copy project link</button></div>
    </div>`;
    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'shareproject-modal-backdrop';
    modalBackdrop.className = 'shareproject-modal-backdrop';
    modalBackdrop.innerHTML = modalHTML;
    document.body.appendChild(modalBackdrop);
}

function setupModalWithData({ projectData, projectRef, workspaceMemberCount, userProfilesMap }) {
    // --- STATE INITIALIZATION ---
    const currentUserId = auth.currentUser.uid;
    let members = JSON.parse(JSON.stringify(projectData.members || []));
    let pendingInvites = JSON.parse(JSON.stringify(projectData.pendingInvites || []));
    let accessLevel = projectData.accessLevel || 'private';
    let workspaceRole = projectData.workspaceRole || 'Viewer';
    let invitedEmails = [];
    let activeDropdown = null;

    // --- DOM ACQUISITION & RENDER ---
    const modal = document.querySelector('.shareproject-modal');
    const modalBody = document.querySelector('.shareproject-modal-body');
    const modalHeaderTitle = document.querySelector('.shareproject-modal-header h2');
    if (!modal || !modalBody || !modalHeaderTitle) return;

    modalHeaderTitle.textContent = `Share ${projectData.title || 'Unnamed Project'}`;
    modalBody.innerHTML = `
        <div class="shareproject-invite-input-wrapper"><div id="shareproject-email-tags" class="shareproject-email-tags-container"></div><input type="text" id="shareproject-email-input" placeholder="Add people by name or email..."><div class="shareproject-invite-controls"><div class="shareproject-role-selector"><button id="shareproject-role-dropdown-btn" class="shareproject-dropdown-btn"><span id="shareproject-selected-role">Editor</span><i class="material-icons">arrow_drop_down</i></button></div><button id="shareproject-invite-btn" class="shareproject-invite-btn">Invite</button></div></div>
        <div id="shareproject-role-dropdown" class="shareproject-dropdown-content hidden"></div>
        <div class="shareproject-access-settings-wrapper"><button id="shareproject-access-settings-btn" class="shareproject-access-settings-btn"><i class="material-icons" id="shareproject-access-icon"></i><div><strong id="shareproject-access-title"></strong><p id="shareproject-access-desc"></p></div><i class="material-icons">arrow_drop_down</i></button></div>
        <div id="shareproject-access-dropdown" class="shareproject-dropdown-content hidden" style="width: 100%;"></div>
        <p class="shareproject-section-title">Project Members</p><div class="shareproject-members-list" id="shareproject-members-list"></div>
        <div id="shareproject-pending-list-container"></div>`;

    const membersListEl = document.getElementById('shareproject-members-list');
    const pendingListContainerEl = document.getElementById('shareproject-pending-list-container');
    const inviteBtn = document.getElementById('shareproject-invite-btn');
    const emailInput = document.getElementById('shareproject-email-input');
    const emailTagsContainer = document.getElementById('shareproject-email-tags');
    const inviteInputWrapper = document.querySelector('.shareproject-invite-input-wrapper');
    const closeModalBtn = document.getElementById('shareproject-close-modal-btn');
    const accessSettingsBtn = document.getElementById('shareproject-access-settings-btn');
    const mainRoleDropdownBtn = document.getElementById('shareproject-role-dropdown-btn');

    const profileColors = ['#4A148C', '#004D40', '#BF360C', '#0D47A1', '#4E342E', '#AD1457', '#006064'];
    const roles = {
        member: ['Project admin', 'Editor', 'Commenter', 'Viewer'],
        workspace: ['Editor', 'Commenter', 'Viewer'],
        invite: ['Project admin', 'Editor', 'Commenter', 'Viewer']
    };

    // --- CORE HELPER FUNCTIONS ---
    const closeModal = () => { isModalOpen = false; document.getElementById('shareproject-modal-backdrop')?.remove(); document.getElementById('share-project-styles')?.remove(); };
    const renderAll = () => { renderAccessLevel(); renderMembers(); renderPending(); renderRoleOptions(); };
    const positionAndShowDropdown = (dropdownEl, buttonEl) => { if (activeDropdown && activeDropdown !== dropdownEl) { activeDropdown.classList.add('hidden'); } modal.appendChild(dropdownEl); const modalRect = modal.getBoundingClientRect(); const buttonRect = buttonEl.getBoundingClientRect(); dropdownEl.style.top = `${buttonRect.bottom - modalRect.top + 2}px`; dropdownEl.style.right = `${modalRect.right - buttonRect.right}px`; dropdownEl.style.left = 'auto'; dropdownEl.classList.remove('hidden'); activeDropdown = dropdownEl; };
    const closeActiveDropdown = () => { if (activeDropdown) { if (activeDropdown.classList.contains('shareproject-user-search-dropdown')) { activeDropdown.remove(); } else { activeDropdown.classList.add('hidden'); } activeDropdown = null; } };
    
    // --- UI RENDERING FUNCTIONS ---
    const createProfilePic = (profile) => { const pic = document.createElement('div'); pic.className = 'shareproject-profile-pic'; if (profile && profile.avatar) { pic.style.backgroundImage = `url(${profile.avatar})`; } else { const name = (profile && profile.name) ? profile.name : 'U'; pic.textContent = name.split(' ').map(n => n[0]).join('').substring(0, 2); const hash = name.split("").reduce((a, b) => (a = ((a << 5) - a) + b.charCodeAt(0), a & a), 0); pic.style.backgroundColor = profileColors[Math.abs(hash) % profileColors.length]; } return pic; };
    const renderAccessLevel = () => { const icon = document.getElementById('shareproject-access-icon'); const title = document.getElementById('shareproject-access-title'); const desc = document.getElementById('shareproject-access-desc'); const dropdown = document.getElementById('shareproject-access-dropdown'); if(!icon || !title || !desc || !dropdown) return; dropdown.innerHTML = `<a href="#" data-access="workspace"><strong><i class="material-icons">public</i> My Workspace</strong><p>Everyone in this workspace can find and access.</p></a><a href="#" data-access="private"><strong><i class="material-icons">lock</i> Private to members</strong><p>Only members explicitly invited can access.</p></a>`; if (accessLevel === 'workspace') { icon.textContent = 'public'; title.textContent = 'My Workspace'; desc.textContent = `Everyone in the workspace can access as a ${workspaceRole}.`; } else { icon.textContent = 'lock'; title.textContent = 'Private to Members'; desc.textContent = 'Only explicitly invited members can access.'; } };
    const renderMembers = () => { membersListEl.innerHTML = ''; const adminCount = members.filter(m => m.role === 'Project admin').length; const createRoleDropdown = (id, currentRole, availableRoles, isLocked) => { const dropdownId = `role-dropdown-for-${id.replace(/[^a-zA-Z0-9]/g, '')}`; const disabledAttr = isLocked ? 'disabled' : ''; const dropdownIcon = isLocked ? '' : '<i class="material-icons">arrow_drop_down</i>'; const roleOptions = availableRoles.map(role => `<button class="shareproject-dropdown-action" data-role="${role}"><strong>${role}</strong></button>`).join(''); const removeLink = (id !== 'workspace' && !isLocked) ? `<a href="#" class="shareproject-remove"><i class="material-icons">person_remove</i> Remove member</a>` : ''; return `<div class="shareproject-member-role" data-id="${id}"><button class="shareproject-dropdown-btn" data-target-dropdown="${dropdownId}" ${disabledAttr}><span>${currentRole}</span>${dropdownIcon}</button><div id="${dropdownId}" class="shareproject-dropdown-content hidden">${roleOptions}${removeLink}</div></div>`; }; if (accessLevel === 'workspace') { const el = document.createElement('div'); el.className = 'shareproject-member-item'; el.innerHTML = `<div class="shareproject-profile-pic" style="background-color:#e5e7eb;color:#4b5563;"><i class="material-icons">people</i></div><div class="shareproject-member-info"><strong>My Workspace</strong><p>${workspaceMemberCount} members</p></div>${createRoleDropdown('workspace', workspaceRole, roles.workspace, false)}`; membersListEl.appendChild(el); } members.forEach(member => { const userProfile = userProfilesMap[member.uid] || { name: 'Unknown User', email: 'No email found' }; if (member.uid === currentUserId) member.role = 'Project admin'; const isLastAdmin = (member.role === 'Project admin' && adminCount <= 1 && member.uid === currentUserId); const itemEl = document.createElement('div'); itemEl.className = 'shareproject-member-item'; itemEl.innerHTML = `<div class="shareproject-member-info"><strong>${userProfile.name}</strong><p>${userProfile.email || 'No email provided'}</p></div>${createRoleDropdown(member.uid, member.role, roles.member, isLastAdmin)}`; itemEl.prepend(createProfilePic(userProfile)); membersListEl.appendChild(itemEl); }); };
    const renderPending = () => { pendingListContainerEl.innerHTML = ''; if (pendingInvites.length === 0) return; let listHTML = '<p class="shareproject-section-title">Pending Invitations</p>'; pendingInvites.forEach(invite => { listHTML += `<div class="shareproject-pending-item" data-id="${invite.email}"><div class="shareproject-pending-icon"><i class="material-icons">hourglass_top</i></div><div class="shareproject-member-info"><strong>${invite.email}</strong><p>Invitation sent. Role: ${invite.role}</p></div></div>`; }); pendingListContainerEl.innerHTML = listHTML; };
    const renderRoleOptions = () => { const roleDropdownEl = document.getElementById('shareproject-role-dropdown'); if (!roleDropdownEl) return; roleDropdownEl.innerHTML = roles.invite.map(role => `<button class="shareproject-dropdown-action" data-role="${role}"><p>${role}</p></button>`).join(''); };
    const addEmailTag = (email) => { if (email && !invitedEmails.includes(email)) { invitedEmails.push(email); renderEmailTags(); } emailInput.value = ''; };
    const renderEmailTags = () => { emailTagsContainer.innerHTML = ''; invitedEmails.forEach(email => { const tag = document.createElement('div'); tag.className = 'shareproject-email-tag'; tag.innerHTML = `<span>${email}</span><span class="shareproject-remove-tag" data-email="${email}">&times;</span>`; tag.querySelector('.shareproject-remove-tag').addEventListener('click', (e) => { invitedEmails.splice(invitedEmails.indexOf(e.target.dataset.email), 1); renderEmailTags(); }); emailTagsContainer.appendChild(tag); }); };

    // --- EVENT LISTENERS (REBUILT FOR RELIABILITY AND CLARITY) ---

    // Close modal or dropdowns when clicking outside
    document.getElementById('shareproject-modal-backdrop').addEventListener('click', (e) => {
        if (e.target.id === 'shareproject-modal-backdrop') {
            closeModal();
        } else if (!e.target.closest('.shareproject-dropdown-btn') && !e.target.closest('#shareproject-access-settings-btn') && !e.target.closest('.shareproject-dropdown-content') && !e.target.closest('.shareproject-user-search-dropdown')) {
            closeActiveDropdown();
        }
    });
    closeModalBtn.addEventListener('click', closeModal);

    // Toggle dropdowns for static buttons
    accessSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = document.getElementById('shareproject-access-dropdown');
        (activeDropdown === dropdown) ? closeActiveDropdown() : positionAndShowDropdown(dropdown, accessSettingsBtn);
    });
    mainRoleDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = document.getElementById('shareproject-role-dropdown');
        (activeDropdown === dropdown) ? closeActiveDropdown() : positionAndShowDropdown(dropdown, mainRoleDropdownBtn);
    });

    // Delegated listener for actions WITHIN any dropdown
    modal.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('.shareproject-dropdown-content > a, .shareproject-dropdown-content > button');
        if (!actionBtn) return;
        
        e.preventDefault();
        closeActiveDropdown();

        // Handle Access Level Change
        const access = actionBtn.dataset.access;
        if (access) {
            accessLevel = access;
            await updateDoc(projectRef, { accessLevel });
            renderAll();
            return;
        }

        // Handle Role Change / Remove Member
        const container = actionBtn.closest('[data-id]');
        const id = container?.dataset.id;
        const role = actionBtn.dataset.role;

        if (actionBtn.matches('.shareproject-remove')) {
            const memberToRemove = members.find(m => m.uid === id);
            if (memberToRemove) {
                await updateDoc(projectRef, { members: arrayRemove(memberToRemove) });
                members = members.filter(m => m.uid !== id);
                renderAll();
            }
        } else if (role) {
            if (id) { // This is a role change for a specific member or the workspace
                if (id === 'workspace') {
                    workspaceRole = role;
                    await updateDoc(projectRef, { workspaceRole });
                } else {
                    const memberIndex = members.findIndex(m => m.uid === id);
                    if (memberIndex > -1) {
                        const oldData = members[memberIndex];
                        const newData = { ...oldData, role: role };
                        await updateDoc(projectRef, { members: arrayRemove(oldData) });
                        await updateDoc(projectRef, { members: arrayUnion(newData) });
                        members[memberIndex] = newData;
                    }
                }
            } else { // This is for the main invite role selector
                document.getElementById('shareproject-selected-role').textContent = role;
            }
            renderAll();
        }
    });

    // Delegated listener for opening member-specific dropdowns
    membersListEl.addEventListener('click', (e) => {
        const dropdownBtn = e.target.closest('.shareproject-dropdown-btn');
        if (dropdownBtn) {
            e.stopPropagation();
            const dropdown = dropdownBtn.nextElementSibling;
            (activeDropdown === dropdown) ? closeActiveDropdown() : positionAndShowDropdown(dropdown, dropdownBtn);
        }
    });

    // Invite Logic Listeners
    emailInput.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim()) {
            e.preventDefault();
            addEmailTag(e.target.value.trim());
            closeActiveDropdown();
        } else if (e.key === 'Backspace' && e.target.value === '' && invitedEmails.length > 0) {
            invitedEmails.pop();
            renderEmailTags();
        }
    });

    emailInput.addEventListener('input', () => {
        closeActiveDropdown();
        const query = emailInput.value.toLowerCase();
        
        let searchDropdown = document.createElement('div');
        searchDropdown.className = 'shareproject-user-search-dropdown';
        
        const existingEmails = [...members.map(m => userProfilesMap[m.uid]?.email), ...pendingInvites.map(p => p.email), ...invitedEmails].filter(Boolean);
        const filteredUsers = Object.values(userProfilesMap).filter(user => user.email && !existingEmails.includes(user.email) && (user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)));
        
        if (filteredUsers.length > 0 && query) {
            filteredUsers.forEach(user => {
                const item = document.createElement('a');
                item.href = '#';
                item.innerHTML = `<div class="shareproject-profile-pic" style="background-image:url(${user.avatar || ''}); width:24px; height:24px; margin-right:8px;"></div> <strong>${user.name}</strong> <span style="color:#666;margin-left:8px;">${user.email}</span>`;
                item.addEventListener('click', (evt) => {
                    evt.preventDefault();
                    addEmailTag(user.email);
                    closeActiveDropdown();
                });
                searchDropdown.appendChild(item);
            });
            inviteInputWrapper.appendChild(searchDropdown);
            activeDropdown = searchDropdown;
        }
    });

    inviteBtn.addEventListener('click', async () => {
        if (emailInput.value.trim()) addEmailTag(emailInput.value.trim());
        const roleForInvite = document.getElementById('shareproject-selected-role').textContent;
        if (invitedEmails.length === 0) return;
        
        const allMemberEmails = members.map(m => userProfilesMap[m.uid]?.email);
        const newInvites = invitedEmails
            .filter(email => !allMemberEmails.includes(email) && !pendingInvites.some(p => p.email === email))
            .map(email => ({ email, role: roleForInvite, invitedAt: new Date() }));
        
        if (newInvites.length > 0) {
            await updateDoc(projectRef, { pendingInvites: arrayUnion(...newInvites) });
            pendingInvites.push(...newInvites);
            renderAll();
        }
        invitedEmails = [];
        emailTagsContainer.innerHTML = '';
    });
    
    // Initial Render
    renderAll();
}