window.TaskSidebar = (function() {
    // --- 1. DATA & STATE ---
    const allUsers = [
        { id: 1, name: 'Lorelai Gilmore', avatar: 'https://i.imgur.com/k9qRkiG.png' },
        { id: 2, name: 'Rory Gilmore', avatar: 'https://i.imgur.com/8mR4H4A.png' },
        { id: 3, name: 'Luke Danes', avatar: 'https://i.imgur.com/wfz43s9.png' },
        { id: 4, name: 'Sookie St. James', avatar: 'https://i.imgur.com/M2x1crz.png' },
        { id: 5, name: 'Paris Geller', avatar: 'https://i.imgur.com/5c13bC4.png' }
    ];
    let project = {
        name: 'New Brand Launch',
        customColumns: [{ id: 1, name: 'Budget', type: 'Costing', currency: '$' }],
        sections: [
            { id: 1, title: 'Design', tasks: [
                { id: 101, name: 'Create final mockups', description: "Develop high-fidelity mockups...", dueDate: '2025-06-12', priority: 'High', status: 'On track', assignees: [1, 2], customFields: { 1: 1500 }, liked: true, comments:[], activity:[] },
                { id: 102, name: 'Review branding guidelines', description: "Ensure all design assets adhere...", dueDate: '2025-06-15', priority: 'Medium', status: 'On track', assignees: [3], customFields: { 1: 850 }, liked: false, comments:[], activity:[] },
            ]},
            { id: 2, title: 'Development', tasks: [
                { id: 201, name: 'Initial setup', description: "Set up the repository, CI/CD pipeline...", dueDate: '2025-06-18', priority: 'Low', status: 'At risk', assignees: [], customFields: { 1: 3000 }, liked: false, comments:[], activity:[] },
            ]},
            { id: 3, title: 'Completed', tasks: [
                { id: 301, name: 'Kick-off meeting', description: "Initial meeting to align on project goals...", dueDate: '2025-05-30', priority: 'Medium', status: 'Completed', assignees: [4, 5], customFields: { 1: 500 }, liked: false, comments:[], activity:[] },
            ]},
        ],
    };
    
    // --- State & Variables ---
    let currentTask = null;
    let currentUser = allUsers.find(u => u.id === 1);
    let activeTab = 'comments';
    let isInitialized = false;
    let dueDateInstance = null;

    // Direct variables for DOM elements, no more 'dom' object
    let sidebar, taskCompleteBtn, taskNameEl, taskFieldsContainer, taskDescriptionTextEl, 
        currentUserAvatarEl, activityLogEl, commentTabsContainer, uploadFileBtn, 
        fileUploadInput, commentInput, sendCommentBtn, toggleFullscreenBtn, taskLikeBtn,
        imageModal, modalImageContent, closeModalBtn, closeSidebarBtn;

    /**
     * Initializes the sidebar. Returns true on success, false on failure.
     */
    function init() {
        if (isInitialized) return true;

        sidebar = document.getElementById('task-sidebar');
        
        if (!sidebar) {
            console.error("Initialization Failed: Main #task-sidebar element not found.");
            return false;
        }
        
        taskCompleteBtn = document.getElementById('task-complete-btn');
        taskNameEl = document.getElementById('task-name');
        taskFieldsContainer = document.getElementById('task-fields-container');
        taskDescriptionTextEl = document.getElementById('task-description-text');
        currentUserAvatarEl = document.getElementById('current-user-avatar');
        activityLogEl = document.getElementById('activity-log');
        commentTabsContainer = document.getElementById('comment-tabs-container');
        uploadFileBtn = document.getElementById('upload-file-btn');
        fileUploadInput = document.getElementById('file-upload-input');
        commentInput = document.getElementById('comment-input');
        sendCommentBtn = document.getElementById('send-comment-btn');
        toggleFullscreenBtn = document.getElementById('toggle-fullscreen-btn');
        taskLikeBtn = document.getElementById('task-like-btn');
        imageModal = document.getElementById('image-modal');
        modalImageContent = document.getElementById('modal-image-content');
        closeSidebarBtn = document.getElementById('close-sidebar-btn');
        closeModalBtn = document.querySelector('.image-modal-close');

        if (!taskCompleteBtn || !taskNameEl || !closeSidebarBtn) {
            console.error("Initialization failed: One or more required sidebar elements are missing from the DOM.");
            return false;
        }

        attachEventListeners();
        if (currentUser && currentUserAvatarEl) { 
            currentUserAvatarEl.style.backgroundImage = `url(${currentUser.avatar})`; 
        }

        isInitialized = true;
        console.log("TaskSidebar Initialized Successfully.");
        return true;
    }

    /**
     * Opens the sidebar and displays data for a given task ID.
     */
    function open(taskId) {
        if (!init()) {
            console.error("Sidebar cannot be opened because initialization failed. Make sure the sidebar HTML is in the document.");
            return;
        }

        let foundTask = null;
        let sectionId = null;
        for (const section of project.sections) {
            const task = section.tasks.find(t => t.id === taskId);
            if (task) {
                foundTask = task;
                sectionId = section.id;
                break;
            }
        }
        
        if (foundTask) {
            foundTask.sectionId = sectionId;
            foundTask.comments = foundTask.comments || [];
            foundTask.activity = foundTask.activity || [];
            currentTask = foundTask;
            renderSidebar(currentTask);
            sidebar.classList.add('is-visible');
        } else {
            console.error(`Sidebar Error: Task with ID ${taskId} not found.`);
        }
    }
    
    /**
     * Renders all the content inside the sidebar based on the current task.
     */
    function renderSidebar(task) {
        if (!task || !isInitialized) return;

        updateCompletionUI(task.status === 'Completed');
        updateLikeButtonUI(task.liked);
        
        taskNameEl.textContent = task.name;
        taskDescriptionTextEl.textContent = task.description || '';
        taskFieldsContainer.innerHTML = '';
        
        const fragment = document.createDocumentFragment();
        const standardFieldConfig = [
            { label: 'Assignee', key: 'assignees', type: 'assignee', control: 'assignee' },
            { label: 'Due date', key: 'dueDate', type: 'date' },
            { label: 'Projects', key: 'project', type: 'project', control: 'section' },
            { label: 'Priority', key: 'priority', type: 'tag', control: 'priority' },
            { label: 'Status', key: 'status', type: 'tag', control: 'status' }
        ];
        const customFieldConfig = (project.customColumns || []).map(col => ({
             label: col.name, key: `customFields.${col.id}`, type: 'custom', definition: col
        }));
        const fullFieldConfig = [...standardFieldConfig, ...customFieldConfig];

        fullFieldConfig.forEach(field => {
            const labelEl = document.createElement('div');
            labelEl.className = 'field-label';
            labelEl.textContent = field.label;
            let valueEl;
            if (field.type === 'date') {
                if (!dueDateInstance) {
                     const flatpickrWrapper = document.createElement('div');
                     flatpickrWrapper.className = 'flatpickr-wrapper';
                     flatpickrWrapper.innerHTML = `<input type="text" placeholder="No due date" data-input>`;
                     valueEl = flatpickrWrapper;
                     dueDateInstance = flatpickr(flatpickrWrapper, {
                         wrap: true, dateFormat: "Y-m-d",
                         onChange: (selectedDates, dateStr) => { if (currentTask) currentTask.dueDate = dateStr; },
                     });
                } else { valueEl = dueDateInstance.element; }
                dueDateInstance.setDate(task.dueDate || '', false);
            } else {
                valueEl = document.createElement('div');
                valueEl.className = 'field-value';
                if (field.control) {
                    valueEl.classList.add('control');
                    valueEl.dataset.control = field.control;
                }
                switch(field.type) {
                    case 'assignee':
                        if (task.assignees && task.assignees.length > 0) {
                            task.assignees.forEach(userId => {
                                const user = allUsers.find(u => u.id === userId);
                                if (user) {
                                    const avatarDiv = document.createElement('div');
                                    avatarDiv.className = 'avatar';
                                    avatarDiv.style.backgroundImage = `url(${user.avatar})`;
                                    avatarDiv.title = user.name;
                                    valueEl.appendChild(avatarDiv);
                                }
                            });
                        } else { valueEl.innerHTML = `<i class="fa-regular fa-user"></i> <span class="placeholder-text">No assignee</span>`; }
                        break;
                    case 'project':
                         const currentSection = project.sections.find(s => s.id === task.sectionId);
                         valueEl.innerHTML = `<i class="fa-regular fa-folder-closed"></i> ${project.name || 'No Project'} &middot; <span class="section-name">${currentSection ? currentSection.title : ''}</span>`;
                        break;
                    case 'tag':
                        valueEl.innerHTML = createTag(task[field.key], field.key);
                        break;
                    case 'custom':
                        const value = task.customFields ? task.customFields[field.definition.id] : null;
                        if (value !== null && value !== undefined) {
                            valueEl.textContent = field.definition.currency ? `${field.definition.currency}${value.toLocaleString()}` : value;
                        } else { valueEl.innerHTML = `<span class="placeholder-text">Not set</span>`; }
                        break;
                }
            }
            fragment.appendChild(labelEl);
            fragment.appendChild(valueEl);
        });
        taskFieldsContainer.appendChild(fragment);
        if (activeTab === 'comments') renderComments(task.comments);
        else renderActivityLog(task.activity);
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
            delete currentTask.originalStatus;
            delete currentTask.originalSectionId;
        }
        renderSidebar(currentTask);
    }
    
    function updateCompletionUI(isCompleted) {
        if (!sidebar || !taskCompleteBtn) return;
        sidebar.classList.toggle('task-is-completed', isCompleted);
        taskCompleteBtn.classList.toggle('completed', isCompleted);
        taskCompleteBtn.querySelector('#task-complete-text').textContent = isCompleted ? 'Completed' : 'Mark complete';
    }

    function updateLikeButtonUI(isLiked) {
        if (!taskLikeBtn) return;
        taskLikeBtn.classList.toggle('is-liked', isLiked);
        taskLikeBtn.classList.toggle('fa-solid', isLiked);
        taskLikeBtn.classList.toggle('fa-regular', !isLiked);
        taskLikeBtn.title = isLiked ? 'Unlike task' : 'Like task';
    }
    
    function handleSendComment() {
        if (!currentTask || !commentInput) return;
        const text = commentInput.value.trim();
        if (text === '') return;
        
        const newComment = { id: `comment_${Date.now()}`, userId: currentUser.id, type: 'comment', text: text, timestamp: new Date().toISOString() };
        currentTask.comments.push(newComment);
        const newActivity = { id: `activity_${Date.now()}`, userId: currentUser.id, type: 'comment', text: `commented: "${text}"`, timestamp: new Date().toISOString() };
        currentTask.activity.push(newActivity);
        
        commentInput.value = '';
        renderSidebar(currentTask);
    }

    function handleFileUpload(event) {
        if (!currentTask) return;
        const files = event.target.files;
        if (!files || !files.length) return;
        for (const file of files) {
            const fileUrl = URL.createObjectURL(file);
            const isImage = file.type.startsWith('image/');
            const newAttachment = { id: `attachment_${Date.now()}_${file.name}`, userId: currentUser.id, type: 'attachment', timestamp: new Date().toISOString(), file: { name: file.name, size: file.size, type: file.type, url: fileUrl, isImage: isImage } };
            currentTask.comments.push(newAttachment);
            const newActivity = { id: `activity_upload_${newAttachment.id}`, userId: currentUser.id, type: 'file_upload', text: `uploaded a file: ${file.name}`, timestamp: new Date().toISOString(), file: newAttachment.file };
            currentTask.activity.push(newActivity);
        }
        renderSidebar(currentTask);
        event.target.value = '';
    }

    function renderComments(comments) {
        if (!activityLogEl) return;
        activityLogEl.innerHTML = '';
        if (!comments || comments.length === 0) {
             activityLogEl.innerHTML = `<div class="placeholder-text" style="padding: 0 24px;">No comments or attachments yet.</div>`;
             return;
        }
        const sortedComments = [...comments].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        sortedComments.forEach(item => {
            if (item.type !== 'comment' && item.type !== 'attachment') return;
            const user = allUsers.find(u => u.id === item.userId);
            const itemDiv = document.createElement('div');
            itemDiv.className = 'log-item';
            
            let contentHTML = `<div class="avatar" style="background-image: url(${user?.avatar || ''})"></div><div class="comment-body"><div class="comment-header"><div class="comment-author">${user?.name || 'Unknown User'}</div><div class="comment-timestamp">${new Date(item.timestamp).toLocaleString()}</div></div>`;
            if (item.type === 'comment') {
                contentHTML += `<div class="comment-text">${item.text}</div>`;
            } else if (item.type === 'attachment' && item.file) {
                contentHTML += renderAttachmentHTML(item.file);
            }
            contentHTML += `</div>`;
            itemDiv.innerHTML = contentHTML;
            activityLogEl.appendChild(itemDiv);
        });
    }
    
    function renderActivityLog(activity) {
        if (!activityLogEl) return;
        activityLogEl.innerHTML = '';
        if (!activity || activity.length === 0) {
             activityLogEl.innerHTML = `<div class="placeholder-text" style="padding: 0 24px;">No activity yet.</div>`;
             return;
        }
        const sortedActivity = [...activity].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        sortedActivity.forEach(item => {
            const user = allUsers.find(u => u.id === item.userId);
            const itemDiv = document.createElement('div');
            itemDiv.className = 'log-item';
            
            let contentHTML = `<div class="avatar" style="background-image: url(${user?.avatar || ''})"></div><div>`;
            contentHTML += `<div class="log-text"><strong>${user?.name || 'Unknown'}</strong> ${item.text}</div>`;
            contentHTML += `<div class="log-time">${new Date(item.timestamp).toLocaleString()}</div>`;
            if(item.type === 'file_upload' && item.file) {
                contentHTML += renderAttachmentHTML(item.file);
            }
            contentHTML += `</div>`;
            itemDiv.innerHTML = contentHTML;
            activityLogEl.appendChild(itemDiv);
        });
    }
    
    function renderAttachmentHTML(file) {
        if (!file) return '';
        if (file.isImage) {
            return `<div class="log-attachment"><img src="${file.url}" class="image-preview" alt="Image attachment" data-src="${file.url}"></div>`;
        } else {
            return `<div class="log-attachment"><a href="${file.url}" target="_blank" download="${file.name}"><div class="file-icon"><i class="fa-solid fa-file-arrow-down"></i></div><div class="file-info"><div class="file-name">${file.name}</div><div class="file-size">${(file.size / 1024).toFixed(1)} KB</div></div></a></div>`;
        }
    }

    function createTag(text, type) { return `<div class="tag ${type}-${(text || '').toLowerCase().replace(/\s+/g, '-')}">${text}</div>`; }
    
    function closeDropdowns() { 
        const dropdowns = document.querySelectorAll('.context-dropdown');
        dropdowns.forEach(d => d.remove());
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
                    if (!currentTask.assignees) currentTask.assignees = [];
                    if (currentTask.assignees.includes(user.id)) {
                        currentTask.assignees = currentTask.assignees.filter(id => id !== user.id);
                    } else {
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
    
    function attachEventListeners() {
        closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('is-visible'));
        taskCompleteBtn.addEventListener('click', () => { if (currentTask) setTaskCompletion(currentTask.status !== 'Completed'); });
        taskLikeBtn.addEventListener('click', () => {
            if (!currentTask) return;
            currentTask.liked = !currentTask.liked;
            updateLikeButtonUI(currentTask.liked);
        });
        toggleFullscreenBtn.addEventListener('click', () => {
            sidebar.classList.toggle('is-full-view');
            const isFull = sidebar.classList.contains('is-full-view');
            toggleFullscreenBtn.classList.toggle('fa-expand', !isFull);
            toggleFullscreenBtn.classList.toggle('fa-compress', isFull);
        });
        sendCommentBtn.addEventListener('click', handleSendComment);
        commentInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); } });
        uploadFileBtn.addEventListener('click', () => fileUploadInput.click());
        fileUploadInput.addEventListener('change', handleFileUpload);
        activityLogEl.addEventListener('click', (event) => {
            if (event.target.classList.contains('image-preview')) {
                modalImageContent.src = event.target.dataset.src;
                imageModal.style.display = 'flex';
            }
        });
        closeModalBtn.addEventListener('click', () => { imageModal.style.display = 'none'; });
        imageModal.addEventListener('click', (e) => { if (e.target === imageModal) imageModal.style.display = 'none'; });
        commentTabsContainer.addEventListener('click', (e) => {
            if (e.target.matches('.tab-btn')) {
                activeTab = e.target.dataset.tab;
                if(commentTabsContainer.querySelector('.active')) {
                   commentTabsContainer.querySelector('.active').classList.remove('active');
                }
                e.target.classList.add('active');
                if (currentTask) renderSidebar(currentTask);
            }
        });
        sidebar.addEventListener('click', (e) => {
            if (!currentTask) return;
            const control = e.target.closest('[data-control]');
            if (!control || control.closest('.flatpickr-wrapper')) return;
            
            closeDropdowns();
            const controlType = control.dataset.control;
            switch (controlType) {
                case 'assignee': createAssigneeDropdown(control); break;
                case 'priority': createDropdown(control, ['High', 'Medium', 'Low'], currentTask.priority, (val) => { currentTask.priority = val; renderSidebar(currentTask); }); break;
                case 'status': createDropdown(control, ['On track', 'At risk', 'Off track', 'Completed'], currentTask.status, (val) => { setTaskCompletion(val === 'Completed'); if (val !== 'Completed') { currentTask.status = val; renderSidebar(currentTask); } }); break;
                case 'section': 
                    const sectionNames = project.sections.map(s => s.title);
                    const currentSectionName = project.sections.find(s => s.id === currentTask.sectionId)?.title;
                    createDropdown(control, sectionNames, currentSectionName, (val) => { 
                        if (val === 'Completed') { setTaskCompletion(true); } 
                        else { 
                            const newSection = project.sections.find(s => s.title === val); 
                            if (newSection) { 
                                setTaskCompletion(false); 
                                currentTask.sectionId = newSection.id; 
                                renderSidebar(currentTask); 
                            } 
                        } 
                    }); 
                    break;
            }
        });
        
        window.addEventListener('click', (e) => {
             if (!sidebar || !sidebar.classList.contains('is-visible')) {
                 return;
             }
             const clickedOnPopup = e.target.closest('.context-dropdown, .flatpickr-calendar');
             if (!sidebar.contains(e.target) && !clickedOnPopup) {
                 sidebar.classList.remove('is-visible');
                 closeDropdowns();
             }
        });
    }

    // --- Public Interface ---
    return {
        init: init,
        open: open
    };
})();

// This ensures all HTML is loaded before the script tries to find elements.
document.addEventListener('DOMContentLoaded', () => {
    if (window.TaskSidebar) {
        window.TaskSidebar.init();
    }
});