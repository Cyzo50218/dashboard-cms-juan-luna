/**
 * drawer.js
 * This script is a self-contained module for the navigation drawer.
 * Its sole responsibility is to fetch and display the user's project list from Firestore,
 * creating navigation links that the main application router can handle.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

(function initializeDrawer() {
    // Use a flag to prevent this script from running more than once
    if (window.drawerLogicInitialized) {
        return;
    }
    
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app, "juanluna-cms-01");
    
    const sidebar = document.getElementById("dashboardDrawer");
    if (!sidebar) {
        return;
    }
    
    // --- 1. DATA MODEL & STATE ---
    let projectsData = []; // This will be populated from Firestore
    let currentUser = null;
    let unsubscribeProjects = null; // To hold the listener cleanup function
    
    // --- 2. HELPER FUNCTIONS ---
    
    /**
     * Converts an alphanumeric string into a string containing only numbers.
     * @param {string} str The string to convert.
     * @returns {string} A string of numeric digits.
     */
    function stringToNumericString(str) {
        if (!str) return '';
        return str.split('').map(char => char.charCodeAt(0)).join('');
    }
    
    /**
     * Gets the active project ID from the current browser URL.
     * @returns {string|null} The numeric project ID from the URL, or null if not present.
     */
    function getActiveProjectIdFromURL() {
        const pathParts = window.location.pathname.split('/');
        // Expects URL format: /tasks/{accountId}/list/{projectId}
        if (pathParts[1] === 'tasks' && pathParts[3] === 'list' && pathParts[4]) {
            return pathParts[4];
        }
        return null;
    }
    
    // --- 3. RENDER FUNCTION ---
    
    /**
     * Clears and re-renders the project list in the sidebar based on the projectsData array.
     */
    function renderProjectsList() {
        const projectsListContainer = sidebar.querySelector('#projects-section .section-items');
        if (!projectsListContainer) return;
        
        projectsListContainer.innerHTML = '';
        
        if (projectsData.length === 0) {
            projectsListContainer.innerHTML = `<li class="nav-item-empty">No projects yet.</li>`;
        }
        
        const activeNumericId = getActiveProjectIdFromURL();
        
        projectsData.forEach(project => {
            const numericProjectId = stringToNumericString(project.id);
            const isActive = numericProjectId === activeNumericId;
            const projectLi = document.createElement('li');
            projectLi.className = `nav-item project-item ${isActive ? 'active' : ''}`;
            projectLi.dataset.projectId = project.id;
            
            // Generate the correct URL for the main router
            const numericUserId = stringToNumericString(currentUser?.uid);
            const href = `/tasks/${numericUserId}/list/${numericProjectId}`;
            
            projectLi.innerHTML = `
                <a href="${href}" data-link>
                    <div class="project-color" style="background-color: ${project.color};"></div>
                    <span>${project.title}</span>
                </a>`;
            projectsListContainer.appendChild(projectLi);
        });
    }
    
    
    // --- 4. CORE LOGIC & EVENT LISTENERS ---
    
    /**
     * Creates a new project document in Firestore.
     */
    async function handleAddProject() {
        if (!currentUser) return alert("Please log in to add a project.");
        
        const newProjectName = prompt("Enter the name for the new project:");
        if (newProjectName && newProjectName.trim() !== '') {
            const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
            const projectsColRef = collection(db, `users/${currentUser.uid}/projects`);
            try {
                await addDoc(projectsColRef, {
                    title: newProjectName.trim(), // Use 'title' to be consistent
                    color: randomColor,
                    createdAt: new Date()
                });
            } catch (error) {
                console.error("Error adding project: ", error);
            }
        }
    }
    
    // A delegated event listener for clicks within the sidebar
    sidebar.addEventListener('click', (e) => {
        // The main router now handles project link clicks via `data-link`.
        // This listener is now only for UI elements specific to the drawer itself.
        const sectionHeader = e.target.closest('.section-header');
        if (sectionHeader) {
            sectionHeader.closest('.nav-section')?.classList.toggle('open');
        }
    });
    
    // Global listener specifically for the "Add Project" action in the dropdown
    document.body.addEventListener('click', e => {
        if (e.target.closest('#add-project-action')) {
            handleAddProject();
            document.querySelector('.drawerprojects-dropdown')?.remove();
        }
    });
    
    
    // --- 5. FIREBASE AUTH & DATA INITIALIZATION ---
    onAuthStateChanged(auth, (user) => {
        if (unsubscribeProjects) {
            unsubscribeProjects();
        }
        
        if (user) {
            currentUser = user;
            const projectsQuery = query(collection(db, `users/${user.uid}/projects`), orderBy("createdAt", "desc"));
            
            unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
                projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderProjectsList(); // Re-render the list with fresh data
            }, (error) => {
                console.error("Error fetching projects:", error);
                projectsData = [];
                renderProjectsList();
            });
            
        } else {
            currentUser = null;
            projectsData = [];
            renderProjectsList(); // Clear the list on logout
        }
    });
    
    // Listen for main router changes to re-render the active state
    window.addEventListener('popstate', renderProjectsList);
    // Also listen for the custom event from the old setActiveProject (if it still exists elsewhere)
    // to keep the drawer's active state in sync.
    document.addEventListener('project-changed', renderProjectsList);
    
    
    window.drawerLogicInitialized = true;
    console.log("Drawer Component Initialized.");
})();