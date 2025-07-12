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
    getDocs,
    setDoc,
    updateDoc // Import updateDoc for selectProject
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
    let activeWorkspaceId = null;
    let selectedProjectId = null;
    let currentUser = null;
    let unsubscribeProjects = null;
    let unsubscribeUserDoc = null;
    let unsubscribeWorkspace = null;
    // A flag to prevent multiple reload loops
    let isReloading = false;
    
    function stringToNumericString(str) {
        if (!str) return '';
        return str.split('').map(char => char.charCodeAt(0)).join('');
    }
    
    function renderProjectsList() {
        const projectsListContainer = sidebar.querySelector('#projects-section .section-items');
        if (!projectsListContainer || !currentUser) return;
        
        // Filter projects based on their accessLevel and workspace membership
        const visibleProjects = projectsData.filter(project => {
            const isMember = project.memberUIDs && project.memberUIDs.includes(currentUser.uid);
            
            if (project.accessLevel === 'workspace' && project.workspaceId === activeWorkspaceId) {
                return true; // Show workspace-level projects even if user is not an explicit member
            }
            
            if (isMember) {
                return true; // Show any project where user is a member
            }
            
            return false;
        });
        
        
        projectsListContainer.innerHTML = '';
        
        if (visibleProjects.length === 0) {
            projectsListContainer.innerHTML = `<li class="nav-item-empty">No projects yet.</li>`;
            updateMyTasksLink(null);
            return;
        }
        
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
        
        activeProjects.sort((a, b) => a.title.localeCompare(b.title)).forEach(renderProjectItem);
        otherProjects.sort((a, b) => a.title.localeCompare(b.title)).forEach(renderProjectItem);
        
        const selectedProject = visibleProjects.find(p => p.id === selectedProjectId);
        updateMyTasksLink(selectedProject || visibleProjects[0]);
    }
    
    // This function and all other helper/event handler functions
    // remain unchanged from your provided code.
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
    
    async function handleAddProject() {
        if (!currentUser) return alert("You must be logged in to add a project.");
        
        const newProjectName = prompt("Enter the name for the new project:");
        if (!newProjectName || !newProjectName.trim()) return;
        
        try {
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
            const columnOrder = defaultColumns.map(col => col.id);
            
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
                columnOrder: columnOrder
            };
            
            const sectionsData = [
                { title: 'Todo', order: 0, sectionType: 'todo', isCollapsed: false, createdAt: serverTimestamp() },
                { title: 'Doing', order: 1, sectionType: 'doing', isCollapsed: false, createdAt: serverTimestamp() },
                { title: 'Completed', order: 2, sectionType: 'completed', isCollapsed: true, createdAt: serverTimestamp() }
            ];
            
            await runTransaction(db, async (transaction) => {
                transaction.set(newProjectRef, newProjectData);
                transaction.update(workspaceRef, { selectedProjectId: newProjectRef.id });
                const sectionsColRef = collection(newProjectRef, "sections");
                sectionsData.forEach(section => transaction.set(doc(sectionsColRef), section));
            });
            
            console.log("Project created and selected successfully!");
            
        } catch (error) {
            console.error("Error adding project:", error);
        }
    }
    
    async function updateUserWorkspaceMembership(userId, workspaceId, projectId) {
        const selectedProject = projectsData.find(p => p.id === projectId);
        const projectVisibility = selectedProject ? selectedProject.accessLevel : 'private';
        
        const memberDocRef = doc(db, `workspaces/${workspaceId}/members`, userId);
        
        try {
            await setDoc(memberDocRef, {
                userId,
                selectedProjectId: projectId,
                selectedProjectWorkspaceVisibility: projectVisibility,
                lastAccessed: serverTimestamp()
            }, { merge: true });
            
            console.log(`Updated workspace membership`);
            console.log(`User: ${userId}`);
            console.log(`Workspace: ${workspaceId}`);
            console.log(`Project: ${projectId}`);
            console.log(`Visibility: ${projectVisibility}`);
        } catch (error) {
            console.error(`Error updating workspace membership: ${error.message}`);
        }
    }
    
    async function selectProject(projectIdToSelect) {
        if (!currentUser || !activeWorkspaceId) {
            console.warn('Missing currentUser or activeWorkspaceId');
            return;
        }
        
        try {
            console.log(`Updated selectedProjectId in user workspace`);
            console.log(`User: ${currentUser.uid}`);
            console.log(`Workspace: ${activeWorkspaceId}`);
            console.log(`Project: ${projectIdToSelect}`);
            
            await updateUserWorkspaceMembership(currentUser.uid, activeWorkspaceId, projectIdToSelect);
        } catch (error) {
            console.error(`Error setting selected project: ${error.message}`);
        }
    }
    
    
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
            if (projectId && projectId !== selectedProjectId) {
                selectProject(projectId);
                window.router();
            }
        }
    });
    
    onAuthStateChanged(auth, async (user) => {
        console.log("DEBUG: Auth state changed. Cleaning up listeners.");
        
        // Clean up any old listeners
        if (unsubscribeUserDoc) unsubscribeUserDoc();
        if (unsubscribeProjects) unsubscribeProjects();
        
        activeWorkspaceId = null;
        selectedProjectId = null;
        projectsData = [];
        
        if (!user) {
            currentUser = null;
            renderProjectsList();
            return;
        }
        
        currentUser = user;
        
        // Listen to user's selectedWorkspace field
        const userDocRef = doc(db, 'users', user.uid);
        unsubscribeUserDoc = onSnapshot(userDocRef, async (userSnap) => {
            const newWorkspaceId = userSnap.data()?.selectedWorkspace || null;
            
            if (!newWorkspaceId || newWorkspaceId === activeWorkspaceId) return;
            
            activeWorkspaceId = newWorkspaceId;
            console.log(`DEBUG: Active workspace set to: ${activeWorkspaceId}`);
            
            const memberDocRef = doc(db, `workspaces/${activeWorkspaceId}/members/${user.uid}`);
            const memberSnap = await getDoc(memberDocRef);
            
            if (!memberSnap.exists()) {
                console.warn("DEBUG: Member doc not found. Cannot determine selected project.");
                selectedProjectId = null;
                renderProjectsList();
                return;
            }
            
            const newSelectedProjectId = memberSnap.data()?.selectedProjectId || null;
            const isValid = newSelectedProjectId && projectsData.some(p => p.id === newSelectedProjectId);
            
            if (isValid && newSelectedProjectId !== selectedProjectId) {
                console.log(`DEBUG: Selected project changed to: ${newSelectedProjectId}`);
                selectedProjectId = newSelectedProjectId;
                renderProjectsList();
            } else if (!isValid) {
                console.log("DEBUG: selectedProjectId is missing or invalid.");
                selectedProjectId = null;
                renderProjectsList();
            }
        });
        
        // Listen to projects the user is a member of
if (unsubscribeProjects) unsubscribeProjects();
let memberUnsub = null;
let workspaceUnsub = null;

const updateProjectsRealtime = () => {
  const allProjectsMap = new Map();

  return (snapshot, type) => {
    snapshot.forEach(doc => {
      const project = { id: doc.id, ...doc.data() };
      allProjectsMap.set(project.id, project);
    });

    // Only render when both snapshots arrive
    if (
      (type === 'member' && workspaceUnsub) ||
      (type === 'workspace' && memberUnsub)
    ) {
      projectsData = Array.from(allProjectsMap.values());
      renderProjectsList();
    }
  };
};

const handleProjectUpdates = updateProjectsRealtime();

const memberProjectsQuery = query(
  collectionGroup(db, "projects"),
  where("memberUIDs", "array-contains", user.uid)
);

const workspaceProjectsQuery = query(
  collectionGroup(db, "projects"),
  where("accessLevel", "==", "workspace"),
  where("workspaceId", "==", activeWorkspaceId)
);

memberUnsub = onSnapshot(memberProjectsQuery, (snapshot) => {
  handleProjectUpdates(snapshot, 'member');
});

workspaceUnsub = onSnapshot(workspaceProjectsQuery, (snapshot) => {
  handleProjectUpdates(snapshot, 'workspace');
});

// Save to unsubscribe later if needed
unsubscribeProjects = () => {
  if (memberUnsub) memberUnsub();
  if (workspaceUnsub) workspaceUnsub();
};


        
        unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
            projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Try to re-render with selectedProjectId if it's valid
            if (selectedProjectId && projectsData.some(p => p.id === selectedProjectId)) {
                renderProjectsList();
            }
        });
    });
    
    
    
    window.drawerLogicInitialized = true;
    console.log("Drawer Component Initialized with new data model.");
})();