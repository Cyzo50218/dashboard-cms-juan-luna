window.TaskSidebar = (function () {
    // --- 1. DATA & STATE ---
    const projectData = {
        'proj-1': {
            name: 'Website Redesign',
            customColumns: [
                { id: 1, name: 'Budget', type: 'Costing', currency: '$' }
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
                    }]
                }]
            }]
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

        attachEventListeners();
        isInitialized = true;
    }

    function open(taskId, projectId = 'proj-1') {
        if (!isInitialized) init();
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

            // --- Replace the existing block in your renderActivity function with this one ---

            if (activity.type === 'comment') {
                // --- START: MODIFIED CODE ---

                let imageHTML = '';
                if (activity.imageURL) {
                    // Check if there is a note to add the 'has-note' class for dynamic sizing
                    const noteClass = (activity.imageTitle || activity.content) ? ' has-note' : '';
                    const noteHTML = activity.imageTitle ? `<div class="attachment-note">${activity.imageTitle}</div>` : '';

                    // Add class="scalable-image" to the <img> tag
                    imageHTML = `
            <div class="log-attachment${noteClass}">
                <img class="scalable-image" src="${activity.imageURL}" alt="${activity.imageTitle || 'User attachment'}">
                ${noteHTML}
            </div>`;
                }

                // Check if the main comment text exists
                const commentTextHTML = activity.content ? `<div class="comment-text">${activity.content}</div>` : '';

                // Combine comment text and image HTML
                contentHTML = `${commentTextHTML}${imageHTML}`;

                // --- END: MODIFIED CODE ---


                const reactions = activity.reactions || { heart: [], thumbsUp: [] };
                const hasLiked = reactions.heart.includes(currentUser.id);
                const likeCount = reactions.heart.length > 0 ? ` ${reactions.heart.length}` : '';
                const heartBtnHTML = `<button class="heart-react-btn ${hasLiked ? 'reacted' : ''}" title="Like"><i class="fa-solid fa-heart"></i>${likeCount}</button>`;

                const hasThumbed = reactions.thumbsUp.includes(currentUser.id);
                const thumbCount = reactions.thumbsUp.length > 0 ? ` ${reactions.thumbsUp.length}` : '';
                const thumbBtnHTML = `<button class="thumb-react-btn ${hasThumbed ? 'reacted' : ''}" title="Thumbs Up"><i class="fa-solid fa-thumbs-up"></i>${thumbCount}</button>`;
                actionsHTML = `<div class="comment-actions">${heartBtnHTML}${thumbBtnHTML}</div>`;

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
        const avatarsHTML = assignees.map(userId => allUsers.find(u => u.id === userId))
            .filter(Boolean)
            .map(user => `<div class="avatar" data-user-id="${user.id}" style="background-image: url(${user.avatar})" title="${user.name}"></div>`)
            .join('');
        return `<div class="assignee-list-wrapper">${avatarsHTML}<button class="assignee-add-btn" title="Add assignee"><i class="fa-solid fa-plus"></i></button></div>`;
    }

    // This is an example of what your new function would look like
    function addImagePreview(file, fileDataURL) {
        // Make the main container visible (your old code did this)
        commentInputWrapper.classList.add('preview-active');
        commentInput.placeholder = 'Add an optional note for the image(s)...';

        // 1. Create the wrapper for the new thumbnail
        const previewItem = document.createElement('div');
        previewItem.className = 'image-preview-item';
        // Store a unique identifier on the element itself
        previewItem.dataset.fileId = file.name + file.lastModified;

        // 2. Create the image tag
        const img = document.createElement('img');
        img.src = fileDataURL;
        img.alt = file.name;

        // 3. Create the remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-preview-btn';
        removeBtn.title = 'Remove ' + file.name;
        removeBtn.innerHTML = '<i class="fa-solid fa-times"></i>';

        // 4. Add the logic for the remove button
        removeBtn.onclick = function () {
            // Find the file to remove in your array
            const fileIdToRemove = previewItem.dataset.fileId;
            pastedFiles = pastedFiles.filter(f => (f.name + f.lastModified) !== fileIdToRemove);

            // Remove the thumbnail from the DOM
            previewItem.remove();

            // Optional: if no previews are left, hide the container
            if (pastedFiles.length === 0) {
                commentInputWrapper.classList.remove('preview-active');
                commentInput.placeholder = 'Add a comment...';
            }
        };

        // 5. Assemble and append the new thumbnail
        previewItem.appendChild(img);
        previewItem.appendChild(removeBtn);
        imagePreviewContainer.appendChild(previewItem);
    }

    function clearImagePreview() {
        pastedImageURL = null;
        imageTitleInput.value = '';
        imagePreviewContainer.style.display = 'none';
        commentInputWrapper.classList.remove('preview-active');
        commentInput.placeholder = 'Add a comment, paste an image, or upload a file...';
        fileUploadInput.value = "";
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

    // --- EVENT HANDLERS & LOGIC ---
    function attachEventListeners() {
        closeBtn.addEventListener('click', close);

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

            if (controlType === 'assignee') {
                const addBtn = e.target.closest('.assignee-add-btn');
                const avatar = e.target.closest('.avatar[data-user-id]');
                if (addBtn) {
                    const unassigned = allUsers.filter(u => !currentTask.assignees.includes(u.id));
                    createGenericDropdown(addBtn, unassigned.map(u => ({ label: u.name, value: u.id, avatar: u.avatar })), null, (userId) => {
                        const user = allUsers.find(u => u.id === userId);
                        if (user) {
                            currentTask.assignees.push(userId);
                            logActivity('change', { field: 'Assignee', from: 'none', to: `<strong>${user.name}</strong>` });
                            renderSidebar(currentTask);
                        }
                    });
                } else if (avatar) {
                    createAssigneePopover(avatar, avatar.dataset.userId);
                }
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
        });

        sendCommentBtn.addEventListener('click', () => {
            const commentText = commentInput.value.trim();
            if (pastedImageURL || commentText) {
                let logDetails = { content: commentText };
                if (pastedImageURL) {
                    logDetails.imageURL = pastedImageURL;
                    logDetails.imageTitle = imageTitle;
                    logDetails.details = `<strong>${currentUser.name}</strong> added a comment and attached an image.`;
                } else {
                    logDetails.details = `<strong>${currentUser.name}</strong> added a comment.`;
                }

                logActivity('comment', logDetails);

                clearImagePreview();
                commentInput.value = '';
            }
        });

        commentInput.addEventListener('paste', (e) => {
            const items = (e.clipboardData || window.clipboardData).items;
            let hasHandledImage = false;

            // Loop through all pasted items to find and handle all images
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    hasHandledImage = true;
                    const imageFile = items[i].getAsFile();

                    if (imageFile) {
                        // Add the file to our array
                        pastedFiles.push(imageFile);

                        const reader = new FileReader();

                        // --- CHANGE IS HERE ---
                        // Call addImagePreview for each pasted image file
                        reader.onload = (event) => {
                            addImagePreview(imageFile, event.target.result);
                        };
                        reader.readAsDataURL(imageFile);
                    }
                }
            }

            // If we handled an image, prevent the text from being pasted
            if (hasHandledImage) {
                e.preventDefault();
                return;
            }

            // Fallback for pasting a URL that ends in an image extension
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            if (pastedText.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
                e.preventDefault();

                // Create a mock file object since we only have a URL
                const mockFile = {
                    name: pastedText.substring(pastedText.lastIndexOf('/') + 1),
                    type: 'image/url', // Indicate this was from a URL paste
                    lastModified: Date.now() // Add timestamp for unique ID
                };
                pastedFiles.push(mockFile); // Add mock file to array

                // Call addImagePreview with the mock file and the URL
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
                return; // No file was selected
            }

            // Robustly check if the selected file is an image
            const isImage = file.type.startsWith('image/') ||
                /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.name);

            if (isImage) {
                // Add the file to our array of files to be uploaded
                pastedFiles.push(file);

                const reader = new FileReader();

                // --- CHANGE IS HERE ---
                // Call addImagePreview with both the file object and the data URL result
                reader.onload = (event) => {
                    addImagePreview(file, event.target.result);
                };

                reader.onerror = (error) => {
                    console.error("Error reading file:", error);
                };

                reader.readAsDataURL(file);

            } else {
                // If not an image, handle as a generic file attachment
                logActivity('system', { details: `<strong>${currentUser.name}</strong> attached file: <strong>${file.name}</strong>` });
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




