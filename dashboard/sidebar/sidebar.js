// Creates a single, safe object on the window to interact with the sidebar.
window.TaskSidebar = (function() {
    // --- 1. DATA & STATE ---
    const allProjects = [
        { id: 'proj-1', name: 'Website Redesign', sections: [
            { id: 'sec-1', title: 'Design', tasks: [
                { id: 101, projectId: 'proj-1', sectionId: 'sec-1', name: 'Create final mockups', description: 'Develop final visual mockups.', dueDate: '2025-06-12', priority: 'High', status: 'On track', assignees: [1, 2] },
            ]},
            { id: 'sec-2', title: 'Development', tasks: [] },
        ]},
        { id: 'proj-2', name: 'Q3 Marketing Campaign', sections: [
            { id: 'sec-3', title: 'Planning', tasks: [
                 { id: 301, projectId: 'proj-2', sectionId: 'sec-3', name: 'Draft campaign brief', description: 'Outline goals and KPIs.', dueDate: '2025-07-05', priority: 'High', status: 'On track', assignees: [4] },
            ]},
        ]}
    ];

    const allUsers = [
        { id: 1, name: 'Lorelai Gilmore', avatar: 'https://i.imgur.com/k9qRkiG.png' },
        { id: 2, name: 'Rory Gilmore', avatar: 'https://i.imgur.com/8mR4H4A.png' },
        { id: 3, name: 'Luke Danes', avatar: 'https://i.imgur.com/wfz43s9.png' },
        { id: 4, name: 'Sookie St. James', avatar: 'https://i.imgur.com/E292S4a.png' },
        { id: 5, name: 'Kirk Gleason', avatar: 'https://i.imgur.com/t2n8dCv.png' },
    ];
    
    const priorityOptions = ['High', 'Medium', 'Low'];
    const statusOptions = ['On track', 'At risk', 'Off track', 'Completed'];

    // --- State variables ---
    let currentTask = null;
    let isInitialized = false;

    // --- DOM element variables ---
    let sidebar, taskNameEl, taskFieldsContainer, closeBtn;

    function init() {
        sidebar = document.getElementById('task-sidebar');
        taskNameEl = document.getElementById('task-name');
        taskFieldsContainer = document.getElementById('task-fields-container');
        closeBtn = document.getElementById('close-sidebar-btn');
        
        attachEventListeners();
        isInitialized = true;
    }

    function open(taskId) {
        if (!isInitialized) init();
        let foundTask = null;
        allProjects.forEach(proj => {
            proj.sections.forEach(sec => {
                const task = sec.tasks.find(t => t.id === taskId);
                if (task) foundTask = task;
            });
        });

        if (foundTask) {
            currentTask = foundTask;
            renderSidebar(currentTask);
            sidebar.classList.add('is-visible');
        }
    }

    function close() {
        sidebar.classList.remove('is-visible');
        currentTask = null;
    }

    function renderSidebar(task) {
        if (!task) return;
        taskNameEl.textContent = task.name;
        renderTaskFields(task);
    }
    
    /**
     * [SCOPE 1 REFINED] Renders fields in a two-column grid layout using divs.
     * This provides a modern, clean "fields" section appearance.
     */
    function renderTaskFields(task) {
        if (!taskFieldsContainer) return;
        taskFieldsContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();

        const appendField = (label, valueHTML, controlName = null, valueContainerClass = '') => {
            const labelDiv = document.createElement('div');
            labelDiv.className = 'field-label';
            labelDiv.textContent = label;

            const valueDiv = document.createElement('div');
            valueDiv.className = `field-value ${valueContainerClass}`;
            if (controlName) {
                valueDiv.classList.add('control');
                valueDiv.dataset.control = controlName;
            }
            valueDiv.innerHTML = valueHTML;

            fragment.appendChild(labelDiv);
            fragment.appendChild(valueDiv);
        };
        
        const currentProject = allProjects.find(p => p.id === task.projectId);

        // Append all fields
        appendField('Assignee', renderAssigneeValue(task.assignees), null, 'assignee-value-wrapper');
        appendField('Due date', task.dueDate || `<span class="placeholder-text">No due date</span>`, 'date');
        appendField('Project', currentProject.name, 'project');
        appendField('Priority', createTag(task.priority, 'priority'), 'priority');
        appendField('Status', createTag(task.status, 'status'), 'status');
        
        taskFieldsContainer.appendChild(fragment);
    }

    /**
     * [SCOPE 2 REFINED] Renders only avatars and an "add" button for a clean look.
     * Click handlers will manage popovers for removal.
     */
    function renderAssigneeValue(assignees) {
        const avatarsHTML = assignees.map(userId => {
            const user = allUsers.find(u => u.id === userId);
            return user ? `<div class="avatar" data-user-id="${user.id}" style="background-image: url(${user.avatar})" title="${user.name}"></div>` : '';
        }).join('');

        const addButtonHTML = `<button class="assignee-add-btn" title="Add assignee"><i class="fa-solid fa-plus"></i></button>`;
        
        return `<div class="assignee-list-wrapper">${avatarsHTML}${addButtonHTML}</div>`;
    }

    function createTag(text, type) {
        const statusClass = (text || '').toLowerCase().replace(/\s+/g, '-');
        return `<div class="tag ${type}-${statusClass}">${text}</div>`;
    }

    function removeAssignee(userIdToRemove) {
        if (!currentTask) return;
        const id = parseInt(userIdToRemove, 10);
        currentTask.assignees = currentTask.assignees.filter(assigneeId => assigneeId !== id);
        renderSidebar(currentTask);
        closePopovers(); // Close the popover after removal
    }

    function closePopovers() {
        document.querySelectorAll('.assignee-popover, .context-dropdown').forEach(p => p.remove());
    }

    /**
     * [SCOPE 2 REFINED] Creates a small popover for a clicked assignee avatar.
     * This popover contains the user's name and a remove button.
     */
    function createAssigneePopover(avatarElement, userId) {
        closePopovers(); // Close any other open popovers/dropdowns

        const user = allUsers.find(u => u.id === parseInt(userId, 10));
        if (!user) return;

        const popover = document.createElement('div');
        popover.className = 'assignee-popover';
        popover.innerHTML = `
            <div class="popover-header">
                <div class="avatar" style="background-image: url(${user.avatar})"></div>
                <span class="popover-username">${user.name}</span>
            </div>
            <div class="popover-body">
                <button class="popover-remove-btn" data-user-id="${user.id}">
                    <i class="fa-solid fa-user-minus"></i> Remove from task
                </button>
            </div>
        `;

        document.body.appendChild(popover);
        
        const rect = avatarElement.getBoundingClientRect();
        popover.style.top = `${rect.bottom + 8}px`;
        popover.style.left = `${rect.left + rect.width / 2 - popover.offsetWidth / 2}px`;
    }

    function createGenericDropdown(targetEl, options, currentValue, onSelect) {
        closePopovers();

        const dropdown = document.createElement('div');
        dropdown.className = 'context-dropdown';
        document.body.appendChild(dropdown);

        options.forEach(option => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            if (option.value === currentValue) item.classList.add('is-selected');
            
            // Support for avatars in dropdown items
            if (option.avatar) {
                 item.innerHTML = `<div class="avatar" style="background-image: url(${option.avatar})"></div>`;
            }
            item.innerHTML += `<span>${option.label}</span><i class="fa-solid fa-check"></i>`;
            
            item.addEventListener('click', () => {
                onSelect(option.value);
                closePopovers();
            });
            dropdown.appendChild(item);
        });
        
        const rect = targetEl.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 8}px`;
        dropdown.style.left = `${rect.left}px`;
    }

    function attachEventListeners() {
        closeBtn.addEventListener('click', close);
        
        taskFieldsContainer.addEventListener('click', (e) => {
            if (!currentTask) return;
            
            const addAssigneeBtn = e.target.closest('.assignee-add-btn');
            const avatar = e.target.closest('.avatar[data-user-id]');
            const control = e.target.closest('.control');
            
            if (addAssigneeBtn) {
                // Show dropdown to add unassigned users
                const unassignedUsers = allUsers.filter(u => !currentTask.assignees.includes(u.id));
                const assigneeOptions = unassignedUsers.map(u => ({ label: u.name, value: u.id, avatar: u.avatar }));
                createGenericDropdown(addAssigneeBtn, assigneeOptions, null, (userId) => {
                    currentTask.assignees.push(userId);
                    renderSidebar(currentTask);
                });
                return;
            }

            if (avatar) {
                // Show popover to remove the selected user
                createAssigneePopover(avatar, avatar.dataset.userId);
                return;
            }

            if (control) {
                switch (control.dataset.control) {
                    case 'project':
                        const projectOptions = allProjects.map(p => ({ label: p.name, value: p.id }));
                        createGenericDropdown(control, projectOptions, currentTask.projectId, (newProjectId) => {
                            // In a real app, this would be a more complex operation
                            currentTask.projectId = newProjectId;
                            renderSidebar(currentTask);
                        });
                        break;
                    case 'priority':
                        const priorityOpts = priorityOptions.map(p => ({ label: p, value: p }));
                        createGenericDropdown(control, priorityOpts, currentTask.priority, (val) => {
                            currentTask.priority = val;
                            renderSidebar(currentTask);
                        });
                        break;
                    case 'status':
                        const statusOpts = statusOptions.map(s => ({ label: s, value: s }));
                        createGenericDropdown(control, statusOpts, currentTask.status, (val) => {
                            currentTask.status = val;
                            renderSidebar(currentTask);
                        });
                        break;
                }
            }
        });
        
        // Global listener to close popovers and handle remove clicks
        document.body.addEventListener('click', (e) => {
            // Handle remove button click inside a popover
            const removeBtn = e.target.closest('.popover-remove-btn');
            if (removeBtn) {
                removeAssignee(removeBtn.dataset.userId);
                return;
            }
            // Close popovers if clicking outside of them or their triggers
            if (!e.target.closest('.assignee-popover') && !e.target.closest('.avatar[data-user-id]') 
                && !e.target.closest('.context-dropdown') && !e.target.closest('[data-control]')) {
                closePopovers();
            }
        }, true); // Use capture phase to handle clicks reliably
    }

    return {
        init: init,
        open: open
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    if (window.TaskSidebar) {
        window.TaskSidebar.init();
    }
});