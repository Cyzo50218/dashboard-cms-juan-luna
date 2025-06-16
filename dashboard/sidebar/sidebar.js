// =================================================================================
// TaskSidebar Module: Real-time Task Management with Firebase
// Version: 1.1.0 (Downloadable)
// =================================================================================
// This self-contained module provides a fully functional, real-time task sidebar.
//
// Features:
// - Renders all standard and custom fields from Firestore project data.
// - Real-time task data synchronization.
// - Real-time chat messaging with image uploads via Firebase Storage.
// - Automated activity logging for all task changes.
// - Dynamic loading of project members.
// - Color-coded tags for Status, Priority, and custom Type fields.
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
    limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

//
// ----------------- IMPORTANT -----------------
//
// Ensure this path to your firebase-config.js file is correct for your project structure.
//
import {
    firebaseConfig
} from "/services/firebase-config.js";
//
// ---------------------------------------------
//

window.TaskSidebar = (function() {
    // --- 1. FIREBASE & INITIALIZATION ---
    let app, auth, db, storage;
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app, "juanluna-cms-01");
        storage = getStorage(app);
        console.log("TaskSidebar: Firebase initialized successfully.");
    } catch (e) {
        console.error("TaskSidebar: Firebase initialization failed.", e);
        const errorFunc = (name) => () => console.error(`Cannot call ${name}, Firebase failed to initialize.`);
        return {
            init: errorFunc("init"),
            open: errorFunc("open")
        };
    }

    // --- 2. MODULE STATE ---
    let isInitialized = false;
    let currentUser = null;
    let currentTask = null;
    let currentProject = null;
    let currentWorkspaceId = null;
    let allUsers = [];
    let allMessages = [];
    let allActivities = [];

    let taskListenerUnsubscribe = null;
    let activityListenerUnsubscribe = null;
    let messagesListenerUnsubscribe = null;

    let pastedFiles = [];

    // --- NEW: Color mappings ---
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

    const priorityOptions = ['High', 'Medium', 'Low'];
    const statusOptions = ['On track', 'At risk', 'Off track', 'Completed'];

    // DOM element references
    let sidebar, taskNameEl, taskDescriptionEl, taskFieldsContainer, closeBtn,
        taskCompleteBtn, taskCompleteText, tabsContainer, activityLogContainer,
        commentInput, sendCommentBtn, currentUserAvatarEl, imagePreviewContainer,
        uploadFileBtn, fileUploadInput, commentInputWrapper;

    // --- 3. DYNAMIC DATA FETCHING ---
    async function fetchActiveIds(userId) {
        // ... (function remains the same as previous version)
        try {
            const workspaceQuery = query(collection(db, `users/${userId}/myworkspace`), where("isSelected", "==", true), limit(1));
            const workspaceSnapshot = await getDocs(workspaceQuery);
            if (workspaceSnapshot.empty) {
                console.warn("TaskSidebar: No selected workspace found.");
                return { workspaceId: null, projectId: null };
            }
            currentWorkspaceId = workspaceSnapshot.docs[0].id;

            const projectQuery = query(collection(db, `users/${userId}/myworkspace/${currentWorkspaceId}/projects`), where("isSelected", "==", true), limit(1));
            const projectSnapshot = await getDocs(projectQuery);
            if (projectSnapshot.empty) {
                console.warn("TaskSidebar: No selected project found.");
                return { workspaceId: currentWorkspaceId, projectId: null };
            }
            const projectId = projectSnapshot.docs[0].id;
            return { workspaceId: currentWorkspaceId, projectId };
        } catch (error) {
            console.error("TaskSidebar: Error fetching active IDs.", error);
            return { workspaceId: null, projectId: null };
        }
    }

    async function fetchProjectMembers(userId, workspaceId, projectId) {
        // ... (function remains the same as previous version)
        if (!userId || !workspaceId || !projectId) return [];
        try {
            const projectRef = doc(db, `users/${userId}/myworkspace/${workspaceId}/projects/${projectId}`);
            const projectSnap = await getDoc(projectRef);
            if (!projectSnap.exists()) return [];

            const projectData = projectSnap.data();
            const workspaceRef = doc(db, `users/${userId}/myworkspace/${workspaceId}`);
            const workspaceSnap = await getDoc(workspaceRef);
            const workspaceMembers = workspaceSnap.data()?.members?.map(m => m.uid) || [];

            let memberUids = projectData.accessLevel === 'workspace' 
                ? workspaceMembers
                : projectData.members?.map(m => m.uid) || [];

            if (!memberUids.includes(userId)) memberUids.push(userId);
            if (memberUids.length === 0) return [];

            const userPromises = [...new Set(memberUids)].map(uid => getDoc(doc(db, `users/${uid}`)));
            const userDocs = await Promise.all(userPromises);

            return userDocs.filter(d => d.exists()).map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    name: data.displayName || 'Unnamed User',
                    avatar: data.photoURL || 'https://i.imgur.com/k9qRkiG.png' // Default avatar
                };
            });
        } catch (error) {
            console.error("TaskSidebar: Error fetching project members.", error);
            return [];
        }
    }

    // --- 4. CORE MODULE FUNCTIONS ---
    function init() {
        if (isInitialized) return;

        // Cache DOM elements
        sidebar = document.getElementById('task-sidebar');
        taskNameEl = document.getElementById('task-name');
        taskDescriptionEl = document.getElementById('task-description-text');
        taskFieldsContainer = document.getElementById('task-fields-container');
        closeBtn = document.getElementById('close-sidebar-btn');
        taskCompleteBtn = document.getElementById('task-complete-btn');
        taskCompleteText = document.getElementById('task-complete-text');
        tabsContainer = document.getElementById('comment-tabs-container');
        activityLogContainer = document.getElementById('activity-log-container');
        commentInput = document.getElementById('comment-input');
        sendCommentBtn = document.getElementById('send-comment-btn');
        currentUserAvatarEl = document.getElementById('current-user-avatar');
        imagePreviewContainer = document.getElementById('pasted-image-preview-container');
        uploadFileBtn = document.getElementById('upload-file-btn');
        fileUploadInput = document.getElementById('file-upload-input');
        commentInputWrapper = document.querySelector('.comment-input-wrapper');

        // Auth state listener
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = {
                    id: user.uid,
                    name: user.displayName || 'Anonymous User',
                    avatar: user.photoURL || 'https://i.imgur.com/k9qRkiG.png'
                };
                if(currentUserAvatarEl) currentUserAvatarEl.style.backgroundImage = `url(${currentUser.avatar})`;
                await fetchActiveIds(user.uid);
            } else {
                currentUser = null;
                allUsers = [];
            }
        });

        attachEventListeners();
        isInitialized = true;
        if(taskNameEl) taskNameEl.setAttribute('contenteditable', 'true');
        console.log("TaskSidebar: Module initialized.");
    }
    
    function open(taskId) {
        if (!isInitialized) init();
        if (!taskId) return;
        
        detachAllListeners();

        const taskRef = doc(db, "tasks", taskId);
        taskListenerUnsubscribe = onSnapshot(taskRef, async (taskDoc) => {
            if (taskDoc.exists()) {
                currentTask = { ...taskDoc.data(), id: taskDoc.id };

                if (!currentProject || currentProject.id !== currentTask.projectId) {
                    await fetchProjectAndUsers(currentTask.projectId);
                }

                renderSidebar(currentTask);
                sidebar.classList.add('is-visible');

                listenToActivity(currentTask.id);
                if (currentTask.chatuuid) {
                    listenToMessages(currentTask.chatuuid);
                } else {
                    renderActiveTab(); // Render empty state
                }
            } else {
                console.error(`TaskSidebar: Task with ID ${taskId} not found.`);
                close();
            }
        });
    }

    async function fetchProjectAndUsers(projectId) {
        // ... (function remains the same as previous version)
        if (!projectId || !currentUser || !currentWorkspaceId) return;
        try {
            const projectRef = doc(db, `users/${currentUser.id}/myworkspace/${currentWorkspaceId}/projects/${projectId}`);
            const projectDoc = await getDoc(projectRef);
            if (projectDoc.exists()) {
                currentProject = { ...projectDoc.data(), id: projectDoc.id };
                allUsers = await fetchProjectMembers(currentUser.id, currentWorkspaceId, projectId);
            } else {
                console.warn(`TaskSidebar: Project with ID ${projectId} not found.`);
                currentProject = null;
            }
        } catch (error) {
            console.error("TaskSidebar: Error fetching project and users.", error);
        }
    }


    // --- 5. REAL-TIME LISTENERS ---
    function listenToActivity(taskId) {
        const activityCollectionRef = collection(db, "tasks", taskId, "activity");
        const q = query(activityCollectionRef, orderBy("timestamp", "asc"));
        activityListenerUnsubscribe = onSnapshot(q, (snapshot) => {
            allActivities = snapshot.docs.map(doc => ({...doc.data(), id: doc.id }));
            renderActiveTab();
        });
    }

    function listenToMessages(chatuuid) {
        const messagesCollectionRef = collection(db, "messages");
        const q = query(messagesCollectionRef, where("chatuuid", "==", chatuuid), orderBy("timestamp", "asc"));
        messagesListenerUnsubscribe = onSnapshot(q, (snapshot) => {
            allMessages = snapshot.docs.map(doc => ({...doc.data(), id: doc.id }));
            renderActiveTab();
        });
    }
    
    function close() {
        if(sidebar) sidebar.classList.remove('is-visible');
        detachAllListeners();
        // Reset state
        currentTask = null;
        currentProject = null;
        allUsers = [];
        allMessages = [];
        allActivities = [];
        clearImagePreview();
    }
    
    function detachAllListeners() {
        if (taskListenerUnsubscribe) taskListenerUnsubscribe();
        if (activityListenerUnsubscribe) activityListenerUnsubscribe();
        if (messagesListenerUnsubscribe) messagesListenerUnsubscribe();
        taskListenerUnsubscribe = null;
        activityListenerUnsubscribe = null;
        messagesListenerUnsubscribe = null;
    }


    // --- 6. DATA MUTATION & ACTIONS ---
    async function sendMessage(text, imageUrl = null) {
        if (!currentTask || !currentUser) return;
        let { chatuuid } = currentTask;

        // UPDATED: Use robust UUID generation for new chats
        if (!chatuuid) {
            chatuuid = doc(collection(db, 'dummy')).id; // Generate a truly random document ID
            const taskRef = doc(db, "tasks", currentTask.id);
            await updateDoc(taskRef, { chatuuid });
            currentTask.chatuuid = chatuuid;
            listenToMessages(chatuuid);
        }
        
        await addDoc(collection(db, "messages"), {
            chatuuid: chatuuid,
            projectId: currentTask.projectId,
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderAvatar: currentUser.avatar,
            text: text,
            imageUrl: imageUrl,
            timestamp: serverTimestamp()
        });
    }
    
    async function handleCommentSubmit() {
        // ... (function remains the same as previous version)
        if (!currentUser) {
            alert("You must be logged in to send a message.");
            return;
        }
        const text = commentInput.value.trim();
        const filesToUpload = [...pastedFiles];
        if (!text && filesToUpload.length === 0) return;
        
        sendCommentBtn.disabled = true;
        commentInput.disabled = true;
        commentInput.value = '';
        clearImagePreview();

        try {
            if (filesToUpload.length > 0) {
                const file = filesToUpload[0];
                const chatuuid = currentTask.chatuuid || doc(collection(db, 'dummy')).id;
                const storageRef = ref(storage, `chats/${chatuuid}/${Date.now()}-${file.name}`);
                
                const snapshot = await uploadBytes(storageRef, file);
                const downloadURL = await getDownloadURL(snapshot.ref);
                await sendMessage(text, downloadURL);
            } else {
                await sendMessage(text, null);
            }
        } catch (error) {
            console.error("TaskSidebar: Failed to submit comment.", error);
            commentInput.value = text;
        } finally {
            sendCommentBtn.disabled = false;
            commentInput.disabled = false;
        }
    }
    
    async function logActivity({ action, field, from, to }) {
        // ... (function remains the same as previous version)
        if (!currentTask || !currentUser) return;
        const activityCollectionRef = collection(db, "tasks", currentTask.id, "activity");
        await addDoc(activityCollectionRef, {
            type: 'log',
            userId: currentUser.id,
            userName: currentUser.name,
            userAvatar: currentUser.avatar,
            timestamp: serverTimestamp(),
            details: `<strong>${currentUser.name}</strong> ${action} <strong>${field}</strong> from <strong>${from || 'none'}</strong> to <strong>${to || 'none'}</strong>.`
        });
    }

    // --- 7. UI RENDERING ---
    function renderSidebar(task) {
        if (!task || !sidebar) return;
        taskNameEl.textContent = task.name;
        taskDescriptionEl.textContent = task.description || 'No description provided.';
        const isCompleted = task.status === 'Completed';
        sidebar.classList.toggle('task-is-completed', isCompleted);
        taskCompleteBtn.classList.toggle('completed', isCompleted);
        taskCompleteText.textContent = isCompleted ? 'Completed' : 'Mark complete';
        renderTaskFields(task);
        renderActiveTab();
    }
    
    // --- UPDATED: renderTaskFields ---
    function renderTaskFields(task) {
        if (!taskFieldsContainer) return;
        taskFieldsContainer.innerHTML = '';
        if (!currentProject) {
            taskFieldsContainer.innerHTML = '<div>Loading project data...</div>';
            return;
        }
        
        const table = document.createElement('table');
        table.className = 'task-fields-table';
        const tbody = document.createElement('tbody');
        
        // Render Standard Fields
        appendFieldToTable(tbody, 'Project', currentProject.title || 'N/A');
        appendFieldToTable(tbody, 'Assignee', renderAssigneeValue(task.assignees));
        appendFieldToTable(tbody, 'Due date', task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No date');
        appendFieldToTable(tbody, 'Priority', createTag(task.priority, defaultPriorityColors[task.priority]));
        appendFieldToTable(tbody, 'Status', createTag(task.status, defaultStatusColors[task.status]));

        // Render Custom Fields
        if (currentProject.customColumns && currentProject.customColumns.length > 0) {
            currentProject.customColumns.forEach(col => {
                const taskValue = task.customFields ? task.customFields[col.id] : null;
                let displayHTML;

                if (col.type === 'Type' && taskValue) {
                    const option = col.options.find(opt => opt.name === taskValue);
                    displayHTML = createTag(taskValue, option ? option.color : '#ccc');
                } else if (taskValue) {
                    displayHTML = `<span>${taskValue}</span>`;
                } else {
                    displayHTML = `<span class="text-gray-400">Not set</span>`;
                }
                
                appendFieldToTable(tbody, col.name, displayHTML);
            });
        }

        taskFieldsContainer.appendChild(table);
    }
    
    function appendFieldToTable(tbody, label, valueHTML) {
        const row = tbody.insertRow();
        const labelCell = row.insertCell();
        labelCell.className = 'sidebarprojectfield-label';
        labelCell.textContent = label;
        
        const valueCell = row.insertCell();
        valueCell.className = 'sidebarprojectfield-value';
        if (typeof valueHTML === 'string') {
            valueCell.innerHTML = valueHTML;
        } else {
            valueCell.appendChild(valueHTML);
        }
    }

    function renderAssigneeValue(assignees) {
        if (assignees && assignees.length > 0) {
            const user = allUsers.find(u => u.id === assignees[0]);
            if (user) {
                return `<div class="flex items-center">
                            <div class="avatar w-6 h-6 mr-2" style="background-image: url(${user.avatar})" title="${user.name}"></div>
                            <span>${user.name}</span>
                        </div>`;
            }
        }
        return '<span>Unassigned</span>';
    }
    
    // UPDATED: createTag now accepts a color
    function createTag(text, color = '#e0e0e0') {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.textContent = text;
        tag.style.backgroundColor = color;
        // Basic logic for text color contrast
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        tag.style.color = (yiq >= 128) ? '#000000' : '#ffffff';
        return tag;
    }
    
    function renderActiveTab() {
        if (!tabsContainer || !activityLogContainer) return;
        const activeTab = tabsContainer.querySelector('.tab-btn.active')?.dataset.tab || 'chat';

        activityLogContainer.innerHTML = '';
        activityLogContainer.className = 'activity-log-container';
        
        if (activeTab === 'chat') {
            activityLogContainer.classList.add('show-chat');
            renderMessages();
        } else {
            activityLogContainer.classList.add('show-activity');
            renderActivityLogs();
        }
    }
    
    function renderMessages() {
        // ... (function remains the same as previous version)
        if (allMessages.length === 0) {
            activityLogContainer.innerHTML = `<div class="placeholder-text">No messages yet. Start the conversation!</div>`;
            return;
        }
        allMessages.forEach(msg => {
            const item = document.createElement('div');
            item.className = 'comment-item';
            
            let imageHTML = msg.imageUrl ? `<div class="log-attachment"><a href="${msg.imageUrl}" target="_blank" rel="noopener noreferrer"><img class="scalable-image" src="${msg.imageUrl}" alt="User attachment"></a></div>` : '';
            let textHTML = msg.text ? `<div class="comment-text">${msg.text}</div>` : '';

            item.innerHTML = `
                <div class="avatar" style="background-image: url(${msg.senderAvatar})"></div>
                <div class="comment-body">
                    <div class="comment-header">
                        <span class="comment-author">${msg.senderName}</span> 
                        <span class="comment-timestamp">${formatTimestamp(msg.timestamp)}</span>
                    </div>
                    ${textHTML}
                    ${imageHTML}
                </div>`;
            activityLogContainer.appendChild(item);
        });
        activityLogContainer.scrollTop = activityLogContainer.scrollHeight;
    }

    function renderActivityLogs() {
        // ... (function remains the same as previous version)
        if (allActivities.length === 0) {
            activityLogContainer.innerHTML = `<div class="placeholder-text">No activity to show.</div>`;
            return;
        }
        allActivities.forEach(log => {
            const item = document.createElement('div');
            item.className = 'log-item';
            item.innerHTML = `
                <div class="avatar" style="background-image: url(${log.userAvatar})"></div>
                <div class="comment-body">
                    <div class="comment-header">
                        <span class="comment-author">${log.userName}</span>
                        <span class="comment-timestamp">${formatTimestamp(log.timestamp)}</span>
                    </div>
                    <div class="activity-change-log">${log.details}</div>
                </div>`;
            activityLogContainer.appendChild(item);
        });
    }


    // --- 8. EVENT LISTENERS ---
    function attachEventListeners() {
        if (!sidebar) return;
        closeBtn.addEventListener('click', close);
        sendCommentBtn.addEventListener('click', handleCommentSubmit);
        commentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCommentSubmit();
            }
        });
        
        tabsContainer.addEventListener('click', (e) => {
            if (e.target.matches('.tab-btn')) {
                tabsContainer.querySelector('.active').classList.remove('active');
                e.target.classList.add('active');
                renderActiveTab();
            }
        });
    }
    
    function clearImagePreview() {
        pastedFiles = [];
        if (imagePreviewContainer) imagePreviewContainer.innerHTML = '';
        if (commentInputWrapper) commentInputWrapper.classList.remove('preview-active');
        if (commentInput) commentInput.placeholder = 'Send a message...';
        if (fileUploadInput) fileUploadInput.value = "";
    }


    // --- 9. PUBLIC INTERFACE ---
    return {
        init,
        open
    };
})();


document.addEventListener('DOMContentLoaded', () => {
    if (window.TaskSidebar) {
        window.TaskSidebar.init();
    }
});