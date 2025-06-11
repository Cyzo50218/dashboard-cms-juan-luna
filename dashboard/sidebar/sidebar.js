window.TaskSidebar = (function() {
    // --- 1. DATA & STATE ---
    const projectData = {
        'proj-1': {
            name: 'Website Redesign',
            customColumns: [
                { id: 1, name: 'Budget', type: 'Costing', currency: '$' },
                { id: 2, name: 'Region', type: 'Text' }
            ],
            sections: [{
                id: 'sec-1',
                title: 'Design',
                tasks: [{
                    id: 101,
                    name: 'Create final mockups',
                    description: 'Develop final visual mockups for the new homepage.',
                    dueDate: '2025-06-12',
                    priority: 'High',
                    status: 'On track',
                    assignees: [1, 2],
                    activity: [{
                        id: 1718135000000,
                        type: 'comment',
                        user: 2,
                        timestamp: new Date('2025-06-09T14:00:00Z'),
                        content: 'This looks great!',
                        reactions: { heart: [1], thumbsUp: [] }
                    }, {
                        id: 1718136360000,
                        type: 'comment',
                        user: 1,
                        timestamp: new Date('2025-06-10T10:05:00Z'),
                        content: 'Attaching the wireframe.',
                        imageURL: 'https://i.imgur.com/v139Yw1.png',
                        imageTitle: 'Homepage Wireframe v1',
                        reactions: { heart: [], thumbsUp: [2] }
                    }, {
                        id: 1718139000000,
                        type: 'change',
                        user: 1,
                        timestamp: new Date('2025-06-10T11:00:00Z'),
                        details: `edited a comment.`
                    }]
                }, {
                    id: 102,
                    name: 'Review branding guidelines',
                    dueDate: '2025-06-15',
                    priority: 'Medium',
                    status: 'On track',
                    assignees: [3],
                    activity: [],
                    customFields: { 1: 850, 2: 'Europe' }
                }, ]
            }, ]
        }
    };

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
    let currentProject = null;
    const currentUser = allUsers[0];
    let isInitialized = false;
    let pastedImageURL = null;

    // --- DOM element variables ---
    let sidebar, taskNameEl, taskFieldsContainer, closeBtn, taskCompleteBtn, taskCompleteText,
        taskDescriptionEl, tabsContainer, activityLogContainer, commentInput, sendCommentBtn,
        currentUserAvatarEl, imagePreviewContainer, imagePreview, imageTitleInput, cancelImageBtn,
        uploadFileBtn, fileUploadInput;

    // --- CORE FUNCTIONS ---
    function init() {
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
        imagePreviewContainer = document.querySelector('.add-comment #pasted-image-preview-container');
        imagePreview = document.getElementById('pasted-image-preview');
        imageTitleInput = document.getElementById('pasted-image-title');
        cancelImageBtn = document.getElementById('cancel-image-btn');
        uploadFileBtn = document.getElementById('upload-file-btn');
        fileUploadInput = document.getElementById('file-upload-input');
        attachEventListeners();
        isInitialized = true;
    }

    function open(taskId, projectId = 'proj-1') {
        if (!isInitialized) init();
        currentProject = projectData[projectId];
        const task = findTaskById(taskId);
        if (task) {
            currentTask = task;
            renderSidebar(currentTask);
            sidebar.classList.add('is-visible');
        } else {
            console.error(`Task with ID ${taskId} not found in project ${projectId}.`);
        }
    }

    function close() {
        sidebar.classList.remove('is-visible');
        currentTask = null;
        currentProject = null;
    }

    function logActivity(type, details) {
        if (!currentTask) return;
        const newActivity = { id: Date.now(), type, user: currentUser.id, timestamp: new Date(), ...details };
        if (type === 'comment') {
            newActivity.reactions = { heart: [], thumbsUp: [] };
        }
        if(!currentTask.activity) currentTask.activity = [];
        currentTask.activity.push(newActivity);
        renderActivity();
    }

    // --- RENDERING FUNCTIONS ---
    function renderSidebar(task) {
        if (!task) return;
        taskNameEl.textContent = task.name;
        taskDescriptionEl.textContent = task.description || '';
        currentUserAvatarEl.style.backgroundImage = `url(${currentUser.avatar})`;
        const isCompleted = task.status === 'Completed';
        sidebar.classList.toggle('task-is-completed', isCompleted);
        taskCompleteBtn.classList.toggle('completed', isCompleted);
        taskCompleteText.textContent = isCompleted ? 'Completed' : 'Mark complete';
        renderTaskFields(task);
        renderActivity();
    }

    function renderTaskFields(task) {
        taskFieldsContainer.innerHTML = '';
        const fieldRenderMap = {
            assignees: { label: 'Assignee', html: renderAssigneeValue(task.assignees), controlType: 'assignee' },
            dueDate: { label: 'Due date', html: renderDateValue(task.dueDate), controlType: 'date' },
            status: { label: 'Status', html: createTag(task.status, 'status'), controlType: 'dropdown', options: statusOptions },
            priority: { label: 'Priority', html: createTag(task.priority, 'priority'), controlType: 'dropdown', options: priorityOptions },
        };
        const standardFieldOrder = ['assignees', 'dueDate', 'status', 'priority'];
        const table = document.createElement('table');
        table.className = 'task-fields-table';
        const tbody = document.createElement('tbody');

        standardFieldOrder.forEach(key => {
            if (task.hasOwnProperty(key)) {
                const config = fieldRenderMap[key];
                appendFieldToTable(tbody, key, config.label, config.html, config.controlType, config.options);
            }
        });
        
        currentProject.customColumns.forEach(column => {
            const value = task.customFields ? task.customFields[column.id] : null;
            let displayValue = value === null || value === undefined ? 'N/A' : value;
            if (column.type === 'Costing' && value) {
                displayValue = `${column.currency || '$'}${value}`;
            }
            appendFieldToTable(tbody, `custom-${column.id}`, column.name, displayValue, column.type.toLowerCase());
        });

        table.appendChild(tbody);
        taskFieldsContainer.appendChild(table);
    }
    
    function appendFieldToTable(tbody, key, label, valueHTML, controlType, options = []) {
        const row = tbody.insertRow();
        row.className = 'field-row';
        const labelCell = row.insertCell();
        labelCell.className = 'field-label';
        labelCell.textContent = label;
        const valueCell = row.insertCell();
        valueCell.className = 'field-value';
        valueCell.innerHTML = `<span>${valueHTML}</span>`;
        if (controlType) {
            valueCell.classList.add('control');
            valueCell.dataset.control = controlType;
            valueCell.dataset.key = key;
            if (options.length > 0) {
                valueCell.dataset.options = JSON.stringify(options);
            }
        }
    }

    function renderActivity() {
        if (!activityLogContainer) return;
        activityLogContainer.innerHTML = '';
        if (!currentTask || !currentTask.activity) return;
        
        const activeTab = tabsContainer.querySelector('.tab-btn.active').dataset.tab;
        let activitiesToRender;
        if (activeTab === 'comments') {
            activitiesToRender = currentTask.activity.filter(a => a.type === 'comment');
        } else {
            activitiesToRender = currentTask.activity.filter(a => a.type !== 'comment');
        }

        if (activitiesToRender.length === 0) {
            activityLogContainer.innerHTML = `<div class="placeholder-text" style="text-align:center; padding: 20px;">No ${activeTab} to show.</div>`;
            return;
        }

        activitiesToRender.forEach(activity => {
            const user = allUsers.find(u => u.id === activity.user);
            if (!user) return;
            const item = document.createElement('div');
            item.className = activity.type === 'comment' ? 'comment-item' : 'log-item';
            item.dataset.activityId = activity.id;
            let contentHTML = '';
            let actionsHTML = '';

            if (activity.type === 'comment') {
                const reactions = activity.reactions || { heart: [], thumbsUp: [] };
                const hasLiked = reactions.heart.includes(currentUser.id);
                const likeCount = reactions.heart.length > 0 ? ` ${reactions.heart.length}` : '';
                const heartBtnHTML = `<button class="heart-react-btn ${hasLiked ? 'reacted' : ''}" title="Like"><i class="fa-solid fa-heart"></i>${likeCount}</button>`;
                
                const hasThumbed = reactions.thumbsUp.includes(currentUser.id);
                const thumbCount = reactions.thumbsUp.length > 0 ? ` ${reactions.thumbsUp.length}` : '';
                const thumbBtnHTML = `<button class="thumb-react-btn ${hasThumbed ? 'reacted' : ''}" title="Thumbs Up"><i class="fa-solid fa-thumbs-up"></i>${thumbCount}</button>`;

                actionsHTML = `<div class="comment-actions">${heartBtnHTML}${thumbBtnHTML}`;
                if (activity.user === currentUser.id) {
                    actionsHTML += `<button class="edit-comment-btn" title="Edit"><i class="fa-solid fa-pencil"></i></button>
                                    <button class="delete-comment-btn" title="Delete"><i class="fa-solid fa-trash-can"></i></button>`;
                }
                actionsHTML += `</div>`;
                
                const noteClass = activity.imageTitle ? 'has-note' : '';
                const imageHTML = activity.imageURL ? `<div class="log-attachment ${noteClass}"><img src="${activity.imageURL}" class="scalable-image image-preview" alt="${activity.imageTitle || ''}"><div class="attachment-note">${activity.imageTitle || ''}</div></div>` : '';
                contentHTML = `<div class="comment-text">${activity.content || ''}</div>${imageHTML}`;
            } else {
                contentHTML = `<div class="activity-change-log">${activity.details}</div>`;
            }

            item.innerHTML = `
                <div class="avatar" style="background-image: url(${user.avatar})"></div>
                <div class="comment-body">
                    <div class="comment-header">
                        <div class="comment-meta">
                            <span class="comment-author">${user.name}</span>
                            <span class="comment-timestamp">${new Date(activity.timestamp).toLocaleString()}</span>
                        </div>
                        ${actionsHTML}
                    </div>
                    ${contentHTML}
                </div>`;
            activityLogContainer.appendChild(item);
        });
    }

    // --- HELPER & UI FUNCTIONS ---
    function findTaskById(taskId) {
        for (const section of currentProject.sections) {
            const task = section.tasks.find(t => t.id === taskId);
            if (task) return task;
        }
        return null;
    }

    function renderDateValue(dateString) {
        if (!dateString) return `No Date`;
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
    }

    function createTag(text, type) {
        const c = (text || '').toLowerCase().replace(/\s+/g, '-');
        return `<div class="tag ${type}-${c}">${text}</div>`;
    }

    function renderAssigneeValue(assignees) {
        const avatarsHTML = assignees.map(userId => allUsers.find(u => u.id === userId))
            .filter(Boolean)
            .map(user => `<div class="avatar" data-user-id="${user.id}" style="background-image: url(${user.avatar})" title="${user.name}"></div>`)
            .join('');
        return `<div class="assignee-list-wrapper">${avatarsHTML}<button class="assignee-add-btn" title="Add assignee"><i class="fa-solid fa-plus"></i></button></div>`;
    }

    function showImagePreview(url) {
        pastedImageURL = url;
        imagePreview.src = url;
        imagePreviewContainer.style.display = 'block';
        commentInput.placeholder = 'Add an optional note for the image...';
    }

    function clearImagePreview() {
        pastedImageURL = null;
        imageTitleInput.value = '';
        imagePreviewContainer.style.display = 'none';
        commentInput.placeholder = 'Add a comment or paste an image link...';
    }

    function removeAssignee(userIdToRemove) {
        if (!currentTask) return;
        const id = parseInt(userIdToRemove, 10);
        const user = allUsers.find(u => u.id === id);
        currentTask.assignees = currentTask.assignees.filter(assigneeId => assigneeId !== id);
        if (user) {
            logActivity('change', { details: `removed <strong>${user.name}</strong> from assignees` });
        }
        renderSidebar(currentTask);
        closePopovers();
    }

    function closePopovers() {
        document.querySelectorAll('.assignee-popover, .context-dropdown').forEach(p => p.remove());
    }

    function createAssigneePopover(avatarElement, userId) {
        closePopovers();
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
                <button class="popover-remove-btn" data-user-id="${user.id}"><i class="fa-solid fa-user-minus"></i> Remove from task</button>
            </div>`;
        document.body.appendChild(popover);
        const rect = avatarElement.getBoundingClientRect();
        popover.style.top = `${rect.bottom + 8}px`;
        popover.style.left = `${rect.left + rect.width / 2 - popover.offsetWidth / 2}px`;
    }

    function createGenericDropdown(targetEl, options, currentValue, onSelect) {
        closePopovers();
        const dropdown = document.createElement('div');
        dropdown.className = 'context-dropdown';
        options.forEach(option => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            if (option.value === currentValue) item.classList.add('is-selected');
            if (option.avatar) {
                item.innerHTML = `<div class="avatar" style="background-image: url(${option.avatar})"></div>`;
            }
            item.innerHTML += `<span>${option.label}</span>`;
            item.addEventListener('click', () => {
                onSelect(option.value);
                closePopovers();
            });
            dropdown.appendChild(item);
        });
        document.body.appendChild(dropdown);
        const rect = targetEl.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 8}px`;
        dropdown.style.left = `${rect.left}px`;
    }

    // --- EVENT HANDLERS ---
    function handleActivityLogClicks(e) {
        const itemElement = e.target.closest('.comment-item, .log-item');
        if (!itemElement) return;
        const activityId = parseInt(itemElement.dataset.activityId, 10);
        const activity = currentTask.activity.find(a => a.id === activityId);
        if (!activity) return;

        const toggleReaction = (reactionType) => {
            if (!activity.reactions) activity.reactions = { heart: [], thumbsUp: [] };
            const reactionArray = activity.reactions[reactionType];
            const reactionIndex = reactionArray.indexOf(currentUser.id);
            if (reactionIndex > -1) {
                reactionArray.splice(reactionIndex, 1);
            } else {
                reactionArray.push(currentUser.id);
            }
            renderActivity();
        };

        if (e.target.closest('.heart-react-btn')) {
            toggleReaction('heart');
        } else if (e.target.closest('.thumb-react-btn')) {
            toggleReaction('thumbsUp');
        } else if (e.target.closest('.delete-comment-btn')) {
            if (window.confirm('Are you sure you want to delete this comment?')) {
                logActivity('change', { details: `deleted a comment.` });
                currentTask.activity = currentTask.activity.filter(a => a.id !== activityId);
                renderActivity();
            }
        } else if (e.target.closest('.edit-comment-btn')) {
            const bodyDiv = itemElement.querySelector('.comment-body');
            if (bodyDiv.querySelector('.comment-edit-area')) return;
            const contentDiv = itemElement.querySelector('.comment-text');
            const originalContent = activity.content || '';
            const originalImageTitle = activity.imageTitle || '';
            let editUI = `<textarea class="comment-edit-input" placeholder="Add a comment...">${originalContent}</textarea>`;
            if (activity.imageURL) {
                editUI += `<div class="log-attachment" style="margin-top:8px;"><img src="${activity.imageURL}" class="scalable-image image-preview"></div>
                           <textarea class="image-note-input" placeholder="Add or edit the image note...">${originalImageTitle}</textarea>`;
            }
            contentDiv.innerHTML = `<div class="comment-edit-area">${editUI}<div class="comment-edit-actions"><button class="btn-cancel-edit">Cancel</button><button class="btn-save-edit">Save</button></div></div>`;
            bodyDiv.querySelector('.btn-save-edit').onclick = () => {
                activity.content = bodyDiv.querySelector('.comment-edit-input').value.trim();
                if (activity.imageURL) {
                    activity.imageTitle = bodyDiv.querySelector('.image-note-input').value.trim();
                }
                logActivity('change', { details: `edited a comment.` });
                renderActivity();
            };
            bodyDiv.querySelector('.btn-cancel-edit').onclick = () => renderActivity();
        }
    }

    function attachEventListeners() {
        closeBtn.addEventListener('click', close);
        activityLogContainer.addEventListener('click', handleActivityLogClicks);
        cancelImageBtn.addEventListener('click', clearImagePreview);

        taskFieldsContainer.addEventListener('click', (e) => {
            if (currentTask.status === 'Completed') return;
            const controlCell = e.target.closest('.control');
            if (!controlCell || controlCell.querySelector('.inline-edit-input')) return;

            const controlType = controlCell.dataset.control;
            const key = controlCell.dataset.key;
            
            const specialControls = ['assignee', 'date', 'dropdown'];
            if (specialControls.includes(controlType)) {
                 const oldValue = currentTask[key];
                 switch (controlType) {
                    case 'assignee':
                         const addBtn = e.target.closest('.assignee-add-btn');
                         const avatar = e.target.closest('.avatar[data-user-id]');
                         if (addBtn) {
                            const unassigned = allUsers.filter(u => !currentTask.assignees.includes(u.id));
                            createGenericDropdown(addBtn, unassigned.map(u => ({label: u.name, value: u.id, avatar: u.avatar})), null, (userId) => {
                               const user = allUsers.find(u => u.id === userId);
                               if(user) {
                                   currentTask.assignees.push(userId);
                                   logActivity('change', { details: `added <strong>${user.name}</strong> as an assignee` });
                                   renderSidebar(currentTask);
                               }
                            });
                         } else if (avatar) {
                            createAssigneePopover(avatar, avatar.dataset.userId);
                         }
                         break;
                    case 'date':
                        flatpickr(controlCell, {
                            defaultDate: oldValue,
                            onChange: (selectedDates, dateStr) => {
                                if (dateStr !== oldValue) {
                                    currentTask[key] = dateStr;
                                    logActivity('change', { details: `set ${key.replace(/([A-Z])/g, ' $1')} to <strong>${renderDateValue(dateStr)}</strong>` });
                                    renderSidebar(currentTask);
                                }
                            }
                        }).open();
                        break;
                    case 'dropdown':
                        const options = JSON.parse(controlCell.dataset.options);
                        createGenericDropdown(controlCell, options.map(opt => ({ label: opt, value: opt })), oldValue, (val) => {
                            if (val !== oldValue) {
                                currentTask[key] = val;
                                logActivity('change', { details: `changed ${key} from <strong>${oldValue}</strong> to <strong>${val}</strong>` });
                                renderSidebar(currentTask);
                            }
                        });
                        break;
                 }
                 return;
            }

            // Default to in-place editing for text and costing
            const originalSpan = controlCell.querySelector('span');
            if(!originalSpan) return;
            const originalText = originalSpan.textContent;
            
            const input = document.createElement('input');
            input.className = 'inline-edit-input';
            
            if (controlType === 'costing') {
                input.type = 'number';
                input.value = parseFloat(originalText.replace(/[^0-9.-]+/g, "")) || 0;
            } else {
                input.type = 'text';
                input.value = originalText === 'N/A' ? '' : originalText;
            }

            controlCell.innerHTML = '';
            controlCell.appendChild(input);
            input.select();

            const saveChanges = () => {
                const newValue = input.value.trim();
                let isCustom = key.startsWith('custom-');
                let dataKey = isCustom ? parseInt(key.split('-')[1]) : key;
                let originalValueForCheck = (controlType === 'costing') ? (parseFloat(originalText.replace(/[^0-9.-]+/g, "")) || 0).toString() : originalText;
                 
                // Only save and log if there is a change
                if (newValue !== originalValueForCheck && !(originalValueForCheck === 'N/A' && newValue === '')) {
                    if (isCustom) {
                        if (!currentTask.customFields) currentTask.customFields = {};
                        currentTask.customFields[dataKey] = controlType === 'costing' ? parseFloat(newValue) : newValue;
                    } else {
                        currentTask[key] = newValue;
                    }
                    const fieldLabel = controlCell.previousElementSibling.textContent;
                    logActivity('change', { details: `updated ${fieldLabel} to <strong>${newValue}</strong>` });
                }
                renderTaskFields(currentTask);
            };
            
            input.addEventListener('blur', saveChanges);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') input.blur();
                if (e.key === 'Escape') renderTaskFields(currentTask);
            });
        });

        sendCommentBtn.addEventListener('click', () => {
            const commentText = commentInput.value.trim();
            const imageTitle = imageTitleInput.value.trim();
            if (pastedImageURL || commentText) {
                logActivity('comment', { content: commentText, imageURL: pastedImageURL, imageTitle: imageTitle });
                clearImagePreview();
                commentInput.value = '';
                setTimeout(() => activityLogContainer.scrollTop = activityLogContainer.scrollHeight, 0);
            }
        });

        commentInput.addEventListener('paste', (e) => {
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            if (pastedText.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
                e.preventDefault();
                showImagePreview(pastedText);
            }
        });

        tabsContainer.addEventListener('click', (e) => {
            if (e.target.matches('.tab-btn')) {
                tabsContainer.querySelector('.active').classList.remove('active');
                e.target.classList.add('active');
                renderActivity();
            }
        });
        
        taskCompleteBtn.addEventListener('click', () => {
             if (!currentTask) return;
             const newStatus = currentTask.status === 'Completed' ? 'On track' : 'Completed';
             logActivity('change', { details: `marked this task as <strong>${newStatus}</strong>` });
             currentTask.status = newStatus;
             renderSidebar(currentTask);
        });

        uploadFileBtn.addEventListener('click', () => {
            fileUploadInput.click();
        });

        fileUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                logActivity('change', { details: `attached file: <strong>${file.name}</strong>` });
            }
        });

        document.body.addEventListener('click', (e) => {
            if (e.target.closest('.popover-remove-btn')) {
                removeAssignee(e.target.closest('.popover-remove-btn').dataset.userId);
            } else if (!e.target.closest('.assignee-popover, .avatar[data-user-id], .context-dropdown, .control, .flatpickr-calendar')) {
                closePopovers();
            }
        }, true);
    }

    // --- PUBLIC INTERFACE ---
    return {
        init,
        open
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    if (window.TaskSidebar) {
        window.TaskSidebar.init();
    }
});




