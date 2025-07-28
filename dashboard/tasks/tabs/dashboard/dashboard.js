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
let masterDashboardData = []; // Stores ALL possible cards calculated once
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
  const allSelectColumns = [
    ...projectConfig.defaultColumns.filter(c => c.options && c.options.length > 0),
    ...projectConfig.customColumns.filter(c => c.options && c.options.length > 0)
  ];
  const completionStatusName = statusColumn?.options?.find(o => o.name.toLowerCase() === 'completed')?.name;
  const cancelledStatusName = statusColumn?.options?.find(o => o.name.toLowerCase() === 'cancelled')?.name;

  // --- Aggregation Logic ---
  let generalCounts = { completed: 0, incomplete: 0, overdue: 0 };
  let paymentMadeTotal = 0;
  let balanceTotal = 0;
  const selectOptionCounts = {};
  allSelectColumns.forEach(col => {
    selectOptionCounts[col.id] = {};
    if (col.options) {
      col.options.forEach(opt => selectOptionCounts[col.id][opt.name] = 0);
    }
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  tasksSnapshot.forEach((doc) => {
    const task = doc.data();
    let taskTotalCost = 0;
    costingColumns.forEach(col => {
      const costValue = task.customFields?.[col.id];
      if (typeof costValue === 'number') { taskTotalCost += costValue; }
    });

    if (task.status === completionStatusName) {
      generalCounts.completed++;
      paymentMadeTotal += taskTotalCost;
    } else if (task.status !== cancelledStatusName) {
      generalCounts.incomplete++;
      balanceTotal += taskTotalCost;
      if (task.dueDate && new Date(task.dueDate) < today) {
        generalCounts.overdue++;
      }
    }

    allSelectColumns.forEach(col => {
      const isCustom = !projectConfig.defaultColumns.some(dc => dc.id === col.id);
      const value = (isCustom ? task.customFields?.[col.id] : task[col.id]);
      if (value && selectOptionCounts[col.id]?.hasOwnProperty(value)) {
        selectOptionCounts[col.id][value]++;
      }
    });
  });

  // --- Build Card Lists ---
  let allPossibleCards = [];
  const cardFilterOptions = {};
  const allColumns = [...projectConfig.defaultColumns, ...projectConfig.customColumns];
  allColumns
    .filter(col => col.options && col.options.length > 0)
    .forEach(col => {
      cardFilterOptions[col.name] = col.options.map(o => o.name);
    });

  // Populate SUMMARY cards (these get filters)
  allPossibleCards.push({ id: 'totalTasks', title: 'Total Tasks', value: tasksSnapshot.size, filterOptions: cardFilterOptions });
  allPossibleCards.push({ id: 'completedTasks', title: 'Completed Tasks', value: generalCounts.completed, filterOptions: cardFilterOptions });
  allPossibleCards.push({ id: 'incompleteTasks', title: 'Incomplete Tasks', value: generalCounts.incomplete, filterOptions: cardFilterOptions });
  allPossibleCards.push({ id: 'overdueTasks', title: 'Overdue Tasks', value: generalCounts.overdue, filterOptions: cardFilterOptions });
  allPossibleCards.push({ id: 'totalPaymentMade', title: 'Total Payment Made', value: paymentMadeTotal, filterOptions: {} });
  allPossibleCards.push({ id: 'cardBalance', title: 'Card Balance', value: balanceTotal, filterOptions: {} });

  // Populate METRIC cards (these can be added by the user and have no filters)
  allSelectColumns.forEach(col => {
    if (col.options) {
      col.options.forEach(option => {
        allPossibleCards.push({
          id: `count-${col.id}-${option.name.replace(/\s+/g, '-')}`,
          title: `${col.name}: ${option.name}`,
          value: selectOptionCounts[col.id][option.name] || 0,
          filterOptions: {} // Metric cards do not have filters
        });
      });
    }
  });

  // **THE FIX**: Return a single, flat array of all possible cards.
  return allPossibleCards;
}

function createCards() {
  try {
    if (!cardsContainer) return;
    cardsContainer.innerHTML = "";

    dashboardData.forEach((card) => {
      const cardEl = document.createElement("div");
      cardEl.className = "card relative"; // Add relative for positioning
      cardEl.dataset.id = card.id;
      cardEl.innerHTML = `
        <button class="remove-card-btn absolute top-2 right-2 text-gray-400 hover:text-red-500">
          <i class="fas fa-times"></i>
        </button>
        <div class="flex flex-col items-center justify-center h-full pt-2">
          <h2 class="text-sm font-medium mb-1 text-center px-1">${card.title}</h2>
          <p class="text-xl font-light mb-4 text-center">${formatNumber(card.value)}</p>
          <div class="card-filter-container relative inline-block text-left w-full flex justify-center"></div>
        </div>
      `;

      // Add remove button functionality
      const removeBtn = cardEl.querySelector(".remove-card-btn");
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dashboardData = dashboardData.filter(c => c.id !== card.id);
        saveCardLayout(); // Update layout
        renderDashboard();
      });

      const filterContainer = cardEl.querySelector('.card-filter-container');
      if (card.filterOptions && Object.keys(card.filterOptions).length > 0) {
      // Always add filter button
      const filterButton = document.createElement("button");
      filterButton.type = "button";
      filterButton.className = "filter-button mt-4";
      filterButton.innerHTML = `
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M6 12h12M9 18h6"></path>
        </svg>
    `;
      filterContainer.appendChild(filterButton);

      // Dropdown
      const dropdown = document.createElement("div");
      dropdown.className = "origin-top-left";
      dropdown.style.zIndex = "9999999999";
      dropdown.addEventListener("click", (e) => e.stopPropagation());

      const globalAllGroup = document.createElement("div");
      globalAllGroup.className = "px-3 py-2 border-b border-gray-300";
      const globalAllLabel = document.createElement("label");
      globalAllLabel.className = "flex items-center space-x-2 py-1 cursor-pointer font-semibold";
      const globalAllRadio = document.createElement("input");
      globalAllRadio.type = "radio";
      globalAllRadio.name = `filter-${card.id}-master-reset`;
      globalAllRadio.checked = Object.keys(activeDashboardFilters).length === 0;
      globalAllRadio.addEventListener('change', () => {
        activeDashboardFilters = {};
        renderDashboard();
      });
      globalAllLabel.appendChild(globalAllRadio);
      const globalAllText = document.createElement('span');
      globalAllText.textContent = "All Tasks";
      globalAllLabel.appendChild(globalAllText);
      globalAllGroup.appendChild(globalAllLabel);
      dropdown.appendChild(globalAllGroup);

      // Filter groups
      function createFilterGroup(title, options, filterTypeId, showInternalAll) {
        const group = document.createElement("div");
        group.className = "px-3 py-2 border-b border-gray-300";
        group.innerHTML = `<p class="font-semibold mb-1">${title}</p>`;
        const radioGroupName = `filter-${card.id}-${filterTypeId}`;

        const handleFilterChange = (event) => {
          const value = event.target.value;
          if (value === 'all') {
            delete activeDashboardFilters[filterTypeId];
          } else {
            activeDashboardFilters[filterTypeId] = value;
          }
          if (globalAllRadio) globalAllRadio.checked = false;
          renderDashboard();
        };

        const createRadioOption = (value, text, isChecked) => {
          const label = document.createElement("label");
          label.className = "flex items-center space-x-2 py-1 cursor-pointer";
          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = radioGroupName;
          radio.value = value;
          radio.checked = isChecked;
          radio.addEventListener('change', handleFilterChange);
          label.appendChild(radio);
          const textSpan = document.createElement('span');
          textSpan.textContent = text;
          label.appendChild(textSpan);
          return label;
        };

        if (showInternalAll) {
          group.appendChild(createRadioOption('all', 'All', !activeDashboardFilters[filterTypeId]));
        }
        options.forEach(opt => {
          group.appendChild(createRadioOption(opt, opt, activeDashboardFilters[filterTypeId] === opt));
        });
        return group;
      }

      for (const filterTitle in card.filterOptions) {
        const options = card.filterOptions[filterTitle];
        const column = [...projectConfig.defaultColumns, ...projectConfig.customColumns].find(c => c.name === filterTitle);
        if (!column) continue;

        const isDefaultCol = projectConfig.defaultColumns.some(c => c.id === column.id);
        const displayTitle = isDefaultCol ? filterTitle : "Custom Fields";
        const showAll = true;

        if (options && Array.isArray(options) && options.length > 0) {
          dropdown.appendChild(createFilterGroup(displayTitle, options, column.id, showAll));
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

    const displayedIds = new Set(dashboardData.map(c => c.id));
    const hasMoreCards = masterDashboardData.some(c => !displayedIds.has(c.id));

    if (hasMoreCards) {
      const addCardWidget = document.createElement("div");
      addCardWidget.className = "card card-placeholder cannot-drag";
      addCardWidget.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full">
                    <svg class="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                    <span class="mt-2 text-sm font-medium text-gray-500">Add Card</span>
                </div>
            `;

      addCardWidget.addEventListener('click', () => {
        const nextCardToAdd = masterDashboardData.find(c => !displayedIds.has(c.id));
        if (nextCardToAdd) {
          dashboardData.push(nextCardToAdd);
          saveCardLayout();
          createCards();
        }
      });
      cardsContainer.appendChild(addCardWidget);
    }
  } catch (error) {
    console.error("Error creating cards:", error);
  }
}

function openAddWidgetModal() {
  // Remove any existing modal first
  const existingModal = document.querySelector('.widget-modal-overlay');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'widget-modal-overlay'; // Style this class with CSS
  modalOverlay.innerHTML = `
        <div class="widget-modal">
            <h3 class="widget-modal-title">Add New Widget</h3>
            <p class="widget-modal-text">Select a widget to add to your dashboard.</p>
            <div class="form-group">
                <label for="widget-type">Widget Type</label>
                <select id="widget-type">
                    <option value="totalTasks">Total Tasks</option>
                    <option value="completedTasks">Completed Tasks</option>
                    <option value="cardBalance">Card Balance</option>
                </select>
            </div>
            <div class="widget-modal-actions">
                <button id="cancel-widget-btn">Cancel</button>
                <button id="add-widget-btn">Add Widget</button>
            </div>
        </div>
    `;

  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.getElementById('cancel-widget-btn').addEventListener('click', closeModal);
  document.getElementById('add-widget-btn').addEventListener('click', () => {
    const selectedWidget = document.getElementById('widget-type').value;
    alert(`Logic to add the "${selectedWidget}" card would go here.`);
    closeModal();
  });
}

function addPlaceholderWidgets() {
  // Find the container for the charts
  const chartArea = document.querySelector('.chart-section');
  if (!chartArea) return;

  // Avoid adding duplicate "Add Graph" widgets
  if (chartArea.querySelector(".chart-placeholder")) return;

  // Create and add the "Add Graph" widget
  const addGraphWidget = document.createElement("div");
  addGraphWidget.className = "chart-container chart-placeholder flex items-center justify-center cursor-pointer border-2 border-dashed border-gray-300 hover:border-blue-500 transition-colors duration-300 rounded-xl p-6 bg-gray-50 hover:bg-blue-50";
  addGraphWidget.innerHTML = `
        <div class="flex flex-col items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-gray-400 group-hover:text-blue-500 transition-colors duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span class="mt-3 text-sm font-medium text-gray-600 group-hover:text-blue-600 transition-colors">Add Graph</span>
        </div>
    `;

  addGraphWidget.addEventListener('click', () => {
    addNewChart();
  });

  chartArea.appendChild(addGraphWidget);
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

  const filteredSnapshot = { docs: filteredDocs, size: filteredDocs.length, forEach: cb => filteredDocs.forEach(cb) };

  const updatedCardValues = aggregateTaskData(filteredSnapshot);

  // Keep only the existing cards (preserve layout)
  dashboardData.forEach(card => {
    const updatedCard = updatedCardValues.find(c => c.id === card.id);
    if (updatedCard) card.value = updatedCard.value;
  });
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

function setupDragAndDrop() {
  try {
    console.log("Setting up drag and drop...");
    const cardGrid = document.querySelector(".card-grid");
    if (cardGrid) {
      if (sortables[0]) sortables[0].destroy(); // Destroy previous instance

      sortables[0] = new Sortable(cardGrid, {
        animation: 200, // Smooth animation
        handle: ".card",
        filter: ".cannot-drag",
        ghostClass: "drag-ghost",    // Class applied to the placeholder
        chosenClass: "drag-chosen",  // Class applied when picking up
        dragClass: "dragging-active", // Class applied during drag
        onMove: (evt) => {
          return !evt.related.classList.contains("cannot-drag");
        },
        onEnd: () => {
          const newOrderIds = Array.from(
            cardGrid.querySelectorAll('.card:not(.cannot-drag)')
          ).map(el => el.dataset.id);
          dashboardData = newOrderIds
            .map(id => dashboardData.find(c => c.id === id))
            .filter(Boolean);
          saveCardLayout();
        }
      });
    }
  } catch (error) {
    console.error("Error setting up drag and drop:", error);
  }
}

function setupChartDragAndDrop() {
  try {
    console.log("Setting up chart drag and drop...");
    const chartColumns = document.querySelectorAll(".chart-column");

    chartColumns.forEach((column, index) => {
      if (sortables[index + 1]) sortables[index + 1].destroy(); // Avoid duplicate sortables

      sortables[index + 1] = new Sortable(column, {
        animation: 200,
        handle: ".chart-container", // Make the entire chart container draggable
        ghostClass: "chart-drag-ghost",
        chosenClass: "chart-drag-chosen",
        dragClass: "chart-dragging-active",
        group: "charts", // Shared group so charts can move between columns
        onEnd: () => {
          console.log("Charts reordered!");
          saveChartLayout();
        }
      });
    });
  } catch (error) {
    console.error("Error setting up chart drag and drop:", error);
  }
}

function saveChartLayout() {
  const columns = document.querySelectorAll(".chart-column");
  const layout = Array.from(columns).map(column =>
    Array.from(column.querySelectorAll(".chart-container")).map(el => el.id)
  );
  localStorage.setItem("chartLayout", JSON.stringify(layout));
  console.log("Chart layout saved:", layout);
}

function loadChartLayout() {
  const layout = JSON.parse(localStorage.getItem("chartLayout"));
  if (!layout) return;
  const columns = document.querySelectorAll(".chart-column");

  layout.forEach((columnChartIds, index) => {
    const column = columns[index];
    if (!column) return;
    columnChartIds.forEach(chartId => {
      const chartEl = document.getElementById(chartId);
      if (chartEl) column.appendChild(chartEl);
    });
  });
}

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
        masterDashboardData = aggregateTaskData(fullTasksSnapshot);

        const savedCardIds = JSON.parse(localStorage.getItem(`dashboardLayout_${projectId}`));
        if (savedCardIds && savedCardIds.length > 0) {
          // Re-create the dashboardData array based on the saved order of IDs
          dashboardData = savedCardIds.map(id => masterDashboardData.find(card => card.id === id)).filter(Boolean);
        } else {
          // If nothing is saved, show the first 6 cards by default
          dashboardData = masterDashboardData.slice(0, 6);
        }

        renderDashboard();
       // addPlaceholderWidgets();
        setupDragAndDrop();
        setupChartDragAndDrop();
        loadChartLayout();

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

function saveCardLayout() {
  const projectId = getProjectIdFromUrl();
  if (!projectId) return;

  const visibleIds = dashboardData.map(card => card.id);
  localStorage.setItem(`dashboardLayout_${projectId}`, JSON.stringify(visibleIds));
}

export { init };


