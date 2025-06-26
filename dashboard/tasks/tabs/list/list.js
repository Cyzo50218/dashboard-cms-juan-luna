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
    arrayUnion,
    onSnapshot,
    collectionGroup,
    orderBy,
    limit,
    getDoc,
    getDocs,
    addDoc,
    documentId,
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    serverTimestamp,
    increment,
    deleteField,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "/services/firebase-config.js";
import { openShareModal } from '/dashboard/components/shareProjectModel.js';

// Initialize Firebase
console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
console.log("Initialized Firebase on Dashboard.");

// --- Module-Scoped Variables ---
// DOM Element Holders
let taskListHeaderEl, drawer, headerRight, taskListBody, taskListFooter, addSectionBtn, addTaskHeaderBtn, mainContainer, assigneeDropdownTemplate, filterBtn, sortBtn;

// Event Handler References
let headerClickListener, bodyClickListener, bodyFocusOutListener, addTaskHeaderBtnListener, addSectionBtnListener, windowClickListener, filterBtnListener, sortBtnListener;
let sortableSections;
let activeMenuButton = null;
const sortableTasks = [];
let isSortActive = false;

// --- VIRTUAL SCROLLING CONSTANTS ---
const ROW_HEIGHT = 32; // The fixed height of a single task or section row in pixels.
const VISIBLE_ROW_BUFFER = 5; // Render 5 extra rows above and below the viewport for smoothness.

// --- STATE ---
let flatListOfItems = []; // A flattened array of all sections and tasks.
let isScrolling = false; // For throttling scroll events.


// State variables to track the drag operation
let draggedElement = null;
let placeholder = null;
let dragHasMoved = false;
let sourceContainer = null;
let originalNextSibling = null;

// --- Data ---
let project = { defaultColumns: [], customColumns: [], sections: [], customPriorities: [], customStatuses: [] };
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

let allUsers = [];

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
    'High': '#EF4D3D',
    'Medium': '#FFD15E',
    'Low': '#59E166'
};

const defaultStatusColors = {
    'On track': '#59E166',
    'At risk': '#fff1b8',
    'Off track': '#FFD15E',
    'Completed': '#878787'
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

function detachProjectSpecificListeners() {
    console.log("[DEBUG] Detaching project-specific listeners (project, sections, tasks)...");
    
    // Check for and unsubscribe from the project details listener
    if (activeListeners.project) {
        activeListeners.project(); // This executes the unsubscribe function returned by onSnapshot
        activeListeners.project = null; // Reset the state to clean up
    }
    
    // Check for and unsubscribe from the sections listener
    if (activeListeners.sections) {
        activeListeners.sections();
        activeListeners.sections = null;
    }
    
    // Check for and unsubscribe from the tasks listener
    if (activeListeners.tasks) {
        activeListeners.tasks();
        activeListeners.tasks = null;
    }
}

function attachRealtimeListeners(userId) {
    detachAllListeners(); // A helper function to clean up old listeners
    currentUserId = userId;
    console.log(`[DEBUG] Attaching listeners for user: ${userId}`);
    
    // STEP 1: Find the user's active workspace to know where to find the selected project ID.
    const workspaceQuery = query(collection(db, `users/${userId}/myworkspace`), where("isSelected", "==", true));
    
    activeListeners.workspace = onSnapshot(workspaceQuery, async (workspaceSnapshot) => {
        // When the active workspace changes, we must clean up listeners for the previous project.
        detachProjectSpecificListeners();
        
        if (workspaceSnapshot.empty) {
            console.warn("[DEBUG] No selected workspace. Clearing UI.");
            project = {}; // Clear all project data
            render(); // Render the empty state
            return;
        }
        
        const workspaceDoc = workspaceSnapshot.docs[0];
        currentWorkspaceId = workspaceDoc.id;
        const workspaceData = workspaceDoc.data();
        
        // STEP 2: Read the 'selectedProjectId' from the active workspace document. This is our target.
        const selectedProjectId = workspaceData.selectedProjectId || null;
        console.log(`[DEBUG] Found workspace '${currentWorkspaceId}'. It points to selectedProjectId: '${selectedProjectId}'`);
        
        if (!selectedProjectId) {
            console.warn("[DEBUG] The active workspace does not point to a selected project.");
            project = {};
            render();
            return;
        }
        
        // STEP 3: Use the ID to find the actual project document, no matter where it's nested.
        // We use a one-time `getDocs` with `collectionGroup` to find its full path.
        try {
            const projectQuery = query(
                collectionGroup(db, 'projects'),
                where('projectId', '==', selectedProjectId),
                where('memberUIDs', 'array-contains', currentUserId)
            );
            const projectSnapshot = await getDocs(projectQuery);
            
            if (projectSnapshot.empty) {
                console.error(`[DEBUG] CRITICAL: Could not find any project with the ID '${selectedProjectId}'.`);
                project = {};
                render();
                return;
            }
            
            const projectDoc = projectSnapshot.docs[0];
            const projectRef = projectDoc.ref; // This is the full, correct path to the document
            currentProjectId = projectDoc.id;
            console.log(`[DEBUG] Successfully found project at path: ${projectRef.path}`);
            
            // STEP 4: Now that we have the correct project, attach real-time listeners to it.
            activeListeners.project = onSnapshot(projectRef, async (projectDetailSnap) => {
                if (!projectDetailSnap.exists()) {
                    console.error("[DEBUG] The selected project was deleted.");
                    project = { customColumns: [], sections: [], customPriorities: [], customStatuses: [] };
                    render();
                    return;
                }
                
                console.log(`[DEBUG] Project details listener fired for ${projectDetailSnap.id}`);
                project = { ...project, ...projectDetailSnap.data(), id: projectDetailSnap.id };
                
                // Fetch members once and then attach other listeners
                await loadProjectUsers(currentUserId, currentWorkspaceId, currentProjectId);
                
                // Attach listener for Sections
                const sectionsQuery = query(collection(projectRef, 'sections'), orderBy("order"));
                if (activeListeners.sections) activeListeners.sections();
                activeListeners.sections = onSnapshot(sectionsQuery, (sectionsSnapshot) => {
                    project.sections = sectionsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, tasks: [] }));
                    distributeTasksToSections(allTasksFromSnapshot);
                    render();
                });
                
                // Attach listener for Tasks (using collectionGroup is still powerful here)
                const tasksGroupQuery = query(collectionGroup(db, 'tasks'), where('projectId', '==', currentProjectId), orderBy('createdAt', 'desc'));
                if (activeListeners.tasks) activeListeners.tasks();
                activeListeners.tasks = onSnapshot(tasksGroupQuery, (tasksSnapshot) => {
                    allTasksFromSnapshot = tasksSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                    distributeTasksToSections(allTasksFromSnapshot);
                    render();
                });
            });
            
        } catch (error) {
            console.error("[DEBUG] Error finding project via collectionGroup query:", error);
        }
    });
}


async function fetchActiveIds(userId) {
    console.log(`[DEBUG] [fetchActiveIds] Fetching for user: ${userId}`);
    
    try {
        // Fetch the selected workspace
        const workspaceQuery = query(
            collection(db, `users/${userId}/myworkspace`),
            where("isSelected", "==", true),
            limit(1)
        );
        const workspaceSnapshot = await getDocs(workspaceQuery);
        
        if (workspaceSnapshot.empty) {
            console.warn("[DEBUG] No selected workspace found.");
            return { workspaceId: null, projectId: null };
        }
        
        const workspaceId = workspaceSnapshot.docs[0].id;
        console.log(`[DEBUG] Found workspaceId: ${workspaceId}`);
        
        // Fetch the selected project
        const projectQuery = query(
            collection(db, `users/${userId}/myworkspace/${workspaceId}/projects`),
            where("isSelected", "==", true),
            limit(1)
        );
        const projectSnapshot = await getDocs(projectQuery);
        
        if (projectSnapshot.empty) {
            console.warn("[DEBUG] No selected project found.");
            return { workspaceId, projectId: null };
        }
        
        const projectId = projectSnapshot.docs[0].id;
        console.log(`[DEBUG] Found projectId: ${projectId}`);
        
        return { workspaceId, projectId };
    } catch (error) {
        console.error("[DEBUG] Error fetching active IDs:", error);
        return { workspaceId: null, projectId: null };
    }
}


async function fetchProjectMembers(userId, workspaceId, projectId) {
    console.log("[fetchProjectMembers] Called with:", { userId, workspaceId, projectId });
    if (!userId || !workspaceId || !projectId) {
        console.warn("[fetchProjectMembers] Missing parameters. Returning empty array.");
        return [];
    }
    
    try {
        const projectRef = doc(db, `users/${userId}/myworkspace/${workspaceId}/projects/${projectId}`);
        const projectSnap = await getDoc(projectRef);
        console.log("[fetchProjectMembers] Project exists:", projectSnap.exists());
        
        if (!projectSnap.exists()) {
            console.warn("[fetchProjectMembers] Project doc not found:", projectRef.path);
            return [];
        }
        
        const projectData = projectSnap.data();
        console.log("[fetchProjectMembers] Project data loaded:", projectData);
        
        let memberUids;
        if (projectData.workspaceRole === 'workspace') {
            const workspaceDoc = await getDoc(doc(db, `users/${userId}/myworkspace/${workspaceId}`));
            console.log("[fetchProjectMembers] Workspace data:", workspaceDoc.data());
            memberUids = workspaceDoc.data()?.members || [];
        } else {
            memberUids = projectData.members?.map(m => m.uid) || [];
        }
        
        console.log("[fetchProjectMembers] Member UIDs:", memberUids);
        
        if (memberUids.length === 0) {
            console.warn("[fetchProjectMembers] No member UIDs found.");
            return [];
        }
        
        const userPromises = memberUids.map(uid => getDoc(doc(db, `users/${uid}`)));
        const userDocs = await Promise.all(userPromises);
        
        const validUsers = userDocs.filter(d => d.exists()).map(d => ({ uid: d.id, ...d.data() }));
        console.log("[fetchProjectMembers] Valid member profiles fetched:", validUsers);
        
        return validUsers;
    } catch (error) {
        console.error("[fetchProjectMembers] Error fetching members:", error);
        return [];
    }
}

async function loadProjectUsers(currentUserId) {
    console.log("[loadProjectUsers] Starting with userId:", currentUserId);
    try {
        const { workspaceId, projectId } = await fetchActiveIds(currentUserId);
        console.log("[loadProjectUsers] Active IDs fetched:", { workspaceId, projectId });
        
        if (!workspaceId || !projectId) {
            console.warn("[loadProjectUsers] Missing workspaceId or projectId");
            return;
        }
        
        allUsers = await fetchProjectMembers(currentUserId, workspaceId, projectId);
        console.log("[loadProjectUsers] Project members loaded:", allUsers);
    } catch (error) {
        console.error("[loadProjectUsers] Failed to load project users:", error);
    }
}


// --- Main Initialization and Cleanup ---

function initializeListView(params) {
    taskListHeaderEl = document.getElementById('task-list-header');
    drawer = document.getElementById('right-sidebar');
    headerRight = document.getElementById('header-right');
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
    render();
    setupEventListeners();
}

export function getHeaderRight() {
    if (!headerRight) {
        headerRight = document.getElementById('header-right');
    }
    return headerRight;
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
            console.log(`User ${user.uid} signed in. Attaching listeners.`);
            attachRealtimeListeners(user.uid);
        } else {
            console.log("User signed out. Detaching listeners.");
            detachAllListeners();
            project = { customColumns: [], sections: [], customPriorities: [], customStatuses: [] };
            render();
        }
    });
    
    // Initial view setup
    initializeListView(params);
    
    
    
    // Cleanup
    return function cleanup() {
        console.log("Cleaning up List View Module...");
        detachAllListeners();
        
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

function setupEventListeners() {``
    
    document.addEventListener('click', (e) => {
        const optionsButton = e.target.closest('.section-options-btn');
        
        
        if (e.target.closest('.options-dropdown-menu')) {
            const dropdownItem = e.target.closest('.dropdown-item');
            if (dropdownItem) {
                const { action, sectionId } = dropdownItem.dataset;
                console.log(`Action: ${action}, Section ID: ${sectionId || 'N/A'}`);
                
                // NEW: Handle the specific actions from the menu
                switch (action) {
                    case 'addTask':
                        const section = project.sections.find(s => s.id === sectionId);
                        if (section) addNewTask(section);
                        break;
                        
                    case 'renameSection':
                        const sectionTitleEl = document.querySelector(`.section-title-wrapper[data-section-id="${sectionId}"] .section-title`);
                        if (sectionTitleEl) {
                            sectionTitleEl.focus();
                            document.execCommand('selectAll', false, null);
                        }
                        break;
                        
                    case 'deleteSection':
                        // This calls your new function
                        deleteSectionInFirebase(sectionId);
                        break;
                }
                
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
        
        
        // Match the options icon in the custom header column
        const optionsIcon = e.target.closest('.options-icon');
        if (optionsIcon) {
            e.stopPropagation();
            const columnEl = optionsIcon.closest('[data-column-id]');
            if (columnEl) {
                const columnId = Number(columnEl.dataset.columnId);
                
                const dropdownOptions = [
                    { name: 'Rename column' },
                    { name: 'Delete column' }
                ];
                
                createDropdown(dropdownOptions, optionsIcon, (selected) => {
                    if (selected.name === 'Delete column') {
                        deleteColumn(columnId);
                    } else if (selected.name === 'Rename column') {
                        enableColumnRename(columnEl);
                    }
                });
            }
            return;
        }
        
        // Match the "Add Column" button in header
        const addColumnButton = e.target.closest('.add-column-cell');
        if (addColumnButton) {
            e.stopPropagation();
            
            const existingTypes = new Set(project.customColumns.map(col => col.type));
            const availableTypes = columnTypeOptions.filter(type => !existingTypes.has(type) || type === 'Custom');
            
            createDropdown(
                availableTypes.map(type => ({ name: type })),
                addColumnButton,
                (selected) => openAddColumnDialog(selected.name)
            );
        }
    };
    
    bodyClickListener = (e) => {
        console.log('%cbodyClickListener Triggered', 'color: #888;', 'Clicked on:', e.target);
        
        // --- 0. Guard clause: Prevent other clicks if a temp task is still blank ---
        const activeTempTask = document.querySelector('.task-row-wrapper[data-task-id^="temp_"] .task-name');
        if (activeTempTask && activeTempTask.innerText.trim() === '' && !e.target.closest('.task-name')) {
            console.warn('Blocked interaction: A temp task is still blank and active.');
            activeTempTask.focus();
            return;
        }
        
        // --- 1. Section Toggle ---
        const sectionToggle = e.target.closest('.section-toggle');
        if (sectionToggle) {
            console.log('%cACTION: Section Toggle', 'color: blue; font-weight: bold;');
            const sectionEl = sectionToggle.closest('.section-wrapper');
            const sectionId = sectionEl?.dataset.sectionId;
            const section = project.sections.find(s => s.id == sectionId);
            if (section) {
                section.isCollapsed = !section.isCollapsed;
                render();
            }
            return;
        }
        
        // --- 2. "Add Task" Button inside section ---
        const addTaskBtn = e.target.closest('.add-task-btn');
        if (addTaskBtn) {
            console.log('%cACTION: Add Task in Section', 'color: blue; font-weight: bold;');
            const sectionEl = addTaskBtn.closest('.section-wrapper');
            const section = project.sections.find(s => s.id == sectionEl?.dataset.sectionId);
            if (section) {
                addNewTask(section, 'end');
            }
            return;
        }
        
        // --- 2.5: Add task row clicked ---
        const addTaskRow = e.target.closest('.add-task-row-wrapper');
        if (addTaskRow) {
            console.log('%cACTION: Add Task Row clicked', 'color: blue; font-weight: bold;');
            const sectionId = addTaskRow.dataset.sectionId;
            const section = project.sections.find(s => s.id == sectionId);
            if (section) {
                addNewTask(section, 'end');
            }
            return;
        }
        
        // --- 3. Interaction in a task row ---
        const taskRow = e.target.closest('.task-row-wrapper');
        if (taskRow) {
            console.log('%cEVENT: Task Row Interaction', 'color: green;', taskRow);
            const taskId = taskRow.dataset.taskId;
            const sectionId = taskRow.dataset.sectionId;
            
            const controlElement = e.target.closest('[data-control], .task-name');
            if (!controlElement) return console.log('Click was inside task row, but not on a control.');
            
            const controlType = controlElement.matches('.task-name') ? 'open-sidebar' : controlElement.dataset.control;
            
            // If it's a temp_ task and not clicking task name — ignore
            if (taskId.startsWith('temp_') && controlType !== 'open-sidebar') {
                console.log('Blocked: Cannot interact with task controls while temp task is blank.');
                return;
            }
            
            switch (controlType) {
                case 'open-sidebar':
                case 'comment':
                    displaySideBarTasks(taskId);
                    headerRight.classList.add('hide');
                    break;
                    
                case 'check':
                    e.stopPropagation();
                    handleTaskCompletion(taskId, taskRow);
                    break;
                    
                case 'due-date':
                    console.log('due date opening');
                    showDatePicker(controlElement, sectionId, taskId);
                    break;
                    
                case 'priority': {
                    console.log('priority opening');
                    let allPriorityOptions = priorityOptions.map(p => ({
                        name: p,
                        color: defaultPriorityColors[p] || null
                    }));
                    if (project.customPriorities) {
                        allPriorityOptions = allPriorityOptions.concat(project.customPriorities);
                    }
                    createDropdown(allPriorityOptions, controlElement, (selected) => {
                        updateTask(taskId, sectionId, { priority: selected.name });
                    }, 'Priority');
                    break;
                }
                
                case 'status': {
                    console.log('status opening');
                    let allStatusOptions = statusOptions.map(s => ({
                        name: s,
                        color: defaultStatusColors[s] || null
                    }));
                    if (project.customStatuses) {
                        allStatusOptions = allStatusOptions.concat(project.customStatuses);
                    }
                    createDropdown(allStatusOptions, controlElement, (selected) => {
                        updateTask(taskId, sectionId, { status: selected.name });
                    }, 'Status');
                    break;
                }
                
                case 'like': {
                    const { task, section } = findTaskAndSection(taskId);
                    if (!task || !section || !currentUserId) return;
                    const taskRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${section.id}/tasks/${taskId}`);
                    const liked = task.likedBy?.[currentUserId];
                    updateDoc(taskRef, liked ?
                    {
                        likedAmount: increment(-1),
                        [`likedBy.${currentUserId}`]: deleteField()
                    } :
                    {
                        likedAmount: increment(1),
                        [`likedBy.${currentUserId}`]: true
                    });
                    break;
                }
                // Replace your existing 'custom-select' case with this more robust version.
                case 'custom-select': {
                    // 1. Get the column ID from the element.
                    const columnIdFromElement = controlElement.dataset.columnId;
                    
                    if (!columnIdFromElement) {
                        console.error("Clicked custom-select cell is missing a data-column-id attribute.");
                        break;
                    }
                    
                    // 2. Find the column definition.
                    const column = project.customColumns.find(c => String(c.id) === columnIdFromElement);
                    
                    // 3. Check if the column and its options exist.
                    if (column && column.options) {
                        
                        // 4. THE FIX: Use .map() to ensure the options are in the correct format.
                        // This makes sure every item is an object like { name: '...', color: '...' }
                        const dropdownOptions = column.options.map(opt => {
                            // If the option is already a well-formed object, return it as is.
                            if (typeof opt === 'object' && opt !== null && opt.name) {
                                return opt;
                            }
                            // If the option is just a string, convert it into the object format.
                            if (typeof opt === 'string') {
                                return { name: opt, color: null };
                            }
                            // Handle any other unexpected format.
                            return { name: 'Invalid Option', color: null };
                        });
                        
                        // 5. Call createDropdown with the clean, guaranteed-to-be-correct options.
                        createDropdown(dropdownOptions, controlElement, (selectedValue) => {
                            const originalColumnId = column.id;
                            updateTask(taskId, sectionId, {
                                [`customFields.${originalColumnId}`]: selectedValue.name
                            });
                        }, 'CustomColumn', column.id); // Pass 'CustomColumn' and the ID for the "Add/Edit" logic
                        
                    } else {
                        console.error(`Could not find a column or options for ID: ${columnIdFromElement}`);
                    }
                    break;
                }
                
                case 'move-task': {
                    e.stopPropagation();
                    const { section: currentSection } = findTaskAndSection(taskId);
                    const otherSections = project.sections.filter(s => s.id !== currentSection?.id);
                    if (otherSections.length > 0) {
                        createDropdown(
                            otherSections.map(s => ({ name: s.title })),
                            controlElement,
                            (selected) => {
                                const targetSection = project.sections.find(s => s.title === selected.name);
                                if (targetSection) moveTaskToSection(taskId, targetSection.id);
                            }
                        );
                    } else {
                        alert("There are no other sections to move this task to.");
                    }
                    break;
                }
                
                case 'assignee':
                    showAssigneeDropdown(controlElement, taskId);
                    break;
                    
                case 'remove-assignee': {
                    e.stopPropagation();
                    const { section } = findTaskAndSection(taskId);
                    if (section) updateTask(taskId, section.id, { assignees: [] });
                    break;
                }
            }
            return;
        }
        
        console.log('No specific interactive element was clicked.');
    };
    
    
    bodyFocusOutListener = (e) => {
        const focusedOutElement = e.target;
        console.log('%cbodyFocusOutListener Triggered', 'color: #888;', 'Element that lost focus:', focusedOutElement);
        
        // --- Section Title Save ---
        if (focusedOutElement.matches('.section-title')) {
            const sectionEl = focusedOutElement.closest('.section-title-wrapper');
            if (!sectionEl) return;
            
            const sectionId = sectionEl.dataset.sectionId;
            const newTitle = focusedOutElement.innerText.trim();
            const section = project.sections.find(s => s.id === sectionId);
            
            if (!section) return;
            
            if (section.title !== newTitle) {
                console.log(`Updated section title: ${newTitle}`);
                updateSectionInFirebase(sectionId, { title: newTitle });
            }
            return;
        }
        
        // --- Task Name Save ---
        if (focusedOutElement.matches('.task-name')) {
            const taskRow = focusedOutElement.closest('.task-row-wrapper');
            if (!taskRow) return;
            
            const taskId = taskRow.dataset.taskId;
            const { task, section } = findTaskAndSection(taskId);
            if (!task || !section) return;
            
            const newName = focusedOutElement.innerText.trim();
            
            if (task.isNew) {
                if (newName) {
                    section.tasks = section.tasks.filter(t => t.id !== taskId);
                    const { isNew, id, ...taskData } = task;
                    console.log(`Saving new task: "${newName}"`);
                    addTaskToFirebase(section.id, { ...taskData, name: newName });
                } else {
                    console.log("Discarding empty new task.");
                    section.tasks = section.tasks.filter(t => t.id !== taskId);
                    render();
                }
            } else if (task.name !== newName) {
                updateTask(taskId, section.id, { name: newName });
            }
            return;
        }
        
        // --- Custom Field Save ---
        const customFieldCell = focusedOutElement.closest('[data-control="custom"]');
        if (customFieldCell) {
            const taskRow = customFieldCell.closest('.task-row-wrapper');
            const taskId = taskRow?.dataset.taskId;
            const columnId = customFieldCell.dataset.columnId;
            
            const { task, section } = findTaskAndSection(taskId);
            const column = project.customColumns.find(c => c.id == columnId);
            
            if (!task || !section || !column) return;
            
            let rawValue = customFieldCell.innerText.trim();
            const oldValue = task.customFields?.[columnId] ?? null;
            let newValue = rawValue;
            
            if (column.type === 'Costing') {
                const numeric = rawValue.replace(/[^0-9.-]+/g, '');
                if (/^-?\d+(\.\d+)?$/.test(numeric)) {
                    newValue = parseFloat(numeric);
                } else {
                    console.log("Invalid costing format. Cancelling save.");
                    return;
                }
            } else if (column.type === 'Numbers') {
                if (/^\d+$/.test(rawValue)) {
                    newValue = parseInt(rawValue, 10);
                } else {
                    console.log("Non-numeric input in Numbers column. Cancelling save.");
                    return;
                }
            }
            
            if (newValue !== oldValue) {
                console.log(`Updating customFields.${columnId} →`, newValue);
                updateTask(task.id, section.id, {
                    [`customFields.${columnId}`]: newValue
                });
            } else {
                console.log("Custom field unchanged.");
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
    
    windowClickListener = (e) => {
        
        const clickedInsidePanel = e.target.closest('.context-dropdown, .datepicker, .options-dropdown-menu');
        const clickedOverlayOrDialog = e.target.closest('.dialog-overlay, .filterlistview-dialog-overlay');
        const clickedTrigger = e.target.closest('[data-control="due-date"], [data-control="priority"], [data-control="status"], [data-control="custom"], [data-control="assignee"], #add-column-btn, #filter-btn, .delete-column-btn');
        
        if (!clickedInsidePanel && !clickedOverlayOrDialog && !clickedTrigger) {
            closeFloatingPanels();
        }
        
        const clickedInsideRightSidebar = e.target.closest('#right-sidebar');
        const clickedInsideLeftSidebar = e.target.closest('#drawer');
        const clickedOnTaskLink = e.target.closest('[data-control="open-sidebar"]');
        
        // 3. If a click happens OUTSIDE all the safe areas, then show the header.
        if (!drawer) {
            headerRight.classList.remove('hide');
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
    
    taskListBody.addEventListener('click', bodyClickListener);
    taskListBody.addEventListener('focusout', bodyFocusOutListener);
    addTaskHeaderBtn.addEventListener('click', addTaskHeaderBtnListener);
    addSectionBtn.addEventListener('click', addSectionBtnListener);
    window.addEventListener('click', windowClickListener);
    if (filterBtn) filterBtn.addEventListener('click', filterBtnListener);
    if (sortBtn) sortBtn.addEventListener('click', sortBtnListener);
    
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            closeFloatingPanels();
        }
    });
    
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
 * Finds the full Firestore path to the user's currently selected project.
 * This function is now collaboration-ready.
 * @param {object} db - The Firestore database instance.
 * @param {string} userId - The UID of the currently authenticated user.
 * @returns {Promise<string>} A promise that resolves to the full path of the project document.
 */
async function _getSelectedProjectPath(db, userId) {
    
    // Step 1: Find the user's active workspace.
    const workspaceQuery = query(
        collection(db, `users/${userId}/myworkspace`),
        where("isSelected", "==", true),
        limit(1) // Optimization as we only need one
    );
    const workspaceSnap = await getDocs(workspaceQuery);
    
    if (workspaceSnap.empty) {
        throw new Error("No selected workspace found for the user.");
    }
    
    // Step 2: Read the 'selectedProjectId' from the workspace document's data.
    const workspaceData = workspaceSnap.docs[0].data();
    const selectedProjectId = workspaceData.selectedProjectId;
    
    if (!selectedProjectId) {
        throw new Error("The active workspace does not have a selected project.");
    }
    
    // Step 3: Use a collectionGroup query to find the project by its ID, no matter where it's nested.
    // This is the key change that supports shared projects.
    const projectQuery = query(
        collectionGroup(db, 'projects'),
        where('projectId', '==', selectedProjectId),
        where('memberUIDs', 'array-contains', userId) // Ensures security rules are met
    );
    const projectSnap = await getDocs(projectQuery);
    
    if (projectSnap.empty) {
        throw new Error(`Project with ID '${selectedProjectId}' not found, or user does not have permission.`);
    }
    
    // Step 4: Return the full path from the found document's reference.
    const projectPath = projectSnap.docs[0].ref.path;
    console.log(`[DEBUG] _getSelectedProjectPath resolved to: ${projectPath}`);
    return projectPath;
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

function _getTasksForSectionFromDOM(sectionHeaderEl) {
    const tasks = [];
    if (!sectionHeaderEl) return tasks;
    
    // Start with the element right after the header
    let nextElement = sectionHeaderEl.nextElementSibling;
    
    // Loop as long as we have a sibling AND it's not another section header
    while (nextElement && !nextElement.classList.contains('section-row-wrapper')) {
        // If it's a valid task, add it
        if (nextElement.classList.contains('task-row-wrapper') && nextElement.dataset.taskId) {
            tasks.push(nextElement);
        }
        // Move to the next sibling
        nextElement = nextElement.nextElementSibling;
    }
    return tasks;
}

async function handleTaskMoved(evt) {
    console.log("🧪 Drag Event Details:", evt);
    
    const user = auth.currentUser;
    if (!user) {
        console.error("❌ User not authenticated.");
        return;
    }
    
    // --- 1. Get DOM elements and their IDs ---
    const taskEl = evt.item;
    const taskId = taskEl.dataset.taskId;
    
    // FIX: Use the correct class '.section-wrapper' to find the container
    const newSectionEl = evt.to.closest(".section-wrapper");
    const oldSectionEl = evt.from.closest(".section-wrapper");
    const newSectionId = newSectionEl?.dataset.sectionId;
    const oldSectionId = oldSectionEl?.dataset.sectionId;
    
    if (!taskId || !newSectionId || !oldSectionId) {
        console.error("❌ Critical ID missing.", { taskId, newSectionId, oldSectionId });
        return;
    }
    
    // The rest of your function logic is great and remains unchanged.
    try {
        const workspaceSnap = await getDocs(query(collection(db, `users/${user.uid}/myworkspace`), where("isSelected", "==", true)));
        if (workspaceSnap.empty) return;
        const workspaceId = workspaceSnap.docs[0].id;
        
        const projectSnap = await getDocs(query(collection(db, `users/${user.uid}/myworkspace/${workspaceId}/projects`), where("isSelected", "==", true)));
        if (projectSnap.empty) return;
        const projectId = projectSnap.docs[0].id;
        const basePath = `users/${user.uid}/myworkspace/${workspaceId}/projects/${projectId}`;
        
        const batch = writeBatch(db);
        
        if (newSectionId === oldSectionId) {
            console.log(`Reordering task "${taskId}" in section "${newSectionId}"`);
            const tasksToUpdate = Array.from(newSectionEl.querySelectorAll(".task-row-wrapper"));
            
            tasksToUpdate.forEach((el, index) => {
                const currentTaskId = el.dataset.taskId;
                if (!currentTaskId) return;
                const taskRef = doc(db, `${basePath}/sections/${newSectionId}/tasks/${currentTaskId}`);
                batch.update(taskRef, { order: index });
            });
            
        } else {
            console.log(`Moving task "${taskId}" from section "${oldSectionId}" to "${newSectionId}"`);
            
            const sourceRef = doc(db, `${basePath}/sections/${oldSectionId}/tasks/${taskId}`);
            const sourceSnap = await getDoc(sourceRef);
            if (!sourceSnap.exists()) {
                console.error("❌ Task not found in the source section. Cannot move.");
                return;
            }
            
            const newDocRef = doc(collection(db, `${basePath}/sections/${newSectionId}/tasks`));
            const taskData = { ...sourceSnap.data(), sectionId: newSectionId, id: newDocRef.id };
            
            const targetSection = project.sections.find(s => s.id === newSectionId);
            if (targetSection && targetSection.sectionType === 'completed') {
                console.log(`Destination is a 'completed' section. Updating task status.`);
                taskData.status = 'Completed';
            }
            
            batch.delete(sourceRef);
            batch.set(newDocRef, taskData);
            
            taskEl.dataset.taskId = newDocRef.id;
            
            const newSectionTasks = Array.from(newSectionEl.querySelectorAll(".task-row-wrapper"));
            newSectionTasks.forEach((el, index) => {
                const currentTaskId = el.dataset.taskId;
                if (!currentTaskId) return;
                const taskRef = doc(db, `${basePath}/sections/${newSectionId}/tasks/${currentTaskId}`);
                batch.update(taskRef, { order: index, sectionId: newSectionId });
            });
            
            const oldSectionTasks = Array.from(oldSectionEl.querySelectorAll(".task-row-wrapper"));
            oldSectionTasks.forEach((el, index) => {
                const currentTaskId = el.dataset.taskId;
                if (!currentTaskId) return;
                const taskRef = doc(db, `${basePath}/sections/${oldSectionId}/tasks/${currentTaskId}`);
                batch.update(taskRef, { order: index });
            });
        }
        
        await batch.commit();
        console.log("✅ Batch commit successful. Task positions updated.");
        
    } catch (err) {
        console.error("❌ Error handling task move:", err);
    }
}

/**
 * Makes a header cell editable and saves the new name to the correct
 * array in Firestore (either defaultColumns or customColumns).
 * This version is improved to prevent deleting the menu icon.
 */
function enableColumnRename(columnEl) {
    closeFloatingPanels();
    
    // FIX 1: Target the inner <span> for editing to protect the menu icon.
    const cellText = columnEl.querySelector('span');
    const originalName = cellText.textContent.trim();
    
    // Make only the text span editable, not the whole div.
    cellText.contentEditable = 'true';
    cellText.focus();
    document.execCommand('selectAll', false, null);
    
    // Get the ID. It can be a string ('status') or a number (for custom columns).
    const columnId = columnEl.dataset.columnId;
    
    const finishEditing = async (saveChanges) => {
        // Remove listeners from the text span.
        cellText.removeEventListener('blur', onBlur);
        cellText.removeEventListener('keydown', onKeyDown);
        cellText.contentEditable = 'false';
        
        const newName = cellText.textContent.trim();
        
        if (saveChanges && newName && newName !== originalName) {
            // --- THIS IS THE NEW UNIFIED SAVE LOGIC ---
            
            // Create mutable copies of the arrays from our project data.
            let defaultCols = [...(project.defaultColumns || [])];
            let customCols = [...(project.customColumns || [])];
            
            // Try to find and update the column in the default list first.
            const defaultIndex = defaultCols.findIndex(c => String(c.id) === String(columnId));
            
            if (defaultIndex > -1) {
                // It's a default column. Update its name.
                console.log(`Renaming default column: ${columnId}`);
                defaultCols[defaultIndex] = { ...defaultCols[defaultIndex], name: newName };
            } else {
                // If not found, it must be a custom column.
                const customIndex = customCols.findIndex(c => String(c.id) === String(columnId));
                if (customIndex > -1) {
                    console.log(`Renaming custom column: ${columnId}`);
                    customCols[customIndex] = { ...customCols[customIndex], name: newName };
                }
            }
            
            // Save both arrays back to Firestore in a single, safe operation.
            await updateProjectInFirebase({
                defaultColumns: defaultCols,
                customColumns: customCols
            });
            
        } else {
            // If editing was cancelled or the name is empty, revert to the original text.
            cellText.textContent = originalName;
        }
    };
    
    const onBlur = () => finishEditing(true);
    const onKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            finishEditing(e.key === 'Enter');
        }
    };
    
    cellText.addEventListener('blur', onBlur);
    cellText.addEventListener('keydown', onKeyDown);
}

/**
 * Flattens the project's sections and tasks into a single array for virtual scrolling.
 */
function flattenProjectData() {
    flatListOfItems = [];
    project.sections.forEach(section => {
        // Add the section itself as an item
        flatListOfItems.push({ type: 'section', data: section });
        
        // Add its tasks if not collapsed
        if (!section.isCollapsed && section.tasks) {
            section.tasks.forEach(task => {
                flatListOfItems.push({ type: 'task', data: task });
            });
        }
        
        // Add the "Add Task" row for the section
        flatListOfItems.push({ type: 'add_task', sectionId: section.id });
    });
}

/**
 * Calculates which rows should be visible and renders only those into the bodyGrid.
 * @param {HTMLElement} bodyContainer - The scrolling container (.list-body-wrapper).
 * @param {HTMLElement} bodyGrid - The "window" to render rows into (.grid-wrapper).
 */
function renderVisibleRows(bodyContainer, bodyGrid) {
    const scrollTop = bodyContainer.scrollTop;
    const viewportHeight = bodyContainer.clientHeight;
    
    // 1. Calculate the start and end index of visible items
    let startIndex = Math.floor(scrollTop / ROW_HEIGHT);
    let endIndex = Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT);
    
    // 2. Apply the buffer
    startIndex = Math.max(0, startIndex - VISIBLE_ROW_BUFFER);
    endIndex = Math.min(flatListOfItems.length, endIndex + VISIBLE_ROW_BUFFER);
    
    // 3. Slice the visible items from our flat list
    const visibleItems = flatListOfItems.slice(startIndex, endIndex);
    
    // 4. Clear the existing rows and render the new visible ones
    bodyGrid.innerHTML = '';
    visibleItems.forEach(item => {
        let rowElement;
        if (item.type === 'section') {
            rowElement = createSectionRow(item.data, project.customColumns);
        } else if (item.type === 'task') {
            rowElement = createTaskRow(item.data, project.customColumns);
        } else if (item.type === 'add_task') {
            rowElement = createAddTaskRow(project.customColumns, item.sectionId);
        }
        
        if (rowElement) {
            bodyGrid.appendChild(rowElement);
        }
    });
    
    // 5. Position the "window" of rows correctly inside the giant spacer
    // This is the most important step for virtual scrolling.
    const offsetY = startIndex * ROW_HEIGHT;
    bodyGrid.style.transform = `translateY(${offsetY}px)`;
}

/**
 * PART 1: A lenient input filter.
 * Attaches an event listener to only allow characters used in numbers (including commas).
 * @param {HTMLElement} cell The contenteditable cell element.
 */
function allowNumericChars(cell) {
    cell.addEventListener('input', (e) => {
        const target = e.target;
        const originalText = target.textContent;
        
        // Allow digits, one leading hyphen, one decimal, and commas
        let sanitizedText = originalText
            .replace(/[^-\d.,]/g, '') // 1. Remove all invalid characters
            .replace(/(?!^)-/g, '') // 2. Remove hyphens unless they are the first character
            .replace(/(\..*)\./g, '$1'); // 3. Remove any subsequent decimal points
        
        if (originalText !== sanitizedText) {
            // Restore cursor position if text was changed
            const selection = window.getSelection();
            const originalOffset = selection.focusOffset;
            const lengthDifference = originalText.length - sanitizedText.length;
            const newOffset = Math.max(0, originalOffset - lengthDifference);
            
            target.textContent = sanitizedText;
            
            try {
                const range = document.createRange();
                const textNode = target.firstChild || target;
                range.setStart(textNode, Math.min(newOffset, textNode.length));
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (error) {
                console.warn("Could not restore cursor position.", error);
            }
        }
    });
}

/**
 * PART 2: A smart formatter on 'blur' (when the user clicks away).
 * Attaches an event listener that parses and formats the number correctly.
 * @param {HTMLElement} cell The contenteditable cell element.
 */
function formatNumberOnBlur(cell) {
    cell.addEventListener('blur', (e) => {
        const target = e.target;
        // Get the raw text and remove commas to prepare for parsing
        const rawText = target.textContent.replace(/,/g, '');
        
        // If empty or not a valid number, clear the cell and stop
        if (rawText.trim() === '' || isNaN(parseFloat(rawText))) {
            target.textContent = '';
            return;
        }
        
        const numberValue = parseFloat(rawText);
        
        // Check if the number has decimals
        if (numberValue % 1 !== 0) {
            // If it has decimals, format with 2 decimal places
            target.textContent = numberValue.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } else {
            // If it's a whole number, format with 0 decimal places (no .00)
            target.textContent = numberValue.toLocaleString('en-US', {
                maximumFractionDigits: 0
            });
        }
    });
}

function formatDueDate(dueDateString) {
    // --- Setup ---
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to the start of the day for accurate comparisons.
    
    // Handle empty or invalid dates
    if (!dueDateString) {
        return { text: '', color: 'default' }; // Return empty text as requested
    }
    
    const dueDate = new Date(dueDateString); // Directly parse the string
    if (isNaN(dueDate.getTime())) {
        return { text: 'Invalid date', color: 'red' };
    }
    dueDate.setHours(0, 0, 0, 0); // Also normalize the due date
    
    // --- Calculations ---
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const dueYear = dueDate.getFullYear();
    const dueMonth = dueDate.getMonth();
    
    // Calculate the difference in milliseconds and convert to days
    const dayDifference = (dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
    
    // --- 1. Handle Past Dates ---
    if (dayDifference < 0) {
        if (dayDifference === -1) {
            return { text: 'Yesterday', color: 'red' };
        }
        // "Last Week" is considered any day within the last 7 days (but not yesterday)
        if (dayDifference > -7) {
            return { text: 'Last Week', color: 'red' };
        }
        // Check if it was last calendar month in the same year
        if (todayYear === dueYear && todayMonth === dueMonth + 1) {
            return { text: 'Last Month', color: 'red' };
        }
        // Check if it was December last year when it's January this year
        if (todayYear === dueYear + 1 && todayMonth === 0 && dueMonth === 11) {
            return { text: 'Last Month', color: 'red' };
        }
        // Check if it was last year
        if (todayYear === dueYear + 1) {
            return { text: 'Last Year', color: 'red' };
        }
        // Fallback for all other past dates (e.g., "Over a year ago")
        const MmmDddYyyyFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return { text: MmmDddYyyyFormat.format(dueDate), color: 'red' };
    }
    
    // --- 2. Handle Present and Immediate Future ---
    if (dayDifference === 0) {
        return { text: 'Today', color: 'green' };
    }
    if (dayDifference === 1) {
        return { text: 'Tomorrow', color: 'yellow' }; // Changed to yellow for "approaching"
    }
    
    // --- 3. Handle Future Dates ---
    
    // If the due date is in the current year
    if (dueYear === todayYear) {
        const MmmDddFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
        return { text: MmmDddFormat.format(dueDate), color: 'default' }; // e.g., "30 Jun"
    }
    
    // If the due date is in a future year
    else {
        const MmmDddYyyyFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return { text: MmmDddYyyyFormat.format(dueDate), color: 'default' }; // e.g., "30 Jun 2026"
    }
}

function render() {
    if (!taskListBody) return;
    
let scrollState = { top: 0, left: 0 };
const oldContainer = taskListBody.querySelector('.juanlunacms-spreadsheetlist-custom-scrollbar');
if (oldContainer) {
    scrollState.top = oldContainer.scrollTop;
    scrollState.left = oldContainer.scrollLeft;
}

    // --- DATA ---
    // At the top of your render() function...

// 1. Create a lookup map of all column definitions for easy access.
const columnDefinitions = new Map();
project.defaultColumns.forEach(col => columnDefinitions.set(String(col.id), col));
project.customColumns.forEach(col => columnDefinitions.set(String(col.id), { ...col, isCustom: true }));

// --- THIS IS THE CORRECTED LOGIC ---
let orderedIds;

// First, check if a valid columnOrder array exists on the project document.
if (project.columnOrder && project.columnOrder.length > 0) {
    // If yes, use it as the single source of truth.
    orderedIds = project.columnOrder;
} else {
    // FALLBACK: If columnOrder is missing, create a default order dynamically.
    console.warn("Project is missing the 'columnOrder' field. Building a default order.");
    
    // Get the IDs from the columns we do have.
    const defaultIds = project.defaultColumns.map(c => c.id);
    const customIds = project.customColumns.map(c => c.id);
    
    // Combine them to create a complete, albeit default, order.
    orderedIds = [...defaultIds, ...customIds];
}

// 2. Build the final `allColumns` array using the correct order.
const allColumns = orderedIds
    .map(id => columnDefinitions.get(String(id))) // Ensure we look up by string
    .filter(Boolean); // Safely filter out any columns that might have been deleted

   const headerClickListener = (e) => {
        
        const columnOptionsIcon = e.target.closest('.options-icon');
        const addColumnBtn = e.target.closest('.add-column-cell');
        
        if (columnOptionsIcon) {
            e.stopPropagation();
            const columnEl = columnOptionsIcon.closest('[data-column-id]');
            if (!columnEl) return;
            
            // FIX: Get columnId as a string to handle names like 'priority' as well as numbers
            const columnId = columnEl.dataset.columnId;
            
            // --- NEW LOGIC: Conditionally build the dropdown options ---
            
            // 1. Start with the 'Rename' option, which is always available.
            const dropdownOptions = [
                { name: 'Rename column' }
            ];
            
            // 2. Define the IDs of the non-deletable default columns.
            const defaultColumnIds = ['assignees', 'dueDate', 'priority', 'status'];
            
            // 3. Check if the current column's ID is in our list of default IDs.
            const isDefaultColumn = defaultColumnIds.includes(columnId);
            
            // 4. If it's NOT a default column, then it's a custom one and can be deleted.
            if (!isDefaultColumn) {
                dropdownOptions.push({ name: 'Delete column' });
            }
            
            // --- END OF NEW LOGIC ---
            
            createDropdown(dropdownOptions, columnOptionsIcon, (selected) => {
                if (selected.name === 'Delete column') {
                    // Since we're converting to a number here, make sure it's not a default ID
                    if (!isDefaultColumn) {
                        deleteColumn(Number(columnId));
                    }
                } else if (selected.name === 'Rename column') {
                    enableColumnRename(columnEl);
                }
            });
            return;
        }
        
        if (addColumnBtn) {
            e.stopPropagation();
            const existingTypes = new Set(project.customColumns.map(col => col.type));
            const availableTypes = columnTypeOptions.filter(type => !existingTypes.has(type));
            
            
            createDropdown(
                columnTypeOptions.map(type => ({ name: type })),
                addColumnBtn,
                (selected) => openAddColumnDialog(selected.name)
            );
        }
    };
    const addTaskAtTop = false;
    
    
    
    taskListBody.innerHTML = '';
    
    // --- HTML STRUCTURE ---
    const container = document.createElement('div');
    container.className = 'w-full h-full bg-white overflow-auto juanlunacms-spreadsheetlist-custom-scrollbar border border-slate-200 rounded-none shadow-sm';
    
    const table = document.createElement('div');
    table.className = 'min-w-max relative';
    
    // --- HEADER ---
    const header = document.createElement('div');
    header.className = 'flex sticky top-0 z-20 bg-white juanlunacms-spreadsheetlist-sticky-header h-8';
    
    const leftHeader = document.createElement('div');
    leftHeader.className = 'sticky left-0 z-10 w-80 md:w-96 lg:w-[400px] flex-shrink-0 px-4 font-semibold text-slate-600 border-b border-r border-slate-200 juanlunacms-spreadsheetlist-left-sticky-pane juanlunacms-spreadsheetlist-sticky-pane-bg text-xs rounded-none flex items-center';
    leftHeader.textContent = 'Name';
    
    const rightHeaderContent = document.createElement('div');
rightHeaderContent.className = 'flex flex-grow border-b border-slate-200';

allColumns.forEach(col => {
    const cell = document.createElement('div');
    // The main cell is a flex container with relative positioning for the handle
    let cellClasses = 'group relative px-2 py-1 font-semibold text-slate-600 border-r border-slate-200 bg-white flex items-center text-xs rounded-none';
    cell.className = cellClasses;
    cell.dataset.columnId = col.id;
    
    // This inner wrapper will hold the text and menu icon
    const innerWrapper = document.createElement('div');
    innerWrapper.className = 'flex flex-grow items-center min-w-0'; // min-w-0 is crucial for flex truncation
    
    const cellText = document.createElement('span');
    // --- FIX #1: The text now grows to push the icon to the end ---
    cellText.className = 'header-cell-content flex-grow';
    cellText.textContent = col.name;
    innerWrapper.appendChild(cellText);
    
    const cellMenu = document.createElement('div');
    // --- FIX #2: The icon is now invisible by default and appears on group-hover ---
    cellMenu.className = 'options-icon flex-shrink-0 opacity-1 group-hover:opacity-100 transition-opacity cursor-pointer p-1 ml-2';
    cellMenu.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 pointer-events-none"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>`;
    innerWrapper.appendChild(cellMenu);
    
    // Add the inner wrapper and resize handle to the cell
    cell.appendChild(innerWrapper);
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    cell.appendChild(resizeHandle);
    
    rightHeaderContent.appendChild(cell);
});

const addColumnBtn = document.createElement('div');
// --- FIX #3: Ensured button is always visible and has a sensible width ---
addColumnBtn.className = 'add-column-cell w-8 opacity-100 flex-shrink-0 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer border-l border-slate-200 bg-white';
addColumnBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
rightHeaderContent.appendChild(addColumnBtn);

    const headerSpacer = document.createElement('div');
    headerSpacer.className = 'w-4 flex-shrink-0';
    rightHeaderContent.appendChild(headerSpacer);
    
    header.appendChild(leftHeader);
    header.appendChild(rightHeaderContent);
    rightHeaderContent.addEventListener('click', headerClickListener);
    
    // --- BODY ---
    const body = document.createElement('div');
    
    const sectionGroupsContainer = document.createElement('div');
    sectionGroupsContainer.className = 'section-groups-container flex flex-col gap-0';
    
    console.log(project);
    console.log(project.customColumns);
    console.log(project.sections);
    
    project.sections.forEach(section => {
        
        const sectionRow = document.createElement('div');
        sectionRow.className = 'flex border-b h- border-slate-200';
        
        const leftSectionCell = document.createElement('div');
        leftSectionCell.className = 'section-title-wrapper group sticky left-0 w-80 md:w-96 lg:w-[400px] flex-shrink-0 flex items-start py-0.5 font-semibold text-slate-800 juanlunacms-spreadsheetlist-left-sticky-pane juanlunacms-spreadsheetlist-sticky-pane-bg hover:bg-slate-50';
        if (section.id) leftSectionCell.dataset.sectionId = section.id;
        
        leftSectionCell.innerHTML = `
        <div class="drag-handle group-hover:opacity-100 transition-opacity cursor-grab rounded flex items-start justify-center hover:bg-slate-200 user-select-none">
            <span class="material-icons text-slate-500 select-none" style="font-size: 20px;" draggable="false">drag_indicator</span>
        </div>

        <span class="section-toggle fas ${section.isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'} text-slate-500 mr-2 cursor-pointer" data-section-id="${section.id}"></span>

        <div contenteditable="true" class="section-title truncate max-w-[400px] outline-none bg-transparent focus:bg-white focus:ring-1 focus:ring-slate-300 rounded px-1">${section.title}</div>

        <div class="flex-grow"></div> 

        <div class="section-options-btn opacity-1 group-hover:opacity-100 transition-opacity cursor-pointer p-1 rounded hover:bg-slate-200 flex items-center justify-center">
            <span class="material-icons text-slate-500">more_horiz</span>
        </div>
    `;
        const toggleIcon = leftSectionCell.querySelector('.section-toggle');
        
        // 2. Add a click listener to it.
        if (toggleIcon) {
            toggleIcon.addEventListener('click', () => {
                const sectionId = toggleIcon.dataset.sectionId;
                
                // 3. Check the icon's class to decide whether to expand or collapse.
                if (toggleIcon.classList.contains('fa-chevron-down')) {
                    // If it's collapsed (showing right arrow), expand it.
                    expandCollapsedSection(sectionId);
                } else {
                    // If it's expanded (showing down arrow), collapse it.
                    collapseExpandedSection(sectionId);
                }
            });
        }
        
        const rightSectionCell = document.createElement('div');
        rightSectionCell.className = 'flex-grow flex';
        
        allColumns.forEach((col, i) => {
            const cell = document.createElement('div');
            const borderClass = i === 0 ? 'border-l border-slate-200' : '';
            
            // --- MODIFICATION FOR SECTION ROW CELLS ---
            // Start with the base classes that all cells share.
            let cellClasses = `flex-shrink-0 h-full hover:bg-slate-50 ${borderClass}`;
            
            // Apply the SAME conditional logic as the header and task rows.
            if (
                col.type === 'Text' ||
                col.type === 'Numbers' ||
                col.type === 'Type' ||
                col.id === 'priority' ||
                col.id === 'status'
            ) {
                // Apply flexible width classes
                cellClasses += ' min-w-[176px] flex-1';
            } else {
                // Apply fixed width classes
                cellClasses += ' w-44';
            }
            
            // Set the final, correct classes on the cell
            cell.className = cellClasses;
            // --- END OF MODIFICATION ---
            cell.dataset.columnId = col.id;
            
            rightSectionCell.appendChild(cell);
        });
        
        const emptyAddCell = document.createElement('div');
        emptyAddCell.className = 'w-12 flex-shrink-0 h-full hover:bg-slate-50';
        rightSectionCell.appendChild(emptyAddCell);
        const emptyEndSpacer = document.createElement('div');
        emptyEndSpacer.className = 'w-4 flex-shrink-0 h-full hover:bg-slate-50';
        rightSectionCell.appendChild(emptyEndSpacer);
        
        sectionRow.appendChild(leftSectionCell);
        sectionRow.appendChild(rightSectionCell);
        const sectionGroup = document.createElement('div');
        sectionGroup.className = 'section-group';
        sectionGroup.dataset.sectionId = section.id;
        
        sectionGroup.appendChild(sectionRow);
        sectionGroupsContainer.appendChild(sectionGroup);
        
        // Create sectionWrapper container and append to body
        const sectionWrapper = document.createElement('div');
        sectionWrapper.className = 'section-wrapper w-full';
        sectionWrapper.dataset.sectionId = section.id;
        
        sectionGroup.appendChild(sectionWrapper);
        
        // ⛔️ Skip rendering tasks and add row if collapsed
        if (section.isCollapsed) return;
        
        if (addTaskAtTop) {
            // Add task row
            const addRow = document.createElement('div');
            addRow.className = 'add-task-row-wrapper flex group';
            addRow.dataset.sectionId = section.id;
            
            const leftAddCell = document.createElement('div');
            leftAddCell.className = 'sticky left-0 w-80 md:w-96 lg:w-[400px] flex-shrink-0 flex items-center px-3 py-1 group-hover:bg-slate-100 juanlunacms-spreadsheetlist-left-sticky-pane juanlunacms-spreadsheetlist-sticky-pane-bg';
            
            const indentedText = document.createElement('div');
            indentedText.className = 'add-task-btn flex items-center gap-2 ml-8 text-slate-500 cursor-pointer hover:bg-slate-200 px-2 py-1 rounded transition';
            indentedText.dataset.sectionId = section.id;
            indentedText.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
    <span class="text-sm">Add task...</span>
`;
            leftAddCell.appendChild(indentedText);
            
            const rightAddCells = document.createElement('div');
            rightAddCells.className = 'flex-grow flex group-hover:bg-slate-100';
            
            // This loop creates the footer cells (including the "Sum:" cell)
            allColumns.forEach((col, i) => {
                const cell = document.createElement('div');
                const leftBorderClass = i === 0 ? 'border-l border-slate-200' : '';
                
                // --- MODIFICATION FOR FOOTER CELLS ---
                // 1. REMOVE the hardcoded width class 'w-44' and 'flex-shrink-0'.
                // The sync function will now control the width.
                cell.className = `h-full ${leftBorderClass}`;
                
                // 2. ADD the data-column-id so the sync function can find this cell.
                cell.dataset.columnId = col.id;
                // --- END OF MODIFICATION ---
                
                // This is your existing logic to calculate and show the sum. It remains unchanged.
                // This is your existing logic to calculate and show the sum.
                if (col.type === 'Costing') {
                    const sum = section.tasks.reduce((accumulator, task) => {
                        const value = task.customFields?.[col.id];
                        return typeof value === 'number' ? accumulator + value : accumulator;
                    }, 0);
                    
                    if (sum > 0) {
                        let formattedSum;
                        
                        // Check if the sum is a whole number (e.g., 1250.00)
                        if (sum % 1 === 0) {
                            // If yes, format it with commas and NO decimal places.
                            formattedSum = sum.toLocaleString('en-US', {
                                maximumFractionDigits: 0
                            });
                        } else {
                            // If no, format it with commas and exactly TWO decimal places.
                            formattedSum = sum.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            });
                        }
                        
                        
                        // Note: The commented out currencySymbol line remains for future use.
                        // const currencySymbol = col.currency || '$';
                        
                        cell.innerHTML = `
            <div style="font-size: 0.8rem; display: flex; justify-content: flex-start; align-items: center; height: 100%; padding-right: 8px;">
              <span style="color: #9ca3af; margin-right: 4px;">Sum:</span>
              <span style="font-weight: 600; color: #4b5563;">${formattedSum}</span>
            </div>
        `;
                    }
                }
                
                rightAddCells.appendChild(cell);
            });
            
            const emptyAddCellLast = document.createElement('div');
            emptyAddCellLast.className = 'w-12 flex-shrink-0 h-full';
            rightAddCells.appendChild(emptyAddCellLast);
            
            const emptyEndSpacerLast = document.createElement('div');
            emptyEndSpacerLast.className = 'w-4 flex-shrink-0 h-full';
            rightAddCells.appendChild(emptyEndSpacerLast);
            
            addRow.appendChild(leftAddCell);
            addRow.appendChild(rightAddCells);
            sectionWrapper.appendChild(addRow);
        }
        
        
        // Render task rows`
        section.tasks.forEach(task => {
            const taskRow = document.createElement('div');
            taskRow.className = 'task-row-wrapper flex group border-b border-slate-200';
            taskRow.dataset.taskId = task.id;
            taskRow.dataset.sectionId = section.id;
            
            const likeCount = task.likedAmount || 0;
            const likeCountHTML = likeCount > 0 ? `<span class="like-count">${likeCount}</span>` : '';
            const commentCount = task.commentCount || 0;
            const commountCountHTML = commentCount > 0 ? `<span class="comment-count">${commentCount }</span>` : '';
            
            
            const leftTaskCell = document.createElement('div');
            leftTaskCell.className = 'group sticky left-0 w-80 md:w-96 lg:w-[400px] flex-shrink-0 flex items-center border-r border-transparent group-hover:bg-slate-50 juanlunacms-spreadsheetlist-left-sticky-pane juanlunacms-spreadsheetlist-sticky-pane-bg juanlunacms-spreadsheetlist-dynamic-border py-0.2';
            
            // --- FIX 1: Reduce the top and bottom padding of the entire cell ---
            leftTaskCell.style.paddingTop = '0px';
            leftTaskCell.style.paddingBottom = '0px';
            
            const isCompleted = task.status === 'Completed';
            const taskNameClass = isCompleted ? 'task-name task-name-completed' : 'task-name';
            
            leftTaskCell.innerHTML = `
    <div class="drag-handle cursor-grab rounded flex items-center justify-center hover:bg-slate-200 user-select-none">
        <span class="material-icons text-slate-400 select-none opacity-1 group-hover:opacity-100 transition-opacity" style="font-size: 20px;" draggable="false">drag_indicator</span>
    </div>

    <label class="juanlunacms-spreadsheetlist-custom-checkbox-container px-2 ml-4" data-control="check">
        <input type="checkbox" ${isCompleted ? 'checked' : ''}>
        <span class="juanlunacms-spreadsheetlist-custom-checkbox"></span>
    </label>

    <div class="flex items-start flex-grow min-w-0">
        <span
            class="${taskNameClass} truncate whitespace-nowrap overflow-hidden text-ellipsis text-[13px] block outline-none bg-transparent focus:bg-white focus:ring-1 focus:ring-slate-300 rounded px-1 transition-all duration-150"
            style="max-width: 100%;"
            contenteditable="true"
            data-task-id="${task.id}"
            data-control="task-name"
        >
            ${task.name}
        </span>
        <div class="task-controls flex items-center gap-1 ml-1 transition-opacity duration-150 group-hover:opacity-100">
            <span class="material-icons text-[18px] text-slate-400 cursor-pointer hover:text-red-500 transition" data-control="like" data-task-id="${task.id}">
                favorite_border
            </span>
            ${likeCount > 0 ? `<span class="like-count text-sm text-slate-500">${likeCount}</span>` : ''}

            <span class="material-icons text-[18px] text-slate-400 cursor-pointer hover:text-blue-500 transition" data-control="comment" data-task-id="${task.id}">
                chat_bubble_outline
            </span>
            ${commentCount > 0 ? `<span class="comment-count text-sm text-slate-500">${commentCount}</span>` : ''}
        </div>
    </div>

    <div class="flex-shrink-0 ml-auto pr-2">
        <span class="material-icons text-sm text-slate-400 cursor-pointer hover:text-slate-600 transition" data-control="move-task" data-task-id="${task.id}">
            swap_vert
        </span>
    </div>
`;
            
            const rightTaskCells = document.createElement('div');
            rightTaskCells.className = 'flex-grow flex group-hover:bg-slate-50';
            
            // This loop creates the cells for a single task row.
            allColumns.forEach((col, i) => {
                const cell = document.createElement('div');
                
                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'cell-content';
                // --- Base Styling ---
                const borderClass = 'border-r';
                const leftBorderClass = i === 0 ? 'border-l' : '';
                let cellClasses = `table-cell px-1 py-0.2 flex items-center ${borderClass} ${leftBorderClass} border-slate-200`;
                
                if (
                    col.type === 'Text' || col.type === 'Numbers' || col.type === 'Type' ||
                    col.id === 'priority' || col.id === 'status'
                ) {
                    // ADD the same marker class here
                    cellClasses += ' js-flexible-col';
                    // Make sure text can wrap if the column grows
                    cell.style.whiteSpace = 'normal';
                } else {
                    cellClasses += ' w-44 truncate'; // Keep fixed width for others
                }
                
                cell.className = cellClasses;
                cell.dataset.columnId = col.id;
                
                if (isCompleted) {
                    cell.classList.add('is-completed');
                }
                
                let content = '';
                
                const COMPLETED_TEXT_COLOR = '#6b7280';
                const COMPLETED_BG_COLOR = '#f3f4f6';
                
                switch (col.id) {
                    case 'assignees':
                        cell.dataset.control = 'assignee';
                        content = createAssigneeHTML(task.assignees);
                        break;
                    case 'dueDate':
                        cell.dataset.control = 'due-date';
                        // For due date, we can use a simpler check
                        if (isCompleted) {
                            content = `<span class="date-tag">${formatDueDate(task.dueDate).text}</span>`;
                        } else {
                            const dueDateInfo = formatDueDate(task.dueDate);
                            const className = `date-tag date-${dueDateInfo.color}`;
                            content = `<span class="${className}">${dueDateInfo.text}</span>`;
                        }
                        break;
                        
                    case 'priority':
                        cell.dataset.control = 'priority';
                        if (task.priority) {
                            // MODIFIED: Check if the task is completed FIRST
                            if (isCompleted) {
                                const grayStyle = `background-color: ${COMPLETED_BG_COLOR}; color: ${COMPLETED_TEXT_COLOR};`;
                                content = `<div class="priority-tag" style="${grayStyle}">${task.priority}</div>`;
                            } else {
                                // This is the original logic for non-completed tasks
                                let color = project.customPriorities?.find(p => p.name === task.priority)?.color || defaultPriorityColors[task.priority];
                                if (color) {
                                    const style = `background-color: ${color}20; color: ${color};`;
                                    content = `<div class="priority-tag" style="${style}">${task.priority}</div>`;
                                } else {
                                    content = `<span>${task.priority}</span>`;
                                }
                            }
                        }
                        break;
                        
                    case 'status':
                        cell.dataset.control = 'status';
                        if (task.status) {
                            // MODIFIED: Check if the task is completed FIRST
                            if (isCompleted) {
                                const grayStyle = `background-color: ${COMPLETED_BG_COLOR}; color: ${COMPLETED_TEXT_COLOR};`;
                                // When completed, the text should always be "Completed"
                                content = `<div class="status-tag" style="${grayStyle}">Completed</div>`;
                            } else {
                                // This is the original logic for non-completed tasks
                                let color = project.customStatuses?.find(s => s.name === task.status)?.color || defaultStatusColors[task.status];
                                if (color) {
                                    const style = `background-color: ${color}20; color: ${color};`;
                                    content = `<div class="status-tag" style="${style}">${task.status}</div>`;
                                } else {
                                    content = `<span>${task.status}</span>`;
                                }
                            }
                        }
                        break;
                        // This is the updated 'default' case for handling all custom columns.
                    default:
                        // --- FIX: Set the columnId for ALL custom columns right away. ---
                        cell.dataset.control = col.type;
                        
                        const rawValue = task.customFields ? task.customFields[col.id] : undefined;
                        
                        // --- Logic for ALL 'Select' type columns (with options) ---
                        if (col.options && Array.isArray(col.options)) {
                            
                            // If the task is completed, render a gray version of the tag.
                            if (isCompleted) {
                                const grayStyle = `background-color: ${COMPLETED_BG_COLOR}; color: ${COMPLETED_TEXT_COLOR};`;
                                // Only show the tag if there's a value to display
                                if (rawValue) {
                                    content = `<div class="status-tag" style="${grayStyle}">${rawValue}</div>`;
                                } else {
                                    content = ''; // Render empty if no value in a completed task
                                }
                            }
                            // If the task is NOT completed, use the normal color logic.
                            else {
                                
                                cell.dataset.control = 'custom-select';
                                const selectedOption = col.options.find(opt => opt.name === rawValue);
                                
                                if (selectedOption) {
                                    if (selectedOption.color) {
                                        const style = `background-color: ${selectedOption.color}20; color: ${selectedOption.color}; border: 1px solid ${selectedOption.color}80;`;
                                        content = `<div class="status-tag" style="${style}">${selectedOption.name}</div>`;
                                    } else {
                                        const sanitizedName = (selectedOption.name || '').toLowerCase().replace(/\s+/g, '-');
                                        content = `<div class="status-tag status-${sanitizedName}">${selectedOption.name}</div>`;
                                    }
                                } else {
                                    content = '<span class="add-value">+</span>';
                                }
                            }
                            
                            // The click listener should be active regardless of completion status.
                            cell.addEventListener('click', (e) => {
                                e.stopPropagation();
                                if (col && col.options) {
                                    createDropdown(col.options, cell, (selectedValue) => {
                                        updateTask(task.id, section.id, {
                                            [`customFields.${col.id}`]: selectedValue.name
                                        });
                                    }, 'CustomColumn', col.id);
                                }
                            });
                            // --- Logic for other column types (Text, Costing, etc.) ---
                        } else { // This "else" is for columns that are NOT "Select" type
                            cell.dataset.control = col.type;
                            cell.contentEditable = true;
                            
                            let displayValue;
                            // NEW: A variable to hold our placeholder class
                            let placeholderClass = '';
                            
                            const valueExists = rawValue !== null && typeof rawValue !== 'undefined' && rawValue !== '';
                            
                            if (valueExists) {
                                // If a value exists, use the original formatting logic
                                if ((col.type === 'Costing' || col.type === 'Numbers') && typeof rawValue === 'number') {
                                    displayValue = rawValue.toLocaleString('en-US', {
                                        minimumFractionDigits: (rawValue % 1 !== 0) ? 2 : 0,
                                        maximumFractionDigits: 2
                                    });
                                } else {
                                    displayValue = rawValue;
                                }
                            } else {
                                // If the value is empty, apply the new placeholder rules
                                if (col.type === 'Text') {
                                    displayValue = ''; // Still blank for Text type
                                } else if (col.type === 'Costing' || col.type === 'Numbers') {
                                    // MODIFIED: The content is empty, but we add a class
                                    displayValue = '';
                                    placeholderClass = 'numeric-placeholder';
                                } else {
                                    displayValue = '';
                                }
                            }
                            
                            // MODIFIED: The span now includes the placeholderClass if one was set
                            content = `<span class="${placeholderClass}">${displayValue}</span>`;
                            
                            if (col.type === 'Costing' || col.type === 'Numbers') {
                                allowNumericChars(cell);
                                formatNumberOnBlur(cell);
                            }
                            break;
                        }
                }
                
                contentWrapper.innerHTML = content;
cell.appendChild(contentWrapper);

rightTaskCells.appendChild(cell);
            });
            
            // These lines append the empty cells and assemble the row
            const emptyAddCellTask = document.createElement('div');
            emptyAddCellTask.className = 'w-12 flex-shrink-0 h-full border-l border-slate-200';
            rightTaskCells.appendChild(emptyAddCellTask);
            
            const emptyEndSpacerTask = document.createElement('div');
            emptyEndSpacerTask.className = 'w-4 flex-shrink-0 h-full';
            rightTaskCells.appendChild(emptyEndSpacerTask);
            
            taskRow.appendChild(leftTaskCell);
            taskRow.appendChild(rightTaskCells);
            sectionWrapper.appendChild(taskRow);
        });
        
        Sortable.create(sectionWrapper, {
            group: 'tasks', // This is the key: allows dragging between sections
            handle: '.drag-handle', // Drag is initiated by the handle on a task row
            animation: 300,
            onMove: function(evt) {
                // This logic ONLY runs if the button is at the bottom.
                // It prevents dropping tasks below the "Add task" button.
                if (!addTaskAtTop && evt.related.classList.contains('add-task-row-wrapper')) {
                    return true;
                }
            },
            onStart(evt) {
                // Add the dark overlay for a consistent UI
                const table = document.querySelector('.min-w-max.relative');
                if (table) {
                    table.classList.add('is-dragging-active');
                }
            },
            
            async onEnd(evt) {
                // Remove the dark overlay
                const table = document.querySelector('.min-w-max.relative');
                if (table) {
                    table.classList.remove('is-dragging-active');
                }
                
                // Call your function to handle reordering and saving to Firestore
                await handleTaskMoved(evt);
            }
        });
        
        if (!addTaskAtTop) {
            // Add task row
            const addRow = document.createElement('div');
            addRow.className = 'add-task-row-wrapper flex group';
            addRow.dataset.sectionId = section.id;
            
            const leftAddCell = document.createElement('div');
            leftAddCell.className = 'sticky left-0 w-80 md:w-96 lg:w-[400px] flex-shrink-0 flex items-center px-3 py-0.5 group-hover:bg-slate-100 juanlunacms-spreadsheetlist-left-sticky-pane juanlunacms-spreadsheetlist-sticky-pane-bg';
            
            const indentedText = document.createElement('div');
            indentedText.className = 'add-task-btn flex items-center gap-2 ml-8 text-slate-500 cursor-pointer hover:bg-slate-200 px-2 py-1 rounded transition';
            indentedText.dataset.sectionId = section.id;
            indentedText.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
    <span class="text-sm">Add task...</span>
`;
            leftAddCell.appendChild(indentedText);
            
            const rightAddCells = document.createElement('div');
            rightAddCells.className = 'flex-grow flex group-hover:bg-slate-100';
            
            // This loop creates the footer cells (including the "Sum:" cell)
            allColumns.forEach((col, i) => {
                const cell = document.createElement('div');
                const leftBorderClass = i === 0 ? 'border-l border-slate-200' : '';
                
                // --- MODIFICATION FOR FOOTER CELLS ---
                // 1. REMOVE the hardcoded width class 'w-44' and 'flex-shrink-0'.
                // The sync function will now control the width.
                cell.className = `h-full ${leftBorderClass}`;
                
                // 2. ADD the data-column-id so the sync function can find this cell.
                cell.dataset.columnId = col.id;
                // --- END OF MODIFICATION ---
                
                // This is your existing logic to calculate and show the sum. It remains unchanged.
                // This is your existing logic to calculate and show the sum.
                if (col.type === 'Costing') {
                    const sum = section.tasks.reduce((accumulator, task) => {
                        const value = task.customFields?.[col.id];
                        return typeof value === 'number' ? accumulator + value : accumulator;
                    }, 0);
                    
                    if (sum > 0) {
                        let formattedSum;
                        
                        // Check if the sum is a whole number (e.g., 1250.00)
                        if (sum % 1 === 0) {
                            // If yes, format it with commas and NO decimal places.
                            formattedSum = sum.toLocaleString('en-US', {
                                maximumFractionDigits: 0
                            });
                        } else {
                            // If no, format it with commas and exactly TWO decimal places.
                            formattedSum = sum.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            });
                        }
                        
                        
                        // Note: The commented out currencySymbol line remains for future use.
                        // const currencySymbol = col.currency || '$';
                        
                        cell.innerHTML = `
            <div style="font-size: 0.8rem; display: flex; justify-content: flex-start; align-items: center; height: 100%; padding-right: 8px;">
              <span style="color: #9ca3af; margin-right: 4px;">Sum:</span>
              <span style="font-weight: 600; color: #4b5563;">${formattedSum}</span>
            </div>
        `;
                    }
                }
                
                rightAddCells.appendChild(cell);
            });
            
            const emptyAddCellLast = document.createElement('div');
            emptyAddCellLast.className = 'w-12 flex-shrink-0 h-full';
            rightAddCells.appendChild(emptyAddCellLast);
            
            const emptyEndSpacerLast = document.createElement('div');
            emptyEndSpacerLast.className = 'w-4 flex-shrink-0 h-full';
            rightAddCells.appendChild(emptyEndSpacerLast);
            
            addRow.appendChild(leftAddCell);
            addRow.appendChild(rightAddCells);
            sectionWrapper.appendChild(addRow);
        }
        
    });
    
    
    
    body.appendChild(sectionGroupsContainer);
    
    table.appendChild(header);
    table.appendChild(body);
    container.appendChild(table);
    taskListBody.appendChild(container);
    
    // --- DYNAMIC SHADOWS SCRIPT ---
    const stickyHeader = container.querySelector('.juanlunacms-spreadsheetlist-sticky-header');
    const dynamicBorders = container.querySelectorAll('.juanlunacms-spreadsheetlist-dynamic-border');
    const leftHeaderPane = container.querySelector('.juanlunacms-spreadsheetlist-left-sticky-pane');
    const allStickyPanes = container.querySelectorAll('.juanlunacms-spreadsheetlist-left-sticky-pane');
    
    container.scrollTop = scrollState.top;
    container.scrollLeft = scrollState.left;
    
    container.addEventListener('scroll', () => {
        const scrolled = container.scrollLeft > 0;
        // Shadow for main header
        if (container.scrollTop > 0) {
            stickyHeader.classList.add('shadow-md');
        } else {
            stickyHeader.classList.remove('shadow-md');
        }
        // Shadow and border for left task pane cells
        if (scrolled) {
            allStickyPanes.forEach(pane => {
                pane.classList.add('juanlunacms-spreadsheetlist-shadow-right-custom');
            });
            dynamicBorders.forEach(pane => {
                pane.classList.remove('border-transparent');
                pane.classList.add('border-slate-200');
            });
        } else {
            allStickyPanes.forEach(pane => {
                pane.classList.remove('juanlunacms-spreadsheetlist-shadow-right-custom');
            });
            dynamicBorders.forEach(pane => {
                pane.classList.add('border-transparent');
                pane.classList.remove('border-slate-200');
            });
        }
    });
    
    Sortable.create(sectionGroupsContainer, {
        handle: '.drag-handle',
        animation: 300,
        
        // The onStart handler is no longer needed for any visual changes.
        // The CSS handles it automatically.
        onStart(evt) {
            console.log(`Started dragging section: ${evt.item.dataset.sectionId}`);
        },
        
        // The onEnd handler is now only responsible for saving the new order.
        async onEnd(evt) {
            try {
                console.log("Drag ended. Saving new section order...");
                await handleSectionReorder(evt);
            } catch (error) {
                console.error("Failed to save new section order after drag.", error);
            }
        }
    });
    
    syncColumnWidths();
    initColumnResizing();
    initColumnDragging();
    if (taskIdToFocus) {
        // Find the new task row's editable name field using the ID we saved
        const taskToFocusEl = taskListBody.querySelector(`[data-task-id="${taskIdToFocus}"] .task-name`);
        
        if (taskToFocusEl) {
            taskToFocusEl.focus(); // Set the browser's focus on the element
            
            // This places the cursor correctly inside the contenteditable span
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(taskToFocusEl);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        
        // Reset the variable so it doesn't try to focus again on the next render
        taskIdToFocus = null;
    }
    
}

function initColumnDragging() {
const headerContainer = document.querySelector('.juanlunacms-spreadsheetlist-sticky-header .flex-grow');
if (!headerContainer) return;
    
    Sortable.create(headerContainer, {
        animation: 150,
        handle: '.group',
        filter: '.resize-handle',
        onEnd: async (evt) => {
            if (evt.oldIndex === evt.newIndex) return;
            
            // --- SIMPLIFIED LOGIC ---
            
            // 1. Get the new order of column IDs directly from the DOM after the drop.
            const newColumnOrder = Array.from(evt.to.children)
                .map(el => el.dataset.columnId)
                .filter(id => id); // Filter out any non-column elements
            
            // 2. Optimistically update the local state.
            project.columnOrder = newColumnOrder;
            
            // 3. Trigger a re-render immediately for a snappy UI.
            render();
            
            // 4. Save the new array directly to Firestore in the background.
            try {
                await updateProjectInFirebase({
                    columnOrder: newColumnOrder // Just save the one new field
                });
                console.log("Column order saved to Firestore successfully.");
            } catch (error) {
                console.error("Failed to save new column order:", error);
            }
        }
    });
}

function initColumnResizing() {
    const table = document.querySelector('.min-w-max.relative');
    if (!table) return;
    
    // These variables will be set when a drag operation starts.
    let initialX, initialWidth, columnId;
    let columnSpecificMinWidth; // This will hold the minimum width for the column being dragged.
    
    const onDragMove = (e) => {
        const currentX = e.touches ? e.touches[0].clientX : e.clientX;
        const deltaX = currentX - initialX;
        
        // Use the dynamically set minimum width from the onDragStart event.
        const newWidth = Math.max(columnSpecificMinWidth, initialWidth + deltaX);
        
        const cellsToResize = table.querySelectorAll(`[data-column-id="${columnId}"]`);
        cellsToResize.forEach(cell => {
            cell.style.width = `${newWidth}px`;
            cell.style.minWidth = `${newWidth}px`;
        });
    };
    
    const onDragEnd = () => {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
    };
    
    const onDragStart = (e) => {
        if (!e.target.classList.contains('resize-handle')) return;
        
        e.preventDefault();
        
        const headerCell = e.target.parentElement;
        columnId = headerCell.dataset.columnId;
        initialX = e.touches ? e.touches[0].clientX : e.clientX;
        initialWidth = headerCell.offsetWidth;
        
        // --- MIRRORED LOGIC FROM syncColumnWidths ---
        // Here, we determine the correct minimum width for THIS specific column.
        if (columnId === 'priority' || columnId === 'status') {
            columnSpecificMinWidth = 100;
        } else if (columnId === 'dueDate') {
            columnSpecificMinWidth = 120;
        } else if (columnId === 'assignees') {
            columnSpecificMinWidth = 120;
        } else {
            columnSpecificMinWidth = 150; // Default minimum width
        }
        console.log(`[DEBUG] Resizing column '${columnId}' with a minimum width of ${columnSpecificMinWidth}px.`);
        // --- END MIRRORED LOGIC ---
        
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove);
        document.addEventListener('touchend', onDragEnd);
    };
    
    // Attach the starting event listeners
    table.addEventListener('mousedown', onDragStart);
    table.addEventListener('touchstart', onDragStart, { passive: false });
}

function syncColumnWidths() {
    const table = document.querySelector('.min-w-max.relative');
    if (!table) return;
    
    // Get the header container specifically
    const headerContainer = table.querySelector('.juanlunacms-spreadsheetlist-sticky-header');
    if (!headerContainer) return;
    
    const allColumnIds = [
        'assignees', 'dueDate', 'priority', 'status',
        ...project.customColumns.map(c => c.id)
    ];
    
    allColumnIds.forEach(columnId => {
        // 1. Find the HEADER cell ONLY for this column.
        const headerCell = headerContainer.querySelector(`[data-column-id="${columnId}"]`);
        if (!headerCell) return;
        
        // 2. Measure the full, untruncated width of the header's text content.
        const textElement = headerCell.querySelector('.header-cell-content');
        const headerContentWidth = textElement ? textElement.scrollWidth : 0;
        
        // 3. Define the minimum width for this column type.
        let minWidth = 150; // Default minimum width
        if (columnId === 'priority' || columnId === 'status') {
            minWidth = 100;
        } else if (columnId === 'dueDate') {
            minWidth = 120;
        } else if (columnId === 'assignees') {
            minWidth = 80;
        }
        
        // 4. The final width is the LARGER of the minimum width or the actual header text width.
        // We add a buffer to account for padding, icons, etc.
        const finalWidth = Math.max(minWidth, headerContentWidth) + 32;
        
        // 5. Apply this final, calculated width to ALL cells in the column (header and body).
        const allCellsInColumn = table.querySelectorAll(`[data-column-id="${columnId}"]`);
        allCellsInColumn.forEach(cell => {
            cell.style.width = `${finalWidth}px`;
            cell.style.minWidth = `${finalWidth}px`;
        });
    });
}

function handleMouseMoveDragGhost(e) {
    if (!window._currentGhost) return;
    window._currentGhost.style.left = `${e.clientX}px`;
    window._currentGhost.style.top = `${e.clientY}px`;
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
    
    const sectionWrapper = buttonEl.closest('.section-row-wrapper, .section-title-wrapper');
    const sectionId = sectionWrapper ? sectionWrapper.dataset.sectionId : null;
    
    if (!sectionId) {
        console.error("Could not find sectionId for the options menu.");
        return;
    }
    
    // --- NEW LOGIC TO CHECK SECTION TYPE ---
    
    // 1. Find the full section object from our project data using the sectionId.
    const section = project.sections.find(s => s.id === sectionId);
    
    // 2. Define the list of protected section types that cannot be deleted.
    const protectedTypes = ['completed', 'todo', 'doing'];
    
    // 3. Check if the current section is a protected type.
    //    We check if `section` exists and if its `sectionType` is in our list.
    const isProtected = section && protectedTypes.includes(section.sectionType);
    
    // --- END OF NEW LOGIC ---
    
    const menu = document.createElement('div');
    menu.className = 'options-dropdown-menu';
    
    // 4. Conditionally build the menu's HTML.
    // Start with the options that are always available.
    let menuHTML = `
        <div class="dropdown-item" data-action="addTask" data-section-id="${sectionId}">
            <i class="fa-solid fa-plus dropdown-icon"></i>
            <span>Add task</span>
        </div>
        <div class="dropdown-item" data-action="renameSection" data-section-id="${sectionId}">
            <i class="fa-solid fa-pen dropdown-icon"></i>
            <span>Rename section</span>
        </div>
    `;
    
    // ONLY if the section is NOT protected, add the "Delete" option.
    if (!isProtected) {
        menuHTML += `
            <div class="dropdown-item" data-action="deleteSection" data-section-id="${sectionId}">
                <i class="fa-solid fa-trash dropdown-icon dropdown-item-danger"></i>
                <span class="dropdown-item-danger">Delete section</span>
            </div>
        `;
    }
    
    menu.innerHTML = menuHTML;
    
    document.body.appendChild(menu);
    activeMenuButton = buttonEl;
    updateMenuPosition();
    taskListBody.addEventListener('scroll', updateMenuPosition, { passive: true });
}

/**
 * Deletes a section and all of its tasks from Firestore after user confirmation.
 * This operation is irreversible.
 * @param {string} sectionId The ID of the section to delete.
 */
async function deleteSectionInFirebase(sectionId) {
    
    // Use the existing confirmation modal to warn the user
    const confirmed = await showConfirmationModal(
        'Are you sure you want to delete this section? All tasks within it will be permanently lost. This action cannot be undone.'
    );
    
    // If the user clicks "Cancel", stop the function
    if (!confirmed) {
        console.log("Section deletion cancelled by user.");
        return;
    }
    
    console.log(`User confirmed deletion for section: ${sectionId}. Proceeding...`);
    
    const basePath = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}`;
    const sectionPath = `${basePath}/sections/${sectionId}`;
    const tasksPath = `${sectionPath}/tasks`;
    
    const batch = writeBatch(db);
    
    try {
        // 1. Get all tasks in the section's subcollection
        const tasksQuery = query(collection(db, tasksPath));
        const tasksSnapshot = await getDocs(tasksQuery);
        
        // 2. Add each task to the batch for deletion
        if (!tasksSnapshot.empty) {
            console.log(`Found ${tasksSnapshot.size} tasks to delete.`);
            tasksSnapshot.forEach(taskDoc => {
                batch.delete(taskDoc.ref);
            });
        }
        
        // 3. Add the section document itself to the batch for deletion
        const sectionRef = doc(db, sectionPath);
        batch.delete(sectionRef);
        
        // 4. Commit the batch to delete everything at once
        await batch.commit();
        console.log(`Successfully deleted section ${sectionId} and all its tasks.`);
        
    } catch (error) {
        console.error("Error deleting section and its tasks:", error);
        alert("An error occurred while deleting the section. Please check the console.");
    }
}

/**
 * Moves a task to a different section using only the task's ID and the target section's ID.
 * This function preserves the task's original document ID during the move.
 *
 * @param {string} taskId The ID of the task to move.
 * @param {string} targetSectionId The ID of the destination section.
 */
/**
 * Handles the logic for completing or un-completing a task in a single, atomic operation.
 * This function now builds a single Firestore batch to prevent race conditions.
 *
 * @param {string} taskId - The ID of the task being toggled.
 * @param {HTMLElement} taskRowEl - The DOM element for the task row for UI updates.
 */
async function handleTaskCompletion(taskId, taskRowEl) {
    if (!taskRowEl) return;
    
    // --- 1. Get current state from local data ---
    const { task, section: sourceSection } = findTaskAndSection(taskId);
    if (!task || !sourceSection) {
        console.error("Could not find task or its section to update completion status.");
        return;
    }
    
    // A write batch will group all our database changes into one transaction.
    const batch = writeBatch(db);
    const isCurrentlyCompleted = task.status === 'Completed';
    
    if (isCurrentlyCompleted) {
        // --- LOGIC FOR UN-COMPLETING A TASK ---
        console.log(`Un-completing task: "${task.name}"`);
        
        // Determine the section to move the task back to.
        // Fallback to the current section's ID if no previous one is stored.
        const targetSectionId = task.previousSectionId || sourceSection.id;
        const targetSection = findSectionById(targetSectionId); // You need this helper function
        
        if (!targetSection) {
            console.error(`Cannot un-complete task. Target section with ID "${targetSectionId}" not found.`);
            return;
        }
        
        // Prepare the updated task data.
        const updatedTaskData = {
            ...task,
            status: task.previousStatus || 'On track', // Revert to previous status or a default
            sectionId: targetSection.id,
            // Optionally, clear the 'previous' fields now that they've been used.
            previousStatus: null,
            previousSectionId: null,
        };
        
        // Define document references for the batch operation.
        const sourceTaskRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${sourceSection.id}/tasks/${taskId}`);
        const targetTaskRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${targetSection.id}/tasks/${taskId}`);
        
        // Add operations to the batch: delete the old doc, create the new one.
        batch.delete(sourceTaskRef);
        batch.set(targetTaskRef, updatedTaskData);
        
    } else {
        // --- LOGIC FOR COMPLETING A TASK ---
        console.log(`Completing task: "${task.name}"`);
        
        // Find the dedicated "Completed" section.
        const completedSection = project.sections.find(s => s.sectionType === 'completed');
        
        if (!completedSection) {
            console.error("Cannot complete task: A section with sectionType: 'completed' was not found.");
            // As a fallback, you could just update the status without moving.
            // For now, we'll just exit.
            return;
        }
        
        // Prepare the updated task data, saving the current state for potential reversal.
        const updatedTaskData = {
            ...task,
            status: 'Completed',
            previousStatus: task.status, // Save current status
            previousSectionId: sourceSection.id, // Save current section ID
            sectionId: completedSection.id,
        };
        
        // Define document references.
        const sourceTaskRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${sourceSection.id}/tasks/${taskId}`);
        const targetTaskRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${completedSection.id}/tasks/${taskId}`);
        
        // Add operations to the batch.
        batch.delete(sourceTaskRef);
        batch.set(targetTaskRef, updatedTaskData);
    }
    
    // --- 2. Execute the batch and then update the UI ---
    try {
        await batch.commit();
        console.log(`Task ${taskId} completion status updated successfully in Firestore.`);
        
        // Now that the data operation is confirmed, safely update the UI.
        if (isCurrentlyCompleted) {
            taskRowEl.classList.remove('is-completed');
        } else {
            taskRowEl.classList.add('is-completed');
        }
    } catch (error) {
        console.error(`Error updating task completion for ${taskId}:`, error);
        // Optionally, revert any optimistic UI changes here if you were to use them.
    }
}


/**
 * A corrected version of your moveTaskToSection function for OTHER use cases 
 * (like drag-and-drop), but it is NO LONGER USED by handleTaskCompletion.
 * * @param {string} taskId - ID of the task to move.
 * @param {string} targetSectionId - ID of the destination section.
 */
async function moveTaskToSection(taskId, targetSectionId) {
    // 1. Get all necessary data objects first.
    const { task: taskToMove, section: sourceSection } = findTaskAndSection(taskId);
    // FIX: Get the full target section object, not just the ID.
    const targetSection = findSectionById(targetSectionId);
    
    // 2. Improved validation.
    if (!taskToMove || !sourceSection || !targetSection || sourceSection.id === targetSectionId) {
        console.error("Cannot move task. Invalid source task, source section, or target section.");
        return;
    }
    
    // 3. Prepare the data for the new document.
    const newTaskData = {
        ...taskToMove,
        sectionId: targetSectionId,
        id: taskId,
    };
    
    // Note: If you need status-change logic during a generic move, you can add it here.
    // This example keeps it a pure "move" operation.
    
    // 4. Define document references.
    const sourceTaskRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${sourceSection.id}/tasks/${taskId}`);
    const newTaskRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${targetSectionId}/tasks/${taskId}`);
    
    try {
        // 5. Atomically delete the old document and create the new one.
        const batch = writeBatch(db);
        batch.delete(sourceTaskRef);
        batch.set(newTaskRef, newTaskData);
        await batch.commit();
        console.log(`Task ${taskId} moved successfully to section ${targetSectionId}.`);
    } catch (error) {
        console.error("Error moving task:", error);
    }
}

function findSectionById(sectionId) {
    // Example implementation:
    return project.sections.find(section => section.id === sectionId);
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

function createDropdown(options, targetEl, callback, optionType = null, columnId = null) {
    if (!targetEl) return console.error("createDropdown was called with a null target element.");
    
    closeFloatingPanels(); // Your function to close other panels
    
    const dropdown = document.createElement('div');
    dropdown.className = 'context-dropdown';
    
    // --- The rest of your logic for building the items is good ---
    const isEditable = optionType === 'Priority' || optionType === 'Status' || optionType === 'Type' || optionType === 'CustomColumn';
    
    options.forEach(option => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        
        let itemHTML = '';
        if (option.color) {
            itemHTML += `<span class="dropdown-color-swatch" style="background-color: ${option.color};"></span>`;
        } else {
            itemHTML += `<span class="dropdown-color-swatch-placeholder"></span>`;
        }
        itemHTML += `<span class="dropdown-item-name">${option.name}</span>`;
        item.innerHTML = itemHTML;
        
        item.addEventListener('click', (e) => {
            if (e.target.closest('.dropdown-item-edit-btn')) return;
            callback(option);
        });
        
        if (isEditable && option.name) {
            const editBtn = document.createElement('button');
            editBtn.className = 'dropdown-item-edit-btn';
            editBtn.innerHTML = `<i class="fas fa-pencil-alt fa-xs"></i>`; // Assumes Font Awesome is loaded
            editBtn.title = 'Edit Option';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeFloatingPanels();
                openEditOptionDialog(optionType, option, columnId);
            });
            item.appendChild(editBtn);
        }
        
        dropdown.appendChild(item);
    });
    
    if (isEditable) { // Simplified the check here
        const separator = document.createElement('hr');
        separator.className = 'dropdown-separator';
        dropdown.appendChild(separator);
        
        const addNewItem = document.createElement('div');
        addNewItem.className = 'dropdown-item';
        addNewItem.innerHTML = `<span class="dropdown-color-swatch-placeholder"><i class="fas fa-plus fa-xs"></i></span><span>Add New...</span>`;
        
        if (optionType === 'CustomColumn') {
            addNewItem.addEventListener('click', () => openCustomColumnOptionDialog(columnId));
        } else if (optionType === 'Priority' || optionType === 'Status') {
            addNewItem.addEventListener('click', () => openCustomOptionDialog(optionType));
        }
        
        dropdown.appendChild(addNewItem);
    }
    
    document.body.appendChild(dropdown);

// 2. Get all the measurements we need.
const rect = targetEl.getBoundingClientRect(); // The position of the element that was clicked
const dropdownWidth = dropdown.offsetWidth; // The full width of our new dropdown
const viewportWidth = window.innerWidth; // The width of the browser window

// 3. Set the vertical position (this is always the same).
dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;

// 4. Check if the dropdown will overflow the right side of the screen.
if ((rect.left + dropdownWidth) > viewportWidth) {
    // --- Mirroring Logic ---
    // It overflows! Align its RIGHT edge with the target's RIGHT edge.
    console.log("Dropdown overflow detected. Mirroring position.");
    dropdown.style.left = `${rect.right + window.scrollX - dropdownWidth}px`;
} else {
    // --- Default Alignment ---
    // It fits perfectly. Align its LEFT edge with the target's LEFT edge.
    dropdown.style.left = `${rect.left + window.scrollX}px`;
}

// 5. Now that it's positioned correctly, make it visible.
dropdown.style.visibility = 'visible';

}

function showDatePicker(targetEl, sectionId, taskId) {
    closeFloatingPanels();
    
    const dropdownPanel = document.createElement('div');
    dropdownPanel.className = 'context-dropdown datepicker-panel';
    dropdownPanel.style.position = 'absolute';
    dropdownPanel.style.visibility = 'hidden';
    dropdownPanel.style.zIndex = '9999'; // Ensure it's on top
    
    const datepickerContainer = document.createElement('div');
    dropdownPanel.appendChild(datepickerContainer);
    document.body.appendChild(dropdownPanel); // Use body instead of mainContainer
    
    requestAnimationFrame(() => {
        const targetRect = targetEl.getBoundingClientRect();
        const panelRect = dropdownPanel.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // Vertical positioning: prefer below, fallback above if no space
        let top = targetRect.bottom + 4;
        if (top + panelRect.height > viewportHeight) {
            top = targetRect.top - panelRect.height - 4;
        }
        
        // Horizontal positioning: align left with target
        let left = targetRect.left;
        if (left + panelRect.width > viewportWidth) {
            left = viewportWidth - panelRect.width - 8; // 8px margin from right
        }
        
        dropdownPanel.style.top = `${top}px`;
        dropdownPanel.style.left = `${left}px`;
        dropdownPanel.style.visibility = 'visible';
        
        // Initialize datepicker
        const datepicker = new Datepicker(datepickerContainer, {
            autohide: true,
            format: 'yyyy-mm-dd',
            todayHighlight: true,
        });
        
        const { task } = findTaskAndSection(taskId);
        if (task && task.dueDate) {
            datepicker.setDate(task.dueDate);
        }
        
        datepickerContainer.addEventListener(
            'changeDate',
            (e) => {
                const formattedDate = Datepicker.formatDate(e.detail.date, 'yyyy-mm-dd');
                updateTask(taskId, sectionId, { dueDate: formattedDate });
                targetEl.querySelector('span').textContent = formattedDate;
                closeFloatingPanels();
            }, { once: true }
        );
    });
}

function showAssigneeDropdown(targetEl, taskId) {
    closeFloatingPanels();
    
    const { task, section } = findTaskAndSection(taskId);
    if (!task || !section) return;
    
    const dropdown = document.createElement('div');
    dropdown.className = 'context-dropdown';
    dropdown.style.visibility = 'hidden'; // measure after append
    
    // --- Search Input ---
    const searchInput = document.createElement('input');
    searchInput.className = 'dropdown-search-input';
    searchInput.type = 'text';
    searchInput.placeholder = 'Search teammates...';
    dropdown.appendChild(searchInput);
    
    // --- List Container ---
    const listContainer = document.createElement('div');
    listContainer.className = 'dropdown-list';
    dropdown.appendChild(listContainer);
    
    // --- Invite Container (for email) ---
    const inviteContainer = document.createElement('div');
    inviteContainer.className = 'email-container hidden';
    inviteContainer.id = 'email-container-id-people';
    inviteContainer.innerHTML = `
        <span class="material-icons-outlined email">email</span>
        <h1 class="email-text">Invite teammates via Email</h1>
    `;
    inviteContainer.addEventListener('click', () => {
        const email = searchInput.value.trim();
        if (!validateEmail(email)) return;
        
        // Check if there are members in the project
        if (allUsers.length <= 1) {
            openShareModal(); // Example: open invite teammates modal
        } else {
            openAssignModal(email); // Optional: your modal to confirm assign
        }
        
        closeFloatingPanels();
    });
    dropdown.appendChild(inviteContainer);
    
    // --- Render user list based on input ---
    const renderList = (searchTerm = '') => {
        const lower = searchTerm.toLowerCase();
        const filtered = allUsers.filter(u => u.name.toLowerCase().includes(lower));
        
        listContainer.innerHTML = '';
        filtered.forEach(user => {
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
                updateTask(taskId, section.id, { assignees: newAssignees });
                closeFloatingPanels();
            });
            listContainer.appendChild(item);
        });
        
        // Show invite option if valid email
        if (validateEmail(searchTerm)) {
            inviteContainer.classList.remove('hidden');
        } else {
            inviteContainer.classList.add('hidden');
        }
    };
    
    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    
    renderList();
    searchInput.addEventListener('input', () => renderList(searchInput.value));
    
    document.body.appendChild(dropdown);
    
    requestAnimationFrame(() => {
        positionFloatingPanel(targetEl, dropdown);
        searchInput.focus();
    });
}

function showAssignModal(email, taskId, sectionId) {
    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Assign this email?</h2>
            <p>You're about to assign <strong>${email}</strong> to this task.</p>
            <button id="confirm-assignee">Confirm</button>
            <button id="cancel-assignee">Cancel</button>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('#confirm-assignee').addEventListener('click', () => {
        //sendInviteEmail(email); // ✅ invite logic
        modal.remove();
    });
    
    modal.querySelector('#cancel-assignee').addEventListener('click', () => {
        modal.remove();
    });
}

function createAssigneeHTML(assignees) {
    // If no one is assigned, show the 'add' button.
    if (!assignees || assignees.length === 0) {
        return `<div class="add-assignee-btn" data-control="assignee"><i class="fas fa-plus"></i></div>`;
    }
    
    const assigneeId = assignees[0];
    const user = allUsers.find(u => u.id === assigneeId);
    
    if (!user) {
        return `<div class="add-assignee-btn" data-control="assignee"><i class="fas fa-plus"></i></div>`;
    }
    
    return `
        <div class="assignee-cell-content assigneelistviewprofile-${user.id}" data-control="assignee">
            <img class="profile-picture rounded-avatar" src="${user.avatar}" title="${user.name}">
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
        isCustom: true,
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
    
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'dialog-overlay';
    console.log('opened');
    let previewHTML = '';
    if (columnType === 'Costing') {
        previewHTML = `<div class="preview-value">$1,234.56</div><p>Formatted as currency. The sum will be shown in the footer.</p>`;
    } else if (columnType === 'Numbers') {
        previewHTML = `<div class="preview-value">1,234</div><p>Track plain number values. Sum will be shown in footer.</p>`;
    } else {
        previewHTML = `<div class="preview-value">Any text value</div><p>Freeform label or comment.</p>`;
    }
    
    let typeSpecificFields = '';
    if (columnType === 'Costing') {
        typeSpecificFields = `
            <div class="form-group">
                <label>Currency</label>
                <select id="column-currency">
                    <option value="$">USD ($)</option>
                    <option value="₱">PHP (₱)</option>
                    <option value="A$">AUD (A$)</option>
                </select>
            </div>`;
    }
    
    dialogOverlay.innerHTML = `
        <div class="dialog-box">
            <div class="dialog-header">Add "${columnType}" Column</div>
            <div class="dialog-body">
                <div class="form-group">
                    <label for="column-name">Column Name</label>
                    <input type="text" id="column-name" placeholder="e.g., Budget">
                </div>
                ${typeSpecificFields}
                <div class="dialog-preview-box">${previewHTML}</div>
            </div>
            <div class="dialog-footer">
                <button class="dialog-button" id="cancel-add-column">Cancel</button>
                <button class="dialog-button primary" id="confirm-add-column">Add Column</button>
            </div>
        </div>
    `;
    
    // Append to body
    document.body.appendChild(dialogOverlay);
    
    // Focus input on open
    const inputEl = document.getElementById('column-name');
    if (inputEl) inputEl.focus();
    
    // Close function
    const closeDialog = () => {
        dialogOverlay.remove();
    };
    
    // Cancel Button
    document.getElementById('cancel-add-column').addEventListener('click', closeDialog);
    
    // Confirm Add Column
    document.getElementById('confirm-add-column').addEventListener('click', () => {
        const columnName = document.getElementById('column-name').value.trim();
        if (!columnName) {
            alert('Please enter a column name.');
            return;
        }
        
        const config = {
            name: columnName,
            type: columnType,
            currency: document.getElementById('column-currency')?.value || null
        };
        
        addNewColumn(config); // Your logic to push column into Firestore/local data
        closeDialog(); // Close dialog after
    });
    
    // Dismiss modal when clicking outside
    dialogOverlay.addEventListener('click', (e) => {
        if (e.target === dialogOverlay) closeDialog();
    });
}

function openCustomColumnCreatorDialog() {
    closeFloatingPanels();
    
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'dialog-overlay';
    
    const baseTypeOptionsHTML = baseColumnTypes
        .map(type => `<option value="${type}">${type}</option>`)
        .join('');
    
    dialogOverlay.innerHTML = `
        <div class="dialog-box">
            <div class="dialog-header">Create Custom Column</div>
            <div class="dialog-body">
                <div class="form-group">
                    <label for="custom-column-name">Column Name</label>
                    <input type="text" id="custom-column-name" placeholder="e.g., T-Shirt Size">
                </div>
                <div class="form-group">
                    <label for="base-column-type">Select Data Type</label>
                    <select id="base-column-type">${baseTypeOptionsHTML}</select>
                </div>
                <div id="type-specific-options-custom"></div>
            </div>
            <div class="dialog-footer">
                <button class="dialog-button" id="cancel-custom-column">Cancel</button>
                <button class="dialog-button primary" id="confirm-custom-column">Add Column</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialogOverlay);
    
    // Auto-focus
    const columnNameInput = document.getElementById('custom-column-name');
    if (columnNameInput) columnNameInput.focus();
    
    const baseTypeSelect = document.getElementById('base-column-type');
    const specificOptionsContainer = document.getElementById('type-specific-options-custom');
    
    const renderTypeSpecificOptions = (selectedType) => {
        let extraFields = '';
        if (selectedType === 'Costing') {
            extraFields = `
                <div class="form-group">
                    <label>Currency</label>
                    <select id="column-currency">
                        <option value="$">USD ($)</option>
                        <option value="€">EUR (€)</option>
                        <option value="₱">PHP (₱)</option>
                    </select>
                </div>`;
        }
        specificOptionsContainer.innerHTML = extraFields;
    };
    
    // Render on change and init
    baseTypeSelect.addEventListener('change', () => renderTypeSpecificOptions(baseTypeSelect.value));
    renderTypeSpecificOptions(baseTypeSelect.value);
    
    // Confirm button
    document.getElementById('confirm-custom-column').addEventListener('click', () => {
        const name = document.getElementById('custom-column-name').value.trim();
        const type = baseTypeSelect.value;
        const currency = document.getElementById('column-currency')?.value || null;
        
        if (!name) {
            alert('Please enter a column name.');
            return;
        }
        
        addNewColumn({ name, type, currency });
        dialogOverlay.remove(); // Close modal
    });
    
    // Cancel button
    document.getElementById('cancel-custom-column').addEventListener('click', () => {
        dialogOverlay.remove();
    });
    
    // Click outside closes dialog
    dialogOverlay.addEventListener('click', e => {
        if (e.target === dialogOverlay) dialogOverlay.remove();
    });
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
    
    const closeDialog = () => dialogOverlay.remove();
    
    document.getElementById('cancel-add-option').addEventListener('click', closeDialog);
    
    document.getElementById('confirm-add-option').addEventListener('click', () => {
        const name = document.getElementById('custom-option-name').value.trim();
        const color = document.getElementById('custom-option-color').value;
        if (name) {
            addNewCustomOption(optionType, { name, color });
            closeDialog();
        } else {
            alert('Please enter a name for the option.');
        }
    });
    
    dialogOverlay.addEventListener('click', e => {
        if (e.target === dialogOverlay) closeDialog();
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
    
    const closeDialog = () => dialogOverlay.remove();
    
    document.getElementById('cancel-add-option').addEventListener('click', closeDialog);
    
    document.getElementById('confirm-add-option').addEventListener('click', () => {
        const name = document.getElementById('custom-option-name').value.trim();
        const color = document.getElementById('custom-option-color').value;
        if (name) {
            addNewCustomColumnOption(columnId, { name, color });
            closeDialog();
        } else {
            alert('Please enter a name for the option.');
        }
    });
    
    dialogOverlay.addEventListener('click', e => {
        if (e.target === dialogOverlay) closeDialog();
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

/**
 * Collapses an expanded section, removing its task rows and updating its state.
 * @param {string} sectionId - The ID of the section to collapse.
 */
async function collapseExpandedSection(sectionId) {
    console.log(`🚀 Collapsing section ${sectionId}...`);
    // Note: We find the toggle icon inside the '.section-title-wrapper' as per your code
    const sectionHeader = document.querySelector(`.section-title-wrapper[data-section-id="${sectionId}"]`);
    const chevron = sectionHeader ? sectionHeader.querySelector('.section-toggle') : null;
    
    // --- 1. Update the UI immediately ---
    chevron.classList.replace('fa-chevron-down', 'fa-chevron-right');
    
    // --- 2. Update Firestore in the background ---
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated.");
        
        const basePath = await _getSelectedProjectPath(db, user.uid);
        const sectionRef = doc(db, `${basePath}/sections/${sectionId}`);
        await updateDoc(sectionRef, { isCollapsed: false });
        console.log(`✅ Section ${sectionId} marked as collapsed in Firestore.`);
        
        
    } catch (error) {
        console.error("❌ Error updating section collapse state:", error);
        // Optional: Revert UI changes if Firestore update fails
        chevron.classList.replace('fa-chevron-right', 'fa-chevron-down');
        // You would also need to re-render the tasks here if you want a full revert.
    }
}

async function expandCollapsedSection(sectionId) {
    console.log(`🚀 Collapsing section ${sectionId}...`);
    // Note: We find the toggle icon inside the '.section-title-wrapper' as per your code
    const sectionHeader = document.querySelector(`.section-title-wrapper[data-section-id="${sectionId}"]`);
    const chevron = sectionHeader ? sectionHeader.querySelector('.section-toggle') : null;
    
    // --- 1. Update the UI immediately ---
    chevron.classList.replace('fa-chevron-right', 'fa-chevron-down');
    
    // --- 2. Update Firestore in the background ---
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated.");
        
        const basePath = await _getSelectedProjectPath(db, user.uid);
        const sectionRef = doc(db, `${basePath}/sections/${sectionId}`);
        await updateDoc(sectionRef, { isCollapsed: true });
        console.log(`✅ Section ${sectionId} marked as collapsed in Firestore.`);
        
    } catch (error) {
        console.error("❌ Error updating section collapse state:", error);
        // Optional: Revert UI changes if Firestore update fails
        chevron.classList.replace('fa-chevron-down', 'fa-chevron-right');
        // You would also need to re-render the tasks here if you want a full revert.
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

function initializeDragAndDrop(gridWrapper) {
    // Ensure we don't attach multiple listeners on re-renders
    if (gridWrapper.dataset.dragInit === 'true') return;
    gridWrapper.dataset.dragInit = 'true';
    
    gridWrapper.addEventListener('mousedown', handleDragStart);
    gridWrapper.addEventListener('touchstart', handleDragStart, { passive: false });
}

function handleDragStart(e) {
    const dragHandle = e.target.closest('.drag-handle');
    if (!dragHandle) return;
    
    e.preventDefault();
    
    const taskRow = dragHandle.closest('.task-row-wrapper');
    const sectionRow = dragHandle.closest('.section-row-wrapper');
    
    if (taskRow) {
        draggedElement = taskRow;
    } else if (sectionRow) {
        // When dragging a section, we drag the whole wrapper
        draggedElement = sectionRow.closest('.section-wrapper');
    } else {
        return;
    }
    
    if (!draggedElement) return;
    
    sourceContainer = draggedElement.closest('.grid-wrapper');
    originalNextSibling = draggedElement.nextSibling;
    dragHasMoved = false;
    
    // --- Placeholder for CSS Grid ---
    placeholder = document.createElement('div');
    placeholder.classList.add('drag-placeholder-ghost');
    
    const draggedHeight = draggedElement.getBoundingClientRect().height;
    placeholder.style.height = `${draggedHeight}px`;
    
    // CRITICAL: Make the placeholder span all columns in the grid
    placeholder.style.gridColumn = '1 / -1';
    
    draggedElement.parentNode.insertBefore(placeholder, draggedElement);
    placeholder.style.display = 'none'; // Hide until drag moves
    
    setTimeout(() => {
        if (draggedElement) draggedElement.classList.add('dragging');
    }, 0);
    
    document.body.classList.add('is-dragging');
    
    // Attach follow-up events
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('mouseup', handleDragEnd, { once: true });
    document.addEventListener('touchend', handleDragEnd, { once: true });
}

function handleDragMove(e) {
    if (!draggedElement) return;
    
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
    
    // Auto-expand logic (remains the same)
    const isDraggingTask = draggedElement.matches('.task-row-wrapper');
    const hoveredSectionHeader = elementOver.closest('.section-row-wrapper');
    if (isDraggingTask && hoveredSectionHeader) {
        const hoveredSectionId = hoveredSectionHeader.dataset.sectionId;
        const isCollapsed = hoveredSectionHeader.querySelector('.fa-chevron-right');
        if (isCollapsed && hoveredSectionId !== lastHoveredSectionId) {
            lastHoveredSectionId = hoveredSectionId;
            clearTimeout(expansionTimeout);
            expansionTimeout = setTimeout(() => {
                expandCollapsedSection(hoveredSectionId);
            }, 600);
        }
    } else {
        clearTimeout(expansionTimeout);
        lastHoveredSectionId = null;
    }
    
    // ▼▼▼ NEW & IMPROVED POSITIONING LOGIC ▼▼▼
    
    // Rule 1: Prioritize the "Add Task" row as a primary drop zone.
    const addTaskTarget = elementOver.closest('.add-task-row-wrapper');
    if (addTaskTarget) {
        // If hovering on "Add Task", always drop before it.
        addTaskTarget.before(placeholder);
        return;
    }
    
    // Rule 2: Handle dropping in the empty space at the bottom of a section.
    const hoveredSection = elementOver.closest('.section-wrapper');
    const isHoveringTask = elementOver.closest('.task-row-wrapper');
    const isHoveringHeader = elementOver.closest('.section-row-wrapper');
    
    if (hoveredSection && !isHoveringTask && !isHoveringHeader) {
        // We are inside a section, but not over a specific task or header.
        // This means we're in the empty space (likely at the bottom).
        const addTaskRowInSection = hoveredSection.querySelector('.add-task-row-wrapper');
        if (addTaskRowInSection) {
            // Force the drop to occur before the "Add Task" row.
            addTaskRowInSection.before(placeholder);
            return;
        }
    }
    
    // Rule 3: General logic for dropping relative to other tasks and sections.
    const finalTarget = elementOver.closest('.task-row-wrapper, .section-wrapper');
    if (finalTarget && finalTarget !== draggedElement && !finalTarget.contains(draggedElement)) {
        const dropZoneRect = finalTarget.getBoundingClientRect();
        const isAfter = coords.y > dropZoneRect.top + dropZoneRect.height / 2;
        
        if (isAfter) {
            finalTarget.after(placeholder);
        } else {
            finalTarget.before(placeholder);
        }
    }
    // ▲▲▲ END OF NEW LOGIC ▲▲▲
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
    
    // Optimistic UI update
    placeholder.parentNode.replaceChild(draggedElement, placeholder);
    
    const isTask = draggedElement.classList.contains('task-row-wrapper');
    const gridWrapper = draggedElement.closest('.grid-wrapper');
    
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated.");
        const basePath = await _getSelectedProjectPath(db, user.uid);
        
        if (isTask) {
            // Call our new, grid-aware function
            await handleTaskMoved(draggedElement, gridWrapper, basePath);
        } else {
            // Section reordering logic can remain the same as it already
            // queries the entire container for all section wrappers.
            await handleSectionReorder(basePath);
        }
    } catch (error) {
        console.error("❌ Sync failed, starting UI revert.", error);
        sourceContainer.insertBefore(draggedElement, originalNextSibling);
        console.warn("⏪ UI has been reverted to its original state.");
    } finally {
        cleanUpDragState();
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

function positionFloatingPanel(targetEl, dropdownEl) {
    const targetRect = targetEl.getBoundingClientRect();
    const panelRect = dropdownEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    let top = targetRect.bottom + 4;
    if (top + panelRect.height > viewportHeight) {
        top = targetRect.top - panelRect.height - 4;
    }
    
    let left = targetRect.left;
    if (left + panelRect.width > viewportWidth) {
        left = viewportWidth - panelRect.width - 8;
    }
    
    dropdownEl.style.top = `${top}px`;
    dropdownEl.style.left = `${left}px`;
    dropdownEl.style.position = 'absolute';
    dropdownEl.style.zIndex = '9999';
    dropdownEl.style.visibility = 'visible';
}