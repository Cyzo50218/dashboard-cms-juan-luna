
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, serverTimestamp, updateDoc, arrayUnion, arrayRemove, getDoc, deleteField, onSnapshot, writeBatch, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

const functions = getFunctions(app); 
    const sendEmailInvitationV2 = httpsCallable(functions, 'sendEmailInvitation');

let isModalOpen = false;
let modal = null;
let unsubscribeProjectListener = null;
let invitedEmails = [];

function closeModal() {
    if (unsubscribeProjectListener) {
        unsubscribeProjectListener();
        unsubscribeProjectListener = null;
    }
    isModalOpen = false;
    document.getElementById('shareproject-modal-backdrop')?.remove();
    document.getElementById('share-project-styles')?.remove();
}

function getSanitizedProjectEmails() {
    const projectData = JSON.parse(modal.dataset.projectData || '{}');
    const userProfilesMap = JSON.parse(modal.dataset.userProfilesMap || '{}');
    const existingMemberEmails = (projectData.members || []).map(m => userProfilesMap[m.uid]?.email?.toLowerCase());
    const pendingEmails = (projectData.pendingInvites || []).map(p => p.email?.toLowerCase());
    const currentInviteTags = invitedEmails.map(e => e.toLowerCase());
    return [...existingMemberEmails, ...pendingEmails, ...currentInviteTags].filter(Boolean);
}

export async function openShareModal(projectRef) {
    if (!projectRef) {
        alert("Error: Project not specified.");
        return;
    }
    if (isModalOpen) return;
    isModalOpen = true;
    
    createModalUI(); 
    modal = document.querySelector('.shareproject-modal');
    const modalBody = document.querySelector('.shareproject-modal-body');
    modal.classList.remove('hidden');
    
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated.");
        unsubscribeProjectListener = onSnapshot(projectRef, async (projectDocSnap) => {
            if (!projectDocSnap.exists()) {
                alert("This project has been deleted.");
                closeModal();
                return;
            }
            
            const projectData = { id: projectDocSnap.id, ...projectDocSnap.data() };
            const memberUIDs = (projectData.members || []).map(m => m.uid);
            const allUniqueUIDs = [...new Set([projectData.project_super_admin_uid, user.uid, ...memberUIDs])].filter(Boolean);
            
            const userProfilePromises = allUniqueUIDs.map(uid => getDoc(doc(db, "users", uid)));
            const userProfileDocs = await Promise.all(userProfilePromises);
            const userProfilesMap = userProfileDocs.reduce((acc, docSnap) => {
                if (docSnap.exists()) acc[docSnap.id] = docSnap.data();
                return acc;
            }, {});
            renderDynamicContent(modal, {
                projectData,
                userProfilesMap,
                currentUserId: user.uid
            });
        });
        
        renderStaticDropdownContent(modal);
        setupEventListeners(modal, projectRef);
        
    } catch (error) {
        console.error("Detailed error in openShareModal:", error);
        const userMessage = `Could not load sharing details. <br><small style="color:#666;">Reason: ${error.message}</small>`;
        if (modalBody) {
            modalBody.innerHTML = `<p style="color: #d93025; font-family: sans-serif; text-align: center; padding: 20px;">${userMessage}</p>`;
        }
    }
}

function addEmailTag(email) {
    const emailToAdd = email.trim();
    if (!emailToAdd) return;
    
    const allProjectEmails = getSanitizedProjectEmails();
    if (allProjectEmails.includes(emailToAdd.toLowerCase())) {
        alert(`"${emailToAdd}" is already a member or has a pending invitation.`);
        modal.querySelector('#shareproject-email-input').value = '';
        return;
    }
    
    if (!invitedEmails.map(e => e.toLowerCase()).includes(emailToAdd.toLowerCase())) {
        invitedEmails.push(emailToAdd);
        renderEmailTags();
    }
    modal.querySelector('#shareproject-email-input').value = '';
}

function setupEventListeners(modal, projectRef) {
    modal.querySelector('#shareproject-close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('shareproject-modal-backdrop').addEventListener('click', (e) => {
        if (e.target.id === 'shareproject-modal-backdrop') closeModal();
        if (!e.target.closest('[data-target-dropdown], .shareproject-dropdown-content, .shareproject-user-search-dropdown')) {
            document.querySelectorAll('.shareproject-dropdown-content, .shareproject-user-search-dropdown').forEach(el => el.classList.add('hidden'));
        }
    });
    
    modal.addEventListener('click', (e) => {
        const dropdownBtn = e.target.closest('[data-target-dropdown]');
        if (dropdownBtn) {
            e.stopPropagation();
            const dropdown = document.getElementById(dropdownBtn.dataset.targetDropdown);
            if (!dropdown) return;
            
            const contextId = dropdownBtn.closest('[data-uid]')?.dataset.uid || dropdownBtn.closest('[data-id]')?.dataset.id || dropdownBtn.id;
            dropdown.dataset.contextId = contextId;
            
            const isHidden = dropdown.classList.contains('hidden');
            document.querySelectorAll('.shareproject-dropdown-content').forEach(el => el.classList.add('hidden'));
            
            if (isHidden) {
                const modalRect = modal.getBoundingClientRect();
                const buttonRect = dropdownBtn.getBoundingClientRect();
                dropdown.style.top = `${buttonRect.bottom - modalRect.top + 5}px`;
                if (dropdown.id === 'shareproject-access-dropdown') {
                    dropdown.style.left = `${buttonRect.left - modalRect.left}px`;
                    dropdown.style.right = `${modalRect.right - buttonRect.right}px`;
                } else {
                    const dropdownWidth = dropdown.offsetWidth;
                    dropdown.style.left = `${(buttonRect.right - modalRect.left) - dropdownWidth}px`;
                }
                dropdown.classList.remove('hidden');
            }
        }
    });
    
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
        
        if (contextId === 'shareproject-access-settings-btn' && newAccess) {
            if (currentUserId !== superAdminUID) return alert("Only the project owner can change access settings.");
            await updateDoc(projectRef, { accessLevel: newAccess });
        }
        else if (contextId === 'shareproject-invite-role-btn' && newRole) {
            modal.querySelector('#shareproject-selected-role').textContent = newRole;
        }
        else if (contextId === 'workspace-item' && newRole) {
            if (currentUserId !== superAdminUID) return alert("Only the project owner can change the workspace role.");
            await updateDoc(projectRef, { workspaceRole: newRole });
        }
        else {
            const memberId = contextId;
            if (currentUserId !== superAdminUID)
                return alert("Only the project owner can modify member roles or remove them.");
            
            const memberData = (projectData.members || []).find(m => m.uid === memberId);
            if (!memberData) return;
            
            // ✅ Prevent super admin from demoting themselves without assigning another admin first
            if (memberId === currentUserId && currentUserId === superAdminUID && newRole && newRole !== 'Project admin') {
                const hasAnotherAdmin = (projectData.members || []).some(m =>
                    m.role === 'Project admin' && m.uid !== currentUserId
                );
                
                if (!hasAnotherAdmin) {
                    alert("⚠️ You must assign another Project admin before changing your own role.");
                    dropdown.classList.add('hidden');
                    return;
                }
            }
            
            if (isRemove) {
                await updateDoc(projectRef, { members: arrayRemove(memberData) });
                if (projectData.project_admin_user === memberId) {
                    await updateDoc(projectRef, { project_admin_user: deleteField() });
                }
            } else if (newRole) {
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
        
        dropdown.classList.add('hidden');
    });
    
    modal.addEventListener('click', async (e) => {
        const leaveBtn = e.target.closest('#shareproject-leave-btn');
        if (!leaveBtn) return;
        
        const projectData = JSON.parse(modal.dataset.projectData || '{}');
        const userProfilesMap = JSON.parse(modal.dataset.userProfilesMap || '{}');
        const superAdminUID = projectData.project_super_admin_uid;
        const currentUserId = auth.currentUser.uid;
        const secondaryAdminUID = projectData.project_admin_user;
        
        if (currentUserId === superAdminUID) {
            if (secondaryAdminUID) {
                const adminProfile = userProfilesMap[secondaryAdminUID];
                const adminName = adminProfile ? adminProfile.name : 'the current admin';
                if (confirm(`Are you sure you want to leave? Ownership will be transferred to ${adminName}. This action is irreversible.`)) {
                    const leavingAdminData = (projectData.members || []).find(m => m.uid === currentUserId);
                    const updates = {
                        project_super_admin_uid: secondaryAdminUID,
                        project_admin_user: deleteField(),
                        members: arrayRemove(leavingAdminData)
                    };
                    await updateDoc(projectRef, updates);
                    alert("You have left the project and ownership has been transferred.");
                    closeModal();
                }
            } else {
                if (confirm("WARNING: You are the only admin for this project. Leaving will permanently DELETE the project for all members. This action cannot be undone. Are you sure?")) {
                    await deleteDoc(projectRef);
                    alert("Project has been permanently deleted.");
                    closeModal();
                }
            }
        } else {
            if (confirm("Are you sure you want to leave this project? You will lose access permanently unless invited back.")) {
                const memberData = (projectData.members || []).find(m => m.uid === currentUserId);
                if (memberData) {
                    await updateDoc(projectRef, { members: arrayRemove(memberData) });
                    if (secondaryAdminUID === currentUserId) await updateDoc(projectRef, { project_admin_user: deleteField() });
                    alert("You have successfully left the project.");
                    closeModal();
                }
            }
        }
    });
    
    const emailInput = modal.querySelector('#shareproject-email-input');
    const inviteInputWrapper = emailInput.closest('.shareproject-invite-input-wrapper');
    let invitedEmails = [];
    
    emailInput.addEventListener('input', () => {
        console.log('[Input Event] Search query:', emailInput.value);
        
        let searchDropdown = inviteInputWrapper.querySelector('.shareproject-user-search-dropdown');
        if (!searchDropdown) {
            searchDropdown = document.createElement('div');
            searchDropdown.className = 'shareproject-user-search-dropdown';
            inviteInputWrapper.appendChild(searchDropdown);
        }
        
        searchDropdown.innerHTML = `
        <div class="search-loading-indicator">Loading...</div>
    `;
        searchDropdown.classList.remove('hidden');
        
        const query = emailInput.value.toLowerCase().trim();
        
        if (!query) {
            console.log('[Input Event] Query is empty — hiding dropdown');
            searchDropdown.classList.add('hidden');
            searchDropdown.innerHTML = '';
            return;
        }
        
        const allProjectEmails = getSanitizedProjectEmails();
        console.log('[Input Event] Already used/invited emails:', allProjectEmails);
        
        const userProfilesMapRaw = modal.dataset.userProfilesMap || '{}';
        let userProfilesMap;
        try {
            userProfilesMap = JSON.parse(userProfilesMapRaw);
            console.log('[Input Event] Loaded userProfilesMap:', userProfilesMap);
        } catch (err) {
            console.error('[Input Event] Failed to parse userProfilesMap:', err);
            searchDropdown.innerHTML = `<div class="search-error">Failed to load user list.</div>`;
            return;
        }
        
        const filteredUsers = Object.values(userProfilesMap).filter(user =>
            user.email &&
            !allProjectEmails.includes(user.email.toLowerCase()) &&
            (
                user.name.toLowerCase().includes(query) ||
                user.email.toLowerCase().includes(query)
            )
        );
        
        console.log('[Input Event] Filtered search results:', filteredUsers);
        
        if (filteredUsers.length > 0) {
            searchDropdown.innerHTML = ''; // Clear loading state
            filteredUsers.forEach(user => {
                const item = document.createElement('a');
                item.href = '#';
                item.className = 'dropdown-item';
                item.innerHTML = `<strong>${user.name}</strong><span style="color:#666; margin-left:8px;">${user.email}</span>`;
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    addEmailTag(user.email);
                    searchDropdown.classList.add('hidden');
                });
                searchDropdown.appendChild(item);
            });
        } else {
            searchDropdown.innerHTML = `<div class="no-results">No matching users found.</div>`;
        }
    });
    
    const renderEmailTags = () => {
        const container = modal.querySelector('#shareproject-email-tags');
        container.innerHTML = '';
        invitedEmails.forEach(email => {
            const tag = document.createElement('div');
            tag.className = 'shareproject-email-tag';
            tag.innerHTML = `<span>${email}</span><span class="shareproject-remove-tag" data-email="${email}">&times;</span>`;
            tag.querySelector('.shareproject-remove-tag').addEventListener('click', () => {
                invitedEmails = invitedEmails.filter(e => e !== email);
                renderEmailTags();
            });
            container.appendChild(tag);
        });
    };
    
    emailInput.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ',') && emailInput.value) {
            e.preventDefault();
            addEmailTag(emailInput.value);
        }
    });
    
    modal.querySelector('#shareproject-invite-btn').addEventListener('click', () => {
        handleInvite(modal, projectRef);
    });
    
    
}

function renderStaticDropdownContent(modal) {
    const roles = { invite: ['Project admin', 'Editor', 'Commenter', 'Viewer'] };
    const roleDropdown = modal.querySelector('#shareproject-role-dropdown');
    const accessDropdown = modal.querySelector('#shareproject-access-dropdown');
    if (roleDropdown) roleDropdown.innerHTML = roles.invite.map(role => `<button class="shareproject-dropdown-action" data-role="${role}">${role}</button>`).join('');
    if (accessDropdown) accessDropdown.innerHTML = `<a href="#" data-access="workspace" class="shareproject-dropdown-action"><strong><i class="material-icons">public</i> My Workspace</strong><p>Everyone can find and access.</p></a><a href="#" data-access="private" class="shareproject-dropdown-action"><strong><i class="material-icons">lock</i> Private to members</strong><p>Only invited members can access.</p></a>`;
}

function renderDynamicContent(modal, { projectData, workspaceMemberCount, userProfilesMap, currentUserId }) {
    modal.dataset.projectData = JSON.stringify(projectData);
    modal.dataset.userProfilesMap = JSON.stringify(userProfilesMap);
    
    const superAdminUID = projectData.project_super_admin_uid;
    let state = {
        members: JSON.parse(JSON.stringify(projectData.members || [])),
        pendingInvites: JSON.parse(JSON.stringify(projectData.pendingInvites || [])),
        accessLevel: projectData.accessLevel || 'private',
        workspaceRole: projectData.workspaceRole || 'Viewer',
    };
    const projectAdmins = state.members.filter(m => m.role === 'Project admin');
    
    let membersToRender = [...(projectData.members || [])];
    if (superAdminUID && !membersToRender.some(m => m.uid === superAdminUID)) {
        membersToRender.unshift({ uid: superAdminUID, role: 'Project admin' });
    }
    
    const roles = { member: ['Project admin', 'Editor', 'Commenter', 'Viewer'], workspace: ['Editor', 'Commenter', 'Viewer'] };
    const canChangeRoles = currentUserId === superAdminUID;
    
    const accessIcon = modal.querySelector('#shareproject-access-icon');
    const accessTitle = modal.querySelector('#shareproject-access-title');
    const accessDesc = modal.querySelector('#shareproject-access-desc');
    if (accessIcon && accessTitle && accessDesc) {
        if (state.accessLevel === 'workspace') {
            accessIcon.textContent = 'public';
            accessTitle.textContent = 'My Workspace';
            accessDesc.textContent = `Everyone can access as a ${state.workspaceRole}.`;
        } else {
            accessIcon.textContent = 'lock';
            accessTitle.textContent = 'Private to Members';
            accessDesc.textContent = 'Only explicitly invited members can access.';
        }
    }
    
    const createRoleDropdownButtonHTML = (id, currentRole, isLocked) => {
        const dropdownId = `role-dropdown-for-${id.replace(/[^a-zA-Z0-9]/g, '')}`;
        const disabledAttr = (isLocked || !canChangeRoles) ? 'disabled' : '';
        const dropdownIcon = (isLocked || !canChangeRoles) ? '' : '<i class="material-icons">arrow_drop_down</i>';
        return `<div class="shareproject-member-role" data-id="${id}"><button class="shareproject-dropdown-btn" data-target-dropdown="${dropdownId}" ${disabledAttr}><span>${currentRole}</span>${dropdownIcon}</button></div>`;
    };
    
    const createRoleDropdownMenuHTML = (id, availableRoles, isLocked, itemType) => {
        const dropdownId = `role-dropdown-for-${id.replace(/[^a-zA-Z0-9]/g, '')}`;
        const roleOptions = availableRoles.map(role => {
            let disabled = '';
            if (role === 'Project admin') {
                // Prevent assigning more than 2 admins
                const isSelf = id === currentUserId;
                const isAlreadyAdmin = state.members.find(m => m.uid === id)?.role === 'Project admin';
                const maxAdminsReached = projectAdmins.length >= 2 && !isAlreadyAdmin;
                if (maxAdminsReached) disabled = 'disabled title="Maximum of 2 Project admins allowed."';
                
                // Prevent super admin from changing their role unless another admin exists
                if (id === superAdminUID && !projectAdmins.some(m => m.uid !== superAdminUID)) {
                    return `<button class="shareproject-dropdown-action" disabled title="You must first transfer the Project admin role to another member."><strong>${role}</strong></button>`;
                }
            }
            return `<button class="shareproject-dropdown-action" data-role="${role}" ${disabled}><strong>${role}</strong></button>`;
        }).join('');
        
        const removeLink = (itemType === 'member' && !isLocked && canChangeRoles) ?
            `<a href="#" class="shareproject-remove shareproject-dropdown-action"><i class="material-icons">person_remove</i> Remove member</a>` :
            '';
        
        return `<div id="${dropdownId}" class="shareproject-dropdown-content hidden">${roleOptions}${removeLink}</div>`;
    };
    
    let membersHTML = '';
    let memberDropdownsHTML = '';
    
    if (state.accessLevel === 'workspace') {
        const workspaceId = 'workspace-item';
        const workspaceIconHTML = `<div class="shareproject-profile-pic" style="background-color:#e5e7eb;color:#4b5563;"><i class="material-icons">people</i></div>`;
        membersHTML += `<div class="shareproject-member-item" data-id="${workspaceId}">${workspaceIconHTML}<div class="shareproject-member-info"><strong>My Workspace</strong><p>${workspaceMemberCount} members</p></div>${createRoleDropdownButtonHTML(workspaceId, state.workspaceRole, false)}</div>`;
        memberDropdownsHTML += createRoleDropdownMenuHTML(workspaceId, roles.workspace, false, 'workspace');
    }
    
    state.members.forEach(member => {
        const userProfile = userProfilesMap[member.uid] || { name: 'Unknown User' };
        let isLocked = false;
        
        if (member.uid === superAdminUID) {
            const otherAdmins = state.members.filter(m => m.role === 'Project admin' && m.uid !== superAdminUID);
            // Lock super admin if there are no other admins to take over
            isLocked = otherAdmins.length === 0;
        }
        
        const displayRole = isLocked ? 'Project admin' : member.role;
        const profilePicHTML = createProfilePic(userProfile).outerHTML;
        
        membersHTML += `<div class="shareproject-member-item" data-uid="${member.uid}">${profilePicHTML}<div class="shareproject-member-info"><strong>${userProfile.name} ${isLocked ? '(Owner)' : ''}</strong><p>${userProfile.email || 'No email provided'}</p></div>${createRoleDropdownButtonHTML(member.uid, displayRole, isLocked)}</div>`;
        memberDropdownsHTML += createRoleDropdownMenuHTML(member.uid, roles.member, isLocked, 'member');
    });
    
    let pendingHTML = '';
    if (state.pendingInvites.length > 0) {
        pendingHTML += '<p class="shareproject-section-title">Pending Invitations</p>';
        state.pendingInvites.forEach(invite => pendingHTML += `<div class="shareproject-pending-item"><div class="shareproject-pending-icon"><i class="material-icons">hourglass_top</i></div><div class="shareproject-member-info"><strong>${invite.email}</strong><p>Invitation sent. Role: ${invite.role}</p></div></div>`);
    }
    
    modal.querySelector('.shareproject-modal-header h2').textContent = `Share ${projectData.title || 'Unnamed Project'}`;
    modal.querySelector('#shareproject-members-list').innerHTML = membersHTML;
    modal.querySelector('#shareproject-member-dropdowns-container').innerHTML = memberDropdownsHTML;
    modal.querySelector('#shareproject-pending-list-container').innerHTML = pendingHTML;
}

async function handleInvite(modal, projectRef) {
    const inviter = auth.currentUser;
    
    if (!inviter) {
        alert("Error: You must be logged in to send invitations.");
        return;
    }

    const emailInput = modal.querySelector('#shareproject-email-input');
    invitedEmails = (modal.invitedEmails || []);
    
    if (emailInput.value.trim()) {
        addEmailTag(emailInput.value.trim());
    }
    
    if (invitedEmails.length === 0) {
        alert("Please enter at least one email address to invite.");
        return;
    }
    
    const role = modal.querySelector('#shareproject-selected-role').textContent.trim();
    const projectData = JSON.parse(modal.dataset.projectData || '{}');
    const userProfilesMap = JSON.parse(modal.dataset.userProfilesMap || '{}');
    
    // --- Prepare a Firestore Batch and Tracking Arrays ---
    const batch = writeBatch(db);
    const newPendingInvites = [];
    let successfulEmailSends = 0;
    let membersAdded = 0;
    const failedEmails = [];
    
    // --- Loop Through Emails and Process Invitations ---
    for (const email of invitedEmails) {
        const lowerEmail = email.toLowerCase();
        const existingUserUID = Object.keys(userProfilesMap).find(uid => userProfilesMap[uid]?.email?.toLowerCase() === lowerEmail);
        
        if (existingUserUID) {
            // --- EXISTING workspace members ---
            const existingMember = projectData.members.find(m => m.uid === existingUserUID);
            if (!existingMember) {
                batch.update(projectRef, { members: arrayUnion({ uid: existingUserUID, role: role }) });
                membersAdded++;
            }
            
        } else {
            // --- New User Email Invitation ---
            try {

                const newInvitationRef = doc(collection(db, "InvitedProjects"));
                const invitationId = newInvitationRef.id;
                const invitationUrl = `https://your-site-name.vercel.app/invitation/${invitationId}`; // Replace with your actual domain
                
                console.log(`Sending invitation to new user: ${lowerEmail}`);
                console.log("Sending invite with values:", {
  email: lowerEmail,
  projectName: projectData.name,
  invitationUrl
});

                await sendEmailInvitationV2({
                    email: lowerEmail,
                    projectName: "SHIPPING - USA WAREHOUSE",
                    invitationUrl: invitationUrl
                });
                
                batch.set(newInvitationRef, {
                    projectId: projectRef.id,
                    projectName: projectData.name,
                    invitedEmail: lowerEmail,
                    role: role,
                    invitedAt: serverTimestamp(),
                    status: 'pending',
                    invitedBy: {
                        uid: inviter.uid,
                        name: inviter.displayName,
                        email: inviter.email
                    }
                });
                
                newPendingInvites.push({
                    email: lowerEmail,
                    role: role,
                    invitedAt: serverTimestamp(),
                    invitationId: invitationId
                });
                
                successfulEmailSends++;
                
            } catch (error) {
                console.error(`Failed to send email to ${lowerEmail}:`, error);
                failedEmails.push(lowerEmail);
            }
        }
    }
    if (newPendingInvites.length > 0) {
        batch.update(projectRef, { pendingInvites: arrayUnion(...newPendingInvites) });
    }
    
    try {
        await batch.commit();
        console.log("Batch commit successful. Members and invitations updated.");
        
        let feedbackMessage = "";
        if (membersAdded > 0) feedbackMessage += `${membersAdded} member(s) added to the project.\n`;
        if (successfulEmailSends > 0) feedbackMessage += `${successfulEmailSends} invitation(s) sent successfully!\n`;
        if (failedEmails.length > 0) feedbackMessage += `Failed to send invitations to: ${failedEmails.join(', ')}.`;
        
        if (feedbackMessage) {
            alert(feedbackMessage.trim());
        }
        
        modal.invitedEmails = [];
        renderEmailTags();
        if (typeof closeModal === 'function') closeModal(modal);
        
    } catch (error) {
        console.error("Error committing invites to database:", error);
        alert("A database error occurred while saving the invitations. Please try again.");
    }
}

function renderEmailTags() {
    if (!modal) return;
    const container = modal.querySelector('#shareproject-email-tags');
    container.innerHTML = '';
    invitedEmails.forEach(email => {
        const tag = document.createElement('div');
        tag.className = 'shareproject-email-tag';
        tag.innerHTML = `<span>${email}</span><span class="shareproject-remove-tag" data-email="${email}">&times;</span>`;
        tag.querySelector('.shareproject-remove-tag').addEventListener('click', () => {
            invitedEmails = invitedEmails.filter(e => e !== email);
            renderEmailTags();
        });
        container.appendChild(tag);
    });
    modal.invitedEmails = invitedEmails;
}


function createProfilePic(profile) {
    const profileColors = ['#4A148C', '#004D40', '#BF360C', '#0D47A1', '#4E342E', '#AD1457', '#006064'];
    const pic = document.createElement('div');
    pic.className = 'shareproject-profile-pic';
    if (profile && profile.avatar) pic.style.backgroundImage = `url(${profile.avatar})`;
    else {
        const name = (profile && profile.name) ? profile.name : 'U';
        pic.textContent = name.split(' ').map(n => n[0]).join('').substring(0, 2);
        const hash = name.split("").reduce((a, b) => (a = ((a << 5) - a) + b.charCodeAt(0), a & a), 0);
        pic.style.backgroundColor = profileColors[Math.abs(hash) % profileColors.length];
    }
    return pic;
};

function createModalUI() {
    const styles = `
    .hidden { display: none; } .shareproject-scrollable-section { max-height: 300px; overflow-y: auto; padding-right: 4px; margin-bottom: 16px; } .shareproject-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; animation: fadeIn 0.3s ease; } .shareproject-modal { background-color: white; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); width: 750px; display: flex; flex-direction: column; font-family: 'Inter', sans-serif; animation: slideIn 0.3s ease-out; max-height: 90vh; margin: auto; position: relative; } .shareproject-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #f0f0f0; } .shareproject-modal-header h2 { margin: 0; font-size: 18px; font-weight: 600; color: #111; } .shareproject-icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 50%; display: inline-flex; align-items: center; color: #555; } .shareproject-icon-btn:hover { background-color: #f4f4f4; } .shareproject-modal-body { padding: 16px 24px; overflow-y: auto; min-height:200px; } .shareproject-modal-body > p.shareproject-section-title { font-size: 14px; font-weight: 500; color: #333; margin: 16px 0 8px 0; } .shareproject-invite-input-wrapper { position: relative; display: flex; align-items: center; border: 1px solid #e0e0e0; border-radius: 8px; padding: 4px; margin-bottom: 16px; transition: all 0.2s ease; } .shareproject-invite-input-wrapper:focus-within { border-color: #1267FA; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); } .shareproject-email-tags-container { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-left: 8px; } .shareproject-email-tag { display: flex; align-items: center; background-color: #eef2ff; color: #4338ca; padding: 4px 10px; border-radius: 6px; font-size: 14px; font-weight: 500; } .shareproject-email-tag .shareproject-remove-tag { cursor: pointer; margin-left: 8px; font-size: 16px; } #shareproject-email-input { flex-grow: 1; border: none; outline: none; padding: 8px; font-size: 14px; background: transparent; min-width: 150px; } .shareproject-invite-controls { display: flex; align-items: center; gap: 8px; padding-right: 4px;} .shareproject-role-selector, .shareproject-member-role { position: relative; } .shareproject-dropdown-btn { background-color: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; font-size: 14px; white-space: nowrap; } .shareproject-dropdown-btn:hover { background-color: #f9f9f9; } .shareproject-dropdown-btn:disabled { background-color: #f9fafb; cursor: not-allowed; color: #555;} .shareproject-dropdown-content { position: absolute; background-color: white; border: 1px solid #f0f0f0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); z-index: 1010; width: auto; min-width: 220px; overflow: hidden; animation: fadeIn 0.2s ease; } .shareproject-dropdown-action { display: block; width: 100%; padding: 12px 16px; text-decoration: none; color: #333; background: none; border: none; cursor: pointer; text-align: left; font-family: 'Inter', sans-serif; font-size: 14px; } .shareproject-dropdown-action:hover, .shareproject-dropdown-content a.shareproject-remove:hover { background-color: #f4f4f4; } .shareproject-dropdown-content a { display: block; padding: 12px 16px; text-decoration: none; color: #333; } .shareproject-dropdown-content strong { font-weight: 500; display: flex; align-items: center; gap: 8px; } .shareproject-dropdown-content p { font-size: 13px; color: #666; margin: 4px 0 0 0; line-height: 1.4; } .shareproject-invite-btn { background-color: #3F7EEB; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: background-color 0.2s ease; } .shareproject-invite-btn:hover { background-color: #1267FA; } .shareproject-access-settings-btn { display: flex; align-items: flex-start; width: 100%; text-align: left; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px; cursor: pointer; background: none; } .shareproject-access-settings-btn:hover { background-color: #f9f9f9; } .shareproject-access-settings-btn .material-icons { margin-right: 12px; color: #555; line-height: 1.4; } .shareproject-access-settings-btn div { flex-grow: 1; } .shareproject-members-list { margin-top: 16px; } .shareproject-member-item, .shareproject-pending-item { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; } .shareproject-member-item:last-child, .shareproject-pending-item:last-child { border-bottom: none; } .shareproject-profile-pic { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 500; font-size: 14px; margin-right: 12px; text-transform: uppercase; background-size: cover; background-position: center; } .shareproject-pending-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; background-color: #f3f4f6; color: #6b7280; } .shareproject-member-info { flex-grow: 1; } .shareproject-member-info strong { font-size: 14px; font-weight: 500; color: #111; } .shareproject-member-info p { font-size: 13px; color: #666; margin: 2px 0 0 0; } .shareproject-member-role .shareproject-dropdown-btn { background: none; border: none; padding: 4px 8px; color: #555; } .shareproject-member-role .shareproject-dropdown-content a.shareproject-remove { color: #ef4444; } .shareproject-modal-footer { padding: 16px 24px; border-top: 1px solid #f0f0f0; background-color: #f9fafb; display: flex; justify-content: space-between; align-items: center; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; } .shareproject-copy-link-btn { background: none; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; font-size: 14px; font-weight: 500; } #shareproject-leave-btn { color: #ef4444; font-weight: 500; font-size: 14px; } #shareproject-leave-btn .material-icons { color: #ef4444; margin-right: 4px; } .section-loader { margin: 40px auto; border: 4px solid #f3f3f3; border-radius: 50%; border-top: 4px solid #3498db; width: 40px; height: 40px; animation: spin 2s linear infinite; } .shareproject-user-search-dropdown { position: absolute; background-color: white; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); z-index: 1011; max-height: 200px; overflow-y: auto; width: 100%; top: 100%; left: 0; right: 0;} .shareproject-user-search-dropdown a { display: flex; align-items: center; padding: 8px 16px; text-decoration: none; color: #333; } .shareproject-user-search-dropdown a:hover { background-color: #f4f4f4; }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.id = "share-project-styles";
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    
    const modalHTML = `
    <div class="shareproject-modal">
        <div class="shareproject-modal-header"><h2>Share Project</h2><button id="shareproject-close-modal-btn" class="shareproject-icon-btn"><i class="material-icons">close</i></button></div>
        <div class="shareproject-modal-body">
            <div class="shareproject-invite-input-wrapper"><div id="shareproject-email-tags" class="shareproject-email-tags-container"></div><input type="text" id="shareproject-email-input" placeholder="Add workspace members or new people by email..."><div class="shareproject-invite-controls"><div class="shareproject-role-selector"><button id="shareproject-invite-role-btn" data-target-dropdown="shareproject-role-dropdown" class="shareproject-dropdown-btn"><span id="shareproject-selected-role">Editor</span><i class="material-icons">arrow_drop_down</i></button></div><button id="shareproject-invite-btn" class="shareproject-invite-btn">Invite</button></div></div>
            <div class="shareproject-access-settings-wrapper"><button id="shareproject-access-settings-btn" data-target-dropdown="shareproject-access-dropdown" class="shareproject-access-settings-btn"><i class="material-icons" id="shareproject-access-icon"></i><div><strong id="shareproject-access-title"></strong><p id="shareproject-access-desc"></p></div><i class="material-icons">arrow_drop_down</i></button></div>
           <div class="shareproject-scrollable-section">
           <br>
  <p class="shareproject-section-title">Project Members</p>
  <div class="shareproject-members-list" id="shareproject-members-list"><div class="section-loader"></div></div>
  <div id="shareproject-pending-list-container"></div>
</div>
        </div>
        <div class="shareproject-modal-footer">
            <div id="shareproject-footer-left"><button id="shareproject-leave-btn" class="shareproject-icon-btn"><i class="material-icons">logout</i>Leave Project</button></div>
            <button class="shareproject-copy-link-btn"><i class="material-icons">link</i>Copy project link</button>
        </div>
        <div id="shareproject-role-dropdown" class="shareproject-dropdown-content hidden"></div>
        <div id="shareproject-access-dropdown" class="shareproject-dropdown-content hidden"></div>
        <div id="shareproject-member-dropdowns-container"></div>
    </div>`;
    
    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'shareproject-modal-backdrop';
    modalBackdrop.className = 'shareproject-modal-backdrop';
    modalBackdrop.innerHTML = modalHTML;
    document.body.appendChild(modalBackdrop);
}