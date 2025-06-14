/**
 * home.js
 * * Manages the main dashboard interface for the application. This script handles all
 * real-time data synchronization with Firestore and includes fully functional dropdown
 * filters, inline task creation, and a visible "Completed" section for finished tasks.
 * It now loads data from a user-specific, selectable workspace.
 *
 * @version 6.0.0 - Implemented workspace-centric data loading from Firestore.
 * @date 2025-06-14
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
    addDoc,
    updateDoc,
    onSnapshot,
    query,
    orderBy,
    where, // Import 'where' for querying
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

// Initialize Firebase
console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
console.log("Initialized Firebase on Dashboard.");

export function init(params) {
    dayjs.extend(window.dayjs_plugin_isBetween);
    console.log("Home section initialized with workspace loading logic.");

    const controller = new AbortController();
    const homeSection = document.querySelector('.home');
    if (!homeSection) {
        console.error('Home section container (.home) not found!');
        return () => { };
    }

    // ===================================================================
    // [1] STYLES, DATA, AND CONFIGURATION
    // ===================================================================

    function injectComponentStyles() {
        if (document.getElementById('home-component-styles')) return;
        const style = document.createElement('style');
        style.id = 'home-component-styles';
        style.textContent = `
            .project-item.active { background-color: #eef2ff; }
            .empty-state { padding: 20px; text-align: center; color: #888; }
            .notification { position: fixed; top: 20px; right: 20px; background: #2196f3; color: white; padding: 12px 20px; border-radius: 6px; z-index: 1051; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: opacity 0.3s ease; }
            .notification.success { background-color: #4caf50; }
            .notification.error { background-color: #f44336; }
            .task-item, .inline-task-creator { display: flex; align-items: center; gap: 8px; padding: 4px; border-radius: 4px; margin-bottom: 4px; }
            .task-content { flex-grow: 1; display: flex; flex-direction: column; }
            .task-text.completed { text-decoration: line-through; color: #888; }
            .task-dates { font-size: 0.8rem; }
            .task-dates.completed { color: #888 !important; }
            .task-actions { display: flex; align-items: center; gap: 8px; }
            .task-action-btn { cursor: pointer; color: #aaa; padding: 4px; border-radius: 50%; }
            .task-action-btn:hover { background-color: #f0f0f0; color: #333; }
            .inline-task-creator { border: 1px solid #2196f3; background-color: #f4f8ff; }
            .inline-task-creator input { flex-grow: 1; border: none; outline: none; background: transparent; font-size: 1rem; padding: 4px 0; }
            .homedatepicker-container { z-index: 1052; }
            .dropdown-menu-dynamic{position:absolute;z-index:1050;display:block;min-width:220px;padding:8px 0;margin-top:4px;background-color:#fff;border:1px solid #e8e8e8;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);animation:fadeIn .15s ease-out}.dropdown-menu-dynamic a{display:block;padding:10px 16px;font-size:14px;font-weight:500;color:#333;text-decoration:none;white-space:nowrap;transition:background-color .2s ease}.dropdown-menu-dynamic a:hover{background-color:#f4f4f4;color:#111}@keyframes fadeIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
        `;
        document.head.appendChild(style);
    }

    const dropdownConfig = {
        'my-week': { items: [{ text: 'All Tasks', value: 'all' }, { text: 'Today', value: 'today' }, { text: 'This Week', value: 'this-week' }, { text: 'Next Week', value: 'next-week' }] },
        'project-recents': { items: [{ text: 'All Projects', value: 'all' }, { text: 'Starred Projects', value: 'starred' }] },
        'collaborators': { items: [{ text: 'All Members', value: 'all' }, { text: 'Frequent & Active', value: 'frequent' }] }
    };

    let currentUser = null, activeWorkspaceId = null, activeProjectId = null, activeSectionId = null;
    let activeTaskFilter = 'all';
    let projectsData = [], peopleData = [];
    const listeners = { workspace: null, projects: null, sections: null, people: null,memberListeners: {}, tasks: {} };

    // ===================================================================
    // [2] RENDER FUNCTIONS (THE "VIEW")
    // ===================================================================

    function detachPeopleListeners() {
    // Detach the listener on the workspace document
    if (listeners.people) listeners.people();
    listeners.people = null;

    // Detach all individual member profile listeners
    Object.values(listeners.memberListeners).forEach(unsubscribe => unsubscribe());
    listeners.memberListeners = {};
}

// In your main detachAllListeners function, make sure you call this new function
function detachAllDataListeners() {
    if (listeners.projects) listeners.projects();
    detachPeopleListeners(); // <-- Use the new detach function
    detachSectionAndTaskListeners();
    listeners.projects = null;
}

    function renderProjects(filter = 'all') {
        const projectList = homeSection.querySelector('.projects-card .project-list');
        if (!projectList) return;
        projectList.innerHTML = '';
        if (!activeWorkspaceId) {
             projectList.innerHTML = `<div class="empty-state">No workspace selected.</div>`;
             return;
        }
        const projectsToDisplay = projectsData.filter(p => filter === 'starred' ? p.starred : true);
        if (projectsToDisplay.length === 0 && currentUser) {
            projectList.innerHTML = `<div class="empty-state">No projects to show.</div>`;
        }
        const createBtn = document.createElement('button');
        createBtn.className = 'create-project-btn';
        createBtn.innerHTML = `<i class="fas fa-plus"></i> Create project`;
        createBtn.addEventListener('click', handleProjectCreate);
        projectsToDisplay.forEach(project => {
            const item = document.createElement('div');
            item.className = `project-item ${project.id === activeProjectId ? 'active' : ''}`;
            item.dataset.projectId = project.id;
            item.innerHTML = `<div class="project-icon" style="color: ${project.color};"><i class="fas fa-list"></i></div><div class="project-info"><span class="project-name">${project.title}</span><span class="project-meta" data-task-count></span></div>`;
            projectList.appendChild(item);
        });
        projectList.appendChild(createBtn);
        updateProjectTaskCounts();
    }

function renderActiveTaskFilterLabel() {
    // Find the label in the DOM
    const statsLabel = homeSection.querySelector('.stats-label');
    if (!statsLabel) return;

    // Find the corresponding text for the active filter value
    const config = dropdownConfig['my-week'];
    const selectedItem = config.items.find(item => item.value === activeTaskFilter);

    // Update the text content if an item is found
    if (selectedItem) {
        statsLabel.textContent = selectedItem.text;
    }
}

    function renderMyTasksCard() {
        const myTasksCard = homeSection.querySelector('.my-tasks-card');
        if (!myTasksCard) return;
        const tabsContainer = myTasksCard.querySelector('.task-tabs');
        const taskListContainer = myTasksCard.querySelector('.task-list');
        tabsContainer.innerHTML = '';
        taskListContainer.innerHTML = '';
        tabsContainer.style.display = 'none';

        if (!activeWorkspaceId) {
            taskListContainer.innerHTML = '<p class="empty-state">Please select a workspace to continue.</p>';
            return;
        }
        if (!activeProjectId) {
            taskListContainer.innerHTML = '<p class="empty-state">Select a project to see its tasks.</p>';
            return;
        }

        const project = projectsData.find(p => p.id === activeProjectId);
        if (!project || !project.sections) {
            taskListContainer.innerHTML = '<p class="empty-state">Loading project tasks...</p>';
            return;
        }

        tabsContainer.style.display = 'flex';
        project.sections.forEach(section => {
            const tab = document.createElement('button');
            tab.className = `tab-btn ${section.id === activeSectionId ? 'active' : ''}`;
            tab.textContent = section.title;
            tab.dataset.sectionId = section.id;
            tabsContainer.appendChild(tab);
        });

        const activeSection = project.sections.find(s => s.id === activeSectionId);
        if (!activeSection) {
            taskListContainer.innerHTML = '<p class="empty-state">Select a section to see tasks.</p>';
            return;
        }

        let tasksToDisplay = [...(activeSection.tasks || [])];
        if (activeSection.title !== 'Completed' && activeTaskFilter !== 'all') {
            const now = dayjs();
            let filterFunc;
            if (activeTaskFilter === 'today') filterFunc = t => t.dueDate && dayjs(t.dueDate).isSame(now, 'day');
            else if (activeTaskFilter === 'this-week') filterFunc = t => t.dueDate && dayjs(t.dueDate).isBetween(now.startOf('week'), now.endOf('week'), 'day', '[]');
            else if (activeTaskFilter === 'next-week') {
                const start = now.add(1, 'week').startOf('week'), end = now.add(1, 'week').endOf('week');
                filterFunc = t => t.dueDate && dayjs(t.dueDate).isBetween(start, end, 'day', '[]');
            }
            tasksToDisplay = tasksToDisplay.filter(filterFunc || (() => true));
        }

        tasksToDisplay.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).forEach(task => {
            taskListContainer.appendChild(createTaskElement(task));
        });

        if (activeSection.title !== 'Completed') {
            const createBtn = document.createElement('button');
            createBtn.className = 'create-task-btn';
            createBtn.innerHTML = `<i class="fas fa-plus"></i> Create task`;
            createBtn.addEventListener('click', () => showInlineTaskCreator(taskListContainer));
            taskListContainer.appendChild(createBtn);
        }

        if (tasksToDisplay.length === 0 && activeSection.title !== 'Completed') {
            const filterText = activeTaskFilter === 'all' ? '' : ` for ${activeTaskFilter.replace('-', ' ')}`;
            taskListContainer.insertAdjacentHTML('afterbegin', `<p class="empty-state">No tasks${filterText}.</p>`);
        } else if (tasksToDisplay.length === 0 && activeSection.title === 'Completed') {
             taskListContainer.insertAdjacentHTML('afterbegin', `<p class="empty-state">No completed tasks.</p>`);
        }
    }

    function renderPeople(filter = 'all') {
        const peopleContent = homeSection.querySelector('.people-content');
        if (!peopleContent) return;
        peopleContent.innerHTML = ''; // Clear previous content
        if (!activeWorkspaceId) {
            // No need to show anything if no workspace is active
            return;
        }
        const peopleToDisplay = peopleData.filter(p => filter === 'frequent' ? p.frequent : true);
        const list = document.createElement('div');
        list.className = 'homepeople-list';
        peopleToDisplay.forEach(person => {
            const item = document.createElement('div');
            item.className = `homepeople-item ${person.isActive ? '' : 'homepeople-item--inactive'}`;
            const avatarHTML = person.avatarUrl ? `<div class="homepeople-avatar"><img src="${person.avatarUrl}" alt="${person.name}"></div>` : `<div class="homepeople-avatar" style="background-color: ${generateColorForName(person.name)};">${getInitials(person.name)}</div>`;
            item.innerHTML = `${avatarHTML}<div class="homepeople-info"><span class="homepeople-name">${person.name}</span><span class="homepeople-role">${person.role}</span></div><a href="#" class="homepeople-action" title="Details"><i class="fas fa-ellipsis-h"></i></a>`;
            list.appendChild(item);
        });
        const inviteItem = document.createElement('div');
        inviteItem.className = 'homepeople-invite-item';
        inviteItem.innerHTML = `<i class="fas fa-user-plus"></i> Invite teammates`;
        inviteItem.addEventListener('click', showEmailModal);
        list.appendChild(inviteItem);
        peopleContent.appendChild(list);
    }

    function createTaskElement(task) {
        const item = document.createElement('div');
        item.className = 'task-item';
        item.dataset.taskId = task.id;
        const { text, color } = getDueDateInfo(task.dueDate);
        item.innerHTML = `<input type="checkbox" class="task-checkbox" data-task-id="${task.id}" ${task.completed ? 'checked' : ''}/><div class="task-content"><span class="task-text ${task.completed ? 'completed' : ''}">${task.name}</span><span class="task-dates ${task.completed ? 'completed' : ''}" style="color: ${task.completed ? '#888' : color};">${text}</span></div><div class="task-actions"><i class="far fa-calendar task-action-btn task-due-date-picker" title="Set due date" data-task-id="${task.id}"></i></div>`;
        return item;
    }

    function renderGlobalStats() {
        const completedEl = document.getElementById('tasks-completed');
        const membersEl = document.getElementById('total-members');
        if (completedEl) {
            let completedCount = 0;
            const project = projectsData.find(p => p.id === activeProjectId);
            if (project && project.sections) {
                const completedSection = project.sections.find(s => s.title === 'Completed');
                if (completedSection) {
                    completedCount = completedSection.tasks?.length || 0;
                }
            }
            completedEl.textContent = `${completedCount} task${completedCount !== 1 ? 's' : ''} completed`;
        }
        if (membersEl) {
            const memberCount = peopleData.length;
            membersEl.textContent = `${memberCount} staff member${memberCount !== 1 ? 's' : ''}`;
        }
    }

    // ===================================================================
    // [3] LOGIC & HANDLERS
    // ===================================================================

    function handleDropdownSelection(id, value, trigger) {
        // This function remains unchanged
        const selectedItem = dropdownConfig[id]?.items.find(item => item.value === value);
        if (!selectedItem) return;
    
        if (id === 'project-recents' || id === 'collaborators') {
            trigger.innerHTML = `${selectedItem.text} <i class="fas fa-chevron-down"></i>`;
        } else if (id === 'my-week') {
            const label = trigger.querySelector('.stats-label');
            if (label) {
                label.childNodes[0].nodeValue = selectedItem.text + ' ';
            }
        }
    
        if (id === 'my-week') {
            activeTaskFilter = value;
            renderMyTasksCard();
            renderActiveTaskFilterLabel();
        } else if (id === 'project-recents') {
            renderProjects(value);
        } else if (id === 'collaborators') {
            renderPeople(value);
        }
    }

    function selectProject(projectId) {
        if (!projectId || activeProjectId === projectId) return;
        activeProjectId = projectId;
        activeTaskFilter = 'all';
        detachSectionAndTaskListeners();
        const project = projectsData.find(p => p.id === activeProjectId);
        activeSectionId = project?.sections?.[0]?.id || null;
        attachSectionAndTaskListeners(projectId);
        renderProjects();
        renderMyTasksCard();
        renderGlobalStats();
    }

    function selectSection(sectionId) {
        activeSectionId = sectionId;
        renderMyTasksCard();
    }

    function showInlineTaskCreator(container) {
    if (container.querySelector('.inline-task-creator') || !activeWorkspaceId) return;

    // This flag is the key to fixing the bug.
    let hasCommitted = false;

    const creatorEl = document.createElement('div');
    creatorEl.className = 'inline-task-creator';
    creatorEl.innerHTML = `<input type="text" placeholder="Write a task name...">`;
    container.insertBefore(creatorEl, container.lastChild);
    const inputEl = creatorEl.querySelector('input');
    inputEl.focus();

    const commit = async () => {
        // If a commit is already in progress, stop immediately.
        if (hasCommitted) {
            return; 
        }
        // Block any future attempts to commit.
        hasCommitted = true;

        const taskName = inputEl.value.trim();
        if (taskName) {
            const tasksColRef = collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects/${activeProjectId}/sections/${activeSectionId}/tasks`);
            try {
                await addDoc(tasksColRef, {
                    name: taskName,
                    dueDate: null,
                    completed: false,
                    createdAt: serverTimestamp()
                });
            } catch (error) {
                console.error("Error creating task: ", error);
                hasCommitted = false; // Allow user to try again on error
            }
        }
        creatorEl.remove();
    };

    // This listener handles clicking outside the input box.
    inputEl.addEventListener('blur', commit);

    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commit(); // This will run first.
        }
        if (e.key === 'Escape') {
            hasCommitted = true; // Prevent the blur event from saving.
            creatorEl.remove();
        }
    });
}

    async function handleProjectCreate() {
    if (!currentUser || !activeWorkspaceId) return;
    const name = prompt("Enter new project name:");
    if (!name || !name.trim()) return;

    const projectsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects`);

    try {
        // Use a transaction to safely update and create documents.
        const newProjectRef = await runTransaction(db, async (transaction) => {
            // 1. Find any project that is currently selected.
            const selectedProjectQuery = query(projectsColRef, where("isSelected", "==", true));
            const selectedProjectsSnapshot = await transaction.get(selectedProjectQuery);

            // 2. Deselect the old project(s).
            selectedProjectsSnapshot.forEach(projectDoc => {
                transaction.update(projectDoc.ref, { isSelected: false });
            });

            // 3. Create the new project document with isSelected: true.
            const newDocRef = doc(projectsColRef); // Create a reference for the new project
            transaction.set(newDocRef, {
                title: name.trim(),
                color: generateColorForName(name.trim()),
                starred: false,
                isSelected: true, // Make the new project the selected one.
                createdAt: serverTimestamp() // Use a reliable server timestamp.
            });

            // 4. Also create the default "General" section for the new project.
            const sectionsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects/${newDocRef.id}/sections`);
            const generalSectionRef = doc(sectionsColRef);
            transaction.set(generalSectionRef, {
                title: 'General',
                createdAt: serverTimestamp()
            });

            return newDocRef; // Return the new document's reference
        });

        showNotification('Project created!', 'success');

        // The UI will now focus on the newly created project.
        selectProject(newProjectRef.id);

    } catch (error) {
        console.error("Error creating project in transaction:", error);
        showNotification("Failed to create project.", "error");
    }
}

    async function handleTaskCompletion(taskId, isCompleted) {
        if (!currentUser || !activeWorkspaceId || !activeProjectId) return;
        const project = projectsData.find(p => p.id === activeProjectId);
        if (!project) return;

        let sourceSection, taskData;
        for (const section of project.sections) {
            const task = section.tasks?.find(t => t.id === taskId);
            if (task) { sourceSection = section; taskData = task; break; }
        }
        if (!sourceSection || !taskData) return;

        let targetSection;
        if (isCompleted) {
            targetSection = project.sections.find(s => s.title === 'Completed');
            if (!targetSection) {
                try {
                    const sectionsColRef = collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects/${activeProjectId}/sections`);
                    const newSectionDoc = await addDoc(sectionsColRef, { title: 'Completed', createdAt: new Date() });
                    targetSection = { id: newSectionDoc.id, title: 'Completed', tasks: [] };
                } catch (error) { console.error("Error creating Completed section:", error); return; }
            }
        } else {
            targetSection = project.sections.find(s => s.title !== 'Completed') || project.sections[0];
            if (!targetSection) return;
        }

        if (sourceSection.id === targetSection.id && taskData.completed === isCompleted) {
             const taskRef = doc(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects/${activeProjectId}/sections/${sourceSection.id}/tasks`, taskId);
             await updateDoc(taskRef, { completed: isCompleted });
             return;
        }

        if(sourceSection.id === targetSection.id) return;

        try {
            const batch = writeBatch(db);
            const oldTaskRef = doc(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects/${activeProjectId}/sections/${sourceSection.id}/tasks`, taskId);
            const newTaskRef = doc(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects/${activeProjectId}/sections/${targetSection.id}/tasks`, taskId);
            batch.set(newTaskRef, { ...taskData, completed: isCompleted, completedAt: isCompleted ? new Date() : null });
            batch.delete(oldTaskRef);
            await batch.commit();
        } catch (error) { console.error("Error moving task:", error); }
    }

    async function updateTaskDueDate(taskId, newDueDate) {
        if (!currentUser || !activeWorkspaceId || !activeProjectId) return;
        const project = projectsData.find(p => p.id === activeProjectId);
        let sourceSection;
        for (const section of (project?.sections || [])) {
            if (section.tasks?.find(t => t.id === taskId)) { sourceSection = section; break; }
        }
        if (!sourceSection) return;
        const taskRef = doc(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects/${activeProjectId}/sections/${sourceSection.id}/tasks`, taskId);
        try {
            await updateDoc(taskRef, { dueDate: newDueDate });
            showNotification("Due date updated!", "success");
        } catch (error) { console.error("Error updating due date:", error); }
    }

    // ===================================================================
    // [4] REAL-TIME LISTENER MANAGEMENT (RESTRUCTURED)
    // ===================================================================

    function attachWorkspaceListener(userId) {
        if (listeners.workspace) listeners.workspace();
        const workspaceQuery = query(collection(db, `users/${userId}/myworkspace`), where("isSelected", "==", true));
        
        listeners.workspace = onSnapshot(workspaceQuery, (snapshot) => {
            detachAllDataListeners();
            if (!snapshot.empty) {
                const workspaceDoc = snapshot.docs[0];
                activeWorkspaceId = workspaceDoc.id;
                console.log(`Active workspace selected: ${activeWorkspaceId}`);
                attachProjectListener(userId, activeWorkspaceId);
                attachPeopleListener(userId, activeWorkspaceId);
            } else {
                console.warn("No selected workspace found. Please select a workspace.");
                activeWorkspaceId = null;
                // Clear out the view
                renderProjects();
                renderMyTasksCard();
                renderPeople();
                renderGlobalStats();
            }
        }, (error) => {
            console.error("Error listening to workspace:", error);
        });
    }

    function attachProjectListener(userId, workspaceId) {
    const projectsQuery = query(collection(db, `users/${userId}/myworkspace/${workspaceId}/projects`), orderBy("createdAt", "desc"));
    listeners.projects = onSnapshot(projectsQuery, (snapshot) => {

        // --- Keep this intelligent update logic from before ---
        const newProjects = snapshot.docs.map(doc => {
            const data = { id: doc.id, ...doc.data() };
            const existingProject = projectsData.find(p => p.id === doc.id);
            data.sections = existingProject ? existingProject.sections : [];
            return data;
        });
        projectsData = newProjects;
        // --- End of existing logic ---


        // --- NEW, SMARTER SELECTION LOGIC ---

        // 1. Find the project that is marked as selected in the database.
        const dbSelectedProject = projectsData.find(p => p.isSelected === true);

        // 2. Determine which project ID should be active.
        //    Priority is: the project from the DB -> the first project -> null.
        const targetId = dbSelectedProject ? dbSelectedProject.id : (projectsData[0]?.id || null);

        // 3. Only change the selected project in the UI if the target is different
        //    from what's already active. This prevents unnecessary re-renders.
        //    This single condition handles initial load, selection changes, and deletions.
        if (targetId !== activeProjectId) {
            selectProject(targetId);
        }

        // Always re-render the projects list itself to reflect changes
        // in project names, colors, etc.
        renderProjects();
        updateProjectTaskCounts();
    });
}

    function attachPeopleListener(userId, workspaceId) {
    // Start by detaching any and all previous people-related listeners
    detachPeopleListeners();

    // 1. Listen to the main workspace document to get the 'members' array
    const workspaceDocRef = doc(db, `users/${userId}/myworkspace/${workspaceId}`);

    listeners.people = onSnapshot(workspaceDocRef, (workspaceDoc) => {
        if (!workspaceDoc.exists()) {
            peopleData = [];
            renderPeople();
            renderGlobalStats();
            return;
        }

        const memberUIDs = workspaceDoc.data().members || [];
        const existingUIDs = Object.keys(listeners.memberListeners);

        // Sync listeners: Remove listeners for users who left the workspace
        const removedUIDs = existingUIDs.filter(uid => !memberUIDs.includes(uid));
        removedUIDs.forEach(uid => {
            listeners.memberListeners[uid](); // Unsubscribe
            delete listeners.memberListeners[uid];
        });

        // Remove the corresponding users from our local data array
        peopleData = peopleData.filter(p => !removedUIDs.includes(p.id));

        // Sync listeners: Add listeners for new users who joined the workspace
        const addedUIDs = memberUIDs.filter(uid => !existingUIDs.includes(uid));
        addedUIDs.forEach(uid => {
            const userProfileRef = doc(db, 'users', uid);

            // 2. For each member UID, create a listener for their profile document
            listeners.memberListeners[uid] = onSnapshot(userProfileRef, (userDoc) => {
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const personProfile = {
                        id: userDoc.id,
                        name: userData.name,
                        avatarUrl: userData.avatar, // Assumes avatar URL is stored here
                        role: userData.role || 'Member', // Example of getting other data
                        isActive: true // Example status
                    };

                    // Update or add the person's data in our local array
                    const index = peopleData.findIndex(p => p.id === userDoc.id);
                    if (index > -1) {
                        peopleData[index] = personProfile; // Update if exists
                    } else {
                        peopleData.push(personProfile); // Add if new
                    }

                    // 3. Re-render the people list with the new/updated profile info
                    renderPeople();
                    renderGlobalStats();
                }
            });
        });

        // Trigger an initial render after syncing listeners
        renderPeople();
        renderGlobalStats();
    });
}

    function attachSectionAndTaskListeners(projectId) {
        if (!currentUser || !activeWorkspaceId || !projectId) return;
        const sectionsQuery = query(collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects/${projectId}/sections`), orderBy("createdAt"));
        listeners.sections = onSnapshot(sectionsQuery, (sectionsSnapshot) => {
            const project = projectsData.find(p => p.id === projectId);
            if (!project) return;

            const currentSections = sectionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            project.sections = currentSections.map(s => ({ ...s, tasks: project.sections?.find(ps => ps.id === s.id)?.tasks || [] }));

            if (!activeSectionId || !project.sections.some(s => s.id === activeSectionId)) {
                activeSectionId = project.sections[0]?.id || null;
            }

            project.sections.forEach(section => {
                if (!listeners.tasks[section.id]) {
                    const tasksQuery = query(collection(db, `users/${currentUser.uid}/myworkspace/${activeWorkspaceId}/projects/${projectId}/sections/${section.id}/tasks`), orderBy("createdAt"));
                    listeners.tasks[section.id] = onSnapshot(tasksQuery, (tasksSnapshot) => {
                        const proj = projectsData.find(p => p.id === projectId);
                        const sect = proj?.sections.find(s => s.id === section.id);
                        if (sect) {
                            sect.tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                            if (activeProjectId === projectId) {
                                renderMyTasksCard();
                                updateProjectTaskCounts();
                                renderGlobalStats();
                            }
                        }
                    });
                }
            });
            renderMyTasksCard();
        });
    }

    function detachSectionAndTaskListeners() {
        if (listeners.sections) listeners.sections();
        Object.values(listeners.tasks).forEach(unsub => unsub());
        listeners.sections = null;
        listeners.tasks = {};
    }
    
    function detachAllDataListeners() {
        if(listeners.projects) listeners.projects();
        if(listeners.people) listeners.people();
        detachSectionAndTaskListeners();
        listeners.projects = null;
        listeners.people = null;
    }

    function detachAllListeners() {
        if (listeners.workspace) listeners.workspace();
        detachAllDataListeners();
        listeners.workspace = null;
        console.log("All Firestore listeners detached.");
    }


    // ===================================================================
    // [5] INITIALIZATION & CLEANUP
    // ===================================================================

    function initializeDropdowns() {
        // This function remains unchanged
        document.addEventListener('click', (e) => { if (!e.target.closest('.dropdown')) { document.querySelectorAll('.dropdown-menu-dynamic').forEach(menu => menu.remove()); } }, { signal: controller.signal });
        homeSection.querySelectorAll('.dropdown').forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.dropdown-menu-dynamic').forEach(menu => menu.remove());
                const dropdownId = trigger.dataset.dropdownId;
                const config = dropdownConfig[dropdownId];
                if (!config) return;
                const menu = document.createElement('div');
                menu.className = 'dropdown-menu-dynamic';
                config.items.forEach(item => { menu.innerHTML += `<a href="#" data-value="${item.value}">${item.text}</a>`; });
                menu.addEventListener('click', (ev) => {
                    const target = ev.target.closest('a');
                    if (target) { ev.preventDefault(); handleDropdownSelection(dropdownId, target.dataset.value, trigger); menu.remove(); }
                });
                document.body.appendChild(menu);
                const rect = trigger.getBoundingClientRect();
                menu.style.position = 'absolute';
                menu.style.top = `${rect.bottom + 5}px`;
                menu.style.left = `${rect.left}px`;
            }, { signal: controller.signal });
        });
    }

    function initializeAll() {
        injectComponentStyles();
        initializeDropdowns();
        homeSection.querySelector('.projects-card .project-list').addEventListener('click', e => { const item = e.target.closest('.project-item'); if (item) selectProject(item.dataset.projectId); });
        homeSection.querySelector('.my-tasks-card .task-tabs').addEventListener('click', e => { const item = e.target.closest('.tab-btn'); if (item) selectSection(item.dataset.sectionId); });
        const taskListContainer = homeSection.querySelector('.my-tasks-card .task-list');
        if (taskListContainer) {
            taskListContainer.addEventListener('change', e => { if (e.target.matches('.task-checkbox')) handleTaskCompletion(e.target.dataset.taskId, e.target.checked); });
            taskListContainer.addEventListener('click', e => {
                const datePickerIcon = e.target.closest('.task-due-date-picker');
                if (datePickerIcon) {
                    flatpickr(datePickerIcon, {
                        dateFormat: "Y-m-d",
                        className: "homedatepicker-container",
                        onChange: (selectedDates, dateStr, instance) => updateTaskDueDate(instance.element.dataset.taskId, dateStr),
                        onReady: (_, __, instance) => instance.open()
                    });
                }
            });
        }
        updateDateTime();
        const timerId = setInterval(updateDateTime, 60000);
        controller.signal.addEventListener('abort', () => clearInterval(timerId));

        onAuthStateChanged(auth, (user) => {
            detachAllListeners();
            projectsData = [];
            peopleData = [];
            activeWorkspaceId = null;
            activeProjectId = null;
            activeSectionId = null;
            currentUser = user;
            if (user) {
                // *** NEW ENTRY POINT FOR DATA LOADING ***
                attachWorkspaceListener(user.uid);
                renderActiveTaskFilterLabel();
            } else {
                // Clear UI on logout
                renderActiveTaskFilterLabel();
                updateDateTime();
                renderProjects();
                renderMyTasksCard();
                renderGlobalStats();
                renderPeople();
            }
        });
    }

    // UTILITY & HELPER FUNCTIONS (Unchanged)
    const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : '';
    const generateColorForName = (name) => `hsl(${(name || '').split("").reduce((a, b) => (a = ((a << 5) - a) + b.charCodeAt(0), a & a), 0) % 360}, 70%, 45%)`;
    const getDueDateInfo = (dueDate) => { if (!dueDate) return { text: '', color: '#aaa' }; const now = dayjs(); const date = dayjs(dueDate); if (date.isSame(now, 'day')) return { text: `Today`, color: 'red' }; if (date.isSame(now.add(1, 'day'), 'day')) return { text: 'Tomorrow', color: 'orange' }; if (date.isBefore(now, 'day')) return { text: date.format('MMM D'), color: 'red' }; return { text: date.format('MMM D'), color: '#666' }; };
    const updateProjectTaskCounts = () => projectsData.forEach(p => { const count = p.sections?.reduce((sum, s) => sum + (s.tasks?.filter(t => !t.completed).length || 0), 0) || 0; const el = homeSection.querySelector(`.project-item[data-project-id="${p.id}"] .project-meta`); if (el) el.textContent = `${count} task${count !== 1 ? 's' : ''}`; });
    const updateDateTime = () => { const dateEl = homeSection.querySelector('.date'); const greetEl = homeSection.querySelector('.greetings'); if (!dateEl || !greetEl) return; const now = dayjs(); dateEl.textContent = now.format('dddd, MMMM D, YYYY'); const hour = now.hour(); let greeting = 'Good evening'; if (hour < 12) greeting = 'Good morning'; else if (hour < 18) greeting = 'Good afternoon'; const userName = auth.currentUser?.displayName || 'there'; greetEl.textContent = `${greeting}, ${userName}!`; };
    const showNotification = (message, type = 'info') => { const el = document.createElement('div'); el.className = `notification ${type}`; el.textContent = message; document.body.appendChild(el); setTimeout(() => el.style.opacity = '0', 2500); setTimeout(() => el.remove(), 3000); };

    initializeAll();

    return function cleanup() {
        console.log("Cleaning up home section and detaching listeners.");
        controller.abort();
        detachAllListeners();
        document.querySelectorAll('.dropdown-menu-dynamic, .notification, .flatpickr-calendar').forEach(el => el.remove());
    };
}