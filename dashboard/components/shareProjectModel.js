import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
  deleteField,
  onSnapshot,
  writeBatch,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

const functions = getFunctions(app);
const sendEmailInvitation = httpsCallable(functions, "sendEmailInvitation");

let isModalOpen = false;
let modal = null;
let unsubscribeProjectListener = null;
let invitedEmails = [];

function closeModal() {
  // ✅ ADDED: Ensure the global array is always reset when the modal closes.
  invitedEmails = [];
  
  const emailTagsContainer = document.querySelector(".shareproject-email-tags-container");
  if (emailTagsContainer) {
    emailTagsContainer.innerHTML = "";
  }
  
  const emailInput = document.querySelector("#shareproject-email-input");
  if (emailInput) {
    emailInput.value = "";
  }
  
  if (unsubscribeProjectListener) {
    unsubscribeProjectListener();
    unsubscribeProjectListener = null;
  }
  isModalOpen = false;
  document.getElementById("shareproject-modal-backdrop")?.remove();
  document.getElementById("share-project-styles")?.remove();
}

function getSanitizedProjectEmails() {
  const projectData = JSON.parse(modal.dataset.projectData || "{}");
  const userProfilesMap = JSON.parse(modal.dataset.userProfilesMap || "{}");
  const existingMemberEmails = (projectData.members || []).map((m) =>
    userProfilesMap[m.uid]?.email?.toLowerCase()
  );
  const pendingEmails = (projectData.pendingInvites || []).map((p) =>
    p.email?.toLowerCase()
  );
  const currentInviteTags = invitedEmails.map((e) => e.toLowerCase());
  return [
    ...existingMemberEmails,
    ...pendingEmails,
    ...currentInviteTags,
  ].filter(Boolean);
}

export async function openShareModal(projectRef) {
  invitedEmails = [];
  if (!projectRef) {
    alert("Error: Project not specified.");
    return;
  }
  if (isModalOpen) return;
  isModalOpen = true;
  
  createModalUI();
  modal = document.querySelector(".shareproject-modal");
  const modalBody = document.querySelector(".shareproject-modal-body");
  modal.classList.remove("hidden");
  
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");
    
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) {
      throw new Error("Current user document not found.");
    }
    
    const userData = userDocSnap.data();
    const selectedWorkspaceId = userData.selectedWorkspace;
    
    if (!selectedWorkspaceId) {
      console.warn("User has no 'selectedWorkspace' field.");
    }
    
    let workspaceMemberUIDs = [];
    if (selectedWorkspaceId) {
      const workspaceRef = doc(db, `users/${user.uid}/myworkspace/${selectedWorkspaceId}`);
      const workspaceSnap = await getDoc(workspaceRef);
      if (workspaceSnap.exists()) {
        workspaceMemberUIDs = workspaceSnap.data().members || [];
      }
    }
    
    // ✅ ADDED: A flag to track if we've set up the listeners yet.
    let listenersAttached = false;
    
    unsubscribeProjectListener = onSnapshot(
      projectRef,
      async (projectDocSnap) => {
        if (!projectDocSnap.exists()) {
          alert("This project has been deleted.");
          closeModal();
          return;
        }
        
        const projectData = { id: projectDocSnap.id, ...projectDocSnap.data() };
        const memberUIDs = (projectData.members || []).map((m) => m.uid);
        
        const allUniqueUIDs = [
          ...new Set([
            projectData.project_super_admin_uid,
            user.uid,
            ...memberUIDs,
            ...workspaceMemberUIDs
          ]),
        ].filter(Boolean);
        
        const userProfilePromises = allUniqueUIDs.map((uid) =>
          getDoc(doc(db, "users", uid))
        );
        const userProfileDocs = await Promise.all(userProfilePromises);
        const userProfilesMap = userProfileDocs.reduce((acc, docSnap) => {
          if (docSnap.exists()) acc[docSnap.id] = docSnap.data();
          return acc;
        }, {});
        
        // The first time data arrives, the DOM is built by this function.
        renderDynamicContent(modal, {
          projectData,
          userProfilesMap,
          currentUserId: user.uid,
          workspaceMemberCount: workspaceMemberUIDs.length,
        });
        
        // ✅ THE FIX: Set up event listeners only ONCE, after the first render.
        if (!listenersAttached) {
          console.log("[DEBUG] First render complete. Attaching event listeners now.");
          renderStaticDropdownContent(modal); // Also move static rendering here
          setupEventListeners(modal, projectRef);
          listenersAttached = true; // Set the flag so this doesn't run again.
        }
      }
    );
    
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
  
  if (
    !invitedEmails
    .map((e) => e.toLowerCase())
    .includes(emailToAdd.toLowerCase())
  ) {
    invitedEmails.push(emailToAdd);
    renderEmailTags();
  }
  modal.querySelector("#shareproject-email-input").value = "";
}

/**
 * Handles all dropdown actions like changing a role or removing a member.
 * This version uses a robust method for updating the members array.
 * @param {HTMLElement} actionBtn The dropdown button element that was clicked.
 * @param {DocumentReference} projectRef A Firestore reference to the current project.
 */
async function handleRoleChangeAction(actionBtn, projectRef) {
  const dropdown = actionBtn.closest(".shareproject-dropdown-content");
  if (!dropdown) return;
  
  // Hide the dropdown immediately for a better UI feel
  dropdown.classList.add("hidden");
  
  // --- Data Setup ---
  const contextId = dropdown.dataset.contextId;
  const projectData = JSON.parse(modal.dataset.projectData || "{}");
  const newRole = actionBtn.dataset.role;
  const isRemove = actionBtn.matches(".shareproject-remove");
  const currentUserId = auth.currentUser.uid;
  const superAdminUID = projectData.project_super_admin_uid;
  
  // --- Permission Check ---
  if (currentUserId !== superAdminUID) {
    return alert("Only the project owner can modify member roles.");
  }
  
  const memberId = contextId;
  const batch = writeBatch(db);
  
  // --- SCENARIO 1: Removing a member ---
  if (isRemove) {
    if (memberId === superAdminUID) {
      return alert("The project owner cannot be removed. You must transfer ownership first.");
    }
    
    const memberData = (projectData.members || []).find(m => m.uid === memberId);
    if (memberData) {
      batch.update(projectRef, {
        members: arrayRemove(memberData),
        project_admin_user: arrayRemove(memberId) // Also remove from admins if they were one
      });
    }
  }
  // --- SCENARIO 2: Changing a role ---
  else if (newRole) {
    // Find the original state of the members array
    const originalMembers = projectData.members || [];
    
    // Create the new, updated members array using .map()
    const updatedMembers = originalMembers.map(member => {
      // Find the member we want to change and return their new state
      if (member.uid === memberId) {
        return { ...member, role: newRole };
      }
      // Return all other members unchanged
      return member;
    });
    
    // Add the update for the entire 'members' array to the batch
    batch.update(projectRef, { members: updatedMembers });
    
    // Additionally, update the 'project_admin_user' array if necessary
    if (newRole === "Project Admin") {
      batch.update(projectRef, { project_admin_user: arrayUnion(memberId) });
    } else {
      // If their new role is NOT admin, ensure they are removed from the admin list
      batch.update(projectRef, { project_admin_user: arrayRemove(memberId) });
    }
  }
  
  // --- Commit the Batch ---
  try {
    await batch.commit();
    console.log("✅ Update successful. The onSnapshot listener should now refresh the UI.");
    // There is no need to call render() manually. 
    // The onSnapshot listener will detect the change and do it for you.
  } catch (error) {
    console.error("❌ Update failed:", error);
    alert("An error occurred while saving changes. Please check the console.");
  }
}

function toggleDropdown(dropdownBtn, modal) {
  const dropdownId = dropdownBtn.dataset.targetDropdown;
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  
  const contextId = dropdownBtn.closest("[data-uid]")?.dataset.uid || dropdownBtn.closest("[data-id]")?.dataset.id || dropdownBtn.id;
  dropdown.dataset.contextId = contextId;
  
  const isHidden = dropdown.classList.contains("hidden");
  // Hide all other dropdowns first
  document.querySelectorAll(".shareproject-dropdown-content").forEach((el) => el.classList.add("hidden"));
  
  if (isHidden) {
    // --- POSITIONING LOGIC ---
    const modalRect = modal.getBoundingClientRect();
    const buttonRect = dropdownBtn.getBoundingClientRect();
    
    // Set the dropdown's top position to be just below the button.
    dropdown.style.top = `${buttonRect.bottom - modalRect.top + 5}px`; // Added 5px for a small gap.
    
    // ✅ CHANGED: Align the dropdown's left edge with the button's left edge.
    dropdown.style.left = `${buttonRect.left - modalRect.left}px`;
    
    dropdown.classList.remove("hidden");
  }
}

/**
 * Sets up all event listeners for the share modal.
 * This function uses a single, unified click handler on the modal but
 * differentiates between various action types for predictable behavior.
 * @param {HTMLElement} modal The modal element.
 * @param {DocumentReference} projectRef A Firestore reference to the current project.
 */
function setupEventListeners(modal, projectRef) {
  // --- 1. Master Click Listener (Event Delegation) ---
  modal.addEventListener('click', async (e) => {
    const target = e.target;
    e.preventDefault(); // Prevent default link/button behavior for all handled actions.
    
    // A. Handle clicks on role/remove buttons for EXISTING MEMBERS
    const memberActionBtn = target.closest('#shareproject-member-dropdowns-container .shareproject-dropdown-action');
    if (memberActionBtn) {
      console.log("[DEBUG] Member action button clicked:", memberActionBtn.dataset);
      await handleRoleChangeAction(memberActionBtn, projectRef);
      return;
    }
    
    // B. Handle changing the role for a NEW INVITE
    const inviteRoleBtn = target.closest('#shareproject-role-dropdown .shareproject-dropdown-action');
    if (inviteRoleBtn) {
      const newRole = inviteRoleBtn.dataset.role;
      if (newRole) {
        // Just update the UI text, no database action needed here.
        document.getElementById('shareproject-selected-role').textContent = newRole;
      }
      // Hide the dropdown
      inviteRoleBtn.closest('.shareproject-dropdown-content').classList.add('hidden');
      return;
    }
    
    // C. Handle changing the project's GENERAL ACCESS LEVEL
    const accessActionBtn = target.closest('#shareproject-access-dropdown .shareproject-dropdown-action');
    if (accessActionBtn) {
      const newAccess = accessActionBtn.dataset.access;
      if (newAccess) {
        try {
          // Update Firestore. The onSnapshot listener will automatically re-render the UI.
          await updateDoc(projectRef, { accessLevel: newAccess });
          console.log(`Project access level changed to: ${newAccess}`);
        } catch (error) {
          console.error("Failed to update access level:", error);
          alert("Error: Could not save the new access setting.");
        }
      }
      // Hide the dropdown
      accessActionBtn.closest('.shareproject-dropdown-content').classList.add('hidden');
      return;
    }
    
    // D. Handle clicks that open dropdown menus (no change here)
    const dropdownToggleBtn = target.closest('[data-target-dropdown]');
    if (dropdownToggleBtn) {
      e.stopPropagation(); // Keep this to prevent the backdrop click from firing
      console.log("[DEBUG] Dropdown toggle clicked.");
      toggleDropdown(dropdownToggleBtn, modal);
      return;
    }
    
    // E. Handle the "Leave Project" button
    const leaveBtn = target.closest('#shareproject-leave-btn');
    if (leaveBtn) {
      console.log("[DEBUG] Leave Project button clicked.");
      
      // ✅ CORRECTED LINES:
      const projectData = JSON.parse(modal.dataset.projectData || '{}');
      const userProfilesMap = JSON.parse(modal.dataset.userProfilesMap || '{}');
      
      const superAdminUID = projectData.project_super_admin_uid;
      const currentUserId = auth.currentUser.uid;
      // NOTE: project_admin_user in your original code seems to be a single UID, not an array.
      // This logic assumes it's a single secondary admin UID.
      const secondaryAdminUID = projectData.project_admin_user;
      
      if (currentUserId === superAdminUID) {
        // Case 1: The Project Owner is leaving
        const otherAdmins = (projectData.members || [])
          .filter(m => m.role === 'Project Admin' && m.uid !== currentUserId)
          .map(m => m.uid);
        
        if (otherAdmins.length > 0) {
          // If other admins exist, transfer ownership to the first one
          const newOwnerUID = otherAdmins[0];
          const adminProfile = userProfilesMap[newOwnerUID];
          const adminName = adminProfile ? adminProfile.name : 'the next admin';
          
          if (confirm(`Are you sure you want to leave? Ownership will be transferred to ${adminName}. This action is irreversible.`)) {
            const leavingAdminData = (projectData.members || []).find(m => m.uid === currentUserId);
            const updates = {
              project_super_admin_uid: newOwnerUID,
              members: arrayRemove(leavingAdminData)
            };
            // Also remove the leaving user from the admin array if it exists
            if (projectData.project_admin_user) {
              updates.project_admin_user = arrayRemove(currentUserId);
            }
            await updateDoc(projectRef, updates);
            alert("You have left the project and ownership has been transferred.");
            closeModal();
          }
        } else {
          // If the owner is the ONLY member with admin rights, they must delete the project
          if (confirm("WARNING: You are the only admin for this project. Leaving will permanently DELETE the project for all members. This action cannot be undone. Are you sure?")) {
            await deleteDoc(projectRef);
            alert("Project has been permanently deleted.");
            closeModal();
          }
        }
      } else {
        // Case 2: A regular member or non-owner admin is leaving
        if (confirm("Are you sure you want to leave this project? You will lose access permanently unless invited back.")) {
          const memberData = (projectData.members || []).find(m => m.uid === currentUserId);
          if (memberData) {
            const updates = { members: arrayRemove(memberData) };
            // If the leaving user was also in the separate admin field, remove them
            if (projectData.project_admin_user && projectData.project_admin_user.includes(currentUserId)) {
              updates.project_admin_user = arrayRemove(currentUserId);
            }
            await updateDoc(projectRef, updates);
            alert("You have successfully left the project.");
            closeModal();
          }
        }
      }
      return;
    }
    
    // F. Handle the main "Invite" button (no change here)
    const inviteBtn = target.closest('#shareproject-invite-btn');
    if (inviteBtn) {
      console.log("[DEBUG] Invite button clicked.");
      await handleInvite(modal, projectRef);
      return;
    }
  });
  
  
  // Listener for the main close button
  modal.querySelector("#shareproject-close-modal-btn").addEventListener("click", closeModal);
  
  // Listener for the modal backdrop
  document.getElementById("shareproject-modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "shareproject-modal-backdrop") {
      closeModal();
      return;
    }
    // This part closes dropdowns if you click anywhere outside their content area
    if (!e.target.closest("[data-target-dropdown], .shareproject-dropdown-content")) {
      document.querySelectorAll(".shareproject-dropdown-content").forEach((el) => el.classList.add("hidden"));
    }
  });
  
  // Listeners for the email input field
  const emailInput = modal.querySelector("#shareproject-email-input");
  emailInput.addEventListener("input", () => handleEmailSearch(modal)); // Assumes handleEmailSearch exists
  emailInput.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === ",") && emailInput.value) {
      e.preventDefault();
      addEmailTag(emailInput.value);
    }
  });
}

function renderStaticDropdownContent(modal) {
  const roles = { invite: ["Project Admin", "Editor", "Commenter", "Viewer"] };
  const roleDropdown = modal.querySelector("#shareproject-role-dropdown");
  const accessDropdown = modal.querySelector("#shareproject-access-dropdown");
  if (roleDropdown)
    roleDropdown.innerHTML = roles.invite
    .map(
      (role) =>
      `<button class="shareproject-dropdown-action" data-role="${role}">${role}</button>`
    )
    .join("");
  if (accessDropdown)
    accessDropdown.innerHTML = `<a href="#" data-access="workspace" class="shareproject-dropdown-action"><strong><i class="material-icons">public</i> My Workspace</strong><p>Everyone can find and access.</p></a><a href="#" data-access="private" class="shareproject-dropdown-action"><strong><i class="material-icons">lock</i> Private to members</strong><p>Only invited members can access.</p></a>`;
}

function renderDynamicContent(
  modal, { projectData, userProfilesMap, currentUserId, workspaceMemberCount = 0 }
) {
  // Ensure data is stored in modal dataset
  modal.dataset.projectData = JSON.stringify(projectData);
  modal.dataset.userProfilesMap = JSON.stringify(userProfilesMap);
  
  const superAdminUID = projectData.project_super_admin_uid;
  let state = {
    members: JSON.parse(JSON.stringify(projectData.members || [])),
    pendingInvites: JSON.parse(
      JSON.stringify(projectData.pendingInvites || [])
    ),
    accessLevel: projectData.accessLevel || "private",
    workspaceRole: projectData.workspaceRole || "Viewer",
  };
  const projectAdmins = state.members.filter((m) => m.role === "Project Admin");
  
  let membersToRender = [...(projectData.members || [])];
  if (superAdminUID && !membersToRender.some((m) => m.uid === superAdminUID)) {
    membersToRender.unshift({ uid: superAdminUID, role: "Project Admin" });
  }
  
  const roles = {
    member: ["Project Admin", "Editor", "Commenter", "Viewer"],
    workspace: ["Editor", "Commenter", "Viewer"],
  };
  const canChangeRoles = currentUserId === superAdminUID;
  
  const accessIcon = modal.querySelector("#shareproject-access-icon");
  const accessTitle = modal.querySelector("#shareproject-access-title");
  const accessDesc = modal.querySelector("#shareproject-access-desc");
  if (accessIcon && accessTitle && accessDesc) {
    if (state.accessLevel === "workspace") {
      accessIcon.textContent = "public";
      accessTitle.textContent = "My Workspace";
      accessDesc.textContent = `Everyone can access as a ${state.workspaceRole}.`;
    } else {
      accessIcon.textContent = "lock";
      accessTitle.textContent = "Private to Members";
      accessDesc.textContent = "Only explicitly invited members can access.";
    }
  }
  
  const createRoleDropdownButtonHTML = (id, currentRole, isLocked) => {
    const dropdownId = `role-dropdown-for-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
    const disabledAttr = isLocked || !canChangeRoles ? "disabled" : "";
    const dropdownIcon =
      isLocked || !canChangeRoles ?
      "" :
      '<i class="material-icons">arrow_drop_down</i>';
    return `<div class="shareproject-member-role" data-id="${id}"><button class="shareproject-dropdown-btn" data-target-dropdown="${dropdownId}" ${disabledAttr}><span>${currentRole}</span>${dropdownIcon}</button></div>`;
  };
  
  const createRoleDropdownMenuHTML = (
    id,
    availableRoles,
    isLocked,
    itemType
  ) => {
    const dropdownId = `role-dropdown-for-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
    const roleOptions = availableRoles
      .map((role) => {
        let disabled = "";
        if (role === "Project Admin") {
          // Prevent assigning more than 2 admins
          const isSelf = id === currentUserId;
          const isAlreadyAdmin =
            state.members.find((m) => m.uid === id)?.role === "Project Admin";
          const maxAdminsReached = projectAdmins.length >= 2 && !isAlreadyAdmin;
          if (maxAdminsReached)
            disabled = 'disabled title="Maximum of 2 Project Admins allowed."';
          
          // Prevent super admin from changing their role unless another admin exists
          if (
            id === superAdminUID &&
            !projectAdmins.some((m) => m.uid !== superAdminUID)
          ) {
            return `<button class="shareproject-dropdown-action" disabled title="You must first transfer the Project Admin role to another member."><strong>${role}</strong></button>`;
          }
        }
        return `<button class="shareproject-dropdown-action" data-role="${role}" ${disabled}><strong>${role}</strong></button>`;
      })
      .join("");
    
    const removeLink =
      itemType === "member" && !isLocked && canChangeRoles ?
      `<a href="#" class="shareproject-remove shareproject-dropdown-action"><i class="material-icons">person_remove</i> Remove member</a>` :
      "";
    
    return `<div id="${dropdownId}" class="shareproject-dropdown-content hidden">${roleOptions}${removeLink}</div>`;
  };
  
  let membersHTML = "";
  let memberDropdownsHTML = "";
  
  if (state.accessLevel === "workspace") {
    const workspaceId = "workspace-item";
    const workspaceIconHTML = `<div class="shareproject-profile-pic" style="background-color:#e5e7eb;color:#4b5563;"><i class="material-icons">people</i></div>`;
    membersHTML += `<div class="shareproject-member-item" data-id="${workspaceId}">${workspaceIconHTML}<div class="shareproject-member-info"><strong>My Workspace</strong><p>${workspaceMemberCount} members</p></div>${createRoleDropdownButtonHTML(
      workspaceId,
      state.workspaceRole,
      false
    )}</div>`;
    memberDropdownsHTML += createRoleDropdownMenuHTML(
      workspaceId,
      roles.workspace,
      false,
      "workspace"
    );
  }
  
  state.members.forEach((member) => {
    const userProfile = userProfilesMap[member.uid] || { name: "Unknown User" };
    let isLocked = false;
    
    if (member.uid === superAdminUID) {
      const otherAdmins = state.members.filter(
        (m) => m.role === "Project Admin" && m.uid !== superAdminUID
      );
      // Lock super admin if there are no other admins to take over
      isLocked = otherAdmins.length === 0;
    }
    
    const displayRole = isLocked ? "Project Admin" : member.role;
    const profilePicHTML = createProfilePic(userProfile).outerHTML;
    
    membersHTML += `<div class="shareproject-member-item" data-uid="${
      member.uid
    }">${profilePicHTML}<div class="shareproject-member-info"><strong>${
      userProfile.name
    } ${isLocked ? "(Owner)" : ""}</strong><p>${
      userProfile.email || "No email provided"
    }</p></div>${createRoleDropdownButtonHTML(
      member.uid,
      displayRole,
      isLocked
    )}</div>`;
    memberDropdownsHTML += createRoleDropdownMenuHTML(
      member.uid,
      roles.member,
      isLocked,
      "member"
    );
  });
  
  let pendingHTML = "";
  if (state.pendingInvites.length > 0) {
    pendingHTML +=
      '<p class="shareproject-section-title">Pending Invitations</p>';
    state.pendingInvites.forEach(
      (invite) =>
      (pendingHTML += `<div class="shareproject-pending-item"><div class="shareproject-pending-icon"><i class="material-icons">hourglass_top</i></div><div class="shareproject-member-info"><strong>${invite.email}</strong><p>Invitation sent. Role: ${invite.role}</p></div></div>`)
    );
  }
  
  modal.querySelector(".shareproject-modal-header h2").textContent = `Share ${
    projectData.title || "Unnamed Project"
  }`;
  modal.querySelector("#shareproject-members-list").innerHTML = membersHTML;
  modal.querySelector("#shareproject-member-dropdowns-container").innerHTML =
    memberDropdownsHTML;
  modal.querySelector("#shareproject-pending-list-container").innerHTML =
    pendingHTML;
}

async function handleInvite(modal, projectRef) {
  const inviter = auth.currentUser;
  
  if (!inviter) {
    alert("Error: You must be logged in to send invitations.");
    return;
  }
  
  // --- Process input and disable button ---
  const emailInput = modal.querySelector("#shareproject-email-input");
  const lastEmail = emailInput.value.trim();
  if (lastEmail && !invitedEmails.map(e => e.toLowerCase()).includes(lastEmail.toLowerCase())) {
    invitedEmails.push(lastEmail);
  }
  
  if (invitedEmails.length === 0) {
    alert("Please enter at least one email address.");
    return;
  }
  
  const inviteBtn = modal.querySelector("#shareproject-invite-btn");
  inviteBtn.disabled = true;
  const originalBtnText = inviteBtn.textContent;
  inviteBtn.textContent = "Processing...";
  
  let projectData;
  try {
    const projectSnap = await getDoc(projectRef);
    if (projectSnap.exists()) {
      projectData = projectSnap.data();
    } else {
      alert("Error: This project no longer exists.");
      closeModal();
      return;
    }
  } catch (e) {
    console.error("Failed to fetch latest project data:", e);
    alert("Error connecting to the database. Please try again.");
    inviteBtn.disabled = false;
    inviteBtn.textContent = originalBtnText;
    return;
  }
  
  const userProfilesMap = JSON.parse(modal.dataset.userProfilesMap || "{}");
  const role = modal.querySelector("#shareproject-selected-role").textContent.trim();
  const batch = writeBatch(db);
  const newPendingInvitesForArrayUnion = [];
  let successfulEmailSends = 0;
  let membersAddedOrUpdated = 0;
  const failedEmails = [];
  
  // This loop now operates on the fresh 'projectData' fetched above
  for (const email of invitedEmails) {
    const lowerEmail = email.toLowerCase();
    const existingUserUID = Object.keys(userProfilesMap).find(
      (uid) => userProfilesMap[uid]?.email?.toLowerCase() === lowerEmail
    );
    
    if (existingUserUID) {
      console.log(`[LOG] Processing user with email: ${lowerEmail} and UID: ${existingUserUID}`);
      
      // Find out if the user is already a member of this specific project.
      const memberInProject = (projectData.members || []).find(m => m.uid === existingUserUID);
      
      if (memberInProject) {
        console.log('[LOG] User is an existing member of the project.', memberInProject);
      } else {
        console.log('[LOG] User is NOT a member of this project. Will treat as a new invitation.');
      }
      
      // --- SCENARIO 1: The user is already a member of the project, and their role is changing. ---
      if (memberInProject && memberInProject.role !== role) {
        console.log(`[LOG] Role change detected for member. From: "${memberInProject.role}" -> To: "${role}"`);
        
        // Log critical data for the owner check
        console.log(`[LOG] Is this user the super admin? UID match: ${existingUserUID === projectData.project_super_admin_uid}`);
        console.log(`   - User's UID: ${existingUserUID}`);
        console.log(`   - Super Admin UID from DB: ${projectData.project_super_admin_uid}`);
        console.log(`[LOG] Is the new role NOT 'Project Admin'? Role check: ${role !== "Project Admin"}`);
        
        // CHECK 1.1: The project owner is demoting themselves. This is the highest priority check.
        if (existingUserUID === projectData.project_super_admin_uid && role !== "Project Admin") {
          console.log('[LOG] ENTERING DANGER ZONE: Super admin is attempting to change their own role.');
          
          const otherAdmins = (projectData.project_admin_user || []).filter(
            (uid) => uid !== projectData.project_super_admin_uid
          );
          console.log('[LOG] Found other admins to transfer ownership to:', otherAdmins);
          
          if (otherAdmins.length === 0) {
            console.error('[LOG] OWNER DEMOTION BLOCKED: No other admins found.');
            alert(
              "You cannot remove your ownership because you are the only Project Admin. Please assign the 'Project Admin' role to another member before changing your own role."
            );
            inviteBtn.disabled = false;
            inviteBtn.textContent = originalBtnText;
            return; // Abort the entire function.
          }
          
          console.log('[LOG] Prompting user for confirmation...');
          const confirmation = window.confirm(
            "You are about to remove your ownership of this project and transfer it to another admin. Are you sure?"
          );
          
          if (!confirmation) {
            console.warn('[LOG] User cancelled the ownership transfer.');
            alert("Ownership transfer cancelled.");
            inviteBtn.disabled = false;
            inviteBtn.textContent = originalBtnText;
            return; // Abort the entire function.
          }
          
          console.log('[LOG] User CONFIRMED. Proceeding with ownership transfer.');
          const newSuperAdminUID = otherAdmins[0];
          console.log(`[LOG] New super admin will be: ${newSuperAdminUID}`);
          batch.update(projectRef, { project_super_admin_uid: newSuperAdminUID });
          batch.update(projectRef, { project_admin_user: arrayRemove(existingUserUID) });
          
        }
        // CHECK 1.2: A user is being promoted to Project Admin.
        else if (role === "Project Admin") {
          console.log('[LOG] Attempting to make user a "Project Admin".');
          const currentAdmins = (projectData.project_admin_user || []);
          console.log('[LOG] Current admins:', currentAdmins, `Count: ${currentAdmins.length}`);
          if (currentAdmins.length >= 2 && !currentAdmins.includes(existingUserUID)) {
            console.error('[LOG] ADMIN LIMIT BLOCKED: Cannot add another admin.');
            alert(`A project can only have up to 2 Project Admins. Cannot add ${email}.`);
            failedEmails.push(email);
            continue; // Skip this email and go to the next in the loop.
          }
          console.log('[LOG] Admin check passed. Adding user to project_admin_user array.');
          batch.update(projectRef, { project_admin_user: arrayUnion(existingUserUID) });
        }
        // CHECK 1.3: A non-owner admin is being changed to a non-admin role.
        else if (memberInProject.role === "Project Admin") {
          console.log('[LOG] Removing non-owner admin from project_admin_user array.');
          batch.update(projectRef, { project_admin_user: arrayRemove(existingUserUID) });
        }
        
        // ACTION: This part runs for any successful role change after all checks have passed.
        console.log('[LOG] Queuing update to the "members" array.');
        const updatedMemberData = { ...memberInProject, role: role };
        batch.update(projectRef, { members: arrayRemove(memberInProject) });
        batch.update(projectRef, { members: arrayUnion(updatedMemberData) });
        membersAddedOrUpdated++;
        
      } else if (memberInProject && memberInProject.role === role) {
        console.log(`[LOG] No action needed. User is already a member with the role "${role}".`);
      }
      // --- SCENARIO 2: The user is NOT a member of the project yet. Handle as a new invitation. ---
      else if (!memberInProject) {
        console.log('[LOG] ENTERING INVITATION LOGIC for non-project member.');
        try {
          const invitesRef = collection(db, "InvitedProjects");
          const q = query(invitesRef,
            where("projectId", "==", projectRef.id),
            where("invitedEmail", "==", lowerEmail)
          );
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            console.log('[LOG] Found existing pending invitation. Will update it.');
            const existingInviteDoc = querySnapshot.docs[0];
            const existingInviteData = existingInviteDoc.data();
            
            if (existingInviteData.role !== role) {
              console.log(`[LOG] Invitation role changing from "${existingInviteData.role}" to "${role}".`);
              const inviteDocRef = doc(db, "InvitedProjects", existingInviteDoc.id);
              batch.update(inviteDocRef, { role: role });
              
              const oldPendingInviteObject = (projectData.pendingInvites || []).find(p => p.email.toLowerCase() === lowerEmail);
              if (oldPendingInviteObject) {
                const newPendingInviteObject = { ...oldPendingInviteObject, role: role };
                batch.update(projectRef, { pendingInvites: arrayRemove(oldPendingInviteObject) });
                batch.update(projectRef, { pendingInvites: arrayUnion(newPendingInviteObject) });
              }
              membersAddedOrUpdated++;
            } else {
              console.log('[LOG] Invitation role is the same. No update needed.');
            }
          }
          else {
            console.log('[LOG] No pending invitation found. Creating a new one.');
            const newInvitationRef = doc(collection(db, "InvitedProjects"));
            const invitationId = newInvitationRef.id;
            const invitationUrl = `https://cms.juanlunacollections.com/invitation/${invitationId}`;
            
            await sendEmailInvitation({
              email: lowerEmail,
              projectName: projectData.title || "Unnamed Project",
              invitationUrl: invitationUrl,
            });
            console.log('[LOG] Email invitation sent.');
            
            batch.set(newInvitationRef, {
              invitationId: invitationId,
              projectId: projectRef.id,
              projectName: projectData.title || "Unnamed Project",
              invitedEmail: lowerEmail,
              role: role,
              invitedAt: serverTimestamp(),
              status: "pending",
              invitedBy: { uid: inviter.uid, name: inviter.displayName, email: inviter.email },
            });
            
            const newPendingInviteData = {
              email: lowerEmail,
              role: role,
              invitedAt: new Date().toISOString(),
              invitationId: invitationId,
            };
            batch.update(projectRef, {
              pendingInvites: arrayUnion(newPendingInviteData),
            });
            console.log('[LOG] Queued new invitation document and update to project pendingInvites.');
            successfulEmailSends++;
          }
        } catch (error) {
          console.error(`[FATAL] Failed to process invitation for ${lowerEmail}:`, error);
          failedEmails.push(lowerEmail);
        }
      }
    } else {
      // Case 3 & 4: User is not in the workspace. Check pending invites.
      const existingPendingInvite = (projectData.pendingInvites || []).find(
        p => p.email.toLowerCase() === lowerEmail
      );
      
      if (existingPendingInvite) {
        // Case 3: A pending invitation for this email already exists. UPDATE it.
        if (existingPendingInvite.role !== role) {
          const updatedPendingData = { ...existingPendingInvite, role: role };
          batch.update(projectRef, { pendingInvites: arrayRemove(existingPendingInvite) });
          batch.update(projectRef, { pendingInvites: arrayUnion(updatedPendingData) });
          
          if (existingPendingInvite.invitationId) {
            const invitationDocRef = doc(db, "InvitedProjects", existingPendingInvite.invitationId);
            batch.update(invitationDocRef, { role: role });
          }
          membersAddedOrUpdated++;
        }
      } else {
        // Case 4: This is a truly new invitation. CREATE it.
        try {
          const newInvitationRef = doc(collection(db, "InvitedProjects"));
          const invitationId = newInvitationRef.id;
          const invitationUrl = `https://cms.juanlunacollections.com/invitation/${invitationId}`;
          
          await sendEmailInvitation({
            email: lowerEmail,
            projectName: projectData.title || "Unnamed Project",
            invitationUrl: invitationUrl,
          });
          
          batch.set(newInvitationRef, {
            invitationId: invitationId,
            projectId: projectRef.id,
            projectName: projectData.title || "Unnamed Project",
            invitedEmail: lowerEmail,
            role: role,
            invitedAt: serverTimestamp(),
            status: "pending",
            invitedBy: { uid: inviter.uid, name: inviter.displayName, email: inviter.email },
          });
          
          newPendingInvitesForArrayUnion.push({
            email: lowerEmail,
            role: role,
            invitedAt: new Date().toISOString(),
            invitationId: invitationId,
          });
          
          successfulEmailSends++;
        } catch (error) {
          console.error(`Failed to send email to ${lowerEmail}:`, error);
          failedEmails.push(lowerEmail);
        }
      }
    }
  }
  
  if (newPendingInvitesForArrayUnion.length > 0) {
    batch.update(projectRef, {
      pendingInvites: arrayUnion(...newPendingInvitesForArrayUnion),
    });
  }
  
  try {
    await batch.commit();
    let feedbackMessage = "";
    if (membersAddedOrUpdated > 0)
      feedbackMessage += `${membersAddedOrUpdated} member(s) were added or had their roles updated.\n`;
    if (successfulEmailSends > 0)
      feedbackMessage += `${successfulEmailSends} invitation(s) sent successfully!\n`;
    if (failedEmails.length > 0)
      feedbackMessage += `Failed to send invitations to: ${failedEmails.join(", ")}.`;
    
    if (feedbackMessage) {
      alert(feedbackMessage.trim());
    }
    
    // ✅ Clear the list of emails that were just processed.
    invitedEmails = [];
    
    // ✅ Re-render the email tags, which will now be an empty list, clearing the UI.
    renderEmailTags();
    
    // ✅ REMOVED: The closeModal() call is gone, so the modal stays open.
    // closeModal();
    
  } catch (error) {
    console.error("Error committing invites to database:", error);
    alert("A database error occurred while saving the invitations. Please try again.");
  } finally {
    inviteBtn.disabled = false;
    inviteBtn.textContent = originalBtnText;
  }
}

function renderEmailTags() {
  if (!modal) return;
  const container = modal.querySelector("#shareproject-email-tags");
  container.innerHTML = "";
  invitedEmails.forEach((email) => {
    const tag = document.createElement("div");
    tag.className = "shareproject-email-tag";
    tag.innerHTML = `<span>${email}</span><span class="shareproject-remove-tag" data-email="${email}">&times;</span>`;
    tag
      .querySelector(".shareproject-remove-tag")
      .addEventListener("click", () => {
        invitedEmails = invitedEmails.filter((e) => e !== email);
        renderEmailTags();
      });
    container.appendChild(tag);
  });
}

function createProfilePic(profile) {
  const profileColors = [
    "#4A148C",
    "#004D40",
    "#BF360C",
    "#0D47A1",
    "#4E342E",
    "#AD1457",
    "#006064",
  ];
  const pic = document.createElement("div");
  pic.className = "shareproject-profile-pic";
  if (profile && profile.avatar)
    pic.style.backgroundImage = `url(${profile.avatar})`;
  else {
    const name = profile && profile.name ? profile.name : "U";
    pic.textContent = name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2);
    const hash = name
      .split("")
      .reduce((a, b) => ((a = (a << 5) - a + b.charCodeAt(0)), a & a), 0);
    pic.style.backgroundColor =
      profileColors[Math.abs(hash) % profileColors.length];
  }
  return pic;
}

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
  
  const modalBackdrop = document.createElement("div");
  modalBackdrop.id = "shareproject-modal-backdrop";
  modalBackdrop.className = "shareproject-modal-backdrop";
  modalBackdrop.innerHTML = modalHTML;
  document.body.appendChild(modalBackdrop);
}