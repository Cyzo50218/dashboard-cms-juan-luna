// File: /dashboard/home/home.js

/**
 * Initializes the 'Home' section, encapsulating all its logic and event listeners.
 * Returns a cleanup function to be called by the router when navigating away.
 */
export function init(params) {
    console.log("Home section successfully initialized.");

    // Use an AbortController for easy and reliable event listener cleanup.
    const controller = new AbortController();

    // Get the main container div to scope all DOM queries.
    const homeSection = document.querySelector('.home');
    if (!homeSection) {
        console.error('Home section container (.home) not found!');
        return () => {}; // Return an empty cleanup function.
    }

    // --- [1] DATA & CONFIGURATION ---

    // Centralized configuration for all dropdowns on this page.
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

    function injectPeopleCardStyles() {
        if (document.getElementById('homepeople-styles')) return; // Prevent duplicate styles
        const style = document.createElement('style');
        style.id = 'homepeople-styles';
        style.textContent = `
         .homepeople-item--inactive {
            opacity: 0.5;
            filter: grayscale(80%);
        }
        .homepeople-item--inactive:hover {
            opacity: 1;
            filter: grayscale(0%);
        }
            .homepeople-list{display:flex;flex-direction:column;gap:8px}.homepeople-item{display:flex;align-items:center;padding:8px;border-radius:8px;transition:background-color .2s ease;cursor:pointer}.homepeople-item:hover{background-color:#f4f4f4}.homepeople-avatar{width:36px;height:36px;border-radius:50%;margin-right:12px;display:flex;align-items:center;justify-content:center;font-weight:500;color:#fff;overflow:hidden}.homepeople-avatar img{width:100%;height:100%;object-fit:cover}.homepeople-info{flex-grow:1;display:flex;flex-direction:column}.homepeople-name{font-weight:500;color:#111;font-size:14px}.homepeople-role{font-size:13px;color:#666}.homepeople-action{color:#888;padding:4px;border-radius:50%}.homepeople-action:hover{background-color:#e0e0e0;color:#111}.homepeople-placeholder{text-align:center;padding:24px}.homepeople-placeholder .people-icon{font-size:24px;color:#999;background-color:#f0f0f0;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px auto}.homepeople-placeholder p{font-size:14px;color:#666;margin-bottom:16px}
        `;
        document.head.appendChild(style);
    }
    // Mock data to simulate a real application.
    let projects = [
        { id: 'proj-1', name: 'Website Redesign', color: '#4c9aff', starred: true },
        { id: 'proj-2', name: 'Q3 Marketing Campaign', color: '#4caf50', starred: false },
        { id: 'proj-3', name: 'Mobile App Launch', color: '#9c27b0', starred: true },
    ];

    let tasks = [
        { id: 'task-1', name: 'Finalize new logo concepts', sectionId: 'proj-1', startDate: new Date(), endDate: new Date(), color: '#4c9aff', assigneeName: 'Alice', assigneeIconUrl: 'https://i.pravatar.cc/150?img=1', completed: false },
        { id: 'task-2', name: 'Review ad copy for social media', sectionId: 'proj-2', startDate: new Date('2025-06-10T09:00:00'), endDate: new Date('2025-06-12T17:00:00'), color: '#ffc107', assigneeName: 'Bob', assigneeIconUrl: 'https://i.pravatar.cc/150?img=2', completed: false }, // Overdue
        { id: 'task-3', name: 'Present mockups to stakeholders', sectionId: 'proj-1', startDate: new Date(new Date().setDate(new Date().getDate() + 2)), endDate: new Date(new Date().setDate(new Date().getDate() + 4)), color: '#4c9aff', assigneeName: 'Charlie', assigneeIconUrl: 'https://i.pravatar.cc/150?img=3', completed: false }, // This week
        { id: 'task-4', name: 'Plan influencer outreach', sectionId: 'proj-2', startDate: new Date(new Date().setDate(new Date().getDate() + 7)), endDate: new Date(new Date().setDate(new Date().getDate() + 10)), color: '#4caf50', assigneeName: 'David', assigneeIconUrl: 'https://i.pravatar.cc/150?img=4', completed: false }, // Next Week
        { id: 'task-5', name: 'Submit app to Apple App Store', sectionId: 'proj-3', startDate: new Date('2025-06-02T09:00:00'), endDate: new Date('2025-06-06T18:00:00'), color: '#e91e63', assigneeName: 'Eve', assigneeIconUrl: 'https://i.pravatar.cc/150?img=5', completed: true },
    ];
    
    let people = [
        { id: 'p-1', name: 'Alice Johnson', role: 'Designer', frequent: true, avatarUrl: 'https://i.pravatar.cc/150?img=1', isActive: true },
        { id: 'p-2', name: 'Bob Williams', role: 'Engineer', frequent: true, avatarUrl: 'https://i.pravatar.cc/150?img=2', isActive: false },
        { id: 'p-3', name: 'Charlie Brown', role: 'Product Manager', frequent: false, avatarUrl: null, isActive: true },
        { id: 'p-4', name: 'Diana Prince', role: 'Marketing', frequent: true, avatarUrl: 'https://i.pravatar.cc/150?img=4', isActive: true },
    ];


    // --- [2] RENDER FUNCTIONS ---
    
    function renderProjects(filter = 'all') {
        const projectList = homeSection.querySelector('.projects-card .project-list');
        if (!projectList) return;

        const createBtnHTML = `<button class="create-project-btn"><i class="fas fa-plus"></i> Create project</button>`;
        projectList.innerHTML = createBtnHTML;
        
        const projectsToDisplay = projects.filter(p => filter === 'starred' ? p.starred : true);

        projectsToDisplay.forEach(project => {
            const item = document.createElement('div');
            item.className = 'project-item';
            item.dataset.projectId = project.id;
            item.innerHTML = `
                <div class="project-icon" style="color: ${project.color};"><i class="fas fa-list"></i></div>
                <div class="project-info">
                    <span class="project-name">${project.name}</span>
                    <span class="project-meta" data-task-count></span>
                </div>
            `;
            // Insert before the create button
            projectList.insertBefore(item, projectList.querySelector('.create-project-btn'));
        });
        updateTaskCount();
    }

    function renderTasks(filterFunc) {
        const taskList = homeSection.querySelector('.task-list');
        if (!taskList) return;

        const createBtnHTML = `<button class="create-task-btn"><i class="fas fa-plus"></i> Create task</button>`;
        taskList.innerHTML = createBtnHTML;

        const tasksToDisplay = tasks.filter(filterFunc).sort((a, b) => a.endDate - b.endDate);

        if (tasksToDisplay.length === 0) {
            taskList.insertAdjacentHTML('afterbegin', `<p class="empty-state">No tasks here. Enjoy the quiet!</p>`);
        }

        tasksToDisplay.forEach(task => {
            const item = document.createElement('div');
            item.className = 'task-item';
            item.dataset.taskId = task.id;
            item.style.borderLeft = `4px solid ${task.color}`;

            const dateDisplay = dayjs(task.endDate).format('MMM D');

            item.innerHTML = `
                <input type="checkbox" class="task-checkbox" data-task-id="${task.id}" ${task.completed ? 'checked' : ''} />
                <div class="task-content">
                    <span class="task-text ${task.completed ? 'completed' : ''}">${task.name}</span>
                    <span class="task-dates">${dateDisplay}</span>
                </div>
                <div class="task-assignee" title="${task.assigneeName}">
                    <img src="${task.assigneeIconUrl}" alt="${task.assigneeName}" />
                </div>`;
            taskList.insertBefore(item, taskList.querySelector('.create-task-btn'));
        });
    }

    function renderPeople(filter = 'all') {
        const peopleContent = homeSection.querySelector('.people-content');
        if (!peopleContent) return;

        const peopleToDisplay = people.filter(p => filter === 'frequent' ? (p.frequent && p.isActive) : true);
        peopleContent.innerHTML = '';

        if (peopleToDisplay.length > 0) {
            const list = document.createElement('div');
            list.className = 'homepeople-list';
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
                list.appendChild(item);
            });
            peopleContent.appendChild(list);
        } else {
            peopleContent.innerHTML = `
                <div class="homepeople-placeholder">
                    <div class="people-icon"><i class="fas fa-user-plus"></i></div>
                    <p>Invite your teammates to collaborate</p>
                    <button class="invite-btn">Invite teammates</button>
                </div>`;
            homeSection.querySelector('.invite-btn').addEventListener('click', () => showEmailModal);
        }
    }


    // --- [3] HELPER & UTILITY FUNCTIONS ---

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
    
    const getInitials = (name) => name.split(' ').map(n=>n[0]).join('').toUpperCase();
    const generateColorForName = (name) => `hsl(${name.split("").reduce((a,b)=>(a=((a<<5)-a)+b.charCodeAt(0),a&a),0)%360}, 70%, 45%)`;
    

    // --- [4] EVENT HANDLERS ---
    
    function handleTaskCheck(e) {
        if (!e.target.matches('.task-checkbox')) return;
        const taskId = e.target.dataset.taskId;
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = e.target.checked;
            const textEl = e.target.closest('.task-item').querySelector('.task-text');
            textEl.classList.toggle('completed', task.completed);
            showNotification(`Task "${task.name}" marked as ${task.completed ? 'complete' : 'incomplete'}.`, 'success');
            setTimeout(() => {
                renderTasks(getActiveTaskFilter());
                updateTaskCount();
            }, 300);
        }
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


    // --- [5] INITIALIZATION & CLEANUP ---

    function initializeAll() {
        injectPeopleCardStyles();
        initializeDropdowns();

        // Attach main listeners
        homeSection.querySelector('.task-list').addEventListener('click', handleTaskCheck, { signal: controller.signal });
        homeSection.querySelector('.my-tasks-card .create-task-btn').addEventListener('click', () => handleCreate('task'), { signal: controller.signal });
        homeSection.querySelector('.projects-card .create-project-btn').addEventListener('click', () => handleCreate('project'), { signal: controller.signal });
        homeSection.querySelector('.invite-btn').addEventListener('click', () => showNotification('Invite feature coming soon!'), { signal: controller.signal });

        homeSection.querySelectorAll('.tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                homeSection.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                e.currentTarget.classList.add('active');
                renderTasks(getActiveTaskFilter());
            }, { signal: controller.signal });
        });
        
        // This handles clicks on person items for navigation
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
        
        renderProjects();
        renderTasks(getActiveTaskFilter());
        renderPeople();
    }

    initializeAll();

    return function cleanup() {
        console.log("Cleaning up home section.");
        controller.abort();
        document.querySelectorAll('.dropdown-menu-dynamic, .notification').forEach(el => el.remove());
    };
}