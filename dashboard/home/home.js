
export function init(params) {
    // Explicitly load the isBetween plugin to ensure it's available.
    dayjs.extend(window.dayjs_plugin_isBetween);

    console.log("Home section initialized with stable section and filtering logic.");

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
            .task-item { display: flex; align-items: center; gap: 8px; }
            .task-content { flex-grow: 1; display: flex; flex-direction: column; }
            .task-text.completed { text-decoration: line-through; color: #888; }
            .task-dates.completed { color: #888 !important; }
            .task-actions { display: flex; align-items: center; }
            .task-reaction-btn { cursor: pointer; color: #aaa; padding: 4px; border-radius: 50%; }
            .task-reaction-btn:hover { background-color: #f0f0f0; color: #e91e63; }
            .homepeople-list{display:flex;flex-direction:column;gap:8px}.homepeople-item{display:flex;align-items:center;padding:8px;border-radius:8px;transition:background-color .2s ease;cursor:pointer}.homepeople-item:hover{background-color:#f4f4f4}.homepeople-avatar{width:36px;height:36px;border-radius:50%;margin-right:12px;display:flex;align-items:center;justify-content:center;font-weight:500;color:#fff;overflow:hidden}.homepeople-avatar img{width:100%;height:100%;object-fit:cover}.homepeople-info{flex-grow:1;display:flex;flex-direction:column}.homepeople-name{font-weight:500;color:#111;font-size:14px}.homepeople-role{font-size:13px;color:#666}.homepeople-action{color:#888;padding:4px;border-radius:50%}.homepeople-action:hover{background-color:#e0e0e0;color:#111}.homepeople-item--inactive{opacity:.5;filter:grayscale(80%)}.homepeople-item--inactive:hover{opacity:1;filter:grayscale(0%)}.homepeople-invite-item{display:flex;align-items:center;padding:12px 8px;border-radius:8px;color:#555;font-weight:500;cursor:pointer;transition:background-color .2s ease;border:1px dashed transparent}.homepeople-invite-item:hover{background-color:#f4f4f4;border-color:#ddd}.homepeople-invite-item i{margin-right:12px;font-size:16px}
            .dropdown-menu-dynamic{position:absolute;z-index:1050;display:block;min-width:220px;padding:8px 0;margin-top:4px;background-color:#fff;border:1px solid #e8e8e8;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);animation:fadeIn .15s ease-out}.dropdown-menu-dynamic a{display:block;padding:10px 16px;font-size:14px;font-weight:500;color:#333;text-decoration:none;white-space:nowrap;transition:background-color .2s ease}.dropdown-menu-dynamic a:hover{background-color:#f4f4f4;color:#111}@keyframes fadeIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
        `;
        document.head.appendChild(style);
    }

    const dropdownConfig = {
        'my-week': { // Reverted to 'my-week' to ensure it matches your HTML
            label: 'Today',
            items: [
                { text: 'All Tasks', value: 'all' }, // To clear filters
                { text: 'Today', value: 'today' },
                { text: 'This Week', value: 'this-week' },
                { text: 'Next Week', value: 'next-week' }
            ]
        },
        'project-recents': {
    label: 'Recents',
    items: [
        { text: 'All Projects', value: 'all' },
        { text: 'Starred Projects', value: 'starred' }
    ]
},
'collaborators': {
    label: 'Frequent collaborators',
    items: [
        { text: 'All Collaborators', value: 'all' },
        { text: 'Frequent & Active', value: 'frequent' }
    ]
}
};

    let activeProjectId = null;
    let activeSectionId = null;
    let activeTaskFilter = 'today';

    let allUsers = { 1: { name: 'Alice', avatarUrl: 'https://i.pravatar.cc/150?img=1' }, 2: { name: 'Rory', avatarUrl: 'https://i.pravatar.cc/150?img=7' }, 3: { name: 'Bob', avatarUrl: 'https://i.pravatar.cc/150?img=2' }, 4: { name: 'Charlie', avatarUrl: 'https://i.pravatar.cc/150?img=3' }, 5: { name: 'David', avatarUrl: 'https://i.pravatar.cc/150?img=4' }, };
    let people = [ { id: 'p-1', name: 'Alice Johnson', role: 'Designer', frequent: true, avatarUrl: 'https://i.pravatar.cc/150?img=1', isActive: true }, { id: 'p-2', name: 'Bob Williams', role: 'Engineer', frequent: true, avatarUrl: 'https://i.pravatar.cc/150?img=2', isActive: false }, { id: 'p-3', name: 'Charlie Brown', role: 'Product Manager', frequent: false, avatarUrl: null, isActive: true }, { id: 'p-4', name: 'Diana Prince', role: 'Marketing', frequent: true, avatarUrl: 'https://i.pravatar.cc/150?img=4', isActive: true }, ];
    let projectsData = [ { id: 'proj-1', title: 'Website Redesign', color: '#4c9aff', starred: true, sections: [ { id: 1, title: 'Discovery & Design', tasks: [ { id: 101, name: 'Finalize new logo concepts', dueDate: '2025-06-13', assignees: [1, 2], completed: false }, { id: 102, name: 'Present mockups to stakeholders', dueDate: '2025-06-14', assignees: [1], completed: true }, ] }, { id: 2, title: 'Development', tasks: [ { id: 201, name: 'Initial setup for React app', dueDate: '2025-06-13', assignees: [3], completed: false }, ] }, ] }, { id: 'proj-2', title: 'Q3 Marketing Campaign', color: '#4caf50', starred: false, sections: [ { id: 3, title: 'Planning', tasks: [ { id: 301, name: 'Review ad copy for social media', dueDate: '2025-06-12', assignees: [4, 5], completed: false }, { id: 302, name: 'Plan influencer outreach', dueDate: '2025-06-20', assignees: [4], completed: false }, ] }, ] }, ];

    // ===================================================================
    // [2] RENDER FUNCTIONS (THE "VIEW")
    // ===================================================================
    function renderProjects(filter = 'all') {
        const projectList = homeSection.querySelector('.projects-card .project-list');
        if (!projectList) return;
        
        projectList.innerHTML = '';
        const createBtn = document.createElement('button');
        createBtn.className = 'create-project-btn';
        createBtn.innerHTML = `<i class="fas fa-plus"></i> Create project`;
        createBtn.addEventListener('click', () => handleCreate('project'), { signal: controller.signal });
        projectList.appendChild(createBtn);
        
        const projectsToDisplay = projectsData.filter(p => filter === 'starred' ? p.starred : true);
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
        updateProjectTaskCounts();
    }
    

    function renderMyTasksCard() {
        const myTasksCard = homeSection.querySelector('.my-tasks-card');
        if (!myTasksCard) return;

        const tabsContainer = myTasksCard.querySelector('.task-tabs');
        const taskListContainer = myTasksCard.querySelector('.task-list');
        
        // Always clear previous state
        tabsContainer.innerHTML = '';
        taskListContainer.innerHTML = '';
        tabsContainer.style.display = 'none'; // Hide by default

        if (!activeProjectId) {
            taskListContainer.innerHTML = '<p class="empty-state">Select a project to see its tasks.</p>';
            return;
        }

        const project = projectsData.find(p => p.id === activeProjectId);
        if (!project) return;
        
        // ALWAYS render section tabs and ensure they are visible
        tabsContainer.style.display = 'flex';
        project.sections.forEach(section => {
            if (section.title === 'Completed' && section.tasks.length === 0) return;
            const tab = document.createElement('button');
            tab.className = `tab-btn ${section.id === activeSectionId ? 'active' : ''}`;
            tab.textContent = section.title;
            tab.dataset.sectionId = section.id;
            tabsContainer.appendChild(tab);
        });

        // Get the tasks from the currently active section
        const activeSection = project.sections.find(s => s.id === activeSectionId);
        if (!activeSection) {
            taskListContainer.innerHTML = '<p class="empty-state">No section selected.</p>';
            return;
        }

        let tasksToDisplay = [...activeSection.tasks];

        // If the filter is not "all", apply the date filter
        if (activeTaskFilter !== 'all') {
            const now = dayjs();
            let filterFunc;

            if (activeTaskFilter === 'today') {
                filterFunc = t => dayjs(t.dueDate).isSame(now, 'day');
            } else if (activeTaskFilter === 'this-week') {
                filterFunc = t => dayjs(t.dueDate).isBetween(now.startOf('week'), now.endOf('week'), 'day', '[]');
            } else if (activeTaskFilter === 'next-week') {
                const nextWeekStart = now.add(1, 'week').startOf('week');
                const nextWeekEnd = now.add(1, 'week').endOf('week');
                filterFunc = t => dayjs(t.dueDate).isBetween(nextWeekStart, nextWeekEnd, 'day', '[]');
            }
            tasksToDisplay = tasksToDisplay.filter(filterFunc || (() => false));
        }

        // Render the final list of tasks
        const createBtn = document.createElement('button');
        createBtn.className = 'create-task-btn';
        createBtn.innerHTML = `<i class="fas fa-plus"></i> Create task`;
        taskListContainer.appendChild(createBtn);

        if (tasksToDisplay.length === 0) {
            const filterText = activeTaskFilter === 'all' ? 'tasks in this section' : `tasks for "${activeTaskFilter.replace('-', ' ')}" in this section`;
            taskListContainer.insertAdjacentHTML('beforeend', `<p class="empty-state">No ${filterText}.</p>`);
            return;
        }

        tasksToDisplay.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).forEach(task => {
            taskListContainer.appendChild(createTaskElement(task));
        });
    }

    function createTaskElement(task, showProjectName = false) {
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
            <div class="task-assignee">
                ${task.assignees.map(id => `<img src="${allUsers[id].avatarUrl}" title="${allUsers[id].name}">`).join('')}
            </div>
            <div class="task-actions">
                <i class="far fa-heart task-reaction-btn" title="React" data-task-id="${task.id}"></i>
            </div>`;
    return item;
}


function renderPeople(filter = 'all') {
    const peopleContent = homeSection.querySelector('.people-content');
    if (!peopleContent) return;
    const peopleToDisplay = people.filter(p => filter === 'frequent' ? (p.frequent && p.isActive) : true);
    peopleContent.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'homepeople-list';
    peopleToDisplay.forEach(person => {
        const item = document.createElement('div');
        item.className = 'homepeople-item';
        if (!person.isActive) item.classList.add('homepeople-item--inactive');
        const avatarHTML = person.avatarUrl ?
            `<div class="homepeople-avatar"><img src="${person.avatarUrl}" alt="${person.name}"></div>` :
            `<div class="homepeople-avatar" style="background-color: ${generateColorForName(person.name)};">${getInitials(person.name)}</div>`;
        item.innerHTML = `${avatarHTML}<div class="homepeople-info"><span class="homepeople-name">${person.name}</span><span class="homepeople-role">${person.role}</span></div><a href="/admin-console/${person.id}/members" class="homepeople-action" title="Admin Console"><i class="fas fa-ellipsis-h"></i></a>`;
        list.appendChild(item);
    });
    const inviteItem = document.createElement('div');
    inviteItem.className = 'homepeople-invite-item';
    inviteItem.innerHTML = `<i class="fas fa-user-plus"></i> Invite teammates`;
    inviteItem.addEventListener('click', () => alert('Invite modal would show here.'), { signal: controller.signal });
    list.appendChild(inviteItem);
    peopleContent.appendChild(list);
}

// ===================================================================
// [3] LOGIC, HANDLERS, AND HELPERS
// ===================================================================

function openSidebarTasks(taskId) {
    console.log("Request to open sidebar for task ID:", taskId);
    showNotification(`Opening sidebar for task ${taskId}`, 'info');
}

function getDueDateInfo(dueDate) {
    const now = dayjs();
    const date = dayjs(dueDate);
    
    if (date.isSame(now, 'day')) {
        return { text: 'Today', color: 'red' };
    }
    if (date.isSame(now.subtract(1, 'day'), 'day')) {
        return { text: 'Yesterday', color: 'red' };
    }
    if (date.isBefore(now.subtract(1, 'day'), 'day')) {
        return { text: date.format('MMM D'), color: 'red' };
    }
    if (date.isSame(now.add(1, 'day'), 'day')) {
        return { text: 'Tomorrow', color: 'orange' };
    }
    return { text: date.format('MMM D'), color: '#666' };
}

function handleTaskCompletion(taskId, isCompleted) {
    let project, task, sourceSection, taskIndex;
    
    for (const p of projectsData) {
        for (const s of p.sections) {
            taskIndex = s.tasks.findIndex(t => t.id === taskId);
            if (taskIndex > -1) {
                task = s.tasks[taskIndex];
                sourceSection = s;
                project = p;
                break;
            }
        }
        if (task) break;
    }
    
    if (!task || !project) return;
    
    task.completed = isCompleted;
    if (isCompleted && sourceSection.title !== 'Completed') {
        let completedSection = project.sections.find(s => s.title === 'Completed');
        if (!completedSection) {
            completedSection = { id: Date.now(), title: 'Completed', tasks: [] };
            project.sections.push(completedSection);
        }
        sourceSection.tasks.splice(taskIndex, 1);
        completedSection.tasks.push(task);
        activeSectionId = completedSection.id;
    }
    
    renderMyTasksCard();
    updateProjectTaskCounts();
    showNotification(isCompleted ? 'Task marked as complete!' : 'Task restored!', 'success');
}

    function selectProject(projectId) {
        activeProjectId = projectId;
        activeTaskFilter = 'today'; // Default filter for any selected project
        
        const project = projectsData.find(p => p.id === projectId);
        activeSectionId = project?.sections[0]?.id || null;

        const taskFilterTrigger = homeSection.querySelector('.dropdown[data-dropdown-id="my-week"]');
        if(taskFilterTrigger) {
             const label = taskFilterTrigger.querySelector('.stats-label, .recents-btn, .frequent-btn');
             if(label) label.childNodes[0].nodeValue = 'Today ';
        }
        
        renderProjects();
        renderMyTasksCard();
    }

    function selectSection(sectionId) {
        activeSectionId = sectionId;
        renderMyTasksCard(); // Re-render tasks for the new section, honoring the current filter
    }
    
    function handleDropdownSelection(id, value, trigger) {
        const selectedItem = dropdownConfig[id]?.items.find(item => item.value === value);
        if (trigger && selectedItem) {
            const label = trigger.querySelector('.stats-label, .recents-btn, .frequent-btn');
            if (label) {
                label.childNodes[0].nodeValue = selectedItem.text + ' ';
            }
        }

        if (id === 'my-week') {
            activeTaskFilter = value;
            renderMyTasksCard();
        } else if (id === 'project-recents') {
            renderProjects(value);
        } else if (id === 'collaborators') {
            renderPeople(value);
        }
    }

    function handleCreate(type) {
    const name = prompt(`Enter new ${type} name:`);
    if (!name || !name.trim()) return;
    
    if (type === 'task' && activeProjectId && activeSectionId) {
        const project = projectsData.find(p => p.id === activeProjectId);
        const section = project.sections.find(s => s.id === activeSectionId);
        if (section) {
            const newTask = { id: Date.now(), name, dueDate: dayjs().format('YYYY-MM-DD'), assignees: [], completed: false };
            section.tasks.unshift(newTask);
            renderMyTasksCard();
            updateProjectTaskCounts();
            showNotification('Task created!', 'success');
        }
    } else if (type === 'project') {
        const newProject = { id: `proj-${Date.now()}`, title: name, color: generateColorForName(name), starred: false, sections: [{ id: Date.now(), title: 'General', tasks: [] }] };
        projectsData.push(newProject);
        renderProjects();
        selectProject(newProject.id);
        showNotification('Project created!', 'success');
    }
}
    function updateProjectTaskCounts() {
    projectsData.forEach(project => {
        const count = project.sections.reduce((sum, section) => sum + section.tasks.filter(t => !t.completed).length, 0);
        const projectItem = homeSection.querySelector(`.project-item[data-project-id="${project.id}"] .project-meta`);
        if (projectItem) projectItem.textContent = `${count} task${count !== 1 ? 's' : ''}`;
    });
}
    function updateDateTime() {
    const dateElement = homeSection.querySelector('.date');
    const greetingElement = homeSection.querySelector('.greetings');
    if (!dateElement || !greetingElement) return;
    const now = dayjs();
    dateElement.textContent = now.format('dddd, MMMM D');
    const hour = now.hour();
    let greeting = 'Good evening, Chat';
    if (hour < 12) greeting = 'Good morning, Chat';
    else if (hour < 18) greeting = 'Good afternoon, Chat';
    greetingElement.textContent = greeting;
}
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.style.opacity = '0', 2500);
        setTimeout(() => notification.remove(), 3000);
    }
    
    const getInitials = (name) => name.split(' ').map(n => n[0]).join('').toUpperCase();
    const generateColorForName = (name) => `hsl(${name.split("").reduce((a, b) => (a = ((a << 5) - a) + b.charCodeAt(0), a & a), 0) % 360}, 70%, 45%)`;
    function initializeDropdowns() {
        document.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-menu-dynamic').forEach(menu => menu.remove());
        }, { signal: controller.signal });

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
                    if (target) {
                        ev.preventDefault();
                        handleDropdownSelection(dropdownId, target.dataset.value, trigger);
                        menu.remove();
                    }
                });
                document.body.appendChild(menu);
                const rect = trigger.getBoundingClientRect();
                menu.style.position = 'absolute';
                menu.style.top = `${rect.bottom + 5}px`;
                menu.style.left = `${rect.left}px`;
            }, { signal: controller.signal });
        });
    }
    
    // ===================================================================
    // [4] INITIALIZATION & CLEANUP
    // ===================================================================
    function initializeAll() {
        injectComponentStyles();
        initializeDropdowns();

        homeSection.querySelector('.projects-card .project-list').addEventListener('click', e => { const projectItem = e.target.closest('.project-item'); if (projectItem) selectProject(projectItem.dataset.projectId); }, { signal: controller.signal });
        homeSection.querySelector('.my-tasks-card .task-tabs').addEventListener('click', e => { const tabItem = e.target.closest('.tab-btn'); if (tabItem) selectSection(parseInt(tabItem.dataset.sectionId)); }, { signal: controller.signal });
        homeSection.querySelector('.my-tasks-card .task-list').addEventListener('change', e => { const checkbox = e.target.closest('.task-checkbox'); if (checkbox) { handleTaskCompletion(parseInt(checkbox.dataset.taskId), checkbox.checked); } }, { signal: controller.signal});
        homeSection.querySelector('.my-tasks-card .task-list').addEventListener('click', e => { const reactionBtn = e.target.closest('.task-reaction-btn'); if (reactionBtn) { openSidebarTasks(parseInt(reactionBtn.dataset.taskId)); } }, { signal: controller.signal});
        homeSection.querySelector('.people-content').addEventListener('click', e => { const link = e.target.closest('a.homepeople-action'); if (link) { e.preventDefault(); if (typeof router === 'function') { history.pushState({ path: link.getAttribute('href') }, '', link.getAttribute('href')); router(); } else { console.warn('Global router() function not found.'); } } }, { signal: controller.signal });

        updateDateTime();
        const timerId = setInterval(updateDateTime, 60000);
        controller.signal.addEventListener('abort', () => clearInterval(timerId));

        if (projectsData.length > 0) {
            selectProject(projectsData[0].id);
        } else {
            renderProjects();
            renderMyTasksCard();
        }
        renderPeople();
    }

    initializeAll();

    return function cleanup() {
        console.log("Cleaning up home section.");
        controller.abort();
        document.querySelectorAll('.dropdown-menu-dynamic, .notification').forEach(el => el.remove());
    };
}