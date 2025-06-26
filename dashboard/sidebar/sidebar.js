// =================================================================================
// TaskSidebar Module: Real-time Task Management with Firebase
// Version: 5.0.0
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
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    getDoc,
    getDocs,
    orderBy,
    limit,
    collectionGroup,
    writeBatch,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

import {
    firebaseConfig
} from "/services/firebase-config.js";
import { getHeaderRight } from '../dashboard/tasks/tabs/list/list.js';

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
    let currentUserId = null;
    let currentTaskRef = null;
    let currentProject = null;
    let currentProjectRef = null;
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
        expandBtn, deleteTaskBtn,
        tabsContainer, activityLogContainer, commentInput, sendCommentBtn,
        imagePreviewContainer, currentUserAvatarEl, taskCompleteText, taskCompleteBtn, fileUploadInput, commentInputWrapper;
    
    let rightSidebarContainer;
    let listviewHeaderRight;
    
    // --- 3. CORE LOGIC ---
    function init() {
        if (isInitialized) return;
        rightSidebarContainer = document.getElementById('right-sidebar');
        sidebar = document.getElementById('task-sidebar');
        taskNameEl = document.getElementById('task-name');
        taskDescriptionEl = document.getElementById('task-description-text');
        taskFieldsContainer = document.getElementById('task-fields-container');
        taskCompleteBtn = document.getElementById('task-complete-btn');
        taskCompleteText = document.getElementById('task-complete-text');
        closeBtn = document.getElementById('close-sidebar-btn');
        expandBtn = document.getElementById('toggle-full-view-btn');
        deleteTaskBtn = document.getElementById('delete-task-btn');
        tabsContainer = document.getElementById('comment-tabs-container');
        currentUserAvatarEl = document.getElementById('current-user-avatar');
        activityLogContainer = document.getElementById('activity-log-container');
        commentInput = document.getElementById('comment-input');
        sendCommentBtn = document.getElementById('send-comment-btn');
        imagePreviewContainer = document.getElementById('pasted-image-preview-container');
        fileUploadInput = document.getElementById('file-upload-input');
        commentInputWrapper = document.querySelector('.comment-input-wrapper');
        
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUserId = user.uid;
                
                // 1. Create a reference to the user's profile document in Firestore.
                const userDocRef = doc(db, "users", user.uid);
                
                try {
                    // 2. Fetch the document from Firestore.
                    const userDocSnap = await getDoc(userDocRef);
                    
                    if (userDocSnap.exists()) {
                        // 3. If the document exists, get its data.
                        const firestoreUserData = userDocSnap.data();
                        
                        // 4. Construct the currentUser object using Firestore data first,
                        //    with fallbacks to the Auth profile and then a default.
                        currentUser = {
                            id: user.uid,
                            name: firestoreUserData.name || user.displayName || 'Anonymous User',
                            avatar: firestoreUserData.avatar || user.photoURL || 'https://i.imgur.com/k9qRkiG.png'
                        };
                        
                        
                        
                    } else {
                        // If no profile exists in Firestore, fall back to the basic Auth info.
                        console.warn(`No profile document found for user ${user.uid}. Using default auth info.`);
                        currentUser = {
                            id: user.uid,
                            name: user.displayName || 'Anonymous User',
                            avatar: user.photoURL || 'https://i.imgur.com/k9qRkiG.png'
                        };
                    }
                } catch (error) {
                    console.error("Error fetching user profile from Firestore:", error);
                    // Fallback in case of an error during the fetch.
                    currentUser = {
                        id: user.uid,
                        name: user.displayName || 'Anonymous User',
                        avatar: user.photoURL || 'https://i.imgur.com/k9qRkiG.png'
                    };
                }
                
                if (currentUserAvatarEl && currentUser.avatar) {
                    currentUserAvatarEl.style.backgroundImage = `url(${currentUser.avatar})`;
                }
                
                // 5. The rest of the logic continues as before.
                await fetchActiveWorkspace(user.uid);
                
            } else {
                // This part remains the same.
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
            
            currentProjectRef = currentTaskRef.parent.parent.parent;
            
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
                    
                    allUsers = await fetchProjectMembers(ownerId, workspaceId, currentTask.projectId);
                    sidebar.classList.add('is-visible');
                    rightSidebarContainer.classList.add('sidebar-open');
                    
                    renderSidebar(currentTask);
                    
                    listenToActivity();
                    listenToMessages();
                    
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
        rightSidebarContainer.classList.remove('sidebar-open');
        const headerRight = getHeaderRight();
        headerRight.classList.remove('hide');
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
                generateCustomTagStyles(currentProject);
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
        return userDocs.filter(d => d.exists()).map(d => ({ id: d.id, name: d.data().name, avatar: d.data().avatar }));
    }
    
    async function updateCustomField(columnId, newValue, column) {
        if (!currentTaskRef || !currentTask) return;
        const fieldKey = `customFields.${columnId}`;
        let parsedValue = newValue;
        if (column.type === 'Numbers' || column.type === 'Costing') {
            parsedValue = parseFloat(newValue) || 0;
        }
        const oldValue = currentTask.customFields ? currentTask.customFields[columnId] : null;
        if (oldValue === parsedValue) return;
        
        try {
            await updateDoc(currentTaskRef, {
                [fieldKey]: parsedValue
            });
            logActivity({ action: 'updated', field: column.name, from: oldValue, to: parsedValue });
        } catch (error) { console.error(`Failed to update custom field ${column.name}:`, error); }
    }
    
    // --- 5. REAL-TIME LISTENERS ---
    function listenToActivity() {
        activityListenerUnsubscribe = onSnapshot(query(collection(currentTaskRef, "activity"), orderBy("timestamp", "asc")), (snapshot) => {
            allActivities = snapshot.docs.map(doc => doc.data());
            renderActiveTab();
        });
    }
    
    function listenToMessages() {
        if (!currentProject || !currentTask) {
            console.error("DEBUG: listenToMessages stopped: currentProject or currentTask is missing.");
            return;
        }
        
        const messagesPath = `globalChatProjects/${currentProject.id}/tasks/${currentTask.id}/Messages`;
        console.log("DEBUG: Attempting to listen for messages at path:", messagesPath);
        
        const messagesQuery = query(collection(db, messagesPath), orderBy("timestamp", "asc"));
        
        messagesListenerUnsubscribe = onSnapshot(messagesQuery, (snapshot) => {
            console.log(`DEBUG: Message snapshot received. Found ${snapshot.size} documents.`);
            if (snapshot.empty) {
                console.warn("DEBUG: Query returned 0 messages. Please check a) data exists at the path, and b) your security rules allow a 'list' operation on this path.");
            }
            allMessages = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            renderActiveTab();
        }, (error) => {
            console.error("DEBUG: CRITICAL ERROR in message listener. This is almost certainly a PERMISSION DENIED error from your Firestore Security Rules.", error);
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
        const details = `<strong>${currentUser.name}</strong> ${action}` +
            `${field ? ` <strong>${field}</strong>` : ''}` +
            `${from ? ` from <strong>'${from}'</strong>` : ''}` +
            `${to ? ` to <strong>'${to}'</strong>` : ''}.`;
        await addDoc(collection(currentTaskRef, "activity"), {
            type: 'log',
            userId: currentUser.id,
            userName: currentUser.name,
            userAvatar: currentUser.avatar,
            timestamp: serverTimestamp(),
            details: details
        });
    }
    
    async function updateMessage(messageId, updates) {
        const messageRef = doc(db, `globalChatProjects/${currentProject.id}/tasks/${currentTask.id}/Messages`, messageId);
        
        // If a new image file is part of the update, handle the upload/delete process
        if (updates.newImageFile) {
            // 1. Upload the new image
            const storagePath = `workspaceProjects/${currentProject.id}/messages-attachments/${Date.now()}-${updates.newImageFile.name}`;
            const newImageRef = ref(storage, storagePath);
            const snapshot = await uploadBytes(newImageRef, updates.newImageFile);
            updates.imageUrl = await getDownloadURL(snapshot.ref);
            
            // 2. If there was an old image, delete it from storage
            if (updates.oldImageUrl) {
                try { await deleteObject(ref(storage, updates.oldImageUrl)); } catch (e) { console.warn("Old image not found, may have been deleted already."); }
            }
        }
        
        // Remove temporary properties before updating Firestore
        delete updates.newImageFile;
        delete updates.oldImageUrl;
        
        // Add the 'editedAt' timestamp
        updates.editedAt = serverTimestamp();
        await updateDoc(messageRef, updates);
        logActivity({ action: 'edited a message' });
    }
    
    async function deleteMessage(messageId, imageUrl, messageText) {
        if (imageUrl) {
            try { await deleteObject(ref(storage, imageUrl)); }
            catch (error) { if (error.code !== 'storage/object-not-found') console.error("Failed to delete image:", error); }
        }
        await deleteDoc(doc(db, `globalChatProjects/${currentProject.id}/tasks/${currentTask.id}/Messages`, messageId));
        logActivity({ action: 'deleted a comment', field: `"${messageText.substring(0, 30)}..."` });
    }
    
    async function toggleReaction(messageId, reactionType) {
        if (!currentUser) return;
        const messageRef = doc(db, `globalChatProjects/${currentProject.id}/tasks/${currentTask.id}/Messages`, messageId);
        const messageDoc = await getDoc(messageRef);
        if (!messageDoc.exists()) return;
        const reactions = messageDoc.data().reactions?.[reactionType] || [];
        const fieldPath = `reactions.${reactionType}`;
        if (reactions.includes(currentUser.id)) {
            await updateDoc(messageRef, {
                [fieldPath]: arrayRemove(currentUser.id)
            });
        } else {
            await updateDoc(messageRef, {
                [fieldPath]: arrayUnion(currentUser.id)
            });
            logActivity({ action: 'liked', field: 'a comment' });
        }
    }
    
    async function sendMessage(messageText, messageNote, imageUrl) {
        if (!currentProject || !currentTask || !currentUser) return;
        
        // The path to the global chat collection remains the same.
        const messagesPath = `globalChatProjects/${currentProject.id}/tasks/${currentTask.id}/Messages`;
        
        // Create a reference for the new message document.
        const newMessageRef = doc(collection(db, messagesPath));
        
        // --- THIS IS THE KEY FIX ---
        // Check if the parent task has a chatuuid field yet.
        if (!currentTask.chatuuid) {
            // If not, update the task document. Use the task's own ID as the
            // stable, unique identifier for its chat thread.
            await updateDoc(currentTaskRef, { chatuuid: currentTask.id });
        }
        // --- END FIX ---
        
        // Save the new message document.
        await setDoc(newMessageRef, {
            id: newMessageRef.id, // The message's own unique ID
            message: messageText,
            messageNote: messageNote,
            imageUrl: imageUrl,
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderAvatar: currentUser.avatar,
            timestamp: serverTimestamp(),
            reactions: { "like": [] }
        });
        
        // The activity logging works perfectly.
        const logText = imageUrl ? 'attached an image' : `commented: "${messageText.substring(0, 20)}..."`;
        logActivity({ action: logText });
    }
    
    /**
     * Handles sending a message. It intelligently determines if the typed text
     * should be the main message or a note for an attached image.
     */
    async function handleCommentSubmit() {
        // 1. Get text from input and staged files from the preview.
        const inputText = commentInput.value.trim();
        const files = [...pastedFiles];
        
        // 2. Do nothing if there's no text and no files.
        if (!inputText && files.length === 0) return;
        
        // 3. Clear the inputs immediately for a responsive feel.
        commentInput.value = '';
        clearImagePreview();
        
        try {
            let message = '';
            let messageNote = null;
            let imageUrl = null;
            
            // 4. Handle image upload if a file is present.
            if (files.length > 0) {
                const file = files[0];
                // If an image is present, the input text becomes the note for that image.
                message = inputText;
                
                const storagePath = `workspaceProjects/${currentProject.id}/messages-attachments/${Date.now()}-${file.name}`;
                const storageRef = ref(storage, storagePath);
                const snapshot = await uploadBytes(storageRef, file);
                imageUrl = await getDownloadURL(snapshot.ref);
            } else {
                // If there's no image, the input text is the main message.
                message = inputText;
            }
            
            // 5. Send the message to Firestore with the prepared data.
            await sendMessage(message, messageNote, imageUrl);
            
        } catch (error) {
            console.error("Failed to send message:", error);
            // Optionally, you could restore the input text if sending fails
            commentInput.value = inputText;
        }
    }
    
    // =================================================================================
    // --- 7. UI RENDERING (Final Polished Version) ---
    // =================================================================================
    
    /**
     * Renders the entire sidebar with the latest task data.
     */
    function renderSidebar(task) {
        // --- THIS IS THE KEY FIX ---
        // Check the task's status and toggle the CSS class on the main sidebar element
        const isCompleted = task.status === 'Completed';
        sidebar.classList.toggle('is-task-completed', isCompleted);
        // --- END FIX ---
        
        // Update the main completion button's appearance and text
        taskCompleteBtn.classList.toggle('completed', isCompleted);
        taskCompleteText.textContent = isCompleted ? 'Completed' : 'Mark complete';
        
        // Render the rest of the sidebar
        taskNameEl.textContent = task.name;
        taskDescriptionEl.textContent = task.description || "Add a description...";
        renderTaskFields(task);
        renderActiveTab();
    }
    
    /**
     * Renders all fields into a two-column table with custom controls.
     */
    /**
     * Renders all fields, now correctly handling empty values for ALL field types
     * to ensure they always display "Not set" and remain clickable.
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
        appendFieldToTable(tbody, 'dueDate', 'Due Date', renderDateValue(task.dueDate), 'date');
        
        // --- PRIORITY FIELD LOGIC ---
        const priorityValue = task.priority;
        let priorityHTML = '<span>Not set</span>'; // Default to "Not set"
        if (priorityValue) {
            let priorityColor = currentProject.customPriorities?.find(p => p.name === priorityValue)?.color || defaultPriorityColors[priorityValue];
            priorityHTML = createTag(priorityValue, priorityColor);
        }
        appendFieldToTable(tbody, 'priority', 'Priority', priorityHTML, 'priority');
        
        // --- STATUS FIELD LOGIC ---
        const statusValue = task.status;
        let statusHTML = '<span>Not set</span>'; // Default to "Not set"
        if (statusValue) {
            let statusColor = currentProject.customStatuses?.find(s => s.name === statusValue)?.color || defaultStatusColors[statusValue];
            statusHTML = createTag(statusValue, statusColor);
        }
        appendFieldToTable(tbody, 'status', 'Status', statusHTML, 'status');
        
        // --- Render Custom Fields ---
        currentProject.customColumns?.forEach(col => {
            const value = task.customFields ? task.customFields[col.id] : null;
            let displayHTML = '<span>Not set</span>'; // Default to "Not set"
            if (value != null && value !== '') { // Explicitly check for non-empty string
                if (col.type === 'Type' && col.options) {
                    const option = col.options.find(opt => opt.name === value);
                    displayHTML = createTag(value, option ? option.color : '#ccc');
                } else if (col.type === 'Costing') {
                    displayHTML = `<span>${col.currency || '$'}${value}</span>`;
                } else {
                    displayHTML = `<span>${value}</span>`;
                }
            }
            appendFieldToTable(tbody, `custom-${col.id}`, col.name, displayHTML, 'custom-field', 'custom-field-value');
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
    
    // Add this new function inside your TaskSidebar module
    
    /**
     * Creates and shows a dropdown with a search input for assigning users.
     * This version is specifically for the Task Sidebar.
     * @param {HTMLElement} targetEl The element that was clicked to open the dropdown.
     */
    function showSidebarAssigneeDropdown(targetEl) {
        closePopovers(); // Use the sidebar's own popover closer
        
        if (!currentTask) return; // Guard clause
        
        const dropdown = document.createElement('div');
        dropdown.className = 'context-dropdown';
        dropdown.style.visibility = 'hidden';
        
        // --- Search Input ---
        const searchInput = document.createElement('input');
        searchInput.className = 'dropdown-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = 'Search teammates...';
        dropdown.appendChild(searchInput);
        
        // --- List Container ---
        const listContainer = document.createElement('div');
        listContainer.className = 'dropdown-list';
        dropdown.appendChild(listContainer);
        
        // --- Add "Unassigned" Option ---
        const unassignedItem = document.createElement('div');
        unassignedItem.className = 'dropdown-item';
        unassignedItem.innerHTML = `<div class="user-info"><span>Unassigned</span></div>`;
        unassignedItem.addEventListener('click', () => {
            updateTaskField('assignees', []); // Set assignees to empty array
            closePopovers();
        });
        listContainer.appendChild(unassignedItem);
        
        
        // --- Render Filtered User List ---
        const renderList = (searchTerm = '') => {
            // Clear previous user list (but keep "Unassigned")
            listContainer.querySelectorAll('.user-list-item').forEach(el => el.remove());
            
            const lower = searchTerm.toLowerCase();
            const filtered = allUsers.filter(u => u.name.toLowerCase().includes(lower));
            
            filtered.forEach(user => {
                const isAssigned = currentTask.assignees && currentTask.assignees.includes(user.id);
                const item = document.createElement('div');
                // Add a class to differentiate from the "Unassigned" item
                item.className = 'dropdown-item user-list-item';
                item.innerHTML = `
                <div class="user-info">
                    <div class="avatar" style="background-image: url(${user.avatar})"></div>
                    <span>${user.name}</span>
                </div>
                ${isAssigned ? '<i class="fas fa-check assigned-check"></i>' : ''}
            `;
                item.addEventListener('click', () => {
                    // When a user is clicked, we call the sidebar's own update function
                    updateTaskField('assignees', [user.id]);
                    closePopovers();
                });
                listContainer.appendChild(item);
            });
        };
        
        renderList();
        searchInput.addEventListener('input', () => renderList(searchInput.value));
        
        document.body.appendChild(dropdown);
        
        // Position the dropdown relative to the clicked element
        const rect = targetEl.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.minWidth = `${rect.width}px`;
        dropdown.style.visibility = 'visible';
        
        searchInput.focus();
    }
    
    function createTag(text, color = '#e0e0e0') {
        if (!text) return '<span>Not set</span>';
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16),
            g = parseInt(hex.substring(2, 4), 16),
            b = parseInt(hex.substring(4, 6), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return `<div class="tag" style="background-color: ${color}; color: ${(yiq >= 128) ? '#000' : '#fff'};">${text}</div>`;
    }
    /**
     * Renders the HTML for the assignee field with the correct design.
     * Shows the assigned user's avatar and name, or a circular plus button if unassigned.
     */
    
    function renderAssigneeValue(assignees) {
        console.log('--- renderAssigneeValue called ---');
        console.log('Received assignees array:', assignees);
        
        // If an assignee exists (and the array isn't empty), show their avatar and name.
        if (assignees && assignees.length > 0) {
            const assigneeId = assignees[0];
            console.log(`Processing assignee UID: "${assigneeId}"`);
            
            // Log the state of allUsers right before you search it. This is the most important check.
            console.log('Searching for user in `allUsers` array. Current `allUsers`:', allUsers);
            
            const user = allUsers.find(u => u.id === assigneeId);
            
            // Log the result of the find operation.
            console.log('Result of find operation (user object):', user);
            
            if (user) {
                // This is the HTML for an assigned user
                console.log(`SUCCESS: Found user "${user.name}". Rendering their details.`);
                return `<div class="assignee-list-wrapper">
                        <div class="avatar" style="background-image: url(${user.avatar})"></div>
                        <span>${user.name}</span>
                    </div>`;
            }
            
            // This block runs if the user ID was in the array, but not found in allUsers
            console.error(`FAILURE: User with UID "${assigneeId}" could not be found in the allUsers array.`);
            return '<span>Unknown User</span>';
        }
        
        // This block runs if the assignees array was empty or null
        console.log('No assignees found. Rendering the "add assignee" button.');
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
    
    function renderMessages() {
        const activeTab = tabsContainer.querySelector('.active')?.dataset.tab || 'chat';
        if (activeTab !== 'chat') return;
        
        const addCommentForm = document.getElementById('add-comment-form');
        if (addCommentForm) addCommentForm.style.display = 'flex';
        
        activityLogContainer.innerHTML = '';
        if (allMessages.length === 0) {
            activityLogContainer.innerHTML = `<div class="placeholder-text">No messages yet. Start the conversation!</div>`;
            return;
        }
        
        allMessages.forEach(msg => {
            const item = document.createElement('div');
            item.className = 'comment-item';
            item.dataset.messageId = msg.id;
            
            // --- All the logic for icons (like, edit, delete) remains the same ---
            const isAuthor = msg.senderId === currentUser.id;
            const hasLiked = msg.reactions?.like?.includes(currentUser.id);
            const likeCount = msg.reactions?.like?.length || 0;
            const likeIconClass = hasLiked ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up';
            const reactionsHTML = `<button class="react-btn like-btn ${hasLiked ? 'reacted' : ''}" title="Like"><i class="${likeIconClass}"></i> <span class="like-count">${likeCount > 0 ? likeCount : ''}</span></button>`;
            let authorActionsHTML = isAuthor ? `<button class="edit-comment-btn" title="Edit"><i class="fa-solid fa-pencil"></i></button><button class="delete-comment-btn" title="Delete"><i class="fa-solid fa-trash"></i></button>` : '';
            const iconsHTML = `<div class="sidebarcommenticons">${reactionsHTML}${authorActionsHTML}</div>`;
            const timestamp = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleString() : 'Sending...';
            
            // --- THIS IS THE KEY CHANGE ---
            // The HTML for the editing area has been simplified.
            
            // This is the content that shows by default.
            const displayAreaHTML = `
            <div class="comment-display-area">
                <div class="comment-text">${msg.message || ''}</div>
                ${msg.imageUrl ? `<div class="log-attachment"><img class="scalable-image" src="${msg.imageUrl}" alt="Attachment"></div>` : ''}
            </div>
        `;
            
            // This is the simplified editing interface.
            const editAreaHTML = `
            <div class="comment-edit-area" style="display: none;">
                <textarea class="comment-edit-input" placeholder="Edit message...">${msg.message || ''}</textarea>
                ${msg.imageUrl ? `
                    <div class="sidebareditimage-container">
                        <img src="${msg.imageUrl}" class="current-image-preview">
                        <button class="change-image-btn"><i class="fa-solid fa-camera"></i> Replace Image</button>
                    </div>
                ` : ''}
                <div class="comment-edit-actions">
                    <button class="btn-cancel-edit">Cancel</button>
                    <button class="btn-save-edit">Save</button>
                </div>
            </div>
        `;
            
            // Assemble the Final Message Item
            item.innerHTML = `
            <div class="avatar" style="background-image: url(${msg.senderAvatar})"></div>
            <div class="comment-body">
                <div class="comment-header">
                    <div class="comment-meta">
                        <span class="comment-author">${msg.senderName}</span> 
                        <span class="comment-timestamp">${timestamp}${msg.editedAt ? ' (edited)' : ''}</span>
                    </div>
                    ${iconsHTML}
                </div>
                <div class="comment-content-wrapper">
                    ${displayAreaHTML}
                    ${editAreaHTML}
                </div>
            </div>
        `;
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
    
    // --- 8. EVENT LISTENERS ---
    function attachEventListeners() {
        if (!sidebar) return;
        
        
        activityLogContainer.addEventListener('click', (e) => {
            const messageItem = e.target.closest('.comment-item');
            if (!messageItem) return;
            const messageId = messageItem.dataset.messageId;
            const messageData = allMessages.find(m => m.id === messageId);
            if (!messageData) return;
            
            const displayArea = messageItem.querySelector('.comment-display-area');
            const editArea = messageItem.querySelector('.comment-edit-area');
            
            // --- Handle Likes ---
            if (e.target.closest('.like-btn')) {
                toggleReaction(messageId, 'like');
            }
            
            // --- Handle Delete ---
            if (e.target.closest('.delete-comment-btn')) {
                if (confirm('Are you sure you want to delete this message?')) {
                    deleteMessage(messageId, messageData.imageUrl, messageData.message);
                }
            }
            
            // --- Handle STARTING an Edit ---
            if (e.target.closest('.edit-comment-btn')) {
                displayArea.style.display = 'none';
                editArea.style.display = 'block';
                editArea.querySelector('.comment-edit-input').focus();
            }
            
            // --- Handle CANCELING an Edit ---
            if (e.target.closest('.btn-cancel-edit')) {
                editArea.style.display = 'none';
                displayArea.style.display = 'block';
                delete messageItem._stagedFile; // Clear any staged file if cancel
            }
            
            // --- Handle SAVING an Edit ---
            if (e.target.closest('.btn-save-edit')) {
                // The updates object is now much simpler. It no longer needs to read a note input.
                const updates = {
                    message: messageItem.querySelector('.comment-edit-input').value.trim(),
                    newImageFile: messageItem._stagedFile || null,
                    oldImageUrl: messageData.imageUrl
                };
                updateMessage(messageId, updates);
                
                // Reset the UI
                editArea.style.display = 'none';
                displayArea.style.display = 'block';
                delete messageItem._stagedFile;
            }
            
            // --- Handle CHANGING an Image ---
            if (e.target.closest('.change-image-btn')) {
                const editImageInput = document.getElementById('edit-image-upload-input');
                
                // This listener is temporary and will only fire once for this specific edit
                editImageInput.onchange = (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        // Stage the file on the DOM element itself to be picked up when "Save" is clicked
                        messageItem._stagedFile = file;
                        
                        // Show a temporary local preview of the new image
                        const newPreviewUrl = URL.createObjectURL(file);
                        // We need to find the image tag in the DISPLAY area to update its preview
                        const displayImage = displayArea.querySelector('.scalable-image');
                        if (displayImage) displayImage.src = newPreviewUrl;
                    }
                };
                editImageInput.click();
            }
        });
        taskCompleteBtn.addEventListener('click', () => {
            if (!currentTask) return;
            const newStatus = currentTask.status === 'Completed' ? 'On track' : 'Completed';
            updateTaskField('status', newStatus);
        });
        // Standard listeners
        closeBtn.addEventListener('click', close);
        expandBtn.addEventListener('click', toggleSidebarView);
        deleteTaskBtn.addEventListener('click', deleteCurrentTask);
        
        sendCommentBtn.addEventListener('click', handleCommentSubmit);
        commentInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCommentSubmit();
            }
        });
        
        const uploadFileBtn = document.getElementById('upload-file-btn');
        if (uploadFileBtn) {
            uploadFileBtn.addEventListener('click', () => fileUploadInput.click());
        }
        
        fileUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                pastedFiles = [file];
                addImagePreview(file);
            }
        });
        
        commentInput.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            
            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    if (file) {
                        pastedFiles.push(file);
                        addImagePreview(file);
                        e.preventDefault(); // Prevent text paste
                    }
                }
            }
        });
        
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
                case 'custom-field': {
    // The key still tells us which column it is (e.g., "custom-12345")
    const columnId = key.split('-')[1];
    const column = currentProject.customColumns.find(c => c.id == columnId);
    
    if (!column) return; // Safety check
    
    // Now, we check the column's type to decide what kind of editor to open.
    if (column.type === 'Type' && column.options) {
        // It's a dropdown-style custom field
        createGenericDropdown(control, column.options, (opt) => updateCustomField(columnId, opt.name, column));
        
    } else if (['Text', 'Numbers', 'Costing'].includes(column.type)) {
        // It's a text/number-style custom field
        makeTextFieldEditable(control, columnId, column);
    }
    break;
                }
                case 'project': {
                    const options = workspaceProjects.map(p => ({ label: p.title, value: p.id }));
                    createGenericDropdown(control, options, (newProjectId) => moveTask(newProjectId));
                    break;
                }
                case 'assignee': {
                    // It now makes a single, clean call to our new function.
                    showSidebarAssigneeDropdown(control);
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
                    let allPriorityOptions = priorityOptions.map(p => ({
                        name: p,
                        color: defaultPriorityColors[p]
                    }));
                    
                    if (currentProject.customPriorities && currentProject.customPriorities.length > 0) {
                        allPriorityOptions = [...allPriorityOptions, ...currentProject.customPriorities];
                    }
                    
                    console.log("Final options for Priority dropdown:", allPriorityOptions);
                    
                    createGenericDropdown(control, allPriorityOptions, (selectedOption) => {
                        updateTaskField('priority', selectedOption.name);
                    }, 'Priority');
                    break;
                }
                
                case 'status': {
                    let allStatusOptions = statusOptions.map(s => ({
                        name: s,
                        color: defaultStatusColors[s]
                    }));
                    
                    if (currentProject.customStatuses && currentProject.customStatuses.length > 0) {
                        allStatusOptions = [...allStatusOptions, ...currentProject.customStatuses];
                    }
                    
                    console.log("Final options for Status dropdown:", allStatusOptions);
                    
                    createGenericDropdown(control, allStatusOptions, (selectedOption) => {
                        updateTaskField('status', selectedOption.name);
                    }, 'Status');
                    break;
                }
                case 'Type': {
                    const columnId = key.split('-')[1];
                    const column = currentProject.customColumns.find(c => c.id == columnId);
                    if (column?.options) {
                        createGenericDropdown(control, column.options, (opt) => updateCustomField(columnId, opt.name, column), 'CustomColumn', columnId);
                    }
                    break;
                }
                case 'Numbers':
                case 'Costing':
                case 'Text': {
                    const columnId = key.split('-')[1];
                    const column = currentProject.customColumns.find(c => c.id == columnId);
                    if (column) makeTextFieldEditable(control, columnId, column);
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
                const safeSelectors = '#task-sidebar, .task-name, .flatpickr-calendar, .task-reactions';
                
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
    
    function closeFloatingPanels() {
        document.querySelectorAll('.dialog-overlay, .context-dropdown').forEach(el => el.remove());
    }
    
    /**
     * Creates a generic dropdown with color swatches.
     */
    function createGenericDropdown(targetEl, options, onSelect, optionType = null, columnId = null) {
        closePopovers();
        const dropdown = document.createElement('div');
        dropdown.className = 'context-dropdown';
        
        options.forEach(option => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            
            let itemHTML = '';
            
            // Add a colored swatch if the option has a color property.
            if (option.color) {
                // --- FIX: Added !important to force this color to override any other styles ---
                itemHTML += `<span class="dropdown-color-swatch" style="background-color: ${option.color} !important;"></span>`;
            }
            
            // Add an avatar if the option has one.
            if (option.avatar) {
                itemHTML += `<div class="avatar" style="background-image: url(${option.avatar})"></div>`;
            }
            
            itemHTML += `<span class="dropdown-item-name">${option.label || option.name}</span>`;
            item.innerHTML = itemHTML;
            
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                onSelect(option.value !== undefined ? option.value : option);
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
    /**
     * Makes a text-based custom field editable and handles saving null when cleared.
     */
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
            // --- THIS IS THE KEY FIX ---
            // If the input is cleared, set the value to null. Otherwise, use the input's value.
            const newValue = input.value.trim() === '' ? null : input.value;
            
            // We call the update function, which will handle the Firestore update.
            // The real-time listener will then automatically re-render the field correctly.
            updateCustomField(columnId, newValue, column);
        };
        
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') {
                input.value = oldValue;
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
        
        document.getElementById('confirm-add-option').addEventListener('click', () => {
            const name = document.getElementById('custom-option-name').value.trim();
            const color = document.getElementById('custom-option-color').value;
            if (name) {
                addNewCustomOption(optionType, { name, color });
                closeFloatingPanels();
            } else {
                alert('Please enter a name for the option.');
            }
        });
        
        dialogOverlay.addEventListener('click', e => {
            if (e.target === e.currentTarget || e.target.id === 'cancel-add-option') {
                closeFloatingPanels();
            }
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
        
        document.getElementById('confirm-add-option').addEventListener('click', () => {
            const name = document.getElementById('custom-option-name').value.trim();
            const color = document.getElementById('custom-option-color').value;
            if (name) {
                addNewCustomColumnOption(columnId, { name, color });
                closeFloatingPanels();
            } else {
                alert('Please enter a name for the option.');
            }
        });
        
        dialogOverlay.addEventListener('click', e => {
            if (e.target === e.currentTarget || e.target.id === 'cancel-add-option') {
                closeFloatingPanels();
            }
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
    
async function updateProjectInFirebase(propertiesToUpdate) {
    // Use the direct reference we saved when the sidebar opened.
    if (!currentProjectRef) {
        return console.error("Cannot update project: The reference to the current project is not available.");
    }
    
    try {
        // This now uses the guaranteed-correct reference.
        await updateDoc(currentProjectRef, propertiesToUpdate);
        console.log("✅ Project properties updated successfully in Firestore.");
    } catch (error) {
        console.error("Error updating project properties:", error);
        alert("Error: Could not update project settings.");
    }
}
    
    function addImagePreview(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (!imagePreviewContainer || !commentInputWrapper) return;
            commentInputWrapper.classList.add('preview-active');
            
            const previewItem = document.createElement('div');
            previewItem.className = 'image-preview-item';
            
            // Use file name and last modified time as a unique key for removal
            const fileId = file.name + file.lastModified;
            previewItem.dataset.fileId = fileId;
            
            previewItem.innerHTML = `
            <img src="${event.target.result}" alt="${file.name}">
            <button class="remove-preview-btn" title="Remove image">&times;</button>
        `;
            
            previewItem.querySelector('.remove-preview-btn').addEventListener('click', () => {
                pastedFiles = pastedFiles.filter(f => (f.name + f.lastModified) !== fileId);
                previewItem.remove();
                if (pastedFiles.length === 0) {
                    commentInputWrapper.classList.remove('preview-active');
                }
            });
            
            imagePreviewContainer.appendChild(previewItem);
        };
        reader.readAsDataURL(file);
    }
    
    function clearImagePreview() {
        pastedFiles = [];
        if (imagePreviewContainer) imagePreviewContainer.innerHTML = '';
        if (commentInputWrapper) commentInputWrapper.classList.remove('preview-active');
    }
    
    async function deleteCurrentTask() {
        
        // Use a confirmation modal to warn the user
        const confirmed = confirm(
            'Are you sure you want to permanently delete this task? This action cannot be undone.'
        );
        
        // If the user clicks "Cancel", stop the function
        if (!confirmed) {
            console.log("Task deletion cancelled by user.");
            return;
        }
        
        try {
            // Perform the delete operation on the current task's document reference
            await deleteDoc(currentTaskRef);
            
            console.log(`Task "${currentTask.name}" (${currentTask.id}) was successfully deleted.`);
            
            // Optional: Log this activity
            if (typeof logActivity === 'function') {
                logActivity({
                    action: 'deleted',
                    field: 'Task',
                    from: currentTask.name, // The name of the task that was deleted
                    to: ''
                });
            }
            
            sidebar.classList.remove('is-active');
        } catch (error) {
            console.error("Failed to delete task:", error);
            alert("An error occurred while trying to delete the task. Please check the console for details.");
        }
    }
    
    function toggleSidebarView() {
        // Toggle the class on the sidebar element
        sidebar.classList.toggle('is-full-view');
        
        // Check if the sidebar is now in full view to update the icon
        if (sidebar.classList.contains('is-full-view')) {
            // It's expanded, so show the 'compress' icon
            expandBtn.classList.remove('fa-expand');
            expandBtn.classList.add('fa-compress');
            expandBtn.title = "Exit full view";
        } else {
            // It's collapsed, so show the 'expand' icon
            expandBtn.classList.remove('fa-compress');
            expandBtn.classList.add('fa-expand');
            expandBtn.title = "Toggle full view";
        }
    }
    // --- 10. PUBLIC INTERFACE ---
    return { init, open };
})();

document.addEventListener('DOMContentLoaded', () => {
    if (window.TaskSidebar) {
        window.TaskSidebar.init();
    }
});