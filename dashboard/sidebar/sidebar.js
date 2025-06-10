// Creates a single, safe object on the window to interact with the sidebar.
window.TaskSidebar = (function() {
    // --- 1. DATA & STATE ---
    const allUsers = [
        { id: 1, name: 'Lorelai Gilmore', avatar: 'https://i.imgur.com/k9qRkiG.png' },
        { id: 2, name: 'Rory Gilmore', avatar: 'https://i.imgur.com/8mR4H4A.png' },
        { id: 3, name: 'Luke Danes', avatar: 'https://i.imgur.com/wfz43s9.png' },
        { id: 4, name: 'Sookie St. James', avatar: 'https://i.imgur.com/E292S4a.png' },
        { id: 5, name: 'Kirk Gleason', avatar: 'https://i.imgur.com/t2n8dCv.png' },
    ];

    let project = {
        customColumns: [
            { id: 1, name: 'Budget', type: 'Costing', currency: '$', aggregation: 'Sum' },
        ],
        sections: [
            { id: 1, title: 'Design', tasks: [
                { id: 101, sectionId: 1, name: 'Create final mockups', description: 'Develop the final visual mockups based on the approved wireframes.', dueDate: '2025-06-12', priority: 'High', status: 'On track', assignees: [1, 2], customFields: { 1: 1500 } },
                { id: 102, sectionId: 1, name: 'Review branding guidelines', description: 'Ensure all design elements align with the company\'s branding.', dueDate: '2025-06-15', priority: 'Medium', status: 'On track', assignees: [3], customFields: { 1: 850 } },
            ], isCollapsed: false },
            { id: 2, title: 'Development', tasks: [
                { id: 201, sectionId: 2, name: 'Initial setup', description: 'Set up the development environment and project repositories.', dueDate: '2025-06-18', priority: 'Low', status: 'At risk', assignees: [], customFields: { 1: 3000 } },
            ], isCollapsed: false },
            { id: 3, title: 'Completed', tasks: [
                { id: 301, sectionId: 3, name: 'Kick-off meeting', description: 'Initial meeting with all stakeholders to define project scope.', dueDate: '2025-05-30', priority: 'Medium', status: 'Completed', assignees: [4, 5], customFields: { 1: 500 } },
            ], isCollapsed: false },
        ],
    };

    const priorityOptions = ['High', 'Medium', 'Low'];
    const statusOptions = ['On track', 'At risk', 'Off track', 'Completed'];
    
    // --- State variables ---
    let currentTask = null;
    let currentUser = allUsers.find(u => u.id === 1);
    let activeTab = 'comments';
    let pastedImageUrl = null;
    let isInitialized = false;

    // --- 2. DOM ELEMENT VARIABLES ---
    let sidebar, openSidebarBtn, taskCompleteBtn, taskNameEl, taskDescriptionTextEl, 
        currentUserAvatarEl, activityLogEl, commentTabsContainer, uploadFileBtn, 
        fileUploadInput, commentInput, sendCommentBtn, imagePreviewContainer,
        taskFieldsContainer, toggleFullViewBtn;

    function init() {
        sidebar = document.getElementById('task-sidebar');
        openSidebarBtn = document.getElementById('open-sidebar-btn');
        taskCompleteBtn = document.getElementById('task-complete-btn');
        taskNameEl = document.getElementById('task-name');
        taskDescriptionTextEl = document.getElementById('task-description-text');
        currentUserAvatarEl = document.getElementById('current-user-avatar');
        activityLogEl = document.getElementById('activity-log');
        commentTabsContainer = document.getElementById('comment-tabs-container');
        uploadFileBtn = document.getElementById('upload-file-btn');
        fileUploadInput = document.getElementById('file-upload-input');
        commentInput = document.getElementById('comment-input');
        sendCommentBtn = document.getElementById('send-comment-btn');
        imagePreviewContainer = document.getElementById('pasted-image-preview-container');
        toggleFullViewBtn = document.getElementById('toggle-full-view-btn');
        taskFieldsContainer = document.getElementById('task-fields-container');

        attachEventListeners();
        if (currentUser) { currentUserAvatarEl.style.backgroundImage = `url(${currentUser.avatar})`; }
        isInitialized = true;
        console.log("TaskSidebar Initialized.");
    }

    function open(taskId) {
        if (!isInitialized) init();
        let foundTask = null;
        for (const section of project.sections) {
            const task = section.tasks.find(t => t.id === taskId);
            if (task) {
                foundTask = task;
                foundTask.comments = foundTask.comments || [];
                foundTask.activity = foundTask.activity || [];
                break;
            }
        }
        if (foundTask) {
            currentTask = foundTask;
            renderSidebar(currentTask);
            sidebar.classList.add('is-visible');
        } else {
            console.error("Sidebar Error: Task with ID not found:", taskId);
        }
    }
    
    function renderSidebar(task) {
        if (!task) return;
        updateCompletionUI(task.status === 'Completed');
        taskNameEl.textContent = task.name;
        taskDescriptionTextEl.textContent = task.description;
        renderTaskFields(task);
        if (activeTab === 'comments') {
            renderComments(task.comments);
        } else {
            renderActivityLog(task.activity);
        }
    }

    /**
     * MODIFIED: This function now creates a "flat" structure of label and value divs,
     * which allows CSS Grid to create the two-column layout.
     */
    function renderTaskFields(task) {
        if (!taskFieldsContainer) return;
        taskFieldsContainer.innerHTML = '';    
        const fragment = document.createDocumentFragment();

        // Helper to create and append a label/value pair to the fragment
        const appendField = (label, valueHTML, controlName = null) => {
            const labelDiv = document.createElement('div');
            labelDiv.className = 'field-label';
            labelDiv.textContent = label;

            const valueDiv = document.createElement('div');
            valueDiv.className = 'field-value';
            if (controlName) {
                valueDiv.classList.add('control');
                valueDiv.dataset.control = controlName;
            }
            valueDiv.innerHTML = valueHTML;

            fragment.appendChild(labelDiv);
            fragment.appendChild(valueDiv);
        };

        // Render all fields
        appendField('Assignee', renderAssigneeValue(task), 'assignee');
        appendField('Due date', renderDueDateValue(), 'date');
        
        const currentSection = project.sections.find(s => s.id === task.sectionId);
        appendField('Section', `${currentSection ? currentSection.title : 'No Section'}`, 'section');
        
        appendField('Priority', createTag(task.priority, 'priority'), 'priority');
        appendField('Status', createTag(task.status, 'status'), 'status');

        project.customColumns.forEach(column => {
            const value = task.customFields[column.id];
            appendField(column.name, formatCustomFieldValue(value, column));
        });

        taskFieldsContainer.appendChild(fragment);
        initFlatpickr(task.dueDate);
    }

    function renderAssigneeValue(task) {
        if (!task.assignees || task.assignees.length === 0) {
            return `<i class="fa-regular fa-user"></i> <span class="placeholder-text">No assignee</span>`;
        }
        return task.assignees.map(userId => {
            const user = allUsers.find(u => u.id === userId);
            return user ? `<div class="avatar" style="background-image: url(${user.avatar})" title="${user.name}"></div>` : '';
        }).join('');
    }

    function renderDueDateValue() {
        return `<div class="flatpickr-wrapper" id="task-due-date-wrapper">
                    <input type="text" placeholder="No due date" data-input>
                    <a class="input-button" title="Toggle" data-toggle><i class="fa-regular fa-calendar"></i></a>
                </div>`;
    }

    function formatCustomFieldValue(value, column) {
        if (value === undefined || value === null) {
            return `<span class="placeholder-text">Not set</span>`;
        }
        if (column.type === 'Costing') {
            return `${column.currency || '$'}${value.toLocaleString()}`;
        }
        return value;
    }
    
    function createTag(text, type) {
        return `<div class="tag ${type}-${(text || '').toLowerCase().replace(/\s+/g, '-')}">${text}</div>`;
    }

    function initFlatpickr(currentDate) {
        const flatpickrWrapper = document.getElementById('task-due-date-wrapper');
        if (!flatpickrWrapper || flatpickrWrapper.classList.contains('flatpickr-input')) return;
        flatpickr(flatpickrWrapper, {
            wrap: true,
            dateFormat: "Y-m-d",
            defaultDate: currentDate,
            onChange: function(selectedDates, dateStr) {
                if (currentTask) currentTask.dueDate = dateStr;
            },
        });
    }

    function setTaskCompletion(isComplete) {
        if (!currentTask) return;
        const isCurrentlyCompleted = currentTask.status === 'Completed';
        if (isComplete === isCurrentlyCompleted) return;
        const completedSection = project.sections.find(s => s.title === 'Completed');
        if (isComplete) {
            currentTask.originalStatus = currentTask.status;
            currentTask.originalSectionId = currentTask.sectionId;
            currentTask.status = 'Completed';
            if (completedSection) currentTask.sectionId = completedSection.id;
        } else {
            currentTask.status = currentTask.originalStatus || 'On track';
            currentTask.sectionId = currentTask.originalSectionId || project.sections[0].id;
        }
        renderSidebar(currentTask);
    }
    
    function updateCompletionUI(isCompleted) {
        if (!sidebar || !taskCompleteBtn) return;
        sidebar.classList.toggle('task-is-completed', isCompleted);
        taskCompleteBtn.classList.toggle('completed', isCompleted);
        taskCompleteBtn.querySelector('#task-complete-text').textContent = isCompleted ? 'Completed' : 'Mark complete';
    }

    function handleSendComment() {
        if (!currentTask) return;
        if (pastedImageUrl) {
            const newAttachment = { id: `entry_${Date.now()}`, userId: currentUser.id, type: 'attachment', timestamp: new Date().toISOString(), file: { name: "Pasted Image", size: 0, type: 'image/png', url: pastedImageUrl, isImage: true } };
            currentTask.comments.push(newAttachment);
            currentTask.activity.push({ id: `activity_${newAttachment.id}`, userId: currentUser.id, type: 'file_upload', text: `attached a pasted image.`, timestamp: new Date().toISOString(), file: newAttachment.file });
            clearImagePreview();
        } else {
            const text = commentInput.value.trim();
            if (text === '') return;
            const newEntry = { id: `entry_${Date.now()}`, userId: currentUser.id, type: 'comment', text: text, timestamp: new Date().toISOString() };
            currentTask.comments.push(newEntry);
            currentTask.activity.push({ ...newEntry, text: `commented: "${text}"`});
            commentInput.value = '';
        }
        renderSidebar(currentTask);
    }
    
    function handleFileUpload(event) {
        if (!currentTask) return;
        const file = event.target.files[0];
        if (!file) return;
        const fileUrl = URL.createObjectURL(file);
        const isImage = file.type.startsWith('image/');
        const newAttachment = { id: `entry_${Date.now()}`, userId: currentUser.id, type: 'attachment', timestamp: new Date().toISOString(), file: { name: file.name, size: file.size, type: file.type, url: fileUrl, isImage: isImage } };
        const newActivity = { id: `activity_${newAttachment.id}`, userId: currentUser.id, type: 'file_upload', text: `uploaded a file: ${file.name}`, timestamp: new Date().toISOString(), file: newAttachment.file };
        currentTask.comments.push(newAttachment);
        currentTask.activity.push(newActivity);
        renderSidebar(currentTask);
        event.target.value = '';
    }

    function renderComments(comments) {
        activityLogEl.innerHTML = '';
        const sortedComments = [...(comments || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        sortedComments.forEach(item => {
            if (item.type !== 'comment' && item.type !== 'attachment') return;
            const user = allUsers.find(u => u.id === item.userId);
            const itemDiv = document.createElement('div');
            itemDiv.className = 'log-item';
            itemDiv.dataset.commentId = item.id;
            const isOwnComment = user?.id === currentUser.id && item.type === 'comment';
            
            // Buttons container for edit/delete
            let actionButtonsHTML = '';
            if (isOwnComment) {
                actionButtonsHTML = `
                    <div class="comment-actions">
                        <div class="comment-edit-btn" title="Edit comment"><i class="fa-solid fa-pencil"></i></div>
                        <div class="comment-delete-btn" title="Delete comment"><i class="fa-solid fa-trash-can"></i></div>
                    </div>
                `;
            }

            let contentHTML = `<div class="avatar" style="background-image: url(${user?.avatar})"></div><div class="comment-body"><div class="comment-header"><div class="comment-author">${user?.name || 'Unknown User'}</div><div class="comment-timestamp">${new Date(item.timestamp).toLocaleString()}</div>${actionButtonsHTML}</div>`;
            if (item.type === 'comment') {
                contentHTML += `<div class="comment-text">${item.text}</div>`;
            } else if (item.type === 'attachment') {
                contentHTML += renderAttachmentHTML(item.file);
            }
            contentHTML += `</div>`;
            itemDiv.innerHTML = contentHTML;
            activityLogEl.appendChild(itemDiv);
        });
    }
    
    function renderActivityLog(activity) {
        activityLogEl.innerHTML = '';
        const sortedActivity = [...(activity || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        sortedActivity.forEach(item => {
            const user = allUsers.find(u => u.id === item.userId);
            const itemDiv = document.createElement('div');
            itemDiv.className = 'log-item';
            let contentHTML = `<div class="avatar" style="background-image: url(${user?.avatar})"></div><div>`;
            contentHTML += `<div class="log-text"><strong>${user?.name}</strong> ${item.text}</div>`;
            contentHTML += `<div class="log-time">${new Date(item.timestamp).toLocaleString()}</div>`;
            if(item.type === 'file_upload') {
                contentHTML += renderAttachmentHTML(item.file);
            }
            contentHTML += `</div>`;
            itemDiv.innerHTML = contentHTML;
            activityLogEl.appendChild(itemDiv);
        });
    }
    
    function renderAttachmentHTML(file) {
        if (file.isImage) {
            return `<div class="log-attachment"><a href="${file.url}" target="_blank" title="${file.name}"><img src="${file.url}" class="image-preview" alt="Image attachment"></a></div>`;
        } else {
            return `<div class="log-attachment"><a href="${file.url}" target="_blank" download="${file.name}"><div class="file-icon"><i class="fa-solid fa-file-arrow-down"></i></div><div class="file-info"><div class="file-name">${file.name}</div><div class="file-size">${(file.size / 1024).toFixed(1)} KB</div></div></a></div>`;
        }
    }

    function positionElement(elementToPosition, triggerElement) {
        const rect = triggerElement.getBoundingClientRect();
        elementToPosition.style.top = `${rect.bottom + 8}px`;
        elementToPosition.style.left = `${rect.left}px`;
    }

    function createDropdown(targetEl, options, currentValue, onSelect) {
        closeDropdowns();
        const dropdown = document.createElement('div');
        dropdown.className = 'context-dropdown';
        document.body.appendChild(dropdown);
        options.forEach(option => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            if (option === currentValue) item.classList.add('is-selected');
            item.innerHTML = `<span>${option}</span><i class="fa-solid fa-check"></i>`;
            item.addEventListener('click', () => { onSelect(option); closeDropdowns(); });
            dropdown.appendChild(item);
        });
        positionElement(dropdown, targetEl);
    }
    
    function createAssigneeDropdown(triggerEl) {
        closeDropdowns();
        const dropdown = document.createElement('div');
        dropdown.className = 'context-dropdown';
        document.body.appendChild(dropdown);
        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Search for an assignee...';
        searchInput.className = 'assignee-dropdown-search';
        dropdown.appendChild(searchInput);
        const optionsList = document.createElement('div');
        optionsList.id = 'assignee-options-list';
        dropdown.appendChild(optionsList);
        const renderAssigneeOptions = (filter = '') => {
            optionsList.innerHTML = '';
            const filteredUsers = allUsers.filter(user => user.name.toLowerCase().includes(filter.toLowerCase()));
            filteredUsers.forEach(user => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.innerHTML = `<div class="avatar" style="background-image: url(${user.avatar})"></div><span>${user.name}</span>`;
                item.addEventListener('click', () => {
                    if (!currentTask) return;
                    if (!currentTask.assignees.includes(user.id)) {
                        currentTask.assignees.push(user.id);
                    }
                    renderSidebar(currentTask);
                    closeDropdowns();
                });
                optionsList.appendChild(item);
            });
        };
        searchInput.addEventListener('input', () => renderAssigneeOptions(searchInput.value));
        renderAssigneeOptions();
        positionElement(dropdown, triggerEl);
        searchInput.focus();
    }
    
    function closeDropdowns() { document.querySelectorAll('.context-dropdown').forEach(d => d.remove()); }

    function handlePaste(event) {
        const pastedItems = (event.clipboardData || window.clipboardData).items;
        for (let i = 0; i < pastedItems.length; i++) {
            if (pastedItems[i].type.indexOf('text/plain') !== -1) {
                pastedItems[i].getAsString(text => {
                    if (text.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i)) {
                        event.preventDefault();
                        pastedImageUrl = text;
                        showImagePreview(text);
                    }
                });
            }
        }
    }

    function showImagePreview(url) {
        if (!imagePreviewContainer) return;
        imagePreviewContainer.innerHTML = `<div class="pasted-image-wrapper"><img src="${url}" alt="Pasted image preview"><button class="remove-pasted-image-btn" title="Remove image"><i class="fa-solid fa-xmark"></i></button></div>`;
        imagePreviewContainer.style.display = 'block';
        commentInput.style.display = 'none';
    }
    
    function clearImagePreview() {
        pastedImageUrl = null;
        if (imagePreviewContainer) {
            imagePreviewContainer.innerHTML = '';
            imagePreviewContainer.style.display = 'none';
        }
        commentInput.style.display = 'block';
        commentInput.focus();
    }
    
    function enterEditMode(commentId) {
        const commentItem = activityLogEl.querySelector(`.log-item[data-comment-id="${commentId}"]`);
        if (!commentItem || commentItem.querySelector('.comment-edit-area')) return;
        const commentTextEl = commentItem.querySelector('.comment-text');
        if (!commentTextEl) return;
        const currentText = commentTextEl.textContent;
        commentTextEl.style.display = 'none';
        const editArea = document.createElement('div');
        editArea.className = 'comment-edit-area';
        editArea.innerHTML = `<textarea class="comment-edit-input">${currentText}</textarea><div class="comment-edit-actions"><button class="btn-cancel-edit">Cancel</button><button class="btn-save-edit">Save</button></div>`;
        commentTextEl.after(editArea);
        editArea.querySelector('.comment-edit-input').focus();
    }

    function saveCommentEdit(commentId) {
        const commentItem = activityLogEl.querySelector(`.log-item[data-comment-id="${commentId}"]`);
        if (!commentItem) return;
        const newText = commentItem.querySelector('.comment-edit-input').value.trim();
        const comment = currentTask.comments.find(c => c.id === commentId);
        if (comment && newText) {
            comment.text = newText;
            comment.edited = true;    
            currentTask.activity.push({ id: `activity_${Date.now()}`, userId: currentUser.id, type: 'comment_edit', text: `edited a comment.`, timestamp: new Date().toISOString() });
            renderSidebar(currentTask);
        }
    }
    
    function cancelCommentEdit(commentId) {
        const commentItem = activityLogEl.querySelector(`.log-item[data-comment-id="${commentId}"]`);
        if (!commentItem) return;
        const commentTextEl = commentItem.querySelector('.comment-text');
        const editArea = commentItem.querySelector('.comment-edit-area');
        if(editArea) editArea.remove();
        if(commentTextEl) commentTextEl.style.display = 'block';
    }

    /**
     * New function to delete a comment.
     */
    function deleteComment(commentId) {
        if (!currentTask || !confirm('Are you sure you want to delete this comment?')) return;

        const initialCommentCount = currentTask.comments.length;
        // Filter out the comment to be deleted
        currentTask.comments = currentTask.comments.filter(c => c.id !== commentId);

        // Add an activity log entry for the deletion
        if (currentTask.comments.length < initialCommentCount) {
            currentTask.activity.push({ 
                id: `activity_${Date.now()}`, 
                userId: currentUser.id, 
                type: 'comment_delete', 
                text: `deleted a comment.`, 
                timestamp: new Date().toISOString() 
            });
            renderSidebar(currentTask); // Re-render the sidebar to reflect the change
        } else {
            console.warn(`Comment with ID ${commentId} not found for deletion.`);
        }
    }


    function attachEventListeners() {
        if (openSidebarBtn) {
            openSidebarBtn.addEventListener('click', () => {
                const firstTask = project.sections[0]?.tasks[0];
                if (firstTask) { open(firstTask.id); }
            });
        }
        if (toggleFullViewBtn) {
            toggleFullViewBtn.addEventListener('click', () => {
                sidebar.classList.toggle('is-full-view');
                toggleFullViewBtn.classList.toggle('fa-expand', !sidebar.classList.contains('is-full-view'));
                toggleFullViewBtn.classList.toggle('fa-compress', sidebar.classList.contains('is-full-view'));
            });
        }
        if (taskCompleteBtn) {
            taskCompleteBtn.addEventListener('click', () => { if (currentTask) setTaskCompletion(currentTask.status !== 'Completed'); });
        }
        if (sidebar) {
            sidebar.addEventListener('click', (e) => {
                if (!currentTask) return;
                const control = e.target.closest('[data-control]');
                if (!control || control.dataset.control === 'date') return;
                closeDropdowns();
                switch (control.dataset.control) {
                    case 'assignee': createAssigneeDropdown(control); break;
                    case 'priority': createDropdown(control, priorityOptions, currentTask.priority, (val) => { currentTask.priority = val; renderSidebar(currentTask); }); break;
                    case 'status': createDropdown(control, statusOptions, currentTask.status, (val) => { setTaskCompletion(val === 'Completed'); if (val !== 'Completed') { currentTask.status = val; renderSidebar(currentTask); } }); break;
                    case 'section': const sectionNames = project.sections.map(s => s.title); const currentSectionName = project.sections.find(s => s.id === currentTask.sectionId)?.title; createDropdown(control, sectionNames, currentSectionName, (val) => { if (val === 'Completed') { setTaskCompletion(true); } else { const newSection = project.sections.find(s => s.title === val); if (newSection) { setTaskCompletion(false); currentTask.sectionId = newSection.id; renderSidebar(currentTask); } } }); break;
                }
            });
        }
        window.addEventListener('click', (e) => {
            if (!sidebar || !sidebar.classList.contains('is-visible')) return;
            const clickedInsideSidebar = sidebar.contains(e.target);
            const clickedOnTaskRow = e.target.closest('.task-row-wrapper'); 
            const datepicker = document.querySelector('.flatpickr-calendar');
            const dropdown = document.querySelector('.context-dropdown');
            const clickedOnPopup = (datepicker && datepicker.contains(e.target)) || (dropdown && dropdown.contains(e.target));
            if (!clickedInsideSidebar && !clickedOnTaskRow && !clickedOnPopup) {
                sidebar.classList.remove('is-visible');
            }
        });
        if (sendCommentBtn) sendCommentBtn.addEventListener('click', handleSendComment);
        if (commentInput) {
            commentInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); } });
            commentInput.addEventListener('paste', handlePaste);
        }
        if (uploadFileBtn) uploadFileBtn.addEventListener('click', () => fileUploadInput.click());
        if (fileUploadInput) fileUploadInput.addEventListener('change', handleFileUpload);
        if (commentTabsContainer) {
            commentTabsContainer.addEventListener('click', (e) => {
                if (e.target.matches('.tab-btn')) {
                    activeTab = e.target.dataset.tab;
                    commentTabsContainer.querySelector('.active').classList.remove('active');
                    e.target.classList.add('active');
                    if (currentTask) renderSidebar(currentTask);
                }
            });
        }
        if (imagePreviewContainer) {
            imagePreviewContainer.addEventListener('click', (e) => {
                if(e.target.closest('.remove-pasted-image-btn')) {
                    clearImagePreview();
                }
            });
        }
        if (activityLogEl) {
            activityLogEl.addEventListener('click', (e) => {
                const editButton = e.target.closest('.comment-edit-btn');
                const saveButton = e.target.closest('.btn-save-edit');
                const cancelButton = e.target.closest('.btn-cancel-edit');
                const deleteButton = e.target.closest('.comment-delete-btn'); // NEW: Select the delete button

                if (editButton) {
                    enterEditMode(editButton.closest('.log-item').dataset.commentId);
                } else if (saveButton) {
                    saveCommentEdit(saveButton.closest('.log-item').dataset.commentId);
                } else if (cancelButton) {
                    cancelCommentEdit(cancelButton.closest('.log-item').dataset.commentId);
                } else if (deleteButton) { // NEW: Handle delete button click
                    deleteComment(deleteButton.closest('.log-item').dataset.commentId);
                }
            });
        }
    }

    // --- Return the public interface ---
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