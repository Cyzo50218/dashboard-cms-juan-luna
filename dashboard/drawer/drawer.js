/**
 * drawer.js
 * This script contains all the logic for making the navigation drawer interactive.
 * It dynamically renders the project list from Firestore and handles all user interactions,

 * including URL updates and global state changes.
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

// Initialize Firebase
console.log("Initializing Firebase from drawer.js...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

(function initializeDrawer() {
    if (window.drawerLogicInitialized) {
        return;
    }
    
    const sidebar = document.getElementById("dashboardDrawer");
    if (!sidebar) {
        return;
    }
    
    const header = document.getElementById("top-header");
    
    // --- 1. DATA MODEL & STATE ---
    let projectsData = []; // This will be populated from Firestore
    let activeProjectId = null;
    let currentUser = null;
    let unsubscribeProjects = null; // To hold the listener cleanup function
    
    // --- 2. HELPER FUNCTIONS ---
    
    /**
     * A simple, non-reversible function to convert an alphanumeric string (like a UID or Doc ID)
     * into a string containing only numbers by concatenating character codes.
     * @param {string} str The string to convert.
     * @returns {string} A string of numeric digits.
     */
    function stringToNumericString(str) {
        if (!str) return '';
        return str.split('').map(char => char.charCodeAt(0)).join('');
    }
    
    
    // --- 3. RENDER FUNCTION ---
    
    /**
     * Clears and re-renders the project list in the sidebar based on the projectsData array.
     */
    // In drawer.js

function renderProjectsList() {
    const projectsListContainer = sidebar.querySelector('#projects-section .section-items');
    if (!projectsListContainer) return;
    
    projectsListContainer.innerHTML = '';
    
    if (projectsData.length === 0) {
        projectsListContainer.innerHTML = `<li class="nav-item-empty">No projects yet.</li>`;
    }
    
    projectsData.forEach(project => {
        const isActive = project.id === activeProjectId;
        const projectLi = document.createElement('li');
        projectLi.className = `nav-item project-item ${isActive ? 'active' : ''}`;
        projectLi.dataset.projectId = project.id;
        
        projectLi.innerHTML = `
            <a href="#">
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
    // In drawer.js

async function handleAddProject() {
    if (!currentUser) {
        alert("Please log in to add a project.");
        return;
    }
    const newProjectName = prompt("Enter the name for the new project:");
    
    if (newProjectName && newProjectName.trim() !== '') {
        const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        const projectsColRef = collection(db, `users/${currentUser.uid}/projects`);
        try {
            await addDoc(projectsColRef, {
                // FIXED: Changed 'name' to 'title' to be consistent with home.js
                title: newProjectName.trim(),
                color: randomColor,
                createdAt: new Date()
            });
        } catch (error) {
            console.error("Error adding project: ", error);
            alert("Failed to add project.");
        }
    }
}
    
    /** Manages the project dropdown menu. */
    function toggleProjectDropdown(buttonElement) {
        const closeDropdown = () => document.querySelector('.drawerprojects-dropdown')?.remove();
        
        if (document.querySelector('.drawerprojects-dropdown')) {
            closeDropdown();
            return;
        }
        const dropdown = document.createElement('div');
        dropdown.className = 'drawerprojects-dropdown';
        dropdown.innerHTML = `<ul><li id="add-project-action"><i class="fas fa-plus"></i><span>Add Project</span></li></ul>`;
        document.body.appendChild(dropdown);
        
        const rect = buttonElement.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 5}px`;
        dropdown.style.left = 'auto';
        dropdown.style.right = `${window.innerWidth - rect.right}px`;
    }
    
    /** Sets the new active project, updates the URL, and notifies the app. */
    function setActiveProject(newProjectId) {
        if (activeProjectId === newProjectId || !currentUser) return;
        
        activeProjectId = newProjectId;
        renderProjectsList(); // Re-render to update the active highlight in the drawer
        
        // Convert IDs to numeric strings for the URL
        const numericUserId = stringToNumericString(currentUser.uid);
        const numericProjectId = stringToNumericString(newProjectId);
        
        // Construct the new URL and update the browser history
        const newUrl = `/tasks/${numericUserId}/list/${numericProjectId}`;
        history.pushState({ path: newUrl, projectId: newProjectId }, '', newUrl);
        
        // Dispatch a global event to let other parts of the app know the project changed
        document.dispatchEvent(new CustomEvent('project-changed', {
            detail: { projectId: newProjectId }
        }));
        
        // Optional: if you have a central router, call it.
        // if (typeof router === 'function') router();
    }
    
    
    // A single, delegated event listener for all clicks within the sidebar
    sidebar.addEventListener('click', (e) => {
        const addProjectBtn = e.target.closest('.add-project-btn');
        if (addProjectBtn) {
            e.stopPropagation();
            toggleProjectDropdown(addProjectBtn);
            return;
        }
        
        const sectionHeader = e.target.closest('.section-header');
        if (sectionHeader) {
            sectionHeader.closest('.nav-section')?.classList.toggle('open');
            return;
        }
        
        // Handle switching between projects
        const projectItem = e.target.closest('.project-item');
        if (projectItem) {
            e.preventDefault(); // Prevent default link behavior
            const newActiveId = projectItem.dataset.projectId;
            setActiveProject(newActiveId);
            return;
        }
    });
    
    // Listener for the header (e.g., menu toggle)
    if (header) {
        header.addEventListener('click', e => {
            if (e.target.closest('#menuToggle')) {
                sidebar.classList.toggle('close');
            }
        });
    }
    
    // Global listener for dropdown actions and closing
    document.body.addEventListener('click', e => {
        const closeDropdown = () => document.querySelector('.drawerprojects-dropdown')?.remove();
        if (e.target.closest('#add-project-action')) {
            handleAddProject();
            closeDropdown();
            return;
        }
        if (!e.target.closest('.drawerprojects-dropdown') && !e.target.closest('.add-project-btn')) {
            closeDropdown();
        }
    });
    
    
    // --- 5. FIREBASE AUTH & DATA INITIALIZATION ---
    onAuthStateChanged(auth, (user) => {
        // Clean up previous user's data listener if it exists
        if (unsubscribeProjects) {
            unsubscribeProjects();
        }
        
        if (user) {
            // User is signed in
            currentUser = user;
            const projectsQuery = query(collection(db, `users/${user.uid}/projects`), orderBy("createdAt", "desc"));
            
            // Set up the real-time listener for projects
            unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
                projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // If there's no active project, or the active one was deleted, select the first one.
                if (!activeProjectId || !projectsData.some(p => p.id === activeProjectId)) {
                    const firstProjectId = projectsData[0]?.id || null;
                    // Set the first project as active without changing the URL on initial load
                    activeProjectId = firstProjectId;
                }
                renderProjectsList();
            }, (error) => {
                console.error("Error fetching projects:", error);
                projectsData = [];
                renderProjectsList();
            });
            
        } else {
            // User is signed out
            currentUser = null;
            projectsData = [];
            activeProjectId = null;
            renderProjectsList(); // Clear the list
        }
    });
    
    
    window.drawerLogicInitialized = true;
    console.log("Drawer Component Initialized.");
})();