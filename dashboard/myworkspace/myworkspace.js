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
  
  const wsQuery = query(collection(db, `users/${currentUser.uid}/myworkspace`), where("isSelected", "==", true));
  const wsSnap = await getDocs(wsQuery);
  if (wsSnap.empty) return alert("No workspace selected.");
  const wsId = wsSnap.docs[0].id;
  
  // --- 1. Define the Default Structures ---
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
  // --- End of Definitions ---
  
  const projectsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${wsId}/projects`);
  const newRef = doc(projectsColRef);
  
  try {
    await runTransaction(db, async txn => {
      const currentlySelected = projectsData.find(p => p.isSelected === true);
      if (currentlySelected) {
        const oldProjectRef = doc(projectsColRef, currentlySelected.id);
        txn.update(oldProjectRef, { isSelected: false });
      }
      
      // --- 2. Add default and custom columns to the new project ---
      txn.set(newRef, {
        title: name.trim(),
        color: generateColorForName(name.trim()),
        starred: false,
        isSelected: true,
        createdAt: serverTimestamp(),
        accessLevel: "workspace",
        workspaceRole: "Viewer",
        project_super_admin_uid: currentUser.uid,
        project_admin_user: '',
        members: [{ uid: currentUser.uid, role: "Project admin" }],
        pendingInvites: [],
        defaultColumns: INITIAL_DEFAULT_COLUMNS, // <-- ADDED
        customColumns: [] // <-- ADDED
      });
      
      // --- 3. Create the three default sections ---
      // This replaces the old "General" section logic.
      const sectionsColRef = collection(newRef, "sections");
      INITIAL_DEFAULT_SECTIONS.forEach(sectionData => {
        const sectionRef = doc(sectionsColRef);
        txn.set(sectionRef, {
          ...sectionData,
          createdAt: serverTimestamp()
        });
      });
    });
    
    // This call will now work because we define the function below.
    selectProject(newRef.id);
    
  } catch (err) {
    console.error("Create failed:", err);
  }
}

/**
 * Handles the logic for selecting a project.
 * It updates the 'isSelected' flags in Firestore and navigates the page.
 * @param {string} projectId The ID of the project to select.
 */
async function selectProject(projectId) {
  // Guard against missing data or clicking the already active project
  if (!projectId || !currentUser || !activeWorkspaceId) return;
  const currentlySelected = projectsData.find(p => p.isSelected === true);
  if (currentlySelected && currentlySelected.id === projectId) return;
  
  try {
    const batch = writeBatch(db);
    const projectsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects`);
    
    // Deselect the old project if one was selected
    if (currentlySelected) {
      const oldProjectRef = doc(projectsColRef, currentlySelected.id);
      batch.update(oldProjectRef, { isSelected: false });
    }
    
    // Select the new project
    const newProjectRef = doc(projectsColRef, projectId);
    batch.update(newProjectRef, { isSelected: true });
    
    // Commit both changes at once
    await batch.commit();
    
    // After the data is saved, navigate to the new project's URL
    // (This assumes your stringToNumericString and router functions are available)
    const numericUserId = stringToNumericString(currentUser.uid);
    const numericProjectId = stringToNumericString(projectId);
    const newRoute = `/tasks/${numericUserId}/list/${numericProjectId}`;
    
    history.pushState(null, '', newRoute);
    window.router(); // Manually trigger the router to load the new page content
    
  } catch (error) {
    console.error("Error selecting project:", error);
  }
}

  if (createWorkBtn) {
    createWorkBtn.addEventListener("click", handleProjectCreate, { signal: controller.signal });
  }

  return () => {
    controller.abort();
    if (unsubscribeWorkspace) unsubscribeWorkspace();
  };
}
