import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  firebaseConfig
} from "/services/firebase-config.js";

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

// --- Module State ---
let handleOutsideClick;
let modal = null;
let invitedEmails = []; // Stores emails in the input tag area

/**
 * Placeholder for the email sending utility.
 * You must implement this function to connect to your email service (e.g., using a Firebase Function).
 * @param {object} { email, projectName, invitationUrl }
 */
async function sendEmailInvitation({
  email,
  projectName,
  invitationUrl
}) {
  console.log(
    `[Email Simulation] Sending invitation to: ${email} for project: ${projectName} with link: ${invitationUrl}`
  );
  // In a real application, this would trigger a Firebase Function that uses a service like SendGrid or Nodemailer.
  // For example:
  // const sendInvite = httpsCallable(functions, 'sendEmailInvitation');
  // await sendInvite({ email, projectName, invitationUrl });
  return Promise.resolve();
}

// --- Main Exported Function ---

/**
 * Opens and initializes the sharing modal for a specific inventory item.
 * @param {string} inventoryId - The ID of the document in the 'ProductListWorkspace' collection.
 */
export async function openShareProductListModal(inventoryId) {
  if (document.getElementById("shareProductListModal")) {
    document.getElementById("shareProductListModal").remove();
  }

  generateShareModalHTML();
  modal = document.getElementById("shareProductListModal");

  try {
    modal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");

    const inventoryRef = doc(db, "ProductListWorkspace", inventoryId);
    const inventorySnap = await getDoc(inventoryRef);

    if (!inventorySnap.exists()) {
      alert("Inventory item not found.");
      closeModal();
      return;
    }

    const inventoryData = inventorySnap.data();
    let membersArray = [];
    if (Array.isArray(inventoryData.members)) {
      membersArray = inventoryData.members;
    } else if (typeof inventoryData.members === 'object' && inventoryData.members !== null) {
      membersArray = [inventoryData.members];
    }
    let uidsToFetch = membersArray.map(member => member.uid);

    const ownerUid = inventoryData.project_super_admin_uid;
    if (ownerUid && !uidsToFetch.includes(ownerUid)) {
      uidsToFetch.push(ownerUid);
    }

    const userProfilesMap = await fetchUserProfiles(uidsToFetch);
    renderDynamicContent(modal, {
      inventoryData: inventoryData,
      userProfilesMap: userProfilesMap,
      currentUserId: auth.currentUser.uid,
    });

    // Attach listeners immediately, without a delay
    attachModalEventListeners(inventoryRef);

  } catch (error) {
    console.error("Error opening share modal:", error);
    alert("Could not open the sharing dialog. Please try again.");
    closeModal();
  }
}

function createAvatarHTML(profile) {
  if (profile && profile.avatar) {
    // If an avatar URL exists, use an <img> tag.
    // The 'object-cover' class is like 'object-fit: cover;' in CSS to prevent stretching.
    return `<img src="${profile.avatar}" alt="${profile.name || 'User Avatar'}" class="member-avatar w-8 h-8 rounded-full object-cover">`;
  } else {
    // Otherwise, create a fallback <div> with initials.
    const name = profile && profile.name ? profile.name : "P";
    const initials = name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    const colors = ["#4A148C", "#004D40", "#BF360C", "#0D47A1", "#4E342E"];
    const hash = name.split("").reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
    const bgColor = colors[Math.abs(hash) % colors.length];

    return `
            <div class="member-avatar w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm" style="background-color: ${bgColor};">
                ${initials}
            </div>
        `;
  }
}

function createMemberActionsDropdownHTML(uid, availableRoles, isLocked, isDisabled) {
  const dropdownId = `member-menu-for-${uid}`;
  const disabledAttr = isLocked || isDisabled ? "disabled" : "";

  // Create the new, specific layout for role options
  const roleOptions = `
        <button class="dropdown-item" data-action="change-role" data-role="Editor" data-uid="${uid}">Editor</button>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item" data-action="change-role" data-role="Viewer" data-uid="${uid}">Viewer</button>
    `;

  // Add the "Remove Member" option with a divider before it
  const removeOption = !isLocked && !isDisabled ?
    `<div class="dropdown-divider"></div><button class="dropdown-item dropdown-item-danger" data-action="remove" data-uid="${uid}"><i class="material-icons">person_remove</i>Remove Member</button>` : '';

  // Conditionally show the icon only if the button is enabled
  const iconHTML = !isLocked && !isDisabled ? '<i class="material-icons">arrow_drop_down</i>' : '';

  return `
        <div class="relative">
            <button class="member-action-btn" data-target-dropdown="${dropdownId}">
                ${iconHTML}
            </button>
            <div id="${dropdownId}" class="dropdown-menu hidden">
                ${roleOptions}
                ${removeOption}
            </div>
        </div>
    `;
}

function renderDynamicContent(modal, { inventoryData, userProfilesMap, currentUserId }) {
  modal.dataset.inventoryData = JSON.stringify(inventoryData);
  modal.dataset.userProfilesMap = JSON.stringify(userProfilesMap);
  modal.dataset.currentUserId = currentUserId;

  const superAdminUID = inventoryData.project_super_admin_uid;
  let membersArray = [];
  if (Array.isArray(inventoryData.members)) {
    membersArray = inventoryData.members;
  } else if (typeof inventoryData.members === 'object' && inventoryData.members !== null) {
    membersArray = [inventoryData.members];
  }
  const currentUserMemberInfo = membersArray.find(m => m.uid === currentUserId);

  const isOwner = currentUserId === superAdminUID;
  const isProjectAdmin = currentUserMemberInfo?.role === 'Project Admin';
  const canManageMembers = isOwner || isProjectAdmin;

  const inviteWrapper = modal.querySelector(".shareproject-invite-input-wrapper");
  if (inviteWrapper) {
    inviteWrapper.style.display = canManageMembers ? '' : 'none';
  }

  const members = [...membersArray];
  if (superAdminUID && !members.some(m => m.uid === superAdminUID)) {
    members.unshift({ uid: superAdminUID, role: "Project Admin" });
  }

  const roles = ["Project Admin", "Editor", "Viewer"];

  let membersHTML = "";
  members.forEach(member => {
    const user = userProfilesMap[member.uid] || { name: "Unknown User", email: "N/A" };
    const isCurrentUserOwner = member.uid === superAdminUID;
    const isLocked = isCurrentUserOwner;

    const avatarHTML = createAvatarHTML(user);
    const actionsDropdownHTML = createMemberActionsDropdownHTML(member.uid, roles, isLocked, !canManageMembers);

    // --- UPDATED HTML STRUCTURE ---
    membersHTML += `
            <div class="member-item" data-uid="${member.uid}">
                <div class="member-info">
                    ${avatarHTML}
                    <div>
                        <div class="member-email">
                           ${user.name || 'Unknown User'} ${isCurrentUserOwner ? "(Owner)" : ""}
                        </div>
                    </div>
                </div>
                <div class="member-actions">
                    <div class="member-current-role">${member.role}</div>
                    ${actionsDropdownHTML}
                </div>
            </div>
        `;
  });

  // --- HTML GENERATION FOR PENDING INVITES (WITH AVATARS) ---
  let pendingHTML = "";
  if (inventoryData.pendingInvites && inventoryData.pendingInvites.length > 0) {
    pendingHTML += '<p class="section-title">Pending Invitations</p>';
    inventoryData.pendingInvites.forEach(invite => {
      // Find user profile by email to get avatar for pending invite
      const pendingUserProfile = Object.values(userProfilesMap).find(p => p.email?.toLowerCase() === invite.email.toLowerCase());
      const pendingAvatarHTML = createAvatarHTML(pendingUserProfile);

      pendingHTML += `
                <div class="member-item pending">
                    <div class="member-info">
                        ${pendingAvatarHTML}
                        <div>
                           <div class="member-email">${invite.email}</div>
                           <div class="member-role">Invitation sent (${invite.role})</div>
                        </div>
                    </div>
                </div>`;
    });
  }

  modal.querySelector("#shareproject-members-list").innerHTML = membersHTML;
  modal.querySelector("#shareproject-pending-list-container").innerHTML = pendingHTML;
}

/**
 * Handles the entire invitation and role-changing process.
 */
async function handleInvite(inventoryRef) {
  const inviter = auth.currentUser;
  if (!inviter) return alert("You must be logged in.");

  const inventorySnap = await getDoc(inventoryRef);
  if (!inventorySnap.exists()) return alert("Inventory item no longer exists.");
  const inventoryData = inventorySnap.data();
  const userProfilesMap = await fetchUserProfiles([]);

  const currentUserMemberInfo = (inventoryData.members || []).find(m => m.uid === inviter.uid);
  const isOwner = inviter.uid === inventoryData.project_super_admin_uid;
  const isProjectAdmin = currentUserMemberInfo?.role === 'Project Admin';

  if (!isOwner && !isProjectAdmin) {
    return alert("You do not have permission to invite or manage members.");
  }

  const emailInput = modal.querySelector("#shareproject-email-input");
  const lastEmail = emailInput.value.trim();
  if (lastEmail && !invitedEmails.includes(lastEmail)) {
    invitedEmails.push(lastEmail);
  }

  if (invitedEmails.length === 0) return alert("Please enter at least one email address.");

  // --- MODIFIED PART ---
  const roleSelect = modal.querySelector("#shareRole");
  const role = roleSelect.value;
  if (!role) {
    alert("Please select a role for the new member(s).");
    return;
  }
  // --- END MODIFICATION ---

  const inviteBtn = modal.querySelector("#shareproject-invite-btn");
  inviteBtn.disabled = true;
  inviteBtn.textContent = "Processing...";

  const batch = writeBatch(db);
  const successfulInvites = [];
  const failedInvites = [];

  for (const email of invitedEmails) {
    const lowerEmail = email.toLowerCase();
    const existingUser = Object.values(userProfilesMap).find(p => p.email?.toLowerCase() === lowerEmail);

    if (existingUser) {
      const memberInProject = (inventoryData.members || []).find(m => m.uid === existingUser.uid);

      if (memberInProject) {
        if (memberInProject.role !== role) {
          await directRoleUpdate(memberInProject.uid, role, inventoryRef);
          successfulInvites.push(email);
        }
      } else {
        const newMember = { uid: existingUser.uid, role: role };
        batch.update(inventoryRef, { members: arrayUnion(newMember) });
        if (role === 'Project Admin') {
          batch.update(inventoryRef, { project_admin_user: arrayUnion(existingUser.uid) });
        }
        successfulInvites.push(email);
      }
    } else {
      const existingPendingInvite = (inventoryData.pendingInvites || []).find(p => p.email.toLowerCase() === lowerEmail);
      if (existingPendingInvite) {
        console.log(`Invite for ${email} is already pending.`);
        continue;
      }

      try {
        const newInvitationRef = doc(collection(db, "InvitedProjects"));
        const invitationId = newInvitationRef.id;
        const invitationUrl = `https://your-app-domain.com/invitation/${invitationId}`;

        await sendEmailInvitation({
          email: lowerEmail,
          projectName: inventoryData.title || "an Inventory Item",
          invitationUrl,
        });

        const newPendingData = {
          email: lowerEmail,
          role: role,
          invitedAt: new Date().toISOString(),
          invitationId: invitationId,
        };

        batch.set(newInvitationRef, {
          invitationId,
          inventoryId: inventoryRef.id,
          inventoryName: inventoryData.title || "Unnamed Inventory",
          invitedEmail: lowerEmail,
          role: role,
          status: "pending",
          invitedBy: { uid: inviter.uid, name: inviter.displayName, email: inviter.email },
        });

        batch.update(inventoryRef, { pendingInvites: arrayUnion(newPendingData) });
        successfulInvites.push(email);
      } catch (error) {
        console.error(`Failed to process invitation for ${lowerEmail}:`, error);
        failedInvites.push(email);
      }
    }
  }

  try {
    await batch.commit();
    let feedback = "";
    if (successfulInvites.length > 0) feedback += `Successfully processed ${successfulInvites.length} user(s).\n`;
    if (failedInvites.length > 0) feedback += `Failed to invite: ${failedInvites.join(", ")}.`;
    if (feedback) alert(feedback.trim());

    invitedEmails = [];
    renderEmailTags();
    openShareInventoryModal(inventoryRef.id);
  } catch (error) {
    console.error("Error committing invites:", error);
    alert("A database error occurred.");
  } finally {
    inviteBtn.disabled = false;
    inviteBtn.textContent = "Invite";
  }
}

/**
 * Updates a member's role in a single transaction.
 */
async function directRoleUpdate(memberId, newRole, inventoryRef) {
  const batch = writeBatch(db);
  const inventorySnap = await getDoc(inventoryRef);
  if (!inventorySnap.exists()) return alert("Inventory item not found.");

  const inventoryData = inventorySnap.data();
  const originalMembers = inventoryData.members || [];
  let memberFound = false;

  // Prevent owner from being demoted
  if (memberId === inventoryData.project_super_admin_uid && newRole !== "Project Admin") {
    alert("The owner's role cannot be changed.");
    return;
  }

  const updatedMembers = originalMembers.map(member => {
    if (member.uid === memberId) {
      memberFound = true;
      return {
        ...member,
        role: newRole
      };
    }
    return member;
  });

  if (!memberFound) return alert("Could not update role: Member not found.");

  batch.update(inventoryRef, {
    members: updatedMembers
  });

  // Update the admin tracking array
  if (newRole === "Project Admin") {
    batch.update(inventoryRef, {
      project_admin_user: arrayUnion(memberId)
    });
  } else {
    batch.update(inventoryRef, {
      project_admin_user: arrayRemove(memberId)
    });
  }

  try {
    await batch.commit();
    console.log("Role updated successfully.");
    openShareProductListModal(inventoryRef.id); // Refresh modal
  } catch (error) {
    console.error("Direct role update failed:", error);
    alert("An error occurred while updating the role.");
  }
}

/**
 * Removes a member from the inventory item.
 */
async function removeMember(memberIdToRemove, inventoryRef) {
  if (!confirm("Are you sure you want to remove this member?")) return;

  const batch = writeBatch(db);
  const inventorySnap = await getDoc(inventoryRef);
  if (!inventorySnap.exists()) return alert("Inventory item not found.");

  const inventoryData = inventorySnap.data();

  // Critical check: prevent owner from being removed
  if (memberIdToRemove === inventoryData.project_super_admin_uid) {
    alert("The owner cannot be removed from the project.");
    return;
  }

  const memberToRemove = (inventoryData.members || []).find(m => m.uid === memberIdToRemove);

  if (memberToRemove) {
    batch.update(inventoryRef, {
      members: arrayRemove(memberToRemove)
    });
    // If they were an admin, also remove them from the admin list
    if (memberToRemove.role === 'Project Admin') {
      batch.update(inventoryRef, {
        project_admin_user: arrayRemove(memberIdToRemove)
      });
    }

    try {
      await batch.commit();
      console.log("Member removed successfully.");
      openShareProductListModal(inventoryRef.id); // Refresh modal
    } catch (error) {
      console.error("Failed to remove member:", error);
      alert("An error occurred while removing the member.");
    }
  } else {
    alert("Member not found.");
  }
}

function attachModalEventListeners(inventoryRef) {
  // 1. Listeners for closing the modal (no changes here)
  const closeButton = modal.querySelector(".modal-close");
  if (closeButton) {
    closeButton.onclick = closeModal;
  }
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // 2. Listener for the main "Share" or "Invite" button (no changes here)
  const shareButton = modal.querySelector("#shareAccessBtn") || modal.querySelector("#shareproject-invite-btn");
  if (shareButton) {
    shareButton.onclick = () => handleInvite(inventoryRef);
  }

  // 3. Listener for the three-dot buttons to open the dropdown
  modal.querySelectorAll('.member-action-btn').forEach(button => {
    button.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      // First, remove any dropdown that's already open
      const existingDropdown = document.querySelector('.dropdown-menu-active');
      if (existingDropdown) {
        existingDropdown.remove();
      }

      // Find the hidden menu template associated with this button
      const dropdownId = button.dataset.targetDropdown;
      const dropdownTemplate = document.getElementById(dropdownId);
      if (!dropdownTemplate) return;

      // Clone the template, make it active, and append to the body
      const dropdownClone = dropdownTemplate.cloneNode(true);
      dropdownClone.classList.remove('hidden');
      dropdownClone.classList.add('dropdown-menu-active'); // Use a new class to mark it as open
      document.body.appendChild(dropdownClone);

      // Calculate the position
      const rect = button.getBoundingClientRect(); // Get position of the button
      dropdownClone.style.position = 'fixed'; // Position relative to the viewport
      dropdownClone.style.top = `${rect.bottom + 4}px`; // 4px below the button
      // Align the right edge of the menu with the right edge of the button
      dropdownClone.style.left = `${rect.right - dropdownClone.offsetWidth}px`;
    });
  });

  // 4. A SINGLE global listener for handling actions and closing the menu
  handleOutsideClick = (e) => {
    const activeDropdown = document.querySelector('.dropdown-menu-active');
    if (!activeDropdown) return;

    const actionButton = e.target.closest('.dropdown-item');
    const isClickInside = e.target.closest('.dropdown-menu-active');

    // If an action item was clicked, perform the action
    if (actionButton) {
      const { action, uid, role } = actionButton.dataset;
      if (action === 'change-role') {
        directRoleUpdate(uid, role, inventoryRef);
      } else if (action === 'remove') {
        removeMember(uid, inventoryRef);
      }
    }

    // If the click was on an action item OR outside the menu, remove the menu
    if (actionButton || !isClickInside) {
      activeDropdown.remove();
    }
  };
  document.addEventListener('click', handleOutsideClick);
}

function closeModal() {
  if (modal) {
    modal.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    modal.remove();
    modal = null;
    invitedEmails = []; // Reset state on close
  }
  // IMPORTANT: Remove the global listener to prevent memory leaks
  if (handleOutsideClick) {
    document.removeEventListener('click', handleOutsideClick);
  }
}

async function fetchUserProfiles(uids) {
  const userProfilesMap = {};
  if (!uids || uids.length === 0) {
    // If no UIDs provided, fetch all users for search purposes
    const usersSnap = await getDocs(collection(db, "users"));
    usersSnap.forEach(doc => {
      userProfilesMap[doc.id] = {
        ...doc.data(),
        uid: doc.id
      };
    });
  } else {
    // Fetch specific user profiles
    const chunks = [];
    for (let i = 0; i < uids.length; i += 10) {
      chunks.push(uids.slice(i, i + 10));
    }
    for (const chunk of chunks) {
      const q = query(collection(db, "users"), where("__name__", "in", chunk));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(doc => {
        userProfilesMap[doc.id] = {
          ...doc.data(),
          uid: doc.id
        };
      });
    }
  }
  return userProfilesMap;
}

function createRoleDropdownHTML(uid, currentRole, availableRoles, isLocked, isDisabled) {
  const dropdownId = `role-dropdown-for-${uid}`;
  const disabledAttr = isLocked || isDisabled ? "disabled" : "";

  const roleOptions = availableRoles.map(role =>
    `<button class="shareproject-dropdown-action" data-role="${role}">${role}</button>`
  ).join("");

  const removeLink = !isLocked && !isDisabled ?
    `<a href="#" class="shareproject-remove shareproject-dropdown-action"><i class="material-icons">person_remove</i> Remove member</a>` :
    "";

  const dropdownMenu = `
        <div id="${dropdownId}" class="shareproject-dropdown-content hidden">
            ${roleOptions}
            ${removeLink ? `<div class="shareproject-dropdown-divider"></div>${removeLink}` : ''}
        </div>
    `;

  return `
        <div class="shareproject-member-role" data-uid="${uid}">
            <button class="shareproject-dropdown-btn" data-target-dropdown="${dropdownId}" ${disabledAttr}>
                <span>${currentRole}</span>
                ${isLocked || isDisabled ? '' : '<i class="material-icons">arrow_drop_down</i>'}
            </button>
            ${dropdownMenu}
        </div>
    `;
}

function renderEmailTags() {
  if (!modal) return;
  const container = modal.querySelector("#shareproject-email-tags");
  const emailInput = modal.querySelector("#shareproject-email-input");
  container.innerHTML = "";
  invitedEmails.forEach(email => {
    const tag = document.createElement("div");
    tag.className = "shareproject-email-tag";
    tag.innerHTML = `<span>${email}</span><span class="shareproject-remove-tag" data-email="${email}">&times;</span>`;
    tag.querySelector(".shareproject-remove-tag").addEventListener("click", () => {
      invitedEmails = invitedEmails.filter(e => e !== email);
      renderEmailTags();
    });
    container.appendChild(tag);
  });
  // Place input after tags
  container.appendChild(emailInput);
  emailInput.focus();
}

function createProfilePic(profile) {
  const pic = document.createElement("div");
  // UPDATED: Using your 'member-avatar' class
  pic.className = "member-avatar";

  if (profile && profile.avatar) {
    // This part already correctly uses the avatar URL to set the image
    pic.style.backgroundImage = `url(${profile.avatar})`;
  } else {
    const name = profile && profile.name ? profile.name : "U";
    pic.textContent = name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();

    // This fallback color logic remains the same
    const colors = ["#4A148C", "#004D40", "#BF360C", "#0D47A1", "#4E342E"];
    const hash = name.split("").reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
    pic.style.backgroundColor = colors[Math.abs(hash) % colors.length];

    // Ensure white text for initials on colored backgrounds
    pic.style.color = 'white';
  }
  return pic;
}

function generateShareModalHTML() {
  const modalHtml = `
    <div id="shareProductListModal" class="modal-overlay hidden">
      <div class="modal-container">
        <div class="modal-header">
          <h3 class="modal-title" id="modalTitle">Allow Access</h3>
          <button class="modal-close" id="closeShareModalBtn">✕</button>
        </div>
        <div class="modal-body">
          <form id="shareForm">
            <div class="flex gap-2 items-end">
              <div class="form-group flex-1">
                <label class="form-label">Email address</label>
                <input type="email" id="shareEmail" class="form-input" placeholder="Enter email address" required autocomplete="off" style="text-overflow: clip; white-space: nowrap; overflow-x: auto; min-width: 0; width: 100%;" />
              </div>
              <div class="shareproject-invite-actions">
              <div class="form-group w-30">
                <label class="form-label">Role</label>
                <select id="shareRole" class="form-input" required>
                  <option value="">Select role</option>
                  <option value="Editor">Editor</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>
            </div>
            <div class="form-group"><button id="shareproject-invite-btn" class="shareproject-btn-primary">Invite</button></div>
            </div>
            <div class="form-group">
              <label class="form-label">Product list members</label>
              <div id="shareproject-members-list" class="members-list">
               </div>
              <div class="productlist-invitation-list"> 
                <label class="form-label">Invited members</label> 
                <div id="shareproject-pending-list-container" class="members-list">
                  </div>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" id="cancelShareBtn">Cancel</button>
          <button class="btn btn-primary" id="shareAccessBtn">Share access</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
}
