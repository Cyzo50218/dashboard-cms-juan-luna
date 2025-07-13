import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    updateDoc,
    getDoc,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

// --- Global State ---
let isModalOpen = false;
let modal = null;
let unsubscribeInventoryListener = null;

/**
 * Closes the modal, performs cleanup, and resets state.
 */
function closeModal() {
    if (unsubscribeInventoryListener) {
        unsubscribeInventoryListener(); // Stop listening to Firestore updates
        unsubscribeInventoryListener = null;
    }
    isModalOpen = false;
    document.getElementById("access-modal-backdrop")?.remove();
    document.getElementById("access-modal-styles")?.remove();
}

/**
 * Opens and populates the inventory access modal.
 * @param {string} inventoryId The document UID of the inventory item.
 */
export async function openInventoryModal(inventoryId) {
    if (!inventoryId) return alert("Error: Inventory ID not specified.");
    if (isModalOpen) return;
    isModalOpen = true;
    
    // --- Create the basic UI structure ---
    createModalUI();
    modal = document.querySelector(".access-modal");
    const modalBody = document.querySelector(".access-modal-body");
    modal.classList.remove("hidden");
    
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated.");
        
        // --- Construct the correct Firestore path for the inventory item ---
        const inventoryRef = doc(db, 'Inventory', inventoryId);
        
        // --- Real-time listener for inventory data ---
        unsubscribeInventoryListener = onSnapshot(inventoryRef, async (inventoryDocSnap) => {
            if (!inventoryDocSnap.exists()) {
                alert("This inventory item has been deleted.");
                closeModal();
                return;
            }
            
            const inventoryData = inventoryDocSnap.data();
            // --- Get the inventory name from the specified field path: details.name ---
            const inventoryName = inventoryData.details?.name || "Unnamed Inventory";
            const memberUIDs = (inventoryData.members || []).map((m) => m.uid);
            
            // --- Fetch profiles for all members ---
            const userProfilePromises = memberUIDs.map(uid => getDoc(doc(db, "users", uid)));
            const userProfileDocs = await Promise.all(userProfilePromises);
            const userProfilesMap = userProfileDocs.reduce((acc, docSnap) => {
                if (docSnap.exists()) acc[docSnap.id] = docSnap.data();
                return acc;
            }, {});
            
            // --- Render the content and set up listeners ---
            renderDynamicContent(modal, { inventoryData, inventoryName, userProfilesMap });
            setupEventListeners(modal, inventoryRef);
        });
        
    } catch (error) {
        console.error("openInventoryModal error:", error);
        if (modalBody) {
            modalBody.innerHTML = `<p class="access-modal-error-message">Could not load access details. Reason: ${error.message}</p>`;
        }
    }
}

/**
 * Handles the checking/unchecking of the "Can be viewed" checkbox.
 * @param {HTMLInputElement} checkbox The checkbox element that was changed.
 * @param {DocumentReference} inventoryRef A Firestore reference to the current inventory item.
 */
async function handlePermissionChange(checkbox, inventoryRef) {
    const memberUid = checkbox.dataset.uid;
    const isChecked = checkbox.checked;
    
    if (!memberUid) return;
    
    checkbox.disabled = true; // Prevent rapid clicking
    
    try {
        const inventorySnap = await getDoc(inventoryRef);
        if (!inventorySnap.exists()) throw new Error("Inventory item not found.");
        
        const originalMembers = inventorySnap.data().members || [];
        let memberFound = false;
        
        // Use map to create a new array with the updated member data
        const updatedMembers = originalMembers.map(member => {
            if (member.uid === memberUid) {
                memberFound = true;
                // Update the 'canBeViewed' property based on checkbox state
                return { ...member, canBeViewed: isChecked };
            }
            return member;
        });
        
        if (memberFound) {
            // Atomically update the entire 'members' array in the Firestore document
            await updateDoc(inventoryRef, { members: updatedMembers });
            console.log(`Successfully updated view permission for ${memberUid} to ${isChecked}.`);
        } else {
            console.error("Could not find the member in the list to update.");
        }
    } catch (error) {
        console.error("Failed to update view permission:", error);
        alert("An error occurred while saving. Please try again.");
        checkbox.checked = !isChecked; // Revert checkbox on error
    } finally {
        checkbox.disabled = false; // Re-enable the checkbox
    }
}

/**
 * Sets up all event listeners for the modal.
 * @param {HTMLElement} modal The modal element.
 * @param {DocumentReference} inventoryRef A Firestore reference to the current inventory item.
 */
function setupEventListeners(modal, inventoryRef) {
    // --- Master Change Listener (Event Delegation for checkboxes) ---
    modal.addEventListener('change', (e) => {
        if (e.target.matches('.access-modal-view-checkbox')) {
            handlePermissionChange(e.target, inventoryRef);
        }
    });
    
    // --- Click Listeners ---
    modal.querySelector("#access-modal-close-btn").addEventListener("click", closeModal);
    document.getElementById("access-modal-backdrop").addEventListener("click", (e) => {
        if (e.target.id === "access-modal-backdrop") {
            closeModal();
        }
    });
}

/**
 * Renders the dynamic content (workspace role and member list) inside the modal.
 * @param {HTMLElement} modal The modal element.
 * @param {object} data The data needed for rendering.
 */
function renderDynamicContent(modal, { inventoryData, inventoryName, userProfilesMap }) {
    const state = {
        members: inventoryData.members || [],
        workspaceRole: inventoryData.workspaceRole || "Viewer",
    };
    
    let membersHTML = "";
    
    // --- 1. Render the "My Workspace" static item ---
    const workspaceIconHTML = `<div class="access-modal-profile-pic access-modal-workspace-icon"><i class="material-icons">people</i></div>`;
    membersHTML += `
<div class="access-modal-member-item">
 ${workspaceIconHTML}
 <div class="access-modal-member-info">
<strong>My Workspace</strong>
<p>${state.members.length} members</p>
 </div>
 <div class="access-modal-member-role-static">${state.workspaceRole}</div>
</div>
 `;
    
    // --- 2. Render the list of Workspace Members with checkboxes ---
    state.members.forEach((member) => {
        const userProfile = userProfilesMap[member.uid] || { name: "Unknown User", email: "No email" };
        const profilePicHTML = createProfilePic(userProfile).outerHTML;
        const isChecked = member.canBeViewed === true ? "checked" : "";
        
        membersHTML += `
 <div class="access-modal-member-item" data-uid="${member.uid}">
${profilePicHTML}
<div class="access-modal-member-info">
 <strong>${userProfile.name}</strong>
 <p>${userProfile.email}</p>
</div>
<div class="access-modal-view-control">
 <label class="access-modal-checkbox-label">
<input type="checkbox" class="access-modal-view-checkbox" data-uid="${member.uid}" ${isChecked}>
<span>Can be viewed</span>
 </label>
</div>
 </div>
`;
    });
    
    // --- Update the DOM ---
    modal.querySelector(".access-modal-header h2").textContent = `Change Inventory "${inventoryName}" Access`;
    modal.querySelector("#access-modal-members-list").innerHTML = membersHTML;
}

/**
 * Creates a profile picture element (avatar or initials).
 * @param {object} profile The user's profile data.
 * @returns {HTMLElement} The generated div element.
 */
function createProfilePic(profile) {
    const profileColors = ["#4A148C", "#004D40", "#BF360C", "#0D47A1", "#4E342E"];
    const pic = document.createElement("div");
    pic.className = "access-modal-profile-pic";
    
    if (profile?.avatar) {
        pic.style.backgroundImage = `url(${profile.avatar})`;
    } else {
        const name = profile?.name || "U";
        pic.textContent = name.split(" ").map(n => n[0]).join("").substring(0, 2);
        const hash = name.split("").reduce((a, b) => ((a = (a << 5) - a + b.charCodeAt(0)), a & a), 0);
        pic.style.backgroundColor = profileColors[Math.abs(hash) % profileColors.length];
    }
    return pic;
}

function createModalUI() {
    const styles = `
.hidden { display: none; }
.access-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.access-modal { background-color: white; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); width: 600px; font-family: 'Inter', sans-serif; max-height: 90vh; display: flex; flex-direction: column; }
.access-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #f0f0f0; }
.access-modal-header h2 { margin: 0; font-size: 18px; font-weight: 600; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.access-modal-icon-btn { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 50%; display: inline-flex; align-items: center; color: #555; }
.access-modal-icon-btn:hover { background-color: #f4f4f4; }
.access-modal-body { padding: 8px 24px 16px; overflow-y: auto; }
.access-modal-members-list { margin-top: 8px; max-height: 50vh; overflow-y: auto; }
.access-modal-member-item { display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
.access-modal-member-item:last-child { border-bottom: none; }
.access-modal-profile-pic { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 500; font-size: 15px; margin-right: 16px; text-transform: uppercase; background-size: cover; background-position: center; flex-shrink: 0; }
.access-modal-workspace-icon { background-color: #e5e7eb; color: #4b5563; }
.access-modal-member-info { flex-grow: 1; }
.access-modal-member-info strong { font-size: 15px; font-weight: 500; color: #111; }
.access-modal-member-info p { font-size: 13px; color: #666; margin: 2px 0 0 0; }
.access-modal-member-role-static { font-size: 14px; color: #555; padding: 8px 12px; }
.access-modal-view-control { display: flex; align-items: center; }
.access-modal-checkbox-label { display: flex; align-items: center; cursor: pointer; font-size: 14px; color: #374151; user-select: none; }
.access-modal-checkbox-label input { margin-right: 8px; width: 16px; height: 16px; cursor: pointer; }
.access-modal-loader { margin: 40px auto; border: 4px solid #f3f3f3; border-radius: 50%; border-top: 4px solid #3498db; width: 40px; height: 40px; animation: spin 1.5s linear infinite; }
.access-modal-error-message { color: #d93025; text-align: center; padding: 20px; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
 `;
    const styleSheet = document.createElement("style");
    styleSheet.id = "access-modal-styles";
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    
    // --- HTML Structure (class names updated) ---
    const modalHTML = `
<div class="access-modal hidden">
 <div class="access-modal-header">
<h2>Loading Access...</h2>
<button id="access-modal-close-btn" class="access-modal-icon-btn"><i class="material-icons">close</i></button>
 </div>
 <div class="access-modal-body">
<div class="access-modal-members-list" id="access-modal-members-list">
 <div class="access-modal-loader"></div>
</div>
</div>
</div>`;
    
    const modalBackdrop = document.createElement("div");
    modalBackdrop.id = "access-modal-backdrop";
    modalBackdrop.className = "access-modal-backdrop";
    modalBackdrop.innerHTML = modalHTML;
    document.body.appendChild(modalBackdrop);
}