/**
 * home.js
 * * Manages the main dashboard interface for the application. This script handles all
 * real-time data synchronization with Firestore for projects, sections, tasks, and people.
 * Key features include a seamless project creation workflow, inline task creation,
 * a custom-styled Flatpickr for due dates, and automatic task relocation upon completion.
 *
 * @version 4.0.0
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
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    firebaseConfig
} from "/services/firebase-config.js";

// Initialize Firebase
console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
console.log("Initialized Firebase on Dashboard.");

export function init(params) {
    dayjs.extend(window.dayjs_plugin_isBetween);
    console.log("Home section initialized with task movement and Flatpickr.");
    
    const controller = new AbortController();
    const homeSection = document.querySelector('.home');
    if (!homeSection) {
        console.error('Home section container (.home) not found!');
        return () => {};
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
            
            /* Styles for the custom date picker */
            .homedatepicker-container {
                z-index: 1052; /* Ensures it appears above notifications (1051) */
            }
        `;
        document.head.appendChild(style);
    }
    
    // State variables
    let currentUser = null;
    let activeProjectId = null;
    let activeSectionId = null;
    let projectsData = [];
    let peopleData = [];
    const listeners = { projects: null, sections: null, people: null, tasks: {} };
    
    // ===================================================================
    // [2] RENDER FUNCTIONS (THE "VIEW")
    // ===================================================================
    
    function renderProjects() {
    const projectList = homeSection.querySelector('.projects-card .project-list');
    if (!projectList) return;
    
    projectList.innerHTML = '';
    
    // BUGFIX: The line below caused the error. 'filter' is not defined.
    // const projectsToDisplay = projectsData.filter(p => filter === 'starred' ? p.starred : true);
    
    // CORRECT: Simply use the projectsData array directly, as the filtering feature was removed.
    const projectsToDisplay = projectsData;
    
    if (projectsToDisplay.length === 0 && currentUser) {
        projectList.innerHTML = `<div class="empty-state">Create a project to get started.</div>`;
    }
    
    const createBtn = document.createElement('button');
    createBtn.className = 'create-project-btn';
    createBtn.innerHTML = `<i class="fas fa-plus"></i> Create project`;
    createBtn.addEventListener('click', handleProjectCreate);
    
    projectsToDisplay.forEach(project => {
        const item = document.createElement('div');
        item.className = `project-item ${project.id === activeProjectId ? 'active' : ''}`;
        item.dataset.projectId = project.id;
        item.innerHTML = `
            <div class="project-icon" style="color: ${project.color};"><i class="fas fa-list"></i></div>
            <div class="project-info">
                <span class="project-name">${project.title}</span>
                <span class="project-meta" data-task-count></span>
            </div>`;
        projectList.appendChild(item);
    });
    
    projectList.appendChild(createBtn);
    updateProjectTaskCounts();
}
    
    function renderMyTasksCard() {
        const myTasksCard = homeSection.querySelector('.my-tasks-card');
        if (!myTasksCard) return;
        const tabsContainer = myTasksCard.querySelector('.task-tabs');
        const taskListContainer = myTasksCard.querySelector('.task-list');
        tabsContainer.innerHTML = '';
        taskListContainer.innerHTML = '';
        tabsContainer.style.display = 'none';
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
            taskListContainer.innerHTML = '<p class="empty-state">This project has no sections.</p>';
            return;
        }
        (activeSection.tasks || []).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).forEach(task => {
            taskListContainer.appendChild(createTaskElement(task));
        });
        if (activeSection.title !== 'Completed') {
            const createBtn = document.createElement('button');
            createBtn.className = 'create-task-btn';
            createBtn.innerHTML = `<i class="fas fa-plus"></i> Create task`;
            createBtn.addEventListener('click', () => showInlineTaskCreator(taskListContainer));
            taskListContainer.appendChild(createBtn);
        }
    }
    
    function createTaskElement(task) {
        const item = document.createElement('div');
        item.className = 'task-item';
        item.dataset.taskId = task.id;
        const { text, color } = getDueDateInfo(task.dueDate);
        item.innerHTML = `
            <input type="checkbox" class="task-checkbox" data-task-id="${task.id}" ${task.completed ? 'checked' : ''}/>
            <div class="task-content">
                <span class="task-text ${task.completed ? 'completed' : ''}">${task.name}</span>
                <span class="task-dates ${task.completed ? 'completed' : ''}" style="color: ${task.completed ? '#888' : color};">${text}</span>
            </div>
            <div class="task-actions">
                <i class="far fa-calendar task-action-btn task-due-date-picker" title="Set due date" data-task-id="${task.id}"></i>
            </div>`;
        return item;
    }
    
    function renderGlobalStats() {
        const completedEl = document.getElementById('tasks-completed');
        const membersEl = document.getElementById('total-members');
        if (completedEl) {
            let completedCount = 0;
            const project = projectsData.find(p => p.id === activeProjectId);
            if (project && project.sections) {
                completedCount = project.sections.reduce((sum, section) => sum + (section.tasks?.filter(t => t.completed).length || 0), 0);
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
    
    function selectProject(projectId) {
        if (!projectId || activeProjectId === projectId) return;
        activeProjectId = projectId;
        detachSectionAndTaskListeners();
        const project = projectsData.find(p => p.id === projectId);
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
        if (container.querySelector('.inline-task-creator')) return;
        const creatorEl = document.createElement('div');
        creatorEl.className = 'inline-task-creator';
        creatorEl.innerHTML = `<input type="text" placeholder="Write a task name...">`;
        container.insertBefore(creatorEl, container.lastChild);
        const inputEl = creatorEl.querySelector('input');
        inputEl.focus();
        const commit = async () => {
            const taskName = inputEl.value.trim();
            if (taskName) {
                const tasksColRef = collection(db, `users/${currentUser.uid}/projects/${activeProjectId}/sections/${activeSectionId}/tasks`);
                try {
                    await addDoc(tasksColRef, { name: taskName, dueDate: null, assignees: [], completed: false, createdAt: new Date() });
                } catch (error) {
                    console.error("Error creating task: ", error);
                }
            }
            creatorEl.remove();
        };
        inputEl.addEventListener('blur', commit);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') creatorEl.remove();
        });
    }
    
    async function handleProjectCreate() {
        if (!currentUser) return;
        const name = prompt("Enter new project name:");
        if (!name || !name.trim()) return;
        const projectsColRef = collection(db, `users/${currentUser.uid}/projects`);
        try {
            const docRef = await addDoc(projectsColRef, { title: name.trim(), color: generateColorForName(name.trim()), starred: false, createdAt: new Date() });
            const sectionsColRef = collection(db, `users/${currentUser.uid}/projects/${docRef.id}/sections`);
            await addDoc(sectionsColRef, { title: 'General', createdAt: new Date() });
            showNotification('Project created!', 'success');
            selectProject(docRef.id);
        } catch (error) {
            console.error("Error creating project: ", error);
        }
    }
    
    async function handleTaskCompletion(taskId, isCompleted) {
        if (!currentUser || !activeProjectId) return;
        const project = projectsData.find(p => p.id === activeProjectId);
        if (!project) return;
        let sourceSection, taskData;
        for (const section of project.sections) {
            const task = section.tasks?.find(t => t.id === taskId);
            if (task) {
                sourceSection = section;
                taskData = task;
                break;
            }
        }
        if (!sourceSection || !taskData) return;
        let targetSection;
        if (isCompleted) {
            targetSection = project.sections.find(s => s.title === 'Completed');
            if (!targetSection) {
                try {
                    const sectionsColRef = collection(db, `users/${currentUser.uid}/projects/${activeProjectId}/sections`);
                    const newSectionDoc = await addDoc(sectionsColRef, { title: 'Completed', createdAt: new Date() });
                    targetSection = { id: newSectionDoc.id, title: 'Completed' };
                } catch (error) { return; }
            }
        } else {
            targetSection = project.sections.find(s => s.title !== 'Completed');
            if (!targetSection) return;
        }
        if (sourceSection.id === targetSection.id) return;
        try {
            const batch = writeBatch(db);
            const oldTaskRef = doc(db, `users/${currentUser.uid}/projects/${activeProjectId}/sections/${sourceSection.id}/tasks`, taskId);
            const newTaskRef = doc(db, `users/${currentUser.uid}/projects/${activeProjectId}/sections/${targetSection.id}/tasks`, taskId);
            const updatedTaskData = { ...taskData, completed: isCompleted };
            batch.set(newTaskRef, updatedTaskData);
            batch.delete(oldTaskRef);
            await batch.commit();
        } catch (error) {
            console.error("Error moving task:", error);
        }
    }
    
    async function updateTaskDueDate(taskId, newDueDate) {
        if (!currentUser || !activeProjectId) return;
        const project = projectsData.find(p => p.id === activeProjectId);
        let sourceSection;
        for (const section of (project?.sections || [])) {
            if (section.tasks?.find(t => t.id === taskId)) {
                sourceSection = section;
                break;
            }
        }
        if (!sourceSection) return;
        const taskRef = doc(db, `users/${currentUser.uid}/projects/${activeProjectId}/sections/${sourceSection.id}/tasks`, taskId);
        try {
            await updateDoc(taskRef, { dueDate: newDueDate });
            showNotification("Due date updated!", "success");
        } catch (error) {
            console.error("Error updating due date:", error);
        }
    }
    
    // ===================================================================
    // [4] REAL-TIME LISTENER MANAGEMENT
    // ===================================================================
    
    function attachProjectListener(userId) {
        const projectsQuery = query(collection(db, `users/${userId}/projects`), orderBy("createdAt", "desc"));
        listeners.projects = onSnapshot(projectsQuery, (snapshot) => {
            projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (!activeProjectId && projectsData.length > 0) {
                selectProject(projectsData[0].id);
            } else if (activeProjectId && !projectsData.some(p => p.id === activeProjectId)) {
                selectProject(projectsData[0]?.id || null);
            }
            renderProjects();
            updateProjectTaskCounts();
        });
    }
    
    function attachPeopleListener(userId) {
        const peopleQuery = query(collection(db, `users/${userId}/people`));
        listeners.people = onSnapshot(peopleQuery, (snapshot) => {
            peopleData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderGlobalStats();
        });
    }
    
    function attachSectionAndTaskListeners(projectId) {
        if (!currentUser || !projectId) return;
        const sectionsQuery = query(collection(db, `users/${currentUser.uid}/projects/${projectId}/sections`), orderBy("createdAt"));
        listeners.sections = onSnapshot(sectionsQuery, (sectionsSnapshot) => {
            const project = projectsData.find(p => p.id === projectId);
            if (!project) return;
            const currentSections = sectionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const newSectionIds = new Set(currentSections.map(s => s.id));
            const oldSectionIds = new Set(project.sections?.map(s => s.id) || []);
            project.sections = currentSections;
            
            if (!activeSectionId || !newSectionIds.has(activeSectionId)) {
                activeSectionId = project.sections[0]?.id || null;
            }
            
            project.sections.forEach(section => {
                if (!listeners.tasks[section.id]) {
                    const tasksQuery = query(collection(db, `users/${currentUser.uid}/projects/${projectId}/sections/${section.id}/tasks`), orderBy("createdAt"));
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
            
            oldSectionIds.forEach(id => {
                if (!newSectionIds.has(id) && listeners.tasks[id]) {
                    listeners.tasks[id]();
                    delete listeners.tasks[id];
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
    
    function detachAllListeners() {
        if (listeners.projects) listeners.projects();
        if (listeners.people) listeners.people();
        detachSectionAndTaskListeners();
        console.log("All Firestore listeners detached.");
    }
    
    // ===================================================================
    // [5] INITIALIZATION & CLEANUP
    // ===================================================================
    
    function initializeAll() {
        injectComponentStyles();
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
            activeProjectId = null;
            activeSectionId = null;
            if (user) {
                currentUser = user;
                attachProjectListener(user.uid);
                attachPeopleListener(user.uid);
            }
            currentUser = user;
            updateDateTime();
            renderProjects();
            renderMyTasksCard();
            renderGlobalStats();
        });
    }
    
    // UTILITY & HELPER FUNCTIONS
    const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : '';
    const generateColorForName = (name) => `hsl(${(name || '').split("").reduce((a, b) => (a = ((a << 5) - a) + b.charCodeAt(0), a & a), 0) % 360}, 70%, 45%)`;
    const getDueDateInfo = (dueDate) => {
        if (!dueDate) return { text: '', color: '#aaa' };
        const now = dayjs();
        const date = dayjs(dueDate);
        if (date.isSame(now, 'day')) return { text: `Today`, color: 'red' };
        if (date.isSame(now.add(1, 'day'), 'day')) return { text: 'Tomorrow', color: 'orange' };
        if (date.isBefore(now, 'day')) return { text: date.format('MMM D'), color: 'red' };
        return { text: date.format('MMM D'), color: '#666' };
    };
    const updateProjectTaskCounts = () => projectsData.forEach(p => { const count = p.sections?.reduce((sum, s) => sum + (s.tasks?.filter(t => !t.completed).length || 0), 0) || 0; const el = homeSection.querySelector(`.project-item[data-project-id="${p.id}"] .project-meta`); if (el) el.textContent = `${count} task${count !== 1 ? 's' : ''}`; });
    const updateDateTime = () => { const dateEl = homeSection.querySelector('.date'); const greetEl = homeSection.querySelector('.greetings'); if (!dateEl || !greetEl) return; const now = dayjs();
        dateEl.textContent = now.format('dddd, MMMM D'); const hour = now.hour(); let greeting = 'Good evening'; if (hour < 12) greeting = 'Good morning';
        else if (hour < 18) greeting = 'Good afternoon'; const userName = auth.currentUser?.displayName || 'there';
        greetEl.textContent = `${greeting}, ${userName}!`; };
    const showNotification = (message, type = 'info') => { const el = document.createElement('div');
        el.className = `notification ${type}`;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.style.opacity = '0', 2500);
        setTimeout(() => el.remove(), 3000); };
    
    initializeAll();
    
    return function cleanup() {
        console.log("Cleaning up home section and detaching listeners.");
        controller.abort();
        detachAllListeners();
        document.querySelectorAll('.dropdown-menu-dynamic, .notification, .flatpickr-calendar').forEach(el => el.remove());
    };
}