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

    dashboardData.forEach((card) => {
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

  let cardConfig = {
    title: isEditMode ? cardToEdit.title : 'New Card',
    metric: isEditMode ? cardToEdit.metric || 'count' : 'count',
    costCalcType: isEditMode ? cardToEdit.costCalcType || 'sum' : 'sum', // NEW
    valueFormat: isEditMode ? cardToEdit.valueFormat || 'number' : 'number',
    filters: isEditMode ? { ...(cardToEdit.baseFilters || {}) } : {},
    bgColor: isEditMode ? cardToEdit.bgColor || '#F5F9FF' : '#F5F9FF',
    textColor: isEditMode ? cardToEdit.textColor || '#000000' : '#000000',
    fontStyle: isEditMode
      ? cardToEdit.fontStyle || 'inherit'
      : 'inherit'
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
    updatePreviewStyle();

    // Calculate using shared helper so it matches saved card calculation
    const value = calculateCardValue(
      cardConfig.metric,
      cardConfig.costCalcType,
      cardConfig.filters
    );

    // Apply display format
    if (cardConfig.valueFormat === 'currency') {
      previewValueEl.textContent = "₱" + formatNumber(value);
    } else if (cardConfig.valueFormat === 'percent') {
      previewValueEl.textContent = value.toFixed(2) + "%";
    } else {
      previewValueEl.textContent = formatNumber(value);
    }
  };


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
  if (!isEditMode) {
    const savedFontStyle = localStorage.getItem('lastFontStyle');
    const savedBgColor = localStorage.getItem('lastBgColor');
    const savedTextColor = localStorage.getItem('lastTextColor');

    if (savedFontStyle) {
      cardConfig.fontStyle = fontValueMap[savedFontStyle] || savedFontStyle;
    }
    if (savedBgColor) {
      cardConfig.bgColor = savedBgColor;
    }
    if (savedTextColor) {
      cardConfig.textColor = savedTextColor;
    }
  }
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
    if (isEditMode) {
      const cardToUpdate = dashboardData.find(c => c.id === cardToEdit.id);
      if (cardToUpdate) {
        cardToUpdate.title = cardConfig.title;
        cardToUpdate.metric = cardConfig.metric;
        cardToUpdate.valueFormat = cardConfig.valueFormat;
        cardToUpdate.baseFilters = cardConfig.filters;
        cardToUpdate.localFilters = { ...cardConfig.filters };
        cardToUpdate.costCalcType = cardConfig.costCalcType || 'sum';
        cardToUpdate.bgColor = cardConfig.bgColor;
        cardToUpdate.textColor = cardConfig.textColor; // ✅ store text color
        cardToUpdate.fontStyle = cardConfig.fontStyle; // ✅ store font style
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
        costCalcType: cardConfig.costCalcType || 'sum',
        bgColor: cardConfig.bgColor, // ✅ store bg color
        textColor: cardConfig.textColor, // ✅ store text color
        fontStyle: cardConfig.fontStyle // ✅ store font style
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
  localStorage.setItem(`dashboardLayout_${projectId}`, JSON.stringify(dashboardData));
}

export { init };


