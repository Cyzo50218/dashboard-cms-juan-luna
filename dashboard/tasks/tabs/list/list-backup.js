
let listButtonListener = null;

export function init(params) {
    console.log("List tab module initialized with params:", params);
    
    const listButton = document.getElementById('list-action-button');
    
    listButtonListener = () => {
        alert(`List button clicked for project: ${params.projectId}`);
    };
    
    if (listButton) {
        listButton.addEventListener('click', listButtonListener);
    }
    
        // --- Initial Load ---
    render();
    new Sortable(taskListBody, { handle: '.drag-handle', animation: 150 });


    
    // Return its own cleanup function
    return function cleanup() {
        console.log("Cleaning up 'list' tab module.");
        if (listButton && listButtonListener) {
            listButton.removeEventListener('click', listButtonListener);
        }
    };
}

    const taskListHeaderEl = document.getElementById('task-list-header');
    const taskListBody = document.getElementById('task-list-body');
    const taskListFooter = document.getElementById('task-list-footer');
    const addSectionBtn = document.getElementById('add-section-btn');
    const addTaskHeaderBtn = document.querySelector('.add-task-header-btn');
    const mainContainer = document.querySelector('.main-container');
    const assigneeDropdownTemplate = document.getElementById('assignee-dropdown-template');

    // --- Data ---
    const allUsers = [
        { id: 1, name: 'Lorelai Gilmore', avatar: 'https://i.imgur.com/k9qRkiG.png' },
        { id: 2, name: 'Rory Gilmore', avatar: 'https://i.imgur.com/8mR4H4A.png' },
        { id: 3, name: 'Luke Danes', avatar: 'https://i.imgur.com/wfz43s9.png' },
        { id: 4, name: 'Sookie St. James', avatar: 'https://i.imgur.com/L4DD33f.png'},
        { id: 5, name: 'Paris Geller', avatar: 'https://i.imgur.com/lVceL5s.png' }
    ];

    let project = {
        customColumns: [
            { id: 1, name: 'Budget', type: 'Costing', currency: '$', aggregation: 'Sum' },
        ],
        sections: [
            { id: 1, title: 'Design', tasks: [
                { id: 101, name: 'Create final mockups', dueDate: 'Jun 12', priority: 'High', status: 'On track', assignees: [1, 2], customFields: { 1: 1500 } },
                { id: 102, name: 'Review branding guidelines', dueDate: 'Jun 15', priority: 'Medium', status: 'On track', assignees: [3], customFields: { 1: 850 } }
            ], isCollapsed: false },
            { id: 2, title: 'Development', tasks: [
                { id: 201, name: 'Initial setup', dueDate: '', priority: 'Low', status: 'At risk', assignees: [], customFields: { 1: 3000 } }
            ], isCollapsed: false }
        ]
    };

    let currentlyFocusedSectionId = project.sections.length > 0 ? project.sections[0].id : null;
    const priorityOptions = ['High', 'Medium', 'Low'];
    const statusOptions = ['On track', 'At risk', 'Off track', 'Completed'];
    const columnTypeOptions = ['Text', 'Numbers', 'Costing', 'Custom'];
    const baseColumnTypes = ['Text', 'Numbers', 'Costing'];
    
    // --- Helper & Core Functions ---
    const closeFloatingPanels = () => {
        document.querySelectorAll('.context-dropdown, .datepicker, .dialog-overlay').forEach(p => p.remove());
    };
    
    const findTaskAndSection = (taskId) => {
        for (const section of project.sections) {
            const task = section.tasks.find(t => t.id === taskId);
            if (task) return { task, section };
        }
        return { task: null, section: null };
    };

    const updateTask = (taskId, newProperties) => {
        const { task } = findTaskAndSection(taskId);
        if (task) {
            Object.assign(task, newProperties);
            render();
        }
    };
    
    const handleTaskCompletion = (taskId, taskRowEl) => {
        const { task, section: sourceSection } = findTaskAndSection(taskId);
        if (!task || !sourceSection) return;

        taskRowEl.classList.add('is-completed');

        setTimeout(() => {
            let completedSection = project.sections.find(s => s.title.toLowerCase() === 'completed');
            if (!completedSection) {
                completedSection = { id: Date.now(), title: 'Completed', tasks: [], isCollapsed: false };
                project.sections.push(completedSection);
            }

            task.status = 'Completed';

            if (sourceSection.id !== completedSection.id) {
                sourceSection.tasks = sourceSection.tasks.filter(t => t.id !== taskId);
                completedSection.tasks.unshift(task);
            }
            render();
        }, 400); 
    };
    
    // --- UI Creation Functions ---
    const createTag = (text, type, pClass) => `<div class="${type}-tag ${pClass}">${text}</div>`;
    const createPriorityTag = (p) => createTag(p, 'priority', `priority-${p}`);
    const createStatusTag = (s) => createTag(s, 'status', `status-${s.replace(/\s+/g, '-')}`);

    const createDropdown = (options, targetEl, callback) => {
        closeFloatingPanels();
        const wrapperRect = mainContainer.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        
        const dropdown = document.createElement('div');
        dropdown.className = 'context-dropdown';
        dropdown.style.top = `${targetRect.bottom - wrapperRect.top}px`;
        dropdown.style.left = `${targetRect.left - wrapperRect.left}px`;

        options.forEach(option => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = option;
            item.addEventListener('click', () => callback(option));
            dropdown.appendChild(item);
        });
        mainContainer.appendChild(dropdown);
    };

    const showAssigneeDropdown = (targetEl, taskId) => {
        closeFloatingPanels();
        const { task } = findTaskAndSection(taskId);
        if (!task) return;

        const wrapperRect = mainContainer.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const dropdown = assigneeDropdownTemplate.content.cloneNode(true).firstElementChild;
        dropdown.style.top = `${targetRect.bottom - wrapperRect.top}px`;
        dropdown.style.left = `${targetRect.left - wrapperRect.left}px`;
        
        const searchInput = dropdown.querySelector('.dropdown-search-input');
        const listContainer = dropdown.querySelector('.dropdown-list');

        const renderList = (currentTask, filterText = '') => {
            listContainer.innerHTML = '';
            const filteredUsers = allUsers.filter(u => u.name.toLowerCase().includes(filterText.toLowerCase()));
            
            filteredUsers.forEach(user => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                const isAssigned = currentTask.assignees.includes(user.id);
                
                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div class="profile-picture" style="background-image: url(${user.avatar})"></div>
                        <span>${user.name}</span>
                    </div>
                    ${isAssigned ? '<i class="fas fa-check assigned-check"></i>' : ''}
                `;

                item.addEventListener('click', () => {
                    const latestTaskState = findTaskAndSection(taskId).task;
                    let newAssignees;
                    if (latestTaskState.assignees.includes(user.id)) {
                        newAssignees = latestTaskState.assignees.filter(id => id !== user.id);
                    } else {
                        newAssignees = [...latestTaskState.assignees, user.id];
                    }
                    // Update the data model which will trigger a re-render and close panels
                    updateTask(taskId, { assignees: newAssignees });
                });
                listContainer.appendChild(item);
            });
        };
        
        searchInput.addEventListener('input', () => renderList(task, searchInput.value));
        mainContainer.appendChild(dropdown);
        setTimeout(() => searchInput.focus(), 0);
        renderList(task);
    };

    const showDatePicker = (targetEl, taskId) => {
        closeFloatingPanels();
        const wrapperRect = mainContainer.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        
        const dropdownPanel = document.createElement('div');
        dropdownPanel.className = 'context-dropdown';
        dropdownPanel.style.padding = '0';
        dropdownPanel.style.top = `${targetRect.bottom - wrapperRect.top}px`;
        dropdownPanel.style.left = `${targetRect.left - wrapperRect.left}px`;

        const datepickerContainer = document.createElement('div');
        dropdownPanel.appendChild(datepickerContainer);
        mainContainer.appendChild(dropdownPanel);

        const datepicker = new Datepicker(datepickerContainer, {
            autohide: true,
            format: 'M d',
            todayHighlight: true,
        });
        
        const { task } = findTaskAndSection(taskId);
        if (task && task.dueDate) {
            const fullDateStr = `${task.dueDate} ${new Date().getFullYear()}`;
            datepicker.setDate(fullDateStr);
        }
        
        datepickerContainer.addEventListener('changeDate', (e) => {
            const formattedDate = Datepicker.formatDate(e.detail.date, 'M d');
            updateTask(taskId, { dueDate: formattedDate });
            closeFloatingPanels();
        }, { once: true });
    };
    
    // --- Main Render Pipeline ---
    const render = () => {
        const scrollStates = new Map();
        document.querySelectorAll('.scrollable-columns-wrapper').forEach((el, i) => scrollStates.set(i, el.scrollLeft));
        
        closeFloatingPanels();
        
        renderHeader();
        renderBody();
        renderFooter();

        syncScroll(scrollStates);
    };

    const renderHeader = () => {
        const container = document.getElementById('header-scroll-cols');
        container.querySelectorAll('.header-custom').forEach(el => el.remove());

        const addColBtnContainer = container.querySelector('.add-column-container');
        
        project.customColumns.forEach(col => {
            const colEl = document.createElement('div');
            colEl.className = 'task-col header-custom';
            colEl.dataset.columnId = col.id;
            colEl.textContent = col.name;

            const menuBtn = document.createElement('button');
            menuBtn.className = 'delete-column-btn';
            menuBtn.title = 'Column options';
            menuBtn.innerHTML = `<i class="fas fa-ellipsis-h"></i>`;
            colEl.appendChild(menuBtn);

            container.insertBefore(colEl, addColBtnContainer);
        });
        
        document.getElementById('add-column-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const existingTypes = new Set(project.customColumns.map(col => col.type));
            const availableTypes = columnTypeOptions.filter(type => !existingTypes.has(type) || type === 'Custom');
            
            if (availableTypes.length === 0) {
                alert("All available column types have been added.");
                return;
            }
            createDropdown(availableTypes, e.currentTarget, openAddColumnDialog);
        });
    };

    const renderBody = () => {
        taskListBody.innerHTML = '';
        project.sections.forEach(section => {
            const sectionElement = createSection(section);
            if (sectionElement) {
                taskListBody.appendChild(sectionElement);
            }
        });
    };
    
    const renderFooter = () => {
        let hasAggregatableColumn = project.customColumns.some(c => c.aggregation);
        if (!hasAggregatableColumn) {
            taskListFooter.innerHTML = '';
            taskListFooter.style.display = 'none';
            return;
        }

        let customColsHTML = '';
        project.customColumns.forEach(col => {
            let displayValue = '';
            if (col.aggregation === 'Sum') {
                let total = project.sections.reduce((sum, section) => {
                    return sum + section.tasks.reduce((secSum, task) => {
                        return secSum + Number(task.customFields[col.id] || 0);
                    }, 0);
                }, 0);
                 displayValue = col.type === 'Costing' 
                    ? `${col.currency || '$'}${total.toLocaleString()}`
                    : total.toLocaleString();
            }
            customColsHTML += `<div class="task-col header-custom">${displayValue}</div>`;
        });

        taskListFooter.innerHTML = `
            <div class="fixed-column"></div>
            <div class="scrollable-columns-wrapper">
                <div class="scrollable-columns">
                    <div class="task-col header-assignee"></div><div class="task-col header-due-date"></div><div class="task-col header-priority"></div><div class="task-col header-status"></div>
                    ${customColsHTML}
                </div>
            </div>`;
        taskListFooter.style.display = 'flex';
    };

    const createSection = (sectionData) => {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'task-section';
        sectionEl.dataset.sectionId = sectionData.id;
        sectionEl.innerHTML = `<div class="section-header-list"><i class="fas fa-grip-vertical drag-handle"></i><i class="fas fa-chevron-down section-toggle ${sectionData.isCollapsed ? 'collapsed' : ''}"></i><span class="section-title" contenteditable="true">${sectionData.title}</span></div><div class="tasks-container ${sectionData.isCollapsed ? 'hidden' : ''}"></div><button class="add-task-in-section-btn"><i class="fas fa-plus"></i> Add task</button>`;
        const tasksContainer = sectionEl.querySelector('.tasks-container');
        if (sectionData.tasks && tasksContainer) {
            sectionData.tasks.forEach(task => tasksContainer.appendChild(createTaskRow(task)));
        }
        sectionEl.querySelector('.add-task-in-section-btn').addEventListener('click', () => {
            const section = project.sections.find(s => s.id == sectionData.id);
            if (section) {
                section.tasks.push({ id: Date.now(), name: '', dueDate: '', priority: 'Low', status: 'On track', assignees: [], customFields: {} });
                render();
            }
        });
        new Sortable(tasksContainer, { group: 'tasks', handle: '.drag-handle', animation: 150 });
        return sectionEl;
    };

    const createTaskRow = (task) => {
        const rowWrapper = document.createElement('div');
        const isCompleted = task.status === 'Completed';
        rowWrapper.className = `task-row-wrapper ${isCompleted ? 'is-completed' : ''}`;
        rowWrapper.dataset.taskId = task.id;

        const isPlaceholder = !task.name.trim();
        const displayName = isPlaceholder ? `[Add task name]` : task.name;

        let customFieldsHTML = '';
        project.customColumns.forEach(col => {
            const value = task.customFields[col.id] || '';
            const displayValue = col.type === 'Costing' && value ? `${col.currency || '$'}${value}` : value;
            customFieldsHTML += `<div class="task-col header-custom" data-control="custom" data-column-id="${col.id}" contenteditable="true">${displayValue}</div>`;
        });
        
        rowWrapper.innerHTML = `
            <div class="fixed-column">
                <i class="fas fa-grip-vertical drag-handle"></i>
                <i class="far fa-check-circle" data-control="check"></i>
                <span class="task-name ${isPlaceholder ? 'is-placeholder' : ''}" contenteditable="true">${displayName}</span>
            </div>
            <div class="scrollable-columns-wrapper">
                <div class="scrollable-columns">
                    <div class="task-col header-assignee" data-control="assignee">${createAssigneeHTML(task.assignees)}</div>
                    <div class="task-col header-due-date" data-control="due-date">${task.dueDate || '<span class="add-due-date">+ Add date</span>'}</div>
                    <div class="task-col header-priority" data-control="priority">${createPriorityTag(task.priority)}</div>
                    <div class="task-col header-status" data-control="status">${createStatusTag(task.status)}</div>
                    ${customFieldsHTML}
                </div>
            </div>`;
        
        rowWrapper.querySelector('.task-name').addEventListener('blur', (e) => {
            if (task.name !== e.target.innerText) {
                updateTask(task.id, { name: e.target.innerText });
            }
        });
        
        rowWrapper.querySelectorAll('[data-control="custom"]').forEach(cell => {
            cell.addEventListener('blur', (e) => {
                const columnId = Number(e.target.dataset.columnId);
                const column = project.customColumns.find(c => c.id === columnId);
                let newValue = e.target.innerText;
                if (column.type === 'Costing' || column.type === 'Numbers') {
                    newValue = Number(newValue.replace(/[^0-9.]/g, '')) || 0;
                }
                if (task.customFields[columnId] !== newValue) {
                    updateTask(task.id, { customFields: { ...task.customFields, [columnId]: newValue } });
                }
            });
        });
        return rowWrapper;
    };
    
    const createAssigneeHTML = (assignees) => {
        if (!assignees || assignees.length === 0) return `<div class="profile-picture add-assignee-btn"><i class="fas fa-plus"></i></div>`;
        let html = '<div class="profile-picture-stack">';
        assignees.forEach((assigneeId, index) => {
            const user = allUsers.find(u => u.id === assigneeId);
            if (user) html += `<div class="profile-picture ${index > 0 ? 'overlap' : ''}" style="background-image: url(${user.avatar})" title="${user.name}"></div>`;
        });
        html += '</div>';
        return html;
    };

    // --- Add/Delete Column Logic ---
    const openAddColumnDialog = (columnType) => {
        if (columnType === 'Custom') {
            openCustomColumnCreatorDialog();
            return;
        }
        
        closeFloatingPanels();
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay';
        
        let previewHTML = '';
        if (columnType === 'Costing') {
            previewHTML = `<div class="preview-value">$1,234.56</div><p>Formatted as currency. The sum will be shown in the footer.</p>`;
        } else if (columnType === 'Numbers') {
            previewHTML = `<div class="preview-value">1,234.56</div><p>For tracking quantities. The sum will be shown in the footer.</p>`;
        } else {
             previewHTML = `<div class="preview-value">Any text value</div><p>For notes or labels.</p>`;
        }
        
        let typeSpecificFields = '';
        if (columnType === 'Costing') {
            typeSpecificFields = `<div class="form-group"><label>Currency</label><select id="column-currency"><option value="$">USD ($)</option><option value="€">EUR (€)</option></select></div>`;
        }

        dialogOverlay.innerHTML = `
            <div class="dialog-box">
                <div class="dialog-header">Add "${columnType}" Column</div>
                <div class="dialog-body">
                     <div class="form-group"><label for="column-name">Column Name</label><input type="text" id="column-name" placeholder="e.g., Budget"></div>
                    ${typeSpecificFields}
                    <div class="dialog-preview-box">${previewHTML}</div>
                </div>
                <div class="dialog-footer">
                    <button class="dialog-button" id="cancel-add-column">Cancel</button>
                    <button class="dialog-button primary" id="confirm-add-column">Add Column</button>
                </div>
            </div>`;
        
        document.body.appendChild(dialogOverlay);
        document.getElementById('column-name').focus();

        document.getElementById('confirm-add-column').addEventListener('click', () => {
            const config = {
                name: document.getElementById('column-name').value,
                type: columnType,
                currency: document.getElementById('column-currency')?.value
            };
            if (!config.name) { alert('Please enter a column name.'); return; }
            addNewColumn(config);
            closeFloatingPanels();
        });
        dialogOverlay.addEventListener('click', e => { if (e.target === dialogOverlay || e.target.closest('#cancel-add-column')) closeFloatingPanels(); });
    };

    const openCustomColumnCreatorDialog = () => {
        closeFloatingPanels();
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay';

        const baseTypeOptionsHTML = baseColumnTypes.map(type => `<option value="${type}">${type}</option>`).join('');

        dialogOverlay.innerHTML = `
            <div class="dialog-box">
                <div class="dialog-header">Create Custom Column</div>
                <div class="dialog-body">
                    <div class="form-group">
                        <label for="column-name">Column Name</label>
                        <input type="text" id="column-name" placeholder="e.g., T-Shirt Size">
                    </div>
                    <div class="form-group">
                        <label for="base-column-type">Select Data Type</label>
                        <select id="base-column-type">${baseTypeOptionsHTML}</select>
                    </div>
                    <div id="type-specific-options-custom"></div>
                </div>
                <div class="dialog-footer">
                    <button class="dialog-button" id="cancel-add-column">Cancel</button>
                    <button class="dialog-button primary" id="confirm-add-column">Add Column</button>
                </div>
            </div>`;
        
        document.body.appendChild(dialogOverlay);
        const baseTypeSelect = document.getElementById('base-column-type');
        const specificOptionsContainer = document.getElementById('type-specific-options-custom');

        const renderTypeSpecificOptions = (selectedType) => {
            let extraFields = '';
            if (selectedType === 'Costing') {
                extraFields = `<div class="form-group"><label>Currency</label><select id="column-currency"><option value="$">USD ($)</option><option value="€">EUR (€)</option></select></div>`;
            }
            specificOptionsContainer.innerHTML = extraFields;
        };
        
        baseTypeSelect.addEventListener('change', () => renderTypeSpecificOptions(baseTypeSelect.value));
        renderTypeSpecificOptions(baseTypeSelect.value);

        document.getElementById('confirm-add-column').addEventListener('click', () => {
            const config = {
                name: document.getElementById('column-name').value,
                type: baseTypeSelect.value,
                currency: document.getElementById('column-currency')?.value
            };
            if (!config.name) { alert('Please enter a column name.'); return; }
            addNewColumn(config);
            closeFloatingPanels();
        });

        dialogOverlay.addEventListener('click', e => { if (e.target === dialogOverlay || e.target.closest('#cancel-add-column')) closeFloatingPanels(); });
    };

    const addNewColumn = (config) => {
        const newColumn = {
            id: Date.now(),
            name: config.name,
            type: config.type,
            currency: config.currency || null,
            aggregation: (config.type === 'Costing' || config.type === 'Numbers') ? 'Sum' : null,
        };
        project.customColumns.push(newColumn);
        render();
    };
    
    const deleteColumn = (columnId) => {
        if (window.confirm('Are you sure you want to delete this column and all its data? This action cannot be undone.')) {
            project.customColumns = project.customColumns.filter(col => col.id !== columnId);
            project.sections.forEach(section => {
                section.tasks.forEach(task => {
                    if (task.customFields && task.customFields[columnId]) {
                        delete task.customFields[columnId];
                    }
                });
            });
            render();
        }
    };

    // --- Event Listeners ---
    taskListHeaderEl.addEventListener('click', (e) => {
        const deleteButton = e.target.closest('.delete-column-btn');
        if (deleteButton) {
            e.stopPropagation();
            const columnId = Number(deleteButton.closest('[data-column-id]').dataset.columnId);
            createDropdown(['Delete column'], deleteButton, (option) => {
                if (option === 'Delete column') {
                    deleteColumn(columnId);
                }
            });
        }
    });

    taskListBody.addEventListener('click', (e) => {
        const clickedSection = e.target.closest('.task-section');
        if (clickedSection) currentlyFocusedSectionId = Number(clickedSection.dataset.sectionId);

        if (e.target.closest('.section-toggle')) {
            const sectionEl = e.target.closest('.task-section');
            const section = project.sections.find(s => s.id == sectionEl.dataset.sectionId);
            if (section) section.isCollapsed = !section.isCollapsed;
            render();
            return;
        }
        
        const taskRow = e.target.closest('.task-row-wrapper');
        if (!taskRow) return;
        const taskId = Number(taskRow.dataset.taskId);

        const checkCell = e.target.closest('[data-control="check"]');
        if (checkCell) { e.stopPropagation(); handleTaskCompletion(taskId, taskRow); return; }

        const dueDateCell = e.target.closest('[data-control="due-date"]');
        if (dueDateCell) { showDatePicker(dueDateCell, taskId); return; }
        
        const priorityCell = e.target.closest('[data-control="priority"]');
        if (priorityCell) { createDropdown(priorityOptions, priorityCell, (value) => updateTask(taskId, { priority: value })); return; }

        const statusCell = e.target.closest('[data-control="status"]');
        if (statusCell) { createDropdown(statusOptions, statusCell, (value) => updateTask(taskId, { status: value })); return; }
        
        const assigneeCell = e.target.closest('[data-control="assignee"]');
        if (assigneeCell) { showAssigneeDropdown(assigneeCell, taskId); return; }
    });

    addTaskHeaderBtn.addEventListener('click', () => {
        if (!currentlyFocusedSectionId && project.sections.length > 0) currentlyFocusedSectionId = project.sections[0].id;
        const focusedSection = project.sections.find(s => s.id === currentlyFocusedSectionId);
        if (focusedSection) {
            focusedSection.tasks.unshift({ id: Date.now(), name: '', dueDate: '', priority: 'Low', status: 'On track', assignees: [], customFields: {} });
            if (focusedSection.isCollapsed) focusedSection.isCollapsed = false;
            render();
        } else {
            alert('Please create a section before adding a task.');
        }
    });
    
    addSectionBtn.addEventListener('click', () => {
        const newSectionId = Date.now();
        project.sections.push({ id: newSectionId, title: 'New Section', tasks: [], isCollapsed: false });
        currentlyFocusedSectionId = newSectionId;
        render();
    });

    const syncScroll = (scrollStates = new Map()) => {
        const scrollWrappers = document.querySelectorAll('.scrollable-columns-wrapper');
        scrollWrappers.forEach((wrapper, i) => {
            if (scrollStates.has(i)) wrapper.scrollLeft = scrollStates.get(i);
            wrapper.addEventListener('scroll', () => {
                scrollWrappers.forEach(other => { if (other !== wrapper) other.scrollLeft = wrapper.scrollLeft; });
            });
        });
    };

    window.addEventListener('click', (e) => {
        if (!e.target.closest('.datepicker, .context-dropdown, [data-control], .dialog-overlay, .delete-column-btn')) {
            closeFloatingPanels();
        }
    });

