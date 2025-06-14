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
    orderBy
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
    
    function getActiveProjectIdFromURL() {
        const pathParts = window.location.pathname.split('/');
        if (pathParts[1] === 'tasks' && pathParts[3] === 'list' && pathParts[4]) {
            return pathParts[4];
        }
        return null;
    }
    
    function renderProjectsList() {
        const projectsListContainer = sidebar.querySelector('#projects-section .section-items');
        if (!projectsListContainer) return;
        
        projectsListContainer.innerHTML = '';
        if (projectsData.length === 0) {
            projectsListContainer.innerHTML = `<li class="nav-item-empty">No projects yet.</li>`;
        }
        
        const activeNumericId = getActiveProjectIdFromURL();
        
        // Dynamically create the project links
        projectsData.forEach(project => {
            const numericProjectId = stringToNumericString(project.id);
            const isActive = numericProjectId === activeNumericId;
            const projectLi = document.createElement('li');
            projectLi.className = `nav-item project-item ${isActive ? 'active' : ''}`;
            projectLi.dataset.projectId = project.id;
            const numericUserId = stringToNumericString(currentUser?.uid);
            const href = `/tasks/${numericUserId}/list/${numericProjectId}`;
            projectLi.innerHTML = `<a href="${href}" data-link><div class="project-color" style="background-color: ${project.color};"></div><span>${project.title}</span></a>`;
            projectsListContainer.appendChild(projectLi);
        });
        
        // --- NEW LOGIC ---
        // Find the static "My Tasks" link and update its href dynamically
        const myTasksLink = sidebar.querySelector('#my-tasks-link');
        if (myTasksLink) {
            const firstProjectId = projectsData[0]?.id;
            if (firstProjectId) {
                const numericUserId = stringToNumericString(currentUser?.uid);
                const numericProjectId = stringToNumericString(firstProjectId);
                myTasksLink.href = `/tasks/${numericUserId}/list/${numericProjectId}`;
            } else {
                // If there are no projects, make the link inactive
                myTasksLink.href = '#';
                myTasksLink.removeAttribute('data-link');
            }
        }
    }

// --- Function to Add a Project (Corrected Path) ---
async function handleAddProject() {
    if (!currentUser) return alert("Please log in to add a project.");
    // New check: Ensure a workspace is selected before adding a project
    if (!activeWorkspaceId) {
        return alert("Cannot add project: No workspace is selected.");
    }
    const newProjectName = prompt("Enter the name for the new project:");
    if (newProjectName && newProjectName.trim() !== '') {
        const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        // Corrected Path: Now points to the subcollection within the active workspace
        const projectsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects`);
        try {
            await addDoc(projectsColRef, {
                title: newProjectName.trim(),
                color: randomColor,
                createdAt: new Date()
            });
        } catch (error) {
            console.error("Error adding project: ", error);
        }
    }
}

// This listener is now only for UI elements specific to the drawer itself
sidebar.addEventListener('click', (e) => {
    const sectionHeader = e.target.closest('.section-header');
    if (sectionHeader) {
        sectionHeader.closest('.nav-section')?.classList.toggle('open');
    }
});

document.body.addEventListener('click', e => {
    if (e.target.closest('#add-project-action')) {
        handleAddProject();
        document.querySelector('.drawerprojects-dropdown')?.remove();
    }
});

// --- Auth State Change Listener (Corrected Logic) ---
onAuthStateChanged(auth, (user) => {
    // Detach all previous listeners on auth change
    if (unsubscribeWorkspace) unsubscribeWorkspace();
    if (unsubscribeProjects) unsubscribeProjects();

    if (user) {
        currentUser = user;
        // 1. First, find the selected workspace
        const workspaceQuery = query(collection(db, `users/${user.uid}/myworkspace`), where("isSelected", "==", true));

        unsubscribeWorkspace = onSnapshot(workspaceQuery, (workspaceSnapshot) => {
            // When workspace changes, detach the old projects listener
            if (unsubscribeProjects) unsubscribeProjects();

            if (!workspaceSnapshot.empty) {
                // Get the single selected workspace document
                const workspaceDoc = workspaceSnapshot.docs[0];
                activeWorkspaceId = workspaceDoc.id; // <-- Store the active workspace ID

                // 2. Then, get projects from *that* workspace's subcollection
                const projectsQuery = query(collection(db, `users/${user.uid}/myworkspace/${activeWorkspaceId}/projects`), orderBy("createdAt", "desc"));

                unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
                    projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    renderProjectsList(); // Assumes this function updates your UI
                }, (error) => {
                    console.error("Error fetching projects:", error);
                    projectsData = [];
                    renderProjectsList();
                });

            } else {
                // Handle case where no workspace is selected
                console.warn("No workspace selected for this user.");
                activeWorkspaceId = null;
                projectsData = [];
                renderProjectsList();
            }
        });
    } else {
        // User is logged out, clear all state
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