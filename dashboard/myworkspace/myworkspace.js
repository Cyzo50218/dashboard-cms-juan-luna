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
                const { avatarImageLink } = userSnap.data();
                const img = document.createElement("img");
                img.src = avatarImageLink;
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

    const projectsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${wsId}/projects`);
    const newRef = doc(projectsColRef);

    try {
      await runTransaction(db, async txn => {
        const allProj = await getDocs(projectsColRef);
        allProj.docs.forEach(d => {
          if (d.data().isSelected)
            txn.update(d.ref, { isSelected: false });
        });

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
          pendingInvites: []
        });

        const secRef = doc(collection(newRef, "sections"));
        txn.set(secRef, { title: "General", createdAt: serverTimestamp() });
      });

      selectProject(newRef.id);
    } catch (err) {
      console.error("Create failed:", err);
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
