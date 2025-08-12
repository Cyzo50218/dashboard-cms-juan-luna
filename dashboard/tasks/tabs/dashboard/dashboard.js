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
let allFilterableColumns = [];

let projectDocRef = null;
let sectionIdToName = {};

const STATIC_CHART_CONFIGS = {
  'bar-chart-container': {
    id: 'bar-chart-container',
    title: 'Task Completion Overview',
    cardType: 'bar',
    metric: 'count',
    isDefault: true,
    // Add default styles
    bgColor: '#FFFFFF',
    textColor: '#111827',
    fontStyle: 'inherit'
  },
  'pie-chart-container': {
    id: 'pie-chart-container',
    title: 'Task Distribution',
    cardType: 'pie',
    metric: 'count',
    isDefault: true,
    // Add default styles
    bgColor: '#FFFFFF',
    textColor: '#111827',
    fontStyle: 'inherit'
  },
  'line-chart-container': {
    id: 'line-chart-container',
    title: 'Task Timeline',
    cardType: 'line',
    metric: 'count',
    isDefault: true,
    // Add default styles
    bgColor: '#FFFFFF',
    textColor: '#111827',
    fontStyle: 'inherit'
  },
  'doughnut-chart-container': {
    id: 'doughnut-chart-container',
    title: 'Priority Distribution',
    cardType: 'doughnut',
    metric: 'count',
    isDefault: true,
    // Add default styles
    bgColor: '#FFFFFF',
    textColor: '#111827',
    fontStyle: 'inherit'
  }
};

const CALCULATION_OPTIONS = {
  'count': 'Count of Tasks',
  'completedTasks': 'Completed Tasks',
  'overdueTasks': 'Overdue Tasks',
  'cardBalance': 'Card Balance',
  'totalPaymentMade': 'Total Payment Made'
};

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
  const costingColumns = projectConfig.customColumns.filter(c => c.type === 'Costing');

  const allSelectColumns = [
    ...projectConfig.defaultColumns.filter(c => c.options && c.options.length > 0),
    ...projectConfig.customColumns.filter(c => c.options && c.options.length > 0)
  ];

  const completionStatusName = statusColumn?.options?.find(
    o => o.name.toLowerCase() === 'completed'
  )?.name;
  const cancelledStatusName = statusColumn?.options?.find(
    o => o.name.toLowerCase() === 'cancelled'
  )?.name;

  let generalCounts = { completed: 0, incomplete: 0, overdue: 0 };
  let paymentMadeTotal = 0;
  let balanceTotal = 0;
  const selectOptionCounts = {};

  allSelectColumns.forEach(col => {
    selectOptionCounts[col.id] = {};
    col.options.forEach(opt => {
      selectOptionCounts[col.id][opt.name] = 0;
    });
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  tasksSnapshot.forEach(doc => {
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
      generalCounts.incomplete++;
      balanceTotal += taskTotalCost;
      if (task.dueDate && new Date(task.dueDate) < today) {
        generalCounts.overdue++;
      }
    }

    allSelectColumns.forEach(col => {
      const isCustom = !projectConfig.defaultColumns.some(dc => dc.id === col.id);
      const value = isCustom ? task.customFields?.[col.id] : task[col.id];
      if (value && selectOptionCounts[col.id]?.hasOwnProperty(value)) {
        selectOptionCounts[col.id][value]++;
      }
    });
  });

  // --- Build one master filter set ---
  const cardFilterOptions = {};

  // Add all select columns
  allSelectColumns.forEach(col => {
    cardFilterOptions[col.name] = col.options.map(o => o.name);
  });

  // Always inject Sections
  if (sectionIdToName && Object.keys(sectionIdToName).length > 0) {
    cardFilterOptions["Sections"] = Object.values(sectionIdToName);
  }

  // Always inject Status
  if (statusColumn?.options?.length > 0) {
    cardFilterOptions["Status"] = statusColumn.options.map(o => o.name);
  }

  // --- Build cards ---
  const allPossibleCards = [
    { id: 'totalTasks', title: 'Total Tasks', metric: 'count', value: tasksSnapshot.size },
    { id: 'completedTasks', title: 'Completed Tasks', metric: 'completedTasks', value: generalCounts.completed },
    { id: 'incompleteTasks', title: 'Incomplete Tasks', metric: 'count', value: generalCounts.incomplete },
    { id: 'overdueTasks', title: 'Overdue Tasks', metric: 'overdueTasks', value: generalCounts.overdue },
    { id: 'totalPaymentMade', title: 'Total Payment Made', metric: 'cost-totalPaymentMade', value: paymentMadeTotal },
    { id: 'cardBalance', title: 'Card Balance', metric: 'cardBalance', value: balanceTotal }
  ].map(card => ({
    ...card,
    filterOptions: { ...cardFilterOptions }
  }));

  // Metric cards for each select option
  allSelectColumns.forEach(col => {
    col.options.forEach(option => {
      allPossibleCards.push({
        id: `count-${col.id}-${option.name.replace(/\s+/g, '-')}`,
        title: `${col.name}: ${option.name}`,
        metric: 'count',
        value: selectOptionCounts[col.id][option.name] || 0,
        filterOptions: { ...cardFilterOptions }
      });
    });
  });

  return allPossibleCards;
}


async function fetchSections(projectId) {
  try {
    if (!projectDocRef) throw new Error("Project reference is not available.");

    const sectionsQuery = query(collection(projectDocRef, 'sections'));
    const sectionsSnapshot = await getDocs(sectionsQuery);

    sectionIdToName = {};
    const sectionOptions = sectionsSnapshot.docs.map(doc => {
      const title = doc.data().title;
      sectionIdToName[doc.id] = title; // store for later filtering
      return { name: title };
    });

    if (sectionOptions.length > 0) {
      allFilterableColumns.push({
        id: 'sectionId', // ✅ match your filter key
        name: 'Sections',
        options: sectionOptions
      });
    }
  } catch (error) {
    console.error("Error fetching sections for filter:", error);
  }
}

function createCards() {
  try {
    if (!cardsContainer) return;
    cardsContainer.innerHTML = "";

    dashboardData.filter(card => card.cardType === 'number').forEach((card) => {
      const cardEl = document.createElement("div");
      cardEl.className = "card relative"; // Add relative for positioning
      cardEl.dataset.id = card.id;
      if (card.bgColor) cardEl.style.backgroundColor = card.bgColor;
      if (card.fontStyle) cardEl.style.fontFamily = card.fontStyle;
      const filterCount = card.localFilters ? Object.keys(card.localFilters).length : 0;
      const badgeHTML = filterCount > 0 ? `<span class="filter-count-badge">${filterCount}</span>` : '';

      let formattedValue;
      switch (card.valueFormat) {
        case 'currency':
          const symbol = card.currencySymbol || '₱';
          formattedValue = symbol + formatNumber(card.value);
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

      const titleEl = cardEl.querySelector("h2");
      const valueEl = cardEl.querySelector("p");
      const filterButtonEl = cardEl.querySelector(".filter-button svg");
      const badgeEl = cardEl.querySelector(".filter-count-badge");

      if (card.textColor) {
        if (titleEl) titleEl.style.color = card.textColor;
        if (valueEl) valueEl.style.color = card.textColor;

        // Apply to filter icon
        if (filterButtonEl) filterButtonEl.style.stroke = card.textColor;

        // Apply to filter count badge
        if (badgeEl) {
          badgeEl.style.color = card.textColor;
          // Optional: badge background can also be adjusted if needed:
          // badgeEl.style.backgroundColor = card.textColor;
        }
      }

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

      // Build section filter options from sectionIdToName
      const sectionOptions = Object.entries(sectionIdToName || {});
      // Now sectionOptions is an array like: [ [id, name], [id, name] ]

      if (sectionOptions.length > 0) {
        const sectionGroup = document.createElement("div");
        sectionGroup.className = "px-3 py-2 border-b border-gray-300";
        sectionGroup.innerHTML = `<p class="font-semibold mb-1">Sections</p>`;
        const radioGroupName = `filter-${card.id}-sectionId`;

        const handleSectionChange = (event) => {
          const value = event.target.value;
          const targetCard = dashboardData.find(c => c.id === card.id);
          if (!targetCard) return;

          if (!targetCard.localFilters) targetCard.localFilters = {};

          if (value === 'all') {
            delete targetCard.localFilters['sectionId'];
          } else {
            targetCard.localFilters['sectionId'] = value; // store actual sectionId
          }

          recalculateCardValue(targetCard);
          renderDashboard();
        };

        const createSectionOption = (id, name, isChecked) => {
          const label = document.createElement("label");
          label.className = "flex items-center space-x-2 py-1 cursor-pointer";
          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = radioGroupName;
          radio.value = id; // ✅ store sectionId
          radio.checked = isChecked;
          radio.addEventListener('change', handleSectionChange);
          label.appendChild(radio);
          const textSpan = document.createElement('span');
          textSpan.textContent = name; // show friendly name
          label.appendChild(textSpan);
          return label;
        };

        sectionGroup.appendChild(createSectionOption('all', 'All', !card.localFilters?.['sectionId']));
        sectionOptions.forEach(([id, name]) => {
          sectionGroup.appendChild(
            createSectionOption(id, name, card.localFilters?.['sectionId'] === id)
          );
        });

        dropdown.appendChild(sectionGroup);
      }

      // Build status filter options from status column
      const statusColumn = projectConfig.defaultColumns.find(c => c.id === 'status');
      const statusOptions = statusColumn?.options?.map(o => o.name) || [];

      // Existing filter groups from card.filterOptions
      for (const filterTitle in card.filterOptions) {
        const options = card.filterOptions[filterTitle];
        const column = [...projectConfig.defaultColumns, ...projectConfig.customColumns]
          .find(c => c.name === filterTitle);
        if (!column) continue;

        const displayTitle = filterTitle; // Keep original name
        if (options && Array.isArray(options) && options.length > 0) {
          dropdown.appendChild(createFilterGroup(displayTitle, options, column.id));
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

  const initialTitle = isEditMode && cardToEdit.title
    ? cardToEdit.title
    : cardToEdit?.cardType !== 'number'
      ? 'New Chart'
      : 'New Metric Card';

  modalOverlay.innerHTML = `
    <div class="add-card-modal">
      <div class="modal-header">
        <h3>${isEditMode ? 'Edit Card' : 'Add Card'}</h3>
      </div>

      <div class="modal-body">
        <div class="modal-preview-pane">
          <div class="preview-card-container">
            <div class="card relative preview-card">
              <input type="text" id="preview-title-input" class="preview-title-input" value="${initialTitle}">
              <p id="preview-value" class="preview-value-text">0</p>
            </div>
          </div>
        </div>

        <div class="modal-config-pane">
          <!-- Card Data Section -->

          <div class="form-group">
  <label for="card-type">Card Type</label>
  <div id="card-type" class="custom-select modal-select">
    <div class="selected">
      <span class="text"># Number</span>
      <span class="material-icons dropdown-icon">expand_more</span>
    </div>
    <div class="dropdown-list hidden">
      <div class="dropdown-item" data-value="number">
        <span class="material-icons">pin</span>
        <span class="text">Number</span>
      </div>
      <div class="dropdown-item" data-value="bar">
        <span class="material-icons">bar_chart</span>
        <span class="text">Bar Chart</span>
      </div>
      <div class="dropdown-item" data-value="horizontalBar">
        <span class="material-icons">stacked_bar_chart</span>
        <span class="text">Horizontal Bar Chart</span>
      </div>
      <div class="dropdown-item" data-value="line">
        <span class="material-icons">show_chart</span>
        <span class="text">Line Chart</span>
      </div>
      <div class="dropdown-item" data-value="area">
        <span class="material-icons">timeline</span>
        <span class="text">Area Chart</span>
      </div>
      <div class="dropdown-item" data-value="scatter">
        <span class="material-icons">scatter_plot</span>
        <span class="text">Scatter Chart</span>
      </div>
      <div class="dropdown-item" data-value="bubble">
        <span class="material-icons">bubble_chart</span>
        <span class="text">Bubble Chart</span>
      </div>
      <div class="dropdown-item" data-value="pie">
        <span class="material-icons">pie_chart</span>
        <span class="text">Pie Chart</span>
      </div>
      <div class="dropdown-item" data-value="doughnut">
        <span class="material-icons">donut_large</span>
        <span class="text">Doughnut Chart</span>
      </div>
      <div class="dropdown-item" data-value="polarArea">
        <span class="material-icons">track_changes</span>
        <span class="text">Polar Area Chart</span>
      </div>
      <div class="dropdown-item" data-value="radar">
        <span class="material-icons">radar</span>
        <span class="text">Radar Chart</span>
      </div>
      <div class="dropdown-item" data-value="chart-mixed">
        <span class="material-icons">layers</span>
        <span class="text">Mixed Chart</span>
      </div>
      <div class="dropdown-item" data-value="bar-stacked">
        <span class="material-icons">stacked_bar_chart</span>
        <span class="text">Stacked Bar Chart</span>
      </div>
    </div>
  </div>
</div>

<hr class="config-divider">

<div id="chart-color-config-section" class="config-section" style="display: none;">
  <h4 class="config-header">Chart Colors</h4>
  
  <div class="form-group">
    <label for="chart-palette-select">Color Palette</label>
    <select id="chart-palette-select" class="modal-select">
      <option value="default">Default</option>
      <option value="vibrant">Vibrant</option>
      <option value="pastel">Pastel</option>
      <option value="cool">Cool Blues</option>
      <option value="warm">Warm Sunset</option>
    </select>
  </div>

  <div class="color-palette-editor">
    <div id="chart-colors-list" class="chart-colors-list"></div>
    </div>
  
  <div id="chart-color-palette" class="color-palette hidden">
    <div class="palette-section">
      <div class="palette-title">Suggested Colors</div>
      <div class="palette-grid" id="chart-relaxing-colors"></div>
    </div>
    <div class="palette-section">
      <div class="palette-title">Recent Colors</div>
      <div class="palette-grid" id="chart-recent-colors"></div>
    </div>
    <div class="palette-section">
      <input type="color" id="chart-color-picker">
    </div>
  </div>
</div>

<hr class="config-divider">

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
  <div style="display: flex; gap: 8px;">
    <select id="value-format" class="modal-select" style="flex: 1;">
      <option value="number">Plain Number</option>
      <option value="currency">Currency</option>
      <option value="percent">Percentage</option>
    </select>
    <select id="currency-type" class="modal-select" style="width: 120px;">
    <option value="₱">PHP (₱) - Philippine Peso</option>
    <option value="$">USD ($) - United States Dollar</option>
    <option value="A$">AUD (A$) - Australian Dollar</option>
    <option value="€">EUR (€) - Euro</option>
    <option value="£">GBP (£) - British Pound Sterling</option>
    <option value="¥">JPY (¥) - Japanese Yen</option>
    <option value="C$">CAD (C$) - Canadian Dollar</option>
    <option value="¥">CNY (¥) - Chinese Yuan</option>
    <option value="HK$">HKD (HK$) - Hong Kong Dollar</option>
    <option value="₹">INR (₹) - Indian Rupee</option>
    <option value="₩">KRW (₩) - South Korean Won</option>
    <option value="S$">SGD (S$) - Singapore Dollar</option>
    <option value="฿">THB (฿) - Thai Baht</option>
    <option value="kr">SEK (kr) - Swedish Krona</option>
</select>
  </div>
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
      <option value="inherit">Default</option>
      <option value="'Roboto', sans-serif">Roboto</option>
      <option value="'Open Sans', sans-serif">Open Sans</option>
      <option value="'Lato', sans-serif">Lato</option>
      <option value="'Poppins', sans-serif">Poppins</option>
      <option value="'Merriweather', serif">Merriweather</option>
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
  const getDefaultChartColors = () => ['#4f46e5', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6'];
  let initialChartColors;

  if (isEditMode) {
    initialChartColors = cardToEdit.chartColors || (cardToEdit.chartColor ? [cardToEdit.chartColor] : getDefaultChartColors());
  } else {
    const savedColors = JSON.parse(localStorage.getItem('lastChartColors'));
    initialChartColors = savedColors && savedColors.length > 0 ? savedColors : getDefaultChartColors();
  }

  const COLOR_PALETTES = {
    default: ['#4f46e5', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#10b981', '#d946ef'],
    vibrant: ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6'],
    pastel: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec'],
    cool: ['#003f5c', '#374c80', '#7a5195', '#bc5090', '#ef5675', '#ff764a', '#ffa600', '#58508d'],
    warm: ['#692d5c', '#af4d98', '#d49ce8', '#7f5a83', '#a16e83', '#c38383', '#e8a883', '#ffcb83'],
  };

  let cardConfig = {
    title: initialTitle,
    metric: isEditMode ? cardToEdit.metric || 'count' : 'count',
    costCalcType: isEditMode ? cardToEdit.costCalcType || 'sum' : 'sum',
    valueFormat: isEditMode ? cardToEdit.valueFormat || 'number' : 'number',
    filters: isEditMode ? { ...(cardToEdit.baseFilters || {}) } : {},
    currencySymbol: isEditMode ? cardToEdit.currencySymbol || '₱' : '₱',
    bgColor: isEditMode ? cardToEdit.bgColor || '#F5F9FF' : '#F5F9FF',
    textColor: isEditMode ? cardToEdit.textColor || '#000000' : '#000000',
    fontStyle: isEditMode ? cardToEdit.fontStyle || 'inherit' : 'inherit',
    cardType: isEditMode ? cardToEdit.cardType || 'number' : 'number',
    chartColors: initialChartColors,
    chartPalette: isEditMode ? cardToEdit.chartPalette || 'default' : 'default'
  };

  const titleInput = modalOverlay.querySelector('#preview-title-input');
  const metricSelect = modalOverlay.querySelector('#metric-type');
  const calcTypeSelect = modalOverlay.querySelector('#calc-type');
  const formatSelect = modalOverlay.querySelector('#value-format');
  titleInput.value = cardConfig.title;
  formatSelect.value = cardConfig.valueFormat;

  const bgButton = modalOverlay.querySelector('#bg-color-button');
  const bgPalette = modalOverlay.querySelector('#bg-color-palette');
  const bgPicker = modalOverlay.querySelector('#bg-color-picker');
  const bgRelaxing = modalOverlay.querySelector('#bg-relaxing-colors');
  const bgRecent = modalOverlay.querySelector('#bg-recent-colors');
  const chartColorPalette = modalOverlay.querySelector('#chart-color-palette');
  const chartPicker = modalOverlay.querySelector('#chart-color-picker');
  const chartColorConfigSection = modalOverlay.querySelector('#chart-color-config-section');

  if (cardConfig.cardType !== 'number') {
    chartColorConfigSection.style.display = 'block';
  }
  const textButton = modalOverlay.querySelector('#text-color-button');
  const textPalette = modalOverlay.querySelector('#text-color-palette');
  const textPicker = modalOverlay.querySelector('#text-color-picker');
  const textRelaxing = modalOverlay.querySelector('#text-relaxing-colors');
  const textRecent = modalOverlay.querySelector('#text-recent-colors');

  const previewValueEl = modalOverlay.querySelector('#preview-value');
  const addFilterBtn = modalOverlay.querySelector('#add-filter-btn');
  const addFilterMenu = modalOverlay.querySelector('#add-filter-menu');
  const activeFiltersContainer = modalOverlay.querySelector('#active-filters-container');

  allFilterableColumns = [...projectConfig.defaultColumns, ...projectConfig.customColumns]
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

    sectionIdToName = {};
    const sectionOptions = sectionsSnapshot.docs.map(doc => {
      sectionIdToName[doc.id] = doc.data().title; // mapping
      return { name: doc.data().title };
    });

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


  const updatePreview = () => {
    updatePreviewCardType();
    updatePreviewStyle();
  };

  projectConfig.customColumns.filter(c => c.type === 'Costing').forEach(c => {
    CALCULATION_OPTIONS[`cost-${c.id}`] = c.name;
  });

  // Fill metric select
  metricSelect.innerHTML = Object.entries(CALCULATION_OPTIONS)
    .map(([id, name]) => `<option value="${id}">${name}</option>`)
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

  const currencySelect = modalOverlay.querySelector('#currency-type');
  formatSelect.value = cardConfig.valueFormat;
  currencySelect.value = cardConfig.currencySymbol;

  if (formatSelect.value !== 'currency') {
    currencySelect.style.display = 'none';
  }

  formatSelect.addEventListener('change', e => {
    cardConfig.valueFormat = e.target.value;
    currencySelect.style.display = (e.target.value === 'currency') ? 'block' : 'none';
    updatePreview();
  });
  currencySelect.addEventListener('change', e => {
    cardConfig.currencySymbol = e.target.value;
    updatePreview();
  });

  addFilterBtn.addEventListener('click', e => { e.stopPropagation(); addFilterMenu.classList.toggle('hidden'); });

  function renderAddFilterMenu() {
    // Hide columns already in cardConfig.filters
    const availableColumns = allFilterableColumns.filter(col => !cardConfig.filters.hasOwnProperty(col.id));

    addFilterMenu.innerHTML = availableColumns.map(col =>
      `<a href="#" class="add-filter-menu-item" data-col-id="${col.id}">${col.name}</a>`
    ).join('');

    // Hide "Add Filter" button if no filters left
    if (availableColumns.length === 0) {
      addFilterBtn.style.display = 'none';
    } else {
      addFilterBtn.style.display = '';
    }

    // Re-bind events
    addFilterMenu.querySelectorAll('.add-filter-menu-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const colId = item.dataset.colId;
        if (!cardConfig.filters.hasOwnProperty(colId)) {
          cardConfig.filters[colId] = null;
          renderActiveFilterPanels();
          renderAddFilterMenu(); // refresh menu after adding
        }
        addFilterMenu.classList.add('hidden');
      });
    });
  }

  let editingColorIndex = 0

  const cardTypeDropdown = modalOverlay.querySelector('#card-type');
  const selectedEl = cardTypeDropdown.querySelector('.selected');
  const dropdownList = cardTypeDropdown.querySelector('.dropdown-list');
  const selectedTextEl = selectedEl.querySelector('.text');
  const selectedIconEl = selectedEl.querySelector('.material-icons.dropdown-icon');
  const chartPaletteSelect = modalOverlay.querySelector('#chart-palette-select');
  chartPaletteSelect.value = cardConfig.chartPalette;
  chartPaletteSelect.addEventListener('change', (e) => {
    cardConfig.chartPalette = e.target.value;
    const newPalette = COLOR_PALETTES[cardConfig.chartPalette] || COLOR_PALETTES.default;
    cardConfig.chartColors = newPalette.slice(0, cardConfig.chartColors.length);
    localStorage.setItem('lastChartColors', JSON.stringify(cardConfig.chartColors));

    updatePreview();
  });

  let expandIcon = selectedIconEl;
  expandIcon.textContent = "expand_more";
  let selectedTypeIcon = document.createElement('span');
  selectedTypeIcon.classList.add('material-icons');
  selectedTypeIcon.style.marginRight = "6px"; // spacing between icon and text
  selectedEl.insertBefore(selectedTypeIcon, selectedTextEl);

  selectedEl.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownList.classList.toggle('hidden');
  });

  dropdownList.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const value = item.getAttribute('data-value');
      const text = item.querySelector('.text').textContent;
      const icon = item.querySelector('.material-icons').textContent;

      cardConfig.cardType = value;
      selectedTextEl.textContent = text;
      selectedTypeIcon.textContent = icon;
      dropdownList.classList.add('hidden');

      // FIX: Show/hide the chart color editor based on card type
      chartColorConfigSection.style.display = (value !== 'number') ? 'block' : 'none';

      const valueFormatSelect = modalOverlay.querySelector('#value-format');
      const percentOption = valueFormatSelect.querySelector('option[value="percent"]');

      if (value !== 'number') {
        percentOption.disabled = true;
        if (valueFormatSelect.value === 'percent') {
          valueFormatSelect.value = 'number';
          cardConfig.valueFormat = 'number';
        }
      } else {
        percentOption.disabled = false;
      }

      updatePreview();
    });
  });

  // Close when clicking outside
  document.addEventListener("click", e => {
    const chartColorsList = modalOverlay.querySelector('#chart-colors-list');

    // --- Close Add Filter Menu ---
    if (!addFilterBtn.contains(e.target) && !addFilterMenu.contains(e.target)) {
      addFilterMenu.classList.add('hidden');
    }

    // --- Close Background Color Palette ---
    if (!bgButton.contains(e.target) && !bgPalette.contains(e.target)) {
      bgPalette.classList.add('hidden');
    }

    // --- Close Text Color Palette ---
    if (!textButton.contains(e.target) && !textPalette.contains(e.target)) {
      textPalette.classList.add('hidden');
    }

    // --- Close Chart Color Palette ---
    if (chartColorPalette && chartColorsList && !chartColorPalette.contains(e.target) && !chartColorsList.contains(e.target)) {
      chartColorPalette.classList.add('hidden');
    }

    // --- Close Modal if click outside ---
    if (e.target === modalOverlay) {
      closeModal();
    }
  });

  // --- Set Default Selection on Modal Open ---
  const defaultItem = cardTypeDropdown.querySelector(`.dropdown-item[data-value="${cardConfig.cardType}"]`);
  if (defaultItem) {
    const icon = defaultItem.querySelector('.material-icons').textContent;
    const text = defaultItem.querySelector('.text').textContent;
    selectedTypeIcon.textContent = icon;
    selectedTextEl.textContent = text;
    updatePreviewCardType();
  }
  renderAddFilterMenu();

  const closeModal = () => {
    modalOverlay.remove();
  };

  const fontStyleSelect = modalOverlay.querySelector('#font-style-select');


  const savedFontStyle = localStorage.getItem('lastFontStyle');
  fontStyleSelect.addEventListener('change', (e) => {
    cardConfig.fontStyle = e.target.value;
    localStorage.setItem('lastFontStyle', e.target.value);
    updatePreviewStyle();
  });

  const fontValueMap = {
    "Roboto": "'Roboto', sans-serif",
    "'Roboto', sans-serif": "'Roboto', sans-serif",
    "Open Sans": "'Open Sans', sans-serif",
    "'Open Sans', sans-serif": "'Open Sans', sans-serif",
    "Lato": "'Lato', sans-serif",
    "'Lato', sans-serif": "'Lato', sans-serif",
    "Poppins": "'Poppins', sans-serif",
    "'Poppins', sans-serif": "'Poppins', sans-serif",
    "Merriweather": "'Merriweather', serif",
    "'Merriweather', serif": "'Merriweather', serif",
    "inherit": "inherit",
    "normal": "inherit"
  };

  if (!isEditMode) {
    const savedFontStyle = localStorage.getItem('lastFontStyle');
    const savedBgColor = localStorage.getItem('lastBgColor');
    const savedTextColor = localStorage.getItem('lastTextColor');
    const savedChartColor = localStorage.getItem('lastChartColor');

    // Load saved preferences
    if (savedFontStyle) {
      cardConfig.fontStyle = fontValueMap[savedFontStyle] || savedFontStyle;
    }
    if (savedBgColor) {
      cardConfig.bgColor = savedBgColor;
    }
    if (savedTextColor) {
      cardConfig.textColor = savedTextColor;
    }
    if (savedChartColor) {
      cardConfig.chartColor = savedChartColor;
    } else {
      cardConfig.chartColor = '#4f46e5'; // default chart color
    }
  }

  // Determine base font style value
  if (isEditMode) {
    cardConfig.fontStyle = fontValueMap[cardToEdit.fontStyle] || cardToEdit.fontStyle || "inherit";
  } else if (savedFontStyle) {
    cardConfig.fontStyle = fontValueMap[savedFontStyle] || savedFontStyle;
  } else {
    cardConfig.fontStyle = "inherit";
  }

  // Apply to select
  fontStyleSelect.value = cardConfig.fontStyle;

  function updatePreviewStyle() {
    const cardEl = modalOverlay.querySelector('.preview-card');
    const titleEl = modalOverlay.querySelector('#preview-title-input');
    const valueEl = modalOverlay.querySelector('#preview-value');

    cardEl.style.backgroundColor = cardConfig.bgColor;
    cardEl.style.fontFamily = cardConfig.fontStyle;

    // Apply text color directly to elements
    if (titleEl) titleEl.style.color = cardConfig.textColor;
    if (valueEl) valueEl.style.color = cardConfig.textColor;
  }

  function populateChartColorPopup(currentColor, index) {
    const suggestedContainer = chartColorPalette.querySelector('#chart-relaxing-colors');
    const recentContainer = chartColorPalette.querySelector('#chart-recent-colors');

    const recentColorsObject = JSON.parse(localStorage.getItem('recentChartColorsByIndex') || '{}');
    const recentColorsForThisIndex = recentColorsObject[index] || [];

    const SUGGESTED_CHART_COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6'];

    renderPalette(suggestedContainer, SUGGESTED_CHART_COLORS, currentColor, updateChartColor);
    renderPalette(recentContainer, recentColorsForThisIndex, currentColor, updateChartColor);
  }

  function updatePreviewCardType() {
    const previewValueEl = modalOverlay.querySelector('#preview-value');
    const previewCardEl = modalOverlay.querySelector('.preview-card');
    const oldCanvas = previewCardEl.querySelector('canvas');

    // Always destroy the old chart before rendering
    if (oldCanvas) {
      const existingChart = Chart.getChart(oldCanvas);
      if (existingChart) existingChart.destroy();
      oldCanvas.remove();
    }

    const calculatedValue = calculateCardValue(cardConfig.metric, cardConfig.costCalcType, cardConfig.filters);

    if (cardConfig.cardType === 'number') {
      previewValueEl.style.display = 'block';
      if (cardConfig.valueFormat === 'currency') {
        const currencySymbol = modalOverlay.querySelector('#currency-type').value;
        previewValueEl.textContent = currencySymbol + formatNumber(calculatedValue);
      } else if (cardConfig.valueFormat === 'percent') {
        previewValueEl.textContent = calculatedValue.toFixed(2) + "%";
      } else {
        previewValueEl.textContent = formatNumber(calculatedValue);
      }
      return;
    }

    previewValueEl.style.display = 'none';
    const canvas = document.createElement('canvas');
    previewCardEl.appendChild(canvas);

    let chartLabels = [];
    let chartDataset = [];

    const hasSectionFilter = cardConfig.filters && cardConfig.filters.sectionTitle;
    if (hasSectionFilter) {
      chartLabels = [cardConfig.filters.sectionTitle];
      chartDataset = [calculateCardValue(cardConfig.metric, cardConfig.costCalcType, cardConfig.filters)];
    } else if (sectionIdToName && Object.keys(sectionIdToName).length > 0) {
      chartLabels = Object.values(sectionIdToName);
      chartDataset = chartLabels.map(sectionName => {
        const sectionSpecificFilters = { ...cardConfig.filters, sectionTitle: sectionName };
        return calculateCardValue(cardConfig.metric, cardConfig.costCalcType, sectionSpecificFilters);
      });
    } else {
      chartLabels = ['This Week', 'Last Week', '2 Weeks Ago', '3 Weeks Ago'];
      chartDataset = chartLabels.map((_, idx) => calculatedValue * (1 - idx * 0.1));
    }

    const activePalette = COLOR_PALETTES[cardConfig.chartPalette] || COLOR_PALETTES.default;
    const colorsNeeded = chartDataset.length;
    const newChartColors = [];

    for (let i = 0; i < colorsNeeded; i++) {
      const existingColor = cardConfig.chartColors[i];
      newChartColors.push(existingColor || activePalette[i % activePalette.length]);
    }
    cardConfig.chartColors = newChartColors;

    let chartType = cardConfig.cardType;
    let chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: ['pie', 'doughnut', 'polarArea', 'line'].includes(chartType),
        }
      }
    };

    let chartData = { labels: chartLabels, datasets: [] };

    if (cardConfig.cardType === 'bubble') {
      const bubbleData = chartDataset.map((value, index) => ({
        x: (index + 1) * 10,
        y: value,
        r: Math.max(5, Math.abs(value / 5))
      }));
      chartData.datasets = [{ label: 'Tasks', data: bubbleData, backgroundColor: cardConfig.chartColors }];
    } else if (cardConfig.cardType === 'bar-stacked' || cardConfig.cardType === 'horizontalBar') {
      chartType = 'bar';
      if (cardConfig.cardType === 'horizontalBar') chartOptions.indexAxis = 'y';
      else chartOptions.scales = { x: { stacked: true }, y: { stacked: true } };
      chartData.datasets = [{ label: 'Tasks', data: chartDataset, backgroundColor: cardConfig.chartColors }];
    } else if (cardConfig.cardType === 'chart-mixed') {
      chartType = 'bar';
      chartData.datasets = [
        { type: 'bar', label: 'Bar', data: chartDataset, backgroundColor: cardConfig.chartColors[0] || '#4f46e5' },
        { type: 'line', label: 'Line', data: chartDataset, borderColor: cardConfig.chartColors[1] || '#ef4444', fill: false }
      ];
    } else if (cardConfig.cardType === 'area' || cardConfig.cardType === 'line') {
      chartType = 'line';
      chartData.datasets.push({
        label: 'Tasks',
        data: chartDataset,
        fill: true,
        backgroundColor: hexToRgba(cardConfig.chartColors[0] || '#4f46e5', 0.2),
        borderColor: cardConfig.chartColors[0] || '#4f46e5',
        borderWidth: 2,
        tension: 0.3
      });
    } else {
      chartData.datasets = [{ label: 'Tasks', data: chartDataset, backgroundColor: cardConfig.chartColors }];
    }

    new Chart(canvas.getContext('2d'), { type: chartType, data: chartData, options: chartOptions });
    renderChartColorSelector();
  }

  function previewChartColor(newColor) {
    if (editingColorIndex < cardConfig.chartColors.length) {
      cardConfig.chartColors[editingColorIndex] = newColor;
    }
    renderChartColorSelector();
    updatePreviewCardType();
    updatePreviewStyle();
  }

  function updateChartColor(newColor) {
    if (editingColorIndex < cardConfig.chartColors.length) {
      cardConfig.chartColors[editingColorIndex] = newColor;
    }

    const recentColorsObject = JSON.parse(localStorage.getItem('recentChartColorsByIndex') || '{}');
    let recentColorsForThisIndex = recentColorsObject[editingColorIndex] || [];

    if (!recentColorsForThisIndex.includes(newColor)) {
      recentColorsForThisIndex.unshift(newColor);
      if (recentColorsForThisIndex.length > 8) {
        recentColorsForThisIndex.pop();
      }
    }
    recentColorsObject[editingColorIndex] = recentColorsForThisIndex;
    localStorage.setItem('recentChartColorsByIndex', JSON.stringify(recentColorsObject));

    populateChartColorPopup(newColor, editingColorIndex);
    updatePreview();
  }

  function renderChartColorSelector() {
    const chartColorsList = modalOverlay.querySelector('#chart-colors-list');
    chartColorsList.innerHTML = '';
    cardConfig.chartColors.forEach((color, index) => {
      const swatchWrapper = document.createElement('div');
      swatchWrapper.className = 'chart-color-swatch-wrapper';
      if (index === editingColorIndex) {
        swatchWrapper.classList.add('active');
      }

      const swatch = document.createElement('button');
      swatch.className = 'chart-color-swatch';
      swatch.style.backgroundColor = color;
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        editingColorIndex = index;
        populateChartColorPopup(color, index);
        const topPosition = swatch.offsetTop + swatch.offsetHeight + 5; // 5px gap below
        const leftPosition = swatch.offsetLeft;
        chartColorPalette.style.top = `${topPosition}px`;
        chartColorPalette.style.left = `${leftPosition}px`;

        chartColorPalette.classList.remove('hidden');
        renderChartColorSelector();
      });

      swatchWrapper.appendChild(swatch);
      chartColorsList.appendChild(swatchWrapper);
    });
  }

  chartPicker.addEventListener("input", e => previewChartColor(e.target.value)); // For live preview
  chartPicker.addEventListener("change", e => updateChartColor(e.target.value));

  const relaxingColors = ["#F5F9FF", "#F2FFF5", "#FAF9F7", "#F5F5F5", "#FFFFFF", "#E3E3E3", "#FFD6D6", "#FFE7B8"];
  let recentBgColors = [];
  let recentTextColors = [];

  function renderPalette(container, colors, currentColor, setColorFn) {
    container.innerHTML = "";
    colors.forEach(color => {
      const swatch = document.createElement("div");
      swatch.className = "palette-swatch";
      swatch.style.backgroundColor = color;
      if (color.toLowerCase() === currentColor.toLowerCase()) swatch.classList.add("selected");
      swatch.addEventListener("click", () => setColorFn(color));
      container.appendChild(swatch);
    });
  }

  function setBgColor(color) {
    cardConfig.bgColor = color;
    localStorage.setItem('lastBgColor', color);
    bgButton.style.backgroundColor = color;
    updatePreviewStyle();
    updatePreview();
    renderPalette(bgRelaxing, relaxingColors, color, setBgColor);
    renderPalette(bgRecent, recentBgColors, color, setBgColor);
  }

  function setTextColor(color) {
    cardConfig.textColor = color;
    localStorage.setItem('lastTextColor', color);
    textButton.style.backgroundColor = color;
    updatePreviewStyle();
    updatePreview();
    renderPalette(textRelaxing, relaxingColors, color, setTextColor);
    renderPalette(textRecent, recentTextColors, color, setTextColor);
  }

  setBgColor(cardConfig.bgColor);
  setTextColor(cardConfig.textColor);

  modalOverlay.querySelector('#cancel-add-card').addEventListener('click', closeModal);
  bgButton.addEventListener("click", () => bgPalette.classList.toggle("hidden"));
  textButton.addEventListener("click", () => textPalette.classList.toggle("hidden"));
  bgPicker.addEventListener("input", e => {
    // Provides a live preview as the user adjusts the color
    setBgColor(e.target.value);
  });
  bgPicker.addEventListener("change", e => {
    // Hides the palette only after the user confirms a color
    bgPalette.classList.add("hidden");
  });

  // Text Color Picker
  textPicker.addEventListener("input", e => {
    // Provides a live preview as the user adjusts the color
    setTextColor(e.target.value);
  });
  textPicker.addEventListener("change", e => {
    // Hides the palette only after the user confirms a color
    textPalette.classList.add("hidden");
  });
  // Global click handler
  document.addEventListener("click", e => {
    // --- Close Add Filter Menu ---
    if (!addFilterBtn.contains(e.target) && !addFilterMenu.contains(e.target)) {
      addFilterMenu.classList.add('hidden');
    }

    // --- Close Background Color Palette ---
    if (!bgButton.contains(e.target) && !bgPalette.contains(e.target)) {
      bgPalette.classList.add('hidden');
    }

    // --- Close Text Color Palette ---
    if (!textButton.contains(e.target) && !textPalette.contains(e.target)) {
      textPalette.classList.add('hidden');
    }

    // --- Close Modal if click outside ---
    if (e.target === modalOverlay) {
      closeModal();
    }
  });

  modalOverlay.querySelector('#confirm-add-card').addEventListener('click', () => {
    if (isEditMode && !cardToEdit.isDefault) {
      const cardToUpdate = dashboardData.find(c => c.id === cardToEdit.id);
      if (cardToUpdate) {
        Object.assign(cardToUpdate, cardConfig, {
          baseFilters: cardConfig.filters,
          localFilters: { ...cardConfig.filters },
        });
        recalculateCardValue(cardToUpdate);
      }
    } else {
      const numericString = previewValueEl.textContent.replace(/[^0-9.-]+/g, "");
      const finalValue = parseFloat(numericString);
      const newCardId = `metric-${Date.now()}`;

      dashboardData.push({
        id: newCardId,
        value: finalValue,
        ...cardConfig,
        isDefault: false, // Ensure it's now a custom card
        baseFilters: cardConfig.filters,
        filterOptions: allPossibleFilterOptions,
        localFilters: { ...cardConfig.filters },
      });

      if (isEditMode && cardToEdit.isDefault) {
        const originalEl = document.getElementById(cardToEdit.id);
        if (originalEl) originalEl.style.display = 'none';
      }
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

      panel.querySelector('.remove-filter-btn').addEventListener('click', (e) => {
        const colId = e.currentTarget.dataset.colId;
        delete cardConfig.filters[colId];

        renderActiveFilterPanels();
        renderAddFilterMenu();
        updatePreview();
      });

      panel.appendChild(panelBody);
      activeFiltersContainer.appendChild(panel);
    });
  }
}

function calculateCardValue(metric, costCalcType, filters) {
  if (!fullTasksSnapshot) return 0;
  if (!metric) return 0;
  const statusColumn = projectConfig.defaultColumns.find(c => c.id === 'status');
  const costingColumns = projectConfig.customColumns.filter(
    c => c.type === 'Costing' || c.type === 'Number'
  );

  const completionStatusName = statusColumn?.options?.find(
    o => o.name.toLowerCase() === 'completed'
  )?.name;
  const cancelledStatusName = statusColumn?.options?.find(
    o => o.name.toLowerCase() === 'cancelled'
  )?.name;

  // Apply filters
  const filteredDocs = fullTasksSnapshot.docs.filter(doc => {
    const task = doc.data();
    return Object.entries(filters || {}).every(([colId, filterValue]) => {
      if (!filterValue) return true; // allow "All"

      if (colId === 'status') {
        const isCurrentStatus = task.status === filterValue;
        const wasPreviousAndIsNowCompleted =
          task.previousStatus === filterValue && task.status === completionStatusName;
        return isCurrentStatus || wasPreviousAndIsNowCompleted;
      }

      if (colId === 'sectionId') {
        return task.sectionId === filterValue;
      }

      if (colId === 'sectionTitle') { // legacy support
        const sectionName = sectionIdToName[task.sectionId] || "";
        return sectionName === filterValue;
      }

      const isCustom = !projectConfig.defaultColumns.some(c => c.id == colId);
      const taskVal = isCustom ? task.customFields?.[colId] : task[colId];
      return taskVal === filterValue;
    });
  });

  let value = 0;

  // --- Cost-specific calculation ---
  if (metric.startsWith("cost-")) {
    const fieldId = metric.replace("cost-", "");
    const nums = filteredDocs
      .map(doc => doc.data().customFields?.[fieldId])
      .filter(v => typeof v === "number");

    switch (costCalcType || "sum") {
      case "sum": value = nums.reduce((a, b) => a + b, 0); break;
      case "avg": value = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; break;
      case "min": value = nums.length ? Math.min(...nums) : 0; break;
      case "max": value = nums.length ? Math.max(...nums) : 0; break;
    }
  }
  // --- Special handling for Card Balance ---
  else if (metric === "cardBalance") {
    filteredDocs.forEach(doc => {
      const task = doc.data();
      if (task.status !== completionStatusName && task.status !== cancelledStatusName) {
        let taskTotalCost = 0;
        costingColumns.forEach(col => {
          const costValue = task.customFields?.[col.id];
          if (typeof costValue === 'number') taskTotalCost += costValue;
        });
        value += taskTotalCost;
      }
    });
  }
  // --- Other metrics ---
  else if (metric === "count") {
    value = filteredDocs.length;
  } else if (metric === "completedTasks") {
    value = filteredDocs.filter(doc => doc.data().status === completionStatusName).length;
  } else if (metric === "overdueTasks") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    value = filteredDocs.filter(doc =>
      doc.data().dueDate && new Date(doc.data().dueDate) < today
    ).length;
  }

  return value;
}

function recalculateCardValue(targetCard) {
  if (!targetCard || !fullTasksSnapshot) return 0;
  const filters = { ...(targetCard.baseFilters || {}), ...(targetCard.localFilters || {}) };
  const value = calculateCardValue(targetCard.metric, targetCard.costCalcType, filters);
  targetCard.value = value;
  return value;
}

function renderDashboard() {
  console.log("Rendering dashboard from current state.");
  createCards();
  initCharts(projectConfig, fullTasksSnapshot);
  initCustomCharts();
  setupStaticChartControls();
  setupChartPlaceholder();
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

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function setupStaticChartControls() {
  const staticChartContainers = document.querySelectorAll('.chart-section .chart-container');

  staticChartContainers.forEach(container => {
    if (container.dataset.controlsInitialized) return;

    const editBtn = container.querySelector('.edit-card-btn');
    const removeBtn = container.querySelector('.remove-card-btn');

    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chartId = container.id;
        const defaultConfig = STATIC_CHART_CONFIGS[chartId];
        if (defaultConfig) {
          // Open the modal with the pre-filled config for this default chart
          openAddCardModal(defaultConfig);
        }
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        container.style.display = 'none';
      });
    }
    container.dataset.controlsInitialized = 'true';
  });
}

function initCustomCharts() {
  try {
    const chartSection = document.querySelector('.chart-section');
    if (!chartSection) return;

    document.querySelectorAll('.custom-chart-container').forEach(el => el.remove());

    const chartColumns = chartSection.querySelectorAll('.chart-column');
    if (chartColumns.length === 0) return;

    const chartDataFromConfig = dashboardData.filter(card => card.cardType !== 'number');

    chartDataFromConfig.forEach((card, index) => {
      const chartContainer = document.createElement('div');
      chartContainer.className = 'rounded-xl shadow-lg p-6 chart-container custom-chart-container relative';
      const containerId = `chart-container-${card.id}`;
      const canvasId = `chart-canvas-${card.id}`;
      chartContainer.id = containerId;

      if (card.bgColor) chartContainer.style.backgroundColor = card.bgColor;
      if (card.fontStyle) chartContainer.style.fontFamily = card.fontStyle;

      chartContainer.innerHTML = `
        <button class="edit-card-btn absolute top-2 right-8 text-gray-400 hover:text-blue-500">
          <i class="fas fa-edit"></i>
        </button>
        <button class="remove-card-btn absolute top-2 right-2 text-gray-400 hover:text-red-500">
          <i class="fas fa-times"></i>
        </button>
        <h3 class="text-xl font-bold text-gray-900 mb-4">${card.title}</h3>
        <div class="chart-canvas-container">
          <canvas id="${canvasId}"></canvas>
        </div>
      `;

      const titleEl = chartContainer.querySelector('h3');
      if (titleEl && card.textColor) titleEl.style.color = card.textColor;

      const hasFilters = card.baseFilters && Object.keys(card.baseFilters).length > 0;
      if (hasFilters) {
        const indicator = document.createElement('span');
        const indicatorColor = card.chartColors?.[0] || '#888';

        // Style the indicator dot
        indicator.style.display = 'inline-block';
        indicator.style.width = '10px';
        indicator.style.height = '10px';
        indicator.style.borderRadius = '50%';
        indicator.style.backgroundColor = indicatorColor;
        indicator.style.marginRight = '8px';
        indicator.title = 'Filters are active on this chart';

        titleEl.prepend(indicator);
      }
      chartColumns[index % chartColumns.length].appendChild(chartContainer);

      chartContainer.querySelector('.edit-card-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openAddCardModal(card);
      });

      chartContainer.querySelector('.remove-card-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        dashboardData = dashboardData.filter(c => c.id !== card.id);
        saveCardLayout();
        renderDashboard();
      });

      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      let chartLabels = [];
      let chartDataset = [];
      const hasSectionFilter = card.baseFilters && card.baseFilters.sectionTitle;

      if (hasSectionFilter) {
        chartLabels = [card.baseFilters.sectionTitle];
        chartDataset = [calculateCardValue(card.metric, card.costCalcType, card.baseFilters)];
      } else if (sectionIdToName && Object.keys(sectionIdToName).length > 0) {
        chartLabels = Object.values(sectionIdToName);
        chartDataset = chartLabels.map(sectionName => {
          const sectionSpecificFilters = { ...card.baseFilters, sectionTitle: sectionName };
          return calculateCardValue(card.metric, card.costCalcType, sectionSpecificFilters);
        });
      } else {
        const totalValue = calculateCardValue(card.metric, card.costCalcType, card.baseFilters);
        chartLabels = ['Data A', 'Data B', 'Data C'];
        chartDataset = [totalValue * 0.5, totalValue * 0.3, totalValue * 0.2];
      }

      let chartType = card.cardType || 'bar';
      let chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: ['pie', 'doughnut', 'polarArea', 'line'].includes(chartType),
            labels: {
              color: card.textColor || '#666',
              font: {
                family: card.fontStyle || 'inherit'
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: card.textColor || '#666',
              font: {
                family: card.fontStyle || 'inherit'
              }
            },
            grid: { color: '#eee' }
          },
          y: {
            ticks: {
              color: card.textColor || '#666',
              font: {
                family: card.fontStyle || 'inherit'
              }
            },
            grid: { color: '#eee' }
          }
        }
      };

      const datasetLabel = CALCULATION_OPTIONS[card.metric] || card.title;

      let chartData = { labels: chartLabels, datasets: [] };

      if (chartType === 'area' || chartType === 'line') {
        chartType = 'line';
        chartData.datasets.push({
          label: datasetLabel,
          data: chartDataset,
          fill: true, // This adds the color fill
          backgroundColor: hexToRgba(card.chartColors[0] || '#4f46e5', 0.2),
          borderColor: card.chartColors[0] || '#4f46e5',
          borderWidth: 2,
          tension: 0.3
        });
      } else if (chartType === 'horizontalBar') {
        chartType = 'bar'; // The actual type is 'bar'
        chartOptions.indexAxis = 'y'; // This makes it horizontal
        chartData.datasets.push({
          label: datasetLabel,
          data: chartDataset,
          backgroundColor: card.chartColors
        });
      } else {
        // Default case for most charts (pie, bar, doughnut, etc.)
        chartData.datasets.push({
          label: datasetLabel,
          data: chartDataset,
          backgroundColor: card.chartColors
        });
      }

      new Chart(canvas, { type: chartType, data: chartData, options: chartOptions });
    });
  } catch (error) {
    console.error("Error initializing custom charts:", error);
  }
}

function setupChartPlaceholder() {
  const addChartBtn = document.getElementById('add-chart-placeholder');
  if (addChartBtn) {
    addChartBtn.addEventListener('click', () => {
      openAddCardModal({ cardType: 'bar' });
    });
  }
}

function initCharts(projectConfig, tasksSnapshot) {
  if (!projectConfig || !tasksSnapshot) return;
  try {
    // --- 1. Aggregate data once ---
    const statusCounts = {};
    const priorityCounts = {};
    tasksSnapshot.forEach(doc => {
      const task = doc.data();
      if (task.status) statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
      if (task.priority) priorityCounts[task.priority] = (priorityCounts[task.priority] || 0) + 1;
    });

    // --- 2. Loop through default charts to create and style them ---
    Object.values(STATIC_CHART_CONFIGS).forEach(config => {
      const container = document.getElementById(config.id);
      const canvas = container?.querySelector('canvas');
      const titleEl = container?.querySelector('h3');
      if (!container || !canvas) return;

      // --- APPLY DEFAULT STYLES ---
      container.style.backgroundColor = config.bgColor;
      container.style.fontFamily = config.fontStyle;
      if (titleEl) titleEl.style.color = config.textColor;

      let chartData;
      // --- APPLY TEXT COLOR TO CHART.JS OPTIONS ---
      let chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
            labels: {
              color: config.textColor || '#666',
              // Add font style to legend
              font: {
                family: config.fontStyle || 'inherit'
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: config.textColor || '#666',
              font: {
                family: config.fontStyle || 'inherit'
              }
            },
            grid: { color: '#efefef' }
          },
          y: {
            ticks: {
              color: config.textColor || '#666',
              font: {
                family: config.fontStyle || 'inherit'
              }
            },
            grid: { color: '#efefef' }
          }
        }
      };

      // --- 3. Prepare data based on chart ID ---
      if (config.id === 'bar-chart-container' || config.id === 'pie-chart-container') {
        const statusColumn = projectConfig.defaultColumns.find(c => c.id === 'status');
        if (statusColumn?.options) {
          const labels = statusColumn.options.map(opt => opt.name);
          const colors = statusColumn.options.map(opt => opt.color);
          const data = labels.map(label => statusCounts[label] || 0);
          chartData = { labels, datasets: [{ data, backgroundColor: colors }] };
          if (config.id === 'pie-chart-container') {
            chartOptions.plugins.legend.display = true;
            chartOptions.plugins.legend.position = 'right';
          }
        }
      } else if (config.id === 'doughnut-chart-container') {
        const priorityColumn = projectConfig.defaultColumns.find(c => c.id === 'priority');
        if (priorityColumn?.options) {
          const labels = priorityColumn.options.map(opt => opt.name);
          const colors = priorityColumn.options.map(opt => opt.color);
          const data = labels.map(label => priorityCounts[label] || 0);
          chartData = { labels, datasets: [{ data, backgroundColor: colors }] };
          chartOptions.plugins.legend.display = true;
          chartOptions.plugins.legend.position = 'right';
        }
      } else if (config.id === 'line-chart-container') {
        const trendLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        const completedTasksData = [5, 7, 12, 15, 18, 22];
        const newTasksData = [10, 12, 15, 18, 20, 25];
        chartData = {
          labels: trendLabels, datasets: [
            { label: "Completed Tasks", data: completedTasksData, borderColor: "#4f46e5", backgroundColor: "rgba(79, 70, 229, 0.1)", tension: 0.3, fill: true },
            { label: "New Tasks", data: newTasksData, borderColor: "#f59e0b", backgroundColor: "rgba(245, 158, 11, 0.1)", tension: 0.3, fill: true }
          ]
        };
        chartOptions.plugins.legend.display = true; // Show legend for line chart
      }

      // --- 4. Create the chart ---
      if (charts[canvas.id]) charts[canvas.id].destroy();
      if (chartData) { // Only create chart if data was prepared
        charts[canvas.id] = new Chart(canvas, {
          type: config.cardType,
          data: chartData,
          options: chartOptions
        });
      }
    });
  } catch (error) {
    console.error("Error initializing charts:", error);
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
        // ✅ Fetch sections BEFORE building dashboardData
        await fetchSections(projectId);

        // Now sectionsIdToName is ready
        masterDashboardData = aggregateTaskData(fullTasksSnapshot);

        const savedData = JSON.parse(localStorage.getItem(`dashboardLayout_${projectId}`));

        if (savedData && savedData.length > 0 && typeof savedData[0] === 'object' && savedData[0] !== null) {
          dashboardData = savedData.map(savedCard => {
            const updatedCardTemplate = masterDashboardData.find(c => c.id === savedCard.id);
            if (updatedCardTemplate) {
              return {
                ...savedCard,
                filterOptions: { ...updatedCardTemplate.filterOptions }
              };
            }
            return savedCard;
          });
        } else {
          dashboardData = masterDashboardData.slice(0, 6);
          saveCardLayout();
        }

        dashboardData.forEach(card => {
          if (!card.localFilters) card.localFilters = {};
          if (!card.baseFilters) card.baseFilters = {};

          // Always recalc using the latest tasks + filters
          card.value = calculateCardValue(
            card.metric || 'count', // fallback
            card.costCalcType || 'sum',
            card.localFilters || {}
          );
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
          openAddCardModal({ cardType: 'bar' });
          widgetDropdown.classList.add('hidden');
        });

        cardOption.addEventListener('click', (event) => {
          event.preventDefault();
          console.log('Card Widget option clicked!');
          openAddCardModal();
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
  localStorage.setItem(`dashboardLayout_${projectId}`, JSON.stringify(dashboardData));
}

export { init };


