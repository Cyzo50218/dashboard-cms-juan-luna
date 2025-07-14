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
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from "/services/firebase-config.js";
import { openInventoryModal } from '/dashboard/components/settingsInventoryWorkspace.js';
import { openAddProductModal } from '/dashboard/components/addProductModal.js';

// Initialize Firebase
console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
const storage = getStorage(app);
console.log("Initialized Firebase on Dashboard.");

// --- Module-Scoped Variables ---
// DOM Element Holders
let taskListHeaderEl, drawer, settingsBtn, inventoryTabs, restrictedOverlay, addSectionClassBtn, headerRight, productListBody, taskListFooter, addProductHeaderBtn, mainContainer, assigneeDropdownTemplate, filterBtn, sortBtn;

// Event Handler References
let headerClickListener, bodyClickListener, settingsBtnListener, bodyFocusOutListener, addProductHeaderBtnListener, windowClickListener, filterBtnListener, sortBtnListener;
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
let currentInventoryId = null;
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

let currentStockType = 'ph'; // or 'ph'
let inventoryPath = null;
let dataUsStocks = [];
let dataPhStocks = [];
let canUserEditProduct = false; // This will be set based on the user's permissions
// --- New Real-time Data Loading Functions ---
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

    console.groupCollapsed(`%c🔗 Attaching Listeners for User: ${userId}`, 'color: #007bff; font-weight: bold;');

    const userDocRef = doc(db, 'users', userId);
    let hasRenderedPhStocks = false;
    let hasRenderedUsStocks = false;
    activeListeners.user = onSnapshot(userDocRef, async (userSnap) => {
        if (!userSnap.exists()) {
            console.error(`%c❌ User document not found: ${userId}`, 'color: #dc3545; font-weight: bold;');
            detachAllListeners();
            console.groupEnd();
            return;
        }

        const userData = userSnap.data();
        const selectedWorkspaceId = userData.selectedWorkspace;

        if (!selectedWorkspaceId) {
            console.warn('%c⚠️ No selected workspace found.', 'color: #ffc107; font-weight: bold;');
            showRestrictedAccessUI('No workspace selected.');
            console.groupEnd();
            return;
        }

        currentWorkspaceId = selectedWorkspaceId;

        const workspaceDocRef = doc(db, `users/${userId}/myworkspace`, selectedWorkspaceId);
        console.info(`%c📁 Listening to Workspace: ${selectedWorkspaceId}`, 'color: #17a2b8;');

        activeListeners.workspace = onSnapshot(workspaceDocRef, async (workspaceSnap) => {
            if (!workspaceSnap.exists()) {
                console.warn('%c⚠️ Workspace document does not exist.', 'color: #ffc107; font-weight: bold;');
                showRestrictedAccessUI('Workspace does not exist.');
                return;
            }

            const workspaceData = workspaceSnap.data();

            if (workspaceData.canShowInventory === false) {
                console.warn('%c🚫 Access Denied: Inventory is restricted.', 'color: red; font-weight: bold;');
                showRestrictedAccessUI('Restricted Access: You are not allowed to view this inventory.');
                return;
            }

            const inventoryQuery = query(collection(db, 'InventoryWorkspace'), limit(1));
            const inventorySnapshot = await getDocs(inventoryQuery);

            if (inventorySnapshot.empty) {
                console.warn('%c⚠️ No InventoryWorkspace data found.', 'color: #ffc107; font-weight: bold;');
                showRestrictedAccessUI('Inventory data not found.');
                return;
            }

            const inventoryDocId = inventorySnapshot.docs[0].id;
            const inventoryDocRef = doc(db, 'InventoryWorkspace', inventoryDocId);
            console.info(`%c📦 Inventory ID: ${inventoryDocId}`, 'color: #17a2b8;');
            currentInventoryId = inventoryDocId;
            let inventoryId = inventoryDocId;
            inventoryPath = `InventoryWorkspace/${inventoryDocId}`;

            const usStocksRef = collection(inventoryDocRef, 'US-Stocks-meta');
            const phStocksRef = collection(inventoryDocRef, 'PH-Stocks-meta');

            activeListeners.usStocks = onSnapshot(usStocksRef, (usSnapshot) => {
                dataUsStocks = usSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                console.log('%c🇺🇸 US Stocks:', 'color: #00bcd4;', dataUsStocks);
                render(['ph', 'us'].includes(currentStockType) ? currentStockType : 'ph');
            });

            activeListeners.phStocks = onSnapshot(phStocksRef, (phSnapshot) => {
                dataPhStocks = phSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                console.log('%c🇵🇭 PH Stocks:', 'color: #ff9800;', dataPhStocks);
                render(['ph', 'us'].includes(currentStockType) ? currentStockType : 'ph');

            });
            render("ph");
        }, (error) => {
            console.error('%c❌ Error loading workspace snapshot.', 'color: #dc3545; font-weight: bold;', error);
            showRestrictedAccessUI('An error occurred while loading your workspace.');
        });

        console.groupEnd();
    });
}

function showRestrictedAccessUI(message) {
    if (restrictedOverlay) {
        restrictedOverlay.querySelector('.message').textContent = message || 'Restricted Access';
        restrictedOverlay.classList.remove('hidden');
    }

    document.querySelector('.list-view-container')?.classList.add('hidden');

    const okBtn = document.getElementById('restricted-ok-btn');
    if (okBtn) {
        okBtn.onclick = () => {
            window.location.href = '/home';
        };
    }
}

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

// --- Permission Helper Functions ---

/**
 * Sets the global permission flags based on the user's role in the current project.
 * This should be called whenever the project data is loaded or updated.
 * @param {object} projectData - The full project document data.
 * @param {string} userId - The UID of the currently authenticated user.
 */
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

    const isMemberWithEditPermission = userMemberInfo && (userMemberInfo.role === "Project Admin" || userMemberInfo.role === "Project Owner Admin" || userMemberInfo.role === "Editor");

    userCanEditProject = isMemberWithEditPermission || isSuperAdmin || isAdminUser;

    console.log(`[Permissions] User: ${userId}, Role: ${currentUserRole}, Can Edit Project: ${userCanEditProject}`);
}

// --- Main Initialization and Cleanup ---

function initializeListView() {
    restrictedOverlay = document.getElementById('restricted-overlay');
    taskListHeaderEl = document.getElementById('task-list-header');
    drawer = document.getElementById('right-sidebar');
    settingsBtn = document.getElementById('inventory-settings-btn');
    headerRight = document.getElementById('header-right');
    productListBody = document.getElementById('task-list-body');
    taskListFooter = document.getElementById('task-list-footer');
    addSectionClassBtn = document.querySelector('.add-section-btn');
    addProductHeaderBtn = document.querySelector('.add-task-header-btn');
    mainContainer = document.querySelector('.list-view-container');
    assigneeDropdownTemplate = document.getElementById('assignee-dropdown-template');
    filterBtn = document.getElementById('filter-btn');
    sortBtn = document.getElementById('sort-btn');

    if (!mainContainer || !productListBody) {
        console.error("List view could not initialize: Essential containers not found.");
        return () => { };
    }

    // Attach tab switching logic
    inventoryTabs = document.querySelectorAll('.inventory-tabs .tab-item');
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
            render('us');
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
        if (settingsBtnListener) settingsBtn.removeEventListener('click', settingsBtnListener);
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

// --- Event Listener Setup ---
async function handleProductListClick(e) {
    const cell = e.target.closest('[data-control]');
    if (!cell) return; // Exit if the click wasn't on a controllable cell

    const row = e.target.closest('.product-row-wrapper');
    if (!row) return; // Exit if we can't find the product row

    const productId = row.dataset.productId;
    const controlType = cell.dataset.control;
    const stockType = currentStockType; // Assuming 'currentStockType' is globally available

    // Find the product data from your local list
    const productList = stockType === 'ph' ? dataPhStocks : dataUsStocks;
    const product = productList.find(p => p.id === productId);

    if (!product) {
        console.error("Could not find product data for ID:", productId);
        return;
    }

    // Now, handle the specific dropdown logic
    switch (controlType) {
        case 'supplierProject': {
            if (!canUserEditProduct) return;

            const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
            const selectedWorkspace = userSnap.data()?.selectedWorkspace;
            if (!selectedWorkspace) return;

            const projectsQuery = query(
                collectionGroup(db, 'projects'),
                where('workspaceId', '==', selectedWorkspace),
                where('memberUIDs', 'array-contains', auth.currentUser.uid)
            );

            const querySnap = await getDocs(projectsQuery);
            const options = querySnap.docs.map(doc => ({
                id: doc.id,
                name: doc.data().title || 'Unnamed Project',
                ref: doc.ref
            }));

            createAdvancedDropdown(cell, {
                options,
                itemRenderer: (opt) => `<span>${opt.name}</span>`,
                onSelect: async (selectedProject) => {
                    const productRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${stockType === 'us' ? 'US-Stocks-meta' : 'PH-Stocks-meta'}`, product.id);
                    try {
                        await updateDoc(productRef, {
                            supplierProject: {
                                name: selectedProject.name,
                                id: selectedProject.id
                            }
                        });
                    } catch (err) {
                        console.error('❌ Failed to update supplierProject:', err);
                    }
                }
            });
            break;
        }

        case 'warehouseLocation': {
            if (!canUserEditProduct) return;

            const stockOptions = [
                { name: 'PH Stocks', path: 'PH-Stocks-meta' },
                { name: 'US Stocks', path: 'US-Stocks-meta' }
            ];

            createAdvancedDropdown(cell, {
                options: stockOptions,
                itemRenderer: (opt) => `<span>${opt.name}</span>`,
                onSelect: async (selectedOption) => {
                    // Logic to move the document in Firestore
                    const currentPath = `${stockType === 'us' ? 'US-Stocks-meta' : 'PH-Stocks-meta'}`;
                    if (currentPath === selectedOption.path) return; // No change needed

                    const currentRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${currentPath}`, product.id);
                    const targetRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${selectedOption.path}`, product.id);

                    try {
                        const docSnap = await getDoc(currentRef);
                        if (docSnap.exists()) {
                            await setDoc(targetRef, { ...docSnap.data(), warehouseLocation: selectedOption.name });
                            await deleteDoc(currentRef);
                            render(currentStockType); // Re-render to reflect changes
                            console.log(`✅ Moved product to ${selectedOption.name}`);
                        }
                    } catch (err) {
                        console.error('❌ Failed to transfer document:', err);
                    }
                }
            });
            break;
        }
        // Add cases for your other controls like 'supplierCost' here...
    }
}

/**
 * Handles the image upload process for a product.
 * @param {File} file The image file to upload.
 * @param {string} productId The ID of the product to associate the image with.
 */
async function uploadProductImage(file, productId) {
    const imageWrapper = document.querySelector(`.product-row-wrapper[data-product-id="${productId}"] .product-image-wrapper`);
    if (!imageWrapper) return;

    // 1. Show a loading spinner in the cell for immediate feedback
    imageWrapper.innerHTML = `<div class="w-full h-full flex items-center justify-center"><div class="loading-spinner"></div></div>`;

    try {
        // 2. Define the path in Firebase Storage
        const storageRef = ref(storage, `products/${productId}/${file.name}`);

        // 3. Upload the file
        await uploadBytes(storageRef, file);

        // 4. Get the public download URL
        const imageUrl = await getDownloadURL(storageRef);

        // 5. Update the product document in Firestore
        const stockTypeCollection = currentStockType === 'us' ? 'US-Stocks-meta' : 'PH-Stocks-meta';
        const productRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${stockTypeCollection}`, productId);
        await updateDoc(productRef, { imageUrl: imageUrl });

        // 6. Update the UI with the new image (the list will re-render on the next data update)
        console.log('✅ Image uploaded and product updated successfully!');

    } catch (error) {
        console.error("❌ Error uploading image:", error);
        // Revert UI to the placeholder on error
        imageWrapper.innerHTML = '<span class="material-icons text-gray-400 pointer-events-none">photo_camera</span>';
    }
}

async function setupEventListeners() {

    inventoryTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            inventoryTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            currentStockType = index === 0 ? 'ph' : 'us';

            // Update subtitle
            const subtitle = document.getElementById('inventory-subtitle');
            subtitle.textContent = currentStockType.toUpperCase() + ' Stocks';

            // Render relevant stock data
            render(currentStockType);
        });
    });

    document.addEventListener('click', (e) => {
        const optionsButton = e.target.closest('.section-options-btn');

        if (!canUserEditProduct) {
            console.warn("[Permissions] Blocked dropdown menu action. User cannot edit project.");
            closeOpenMenu();
            return;
        }

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

    bodyClickListener = async (e) => {
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
                render('us');
            }
            return;
        }

        // --- 2. "Add Task" Button inside section ---
        const addTaskBtn = e.target.closest('.add-task-btn');
        if (addTaskBtn) {

            if (!userCanEditProject) {
                console.warn("[Permissions] Blocked 'Add Task'. User cannot edit project.");
                return;
            }
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

            // *** PERMISSION CHECK ***
            if (!userCanEditProject) {
                console.warn("[Permissions] Blocked 'Add Task Row'. User cannot edit project.");
                return;
            }

            console.log('%cACTION: Add Task Row clicked', 'color: blue; font-weight: bold;');
            const sectionId = addTaskRow.dataset.sectionId;
            const section = project.sections.find(s => s.id == sectionId);
            if (section) {
                addNewTask(section, 'end');
            }
            return;
        }

        const taskRow = e.target.closest('.task-row-wrapper');
        if (!taskRow) return; // Exit if the click was not on a task row

        const taskId = taskRow.dataset.taskId;
        const sectionId = taskRow.dataset.sectionId;
        const { task } = findTaskAndSection(taskId);

        // Find the specific control element that was clicked (e.g., the due date button, task name, etc.)
        const controlElement = e.target.closest('[data-control]');
        if (!controlElement) return; // Exit if not a specific interactive element

        const controlType = controlElement.dataset.control;

        if (taskId && taskId.startsWith('temp_')) {
            const control = e.target.closest('[data-control]');
            if (control && control.dataset.control !== 'open-sidebar') {
                console.warn("Action blocked: Please wait a moment for the task to finish saving.");
                // Add a subtle flash to indicate the task is saving
                taskRow.style.transition = 'background-color 0.2s';
                taskRow.style.backgroundColor = '#fffbe6'; // A light yellow flash
                setTimeout(() => {
                    taskRow.style.backgroundColor = '';
                }, 400);
                return;
            }
        }
        // Block interaction with temp tasks (this logic remains the same)
        if (taskId.startsWith('temp_') && controlType !== 'open-sidebar') {
            return;
        }

        switch (controlType) {
            case 'open-sidebar':
            case 'comment':
                displaySideBarTasks(taskId); // Assumes this function is defined elsewhere
                headerRight.classList.add('hide'); // Your existing UI logic
                break;

            case 'check':
                e.stopPropagation();
                if (!canUserEditProduct(task)) {
                    console.warn(`[Permissions] Blocked 'move-task' action. User cannot edit project.`);
                    return;
                }
                handleTaskCompletion(task, taskRow); // Your existing function
                break;

            case 'due-date':
                if (!canUserEditProduct(task)) {
                    console.warn(`[Permissions] Blocked 'move-task' action. User cannot edit project.`);
                    return;
                }
                showDatePicker(controlElement, taskId, sectionId);
                break;

            case 'assignee':
                if (!canUserEditProduct(task)) {
                    console.warn(`[Permissions] Blocked 'move-task' action. User cannot edit project.`);
                    return;
                }
                showAssigneeDropdown(controlElement, taskId, sectionId);
                break;

            case 'priority':
            case 'status': {
                if (!canUserEditProduct(task)) {
                    console.warn(`[Permissions] Blocked 'move-task' action. User cannot edit project.`);
                    return;
                }
                const optionType = (controlType === 'priority') ? 'Priority' : 'Status';
                showStatusDropdown(controlElement, taskId, sectionId, optionType);
                break;
            }
            case 'warehouseLocation':
                if (!canUserEditProduct(task)) {
                    console.warn(`[Permissions] Blocked 'warehouseLocation' change. User cannot edit project.`);
                    return;
                }

                const stockOptions = [
                    { name: 'PH Stocks', path: 'PH-Stocks-meta' },
                    { name: 'US Stocks', path: 'US-Stocks-meta' }
                ];

                createAdvancedDropdown(controlElement, {
                    options: stockOptions,
                    itemRenderer: (opt) => `<span>${opt.name}</span>`,
                    onSelect: async (selectedOption) => {
                        const currentRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${currentStockType === 'us' ? 'US-Stocks-meta' : 'PH-Stocks-meta'}`, task.id);
                        const targetRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${selectedOption.path}`, task.id);

                        try {
                            const docSnap = await getDoc(currentRef);
                            if (docSnap.exists()) {
                                await setDoc(targetRef, {
                                    ...docSnap.data(),
                                    warehouseLocation: selectedOption.name
                                });
                                await deleteDoc(currentRef);
                                console.log(`✅ Moved product to ${selectedOption.name}`);
                            }
                        } catch (err) {
                            console.error('❌ Failed to transfer document:', err);
                        }
                    }
                });
                break;
            case 'supplierProject':
                if (!canUserEditProduct(task)) {
                    console.warn(`[Permissions] Blocked 'supplierProject' change. User cannot edit project.`);
                    return;
                }

                const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
                const selectedWorkspace = userSnap.data()?.selectedWorkspace;
                if (!selectedWorkspace) return;

                const projectsQuery = query(
                    collectionGroup(db, 'projects'),
                    where('workspaceId', '==', selectedWorkspace),
                    where('memberUIDs', 'array-contains', auth.currentUser.uid)
                );

                const querySnap = await getDocs(projectsQuery);
                const options = [];

                querySnap.forEach(doc => {
                    const data = doc.data();
                    options.push({
                        id: doc.id,
                        name: data.title || 'Unnamed Project',
                        ref: doc.ref
                    });
                });

                createAdvancedDropdown(controlElement, {
                    options,
                    itemRenderer: (opt) => `<span>${opt.name}</span>`,
                    onSelect: async (selectedProject) => {
                        const productRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${currentStockType === 'us' ? 'US-Stocks-meta' : 'PH-Stocks-meta'}`, task.id);
                        try {
                            await updateDoc(productRef, {
                                supplierProject: {
                                    name: selectedProject.name,
                                    id: selectedProject.id
                                }
                            });
                            console.log(`✅ Updated supplierProject to "${selectedProject.name}"`);
                        } catch (err) {
                            console.error('❌ Failed to update supplierProject:', err);
                        }
                    }
                });
                break;

            case 'productImage':
                const hasImage = !!product.imageUrl;
                cell.innerHTML = `
        <div class="product-image-wrapper w-10 h-10 bg-gray-200 rounded-md flex items-center justify-center overflow-hidden relative cursor-pointer" data-column-id="productImage">
            ${hasImage
                        ? `<img src="${product.imageUrl}" class="w-full h-full object-cover pointer-events-none">`
                        : '<span class="material-icons text-gray-400 pointer-events-none">photo_camera</span>'
                    }
            <input type="file" accept="image/*" class="hidden image-file-input">
        </div>
    `;

                const wrapper = cell.querySelector('.product-image-wrapper');
                const fileInput = wrapper.querySelector('.image-file-input');

                wrapper.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (hasImage) {
                        // TODO: open image action dropdown (e.g., replace, remove)
                        openImageOptionsDropdown(wrapper, product);
                    } else {
                        fileInput.click();
                    }
                });

                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        uploadProductImage(file, product.id);
                    }
                });

                // --- Drag and Drop ---
                wrapper.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    wrapper.classList.add('drag-hover');
                });

                wrapper.addEventListener('dragleave', () => {
                    wrapper.classList.remove('drag-hover');
                });

                wrapper.addEventListener('drop', (e) => {
                    e.preventDefault();
                    wrapper.classList.remove('drag-hover');
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                        uploadProductImage(file, product.id);
                    }
                });

                break;

            case 'custom-select': {
                if (!canUserEditProduct(task)) {
                    console.warn(`[Permissions] Blocked 'move-task' action. User cannot edit project.`);
                    return;
                }
                const columnId = controlElement.dataset.columnId;
                const column = project.customColumns.find(c => String(c.id) === columnId);

                if (column && column.options) {
                    createAdvancedDropdown(controlElement, {
                        options: column.options,
                        itemRenderer: (option) => `<div class="dropdown-color-swatch" style="background-color: ${option.color || '#ccc'}"></div><span>${option.name}</span>`,
                        onSelect: (selected) => {
                            updateTask(taskId, sectionId, {
                                [`customFields.${column.id}`]: selected.name
                            });
                        },
                        onEdit: (option) => openEditOptionDialog('CustomColumn', option, column.id), // Your existing dialog
                        onAdd: () => openCustomColumnOptionDialog(column.id) // Your existing dialog
                    });
                }
                break;
            }

            case 'move-task': {
                if (!canUserEditProduct(task)) {
                    console.warn(`[Permissions] Blocked 'move-task' action. User cannot edit project.`);
                    return;
                }
                // REFACTORED: Moving tasks also uses the universal advanced dropdown
                const { section: currentSection } = findTaskAndSection(taskId);
                const otherSections = project.sections.filter(s => s.id !== currentSection?.id);

                if (otherSections.length > 0) {
                    createAdvancedDropdown(controlElement, {
                        options: otherSections,
                        searchable: true,
                        searchPlaceholder: "Move to section...",
                        itemRenderer: (section) => `<span>${section.title}</span>`,
                        onSelect: (selectedSection) => {
                            moveTaskToSection(taskId, selectedSection.id);
                        }
                    });
                } else {
                    // Consider replacing alert with a less intrusive notification
                    console.warn("No other sections available to move the task.");
                }
                break;
            }

            // --- These cases remain unchanged ---
            case 'like': {
                const { task, section } = findTaskAndSection(taskId);
                if (!task || !section || !currentUserId) return;

                const sectionRef = collection(currentProjectRef, 'sections');
                const taskRef = doc(sectionRef, section.id, 'tasks', taskId);

                const liked = task.likedBy?.[currentUserId];

                updateDoc(taskRef, liked ? {
                    likedAmount: increment(-1),
                    [`likedBy.${currentUserId}`]: deleteField()
                } : {
                    likedAmount: increment(1),
                    [`likedBy.${currentUserId}`]: true
                });
                break;
            }
            case 'remove-assignee': {
                e.stopPropagation();
                if (!canUserEditProduct(task)) {
                    console.warn(`[Permissions] Blocked 'move-task' action. User cannot edit project.`);
                    return;
                }
                const { section } = findTaskAndSection(taskId);
                if (section) updateTask(taskId, section.id, { assignees: [] });
                break;
            }
        }

        console.log('No specific interactive element was clicked.');
    };

    settingsBtnListener = () => {
        openInventoryModal(currentInventoryId);
    }

    bodyFocusOutListener = (e) => {
        const focusedOutElement = e.target;
        console.log('%cbodyFocusOutListener Triggered', 'color: #888;', 'Element that lost focus:', focusedOutElement);

        // --- Section Title Save ---
        if (focusedOutElement.matches('.section-title')) {
            if (!userCanEditProject) {
                console.warn("[Permissions] Blocked section rename. User cannot edit project.");
                render('us'); // Re-render to discard the user's change
                return;
            }
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

            if (!userCanEditProject) {
                console.warn("[Permissions] Blocked task rename. User role is insufficient.");
                render('us'); // Re-render to discard change.
                return;
            }

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
                    render('us');
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



    addProductHeaderBtnListener = () => {
        openAddProductModal(currentInventoryId, currentStockType, () => {

        });
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
        render('us');
    };

    productListBody.addEventListener('click', handleProductListClick);
    settingsBtn.addEventListener('click', settingsBtnListener);
    productListBody.addEventListener('focusout', bodyFocusOutListener);
    addProductHeaderBtn.addEventListener('click', addProductHeaderBtnListener);
    window.addEventListener('click', setupGlobalClickListeners);
    if (filterBtn) filterBtn.addEventListener('click', filterBtnListener);
    if (sortBtn) sortBtn.addEventListener('click', sortBtnListener);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            closeFloatingPanels();
        }
    });

}


function openImageOptionsDropdown(container, product) {
    // Use your custom dropdown UI to offer "Replace" or "Remove" options
    console.log('Open image options for:', product.id);
}


function setupGlobalClickListeners() {

    // Use 'true' for the capture phase. This lets our listener inspect the click
    // before it reaches the target element, which is ideal for "click outside" logic.
    document.addEventListener('click', (e) => {

        // --- 1. Handle Closing the Main Task Sidebar ---
        // Find the sidebar element. This assumes TaskSidebar is a separate module.
        const taskSidebar = document.getElementById('task-sidebar');

        // Only run this check if the sidebar is actually visible.
        if (taskSidebar && taskSidebar.classList.contains('is-visible')) {
            // Define all the areas that are "safe" to click without closing the sidebar.
            // This includes the sidebar itself AND any floating panels it may have opened.
            const safeAreas = '#task-sidebar, .advanced-dropdown, .floating-panel, .flatpickr-calendar';

            // If the click was NOT inside any of the safe areas...
            if (!e.target.closest(safeAreas)) {
                // ...then call the public 'close' method for the sidebar.
                // This assumes your TaskSidebar module has a global close method.
                // If not, you would call the relevant close function directly.
                if (window.TaskSidebar && typeof window.TaskSidebar.close === 'function') {
                    window.TaskSidebar.close();
                }
            }
        }

        // --- 2. Handle Closing Modals/Dialogs ---
        // Find the top-most dialog overlay.
        const dialogOverlay = e.target.closest('.dialog-overlay, .filterlistview-dialog-overlay');

        // If a dialog was clicked...
        if (dialogOverlay) {
            // ...and the click was on the overlay background itself (not its children)...
            if (e.target === dialogOverlay) {
                // ...then remove it.
                dialogOverlay.remove();
            }
        }

        // --- 3. Handle Your Other UI Logic (e.g., headerRight) ---
        // This logic can remain if it's still needed. It checks if the left drawer is closed.
        const drawer = document.getElementById('drawer'); // Assuming 'drawer' is the ID of the left sidebar
        const headerRight = document.getElementById('listview-header-right'); // Make sure this has a specific ID

        // This condition is a bit confusing. A clearer way to write this might be:
        // if the left sidebar is closed or doesn't exist, show the header right controls.
        if (headerRight && (!drawer || !drawer.classList.contains('is-open'))) {
            headerRight.classList.remove('hide');
        }

    }, true);
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
        render('us');
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

async function handleSectionReorder(evt) {
    console.log("🔄 Section reorder triggered.");

    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    try {
        const sectionRef = doc(collection(currentProjectRef, 'sections'), sectionId);

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

async function handleTaskMoved(evt) {
    console.log("🧪 Drag Event Details:", evt);

    const user = auth.currentUser;
    if (!user) {
        console.error("❌ User not authenticated.");
        return;
    }

    const taskEl = evt.item;
    const taskId = taskEl.dataset.taskId;

    const newSectionEl = evt.to.closest(".section-wrapper");
    const oldSectionEl = evt.from.closest(".section-wrapper");
    const newSectionId = newSectionEl?.dataset.sectionId;
    const oldSectionId = oldSectionEl?.dataset.sectionId;

    if (!taskId || !newSectionId || !oldSectionId) {
        console.error("❌ Critical ID missing.", { taskId, newSectionId, oldSectionId });
        return;
    }

    try {
        const batch = writeBatch(db);

        if (newSectionId === oldSectionId) {
            console.log(`Reordering task "${taskId}" in section "${newSectionId}"`);
            const tasksToUpdate = Array.from(newSectionEl.querySelectorAll(".task-row-wrapper"));

            tasksToUpdate.forEach((el, index) => {
                const currentTaskId = el.dataset.taskId;
                if (!currentTaskId) return;

                const taskRef = doc(db, `${currentProjectRef.path}/sections/${newSectionId}/tasks/${currentTaskId}`);
                batch.update(taskRef, { order: index });
            });

        } else {
            console.log(`Moving task "${taskId}" from section "${oldSectionId}" to "${newSectionId}"`);

            const sourceRef = doc(db, `${currentProjectRef.path}/sections/${oldSectionId}/tasks/${taskId}`);
            const sourceSnap = await getDoc(sourceRef);
            if (!sourceSnap.exists()) {
                console.error("❌ Task not found in the source section. Cannot move.");
                return;
            }

            const newDocRef = doc(collection(db, `${currentProjectRef.path}/sections/${newSectionId}/tasks`));
            const taskData = {
                ...sourceSnap.data(),
                sectionId: newSectionId,
                id: newDocRef.id
            };

            const targetSection = project.sections.find(s => s.id === newSectionId);
            if (targetSection?.sectionType === 'completed') {
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

                const taskRef = doc(db, `${currentProjectRef.path}/sections/${newSectionId}/tasks/${currentTaskId}`);
                batch.update(taskRef, { order: index, sectionId: newSectionId });
            });

            const oldSectionTasks = Array.from(oldSectionEl.querySelectorAll(".task-row-wrapper"));
            oldSectionTasks.forEach((el, index) => {
                const currentTaskId = el.dataset.taskId;
                if (!currentTaskId) return;

                const taskRef = doc(db, `${currentProjectRef.path}/sections/${oldSectionId}/tasks/${currentTaskId}`);
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
function enableColumnRename(columnEl, stockType) {
    closeFloatingPanels();

    const cellText = columnEl.querySelector('span');
    const originalName = cellText.textContent.trim();
    cellText.contentEditable = 'true';
    cellText.focus();
    document.execCommand('selectAll', false, null);

    const columnId = columnEl.dataset.columnId;

    const finishEditing = async (saveChanges) => {
        cellText.removeEventListener('blur', onBlur);
        cellText.removeEventListener('keydown', onKeyDown);
        cellText.contentEditable = 'false';

        const newName = cellText.textContent.trim();
        if (!saveChanges || !newName || newName === originalName) {
            cellText.textContent = originalName;
            return;
        }

        try {
            const invRef = doc(db, 'InventoryWorkspace', currentInventoryId);
            const invSnap = await getDoc(invRef);
            if (!invSnap.exists()) return;

            const data = invSnap.data();
            const columnKey = stockType === 'us' ? 'columns_us' : 'columns_ph';
            const columns = Array.isArray(data[columnKey]) ? [...data[columnKey]] : [];

            const colIndex = columns.findIndex(c => c.id === columnId);
            if (colIndex === -1) return;

            columns[colIndex] = { ...columns[colIndex], name: newName };

            await updateDoc(invRef, {
                [columnKey]: columns
            });

            console.log(`✅ Column '${columnId}' renamed to '${newName}' and saved to ${columnKey}`);
        } catch (err) {
            console.error('❌ Failed to rename column:', err);
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
async function flattenProjectData() {
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
 * Toggles the 'isRestricted' property for a specific column rule in Firestore.
 * @param {object} column - The column object to toggle the rule for.
 */
async function toggleColumnRestriction(column, stockType) {
    try {
        const invRef = doc(db, 'InventoryWorkspace', currentInventoryId);
        const invSnap = await getDoc(invRef);
        if (!invSnap.exists()) return console.error('InventoryWorkspace document not found');

        const data = invSnap.data();
        const columnKey = stockType === 'us' ? 'columns_us' : 'columns_ph';
        const columns = Array.isArray(data[columnKey]) ? [...data[columnKey]] : [];

        const index = columns.findIndex(c => c.id === column.id);
        if (index === -1) return console.warn(`Column ${column.id} not found in ${columnKey}`);

        // Toggle the `isRestricted` flag
        columns[index].isRestricted = !columns[index].isRestricted;

        await updateDoc(invRef, {
            [columnKey]: columns
        });

        console.log(`✅ ${column.id} restriction toggled to: ${columns[index].isRestricted}`);
    } catch (err) {
        console.error('❌ Failed to toggle column restriction:', err);
    }
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

async function updateProduct(productId, stockType, data) {
    if (!currentInventoryId || !productId) return;

    const stockCollection = stockType === 'us' ? 'US-Stocks-meta' : 'PH-Stocks-meta';
    const productRef = doc(db, 'InventoryWorkspace', currentInventoryId, stockCollection, productId);

    try {
        await updateDoc(productRef, data);
        console.log(`✅ Product ${productId} updated in ${stockCollection}:`, data);
    } catch (err) {
        console.error(`❌ Failed to update ${stockCollection}/${productId}`, err);
    }
}



async function addNewSizeColumnsToInventory(inventoryId) {
    const ref = doc(db, 'InventoryWorkspace', inventoryId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        console.error('Inventory not found');
        return;
    }

    const newColumnsToAdd = [
        { id: "s", name: "S", type: "SizeNumber", isRestricted: false },
        { id: "m", name: "M", type: "SizeNumber", isRestricted: false },
        { id: "l", name: "L", type: "SizeNumber", isRestricted: false },
        { id: "xl", name: "XL", type: "SizeNumber", isRestricted: false },
        { id: "xxl", name: "XXL", type: "SizeNumber", isRestricted: false },
        { id: "c", name: "C", type: "SizeNumber", isRestricted: false },
        { id: "others", name: "Others", type: "Text", isRestricted: false },
        { id: "total", name: "Total", type: "Text", isRestricted: false },
    ];

    const data = snap.data();

    const updatedColumnsPH = (data.columns_ph || []).concat(newColumnsToAdd);
    const updatedColumnsUS = (data.columns_us || []).concat(newColumnsToAdd);

    await updateDoc(ref, {
        columns_ph: updatedColumnsPH,
        columns_us: updatedColumnsUS
    });

    console.log('Columns added successfully.');
}

function createFloatingInput(targetCell, task, column) {
    if (document.querySelector('.floating-input-wrapper')) return;

    const scrollContainer = targetCell.closest('.juanlunacms-spreadsheetlist-custom-scrollbar');
    if (!scrollContainer) return;

    const cellRect = targetCell.getBoundingClientRect();
    const currentValue = task[column.id] || '';

    const wrapper = document.createElement('div');
    wrapper.className = 'floating-input-wrapper';
    wrapper.style.position = 'fixed';
    wrapper.style.top = `${cellRect.top}px`;
    wrapper.style.left = `${cellRect.left}px`;
    wrapper.style.width = `${cellRect.width}px`;
    wrapper.style.minHeight = `${cellRect.height}px`;

    let editor;
    let saveButton;
    let outsideClickListener;

    if (column.type === 'Tracking') {
        wrapper.classList.add('tracking-input-mode');
        editor = document.createElement('input');
        editor.type = 'text';
        editor.className = 'floating-input';
        editor.value = currentValue;
        editor.placeholder = 'Enter USPS Tracking No...';

        saveButton = document.createElement('button');
        saveButton.className = 'floating-save-btn';
        saveButton.textContent = 'Save';

        const validate = () => {
            const isValid = isValidUPSTrackingNumber(editor.value);
            saveButton.disabled = !isValid;
            editor.classList.toggle('is-invalid', editor.value.length > 0 && !isValid);
        };
        editor.addEventListener('input', validate);
        setTimeout(validate, 0);

    } else if (column.type === 'Text') {
        editor = document.createElement('textarea');
        editor.className = 'floating-input';
        editor.value = currentValue;
        const autoGrow = () => {
            editor.style.height = 'auto';
            editor.style.height = (editor.scrollHeight) + 'px';
            wrapper.style.height = editor.style.height;
        };
        editor.addEventListener('input', autoGrow);
        setTimeout(autoGrow, 0);

    } else {
        editor = document.createElement('input');
        editor.type = 'number';
        editor.className = 'floating-input';
        editor.value = currentValue;
        wrapper.style.height = `${cellRect.height}px`;
    }

    const repositionOnScroll = () => {
        const newRect = targetCell.getBoundingClientRect();
        wrapper.style.top = `${newRect.top}px`;
        wrapper.style.left = `${newRect.left}px`;
    };

    const cleanup = () => {
        scrollContainer.removeEventListener('scroll', repositionOnScroll);
        document.removeEventListener('click', outsideClickListener, true);
        wrapper.remove();
    };

    const saveAndClose = () => {

        const newValue = editor.value.trim();
        const oldValue = String(currentValue).trim();

        if (newValue !== oldValue) {
            const parsedValue = (column.type === 'Costing' || column.type === 'Numbers')
                ? parseFloat(newValue) || 0
                : newValue;

            updateProduct(task.id, currentStockType, {
                [column.id]: parsedValue
            });


            if (column.type === 'Tracking' && parsedValue) {
                const cellContent = targetCell.querySelector('.cell-content');
                if (cellContent) {
                    cellContent.innerHTML = `
                        <div id="tracking-status-${parsedValue}" class="flex items-center gap-2">
                            <div class="loading-spinner"></div>
                            <span>${parsedValue}</span>
                        </div>
                    `;
                }
            }
        }

        cleanup();
    };

    editor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && editor.tagName !== 'TEXTAREA') {
            e.preventDefault();
            saveAndClose();
        } else if (e.key === 'Escape') {
            cleanup();
        }
    });

    // ✅ Save when user clicks anywhere outside
    outsideClickListener = (e) => {
        if (!wrapper.contains(e.target)) {
            saveAndClose();
        }
    };
    document.addEventListener('click', outsideClickListener, true);

    scrollContainer.addEventListener('scroll', repositionOnScroll);

    wrapper.appendChild(editor);
    if (saveButton) {
        wrapper.appendChild(saveButton);
        saveButton.addEventListener('click', saveAndClose);
    }

    document.body.appendChild(wrapper);
    editor.focus();
    editor.select();
}

async function render(stockType) {
    let productList = stockType === 'ph' ? dataPhStocks : dataUsStocks;
    let savedColumnWidths = {};
    if (!productListBody || !currentInventoryId) return;



    const docSnap = await getDoc(doc(db, 'InventoryWorkspace', currentInventoryId));
    if (!docSnap.exists()) return;
    console.log('✅ Rendering PH with:', dataPhStocks.length, 'items');

    if (!Array.isArray(productList) || productList.length === 0) {
        console.warn('⚠️ productList is empty or invalid!', productList);
    }

    const data = docSnap.data();
    savedColumnWidths = stockType === 'us'
        ? data.customResizeWidthUSStock || {}
        : data.customResizeWidthPHStock || {};
    const columnRules = Array.isArray(data[`columnRules_${stockType}`]) ? data[`columnRules_${stockType}`] : [];

    // Permission check
    // Get the user's workspace document
    // --- Get Workspace and check for Ownership ---
    const myWorkspaceRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}`);
    const myWorkspaceSnap = await getDoc(myWorkspaceRef);
    const workspaceData = myWorkspaceSnap.exists() ? myWorkspaceSnap.data() : null;

    // Condition 1: Check if the user is the owner (from workspace data)
    const ownerRef = workspaceData?.ownerWorkspaceRef;
    const ownerPath = typeof ownerRef === 'string' ? ownerRef : ownerRef?.path;
    const isOwner = ownerPath?.includes(currentUserId);


    // --- Get main User Document to check for Role ---
    const userDocRef = doc(db, 'users', currentUserId);
    const userDocSnap = await getDoc(userDocRef);

    // Condition 2: Check if the user's role is Admin or Developer (from user data)
    const userRole = userDocSnap.exists() ? userDocSnap.data()?.role : null;
    const isAdminOrDev = userRole === 3 || userRole === 0; // 3 = Admin, 0 = Developer


    // --- Final Permission: True if EITHER condition is met ---
    canUserEditProduct = !!(isOwner || isAdminOrDev);
    canUserEditProduct = !!(isOwner && isAdminOrDev);

    if (!canUserEditProduct) {
        console.warn('⚠️ User does not have permission to add products.');
        addProductHeaderBtn.classList.add('hidden');
    }
    // Column setup from Firestore
    const firestoreColumns = stockType === 'us'
        ? data.columns_us || []
        : data.columns_ph || [];

    // 🟢 Apply saved column order
    const columnOrder = data[`columnOrder_${stockType}`] || [];
    if (Array.isArray(columnOrder) && columnOrder.length > 0) {
        firestoreColumns.sort((a, b) => {
            return columnOrder.indexOf(a.id) - columnOrder.indexOf(b.id);
        });
    }
    const baseColumnIds = ['productImage', 'productSku', 'supplierCost', 'supplierName', 'supplierProject', 'warehouseLocation'];
    const baseColumns = firestoreColumns.filter(col => baseColumnIds.includes(col.id));
    const allColumns = firestoreColumns.map(col => ({ ...col }));

    // Structure data
    const project = {
        id: `project_${stockType}`,
        name: `${stockType.toUpperCase()} Stock Inventory`,
        products: Array.isArray(productList)
            ? productList
                .filter(item => {
                    if (!item || typeof item !== 'object' || !item.id) return false;

                    const meaningfulKeys = Object.entries(item).filter(([key, value]) => {
                        if (['id', 'productId', 'createdAt'].includes(key)) return false;

                        if (typeof value === 'string') return value.trim() !== '';
                        if (typeof value === 'number') return value !== 0; // ✅ This will allow non-zero sizes
                        if (typeof value === 'object') return value !== null;
                        return value !== undefined;
                    });

                    return meaningfulKeys.length > 0;

                })
                .map(item => ({
                    ...item,
                    productId: item.id,
                    name: item.name || 'Unnamed Product'
                }))
            : [],
        columnRules: columnRules
    };


    const headerClickListener = (e) => {
        const columnOptionsIcon = e.target.closest('.options-icon');

        if (columnOptionsIcon) {
            e.stopPropagation();

            const columnEl = columnOptionsIcon.closest('[data-column-id]');
            if (!columnEl) return;

            const columnId = columnEl.dataset.columnId;
            const column = allColumns.find(c => String(c.id) === String(columnId));
            if (!column) return;

            const dropdownOptions = [{ name: 'Rename column' }];

            if (canUserEditProduct) {
                const isCurrentlyRestricted = column.isRestricted === true;
                dropdownOptions.push({
                    name: isCurrentlyRestricted ? 'Unrestrict Column' : 'Restrict Column'
                });
            }

            createAdvancedDropdown(columnOptionsIcon, {
                options: dropdownOptions,
                itemRenderer: (option) => `<span>${option.name}</span>`,
                onSelect: (selected) => {
                    if (selected.name === 'Rename column') {
                        enableColumnRename(columnEl);
                    } else if (selected.name.includes('Restrict Column')) {
                        toggleColumnRestriction(column, stockType);
                    }
                }
            });

            return;
        }
    };

    // UI rendering
    productListBody.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'w-full h-full overflow-auto bg-white border border-slate-200 juanlunacms-spreadsheetlist-custom-scrollbar';
    const table = document.createElement('div');
    table.className = 'min-w-max relative';

    const header = document.createElement('div');
    header.className = 'flex sticky top-0 z-20 bg-white h-[22px]';

    const leftHeader = document.createElement('div');
    leftHeader.className = 'sticky left-0 z-30 bg-white w-80 md:w-96 lg:w-[400px] flex-shrink-0 px-4 font-semibold text-slate-600 border-b border-r border-slate-200 text-xs flex items-center';
    leftHeader.textContent = 'Product Name';

    const rightHeaderContent = document.createElement('div');
    rightHeaderContent.className = 'flex flex-grow border-b border-slate-200 juanlunacms-column-header';



    allColumns.forEach(col => {
        const fixedColumnWidths = {
            total: 80,
            productVendor: 100,
            s: 50,
            m: 50,
            l: 50,
            xl: 50,
            xxl: 50,
            c: 50,
            others: 100
        };

        const width = fixedColumnWidths[col.id] || savedColumnWidths[col.id] || 150;

        const cell = document.createElement('div');
        cell.dataset.columnId = col.id;
        cell.className = 'group relative px-2 py-1 font-semibold text-slate-600 border-r border-slate-200 bg-white flex items-center text-xs';
        cell.style.width = `${width}px`;
        cell.style.minWidth = `${width}px`;

        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-grow items-center justify-between min-w-0';

        const text = document.createElement('span');
        text.textContent = col.name;
        text.className = 'header-cell-content flex-grow truncate text-ellipsis overflow-hidden';

        const optionsIcon = document.createElement('span');
        optionsIcon.className = 'material-icons options-icon text-slate-400 hover:text-slate-600 cursor-pointer text-[18px] ml-2';
        optionsIcon.textContent = 'more_vert'; // vertical three dots

        wrapper.appendChild(text);
        wrapper.appendChild(optionsIcon);


        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';

        cell.appendChild(wrapper);
        cell.appendChild(resizeHandle);
        rightHeaderContent.appendChild(cell);
    });

    if (canUserEditProduct) {
        rightHeaderContent.addEventListener('click', headerClickListener);
    }

    header.appendChild(leftHeader);
    header.appendChild(rightHeaderContent);

    const body = document.createElement('div');
    const productsContainer = document.createElement('div');
    productsContainer.className = 'products-container';

    const sortedProducts = project.products.sort((a, b) => (a.order || 0) - (b.order || 0));
    sortedProducts.forEach(product => {
        const row = document.createElement('div');
        row.className = 'product-row-wrapper flex group border-b border-slate-200 h-[32px]';
        row.dataset.productId = product.id;

        const leftCell = document.createElement('div');
        leftCell.className = 'sticky left-0 z-10 bg-white px-1 w-80 md:w-96 lg:w-[400px] flex-shrink-0 flex items-center border-r border-transparent group-hover:bg-slate-50 py-0.5';
        leftCell.innerHTML = `
    <div class="drag-handle ${!canUserEditProduct ? 'hidden' : ''} cursor-grab p-1 hover:bg-slate-200">
        <span class="material-icons text-slate-500" style="font-size: 20px;">drag_indicator</span>
    </div>
    <div class="flex items-center flex-grow min-w-0">
        <span class="product-name truncate text-[13px] px-1 ${canUserEditProduct ? 'focus:bg-white focus:ring-1 focus:ring-slate-300' : 'cursor-default'}" 
              contenteditable="${canUserEditProduct}" data-product-id="${product.id}">
            ${product.name}
        </span>
    </div>
`;


        const rightCells = document.createElement('div');
        rightCells.className = 'flex-grow flex group-hover:bg-slate-50';

        const fixedColumnWidths = {
            total: 80,
            productVendor: 100,
            s: 50,
            m: 50,
            l: 50,
            xl: 50,
            xxl: 50,
            c: 50,
            others: 100
        };

        allColumns.forEach(col => {
            const width = fixedColumnWidths[col.id] || savedColumnWidths[col.id] || 150;
            const cell = document.createElement('div');
            const rule = project.columnRules?.find(r => r.name === col.name);
            const isRestricted = !!rule?.isRestricted;
            const isEditable = canUserEditProduct && !isRestricted;

            const rawValue = product[col.id] !== undefined && product[col.id] !== null ? product[col.id] : '';
            cell.dataset.columnId = col.id;
            cell.style.width = `${width}px`;
            cell.style.minWidth = `${width}px`;
            cell.className = `table-cell px-2 py-1 flex items-center border-r border-slate-200 text-sm ${!isEditable ? 'bg-slate-50 cursor-not-allowed' : ''}`;

            switch (col.id) {
                case 'productImage': { // Brackets create a block scope for our variables
                    const hasImage = !!product.imageUrl;

                    // 1. Set the initial HTML for the cell.
                    // We use a w-10 h-10 container for a better click/drag target area.
                    cell.innerHTML = `
        <div class="product-image-wrapper w-6 h-6 bg-gray-200 rounded-md flex items-center justify-center overflow-hidden relative cursor-pointer" data-column-id="productImage">
            ${hasImage
                            ? `<img src="${product.imageUrl}" class="w-full h-full object-cover pointer-events-none">`
                            : '<span class="material-icons text-gray-400 text-[18px] pointer-events-none">photo_camera</span>'
                        }
            <input type="file" accept="image/*" class="hidden image-file-input">
        </div>
    `;


                    // 2. Get references to the interactive elements we just created.
                    const wrapper = cell.querySelector('.product-image-wrapper');
                    const fileInput = cell.querySelector('.image-file-input');

                    // 3. Attach all necessary event listeners for interactivity.

                    // --- Click-to-Upload ---
                    wrapper.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent other listeners from firing.
                        fileInput.click();   // Open the file selection dialog.
                    });

                    // --- File Picker Selection ---
                    fileInput.addEventListener('change', (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            // Call the helper function to handle the upload.
                            uploadProductImage(file, product.id);
                        }
                    });

                    // --- Drag and Drop ---
                    wrapper.addEventListener('dragover', (e) => {
                        e.preventDefault(); // This is necessary to allow a drop.
                        wrapper.classList.add('drag-hover'); // Optional: style for hover effect.
                    });

                    wrapper.addEventListener('dragleave', () => {
                        wrapper.classList.remove('drag-hover');
                    });

                    wrapper.addEventListener('drop', (e) => {
                        e.preventDefault();
                        wrapper.classList.remove('drag-hover');
                        const file = e.dataTransfer.files[0];
                        if (file && file.type.startsWith('image/')) {
                            // Call the helper function to handle the upload.
                            uploadProductImage(file, product.id);
                        }
                    });

                    break;
                }

                case 'supplierCost':
                    const cost = typeof rawValue === 'number' ? `$${rawValue.toFixed(2)}` : '';
                    cell.innerHTML = `<span class="px-1 w-full block truncate">${cost}</span>`;

                    if (isEditable) {
                        col.type = 'Costing';
                        cell.dataset.control = 'supplierCost'; // Add control type
                        cell.addEventListener('click', () => {
                            createFloatingInput(cell, product, col);
                        });
                    }
                    break;

                case 'supplierProject':
                    cell.dataset.control = 'supplierProject'; // 👈 required for dropdown click handler
                    const displayValue = (typeof rawValue === 'object' && rawValue !== null)
                        ? rawValue.name || 'Unnamed Project'
                        : rawValue || (isEditable ? 'Select Project' : 'N/A');

                    cell.innerHTML = `<div class="status-tag ${isEditable ? 'cursor-pointer' : ''}">${displayValue}</div>`;
                    break;

                case 'warehouseLocation':
                    cell.dataset.control = 'warehouseLocation'; // 👈 required for dropdown click handler
                    cell.innerHTML = `
            <div class="flex items-center gap-1">
                <span class="material-icons text-slate-400 text-xs">location_on</span>
                <span class="editable-location px-1 w-full ${isEditable ? 'cursor-pointer' : 'cursor-default'}">
                    ${rawValue || ''}
                </span>
            </div>
        `;
                    break;

                case 'total':
                    const sizeFields = ['s', 'm', 'l', 'xl', 'xxl', 'c', 'others'];
                    const total = sizeFields.reduce((sum, field) => {
                        const val = parseFloat(product[field]);
                        return sum + (isNaN(val) ? 0 : val);
                    }, 0);
                    cell.innerHTML = `<span class="px-1 w-full text-right">${total}</span>`;
                    // ❌ Not editable
                    break;

                case 'productVendor':
                case 's':
                case 'm':
                case 'l':
                case 'xl':
                case 'xxl':
                case 'c':
                case 'others':
                    let colorClass = 'text-slate-700'; // Default color
                    const numericValue = parseInt(rawValue, 10);

                    if (!isNaN(numericValue)) {
                        if (numericValue >= 0 && numericValue <= 5) {
                            colorClass = 'text-red-600 font-bold'; // Red and bold for 0-5
                        } else if (numericValue < 10) {
                            colorClass = 'text-yellow-600'; // Yellow for 6-9
                        } else {
                            colorClass = 'text-green-600'; // Green for 10+
                        }
                    }

                    // Apply the dynamic color class to the span
                    cell.innerHTML = `<span class="px-1 w-full block truncate ${colorClass}">${rawValue}</span>`;

                    if (isEditable) {
                        col.type = 'Text';
                        cell.dataset.control = col.id;
                        cell.addEventListener('click', () => {
                            createFloatingInput(cell, product, col);
                        });
                    }
                    break;

                default:
                    cell.innerHTML = `<span class="px-1 w-full block truncate">${rawValue}</span>`;
                    if (isEditable) {
                        col.type = 'Text';
                        cell.dataset.control = col.id; // fallback
                        cell.addEventListener('click', () => {
                            createFloatingInput(cell, product, col);
                        });
                    }
            }


            rightCells.appendChild(cell);
        });

        row.appendChild(leftCell);
        row.appendChild(rightCells);
        productsContainer.appendChild(row);
    });

    table.appendChild(header);
    body.appendChild(productsContainer);
    table.appendChild(body);
    container.appendChild(table);
    productListBody.appendChild(container);

    if (canUserEditProduct) {
        Sortable.create(productsContainer, {
            group: 'products',
            handle: '.drag-handle',
            animation: 300,
            onEnd: async (evt) => {
                await handleProductMoved(evt);
            }
        });
        initColumnDragging(allColumns);
    }

    initColumnResizing(stockType, savedColumnWidths);
    requestAnimationFrame(syncColumnWidths);
}

function initColumnDragging(allColumns) {
    const headerContainer = document.querySelector('.juanlunacms-column-header');
    if (!headerContainer) return;

    Sortable.create(headerContainer, {
        animation: 150,
        handle: '.group', // make sure .group is applied on draggable cell
        filter: '.resize-handle',
        onEnd: async (evt) => {
            if (evt.oldIndex === evt.newIndex) return;

            // Get new column order
            const newColumnOrder = Array.from(evt.to.children)
                .map(el => el.dataset.columnId)
                .filter(id => id);

            // Update local order
            const newOrderedColumns = newColumnOrder.map(id =>
                allColumns.find(col => col.id === id)
            ).filter(Boolean);

            // Save column order to Firestore
            try {
                const docRef = doc(db, 'InventoryWorkspace', currentInventoryId);
                await updateDoc(docRef, {
                    [`columnOrder_${currentStockType}`]: newColumnOrder
                });
                console.log("✅ Column order saved to Firestore.");
            } catch (error) {
                console.error("❌ Failed to save column order:", error);
            }

            // Re-render
            await render(currentStockType);
        }
    });
}


function syncColumnWidths() {
    const table = document.querySelector('.min-w-max.relative');
    if (!table) return;

    const headerContainer = table.querySelector('.juanlunacms-spreadsheetlist-sticky-header');
    if (!headerContainer) return;

    const allColumnIds = Array.from(headerContainer.querySelectorAll('[data-column-id]')).map(cell => cell.dataset.columnId);

    const fixedColumnWidths = {
        total: 80,
        productVendor: 100,
        s: 50,
        m: 50,
        l: 50,
        xl: 50,
        xxl: 50,
        c: 50,
        others: 100
    };

    let minWidth = fixedColumnWidths[columnId] || 50;

    allColumnIds.forEach(columnId => {
        const headerCell = headerContainer.querySelector(`[data-column-id="${columnId}"]`);
        if (!headerCell) return;

        const textElement = headerCell.querySelector('.header-cell-content');
        const headerContentWidth = textElement ? textElement.scrollWidth : 0;

        let minWidth = 150;

        if (fixed20pxColumns.includes(columnId)) {
            minWidth = 20;  // Force 20px for fixed columns
        } else if (columnId === 'productImage') {
            minWidth = 80;
        } else if (columnId === 'supplierCost') {
            minWidth = 120;
        } else if (columnId === 'productSku') {
            minWidth = 160;
        } else if (['supplierName', 'supplierProject'].includes(columnId)) {
            minWidth = 180;
        }

        const finalWidth = fixedColumnWidths[columnId] || Math.max(minWidth, headerContentWidth) + 32;

        const allCellsInColumn = table.querySelectorAll(`[data-column-id="${columnId}"]`);
        allCellsInColumn.forEach(cell => {
            cell.style.width = `${finalWidth}px`;
            cell.style.minWidth = `${finalWidth}px`;
        });
    });

}

function initColumnResizing() {
    const table = document.querySelector('.min-w-max.relative');
    if (!table) return;

    let initialX, initialWidth, columnId;
    let columnSpecificMinWidth;
    let finalWidth = 0; // ✅ define in outer scope so it can be used in onDragEnd

    const onDragMove = (e) => {
        const currentX = e.touches ? e.touches[0].clientX : e.clientX;
        const deltaX = currentX - initialX;
        finalWidth = Math.max(columnSpecificMinWidth, initialWidth + deltaX); // ✅ update here

        const cellsToResize = table.querySelectorAll(`[data-column-id="${columnId}"]`);
        cellsToResize.forEach(cell => {
            cell.style.width = `${finalWidth}px`;
            cell.style.minWidth = `${finalWidth}px`;
        });
    };

    const onDragEnd = async () => {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);

        if (!currentInventoryId || !currentStockType || !columnId || !finalWidth) return;

        const isUS = currentStockType === 'us';
        const fieldPath = isUS
            ? `customResizeWidthUSStock.${columnId}`
            : `customResizeWidthPHStock.${columnId}`;

        const workspaceRef = doc(db, 'InventoryWorkspace', currentInventoryId);

        try {
            await updateDoc(workspaceRef, {
                [fieldPath]: finalWidth
            });

            console.log(`✅ Saved width for ${columnId} (${finalWidth}px) to ${fieldPath}`);
        } catch (err) {
            console.error('❌ Failed to save column width to InventoryWorkspace root:', err);
        }
    };


    const onDragStart = (e) => {
        if (!e.target.classList.contains('resize-handle')) return;

        e.preventDefault();

        const headerCell = e.target.parentElement;
        columnId = headerCell.dataset.columnId;
        initialX = e.touches ? e.touches[0].clientX : e.clientX;
        initialWidth = headerCell.offsetWidth;

        // Set custom min width for each column
        const fixedMinWidths = {
            productImage: 80,
            supplierCost: 120,
            productSku: 160,
            supplierName: 180,
            supplierProject: 180,
            warehouseLocation: 180,
            total: 80,
            productVendor: 100,
            s: 50,
            m: 50,
            l: 50,
            xl: 50,
            xxl: 50,
            c: 50,
            others: 100
        };

        let minWidth = fixedMinWidths[columnId] || 150;
        columnSpecificMinWidth = minWidth;

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove);
        document.addEventListener('touchend', onDragEnd);
    };

    table.addEventListener('mousedown', onDragStart);
    table.addEventListener('touchstart', onDragStart, { passive: false });
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
        productListBody.removeEventListener('scroll', updateMenuPosition);
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
    productListBody.addEventListener('scroll', updateMenuPosition, { passive: true });
}

async function deleteSectionInFirebase(sectionId) {
    const confirmed = await showConfirmationModal(
        'Are you sure you want to delete this section? All tasks within it will be permanently lost. This action cannot be undone.'
    );
    if (!confirmed) return;

    // THE FIX: Check for the correct project reference.
    if (!currentProjectRef) {
        return console.error("Cannot delete section: Project reference is missing.");
    }

    // Create correct references from the main project reference.
    const sectionRef = doc(currentProjectRef, 'sections', sectionId);
    const tasksCollectionRef = collection(sectionRef, 'tasks');

    const batch = writeBatch(db);

    try {
        const tasksSnapshot = await getDocs(tasksCollectionRef);
        tasksSnapshot.forEach(taskDoc => batch.delete(taskDoc.ref));
        batch.delete(sectionRef);
        await batch.commit();
        console.log(`Successfully deleted section ${sectionId} and all its tasks.`);
    } catch (error) {
        console.error("Error deleting section and its tasks:", error);
        alert("An error occurred while deleting the section. Please check the console.");
    }
}

/**
 * Handles the logic for completing or un-completing a task in a single, atomic operation.
 * @param {object} task - The task object being toggled.
 * @param {HTMLElement} taskRowEl - The DOM element for the task row for UI updates.
 */
async function handleTaskCompletion(task, taskRowEl) {
    if (!task || !taskRowEl) return;

    const sourceSection = findSectionById(task.sectionId);
    if (!sourceSection) {
        console.error("Could not find the source section for the task.");
        return;
    }

    const taskId = task.id;
    const batch = writeBatch(db);
    const isCurrentlyCompleted = task.status === 'Completed';

    if (isCurrentlyCompleted) {
        // --- LOGIC FOR UN-COMPLETING A TASK ---
        console.log(`Un-completing task: "${task.name}"`);

        const targetSectionId = task.previousSectionId || sourceSection.id;
        const targetSection = findSectionById(targetSectionId);

        if (!targetSection) {
            console.error(`Cannot un-complete task. Target section with ID "${targetSectionId}" not found.`);
            return;
        }

        // *** THE FIX IS HERE ***
        // 1. Use destructuring to pull out the fields we want to discard (`previousStatus`, `previousSectionId`).
        //    The `...restOfTask` variable will contain all other properties from the original task object.
        const { previousStatus, previousSectionId, ...restOfTask } = task;

        // 2. Build the new data object from the `restOfTask`, ensuring the unwanted fields are gone.
        const updatedTaskData = {
            ...restOfTask,
            status: previousStatus || 'On track', // Use the value we extracted
            sectionId: targetSection.id,
        };
        // *** END OF FIX ***

        const sourceTaskRef = doc(currentProjectRef, `sections/${sourceSection.id}/tasks/${taskId}`);
        const targetTaskRef = doc(currentProjectRef, `sections/${targetSection.id}/tasks/${taskId}`);

        batch.delete(sourceTaskRef);
        // Now, this `set` operation works because `updatedTaskData` is a clean object without any `deleteField()` instructions.
        batch.set(targetTaskRef, updatedTaskData);

    } else {
        // --- LOGIC FOR COMPLETING A TASK (This part was already correct) ---
        console.log(`Completing task: "${task.name}"`);
        const completedSection = project.sections.find(s => s.sectionType === 'completed');

        if (!completedSection) {
            console.error("Cannot complete task: A section with sectionType: 'completed' was not found.");
            return;
        }

        const updatedTaskData = {
            ...task,
            status: 'Completed',
            previousStatus: task.status,
            previousSectionId: sourceSection.id,
            sectionId: completedSection.id,
        };

        const sourceTaskRef = doc(currentProjectRef, `sections/${sourceSection.id}/tasks/${taskId}`);
        const targetTaskRef = doc(currentProjectRef, `sections/${completedSection.id}/tasks/${taskId}`);

        batch.delete(sourceTaskRef);
        batch.set(targetTaskRef, updatedTaskData);
    }

    // --- Execute the batch and update the UI ---
    try {
        await batch.commit();
        console.log(`Task ${taskId} completion status updated successfully in Firestore.`);
        taskRowEl.classList.toggle('is-completed', !isCurrentlyCompleted);
        render('us');

    } catch (error) {
        console.error(`Error updating task completion for ${taskId}:`, error);
    }
}

/**
 * Moves a task to a different section. If the target section is the "Completed"
 * section, it also updates the task's status.
 * @param {string} taskId The ID of the task to move.
 * @param {string} targetSectionId The ID of the destination section.
 */
async function moveTaskToSection(taskId, targetSectionId) {
    if (!currentProjectRef) return console.error("Cannot move task: Project reference is missing.");

    const { task: taskToMove, section: sourceSection } = findTaskAndSection(taskId);
    const targetSection = findSectionById(targetSectionId);

    if (!taskToMove || !sourceSection || !targetSection || sourceSection.id === targetSectionId) {
        return console.error("Cannot move task. Invalid source or target.");
    }

    // Prepare the initial data object for the new task document.
    const newTaskData = {
        ...taskToMove,
        id: taskId,
        sectionId: targetSectionId,
    };

    // --- UPDATED LOGIC FOR STATUS CHANGES ---

    // Case 1: Moving INTO a 'completed' section
    if (targetSection.sectionType === 'completed') {
        console.log(`Task moved to 'Completed' section. Updating status.`);

        // If the task isn't already completed, save its current status for potential reversal.
        if (newTaskData.status !== 'Completed') {
            newTaskData.previousStatus = newTaskData.status;
        }
        // Set the new status to 'Completed'.
        newTaskData.status = 'Completed';
    }
    // Case 2: Moving OUT OF a 'completed' section
    else if (sourceSection.sectionType === 'completed') {
        console.log(`Task moved out of 'Completed' section. Reverting status.`);

        // Revert to the stored previous status, or a sensible default like 'On track'.
        newTaskData.status = taskToMove.previousStatus || 'On track';

        // Clean up the previousStatus field as it's no longer needed.
        newTaskData.previousStatus = deleteField();
    }
    // --- END OF UPDATED LOGIC ---

    const sourceTaskRef = doc(currentProjectRef, `sections/${sourceSection.id}/tasks/${taskId}`);
    const newTaskRef = doc(currentProjectRef, `sections/${targetSectionId}/tasks/${taskId}`);

    try {
        const batch = writeBatch(db);
        batch.delete(sourceTaskRef);
        // Use { merge: true } with set() to allow deleteField() to work correctly.
        batch.set(newTaskRef, newTaskData, { merge: true });
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
        window.TaskSidebar.open(taskId, currentProjectRef);
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
    if (!currentProjectRef || !sectionId || !taskId) {
        return console.error("Missing IDs or project reference, cannot update task.");
    }
    console.log('updating task');
    const taskRef = doc(currentProjectRef, `sections/${sectionId}/tasks/${taskId}`);
    try {
        await updateDoc(taskRef, propertiesToUpdate);
        console.log(`Task ${taskId} updated successfully.`);
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
    if (!currentProjectRef || !sectionId) {
        return console.error("Cannot add task: Missing section ID or project reference.");
    }
    const sectionRef = doc(currentProjectRef, 'sections', sectionId);
    const tasksCollectionRef = collection(sectionRef, 'tasks');

    try {
        const newTaskRef = doc(tasksCollectionRef); // Create a reference to get the ID
        const fullTaskData = {
            ...taskData,
            id: newTaskRef.id,
            projectId: currentProjectId, // Keep projectId for collectionGroup queries
            userId: currentUserId,
            sectionId: sectionId,
            createdAt: serverTimestamp()
        };
        await setDoc(newTaskRef, fullTaskData);
        console.log("Successfully added task with ID: ", newTaskRef.id);
    } catch (error) {
        console.error("Error adding task:", error);
    }
}

/**
 * Creates a new section document in a project's subcollection.
 * This version is collaboration-ready and uses the correct project reference.
 */
async function addSectionToFirebase() {
    // THE FIX: Check for the global project reference first.
    if (!currentProjectRef) {
        return console.error("Cannot add section: Project reference is missing.");
    }

    // This logic remains the same.
    const newOrder = project.sections ? project.sections.length : 0;

    try {
        // THE FIX: Get a reference to the 'sections' subcollection from the correct project reference.
        const sectionsCollectionRef = collection(currentProjectRef, 'sections');

        // Use the correct reference to add the new document.
        await addDoc(sectionsCollectionRef, {
            title: 'New Section',
            isCollapsed: false,
            order: newOrder
        });

        console.log("Section added successfully to the correct project.");

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
    if (!currentProjectRef || !sectionId) return console.error("Missing IDs or project reference.");

    const sectionRef = doc(currentProjectRef, `sections/${sectionId}`);
    try {
        await updateDoc(sectionRef, propertiesToUpdate);
    } catch (error) {
        console.error(`Error updating section ${sectionId}:`, error);
    }
}

/**
 * Updates the project document, typically for managing custom columns.
 * @param {object} propertiesToUpdate An object with fields to update on the project.
 */
async function updateProjectInFirebase(propertiesToUpdate) {
    if (!currentProjectRef) {
        return console.error("Cannot update project: Project reference is missing.");
    }
    try {
        await updateDoc(currentProjectRef, propertiesToUpdate);
    } catch (error) {
        console.error("Error updating project properties:", error);
    }
}

/**
 * Displays a non-blocking confirmation modal and returns a promise that resolves
 * to true if "Confirm" is clicked, and false otherwise.
 * @param {string} message The message to display in the dialog.
 * @returns {Promise<boolean>}
 */
function showConfirmationModal(message) {
    return new Promise((resolve) => {
        // Create overlay
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay';
        dialogOverlay.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background-color: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;

        // Set modal content
        dialogOverlay.innerHTML = `
            <div class="dialog-box" style="background: white; border-radius: 8px; width: 400px; overflow: hidden;">
                <div class="dialog-body" style="padding: 2rem; text-align: center; font-size: 1.1rem;">
                    ${message}
                </div>
                <div class="dialog-footer" style="display: flex; justify-content: space-around; padding: 1rem;">
                    <button class="dialog-button" data-action="cancel">Cancel</button>
                    <button class="dialog-button primary" data-action="confirm">Confirm</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialogOverlay);

        const dialogBox = dialogOverlay.querySelector('.dialog-box');

        // Close function
        const close = (result) => {
            if (dialogOverlay.parentNode) {
                document.body.removeChild(dialogOverlay);
                resolve(result);
            }
        };

        // Event delegation for buttons
        dialogOverlay.addEventListener('click', (e) => {
            const action = e.target.getAttribute('data-action');

            if (action === 'cancel') close(false);
            else if (action === 'confirm') close(true);
            else if (!dialogBox.contains(e.target)) close(false); // click outside
        });
    });
}



/**
 * Deletes a custom column and all its corresponding data across all tasks in the project.
 * Uses a more specific query to ensure user has permission to delete.
 * @param {string} columnId The ID of the column to delete.
 */
async function deleteColumnInFirebase(columnId) {
    // --- PERMISSION CHECK: Only the project owner can delete a column ---
    if (!project || project.project_super_admin_uid !== currentUserId) {
        console.error("PERMISSION DENIED: Only the project owner can delete columns.");
        // Optionally show a user-facing error message
        alert("You do not have permission to perform this action.");
        return;
    }

    if (!currentProjectRef) {
        return console.error("Cannot delete column: Project reference is missing.");
    }

    const confirmed = await showConfirmationModal(
        'Are you sure you want to delete this column and all its data? This action cannot be undone.'
    );
    if (!confirmed) {
        return;
    }

    const batch = writeBatch(db);

    // 1. Update the project document using the correct reference
    const newColumnsArray = project.customColumns.filter(col => String(col.id) !== String(columnId));
    batch.update(currentProjectRef, { customColumns: newColumnsArray });

    // 2. Query for ALL tasks within the project to remove the field data
    const tasksQuery = query(
        collectionGroup(db, "tasks"),
        where("projectId", "==", currentProjectId)
    );

    try {
        const tasksSnapshot = await getDocs(tasksQuery);
        console.log(`Found ${tasksSnapshot.size} tasks in project to update.`);

        tasksSnapshot.forEach(taskDoc => {
            batch.update(taskDoc.ref, {
                [`customFields.${columnId}`]: deleteField()
            });
        });

        await batch.commit();
        console.log("Column and its data were deleted successfully from all relevant tasks.");

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

function addNewColumn(config) {
    const newId = Date.now();

    const newColumn = {
        id: newId,
        name: config.name,
        type: config.type,
        isCustom: true,
        currency: config.currency || null,
        aggregation: (config.type === 'Costing' || config.type === 'Numbers') ? 'Sum' : null,
        options: (config.type === 'Type' || config.type === 'Custom') ?
            (config.type === 'Type' ? typeColumnOptions : []) :
            null
    };

    // Step 1: Update customColumns with the new column
    updateProjectInFirebase({
        customColumns: arrayUnion(newColumn)
    });

    // Step 2: Update columnOrder with the new column ID
    const currentOrder = project.columnOrder || [];
    const newOrder = [...currentOrder, String(newId)];

    updateProjectInFirebase({
        columnOrder: newOrder
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
    productIdToFocus = tempId;

    if (section.isCollapsed) {
        section.isCollapsed = false;
    }

    render('us');
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