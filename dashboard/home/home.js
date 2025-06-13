// File: /dashboard/home/home.js

/**
 * Initializes the 'Home' section, encapsulating all its logic and event listeners.
 * Returns a cleanup function to be called by the router when navigating away.
 */
export function init(params) {
    console.log("Home section successfully initialized.");

    // Use an AbortController for easy event listener cleanup.
    const controller = new AbortController();

    // Get the main container div to scope all DOM queries.
    const homeSection = document.querySelector('.home');
    if (!homeSection) {
        console.error('Home section container (#home) not found!');
        return () => {}; // Return an empty cleanup function if the main element doesn't exist.
    }

    // --- [NEW] INJECT MODERN CSS FOR THE PEOPLE CARD ---
    function injectPeopleCardStyles() {
        if (document.getElementById('homepeople-styles')) return; // Prevent duplicate styles
        const style = document.createElement('style');
        style.id = 'homepeople-styles';
        style.textContent = `
            .homepeople-list{display:flex;flex-direction:column;gap:8px}.homepeople-item{display:flex;align-items:center;padding:8px;border-radius:8px;transition:background-color .2s ease;cursor:pointer}.homepeople-item:hover{background-color:#f4f4f4}.homepeople-avatar{width:36px;height:36px;border-radius:50%;margin-right:12px;display:flex;align-items:center;justify-content:center;font-weight:500;color:#fff;overflow:hidden}.homepeople-avatar img{width:100%;height:100%;object-fit:cover}.homepeople-info{flex-grow:1;display:flex;flex-direction:column}.homepeople-name{font-weight:500;color:#111;font-size:14px}.homepeople-role{font-size:13px;color:#666}.homepeople-action{color:#888;padding:4px;border-radius:50%}.homepeople-action:hover{background-color:#e0e0e0;color:#111}.homepeople-placeholder{text-align:center;padding:24px}.homepeople-placeholder .people-icon{font-size:24px;color:#999;background-color:#f0f0f0;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px auto}.homepeople-placeholder p{font-size:14px;color:#666;margin-bottom:16px}
        `;
        document.head.appendChild(style);
    }

    // --- DATA ---
    // Mock data to simulate a real application.
    let projects = [
        { id: 'proj-1', name: 'Project Alpha', color: '#4c9aff', starred: true },
        { id: 'proj-2', name: 'Project Beta', color: '#4caf50', starred: false },
        { id: 'proj-3', name: 'Project Gamma', color: '#9c27b0', starred: true },
    ];

    let tasks = [
        // Today
        { id: 'task-1', name: 'Draft project brief', sectionId: 'proj-1', startDate: new Date(), endDate: new Date(), color: '#4c9aff', assigneeName: 'Alice', assigneeIconUrl: 'https://i.pravatar.cc/150?img=1', completed: false },
        // Overdue
        { id: 'task-2', name: 'Schedule kickoff meeting', sectionId: 'proj-1', startDate: new Date('2025-06-10T09:00:00'), endDate: new Date('2025-06-12T17:00:00'), color: '#ffc107', assigneeName: 'Bob', assigneeIconUrl: 'https://i.pravatar.cc/150?img=2', completed: false },
        // This Week
        { id: 'task-3', name: 'Present New Feature Concepts', sectionId: 'proj-2', startDate: new Date(new Date().setDate(new Date().getDate() + 2)), endDate: new Date(new Date().setDate(new Date().getDate() + 4)), color: '#9c27b0', assigneeName: 'Charlie', assigneeIconUrl: 'https://i.pravatar.cc/150?img=3', completed: false },
        // Next Week
        { id: 'task-4', name: 'Develop User Authentication', sectionId: 'proj-2', startDate: new Date(new Date().setDate(new Date().getDate() + 7)), endDate: new Date(new Date().setDate(new Date().getDate() + 10)), color: '#4caf50', assigneeName: 'David', assigneeIconUrl: 'https://i.pravatar.cc/150?img=4', completed: false },
        // Completed
        { id: 'task-5', name: 'UI/UX Design Mockups', sectionId: 'proj-3', startDate: new Date('2025-06-02T09:00:00'), endDate: new Date('2025-06-06T18:00:00'), color: '#e91e63', assigneeName: 'Eve', assigneeIconUrl: 'https://i.pravatar.cc/150?img=5', completed: true },
    ];
    
    let people = [
        { id: 'p-1', name: 'Alice Johnson', role: 'Designer', frequent: true, avatarUrl: 'https://i.pravatar.cc/150?img=1' },
        { id: 'p-2', name: 'Bob Williams', role: 'Engineer', frequent: true, avatarUrl: 'https://i.pravatar.cc/150?img=2' },
        { id: 'p-3', name: 'Charlie Brown', role: 'Product Manager', frequent: false, avatarUrl: null }, // No avatar to show fallback
        { id: 'p-4', name: 'Diana Prince', role: 'Marketing', frequent: true, avatarUrl: 'https://i.pravatar.cc/150?img=4' },
    ];

    const getInitials = (name) => {
        const names = name.split(' ');
        if (names.length > 1) {
            return names[0][0] + names[names.length - 1][0];
        }
        return name[0];
    };

    const generateColorForName = (name) => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return `hsl(${h}, 70%, 45%)`;
    };

    // --- RENDER FUNCTIONS ---
    
    function renderProjects(filter = 'all') {
        const projectList = homeSection.querySelector('.projects-card .project-list');
        if (!projectList) return;

        const createBtn = projectList.querySelector('.create-project-btn');
        projectList.innerHTML = ''; // Clear list
        if (createBtn) projectList.appendChild(createBtn); // Re-add button
        
        const projectsToDisplay = projects.filter(p => {
            if (filter === 'starred') return p.starred;
            return true; // for 'all' and 'recent'
        });

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
            projectList.appendChild(item);
        });
        updateTaskCount();
    }

    function renderTasks(filterFunc) {
        const taskList = homeSection.querySelector('.task-list');
        if (!taskList) return;

        const createBtn = taskList.querySelector('.create-task-btn');
        taskList.innerHTML = '';
        if (createBtn) taskList.appendChild(createBtn);

        const tasksToDisplay = tasks.filter(filterFunc).sort((a, b) => a.endDate - b.endDate);

        if (tasksToDisplay.length === 0) {
            taskList.innerHTML += `<p class="empty-state">No tasks here. Enjoy the quiet!</p>`;
        }

        tasksToDisplay.forEach(task => {
            const item = document.createElement('div');
            item.className = 'task-item';
            item.dataset.taskId = task.id;
            item.style.borderLeft = `4px solid ${task.color}`;

            const startDateStr = dayjs(task.startDate).format('MMM D');
            const endDateStr = dayjs(task.endDate).format('MMM D');
            const dateDisplay = startDateStr === endDateStr ? startDateStr : `${startDateStr} - ${endDateStr}`;

            item.innerHTML = `
                <input type="checkbox" class="task-checkbox" data-task-id="${task.id}" ${task.completed ? 'checked' : ''} />
                <div class="task-content">
                    <span class="task-text ${task.completed ? 'completed' : ''}">${task.name}</span>
                    <span class="task-dates">${dateDisplay}</span>
                </div>
                <div class="task-assignee" title="${task.assigneeName}">
                    <img src="${task.assigneeIconUrl}" alt="${task.assigneeName}" />
                </div>`;
            taskList.appendChild(item);
        });
    }
    
     function renderPeople(filter = 'all') {
        const peopleContent = homeSection.querySelector('.people-content');
        if (!peopleContent) return;

        const peopleToDisplay = people.filter(p => filter === 'frequent' ? p.frequent : true);
        peopleContent.innerHTML = ''; // Clear previous content

        if (peopleToDisplay.length > 0) {
            const list = document.createElement('div');
            list.className = 'homepeople-list';
            peopleToDisplay.forEach(person => {
                const item = document.createElement('div');
                item.className = 'homepeople-item';
                
                let avatarHTML;
                if (person.avatarUrl) {
                    avatarHTML = `<div class="homepeople-avatar"><img src="${person.avatarUrl}" alt="${person.name}"></div>`;
                } else {
                    const initials = getInitials(person.name);
                    const bgColor = generateColorForName(person.name);
                    avatarHTML = `<div class="homepeople-avatar" style="background-color: ${bgColor};">${initials}</div>`;
                }

                item.innerHTML = `
                    ${avatarHTML}
                    <div class="homepeople-info">
                        <span class="homepeople-name">${person.name}</span>
                        <span class="homepeople-role">${person.role}</span>
                    </div>
                    <i class="fas fa-ellipsis-h homepeople-action" data-tooltip="More options"></i>
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
            homeSection.querySelector('.invite-btn').addEventListener('click', () => showNotification('Invite feature coming soon!'), { signal: controller.signal });
        }
    }


    // --- UPDATE AND HELPER FUNCTIONS ---

    function updateTaskCount() {
        const completedCount = tasks.filter(t => t.completed).length;
        homeSection.querySelector('.stats-item i.fa-check').nextElementSibling.textContent = `${completedCount} tasks completed`;
        homeSection.querySelector('.stats-item i.fa-users').nextElementSibling.textContent = `${people.length} collaborators`;

        homeSection.querySelectorAll('.project-item').forEach(pItem => {
            const projectId = pItem.dataset.projectId;
            const taskCount = tasks.filter(t => t.sectionId === projectId && !t.completed).length;
            pItem.querySelector('[data-task-count]').textContent = `${taskCount} task${taskCount !== 1 ? 's' : ''}`;
        });
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
    
    function updateDateTime() {
        const now = dayjs();
        const dateElement = homeSection.querySelector('.date');
        const greetingElement = homeSection.querySelector('.greetings');
        if (!dateElement || !greetingElement) return;

        dateElement.textContent = now.format('dddd, MMMM D');
        
        const hour = now.hour();
        let greeting = 'Good evening, Chat';
        if (hour < 12) greeting = 'Good morning, Chat';
        else if (hour < 18) greeting = 'Good afternoon, Chat';
        greetingElement.textContent = greeting;
    }

    // --- EVENT HANDLERS ---
    
    function handleTaskCheck(e) {
        if (!e.target.matches('.task-checkbox')) return;
        const taskId = e.target.dataset.taskId;
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = e.target.checked;
            const textEl = e.target.closest('.task-item').querySelector('.task-text');
            textEl.classList.toggle('completed', task.completed);
            showNotification(`Task "${task.name}" ${task.completed ? 'completed!' : 'is now incomplete.'}`, task.completed ? 'success' : 'info');
            // A short delay before removing from UI for better UX
            setTimeout(() => {
                const activeTabFilter = getActiveTaskFilter();
                renderTasks(activeTabFilter);
                updateTaskCount();
            }, 300);
        }
    }
    
    function handleCreateTask() {
        const name = prompt("Enter new task name:");
        if (!name || !name.trim()) return;
        const newTask = { id: `task-${Date.now()}`, name, sectionId: 'proj-1', startDate: new Date(), endDate: new Date(), color: '#4c9aff', assigneeName: 'You', assigneeIconUrl: 'https://i.pravatar.cc/150?u=current_user', completed: false };
        tasks.unshift(newTask);
        renderTasks(getActiveTaskFilter());
        updateTaskCount();
        showNotification('Task created!', 'success');
    }

    function handleCreateProject() {
        const name = prompt("Enter new project name:");
        if (!name || !name.trim()) return;
        const newProject = { id: `proj-${Date.now()}`, name, color: '#' + Math.floor(Math.random()*16777215).toString(16), starred: false };
        projects.push(newProject);
        renderProjects();
        showNotification('Project created!', 'success');
    }

    function getActiveTaskFilter() {
        const activeTab = homeSection.querySelector('.tab-btn.active').dataset.tab;
        const now = dayjs();
        switch (activeTab) {
            case 'upcoming': return task => !task.completed && dayjs(task.startDate).isAfter(now);
            case 'overdue': return task => !task.completed && dayjs(task.endDate).isBefore(now);
            case 'completed': return task => task.completed;
            default: return () => true;
        }
    }

    // --- INITIALIZATION ---

    function initializeAll() {
        injectPeopleCardStyles();
        
        // Dropdown Logic
        homeSection.querySelectorAll('.dropdown').forEach(dropdown => {
            const trigger = dropdown;
            const menu = dropdown.querySelector('.dropdown-menu-weeks'); // Adjusted for your HTML
            if (!trigger || !menu) return;

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.toggle('show');
            }, { signal: controller.signal });

            menu.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.target.closest('a');
                if (!target) return;
                
                const value = target.dataset.value;
                const dropdownId = dropdown.dataset.dropdownId;

                // Handle logic based on which dropdown was clicked
                if (dropdownId === 'my-week') {
                    const now = dayjs();
                    let filterFunc = () => true;
                    if (value === 'today') {
                        filterFunc = task => !task.completed && dayjs(task.startDate).isSame(now, 'day');
                    } else if (value === 'this-week') {
                        filterFunc = task => !task.completed && dayjs(task.startDate).isSame(now, 'week');
                    } else if (value === 'next-week') {
                        filterFunc = task => !task.completed && dayjs(task.startDate).isSame(now.add(1, 'week'), 'week');
                    }
                    renderTasks(filterFunc);
                } else if (dropdownId === 'project-recents') {
                    renderProjects(value);
                }
                
                menu.classList.remove('show');
            }, { signal: controller.signal });
        });
        
        // General click outside to close dropdowns
        document.addEventListener('click', () => {
             homeSection.querySelectorAll('.dropdown-menu-weeks.show').forEach(menu => menu.classList.remove('show'));
        }, { signal: controller.signal });
        
        // Task Tabs
        homeSection.querySelectorAll('.tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                homeSection.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                e.currentTarget.classList.add('active');
                renderTasks(getActiveTaskFilter());
            }, { signal: controller.signal });
        });

        // Other buttons and listeners
        homeSection.querySelector('.task-list').addEventListener('click', handleTaskCheck, { signal: controller.signal });
        homeSection.querySelector('.create-task-btn').addEventListener('click', handleCreateTask, { signal: controller.signal });
        homeSection.querySelector('.projects-card .create-project-btn').addEventListener('click', handleCreateProject, { signal: controller.signal });
        homeSection.querySelector('.invite-btn').addEventListener('click', () => showNotification('Invite feature coming soon!'), { signal: controller.signal });
        homeSection.querySelector('.customize-btn').addEventListener('click', () => showNotification('Customization feature coming soon!'), { signal: controller.signal });

        // Initial render of all components
        updateDateTime();
        setInterval(updateDateTime, 60000); // Update time every minute
        renderProjects();
        renderTasks(getActiveTaskFilter());
        renderPeople();
    }

    // --- KICK OFF THE INITIALIZATION ---
    initializeAll();

    // The cleanup function is returned to the main router.
    return function cleanup() {
        console.log("Cleaning up home section listeners...");
        // This single line removes ALL event listeners added with this controller's signal.
        controller.abort();
    };
}