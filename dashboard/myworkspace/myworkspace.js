import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";
import { showInviteModal } from "/dashboard/components/showEmailModel.js";

const INITIAL_DEFAULT_COLUMNS = [
  { id: "assignees", name: "Assignee", control: "assignee" },
  { id: "dueDate", name: "Due Date", control: "due-date" },
  {
    id: "priority",
    name: "Priority",
    control: "priority",
    options: [
      { name: "High", color: "#EF4D3D" },
      { name: "Medium", color: "#FFD15E" },
      { name: "Low", color: "#59E166" },
    ],
  },
  {
    id: "status",
    name: "Status",
    control: "status",
    options: [
      { name: "On track", color: "#59E166" },
      { name: "At risk", color: "#fff1b8" },
      { name: "Off track", color: "#FFD15E" },
      { name: "Completed", color: "#878787" },
    ],
  },
];

const INITIAL_DEFAULT_SECTIONS = [
  { title: "Todo", order: 0, sectionType: "todo", isCollapsed: false },
  { title: "Doing", order: 1, sectionType: "doing", isCollapsed: false },
  { title: "Completed", order: 2, sectionType: "completed", isCollapsed: true },
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

const generateColorForName = (name) => {
  const hash = (name || "").split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);

  const hue = 180 + (hash % 120);
  const saturation = 50;
  const lightness = 60;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const updateURL = (workspaceId) => {
  const newPath = workspaceId
    ? `/myworkspace?selectedWorkspace=${workspaceId}`
    : "/myworkspace";

  if (window.location.pathname + window.location.search !== newPath) {
    window.history.pushState({ path: newPath }, "", newPath);
  }
};

function updateWorkspaceUI(workspace, user) {
  if (!workspace || !user) return;

  const ownerUID = workspace.ref.parent.parent.id;
  const isOwner = user.uid === ownerUID;
  const workspaceTitleEl = document.querySelector(".workspace-title");
  const teamDescriptionEl = document.querySelector("#team-description");
  const staffListContainer = document.querySelector("#staff-list");
  const staffCountLink = document.querySelector("#staff-count-link");

  workspaceTitleEl.onfocus = null;
  workspaceTitleEl.onblur = null;
  teamDescriptionEl.onfocus = null;
  teamDescriptionEl.onblur = null;

  workspaceTitleEl.textContent = workspace.name;
  teamDescriptionEl.textContent =
    workspace.description || "Click to add team description...";

  workspaceTitleEl.contentEditable = isOwner;
  teamDescriptionEl.contentEditable = isOwner;
  workspaceTitleEl.classList.toggle("is-editable", isOwner);
  teamDescriptionEl.classList.toggle("is-editable", isOwner);

  if (isOwner) {
    const handleBlur = async (event, fieldName) => {
      const element = event.target;
      const originalText = element.dataset.originalValue;
      const newText = element.textContent.trim();

      if (originalText === newText) return;

      if (fieldName === "name" && !newText) {
        alert("Workspace name cannot be empty.");
        element.textContent = originalText;
        return;
      }

      try {
        await updateDoc(workspace.ref, { [fieldName]: newText });
        element.classList.add("saved");
        setTimeout(() => element.classList.remove("saved"), 1000);
      } catch (error) {
        console.error(`Error updating ${fieldName}:`, error);
        element.textContent = originalText;
      }
    };

    const handleFocus = (event) => {
      event.target.dataset.originalValue = event.target.textContent;
    };

    workspaceTitleEl.onfocus = handleFocus;
    workspaceTitleEl.onblur = (e) => handleBlur(e, "name");
    teamDescriptionEl.onfocus = handleFocus;
    teamDescriptionEl.onblur = (e) => handleBlur(e, "description");
  }

  staffListContainer.innerHTML = "";
  const uids = workspace.members || [];
  if (staffCountLink) staffCountLink.textContent = `View all ${uids.length}`;

  uids.slice(0, 6).forEach(async (memberUID) => {
    const userSnap = await getDoc(doc(db, `users/${memberUID}`));
    if (userSnap.exists()) {
      const img = document.createElement("img");
      img.src = userSnap.data().avatar;
      img.className = "user-avatar-myworkspace";
      staffListContainer.appendChild(img);
    }
  });

  const plusBtn = document.createElement("div");
  plusBtn.id = "add-staff-btn";
  plusBtn.className = "add-staff-icon";
  plusBtn.innerHTML = `<i class="fas fa-plus"></i>`;
  staffListContainer.appendChild(plusBtn);
  plusBtn.addEventListener("click", () => showInviteModal());
}

function createWorkspaceDropdown(otherWorkspaces, userRef, uid) {
  const headerLeft = document.querySelector(".header-myworkspace-left");
  const workspaceTitleEl = document.querySelector(".workspace-title");
  const oldDropdown = headerLeft.querySelector(".workspace-dropdown");

  if (oldDropdown) oldDropdown.remove();
  workspaceTitleEl.classList.remove("is-switchable");
  workspaceTitleEl.onclick = null;

  if (otherWorkspaces.length === 0) return;

  const dropdownContainer = document.createElement("div");
  dropdownContainer.className = "workspace-dropdown";

  otherWorkspaces.forEach((ws) => {
    const item = document.createElement("a");
    item.href = "#";
    item.className = "workspace-dropdown-item";
    item.textContent = ws.name;
    item.onclick = async (e) => {
      e.preventDefault();
      await setDoc(userRef, { selectedWorkspace: ws.id }, { merge: true });
      dropdownContainer.classList.remove("visible");
      loadAndRenderWorkspaces(uid);
    };
    dropdownContainer.appendChild(item);
  });

  headerLeft.appendChild(dropdownContainer);
  workspaceTitleEl.classList.add("is-switchable");
  workspaceTitleEl.onclick = () => {
    dropdownContainer.classList.toggle("visible");
  };
}

async function loadAndRenderWorkspaces(uid) {
  const userRef = doc(db, "users", uid);
  const workspaceTitleEl = document.querySelector(".workspace-title");
  const staffListContainer = document.querySelector("#staff-list");

  const workspacesQuery = query(
    collectionGroup(db, "myworkspace"),
    where("members", "array-contains", uid)
  );

  return onSnapshot(workspacesQuery, async (workspacesSnap) => {
    const userSnap = await getDoc(userRef);
    const selectedWorkspaceId = userSnap.exists()
      ? userSnap.data().selectedWorkspace
      : null;

    if (workspacesSnap.empty) {
      workspaceTitleEl.textContent = "No Workspace";
      staffListContainer.innerHTML = "<p>Create a workspace to begin.</p>";
      updateURL(null);
      return;
    }

    let selectedWorkspaceData = null;
    const otherWorkspaces = [];

    workspacesSnap.docs.forEach((doc) => {
      const data = { id: doc.id, ref: doc.ref, ...doc.data() };
      if (doc.id === selectedWorkspaceId) {
        selectedWorkspaceData = data;
      } else {
        otherWorkspaces.push(data);
      }
    });

    if (!selectedWorkspaceData) {
      selectedWorkspaceData = {
        id: workspacesSnap.docs[0].id,
        ref: workspacesSnap.docs[0].ref,
        ...workspacesSnap.docs[0].data(),
      };

      await setDoc(
        userRef,
        { selectedWorkspace: selectedWorkspaceData.id },
        { merge: true }
      );
      return loadAndRenderWorkspaces(uid);
    }

    updateURL(selectedWorkspaceData.id);
    updateWorkspaceUI(selectedWorkspaceData, currentUser);
    createWorkspaceDropdown(otherWorkspaces, userRef, uid);
  });
}

async function handleProjectCreate() {
  const name = prompt("Enter new project name:");
  if (!name?.trim()) return;
  if (!currentUser) return alert("User not available.");

  try {
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    const selectedWorkspaceId = userSnap.data()?.selectedWorkspace;

    if (!selectedWorkspaceId) {
      return alert("No workspace selected. Please select a workspace first.");
    }

    const workspaceGroupQuery = query(
      collectionGroup(db, "myworkspace"),
      where("workspaceId", "==", selectedWorkspaceId)
    );
    const workspaceGroupSnap = await getDocs(workspaceGroupQuery);

    if (workspaceGroupSnap.empty) {
      return alert("Error: The selected workspace could not be found.");
    }

    const ownerWorkspaceRef = workspaceGroupSnap.docs[0].ref;
    const projectsColRef = collection(ownerWorkspaceRef, "projects");
    const newProjectRef = doc(projectsColRef);

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
        project_admin_user: "",
        members: [{ uid: currentUser.uid, role: "Project Owner Admin" }],
        pendingInvites: [],
        defaultColumns: INITIAL_DEFAULT_COLUMNS,
        customColumns: [],
        columnOrder: INITIAL_DEFAULT_COLUMNS.map((col) => col.id),
      });

      txn.set(
        userRef,
        { selectedProjectId: newProjectRef.id },
        { merge: true }
      );

      const sectionsColRef = collection(newProjectRef, "sections");
      INITIAL_DEFAULT_SECTIONS.forEach((sectionData) => {
        const sectionRef = doc(sectionsColRef);
        txn.set(sectionRef, { ...sectionData, createdAt: serverTimestamp() });
      });
    });

    try {
      const memberDocRef = doc(
        db,
        "workspaces",
        selectedWorkspaceId,
        "members",
        currentUser.uid
      );
      await setDoc(
        memberDocRef,
        {
          userId: currentUser.uid,
          selectedProjectId: newProjectRef.id,
          selectedProjectWorkspaceVisibility: "private",
          lastAccessed: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (membershipError) {
      console.error("Failed to update workspace membership:", membershipError);
    }
  } catch (err) {
    console.error("Project creation failed:", err);
    alert("Failed to create the project. Please try again.");
  }
}

function setupThemeListener() {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (prefersDark) {
    document.documentElement.setAttribute("data-theme", "dark");
  }

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (event) => {
      if (event.matches) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    });
}

export function init(params) {
  const controller = new AbortController();
  const workspaceSection = document.querySelector(
    'div[data-section="myworkspace"]'
  );

  if (!workspaceSection) {
    return () => {};
  }

  setupThemeListener();

  let currentUser = null;
  let unsubscribeWorkspaces = null;

  const createWorkBtn = workspaceSection.querySelector("#create-work-btn");
  const inviteButton = workspaceSection.querySelector("#invite-btn");

  if (createWorkBtn) {
    createWorkBtn.addEventListener("click", handleProjectCreate, {
      signal: controller.signal,
    });
  }

  if (inviteButton) {
    inviteButton.addEventListener("click", () => showInviteModal(), {
      signal: controller.signal,
    });
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      unsubscribeWorkspaces = loadAndRenderWorkspaces(user.uid);
    } else {
      currentUser = null;
      if (unsubscribeWorkspaces) unsubscribeWorkspaces();
      const workspaceTitleEl = document.querySelector(".workspace-title");
      const staffListContainer = document.querySelector("#staff-list");
      if (workspaceTitleEl) workspaceTitleEl.textContent = "Please log in";
      if (staffListContainer) staffListContainer.innerHTML = "";
    }
  });

  return () => {
    controller.abort();
    if (unsubscribeWorkspaces) unsubscribeWorkspaces();
  };
}
