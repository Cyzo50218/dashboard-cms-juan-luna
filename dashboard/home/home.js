
export function init(params) {
    console.log("Home section initialized with final data model and dynamic tabs.");

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
            .task-text.completed { text-decoration: line-through; color: #888; }
            .empty-state { padding: 20px; text-align: center; color: #888; }
            .notification { position: fixed; top: 20px; right: 20px; background: #2196f3; color: white; padding: 12px 20px; border-radius: 6px; z-index: 1051; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: opacity 0.3s ease; }
            .notification.success { background-color: #4caf50; }
            .homepeople-list{display:flex;flex-direction:column;gap:8px}.homepeople-item{display:flex;align-items:center;padding:8px;border-radius:8px;transition:background-color .2s ease;cursor:pointer}.homepeople-item:hover{background-color:#f4f4f4}.homepeople-avatar{width:36px;height:36px;border-radius:50%;margin-right:12px;display:flex;align-items:center;justify-content:center;font-weight:500;color:#fff;overflow:hidden}.homepeople-avatar img{width:100%;height:100%;object-fit:cover}.homepeople-info{flex-grow:1;display:flex;flex-direction:column}.homepeople-name{font-weight:500;color:#111;font-size:14px}.homepeople-role{font-size:13px;color:#666}.homepeople-action{color:#888;padding:4px;border-radius:50%}.homepeople-action:hover{background-color:#e0e0e0;color:#111}.homepeople-item--inactive{opacity:.5;filter:grayscale(80%)}.homepeople-item--inactive:hover{opacity:1;filter:grayscale(0%)}.homepeople-invite-item{display:flex;align-items:center;padding:12px 8px;border-radius:8px;color:#555;font-weight:500;cursor:pointer;transition:background-color .2s ease;border:1px dashed transparent}.homepeople-invite-item:hover{background-color:#f4f4f4;border-color:#ddd}.homepeople-invite-item i{margin-right:12px;font-size:16px}
            .dropdown-menu-dynamic{position:absolute;z-index:1050;display:block;min-width:220px;padding:8px 0;margin-top:4px;background-color:#fff;border:1px solid #e8e8e8;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);animation:fadeIn .15s ease-out}.dropdown-menu-dynamic a{display:block;padding:10px 16px;font-size:14px;font-weight:500;color:#333;text-decoration:none;white-space:nowrap;transition:background-color .2s ease}.dropdown-menu-dynamic a:hover{background-color:#f4f4f4;color:#111}@keyframes fadeIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
        `;
        document.head.appendChild(style);
    }

    const dropdownConfig = {
        'my-week': {
            label: 'My week',
            items: [
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

    let allUsers = {
        1: { name: 'Alice', avatarUrl: 'https://i.pravatar.cc/150?img=1' },
        2: { name: 'Rory', avatarUrl: 'https://i.pravatar.cc/150?img=7' },
        3: { name: 'Bob', avatarUrl: 'https://i.pravatar.cc/150?img=2' },
        4: { name: 'Charlie', avatarUrl: 'https://i.pravatar.cc/150?img=3' },
        5: { name: 'David', avatarUrl: 'https://i.pravatar.cc/150?img=4' },
    };

    let projectsData = [
        { id: 'proj-1', title: 'Website Redesign', color: '#4c9aff', starred: true, sections: [
            { id: 1, title: 'Discovery & Design', tasks: [
                { id: 101, name: 'Finalize new logo concepts', dueDate: '2025-06-13', assignees: [1, 2] },
                { id: 102, name: 'Present mockups to stakeholders', dueDate: '2025-06-16', assignees: [1] },
            ]},
            { id: 2, title: 'Development', tasks: [
                { id: 201, name: 'Initial setup for React app', dueDate: '2025-06-18', assignees: [3] },
            ]},
        ]},
        { id: 'proj-2', title: 'Q3 Marketing Campaign', color: '#4caf50', starred: false, sections: [
            { id: 3, title: 'Planning', tasks: [
                { id: 301, name: 'Review ad copy for social media', dueDate: '2025-06-12', assignees: [4, 5] }, // Overdue
                { id: 302, name: 'Plan influencer outreach', dueDate: '2025-06-20', assignees: [4] },
            ]},
        ]},
    ];
    
    let projects = [
        { id: 'proj-1', name: 'Website Redesign', color: '#4c9aff', starred: true },
        { id: 'proj-2', name: 'Q3 Marketing Campaign', color: '#4caf50', starred: false },
        { id: 'proj-3', name: 'Mobile App Launch', color: '#9c27b0', starred: true },
    ];

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
        
        if (!activeProjectId) {
            tabsContainer.innerHTML = '';
            taskListContainer.innerHTML = '<p class="empty-state">Select a project to see its tasks.</p>';
            return;
        }

        const project = projectsData.find(p => p.id === activeProjectId);
        if (!project) return;

        tabsContainer.innerHTML = '';
        project.sections.forEach(section => {
            const tab = document.createElement('button');
            tab.className = `tab-btn ${section.id === activeSectionId ? 'active' : ''}`;
            tab.textContent = section.title;
            tab.dataset.sectionId = section.id;
            tabsContainer.appendChild(tab);
        });

        const createBtn = document.createElement('button');
        createBtn.className = 'create-task-btn';
        createBtn.innerHTML = `<i class="fas fa-plus"></i> Create task`;
        createBtn.addEventListener('click', () => handleCreate('task'), { signal: controller.signal });
        
        taskListContainer.innerHTML = '';
        taskListContainer.appendChild(createBtn);

        const activeSection = project.sections.find(s => s.id === activeSectionId);
        if (!activeSection || activeSection.tasks.length === 0) {
            taskListContainer.insertAdjacentHTML('beforeend', `<p class="empty-state">No tasks in this section.</p>`);
            return;
        }

        activeSection.tasks.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate)).forEach(task => {
            const item = document.createElement('div');
            item.className = 'task-item';
            item.innerHTML = `
                <input type="checkbox" class="task-checkbox" data-task-id="${task.id}" />
                <div class="task-content">
                    <span class="task-text">${task.name}</span>
                    <span class="task-dates">${dayjs(task.dueDate).format('MMM D')}</span>
                </div>
                <div class="task-assignee">
                    ${task.assignees.map(id => `<img src="${allUsers[id].avatarUrl}" title="${allUsers[id].name}">`).join('')}
                </div>`;
            taskListContainer.appendChild(item);
        });
    }

    function renderPeople(filter = 'all') {
        const peopleContent = homeSection.querySelector('.people-content');
        if (!peopleContent) return;

        const peopleToDisplay = people.filter(p => filter === 'frequent' ? (p.frequent && p.isActive) : true);

        // 1. Clear previous content
        peopleContent.innerHTML = '';

        // 2. Always create the list container
        const list = document.createElement('div');
        list.className = 'homepeople-list';

        // 3. Render the actual people first
        peopleToDisplay.forEach(person => {
            const item = document.createElement('div');
            item.className = 'homepeople-item';
            if (!person.isActive) item.classList.add('homepeople-item--inactive');

            const avatarHTML = person.avatarUrl
                ? `<div class="homepeople-avatar"><img src="${person.avatarUrl}" alt="${person.name}"></div>`
                : `<div class="homepeople-avatar" style="background-color: ${generateColorForName(person.name)};">${getInitials(person.name)}</div>`;

            item.innerHTML = `
            ${avatarHTML}
            <div class="homepeople-info">
                <span class="homepeople-name">${person.name}</span>
                <span class="homepeople-role">${person.role}</span>
            </div>
            <a href="/admin-console/${person.id}/members" class="homepeople-action" title="Admin Console">
                <i class="fas fa-ellipsis-h"></i>
            </a>
        `;

            // Attach direct click listener for SPA navigation
            const adminLink = item.querySelector('a.homepeople-action');
            if (adminLink) {
                adminLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    const url = adminLink.getAttribute('href');
                    history.pushState({ path: url }, '', url);
                    router(); // Assumes global router function from main.js
                }, { signal: controller.signal });
            }
            list.appendChild(item);
        });

        // 4. After rendering the people, create and append the special 'Invite' item
        const inviteItem = document.createElement('div');
        inviteItem.className = 'homepeople-invite-item';
        inviteItem.innerHTML = `<i class="fas fa-user-plus"></i> Invite teammates`;

        // Attach the modal function directly to this new element
        inviteItem.addEventListener('click', showEmailModal, { signal: controller.signal });
        list.appendChild(inviteItem);

        // 5. Finally, append the fully constructed list to the main container
        peopleContent.appendChild(list);
    }

    // ===================================================================
    // [3] LOGIC, HANDLERS, AND HELPERS
    // ===================================================================

    function selectProject(projectId) {
        activeProjectId = projectId;
        const project = projectsData.find(p => p.id === projectId);
        activeSectionId = project?.sections[0]?.id || null;
        renderProjects();
        renderMyTasksCard();
    }
    
    function selectSection(sectionId) {
        activeSectionId = sectionId;
        renderMyTasksCard();
    }
    
    function handleCreate(type) {
        const name = prompt(`Enter new ${type} name:`);
        if (!name || !name.trim()) return;

        if (type === 'task') {
            tasks.unshift({ id: `task-${Date.now()}`, name, sectionId: 'proj-1', startDate: new Date(), endDate: new Date(), color: '#4c9aff', assigneeName: 'You', assigneeIconUrl: 'https://i.pravatar.cc/150?u=current_user', completed: false });
            renderTasks(getActiveTaskFilter());
        } else if (type === 'project') {
            projects.push({ id: `proj-${Date.now()}`, name, color: generateColorForName(name), starred: false });
            renderProjects();
        }
        updateTaskCount();
        showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} created!`, 'success');
    }
    
    function updateProjectTaskCounts() {
        projectsData.forEach(project => {
            const count = project.sections.reduce((sum, section) => sum + section.tasks.length, 0);
            const projectItem = homeSection.querySelector(`.project-item[data-project-id="${project.id}"] .project-meta`);
            if (projectItem) projectItem.textContent = `${count} task${count !== 1 ? 's' : ''}`;
        });
    }
    
    function updateTaskCount() {
        const completedCount = tasks.filter(t => t.completed).length;
        homeSection.querySelector('.stats-item i.fa-check').nextElementSibling.textContent = `${completedCount} tasks completed`;
        homeSection.querySelector('.stats-item i.fa-users').nextElementSibling.textContent = `${people.filter(p => p.isActive).length} collaborators`;

        homeSection.querySelectorAll('.project-item').forEach(pItem => {
            const projectId = pItem.dataset.projectId;
            const taskCount = tasks.filter(t => t.sectionId === projectId && !t.completed).length;
            pItem.querySelector('[data-task-count]').textContent = `${taskCount} task${taskCount !== 1 ? 's' : ''}`;
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

    function getActiveTaskFilter() {
        const activeTab = homeSection.querySelector('.tab-btn.active').dataset.tab;
        const now = dayjs();
        switch (activeTab) {
            case 'upcoming': return task => !task.completed && dayjs(task.endDate).isAfter(now);
            case 'overdue': return task => !task.completed && dayjs(task.endDate).isBefore(now, 'day');
            case 'completed': return task => task.completed;
            default: return () => true;
        }
    }

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
                config.items.forEach(item => {
                    menu.innerHTML += `<a href="#" data-value="${item.value}">${item.text}</a>`;
                });

                menu.addEventListener('click', (e) => {
                    const target = e.target.closest('a');
                    if (target) {
                        e.preventDefault();
                        handleDropdownSelection(dropdownId, target.dataset.value, trigger);
                        menu.remove();
                    }
                });

                document.body.appendChild(menu);
                const rect = trigger.getBoundingClientRect();
                menu.style.position = 'absolute';
                menu.style.top = `${rect.bottom + 5}px`;
                menu.style.left = `${rect.left}px`;
                menu.classList.add('show');
            }, { signal: controller.signal });
        });
    }

    function handleDropdownSelection(id, value, trigger) {
        const label = trigger.querySelector('.stats-label, .recents-btn, .frequent-btn');
        const selectedItem = dropdownConfig[id].items.find(item => item.value === value);
        if (label && selectedItem) {
            label.childNodes[0].nodeValue = selectedItem.text + ' ';
        }

        if (id === 'my-week') {
            const now = dayjs();
            let filterFunc = () => true;
            if (value === 'today') filterFunc = t => !t.completed && dayjs(t.endDate).isSame(now, 'day');
            else if (value === 'this-week') filterFunc = t => !t.completed && dayjs(t.endDate).isBetween(now.startOf('week'), now.endOf('week'));
            else if (value === 'next-week') filterFunc = t => !t.completed && dayjs(t.endDate).isBetween(now.add(1, 'week').startOf('week'), now.add(1, 'week').endOf('week'));
            renderTasks(filterFunc);
        } else if (id === 'project-recents') {
            renderProjects(value);
        } else if (id === 'collaborators') {
            renderPeople(value);
        }
    }
    
    // ===================================================================
    // [4] INITIALIZATION & CLEANUP
    // ===================================================================

    function initializeAll() {
        injectComponentStyles();
        initializeDropdowns();

        // Attach delegated event listeners to the cards for efficiency
        homeSection.querySelector('.projects-card .project-list').addEventListener('click', e => {
            const projectItem = e.target.closest('.project-item');
            if (projectItem) selectProject(projectItem.dataset.projectId);
        }, { signal: controller.signal });

        homeSection.querySelector('.my-tasks-card .task-tabs').addEventListener('click', e => {
            const tabItem = e.target.closest('.tab-btn');
            if (tabItem) selectSection(parseInt(tabItem.dataset.sectionId));
        }, { signal: controller.signal });
        
         homeSection.querySelector('.people-content').addEventListener('click', e => {
            const link = e.target.closest('a.homepeople-action');
            if (link) {
                e.preventDefault();
                history.pushState({ path: link.getAttribute('href') }, '', link.getAttribute('href'));
                router(); // Assuming router is a global function from main.js
            }
        }, { signal: controller.signal });

        // Initial render of all components
        updateDateTime();
        const timerId = setInterval(updateDateTime, 60000);
        controller.signal.addEventListener('abort', () => clearInterval(timerId)); // Clean up interval

        // Initial render
        updateDateTime();
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
