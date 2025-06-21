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
    
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    serverTimestamp,
    increment,
    deleteField
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
let taskListHeaderEl, taskListBody, taskListFooter, addSectionBtn, addTaskHeaderBtn, mainContainer, assigneeDropdownTemplate, filterBtn, sortBtn;

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

let project = { customColumns: [], sections: [] };
let sections = [];
let tasks = [];
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

function attachRealtimeListeners(userId) {
    detachAllListeners();
    currentUserId = userId;
    console.log(`[DEBUG] Attaching listeners for user: ${userId}`);
    
    const workspaceQuery = query(collection(db, `users/${userId}/myworkspace`), where("isSelected", "==", true));
    
    activeListeners.workspace = onSnapshot(workspaceQuery, async (workspaceSnapshot) => {
        if (workspaceSnapshot.empty) {
            console.warn("[DEBUG] No selected workspace.");
            return;
        }
        
        currentWorkspaceId = workspaceSnapshot.docs[0].id;
        const projectsPath = `users/${userId}/myworkspace/${currentWorkspaceId}/projects`;
        const projectQuery = query(collection(db, projectsPath), where("isSelected", "==", true));
        
        if (activeListeners.project) activeListeners.project();
        
        activeListeners.project = onSnapshot(projectQuery, async (projectSnapshot) => {
            if (projectSnapshot.empty) {
                console.warn("[DEBUG] No selected project.");
                return;
            }
            
            const projectDoc = projectSnapshot.docs[0];
            currentProjectId = projectDoc.id;
            project = { ...projectDoc.data(), id: currentProjectId, sections: [] }; // Initialize with empty sections
            
            await loadProjectUsers(currentUserId);
            
            // --- FIX STARTS HERE ---
            
            // This function will only run when BOTH sections and tasks are loaded.
            const processAndRender = () => {
                // Check if we have the necessary data.
                if (project.sections.length > 0 && allTasksFromSnapshot.length > 0) {
                    console.log("[DEBUG] Both sections and tasks are loaded. Distributing and rendering now.");
                    // Pass the sections directly to the function
                    distributeTasksToSections(allTasksFromSnapshot, project.sections);
                    render(); // Call your main render function
                } else {
                    console.log(`[DEBUG] Waiting for all data... Sections loaded: ${project.sections.length > 0}, Tasks loaded: ${allTasksFromSnapshot.length > 0}`);
                }
            };
            
            const sectionsPath = `${projectsPath}/${currentProjectId}/sections`;
            const sectionsQuery = query(collection(db, sectionsPath), orderBy("order"));
            
            if (activeListeners.sections) activeListeners.sections();
            activeListeners.sections = onSnapshot(sectionsQuery, (sectionsSnapshot) => {
                console.log(`[DEBUG] Sections snapshot fired. Found ${sectionsSnapshot.size} sections.`);
                // 1. Update the sections data
                project.sections = sectionsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, tasks: [] }));
                // 2. Try to process the data
                processAndRender();
            });
            
            const tasksGroupQuery = query(collectionGroup(db, 'tasks'), where('projectId', '==', currentProjectId));
            
            if (activeListeners.tasks) activeListeners.tasks();
            activeListeners.tasks = onSnapshot(tasksGroupQuery, (tasksSnapshot) => {
                console.log(`[DEBUG] Tasks CollectionGroup snapshot fired. Found ${tasksSnapshot.size} tasks.`);
                // 1. Update the tasks data
                allTasksFromSnapshot = tasksSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                // 2. Try to process the data
                processAndRender();
            });
            // --- FIX ENDS HERE ---
        });
    }, (error) => console.error("[DEBUG] FATAL ERROR in listeners:", error));
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
    
    
}

function distributeTasksToSections(tasks, sections) {
    console.log("--- Running Task Distribution ---");
    
    // Guard clause to prevent errors if sections aren't ready
    if (!sections || !Array.isArray(sections)) {
        console.error("Distribution skipped: Sections data is not available or not an array.");
        return;
    }
    
    const availableSectionIds = sections.map(s => s.id);
    
    // Reset tasks on all sections before distributing
    sections.forEach(section => section.tasks = []);
    
    let unmatchedTasks = 0;
    for (const task of tasks) {
        const section = sections.find(s => s.id === task.sectionId);
        
        if (section) {
            section.tasks.push(task);
        } else {
            unmatchedTasks++;
        }
    }
    
    // Sort the tasks inside each section
    sections.forEach(section => {
        section.tasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });
    
    if (unmatchedTasks > 0) {
        console.error(`--- Distribution Complete. ${unmatchedTasks} tasks could not be matched to a section. ---`);
    } else {
        console.log(`--- Distribution Complete. All tasks matched. ---`);
    }
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
            project = { customColumns: [], sections: [] };
            render();
        }
    });
    
    // Initial view setup
    initializeListView(params);
    
    render();
    
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

function setupEventListenersTwo() {
            const container = document.getElementById('task-list-body').querySelector('.juanlunacms-spreadsheetlist-custom-scrollbar');
            if (!container) return;
            const stickyHeader = container.querySelector('.juanlunacms-spreadsheetlist-sticky-header');
            const leftStickyPanes = container.querySelectorAll('.juanlunacms-spreadsheetlist-left-sticky-pane');
            const dynamicBorders = container.querySelectorAll('.juanlunacms-spreadsheetlist-dynamic-border');
            container.addEventListener('scroll', () => {
                const scrolled = container.scrollLeft > 0;
                if (container.scrollTop > 0) stickyHeader.classList.add('shadow-md'); else stickyHeader.classList.remove('shadow-md');
                if (scrolled) {
                    leftStickyPanes.forEach(pane => pane.classList.add('juanlunacms-spreadsheetlist-shadow-right-custom'));
                    dynamicBorders.forEach(pane => { pane.classList.remove('border-transparent'); pane.classList.add('border-slate-200'); });
                } else {
                    leftStickyPanes.forEach(pane => pane.classList.remove('juanlunacms-spreadsheetlist-shadow-right-custom'));
                    dynamicBorders.forEach(pane => { pane.classList.add('border-transparent'); pane.classList.remove('border-slate-200'); });
                }
            });
            container.addEventListener('click', (e) => {
                const controlElement = e.target.closest('[data-control]');
                if (!controlElement) return;
                const taskRow = e.target.closest('[data-task-id]');
                const taskId = taskRow ? taskRow.dataset.taskId : null;
                const sectionId = taskRow ? taskRow.dataset.sectionId : null;
                const controlType = controlElement.dataset.control;
                if (!taskId) return;
                switch (controlType) {
                    case 'check': handleTaskCompletion(taskId, taskRow); break;
                    case 'dueDate': showDatePicker(controlElement, sectionId, taskId); break;
                    case 'priority':
                        const priorityOptions = (project.customPriorities || []).map(p => ({ name: p.name, color: p.color || defaultPriorityColors[p.name] }));
                        createDropdown(priorityOptions, controlElement, (selected) => updateTask(taskId, sectionId, { priority: selected.name }));
                        break;
                    case 'status':
                        const statusOptions = (project.customStatuses || []).map(s => ({ name: s.name, color: s.color || defaultStatusColors[s.name] }));
                        createDropdown(statusOptions, controlElement, (selected) => updateTask(taskId, sectionId, { status: selected.name }));
                        break;
                    case 'assignees': showAssigneeDropdown(controlElement, taskId); break;
                }
            });
        }
        
function setupEventListeners() {
    const container = document.getElementById('task-list-root').querySelector('.juanlunacms-spreadsheetlist-custom-scrollbar');
    if (!container) return;
    
    // Dynamic shadows
    const stickyHeader = container.querySelector('.juanlunacms-spreadsheetlist-sticky-header');
    const leftStickyPanes = container.querySelectorAll('.juanlunacms-spreadsheetlist-left-sticky-pane');
    const dynamicBorders = container.querySelectorAll('.juanlunacms-spreadsheetlist-dynamic-border');
    
    container.addEventListener('scroll', () => {
        const scrolled = container.scrollLeft > 0;
        if (container.scrollTop > 0) {
            stickyHeader.classList.add('shadow-md');
        } else {
            stickyHeader.classList.remove('shadow-md');
        }
        if (scrolled) {
            leftStickyPanes.forEach(pane => pane.classList.add('juanlunacms-spreadsheetlist-shadow-right-custom'));
            dynamicBorders.forEach(pane => {
                pane.classList.remove('border-transparent');
                pane.classList.add('border-slate-200');
            });
        } else {
            leftStickyPanes.forEach(pane => pane.classList.remove('juanlunacms-spreadsheetlist-shadow-right-custom'));
            dynamicBorders.forEach(pane => {
                pane.classList.add('border-transparent');
                pane.classList.remove('border-slate-200');
            });
        }
    });
    
    container.addEventListener('click', (e) => {
        const controlElement = e.target.closest('[data-control]');
        if (!controlElement) return;
        
        const taskRow = e.target.closest('[data-task-id]');
        const taskId = taskRow ? taskRow.dataset.taskId : null;
        const sectionId = taskRow ? taskRow.dataset.sectionId : null;
        const controlType = controlElement.dataset.control;
        
        switch (controlType) {
            case 'check':
                console.log("Task completion toggled for:", taskId);
                handleTaskCompletion(taskId, taskRow);
                break;
            case 'dueDate':
                showDatePicker(controlElement, sectionId, taskId);
                break;
            case 'priority':
                const priorityOptions = project.customPriorities.map(p => ({ name: p.name, color: p.color || defaultPriorityColors[p.name] }));
                createDropdown(priorityOptions, controlElement, (selected) => {
                    updateTask(taskId, sectionId, { priority: selected.name });
                });
                break;
            case 'status':
                const statusOptions = project.customStatuses.map(s => ({ name: s.name, color: s.color || defaultStatusColors[s.name] }));
                createDropdown(statusOptions, controlElement, (selected) => {
                    updateTask(taskId, sectionId, { status: selected.name });
                });
                break;
            case 'assignees':
                showAssigneeDropdown(controlElement, taskId);
                break;
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

function findTaskAndSection(taskId) {
            if (!project.sections) return { task: null, section: null };
            for (const section of project.sections) {
                const task = (section.tasks || []).find(t => t.id === taskId);
                if (task) return { task, section };
            }
            return { task: null, section: null };
        }
        
function updateTask(taskId, sectionId, updates) {
            const section = (project.sections || []).find(s => s.id === sectionId);
            if (!section || !section.tasks) return;
            const taskIndex = section.tasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
                section.tasks[taskIndex] = { ...section.tasks[taskIndex], ...updates };
                updateTaskInFirebase(taskId, sectionId, updates);
                render();
            }
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

 async function handleSectionReorder(evt) {
     console.log("🔄 Section reorder triggered.", evt);
     try {
         const basePath = await _getSelectedProjectPath(db, auth.currentUser.uid);
         const sectionEls = [...document.querySelectorAll('.section-wrapper')];
         console.log(`🧱 Found ${sectionEls.length} section elements to reorder.`);
         const batch = writeBatch(db);
         sectionEls.forEach((el, index) => {
             const sectionId = el.dataset.sectionId;
             if (sectionId) {
                 const sectionRef = doc(db, `${basePath}/sections/${sectionId}`);
                 batch.update(sectionRef, { order: index });
             }
         });
         await batch.commit();
         console.log("✅ Sections reordered and saved to Firestore.");
     } catch (err) {
         console.error("❌ Error committing section reordering batch:", err);
         throw err; // Allow SortableJS to revert the UI
     }
 }
 
 async function handleTaskMoved(evt) {
     const draggedTaskEl = evt.item;
     const fromSectionEl = evt.from.closest('.section-wrapper');
     const toSectionEl = evt.to.closest('.section-wrapper');
     const fromSectionId = fromSectionEl.dataset.sectionId;
     const toSectionId = toSectionEl.dataset.sectionId;
     
     console.group(`🚀 Handling Task Move: "${draggedTaskEl.querySelector('.task-name')?.textContent}"`);
     console.log(`➡️ From Section: ${fromSectionId}, To Section: ${toSectionId}`);
     
     try {
         const basePath = await _getSelectedProjectPath(db, auth.currentUser.uid);
         const batch = writeBatch(db);
         
         // Update order in the NEW section
         const tasksInNewSection = Array.from(toSectionEl.querySelectorAll('.tasks-container .task-row-wrapper'));
         tasksInNewSection.forEach((taskEl, index) => {
             const taskId = taskEl.dataset.taskId;
             const taskRef = doc(db, `${basePath}/sections/${toSectionId}/tasks/${taskId}`);
             batch.update(taskRef, { order: index, sectionId: toSectionId });
         });
         
         // If moved between sections, update order in OLD section too
         if (fromSectionId !== toSectionId) {
             const tasksInOldSection = Array.from(fromSectionEl.querySelectorAll('.tasks-container .task-row-wrapper'));
             tasksInOldSection.forEach((taskEl, index) => {
                 const taskId = taskEl.dataset.taskId;
                 const taskRef = doc(db, `${basePath}/sections/${fromSectionId}/tasks/${taskId}`);
                 batch.update(taskRef, { order: index });
             });
         }
         
         await batch.commit();
         console.log("✅ Task move/reorder saved to Firestore.");
     } catch (error) {
         console.error("❌ Error in handleTaskMoved. Reverting UI.", error);
         throw error; // Let SortableJS revert
     } finally {
         console.groupEnd();
     }
 }
 
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

function render() {
    if (!taskListBody) {
        taskListBody.innerHTML = '<div class="p-8 text-center text-slate-500">Loading project...</div>';
        return;
    }
    
     sections = project.sections || [];
    
    const defaultColumns = [
        { id: 'assignees', name: 'Assignee' },
        { id: 'dueDate', name: 'Date' },
        { id: 'priority', name: 'Priority' },
        { id: 'status', name: 'Status' }
    ];
    
    const allColumns = [...defaultColumns, ...(project.customColumns || [])];
    
    generateCustomTagStyles(project);
    taskListBody.innerHTML = '';
    
    const container = document.createElement('div');
    container.className = 'w-full h-full bg-white overflow-auto juanlunacms-spreadsheetlist-custom-scrollbar border border-slate-200 rounded-lg shadow-sm';
    
    const table = document.createElement('div');
    table.className = 'min-w-max relative';
    const header = document.createElement('div');
    header.className = 'flex sticky top-0 z-20 bg-white juanlunacms-spreadsheetlist-sticky-header';
    const leftHeader = document.createElement('div');
    leftHeader.className = 'sticky left-0 z-10 w-80 md:w-96 lg:w-[450px] flex-shrink-0 px-4 py-3 font-semibold text-slate-600 border-b border-r border-slate-200 juanlunacms-spreadsheetlist-left-sticky-pane juanlunacms-spreadsheetlist-sticky-pane-bg';
    leftHeader.textContent = 'Name';
    const rightHeaderContent = document.createElement('div');
    rightHeaderContent.className = 'flex flex-grow border-b border-slate-200';
    allColumns.forEach(col => {
        const isCustom = (project.customColumns || []).some(customCol => customCol.id === col.id);
        const cell = document.createElement('div');
        cell.className = 'group w-44 flex-shrink-0 px-4 py-3 font-semibold text-slate-600 border-r border-slate-200 bg-white flex items-center justify-between';
        const cellText = document.createElement('span');
        cellText.textContent = col.name;
        cell.appendChild(cellText);
        
        if (isCustom) {
            const cellMenu = document.createElement('div');
            cellMenu.className = 'options-icon opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer';
            cellMenu.innerHTML = `<i class="fas fa-ellipsis-h"></i>`;
            cell.appendChild(cellMenu);
        }
        cell.dataset.columnId = col.id;
        rightHeaderContent.appendChild(cell);
    });
    const addColumnBtn = document.createElement('div');
    addColumnBtn.className = 'add-column-cell w-12 flex-shrink-0 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer border-l border-slate-200 bg-white';
    addColumnBtn.innerHTML = `<i class="fas fa-plus"></i>`;
    rightHeaderContent.appendChild(addColumnBtn);
    const headerSpacer = document.createElement('div');
    headerSpacer.className = 'w-4 flex-shrink-0';
    rightHeaderContent.appendChild(headerSpacer);
    header.appendChild(leftHeader);
    header.appendChild(rightHeaderContent);
    
    const body = document.createElement('div');
    body.className = "task-grid-body";
    
    sections.sort((a, b) => a.order - b.order).forEach(section => {
        const sectionWrapper = document.createElement('div');
        sectionWrapper.className = "section-wrapper";
        sectionWrapper.dataset.sectionId = section.id;
        
        const sectionRow = document.createElement('div');
        sectionRow.className = 'flex border-b border-slate-200';
        
        const leftSectionCell = document.createElement('div');
        leftSectionCell.className = 'sticky left-0 w-80 md:w-96 lg:w-[450px] flex-shrink-0 flex items-center gap-2 px-3 py-1.5 font-semibold text-slate-800 border-r border-transparent juanlunacms-spreadsheetlist-left-sticky-pane juanlunacms-spreadsheetlist-sticky-pane-bg hover:bg-slate-50 group';
        leftSectionCell.innerHTML = `
                    <div class="drag-handle opacity-0 group-hover:opacity-100 transition-opacity">
                        <i class="fas fa-grip-vertical fa-xs text-slate-400"></i>
                    </div>
                    <i class="fas fa-chevron-down fa-xs section-toggle"></i>
                    <span>${section.name}</span>`;
        
        const rightSectionCell = document.createElement('div');
        rightSectionCell.className = 'flex-grow flex';
        allColumns.forEach((col, i) => {
            const cell = document.createElement('div');
            const borderClass = i === 0 ? 'border-l border-slate-200' : '';
            cell.className = `w-44 flex-shrink-0 h-full hover:bg-slate-50 ${borderClass}`;
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
        sectionWrapper.appendChild(sectionRow);
        
        const tasksContainer = document.createElement('div');
        tasksContainer.className = "tasks-container";
        (section.tasks || []).sort((a, b) => a.order - b.order).forEach(task => {
            const taskRow = document.createElement('div');
            taskRow.className = 'flex group border-b border-slate-200 task-row-wrapper';
            taskRow.dataset.taskId = task.id; // Using task.id from Firestore
            taskRow.dataset.sectionId = task.sectionId;
            
            const leftTaskCell = document.createElement('div');
            leftTaskCell.className = 'sticky left-0 w-80 md:w-96 lg:w-[450px] flex-shrink-0 flex items-center gap-4 px-3 py-1.5 border-r border-transparent group-hover:bg-slate-50 juanlunacms-spreadsheetlist-left-sticky-pane juanlunacms-spreadsheetlist-sticky-pane-bg juanlunacms-spreadsheetlist-dynamic-border';
            leftTaskCell.innerHTML = `
                        <div class="drag-handle opacity-0 group-hover:opacity-100 transition-opacity">
                           <i class="fas fa-grip-vertical fa-xs text-slate-400"></i>
                        </div>
                        <label class="juanlunacms-spreadsheetlist-custom-checkbox-container" data-control="check">
                           <input type="checkbox" ${task.completed ? 'checked' : ''}>
                           <span class="juanlunacms-spreadsheetlist-custom-checkbox"></span>
                        </label>
                        <span class="truncate task-name">${task.name}</span>`;
            
            const rightTaskCells = document.createElement('div');
            rightTaskCells.className = 'flex-grow flex group-hover:bg-slate-50';
            allColumns.forEach((col, i) => {
                const cell = document.createElement('div');
                const borderClass = 'border-r';
                const leftBorderClass = i === 0 ? 'border-l' : '';
                cell.className = `w-44 flex-shrink-0 px-3 py-1.5 ${borderClass} ${leftBorderClass} border-slate-200 truncate flex items-center`;
                cell.dataset.columnId = col.id;
                cell.dataset.control = col.id;
                
                const isDefault = defaultColumns.some(defCol => defCol.id === col.id);
                if (isDefault) {
                    if (col.id === 'assignees') {
                        cell.innerHTML = createAssigneeHTML(task.assignees);
                    } else if (col.id === 'status') {
                        cell.innerHTML = createStatusTag(task.status);
                    } else if (col.id === 'priority') {
                        cell.innerHTML = createPriorityTag(task.priority);
                    } else {
                        cell.textContent = task[col.id] || '';
                    }
                } else {
                    if (task.customFields && task.customFields[col.id] !== undefined) {
                        cell.textContent = task.customFields[col.id];
                    }
                }
                rightTaskCells.appendChild(cell);
            });
            const emptyAddCellTask = document.createElement('div');
            emptyAddCellTask.className = 'w-12 flex-shrink-0 h-full border-l border-slate-200';
            rightTaskCells.appendChild(emptyAddCellTask);
            const emptyEndSpacerTask = document.createElement('div');
            emptyEndSpacerTask.className = 'w-4 flex-shrink-0 h-full';
            rightTaskCells.appendChild(emptyEndSpacerTask);
            taskRow.appendChild(leftTaskCell);
            taskRow.appendChild(rightTaskCells);
            tasksContainer.appendChild(taskRow);
        });
        
        sectionWrapper.appendChild(tasksContainer);
        const addRow = document.createElement('div');
        addRow.className = 'flex group add-task-wrapper';
        addRow.dataset.sectionId = section.id;
        const leftAddCell = document.createElement('div');
        leftAddCell.className = 'sticky left-0 w-80 md:w-96 lg:w-[450px] flex-shrink-0 flex items-center px-3 py-1.5 text-slate-500 cursor-pointer border-r border-transparent group-hover:bg-slate-100 juanlunacms-spreadsheetlist-left-sticky-pane juanlunacms-spreadsheetlist-sticky-pane-bg';
        const indentedText = document.createElement('div');
        indentedText.className = 'flex items-center gap-4 ml-8';
        indentedText.innerHTML = `<i class="fas fa-plus fa-xs"></i><span>Add task...</span>`;
        leftAddCell.appendChild(indentedText);
        const rightAddCells = document.createElement('div');
        rightAddCells.className = 'flex-grow flex group-hover:bg-slate-100';
        allColumns.forEach((col, i) => {
            const leftBorderClass = i === 0 ? 'border-l border-slate-200' : '';
            const cell = document.createElement('div');
            cell.className = `w-44 flex-shrink-0 h-full ${leftBorderClass}`;
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
        
        body.appendChild(sectionWrapper);
    });
    
    table.appendChild(header);
    table.appendChild(body);
    container.appendChild(table);
    taskListBody.appendChild(container);
    
    setupDragAndDrop();
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
    if (!task || !sourceSection) {
        console.error("Could not find task or section to update completion status.");
        return;
    }
    
    const statusCell = taskRowEl.querySelector('[data-control="status"] span');
    const checkIcon = taskRowEl.querySelector('.check-icon i');
    
    const isCurrentlyCompleted = task.status === 'Completed';
    
    if (isCurrentlyCompleted) {
        // --- UNCHECK ---
        console.log(`Un-completing task: "${task.name}"`);
        
        const previousStatus = task.previousStatus || 'On track';
        task.status = previousStatus;
        
        taskRowEl.classList.remove('is-completed');
        if (checkIcon) {
            checkIcon.classList.remove('fa-solid');
            checkIcon.classList.add('fa-regular');
            checkIcon.style.color = ''; // reset color if needed
        }
        if (statusCell) statusCell.textContent = previousStatus;
        
        updateTask(taskId, sourceSection.id, { status: previousStatus });
    } else {
        // --- COMPLETE ---
        console.log(`Completing task: "${task.name}"`);
        
        task.previousStatus = task.status;
        task.status = 'Completed';
        
        taskRowEl.classList.add('is-completed');
        if (checkIcon) {
            checkIcon.classList.remove('fa-regular');
            checkIcon.classList.add('fa-solid');
        }
        if (statusCell) statusCell.textContent = 'Completed';
        
        setTimeout(async () => {
            const completedSection = project.sections.find(s => s.title.toLowerCase() === 'completed');
            
            await updateTask(taskId, sourceSection.id, { status: 'Completed' });
            
            if (completedSection && completedSection.id !== sourceSection.id) {
                console.log(`Moving task to "${completedSection.title}" section.`);
                
                await moveTaskToSection(taskId, sourceSection.id, completedSection.id);
                
                const taskToMove = sourceSection.tasks.find(t => t.id === taskId);
                if (taskToMove) {
                    sourceSection.tasks = sourceSection.tasks.filter(t => t.id !== taskId);
                    completedSection.tasks.push(taskToMove);
                }
                
                render();
            }
        }, 400);
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

function createDropdown(options, targetEl, callback, optionType = null, columnId = null) {
    if (!targetEl) return console.error("createDropdown was called with a null target element.");
    closeFloatingPanels();
    
    const dropdown = document.createElement('div');
    dropdown.className = 'context-dropdown';
    dropdown.style.visibility = 'hidden'; // measure after append
    
    const isEditable = optionType === 'Priority' || optionType === 'Status' || optionType === 'CustomColumn';
    
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
    
    if (optionType) {
        const separator = document.createElement('hr');
        separator.className = 'dropdown-separator';
        dropdown.appendChild(separator);
        
        const addNewItem = document.createElement('div');
        addNewItem.className = 'dropdown-item';
        addNewItem.innerHTML = `<span class="dropdown-color-swatch-placeholder"><i class="fas fa-plus"></i></span><span>Add New...</span>`;
        
        if (optionType === 'CustomColumn') {
            addNewItem.addEventListener('click', () => openCustomColumnOptionDialog(columnId));
        } else if (optionType === 'Priority' || optionType === 'Status') {
            addNewItem.addEventListener('click', () => openCustomOptionDialog(optionType));
        }
        
        dropdown.appendChild(addNewItem);
    }
    
    document.body.appendChild(dropdown); // append to body
    
    requestAnimationFrame(() => {
        positionFloatingPanel(targetEl, dropdown);
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
    
    closeFloatingPanels(); // Ensure no other floating panels stay open
    
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'dialog-overlay';
    
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

function getContrastYIQ(hexcolor) {
    hexcolor = hexcolor.replace("#", "");
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

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

function setupDragAndDrop() {
            const gridBody = document.querySelector('.task-grid-body');
            if (!gridBody) return;
            new Sortable(gridBody, {
                group: 'sections', animation: 150, handle: '.drag-handle', ghostClass: 'ghost-class',
                onStart: (evt) => {
                    const tasksContainer = evt.item.querySelector('.tasks-container');
                    const addTaskWrapper = evt.item.querySelector('.add-task-wrapper');
                    if (tasksContainer) tasksContainer.classList.add('hidden');
                    if (addTaskWrapper) addTaskWrapper.classList.add('hidden');
                },
                onEnd: (evt) => {
                    const tasksContainer = evt.item.querySelector('.tasks-container');
                    const addTaskWrapper = evt.item.querySelector('.add-task-wrapper');
                    if (tasksContainer) tasksContainer.classList.remove('hidden');
                    if (addTaskWrapper) addTaskWrapper.classList.remove('hidden');
                    handleSectionReorder(evt);
                }
            });
            document.querySelectorAll('.tasks-container').forEach(container => {
                new Sortable(container, { group: 'tasks', animation: 150, handle: '.drag-handle', ghostClass: 'ghost-class', onEnd: handleTaskMoved });
            });
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
