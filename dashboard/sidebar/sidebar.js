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
    let allMessages = [], allActivities = [];
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
        sidebar.classList.add('is-loading');

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

                    sidebar.classList.remove('is-loading');
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
        if(sidebar) sidebar.classList.remove('is-visible', 'is-loading');
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

    async function loadWorkspaceData(activeProjectId) {
        if (!currentUser || !currentWorkspaceId) return;
        const projectsQuery = query(collection(db, `users/${currentUser.id}/myworkspace/${currentWorkspaceId}/projects`));
        const projectsSnapshot = await getDocs(projectsQuery);
        workspaceProjects = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        currentProject = workspaceProjects.find(p => p.id === activeProjectId);
        if(currentProject) {
            allUsers = await fetchProjectMembers(currentUser.id, currentWorkspaceId, activeProjectId);
        }
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
            await updateDoc(currentTaskRef, { [fieldKey]: newValue });
            logActivity({ action: 'updated', field: fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1), from: oldValue, to: newValue });
        } catch(error) { console.error(`Failed to update field ${fieldKey}:`, error); }
    }

    async function updateCustomField(columnId, newValue, column) {
        if (!currentTaskRef || !currentTask) return;
        const fieldKey = `customFields.${columnId}`;
        const oldValue = currentTask.customFields ? currentTask.customFields[columnId] : null;
        if (oldValue === newValue) return;
        try {
            await updateDoc(currentTaskRef, { [fieldKey]: newValue || "" });
            logActivity({ action: 'updated', field: column.name, from: oldValue, to: newValue });
        } catch(error) { console.error(`Failed to update custom field ${column.name}:`, error); }
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
    
    // --- 7. UI RENDERING ---
   function renderSidebar(task) {
    if (!task || !taskNameEl || !taskDescriptionEl) return;
    
    // Set the main task name and description from the task document
    taskNameEl.textContent = task.name;
    taskDescriptionEl.textContent = task.description || "Add a description..."; // Correctly uses task description
    
    renderTaskFields(task);
    renderActiveTab();
}

function renderTaskFields(task) {
    taskFieldsContainer.innerHTML = '';
    
    // Guard clause: We need the project document (which contains custom column definitions) to proceed.
    if (!currentProject) {
        console.warn("Cannot render fields because currentProject data is not available yet.");
        return;
    }

    // --- Render Standard Fields ---
    const projectOptionsHTML = workspaceProjects.map(p => `<option value="${p.id}" ${p.id === task.projectId ? 'selected' : ''}>${p.title}</option>`).join('');
    appendFieldRow('Project', `<select class="field-control" data-field="projectId">${projectOptionsHTML}</select>`);
    appendFieldRow('Assignee', `<div class="field-control field-popover" data-field="assignees">${renderAssigneeValue(task.assignees)}</div>`, 'assignee-field');
    appendFieldRow('Due Date', `<div class="field-control field-datepicker" data-field="dueDate">${task.dueDate ? new Date(task.dueDate+'T00:00:00').toLocaleDateString() : 'No date'}</div>`);
    appendFieldRow('Priority', `<div class="field-control field-popover" data-field="priority">${createTag(task.priority, defaultPriorityColors[task.priority])}</div>`);
    appendFieldRow('Status', `<div class="field-control field-popover" data-field="status">${createTag(task.status, defaultStatusColors[task.status])}</div>`);

    // --- Render Custom Fields ---
    // This loop iterates through the column DEFINITIONS from the PROJECT document.
    currentProject.customColumns?.forEach(col => {
        // This gets the VALUE for that column from the TASK document's customFields map.
        const value = task.customFields ? task.customFields[col.id] : null;
        
        let displayHTML = `<span class="text-gray-400">Not set</span>`; // Default for empty values
        
        if (value != null) {
            if (col.type === 'Type' && col.options) {
                const option = col.options.find(opt => opt.name === value);
                displayHTML = createTag(value, option ? option.color : '#ccc');
            } else {
                // For Text, Number, or other types
                displayHTML = `<span>${value}</span>`;
            }
        }
        
        // This creates the row with the column's name (from the project) and the task's value.
        appendFieldRow(col.name, `<div class="field-control" data-field="custom" data-column-id="${col.id}">${displayHTML}</div>`);
    });
}
    
    function appendFieldRow(label, controlHTML, customClass = '') {
    const row = document.createElement('div');
    row.className = `field-row ${customClass}`;
    row.innerHTML = `<label>${label}</label><div class="field-value">${controlHTML}</div>`;
    taskFieldsContainer.appendChild(row);
}

function createTag(text, color = '#e0e0e0') {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return `<div class="tag" style="background-color: ${color}; color: ${(yiq >= 128) ? '#000' : '#fff'};">${text}</div>`;
}

function renderAssigneeValue(assignees) {
    if (assignees && assignees.length > 0) {
        const user = allUsers.find(u => u.id === assignees[0]);
        return user ? `<div class="avatar" style="background-image: url(${user.avatar})"></div><span>${user.name}</span>` : '<span>Unknown User</span>';
    }
    return '<span>Unassigned</span>';
}

function renderActiveTab() {
    if (!tabsContainer || !activityLogContainer) return;
    const activeTab = tabsContainer.querySelector('.active')?.dataset.tab || 'chat';
    activityLogContainer.innerHTML = '';
    if (activeTab === 'chat') renderMessages();
    else renderActivityLogs();
}

 
    function renderMessages() {
    if (allMessages.length === 0) {
        activityLogContainer.innerHTML = `<div class="placeholder-text">No messages yet.</div>`;
        return;
    }
    allMessages.forEach(msg => {
        const item = document.createElement('div');
        item.className = 'comment-item';
        item.innerHTML = `<div class="avatar" style="background-image: url(${msg.senderAvatar})"></div><div class="comment-body"><div class="comment-header"><span class="comment-author">${msg.senderName}</span> <span class="comment-timestamp">${new Date(msg.timestamp?.toDate()).toLocaleString()}</span></div>${msg.text ? `<div class="comment-text">${msg.text}</div>` : ''}${msg.imageUrl ? `<div class="log-attachment"><img class="scalable-image" src="${msg.imageUrl}"></div>` : ''}</div>`;
        activityLogContainer.appendChild(item);
    });
    activityLogContainer.scrollTop = activityLogContainer.scrollHeight;
}

function renderActivityLogs() {
    if (allActivities.length === 0) {
        activityLogContainer.innerHTML = `<div class="placeholder-text">No activity yet.</div>`;
        return;
    }
    allActivities.forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `<div class="avatar" style="background-image: url(${log.userAvatar})"></div><div class="comment-body"><div class="comment-header"><span class="comment-author">${log.userName}</span> <span class="comment-timestamp">${new Date(log.timestamp?.toDate()).toLocaleString()}</span></div><div class="activity-change-log">${log.details}</div></div>`;
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
        closeBtn.addEventListener('click', close);
        sendCommentBtn.addEventListener('click', handleCommentSubmit);
        commentInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit(); } });
        
        tabsContainer.addEventListener('click', (e) => {
            if (e.target.matches('.tab-btn')) {
                tabsContainer.querySelector('.active').classList.remove('active');
                e.target.classList.add('active');
                renderActiveTab();
            }
        });

        taskNameEl.addEventListener('blur', () => updateTaskField('name', taskNameEl.textContent.trim()));
        taskDescriptionEl.addEventListener('blur', () => updateTaskField('description', taskDescriptionEl.textContent.trim()));
        
        taskFieldsContainer.addEventListener('change', (e) => {
            if (e.target.dataset.field === 'projectId') moveTask(e.target.value);
        });
        
        taskFieldsContainer.addEventListener('click', (e) => {
            const control = e.target.closest('.field-control');
            if (!control) return;

            const field = control.dataset.field;
            if (field === 'priority') {
                const options = priorityOptions.map(p => ({ label: p, value: p }));
                createGenericDropdown(control, options, (newValue) => updateTaskField('priority', newValue));
            } else if (field === 'status') {
                const options = statusOptions.map(p => ({ label: p, value: p }));
                createGenericDropdown(control, options, (newValue) => updateTaskField('status', newValue));
            } else if (field === 'assignees') {
                const options = allUsers.map(u => ({ label: u.name, value: u.id, avatar: u.avatar }));
                options.unshift({ label: 'Unassigned', value: null });
                createGenericDropdown(control, options, (newValue) => updateTaskField('assignees', newValue ? [newValue] : []));
            } else if (field === 'dueDate') {
                makeDateFieldEditable(control, 'dueDate');
            } else if (field === 'custom') {
                const columnId = control.dataset.columnId;
                const column = currentProject.customColumns.find(c => c.id == columnId);
                if (column) {
                    if (column.type === 'Type' || column.type === 'Selector') {
                        const options = column.options.map(opt => ({ label: opt.name || opt, value: opt.name || opt }));
                        createGenericDropdown(control, options, (newValue) => updateCustomField(columnId, newValue, column));
                    } else if (column.type === 'Text' || column.type === 'Costing') {
                        makeTextFieldEditable(control, columnId, column);
                    }
                }
            }
        });
        
        document.body.addEventListener('click', (e) => {
            if (!e.target.closest('.context-dropdown, .field-popover')) {
                closePopovers();
            }
        });
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
            item.addEventListener('click', () => {
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
        const originalHTML = control.innerHTML;
        const oldValue = currentTask.customFields ? currentTask.customFields[columnId] : '';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = oldValue || '';
        input.className = 'field-edit-input';
        control.innerHTML = '';
        control.appendChild(input);
        input.focus();

        const save = () => {
            const newValue = input.value;
            control.innerHTML = originalHTML; // Revert visually first
            updateCustomField(columnId, newValue, column);
        };
        
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
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

