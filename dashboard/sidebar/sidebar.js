window.TaskSidebar = (function() {
    // --- 1. DATA & STATE ---
    const projectData = {
        'proj-1': {
            name: 'Website Redesign',
            customColumns: [
                { id: 1, name: 'Costing', type: 'Costing', currency: '$' },
                // NEW: Added more custom column types for demonstration
                { id: 2, name: 'Launch Date', type: 'Date' },
                { id: 3, name: 'Team', type: 'Selector', options: ['Marketing', 'Product', 'Engineering'] }
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
                    customFields: { 1: 1500, 2: '2025-08-20', 3: 'Product' },
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
                    }]
                }]
            }]
        },
        'proj-2': {
            name: 'Mobile App Development',
            customColumns: [],
            sections: [{
                id: 'sec-mob-1',
                title: 'Backend',
                tasks: []
            }]
        },
        'proj-3': {
            name: 'Marketing Campaign',
            customColumns: [],
            sections: [] // This project starts with no sections
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
    let currentProjectId = null; // <-- NEW: To keep track of the current project's ID
    const currentUser = allUsers[0];
    let isInitialized = false;
    let pastedImageURL = null;
    let pastedFiles = [];
    
    // --- DOM element variables ---
    let sidebar, taskNameEl, taskFieldsContainer, closeBtn, taskCompleteBtn, taskCompleteText,
        taskDescriptionEl, tabsContainer, activityLogContainer, commentInput, sendCommentBtn,
        currentUserAvatarEl, imagePreviewContainer, imagePreview, imageTitleInput, cancelImageBtn,
        uploadFileBtn, fileUploadInput, commentInputWrapper;
    
    // --- HELPER FUNCTIONS ---
    function formatTimestamp(date) {
        return new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }
    
    // --- CORE FUNCTIONS ---
    function init() {
        // Cache all DOM elements
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
        uploadFileBtn = document.getElementById('upload-file-btn');
        fileUploadInput = document.getElementById('file-upload-input');
        commentInputWrapper = document.querySelector('.comment-input-wrapper');
        
        taskNameEl.setAttribute('contenteditable', 'true');
        
        attachEventListeners();
        isInitialized = true;
    }
    
    function open(taskId, projectId = 'proj-1') {
        if (!isInitialized) init();
        currentProjectId = projectId; // <-- NEW: Store the project ID
        currentProject = projectData[projectId];
        const task = findTaskById(taskId);
        if (task) {
            currentTask = task;
            if (!task.activity.some(a => a.type === 'system')) {
                task.activity.unshift({
                    id: Date.now() - 100000,
                    type: 'system',
                    user: currentUser.id,
                    timestamp: new Date(task.activity[0]?.timestamp || Date.now()).getTime() - 10000,
                    details: `Task created by <strong>${currentUser.name}</strong> on ${formatTimestamp(new Date())}`
                });
            }
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
        currentProjectId = null; // <-- NEW: Clear the project ID
        clearImagePreview();
    }
    
    function logActivity(type, data) {
        if (!currentTask) return;
        const newActivity = {
            id: Date.now(),
            type,
            user: currentUser.id,
            timestamp: new Date(),
            ...data
        };
        
        if (type === 'comment') {
            newActivity.reactions = { heart: [], thumbsUp: [] };
        } else if (type === 'change') {
            const { field, from, to } = data;
            const fromValue = from || 'none';
            const toValue = to || 'none';
            newActivity.details = `<strong>${currentUser.name}</strong> changed ${field} from <strong>${fromValue}</strong> to <strong>${toValue}</strong>.`;
        }
        
        if (!currentTask.activity) currentTask.activity = [];
        currentTask.activity.push(newActivity);
        renderActivity();
    }
    
    function makeFieldEditable(cell, task, key) {
        const span = cell.querySelector('span');
        if (!span || cell.querySelector('input')) return; // Already editing
        
        // --- MODIFICATION START ---
        // 1. Get the column ID and find the column's configuration.
        const columnId = parseInt(key.split('-')[1], 10);
        const column = currentProject.customColumns.find(c => c.id === columnId);
        
        // 2. Get the RAW value from the data, not the displayed text.
        const rawValue = task.customFields ? (task.customFields[columnId] || '') : '';
        
        const input = document.createElement('input');
        // For 'Costing' fields, explicitly set the input type to 'number' for a better UX.
        input.type = (column && column.type === 'Costing') ? 'number' : 'text';
        input.value = rawValue; // 3. The input now only contains the number (e.g., 1500).
        input.className = 'field-edit-input';
        
        span.replaceWith(input);
        input.focus();
        
        const saveChanges = () => {
            // 4. When saving, get the new value and compare it to the original raw value.
            let newValue = input.value;
            
            // 5. If it's a Costing field, ensure we save it as a number.
            if (column && column.type === 'Costing') {
                newValue = parseFloat(newValue) || 0;
            }
            
            if (newValue !== rawValue) {
                if (!task.customFields) task.customFields = {};
                task.customFields[columnId] = newValue;
                logActivity('change', { field: column.name, from: rawValue, to: newValue });
                renderSidebar(task);
            } else {
                input.replaceWith(span); // Revert if no change was made
            }
        };
        // --- MODIFICATION END ---
        
        input.addEventListener('blur', saveChanges);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') {
                input.value = rawValue;
                input.blur();
            }
        });
    }
    
    function submitComment() {
        const noteText = commentInput.value.trim();
        const files = [...pastedFiles];
        
        // Do nothing if there's no text and no files
        if (!noteText && files.length === 0) {
            return;
        }
        
        // Handle file uploads
        if (files.length > 0) {
            files.forEach(file => {
                (async () => {
                    try {
                        const { dataURL } = await readFileAsDataURL(file);
                        logActivity('comment', {
                            content: "", // Content can be empty if there's an image
                            imageURL: dataURL,
                            imageTitle: noteText
                        });
                    } catch (error) {
                        console.error("Error processing file:", error);
                    }
                })();
            });
            // Handle text-only comments
        } else if (noteText) {
            logActivity('comment', {
                content: noteText
            });
        }
        
        // Clear everything after sending
        clearImagePreview();
        commentInput.value = '';
    }
    
    // --- NEW FUNCTION: Handles the logic of moving a task ---
    function moveTaskToProject(newProjectId) {
        if (!currentTask || !currentProjectId || newProjectId === currentProjectId) {
            return;
        }
        
        const oldProject = projectData[currentProjectId];
        const newProject = projectData[newProjectId];
        
        if (!oldProject || !newProject) {
            console.error("Could not find old or new project.");
            return;
        }
        
        // 1. Find and remove the task from the old project
        let taskRemoved = false;
        for (const section of oldProject.sections) {
            const taskIndex = section.tasks.findIndex(t => t.id === currentTask.id);
            if (taskIndex > -1) {
                section.tasks.splice(taskIndex, 1);
                taskRemoved = true;
                break;
            }
        }
        
        if (!taskRemoved) {
            console.error("Could not find the task in the original project to remove it.");
            return;
        }
        
        // 2. Add the task to the new project
        // If the new project has no sections, create a default one
        if (newProject.sections.length === 0) {
            newProject.sections.push({
                id: `sec-${newProjectId}-default`,
                title: 'General',
                tasks: []
            });
        }
        newProject.sections[0].tasks.push(currentTask);
        
        // 3. Log the activity
        logActivity('change', {
            field: 'Project',
            from: `<strong>${oldProject.name}</strong>`,
            to: `<strong>${newProject.name}</strong>`
        });
        
        close();
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
    
    // --- MODIFIED FUNCTION ---
    function renderTaskFields(task) {
        taskFieldsContainer.innerHTML = '';
        const fieldRenderMap = {
            // NEW entry for project
            project: { label: 'Project', html: currentProject.name, controlType: 'project' },
            assignees: { label: 'Assignee', html: renderAssigneeValue(task.assignees), controlType: 'assignee' },
            dueDate: { label: 'Due date', html: renderDateValue(task.dueDate), controlType: 'date' },
            status: { label: 'Status', html: createTag(task.status, 'status'), controlType: 'dropdown', options: statusOptions },
            priority: { label: 'Priority', html: createTag(task.priority, 'priority'), controlType: 'dropdown', options: priorityOptions },
        };
        
        // NEW field order
        const standardFieldOrder = ['project', 'assignees', 'dueDate', 'status', 'priority'];
        const table = document.createElement('table');
        table.className = 'task-fields-table';
        const tbody = document.createElement('tbody');
        
        standardFieldOrder.forEach(key => {
            // Note: 'project' isn't a property of the task, so we handle it directly
            if (task.hasOwnProperty(key) || key === 'project') {
                const config = fieldRenderMap[key];
                let controlType = config.controlType;
                let options = config.options;
                
                // For the 'project' field, we'll generate options dynamically later
                if (key === 'project') {
                    // We don't need to pass options here, they are generated on click.
                }
                
                appendFieldToTable(tbody, key, config.label, config.html, controlType, options);
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
        row.className = 'sidebarprojectfield-row';
        
        const labelCell = row.insertCell();
        labelCell.className = 'sidebarprojectfield-label';
        labelCell.textContent = label;
        
        const valueCell = row.insertCell();
        
        // Assign specific classes based on key
        if (key === 'project') {
            valueCell.className = 'sidebarprojectfield-value project-field';
        } else if (key === 'assignees') {
            valueCell.className = 'sidebarprojectfield-value assignee-field';
        } else if (key === 'status' || key === 'priority') {
            valueCell.className = 'sidebarprojectfield-value project-field';
        } else {
            valueCell.className = 'sidebarprojectfield-value other-field';
        }
        
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
        } else if (activeTab === 'activity') {
            activitiesToRender = currentTask.activity.filter(a => a.type !== 'comment');
        } else {
            activitiesToRender = [...currentTask.activity];
        }
        
        if (activitiesToRender.length === 0) {
            activityLogContainer.innerHTML = `<div class="placeholder-text">No ${activeTab} to show.</div>`;
            return;
        }
        
        activitiesToRender.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        activitiesToRender.forEach(activity => {
            const user = allUsers.find(u => u.id === activity.user);
            if (!user) return;
            
            const item = document.createElement('div');
            item.className = activity.type === 'comment' ? 'comment-item' : 'log-item';
            if (activity.type !== 'comment') item.classList.add(`log-type-${activity.type}`);
            
            item.dataset.activityId = activity.id;
            let contentHTML = '';
            let actionsHTML = '';
            let headerMeta = `<span class="comment-author">${user.name}</span> <span class="comment-timestamp">${formatTimestamp(activity.timestamp)}</span>`;
            
            // Replace the entire 'if (activity.type === 'comment')' block with this
            if (activity.type === 'comment') {
                // --- 1. Generate Reaction Buttons (for all users) ---
                const reactions = activity.reactions || { heart: [], thumbsUp: [] };
                
                const hasLiked = reactions.heart.includes(currentUser.id);
                const likeCount = reactions.heart.length > 0 ? ` ${reactions.heart.length}` : '';
                const heartBtnHTML = `<button class="react-btn ${hasLiked ? 'reacted' : ''}" data-reaction="heart" title="Like"><i class="fa-solid fa-heart"></i>${likeCount}</button>`;
                
                const hasThumbed = reactions.thumbsUp.includes(currentUser.id);
                const thumbCount = reactions.thumbsUp.length > 0 ? ` ${reactions.thumbsUp.length}` : '';
                const thumbBtnHTML = `<button class="react-btn ${hasThumbed ? 'reacted' : ''}" data-reaction="thumbsUp" title="Thumbs Up"><i class="fa-solid fa-thumbs-up"></i>${thumbCount}</button>`;
                
                // --- 2. Generate Edit/Delete Buttons (for author only) ---
                let authorActionsHTML = '';
                const isAuthor = activity.user === currentUser.id;
                if (isAuthor) {
                    authorActionsHTML = `
                <div class="author-actions">
                    <button class="edit-comment-btn" title="Edit"><i class="fa-solid fa-pencil"></i></button>
                    <button class="delete-comment-btn" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
                }
                
                // --- 3. Combine ALL actions into the main actions container ---
                actionsHTML = `
                <div class="comment-actions">
                    <div class="reaction-actions">${heartBtnHTML}${thumbBtnHTML}</div>
                    ${authorActionsHTML}
                </div>`;
                
                // --- 4. Generate the rest of the comment body (this is the same as before) ---
                const commentTextHTML = activity.content ? `<div class="comment-text">${activity.content}</div>` : '';
                let imageHTML = '';
                if (activity.imageURL) {
                    const noteClass = activity.imageTitle ? ' has-note' : '';
                    const noteHTML = activity.imageTitle ? `<div class="attachment-note">${activity.imageTitle}</div>` : '';
                    imageHTML = `
                <div class="log-attachment${noteClass}">
                    <img class="scalable-image" src="${activity.imageURL}" alt="${activity.imageTitle || 'User attachment'}">
                    ${noteHTML}
                </div>`;
                }
                
                const editText = activity.content || activity.imageTitle || '';
                const editFormHTML = `
                <div class="comment-edit-area">
                    <textarea class="comment-edit-input">${editText}</textarea>
                    <div class="comment-edit-actions">
                        <button class="btn-cancel-edit">Cancel</button>
                        <button class="btn-save-edit">Save</button>
                    </div>
                </div>`;
                
                contentHTML = `${commentTextHTML}${imageHTML}${editFormHTML}`;
                
            } else {
                contentHTML = `<div class="activity-change-log">${activity.details}</div>`;
                headerMeta = '';
            }
            
            item.innerHTML = `
                  <div class="avatar" style="background-image: url(${user.avatar})"></div>
                  <div class="comment-body">
                      <div class="comment-header">
                          <div class="comment-meta">${headerMeta}</div>
                          ${actionsHTML}
                      </div>
                      ${contentHTML}
                  </div>`;
            activityLogContainer.appendChild(item);
        });
    }
    
    function findTaskById(taskId) {
        for (const section of currentProject.sections) {
            const task = section.tasks.find(t => t.id === taskId);
            if (task) return task;
        }
        return null;
    }
    
    function renderDateValue(dateString) {
        if (!dateString) return `No Date`;
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    
    function createTag(text, type) {
        const c = (text || '').toLowerCase().replace(/\s+/g, '-');
        return `<div class="tag ${type}-${c}">${text}</div>`;
    }
    
    function renderAssigneeValue(assignees) {
        // Check if there is an assignee (we only care about the first one)
        if (assignees && assignees.length > 0) {
            const assigneeId = assignees[0];
            const user = allUsers.find(u => u.id === assigneeId);
            
            if (user) {
                // If a user is assigned, display their avatar and name.
                // The entire element becomes a button to change the assignee.
                return `
                <div class="assignee-list-wrapper single-assignee">
                    <div class="avatar" data-user-id="${user.id}" style="background-image: url(${user.avatar})" title="${user.name}"></div>
                    <span class="assignee-name">${user.name}</span>
                </div>`;
            }
        }
        
        // If no one is assigned, display a clear button to add an assignee.
        return `
        <div class="assignee-list-wrapper">
            <button class="assignee-add-btn single-assignee-add">
                <i class="fa-solid fa-plus"></i>
            </button>
            <span>Assign</span>
        </div>`;
    }
    
    function addImagePreview(file, fileDataURL) {
        commentInputWrapper.classList.add('preview-active');
        commentInput.placeholder = 'Add an optional note for the image(s)...';
        const previewItem = document.createElement('div');
        previewItem.className = 'image-preview-item';
        previewItem.dataset.fileId = file.name + file.lastModified;
        const img = document.createElement('img');
        img.src = fileDataURL;
        img.alt = file.name;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-preview-btn';
        removeBtn.title = 'Remove ' + file.name;
        removeBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
        removeBtn.onclick = function() {
            const fileIdToRemove = previewItem.dataset.fileId;
            pastedFiles = pastedFiles.filter(f => (f.name + f.lastModified) !== fileIdToRemove);
            previewItem.remove();
            if (pastedFiles.length === 0) {
                commentInputWrapper.classList.remove('preview-active');
                commentInput.placeholder = 'Add a comment...';
            }
        };
        previewItem.appendChild(img);
        previewItem.appendChild(removeBtn);
        imagePreviewContainer.appendChild(previewItem);
    }
    
    function clearImagePreview() {
        pastedFiles = [];
        if (imagePreviewContainer) {
            imagePreviewContainer.innerHTML = '';
        }
        if (commentInputWrapper) {
            commentInputWrapper.classList.remove('preview-active');
        }
        if (commentInput) {
            commentInput.placeholder = 'Add a comment...';
        }
        if (fileUploadInput) {
            fileUploadInput.value = "";
        }
    }
    
    function removeAssignee(userIdToRemove) {
        if (!currentTask) return;
        const id = parseInt(userIdToRemove, 10);
        const user = allUsers.find(u => u.id === id);
        if (user) {
            currentTask.assignees = currentTask.assignees.filter(assigneeId => assigneeId !== id);
            logActivity('change', {
                field: 'Assignee',
                from: `<strong>${user.name}</strong>`,
                to: 'removed'
            });
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
    
    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            if (file.type === 'image/url') {
                resolve({
                    dataURL: file.name,
                    title: file.name.substring(file.name.lastIndexOf('/') + 1)
                });
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve({ dataURL: reader.result, title: file.name });
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
    }
    
    // --- EVENT HANDLERS & LOGIC ---
    function attachEventListeners() {
        closeBtn.addEventListener('click', close);
        
        taskNameEl.addEventListener('keydown', (e) => {
            // When Enter is pressed, we want to save (by triggering a blur).
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevents adding a new line in the element.
                taskNameEl.blur(); // Triggers the blur event to save the changes.
            }
            // When Escape is pressed, we want to cancel the edit and revert to the original name.
            if (e.key === 'Escape') {
                if (currentTask) taskNameEl.textContent = currentTask.name;
                taskNameEl.blur();
            }
        });
        
        taskNameEl.addEventListener('blur', () => {
            if (!currentTask) return; // Safety check if no task is open.
            
            const newName = taskNameEl.textContent.trim().replace(/\s+/g, ' ');
            const oldName = currentTask.name;
            
            // If the new name is empty, revert to the old name. A task must have a name.
            if (!newName) {
                taskNameEl.textContent = oldName;
                return;
            }
            
            // If the name has changed, update the data and log the activity.
            if (newName !== oldName) {
                currentTask.name = newName;
                logActivity('change', { field: 'Name', from: oldName, to: newName });
            }
        });
        
        activityLogContainer.addEventListener('click', (e) => {
            const target = e.target;
            const commentItem = target.closest('.comment-item');
            if (!commentItem) return;
            const activityId = parseInt(commentItem.dataset.activityId, 10);
            const activityIndex = currentTask.activity.findIndex(a => a.id === activityId);
            if (activityIndex === -1) return;
            const activity = currentTask.activity[activityIndex];
            const reactionBtn = target.closest('.react-btn');
            if (reactionBtn) {
                const reactionType = reactionBtn.dataset.reaction;
                if (!activity.reactions) activity.reactions = { heart: [], thumbsUp: [] };
                if (!activity.reactions[reactionType]) activity.reactions[reactionType] = [];
                const reactionArray = activity.reactions[reactionType];
                const userIndex = reactionArray.indexOf(currentUser.id);
                if (userIndex > -1) {
                    reactionArray.splice(userIndex, 1);
                } else {
                    reactionArray.push(currentUser.id);
                }
                renderActivity();
            }
            if (target.closest('.delete-comment-btn')) {
                if (confirm('Are you sure you want to delete this comment?')) {
                    currentTask.activity.splice(activityIndex, 1);
                    renderActivity();
                }
            }
            if (target.closest('.edit-comment-btn')) {
                commentItem.classList.add('is-editing');
            }
            if (target.closest('.btn-cancel-edit')) {
                commentItem.classList.remove('is-editing');
            }
            if (target.closest('.btn-save-edit')) {
                const editInput = commentItem.querySelector('.comment-edit-input');
                const newText = editInput.value.trim();
                if (activity.hasOwnProperty('content')) activity.content = newText;
                if (activity.hasOwnProperty('imageTitle')) activity.imageTitle = newText;
                commentItem.classList.remove('is-editing');
                renderActivity();
            }
        });
        
        taskCompleteBtn.addEventListener('click', () => {
            if (!currentTask) return;
            const oldStatus = currentTask.status;
            const newStatus = oldStatus === 'Completed' ? 'On track' : 'Completed';
            currentTask.status = newStatus;
            logActivity('change', { field: 'status', from: oldStatus, to: newStatus });
            renderSidebar(currentTask);
        });
        
        taskFieldsContainer.addEventListener('click', (e) => {
            if (currentTask.status === 'Completed') return;
            const controlCell = e.target.closest('.control');
            if (!controlCell) return;
            
            const controlType = controlCell.dataset.control;
            const key = controlCell.dataset.key;
            const oldValue = currentTask[key];
            
            // --- Handle Standard Fields ---
            if (controlType === 'project') { // <-- NEW: Handle project changes
                const projectOptions = Object.keys(projectData).map(projId => ({
                    label: projectData[projId].name,
                    value: projId
                }));
                createGenericDropdown(controlCell, projectOptions, currentProjectId, (newProjectId) => {
                    moveTaskToProject(newProjectId);
                });
                // In attachEventListeners() -> taskFieldsContainer.addEventListener('click', (e) => { ...
                
                // ... (other control types like 'project' and 'dropdown')
                
                /* START MODIFICATION */
            } else if (controlType === 'assignee') {
                // The entire field is now the control. Get the currently assigned user ID.
                const currentAssigneeId = currentTask.assignees?.[0] || null;
                
                // Prepare dropdown options: include all users plus an "Unassigned" option.
                const assigneeOptions = [
                    { label: 'Unassigned', value: null }, // This option will clear the assignee.
                    ...allUsers.map(u => ({ label: u.name, value: u.id, avatar: u.avatar }))
                ];
                
                // Open the dropdown to select or change the assignee.
                createGenericDropdown(controlCell, assigneeOptions, currentAssigneeId, (newUserId) => {
                    const oldUser = allUsers.find(u => u.id === currentAssigneeId);
                    const newUser = allUsers.find(u => u.id === newUserId);
                    
                    const fromValue = oldUser ? `<strong>${oldUser.name}</strong>` : 'none';
                    const toValue = newUser ? `<strong>${newUser.name}</strong>` : 'none';
                    
                    // Do nothing if the value hasn't changed.
                    if (fromValue === toValue) return;
                    
                    // Update the task data: newUserId will be null if "Unassigned" was chosen.
                    currentTask.assignees = newUserId ? [newUserId] : [];
                    
                    // Log the change and re-render the sidebar.
                    logActivity('change', { field: 'Assignee', from: fromValue, to: toValue });
                    renderSidebar(currentTask);
                });
                /* END MODIFICATION */
                
            } else if (controlType === 'dropdown') {
                const options = JSON.parse(controlCell.dataset.options);
                createGenericDropdown(controlCell, options.map(opt => ({ label: opt, value: opt })), oldValue, (newValue) => {
                    if (newValue !== oldValue) {
                        currentTask[key] = newValue;
                        logActivity('change', { field: key, from: oldValue, to: newValue });
                        renderSidebar(currentTask);
                    }
                });
            }
            // MODIFIED: Handle Due Date with a date picker
            else if (controlType === 'date') {
                const isCustom = key.startsWith('custom-');
                const columnId = isCustom ? parseInt(key.split('-')[1], 10) : null;
                const column = isCustom ? currentProject.customColumns.find(c => c.id === columnId) : { name: 'Due Date' };
                
                const oldValue = isCustom ? currentTask.customFields?.[columnId] : currentTask.dueDate;
                
                const fp = flatpickr(e.target, {
                    defaultDate: oldValue || 'today',
                    dateFormat: "Y-m-d",
                    onClose: function(selectedDates) {
                        const newDate = selectedDates[0] ? flatpickr.formatDate(selectedDates[0], 'Y-m-d') : null;
                        
                        if (newDate !== oldValue) {
                            if (isCustom) {
                                if (!currentTask.customFields) currentTask.customFields = {};
                                currentTask.customFields[columnId] = newDate;
                            } else {
                                currentTask.dueDate = newDate;
                            }
                            logActivity('change', { field: column.name, from: renderDateValue(oldValue), to: renderDateValue(newDate) });
                            renderSidebar(currentTask);
                        }
                        // It's crucial to destroy the flatpickr instance after use
                        fp.destroy();
                    }
                });
                fp.open();
            }
            
            // --- Handle Editable Text/Costing Custom Fields ---
            else if (key.startsWith('custom-')) {
                const columnId = parseInt(key.split('-')[1], 10);
                const column = currentProject.customColumns.find(c => c.id === columnId);
                if (!column) return;
                
                if (column.type === 'Text' || column.type === 'Costing') {
                    makeFieldEditable(controlCell, currentTask, key);
                } else if (column.type === 'Selector') {
                    const oldSelectorValue = currentTask.customFields?.[columnId];
                    createGenericDropdown(controlCell, column.options.map(opt => ({ label: opt, value: opt })), oldSelectorValue, (newValue) => {
                        if (newValue !== oldSelectorValue) {
                            if (!currentTask.customFields) currentTask.customFields = {};
                            currentTask.customFields[columnId] = newValue;
                            logActivity('change', { field: column.name, from: oldSelectorValue, to: newValue });
                            renderSidebar(currentTask);
                        }
                    });
                }
            }
        });
        
        sendCommentBtn.addEventListener('click', submitComment);
        
        commentInput.addEventListener('keydown', (e) => {
            // Check if the 'Enter' key was pressed WITHOUT the 'Shift' key
            if (e.key === 'Enter' && !e.shiftKey) {
                // Prevent the default action (which is to add a new line)
                e.preventDefault();
                // Trigger the submit logic
                submitComment();
            }
        });
        
        commentInput.addEventListener('paste', (e) => {
            const items = (e.clipboardData || window.clipboardData).items;
            let hasHandledImage = false;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    hasHandledImage = true;
                    const imageFile = items[i].getAsFile();
                    if (imageFile) {
                        pastedFiles.push(imageFile);
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            addImagePreview(imageFile, event.target.result);
                        };
                        reader.readAsDataURL(imageFile);
                    }
                }
            }
            if (hasHandledImage) {
                e.preventDefault();
                return;
            }
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            if (pastedText.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
                e.preventDefault();
                const mockFile = {
                    name: pastedText.substring(pastedText.lastIndexOf('/') + 1),
                    type: 'image/url',
                    lastModified: Date.now()
                };
                pastedFiles.push(mockFile);
                addImagePreview(mockFile, pastedText);
            }
        });
        
        tabsContainer.addEventListener('click', (e) => {
            if (e.target.matches('.tab-btn')) {
                tabsContainer.querySelector('.active').classList.remove('active');
                e.target.classList.add('active');
                renderActivity();
            }
        });
        
        uploadFileBtn.addEventListener('click', () => fileUploadInput.click());
        
        fileUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) {
                return;
            }
            const isImage = file.type.startsWith('image/') ||
                /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.name);
            if (isImage) {
                pastedFiles.push(file);
                const reader = new FileReader();
                reader.onload = (event) => {
                    addImagePreview(file, event.target.result);
                };
                reader.onerror = (error) => {
                    console.error("Error reading file:", error);
                };
                reader.readAsDataURL(file);
            } else {
                logActivity('system', { details: `<strong>${currentUser.name}</strong> attached file: <strong>${file.name}</strong>` });
            }
        });
        
        document.body.addEventListener('click', (e) => {
            if (e.target.closest('.popover-remove-btn')) {
                removeAssignee(e.target.closest('.popover-remove-btn').dataset.userId);
            } else if (!e.target.closest('.assignee-popover, .avatar[data-user-id], .context-dropdown, .control, .flatpickr-calendar')) {
                closePopovers();
            }
            
            if (sidebar && sidebar.classList.contains('is-visible')) {
                // Define elements that should NOT close the sidebar when clicked.
                // This includes the sidebar itself, any popovers, datepickers, and the task list items that open it.
                const safeElements = '#task-sidebar, .assignee-popover, .context-dropdown, .flatpickr-calendar, .task-name';
                
                // If the click was NOT on any of the safe elements, close the sidebar.
                if (!e.target.closest(safeElements)) {
                    close();
                }
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