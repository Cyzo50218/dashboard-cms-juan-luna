import { Chart, registerables } from 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.esm.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collectionGroup,
  collection,
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

let projectDocRef = null;

async function fetchInitialData(projectId) {
  if (!projectId) {
    console.error("Project ID is required.");
    return false;
  }
  try {
    const projectQuery = query(collectionGroup(db, 'projects'), where('projectId', '==', projectId));
    const projectSnapshot = await getDocs(projectQuery);
    if (projectSnapshot.empty) throw new Error(`Project ${projectId} not found.`);
    const projectDoc = projectSnapshot.docs[0]; // Get the full document
    projectConfig = projectDoc.data();           // Store the data as before
    projectDocRef = projectDoc.ref;              // **Store the document reference**
    const tasksQuery = query(collectionGroup(db, 'tasks'), where('projectId', '==', projectId));
    fullTasksSnapshot = await getDocs(tasksQuery);

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

      const filterCount = card.localFilters ? Object.keys(card.localFilters).length : 0;
      const badgeHTML = filterCount > 0 ? `<span class="filter-count-badge">${filterCount}</span>` : '';

      let formattedValue;
      switch (card.valueFormat) {
        case 'currency':
          formattedValue = "₱" + formatNumber(card.value);
          break;
        case 'percent':
          formattedValue = (card.value || 0).toFixed(2) + "%";
          break;
        default:
          formattedValue = formatNumber(card.value);
      }
      cardEl.innerHTML = `
  <button class="edit-card-btn absolute top-2 right-8 text-gray-400 hover:text-blue-500">
    <i class="fas fa-edit"></i>
  </button>
  <button class="remove-card-btn absolute top-2 right-2 text-gray-400 hover:text-red-500">
    <i class="fas fa-times"></i>
  </button>
  <div class="flex flex-col items-center justify-center h-full pt-2">
    <h2 class="text-sm font-medium mb-1 text-center px-1">${card.title}</h2>
    <p class="text-xl font-light mb-4 text-center">${formattedValue}</p>
    <div class="card-filter-container relative inline-block text-left w-full flex justify-center"></div>
  </div>
`;

      const editBtn = cardEl.querySelector(".edit-card-btn");
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cardToEdit = dashboardData.find(c => c.id === card.id);
        if (cardToEdit) {
          openAddCardModal(cardToEdit);
        }
      });

      const removeBtn = cardEl.querySelector(".remove-card-btn");
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dashboardData = dashboardData.filter(c => c.id !== card.id);
        saveCardLayout(); // Update layout
        renderDashboard();
      });

      const filterContainer = cardEl.querySelector('.card-filter-container');
      // if (card.filterOptions && Object.keys(card.filterOptions).length > 0) {
      const filterButton = document.createElement("button");
      filterButton.type = "button";
      filterButton.className = "filter-button mt-4 relative flex items-center justify-center";
      filterButton.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="2 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M6 12h12M9 18h6"></path></svg>${badgeHTML}`;
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
      globalAllRadio.checked = filterCount === 0;

      globalAllRadio.addEventListener('change', () => {
        const targetCard = dashboardData.find(c => c.id === card.id);
        if (targetCard) {
          targetCard.localFilters = {};
          recalculateCardValue(targetCard);
          renderDashboard();
        }
      });
      globalAllLabel.appendChild(globalAllRadio);
      const globalAllText = document.createElement('span');
      globalAllText.textContent = "All Tasks";
      globalAllLabel.appendChild(globalAllText);
      globalAllGroup.appendChild(globalAllLabel);
      dropdown.appendChild(globalAllGroup);

      // Filter groups
      function createFilterGroup(title, options, filterTypeId) {
        const group = document.createElement("div");
        group.className = "px-3 py-2 border-b border-gray-300";
        group.innerHTML = `<p class="font-semibold mb-1">${title}</p>`;
        const radioGroupName = `filter-${card.id}-${filterTypeId}`;

        const handleFilterChange = (event) => {
          const value = event.target.value;
          const targetCard = dashboardData.find(c => c.id === card.id);
          if (!targetCard) return;

          if (!targetCard.localFilters) targetCard.localFilters = {};

          if (value === 'all') {
            delete targetCard.localFilters[filterTypeId];
          } else {
            targetCard.localFilters[filterTypeId] = value;
          }

          recalculateCardValue(targetCard);
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
        group.appendChild(createRadioOption('all', 'All', !card.localFilters?.[filterTypeId]));
        options.forEach(opt => {
          group.appendChild(createRadioOption(opt, opt, card.localFilters?.[filterTypeId] === opt));
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
      //}

      cardsContainer.appendChild(cardEl);
    });

    const displayedIds = new Set(dashboardData.map(c => c.id));
    const hasMoreCards = masterDashboardData.some(c => !displayedIds.has(c.id));

    const addCardWidget = document.createElement("div");
    addCardWidget.className = "card card-placeholder cannot-drag";
    addCardWidget.innerHTML = `
<div class="flex flex-col items-center justify-center h-full">
<svg class="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
<span class="mt-2 text-sm font-medium text-gray-500">Add Card</span>
</div>
`;

    addCardWidget.addEventListener('click', () => {
      openAddCardModal();
    });
    cardsContainer.appendChild(addCardWidget);

  } catch (error) {
    console.error("Error creating cards:", error);
  }
}

async function openAddCardModal(cardToEdit = null) {
  const isEditMode = cardToEdit !== null;

  // Remove existing modal
  const existingModal = document.querySelector('.widget-modal-overlay');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'widget-modal-overlay';

  modalOverlay.innerHTML = `
    <div class="add-card-modal">
      <div class="modal-header">
        <h3>${isEditMode ? 'Edit Card' : 'Add Card'}</h3>
      </div>

      <div class="modal-body">
        <div class="modal-preview-pane">
          <div class="preview-card-container">
            <div class="card relative preview-card">
              <input type="text" id="preview-title-input" class="preview-title-input" value="New Metric Card">
              <p id="preview-value" class="preview-value-text">0</p>
            </div>
          </div>
        </div>

        <div class="modal-config-pane">
          <!-- Card Data Section -->
          <div class="config-section">
            <h4 class="config-header">Card Data</h4>
            <div class="form-group">
              <label for="metric-type">Value Type</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <select id="metric-type" class="modal-select" style="flex: 1;"></select>
                <select id="calc-type" class="modal-select" style="width: 140px; display: none;">
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                </select>
              </div>
            </div>

            <!-- Display Format -->
            <div class="form-group">
              <label for="value-format">Display Format</label>
              <select id="value-format" class="modal-select">
                <option value="number">Plain Number</option>
                <option value="currency">Currency</option>
                <option value="percent">Percentage</option>
              </select>
            </div>
          </div>
          
          <hr class="config-divider">

          <div class="config-section">
            <h4 class="config-header">Card Styles</h4>
            <div class="form-group">
              <label>Background Color</label>
              <div class="color-picker-container">
                <button id="bg-color-button" class="color-display"></button>
                <div id="bg-color-palette" class="color-palette hidden">
                  <div class="palette-section">
                    <div class="palette-title">Suggested Colors</div>
                    <div class="palette-grid" id="bg-relaxing-colors"></div>
                  </div>
                  <div class="palette-section">
                    <div class="palette-title">Recent Colors</div>
                    <div class="palette-grid" id="bg-recent-colors"></div>
                  </div>
                  <div class="palette-section">
                    <input type="color" id="bg-color-picker">
                  </div>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label>Text Color</label>
              <div class="color-picker-container">
                <button id="text-color-button" class="color-display"></button>
                <div id="text-color-palette" class="color-palette hidden">
                  <div class="palette-section">
                    <div class="palette-title">Suggested Colors</div>
                    <div class="palette-grid" id="text-relaxing-colors"></div>
                  </div>
                  <div class="palette-section">
                    <div class="palette-title">Recent Colors</div>
                    <div class="palette-grid" id="text-recent-colors"></div>
                  </div>
                  <div class="palette-section">
                    <input type="color" id="text-color-picker">
                  </div>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label>Font Style</label>
              <select id="font-style-select" class="modal-select">
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="italic">Italic</option>
              </select>
            </div>
          </div>

          <hr class="config-divider">

          <div class="config-section">
            <h4 class="config-header">Filters</h4>
            <div class="add-filter-wrapper">
              <button id="add-filter-btn" class="add-filter-button">
                <span class="material-icons-outlined">add</span>
                Add Filter
              </button>
              <div id="add-filter-menu" class="add-filter-menu hidden"></div>
            </div>
            <div id="active-filters-container"></div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button id="cancel-add-card" class="modal-button-secondary">Cancel</button>
        <button id="confirm-add-card" class="modal-button-primary">${isEditMode ? 'Save Changes' : 'Add Card'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  // --- State ---
  let cardConfig = {
    title: isEditMode ? cardToEdit.title : 'New Card',
    metric: isEditMode ? cardToEdit.metric || 'count' : 'count',
    costCalcType: isEditMode ? cardToEdit.costCalcType || 'sum' : 'sum', // NEW
    valueFormat: isEditMode ? cardToEdit.valueFormat || 'number' : 'number',
    filters: isEditMode ? { ...(cardToEdit.baseFilters || {}) } : {}
  };

  const titleInput = modalOverlay.querySelector('#preview-title-input');
  const metricSelect = modalOverlay.querySelector('#metric-type');
  const calcTypeSelect = modalOverlay.querySelector('#calc-type');
  const formatSelect = modalOverlay.querySelector('#value-format');
  titleInput.value = cardConfig.title;
  formatSelect.value = cardConfig.valueFormat;

  const previewValueEl = modalOverlay.querySelector('#preview-value');
  const addFilterBtn = modalOverlay.querySelector('#add-filter-btn');
  const addFilterMenu = modalOverlay.querySelector('#add-filter-menu');
  const activeFiltersContainer = modalOverlay.querySelector('#active-filters-container');

  const allFilterableColumns = [...projectConfig.defaultColumns, ...projectConfig.customColumns]
    .filter(c => c.options && c.options.length > 0);

  const allPossibleFilterOptions = {};
  allFilterableColumns.forEach(col => {
    if (col.options) {
      allPossibleFilterOptions[col.name] = col.options.map(o => o.name);
    }
  });

  try {
    if (!projectDocRef) throw new Error("Project reference is not available.");
    const sectionsQuery = query(collection(projectDocRef, 'sections'));
    const sectionsSnapshot = await getDocs(sectionsQuery);
    const sectionOptions = sectionsSnapshot.docs.map(doc => ({ name: doc.data().title }));

    if (sectionOptions.length > 0) {
      allFilterableColumns.push({
        id: 'sectionTitle',
        name: 'Section',
        options: sectionOptions
      });
    }
  } catch (error) {
    console.error("Error fetching sections for filter:", error);
  }

  // --- Update Preview ---
  const updatePreview = () => {
    const filteredDocs = fullTasksSnapshot.docs.filter(doc => {
      const task = doc.data();
      return Object.entries(cardConfig.filters).every(([colId, filterValue]) => {
        if (!filterValue) return true;
        if (colId === 'status') {
          const isCurrentStatus = task.status === filterValue;
          const wasPreviousAndIsNowCompleted =
            task.previousStatus === filterValue && task.status === 'Completed';
          return isCurrentStatus || wasPreviousAndIsNowCompleted;
        }
        let taskVal;
        if (colId === 'sectionTitle') {
          taskVal = task.sectionTitle;
        } else {
          const isCustom = !projectConfig.defaultColumns.some(c => c.id == colId);
          taskVal = isCustom ? task.customFields?.[colId] : task[colId];
        }
        return taskVal === filterValue;
      });
    });

    const filteredSnapshot = { docs: filteredDocs, size: filteredDocs.length };
    const statusColumn = projectConfig.defaultColumns.find(c => c.id === 'status');
    const costingColumns = projectConfig.customColumns.filter(c => c.type === 'Costing' || c.type === 'Number');

    const completionStatusName = statusColumn?.options?.find(o => o.name.toLowerCase() === 'completed')?.name;
    const cancelledStatusName = statusColumn?.options?.find(o => o.name.toLowerCase() === 'cancelled')?.name;

    let generalCounts = { completed: 0, overdue: 0 };
    let paymentMadeTotal = 0;
    let balanceTotal = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    filteredSnapshot.docs.forEach(doc => {
      const task = doc.data();
      let taskTotalCost = 0;
      costingColumns.forEach(col => {
        const costValue = task.customFields?.[col.id];
        if (typeof costValue === 'number') taskTotalCost += costValue;
      });

      if (task.status === completionStatusName) {
        generalCounts.completed++;
        paymentMadeTotal += taskTotalCost;
      } else if (task.status !== cancelledStatusName) {
        balanceTotal += taskTotalCost;
        if (task.dueDate && new Date(task.dueDate) < today) {
          generalCounts.overdue++;
        }
      }
    });

    let value = 0;

    // --- Cost-specific calculation ---
    if (cardConfig.metric.startsWith('cost-')) {
      const fieldId = cardConfig.metric.replace('cost-', '');
      const nums = filteredSnapshot.docs
        .map(doc => doc.data().customFields?.[fieldId])
        .filter(v => typeof v === 'number');

      switch (cardConfig.costCalcType) {
        case 'sum':
          value = nums.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          value = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
          break;
        case 'min':
          value = nums.length ? Math.min(...nums) : 0;
          break;
        case 'max':
          value = nums.length ? Math.max(...nums) : 0;
          break;
      }
    }
    else {
      // --- Existing metric calculation ---
      switch (cardConfig.metric) {
        case 'count': value = filteredSnapshot.size; break;
        case 'completedTasks': value = generalCounts.completed; break;
        case 'overdueTasks': value = generalCounts.overdue; break;
        case 'cardBalance': value = balanceTotal; break;
        case 'totalPaymentMade': value = paymentMadeTotal; break;
      }
    }

    // Apply display format
    if (cardConfig.valueFormat === 'currency') {
      previewValueEl.textContent = "₱" + formatNumber(value);
    } else if (cardConfig.valueFormat === 'percent') {
      previewValueEl.textContent = value.toFixed(2) + "%";
    } else {
      previewValueEl.textContent = formatNumber(value);
    }
  };

  // --- Build Value Type dropdown ---
  let calculationOptions = [
    { id: 'count', name: 'Count of Tasks' },
    { id: 'completedTasks', name: 'Completed Tasks' },
    { id: 'overdueTasks', name: 'Overdue Tasks' },
    { id: 'cardBalance', name: 'Card Balance' },
    { id: 'totalPaymentMade', name: 'Total Payment Made' }
  ];

  // Add each costing column as a "Cost" type option
  projectConfig.customColumns
    .filter(c => c.type === 'Costing')
    .forEach(c => {
      calculationOptions.push({
        id: `cost-${c.id}`, // unique per costing column
        name: `${c.name}` // shows column name
      });
    });

  // Fill metric select
  metricSelect.innerHTML = calculationOptions
    .map(opt => `<option value="${opt.id}">${opt.name}</option>`)
    .join('');

  metricSelect.value = cardConfig.metric || 'count';
  calcTypeSelect.value = cardConfig.costCalcType || 'sum';

  // --- Event Listeners ---
  titleInput.addEventListener('input', e => { cardConfig.title = e.target.value; });

  metricSelect.addEventListener('change', e => {
    cardConfig.metric = e.target.value;
    calcTypeSelect.style.display = cardConfig.metric.startsWith('cost-') ? 'block' : 'none';
    updatePreview();
  });

  calcTypeSelect.addEventListener('change', e => {
    cardConfig.costCalcType = e.target.value;
    updatePreview();
  });

  formatSelect.addEventListener('change', e => { cardConfig.valueFormat = e.target.value; updatePreview(); });

  // Filters (unchanged)
  addFilterBtn.addEventListener('click', e => { e.stopPropagation(); addFilterMenu.classList.toggle('hidden'); });

  addFilterMenu.innerHTML = allFilterableColumns.map(col => `<a href="#" class="add-filter-menu-item" data-col-id="${col.id}">${col.name}</a>`).join('');
  addFilterMenu.querySelectorAll('.add-filter-menu-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const colId = item.dataset.colId;
      if (!cardConfig.filters.hasOwnProperty(colId)) {
        cardConfig.filters[colId] = null;
        renderActiveFilterPanels();
      }
      addFilterMenu.classList.add('hidden');
    });
  });

  const closeModal = () => {
    modalOverlay.remove();
    document.removeEventListener('click', globalClickHandler);
  };

  modalOverlay.querySelector('#cancel-add-card').addEventListener('click', closeModal);

  let globalClickHandler = e => {
    if (!addFilterBtn.contains(e.target) && !addFilterMenu.contains(e.target)) {
      addFilterMenu.classList.add('hidden');
    }
    if (e.target === modalOverlay) {
      closeModal();
    }
  };
  document.addEventListener('click', globalClickHandler);

  modalOverlay.querySelector('#confirm-add-card').addEventListener('click', () => {
    if (isEditMode) {
      const cardToUpdate = dashboardData.find(c => c.id === cardToEdit.id);
      if (cardToUpdate) {
        cardToUpdate.title = cardConfig.title;
        cardToUpdate.metric = cardConfig.metric;
        cardToUpdate.valueFormat = cardConfig.valueFormat;
        cardToUpdate.baseFilters = cardConfig.filters;
        cardToUpdate.localFilters = { ...cardConfig.filters };
        cardToUpdate.costCalcType = cardConfig.costCalcType || 'sum';

        console.log(cardToUpdate);
        recalculateCardValue(cardToUpdate);
      }
    } else {
      const finalValue = parseFloat(previewValueEl.textContent.replace(/,/g, '').replace(/[₱%]/g, ''));
      const newCardId = `metric-${Date.now()}`;
      dashboardData.push({
        id: newCardId,
        title: cardConfig.title,
        value: finalValue,
        metric: cardConfig.metric,
        valueFormat: cardConfig.valueFormat,
        baseFilters: cardConfig.filters,
        filterOptions: allPossibleFilterOptions,
        localFilters: { ...cardConfig.filters },
        costCalcType: cardConfig.costCalcType || 'sum'
      });
    }
    saveCardLayout();
    renderDashboard();
    closeModal();
  });

  renderActiveFilterPanels();
  calcTypeSelect.style.display = cardConfig.metric.startsWith('cost-') ? 'block' : 'none';
  updatePreview();

  function renderActiveFilterPanels() {
    activeFiltersContainer.innerHTML = '';
    Object.keys(cardConfig.filters).forEach(colId => {
      const column = allFilterableColumns.find(c => c.id == colId);
      if (!column) return;
      const panel = document.createElement('div');
      panel.className = 'filter-panel';
      panel.innerHTML = `
        <div class="filter-panel-header">
          <span>${column.name}</span>
          <button class="remove-filter-btn" data-col-id="${colId}">
            <span class="material-icons-outlined">close</span>
          </button>
        </div>
      `;
      const panelBody = document.createElement('div');
      panelBody.className = 'filter-panel-body';
      const radioGroupName = `modal-filter-${colId}`;

      const allOptionLabel = document.createElement('label');
      allOptionLabel.className = 'radio-label';
      allOptionLabel.innerHTML = `<input type="radio" name="${radioGroupName}" value=""> <span>All ${column.name}</span>`;
      allOptionLabel.querySelector('input').checked = !cardConfig.filters[colId];
      allOptionLabel.querySelector('input').onchange = () => {
        delete cardConfig.filters[colId];
        renderActiveFilterPanels();
        updatePreview();
      };
      panelBody.appendChild(allOptionLabel);

      column.options.forEach(opt => {
        const optLabel = document.createElement('label');
        optLabel.className = 'radio-label';
        optLabel.innerHTML = `<input type="radio" name="${radioGroupName}" value="${opt.name}"> <span>${opt.name}</span>`;
        optLabel.querySelector('input').checked = cardConfig.filters[colId] === opt.name;
        optLabel.querySelector('input').onchange = e => {
          cardConfig.filters[colId] = e.target.value;
          updatePreview();
        };
        panelBody.appendChild(optLabel);
      });

      panel.appendChild(panelBody);
      activeFiltersContainer.appendChild(panel);
    });
  }
}

function renderDashboard() {
  console.log("Rendering dashboard from current state.");
  createCards();
  initCharts(projectConfig, fullTasksSnapshot);
}

function getProjectIdFromUrl() {
  const match = window.location.pathname.match(/\/tasks\/[^/]+\/dashboard\/([^/]+)/);
  return match ? match[1] : null;
}

function formatNumber(num) {
  const sign = num < 0 ? "-" : "";
  const val = Math.abs(num).toLocaleString("en-US");
  return sign + val;
}

function recalculateCardValue(targetCard) {
  if (!targetCard || !fullTasksSnapshot) return 0;
  const metric = typeof targetCard.metric === "string" ? targetCard.metric : "count";

  const baseFilters = targetCard.baseFilters || {};
  const localFilters = targetCard.localFilters || {};
  const combinedFilters = { ...baseFilters, ...localFilters };

  const filteredDocs = fullTasksSnapshot.docs.filter(doc => {
    const task = doc.data();
    return Object.entries(combinedFilters).every(([colId, filterValue]) => {
      if (!filterValue) return true; // allow "All"
      if (colId === 'status') {
        const isCurrentStatus = task.status === filterValue;
        const wasPreviousAndIsNowCompleted =
          task.previousStatus === filterValue && task.status === 'Completed';
        return isCurrentStatus || wasPreviousAndIsNowCompleted;
      }
      const isCustom = !projectConfig.defaultColumns.some(c => c.id === colId);
      const taskValue = isCustom ? task.customFields?.[colId] : task[colId];
      return taskValue === filterValue;
    });
  });

  let finalValue = 0;

  // --- Handle cost-based metrics ---
  if (metric.startsWith("cost-")) {
    const fieldId = metric.replace("cost-", "");
    const nums = filteredDocs
      .map(doc => doc.data().customFields?.[fieldId])
      .filter(v => typeof v === "number");

    switch (targetCard.costCalcType || "sum") {
      case "sum":
        finalValue = nums.reduce((a, b) => a + b, 0);
        break;
      case "avg":
        finalValue = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        break;
      case "min":
        finalValue = nums.length ? Math.min(...nums) : 0;
        break;
      case "max":
        finalValue = nums.length ? Math.max(...nums) : 0;
        break;
    }
  }
  // --- Handle normal metrics ---
  else if (metric === "count") {
    finalValue = filteredDocs.length;
  } else if (metric === "completedTasks") {
    finalValue = filteredDocs.filter(doc => doc.data().status === "Completed").length;
  } else if (metric === "overdueTasks") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    finalValue = filteredDocs.filter(doc => doc.data().dueDate && new Date(doc.data().dueDate) < today).length;
  }

  targetCard.value = finalValue;
  return finalValue;
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
      const widgetButton = document.getElementById('addwidget-btn');

      const widgetDropdown = document.getElementById('widget-dropdown');
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
        const savedData = JSON.parse(localStorage.getItem(`dashboardLayout_${projectId}`));

        if (savedData && savedData.length > 0 && typeof savedData[0] === 'object' && savedData[0] !== null) {
          // It's the new format (array of objects), so we can use it.
          dashboardData = savedData;
          console.log("Loaded card layout from new object format.");
        } else {
          // It's the old string format or empty/invalid. Load a default layout.
          console.log("Old layout format detected. Loading default cards.");
          masterDashboardData = aggregateTaskData(fullTasksSnapshot);
          dashboardData = masterDashboardData.slice(0, 6);
          saveCardLayout();
        }

        dashboardData.forEach(card => {
          if (!card.localFilters) card.localFilters = {};
          if (!card.baseFilters) card.baseFilters = {};
          recalculateCardValue(card);
        });

        renderDashboard();
        setupDragAndDrop();
        setupChartDragAndDrop();
        loadChartLayout();

        document.body.addEventListener("click", (e) => {
          if (!e.target.closest(".origin-top-left") && !e.target.closest(".filter-button")) {
            document.querySelectorAll(".origin-top-left").forEach((dd) => (dd.style.display = "none"));
          }
        });

        widgetButton.addEventListener('click', (event) => {
          event.stopPropagation();
          widgetDropdown.classList.toggle('hidden');
        });

        const options = widgetDropdown.querySelectorAll('a');
        const chartOption = options[0];
        const cardOption = options[1];
        chartOption.addEventListener('click', (event) => {
          event.preventDefault();
          console.log('Chart Widget option clicked!');
          openAddCardModal();
          widgetDropdown.classList.add('hidden');
        });

        cardOption.addEventListener('click', (event) => {
          event.preventDefault();
          console.log('Card Widget option clicked!');

          widgetDropdown.classList.add('hidden');
        });

        document.addEventListener('click', () => {
          if (!widgetDropdown.classList.contains('hidden')) {
            widgetDropdown.classList.add('hidden');
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

  const layoutToSave = dashboardData.map(card => ({
    id: card.id,
    title: card.title,
    metric: card.metric,
    valueFormat: card.valueFormat,
    costCalcType: card.costCalcType || 'sum',
    baseFilters: card.baseFilters || {},
    localFilters: card.localFilters || {},
    filterOptions: card.filterOptions
  }));

  localStorage.setItem(`dashboardLayout_${projectId}`, JSON.stringify(layoutToSave));
  console.log("Dashboard layout saved to localStorage.");
}

export { init };


