/**
 * drawer.js
 * This script manages the navigation drawer, including the dynamic project list.
 */
(function initializeDrawer() {
    // Use a flag to prevent this script from running more than once
    if (window.drawerLogicInitialized) {
        return;
    }
    
    const sidebar = document.getElementById("dashboardDrawer");
    
    // If the drawer HTML isn't loaded yet, wait and try again.
    if (!sidebar) {
        setTimeout(initializeDrawer, 50);
        return;
    }
    
    // --- 1. DATA MODEL ---
    // This array is the single source of truth for the project list.
    const projectsData = [
        { id: 'project-1', name: 'Website Redesign', color: '#3498db' },
        { id: 'project-2', name: 'Mobile App', color: '#e74c3c' },
        { id: 'project-3', name: 'Marketing Campaign', color: '#2ecc71' }
    ];
    let activeProjectId = 'project-1'; // The ID of the currently selected project.
    
    
    // --- 2. RENDER FUNCTION ---
    /**
     * Clears and re-renders the project list in the sidebar based on the projectsData array.
     */
    function renderProjectsList() {
        const projectsListContainer = sidebar.querySelector('#projects-section .section-items');
        if (!projectsListContainer) return;
        
        projectsListContainer.innerHTML = ''; // Clear the old list
        
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
    
    
    // --- 3. CORE LOGIC FUNCTIONS ---
    /**
     * Prompts the user for a new project name and adds it to the data model.
     */
    function handleAddProject() {
        const newProjectName = prompt("Enter the name for the new project:");
        
        if (newProjectName && newProjectName.trim() !== '') {
            // Generate a random color for the new project
            const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
            
            const newProject = {
                id: `project-${Date.now()}`,
                name: newProjectName.trim(),
                color: randomColor
            };
            
            // Update the data model
            projectsData.push(newProject);
            activeProjectId = newProject.id; // Make the new project active
            
            // Update the UI
            renderProjectsList();
        }
    }
    
    /**
     * Manages the project dropdown menu.
     */
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
        dropdown.style.left = `${rect.right - dropdown.offsetWidth}px`;
    }
    
    
    // --- 4. EVENT LISTENERS (using Delegation) ---
    
    // Delegated listener for all clicks within the sidebar
    sidebar.addEventListener('click', (e) => {
        // Handle 'Add Project' button click
        if (e.target.closest('.add-project-btn')) {
            e.stopPropagation();
            toggleProjectDropdown(e.target.closest('.add-project-btn'));
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
    
    // Global listener for actions inside the dropdown and for closing it
    document.body.addEventListener('click', e => {
        const closeDropdown = () => document.querySelector('.drawerprojects-dropdown')?.remove();
        
        // Check if the "Add Project" action itself was clicked
        if (e.target.closest('#add-project-action')) {
            handleAddProject();
            closeDropdown();
            return;
        }
        
        // Close the dropdown if clicking anywhere else (that isn't the button)
        if (!e.target.closest('.drawerprojects-dropdown') && !e.target.closest('.add-project-btn')) {
            closeDropdown();
        }
    });
    
    
    // --- 5. INITIAL RENDER ---
    // Populate the project list for the first time when the script runs.
    renderProjectsList();
    
    window.drawerLogicInitialized = true;
    console.log("Drawer logic initialized with data model.");
})();