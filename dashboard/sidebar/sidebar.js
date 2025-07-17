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
    increment,
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
import { getHeaderRight } from '/dashboard/tasks/tabs/list/list.js';

window.TaskSidebar = (function () {
    let app, auth, db, storage;
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app, "juanluna-cms-01");
        storage = getStorage(app);
    } catch (e) {
        console.error("TaskSidebar: Firebase initialization failed.", e);
        return { init: () => { }, open: () => { } };
    }

    let isInitialized = false;
    let currentUser = null;
    let currentTask = null;
    let currentUserId = null;
    let currentTaskRef = null;
    let currentProject = null;
    let currentProjectRef = null;
    let allUsers = [];
    let currentWorkspaceId = null;
    let userCanEditProject = false;
    let currentUserRole = null;
    let workspaceProjects = [];


    // Listeners & Caches
    let taskListenerUnsubscribe, activityListenerUnsubscribe, messagesListenerUnsubscribe;
    let allMessages = [],
        allActivities = [];
    let pastedFiles = [];

    let sidebarHeader;
    let originalHeaderHTML = '';
    let isHeaderScrolled = false;

    // Color Mappings & Options
    const defaultPriorityColors = { 'High': '#ffccc7', 'Medium': '#ffe7ba', 'Low': '#d9f7be' };
    const defaultStatusColors = { 'On track': '#b7eb8f', 'At risk': '#fff1b8', 'Off track': '#ffccc7', 'Completed': '#d9d9d9' };
    const priorityOptions = ['High', 'Medium', 'Low'];
    const statusOptions = ['On track', 'At risk', 'Off track', 'Completed'];

    // DOM Elements
    let sidebar, loadingSpinner, scrolledTaskNameEl, taskNameEl, taskDescriptionEl, taskFieldsContainer, closeBtn,
        expandBtn, deleteTaskBtn,
        tabsContainer, activityLogContainer, commentInput, sendCommentBtn,
        imagePreviewContainer, currentUserAvatarEl, taskCompleteText, taskCompleteBtn, fileUploadInput, commentInputWrapper;

    let rightSidebarContainer;
    let listviewHeaderRight;

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
    }

    /**
     * Checks if a specific field in the sidebar is editable for the current user.
     * It checks for admin rights, then task assignment, and finally column-specific rules.
     * @param {string} fieldName - The name of the field to check (e.g., "Assignee", "Costs", "Status").
     * @returns {boolean} - True if the field is editable.
     */
    function isSidebarFieldEditable(fieldName) {
        // Rule 1: Project Admins/Editors can always edit any field.
        if (userCanEditProject) {
            return true;
        }

        // Rule 2: If the user is NOT an admin, check if they have permission to edit this task at all.
        // (This checks if they are an assigned Viewer/Commentor).
        if (!canUserEditCurrentTask()) {
            return false;
        }

        // Rule 3: For assigned Viewers, check the project's columnRules.
        const rules = currentProject.columnRules || [];
        const columnRule = rules.find(rule => rule.name === fieldName);

        // If a rule exists for this field and it's set to restricted, block the edit.
        if (columnRule && columnRule.isRestricted) {
            console.log(`[Permissions] Edit blocked for field "${fieldName}" due to column rule.`);
            return false;
        }

        // If all checks pass, the assigned user is allowed to edit this field.
        return true;
    }

    /**
     * Checks if the current user can edit the task's description.
     * @returns {boolean} - True if the user is an admin/editor OR is assigned to the task.
     */
    function canUserEditDescription() {
        if (!currentTask) return false;

        // Rule 1: Admins and Editors can always edit the description.
        if (userCanEditProject) {
            return true;
        }

        // Rule 2: A user can also edit if they are assigned to the task.
        const isAssigned = Array.isArray(currentTask.assignees) && currentTask.assignees.includes(currentUserId);
        if (isAssigned) {
            return true;
        }

        // Otherwise, they cannot.
        return false;
    }

    function canUserEditCurrentTask() {
        if (!currentTask) return false;
        // Rule 1: Admins and Editors can always edit.
        if (userCanEditProject) {
            return true;
        }
        // Rule 2: Allow assigned Viewers/Commentors to edit.
        if (currentUserRole === 'Viewer' || currentUserRole === 'Commentor') {
            const isAssigned = Array.isArray(currentTask.assignees) && currentTask.assignees.includes(currentUserId);
            if (isAssigned) {
                return true;
            }
        }
        return false;
    }
    // --- CORE LOGIC ---
    function init() {
        if (isInitialized) return;
        rightSidebarContainer = document.getElementById('right-sidebar');
        sidebar = document.getElementById('task-sidebar');
        loadingSpinner = document.getElementById('progress-loading-container');
        sidebarHeader = document.querySelector('.sidebar-header-task');
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
        scrolledTaskNameEl = document.querySelector('.scrolled-task-name');

        if (sidebarHeader) {
            originalHeaderHTML = sidebarHeader.innerHTML;
        }

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


            } else {
                // This part remains the same.
                currentUser = null;
                close();
            }
        });

        attachEventListeners();
        isInitialized = true;
    }

    function handleSidebarScroll() {
        if (!sidebarHeader || !currentTask || !scrolledTaskNameEl) return;

        const scrollPosition = sidebar.scrollTop;

        if (scrollPosition > 15) {
            // Add the class to trigger the CSS changes
            sidebarHeader.classList.add('is-scrolled');
            // Set the task name text inside the hidden span
            scrolledTaskNameEl.textContent = currentTask.name;

        } else {
            // Remove the class to revert to the default state
            scrolledTaskNameEl.textContent = 'Mark Complete';
            sidebarHeader.classList.remove('is-scrolled');
        }
    }

    async function findTaskInSections(taskId, projectRef) {
        const sectionsSnap = await getDocs(collection(projectRef, 'sections'));

        for (const sectionDoc of sectionsSnap.docs) {
            const taskRef = doc(sectionDoc.ref, 'tasks', taskId);
            const taskSnap = await getDoc(taskRef);
            if (taskSnap.exists()) {
                return {
                    task: { id: taskSnap.id, ...taskSnap.data() },
                    ref: taskSnap.ref
                };
            }
        }

        return null;
    }

    async function open(taskId, projectRef) {
        if (!isInitialized) init();
        if (!taskId || !currentUser) return;

        detachAllListeners();
        close();

        sidebar.classList.add('is-loading', 'is-visible');
        loadingSpinner.classList.add('is-loading');
        rightSidebarContainer.classList.add('sidebar-open');

        try {
            // ✅ STEP 1: Load taskIndex for fast direct path
            const indexSnap = await getDoc(doc(db, "taskIndex", taskId));
            if (!indexSnap.exists()) throw new Error(`Task ${taskId} not indexed.`);

            const indexData = indexSnap.data();
            const taskRef = doc(db, indexData.path);
            currentProjectRef = projectRef;

            // ✅ STEP 2: Fetch project data manually from projectRef
            const projectSnap = await getDoc(projectRef);
            if (!projectSnap.exists()) throw new Error("Project not found.");
            currentProject = { id: projectSnap.id, ...projectSnap.data() };

            // ✅ STEP 3: Fire off task + async extras in parallel
            const [taskSnap, eligibleProjects, memberProfiles] = await Promise.all([
                getDoc(taskRef),
                fetchEligibleMoveProjects(currentUserId),
                fetchMemberProfiles(currentProject.members?.map(m => m.uid) || [])
            ]);

            if (!taskSnap.exists()) throw new Error("Task not found at indexed path.");

            currentTask = { id: taskSnap.id, ...taskSnap.data() };
            currentTaskRef = taskRef;
            workspaceProjects = eligibleProjects;
            allUsers = memberProfiles;

            updateUserPermissions(currentProject, currentUserId);
            sidebar.classList.remove('is-loading');
            renderSidebar(currentTask);
            

            // ✅ STEP 4: Defer recent history update
            setTimeout(async () => {
                try {
                    const historyRef = doc(db, `users/${currentUserId}/recenthistory/${taskId}`);
                    let assigneesForHistory = [];

                    if (currentTask.assignees?.length > 0) {
                        const assigneeProfiles = await fetchMemberProfiles(currentTask.assignees);
                        assigneesForHistory = assigneeProfiles.map(p => ({
                            uid: p.id,
                            name: p.name,
                            avatarUrl: p.avatar
                        }));
                    }

                    const recentHistoryData = {
                        type: 'task',
                        name: currentTask.name,
                        status: currentTask.status,
                        assignees: assigneesForHistory,
                        projectRef: projectRef,
                        projectName: currentProject.title,
                        projectColor: currentProject.color,
                        lastAccessed: serverTimestamp()
                    };

                    await setDoc(historyRef, recentHistoryData, { merge: true });
                } catch (err) {
                    console.warn("Could not update recent history:", err);
                }
            }, 300);

            // ✅ STEP 5: Setup realtime listeners
            taskListenerUnsubscribe = onSnapshot(taskRef, (docSnap) => {
                if (docSnap.exists()) {
                    const updatedTask = { id: docSnap.id, ...docSnap.data() };
                    if (JSON.stringify(updatedTask) !== JSON.stringify(currentTask)) {
                        currentTask = updatedTask;
                        updateUserPermissions(currentProject, currentUserId);
                        renderSidebar(currentTask);
                    }
                } else {
                    console.warn("Task was deleted in real-time. Closing sidebar.");
                    close();
                }
            }, (error) => {
                console.error("Error in task listener:", error);
            });

            listenToActivity();
            listenToMessages();

        } catch (error) {
            console.error("TaskSidebar: A critical error occurred while opening the task.", error);
            close();
        }
    }





    function close() {
        if (sidebar) sidebar.classList.remove('is-visible', 'is-loading');
        currentTask = currentTaskRef = currentProject = null;
        workspaceProjects = allUsers = allMessages = allActivities = [];
        clearImagePreview();
        scrolledTaskNameEl.textContent = 'Mark Complete';
        loadingSpinner.classList.remove('hide');
        loadingSpinner.classList.add('is-loading');
        renderSidebar("");
        rightSidebarContainer.classList.remove('sidebar-open');
        const headerRight = getHeaderRight();
        if (headerRight) {
            headerRight.classList.remove('hide');
        }
        detachAllListeners();
        closePopovers();


        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }

    function detachAllListeners() {
        if (taskListenerUnsubscribe) taskListenerUnsubscribe();
        if (activityListenerUnsubscribe) activityListenerUnsubscribe();
        if (messagesListenerUnsubscribe) messagesListenerUnsubscribe();
        taskListenerUnsubscribe = activityListenerUnsubscribe = messagesListenerUnsubscribe = null;
    }

    // --- DATA FETCHING ---
    async function fetchMemberProfiles(uids) {
        if (!uids || uids.length === 0) return [];
        try {
            const userPromises = uids.map(uid => getDoc(doc(db, `users/${uid}`)));
            const userDocs = await Promise.all(userPromises);
            return userDocs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() }));
        } catch (error) {
            console.error("Error fetching member profiles:", error);
            return [];
        }
    }

    async function fetchEligibleMoveProjects(userId) {
        if (!userId) return [];
        const eligibleProjectsMap = new Map();

        try {
            const allProjectsQuery = collectionGroup(db, 'projects');
            const projectsSnapshot = await getDocs(allProjectsQuery);

            projectsSnapshot.forEach(doc => {
                const projectData = doc.data();
                const projectId = doc.id;

                // --- THE FIX FOR THE LONG PATH ---
                // Path: /users/{ownerId}/myworkspace/{workspaceId}/projects/{projectId}
                const pathParts = doc.ref.path.split('/');

                // Check if the path has enough parts for our structure
                if (pathParts.length < 6) {
                    console.warn("Skipping project with unexpected path:", doc.ref.path);
                    return;
                }

                const ownerId = pathParts[1]; // The project owner's UID
                const activeWorkspaceId = pathParts[3]; // The workspace ID
                // --- END OF FIX ---

                const isOwner = projectData.project_super_admin_uid === userId;
                const memberInfo = projectData.members?.find(member => member.uid === userId);
                const isEligibleMember = memberInfo && (memberInfo.role === 'Project Owner Admin' || memberInfo.role === 'Project Admin' || memberInfo.role === 'Editor');

                if ((isOwner || isEligibleMember) && !eligibleProjectsMap.has(projectId)) {
                    // We save all the parts needed to rebuild the path later
                    eligibleProjectsMap.set(projectId, {
                        id: projectId,
                        ownerId: ownerId, // Save the Owner's ID
                        activeWorkspaceId: activeWorkspaceId, // Save the Workspace ID
                        ...projectData
                    });
                }
            });

            return Array.from(eligibleProjectsMap.values());

        } catch (error) {
            console.error("Error fetching eligible projects for move:", error);
            return [];
        }
    }

    async function fetchActiveWorkspace(userId) {
        try {
            const userRef = doc(db, 'users', userId);
            const userSnap = await getDoc(userRef);

            currentWorkspaceId = userSnap.exists() ? userSnap.data().selectedWorkspace || null : null;

            console.log(`[DEBUG] Fetched active workspace ID: ${currentWorkspaceId}`);

        } catch (error) {
            console.error("Error fetching active workspace:", error);
            currentWorkspaceId = null;
        }
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

    // --- REAL-TIME LISTENERS ---
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

        const messagesPath = `globalTaskChats/${currentTask.id}/Messages`;
        console.log("DEBUG: Attempting to listen for messages at path:", messagesPath);

        const messagesQuery = query(collection(db, messagesPath), orderBy("timestamp", "asc"));

        messagesListenerUnsubscribe = onSnapshot(messagesQuery, (snapshot) => {
            console.log(`DEBUG: Message snapshot received. Found ${snapshot.size} documents.`);
            if (snapshot.empty) {
                sidebar.classList.remove('is-loading');
                loadingSpinner.classList.add('hide');
                console.warn("DEBUG: Query returned 0 messages. Please check a) data exists at the path, and b) your security rules allow a 'list' operation on this path.");
            }
            allMessages = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            renderActiveTab();
            sidebar.classList.remove('is-loading');
            loadingSpinner.classList.add('hide');
        }, (error) => {
            console.error("DEBUG: CRITICAL ERROR in message listener. This is almost certainly a PERMISSION DENIED error from your Firestore Security Rules.", error);
        });
    }

    // --- DATA MUTATION (EDITING & MOVING) ---
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
        if (!currentTaskRef || !currentTask || !currentUserId || !currentProject || newProjectId === currentTask.projectId) return;

        const originalProjectTitle = currentProject.title;

        try {
            const destinationProjectData = workspaceProjects.find(p => p.id === newProjectId);

            if (!destinationProjectData || !destinationProjectData.ownerId || !destinationProjectData.activeWorkspaceId) {
                console.error("Project data is incomplete:", destinationProjectData);
                throw new Error("Could not move task because destination project data is missing required path IDs.");
            }

            const fullPath = `users/${destinationProjectData.ownerId}/myworkspace/${destinationProjectData.activeWorkspaceId}/projects/${newProjectId}`;
            const newProjectRef = doc(db, fullPath);
            const projectSnap = await getDoc(newProjectRef);

            if (!projectSnap.exists()) {
                console.error("CRITICAL: Final path did not resolve:", fullPath);
                throw new Error("Destination project not found even with the correct path.");
            }

            const newProjectData = projectSnap.data();
            const isOwner = newProjectData.project_super_admin_uid === currentUserId;
            const memberInfo = newProjectData.members?.find(member => member.uid === currentUserId);
            const isAdmin = memberInfo?.role === 'Project Admin' || memberInfo?.role === 'Project Owner Admin';
            const isEditor = memberInfo?.role === 'Editor';

            if (!isOwner && !isAdmin && !isEditor) {
                alert("Permission Denied: You must be an Editor or Admin of the destination project to move this task.");
                return;
            }

            const sectionsQuery = query(collection(newProjectRef, 'sections'), orderBy("order", "asc"), limit(1));
            const sectionsSnapshot = await getDocs(sectionsQuery);
            if (sectionsSnapshot.empty) {
                alert("Error: Target project has no sections. Please add a section first.");
                return;
            }
            const newSectionId = sectionsSnapshot.docs[0].id;

            // Prepare the atomic batch write
            const batch = writeBatch(db);

            // --- NEW LOGIC: ADD ASSIGNEES TO NEW PROJECT ---
            const assigneesToProcess = currentTask.assignees || [];
            const existingMemberUIDs = new Set((newProjectData.members || []).map(m => m.uid));

            for (const assigneeId of assigneesToProcess) {
                // If the assignee is not already a member of the destination project...
                if (!existingMemberUIDs.has(assigneeId)) {
                    console.log(`Assignee ${assigneeId} is not in the destination project. Adding as 'Viewer'.`);
                    const newMemberPayload = { role: 'Viewer', uid: assigneeId };
                    // ...add them using arrayUnion to prevent duplicates.
                    batch.update(newProjectRef, {
                        members: arrayUnion(newMemberPayload),
                        memberUIDs: arrayUnion(assigneeId)
                    });
                }
            }
            // --- END OF NEW LOGIC ---

            // Original task move operations are added to the same batch
            const newTaskData = { ...currentTask, projectId: newProjectId, sectionId: newSectionId };
            const newTaskRef = doc(newProjectRef, `sections/${newSectionId}/tasks/${currentTask.id}`);

            batch.delete(currentTaskRef);
            batch.set(newTaskRef, newTaskData);

            // Commit all changes (add members, delete old task, create new task) in one go
            await batch.commit();

            logActivity({
                action: 'moved',
                field: 'Project',
                from: originalProjectTitle,
                to: newProjectData.title
            });

            close();

        } catch (error) {
            console.error("Failed to move task:", error);
            alert("An error occurred while moving the task. " + error.message);
        }
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
        const messageRef = doc(db, `globalTaskChats/${currentTask.id}/Messages`, messageId);

        if (updates.content || updates.message) {
            updates.editedAt = serverTimestamp();
        }

        await updateDoc(messageRef, updates);

        if (updates.content || updates.message) {
            logActivity({ action: 'edited a message' });
        }
    }

    async function deleteMessage(messageId, imageUrl, messageText) {
        if (imageUrl) {
            try {
                await deleteObject(ref(storage, imageUrl));
            } catch (error) {
                if (error.code !== 'storage/object-not-found') console.error("Failed to delete image:", error);
            }
        }

        // THIS IS THE CORRECTED LINE:
        // It now correctly points to the task-specific chat collection.
        const messageRef = doc(db, `globalTaskChats/${currentTask.id}/Messages`, messageId);

        const batch = writeBatch(db);
        batch.delete(messageRef);
        batch.update(currentTaskRef, { commentCount: increment(-1) });

        await batch.commit();

        logActivity({ action: 'deleted a comment', field: `"${messageText.substring(0, 30)}..."` });
    }

    async function toggleReaction(messageId, reactionType) {
        if (!currentUser) return;

        const messageRef = doc(db, `globalTaskChats/${currentTask.id}/Messages`, messageId);

        const messageDoc = await getDoc(messageRef);
        if (!messageDoc.exists()) {
            console.error("Failed to find message to react to. Path may be wrong.");
            return;
        }

        const reactions = messageDoc.data().reactions?.[reactionType] || [];
        const fieldPath = `reactions.${reactionType}`;

        if (reactions.includes(currentUser.id)) {
            // User is removing their reaction (unlike)
            await updateDoc(messageRef, {
                [fieldPath]: arrayRemove(currentUser.id)
            });
        } else {
            // User is adding a reaction (like)
            await updateDoc(messageRef, {
                [fieldPath]: arrayUnion(currentUser.id)
            });
            logActivity({ action: 'liked a comment' }); // Corrected log message
        }
    }

    async function sendMessage(messageData) {
        if (!currentProject || !currentTask || !currentUser) return;
        if (!messageData.html.trim()) return;

        const messagesPath = `globalTaskChats/${currentTask.id}/Messages`;
        const newMessageRef = doc(collection(db, messagesPath));
        const batch = writeBatch(db);

        if (!currentTask.chatuuid) {
            batch.update(currentTaskRef, { chatuuid: currentTask.id });
        }

        batch.set(newMessageRef, {
            id: newMessageRef.id,
            content: messageData.html,
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderAvatar: currentUser.avatar,
            timestamp: serverTimestamp(),
            reactions: { "like": [] },
            projectId: currentProject.id,
            hasImage: messageData.hasImage || false
        });

        batch.update(currentTaskRef, { commentCount: increment(1) });
        await batch.commit();
        logActivity({ action: 'added a comment' });
    }

    async function handleCommentSubmit() {
        const commentInputEl = document.getElementById('comment-input');

        const previewEl = commentInputEl.querySelector('.inline-file-preview');

        // If a preview exists, remove it from the DOM before reading any text.
        if (previewEl) {
            previewEl.remove();
        }
        const textContent = commentInputEl.innerText || '';
        const fileToUpload = pastedFiles.length > 0 ? pastedFiles[0] : null;

        if (!textContent.trim() && !fileToUpload) {
            return; // Exit if there's nothing to send
        }

        sendCommentBtn.disabled = true;

        try {
            let finalHtml = textContent.trim().replace(/\n/g, '<br>');
            let messageHasImage = false;

            // --- CORRECTED UPLOAD LOGIC ---
            if (fileToUpload) {
                console.log("File detected, uploading to Firebase Storage...");
                const storagePath = `workspaceProjects/${currentProject.id}/messages-attachments/${Date.now()}-${fileToUpload.name}`;
                const storageRef = ref(storage, storagePath);
                const snapshot = await uploadBytes(storageRef, fileToUpload);
                const finalDownloadURL = `/attachments/downloadProxy?path=${encodeURIComponent(snapshot.metadata.fullPath)}`;

                console.log("Upload complete. Final URL:", finalDownloadURL);

                // 4. Now, build the attachment HTML with the valid URL.
                const fileType = fileToUpload.type;
                const fileName = fileToUpload.name;
                let attachmentHtml = '';
                const displayFileName = fileName.replace(/_[\d.]+[KMGT]?B/i, '');


                if (fileType.startsWith('image/')) {
                    messageHasImage = true;
                    attachmentHtml = `<img src="${finalDownloadURL}" alt="${fileName}" class="scalable-image">`;
                } else {

                    let iconClass = 'fa-solid fa-file';
                    if (fileToUpload.type === 'application/pdf') {
                        iconClass = 'fa-solid fa-file-pdf';
                    }

                    attachmentHtml = `
            <a href="${finalDownloadURL}" target="_blank" class="file-attachment-container">
                <i class="${iconClass}"></i>
                <span>${displayFileName}</span>
            </a>
        `;
                }

                // 5. Append the attachment HTML to the message content.
                if (finalHtml) {
                    finalHtml += `<br>${attachmentHtml}`;
                } else {
                    finalHtml = attachmentHtml;
                }
            }

            // --- SEND MESSAGE ---
            if (finalHtml) { // Only send if there's actual content.
                await sendMessage({ html: finalHtml, hasImage: messageHasImage });
            }

            // --- CLEANUP ---
            commentInputEl.innerHTML = '';
            clearImagePreview(); // This now clears the file from pastedFiles and hides the preview.

        } catch (error) {
            console.error("Failed to send message:", error);
            alert("There was an error sending your message.");
        } finally {
            sendCommentBtn.disabled = false;
        }
    }

    /**
     * Renders the entire sidebar with the latest task data.
     */
    function renderSidebar(task) {
        // Check the task's status and toggle the CSS class on the main sidebar element
        const isCompleted = task.status === 'Completed';
        sidebar.classList.toggle('is-task-completed', isCompleted);

        // Update the main completion button's appearance and text
        taskCompleteBtn.classList.toggle('completed', isCompleted);
        taskCompleteText.textContent = isCompleted ? 'Completed' : 'Mark complete';

        // Render the rest of the sidebar
        taskNameEl.textContent = task.name;
        const isDescriptionEditable = canUserEditDescription();

        taskDescriptionEl.contentEditable = isDescriptionEditable;
        taskDescriptionEl.textContent = task.description || "Add a description...";
        renderTaskFields(task);
        renderActiveTab();
    }

    /**
     * Renders all task fields and attaches click listeners with baked-in permission checks.
     * This is the central function for controlling interactivity within the sidebar.
     * @param {object} task The task object to render fields for.
     */
    function renderTaskFields(task) {
        taskFieldsContainer.innerHTML = '';
        if (!currentProject) {
            console.error("renderTaskFields cannot run: currentProject is not loaded.");
            return;
        }

        const table = document.createElement('table');
        table.className = 'task-fields-table';
        const tbody = document.createElement('tbody');

        // 1. RENDER ALL FIELDS (This part builds the static view)
        // =======================================================
        const currentProjectTitle = currentProject.title || '...';
        appendFieldToTable(tbody, 'project', 'Project', `<span>${currentProjectTitle}</span>`, 'project', isSidebarFieldEditable('Project'));
        appendFieldToTable(tbody, 'assignees', 'Assignee', renderAssigneeValue(task.assignees), 'assignee', isSidebarFieldEditable('Assignee'));
        appendFieldToTable(tbody, 'dueDate', 'Due Date', renderDateValue(task.dueDate), 'date', isSidebarFieldEditable('Due Date'));

        const priorityValue = task.priority;
        let priorityHTML = '<span>Not set</span>';
        if (priorityValue) {
            const priorityColumn = currentProject.defaultColumns.find(c => c.id === 'priority');
            const priorityOption = priorityColumn?.options?.find(p => p.name === priorityValue);
            const priorityColor = priorityOption?.color;

            priorityHTML = createTag(priorityValue, priorityColor);
        }
        appendFieldToTable(tbody, 'priority', 'Priority', priorityHTML, 'priority', isSidebarFieldEditable('Priority'));

        const statusValue = task.status;
        let statusHTML = '<span>Not set</span>';
        if (statusValue) {
            const statusColumn = currentProject.defaultColumns.find(c => c.id === 'status');
            const statusOption = statusColumn?.options?.find(s => s.name === statusValue);
            const statusColor = statusOption?.color;

            statusHTML = createTag(statusValue, statusColor);
        }
        appendFieldToTable(tbody, 'status', 'Status', statusHTML, 'status', isSidebarFieldEditable('Status'));
        currentProject.customColumns?.forEach(col => {
            const value = task.customFields ? task.customFields[col.id] : null;
            let displayHTML = '<span>Not set</span>';
            if (value != null && value !== '') {
                if (col.options) { // For 'Type' or other custom select columns
                    const option = col.options.find(opt => opt.name === value);
                    displayHTML = createTag(value, option ? option.color : '#ccc');
                } else if (col.type === 'Costing') {
                    displayHTML = `<span>${col.currency || '$'}${value.toLocaleString()}</span>`;
                } else {
                    displayHTML = `<span>${value}</span>`;
                }
            }
            appendFieldToTable(tbody, `custom-${col.id}`, col.name, displayHTML, 'custom-field', isSidebarFieldEditable(col.name));
        });

        table.appendChild(tbody);
        taskFieldsContainer.appendChild(table);
        table.addEventListener('click', (e) => {
            const control = e.target.closest('.field-control');
            if (!control) return;

            const key = control.dataset.key;
            const controlType = control.dataset.control;
            const label = control.closest('tr').querySelector('.sidebarprojectfield-label').textContent;

            if (!isSidebarFieldEditable(label)) {
                // Silently return, as the .is-readonly class already provides visual feedback.
                return;
            }
            switch (controlType) {
                case 'project':
                case 'assignee': {
                    // PERMISSION CHECK: Strict. Only project admins/editors can perform these actions.
                    if (!userCanEditProject) {

                        return;
                    }

                    if (controlType === 'project') {
                        // This logic assumes `workspaceProjects` is populated when the sidebar opens.
                        createAdvancedDropdown(control, {
                            options: workspaceProjects,
                            searchable: true,
                            searchPlaceholder: 'Move to project...',
                            itemRenderer: (p) => `<span>${p.title}</span>`,
                            onSelect: (p) => {
                                if (p.id !== currentTask.projectId) moveTask(p.id);
                            }
                        });
                    } else { // assignee
                        const options = [{ id: null, name: 'Unassigned', avatar: '' }, ...allUsers];
                        createAdvancedDropdown(control, {
                            options: options,
                            searchable: true,
                            searchPlaceholder: 'Search teammates...',
                            itemRenderer: (user) => {
                                if (!user.id) return `<span>Unassigned</span>`;
                                return `<div class="avatar" style="background-image: url(${user.avatar})"></div><span>${user.name}</span>`;
                            },
                            onSelect: (user) => updateTaskField('assignees', user.id ? [user.id] : [])
                        });
                    }
                    break;
                }

                case 'date':
                case 'priority':
                case 'status':
                case 'custom-field': {
                    // PERMISSION CHECK: Lenient. Allows assigned Viewers/Commentors.
                    if (!canUserEditCurrentTask()) {
                        return;
                    }

                    if (controlType === 'date') {
                        const input = control.querySelector('.flatpickr-input');
                        const fp = flatpickr(input, {
                            defaultDate: currentTask.dueDate || 'today',
                            dateFormat: "Y-m-d",
                            onClose: function (selectedDates) {
                                const newDate = selectedDates[0] ? flatpickr.formatDate(selectedDates[0], 'Y-m-d') : '';
                                updateTaskField('dueDate', newDate);
                                fp.destroy();
                            }
                        });
                        fp.open();
                    } else if (controlType === 'priority' || controlType === 'status') {
                        const column = currentProject.defaultColumns.find(c => c.id === controlType);
                        if (!column || !column.options) {
                            console.error(`Column '${controlType}' not found or has no options.`);
                            return;
                        }

                        // 2. The complete options array (with names and colors) is read directly.
                        const completeOptions = column.options;

                        // 3. Call the generic dropdown function with the complete data.
                        showStatusDropdown(control, completeOptions, (selected) => {
                            updateTaskField(controlType, selected.name);
                        });

                        // --- OLD LOGIC (REMOVED) ---
                        /*
                        const baseOptions = (controlType === 'priority') ? priorityOptions : statusOptions;
                        const customOptions = (controlType === 'priority') ? currentProject.customPriorities : currentProject.customStatuses;
                        const allOptions = [...baseOptions.map(name => ({ name })), ...(customOptions || [])];
                        showStatusDropdown(control, allOptions, (selected) => {
                            updateTaskField(controlType, selected.name);
                        });
                        */

                    } else if (controlType === 'custom-field') {
                        const columnId = key.split('-')[1];
                        const column = currentProject.customColumns.find(c => c.id == columnId);
                        if (!column) return;

                        if (column.options) { // It's a dropdown type
                            // The generic showStatusDropdown now works perfectly for custom fields too.
                            showStatusDropdown(control, column.options, (selected) => {
                                updateCustomField(columnId, selected.name, column);
                            });
                        } else { // It's a text/number/costing field
                            makeTextFieldEditable(control, columnId, column);
                        }
                    }
                    break;
                }
            }
        });
    }

    /**
     * Creates and appends a styled table row.
     * (This helper function remains unchanged)
     */
    function appendFieldToTable(tbody, key, label, controlHTML, controlType, customClass = '') {
        const row = tbody.insertRow();
        row.className = 'sidebarprojectfield-row';

        const labelCell = row.insertCell();
        labelCell.className = 'sidebarprojectfield-label';
        labelCell.textContent = label;

        const valueCell = row.insertCell();
        valueCell.className = `sidebarprojectfield-value ${customClass}`;

        const controlDiv = document.createElement('div');
        controlDiv.className = 'field-control';
        controlDiv.dataset.key = key;
        controlDiv.dataset.control = controlType;
        controlDiv.innerHTML = controlHTML;

        valueCell.appendChild(controlDiv);
    }

    /**
     * Renders the Due Date field using the advanced formatDueDate function
     * to display relative, color-coded dates like "Today" or "Yesterday".
     * @param {string} dateString The ISO date string (e.g., "2025-06-26").
     */
    function renderDateValue(dateString) {
        const dueDateInfo = formatDueDate(dateString);
        const displayDate = dueDateInfo.text || 'No due date';
        const colorClass = `date-color-${dueDateInfo.color}`; // e.g., "date-color-red"
        return `
        <div class="flatpickr-wrapper ${colorClass}">
            <input type="text" class="flatpickr-input" value="${displayDate}" readonly="readonly" placeholder="No due date">
            <i class="fa-solid fa-calendar-days input-button"></i>
        </div>
    `;
    }

    /**
     * Your provided function to calculate the display format for a due date.
     * (This function does not need any changes)
     */
    function formatDueDate(dueDateString) {
        // --- Setup ---
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today for accurate comparisons.

        // Handle empty or invalid dates
        if (!dueDateString) {
            return { text: '', color: 'default' };
        }

        const dueDate = new Date(dueDateString);
        if (isNaN(dueDate.getTime())) {
            return { text: 'Invalid date', color: 'red' };
        }
        dueDate.setHours(0, 0, 0, 0); // Also normalize the due date

        // --- Calculations ---
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth();
        const dueYear = dueDate.getFullYear();
        const dueMonth = dueDate.getMonth();

        const dayDifference = (dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24);

        // --- 1. Handle Past Dates ---
        if (dayDifference < 0) {
            if (dayDifference === -1) {
                return { text: 'Yesterday', color: 'red' };
            }
            if (dayDifference > -7) {
                return { text: 'Last Week', color: 'red' };
            }
            if (todayYear === dueYear && todayMonth === dueMonth + 1) {
                return { text: 'Last Month', color: 'red' };
            }
            if (todayYear === dueYear + 1 && todayMonth === 0 && dueMonth === 11) {
                return { text: 'Last Month', color: 'red' };
            }
            if (todayYear === dueYear + 1) {
                return { text: 'Last Year', color: 'red' };
            }
            const MmmDddYyyyFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return { text: MmmDddYyyyFormat.format(dueDate), color: 'red' };
        }

        // --- 2. Handle Present and Immediate Future ---
        if (dayDifference === 0) {
            return { text: 'Today', color: 'green' };
        }
        if (dayDifference === 1) {
            return { text: 'Tomorrow', color: 'yellow' };
        }

        // --- 3. Handle Future Dates ---
        if (dueYear === todayYear) {
            const MmmDddFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
            return { text: MmmDddFormat.format(dueDate), color: 'default' };
        } else {
            const MmmDddYyyyFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return { text: MmmDddYyyyFormat.format(dueDate), color: 'default' };
        }
    }


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
        return `<div class="tag" style="background-color: ${color}; border-radius: 10px; color: ${(yiq >= 128) ? '#000' : '#fff'};">${text}</div>`;
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

            const isAuthor = msg.senderId === currentUser.id;
            const canManageMessage = isAuthor || userCanEditProject;
            const hasLiked = msg.reactions?.like?.includes(currentUser.id);
            const likeCount = msg.reactions?.like?.length || 0;
            const likeIconClass = hasLiked ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up';
            const reactionsHTML = `<button class="react-btn like-btn ${hasLiked ? 'reacted' : ''}" title="Like"><i class="${likeIconClass}"></i> <span class="like-count">${likeCount > 0 ? likeCount : ''}</span></button>`;

            let authorActionsHTML = canManageMessage ? `
            <button class="edit-comment-btn" title="Edit"><i class="fa-solid fa-pencil"></i></button>
            <button class="delete-comment-btn" title="Delete"><i class="fa-solid fa-trash"></i></button>
        ` : '';

            const iconsHTML = `<div class="sidebarcommenticons">${reactionsHTML}${authorActionsHTML}</div>`;
            const timestamp = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleString() : 'Sending...';

            let finalDisplayHtml = '';
            let contentForEdit = msg.content || msg.message || '';

            if (msg.content) {
                // ✅ THIS IS THE FIX: Configure DOMPurify to allow attachment links
                finalDisplayHtml = DOMPurify.sanitize(msg.content, {
                    // Explicitly allow tags needed for links, icons, and images
                    ALLOWED_TAGS: ['a', 'i', 'img', 'br', 'b', 'strong', 'em', 'span', 'div'],
                    // Explicitly allow attributes needed for links and styling
                    ALLOWED_ATTR: ['href', 'target', 'class', 'alt', 'src', 'style']
                });

                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = msg.content;
                const attachmentContainer = tempDiv.querySelector('.file-attachment-container');
                if (attachmentContainer) {
                    attachmentContainer.setAttribute('contenteditable', 'false');
                    attachmentContainer.style.userSelect = 'none';
                }
                contentForEdit = tempDiv.innerHTML;
            } else {
                // Fallback for older messages without the 'content' field
                let oldContentHTML = '';
                if (msg.message) {
                    oldContentHTML += `<div class="comment-text">${msg.message}</div>`;
                }
                if (msg.imageUrl) {
                    oldContentHTML += `<div class="log-attachment"><img class="scalable-image" src="${msg.imageUrl}" alt="Attachment"></div>`;
                }
                if (msg.messageNote) {
                    oldContentHTML += `<div class="comment-note">${msg.messageNote}</div>`;
                }
                finalDisplayHtml = oldContentHTML;
            }

            const editAreaHTML = `
            <div class="comment-edit-area" style="display: none;">
                <div class="comment-edit-input" contenteditable="true">${contentForEdit}</div>
                <div class="comment-edit-actions">
                    <button class="btn-cancel-edit">Cancel</button>
                    <button class="btn-save-edit">Save</button>
                </div>
            </div>
        `;

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
                    <div class="comment-display-area">
                        ${finalDisplayHtml}
                    </div>
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

    // --- EVENT LISTENERS ---
    function attachEventListeners() {
        if (!sidebar) return;
        if (commentInputWrapper) {
            // Add a class when a file is dragged over
            commentInputWrapper.addEventListener('dragenter', (e) => {
                e.preventDefault();
                e.stopPropagation();
                commentInputWrapper.classList.add('drag-over');
            });

            // Necessary to prevent the browser's default handling
            commentInputWrapper.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });

            // Remove the class when the file is no longer being dragged over
            commentInputWrapper.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                commentInputWrapper.classList.remove('drag-over');
            });

            // Handle the file drop
            commentInputWrapper.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                commentInputWrapper.classList.remove('drag-over');

                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    const file = files[0];
                    pastedFiles = [file]; // Store the file for upload
                    addImagePreview(file); // Show the preview
                }
            });
        }

        sidebar.addEventListener('scroll', handleSidebarScroll);
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

            // --- Handle CANCELING an Edit ---
            if (e.target.closest('.btn-cancel-edit')) {
                editArea.style.display = 'none';
                displayArea.style.display = 'block';
                delete messageItem._stagedFile; // Clear any staged file if cancel
            }

            // --- Handle SAVING an Edit ---
            if (e.target.closest('.btn-save-edit')) {
                const editInput = messageItem.querySelector('.comment-edit-input');

                // Check if the original message was in the new HTML format.
                if (messageData.content !== undefined) {
                    // NEW FORMAT: Get the innerHTML and update the 'content' field.
                    const updatedContent = editInput.innerHTML;
                    updateMessage(messageId, { content: updatedContent });
                } else {
                    // OLD FORMAT: Get the innerText and update the old 'message' field.
                    const updatedText = editInput.innerText;
                    updateMessage(messageId, { message: updatedText });
                }

                // Reset the UI after saving
                editArea.style.display = 'none';
                displayArea.style.display = 'block';
                return; // Action is complete, exit.
            }

            if (e.target.closest('.edit-comment-btn')) {
                displayArea.style.display = 'none';
                editArea.style.display = 'block';
                // Set focus to the contenteditable input
                const editInput = editArea.querySelector('.comment-edit-input');
                if (editInput) editInput.focus();
                return;
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
        if (sidebarHeader) {
            sidebarHeader.addEventListener('click', (e) => {
                // This will catch clicks on the completion button whether the header is scrolled or not
                if (e.target.closest('.task-complete-btn')) {
                    if (!currentTask) return;
                    const newStatus = currentTask.status === 'Completed' ? 'On track' : 'Completed';
                    updateTaskField('status', newStatus);
                }
            });
        }
        // Standard listeners
        closeBtn.addEventListener('click', close);
        expandBtn.addEventListener('click', toggleSidebarView);
        deleteTaskBtn.addEventListener('click', deleteCurrentTask);
        commentInput.addEventListener('click', (e) => {
            // Check if the clicked element is the remove button
            if (e.target.classList.contains('remove-inline-preview')) {

                // Find the parent preview element (the <img> or <span>)
                const previewElement = e.target.closest('.inline-file-preview');

                // Remove the preview from the input box
                if (previewElement) {
                    previewElement.remove();
                }

                // Call your existing function to clear the file from the upload queue
                clearImagePreview();
            }
        });

        sendCommentBtn.addEventListener('click', handleCommentSubmit);
        commentInput.addEventListener('keydown', e => {
            // This condition now handles both 'Enter' and 'Shift+Enter' for creating a new line.
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault(); // Stop the default browser action.

                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const br = document.createElement('br');

                    range.deleteContents();
                    range.insertNode(br);

                    // Move the cursor immediately after the new line break
                    range.setStartAfter(br);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);

                    // THIS IS THE FIX:
                    // Gently scroll the view to keep the new line visible.
                    br.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }

            // This handles 'Ctrl+Enter' or 'Cmd+Enter' for submitting the message.
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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
            if (file) {
                pastedFiles = [file];
                addImagePreview(file);
            }
        });

        commentInput.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) {
                        pastedFiles = [file]; // We'll handle one file at a time.
                        addImagePreview(file);
                        e.preventDefault(); // Prevent the file path from being pasted as text.
                        break; // Stop after handling the first file.
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

        // In the attachEventListeners function...

        document.body.addEventListener('click', (e) => {
            if (sidebar.classList.contains('is-visible')) {
                const safeSelectors = '#task-sidebar, .advanced-dropdown, .flatpickr-calendar, .task-reactions';
                if (!e.target.closest(safeSelectors)) {
                    close();
                }
            }
        }, { capture: true });

    }

    // --- UI HELPERS ---
    function closePopovers() {
        document.querySelectorAll('.context-dropdown').forEach(p => p.remove());
    }

    function closeFloatingPanels() {
        document.querySelectorAll('.dialog-overlay, .context-dropdown').forEach(el => el.remove());
    }

    /**
     * Creates a robust, self-managing dropdown menu.
     * @param {HTMLElement} targetEl The element to position the dropdown relative to.
     * @param {object} config Configuration for the dropdown.
     * @param {array} config.options The array of data to display.
     * @param {function} config.onSelect The callback function when an item is chosen.
     * @param {function} config.itemRenderer A function that returns the HTML for a single item.
     * @param {boolean} [config.searchable=false] Whether to include a search input.
     * @param {string} [config.searchPlaceholder='Search...'] Placeholder for the search input.
     */
    function createAdvancedDropdown(targetEl, config) {
        // Cleanup any existing dropdowns to prevent duplicates
        document.querySelector('.advanced-dropdown')?.remove();

        // Create main container and append to body
        const dropdown = document.createElement('div');
        dropdown.className = 'advanced-dropdown';
        document.body.appendChild(dropdown);

        // Add an optional search input
        if (config.searchable) {
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = config.searchPlaceholder || 'Search...';
            searchInput.className = 'dropdown-search-input';
            dropdown.appendChild(searchInput);
            // Add event listener to re-render the list on input
            searchInput.addEventListener('input', () => renderItems(searchInput.value));
        }

        // Create the list container
        const listContainer = document.createElement('ul');
        listContainer.className = 'dropdown-list';
        dropdown.appendChild(listContainer);

        // Create the function that renders/re-renders the items
        const renderItems = (filter = '') => {
            listContainer.innerHTML = '';
            const lowerFilter = filter.toLowerCase();

            // Filter the options based on the search term
            const filteredOptions = config.options.filter(opt =>
                (opt.name || opt.label || '').toLowerCase().includes(lowerFilter)
            );

            if (filteredOptions.length === 0) {
                listContainer.innerHTML = `<li class="dropdown-item-empty">No results found</li>`;
                return;
            }

            filteredOptions.forEach(option => {
                const li = document.createElement('li');
                li.className = 'dropdown-item';

                // Use the provided renderer function to create the item's inner HTML
                li.innerHTML = config.itemRenderer(option);

                li.addEventListener('click', (e) => {
                    e.stopPropagation();
                    config.onSelect(option);
                    dropdown.remove(); // Close dropdown after selection
                });
                listContainer.appendChild(li);
            });
        };

        // Perform the initial rendering of all items
        renderItems();

        // Position the dropdown intelligently
        const rect = targetEl.getBoundingClientRect();
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.minWidth = `${rect.width}px`;

        // Decide whether to show the dropdown above or below the target element
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < dropdown.offsetHeight && rect.top > dropdown.offsetHeight) {
            // Not enough space below, plenty of space above: render on top
            dropdown.style.top = `${rect.top - dropdown.offsetHeight - 4}px`;
        } else {
            // Default: render below
            dropdown.style.top = `${rect.bottom + 4}px`;
        }

        // Short timeout to prevent flicker and allow CSS transitions
        setTimeout(() => {
            dropdown.classList.add('visible');
            if (config.searchable) {
                dropdown.querySelector('.dropdown-search-input').focus();
            }
        }, 10);

        const clickOutsideHandler = (event) => {
            // If the click is outside the dropdown and not on the original target, close it
            if (!dropdown.contains(event.target) && !targetEl.contains(event.target)) {
                dropdown.remove();
                document.removeEventListener('click', clickOutsideHandler, { capture: true });
            }
        };

        // Use capture phase to catch the click before anything else
        document.addEventListener('click', clickOutsideHandler, { capture: true });
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
                itemHTML += `<span class="dropdown-color-swatch" style="background-color: ${option.color} !important;"></span>`;
            }

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
            // If the input is cleared, set the value to null. Otherwise, use the input's value.
            const newValue = input.value.trim() === '' ? null : input.value;
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
                if (item && typeof item.name === 'string') {
                    const sanitizedName = item.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
                    const className = `${prefix}-${sanitizedName}`;
                    // Use a default color if item.color is missing
                    const bgColor = item.color || '#e0e0e0';
                    const color = getContrastYIQ(bgColor);
                    cssRules += `.${className} { background-color: ${bgColor}; color: ${color}; }\n`;
                }
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


    /**
 * Creates a preview of a file (image or document) and inserts it
 * directly into the contenteditable comment input at the cursor's position.
 * @param {File} file The file to be previewed.
 */
    function addImagePreview(file) {
        // 1. Store the file for the upload process
        pastedFiles = [file];

        // 2. Define the insertion logic as a reusable function
        const insertNode = (nodeToInsert) => {
            const commentInputEl = document.getElementById('comment-input');
            commentInputEl.focus();
            const selection = window.getSelection();

            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents(); // Clear any user-selected text

                const br = document.createElement('br');
                const finalBr = document.createElement('br');

                // Insert the line break, then the node, then a final line break
                range.insertNode(br);
                range.insertNode(nodeToInsert);
                range.insertNode(finalBr);

                // Move the cursor after the final line break for a new line
                range.setStartAfter(finalBr);
                range.collapse(true);

                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                // Fallback for when there's no cursor position
                commentInputEl.appendChild(document.createElement('br'));
                commentInputEl.appendChild(nodeToInsert);
                commentInputEl.appendChild(document.createElement('br'));
            }
        };

        // 3. Create the correct preview node based on file type
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = document.createElement('img');
                img.src = event.target.result;
                img.alt = file.name;
                img.className = 'inline-file-preview'; // Class for styling and removal

                // Apply styling from your example
                img.style.display = 'block'; // 'center' is not valid; 'block' allows centering with margin
                img.style.margin = '10px auto'; // Center the block-level image
                img.style.maxWidth = '70%';
                img.style.maxHeight = '450px';
                img.style.borderRadius = '10px';

                insertNode(img); // Insert the created image node
            };
            reader.readAsDataURL(file);
        } else {
            // For non-image files, create a placeholder element
            const fileNode = document.createElement('span');
            fileNode.className = 'inline-file-preview';
            fileNode.contentEditable = false; // Make the preview non-editable

            let iconClass = 'fa-solid fa-file'; // Default icon
            if (file.type === 'application/pdf') {
                iconClass = 'fa-solid fa-file-pdf';
            }
            // Add more 'else if' blocks for other file types if desired

            fileNode.innerHTML = `
            <i class="${iconClass}"></i>
            <span>${file.name}</span>
            <button type="button" class="remove-inline-preview">&times;</button>
        `;
            insertNode(fileNode); // Insert the created file node
        }
    }

    /**
     * Clears the file from memory and removes the visual preview.
     * This acts as the "cancellation" for the upload.
     */
    function clearImagePreview() {
        pastedFiles = []; // Clear the stored file
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
            // alert("An error occurred while trying to delete the task. Please check the console for details.");
        }
    }

    function showStatusDropdown(targetEl, options, onSelectCallback) {
        createAdvancedDropdown(targetEl, {
            options: options,
            searchable: false,
            itemRenderer: (option) => {
                const color = option.color || '#ccc'; // Use gray as a fallback for any malformed data
                return `<div class="dropdown-color-swatch" style="background-color: ${color}; border-radius: 10px;"></div><span>${option.name}</span>`;
            },
            onSelect: onSelectCallback
        });
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