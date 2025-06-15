/**
 * @file shareProject.js
 * @description Manages the project sharing modal with real-time updates, a Super Admin permission system, and corrected UI/event logic.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, arrayUnion, arrayRemove, getDoc, deleteField, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

// --- Module-level state ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

let isModalOpen = false;
let unsubscribeProjectListener = null;

function closeModal() {
    if (unsubscribeProjectListener) {
        unsubscribeProjectListener();
        unsubscribeProjectListener = null;
        console.log("Realtime project listener detached.");
    }
    isModalOpen = false;
    document.getElementById('shareproject-modal-backdrop')?.remove();
    document.getElementById('share-project-styles')?.remove();
}

export async function openShareModal(e) {
    if (e) e.stopPropagation();
    if (isModalOpen) return;
    isModalOpen = true;

    createModalUI();
    const modal = document.querySelector('.shareproject-modal');
    const modalBody = document.querySelector('.shareproject-modal-body');

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated.");

        const workspaceQuery = query(collection(db, `users/${user.uid}/myworkspace`), where("isSelected", "==", true));
        const workspaceSnapshot = await getDocs(workspaceQuery);
        if (workspaceSnapshot.empty) throw new Error("No selected workspace found.");
        const workspaceDoc = workspaceSnapshot.docs[0];

        const projectPath = `users/${user.uid}/myworkspace/${workspaceDoc.id}/projects`;
        const projectQuery = query(collection(db, projectPath), where("isSelected", "==", true));
        const projectSnapshot = await getDocs(projectQuery);
        if (projectSnapshot.empty) throw new Error("No selected project found.");
        const projectRef = projectSnapshot.docs[0].ref;

        renderStaticDropdownContent(modal);
        setupEventListeners(modal, projectRef);
        
        unsubscribeProjectListener = onSnapshot(projectRef, async (projectDocSnap) => {
            if (!projectDocSnap.exists()) {
                closeModal();
                throw new Error("Project document was deleted or is no longer accessible.");
            }
            console.log("Real-time update received from Firestore.");
            
            const projectData = { id: projectDocSnap.id, ...projectDocSnap.data() };
            
            const projectMemberUIDs = projectData.members ? projectData.members.map(m => m.uid) : [];
            const allUniqueUIDs = [...new Set([projectData.project_super_admin_uid, user.uid, ...projectMemberUIDs])].filter(Boolean);

            const userProfilePromises = allUniqueUIDs.map(uid => getDoc(doc(db, "users", uid)));
            const userProfileDocs = await Promise.all(userProfilePromises);
            const userProfilesMap = userProfileDocs.reduce((acc, docSnap) => {
                if (docSnap.exists()) acc[docSnap.id] = docSnap.data();
                return acc;
            }, {});

            renderDynamicContent(modal, {
                projectData,
                workspaceMemberCount: workspaceDoc.data().members?.length || 0,
                userProfilesMap,
                currentUserId: user.uid
            });
        });

    } catch (error) {
        console.error("Error setting up share modal:", error);
        if (modalBody) modalBody.innerHTML = `<p style="color: red; text-align: center; padding: 40px;">Could not load project sharing details.<br>${error.message}</p>`;
    }
}

// FIX: Rebuilt event listeners for robust logic and correct UI positioning.
function setupEventListeners(modal, projectRef) {
    // Listener for closing the modal
    modal.querySelector('#shareproject-close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('shareproject-modal-backdrop').addEventListener('click', (e) => {
        if (e.target.id === 'shareproject-modal-backdrop') closeModal();
        // Click away to close dropdowns
        if (!e.target.closest('[data-target-dropdown], .shareproject-dropdown-content')) {
             document.querySelectorAll('.shareproject-dropdown-content').forEach(el => el.classList.add('hidden'));
        }
    });

    // Listener for toggling dropdowns with correct positioning logic
    modal.addEventListener('click', (e) => {
        const dropdownBtn = e.target.closest('[data-target-dropdown]');
        if (dropdownBtn) {
            e.stopPropagation();
            const dropdown = document.getElementById(dropdownBtn.dataset.targetDropdown);
            if (!dropdown) return;

            // Tag the dropdown with context of what it's for
            const contextId = dropdownBtn.closest('[data-uid]')?.dataset.uid || dropdownBtn.closest('[data-id]')?.dataset.id || dropdownBtn.id;
            dropdown.dataset.contextId = contextId;
            
            const isHidden = dropdown.classList.contains('hidden');
            document.querySelectorAll('.shareproject-dropdown-content').forEach(el => el.classList.add('hidden'));

            if (isHidden) {
                const modalRect = modal.getBoundingClientRect();
                const buttonRect = dropdownBtn.getBoundingClientRect();
                
                dropdown.style.top = `${buttonRect.bottom - modalRect.top + 5}px`;
                
                // Different alignment logic for different dropdowns
                if (dropdown.id === 'shareproject-access-dropdown') {
                    dropdown.style.left = `${buttonRect.left - modalRect.left}px`;
                    dropdown.style.right = `${modalRect.right - buttonRect.right}px`;
                } else {
                    const dropdownWidth = dropdown.offsetWidth;
                    dropdown.style.left = `${(buttonRect.right - modalRect.left) - dropdownWidth}px`;
                    dropdown.style.right = `auto`;
                }
                dropdown.classList.remove('hidden');
            }
        }
    });

    // FIX: Single, consolidated listener for all dropdown actions
    modal.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('.shareproject-dropdown-action');
        if (!actionBtn) return;
        
        e.preventDefault();
        const dropdown = actionBtn.closest('.shareproject-dropdown-content');
        if (!dropdown) return;

        const contextId = dropdown.dataset.contextId;
        const projectData = JSON.parse(modal.dataset.projectData || '{}');
        const superAdminUID = projectData.project_super_admin_uid;
        const currentUserId = auth.currentUser.uid;
        
        const newRole = actionBtn.dataset.role;
        const newAccess = actionBtn.dataset.access;
        const isRemove = actionBtn.matches('.shareproject-remove');
        
        // --- Logic for Access Level Dropdown ---
        if (contextId === 'shareproject-access-settings-btn') {
            if (currentUserId !== superAdminUID) return alert("Only the Super Admin can change project access settings.");
            if (newAccess) {
                await updateDoc(projectRef, { accessLevel: newAccess });
                console.log(`LOG: Project access level updated to "${newAccess}".`);
            }
        }
        // --- Logic for Invite Role Dropdown ---
        else if (contextId === 'shareproject-invite-role-btn') {
             if (newRole) modal.querySelector('#shareproject-selected-role').textContent = newRole;
        }
        // --- Logic for My Workspace ---
        else if (contextId === 'workspace-item') {
            if (currentUserId !== superAdminUID) return alert("Only the Super Admin can change the workspace role.");
            if (newRole) {
                await updateDoc(projectRef, { workspaceRole: newRole });
                console.log(`LOG: My Workspace role updated to "${newRole}".`);
            }
        }
        // --- Logic for Project Members ---
        else {
            const memberId = contextId; // The UID is the context
            if (currentUserId !== superAdminUID) return alert("Only the Super Admin can modify member roles or remove them.");
            
            const memberData = (projectData.members || []).find(m => m.uid === memberId);
            if (!memberData) return console.error("Could not find member data for action.");

            if (isRemove) {
                console.log(`LOG: Removing member ${memberId}`);
                await updateDoc(projectRef, { members: arrayRemove(memberData) });
                if (projectData.project_admin_user === memberId) {
                    await updateDoc(projectRef, { project_admin_user: deleteField() });
                }
            } else if (newRole) {
                console.log(`LOG: Updating member ${memberId} to role "${newRole}"`);
                const newData = { ...memberData, role: newRole };
                await updateDoc(projectRef, { members: arrayRemove(memberData) });
                await updateDoc(projectRef, { members: arrayUnion(newData) });
                
                if (newRole === 'Project admin') {
                    await updateDoc(projectRef, { project_admin_user: memberId });
                } else if (memberData.role === 'Project admin') {
                    await updateDoc(projectRef, { project_admin_user: deleteField() });
                }
            }
        }

        dropdown.classList.add('hidden'); // Close dropdown after action
    });
}

function renderStaticDropdownContent(modal) {
    const roles = { invite: ['Project admin', 'Editor', 'Commenter', 'Viewer'] };
    const roleDropdown = modal.querySelector('#shareproject-role-dropdown');
    const accessDropdown = modal.querySelector('#shareproject-access-dropdown');

    if(roleDropdown) {
        roleDropdown.innerHTML = roles.invite.map(role => `<button class="shareproject-dropdown-action" data-role="${role}">${role}</button>`).join('');
    }
    if(accessDropdown) {
        accessDropdown.innerHTML = `
            <a href="#" data-access="workspace" class="shareproject-dropdown-action"><strong><i class="material-icons">public</i> My Workspace</strong><p>Everyone can find and access.</p></a>
            <a href="#" data-access="private" class="shareproject-dropdown-action"><strong><i class="material-icons">lock</i> Private to members</strong><p>Only invited members can access.</p></a>
        `;
    }
}

function renderDynamicContent(modal, { projectData, workspaceMemberCount, userProfilesMap, currentUserId }) {
    modal.dataset.projectData = JSON.stringify(projectData);

    const superAdminUID = projectData.project_super_admin_uid;
    let state = {
        members: JSON.parse(JSON.stringify(projectData.members || [])),
        pendingInvites: JSON.parse(JSON.stringify(projectData.pendingInvites || [])),
        accessLevel: projectData.accessLevel || 'private',
        workspaceRole: projectData.workspaceRole || 'Viewer',
    };

    const superAdminIndex = state.members.findIndex(m => m.uid === superAdminUID);
    if (superAdminIndex > -1) {
        state.members[superAdminIndex].role = 'Project admin';
    } else if (superAdminUID) {
        state.members.unshift({ uid: superAdminUID, role: 'Project admin' });
    }
    
    const roles = { member: ['Project admin', 'Editor', 'Commenter', 'Viewer'], workspace: ['Editor', 'Commenter', 'Viewer'] };
    const canChangeRoles = currentUserId === superAdminUID;

    const icon = modal.querySelector('#shareproject-access-icon');
    const title = modal.querySelector('#shareproject-access-title');
    const desc = modal.querySelector('#shareproject-access-desc');
    if (icon && title && desc) {
        if (state.accessLevel === 'workspace') {
            icon.textContent = 'public';
            title.textContent = 'My Workspace';
            desc.textContent = `Everyone can access as a ${state.workspaceRole}.`;
        } else {
            icon.textContent = 'lock';
            title.textContent = 'Private to Members';
            desc.textContent = 'Only explicitly invited members can access.';
        }
    }
    
    const createRoleDropdown = (id, currentRole, availableRoles, isLocked, itemType) => {
        const dropdownId = `${itemType}-role-dropdown-for-${id.replace(/[^a-zA-Z0-9]/g, '')}`;
        const disabledAttr = (isLocked || !canChangeRoles) ? 'disabled' : '';
        const dropdownIcon = (isLocked || !canChangeRoles) ? '' : '<i class="material-icons">arrow_drop_down</i>';
        const roleOptions = availableRoles.map(role => `<button class="shareproject-dropdown-action" data-role="${role}"><strong>${role}</strong></button>`).join('');
        const removeLink = (itemType === 'member' && !isLocked && canChangeRoles) ? `<a href="#" class="shareproject-remove"><i class="material-icons">person_remove</i> Remove member</a>` : '';
        return `<div class="shareproject-member-role" data-id="${id}"><button class="shareproject-dropdown-btn" data-target-dropdown="${dropdownId}" ${disabledAttr}><span>${currentRole}</span>${dropdownIcon}</button><div id="${dropdownId}" class="shareproject-dropdown-content hidden">${roleOptions}${removeLink}</div></div>`;
    };

    let membersHTML = '';
    if (state.accessLevel === 'workspace') {
        membersHTML += `<div class="shareproject-member-item" data-id="workspace-item">${createProfilePic({name: 'WS'}).outerHTML}<div class="shareproject-member-info"><strong>My Workspace</strong><p>${workspaceMemberCount} members</p></div>${createRoleDropdown('workspace-item', state.workspaceRole, roles.workspace, false, 'workspace')}</div>`;
    }
    
    state.members.forEach(member => {
        const userProfile = userProfilesMap[member.uid] || { name: 'Unknown User', email: 'No email found' };
        const isLocked = member.uid === superAdminUID;
        const displayRole = isLocked ? 'Project admin' : member.role;
        const profilePicHTML = createProfilePic(userProfile).outerHTML;
        membersHTML += `<div class="shareproject-member-item" data-uid="${member.uid}">${profilePicHTML}<div class="shareproject-member-info"><strong>${userProfile.name} ${isLocked ? '(Super Admin)' : ''}</strong><p>${userProfile.email || 'No email provided'}</p></div>${createRoleDropdown(member.uid, displayRole, roles.member, isLocked, 'member')}</div>`;
    });

    let pendingHTML = '';
    if (state.pendingInvites.length > 0) {
        pendingHTML += '<p class="shareproject-section-title">Pending Invitations</p>';
        state.pendingInvites.forEach(invite => {
            pendingHTML += `<div class="shareproject-pending-item" data-id="${invite.email}"><div class="shareproject-pending-icon"><i class="material-icons">hourglass_top</i></div><div class="shareproject-member-info"><strong>${invite.email}</strong><p>Invitation sent. Role: ${invite.role}</p></div></div>`;
        });
    }

    modal.querySelector('.shareproject-modal-header h2').textContent = `Share ${projectData.title || 'Unnamed Project'}`;
    modal.querySelector('#shareproject-members-list').innerHTML = membersHTML;
    modal.querySelector('#shareproject-pending-list-container').innerHTML = pendingHTML;
}

function createProfilePic(profile) {
    const profileColors = ['#4A148C', '#004D40', '#BF360C', '#0D47A1', '#4E342E', '#AD1457', '#006064'];
    const pic = document.createElement('div');
    pic.className = 'shareproject-profile-pic';
    if (profile && profile.avatar) {
        pic.style.backgroundImage = `url(${profile.avatar})`;
    } else {
        const name = (profile && profile.name) ? profile.name : 'U';
        pic.textContent = name.split(' ').map(n => n[0]).join('').substring(0, 2);
        const hash = name.split("").reduce((a, b) => (a = ((a << 5) - a) + b.charCodeAt(0), a & a), 0);
        pic.style.backgroundColor = profileColors[Math.abs(hash) % profileColors.length];
    }
    return pic;
};

// FIX: CSS for hidden class no longer uses !important.
function createModalUI() {
    const styles = `
    .hidden { display: none; } .shareproject-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; animation: fadeIn 0.3s ease; } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .shareproject-modal { background-color: white; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); width: 750px; display: flex; flex-direction: column; font-family: 'Inter', sans-serif; animation: slideIn 0.3s ease-out; max-height: 90vh; margin: auto; position: relative; } @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } } .shareproject-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #f0f0f0; } .shareproject-modal-header h2 { margin: 0; font-size: 18px; font-weight: 600; color: #111; } .shareproject-icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 50%; display: inline-flex; color: #555; } .shareproject-icon-btn:hover { background-color: #f4f4f4; } .shareproject-modal-body { padding: 16px 24px; overflow-y: auto; min-height:200px; } .shareproject-modal-body > p.shareproject-section-title { font-size: 14px; font-weight: 500; color: #333; margin: 16px 0 8px 0; } .shareproject-invite-input-wrapper { position: relative; display: flex; align-items: center; border: 1px solid #e0e0e0; border-radius: 8px; padding: 4px; margin-bottom: 16px; transition: all 0.2s ease; } .shareproject-invite-input-wrapper:focus-within { border-color: #1267FA; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); } .shareproject-email-tags-container { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-left: 8px; } .shareproject-email-tag { display: flex; align-items: center; background-color: #eef2ff; color: #4338ca; padding: 4px 10px; border-radius: 6px; font-size: 14px; font-weight: 500; } .shareproject-email-tag .shareproject-remove-tag { cursor: pointer; margin-left: 8px; font-size: 16px; } #shareproject-email-input { flex-grow: 1; border: none; outline: none; padding: 8px; font-size: 14px; background: transparent; min-width: 150px; } .shareproject-invite-controls { display: flex; align-items: center; gap: 8px; padding-right: 4px;} .shareproject-role-selector, .shareproject-member-role { position: relative; } .shareproject-dropdown-btn { background-color: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; font-size: 14px; white-space: nowrap; } .shareproject-dropdown-btn:hover { background-color: #f9f9f9; } .shareproject-dropdown-btn:disabled { background-color: #f9fafb; cursor: not-allowed; color: #555;} .shareproject-dropdown-content { position: absolute; background-color: white; border: 1px solid #f0f0f0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); z-index: 1010; width: 300px; overflow: hidden; animation: fadeIn 0.2s ease; } .shareproject-dropdown-action { display: block; width: 100%; padding: 12px 16px; text-decoration: none; color: #333; background: none; border: none; cursor: pointer; text-align: left; font-family: 'Inter', sans-serif; font-size: 14px; } .shareproject-dropdown-action:hover, .shareproject-dropdown-content a.shareproject-remove:hover { background-color: #f4f4f4; } .shareproject-dropdown-content a { display: block; padding: 12px 16px; text-decoration: none; color: #333; } .shareproject-dropdown-content strong { font-weight: 500; display: flex; align-items: center; gap: 8px; } .shareproject-dropdown-content p { font-size: 13px; color: #666; margin: 4px 0 0 0; line-height: 1.4; } .shareproject-invite-btn { background-color: #3F7EEB; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: background-color 0.2s ease; } .shareproject-invite-btn:hover { background-color: #1267FA; } .shareproject-access-settings-btn { display: flex; align-items: flex-start; width: 100%; text-align: left; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px; cursor: pointer; background: none; } .shareproject-access-settings-btn:hover { background-color: #f9f9f9; } .shareproject-access-settings-btn .material-icons { margin-right: 12px; color: #555; line-height: 1.4; } .shareproject-access-settings-btn div { flex-grow: 1; } .shareproject-members-list { margin-top: 16px; } .shareproject-member-item, .shareproject-pending-item { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; } .shareproject-member-item:last-child, .shareproject-pending-item:last-child { border-bottom: none; } .shareproject-profile-pic { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 500; font-size: 14px; margin-right: 12px; text-transform: uppercase; background-size: cover; background-position: center; } .shareproject-pending-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; background-color: #f3f4f6; color: #6b7280; } .shareproject-member-info { flex-grow: 1; } .shareproject-member-info strong { font-size: 14px; font-weight: 500; color: #111; } .shareproject-member-info p { font-size: 13px; color: #666; margin: 2px 0 0 0; } .shareproject-member-role .shareproject-dropdown-btn { background: none; border: none; padding: 4px 8px; color: #555; } .shareproject-member-role .shareproject-dropdown-content { width: auto; min-width: 200px; } .shareproject-member-role .shareproject-dropdown-content a.shareproject-remove { color: #ef4444; } .shareproject-modal-footer { padding: 16px 24px; border-top: 1px solid #f0f0f0; background-color: #f9fafb; display: flex; justify-content: space-between; align-items: center; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; } .shareproject-copy-link-btn, #shareproject-leave-btn { background: none; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; font-size: 14px; font-weight: 500; } #shareproject-leave-btn .material-icons, .shareproject-copy-link-btn .material-icons { margin-right: 8px; color: #555; } #shareproject-leave-btn .material-icons { color: #ef4444; } .section-loader { margin: 40px auto; border: 4px solid #f3f3f3; border-radius: 50%; border-top: 4px solid #3498db; width: 40px; height: 40px; animation: spin 2s linear infinite; } @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .shareproject-user-search-dropdown { position: absolute; top: 100%; left: 0; right: 0; background-color: white; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); z-index: 1010; max-height: 200px; overflow-y: auto; } .shareproject-user-search-dropdown a { display: flex; align-items: center; padding: 8px 16px; text-decoration: none; color: #333; } .shareproject-user-search-dropdown a:hover { background-color: #f4f4f4; }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.id = "share-project-styles";
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    
    const modalHTML = `
    <div class="shareproject-modal">
        <div class="shareproject-modal-header"><h2>Share Project</h2><button id="shareproject-close-modal-btn" class="shareproject-icon-btn"><i class="material-icons">close</i></button></div>
        <div class="shareproject-modal-body">
            <div class="shareproject-invite-input-wrapper">
                <div id="shareproject-email-tags" class="shareproject-email-tags-container"></div>
                <input type="text" id="shareproject-email-input" placeholder="Add people by name or email...">
                <div class="shareproject-invite-controls">
                    <div class="shareproject-role-selector">
                        <button id="shareproject-invite-role-btn" data-target-dropdown="shareproject-role-dropdown" class="shareproject-dropdown-btn">
                            <span id="shareproject-selected-role">Editor</span><i class="material-icons">arrow_drop_down</i>
                        </button>
                    </div>
                    <button id="shareproject-invite-btn" class="shareproject-invite-btn">Invite</button>
                </div>
            </div>
            <div class="shareproject-access-settings-wrapper">
                 <button id="shareproject-access-settings-btn" data-target-dropdown="shareproject-access-dropdown" class="shareproject-access-settings-btn">
                    <i class="material-icons" id="shareproject-access-icon"></i>
                    <div><strong id="shareproject-access-title"></strong><p id="shareproject-access-desc"></p></div>
                    <i class="material-icons">arrow_drop_down</i>
                </button>
            </div>
            <p class="shareproject-section-title">Project Members</p>
            <div class="shareproject-members-list" id="shareproject-members-list"><div class="section-loader"></div></div>
            <div id="shareproject-pending-list-container"></div>
        </div>
        <div class="shareproject-modal-footer"><div id="shareproject-footer-left"></div><button class="shareproject-copy-link-btn"><i class="material-icons">link</i>Copy project link</button></div>
        
        <div id="shareproject-role-dropdown" class="shareproject-dropdown-content hidden"></div>
        <div id="shareproject-access-dropdown" class="shareproject-dropdown-content hidden"></div>
    </div>`;

    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'shareproject-modal-backdrop';
    modalBackdrop.className = 'shareproject-modal-backdrop';
    modalBackdrop.innerHTML = modalHTML;
    document.body.appendChild(modalBackdrop);
}