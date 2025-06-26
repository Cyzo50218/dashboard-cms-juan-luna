/**
 * @file tasks.js
 * @description A "sub-router" that controls the tasks section.
 * It dynamically loads content for its own internal tabs (List, Board, etc.).
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  runTransaction,
  collectionGroup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

import { openShareModal } from '/dashboard/components/shareProjectModel.js';

// [NEW] Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

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
    // Inside your export function init(params)

// --- 1. Get Parameters and DOM Elements ---
const { tabId = 'list', accountId, projectId } = params;

const projectName = document.getElementById('project-name');
const projectIconColor = document.getElementById('project-color');

const tabs = document.querySelectorAll('.tab-link');


    
    const customizeButton = document.querySelector('.customize-btn');

/**
 * Sets a random Lucide icon on a specified icon element.
 * @param {HTMLElement} iconContainer - The parent element that holds the icon glyph.
 */
function setRandomProjectIcon(iconContainer) {
    // 1. Define a list of miscellaneous Lucide icon names you like.
    // You can find more at https://lucide.dev/
    const miscellaneousIcons = [
        'anchor', 'archive', 'award', 'axe', 'banknote', 'beaker', 'bell',
        'bomb', 'book', 'box', 'briefcase', 'building', 'camera', 'candy',
        'clapperboard', 'clipboard', 'cloud', 'compass', 'cpu', 'crown',
        'diamond', 'dice-5', 'drafting-compass', 'feather', 'flag', 'flame',
        'folder', 'gem', 'gift', 'graduation-cap', 'hammer', 'hard-hat',
        'heart-pulse', 'key-round', 'landmark', 'layers', 'leaf', 'lightbulb',
        'map', 'medal', 'mouse-pointer', 'package', 'palette', 'plane',
        'puzzle', 'rocket', 'shield', 'ship', 'sprout', 'star', 'swords',
        'ticket', 'tractor', 'trophy', 'umbrella', 'wallet', 'wrench'
    ];
    
    // 2. Find the icon element within the provided container.
    // This makes the function reusable for any icon you want to randomize.
    const iconGlyph = iconContainer.querySelector('.project-icon-glyph');
    if (!iconGlyph) {
        console.error("Could not find the '.project-icon-glyph' element inside the container.");
        return;
    }
    
    // 3. Pick a random icon name from the list.
    const randomIndex = Math.floor(Math.random() * miscellaneousIcons.length);
    const randomIconName = miscellaneousIcons[randomIndex];
    
    // 4. Update the data-lucide attribute on the icon element.
    iconGlyph.setAttribute('data-lucide', randomIconName);
    
    // 5. Tell the Lucide library to render the new icon.
    // This is a crucial step.
    lucide.createIcons();
}

/**
 * Converts an HSL color string to a HEX color string.
 * Example: "hsl(210, 40%, 96%)" will be converted to "#f0f5f9"
 * @param {string} hslString The HSL color string.
 * @returns {string} The equivalent HEX color string.
 */
function hslStringToHex(hslString) {
    // Use a regular expression to extract the H, S, L values.
    const hslValues = hslString.match(/\d+/g);
    if (!hslValues || hslValues.length < 3) {
        console.error("Invalid HSL string format:", hslString);
        return null; // Return null or a default color
    }
    
    let h = parseInt(hslValues[0]);
    let s = parseInt(hslValues[1]);
    let l = parseInt(hslValues[2]);
    
    // The conversion formula
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        // Convert to 0-255 range, then to a 2-digit hex string
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    
    return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Fetches the data for the currently selected project in a single, one-time read.
 * uses the robust 'selectedProjectId' method.
 */
async function fetchCurrentProjectData() {
    const user = auth.currentUser;
    if (!user) {
        console.error("fetchCurrentProjectData failed: User not authenticated.");
        throw new Error("User not authenticated.");
    }
    
    // 1. Find the user's selected workspace (No changes here, this is correct).
    const workspaceQuery = query(
        collection(db, `users/${user.uid}/myworkspace`),
        where("isSelected", "==", true)
    );
    const workspaceSnapshot = await getDocs(workspaceQuery);
    
    if (workspaceSnapshot.empty) {
        console.warn("fetchCurrentProjectData: No selected workspace found for this user.");
        throw new Error("No selected workspace found.");
    }
    
    const workspaceDoc = workspaceSnapshot.docs[0];
    const workspaceId = workspaceDoc.id;
    const workspaceData = workspaceDoc.data();
    
    // 2. Get the target project ID from the workspace data (No changes here).
    const selectedProjectId = workspaceData.selectedProjectId;
    if (!selectedProjectId) {
        console.warn("fetchCurrentProjectData: The active workspace does not have a selected project.");
        throw new Error("No selected project found.");
    }
    
    // --- REFACTORED LOGIC ---
    // 3. Directly get the project from the TOP-LEVEL 'projects' collection.
    // This is more efficient than a collectionGroup query.
    const projectRef = doc(db, 'projects', selectedProjectId);
    const projectDoc = await getDoc(projectRef);

    // IMPORTANT: Manually verify existence and membership, since we are not using a query's 'where' clause.
    if (!projectDoc.exists() || !projectDoc.data().memberUIDs?.includes(user.uid)) {
        console.error(`fetchCurrentProjectData: Could not find project with ID '${selectedProjectId}' in the top-level collection, or user lacks permission.`);
        throw new Error("Selected project not found or permission denied.");
    }
    
    // 4. Return all the necessary data.
    console.log(`[fetchCurrentProjectData] Successfully fetched project: ${projectDoc.data().title}`);
    return {
        data: projectDoc.data(),
        projectId: projectDoc.id,
        workspaceId, // The ID of the user's active workspace
        projectPath: projectDoc.ref.path // Returning the full path is very useful
    };
}

fetchCurrentProjectData()
    .then(({ data, projectId, workspaceId }) => {
        const user = auth.currentUser;
        if (!user) return;


        if (projectName && data.title) {
           const currentUserRoleInfo = data.members.find(member => member.uid === user.uid);
const userRole = currentUserRoleInfo ? currentUserRoleInfo.role : null;
const canEditTitle = (data.project_super_admin_uid === user.uid) || (data.project_super_admin_uid === user.uid) || (userRole === 'Project admin');

projectName.textContent = data.title;

if (canEditTitle) {
    // --- UI for Admins ---
    // If the user has permission, make the element editable.
    console.log("User has permission to edit title. Enabling editor.");
    projectName.contentEditable = true;
    projectName.style.cursor = "text";

} else {
    // --- UI for Other Members (Editors, Viewers, etc.) ---
    // If the user does NOT have permission, ensure it is read-only.
    console.log("User does not have permission to edit title. Setting as read-only.");
    projectName.contentEditable = false;
    projectName.style.cursor = "default";
    projectName.title = data.title; // Tooltip just shows the full title
}

            // Event listener to save on blur or Enter key
            const saveTitle = async () => {
    const newTitle = projectName.textContent.trim();

    // Don't update if title is empty or unchanged
    if (!newTitle || newTitle === data.title) {
        return; 
    }

    // --- 1. Define references to BOTH document locations ---

    // Reference to the shared, TOP-LEVEL project (the source of truth)
    const topLevelProjectRef = doc(db, 'projects', projectId);

    // Reference to the private, NESTED project (for backward compatibility)
    const nestedProjectRef = doc(
        db,
        `users/${user.uid}/myworkspace/${workspaceId}/projects`,
        projectId
    );

    try {
        // --- 2. Use a transaction to update both documents atomically ---
        await runTransaction(db, async (transaction) => {
            
            // First, update the top-level document. Your security rules will check this action.
            transaction.update(topLevelProjectRef, { title: newTitle });

            // Second, also update the nested copy to keep everything in sync.
            transaction.update(nestedProjectRef, { title: newTitle });
        });

        console.log("Project title updated successfully in both locations.");

    } catch (err) {
        // --- 3. Catch errors, including permission denied from security rules ---
        console.error("Failed to update project title:", err);
        alert("Update failed. You may not have permission to rename this project.");
    }
};

            // Save on blur
            projectName.addEventListener("blur", saveTitle);

            // Save on Enter key (and prevent new line)
            projectName.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault(); // Prevent newline
                    projectName.blur(); // Triggers blur and saves
                }
            });
        }
            if (projectIconColor && data.color) {
    // First, convert the HSL string from data.color to a HEX string
    const hexColor = hslStringToHex(data.color);
    
    // Then, use the resulting HEX color
    projectIconColor.style.backgroundColor = hexColor;

    setRandomProjectIcon(projectIconColor);
}
    })
    .catch((err) => {
        console.error("Failed to load project header data:", err);
        const projectName = document.getElementById("project-name");
        if (projectName) {
            projectName.textContent = "Error Loading Project";
            projectName.style.color = "red";
        }
    });


    // Find the share button
const shareButton = document.getElementById('share-project-btn');

    // Call the new, imported function and pass the event 'e'
    shareButton.addEventListener('click', (e) => {
        openShareModal(e);
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

