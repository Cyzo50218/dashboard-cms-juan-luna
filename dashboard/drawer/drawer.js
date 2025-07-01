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
    setDoc,
    updateDoc
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
    let activeWorkspaceId = null;
    let selectedProjectId = null;
    let currentUser = null;
    let unsubscribeProjects = null;
    let unsubscribeUserDoc = null;
    let unsubscribeWorkspace = null;
    
    function stringToNumericString(str) {
        if (!str) return '';
        return str.split('').map(char => char.charCodeAt(0)).join('');
    }
    
    function renderProjectsList() {
        const projectsListContainer = sidebar.querySelector('#projects-section .section-items');
        if (!projectsListContainer || !currentUser) return;
        
        const visibleProjects = projectsData.filter(p =>
            (!activeWorkspaceId || p.workspaceId === activeWorkspaceId) &&
            (p.accessLevel !== 'private' || (p.members && p.members.some(m => m.uid === currentUser.uid)))
        );
        
        projectsListContainer.innerHTML = '';
        
        if (visibleProjects.length === 0) {
            projectsListContainer.innerHTML = `<li class="nav-item-empty">No projects yet.</li>`;
            updateMyTasksLink(null);
            return;
        }
        
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
        
        visibleProjects.sort((a, b) => a.title.localeCompare(b.title));
        visibleProjects.forEach(renderProjectItem);
        
        const selectedProject = visibleProjects.find(p => p.id === selectedProjectId);
        updateMyTasksLink(selectedProject || visibleProjects[0]);
    }
    
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
    
    async function selectProject(projectIdToSelect) {
        if (!currentUser || !activeWorkspaceId) return;
        
        try {
            const workspaceRef = doc(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}`);
            await updateDoc(workspaceRef, { selectedProjectId: projectIdToSelect });
        } catch (error) {
            console.error("Error setting selected project:", error);
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
            }
        }
    });
    
    onAuthStateChanged(auth, (user) => {
        console.log("DEBUG: Auth state changed. Cleaning up listeners.");
        if (unsubscribeUserDoc) unsubscribeUserDoc();
        if (unsubscribeProjects) unsubscribeProjects();
        if (unsubscribeWorkspace) unsubscribeWorkspace();
        
        activeWorkspaceId = null;
        selectedProjectId = null;
        projectsData = [];
        
        if (user) {
            currentUser = user;
            
            const userDocRef = doc(db, 'users', user.uid);
            unsubscribeUserDoc = onSnapshot(userDocRef, (userSnap) => {
                const newActiveWorkspaceId = userSnap.data()?.selectedWorkspace || null;
                
                if (newActiveWorkspaceId !== activeWorkspaceId) {
                    console.log(`DEBUG: Active workspace changed to: ${newActiveWorkspaceId}`);
                    activeWorkspaceId = newActiveWorkspaceId;
                    
                    if (unsubscribeWorkspace) unsubscribeWorkspace();
                    
                    if (activeWorkspaceId) {
                        const workspaceRef = doc(db, `users/${user.uid}/myworkspace/${activeWorkspaceId}`);
                        unsubscribeWorkspace = onSnapshot(workspaceRef, (workspaceSnap) => {
                            const newSelectedProjectId = workspaceSnap.data()?.selectedProjectId || null;
                            const isStillValid = newSelectedProjectId && projectsData.some(p => p.id === newSelectedProjectId);
                            
                            if (!isStillValid) {
                                console.log(`DEBUG: Selected project ${newSelectedProjectId} is null or invalid. Attempting to re-select.`);
                                const availableProjects = projectsData.filter(p => p.workspaceId === activeWorkspaceId);
                                if (availableProjects.length > 0) {
                                    const fallbackProjectId = availableProjects.sort((a, b) => a.title.localeCompare(b.title))[0].id;
                                    console.log(`DEBUG: Found fallback project: ${fallbackProjectId}. Selecting it now.`);
                                    selectProject(fallbackProjectId);
                                    return;
                                }
                            }
                            
                            if (newSelectedProjectId !== selectedProjectId) {
                                console.log(`DEBUG: Selected project changed to: ${newSelectedProjectId}`);
                                selectedProjectId = newSelectedProjectId;
                                renderProjectsList();
                            }
                        });
                    } else {
                        selectedProjectId = null;
                        renderProjectsList();
                    }
                }
            });
            
            const projectsQuery = query(
                collectionGroup(db, 'projects'),
                where('memberUIDs', 'array-contains', user.uid),
                orderBy("createdAt", "desc")
            );
            
            unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
                projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderProjectsList();
            });
            
        } else {
            currentUser = null;
            renderProjectsList();
        }
    });
    
    window.drawerLogicInitialized = true;
    console.log("Drawer Component Initialized with new data model.");
})();