/*
 * @file list.js
 * @description Controls the List View tab with refined section filtering and date sorting.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    collection,
    query,
    where,
    onSnapshot,
    collectionGroup,
    orderBy,
    addDoc,
    updateDoc,
    setDoc,
    deleteDoc,
    writeBatch,
    serverTimestamp,
    deleteField,
    arrayUnion,
    getDocs,
    getDoc,
    increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

// Initialize Firebase
console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
console.log("Initialized Firebase on Dashboard.");

// --- Module-Scoped Variables ---
// DOM Element Holders
let taskListHeaderEl, taskListBody, taskListFooter, addSectionBtn, addTaskHeaderBtn, mainContainer, assigneeDropdownTemplate, filterBtn, sortBtn;

// Event Handler References
let headerClickListener, bodyClickListener, bodyFocusOutListener, addTaskHeaderBtnListener, addSectionBtnListener, windowClickListener, filterBtnListener, sortBtnListener;
let sortableSections;
let activeMenuButton = null;
const sortableTasks = [];
let isSortActive = false; 

// State variables to track the drag operation
let draggedElement = null;
let placeholder = null;
let dragHasMoved = false;
let sourceContainer = null;

// --- Data ---
let project = { customColumns: [], sections: [] };
let allTasksFromSnapshot = [];
// --- Real-time Listener Management ---
// This object will hold the unsubscribe functions for our active listeners.
let activeListeners = {
    workspace: null,
    project: null,
    sections: null,
    tasks: null,
};

let currentUserId = null;
let currentWorkspaceId = null;
let expansionTimeout = null; // Holds the timer for auto-expanding a section
let lastHoveredSectionId = null; // Tracks the last section hovered over to prevent re-triggering
let currentProjectId = null;

let activeFilters = {}; // Will hold { visibleSections: [id1, id2] }
let activeSortState = 'default'; // 'default', 'asc' (oldest), 'desc' (newest)

const allUsers = [
    { id: 1, name: 'Lorelai Gilmore', email: 'lorelai.g@example.com', avatar: 'https://i.imgur.com/k9qRkiG.png' },
    { id: 2, name: 'Rory Gilmore', email: 'rory.g@example.com', avatar: 'https://i.imgur.com/8mR4H4A.png' },
    { id: 3, name: 'Luke Danes', email: 'luke.d@example.com', avatar: 'https://i.imgur.com/wfz43s9.png' },
    { id: 4, name: 'Sookie St. James', email: 'sookie.sj@example.com', avatar: 'https://i.imgur.com/L4DD33f.png' },
    { id: 5, name: 'Paris Geller', email: 'paris.g@example.com', avatar: 'https://i.imgur.com/lVceL5s.png' },
];
let taskIdToFocus = null;
let reorderingInProgress = false;

// Initialize safely
let currentlyFocusedSectionId = null;
const priorityOptions = ['High', 'Medium', 'Low'];
const statusOptions = ['On track', 'At risk', 'Off track', 'Completed'];
const columnTypeOptions = ['Text', 'Numbers', 'Costing', 'Type', 'Custom'];
const typeColumnOptions = [
    { name: 'Invoice', color: '#ffc107' }, // Amber
    { name: 'Payment', color: '#4caf50' } // Green
];
const baseColumnTypes = ['Text', 'Numbers', 'Costing', 'Type'];

const defaultPriorityColors = {
    'High': '#ffccc7',
    'Medium': '#ffe7ba',
    'Low': '#d9f7be'
};

const defaultStatusColors = {
    'On track': '#b7eb8f',
    'At risk': '#fff1b8',
    'Off track': '#ffccc7',
    'Completed': '#d9d9d9'
};

// --- New Real-time Data Loading Functions ---

/**
 * Detaches all active Firestore listeners to prevent memory leaks.
 */
function detachAllListeners() {
    console.log("Detaching all Firestore listeners...");
    Object.values(activeListeners).forEach(unsubscribe => {
        if (unsubscribe) {
            unsubscribe();
        }
    });
    // Clear the tracking object
    Object.keys(activeListeners).forEach(key => activeListeners[key] = null);
}

function setupEventListeners() {

    // =================================================================
    // 1. LISTENERS ON STATIC ELEMENTS (Outside the main render area)
    // =================================================================
    
    // Main "Add Task" button in the header
    addTaskHeaderBtn.addEventListener('click', () => {
        // If a section is already focused, add a task there.
        // Otherwise, add it to the first section.
        if (!currentlyFocusedSectionId && project.sections.length > 0) {
            currentlyFocusedSectionId = project.sections[0].id;
        }
        const focusedSection = project.sections.find(s => s.id === currentlyFocusedSectionId);
        
        if (focusedSection) {
            addNewTask(focusedSection);
        } else {
            alert('Please create a section before adding a task.');
        }
    });

    // Main "Add Section" button in the header
    addSectionBtn.addEventListener('click', () => {
        handleAddSectionClick();
    });

    // Main "Filter" button
    if (filterBtn) {
        filterBtn.addEventListener('click', () => {
            console.log("Filter button clicked.");
            openSectionFilterPanel();
        });
    }

    // Main "Sort" button
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            if (activeSortState === 'default') activeSortState = 'asc';
            else if (activeSortState === 'asc') activeSortState = 'desc';
            else activeSortState = 'default';
            render(); // Re-render to apply the sort
        });
    }

    // =================================================================
    // 2. DELEGATED LISTENER FOR THE DYNAMIC TASK LIST BODY (Click)
    // =================================================================
    // A single click listener on the parent container handles all clicks within it.
    taskListWrapper.addEventListener('click', (e) => {
        // --- A. Section-level Interactions ---
        const sectionToggle = e.target.closest('.section-toggle');
        const sectionOptionsBtn = e.target.closest('.section-options-btn');
        const addTaskRow = e.target.closest('.add-task-row-wrapper');

        // Collapse/Expand a section
        if (sectionToggle) {
            const sectionWrapper = e.target.closest('.section-wrapper');
            const section = project.sections.find(s => s.id == sectionWrapper.dataset.sectionId);
            if (section) {
                section.isCollapsed = !section.isCollapsed;
                updateSectionInFirebase(section.id, { isCollapsed: section.isCollapsed });
                render();
            }
            return;
        }
        
        // Open the options menu for a section
        if (sectionOptionsBtn) {
            e.stopPropagation(); // Prevent the global click listener from closing it instantly
            openSectionMenu(sectionOptionsBtn);
            return;
        }

        // Click the "Add task..." row at the bottom of a section
        if (addTaskRow) {
            const section = project.sections.find(s => s.id === addTaskRow.dataset.sectionId);
            if (section) {
                addNewTask(section, 'end');
            }
            return;
        }

        // --- B. Task-level Interactions ---
        const taskRow = e.target.closest('.task-row-wrapper');
        if (taskRow) {
            const taskId = taskRow.dataset.taskId;
            const sectionId = taskRow.dataset.sectionId;

            // Find the specific control element that was clicked inside the row
            const controlElement = e.target.closest('[data-control], .task-name');
            if (!controlElement) return;

            // Determine the action based on the control element
            const controlType = controlElement.matches('.task-name') ? 'open-sidebar' : controlElement.dataset.control;

            // Handle temporary tasks (only allow saving the name)
            if (taskId.startsWith('temp_') && controlType !== 'open-sidebar') {
                return;
            }

            // Use a switch statement to handle the specific action
            switch (controlType) {
                case 'open-sidebar':
                    displaySideBarTasks(taskId);
                    break;
                case 'check':
                    e.stopPropagation();
                    handleTaskCompletion(taskId, taskRow);
                    break;
                case 'due-date':
                    showDatePicker(controlElement, sectionId, taskId);
                    break;
                case 'priority': {
                    createDropdown(allPriorityOptions, controlElement, (selectedValue) => updateTask(taskId, sectionId, { priority: selectedValue.name }), 'Priority');
                    break;
                }
                case 'status': {
                    createDropdown(allStatusOptions, controlElement, (selectedValue) => updateTask(taskId, sectionId, { status: selectedValue.name }), 'Status');
                    break;
                }
                case 'like': {
                    handleLike(taskId);
                    break;
                }
                case 'comment':
                    displaySideBarTasks(taskId);
                    break;
                case 'assignee': {
                    showAssigneeDropdown(controlElement, taskId);
                    break;
                }
                case 'remove-assignee': {
                    e.stopPropagation();
                    updateTask(taskId, sectionId, { assignees: [] });
                    break;
                }
                case 'custom-select': {
                    const columnId = Number(controlElement.dataset.columnId);
                    const column = project.customColumns.find(c => c.id === columnId);
                    if (column && column.options) {
                        createDropdown(column.options, controlElement, (selectedValue) => {
                            updateTask(taskId, sectionId, { [`customFields.${columnId}`]: selectedValue.name });
                        }, 'CustomColumn', columnId);
                    }
                    break;
                }
            }
            return;
        }
    });
    
    // =================================================================
    // 3. DELEGATED LISTENER FOR SAVING CONTENT (Focusout)
    // =================================================================
    // A single focusout listener saves changes when a user clicks away from an editable element.
    taskListWrapper.addEventListener('focusout', (e) => {
        // --- Case 1: Renaming a section title ---
        if (e.target.matches('.section-title')) {
            const sectionWrapper = e.target.closest('.section-wrapper');
            const section = project.sections.find(s => s.id === sectionWrapper.dataset.sectionId);
            const newTitle = e.target.innerText.trim();
            if (section && section.title !== newTitle) {
                updateSectionInFirebase(section.id, { title: newTitle });
            }
            return;
        }

        // --- Case 2: Editing a task name or a custom field ---
        const taskRow = e.target.closest('.task-row-wrapper');
        if (!taskRow) return;

        const taskId = taskRow.dataset.taskId;
        const { task, section } = findTaskAndSection(taskId);
        if (!task || !section) return;

        // Editing a task name
        if (e.target.matches('.task-name')) {
            handleTaskNameSave(e.target, task, section);
        }
        // Editing a text-based custom field
        else if (e.target.matches('[data-control="custom"]')) {
            handleCustomFieldSave(e.target, task, section);
        }
    });

    // =================================================================
    // 4. GLOBAL LISTENER FOR CLOSING MENUS AND PANELS
    // =================================================================
    // This listener closes any open dropdown menu when the user clicks elsewhere.
    document.addEventListener('click', (e) => {
        // Do not close if the click is on a button that opens a menu or inside an open menu.
        if (e.target.closest('.options-dropdown-menu, .section-options-btn, [data-control]')) {
            return;
        }
        
        // Otherwise, find and close any open menu.
        closeOpenMenu();
    });
}
// --- Main Initialization and Cleanup ---

function initializeListView(params) {
    taskListHeaderEl = document.getElementById('task-list-header');
    taskListBody = document.getElementById('task-list-body');
    taskListFooter = document.getElementById('task-list-footer');
    addSectionBtn = document.getElementById('add-section-btn');
    addTaskHeaderBtn = document.querySelector('.add-task-header-btn');
    mainContainer = document.querySelector('.list-view-container');
    assigneeDropdownTemplate = document.getElementById('assignee-dropdown-template');
    filterBtn = document.getElementById('filter-btn');
    sortBtn = document.getElementById('sort-btn');
    
    if (!mainContainer || !taskListBody) {
        console.error("List view could not initialize: Essential containers not found.");
        return () => {};
    }
    
    setupEventListeners();
}

function distributeTasksToSections(tasks) {
    console.log("--- Running Task Distribution ---");
    
    const availableSectionIds = project.sections.map(s => s.id);
    console.log("Available section IDs on client:", availableSectionIds);
    
    // Reset tasks on all sections
    project.sections.forEach(section => section.tasks = []);
    
    let unmatchedTasks = 0;
    for (const task of tasks) {
        console.log(`Processing Task "${task.name || 'New Task'}" (ID: ${task.id}). Looking for sectionId: "${task.sectionId}"`);
        
        const section = project.sections.find(s => s.id === task.sectionId);
        
        if (section) {
            console.log(`   ✅ SUCCESS: Matched with section "${section.title}" (ID: "${section.id}")`);
            section.tasks.push(task);
        } else {
            console.error(`   ❌ FAILED: No section found with ID "${task.sectionId}"`);
            unmatchedTasks++;
        }
    }
    
    // ✅ NOW sort the tasks inside each section by their `order`
    project.sections.forEach(section => {
        section.tasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });
    
    console.log(`--- Distribution Complete. ${unmatchedTasks} tasks could not be matched. ---`);
}


export function init(params) {
    console.log("Initializing List View Module...", params);
    
    // Listen for authentication state changes
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in, attach real-time listeners.
            console.log(`User ${user.uid} signed in. Attaching listeners.`);
            attachRealtimeListeners(user.uid);
        } else {
            // User is signed out, detach all listeners and clear data.
            console.log("User signed out. Detaching listeners.");
            detachAllListeners();
            project = { customColumns: [], sections: [] };
            render(); // Render the empty/logged-out state
        }
    });
    
    // The initial render will be triggered by the listeners.
    initializeListView(params);
    render();
    
    // Return a modified cleanup function.
    return function cleanup() {
        console.log("Cleaning up List View Module...");
        detachAllListeners(); // Ensure all listeners are gone when the module is destroyed.
        console.log("Cleaning up List View Module...");
        if (headerClickListener) taskListHeaderEl.removeEventListener('click', headerClickListener);
        if (bodyClickListener) taskListBody.removeEventListener('click', bodyClickListener);
        if (bodyFocusOutListener) taskListBody.removeEventListener('focusout', bodyFocusOutListener);
        if (addTaskHeaderBtnListener) addTaskHeaderBtn.removeEventListener('click', addTaskHeaderBtnListener);
        if (addSectionBtnListener) addSectionBtn.removeEventListener('click', addSectionBtnListener);
        if (windowClickListener) window.removeEventListener('click', windowClickListener);
        if (filterBtnListener) filterBtn.removeEventListener('click', filterBtnListener);
        if (sortBtnListener) sortBtn.removeEventListener('click', sortBtnListener);
        
        if (sortableSections) sortableSections.destroy();
        sortableTasks.forEach(st => st.destroy());
        sortableTasks.length = 0;
    };
    
    
}

// --- Event Listener Setup ---



function setupEventListeners() {
    // Global click listener to handle menu logic
document.addEventListener('click', (e) => {
    const optionsButton = e.target.closest('.section-options-btn');
    
    // Check if the click is inside an open menu. If so, let the item handler work.
    if (e.target.closest('.options-dropdown-menu')) {
        const dropdownItem = e.target.closest('.dropdown-item');
        if (dropdownItem) {
            const { action, sectionId } = dropdownItem.dataset;
            console.log(`Action: ${action}, Section ID: ${sectionId || 'N/A'}`);
            closeOpenMenu();
        }
        return; // Do nothing more if click is inside a menu
    }
    
    // If we clicked an options button...
    if (optionsButton) {
        // Check if its menu is already open. If so, this click should close it.
        const wrapper = optionsButton.parentElement;
        const existingMenu = wrapper.querySelector('.options-dropdown-menu');
        
        if (existingMenu) {
            closeOpenMenu(); // It's open, so close it.
        } else {
            openOptionsMenu(optionsButton); // It's closed, so open it.
        }
    } else {
        // If the click was anywhere else on the page, close any open menu.
        closeOpenMenu();
    }
});

    headerClickListener = (e) => {
        const deleteButton = e.target.closest('.delete-column-btn');
        if (deleteButton) {
            e.stopPropagation();
            const columnEl = deleteButton.closest('[data-column-id]');
            if (columnEl) {
                const columnId = Number(columnEl.dataset.columnId);
                
                const dropdownOptions = [
                    { name: 'Rename column' },
                    { name: 'Delete column' }
                ];
                
                createDropdown(dropdownOptions, deleteButton, (selected) => {
                    if (selected.name === 'Delete column') {
                        deleteColumn(columnId);
                    } else if (selected.name === 'Rename column') {
                        // Pass the entire column header element to the rename function
                        enableColumnRename(columnEl);
                    }
                });
            }
            return;
        }
        
        const addColumnButton = e.target.closest('#add-column-btn');
        if (addColumnButton) {
            e.stopPropagation();
            const existingTypes = new Set(project.customColumns.map(col => col.type));
            const availableTypes = columnTypeOptions.filter(type => !existingTypes.has(type) || type === 'Custom');
            if (availableTypes.length === 0) return alert("All available column types have been added.");
            
            // FIX: Map strings to objects and update the callback to use the object's 'name' property
            createDropdown(
                availableTypes.map(type => ({ name: type })),
                addColumnButton,
                (selected) => openAddColumnDialog(selected.name)
            );
        }
    };
    
    bodyClickListener = (e) => {
        // --- Section Focus and Toggling ---
        const clickedSection = e.target.closest('.task-section');
        if (clickedSection) {
            currentlyFocusedSectionId = clickedSection.dataset.sectionId; // Note: dataset values are strings
        }
        
        if (e.target.closest('.section-toggle')) {
            const sectionEl = e.target.closest('.task-section');
            const section = project.sections.find(s => s.id == sectionEl.dataset.sectionId);
            if (section) {
                section.isCollapsed = !section.isCollapsed;
                render();
            }
            return;
        }
        
        // --- Add Task Button in Section ---
        const addTaskBtn = e.target.closest('.add-task-in-section-btn');
        if (addTaskBtn) {
            const sectionEl = addTaskBtn.closest('.task-section');
            if (sectionEl) {
                const section = project.sections.find(s => s.id == sectionEl.dataset.sectionId);
                if (section) {
                    addNewTask(section, 'end');
                }
            }
            return;
        }
        
        // --- Task Row Interactions ---
        const taskRow = e.target.closest('.task-row-wrapper');
        if (!taskRow) return;
        
        const taskId = taskRow.dataset.taskId;
        
        // --- Find the clicked control FIRST ---
        // We now check for the task name SPAN as a control as well.
        const controlElement = e.target.closest('[data-control], .task-name');
        if (!controlElement) return; // Exit if the click wasn't on any interactive element
        
        // Determine the control type
        let controlType;
        if (controlElement.matches('.task-name')) {
            // If it's the task name, we'll treat it as a special control type
            controlType = 'open-sidebar';
        } else {
            // Otherwise, get the type from the data-control attribute
            controlType = controlElement.dataset.control;
        }
        
        // Handle new (temporary) tasks: only allow editing the name.
        if (taskId.startsWith('temp_') && controlType !== 'open-sidebar') {
            // If it's a new task, don't allow clicking other controls yet.
            return;
        }
        
        const sectionEl = taskRow.closest('.task-section');
        const sectionId = sectionEl ? sectionEl.dataset.sectionId : null;
        if (!sectionId) return;
        
        // --- Unified Switch Statement for ALL Controls ---
        switch (controlType) {
            case 'open-sidebar':
                displaySideBarTasks(taskId);
                break;
            case 'check':
                e.stopPropagation();
                handleTaskCompletion(taskId, taskRow);
                break;
                
            case 'due-date':
                showDatePicker(controlElement, sectionId, taskId);
                break;
                
            case 'priority': {
                let allPriorityOptions = priorityOptions.map(p => ({
                    name: p,
                    color: defaultPriorityColors[p] || null
                }));
                if (project.customPriorities) {
                    allPriorityOptions = allPriorityOptions.concat(project.customPriorities);
                }
                createDropdown(allPriorityOptions, controlElement, (selectedValue) => updateTask(taskId, sectionId, { priority: selectedValue.name }), 'Priority');
                break;
            }
            
            case 'status': {
                let allStatusOptions = statusOptions.map(s => ({
                    name: s,
                    color: defaultStatusColors[s] || null
                }));
                if (project.customStatuses) {
                    allStatusOptions = allStatusOptions.concat(project.customStatuses);
                }
                createDropdown(allStatusOptions, controlElement, (selectedValue) => updateTask(taskId, sectionId, { status: selectedValue.name }), 'Status');
                break;
            }
            
            case 'like': {
    const { task, section } = findTaskAndSection(taskId);
    if (!task || !section || !currentUserId) break;
    
    const taskRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${section.id}/tasks/${taskId}`);
    const userHasLiked = task.likedBy && task.likedBy[currentUserId];
    
    if (userHasLiked) {
        // User is "unliking" the task
        updateDoc(taskRef, {
            likedAmount: increment(-1),
            [`likedBy.${currentUserId}`]: deleteField()
        });
    } else {
        // User is "liking" the task
        updateDoc(taskRef, {
            likedAmount: increment(1),
            [`likedBy.${currentUserId}`]: true
        });
    }
    break;
}

            case 'comment':     // Opens the same sidebar as clicking the task name
    displaySideBarTasks(taskId);
    break;
            
            case 'custom-select': {
                const columnId = Number(controlElement.dataset.columnId);
                const column = project.customColumns.find(c => c.id === columnId);
                if (column && column.options) {
                    createDropdown(column.options, controlElement, (selectedValue) => {
                        updateTask(taskId, sectionId, {
                            [`customFields.${columnId}`]: selectedValue.name
                        });
                    }, 'CustomColumn', columnId);
                }
                break;
            }
            
            case 'move-task': {
                e.stopPropagation();
                const { section: currentSection } = findTaskAndSection(taskId);
                if (!currentSection) break;
                
                const otherSections = project.sections.filter(s => s.id !== currentSection.id);
                if (otherSections.length > 0) {
                    createDropdown(
                        otherSections.map(s => ({ name: s.title })), // Map to object array
                        controlElement,
                        (selected) => {
                            const targetSection = project.sections.find(s => s.title === selected.name);
                            if (targetSection) {
                                moveTaskToSection(taskId, targetSection.id);
                            }
                        }
                    );
                } else {
                    alert("There are no other sections to move this task to.");
                }
                break;
            }
            
            case 'assignee': {
                showAssigneeDropdown(controlElement, taskId);
                break;
            }
            
            case 'remove-assignee':
                e.stopPropagation();
                // We need to find the sectionId to update the task correctly
                const { section } = findTaskAndSection(taskId);
                if (section) {
                    updateTask(taskId, section.id, { assignees: [] });
                }
                break;
        }
    };
    
    
    
    bodyFocusOutListener = (e) => {
        // Case 1: Renaming a section title
        if (e.target.matches('.section-title')) {
            const sectionEl = e.target.closest('.task-section');
            if (sectionEl) {
                const sectionId = sectionEl.dataset.sectionId;
                const newTitle = e.target.innerText.trim();
                const section = project.sections.find(s => s.id === sectionId);
                
                // Only update if the title has actually changed
                if (section && section.title !== newTitle) {
                    updateSectionInFirebase(sectionId, { title: newTitle });
                }
            }
            return; // End execution here
        }
        
        const taskRow = e.target.closest('.task-row-wrapper');
        if (!taskRow) return; // Exit if the event wasn't inside a task row
        
        const taskId = taskRow.dataset.taskId; // This could be a real ID or a temporary one
        const { task, section } = findTaskAndSection(taskId);
        
        // If for some reason the task or section can't be found, do nothing.
        if (!task || !section) {
            return;
        }
        
        // Case 2: Editing a task name
        if (e.target.matches('.task-name')) {
            const newName = e.target.innerText.trim();
            
            // If it was a new, temporary task...
            if (task.isNew) {
                // ... and the user entered a name, save it permanently to Firestore.
                if (newName) {
                    // First, remove the local temporary task from the array.
                    section.tasks = section.tasks.filter(t => t.id !== taskId);
                    
                    // Then, create a new task in Firestore with the entered name.
                    // Destructure the temp task to get its data, but exclude local-only flags.
                    const { isNew, id, ...taskData } = task;
                    addTaskToFirebase(section.id, { ...taskData, name: newName });
                    // The onSnapshot listener will automatically add the new, permanent task to the UI.
                    
                } else {
                    // ... but the name is empty, just remove the temporary task and re-render.
                    section.tasks = section.tasks.filter(t => t.id !== taskId);
                    render();
                }
            }
            // If it's an existing task and the name has changed, update it.
            else if (task.name !== newName) {
                updateTask(taskId, section.id, { name: newName });
            }
        }
        // Case 3: Editing a custom field cell
        else if (e.target.matches('[data-control="custom"]')) {
            const customFieldCell = e.target;
            const columnId = customFieldCell.dataset.columnId;
            const column = project.customColumns.find(c => c.id == columnId);
            if (!column) return;
            
            let newValue = customFieldCell.innerText.trim();
            
            // For Costing or Numbers types, parse the value as a number.
            if (column.type === 'Costing' || column.type === 'Numbers') {
    // This more robust regex removes anything that isn't a digit, a hyphen, or a decimal point.
    // It correctly preserves negative numbers like "-300" or "-12.50".
    const numericString = newValue.replace(/[^0-9.-]+/g, "");
    
    // Only parse if the result is a valid, non-empty number string.
    // This prevents an input of just "-" from being saved as 0.
    if (numericString && !isNaN(numericString)) {
        newValue = parseFloat(numericString);
    } else {
        newValue = null; // Default to null (or 0 if you prefer) for invalid input
    }
}
            
            // Only update if the value has actually changed.
            if (task.customFields[columnId] !== newValue) {
                // Use dot notation for updating a specific key in a map field.
                updateTask(taskId, section.id, {
                    [`customFields.${columnId}`]: newValue
                });
            }
        }
        
    };
    
    addTaskHeaderBtnListener = () => {
        if (!currentlyFocusedSectionId && project.sections.length > 0) {
            currentlyFocusedSectionId = project.sections[0].id;
        }
        const focusedSection = project.sections.find(s => s.id === currentlyFocusedSectionId);
        if (focusedSection) addNewTask(focusedSection);
        else alert('Please create a section before adding a task.');
    };
    
    addSectionBtnListener = () => {
        handleAddSectionClick();
    };
    
    // This is the corrected version:
    windowClickListener = (e) => {
        // We add #filter-btn AND the dialog's own class to the list of elements that should NOT close the panels.
        if (!e.target.closest('.datepicker, .context-dropdown, [data-control], .dialog-overlay, .delete-column-btn, #add-column-btn, #filter-btn, .filterlistview-dialog-overlay')) {
            closeFloatingPanels();
        }
    };
    
    filterBtnListener = () => {
        // DEBUG: Confirm the listener is firing
        console.log("Filter button clicked. Opening section filter panel...");
        openSectionFilterPanel();
    }
    
    sortBtnListener = () => {
        if (activeSortState === 'default') {
            activeSortState = 'asc'; // asc = Oldest first
        } else if (activeSortState === 'asc') {
            activeSortState = 'desc'; // desc = Newest first
        } else {
            activeSortState = 'default';
        }
        render();
    };
    
    // Attach all listeners
    taskListHeaderEl.addEventListener('click', headerClickListener);
    taskListBody.addEventListener('click', bodyClickListener);
    taskListBody.addEventListener('focusout', bodyFocusOutListener);
    addTaskHeaderBtn.addEventListener('click', addTaskHeaderBtnListener);
    addSectionBtn.addEventListener('click', addSectionBtnListener);
    window.addEventListener('click', windowClickListener);
    if (filterBtn) filterBtn.addEventListener('click', filterBtnListener);
    if (sortBtn) sortBtn.addEventListener('click', sortBtnListener);
}

// --- Core Logic & UI Functions ---

function handleAddSectionClick() {
    const newOrder = project.sections ? project.sections.length : 0;
    addSectionToFirebase({
        title: 'New Section',
        isCollapsed: false,
        order: newOrder
    });
};

function openSectionFilterPanel() {
    closeFloatingPanels();
    const dialogOverlay = document.createElement('div');
    // MODIFIED: Changed class name
    dialogOverlay.className = 'filterlistview-dialog-overlay';
    
    const sectionOptionsHTML = project.sections.map(s => {
        const isChecked = !activeFilters.visibleSections || activeFilters.visibleSections.includes(s.id);
        // MODIFIED: Changed class name for checkboxes
        return `<div><label><input type="checkbox" class="filterlistview-section-checkbox" name="section" value="${s.id}" ${isChecked ? 'checked' : ''}> ${s.title}</label></div>`;
    }).join('');
    
    const allChecked = !activeFilters.visibleSections;
    
    // MODIFIED: Changed all class names within the HTML string
    dialogOverlay.innerHTML = `
    <div class="filterlistview-dialog-box filterlistview-filter-dialog">
        <div class="filterlistview-dialog-header">Filter by Section</div>
            <div class="filterlistview-dialog-body">
                <fieldset>
                    <legend>Sections</legend>
                    <div><label><input type="checkbox" id="select-all-sections" ${allChecked ? 'checked' : ''}> <strong>Select All</strong></label></div>
                    <hr>
                <div class="filterlistview-section-checkbox-list">${sectionOptionsHTML}</div>
            </fieldset>
            </div>
            <div class="filterlistview-dialog-footer">
                <button class="filterlistview-dialog-button filterlistview-primary" id="apply-filters-btn">Apply</button>
            </div>
        </div>`;
    
    document.body.appendChild(dialogOverlay);
    
    const applyBtn = dialogOverlay.querySelector('#apply-filters-btn');
    const selectAllBox = dialogOverlay.querySelector('#select-all-sections');
    // MODIFIED: Changed selector to match new class name
    const allSectionBoxes = dialogOverlay.querySelectorAll('.filterlistview-section-checkbox');
    
    selectAllBox.addEventListener('change', (e) => {
        allSectionBoxes.forEach(box => box.checked = e.target.checked);
    });
    
    applyBtn.addEventListener('click', () => {
        const checkedBoxes = Array.from(allSectionBoxes).filter(box => box.checked);
        
        if (checkedBoxes.length === allSectionBoxes.length) {
            delete activeFilters.visibleSections;
        } else {
            activeFilters.visibleSections = checkedBoxes.map(box => Number(box.value));
        }
        
        closeFloatingPanels();
        render();
    });
    
    // MODIFIED: Changed selector to match new class name
    dialogOverlay.addEventListener('click', e => {
        if (e.target.classList.contains('filterlistview-dialog-overlay')) {
            closeFloatingPanels();
        }
    });
    
}

function getFilteredProject() {
    // DEBUG: See what filters are being applied at the start of the render cycle
    // console.log("getFilteredProject called with state:", JSON.stringify(activeFilters));
    const projectCopy = JSON.parse(JSON.stringify(project));
    
    if (activeFilters.visibleSections && activeFilters.visibleSections.length < project.sections.length) {
        projectCopy.sections = projectCopy.sections.filter(section =>
            activeFilters.visibleSections.includes(section.id)
        );
    }
    
    return projectCopy;
}

function getSortedProject(project) {
    return {
        ...project,
        sections: [...project.sections].sort((a, b) => a.order - b.order)
    };
}

function closeFloatingPanels() {
    document.querySelectorAll('.context-dropdown, .datepicker, .dialog-overlay, .filterlistview-dialog-overlay').forEach(p => p.remove());
}

/**
 * Finds the Firestore path for the currently selected project.
 * @param {object} db - The Firestore database instance.
 * @param {string} userId - The current user's ID.
 * @returns {string} The base path to the project.
 * @throws {Error} If no selected workspace or project is found.
 */
async function _getSelectedProjectPath(db, userId) {
    const workspaceQuery = query(collection(db, `users/${userId}/myworkspace`), where("isSelected", "==", true));
    const workspaceSnap = await getDocs(workspaceQuery);
    if (workspaceSnap.empty) throw new Error("No selected workspace found.");
    const workspaceId = workspaceSnap.docs[0].id;
    
    const projectQuery = query(collection(db, `users/${userId}/myworkspace/${workspaceId}/projects`), where("isSelected", "==", true));
    const projectSnap = await getDocs(projectQuery);
    if (projectSnap.empty) throw new Error("No selected project found.");
    const projectId = projectSnap.docs[0].id;
    
    return `users/${userId}/myworkspace/${workspaceId}/projects/${projectId}`;
}

async function handleSectionReorder(evt) {
    console.log("🔄 Section reorder triggered.");
    
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");
    
    try {
        const basePath = await _getSelectedProjectPath(db, user.uid);
        const sectionEls = [...taskListBody.querySelectorAll('.section-wrapper')];
        console.log(`🧱 Found ${sectionEls.length} section elements to reorder.`);
        
        const batch = writeBatch(db);
        sectionEls.forEach((el, index) => {
            const sectionId = el.dataset.sectionId;
            if (sectionId) {
                const sectionRef = doc(db, `${basePath}/sections/${sectionId}`);
                batch.update(sectionRef, { order: index });
                console.log(`🔢 Set order ${index} for section ${sectionId}`);
            }
        });
        
        await batch.commit();
        console.log("✅ Sections reordered and saved to Firestore.");
        
    } catch (err) {
        console.error("❌ Error committing section reordering batch:", err);
        // Re-throw to allow the calling function to revert the UI.
        throw err;
    }
}

function findTaskAndSection(taskId) {
    for (const section of project.sections) {
        const task = section.tasks.find(t => t.id === taskId);
        if (task) return { task, section };
    }
    return { task: null, section: null };
}

/**
 * Handles moving a task after a drag-and-drop.
 * This version is adapted for our custom synthetic event object.
 */
async function handleTaskMoved(evt) {
    console.log("🚀 Handling task move with synthetic event:", evt);

    const user = auth.currentUser;
    if (!user) {
        console.error("❌ User not authenticated.");
        return;
    }

    // --- 1. Get IDs and Elements from our custom 'evt' object ---
    const taskEl = evt.item; // The .grid-row-wrapper element that was dragged
    const taskId = taskEl.dataset.taskId;

    // The new parent is a .section-wrapper
    const newSectionEl = evt.to;
    const newSectionId = newSectionEl.dataset.sectionId;

    // The original parent was also a .section-wrapper
    const oldSectionEl = evt.from;
    const oldSectionId = oldSectionEl.dataset.sectionId;

    if (!taskId || !newSectionId || !oldSectionId) {
        console.error("❌ Critical ID missing from event object or DOM elements.", { taskId, newSectionId, oldSectionId });
        // Trigger the UI revert logic since the update will fail.
        throw new Error("Critical ID missing for Firestore update.");
    }

    try {
        // --- 2. Get Firestore project path (this part was correct) ---
        const workspaceSnap = await getDocs(query(collection(db, `users/${user.uid}/myworkspace`), where("isSelected", "==", true)));
        if (workspaceSnap.empty) throw new Error("No selected workspace found.");
        const workspaceId = workspaceSnap.docs[0].id;

        const projectSnap = await getDocs(query(collection(db, `users/${user.uid}/myworkspace/${workspaceId}/projects`), where("isSelected", "==", true)));
        if (projectSnap.empty) throw new Error("No selected project found.");
        const projectId = projectSnap.docs[0].id;
        const basePath = `users/${user.uid}/myworkspace/${workspaceId}/projects/${projectId}`;

        // --- 3. Prepare a batched write for atomic updates ---
        const batch = writeBatch(db);

        // --- 4. Get all tasks from the affected sections from the DOM ---
        // The DOM is our "source of truth" for the new order.
        // NOTE: Use the correct selector '.grid-row-wrapper[data-task-id]'
        const tasksInNewSection = Array.from(newSectionEl.querySelectorAll('.grid-row-wrapper[data-task-id]'));
        const tasksInOldSection = Array.from(oldSectionEl.querySelectorAll('.grid-row-wrapper[data-task-id]'));

        if (newSectionId === oldSectionId) {
            // --- Case A: Reordering within the SAME section ---
            console.log(`Reordering task "${taskId}" in section "${newSectionId}"`);
            tasksInNewSection.forEach((el, index) => {
                const currentTaskId = el.dataset.taskId;
                const taskRef = doc(db, `${basePath}/sections/${newSectionId}/tasks/${currentTaskId}`);
                batch.update(taskRef, { order: index });
                console.log(`  -> Queuing update for Task ID: ${currentTaskId}, New Order: ${index}`);
            });
        } else {
            // --- Case B: Moving to a DIFFERENT section ---
            console.log(`Moving task "${taskId}" from section "${oldSectionId}" to "${newSectionId}"`);

            // Update the dragged task's sectionId field
            const movedTaskRef = doc(db, `${basePath}/sections/${oldSectionId}/tasks/${taskId}`);
            batch.update(movedTaskRef, { sectionId: newSectionId });
            console.log(`  -> Queuing sectionId update for moved task ${taskId}`);


            // Re-order all tasks in the NEW section
            tasksInNewSection.forEach((el, index) => {
                const currentTaskId = el.dataset.taskId;
                // Important: Use oldSectionId for the moved task's path, newSectionId for all others
                const taskOriginalSection = (currentTaskId === taskId) ? oldSectionId : newSectionId;
                const taskRef = doc(db, `${basePath}/sections/${taskOriginalSection}/tasks/${currentTaskId}`);
                batch.update(taskRef, { order: index, sectionId: newSectionId }); // Ensure sectionId is correct
                 console.log(`  -> Queuing reorder for NEW section. Task ID: ${currentTaskId}, New Order: ${index}`);
            });

            // Re-order all remaining tasks in the OLD section
            tasksInOldSection.forEach((el, index) => {
                const currentTaskId = el.dataset.taskId;
                const taskRef = doc(db, `${basePath}/sections/${oldSectionId}/tasks/${currentTaskId}`);
                batch.update(taskRef, { order: index });
                 console.log(`  -> Queuing reorder for OLD section. Task ID: ${currentTaskId}, New Order: ${index}`);
            });
        }

        // --- 5. Commit all changes to Firestore ---
        await batch.commit();
        console.log("✅ Batch commit successful. Task positions updated in Firestore.");

    } catch (err) {
        console.error("❌ Error handling task move:", err);
        // Re-throw the error so the calling function's catch block can handle UI reversion.
        throw err;
    }
}

/**
 * Enables in-place editing for a column header.
 * @param {HTMLElement} columnEl The header element of the column to rename.
 */
function enableColumnRename(columnEl) {
    const originalName = columnEl.textContent.trim();
    columnEl.setAttribute('contenteditable', 'true');
    columnEl.focus();
    document.execCommand('selectAll', false, null); // Selects the text for immediate editing
    
    const columnId = Number(columnEl.dataset.columnId);
    
    const finishEditing = async (saveChanges) => {
        columnEl.removeEventListener('blur', onBlur);
        columnEl.removeEventListener('keydown', onKeyDown);
        columnEl.setAttribute('contenteditable', 'false');
        
        const newName = columnEl.textContent.trim();
        
        if (saveChanges && newName && newName !== originalName) {
            // Find the column and update its name
            const newColumns = project.customColumns.map(col => {
                if (col.id === columnId) {
                    return { ...col, name: newName };
                }
                return col;
            });
            // Update the entire array in Firebase
            await updateProjectInFirebase({ customColumns: newColumns });
        } else {
            // If cancelled or name is empty/unchanged, revert to original
            columnEl.textContent = originalName;
            // Re-append the menu button which gets wiped by textContent manipulation
            const menuBtn = document.createElement('button');
            menuBtn.className = 'delete-column-btn';
            menuBtn.title = 'Column options';
            menuBtn.innerHTML = `<i class="fas fa-ellipsis-h"></i>`;
            columnEl.appendChild(menuBtn);
        }
    };
    
    const onBlur = () => {
        finishEditing(true);
    };
    
    const onKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishEditing(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finishEditing(false);
        }
    };
    
    columnEl.addEventListener('blur', onBlur);
    columnEl.addEventListener('keydown', onKeyDown);
}

// =====================================================================
// FINAL JAVASCRIPT - BUILDS A FLAT GRID
// =====================================================================

function render() {
    if (!taskListBody) return;

    const projectToRender = project;
    const customColumns = projectToRender.customColumns || [];

    // 1. Clear the main scrolling container
    taskListBody.innerHTML = '';

    // 2. Create the single grid wrapper that will contain ALL cells
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'grid-wrapper';
    
    taskListBody.appendChild(gridWrapper);

    // 3. Define and apply the grid column template
    const columnWidths = {
        taskName: '350px', assignee: '150px', dueDate: '150px',
        priority: '150px', status: '150px', defaultCustom: '160px',
        addColumn: '120px'
    };
    const gridTemplateColumns = [
        columnWidths.taskName, columnWidths.assignee, columnWidths.dueDate,
        columnWidths.priority, columnWidths.status,
        ...customColumns.map(() => columnWidths.defaultCustom),
        columnWidths.addColumn
    ].join(' ');
    gridWrapper.style.gridTemplateColumns = gridTemplateColumns;

    // 4. Render header and body cells directly into the grid wrapper
    renderHeader(projectToRender, gridWrapper);
    renderBody(projectToRender, gridWrapper);

    // 👇 Update sort button state and flag
 isSortActive = activeSortState !== 'default';

if (sortBtn) {
    if (activeSortState === 'asc') {
        sortBtn.innerHTML = `<i class="fas fa-sort-amount-up-alt"></i> Oldest`;
    } else if (activeSortState === 'desc') {
        sortBtn.innerHTML = `<i class="fas fa-sort-amount-down-alt"></i> Newest`;
    } else {
        sortBtn.innerHTML = `<i class="fas fa-sort"></i> Sort`;
    }
}
    if (taskIdToFocus) {
        const newEl = taskListBody.querySelector(`[data-task-id="${taskIdToFocus}"] .task-name-input`);
        if (newEl) { newEl.focus(); newEl.select(); }
        taskIdToFocus = null;
    }
    initializeDragAndDrop(taskListBody); 
}

function renderHeader(projectToRender, container) {
    const customColumns = projectToRender.customColumns || [];
    const headers = ['Name', 'Assignee', 'Due Date', 'Priority', 'Status']; // Simplified for clarity
    
    // Create fixed headers
    headers.forEach((name, index) => {
        const cell = document.createElement('div');
        cell.className = index === 0 ? 'header-cell sticky-col-task sticky-col-header' : 'header-cell';
        cell.innerHTML = `<span>${name}</span>`;
        if (index > 0) {
            cell.innerHTML += `<i class="fa-solid fa-angle-down column-icon"></i>`;
        }
        container.appendChild(cell);
    });

    // Create custom column headers
    customColumns.forEach(col => {
        const cell = document.createElement('div');
        cell.className = 'header-cell';
        cell.dataset.columnId = col.id;
        cell.innerHTML = `<span>${col.name}</span><i class="fa-solid fa-ellipsis-h column-icon options-icon"></i>`;
        container.appendChild(cell);
    });

    // "Add Column" button cell
    const addColumnCell = document.createElement('div');
    addColumnCell.className = 'header-cell add-column-cell';
    addColumnCell.innerHTML = `<i class="fa-solid fa-plus"></i>`;
    container.appendChild(addColumnCell);
}

function renderBody(projectToRender, container) {
    const customColumns = projectToRender.customColumns || [];

    (projectToRender.sections || []).forEach(section => {
        // 🔁 NEW: wrap the whole section
        const sectionWrapper = document.createElement('div');
        sectionWrapper.className = 'section-wrapper';
        sectionWrapper.dataset.sectionId = section.id;

        // Create and add the section title row
        const sectionRow = createSectionRow(section, customColumns);
        sectionWrapper.appendChild(sectionRow);

        // Add tasks if not collapsed
        if (!section.isCollapsed && section.tasks) {
            section.tasks.forEach(task => {
                const taskRow = createTaskRow(task, customColumns);
                sectionWrapper.appendChild(taskRow);
            });
        }

        // Add the "Add Task" row
        const addTaskRow = createAddTaskRow(customColumns, section.id);
        sectionWrapper.appendChild(addTaskRow);

        // Append to main grid container
        container.appendChild(sectionWrapper);
    });
}

function createSectionRow(sectionData, customColumns) {
    // Create the wrapper for the entire row
    const row = document.createElement('div');
    row.className = 'grid-row-wrapper section-row-wrapper';
    row.dataset.sectionId = sectionData.id;
    
    const chevronClass = sectionData.isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';
    
    // Cell 1: The Section Title (Sticky)
    const titleCell = document.createElement('div');
    titleCell.className = 'task-cell sticky-col-task section-title-cell';
    titleCell.innerHTML = `
        <div class="section-title-wrapper">
            <i class="fas fa-grip-vertical drag-handle"></i>
            <i class="fas ${chevronClass} section-toggle"></i>
            <span class="section-title">${sectionData.title}</span>
        </div>
        <button class="section-options-btn" data-section-id="${sectionData.id}">
            <i class="fa-solid fa-ellipsis-h"></i>
        </button>
    `;
    row.appendChild(titleCell); // Append cell to the row wrapper
    
    // Cells 2 to N: Create empty placeholder cells
    const placeholderCount = 4 + customColumns.length + 1; // 4 base + custom + add column
    for (let i = 0; i < placeholderCount; i++) {
        const placeholderCell = document.createElement('div');
        placeholderCell.className = 'task-cell section-placeholder-cell';
        row.appendChild(placeholderCell); // Append cell to the row wrapper
    }
    
    return row; // Return the fully constructed row element
}

/**
 * Creates a complete task row element with all its cells.
 * @param {object} task - The task object containing all its data.
 * @param {Array} customColumns - The array of custom column definitions.
 * @returns {HTMLElement} The fully constructed row element.
 */
function createTaskRow(task, customColumns) {
    // Create the wrapper for the entire row
    const row = document.createElement('div');
    row.className = 'grid-row-wrapper task-row-wrapper';
    row.dataset.taskId = task.id;
    row.dataset.sectionId = task.sectionId;

    const isCompletedClass = task.status === 'Completed' ? 'is-completed' : '';

    // --- Cell 1: Task Name (Sticky) ---
    const taskNameCell = document.createElement('div');
    taskNameCell.className = `task-cell sticky-col-task ${isCompletedClass}`;
    taskNameCell.innerHTML = `
        <div class="task-name-wrapper">
            <span class="drag-handle"><i class="fas fa-grip-lines"></i></span>
            <span class="check-icon" data-control="check"><i class="fa-regular fa-circle-check"></i></span>
            <span class="task-name" contenteditable="true">${task.name || ''}</span>
        </div>
    `;
    row.appendChild(taskNameCell);

    // --- Define and Create Base Column Cells ---
    // This array defines the data and control type for each standard column
    const baseColumns = [
        {
            control: 'assignee',
            value: task.assignees && task.assignees.length > 0 ? task.assignees[0].name : null
        },
        {
            control: 'due-date',
            value: task.dueDate
        },
        {
            control: 'priority',
            value: task.priority
        },
        {
            control: 'status',
            value: task.status
        }
    ];

    // Loop through the definitions to create each cell
    baseColumns.forEach(col => {
        const cell = document.createElement('div');
        cell.className = `task-cell ${isCompletedClass}`;
        cell.dataset.control = col.control; // Set data-control for event listeners
        cell.innerHTML = `<span>${col.value || '+'}</span>`; // Display value or '+' placeholder
        row.appendChild(cell);
    });

    // --- Create Custom Column Cells ---
    customColumns.forEach(col => {
        const cell = document.createElement('div');
        cell.className = `task-cell ${isCompletedClass}`;
        cell.dataset.columnId = col.id;
        cell.dataset.control = 'custom-select'; // Assuming 'select' for custom fields
        const value = task.customFields ? task.customFields[col.id] : null;
        cell.innerHTML = `<span>${value || '<span class="add-value">+</span>'}</span>`;
        row.appendChild(cell);
    });

    // --- Final Placeholder Cell ---
    // This empty cell aligns with the "+" button in the header, keeping the grid structure consistent.
    const placeholderCell = document.createElement('div');
    placeholderCell.className = 'task-cell';
    row.appendChild(placeholderCell);

    return row; // Return the fully constructed row element
}

function createAddTaskRow(customColumns, sectionId) {
    const row = document.createElement('div');
    row.className = 'grid-row-wrapper add-task-row-wrapper';
    row.dataset.sectionId = sectionId;

    // Cell 1: Add task text (Sticky)
    const addTaskCell = document.createElement('div');
    addTaskCell.className = 'task-cell sticky-col-task add-task-cell';
    addTaskCell.innerHTML = `
        <div class="add-task-wrapper">
            <i class="add-task-icon fa-solid fa-plus"></i>
            <span class="add-task-text">Add task...</span>
        </div>
    `;
    row.appendChild(addTaskCell);

    // Add empty placeholder cells
    const placeholderCount = 4 + customColumns.length + 1;
    for (let i = 0; i < placeholderCount; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'task-cell';
        row.appendChild(placeholder);
    }

    return row;
}



// This function will run ONLY when a menu is open and the user scrolls
function updateMenuPosition() {
    if (!activeMenuButton) return;
    
    const menu = document.querySelector('.options-dropdown-menu');
    if (!menu) return;
    
    // Recalculate button position and update the menu's style
    const rect = activeMenuButton.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${rect.right + window.scrollX - menuWidth}px`;
}

function closeOpenMenu() {
    if (activeMenuButton) {
        taskListBody.removeEventListener('scroll', updateMenuPosition);
        activeMenuButton = null;
    }
    const existingMenu = document.querySelector('.options-dropdown-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
}

function openOptionsMenu(buttonEl) {
    closeOpenMenu(); // Close any other menus first
    
    const sectionId = buttonEl.dataset.sectionId;
    
    // Create menu element
    const menu = document.createElement('div');
    menu.className = 'options-dropdown-menu';
    menu.innerHTML = `
        <div class="dropdown-item" data-action="addTask" data-section-id="${sectionId}">
            <i class="fa-solid fa-plus dropdown-icon"></i>
            <span>Add task</span>
        </div>
        <div class="dropdown-item" data-action="renameSection">
             <i class="fa-solid fa-pen dropdown-icon"></i>
            <span>Rename section</span>
        </div>
        <div class="dropdown-item" data-action="deleteSection">
             <i class="fa-solid fa-trash dropdown-icon"></i>
            <span>Delete section</span>
        </div>
    `;
    
    // Append to body to ensure it's on top of everything
    document.body.appendChild(menu);
    
    // Set the button as the active one
    activeMenuButton = buttonEl;
    
    // Set initial position
    updateMenuPosition();
    
    // IMPORTANT: Add a temporary scroll listener
    taskListBody.addEventListener('scroll', updateMenuPosition, { passive: true });
}

/**
 * Moves a task to a different section using only the task's ID and the target section's ID.
 * This function preserves the task's original document ID during the move.
 *
 * @param {string} taskId The ID of the task to move.
 * @param {string} targetSectionId The ID of the destination section.
 */
async function moveTaskToSection(taskId, targetSectionId) {
    // 1. Find the full task object and its current section from our local data.
    const { task: taskToMove, section: sourceSection } = findTaskAndSection(taskId);
    
    // 2. Validate that the task and its source section were found.
    if (!taskToMove || !sourceSection || sourceSection.id === targetSectionId) {
        console.error("Cannot move task. Source or target section is invalid.");
        return;
    }
    
    // The ID of the task will be preserved. This is the same as the `taskId` passed in.
    const preservedTaskId = taskToMove.id;
    
    // 3. Reference to the original document location in Firestore.
    const sourceTaskRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${sourceSection.id}/tasks/${preservedTaskId}`);
    
    // 4. Reference the NEW document location, but command Firestore to use the SAME ID.
    const newTaskRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${targetSectionId}/tasks/${preservedTaskId}`);
    
    // 5. Prepare the new data for the document.
    const newTaskData = {
        ...taskToMove,
        sectionId: targetSectionId, // Update the sectionId field
        id: preservedTaskId // Ensure the 'id' field is still the preserved ID
    };
    
    try {
        // 6. Atomically delete the old document and create the new one.
        const batch = writeBatch(db);
        batch.delete(sourceTaskRef);
        batch.set(newTaskRef, newTaskData);
        await batch.commit();
        console.log(`Task ${preservedTaskId} moved successfully to section ${targetSectionId}.`);
    } catch (error) {
        console.error("Error moving task:", error);
    }
}

function displaySideBarTasks(taskId) {
    console.log(`Task name clicked. Opening sidebar for task ID: ${taskId}`);
    if (window.TaskSidebar) {
        window.TaskSidebar.open(taskId);
    } else {
        console.error("TaskSidebar module is not available.");
    }
}

function updateTask(taskId, sectionId, newProperties) {
    updateTaskInFirebase(taskId, sectionId, newProperties);
}

/**
 * Updates specific properties of a task document in Firestore.
 * @param {string} taskId The ID of the task to update.
 * @param {object} propertiesToUpdate An object with the fields to update.
 */
async function updateTaskInFirebase(taskId, sectionId, propertiesToUpdate) {
    if (!currentUserId || !currentWorkspaceId || !currentProjectId || !sectionId) {
        return console.error("Missing IDs, cannot build path to update task.", { taskId, sectionId });
    }
    const taskPath = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${sectionId}/tasks/${taskId}`;
    try {
        await updateDoc(doc(db, taskPath), propertiesToUpdate);
        console.log(`Task ${taskId} in section ${sectionId} updated successfully.`);
    } catch (error) {
        console.error(`Error updating task ${taskId}:`, error);
    }
}

/**
 * Creates a new task document in Firestore within a specific section.
 * It automatically generates a unique ID and saves it as an 'id' field
 * within the document itself, which is essential for queries.
 *
 * @param {string} sectionId - The ID of the section to add the task to.
 * @param {object} taskData - An object containing the initial data for the task (e.g., { name: 'My new task' }).
 */
async function addTaskToFirebase(sectionId, taskData) {
    // 1. Ensure we have the necessary context to build the path.
    if (!currentUserId || !currentWorkspaceId || !currentProjectId) {
        return console.error("Cannot add task: Missing current user, workspace, or project ID.");
    }
    const tasksPath = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${sectionId}/tasks`;
    
    try {
        // --- MODIFICATION START ---
        
        // 2. Instead of addDoc, first create a reference to a new, empty document.
        // This generates the unique ID for us *before* we save any data.
        const newTaskRef = doc(collection(db, tasksPath));
        
        // 3. Prepare the complete data object, including the new ID.
        const fullTaskData = {
            ...taskData,
            id: newTaskRef.id, // <-- Here is the new document's ID
            projectId: currentProjectId,
            userId: currentUserId,
            sectionId: sectionId,
            createdAt: serverTimestamp()
            // Add any other default fields here (e.g., status: 'To Do', assignees: [])
        };
        
        // 4. Use setDoc() to save the document with the complete data to the exact reference we created.
        await setDoc(newTaskRef, fullTaskData);
        
        console.log("Successfully added task with ID: ", newTaskRef.id);
        
        // --- MODIFICATION END ---
        
    } catch (error) {
        console.error("Error adding task:", error);
    }
}

/**
 * Creates a new section document in a project's subcollection.
 * @param {object} sectionData The data for the new section (e.g., {title, order}).
 */
async function addSectionToFirebase() {
    if (!currentUserId || !currentWorkspaceId || !currentProjectId) return console.error("Missing IDs.");
    const sectionsPath = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections`;
    const newOrder = project.sections ? project.sections.length : 0;
    try {
        await addDoc(collection(db, sectionsPath), {
            title: 'New Section',
            isCollapsed: false,
            order: newOrder
        });
    } catch (error) {
        console.error("Error adding section:", error);
    }
}

/**
 * Updates a section document in Firestore.
 * @param {string} sectionId The ID of the section to update.
 * @param {object} propertiesToUpdate An object with the fields to update.
 */
async function updateSectionInFirebase(sectionId, propertiesToUpdate) {
    if (!currentUserId || !currentWorkspaceId || !currentProjectId) return console.error("Missing IDs.");
    const sectionPath = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${sectionId}`;
    try {
        await updateDoc(doc(db, sectionPath), propertiesToUpdate);
    } catch (error) {
        console.error(`Error updating section ${sectionId}:`, error);
    }
}

/**
 * Updates the project document, typically for managing custom columns.
 * @param {object} propertiesToUpdate An object with fields to update on the project.
 */
async function updateProjectInFirebase(propertiesToUpdate) {
    if (!currentUserId || !currentWorkspaceId || !currentProjectId) {
        return console.error("Cannot update project: Missing IDs.");
    }
    
    // FIX: Build the full, nested path to the project document.
    const projectPath = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}`;
    const projectRef = doc(db, projectPath);
    
    try {
        await updateDoc(projectRef, propertiesToUpdate);
    } catch (error) {
        console.error("Error updating project properties:", error);
        alert("Error: Could not update project settings.");
    }
}

/**
 * Displays a non-blocking confirmation modal and returns a promise that resolves
 * to true if "Confirm" is clicked, and false otherwise.
 * @param {string} message The message to display in the dialog.
 * @returns {Promise<boolean>}
 */
function showConfirmationModal(message) {
    // Ensure no other dialogs are open
    closeFloatingPanels();
    return new Promise((resolve) => {
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay'; // Use existing class for styling
        
        dialogOverlay.innerHTML = `
        <div class="dialog-box" style="width: 400px;">
            <div class="dialog-body" style="padding: 2rem; font-size: 1.1rem; text-align: center;">
                ${message}
            </div>
            <div class="dialog-footer">
                <button class="dialog-button" id="modal-cancel-btn">Cancel</button>
                <button class="dialog-button primary" id="modal-confirm-btn">Confirm</button>
            </div>
        </div>`;
        
        document.body.appendChild(dialogOverlay);
        
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        
        const close = (result) => {
            dialogOverlay.remove();
            resolve(result);
        };
        
        confirmBtn.addEventListener('click', () => close(true));
        cancelBtn.addEventListener('click', () => close(false));
        dialogOverlay.addEventListener('click', (e) => {
            if (e.target === dialogOverlay) {
                close(false);
            }
        });
    });
}

/**
 * Deletes a custom column and all its corresponding data across all tasks in the project.
 * Uses a more specific query to ensure user has permission to delete.
 * @param {string} columnId The ID of the column to delete.
 */
async function deleteColumnInFirebase(columnId) {
    if (!currentUserId || !currentWorkspaceId || !currentProjectId) {
        return console.error("Cannot delete column: Missing IDs.");
    }
    
    // Use the new, non-blocking confirmation modal
    const confirmed = await showConfirmationModal(
        'Are you sure you want to delete this column and all its data? This action cannot be undone.'
    );
    if (!confirmed) {
        return;
    }
    
    const batch = writeBatch(db);
    
    // 1. Update the project document to remove the column from the array
    const projectPath = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}`;
    const projectRef = doc(db, projectPath);
    const newColumnsArray = project.customColumns.filter(col => col.id != columnId);
    batch.update(projectRef, { customColumns: newColumnsArray });
    
    // 2. Query for ONLY the tasks the current user owns within the project
    const tasksQuery = query(
        collectionGroup(db, "tasks"),
        where("projectId", "==", currentProjectId),
        where("userId", "==", currentUserId) // <-- THE CRUCIAL FIX
    );
    
    try {
        const tasksSnapshot = await getDocs(tasksQuery);
        
        tasksSnapshot.forEach(taskDoc => {
            // 3. Queue an update for each task to remove the custom field
            batch.update(taskDoc.ref, {
                [`customFields.${columnId}`]: deleteField()
            });
        });
        
        // 4. Commit all the changes at once
        await batch.commit();
        console.log("Column and its data were deleted successfully.");
        
    } catch (error) {
        console.error("Error deleting column and its data:", error);
        alert("Error: Could not completely delete the column. Check console for details.");
    }
}

async function handleTaskCompletion(taskId, taskRowEl) {
    if (!taskRowEl) return;
    
    const { task, section: sourceSection } = findTaskAndSection(taskId);
    
    // Exit if the task or its section can't be found in the local data
    if (!task || !sourceSection) {
        console.error("Could not find task or section to update completion status.");
        return;
    }
    
    // --- MODIFICATION STARTS HERE ---
    // Check the current status of the task to determine whether to check or uncheck it.
    if (task.status === 'Completed') {
        // --- HANDLE UNCHECKING ---
        // If the task is already completed, revert its status and appearance.
        taskRowEl.classList.remove('is-completed');
        // Update status in Firebase back to a default state like 'On track'.
        // The task will remain in its current section.
        updateTaskInFirebase(taskId, sourceSection.id, { status: 'On track' });
        
    } else {
        // --- HANDLE CHECKING (Original Logic) ---
        // If the task is not completed, proceed with marking it as complete.
        taskRowEl.classList.add('is-completed');
        
        setTimeout(async () => {
            const completedSection = project.sections.find(s => s.title.toLowerCase() === 'completed');
            
            // Check if a dedicated 'Completed' section exists and if the task is not already in it.
            if (completedSection && completedSection.id !== sourceSection.id) {
                // First, update the status to 'Completed'.
                await updateTaskInFirebase(taskId, sourceSection.id, { status: 'Completed' });
                // Then, move the task to the 'Completed' section.
                await moveTaskToSection(taskId, completedSection.id);
            } else {
                // If no 'Completed' section exists (or the task is already in it), just update the status.
                updateTaskInFirebase(taskId, sourceSection.id, { status: 'Completed' });
            }
        }, 400);
    }
}

function addNewTask(section) {
    const tempId = `temp_${Date.now()}`;
    const newTask = {
        id: tempId,
        name: '',
        isNew: true,
        dueDate: '',
        priority: 'Low',
        status: 'On track',
        assignees: [],
        customFields: {},
        order: section.tasks.length
    };
    
    section.tasks.push(newTask);
    taskIdToFocus = tempId;
    
    if (section.isCollapsed) {
        section.isCollapsed = false;
    }
    
    render();
}


function createTag(text, type, pClass) {
    return `<div class="${type}-tag ${pClass}">${text}</div>`;
}

function createPriorityTag(p) {
    if (priorityOptions.includes(p)) {
        return createTag(p, 'priority', `priority-${p}`);
    }
    if (project.customPriorities) {
        const customPriority = project.customPriorities.find(cp => cp.name === p);
        if (customPriority) {
            const sanitizedName = p.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
            const className = `priority-${sanitizedName}`;
            return createTag(p, 'priority', className);
        }
    }
    return '';
}

function createStatusTag(s) {
    // If the status is not a string, return nothing.
    if (typeof s !== 'string' || !s) {
        return '';
    }
    
    // Sanitize the string once to create a valid CSS class name.
    // This replaces spaces with dashes and removes any non-alphanumeric characters (except dashes).
    const sanitizedName = s.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    const className = `status-${sanitizedName}`;
    
    // Check if it's a known default or custom status, then create the tag.
    if (statusOptions.includes(s)) {
        return createTag(s, 'status', className);
    }
    
    if (project.customStatuses) {
        const customStatus = project.customStatuses.find(cs => cs.name === s);
        if (customStatus) {
            return createTag(s, 'status', className);
        }
    }
    
    // If the status is not found, return an empty string.
    return '';
}

/**
 * Creates dropdowns, updated to display color swatches and an edit button for editable options.
 */
function createDropdown(options, targetEl, callback, optionType = null, columnId = null) {
    if (!targetEl) return console.error("createDropdown was called with a null target element.");
    closeFloatingPanels();
    
    const wrapperRect = mainContainer.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'context-dropdown';
    dropdown.style.top = `${targetRect.bottom - wrapperRect.top}px`;
    dropdown.style.left = `${targetRect.left - wrapperRect.left}px`;
    
    const isEditable = optionType === 'Priority' || optionType === 'Status' || optionType === 'CustomColumn';
    
    options.forEach(option => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        
        let itemHTML = '';
        if (option.color) {
            itemHTML += `<span class="dropdown-color-swatch" style="background-color: ${option.color};"></span>`;
        } else {
            // Use a placeholder for items without color (like 'Delete column') to maintain alignment
            itemHTML += `<span class="dropdown-color-swatch-placeholder"></span>`;
        }
        itemHTML += `<span class="dropdown-item-name">${option.name}</span>`;
        item.innerHTML = itemHTML;
        
        item.addEventListener('click', (e) => {
            // Prevent the dropdown from closing if the edit button was clicked
            if (e.target.closest('.dropdown-item-edit-btn')) return;
            callback(option);
        });
        
        // Add an EDIT button if the option type is editable (Priority, Status, etc.)
        if (isEditable && option.name) { // Ensure we don't add edit to "Delete Column" etc.
            const editBtn = document.createElement('button');
            editBtn.className = 'dropdown-item-edit-btn';
            editBtn.innerHTML = `<i class="fas fa-pencil-alt fa-xs"></i>`;
            editBtn.title = 'Edit Option';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditOptionDialog(optionType, option, columnId);
            });
            item.appendChild(editBtn);
        }
        
        dropdown.appendChild(item);
    });
    
    // --- "Add New..." and Separator Logic (remains the same) ---
    if (optionType) {
        const separator = document.createElement('hr');
        separator.className = 'dropdown-separator';
        dropdown.appendChild(separator);
        
        const addNewItem = document.createElement('div');
        addNewItem.className = 'dropdown-item';
        // The new CSS flex rules will automatically align this correctly
        addNewItem.innerHTML = `<span class="dropdown-color-swatch-placeholder"><i class="fas fa-plus"></i></span><span>Add New...</span>`;
        
        if (optionType === 'CustomColumn') {
            addNewItem.addEventListener('click', () => openCustomColumnOptionDialog(columnId));
        } else if (optionType === 'Priority' || optionType === 'Status') {
            addNewItem.addEventListener('click', () => openCustomOptionDialog(optionType));
        }
        dropdown.appendChild(addNewItem);
    }
    
    mainContainer.appendChild(dropdown);
}

function showAssigneeDropdown(targetEl, taskId) {
    closeFloatingPanels();
    
    // We need the section context for updating.
    const { task, section } = findTaskAndSection(taskId);
    if (!task || !section) return; // Exit if task or section not found.
    
    // Clone the dropdown structure from the HTML template
    const dropdownFragment = assigneeDropdownTemplate.content.cloneNode(true);
    const dropdown = dropdownFragment.querySelector('.context-dropdown');
    
    const searchInput = dropdown.querySelector('.dropdown-search-input');
    const listContainer = dropdown.querySelector('.dropdown-list');
    
    // Position the dropdown panel below the clicked element
    const wrapperRect = mainContainer.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    dropdown.style.top = `${targetRect.bottom - wrapperRect.top}px`;
    dropdown.style.left = `${targetRect.left - wrapperRect.left}px`;
    
    const renderList = (searchTerm = '') => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const filteredUsers = allUsers.filter(user => user.name.toLowerCase().includes(lowerCaseSearchTerm));
        
        listContainer.innerHTML = ''; // Clear previous results
        
        filteredUsers.forEach(user => {
            const isAssigned = task.assignees[0] === user.id;
            
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.innerHTML = `
              <div class="user-info">
                  <div class="profile-picture" style="background-image: url(${user.avatar})"></div>
                      <span>${user.name}</span>
                  </div>
                  ${isAssigned ? '<i class="fas fa-check assigned-check"></i>' : ''}
              `;
            
            item.addEventListener('click', () => {
                const newAssignees = isAssigned ? [] : [user.id];
                // FIX: Pass the correct section.id to the update function.
                updateTask(taskId, section.id, { assignees: newAssignees });
                // The onSnapshot listener will handle the re-render which closes the panel.
            });
            listContainer.appendChild(item);
        });
    };
    
    // Render the initial list of users
    renderList();
    
    // Add an event listener for the search input
    searchInput.addEventListener('input', () => {
        renderList(searchInput.value);
    });
    
    // FIX: The stray, incorrect updateTask() call has been removed from here.
    
    mainContainer.appendChild(dropdown);
    searchInput.focus();
}

function showDatePicker(targetEl, sectionId, taskId) {
    closeFloatingPanels();
    const wrapperRect = mainContainer.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const dropdownPanel = document.createElement('div');
    dropdownPanel.className = 'context-dropdown';
    dropdownPanel.style.padding = '0';
    dropdownPanel.style.top = `${targetRect.bottom - wrapperRect.top}px`;
    dropdownPanel.style.left = `${targetRect.left - wrapperRect.left}px`;
    const datepickerContainer = document.createElement('div');
    dropdownPanel.appendChild(datepickerContainer);
    mainContainer.appendChild(dropdownPanel);
    
    const datepicker = new Datepicker(datepickerContainer, {
        autohide: true,
        format: 'yyyy-mm-dd',
        todayHighlight: true,
    });
    
    const { task } = findTaskAndSection(taskId);
    if (task && task.dueDate) {
        datepicker.setDate(task.dueDate);
    }
    
    datepickerContainer.addEventListener('changeDate', (e) => {
        const formattedDate = Datepicker.formatDate(e.detail.date, 'yyyy-mm-dd');
        updateTask(taskId, sectionId, { dueDate: formattedDate }); // Pass sectionId here
        
        
        closeFloatingPanels();
    }, { once: true });
}

function createAssigneeHTML(assignees) {
    // If no one is assigned, show the 'add' button.
    if (!assignees || assignees.length === 0) {
        return `<div class="add-assignee-btn" data-control="assignee"><i class="fas fa-plus"></i></div>`;
    }
    
    // Since we only have one assignee, get the first ID.
    const assigneeId = assignees[0];
    const user = allUsers.find(u => u.id === assigneeId);
    
    if (!user) {
        // Fallback in case user is not found
        return `<div class="add-assignee-btn" data-control="assignee"><i class="fas fa-plus"></i></div>`;
    }
    
    return `
        <div class="assignee-cell-content" data-control="assignee">
            <img class="profile-picture" src="${user.avatar}" title="${user.name}">
            <div class="assignee-details">
                <span class="assignee-name">${user.name}</span>
            </div>
            <button class="remove-assignee-btn" data-control="remove-assignee" title="Remove Assignee">&times;</button>
        </div>
    `;
}

function syncScroll(scrollStates = new Map()) {
    const scrollWrappers = document.querySelectorAll('.scrollable-columns-wrapper');
    let isScrolling = false;
    const onScroll = (e) => {
        if (!isScrolling) {
            window.requestAnimationFrame(() => {
                scrollWrappers.forEach(other => {
                    if (other !== e.target) {
                        other.scrollLeft = e.target.scrollLeft;
                    }
                });
                isScrolling = false;
            });
        }
        isScrolling = true;
    };
    scrollWrappers.forEach((wrapper, i) => {
        if (scrollStates.has(i)) wrapper.scrollLeft = scrollStates.get(i);
        wrapper.addEventListener('scroll', onScroll);
    });
}

function addNewColumn(config) {
    const newColumn = {
        id: Date.now(),
        name: config.name,
        type: config.type,
        currency: config.currency || null,
        aggregation: (config.type === 'Costing' || config.type === 'Numbers') ? 'Sum' : null,
        // FIX: The options are now correctly assigned as an array of objects.
        // When type is 'Type', assign the array. For all other types that need options, start with an empty array.
        options: (config.type === 'Type' || config.type === 'Custom') ? (config.type === 'Type' ? typeColumnOptions : []) : null
    };
    
    updateProjectInFirebase({
        customColumns: arrayUnion(newColumn)
    });
}

function deleteColumn(columnId) {
    // The confirmation dialog is now inside the Firebase function
    deleteColumnInFirebase(columnId);
}

function openAddColumnDialog(columnType) {
    if (columnType === 'Custom') {
        openCustomColumnCreatorDialog();
        return;
    }
    
    closeFloatingPanels();
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'dialog-overlay';
    
    let previewHTML = '';
    if (columnType === 'Costing') {
        previewHTML = `<div class="preview-value">$1,234.56</div><p>Formatted as currency. The sum will be shown in the footer.</p>`;
    } else if (columnType === 'Numbers') {
        previewHTML = `<div class="preview-value">1,234.56</div><p>For tracking quantities. The sum will be shown in the footer.</p>`;
    } else {
        previewHTML = `<div class="preview-value">Any text value</div><p>For notes or labels.</p>`;
    }
    
    let typeSpecificFields = '';
    if (columnType === 'Costing') {
        typeSpecificFields = `<div class="form-group"><label>Currency</label><select id="column-currency"><option value="$">USD ($)</option><option value="₱">PHP (©)</option><option value="$">AUD ($)</option></select></div>`;
    }
    
    dialogOverlay.innerHTML = `
<div class="dialog-box">
<div class="dialog-header">Add "${columnType}" Column</div>
<div class="dialog-body">
<div class="form-group"><label for="column-name">Column Name</label><input type="text" id="column-name" placeholder="e.g., Budget"></div>
${typeSpecificFields}
<div class="dialog-preview-box">${previewHTML}</div>
</div>
<div class="dialog-footer">
<button class="dialog-button" id="cancel-add-column">Cancel</button>
<button class="dialog-button primary" id="confirm-add-column">Add Column</button>
</div>
</div>`;
    
    document.body.appendChild(dialogOverlay);
    document.getElementById('column-name').focus();
    
    document.getElementById('confirm-add-column').addEventListener('click', () => {
        const config = {
            name: document.getElementById('column-name').value,
            type: columnType,
            currency: document.getElementById('column-currency')?.value
        };
        if (!config.name) { alert('Please enter a column name.'); return; }
        addNewColumn(config);
        closeFloatingPanels();
    });
    dialogOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) closeFloatingPanels(); });
}

function openCustomColumnCreatorDialog() {
    closeFloatingPanels();
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'dialog-overlay';
    
    const baseTypeOptionsHTML = baseColumnTypes.map(type => `<option value="${type}">${type}</option>`).join('');
    
    dialogOverlay.innerHTML = `
<div class="dialog-box">
<div class="dialog-header">Create Custom Column</div>
<div class="dialog-body">
<div class="form-group">
<label for="column-name">Column Name</label>
<input type="text" id="column-name" placeholder="e.g., T-Shirt Size">
</div>
<div class="form-group">
<label for="base-column-type">Select Data Type</label>
<select id="base-column-type">${baseTypeOptionsHTML}</select>
</div>
<div id="type-specific-options-custom"></div>
</div>
<div class="dialog-footer">
<button class="dialog-button" id="cancel-add-column">Cancel</button>
<button class="dialog-button primary" id="confirm-add-column">Add Column</button>
</div>
</div>`;
    
    document.body.appendChild(dialogOverlay);
    const baseTypeSelect = document.getElementById('base-column-type');
    const specificOptionsContainer = document.getElementById('type-specific-options-custom');
    
    const renderTypeSpecificOptions = (selectedType) => {
        let extraFields = '';
        if (selectedType === 'Costing') {
            extraFields = `<div class="form-group"><label>Currency</label><select id="column-currency"><option value="$">USD ($)</option><option value="€">EUR (€)</option></select></div>`;
        }
        specificOptionsContainer.innerHTML = extraFields;
    };
    
    baseTypeSelect.addEventListener('change', () => renderTypeSpecificOptions(baseTypeSelect.value));
    renderTypeSpecificOptions(baseTypeSelect.value);
    
    document.getElementById('confirm-add-column').addEventListener('click', () => {
        const config = {
            name: document.getElementById('column-name').value,
            type: baseTypeSelect.value,
            currency: document.getElementById('column-currency')?.value
        };
        if (!config.name) { alert('Please enter a column name.'); return; }
        addNewColumn(config);
        closeFloatingPanels();
    });
    
    dialogOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) closeFloatingPanels(); });
}

/**
 * Opens a dialog for creating a new custom dropdown option (Priority or Status).
 * This function handles the UI part.
 */
function openCustomOptionDialog(optionType) {
    closeFloatingPanels();
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'dialog-overlay';
    
    dialogOverlay.innerHTML = `
<div class="dialog-box">
    <div class="dialog-header">Add Custom ${optionType}</div>
    <div class="dialog-body">
        <div class="form-group">
            <label for="custom-option-name">Option Name</label>
            <input type="text" id="custom-option-name" placeholder="e.g., Blocked">
        </div>
        <div class="form-group">
            <label for="custom-option-color">Color</label>
            <input type="color" id="custom-option-color" value="#4a90e2">
        </div>
    </div>
    <div class="dialog-footer">
        <button class="dialog-button" id="cancel-add-option">Cancel</button>
        <button class="dialog-button primary" id="confirm-add-option">Add Option</button>
    </div>
</div>`;
    
    document.body.appendChild(dialogOverlay);
    document.getElementById('custom-option-name').focus();
    
    document.getElementById('confirm-add-option').addEventListener('click', () => {
        const name = document.getElementById('custom-option-name').value.trim();
        const color = document.getElementById('custom-option-color').value;
        if (name) {
            addNewCustomOption(optionType, { name, color });
            closeFloatingPanels();
        } else {
            alert('Please enter a name for the option.');
        }
    });
    
    dialogOverlay.addEventListener('click', e => {
        if (e.target === e.currentTarget || e.target.id === 'cancel-add-option') {
            closeFloatingPanels();
        }
    });
}

/**
 * Writes the new custom Priority or Status option to Firebase.
 * @param {string} optionType - 'Priority' or 'Status'.
 * @param {object} newOption - The new option object { name, color }.
 */
function addNewCustomOption(optionType, newOption) {
    const fieldToUpdate = optionType === 'Priority' ? 'customPriorities' : 'customStatuses';
    updateProjectInFirebase({
        [fieldToUpdate]: arrayUnion(newOption)
    });
}

/**
 * Opens a dialog to add a new option to a specific custom column.
 * This function handles the UI part.
 */
function openCustomColumnOptionDialog(columnId) {
    if (!columnId) return;
    closeFloatingPanels();
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'dialog-overlay';
    
    dialogOverlay.innerHTML = `
<div class="dialog-box">
    <div class="dialog-header">Add New Option</div>
    <div class="dialog-body">
        <div class="form-group">
            <label for="custom-option-name">Option Name</label>
            <input type="text" id="custom-option-name" placeholder="e.g., Pending Review">
        </div>
        <div class="form-group">
            <label for="custom-option-color">Color</label>
            <input type="color" id="custom-option-color" value="#87ceeb">
        </div>
    </div>
    <div class="dialog-footer">
        <button class="dialog-button" id="cancel-add-option">Cancel</button>
        <button class="dialog-button primary" id="confirm-add-option">Add Option</button>
    </div>
</div>`;
    
    document.body.appendChild(dialogOverlay);
    document.getElementById('custom-option-name').focus();
    
    document.getElementById('confirm-add-option').addEventListener('click', () => {
        const name = document.getElementById('custom-option-name').value.trim();
        const color = document.getElementById('custom-option-color').value;
        if (name) {
            addNewCustomColumnOption(columnId, { name, color });
            closeFloatingPanels();
        } else {
            alert('Please enter a name for the option.');
        }
    });
    
    dialogOverlay.addEventListener('click', e => {
        if (e.target === e.currentTarget || e.target.id === 'cancel-add-option') {
            closeFloatingPanels();
        }
    });
}

/**
 * Writes a new option to a specific custom column's 'options' array in Firebase.
 * @param {number} columnId - The ID of the column being updated.
 * @param {object} newOption - The new option object { name, color }.
 */
async function addNewCustomColumnOption(columnId, newOption) {
    const newColumns = project.customColumns.map(col => {
        if (col.id === columnId) {
            const updatedOptions = col.options ? [...col.options, newOption] : [newOption];
            return { ...col, options: updatedOptions };
        }
        return col;
    });
    updateProjectInFirebase({
        customColumns: newColumns
    });
}

/**
 * Creates a <style> tag in the head to hold dynamic CSS rules for all custom tags.
 */
/**
 * Creates a <style> tag in the head to hold dynamic CSS rules for all custom tags.
 */
function generateCustomTagStyles(projectData) {
    const styleId = 'custom-tag-styles';
    let styleElement = document.getElementById(styleId);
    
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }
    
    let cssRules = '';
    
    const generateRules = (items, prefix) => {
        if (!items) return;
        
        // This loop is where the error occurs
        items.forEach(item => {
            // --- FIX STARTS HERE ---
            // Add a check to ensure the 'item' is an object and has a 'name' property
            if (item && typeof item.name === 'string') {
                const sanitizedName = item.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
                const className = `${prefix}-${sanitizedName}`;
                // Use a default color if item.color is missing
                const bgColor = item.color || '#e0e0e0';
                const color = getContrastYIQ(bgColor);
                cssRules += `.${className} { background-color: ${bgColor}; color: ${color}; }\n`;
            }
            // --- FIX ENDS HERE ---
        });
    };
    
    generateRules(projectData.customPriorities, 'priority');
    generateRules(projectData.customStatuses, 'status');
    
    if (projectData.customColumns) {
        projectData.customColumns.forEach(col => {
            if (col.options && Array.isArray(col.options)) {
                const prefix = `custom-col-${col.id}`;
                generateRules(col.options, prefix);
            }
        });
    }
    styleElement.innerHTML = cssRules;
}

/**
 * Determines if text on a colored background should be black or white for readability.
 */
function getContrastYIQ(hexcolor) {
    hexcolor = hexcolor.replace("#", "");
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

/**
 * Opens a dialog to edit an existing custom option (Priority, Status, or Custom Column option).
 * @param {string} optionType - 'Priority', 'Status', or 'CustomColumn'.
 * @param {object} originalOption - The option object being edited { name, color }.
 * @param {number|null} columnId - The ID of the column if editing a column option.
 */
function openEditOptionDialog(optionType, originalOption, columnId = null) {
    closeFloatingPanels();
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'dialog-overlay';
    
    // --- FIX STARTS HERE ---
    // Determine the correct dialog title based on the option type.
    let dialogTitle = `Edit ${optionType} Option`; // Default title
    
    if (optionType === 'CustomColumn' && columnId) {
        // Find the custom column by its ID in our project data
        const column = project.customColumns.find(c => c.id === columnId);
        if (column) {
            // If found, use its specific name for the dialog title
            dialogTitle = `Edit ${column.name} Option`;
        }
    }
    // --- FIX ENDS HERE ---
    
    dialogOverlay.innerHTML = `
    <div class="dialog-box">
        <div class="dialog-header">${dialogTitle}</div>
        <div class="dialog-body">
            <div class="form-group">
                <label for="edit-option-name">Option Name</label>
                <input type="text" id="edit-option-name" value="${originalOption.name}">
            </div>
            <div class="form-group">
                <label for="edit-option-color">Color</label>
                <input type="color" id="edit-option-color" value="${originalOption.color}">
            </div>
        </div>
        <div class="dialog-footer">
            <button class="dialog-button" id="cancel-edit-option">Cancel</button>
            <button class="dialog-button primary" id="confirm-edit-option">Save Changes</button>
        </div>
    </div>`;
    
    document.body.appendChild(dialogOverlay);
    const nameInput = document.getElementById('edit-option-name');
    nameInput.focus();
    
    document.getElementById('confirm-edit-option').addEventListener('click', () => {
        const newOption = {
            name: document.getElementById('edit-option-name').value.trim(),
            color: document.getElementById('edit-option-color').value
        };
        if (newOption.name) {
            updateCustomOptionInFirebase(optionType, originalOption, newOption, columnId);
            closeFloatingPanels();
        } else {
            // Replaced alert with our custom modal for consistency
            showConfirmationModal('Please enter a name for the option.');
        }
    });
    
    dialogOverlay.addEventListener('click', e => {
        if (e.target === e.currentTarget || e.target.id === 'cancel-edit-option') {
            closeFloatingPanels();
        }
    });
}

/**
 * Updates a specific option within a project's array field (e.g., customPriorities) in Firestore.
 * @param {string} optionType - 'Priority', 'Status', or 'CustomColumn'.
 * @param {object} originalOption - The original option object to find and replace.
 * @param {object} newOption - The new option object to insert.
 * @param {number|null} columnId - The ID of the column if updating a column option.
 */
async function updateCustomOptionInFirebase(optionType, originalOption, newOption, columnId = null) {
    // Create a deep copy of the custom fields to safely modify them
    const projectCopy = JSON.parse(JSON.stringify(project));
    let fieldToUpdate = null;
    let newArray = [];
    
    if (optionType === 'Priority') {
        fieldToUpdate = 'customPriorities';
        newArray = projectCopy.customPriorities || [];
    } else if (optionType === 'Status') {
        fieldToUpdate = 'customStatuses';
        newArray = projectCopy.customStatuses || [];
    } else if (optionType === 'CustomColumn' && columnId) {
        fieldToUpdate = 'customColumns';
        const column = projectCopy.customColumns.find(c => c.id === columnId);
        if (column && column.options) {
            const optionIndex = column.options.findIndex(opt => opt.name === originalOption.name && opt.color === originalOption.color);
            if (optionIndex > -1) {
                column.options[optionIndex] = newOption;
            }
        }
        newArray = projectCopy.customColumns;
    }
    
    // For non-column options, find and replace the option in the array
    if (optionType === 'Priority' || optionType === 'Status') {
        const optionIndex = newArray.findIndex(opt => opt.name === originalOption.name && opt.color === originalOption.color);
        if (optionIndex > -1) {
            newArray[optionIndex] = newOption;
        }
    }
    
    if (fieldToUpdate) {
        // Update the entire array in Firestore
        await updateProjectInFirebase({
            [fieldToUpdate]: newArray
        });
    }
}

async function expandCollapsedSection(sectionId) {
    console.log(`🚀 Expanding section ${sectionId}...`);
    const sectionWrapper = document.querySelector(`.section-wrapper[data-section-id="${sectionId}"]`);
    const sectionHeaderRow = document.querySelector(`.section-row-wrapper[data-section-id="${sectionId}"]`);
    const chevron = sectionHeaderRow ? sectionHeaderRow.querySelector('.section-toggle') : null;
    
    if (!sectionWrapper || !chevron || !chevron.classList.contains('fa-chevron-right')) {
        // Section not found, not collapsed, or already expanding
        return;
    }
    
    // --- 1. Update the UI immediately for responsiveness ---
    chevron.classList.replace('fa-chevron-right', 'fa-chevron-down');
    
    // --- 2. Find the section and its tasks from your local data source ---
    // NOTE: This assumes 'currentProject' holds your full project data.
    const sectionData = currentProject.sections.find(s => s.id === sectionId);
    if (!sectionData || !sectionData.tasks) return;
    
    // --- 3. Render the task rows ---
    const customColumns = currentProject.customColumns || [];
    const addTaskRow = sectionWrapper.querySelector('.add-task-row-wrapper');
    
    sectionData.tasks.forEach(task => {
        const taskRow = createTaskRow(task, customColumns);
        // Insert each task before the "Add Task" button
        sectionWrapper.insertBefore(taskRow, addTaskRow);
    });
    
    // --- 4. Update Firestore in the background ---
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated.");
        
        const basePath = await _getSelectedProjectPath(db, user.uid);
        const sectionRef = doc(db, `${basePath}/sections/${sectionId}`);
        await updateDoc(sectionRef, { isCollapsed: false });
        console.log(`✅ Section ${sectionId} marked as expanded in Firestore.`);
        
        // Also update our local state
        sectionData.isCollapsed = false;
        
    } catch (error) {
        console.error("❌ Error updating section collapse state:", error);
        // Optional: Revert UI changes if Firestore update fails
        chevron.classList.replace('fa-chevron-down', 'fa-chevron-right');
    }
}

function getPointerCoordinates(e) {
    if (e.touches && e.touches.length > 0) {
        // For touchstart and touchmove
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        // For touchend
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    // For mouse events
    return { x: e.clientX, y: e.clientY };
}

function initializeDragAndDrop(container) {
    // Listen for the mouse down to START the drag
    container.addEventListener('mousedown', handleDragStart);
    // Listen for the touch start to START the drag
    // { passive: false } is crucial to allow e.preventDefault()
    container.addEventListener('touchstart', handleDragStart, { passive: false });
}

function handleDragStart(e) {
    const dragHandle = e.target.closest('.drag-handle');
    if (!dragHandle) return;
    
    // Prevent default behavior (e.g., text selection on mouse, page scroll on touch)
    e.preventDefault();
    
    const parentRow = dragHandle.closest('.grid-row-wrapper');
    if (!parentRow) return;
    
    if (parentRow.matches('.section-row-wrapper')) {
        draggedElement = parentRow.closest('.section-wrapper');
    } else {
        draggedElement = parentRow;
    }
    
    if (!draggedElement) return;
    
    sourceContainer = draggedElement.parentNode;
    dragHasMoved = false;
    
    placeholder = document.createElement('div');
    placeholder.classList.add('drag-placeholder-ghost');
    const draggedHeight = draggedElement.getBoundingClientRect().height;
    placeholder.style.height = `${draggedHeight}px`;
    
    draggedElement.parentNode.insertBefore(placeholder, draggedElement);
    placeholder.style.display = 'none';
    
    setTimeout(() => {
        if (draggedElement) {
            draggedElement.classList.add('dragging');
        }
    }, 0);
    
    document.body.classList.add('is-dragging');
    
    // --- Attach follow-up events for BOTH mouse and touch ---
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    
    document.addEventListener('mouseup', handleDragEnd, { once: true });
    document.addEventListener('touchend', handleDragEnd, { once: true });
}

/**
 * Tracks mouse/touch movement and repositions the placeholder accordingly.
 *
 * REFACTORED FOR PRECISION: This version decouples the drop target from
 * the drop zone rectangle for more intuitive positioning, especially when
 * dragging sections over other tall, expanded sections.
 */
function handleDragMove(e) {
    if (!draggedElement) return;
    
    // (Code from previous steps remains the same...)
    if (e.type === 'touchmove') e.preventDefault();
    if (!dragHasMoved) {
        dragHasMoved = true;
        if (placeholder) placeholder.style.display = '';
    }
    const coords = getPointerCoordinates(e);
    placeholder.style.display = 'none';
    const elementOver = document.elementFromPoint(coords.x, coords.y);
    placeholder.style.display = '';
    if (!elementOver) return;
    
    // =================================================================
    // ▼ NEW: AUTO-EXPAND LOGIC ▼
    // =================================================================
    const isDraggingTask = draggedElement.matches('.task-row-wrapper');
    
    // Find if the cursor is over any section header
    const hoveredSectionHeader = elementOver.closest('.section-row-wrapper');
    
    if (isDraggingTask && hoveredSectionHeader) {
        const hoveredSectionId = hoveredSectionHeader.dataset.sectionId;
        const isCollapsed = hoveredSectionHeader.querySelector('.fa-chevron-right');
        
        // If we are over a *new* collapsed section, start a timer to expand it.
        if (isCollapsed && hoveredSectionId !== lastHoveredSectionId) {
            lastHoveredSectionId = hoveredSectionId;
            // Clear any old timer and start a new one
            clearTimeout(expansionTimeout);
            expansionTimeout = setTimeout(() => {
                expandCollapsedSection(hoveredSectionId);
            }, 600); // 600ms delay
        }
    } else {
        // If we are not hovering over a section header, cancel any pending expansion.
        clearTimeout(expansionTimeout);
        lastHoveredSectionId = null;
    }
    // =================================================================
    // ▲ END OF AUTO-EXPAND LOGIC ▲
    // =================================================================
    
    // (The rest of the positioning logic from the previous step remains IDENTICAL)
    let finalTarget = null;
    let dropZoneRect = null;
    const specialRow = elementOver.closest('.section-row-wrapper, .add-task-row-wrapper');
    if (specialRow) {
        finalTarget = specialRow.closest('.section-wrapper');
        dropZoneRect = specialRow.getBoundingClientRect();
    } else {
        finalTarget = elementOver.closest('.task-row-wrapper, .section-wrapper');
        if (finalTarget) {
            dropZoneRect = finalTarget.getBoundingClientRect();
        }
    }
    const isDraggingSection = draggedElement.matches('.section-wrapper');
    if (isDraggingSection && finalTarget && finalTarget.matches('.task-row-wrapper')) {
        finalTarget = finalTarget.closest('.section-wrapper');
        if (finalTarget) {
            dropZoneRect = finalTarget.getBoundingClientRect();
        }
    }
    
    if (finalTarget && dropZoneRect && finalTarget !== draggedElement && !finalTarget.contains(draggedElement)) {
        // Correctly position placeholder at the end of a newly opened section
        const isHoveringOverAddTask = elementOver.closest('.add-task-row-wrapper');
        if (isHoveringOverAddTask) {
            finalTarget.insertBefore(placeholder, isHoveringOverAddTask);
            return; // Exit here to prevent other logic from moving the placeholder
        }
        
        const parent = finalTarget.parentNode;
        const isAfter = coords.y > dropZoneRect.top + dropZoneRect.height / 2;
        if (isAfter) {
            parent.insertBefore(placeholder, finalTarget.nextSibling);
        } else {
            parent.insertBefore(placeholder, finalTarget);
        }
    }
}

async function handleDragEnd(e) {
    if (!dragHasMoved) {
        cleanUpDragState();
        return;
    }
    
    if (!placeholder || !draggedElement || !placeholder.parentNode) {
        cleanUpDragState();
        return;
    }
    
    if (draggedElement === placeholder.parentNode || draggedElement.contains(placeholder.parentNode)) {
        console.warn("⚠️ Invalid drop: cannot drop an element inside itself. Cancelling operation.");
        placeholder.parentNode.removeChild(placeholder);
        cleanUpDragState();
        return;
    }
    
    placeholder.parentNode.replaceChild(draggedElement, placeholder);
    
    // --- Use the helper to get final pointer position ---
    const coords = getPointerCoordinates(e);
    const elementOver = document.elementFromPoint(coords.x, coords.y);
    
    const nextSibling = draggedElement.nextSibling;
    const parentContainer = draggedElement.parentNode;
    let targetElement = elementOver ? elementOver.closest('.grid-row-wrapper, .section-wrapper') : null;
    
    // (Your existing validation logic remains unchanged)
    if (targetElement) {
        if (targetElement.matches('.add-task-row-wrapper')) {
            return;
        }
        const isDraggingSection = draggedElement.matches('.section-wrapper');
        const isTargetATask = targetElement.matches('.grid-row-wrapper[data-task-id]');
        if (isDraggingSection && isTargetATask) {
            targetElement = targetElement.closest('.section-wrapper');
        }
    }
    
    const syntheticEvent = {
        item: draggedElement,
        to: parentContainer,
        from: sourceContainer
    };
    
    const isTask = !!draggedElement.dataset.taskId;
    
    // (Your existing optimistic update logic remains unchanged)
    try {
        if (isTask) {
            console.log("🚀 Syncing task move in the background...");
            await handleTaskMoved(syntheticEvent);
            cleanUpDragState();
            console.log("✅ Task move synced successfully.");
        } else {
            console.log("🚀 Syncing section reorder in the background...");
            await handleSectionReorder(syntheticEvent);
            cleanUpDragState();
            console.log("✅ Section reorder synced successfully.");
        }
    } catch (error) {
        console.error("❌ Firestore update failed:", error);
        console.warn("⏪ Reverting UI due to sync failure.");
        sourceContainer.insertBefore(draggedElement, nextSibling);
    }
}

/**
 * Cleans up all drag-related state and removes event listeners.
 * Now updated to remove touch listeners as well.
 */
function cleanUpDragState() {
    if (draggedElement) {
        draggedElement.classList.remove('dragging', 'drop-animation');
    }
    if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder);
    }
    document.body.classList.remove('is-dragging');
    
    draggedElement = null;
    placeholder = null;
    sourceContainer = null;
    dragHasMoved = false;
    
    // --- Remove ALL potential listeners ---
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('touchmove', handleDragMove);
    // The 'mouseup' and 'touchend' listeners are set with { once: true },
    // so they clean themselves up automatically.
}
/**
 * Modifies the main 'project' object based on the drop action.
 * @param {string} draggedId - The ID of the task or section being moved.
 * @param {boolean} isTask - True if dragging a task, false if a section.
 * @param {string} targetSectionId - The ID of the section where the item was dropped.
 * @param {string | null} targetId - The ID of the item that the dragged item was placed BEFORE.
 */
function updateDataOnDrop(draggedId, isTask, targetSectionId, targetId) {
    let itemToMove;
    let sourceArray;
    let sourceIndex = -1;

    // 1. Find and remove the item from its original location
    if (isTask) {
        for (const section of project.sections) {
            sourceIndex = section.tasks.findIndex(t => t.id === draggedId);
            if (sourceIndex > -1) {
                sourceArray = section.tasks;
                itemToMove = sourceArray.splice(sourceIndex, 1)[0];
                break;
            }
        }
    } else { // It's a section
        sourceArray = project.sections;
        sourceIndex = sourceArray.findIndex(s => s.id === draggedId);
        if (sourceIndex > -1) {
            itemToMove = sourceArray.splice(sourceIndex, 1)[0];
        }
    }

    if (!itemToMove) {
        console.error("Could not find the dragged item in the data source.");
        return;
    }

    // 2. Add the item to its new location
    if (isTask) {
        const targetSection = project.sections.find(s => s.id === targetSectionId);
        if (!targetSection) {
            console.error("Target section not found!");
            // Optional: Re-add item to its original place as a fallback
            sourceArray.splice(sourceIndex, 0, itemToMove);
            return;
        }
        itemToMove.sectionId = targetSectionId; // Update the task's sectionId
        const targetArray = targetSection.tasks;
        if (targetId) {
            const targetIndex = targetArray.findIndex(t => t.id === targetId);
            targetArray.splice(targetIndex, 0, itemToMove);
        } else {
            targetArray.push(itemToMove); // Add to the end of the section
        }
    } else { // It's a section
        const targetArray = project.sections;
        if (targetId) {
            const targetIndex = targetArray.findIndex(s => s.id === targetId);
            targetArray.splice(targetIndex, 0, itemToMove);
        } else {
            targetArray.push(itemToMove); // Add to the end of the project
        }
    }
}