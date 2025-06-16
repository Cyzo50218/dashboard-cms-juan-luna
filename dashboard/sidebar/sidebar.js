// =================================================================================
// TaskSidebar Module: Real-time Task Management with Firebase
// Version: 2.0.0 (Downloadable - Truly Full & Complete)
// =================================================================================
// This self-contained module provides a complete, production-ready, real-time
// task sidebar with full editing capabilities for all fields, including moving
// tasks between projects, and a complete chat/activity log system.
// =================================================================================

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    collection,
    setDoc,
    query,
    where,
    onSnapshot,
    addDoc,
    updateDoc,
    serverTimestamp,
    getDoc,
    getDocs,
    orderBy,
    limit,
    collectionGroup,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// --- IMPORTANT: Ensure this path is correct for your project structure ---
import {
    firebaseConfig
} from "/services/firebase-config.js";

window.TaskSidebar = (function() {
    // --- 1. FIREBASE & INITIALIZATION ---
    let app, auth, db, storage;
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app, "juanluna-cms-01");
        storage = getStorage(app);
    } catch (e) {
        console.error("TaskSidebar: Firebase initialization failed.", e);
        return { init: () => {}, open: () => {} };
    }
    
    // --- 2. MODULE STATE ---
    let isInitialized = false;
    let currentUser = null;
    let currentTask = null;
    let currentTaskRef = null;
    let currentProject = null;
    let currentWorkspaceId = null;
    let workspaceProjects = [];
    let allUsers = [];
    
    // Listeners & Caches
    let taskListenerUnsubscribe, activityListenerUnsubscribe, messagesListenerUnsubscribe;
    let allMessages = [],
        allActivities = [];
    let pastedFiles = [];
    
    // Color Mappings & Options
    const defaultPriorityColors = { 'High': '#ffccc7', 'Medium': '#ffe7ba', 'Low': '#d9f7be' };
    const defaultStatusColors = { 'On track': '#b7eb8f', 'At risk': '#fff1b8', 'Off track': '#ffccc7', 'Completed': '#d9d9d9' };
    const priorityOptions = ['High', 'Medium', 'Low'];
    const statusOptions = ['On track', 'At risk', 'Off track', 'Completed'];
    
    // DOM Elements
    let sidebar, taskNameEl, taskDescriptionEl, taskFieldsContainer, closeBtn,
        tabsContainer, activityLogContainer, commentInput, sendCommentBtn,
        imagePreviewContainer, fileUploadInput, commentInputWrapper;
    
    // --- 3. CORE LOGIC ---
    function init() {
        if (isInitialized) return;
        
        sidebar = document.getElementById('task-sidebar');
        taskNameEl = document.getElementById('task-name');
        taskDescriptionEl = document.getElementById('task-description-text');
        taskFieldsContainer = document.getElementById('task-fields-container');
        closeBtn = document.getElementById('close-sidebar-btn');
        tabsContainer = document.getElementById('comment-tabs-container');
        activityLogContainer = document.getElementById('activity-log-container');
        commentInput = document.getElementById('comment-input');
        sendCommentBtn = document.getElementById('send-comment-btn');
        imagePreviewContainer = document.getElementById('pasted-image-preview-container');
        fileUploadInput = document.getElementById('file-upload-input');
        commentInputWrapper = document.querySelector('.comment-input-wrapper');
        
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = {
                    id: user.uid,
                    name: user.displayName || 'Anonymous User',
                    avatar: user.photoURL || 'https://i.imgur.com/k9qRkiG.png'
                };
                await fetchActiveWorkspace(user.uid);
            } else {
                currentUser = null;
                close();
            }
        });
        
        attachEventListeners();
        isInitialized = true;
    }
    
    
    /**
     * Opens the sidebar for a specific task using a direct path.
     * @param {object} context - An object containing all necessary IDs.
     * @param {string} context.taskId
     * @param {string} context.sectionId
     * @param {string} context.projectId
     * @param {string} context.workspaceId
     */
    async function open(taskId) {
        if (!isInitialized) init();
        if (!taskId || !currentUser) return;
        
        detachAllListeners();
        
        
        try {
            // THIS IS THE CORRECTED QUERY. It searches all 'tasks' collections
            // for a document where the 'id' field matches the given taskId.
            const tasksQuery = query(collectionGroup(db, 'tasks'), where('id', '==', taskId), limit(1));
            const querySnapshot = await getDocs(tasksQuery);
            
            
            if (querySnapshot.empty) {
                // This error now correctly means one of two things:
                // 1. The Firestore Index is missing (check console for a link).
                // 2. The task document truly does not exist or its 'id' field is wrong.
                throw new Error(`Task with ID ${taskId} could not be found. Please ensure the Firestore Index has been created.`);
            }
            
            // Get the full, correct reference to the found document
            currentTaskRef = querySnapshot.docs[0].ref;
            
            // The task's path contains the owner's userId and workspaceId.
            const pathSegments = currentTaskRef.path.split('/');
            const ownerId = pathSegments[1];
            const workspaceId = pathSegments[3];
            currentWorkspaceId = workspaceId; // Set the correct workspaceId
            
            taskListenerUnsubscribe = onSnapshot(currentTaskRef, async (taskDoc) => {
                if (taskDoc.exists()) {
                    currentTask = { ...taskDoc.data(), id: taskDoc.id };
                    
                    // Load workspace data using the owner's ID and correct workspaceId
                    await loadWorkspaceData(ownerId, workspaceId, currentTask.projectId);
                    
                    
                    sidebar.classList.add('is-visible');
                    renderSidebar(currentTask);
                    
                    listenToActivity();
                    if (currentTask.chatuuid) listenToMessages();
                    
                } else {
                    close();
                }
            });
        } catch (error) {
            console.error("TaskSidebar: Error opening task.", error);
            close();
        }
    }
    
    
    function close() {
        if (sidebar) sidebar.classList.remove('is-visible', 'is-loading');
        detachAllListeners();
        closePopovers();
        currentTask = currentTaskRef = currentProject = null;
        workspaceProjects = allUsers = allMessages = allActivities = [];
        clearImagePreview();
    }
    
    function detachAllListeners() {
        if (taskListenerUnsubscribe) taskListenerUnsubscribe();
        if (activityListenerUnsubscribe) activityListenerUnsubscribe();
        if (messagesListenerUnsubscribe) messagesListenerUnsubscribe();
        taskListenerUnsubscribe = activityListenerUnsubscribe = messagesListenerUnsubscribe = null;
    }
    
    // --- 4. DATA FETCHING ---
    async function fetchActiveWorkspace(userId) {
        const workspaceQuery = query(collection(db, `users/${userId}/myworkspace`), where("isSelected", "==", true), limit(1));
        const workspaceSnapshot = await getDocs(workspaceQuery);
        currentWorkspaceId = workspaceSnapshot.empty ? null : workspaceSnapshot.docs[0].id;
    }
    
    async function loadWorkspaceData(ownerId, workspaceId, activeProjectId) {
        console.log("--- Starting loadWorkspaceData ---");
        console.log("Looking for projects owned by user:", ownerId);
        console.log("Inside workspace:", workspaceId);
        console.log("Trying to find the project with this ID:", activeProjectId);
        
        // Guard clause to ensure we have the necessary IDs to proceed.
        if (!ownerId || !workspaceId || !activeProjectId) {
            console.error("Function stopped: ownerId, workspaceId, or activeProjectId is missing.");
            currentProject = null; // Ensure it's null
            return;
        }
        
        try {
            const projectsPath = `users/${ownerId}/myworkspace/${workspaceId}/projects`;
            console.log("Querying this Firestore path for projects:", projectsPath);
            
            const projectsQuery = query(collection(db, projectsPath));
            const projectsSnapshot = await getDocs(projectsQuery);
            
            // Check if the query returned any project documents at all.
            if (projectsSnapshot.empty) {
                console.error("DEBUG: No projects were found at that path. This could be a Security Rule issue on the 'projects' collection or an incorrect path.");
                currentProject = null; // Ensure it's null
                return;
            }
            
            workspaceProjects = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log("DEBUG: Found these projects in the workspace:", workspaceProjects);
            
            // This is the most important step. We try to find the project.
            currentProject = workspaceProjects.find(p => p.id === activeProjectId);
            
            if (currentProject) {
                console.log("SUCCESS: Found a matching project object. The data is now loaded.", currentProject);
            } else {
                console.error("FAILURE: Could not find a project with ID '" + activeProjectId + "' in the list of fetched projects.");
                console.error("Please check the 'projectId' field on your Task document in Firestore to make sure it is correct.");
            }
            
        } catch (error) {
            console.error("CRITICAL ERROR inside loadWorkspaceData. This is likely a permissions error.", error);
            currentProject = null; // Ensure it's null on error
        }
        console.log("--- Finished loadWorkspaceData ---");
    }
    
    async function fetchProjectMembers(userId, workspaceId, projectId) {
        const project = workspaceProjects.find(p => p.id === projectId);
        if (!project) return [];
        const workspaceDoc = await getDoc(doc(db, `users/${userId}/myworkspace/${workspaceId}`));
        const workspaceMembers = workspaceDoc.data()?.members?.map(m => m.uid) || [];
        let memberUids = project.accessLevel === 'workspace' ? workspaceMembers : project.members?.map(m => m.uid) || [];
        if (!memberUids.includes(userId)) memberUids.push(userId);
        if (memberUids.length === 0) return [];
        const userDocs = await Promise.all([...new Set(memberUids)].map(uid => getDoc(doc(db, `users/${uid}`))));
        return userDocs.filter(d => d.exists()).map(d => ({ id: d.id, name: d.data().displayName, avatar: d.data().photoURL }));
    }
    
    // --- 5. REAL-TIME LISTENERS ---
    function listenToActivity() {
        activityListenerUnsubscribe = onSnapshot(query(collection(currentTaskRef, "activity"), orderBy("timestamp", "asc")), (snapshot) => {
            allActivities = snapshot.docs.map(doc => doc.data());
            renderActiveTab();
        });
    }
    
    function listenToMessages() {
        messagesListenerUnsubscribe = onSnapshot(query(collection(db, "messages"), where("chatuuid", "==", currentTask.chatuuid), orderBy("timestamp", "asc")), (snapshot) => {
            allMessages = snapshot.docs.map(doc => doc.data());
            renderActiveTab();
        });
    }
    
    // --- 6. DATA MUTATION (EDITING & MOVING) ---
    async function updateTaskField(fieldKey, newValue) {
        if (!currentTaskRef || !currentTask) return;
        const oldValue = currentTask[fieldKey];
        if (oldValue === newValue) return;
        try {
            await updateDoc(currentTaskRef, {
                [fieldKey]: newValue
            });
            logActivity({ action: 'updated', field: fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1), from: oldValue, to: newValue });
        } catch (error) { console.error(`Failed to update field ${fieldKey}:`, error); }
    }
    
    async function updateCustomField(columnId, newValue, column) {
        if (!currentTaskRef || !currentTask) return;
        const fieldKey = `customFields.${columnId}`;
        const oldValue = currentTask.customFields ? currentTask.customFields[columnId] : null;
        if (oldValue === newValue) return;
        try {
            await updateDoc(currentTaskRef, {
                [fieldKey]: newValue || ""
            });
            logActivity({ action: 'updated', field: column.name, from: oldValue, to: newValue });
        } catch (error) { console.error(`Failed to update custom field ${column.name}:`, error); }
    }
    
    async function moveTask(newProjectId) {
        if (!currentTaskRef || !currentTask || newProjectId === currentTask.projectId) return;
        const newProject = workspaceProjects.find(p => p.id === newProjectId);
        if (!newProject) return;
        const sectionsQuery = query(collection(db, `users/${currentUser.id}/myworkspace/${currentWorkspaceId}/projects/${newProjectId}/sections`), orderBy("order", "asc"), limit(1));
        const sectionsSnapshot = await getDocs(sectionsQuery);
        if (sectionsSnapshot.empty) { alert("Error: Target project has no sections."); return; }
        const newSectionId = sectionsSnapshot.docs[0].id;
        const newPath = `users/${currentUser.id}/myworkspace/${currentWorkspaceId}/projects/${newProjectId}/sections/${newSectionId}/tasks/${currentTask.id}`;
        const newTaskData = { ...currentTask, projectId: newProjectId, sectionId: newSectionId };
        delete newTaskData.id;
        try {
            const batch = writeBatch(db);
            batch.delete(currentTaskRef);
            batch.set(doc(db, newPath), newTaskData);
            await batch.commit();
            logActivity({ action: 'moved', field: 'Project', from: currentProject.title, to: newProject.title });
        } catch (error) { console.error("Failed to move task:", error); }
    }
    
    async function logActivity({ action, field, from, to }) {
        if (!currentTaskRef || !currentUser) return;
        await addDoc(collection(currentTaskRef, "activity"), {
            type: 'log',
            userId: currentUser.id,
            userName: currentUser.name,
            userAvatar: currentUser.avatar,
            timestamp: serverTimestamp(),
            details: `<strong>${currentUser.name}</strong> ${action} <strong>${field}</strong> from <strong>${from || 'none'}</strong> to <strong>${to || 'none'}</strong>.`
        });
    }
    
    async function sendMessage(text, imageUrl = null) {
        if (!currentTaskRef || !currentUser) return;
        let { chatuuid } = currentTask;
        if (!chatuuid) {
            chatuuid = doc(collection(db, 'dummy')).id;
            await updateDoc(currentTaskRef, { chatuuid });
        }
        await addDoc(collection(db, "messages"), {
            chatuuid,
            projectId: currentTask.projectId,
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderAvatar: currentUser.avatar,
            text,
            imageUrl,
            timestamp: serverTimestamp()
        });
    }
    
    async function handleCommentSubmit() {
        const text = commentInput.value.trim();
        const files = [...pastedFiles];
        if (!text && files.length === 0) return;
        commentInput.value = '';
        clearImagePreview();
        try {
            let imageUrl = null;
            if (files.length > 0) {
                const file = files[0];
                const chatuuid = currentTask.chatuuid || doc(collection(db, 'dummy')).id;
                const storageRef = ref(storage, `chats/${chatuuid}/${Date.now()}-${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                imageUrl = await getDownloadURL(snapshot.ref);
            }
            await sendMessage(text, imageUrl);
        } catch (error) { console.error("Failed to send message:", error); }
    }
    
// =================================================================================
// --- 7. UI RENDERING (Final Polished Version) ---
// =================================================================================

/**
 * Renders the entire sidebar with the latest task data.
 */
function renderSidebar(task) {
    taskNameEl.contentEditable = "true";
    taskDescriptionEl.contentEditable = "true";
    taskNameEl.textContent = task.name;
    taskDescriptionEl.textContent = task.description || "Add a description...";
    renderTaskFields(task);
    renderActiveTab();
}

/**
 * Renders all fields into a two-column table with custom controls.
 */
function renderTaskFields(task) {
    taskFieldsContainer.innerHTML = '';
    if (!currentProject) return;

    const table = document.createElement('table');
    table.className = 'task-fields-table';
    const tbody = document.createElement('tbody');

    // --- Render Standard Fields ---
    const currentProjectTitle = workspaceProjects.find(p => p.id === task.projectId)?.title || '...';
    appendFieldToTable(tbody, 'project', 'Project', `<span>${currentProjectTitle}</span>`, 'project');
    appendFieldToTable(tbody, 'assignees', 'Assignee', renderAssigneeValue(task.assignees), 'assignee');
    appendFieldToTable(tbody, 'dueDate', 'Due Date', renderDateValue(task.dueDate), 'date'); // Uses custom date renderer now
    appendFieldToTable(tbody, 'priority', 'Priority', createTag(task.priority, defaultPriorityColors[task.priority]), 'priority');
    appendFieldToTable(tbody, 'status', 'Status', createTag(task.status, defaultStatusColors[task.status]), 'status');

    // --- Render Custom Fields ---
    currentProject.customColumns?.forEach(col => {
        const value = task.customFields ? task.customFields[col.id] : null;
        let displayHTML = `<span>Not set</span>`;
        if (value != null) {
            if (col.type === 'Type' && col.options) {
                const option = col.options.find(opt => opt.name === value);
                displayHTML = createTag(value, option ? option.color : '#ccc');
            } else {
                displayHTML = `<span>${value}</span>`;
            }
        }
        // Add a specific class for right-alignment styling
        appendFieldToTable(tbody, `custom-${col.id}`, col.name, displayHTML, col.type, 'custom-field-value');
    });

    table.appendChild(tbody);
    taskFieldsContainer.appendChild(table);
}

/**
 * Creates and appends a styled table row.
 */
function appendFieldToTable(tbody, key, label, controlHTML, controlType, customClass = '') {
    const row = tbody.insertRow();
    row.className = 'sidebarprojectfield-row';

    const labelCell = row.insertCell();
    labelCell.className = 'sidebarprojectfield-label';
    labelCell.textContent = label;

    const valueCell = row.insertCell();
    valueCell.className = `sidebarprojectfield-value ${customClass}`;
    
    // The control div wrapper is essential for event handling and styling
    const controlDiv = document.createElement('div');
    controlDiv.className = 'field-control';
    controlDiv.dataset.key = key;
    controlDiv.dataset.control = controlType;
    controlDiv.innerHTML = controlHTML;

    valueCell.appendChild(controlDiv);
}

/**
 * Renders the Due Date field with the flatpickr structure.
 */
function renderDateValue(dateString) {
    const displayDate = dateString ? new Date(dateString + 'T00:00:00').toLocaleDateString() : 'No due date';
    // This structure is specifically for flatpickr to attach to
    return `
        <div class="flatpickr-wrapper">
            <input type="text" class="flatpickr-input" value="${displayDate}" readonly="readonly" placeholder="No due date">
            <i class="fa-solid fa-calendar-days input-button"></i>
        </div>
    `;
}

function createTag(text, color = '#e0e0e0') {
    if (!text) return '<span>Not set</span>';
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return `<div class="tag" style="background-color: ${color}; color: ${(yiq >= 128) ? '#000' : '#fff'};">${text}</div>`;
}
/**
 * Renders the HTML for the assignee field with the correct design.
 * Shows the assigned user's avatar and name, or a circular plus button if unassigned.
 */
function renderAssigneeValue(assignees) {
    // If an assignee exists (and the array isn't empty), show their avatar and name.
    if (assignees && assignees.length > 0) {
        const user = allUsers.find(u => u.id === assignees[0]);
        if (user) {
            // This is the HTML for an assigned user
            return `<div class="assignee-value">
                        <div class="avatar" style="background-image: url(${user.avatar})"></div>
                        <span>${user.name}</span>
                    </div>`;
        }
        return '<span>Unknown User</span>';
    }
    
    // --- THIS IS THE FIX ---
    // If no assignee, return the HTML for the dashed circle plus button.
    return `<button class="assignee-add-btn" title="Assign task">
                <i class="fa-solid fa-plus"></i>
            </button>`;
}

/**
 * Renders the content for the currently active tab (Chat or Activity).
 * This function can now be simplified, as the functions it calls are self-aware.
 */
function renderActiveTab() {
    if (!tabsContainer || !activityLogContainer) return;
    
    // Simply try to render both. The guard clauses inside each function
    // will ensure that only the content for the currently active tab is actually drawn.
    renderMessages();
    renderActivityLogs();
}

/**
 * Renders all messages and ensures the comment form is VISIBLE.
 */
function renderMessages() {
    // This function only runs if the 'chat' tab is active.
    const activeTab = tabsContainer.querySelector('.active')?.dataset.tab || 'chat';
    if (activeTab !== 'chat') return;
    
    // --- FIX: Show the comment form ---
    const addCommentForm = document.getElementById('add-comment-form');
    if (addCommentForm) addCommentForm.style.display = 'flex'; // Or 'block'
    
    activityLogContainer.innerHTML = '';
    
    if (allMessages.length === 0) {
        activityLogContainer.innerHTML = `<div class="placeholder-text">No messages yet. Start the conversation!</div>`;
        return;
    }
    
    allMessages.forEach(msg => {
        const item = document.createElement('div');
        item.className = 'comment-item';
        const timestamp = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleString() : 'Sending...';
        item.innerHTML = `<div class="avatar" style="background-image: url(${msg.senderAvatar})"></div><div class="comment-body"><div class="comment-header"><span class="comment-author">${msg.senderName}</span> <span class="comment-timestamp">${timestamp}</span></div>${msg.text ? `<div class="comment-text">${msg.text}</div>` : ''}${msg.imageUrl ? `<div class="log-attachment"><img class="scalable-image" src="${msg.imageUrl}"></div>` : ''}</div>`;
        activityLogContainer.appendChild(item);
    });
    activityLogContainer.scrollTop = activityLogContainer.scrollHeight;
}

/**
 * Renders all activity logs and ensures the comment form is HIDDEN.
 */
function renderActivityLogs() {
    // This function only runs if the 'activity' tab is active.
    const activeTab = tabsContainer.querySelector('.active')?.dataset.tab || 'chat';
    if (activeTab !== 'activity') return;
    
    // --- FIX: Hide the comment form ---
    const addCommentForm = document.getElementById('add-comment-form');
    if (addCommentForm) addCommentForm.style.display = 'none';
    
    activityLogContainer.innerHTML = '';
    
    if (allActivities.length === 0) {
        activityLogContainer.innerHTML = `<div class="placeholder-text">No activity yet.</div>`;
        return;
    }
    
    allActivities.forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        const timestamp = log.timestamp ? new Date(log.timestamp.toDate()).toLocaleString() : '';
        item.innerHTML = `<div class="avatar" style="background-image: url(${log.userAvatar})"></div><div class="comment-body"><div class="comment-header"><span class="comment-author">${log.userName}</span> <span class="comment-timestamp">${timestamp}</span></div><div class="activity-change-log">${log.details}</div></div>`;
        activityLogContainer.appendChild(item);
    });
}
    
    function clearImagePreview() {
        pastedFiles = [];
        if (imagePreviewContainer) imagePreviewContainer.innerHTML = '';
        if (commentInputWrapper) commentInputWrapper.classList.remove('preview-active');
    }
    
    // --- 8. EVENT LISTENERS ---
    function attachEventListeners() {
    if (!sidebar) return;
    
    // Standard listeners
    closeBtn.addEventListener('click', close);
    sendCommentBtn.addEventListener('click', handleCommentSubmit);
    commentInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit(); } });
    
    // --- DIAGNOSTIC TAB CLICK LISTENER ---
    tabsContainer.addEventListener('click', (e) => {
        console.log("--- Tab Click Detected ---");
        console.log("Clicked element:", e.target);

        // We only care about clicks on elements with the 'tab-btn' class
        if (e.target.matches('.sidebar-task-btn-tab')) {
            console.log("It's a tab button. Proceeding with state change...");

            // Find the currently active tab before we make changes
            const oldActive = tabsContainer.querySelector('.active');
            console.log("1. Old active tab was:", oldActive);
            if (oldActive) {
                oldActive.classList.remove('active');
            }

            // Add the 'active' class to the button that was just clicked
            console.log("2. Setting new active tab:", e.target);
            e.target.classList.add('active');
            
            // Immediately after, let's verify which tab the browser thinks is active
            const newActive = tabsContainer.querySelector('.active');
            console.log("3. Verified new active tab is:", newActive);
            console.log("4. Its data-tab attribute is:", newActive?.dataset.tab);

            console.log("5. Calling renderActiveTab() to update the content...");
            renderActiveTab();

        } else {
            console.log("The clicked element was not a .tab-btn, so no action was taken.");
        }
    });
    
    // Editable Task Name and Description
    taskNameEl.addEventListener('blur', () => updateTaskField('name', taskNameEl.textContent.trim()));
    taskDescriptionEl.addEventListener('blur', () => updateTaskField('description', taskDescriptionEl.textContent.trim()));
    
    // --- Event Delegation for all interactive fields ---
    taskFieldsContainer.addEventListener('click', (e) => {
        const control = e.target.closest('.field-control');
        if (!control) return;

        const key = control.dataset.key;
        const controlType = control.dataset.control;

        switch (controlType) {
            case 'project': {
                const options = workspaceProjects.map(p => ({ label: p.title, value: p.id }));
                createGenericDropdown(control, options, (newProjectId) => moveTask(newProjectId));
                break;
            }
            case 'date': {
                // Initialize flatpickr on the input inside the clicked control
                const input = control.querySelector('.flatpickr-input');
                const fp = flatpickr(input, {
                    defaultDate: currentTask.dueDate || 'today',
                    dateFormat: "Y-m-d",
                    onClose: function(selectedDates) {
                        const newDate = selectedDates[0] ? flatpickr.formatDate(selectedDates[0], 'Y-m-d') : '';
                        updateTaskField('dueDate', newDate);
                        fp.destroy(); // Important to clean up the instance
                    }
                });
                fp.open();
                break;
            }
            case 'priority': {
                const options = priorityOptions.map(p => ({ label: p, value: p }));
                createGenericDropdown(control, options, (newValue) => updateTaskField('priority', newValue));
                break;
            }
            case 'status': {
                const options = statusOptions.map(p => ({ label: p, value: p }));
                createGenericDropdown(control, options, (newValue) => updateTaskField('status', newValue));
                break;
            }
            case 'assignee': {
                const options = allUsers.map(u => ({ label: u.name, value: u.id, avatar: u.avatar }));
                options.unshift({ label: 'Unassigned', value: null });
                createGenericDropdown(control, options, (newValue) => updateTaskField('assignees', newValue ? [newValue] : []));
                break;
            }
            case 'Type': // For Custom Columns of type 'Type' or 'Selector'
            case 'Selector': {
                const columnId = key.split('-')[1];
                const column = currentProject.customColumns.find(c => c.id == columnId);
                if (column && column.options) {
                    const options = column.options.map(opt => ({ label: opt.name || opt, value: opt.name || opt }));
                    createGenericDropdown(control, options, (newValue) => updateCustomField(columnId, newValue, column));
                }
                break;
            }
            case 'Text': // For Custom Columns of type 'Text'
            case 'Costing': {
                 const columnId = key.split('-')[1];
                 const column = currentProject.customColumns.find(c => c.id == columnId);
                 if(column) makeTextFieldEditable(control, columnId, column);
                 break;
            }
        }
    });
    
    
document.body.addEventListener('click', (e) => {
    // First, if any popovers are open, just close them and do nothing else.
    if (document.querySelector('.context-dropdown')) {
        if (!e.target.closest('.context-dropdown, .field-control')) {
            closePopovers();
        }
        return;
    }
    
    // If no popovers were open, then check if we should close the sidebar.
    // The sidebar should only close if it's currently visible.
    if (sidebar.classList.contains('is-visible')) {
        // Define all elements that should NOT trigger a close.
        const safeSelectors = '#task-sidebar, .tasks-name, .flatpickr-calendar';
        
        // If the clicked element is NOT inside any of the safe areas, close the sidebar.
        if (!e.target.closest(safeSelectors)) {
            close();
        }
    }
}, { capture: true });
}
    
    // --- 9. UI HELPERS ---
    function closePopovers() {
    document.querySelectorAll('.context-dropdown').forEach(p => p.remove());
}

function createGenericDropdown(targetEl, options, onSelect) {
    closePopovers();
    const dropdown = document.createElement('div');
    dropdown.className = 'context-dropdown';
    options.forEach(option => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        if (option.avatar) {
            item.innerHTML = `<div class="avatar" style="background-image: url(${option.avatar})"></div>`;
        }
        item.innerHTML += `<span>${option.label}</span>`;
        item.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent body click listener from closing it instantly
            onSelect(option.value);
            closePopovers();
        });
        dropdown.appendChild(item);
    });
    document.body.appendChild(dropdown);
    const rect = targetEl.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.minWidth = `${rect.width}px`;
}



function makeTextFieldEditable(control, columnId, column) {
    const originalContent = control.innerHTML;
    const oldValue = currentTask.customFields ? (currentTask.customFields[columnId] || '') : '';
    const input = document.createElement('input');
    input.type = (column.type === 'Costing') ? 'number' : 'text';
    input.value = oldValue;
    input.className = 'field-edit-input';
    control.innerHTML = '';
    control.appendChild(input);
    input.focus();
    
    const save = () => {
        const newValue = input.value;
        control.innerHTML = originalContent; // Revert visually before update
        updateCustomField(columnId, newValue, column);
    };
    
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            input.value = oldValue; // Revert changes
            input.blur();
        }
    });
}

    function makeDateFieldEditable(control, fieldKey) {
        const oldValue = currentTask[fieldKey] || '';
        control.innerHTML = `<input type="date" class="field-edit-input" value="${oldValue}">`;
        const input = control.querySelector('input');
        input.focus();
        input.addEventListener('blur', () => {
            updateTaskField(fieldKey, input.value);
        });
    }
    
    // --- 10. PUBLIC INTERFACE ---
    return { init, open };
})();



document.addEventListener('DOMContentLoaded', () => {
    if (window.TaskSidebar) {
        window.TaskSidebar.init();
    }
});
