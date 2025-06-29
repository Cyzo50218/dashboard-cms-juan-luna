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
    getDoc,
    query,
    where,
    getDocs,
    doc,
    updateDoc,
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

let titleBlurListener = null;
let titleEnterListener = null;
/**
 * Main initialization function for the entire tasks section.
 * @param {object} params - Route parameters from the main router.
 * @returns {function} The main cleanup function for the tasks section.
 */

export function init(params) {
    // [FIX 1] Declare variables at the top of the function's scope.
    // This is crucial for currentTabCleanup to be accessible by all inner functions.
    let currentTabCleanup = null;
    let tabClickListener = null;
    let projectRef = null;

    // --- 1. Get Parameters and DOM Elements ---
    // Inside your export function init(params)

    // --- 1. Get Parameters and DOM Elements ---
    const { tabId = 'list', accountId, projectId } = params;

    const projectName = document.getElementById('project-name');
    const projectIconColor = document.getElementById('project-color');
    const shareButton = document.getElementById('share-project-btn');
    const avatarStackContainer = document.getElementById('project-header-members');

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
    /**
 * Fetches the data and reference for the currently selected project.
 */
    async function fetchCurrentProjectData() {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated.");

        // 1. Find the selected workspace to get the selectedProjectId
        const workspaceQuery = query(collection(db, `users/${user.uid}/myworkspace`), where("isSelected", "==", true));
        const workspaceSnapshot = await getDocs(workspaceQuery);
        if (workspaceSnapshot.empty) throw new Error("No selected workspace found.");

        const workspaceDoc = workspaceSnapshot.docs[0];
        const workspaceData = workspaceDoc.data();
        const selectedProjectId = workspaceData.selectedProjectId;
        if (!selectedProjectId) throw new Error("No selected project found in workspace.");

        // 2. Find the project document using a secure collectionGroup query
        const projectQuery = query(
            collectionGroup(db, 'projects'),
            where('projectId', '==', selectedProjectId),
            where('memberUIDs', 'array-contains', user.uid)
        );
        const projectSnapshot = await getDocs(projectQuery);
        if (projectSnapshot.empty) throw new Error("Selected project not found or permission denied.");

        const projectDoc = projectSnapshot.docs[0];

        // 3. Return all the necessary data, including the reference itself
        return {
            data: projectDoc.data(),
            projectId: projectDoc.id,
            workspaceId: workspaceDoc.id,
            projectRef: projectDoc.ref // <-- THE KEY ADDITION
        };
    }

    async function fetchMemberProfiles(uids) {
        if (!uids || uids.length === 0) return [];
        try {
            // Fetch multiple documents efficiently with one request per document.
            const userPromises = uids.map(uid => getDoc(doc(db, `users/${uid}`)));
            const userDocs = await Promise.all(userPromises);
            return userDocs.filter(d => d.exists()).map(d => ({ uid: d.id, ...d.data() }));
        } catch (error) {
            console.error("Error fetching member profiles:", error);
            return [];
        }
    }

    /**
 * Creates the HTML for a stack of user avatars using <img> tags for better control.
 * @param {string[]} assigneeIds - An array of user UIDs.
 * @param {object[]} allUsers - The array of all project members' full profiles.
 * @returns {string} The complete HTML string for the avatar stack.
 */
    function createAvatarStackHTML(assigneeIds, allUsers) {
        if (!assigneeIds || assigneeIds.length === 0) {
            return '';
        }

        const maxVisible = 5;
        let visibleAssignees = assigneeIds;
        let overflowCount = 0;

        if (assigneeIds.length > maxVisible) {
            visibleAssignees = assigneeIds.slice(0, maxVisible - 1);
            overflowCount = assigneeIds.length - (maxVisible - 1);
        }

        const avatarsHTML = visibleAssignees.map((userId, index) => {
            const user = allUsers.find(u => u.uid === userId);
            if (!user) return '';

            const zIndex = 50 - index;

            // --- THE FIX IS HERE ---
            if (user.avatar && user.avatar.startsWith('https://')) {
                // Use a real <img> tag for better scaling and centering.
                // The parent div provides the circular shape.
                return `
                <div class="user-avatar-tasks" title="${user.name}" style="z-index: ${zIndex};">
                    <img src="${user.avatar}" alt="${user.name}">
                </div>`;
            } else {
                // The fallback for initials remains the same.
                const initials = (user.name || '?').split(' ').map(n => n[0]).join('').substring(0, 2);
                const bgColor = '#' + (user.uid || '000000').substring(0, 6);
                return `<div class="user-avatar-tasks" title="${user.name}" style="background-color: ${bgColor}; color: white; z-index: ${zIndex};">${initials}</div>`;
            }
        }).join('');

        let overflowHTML = '';
        if (overflowCount > 0) {
            const zIndex = 50 - maxVisible;
            overflowHTML = `<div class="user-avatar-tasks overflow" style="z-index: ${zIndex};">+${overflowCount}</div>`;
        }

        return `<div class="avatar-stack">${avatarsHTML}${overflowHTML}</div>`;
    }


    async function loadProjectHeader() {
        try {
            // Step 1: Fetch the project data and store the reference.
            const projectContext = await fetchCurrentProjectData();
            projectRef = projectContext.projectRef; // <-- Storing the correct reference

            const { data, projectId, workspaceId } = projectContext;
            const user = auth.currentUser;
            if (!user) return;

            // Step 2: Render the UI with the fetched data.
            if (projectName && data.title) {
                const members = data.members || [];
                const memberUIDs = data.members?.map(m => m.uid) || [];
                const allUsers = await fetchMemberProfiles(memberUIDs); // Assuming fetchMemberProfiles is in scope

                // Render the avatar stack if the container exists
                const avatarStackContainer = document.getElementById('project-header-members');
                if (avatarStackContainer) {
                    avatarStackContainer.innerHTML = createAvatarStackHTML(memberUIDs, allUsers);
                }

                // Your permission logic remains the same
                const isMemberWithEditPermission = members.some(m => m.uid === user.uid && m.role === "Project admin" && m.role === "Project Admin");
                const isSuperAdmin = data.project_super_admin_uid === user.uid;
                const isAdminUser = data.project_admin_user === user.uid;
                const userCanEdit = isMemberWithEditPermission || isSuperAdmin || isAdminUser;

                projectName.textContent = data.title;

                // Conditionally set UI properties based on permissions
                if (userCanEdit) {
                    projectName.contentEditable = true;
                    projectName.style.cursor = "text";
                    projectName.title = "Click to edit project name";
                    shareButton.classList.remove('display-none');
                } else {
                    projectName.contentEditable = false;
                    projectName.style.cursor = "default";
                    projectName.title = "";
                    shareButton.classList.add('display-none');
                }

                // Remove any lingering listeners from previous page loads to prevent errors.
                if (titleBlurListener) {
                    projectName.removeEventListener("blur", titleBlurListener);
                }
                if (titleEnterListener) {
                    projectName.removeEventListener("keydown", titleEnterListener);
                }

                // Only attach listeners if the user has permission.
                if (userCanEdit) {
                    // This listener handles the logic of saving the new title.
                    titleBlurListener = async () => {
                        const newTitle = projectName.textContent.trim();
                        const originalTitle = data.title; // Use title from the initial load

                        // If title is empty or unchanged, revert to original and do nothing.
                        if (!newTitle || newTitle === originalTitle) {
                            projectName.textContent = originalTitle;
                            return;
                        }

                        try {
                            const user = auth.currentUser;
                            if (!user) throw new Error("User not authenticated for update.");

                            // Step 1: Find the user's currently selected workspace to get the correct Project ID.
                            const workspaceQuery = query(collection(db, `users/${user.uid}/myworkspace`), where("isSelected", "==", true));
                            const workspaceSnapshot = await getDocs(workspaceQuery);
                            if (workspaceSnapshot.empty) throw new Error("No selected workspace found.");

                            const selectedProjectId = workspaceSnapshot.docs[0].data().selectedProjectId;
                            if (!selectedProjectId) throw new Error("No project is selected in the workspace.");

                            // Step 2: Find the specific project document using the ID we just found.
                            const projectQuery = query(
                                collectionGroup(db, 'projects'),
                                where('projectId', '==', selectedProjectId),
                                where('memberUIDs', 'array-contains', user.uid)
                            );
                            const projectSnapshot = await getDocs(projectQuery);
                            if (projectSnapshot.empty) throw new Error("Project to update not found or permission denied.");

                            const projectToUpdateRef = projectSnapshot.docs[0].ref;

                            // Step 3: Perform the update on the document we just confirmed is the correct one.
                            await updateDoc(projectToUpdateRef, { title: newTitle });

                            console.log(`Project title updated to "${newTitle}" for projectId: ${selectedProjectId}`);
                            data.title = newTitle; // Update local state to match the new title

                        } catch (err) {
                            console.error("Failed to update project title:", err);
                            projectName.textContent = originalTitle; // Revert on error
                            _200d_
                        }
                    };

                    // This listener just triggers the save when Enter is pressed.
                    titleEnterListener = (e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            projectName.blur(); // Trigger the blur event to save.
                        }
                    };

                    // Attach the new listeners.
                    projectName.addEventListener("blur", titleBlurListener);
                    projectName.addEventListener("keydown", titleEnterListener);
                }
            }

            // Project Icon Color logic remains the same
            if (projectIconColor && data.color) {
                const hexColor = hslStringToHex(data.color);
                projectIconColor.style.backgroundColor = hexColor;
                setRandomProjectIcon(projectIconColor);
            }
        } catch (err) {
            console.error("Failed to load project header data:", err);
            if (projectName) {
                projectName.textContent = "Error Loading Project";
                projectName.style.color = "red";
            }
        }
    }


    // Call the new, imported function and pass the event 'e'
    shareButton.addEventListener('click', async () => {
        const projectContext = await fetchCurrentProjectData();
        projectRef = projectContext.projectRef; // <-- Storing the correct reference

        const { data, projectId, workspaceId } = projectContext;

        if (projectRef) {
            // We call the imported function directly. It's guaranteed to exist.
            openShareModal(projectRef);
        } else {
            console.error("Cannot open share modal: projectRef is not defined.");
        }
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
    loadProjectHeader();
    // --- 5. Return the Main Cleanup Function ---
    // This cleans up the tasks section itself when navigating away (e.g., to 'home').
    // NEW, CORRECTED CODE
    return function cleanup() {
        console.log("Cleaning up 'tasks' section and its active tab...");

        // Clean up the last active tab's JS module
        if (typeof currentTabCleanup === 'function') {
            currentTabCleanup();
        }

        // Clean up the listeners for the main tabs
        tabs.forEach(tab => tab.removeEventListener('click', tabClickListener));

        // Clean up the project title listeners to prevent stale updates
        const projectNameEl = document.getElementById('project-name');
        if (projectNameEl) {
            if (titleBlurListener) {
                projectNameEl.removeEventListener('blur', titleBlurListener);
            }
            if (titleEnterListener) {
                projectNameEl.removeEventListener('keydown', titleEnterListener);
            }
        }
    };
}

