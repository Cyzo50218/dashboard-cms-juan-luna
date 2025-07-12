import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  collectionGroup,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";
import { showInviteModal } from "/dashboard/components/showEmailModel.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

let projectsData = [];

export function init(params) {
  const controller = new AbortController();
  const workspaceSection = document.querySelector('div[data-section="myworkspace"]');
  if (!workspaceSection) return () => { };

  const inviteButtonMembers = workspaceSection.querySelector("#invite-btn");
  const invitePlusMembers = workspaceSection.querySelector("#add-staff-btn");
  const staffListContainer = workspaceSection.querySelector("#staff-list");
  const staffCountLink = workspaceSection.querySelector("#staff-count-link");
  const createWorkBtn = workspaceSection.querySelector("#create-work-btn");
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

  let currentUser = null;
  let unsubscribeWorkspace = null;

  // Load selected workspace and listen for changes
  async function loadUserWorkspaces(uid) {
    if (unsubscribeWorkspaces) unsubscribeWorkspaces(); // Stop any previous listener

    // Get the user's currently selected workspace ID for highlighting
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    const selectedWorkspaceRef = userSnap.exists() ? userSnap.data().selectedWorkspace : null;
    const selectedWorkspaceId = selectedWorkspaceRef ? selectedWorkspaceRef.id : null;

    // Query the entire 'myworkspace' group to find all workspaces the user is in.
    const workspacesQuery = query(
      collectionGroup(db, 'myworkspace'),
      where('members', 'array-contains', uid)
    );

    unsubscribeWorkspaces = onSnapshot(workspacesQuery, async (snapshot) => {
      if (!workspaceListContainer) return;
      workspaceListContainer.innerHTML = ''; // Clear previous list

      if (snapshot.empty) {
        workspaceListContainer.innerHTML = '<p>No workspaces found. Create one to get started!</p>';
        return;
      }

      for (const workspaceDoc of snapshot.docs) {
        const workspaceData = workspaceDoc.data();
        const isSelected = workspaceDoc.id === selectedWorkspaceId;

        // Create the container for each workspace item
        const workspaceItem = document.createElement('div');
        workspaceItem.className = `workspace-item ${isSelected ? 'selected' : ''}`;
        workspaceItem.dataset.workspaceId = workspaceDoc.id;

        // Add workspace name
        const workspaceName = document.createElement('h4');
        workspaceName.textContent = workspaceData.name;
        workspaceItem.appendChild(workspaceName);

        // Add container for member avatars
        const membersContainer = document.createElement('div');
        membersContainer.className = 'members-container';
        workspaceItem.appendChild(membersContainer);

        // Load and display member avatars
        const memberUIDs = workspaceData.members || [];
        for (const memberUID of memberUIDs.slice(0, 6)) { // Show first 6 avatars
          const memberSnap = await getDoc(doc(db, 'users', memberUID));
          if (memberSnap.exists()) {
            const img = document.createElement('img');
            img.src = memberSnap.data().avatar;
            img.title = memberSnap.data().name; // Show name on hover
            img.className = 'user-avatar-myworkspace';
            membersContainer.appendChild(img);
          }
        }
        
        if (memberUIDs.length > 6) {
           const moreMembers = document.createElement('span');
           moreMembers.className = 'more-members-indicator';
           moreMembers.textContent = `+${memberUIDs.length - 6}`;
           membersContainer.appendChild(moreMembers);
        }

        // Add click event to select the workspace
        workspaceItem.addEventListener('click', async () => {
          if (workspaceDoc.id !== selectedWorkspaceId) {
            console.log(`Switching selected workspace to: ${workspaceData.name}`);
            await setDoc(userRef, { selectedWorkspace: workspaceDoc.ref }, { merge: true });
            // The onSnapshot will re-render and highlight the new selection automatically
          }
        }, { signal: controller.signal });

        workspaceListContainer.appendChild(workspaceItem);
      }
    });
  }

  onAuthStateChanged(auth, user => {
    if (!user) return console.warn("Not signed in.");
    currentUser = user;
    loadUserWorkspaces(user.uid);
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


  /**
   * Handles the logic for selecting a project.
   * It finds the user's active workspace, updates the 'selectedProjectId' on it,
   * and triggers an automatic navigation to the new project route.
   * @param {string} projectId The ID of the project to select.
   */
  async function selectProject(projectId) {

    // --- NEW METHOD (Effective July 24, 2025) ---

    // Guard clause: The function now only needs the currentUser to be available to start.
    if (!projectId || !currentUser) {
      console.warn("selectProject aborted: Missing projectId or currentUser.");
      return;
    }

    try {
      // ✅ Step 1: Get the current user's document to find the selected workspace ID.
      console.log("[selectProject] Finding user's selected workspace ID...");
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        console.error("selectProject failed: Current user data not found.");
        return;
      }

      const activeWorkspaceId = userSnap.data().selectedWorkspace;
      if (!activeWorkspaceId) {
        console.error("selectProject failed: No active workspace found to save the selection.");
        alert("Please select an active workspace before selecting a project.");
        return;
      }

      // ✅ Step 2: Build the direct path to the active workspace document.
      const workspaceRef = doc(db, `users/${currentUser.uid}/myworkspace`, activeWorkspaceId);
      const workspaceSnap = await getDoc(workspaceRef);

      if (!workspaceSnap.exists()) {
        console.error("selectProject failed: The active workspace document does not exist.");
        return;
      }

      const currentSelectedId = workspaceSnap.data().selectedProjectId;

      // Guard clause: Don't do anything if the project is already selected.
      if (projectId === currentSelectedId) {
        console.log("selectProject aborted: This project is already selected.");
        return;
      }

      // ✅ Step 3: Perform the single, efficient write to the correct workspace document.
      await setDoc(workspaceRef, {
        selectedProjectId: projectId
      }, { merge: true });

      console.log(`DEBUG: Set active project to ${projectId} in workspace ${activeWorkspaceId}.`);

      // Step 4: Automatically navigate to the new route.
      const numericUserId = stringToNumericString(currentUser.uid);
      const numericProjectId = stringToNumericString(projectId);
      const newRoute = `/tasks/${numericUserId}/list/${numericProjectId}`;

      navigate(newRoute); // This calls the helper function below

    } catch (error) {
      console.error("Error during project selection:", error);
    }
  }

  function navigate(url) {
    // Change the URL in the browser's address bar.
    history.pushState(null, '', url);

    // Dispatch our custom 'locationchange' event. Your router should be
    // listening for this event to know when to load new content.
    window.dispatchEvent(new Event('locationchange'));
  }

  if (createWorkBtn) {
    createWorkBtn.addEventListener("click", handleProjectCreate, { signal: controller.signal });
  }

  inviteButtonMembers.addEventListener("click", async () => {
    const result = await showInviteModal();
    if (result) console.log("Invite result", result);
  }, { signal: controller.signal });

  invitePlusMembers.addEventListener("click", async () => {
    const result = await showInviteModal();
    if (result) console.log("Invite result", result);
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    if (unsubscribeWorkspace) unsubscribeWorkspace();
  };
}