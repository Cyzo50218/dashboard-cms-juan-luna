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
  collectionGroup,
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
let listenersAttached = false;
let modal = null;
let unsubscribeProjectListener = null;
let allCollaboratorUIDs = [];
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
    listenersAttached = false;
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
  if (!projectRef) return alert("Error: Project not specified.");
  if (isModalOpen) return;
  isModalOpen = true;

  createModalUI();
  modal = document.querySelector(".shareproject-modal");
  modal.classList.remove("hidden");

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    // --- Step 1: Fetch all workspace collaborators ONCE ---
    // ✅ Using your requested 'myworkspace' collectionGroup query for better performance.
    const allWorkspacesQuery = query(
      collectionGroup(db, 'myworkspace'),
      where('members', 'array-contains', user.uid)
    );
    const workspacesSnap = await getDocs(allWorkspacesQuery);
    let allWorkspaceCollaboratorUIDs = [];
    workspacesSnap.forEach(doc => {
      allWorkspaceCollaboratorUIDs.push(...(doc.data().members || []));
    });

    // --- Step 2: Fetch all necessary user profiles ONCE ---
    const initialProjectSnap = await getDoc(projectRef);
    const initialProjectData = initialProjectSnap.data() || {};
    const initialMemberUIDs = (initialProjectData.members || []).map(m => m.uid);

    const allUniqueUIDs = [...new Set([
      initialProjectData.project_super_admin_uid,
      user.uid,
      ...initialMemberUIDs,
      ...allWorkspaceCollaboratorUIDs // Using the new collaborator list
    ])].filter(Boolean);

    const userProfilePromises = allUniqueUIDs.map(uid => getDoc(doc(db, "users", uid)));
    const userProfileDocs = await Promise.all(userProfilePromises);
    const userProfilesMap = userProfileDocs.reduce((acc, docSnap) => {
      if (docSnap.exists()) acc[docSnap.id] = docSnap.data();
      return acc;
    }, {});

    modal.dataset.userProfilesMap = JSON.stringify(userProfilesMap);

    // --- Step 3: Set up the lightweight real-time listener ---
    unsubscribeProjectListener = onSnapshot(projectRef, (projectDocSnap) => {
      if (!projectDocSnap.exists()) {
        alert("This project has been deleted.");
        return closeModal();
      }

      const projectData = { id: projectDocSnap.id, ...projectDocSnap.data() };

      renderDynamicContent(modal, {
        projectData,
        userProfilesMap,
        currentUserId: user.uid,
        workspaceMemberCount: allWorkspaceCollaboratorUIDs.length
      });

      if (!listenersAttached) {
        renderStaticDropdownContent(modal);
        setupEventListeners(modal, projectRef);
        listenersAttached = true;
      }
    });

  } catch (error) {
    console.error("openShareModal error:", error);
    modal.querySelector(".shareproject-modal-body").innerHTML = `<p style="color:red;">Could not load details.</p>`;
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

  dropdown.classList.add("hidden");

  const contextId = dropdown.dataset.contextId;
  const projectData = JSON.parse(modal.dataset.projectData || "{}");
  const newRole = actionBtn.dataset.role;
  const isRemove = actionBtn.matches(".shareproject-remove");
  const currentUserId = auth.currentUser.uid;
  const superAdminUID = projectData.project_super_admin_uid;

  const userProfile = (JSON.parse(modal.dataset.userProfilesMap || "{}"))[currentUserId];
  const userRole = userProfile?.role; // Fetching role from user's profile

  // ✅ FIX: Added check for Developer (0) or Admin (3) roles
  const isDeveloperOrAdmin = userRole === 0 || userRole === 3;
  const isOwner = currentUserId === superAdminUID;

  if (!isOwner && !isDeveloperOrAdmin) {
    return alert("Only the project owner, an admin, or a developer can modify member roles.");
  }

  if (contextId === superAdminUID && !isOwner && !isDeveloperOrAdmin) {
    return alert("You cannot modify the owner's role.");
  }

  const memberId = contextId;
  const batch = writeBatch(db);

  if (isRemove) {
    if (memberId === superAdminUID) {
      return alert("The project owner cannot be removed. You must transfer ownership first.");
    }
    const memberData = (projectData.members || []).find(m => m.uid === memberId);
    if (memberData) {
      batch.update(projectRef, {
        members: arrayRemove(memberData),
        project_admin_user: arrayRemove(memberId)
      });
    }
  } else if (newRole) {
    if (newRole === "Project Admin") {
      const currentAdmins = (projectData.project_admin_user || []);
      const isAlreadyAdmin = currentAdmins.includes(memberId);
      if (currentAdmins.length >= 2 && !isAlreadyAdmin) {
        alert("A project can only have up to 2 Project Admins. You cannot add another.");
        return;
      }
    }

    const originalMembers = projectData.members || [];
    const updatedMembers = originalMembers.map(member => {
      if (member.uid === memberId) {
        return { ...member, role: newRole };
      }
      return member;
    });

    batch.update(projectRef, { members: updatedMembers });

    if (newRole === "Project Admin") {
      batch.update(projectRef, { project_admin_user: arrayUnion(memberId) });
    } else {
      batch.update(projectRef, { project_admin_user: arrayRemove(memberId) });
    }
  }

  try {
    await batch.commit();
    console.log("✅ Update successful. The onSnapshot listener should now refresh the UI.");
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
  modal.addEventListener('click', async (e) => {
    const target = e.target;
    // 1. Check for the MOST specific case first: the WORKSPACE role change.
    const workspaceActionBtn = target.closest('#role-dropdown-for-workspaceitem .shareproject-dropdown-action');
    if (workspaceActionBtn) {
      e.preventDefault();
      const newRole = workspaceActionBtn.dataset.role;
      if (newRole) {
        // Permission check: Only Owner or Project Admins can change this.
        const projectData = JSON.parse(modal.dataset.projectData || '{}');
        const currentUserId = auth.currentUser.uid;
        const currentUserMemberInfo = (projectData.members || []).find(m => m.uid === currentUserId);
        const isOwner = currentUserId === projectData.project_super_admin_uid;
        const isProjectAdmin = currentUserMemberInfo?.role === 'Project Admin';

        if (!isOwner && !isProjectAdmin) {
          alert("You do not have permission to change the workspace's default role.");
        } else {
          // Update the project document in Firestore.
          try {
            await updateDoc(projectRef, { workspaceRole: newRole });
            console.log(`✅ Firestore updated: workspaceRole set to ${newRole}`);
          } catch (error) {
            console.error("Failed to update workspace role:", error);
            alert("Error saving workspace role. Please try again.");
          }
        }
      }
      workspaceActionBtn.closest('.shareproject-dropdown-content').classList.add('hidden');
      return; // IMPORTANT: Stop further execution.
    }

    // 2. THEN, check for the general MEMBER role change.
    const memberActionBtn = target.closest('#shareproject-member-dropdowns-container .shareproject-dropdown-action');
    if (memberActionBtn) {
      e.preventDefault();
      // This block will now only run for actual members, not the workspace item.
      await handleRoleChangeAction(memberActionBtn, projectRef);
      return;
    }

    // --- (Rest of the event handlers) ---
    const inviteRoleBtn = target.closest('#shareproject-role-dropdown .shareproject-dropdown-action');
    if (inviteRoleBtn) {
      e.preventDefault();
      const newRole = inviteRoleBtn.dataset.role;
      if (newRole) {
        document.getElementById('shareproject-selected-role').textContent = newRole;
      }
      inviteRoleBtn.closest('.shareproject-dropdown-content').classList.add('hidden');
      return;
    }

    const accessActionBtn = target.closest('#shareproject-access-dropdown .shareproject-dropdown-action');
    if (accessActionBtn) {
      e.preventDefault();
      const newAccess = accessActionBtn.dataset.access;
      if (newAccess) {
        const currentUserId = auth.currentUser.uid;
        const projectData = JSON.parse(modal.dataset.projectData || '{}');
        const currentUserMemberInfo = (projectData.members || []).find(m => m.uid === currentUserId);
        const isProjectAdmin = currentUserMemberInfo?.role === 'Project Admin';

        const isOwner = currentUserId === projectData.project_super_admin_uid;
        const isDeveloperOrAdmin = userProfile?.role === 0 || userProfile?.role === 3;

        if (!isOwner && !isDeveloperOrAdmin && !isProjectAdmin) {
          alert("You do not have permission to change the project's access level.");
          accessActionBtn.closest('.shareproject-dropdown-content').classList.add('hidden');
          return;
        }

        const selectedWorkspaceId = modal.dataset.selectedWorkspaceId;
        if (!selectedWorkspaceId) {
          return alert("Error: Workspace context is missing. Cannot change visibility.");
        }

        const batch = writeBatch(db);
        batch.update(projectRef, { accessLevel: newAccess });
        const workspaceMemberDocRef = doc(db, `workspaces/${selectedWorkspaceId}/members/${currentUserId}`);
        batch.update(workspaceMemberDocRef, { selectedProjectWorkspaceVisibility: newAccess });

        try {
          await batch.commit();
        } catch (error) {
          console.error("Failed to commit visibility changes:", error);
          alert("Error: Could not save the new access setting. Please check the console.");
        }
      }
      accessActionBtn.closest('.shareproject-dropdown-content').classList.add('hidden');
      return;
    }

    const dropdownToggleBtn = target.closest('[data-target-dropdown]');
    if (dropdownToggleBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleDropdown(dropdownToggleBtn, modal);
      return;
    }

    const leaveBtn = target.closest('#shareproject-leave-btn');
    if (leaveBtn) {
      e.preventDefault();
      const projectData = JSON.parse(modal.dataset.projectData || '{}');
      const userProfilesMap = JSON.parse(modal.dataset.userProfilesMap || '{}');
      const superAdminUID = projectData.project_super_admin_uid;
      const currentUserId = auth.currentUser.uid;

      if (currentUserId === superAdminUID) {
        const otherAdmins = (projectData.members || [])
          .filter(m => m.role === 'Project Admin' && m.uid !== currentUserId)
          .map(m => m.uid);

        if (otherAdmins.length > 0) {
          const newOwnerUID = otherAdmins[0];
          const adminProfile = userProfilesMap[newOwnerUID];
          const adminName = adminProfile ? adminProfile.name : 'the next admin';

          if (confirm(`Are you sure you want to leave? Ownership will be transferred to ${adminName}. This action is irreversible.`)) {
            const leavingAdminData = (projectData.members || []).find(m => m.uid === currentUserId);
            const updates = {
              project_super_admin_uid: newOwnerUID,
              members: arrayRemove(leavingAdminData)
            };
            if (projectData.project_admin_user) {
              updates.project_admin_user = arrayRemove(currentUserId);
            }
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
            const updates = { members: arrayRemove(memberData) };
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

    const inviteBtn = target.closest('#shareproject-invite-btn');
    if (inviteBtn) {
      e.preventDefault();
      await handleInvite(modal, projectRef);
      return;
    }
  });

  modal.querySelector("#shareproject-close-modal-btn").addEventListener("click", closeModal);

  document.getElementById("shareproject-modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "shareproject-modal-backdrop") {
      closeModal();
      return;
    }
    if (!e.target.closest("[data-target-dropdown], .shareproject-dropdown-content, #shareproject-user-search-dropdown")) {
      document.querySelectorAll(".shareproject-dropdown-content").forEach((el) => el.classList.add("hidden"));
      // Also hide the search dropdown
      modal.querySelector("#shareproject-user-search-dropdown")?.classList.add("hidden");
    }

  });

  const emailInput = modal.querySelector("#shareproject-email-input");
  emailInput.addEventListener("input", () => handleEmailSearch(modal));
  emailInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && emailInput.value) {
      e.preventDefault();

      const projectData = JSON.parse(modal.dataset.projectData || "{}");
      const userProfilesMap = JSON.parse(modal.dataset.userProfilesMap || "{}");
      const currentUserProfile = userProfilesMap[auth.currentUser.uid];
      const currentUserMemberInfo = (projectData.members || []).find(m => m.uid === auth.currentUser.uid);

      const isOwner = auth.currentUser.uid === projectData.project_super_admin_uid;
      const isProjectAdmin = currentUserMemberInfo?.role === 'Project Admin';
      const isGlobalAdminOrDev = currentUserProfile?.role === 0 || currentUserProfile?.role === 3;

      if (isOwner || isProjectAdmin || isGlobalAdminOrDev) {
        let fullInput = emailInput.value.trim();
        let emailToProcess = fullInput;
        let explicitRole = null;

        // ✅ Use flexible regex to find role command
        const roleMatch = fullInput.match(/@(\w+)$/);
        if (roleMatch) {
          const command = roleMatch[1].toLowerCase();
          const validRoles = { editor: "Editor", viewer: "Viewer", commenter: "Commenter", admin: "Project Admin" };
          if (validRoles[command]) {
            explicitRole = validRoles[command];
            // Cleanly remove the command, including the @ and any preceding space
            emailToProcess = fullInput.substring(0, roleMatch.index).trim();
          }
        }

        if (!/^\S+@\S+\.\S+$/.test(emailToProcess)) {
          return addEmailTag(fullInput); // If not a valid email, just add as tag
        }

        const targetUser = Object.values(userProfilesMap).find(p => p.email === emailToProcess);
        const memberInfo = targetUser ? (projectData.members || []).find(m => m.uid === targetUser.id) : null;

        // ✅ If the user is ALREADY a member, perform a direct role change
        if (targetUser && (memberInfo || targetUser.id === projectData.project_super_admin_uid)) {
          const roleToSet = explicitRole || document.getElementById('shareproject-selected-role').textContent;
          await directRoleUpdate(targetUser.id, roleToSet, projectRef);
        } else {
          // Otherwise, proceed with the instant invite for a NEW user
          console.log(`Privileged user: Instantly inviting ${emailToProcess}`);
          invitedEmails = [emailToProcess];
          if (explicitRole) document.getElementById('shareproject-selected-role').textContent = explicitRole;
          await handleInvite(modal, projectRef);
          invitedEmails = [];
        }

        emailInput.value = '';
        modal.querySelector("#shareproject-user-search-dropdown").classList.add("hidden");
        return;
      }

      // Fallback for regular users
      addEmailTag(emailInput.value);
      modal.querySelector("#shareproject-user-search-dropdown").classList.add("hidden");
    }
  });
}

async function directRoleUpdate(memberId, newRole, projectRef) {
  console.log(`Performing direct role update for ${memberId} to ${newRole}`);
  const batch = writeBatch(db);
  const projectSnap = await getDoc(projectRef);
  if (!projectSnap.exists()) return alert("Project not found.");

  const projectData = projectSnap.data();
  const originalMembers = projectData.members || [];
  let memberFound = false;

  const updatedMembers = originalMembers.map(member => {
    if (member.uid === memberId) {
      memberFound = true;
      return { ...member, role: newRole };
    }
    return member;
  });

  if (!memberFound) {
    return alert("Could not update role: Member not found in project.");
  }

  batch.update(projectRef, { members: updatedMembers });

  if (newRole === "Project Admin") {
    batch.update(projectRef, { project_admin_user: arrayUnion(memberId) });
  } else {
    batch.update(projectRef, { project_admin_user: arrayRemove(memberId) });
  }

  try {
    await batch.commit();
    console.log("✅ Role updated successfully.");
  } catch (error) {
    console.error("❌ Direct role update failed:", error);
    alert("An error occurred while updating the role.");
  }
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
  modal, {
    projectData,
    userProfilesMap,
    currentUserId,
    workspaceMemberCount = 0,
    selectedWorkspaceId
  }
) {
  // Ensure data is stored in modal dataset
  modal.dataset.projectData = JSON.stringify(projectData);
  modal.dataset.userProfilesMap = JSON.stringify(userProfilesMap);

  if (selectedWorkspaceId) {
    modal.dataset.selectedWorkspaceId = selectedWorkspaceId;
  }
  const superAdminUID = projectData.project_super_admin_uid;
  const currentUserMemberInfo = (projectData.members || []).find(m => m.uid === currentUserId);
  const isOwner = currentUserId === superAdminUID;
  const userProfile = userProfilesMap[currentUserId];
  const userRole = userProfile?.role;

  // --- Permission Checks ---
  const isGlobalAdminOrDev = userRole === 0 || userRole === 3;
  const isProjectAdmin = currentUserMemberInfo?.role === 'Project Admin';
  const canManageMembers = isOwner || isProjectAdmin;

  const canChangeAccessLevel = isOwner || isProjectAdmin; // Keeping this separate in case rules differ later
  const canChangeRoles = isOwner || isProjectAdmin;

  const inviteWrapper = modal.querySelector(".shareproject-invite-input-wrapper");
  if (inviteWrapper) {
    inviteWrapper.classList.toggle('hidden', !canManageMembers);
  }

  let state = {
    members: JSON.parse(JSON.stringify(projectData.members || [])),
    pendingInvites: JSON.parse(
      JSON.stringify(projectData.pendingInvites || [])
    ),
    accessLevel: projectData.accessLevel || "private",
    workspaceRole: projectData.workspaceRole || "Viewer",
  };
  const projectAdmins = state.members.filter((m) => m.role === "Project Admin" || m.role === "Project Owner Admin");

  let membersToRender = [...(projectData.members || [])];
  if (superAdminUID && !membersToRender.some((m) => m.uid === superAdminUID)) {
    membersToRender.unshift({
      uid: superAdminUID,
      role: "Project Owner Admin"
    });
  }

  const roles = {
    member: ["Project Admin", "Editor", "Commenter", "Viewer"],
    workspace: ["Editor", "Commenter", "Viewer"],
  };

  const accessIcon = modal.querySelector("#shareproject-access-icon");
  const accessTitle = modal.querySelector("#shareproject-access-title");
  const accessDesc = modal.querySelector("#shareproject-access-desc");
  const accessSettingsBtn = modal.querySelector("#shareproject-access-settings-btn");

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

  // --- ✅ UI UPDATE ADDED ---
  // Visually disable the access button if the user lacks permission.
  if (accessSettingsBtn) {
    accessSettingsBtn.disabled = !canChangeAccessLevel;
    const dropdownArrow = accessSettingsBtn.querySelector('i.material-icons:last-of-type');
    if (!canChangeAccessLevel) {
      accessSettingsBtn.title = "Only Project Admins can change this setting.";
      if (dropdownArrow) dropdownArrow.classList.add('hidden');
    } else {
      accessSettingsBtn.title = "";
      if (dropdownArrow) dropdownArrow.classList.remove('hidden');
    }
  }
  // --- ✅ END UI UPDATE ---

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
        if (role === "Project Admin" || role === "Project Owner Admin") {
          const isAlreadyAdmin =
            state.members.find((m) => m.uid === id)?.role === "Project Admin" ||
            state.members.find((m) => m.uid === id)?.role === "Project Owner Admin";
          const maxAdminsReached = projectAdmins.length >= 2 && !isAlreadyAdmin;
          if (maxAdminsReached)
            disabled = 'disabled title="Maximum of 2 Project Admins allowed."';

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
    const userProfile = userProfilesMap[member.uid] || {
      name: "Unknown User"
    };
    let isLocked = false;

    if (member.uid === superAdminUID) {
      const otherAdmins = state.members.filter(
        (m) => m.role === "Project Owner Admin" && m.uid !== superAdminUID
      );
      isLocked = otherAdmins.length === 0;
    }

    const displayRole = isLocked ? "Project Admin" : member.role;
    const profilePicHTML = createProfilePic(userProfile).outerHTML;

    membersHTML += `<div class="shareproject-member-item" data-uid="${member.uid
      }">${profilePicHTML}<div class="shareproject-member-info"><strong>${userProfile.name
      } ${isLocked ? "(Owner)" : ""}</strong><p>${userProfile.email || "No email provided"
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

  modal.querySelector(".shareproject-modal-header h2").textContent = `Share ${projectData.title || "Unnamed Project"
    }`;
  modal.querySelector("#shareproject-members-list").innerHTML = membersHTML;
  modal.querySelector("#shareproject-member-dropdowns-container").innerHTML =
    memberDropdownsHTML;
  modal.querySelector("#shareproject-pending-list-container").innerHTML =
    pendingHTML;
}

async function handleEmailSearch(modal) {
  const emailInput = modal.querySelector("#shareproject-email-input");
  const searchDropdown = modal.querySelector("#shareproject-user-search-dropdown");
  let searchTerm = emailInput.value.trim();

  if (!searchDropdown || !searchTerm) {
    searchDropdown.classList.add("hidden");
    return;
  }

  if (searchTerm.endsWith('@')) {
    const roles = {
      '@editor': 'Assign Editor role',
      '@viewer': 'Assign Viewer role',
      '@commenter': 'Assign Commenter role',
      '@admin': 'Assign Project Admin role',
    };
    searchDropdown.innerHTML = Object.entries(roles).map(([command, desc]) => `
            <a href="#" class="shareproject-user-search-result" data-command="${command}">
                <div class="shareproject-profile-pic" style="background-color:#e0e0e0;color:#333;"><i class="material-icons">sell</i></div>
                <div class="shareproject-member-info">
                    <strong>${command}</strong>
                    <p>${desc}</p>
                </div>
            </a>
        `).join('');

    // Add listeners for role commands
    searchDropdown.querySelectorAll('.shareproject-user-search-result').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        // Append the command (without the @) to the input
        emailInput.value = `${searchTerm}${item.dataset.command.substring(1)}`;
        emailInput.focus();
        searchDropdown.classList.add('hidden');
      });
    });

    searchDropdown.classList.remove('hidden');
    return;
  }

  // --- Command Parsing ---
  let explicitRole = null;
  const roleMatch = searchTerm.match(/\s@(\w+)$/); // Look for " @editor" at the end
  if (roleMatch) {
    const roleCommand = roleMatch[1].toLowerCase();
    const validRoles = { editor: "Editor", viewer: "Viewer", commenter: "Commenter", admin: "Project Admin" };
    if (validRoles[roleCommand]) {
      explicitRole = validRoles[roleCommand];
      searchTerm = searchTerm.replace(roleMatch[0], '').trim(); // Remove command from search
    }
  }

  // --- Data Retrieval ---
  const userProfilesMap = JSON.parse(modal.dataset.userProfilesMap || "{}");
  const userGroups = JSON.parse(modal.dataset.userGroups || "[]");
  const projectData = JSON.parse(modal.dataset.projectData || "{}");

  let searchResultsHTML = "";

  // --- Search User Groups (no changes here) ---
  const matchingGroups = userGroups.filter(group => group.name.toLowerCase().includes(searchTerm.toLowerCase()));
  searchResultsHTML += matchingGroups.map(group => {
    const membersCount = group.memberUIDs.length;
    return `
            <a href="#" class="shareproject-user-search-result" data-group-id="${group.id}">
                <div class="shareproject-profile-pic" style="background-color:#e5e7eb;color:#4b5563;"><i class="material-icons">group</i></div>
                <div class="shareproject-member-info">
                    <strong>${group.name}</strong>
                    <p>${membersCount} members</p>
                </div>
            </a>
        `;
  }).join('');

  // --- Search Individual Users ---
  const matchingUsers = Object.values(userProfilesMap).filter(profile => {
    if (!profile || !profile.email) return false;
    const nameMatch = profile.name && profile.name.toLowerCase().includes(searchTerm.toLowerCase());
    const emailMatch = profile.email.toLowerCase().includes(searchTerm.toLowerCase());
    // This now shows all matching users, regardless of whether they are already members
    return nameMatch || emailMatch;
  });

  searchResultsHTML += matchingUsers.map(profile => {
    const profilePicHTML = createProfilePic(profile).outerHTML;

    // ✅ --- NEW: Logic to determine the user's role for display ---
    let displayRole = '';
    const projectOwnerUID = projectData.project_super_admin_uid;
    const memberInfo = (projectData.members || []).find(m => m.uid === profile.id);

    if (profile.id === projectOwnerUID) {
      displayRole = 'Owner';
    } else if (memberInfo) {
      // User is a member of the current project, show their project role
      displayRole = memberInfo.role;
    } else if (profile.role === 0) {
      // User is not in the project, but has a global Developer role
      displayRole = 'Developer';
    } else if (profile.role === 3) {
      // User is not in the project, but has a global Admin role
      displayRole = 'Admin';
    }
    // --- END of new role logic ---

    return `
            <a href="#" class="shareproject-user-search-result" data-email="${profile.email}">
                ${profilePicHTML}
                <div class="shareproject-member-info">
                    <strong>${profile.name || 'Unnamed User'}</strong>
                    <p>${profile.email} ${displayRole ? `• <strong style="color: #0052cc;">${displayRole}</strong>` : ''}</p>
                </div>
            </a>
        `;
  }).join('');

  if (!searchResultsHTML) {
    searchDropdown.classList.add("hidden");
    return;
  }

  searchDropdown.innerHTML = searchResultsHTML;
  searchDropdown.classList.remove("hidden");

  // --- Attach Event Listeners (no changes here) ---
  searchDropdown.querySelectorAll('.shareproject-user-search-result').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = e.currentTarget;

      if (target.dataset.email) { // Clicked on a user
        addEmailTag(target.dataset.email);
        if (explicitRole) {
          document.getElementById('shareproject-selected-role').textContent = explicitRole;
        }
      } else if (target.dataset.groupId) { // Clicked on a group
        const groupId = target.dataset.groupId;
        const group = userGroups.find(g => g.id === groupId);
        if (group) {
          group.memberUIDs.forEach(uid => {
            const profile = userProfilesMap[uid];
            if (profile && profile.email) {
              addEmailTag(profile.email);
            }
          });
        }
      }

      emailInput.value = '';
      emailInput.focus();
      searchDropdown.classList.add('hidden');
    });
  });
}

async function handleInvite(modal, projectRef) {
  const inviter = auth.currentUser;

  if (!inviter) {
    alert("Error: You must be logged in to send invitations.");
    return;
  }

  const projectDataForCheck = JSON.parse(modal.dataset.projectData || '{}');
  const userProfilesMapForCheck = JSON.parse(modal.dataset.userProfilesMap || '{}');
  const currentUserProfile = userProfilesMapForCheck[inviter.uid];
  const currentUserMemberInfo = (projectDataForCheck.members || []).find(m => m.uid === inviter.uid);

  const isOwner = inviter.uid === projectDataForCheck.project_super_admin_uid;
  const isProjectAdmin = currentUserMemberInfo?.role === 'Project Admin';
  const isGlobalAdminOrDev = currentUserProfile?.role === 0 || currentUserProfile?.role === 3;

  if (!isOwner && !isProjectAdmin && !isGlobalAdminOrDev) {
    alert("Permission Denied. You are not authorized to invite users or change member roles for this project.");
    // The function will stop here, preventing any unauthorized changes.
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
        else if (role === "Project Admin" || role === "Project Owner Admin") {
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
        else if (memberInProject.role === "Project Admin" || memberInProject.role === "Project Owner Admin") {
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
    .hidden { display: none; } 
    .shareproject-user-search-dropdown { 
      position: absolute; 
      top: 100%; /* Position right below the input wrapper */
      left: 0;
      right: 0;
      background-color: white; 
      border: 1px solid #e0e0e0; 
      border-radius: 8px; 
      box-shadow: 0 4px 12px rgba(0,0,0,0.08); 
      z-index: 1011; 
      max-height: 250px; 
      overflow-y: auto;
      margin-top: 4px; /* Small gap */
  }
  .shareproject-user-search-result {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      text-decoration: none;
      color: #333;
      cursor: pointer;
  }
  .shareproject-user-search-result:hover {
      background-color: #f4f4f4;
  }
  #shareproject-email-suggestion {
        position: absolute;
        top: 4px;         /* Align with the real input */
        left: 8px;        /* Align with the real input's padding */
        padding: 8px;     /* Match the real input's padding */
        font-family: 'Inter', sans-serif; /* Match font */
        font-size: 14px;  /* Match font */
        color: #B0B0B0;   /* "Ghost text" color */
        background-color: transparent;
        border: none;
        pointer-events: none; /* Make it unclickable */
        z-index: -1;          /* Position it behind the real input's text */
    }    
  .shareproject-scrollable-section { max-height: 300px; overflow-y: auto; padding-right: 4px; margin-bottom: 16px; } .shareproject-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; animation: fadeIn 0.3s ease; } .shareproject-modal { background-color: white; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); width: 750px; display: flex; flex-direction: column; font-family: 'Inter', sans-serif; animation: slideIn 0.3s ease-out; max-height: 90vh; margin: auto; position: relative; } .shareproject-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #f0f0f0; } .shareproject-modal-header h2 { margin: 0; font-size: 18px; font-weight: 600; color: #111; } .shareproject-icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 50%; display: inline-flex; align-items: center; color: #555; } .shareproject-icon-btn:hover { background-color: #f4f4f4; } .shareproject-modal-body { padding: 16px 24px; overflow-y: auto; min-height:200px; } .shareproject-modal-body > p.shareproject-section-title { font-size: 14px; font-weight: 500; color: #333; margin: 16px 0 8px 0; } .shareproject-invite-input-wrapper { position: relative; display: flex; align-items: center; border: 1px solid #e0e0e0; border-radius: 8px; padding: 4px; margin-bottom: 16px; transition: all 0.2s ease; } .shareproject-invite-input-wrapper:focus-within { border-color: #1267FA; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); } .shareproject-email-tags-container { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-left: 8px; } .shareproject-email-tag { display: flex; align-items: center; background-color: #eef2ff; color: #4338ca; padding: 4px 10px; border-radius: 6px; font-size: 14px; font-weight: 500; } .shareproject-email-tag .shareproject-remove-tag { cursor: pointer; margin-left: 8px; font-size: 16px; } #shareproject-email-input { flex-grow: 1; border: none; outline: none; padding: 8px; font-size: 14px; background: transparent; min-width: 150px; } .shareproject-invite-controls { display: flex; align-items: center; gap: 8px; padding-right: 4px;} .shareproject-role-selector, .shareproject-member-role { position: relative; } .shareproject-dropdown-btn { background-color: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; font-size: 14px; white-space: nowrap; } .shareproject-dropdown-btn:hover { background-color: #f9f9f9; } .shareproject-dropdown-btn:disabled { background-color: #f9fafb; cursor: not-allowed; color: #555;} .shareproject-dropdown-content { position: absolute; background-color: white; border: 1px solid #f0f0f0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); z-index: 1010; width: auto; min-width: 220px; overflow: hidden; animation: fadeIn 0.2s ease; } .shareproject-dropdown-action { display: block; width: 100%; padding: 12px 16px; text-decoration: none; color: #333; background: none; border: none; cursor: pointer; text-align: left; font-family: 'Inter', sans-serif; font-size: 14px; } .shareproject-dropdown-action:hover, .shareproject-dropdown-content a.shareproject-remove:hover { background-color: #f4f4f4; } .shareproject-dropdown-content a { display: block; padding: 12px 16px; text-decoration: none; color: #333; } .shareproject-dropdown-content strong { font-weight: 500; display: flex; align-items: center; gap: 8px; } .shareproject-dropdown-content p { font-size: 13px; color: #666; margin: 4px 0 0 0; line-height: 1.4; } .shareproject-invite-btn { background-color: #3F7EEB; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: background-color 0.2s ease; } .shareproject-invite-btn:hover { background-color: #1267FA; } .shareproject-access-settings-btn { display: flex; align-items: flex-start; width: 100%; text-align: left; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px; cursor: pointer; background: none; } .shareproject-access-settings-btn:hover { background-color: #f9f9f9; } .shareproject-access-settings-btn .material-icons { margin-right: 12px; color: #555; line-height: 1.4; } .shareproject-access-settings-btn div { flex-grow: 1; } .shareproject-members-list { margin-top: 16px; } .shareproject-member-item, .shareproject-pending-item { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; } .shareproject-member-item:last-child, .shareproject-pending-item:last-child { border-bottom: none; } .shareproject-profile-pic { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 500; font-size: 14px; margin-right: 12px; text-transform: uppercase; background-size: cover; background-position: center; } .shareproject-pending-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; background-color: #f3f4f6; color: #6b7280; } .shareproject-member-info { flex-grow: 1; } .shareproject-member-info strong { font-size: 14px; font-weight: 500; color: #111; } .shareproject-member-info p { font-size: 13px; color: #666; margin: 2px 0 0 0; } .shareproject-member-role .shareproject-dropdown-btn { background: none; border: none; padding: 4px 8px; color: #555; } .shareproject-member-role .shareproject-dropdown-content a.shareproject-remove { color: #ef4444; } .shareproject-modal-footer { padding: 16px 24px; border-top: 1px solid #f0f0f0; background-color: #f9fafb; display: flex; justify-content: space-between; align-items: center; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; } .shareproject-copy-link-btn { background: none; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; font-size: 14px; font-weight: 500; } #shareproject-leave-btn { color: #ef4444; font-weight: 500; font-size: 14px; } #shareproject-leave-btn .material-icons { color: #ef4444; margin-right: 4px; } .section-loader { margin: 40px auto; border: 4px solid #f3f3f3; border-radius: 50%; border-top: 4px solid #3498db; width: 40px; height: 40px; animation: spin 2s linear infinite; } .shareproject-user-search-dropdown { position: absolute; background-color: white; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); z-index: 1011; max-height: 200px; overflow-y: auto; width: 100%; top: 100%; left: 0; right: 0;} .shareproject-user-search-dropdown a { display: flex; align-items: center; padding: 8px 16px; text-decoration: none; color: #333; } .shareproject-user-search-dropdown a:hover { background-color: #f4f4f4; }
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
                <input type="text" id="shareproject-email-suggestion" readonly tabindex="-1">
                <input type="text" id="shareproject-email-input" placeholder="Add workspace members or new people by email...">
                <div class="shareproject-invite-controls">
                    <div class="shareproject-role-selector">
                        <button id="shareproject-invite-role-btn" data-target-dropdown="shareproject-role-dropdown" class="shareproject-dropdown-btn">
                            <span id="shareproject-selected-role">Editor</span>
                            <i class="material-icons">arrow_drop_down</i>
                        </button>
                    </div>
                    <button id="shareproject-invite-btn" class="shareproject-invite-btn">Invite</button>
                </div>
                <div id="shareproject-user-search-dropdown" class="shareproject-user-search-dropdown hidden"></div>
            </div>
            <div class="shareproject-access-settings-wrapper">
                <button id="shareproject-access-settings-btn" data-target-dropdown="shareproject-access-dropdown" class="shareproject-access-settings-btn">
                    <i class="material-icons" id="shareproject-access-icon"></i>
                    <div>
                        <strong id="shareproject-access-title"></strong>
                        <p id="shareproject-access-desc"></p>
                    </div>
                    <i class="material-icons">arrow_drop_down</i>
                </button>
            </div>
            <div class="shareproject-scrollable-section">
                <br>
                <p class="shareproject-section-title">Project Members</p>
                <div class="shareproject-members-list" id="shareproject-members-list"><div class="section-loader"></div></div>
                <div id="shareproject-pending-list-container"></div>
            </div>
        </div>
        <div class="shareproject-modal-footer">
            <div id="shareproject-footer-left">
                <button id="shareproject-leave-btn" class="shareproject-icon-btn"><i class="material-icons">logout</i>Leave Project</button>
            </div>
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