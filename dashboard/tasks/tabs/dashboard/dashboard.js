import { Chart, registerables } from 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.esm.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collectionGroup,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
console.log("Initialized Firebase on Dashboard.");

// 2. Register all the components (controllers, scales, elements, etc.) with Chart.js.
Chart.register(...registerables);

let filtersState = {};
let cardsContainer = null;
let bodyClickHandler = null;
let filterButtonHandlers = [];
let charts = {};
let sortables = [];
let dashboardData = [];
let activeDashboardFilters = {}; // Stores the current global filters
let fullTasksSnapshot = null;    // Stores the complete, unfiltered task list
let projectConfig = null;        // Stores the current project's configuration

async function fetchInitialData(projectId) {
  if (!projectId) {
    console.error("Project ID is required.");
    return false;
  }
  try {
    const projectQuery = query(collectionGroup(db, 'projects'), where('projectId', '==', projectId));
    const projectSnapshot = await getDocs(projectQuery);
    if (projectSnapshot.empty) throw new Error(`Project ${projectId} not found.`);

    projectConfig = projectSnapshot.docs[0].data();

    const tasksQuery = query(collectionGroup(db, 'tasks'), where('projectId', '==', projectId));
    fullTasksSnapshot = await getDocs(tasksQuery);

    // --- Added Console Logs ---
    console.log("Project Configuration Loaded:", projectConfig);
    console.log(`Found ${fullTasksSnapshot.size} tasks in this project.`);
    // --- End of Added Logs ---

    console.log("Initial project data and tasks fetched successfully.");
    return true;
  } catch (error) {
    console.error(`Error fetching initial data for project ${projectId}:`, error);
    return false;
  }
}

function aggregateTaskData(tasksSnapshot) {
  if (!projectConfig || !tasksSnapshot) return [];

  const statusColumn = projectConfig.defaultColumns.find(c => c.id === 'status');
  const sourceColumn = projectConfig.defaultColumns.find(c => c.id === 'priority');
  const costingColumns = projectConfig.customColumns.filter(c => c.type === 'Costing');
  const completionStatusName = statusColumn?.options?.find(o => o.name.toLowerCase() === 'completed')?.name;
  const cancelledStatusName = statusColumn?.options?.find(o => o.name.toLowerCase() === 'cancelled')?.name;

  let generalCounts = { completed: 0, incomplete: 0, overdue: 0 };
  const costingTotals = {};
  costingColumns.forEach(col => costingTotals[col.id] = 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  tasksSnapshot.forEach((doc) => {
    const task = doc.data();
    if (task.status === completionStatusName) {
      generalCounts.completed++;
    } else if (task.status !== cancelledStatusName) {
      generalCounts.incomplete++;
      if (task.dueDate && new Date(task.dueDate) < today) {
        generalCounts.overdue++;
      }
    }
    costingColumns.forEach(col => {
      const costValue = task.customFields?.[col.id];
      if (typeof costValue === 'number') {
        costingTotals[col.id] += costValue;
      }
    });
  });

  let finalData = [];
  const statusOptions = statusColumn?.options?.map(o => o.name) || [];
  const sourceOptions = sourceColumn?.options?.map(o => o.name) || [];

  // This creates the curated set of summary cards.
  finalData.push({ id: 'totalTasks', title: 'Total Tasks', value: tasksSnapshot.size, filterOptions: { Status: statusOptions, Source: sourceOptions } });
  finalData.push({ id: 'completedTasks', title: 'Completed Tasks', value: generalCounts.completed, filterOptions: { Status: statusOptions, Source: sourceOptions } });
  finalData.push({ id: 'incompleteTasks', title: 'Incomplete Tasks', value: generalCounts.incomplete, filterOptions: { Status: statusOptions, Source: sourceOptions } });
  finalData.push({ id: 'overdueTasks', title: 'Overdue Tasks', value: generalCounts.overdue, filterOptions: { Status: statusOptions, Source: sourceOptions } });

  costingColumns.forEach(col => {
    finalData.push({
      id: `cost-${col.id}`,
      title: `Total ${col.name} (${col.currency || ''})`.trim(),
      value: costingTotals[col.id] || 0,
      filterOptions: {} // Costing cards do not have filters
    });
  });

  return finalData;
}

function createCards() {
  try {
    if (!cardsContainer) return;
    cardsContainer.innerHTML = "";

    dashboardData.forEach((card) => {
      const cardEl = document.createElement("div");
      cardEl.className = "card";
      cardEl.dataset.id = card.id;
      cardEl.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full pt-2">
                    <h2 class="text-sm font-medium mb-1 text-center px-1">${card.title}</h2>
                    <p class="text-xl font-light mb-4 text-center">${formatNumber(card.value)}</p>
                    <div class="card-filter-container relative inline-block text-left w-full flex justify-center"></div>
                </div>
            `;
      const filterContainer = cardEl.querySelector('.card-filter-container');

      if (card.filterOptions && Object.keys(card.filterOptions).length > 0) {
        const filterButton = document.createElement("button");
        filterButton.type = "button";
        filterButton.className = "filter-button";
        filterButton.innerHTML = `<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>Filter`;
        filterContainer.appendChild(filterButton);

        const dropdown = document.createElement("div");
        dropdown.className = "origin-top-left";
        dropdown.addEventListener("click", (e) => e.stopPropagation());

        function createFilterGroup(title, options, filterTypeId) {
          const group = document.createElement("div");
          group.className = "px-3 py-2 border-b border-gray-300";
          group.innerHTML = `<p class="font-semibold mb-1">${title}</p>`;

          const handleFilterChange = (event) => {
            const value = event.target.value;
            if (value === 'all') {
              delete activeDashboardFilters[filterTypeId];
            } else {
              activeDashboardFilters[filterTypeId] = value;
            }
            renderDashboard();
          };

          const createRadioOption = (value, text, isChecked) => {
            const label = document.createElement("label");
            label.className = "flex items-center space-x-2 mb-1 cursor-pointer";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = `filter-${card.id}-${filterTypeId}`;
            radio.value = value;
            radio.checked = isChecked;
            radio.addEventListener('change', handleFilterChange);
            label.appendChild(radio);
            label.appendChild(document.createTextNode(text));
            return label;
          };

          group.appendChild(createRadioOption('all', 'All', !activeDashboardFilters[filterTypeId]));
          options.forEach(opt => {
            group.appendChild(createRadioOption(opt, opt, activeDashboardFilters[filterTypeId] === opt));
          });
          return group;
        }

        for (const filterTitle in card.filterOptions) {
          const options = card.filterOptions[filterTitle];
          // **THE FIX**: Search both default and custom columns to find the correct ID
          const column = [...projectConfig.defaultColumns, ...projectConfig.customColumns].find(c => c.name === filterTitle);
          const filterTypeId = column ? column.id : filterTitle.toLowerCase();

          if (options && Array.isArray(options) && options.length > 0) {
            dropdown.appendChild(createFilterGroup(filterTitle, options, filterTypeId));
          }
        }
        filterContainer.appendChild(dropdown);
        filterButton.addEventListener("click", (e) => {
          e.stopPropagation();
          document.querySelectorAll(".origin-top-left").forEach((dd) => {
            if (dd !== dropdown) dd.style.display = "none";
          });
          dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
        });
      }
      cardsContainer.appendChild(cardEl);
    });
  } catch (error) {
    console.error("Error creating cards:", error);
  }
}

function renderDashboard() {
  console.log("Rendering dashboard with filters:", activeDashboardFilters);

  const filteredDocs = fullTasksSnapshot.docs.filter(doc => {
    const task = doc.data();

    // This loop now checks the task against every active filter
    for (const columnId in activeDashboardFilters) {
      const filterValue = activeDashboardFilters[columnId];
      let matches = false; // Start by assuming the task does not match

      // **THE FIX IS HERE**: We now check all possible fields for a match.
      if (columnId === 'status') {
        // For status, we check BOTH the current and previous status.
        if (task.status === filterValue || task.previousStatus === filterValue) {
          matches = true;
        }
      } else if (columnId === 'priority') {
        // For source/priority, we check the top-level 'priority' field.
        if (task.priority === filterValue) {
          matches = true;
        }
      } else {
        if (task.customFields && task.customFields[columnId] === filterValue) {
          matches = true;
        }
      }

      // If after all checks, this one filter did not find a match, we exclude the task.
      if (!matches) {
        return false;
      }
    }

    // If the task passed all active filters, we include it.
    return true;
  });

  const filteredSnapshot = {
    docs: filteredDocs,
    size: filteredDocs.length,
    forEach: (callback) => filteredDocs.forEach(callback)
  };

  dashboardData = aggregateTaskData(filteredSnapshot);
  createCards();
  initCharts(projectConfig, filteredSnapshot);
}

function getProjectIdFromUrl() {
  const match = window.location.pathname.match(/\/tasks\/[^/]+\/dashboard\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Utility function to format numbers with commas.
 * @param {number} num - The number to format.
 * @returns {string} The formatted number string.
 */
function formatNumber(num) {
  const sign = num < 0 ? "-" : "";
  const val = Math.abs(num).toLocaleString("en-US");
  return sign + val;
}


/**
 * Sets the displayed value of a specific card in the DOM.
 * @param {string} cardId - The ID of the card to update.
 * @param {number} value - The new value to display.
 */
function setCardValue(cardId, value) {
  try {
    // Iterate through the actual DOM elements to find the correct card
    const cardElements = cardsContainer.children;
    for (let i = 0; i < cardElements.length; i++) {
      const cardEl = cardElements[i];
      // Check if the data-id matches the target cardId
      if (cardEl.dataset.id === cardId) {
        const valEl = cardEl.querySelector("p.text-xl");
        if (valEl) {
          valEl.textContent = formatNumber(value);
        }
        break; // Found and updated, exit loop
      }
    }
  } catch (error) {
    console.error("Error setting card value:", error);
  }
}

function initCharts(projectConfig, tasksSnapshot) {
  if (!projectConfig || !tasksSnapshot) return;
  try {
    console.log("Initializing charts with data...");
    const createChart = (id, config) => {
      const ctx = document.getElementById(id);
      if (!ctx) return;
      if (charts[id]) charts[id].destroy();
      charts[id] = new Chart(ctx, config);
    };

    // --- 1. Aggregate Data for Charts ---
    const statusCounts = {};
    const sourceCounts = {};
    tasksSnapshot.forEach(doc => {
      const task = doc.data();
      if (task.status) statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
      if (task.priority) sourceCounts[task.priority] = (sourceCounts[task.priority] || 0) + 1;
    });

    // --- 2. Create Bar & Pie Charts (Status Distribution) ---
    const statusColumn = projectConfig.defaultColumns.find(c => c.id === 'status');
    if (statusColumn && statusColumn.options) {
      const labels = statusColumn.options.map(opt => opt.name);
      const colors = statusColumn.options.map(opt => opt.color);
      const data = labels.map(label => statusCounts[label] || 0);
      createChart("barChart", { type: "bar", data: { labels, datasets: [{ label: "Tasks by Status", data, backgroundColor: colors }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
      createChart("pieChart", { type: "pie", data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right" } } } });
    }

    // --- 3. Create Doughnut Chart (Source Distribution) ---
    const sourceColumn = projectConfig.defaultColumns.find(c => c.id === 'priority');
    if (sourceColumn && sourceColumn.options) {
      const labels = sourceColumn.options.map(opt => opt.name);
      const colors = sourceColumn.options.map(opt => opt.color);
      const data = labels.map(label => sourceCounts[label] || 0);
      createChart("doughnutChart", { type: "doughnut", data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: "#fff" }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "70%", plugins: { legend: { position: "right" } } } });
    }

    // --- 4. Create Line Chart (Task Trends) ---
    const completionStatusName = statusColumn?.options?.find(o => o.name.toLowerCase() === 'completed')?.name;
    const trendLabels = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      trendLabels.push(d.toLocaleString('default', { month: 'short' }));
    }
    const newTasksData = new Array(7).fill(0);
    const completedTasksData = new Array(7).fill(0);

    tasksSnapshot.forEach(doc => {
      const task = doc.data();
      if (task.createdAt && task.createdAt.seconds) {
        const createdAt = new Date(task.createdAt.seconds * 1000);
        const monthDiff = (now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth());
        if (monthDiff >= 0 && monthDiff < 7) {
          const index = 6 - monthDiff;
          newTasksData[index]++;
          if (task.status === completionStatusName) {
            completedTasksData[index]++;
          }
        }
      }
    });

    createChart("lineChart", {
      type: "line",
      data: {
        labels: trendLabels,
        datasets: [
          { label: "Completed Tasks", data: completedTasksData, borderColor: "#4f46e5", backgroundColor: "rgba(79, 70, 229, 0.1)", tension: 0.3, fill: true },
          { label: "New Tasks", data: newTasksData, borderColor: "#f59e0b", backgroundColor: "rgba(245, 158, 11, 0.1)", tension: 0.3, fill: true }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

  } catch (error) {
    console.error("Error initializing charts:", error);
  }
}

/**
 * Sets up drag-and-drop functionality using Sortable.js for cards and chart containers.
 */
function setupDragAndDrop() {
  try {
    console.log("Setting up drag and drop...");

    // Initialize Sortable for the card grid
    const cardGrid = document.querySelector(".card-grid");
    if (cardGrid) {
      sortables.push(
        new Sortable(cardGrid, {
          group: "shared", // Allows dragging between different Sortable lists
          animation: 150, // Milliseconds for animation
          ghostClass: "dragging", // Class applied to the ghost element
          handle: ".card", // Only drag by the card itself
          filter: ".filter-button", // Prevent dragging when clicking the filter button
          preventOnFilter: false, // Allow filter button to be clicked
        })
      );
    }

    // Initialize Sortable for the left chart column
    const leftColumn = document.querySelector(".chart-column:first-child");
    if (leftColumn) {
      sortables.push(
        new Sortable(leftColumn, {
          group: "shared",
          animation: 150,
          ghostClass: "dragging",
          handle: ".chart-container", // Only drag by the chart container
        })
      );
    }

    // Initialize Sortable for the right chart column
    const rightColumn = document.querySelector(".chart-column:last-child");
    if (rightColumn) {
      sortables.push(
        new Sortable(rightColumn, {
          group: "shared",
          animation: 150,
          ghostClass: "dragging",
          handle: ".chart-container",
        })
      );
    }
    console.log("Drag and drop setup complete");
  } catch (error) {
    console.error("Error setting up drag and drop:", error);
  }
}

/**
 * Cleans up all event listeners, chart instances, and Sortable instances
 * to prevent memory leaks and ensure a clean state.
 */
function cleanup() {
  try {
    console.log("Cleaning up dashboard...");

    // Remove the global body click handler
    if (bodyClickHandler) {
      document.body.removeEventListener("click", bodyClickHandler);
      bodyClickHandler = null;
    }

    // Remove event listeners from filter buttons
    filterButtonHandlers.forEach(({ button, handler }) => {
      button.removeEventListener("click", handler);
    });
    filterButtonHandlers = []; // Clear the array

    // Destroy all Chart.js instances
    Object.values(charts).forEach((chart) => {
      if (chart && typeof chart.destroy === "function") {
        chart.destroy();
      }
    });
    charts = {}; // Reset the charts object

    // Destroy all Sortable.js instances
    sortables.forEach((sortable) => {
      if (sortable && typeof sortable.destroy === "function") {
        sortable.destroy();
      }
    });
    sortables = []; // Clear the array

    // Clear the content of the cards container
    if (cardsContainer) {
      cardsContainer.innerHTML = "";
    }

    // Reset state variables
    filtersState = {};
    cardsContainer = null; // Dereference the container

    console.log("Dashboard cleanup complete");
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

function init() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const projectId = getProjectIdFromUrl();
      if (!projectId) {
        cleanup();
        return console.log("No project ID in URL.");
      }

      cleanup();
      cardsContainer = document.querySelector(".card-grid");
      if (!cardsContainer) return console.error("Cards container not found.");

      const success = await fetchInitialData(projectId);

      if (success) {
        renderDashboard(); // Perform the first render

        // Setup persistent elements
        document.body.addEventListener("click", (e) => {
          if (!e.target.closest(".origin-top-left") && !e.target.closest(".filter-button")) {
            document.querySelectorAll(".origin-top-left").forEach((dd) => (dd.style.display = "none"));
          }
        });
        console.log("Dashboard initialized successfully.");
      } else {
        console.error("Dashboard initialization failed.");
      }
    } else {
      console.log("User signed out.");
      cleanup();
    }
  });
}

export { init };


