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

// Initialize Firebase
console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
console.log("Initialized Firebase on Dashboard.");

// --- Module-Scoped Variables ---
// DOM Element Holders
let taskListHeaderEl, drawer, addSectionClassBtn, headerRight, searchListBody, taskListFooter, addProductHeaderBtn, mainContainer, assigneeDropdownTemplate, filterBtn, sortBtn;

// Event Handler References
let headerClickListener, bodyClickListener, bodyFocusOutListener, addProductHeaderBtnListener, windowClickListener, filterBtnListener, sortBtnListener;
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
let userCanEditProject = false;
let currentUserRole = null;
let currentProjectRef = null;

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

let productIdToFocus = null;
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

async function fetchMemberProfiles(uids) {
    if (!uids || uids.length === 0) {
        return []; // Return empty if no UIDs are provided
    }
    
    try {
        // Create an array of promises, where each promise fetches one user document
        const userPromises = uids.map(uid => getDoc(doc(db, `users/${uid}`)));
        
        // Wait for all promises to resolve
        const userDocs = await Promise.all(userPromises);
        
        // Filter out any users that might not exist and format the data
        const validUsers = userDocs
            .filter(d => d.exists())
            .map(d => ({ uid: d.id, ...d.data() }));
        
        console.log("[DEBUG] Fetched member profiles:", validUsers);
        return validUsers;
    } catch (error) {
        console.error("[DEBUG] Error fetching member profiles:", error);
        return []; // Return empty array on error
    }
}

function updateUserPermissions(projectData, userId) {
    if (!projectData || !userId) {
        userCanEditProject = false;
        currentUserRole = null;
        console.warn("[Permissions] Cannot set permissions. Missing project data or user ID.");
        return;
    }
    
    const members = projectData.members || [];
    const userMemberInfo = members.find(member => member.uid === userId);
    
    currentUserRole = userMemberInfo ? userMemberInfo.role : null;
    
    const isMemberWithEditPermission = userMemberInfo && (userMemberInfo.role === "Project Admin" || userMemberInfo.role === "Project admin" || userMemberInfo.role === "Editor");
    const isSuperAdmin = projectData.project_super_admin_uid === userId;
    const isAdminUser = projectData.project_admin_user === userId;
    
    userCanEditProject = isMemberWithEditPermission || isSuperAdmin || isAdminUser;
    
    console.log(`[Permissions] User: ${userId}, Role: ${currentUserRole}, Can Edit Project: ${userCanEditProject}`);
}

function canUserEditTask(task) {
    if (userCanEditProject) {
        return true;
    }
    
    // Check for the special case: Viewers or Commentators who are assigned to the task.
    if (currentUserRole === 'Viewer' || currentUserRole === 'Commentor') {
        const isAssigned = Array.isArray(task.assignees) && task.assignees.includes(currentUserId);
        if (isAssigned) {
            console.log(`[Permissions] Granting task edit for assigned ${currentUserRole}.`);
            return true;
        }
    }
    
    // Otherwise, no permission.
    return false;
}

// --- Main Initialization and Cleanup ---

function initializeListView(params) {
    mainContainer = document.querySelector('.search-results-container');
    searchListBody = document.getElementById('searchresult-list-body');
    
    // If essential elements are not found, throw an error to halt execution.
    if (!mainContainer || !searchListBody) {
        throw new Error("List view could not initialize: Essential containers not found.");
    }
    
    render();
}

export function init(params) {
    console.log("Initializing List View Module...", params);
    
    try {
        // Initial view setup is now wrapped in a try...catch block.
        initializeListView(params);
    } catch (error) {
        // If initializeListView throws an error, it will be caught here.
        console.error("A critical error occurred during list view initialization:", error.message);
        // You might want to display a user-friendly error message on the UI as well.
        // For example: document.body.innerHTML = '<h1>Oops! Something went wrong. Please try refreshing the page.</h1>';
        return () => {}; // Return an empty cleanup function as initialization failed.
    }
    
    // Listen for authentication state changes
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log(`User ${user.uid} signed in. Attaching listeners.`);
        } else {
            console.log("User signed out. Detaching listeners.");
            detachAllListeners();
            project = { customColumns: [], sections: [], customPriorities: [], customStatuses: [] };
            render();
        }
    });
    
    // Cleanup
    return function cleanup() {
        console.log("Cleaning up List View Module...");
        detachAllListeners();
        
        if (bodyClickListener) searchListBody.removeEventListener('click', bodyClickListener);
        if (bodyFocusOutListener) searchListBody.removeEventListener('focusout', bodyFocusOutListener);
        if (addProductHeaderBtnListener) addProductHeaderBtn.removeEventListener('click', addProductHeaderBtnListener);
        if (windowClickListener) window.removeEventListener('click', windowClickListener);
        if (filterBtnListener) filterBtn.removeEventListener('click', filterBtnListener);
        if (sortBtnListener) sortBtn.removeEventListener('click', sortBtnListener);
    };
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
    if (!searchListBody) {
        console.error("Target element #searchListBody not found.");
        return;
    }
    const showCustomColumns = true; 

    const project = {
        id: 'proj_12345',
        defaultColumns: [
            { id: 'assignees', name: 'Assignee', control: "assignee" },
            { id: 'dueDate', name: 'Due Date', control: "due-date" },
            { id: 'priority', name: 'Priority', control: "priority", options: [ { name: 'RUSH', color: '#ef4d3d' }, { name: 'International', color: '#06a5a7' }, { name: 'UPS Stock', color: '#59e166' }, { name: 'BULK', color: '#4a90e2' }, { name: 'Cancel', color: '#5500bd' }, { name: 'LATE', color: '#9da800' } ] },
            { id: 'status', name: 'Type of Shipment', control: "status", options: [ { name: 'Ready to Ship', color: '#006eff' }, { name: 'Waiting', color: '#00ad99' }, { name: 'Completed', color: '#878787' } ] }
        ],
        customColumns: [
            { id: 1751340038078, name: "address", type: "Text", isCustom: true },
            { id: 1751416646551, name: "Order No.", type: "Text", isCustom: true },
            { id: 1751416667932, name: "EST Amount", type: "Costing", isCustom: true, currency: "$", aggregation: "Sum" },
            { id: 1751417231966, name: "Type", type: "Type", isCustom: true, options: [ { name: 'Etsy', color: '#c03b02' }, { name: 'Shopify', color: '#4caf50' } ] },
            { id: 1751417276579, name: "Waybill", type: "Text", isCustom: true }
        ],
        sections: [
            { id: 'sec_1', title: 'Unfulfilled Orders', tasks: [
                { id: 'task_101', name: 'Ship order for Jane Doe', status: 'Ready to Ship', priority: 'RUSH', dueDate: '2025-07-20T23:59:59Z', assignees: ['user-A', 'user-B'], customFields: { 1751340038078: '123 Maple St, Springfield, IL', 1751416646551: 'ORD-1001', 1751416667932: 149.99, 1751417231966: 'Shopify', 1751417276579: 'WB77889900' }, commentCount: 5, likedAmount: 10 },
                { id: 'task_102', name: 'Prepare international shipment for John Smith', status: 'Waiting', priority: 'International', dueDate: '2025-08-10T23:59:59Z', assignees: ['user-A'], customFields: { 1751340038078: '456 Oak Ave, Vancouver, BC', 1751416646551: 'ORD-1002', 1751416667932: 295.50, 1751417231966: 'Etsy', 1751417276579: 'WB11223344' }, commentCount: 2, likedAmount: 0 }
            ]},
            { id: 'sec_2', title: 'Completed Orders', tasks: [
                { id: 'task_201', name: 'Confirm delivery for Emily White', status: 'Completed', priority: 'BULK', dueDate: '2025-07-01T23:59:59Z', assignees: ['user-C'], customFields: { 1751340038078: '789 Pine Ln, Miami, FL', 1751416646551: 'ORD-0955', 1751416667932: 88.00, 1751417231966: 'Shopify', 1751417276579: 'WB55667788' }, commentCount: 1, likedAmount: 3 }
            ]}
        ]
    };

    const mockUsers = { 'user-A': { name: 'Alice', initial: 'A' }, 'user-B': { name: 'Bob', initial: 'B' }, 'user-C': { name: 'Charlie', initial: 'C' }, 'user-D': { name: 'David', initial: 'D' } };

    if (!project || !project.id) {
        if (searchListBody) searchListBody.innerHTML = `<div class="p-4 text-center text-slate-500">Loading project data...</div>`;
        return;
    }

    let scrollState = { top: 0, left: 0 };
    const oldContainer = searchListBody.querySelector('.juanlunacms-spreadsheetlist-custom-scrollbar');
    if (oldContainer) {
        scrollState.top = oldContainer.scrollTop;
        scrollState.left = oldContainer.scrollLeft;
    }

    const columnDefinitions = new Map();
    project.defaultColumns.forEach(col => columnDefinitions.set(String(col.id), col));
    project.customColumns.forEach(col => columnDefinitions.set(String(col.id), { ...col, isCustom: true }));
    
    // --- UPDATED: This logic now respects the showCustomColumns filter ---
    const defaultIds = project.defaultColumns.map(c => c.id);
    let customIds = []; // Default to no custom columns

    if (showCustomColumns) {
        // If the filter is true, get the custom column IDs
        customIds = project.customColumns.map(c => c.id);
        // Optional: shuffle them
        for (let i = customIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [customIds[i], customIds[j]] = [customIds[j], customIds[i]];
        }
    }
    
    const orderedIds = [...defaultIds, ...customIds];
    const allDataColumns = orderedIds.map(id => columnDefinitions.get(String(id))).filter(Boolean);
    // --- END OF UPDATE ---
    
    const allTasks = project.sections.flatMap(section => section.tasks);
    
    searchListBody.innerHTML = '';
    
    const container = document.createElement('div');
    container.className = 'w-full h-full bg-white overflow-auto juanlunacms-spreadsheetlist-custom-scrollbar border border-slate-200 rounded-none shadow-sm';

    const table = document.createElement('div');
    table.className = 'min-w-max relative';

    const header = document.createElement('div');
    header.className = 'flex sticky top-0 z-20 bg-white juanlunacms-spreadsheetlist-sticky-header h-6';

    const leftHeader = document.createElement('div');
    leftHeader.className = 'sticky left-0 z-10 py-0.3 px-3 font-semibold text-slate-600 border-b border-r border-slate-200 text-[11px] flex items-center bg-white juanlunacms-spreadsheetlist-left-sticky-pane';
    leftHeader.style.width = '300px';
    leftHeader.style.flexShrink = '0';
    leftHeader.textContent = 'Task Name';

    const rightHeaderContent = document.createElement('div');
    rightHeaderContent.className = 'flex flex-grow border-b border-slate-200';

    allDataColumns.forEach(col => {
        const cell = document.createElement('div');
        cell.className = 'group relative py-0.2 py-0.3 px-2 font-semibold text-slate-600 border-r border-slate-200 bg-white flex items-center text-[11px]';
        cell.dataset.columnId = col.id;
    
        const innerWrapper = document.createElement('div');
        innerWrapper.className = 'flex flex-grow items-center min-w-0';
    
        const cellText = document.createElement('span');
        cellText.className = 'header-cell-content flex-grow truncate';
        cellText.textContent = col.name;
        innerWrapper.appendChild(cellText);
    
        cell.appendChild(innerWrapper);
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        cell.appendChild(resizeHandle);
    
        rightHeaderContent.appendChild(cell);
    });
    
    const headerSpacer = document.createElement('div');
    headerSpacer.className = 'w-4 flex-shrink-0';
    rightHeaderContent.appendChild(headerSpacer);
    
    header.appendChild(leftHeader);
    header.appendChild(rightHeaderContent);
    
    const body = document.createElement('div');

    allTasks.forEach(task => {
        const taskRow = document.createElement('div');
        taskRow.className = 'flex group border-b border-slate-200 hover:bg-slate-50';
        
        const isCompleted = task.status === 'Completed';
        const taskNameClass = isCompleted ? 'line-through text-slate-400' : 'text-slate-800';
        
        const leftTaskCell = document.createElement('div');
        leftTaskCell.className = 'sticky left-0 z-10 py-0.6 px-2 flex items-center border-r border-slate-200 bg-white group-hover:bg-slate-50 juanlunacms-spreadsheetlist-left-sticky-pane';
        leftTaskCell.style.width = '300px';
        leftTaskCell.style.flexShrink = '0';

        const commentCount = task.commentCount || 0;
        const likeCount = task.likedAmount || 0;
        const canEditThisTaskValue = canUserEditTask(task);
        const taskNameEditableClass = canEditThisTaskValue ? 'focus:bg-white focus:ring-1 focus:ring-slate-300' : 'cursor-text';
        
        leftTaskCell.innerHTML = `
          <label class="juanluna-cms-searchlist-checkbox-container px-2 ml-4" data-control="check">
              <input type="checkbox" ${isCompleted ? 'checked' : ''} ${!canEditThisTaskValue ? 'disabled' : ''}>
              <span class="juanluna-cms-searchlist-checkbox"></span>
          </label>
          <div class="flex items-center flex-grow min-w-0">
              <span class="${taskNameClass} ${taskNameEditableClass} truncate whitespace-nowrap text-[9px] block outline-none bg-transparent rounded px-1"
                    style="max-width: 100%;"
                    contenteditable="${canEditThisTaskValue}"
                    data-task-id="${task.id}">
                  ${task.name}
              </span>
              <div class="task-controls flex items-center gap-1 ml-1 group-hover:opacity-100 ${ (commentCount > 0 || likeCount > 0) ? 'opacity-100' : 'opacity-0'}">
                  ${commentCount > 0 ? `<span class="comment-count text-[9px] text-slate-500">${commentCount}</span>` : ''}
                  <span class="material-icons text-slate-400 cursor-pointer hover:text-blue-500 transition" style="font-size: 11px;" data-control="comment">chat_bubble_outline</span>
                  ${likeCount > 0 ? `<span class="like-count text-[9px] text-slate-500">${likeCount}</span>` : ''}
                  <span class="material-icons text-slate-400 cursor-pointer hover:text-red-500 transition" style="font-size: 11px;" data-control="like">favorite_border</span>
              </div>
          </div>`;
        
        const rightTaskCells = document.createElement('div');
        rightTaskCells.className = 'flex-grow flex';
        
        allDataColumns.forEach((col) => {
            const cell = document.createElement('div');
            cell.dataset.columnId = col.id;
            cell.className = 'py-0.6 px-1 flex items-center text-[9px] whitespace-nowrap border-r border-slate-200';
            
            let content = '';
            const rawValue = task.customFields ? task.customFields[col.id] : undefined;
            const canEditThisCell = canUserEditTask(task) && isCellEditable(col);
            const section = {id: task.sectionId};

            switch (col.id) {
                case 'assignees':
                    content = createAssigneeHTML(task.assignees, mockUsers);
                    break;
                case 'dueDate':
                    content = `<span class="date-tag date-${formatDueDate(task.dueDate).color}">${formatDueDate(task.dueDate).text}</span>`;
                    break;
                case 'priority': case 'status':
                    const option = col.options?.find(p => p.name === task[col.id]);
                    if (option) {
                        const style = isCompleted ? 'background-color:#f3f4f6;color:#6b7280;' : `background-color:${option.color}20;color:${option.color};`;
                        content = `<div class="${col.id}-tag" style="${style}">${task[col.id]}</div>`;
                    } else {
                        content = `<span>${task[col.id] || ''}</span>`;
                    }
                    break;
                default:
                    if (col.options && Array.isArray(col.options)) {
                        const selectedOption = col.options.find(opt => opt.name === rawValue);
                        if(selectedOption) {
                             const style = `background-color:${selectedOption.color}20;color:${selectedOption.color};`;
                             content = `<div class="status-tag" style="${style}">${selectedOption.name}</div>`;
                        } else {
                            content = '<span class="add-value">+</span>';
                        }
                         if (canEditThisCell) {
                            cell.addEventListener('click', (e) => { e.stopPropagation(); createAdvancedDropdown(cell, { options: col.options, onSelect: (selectedValue) => { updateTask(task.id, section.id, { [`customFields.${col.id}`]: selectedValue.name }); } }); });
                        }
                    } else {
                        if(canEditThisCell) cell.addEventListener('click', (e) => { e.stopPropagation(); createFloatingInput(cell, task, col); });
                         if (rawValue) {
                            content = `<div class="truncate" title="${String(rawValue).replace(/"/g, '&quot;')}">${rawValue}</div>`;
                         }
                    }
                    break;
            }
            cell.innerHTML = content || '–';
            rightTaskCells.appendChild(cell);
        });

        taskRow.appendChild(leftTaskCell);
        taskRow.appendChild(rightTaskCells);
        body.appendChild(taskRow);
    });
    
    table.appendChild(header);
    table.appendChild(body);
    container.appendChild(table);
    searchListBody.appendChild(container);
    
    const allStickyPanes = container.querySelectorAll('.juanlunacms-spreadsheetlist-left-sticky-pane');
    
    container.scrollTop = scrollState.top;
    container.scrollLeft = scrollState.left;
    
    const checkShadows = () => {
        const isHorizontallyScrolled = container.scrollLeft > 0;
        allStickyPanes.forEach(pane => {
            pane.classList.toggle('shadow-right-only', isHorizontallyScrolled);
        });
    };

    container.addEventListener('scroll', checkShadows);
    checkShadows();

    syncColumnWidths();
    initColumnResizing();
}

function isCellEditable(column) {
    // Admins/Owners can always edit any column.
    if (userCanEditProject) {
        return true;
    }
    
    // Assigned users (Viewer/Commentator) can edit some fields,
    // BUT never allowed to modify the "Assignee" column
    if (column.name === 'Assignee') {
        return false;
    }
    
    // Respect per-project column restrictions
    const rules = project.columnRules || [];
    const columnRule = rules.find(rule => rule.name === column.name);
    if (columnRule?.isRestricted) {
        return false;
    }
    
    // All other custom fields allowed
    return true;
}

function syncColumnWidths() {
    const table = document.querySelector('.min-w-max.relative');
    if (!table) return;

    const headerContainer = table.querySelector('.juanlunacms-spreadsheetlist-sticky-header');
    if (!headerContainer) return;

    const allColumnIds = Array.from(headerContainer.querySelectorAll('[data-column-id]')).map(cell => cell.dataset.columnId);

    allColumnIds.forEach(columnId => {
        const headerCell = headerContainer.querySelector(`[data-column-id="${columnId}"]`);
        if (!headerCell) return;

        const textElement = headerCell.querySelector('.header-cell-content');
        const headerContentWidth = textElement ? textElement.scrollWidth : 0;
        const finalWidth = Math.max(150, headerContentWidth + 32); // Use a default min-width of 150px or content width

        const allCellsInColumn = table.querySelectorAll(`[data-column-id="${columnId}"]`);
        allCellsInColumn.forEach(cell => {
            cell.style.width = `${finalWidth}px`;
            cell.style.minWidth = `${finalWidth}px`;
        });
    });
}

// Initializes the column resizing functionality
function initColumnResizing() {
    const table = document.querySelector('.min-w-max.relative');
    if (!table) return;

    let initialX, initialWidth, columnId;
    const minWidth = 100; // A minimum width for any column

    const onDragMove = (e) => {
        const currentX = e.touches ? e.touches[0].clientX : e.clientX;
        const deltaX = currentX - initialX;
        const newWidth = Math.max(minWidth, initialWidth + deltaX);

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
        const headerCell = e.target.closest('[data-column-id]');
        if (!headerCell) return;
        
        columnId = headerCell.dataset.columnId;
        initialX = e.touches ? e.touches[0].clientX : e.clientX;
        initialWidth = headerCell.offsetWidth;

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove);
        document.addEventListener('touchend', onDragEnd);
    };

    table.addEventListener('mousedown', onDragStart);
    table.addEventListener('touchstart', onDragStart, { passive: false });
}


function findSectionById(sectionId) {
    // Example implementation:
    return project.sections.find(section => section.id === sectionId);
}

function displaySideBarTasks(taskId) {
    console.log(`Task name clicked. Opening sidebar for task ID: ${taskId}`);
    if (window.TaskSidebar) {
        window.TaskSidebar.open(taskId, currentProjectRef);
    } else {
        console.error("TaskSidebar module is not available.");
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

function closeFloatingPanels() {
    document.querySelectorAll('.advanced-dropdown, .floating-panel').forEach(p => p.remove());
}

function createAdvancedDropdown(targetEl, config) {
    closeFloatingPanels();
    
    const dropdown = document.createElement('div');
    dropdown.className = 'advanced-dropdown';
    document.body.appendChild(dropdown);
    
    // --- Event listener for closing the dropdown ---
    const clickOutsideHandler = (event) => {
        if (!dropdown.contains(event.target) && !targetEl.contains(event.target)) {
            closeFloatingPanels();
            document.removeEventListener('click', clickOutsideHandler, true);
        }
    };
    // Use a timeout to attach the listener, preventing it from firing on the same click that opened it
    setTimeout(() => document.addEventListener('click', clickOutsideHandler, true), 0);
    
    // --- Search Input ---
    if (config.searchable) {
        const searchInput = document.createElement('input');
        searchInput.className = 'dropdown-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = 'Search teammates...';
        dropdown.appendChild(searchInput);
    }
    
    // --- List Container ---
    const listContainer = document.createElement('ul');
    listContainer.className = 'dropdown-list';
    dropdown.appendChild(listContainer);
    
    // --- Render Items Function ---
    const renderItems = (filter = '') => {
        listContainer.innerHTML = '';
        const lowerFilter = filter.toLowerCase();
        const filteredOptions = config.options.filter(opt =>
            (opt.name || opt.label || '').toLowerCase().includes(lowerFilter)
        );
        
        filteredOptions.forEach(option => {
            const li = document.createElement('li');
            li.className = 'dropdown-item';
            
            const content = document.createElement('div');
            content.className = 'dropdown-item-content';
            content.innerHTML = config.itemRenderer(option);
            li.appendChild(content);
            
            // Handle main item click
            content.addEventListener('click', (e) => {
                e.stopPropagation();
                config.onSelect(option);
                closeFloatingPanels();
            });
            
            // Add optional edit button
            if (config.onEdit) {
                const editBtn = document.createElement('button');
                editBtn.className = 'dropdown-item-edit-btn';
                editBtn.innerHTML = `<i class="fas fa-pencil-alt fa-xs"></i>`;
                editBtn.title = 'Edit Option';
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    config.onEdit(option);
                    closeFloatingPanels();
                });
                li.appendChild(editBtn);
            }
            listContainer.appendChild(li);
        });
    };
    
    // --- Footer for "Add New" action ---
    if (config.onAdd) {
        const footer = document.createElement('div');
        footer.className = 'dropdown-footer';
        footer.innerHTML = `<span><i class="fas fa-plus fa-xs"></i> Add New...</span>`;
        footer.addEventListener('click', () => {
            config.onAdd();
            closeFloatingPanels();
        });
        dropdown.appendChild(footer);
    }
    
    // --- Initial Render & Positioning ---
    renderItems();
    // Use the same robust positioning logic from the sidebar answer
    const rect = targetEl.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.minWidth = `${rect.width}px`;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < dropdown.offsetHeight && rect.top > dropdown.offsetHeight) {
        dropdown.style.top = `${rect.top - dropdown.offsetHeight - 4}px`;
    } else {
        dropdown.style.top = `${rect.bottom + 4}px`;
    }
    
    setTimeout(() => dropdown.classList.add('visible'), 10);
}

/**
 * Shows the status or priority dropdown for a task in the list view.
 */
function showStatusDropdown(targetEl, taskId, sectionId, optionType) {
    const isPriority = optionType === 'Priority';
    const options = isPriority ? priorityOptions : statusOptions; // Your existing options arrays
    const customOptions = isPriority ? project.customPriorities : project.customStatuses;
    const allOptions = [...options.map(o => ({ name: o })), ...(customOptions || [])];
    
    createAdvancedDropdown(targetEl, {
        options: allOptions,
        itemRenderer: (option) => {
            const color = option.color || (isPriority ? defaultPriorityColors[option.name] : defaultStatusColors[option.name]) || '#ccc';
            return `<div class="dropdown-color-swatch" style="background-color: ${color}"></div><span>${option.name}</span>`;
        },
        onSelect: (option) => {
            updateTask(taskId, sectionId, {
                [optionType.toLowerCase()]: option.name
            });
        },
        onEdit: (option) => {
            openEditOptionDialog(optionType, option); // Your existing dialog function
        },
        onAdd: () => {
            openCustomOptionDialog(optionType); // Your existing dialog function
        }
    });
}

/**
 * Shows the assignee dropdown for a task in the list view.
 */
function showAssigneeDropdown(targetEl, taskId, sectionId) {
    const { task } = findTaskAndSection(taskId);
    if (!task) return;
    
    createAdvancedDropdown(targetEl, {
        options: allUsers, // Your array of user objects
        searchable: true,
        searchPlaceholder: "Assign or invite...",
        itemRenderer: (user) => `<div class="avatar" style="background-image: url(${user.avatar})"></div><span>${user.name}</span>`,
        onSelect: (user) => {
            const isAssigned = task.assignees && task.assignees.includes(user.id);
            const newAssignees = isAssigned ? [] : [user.id];
            updateTask(taskId, sectionId, { assignees: newAssignees });
        },
        // You can add footer actions for inviting here if needed
    });
}

/**
 * Shows the date picker for a task in the list view.
 */
function showDatePicker(targetEl, taskId, sectionId) {
    // 1. Create a perfectly positioned, empty panel.
    const panel = createFloatingPanel(targetEl);
    
    // 2. Initialize the Datepicker library inside our new panel.
    const datepicker = new Datepicker(panel, {
        autohide: true,
        format: 'yyyy-mm-dd',
        todayHighlight: true,
    });
    
    const { task } = findTaskAndSection(taskId);
    if (task && task.dueDate) {
        datepicker.setDate(task.dueDate);
    }
    
    // 3. Add the event listener to handle date changes.
    panel.addEventListener('changeDate', (e) => {
        const formattedDate = Datepicker.formatDate(e.detail.date, 'yyyy-mm-dd');
        updateTask(taskId, sectionId, { dueDate: formattedDate });
        closeFloatingPanels();
    }, { once: true });
}

/**
 * Creates a generic, empty, floating panel positioned relative to a target element.
 * This is used as a container for more complex widgets like a date picker.
 * @param {HTMLElement} targetEl - The element that the panel should be positioned next to.
 * @returns {HTMLElement} The created (but empty) panel element.
 */
function createFloatingPanel(targetEl) {
    // 1. Clean up any existing panels first.
    closeFloatingPanels();
    
    // 2. Create the panel element and add it to the body.
    const panel = document.createElement('div');
    panel.className = 'floating-panel'; // Use this class for styling
    document.body.appendChild(panel);
    
    // 3. Add a "click outside" listener to close the panel.
    const clickOutsideHandler = (event) => {
        if (!panel.contains(event.target) && !targetEl.contains(event.target)) {
            closeFloatingPanels();
            document.removeEventListener('click', clickOutsideHandler, true);
        }
    };
    setTimeout(() => document.addEventListener('click', clickOutsideHandler, true), 0);
    
    // 4. Calculate the correct position on the screen.
    const rect = targetEl.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    
    // Wait a moment for the panel to be rendered to get its height,
    // then decide whether to show it above or below the target.
    setTimeout(() => {
        const spaceBelow = window.innerHeight - rect.bottom;
        const panelHeight = panel.offsetHeight;
        
        if (spaceBelow < panelHeight && rect.top > panelHeight) {
            // Not enough space below, plenty of space above: Position it above the target.
            panel.style.top = `${rect.top - panelHeight - 4}px`;
        } else {
            // Default behavior: Position it below the target.
            panel.style.top = `${rect.bottom + 4}px`;
        }
        
        // 5. Make the panel visible with a smooth transition.
        panel.classList.add('visible');
    }, 10);
    
    // 6. Return the created panel so it can be used.
    return panel;
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