/**
 * drawer.js
 * This script is a self-contained module for the navigation drawer.
 * It dynamically renders the project list and handles project selection
 * by updating the 'isSelected' state in Firestore.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    collection,
    collectionGroup,
    where,
    addDoc,
    setDoc,
    updateDoc,
    onSnapshot,
    query,
    orderBy,
    doc,
    getDocs,
    writeBatch,
    runTransaction,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

(function initializeDrawer() {
    if (window.drawerLogicInitialized) return;

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app, "juanluna-cms-01");

    const sidebar = document.getElementById("dashboardDrawer");
    if (!sidebar) return;

    // Module-level variables
    let projectsData = [];
    let selectedProjectId = null;
    let currentUser = null;
    let activeWorkspaceId = null; // This is the user's "home" or "selected" workspace
    let unsubscribeProjects = null;
    let unsubscribeWorkspace = null;

    function stringToNumericString(str) {
        if (!str) return '';
        return str.split('').map(char => char.charCodeAt(0)).join('');
    }

    /**
     * Renders the project list. This function is now more flexible and can
     * optionally group projects by active workspace vs. others.
     */
    function renderProjectsList() {
        const projectsListContainer = sidebar.querySelector('#projects-section .section-items');
        if (!projectsListContainer) return;

        projectsListContainer.innerHTML = '';
        if (projectsData.length === 0) {
            projectsListContainer.innerHTML = `<li class="nav-item-empty">No projects yet.</li>`;
            updateMyTasksLink(null); // Pass null when no projects
            return;
        }

        // --- Optional: Group projects by active workspace ---
        const activeProjects = activeWorkspaceId ? projectsData.filter(p => p.workspaceId === activeWorkspaceId) : [];
        const otherProjects = activeWorkspaceId ? projectsData.filter(p => p.workspaceId !== activeWorkspaceId) : projectsData;

        const renderProjectItem = (project) => {
            const projectLi = document.createElement('li');
            projectLi.classList.add('nav-item-project', 'projects-item');
            if (project.id === selectedProjectId) {
    projectLi.style.setProperty('--project-highlight-color', project.color);
}
            projectLi.dataset.projectId = project.id;
            const numericUserId = stringToNumericString(currentUser?.uid);
            const numericProjectId = stringToNumericString(project.id);
            const href = `/tasks/${numericUserId}/list/${numericProjectId}`;
            projectLi.innerHTML = `
                <a href="${href}" data-link>
                    <div class="nav-item-main-content">
                        <div class="project-color" style="background-color: ${project.color};"></div>
                        <span>${project.title}</span>
                    </div>
                </a>
            `;
            projectsListContainer.appendChild(projectLi);
        };

        if (activeProjects.length > 0) {
          //  projectsListContainer.innerHTML += `<li class="nav-item-header">Active Workspace</li>`;
            activeProjects.forEach(renderProjectItem);
        }

        if (otherProjects.length > 0) {
            if(activeProjects.length > 0) {
              //   projectsListContainer.innerHTML += `<li class="nav-item-header">Other Projects</li>`;
            }
            otherProjects.forEach(renderProjectItem);
        }
        // --- End of optional grouping ---

        // Logic to correctly update the "My Tasks" link
        const selectedProject = projectsData.find(p => p.isSelected === true);
        const firstProject = projectsData[0];
        updateMyTasksLink(selectedProject || firstProject);
    }

    /**
     * Helper to update the main "My Tasks" link.
     */
    function updateMyTasksLink(targetProject) {
        const myTasksLink = sidebar.querySelector('#my-tasks-link');
        if (!myTasksLink) return;

        if (targetProject) {
            const numericUserId = stringToNumericString(currentUser?.uid);
            const numericProjectId = stringToNumericString(targetProject.id);
            myTasksLink.href = `/tasks/${numericUserId}/list/${numericProjectId}`;
            myTasksLink.setAttribute('data-link', '');
        } else {
            myTasksLink.href = '#';
            myTasksLink.removeAttribute('data-link');
        }
    }

    /**
     * Creates a new project in the top-level 'projects' collection.
     */
    async function handleAddProject() {
        if (!currentUser) return alert("You must be logged in to add a project.");
        if (!activeWorkspaceId) return alert("Cannot add project: No active workspace is selected.");

        const newProjectName = prompt("Enter the name for the new project:");
        if (!newProjectName || !newProjectName.trim()) return;

        const newProjectData = {
            title: newProjectName.trim(),
            color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
            createdAt: serverTimestamp(),
            isSelected: true,
            workspaceId: activeWorkspaceId, // <-- Assign to the active workspace
            accessLevel: "private",
            members: [{ uid: currentUser.uid, role: "Project Admin" }], // Note: 'Project Admin'
            memberUIDs: [currentUser.uid], // <-- The essential field for queries
            defaultColumns: [
                { id: 'assignees', name: 'Assignee', control: 'assignee' },
                { id: 'dueDate', name: 'Due Date', control: 'due-date' },
                { id: 'priority', name: 'Priority', control: 'priority' },
                { id: 'status', name: 'Status', control: 'status' }
            ],
            customColumns: []
        };
        
        const sectionsData = [
            { title: 'Todo', order: 0, sectionType: 'todo', isCollapsed: false, createdAt: serverTimestamp() },
            { title: 'Doing', order: 1, sectionType: 'doing', isCollapsed: false, createdAt: serverTimestamp() },
            { title: 'Completed', order: 2, sectionType: 'completed', isCollapsed: true, createdAt: serverTimestamp() }
        ];

        try {
            const projectsColRef = collection(db, 'projects'); // <-- FIXED: Point to top-level collection

            await runTransaction(db, async (transaction) => {
                // Find any currently selected project for this user and deselect it
                const selectedQuery = query(projectsColRef, where('memberUIDs', 'array-contains', currentUser.uid), where('isSelected', '==', true));
                const currentlySelectedSnapshot = await getDocs(selectedQuery);
                currentlySelectedSnapshot.forEach(projDoc => {
                    transaction.update(projDoc.ref, { isSelected: false });
                });

                // Create the new project
                const newProjectRef = doc(projectsColRef);
                transaction.set(newProjectRef, newProjectData);

                // Create the default sections for the new project
                const sectionsColRef = collection(newProjectRef, "sections");
                sectionsData.forEach(section => {
                    transaction.set(doc(sectionsColRef), section);
                });
            });

            console.log("Project created successfully!");
        } catch (error) {
            console.error("Error adding project:", error);
        }
    }
    

async function selectProject(projectIdToSelect) {
    // We only need the currentUser and their activeWorkspaceId to proceed.
    if (!currentUser || !activeWorkspaceId) {
        console.error("Cannot select project: No user or active workspace.");
        return;
    }
    
    try {
        // Get a reference to the user's active workspace document.
        const workspaceRef = doc(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}`);
        
        await setDoc(workspaceRef, {
            selectedProjectId: projectIdToSelect
        }, { merge: true });
        
        console.log(`DEBUG: Set/updated active project to ${projectIdToSelect} in workspace ${activeWorkspaceId}.`);
        
    } catch (error) {
        console.error("Error setting selected project:", error);
    }
}


    /**
     * Main event listener for the drawer.
     */
    sidebar.addEventListener('click', async (e) => {
        const sectionHeader = e.target.closest('.section-header');
        if (sectionHeader) {
            sectionHeader.closest('.nav-section')?.classList.toggle('open');
            return;
        }

        if (e.target.closest('.add-project-action')) {
            e.stopPropagation();
            handleAddProject();
            document.querySelector('.drawerprojects-dropdown')?.remove();
            return;
        }

        const projectLink = e.target.closest('.projects-item a');
        if (projectLink) {
            e.preventDefault();
            const projectItem = projectLink.closest('.projects-item');
            const projectId = projectItem.dataset.projectId;
            if (projectId) {
                // When a project is clicked, we run the selection logic.
                // The onSnapshot listener will then automatically handle the re-render.
                selectProject(projectId);
            }
        }
    });

    /**
     * Main auth listener to fetch all data.
     */
    onAuthStateChanged(auth, (user) => {
    // 1. Log entry and cleanup of previous listeners
    console.log("DEBUG: Auth state changed. Cleaning up any old listeners.");
    if (unsubscribeWorkspace) unsubscribeWorkspace();
    if (unsubscribeProjects) unsubscribeProjects();
    
    // 2. Log the resetting of component state
    console.log("DEBUG: Resetting component state (activeWorkspaceId is null, projectsData is empty).");
    activeWorkspaceId = null;
    projectsData = [];
    
    if (user) {
        console.log(`DEBUG: User is now LOGGED IN. UID: ${user.uid}`);
        currentUser = user;
        
        // --- LISTENER 1: Find the user's "active" workspace ---
        console.log("DEBUG: Attaching listener for ACTIVE WORKSPACE.");
        const workspaceQuery = query(collection(db, `users/${user.uid}/myworkspace`), where("isSelected", "==", true));
        
        unsubscribeWorkspace = onSnapshot(workspaceQuery, (workspaceSnapshot) => {
            console.log(`DEBUG: [Workspace Listener] Snapshot received. Found ${workspaceSnapshot.size} document(s) with isSelected: true.`);
            
            if (!workspaceSnapshot.empty) {
                const newActiveId = workspaceSnapshot.docs[0].id;
                console.log(`DEBUG: [Workspace Listener] Found active workspace document with ID: ${newActiveId}`);
                
                if (newActiveId !== activeWorkspaceId) {
                    console.log(`DEBUG: [Workspace Listener] Active workspace has changed. Old: '${activeWorkspaceId}', New: '${newActiveId}'. Updating state.`);
                    activeWorkspaceId = newActiveId;
                    console.log("DEBUG: [Workspace Listener] Calling renderProjectsList() to reflect workspace change.");
                    renderProjectsList(); // Re-render to apply grouping/styling
                } else {
                    console.log("DEBUG: [Workspace Listener] Active workspace ID is the same as before. No state change needed here.");
                }
            } else {
                console.log("DEBUG: [Workspace Listener] No document found with isSelected: true.");
                if (activeWorkspaceId !== null) {
                    console.log("DEBUG: [Workspace Listener] Active workspace was previously set, now it's null. Clearing state.");
                    activeWorkspaceId = null;
                    console.log("DEBUG: [Workspace Listener] Calling renderProjectsList() to reflect cleared workspace.");
                    renderProjectsList(); // Re-render to remove grouping/styling
                } else {
                    console.log("DEBUG: [Workspace Listener] Active workspace was already null. No state change needed here.");
                }
            }
        });
        
// --- LISTENER 2: Find ALL projects where user is in members array ---
console.log("DEBUG: Attaching listener for ALL PROJECTS (manual filtering by user UID inside members[].uid).");
const projectsQuery = query(
    collectionGroup(db, 'projects'), 
    where('memberUIDs', 'array-contains', user.uid),
    orderBy("createdAt", "desc")
);

unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
    console.log(`DEBUG: [Projects Listener] Snapshot received. Total projects in DB: ${snapshot.size}`);
    
    projectsData = snapshot.docs
        .map((doc, index) => {
            const data = doc.data();
            const isMember = Array.isArray(data.members) && data.members.some(member => member.uid === user.uid);

            if (isMember) {
                console.log(`   --- Doc ${index} MATCH ---`);
                console.log(`     - Project ID: ${doc.id}`);
                console.log(`     - workspaceId:`, data.workspaceId);
                console.log(`     - members (filtered):`, data.members);
                return { id: doc.id, ...data };
            } else {
                console.log(`   --- Doc ${index} SKIPPED (user not in members) ---`);
                return null;
            }
        })
        .filter(Boolean); // Remove nulls

    console.log("DEBUG: [Projects Listener] Filtered projectsData (only projects where user is in members):", projectsData);
    console.log("DEBUG: [Projects Listener] Calling renderProjectsList() with new project data.");
    renderProjectsList();

}, (error) => {
    console.error("DEBUG: [Projects Listener] CRITICAL ERROR fetching projects:", error);
    projectsData = [];
    renderProjectsList();
});

        
    } else {
        console.log("DEBUG: User is now LOGGED OUT. Clearing user and calling final render.");
        currentUser = null;
        renderProjectsList();
    }
});

    window.drawerLogicInitialized = true;
    console.log("Drawer Component Initialized.");
})();