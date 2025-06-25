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
    const wsCol = collection(db, `users/${uid}/myworkspace`);
    const q = query(wsCol, where("isSelected", "==", true));
    const wsSnapshot = await getDocs(q);
    if (wsSnapshot.empty) return;
    
    const selectedDoc = wsSnapshot.docs[0];
    const selRef = doc(db, `users/${uid}/myworkspace/${selectedDoc.id}`);
    
    if (unsubscribeWorkspace) unsubscribeWorkspace();
    
    unsubscribeWorkspace = onSnapshot(selRef, async (snap) => {
      const data = snap.data();
      if (!data?.members) return;
      
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
  
  // Find the active workspace on-demand to ensure we have the correct ID.
  const wsQuery = query(collection(db, `users/${currentUser.uid}/myworkspace`), where("isSelected", "==", true));
  const wsSnap = await getDocs(wsQuery);
  if (wsSnap.empty) return alert("No workspace selected.");
  
  const workspaceDoc = wsSnap.docs[0];
  const wsId = workspaceDoc.id;
  const workspaceRef = workspaceDoc.ref; // Get a reference to the workspace document for the transaction
  
  // --- Default Structures (No changes here) ---
  const INITIAL_DEFAULT_COLUMNS = [
    { id: 'assignees', name: 'Assignee', control: 'assignee' },
    { id: 'dueDate', name: 'Due Date', control: 'due-date' },
    { id: 'priority', name: 'Priority', control: 'priority' },
    { id: 'status', name: 'Status', control: 'status' }
  ];
  const INITIAL_DEFAULT_SECTIONS = [
    { title: 'Todo', order: 0, sectionType: 'todo', isCollapsed: false },
    { title: 'Doing', order: 1, sectionType: 'doing', isCollapsed: false },
    { title: 'Completed', order: 2, sectionType: 'completed', isCollapsed: true }
  ];
  
  // --- Define references needed for the transaction ---
  const projectsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${wsId}/projects`);
  const newProjectRef = doc(projectsColRef); // Generate the new project's ID upfront
  
  try {
    await runTransaction(db, async (txn) => {
      /*
      --- DEPRECATED METHOD (before June 24, 2025) ---
      The old logic found the previously selected project in a local `projectsData` array and
      updated its 'isSelected' flag to false, while setting the new project's flag to true.
      This state is now managed entirely by the 'selectedProjectId' field on the
      parent workspace document, making the transaction simpler and more reliable.

      const currentlySelected = projectsData.find(p => p.isSelected === true);
      if (currentlySelected) {
          const oldProjectRef = doc(projectsColRef, currentlySelected.id);
          txn.update(oldProjectRef, { isSelected: false });
      }
      // The old `txn.set` for the new project also included `isSelected: true`.
      */
      
      // --- NEW TRANSACTION LOGIC ---
      
      // 1. Set the data for the new project document.
      // Note: `isSelected` is removed. `projectId` and `memberUIDs` are added.
      txn.set(newProjectRef, {
        title: name.trim(),
        projectId: newProjectRef.id, // <-- ADDED: Store the document's own ID
        memberUIDs: [currentUser.uid], // <-- ADDED: For queries & security rules
        color: generateColorForName(name.trim()),
        starred: false,
        // isSelected: true, // <-- REMOVED
        createdAt: serverTimestamp(),
        accessLevel: "workspace",
        workspaceRole: "Viewer",
        project_super_admin_uid: currentUser.uid,
        project_admin_user: '',
        members: [{ uid: currentUser.uid, role: "Project Admin" }], // Use "Project Admin"
        pendingInvites: [],
        defaultColumns: INITIAL_DEFAULT_COLUMNS,
        customColumns: []
      });
      
      // 2. Update the parent workspace to make this new project the selected one.
      txn.update(workspaceRef, { selectedProjectId: newProjectRef.id });
      
      // 3. Create the three default sections.
      const sectionsColRef = collection(newProjectRef, "sections");
      INITIAL_DEFAULT_SECTIONS.forEach(sectionData => {
        const sectionRef = doc(sectionsColRef);
        txn.set(sectionRef, {
          ...sectionData,
          createdAt: serverTimestamp()
        });
      });
    });
    
    // The call to `selectProject()` is no longer needed. The real-time listener on
    // the workspace will automatically detect the 'selectedProjectId' change and update the UI.
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
    
    /*
    --- DEPRECATED METHOD (Logic before July 24, 2025) ---
    The following logic was replaced. It relied on 'isSelected: true' flags on the 
    project documents themselves and used a batch write to update two separate documents. 
    This was less efficient and not ideal for a collaborative environment where a 
    selection should be per-user, not global to the project.

    async function selectProject_OLD(projectId) {
      if (!projectId || !currentUser || !activeWorkspaceId) return;
      const currentlySelected = projectsData.find(p => p.isSelected === true);
      if (currentlySelected && currentlySelected.id === projectId) return;
      
      try {
        const batch = writeBatch(db);
        const projectsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects`);
        
        if (currentlySelected) {
          const oldProjectRef = doc(projectsColRef, currentlySelected.id);
          batch.update(oldProjectRef, { isSelected: false });
        }
        
        const newProjectRef = doc(projectsColRef, projectId);
        batch.update(newProjectRef, { isSelected: true });
        
        await batch.commit();
        
        const numericUserId = stringToNumericString(currentUser.uid);
        const numericProjectId = stringToNumericString(projectId);
        const newRoute = `/tasks/${numericUserId}/list/${numericProjectId}`;
        
        history.pushState(null, '', newRoute);
        window.router(); // Manually trigger the router
        
      } catch (error) {
        console.error("Error selecting project:", error);
      }
    }
    */
    
    // --- NEW METHOD (Effective July 24, 2025) ---
    
    // Guard clause: The function now only needs the currentUser to be available to start.
    if (!projectId || !currentUser) {
      console.warn("selectProject aborted: Missing projectId or currentUser.");
      return;
    }
    
    try {
      // Step 1: Find the active workspace on-demand to ensure it's current.
      console.log("[selectProject] Finding user's active workspace...");
      const workspaceQuery = query(
        collection(db, `users/${currentUser.uid}/myworkspace`),
        where("isSelected", "==", true),
        limit(1)
      );
      const workspaceSnapshot = await getDocs(workspaceQuery);
      
      if (workspaceSnapshot.empty) {
        console.error("selectProject failed: No active workspace found to save the selection.");
        alert("Please select an active workspace before selecting a project.");
        return;
      }
      
      const workspaceDoc = workspaceSnapshot.docs[0];
      const activeWorkspaceId = workspaceDoc.id;
      const currentSelectedId = workspaceDoc.data().selectedProjectId;
      
      // Guard clause: Don't do anything if the project is already selected.
      if (projectId === currentSelectedId) {
        console.log("selectProject aborted: This project is already selected.");
        return;
      }
      
      // Step 2: Perform the single, efficient write to the workspace document.
      const workspaceRef = workspaceDoc.ref;
      await setDoc(workspaceRef, {
        selectedProjectId: projectId
      }, { merge: true });
      
      console.log(`DEBUG: Set active project to ${projectId} in workspace ${activeWorkspaceId}.`);
      
      // Step 3: Automatically navigate to the new route.
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