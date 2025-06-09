document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const sidebar = document.getElementById('task-sidebar');
    const taskCompleteBtn = document.getElementById('task-complete-btn');
    const taskNameEl = document.getElementById('task-name');
    const taskAssigneeEl = document.getElementById('task-assignee');
    const taskProjectEl = document.getElementById('task-project');
    const taskPriorityEl = document.getElementById('task-priority');
    const taskStatusEl = document.getElementById('task-status');
    const taskDescriptionTextEl = document.getElementById('task-description-text');
    const currentUserAvatarEl = document.getElementById('current-user-avatar');
    const activityLogEl = document.getElementById('activity-log');
    const commentTabsContainer = document.getElementById('comment-tabs-container');
    const uploadFileBtn = document.getElementById('upload-file-btn');
    const fileUploadInput = document.getElementById('file-upload-input');
    const commentInput = document.getElementById('comment-input');
    const sendCommentBtn = document.getElementById('send-comment-btn');

    // --- Local Data & State ---
    const allUsers = [
        { id: 'user_1', name: 'Lorelai Gilmore', avatar: 'https://i.imgur.com/k9qRkiG.png' },
        { id: 'user_2', name: 'Rory Gilmore', avatar: 'https://i.imgur.com/8mR4H4A.png' },
        { id: 'user_3', name: 'Luke Danes', avatar: 'https://i.imgur.com/wfz43s9.png' },
    ];
    let project = {
        sections: [
            { id: 1, title: 'Design' }, { id: 2, title: 'Development' }, { id: 3, title: 'Testing' }, { id: 4, title: 'Completed' },
        ]
    };
    let sampleTask = {
        id: 'local_task_101',
        sectionId: 1,
        name: 'Finalize quarterly report',
        description: 'Review all department data and compile the final report for the Q2 board meeting.',
        assignees: ['user_1', 'user_2'],
        dueDate: '2025-06-25',
        project: 'Q2 Financials',
        priority: 'High',
        status: 'On track',
        originalStatus: null,
        originalSectionId: null,
        comments: [
            { id: 'comment_1', userId: 'user_3', type: 'comment', text: 'Have the marketing numbers been added yet?', timestamp: new Date(2025, 5, 9, 10, 0, 0).toISOString() }
        ],
        activity: [
            { id: 'activity_1', userId: 'user_1', type: 'creation', text: 'created this task.', timestamp: new Date(2025, 5, 8, 9, 0, 0).toISOString() },
            { id: 'activity_2', userId: 'user_3', type: 'comment', text: `commented: "Have the marketing numbers been added yet?"`, timestamp: new Date(2025, 5, 9, 10, 0, 0).toISOString() }
        ]
    };
    const priorityOptions = ['High', 'Medium', 'Low'];
    const statusOptions = ['On track', 'At risk', 'Off track', 'Completed'];
    let currentTask = sampleTask;
    let currentUser = allUsers.find(u => u.id === 'user_1');
    let dueDateInstance = null;
    let activeTab = 'comments';

    // --- Core & UI Functions ---

    function setTaskCompletion(isComplete) {
        const isCurrentlyCompleted = currentTask.status === 'Completed';
        if (isComplete === isCurrentlyCompleted) return;
        const completedSection = project.sections.find(s => s.title === 'Completed');
        if (isComplete) {
            currentTask.originalStatus = currentTask.status;
            currentTask.originalSectionId = currentTask.sectionId;
            currentTask.status = 'Completed';
            currentTask.sectionId = completedSection.id;
        } else {
            currentTask.status = currentTask.originalStatus || 'On track';
            currentTask.sectionId = currentTask.originalSectionId || project.sections[0].id;
            currentTask.originalStatus = null;
            currentTask.originalSectionId = null;
        }
        renderSidebar(currentTask);
    }

    function updateCompletionUI(isCompleted) {
        sidebar.classList.toggle('task-is-completed', isCompleted);
        taskCompleteBtn.classList.toggle('completed', isCompleted);
        taskCompleteBtn.querySelector('#task-complete-text').textContent = isCompleted ? 'Completed' : 'Mark complete';
    }

    function renderSidebar(task) {
        updateCompletionUI(task.status === 'Completed');
        taskNameEl.textContent = task.name;
        taskDescriptionTextEl.textContent = task.description;

        if (dueDateInstance) {
            dueDateInstance.setDate(task.dueDate, false);
        }

        taskAssigneeEl.innerHTML = '';
        if (task.assignees && task.assignees.length > 0) {
            const assigneeFragment = document.createDocumentFragment();
            task.assignees.forEach(userId => {
                const user = allUsers.find(u => u.id === userId);
                if (user) {
                    const avatarDiv = document.createElement('div');
                    avatarDiv.className = 'avatar';
                    avatarDiv.style.backgroundImage = `url(${user.avatar})`;
                    avatarDiv.title = user.name;
                    assigneeFragment.appendChild(avatarDiv);
                }
            });
            taskAssigneeEl.appendChild(assigneeFragment);
        } else {
            taskAssigneeEl.innerHTML = `<span class="placeholder-text">No assignee</span>`;
        }
        
        const currentSection = project.sections.find(s => s.id === task.sectionId);
        taskProjectEl.innerHTML = `${task.project || 'No Project'} &middot; <span class="section-name">${currentSection.title}</span>`;
        taskPriorityEl.innerHTML = createTag(task.priority, 'priority');
        taskStatusEl.innerHTML = createTag(task.status, 'status');
        
        if (activeTab === 'comments') {
            renderComments(task.comments);
        } else {
            renderActivityLog(task.activity);
        }
    }
    
    // --- Comment, Activity, and Upload Handlers ---

    function handleSendComment() {
        const text = commentInput.value.trim();
        if (text === '') return;
        const newEntry = {
            id: `entry_${Date.now()}`,
            userId: currentUser.id,
            type: 'comment',
            text: text,
            timestamp: new Date().toISOString()
        };
        sampleTask.comments.push(newEntry);
        sampleTask.activity.push({ ...newEntry, text: `commented: "${text}"`});
        commentInput.value = '';
        renderSidebar(currentTask);
    }
    
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const fileUrl = URL.createObjectURL(file);
        const isImage = file.type.startsWith('image/');
        const newAttachment = {
            id: `entry_${Date.now()}`,
            userId: currentUser.id,
            type: 'attachment',
            timestamp: new Date().toISOString(),
            file: { name: file.name, size: file.size, type: file.type, url: fileUrl, isImage: isImage }
        };
        const newActivity = {
            id: `activity_${newAttachment.id}`,
            userId: currentUser.id,
            type: 'file_upload',
            text: `uploaded a file: ${file.name}`,
            timestamp: new Date().toISOString(),
            file: newAttachment.file
        };
        sampleTask.comments.push(newAttachment);
        sampleTask.activity.push(newActivity);
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
            let contentHTML = `<div class="avatar" style="background-image: url(${user?.avatar})"></div><div class="comment-body"><div class="comment-header"><div class="comment-author">${user?.name || 'Unknown User'}</div><div class="comment-timestamp">${new Date(item.timestamp).toLocaleString()}</div></div>`;
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
    
    // --- Other Dropdown/Picker Functions ---
    function initFlatpickr() {
        const originalDueDateElement = document.getElementById('task-due-date');
        if (!originalDueDateElement) return;

        const flatpickrWrapper = document.createElement('div');
        flatpickrWrapper.className = 'flatpickr-wrapper';
        flatpickrWrapper.dataset.control = 'date';
        flatpickrWrapper.innerHTML = `
            <input type="text" placeholder="No due date" data-input>
            <a class="input-button" title="Toggle" data-toggle>
                <i class="fa-regular fa-calendar"></i>
            </a>
        `;
        
        originalDueDateElement.replaceWith(flatpickrWrapper);
        
        dueDateInstance = flatpickr(flatpickrWrapper, {
            wrap: true,
            dateFormat: "Y-m-d",
            defaultDate: currentTask.dueDate,
            onChange: function(selectedDates, dateStr, instance) {
                currentTask.dueDate = dateStr;
            },
        });
    }

    function positionElement(elementToPosition, triggerElement) {
        const rect = triggerElement.getBoundingClientRect();
        let left = rect.left;
        let top = rect.bottom + 8;
        if (left + elementToPosition.offsetWidth > window.innerWidth) {
            left = window.innerWidth - elementToPosition.offsetWidth - 10;
        }
        elementToPosition.style.top = `${top}px`;
        elementToPosition.style.left = `${left}px`;
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
    
    function createAssigneeDropdown() {
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
        positionElement(dropdown, taskAssigneeEl);
        searchInput.focus();
    }
    
    function createTag(text, type) { return `<div class="tag ${type}-${text.toLowerCase().replace(/\s+/g, '-')}">${text}</div>`; }
    function closeDropdowns() { document.querySelectorAll('.context-dropdown').forEach(d => d.remove()); }

    // --- Event Listeners ---
    taskCompleteBtn.addEventListener('click', () => { setTaskCompletion(currentTask.status !== 'Completed'); });
    
    sidebar.addEventListener('click', (e) => {
        const control = e.target.closest('[data-control]');
        if (!control || control.dataset.control === 'date') return;
        closeDropdowns();
        switch (control.dataset.control) {
            case 'assignee': createAssigneeDropdown(); break;
            case 'priority': createDropdown(control, priorityOptions, currentTask.priority, (val) => { currentTask.priority = val; renderSidebar(currentTask); }); break;
            case 'status': createDropdown(control, statusOptions, currentTask.status, (val) => { setTaskCompletion(val === 'Completed'); if (val !== 'Completed') { currentTask.status = val; renderSidebar(currentTask); } }); break;
            case 'section': const sectionNames = project.sections.map(s => s.title); const currentSectionName = project.sections.find(s => s.id === currentTask.sectionId).title; createDropdown(control, sectionNames, currentSectionName, (val) => { if (val === 'Completed') { setTaskCompletion(true); } else { const newSection = project.sections.find(s => s.title === val); if (newSection) { setTaskCompletion(false); currentTask.sectionId = newSection.id; renderSidebar(currentTask); } } }); break;
        }
    });

    window.addEventListener('click', (e) => { if (!e.target.closest('.context-dropdown, [data-control], .flatpickr-calendar')) { closeDropdowns(); } });

    sendCommentBtn.addEventListener('click', handleSendComment);
    commentInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); } });
    uploadFileBtn.addEventListener('click', () => fileUploadInput.click());
    fileUploadInput.addEventListener('change', handleFileUpload);
    
    commentTabsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.tab-btn')) {
            activeTab = e.target.dataset.tab;
            commentTabsContainer.querySelector('.active').classList.remove('active');
            e.target.classList.add('active');
            renderSidebar(currentTask);
        }
    });

    // --- Initial Load ---
    if (currentUser) { currentUserAvatarEl.style.backgroundImage = `url(${currentUser.avatar})`; }
    sidebar.classList.add('is-visible');
    initFlatpickr();
    renderSidebar(currentTask);
});