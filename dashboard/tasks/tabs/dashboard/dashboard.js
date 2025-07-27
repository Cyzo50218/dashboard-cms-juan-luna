import { Chart, registerables } from 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.esm.js';

// 2. Register all the components (controllers, scales, elements, etc.) with Chart.js.
Chart.register(...registerables);

// Dashboard data: Defines the cards and their filter options
const dashboardData = [
  {
    id: "completedTasks",
    title: "Total completed tasks",
    value: 2602,
    filterOptions: {
      customFields: ["Field A", "Field B", "Field C"],
      status: ["Completed", "Pending", "In Progress"],
      dueDate: ["Overdue", "Due Today", "Due This Week", "No Due Date"],
      priority: ["High", "Medium", "Low"],
    },
  },
  {
    id: "incompleteTasks",
    title: "Total incomplete tasks",
    value: 44,
    filterOptions: {
      customFields: ["Field A", "Field B"],
      status: ["Pending", "In Progress"],
      dueDate: ["Overdue", "Due Today", "Due This Week"],
      priority: ["High", "Medium"],
    },
  },
  {
    id: "overdueTasks",
    title: "Total overdue tasks",
    value: 12,
    filterOptions: {
      customFields: ["Field C"],
      status: ["Overdue"],
      dueDate: ["Overdue"],
      priority: ["High"],
    },
  },
  {
    id: "totalTasks",
    title: "Total tasks",
    value: 2646,
    filterOptions: {
      customFields: ["Field A", "Field B", "Field C"],
      status: ["Completed", "Pending", "In Progress", "Overdue"],
      dueDate: ["Overdue", "Due Today", "Due This Week", "No Due Date"],
      priority: ["High", "Medium", "Low"],
    },
  },
  {
    id: "totalPayment",
    title: "Total Payment made",
    value: -10027228,
    filterOptions: {
      customFields: ["Finance", "Accounts"],
      status: ["Paid", "Unpaid"],
      dueDate: ["Past Due", "Due Soon"],
      priority: ["High", "Low"],
    },
  },
  {
    id: "supplierCost",
    title: "Supplier Cost",
    value: 9867143,
    filterOptions: {
      customFields: ["Supplier A", "Supplier B", "Supplier C"],
      status: ["Confirmed", "Pending"],
      dueDate: ["Due Soon", "No Due Date"],
      priority: ["Medium", "Low"],
    },
  },
  {
    id: "balance",
    title: "BALANCE",
    value: -160085,
    filterOptions: {
      customFields: [], // Example with no custom fields
      status: ["Negative", "Positive"],
      dueDate: ["Past Due", "Upcoming"],
      priority: ["High", "Low"],
    },
  },
];

// State variables for the dashboard
let filtersState = {}; // Stores the current filter selections for each card
let cardsContainer = null; // Reference to the HTML element that holds the cards
let bodyClickHandler = null; // Stores the reference to the body click event listener for cleanup
let filterButtonHandlers = []; // Stores references to filter button event listeners for cleanup
let charts = {}; // Stores Chart.js instances for destruction
let sortables = []; // Stores Sortable.js instances for destruction

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
 * Creates and appends dashboard cards to the DOM, including filter buttons and dropdowns.
 */
function createCards() {
  try {
    console.log("Creating cards...");
    // Clear any existing cards before re-creating
    if (cardsContainer) {
      cardsContainer.innerHTML = "";
    } else {
      console.error("Cards container not found during card creation.");
      return;
    }

    dashboardData.forEach((card) => {
      const cardEl = document.createElement("div");
      cardEl.className = "card";
      cardEl.id = `card-${card.id}`;
      cardEl.dataset.id = card.id; // Store card ID as a data attribute

      // Card content container
      const contentEl = document.createElement("div");
      contentEl.className =
        "flex flex-col items-center justify-center h-full pt-2";
      cardEl.appendChild(contentEl);

      // Title element
      const titleEl = document.createElement("h2");
      titleEl.className = "text-sm font-medium mb-1 text-center px-1";
      titleEl.textContent = card.title;

      // Value element
      const valueEl = document.createElement("p");
      valueEl.className = "text-xl font-light mb-4 text-center";
      valueEl.textContent = formatNumber(card.value);

      // Filter button container
      const filterContainer = document.createElement("div");
      filterContainer.className =
        "relative inline-block text-left w-full flex justify-center";

      // Filter button
      const filterButton = document.createElement("button");
      filterButton.type = "button";
      filterButton.className = "filter-button";
      filterButton.innerHTML = `
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <line x1="4" y1="6" x2="20" y2="6"></line>
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <line x1="4" y1="18" x2="20" y2="18"></line>
        </svg>
        Filter
      `;
      filterContainer.appendChild(filterButton);

      // Dropdown menu container
      const dropdown = document.createElement("div");
      dropdown.className = "origin-top-left";

      // Prevent clicks inside dropdown from closing it
      dropdown.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      /**
       * Creates a filter group (e.g., Custom Fields, Status) within the dropdown.
       * @param {string} title - The title of the filter group.
       * @param {string[]} options - An array of filter options.
       * @param {string} filterType - The key for this filter type in filtersState (e.g., 'customFields').
       * @returns {HTMLElement} The created filter group div.
       */
      function createFilterGroup(title, options, filterType) {
        // Always include "None" option for filter groups
        const displayOptions = [...options, "None"];

        const group = document.createElement("div");
        group.className = "px-3 py-2 border-b border-gray-300";

        const groupLabel = document.createElement("p");
        groupLabel.className = "font-semibold mb-1";
        groupLabel.textContent = title;
        group.appendChild(groupLabel);

        // "All" checkbox for the group
        const allId = `filter-${card.id}-${filterType}-all`;
        const allLabel = document.createElement("label");
        allLabel.className = "flex items-center space-x-2 mb-1 cursor-pointer";
        const allCheckbox = document.createElement("input");
        allCheckbox.type = "checkbox";
        allCheckbox.id = allId;
        // Check "All" if no specific filters are selected for this type
        allCheckbox.checked = filtersState[card.id][filterType].size === 0;

        allCheckbox.dataset.filterType = filterType;
        allCheckbox.dataset.cardId = card.id;
        allCheckbox.dataset.value = "all"; // Special value for "All"

        allLabel.appendChild(allCheckbox);
        const allSpan = document.createElement("span");
        allSpan.className = "text-sm";
        allSpan.textContent = "All";
        allLabel.appendChild(allSpan);
        group.appendChild(allLabel);

        // Event listener for "All" checkbox
        allCheckbox.addEventListener("change", (e) => {
          e.stopPropagation();
          if (e.target.checked) {
            // If "All" is checked, clear all other filters for this type
            filtersState[card.id][filterType].clear();
            const checkboxes = dropdown.querySelectorAll(
              `input[type=checkbox][data-filter-type="${filterType}"]:not(#${allId})`
            );
            checkboxes.forEach((cb) => (cb.checked = false)); // Uncheck all other options
            updateCardValue(card);
          } else {
            // If "All" is unchecked, ensure at least one other option is selected, or re-check "All"
            if (filtersState[card.id][filterType].size === 0) {
              e.target.checked = true; // Prevent "All" from being unchecked if no other options are selected
            }
          }
        });

        // Create individual filter options
        displayOptions.forEach((opt) => {
          const optionId = `filter-${card.id}-${filterType}-${opt
            .replace(/\s+/g, "-")
            .toLowerCase()}`; // Unique ID for each checkbox

          const label = document.createElement("label");
          label.className = "flex items-center space-x-2 mb-1 cursor-pointer";

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.id = optionId;
          checkbox.dataset.filterType = filterType;
          checkbox.dataset.cardId = card.id;
          checkbox.dataset.value = opt;

          // Set initial checked state based on filtersState
          checkbox.checked = filtersState[card.id][filterType].has(opt);
          label.appendChild(checkbox);

          const span = document.createElement("span");
          span.className = "text-sm";
          span.textContent = opt;
          label.appendChild(span);
          group.appendChild(label);

          // Event listener for individual filter options
          checkbox.addEventListener("change", (e) => {
            e.stopPropagation();
            if (e.target.checked) {
              filtersState[card.id][filterType].add(opt); // Add filter
              const allCheckbox = dropdown.querySelector(`#${allId}`);
              if (allCheckbox) allCheckbox.checked = false; // Uncheck "All" if a specific option is selected
            } else {
              filtersState[card.id][filterType].delete(opt); // Remove filter
              // If no options are selected for this type, check "All"
              if (filtersState[card.id][filterType].size === 0) {
                const allCheckbox = dropdown.querySelector(`#${allId}`);
                if (allCheckbox) allCheckbox.checked = true;
              }
            }
            updateCardValue(card); // Update card value based on new filters
          });
        });

        return group;
      }

      // Append filter groups to the dropdown
      dropdown.appendChild(
        createFilterGroup(
          "Custom Fields",
          card.filterOptions.customFields,
          "customFields"
        )
      );
      dropdown.appendChild(
        createFilterGroup("Status", card.filterOptions.status, "status")
      );
      dropdown.appendChild(
        createFilterGroup("Due Date", card.filterOptions.dueDate, "dueDate")
      );
      dropdown.appendChild(
        createFilterGroup("Priority", card.filterOptions.priority, "priority")
      );

      // Assemble card elements
      filterContainer.appendChild(dropdown);
      contentEl.appendChild(titleEl);
      contentEl.appendChild(valueEl);
      cardEl.appendChild(filterContainer);

      cardsContainer.appendChild(cardEl);

      // Toggle dropdown visibility on button click
      const buttonHandler = (e) => {
        e.stopPropagation(); // Prevent click from propagating to body and closing dropdown immediately

        // Close all other open dropdowns
        document.querySelectorAll(".origin-top-left").forEach((dd) => {
          if (dd !== dropdown) dd.style.display = "none";
        });

        // Toggle dropdown visibility
        dropdown.style.display =
          dropdown.style.display === "block" ? "none" : "block";
      };
      filterButton.addEventListener("click", buttonHandler);
      // Store handler for cleanup
      filterButtonHandlers.push({
        button: filterButton,
        handler: buttonHandler,
      });
    });
    console.log("Cards created successfully");
  } catch (error) {
    console.error("Error creating cards:", error);
  }
}

/**
 * Updates a card's displayed value based on the currently applied filters.
 * This function simulates a filter effect for demonstration purposes.
 * @param {object} card - The card data object from dashboardData.
 */
function updateCardValue(card) {
  try {
    const filters = filtersState[card.id];

    // Check if "None" is selected in any filter category
    let hasNoneFilter = false;
    for (const filterType in filters) {
      if (filters[filterType].has("None")) {
        hasNoneFilter = true;
        break;
      }
    }

    if (hasNoneFilter) {
      setCardValue(card.id, 0); // If "None" is selected, value becomes 0
      return;
    }

    // Count how many filter categories have active selections (excluding "All")
    let activeCategoryCount = 0;
    for (const filterType in filters) {
      if (filters[filterType].size > 0) {
        activeCategoryCount++;
      }
    }

    // If no filters are applied across all categories, revert to original value
    if (activeCategoryCount === 0) {
      setCardValue(card.id, card.value);
      return;
    }

    // Simulate a reduction in value based on the number of active filter categories
    // This is a simplified simulation; real filtering would involve data manipulation.
    let base = Math.abs(card.value);
    const sign = card.value < 0 ? -1 : 1;

    // Apply a 25% reduction for each active filter category
    let adjusted = base * Math.max(0, 1 - 0.25 * activeCategoryCount);
    adjusted = Math.round(adjusted); // Round to nearest whole number

    setCardValue(card.id, sign * adjusted);
  } catch (error) {
    console.error("Error updating card value:", error);
  }
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

/**
 * Initializes Chart.js charts on the dashboard.
 */
function initCharts() {
  try {
    console.log("Initializing charts...");

    // Function to create chart with proper initialization
    const createChart = (id, config) => {
      const ctx = document.getElementById(id);
      if (!ctx) return null;

      // Ensure we destroy any existing chart instance
      if (charts[id]) {
        charts[id].destroy();
      }

      // Create new chart instance
      charts[id] = new Chart(ctx, config);
      return charts[id];
    };

    // Bar Chart - Task Overview
    createChart("barChart", {
      type: "bar",
      data: {
        labels: ["Completed", "Incomplete", "Overdue", "Total"],
        datasets: [
          {
            label: "Tasks",
            data: [2602, 44, 12, 2646],
            backgroundColor: ["#4f46e5", "#f59e0b", "#ef4444", "#10b981"],
            borderColor: ["#4f46e5", "#f59e0b", "#ef4444", "#10b981"],
            borderWidth: 1,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            padding: 12,
            titleFont: {
              size: 14,
            },
            bodyFont: {
              size: 14,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(0, 0, 0, 0.05)",
            },
            ticks: {
              color: "#4b5563",
            },
          },
          x: {
            grid: {
              display: false,
            },
            ticks: {
              color: "#4b5563",
            },
          },
        },
      },
    });

    // Pie Chart - Task Distribution
    createChart("pieChart", {
      type: "pie",
      data: {
        labels: ["Completed", "Pending", "In Progress", "Overdue"],
        datasets: [
          {
            data: [2602, 32, 12, 12],
            backgroundColor: ["#4f46e5", "#f59e0b", "#0ea5e9", "#ef4444"],
            borderColor: "#fff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              padding: 20,
              font: {
                size: 12,
              },
              color: "#1f2937",
            },
          },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            padding: 12,
          },
        },
      },
    });

    // Line Chart - Task Timeline
    createChart("lineChart", {
      type: "line",
      data: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
        datasets: [
          {
            label: "Completed Tasks",
            data: [320, 420, 510, 580, 610, 750, 820],
            borderColor: "#4f46e5",
            backgroundColor: "rgba(79, 70, 229, 0.1)",
            tension: 0.3,
            fill: true,
            pointBackgroundColor: "#4f46e5",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          },
          {
            label: "New Tasks",
            data: [450, 380, 410, 520, 610, 590, 680],
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.1)",
            tension: 0.3,
            fill: true,
            pointBackgroundColor: "#f59e0b",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: "#1f2937",
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(0, 0, 0, 0.05)",
            },
            ticks: {
              color: "#4b5563",
            },
          },
          x: {
            grid: {
              color: "rgba(0, 0, 0, 0.05)",
            },
            ticks: {
              color: "#4b5563",
            },
          },
        },
      },
    });

    // Doughnut Chart - Priority Distribution
    createChart("doughnutChart", {
      type: "doughnut",
      data: {
        labels: ["High Priority", "Medium Priority", "Low Priority"],
        datasets: [
          {
            data: [420, 850, 1376],
            backgroundColor: ["#ef4444", "#f59e0b", "#10b981"],
            borderColor: "#fff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              padding: 20,
              font: {
                size: 12,
              },
              color: "#1f2937",
            },
          },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            padding: 12,
          },
        },
        cutout: "70%",
      },
    });

    console.log("Charts initialized successfully");
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

/**
 * Initializes the dashboard: sets up state, creates cards, initializes charts, and enables drag-and-drop.
 */
function init() {
  try {
    console.log("Starting dashboard initialization...");

    // Always perform cleanup first to ensure a fresh start
    cleanup();

    // Initialize filtersState for each card
    dashboardData.forEach((card) => {
      filtersState[card.id] = {
        customFields: new Set(),
        status: new Set(),
        dueDate: new Set(),
        priority: new Set(),
      };
    });

    // Get the main container element for cards
    cardsContainer = document.querySelector(".card-grid");
    if (!cardsContainer) {
      console.error(
        "Cards container (.card-grid) not found in the DOM. Dashboard cannot be initialized."
      );
      return; // Exit if the container is not found
    }

    // Create the dashboard cards
    createCards();

    // Setup a global click handler to close dropdowns when clicking outside
    bodyClickHandler = (e) => {
      // Check if the click target is inside any dropdown
      const isInsideDropdown = e.target.closest(".origin-top-left");
      // Check if the click target is a filter button
      const isFilterButton = e.target.closest(".filter-button");

      // If the click is not inside a dropdown AND not on a filter button, close all dropdowns
      if (!isInsideDropdown && !isFilterButton) {
        document
          .querySelectorAll(".origin-top-left")
          .forEach((dd) => (dd.style.display = "none"));
      }
    };
    document.body.addEventListener("click", bodyClickHandler);

    // Initialize the charts
    initCharts();

    // Setup drag and drop functionality
    setupDragAndDrop();

    console.log("Dashboard initialized successfully");
  } catch (error) {
    console.error("Dashboard initialization failed:", error);
  }
}

export { init };


