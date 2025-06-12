
    // --- Data ---
    const allUsers = [
        { id: 1, name: 'Lorelai Gilmore', avatar: 'https://i.imgur.com/k9qRkiG.png' },
        { id: 2, name: 'Rory Gilmore', avatar: 'https://i.imgur.com/8mR4H4A.png' },
        { id: 3, name: 'Luke Danes', avatar: 'https://i.imgur.com/wfz43s9.png' },
        { id: 4, name: 'Sookie St. James', avatar: 'https://i.imgur.com/L4DD33f.png' },
        { id: 5, name: 'Paris Geller', avatar: 'https://i.imgur.com/lVceL5s.png' },
    ];

    let project = {
        sections: [
            { id: 1, title: 'Design', tasks: [
                { id: 101, name: 'Create final mockups', dueDate: '2025-06-12', priority: 'High', status: 'On track', assignees: [1, 2], isLiked: false, imageUrl: 'data:image/jpeg;base64,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' },
                { id: 102, name: 'Review branding guidelines', dueDate: '2025-06-13', priority: 'Medium', status: 'On track', assignees: [3], isLiked: true, imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSCBN_3HpX84rT_2zUN2PH8I8VJ1pXMoV7sL_RmGTeTs-s4wy5czMtu5OY&s=10' },
            ], isCollapsed: false },
            { id: 2, title: 'Development', tasks: [
                { id: 201, name: 'Initial setup', dueDate: '2025-06-18', priority: 'Low', status: 'At risk', assignees: [], isLiked: false },
            ], isCollapsed: false },
            { id: 3, title: 'Completed', tasks: [
                { id: 301, name: 'Kick-off meeting', dueDate: '2025-05-30', priority: 'Completed', assignees: [4, 5], isLiked: false },
            ], isCollapsed: false },
        ],
    };

    let currentlyFocusedSectionId = project.sections.length > 0 ? project.sections[0].id : null;

    // --- DOM Elements ---
    const kanbanBoard = document.getElementById('boardtasks-kanbanBoard');
    const addSectionBtn = document.getElementById('boardtasks-add-section-btn');
    const addTaskMainBtn = document.querySelector('.boardtasks-add-task-btn-main');
    const toolsBtn = document.getElementById('boardtasks-tools-btn');
    const toolsPanel = document.getElementById('boardtasks-tools-panel');
    const filterInput = document.getElementById('boardtasks-filter-input');

    // --- RENDER FUNCTIONS ---

    const formatDueDate = (dueDateString) => {
        const today = new Date('2025-06-12T00:00:00');
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const dueDate = new Date(dueDateString + 'T00:00:00');

        today.setHours(0, 0, 0, 0);
        tomorrow.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);

        if (dueDate.getTime() === today.getTime()) return 'Today';
        if (dueDate.getTime() === tomorrow.getTime()) return 'Tomorrow';
        return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const renderTask = (task) => {
        const assigneesHTML = task.assignees.map(assigneeId => {
            const user = allUsers.find(u => u.id === assigneeId);
            return user ? `<img src="${user.avatar}" alt="${user.name}" class="boardtasks-assignee-avatar" title="${user.name}">` : '';
        }).join('');

        const isCompleted = task.status === 'Completed';
        const checkIconClass = isCompleted ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle';
        const cardCompletedClass = isCompleted ? 'boardtasks-task-checked' : '';
        const likedClass = task.isLiked ? 'liked' : '';
        const imageHTML = task.imageUrl ? `<img src="${task.imageUrl}" class="boardtasks-task-attachment">` : '';
        const statusClass = (task.status || '').replace(/\s+/g, '.');
        const statusText = task.status || 'No Status';
        const formattedDueDate = formatDueDate(task.dueDate);

        return `
            <div class="boardtasks-task-card ${cardCompletedClass}" id="task-${task.id}" draggable="true">
                ${imageHTML}
                <div class="boardtasks-task-content">
                    <div class="boardtasks-task-header">
                        <span class="boardtasks-task-check"><i class="${checkIconClass}"></i></span>
                        <div class="boardtasks-task-assignees">${assigneesHTML}</div>
                        <p contenteditable="true" class="boardtasks-task-name-editable">${task.name}</p>
                    </div>
                    <div class="boardtasks-task-tags">
                        <span class="boardtasks-tag boardtasks-priority-${task.priority}">${task.priority}</span>
                        <span class="boardtasks-tag boardtasks-status-${statusClass}">${statusText}</span>
                    </div>
                    <div class="boardtasks-task-footer">
                        <span class="boardtasks-due-date" data-due-date="${task.dueDate}">${formattedDueDate}</span>
                        <div class="boardtasks-task-actions">
                            <i class="fa-regular fa-heart ${likedClass}"></i>
                            <i class="fa-regular fa-comment"></i>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderColumn = (section) => {
        const columnEl = document.createElement('div');
        columnEl.className = 'boardtasks-kanban-column';
        columnEl.dataset.sectionId = section.id;
        const tasksHTML = section.tasks.map(renderTask).join('');
        columnEl.innerHTML = `
            <div class="boardtasks-column-header">
                <h3 contenteditable="true" class="boardtasks-section-title-editable">${section.title}</h3>
                <span class="boardtasks-task-count">${section.tasks.length}</span>
            </div>
            <div class="boardtasks-tasks-container">
                ${tasksHTML}
            </div>
            <button class="boardtasks-add-task-btn"><i class="fas fa-plus"></i> Add task</button>
        `;
        kanbanBoard.appendChild(columnEl);
    };

    const renderBoard = () => {
        const scrollLeft = kanbanBoard.scrollLeft;
        kanbanBoard.innerHTML = '';
        project.sections.forEach(renderColumn);
        checkDueDates();
        initSortable();
        updateTaskCounts();
        kanbanBoard.scrollLeft = scrollLeft;
    };

    // --- DATA & STATE MANAGEMENT ---

    const findTask = (taskId) => {
        for (const section of project.sections) {
            const task = section.tasks.find(t => t.id === taskId);
            if (task) return { task, section };
        }
        return null;
    };
    
    const findSection = (sectionId) => {
        return project.sections.find(s => s.id === sectionId);
    };

    const addNewSection = () => {
        const newSection = {
            id: Date.now(),
            title: 'New Section',
            tasks: [],
            isCollapsed: false
        };
        project.sections.push(newSection);
        renderBoard();
    };

    const addNewTask = (sectionId) => {
        const section = findSection(sectionId);
        if (!section) return;

        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 7);

        const newTask = {
            id: Date.now(),
            name: 'New Task',
            dueDate: futureDate.toISOString().split('T')[0],
            priority: 'Medium',
            status: 'On track',
            assignees: [],
            isLiked: false
        };
        section.tasks.push(newTask);
        renderBoard();

        // Focus the new task for editing
        const newTaskEl = document.getElementById(`task-${newTask.id}`);
        if (newTaskEl) {
            const p = newTaskEl.querySelector('p');
            p.focus();
            document.execCommand('selectAll', false, null); // Selects the text
            newTaskEl.classList.add('boardtasks-task-is-new'); // Flag as new
        }
    };

    const updateTaskCounts = () => {
        document.querySelectorAll('.boardtasks-kanban-column').forEach(column => {
            const taskCountEl = column.querySelector('.boardtasks-task-count');
            const visibleTasks = column.querySelectorAll('.boardtasks-task-card:not([style*="display: none"])').length;
            if (taskCountEl) taskCountEl.textContent = visibleTasks;
        });
    };

    // --- HELPERS ---
    
    const checkDueDates = () => {
        const today = new Date('2025-06-12T00:00:00');
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        today.setHours(0,0,0,0);
        tomorrow.setHours(0,0,0,0);

        document.querySelectorAll('.boardtasks-due-date').forEach(el => {
            const dueDate = new Date(el.dataset.dueDate + 'T00:00:00');
            dueDate.setHours(0,0,0,0);
            
            el.classList.remove('boardtasks-date-overdue', 'boardtasks-date-near');

            if (dueDate < today) {
                el.classList.add('boardtasks-date-overdue');
            } else if (dueDate.getTime() === tomorrow.getTime()) {
                el.classList.add('boardtasks-date-near');
            }
        });
    };

    // --- TOOLS: FILTER & SORT ---

    toolsBtn.addEventListener('click', () => toolsPanel.classList.toggle('boardtasks-hidden'));

    filterInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        document.querySelectorAll('.boardtasks-task-card').forEach(card => {
            const taskText = card.querySelector('.boardtasks-task-name-editable').textContent.toLowerCase();
            card.style.display = taskText.includes(searchTerm) ? '' : 'none';
        });
        updateTaskCounts();
    });

    const sortColumns = (asc) => {
        project.sections.sort((a, b) => asc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title));
        renderBoard();
    };

    const sortTasksInAllColumns = (asc) => {
        project.sections.forEach(section => {
            section.tasks.sort((a, b) => asc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
        });
        renderBoard();
    };
    
    function displaySideBarTasks(taskId) {
    console.log(`Task name clicked. Opening sidebar for task ID: ${taskId}`);
    
    
    if (window.TaskSidebar) {
        window.TaskSidebar.open(taskId);
    } else {
        console.error("TaskSidebar module is not available.");
    }
}
    
    document.getElementById('boardtasks-sort-sections-az').addEventListener('click', () => sortColumns(true));
    document.getElementById('boardtasks-sort-sections-za').addEventListener('click', () => sortColumns(false));
    document.getElementById('boardtasks-sort-tasks-az').addEventListener('click', () => sortTasksInAllColumns(true));
    document.getElementById('boardtasks-sort-tasks-za').addEventListener('click', () => sortTasksInAllColumns(false));

    // --- EVENT LISTENERS ---

    addSectionBtn.addEventListener('click', addNewSection);
    
    addTaskMainBtn.addEventListener('click', () => {
        if (currentlyFocusedSectionId) {
            addNewTask(currentlyFocusedSectionId);
        } else if (project.sections.length > 0) {
            addNewTask(project.sections[project.sections.length - 1].id);
        } else {
            alert("Please add a section first!");
        }
    });

    kanbanBoard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.isContentEditable) {
            e.preventDefault();
            e.target.blur();
        }
    });

    kanbanBoard.addEventListener('blur', (e) => {
        const target = e.target;
        if (target.isContentEditable) {
            const newName = target.textContent.trim();
            const sectionId = parseInt(target.closest('.boardtasks-kanban-column').dataset.sectionId);
const section = findSection(sectionId);

            if (target.classList.contains('boardtasks-section-title-editable')) {
                
                if (section && section.title !== newName) {
                    section.title = newName;
                }
            } else if (target.classList.contains('boardtasks-task-name-editable')) {
                const taskCard = target.closest('.boardtasks-task-card');
                const taskId = parseInt(taskCard.id.replace('task-', ''));
                const { task } = findTask(taskId);

                if (taskCard.classList.contains('boardtasks-task-is-new') && (newName === 'New Task' || newName === '')) {
    // Find the task in the data model and remove it
    const taskIndex = section.tasks.findIndex(t => t.id === taskId);
    if (taskIndex > -1) {
        section.tasks.splice(taskIndex, 1);
    }
    renderBoard(); // Re-render the board to reflect the deletion
    return; // Stop further execution
}
                
                if (task && task.name !== newName) {
                    task.name = newName;
                }
                taskCard.classList.remove('boardtasks-task-is-new');
            }
        }
    }, true);

    kanbanBoard.addEventListener('click', (e) => {
        const target = e.target;
        
        const column = target.closest('.boardtasks-kanban-column');
        if (column) {
            currentlyFocusedSectionId = parseInt(column.dataset.sectionId);
        }

        if(target.closest('.boardtasks-add-task-btn')) {
            addNewTask(currentlyFocusedSectionId);
            return;
        }
        
        const taskCard = target.closest('.boardtasks-task-card');
        if (!taskCard) return;

        const taskId = parseInt(taskCard.id.replace('task-', ''));
        const { task } = findTask(taskId);

        if (target.classList.contains('fa-heart')) {
            task.isLiked = !task.isLiked;
            target.classList.toggle('liked');
            return;
        }

        if (target.closest('.boardtasks-task-check')) {
            const taskName = task.name.trim();
            if (task.status !== 'Completed' && (taskName === 'New Task' || taskName === '')) {
                alert('Please enter a task name before marking it as complete.');
                return;
            }
            task.status = task.status === 'Completed' ? 'On track' : 'Completed';
            renderBoard();
            return;
        }
        
        if (target.closest('.boardtasks-task-actions') || target.isContentEditable) return;
displaySideBarTasks(taskId);
    });

    // --- SORTABLE JS ---
    const initSortable = () => {
        // Sort columns
        new Sortable(kanbanBoard, {
            group: 'columns', animation: 150, handle: '.boardtasks-column-header', ghostClass: 'boardtasks-column-ghost',
            onEnd: function (evt) {
                const movedSection = project.sections.splice(evt.oldIndex, 1)[0];
                project.sections.splice(evt.newIndex, 0, movedSection);
            }
        });

        // Sort tasks
        document.querySelectorAll('.boardtasks-tasks-container').forEach(container => {
            new Sortable(container, {
                group: 'tasks', animation: 150, ghostClass: 'boardtasks-task-ghost',
                onEnd: function (evt) {
                    const oldColumnEl = evt.from.closest('.boardtasks-kanban-column');
                    const newColumnEl = evt.to.closest('.boardtasks-kanban-column');
                    const taskId = parseInt(evt.item.id.replace('task-', ''));
                    
                    const oldSectionId = parseInt(oldColumnEl.dataset.sectionId);
                    const newSectionId = parseInt(newColumnEl.dataset.sectionId);

                    const { task, section: oldSection } = findTask(taskId);
                    const newSection = findSection(newSectionId);
                    
                    const taskIndex = oldSection.tasks.findIndex(t => t.id === taskId);
                    oldSection.tasks.splice(taskIndex, 1);
                    
                    newSection.tasks.splice(evt.newIndex, 0, task);
                    
                    updateTaskCounts();
                }
            });
        });
    };

    // --- INITIALIZATION ---
    renderBoard();