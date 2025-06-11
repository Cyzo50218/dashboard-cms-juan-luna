window.TaskSidebar = (function() {
    // --- 1. DATA & STATE ---
    // Mock data now includes an 'activity' log and new custom fields for demonstration.
    const allProjects = [{
        id: 'proj-1',
        name: 'Website Redesign',
        sections: [{
            id: 'sec-1',
            title: 'Design',
            tasks: [{
                id: 101,
                projectId: 'proj-1',
                sectionId: 'sec-1',
                name: 'Create final mockups',
                description: 'Develop final visual mockups for the new homepage.',
                dueDate: '2025-06-12',
                priority: 'High',
                status: 'On track',
                assignees: [1, 2],
                // SCOPE 2: Example of new, optional fields
                'Item Type': 'Design Asset',
                SKU: 'WEB-DSN-003',
                // SCOPE 1: Activity log for the task
                activity: [{
                    type: 'change',
                    user: 2,
                    timestamp: new Date('2025-06-10T10:00:00Z'),
                    details: `set Priority to <strong>High</strong>`
                }, {
                    type: 'comment',
                    user: 1,
                    timestamp: new Date('2025-06-10T10:05:00Z'),
                    content: 'This is a critical path item, let me know if you need any help.'
                }]
            }]
        }, {
            id: 'sec-2',
            title: 'Development',
            tasks: []
        }, ]
    }, {
        id: 'proj-2',
        name: 'Q3 Marketing Campaign',
        sections: [{
            id: 'sec-3',
            title: 'Planning',
            tasks: [{
                id: 301,
                projectId: 'proj-2',
                sectionId: 'sec-3',
                name: 'Draft campaign brief',
                description: 'Outline goals and KPIs.',
                dueDate: '2025-07-05',
                priority: 'Medium',
                status: 'At risk',
                assignees: [4],
                Invoice: 'INV-2025-07B',
                activity: []
            }]
        }, ]
    }];

    const allUsers = [
        { id: 1, name: 'Lorelai Gilmore', avatar: 'https://i.imgur.com/k9qRkiG.png' },
        { id: 2, name: 'Rory Gilmore', avatar: 'https://i.imgur.com/8mR4H4A.png' },
        { id: 3, name: 'Luke Danes', avatar: 'https://i.imgur.com/wfz43s9.png' },
        { id: 4, name: 'Sookie St. James', avatar: 'https://i.imgur.com/E292S4a.png' },
    ];

    const priorityOptions = ['High', 'Medium', 'Low'];
    const statusOptions = ['On track', 'At risk', 'Off track', 'Completed'];

    // --- State variables ---
    let currentTask = null;
    const currentUser = allUsers[0]; // Assume Lorelai is the current user for logging actions
    let isInitialized = false;
    let pastedImageURL = null;
    
    // --- DOM element variables ---
    let sidebar, taskNameEl, taskFieldsContainer, closeBtn, taskCompleteBtn, taskCompleteText,
        taskDescriptionEl, tabsContainer, activityLogContainer, commentInput, sendCommentBtn,
        currentUserAvatarEl, imagePreviewContainer, imagePreview, imageTitleInput, cancelImageBtn;

    function init() {
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
        imagePreview = document.getElementById('pasted-image-preview');
        imageTitleInput = document.getElementById('pasted-image-title');
        cancelImageBtn = document.getElementById('cancel-image-btn');

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
        } else {
            console.error(`Task with ID ${taskId} not found.`);
        }
    }

    function close() {
    sidebar.classList.remove('is-visible');
    currentTask = null;
}

    /** Helper function to log an activity and re-render the view. */
   function logActivity(type, details) {
    if (!currentTask) return;
    const newActivity = {
        id: Date.now(), // SCOPE 3: Add unique ID for editing/deleting
        type,
        user: currentUser.id,
        timestamp: new Date(),
        ...details
    };
    currentTask.activity.unshift(newActivity);
    renderActivity();
}

    function renderSidebar(task) {
        if (!task) return;

        taskNameEl.textContent = task.name;
        taskDescriptionEl.textContent = task.description;
        currentUserAvatarEl.style.backgroundImage = `url(${currentUser.avatar})`;

        // Update complete button
        const isCompleted = task.status === 'Completed';
        taskCompleteBtn.classList.toggle('completed', isCompleted);
        taskCompleteText.textContent = isCompleted ? 'Completed' : 'Mark complete';

        renderTaskFields(task);
        renderActivity();
    }

    /**
     * [SCOPE 2 REFINED] Renders fields dynamically.
     * It checks for specific, known fields for custom rendering (like 'assignees')
     * and then loops over any other properties in the task object to display them.
     */
    function renderTaskFields(task) {
    if (!taskFieldsContainer) return;
    taskFieldsContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    const fieldRenderMap = {
        assignees: { label: 'Assignee', html: renderAssigneeValue(task.assignees), control: null, class: 'assignee-value-wrapper' },
        dueDate: { label: 'Due date', html: task.dueDate || `No due date`, control: 'date' },
        projectId: { label: 'Project', html: allProjects.find(p => p.id === task.projectId)?.name, control: 'project' },
        priority: { label: 'Priority', html: createTag(task.priority, 'priority'), control: 'priority' },
        status: { label: 'Status', html: createTag(task.status, 'status'), control: 'status' },
        'Shop Type': { label: 'Shop Type', html: createTag(task['Shop Type'], 'shop-type'), control: 'shopType' }
    };
    
    const fieldOrder = ['assignees', 'dueDate', 'projectId', 'priority', 'status', 'Shop Type'];
    
    fieldOrder.forEach(key => {
        if (task.hasOwnProperty(key)) {
            appendField(fragment, fieldRenderMap[key].label, fieldRenderMap[key].html, fieldRenderMap[key].control, fieldRenderMap[key].class);
        }
    });
    
    const standardKeys = new Set(['id', 'name', 'description', 'activity', 'sectionId', ...fieldOrder]);
    for (const key in task) {
        if (task.hasOwnProperty(key) && !standardKeys.has(key) && task[key]) {
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            appendField(fragment, label, task[key]);
        }
    }
    taskFieldsContainer.appendChild(fragment);
}

    function appendField(fragment, label, valueHTML, controlName = null, valueContainerClass = '') {
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
    }

    /**
     * [SCOPE 1 REFINED] Renders the content of the activity log based on the active tab.
     */
     function renderActivity() {
     if (!activityLogContainer || !currentTask) return;
     activityLogContainer.innerHTML = '';
     const fragment = document.createDocumentFragment();
     const activeTab = tabsContainer.querySelector('.tab-btn.active').dataset.tab;
     
     const activitiesToRender = (activeTab === 'comments') ?
         currentTask.activity.filter(a => a.type === 'comment') :
         currentTask.activity;
     
     if (activitiesToRender.length === 0) { /* ... */ }
     
     activitiesToRender.forEach(activity => {
         const user = allUsers.find(u => u.id === activity.user);
         if (!user) return;
         
         const item = document.createElement('div');
         item.className = 'activity-item';
         item.dataset.activityId = activity.id;
         
         let bodyHTML = '';
         let actionsHTML = '';
         
         if (activity.type === 'comment') {
             // SCOPE 3: Add edit/delete buttons for current user's comments
             if (activity.user === currentUser.id) {
                 actionsHTML = `
                        <div class="comment-actions">
                            <button class="edit-comment-btn" title="Edit"><i class="fa-solid fa-pencil"></i></button>
                            <button class="delete-comment-btn" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
                        </div>`;
             }
             
             let imageHTML = '';
             if (activity.imageURL) {
                 imageHTML = `
                        <div class="comment-image-container">
                            ${activity.imageTitle ? `<div class="title">${activity.imageTitle}</div>` : ''}
                            <img src="${activity.imageURL}" alt="${activity.imageTitle || 'User attached image'}">
                        </div>`;
             }
             
             bodyHTML = `<div class="activity-body">
                                <div class="comment-text-content">${activity.content || ''}</div>
                                ${imageHTML}
                            </div>`;
             
         } else if (activity.type === 'change') {
             bodyHTML = `<div class="activity-change-log">${activity.details}</div>`;
         }
         
         item.innerHTML = `
                <div class="avatar" style="background-image: url(${user.avatar})"></div>
                <div class="activity-content">
                    <div class="activity-header">
                        ${user.name}
                        <span class="timestamp">${new Date(activity.timestamp).toLocaleString()}</span>
                        ${actionsHTML}
                    </div>
                    ${bodyHTML}
                </div>`;
         fragment.appendChild(item);
     });
     activityLogContainer.appendChild(fragment);
 }
 
 // --- Image Preview Functions (SCOPE 1) ---
 function showImagePreview(url) {
     pastedImageURL = url;
     imagePreview.src = url;
     imagePreviewContainer.style.display = 'block';
     commentInput.placeholder = 'Image selected. Add an optional comment...';
 }
 
 function clearImagePreview() {
     pastedImageURL = null;
     imagePreview.src = '';
     imageTitleInput.value = '';
     imagePreviewContainer.style.display = 'none';
     commentInput.placeholder = 'Add a comment or paste an image link...';
 }
  
     
    function createTag(text, type) {
        const statusClass = (text || '').toLowerCase().replace(/\s+/g, '-');
        return `<div class="tag ${type}-${statusClass}">${text}</div>`;
    }

    function renderAssigneeValue(assignees) {
        const avatarsHTML = assignees.map(userId => {
            const user = allUsers.find(u => u.id === userId);
            return user ? `<div class="avatar" data-user-id="${user.id}" style="background-image: url(${user.avatar})" title="${user.name}"></div>` : '';
        }).join('');
        const addButtonHTML = `<button class="assignee-add-btn" title="Add assignee"><i class="fa-solid fa-plus"></i></button>`;
        return `<div class="assignee-list-wrapper">${avatarsHTML}${addButtonHTML}</div>`;
    }

    function removeAssignee(userIdToRemove) {
        if (!currentTask) return;
        const id = parseInt(userIdToRemove, 10);
        const user = allUsers.find(u => u.id === id);
        const oldAssignees = [...currentTask.assignees];

        currentTask.assignees = currentTask.assignees.filter(assigneeId => assigneeId !== id);
        
        if(user) {
            logActivity('change', { details: `removed <strong>${user.name}</strong> from assignees` });
        }
        
        renderSidebar(currentTask);
        closePopovers();
    }

    function closePopovers() {
        document.querySelectorAll('.assignee-popover, .context-dropdown').forEach(p => p.remove());
    }

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
            
            let itemHTML = '';
            if (option.avatar) {
                itemHTML += `<div class="avatar" style="background-image: url(${option.avatar})"></div>`;
            }
            itemHTML += `<span>${option.label}</span><i class="fa-solid fa-check"></i>`;
            item.innerHTML = itemHTML;
            
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

   function handleActivityLogClicks(e) {
    const activityItem = e.target.closest('.activity-item');
    if (!activityItem) return;
    const activityId = parseInt(activityItem.dataset.activityId, 10);
    
    // Handle Delete
    if (e.target.closest('.delete-comment-btn')) {
        if (window.confirm('Are you sure you want to delete this comment?')) {
            const activityIndex = currentTask.activity.findIndex(a => a.id === activityId);
            if (activityIndex > -1) {
                currentTask.activity.splice(activityIndex, 1);
                renderActivity();
            }
        }
        return;
    }
    
    // Handle Edit
    if (e.target.closest('.edit-comment-btn')) {
        const activity = currentTask.activity.find(a => a.id === activityId);
        const activityBody = activityItem.querySelector('.activity-body');
        
        if (activityBody.querySelector('.edit-controls')) return;
        
        const originalHTML = activityBody.innerHTML;
        const editHTML = `
                <textarea class="edit-textarea" style="width: 100%; min-height: 60px;">${activity.content || ''}</textarea>
                ${activity.imageURL ? `<input type="text" class="edit-image-title" value="${activity.imageTitle || ''}" placeholder="Image Title">` : ''}
                <div class="edit-controls">
                    <button class="save-btn">Save</button>
                    <button class="cancel-btn">Cancel</button>
                </div>`;
        activityBody.innerHTML = editHTML;
        
        activityBody.querySelector('.save-btn').addEventListener('click', () => {
            activity.content = activityBody.querySelector('.edit-textarea').value.trim();
            if (activity.imageURL) {
                activity.imageTitle = activityBody.querySelector('.edit-image-title').value.trim();
            }
            renderActivity();
        });
        
        activityBody.querySelector('.cancel-btn').addEventListener('click', () => {
            activityBody.innerHTML = originalHTML;
        });
    }
}

/** Attaches all initial event listeners to the DOM elements. */
function attachEventListeners() {
    closeBtn.addEventListener('click', close);
    
    sendCommentBtn.addEventListener('click', () => {
        const commentText = commentInput.value.trim();
        const imageTitle = imageTitleInput.value.trim();
        if (pastedImageURL) {
            logActivity('comment', { content: commentText, imageURL: pastedImageURL, imageTitle: imageTitle });
            clearImagePreview();
            commentInput.value = '';
        } else if (commentText) {
            logActivity('comment', { content: commentText });
            commentInput.value = '';
        }
    });
    
    commentInput.addEventListener('paste', (e) => {
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        if (pastedText.match(/\.(jpeg|jpg|gif|png)$/i)) { // Case-insensitive
            e.preventDefault();
            showImagePreview(pastedText);
        }
    });
    
    commentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCommentBtn.click();
        }
    });
    
    cancelImageBtn.addEventListener('click', clearImagePreview);
    activityLogContainer.addEventListener('click', handleActivityLogClicks);
    
    tabsContainer.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.tab-btn');
        if (tabButton) {
            tabsContainer.querySelector('.active').classList.remove('active');
            tabButton.classList.add('active');
            renderActivity();
        }
    });
    
    taskCompleteBtn.addEventListener('click', () => {
        if (!currentTask) return;
        const isCompleted = currentTask.status === 'Completed';
        const oldStatus = currentTask.status;
        const newStatus = isCompleted ? 'On track' : 'Completed';
        if (oldStatus !== newStatus) {
            currentTask.status = newStatus;
            logActivity('change', { details: `marked this task as <strong>${newStatus}</strong>` });
            renderSidebar(currentTask);
        }
    });
    
    taskFieldsContainer.addEventListener('click', (e) => {
        if (!currentTask) return;
        
        const control = e.target.closest('.control');
        if (!control) return;
        
        const fieldName = control.dataset.control;
        const oldValue = currentTask[fieldName] || currentTask['Shop Type'];
        
        switch (fieldName) {
            case 'priority':
                createGenericDropdown(control, priorityOptions.map(p => ({ label: p, value: p })), oldValue, (val) => {
                    if (val !== oldValue) {
                        currentTask.priority = val;
                        logActivity('change', { details: `changed Priority from <strong>${oldValue}</strong> to <strong>${val}</strong>` });
                        renderSidebar(currentTask);
                    }
                });
                break;
            case 'status':
                createGenericDropdown(control, statusOptions.map(s => ({ label: s, value: s })), oldValue, (val) => {
                    if (val !== oldValue) {
                        currentTask.status = val;
                        logActivity('change', { details: `changed Status from <strong>${oldValue}</strong> to <strong>${val}</strong>` });
                        renderSidebar(currentTask);
                    }
                });
                break;
            case 'shopType':
                createGenericDropdown(control, shopTypeOptions.map(o => ({ label: o, value: o })), oldValue, (val) => {
                    if (val !== oldValue) {
                        currentTask['Shop Type'] = val;
                        logActivity('change', { details: `changed Shop Type from <strong>${oldValue}</strong> to <strong>${val}</strong>` });
                        renderSidebar(currentTask);
                    }
                });
                break;
        }
    });
        
         
        // Global listener to close popovers and handle popover button clicks
        document.body.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.popover-remove-btn');
            if (removeBtn) {
                removeAssignee(removeBtn.dataset.userId);
                return;
            }
            if (!e.target.closest('.assignee-popover, .avatar[data-user-id], .context-dropdown, [data-control], .assignee-add-btn')) {
                closePopovers();
            }
        }, true);
    }

    // Publicly exposed methods
    return {
        init: init,
        open: open,
        close: close
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    if (window.TaskSidebar) {
        window.TaskSidebar.init();
    }
});




