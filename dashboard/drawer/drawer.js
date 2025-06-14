/**
 * drawer.js
 * This script is a self-contained module for the navigation drawer.
 * It dynamically renders the project list and correctly builds navigation links
 * for the main SPA router to handle.
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
    serverTimestamp, // <-- ADDED for reliable timestamps
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
    let currentUser = null;
    let unsubscribeProjects = null;
    let activeWorkspaceId = null;
    let unsubscribeWorkspace = null;

    function stringToNumericString(str) {
        if (!str) return '';
        return str.split('').map(char => char.charCodeAt(0)).join('');
    }

    /**
     * Renders the list of projects in the drawer.
     * The 'active' highlight is now driven by the `isSelected` field from Firestore.
     */
    function renderProjectsList() {
        const projectsListContainer = sidebar.querySelector('#projects-section .section-items');
        if (!projectsListContainer) return;

        projectsListContainer.innerHTML = '';
        if (projectsData.length === 0) {
            projectsListContainer.innerHTML = `<li class="nav-item-empty">No projects yet.</li>`;
        }

        // Dynamically create the project links
        projectsData.forEach(project => {
            // The 'active' class is now based on the database field, not the URL.
            const isActive = project.isSelected === true;

            const projectLi = document.createElement('li');
            projectLi.className = `nav-item project-item ${isActive ? 'active' : ''}`;
            projectLi.dataset.projectId = project.id; // Keep the real ID for database operations

            const numericUserId = stringToNumericString(currentUser?.uid);
            const numericProjectId = stringToNumericString(project.id);
            const href = `/tasks/${numericUserId}/list/${numericProjectId}`;

            projectLi.innerHTML = `<a href="${href}" data-link><div class="project-color" style="background-color: ${project.color};"></div><span>${project.title}</span></a>`;
            projectsListContainer.appendChild(projectLi);
        });

        // --- IMPROVED LOGIC FOR "MY TASKS" ---
        // This link now points to the currently selected project for better context.
        const myTasksLink = sidebar.querySelector('#my-tasks-link');
        if (myTasksLink) {
            const selectedProject = projectsData.find(p => p.isSelected === true);
            const firstProjectId = projectsData[0]?.id; // Fallback to the first project
            const targetProjectId = selectedProject ? selectedProject.id : firstProjectId;

            if (targetProjectId) {
                const numericUserId = stringToNumericString(currentUser?.uid);
                const numericProjectId = stringToNumericString(targetProjectId);
                myTasksLink.href = `/tasks/${numericUserId}/list/${numericProjectId}`;
                myTasksLink.setAttribute('data-link', ''); // Ensure it's treated as a router link
            } else {
                myTasksLink.href = '#';
                myTasksLink.removeAttribute('data-link');
            }
        }
    }

    /**
     * Creates a new project in the currently active workspace.
     */
    async function handleAddProject() {
        if (!currentUser || !activeWorkspaceId) {
            return alert("Cannot add project: No user or workspace selected.");
        }
        const newProjectName = prompt("Enter the name for the new project:");
        if (newProjectName && newProjectName.trim() !== '') {
            const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
            const projectsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects`);
            try {
                await addDoc(projectsColRef, {
                    title: newProjectName.trim(),
                    color: randomColor,
                    createdAt: serverTimestamp(), // Use reliable server timestamp
                    isSelected: false // New projects are not selected by default
                });
            } catch (error) {
                console.error("Error adding project: ", error);
            }
        }
    }

    /**
     * Main event listener for the entire drawer, handling section toggles and project selection.
     */
    sidebar.addEventListener('click', async (e) => {
        // 1. Handle section toggling
        const sectionHeader = e.target.closest('.section-header');
        if (sectionHeader) {
            sectionHeader.closest('.nav-section')?.classList.toggle('open');
            return; // Stop processing to avoid other actions
        }

        // 2. Handle project selection
        const projectLink = e.target.closest('.project-item a');
        if (projectLink) {
            e.preventDefault(); // Stop the browser from navigating immediately

            const projectItem = projectLink.closest('.project-item');
            const projectId = projectItem.dataset.projectId;

            // If project is already active or something is wrong, do nothing.
            if (!projectId || projectItem.classList.contains('active')) {
                return;
            }

            try {
                // Use a batch to update multiple documents at once
                const batch = writeBatch(db);

                // Deselect any currently selected project
                projectsData.forEach(p => {
                    if (p.isSelected) {
                        const oldSelectedRef = doc(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects`, p.id);
                        batch.update(oldSelectedRef, { isSelected: false });
                    }
                });

                // Select the new project
                const newSelectedRef = doc(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects`, projectId);
                batch.update(newSelectedRef, { isSelected: true });

                // Commit all changes to the database
                await batch.commit();

                // Navigate only after the database update is successful
                window.location.href = projectLink.href;

            } catch (error) {
                console.error("Error updating project selection:", error);
                alert("Failed to select the project.");
            }
        }
    });

    document.body.addEventListener('click', e => {
        if (e.target.closest('#add-project-action')) {
            handleAddProject();
            document.querySelector('.drawerprojects-dropdown')?.remove();
        }
    });

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

    // Listen for main router popstate changes to re-render the active highlight
    window.addEventListener('popstate', renderProjectsList);

    window.drawerLogicInitialized = true;
    console.log("Drawer Component Initialized.");
})();