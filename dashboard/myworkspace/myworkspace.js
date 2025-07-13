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
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";
import { showInviteModal } from "/dashboard/components/showEmailModel.js";
import { generateColorForName } from "/services/utils/colorUtils.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

export function init(params) {
  const controller = new AbortController();
  const workspaceSection = document.querySelector('div[data-section="myworkspace"]');
  if (!workspaceSection) return () => { };

  const headerLeft = workspaceSection.querySelector(".header-myworkspace-left");
  const workspaceTitleEl = workspaceSection.querySelector(".workspace-title");
  const teamDescriptionEl = workspaceSection.querySelector("#team-description");
  const staffListContainer = workspaceSection.querySelector("#staff-list");
  const staffCountLink = workspaceSection.querySelector("#staff-count-link");
  const inviteButton = workspaceSection.querySelector("#invite-btn");
  const createWorkBtn = workspaceSection.querySelector("#create-work-btn");

  let currentUser = null;
  let unsubscribeUser = null;
  let unsubscribeWorkspaces = null;

  // --- State Variables for Real-time Updates ---
  let allWorkspaces = [];
  let selectedWorkspaceId = null;

  /**
   * Main rendering function triggered by any state change.
   */
  function renderWorkspaceView() {
    if (!selectedWorkspaceId && allWorkspaces.length > 0) {
      // If no workspace is selected, default to the first one and update the user's doc
      const firstWorkspaceId = allWorkspaces[0].id;
      const userRef = doc(db, 'users', currentUser.uid);
      setDoc(userRef, { selectedWorkspace: firstWorkspaceId }, { merge: true });
      // The user listener will catch this change and trigger another render
      return;
    }

    const selectedWorkspaceData = allWorkspaces.find(ws => ws.id === selectedWorkspaceId);
    const otherWorkspaces = allWorkspaces.filter(ws => ws.id !== selectedWorkspaceId);

    if (allWorkspaces.length === 0) {
      workspaceTitleEl.textContent = "No Workspace";
      teamDescriptionEl.textContent = "Create or join a workspace to begin.";
      staffListContainer.innerHTML = '';
      updateURL(null);
      return;
    }

    if (!selectedWorkspaceData) {
      // Handles the case where the selected ID is invalid
      if (allWorkspaces.length > 0) {
        const fallbackId = allWorkspaces[0].id;
        const userRef = doc(db, 'users', currentUser.uid);
        setDoc(userRef, { selectedWorkspace: fallbackId }, { merge: true });
      }
      return;
    }

    updateURL(selectedWorkspaceData.id);
    updateWorkspaceUI(selectedWorkspaceData, currentUser);
    createWorkspaceDropdown(otherWorkspaces, doc(db, 'users', currentUser.uid));
  }

  /**
   * Sets up the real-time listeners for workspaces and user selection.
   * This is the key change for instant updates.
   * @param {string} uid - The current user's ID.
   */
  function setupWorkspaceListeners(uid) {
    // Clear previous listeners
    if (unsubscribeWorkspaces) unsubscribeWorkspaces();
    if (unsubscribeUser) unsubscribeUser();

    // Listener 1: Get all workspaces the user is a member of
    const workspacesQuery = query(
      collectionGroup(db, 'myworkspace'),
      where('members', 'array-contains', uid)
    );

    unsubscribeWorkspaces = onSnapshot(workspacesQuery, (snapshot) => {
      allWorkspaces = snapshot.docs.map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() }));
      renderWorkspaceView();
    });

    // Listener 2: Get the user's selected workspace ID
    const userRef = doc(db, 'users', uid);
    unsubscribeUser = onSnapshot(userRef, (snapshot) => {
      selectedWorkspaceId = snapshot.exists() ? snapshot.data().selectedWorkspace : null;
      renderWorkspaceView();
    });
  }

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
    plusBtn.addEventListener("click", () => showInviteModal(workspace), { signal: controller.signal });
  }

  /**
   * Creates the dropdown menu below the workspace title.
   * This is modified for better positioning.
   */
  function createWorkspaceDropdown(otherWorkspaces, userRef) {
    const oldContainer = headerLeft.querySelector('.workspace-title-container');
    if (oldContainer) oldContainer.remove();

    // 1. Create a wrapper for the title and dropdown for correct positioning
    const titleContainer = document.createElement('div');
    titleContainer.className = 'workspace-title-container';

    // Move the original title element inside the new container
    titleContainer.appendChild(workspaceTitleEl);
    headerLeft.prepend(titleContainer); // Add container to the start of the header

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
        // No need to do anything else, the user listener will handle the update
      };
      dropdownContainer.appendChild(item);
    });
    // 2. Append the dropdown inside the same wrapper
    titleContainer.appendChild(dropdownContainer);

    workspaceTitleEl.classList.add('is-switchable');
    workspaceTitleEl.onclick = () => {
      dropdownContainer.classList.toggle('visible');
    };

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        if (!titleContainer.contains(event.target)) {
            dropdownContainer.classList.remove('visible');
        }
    }, { signal: controller.signal });
  }

  function updateURL(workspaceId) {
    const newPath = workspaceId
      ? `/myworkspace?selectedWorkspace=${workspaceId}`
      : '/myworkspace';

    if (window.location.pathname + window.location.search !== newPath) {
      window.history.pushState({ path: newPath }, '', newPath);
    }
  }

  onAuthStateChanged(auth, user => {
    if (user) {
      currentUser = user;
      setupWorkspaceListeners(user.uid);
    } else {
      currentUser = null;
      if (unsubscribeWorkspaces) unsubscribeWorkspaces();
      if (unsubscribeUser) unsubscribeUser();
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

  return () => {
    controller.abort();
    if (unsubscribeWorkspaces) unsubscribeWorkspaces();
    if (unsubscribeUser) unsubscribeUser();
  };
}