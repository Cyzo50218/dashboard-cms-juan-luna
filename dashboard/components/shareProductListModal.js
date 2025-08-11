import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

// Firebase initialization
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

export function openShareProductListModal(inventoryId, onClose) {
  // Ensure modal doesn't exist already
  if (document.getElementById("shareProductListModal")) {
    document.getElementById("shareProductListModal").remove();
  }

  generateShareModal();

  // Use setTimeout to ensure modal is in DOM before querying elements
  setTimeout(() => {
    const modal = document.getElementById("shareProductListModal");
    const emailInput = document.getElementById("shareEmail");
    const roleSelect = document.getElementById("shareRole");
    const membersList = document.getElementById("membersList");
    const shareBtn = document.getElementById("shareAccessBtn");
    const cancelBtn = document.getElementById("cancelShareBtn");
    const closeBtn = document.getElementById("closeShareModalBtn");

    if (
      !modal ||
      !emailInput ||
      !roleSelect ||
      !membersList ||
      !shareBtn ||
      !cancelBtn ||
      !closeBtn
    ) {
      console.error("One or more modal elements not found");
      return;
    }

    // Load existing members
    loadExistingMembers(inventoryId, membersList);

    // Show modal
    modal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");

    // Event listeners
    shareBtn.onclick = () => {
      handleShareAccess(
        inventoryId,
        emailInput,
        roleSelect,
        membersList,
        onClose
      ).catch(console.error);
    };

    const closeHandler = () => {
      modal.classList.add("hidden");
      document.body.classList.remove("overflow-hidden");

      // Remove the click listener for dropdowns
      document.removeEventListener("click", handleClickOutside);

      if (typeof onClose === "function") {
        onClose();
      }
      modal.remove();
    };

    cancelBtn.onclick = closeHandler;
    closeBtn.onclick = closeHandler;

    // Close on overlay click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeHandler();
      }
    });

    // Add keyboard listener for Escape key
    document.addEventListener("keydown", function handleEscape(e) {
      if (e.key === "Escape") {
        closeHandler();
        document.removeEventListener("keydown", handleEscape);
      }
    });
  }, 50);
}

async function loadExistingMembers(inventoryId, container) {
  try {
    container.innerHTML = `
      <div class="text-center py-4 text-gray-500 dark:text-gray-400">
        <p>Loading members...</p>
      </div>
    `;

    const inventoryRef = doc(db, "InventoryWorkspace", inventoryId);
    const inventorySnap = await getDoc(inventoryRef);

    if (!inventorySnap.exists()) {
      container.innerHTML = `
        <div class="text-center py-8">
          <p class="text-red-500">Inventory not found</p>
        </div>
      `;
      return;
    }

    const data = inventorySnap.data();
    const members = data.sharedWith || [];

    container.innerHTML = "";

    if (members.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8">
          <p class="text-gray-400 dark:text-gray-500">No members have access yet</p>
        </div>
      `;
      return;
    }

    // Fetch user details for all members
    const usersRef = collection(db, "users");
    const userEmails = members.map((member) => member.email);
    const userQuery = query(usersRef, where("email", "in", userEmails));
    const userDocsSnap = await getDocs(userQuery);

    const userDetails = {};
    userDocsSnap.forEach((doc) => {
      userDetails[doc.data().email] = {
        name: doc.data().name,
        avatar: doc.data().avatar,
      };
    });

    members.forEach((member, index) => {
      const userDetail = userDetails[member.email] || {};
      const memberDiv = document.createElement("div");
      memberDiv.className =
        "flex items-center justify-between p-3 existing-member-bg rounded-lg mb-2";

      const avatarContent = userDetail.avatar
        ? `<img src="${
            userDetail.avatar
          }" class="w-8 h-8 rounded-full object-cover" alt="${
            userDetail.name || member.email
          }">`
        : `<div class="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
            ${member.email.charAt(0).toUpperCase()}
          </div>`;

      memberDiv.innerHTML = `
        <div class="flex items-center space-x-3 flex-1">
          ${avatarContent}
          <div class="flex-1 min-w-0">
            <p class="font-medium text-gray-900 dark:text-white truncate">${
              userDetail.name || member.email
            }</p>
            <p class="text-sm text-gray-500 dark:text-gray-400">${
              member.role
            }</p>
            ${
              userDetail.name
                ? `<p class="text-xs text-gray-400 dark:text-gray-500 truncate">${member.email}</p>`
                : ""
            }
          </div>
        </div>
        <div class="relative ml-2">
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1" 
                  onclick="window.toggleMemberMenu('member-menu-${index}')">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path>
            </svg>
          </button>
          <div id="member-menu-${index}" class="absolute right-full top-0 mr-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg hidden z-50 border-none" style="right: 100%; top: 0; margin-right: 0.5rem;">
            <button class="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onclick="event.preventDefault(); event.stopPropagation(); window.removeMember('${inventoryId}', '${
        member.email
      }', '${member.role}')">
              Remove member
            </button>
            <button class="w-full text-left px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onclick="event.preventDefault(); event.stopPropagation(); window.openChangeRoleModal('${inventoryId}', '${
        member.email
      }', '${member.role}')">
              Change role
            </button>
          </div>
        </div>
      `;
      container.appendChild(memberDiv);
    });
  } catch (error) {
    console.error("Error loading members:", error);
    container.innerHTML = `
      <div class="text-center py-8">
        <p class="text-red-500">Error loading members</p>
      </div>
    `;
  }
}

async function handleShareAccess(
  inventoryId,
  emailInput,
  roleSelect,
  membersList,
  onClose
) {
  const email = emailInput.value.trim();
  const role = roleSelect.value;

  if (!email || !isValidEmail(email)) {
    alert("Please enter a valid email address");
    return;
  }

  if (!role) {
    alert("Please select a role");
    return;
  }

  try {
    const inventoryRef = doc(db, "InventoryWorkspace", inventoryId);
    const inventorySnap = await getDoc(inventoryRef);

    if (inventorySnap.exists()) {
      const data = inventorySnap.data();
      const sharedWith = data.sharedWith || [];

      // Check if email already exists
      const existingMember = sharedWith.find(
        (member) => member.email === email
      );
      if (existingMember) {
        alert("This email already has access");
        return;
      }

      // Add new member
      await updateDoc(inventoryRef, {
        sharedWith: arrayUnion({
          email,
          role,
          invitedAt: new Date().toISOString(),
        }),
      });

      // Reload members list
      await loadExistingMembers(inventoryId, membersList);

      // Clear form
      emailInput.value = "";
      roleSelect.value = "";

      showNotification("Access shared successfully!");
    }
  } catch (error) {
    console.error("Error sharing access:", error);
    showNotification("Error sharing access. Please try again.");
  }
}

async function removeMember(inventoryId, email, role) {
  if (!confirm(`Are you sure you want to remove ${email}?`)) {
    return;
  }

  try {
    const inventoryRef = doc(db, "InventoryWorkspace", inventoryId);
    const inventorySnap = await getDoc(inventoryRef);

    if (inventorySnap.exists()) {
      const data = inventorySnap.data();
      const sharedWith = data.sharedWith || [];

      // Find the exact member object to remove (including any additional fields)
      const memberToRemove = sharedWith.find(
        (member) => member.email === email && member.role === role
      );

      if (memberToRemove) {
        await updateDoc(inventoryRef, {
          sharedWith: arrayRemove(memberToRemove),
        });

        // Reload the modal
        const membersList = document.getElementById("membersList");
        if (membersList) {
          await loadExistingMembers(inventoryId, membersList);
        }

        showNotification("Member removed successfully");
      } else {
        showNotification("Member not found");
      }
    }
  } catch (error) {
    console.error("Error removing member:", error);
    showNotification("Error removing member. Please try again.");
  }
}

function openChangeRoleModal(inventoryId, email, currentRole) {
  const modalId = `change-role-modal-${Date.now()}`;
  const modalHtml = `
    <div id="${modalId}" class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h3 class="modal-title">Change Role for ${email}</h3>
          <button class="modal-close" onclick="document.getElementById('${modalId}').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Current Role: ${currentRole}</label>
            <select id="newRoleSelect" class="form-input">
              <option value="Editor" ${
                currentRole === "Editor" ? "selected" : ""
              }>Editor</option>
              <option value="Viewer" ${
                currentRole === "Viewer" ? "selected" : ""
              }>Viewer</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" onclick="document.getElementById('${modalId}').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="window.confirmChangeRole('${inventoryId}', '${email}', '${currentRole}')">Save Changes</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);

  window.confirmChangeRole = (inventoryId, email, oldRole) => {
    const newRole = document.getElementById("newRoleSelect").value;
    if (newRole && (newRole === "Editor" || newRole === "Viewer")) {
      document.getElementById(modalId).remove();
      changeMemberRole(inventoryId, email, oldRole, newRole);
    }
  };
}

async function changeMemberRole(inventoryId, email, oldRole, newRole) {
  try {
    const inventoryRef = doc(db, "InventoryWorkspace", inventoryId);
    const inventorySnap = await getDoc(inventoryRef);

    if (inventorySnap.exists()) {
      const data = inventorySnap.data();
      const sharedWith = data.sharedWith || [];

      // Find the exact member object to remove
      const memberToUpdate = sharedWith.find(
        (member) => member.email === email && member.role === oldRole
      );

      if (memberToUpdate) {
        // Remove old role and add new role
        await updateDoc(inventoryRef, {
          sharedWith: arrayRemove(memberToUpdate),
        });

        await updateDoc(inventoryRef, {
          sharedWith: arrayUnion({
            ...memberToUpdate,
            role: newRole,
            updatedAt: new Date().toISOString(),
          }),
        });

        // Reload the modal
        const membersList = document.getElementById("membersList");
        if (membersList) {
          await loadExistingMembers(inventoryId, membersList);
        }

        showNotification("Role changed successfully");
      } else {
        showNotification("Member not found");
      }
    }
  } catch (error) {
    console.error("Error changing role:", error);
    showNotification("Error changing role. Please try again.");
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function showNotification(message) {
  const notification = document.createElement("div");
  notification.className =
    "fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg z-50";
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

function generateShareModal() {
  const modalHtml = `
    <div id="shareProductListModal" class="modal-overlay hidden">
      <div class="modal-container">
        <div class="modal-header">
          <h3 class="modal-title" id="modalTitle">Allow Access</h3>
          <button class="modal-close" id="closeShareModalBtn">✕</button>
        </div>
        <div class="modal-body">
          <form id="shareForm">
            <div class="flex gap-4 items-end">
              <div class="form-group flex-1">
                <label class="form-label">Email address</label>
                <input type="email" id="shareEmail" class="form-input" placeholder="Enter email address" required autocomplete="off" style="text-overflow: clip; white-space: nowrap; overflow-x: auto; min-width: 0; width: 100%;" />
              </div>
              <div class="form-group w-40">
                <label class="form-label">Role</label>
                <select id="shareRole" class="form-input" required>
                  <option value="">Select role</option>
                  <option value="Editor">Editor</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Existing members</label>
              <div id="membersList" class="members-list">
                <div class="text-center py-4 text-gray-500">
                  <p>Loading members...</p>
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

  // Add global functions for member management
  window.toggleMemberMenu = function (menuId) {
    const menu = document.getElementById(menuId);
    if (menu) {
      // Close all other dropdowns first
      closeAllMemberMenus();

      // Toggle the clicked menu
      menu.classList.toggle("hidden");

      // Prevent the click from bubbling up to document
      event.stopPropagation();
    }
  };

  window.removeMember = removeMember;
  window.openChangeRoleModal = openChangeRoleModal;

  // Function to close all member dropdown menus
  function closeAllMemberMenus() {
    const allMenus = document.querySelectorAll('[id^="member-menu-"]');
    allMenus.forEach((menu) => {
      menu.classList.add("hidden");
    });
  }

  // Add click listener to close dropdowns when clicking outside
  document.addEventListener("click", function handleClickOutside(event) {
    // Check if click is outside any dropdown menu and outside any menu trigger button
    const isClickInsideMenu = event.target.closest('[id^="member-menu-"]');
    const isClickOnMenuButton = event.target.closest(
      'button[onclick*="toggleMemberMenu"]'
    );

    if (!isClickInsideMenu && !isClickOnMenuButton) {
      closeAllMemberMenus();
    }
  });

  // Add modal to DOM
  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

// Debug helper
console.log("ShareProductListModal module loaded");
window.debugShareModal = {
  open: openShareProductListModal,
  test: () => {
    console.log("Test function working");
    openShareProductListModal("test-inventory", () => {});
  },
};
