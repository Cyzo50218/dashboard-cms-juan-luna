/*
 * @file list.js
 * @description Controls the List View tab with refined section filtering and date sorting.
 */

// --- Firebase Integration Example ---
const PROJECT_ID = 'project_123';

// --- Module-Scoped Variables ---

// DOM Element Holders
let taskListHeaderEl, taskListBody, taskListFooter, addSectionBtn, addTaskHeaderBtn, mainContainer, assigneeDropdownTemplate, filterBtn, sortBtn;

// Event Handler References
let headerClickListener, bodyClickListener, bodyFocusOutListener, addTaskHeaderBtnListener, addSectionBtnListener, windowClickListener, filterBtnListener, sortBtnListener;
let sortableSections;
const sortableTasks = [];

// --- Data ---
let activeFilters = {}; // Will hold { visibleSections: [id1, id2] }
let activeSortState = 'default'; // 'default', 'asc' (oldest), 'desc' (newest)

const allUsers = [
    { id: 1, name: 'Lorelai Gilmore', email: 'lorelai.g@example.com', avatar: 'https://i.imgur.com/k9qRkiG.png' },
    { id: 2, name: 'Rory Gilmore', email: 'rory.g@example.com', avatar: 'https://i.imgur.com/8mR4H4A.png' },
    { id: 3, name: 'Luke Danes', email: 'luke.d@example.com', avatar: 'https://i.imgur.com/wfz43s9.png' },
    { id: 4, name: 'Sookie St. James', email: 'sookie.sj@example.com', avatar: 'https://i.imgur.com/L4DD33f.png' },
    { id: 5, name: 'Paris Geller', email: 'paris.g@example.com', avatar: 'https://i.imgur.com/lVceL5s.png' },
];

let project = {
    customColumns: [{ id: 1, name: 'Budget', type: 'Costing', currency: '$', aggregation: 'Sum' }],
    sections: [
    {
        id: 1,
        title: 'Design',
        tasks: [
            { id: 101, name: 'Create final mockups', dueDate: '2025-06-12', priority: 'High', status: 'On track', assignees: [1, 2], customFields: { 1: 1500 } },
            { id: 102, name: 'Review branding guidelines', dueDate: '2025-06-15', priority: 'Medium', status: 'On track', assignees: [3], customFields: { 1: 850 } },
        ],
        isCollapsed: false
    },
    {
        id: 2,
        title: 'Development',
        tasks: [
            { id: 201, name: 'Initial setup', dueDate: '2025-06-18', priority: 'Low', status: 'At risk', assignees: [], customFields: { 1: 3000 } },
        ],
        isCollapsed: false
    },
    {
        id: 3,
        title: 'Completed',
        tasks: [
            { id: 301, name: 'Kick-off meeting', dueDate: '2025-05-30', priority: 'Medium', status: 'Completed', assignees: [4, 5], customFields: { 1: 500 } },
        ],
        isCollapsed: false
    }, ],
};

let currentlyFocusedSectionId = project.sections.length > 0 ? project.sections[0].id : null;
const priorityOptions = ['High', 'Medium', 'Low'];
const statusOptions = ['On track', 'At risk', 'Off track', 'Completed'];
const columnTypeOptions = ['Text', 'Numbers', 'Costing', 'Custom'];
const baseColumnTypes = ['Text', 'Numbers', 'Costing'];

// --- Main Initialization and Cleanup ---

export function init(params) {
    console.log("Initializing List View Module...", params);
    
    taskListHeaderEl = document.getElementById('task-list-header');
    taskListBody = document.getElementById('task-list-body');
    taskListFooter = document.getElementById('task-list-footer');
    addSectionBtn = document.getElementById('add-section-btn');
    addTaskHeaderBtn = document.querySelector('.add-task-header-btn');
    mainContainer = document.querySelector('.list-view-container');
    assigneeDropdownTemplate = document.getElementById('assignee-dropdown-template');
    filterBtn = document.getElementById('filter-btn');
    sortBtn = document.getElementById('sort-btn');
    
    if (!mainContainer || !taskListBody) {
        console.error("List view could not initialize: Essential containers not found.");
        return () => {};
    }
    
    setupEventListeners();
    render();
    
    return function cleanup() {
        console.log("Cleaning up List View Module...");
        if (headerClickListener) taskListHeaderEl.removeEventListener('click', headerClickListener);
        if (bodyClickListener) taskListBody.removeEventListener('click', bodyClickListener);
        if (bodyFocusOutListener) taskListBody.removeEventListener('focusout', bodyFocusOutListener);
        if (addTaskHeaderBtnListener) addTaskHeaderBtn.removeEventListener('click', addTaskHeaderBtnListener);
        if (addSectionBtnListener) addSectionBtn.removeEventListener('click', addSectionBtnListener);
        if (windowClickListener) window.removeEventListener('click', windowClickListener);
        if (filterBtnListener) filterBtn.removeEventListener('click', filterBtnListener);
        if (sortBtnListener) sortBtn.removeEventListener('click', sortBtnListener);
        
        if (sortableSections) sortableSections.destroy();
        sortableTasks.forEach(st => st.destroy());
        sortableTasks.length = 0;
    };
}

// --- Event Listener Setup ---

function setupEventListeners() {
    headerClickListener = (e) => {
        const deleteButton = e.target.closest('.delete-column-btn');
        if (deleteButton) {
            e.stopPropagation();
            const columnEl = deleteButton.closest('[data-column-id]');
            if (columnEl) {
                const columnId = Number(columnEl.dataset.columnId);
                createDropdown(['Delete column'], deleteButton, () => deleteColumn(columnId));
            }
            return;
        }
        
        const addColumnButton = e.target.closest('#add-column-btn');
        if (addColumnButton) {
            e.stopPropagation();
            const existingTypes = new Set(project.customColumns.map(col => col.type));
            const availableTypes = columnTypeOptions.filter(type => !existingTypes.has(type) || type === 'Custom');
            if (availableTypes.length === 0) return alert("All available column types have been added.");
            createDropdown(availableTypes, addColumnButton, openAddColumnDialog);
        }
    };
    
    bodyClickListener = (e) => {
        const clickedSection = e.target.closest('.task-section');
        if (clickedSection) currentlyFocusedSectionId = Number(clickedSection.dataset.sectionId);
        
        if (e.target.closest('.section-toggle')) {
            const sectionEl = e.target.closest('.task-section');
            const section = project.sections.find(s => s.id == sectionEl.dataset.sectionId);
            if (section) {
                section.isCollapsed = !section.isCollapsed;
                render();
            }
            return;
        }
        
        const addTaskBtn = e.target.closest('.add-task-in-section-btn');
        if (addTaskBtn) {
            const sectionEl = addTaskBtn.closest('.task-section');
            if (sectionEl) {
                const section = project.sections.find(s => s.id == sectionEl.dataset.sectionId);
                if (section) addNewTask(section, 'end');
            }
            return;
        }
        
        const taskRow = e.target.closest('.task-row-wrapper');
        if (!taskRow) return;
        const taskId = Number(taskRow.dataset.taskId);
        
        if (e.target.matches('.task-name')) return displaySideBarTasks(taskId);
        
        const control = e.target.closest('[data-control]');
        if (!control) return;
        
        switch (control.dataset.control) {
            case 'check':
                e.stopPropagation();
                handleTaskCompletion(taskId, taskRow);
                break;
            case 'due-date':
                showDatePicker(control, taskId);
                break;
            case 'priority':
                createDropdown(priorityOptions, control, (v) => updateTask(taskId, { priority: v }));
                break;
            case 'status':
                createDropdown(statusOptions, control, (v) => updateTask(taskId, { status: v }));
                break;
            case 'assignee': { // Using block scope for the `task` constant
                const { task } = findTaskAndSection(taskId);
                // MODIFICATION: Only open the dropdown if NO user is currently assigned.
                if (task && task.assignees.length === 0) {
                    showAssigneeDropdown(control, taskId);
                }
                // If a user is already assigned, clicking the cell does nothing.
                break;
            }
            case 'remove-assignee':
                e.stopPropagation();
                updateTask(taskId, { assignees: [] });
                break;
        }
    };
    
    bodyFocusOutListener = (e) => {
        const taskRow = e.target.closest('.task-row-wrapper');
        if (!taskRow) return;
        const taskId = Number(taskRow.dataset.taskId);
        const { task, section } = findTaskAndSection(taskId);
        if (!task || !section) return;
        
        if (e.target.matches('.task-name')) {
            const newName = e.target.innerText.trim();
            if (task.isNew && newName === '') {
                section.tasks = section.tasks.filter(t => t.id !== taskId);
                render();
                return;
            }
            if (task.isNew) delete task.isNew;
            if (task.name !== newName) updateTask(taskId, { name: newName });
        } else if (e.target.matches('[data-control="custom"]')) {
            const customFieldCell = e.target;
            const columnId = Number(customFieldCell.dataset.columnId);
            const column = project.customColumns.find(c => c.id === columnId);
            let newValue = customFieldCell.innerText;
            if (column && (column.type === 'Costing' || column.type === 'Numbers')) {
                newValue = Number(newValue.replace(/[^0-9.]/g, '')) || 0;
            }
            if (task.customFields[columnId] !== newValue) updateTask(taskId, { customFields: { ...task.customFields, [columnId]: newValue } });
        }
    };
    
    addTaskHeaderBtnListener = () => {
        if (!currentlyFocusedSectionId && project.sections.length > 0) {
            currentlyFocusedSectionId = project.sections[0].id;
        }
        const focusedSection = project.sections.find(s => s.id === currentlyFocusedSectionId);
        if (focusedSection) addNewTask(focusedSection, 'start');
        else alert('Please create a section before adding a task.');
    };
    
    addSectionBtnListener = () => {
        const newSectionId = Date.now();
        project.sections.push({ id: newSectionId, title: 'New Section', tasks: [], isCollapsed: false });
        currentlyFocusedSectionId = newSectionId;
        render();
    };
    
    // This is the corrected version:
    windowClickListener = (e) => {
        // We add #filter-btn AND the dialog's own class to the list of elements that should NOT close the panels.
        if (!e.target.closest('.datepicker, .context-dropdown, [data-control], .dialog-overlay, .delete-column-btn, #add-column-btn, #filter-btn, .filterlistview-dialog-overlay')) {
            closeFloatingPanels();
        }
    };
    
    filterBtnListener = () => {
        // DEBUG: Confirm the listener is firing
        console.log("Filter button clicked. Opening section filter panel...");
        openSectionFilterPanel();
    }
    
    sortBtnListener = () => {
        if (activeSortState === 'default') {
            activeSortState = 'asc'; // asc = Oldest first
        } else if (activeSortState === 'asc') {
            activeSortState = 'desc'; // desc = Newest first
        } else {
            activeSortState = 'default';
        }
        render();
    };
    
    // Attach all listeners
    taskListHeaderEl.addEventListener('click', headerClickListener);
    taskListBody.addEventListener('click', bodyClickListener);
    taskListBody.addEventListener('focusout', bodyFocusOutListener);
    addTaskHeaderBtn.addEventListener('click', addTaskHeaderBtnListener);
    addSectionBtn.addEventListener('click', addSectionBtnListener);
    window.addEventListener('click', windowClickListener);
    if (filterBtn) filterBtn.addEventListener('click', filterBtnListener);
    if (sortBtn) sortBtn.addEventListener('click', sortBtnListener);
}

// --- Core Logic & UI Functions ---

function openSectionFilterPanel() {
    closeFloatingPanels();
    const dialogOverlay = document.createElement('div');
    // MODIFIED: Changed class name
    dialogOverlay.className = 'filterlistview-dialog-overlay';
    
    const sectionOptionsHTML = project.sections.map(s => {
        const isChecked = !activeFilters.visibleSections || activeFilters.visibleSections.includes(s.id);
        // MODIFIED: Changed class name for checkboxes
        return `<div><label><input type="checkbox" class="filterlistview-section-checkbox" name="section" value="${s.id}" ${isChecked ? 'checked' : ''}> ${s.title}</label></div>`;
    }).join('');
    
    const allChecked = !activeFilters.visibleSections;
    
    // MODIFIED: Changed all class names within the HTML string
    dialogOverlay.innerHTML = `
    <div class="filterlistview-dialog-box filterlistview-filter-dialog">
        <div class="filterlistview-dialog-header">Filter by Section</div>
            <div class="filterlistview-dialog-body">
                <fieldset>
                    <legend>Sections</legend>
                    <div><label><input type="checkbox" id="select-all-sections" ${allChecked ? 'checked' : ''}> <strong>Select All</strong></label></div>
                    <hr>
                <div class="filterlistview-section-checkbox-list">${sectionOptionsHTML}</div>
            </fieldset>
            </div>
            <div class="filterlistview-dialog-footer">
                <button class="filterlistview-dialog-button filterlistview-primary" id="apply-filters-btn">Apply</button>
            </div>
        </div>`;
    
    document.body.appendChild(dialogOverlay);
    
    const applyBtn = dialogOverlay.querySelector('#apply-filters-btn');
    const selectAllBox = dialogOverlay.querySelector('#select-all-sections');
    // MODIFIED: Changed selector to match new class name
    const allSectionBoxes = dialogOverlay.querySelectorAll('.filterlistview-section-checkbox');
    
    selectAllBox.addEventListener('change', (e) => {
        allSectionBoxes.forEach(box => box.checked = e.target.checked);
    });
    
    applyBtn.addEventListener('click', () => {
        const checkedBoxes = Array.from(allSectionBoxes).filter(box => box.checked);
        
        if (checkedBoxes.length === allSectionBoxes.length) {
            delete activeFilters.visibleSections;
        } else {
            activeFilters.visibleSections = checkedBoxes.map(box => Number(box.value));
        }
        
        closeFloatingPanels();
        render();
    });
    
    // MODIFIED: Changed selector to match new class name
    dialogOverlay.addEventListener('click', e => {
        if (e.target.classList.contains('filterlistview-dialog-overlay')) {
            closeFloatingPanels();
        }
    });
    
}

function getFilteredProject() {
    // DEBUG: See what filters are being applied at the start of the render cycle
    // console.log("getFilteredProject called with state:", JSON.stringify(activeFilters));
    const projectCopy = JSON.parse(JSON.stringify(project));
    
    if (activeFilters.visibleSections && activeFilters.visibleSections.length < project.sections.length) {
        projectCopy.sections = projectCopy.sections.filter(section =>
            activeFilters.visibleSections.includes(section.id)
        );
    }
    
    return projectCopy;
}

function getSortedProject(data) {
    if (activeSortState === 'default') return data;
    
    const direction = activeSortState === 'asc' ? 1 : -1;
    
    data.sections.forEach(section => {
        section.tasks.sort((a, b) => {
            const valA = a.dueDate ? new Date(a.dueDate) : 0;
            const valB = b.dueDate ? new Date(b.dueDate) : 0;
            
            if (!valA && !valB) return 0;
            if (!valA) return 1 * direction;
            if (!valB) return -1 * direction;
            
            return (valA - valB) * direction;
        });
    });
    
    return data;
}

function closeFloatingPanels() {
    document.querySelectorAll('.context-dropdown, .datepicker, .dialog-overlay, .filterlistview-dialog-overlay').forEach(p => p.remove());
}

function findTaskAndSection(taskId) {
    for (const section of project.sections) {
        const task = section.tasks.find(t => t.id === taskId);
        if (task) return { task, section };
    }
    return { task: null, section: null };
}

function render() {
    const scrollStates = new Map();
    document.querySelectorAll('.scrollable-columns-wrapper').forEach((el, i) => scrollStates.set(i, el.scrollLeft));
    
    closeFloatingPanels();
    
    let projectToRender = getFilteredProject();
    projectToRender = getSortedProject(projectToRender);
    
    renderHeader(projectToRender);
    renderBody(projectToRender);
    renderFooter(projectToRender);
    syncScroll(scrollStates);
    
    const isSortActive = activeSortState !== 'default';
    
    if (activeSortState === 'asc') {
        sortBtn.innerHTML = `<i class="fas fa-sort-amount-up-alt"></i> Oldest`;
    } else if (activeSortState === 'desc') {
        sortBtn.innerHTML = `<i class="fas fa-sort-amount-down-alt"></i> Newest`;
    } else {
        sortBtn.innerHTML = `<i class="fas fa-sort"></i> Sort`;
    }
    
    if (sortableSections) sortableSections.destroy();
    sortableSections = new Sortable(taskListBody, { handle: '.section-header-list .drag-handle', animation: 150, disabled: isSortActive });
    
    sortableTasks.forEach(st => st.destroy());
    sortableTasks.length = 0;
    document.querySelectorAll('.tasks-container').forEach(container => {
        sortableTasks.push(new Sortable(container, { group: 'tasks', handle: '.fixed-column .drag-handle', animation: 150, disabled: isSortActive }));
    });
    
    filterBtn?.classList.toggle('active', !!activeFilters.visibleSections);
    sortBtn?.classList.toggle('active', isSortActive);
}

function renderHeader(projectToRender) {
    if (!taskListHeaderEl) return;
    const container = taskListHeaderEl.querySelector('#header-scroll-cols');
    if (!container) return;
    
    container.querySelectorAll('.header-custom').forEach(el => el.remove());
    const addColBtnContainer = container.querySelector('.add-column-container');
    
    projectToRender.customColumns.forEach(col => {
        const colEl = document.createElement('div');
        colEl.className = 'task-col header-custom';
        colEl.dataset.columnId = col.id;
        colEl.textContent = col.name;
        const menuBtn = document.createElement('button');
        menuBtn.className = 'delete-column-btn';
        menuBtn.title = 'Column options';
        menuBtn.innerHTML = `<i class="fas fa-ellipsis-h"></i>`;
        colEl.appendChild(menuBtn);
        if (addColBtnContainer) container.insertBefore(colEl, addColBtnContainer);
    });
}

function renderBody(projectToRender) {
    if (!taskListBody) return;
    taskListBody.innerHTML = '';
    
    projectToRender.sections.forEach(section => {
        const sectionElement = createSection(section, projectToRender.customColumns);
        if (sectionElement) taskListBody.appendChild(sectionElement);
    });
    
    if (projectToRender.sections.length === 0) {
        const noResultsEl = document.createElement('div');
        noResultsEl.className = 'no-results-message';
        noResultsEl.textContent = 'No sections match your current filter.';
        taskListBody.appendChild(noResultsEl);
    }
}

function renderFooter(projectToRender) {
    if (!taskListFooter) return;
    
    let hasAggregatableColumn = projectToRender.customColumns.some(c => c.aggregation);
    if (!hasAggregatableColumn) {
        taskListFooter.innerHTML = '';
        taskListFooter.style.display = 'none';
        return;
    }
    let customColsHTML = '';
    
    projectToRender.customColumns.forEach(col => {
        let displayValue = '';
        if (col.aggregation === 'Sum') {
            let total = projectToRender.sections.reduce((sum, section) => sum + section.tasks.reduce((secSum, task) => secSum + Number(task.customFields[col.id] || 0), 0), 0);
            displayValue = col.type === 'Costing' ? `${col.currency || '$'}${total.toLocaleString()}` : total.toLocaleString();
        }
        customColsHTML += `<div class="task-col header-custom">${displayValue}</div>`;
    });
    taskListFooter.innerHTML = `<div class="fixed-column"></div><div class="scrollable-columns-wrapper"><div class="scrollable-columns"><div class="task-col header-assignee"></div><div class="task-col header-due-date"></div><div class="task-col header-priority"></div><div class="task-col header-status"></div>${customColsHTML}</div></div>`;
    taskListFooter.style.display = 'flex';
}

function createSection(sectionData, customColumns) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'task-section';
    sectionEl.dataset.sectionId = sectionData.id;
    sectionEl.innerHTML = `<div class="section-header-list"><i class="fas fa-grip-vertical drag-handle"></i><i class="fas fa-chevron-down section-toggle ${sectionData.isCollapsed ? 'collapsed' : ''}"></i><span class="section-title" contenteditable="true">${sectionData.title}</span></div><div class="tasks-container ${sectionData.isCollapsed ? 'hidden' : ''}"></div><button class="add-task-in-section-btn"><i class="fas fa-plus"></i> Add task</button>`;
    
    const tasksContainer = sectionEl.querySelector('.tasks-container');
    if (sectionData.tasks && tasksContainer) {
        sectionData.tasks.forEach(task => tasksContainer.appendChild(createTaskRow(task, customColumns)));
    }
    return sectionEl;
}

function createTaskRow(task, customColumns) {
    const rowWrapper = document.createElement('div');
    rowWrapper.className = `task-row-wrapper ${task.status === 'Completed' ? 'is-completed' : ''}`;
    rowWrapper.dataset.taskId = task.id;
    
    const displayName = task.name;
    const displayDate = task.dueDate ? new Date(task.dueDate.replace(/-/g, '/')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '<span class="add-due-date">+ Add date</span>';
    
    let customFieldsHTML = '';
    customColumns.forEach(col => {
        const value = task.customFields[col.id] || '';
        const displayValue = col.type === 'Costing' && value ? `${col.currency || '$'}${value}` : value;
        customFieldsHTML += `<div class="task-col header-custom" data-control="custom" data-column-id="${col.id}" contenteditable="true">${displayValue}</div>`;
    });
    
    rowWrapper.innerHTML = `<div class="fixed-column"><i class="fas fa-grip-vertical drag-handle"></i><i class="far fa-check-circle" data-control="check"></i><span class="task-name" contenteditable="true" data-placeholder="Add task name">${displayName}</span></div><div class="scrollable-columns-wrapper"><div class="scrollable-columns"><div class="task-col header-assignee" data-control="assignee">${createAssigneeHTML(task.assignees)}</div><div class="task-col header-due-date" data-control="due-date">${displayDate}</div><div class="task-col header-priority" data-control="priority">${createPriorityTag(task.priority)}</div><div class="task-col header-status" data-control="status">${createStatusTag(task.status)}</div>${customFieldsHTML}</div></div>`;
    return rowWrapper;
}

function displaySideBarTasks(taskId) {
    console.log(`Task name clicked. Opening sidebar for task ID: ${taskId}`);
    if (window.TaskSidebar) {
        window.TaskSidebar.open(taskId);
    } else {
        console.error("TaskSidebar module is not available.");
    }
}

function updateTask(taskId, newProperties) {
    const { task } = findTaskAndSection(taskId);
    if (task) {
        Object.assign(task, newProperties);
        updateTaskInFirebase(taskId, newProperties);
        render();
    }
}

async function updateTaskInFirebase(taskId, propertiesToUpdate) {
    console.log(`Updating task ${taskId} in Firebase with:`, propertiesToUpdate);
}

async function addTaskToFirebase(sectionId, taskData) {
    console.log(`Adding new task to section ${sectionId} in Firebase:`, taskData);
}

function handleTaskCompletion(taskId, taskRowEl) {
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
        updateTaskInFirebase(taskId, { status: 'Completed', sectionId: completedSection.id });
        render();
    }, 400);
}

function addNewTask(section, position = 'end') {
    const newTask = { id: Date.now(), name: '', dueDate: '', priority: 'Low', status: 'On track', assignees: [], customFields: {}, isNew: true };
    
    if (position === 'start') {
        section.tasks.unshift(newTask);
    } else {
        section.tasks.push(newTask);
    }
    
    addTaskToFirebase(section.id, newTask);
    
    if (section.isCollapsed) section.isCollapsed = false;
    
    render();
    
    const newTaskEl = taskListBody.querySelector(`.task-row-wrapper[data-task-id="${newTask.id}"] .task-name`);
    if (newTaskEl) {
        newTaskEl.focus();
    }
}

function createTag(text, type, pClass) { return `<div class="${type}-tag ${pClass}">${text}</div>`; }

function createPriorityTag(p) { return createTag(p, 'priority', `priority-${p}`); }

function createStatusTag(s) { return createTag(s, 'status', `status-${s.replace(/\s+/g, '-')}`); }

function createDropdown(options, targetEl, callback) {
    if (!targetEl) return console.error("createDropdown was called with a null target element.");
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
}

function showAssigneeDropdown(targetEl, taskId) {
    closeFloatingPanels();
    
    const { task } = findTaskAndSection(taskId);
    if (!task) return;
    
    // Clone the dropdown structure from the HTML template
    const dropdownFragment = assigneeDropdownTemplate.content.cloneNode(true);
    const dropdown = dropdownFragment.querySelector('.context-dropdown');
    
    const searchInput = dropdown.querySelector('.dropdown-search-input');
    const listContainer = dropdown.querySelector('.dropdown-list');
    
    // Position the dropdown panel below the clicked element
    const wrapperRect = mainContainer.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    dropdown.style.top = `${targetRect.bottom - wrapperRect.top}px`;
    dropdown.style.left = `${targetRect.left - wrapperRect.left}px`;
    
    const renderList = (searchTerm = '') => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const filteredUsers = allUsers.filter(user => user.name.toLowerCase().includes(lowerCaseSearchTerm));
        
        listContainer.innerHTML = ''; // Clear previous results
        
        filteredUsers.forEach(user => {
            // Since we only allow one assignee, check if the user is the first one in the array
            const isAssigned = task.assignees[0] === user.id;
            
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.innerHTML = `
             <div class="user-info">
                <div class="profile-picture" style="background-image: url(${user.avatar})"></div>
                    <span>${user.name}</span>
                </div>
               ${isAssigned ? '<i class="fas fa-check assigned-check"></i>' : ''}
            `;
            
            item.addEventListener('click', () => {
                // If the user is already assigned, unassign them. Otherwise, assign them.
                const newAssignees = isAssigned ? [] : [user.id];
                updateTask(taskId, { assignees: newAssignees });
                // The updateTask function will automatically call render(), which closes the dropdown.
            });
            listContainer.appendChild(item);
        });
    };
    
    // Render the initial list of users
    renderList();
    
    // Add an event listener for the search input
    searchInput.addEventListener('input', () => {
        renderList(searchInput.value);
    });
    
    mainContainer.appendChild(dropdown);
    searchInput.focus();
}

function showDatePicker(targetEl, taskId) {
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
        format: 'yyyy-mm-dd',
        todayHighlight: true,
    });
    
    const { task } = findTaskAndSection(taskId);
    if (task && task.dueDate) {
        datepicker.setDate(task.dueDate);
    }
    
    datepickerContainer.addEventListener('changeDate', (e) => {
        const formattedDate = Datepicker.formatDate(e.detail.date, 'yyyy-mm-dd');
        updateTask(taskId, { dueDate: formattedDate });
        closeFloatingPanels();
    }, { once: true });
}

function createAssigneeHTML(assignees) {
    // If no one is assigned, show the 'add' button.
    if (!assignees || assignees.length === 0) {
        return `<div class="add-assignee-btn" data-control="assignee"><i class="fas fa-plus"></i></div>`;
    }
    
    // Since we only have one assignee, get the first ID.
    const assigneeId = assignees[0];
    const user = allUsers.find(u => u.id === assigneeId);
    
    if (!user) {
        // Fallback in case user is not found
        return `<div class="add-assignee-btn" data-control="assignee"><i class="fas fa-plus"></i></div>`;
    }
    
    return `
        <div class="assignee-cell-content" data-control="assignee">
            <img class="profile-picture" src="${user.avatar}" title="${user.name}">
            <div class="assignee-details">
                <span class="assignee-name">${user.name}</span>
            </div>
            <button class="remove-assignee-btn" data-control="remove-assignee" title="Remove Assignee">&times;</button>
        </div>
    `;
}

function syncScroll(scrollStates = new Map()) {
    const scrollWrappers = document.querySelectorAll('.scrollable-columns-wrapper');
    let isScrolling = false;
    const onScroll = (e) => {
        if (!isScrolling) {
            window.requestAnimationFrame(() => {
                scrollWrappers.forEach(other => {
                    if (other !== e.target) {
                        other.scrollLeft = e.target.scrollLeft;
                    }
                });
                isScrolling = false;
            });
        }
        isScrolling = true;
    };
    scrollWrappers.forEach((wrapper, i) => {
        if (scrollStates.has(i)) wrapper.scrollLeft = scrollStates.get(i);
        wrapper.addEventListener('scroll', onScroll);
    });
}

function addNewColumn(config) {
    const newColumn = {
        id: Date.now(),
        name: config.name,
        type: config.type,
        currency: config.currency || null,
        aggregation: (config.type === 'Costing' || config.type === 'Numbers') ? 'Sum' : null,
    };
    project.customColumns.push(newColumn);
    render();
}

function deleteColumn(columnId) {
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
}

function openAddColumnDialog(columnType) {
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
    dialogOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) closeFloatingPanels(); });
}

function openCustomColumnCreatorDialog() {
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
    
    dialogOverlay.addEventListener('click', e => { if (e.target === e.currentTarget) closeFloatingPanels(); });
}