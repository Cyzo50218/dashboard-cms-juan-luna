/**
 * drawer.js
 * * This script contains all the logic for making the navigation drawer interactive.
 * It uses a self-executing function to avoid polluting the global scope and attaches
 * event listeners using a robust event delegation pattern.
 */
(function initializeDrawer() {
    // Use a flag to prevent this script from running more than once
    if (window.drawerLogicInitialized) {
        return;
    }
    
    const sidebar = document.getElementById("dashboardDrawer");
    
    // If the drawer HTML hasn't been loaded yet, wait and try again.
    if (!sidebar) {
        setTimeout(initializeDrawer, 50); // Retry in 50ms
        return;
    }
    
    const header = document.getElementById("top-header");
    
    // --- Main Menu Toggle (Hamburger) ---
    if (header) {
        // Attach a delegated listener to the header container
        header.addEventListener('click', e => {
            if (e.target.closest('#menuToggle')) {
                sidebar.classList.toggle('close');
            }
        });
    }
    
    // --- Delegated Event Listener for all clicks inside the Sidebar ---
    sidebar.addEventListener('click', (e) => {
        // Action 1: Handle "Add Project" button click
        const addProjectBtn = e.target.closest('.add-project-btn');
        if (addProjectBtn) {
            e.stopPropagation();
            toggleProjectDropdown(addProjectBtn);
            return;
        }
        
        // Action 2: Handle Section Header click (expand/collapse)
        const sectionHeader = e.target.closest('.section-header');
        if (sectionHeader) {
            sectionHeader.closest('.nav-section')?.classList.toggle('open');
            return;
        }
        
        // Action 3: Handle Project Item click (selection)
        const projectItem = e.target.closest('.project-item');
        if (projectItem) {
            const projectsList = projectItem.closest('.section-items');
            if (projectsList && !projectItem.classList.contains('active')) {
                projectsList.querySelector('.project-item.active')?.classList.remove('active');
                projectItem.classList.add('active');
            }
            return;
        }
    });
    
    // --- Global listener for the dropdown ---
    const closeDropdown = () => document.querySelector('.drawerprojects-dropdown')?.remove();
    
    document.body.addEventListener('click', e => {
        if (e.target.closest('#add-project-action')) {
            alert('Triggering "Add Project" action...');
            closeDropdown();
            return;
        }
        if (!e.target.closest('.drawerprojects-dropdown') && !e.target.closest('.add-project-btn')) {
            closeDropdown();
        }
    });
    
    /** Helper function to manage the project dropdown */
    function toggleProjectDropdown(buttonElement) {
        if (document.querySelector('.drawerprojects-dropdown')) {
            closeDropdown();
            return;
        }
        const dropdown = document.createElement('div');
        dropdown.className = 'drawerprojects-dropdown';
        dropdown.innerHTML = `
      <ul>
        <li id="add-project-action">
          <i class="fas fa-plus"></i>
          <span>Add Project</span>
        </li>
      </ul>`;
        document.body.appendChild(dropdown);
        const rect = buttonElement.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 5}px`;
        dropdown.style.left = `${rect.right - dropdown.offsetWidth}px`;
    }
    
    // Mark this logic as initialized
    window.drawerLogicInitialized = true;
    console.log("Drawer logic initialized.");
})();