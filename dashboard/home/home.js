// Get the main container div to scope all DOM queries and event listeners
    const homeSection = document.querySelector('div[data-section="home"]') || document.getElementById('home');
    if (!homeSection) console.error('Home section not found!');


    let projects = [
        { id: 'sec-1', name: 'Project Alpha', color: '#4caf50' },
        { id: 'sec-2', name: 'Project Beta', color: '#4c9aff' },
        { id: 'sec-3', name: 'Project Gamma', color: '#9c27b0' },
    ];

    let tasks = [
        { id: 'task-1', name: 'Draft project brief', sectionId: 'sec-2', startDate: new Date('2025-06-03T10:00:00'), endDate: new Date('2025-06-05T12:00:00'), color: '#4c9aff', assigneeName: 'Alice', assigneeIconUrl: 'https://i.pravatar.cc/150?img=1', completed: false },
        { id: 'task-2', name: 'Schedule kickoff meeting', sectionId: 'sec-2', startDate: new Date('2025-06-05T09:00:00'), endDate: new Date('2025-06-08T17:00:00'), color: '#ffc107', assigneeName: 'Bob', assigneeIconUrl: 'https://i.pravatar.cc/150?img=2', completed: false },
        { id: 'task-3', name: 'Present New Feature Concepts', sectionId: 'sec-3', startDate: new Date('2025-06-09T14:00:00'), endDate: new Date('2025-06-11T15:30:00'), color: '#9c27b0', assigneeName: 'Charlie', assigneeIconUrl: 'https://i.pravatar.cc/150?img=3', completed: false },
        { id: 'task-4', name: 'Develop User Authentication', sectionId: 'sec-1', startDate: new Date('2025-06-12T09:00:00'), endDate: new Date('2025-06-16T18:00:00'), color: '#4caf50', assigneeName: 'David', assigneeIconUrl: 'https://i.pravatar.cc/150?img=4', completed: false },
        { id: 'task-5', name: 'UI/UX Design Mockups', sectionId: 'sec-1', startDate: new Date('2025-06-02T09:00:00'), endDate: new Date('2025-06-06T18:00:00'), color: '#e91e63', assigneeName: 'Eve', assigneeIconUrl: 'https://i.pravatar.cc/150?img=5', completed: true }, // Mark one as completed for demonstration
    ];

    // DOM elements scoped within homeSection (re-query them after dynamic content changes if needed)
    let tabButtons; // Will be initialized in initializeTabs
    let createTaskBtn; // Will be initialized in initializeTaskManagement
    let createProjectBtn; // Will be initialized later
    let inviteBtn; // Will be initialized later

    // --- Render projects ---
    function renderProjects(filteredProjectId = null) {
        const projectList = homeSection.querySelector('.project-list');
        if (!projectList) return;

        // Clear existing projects, but keep the create project button
        const existingCreateButton = projectList.querySelector('.create-project-btn');
        projectList.innerHTML = '';
        if (existingCreateButton) {
            projectList.appendChild(existingCreateButton);
        }

        projects.forEach(project => {
            const projectItem = document.createElement('div');
            projectItem.className = 'project-item';
            projectItem.dataset.projectId = project.id;
            projectItem.style.opacity = '0'; // For fade-in effect

            projectItem.innerHTML = `
                <div class="project-icon" style="color: ${project.color};">
                    <i class="fas fa-list"></i>
                </div>
                <div class="project-info">
                    <span class="project-name">${project.name}</span>
                    <span class="project-meta" data-task-count>0 tasks</span>
                </div>
            `;

            projectList.appendChild(projectItem);

            // Fade-in animation
            setTimeout(() => {
                projectItem.style.transition = 'opacity 0.3s ease';
                projectItem.style.opacity = '1';
            }, 10);

            projectItem.addEventListener('click', () => {
                console.log(`Opening project: ${project.name}`);
                filterTasksByProject(project.id);
            });
        });
        updateTaskCount(); // Update task counts for newly rendered projects
    }

    // --- Render tasks based on current filter ---
    function renderTasks(filter = 'upcoming') {
        const taskList = homeSection.querySelector('.task-list');
        if (!taskList) return;

        // Clear existing tasks, but keep the create task button
        const existingCreateButton = taskList.querySelector('.create-task-btn');
        taskList.innerHTML = '';
        if (existingCreateButton) {
            taskList.appendChild(existingCreateButton);
        }

        const tasksToDisplay = tasks.filter(task => {
            const now = new Date();
            const isOverdue = task.endDate < now && !task.completed;
            const isUpcoming = task.startDate > now && !task.completed;
            const isCompleted = task.completed;

            switch (filter) {
                case 'upcoming':
                    return isUpcoming;
                case 'overdue':
                    return isOverdue;
                case 'completed':
                    return isCompleted;
                default: // 'all' or any other fallback
                    return true;
            }
        });

        tasksToDisplay.sort((a, b) => a.endDate - b.endDate); // Sort by end date

        tasksToDisplay.forEach(task => {
            const taskItem = document.createElement('div');
            taskItem.className = 'task-item';
            taskItem.dataset.taskId = task.id;
            taskItem.dataset.sectionId = task.sectionId;
            taskItem.style.opacity = '0';
            taskItem.style.borderLeft = `4px solid ${task.color}`;

            // Format date range for display
            const startDateStr = task.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endDateStr = task.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            taskItem.innerHTML = `
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} />
                <div class="task-content">
                    <span class="task-text">${task.name}</span>
                    <span class="task-dates">${startDateStr} - ${endDateStr}</span>
                </div>
                <div class="task-assignee" title="${task.assigneeName}">
                    <img src="${task.assigneeIconUrl}" alt="${task.assigneeName}" />
                </div>
            `;

            taskList.appendChild(taskItem);

            setTimeout(() => {
                taskItem.style.transition = 'opacity 0.3s ease';
                taskItem.style.opacity = '1';
            }, 10);

            // Apply strike-through for completed tasks immediately on render
            const checkbox = taskItem.querySelector('.task-checkbox');
            const taskText = taskItem.querySelector('.task-text');
            if (task.completed) {
                taskText.style.textDecoration = 'line-through';
                taskText.style.opacity = '0.6';
            }

            // Checkbox event listener for completion
            checkbox.addEventListener('change', () => {
                const taskId = taskItem.dataset.taskId;
                const taskIndex = tasks.findIndex(t => t.id === taskId);
                if (taskIndex > -1) {
                    tasks[taskIndex].completed = checkbox.checked; // Update task status in data
                }

                if (checkbox.checked) {
                    taskText.style.textDecoration = 'line-through';
                    taskText.style.opacity = '0.6';
                    showNotification(`Task "${task.name}" completed!`, 'success');

                    // Animate out and re-render
                    setTimeout(() => {
                        taskItem.style.opacity = '0';
                        setTimeout(() => {
                            renderTasks(homeSection.querySelector('.tab-btn.active').dataset.tab); // Re-render current tab
                            updateTaskCount();
                        }, 300);
                    }, 500);
                } else {
                    taskText.style.textDecoration = 'none';
                    taskText.style.opacity = '1';
                    showNotification(`Task "${task.name}" marked as incomplete.`, 'info');
                    renderTasks(homeSection.querySelector('.tab-btn.active').dataset.tab); // Re-render current tab
                    updateTaskCount();
                }
            });
        });
        updateTaskCount(); // Update the counts after rendering tasks
    }

    // Update task counts in the stats bar and project cards
    function updateTaskCount() {
        const totalCompletedTasks = tasks.filter(t => t.completed).length;
        const totalCollaborators = 0; // This would come from a 'people' data array
        homeSection.querySelector('.stats-item i.fa-check').nextElementSibling.textContent = `${totalCompletedTasks} tasks completed`;
        homeSection.querySelector('.stats-item i.fa-users').nextElementSibling.textContent = `${totalCollaborators} collaborators`;


        // Update task count inside each project meta
        const projectItems = homeSection.querySelectorAll('.project-item');
        projectItems.forEach(projectItem => {
            const projectId = projectItem.dataset.projectId;
            const countElement = projectItem.querySelector('[data-task-count]');
            if (!countElement) return;

            // Count tasks that belong to this project and are not completed
            const count = tasks.filter(t => t.sectionId === projectId && !t.completed).length;
            countElement.textContent = `${count} task${count !== 1 ? 's' : ''} due soon`;
        });
    }

    // Filter tasks by project (used when clicking a project)
    function filterTasksByProject(projectId) {
        const taskList = homeSection.querySelector('.task-list');
        if (!taskList) return;

        const taskItems = taskList.querySelectorAll('.task-item');
        taskItems.forEach(taskItem => {
            if (taskItem.dataset.sectionId === projectId) {
                taskItem.style.display = 'flex';
            } else {
                taskItem.style.display = 'none';
            }
        });

        // Optionally, update the active tab to "Upcoming" or "All" when filtering by project
        homeSection.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'));
        homeSection.querySelector('.tab-btn[data-tab="upcoming"]').classList.add('active');
    }

// Initialize buttons that are part of the static HTML but whose references might change
createTaskBtn = homeSection.querySelector('.create-task-btn');
createProjectBtn = homeSection.querySelector('.create-project-btn');
inviteBtn = homeSection.querySelector('.invite-btn');
tabButtons = homeSection.querySelectorAll('.tab-btn');
const dropdownMyWeekHome = homeSection.querySelector('#my-week-dropdown');
  const menu = homeSection.querySelector('#dropdown-menu-weeks');


renderProjects();
renderTasks('upcoming'); 

initializeTabs();

initializeSidebarSections(); 
updateDateTime();
initializeTooltips();
initializeDropdowns();

console.log('Asana clone initialized successfully!');

    // Task Management
    if (createTaskBtn) {
    createTaskBtn.addEventListener('click', function() {
        createNewTask();
    });
}   
  


    function createNewTask() {
        const taskList = homeSection.querySelector('.task-list');
        const newTaskName = prompt('Enter task name:');

        if (newTaskName && newTaskName.trim()) {
            const now = new Date();
            const nextWeek = new Date();
            nextWeek.setDate(now.getDate() + 7); // Default due in 7 days

            const newTask = {
                id: `task-${Date.now()}`, // Simple unique ID
                name: newTaskName.trim(),
                sectionId: projects[0] ? projects[0].id : 'no-project', // Assign to first project or default
                startDate: now,
                endDate: nextWeek,
                color: projects[0] ? projects[0].color : '#cccccc',
                assigneeName: 'Chat', // Default assignee
                assigneeIconUrl: 'https://i.pravatar.cc/150?img=10',
                completed: false
            };
            tasks.unshift(newTask); // Add to the beginning of the tasks array

            renderTasks(homeSection.querySelector('.tab-btn.active').dataset.tab); // Re-render tasks for current tab
            showNotification(`Task "${newTaskName}" created!`, 'success');
        }
    }

    // Tab Management
    function initializeTabs() {
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                tabButtons.forEach(tab => tab.classList.remove('active'));
                this.classList.add('active');

                const tabName = this.dataset.tab; // Get the data-tab attribute
                renderTasks(tabName); // Re-render tasks based on selected tab
            });
        });
    }



    // Sidebar Section Management (Assuming section headers like in a full Asana UI)
    function initializeSidebarSections() {
        // This function is currently empty as there are no collapsible sidebar sections in the provided HTML snippet
        // If you add .section-header elements with .section-items as next siblings, uncomment and adjust logic:
        
        const sectionHeaders = homeSection?.querySelectorAll('.section-header') || [];
        sectionHeaders.forEach(header => {
            header.addEventListener('click', function() {
                const chevron = this.querySelector('i');
                const sectionItems = this.nextElementSibling; // Assuming direct sibling

                if (sectionItems && sectionItems.classList.contains('section-items')) {
                    const isExpanded = chevron.style.transform === 'rotate(90deg)';

                    if (isExpanded) {
                        chevron.style.transform = 'rotate(0deg)';
                        sectionItems.style.display = 'none';
                    } else {
                        chevron.style.transform = 'rotate(90deg)';
                        sectionItems.style.display = 'block';
                    }
                }
            });
        });
        
    }

    // Project Management
    if (createProjectBtn) {
        createProjectBtn.addEventListener('click', function() {
            createNewProject();
        });
    }

    function createNewProject() {
        const projectName = prompt('Enter project name:');
        if (projectName && projectName.trim()) {
            const newProject = {
                id: `sec-${Date.now()}`, // Simple unique ID
                name: projectName.trim(),
                color: '#' + Math.floor(Math.random()*16777215).toString(16) // Random hex color
            };
            projects.push(newProject); // Add to projects array
            
            
            showNotification(`Project "${projectName}" created!`, 'success');
        }
    }

    // DateTime Management
    function updateDateTime() {
        const dateElement = homeSection.querySelector('.date');
        if (dateElement) {
            const now = new Date();
            const options = {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
            };
            dateElement.textContent = now.toLocaleDateString('en-US', options);

            // Update greeting based on time of day
            const greetingElement = homeSection.querySelector('.welcome-section h2');
            const hour = now.getHours();
            let greeting = 'Good evening, Chat';
            if (hour < 12) {
                greeting = 'Good morning, Chat';
            } else if (hour < 18) {
                greeting = 'Good afternoon, Chat';
            }
            greetingElement.textContent = greeting;
        }
    }

    // Dropdown functionality
function initializeDropdowns() {
  homeSection.querySelectorAll('.dropdown').forEach(dropdown => {
    const dropdownTrigger = dropdownMyWeekHome;
    const dropdownMenu = dropdownMyWeekHome.querySelector('.dropdown-menu-weeks');
    const chevronIcon = dropdownMyWeekHome.querySelector('.fas.fa-chevron-down, .fas.fa-chevron-up');

    if (dropdownTrigger && dropdownMenu && chevronIcon) {
      dropdownTrigger.addEventListener('click', (event) => {
        event.stopPropagation();
        dropdownMenu.classList.toggle('show');
        chevronIcon.classList.toggle('fa-chevron-up');
        chevronIcon.classList.toggle('fa-chevron-down');
      });

      dropdownMenu.querySelectorAll('a').forEach(item => {
        item.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const selectedValue = item.dataset.value;
          const dropdownId = dropdownMyWeekHome.dataset.dropdownId;

          dropdownMenu.classList.remove('show');
          chevronIcon.classList.remove('fa-chevron-up');
          chevronIcon.classList.add('fa-chevron-down');

          // Update label text without affecting icon
          const labelTextSpan = dropdownMyWeekHome.querySelector('.label-text');
          if (labelTextSpan) {
            labelTextSpan.textContent = item.textContent;
          }

          // Your date range filtering logic here
          if (dropdownId === 'my-week') {
            const now = new Date();
            if (selectedValue === 'today') {
              renderTasksBasedOnDateRange(now, now);
            } else if (selectedValue === 'this-week') {
              const startOfWeek = new Date(now);
              startOfWeek.setDate(now.getDate() - now.getDay());
              const endOfWeek = new Date(startOfWeek);
              endOfWeek.setDate(startOfWeek.getDate() + 6);
              renderTasksBasedOnDateRange(startOfWeek, endOfWeek);
            } else if (selectedValue === 'next-week') {
              const startOfNextWeek = new Date(now);
              startOfNextWeek.setDate(now.getDate() - now.getDay() + 7);
              const endOfNextWeek = new Date(startOfNextWeek);
              endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
              renderTasksBasedOnDateRange(startOfNextWeek, endOfNextWeek);
            }
          }
        });
      });
    }
  });


}


    // Helper function to render tasks based on a date range (for 'My week' dropdown)
    function renderTasksBasedOnDateRange(startDate, endDate) {
        const taskList = homeSection.querySelector('.task-list');
        if (!taskList) return;

        const existingCreateButton = taskList.querySelector('.create-task-btn');
        taskList.innerHTML = '';
        if (existingCreateButton) {
            taskList.appendChild(existingCreateButton);
        }

        const filteredTasks = tasks.filter(task => {
            const taskStart = task.startDate;
            const taskEnd = task.endDate;
            // Task falls within the range if its start or end date is within the range,
            // or if it spans across the entire range.
            return (taskStart <= endDate && taskEnd >= startDate && !task.completed);
        });

        filteredTasks.sort((a, b) => a.endDate - b.endDate); // Sort by end date

        filteredTasks.forEach(task => {
            const taskItem = document.createElement('div');
            taskItem.className = 'task-item';
            taskItem.dataset.taskId = task.id;
            taskItem.dataset.sectionId = task.sectionId;
            taskItem.style.opacity = '0';
            taskItem.style.borderLeft = `4px solid ${task.color}`;

            const startDateStr = task.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endDateStr = task.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            taskItem.innerHTML = `
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} />
                <div class="task-content">
                    <span class="task-text">${task.name}</span>
                    <span class="task-dates">${startDateStr} - ${endDateStr}</span>
                </div>
                <div class="task-assignee" title="${task.assigneeName}">
                    <img src="${task.assigneeIconUrl}" alt="${task.assigneeName}" />
                </div>
            `;
            taskList.appendChild(taskItem);

            setTimeout(() => {
                taskItem.style.transition = 'opacity 0.3s ease';
                taskItem.style.opacity = '1';
            }, 10);

            const checkbox = taskItem.querySelector('.task-checkbox');
            const taskText = taskItem.querySelector('.task-text');
            if (task.completed) {
                taskText.style.textDecoration = 'line-through';
                taskText.style.opacity = '0.6';
            }
            checkbox.addEventListener('change', () => {
                const taskId = taskItem.dataset.taskId;
                const taskIndex = tasks.findIndex(t => t.id === taskId);
                if (taskIndex > -1) {
                    tasks[taskIndex].completed = checkbox.checked;
                }
                if (checkbox.checked) {
                    taskText.style.textDecoration = 'line-through';
                    taskText.style.opacity = '0.6';
                    showNotification(`Task "${task.name}" completed!`, 'success');
                    setTimeout(() => {
                        taskItem.style.opacity = '0';
                        setTimeout(() => {
                            renderTasksBasedOnDateRange(startDate, endDate); // Re-render with new completion status
                            updateTaskCount();
                        }, 300);
                    }, 500);
                } else {
                    taskText.style.textDecoration = 'none';
                    taskText.style.opacity = '1';
                    showNotification(`Task "${task.name}" marked as incomplete.`, 'info');
                    renderTasksBasedOnDateRange(startDate, endDate); // Re-render with new completion status
                    updateTaskCount();
                }
            });
        });
        updateTaskCount();
    }


    // Search functionality (already present, just ensure it's initialized)
    const searchInput = homeSection?.querySelector('.search-container input');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            console.log(`Searching for: ${searchTerm}`);
            // Implement actual search filtering here (e.g., filter tasks and projects)
        });
    }

    // Learn card interactions
    const learnCards = homeSection?.querySelectorAll('.learn-card') || [];
    learnCards.forEach(card => {
        card.addEventListener('click', function() {
            const title = this.querySelector('h4').textContent;
            console.log(`Opening tutorial: ${title}`);
            showNotification(`Opening "${title}" tutorial...`);
        });
    });

    // Customize button
    const customizeBtn = homeSection?.querySelector('.customize-btn');
    if (customizeBtn) {
        customizeBtn.addEventListener('click', function() {
            console.log('Opening customization options');
            showNotification('Opening customization options...');
        });
    }

    // Invite teammates button
    if (inviteBtn) {
        inviteBtn.addEventListener('click', function() {
            console.log('Opening invite teammates modal');
            showNotification('Invite teammates feature coming soon!');
        });
    }

    // Utility functions
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4caf50' : type === 'info' ? '#2196f3' : '#f44336'};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '1';
        }, 10);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function(event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
            event.preventDefault();
            createNewTask();
        }
        if (event.key === 'Escape') {
            console.log('Escape pressed');
            // Close any open modals or dropdowns here
            homeSection.querySelectorAll('.dropdown-menu-weeks.show').forEach(menu => {
                menu.classList.remove('show');
                const chevronIcon = menu.previousElementSibling.querySelector('.fas.fa-chevron-up');
                if (chevronIcon) {
                    chevronIcon.classList.remove('fa-chevron-up');
                    chevronIcon.classList.add('fa-chevron-down');
                }
            });
        }
    });

    // Initialize tooltips
    function initializeTooltips() {
        const tooltipElements = homeSection.querySelectorAll('[data-tooltip]');

        tooltipElements.forEach(element => {
            let tooltipDiv; // Declare outside event listeners to be accessible for both

            element.addEventListener('mouseenter', function() {
                const tooltipText = this.getAttribute('data-tooltip');
                tooltipDiv = document.createElement('div');
                tooltipDiv.className = 'tooltip';
                tooltipDiv.textContent = tooltipText;
                document.body.appendChild(tooltipDiv);

                // Position the tooltip
                const rect = this.getBoundingClientRect();
                tooltipDiv.style.left = `${rect.left + (rect.width / 2) - (tooltipDiv.offsetWidth / 2)}px`;
                tooltipDiv.style.top = `${rect.top - tooltipDiv.offsetHeight - 5}px`; // 5px above element
                tooltipDiv.style.opacity = '1';
            });

            element.addEventListener('mouseleave', function() {
                if (tooltipDiv) {
                    tooltipDiv.style.opacity = '0';
                    setTimeout(() => {
                        tooltipDiv.remove();
                        tooltipDiv = null; // Clear the reference
                    }, 200); // Small delay for fade-out effect
                }
            });
        });
    }

    // Debounce function for performance optimization
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
