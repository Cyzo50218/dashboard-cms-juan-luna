// File: /dashboard/myworkspace/myworkspace.js

/**
 * Initializes the 'My Workspace' section, encapsulating all its logic.
 * Returns a cleanup function to be called by the router when navigating away.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, runTransaction,
    doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";
import { showInviteModal } from '/dashboard/components/showEmailModel.js';


// --- 2. FIREBASE INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

export function init(params) {
    console.log("My Workspace section initialized.");

    // [1] Use an AbortController for easy and reliable event listener cleanup.
    const controller = new AbortController();

    // [2] Get the main container for this section to scope all queries.
    const workspaceSection = document.querySelector('div[data-section="myworkspace"]');
    if (!workspaceSection) {
        console.error('My Workspace section container not found!');
        return () => {}; // Return an empty cleanup function.
    }
    // --- LOGIC FOR FUNCTIONALITY WITHIN THE WORKSPACE ---

    // ==================================================
    // EDITABLE TEAM DESCRIPTION LOGIC
    // ==================================================
    const descriptionContainer = workspaceSection.querySelector('#description-container');
    const teamDescription = workspaceSection.querySelector('#team-description');

    if (descriptionContainer && teamDescription) {
        const placeholderText = "Click to add team description...";
        if (!teamDescription.textContent.trim()) {
            teamDescription.textContent = placeholderText;
        }

        // Define the handler function separately.
        const handleEditDescriptionClick = () => {
            const currentText = teamDescription.textContent.trim() === placeholderText ? "" : teamDescription.textContent.trim();
            const editor = document.createElement('textarea');
            editor.id = 'description-editor';
            editor.value = currentText;
            descriptionContainer.replaceChild(editor, teamDescription);
            editor.focus();

            const saveChanges = () => {
                let newText = editor.value.trim();
                teamDescription.textContent = newText === "" ? placeholderText : newText;
                // Important: Check if the editor is still in the DOM before replacing
                if (editor.parentNode === descriptionContainer) {
                    descriptionContainer.replaceChild(teamDescription, editor);
                }
            };

            // NOTE: Listeners on dynamically created elements that are then removed
            // from the DOM are automatically garbage collected. No need to add these
            // to the main AbortController.
            editor.addEventListener('blur', saveChanges);
            editor.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    editor.blur(); // Triggers the 'blur' event to save.
                }
            });
        };

        // [3] Attach persistent event listeners using the controller's signal.
        teamDescription.addEventListener('click', handleEditDescriptionClick, { signal: controller.signal });
    }

    // ==================================================
    // ADD STAFF MEMBERS LOGIC
    // ==================================================
    const addStaffBtn = workspaceSection.querySelector('#add-staff-btn');
    if (addStaffBtn) {
        addStaffBtn.addEventListener('click', async () => {
    console.log("Invite button clicked, opening modal...");
    const result = await showInviteModal();
    if (result) {
        console.log("Invitation details:", result);
    } else {
        console.log("Modal was closed without sending an invitation.");
    }
});
    }

    // ==================================================
    // OTHER INTERACTIVITY HANDLERS
    // ==================================================
    const inviteBtn = workspaceSection.querySelector('#invite-btn');
    if (inviteBtn) {
        inviteBtn.addEventListener('click', async () => {
    console.log("Invite button clicked, opening modal...");
    const result = await showInviteModal();
    if (result) {
        console.log("Invitation details:", result);
    } else {
        console.log("Modal was closed without sending an invitation.");
    }
});
    }

    const createWorkBtn = workspaceSection.querySelector('#create-work-btn');
    if (createWorkBtn) {
        createWorkBtn.addEventListener('click', () => alert('Create work dropdown clicked!'), { signal: controller.signal });
    }

    const createTaskBtn = workspaceSection.querySelector('#create-task-btn');
    if (createTaskBtn) {
        createTaskBtn.addEventListener('click', () => alert('Add Task button clicked!'), { signal: controller.signal });
    }


    // [4] The cleanup function is returned to the router.
    // It will be called when the user navigates away from this section.
    return function cleanup() {
        console.log("Cleaning up 'My Workspace' section listeners...");

        // This single line removes ALL event listeners added with this controller's signal.
        controller.abort();
    };
}
