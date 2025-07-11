// File: /dashboard/myworkspace/myworkspace.js

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
  getDoc,
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
  if (!workspaceSection) return () => {};
  
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
  async function loadSelectedWorkspace(uid) {
  // ✅ 1. Get the user's document to find the ID of their selected workspace.
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists() || !userSnap.data().selectedWorkspace) {
    console.warn("Could not load workspace: User document or selectedWorkspace field is missing.");
    // Optional: Clear any existing workspace UI here if needed
    if (unsubscribeWorkspace) unsubscribeWorkspace();
    staffListContainer.innerHTML = "";
    return;
  }
  
  const selectedWorkspaceId = userSnap.data().selectedWorkspace;
  
  // ✅ 2. Build a direct reference to the selected workspace document.
  const selRef = doc(db, `users/${uid}/myworkspace`, selectedWorkspaceId);
  
  // The old query for "isSelected: true" is now completely removed.
  
  // ✅ 3. The existing snapshot listener is attached to the correct reference.
  // The rest of the function's logic remains the same.
  if (unsubscribeWorkspace) unsubscribeWorkspace();
  
  unsubscribeWorkspace = onSnapshot(selRef, async (snap) => {
    const data = snap.data();
    if (!data?.members) {
      // Handle case where workspace might be empty or malformed
      staffListContainer.innerHTML = "";
      if (staffCountLink) {
        staffCountLink.textContent = `View all 0`;
      }
      return;
    }
    
    const uids = data.members; // Array of strings
    const visibleUids = uids.slice(0, 6);
    
    staffListContainer.innerHTML = ""; // Clear previous avatars
    
    for (const memberUID of visibleUids) {
      try {
        const userSnap = await getDoc(doc(db, `users/${memberUID}`));
        if (userSnap.exists()) {
          const { avatar } = userSnap.data();
          const img = document.createElement("img");
          img.src = avatar;
          img.className = "user-avatar-myworkspace";
          staffListContainer.appendChild(img);
        }
      } catch (e) {
        console.warn(`Error loading profile for user ${memberUID}`, e);
      }
    }
    
    if (staffCountLink) {
      staffCountLink.textContent = `View all ${uids.length}`;
    }
    
    // Add the "+" button
    const btn = document.createElement("div");
    btn.id = "add-staff-btn";
    btn.className = "add-staff-icon";
    btn.innerHTML = `<i class="fas fa-plus"></i>`;
    staffListContainer.appendChild(btn);
    
    btn.addEventListener("click", async () => {
      const result = await showInviteModal();
      if (result) console.log("Invite result", result);
    }, { signal: controller.signal });
  });
}
  
  onAuthStateChanged(auth, user => {
    if (!user) return console.warn("Not signed in.");
    currentUser = user;
    loadSelectedWorkspace(user.uid);
  });
  
async function handleProjectCreate() {
  const name = prompt("Enter new project name:");
  if (!name?.trim()) return;
  if (!currentUser) return alert("User not available.");
  
  try {
    // ✅ 1. Get the current user's document to find the selected workspace ID.
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return alert("Error: Current user data not found.");
    }
    
    const selectedWorkspaceId = userSnap.data().selectedWorkspace;
    if (!selectedWorkspaceId) {
      return alert("No workspace has been selected. Please select a workspace first.");
    }
    
    // ✅ 2. Build the exact path to the workspace document INSIDE the user's 'myworkspace' subcollection.
    const workspaceRef = doc(db, `users/${currentUser.uid}/myworkspace`, selectedWorkspaceId);
    
    // As a safeguard, you might want to check if this document actually exists.
    const workspaceSnap = await getDoc(workspaceRef);
    if (!workspaceSnap.exists()) {
      return alert("Error: The selected workspace points to a document that does not exist in your 'myworkspace' collection.");
    }
    
    // ✅ 3. Build the path to the new project's collection using the path above.
    const projectsColRef = collection(workspaceRef, "projects");
    
    // --- Default Structures (No change) ---
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
    
    // Generate the new project's ID upfront
    const newProjectRef = doc(projectsColRef);
    
    await runTransaction(db, async (txn) => {
      // 1. Set the data for the new project document
      txn.set(newProjectRef, {
        title: name.trim(),
        projectId: newProjectRef.id,
        workspaceId: selectedWorkspaceId, // Store the parent workspace ID
        memberUIDs: [currentUser.uid],
        color: generateColorForName(name.trim()),
        starred: false,
        createdAt: serverTimestamp(),
        accessLevel: "private",
        workspaceRole: "private",
        project_super_admin_uid: currentUser.uid,
        project_admin_user: '',
        members: [{ uid: currentUser.uid, role: "Project Owner Admin" }],
        pendingInvites: [],
        defaultColumns: INITIAL_DEFAULT_COLUMNS,
        customColumns: [],
        columnOrder: INITIAL_COLUMN_ORDER
      });
      
      // ✅ 4. The transaction now correctly updates the document at users/{uid}/myworkspace/{id}
      txn.update(workspaceRef, { selectedProjectId: newProjectRef.id });
      
      // 3. Create the three default sections
      const sectionsColRef = collection(newProjectRef, "sections");
      INITIAL_DEFAULT_SECTIONS.forEach(sectionData => {
        const sectionRef = doc(sectionsColRef);
        txn.set(sectionRef, {
          ...sectionData,
          createdAt: serverTimestamp()
        });
      });
    });
    
    console.log("Project created and set as active successfully!");
    
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