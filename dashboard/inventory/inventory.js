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
    runTransaction,
    deleteDoc,
    writeBatch,
    serverTimestamp,
    increment,
    deleteField
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
let taskListHeaderEl, drawer, settingsBtn, notificationBtn, notificationBadge, moveProductsBtn, inventoryTabs, imageOverlay, overlayImageSrc, closeOverlay, restrictedOverlay, addSectionClassBtn, headerRight, productListBody, taskListFooter, addProductHeaderBtn, mainContainer, assigneeDropdownTemplate, filterBtn, sortBtn;

// Event Handler References
let headerClickListener, bodyClickListener, settingsBtnListener, bodyFocusOutListener, addProductHeaderBtnListener, windowClickListener, filterBtnListener, sortBtnListener;
let sortableSections;
let backordersBtn, backordersBadge;
let pendingMoves = [];
let backorders = [];
let outgoingMoves = [];

let activeMenuButton = null;
const sortableTasks = [];
let isSortActive = false;
let backorderWatcherInterval = null; // To hold the interval ID
let isCreatingWorkspace = false;

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
let isWatcherBusy = false
let canUserEditProduct = false; // This will be set based on the user's permissions

// --- Debounce/Throttle Mechanism for Rendering ---
let renderTimeout = null;

function debouncedRender(stockType) {
    if (renderTimeout) {
        clearTimeout(renderTimeout);
    }
    renderTimeout = setTimeout(() => {
        render(stockType);
    }, 50); // A 50ms delay to batch rapid updates
}

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

function updateUrlWithQueryParams(inventoryId, stockType) {
    if (!inventoryId || !stockType) return;

    const params = new URLSearchParams(window.location.search);
    params.set('id', inventoryId);
    params.set('tab', stockType);

    const newUrl = `/inventory?${params.toString()}`;

    // Only push a new state if the URL has actually changed
    if (window.location.href !== window.location.origin + newUrl) {
        console.log(`Updating URL to: ${newUrl}`);
        const state = { inventoryId, stockType };
        history.pushState(state, '', newUrl);
    }
}

function updateUrlForAction(action) {
    if (!currentInventoryId || !currentStockType) return;

    const params = new URLSearchParams(window.location.search);
    if (action) {
        params.set('action', action);
    } else {
        params.delete('action');
    }

    const newUrl = `/inventory?${params.toString()}`;
    history.pushState({ inventoryId: currentInventoryId, stockType: currentStockType, action }, '', newUrl);
    console.log(`URL updated for action: ${newUrl}`);
}

function applyActionFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    if (action === 'new') {
        console.log("Found 'new' action in URL, opening Add Product modal.");
        // We use a short timeout to ensure the rest of the UI is ready
        setTimeout(() => {
            openAddProductModal(currentInventoryId, currentStockType, () => { });
        }, 100);
    }
}

async function cloneInventoryWorkspace(sourceId, targetId, subcollectionNames) {
    const sourceDocRef = doc(db, 'InventoryWorkspace', sourceId);
    const targetDocRef = doc(db, 'InventoryWorkspace', targetId);

    // Copy main document
    const sourceSnap = await getDoc(sourceDocRef);
    if (!sourceSnap.exists()) {
        console.error(`❌ Source document InventoryWorkspace/${sourceId} not found`);
        return;
    }

    const sourceData = sourceSnap.data();
    await setDoc(targetDocRef, sourceData, { merge: true });
    console.log(`✅ Top-level data copied from ${sourceId} to ${targetId}`);

    // Copy each known subcollection
    for (const subcolName of subcollectionNames) {
        const sourceSubColRef = collection(sourceDocRef, subcolName);
        const sourceSubColSnap = await getDocs(sourceSubColRef);

        for (const docSnap of sourceSubColSnap.docs) {
            const targetSubDocRef = doc(db, 'InventoryWorkspace', targetId, subcolName, docSnap.id);
            await setDoc(targetSubDocRef, docSnap.data());
        }

        console.log(`📁 Copied subcollection: ${subcolName}`);
    }

    console.log(`🎉 Cloned document ${sourceId} → ${targetId} complete.`);
}

function updateUrlForImageView(productId) {
    if (!currentInventoryId) return;

    const params = new URLSearchParams(window.location.search);
    if (productId) {
        params.set('viewImage', productId);
    } else {
        params.delete('viewImage');
    }

    const newUrl = `/inventory?${params.toString()}`;
    // Use replaceState for image viewing so it doesn't clutter browser history too much
    history.replaceState(history.state, '', newUrl);
}

/**
 * Checks the URL on page load for an image to view and opens the overlay if found.
 */
function applyImageViewFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const imageId = params.get('viewImage');

    // Ensure the overlay is hidden if the param is not present
    if (!imageId) {
        if (imageOverlay && !imageOverlay.classList.contains('hidden')) {
            imageOverlay.classList.add('hidden');
        }
        return;
    }

    // Combine all available products to find the one with the matching ID
    const allProducts = [...dataPhStocks, ...dataUsStocks];
    const product = allProducts.find(p => p.id === imageId);

    if (product && product.imageUrl) {
        overlayImageSrc.src = product.imageUrl;
        imageOverlay.classList.remove('hidden');
    } else if (product) {
        console.warn(`URL requested to view image for product ${imageId}, but it has no image URL.`);
        // If the product exists but has no image, remove the invalid parameter from the URL
        updateUrlForImageView(null);
    }
}

async function attachInventoryListeners(workspaceId, userId) {
    // Detach only the listeners that depend on the workspace ID
    if (activeListeners.workspace) activeListeners.workspace();
    if (activeListeners.usStocks) activeListeners.usStocks();
    if (activeListeners.phStocks) activeListeners.phStocks();

    let inventoryDocRef;
    let hasAccess = false;

    // Path 1: Check the user's own workspace subcollection first (most common case)
    const workspaceDocRef = doc(db, `users/${userId}/myworkspace`, workspaceId);
    const workspaceSnap = await getDoc(workspaceDocRef);

    if (workspaceSnap.exists()) {
        const workspaceData = workspaceSnap.data();
        if (workspaceData.canShowInventory) {
            inventoryDocRef = doc(db, 'InventoryWorkspace', workspaceId);
            hasAccess = true;
            console.log(`✅ Access granted via standard path for workspace: ${workspaceId}`);
        } else {
            console.warn('🚫 Access denied: Inventory is restricted.');
            showRestrictedAccessUI('Restricted Access: You are not allowed to view this inventory.');
            return;
        }
    } else {
        // Path 2: If not in the user's subcollection, check globally (for shared workspaces/admins)
        console.info('🔍 Standard workspace doc not found. Attempting fallback via collectionGroup...');
        const fallbackQuery = query(
            collectionGroup(db, 'myworkspace'),
            where('workspaceId', '==', workspaceId),
            where('canShowInventory', '==', true)
        );
        const fallbackSnaps = await getDocs(fallbackQuery);

        if (!fallbackSnaps.empty) {
            inventoryDocRef = doc(db, 'InventoryWorkspace', workspaceId);
            hasAccess = true;
            console.log(`✅ Access granted via fallback path for workspace: ${workspaceId}`);
        }
    }

    if (hasAccess && inventoryDocRef) {
        currentInventoryId = workspaceId;
        inventoryPath = `InventoryWorkspace/${workspaceId}`;

        updateUrlWithQueryParams(currentInventoryId, currentStockType);
        // Attach the final, performant listeners in parallel
        const usStocksRef = collection(inventoryDocRef, 'US-Stocks-meta');
        const phStocksRef = collection(inventoryDocRef, 'PH-Stocks-meta');

        activeListeners.usStocks = onSnapshot(usStocksRef, (usSnapshot) => {
            dataUsStocks = usSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log('%c🇺🇸 US Stocks Updated:', 'color: #00bcd4;', dataUsStocks.length, 'items');
            debouncedRender(currentStockType);
            applyImageViewFromUrl();
        }, (error) => console.error("❌ US Stocks listener error:", error));

        activeListeners.phStocks = onSnapshot(phStocksRef, (phSnapshot) => {
            dataPhStocks = phSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log('%c🇵🇭 PH Stocks Updated:', 'color: #ff9800;', dataPhStocks.length, 'items');
            debouncedRender(currentStockType);
            applyImageViewFromUrl();
        }, (error) => console.error("❌ PH Stocks listener error:", error));

        attachDynamicListeners(currentStockType);
        render(currentStockType); // Perform the initial render
    } else {
        console.error(`❌ No valid path found to inventory for workspace: ${workspaceId}`);
        showRestrictedAccessUI('Workspace does not exist or you have no access.');
    }
}

// 🚀 **REFACTORED AND OPTIMIZED** 🚀
// This is the main entry point, now much cleaner and more efficient.
function attachRealtimeListeners(userId) {
    detachAllListeners();
    currentUserId = userId;
    let lastKnownWorkspaceId = null;

    console.groupCollapsed(`%c🔗 Attaching Main Listener for User: ${userId}`, 'color: #007bff; font-weight: bold;');

    const userDocRef = doc(db, 'users', userId);

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
            detachAllListeners();
            return;
        }

        // --- Key Optimization ---
        // Only re-run the expensive logic if the user's selected workspace has actually changed.
        if (selectedWorkspaceId !== lastKnownWorkspaceId) {
            console.log(`%c🔄 Workspace changed from ${lastKnownWorkspaceId} to ${selectedWorkspaceId}. Re-attaching inventory listeners...`, 'color: #6f42c1; font-weight: bold;');
            lastKnownWorkspaceId = selectedWorkspaceId;
            currentWorkspaceId = selectedWorkspaceId;
            // Call the new, cleaner function to handle the rest of the setup.
            await attachInventoryListeners(selectedWorkspaceId, userId);
        }
    }, (error) => {
        console.error('%c❌ Error listening to user document.', 'color: #dc3545; font-weight: bold;', error);
        showRestrictedAccessUI('An error occurred while loading your profile.');
    });

    console.groupEnd();
}

function attachDynamicListeners(stockType) {
    // Detach existing listeners to prevent duplicates
    if (activeListeners.pendingMoves) activeListeners.pendingMoves();
    if (activeListeners.outgoingMoves) activeListeners.outgoingMoves(); // Add this
    if (activeListeners.backorders) activeListeners.backorders();

    if (!currentInventoryId) return;

    // --- Listener 1: INCOMING Moves (Requests YOU need to approve) ---
    // This query remains the same.
    const pendingMovesQuery = query(
        collection(db, `InventoryWorkspace/${currentInventoryId}/PendingMoves`),
        where('to', '==', stockType)
    );
    activeListeners.pendingMoves = onSnapshot(pendingMovesQuery, (snapshot) => {
        pendingMoves = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`🚚 Incoming moves for ${stockType.toUpperCase()} updated:`, pendingMoves);
        refreshNotificationsUI(); // Helper function to refresh UI
        updateNotificationBadge();
    });

    // --- ✅ Listener 2: OUTGOING Moves (Status of requests YOU sent) ---
    // This is the new query you need to add.
    const outgoingMovesQuery = query(
        collection(db, `InventoryWorkspace/${currentInventoryId}/PendingMoves`),
        where('from', '==', stockType) // It checks the 'from' field instead of 'to'
    );
    activeListeners.outgoingMoves = onSnapshot(outgoingMovesQuery, (snapshot) => {
        outgoingMoves = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`🛫 Outgoing moves from ${stockType.toUpperCase()} updated:`, outgoingMoves);
        refreshNotificationsUI(); // Also refresh UI on this update
    });


    // --- Listener 3: Backorders ---
    // This query remains the same.
    const backordersQuery = query(
        collection(db, `InventoryWorkspace/${currentInventoryId}/Backorders`),
        where('from', '==', stockType)
    );
    activeListeners.backorders = onSnapshot(backordersQuery, (snapshot) => {
        backorders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`📦 Backorders from ${stockType.toUpperCase()} updated:`, backorders);
        updateBackordersBadge();
    });

    // Helper to avoid code duplication
    function refreshNotificationsUI() {
        const notificationsList = document.getElementById('notifications-list-container');
        if (notificationsList) {
            notificationsList.innerHTML = generateNotificationsListHTML();
            reattachNotificationListeners();
        }
    }

    // --- Badge Update Functions ---
    function updateNotificationBadge() {
        if (notificationBadge) {
            const actionableMovesCount = pendingMoves.filter(move =>
                move.status === 'pending' || move.status === 'partial'
            ).length;

            // Use the new count to update the badge
            notificationBadge.textContent = actionableMovesCount;
            notificationBadge.classList.toggle('hidden', actionableMovesCount === 0);
        }
    }

    function updateBackordersBadge() {
        if (backordersBadge) {
            backordersBadge.textContent = backorders.length;
            backordersBadge.classList.toggle('hidden', backorders.length === 0);
        }
    }
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
    imageOverlay = document.getElementById('image-overlay');
    overlayImageSrc = document.getElementById('overlay-image-src');
    notificationBtn = document.getElementById('notification-btn');
    notificationBadge = document.getElementById('notification-badge');
    backordersBtn = document.getElementById('backorders-btn');
    backordersBadge = document.getElementById('backorders-badge')
    moveProductsBtn = document.getElementById('move-products-btn');
    closeOverlay = document.getElementById('close-overlay');
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
    let popstateListener = null; // Keep track of the listener

    // Initial view setup
    initializeListView(params);

    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log(`User ${user.uid} signed in.`);
            currentUserId = user.uid;

            const urlParams = new URLSearchParams(window.location.search);
            const urlInventoryId = urlParams.get('id');
            const urlStockType = urlParams.get('tab');

            if (window.location.pathname === '/inventory' && urlInventoryId && urlStockType) {
                // ... (existing URL logic for id and tab)
                attachInventoryListeners(urlInventoryId, user.uid).then(() => {
                    applyActionFromUrl();
                    applyImageViewFromUrl();
                });
            } else {
                attachRealtimeListeners(user.uid);
            }
            startBackorderFulfillmentWatcher();

            // ✅ ADD POPSTATE LISTENER FOR BACK/FORWARD NAVIGATION
            popstateListener = (event) => {
                console.log('Popstate event detected. Restoring state:', event.state);
                if (event.state && event.state.inventoryId) {
                    // Re-render the main view
                    attachInventoryListeners(event.state.inventoryId, currentUserId);
                    // Apply any actions like opening the modal
                    applyActionFromUrl();
                }
            };
            window.addEventListener('popstate', popstateListener);

        } else {
            console.log("User signed out. Detaching listeners.");
            detachAllListeners();
            stopBackorderFulfillmentWatcher();
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
        stopBackorderFulfillmentWatcher();
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

        if (popstateListener) {
            window.removeEventListener('popstate', popstateListener);
        }
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

function toggleLoadingIndicator(show) {
    if (!productListBody) return;

    if (show) {
        productListBody.innerHTML = `
            <div class="loading-overlay-container">
                <div class="loading-spinner-circular"></div>
            </div>
        `;
    } else {
        // Clearing is handled by the render function, but this can be a fallback.
        productListBody.innerHTML = '';
    }
}

async function setupEventListeners() {
    backordersBtn.addEventListener('click', openBackordersModal);

    notificationBtn.addEventListener('click', openNotificationsModal);

    moveProductsBtn.addEventListener('click', openMoveProductsModal);

    closeOverlay.addEventListener('click', () => {
        imageOverlay.classList.add('hidden');
        // ✅ Remove image parameter from URL when closing
        updateUrlForImageView(null);
    });

    imageOverlay.addEventListener('click', (e) => {
        if (e.target === imageOverlay) {
            imageOverlay.classList.add('hidden');
            // ✅ Remove image parameter from URL when closing
            updateUrlForImageView(null);
        }
    });

    inventoryTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            // Do nothing if the clicked tab is already active
            if (tab.classList.contains('active')) {
                return;
            }

            // 1. Immediately update the active tab UI and show the spinner
            inventoryTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            toggleLoadingIndicator(true);

            // 2. Defer the heavy data loading until the next browser paint cycle.
            // This guarantees the spinner will be visible before the new list renders.
            setTimeout(() => {
                currentStockType = index === 0 ? 'ph' : 'us';
                updateUrlWithQueryParams(currentInventoryId, currentStockType);

                // Update subtitle
                const subtitle = document.getElementById('inventory-subtitle');
                subtitle.textContent = currentStockType.toUpperCase() + ' Stocks';

                // Render relevant stock data (this will replace the spinner)
                attachDynamicListeners(currentStockType);
                render(currentStockType);
            }, 0); // Using 0ms pushes this task to the end of the execution queue.
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
        // This function is now passed to the modal
        const onModalOpen = () => updateUrlForAction('new');

        // This function will be called by the modal when it closes
        const onModalClose = () => updateUrlForAction(null);

        openAddProductModal(
            currentInventoryId,
            currentStockType,
            onModalOpen,
            onModalClose
        );
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

/**
 * Opens the modal to display pending backorders that need to be fulfilled.
 */
function openBackordersModal() {
    const modalHTML = `
        <div class="move-products-overlay visible" id="backorders-overlay">
            <div class="move-products-modal">
                <div class="move-products-header">
                    <h2>Pending Backorders</h2>
                    <button class="close-modal-btn">&times;</button>
                </div>
                <div class="move-products-body">
                    <div id="backorders-list-container">
                        ${generateBackordersListHTML()}
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.getElementById('backorders-overlay');
    overlay.querySelector('.close-modal-btn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => (e.target === overlay) && overlay.remove());

    // Add event listeners for fulfill buttons
    overlay.querySelectorAll('[data-action="fulfill"]').forEach(btn =>
        btn.addEventListener('click', () => handleFulfillBackorder(btn.dataset.backorderId))
    );
}

/**
 * Generates the HTML for the list of backorders.
 */
function generateBackordersListHTML() {
    if (backorders.length === 0) {
        return `
            <div class="empty-notifications-message">
                <span class="material-icons empty-icon">inventory</span>
                <h2>No Pending Backorders</h2>
                <p>All orders from this location are fulfilled.</p>
            </div>
        `;
    }

    return backorders.map(bo => {
        const productsHTML = bo.products.map(p => `<li>${p.name} (SKU: ${p.sku})</li>`).join('');
        const quantitiesHTML = Object.entries(bo.quantities)
            .map(([size, count]) => `<li><strong>${size === 'countStocks' ? 'Stocks' : size.toUpperCase()}:</strong> ${count}</li>`)
            .join('');

        return `
            <div class="notification-item" id="backorder-${bo.id}">
                <div class="notification-item-header">
                    Backorder to <strong>${bo.to.toUpperCase()}</strong> created on ${new Date(bo.createdAt?.toDate()).toLocaleDateString()}
                </div>
                <div class="notification-item-body">
                    <p><strong>Products:</strong></p>
                    <ul>${productsHTML}</ul>
                    <p class="mt-4"><strong>Remaining Quantities Needed:</strong></p>
                    <ul>${quantitiesHTML}</ul>
                    <div class="notification-actions">
                        <button class="modal-btn primary" data-action="fulfill" data-backorder-id="${bo.id}">Fulfill Backorder</button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

/**
 * Fulfills a backorder by sending available stock.
 */
async function handleFulfillBackorder(backorderId) {
    const backorder = backorders.find(bo => bo.id === backorderId);
    if (!backorder) return;

    const itemEl = document.getElementById(`backorder-${backorderId}`);
    itemEl.querySelector('button').disabled = true;

    const sourceCol = backorder.from === 'ph' ? 'PH-Stocks-meta' : 'US-Stocks-meta';
    const targetCol = backorder.to === 'ph' ? 'PH-Stocks-meta' : 'US-Stocks-meta';
    const backorderRef = doc(db, `InventoryWorkspace/${currentInventoryId}/Backorders`, backorderId);

    try {
        let stockWasMoved = false;

        await runTransaction(db, async (transaction) => {
            console.log(`🚀 Starting transaction for backorder ID: ${backorderId}`);
            const backorderDoc = await transaction.get(backorderRef);
            if (!backorderDoc.exists()) {
                console.warn(`⚠️ Backorder ${backorderId} already fulfilled or does not exist.`);
                return;
            }
            const currentBackorderData = backorderDoc.data();
            console.log("📦 Current backorder data:", currentBackorderData);

            const refsToRead = currentBackorderData.products.flatMap(p => [
                doc(db, `InventoryWorkspace/${currentInventoryId}/${sourceCol}`, p.productId),
                doc(db, `InventoryWorkspace/${currentInventoryId}/${targetCol}`, p.productId)
            ]);
            const allDocs = await Promise.all(refsToRead.map(ref => transaction.get(ref)));
            const docsMap = new Map(allDocs.map(snapshot => [snapshot.ref.path, snapshot]));

            const remainingQuantities = { ...currentBackorderData.quantities };

            for (const field in currentBackorderData.quantities) {
                let amountToFulfill = currentBackorderData.quantities[field];
                if (amountToFulfill <= 0) continue;
                console.log(`🧮 Fulfilling field "${field}" for amount: ${amountToFulfill}`);

                for (const productInfo of currentBackorderData.products) {
                    if (amountToFulfill <= 0) break;

                    const sourceRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${sourceCol}`, productInfo.productId);
                    const sourceDoc = docsMap.get(sourceRef.path);
                    const rawStock = sourceDoc?.exists() ? sourceDoc.data()[field] : 0;

                    let currentStock = typeof rawStock === 'string' ? parseFloat(rawStock) : rawStock;
                    currentStock = isNaN(currentStock) ? 0 : currentStock;

                    console.log(`🟡 FIELD: ${field}, Product: ${productInfo.productId}`);
                    console.log(`   🔢 Raw stock:`, rawStock, `| Parsed:`, currentStock);

                    if (currentStock > 0) {
                        const deduction = Math.min(amountToFulfill, currentStock);
                        stockWasMoved = true;

                        console.log(`➡️ Deducting ${deduction} from ${sourceCol}/${productInfo.productId} for field ${field}`);

                        if (sourceDoc.exists() && sourceDoc.data()[field] === undefined) {
                            console.warn(`⚠️ Field "${field}" is undefined in source. Setting to 0.`);
                            transaction.update(sourceRef, {
                                [field]: 0
                            });
                        } else if (typeof rawStock === 'string') {
                            console.warn(`⚠️ Field "${field}" in source is a string. Forcing number correction.`);
                            transaction.update(sourceRef, {
                                [field]: currentStock
                            });
                        }

                        transaction.update(sourceRef, {
                            [field]: increment(-deduction)
                        });

                        const targetRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${targetCol}`, productInfo.productId);
                        const targetDoc = docsMap.get(targetRef.path);

                        if (targetDoc && targetDoc.exists()) {
                            console.log(`✅ Target doc exists. Incrementing ${field} by ${deduction} in ${targetCol}/${productInfo.productId}`);
                            transaction.update(targetRef, {
                                [field]: increment(deduction)
                            });
                        } else {
                            console.log(`🆕 Target doc missing. Creating with new data.`);
                            const originalProductData = (backorder.from === 'ph' ? dataPhStocks : dataUsStocks).find(p => p.id === productInfo.productId);
                            const newProductData = { ...originalProductData };

                            const existingNewStock = newProductData[field] || 0;
                            newProductData[field] = existingNewStock + deduction;

                            transaction.set(targetRef, newProductData);
                            docsMap.set(targetRef.path, {
                                exists: () => true,
                                data: () => newProductData
                            });
                            console.log(`✅ New target doc created with field "${field}":`, newProductData[field]);
                        }

                        amountToFulfill -= deduction;
                        console.log(`📉 Remaining to fulfill for field "${field}":`, amountToFulfill);
                    } else {
                        console.log(`🚫 No stock available for field "${field}" in ${sourceCol}/${productInfo.productId}`);
                    }
                }

                remainingQuantities[field] = amountToFulfill;
            }

            const totalRemaining = Object.values(remainingQuantities).reduce((a, b) => a + b, 0);
            if (totalRemaining <= 0) {
                console.log(`✅ All quantities fulfilled. Deleting backorder: ${backorderId}`);
                const originalRequestId = currentBackorderData.originalRequestId;
                if (originalRequestId) {
                    // Create a reference to the original document in PendingMoves
                    const originalMoveRef = doc(db, `InventoryWorkspace/${currentInventoryId}/PendingMoves`, originalRequestId);

                    // Update its status to 'completed' within the same transaction
                    transaction.update(originalMoveRef, { status: 'completed' });
                    console.log(`🎉 Marking original move request ${originalRequestId} as completed.`);
                }
                transaction.delete(backorderRef);
            } else {
                console.log(`⏳ Partial fulfillment. Updating backorder with remaining quantities:`, remainingQuantities);
                transaction.update(backorderRef, { quantities: remainingQuantities });
            }
        });

        if (stockWasMoved) {
            alert("✅ Backorder fulfilled with available stock!");
        } else {
            alert("⚠️ No stock available to fulfill this backorder. The request remains open.");
        }

        document.getElementById('backorders-overlay')?.remove();
    } catch (error) {
        console.error("❌ Error fulfilling backorder:", error);
        alert(error.message);
        itemEl.querySelector('button').disabled = false;
    }
}

async function executeAutomaticBackorderFulfillment(backorder) {
    if (!backorder || !backorder.id) {
        console.log('Watcher: Invalid backorder object provided. Skipping.');
        return;
    }

    const backorderRef = doc(db, `InventoryWorkspace/${currentInventoryId}/Backorders`, backorder.id);
    const sourceCol = backorder.from === 'ph' ? 'PH-Stocks-meta' : 'US-Stocks-meta';
    const targetCol = backorder.to === 'ph' ? 'PH-Stocks-meta' : 'US-Stocks-meta';
    const backorderId = backorder.id;
    try {
        let stockWasMoved = false;

        await runTransaction(db, async (transaction) => {
            console.log(`🚀 Starting transaction for backorder ID: ${backorderId}`);
            const backorderDoc = await transaction.get(backorderRef);
            if (!backorderDoc.exists()) {
                console.warn(`⚠️ Backorder ${backorderId} already fulfilled or does not exist.`);
                return;
            }
            const currentBackorderData = backorderDoc.data();
            console.log("📦 Current backorder data:", currentBackorderData);

            const refsToRead = currentBackorderData.products.flatMap(p => [
                doc(db, `InventoryWorkspace/${currentInventoryId}/${sourceCol}`, p.productId),
                doc(db, `InventoryWorkspace/${currentInventoryId}/${targetCol}`, p.productId)
            ]);
            const allDocs = await Promise.all(refsToRead.map(ref => transaction.get(ref)));
            const docsMap = new Map(allDocs.map(snapshot => [snapshot.ref.path, snapshot]));

            const remainingQuantities = { ...currentBackorderData.quantities };

            for (const field in currentBackorderData.quantities) {
                let amountToFulfill = currentBackorderData.quantities[field];
                if (amountToFulfill <= 0) continue;
                console.log(`🧮 Fulfilling field "${field}" for amount: ${amountToFulfill}`);

                for (const productInfo of currentBackorderData.products) {
                    if (amountToFulfill <= 0) break;

                    const sourceRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${sourceCol}`, productInfo.productId);
                    const sourceDoc = docsMap.get(sourceRef.path);
                    const rawStock = sourceDoc?.exists() ? sourceDoc.data()[field] : 0;

                    let currentStock = typeof rawStock === 'string' ? parseFloat(rawStock) : rawStock;
                    currentStock = isNaN(currentStock) ? 0 : currentStock;

                    console.log(`🟡 FIELD: ${field}, Product: ${productInfo.productId}`);
                    console.log(`   🔢 Raw stock:`, rawStock, `| Parsed:`, currentStock);

                    if (currentStock > 0) {
                        const deduction = Math.min(amountToFulfill, currentStock);
                        stockWasMoved = true;

                        console.log(`➡️ Deducting ${deduction} from ${sourceCol}/${productInfo.productId} for field ${field}`);

                        if (sourceDoc.exists() && sourceDoc.data()[field] === undefined) {
                            console.warn(`⚠️ Field "${field}" is undefined in source. Setting to 0.`);
                            transaction.update(sourceRef, {
                                [field]: 0
                            });
                        } else if (typeof rawStock === 'string') {
                            console.warn(`⚠️ Field "${field}" in source is a string. Forcing number correction.`);
                            transaction.update(sourceRef, {
                                [field]: currentStock
                            });
                        }

                        transaction.update(sourceRef, {
                            [field]: increment(-deduction)
                        });

                        const targetRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${targetCol}`, productInfo.productId);
                        const targetDoc = docsMap.get(targetRef.path);

                        if (targetDoc && targetDoc.exists()) {
                            console.log(`✅ Target doc exists. Incrementing ${field} by ${deduction} in ${targetCol}/${productInfo.productId}`);
                            transaction.update(targetRef, {
                                [field]: increment(deduction)
                            });
                        } else {
                            console.log(`🆕 Target doc missing. Creating with new data.`);
                            const originalProductData = (backorder.from === 'ph' ? dataPhStocks : dataUsStocks).find(p => p.id === productInfo.productId);
                            const newProductData = { ...originalProductData };

                            const existingNewStock = newProductData[field] || 0;
                            newProductData[field] = existingNewStock + deduction;

                            transaction.set(targetRef, newProductData);
                            docsMap.set(targetRef.path, {
                                exists: () => true,
                                data: () => newProductData
                            });
                            console.log(`✅ New target doc created with field "${field}":`, newProductData[field]);
                        }

                        amountToFulfill -= deduction;
                        console.log(`📉 Remaining to fulfill for field "${field}":`, amountToFulfill);
                    } else {
                        console.log(`🚫 No stock available for field "${field}" in ${sourceCol}/${productInfo.productId}`);
                    }
                }

                remainingQuantities[field] = amountToFulfill;
            }

            const totalRemaining = Object.values(remainingQuantities).reduce((a, b) => a + b, 0);
            if (totalRemaining <= 0) {
                console.log(`✅ Watcher: All quantities fulfilled. Deleting backorder: ${backorder.id}`);
                const originalRequestId = currentBackorderData.originalRequestId;
                if (originalRequestId) {
                    // Create a reference to the original document in PendingMoves
                    const originalMoveRef = doc(db, `InventoryWorkspace/${currentInventoryId}/PendingMoves`, originalRequestId);

                    // Update its status to 'completed' as part of the transaction
                    transaction.update(originalMoveRef, { status: 'completed' });
                    console.log(`🎉 Watcher: Marking original move request ${originalRequestId} as completed.`);
                }
                transaction.delete(backorderRef);
            } else {
                console.log(`⏳ Watcher: Partial fulfillment. Remaining:`, remainingQuantities);
                transaction.update(backorderRef, { quantities: remainingQuantities });
            }
        });

        if (stockWasMoved) {
            console.log(`✅ Watcher: Backorder ${backorder.id} processed successfully.`);
        } else {
            console.log(`ℹ️ Watcher: No available stock to fulfill backorder ${backorder.id} at this time.`);
        }
    } catch (error) {
        console.error(`❌ Watcher: Error processing backorder ${backorder.id}:`, error);
    }
}

function startBackorderFulfillmentWatcher() {
    if (backorderWatcherInterval) {
        console.log('Backorder watcher is already running.');
        return;
    }

    // Set a more reasonable interval (e.g., 20 seconds as originally commented)
    // to prevent Firestore contention. 300ms is far too aggressive.
    const WATCHER_INTERVAL_MS = 20000;

    console.log(`🚀 Starting backorder fulfillment watcher (${WATCHER_INTERVAL_MS / 1000}-second interval)...`);

    backorderWatcherInterval = setInterval(async () => {
        // 1. If the previous run is still busy, skip this cycle.
        if (isWatcherBusy) {
            console.log('Watchdog: Previous cycle still running. Skipping.');
            return;
        }

        // 2. Only run if there are actual backorders detected by the live listener.
        if (backorders.length === 0) {
            // This is a quiet exit, no need to log every 20 seconds.
            return;
        }

        // 3. Check for necessary context.
        if (!currentInventoryId || !currentUserId) {
            console.warn("Watchdog: Missing current inventory or user ID. Skipping run.");
            return;
        }


        console.log(`Watchdog: Found ${backorders.length} backorder(s) to check.`);
        isWatcherBusy = true; // Set the flag to true before starting work

        try {
            // Process a copy of the array so modifications don't affect the loop.
            const backordersToCheck = [...backorders];
            for (const backorder of backordersToCheck) {
                await executeAutomaticBackorderFulfillment(backorder);
            }
        } catch (error) {
            console.error(`Unhandled error in watcher main loop:`, error);
        } finally {
            isWatcherBusy = false; // ✅ Always reset the flag when done, even if errors occur.
        }

    }, WATCHER_INTERVAL_MS);
}

function stopBackorderFulfillmentWatcher() {
    if (backorderWatcherInterval) {
        clearInterval(backorderWatcherInterval);
        backorderWatcherInterval = null;
        isWatcherBusy = false; // Also reset the busy flag
        console.log('🛑 Stopped backorder fulfillment watcher.');
    }
}

/**
 * Opens a powerful modal to move specific quantities of multiple products,
 * featuring an advanced search filter dropdown.
 */
function openMoveProductsModal() {
    // Determine source and target locations
    const sourceStockType = currentStockType;
    const targetStockType = sourceStockType === 'ph' ? 'us' : 'ph';
    const sourceCollectionName = sourceStockType === 'ph' ? 'PH-Stocks-meta' : 'US-Stocks-meta';
    const targetCollectionName = targetStockType === 'ph' ? 'PH-Stocks-meta' : 'US-Stocks-meta';

    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const rawData = sourceStockType === 'ph' ? dataPhStocks : dataUsStocks;
    const sourceData = rawData.filter(doc => uuidRegex.test(doc.id));


    const modalHTML = `
        <div class="move-products-overlay visible" id="move-products-overlay">
            <div class="move-products-modal">
                <div class="move-products-header">
                    <h2>Transfer</h2>
                    <button class="close-modal-btn">&times;</button>
                </div>
                <div class="move-products-body">
                    <p class="mb-4 pl-4 text-sm text-gray-600">
    Select products to move from <strong>${sourceStockType.toUpperCase()} Stocks</strong> to <strong>${targetStockType.toUpperCase()} Stocks</strong>.
</p>
                    <div class="search-controls">
                        <select id="search-field-select">
                            <option value="all">Search All</option>
                            <option value="name">Product Name</option>
                            <option value="productSku">Product SKU</option>
                            <option value="supplierName">Supplier Name</option>
                            <optgroup label="Sizes (Has Stock)">
                                <option value="s">Size S</option>
                                <option value="m">Size M</option>
                                <option value="l">Size L</option>
                                <option value="xl">Size XL</option>
                                <option value="xxl">Size XXL</option>
                                <option value="others">Others</option>
                            </optgroup>
                        </select>
                        <input type="text" id="product-search-input" placeholder="Filter products...">
                    </div>
                    <div id="product-list-container"></div>
                </div>
                <div class="move-products-footer" id="move-products-footer">
                    </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.getElementById('move-products-overlay');
    const searchInput = document.getElementById('product-search-input');
    const searchFieldSelect = document.getElementById('search-field-select');
    const productListContainer = document.getElementById('product-list-container');
    const footerContainer = document.getElementById('move-products-footer');

    let selectedProductIds = new Set();
    // MODIFIED: Added 'countStocks' to the array to be processed everywhere.
    const stockAndSizeFields = ['s', 'm', 'l', 'xl', 'xxl', 'others'];

    // --- Event Listeners ---
    searchInput.addEventListener('input', handleFilter);
    searchFieldSelect.addEventListener('change', handleFilter);
    overlay.querySelector('.close-modal-btn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => (e.target === overlay) && overlay.remove());

    function handleFilter() {
        const searchTerm = searchInput.value.toLowerCase();
        const searchField = searchFieldSelect.value;

        const filteredProducts = sourceData.filter(p => {
            if (!searchTerm) {
                return true; // If search bar is empty, show all products
            }

            switch (searchField) {
                case 'all':
                    // Search across multiple relevant text fields
                    return (p.name && p.name.toLowerCase().includes(searchTerm)) ||
                        (p.productSku && String(p.productSku).toLowerCase().includes(searchTerm)) ||
                        (p.supplierName && p.supplierName.toLowerCase().includes(searchTerm));

                case 's':
                case 'm':
                case 'l':
                case 'xl':
                case 'xxl':
                case 'others':
                    // When filtering by size, the search term must be a number
                    const stock = parseInt(p[searchField], 10) || 0;
                    const searchNum = parseInt(searchTerm, 10);

                    // Only show results if the search term is a valid number
                    if (isNaN(searchNum)) {
                        return false;
                    }
                    return stock >= searchNum;

                default:
                    // This handles specific text fields like 'name', 'productSku', etc.
                    return p[searchField] && String(p[searchField]).toLowerCase().includes(searchTerm);
            }
        });

        renderProductList(filteredProducts);
    }

    function renderProductList(products) {
        if (products.length === 0) {
            productListContainer.innerHTML = `<p class="p-4 text-center text-gray-500">No products found for your filter.</p>`;
            return;
        }

        const productRowsHTML = products.map(p => {
            const isChecked = selectedProductIds.has(p.id) ? 'checked' : '';

            // MODIFIED: Added a filter to exclude 'countstocks' from being displayed.
            const stocksHTML = stockAndSizeFields
                .filter(field => field.toLowerCase() !== 'countstocks')
                .map(field => {
                    const label = field.toUpperCase();
                    const numericValue = parseInt(p[field], 10) || 0;

                    // --- COLOR LOGIC ---
                    let colorClass = 'text-slate-700'; // Default color
                    if (!isNaN(numericValue)) {
                        if (numericValue >= 0 && numericValue <= 5) {
                            colorClass = 'text-red-600 font-bold'; // Red and bold for 0-5
                        } else if (numericValue < 10) {
                            colorClass = 'text-yellow-600'; // Yellow for 6-9
                        } else {
                            colorClass = 'text-green-600'; // Green for 10+
                        }
                    }

                    return `
                    <div class="size-display">
                        <span class="size-label">${label}</span>
                        <span class="size-value ${colorClass}">${numericValue}</span>
                    </div>`;
                }).join('');

            return `
            <div class="product-select-item" data-product-id="${p.id}">
                <div class="product-info">
                    <input type="checkbox" data-product-id="${p.id}" ${isChecked}>
                    <img src="${p.imageUrl || '/img/default-product.png'}" alt="Product">
                    <div class="product-details">
                        <div class="name">${p.name}</div>
                        <div class="sku">SKU: ${p.productSku || 'N/A'}</div>
                    </div>
                </div>
                <div class="product-stock-details">
                    ${stocksHTML}
                </div>
            </div>`;
        }).join('');

        productListContainer.innerHTML = productRowsHTML;

        productListContainer.querySelectorAll('.product-select-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const checkbox = item.querySelector('input[type="checkbox"]');
                if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
                handleProductSelection(checkbox.dataset.productId, checkbox.checked);
            });
        });
    }


    function handleProductSelection(productId, isChecked) {
        if (isChecked) {
            selectedProductIds.add(productId);
        } else {
            selectedProductIds.delete(productId);
        }
        renderFooter();
    }

    function renderFooter() {
        if (selectedProductIds.size === 0) {
            footerContainer.innerHTML = `<span class="text-sm text-gray-500">Select one or more products to move.</span><button class="modal-btn secondary close-modal-btn">Cancel</button>`;
            footerContainer.querySelector('.close-modal-btn').addEventListener('click', () => overlay.remove());
            return;
        }

        // --- Build an entry for EACH selected product ---
        const productEntriesHTML = Array.from(selectedProductIds).map(id => {
            const product = sourceData.find(p => p.id === id);
            if (!product) return '';

            // Create unique size inputs for this specific product
            const stockInputsHTML = stockAndSizeFields.map(field => `
                <div class="size-input-group">
                    <label for="size-${field}-${product.id}">${field.toUpperCase()}</label>
                    <input type="number" id="size-${field}-${product.id}" min="0" placeholder="${product[field] || 0}">
                </div>`).join('');

            return `
                <div class="product-entry-item">
                    <div class="product-entry-info">
                        <img src="${product.imageUrl || '/img/default-product.png'}" alt="${product.name}">
                        <span class="product-entry-name">${product.name}</span>
                    </div>
                    <div class="product-entry-inputs">
                        ${stockInputsHTML}
                    </div>
                    <div class="product-entry-note">
                         <textarea id="note-input-${product.id}" rows="1" placeholder="Add a note for this item..."></textarea>
                    </div>
                </div>
            `;
        }).join('');

        // --- Final Footer HTML ---
        footerContainer.innerHTML = `
        <div class="footer-details vertical-layout">
            <div class="footer-box-name-input">
                <label for="box-name-input">Reference Name</label>
                <input type="text" id="box-name-input" placeholder="Add a reference name here">
            </div>
            <div class="product-entries-list">
                ${productEntriesHTML}
            </div>
        </div>
        <div class="footer-actions">
            <button class="modal-btn secondary close-modal-btn">Cancel</button>
            <button class="modal-btn primary" id="confirm-move-btn">Submit Request</button>
        </div>`;

        footerContainer.querySelector('.close-modal-btn').addEventListener('click', () => overlay.remove());
        footerContainer.querySelector('#confirm-move-btn').addEventListener('click', executeMove);
    }

    async function executeMove() {
        const confirmBtn = footerContainer.querySelector('#confirm-move-btn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Submitting...';

        const boxName = document.getElementById('box-name-input')?.value.trim() || '';
        let totalToMove = 0;

        const productsToMove = Array.from(selectedProductIds).map(id => {
            const product = sourceData.find(p => p.id === id);
            const noteInput = document.getElementById(`note-input-${id}`);
            const note = noteInput ? noteInput.value.trim() : '';

            const quantities = {};
            for (const field of stockAndSizeFields) {
                const input = document.getElementById(`size-${field}-${id}`);
                const value = parseInt(input.value, 10) || 0;
                if (value > 0) {
                    quantities[field] = value;
                    totalToMove += value;
                }
            }

            const productData = {
                productId: id,
                name: product.name,
                sku: product.productSku,
                quantities: quantities
            };
            if (note) {
                productData.note = note;
            }
            return productData;
        }).filter(p => Object.keys(p.quantities).length > 0); // Only include products with quantities

        if (totalToMove === 0) {
            alert("Please enter a quantity for at least one product size.");
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Submit Request';
            return;
        }

        const requestData = {
            requestedBy: auth.currentUser.uid,
            createdAt: serverTimestamp(),
            status: 'pending',
            from: sourceStockType,
            to: targetStockType,
            products: productsToMove
        };

        if (boxName) {
            requestData.boxName = boxName;
        }

        try {
            const pendingMovesRef = collection(db, `InventoryWorkspace/${currentInventoryId}/PendingMoves`);
            await addDoc(pendingMovesRef, requestData);
            alert('Move request submitted successfully!');
            overlay.remove();
        } catch (error) {
            console.error("Error submitting move request:", error);
            alert("Failed to submit move request. Please try again.");
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Submit Request';
        }
    }

    // --- Initial Render ---
    renderProductList(sourceData);
    renderFooter();
}

/**
 * Opens the notifications modal with a new tabbed interface to filter requests.
 */
function openNotificationsModal() {
    const modalHTML = `
<div class="move-products-overlay visible" id="notifications-overlay">
<div class="move-products-modal">
<div class="modal-header-custom">
<h2>Transfer</h2>
<button class="close-modal-btn">&times;</button>
</div>
<div class="move-products-body">
<div class="notification-tabs">
<div class="notification-tab active" data-tab-filter="all">All</div>
<div class="notification-tab" data-tab-filter="incoming">Incoming</div>
<div class="notification-tab" data-tab-filter="on-transit">On Transit</div>
<div class="notification-tab" data-tab-filter="partial">Partial</div>
<div class="notification-tab" data-tab-filter="completed">Completed</div>
<div class="notification-tab-add" title="Add new tab">
<span class="material-icons">add</span>
</div>
</div>
<div id="notifications-list-container">
</div>
</div>
</div>
</div>
`;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.getElementById('notifications-overlay');
    const contentContainer = document.getElementById('notifications-list-container');
    const tabs = overlay.querySelectorAll('.notification-tab');

    // Function to render content based on the active tab
    const renderTabContent = (filter) => {
        contentContainer.innerHTML = generateNotificationsListHTML(filter);
        reattachNotificationListeners();
    };

    // Add click event listeners to tabs
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active state
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Render content for the selected tab
            const filter = tab.dataset.tabFilter;
            renderTabContent(filter);
        });
    });

    overlay.querySelector('.close-modal-btn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => (e.target === overlay) && overlay.remove());

    // Initial render for the default "All" tab
    renderTabContent('all');
}

/**
 * Attaches click event listeners to the buttons within the notifications modal.
 */
function reattachNotificationListeners() {
    const overlay = document.getElementById('notifications-overlay');
    if (!overlay) return;

    // Use event delegation to handle clicks more efficiently
    overlay.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const { action, requestId } = button.dataset;
        if (action === 'approve' || action === 'deny') {
            handleApproval(requestId, action);
        }
    });
}

function generateNotificationsListHTML(filter = 'all') {
    let filteredIncoming = pendingMoves;
    let filteredOutgoing = outgoingMoves;
    switch (filter) {
        case 'incoming':
            filteredIncoming = pendingMoves.filter(move => move.status === 'pending');
            filteredOutgoing = [];
            break;
        case 'on-transit':
            filteredOutgoing = outgoingMoves.filter(move => move.status === 'pending');
            filteredIncoming = [];
            break;
        case 'partial':
            filteredIncoming = pendingMoves.filter(move => move.status === 'partial');
            filteredOutgoing = outgoingMoves.filter(move => move.status === 'partial');
            break;
        case 'completed':
            filteredIncoming = pendingMoves.filter(move => ['completed', 'denied'].includes(move.status));
            filteredOutgoing = outgoingMoves.filter(move => ['completed', 'denied'].includes(move.status));
            break;
        case 'all': default: break;
    }
    const allMoves = [...filteredIncoming, ...filteredOutgoing];
    if (allMoves.length === 0) {
        return `<div class="empty-notifications-message">...</div>`; // Empty state
    }
    allMoves.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));

     return allMoves.map(move => {
        const isIncoming = move.to === currentStockType;
        const isActionable = isIncoming && move.status === 'pending';
        const title = isIncoming ? `Request from <strong>${move.from.toUpperCase()}</strong>` : `Request to <strong>${move.to.toUpperCase()}</strong>`;
        
        const boxNameHTML = move.boxName ? `
            <div class="notification-box-name">
                <span>Reference Name: </span>
                <span>${move.boxName}</span>
            </div>
        ` : '';

        const productsHTML = move.products.map(p => {
            const noteTag = p.note ? `<div class="note-tag">${p.note}</div>` : '';
            
            const quantitiesString = p.quantities ? 
                Object.entries(p.quantities).map(([size, count]) => `<strong>${size.toUpperCase()}:</strong> ${count}`).join(' &bull; ') 
                : 'No quantities specified';

            return `
                <li class="notification-product-list-item">
                    <span class="product-name">${p.name} (SKU: ${p.sku})</span>
                    ${noteTag}
                    <span class="product-quantities">${quantitiesString}</span>
                </li>`;
        }).join('');

        return `
            <div class="notification-item" id="request-${move.id}">
                <div class="notification-item-header">
                    <span>${title}</span>
                    <span class="status-tag-notification status-${move.status}">${move.status}</span>
                </div>
                <div class="notification-item-body">
                     ${boxNameHTML}
                     <p><strong>Products & Quantities:</strong></p>
                     <ul class="product-details-list">${productsHTML}</ul>
                    ${isActionable ? `
                     <div class="notification-actions">
                         <button class="modal-btn secondary" data-action="deny" data-request-id="${move.id}">Deny</button>
                         <button class="modal-btn primary" data-action="approve" data-request-id="${move.id}">Approve</button>
                     </div>
                     ` : ''}
                </div>
            </div>`;
    }).join('');
}

async function handleApproval(requestId, status) {
    const request = pendingMoves.find(p => p.id === requestId);
    if (!request) return;

    const itemEl = document.getElementById(`request-${requestId}`);
    itemEl.querySelectorAll('button').forEach(b => b.disabled = true);
    const requestRef = doc(db, `InventoryWorkspace/${currentInventoryId}/PendingMoves`, requestId);

    if (status === 'denied') {
        await updateDoc(requestRef, { status: 'denied' });
        console.log("ℹ️ Move request denied.");
        itemEl.querySelectorAll('button').forEach(b => b.disabled = false); // Re-enable after action
        return;
    }

    // If the action is 'approved', open the new confirmation modal.
    // The modal will handle the rest of the process.
    if (status === 'approved') {
        await openApprovalConfirmationModal(request);
        // Note: The modal is now responsible for re-enabling buttons if the user cancels.
    }
}

async function openApprovalConfirmationModal(request) {
    const sourceCol = request.from === 'ph' ? 'PH-Stocks-meta' : 'US-Stocks-meta';
    let totalAvailableQuantities = {};

    // 1. Get the most current total stock levels for the requested items.
    try {
        await runTransaction(db, async (transaction) => {
            for (const field in request.quantities) {
                totalAvailableQuantities[field] = 0;
                for (const productInfo of request.products) {
                    const sourceRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${sourceCol}`, productInfo.productId);
                    const sourceDoc = await transaction.get(sourceRef);
                    if (sourceDoc.exists()) {
                        totalAvailableQuantities[field] += parseFloat(sourceDoc.data()[field] || 0);
                    }
                }
            }
        });
    } catch (error) {
        console.error("Failed to fetch current stock levels:", error);
        alert("Could not fetch current stock levels. Please try again.");
        const itemEl = document.getElementById(`request-${request.id}`);
        if (itemEl) itemEl.querySelectorAll('button').forEach(b => b.disabled = false);
        return;
    }
    let finalStatus = "completed"
    // 2. Build the HTML for the modal's input fields with a modern UI.
    let inputsHTML = `
        <div class="form-row header-row">
            <span>Item/Size</span>
            <span>In Stock</span>
            <span>Originally Requested</span>
            <span class="text-center">New Amount to Approve</span>
        </div>
    `;

    for (const field in request.quantities) {
        const requested = request.quantities[field];
        const available = totalAvailableQuantities[field] || 0;
        const label = field === 'countStocks' ? 'Total Stocks' : `Size ${field.toUpperCase()}`;

        inputsHTML += `
            <div class="form-row">
                <label for="approve-qty-${field}" class="input-label">${label}</label>
                <span class="stock-info available">${available}</span>
                <span class="stock-info requested">${requested}</span>
                <input type="number" id="approve-qty-${field}" class="input-field modern-input" data-field="${field}" value="${requested}" min="0">
            </div>
        `;
    }

    // 3. Create and inject the full modal HTML.
    const modalHTML = `
        <div class="dialog-overlay modern-overlay" id="approval-confirm-overlay">
            <div class="dialog-box modern-dialog">
                <div class="dialog-header">
                    <h2>Confirm Transfer</h2>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="dialog-content">
                    <p class="dialog-instruction">
                        Please confirm or change the amount of stock to transfer. 
                        Approving more than is available will create a stock deficit.
                    </p>
                    <div class="form-grid">${inputsHTML}</div>
                </div>
                <div class="dialog-footer">
                     <button class="btn btn-secondary" id="cancel-approval-btn">Cancel</button>
                     <button class="btn btn-primary" id="confirm-approval-btn">Confirm & Process Transfer</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // 4. Add event listeners for the new modal.
    const overlay = document.getElementById('approval-confirm-overlay');
    const closeModal = () => {
        overlay.remove();
        const itemEl = document.getElementById(`request-${request.id}`);
        if (itemEl) itemEl.querySelectorAll('button').forEach(b => b.disabled = false);
    };

    overlay.querySelector('.close-btn').addEventListener('click', closeModal);
    overlay.querySelector('#cancel-approval-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });

    overlay.querySelector('#confirm-approval-btn').addEventListener('click', () => {
        const approvedQuantities = {};
        let totalToMove = 0;
        overlay.querySelectorAll('.modern-input').forEach(input => {
            const value = parseInt(input.value, 10);
            // Use the original request's fields to ensure we only capture relevant data
            if (request.quantities.hasOwnProperty(input.dataset.field)) {
                // Even if the value is 0, we include it to handle cases where a user wants to zero out a request for a specific size.
                approvedQuantities[input.dataset.field] = isNaN(value) ? 0 : value;
                if (!isNaN(value) && value > 0) {
                    totalToMove += value;
                }
            }
        });

        if (Object.keys(approvedQuantities).length === 0) {
            alert("No valid quantities were entered. Please specify an amount to transfer.");
            return;
        }

        overlay.remove();
        executeApprovalWithQuantities(request, approvedQuantities);
    });
}

async function executeApprovalWithQuantities(request, approvedQuantities) {
    const requestId = request.id;
    const requestRef = doc(db, `InventoryWorkspace/${currentInventoryId}/PendingMoves`, requestId);
    const sourceCol = request.from === 'ph' ? 'PH-Stocks-meta' : 'US-Stocks-meta';
    const targetCol = request.to === 'ph' ? 'PH-Stocks-meta' : 'US-Stocks-meta';

    try {
        await runTransaction(db, async (transaction) => {
            console.log("🚀 Starting transaction for request ID:", requestId);
            console.log("🔍 Approved Quantities:", approvedQuantities);

            // --- READ PHASE ---
            const productDocs = {};
            const readPromises = request.products.map(productInfo => {
                const sourceRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${sourceCol}`, productInfo.productId);
                const targetRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${targetCol}`, productInfo.productId);
                return Promise.all([transaction.get(sourceRef), transaction.get(targetRef)])
                    .then(([sourceDoc, targetDoc]) => {
                        console.log(`📄 Read product ${productInfo.productId}: source exists=${sourceDoc.exists()}, target exists=${targetDoc.exists()}`);
                        productDocs[productInfo.productId] = { sourceRef, targetRef, sourceDoc, targetDoc };
                    });
            });
            await Promise.all(readPromises);
            console.log("✅ Completed all reads");

            const backorderQuantities = {};
            let quantitiesToMove = { ...approvedQuantities };

            for (const productInfo of request.products) {
                if (Object.values(quantitiesToMove).every(v => v <= 0)) {
                    console.log("🛑 All approved quantities processed. Skipping remaining products.");
                    break;
                }

                const { sourceRef, targetRef, sourceDoc, targetDoc } = productDocs[productInfo.productId];

                // --- GUARANTEE TARGET DOCUMENT EXISTS ---
                if (!targetDoc.exists()) {
                    const sourceData = sourceDoc.data();
                    if (sourceData) {
                        console.log(`Target for product ${productInfo.productId} doesn't exist. Creating a zero-stock copy from source.`);
                        const newTargetProductData = {
                            ...sourceData,
                            s: 0, m: 0, l: 0, xl: 0, xxl: 0, c: 0, others: 0, countStocks: 0,
                            warehouseLocation: request.to === 'ph' ? 'PH Stocks' : 'US Stocks',
                            createdAt: serverTimestamp()
                        };
                        // Create the document. It will now exist for all subsequent operations in this transaction.
                        transaction.set(targetRef, newTargetProductData);
                    } else {
                        console.warn(`⚠️ Source document ${sourceDoc.id} does not exist. Cannot create target or transfer stock. Skipping product.`);
                        continue; // Skip to the next product.
                    }
                }

                // --- PROCESS QUANTITY UPDATES ---
                // No 'if/else' is needed here because the block above guarantees the target document exists.
                for (const field in quantitiesToMove) {
                    const approved = quantitiesToMove[field];
                    if (approved > 0) {
                        const currentStock = sourceDoc.data()[field] || 0;
                        const canTransfer = Math.min(currentStock, approved);
                        const deducted = approved;
                        const newStock = currentStock - deducted;
                        const missing = deducted > currentStock ? deducted - currentStock : 0;

                        // Deduct from source (even if it goes negative)
                        transaction.update(sourceRef, {
                            [field]: newStock
                        });
                        console.log(`➖ Deducting ${deducted} from ${field} @ Source: ${currentStock} - ${deducted} = ${newStock}`);

                        transaction.update(targetRef, {
                            [field]: increment(canTransfer)
                        });
                        console.log(`➕ Adding ${canTransfer} to ${field} @ Target`);

                        // Track shortfall
                        if (missing > 0) {
                            backorderQuantities[field] = (backorderQuantities[field] || 0) + missing;
                            console.warn(`📦 Not enough stock for ${field}. Approved: ${approved}, Available: ${currentStock}, Backordered: ${missing}`);
                        }

                        quantitiesToMove[field] = 0;
                    }
                }
            }

            // --- Handle final status and backorders ---
            const finalStatus = Object.keys(backorderQuantities).length > 0 ? 'partial' : 'completed';
            console.log("📦 Backorder Quantities:", backorderQuantities);
            console.log("📌 Final Status:", finalStatus);

            if (finalStatus === 'partial') {
                const backorderRef = doc(collection(db, `InventoryWorkspace/${currentInventoryId}/Backorders`));
                transaction.set(backorderRef, {
                    ...request,
                    id: backorderRef.id,
                    originalRequestId: requestId,
                    quantities: backorderQuantities,
                    status: 'backordered',
                    createdAt: serverTimestamp()
                });
                console.log("📤 Backorder document queued:", backorderRef.id);
            }

            transaction.update(requestRef, { status: finalStatus });
            console.log(`📋 Updated request ${requestId} status to: ${finalStatus}`);
        });

        console.log(`✅ Move request ${requestId} processed successfully.`);
    } catch (error) {
        console.error("❌ Error executing approval transaction:", error);
        alert(`An error occurred during approval: ${error.message}`);
        const itemEl = document.getElementById(`request-${requestId}`);
        if (itemEl) itemEl.querySelectorAll('button').forEach(b => b.disabled = false);
    }
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
    reattachNotificationListeners();

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

/**
 * Shows or hides a loading overlay on the screen.
 * @param {boolean} show - True to show the overlay, false to hide it.
 * @param {string} [message='Loading...'] - The message to display.
 */
function toggleLoadingOverlay(show, message = 'Loading...') {
    const existingOverlay = document.getElementById('creation-loading-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    if (show) {
        const overlay = document.createElement('div');
        overlay.id = 'creation-loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
}

/**
 * Creates a new InventoryWorkspace document with a default structure,
 * including the necessary subcollections.
 * @param {string} inventoryId - The ID for the new workspace document.
 */
async function createDefaultInventoryWorkspace(inventoryId) {
    console.log(`🚀 Creating default inventory workspace for ID: ${inventoryId}`);

    const defaultData = {
        columns_ph: [
            { id: "productImage", name: "Product Image Name", type: "Image", isRestricted: false },
            { id: "productSku", name: "Product SKU", type: "Text", isRestricted: false },
            { id: "supplierCost", name: "Supplier Cost", type: "Costing", isRestricted: true },
            { id: "supplierName", name: "Supplier Name", type: "Text", isRestricted: false },
            { id: "supplierProject", name: "Supplier Project", type: "Dropdown", isRestricted: false },
            { id: "warehouseLocation", name: "Warehouse Location", type: "Dropdown", isRestricted: false },
            { id: "s", name: "S", type: "SizeNumber", isRestricted: false },
            { id: "m", name: "M", type: "SizeNumber", isRestricted: false },
            { id: "l", name: "L", type: "SizeNumber", isRestricted: false },
            { id: "xl", name: "XL", type: "SizeNumber", isRestricted: false },
            { id: "xxl", name: "XXL", type: "SizeNumber", isRestricted: false },
            { id: "others", name: "Others", type: "Text", isRestricted: false },
            { id: "total", name: "Total", type: "Text", isRestricted: false },
            { id: "countStocks", name: "Stocks", type: "Number", isRestricted: false }
        ],
        columns_us: [
            { id: "productImage", name: "Product Image", type: "Image", isRestricted: false },
            { id: "productSku", name: "Product SKU", type: "Text", isRestricted: false },
            { id: "supplierCost", name: "Supplier Cost", type: "Costing", isRestricted: true },
            { id: "supplierName", name: "Supplier Name", type: "Text", isRestricted: false },
            { id: "supplierProject", name: "Supplier Project", type: "Dropdown", isRestricted: false },
            { id: "warehouseLocation", name: "Warehouse Location", type: "Dropdown", isRestricted: false },
            { id: "s", name: "S", type: "SizeNumber", isRestricted: false },
            { id: "m", name: "M", type: "SizeNumber", isRestricted: false },
            { id: "l", name: "L", type: "SizeNumber", isRestricted: false },
            { id: "xl", name: "XL", type: "SizeNumber", isRestricted: false },
            { id: "xxl", name: "XXL", type: "SizeNumber", isRestricted: false },
            { id: "others", name: "Others", type: "Text", isRestricted: false },
            { id: "total", name: "Total", type: "Text", isRestricted: false },
            { id: "countStocks", name: "Stocks", type: "Number", isRestricted: false }
        ],
        customResizeWidthPHStock: {
            countStocks: 150,
            l: 145,
            m: 57,
            others: 100,
            productImage: 195,
            productSku: 160,
            s: 55,
            supplierCost: 120,
            supplierName: 180,
            supplierProject: 180,
            total: 75,
            warehouseLocation: 180,
            xl: 61,
            xxl: 65
        },
        customResizeWidthUSStock: {
            productImage: 213,
            productSku: 160,
            supplierProject: 180,
            warehouseLocation: 150
        },
        columnOrder_ph: ["productImage", "productSku", "countStocks", "s", "m", "l", "xl", "xxl", "others", "total", "supplierCost", "supplierName", "supplierProject", "warehouseLocation"],
        columnOrder_us: ["productImage", "productSku", "countStocks", "s", "m", "l", "xl", "xxl", "others", "total", "supplierCost", "supplierName", "supplierProject", "warehouseLocation"]
    };

    try {
        const batch = writeBatch(db);
        const docRef = doc(db, 'InventoryWorkspace', inventoryId);

        // 1. Set the main document data
        batch.set(docRef, defaultData);
        console.log("✅ Main inventory document queued for creation.");

        // 2. Create placeholder documents to establish subcollections
        const phStocksPlaceholderRef = doc(collection(docRef, 'PH-Stocks-meta'));
        batch.set(phStocksPlaceholderRef, { initialized: serverTimestamp() });
        console.log("✅ PH-Stocks-meta subcollection queued for initialization.");

        const usStocksPlaceholderRef = doc(collection(docRef, 'US-Stocks-meta'));
        batch.set(usStocksPlaceholderRef, { initialized: serverTimestamp() });
        console.log("✅ US-Stocks-meta subcollection queued for initialization.");

        // 3. Commit the batch transaction
        await batch.commit();
        console.log("✅ Default inventory workspace and subcollections created successfully.");

    } catch (error) {
        console.error("❌ Error creating default inventory workspace:", error);
        toggleLoadingOverlay(false); // Hide overlay on error
        alert("Failed to initialize your inventory. Please check the console and refresh the page.");
    }
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
            const parsedValue = (column.type === 'Costing' || column.type === 'Numbers') ?
                parseFloat(newValue) || 0 :
                newValue;

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

/**
 * Deletes a product document from Firestore.
 * @param {string} productId The ID of the product to delete.
 */
async function deleteProduct(productId) {
    const stockTypeCollection = currentStockType === 'us' ? 'US-Stocks-meta' : 'PH-Stocks-meta';
    const productRef = doc(db, `InventoryWorkspace/${currentInventoryId}/${stockTypeCollection}`, productId);

    try {
        await deleteDoc(productRef);

        console.log(`✅ Product with ID: ${productId} has been deleted.`);
        render(currentStockType);
        // The list will automatically update when your real-time listener detects the deletion.
    } catch (error) {
        console.error("❌ Error deleting product:", error);
        alert("Failed to delete the product. Please try again.");
    }
}


async function render(stockType) {
    let productList = stockType === 'ph' ? dataPhStocks : dataUsStocks;
    let savedColumnWidths = {};
    if (!productListBody || !currentInventoryId) return;

    if (isCreatingWorkspace) return;

    const docRef = doc(db, 'InventoryWorkspace', currentInventoryId);
    const docSnap = await getDoc(docRef);

    // --- NEW LOGIC: Check for existence and create if needed ---
    if (!docSnap.exists()) {
        isCreatingWorkspace = true;
        toggleLoadingOverlay(true, 'Initializing your inventory workspace...');

        await createDefaultInventoryWorkspace(currentInventoryId);

        // Hide overlay and re-run the render function.
        toggleLoadingOverlay(false);
        isCreatingWorkspace = false;
        render(stockType); // This time, the document will exist.
        return; // Stop the current render pass.
    }
    // --- END OF NEW LOGIC ---

    console.log(`✅ Rendering ${stockType.toUpperCase()} with:`, productList.length, 'items');

    if (!Array.isArray(productList)) {
        console.warn('⚠️ productList is invalid!', productList);
        productList = []; // Ensure productList is an array to prevent errors
    }

    if (!Array.isArray(productList) || productList.length === 0) {
        console.warn('⚠️ productList is empty or invalid!', productList);
    }

    const data = docSnap.data();
    savedColumnWidths = stockType === 'us' ?
        data.customResizeWidthUSStock || {} :
        data.customResizeWidthPHStock || {};
    const columnRules = Array.isArray(data[`columnRules_${stockType}`]) ? data[`columnRules_${stockType}`] : [];

    // Permission check
    try {
        // --- Step 1: Search all /users/*/myworkspace/* that match the currentWorkspaceId ---
        const workspaceQuery = query(
            collectionGroup(db, 'myworkspace'),
            where('workspaceId', '==', currentWorkspaceId)
        );

        const querySnapshot = await getDocs(workspaceQuery);

        let matchedDoc = null;
        let isOwner = false;

        for (const docSnap of querySnapshot.docs) {
            const data = docSnap.data();
            const ownerRef = data.ownerWorkspaceRef;
            const ownerPath = typeof ownerRef === 'string' ? ownerRef : ownerRef?.path;

            if (ownerPath?.includes(currentUserId)) {
                matchedDoc = docSnap;
                isOwner = true;
                break;
            }
        }

        // --- Step 2: Check user role from main /users/{uid} ---
        const userDocRef = doc(db, 'users', currentUserId);
        const userDocSnap = await getDoc(userDocRef);

        let isAdminOrDev = false;
        if (userDocSnap.exists()) {
            const userRole = userDocSnap.data()?.role;
            isAdminOrDev = userRole === 0 || userRole === 3; // 0 = Developer, 3 = Admin
        }

        // --- Step 3: Combine logic ---
        canUserEditProduct = isOwner || isAdminOrDev;

    } catch (error) {
        console.error('Permission check failed:', error);
    }

    if (!canUserEditProduct) {
        console.warn('⚠️ User does not have permission to add products.');
        addProductHeaderBtn.classList.add('hidden');
        moveProductsBtn.classList.add('hidden');
    } else {
        addProductHeaderBtn.classList.remove('hidden');
        moveProductsBtn.classList.remove('hidden');
    }
    // Column setup from Firestore
    const firestoreColumns = stockType === 'us' ?
        data.columns_us || [] :
        data.columns_ph || [];

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
    const pendingProductIds = new Set(
        pendingMoves
            .flatMap(move => move.products.map(p => p.productId))
    );

    const visibleProductList = productList.filter(product => !pendingProductIds.has(product.id));

    // Structure data
    const project = {
        id: `project_${stockType}`,
        name: `${stockType.toUpperCase()} Stock Inventory`,
        products: Array.isArray(productList) ?
            productList
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
                })) : [],
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
        cell.className = 'group relative px-2 py-1 font-semibold text-slate-600 border-r border-slate-200 bg-transparent flex items-center text-xs';
        cell.style.width = `${width}px`;
        cell.style.minWidth = `${width}px`;

        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-grow items-center justify-between min-w-0';

        const text = document.createElement('span');
        text.textContent = col.name;
        text.className = 'header-cell-content flex-grow truncate text-ellipsis overflow-hidden';

        const optionsIcon = document.createElement('span');
        optionsIcon.className = 'material-icons options-icon bg-transparent text-slate-400 hover:text-slate-600 cursor-pointer text-[18px] ml-2';
        optionsIcon.textContent = 'more_vert'; // vertical three dots

        wrapper.appendChild(text);
        if (canUserEditProduct) {
            wrapper.appendChild(optionsIcon);
        }

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';

        cell.appendChild(wrapper);
        if (canUserEditProduct) {
            cell.appendChild(resizeHandle);
        }

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
    <div class="drag-handle ${!canUserEditProduct ? 'hidden' : ''} cursor-grab p-1">
        <span class="material-icons text-slate-500" style="font-size: 20px;">drag_indicator</span>
    </div>
    <div class="flex items-center flex-grow min-w-0">
        <span class="product-name truncate text-[13px] ${canUserEditProduct ? 'focus:bg-white focus:ring-1 focus:ring-slate-300' : 'cursor-default'}" 
              contenteditable="${canUserEditProduct}" data-product-id="${product.id}">
            ${product.name}
        </span>
    </div>
    ${canUserEditProduct ? `
        <span class="delete-product-btn material-icons text-slate-400 hover:text-red-500 cursor-pointer ml-auto p-1" title="Delete Product">
            delete_outline
        </span>
    ` : ''}
`;

        // Find the delete icon we just created
        const deleteIcon = leftCell.querySelector('.delete-product-btn');

        // If the delete icon exists, add the click listener
        if (deleteIcon) {
            deleteIcon.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent other clicks from firing

                // Show a confirmation dialog
                if (confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
                    // If user clicks "Yes", call the delete function
                    deleteProduct(product.id);
                }
            });
        }

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

                    if (canUserEditProduct) {
                        // --- EDITABLE STATE ---
                        // New layout with a clickable image and a separate edit icon.
                        cell.innerHTML = `
            <div class="product-image-container-editable flex items-center justify-between w-full">
                <div class="product-image-wrapper w-6 h-6 bg-gray-200 rounded-md flex items-center justify-center overflow-hidden relative cursor-pointer" title="${hasImage ? 'View Image' : 'Add Image'}">
                    ${hasImage ? `<img src="${product.imageUrl}" class="w-full h-full object-cover pointer-events-none">` : '<span class="material-icons text-gray-400 text-[18px] pointer-events-none">photo_camera</span>'}
                </div>
                <span class="material-icons edit-image-btn text-slate-400 hover:text-slate-600 cursor-pointer text-[14px] ml-2 opacity-1">edit</span>
                <input type="file" accept="image/*" class="hidden image-file-input">
            </div>
        `;

                        const container = cell.querySelector('.product-image-container-editable');
                        const wrapper = container.querySelector('.product-image-wrapper');
                        const editBtn = container.querySelector('.edit-image-btn');
                        const fileInput = container.querySelector('.image-file-input');

                        // Event 1: Click the image itself to view it in the overlay.
                        wrapper.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (hasImage) {
                                overlayImageSrc.src = product.imageUrl;
                                imageOverlay.classList.remove('hidden');
                                updateUrlForImageView(product.id);
                            } else {
                                // If no image, clicking the placeholder prompts for an upload.
                                fileInput.click();
                            }
                        });

                        // Event 2: Click the new pencil icon to open the edit dropdown.
                        editBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            fileInput.click();
                        });

                        // Event 3: File input handler remains the same.
                        fileInput.addEventListener('change', (e) => {
                            const file = e.target.files[0];
                            if (file) {
                                uploadProductImage(file, product.id);
                            }
                        });

                        // Event 4: Drag and drop handlers are now on the main container for a larger drop zone.
                        container.addEventListener('dragover', (e) => {
                            e.preventDefault();
                            container.classList.add('drag-hover');
                        });
                        container.addEventListener('dragleave', () => {
                            container.classList.remove('drag-hover');
                        });
                        container.addEventListener('drop', (e) => {
                            e.preventDefault();
                            container.classList.remove('drag-hover');
                            const file = e.dataTransfer.files[0];
                            if (file && file.type.startsWith('image/')) {
                                uploadProductImage(file, product.id);
                            }
                        });

                    } else {
                        // --- VIEW-ONLY STATE ---
                        // This logic already works as requested. Clicking the image opens the overlay.
                        if (hasImage) {
                            cell.innerHTML = `
                <div class="product-image-container cursor-pointer" title="View Image">
                    <div class="w-6 h-6 bg-gray-200 rounded-md flex items-center justify-center overflow-hidden">
                        <img src="${product.imageUrl}" class="w-full h-full object-cover">
                    </div>
                </div>
            `;
                            cell.querySelector('.product-image-container').addEventListener('click', () => {
                                overlayImageSrc.src = product.imageUrl;
                                imageOverlay.classList.remove('hidden');
                                updateUrlForImageView(product.id); // Sync URL for consistency
                            });
                        } else {
                            // If there's no image, just show the static placeholder icon.
                            cell.innerHTML = `
                <div class="w-6 h-6 bg-gray-200 rounded-md flex items-center justify-center overflow-hidden cursor-default">
                    <span class="material-icons text-gray-400 text-[18px]">photo_camera</span>
                </div>
            `;
                        }
                    }
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
                    const displayValue = (typeof rawValue === 'object' && rawValue !== null) ?
                        rawValue.name || 'Unnamed Project' :
                        rawValue || (isEditable ? 'Select Project' : 'N/A');

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
            minWidth = 20; // Force 20px for fixed columns
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
        const fieldPath = isUS ?
            `customResizeWidthUSStock.${columnId}` :
            `customResizeWidthPHStock.${columnId}`;

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
            (config.type === 'Type' ? typeColumnOptions : []) : null
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