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
  deleteField,
  deleteDoc,
  getDocs,
  arrayUnion,
  doc,
  writeBatch,
  updateDoc,
  arrayRemove,
  limit,
  setDoc,
  onSnapshot,
  runTransaction,
  addDoc,
  orderBy,
  collectionGroup,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

import { firebaseConfig } from "/services/firebase-config.js";
import { openShareModal } from '/dashboard/components/shareProjectModel.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
const storage = getStorage(app);

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
let projectLoadController = new AbortController();
let currentUserId = null;
let currentProjectId = null;

// Global chat controller reference
let chatController = null;
let chatCleanup = null;

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

  function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;

    let c = (1 - Math.abs(2 * l - 1)) * s,
      x = c * (1 - Math.abs((h / 60) % 2 - 1)),
      m = l - c / 2,
      r = 0,
      g = 0,
      b = 0;

    if (0 <= h && h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (60 <= h && h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (120 <= h && h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (180 <= h && h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (240 <= h && h < 300) {
      r = x;
      g = 0;
      b = c;
    } else if (300 <= h && h < 360) {
      r = c;
      g = 0;
      b = x;
    }
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return [r, g, b];
  }

  function hslToHex(h, s, l) {
    const [r, g, b] = hslToRgb(h, s, l);
    const toHex = (c) => {
      const hex = c.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  /**
   * Fetches the data and reference for the currently selected project.
   * This function is crucial as it determines which project's tasks are shown.
   */


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

    const maxDisplayAvatars = 3; // Show up to 3 actual avatars
    let visibleAssignees = assigneeIds.slice(0, maxDisplayAvatars);
    let overflowCount = assigneeIds.length - maxDisplayAvatars;

    const avatarsHTML = visibleAssignees.map((userId, index) => {
      const user = allUsers.find(u => u.uid === userId);
      if (!user) return '';

      const zIndex = 50 - index;
      const displayName = user.name || 'Unknown User';
      // Changed to use user.initials if available, otherwise generate
      const initials = user.initials || (displayName).split(' ').map(n => n[0]).join('').substring(0, 2);


      if (user.avatar && user.avatar.startsWith('https://')) { // Assuming user.avatar is the correct field for URL
        return `
            <div class="user-avatar-tasks" title="${displayName}" style="z-index: ${zIndex};">
                <img src="${user.avatar}" alt="${displayName}">
            </div>`;
      } else {
        const bgColor = '#' + (user.uid || '000000').substring(0, 6); // Simple hash based on UID
        return `<div class="user-avatar-tasks" title="${displayName}" style="background-color: ${bgColor}; color: white; z-index: ${zIndex};">${initials}</div>`;
      }
    }).join('');

    let overflowHTML = '';
    if (overflowCount > 0) {
      const zIndex = 50 - maxDisplayAvatars; // Adjust z-index for the overflow icon
      // Changed to use a material icon for three dots
      overflowHTML = `
            <div class="user-avatar-tasks overflow-dots" title="${overflowCount} more" style="z-index: ${zIndex};">
                <span class="material-icons-outlined">more_horiz</span>
            </div>
        `;
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

      let projectHexColor = projectData.color || '#cccccc'; // Default if color is not provided
      // Check if the color format is HSL (e.g., "hsl(120, 100%, 50%)")
      if (projectData.color && projectData.color.startsWith('hsl(')) {
        const hslValues = projectData.color.match(/\d+(\.\d+)?/g).map(Number);
        if (hslValues.length === 3) {
          projectHexColor = hslToHex(hslValues[0], hslValues[1], hslValues[2]);
        }
      }

      const recentHistoryPayload = {
        type: 'project',
        projectId: projectId,
        projectName: projectData.title || 'Unknown Project',
        projectColor: projectHexColor,
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

  function getProjectIdFromUrl() {
    const path = window.location.pathname;

    // Try matching /tasks/.../list/...
    let match = path.match(/\/tasks\/[^/]+\/list\/([^/]+)/);
    if (match) return match[1];

    // Try matching /tasks/.../boards/...
    match = path.match(/\/tasks\/[^/]+\/board\/([^/]+)/);
    if (match) return match[1];

    // Try matching /tasks/.../dashboard/...
    match = path.match(/\/tasks\/[^/]+\/dashboard\/([^/]+)/);
    if (match) return match[1];

    return null;
  }


  async function fetchCurrentProjectData() {
    const user = auth.currentUser;
    if (!user) {
      console.error("User not authenticated.");
      throw new Error("User not authenticated.");
    }

    const projectIdFromUrl = getProjectIdFromUrl();
    if (!projectIdFromUrl) {
      throw new Error("No project ID found in the URL.");
    }

    console.log(`[DEBUG] Looking up projectId from URL: ${projectIdFromUrl}`);
    currentProjectId = projectIdFromUrl;
    // Step 1: Attempt to find the project via direct membership
    let projectDoc = null;

    const directMembershipQuery = query(
      collectionGroup(db, 'projects'),
      where('projectId', '==', projectIdFromUrl),
      where('memberUIDs', 'array-contains', user.uid)
    );
    const directMembershipSnapshot = await getDocs(directMembershipQuery);

    if (!directMembershipSnapshot.empty) {
      projectDoc = directMembershipSnapshot.docs[0];
      console.log(`[DEBUG] Access granted via direct membership: ${projectDoc.ref.path}`);
    } else {
      // Step 2: Check for workspace-level access (shared projects)
      const workspaceAccessQuery = query(
        collectionGroup(db, 'projects'),
        where('projectId', '==', projectIdFromUrl),
        where('accessLevel', '==', 'workspace')
      );
      const workspaceAccessSnapshot = await getDocs(workspaceAccessQuery);

      if (!workspaceAccessSnapshot.empty) {
        projectDoc = workspaceAccessSnapshot.docs[0];
        console.log(`[DEBUG] Access granted via workspace visibility: ${projectDoc.ref.path}`);
      }
    }

    if (!projectDoc) {
      throw new Error(`Access denied or project not found for ID: ${projectIdFromUrl}`);
    }

    const projectData = { ...projectDoc.data() };
    const membersCount = Array.isArray(projectData.members) ? projectData.members.length : 0;
    const rolesCount = projectData.rolesByUID ? Object.keys(projectData.rolesByUID).length : 0;

    // Step 3: Sync legacy roles if needed
    if (membersCount > 0 && (!projectData.rolesByUID || membersCount !== rolesCount)) {
      console.log(`Syncing roles for project: ${projectDoc.id}`);

      const rolesByUID = {};
      const memberRoleKeys = [];

      projectData.members.forEach(member => {
        if (member.uid && member.role) {
          rolesByUID[member.uid] = member.role;
          memberRoleKeys.push(`${member.uid}:${member.role}`);
        }
      });

      try {
        await updateDoc(projectDoc.ref, {
          rolesByUID: rolesByUID,
          memberRoleKeys: memberRoleKeys
        });

        // Update the local copy
        projectData.rolesByUID = rolesByUID;
        projectData.memberRoleKeys = memberRoleKeys;
        console.log(`Successfully synced roles.`);
      } catch (err) {
        console.error(`Failed to sync roles for project ${projectDoc.id}:`, err);
      }
    }

    // Step 4: Return result
    return {
      data: projectData,
      projectId: projectDoc.id,
      workspaceId: projectData.workspaceId,
      projectRef: projectDoc.ref
    };
  }

  async function loadProjectHeader() {
    console.log("🚀 Kicking off loadProjectHeader...");

    projectLoadController.abort();

    projectLoadController = new AbortController();
    const signal = projectLoadController.signal;

    try {
      // Step 1: Fetch the project data and store the reference.
      console.log("Step 1: Fetching project data...");
      const projectContext = await fetchCurrentProjectData();
      currentLoadedProjectRef = projectContext.projectRef; // Store the correct reference
      currentLoadedProjectData = projectContext.data; // Store the full project data

      const { data, projectId, workspaceId } = projectContext;
      const user = auth.currentUser;
      if (!user) {
        console.warn("No authenticated user found. Aborting header load.");
        return; // Should already be handled by fetchCurrentProjectData, but good safety
      }
      console.log(`✅ Project data fetched for projectId: ${projectId}`, { data });


      // Step 2: Fetch members for rendering and recent history.
      console.log("Step 2: Fetching member profiles...");
      const memberUIDs = data.memberUIDs || [];
      currentLoadedProjectMembers = await fetchMemberProfiles(memberUIDs); // Store fetched profiles
      console.log("✅ Member profiles fetched:", { members: currentLoadedProjectMembers });


      // Step 3: Render the UI with the fetched data.
      console.log("Step 3: Rendering UI components...");
      if (projectName && data.title) {
        if (avatarStackContainer) {
          console.log("Updating avatar stack...");
          avatarStackContainer.innerHTML = createAvatarStackHTML(memberUIDs, currentLoadedProjectMembers);
          console.log("✅ Avatar stack updated.");
        }

        // Determine user's edit permission
        const isMemberWithEditPermission = data.members?.some(m => m.uid === user.uid && m.role === "Project Admin" || m.role === "Project Owner Admin");
        const isSuperAdmin = data.project_super_admin_uid === user.uid; // Assuming this field exists
        const isAdminUser = data.project_admin_user === user.uid; // Assuming this field exists
        const userCanEdit = isMemberWithEditPermission || isSuperAdmin || isAdminUser;

        console.log(`%cUser Permissions: %cuserCanEdit = ${userCanEdit}`, "font-weight: bold;", "font-weight: normal;", {
          isMemberWithEditPermission,
          isSuperAdmin,
          isAdminUser
        });


        projectName.textContent = data.title;
        projectName.contentEditable = userCanEdit;
        projectName.style.cursor = userCanEdit ? "text" : "default";
        projectName.title = userCanEdit ? "Click to edit project name" : "";
        shareButton.classList.toggle('display-none', !userCanEdit);

        // Clean up previous listeners to prevent duplicates
        if (titleBlurListener) projectName.removeEventListener("blur", titleBlurListener);
        if (titleEnterListener) projectName.removeEventListener("keydown", titleEnterListener);

        if (userCanEdit) {
          console.log("Attaching event listeners for project title editing...");

          titleBlurListener = async () => {
            const newTitle = projectName.textContent.trim();
            const originalTitle = data.title;

            if (signal.aborted) {
              console.warn("🚫 Aborting stale title update because a new project has loaded.");
              return;
            }

            if (!newTitle || newTitle === originalTitle) {
              projectName.textContent = originalTitle;
              console.log("Title unchanged or empty, reverting.");
              return;
            }

            try {
              // Ensure projectRef is still valid and has a path
              if (!currentLoadedProjectRef || !currentLoadedProjectRef.path) {
                throw new Error("No valid project reference available for update.");
              }

              console.log(`%c🔥 Attempting to update project title to "${newTitle}"...`, 'color: orange; font-weight: bold;');
              await updateDoc(currentLoadedProjectRef, { title: newTitle });

              // Modern console log for the update
              console.log(
                `%c✅ Project Title Updated Successfully! %c\nProject ID: %c${projectId}\n%cNew Title: %c"${newTitle}"`,
                'color: #28a745; font-size: 14px; font-weight: bold;',
                'color: #6c757d;',
                'color: #007bff; font-weight: bold;',
                'color: #6c757d;',
                'color: #333; font-style: italic;'
              );

              currentLoadedProjectData.title = newTitle; // Update local data
              console.log("Local project data updated with new title.");
            } catch (err) {
              console.error("❌ Failed to update project title:", err);
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
          console.log("✅ Event listeners attached.");
        }
      }

      if (projectIconColor && data.color) {
        console.log(`Setting project icon color to: ${data.color}`);
        const hexColor = hslStringToHex(data.color);
        projectIconColor.style.backgroundColor = hexColor;
        setRandomProjectIcon(projectIconColor);
        console.log("✅ Project icon color set.");
      }

      // --- SAVE TO RECENT HISTORY AFTER LOADING PROJECT HEADER ---
      console.log("Saving project to recent history...");
      await saveProjectToRecentHistory(
        projectId,
        currentLoadedProjectData,
        currentLoadedProjectRef,
        currentLoadedProjectMembers,
        user.uid // Pass current user's UID
      );
      console.log("✅ Project saved to recent history.");


    } catch (err) {
      console.error("❌ An error occurred in loadProjectHeader:", err);
      if (projectName) {
        projectName.textContent = "Error Loading Project";
        projectName.style.color = "red";
      }
      // Potentially redirect to a dashboard or error page if project loading fails
    } finally {
      console.log("🏁 loadProjectHeader execution finished.");
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

    const clickedTabId = event.currentTarget.getAttribute('data-tab');
    if (!clickedTabId) return;

    const pathParts = window.location.pathname.split('/').filter(p => p);
    const currentTabIdFromUrl = pathParts[2]; // /tasks/:uid/:tab/:projectId

    // Prevent redundant reload
    if (clickedTabId === currentTabIdFromUrl) return;

    const accountId = pathParts[1];
    const projectId = pathParts[3];
    const existingQuery = window.location.search; // includes "?openTask=abc123" or ""

    const newUrl = `/tasks/${accountId}/${clickedTabId}/${projectId}${existingQuery}`;
    history.pushState({ path: newUrl }, '', newUrl);

    setActiveTabLink(clickedTabId);
    loadTabContent(clickedTabId);
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
          currentUserId = user.uid;
          if (user) {
            console.log("Auth state confirmed:", user.uid);

          } else {
            console.warn("No user authenticated. Some functions may fail.");
          }
          unsubscribeAuth(); // Stop listening after first state change
          resolve();
        });
      });

      await loadProjectHeader();
      if (!chatController) {
        chatCleanup = floatingChatBox();
      }
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
    console.log("🧹 Cleaning up 'tasks' section, its active tab, and project context...");

    // --- 1. CLEAR PROJECT CONTEXT ---
    // This is the crucial step to prevent data from one project
    // from appearing in another after navigating.
    currentLoadedProjectRef = null;
    currentLoadedProjectData = null;
    currentLoadedProjectMembers = []; // Also clear the members array
    console.log("Nullified project context (Ref, Data, Members).");


    // --- 2. CLEAN UP TAB-SPECIFIC MODULE ---
    // Clean up the last active tab's JS module (e.g., list.js, board.js)
    if (currentTabCleanup) {
      currentTabCleanup();
      currentTabCleanup = null;
    }

    // --- 3. CLEAN UP EVENT LISTENERS ---
    // Clean up the listeners for the main tabs ('List', 'Board', etc.)
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

  // ======== FLOATING CHAT BOX FUNCTION ========
  function floatingChatBox() {
    console.log("Initializing floating chat box...");
    initializeChat();

    // Check if chat container already exists
    let existingChatContainer = document.getElementById("chat-container");
    if (existingChatContainer) {
      console.log("Chat container already exists. Cleaning up...");
      existingChatContainer.remove();
    }

    // Check if chat style already exists
    let existingChatStyle = document.getElementById("chat-specific-style");
    if (existingChatStyle) {
      existingChatStyle.remove();
    }

    // 1. Create chat container
    const chatContainer = document.createElement("div");
    chatContainer.id = "chat-container";
    chatContainer.className = "chat-container";
    chatContainer.innerHTML = `
    <div id="image-preview-overlay" class="hidden fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center z-[10000000]">
  <img id="image-preview-full" src="" alt="Preview" class="max-w-[90%] max-h-[90%] rounded-lg shadow-xl" />
</div>

      <button id="chat-button" class="chat-button">
        <i class="fas fa-comments"></i>
        <span id="unread-badge" class="unread-badge">0</span>
      </button>
      <div id="chat-box" class="chat-box">
        <header id="chat-header">
          <div class="flex items-center space-x-2">
            <div class="bg-black w-8 h-8 rounded-full flex items-center justify-center">
              <i class="fas fa-users text-sm text-white"></i>
            </div>
            <div>
              <h3 class="font-bold text-sm text-white">Project Chats</h3>
              <p id="active-room-name" class="text-gray-300 text-xs">Select a chat</p>
            </div>
          </div>
          <div class="flex space-x-1">
            <button id="toggle-minmax" class="text-white hover:text-gray-300 transition p-1">
              <i id="toggle-minmax-icon" class="fas fa-expand text-sm"></i>
            </button>
            <button id="minimize-chat" class="text-white hover:text-gray-300 transition p-1">
              <i class="fas fa-minus text-sm"></i>
            </button>
            <button id="close-chat" class="text-white hover:text-gray-300 transition p-1">
              <i class="fas fa-times text-sm"></i>
            </button>
          </div>
          <!-- Minimized icon for circle state -->
          <div id="minimized-icon" class="minimized-icon hidden">
            <i class="fas fa-comment text-white"></i>
          </div>
        </header>
        <div id="chat-body" class="flex flex-col flex-1">
          <!-- Added bottom margin to create space below selector -->
          <nav id="chat-room-selector" class="border-b border-gray-300 bg-gray-100 px-2 py-2 flex flex-nowrap overflow-x-auto gap-1"></nav>

          <div id="pinned-messages-container" class="hidden">
    <div id="pinned-message-display">
        </div>
    <div id="pinned-message-nav">
        <span id="pin-counter"></span>
        <button id="pin-nav-prev" title="Previous Pin">
        <i class="fas fa-chevron-left"></i>
    </button>
    <button id="pin-nav-next" title="Next Pin">
        <i class="fas fa-chevron-right"></i>
    </button>
    </div>
</div>

          <div id="messages-container" class="messages-container bg-gradient-to-b from-gray-50 to-gray-100 p-2 overflow-y-auto flex-1"></div>
          <div id="typing-indicator-container"></div>
          <div class="p-2 border-t border-gray-200 bg-white rounded-b-xl">
          <div id="reply-context-bar" class="hidden"></div>

            <form id="chat-form" class="flex items-center" onsubmit="return false">

              <div class="flex-1 bg-gray-100 rounded-full pr-1 flex items-center">
                <input id="message-input" type="text" placeholder="Type your message..." class="flex-1 bg-transparent py-2 px-3 text-sm focus:outline-none" disabled>
                <input type="file" id="file-input" class="hidden" accept="image/*, .pdf, .doc, .docx">
                <button type="button" id="file-button" class="text-gray-500 hover:text-gray-700 transition p-1">
                  <i class="fas fa-paperclip text-sm"></i>
                </button>
                <button type="button" id="emoji-button" class="text-gray-500 hover:text-gray-700 transition p-1">
                  <i class="fas fa-smile text-sm"></i>
                </button>
              </div>
              <button id="send-button" type="submit" disabled class="ml-2 flex items-center justify-center transition text-gray-400 p-1">
                <i class="fas fa-paper-plane text-sm"></i>
              </button>
              <button id="confirm-edit-btn" type="button" class="hidden ml-2 edit-action-btn">
    <i class="fas fa-check"></i>
</button>
<button id="cancel-edit-btn" type="button" class="hidden ml-1 edit-action-btn">
    <i class="fas fa-times"></i>
</button>
            </form>
          </div>
        </div>
        <!-- Unread badge for minimized circle state -->
        <div id="minimized-unread-badge" class="unread-badge hidden">0</div>
      </div>
    `;
    document.body.appendChild(chatContainer);
    const chatBox = document.getElementById("chat-box");
    chatBox.classList.remove("open", "minimized", "maximized");
    chatBox.style.display = "none";

    // 2. Inject chat styles
    const style = document.createElement("style");
    style.id = "chat-specific-style";
    style.textContent = `
      /* ================ Base Styles ================ */
      :root {
        --primary-color: #000000;
        --secondary-color: #ffffff;
        --accent-color: #ef4444;
        --bg-color: #f3f4f6;
        --text-color: #111827;
        --text-muted: #6b7280;
        --border-color: #e5e7eb;
        --online-color: #10b981;
        --typing-color: #3b82f6;
          --z-chat-container: 10000;
        --z-chat-box: 10010;
        --z-chat-header: 10020;
        --z-emoji-picker: 10030; /* Highest priority */
        --z-reaction-picker: 10040; /* Even higher priority for reaction picker */
      }
        /* Container for the pinned indicator text and icon */
.pinned-indicator {
    display: flex;
    align-items: center;
    font-size: 11px;
    color: #657786;
    margin-top: -22px;
    padding-bottom: 2px;
}

/* Align the indicator correctly based on the message sender */
.message-wrapper.user .pinned-indicator {
    align-self: flex-end;
}
.message-wrapper.other .pinned-indicator {
    align-self: flex-start;
}

.pinned-indicator i {
    position: relative; /* Crucial for positioning the pseudo-element head */
    z-index: 2; /* Ensures the needle is on top of the head */
    font-size: 12px;
    
    /* A metallic color for the needle */
    color: #4a5568; 
    
    /* The shadow cast by the entire pin */
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.2);
    
    /* The iconic thumbtack angle */
    transform: rotate(-25deg);
    
    /* Adjust spacing */
    margin-right: 12px;
    margin-left: 4px;
}

/* This pseudo-element creates the glossy red 'head' of the pin */
.pinned-indicator i::before {
    content: ''; /* Required for pseudo-elements */
    position: absolute;
    z-index: 1; /* Places the head behind the needle */
    
    /* Position and size the head relative to the icon */
    top: -3px;
    left: 0;
    width: 11px;
    height: 11px;
    
    /* A vibrant red gradient to simulate lighting */
    background-image: linear-gradient(135deg, #ff7575 0%, #e53e3e 100%);
    
    /* Make it a perfect circle */
    border-radius: 50%;
    
    /* The key to the 3D effect:
       - An outer shadow to lift it off the page.
       - An inset shadow to create a glossy highlight on the top edge. */
    box-shadow: 1px 1px 3px rgba(0, 0, 0, 0.3), 
                inset 0 -1px 1px rgba(0, 0, 0, 0.2), 
                inset 0 1px 1px rgba(255, 255, 255, 0.4);
}
        #pinned-messages-container {
    padding: 10px 15px;
    background-color: rgba(230, 235, 245, 0.7);
    backdrop-filter: blur(10px);
    display: flex;
    justify-content: space-between;
    align-items: center;
    animation: fadeInDown 0.3s ease-out;
}

#pinned-messages-container.hidden {
    display: none;
}

@keyframes fadeInDown {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}

#pinned-message-display {
    flex-grow: 1;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
    color: #333;
}

#pinned-message-display .pin-icon {
    color: #007aff;
    margin-right: 8px;
    font-size: 12px;
}

#pinned-message-display .pinned-sender {
    font-weight: 600;
}

#pinned-message-nav {
    display: flex;
    align-items: center;
    color: #555;
    font-size: 13px;
}

#pin-counter {
    margin-right: 8px;
}

/* Shared style for both the check and cancel buttons */
.edit-action-btn {
    width: 26px;
    height: 26px;
    border-radius: 50%; /* This makes the background circular */
    border: none;      /* Removes the border */
    
    display: flex;
    align-items: center;
    justify-content: center;
    
    cursor: pointer;
    transition: background-color 0.2s ease, transform 0.1s ease;
}

.edit-action-btn:hover {
    transform: scale(1.05); /* Slight zoom on hover */
}

/* Specific color for the Confirm (check) button */
#confirm-edit-btn {
    background-color: #dfdfdfff; /* Green for confirm */
    color: #267423ff;
}
#confirm-edit-btn:hover {
    background-color: #dcf7e2ff; /* Darker green */
}

/* Specific color for the Cancel button */
#cancel-edit-btn {
    background-color: #dfdfdfff; /* Red for cancel */
    color: #692828ff;
}
#cancel-edit-btn:hover {
    background-color: #fff0f1ff; /* Darker red */
}
#pinned-message-nav button {
    background: rgba(0, 0, 0, 0.05);
    border: none;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    margin-left: 4px;
    cursor: pointer;
    color: #333;
    padding: 0;
    transition: background-color 0.1s ease;
    
    /* Flexbox handles the perfect centering for the new <i> icons */
    display: flex;
    align-items: center;
    justify-content: center;
}
#pinned-message-nav button i {
    font-size: 12px;
}

#pinned-message-nav button:hover {
    background: rgba(0, 0, 0, 0.1);
}
     #chat-box.align-left {
  transform: translateX(-20px);
}

#chat-box.align-right {
  transform: translateX(20px);
}

#chat-box.align-up {
  transform: translateY(-20px);
}

#chat-box.align-down {
  transform: translateY(20px);
}


      .chat-container { z-index: var(--z-chat-container); }
    #chat-header { z-index: var(--z-chat-header); }
    .emoji-picker { z-index: var(--z-emoji-picker); }
    .reaction-picker { z-index: var(--z-reaction-picker); }


/* Add these to prevent clipping */
.chat-container,
.chat-box,
#chat-body,
#chat-header {
  overflow: visible !important;
  contain: none !important;
}

/* Ensure no parent clips content */
.chat-box > * {
  overflow: visible !important;
}

      /* ================ Chat Container ================ */
.chat-container {
        position: absolute;
        bottom: 20px;
        right: 20px;
        z-index: 10000; /* High z-index to stay on top */
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        cursor: grab;
      }
      .chat-container.scrolled {
        transform: translateY(-3.125rem);
      }
        #chat-box {
  display: none;
}

#chat-box.open {
  display: block;
}

#reply-context-bar {
    padding: 8px 12px;
    background-color: #f0f2f5;
    border-top: 1px solid #e0e0e0;
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

#reply-context-bar.hidden {
    display: none;
}

#reply-context-bar .reply-content {
    border-left: 3px solid #3b82f6; /* Blue reply indicator */
    padding-left: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

#reply-context-bar .reply-sender {
    font-weight: 600;
    display: block;
}

#reply-context-bar .cancel-reply-btn {
    background: none;
    border: none;
    color: #606770;
    cursor: pointer;
    font-size: 16px;
}

.message-reply-quote {
    background-color: rgba(0, 0, 0, 0.05);
    padding: 6px 10px;
    border-radius: 8px;
    margin-bottom: 6px;
    font-size: 13px;
    border-left: 3px solid rgba(0, 0, 0, 0.2);
}
.message-reply-quote .reply-text {
    opacity: 0.8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

      /* ================ CHAT BUTTON ================ */
      .chat-button {
        position: relative;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: #000;
        color: white;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-size: 20px;
        z-index: 10001; /* Higher than container */
      }

      .chat-button:hover {
        transform: scale(1.08) translateY(-3px);
        box-shadow: 0 6px 15px rgba(0, 0, 0, 0.4);
        background: #333;
      }

      .chat-button:active {
        transform: scale(0.95);
      }

      /* Unread badge */
      .unread-badge {
        position: absolute;
        top: -8px; /* Adjusted position */
        right: -8px; /* Adjusted position */
        background-color: #ef4444;
        color: white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: bold;
        z-index: 100000000000;
        padding: 2px; /* Added padding for better appearance */
      }

      /* ================ Chat Box States ================ */
      .chat-box {
    position: absolute; /* This is CRITICAL for the JS to work */
    width: 320px;
    display: none; /* Controlled by JS */
    flex-direction: column;
    z-index: 1000;
}

      .chat-box.open {
        height: 450px; /* Default height */
        opacity: 1;
        transform: translateY(0);
      }

      .chat-box.open.maximized {
        width: 90vw !important;
        height: 90vh !important;
        max-width: 90vw;
        max-height: 90vh;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) !important;
        z-index: 10010; /* Higher than before */
        border-radius: 14px;
      }
        #minimized-unread-badge{
           display: none;
        }
      /* REVISED: Minimized state - circular shape like Messenger */
      .chat-box.minimized {
        width: 3.5rem !important;
        height: 3.5rem !important;
        opacity: 1;
        transform: translateY(0);
        border-radius: 50% !important; /* Make it circular */
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
        position: relative;
        overflow: visible;
      }

      .chat-box.minimized #chat-body {
        display: none;
      }

      .chat-box.minimized #chat-header > div {
        display: none !important;
      }

      .chat-box.minimized #chat-header #minimized-icon {
        display: flex !important;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        color: white;
      }

      #chat-body {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0; /* Allow flex item to shrink */
      }

      /* REVISED: Header styles for minimized circular state */
      .chat-box.minimized #chat-header {
        border-radius: 50% !important; /* Make header circular */
        height: 100%;
        width: 100%;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #000 !important;
      }

      .chat-box:not(.minimized) #minimized-icon {
        display: none !important;
      }

/*
 * The main container for the floating menu.
 */
.options-menu {
    position: absolute;
    z-index: 10050;

    /* NARROWER: Adjusted width for a more compact look. 
       Note: 180px provides enough space for text like "Remove for you".
       You can adjust this value as needed. */
    width: 180px;

    background: white;
    border-radius: 12px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1), 0 2px 5px rgba(0, 0, 0, 0.05);
    padding: 6px;
    overflow: hidden;
    animation: menu-pop-in 0.15s ease-out forwards;

    /* SHIFT LEFT: This moves the entire menu to the left by 20px 
       from its original position, making it feel less crowded. */
    transform: translateX(-20px);
}

/*
 * The pop-in animation keyframes.
 */
@keyframes menu-pop-in {
    from {
        opacity: 0;
        transform: scale(0.95) translateY(-5px) translateX(-20px); /* Keep transform consistent */
    }
    to {
        opacity: 1;
        transform: scale(1) translateY(0) translateX(-20px); /* Keep transform consistent */
    }
}

/*
 * Styling for each individual item within the menu.
 */
.options-menu-item {
    display: flex;
    align-items: center;

    /* ALIGN LEFT: Ensures the icon and text are always pushed to the left. */
    justify-content: flex-start; 
    
    padding: 8px 10px; /* Adjusted padding for the new width */
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: #333;
    border-radius: 8px;
    transition: background-color 0.1s ease-in-out;
}

/* The hover effect for menu items */
.options-menu-item:hover {
    background-color: #f0f2f5;
}

/* Icon styling within the menu items */
.options-menu-item i {
    margin-right: 10px; /* Slightly reduced margin for a tighter look */
    width: 16px;
    text-align: center; /* Centering the icon within its own box looks cleaner */
    color: #555;
}

/* The divider line between sections */
.options-menu-divider {
    height: 1px;
    background-color: #f0f2f5;
    margin: 4px 0;
}

      /* Unread badge for minimized circle state */
      #minimized-unread-badge {
        position: absolute;
        top: -8px; /* Adjusted position */
        right: -8px; /* Adjusted position */
        background-color: #ef4444;
        color: white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: bold;
        padding: 2px; /* Added padding for better appearance */
        z-index: 10002; /* Ensure it's above the minimized chat box */
      }

      /* ================ Chat Room Selector - Made Larger ================ */
      #chat-room-selector {
        height: 48px; /* Fixed height for consistency */
        padding: 0.3rem 0.5rem; /* More padding */
        background-color: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
        display: flex;
        flex-wrap: nowrap;
        overflow-x: auto;
        overflow-y: hidden;
        -ms-overflow-style: none;
        scrollbar-width: thin;
        scrollbar-color: #888 transparent;
        gap: 0.4rem; /* Slightly larger gap */
        align-items: center; /* Center items vertically */
      }

      #chat-room-selector::-webkit-scrollbar {
        height: 5px; /* Slightly thicker scrollbar */
      }

      #chat-room-selector::-webkit-scrollbar-track {
        background: transparent;
        border-radius: 3px;
      }

      #chat-room-selector::-webkit-scrollbar-thumb {
        background-color: #cbd5e1;
        border-radius: 3px;
      }

      .chat-room-selector-item {
        display: inline-flex;
        min-width: fit-content;
        padding: 0.4rem 0.9rem; /* More padding for larger items */
        border-radius: 0.9rem; /* Slightly larger radius */
        background-color: #e5e7eb;
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 0.8rem; /* Larger font size */
        font-weight: 500;
        color: #4b5563;
        flex-shrink: 0;
        white-space: nowrap;
        height: 32px; /* Fixed height for consistency */
        align-items: center; /* Center text vertically */
        border: none; /* Removed border */
      }

      .chat-room-selector-item:hover {
        background-color: #d1d5db;
      }

      .chat-room-selector-item.selected {
        background-color: #000000;
        color: #ffffff;
      }

      .unread-count {
        margin-left: 0.3rem; /* More spacing */
        background-color: #ef4444;
        color: white;
        border-radius: 9999px;
        padding: 0.15rem 0.4rem; /* Slightly larger */
        font-size: 0.7rem; /* Slightly larger */
        font-weight: 600;
      }

      /* ================ Messages Container ================ */
      .messages-container {
        flex: 1;
        overflow-y: auto; /* Ensure vertical scrolling */
        overflow-x: hidden;
        min-height: 0; /* Allow flex item to shrink */
        padding: 0.5rem;
        background: #f8fafc;
        font-size: 0.8rem;
        box-shadow: inset 0 8px 6px -6px rgba(0, 0, 0, 0.1);
      }

      .messages-container::-webkit-scrollbar {
        width: 4px;
      }

      .messages-container::-webkit-scrollbar-track {
        background: transparent;
      }

      .messages-container::-webkit-scrollbar-thumb {
        background-color: #cbd5e1;
        border-radius: 0.5rem;
      }

      /* ================ Paperclip & Paper Plane Styles ================ */
      #file-button, #send-button, #emoji-button {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0.4rem;
        color: #6b7280;
        cursor: pointer;
        transition: color 0.2s;
        font-size: 0.9rem;
      }

      #file-button:hover, #emoji-button:hover,
      #send-button:hover:not([disabled]) {
        color: #000;
        background: transparent !important;
        transform: scale(1.1);
      }

      #send-button[disabled] {
        color: #9ca3af;
        cursor: not-allowed;
      }

      #send-button:not([disabled]) {
        color: #000;
      }

      /* ================ Enhanced Emoji Picker ================ */

.emoji-picker {
  position: absolute;
  bottom: calc(100% + 10px);
  right: 0;
  width: 280px;
  height: 320px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 35px rgba(0, 0, 0, 0.25);
  z-index: var(--z-emoji-picker); /* Use CSS variable */
  display: none;
  border: 1px solid #e5e7eb;
  transform: translateY(20px);
  opacity: 0;
  transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  will-change: transform, opacity;
}

.emoji-picker.open {
  display: block;
  transform: translateY(0);
  opacity: 1;
}

      .emoji-picker .emoji-header {
        padding: 0.4rem 0.6rem;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: #f9fafb;
        font-size: 0.75rem;
      }

      .emoji-picker .emoji-header span {
        font-weight: 600;
        color: var(--text-color);
      }

      .emoji-picker .emoji-container {
        display: grid;
        grid-template-columns: repeat(8, minmax(0, 1fr));
        gap: 0.1rem;
        padding: 0.1rem;
        height: calc(100% - 2.5rem);
        overflow-y: auto;
      }

      .emoji-picker .emoji-item {
        font-size: 1.1rem;
        cursor: pointer;
        text-align: center;
        padding: 0.1rem;
        border-radius: 0.2rem;
        transition: all 0.1s ease;
        aspect-ratio: 1/1;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .emoji-picker .emoji-item:hover {
        background-color: #f0f2f5;
        transform: scale(1.1);
      }

      .emoji-picker .emoji-container::-webkit-scrollbar {
        width: 4px;
      }

      .emoji-picker .emoji-container::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 3px;
      }

      .emoji-picker .emoji-container::-webkit-scrollbar-thumb {
        background-color: #d1d5db;
        border-radius: 3px;
      }

      /* ================ Typing Indicator ================ */
      .typing-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .typing-indicator span {
        width: 0.35rem;
        height: 0.35rem;
        background-color: var(--primary-color);
        border-radius: 50%;
        display: inline-block;
        margin: 0 0.08rem;
        animation: typing 1.4s infinite ease-in-out;
      }

      .typing-indicator span:nth-child(2) {
        animation-delay: 0.2s;
      }

      .typing-indicator span:nth-child(3) {
        animation-delay: 0.4s;
      }

      @keyframes typing {
        0%,
        60%,
        100% {
          transform: translateY(0);
        }
        30% {
          transform: translateY(-0.2rem);
        }
      }

      /* ================ File Message Styles - Made Smaller ================ */
      .file-message {
        padding: 0.3rem !important; /* Reduced padding */
      }

      .file-message i {
        font-size: 0.9rem !important; /* Smaller icon */
      }

      .file-message p {
        font-size: 0.7rem !important; /* Smaller text */
      }

      /* ================ MESSAGE BUBBLES (MESSENGER STYLE) ================ */
      .message-wrapper {
        display: flex;
        flex-direction: column;
        max-width: 80%;
        margin-bottom: 0.5rem;
        position: relative;
        padding-bottom: 25px; /* Increased padding to make space for reactions */
      }

      .message-wrapper.user {
        align-items: flex-end;
        margin-left: auto;
        margin-right: 0.5rem;
      }

      .message-wrapper.other {
        align-items: flex-start;
        margin-left: 0.5rem;
      }

      .message-container {
        display: flex;
        align-items: center;
        position: relative; /* For reaction picker positioning */
      }

      .message-container.user {
        flex-direction: row-reverse; /* Reverse order for user messages */
      }

      .message-container.other {
        flex-direction: row; /* Default order for other messages */
      }

      .message-bubble {
        padding: 8px 12px;
        border-radius: 18px;
        position: relative;
        word-wrap: break-word;
        max-width: 100%;
      }

      .message-bubble.user {
        background-color: #000000; /* Black */
        color: white;
        border-bottom-right-radius: 4px;
      }
      .unread-count {
    margin-left: 0.4rem; 
    background-color: #ef4444;
    color: white;
    border-radius: 9999px; 
    padding: 0.15rem 0.45rem;
    font-size: 0.7rem;
    font-weight: 600; 
    line-height: 1; /
    display: inline-block; 
}  
      .message-bubble.user::after {
        content: '';
        position: absolute;
        bottom: 0;
        right: -8px;
        width: 0;
        height: 0;
        border: 8px solid transparent;
        border-left-color: #000000; /* Black */
        border-right: 0;
        border-bottom: 0;
      }

      .message-bubble.other {
        background-color: #e5e7eb; /* Light Gray */
        color: #111827; /* Dark text for contrast */
        border: 1px solid #e5e7eb; /* Light Gray border */
        border-bottom-left-radius: 4px;
      }

      .message-bubble.other::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: -8px;
        width: 0;
        height: 0;
        border: 8px solid transparent;
        border-right-color: #e5e7eb; /* Light Gray */
        border-left: 0;
        border-bottom: 0;
      }

      .message-header {
        font-weight: 500;
        font-size: 0.65rem;
        margin-bottom: 0.15rem;
      }

      .message-content {
        font-size: 0.75rem;
        line-height: 1.3;
      }

      .message-timestamp {
        font-size: 0.6rem;
        color: #6b7280;
        margin-top: 0.1rem;
        align-self: flex-end; /* Align timestamp to the right for user messages */
        margin-right: 0.5rem; /* Adjust as needed */
      }

      .message-wrapper.other .message-timestamp {
        align-self: flex-start; /* Align timestamp to the left for other messages */
        margin-left: 0.5rem; /* Adjust as needed */
      }

      .status-icon {
        margin-left: 4px;
        transition: transform 0.3s ease-out; /* Animation for read status */
      }

      .status-icon.read {
        transform: translateY(2px); /* Animate downwards if read */
      }

      /* ================ Reactions Button and Picker ================ */
      .react-button {
        background: none;
        border: none;
        font-size: 0.8rem;
        cursor: pointer;
        padding: 0 5px;
        color: #6b7280;
        opacity: 0; /* Hidden by default */
        transition: opacity 0.2s ease-in-out;
      }
      .reply-btn {
        background: none;
        border: none;
        font-size: 0.8rem;
        cursor: pointer;
        padding: 0 5px;
        color: #6b7280;
        opacity: 0; /* Hidden by default */
        transition: opacity 0.2s ease-in-out;
      }
      .options-btn {
        background: none;
        border: none;
        font-size: 0.8rem;
        cursor: pointer;
        padding: 0 5px;
        color: #6b7280;
        opacity: 0; /* Hidden by default */
        transition: opacity 0.2s ease-in-out;
      }

      .message-container:hover .react-button {
        opacity: 1; /* Show on hover */
      }
      .message-container:hover .reply-btn {
        opacity: 1; /* Show on hover */
      }  
      .message-container:hover .options-btn {
        opacity: 1; /* Show on hover */
      } 
      .message-container.user .react-button {
        margin-right: 5px; /* Space for user messages */
      }
      .message-container.user .reply-btn {
        margin-right: 5px; /* Space for user messages */
      }
      .message-container.other .options-btn {
        margin-left: 5px; /* Space for other messages */
      }

      /* FIXED: Reaction picker positioning */
      .reaction-picker {
        position: absolute; /* Default to absolute */
        bottom: calc(100% + 5px);
        left: 50%;
        transform: translateX(-50%) translateY(10px); /* Initial state for animation */
        background: white;
        border-radius: 20px;
        padding: 5px 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        display: flex;
        gap: 5px;
        z-index: var(--z-reaction-picker); /* Use CSS variable */
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out; /* Add transform to transition */
      }

      .reaction-picker.open {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(-50%) translateY(0); /* Ensure transform is reset */
      }

      .reaction-picker .reaction-emoji {
        font-size: 1.5rem;
        cursor: pointer;
        transition: transform 0.1s ease;
      }

      .reaction-picker .reaction-emoji:hover {
        transform: scale(1.2);
      }

      /* FIXED: Message reactions positioning */
      .message-reactions {
        position: absolute;
        bottom: 0px; /* Position at the very bottom of the message-wrapper padding */
        display: flex;
        gap: 3px;
        background: rgba(255, 255, 255, 0.9);
        border-radius: 10px;
        padding: 2px 6px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        font-size: 0.7rem;
        z-index: 2;
      }

      .message-wrapper.user .message-reactions {
        right: 5px; /* Position at bottom right for user messages */
      }

      .message-wrapper.other .message-reactions {
        left: 5px; /* Position at bottom left for other messages */
      }

      .message-reactions .reaction-item {
        display: flex;
        align-items: center;
      }

      .message-reactions .reaction-count {
        margin-left: 2px;
        font-weight: bold;
      }

      .message-reactions .reaction-users {
        display: none; /* Hidden by default */
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 5px 10px;
        border-radius: 5px;
        white-space: nowrap;
        font-size: 0.6rem;
      }

      .message-reactions .reaction-item:hover .reaction-users {
        display: block; /* Show on hover */
      }

      /* ================ Responsive Adjustments ================ */
      @media (max-width: 30rem) {
        .chat-box.open {
          height: 70vh;
          width: 85vw;
          right: 7.5vw;
          bottom: 4rem;
        }

        .chat-box.open.maximized {
          width: 95vw !important;
          height: 95vh !important;
          border-radius: 10px;
        }

        .chat-button {
          bottom: 1rem;
          right: 1rem;
          width: 45px;
          height: 45px;
          font-size: 18px;
        }

        .messages-container {
          height: calc(100% - 10rem);
        }

        .chat-box.minimized {
          width: 3.5rem !important;
          height: 3.5rem !important;
        }

        /* Larger selector on mobile */
        #chat-room-selector {
          height: 50px;
          padding: 0.4rem 0.6rem;
        }
      }

      /* ================ Accessibility Improvements ================ */
      [aria-hidden="true"] {
        pointer-events: none;
      }

      [aria-disabled="true"] {
        opacity: 0.6;
        cursor: not-allowed;
      }

      :focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }

      /* ================ Utility Classes ================ */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }

      .transition-all {
        transition-property: all;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
      }

      /* ===== REVISED: Hide chat button when minimized ===== */
      .chat-button.hidden {
        display: none;
      }

      /* ===== CHAT HEADER FIXES ===== */
      #chat-header {
        background-color: #000;
        color: white;
        padding: 0.75rem 1rem;
        border-top-left-radius: 14px;
        border-top-right-radius: 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      /* Reaction picker animation */
      .reaction-picker {
        animation: react-picker-pop-in 0.15s ease-out forwards;
      }

      @keyframes react-picker-pop-in {
        from {
          transform: translate(-50%, 10px) scale(0.8);
          opacity: 0;
        }
        to {
          transform: translate(-50%, 0) scale(1);
          opacity: 1;
        }
      }

      .reaction-picker .reaction-emoji {
        transition: transform 0.1s ease, background-color 0.1s ease;
      }

      .reaction-picker .reaction-emoji:hover {
        background-color: #f0f2f5; /* Light background on hover */
        border-radius: 50%; /* Make it circular on hover */
      }

      /* Fix for emoji picker container */
      .chat-box > div:last-child {
        position: relative;
      }

      /* Custom styles for the requested changes */
      .chat-box.open #chat-body {
        border-top-left-radius: 0;
        border-top-right-radius: 0;
      }

      /* Specific styles for emoji picker when chat is maximized */
      .chat-box.open.maximized .emoji-picker {
        position: fixed; /* Change to fixed positioning */
        bottom: auto; /* Reset bottom */
        right: auto; /* Reset right */
        left: 50%; /* Center horizontally */
        transform: translateX(-50%); /* Adjust for its own width */
        top: auto; /* Reset top */
        margin-bottom: 10px; /* Add some margin from the bottom of the screen */
      }

      /* ===== Modern Confirmation Modal ===== */

#modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    
    /* The semi-transparent black background */
    background-color: rgba(0, 0, 0, 0.6);
    
    /* High z-index to ensure it's on top of everything */
    z-index: 10000000;
    
    /* Frosted glass effect for the background */
    backdrop-filter: blur(5px);
    
    /* Center the modal content */
    display: flex;
    align-items: center;
    justify-content: center;
    
    /* Fade-in animation */
    animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.confirmation-modal {
    background: #1c1c1e; /* Dark charcoal, looks more premium than pure black */
    color: #f5f5f7;
    border-radius: 16px;
    padding: 24px 28px;
    width: 90%;
    max-width: 400px;
    text-align: center;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    
    /* Pop-in and slide-up animation */
    animation: popInUp 0.3s ease-out forwards;
}

@keyframes popInUp {
    from {
        opacity: 0;
        transform: scale(0.9) translateY(10px);
    }
    to {
        opacity: 1;
        transform: scale(1) translateY(0);
    }
}

.confirmation-modal .modal-icon {
    font-size: 24px;
    color: #f5b84f; /* A warning yellow */
    margin-bottom: 12px;
}

.confirmation-modal .modal-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0 0 8px 0;
}

.confirmation-modal .modal-message {
    font-size: 0.9rem;
    color: #a1a1a6; /* Lighter gray for the body text */
    line-height: 1.5;
    margin-bottom: 24px;
}

.confirmation-modal .modal-buttons {
    display: flex;
    gap: 12px;
}

.confirmation-modal .modal-btn {
    flex-grow: 1;
    padding: 12px;
    border: none;
    border-radius: 10px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: transform 0.1s ease, background-color 0.1s ease;
}

.confirmation-modal .modal-btn:hover {
    transform: scale(1.03);
}

.confirmation-modal .modal-btn-cancel {
    background-color: #4a4a4e;
    color: white;
}

.confirmation-modal .modal-btn-confirm {
    background-color: #007aff; /* Default confirm is blue */
    color: white;
}

/* Special style for destructive actions like "Unsend" or "Delete" */
.confirmation-modal .modal-btn-confirm.destructive {
    background-color: #e53e3e; /* Red for destructive actions */
}

.forward-modal {
    background: #1c1c1e;
    color: #f5f5f7;
    border-radius: 16px;
    width: 100%;
    max-width: 620px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    max-height: 80vh;
    animation: popInUp 0.3s ease-out forwards;
}

.forward-modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.forward-modal-header h2 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0;
}

.close-modal-btn {
    background: none;
    border: none;
    color: #a1a1a6;
    font-size: 24px;
    cursor: pointer;
}

.forward-modal-search {
    position: relative;
    padding: 12px 20px;
}

.forward-modal-search i {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    left: 35px;
    color: #a1a1a6;
}

#room-search-input {
    width: 100%;
    padding: 12px 12px 12px 40px;
    background-color: #3a3a3c;
    border: 1px solid #4a4a4e;
    border-radius: 10px;
    color: white;
    font-size: 1rem;
}

.forward-room-list {
    flex-grow: 1;
    overflow-y: auto;
    padding: 0 20px;
}

.room-item {
    display: flex;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    cursor: pointer;
}
.room-item:last-child {
    border-bottom: none;
}
.room-item:hover {
    background-color: rgba(255, 255, 255, 0.05);
}
.room-item .room-info {
    flex-grow: 1;
}
.room-item .room-name {
    display: block;
    font-weight: 500;
}
.room-item .room-members {
    font-size: 0.8rem;
    color: #a1a1a6;
}
.room-item input[type="checkbox"] {
    width: 20px;
    height: 20px;
    accent-color: #007aff;
}

.forward-modal-footer {
    padding: 16px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}
#forward-btn {
    background-color: #f5f5f7; /* A clean, slightly off-white */
    color: #1c1c1e;        
    border: 1px solid #636363ff;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s ease-in-out, transform 0.1s ease;
}

/* Hover state for the enabled button */
#forward-btn:not(:disabled):hover {
    background-color: #e5e5e5;
    border: 1px solid #636363ff;
    transform: scale(1.03);
}

/* Disabled state */
#forward-btn:disabled {
    background-color: #4a4a4e; /* Dark gray for disabled */
    color: #a1a1a6;
    border: 1px solid #000000;
    cursor: not-allowed;
    transform: none;
}
.edited-status {
    font-size: 10px;
    color: #3d50ffff; /* A muted gray color */
    margin-left: 5px;
    font-style: bold;
}
    `;
    document.head.appendChild(style);

    // 3. Chat Controller Implementation
    const CHAT_TYPES = {
      GLOBAL: "global",
      PROJECT: "project",
      SUPPLIER: "supplier",
    };

    const MESSAGE_STATUS = {
      SENT: "sent",
      READ: "read",
    };

    const EMOJIS = [
      "😀",
      "😍",
      "🤔",
      "😎",
      "🥳",
      "😢",
      "😡",
      "👍",
      "👎",
      "❤️",
      "🔥",
      "🎉",
      "💯",
      "👀",
      "✨",
      "🤝",
      "👫",
      "🤩",
      "😘",
      "😊",
      "😋",
      "😝",
      "😜",
      "😴",
      "😵",
      "😷",
      "😸",
      "😹",
      "😺",
      "😻",
      "😼",
    ];

    const REACTION_EMOJIS = ["❤️", "👍", "😂", "👏", "😢"];
    let dragged = false;

    // --- REVISED MOCK DATA SERVICE ---
    // This service now maintains an internal, mutable state for messages.
    const ChatService = (() => {
      let _chatRooms = [];
      let _activeListeners = {};
      let _messages = {}; // This will be the mutable store for messages

      const initialRooms = [

      ];

      const initialMessagesData = {
      };

      // Initialize _chatRooms and _messages on first load
      _chatRooms = initialRooms;
      _messages = JSON.parse(JSON.stringify(initialMessagesData)); // Deep copy to ensure mutability

      return {
        getChatRooms: async () => {
          const snapshot = await getDocs(collection(db, "chatRooms"));
          return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },

        getMessages: (roomId) =>
          new Promise((resolve) => {
            setTimeout(() => resolve(_messages[roomId] || []), 300);
          }),

        editMessage: async (roomId, messageId, newText) => {
          const messageRef = doc(db, "MessagesChatRooms", roomId, "messages", messageId);
          await updateDoc(messageRef, {
            text: newText,
            lastEditedAt: serverTimestamp() // Add a timestamp to mark it as edited
          });
        },

        listenToMessages: (roomId, callback, messageLimit = 20) => {
          // Stop any existing listener for that room
          if (_activeListeners[roomId]) {
            _activeListeners[roomId](); // unsubscribe
            delete _activeListeners[roomId];
          }

          const messagesRef = collection(db, "MessagesChatRooms", roomId, "messages");
          const q = query(messagesRef, orderBy("timestamp", "desc"), limit(messageLimit));

          const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
              const messages = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              }));
              messages.reverse();
              _messages[roomId] = messages;
              callback(messages);
            },
            (error) => {
              console.error(`❌ Error listening to messages for room ${roomId}:`, error);
            }
          );

          _activeListeners[roomId] = unsubscribe;
          return unsubscribe;
        },

        addMessage: (roomId, message) => {
          return new Promise((resolve) => {
            setTimeout(() => {
              if (!_messages[roomId]) {
                _messages[roomId] = [];
              }
              _messages[roomId].push(message);
              resolve(message);
            }, 50); // Small delay for "realism"
          });
        },

        deleteMessage: async (roomId, messageId) => {
          const messageRef = doc(db, "MessagesChatRooms", roomId, "messages", messageId);
          await deleteDoc(messageRef);
        },

        pinMessage: async (roomId, message) => {
          const roomRef = doc(db, "chatRooms", roomId);
          // arrayUnion adds the message to the array only if it's not already there.
          await updateDoc(roomRef, {
            pinnedMessages: arrayUnion(message)
          });
        },

        listenToChatRooms: (userId, callback) => {
          const roomsQuery = query(
            collection(db, "chatRooms"),
            where("participantUIDs", "array-contains", userId)
          );

          const unsubscribe = onSnapshot(roomsQuery, (snapshot) => {
            const rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(rooms); // Pass the updated list of rooms to the callback
          });

          return unsubscribe; // Return the function to stop listening
        },

        unpinMessage: async (roomId, message) => {
          const roomRef = doc(db, "chatRooms", roomId);
          // arrayRemove removes all instances of the message from the array.
          await updateDoc(roomRef, {
            pinnedMessages: arrayRemove(message)
          });
        },

        hideMessageForUser: async (roomId, messageId, userId) => {
          const messageRef = doc(db, "MessagesChatRooms", roomId, "messages", messageId);
          await updateDoc(messageRef, {
            removeForMe: arrayUnion(userId)
          });
        },

        sendMessage: async (roomId, messageData) => {
          const messagesRef = collection(db, "MessagesChatRooms", roomId, "messages");

          await addDoc(messagesRef, {
            ...messageData,
            createdAt: serverTimestamp(),
          });

          // Optionally update lastMessage in `chatRooms/{roomId}`
          await updateDoc(doc(db, "chatRooms", roomId), {
            lastMessage: {
              text: messageData.text,
              senderId: messageData.senderId,
              createdAt: serverTimestamp(),
            }
          });
        },

        updateTypingStatus: async (roomId, userId, userName, isTyping) => {
          const roomRef = doc(db, "chatRooms", roomId);
          const typingField = `typing.${userId}`;

          if (isTyping) {
            // Add the user to the 'typing' map.
            await updateDoc(roomRef, {
              [typingField]: userName // Store the user's name
            });
          } else {
            await updateDoc(roomRef, {
              [typingField]: deleteField() // Use deleteField() to remove a key from a map
            });
          }
        },

        listenToTypingStatus: (roomId, callback) => {
          const roomRef = doc(db, "chatRooms", roomId);

          // Listen for real-time changes to the chat room document
          const unsubscribe = onSnapshot(roomRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
              const roomData = docSnapshot.data();
              const typingUsers = roomData.typing || {}; // The 'typing' map from Firestore
              callback(typingUsers);
            }
          });

          return unsubscribe; // Return the function to stop listening
        },

        addReaction: async (roomId, messageId, selectedEmoji, userId, allParticipants) => {
          const messageDocRef = doc(
            db,
            "MessagesChatRooms",
            roomId,
            "messages",
            String(messageId) // ✅ fix: ensure string
          );
          console.log("Adding reaction to message:", messageId, "in room:", roomId);
          try {
            const messageSnap = await getDoc(messageDocRef);
            if (!messageSnap.exists()) throw new Error("Message not found");

            const messageData = messageSnap.data();
            const user = allParticipants.find((u) => u.id === userId);
            const userName = user?.name || "Unknown";

            // Build new reactions map, removing existing reactions by this user
            const newReactions = {};
            for (const emoji in messageData.reactions || {}) {
              const others = messageData.reactions[emoji].filter(r => r.userId !== userId);
              if (others.length > 0) {
                newReactions[emoji] = others;
              }
            }

            // Add the new emoji if not already reacted
            const alreadyReacted = messageData.reactions?.[selectedEmoji]?.some(r => r.userId === userId);
            if (!alreadyReacted) {
              if (!newReactions[selectedEmoji]) {
                newReactions[selectedEmoji] = [];
              }
              newReactions[selectedEmoji].push({ userId, userName });
            }

            // Merge only the `reactions` field
            await setDoc(messageDocRef, {
              reactions: newReactions
            }, {
              mergeFields: ['reactions']
            });

            console.log("✅ Reactions updated safely");
            return newReactions;
          } catch (err) {
            console.error("❌ Failed to update reaction:", err);
            throw err;
          }
        },

        getRoomsForUser: async (userId) => {
          const roomsQuery = query(
            collection(db, "chatRooms"),
            where("participantUIDs", "array-contains", userId)
          );

          const snapshot = await getDocs(roomsQuery);
          return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },

        markMessagesAsRead: (roomId, currentUserId) => {
          return new Promise((resolve) => {
            setTimeout(() => {
              const roomMessages = _messages[roomId];
              if (roomMessages) {
                roomMessages.forEach((msg) => {
                  if (msg.senderId !== currentUserId) {
                    msg.read = true;
                  }
                });
              }
              resolve();
            }, 50);
          });
        },

      };
    })();

    async function showForwardModal(messageToForward) {
      // Remove any existing modal first
      document.querySelector('#modal-overlay')?.remove();

      // 1. Fetch all available chat rooms
      const userRooms = await ChatService.getRoomsForUser(chatState.currentUserId);
      let selectedRoomIds = new Set();

      // 2. Create the modal HTML structure
      const overlay = document.createElement('div');
      overlay.id = 'modal-overlay';
      overlay.innerHTML = `
        <div class="forward-modal">
            <div class="forward-modal-header">
                <h2>Forward to...</h2>
                <button class="close-modal-btn">&times;</button>
            </div>
            <div class="forward-modal-search">
                <i class="fas fa-search"></i>
                <input type="text" id="room-search-input" placeholder="Search for a chat room...">
            </div>
            <div class="forward-room-list">
                </div>
            <div class="forward-modal-footer">
                <button id="forward-btn" class="modal-btn modal-btn-confirm" disabled>Forward</button>
            </div>
        </div>
    `;

      // 3. Get references to key elements
      const roomListContainer = overlay.querySelector('.forward-room-list');
      const searchInput = overlay.querySelector('#room-search-input');
      const forwardBtn = overlay.querySelector('#forward-btn');

      // 4. Function to render the list of rooms
      const renderList = (rooms) => {
        roomListContainer.innerHTML = rooms.map(room => `
            <label class="room-item" for="room-${room.id}">
                <div class="room-info">
                    <span class="room-name">${room.name}</span>
                    <span class="room-members">${room.participantUIDs.length} members</span>
                </div>
                <input type="checkbox" id="room-${room.id}" data-room-id="${room.id}">
            </label>
        `).join('');
      };

      // 5. Initial render and event listeners
      renderList(userRooms);
      document.body.appendChild(overlay);

      // Search/filter functionality
      searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredRooms = userRooms.filter(room => room.name.toLowerCase().includes(searchTerm));
        renderList(filteredRooms);
      });

      // Checkbox selection logic
      roomListContainer.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
          const roomId = e.target.dataset.roomId;
          if (e.target.checked) {
            selectedRoomIds.add(roomId);
          } else {
            selectedRoomIds.delete(roomId);
          }
          forwardBtn.disabled = selectedRoomIds.size === 0;
        }
      });

      // Forward button logic
      forwardBtn.addEventListener('click', () => {
        // Prepare the forwarded message object
        const forwardedMessage = {
          ...messageToForward,
          isForwarded: true, // Add a flag to indicate it's a forwarded message
        };
        // Remove fields that should not be copied
        delete forwardedMessage.id;
        delete forwardedMessage.reactions;

        // Send the message to each selected room
        selectedRoomIds.forEach(roomId => {
          ChatService.sendMessage(roomId, forwardedMessage);
        });

        overlay.remove();
      });

      // Close button logic
      overlay.querySelector('.close-modal-btn').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') overlay.remove();
      });
    }

    // Make the chat container draggable
    function makeChatDraggable(currentUserId) {
      const container = document.getElementById("chat-container");
      const chatBox = document.getElementById("chat-box");
      const dragTargets = [container, document.getElementById("chat-header")];

      let isDragging = false;
      dragged = false;
      let offsetX = 0;
      let offsetY = 0;

      dragTargets.forEach((target) => {
        target.addEventListener("mousedown", (e) => {
          if (!chatBox.classList.contains("minimized")) return;

          isDragging = true;
          dragged = false;
          container.classList.add("dragging");

          const rect = container.getBoundingClientRect();
          offsetX = e.clientX - rect.left;
          offsetY = e.clientY - rect.top;

          e.preventDefault();
        });
      });

      document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        dragged = true;

        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;

        let x = e.clientX - offsetX;
        let y = e.clientY - offsetY;

        // Clamp X and Y within viewport bounds
        x = Math.max(0, Math.min(x, window.innerWidth - containerWidth));
        y = Math.max(0, Math.min(y, window.innerHeight - containerHeight));

        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
        container.style.bottom = "auto";
        container.style.right = "auto";

        localStorage.setItem(`${currentUserId}-chat-pos-x`, x);
        localStorage.setItem(`${currentUserId}-chat-pos-y`, y);
      });

      document.addEventListener("mouseup", () => {
        if (isDragging) {
          isDragging = false;
          container.classList.remove("dragging");
        }
      });
    }


    // Chat Controller State and Functions
    let chatState = {
      activeRoom: null,
      chatRooms: [],
      messages: {},
      inputText: "",
      isOpen: false,
      unreadCounts: {},
      isTyping: false,
      participantStatus: {},
      totalUnread: 0,
      isMinimized: true,
      isMaximized: false,
      currentUserId: currentUserId,
      currentUserName: "You",
      typingUsers: {},
      replyingTo: null,
      initialRoomSet: false,
      currentPinIndex: 0,
    };

    let typingListener = null;
    let typingTimeout = null;
    let statusInterval = null;
    let emojiPicker = null;
    let reactionPicker = null;
    let emojiClickHandler = null;
    let lastScrollTop = 0;

    function getChatState() {
      return chatState;
    }

    function setChatState(newState) {
      chatState = { ...chatState, ...newState };
      return chatState;
    }

    async function updateRoomMessagesFromService(roomId) {
      const messages = await ChatService.getMessages(roomId);
      const updatedMessages = { ...chatState.messages, [roomId]: messages };
      setChatState({ messages: updatedMessages });
    }

    async function addMessage(roomId, message) {
      await ChatService.addMessage(roomId, message);
      await updateRoomMessagesFromService(roomId);
    }

    // Add this new, more efficient markRoomAsRead function

    async function markRoomAsRead(roomId) {
      const { messages, currentUserId } = chatState;
      const roomMessages = messages[roomId] || [];
      if (!roomMessages.length) return;

      // Find all messages that are unread by the current user
      const unreadMessages = roomMessages.filter(
        (msg) => !msg.readBy?.[currentUserId]
      );

      // If there are no unread messages, do nothing
      if (unreadMessages.length === 0) {
        return;
      }

      // --- EFFICIENT BATCH WRITE ---
      // Use a batch to update all unread documents in one server request
      const batch = writeBatch(db);

      unreadMessages.forEach((msg) => {
        const messageRef = doc(db, "MessagesChatRooms", roomId, "messages", msg.id);
        // Use dot notation to update a field within a map
        batch.update(messageRef, { [`readBy.${currentUserId}`]: true });
      });

      try {
        await batch.commit();
        console.log(`✅ Marked ${unreadMessages.length} messages as read for user ${currentUserId} in room ${roomId}.`);

        // After successfully committing, update the local state and UI
        calculateUnreadCounts();

      } catch (error) {
        console.error("❌ Failed to mark messages as read:", error);
      }
    }

    // Replace the existing calculateUnreadCounts function
    function calculateUnreadCounts() {
      const counts = {};
      let total = 0;
      const { chatRooms, messages, currentUserId } = chatState;

      chatRooms.forEach((room) => {
        const roomMessages = messages[room.id] || [];

        // --- MODIFIED PART: Check the 'readBy' map ---
        const count = roomMessages.filter(
          (m) => !m.readBy?.[currentUserId] // Count if user's ID is NOT in readBy
        ).length;

        counts[room.id] = count;
        total += count;
      });

      setChatState({
        unreadCounts: counts,
        totalUnread: total,
      });

      // This is a good place to ensure the UI updates
      updateUnreadBadge(total);
      renderChatRooms();
    }

    function toggleEditMode(isActive) {
      const sendButton = document.getElementById('send-button');
      const fileButton = document.getElementById('file-button');
      const confirmEditButton = document.getElementById('confirm-edit-btn');
      const cancelEditButton = document.getElementById('cancel-edit-btn');
      const messageInput = document.getElementById('message-input');

      if (isActive) {
        // --- Enter edit mode ---

        // FIX: Enable the input field so it can be edited.
        messageInput.disabled = false;

        sendButton.classList.add('hidden');
        fileButton.classList.add('hidden');
        confirmEditButton.classList.remove('hidden');
        cancelEditButton.classList.remove('hidden');
        messageInput.focus();
      } else {
        // --- Exit edit mode ---
        messageInput.disabled = false;

        sendButton.classList.remove('hidden');
        fileButton.classList.remove('hidden');
        confirmEditButton.classList.add('hidden');
        cancelEditButton.classList.add('hidden');
        messageInput.value = '';
        setChatState({ editingMessage: null });
      }
    }

    async function initializeChat() {
      console.log("INITALIZED CHAT");
      try {
        const userRef = doc(db, "users", currentUserId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          // Get the name from the user's document
          const userName = userSnap.data().name || "Guest"; // Fallback to "Guest" if name is not set
          // Update the global state with the fetched name
          setChatState({ currentUserName: userName });
          console.log(`✅ Current user name set to: ${userName}`);
        } else {
          console.warn(`User document not found for ID: ${currentUserId}. Defaulting name.`);
          setChatState({ currentUserName: "Guest" });
        }
      } catch (error) {
        console.error("❌ Error fetching user data:", error);
        // In case of an error, we can still proceed with a default name
        setChatState({ currentUserName: "Guest" });
      }
      await ensureChatRoomExistsForProject(currentProjectId, currentLoadedProjectData);
      await loadChatData();
      setupEventListeners();
      setupParticipantStatusUpdates();
      setupFilePicker();
      setupEmojiPicker();
    }

    async function ensureChatRoomExistsForProject(currentProjectId, currentLoadedProjectData) {
      const chatRoomRef = collection(db, "chatRooms");
      const existingRoomRef = doc(chatRoomRef, currentProjectId);
      const existingSnap = await getDoc(existingRoomRef);

      const memberUIDs = currentLoadedProjectData.memberUIDs || [];

      if (memberUIDs.length === 0) {
        console.log("No members found in currentLoadedProjectData. Skipping chat room creation.");
        return;
      }

      const participantUIDsSorted = [...memberUIDs].sort(); // Always keep sorted for comparison

      if (existingSnap.exists()) {
        const existingData = existingSnap.data();
        const existingUIDs = (existingData.participantUIDs || []).sort();

        // Check if member list has changed
        const isSame =
          participantUIDsSorted.length === existingUIDs.length &&
          participantUIDsSorted.every((uid, idx) => uid === existingUIDs[idx]);

        if (isSame) {
          console.log("Chat room already exists and participants are unchanged. Skipping update.");
          return;
        }

        console.log("Participants changed. Updating chat room for project:", currentProjectId);
      } else {
        console.log("No existing chat room found for project:", currentProjectId);
      }

      // Fetch full participant data
      const userPromises = memberUIDs.map(async (uid) => {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();
          const name = userData.name || userData.displayName || "";
          const email = userData.email || "";
          const avatar = userData.avatar || "";
          const status = {
            online: userData.online || false,
            lastSeen: userData.lastSeen?.toDate?.() || null,
            name
          };

          return {
            id: uid,
            name,
            email,
            avatar,
            status
          };
        } else {
          console.log("User not found in database:", uid);
          return null;
        }
      });

      const participants = (await Promise.all(userPromises)).filter(p => p !== null);

      // Set or update chat room
      await setDoc(existingRoomRef, {
        projectId: currentProjectId,
        name: currentLoadedProjectData.title,
        participants,
        participantUIDs: participantUIDsSorted,
        createdAt: Date.now(),
        lastMessage: null
      });

      // Ensure MessageChatRoom exists too
      const messageChatRoomRef = doc(db, "MessagesChatRooms", currentProjectId);
      const messageRoomSnap = await getDoc(messageChatRoomRef);
      if (!messageRoomSnap.exists()) {
        await setDoc(messageChatRoomRef, {
          roomId: currentProjectId,
          createdAt: Date.now()
        });
      }

      console.log("Chat room (and MessageChatRoom if new) created/updated with ID:", currentProjectId);
    }

    async function loadChatData() {
      const rooms = await ChatService.getRoomsForUser(currentUserId);
      const container = document.getElementById("chat-container");
      const messagesData = {};

      for (const room of rooms) {
        messagesData[room.id] = await ChatService.getMessages(room.id);
      }

      const statusData = {};

      if (rooms.length > 0 && !chatState.initialRoomSet) {
        const projectRoom = rooms.find(r => r.id === currentProjectId);

        if (projectRoom) {
          await setActiveRoom(projectRoom);
        } else {
          await setActiveRoom(rooms[0]);
        }
        setChatState({ initialRoomSet: true });
      }

      ChatService.listenToChatRooms(currentUserId, (updatedRooms) => {

        // When the listener fires, update the chat state with the latest room data.
        setChatState({ chatRooms: updatedRooms });

        // If there's an active room, find its latest version to keep the state fresh.
        if (chatState.activeRoom) {
          const updatedActiveRoom = updatedRooms.find(r => r.id === chatState.activeRoom.id);
          if (updatedActiveRoom) {
            setChatState({ activeRoom: updatedActiveRoom });
          }
        }

        // Now that the room data is fresh, render the UI that depends on it.
        renderPinnedMessages();
        renderChatRooms(); // Re-render the room tabs
      });

      // Attach message listeners for real-time updates
      rooms.forEach((room) => {
        ChatService.listenToMessages(room.id, (newMessages) => {
          chatState.messages[room.id] = newMessages;
          if (chatState.activeRoom?.id !== room.id) {
            const unreadCount = newMessages.filter(
              (msg) => msg.senderId !== currentUserId && !msg.read
            ).length;
            chatState.messages[room.id].unreadCount = unreadCount;
          }

          updateUnreadBadge(calculateUnreadCounts());

          renderAll();
        });
      });
      updateUnreadBadge(calculateUnreadCounts());
      renderAll();
    }


    function setupFilePicker() {
      const fileButton = document.getElementById("file-button");
      const fileInput = document.getElementById("file-input");

      fileButton.addEventListener("click", () => fileInput.click());

      fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
          const file = e.target.files[0];
          handleFileUpload(file);
          fileInput.value = "";
        }
      });
    }

    function setupEmojiPicker() {
      const emojiButton = document.getElementById("emoji-button");
      if (!emojiButton) return;

      let existingEmojiPicker = document.querySelector(".emoji-picker");
      if (existingEmojiPicker) {
        existingEmojiPicker.remove();
      }

      emojiPicker = document.createElement("div");
      emojiPicker.className = "emoji-picker";
      emojiPicker.innerHTML = `
          <div class="emoji-header">
            <span>Select Emoji</span>
            <button class="emoji-close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="emoji-container"></div>
        `;

      const container = emojiPicker.querySelector(".emoji-container");
      EMOJIS.forEach((emoji) => {
        const item = document.createElement("div");
        item.className = "emoji-item";
        item.textContent = emoji;
        item.addEventListener("click", () => {
          insertEmoji(emoji);
          emojiPicker.classList.remove("open");
        });
        container.appendChild(item);
      });

      emojiPicker
        .querySelector(".emoji-close")
        .addEventListener("click", () => {
          emojiPicker.classList.remove("open");
        });

      const chatBox = document.getElementById("chat-box");
      if (chatBox) {
        chatBox.appendChild(emojiPicker);
      }

      emojiButton.addEventListener("click", (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle("open");
        if (emojiPicker.classList.contains("open")) {
          updateEmojiPickerPosition();
        }
      });

      emojiClickHandler = (e) => {
        if (!emojiPicker || !emojiButton) return;
        if (
          !emojiPicker.contains(e.target) &&
          e.target !== emojiButton &&
          !emojiButton.contains(e.target)
        ) {
          emojiPicker.classList.remove("open");
        }
      };
      document.removeEventListener("click", emojiClickHandler);
      document.addEventListener("click", emojiClickHandler);
    }

    function insertEmoji(emoji) {
      const input = document.getElementById("message-input");
      const startPos = input.selectionStart;
      const endPos = input.selectionEnd;

      input.value =
        input.value.substring(0, startPos) +
        emoji +
        input.value.substring(endPos);
      input.focus();
      input.selectionStart = input.selectionEnd = startPos + emoji.length;
      setChatState({ inputText: input.value });
      updateSendButtonState(!!input.value.trim() && !!chatState.activeRoom);
    }

    async function handleFileUpload(file) {
      const { activeRoom } = chatState;
      if (!activeRoom || !file) return;

      const roomId = activeRoom.id;
      const filePath = `chatFiles/${roomId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, filePath);

      const userRef = doc(db, "users", currentUserId);
      const userSnap = await getDoc(userRef);
      const senderName = userSnap.exists() ? userSnap.data().name : "Unknown";

      try {
        // Upload file to Firebase Storage
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        const isImage = file.type.startsWith("image/");
        const isPDF = file.type === "application/pdf";
        const isWord =
          file.type === "application/msword" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

        // Construct appropriate message text
        let messageText = "";
        if (isImage) {
          messageText = downloadURL; // For images, show preview
        } else {
          messageText = `[File: ${file.name}]`; // For documents or other types
        }

        const fileMessage = {
          text: messageText,
          senderName: senderName,
          senderId: chatState.currentUserId,
          timestamp: serverTimestamp(),
          read: true,
          status: MESSAGE_STATUS.SENT,
          isFile: true,
          fileInfo: {
            name: file.name,
            type: file.type,
            size: file.size,
            url: downloadURL,
          },
          reactions: {},
        };

        // Save in local store
        await addMessage(roomId, fileMessage);
        renderMessages();

        // Optionally also send to Firestore (if sendMessage also handles uploads, skip this part)
        await ChatService.sendMessage(roomId, {
          ...fileMessage,
          text: messageText,
          imageFile: null, // already uploaded
          imageUrl: isImage ? downloadURL : null,
        });

        setChatState({ isTyping: false });

        setTimeout(async () => {
          const { isOpen, activeRoom: currentRoom } = chatState;
          if (isOpen && currentRoom?.id === roomId) {
            await markRoomAsRead(roomId);
          } else {
            calculateUnreadCounts();
            updateUnreadBadge(chatState.totalUnread);
          }
          renderMessages();
        }, 1500);
      } catch (error) {
        console.error("File upload failed:", error);
        alert("Failed to upload file. Please try again.");
      }
    }

    function setupParticipantStatusUpdates() {
      statusInterval = setInterval(() => {
        const { participantStatus } = chatState;
        const updated = { ...participantStatus };

        Object.keys(updated).forEach((id) => {
          if (Math.random() > 0.8) {
            updated[id] = {
              ...updated[id],
              online: Math.random() > 0.5,
              lastSeen: new Date(),
            };
          }
        });

        setChatState({ participantStatus: updated });
        if (chatState.isOpen) renderMessages();
      }, 30000);
    }

    function setupEventListeners(currentUserId) {
      const container = document.getElementById("chat-container");
      const chatBox = document.getElementById("chat-box");

      // Make draggable
      makeChatDraggable(currentUserId);
      minimizeChat();
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const overlay = document.getElementById("image-preview-overlay");
          overlay.classList.add("hidden");
          document.getElementById("image-preview-full").src = "";
        }
      });

      document.addEventListener("click", (e) => {
        const target = e.target;

        // Open preview
        if (target.classList.contains("preview-image")) {
          const imageUrl = target.dataset.url;
          const overlay = document.getElementById("image-preview-overlay");
          const fullImg = document.getElementById("image-preview-full");

          fullImg.src = imageUrl;
          overlay.classList.remove("hidden");
        }

        // Close preview when clicking outside the image
        if (target.id === "image-preview-overlay") {
          target.classList.add("hidden");
          document.getElementById("image-preview-full").src = "";
        }
      });

      document.getElementById('confirm-edit-btn').addEventListener('click', () => {
        const { editingMessage, activeRoom } = chatState;
        const newText = document.getElementById('message-input').value.trim();

        if (editingMessage && activeRoom && newText) {
          ChatService.editMessage(activeRoom.id, editingMessage.id, newText);
        }
        toggleEditMode(false); // Exit edit mode
      });


      document.getElementById('cancel-edit-btn').addEventListener('click', () => {
        toggleEditMode(false); // Exit edit mode
      });

      document.getElementById("chat-button").addEventListener("click", () => {
        toggleChat();
      });

      document.getElementById("minimize-chat").addEventListener("click", (e) => {
        e.stopPropagation();
        minimizeChat();

        // Return to draggable position
        const savedX = localStorage.getItem(`${currentUserId}-chat-pos-x`);
        const savedY = localStorage.getItem(`${currentUserId}-chat-pos-y`);
        if (savedX && savedY) {
          container.style.left = `${savedX}px`;
          container.style.top = `${savedY}px`;
          container.style.right = "auto";
          container.style.bottom = "auto";
        }
      });

      document.getElementById("toggle-minmax").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMaximize();
      });
      document.getElementById("close-chat").addEventListener("click", (e) => {
        e.stopPropagation();
        minimizeChat();

        // Return to draggable position
        const savedX = localStorage.getItem(`${currentUserId}-chat-pos-x`);
        const savedY = localStorage.getItem(`${currentUserId}-chat-pos-y`);
        if (savedX && savedY) {
          container.style.left = `${savedX}px`;
          container.style.top = `${savedY}px`;
          container.style.right = "auto";
          container.style.bottom = "auto";
        }
      });

      document.getElementById("chat-header").addEventListener("click", expandChat);

      document.getElementById("send-button").addEventListener("click", handleSend);

      document.getElementById("message-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { // Using !e.shiftKey allows Shift+Enter for new lines
          e.preventDefault();
          if (chatState.editingMessage) {
            document.getElementById('confirm-edit-btn').click();
          } else {
            document.getElementById('send-button').click();
          }
        }
      });

      document
        .getElementById("message-input")
        .addEventListener("input", (e) => {
          const { activeRoom } = chatState;
          const hasText = !!e.target.value.trim();
          setChatState({ inputText: e.target.value });
          updateSendButtonState(hasText && !!activeRoom);
          handleTyping(hasText);
        });

      // Restore position on load
      const savedX = localStorage.getItem(`${currentUserId}-chat-pos-x`);
      const savedY = localStorage.getItem(`${currentUserId}-chat-pos-y`);
      if (savedX && savedY) {
        container.style.left = `${savedX}px`;
        container.style.top = `${savedY}px`;
        container.style.right = "auto";
        container.style.bottom = "auto";
      }

      // Minimize chat if clicked outside chat-box
      document.addEventListener("mousedown", (e) => {
        const chatBox = document.getElementById("chat-box");
        const chatContainer = document.getElementById("chat-container");
        const optionsMenu = document.querySelector('.options-menu');
        const modalOverlay = document.querySelector('#modal-overlay');

        const isOpen = chatState.isOpen;

        if (
          isOpen &&
          chatBox &&
          !chatBox.contains(e.target) &&
          !chatContainer.contains(e.target) &&
          !optionsMenu?.contains(e.target) &&
          !modalOverlay?.contains(e.target)
        ) {
          minimizeChat();
        }
      });
      // Scroll handler
      window.addEventListener("scroll", handleScroll);
    }

    function minimizeChat() {
      const chatBox = document.getElementById("chat-box");
      const toggleIcon = document.getElementById("toggle-minmax-icon");
      chatBox.classList.remove("open");
      chatBox.classList.add("minimized");
      chatBox.style.display = "none"; // hide on minimize
      chatBox.classList.remove("maximized");
      setChatState({ ...chatState, isOpen: false, isMinimized: true });
      chatBox.classList.remove("maximized");
      toggleIcon.classList.remove("fa-compress");
      toggleIcon.classList.add("fa-expand");

      document.getElementById("chat-button").classList.remove("hidden");
    }
    function handleScroll() {
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;
      const shouldScroll = scrollTop > 100 && scrollTop > lastScrollTop;
      document
        .getElementById("chat-container")
        .classList.toggle("scrolled", shouldScroll);
      lastScrollTop = scrollTop;
    }

    function toggleChat() {
      const container = document.getElementById("chat-container");
      const chatBox = document.getElementById("chat-box");
      const chatButton = document.getElementById("chat-button");
      const minimizedBadge = document.getElementById("minimized-unread-badge");

      if (dragged) {
        dragged = false; // Reset the flag for the next click
        return;          // Exit the function
      }
      // --- 1. Reset the Chatbox from its Minimized State ---

      // NEW: Remove the minimized class to reset its appearance.
      chatBox.classList.remove("minimized");
      minimizedBadge.classList.add("hidden");
      // NEW: Clear any inline display styles from the minimize function.
      chatBox.style.display = '';


      // --- 2. Get Essential Dimensions ---
      const containerRect = container.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };

      // Temporarily show the chatbox to measure its actual size
      chatBox.style.display = "flex"; // Now this will work correctly
      chatBox.classList.add("open");
      chatBox.style.visibility = "hidden";

      const chatBoxSize = {
        width: chatBox.offsetWidth,
        height: chatBox.offsetHeight
      };

      // --- 2. Calculate Vertical Position (Flip Up/Down) ---

      // Space available above and below the button
      const spaceAbove = containerRect.top;
      const spaceBelow = viewport.height - containerRect.bottom;

      // Reset previous inline styles
      chatBox.style.top = 'auto';
      chatBox.style.bottom = 'auto';

      if (spaceBelow < chatBoxSize.height && spaceAbove > chatBoxSize.height) {
        // Not enough space below, BUT enough space above. FLIP UP!
        // Position the bottom of the chatbox to the top of the button.
        chatBox.style.bottom = `${containerRect.height + 0}px`; // 10px margin
      } else {
        // Default: Position the top of the chatbox to the bottom of the button.
        chatBox.style.top = `${containerRect.height + 0}px`; // 10px margin
      }


      // --- 3. Calculate Horizontal Position (Flip Left/Right) ---

      // Reset previous inline styles
      chatBox.style.left = 'auto';
      chatBox.style.right = 'auto';

      if (containerRect.left + chatBoxSize.width > viewport.width) {
        // If opening to the right would go off-screen, FLIP LEFT!
        // Align the right edge of the chatbox with the right edge of the button.
        chatBox.style.right = '0px';
      } else {
        // Default: Align the left edge of the chatbox with the left edge of the button.
        chatBox.style.left = '0px';
      }

      chatButton.classList.add("hidden");
      chatBox.style.visibility = "visible";
      setChatState({ isOpen: true, isMinimized: false });
      scrollToBottom(document.getElementById("messages-container"), true);
    }

    function expandChat() {
      const chatBox = document.getElementById("chat-box");
      if (dragged) {
        dragged = false; // Reset the flag for the next click
        return;          // Exit the function
      }
      if (chatBox.classList.contains("minimized")) {
        chatBox.classList.remove("minimized");
        chatBox.classList.add("open");
        if (chatState.isMaximized) {
          chatBox.classList.add("maximized");
        }

        const { activeRoom } = chatState;
        if (activeRoom) {
          markRoomAsRead(activeRoom.id);
          updateUnreadBadge(chatState.totalUnread);
        }

        setChatState({ isOpen: true, isMinimized: false });
        document.getElementById("chat-button").classList.add("hidden");
        document
          .getElementById("minimized-unread-badge")
          .classList.add("hidden");
      }
      scrollToBottom(document.getElementById("messages-container"), true);
    }

    function toggleMaximize() {
      const chatBox = document.getElementById("chat-box");
      const container = document.getElementById("chat-container");
      const toggleIcon = document.getElementById("toggle-minmax-icon");

      if (chatState.isMaximized) {
        // Restore position
        const prevStyle = chatState.prevStyle || {};
        container.style.top = prevStyle.top || "";
        container.style.left = prevStyle.left || "";
        container.style.right = prevStyle.right || "";
        container.style.bottom = prevStyle.bottom || "";

        chatBox.classList.remove("maximized");
        toggleIcon.classList.remove("fa-compress");
        toggleIcon.classList.add("fa-expand");

        setChatState({ ...chatState, isMaximized: false });

        minimizeChat();
        toggleChat();
      } else {
        const prevStyle = {
          top: container.style.top,
          left: container.style.left,
          right: container.style.right,
          bottom: container.style.bottom,
        };

        chatBox.classList.remove("align-left", "align-right", "align-up", "align-down");
        chatBox.style.top = '';
        chatBox.style.bottom = '';
        chatBox.style.left = '';
        chatBox.style.right = '';
        chatBox.style.transform = '';

        chatBox.classList.add("maximized");
        toggleIcon.classList.remove("fa-expand");
        toggleIcon.classList.add("fa-compress");

        setChatState({ ...chatState, isMaximized: true, prevStyle });

        scrollToBottom(document.getElementById("messages-container"), true);
      }


      // Reposition floating elements if visible
      if (emojiPicker?.classList.contains("open")) updateEmojiPickerPosition();
      if (reactionPicker?.classList.contains("open")) {
        updateReactionPickerPosition(
          reactionPicker.dataset.messageId,
          reactionPicker.dataset.targetElementId
        );
      }
    }

    function closeChat() {
      const chatBox = document.getElementById("chat-box");
      chatBox.classList.remove("open", "minimized", "maximized");
      setChatState({
        isOpen: false,
        isMinimized: false,
        isMaximized: false,
      });
      document.getElementById("chat-button").classList.remove("hidden");
      document.getElementById("minimized-unread-badge").classList.add("hidden");

      if (reactionPicker) {
        reactionPicker.remove();
        reactionPicker = null;
      }
    }

    async function sendMessage(roomId, text, currentUserId) {
      const trimmedText = text.trim();
      if (!trimmedText || !currentUserId || !roomId) return;

      // 1. Fetch sender's name from users/{currentUserId}
      const userRef = doc(db, "users", currentUserId);
      const userSnap = await getDoc(userRef);
      const senderName = userSnap.exists() ? userSnap.data().name : "Unknown";

      // 2. Prepare message object
      const message = {
        text: trimmedText,
        senderId: currentUserId,
        senderName,
        timestamp: serverTimestamp(),
        read: true,
        reactions: {},
        status: "sent"
      };

      // 3. Save message to messagesChatRooms/{roomId}/messages
      const messagesRef = collection(db, "MessagesChatRooms", roomId, "messages");
      await addDoc(messagesRef, message);

      // 4. Update lastMessage inside chatRooms/{roomId}
      const chatRoomRef = doc(db, "chatRooms", roomId);
      await updateDoc(chatRoomRef, {
        lastMessage: {
          text: trimmedText,
          senderId: currentUserId,
          senderName,
          timestamp: serverTimestamp()
        }
      });
    }
    async function handleSend() {
      const {
        inputText,
        activeRoom,
        currentUserId,
        currentUserName,
        replyingTo
      } = chatState;
      const trimmedText = inputText.trim();

      // --- Defensive Checks ---
      // Exit if there's no text or no active room selected.
      if (!trimmedText || !activeRoom) {
        return;
      }

      // --- FIX: Capture the Room ID at the time of sending ---
      // This prevents the message from being sent to the wrong room if the user switches rooms quickly.
      const targetRoomId = activeRoom.id;

      // --- Clear the input immediately for a better user experience ---
      setChatState({
        inputText: "",
        replyingTo: null
      });
      document.getElementById("message-input").value = "";
      updateSendButtonState(false); // Disable the send button right away
      renderReplyContext();

      let replyData = null;
      if (replyingTo) {
        replyData = {
          messageId: replyingTo.id,
          senderName: replyingTo.senderName,
          // Create a short snippet of the text
          text: replyingTo.text.length > 70 ? replyingTo.text.substring(0, 70) + '...' : replyingTo.text,
        };
      }

      // --- Prepare the message object ---
      // Note: We use serverTimestamp() for consistency across clients.
      const messageData = {
        text: trimmedText,
        senderId: currentUserId,
        senderName: currentUserName, // Use the name from the state
        timestamp: serverTimestamp(), // Let Firestore determine the time
        readBy: {
          [currentUserId]: true // Initialize with the sender's ID
        },
        status: MESSAGE_STATUS.SENT,
        reactions: {},
        replyTo: replyData,
      };

      try {
        // --- The Core Sending Logic ---
        // We now directly call the service that interacts with Firestore.
        // We no longer call `addMessage` locally to prevent duplication.
        // The `onSnapshot` listener will handle adding the message to the UI.
        await ChatService.sendMessage(targetRoomId, messageData);

        // --- Post-Send Actions ---
        // After the message is successfully sent, scroll the chat to the bottom.
        // This ensures the user sees their newly sent message.
        const messagesContainer = document.getElementById("messages-container");
        if (messagesContainer) {
          scrollToBottom(messagesContainer, true); // Force scroll
        }

      } catch (error) {
        // --- Error Handling ---
        // If the message fails to send, log the error and inform the user.
        console.error("❌ Failed to send message:", error);

        // Optional: Restore the input text so the user can retry sending.
        setChatState({
          inputText: trimmedText
        });
        document.getElementById("message-input").value = trimmedText;
        updateSendButtonState(true); // Re-enable the button

        // You could also display a more user-friendly error message in the UI.
        // For example: append a "Failed to send" status to the message.
      }
    }

    async function handleReaction(messageId, reaction) {
      const { activeRoom, currentUserId, chatRooms } = chatState;
      if (!activeRoom) return;

      const allParticipants = chatRooms.find(
        (room) => room.id === activeRoom.id
      ).participants;

      try {
        const updatedReactions = await ChatService.addReaction(
          activeRoom.id,
          messageId,
          reaction,
          currentUserId,
          allParticipants
        );
        setChatState((prevState) => {
          const updatedMessages = { ...prevState.messages };
          const roomMessages = [...(updatedMessages[activeRoom.id] || [])];
          const messageIndex = roomMessages.findIndex(
            (msg) => msg.id === messageId
          );
          if (messageIndex > -1) {
            roomMessages[messageIndex] = {
              ...roomMessages[messageIndex],
              reactions: updatedReactions,
            };
          }
          updatedMessages[activeRoom.id] = roomMessages;
          return { messages: updatedMessages };
        });
        //renderMessages();

        if (reactionPicker) {
          reactionPicker.classList.remove("open");
          setTimeout(() => {
            if (reactionPicker) {
              reactionPicker.remove();
              reactionPicker = null;
            }
          }, 150);
        }
      } catch (error) {
        console.error("Error adding reaction:", error);
      }
    }


    function showReactionPicker(messageId, targetElement) {
      if (reactionPicker) {
        reactionPicker.remove();
        reactionPicker = null;
      }

      reactionPicker = document.createElement("div");
      reactionPicker.className = "reaction-picker";
      reactionPicker.innerHTML = REACTION_EMOJIS.map(
        (emoji) =>
          `<span class="reaction-emoji" data-reaction="${emoji}">${emoji}</span>`
      ).join("");

      reactionPicker.dataset.messageId = messageId;
      reactionPicker.dataset.targetElementId =
        targetElement.id || `react-btn-${messageId}`;
      if (!targetElement.id) targetElement.id = `react-btn-${messageId}`;

      document.body.appendChild(reactionPicker);

      reactionPicker.classList.add("open");
      updateReactionPickerPosition(messageId, targetElement.id);

      reactionPicker.querySelectorAll(".reaction-emoji").forEach((emojiBtn) => {
        emojiBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          handleReaction(messageId, emojiBtn.dataset.reaction);
        });
      });

      const closePicker = (e) => {
        if (
          reactionPicker &&
          !reactionPicker.contains(e.target) &&
          e.target !== targetElement
        ) {
          reactionPicker.classList.remove("open");
          setTimeout(() => {
            if (reactionPicker) {
              reactionPicker.remove();
              reactionPicker = null;
            }
          }, 150);
          document.removeEventListener("click", closePicker);
        }
      };
      setTimeout(() => {
        document.addEventListener("click", closePicker);
      }, 0);
    }

    function updateReactionPickerPosition(messageId, targetElementId) {
      const targetElement = document.getElementById(targetElementId);
      if (!reactionPicker || !targetElement) return;

      const chatBox = document.getElementById("chat-box");
      const isMaximized = chatBox.classList.contains("maximized");

      const targetRect = targetElement.getBoundingClientRect();

      if (isMaximized) {
        reactionPicker.style.position = "fixed";
        reactionPicker.style.bottom = `${window.innerHeight - targetRect.top + 5
          }px`;
        reactionPicker.style.left = `${targetRect.left + targetRect.width / 2
          }px`;
        reactionPicker.style.transform = `translateX(-50%)`;
        reactionPicker.style.top = "auto";
      } else {
        let messageContainer = targetElement.closest(".message-container");
        if (!messageContainer) {
          console.warn(
            "Could not find message-container for reaction picker positioning."
          );
          return;
        }
        const messageContainerRect = messageContainer.getBoundingClientRect();

        reactionPicker.style.position = "absolute";
        const pickerBottom =
          messageContainerRect.height -
          (targetRect.top - messageContainerRect.top) +
          5;
        const pickerLeft =
          targetRect.left - messageContainerRect.left + targetRect.width / 2;

        reactionPicker.style.bottom = `${pickerBottom}px`;
        reactionPicker.style.left = `${pickerLeft}px`;
        reactionPicker.style.transform = `translateX(-50%)`;
        reactionPicker.style.top = "auto";
        messageContainer.appendChild(reactionPicker);
      }
    }

    async function setActiveRoom(room) {
      const container = document.getElementById("messages-container");
      const inputField = document.getElementById("message-input");

      // --- Stop the old typing listener if it exists ---
      if (typingListener) {
        typingListener(); // Unsubscribe from the previous room's typing status
        typingListener = null;
      }

      inputField.disabled = true;
      container.innerHTML = `<div class="text-center py-4 text-gray-400">Loading messages...</div>`;

      setChatState({
        activeRoom: room,
        inputText: "",
        typingUsers: {}
      }); // Reset typing users on room change

      // --- Start new listeners for the new room ---
      // Listener for messages
      ChatService.listenToMessages(room.id, (newMessages) => {
        const updated = {
          ...chatState.messages,
          [room.id]: newMessages
        };
        setChatState({
          messages: updated
        });
        renderMessages();
        renderPinnedMessages()
        inputField.disabled = false;
        inputField.focus();
      });

      typingListener = ChatService.listenToTypingStatus(room.id, (typingData) => {
        const typingContainer = document.getElementById('typing-indicator-container');
        const otherTypingUsers = Object.entries(typingData).filter(([id]) => id !== currentUserId);

        if (otherTypingUsers.length > 0) {
          const typingNames = otherTypingUsers.map(([, name]) => name);
          typingContainer.innerHTML = renderTypingIndicator(typingNames);
        } else {
          typingContainer.innerHTML = '';
        }
      });


      await markRoomAsRead(room.id);
      updateUnreadBadge(chatState.totalUnread);

      document.getElementById("active-room-name").textContent = room.name;
    }

    function renderAll() {
      renderChatRooms();
      renderMessages();
      calculateUnreadCounts();
      updateUnreadBadge(chatState.totalUnread);
    }

    function renderChatRooms() {
      const { chatRooms, activeRoom, unreadCounts } = chatState;
      const selector = document.getElementById("chat-room-selector");
      selector.innerHTML = "";

      chatRooms.forEach((room) => {
        const roomButton = document.createElement("button");
        roomButton.className = `chat-room-selector-item ${activeRoom?.id === room.id ? "selected" : ""
          }`;
        const unreadCount = unreadCounts[room.id] || 0;
        const isSelected = activeRoom?.id === room.id;
        let buttonHTML = room.name;

        // If there are unread messages, add the badge
        if (unreadCount > 0 && !isSelected) {
          buttonHTML += `<span class="unread-count">${unreadCount}</span>`;
        }

        roomButton.innerHTML = buttonHTML;

        roomButton.addEventListener("click", () => {
          setActiveRoom(room);
          document
            .querySelectorAll(".chat-room-selector-item")
            .forEach((item) => {
              item.classList.remove("selected");
            });
          roomButton.classList.add("selected");
        });

        selector.appendChild(roomButton);
      });
    }

    function formatTimestamp(timestamp) {
      if (!timestamp) return "";

      let messageDate;

      try {
        if (typeof timestamp === "object" && typeof timestamp.toDate === "function") {
          // Firestore Timestamp
          messageDate = timestamp.toDate();
        } else {
          // String or number
          messageDate = new Date(timestamp);
        }

        if (isNaN(messageDate.getTime())) return ""; // Invalid date fallback

        const now = new Date();
        const isToday = now.toDateString() === messageDate.toDateString();

        if (isToday) {
          return messageDate.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
        } else {
          return (
            messageDate.toLocaleDateString() +
            " " +
            messageDate.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          );
        }
      } catch (e) {
        console.error("❌ Error parsing timestamp:", timestamp, e);
        return "";
      }
    }

    function renderReplyContext() {
      const replyBar = document.getElementById("reply-context-bar");
      const { replyingTo } = chatState;

      if (replyingTo && replyBar) {
        replyBar.innerHTML = `
            <div class="reply-content">
                <span class="reply-sender">Replying to ${replyingTo.senderName}</span>
                <span class="reply-text">${replyingTo.text}</span>
            </div>
            <button class="cancel-reply-btn" title="Cancel Reply">&times;</button>
        `;

        replyBar.querySelector('.cancel-reply-btn').onclick = () => {
          setChatState({ replyingTo: null });
          renderReplyContext(); // This will hide the bar
        };

        replyBar.classList.remove("hidden");
        document.getElementById("message-input").focus();
      } else if (replyBar) {
        replyBar.classList.add("hidden");
      }
    }

    function renderMessages() {
      const { activeRoom, messages, typingUsers, participantStatus } = chatState;
      const roomMessages = activeRoom ? messages[activeRoom.id] || [] : [];
      const container = document.getElementById("messages-container");

      const wasScrolledToBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 20; // 20px buffer

      const visibleMessages = roomMessages.filter(
        msg => !msg.removeForMe?.includes(currentUserId)
      );

      if (!activeRoom || visibleMessages.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-comment-slash text-3xl mb-2"></i>
                <p>No messages yet</p>
                <p class="text-sm mt-1">Start the conversation!</p>
            </div>
        `;
        return;
      }

      let messagesHTML = visibleMessages
        .map((msg) => renderMessage(msg, chatState.participantStatus))
        .join("");

      const otherTypingUsers = Object.entries(typingUsers).filter(([id]) => id !== currentUserId);
      if (otherTypingUsers.length > 0) {
        const typingNames = otherTypingUsers.map(([, name]) => name);
        messagesHTML += renderTypingIndicator(typingNames); // Pass names to the renderer
      }

      container.innerHTML = messagesHTML;
      if (wasScrolledToBottom) {
        scrollToBottom(container, true); // Force scroll if previously at bottom
      }

      roomMessages.forEach((msg) => {
        const messageElement = container.querySelector(
          `[data-message-id="${msg.id}"]`
        );
        if (messageElement) {
          const reactButton = messageElement.querySelector(".react-button");
          if (reactButton) {
            if (!reactButton.id) {
              reactButton.id = `react-btn-${msg.id}`;
            }
            reactButton.addEventListener("click", (e) => {
              e.stopPropagation();
              console.log("React button clicked for message:", msg.id);
              showReactionPicker(msg.id, reactButton);
            });
          }
        }
      });

      container.querySelectorAll('.options-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation(); // Prevents other click events from firing

          // Find the message data associated with the button that was clicked
          const messageId = e.target.closest('.message-wrapper').dataset.messageId;
          const message = roomMessages.find(m => m.id === messageId);

          if (message) {
            // Call the function to create and show the menu
            showOptionsMenu(e, message);
          }
        };
      });

      container.querySelectorAll('.reply-btn').forEach(btn => {
        btn.onclick = (e) => {
          const messageId = e.target.closest('.message-wrapper').dataset.messageId;
          const messageToReply = roomMessages.find(m => m.id === messageId);
          if (messageToReply) {
            setChatState({ replyingTo: messageToReply });
            renderReplyContext();
          }
        };
      });

    }

    function renderMessage(msg, participantStatus) {
      const isUser = msg.senderId === currentUserId;
      const isFile = msg.isFile;

      // --- 1. Determine Online Status ---
      const statusInfo = !isUser && participantStatus[msg.senderId]
        ? `<span class="ml-2 text-xs">${participantStatus[msg.senderId].online
          ? '<span class="text-green-500 flex items-center"><span class="w-2 h-2 bg-green-500 rounded-full mr-1"></span>Online</span>'
          : ''}</span>`
        : "";

      // --- 2. Build HTML for File or Text Content ---
      const isImage = msg.fileInfo?.type?.startsWith("image/");
      const content = isFile
        ? isImage
          ? `
            <div class="image-message">
                <img src="${msg.fileInfo.url}" alt="${msg.fileInfo.name}" class="max-w-xs max-h-60 rounded-lg cursor-pointer preview-image" data-url="${msg.fileInfo.url}" />
                <p class="text-xs mt-1 ${isUser ? "text-gray-400" : "text-gray-500"}">${formatFileSize(msg.fileInfo.size)}</p>
            </div>
            `
          : `
            <div class="file-message flex items-center p-2 bg-${isUser ? "gray-700" : "gray-200"} rounded-lg">
                <i class="fas fa-file-alt ${isUser ? "text-white" : "text-gray-600"} mr-3"></i>
                <div>
                    <a href="${msg.fileInfo.url}" 
                       download="${msg.fileInfo.name}" 
                       target="_blank" 
                       class="text-sm ${isUser ? "text-white hover:text-gray-300" : "text-gray-800 hover:text-black"} underline">
                        ${msg.fileInfo.name}
                    </a>
                    <p class="text-xs ${isUser ? "text-gray-400" : "text-gray-500"} mt-1">
                        ${formatFileSize(msg.fileInfo.size)}
                    </p>
                </div>
            </div>
            `
        : `<p>${msg.text}</p>`;


      // --- 3. Build HTML for a Quoted Reply (if it exists) ---
      let replyHtml = '';
      if (msg.replyTo) {
        const replySender = msg.replyTo.senderName || 'User';
        const replyText = msg.replyTo.text || '...';
        replyHtml = `
        <div class="message-reply-quote">
            <div class="reply-sender">${replySender}</div>
            <div class="reply-text">${replyText}</div>
        </div>
        `;
      }

      const isForwarded = msg.isForwarded;
      let forwardedIndicatorHtml = '';
      if (isForwarded) {
        forwardedIndicatorHtml = `
            <span class="forwarded-indicator">
                <i class="fas fa-share"></i> Forwarded
            </span>
        `;
      }

      const wasEdited = msg.lastEditedAt;
      let editedIndicatorHtml = '';
      if (wasEdited && !isForwarded) {
        editedIndicatorHtml = `<span class="edited-status">(edited)</span>`;
      }
      let finalMessageStatus = msg.status; // Start with the default status

      if (isUser) {
        // Get the IDs of all *other* participants in the current room
        const otherParticipantUIDs = chatState.activeRoom.participantUIDs.filter(
          uid => uid !== currentUserId
        );

        // Check if at least one of the other participants is in the message's 'readBy' map.
        // The .some() method makes this very efficient.
        const isReadByOthers = otherParticipantUIDs.some(uid => msg.readBy?.[uid]);

        // Set the final status based on whether others have read it
        finalMessageStatus = isReadByOthers ? 'read' : 'sent';
      }
      // --- 4. Build HTML for Reactions (Moved to the correct scope) ---
      const reactionsHtml = Object.keys(msg.reactions || {})
        .map((reaction) => {
          const users = msg.reactions?.[reaction] || [];
          if (users.length === 0) return "";
          const userNames = users.map((u) => u.userName).join(", ");
          return `<span class="reaction-item" title="${userNames}">${reaction}<span class="reaction-count">${users.length}</span></span>`;
        })
        .join("");

      const isPinned = chatState.activeRoom.pinnedMessages?.some(p => p.id === msg.id);

      return `
<div class="message-wrapper ${isUser ? "user" : "other"}" data-message-id="${msg.id}">
${editedIndicatorHtml}
${forwardedIndicatorHtml}
${isPinned ? `
            <div class="pinned-indicator">
                <i class="fas fa-thumbtack"></i> Pinned
            </div>
        ` : ""}
    <div class="message-container ${isUser ? "user" : "other"}">
        <div class="message-bubble ${isUser ? "user" : "other"}">
            <div class="message-header">
                ${isUser ? "You" : msg.senderName}
                ${statusInfo}
            </div>
            <div class="message-content">
                ${replyHtml}
                ${content}
            </div>
        </div>

        <button class="react-button" title="React">
            <i class="far fa-smile"></i>
        </button>
        <button class="reply-btn" title="Reply">
            <i class="fas fa-reply"></i>
        </button>
        <button class="options-btn" title="More">
            <i class="fas fa-ellipsis-h"></i>
        </button>
    </div>

    <div class="message-timestamp">
        ${formatTimestamp(msg.timestamp)}
        ${isUser ? renderMessageStatus(msg.status) : ""}
    </div>

    ${reactionsHtml ? `<div class="message-reactions">${reactionsHtml}</div>` : ""}
</div>
`;
    }

    function showOptionsMenu(e, msg) {
      // Remove any menu that might already be open
      document.querySelector('.options-menu')?.remove();

      const isUserMessage = msg.senderId === chatState.currentUserId;
      const isAlreadyPinned = chatState.activeRoom.pinnedMessages?.some(p => p.id === msg.id);

      const menu = document.createElement('div');
      menu.className = 'options-menu';

      // FIX: The template literal now correctly populates the menu's inner HTML
      // without the extra container div, and the syntax is corrected.
      menu.innerHTML = `
        ${isUserMessage
          ? /* If it's the user's own message, show "Unsend" */
          `
              ${!msg.isFile && !msg.isForwarded
            ? `
                <div class="options-menu-item" data-action="edit">
                    <i class="fas fa-pencil-alt"></i>
                    Edit
                </div>
                `
            : ''
          }
              <div class="options-menu-item" data-action="unsend">
                  <i class="fas fa-trash-alt"></i>
                  Unsend
              </div>
              `
          : /* Otherwise, show "Remove" and "Report" */
          `
              <div class="options-menu-item" data-action="remove">
                  <i class="fas fa-eye-slash"></i>
                  Remove for you
              </div>
              <div class="options-menu-divider"></div>
              <div class="options-menu-item" data-action="report">
                  <i class="fas fa-flag"></i>
                  Report
              </div>
              `
        }

        <div class="options-menu-divider"></div>

        <div class="options-menu-item" data-action="pin">
            <i class="fas fa-thumbtack"></i>
            ${isAlreadyPinned ? 'Unpin' : 'Pin'}
        </div>
        
        <div class="options-menu-item" data-action="forward">
            <i class="fas fa-share"></i>
            Forward
        </div>
    `;

      document.body.appendChild(menu);

      // Position the menu correctly below the button
      const rect = e.target.closest('.options-btn').getBoundingClientRect();
      menu.style.display = 'block';
      menu.style.top = `${rect.bottom + window.scrollY + 5}px`;
      menu.style.left = `${rect.right + window.scrollX - menu.offsetWidth}px`;

      // Handle clicks on the menu items
      menu.onclick = (event) => {
        event.stopPropagation();

        const action = event.target.closest('.options-menu-item')?.dataset.action;
        handleMenuAction(action, msg);
        menu.remove();
      };

      // Add a one-time event listener to close the menu if the user clicks elsewhere
      setTimeout(() => {
        const closeMenuListener = (event) => {
          event.stopPropagation();
          menu.remove();
        };
        document.addEventListener('click', closeMenuListener, { once: true });
      }, 0);
    }

    function showConfirmationModal({ title, message, confirmText, onConfirm, isDestructive = false }) {
      // Remove any existing modal first
      document.querySelector('#modal-overlay')?.remove();

      // Create the overlay and modal elements
      const overlay = document.createElement('div');
      overlay.id = 'modal-overlay';

      overlay.innerHTML = `
        <div class="confirmation-modal">
            <div class="modal-icon"><i class="fas fa-exclamation-triangle"></i></div>
            <h2 class="modal-title">${title}</h2>
            <p class="modal-message">${message}</p>
            <div class="modal-buttons">
                <button class="modal-btn modal-btn-cancel">Cancel</button>
                <button class="modal-btn modal-btn-confirm ${isDestructive ? 'destructive' : ''}">${confirmText}</button>
            </div>
        </div>
    `;

      // Function to close the modal
      const closeModal = () => overlay.remove();

      // Add event listeners
      overlay.querySelector('.modal-btn-confirm').addEventListener('click', (e) => {
        e.stopPropagation();
        onConfirm(); // Execute the action
        closeModal();
      });

      overlay.querySelector('.modal-btn-cancel').addEventListener('click', closeModal);

      // Clicking on the dark background also closes the modal
      overlay.addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') {
          closeModal();
        }
      });
      document.body.appendChild(overlay);
    }

    function handleMenuAction(action, msg) {
      if (!action) return;
      const { activeRoom, currentUserId } = chatState;

      switch (action) {
        case 'unsend':
          showConfirmationModal({
            title: 'Unsend Message',
            message: 'This will be permanently removed for everyone. You can\'t undo this.',
            confirmText: 'Unsend',
            isDestructive: true,
            onConfirm: () => ChatService.deleteMessage(activeRoom.id, msg.id)
          });
          break;

        case 'remove':
          showConfirmationModal({
            title: 'Remove Message',
            message: 'This message will be removed for you. Other people in the chat will still be able to see it.',
            confirmText: 'Remove',
            onConfirm: () => ChatService.hideMessageForUser(activeRoom.id, msg.id, currentUserId)
          });
          break;

        case 'pin':
          const isAlreadyPinned = activeRoom.pinnedMessages?.some(p => p.id === msg.id);

          if (isAlreadyPinned) {
            const messageToUnpin = activeRoom.pinnedMessages.find(p => p.id === msg.id);
            if (messageToUnpin) ChatService.unpinMessage(activeRoom.id, messageToUnpin);
          } else {
            ChatService.pinMessage(activeRoom.id, msg);
          }
          break;

        case 'forward':
          showForwardModal(msg);
          break;

        case 'edit':
          // Can't edit a message that is only a file
          if (msg.isFile) {
            alert("You can't edit a message with a file attachment.");
            return;
          }
          setChatState({ editingMessage: msg });
          document.getElementById('message-input').value = msg.text;
          toggleEditMode(true);
          break;

        case 'report':
          alert("Report functionality has not been implemented yet.");
          break;
      }
    }

    // Add this new function to your chat controller script

    function renderPinnedMessages() {
      const { activeRoom, currentPinIndex } = chatState;
      const container = document.getElementById("pinned-messages-container");
      const display = document.getElementById("pinned-message-display");
      const counter = document.getElementById("pin-counter");
      const btnPrev = document.getElementById("pin-nav-prev");
      const btnNext = document.getElementById("pin-nav-next");

      const pins = activeRoom?.pinnedMessages || [];

      if (pins.length === 0) {
        container.classList.add("hidden");
        return;
      }

      container.classList.remove("hidden");
      const currentPin = pins[currentPinIndex];

      // Display the pinned message content
      display.innerHTML = `
        <i class="fas fa-thumbtack pin-icon"></i>
        <span class="pinned-sender">${currentPin.senderName}:</span>
        <span>${currentPin.text}</span>
    `;

      // Update the counter and navigation visibility
      counter.textContent = `Pin ${currentPinIndex + 1} of ${pins.length}`;
      btnPrev.style.display = pins.length > 1 ? 'block' : 'none';
      btnNext.style.display = pins.length > 1 ? 'block' : 'none';

      // Event listener to jump to the message in the chat
      display.onclick = () => {
        const messageElement = document.querySelector(`[data-message-id="${currentPin.id}"]`);
        if (messageElement) {
          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          messageElement.style.transition = 'background-color 0.5s ease';
          messageElement.style.backgroundColor = 'rgba(0, 122, 255, 0.1)';
          setTimeout(() => {
            messageElement.style.backgroundColor = '';
          }, 1500);
        }
      };

      // Event listener for the "Next" button
      btnNext.onclick = () => {
        const nextIndex = (currentPinIndex + 1) % pins.length;
        setChatState({ currentPinIndex: nextIndex });
        renderPinnedMessages();
      };

      // Event listener for the "Previous" button
      btnPrev.onclick = () => {
        const prevIndex = (currentPinIndex - 1 + pins.length) % pins.length;
        setChatState({ currentPinIndex: prevIndex });
        renderPinnedMessages();
      };
    }

    function formatFileSize(bytes) {
      if (bytes < 1024) return bytes + " bytes";
      else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
      else return (bytes / 1048576).toFixed(1) + " MB";
    }

    function formatLastSeen(date) {
      const now = new Date();
      const diff = now - date;
      const minutes = Math.floor(diff / 60000);

      if (minutes < 1) return "just now";
      if (minutes < 60) return `${minutes}m ago`;

      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;

      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    }

    function renderMessageStatus(status) {
      return `
                    <span class="status-icon ${status === MESSAGE_STATUS.READ ? "read" : ""
        }">
                        ${status === MESSAGE_STATUS.SENT
          ? '<i class="fas fa-check text-gray-400"></i>'
          : status === MESSAGE_STATUS.READ
            ? '<i class="fas fa-check-double text-green-400"></i>'
            : ""
        }
                    </span>
                `;
    }

    function renderTypingIndicator(typingNames) {
      // --- DYNAMICALLY CREATE THE TYPING TEXT ---
      let typingText = "";
      if (typingNames.length === 1) {
        typingText = `<strong>${typingNames[0]}</strong> is typing...`;
      } else if (typingNames.length === 2) {
        typingText = `<strong>${typingNames[0]}</strong> and <strong>${typingNames[1]}</strong> are typing...`;
      } else {
        const otherCount = typingNames.length - 1;
        typingText = `<strong>${typingNames[0]}</strong> and ${otherCount} others are typing...`;
      }

      return `
        <div class="message-wrapper other">
            <div class="message-container other">
                <div class="message-bubble other" style="background-color: #f0f2f5;">
                    <div class="flex items-center">
                        <div class="typing-indicator">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                        <span class="ml-2 text-xs text-gray-600">${typingText}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    }

    function scrollToBottom(element, forceScroll = false) {
      const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 20;

      if (forceScroll || isAtBottom) {
        element.scrollTop = element.scrollHeight;
      }
    }

    function updateSendButtonState(enabled) {
      const button = document.getElementById("send-button");
      if (enabled) {
        button.classList.remove("text-gray-400");
        button.classList.add("text-black");
        button.disabled = false;
      } else {
        button.classList.remove("text-black");
        button.classList.add("text-gray-400");
        button.disabled = true;
      }
    }

    function updateUnreadBadge(count) {
      const badge = document.getElementById("unread-badge");
      const minimizedBadge = document.getElementById("minimized-unread-badge");

      // If the count is zero, hide both badges and stop.
      if (count <= 0) {
        badge.classList.add("hidden");
        minimizedBadge.classList.add("hidden");
        return;
      }

      // If there's a count, update the text on both badges.
      badge.textContent = count;
      minimizedBadge.textContent = count;

      // --- Visibility Logic ---
      // The main button's badge is visible only when the chat is fully closed.
      const isChatButtonVisible = !chatState.isOpen && !chatState.isMinimized;
      if (isChatButtonVisible) {
        badge.classList.remove("hidden");
      } else {
        badge.classList.remove("hidden");
      }

      // The minimized circle's badge is visible only when the chat is minimized.
      if (chatState.isMinimized) {
        minimizedBadge.classList.remove("hidden");
      } else {
        minimizedBadge.classList.add("hidden");
      }
    }

    function updateEmojiPickerPosition() {
      const emojiButton = document.getElementById("emoji-button");
      if (!emojiPicker || !emojiButton) return;

      const chatBox = document.getElementById("chat-box");
      const inputFormContainer = chatBox.querySelector(
        ".p-2.border-t.border-gray-200.bg-white.rounded-b-xl"
      );

      if (chatState.isMaximized) {
        const chatBoxRect = chatBox.getBoundingClientRect();
        const inputRect = inputFormContainer.getBoundingClientRect();

        const bottomOffset = window.innerHeight - inputRect.top + 10;

        emojiPicker.style.position = "fixed";
        emojiPicker.style.bottom = `${bottomOffset}px`;
        emojiPicker.style.left = "50%";
        emojiPicker.style.right = "auto";
        emojiPicker.style.transform = "translateX(-50%)";
        emojiPicker.style.top = "auto";
      } else {
        emojiPicker.style.position = "absolute";
        emojiPicker.style.bottom = "calc(100% + 10px)";
        emojiPicker.style.right = "0";
        emojiPicker.style.left = "auto";
        emojiPicker.style.transform = "translateY(20px)";
        emojiPicker.style.top = "auto";
      }
    }

    function handleTyping(isTyping) {
      const {
        activeRoom,
        currentUserId,
        currentUserName
      } = chatState;
      if (!activeRoom) return;

      // Clear any existing timeout
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }

      // Update status to "typing" immediately
      if (isTyping) {
        ChatService.updateTypingStatus(activeRoom.id, currentUserId, currentUserName, true);
      }

      // Set a timeout to mark as "not typing" after a period of inactivity (e.g., 2 seconds)
      typingTimeout = setTimeout(() => {
        ChatService.updateTypingStatus(activeRoom.id, currentUserId, currentUserName, false);
      }, 2000); // 2-second delay
    }

    function destroyChat() {
      if (statusInterval) {
        clearInterval(statusInterval);
      }
      window.removeEventListener("scroll", handleScroll);
      if (emojiPicker && emojiPicker.parentNode) {
        emojiPicker.remove();
      }
      document.removeEventListener("click", emojiClickHandler);
      if (reactionPicker && reactionPicker.parentNode) {
        reactionPicker.remove();
      }
    }



    // Return cleanup function
    return () => {
      if (chatContainer && chatContainer.parentNode) {
        document.body.removeChild(chatContainer);
      }
      if (style && style.parentNode) {
        document.head.removeChild(style);
      }
      destroyChat();
      chatController = null; // Clear the global reference
    };
  }
}