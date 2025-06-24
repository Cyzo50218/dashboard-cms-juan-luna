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
    query,
    where,
    or, // For complex queries
    orderBy,
    limit, // For pagination
    startAfter, // For pagination
    getDoc, // To get a single document
    getDocs, // To get multiple documents from a query
    addDoc, // To add a new document with an auto-generated ID
    setDoc, // To create or overwrite a document with a specific ID
    updateDoc, // To update specific fields in a document
    deleteDoc, // To delete a document
    doc, // To get a reference to a document or collection
    writeBatch, // For atomic batch operations
    runTransaction, // For atomic read-then-write operations
    serverTimestamp, // For consistent timestamps
    deleteField // To remove a field from a document
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

(function initializeDrawer() {
    if (window.drawerLogicInitialized) return;

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app, "juanluna-cms-01");

    const sidebar = document.getElementById("dashboardDrawer");
    if (!sidebar) return;

    let projectsData = [];
    let currentUser = null;
    let unsubscribeProjects = null;
    let activeWorkspaceId = null;
    let unsubscribeWorkspace = null;

    function stringToNumericString(str) {
        if (!str) return '';
        return str.split('').map(char => char.charCodeAt(0)).join('');
    }

    /**
     * Renders the project list. The active highlight is now driven by `project.isSelected`.
     */
   function renderProjectsList() {
    const projectsListContainer = sidebar.querySelector('#projects-section .section-items');
    if (!projectsListContainer) return;
    
    projectsListContainer.innerHTML = '';
    if (projectsData.length === 0) {
        projectsListContainer.innerHTML = `<li class="nav-item-empty">No projects yet.</li>`;
        const myTasksLink = sidebar.querySelector('#my-tasks-link');
        if (myTasksLink) {
            myTasksLink.href = '#';
            myTasksLink.removeAttribute('data-link');
        }
        return;
    }
    
    projectsData.forEach(project => {
        const projectLi = document.createElement('li');
        
        // This class is essential for the click listener to find the project ID.
        projectLi.classList.add('nav-item', 'projects-item');
        
        if (project.isSelected === true) {
            projectLi.classList.add('is-selected-project');
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
    });
    
    // Logic to correctly update the "My Tasks" link
    const myTasksLink = sidebar.querySelector('#my-tasks-link');
    if (myTasksLink) {
        const selectedProject = projectsData.find(p => p.isSelected === true);
        const firstProjectId = projectsData[0]?.id;
        const targetProjectId = selectedProject ? selectedProject.id : firstProjectId;
        
        if (targetProjectId) {
            const numericUserId = stringToNumericString(currentUser?.uid);
            const numericProjectId = stringToNumericString(targetProjectId);
            myTasksLink.href = `/tasks/${numericUserId}/list/${numericProjectId}`;
            myTasksLink.setAttribute('data-link', '');
        } else {
            myTasksLink.href = '#';
            myTasksLink.removeAttribute('data-link');
        }
    }
}

    /**
     * Creates a new project and sets it as the active one.
     */
    async function handleAddProject() {
    if (!currentUser || !activeWorkspaceId) return alert("Cannot add project: No workspace is selected.");
    
    const newProjectName = prompt("Enter the name for the new project:");
    if (!newProjectName || !newProjectName.trim()) return;
    
    // --- 1. Define the Default Structures ---
    // This data will be added to the new project.
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
    
    const projectsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects`);
    
    try {
        await runTransaction(db, async (transaction) => {
            const currentlySelected = projectsData.find(p => p.isSelected === true);
            if (currentlySelected) {
                const oldProjectRef = doc(projectsColRef, currentlySelected.id);
                transaction.update(oldProjectRef, { isSelected: false });
            }
            
            const newProjectRef = doc(projectsColRef);
            
            // --- 2. Update the new project data ---
            // Add the default columns and other standard fields.
            transaction.set(newProjectRef, {
                title: newProjectName.trim(),
                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                createdAt: serverTimestamp(),
                isSelected: true,
                accessLevel: "private", // You may want to default to private or workspace
                members: [{ uid: currentUser.uid, role: "Owner" }],
                defaultColumns: INITIAL_DEFAULT_COLUMNS, // <-- ADDED
                customColumns: [] // <-- ADDED
            });
            
            // --- 3. Create the three default sections ---
            const sectionsColRef = collection(newProjectRef, "sections");
            INITIAL_DEFAULT_SECTIONS.forEach(sectionData => {
                const sectionRef = doc(sectionsColRef);
                transaction.set(sectionRef, {
                    ...sectionData,
                    createdAt: serverTimestamp()
                });
            });
        });
        
        // The UI should refresh automatically via your real-time listener
        console.log("Project created successfully!");
        
    } catch (error) {
        console.error("Error adding project:", error);
    }
}

    /**
     * Main event listener for the drawer. Handles toggling sections and selecting projects.
     */
    sidebar.addEventListener('click', async (e) => {
    // Handle expanding/collapsing sections
    const sectionHeader = e.target.closest('.section-header');
    if (sectionHeader) {
        sectionHeader.closest('.nav-section')?.classList.toggle('open');
        return;
    }
    
    // --- NEW: Handle the 'Add Project' button click ---
    if (e.target.closest('.add-project-action')) {
        // We stop the event here to be safe
        e.stopPropagation();
        handleAddProject();
        // Assuming the dropdown should close after clicking
        document.querySelector('.drawerprojects-dropdown')?.remove();
        return; // Stop further execution
    }
    // --- END OF NEW LOGIC ---
    
    // Handle selecting a project
    const projectLink = e.target.closest('.projects-item a');
    if (projectLink) {
        e.preventDefault(); // Stop native navigation
        
        const projectItem = projectLink.closest('.projects-item');
        const projectId = projectItem.dataset.projectId;
        
        // The logic to call selectProject() is better here
        if (projectId) {
            selectProject(projectId); // Use your reusable function
        }
    }
});

    // --- Auth State Change Listener (Unchanged) ---
    onAuthStateChanged(auth, (user) => {
        if (unsubscribeWorkspace) unsubscribeWorkspace();
        if (unsubscribeProjects) unsubscribeProjects();

        if (user) {
            currentUser = user;
            const workspaceQuery = query(collection(db, `users/${user.uid}/myworkspace`), where("isSelected", "==", true));
            unsubscribeWorkspace = onSnapshot(workspaceQuery, (workspaceSnapshot) => {
                if (unsubscribeProjects) unsubscribeProjects();
                if (!workspaceSnapshot.empty) {
                    const workspaceDoc = workspaceSnapshot.docs[0];
                    activeWorkspaceId = workspaceDoc.id;
                    const projectsQuery = query(collection(db, `users/${user.uid}/myworkspace/${activeWorkspaceId}/projects`), orderBy("createdAt", "desc"));
                    unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
                        projectsData = snapshot.docs
    .filter(doc => {
        const data = doc.data();
        if (Array.isArray(data.members)) {
            return data.members.some(member => member.uid === user.uid);
        }
        return false;
    })
    .map(doc => ({ id: doc.id, ...doc.data() })); 
                        renderProjectsList();
                    }, (error) => {
                        console.error("Error fetching projects:", error);
                        projectsData = [];
                        renderProjectsList();
                    });
                } else {
                    console.warn("No workspace selected for this user.");
                    activeWorkspaceId = null;
                    projectsData = [];
                    renderProjectsList();
                }
            });
        } else {
            currentUser = null;
            activeWorkspaceId = null;
            projectsData = [];
            renderProjectsList();
        }
    });
    
/**
 * Handles the logic for selecting a project.
 * [DEFINITIVE FIX] - This version reads the true state from the database
 * before writing a batch update, making it robust against race conditions.
 */
async function selectProject(projectIdToSelect) {
    // Guard against missing data
    if (!projectIdToSelect || !currentUser || !activeWorkspaceId) return;
    
    console.log(`Starting selection process for project: ${projectIdToSelect}`);
    const projectsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects`);
    
    try {
        // 1. Get a fresh, real-time snapshot of ALL projects from the database.
        // This IGNORES the potentially stale local 'projectsData' array.
        const querySnapshot = await getDocs(projectsColRef);
        
        // 2. Prepare a batch operation to perform all writes at once.
        const batch = writeBatch(db);
        
        // 3. Loop through the REAL documents that just came from the database.
        querySnapshot.forEach((doc) => {
            const projectRef = doc.ref;
            const projectData = doc.data();
            
            if (doc.id === projectIdToSelect) {
                // For the project we just clicked, ensure it is set to TRUE.
                if (projectData.isSelected !== true) {
                    batch.update(projectRef, { isSelected: true });
                    console.log(`Queueing update: ${doc.id} -> isSelected: true`);
                }
            } else {
                // For ALL OTHER projects, if they are currently TRUE, set them to FALSE.
                if (projectData.isSelected === true) {
                    batch.update(projectRef, { isSelected: false });
                    console.log(`Queueing update: ${doc.id} -> isSelected: false`);
                }
            }
        });
        
        // 5. Commit the batch. This is an atomic operation.
        await batch.commit();
        console.log("Batch commit successful. Database is now consistent.");
        
        // 6. Navigate the page (using the reliable reload for now).
        const numericUserId = stringToNumericString(currentUser.uid);
        const numericProjectId = stringToNumericString(projectIdToSelect);
        const newRoute = `/tasks/${numericUserId}/list/${numericProjectId}`;
       // window.location.href = newRoute;
        
    } catch (error) {
        console.error("Error during the read-then-write selectProject operation:", error);
    }
}

    window.addEventListener('popstate', renderProjectsList);
    
    window.drawerLogicInitialized = true;
    console.log("Drawer Component Initialized.");
})();