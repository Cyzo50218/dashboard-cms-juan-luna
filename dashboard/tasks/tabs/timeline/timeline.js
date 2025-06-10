  // --- DOM Elements ---
    const timelineBody = document.querySelector('.timeline-body');
    const timelineGrid = document.querySelector('.timeline-grid');
    const timelineWeeksContainer = document.querySelector('.timeline-weeks');
    const timelineGridLinesContainer = document.querySelector('.timeline-grid-lines');
    const timelineTasksOverlay = document.querySelector('.timeline-tasks-overlay');
    const sectionsContainer = document.querySelector('.timeline-sections');
    const addSectionBtn = document.querySelector('.add-section-btn');
    const addTaskBtn = document.querySelector('.add-task-btn');
    const prevBtn = document.querySelector('.date-nav .arrow-btn:first-child');
    const currentMonthDisplay = document.querySelector('.date-nav span');
    const nextBtn = document.querySelector('.date-nav .arrow-btn:last-child');
    const zoomInBtn = document.querySelector('.zoom-controls .zoom-in-btn');
    const zoomOutBtn = document.querySelector('.zoom-controls .zoom-out-btn');
    const dropIndicator = document.querySelector('.drop-indicator');
    const resizeTooltip = document.getElementById('resize-tooltip');

    // --- Constants & Data ---
    const TASK_HEIGHT_PX = 45, SECTION_HEADER_HEIGHT_PX = 44, SECTION_CONTENT_PADDING_TOP_PX = 15;
    const zoomLevels = { month: { unitWidth: 35, labelFormat: { month: 'long', year: 'numeric' } }, week: { unitWidth: 140, labelFormat: { month: 'short', day: 'numeric', year: 'numeric' } }, day: { unitWidth: 80, labelFormat: { weekday: 'short', month: 'short', day: 'numeric' } } };
    const zoomHierarchy = ['day', 'week', 'month'];

    let project = {
        customColumns: [ { id: 1, name: 'Budget', type: 'Costing', currency: '$', aggregation: 'Sum' } ],
        sections: [
            { id: 1, title: 'Design', tasks: [
                { id: 101, name: 'Create final mockups', dueDate: '2025-06-12', priority: 'High', status: 'On track', assignees: [1, 2], customFields: { 1: 1500 }, completed: false },
                { id: 102, name: 'Review branding guidelines', dueDate: '2025-06-15', priority: 'Medium', status: 'On track', assignees: [3], customFields: { 1: 850 }, completed: false },
            ], isCollapsed: false },
            { id: 2, title: 'Development', tasks: [
                { id: 201, name: 'Initial setup', dueDate: '2025-06-18', priority: 'Low', status: 'At risk', assignees: [], customFields: { 1: 3000 }, completed: false },
            ], isCollapsed: false },
            { id: 3, title: 'Completed', tasks: [
                { id: 301, name: 'Kick-off meeting', dueDate: '2025-05-30', priority: 'Completed', assignees: [4, 5], customFields: { 1: 500 }, completed: true },
            ], isCollapsed: true },
        ],
    };

    const allUsers = [
        { id: 1, name: 'Alice', avatar: 'https://i.pravatar.cc/150?img=1' },
        { id: 2, name: 'Bob', avatar: 'https://i.pravatar.cc/150?img=2' },
        { id: 3, name: 'Charlie', avatar: 'https://i.pravatar.cc/150?img=3' },
        { id: 4, name: 'David', avatar: 'https://i.pravatar.cc/150?img=4' },
        { id: 5, name: 'Eve', avatar: 'https://i.pravatar.cc/150?img=5' },
    ];

    let state = { zoomLevel: 'month', timelineStartDate: new Date(), draggedTaskInfo: null, resizeInfo: null, draggedSectionInfo: null, panInfo: null };
    
    // --- Data Utility Functions ---
    const getTaskAndSection = (taskId) => {
        const idToFind = parseInt(taskId, 10);
        for (const section of project.sections) {
            const task = section.tasks.find(t => t.id === idToFind);
            if (task) return { task, section };
        }
        return { task: null, section: null };
    };
    
    const getAllTasks = () => project.sections.flatMap(section => section.tasks.map(task => ({ ...task, sectionId: section.id })));

    const toggleTaskCompletion = (taskId) => {
        const { task } = getTaskAndSection(taskId);
        if (task) {
            task.completed = !task.completed;
            task.status = task.completed ? 'Completed' : 'On track'; // Also update status
            renderAll();
        }
    };
    
    function displaySideBarTasks(taskId) {
        console.log(`Task name clicked. Opening sidebar for task ID: ${taskId}`);
        if (window.TaskSidebar) {
            window.TaskSidebar.open(parseInt(taskId, 10));
        } else {
            console.error("TaskSidebar module is not available.");
        }
    }

    // --- Main Rendering Functions ---
    const renderAll = () => { updateZoomButtons(); renderSections(); renderTimeline(); };

    const renderTimeline = () => { const { start, end } = getTimelineBoundaries(state.timelineStartDate, state.zoomLevel); currentMonthDisplay.textContent = new Intl.DateTimeFormat('en-US', zoomLevels[state.zoomLevel].labelFormat).format(state.timelineStartDate); renderTimelineHeader(start, end, state.zoomLevel); renderTimelineGridAndTasks(start, end, state.zoomLevel); };
    
    const getTimelineBoundaries = (date, level) => { let start = new Date(date); start.setHours(0, 0, 0, 0); let end; switch (level) { case 'day': end = new Date(start); end.setDate(start.getDate() + 1); break; case 'week': const dayOfWeek = start.getDay(); start.setDate(start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)); end = new Date(start); end.setDate(start.getDate() + 7); break; default: start = new Date(date.getFullYear(), date.getMonth(), 1); end = new Date(date.getFullYear(), date.getMonth() + 1, 1); break; } return { start, end }; };
    
    const renderTimelineHeader = (start, end, level) => { timelineWeeksContainer.innerHTML = ''; let headers = []; let tempDate = new Date(start); if (level === 'day') { for (let i = 0; i < 24; i++) { headers.push({ text: tempDate.toLocaleTimeString('en-us', { hour: 'numeric', hour12: true }), width: zoomLevels.day.unitWidth }); tempDate.setHours(tempDate.getHours() + 1); } } else if (level === 'week') { for (let i = 0; i < 7; i++) { headers.push({ text: tempDate.toLocaleDateString('en-us', { weekday: 'short', day: 'numeric' }), width: zoomLevels.week.unitWidth }); tempDate.setDate(tempDate.getDate() + 1); } } else { let dayCount = Math.round((end - start) / (1000 * 60 * 60 * 24)); for (let i = 0; i < dayCount; i++) { headers.push({ text: (tempDate.getDate() === 1 || i === 0) ? tempDate.toLocaleDateString('en-us', { month: 'short', day: 'numeric' }) : `${tempDate.getDate()}`, width: zoomLevels.month.unitWidth }); tempDate.setDate(tempDate.getDate() + 1); } } headers.forEach(h => { const el = document.createElement('div'); el.className = 'header-unit'; el.textContent = h.text; el.style.width = `${h.width}px`; timelineWeeksContainer.appendChild(el); }); };

    const renderTimelineGridAndTasks = (start, end, level) => {
        timelineGridLinesContainer.innerHTML = ''; timelineTasksOverlay.querySelectorAll('.timeline-task').forEach(el => el.remove());
        let unitCount, unitWidth, msPerUnit; const totalDuration = end.getTime() - start.getTime(); if (level === 'day') { unitCount = 24; msPerUnit = 1000 * 60 * 60; } else if (level === 'week') { unitCount = 7; msPerUnit = 1000 * 60 * 60 * 24; } else { unitCount = totalDuration / (1000 * 60 * 60 * 24); msPerUnit = 1000 * 60 * 60 * 24; }
        unitWidth = zoomLevels[level].unitWidth; const timelineWidth = unitCount * unitWidth; timelineWeeksContainer.style.width = timelineGridLinesContainer.style.width = timelineTasksOverlay.style.width = `${timelineWidth}px`;
        for (let i = 0; i < unitCount; i++) { const l = document.createElement('div'); l.className = 'grid-unit-line'; l.style.width = `${unitWidth}px`; timelineGridLinesContainer.appendChild(l); }
        
        const allTasks = getAllTasks();
        const visibleTasks = allTasks.filter(task => {
            if (!task.dueDate) return false;
            const taskEndDate = new Date(task.dueDate);
            taskEndDate.setHours(23, 59, 59, 999);
            return taskEndDate >= start && new Date(task.dueDate) <= end;
        });
        
        let preliminaryLayouts = calculateSectionLayouts(visibleTasks);
        Object.values(preliminaryLayouts).forEach(layout => { const sectionEl = sectionsContainer.querySelector(`.section[data-section-id="${layout.id}"]`); if (sectionEl) { if (layout.isCollapsed) { sectionEl.style.height = `${SECTION_HEADER_HEIGHT_PX}px`; } else { const maxLanes = layout.lanes.size || 1; const requiredHeight = SECTION_HEADER_HEIGHT_PX + (maxLanes * TASK_HEIGHT_PX) + (SECTION_CONTENT_PADDING_TOP_PX * 2); sectionEl.style.height = `${requiredHeight}px`; } } });
        
        let finalLayouts = calculateSectionLayouts(visibleTasks);
        timelineGridLinesContainer.querySelectorAll('.h-line').forEach(l => l.remove());
        Object.values(finalLayouts).forEach(layout => { const hLine = document.createElement('div'); hLine.className = 'h-line'; hLine.style.cssText = `position: absolute; left: 0; top: ${layout.yOffset + layout.height - 1}px; width: 100%; height: 1px; background-color: #dfe1e6; z-index: 0;`; timelineGridLinesContainer.appendChild(hLine); });
        
        visibleTasks.forEach(task => {
            const sectionLayout = finalLayouts[task.sectionId]; if (!sectionLayout || sectionLayout.isCollapsed) return;
            const taskStartDate = new Date(task.dueDate); taskStartDate.setHours(0, 0, 0, 0);
            const taskEndDate = new Date(task.dueDate); taskEndDate.setHours(23, 59, 59, 999);
            const taskStartOffsetMs = Math.max(0, taskStartDate.getTime() - start.getTime());
            const taskEndOffsetMs = Math.min(totalDuration, taskEndDate.getTime() - start.getTime());
            const left = (taskStartOffsetMs / msPerUnit) * unitWidth;
            const width = Math.max(unitWidth - 2, ((taskEndOffsetMs - taskStartOffsetMs) / msPerUnit) * unitWidth); // Ensure min width
            let laneIndex = 0; while (true) { const laneEndTime = sectionLayout.lanes.get(laneIndex); if (!laneEndTime || taskStartDate >= laneEndTime) { sectionLayout.lanes.set(laneIndex, taskEndDate); break; } laneIndex++; }
            const top = sectionLayout.yOffset + SECTION_HEADER_HEIGHT_PX + SECTION_CONTENT_PADDING_TOP_PX + (laneIndex * TASK_HEIGHT_PX);
            const taskElement = document.createElement('div'); taskElement.className = 'timeline-task'; taskElement.dataset.taskId = task.id; if (task.completed) { taskElement.classList.add('completed'); }
            const taskColor = task.color || '#4c9aff';
            const firstAssignee = allUsers.find(u => u.id === task.assignees[0]);
            const assigneeName = firstAssignee ? firstAssignee.name : 'Unassigned';
            const assigneeIconUrl = firstAssignee ? firstAssignee.avatar : '';
            taskElement.style.cssText = `left: ${left}px; width: ${width}px; top: ${top}px; border-color: ${taskColor}; background-color: ${taskColor}20;`;
            taskElement.title = `${task.name} - ${assigneeName}`;
            taskElement.innerHTML = `<div class="task-complete-check"><i class="fa-regular fa-circle"></i></div><div class="resize-handle left"></div><span class="task-name">${task.name}</span><div class="profile-icon" style="background-image: url('${assigneeIconUrl}')"></div><span class="task-actions">⋮</span><div class="resize-handle right"></div>`;
            timelineTasksOverlay.appendChild(taskElement);
        });
        const contentHeight = Object.values(finalLayouts).reduce((sum, layout) => sum + layout.height, 0); const finalGridHeight = Math.max(timelineBody.clientHeight, contentHeight); timelineGridLinesContainer.style.height = timelineTasksOverlay.style.height = `${finalGridHeight}px`;
    };

    const renderSections = () => {
        const fragment = document.createDocumentFragment();
        project.sections.forEach(sectionData => {
            const taskCount = sectionData.tasks.length;
            const sectionElement = document.createElement('div');
            sectionElement.className = 'section'; if (sectionData.isCollapsed) sectionElement.classList.add('collapsed');
            sectionElement.dataset.sectionId = sectionData.id; sectionElement.style.minHeight = `${SECTION_HEADER_HEIGHT_PX}px`;
            sectionElement.innerHTML = `<div class="section-header-timeline" draggable="true"><span class="section-drag-handle">☰</span><span class="dropdown-arrow">▼</span><span class="section-title">${sectionData.title}</span><span class="task-count">(${taskCount})</span></div><div class="section-content"></div>`;
            const toggleCollapse = () => { sectionData.isCollapsed = !sectionData.isCollapsed; renderAll(); };
            sectionElement.querySelector('.dropdown-arrow').addEventListener('click', toggleCollapse);
            fragment.appendChild(sectionElement);
        });
        sectionsContainer.innerHTML = ''; sectionsContainer.appendChild(fragment); sectionsContainer.appendChild(addSectionBtn);
    };

    const calculateSectionLayouts = (tasksToLayout) => {
        const layouts = {}; let currentY = 0;
        const sectionElements = Array.from(sectionsContainer.querySelectorAll('.section'));
        sectionElements.forEach(el => {
            const id = parseInt(el.dataset.sectionId, 10);
            const sectionData = project.sections.find(s => s.id === id);
            if (sectionData) {
                const sectionLayout = { id, yOffset: currentY, height: el.offsetHeight, isCollapsed: sectionData.isCollapsed, lanes: new Map() };
                if (tasksToLayout && !sectionData.isCollapsed) {
                    const tasksInSection = tasksToLayout.filter(t => t.sectionId === id);
                    tasksInSection.forEach(task => {
                        const taskStartDate = new Date(task.dueDate);
                        const taskEndDate = new Date(task.dueDate);
                        taskEndDate.setDate(taskEndDate.getDate() + 1);
                        let laneIndex = 0;
                        while (true) { const laneEndTime = sectionLayout.lanes.get(laneIndex); if (!laneEndTime || taskStartDate >= laneEndTime) { sectionLayout.lanes.set(laneIndex, taskEndDate); break; } laneIndex++; }
                    });
                }
                layouts[id] = sectionLayout;
                currentY += el.offsetHeight;
            }
        });
        return layouts;
    };

    // --- UI Event Handlers ---
    const updateZoomButtons = () => { const i = zoomHierarchy.indexOf(state.zoomLevel); zoomInBtn.disabled = i === 0; zoomOutBtn.disabled = i === zoomHierarchy.length - 1; };
    const updateTimelineStartDate = (dir) => { const d = state.timelineStartDate; const i = dir === 'next' ? 1 : -1; if (state.zoomLevel === 'day') d.setDate(d.getDate() + i); else if (state.zoomLevel === 'week') d.setDate(d.getDate() + (7 * i)); else d.setMonth(d.getMonth() + i); renderAll(); };
    zoomInBtn.addEventListener('click', () => { const i = zoomHierarchy.indexOf(state.zoomLevel); if (i > 0) { state.zoomLevel = zoomHierarchy[i - 1]; renderAll(); } });
    zoomOutBtn.addEventListener('click', () => { const i = zoomHierarchy.indexOf(state.zoomLevel); if (i < zoomHierarchy.length - 1) { state.zoomLevel = zoomHierarchy[i + 1]; renderAll(); } });
    prevBtn.addEventListener('click', () => updateTimelineStartDate('prev'));
    nextBtn.addEventListener('click', () => updateTimelineStartDate('next'));
    currentMonthDisplay.addEventListener('click', () => { state.timelineStartDate = new Date('2025-06-01'); renderAll(); });
    timelineBody.addEventListener('scroll', () => { timelineWeeksContainer.style.transform = `translateX(-${timelineBody.scrollLeft}px)`; sectionsContainer.style.transform = `translateY(-${timelineBody.scrollTop}px)`; });
    addTaskBtn.addEventListener('click', () => { const name = prompt("Enter task name:"); if (!name) return; const dueDate = prompt("Enter due date (YYYY-MM-DD):", "2025-06-10"); if (!dueDate || isNaN(new Date(dueDate).getTime())) { alert("Invalid date format."); return; } if (project.sections.length > 0) { project.sections[0].tasks.push({ id: Date.now(), name, dueDate, priority: 'Medium', status: 'On track', assignees: [], customFields: {}, completed: false }); renderAll(); } });
    addSectionBtn.addEventListener('click', () => { const name = prompt("Enter new section name:"); if (!name) return; project.sections.push({ id: Date.now(), title: name, tasks: [], isCollapsed: false }); renderAll(); });

    // --- Pointer (Mouse + Touch) Handlers ---
    const getPointerCoords = (e) => (e.touches && e.touches.length) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };

    const handlePointerDown = (e) => {
        const target = e.target;
        const coords = getPointerCoords(e);
        if (target.closest('.timeline-task') && !target.classList.contains('resize-handle')) {
            const el = target.closest('.timeline-task');
            state.draggedTaskInfo = { id: el.dataset.taskId, element: el, isDragging: false, startX: coords.x, startY: coords.y, offsetX: coords.x - el.getBoundingClientRect().left };
        } else if (target.closest('.section-header-timeline') && !target.classList.contains('dropdown-arrow')) {
            const sectionEl = target.closest('.section');
            if (sectionEl) {
                state.draggedSectionInfo = { id: sectionEl.dataset.sectionId, element: sectionEl, isDragging: false, startX: coords.x, startY: coords.y };
                setTimeout(() => { if(state.draggedSectionInfo && state.draggedSectionInfo.isDragging) sectionEl.classList.add('dragging')}, 100);
            }
        } else if (target.classList.contains('resize-handle')) {
            e.preventDefault();
            const el = target.closest('.timeline-task');
            state.resizeInfo = { taskId: el.dataset.taskId, element: el, handle: target.classList.contains('right') ? 'right' : 'left', startX: coords.x, initialWidth: el.offsetWidth, initialLeft: el.offsetLeft };
        } else if (target.matches('.timeline-grid, .timeline-tasks-overlay')) {
            e.preventDefault();
            state.panInfo = { startX: coords.x, initialScrollLeft: timelineBody.scrollLeft };
            timelineGrid.classList.add('panning');
        }
    };

    const handlePointerMove = (e) => {
        if (!state.draggedTaskInfo && !state.resizeInfo && !state.draggedSectionInfo && !state.panInfo) return;
        const coords = getPointerCoords(e);
        const startDragging = (dragInfo) => {
            const dx = Math.abs(coords.x - dragInfo.startX);
            const dy = Math.abs(coords.y - dragInfo.startY);
            if (dx > 5 || dy > 5) {
                dragInfo.isDragging = true;
                dragInfo.element.classList.add('dragging');
                return true;
            }
            return false;
        };

        if (state.draggedTaskInfo && !state.draggedTaskInfo.isDragging) {
            if(startDragging(state.draggedTaskInfo)) {
                dropIndicator.style.height = `${state.draggedTaskInfo.element.offsetHeight}px`;
                dropIndicator.style.width = `${state.draggedTaskInfo.element.offsetWidth}px`;
            }
        }
        if(state.draggedSectionInfo && !state.draggedSectionInfo.isDragging){
            startDragging(state.draggedSectionInfo);
        }

        if (state.draggedTaskInfo && state.draggedTaskInfo.isDragging) {
            e.preventDefault();
            const r = timelineTasksOverlay.getBoundingClientRect();
            const x = coords.x - r.left + timelineBody.scrollLeft - state.draggedTaskInfo.offsetX;
            const y = coords.y - r.top + timelineBody.scrollTop;
            let layouts = calculateSectionLayouts(getAllTasks());
            const s = Object.values(layouts).find(l => !l.isCollapsed && y >= l.yOffset && y < l.yOffset + l.height);
            if (s) { dropIndicator.style.display = 'block'; dropIndicator.style.left = `${Math.max(0, x)}px`; dropIndicator.style.top = `${s.yOffset + SECTION_HEADER_HEIGHT_PX + SECTION_CONTENT_PADDING_TOP_PX}px`; } else { dropIndicator.style.display = 'none'; }
        } else if (state.draggedSectionInfo && state.draggedSectionInfo.isDragging) {
            e.preventDefault();
            const targetEl = document.elementFromPoint(coords.x, coords.y)?.closest('.section');
            document.querySelectorAll('.section').forEach(s => s.classList.remove('drop-indicator-top', 'drop-indicator-bottom'));
            if (!targetEl || targetEl.dataset.sectionId === state.draggedSectionInfo.id) return;
            const rect = targetEl.getBoundingClientRect();
            coords.y > rect.top + rect.height / 2 ? targetEl.classList.add('drop-indicator-bottom') : targetEl.classList.add('drop-indicator-top');
        } else if (state.resizeInfo) {
            /* ... resize logic ... */
        } else if (state.panInfo) {
            e.preventDefault();
            const dx = coords.x - state.panInfo.startX;
            timelineBody.scrollLeft = state.panInfo.initialScrollLeft - dx;
        }
    };

    const handlePointerUp = (e) => {
        if (state.draggedTaskInfo) {
            if (state.draggedTaskInfo.isDragging) {
                dropIndicator.style.display = 'none';
                state.draggedTaskInfo.element.classList.remove('dragging');
                const { task, section: oldSection } = getTaskAndSection(state.draggedTaskInfo.id);
                if (task) {
                    const r = timelineTasksOverlay.getBoundingClientRect();
                    const finalCoords = getPointerCoords(e);
                    const x = finalCoords.x - r.left + timelineBody.scrollLeft - state.draggedTaskInfo.offsetX;
                    const y = finalCoords.y - r.top + timelineBody.scrollTop;
                    let layouts = calculateSectionLayouts(getAllTasks());
                    const newSectionData = Object.values(layouts).find(l => !l.isCollapsed && y >= l.yOffset && y < l.yOffset + l.height);
                    const newSection = newSectionData ? project.sections.find(s => s.id === newSectionData.id) : null;
                    const rawStartMs = calculateTimeFromX(x);
                    task.dueDate = new Date(snapTimestampToGrid(rawStartMs)).toISOString().split('T')[0];
                    if (newSection && oldSection && oldSection.id !== newSection.id) {
                        oldSection.tasks = oldSection.tasks.filter(t => t.id !== task.id);
                        newSection.tasks.push(task);
                    }
                }
                renderAll();
            } else {
                const taskId = state.draggedTaskInfo.id; const target = e.target;
                if (target.closest('.task-complete-check')) { toggleTaskCompletion(taskId); }
                else if (target.closest('.task-name') || target.closest('.profile-icon')) { displaySideBarTasks(taskId); }
            }
            state.draggedTaskInfo = null;
        } else if (state.draggedSectionInfo) {
            state.draggedSectionInfo.element.classList.remove('dragging');
            const dropEl = document.querySelector('.drop-indicator-top, .drop-indicator-bottom');
            if (dropEl && state.draggedSectionInfo.isDragging) {
                // ... section reordering logic ...
            }
            document.querySelectorAll('.section').forEach(s => s.classList.remove('drop-indicator-top', 'drop-indicator-bottom'));
            state.draggedSectionInfo = null;
        } else if (state.resizeInfo) {
            /* ... resize finalization ... */
        } else if (state.panInfo) {
            state.panInfo = null;
            timelineGrid.classList.remove('panning');
        }
    };

    // Attach Pointer Listeners
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchstart', handlePointerDown, { passive: false });
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    // Initial Render
    state.timelineStartDate = new Date('2025-06-01');
    renderAll();
