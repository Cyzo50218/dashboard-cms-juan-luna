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
    deleteField ,
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
let activeListeners = { sections: null, tasks: null, messages: null };

let project = { id: null, sections: [] };
let allUsers = [];
let allTasksFromSnapshot = [];
let taskImageMap = {};

let currentUserId = null;
let currentWorkspaceId = null;
let currentProjectId = null;
let taskIdToFocus = null;
let isMovingTask = false;

// --- 5. HELPER & UTILITY FUNCTIONS (Defined Before Use) ---

async function fetchActiveIds(userId) {
    const workspaceQuery = query(collection(db, `users/${userId}/myworkspace`), where("isSelected", "==", true), limit(1));
    const workspaceSnapshot = await getDocs(workspaceQuery);
    if (workspaceSnapshot.empty) {
        console.warn("No selected workspace found for this user.");
        return { workspaceId: null, projectId: null };
    }
    const workspaceId = workspaceSnapshot.docs[0].id;
    
    const projectQuery = query(collection(db, `users/${userId}/myworkspace/${workspaceId}/projects`), where("isSelected", "==", true), limit(1));
    const projectSnapshot = await getDocs(projectQuery);
    if (projectSnapshot.empty) {
        console.warn("No selected project found for this workspace.");
        return { workspaceId, projectId: null };
    }
    const projectId = projectSnapshot.docs[0].id;
    return { workspaceId, projectId };
}

async function fetchProjectMembers(userId, workspaceId, projectId) {
    if (!userId || !workspaceId || !projectId) return [];
    try {
        const projectRef = doc(db, `users/${userId}/myworkspace/${workspaceId}/projects/${projectId}`);
        const projectSnap = await getDoc(projectRef);
        if (!projectSnap.exists()) return [];
        
        const projectData = projectSnap.data();
        let memberUids = (projectData.workspaceRole === 'workspace') ?
            (await getDoc(doc(db, `users/${userId}/myworkspace/${workspaceId}`))).data()?.members || [] :
            projectData.members?.map(m => m.uid) || [];
        
        if (memberUids.length === 0) return [];
        const userPromises = memberUids.map(uid => getDoc(doc(db, `users/${uid}`)));
        const userDocs = await Promise.all(userPromises);
        return userDocs.filter(d => d.exists()).map(d => ({ uid: d.id, ...d.data() }));
    } catch (error) {
        console.error("Error fetching project members:", error);
        return [];
    }
}

const findSection = (sectionId) => project.sections.find(s => s.id === sectionId);
const findTaskAndSection = (taskId) => {
    for (const section of project.sections) {
        const task = (section.tasks || []).find(t => t.id === taskId);
        if (task) return { task, section };
    }
    return { task: null, section: null };
};

const formatDueDate = (dueDateString) => {
    if (!dueDateString) return '';
    const today = new Date('2025-06-12T00:00:00'); // Static date for consistent demo
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dueDate = new Date(dueDateString + 'T00:00:00');
    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    if (dueDate.getTime() === today.getTime()) return 'Today';
    if (dueDate.getTime() === tomorrow.getTime()) return 'Tomorrow';
    return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

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
            currentUserId = user.uid;
            // This call is now safe because fetchActiveIds is defined above
            const ids = await fetchActiveIds(user.uid);
            if (ids.projectId) {
                currentWorkspaceId = ids.workspaceId;
                currentProjectId = ids.projectId;
                allUsers = await fetchProjectMembers(currentUserId, currentWorkspaceId, currentProjectId);
                attachRealtimeListeners();
            } else {
                kanbanBoard.innerHTML = '<h2>No active project found for this user.</h2>';
            }
        } else {
            cleanup();
            signInAnonymously(auth).catch(err => console.error("Anonymous sign-in failed:", err));
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
    if (kanbanBoard) kanbanBoard.innerHTML = '<div class="loading-placeholder">Please log in to view the board.</div>';
};

// --- 7. REAL-TIME DATA & STATE MANAGEMENT ---
function detachAllListeners() {
    Object.values(activeListeners).forEach(unsubscribe => unsubscribe && unsubscribe());
}

// --- 7. REAL-TIME DATA & STATE MANAGEMENT ---
function attachRealtimeListeners() {
    if (!currentUserId || !currentProjectId) return;
    detachAllListeners();

    project.id = currentProjectId;
    const projectPath = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}`;
    
    // Listener for Sections (no changes)
    const sectionsQuery = query(collection(db, `${projectPath}/sections`), orderBy("order"));
    activeListeners.sections = onSnapshot(sectionsQuery, (snapshot) => {
        project.sections = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, tasks: [] }));
        distributeTasksToSections(allTasksFromSnapshot);
        renderBoard();
    }, err => console.error("Section listener error:", err));
    
    // Listener for Tasks (no changes)
    const tasksQuery = query(collectionGroup(db, 'tasks'), where('projectId', '==', currentProjectId));
    activeListeners.tasks = onSnapshot(tasksQuery, (snapshot) => {
        allTasksFromSnapshot = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        distributeTasksToSections(allTasksFromSnapshot);
        if (!isMovingTask) renderBoard();
    }, err => console.error("Task listener error:", err));
    

    const messagesQuery = query(collectionGroup(db, 'Messages'), where('imageUrl', '!=', null));
    
    activeListeners.messages = onSnapshot(messagesQuery, (snapshot) => {
        const newImageMap = {};
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const pathSegments = doc.ref.path.split('/');
            
            // 2. We extract the projectId from the path (e.g., from 'globalChatProjects/{projectId}/...')
            const projectsIndex = pathSegments.indexOf('globalChatProjects');
            if (projectsIndex === -1 || pathSegments.length <= projectsIndex + 1) return; // Malformed path
            
            const messageProjectId = pathSegments[projectsIndex + 1];

            // 3. IMPORTANT: We only process messages that belong to the CURRENTLY active project.
            if (messageProjectId === currentProjectId) {
                const tasksIndex = pathSegments.indexOf('tasks');
                if (tasksIndex > -1 && pathSegments.length > tasksIndex + 1) {
                    const taskId = pathSegments[tasksIndex + 1];

                    if (taskId && data.imageUrl && data.timestamp) {
                        const existing = newImageMap[taskId];
                        
                        // This logic correctly finds the OLDEST image for each taskId
                        if (!existing || data.timestamp.toMillis() < existing.timestamp.toMillis()) {
                            newImageMap[taskId] = { 
                                imageUrl: data.imageUrl, 
                                timestamp: data.timestamp 
                            };
                        }
                    }
                }
            }
        });
        
        // This map now correctly links taskId to the oldest imageUrl
        taskImageMap = Object.fromEntries(
            Object.entries(newImageMap).map(([key, value]) => [key, value.imageUrl])
        );

        renderBoard();
        
    }, err => console.error("Message listener error:", err));
}

function distributeTasksToSections(tasks) {
    const tempTasks = project.sections.flatMap(s => (s.tasks || []).filter(t => t.isNew));
    project.sections.forEach(s => s.tasks = []);
    tasks.forEach(task => findSection(task.sectionId)?.tasks.push(task));
    tempTasks.forEach(tempTask => findSection(tempTask.sectionId)?.tasks.push(tempTask));
    project.sections.forEach(s => s.tasks.sort((a, b) => (a.order || 0) - (b.order || 0)));
}

// --- 8. RENDERING ---
const renderBoard = () => {
    if (!kanbanBoard) return;
    const { scrollLeft, scrollTop } = kanbanBoard;
    kanbanBoard.innerHTML = '';
    project.sections.forEach(renderColumn);
    checkDueDates();
    initSortable();
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
            <h3 contenteditable="true" class="boardtasks-section-title-editable">${section.title}</h3>
            <span class="boardtasks-task-count">${section.tasks.filter(t => !t.isNew).length}</span>
        </div>
        <div class="boardtasks-tasks-container">${section.tasks.map(renderTask).join('')}</div>
        <button class="boardtasks-add-task-btn"><i class="fas fa-plus"></i> Add task</button>`;
    kanbanBoard.appendChild(columnEl);
};

const renderTask = (task) => {
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
    const statusClass = (task.status || '').replace(/\s+/g, '.');
    
    const hasLiked = task.likedBy && task.likedBy[currentUserId];

    return `
        <div class="boardtasks-task-card ${cardCompletedClass}" id="task-${task.id}" data-task-id="${task.id}" draggable="true">
            ${oldestImageUrl ? `<img src="${oldestImageUrl}" class="boardtasks-task-attachment">` : ''}
            <div class="boardtasks-task-content">
                <div class="boardtasks-task-header">
                    <span class="boardtasks-task-check"><i class="${isCompleted ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}"></i></span>
                    <div class="boardtasks-task-assignees">${assigneesHTML}</div>
                    <p contenteditable="true" class="boardtasks-task-name-editable">${task.name}</p>
                </div>
                <div class="boardtasks-task-tags">
                    <span class="boardtasks-tag boardtasks-priority-${task.priority}">${task.priority}</span>
                    <span class="boardtasks-tag boardtasks-status-${statusClass}">${task.status || 'No Status'}</span>
                </div>
                <div class="boardtasks-task-footer">
                    <span class="boardtasks-due-date" data-due-date="${task.dueDate}">${formatDueDate(task.dueDate)}</span>
                    <div class="boardtasks-task-actions">
                        
                        <i class="fa-regular fa-heart ${hasLiked ? 'liked' : ''}" title="Like"></i>
                        <i class="fa-regular fa-comment" title="Comment"></i>
                    </div>
                </div>
            </div>
        </div>`;
};

// --- 9. DATA MODIFICATION & EVENT HANDLERS ---
function createTemporaryTask(section) {
    const tempId = `temp_${Date.now()}`;
    section.tasks.push({ id: tempId, name: '', isNew: true, sectionId: section.id, order: section.tasks.length });
    taskIdToFocus = tempId;
    renderBoard();
}

async function addSectionToFirebase() {
    if (!currentUserId || !currentProjectId) return;
    const path = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections`;
    try {
        await addDoc(collection(db, path), { title: 'New Section', order: project.sections.length, createdAt: serverTimestamp() });
    } catch (error) { console.error("Error adding section:", error); }
}

const handleBlur = async (e) => {
    // Check if the event target is an editable field
    if (!e.target.isContentEditable) return;
    
    const newName = e.target.textContent.trim();
    const taskCard = e.target.closest('.boardtasks-task-card.is-new');

    // Logic for handling a NEW inline task
    if (taskCard) {
        const tempId = taskCard.dataset.taskId;
        const sectionEl = e.target.closest('.boardtasks-kanban-column');
        if (!sectionEl) return;

        const section = findSection(sectionEl.dataset.sectionId);
        const taskIndex = section.tasks.findIndex(t => t.id === tempId);
        if (taskIndex === -1) return;

        // If the user entered a name, save the new task to Firestore
        if (newName) {
            const taskData = section.tasks.splice(taskIndex, 1)[0]; // Get the temporary task data

            const defaults = {
                dueDate: '',
                priority: 'Low',
                status: 'On track',
                assignees: [],
                chatuuid: '', // Chat UUID can be created on first message
                customFields: {},
                likedAmount: 0,
                likedBy: {}
            };

            // Clean up temporary properties from the local task object
            delete taskData.isNew;
            delete taskData.id;

            const path = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${section.id}/tasks`;

            try {
                // --- MODIFICATION START ---

                // 1. Create a reference for the new document to get its unique ID first.
                const newTaskRef = doc(collection(db, path));

                // 2. Assemble the complete data object, including the new ID.
                const fullTaskData = {
                    ...defaults,
                    ...taskData,
                    name: newName,
                    id: newTaskRef.id, // <-- Add the document's own ID to its data
                    projectId: currentProjectId,
                    sectionId: section.id,
                    userId: currentUserId,
                    createdAt: serverTimestamp()
                };

                // 3. Use setDoc() to save the document with the complete data.
                await setDoc(newTaskRef, fullTaskData);
                
                // --- MODIFICATION END ---

            } catch (error) {
                console.error("Error adding new task from inline edit:", error);
                renderBoard(); // Re-render to show the failed state
            }
        } else {
            // If the user left the name blank, just remove the temporary task from the UI
            section.tasks.splice(taskIndex, 1);
            renderBoard();
        }
    } else {
        // Logic for updating an EXISTING task or section title
        const { task, section } = findTaskAndSection(e.target.closest('.boardtasks-task-card')?.dataset.taskId);
        if (!task) return;
        
        const docRef = doc(db, `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${section.id}/tasks/${task.id}`);
        
        if (task.name !== newName) {
            updateDoc(docRef, { name: newName });
        }
    }
};

const handleKanbanClick = (e) => {
    if (e.target.closest('.boardtasks-add-task-btn')) {
        createTemporaryTask(findSection(e.target.closest('.boardtasks-kanban-column').dataset.sectionId));
        return;
    }
    const taskCard = e.target.closest('.boardtasks-task-card:not(.is-new)');
    if (!taskCard) return;
    const { task, section } = findTaskAndSection(taskCard.dataset.taskId);
    if (!task) return;
    const path = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${section.id}/tasks/${task.id}`;
    const taskRef = doc(db, path);

    if (e.target.closest('.boardtasks-task-check')) {
        e.preventDefault(); 
        updateDoc(taskRef, { status: task.status === 'Completed' ? 'On track' : 'Completed' });

    // --- FIX STARTS HERE: New logic for liking/unliking a task ---
    } else if (e.target.matches('.fa-heart')) {
        const userHasLiked = task.likedBy && task.likedBy[currentUserId];
        
        if (userHasLiked) {
            // User is "unliking" the task
            updateDoc(taskRef, {
                likedAmount: increment(-1),
                [`likedBy.${currentUserId}`]: deleteField() // Removes the user's UID from the map
            });
        } else {
            // User is "liking" the task
            updateDoc(taskRef, {
                likedAmount: increment(1),
                [`likedBy.${currentUserId}`]: true // Adds the user's UID to the map
            });
        }
    // --- FIX ENDS HERE ---

    } else if (e.target.matches('.fa-comment')) {
        console.log(`(Placeholder) Open comment panel for task ID: ${task.id}`);
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
        const path = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${s.id}`;
        batch.update(doc(db, path), { order: index });
    });
    try { await batch.commit(); } catch (e) { console.error("Error sorting sections:", e); }
}

async function sortAllTasks(isAsc) {
    const batch = writeBatch(db);
    project.sections.forEach(section => {
        [...section.tasks].sort((a, b) => isAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))
            .forEach((task, index) => {
                if (task.isNew) return;
                const path = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${section.id}/tasks/${task.id}`;
                batch.update(doc(db, path), { order: index });
            });
    });
    try { await batch.commit(); } catch (e) { console.error("Error sorting tasks:", e); }
}

async function handleSectionReorder(evt) {
    isMovingTask = true;
    const batch = writeBatch(db);
    document.querySelectorAll('.boardtasks-kanban-column').forEach((el, index) => {
        const path = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections/${el.dataset.sectionId}`;
        batch.update(doc(db, path), { order: index });
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
    const basePath = `users/${currentUserId}/myworkspace/${currentWorkspaceId}/projects/${currentProjectId}/sections`;
    
    try {
        if (oldSectionId === newSectionId) {
            to.querySelectorAll('.boardtasks-task-card').forEach((taskEl, index) => {
                batch.update(doc(db, `${basePath}/${newSectionId}/tasks/${taskEl.dataset.taskId}`), { order: index });
            });
        } else {
            const taskSnap = await getDoc(doc(db, `${basePath}/${oldSectionId}/tasks/${taskId}`));
            if (!taskSnap.exists()) throw new Error("Source task not found!");
            batch.set(doc(db, `${basePath}/${newSectionId}/tasks/${taskId}`), { ...taskSnap.data(), sectionId: newSectionId });
            batch.delete(doc(db, `${basePath}/${oldSectionId}/tasks/${taskId}`));
            to.querySelectorAll('.boardtasks-task-card').forEach((el, i) => batch.update(doc(db, `${basePath}/${newSectionId}/tasks/${el.dataset.taskId}`), { order: i }));
            from.querySelectorAll('.boardtasks-task-card').forEach((el, i) => batch.update(doc(db, `${basePath}/${oldSectionId}/tasks/${el.dataset.taskId}`), { order: i }));
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