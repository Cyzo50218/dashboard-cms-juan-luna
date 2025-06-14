/**
 * drawer.js
 * This script contains all the logic for making the navigation drawer interactive.
 * It dynamically renders the project list from a data model and handles all user interactions.
 */
(function initializeDrawer() {
    // Use a flag to prevent this script from running more than once
    if (window.drawerLogicInitialized) {
        return;
    }
    
    const sidebar = document.getElementById("dashboardDrawer");
    
    // If the drawer isn't in the DOM yet, the loader will call this script again.
    // This check ensures we don't proceed without the necessary HTML.
    if (!sidebar) {
        return;
    }
    
    const header = document.getElementById("top-header");
    
    // --- 1. DATA MODEL ---
    // This array is the single source of truth for the project list.
    const projectsData = [
        { id: 'project-1', name: 'Website Redesign', color: '#3498db' },
        { id: 'project-2', name: 'Mobile App', color: '#e74c3c' },
        { id: 'project-3', name: 'Marketing Campaign', color: '#2ecc71' }
    ];
    let activeProjectId = 'project-1'; // The ID of the currently selected project.
    document.querySelectorAll('.nav-item a[href^="#"]').forEach(link => {
    const section = link.getAttribute('href').substring(1);
    link.setAttribute('data-section', section);
});

document.body.addEventListener('click', (e) => {
    const navLink = e.target.closest('a[data-section]');
    if (navLink) {
        e.preventDefault();
        const section = navLink.getAttribute('data-section');
        // Hardcoded URL for demonstration purposes
        const newUrl = (section === 'tasks') ?
            `/tasks/22887391981/list/22887391981` :
            `/${section}`;
        
        history.pushState({ path: newUrl }, '', newUrl);
        router(); // This is your router function defined elsewhere
    }
});
    
    // --- 2. RENDER FUNCTION ---
    /**
     * Clears and re-renders the project list in the sidebar based on the projectsData array.
     */
    function renderProjectsList() {
        const projectsListContainer = sidebar.querySelector('#projects-section .section-items');
        if (!projectsListContainer) return;
        
        projectsListContainer.innerHTML = ''; // Clear any static HTML
        
        projectsData.forEach(project => {
            const isActive = project.id === activeProjectId;
            const projectLi = document.createElement('li');
            projectLi.className = `nav-item project-item ${isActive ? 'active' : ''}`;
            projectLi.dataset.projectId = project.id; // Store ID for click events
            
            projectLi.innerHTML = `
        <a href="#${project.id}">
          <div class="project-color" style="background-color: ${project.color};"></div>
          <span>${project.name}</span>
        </a>`;
            projectsListContainer.appendChild(projectLi);
        });
    }
    
    
    // --- 3. CORE LOGIC & EVENT LISTENERS ---
    
    /** Prompts for and adds a new project to the data model, then re-renders. */
    function handleAddProject() {
        const newProjectName = prompt("Enter the name for the new project:");
        
        if (newProjectName && newProjectName.trim() !== '') {
            const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
            const newProject = {
                id: `project-${Date.now()}`,
                name: newProjectName.trim(),
                color: randomColor
            };
            projectsData.push(newProject);
            activeProjectId = newProject.id;
            renderProjectsList();
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
    
    // This is more reliable for right-alignment
    dropdown.style.left = 'auto';
    dropdown.style.right = `${window.innerWidth - rect.right}px`;
}
    
    // A single, delegated event listener for all clicks within the sidebar
    sidebar.addEventListener('click', (e) => {
        // Handle "Add Project" button click
        const addProjectBtn = e.target.closest('.add-project-btn');
        if (addProjectBtn) {
            e.stopPropagation();
            toggleProjectDropdown(addProjectBtn);
            return;
        }
        
        // Handle section header expand/collapse
        const sectionHeader = e.target.closest('.section-header');
        if (sectionHeader) {
            sectionHeader.closest('.nav-section')?.classList.toggle('open');
            return;
        }
        
        // Handle switching between projects
        const projectItem = e.target.closest('.project-item');
        if (projectItem) {
            const newActiveId = projectItem.dataset.projectId;
            if (activeProjectId !== newActiveId) {
                activeProjectId = newActiveId;
                renderProjectsList(); // Re-render to update the active state
            }
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
    
    
    // --- 4. INITIAL RENDER ---
    // Populate the project list for the first time when the script runs.
    renderProjectsList();
    
    window.drawerLogicInitialized = true;
    console.log("Drawer Component Initialized.");
})();