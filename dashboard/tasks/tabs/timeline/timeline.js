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
            let sections = [{ id: 'sec-1', name: 'To Do', collapsed: false, order: 1 }, { id: 'sec-2', name: 'In Progress', collapsed: false, order: 2 }, { id: 'sec-3', name: 'Done', collapsed: true, order: 3 }];
            let tasks = [{ id: 'task-1', name: 'Q3 Marketing Strategy Call', sectionId: 'sec-2', startDate: new Date('2025-06-03T10:00:00'), endDate: new Date('2025-06-05T12:00:00'), color: '#4c9aff', assigneeName: 'Alice', assigneeIconUrl: 'https://i.pravatar.cc/150?img=1' }, { id: 'task-2', name: 'Sprint Planning & Grooming', sectionId: 'sec-2', startDate: new Date('2025-06-05T09:00:00'), endDate: new Date('2025-06-08T17:00:00'), color: '#ffc107', assigneeName: 'Bob', assigneeIconUrl: 'https://i.pravatar.cc/150?img=2' }, { id: 'task-3', name: 'Present New Feature Concepts', sectionId: 'sec-3', startDate: new Date('2025-06-09T14:00:00'), endDate: new Date('2025-06-11T15:30:00'), color: '#9c27b0', assigneeName: 'Charlie', assigneeIconUrl: 'https://i.pravatar.cc/150?img=3' }, { id: 'task-4', name: 'Develop User Authentication', sectionId: 'sec-1', startDate: new Date('2025-06-12T09:00:00'), endDate: new Date('2025-06-16T18:00:00'), color: '#4caf50', assigneeName: 'David', assigneeIconUrl: 'https://i.pravatar.cc/150?img=4' }, { id: 'task-5', name: 'UI/UX Design Mockups', sectionId: 'sec-1', startDate: new Date('2025-06-02T09:00:00'), endDate: new Date('2025-06-06T18:00:00'), color: '#e91e63', assigneeName: 'Eve', assigneeIconUrl: 'https://i.pravatar.cc/150?img=5' }];

            let state = { zoomLevel: 'month', timelineStartDate: new Date(), draggedTaskInfo: null, resizeInfo: null, draggedSectionInfo: null, panInfo: null };

            // --- Main Functions ---
            const renderAll = () => { updateZoomButtons(); renderSections(); renderTimeline(); };

            const renderTimeline = () => { const { start, end } = getTimelineBoundaries(state.timelineStartDate, state.zoomLevel); currentMonthDisplay.textContent = new Intl.DateTimeFormat('en-US', zoomLevels[state.zoomLevel].labelFormat).format(state.timelineStartDate); renderTimelineHeader(start, end, state.zoomLevel); renderTimelineGridAndTasks(start, end, state.zoomLevel); };
            const getTimelineBoundaries = (date, level) => { let start = new Date(date); start.setHours(0, 0, 0, 0); let end; switch (level) { case 'day': end = new Date(start); end.setDate(start.getDate() + 1); break; case 'week': const dayOfWeek = start.getDay(); start.setDate(start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)); end = new Date(start); end.setDate(start.getDate() + 7); break; default: start = new Date(date.getFullYear(), date.getMonth(), 1); end = new Date(date.getFullYear(), date.getMonth() + 1, 1); break; } return { start, end }; };
            const renderTimelineHeader = (start, end, level) => { timelineWeeksContainer.innerHTML = ''; let headers = []; let tempDate = new Date(start); if (level === 'day') { for (let i = 0; i < 24; i++) { headers.push({ text: tempDate.toLocaleTimeString('en-us', { hour: 'numeric', hour12: true }), width: zoomLevels.day.unitWidth }); tempDate.setHours(tempDate.getHours() + 1); } } else if (level === 'week') { for (let i = 0; i < 7; i++) { headers.push({ text: tempDate.toLocaleDateString('en-us', { weekday: 'short', day: 'numeric' }), width: zoomLevels.week.unitWidth }); tempDate.setDate(tempDate.getDate() + 1); } } else { let dayCount = Math.round((end - start) / (1000 * 60 * 60 * 24)); for (let i = 0; i < dayCount; i++) { headers.push({ text: (tempDate.getDate() === 1 || i === 0) ? tempDate.toLocaleDateString('en-us', { month: 'short', day: 'numeric' }) : `${tempDate.getDate()}`, width: zoomLevels.month.unitWidth }); tempDate.setDate(tempDate.getDate() + 1); } } headers.forEach(h => { const el = document.createElement('div'); el.className = 'header-unit'; el.textContent = h.text; el.style.width = `${h.width}px`; timelineWeeksContainer.appendChild(el); }); };

            const renderTimelineGridAndTasks = (start, end, level) => {
                timelineGridLinesContainer.innerHTML = ''; timelineTasksOverlay.querySelectorAll('.timeline-task').forEach(el => el.remove()); let unitCount, unitWidth, msPerUnit; const totalDuration = end.getTime() - start.getTime(); if (level === 'day') { unitCount = 24; msPerUnit = 1000 * 60 * 60; } else if (level === 'week') { unitCount = 7; msPerUnit = 1000 * 60 * 60 * 24; } else { unitCount = totalDuration / (1000 * 60 * 60 * 24); msPerUnit = 1000 * 60 * 60 * 24; } unitWidth = zoomLevels[level].unitWidth; const timelineWidth = unitCount * unitWidth; timelineWeeksContainer.style.width = timelineGridLinesContainer.style.width = timelineTasksOverlay.style.width = `${timelineWidth}px`;
                for (let i = 0; i < unitCount; i++) { const l = document.createElement('div'); l.className = 'grid-unit-line'; l.style.width = `${unitWidth}px`; timelineGridLinesContainer.appendChild(l); }
                let preliminaryLayouts = calculateSectionLayouts(); const visibleTasks = tasks.filter(task => task.endDate >= start && task.startDate <= end);
                visibleTasks.forEach(task => { const sectionLayout = preliminaryLayouts[task.sectionId]; if (!sectionLayout || sectionLayout.isCollapsed) return; let laneIndex = 0; while (true) { const laneEndTime = sectionLayout.lanes.get(laneIndex); if (!laneEndTime || task.startDate >= laneEndTime) { sectionLayout.lanes.set(laneIndex, task.endDate); break; } laneIndex++; } });
                Object.values(preliminaryLayouts).forEach(layout => { const sectionEl = sectionsContainer.querySelector(`.section[data-section-id="${layout.id}"]`); if (sectionEl) { if (layout.isCollapsed) { sectionEl.style.height = `${SECTION_HEADER_HEIGHT_PX}px`; } else { const maxLanes = layout.lanes.size || 1; const requiredHeight = SECTION_HEADER_HEIGHT_PX + (maxLanes * TASK_HEIGHT_PX) + (SECTION_CONTENT_PADDING_TOP_PX * 2); sectionEl.style.height = `${requiredHeight}px`; } } });
                let finalLayouts = calculateSectionLayouts(); timelineGridLinesContainer.querySelectorAll('.h-line').forEach(l => l.remove());
                Object.values(finalLayouts).forEach(layout => { const hLine = document.createElement('div'); hLine.className = 'h-line'; hLine.style.cssText = `position: absolute; left: 0; top: ${layout.yOffset + layout.height - 1}px; width: 100%; height: 1px; background-color: #dfe1e6; z-index: 0;`; timelineGridLinesContainer.appendChild(hLine); });
                visibleTasks.forEach(task => { const sectionLayout = finalLayouts[task.sectionId]; if (!sectionLayout || sectionLayout.isCollapsed) return; const taskStartOffsetMs = Math.max(0, task.startDate.getTime() - start.getTime()); const taskEndOffsetMs = Math.min(totalDuration, task.endDate.getTime() - start.getTime()); const left = (taskStartOffsetMs / msPerUnit) * unitWidth; const width = Math.max(unitWidth / 4, ((taskEndOffsetMs - taskStartOffsetMs) / msPerUnit) * unitWidth); let laneIndex = 0; while (true) { const laneEndTime = sectionLayout.lanes.get(laneIndex); if (!laneEndTime || task.startDate >= laneEndTime) { sectionLayout.lanes.set(laneIndex, task.endDate); break; } laneIndex++; } const top = sectionLayout.yOffset + SECTION_HEADER_HEIGHT_PX + SECTION_CONTENT_PADDING_TOP_PX + (laneIndex * TASK_HEIGHT_PX); const taskElement = document.createElement('div'); taskElement.className = 'timeline-task'; taskElement.dataset.taskId = task.id; taskElement.draggable = true; taskElement.style.cssText = `left: ${left}px; width: ${width}px; top: ${top}px; border-color: ${task.color}; background-color: ${task.color}20;`; taskElement.title = `${task.name} - ${task.assigneeName}`; taskElement.innerHTML = `<div class="resize-handle left"></div><span class="task-name">${task.name}</span><div class="profile-icon" style="background-image: url('${task.assigneeIconUrl}')"></div><span class="task-actions">⋮</span><div class="resize-handle right"></div>`; timelineTasksOverlay.appendChild(taskElement); });
                const contentHeight = Object.values(finalLayouts).reduce((sum, layout) => sum + layout.height, 0); const finalGridHeight = Math.max(timelineBody.clientHeight, contentHeight); timelineGridLinesContainer.style.height = timelineTasksOverlay.style.height = `${finalGridHeight}px`;
            };

            const renderSections = () => {
                const fragment = document.createDocumentFragment();
                sections.sort((a, b) => a.order - b.order).forEach(sectionData => {
                    const taskCount = tasks.filter(task => task.sectionId === sectionData.id).length;
                    const sectionElement = document.createElement('div');
                    sectionElement.className = 'section';
                    if (sectionData.collapsed) sectionElement.classList.add('collapsed');
                    sectionElement.dataset.sectionId = sectionData.id;
                    sectionElement.style.minHeight = `${SECTION_HEADER_HEIGHT_PX}px`;
                    sectionElement.innerHTML = `
                <div class="section-header-timeline" draggable="true">
                    <span class="section-drag-handle">☰</span>
                    <span class="dropdown-arrow">▼</span>
                    <span class="section-title">${sectionData.name}</span>
                    <span class="task-count">(${taskCount})</span>
                </div>
                <div class="section-content"></div>`;
                    const toggleCollapse = () => { sectionData.collapsed = !sectionData.collapsed; renderAll(); };
                    sectionElement.querySelector('.dropdown-arrow').addEventListener('click', toggleCollapse);

                    // ✅ CHANGE: The two lines below that add a click event to the title are now removed.
                    // const titleElement = sectionElement.querySelector('.section-title');
                    // titleElement.addEventListener('click', toggleCollapse);

                    fragment.appendChild(sectionElement);
                });
                sectionsContainer.innerHTML = ''; sectionsContainer.appendChild(fragment); sectionsContainer.appendChild(addSectionBtn);
            };
            const calculateSectionLayouts = () => { const layouts = {}; let currentY = 0; const sectionElements = Array.from(sectionsContainer.querySelectorAll('.section')); sectionElements.forEach(el => { const id = el.dataset.sectionId; const sectionData = sections.find(s => s.id === id); if (sectionData) { layouts[id] = { id, yOffset: currentY, height: el.offsetHeight, isCollapsed: sectionData.collapsed, lanes: new Map() }; currentY += el.offsetHeight; } }); return layouts; };

            // --- Utility & Event Handlers ---
            const calculateTimeFromX = (x) => { const { start, end } = getTimelineBoundaries(state.timelineStartDate, state.zoomLevel); return start.getTime() + (x / timelineTasksOverlay.offsetWidth) * (end.getTime() - start.getTime()); };
            const snapTimestampToGrid = (timestamp) => {
                const date = new Date(timestamp);
                if (state.zoomLevel === 'month' || state.zoomLevel === 'week') {
                    date.setHours(0, 0, 0, 0);
                } else if (state.zoomLevel === 'day') {
                    date.setMinutes(0, 0, 0, 0);
                }
                return date.getTime();
            };
            const formatDateForTooltip = (date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
            const updateZoomButtons = () => { const i = zoomHierarchy.indexOf(state.zoomLevel); zoomInBtn.disabled = i === 0; zoomOutBtn.disabled = i === zoomHierarchy.length - 1; };

            const updateTimelineStartDate = (dir) => { const d = state.timelineStartDate; const i = dir === 'next' ? 1 : -1; if (state.zoomLevel === 'day') d.setDate(d.getDate() + i); else if (state.zoomLevel === 'week') d.setDate(d.getDate() + (7 * i)); else d.setMonth(d.getMonth() + i); renderAll(); };
            zoomInBtn.addEventListener('click', () => { const i = zoomHierarchy.indexOf(state.zoomLevel); if (i > 0) { state.zoomLevel = zoomHierarchy[i - 1]; renderAll(); } });
            zoomOutBtn.addEventListener('click', () => { const i = zoomHierarchy.indexOf(state.zoomLevel); if (i < zoomHierarchy.length - 1) { state.zoomLevel = zoomHierarchy[i + 1]; renderAll(); } });
            prevBtn.addEventListener('click', () => updateTimelineStartDate('prev'));
            nextBtn.addEventListener('click', () => updateTimelineStartDate('next'));
            currentMonthDisplay.addEventListener('click', () => { state.timelineStartDate = new Date('2025-06-01'); renderAll(); });
            timelineBody.addEventListener('scroll', () => { timelineWeeksContainer.style.transform = `translateX(-${timelineBody.scrollLeft}px)`; });

            // Add Task/Section Logic
            addTaskBtn.addEventListener('click', () => { const name = prompt("Enter task name:"); if (!name) return; const startDateStr = prompt("Enter start date (YYYY-MM-DD):", "2025-06-10"); const endDateStr = prompt("Enter end date (YYYY-MM-DD):", "2025-06-12"); const startDate = new Date(startDateStr), endDate = new Date(endDateStr); if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) { alert("Invalid date format."); return; } tasks.push({ id: `task-${Date.now()}`, name, sectionId: sections[0].id, startDate, endDate, color: `#${Math.floor(Math.random() * 16777215).toString(16)}`, assigneeName: 'New', assigneeIconUrl: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70)}` }); renderAll(); });

            addSectionBtn.addEventListener('click', () => { const name = prompt("Enter new section name:"); if (!name) return; const maxOrder = Math.max(0, ...sections.map(s => s.order)); sections.push({ id: `sec-${Date.now()}`, name, collapsed: false, order: maxOrder + 1 }); renderAll(); });

            // --- Pointer (Mouse + Touch) Event Normalization & Handlers ---
            const getPointerCoords = (e) => {
                if (e.touches && e.touches.length) {
                    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
                }
                return { x: e.clientX, y: e.clientY };
            };

            const handlePointerDown = (e) => {
                const target = e.target;
                const coords = getPointerCoords(e);

                if (target.classList.contains('resize-handle')) {
                    e.preventDefault();
                    const el = target.closest('.timeline-task');
                    state.resizeInfo = { taskId: el.dataset.taskId, element: el, handle: target.classList.contains('right') ? 'right' : 'left', startX: coords.x, initialWidth: el.offsetWidth, initialLeft: el.offsetLeft };
                } else if (target.classList.contains('timeline-task')) {
                    e.preventDefault();
                    const el = target;
                    state.draggedTaskInfo = { id: el.dataset.taskId, element: el, offsetX: coords.x - el.getBoundingClientRect().left };
                    dropIndicator.style.height = `${el.offsetHeight}px`;
                    dropIndicator.style.width = `${el.offsetWidth}px`;
                    setTimeout(() => el.classList.add('dragging'), 0);
                } else if (target.closest('.section-header-timeline')) {
                    // ✅ CORRECTED LOGIC: Now, only the arrow is not draggable. The rest of the header is.
                    if (!target.classList.contains('dropdown-arrow')) {
                        e.preventDefault();
                        const sectionEl = target.closest('.section');
                        if (sectionEl) {
                            state.draggedSectionInfo = { id: sectionEl.dataset.sectionId, element: sectionEl };
                            setTimeout(() => sectionEl.classList.add('dragging'), 0);
                        }
                    }
                } else if (target.matches('.timeline-grid, .timeline-tasks-overlay')) {
                    e.preventDefault();
                    state.panInfo = { startX: coords.x, initialScrollLeft: timelineBody.scrollLeft };
                    timelineGrid.classList.add('panning');
                }
            };

            const handlePointerMove = (e) => {
                if (!state.resizeInfo && !state.draggedTaskInfo && !state.draggedSectionInfo && !state.panInfo) return;
                e.preventDefault();
                const coords = getPointerCoords(e);

                if (state.resizeInfo) {
                    const { element, handle, startX, initialWidth, initialLeft } = state.resizeInfo;
                    const dx = coords.x - startX;
                    let newWidth, newLeft = initialLeft;
                    if (handle === 'right') {
                        newWidth = Math.max(zoomLevels[state.zoomLevel].unitWidth / 4, initialWidth + dx);
                    } else {
                        newWidth = Math.max(zoomLevels[state.zoomLevel].unitWidth / 4, initialWidth - dx);
                        newLeft = initialLeft + dx;
                    }
                    element.style.width = `${newWidth}px`;
                    element.style.left = `${newLeft}px`;

                    const rawStartMs = calculateTimeFromX(newLeft);
                    const durationMs = (newWidth / element.parentElement.offsetWidth) * (getTimelineBoundaries(state.timelineStartDate, state.zoomLevel).end.getTime() - getTimelineBoundaries(state.timelineStartDate, state.zoomLevel).start.getTime());
                    const startMs = snapTimestampToGrid(rawStartMs);
                    const endMs = snapTimestampToGrid(rawStartMs + durationMs);

                    resizeTooltip.innerHTML = `${formatDateForTooltip(new Date(startMs))} - ${formatDateForTooltip(new Date(endMs))}`;
                    resizeTooltip.style.display = 'block';
                    resizeTooltip.style.left = `${coords.x + 15}px`;
                    resizeTooltip.style.top = `${coords.y + 15}px`;
                } else if (state.draggedTaskInfo) {
                    const r = timelineTasksOverlay.getBoundingClientRect();
                    const x = coords.x - r.left + timelineBody.scrollLeft - state.draggedTaskInfo.offsetX;
                    const y = coords.y - r.top + timelineBody.scrollTop;
                    const s = Object.values(calculateSectionLayouts()).find(l => !l.isCollapsed && y >= l.yOffset && y < l.yOffset + l.height);
                    if (s) {
                        dropIndicator.style.display = 'block';
                        dropIndicator.style.left = `${Math.max(0, x)}px`;
                        dropIndicator.style.top = `${s.yOffset + SECTION_HEADER_HEIGHT_PX + SECTION_CONTENT_PADDING_TOP_PX}px`;
                    } else {
                        dropIndicator.style.display = 'none';
                    }
                } else if (state.draggedSectionInfo) {
                    const targetEl = document.elementFromPoint(coords.x, coords.y)?.closest('.section');
                    document.querySelectorAll('.section').forEach(s => s.classList.remove('drop-indicator-top', 'drop-indicator-bottom'));
                    if (!targetEl || targetEl.dataset.sectionId === state.draggedSectionInfo.id) return;
                    const rect = targetEl.getBoundingClientRect();
                    const isAfter = coords.y > rect.top + rect.height / 2;
                    if (isAfter) targetEl.classList.add('drop-indicator-bottom');
                    else targetEl.classList.add('drop-indicator-top');
                } else if (state.panInfo) {
                    const dx = coords.x - state.panInfo.startX;
                    timelineBody.scrollLeft = state.panInfo.initialScrollLeft - dx;
                }
            };

            const handlePointerUp = (e) => {
                if (state.resizeInfo) {
                    resizeTooltip.style.display = 'none';
                    const t = tasks.find(t => t.id === state.resizeInfo.taskId);
                    if (t) {
                        const newLeft = state.resizeInfo.element.offsetLeft, newWidth = state.resizeInfo.element.offsetWidth;
                        const rawStartMs = calculateTimeFromX(newLeft);
                        const durationMs = (newWidth / state.resizeInfo.element.parentElement.offsetWidth) * (getTimelineBoundaries(state.timelineStartDate, state.zoomLevel).end.getTime() - getTimelineBoundaries(state.timelineStartDate, state.zoomLevel).start.getTime());
                        t.startDate = new Date(snapTimestampToGrid(rawStartMs));
                        t.endDate = new Date(snapTimestampToGrid(rawStartMs + durationMs));
                    }
                    state.resizeInfo = null;
                    renderAll();
                } else if (state.draggedTaskInfo) {
                    dropIndicator.style.display = 'none';
                    state.draggedTaskInfo.element.classList.remove('dragging');
                    const task = tasks.find(t => t.id === state.draggedTaskInfo.id);
                    if (task) {
                        const r = timelineTasksOverlay.getBoundingClientRect();
                        const finalCoords = e.changedTouches ? getPointerCoords(e.changedTouches[0]) : getPointerCoords(e);
                        const x = finalCoords.x - r.left + timelineBody.scrollLeft - state.draggedTaskInfo.offsetX;
                        const y = finalCoords.y - r.top + timelineBody.scrollTop;

                        const rawStartMs = calculateTimeFromX(x);
                        const duration = task.endDate.getTime() - task.startDate.getTime();
                        task.startDate = new Date(snapTimestampToGrid(rawStartMs));
                        task.endDate = new Date(snapTimestampToGrid(rawStartMs + duration));

                        const section = Object.values(calculateSectionLayouts()).find(l => !l.isCollapsed && y >= l.yOffset && y < l.yOffset + l.height);
                        if (section) task.sectionId = section.id;
                    }
                    state.draggedTaskInfo = null;
                    renderAll();
                } else if (state.draggedSectionInfo) {
                    const dropIndicatorEl = document.querySelector('.drop-indicator-top, .drop-indicator-bottom');
                    if (dropIndicatorEl) {
                        const targetId = dropIndicatorEl.dataset.sectionId;
                        const isAfter = dropIndicatorEl.classList.contains('drop-indicator-bottom');
                        const draggedId = state.draggedSectionInfo.id;
                        const reorderedSections = [...sections];
                        const draggedIndex = reorderedSections.findIndex(s => s.id === draggedId);
                        const [draggedItem] = reorderedSections.splice(draggedIndex, 1);
                        const targetIndex = reorderedSections.findIndex(s => s.id === targetId);
                        reorderedSections.splice(targetIndex + (isAfter ? 1 : 0), 0, draggedItem);
                        reorderedSections.forEach((s, i) => s.order = i + 1);
                        sections = reorderedSections;
                    }
                    document.querySelectorAll('.section').forEach(s => s.classList.remove('dragging', 'drop-indicator-top', 'drop-indicator-bottom'));
                    state.draggedSectionInfo = null;
                    renderAll();
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
        