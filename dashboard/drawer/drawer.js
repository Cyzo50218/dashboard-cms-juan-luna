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
    where,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    doc,
    writeBatch,
    runTransaction,
    serverTimestamp
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
        }

        projectsData.forEach(project => {
            const isActive = project.isSelected === true; // Highlight is now data-driven
            const projectLi = document.createElement('li');
            projectLi.className = `nav-item project-item ${isActive ? 'active' : ''}`;
            projectLi.dataset.projectId = project.id;
            const numericUserId = stringToNumericString(currentUser?.uid);
            const numericProjectId = stringToNumericString(project.id);
            const href = `/tasks/${numericUserId}/list/${numericProjectId}`;
            projectLi.innerHTML = `<a href="${href}" data-link><div class="project-color" style="background-color: ${project.color};"></div><span>${project.title}</span></a>`;
            projectsListContainer.appendChild(projectLi);
        });
        
        const myTasksLink = sidebar.querySelector('#my-tasks-link');
        if (myTasksLink) {
            const selectedProject = projectsData.find(p => p.isSelected === true);
            const firstProjectId = projectsData[0]?.id;
            const targetProjectId = selectedProject ? selectedProject.id : firstProjectId;
            if (targetProjectId) {
                const numericUserId = stringToNumericString(currentUser?.uid);
                const numericProjectId = stringToNumericString(targetProjectId);
                myTasksLink.href = `/tasks/${currentUser?.uid}/list/${targetProjectId}`;
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

        const projectsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects`);
        try {
            await runTransaction(db, async (transaction) => {
                // Find the currently selected project from our local data
                const currentlySelected = projectsData.find(p => p.isSelected === true);
                // If one exists, deselect it
                if (currentlySelected) {
                    const oldProjectRef = doc(projectsColRef, currentlySelected.id);
                    transaction.update(oldProjectRef, { isSelected: false });
                }
                
                // Create the new project and mark it as selected
                const newProjectRef = doc(projectsColRef);
                transaction.set(newProjectRef, {
                    title: newProjectName.trim(),
                    color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                    createdAt: serverTimestamp(),
                    isSelected: true // The new project is now active
                });
            });
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

        // Handle selecting a project
        const projectLink = e.target.closest('.project-item a');
        if (projectLink) {
            e.preventDefault(); // Stop navigation until DB is updated
            const projectItem = projectLink.closest('.project-item');
            const projectId = projectItem.dataset.projectId;

            if (!projectId || projectItem.classList.contains('active')) return;

            try {
                const batch = writeBatch(db);
                const projectsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects`);

                // Deselect the currently active project
                const currentlySelected = projectsData.find(p => p.isSelected === true);
                if (currentlySelected) {
                    const oldProjectRef = doc(projectsColRef, currentlySelected.id);
                    batch.update(oldProjectRef, { isSelected: false });
                }

                // Select the clicked project
                const newProjectRef = doc(projectsColRef, projectId);
                batch.update(newProjectRef, { isSelected: true });
                
                await batch.commit();
                
            } catch (error) {
                console.error("Error selecting project:", error);
            }
        }
    });

    document.body.addEventListener('click', e => {
        if (e.target.closest('#add-project-action')) {
            handleAddProject();
            document.querySelector('.drawerprojects-dropdown')?.remove();
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
                        projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
    
    window.addEventListener('popstate', renderProjectsList);
    
    window.drawerLogicInitialized = true;
    console.log("Drawer Component Initialized.");
})();