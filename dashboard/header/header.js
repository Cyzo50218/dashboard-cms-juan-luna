/**
 * header.js
 *
 * Manages all interactive elements within the main application header. This includes
 * the primary search bar, the advanced search filter pop-up, and the profile/create menus.
 * This refactored version uses a state-driven approach for UI updates and imports
 * a separate module to handle email/person selection, ensuring clean and maintainable code.
 *
 * @version 2.0.0
 * @date 2025-06-14
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// Imports the new modal function from its own dedicated file.
import { openEmailSelector } from '/dashboard/components/showEmailModel.js';
import { firebaseConfig } from "/services/firebase-config.js";

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- DOM ELEMENT CACHE ---
// Caching elements that are frequently accessed improves performance.
const elements = {
  // Toggles & Expandable Menus
  menuToggle: document.getElementById("menuToggle"),
  drawer: document.getElementById("dashboardDrawer"),
  createToggle: document.getElementById("createToggle"),
  createExpand: document.querySelector(".create-expand"),
  searchToggle: document.getElementById("searchToggle"),
  searchExpand: document.querySelector(".search-expand"),
  profileToggle: document.getElementById("profileToggle"),
  profileExpand: document.querySelector(".account-expand"),
  
  // Main Search/Filter UI
  mainSearchInput: document.querySelector('.search-expand .search-input'),
  cancelSearchIcon: document.querySelector('.search-expand .cancel-search-icon'),
  optionBtns: document.querySelectorAll(".option-btn"),
  savedSearchesContainer: document.querySelector('.saved-searches'),
  
  // Advanced Filter Menu
  searchFilter: {
    container: document.getElementById("search-filter"),
    toggle: document.getElementById("filter-icon"),
    typeDropdownBtn: document.getElementById("typeDropdown"),
    // Add other filter-specific elements here
  },
  
  // Email/Person Selectors
  emailContainerPeople: document.getElementById('email-container-id-people'),
  emailContainerGeneric: document.getElementById('email-container-id'),
};


// --- STATE MANAGEMENT ---
// This could be expanded to a more robust state object if needed.
let currentSearchContext = 'tasks';


// --- REFACTORED UI LOGIC ---

/**
 * A configuration object to define which filter fields are visible
 * for each search type. This replaces the large if/else block for better readability
 * and easier maintenance.
 */
const searchFilterConfig = {
  'Any': {
    visible: ['locatedGlobal', 'collaborators', 'assigned-to'],
    hidden: ['locatedProjectDropdown', 'status-field', 'due-date-field', 'owners', 'members', 'authors', 'status-project-field']
  },
  'Tasks': {
    visible: ['locatedGlobal', 'collaborators', 'assigned-to', 'status-field', 'due-date-field'],
    hidden: ['locatedProjectDropdown', 'owners', 'members', 'authors', 'status-project-field']
  },
  'Projects': {
    visible: ['locatedProjectDropdown', 'owners', 'members', 'status-project-field'],
    hidden: ['locatedGlobal', 'collaborators', 'assigned-to', 'status-field', 'due-date-field', 'authors']
  },
  'Messages': {
    visible: ['locatedGlobal', 'authors', 'collaborators'],
    hidden: ['locatedProjectDropdown', 'owners', 'members', 'assigned-to', 'status-field', 'due-date-field', 'status-project-field']
  },
  'Portfolio': {
    visible: ['locatedGlobal', 'owners', 'members'],
    hidden: ['locatedProjectDropdown', 'collaborators', 'assigned-to', 'status-field', 'due-date-field', 'authors', 'status-project-field']
  }
};

/**
 * Updates the visibility of filter fields based on the selected type from the dropdown.
 * @param {string} type - The selected search type (e.g., 'Tasks', 'Projects').
 */
function updateFilterUI(type) {
  // Default to the 'Any' configuration if the type is unknown
  const config = searchFilterConfig[type] || searchFilterConfig['Any'];
  
  config.visible.forEach(id => document.getElementById(id)?.classList.remove('hidden'));
  config.hidden.forEach(id => document.getElementById(id)?.classList.add('hidden'));
}


/**
 * Handles clicks on the main option buttons (Tasks, Projects, People, Messages).
 * @param {Event} e - The click event object.
 */
function handleOptionButtonClick(e) {
  const targetBtn = e.target.closest('.option-btn');
  if (!targetBtn) return;
  
  const selectedIndex = [...elements.optionBtns].indexOf(targetBtn);
  const isCurrentlySelected = targetBtn.classList.contains('selected');
  
  // Deselect all buttons first
  elements.optionBtns.forEach(btn => btn.classList.remove('selected', 'hide'));
  
  // If the clicked button was not already selected, select it and hide the others.
  if (!isCurrentlySelected) {
    targetBtn.classList.add('selected');
    elements.optionBtns.forEach((otherBtn, otherIndex) => {
      if (otherIndex !== selectedIndex) {
        otherBtn.classList.add('hide');
      }
    });
  }
  
  // Update visibility of main containers based on whether any button is selected
  const anySelected = document.querySelector('.option-btn.selected');
  elements.savedSearchesContainer?.classList.toggle('hidden', !!anySelected);
  
  // Add logic here to show/hide specific displays like mytaskdisplay, projectdisplay etc.
  document.getElementById('mytask-display')?.classList.toggle('hidden', targetBtn.textContent.trim() !== 'Tasks' || !anySelected);
  document.getElementById('project-display')?.classList.toggle('hidden', targetBtn.textContent.trim() !== 'Projects' || !anySelected);
}


// --- EVENT LISTENERS ---

// A single delegated listener for the main option buttons for efficiency
document.querySelector('.recent-searches-query')?.addEventListener('click', handleOptionButtonClick);


// Listener for the filter type dropdown inside the advanced search
elements.searchFilter.container?.addEventListener('click', e => {
  const targetItem = e.target.closest('.dropdown-menu .dropdown-item');
  if (targetItem) {
    const selectedType = targetItem.textContent.trim();
    if (elements.searchFilter.typeDropdownBtn) {
      elements.searchFilter.typeDropdownBtn.textContent = selectedType;
    }
    updateFilterUI(selectedType);
  }
});


// Event handlers for showing the email modal. They are now async.
elements.emailContainerPeople?.addEventListener('click', async () => {
  const person = await openEmailSelector(app);
  if (person) {
    console.log("Selected person:", person);
    // Update your UI here, e.g., setting an input's value
    elements.mainSearchInput.value = `people: ${person.name}`;
  }
});

elements.emailContainerGeneric?.addEventListener('click', async () => {
  const person = await openEmailSelector(app);
  if (person) {
    console.log("Selected person:", person);
    elements.mainSearchInput.value = `with: ${person.name}`;
  }
});


// Listeners for toggleable menus (Create, Search, Profile, Drawer)
elements.createToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  elements.createExpand?.classList.add("show");
});

elements.profileToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  elements.profileExpand?.classList.add("show");
});

elements.searchToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  elements.searchExpand?.classList.remove("hidden");
  elements.searchToggle?.classList.add("hidden");
  elements.mainSearchInput?.focus();
});

elements.menuToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  elements.drawer?.classList.toggle("close");
});


// Global click listener to close pop-ups when clicking outside
document.addEventListener("click", (e) => {
  // Close Create menu
  if (!elements.createExpand?.contains(e.target) && !elements.createToggle?.contains(e.target)) {
    elements.createExpand?.classList.remove("show");
  }
  // Close Profile menu
  if (!elements.profileExpand?.contains(e.target) && !elements.profileToggle?.contains(e.target)) {
    elements.profileExpand?.classList.remove("show");
  }
  // Close Search bar
  if (!elements.searchExpand?.contains(e.target) && !elements.searchToggle?.contains(e.target)) {
    elements.searchExpand?.classList.add("hidden");
    elements.searchToggle?.classList.remove("hidden");
  }
  // Close Advanced Filter menu
  if (!elements.searchFilter.container?.contains(e.target) && !elements.searchFilter.toggle?.contains(e.target)) {
    elements.searchFilter.container?.classList.add('hidden');
  }
});

// Listener for advanced filter toggle
elements.searchFilter.toggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  elements.searchFilter.container?.classList.toggle('hidden');
});

// Listener for main search input clear icon
elements.cancelSearchIcon?.addEventListener('click', () => {
  if (elements.mainSearchInput) {
    elements.mainSearchInput.value = '';
    elements.mainSearchInput.focus();
  }
});

// --- SCRIPT INITIALIZATION ---
// Set the initial state of the filter UI when the script loads
updateFilterUI('Any');
console.log("Refactored header script initialized.");


