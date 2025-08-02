/**
 * ===================================================================================
 * board.js - The Complete Real-Time Kanban Board (Corrected Order)
 * ===================================================================================
 * This script powers a real-time, collaborative Kanban board using Firebase Firestore.
 * This version corrects the function order to resolve the 'not defined' error.
 * ===================================================================================
 */

// --- 1. FIREBASE IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    serverTimestamp,
    getDoc,
    getDocs,
    limit,
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

// Initialize Firebase
console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app, "juanluna-cms-01");
console.log("Initialized Firebase on Dashboard.");


// --- 4. MODULE-SCOPED STATE & DOM REFERENCES ---
let kanbanBoard, addSectionBtn, addTaskMainBtn, toolsBtn, toolsPanel, filterInput;
let sortSectionsAz, sortSectionsZa, sortTasksAz, sortTasksZa;

let sortableInstances = [];
let activeListeners = {
    workspace: null,
    project: null,
    sections: null,
    tasks: null,
    messages: null
};
let project = { id: null, sections: [] };
let allUsers = [];
let allTasksFromSnapshot = [];
let taskImageMap = {};

let currentUserId = null;
let currentWorkspaceId = null;
let currentProjectId = null;
let userCanEditProject = false;
let currentUserRole = null;
let currentProjectRef = null;
let taskIdToFocus = null;
let isMovingTask = false;

let activeInlineEditor = {
    taskId: null,
    element: null
};

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

// --- 5. HELPER & UTILITY FUNCTIONS (Defined Before Use) ---

/**
 * Fetches the user profile documents for a given list of user IDs.
 * @param {string[]} uids - An array of user UIDs.
 * @returns {Promise<object[]>} A promise that resolves to an array of user objects.
 */
async function fetchMemberProfiles(uids) {
    if (!uids || uids.length === 0) {
        return []; // Return empty if no UIDs are provided
    }
    try {
        const userPromises = uids.map(uid => getDoc(doc(db, `users/${uid}`)));
        const userDocs = await Promise.all(userPromises);
        const validUsers = userDocs
            .filter(d => d.exists())
            .map(d => ({ uid: d.id, ...d.data() }));
        console.log("[Board.js DEBUG] Fetched member profiles:", validUsers);
        return validUsers;
    } catch (error) {
        console.error("[Board.js DEBUG] Error fetching member profiles:", error);
        return [];
    }
}

/**
 * Handles the logic for completing and un-completing a task.
 * It moves the task to/from a designated "Completed" section.
 * @param {object} task - The task object being completed.
 * @param {HTMLElement} taskCardEl - The DOM element for the task card.
 */
async function handleTaskCompletion(task) {
    if (!task || !currentProjectRef) return;

    const taskId = task.id;
    const batch = writeBatch(db);
    const taskIndexRef = doc(db, "taskIndex", taskId);
    const isCurrentlyCompleted = task.status === 'Completed';

    let finalTaskData;

    if (isCurrentlyCompleted) {
        // --- UN-COMPLETING ---
        const targetSectionId = task.previousSectionId || project.sections.find(s => s.sectionType !== 'completed')?.id;
        if (!targetSectionId) return console.error("No target section found to un-complete task.");

        const sourceTaskRef = doc(currentProjectRef, `sections/${task.sectionId}/tasks/${taskId}`);
        const targetTaskRef = doc(currentProjectRef, `sections/${targetSectionId}/tasks/${taskId}`);
        const { previousStatus, previousSectionId, ...restOfTask } = task;

        finalTaskData = {
            ...restOfTask,
            status: previousStatus || 'On track',
            sectionId: targetSectionId,
        };

        batch.delete(sourceTaskRef);
        batch.set(targetTaskRef, finalTaskData);
        batch.set(taskIndexRef, { ...finalTaskData, path: targetTaskRef.path }, { merge: true });

    } else {
        // --- COMPLETING ---
        const completedSection = project.sections.find(s => s.sectionType === 'completed');
        if (!completedSection) return alert("Please create a 'Completed' section first.");

        const sourceTaskRef = doc(currentProjectRef, `sections/${task.sectionId}/tasks/${taskId}`);
        const targetTaskRef = doc(currentProjectRef, `sections/${completedSection.id}/tasks/${taskId}`);

        finalTaskData = {
            ...task,
            status: 'Completed',
            previousStatus: task.status,
            previousSectionId: task.sectionId,
            sectionId: completedSection.id,
        };

        batch.delete(sourceTaskRef);
        batch.set(targetTaskRef, finalTaskData);
        batch.set(taskIndexRef, { ...finalTaskData, path: targetTaskRef.path }, { merge: true });
    }

    try {
        await batch.commit();
    } catch (error) {
        console.error(`Error updating task completion for ${taskId}:`, error);
    }
}
/**
 * Sets the global permission flags based on the user's role in the current project.
 * @param {object} projectData - The full project document data.
 * @param {string} userId - The UID of the currently authenticated user.
 */
function updateUserPermissions(projectData, userId) {
    if (!projectData || !userId) {
        userCanEditProject = false;
        currentUserRole = null;
        return;
    }
    const members = projectData.members || [];
    const userMemberInfo = members.find(member => member.uid === userId);
    currentUserRole = userMemberInfo ? userMemberInfo.role : null;
    const isMemberWithEditPermission = userMemberInfo && (userMemberInfo.role === "Project Owner Admin" || userMemberInfo.role === "Project Admin" || userMemberInfo.role === "Editor");
    const isSuperAdmin = projectData.project_super_admin_uid === userId;
    const isAdminUser = projectData.project_admin_user === userId;
    userCanEditProject = isMemberWithEditPermission || isSuperAdmin || isAdminUser;
    console.log(`[Board.js Permissions] User: ${userId}, Role: ${currentUserRole}, Can Edit Project: ${userCanEditProject}`);
}

/**
 * Checks if the current user has permission to edit a specific task.
 * @param {object} task - The task object.
 * @returns {boolean} - True if the user can edit the task.
 */
function canUserEditTask(task) {
    if (userCanEditProject) {
        return true;
    }
    return false;
}

function canUserEditSpecifcTask(task) {
    // Rule 1: Admins and Editors can always edit.
    if (userCanEditProject) {
        return true;
    }

    // Rule 2: Check for the special case for assigned users.
    if (currentUserRole === 'Viewer' || currentUserRole === 'Commentor') {
        // Ensure task.assignees is an array before checking.
        const isAssigned = Array.isArray(task.assignees) && task.assignees.includes(currentUserId);

        if (isAssigned) {
            console.log(`[Permissions] Granting FULL task edit for assigned ${currentUserRole}.`);
            return true;
        }
    }

    // Otherwise, the user has no permission to edit this task.
    return false;
}

const findSection = (sectionId) => project.sections.find(s => s.id === sectionId);
const findTaskAndSection = (taskId) => {
    for (const section of project.sections) {
        const task = (section.tasks || []).find(t => t.id === taskId);
        if (task) return { task, section };
    }
    return { task: null, section: null };
};

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

const checkDueDates = () => {
    const today = new Date('2025-06-12T00:00:00');
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    document.querySelectorAll('.boardtasks-due-date').forEach(el => {
        if (!el.dataset.dueDate) return;
        const dueDate = new Date(el.dataset.dueDate + 'T00:00:00');
        dueDate.setHours(0, 0, 0, 0);
        el.classList.remove('boardtasks-date-overdue', 'boardtasks-date-near');
        if (dueDate < today) {
            el.classList.add('boardtasks-date-overdue');
        } else if (dueDate.getTime() === tomorrow.getTime()) {
            el.classList.add('boardtasks-date-near');
        }
    });
};


// --- 6. CORE INITIALIZATION & CLEANUP ---
const init = () => {
    // Get DOM element references
    kanbanBoard = document.getElementById('boardtasks-kanbanBoard');
    addSectionBtn = document.getElementById('boardtasks-add-section-btn');
    addTaskMainBtn = document.querySelector('.boardtasks-add-task-btn-main');
    toolsBtn = document.getElementById('boardtasks-tools-btn');
    toolsPanel = document.getElementById('boardtasks-tools-panel');
    filterInput = document.getElementById('boardtasks-filter-input');
    sortSectionsAz = document.getElementById('boardtasks-sort-sections-az');
    sortSectionsZa = document.getElementById('boardtasks-sort-sections-za');
    sortTasksAz = document.getElementById('boardtasks-sort-tasks-az');
    sortTasksZa = document.getElementById('boardtasks-sort-tasks-za');

    // Attach event listeners
    addSectionBtn.addEventListener('click', addSectionToFirebase);
    addTaskMainBtn.addEventListener('click', handleAddTaskMainClick);
    toolsBtn.addEventListener('click', () => toolsPanel.classList.toggle('boardtasks-hidden'));
    filterInput.addEventListener('input', handleFilterInput);
    sortSectionsAz.addEventListener('click', () => sortSections(true));
    sortSectionsZa.addEventListener('click', () => sortSections(false));
    sortTasksAz.addEventListener('click', () => sortAllTasks(true));
    sortTasksZa.addEventListener('click', () => sortAllTasks(false));
    kanbanBoard.addEventListener('keydown', handleKanbanKeydown);
    kanbanBoard.addEventListener('blur', handleBlur, true);
    kanbanBoard.addEventListener('click', handleKanbanClick);

    // Authentication state observer
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // THE ONLY THING to do here is start the listener process with the user's ID.
            console.log(`Board View: User ${user.uid} signed in.`);
            attachRealtimeListeners(user.uid);
        } else {
            // This is the cleanup for when a user signs out.
            console.log("Board View: User signed out.");
            cleanup();
            if (kanbanBoard) {
                kanbanBoard.innerHTML = '<div class="loading-placeholder">Please log in to view the board.</div>';
            }
        }
    });

    return cleanup;
};

const cleanup = () => {
    detachAllListeners();
    sortableInstances.forEach(s => s.destroy());
    sortableInstances = [];
    allUsers = [];
    project = { id: null, sections: [] };
    taskImageMap = {};
    currentUserId = null;
    currentProjectRef = null;
    currentProjectId = null;
};
// --- 7. REAL-TIME DATA & STATE MANAGEMENT ---
function detachAllListeners() {
    Object.values(activeListeners).forEach(unsubscribe => unsubscribe && unsubscribe());
}

// --- 7. REAL-TIME DATA & STATE MANAGEMENT ---
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

    if (activeListeners.messages) {
        activeListeners.messages();
        activeListeners.messages = null;
    }
}

function getProjectIdFromUrl() {
    const match = window.location.pathname.match(/\/tasks\/[^/]+\/board\/([^/]+)/);
    return match ? match[1] : null;
}

async function logActivity({ action, field, from, to, taskRef }) {
    if (!taskRef || !currentUserId) return;
    const userProfile = allUsers.find(u => u.id === currentUserId);
    if (!userProfile) {
        console.warn("Could not log activity: Current user profile not found.");
        return;
    }

    const details = `<strong>${userProfile.name}</strong> ${action}` +
        `${field ? ` <strong>${field}</strong>` : ''}` +
        `${from ? ` from <strong>'${from}'</strong>` : ''}` +
        `${to ? ` to <strong>'${to}'</strong>` : ''}.`;

    try {
        await addDoc(collection(taskRef, "activity"), {
            type: 'log',
            userId: userProfile.id,
            userName: userProfile.name,
            userAvatar: userProfile.avatar,
            timestamp: serverTimestamp(),
            details: details
        });
    } catch (error) {
        console.error("Failed to log activity:", error);
    }
}

function attachRealtimeListeners(userId) {
    detachAllListeners();
    currentUserId = userId;

    const projectIdFromUrl = getProjectIdFromUrl();
    if (!projectIdFromUrl) {
        console.warn("No projectId found in URL.");
        project = { sections: [] };
        renderBoard();
        return;
    }

    currentProjectId = projectIdFromUrl;

    const userDocRef = doc(db, 'users', userId);
    activeListeners.user = onSnapshot(userDocRef, async (userSnap) => {
        if (!userSnap.exists()) {
            detachAllListeners();
            return;
        }

        detachProjectSpecificListeners();

        try {
            let projectDoc = null;

            // 1. Direct membership query
            const directMembershipQuery = query(
                collectionGroup(db, 'projects'),
                where('projectId', '==', currentProjectId),
                where('memberUIDs', 'array-contains', currentUserId)
            );
            const directMembershipSnapshot = await getDocs(directMembershipQuery);

            if (!directMembershipSnapshot.empty) {
                projectDoc = directMembershipSnapshot.docs[0];
            } else {
                // 2. Workspace-level access query
                const workspaceAccessQuery = query(
                    collectionGroup(db, 'projects'),
                    where('projectId', '==', currentProjectId),
                    where('accessLevel', '==', 'workspace')
                );
                const workspaceAccessSnapshot = await getDocs(workspaceAccessQuery);

                if (!workspaceAccessSnapshot.empty) {
                    projectDoc = workspaceAccessSnapshot.docs[0];
                }
            }

            if (!projectDoc) {
                console.error(`Project '${currentProjectId}' not found or access denied.`);
                project = { sections: [] };
                renderBoard();
                return;
            }

            currentProjectRef = projectDoc.ref;

            activeListeners.project = onSnapshot(currentProjectRef, async (projectDetailSnap) => {
                if (!projectDetailSnap.exists()) {
                    project = { sections: [] };
                    renderBoard();
                    return;
                }

                const projectData = projectDetailSnap.data();
                project = { ...project, ...projectData, id: projectDetailSnap.id };

                updateUserPermissions(projectData, currentUserId);
                const memberUIDs = projectData.members?.map(m => m.uid) || [];
                allUsers = await fetchMemberProfiles(memberUIDs);

                const sectionsQuery = query(collection(currentProjectRef, 'sections'), orderBy("order"));
                activeListeners.sections = onSnapshot(sectionsQuery, (snapshot) => {
                    project.sections = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, tasks: [] }));
                    distributeTasksToSections(allTasksFromSnapshot);
                    renderBoard();
                });

                const tasksQuery = query(collectionGroup(db, 'tasks'), where('projectId', '==', currentProjectId));
                activeListeners.tasks = onSnapshot(tasksQuery, (snapshot) => {
                    allTasksFromSnapshot = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                    distributeTasksToSections(allTasksFromSnapshot);
                    if (!isMovingTask) renderBoard();
                });

                const messagesQuery = query(
                    collectionGroup(db, 'Messages'),
                    where('projectId', '==', currentProjectId),
                    where('hasImage', '==', true)
                );

                if (activeListeners.messages) activeListeners.messages();
                activeListeners.messages = onSnapshot(messagesQuery, (snapshot) => {
                    const newImageMap = {};

                    snapshot.forEach(doc => {
                        const data = doc.data();
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = data.content;
                        const imgTag = tempDiv.querySelector('img');

                        if (imgTag && imgTag.src) {
                            const originalUrl = imgTag.src;
                            const uniqueImageUrl = `${originalUrl}&t=${Date.now()}`;

                            const taskId = doc.ref.parent.parent.id;
                            const existing = newImageMap[taskId];

                            if (!existing || (data.timestamp && (!existing.timestamp || data.timestamp.toMillis() < existing.timestamp.toMillis()))) {
                                newImageMap[taskId] = {
                                    imageUrl: uniqueImageUrl, // Store the NEW, unique URL
                                    timestamp: data.timestamp
                                };
                            }
                        }
                    });

                    if (Object.keys(newImageMap).length > 0) {
                        console.log("📷 Found images:", newImageMap);
                    } else {
                        console.log("❌ No images found in messages snapshot");
                    }

                    taskImageMap = Object.fromEntries(
                        Object.entries(newImageMap).map(([key, value]) => [key, value.imageUrl])
                    );

                    renderBoard();
                });

            });

        } catch (error) {
            console.error("Error during listener setup:", error);
            project = { sections: [] };
            renderBoard();
        }
    });
}


function distributeTasksToSections(tasks) {
    const tempTasks = project.sections.flatMap(s => (s.tasks || []).filter(t => t.isNew));
    project.sections.forEach(s => s.tasks = []);
    tasks.forEach(task => findSection(task.sectionId)?.tasks.push(task));
    tempTasks.forEach(tempTask => findSection(tempTask.sectionId)?.tasks.push(tempTask));
    project.sections.forEach(s => s.tasks.sort((a, b) => (a.order || 0) - (b.order || 0)));
}

function displaySideBarTasks(taskId) {
    console.log(`Task name clicked. Opening sidebar for task ID: ${taskId}`);
    if (window.TaskSidebar) {
        window.TaskSidebar.open(taskId, currentProjectRef);
    } else {
        console.error("TaskSidebar module is not available.");
    }
}

async function deleteSection(sectionId) {
    const section = findSection(sectionId);
    if (!section || !confirm(`Delete "${section.title}" and all its tasks?`)) return;
    if (!currentProjectRef) return console.error("Project reference is missing.");

    const sectionRef = doc(currentProjectRef, 'sections', sectionId);
    const tasksCollectionRef = collection(sectionRef, 'tasks');
    const batch = writeBatch(db);

    try {
        const tasksSnapshot = await getDocs(tasksCollectionRef);
        tasksSnapshot.forEach(taskDoc => {
            batch.delete(taskDoc.ref); // Delete original task
            batch.delete(doc(db, "taskIndex", taskDoc.id)); // Delete from index
        });
        batch.delete(sectionRef); // Delete the section itself
        await batch.commit();
    } catch (error) {
        console.error("Error deleting section:", error);
    }
}
// --- 8. RENDERING ---
const renderBoard = () => {
    if (!kanbanBoard) return;
    const { scrollLeft, scrollTop } = kanbanBoard;
    kanbanBoard.innerHTML = '';
    project.sections.forEach(renderColumn);

    if (userCanEditProject) {
        const addSectionEl = document.createElement('div');
        addSectionEl.className = 'boardtasks-add-section-placeholder';
        // This data-control attribute is used by the click handler
        addSectionEl.innerHTML = `
            <div class="boardtasks-add-section-content" data-control="add-section">
                <i class="fas fa-plus"></i>
                <span>Add new section</span>
            </div>
        `;
        kanbanBoard.appendChild(addSectionEl);
    }

    checkDueDates();
    // Only initialize drag-and-drop if the user has edit permissions.
    if (userCanEditProject) {
        initSortable();
    }

    if (addSectionBtn) {
        addTaskMainBtn.style.display = userCanEditProject ? '' : 'none';
        addSectionBtn.style.display = userCanEditProject ? '' : 'none';
    }

    kanbanBoard.scrollLeft = scrollLeft;
    kanbanBoard.scrollTop = scrollTop;
    if (taskIdToFocus) {
        requestAnimationFrame(() => {
            const taskInput = document.querySelector(`#task-${taskIdToFocus} .boardtasks-task-name-editable`);
            console.log("🔍 Attempting to focus on:", taskIdToFocus, taskInput);
            if (taskInput) {
                taskInput.focus();
                // Move cursor to end if needed
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(taskInput);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
            taskIdToFocus = null;
        });
    }

};

const renderColumn = (section) => {
    const columnEl = document.createElement('div');
    columnEl.className = 'boardtasks-kanban-column';
    columnEl.dataset.sectionId = section.id;

    const deleteIconHTML = userCanEditProject ? `
        <div class="boardtasks-section-menu-btn" data-control="delete-section" title="Delete Section">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide-icon-delete">
                <path d="M3 6h18"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" x2="10" y1="11" y2="17"/>
                <line x1="14" x2="14" y1="11" y2="17"/>
            </svg>
        </div>
    ` : '';

    columnEl.innerHTML = `
        <div class="boardtasks-column-header">
            <h3 contenteditable="${userCanEditProject}" class="boardtasks-section-title-editable">${section.title}</h3>
            <span class="boardtasks-task-count">${section.tasks.filter(t => !t.isNew).length}</span>
            ${deleteIconHTML}
         </div>
        <div class="boardtasks-tasks-container">${section.tasks.map(renderTask).join('')}</div>
        <button class="boardtasks-add-task-btn" style="display: ${userCanEditProject ? 'flex' : 'none'};"><i class="fas fa-plus"></i> Add task</button>`;
    kanbanBoard.appendChild(columnEl);
};

const renderTask = (task) => {
    const canEditThisTask = canUserEditSpecifcTask(task);
    const isEditable = canEditThisTask ? 'true' : 'false';

    if (task.isNew) {
        return `<div class="boardtasks-task-card is-new" id="task-${task.id}" data-task-id="${task.id}"><div class="boardtasks-task-content"><div class="boardtasks-task-header"><span class="boardtasks-task-check"><i class="fa-regular fa-circle"></i></span><p contenteditable="true" class="boardtasks-task-name-editable">\u200B</p></div></div></div>`;
    }

    const assigneesHTML = (task.assignees || []).map(uid => {
        const user = allUsers.find(u => u.uid === uid);
        return user ? `<img src="${user.avatar || 'https://via.placeholder.com/24'}" alt="${user.name}" class="boardtasks-assignee-avatar" title="${user.name}">` : '';
    }).join('');

    const oldestImageUrl = task.chatuuid ? taskImageMap[task.chatuuid] : null;
    const isCompleted = task.status === 'Completed';
    const cardCompletedClass = isCompleted ? 'boardtasks-task-checked' : '';
    const hasLiked = task.likedBy && task.likedBy[currentUserId];

    let coverImageHTML = '';
    const hasCoverImage = task.coverImage;
    const hasAttachmentImage = oldestImageUrl;

    if (canEditThisTask || hasCoverImage || hasAttachmentImage) {
        const menuIconHTML = canEditThisTask ? `
            <div class="boardtasks-cover-menu-btn" data-control="cover-menu">
                <i class="fas fa-ellipsis-h"></i>
            </div>
        ` : '';

        let imageContentHTML;
        if (hasCoverImage) {
            imageContentHTML = `<img src="${task.coverImage}" class="boardtasks-task-cover-image">`;
        } else if (hasAttachmentImage) {
            imageContentHTML = `<img src="${oldestImageUrl}" class="boardtasks-task-cover-image">`;
        } else {
            imageContentHTML = `<div class="boardtasks-task-cover-placeholder"></div>`;
        }

        coverImageHTML = `
            <div class="boardtasks-task-cover-container">
                ${imageContentHTML}
                ${menuIconHTML}
            </div>
        `;
    }


    let existingTagsHTML = '';

    const allSelectableColumns = [
        ...project.defaultColumns.filter(c => c.id === 'priority' || c.id === 'status'),
        ...project.customColumns.filter(c => c.type === 'Type' && c.options)
    ];

    // 1. Render existing tags as clickable elements
    allSelectableColumns.forEach(col => {
        const isDefault = col.id === 'priority' || col.id === 'status';
        const currentValue = isDefault ? task[col.id] : task.customFields?.[col.id];

        if (currentValue) {
            const currentOption = col.options.find(o => o.name === currentValue);
            const color = currentOption?.color || '#cccccc';
            existingTagsHTML += `
                <div class="boardtasks-tag-clickable" data-control="edit-tag" data-column-id="${col.id}">
                    <span class="boardtasks-tag" style="background-color:${color}20; color:${color};">${currentValue}</span>
                </div>
            `;
        }
    });

    // 2. Check if there are any empty fields left to add
    const hasEmptyFields = allSelectableColumns.some(col => {
        const isDefault = col.id === 'priority' || col.id === 'status';
        const currentValue = isDefault ? task[col.id] : task.customFields?.[col.id];
        return !currentValue;
    });

    // 3. Render the "Add Field" button ONLY if there are empty fields
    let addFieldButtonHTML = '';
    if (canEditThisTask) {
        addFieldButtonHTML = `
            <div class="boardtasks-edit-fields-btn" data-control="add-new-field">
                <i class="fa-solid fa-pencil fa-xs"></i>
                <span>Add fields</span>
            </div>
        `;
    }

    const dueDateInfo = formatDueDate(task.dueDate);

    return `
        <div class="boardtasks-task-card ${cardCompletedClass}" id="task-${task.id}" data-task-id="${task.id}" draggable="${isEditable}" data-control="open-sidebar">
            ${coverImageHTML}
            <div class="boardtasks-task-content">
                <div class="boardtasks-task-header">
                    <span class="boardtasks-task-check" style="pointer-events: ${isEditable ? 'auto' : 'none'};" data-control="check">
                        <i class="${isCompleted ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}"></i>
                    </span>
                    <p contenteditable="${isEditable}" class="boardtasks-task-name-editable">${task.name}</p>
                </div>
                <div class="boardtasks-task-tags">
                    ${existingTagsHTML}
                    ${addFieldButtonHTML}
                </div>
                
                <div class="boardtasks-meta-container">
                    <div class="boardtasks-meta-left">
                        <div class="boardtasks-task-assignees">${assigneesHTML}</div>
                        <span class="boardtasks-due-date" data-due-date="${task.dueDate}" data-color-name="${dueDateInfo.color}">${dueDateInfo.text}</span>
                    </div>
                    <div class="boardtasks-task-actions">
                        <i class="fa-regular fa-heart ${hasLiked ? 'liked' : ''}" title="Like" data-control="like"></i>
                        <i class="fa-regular fa-comment" title="Comment" data-control="open-sidebar"></i>
                    </div>
                </div>
            </div>
        </div>`;
};

// --- 9. DATA MODIFICATION & EVENT HANDLERS ---
/**
 * Creates a temporary task object in the local state and triggers a re-render.
 * This now includes all necessary default fields for a new task.
 * @param {object} section - The section object where the task will be added.
 */
function createTemporaryTask(section) {
    if (!section) {
        console.error("Cannot create task: The section provided is invalid.");
        return;
    }

    const tempId = `temp_${Date.now()}`;

    const newTask = {
        id: tempId,
        name: '',
        isNew: true,
        sectionId: section.id, // Keep the sectionId for proper handling
        dueDate: '',
        priority: '',
        status: '',
        assignees: [],
        customFields: {},
        order: section.tasks.length
    };

    section.tasks.push(newTask);
    taskIdToFocus = tempId;
    console.log('new add task', taskIdToFocus);

    // If the section is collapsed, expand it to show the new task.
    if (section.isCollapsed) {
        section.isCollapsed = false;
    }

    // Call the correct render function for your board.
    renderBoard();
}

async function addSectionToFirebase() {
    // Permission and path fix
    if (!userCanEditProject || !currentProjectRef) {
        return console.error("Permission denied or project reference missing.");
    }
    const sectionsCollectionRef = collection(currentProjectRef, 'sections');
    try {
        await addDoc(sectionsCollectionRef, { title: 'New Section', order: project.sections.length, createdAt: serverTimestamp() });
    } catch (error) { console.error("Error adding section:", error); }
}

async function addTaskToFirebase(sectionId, taskData) {
    if (!currentProjectRef || !sectionId || !project.id || !currentUserId) {
        return console.error("Cannot add task: missing essential context.");
    }

    const tasksCollectionRef = collection(currentProjectRef, `sections/${sectionId}/tasks`);
    const newTaskRef = doc(tasksCollectionRef);
    const taskIndexRef = doc(db, "taskIndex", newTaskRef.id);

    const fullTaskData = {
        ...taskData,
        id: newTaskRef.id,
        projectId: project.id,
        userId: currentUserId,
        sectionId: sectionId,
        createdAt: serverTimestamp()
    };

    const indexData = { ...fullTaskData, path: newTaskRef.path };

    const batch = writeBatch(db);
    batch.set(newTaskRef, fullTaskData);
    batch.set(taskIndexRef, indexData);

    try {
        await batch.commit();
        logActivity({ action: 'created this task', taskRef: newTaskRef });
    } catch (error) {
        console.error("Error adding task:", error);
    }
}

/**
 * Handles the cover image upload process for a specific task.
 * @param {object} task - The task object to update.
 */
function handleCoverImageUpload(task) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 1. Define the storage path as requested
        const filePath = `TaskboardCovers/${currentProjectId}/${task.id}/${file.name}`;
        const storageRef = ref(storage, filePath);

        try {
            // 2. Show a temporary uploading state (optional but good UX)
            // For example, you could add a class to the task card.

            // 3. Upload the file to Firebase Storage
            const snapshot = await uploadBytes(storageRef, file);

            // 4. Get the public URL for the uploaded image
            const downloadURL = await getDownloadURL(snapshot.ref);

            // 5. Update the task document in Firestore with the new image URL
            const taskRef = doc(currentProjectRef, `sections/${task.sectionId}/tasks/${task.id}`);
            await updateDoc(taskRef, {
                coverImage: downloadURL
            });

            console.log("Cover image updated successfully!");

        } catch (error) {
            console.error("Error uploading cover image:", error);
            alert("Failed to upload cover image. Please check the console for details.");
        }
    });

    document.body.appendChild(fileInput);
    fileInput.click();
    fileInput.remove();
}

/**
 * Removes the cover image URL from a task document in Firestore.
 * @param {object} task - The task object to update.
 */
async function removeCoverImage(task) {
    const taskRef = doc(currentProjectRef, `sections/${task.sectionId}/tasks/${task.id}`);
    try {
        // Use deleteField() to completely remove the coverImage property
        await updateDoc(taskRef, {
            coverImage: deleteField()
        });
        console.log("Cover image removed successfully!");
    } catch (error) {
        console.error("Error removing cover image:", error);
        alert("Failed to remove cover image.");
    }
}

const handleBlur = async (e) => {
    // Only proceed if the event target is an editable field
    if (!e.target.isContentEditable) return;

    const taskCard = e.target.closest('.boardtasks-task-card.is-new');

    if (taskCard) {
        const newName = e.target.textContent.trim();
        const tempId = taskCard.dataset.taskId; // Get the temporary ID
        const sectionEl = taskCard.closest('.boardtasks-kanban-column');
        if (!sectionEl) return;

        const sectionId = sectionEl.dataset.sectionId;
        const section = findSection(sectionId);
        if (!section) return;

        if (newName) {
            // --- SAVE LOGIC ---
            const taskIndex = section.tasks.findIndex(t => t.id === tempId);
            if (taskIndex > -1) {
                section.tasks.splice(taskIndex, 1);
            }

            const order = section.tasks.length - 1; // Get order before it might change
            const taskData = {
                name: newName,
                order: order,
                priority: '',
                status: '',
                assignees: [],
                customFields: {}
            };

            // Call the dedicated function to save the task
            await addTaskToFirebase(sectionId, taskData);

        } else {
            // --- CANCEL LOGIC ---
            // If the name is empty, remove the temporary task from the local data array...
            const taskIndex = section.tasks.findIndex(t => t.id === tempId);
            if (taskIndex > -1) {
                section.tasks.splice(taskIndex, 1);
            }
            // ...and re-render the board to make the empty card disappear.
            renderBoard();
        }
        return;
    }

    // --- Logic for updating EXISTING tasks/sections (remains the same) ---
    const existingTaskCard = e.target.closest('.boardtasks-task-card');
    const sectionHeader = e.target.closest('.boardtasks-column-header');

    if (existingTaskCard) {
        const { task, section } = findTaskAndSection(existingTaskCard.dataset.taskId);
        if (!task) return;
        const taskRef = doc(currentProjectRef, `sections/${section.id}/tasks/${task.id}`);
        const updatedName = e.target.textContent.trim();
        if (task.name !== updatedName) {
            await updateDoc(taskRef, { name: updatedName });
        }
    } else if (sectionHeader) {
        if (!userCanEditProject) return;
        const sectionId = sectionHeader.closest('.boardtasks-kanban-column').dataset.sectionId;
        const section = findSection(sectionId);
        const newTitle = e.target.textContent.trim();
        if (section.title !== newTitle) {
            const sectionRef = doc(currentProjectRef, `sections/${sectionId}`);
            await updateDoc(sectionRef, { title: newTitle });
        }
    }
};

const handleKanbanClick = (e) => {
    // This part for the column's "Add task" button is fine
    if (e.target.closest('.boardtasks-add-task-btn')) {
        createTemporaryTask(findSection(e.target.closest('.boardtasks-kanban-column').dataset.sectionId));
        return;
    }

    const control = e.target.closest('[data-control]');
    if (!control) return;

    const controlType = control.dataset.control;

    if (controlType === 'delete-section') {
        e.stopPropagation();
        const columnEl = control.closest('.boardtasks-kanban-column');
        const sectionId = columnEl.dataset.sectionId;
        deleteSection(sectionId); // This calls the delete function
        return; // IMPORTANT: Stop execution here
    }

    if (controlType === 'add-section') {
        addSectionToFirebase(); // This calls your existing function
        return;
    }

    // --- All code below this point is for TASK-LEVEL actions ---
    const taskCard = control.closest('.boardtasks-task-card');
    if (!taskCard) return; // If it's not a section action, it MUST be a task action

    const taskId = taskCard.dataset.taskId;
    const { task, section } = findTaskAndSection(taskId);
    if (!task) return;

    // Use a switch statement to perform the correct action.
    switch (controlType) {
        case 'open-sidebar':
            // This is the default action for the card itself and the comment icon.
            displaySideBarTasks(taskId, currentProjectRef);
            break;

        case 'add-new-field':
            e.stopPropagation();
            showInlineTagEditor(task, control);
            break;

        case 'cover-menu': {
            e.stopPropagation();

            // Determine which images are present for this task
            const hasCoverImage = !!task.coverImage;
            const oldestImageUrl = task.chatuuid ? taskImageMap[task.chatuuid] : null;
            const hasAnyImage = hasCoverImage || oldestImageUrl;

            // Start with the default option
            const menuOptions = [{ id: 'change-cover', name: 'Upload Cover' }];

            if (hasCoverImage) {
                menuOptions.push({ id: 'remove-cover', name: 'Remove Cover' });
            }

            createAdvancedDropdown(control, {
                options: menuOptions,
                itemRenderer: (option) => `<span>${option.name}</span>`,
                onSelect: (selected) => {
                    if (selected.id === 'change-cover') {
                        handleCoverImageUpload(task);
                    } else if (selected.id === 'remove-cover') {
                        removeCoverImage(task);
                    }
                }
            });
            break;
        }

        case 'edit-tag': {
            e.stopPropagation();
            const columnId = control.dataset.columnId;

            const allColumns = [...project.defaultColumns, ...project.customColumns];
            const column = allColumns.find(c => String(c.id) === String(columnId));

            if (!column || !column.options) return;

            const taskRef = doc(currentProjectRef, `sections/${section.id}/tasks/${task.id}`);

            createAdvancedDropdown(control, {
                options: column.options,
                itemRenderer: (option) => `<div class="dropdown-color-swatch" style="background-color: ${option.color || '#ccc'}"></div><span>${option.name}</span>`,
                onSelect: (selected) => {
                    const isDefault = column.id === 'priority' || column.id === 'status';
                    const fieldToUpdate = isDefault
                        ? { [column.id]: selected.name }
                        : { [`customFields.${column.id}`]: selected.name };

                    updateDoc(taskRef, fieldToUpdate);
                }
            });
            break;
        }

        case 'delete-section': {
            e.stopPropagation();
            const columnEl = control.closest('.boardtasks-kanban-column');
            const sectionId = columnEl.dataset.sectionId;
            deleteSection(sectionId); // Calls the delete function
            break;
        }

        case 'check':
            // Stop the event from bubbling up to the card, which would also open the sidebar.
            e.stopPropagation();

            // Check for permission before allowing the action.
            if (canUserEditSpecifcTask(task)) {
                handleTaskCompletion(task, taskCard);
            }
            break;

        case 'like': {
            e.stopPropagation();
            const taskRef = doc(currentProjectRef, `sections/${section.id}/tasks/${task.id}`);
            const taskIndexRef = doc(db, "taskIndex", task.id);
            const hasLiked = task.likedBy && task.likedBy[currentUserId];
            const propertiesToUpdate = {
                likedAmount: increment(hasLiked ? -1 : 1),
                [`likedBy.${currentUserId}`]: hasLiked ? deleteField() : true
            };
            const batch = writeBatch(db);
            batch.update(taskRef, propertiesToUpdate);
            batch.update(taskIndexRef, propertiesToUpdate);
            batch.commit().catch(err => console.error("Like update failed:", err));
            break;
        }
    }

};

const handleFilterInput = (e) => {
    const searchTerm = e.target.value.toLowerCase();
    document.querySelectorAll('.boardtasks-task-card').forEach(card => {
        const taskText = card.querySelector('.boardtasks-task-name-editable').textContent.toLowerCase();
        card.style.display = taskText.includes(searchTerm) ? '' : 'none';
    });
};
const handleAddTaskMainClick = () => project.sections.length > 0 ? createTemporaryTask(project.sections[0]) : alert("Please add a section first!");
const handleKanbanKeydown = (e) => {
    if (e.key === 'Enter' && e.target.isContentEditable) {
        e.preventDefault();
        e.target.blur();
    }
};

// --- 10. DRAG & DROP & SORTING ---
const initSortable = () => {
    sortableInstances.forEach(s => s.destroy());
    sortableInstances = [];
    if (kanbanBoard) sortableInstances.push(new Sortable(kanbanBoard, { group: 'columns', animation: 150, filter: '.boardtasks-task-check, .boardtasks-task-name-editable, .boardtasks-task-actions, .boardtasks-task-tags', handle: '.boardtasks-column-header', onEnd: handleSectionReorder }));
    document.querySelectorAll('.boardtasks-tasks-container').forEach(c => {
        sortableInstances.push(new Sortable(c, { group: 'tasks', animation: 150, onStart: () => isMovingTask = true, onEnd: handleTaskMoved }));
    });
};

async function sortSections(isAsc) {
    const sortedSections = [...project.sections].sort((a, b) => isAsc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title));
    const batch = writeBatch(db);
    sortedSections.forEach((s, index) => {
        const sectionRef = doc(currentProjectRef, `sections/${s.id}`);
        batch.update(sectionRef, { order: index });
    });
    try { await batch.commit(); } catch (e) { console.error("Error sorting sections:", e); }
}

async function sortAllTasks(isAsc) {
    const batch = writeBatch(db);
    project.sections.forEach(section => {
        [...section.tasks].sort((a, b) => isAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))
            .forEach((task, index) => {
                if (task.isNew) return;
                const taskRef = doc(currentProjectRef, `sections/${section.id}/tasks/${task.id}`);
                batch.update(taskRef, { order: index });
            });
    });
    try { await batch.commit(); } catch (e) { console.error("Error sorting tasks:", e); }
}

async function handleSectionReorder(evt) {
    isMovingTask = true;
    const batch = writeBatch(db);
    document.querySelectorAll('.boardtasks-kanban-column').forEach((el, index) => {
        const sectionRef = doc(currentProjectRef, `sections/${el.dataset.sectionId}`);
        batch.update(sectionRef, { order: index });
    });
    try { await batch.commit(); } catch (e) { console.error("Failed to reorder sections:", e); }
    isMovingTask = false;
}

async function handleTaskMoved(evt) {
    const { item, from, to } = evt;
    const taskId = item.dataset.taskId;
    if (taskId.startsWith('temp_')) {
        renderBoard();
        isMovingTask = false;
        return;
    }

    const oldSectionId = from.closest('.boardtasks-kanban-column').dataset.sectionId;
    const newSectionId = to.closest('.boardtasks-kanban-column').dataset.sectionId;
    const batch = writeBatch(db);

    try {
        if (oldSectionId === newSectionId) {
            to.querySelectorAll('.boardtasks-task-card').forEach((taskEl, index) => {
                batch.update(doc(currentProjectRef, `sections/${newSectionId}/tasks/${taskEl.dataset.taskId}`), { order: index });
            });
        } else {
            const taskSnap = await getDoc(doc(currentProjectRef, `sections/${oldSectionId}/tasks/${taskId}`));
            if (!taskSnap.exists()) throw new Error("Source task not found!");

            const newTaskRef = doc(currentProjectRef, `sections/${newSectionId}/tasks/${taskId}`);
            batch.set(newTaskRef, { ...taskSnap.data(), sectionId: newSectionId });
            batch.delete(taskSnap.ref);

            to.querySelectorAll('.boardtasks-task-card').forEach((el, i) => batch.update(doc(currentProjectRef, `sections/${newSectionId}/tasks/${el.dataset.taskId}`), { order: i }));
            from.querySelectorAll('.boardtasks-task-card').forEach((el, i) => batch.update(doc(currentProjectRef, `sections/${oldSectionId}/tasks/${el.dataset.taskId}`), { order: i }));
        }
        await batch.commit();
    } catch (e) {
        console.error("Error moving task:", e);
        renderBoard();
    }
    isMovingTask = false;
}

/**
 * Closes any currently open inline tag editor or floating dropdown panel.
 */
function closeFloatingPanels() {
    document.querySelectorAll('.advanced-dropdown, .inline-tag-editor').forEach(p => p.remove());
    if (activeInlineEditor.element) {
        activeInlineEditor.element = null;
        activeInlineEditor.taskId = null;
        document.removeEventListener('click', handleClickOutsideEditor, true);
    }
}

/**
 * Closes the inline editor if a click occurs outside of it.
 */
function handleClickOutsideEditor(event) {
    if (activeInlineEditor.element && !activeInlineEditor.element.contains(event.target)) {
        // Also check if the click was inside a dropdown opened by the editor
        if (!event.target.closest('.advanced-dropdown')) {
            closeFloatingPanels();
        }
    }
}

function showInlineTagEditor(task, anchorElement) {
    closeFloatingPanels();

    const editorPanel = document.createElement('div');
    editorPanel.className = 'inline-tag-editor';
    document.body.appendChild(editorPanel);

    activeInlineEditor.taskId = task.id;
    activeInlineEditor.element = editorPanel;

    const createEditorRow = (label, onClick) => {
        const row = document.createElement('div');
        row.className = 'editor-row';
        row.innerHTML = `<span class="editor-label">${label}</span>`;
        row.addEventListener('click', () => onClick(row));
        return row;
    };

    const taskRef = doc(currentProjectRef, `sections/${task.sectionId}/tasks/${task.id}`);

    // Define all columns that can be added
    const allSelectableColumns = [
        ...project.defaultColumns.filter(c => c.id === 'priority' || c.id === 'status'),
        ...project.customColumns.filter(c => c.type === 'Type' && c.options)
    ];

    const emptyFieldsToAdd = allSelectableColumns.filter(col => {
        const isDefault = col.id === 'priority' || col.id === 'status';
        const currentValue = isDefault ? task[col.id] : task.customFields?.[col.id];
        return !currentValue; // Return true only if the value is missing
    });

    if (emptyFieldsToAdd.length > 0) {
        // Loop through the list of empty fields and create a row for each one.
        emptyFieldsToAdd.forEach(col => {
            const editorRow = createEditorRow(col.name, (rowAnchor) => {
                createAdvancedDropdown(rowAnchor, {
                    options: col.options, // Show all possible values for this field
                    itemRenderer: (option) => `<div class="dropdown-color-swatch" style="background-color: ${option.color || '#ccc'}"></div><span>${option.name}</span>`,
                    onSelect: (selected) => {
                        const isDefault = col.id === 'priority' || col.id === 'status';
                        const fieldToUpdate = isDefault
                            ? { [col.id]: selected.name }
                            : { [`customFields.${col.id}`]: selected.name };

                        updateDoc(taskRef, fieldToUpdate);
                        closeFloatingPanels();
                    }
                });
            });
            editorPanel.appendChild(editorRow);
        });
    } else {
        editorPanel.innerHTML = `<div class="editor-no-fields">All fields have been added.</div>`;
    }

    // Positioning Logic
    const rect = anchorElement.getBoundingClientRect();
    editorPanel.style.position = 'fixed';
    editorPanel.style.visibility = 'hidden';

    setTimeout(() => {
        const panelWidth = editorPanel.offsetWidth;
        const panelHeight = editorPanel.offsetHeight;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        if (spaceBelow < panelHeight && spaceAbove > panelHeight) {
            editorPanel.style.top = `${rect.top - panelHeight - 4}px`;
        } else {
            editorPanel.style.top = `${rect.bottom + 4}px`;
        }

        let left = rect.right - panelWidth;
        if (left < 4) left = 4;
        editorPanel.style.left = `${left}px`;

        editorPanel.style.visibility = 'visible';
    }, 0);

    setTimeout(() => {
        document.addEventListener('click', handleClickOutsideEditor, true);
    }, 0);
}

function createAdvancedDropdown(targetEl, config) {
    document.querySelectorAll('.advanced-dropdown').forEach(el => el.remove());

    const dropdown = document.createElement('div');
    dropdown.className = 'advanced-dropdown';
    document.body.appendChild(dropdown);

    const closeDropdown = () => {
        dropdown.remove();
        document.removeEventListener('click', clickOutsideHandler, true);
        if (config.onClose) {
            config.onClose();
        }
    };

    const clickOutsideHandler = (event) => {
        if (!dropdown.contains(event.target) && !targetEl.contains(event.target)) {
            closeDropdown();
        }
    };
    setTimeout(() => document.addEventListener('click', clickOutsideHandler, true), 0);

    const listContainer = document.createElement('ul');
    listContainer.className = 'dropdown-list';
    dropdown.appendChild(listContainer);

    config.options.forEach(option => {
        const li = document.createElement('li');
        li.className = 'dropdown-item';
        li.innerHTML = config.itemRenderer(option);
        li.addEventListener('click', (e) => {
            e.stopPropagation();
            config.onSelect(option);
            dropdown.remove();
        });
        listContainer.appendChild(li);
    });

    setTimeout(() => {
        const rect = targetEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            console.error("Dropdown target is not visible:", targetEl);
            dropdown.remove();
            return;
        }

        dropdown.style.minWidth = `${rect.width}px`;
        dropdown.style.visibility = 'hidden';
        dropdown.style.top = '-9999px';
        dropdown.style.left = '-9999px';

        requestAnimationFrame(() => {
            const dropdownHeight = dropdown.offsetHeight;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            // ✅ **FIX: Changed incorrect 'panelHeight' variable to 'dropdownHeight'**
            if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
                dropdown.style.top = `${rect.top - dropdownHeight - 4}px`;
            } else {
                dropdown.style.top = `${rect.bottom + 4}px`;
            }

            dropdown.style.left = `${rect.left}px`;
            dropdown.style.visibility = 'visible';
            dropdown.classList.add('visible');
        });
    }, 0);
}

// --- 11. EXPORT ---
export { init };