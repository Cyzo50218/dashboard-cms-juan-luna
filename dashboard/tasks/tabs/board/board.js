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

import { firebaseConfig } from "/services/firebase-config.js";

// Initialize Firebase
console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
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
async function handleTaskCompletion(task, taskCardEl) {
    if (!task || !currentProjectRef) {
        console.error("Task data or project reference is missing.");
        return;
    }
    
    const taskId = task.id;
    const batch = writeBatch(db);
    const isCurrentlyCompleted = task.status === 'Completed';
    
    if (isCurrentlyCompleted) {
        // --- LOGIC FOR UN-COMPLETING A TASK ---
        
        // Find the section where the task should return. Use its 'previousSectionId' if it exists,
        // otherwise, assume it goes back to the first non-completed section.
        const targetSectionId = task.previousSectionId || project.sections.find(s => s.sectionType !== 'completed')?.id;
        if (!targetSectionId) {
            console.error("Cannot un-complete task: No target section found.");
            return;
        }
        
        const sourceTaskRef = doc(currentProjectRef, `sections/${task.sectionId}/tasks/${taskId}`);
        const targetTaskRef = doc(currentProjectRef, `sections/${targetSectionId}/tasks/${taskId}`);
        
        // Prepare the restored task data, removing the 'previous' fields
        const { previousStatus, previousSectionId, ...restOfTask } = task;
        const restoredTaskData = {
            ...restOfTask,
            status: previousStatus || 'On track', // Restore previous status or a default
            sectionId: targetSectionId,
        };
        
        // Move the task by deleting the old and setting the new
        batch.delete(sourceTaskRef);
        batch.set(targetTaskRef, restoredTaskData);
        
    } else {
        // --- LOGIC FOR COMPLETING A TASK ---
        
        // Find the project's designated "Completed" section
        const completedSection = project.sections.find(s => s.sectionType === 'completed');
        if (!completedSection) {
            console.error("Cannot complete task: A section with sectionType: 'completed' was not found.");
            alert("Please create a 'Completed' section in your project settings to use this feature.");
            return;
        }
        
        const sourceTaskRef = doc(currentProjectRef, `sections/${task.sectionId}/tasks/${taskId}`);
        const targetTaskRef = doc(currentProjectRef, `sections/${completedSection.id}/tasks/${taskId}`);
        
        // Prepare the new task data, saving its current state before marking as completed
        const updatedTaskData = {
            ...task,
            status: 'Completed',
            previousStatus: task.status, // Remember the original status
            previousSectionId: task.sectionId, // Remember the original section
            sectionId: completedSection.id, // Set the new section
        };
        
        // Move the task
        batch.delete(sourceTaskRef);
        batch.set(targetTaskRef, updatedTaskData);
    }
    
    // --- Execute the batch update ---
    try {
        await batch.commit();
        console.log(`Task ${taskId} completion status updated successfully.`);
        // Note: The real-time listener will automatically call renderBoard(),
        // so no manual re-render is needed here.
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

function attachRealtimeListeners(userId) {
    detachAllListeners();
    currentUserId = userId;

    const userDocRef = doc(db, 'users', userId);
    activeListeners.user = onSnapshot(userDocRef, (userSnap) => {
        if (!userSnap.exists()) {
            detachAllListeners();
            return;
        }

        const newWorkspaceId = userSnap.data().selectedWorkspace;
        if (newWorkspaceId === currentWorkspaceId) return;

        currentWorkspaceId = newWorkspaceId;

        if (activeListeners.workspace) activeListeners.workspace();
        detachProjectSpecificListeners();

        if (!currentWorkspaceId) {
            project = { sections: [] };
            renderBoard();
            return;
        }

        // ✅ UPDATED: Listen to the new membership document path
        const memberDocRef = doc(db, `workspaces/${currentWorkspaceId}/members`, userId);
        activeListeners.workspace = onSnapshot(memberDocRef, async (memberDocSnap) => {
            if (!memberDocSnap.exists()) {
                project = { sections: [] };
                renderBoard();
                return;
            }

            const memberData = memberDocSnap.data();
            const newProjectId = memberData?.selectedProjectId;
            // ✅ GET VISIBILITY: Default to 'private' for safety
            const visibility = memberData?.selectedProjectWorkspaceVisibility || 'private';

            if (newProjectId === currentProjectId) return;

            currentProjectId = newProjectId;
            detachProjectSpecificListeners();

            if (!currentProjectId) {
                project = { sections: [] };
                renderBoard();
                return;
            }

            // ✅ NEW VISIBILITY CHECK
            const canAttemptLoad = ['workspace', 'viewer', 'private'].includes(visibility);
            if (!canAttemptLoad) {
                console.warn(`Access denied by visibility setting: '${visibility}'`);
                project = { sections: [] };
                renderBoard();
                return;
            }

            try {
                // This query securely finds the project and enforces membership
                const projectQuery = query(
                    collectionGroup(db, 'projects'),
                    where('projectId', '==', currentProjectId),
                    where('memberUIDs', 'array-contains', currentUserId)
                );
                const projectSnapshot = await getDocs(projectQuery);

                if (projectSnapshot.empty) {
                    project = { sections: [] };
                    renderBoard();
                    return;
                }
                
                currentProjectRef = projectSnapshot.docs[0].ref;
                
                activeListeners.project = onSnapshot(currentProjectRef, async (projectDetailSnap) => {
                    if (!projectDetailSnap.exists()) return;
                    
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
                    
                    // ... (previous code) ...

                    const tasksQuery = query(collectionGroup(db, 'tasks'), where('projectId', '==', project.projectId));
                    activeListeners.tasks = onSnapshot(tasksQuery, (snapshot) => {
                        allTasksFromSnapshot = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                        distributeTasksToSections(allTasksFromSnapshot);
                        if (!isMovingTask) renderBoard();
                    });

                    // --- CORRECTED MESSAGES QUERY AND PROCESSING ---
                    // The collectionGroup(db, 'Messages') is generally correct for querying
                    // messages across all task chats. The key is to filter by projectId
                    // and then correctly extract the taskId and oldest image.
                    const messagesQuery = query(
                        collectionGroup(db, 'Messages'),
                        where('imageUrl', '!=', null)
                    );

                    activeListeners.messages = onSnapshot(messagesQuery, (snapshot) => {
                        const newImageMap = {};
                        snapshot.forEach(doc => {
                            const data = doc.data();
                            const pathSegments = doc.ref.path.split('/');
                            // Find the index of 'globalTaskChats' in the path
                            const globalTaskChatsIndex = pathSegments.indexOf('globalTaskChats');

                            // Ensure 'globalTaskChats' is in the path and there's a segment after it (the taskId)
                            if (globalTaskChatsIndex === -1 || pathSegments.length <= globalTaskChatsIndex + 1) {
                                return; // Not a message within a globalTaskChat, or malformed path
                            }

                            // The segment *after* 'globalTaskChats' should be the taskId
                            const taskIdFromPath = pathSegments[globalTaskChatsIndex + 1];

                            // Now, we need to verify this taskId belongs to a task within the current project.
                            // You already have allTasksFromSnapshot. Find if this taskId exists in your current project.
                            const taskBelongsToCurrentProject = allTasksFromSnapshot.some(task => task.id === taskIdFromPath);

                            // Only process if the task belongs to the current project and has image/timestamp data
                            if (taskBelongsToCurrentProject && data.imageUrl && data.timestamp) {
                                const existing = newImageMap[taskIdFromPath];
                                // Keep the image with the *oldest* timestamp for each taskId
                                if (!existing || data.timestamp.toMillis() < existing.timestamp.toMillis()) {
                                    newImageMap[taskIdFromPath] = {
                                        imageUrl: data.imageUrl,
                                        timestamp: data.timestamp
                                    };
                                }
                            }
                        });
                        taskImageMap = Object.fromEntries(
                            Object.entries(newImageMap).map(([key, value]) => [key, value.imageUrl])
                        );
                        renderBoard();
                    });
                });
            } catch (error) {
                console.error("Error attaching listeners:", error);
            }
        });
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

// --- 8. RENDERING ---
const renderBoard = () => {
    if (!kanbanBoard) return;
    const { scrollLeft, scrollTop } = kanbanBoard;
    kanbanBoard.innerHTML = '';
    project.sections.forEach(renderColumn);
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
        const taskInput = document.querySelector(`#task-${taskIdToFocus} .boardtasks-task-name-editable`);
        if (taskInput) {
            taskInput.focus();
            document.execCommand('selectAll', false, null);
        }
        taskIdToFocus = null;
    }
};

const renderColumn = (section) => {
    const columnEl = document.createElement('div');
    columnEl.className = 'boardtasks-kanban-column';
    columnEl.dataset.sectionId = section.id;
    
    columnEl.innerHTML = `
        <div class="boardtasks-column-header">
            <h3 contenteditable="${userCanEditProject}" class="boardtasks-section-title-editable">${section.title}</h3>
            <span class="boardtasks-task-count">${section.tasks.filter(t => !t.isNew).length}</span>
        </div>
        <div class="boardtasks-tasks-container">${section.tasks.map(renderTask).join('')}</div>
        <button class="boardtasks-add-task-btn" style="display: ${userCanEditProject ? 'flex' : 'none'};"><i class="fas fa-plus"></i> Add task</button>`;
    kanbanBoard.appendChild(columnEl);
};

const renderTask = (task) => {
    const canEditThisTask = canUserEditSpecifcTask(task);
    const isEditable = canEditThisTask ? 'true' : 'false';
    
    if (task.isNew) {
        return `
            <div class="boardtasks-task-card is-new" id="task-${task.id}" data-task-id="${task.id}">
                <div class="boardtasks-task-content">
                    <div class="boardtasks-task-header">
                        <span class="boardtasks-task-check"><i class="fa-regular fa-circle"></i></span>
                        <p contenteditable="true" class="boardtasks-task-name-editable"></p>
                    </div>
                </div>
            </div>`;
    }
    
    const assigneesHTML = (task.assignees || []).map(uid => {
        const user = allUsers.find(u => u.uid === uid);
        return user ? `<img src="${user.avatar || 'https://via.placeholder.com/24'}" alt="${user.name}" class="boardtasks-assignee-avatar" title="${user.name}">` : '';
    }).join('');
    
    const oldestImageUrl = task.chatuuid ? taskImageMap[task.chatuuid] : null;
    const isCompleted = task.status === 'Completed';
    const cardCompletedClass = isCompleted ? 'boardtasks-task-checked' : '';
    const hasLiked = task.likedBy && task.likedBy[currentUserId];
    
    // --- DYNAMIC TAG GENERATION LOGIC ---
    
    // 1. PRIORITY TAG
    let priorityTagHTML = '';
    const priorityName = task.priority;
    if (priorityName) {
        const priorityColumn = project.defaultColumns.find(c => c.id === 'priority');
        const option = priorityColumn?.options?.find(p => p.name === priorityName);
        const color = option?.color;
        
        if (color) {
            const style = `background-color: ${color}20; color: ${color};`;
            priorityTagHTML = `<span class="boardtasks-tag" style="${style}">${priorityName}</span>`;
        } else {
            priorityTagHTML = `<span class="boardtasks-tag">${priorityName}</span>`;
        }
    }
    
    // 2. STATUS TAG
    let statusTagHTML = '';
    const statusName = task.status || 'No Status';
    if (statusName) {
        const statusColumn = project.defaultColumns.find(c => c.id === 'status');
        const option = statusColumn?.options?.find(s => s.name === statusName);
        const color = option?.color;
        
        if (color) {
            const style = `background-color: ${color}20; color: ${color};`;
            statusTagHTML = `<span class="boardtasks-tag" style="${style}">${statusName}</span>`;
        } else {
            statusTagHTML = `<span class="boardtasks-tag">${statusName}</span>`;
        }
    }
    
    // 3. CUSTOM "TYPE" TAGS
    let customTypeTagsHTML = '';
    if (project.customColumns && task.customFields) {
        const typeColumns = project.customColumns.filter(col => col.type === 'Type');
        typeColumns.forEach(col => {
            const valueName = task.customFields[col.id];
            if (valueName && col.options) {
                const selectedOption = col.options.find(opt => opt.name === valueName);
                if (selectedOption && selectedOption.color) {
                    const style = `background-color: ${selectedOption.color}20; color: ${selectedOption.color};`;
                    customTypeTagsHTML += `<span class="boardtasks-tag" style="${style}">${valueName}</span>`;
                }
            }
        });
    }
    
    const dueDateInfo = formatDueDate(task.dueDate);
    
    // --- FINAL HTML TEMPLATE ---
    return `
        <div class="boardtasks-task-card ${cardCompletedClass}" id="task-${task.id}" data-task-id="${task.id}" draggable="${isEditable}" data-control="open-sidebar">
            ${oldestImageUrl ? `<img src="${oldestImageUrl}" class="boardtasks-task-attachment">` : ''}
            <div class="boardtasks-task-content">
                <div class="boardtasks-task-header">
                    <span class="boardtasks-task-check" style="pointer-events: ${isEditable ? 'auto' : 'none'};" data-control="check">
                        <i class="${isCompleted ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}"></i>
                    </span>
                    <p contenteditable="${isEditable}" class="boardtasks-task-name-editable">${task.name}</p>
                </div>
                <div class="boardtasks-task-assignees">${assigneesHTML}</div>
                <div class="boardtasks-task-tags">
                    ${priorityTagHTML}
                    ${statusTagHTML}
                    ${customTypeTagsHTML}
                </div>
                <div class="boardtasks-task-footer">
                    <span class="boardtasks-due-date" data-due-date="${task.dueDate}" data-color-name="${dueDateInfo.color}">${dueDateInfo.text}</span>
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
    
    // ✅ NEW: Create a complete task object with all default fields.
    const newTask = {
        id: tempId,
        name: '',
        isNew: true,
        sectionId: section.id, // Keep the sectionId for proper handling
        dueDate: '',
        priority: 'Low',
        status: 'On track',
        assignees: [],
        customFields: {},
        order: section.tasks.length
    };
    
    section.tasks.push(newTask);
    taskIdToFocus = tempId;
    
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

/**
 * Saves a new task document to the correct subcollection in Firestore.
 * @param {string} sectionId - The ID of the section to add the task to.
 * @param {object} taskData - An object containing the core task details like name, order, etc.
 */
async function addTaskToFirebase(sectionId, taskData) {
    // ✅ Log 1: Announce that the function has been called and show the initial data.
    console.log("[addTaskToFirebase] Function called with:", { sectionId, taskData });
    
    // ✅ Log 2: Check the critical context variables needed for the operation.
    console.log("[addTaskToFirebase] Checking context state:", {
        currentProjectRef_path: currentProjectRef?.path,
        currentProjectId,
        currentUserId
    });
    
    // 1. Ensure we have the necessary context to build the path.
    if (!currentProjectRef || !sectionId || !currentProjectId || !currentUserId) {
        // ✅ Log 3: If any context is missing, log a critical error and stop.
        console.error("❌ CRITICAL ERROR: Cannot add task because essential context is missing.", {
            hasProjectRef: !!currentProjectRef,
            hasSectionId: !!sectionId,
            hasProjectId: !!currentProjectId,
            hasUserId: !!currentUserId
        });
        return;
    }
    
    // Build the path to the 'tasks' subcollection.
    const sectionRef = doc(currentProjectRef, 'sections', sectionId);
    const tasksCollectionRef = collection(sectionRef, 'tasks');
    
    // ✅ Log 4: Show the exact path we are trying to write to.
    console.log(`[addTaskToFirebase] Attempting to write to path: ${tasksCollectionRef.path}`);
    
    try {
        const newTaskRef = doc(tasksCollectionRef); // Create a reference to get the ID
        
        // Prepare the complete data object that will be saved.
        const fullTaskData = {
            ...taskData,
            id: newTaskRef.id,
            projectId: currentProjectId,
            userId: currentUserId,
            sectionId: sectionId,
            createdAt: serverTimestamp()
        };
        
        // ✅ Log 5: Display the final data object just before the save attempt.
        console.log("[addTaskToFirebase] Preparing to save final data object:", fullTaskData);
        
        // The actual save operation.
        await setDoc(newTaskRef, fullTaskData);
        
        // ✅ Log 6: This will ONLY run if the await setDoc() line completes without throwing an error.
        console.log(`✅ SUCCESS: Firestore reported success for adding task with ID: ${newTaskRef.id}`);
        
    } catch (error) {
        // ✅ Log 7: If `await setDoc()` fails for any reason (e.g., security rules), this block will run.
        console.error("❌ FIRESTORE ERROR: Error adding task:", error);
        alert("A database error occurred while trying to save the task. Please check the console and your security rules.");
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
                priority: 'Low',
                status: 'On track',
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
    if (e.target.closest('.boardtasks-add-task-btn')) {
        createTemporaryTask(findSection(e.target.closest('.boardtasks-kanban-column').dataset.sectionId));
        return;
    }
    
    const control = e.target.closest('[data-control]');
    if (!control) return; // If the click was not on a designated control, do nothing.
    
    // Find the parent task card to get the task's context.
    const taskCard = control.closest('.boardtasks-task-card');
    if (!taskCard) return;
    
    const taskId = taskCard.dataset.taskId;
    const { task, section } = findTaskAndSection(taskId);
    if (!task) return;
    
    // Get the specific action type from the data-control attribute.
    const controlType = control.dataset.control;
    
    // Use a switch statement to perform the correct action.
    switch (controlType) {
        case 'open-sidebar':
            // This is the default action for the card itself and the comment icon.
            displaySideBarTasks(taskId, currentProjectRef);
            break;
            
        case 'check':
            // Stop the event from bubbling up to the card, which would also open the sidebar.
            e.stopPropagation();
            
            // Check for permission before allowing the action.
            if (canUserEditSpecifcTask(task)) {
                handleTaskCompletion(task, taskCard);
            }
            break;
            
        case 'like':
            // Stop the event from bubbling up.
            e.stopPropagation();
            
            // Liking is allowed for all roles.
            const taskRef = doc(currentProjectRef, `sections/${section.id}/tasks/${task.id}`);
            const hasLiked = task.likedBy && task.likedBy[currentUserId];
            
            updateDoc(taskRef, {
                likedAmount: increment(hasLiked ? -1 : 1),
                [`likedBy.${currentUserId}`]: hasLiked ? deleteField() : true
            });
            break;
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

// --- 11. EXPORT ---
export { init };