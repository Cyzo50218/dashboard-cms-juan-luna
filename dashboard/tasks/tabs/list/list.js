/*
 * @file list.js
 * @description Controls the List View tab with refined section filtering and date sorting.
 */

/*
 * @file list.js
 * @description Controls the List View tab with real-time data using Firestore snapshots.
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
    deleteDoc,
    writeBatch,
    serverTimestamp,
    deleteField,
    arrayUnion,
    getDocs,
    getDoc
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
const sortableTasks = [];

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

// Initialize safely
let currentlyFocusedSectionId = null;
const priorityOptions = ['High', 'Medium', 'Low'];
const statusOptions = ['On track', 'At risk', 'Off track', 'Completed'];
const columnTypeOptions = ['Text', 'Numbers', 'Costing', 'Type', 'Custom'];
const typeColumnOptions = ['Invoice', 'Payment'];
const baseColumnTypes = ['Text', 'Numbers', 'Costing', 'Type'];


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

function attachRealtimeListeners(userId) {
    detachAllListeners();
    currentUserId = userId;
    console.log(`[DEBUG] Attaching listeners for user: ${userId}`);
    
    const workspaceQuery = query(collection(db, `users/${userId}/myworkspace`), where("isSelected", "==", true));
    activeListeners.workspace = onSnapshot(workspaceQuery, (workspaceSnapshot) => {
        if (workspaceSnapshot.empty) return console.warn("No selected workspace.");
        
        currentWorkspaceId = workspaceSnapshot.docs[0].id;
        console.log(`[DEBUG] Found workspaceId: ${currentWorkspaceId}`);
        
        const projectsPath = `users/${userId}/myworkspace/${currentWorkspaceId}/projects`;
        const projectQuery = query(collection(db, projectsPath), where("isSelected", "==", true));
        
        if (activeListeners.project) activeListeners.project();
        activeListeners.project = onSnapshot(projectQuery, (projectSnapshot) => {
            if (projectSnapshot.empty) return console.warn("No selected project.");
            
            const projectDoc = projectSnapshot.docs[0];
            currentProjectId = projectDoc.id;
            console.log(`[DEBUG] Found projectId: ${currentProjectId}`);
            
            project = { ...project, ...projectDoc.data(), id: currentProjectId };
            
            // 3. Listen to the SECTIONS subcollection
            const sectionsPath = `${projectsPath}/${currentProjectId}/sections`;
            const sectionsQuery = query(collection(db, sectionsPath), orderBy("order"));
            
            if (activeListeners.sections) activeListeners.sections();
            activeListeners.sections = onSnapshot(sectionsQuery, (sectionsSnapshot) => {
                console.log(`[DEBUG] Sections snapshot fired. Found ${sectionsSnapshot.size} sections.`);
                project.sections = sectionsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, tasks: [] }));
                
                // Distribute the tasks we already have into the newly updated sections
                distributeTasksToSections(allTasksFromSnapshot);
                
                // Re-render the UI with the updated sections and their tasks
                render(); // <-- ADD RENDER CALL HERE
            });
            
            // 4. Use a COLLECTION GROUP query to get all tasks
            const tasksGroupQuery = query(
                collectionGroup(db, 'tasks'),
                where('projectId', '==', currentProjectId),
                orderBy('createdAt', 'desc')
            );
            
            if (activeListeners.tasks) activeListeners.tasks();
            activeListeners.tasks = onSnapshot(tasksGroupQuery, (tasksSnapshot) => {
                console.log(`[DEBUG] Tasks CollectionGroup snapshot fired. Found ${tasksSnapshot.size} tasks.`);
                allTasksFromSnapshot = tasksSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                console.log(`[DEBUG] Tasks CollectionGroup snapshot ${allTasksFromSnapshot}.`);
                // Distribute the new tasks into the sections we already have
                distributeTasksToSections(allTasksFromSnapshot);
                
                // Re-render the UI with the tasks distributed into their sections
                render(); // <-- RENDER CALL STAYS HERE
            });
        });
    }, (error) => console.error("[DEBUG] FATAL ERROR in listeners:", error));
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

/**
 * "Debug Mode" version to diagnose task distribution issues.
 * It logs every step of the process to the console.
 */
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
    headerClickListener = (e) => {
        const deleteButton = e.target.closest('.delete-column-btn');
        if (deleteButton) {
            e.stopPropagation();
            const columnEl = deleteButton.closest('[data-column-id]');
            if (columnEl) {
                const columnId = Number(columnEl.dataset.columnId);
                createDropdown(['Delete column'], deleteButton, () => deleteColumn(columnId));
            }
            return;
        }
        
        const addColumnButton = e.target.closest('#add-column-btn');
        if (addColumnButton) {
            e.stopPropagation();
            const existingTypes = new Set(project.customColumns.map(col => col.type));
            const availableTypes = columnTypeOptions.filter(type => !existingTypes.has(type) || type === 'Custom');
            if (availableTypes.length === 0) return alert("All available column types have been added.");
            createDropdown(availableTypes, addColumnButton, openAddColumnDialog);
        }
    };
    
    bodyClickListener = (e) => {
        const clickedSection = e.target.closest('.task-section');
        if (clickedSection) currentlyFocusedSectionId = Number(clickedSection.dataset.sectionId);
        
        if (e.target.closest('.section-toggle')) {
            const sectionEl = e.target.closest('.task-section');
            const section = project.sections.find(s => s.id == sectionEl.dataset.sectionId);
            if (section) {
                section.isCollapsed = !section.isCollapsed;
                render();
            }
            return;
        }
        
        const addTaskBtn = e.target.closest('.add-task-in-section-btn');
        if (addTaskBtn) {
            const sectionEl = addTaskBtn.closest('.task-section');
            if (sectionEl) {
                const section = project.sections.find(s => s.id == sectionEl.dataset.sectionId);
                if (section) addNewTask(section, 'end');
            }
            return;
        }
        
        const taskRow = e.target.closest('.task-row-wrapper');
        if (!taskRow) return;
        const taskId = taskRow.dataset.taskId;

// --- FIX 2: Check for temporary tasks by looking for the 'temp_' prefix. ---
if (taskId.startsWith('temp_')) {
    const nameEl = taskRow.querySelector('.task-name');
    if (nameEl) {
        nameEl.focus(); // Guide the user to name the task first.
    }
    return; // Stop execution for temporary tasks.
}
        
        if (e.target.matches('.task-name')) return displaySideBarTasks(taskId);
        
        const control = e.target.closest('[data-control]');
        if (!control) return;
        
        const sectionEl = taskRow.closest('.task-section');
        const sectionId = sectionEl ? sectionEl.dataset.sectionId : null;
        
        if (!sectionId) return; // Cannot perform updates without a sectionId
        
        switch (control.dataset.control) {
            case 'check':
                e.stopPropagation();
                handleTaskCompletion(taskId, taskRow);
                break;
            case 'due-date':
                showDatePicker(control, sectionId, taskId);
                break;
            case 'priority':
createDropdown(priorityOptions, control, (v) => updateTask(taskId, sectionId, { priority: v }));
break;
case 'status':
createDropdown(statusOptions, control, (v) => updateTask(taskId, sectionId, { status: v }));
break;
            case 'custom-select': {
                const columnId = Number(control.dataset.columnId);
                const column = project.customColumns.find(c => c.id === columnId);
                if (column && column.options) {
                    // Create a dropdown with the column's specific options ('Invoice', 'Payment').
                    // The callback updates the task's custom field with the selected value.
                    createDropdown(column.options, control, (selectedValue) => {
                        const { task } = findTaskAndSection(taskId); // findTask is still ok here just for reading current state
                        updateTask(taskId, sectionId, {
                            customFields: { ...task.customFields, [columnId]: selectedValue }
                        });
                    });
                }
                break;
            }
            case 'move-task': {
                e.stopPropagation();
                const { section: currentSection } = findTaskAndSection(taskId);
                if (!currentSection) break;
                
                // Get a list of all OTHER sections to move to
                const otherSections = project.sections.filter(s => s.id !== currentSection.id);
                const sectionNames = otherSections.map(s => s.title);
                
                if (sectionNames.length > 0) {
                    // Create a dropdown menu of the available sections
                    createDropdown(sectionNames, control, (selectedTitle) => {
                        const targetSection = project.sections.find(s => s.title === selectedTitle);
                        if (targetSection) {
                            moveTaskToSection(taskId, targetSection.id);
                        }
                    });
                } else {
                    alert("There are no other sections to move this task to.");
                }
                break;
            }
            case 'assignee': { // Using block scope for the `task` constant
                const { task } = findTaskAndSection(taskId);
                // MODIFICATION: Only open the dropdown if NO user is currently assigned.
                if (task && task.assignees.length === 0) {
                    showAssigneeDropdown(control, taskId);
                }
                // If a user is already assigned, clicking the cell does nothing.
                break;
            }
            case 'remove-assignee':
e.stopPropagation();
updateTask(taskId, sectionId, { assignees: [] }); 
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
            const rawValue = newValue.replace(/,/g, ''); // Remove commas for parsing
            newValue = parseFloat(rawValue) || 0;
        }

        // Only update if the value has actually changed.
        if (task.customFields[columnId] !== newValue) {
            // Use dot notation for updating a specific key in a map field.
            updateTask(taskId, section.id, { [`customFields.${columnId}`]: newValue });
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

async function handleSectionReorder(evt) {
    console.log("🔄 Section reorder triggered:", evt);

    const user = auth.currentUser;
    if (!user) {
        console.error("❌ No authenticated user.");
        return;
    }

    console.log("👤 User ID:", user.uid);

    let workspaceSnapshot;
    try {
        workspaceSnapshot = await getDocs(
            query(collection(db, `users/${user.uid}/myworkspace`), where("isSelected", "==", true))
        );
    } catch (err) {
        console.error("❌ Failed to fetch selected workspace:", err);
        return;
    }

    if (workspaceSnapshot.empty) {
        console.warn("⚠️ No selected workspace found.");
        return;
    }

    const workspaceId = workspaceSnapshot.docs[0].id;
    console.log("📁 Selected workspace ID:", workspaceId);

    let projectSnapshot;
    try {
        projectSnapshot = await getDocs(
            query(collection(db, `users/${user.uid}/myworkspace/${workspaceId}/projects`), where("isSelected", "==", true))
        );
    } catch (err) {
        console.error("❌ Failed to fetch selected project:", err);
        return;
    }

    if (projectSnapshot.empty) {
        console.warn("⚠️ No selected project found.");
        return;
    }

    const projectId = projectSnapshot.docs[0].id;
    console.log("📂 Selected project ID:", projectId);

    const sectionEls = [...taskListBody.querySelectorAll('.task-section')]; // adjusted selector to match DOM
    console.log(`🧱 Found ${sectionEls.length} section elements to reorder.`);

    const batch = writeBatch(db);
    sectionEls.forEach((el, index) => {
        const sectionId = el.dataset.sectionId;
        if (!sectionId) {
            console.warn(`⚠️ Section element missing data-section-id at index ${index}`);
            return;
        }

        const sectionRef = doc(db, `users/${user.uid}/myworkspace/${workspaceId}/projects/${projectId}/sections/${sectionId}`);
        batch.update(sectionRef, { order: index });
        console.log(`🔢 Set order ${index} for section ${sectionId}`);
    });

    try {
        await batch.commit();
        console.log("✅ Sections reordered and saved to Firestore.");
    } catch (err) {
        console.error("❌ Error committing section reordering batch:", err);
    }
}


function closeFloatingPanels() {
    document.querySelectorAll('.context-dropdown, .datepicker, .dialog-overlay, .filterlistview-dialog-overlay').forEach(p => p.remove());
}

function findTaskAndSection(taskId) {
    for (const section of project.sections) {
        const task = section.tasks.find(t => t.id === taskId);
        if (task) return { task, section };
    }
    return { task: null, section: null };
}

async function handleTaskMoved(evt) {
    console.log("🧪 Drag Event Details:", evt);

    const user = auth.currentUser;
    if (!user) return;

    const taskEl = evt.item;
    let taskId = taskEl?.dataset.taskId;

    const newSectionEl = evt.to.closest(".task-section");
    const newSectionId = newSectionEl?.dataset.sectionId;

    const oldSectionEl = evt.from.closest(".task-section");
    const oldSectionId = oldSectionEl?.dataset.sectionId;

    if (!taskId || !newSectionId || !oldSectionId) {
        if (!taskId) console.error("❌ Missing taskId. Could not identify which task was moved.");
        if (!newSectionId) console.error("❌ Missing newSectionId. Could not determine target section.");
        if (!oldSectionId) console.error("❌ Missing oldSectionId. Could not determine source section.");
        return;
    }

    try {
        const workspaceSnap = await getDocs(query(
            collection(db, `users/${user.uid}/myworkspace`),
            where("isSelected", "==", true)
        ));
        if (workspaceSnap.empty) return;
        const workspaceId = workspaceSnap.docs[0].id;

        const projectSnap = await getDocs(query(
            collection(db, `users/${user.uid}/myworkspace/${workspaceId}/projects`),
            where("isSelected", "==", true)
        ));
        if (projectSnap.empty) return;
        const projectId = projectSnap.docs[0].id;

        const basePath = `users/${user.uid}/myworkspace/${workspaceId}/projects/${projectId}`;
        let newTaskId = taskId;

        // --- STEP 1: Move task to new section if needed ---
        if (newSectionId !== oldSectionId) {
            const sourceRef = doc(db, `${basePath}/sections/${oldSectionId}/tasks/${taskId}`);
            const sourceSnap = await getDoc(sourceRef);
            if (!sourceSnap.exists()) {
                console.error("❌ Task not found in source section.");
                return;
            }

            const taskData = sourceSnap.data();
            delete taskData.id;
            taskData.sectionId = newSectionId;

            const newDocRef = doc(collection(db, `${basePath}/sections/${newSectionId}/tasks`));
            newTaskId = newDocRef.id;

            // Temporarily update DOM to reflect new task ID
            taskEl.dataset.taskId = newTaskId;

            // First: move the task (delete + set)
            await writeBatch(db)
                .delete(sourceRef)
                .set(newDocRef, taskData)
                .commit();

            console.log(`✅ Moved task "${taskId}" to section "${newSectionId}"`);
        }

        // --- STEP 2: Reorder tasks in the new section ---
        const reorderBatch = writeBatch(db);
        const reorderedTaskEls = Array.from(evt.to.querySelectorAll(".task"));

        reorderedTaskEls.forEach((el, index) => {
            const reorderId = el.dataset.taskId;
            if (!reorderId) return;

            const reorderRef = doc(db, `${basePath}/sections/${newSectionId}/tasks/${reorderId}`);
            reorderBatch.update(reorderRef, {
                order: index,
                sectionId: newSectionId
            });
        });

        await reorderBatch.commit();
        console.log("✅ Reordering complete.");
    } catch (err) {
        console.error("❌ Error handling task move:", err);
    }
}




function render() {
    const scrollStates = new Map();
    document.querySelectorAll('.scrollable-columns-wrapper').forEach((el, i) => scrollStates.set(i, el.scrollLeft));
    
    closeFloatingPanels();
    
    let projectToRender = getFilteredProject();
    projectToRender = getSortedProject(projectToRender);
    
    renderHeader(projectToRender);
    renderBody(projectToRender);
    //renderFooter(projectToRender);
    syncScroll(scrollStates);
    
    if (taskIdToFocus) {
        const newEl = taskListBody.querySelector(`[data-task-id="${taskIdToFocus}"] .task-name`);
    if (newEl) {
        newEl.focus();
     }
        taskIdToFocus = null;
    }
    const isSortActive = activeSortState !== 'default';
    
    if (activeSortState === 'asc') {
        sortBtn.innerHTML = `<i class="fas fa-sort-amount-up-alt"></i> Oldest`;
    } else if (activeSortState === 'desc') {
        sortBtn.innerHTML = `<i class="fas fa-sort-amount-down-alt"></i> Newest`;
    } else {
        sortBtn.innerHTML = `<i class="fas fa-sort"></i> Sort`;
    }
    
    if (sortableSections) sortableSections.destroy();
    sortableSections = new Sortable(taskListBody, { handle: '.section-header-list .drag-handle', animation: 150, disabled: isSortActive, onEnd: handleSectionReorder});
    
    sortableTasks.forEach(st => st.destroy());
    sortableTasks.length = 0;
    document.querySelectorAll('.tasks-container').forEach(container => {
    sortableTasks.push(new Sortable(container, {
        group: 'tasks',
        handle: '.fixed-column .drag-handle',
        animation: 150,
        disabled: isSortActive,
        onEnd: handleTaskMoved
    }));
});

    
    filterBtn?.classList.toggle('active', !!activeFilters.visibleSections);
    sortBtn?.classList.toggle('active', isSortActive);
}

function renderHeader(projectToRender) {
    if (!taskListHeaderEl) return;
    const container = taskListHeaderEl.querySelector('#header-scroll-cols');
    if (!container) return;
    
    container.querySelectorAll('.header-custom').forEach(el => el.remove());
    const addColBtnContainer = container.querySelector('.add-column-container');
    
    projectToRender.customColumns.forEach(col => {
        const colEl = document.createElement('div');
        colEl.className = 'task-col header-custom';
        colEl.dataset.columnId = col.id;
        colEl.textContent = col.name;
        const menuBtn = document.createElement('button');
        menuBtn.className = 'delete-column-btn';
        menuBtn.title = 'Column options';
        menuBtn.innerHTML = `<i class="fas fa-ellipsis-h"></i>`;
        colEl.appendChild(menuBtn);
        if (addColBtnContainer) container.insertBefore(colEl, addColBtnContainer);
    });
}

function renderBody(projectToRender) {
    if (!taskListBody) return;
    taskListBody.innerHTML = '';
    
    projectToRender.sections.forEach(section => {
        const sectionElement = createSection(section, projectToRender.customColumns);
        if (sectionElement) taskListBody.appendChild(sectionElement);
    });
    
    if (projectToRender.sections.length === 0) {
        const noResultsEl = document.createElement('div');
        noResultsEl.className = 'no-results-message';
        noResultsEl.textContent = 'No sections match your current filter.';
        taskListBody.appendChild(noResultsEl);
    }
}

function createSection(sectionData, customColumns) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'task-section';
    sectionEl.dataset.sectionId = sectionData.id;
    
    // --- Build the HTML for all task rows as a single string ---
    let tasksHTML = '';
    if (sectionData.tasks && !sectionData.isCollapsed) {
        tasksHTML = sectionData.tasks.map(task => {
            // createTaskRow returns a DOM element, so we get its HTML content
            return createTaskRow(task, customColumns).outerHTML;
        }).join('');
    }
    
    // --- Build the HTML for the section footer ---
    let summaryColsHTML = '';
    let hasAggregatableColumnInSection = false;
    if (!sectionData.isCollapsed) {
        customColumns.forEach(col => {
            let displayValue = '';
            if (col.aggregation === 'Sum') {
                const sectionTotal = sectionData.tasks.reduce((sum, task) => sum + Number(task.customFields[col.id] || 0), 0);
                if (sectionTotal > 0) {
                    hasAggregatableColumnInSection = true;
                    const formattedTotal = col.type === 'Costing' ? `${col.currency || ''}${sectionTotal.toLocaleString()}` : sectionTotal.toLocaleString();
                    displayValue = `<strong>Sum:</strong> ${formattedTotal}`;
                }
            }
            summaryColsHTML += `<div class="task-col header-custom">${displayValue}</div>`;
        });
    }
    
    let sectionFooterHTML = '';
    if (hasAggregatableColumnInSection) {
        sectionFooterHTML = `
        <div class="section-footer">
            <div class="section-summary-row">
                <div class="fixed-column"></div>
                <div class="scrollable-columns-wrapper">
                    <div class="scrollable-columns">
                        <div class="task-col header-assignee"></div>
                        <div class="task-col header-due-date"></div>
                        <div class="task-col header-priority"></div>
                        <div class="task-col header-status"></div>
                        ${summaryColsHTML}
                    </div>
                </div>
            </div>
        </div>`;
    }
    
    // --- Assemble the entire section's innerHTML in one single operation ---
    sectionEl.innerHTML = `
        <div class="section-header-list">
            <i class="fas fa-grip-vertical drag-handle"></i>
            <i class="fas fa-chevron-down section-toggle ${sectionData.isCollapsed ? 'collapsed' : ''}"></i>
            <span class="section-title" contenteditable="true">${sectionData.title}</span>
        </div>
        <div class="tasks-container ${sectionData.isCollapsed ? 'hidden' : ''}">
            ${tasksHTML}
        </div>
        ${sectionFooterHTML}
        <button class="add-task-in-section-btn"><i class="fas fa-plus"></i> Add task</button>
    `;
    
    return sectionEl;
}

function createTaskRow(task, customColumns) {
    const rowWrapper = document.createElement('div');
    rowWrapper.className = `task-row-wrapper ${task.status === 'Completed' ? 'is-completed' : ''}`;
    rowWrapper.dataset.taskId = task.id;
    
    const displayName = task.name;
    const displayDate = task.dueDate ? new Date(task.dueDate.replace(/-/g, '/')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '<span class="add-due-date">+ Add date</span>';
    
    let customFieldsHTML = '';
    customColumns.forEach(col => {
        const value = task.customFields[col.id] || '';
        
        if (col.type === 'Type' && col.options) {
            /* START MODIFICATION */
            let displayValue = '<span class="add-value">+ Select</span>'; // Default text if no value is set
            
            if (value) {
                // Check the value and apply the desired priority class for styling.
                if (value === 'Invoice') {
                    // Style 'Invoice' like a 'High' priority tag.
                    displayValue = createTag(value, 'priority', 'priority-High');
                } else if (value === 'Payment') {
                    // Style 'Payment' like a 'Medium' priority tag.
                    displayValue = createTag(value, 'priority', 'priority-Medium');
                } else {
                    // Fallback for any other potential value, using status styling.
                    displayValue = createStatusTag(value);
                }
            }
            customFieldsHTML += `<div class="task-col header-custom" data-control="custom-select" data-column-id="${col.id}">${displayValue}</div>`;
            /* END MODIFICATION */
        } else {
            // This is the original logic for other column types.
            // REPLACE IT WITH THIS LINE
            const displayValue = col.type === 'Costing' && value ? `${col.currency || ''}${value.toLocaleString()}` : value;
            customFieldsHTML += `<div class="task-col header-custom" data-control="custom" data-column-id="${col.id}" contenteditable="true">${displayValue}</div>`;
            
        }
    });
    
    // REPLACE the existing rowWrapper.innerHTML assignment with this:
    rowWrapper.innerHTML = `
    <div class="fixed-column">
        <i class="fas fa-grip-vertical drag-handle"></i>
        <i class="far fa-check-circle" data-control="check"></i>
        <span class="task-name" contenteditable="true" data-placeholder="Add task name">${displayName}</span>
        
        <button class="move-task-btn" data-control="move-task" title="Move to section">
            <i class="fas fa-arrow-right-to-bracket"></i>
        </button>
    </div>
    <div class="scrollable-columns-wrapper">
        <div class="scrollable-columns">
            <div class="task-col header-assignee" data-control="assignee">${createAssigneeHTML(task.assignees)}</div>
            <div class="task-col header-due-date" data-control="due-date">${displayDate}</div>
            <div class="task-col header-priority" data-control="priority">${createPriorityTag(task.priority)}</div>
            <div class="task-col header-status" data-control="status">${createStatusTag(task.status)}</div>
            ${customFieldsHTML}
        </div>
    </div>
`;
    return rowWrapper;
}

async function moveTaskToSection(taskId, targetSectionId) {
    const { task: taskToMove, section: sourceSection } = findTaskAndSection(taskId);
    
    if (!taskToMove || !sourceSection || sourceSection.id === targetSectionId) {
        console.error("Cannot move task. Source or target section is invalid.");
        return;
    }
    
    // 1. Prepare the new task data, ensuring sectionId is updated.
    const newTaskData = { ...taskToMove, sectionId: targetSectionId };
    delete newTaskData.id; // Firestore will generate a new ID.
    
    // 2. Define document references for the batch operation.
    const sourceTaskRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${sourceSection.id}/tasks/${taskId}`);
    const targetTasksColRef = collection(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${targetSectionId}/tasks`);
    
    try {
        // 3. Use a batch to perform the delete and add atomically.
        const batch = writeBatch(db);
        batch.delete(sourceTaskRef);
        batch.set(doc(targetTasksColRef), newTaskData); // Create new task in the target
        
        await batch.commit();
        console.log(`Task ${taskId} moved successfully to section ${targetSectionId}`);
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
 * Creates a new task document in Firestore.
 * onSnapshot will handle the UI update.
 * @param {string} sectionId The ID of the section to add the task to.
 * @param {object} taskData The core data for the new task.
 */
async function addTaskToFirebase(sectionId, taskData) {
    if (!currentUserId || !currentWorkspaceId || !currentProjectId) return console.error("Missing IDs.");
    const tasksPath = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${sectionId}/tasks`;
    try {
        await addDoc(collection(db, tasksPath), {
            ...taskData,
            projectId: currentProjectId,
            userId: currentUserId,
            sectionId: sectionId,
            createdAt: serverTimestamp()
        });
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
 * Deletes a custom column and all its corresponding data across all tasks in the project.
 * @param {string} columnId The ID of the column to delete.
 */
async function deleteColumnInFirebase(columnId) {
    if (!currentUserId || !currentWorkspaceId || !currentProjectId) {
        return console.error("Cannot delete column: Missing IDs.");
    }
    if (!window.confirm('Are you sure you want to delete this column and all its data? This action cannot be undone.')) {
        return;
    }
    
    const batch = writeBatch(db);
    
    // FIX: Build the full, nested path to the project document to update its columns array.
    const projectPath = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}`;
    const projectRef = doc(db, projectPath);
    
    const newColumnsArray = project.customColumns.filter(col => col.id != columnId);
    batch.update(projectRef, { customColumns: newColumnsArray });
    
    // The rest of this function is likely fine, but it assumes a top-level 'tasks' collection.
    // This might be your next error if 'tasks' are also nested.
    // Based on your listeners, the 'collectionGroup' query will work regardless.
    const tasksQuery = query(
        collectionGroup(db, "tasks"),
        where("projectId", "==", currentProjectId)
    );
    try {
        const tasksSnapshot = await getDocs(tasksQuery);
        tasksSnapshot.forEach(taskDoc => {
            // Use deleteField() to remove the key from the map
            batch.update(taskDoc.ref, {
                [`customFields.${columnId}`]: deleteField()
            });
        });
        
        await batch.commit();
    } catch (error) {
        console.error("Error deleting column and its data:", error);
        alert("Error: Could not completely delete the column.");
    }
}

function handleTaskCompletion(taskId, taskRowEl) {
    if (!taskRowEl) return;
    taskRowEl.classList.add('is-completed');
    
    setTimeout(() => {
        let completedSection = project.sections.find(s => s.title.toLowerCase() === 'completed');
        
        if (completedSection) {
            // If 'Completed' section exists, just move the task there.
            updateTaskInFirebase(taskId, { status: 'Completed', sectionId: completedSection.id });
        } else {
            // If it doesn't exist, we can't create it here directly without
            // causing conflicts. The best practice is to ensure a 'Completed'
            // section is part of the default project template.
            // For now, just update the status.
            updateTaskInFirebase(taskId, { status: 'Completed' });
            alert("Task marked as completed. Consider creating a 'Completed' section.");
        }
        // No need to call render() or manipulate local arrays here.
    }, 400);
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


function createTag(text, type, pClass) { return `<div class="${type}-tag ${pClass}">${text}</div>`; }

function createPriorityTag(p) { return createTag(p, 'priority', `priority-${p}`); }

function createStatusTag(s) { return createTag(s, 'status', `status-${s.replace(/\s+/g, '-')}`); }

function createDropdown(options, targetEl, callback) {
    if (!targetEl) return console.error("createDropdown was called with a null target element.");
    closeFloatingPanels();
    const wrapperRect = mainContainer.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'context-dropdown';
    dropdown.style.top = `${targetRect.bottom - wrapperRect.top}px`;
    dropdown.style.left = `${targetRect.left - wrapperRect.left}px`;
    options.forEach(option => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = option;
        item.addEventListener('click', () => callback(option));
        dropdown.appendChild(item);
    });
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

function showDatePicker(targetEl,sectionId, taskId) {
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
        id: Date.now(), // Using timestamp for simplicity, UUIDs are better in production
        name: config.name,
        type: config.type,
        currency: config.currency || null,
        aggregation: (config.type === 'Costing' || config.type === 'Numbers') ? 'Sum' : null,
        options: config.type === 'Type' ? typeColumnOptions : null
    };
    
    // Use Firestore's arrayUnion to safely add the new column object
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
        typeSpecificFields = `<div class="form-group"><label>Currency</label><select id="column-currency"><option value="$">USD ($)</option><option value="€">EUR (€)</option></select></div>`;
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