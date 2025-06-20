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

const ITEMS_PER_PAGE = 30; // How many items to load at a time
let currentItemOffset = 0; // How many items are currently rendered
let isLoadingNextPage = false; // Flag to prevent loading multiple pages at once
let flatListOfItems = []; // A flattened array of all sections and tasks
let isScrolling = false; // For throttling scroll events

// State variables to track the drag operation
let draggedElement = null;
let placeholder = null;
let dragHasMoved = false;
let sourceContainer = null;
let originalNextSibling = null;

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
        console.log(`[DEBUG] Found workspaceId: ${currentWorkspaceId}`);

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
            console.log(`[DEBUG] Found projectId: ${currentProjectId}`);

            project = { ...project, ...projectDoc.data(), id: currentProjectId };

            // ✅ NOW call loadProjectUsers once project is confirmed
            await loadProjectUsers(currentUserId);

            // Then continue with sections and tasks
            const sectionsPath = `${projectsPath}/${currentProjectId}/sections`;
            const sectionsQuery = query(collection(db, sectionsPath), orderBy("order"));

            if (activeListeners.sections) activeListeners.sections();
            activeListeners.sections = onSnapshot(sectionsQuery, (sectionsSnapshot) => {
                console.log(`[DEBUG] Sections snapshot fired. Found ${sectionsSnapshot.size} sections.`);
                project.sections = sectionsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, tasks: [] }));

                distributeTasksToSections(allTasksFromSnapshot);
                render();
            });

            const tasksGroupQuery = query(
                collectionGroup(db, 'tasks'),
                where('projectId', '==', currentProjectId),
                orderBy('createdAt', 'desc')
            );

            if (activeListeners.tasks) activeListeners.tasks();
            activeListeners.tasks = onSnapshot(tasksGroupQuery, (tasksSnapshot) => {
                console.log(`[DEBUG] Tasks CollectionGroup snapshot fired. Found ${tasksSnapshot.size} tasks.`);
                allTasksFromSnapshot = tasksSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                distributeTasksToSections(allTasksFromSnapshot);
                render();
            });
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
        return () => { };
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
            if (availableTypes.length === 0) {
                return alert("All available column types have been added.");
            }

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
        const addTaskBtn = e.target.closest('.add-task-wrapper');
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
        const addTaskRow = e.target.closest('.add-task-wrapper');
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
                    createDropdown(allPriorityOptions, controlElement, (selected) => {
                        updateTask(taskId, sectionId, { priority: selected.name });
                    }, 'Priority');
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
                    updateDoc(taskRef, liked
                        ? {
                            likedAmount: increment(-1),
                            [`likedBy.${currentUserId}`]: deleteField()
                        }
                        : {
                            likedAmount: increment(1),
                            [`likedBy.${currentUserId}`]: true
                        });
                    break;
                }

                case 'custom-select': {
                    const columnId = Number(controlElement.dataset.columnId);
                    const column = project.customColumns.find(c => c.id === columnId);
                    if (column && column.options) {
                        createDropdown(column.options, controlElement, (selected) => {
                            updateTask(taskId, sectionId, {
                                [`customFields.${columnId}`]: selected.name
                            });
                        }, 'CustomColumn', columnId);
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
            const sectionEl = focusedOutElement.closest('.section-wrapper');
            if (!sectionEl) return;

            const sectionId = sectionEl.dataset.sectionId;
            const newTitle = focusedOutElement.innerText.trim();
            const section = project.sections.find(s => s.id === sectionId);

            if (!section) return;
            if (['Completed', 'Todo', 'Doing'].includes(section.title)) {
                focusedOutElement.innerText = section.title;
                return;
            }

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

    // This is the corrected version:
    windowClickListener = (e) => {
        const clickedInsidePanel = e.target.closest('.context-dropdown, .datepicker');
        const clickedOverlayOrDialog = e.target.closest('.dialog-overlay, .filterlistview-dialog-overlay');
        const clickedTrigger = e.target.closest('[data-control="due-date"], [data-control="priority"], [data-control="status"], [data-control="custom"], [data-control="assignee"], #add-column-btn, #filter-btn, .delete-column-btn');

        if (!clickedInsidePanel && !clickedOverlayOrDialog && !clickedTrigger) {
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

async function handleTaskMoved(draggedTaskEl, gridWrapper, basePath) {
    console.group(`🚀 Handling Task Move: "${draggedTaskEl.querySelector('.task-name')?.textContent}"`);

    try {
        const taskId = draggedTaskEl.dataset.taskId;
        if (!taskId) throw new Error("CRITICAL: Dragged element is missing a task ID.");

        const oldSectionId = draggedTaskEl.dataset.sectionId;
        const newSectionWrapper = draggedTaskEl.closest('.section-wrapper');
        const newSectionHeader = newSectionWrapper ? newSectionWrapper.querySelector('.section-row-wrapper') : null;

        if (!newSectionHeader || !newSectionWrapper) {
            throw new Error("Could not determine the new section for the dropped task.");
        }
        const newSectionId = newSectionHeader.dataset.sectionId;

        const batch = writeBatch(db);

        if (oldSectionId === newSectionId) {
            console.log(`➡️ [Decision]: Reordering task WITHIN section ${newSectionId}.`);
            const tasksToUpdate = Array.from(newSectionWrapper.querySelectorAll('.task-row-wrapper[data-task-id]'));

            tasksToUpdate.forEach((taskEl, index) => {
                const currentTaskId = taskEl.dataset.taskId;
                const taskRef = doc(db, `${basePath}/sections/${newSectionId}/tasks/${currentTaskId}`);

                // [FIX] Use set with merge to prevent "not-found" errors.
                batch.set(taskRef, { order: index }, { merge: true });
            });

        } else {
            console.log(`➡️ [Decision]: MOVING task from ${oldSectionId} to ${newSectionId}.`);

            // Step A: Get original task data
            const originalTaskRef = doc(db, `${basePath}/sections/${oldSectionId}/tasks/${taskId}`);
            const taskSnap = await getDoc(originalTaskRef);
            if (!taskSnap.exists()) {
                // The task we are dragging doesn't exist in the source. This is a critical data issue.
                // We will stop here to prevent further errors. The UI will revert.
                throw new Error(`Dragged task with ID ${taskId} not found in source section ${oldSectionId}.`);
            }
            const taskData = taskSnap.data();

            // Step B: Delete from old section
            batch.delete(originalTaskRef);

            // Step C: Re-order tasks in the OLD section
            const oldSectionHeader = gridWrapper.querySelector(`.section-row-wrapper[data-section-id="${oldSectionId}"]`);
            if (oldSectionHeader) {
                const oldSectionWrapper = oldSectionHeader.closest('.section-wrapper');
                if (oldSectionWrapper) {
                    const tasksInOldSection = Array.from(oldSectionWrapper.querySelectorAll('.task-row-wrapper[data-task-id]'));
                    tasksInOldSection.forEach((taskEl, index) => {
                        const taskRef = doc(db, `${basePath}/sections/${oldSectionId}/tasks/${taskEl.dataset.taskId}`);
                        // [FIX] Use set with merge
                        batch.set(taskRef, { order: index }, { merge: true });
                    });
                }
            }

            // Step D: Re-order tasks in the NEW section
            const tasksInNewSection = Array.from(newSectionWrapper.querySelectorAll('.task-row-wrapper[data-task-id]'));
            tasksInNewSection.forEach((taskEl, index) => {
                const currentTaskId = taskEl.dataset.taskId;
                const taskRef = doc(db, `${basePath}/sections/${newSectionId}/tasks/${currentTaskId}`);

                if (currentTaskId === taskId) {
                    // This is the moved task. Use SET to create it fully in the new location.
                    const newData = { ...taskData, order: index, sectionId: newSectionId };
                    batch.set(taskRef, newData);
                } else {
                    // [FIX] For existing tasks, use set with merge.
                    // This will update the order if the task exists, or create a placeholder if it's a phantom.
                    const fallbackData = {
                        name: taskEl.querySelector('.task-name')?.textContent || "Unnamed Task",
                        status: "High risk",
                        sectionId: newSectionId
                    };
                    batch.set(taskRef, { ...fallbackData, order: index }, { merge: true });
                }
            });
        }

        console.log("📌 Committing batch to Firestore...");
        await batch.commit();
        console.log("✅ Batch commit successful.");

    } catch (error) {
        console.error("❌ Error in handleTaskMoved. Reverting UI.", error);
        throw error;
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

function loadNextPage(bodyGrid) {
    if (isLoadingNextPage || currentItemOffset >= project.sections.reduce((acc, s) => acc + 1 + (s.tasks?.length || 0) + 1, 0)) {
        return; // Already loading or all items are loaded
    }
    isLoadingNextPage = true;

    let itemsForNextPage = [];
    let itemCount = 0;

    // Determine which sections and tasks belong on the next "page"
    let currentTotalCount = 0;
    for (const section of project.sections) {
        const sectionItemCount = 1 + (section.isCollapsed ? 0 : (section.tasks?.length || 0)) + 1;

        if (currentTotalCount + sectionItemCount > currentItemOffset && itemCount < ITEMS_PER_PAGE) {
            // This section is part of the next page to be rendered
            itemsForNextPage.push(section);
            itemCount += sectionItemCount;
        }
        currentTotalCount += sectionItemCount;
    }
    
    // NOW, CALL RENDERBODY with only the sections for this page
    if(itemsForNextPage.length > 0) {
        renderBody(itemsForNextPage, project.customColumns, bodyGrid);
    }

    // Update the offset for the next call
    currentItemOffset = currentTotalCount;
    isLoadingNextPage = false;
}


// =================================================
// FINAL JAVASCRIPT - ASANA-STYLE ADVANCED LAYOUT
// =================================================

// --- STATE & CONSTANTS ---
const STICKY_COLUMN_WIDTH = 350; // Define this once

// --- MAIN RENDER FUNCTION ---
function render() {
     if (!taskListBody) return;

    // Reset state for a clean re-render
    currentItemOffset = 0;
    isLoadingNextPage = false;
    const projectToRender = project;
    const customColumns = projectToRender.customColumns || [];

    taskListBody.innerHTML = '';

    // --- 1. Build the Decoupled DOM Structure ---
    const gridScrollContainer = document.createElement('div');
    gridScrollContainer.className = 'grid-scroll-container';
    const headerContainer = document.createElement('div');
    headerContainer.className = 'list-header-wrapper';
    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'list-body-wrapper';
    
    // Assemble the layout
    gridScrollContainer.appendChild(headerContainer);
    gridScrollContainer.appendChild(bodyContainer);
    taskListBody.appendChild(gridScrollContainer);
    
    // (Optional) Add the seam and custom scrollbar placeholder
    const seam = document.createElement('div');
    seam.className = 'horizontal-scroll-seam';
    seam.style.left = `${STICKY_COLUMN_WIDTH}px`;
    headerContainer.appendChild(seam);
    const scrollbarPlaceholder = document.createElement('div');
    scrollbarPlaceholder.className = 'custom-scrollbar-placeholder';
    taskListBody.appendChild(scrollbarPlaceholder);

    // --- 2. Setup Grids ---
    const headerGrid = document.createElement('div');
    headerGrid.className = 'grid-wrapper';
    const bodyGrid = document.createElement('div');
    bodyGrid.className = 'grid-wrapper';
    headerContainer.appendChild(headerGrid);
    bodyContainer.appendChild(bodyGrid);

    // --- 3. Define Grid Columns ---
    const columnWidths = {
        assignee: '150px',
        dueDate: '150px',
        priority: '150px',
        status: '150px',
        defaultCustom: 'minmax(160px, max-content)',
        addColumn: '1fr'
    };
    // The first column is the placeholder for our absolute "Name" column
    const gridTemplateColumns = [
        `${STICKY_COLUMN_WIDTH}px`,
        columnWidths.assignee,
        columnWidths.dueDate,
        columnWidths.priority,
        columnWidths.status,
        ...(customColumns || []).map(() => columnWidths.defaultCustom),
        columnWidths.addColumn
    ].join(' ');

    headerGrid.style.gridTemplateColumns = gridTemplateColumns;
    bodyGrid.style.gridTemplateColumns = gridTemplateColumns;

    // --- 4. Initial Render ---
    renderHeader(projectToRender, headerGrid);
    loadNextPage(bodyGrid);

    // --- 5. EVENT LISTENERS ---

    // YOUR DETAILED HEADER CLICK LISTENER IS NOW INTEGRATED HERE
    const headerClickListener = (e) => {
        const columnOptionsIcon = e.target.closest('.options-icon');
        const addColumnBtn = e.target.closest('.add-column-cell');
        if (columnOptionsIcon) {
            e.stopPropagation();
            const columnEl = columnOptionsIcon.closest('[data-column-id]');
            if (!columnEl) return;
            const columnId = Number(columnEl.dataset.columnId);
            const dropdownOptions = [{ name: 'Rename column' }, { name: 'Delete column' }];
            createDropdown(dropdownOptions, columnOptionsIcon, (selected) => {
                if (selected.name === 'Delete column') deleteColumn(columnId);
                else if (selected.name === 'Rename column') enableColumnRename(columnEl);
            });
            return;
        }
        if (addColumnBtn) {
            e.stopPropagation();
            const existingTypes = new Set(project.customColumns.map(col => col.type));
            const availableTypes = columnTypeOptions.filter(type => !existingTypes.has(type) || type === 'Custom');
            if (availableTypes.length === 0) {
                alert("All available column types have been added.");
                return;
            }
            createDropdown(availableTypes.map(type => ({ name: type })), addColumnBtn, (selected) => openAddColumnDialog(selected.name));
        }
    };
    
    // Attach the listener to the header grid
    headerGrid.addEventListener('click', headerClickListener);

    // Horizontal scroll sync
    gridScrollContainer.addEventListener('scroll', () => {
        headerContainer.scrollLeft = gridScrollContainer.scrollLeft;
    });

    // Vertical scroll for infinite loading
    bodyContainer.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = bodyContainer;
        if (scrollTop + clientHeight >= scrollHeight - 300 && !isLoadingNextPage) {
            loadNextPage(bodyGrid);
        }
    });

    // --- 6. Post-Render Logic ---
    // ... your logic for sort buttons, focus, and drag-and-drop ...
    initializeDragAndDrop(bodyGrid);
}


// --- ROW CREATION HELPERS (REVISED FOR ASANA METHOD) ---
function renderHeader(projectToRender, container) {
    container.innerHTML = '';
    const customColumns = projectToRender.customColumns || [];
    const row = document.createElement('div');
    row.className = 'grid-row-container';

    // 1. The Fixed Part
    const stickyWrapper = document.createElement('div');
    stickyWrapper.className = 'absolute-sticky-container';
    const nameCell = document.createElement('div');
    nameCell.className = 'task-cell sticky-col-header';
    nameCell.innerHTML = `<span>Name</span>`;
    stickyWrapper.appendChild(nameCell);
    row.appendChild(stickyWrapper);

    // 2. The Scrolling Part
    const placeholderCell = document.createElement('div');
    placeholderCell.className = 'sticky-placeholder-cell';
    row.appendChild(placeholderCell);

    const standardHeaders = ['Assignee', 'Due Date', 'Priority', 'Status'];
    standardHeaders.forEach(name => {
        const cell = document.createElement('div');
        cell.className = 'header-cell';
        cell.innerHTML = `<span>${name}</span>`;
        row.appendChild(cell);
    });
    customColumns.forEach(col => {
        const cell = document.createElement('div');
        cell.className = 'header-cell';
        cell.dataset.columnId = col.id;
        cell.innerHTML = `<span>${col.name}</span><i class="fa-solid fa-ellipsis-h column-icon options-icon"></i>`;
        row.appendChild(cell);
    });
    const addColumnCell = document.createElement('div');
    addColumnCell.className = 'header-cell add-column-cell';
    addColumnCell.innerHTML = `<i class="fa-solid fa-plus"></i>`;
    row.appendChild(addColumnCell);

    container.appendChild(row);
}

function renderBody(sectionsToRender, customColumns, container) {
    (sectionsToRender || []).forEach(section => {
        container.appendChild(createSectionRow(section, customColumns));
        if (!section.isCollapsed && section.tasks) {
            section.tasks.forEach(task => {
                container.appendChild(createTaskRow(task, customColumns));
            });
        }
        container.appendChild(createAddTaskRow(customColumns, section.id));
    });
}

function createSectionRow(sectionData, customColumns) {
    const row = document.createElement('div');
    row.className = 'grid-row-container section-title-row';

    const chevronClass = sectionData.isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';
    const protectedTitles = ['Completed', 'Todo', 'Doing'];
    const isEditable = !protectedTitles.includes(sectionData.title.trim());
    const titleAttributes = isEditable ? 'contenteditable="true"' : 'contenteditable="false"';
    
    const titleCell = document.createElement('div');
    titleCell.className = 'task-cell section-title-cell';
    titleCell.style.gridColumn = '1 / -1';
    titleCell.innerHTML = `
        <div class="section-title-wrapper">
            <i class="fas fa-grip-vertical drag-handle"></i>
            <i class="fas ${chevronClass} section-toggle"></i>
            <span class="section-title" ${titleAttributes}>${sectionData.title}</span>
        </div>
        <button class="section-options-btn" data-section-id="${sectionData.id}">
            <i class="fa-solid fa-ellipsis-h"></i>
        </button>
    `;
    row.appendChild(titleCell);
    return row;
}


function createTaskRow(task) {
    const row = document.createElement('div');
    row.className = 'grid-row-container';

    // 1. Absolute Sticky Part
    const stickyWrapper = document.createElement('div');
    stickyWrapper.className = 'absolute-sticky-container';
    const nameCell = document.createElement('div');
    nameCell.className = 'task-cell';
    nameCell.textContent = task.name;
    stickyWrapper.appendChild(nameCell);
    row.appendChild(stickyWrapper);
    
    // 2. Placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'sticky-placeholder-cell';
    row.appendChild(placeholder);

    // 3. Scrolling Cells
    const assigneeCell = document.createElement('div');
    assigneeCell.className = 'task-cell';
    assigneeCell.textContent = task.assignee || '...';
    row.appendChild(assigneeCell);

    const dueDateCell = document.createElement('div');
    dueDateCell.className = 'task-cell';
    dueDateCell.textContent = task.dueDate || '...';
    row.appendChild(dueDateCell);

    const baseColumns = [
        {
            control: 'assignee',
            value: task.assignees && task.assignees.length > 0 ? task.assignees[0].name : 'Add assignee'
        },
        {
            control: 'due-date',
            value: task.dueDate || 'Set date'
        },
        {
            control: 'priority',
            value: task.priority
        },
        {
            control: 'status',
            value: task.status
        }];

    baseColumns.forEach(col => {
        const cell = document.createElement('div');
        cell.className = 'task-cell';
        if (isCompleted) cell.classList.add('is-completed');
        cell.dataset.control = col.control;

        let content = col.value || '';

        if (col.control === 'assignee') {
            // Render full assignee HTML (avatar + name + remove button)
            content = createAssigneeHTML(task.assignees);
        } else if (col.control === 'priority' && col.value) {
            const className = `priority-tag priority-${col.value}`;
            content = `<span class="${className}">${col.value}</span>`;
        } else if (col.control === 'status' && col.value) {
            const statusClass = `status-tag status-${col.value.replace(/\s+/g, '-')}`;
            content = `<span class="${statusClass}">${col.value}</span>`;
        } else {
            content = `<span>${content}</span>`;
        }


        cell.innerHTML = content;
        row.appendChild(cell);
    });

    // --- Custom Columns ---
    (customColumns || []).forEach(col => {
        const cell = document.createElement('div');
        cell.className = 'task-cell';
        if (isCompleted) cell.classList.add('is-completed');
        cell.dataset.columnId = col.id;
        cell.dataset.control = 'custom';

        const rawValue = task.customFields ? task.customFields[col.id] : null;

        let content = `<span class="add-value editable-custom-field" contenteditable="true"></span>`;
        if (rawValue !== null && rawValue !== undefined) {
            if (col.name === 'Type' || col.name === 'Tag') {
                const tagClass = `status-tag status-${String(rawValue).replace(/\s+/g, '-')}`;
                content = `<span class="editable-custom-field ${tagClass}" contenteditable="true">${rawValue}</span>`;
            } else {
                content = `<span class="editable-custom-field" contenteditable="true">${rawValue}</span>`;
            }
        }

        cell.innerHTML = content;
        row.appendChild(cell);
    });

    // --- Placeholder Cell ---
    const placeholderCell = document.createElement('div');
    placeholderCell.className = 'task-cell';
    row.appendChild(placeholderCell);

    return row;
}

function createAddTaskRow(customColumns, sectionId) {
    const row = document.createElement('div');
    row.className = 'grid-row-container add-task-row-wrapper';
    row.dataset.sectionId = sectionId;

    // First, find the relevant section to access its tasks for the sum calculation
    const section = project.sections.find(s => s.id === sectionId);
    if (!section) return row; // Return an empty row if section not found

    // --- 1. The Fixed Part (The "Add Task" Button) ---
    const stickyWrapper = document.createElement('div');
    stickyWrapper.className = 'absolute-sticky-container';
    
    const addTaskCell = document.createElement('div');
    addTaskCell.className = 'task-cell'; // It's a cell within the sticky container
    addTaskCell.innerHTML = `
        <div class="add-task-wrapper">
            <i class="add-task-icon fa-solid fa-plus"></i>
            <span class="add-task-text">Add task...</span>
        </div>
    `;
    stickyWrapper.appendChild(addTaskCell);
    row.appendChild(stickyWrapper);


    // --- 2. The Scrolling Part (Placeholders and Sums) ---
    
    // a. The placeholder for the sticky column
    const placeholderCell = document.createElement('div');
    placeholderCell.className = 'sticky-placeholder-cell';
    row.appendChild(placeholderCell);

    // b. Empty placeholders for the standard columns (Assignee, Due Date, etc.)
    const standardColumnCount = 4; // Assignee, Due Date, Priority, Status
    for (let i = 0; i < standardColumnCount; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'task-cell';
        row.appendChild(placeholder);
    }

    // c. YOUR SUM CALCULATION LOGIC (Integrated Here)
    // This creates cells for each custom column, with sums for 'Costing' types.
    customColumns.forEach(col => {
        const cell = document.createElement('div');
        cell.className = 'task-cell summary-cell'; // Use a specific class for styling

        if (col.type === 'Costing') {
            // Calculate the sum of all task values for this column in this section
            const sum = (section.tasks || []).reduce((acc, task) => {
                const value = task.customFields?.[col.id];
                // Ensure the value is a number before adding
                return typeof value === 'number' ? acc + value : acc;
            }, 0);
            
            const formatted = sum !== 0 ? `Sum: ${sum.toFixed(2)}` : '';
            cell.innerHTML = `<span class="costing-sum">${formatted}</span>`;
        }
        // For other custom column types, the cell will be created but remain empty.
        
        row.appendChild(cell);
    });

    // d. Final placeholder to align with the "Add Column" button in the header
    const finalPlaceholder = document.createElement('div');
    finalPlaceholder.className = 'task-cell';
    row.appendChild(finalPlaceholder);
    
    return row;
}
    
/*
==================

EndWorking Component

==================
*/





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

        addNewColumn(config);   // Your logic to push column into Firestore/local data
        closeDialog();          // Close dialog after
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


