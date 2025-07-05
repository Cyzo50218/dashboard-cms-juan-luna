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
let taskListHeaderEl, drawer, addSectionClassBtn, headerRight, productListBody, taskListFooter, addProductHeaderBtn, mainContainer, assigneeDropdownTemplate, filterBtn, sortBtn;

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

// --- Main Initialization and Cleanup ---

function initializeListView(params) {
    mainContainer = document.querySelector('.search-results-container');
    productListBody = document.getElementById('searchresult-list-body');
    
    if (!mainContainer || !productListBody) {
        console.error("List view could not initialize: Essential containers not found.");
        return () => {};
    }
    render();
    setupEventListeners();
}

export function init(params) {
    console.log("Initializing List View Module...", params);
    
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
    
    // Initial view setup
    initializeListView(params);
    
    
    
    // Cleanup
    return function cleanup() {
        console.log("Cleaning up List View Module...");
        detachAllListeners();
        
        if (headerClickListener) taskListHeaderEl.removeEventListener('click', headerClickListener);
        if (bodyClickListener) productListBody.removeEventListener('click', bodyClickListener);
        if (bodyFocusOutListener) productListBody.removeEventListener('focusout', bodyFocusOutListener);
        if (addProductHeaderBtnListener) addProductHeaderBtn.removeEventListener('click', addProductHeaderBtnListener);
        if (windowClickListener) window.removeEventListener('click', windowClickListener);
        if (filterBtnListener) filterBtn.removeEventListener('click', filterBtnListener);
        if (sortBtnListener) sortBtn.removeEventListener('click', sortBtnListener);
        
        if (sortableSections) sortableSections.destroy();
        sortableTasks.forEach(st => st.destroy());
        sortableTasks.length = 0;
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
let project = {
    id: 'project_xyz789',
    name: 'Q3 Product Catalog',

    // A single, flat array of all products for the project.
    products: [
        {
            id: 'prod_1A',
            // Each product still needs to know its category for database operations.
            categoryId: 'cat_001', 
            name: 'Wireless Mechanical Keyboard',
            imageUrl: 'https://via.placeholder.com/150/8f8f8e/ffffff?text=Keyboard',
            productSku: 'WMK-K87-RGB',
            supplierCost: 85.50,
            supplierName: 'Global Tech Imports',
            supplierProject: 'Project Alpha',
            order: 0 // Order within its logical category
        },
        {
            id: 'prod_2A',
            categoryId: 'cat_002', // This product is in a different category
            name: 'Ergonomic Office Chair',
            imageUrl: 'https://via.placeholder.com/150/5c5c5c/ffffff?text=Chair',
            productSku: 'EOC-BLK-MESH',
            supplierCost: 195.75,
            supplierName: 'Comfort Seating Co.',
            supplierProject: 'Project Alpha',
            order: 0
        },
        {
            id: 'prod_1B',
            categoryId: 'cat_001',
            name: '4K IPS Monitor 27-inch',
            imageUrl: null,
            productSku: 'MON-4K-27-IPS',
            supplierCost: 320.00,
            supplierName: 'Display Solutions Inc.',
            supplierProject: 'Project Gamma',
            order: 1 // This product comes after the keyboard in the same category
        },
    ],

    // Column definitions and rules remain the same.
    customColumns: [
        { id: 'cc_01', name: 'Warehouse Location', type: 'Text' }
    ],
    columnRules: [
        { name: 'Supplier Cost', isRestricted: true }
    ],
    
    // Project metadata remains the same.
    project_super_admin_uid: 'user_super_admin_id',
    project_admin_user: 'user_admin_id'
};

    // 1. --- INITIAL CHECKS & SETUP ---
    if (!productListBody) {
        console.error("Render function aborted: productListBody element not found.");
        return;
    }

    if (!userCanEditProject) {
        addProductHeaderBtn.classList.add('hide');
    } else {
        addProductHeaderBtn.classList.remove('hide');
    }

    let scrollState = { top: 0, left: 0 };
    const oldContainer = productListBody.querySelector('.juanlunacms-spreadsheetlist-custom-scrollbar');
    if (oldContainer) {
        scrollState.top = oldContainer.scrollTop;
        scrollState.left = oldContainer.scrollLeft;
    }
    
    const baseColumns = [
        { id: 'productImage', name: 'Product Image', type: 'Image' },
        { id: 'productSku', name: 'Product SKU', type: 'Text' },
        { id: 'supplierCost', name: 'Supplier Cost', type: 'Costing' },
        { id: 'supplierName', name: 'Supplier Name', type: 'Text' },
        { id: 'supplierProject', name: 'Supplier Project', type: 'Dropdown' },
    ];
    const customColumns = project.customColumns || [];
    const allColumns = [...baseColumns, ...customColumns];


    productListBody.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'w-full h-full bg-white overflow-auto juanlunacms-spreadsheetlist-custom-scrollbar border border-slate-200 rounded-none shadow-sm';
    
    const table = document.createElement('div');
    table.className = 'min-w-max relative';

    // 2. --- HEADER CREATION ---
    const header = document.createElement('div');
    header.className = 'flex sticky top-0 z-20 bg-white juanlunacms-spreadsheetlist-sticky-header h-8';
    
    const leftHeader = document.createElement('div');
    leftHeader.className = 'sticky left-0 z-10 w-80 md:w-96 lg:w-[400px] flex-shrink-0 px-4 font-semibold text-slate-600 border-b border-r border-slate-200 juanlunacms-spreadsheetlist-left-sticky-pane juanlunacms-spreadsheetlist-sticky-pane-bg text-xs rounded-none flex items-center';
    leftHeader.textContent = 'Product Name';
    
    const rightHeaderContent = document.createElement('div');
    rightHeaderContent.className = 'flex flex-grow border-b border-slate-200';

    allColumns.forEach(col => {
        const cell = document.createElement('div');
        cell.className = 'group relative px-2 py-1 font-semibold text-slate-600 border-r border-slate-200 bg-white flex items-center text-xs rounded-none';
        cell.dataset.columnId = col.id;
        
        const innerWrapper = document.createElement('div');
        innerWrapper.className = 'flex flex-grow items-center min-w-0';
        innerWrapper.style.userSelect = 'none';

        const cellText = document.createElement('span');
        cellText.className = 'header-cell-content flex-grow';
        cellText.textContent = col.name;
        innerWrapper.appendChild(cellText);
        
        if (userCanEditProject) {
            const cellMenu = document.createElement('div');
            cellMenu.className = 'options-icon flex-shrink-0 opacity-1 group-hover:opacity-100 transition-opacity cursor-pointer p-1 ml-2 rounded-full hover:bg-slate-200';
            cellMenu.innerHTML = `<i class="fa-solid fa-ellipsis-vertical text-slate-500 pointer-events-none"></i>`;
            
            innerWrapper.appendChild(cellMenu);
        }
        
        cell.appendChild(innerWrapper);
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        cell.appendChild(resizeHandle);
        
        rightHeaderContent.appendChild(cell);
    });

    const addColumnBtn = document.createElement('div');
    addColumnBtn.className = 'add-column-cell w-8 opacity-100 flex-shrink-0 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer border-l border-slate-200 bg-white';
    if (userCanEditProject) {
        addColumnBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    } else {
        addColumnBtn.style.pointerEvents = 'none';
    }
    rightHeaderContent.appendChild(addColumnBtn);

    header.appendChild(leftHeader);
    header.appendChild(rightHeaderContent);

    // 3. --- HEADER CLICK LISTENER ---
    const headerClickListener = (e) => {
        const columnOptionsIcon = e.target.closest('.options-icon');
        const addColumnBtn = e.target.closest('.add-column-cell');
        
        if (columnOptionsIcon) {
            e.stopPropagation();
            const columnEl = columnOptionsIcon.closest('[data-column-id]');
            if (!columnEl) return;
            
            const columnId = columnEl.dataset.columnId;
            const column = allColumns.find(c => String(c.id) === String(columnId));
            if (!column) return;
            
            let dropdownOptions = [{ name: 'Rename column' }];
            
            if (userCanEditProject) {
                 const rules = project.columnRules || [];
                 const existingRule = rules.find(rule => rule.name === column.name);
                 const isCurrentlyRestricted = existingRule && existingRule.isRestricted;
                 dropdownOptions.push({ name: isCurrentlyRestricted ? 'Unrestrict Column' : 'Restrict Column' });
            }
            
            const isBaseColumn = baseColumns.some(c => c.id === columnId);
            if (!isBaseColumn && (project.project_super_admin_uid === currentUserId || project.project_admin_user === currentUserId)) {
                dropdownOptions.push({ name: 'Delete column' });
            }
            
            createAdvancedDropdown(columnOptionsIcon, {
                options: dropdownOptions,
                itemRenderer: (option) => {
                    const isDelete = option.name === 'Delete column';
                    const colorStyle = isDelete ? 'style="color: #d9534f;"' : '';
                    return `<span ${colorStyle}>${option.name}</span>`;
                },
                onSelect: (selected) => {
                    if (selected.name === 'Rename column') {
                        enableColumnRename(columnEl);
                    } else if (selected.name.includes('Restrict Column')) {
                        toggleColumnRestriction(column);
                    } else if (selected.name === 'Delete column') {
                        deleteColumnInFirebase(column.id);
                    }
                }
            });
            return;
        }

        if (addColumnBtn) {
            e.stopPropagation();
            openAddColumnDialog();
        }
    };

    if (userCanEditProject) {
        rightHeaderContent.addEventListener('click', headerClickListener);
    }


    // 4. --- BODY CREATION (FLAT PRODUCT LIST) ---
    const body = document.createElement('div');
    const productsContainer = document.createElement('div'); 
    productsContainer.className = 'products-container';

    // The products should be pre-sorted by categoryId and then by order.
    const sortedProducts = (project.products || []).sort((a, b) => {
        if (a.categoryId < b.categoryId) return -1;
        if (a.categoryId > b.categoryId) return 1;
        return (a.order || 0) - (b.order || 0);
    });

    sortedProducts.forEach(product => {
        const productRow = document.createElement('div');
        productRow.className = 'product-row-wrapper flex group border-b border-slate-200';
        productRow.dataset.productId = product.id;
        productRow.dataset.categoryId = product.categoryId; // Still required!
        
        const canEditThisProduct = canUserEditProduct(product);
        
        // Left Pane (Product Name)
        const leftProductCell = document.createElement('div');
        leftProductCell.className = 'group sticky left-0 w-80 md:w-96 lg:w-[400px] flex-shrink-0 flex items-center border-r border-transparent group-hover:bg-slate-50 juanlunacms-spreadsheetlist-left-sticky-pane juanlunacms-spreadsheetlist-sticky-pane-bg juanlunacms-spreadsheetlist-dynamic-border py-0.2';
        leftProductCell.dataset.control = 'open-sidebar';
        
        leftProductCell.innerHTML = `
            <div class="drag-handle ${!canEditThisProduct ? 'hidden' : ''} cursor-grab rounded flex items-center justify-center hover:bg-slate-200 user-select-none p-1">
                <span class="material-icons text-slate-500 select-none" style="font-size: 20px;" draggable="false">drag_indicator</span>
            </div>
            <div class="flex items-center flex-grow min-w-0">
                <span
                    class="product-name truncate text-[13px] block outline-none bg-transparent rounded px-1 ${canEditThisProduct ? 'focus:bg-white focus:ring-1 focus:ring-slate-300' : 'cursor-text'}"
                    contenteditable="${canEditThisProduct}"
                    data-product-id="${product.id}"
                >${product.name || 'New Product'}</span>
            </div>
        `;

        // Right Pane (Product Data Columns)
        const rightProductCells = document.createElement('div');
        rightProductCells.className = 'flex-grow flex group-hover:bg-slate-50';

        allColumns.forEach((col) => {
            const cell = document.createElement('div');
            let cellClasses = `table-cell px-2 py-1 flex items-center border-r border-slate-200 text-sm`;
            cellClasses += (col.id === 'productImage') ? ' w-20 justify-center' : ' w-44';
            
            
            const canEditThisCell = isCellEditable(col, product);

            if (!canEditThisCell) {
                cellClasses += ' cell-restricted bg-slate-50 cursor-not-allowed';
            }
            
            cell.className = cellClasses;
            cell.dataset.columnId = col.id;
            
            let content = '';
            const rawValue = product[col.id] || (product.customFields && product.customFields[col.id]);

            switch (col.id) {
                case 'productImage':
                    content = `<div class="w-10 h-10 bg-gray-200 rounded-md flex items-center justify-center overflow-hidden">
                                   ${product.imageUrl ? `<img src="${product.imageUrl}" class="w-full h-full object-cover" alt="Product Image">` : '<span class="material-icons text-gray-400">photo_camera</span>'}
                               </div>`;
                    break;
                case 'productSku':
                    content = `<span class="px-1 w-full" contenteditable="${canEditThisCell}">${rawValue || ''}</span>`;
                    break;
                case 'supplierCost':
                    const cost = (typeof rawValue === 'number') ? '$' + rawValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                    content = `<span class="px-1 w-full" contenteditable="${canEditThisCell}">${cost}</span>`;
                    break;
                case 'supplierName':
                     content = `<span class="px-1 w-full" contenteditable="${canEditThisCell}">${rawValue || ''}</span>`;
                    break;
                case 'supplierProject':
                    cell.dataset.control = 'supplier-project';
                    if(canEditThisCell) {
                       content = `<div class="status-tag cursor-pointer">${rawValue || 'Select Project'}</div>`;
                    } else {
                       content = `<div class="status-tag">${rawValue || 'N/A'}</div>`;
                    }
                    break;
                default:
                    content = `<span class="px-1 w-full" contenteditable="${canEditThisCell}">${rawValue || ''}</span>`;
                    break;
            }
            cell.innerHTML = content;
            rightProductCells.appendChild(cell);
        });
        
        productRow.appendChild(leftProductCell);
        productRow.appendChild(rightProductCells);
        productsContainer.appendChild(productRow);
    });
    
    // 5. --- FINAL ASSEMBLY & DYNAMIC BEHAVIORS ---
    table.appendChild(header);
    body.appendChild(productsContainer);
    table.appendChild(body);
    container.appendChild(table);
    productListBody.appendChild(container);
    
    if (userCanEditProject) {
        Sortable.create(productsContainer, {
            group: 'products',
            handle: '.drag-handle',
            animation: 300,
            onEnd: async (evt) => {
                await handleProductMoved(evt); 
            }
        });
    }

    container.scrollTop = scrollState.top;
    container.scrollLeft = scrollState.left;
    container.addEventListener('scroll', () => {
        const scrolled = container.scrollLeft > 0;
        header.classList.toggle('shadow-md', container.scrollTop > 0);
        container.querySelectorAll('.juanlunacms-spreadsheetlist-left-sticky-pane').forEach(pane => {
            pane.classList.toggle('juanlunacms-spreadsheetlist-shadow-right-custom', scrolled);
        });
    });
    
    if (userCanEditProject) {
        initColumnDragging();
    }
    initColumnResizing();
    requestAnimationFrame(syncColumnWidths);
    
    if (productIdToFocus) {
        const productToFocusEl = productListBody.querySelector(`[data-product-id="${productIdToFocus}"] .product-name`);
        if (productToFocusEl) {
            productToFocusEl.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(productToFocusEl);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        productIdToFocus = null;
    }
}

function isCellEditable(column) {
    // Admins/Owners can always edit any column.
    if (userCanEditProject) {
        return true;
    }
    
    // Assigned users (Viewer/Commentor) can edit some fields,
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

function syncColumnWidths() {
    const table = document.querySelector('.min-w-max.relative');
    if (!table) return;
    
    const headerContainer = table.querySelector('.juanlunacms-spreadsheetlist-sticky-header');
    if (!headerContainer) return;

    // Get all column IDs directly from the rendered header elements
    const allColumnIds = Array.from(headerContainer.querySelectorAll('[data-column-id]')).map(cell => cell.dataset.columnId);
    
    allColumnIds.forEach(columnId => {
        const headerCell = headerContainer.querySelector(`[data-column-id="${columnId}"]`);
        if (!headerCell) return;
        
        const textElement = headerCell.querySelector('.header-cell-content');
        const headerContentWidth = textElement ? textElement.scrollWidth : 0;
        
        // *** MODIFIED: New minimum width logic for product columns ***
        let minWidth = 150; // A sensible default min-width
        if (columnId === 'productImage') {
            minWidth = 80;
        } else if (columnId === 'supplierCost') {
            minWidth = 120;
        } else if (columnId === 'productSku') {
            minWidth = 160;
        } else if (columnId === 'supplierName' || columnId === 'supplierProject') {
            minWidth = 180;
        }
        
        // The final width is the LARGER of the minimum width or the actual header text width.
        // A 32px buffer is added for padding and icons.
        const finalWidth = Math.max(minWidth, headerContentWidth) + 32;
        
        const allCellsInColumn = table.querySelectorAll(`[data-column-id="${columnId}"]`);
        allCellsInColumn.forEach(cell => {
            cell.style.width = `${finalWidth}px`;
            cell.style.minWidth = `${finalWidth}px`; // Mirror width and min-width
        });
    });
}

function initColumnResizing() {
    const table = document.querySelector('.min-w-max.relative');
    if (!table) return;
    
    let initialX, initialWidth, columnId;
    let columnSpecificMinWidth; 
    
    const onDragMove = (e) => {
        const currentX = e.touches ? e.touches[0].clientX : e.clientX;
        const deltaX = currentX - initialX;
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
        
        // *** MODIFIED: MIRRORED LOGIC for consistent resize behavior ***
        let minWidth = 150; // Default min-width
        if (columnId === 'productImage') {
            minWidth = 80;
        } else if (columnId === 'supplierCost') {
            minWidth = 120;
        } else if (columnId === 'productSku') {
            minWidth = 160;
        } else if (columnId === 'supplierName' || columnId === 'supplierProject') {
            minWidth = 180;
        }
        columnSpecificMinWidth = minWidth; // Set the min-width for the drag operation

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