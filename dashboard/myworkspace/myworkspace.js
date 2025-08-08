import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  query,
  where,
  collectionGroup,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";
import { showInviteModal } from "/dashboard/components/showEmailModel.js";

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

/**
 * Initializes all functionality for the My Workspace page.
 * @param {object} params - Initialization parameters (if any).
 * @returns {function} A cleanup function to be called when the component is unmounted.
 */
export function init(params) {
  const controller = new AbortController();
  const workspaceSection = document.querySelector('div[data-section="myworkspace"]');
  if (!workspaceSection) return () => { };

  // --- Element Selectors ---
  const headerLeft = workspaceSection.querySelector(".header-myworkspace-left");
  const workspaceTitleEl = workspaceSection.querySelector(".workspace-title");
  const teamDescriptionEl = workspaceSection.querySelector("#team-description");
  const staffListContainer = workspaceSection.querySelector("#staff-list");
  const staffCountLink = workspaceSection.querySelector("#staff-count-link");
  const inviteButton = workspaceSection.querySelector("#invite-btn");
  const inviteButtonMembers = workspaceSection.querySelector("#invite-btn");
  const invitePlusMembers = workspaceSection.querySelector("#add-staff-btn");
  const createWorkBtn = workspaceSection.querySelector("#create-work-btn");


  // --- State Variables ---
  let currentUser = null;
  let unsubscribeWorkspaces = null;
  const generateColorForName = (name) => {
    const hash = (name || '').split("").reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);

    // Limit hue to a cooler range (e.g., 180–300: green-blue-purple)
    const hue = 180 + (hash % 120); // values between 180 and 300
    const saturation = 50; // softer saturation
    const lightness = 60; // brighter but not glaring

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };
  async function loadAndRenderWorkspaces(uid) {
    if (unsubscribeWorkspaces) unsubscribeWorkspaces();

    const userRef = doc(db, 'users', uid);

    const workspacesQuery = query(
      collectionGroup(db, 'myworkspace'),
      where('members', 'array-contains', uid)
    );

    unsubscribeWorkspaces = onSnapshot(workspacesQuery, async (workspacesSnap) => {
      // 🔁 Always re-fetch current user's selectedWorkspace
      const userSnap = await getDoc(userRef);
      const selectedWorkspaceId = userSnap.exists() ? userSnap.data().selectedWorkspace : null;

      if (workspacesSnap.empty) {
        workspaceTitleEl.textContent = "No Workspace";
        staffListContainer.innerHTML = '<p>Create a workspace to begin.</p>';
        updateURL(null);
        return;
      }

      let selectedWorkspaceData = null;
      const otherWorkspaces = [];

      workspacesSnap.docs.forEach(doc => {
        const data = { id: doc.id, ref: doc.ref, ...doc.data() };
        if (doc.id === selectedWorkspaceId) {
          selectedWorkspaceData = data;
        } else {
          otherWorkspaces.push(data);
        }
      });

      // 🛠 Fallback & force re-write if still no selected
      if (!selectedWorkspaceData) {
        selectedWorkspaceData = {
          id: workspacesSnap.docs[0].id,
          ref: workspacesSnap.docs[0].ref,
          ...workspacesSnap.docs[0].data()
        };

        await setDoc(userRef, { selectedWorkspace: selectedWorkspaceData.id }, { merge: true });

        // 🔁 Rerun load again with updated user doc to refresh UI
        return loadAndRenderWorkspaces(uid);
      }

      // ✅ Now safe to update UI
      updateURL(selectedWorkspaceData.id);
      updateWorkspaceUI(selectedWorkspaceData, currentUser);
      createWorkspaceDropdown(otherWorkspaces, userRef, uid);
    });

  }

  /**
   * Updates the UI with the selected workspace's data and enables editing for owners.
   * @param {object} workspace - The selected workspace data object.
   * @param {object} user - The current Firebase user object.
   */
  function updateWorkspaceUI(workspace, user) {
    if (!workspace || !user) return;

    const ownerUID = workspace.ref.parent.parent.id;
    const isOwner = user.uid === ownerUID;

    workspaceTitleEl.onfocus = null;
    workspaceTitleEl.onblur = null;
    teamDescriptionEl.onfocus = null;
    teamDescriptionEl.onblur = null;

    workspaceTitleEl.textContent = workspace.name;
    teamDescriptionEl.textContent = workspace.description || "Click to add team description...";

    if (isOwner) {
      workspaceTitleEl.contentEditable = "true";
      teamDescriptionEl.contentEditable = "true";
      workspaceTitleEl.classList.add('is-editable');
      teamDescriptionEl.classList.add('is-editable');

      const handleBlur = async (event, fieldName) => {
        const element = event.target;
        const originalText = element.dataset.originalValue;
        const newText = element.textContent.trim();

        if (originalText === newText) return;

        if (fieldName === 'name' && !newText) {
          alert("Workspace name cannot be empty.");
          element.textContent = originalText;
          return;
        }

        try {
          // The 'workspace.ref' is still available from the query result, so this works
          await updateDoc(workspace.ref, { [fieldName]: newText });
          element.classList.add('saved');
          setTimeout(() => element.classList.remove('saved'), 1000);
        } catch (error) {
          console.error(`Error updating ${fieldName}:`, error);
          element.textContent = originalText;
        }
      };

      const handleFocus = (event) => {
        event.target.dataset.originalValue = event.target.textContent;
      };

      workspaceTitleEl.onfocus = handleFocus;
      workspaceTitleEl.onblur = (e) => handleBlur(e, 'name');
      teamDescriptionEl.onfocus = handleFocus;
      teamDescriptionEl.onblur = (e) => handleBlur(e, 'description');

    } else {
      workspaceTitleEl.contentEditable = "false";
      teamDescriptionEl.contentEditable = "false";
      workspaceTitleEl.classList.remove('is-editable');
      teamDescriptionEl.classList.remove('is-editable');
    }

    staffListContainer.innerHTML = '';
    const uids = workspace.members || [];
    if (staffCountLink) staffCountLink.textContent = `View all ${uids.length}`;
    uids.slice(0, 6).forEach(async (memberUID) => {
      const userSnap = await getDoc(doc(db, `users/${memberUID}`));
      if (userSnap.exists()) {
        const img = document.createElement('img');
        img.src = userSnap.data().avatar;
        img.className = 'user-avatar-myworkspace';
        staffListContainer.appendChild(img);
      }
    });
    const plusBtn = document.createElement("div");
    plusBtn.id = "add-staff-btn";
    plusBtn.className = "add-staff-icon";
    plusBtn.innerHTML = `<i class="fas fa-plus"></i>`;
    staffListContainer.appendChild(plusBtn);
    plusBtn.addEventListener("click", () => showInviteModal(), { signal: controller.signal });
  }

  /**
   * Creates and manages the workspace selection dropdown menu.
   * @param {Array} otherWorkspaces - An array of workspaces the user is in, excluding the selected one.
   * @param {DocumentReference} userRef - Firestore reference to the current user's document.
   */
  function createWorkspaceDropdown(otherWorkspaces, userRef, uid) {
    const oldDropdown = headerLeft.querySelector('.workspace-dropdown');
    if (oldDropdown) oldDropdown.remove();
    workspaceTitleEl.classList.remove('is-switchable');
    workspaceTitleEl.onclick = null;

    if (otherWorkspaces.length === 0) return;

    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'workspace-dropdown';
    otherWorkspaces.forEach(ws => {
      const item = document.createElement('a');
      item.href = "#";
      item.className = 'workspace-dropdown-item';
      item.textContent = ws.name;
      item.onclick = async (e) => {
        e.preventDefault();
        await setDoc(userRef, { selectedWorkspace: ws.id }, { merge: true });
        dropdownContainer.classList.remove('visible');
        loadAndRenderWorkspaces(uid);
      };
      dropdownContainer.appendChild(item);
    });
    headerLeft.appendChild(dropdownContainer);

    workspaceTitleEl.classList.add('is-switchable');
    workspaceTitleEl.onclick = () => {
      dropdownContainer.classList.toggle('visible');
    };
  }

  /**
   * Updates the browser URL to match the selected workspace without reloading.
   * @param {string|null} workspaceId - The ID of the current workspace.
   */
  function updateURL(workspaceId) {
    const newPath = workspaceId
      ? `/myworkspace?selectedWorkspace=${workspaceId}`
      : '/myworkspace';

    if (window.location.pathname + window.location.search !== newPath) {
      window.history.pushState({ path: newPath }, '', newPath);
    }
  }

  // --- Main Execution Logic ---

  onAuthStateChanged(auth, user => {
    if (user) {
      currentUser = user;
      loadAndRenderWorkspaces(user.uid);
    } else {
      currentUser = null;
      if (unsubscribeWorkspaces) unsubscribeWorkspaces();
      // Optionally clear the UI for logged-out users
      workspaceTitleEl.textContent = 'Please log in';
      staffListContainer.innerHTML = '';
    }
  });

  async function handleProjectCreate() {
    const name = prompt("Enter new project name:");
    if (!name?.trim()) return;
    if (!currentUser) return alert("User not available.");

    try {
      // 1. Get the current user's selectedWorkspaceId
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      const selectedWorkspaceId = userSnap.data()?.selectedWorkspace;
      if (!selectedWorkspaceId) {
        return alert("No workspace selected. Please select a workspace first.");
      }

      // 2. Look for the actual workspace document in any user's collection
      const workspaceGroupQuery = query(
        collectionGroup(db, 'myworkspace'),
        where('workspaceId', '==', selectedWorkspaceId)
      );
      const workspaceGroupSnap = await getDocs(workspaceGroupQuery);

      if (workspaceGroupSnap.empty) {
        return alert("Error: The selected workspace could not be found. It may have been deleted.");
      }

      // This is the reference to the owner's workspace document
      const ownerWorkspaceRef = workspaceGroupSnap.docs[0].ref;
      const projectsColRef = collection(ownerWorkspaceRef, "projects");
      const newProjectRef = doc(projectsColRef);

      // Default Columns, Sections, etc.
      const INITIAL_DEFAULT_COLUMNS = [
        { id: 'assignees', name: 'Assignee', control: 'assignee' },
        { id: 'dueDate', name: 'Due Date', control: 'due-date' },
        {
          id: 'priority',
          name: 'Priority',
          control: 'priority',
          options: [
            { name: 'High', color: '#EF4D3D' },
            { name: 'Medium', color: '#FFD15E' },
            { name: 'Low', color: '#59E166' }
          ]
        },
        {
          id: 'status',
          name: 'Status',
          control: 'status',
          options: [
            { name: 'On track', color: '#59E166' },
            { name: 'At risk', color: '#fff1b8' },
            { name: 'Off track', color: '#FFD15E' },
            { name: 'Completed', color: '#878787' }
          ]
        }
      ];

      const INITIAL_DEFAULT_SECTIONS = [
        { title: 'Todo', order: 0, sectionType: 'todo', isCollapsed: false },
        { title: 'Doing', order: 1, sectionType: 'doing', isCollapsed: false },
        { title: 'Completed', order: 2, sectionType: 'completed', isCollapsed: true }
      ];

      const INITIAL_COLUMN_ORDER = INITIAL_DEFAULT_COLUMNS.map(col => col.id);

      // 3. Transaction: create the project and sections
      await runTransaction(db, async (txn) => {
        txn.set(newProjectRef, {
          title: name.trim(),
          projectId: newProjectRef.id,
          workspaceId: selectedWorkspaceId,
          memberUIDs: [currentUser.uid],
          color: generateColorForName(name.trim()),
          starred: false,
          createdAt: serverTimestamp(),
          accessLevel: "private",
          workspaceRole: "Viewer",
          project_super_admin_uid: currentUser.uid,
          project_admin_user: '',
          members: [{ uid: currentUser.uid, role: "Project Owner Admin" }],
          pendingInvites: [],
          defaultColumns: INITIAL_DEFAULT_COLUMNS,
          customColumns: [],
          columnOrder: INITIAL_COLUMN_ORDER
        });

        // ✅ Write selectedProjectId to the user's root profile (not inside myworkspace)
        txn.set(userRef, { selectedProjectId: newProjectRef.id }, { merge: true });

        // Create default sections under the new project
        const sectionsColRef = collection(newProjectRef, "sections");
        INITIAL_DEFAULT_SECTIONS.forEach(sectionData => {
          const sectionRef = doc(sectionsColRef);
          txn.set(sectionRef, { ...sectionData, createdAt: serverTimestamp() });
        });
      });

      console.log("Project created and set as active successfully!");

      // 4. Update centralized workspace membership (optional/if applicable)
      try {
        const memberDocRef = doc(db, 'workspaces', selectedWorkspaceId, 'members', currentUser.uid);
        await setDoc(memberDocRef, {
          userId: currentUser.uid,
          selectedProjectId: newProjectRef.id,
          selectedProjectWorkspaceVisibility: "private",
          lastAccessed: serverTimestamp()
        }, { merge: true });

        console.log("Centralized workspace membership updated.");
      } catch (membershipError) {
        console.error("Failed to update workspace membership:", membershipError);
      }

    } catch (err) {
      console.error("Project creation failed:", err);
      alert("Failed to create the project. Please try again.");
    }
  }

  if (createWorkBtn) {
    createWorkBtn.addEventListener("click", handleProjectCreate, { signal: controller.signal });
  }

  if (inviteButton) {
    inviteButton.addEventListener("click", () => showInviteModal(), { signal: controller.signal });
  }

  // Return the cleanup function
  return () => {
    controller.abort();
    if (unsubscribeWorkspaces) unsubscribeWorkspaces();
  };
}