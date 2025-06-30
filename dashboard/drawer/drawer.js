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
    doc,
    onSnapshot,
    query,
    orderBy,
    runTransaction,
    serverTimestamp,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

(function initializeDrawer() {
    if (window.drawerLogicInitialized) return;
    
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app, "juanluna-cms-01");
    
    const sidebar = document.getElementById("dashboardDrawer");
    if (!sidebar) return;
    
    // --- Module-level state variables ---
    let projectsData = [];
    let activeWorkspaceId = null; // ID of the user's selected workspace
    let selectedProjectId = null; // ID of the project selected within that workspace
    let currentUser = null;
    let unsubscribeProjects = null;
    let unsubscribeUserDoc = null;
    let unsubscribeWorkspace = null; // Listener for the active workspace document
    
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
    
    // ✅ 1. Filter for visible projects FIRST
    // A project is visible if it's not private, OR if it is private and you are the owner.
    const visibleProjects = projectsData.filter(p =>
        p.accessLevel !== 'private' || p.project_super_admin_uid === currentUser.uid
    );
    
    projectsListContainer.innerHTML = '';
    
    // ✅ 2. Use the 'visibleProjects' array for all subsequent logic
    if (visibleProjects.length === 0) {
        projectsListContainer.innerHTML = `<li class="nav-item-empty">No projects yet.</li>`;
        updateMyTasksLink(null); // Pass null when no projects
        return;
    }
    
    // --- Group visible projects by active workspace ---
    const activeProjects = activeWorkspaceId ? visibleProjects.filter(p => p.workspaceId === activeWorkspaceId) : [];
    const otherProjects = activeWorkspaceId ? visibleProjects.filter(p => p.workspaceId !== activeWorkspaceId) : visibleProjects;
    
    const renderProjectItem = (project) => {
        const projectLi = document.createElement('li');
        projectLi.classList.add('nav-item-project', 'projects-item');
        
        if (project.id === selectedProjectId) {
            projectLi.classList.add('selected');
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
        activeProjects.forEach(renderProjectItem);
    }
    
    if (otherProjects.length > 0) {
        if (activeProjects.length > 0) {
            // Optional header for separation
        }
        otherProjects.forEach(renderProjectItem);
    }
    
    // ✅ 3. Update the "My Tasks" link based on the visible projects
    const selectedProject = visibleProjects.find(p => p.id === selectedProjectId);
    updateMyTasksLink(selectedProject || visibleProjects[0]);
}
    
    /**
     * Helper to update the main "My Tasks" link. (No changes needed here)
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
     * ✅ Creates a new project using the new data model.
     */
    async function handleAddProject() {
        if (!currentUser) return alert("You must be logged in to add a project.");
        
        const newProjectName = prompt("Enter the name for the new project:");
        if (!newProjectName || !newProjectName.trim()) return;
        
        try {
            // Determine the active workspace on-demand
            const userRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userRef);
            const activeWorkspaceId = userSnap.data()?.selectedWorkspace;
            
            if (!activeWorkspaceId) return alert("Cannot add project: No active workspace is selected.");
            
            const workspaceRef = doc(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}`);
            const projectsColRef = collection(workspaceRef, "projects");
            const newProjectRef = doc(projectsColRef);
            
            const defaultColumns = [
                { id: 'assignees', name: 'Assignee', control: 'assignee' },
                { id: 'dueDate', name: 'Due Date', control: 'due-date' },
                { id: 'priority', name: 'Priority', control: 'priority' },
                { id: 'status', name: 'Status', control: 'status' }
            ];
            const columnOrder = defaultColumns.map(col => col.id); // Create columnOrder
            
            const newProjectData = {
                title: newProjectName.trim(),
                projectId: newProjectRef.id,
                workspaceId: activeWorkspaceId,
                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                createdAt: serverTimestamp(),
                accessLevel: "private",
                members: [{ uid: currentUser.uid, role: "Project Owner Admin" }],
                memberUIDs: [currentUser.uid],
                defaultColumns: defaultColumns,
                customColumns: [],
                columnOrder: columnOrder // Add the columnOrder
            };
            
            const sectionsData = [
                { title: 'Todo', order: 0, sectionType: 'todo', isCollapsed: false, createdAt: serverTimestamp() },
                { title: 'Doing', order: 1, sectionType: 'doing', isCollapsed: false, createdAt: serverTimestamp() },
                { title: 'Completed', order: 2, sectionType: 'completed', isCollapsed: true, createdAt: serverTimestamp() }
            ];
            
            // The transaction now sets the new project and updates the workspace
            await runTransaction(db, async (transaction) => {
                // 1. Create the new project
                transaction.set(newProjectRef, newProjectData);
                
                // 2. Update the parent workspace to select this new project
                transaction.update(workspaceRef, { selectedProjectId: newProjectRef.id });
                
                // 3. Create default sections
                const sectionsColRef = collection(newProjectRef, "sections");
                sectionsData.forEach(section => {
                    transaction.set(doc(sectionsColRef), section);
                });
            });
            
            console.log("Project created and selected successfully!");
            
        } catch (error) {
            console.error("Error adding project:", error);
        }
    }
    
    /**
     * ✅ Selects a project by updating the parent workspace document.
     */
    async function selectProject(projectIdToSelect) {
        if (!currentUser) return console.error("Cannot select project: No user.");
        
        try {
            // Determine active workspace on-demand
            const userRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userRef);
            const activeWorkspaceId = userSnap.data()?.selectedWorkspace;
            
            if (!activeWorkspaceId) return console.error("Cannot select project: No active workspace.");
            
            const workspaceRef = doc(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}`);
            
            // Simply set the selected project ID on the workspace. The listener will do the rest.
            await setDoc(workspaceRef, {
                selectedProjectId: projectIdToSelect
            }, { merge: true });
            
        } catch (error) {
            console.error("Error setting selected project:", error);
        }
    }
    
    /**
     * Main event listener for the drawer. (No changes needed)
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
     * ✅ Main auth listener now uses a NESTED listener approach.
     */
    onAuthStateChanged(auth, (user) => {
        console.log("DEBUG: Auth state changed. Cleaning up listeners.");
        if (unsubscribeUserDoc) unsubscribeUserDoc();
        if (unsubscribeProjects) unsubscribeProjects();
        if (unsubscribeWorkspace) unsubscribeWorkspace(); // Also clean up the nested listener
        
        activeWorkspaceId = null;
        selectedProjectId = null; // Also reset selected project
        projectsData = [];
        
        if (user) {
            currentUser = user;
            
            // --- LISTENER 1: Listen to the USER DOCUMENT to find the active WORKSPACE ---
            const userDocRef = doc(db, 'users', user.uid);
            unsubscribeUserDoc = onSnapshot(userDocRef, (userSnap) => {
                const newActiveWorkspaceId = userSnap.data()?.selectedWorkspace || null;
                
                if (newActiveWorkspaceId !== activeWorkspaceId) {
                    console.log(`DEBUG: Active workspace changed to: ${newActiveWorkspaceId}`);
                    activeWorkspaceId = newActiveWorkspaceId;
                    
                    // Clean up the old workspace listener before creating a new one
                    if (unsubscribeWorkspace) unsubscribeWorkspace();
                    
                    if (activeWorkspaceId) {
                        // --- NESTED LISTENER: Now listen to the ACTIVE WORKSPACE for the selected PROJECT ---
                        const workspaceRef = doc(db, `users/${user.uid}/myworkspace/${activeWorkspaceId}`);
                        unsubscribeWorkspace = onSnapshot(workspaceRef, (workspaceSnap) => {
                            const newSelectedProjectId = workspaceSnap.data()?.selectedProjectId || null;
                            if (newSelectedProjectId !== selectedProjectId) {
                                console.log(`DEBUG: Selected project changed to: ${newSelectedProjectId}`);
                                selectedProjectId = newSelectedProjectId;
                                renderProjectsList(); // Re-render when the selected project changes
                            }
                        });
                    } else {
                        // No active workspace, so no selected project
                        selectedProjectId = null;
                        renderProjectsList();
                    }
                }
            });
            
            // --- LISTENER 2: Listen for all projects the user is a member of (NO CHANGE NEEDED) ---
            const projectsQuery = query(
                collectionGroup(db, 'projects'),
                where('memberUIDs', 'array-contains', user.uid),
                orderBy("createdAt", "desc")
            );
            unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
                projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderProjectsList(); // Re-render whenever the project data itself changes
            });
            
        } else {
            currentUser = null;
            renderProjectsList();
        }
    });
    
    window.drawerLogicInitialized = true;
    console.log("Drawer Component Initialized with new data model.");
})();