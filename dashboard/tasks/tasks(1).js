/**
 * @file tasks.js
 * @description A "sub-router" that controls the tasks section with integrated floating chat.
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
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";
import { openShareModal } from "/dashboard/components/shareProjectModel.js";

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
let projectLoadController = new AbortController();

// Global chat controller reference
let chatController = null;
let chatCleanup = null;

/**
 * Main initialization function for the entire tasks section with floating chat.
 * @param {object} params - Route parameters from the main router.
 * @returns {function} The main cleanup function for the tasks section.
 */
export function init(params) {
  // --- 1. Get Parameters and DOM Elements ---
  const { tabId = "list", accountId, projectId } = params;

  const projectName = document.getElementById("project-name");
  const projectIconColor = document.getElementById("project-color");
  const shareButton = document.getElementById("share-project-btn");
  const avatarStackContainer = document.getElementById(
    "project-header-members"
  );
  const customizeButton = document.querySelector(".customize-btn");
  const tabs = document.querySelectorAll(".tab-link");

  /**
   * Sets a random Lucide icon on a specified icon element.
   * @param {HTMLElement} iconContainer - The parent element that holds the icon glyph.
   */
  function setRandomProjectIcon(iconContainer) {
    const miscellaneousIcons = [
      "anchor",
      "archive",
      "award",
      "axe",
      "banknote",
      "beaker",
      "bell",
      "bomb",
      "book",
      "box",
      "briefcase",
      "building",
      "camera",
      "candy",
      "clapperboard",
      "clipboard",
      "cloud",
      "compass",
      "cpu",
      "crown",
      "diamond",
      "dice-5",
      "drafting-compass",
      "feather",
      "flag",
      "flame",
      "folder",
      "gem",
      "gift",
      "graduation-cap",
      "hammer",
      "hard-hat",
      "heart-pulse",
      "key-round",
      "landmark",
      "layers",
      "leaf",
      "lightbulb",
      "map",
      "medal",
      "mouse-pointer",
      "package",
      "palette",
      "plane",
      "puzzle",
      "rocket",
      "shield",
      "ship",
      "sprout",
      "star",
      "swords",
      "ticket",
      "tractor",
      "trophy",
      "umbrella",
      "wallet",
      "wrench",
    ];
    const iconGlyph = iconContainer.querySelector(".project-icon-glyph");
    if (!iconGlyph) {
      console.error(
        "Could not find the '.project-icon-glyph' element inside the container."
      );
      return;
    }
    const randomIndex = Math.floor(Math.random() * miscellaneousIcons.length);
    const randomIconName = miscellaneousIcons[randomIndex];
    iconGlyph.setAttribute("data-lucide", randomIconName);
    // Ensure Lucide is globally available or imported if not using CDN
    if (typeof lucide !== "undefined" && lucide.createIcons) {
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
    // Match numbers (including decimals) in the string
    const matches = hslString.match(/\d+(\.\d+)?/g);
    if (!matches || matches.length < 3) {
      console.error("Invalid HSL string format:", hslString);
      return "#cccccc"; // Return a default color on error
    }
    let [h, s, l] = matches.map(Number);

    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color)
        .toString(16)
        .padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  /**
   * Converts an HSL color value to RGB. Conversion formula
   * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
   * Assumes h, s, and l are contained in the set [0, 360] and [0, 100] and
   * returns r, g, and b in the set [0, 255].
   *
   * @param   Number  h       The hue
   * @param   Number  s       The saturation
   * @param   Number  l       The Lightness
   * @return  Array           The RGB representation
   */
  function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;

    let c = (1 - Math.abs(2 * l - 1)) * s,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)), // Corrected line
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

  /**
   * Converts an HSL color value to HEX.
   * Assumes h, s, and l are contained in the set [0, 360] and [0, 100] and
   * returns a HEX string.
   *
   * @param   Number  h       The hue
   * @param   Number  s       The saturation
   * @param   Number  l       The lightness
   * @return  String          The HEX representation
   */
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
  async function fetchCurrentProjectData() {
    const user = auth.currentUser;
    if (!user) {
      console.error("User not authenticated.");
      throw new Error("User not authenticated.");
    }

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists() || !userSnap.data().selectedWorkspace) {
      throw new Error("Could not find user's selected workspace.");
    }

    const selectedWorkspaceId = userSnap.data().selectedWorkspace;
    const workspaceRef = doc(
      db,
      `users/${user.uid}/myworkspace`,
      selectedWorkspaceId
    );
    const workspaceSnapshot = await getDoc(workspaceRef);

    if (!workspaceSnapshot.exists()) {
      throw new Error("No selected workspace document found.");
    }

    const workspaceData = workspaceSnapshot.data();
    const selectedProjectId = workspaceData.selectedProjectId;

    // ❌ Fallback logic has been removed.
    // Now, if selectedProjectId is missing, it will throw an error.
    if (!selectedProjectId) {
      console.error(
        "No selected project ID is stored in the workspace. Please select a project."
      );
      throw new Error(
        "No selected project ID is stored in the workspace, and URL fallback is disabled."
      );
    }

    // 🔍 Secure project lookup
    const projectQuery = query(
      collectionGroup(db, "projects"),
      where("projectId", "==", selectedProjectId),
      where("memberUIDs", "array-contains", user.uid)
    );
    const projectSnapshot = await getDocs(projectQuery);

    if (projectSnapshot.empty) {
      throw new Error(
        `Project with ID ${selectedProjectId} not found or user is not a member.`
      );
    }

    const projectDoc = projectSnapshot.docs[0];
    const projectData = projectDoc.data();
    const membersCount = Array.isArray(projectData.members)
      ? projectData.members.length
      : 0;
    const rolesCount = projectData.rolesByUID
      ? Object.keys(projectData.rolesByUID).length
      : 0;

    if (
      membersCount > 0 &&
      (!projectData.rolesByUID || membersCount !== rolesCount)
    ) {
      console.log(
        `Syncing roles for project: ${projectDoc.id}. Reason: Field missing or count mismatch. Members: ${membersCount}, Roles: ${rolesCount}`
      );

      const rolesByUID = {};
      const memberRoleKeys = [];

      // Build rolesByUID and memberRoleKeys
      projectData.members.forEach((member) => {
        if (member.uid && member.role) {
          rolesByUID[member.uid] = member.role;
          memberRoleKeys.push(`${member.uid}:${member.role}`);
        }
      });

      try {
        await updateDoc(projectDoc.ref, {
          rolesByUID: rolesByUID,
          memberRoleKeys: memberRoleKeys,
        });

        projectData.rolesByUID = rolesByUID;
        projectData.memberRoleKeys = memberRoleKeys;

        console.log(
          `Successfully synced rolesByUID and memberRoleKeys for project: ${projectDoc.id}`
        );
      } catch (updateError) {
        console.error(`Failed to sync project ${projectDoc.id}:`, updateError);
      }
    }

    return {
      data: projectDoc.data(),
      projectId: projectDoc.id,
      workspaceId: projectDoc.data().workspaceId,
      projectRef: projectDoc.ref,
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
      const userPromises = uids.map((uid) => getDoc(doc(db, `users/${uid}`)));
      const userDocs = await Promise.all(userPromises);
      return userDocs
        .filter((d) => d.exists())
        .map((d) => ({ uid: d.id, ...d.data() }));
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
      return "";
    }

    const maxDisplayAvatars = 3; // Show up to 3 actual avatars
    let visibleAssignees = assigneeIds.slice(0, maxDisplayAvatars);
    let overflowCount = assigneeIds.length - maxDisplayAvatars;

    const avatarsHTML = visibleAssignees
      .map((userId, index) => {
        const user = allUsers.find((u) => u.uid === userId);
        if (!user) return "";

        const zIndex = 50 - index;
        const displayName = user.name || "Unknown User";
        // Changed to use user.initials if available, otherwise generate
        const initials =
          user.initials ||
          displayName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .substring(0, 2);

        if (user.avatar && user.avatar.startsWith("https://")) {
          // Assuming user.avatar is the correct field for URL
          return `
            <div class="user-avatar-tasks" title="${displayName}" style="z-index: ${zIndex};">
                <img src="${user.avatar}" alt="${displayName}">
            </div>`;
        } else {
          const bgColor = "#" + (user.uid || "000000").substring(0, 6); // Simple hash based on UID
          return `<div class="user-avatar-tasks" title="${displayName}" style="background-color: ${bgColor}; color: white; z-index: ${zIndex};">${initials}</div>`;
        }
      })
      .join("");

    let overflowHTML = "";
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
  async function saveProjectToRecentHistory(
    projectId,
    projectData,
    projectRef,
    memberProfiles,
    userId
  ) {
    if (!userId || !projectData || !projectRef) {
      console.error(
        "Cannot save project to recent history: Missing user ID, project data, or project reference."
      );
      return;
    }

    try {
      const userRecentProjectsHistoryRef = collection(
        db,
        `users/${userId}/recenthistory`
      );
      const recentProjectDocRef = doc(
        userRecentProjectsHistoryRef,
        projectData.projectId
      ); // Use project ID as doc ID

      // Count documents in each section (tasks within sections)
      const sectionTaskCounts = {};
      const sectionsCollectionRef = collection(projectRef, "sections");
      const sectionsSnapshot = await getDocs(sectionsCollectionRef); // Fetch all sections

      for (const sectionDoc of sectionsSnapshot.docs) {
        const tasksColRef = collection(sectionDoc.ref, "tasks");
        const tasksSnapshot = await getDocs(tasksColRef);
        sectionTaskCounts[sectionDoc.id] = tasksSnapshot.size;
      }

      let projectHexColor = projectData.color || "#cccccc"; // Default if color is not provided
      // Check if the color format is HSL (e.g., "hsl(120, 100%, 50%)")
      if (projectData.color && projectData.color.startsWith("hsl(")) {
        const hslValues = projectData.color.match(/\d+(\.\d+)?/g).map(Number);
        if (hslValues.length === 3) {
          // FIX: Added missing opening parenthesis before hslValues[0]
          projectHexColor = hslToHex(hslValues[0], hslValues[1], hslValues[2]);
        }
      }
      const recentHistoryPayload = {
        type: "project",
        projectId: projectId,
        projectName: projectData.title || "Unknown Project",
        projectColor: projectHexColor,
        projectRef: projectRef, // Store the actual project DocumentReference
        memberUIDs: projectData.memberUIDs || [], // Original array of UIDs
        memberProfiles: memberProfiles, // Enriched profiles
        sectionTaskCounts: sectionTaskCounts, // Tasks count per section
        lastAccessed: serverTimestamp(),
      };

      // Use setDoc with { merge: true } to update if exists, create if new
      await setDoc(recentProjectDocRef, recentHistoryPayload, { merge: true });
      console.log(
        `Project "${projectData.title}" added/updated in recent history.`
      );
    } catch (error) {
      console.error("Error saving project to recent history:", error);
    }
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
      console.log(`✅ Project data fetched for projectId: ${projectId}`, {
        data,
      });

      // Step 2: Fetch members for rendering and recent history.
      console.log("Step 2: Fetching member profiles...");
      const memberUIDs = data.memberUIDs || [];
      currentLoadedProjectMembers = await fetchMemberProfiles(memberUIDs); // Store fetched profiles
      console.log("✅ Member profiles fetched:", {
        members: currentLoadedProjectMembers,
      });

      // Step 3: Render the UI with the fetched data.
      console.log("Step 3: Rendering UI components...");
      if (projectName && data.title) {
        if (avatarStackContainer) {
          console.log("Updating avatar stack...");
          avatarStackContainer.innerHTML = createAvatarStackHTML(
            memberUIDs,
            currentLoadedProjectMembers
          );
          console.log("✅ Avatar stack updated.");
        }

        // Determine user's edit permission
        const isMemberWithEditPermission = data.members?.some(
          (m) => m.uid === user.uid && m.role === "Project Admin"
        );
        const isSuperAdmin = data.project_super_admin_uid === user.uid; // Assuming this field exists
        const isAdminUser = data.project_admin_user === user.uid; // Assuming this field exists
        const userCanEdit =
          isMemberWithEditPermission || isSuperAdmin || isAdminUser;

        console.log(
          `%cUser Permissions: %cuserCanEdit = ${userCanEdit}`,
          "font-weight: bold;",
          "font-weight: normal;",
          {
            isMemberWithEditPermission,
            isSuperAdmin,
            isAdminUser,
          }
        );

        projectName.textContent = data.title;
        projectName.contentEditable = userCanEdit;
        projectName.style.cursor = userCanEdit ? "text" : "default";
        projectName.title = userCanEdit ? "Click to edit project name" : "";
        shareButton.classList.toggle("display-none", !userCanEdit);

        // Clean up previous listeners to prevent duplicates
        if (titleBlurListener)
          projectName.removeEventListener("blur", titleBlurListener);
        if (titleEnterListener)
          projectName.removeEventListener("keydown", titleEnterListener);

        if (userCanEdit) {
          console.log("Attaching event listeners for project title editing...");

          titleBlurListener = async () => {
            const newTitle = projectName.textContent.trim();
            const originalTitle = data.title;

            if (signal.aborted) {
              console.warn(
                "🚫 Aborting stale title update because a new project has loaded."
              );
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
                throw new Error(
                  "No valid project reference available for update."
                );
              }

              console.log(
                `%c🔥 Attempting to update project title to "${newTitle}"...`,
                "color: orange; font-weight: bold;"
              );
              await updateDoc(currentLoadedProjectRef, { title: newTitle });

              // Modern console log for the update
              console.log(
                `%c✅ Project Title Updated Successfully! %c\nProject ID: %c${projectId}\n%cNew Title: %c"${newTitle}"`,
                "color: #28a745; font-size: 14px; font-weight: bold;",
                "color: #6c757d;",
                "color: #007bff; font-weight: bold;",
                "color: #6c757d;",
                "color: #333; font-style: italic;"
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
  shareButton.addEventListener("click", async () => {
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

    const container = document.getElementById("tab-content-container");
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
    document.getElementById("tab-specific-css")?.remove();

    const htmlPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.html`;
    const cssPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.css`;
    // Add a cache-busting parameter to the JS path to ensure fresh load during development
    const jsPath = `/dashboard/tasks/tabs/${targetTabId}/${targetTabId}.js?v=${new Date().getTime()}`;

    try {
      // Fetch all resources concurrently using Promise.all
      const [htmlRes, cssRes, tabModule] = await Promise.all([
        fetch(htmlPath),
        fetch(cssPath),
        import(jsPath), // Dynamically import the JS module
      ]);

      // Check HTML response
      if (!htmlRes.ok) {
        throw new Error(
          `HTML not found for tab: ${targetTabId} (Status: ${htmlRes.status})`
        );
      }
      const tabHtml = await htmlRes.text();

      // Check CSS response (optional, but good for debugging)
      if (!cssRes.ok) {
        console.warn(
          `CSS file not found for tab: ${targetTabId} (Status: ${cssRes.status}). Proceeding without it.`
        );
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
          projectData: currentLoadedProjectData,
        });
      }

      console.log(`Tab '${targetTabId}' loaded successfully.`);
    } catch (err) {
      let userMessage = `<p>An unexpected error occurred while loading the <strong>${targetTabId}</strong> tab.</p>`;
      let logMessage = `Failed to load tab '${targetTabId}':`;

      if (err.message.includes("HTML not found")) {
        userMessage = `<p>Could not load the necessary HTML file for the <strong>${targetTabId}</strong> tab.</p>`;
        logMessage = `[HTML Load Error] Failed to fetch ${htmlPath}.`;
      } else if (err instanceof SyntaxError) {
        userMessage = `<p>The <strong>${targetTabId}</strong> tab could not be loaded due.<p>Please check the console for details.</p>`;
        logMessage = `[JS Syntax Error] A syntax error was found in ${jsPath}.`;
      } else if (
        err.message.includes("Failed to fetch dynamically imported module")
      ) {
        userMessage = `<p>Could not load the necessary script file for the <strong>${targetTabId}</strong> tab.</p>`;
        logMessage = `[JS Load Error] The JavaScript module at ${jsPath} could not be fetched (e.g., 404 Not Found).`;
      } else if (err.message.includes("CSS file not found")) {
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
    tabs.forEach((tab) => {
      tab.classList.toggle(
        "active",
        tab.getAttribute("data-tab") === targetTabId
      );
    });
  }

  // --- 3. Attach Event Listeners ---

  // Define the click listener function
  tabClickListener = (event) => {
    event.preventDefault();

    const clickedTabId = event.currentTarget.getAttribute("data-tab");
    if (!clickedTabId) return;

    const pathParts = window.location.pathname.split("/").filter((p) => p);
    const currentTabIdFromUrl = pathParts[2]; // /tasks/:uid/:tab/:projectId

    // Prevent redundant reload
    if (clickedTabId === currentTabIdFromUrl) return;

    const accountId = pathParts[1];
    const projectId = pathParts[3];
    const existingQuery = window.location.search; // includes "?openTask=abc123" or ""

    const newUrl = `/tasks/${accountId}/${clickedTabId}/${projectId}${existingQuery}`;
    history.pushState({ path: newUrl }, "", newUrl);

    setActiveTabLink(clickedTabId);
    loadTabContent(clickedTabId);
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", tabClickListener);
  });

  // --- 4. Initial Load Sequence ---
  // This sequence is crucial for ensuring project data is available before tabs load.
  // Use an IIFE or an async function call to manage the loading sequence.
  (async () => {
    try {
      // 1. Authenticate user (ensure auth.currentUser is ready)
      await new Promise((resolve) => {
        const unsubscribeAuth = auth.onAuthStateChanged((user) => {
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

      // 3. Load the initial tab content (which needs project context)
      setActiveTabLink(tabId);
      await loadTabContent(tabId);

      console.log("Tasks section initialized and loaded successfully.");
    } catch (error) {
      console.error("Fatal error during tasks section initialization:", error);
      // Display a user-friendly error message if the project cannot be loaded
      const container =
        document.getElementById("main-content-area") || document.body;
      container.innerHTML = `<div class="error-message-full-page">
                                     <h1>Oops! Something went wrong.</h1>
                                     <p>We couldn't load this project. It might not exist, or you might not have access.</p>
                                     <p>Please try again later or contact support if the problem persists.</p>
                                     <p>Error details: ${error.message}</p>
                                   </div>`;
    }
  })();

  // --- 5. Initialize Floating Chat Box ---
  if (!chatController) {
    chatCleanup = floatingChatBox();
  }

  // --- 6. Return the Main Cleanup Function ---
  // This cleans up the tasks section itself when navigating away (e.g., to 'home').
  return function cleanup() {
    console.log(
      "🧹 Cleaning up 'tasks' section, its active tab, and project context..."
    );

    // --- 1. CLEAR PROJECT CONTEXT ---
    currentLoadedProjectRef = null;
    currentLoadedProjectData = null;
    currentLoadedProjectMembers = []; // Also clear the members array
    console.log("Nullified project context (Ref, Data, Members).");

    // --- 2. CLEAN UP TAB-SPECIFIC MODULE ---
    if (currentTabCleanup) {
      currentTabCleanup();
      currentTabCleanup = null;
    }

    // --- 3. CLEAN UP EVENT LISTENERS ---
    tabs.forEach((tab) => tab.removeEventListener("click", tabClickListener));

    if (projectName) {
      if (titleBlurListener) {
        projectName.removeEventListener("blur", titleBlurListener);
        titleBlurListener = null; // Clear the reference
      }
      if (titleEnterListener) {
        projectName.removeEventListener("keydown", titleEnterListener);
        titleEnterListener = null; // Clear the reference
      }
    }

    // --- 4. CLEAN UP CHAT BOX ---
    if (chatCleanup) {
      chatCleanup();
      chatCleanup = null;
      chatController = null;
    }
  };

  // ======== FLOATING CHAT BOX FUNCTION ========
  function floatingChatBox() {
    console.log("Initializing floating chat box...");

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
      <button id="chat-button" class="chat-button">
        <i class="fas fa-comments"></i>
        <span id="unread-badge" class="unread-badge hidden">0</span>
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
          <nav id="chat-room-selector" class="border-b border-gray-300 bg-gray-100 px-2 py-2 flex flex-nowrap overflow-x-auto gap-1 mb-2"></nav>
          <div id="messages-container" class="messages-container bg-gradient-to-b from-gray-50 to-gray-100 p-2 overflow-y-auto flex-1"></div>
          <div class="p-2 border-t border-gray-200 bg-white rounded-b-xl">
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
            </form>
          </div>
        </div>
        <!-- Unread badge for minimized circle state -->
        <div id="minimized-unread-badge" class="unread-badge hidden">0</div>
      </div>
    `;
    document.body.appendChild(chatContainer);

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
      .chat-container { z-index: var(--z-chat-container); }
    .chat-box { z-index: var(--z-chat-box); }
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
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 10000; /* High z-index to stay on top */
        display: flex;
        flex-direction: column;
        align-items: flex-end;
      }

      .chat-container.scrolled {
        transform: translateY(-3.125rem);
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
        padding: 2px; /* Added padding for better appearance */
      }

      /* ================ Chat Box States ================ */
      .chat-box {
        width: 320px;
        height: 0;
        opacity: 0;
        overflow: hidden;
        transform: translateY(1rem);
        transition: all 0.3s ease;
        border-radius: 14px;
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.12);
        background: white;
        font-size: 0.875rem;
        z-index: 10000; /* Ensure it's above other content */
        display: flex; /* Added for flex column layout */
        flex-direction: column; /* Added for flex column layout */
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

      .message-container:hover .react-button {
        opacity: 1; /* Show on hover */
      }

      .message-container.user .react-button {
        margin-right: 5px; /* Space for user messages */
      }

      .message-container.other .react-button {
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

    // --- REVISED MOCK DATA SERVICE ---
    // This service now maintains an internal, mutable state for messages.
    const ChatService = (() => {
      let _chatRooms = [];
      let _messages = {}; // This will be the mutable store for messages

      const initialRooms = [
        {
          id: 1,
          name: "Global Staff Chat",
          type: CHAT_TYPES.GLOBAL,
          participants: [
            { id: 101, name: "Support" },
            { id: 102, name: "Manager" },
            { id: 103, name: "Admin" },
          ],
        },
        {
          id: 2,
          name: "Project Alpha",
          type: CHAT_TYPES.PROJECT,
          participants: [
            { id: 201, name: "Project Lead" },
            { id: 202, name: "Designer" },
            { id: 203, name: "Developer" },
          ],
        },
        {
          id: 3,
          name: "Project Beta",
          type: CHAT_TYPES.PROJECT,
          participants: [
            { id: 301, name: "Team Lead" },
            { id: 302, name: "QA Specialist" },
          ],
        },
        {
          id: 4,
          name: "Project Gamma",
          type: CHAT_TYPES.PROJECT,
          participants: [
            { id: 401, name: "Project Manager" },
            { id: 402, name: "Architect" },
          ],
        },
        {
          id: 5,
          name: "Supplier Portal",
          type: CHAT_TYPES.SUPPLIER,
          participants: [
            { id: 501, name: "Procurement" },
            { id: 502, name: "Supplier Rep" },
          ],
        },
      ];

      const initialMessagesData = {
        1: [
          {
            id: 1,
            text: "Welcome to the Global Staff Chat! This is for all staff members.",
            sender: "Support",
            senderId: 101,
            timestamp: new Date(Date.now() - 3600000),
            read: true,
            reactions: {},
          },
          {
            id: 2,
            text: "Remember to submit your reports by Friday.",
            sender: "Manager",
            senderId: 102,
            timestamp: new Date(Date.now() - 1800000),
            read: true,
            reactions: {},
          },
        ],
        2: [
          {
            id: 1,
            text: "Project Alpha kickoff meeting scheduled for tomorrow at 10 AM.",
            sender: "Project Lead",
            senderId: 201,
            timestamp: new Date(Date.now() - 86400000),
            read: true,
            reactions: {},
          },
        ],
        3: [
          {
            id: 1,
            text: "Beta team: We're on track for the Q3 deliverables.",
            sender: "Team Lead",
            senderId: 301,
            timestamp: new Date(Date.now() - 43200000),
            read: true,
            reactions: {},
          },
        ],
        4: [
          {
            id: 1,
            text: "Gamma project status update: Phase 1 completed successfully.",
            sender: "Project Manager",
            senderId: 401,
            timestamp: new Date(Date.now() - 172800000),
            read: true,
            reactions: {},
          },
        ],
        5: [
          {
            id: 1,
            text: "Supplier portal: New inventory received. Please update your records.",
            sender: "Procurement",
            senderId: 501,
            timestamp: new Date(Date.now() - 259200000),
            read: true,
            reactions: {},
          },
        ],
      };

      // Initialize _chatRooms and _messages on first load
      _chatRooms = initialRooms;
      _messages = JSON.parse(JSON.stringify(initialMessagesData)); // Deep copy to ensure mutability

      return {
        getChatRooms: () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(_chatRooms), 500);
          }),

        getMessages: (roomId) =>
          new Promise((resolve) => {
            setTimeout(() => resolve(_messages[roomId] || []), 300);
          }),

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

        sendMessage: (roomId, text) => {
          const responses = {
            [CHAT_TYPES.GLOBAL]: [
              "Thanks for your message. I'll notify the relevant team.",
              "Your message has been logged in the staff channel.",
              "All staff members will be notified of this update.",
            ],
            [CHAT_TYPES.PROJECT]: [
              "Your project update has been recorded.",
              "Team members will review your message shortly.",
            ],
            [CHAT_TYPES.SUPPLIER]: [
              "Your supplier request has been received.",
              "Procurement team will review your message.",
              "Supplier portal update acknowledged.",
            ],
          };

          return new Promise((resolve) => {
            setTimeout(() => {
              const room = _chatRooms.find((r) => r.id === roomId);
              const roomType = room?.type || CHAT_TYPES.PROJECT;
              const responsePool =
                responses[roomType] || responses[CHAT_TYPES.PROJECT];
              const randomResponse =
                responsePool[Math.floor(Math.random() * responsePool.length)];
              const participant =
                room?.participants[
                Math.floor(Math.random() * room.participants.length)
                ];

              const botMessage = {
                id: Date.now() + Math.random(), // Ensure unique ID
                text: randomResponse,
                sender: participant?.name || "Support",
                senderId: participant?.id || 101,
                timestamp: new Date(),
                read: false,
                reactions: {},
              };

              if (!_messages[roomId]) {
                _messages[roomId] = [];
              }
              _messages[roomId].push(botMessage); // Add bot message to the mutable store
              resolve(botMessage);
            }, 1000);
          });
        },

        addReaction: (roomId, messageId, reaction, userId, allParticipants) => {
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              const roomMessages = _messages[roomId]; // Access the mutable store
              if (!roomMessages) {
                return reject(new Error("Room not found for reactions."));
              }

              const message = roomMessages.find((msg) => msg.id === messageId);
              if (!message) {
                return reject(new Error("Message not found for reaction."));
              }

              if (!message.reactions) {
                message.reactions = {};
              }
              if (!message.reactions[reaction]) {
                message.reactions[reaction] = [];
              }

              const userIndex = message.reactions[reaction].findIndex(
                (r) => r.userId === userId
              );

              if (userIndex === -1) {
                // Add reaction
                const user = allParticipants.find((p) => p.id === userId);
                message.reactions[reaction].push({
                  userId: userId,
                  userName: user ? user.name : "Unknown User",
                });
              } else {
                // Remove reaction (toggle)
                message.reactions[reaction].splice(userIndex, 1);
                if (message.reactions[reaction].length === 0) {
                  delete message.reactions[reaction];
                }
              }
              resolve(message.reactions);
            }, 200);
          });
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
      currentUserId: 101,
      currentUserName: "You",
    };

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

    async function markRoomAsRead(roomId) {
      await ChatService.markMessagesAsRead(roomId, chatState.currentUserId);
      await updateRoomMessagesFromService(roomId);
      calculateUnreadCounts();
    }

    function calculateUnreadCounts() {
      const counts = {};
      let total = 0;

      chatState.chatRooms.forEach((room) => {
        const count =
          chatState.messages[room.id]?.filter(
            (m) => !m.read && m.senderId !== chatState.currentUserId
          ).length || 0;
        counts[room.id] = count;
        total += count;
      });

      setChatState({
        unreadCounts: counts,
        totalUnread: total,
      });
    }

    async function initializeChat() {
      await loadChatData();
      setupEventListeners();
      setupParticipantStatusUpdates();
      setupFilePicker();
      setupEmojiPicker();
    }

    async function loadChatData() {
      const rooms = await ChatService.getChatRooms();
      const messagesData = {};

      for (const room of rooms) {
        messagesData[room.id] = await ChatService.getMessages(room.id);
      }

      const statusData = {};
      rooms.forEach((room) => {
        room.participants.forEach((p) => {
          statusData[p.id] = {
            online: Math.random() > 0.8,
            lastSeen: new Date(
              Date.now() - Math.floor(Math.random() * 3600000 * 24 * 7)
            ),
            name: p.name,
          };
        });
      });

      setChatState({
        chatRooms: rooms,
        messages: messagesData,
        participantStatus: statusData,
        activeRoom: rooms[0],
        isMinimized: true,
      });

      calculateUnreadCounts();
      updateUnreadBadge(chatState.totalUnread);
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
      if (!activeRoom) return;

      const fileMessage = {
        id: Date.now(),
        text: `[File: ${file.name}]`,
        sender: chatState.currentUserName,
        senderId: chatState.currentUserId,
        timestamp: new Date(),
        read: true,
        status: MESSAGE_STATUS.SENT,
        isFile: true,
        fileInfo: { name: file.name, type: file.type, size: file.size },
        reactions: {},
      };

      await addMessage(activeRoom.id, fileMessage);
      renderMessages();

      setTimeout(async () => {
        await ChatService.sendMessage(
          activeRoom.id,
          `Received your file: ${file.name}`
        );
        setChatState({ isTyping: false });
        const { isOpen, activeRoom: currentRoom } = chatState;
        if (isOpen && currentRoom?.id === activeRoom.id) {
          await markRoomAsRead(activeRoom.id);
        } else {
          calculateUnreadCounts();
          updateUnreadBadge(chatState.totalUnread);
        }
        renderMessages();
      }, 1500);
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

    function setupEventListeners() {
      document
        .getElementById("chat-button")
        .addEventListener("click", toggleChat);
      document
        .getElementById("minimize-chat")
        .addEventListener("click", (e) => {
          e.stopPropagation();
          minimizeChat();
        });
      document
        .getElementById("toggle-minmax")
        .addEventListener("click", (e) => {
          e.stopPropagation();
          toggleMaximize();
        });
      document.getElementById("close-chat").addEventListener("click", (e) => {
        e.stopPropagation();
        closeChat();
      });
      document
        .getElementById("chat-header")
        .addEventListener("click", expandChat);

      document
        .getElementById("send-button")
        .addEventListener("click", handleSend);
      document
        .getElementById("message-input")
        .addEventListener("keypress", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSend();
          }
        });

      document
        .getElementById("message-input")
        .addEventListener("input", (e) => {
          const { activeRoom } = chatState;
          setChatState({ inputText: e.target.value });
          updateSendButtonState(!!e.target.value.trim() && !!activeRoom);
        });

      window.addEventListener("scroll", handleScroll);
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
      const { isOpen, activeRoom } = chatState;
      const newState = { isOpen: !isOpen };

      if (!isOpen) {
        if (activeRoom) {
          markRoomAsRead(activeRoom.id);
          updateUnreadBadge(chatState.totalUnread);
        }

        document.getElementById("chat-box").classList.add("open");
        document.getElementById("chat-box").classList.remove("minimized");
        setChatState({ ...newState, isMinimized: false });
        document.getElementById("chat-button").classList.add("hidden");
        document
          .getElementById("minimized-unread-badge")
          .classList.add("hidden");
      } else {
        minimizeChat();
      }
    }

    function minimizeChat() {
      const chatBox = document.getElementById("chat-box");
      chatBox.classList.add("minimized");
      chatBox.classList.remove("open", "maximized");
      setChatState({ isOpen: false, isMinimized: true, isMaximized: false });
      document.getElementById("chat-button").classList.add("hidden");
      updateUnreadBadge(chatState.totalUnread);

      if (reactionPicker) {
        reactionPicker.remove();
        reactionPicker = null;
      }
    }

    function expandChat() {
      const chatBox = document.getElementById("chat-box");
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
    }

    /**
 * Creates and displays a modern, reusable confirmation modal.
 * @param {object} options - Configuration for the modal.
 * @param {string} options.title - The main title of the modal.
 * @param {string} options.message - The descriptive text.
 * @param {string} options.confirmText - The text for the confirmation button.
 * @param {function} options.onConfirm - The function to execute when confirmed.
 * @param {boolean} [options.isDestructive=false] - If true, styles the confirm button as red.
 */
    function showConfirmationModal({ title, message, confirmText, onConfirm, isDestructive = false }) {
      document.querySelector('#modal-overlay')?.remove();
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

      const closeModal = () => overlay.remove();
      overlay.querySelector('.modal-btn-confirm').addEventListener('click', (e) => {
        e.stopPropagation();
        onConfirm(); // Execute the action
        closeModal();
      });

      overlay.querySelector('.modal-btn-cancel').addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') {
          closeModal();
        }
      });

      document.body.appendChild(overlay);
    }

    function toggleMaximize() {
      const chatBox = document.getElementById("chat-box");
      const toggleIcon = document.getElementById("toggle-minmax-icon");

      if (chatState.isMaximized) {
        chatBox.classList.remove("maximized");
        toggleIcon.classList.remove("fa-compress");
        toggleIcon.classList.add("fa-expand");
        setChatState({ isMaximized: false });
      } else {
        chatBox.classList.add("maximized");
        toggleIcon.classList.remove("fa-expand");
        toggleIcon.classList.add("fa-compress");
        setChatState({ isMaximized: true });
        scrollToBottom(document.getElementById("messages-container"));
      }
      if (emojiPicker && emojiPicker.classList.contains("open")) {
        updateEmojiPickerPosition();
      }
      if (reactionPicker && reactionPicker.classList.contains("open")) {
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

    async function handleSend() {
      const { inputText, activeRoom } = chatState;
      if (!inputText.trim() || !activeRoom) return;

      const userMessage = {
        id: Date.now(),
        text: inputText,
        sender: chatState.currentUserName,
        senderId: chatState.currentUserId,
        timestamp: new Date(),
        read: true,
        status: MESSAGE_STATUS.SENT,
        reactions: {},
      };

      await addMessage(activeRoom.id, userMessage);
      setChatState({ inputText: "" });
      document.getElementById("message-input").value = "";
      renderMessages();

      setChatState({ isTyping: true });
      renderMessages();

      setTimeout(async () => {
        await ChatService.sendMessage(activeRoom.id, inputText);
        setChatState({ isTyping: false });

        const { isOpen, activeRoom: currentRoom } = chatState;
        if (isOpen && currentRoom?.id === activeRoom.id) {
          await markRoomAsRead(activeRoom.id);
        } else {
          calculateUnreadCounts();
          updateUnreadBadge(chatState.totalUnread);
        }

        renderMessages();
      }, 1500);
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
        renderMessages();

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
      setChatState({ activeRoom: room, inputText: "" });
      await markRoomAsRead(room.id);
      updateUnreadBadge(chatState.totalUnread);
      document.getElementById("active-room-name").textContent = room.name;
      document.getElementById("message-input").disabled = false;
      renderMessages();
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
        roomButton.innerHTML = `
                        ${room.name}
                    `;

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

    function renderMessages() {
      const { activeRoom, messages, isTyping, participantStatus } = chatState;
      const roomMessages = activeRoom ? messages[activeRoom.id] || [] : [];
      const container = document.getElementById("messages-container");

      if (!activeRoom || roomMessages.length === 0) {
        container.innerHTML = `
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-comment-slash text-3xl mb-2"></i>
                            <p>No messages yet</p>
                            <p class="text-sm mt-1">Start the conversation!</p>
                        </div>
                    `;
        return;
      }

      let messagesHTML = roomMessages
        .map((msg) => renderMessage(msg, participantStatus))
        .join("");
      if (isTyping) messagesHTML += renderTypingIndicator();

      container.innerHTML = messagesHTML;
      scrollToBottom(container);

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
              showReactionPicker(msg.id, reactButton);
            });
          }
        }
      });
    }

    function formatTimestamp(timestamp) {
      const now = new Date();
      const messageDate = new Date(timestamp);
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
    }

    function renderMessage(msg, participantStatus) {
      const isUser = msg.senderId === chatState.currentUserId;
      const isFile = msg.isFile;
      const statusInfo =
        !isUser && participantStatus[msg.senderId]
          ? `<span class="ml-2 text-xs">${participantStatus[msg.senderId].online
            ? '<span class="text-green-500 flex items-center"><span class="w-2 h-2 bg-green-500 rounded-full mr-1"></span>Online</span>'
            : `Last seen ${formatLastSeen(
              participantStatus[msg.senderId].lastSeen
            )}`
          }</span>`
          : "";

      const content = isFile
        ? `
                    <div class="file-message flex items-center p-2 bg-${isUser ? "gray-800" : "gray-100"
        } rounded-lg">
                        <i class="fas fa-file ${isUser ? "text-white" : "text-gray-600"
        } mr-2"></i>
                        <div>
                            <p class="text-sm ${isUser ? "text-white" : "text-gray-800"
        }">${msg.text
          .replace("[File: ", "")
          .replace("]", "")}</p>
                            <p class="text-xs ${isUser ? "text-gray-400" : "text-gray-500"
        }">${formatFileSize(msg.fileInfo.size)}</p>
                        </div>
                    </div>`
        : `<p>${msg.text}</p>`;

      const reactionsHtml = Object.keys(msg.reactions)
        .map((reaction) => {
          const users = msg.reactions[reaction];
          const userNames = users.map((u) => u.userName).join(", ");
          return users.length > 0
            ? `<span class="reaction-item">${reaction}<span class="reaction-count">${users.length}</span><span class="reaction-users">${userNames}</span></span>`
            : "";
        })
        .join("");

      return `
                    <div class="message-wrapper ${isUser ? "user" : "other"
        }" data-message-id="${msg.id}">
                        <div class="message-container ${isUser ? "user" : "other"
        }">
                            <div class="message-bubble ${isUser ? "user" : "other"
        }">
                                <div class="message-header">
                                    ${isUser ? "You" : msg.sender}
                                    ${statusInfo}
                                </div>
                                <div class="message-content">
                                    ${content}
                                </div>
                            </div>
                            <button class="react-button">
                              <i class="far fa-smile"></i>
                            </button>
                        </div>
                        <div class="message-timestamp">
                            ${formatTimestamp(msg.timestamp)}
                            ${isUser ? renderMessageStatus(msg.status) : ""}
                        </div>
                        ${reactionsHtml
          ? `<div class="message-reactions ${isUser ? "user-reactions" : ""
          }">${reactionsHtml}</div>`
          : ""
        }
                    </div>
                `;
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

    function renderTypingIndicator() {
      return `
                    <div class="message-wrapper other">
                        <div class="message-container other">
                            <div class="message-bubble other">
                                <div class="flex items-center">
                                    <div class="typing-indicator">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                    <span class="ml-2 text-xs text-gray-500">typing...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
    }

    function scrollToBottom(element) {
      element.scrollTop = element.scrollHeight;
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

      if (count > 0) {
        badge.textContent = count;
        minimizedBadge.textContent = count;

        if (chatState.isOpen) {
          badge.classList.remove("hidden");
          minimizedBadge.classList.add("hidden");
        } else if (chatState.isMinimized) {
          badge.classList.add("hidden");
          minimizedBadge.classList.remove("hidden");
        } else {
          badge.classList.remove("hidden");
          minimizedBadge.classList.add("hidden");
        }
      } else {
        badge.classList.add("hidden");
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

    // Initialize chat controller
    initializeChat();

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
