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
    setDoc, 
    runTransaction,
    collectionGroup,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";
import { openShareModal } from '/dashboard/components/shareProjectModel.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

// --- Module-Scoped Variables for Cleanup and State ---
let tabClickListener = null;
const buttonListeners = []; // Currently unused, but kept for context
let currentTabCleanup = null; // For the currently loaded SUB-MODULE (the content of a tab like 'list.js')

let titleBlurListener = null;
let titleEnterListener = null;

// Variables for project context within tasks.js
let currentLoadedProjectRef = null; // Will store the DocumentReference of the loaded project
let currentLoadedProjectData = null; // Will store the full data of the loaded project
let currentLoadedProjectMembers = []; // Store fetched member profiles for avatar stack and recent history

/**
 * Main initialization function for the entire tasks section.
 * @param {object} params - Route parameters from the main router.
 * @returns {function} The main cleanup function for the tasks section.
 */
export function init(params) {
    // --- 1. Get Parameters and DOM Elements ---
    const { tabId = 'list', accountId, projectId } = params;

    const projectName = document.getElementById('project-name');
    const projectIconColor = document.getElementById('project-color');
    const shareButton = document.getElementById('share-project-btn');
    const avatarStackContainer = document.getElementById('project-header-members'); // Already declared as a DOM element directly
    const customizeButton = document.querySelector('.customize-btn');
    const tabs = document.querySelectorAll('.tab-link');

    /**
     * Sets a random Lucide icon on a specified icon element.
     * @param {HTMLElement} iconContainer - The parent element that holds the icon glyph.
     */
    function setRandomProjectIcon(iconContainer) {
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
        const iconGlyph = iconContainer.querySelector('.project-icon-glyph');
        if (!iconGlyph) {
            console.error("Could not find the '.project-icon-glyph' element inside the container.");
            return;
        }
        const randomIndex = Math.floor(Math.random() * miscellaneousIcons.length);
        const randomIconName = miscellaneousIcons[randomIndex];
        iconGlyph.setAttribute('data-lucide', randomIconName);
        // Ensure Lucide is globally available or imported if not using CDN
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        } else {
            console.warn("Lucide library not found or createIcons not available.");
        }
    }

    /**
     * Converts an HSL color string to a HEX color string.
     * Example: "hsl(210, 40%, 96%)" will be converted to "#f0f5f9"
     * @param {string} hslString The HSL color string.
     * @returns {string} The equivalent HEX color string.
     */
    function hslStringToHex(hslString) {
        const hslValues = hslString.match(/\d+/g);
        if (!hslValues || hslValues.length < 3) {
            console.error("Invalid HSL string format:", hslString);
            return '#cccccc'; // Return a default color on error
        }
        let h = parseInt(hslValues[0]);
        let s = parseInt(hslValues[1]);
        let l = parseInt(hslValues[2]);

        l /= 100;
        const a = s * Math.min(l, 1 - l) / 100;
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    /**
     * Fetches the data and reference for the currently selected project.
     * This function is crucial as it determines which project's tasks are shown.
     */
    async function fetchCurrentProjectData() {
        const user = auth.currentUser;
        if (!user) {
            console.error("User not authenticated.");
            throw new Error("User not authenticated.");
        }

        // 1. Find the selected workspace ID from the user document
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists() || !userSnap.data().selectedWorkspace) {
            throw new Error("Could not find user's selected workspace from user document.");
        }

        const selectedWorkspaceId = userSnap.data().selectedWorkspace;
        const workspaceRef = doc(db, `users/${user.uid}/myworkspace`, selectedWorkspaceId);
        const workspaceSnapshot = await getDoc(workspaceRef);

        if (!workspaceSnapshot.exists()) {
            throw new Error("No selected workspace document found for user.");
        }

        const workspaceData = workspaceSnapshot.data();
        const selectedProjectId = workspaceData.selectedProjectId;
        if (!selectedProjectId) {
            throw new Error("No project is currently selected in the user's workspace.");
        }

        // 2. Find the project document using a secure collectionGroup query
        // This is necessary because projects are collaborative and might be nested deeply.
        const projectQuery = query(
            collectionGroup(db, 'projects'),
            where('projectId', '==', selectedProjectId),
            where('memberUIDs', 'array-contains', user.uid)
        );
        const projectSnapshot = await getDocs(projectQuery);

        if (projectSnapshot.empty) {
            throw new Error(`Project with ID ${selectedProjectId} not found or user does not have access.`);
        }

        const projectDoc = projectSnapshot.docs[0];

        // 3. Return all the necessary data
        return {
            data: projectDoc.data(), // The project's data (title, color, memberUIDs, etc.)
            projectId: projectDoc.id, // The ID of the project document
            workspaceId: projectDoc.data().workspaceId, // The workspace ID from the project's own data
            projectRef: projectDoc.ref // The actual DocumentReference to the project
        };
    }

    /**
     * Fetches multiple user profiles by their UIDs.
     * @param {string[]} uids - An array of user UIDs.
     * @returns {Promise<Array<Object>>} A promise that resolves to an array of user profile objects.
     */
    async function fetchMemberProfiles(uids) {
        if (!uids || uids.length === 0) return [];
        try {
            const userPromises = uids.map(uid => getDoc(doc(db, `users/${uid}`)));
            const userDocs = await Promise.all(userPromises);
            return userDocs.filter(d => d.exists()).map(d => ({ uid: d.id, ...d.data() }));
        } catch (error) {
            console.error("Error fetching member profiles:", error);
            return [];
        }
    }

    /**
     * Creates the HTML for a stack of user avatars.
     * @param {string[]} assigneeIds - An array of user UIDs.
     * @param {object[]} allUsers - The array of all project members' full profiles (fetched using fetchMemberProfiles).
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
            const displayName = user.displayName || user.name || 'Unknown User';
            const initials = (displayName).split(' ').map(n => n[0]).join('').substring(0, 2);


            if (user.avatarUrl && user.avatarUrl.startsWith('https://')) {
                return `
                <div class="user-avatar-tasks" title="${displayName}" style="z-index: ${zIndex};">
                    <img src="${user.avatarUrl}" alt="${displayName}">
                </div>`;
            } else {
                const bgColor = '#' + (user.uid || '000000').substring(0, 6); // Simple hash based on UID
                return `<div class="user-avatar-tasks" title="${displayName}" style="background-color: ${bgColor}; color: white; z-index: ${zIndex};">${initials}</div>`;
            }
        }).join('');

        let overflowHTML = '';
        if (overflowCount > 0) {
            const zIndex = 50 - maxVisible;
            overflowHTML = `<div class="user-avatar-tasks overflow" style="z-index: ${zIndex};">+${overflowCount}</div>`;
        }

        return `<div class="avatar-stack">${avatarsHTML}${overflowHTML}</div>`;
    }

    /**
     * Stores the currently loaded project's data in the user's recent history.
     * This is called whenever a project page is loaded or reloaded.
     * @param {object} projectData - The data of the project to store.
     * @param {DocumentReference} projectRef - The Firestore reference to the project.
     * @param {Array<Object>} memberProfiles - The enriched profiles of the project members.
     * @param {string} userId - The UID of the current user.
     */
    async function saveProjectToRecentHistory(projectId, projectData, projectRef, memberProfiles, userId) {
        if (!userId || !projectData || !projectRef) {
            console.error("Cannot save project to recent history: Missing user ID, project data, or project reference.");
            return;
        }

        try {
            const userRecentProjectsHistoryRef = collection(db, `users/${userId}/recenthistory`);
            const recentProjectDocRef = doc(userRecentProjectsHistoryRef, projectData.projectId); // Use project ID as doc ID

            // Count documents in each section (tasks within sections)
            const sectionTaskCounts = {};
            const sectionsCollectionRef = collection(projectRef, 'sections');
            const sectionsSnapshot = await getDocs(sectionsCollectionRef); // Fetch all sections

            for (const sectionDoc of sectionsSnapshot.docs) {
                const tasksColRef = collection(sectionDoc.ref, 'tasks');
                const tasksSnapshot = await getDocs(tasksColRef);
                sectionTaskCounts[sectionDoc.id] = tasksSnapshot.size;
            }

            const recentHistoryPayload = {
                projectId: projectId,
                projectName: projectData.title || 'Unknown Project',
                projectColor: projectData.color || '#cccccc',
                projectRef: projectRef, // Store the actual project DocumentReference
                memberUIDs: projectData.memberUIDs || [], // Original array of UIDs
                memberProfiles: memberProfiles, // Enriched profiles
                sectionTaskCounts: sectionTaskCounts, // Tasks count per section
                lastAccessed: serverTimestamp()
            };

            // Use setDoc with { merge: true } to update if exists, create if new
            await setDoc(recentProjectDocRef, recentHistoryPayload, { merge: true });
            console.log(`Project "${projectData.title}" added/updated in recent history.`);
        } catch (error) {
            console.error("Error saving project to recent history:", error);
        }
    }


    async function loadProjectHeader() {
        try {
            // Step 1: Fetch the project data and store the reference.
            const projectContext = await fetchCurrentProjectData();
            currentLoadedProjectRef = projectContext.projectRef; // Store the correct reference
            currentLoadedProjectData = projectContext.data; // Store the full project data

            const { data, projectId, workspaceId } = projectContext;
            const user = auth.currentUser;
            if (!user) return; // Should already be handled by fetchCurrentProjectData, but good safety

            // Step 2: Fetch members for rendering and recent history.
            const memberUIDs = data.memberUIDs || [];
            currentLoadedProjectMembers = await fetchMemberProfiles(memberUIDs); // Store fetched profiles

            // Step 3: Render the UI with the fetched data.
            if (projectName && data.title) {
                if (avatarStackContainer) {
                    avatarStackContainer.innerHTML = createAvatarStackHTML(memberUIDs, currentLoadedProjectMembers);
                }

                // Determine user's edit permission
                const isMemberWithEditPermission = data.members?.some(m => m.uid === user.uid && m.role === "Project Admin");
                const isSuperAdmin = data.project_super_admin_uid === user.uid; // Assuming this field exists
                const isAdminUser = data.project_admin_user === user.uid; // Assuming this field exists
                const userCanEdit = isMemberWithEditPermission || isSuperAdmin || isAdminUser;

                projectName.textContent = data.title;
                projectName.contentEditable = userCanEdit;
                projectName.style.cursor = userCanEdit ? "text" : "default";
                projectName.title = userCanEdit ? "Click to edit project name" : "";
                shareButton.classList.toggle('display-none', !userCanEdit);

                // Clean up previous listeners to prevent duplicates
                if (titleBlurListener) projectName.removeEventListener("blur", titleBlurListener);
                if (titleEnterListener) projectName.removeEventListener("keydown", titleEnterListener);

                if (userCanEdit) {
                    titleBlurListener = async () => {
                        const newTitle = projectName.textContent.trim();
                        const originalTitle = data.title;

                        if (!newTitle || newTitle === originalTitle) {
                            projectName.textContent = originalTitle;
                            return;
                        }

                        try {
                            // Ensure projectRef is still valid and has a path
                            if (!currentLoadedProjectRef || !currentLoadedProjectRef.path) {
                                throw new Error("No valid project reference available for update.");
                            }
                            await updateDoc(currentLoadedProjectRef, { title: newTitle });
                            console.log(`Project title updated to "${newTitle}" for project: ${projectId}`);
                            currentLoadedProjectData.title = newTitle; // Update local data
                        } catch (err) {
                            console.error("Failed to update project title:", err);
                            projectName.textContent = originalTitle; // Revert on error
                        }
                    };

                    titleEnterListener = (e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            projectName.blur();
                        }
                    };

                    projectName.addEventListener("blur", titleBlurListener);
                    projectName.addEventListener("keydown", titleEnterListener);
                }
            }

            if (projectIconColor && data.color) {
                const hexColor = hslStringToHex(data.color);
                projectIconColor.style.backgroundColor = hexColor;
                setRandomProjectIcon(projectIconColor);
            }

            // --- SAVE TO RECENT HISTORY AFTER LOADING PROJECT HEADER ---
            // Now that we have all the project data and member profiles, save it.
            await saveProjectToRecentHistory(
                projectId,
                currentLoadedProjectData,
                currentLoadedProjectRef,
                currentLoadedProjectMembers,
                user.uid // Pass current user's UID
            );

        } catch (err) {
            console.error("Failed to load project header data:", err);
            if (projectName) {
                projectName.textContent = "Error Loading Project";
                projectName.style.color = "red";
            }
            // Potentially redirect to a dashboard or error page if project loading fails
        }
    }


    // Share button event listener (uses currentLoadedProjectRef)
    shareButton.addEventListener('click', async () => {
        // Ensure currentLoadedProjectRef is set before opening the modal
        if (currentLoadedProjectRef) {
            openShareModal(currentLoadedProjectRef);
        } else {
            console.error("Cannot open share modal: No project is currently loaded.");
            alert("Please load a project first.");
        }
    });

/**
 * Dynamically loads the HTML, CSS, and JS for a specific tab.
 * @param {string} targetTabId - The ID of the tab to load (e.g., 'list', 'board').
 */
async function loadTabContent(targetTabId) {
    // Cleanup any previously loaded tab's JS module and its listeners
    if (currentTabCleanup) {
        currentTabCleanup();
        currentTabCleanup = null;
    }
    
    const container = document.getElementById('tab-content-container');
    if (!container) {
        console.error("Tab content container not found!");
        return;
    }
    
    // IMMEDIATELY show a loading message/spinner
    container.innerHTML = `
        <div class="section-loader">
            <p>Loading ${targetTabId} tab...</p>
            <div class="spinner"></div> </div>
    `;
    
    // Remove old tab-specific CSS before loading new one
    document.getElementById('tab-specific-css')?.remove();
    
    const htmlPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.html`;
    const cssPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.css`;
    // Add a cache-busting parameter to the JS path to ensure fresh load during development
    const jsPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.js?v=${new Date().getTime()}`;
    
    try {
        // Fetch all resources concurrently using Promise.all
        const [htmlRes, cssRes, tabModule] = await Promise.all([
            fetch(htmlPath),
            fetch(cssPath),
            import(jsPath) // Dynamically import the JS module
        ]);
        
        // Check HTML response
        if (!htmlRes.ok) {
            throw new Error(`HTML not found for tab: ${targetTabId} (Status: ${htmlRes.status})`);
        }
        const tabHtml = await htmlRes.text();
        
        // Check CSS response (optional, but good for debugging)
        if (!cssRes.ok) {
            console.warn(`CSS file not found for tab: ${targetTabId} (Status: ${cssRes.status}). Proceeding without it.`);
            // You might choose to throw an error here depending on criticality
        }
        // Append new CSS (no need to await its loading, browser handles it)
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssPath;
        link.id = "tab-specific-css";
        document.head.appendChild(link);
        
        // Set the tab's HTML content AFTER all resources are fetched
        container.innerHTML = tabHtml;
        
        // Initialize the tab's JavaScript module
        if (tabModule.init) {
            currentTabCleanup = tabModule.init({
                accountId,
                projectId,
                projectRef: currentLoadedProjectRef,
                projectData: currentLoadedProjectData
            });
        }
        
        console.log(`Tab '${targetTabId}' loaded successfully.`);
        
    } catch (err) {
        let userMessage = `<p>An unexpected error occurred while loading the <strong>${targetTabId}</strong> tab.</p>`;
        let logMessage = `Failed to load tab '${targetTabId}':`;
        
        if (err.message.includes('HTML not found')) {
            userMessage = `<p>Could not load the necessary HTML file for the <strong>${targetTabId}</strong> tab.</p>`;
            logMessage = `[HTML Load Error] Failed to fetch ${htmlPath}.`;
        } else if (err instanceof SyntaxError) {
            userMessage = `<p>The <strong>${targetTabId}</strong> tab could not be loaded due to a code error.</p><p>Please check the console for details.</p>`;
            logMessage = `[JS Syntax Error] A syntax error was found in ${jsPath}.`;
        } else if (err.message.includes('Failed to fetch dynamically imported module')) {
            userMessage = `<p>Could not load the necessary script file for the <strong>${targetTabId}</strong> tab.</p>`;
            logMessage = `[JS Load Error] The JavaScript module at ${jsPath} could not be fetched (e.g., 404 Not Found).`;
        } else if (err.message.includes('CSS file not found')) {
            userMessage += `<p>The associated styling (CSS) for this tab might be missing.</p>`;
            logMessage += ` [CSS Load Error] Could not fetch ${cssPath}.`;
        }
        
        container.innerHTML = `<div class="error-message-tab">${userMessage}</div>`;
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
            // Note: If you dynamically update the URL like this, you'll need
            // a main router to react to history.pushState and re-call tasks.init()
            const newUrl = `/tasks/${accountId}/${newTabId}/${projectId}`;
            history.pushState({ path: newUrl }, '', newUrl);

            setActiveTabLink(newTabId);
            loadTabContent(newTabId);
        }
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', tabClickListener);
    });

    // --- 4. Initial Load Sequence ---
    // This sequence is crucial for ensuring project data is available before tabs load.
    // Use an IIFE or an async function call to manage the loading sequence.
    (async () => {
        try {
            // 1. Authenticate user (ensure auth.currentUser is ready)
            await new Promise(resolve => {
                const unsubscribeAuth = auth.onAuthStateChanged(user => {
                    if (user) {
                        console.log("Auth state confirmed:", user.uid);
                    } else {
                        console.warn("No user authenticated. Some functions may fail.");
                    }
                    unsubscribeAuth(); // Stop listening after first state change
                    resolve();
                });
            });

            // 2. Load the project header (which fetches project data and saves to recent history)
            await loadProjectHeader();

            // 3. Load the initial tab content (which needs project context)
            setActiveTabLink(tabId);
            await loadTabContent(tabId);

            console.log("Tasks section initialized and loaded successfully.");

        } catch (error) {
            console.error("Fatal error during tasks section initialization:", error);
            // Display a user-friendly error message if the project cannot be loaded
            const container = document.getElementById('main-content-area') || document.body;
            container.innerHTML = `<div class="error-message-full-page">
                                     <h1>Oops! Something went wrong.</h1>
                                     <p>We couldn't load this project. It might not exist, or you might not have access.</p>
                                     <p>Please try again later or contact support if the problem persists.</p>
                                     <p>Error details: ${error.message}</p>
                                   </div>`;
        }
    })();

    // --- 5. Return the Main Cleanup Function ---
    // This cleans up the tasks section itself when navigating away (e.g., to 'home').
    return function cleanup() {
        console.log("Cleaning up 'tasks' section and its active tab...");

        // Clean up the last active tab's JS module
        if (currentTabCleanup) { // No need for typeof if it's consistently null or a function
            currentTabCleanup();
            currentTabCleanup = null;
        }

        // Clean up the listeners for the main tabs
        tabs.forEach(tab => tab.removeEventListener('click', tabClickListener));

        // Clean up the project title listeners to prevent stale updates
        if (projectName) {
            if (titleBlurListener) {
                projectName.removeEventListener('blur', titleBlurListener);
                titleBlurListener = null; // Clear the reference
            }
            if (titleEnterListener) {
                projectName.removeEventListener('keydown', titleEnterListener);
                titleEnterListener = null; // Clear the reference
            }
        }
    };
}