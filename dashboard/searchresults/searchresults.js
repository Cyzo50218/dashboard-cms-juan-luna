import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  increment,
  doc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDoc,
  getDocs,
  orderBy,
  limit,
  collectionGroup,
  writeBatch,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

import {
  firebaseConfig
} from "/services/firebase-config.js";

let app, auth, db, storage;

app = initializeApp(firebaseConfig);
auth = getAuth(app);
db = getFirestore(app, "juanluna-cms-01");
storage = getStorage(app);

const mockResults = [
  {
    id: "1",
    type: "task",
    title: "Design landing page for Seasonal Marketing Campaign",
    assignee: "Aalifa",
    assigneeIds: ["user1"],
    dueDate: "2023-10-28",
    project: "Creative Production (Data for...)",
    tags: ["Design", "Marketing"],
    status: "assigned",
  },
  {
    id: "2",
    type: "task",
    title: "Swag for Marketing Team and Biz Kickoff",
    assignee: "Asifa",
    assigneeIds: ["user2"],
    dueDate: "2023-12-12",
    project: "Creative Production (Data for...)",
    tags: ["Promo", "Event"],
    status: "assigned",
  },
  {
    id: "3",
    type: "task",
    title: "Japanese Launch Assets",
    assignee: "Arny Love",
    assigneeIds: ["user3"],
    dueDate: "2023-09-11",
    project: "Creative Production APAC",
    tags: ["Localization", "Design"],
    status: "due",
  },
  {
    id: "4",
    type: "task",
    title: "Help with graphics for our seasonal marketing campaign",
    assignee: "Any Love",
    assigneeIds: ["user4"],
    dueDate: "2024-10-06",
    project: "Creative Production",
    tags: ["Graphics", "Marketing"],
    status: "completed",
  },
  {
    id: "5",
    type: "task",
    title: "Estimate global marketing impact",
    assignee: "Andrew Webster",
    assigneeIds: ["user5"],
    dueDate: "2023-09-30",
    project: "Project D4",
    tags: ["Analysis", "Report"],
    status: "due",
  },
  {
    id: "6",
    type: "task",
    title: "Product Voice — FY23 Seasonal Marketing",
    assignee: "Blake Pham",
    assigneeIds: ["user6"],
    dueDate: "2023-10-15",
    project: "Creative Production",
    tags: ["Branding", "Copy"],
    status: "assigned",
  },
  {
    id: "7",
    type: "task",
    title: 'Sony\'s "All Projects" marketing review',
    assignee: "Blake Pham",
    assigneeIds: ["user6"],
    dueDate: "2023-11-01",
    project: "Customer Experience",
    tags: ["Review", "Client"],
    status: "assigned",
  },
  {
    id: "8",
    type: "task",
    title: "Core Team Weekly marketing sync",
    assignee: "Blake Pham",
    assigneeIds: ["user6"],
    dueDate: "2023-09-22",
    project: "Core Team Weekly",
    tags: ["Meeting", "Sync"],
    status: "completed",
  },
];

// Mock user data for avatar display
const mockUsers = {
  user1: { uid: "user1", name: "Aalifa", avatar: null },
  user2: { uid: "user2", name: "Asifa", avatar: null },
  user3: { uid: "user3", name: "Arny Love", avatar: null },
  user4: { uid: "user4", name: "Any Love", avatar: null },
  user5: { uid: "user5", name: "Andrew Webster", avatar: null },
  user6: { uid: "user6", name: "Blake Pham", avatar: null },
};

// DOM Elements
const resultsContainer = document.getElementById("resultsContainer");
const searchInput = document.getElementById("searchInput");
const filterButtons = document.querySelectorAll(".searchresult-filter");
const sortSelect = document.getElementById("sortSelect");
const viewButtons = document.querySelectorAll(".searchresult-view-btn");
const searchStats = document.getElementById("searchStats");
const searchTitle = document.getElementById("searchTitle");
const searchSubtitle = document.getElementById("searchSubtitle");
const starButton = document.getElementById("starButton");
const savedSearchesDropdown = document.getElementById("savedSearchesDropdown");
const savedSearchesToggle = document.getElementById("savedSearchesToggle");
const feedbackBtn = document.getElementById("feedbackBtn");
const feedbackModal = document.getElementById("feedbackModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelFeedbackBtn = document.getElementById("cancelFeedbackBtn");
const submitFeedbackBtn = document.getElementById("submitFeedbackBtn");
const feedbackText = document.getElementById("feedbackText");
const stars = document.querySelectorAll(".searchresult-stars i");
const clearSearchBtn = document.getElementById("clearSearchBtn"); // New element

// State
let currentFilter = "task";
let currentSort = "relevance";
let currentView = "list";
let searchTerm = "marketing";
let isStarred = false;
let activeAdvancedFilters = ["assignee", "dueDate"];
let selectedRating = 0;

// Counts for filters
const resultCounts = {
  task: 25,
  message: 4,
  project: 17,
  portfolio: 2,
  goal: 0,
  people: 12,
};

// Starred searches
let starredSearches = JSON.parse(localStorage.getItem("starredSearches")) || [];

// ==============================================
// EMPTY FUNCTION FOR CLINTON TO IMPLEMENT
// ==============================================
function addSearchQueryToStarred() {
  /* 
  EMPTY FUNCTION - CLINTON WILL IMPLEMENT FIREBASE FIRESTORE HERE
  
  This will save the current search query to Firestore
  Parameters to consider:
    - searchTerm
    - currentFilter
    - activeAdvancedFilters
    - any other relevant search parameters
  
  Example implementation (Clinton will add):
    try {
      await db.collection("starredSearches").add({
        term: searchTerm,
        filters: activeAdvancedFilters,
        createdAt: new Date(),
        userId: currentUser.uid
      });
      console.log("Search saved to Firestore");
    } catch (error) {
      console.error("Error saving search:", error);
    }
  */
  console.log("Starring search query - Firestore implementation coming soon");
}
// ==============================================

const scrollWrapper = document.querySelector(
  ".horizontal-scrollbar-wrapper"
);
const resultsContainer = document.getElementById("resultsContainer");

scrollWrapper.addEventListener("scroll", () => {
  resultsContainer.scrollLeft = scrollWrapper.scrollLeft;
});

resultsContainer.addEventListener("scroll", () => {
  scrollWrapper.scrollLeft = resultsContainer.scrollLeft;
});

// Render search results
function renderResults(results) {
  resultsContainer.innerHTML = "";

  // Create table header with list.js style columns
  const header = document.createElement("div");
  header.className = "searchresult-table-header";
  header.innerHTML = `
    <div>Status</div>
    <div>Task Name</div>
    <div>Assignee</div>
    <div>Due Date</div>
    <div>Projects</div>
    <div>Tags</div>
  `;
  resultsContainer.appendChild(header);

  // Sort results
  const sortedResults = sortResults([...results]);

  sortedResults.forEach((item) => {
    const resultItem = document.createElement("div");
    resultItem.className = "searchresult-item";
    resultItem.dataset.id = item.id;

    // Format due date
    const formattedDueDate = formatDueDate(item.dueDate);

    // Highlight search terms
    let highlightedTitle = item.title;
    let highlightedProject = item.project;

    if (searchTerm) {
      const regex = new RegExp(`(${searchTerm})`, "gi");
      highlightedTitle = item.title.replace(
        regex,
        '<span class="searchresult-highlight">$1</span>'
      );
      highlightedProject = item.project.replace(
        regex,
        '<span class="searchresult-highlight">$1</span>'
      );
    }

    // Create tags
    const tagsHTML = item.tags
      .map((tag) => `<span class="searchresult-tag">${tag}</span>`)
      .join("");

    // Status indicator
    const statusClass = `searchresult-status searchresult-status-${item.status}`;
    const statusText =
      item.status === "assigned"
        ? "Assigned"
        : item.status === "due"
        ? "Due Soon"
        : "Completed";

    // Create avatar stack
    const avatarHTML = createAvatarStackHTML(item.assigneeIds, mockUsers);

    resultItem.innerHTML = `
      <div class="searchresult-status-container">
        <span class="${statusClass}"></span>
        <span class="status-text">${statusText}</span>
      </div>
      <div class="searchresult-title">
        <span class="title-text">${highlightedTitle}</span>
      </div>
      <div class="searchresult-details">
        ${avatarHTML}
      </div>
      <div class="searchresult-details">
        <i class="fas fa-calendar"></i>
        ${formattedDueDate}
      </div>
      <div class="searchresult-details">
        <i class="fas fa-layer-group"></i>
        ${highlightedProject}
      </div>
      <div class="searchresult-details">
        ${tagsHTML}
      </div>
    `;

    // Add click handler to make entire row clickable
    resultItem.addEventListener("click", () => {
      console.log(`Opening task ${item.id}`);
      // In a real app: openTaskDetails(item.id);
    });

    resultsContainer.appendChild(resultItem);
  });
}

// Format due date for display
function formatDueDate(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const dateWithoutTime = new Date(date);
  dateWithoutTime.setHours(0, 0, 0, 0);

  if (dateWithoutTime.getTime() === today.getTime()) {
    return "Today";
  } else if (dateWithoutTime.getTime() === tomorrow.getTime()) {
    return "Tomorrow";
  } else if (dateWithoutTime.getTime() === yesterday.getTime()) {
    return "Yesterday";
  } else if (dateWithoutTime < today) {
    return "Past due";
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

// Filter results based on current state
function filterResults() {
  let filtered = mockResults;

  // Apply search filter
  if (searchTerm) {
    filtered = filtered.filter(
      (item) =>
        item.title.toLowerCase().includes(searchTerm) ||
        item.assignee.toLowerCase().includes(searchTerm) ||
        item.project.toLowerCase().includes(searchTerm) ||
        item.tags.some((tag) => tag.toLowerCase().includes(searchTerm))
    );
  }

  // Apply type filter
  if (currentFilter !== "all") {
    filtered = filtered.filter((item) => item.type === currentFilter);
  }

  return filtered;
}

// Sort results based on current sort option
function sortResults(results) {
  switch (currentSort) {
    case "newest":
      return results.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));
    case "dueDate":
      return results.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    default: // relevance
      return results;
  }
}

// Create avatar stack HTML (from list.js)
function createAvatarStackHTML(assigneeIds, allUsers) {
  if (!assigneeIds || assigneeIds.length === 0) return "";

  const maxVisible = 3;
  let visibleAssignees = assigneeIds;
  let overflowCount = 0;

  if (assigneeIds.length > maxVisible) {
    visibleAssignees = assigneeIds.slice(0, maxVisible - 1);
    overflowCount = assigneeIds.length - (maxVisible - 1);
  }

  const avatarsHTML = visibleAssignees
    .map((userId, index) => {
      const user = allUsers[userId];
      if (!user) return "";

      const zIndex = 50 - index;

      if (user.avatar && user.avatar.startsWith("https://")) {
        return `
      <div class="user-avatar" title="${user.name}" style="z-index: ${zIndex};">
        <img src="${user.avatar}" alt="${user.name}">
      </div>`;
      } else {
        const initials = (user.name || "?")
          .split(" ")
          .map((n) => n[0])
          .join("")
          .substring(0, 2);
        const bgColor = "#" + (user.uid || "000000").substring(0, 6);
        return `<div class="user-avatar" title="${user.name}" style="background-color: ${bgColor}; color: white; z-index: ${zIndex};">${initials}</div>`;
      }
    })
    .join("");

  let overflowHTML = "";
  if (overflowCount > 0) {
    const zIndex = 50 - maxVisible;
    overflowHTML = `<div class="user-avatar overflow" style="z-index: ${zIndex};">+${overflowCount}</div>`;
  }

  return `<div class="avatar-stack">${avatarsHTML}${overflowHTML}</div>`;
}

// Update active filter button
function setActiveFilter(filter) {
  filterButtons.forEach((button) => {
    if (button.dataset.filter === filter) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });
}

// Update active view button
function setActiveView(view) {
  viewButtons.forEach((button) => {
    if (button.dataset.view === view) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });
}

// Update search stats
function updateStats(count) {
  const resultCountElement = searchStats.querySelector(
    ".searchresult-result-count"
  );
  if (resultCountElement) {
    resultCountElement.textContent = count;
  }
}

// Render active filters
function renderActiveFilters() {
  const container = document.getElementById("activeFiltersContainer");
  container.innerHTML = "";

  activeAdvancedFilters.forEach((filter) => {
    const span = document.createElement("span");
    span.className = "searchresult-tag";
    span.innerHTML = `
      ${
        filter === "collaborator"
          ? "1 collaborator"
          : filter === "titleOnly"
          ? "Title only"
          : filter === "moreFilters"
          ? "More filters"
          : filter.charAt(0).toUpperCase() + filter.slice(1)
      }
      <button class="remove-filter" data-filter="${filter}">×</button>
    `;
    container.appendChild(span);
  });
}

// Update header titles
function updateHeader() {
  if (searchTerm) {
    searchTitle.textContent = `"${searchTerm}" Search Results`;
  } else {
    searchTitle.textContent = "My Recent Tasks";
  }

  // Update subtitle based on active filter
  let countText = "";
  switch (currentFilter) {
    case "task":
      countText = `Tasks (${resultCounts.task}+)`;
      break;
    case "message":
      countText = `Messages (${resultCounts.message})`;
      break;
    case "project":
      countText = `Projects (${resultCounts.project}+)`;
      break;
    case "portfolio":
      countText = `Portfolios (${resultCounts.portfolio})`;
      break;
    case "goal":
      countText = `Goals (${resultCounts.goal})`;
      break;
    default:
      countText = `Tasks (${resultCounts.task}+)`;
  }
  searchSubtitle.textContent = countText;
}

// Toggle star for current search
function toggleStar() {
  const term = searchInput.value.trim();
  if (!term) return;

  const index = starredSearches.findIndex((s) => s.term === term);
  if (index === -1) {
    // Add to starred
    starredSearches.push({ term, date: new Date().toISOString() });
    isStarred = true;

    // CALL THE EMPTY FUNCTION FOR CLINTON TO IMPLEMENT
    addSearchQueryToStarred();
  } else {
    // Remove from starred
    starredSearches.splice(index, 1);
    isStarred = false;
  }

  // Save to localStorage
  localStorage.setItem("starredSearches", JSON.stringify(starredSearches));

  // Update UI
  updateStarIcon();
  showToast(
    isStarred ? "Search saved to starred!" : "Search removed from starred"
  );
}

// Update star icon based on current search
function updateStarIcon() {
  const term = searchInput.value.trim();
  const isStarred = starredSearches.some((s) => s.term === term);
  if (isStarred) {
    starButton.innerHTML = '<i class="fas fa-star text-yellow-400"></i>';
  } else {
    starButton.innerHTML = '<i class="far fa-star"></i>';
  }
}

// Populate saved searches dropdown
function populateSavedSearchesDropdown() {
  savedSearchesDropdown.innerHTML = "";

  if (starredSearches.length === 0) {
    const noResults = document.createElement("div");
    noResults.className = "text-gray-500 p-2";
    noResults.textContent = "No saved searches";
    savedSearchesDropdown.appendChild(noResults);
  } else {
    // Sort by date (newest first)
    starredSearches.sort((a, b) => new Date(b.date) - new Date(a.date));

    starredSearches.forEach((search) => {
      const item = document.createElement("div");
      item.className = "saved-search-item";
      item.innerHTML = `
        <span>${search.term}</span>
        <i class="fas fa-star"></i>
      `;

      item.addEventListener("click", () => {
        searchInput.value = search.term;
        searchTerm = search.term.toLowerCase();
        const filteredResults = filterResults();
        renderResults(filteredResults);
        updateStats(filteredResults.length);
        updateHeader();
        updateStarIcon();
        savedSearchesDropdown.classList.add("hidden");
        showToast(`Loaded search: ${search.term}`);
      });

      savedSearchesDropdown.appendChild(item);
    });
  }

  // Add divider
  const divider = document.createElement("div");
  divider.className = "dropdown-divider";
  savedSearchesDropdown.appendChild(divider);

  // Add action buttons
  const actions = [
    { icon: "copy", text: "Copy search results link", action: copySearchLink },
    { icon: "print", text: "Print results", action: printSearchResults },
    { icon: "file-export", text: "Export to CSV", action: exportSearchResults },
  ];

  actions.forEach((action) => {
    const button = document.createElement("div");
    button.className = "action-button";
    button.innerHTML = `
      <i class="fas fa-${action.icon} text-gray-500"></i>
      <span>${action.text}</span>
    `;
    button.addEventListener("click", action.action);
    savedSearchesDropdown.appendChild(button);
  });
}

// Show toast notification
function showToast(message) {
  // Remove existing toast
  const existingToast = document.querySelector(".toast");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <i class="fas fa-check-circle"></i>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);

  // Show toast
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  // Hide after 3 seconds
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

// Copy search link to clipboard
function copySearchLink() {
  // Generate URL with current search parameters
  const params = new URLSearchParams();
  params.set("search", searchInput.value);
  params.set("filter", currentFilter);
  params.set("sort", currentSort);
  params.set("view", currentView);

  const url = `${window.location.origin}${
    window.location.pathname
  }?${params.toString()}`;

  navigator.clipboard
    .writeText(url)
    .then(() => {
      showToast("Link copied to clipboard!");
      savedSearchesDropdown.classList.add("hidden");
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
      showToast("Failed to copy link");
    });
}

// Print search results
function printSearchResults() {
  // Create a print stylesheet
  const printStyle = document.createElement("style");
  printStyle.innerHTML = `
    @media print {
      body > *:not(#resultsContainer) {
        display: none !important;
      }
      #resultsContainer {
        position: static !important;
        width: 100% !important;
        height: auto !important;
        overflow: visible !important;
      }
      .searchresult-table-header {
        position: static !important;
      }
    }
  `;
  document.head.appendChild(printStyle);

  window.print();

  // Clean up after printing
  setTimeout(() => {
    printStyle.remove();
  }, 500);

  savedSearchesDropdown.classList.add("hidden");
}

// Export search results to CSV
function exportSearchResults() {
  const results = filterResults();

  if (results.length === 0) {
    showToast("No results to export");
    return;
  }

  // CSV header
  let csv = "ID,Type,Title,Assignee,Due Date,Project,Tags,Status\n";

  // Add each result as a CSV row
  results.forEach((item) => {
    csv += `"${item.id}","${item.type}","${item.title}","${item.assignee}","${
      item.dueDate
    }","${item.project}","${item.tags.join(", ")}","${item.status}"\n`;
  });

  // Create download link
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `search_results_${new Date().toISOString().slice(0, 10)}.csv`
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("Results exported to CSV");
  savedSearchesDropdown.classList.add("hidden");
}

// Open feedback modal
function openFeedbackModal() {
  feedbackModal.classList.remove("hidden");
  feedbackText.value = "";
  selectedRating = 0;
  updateStars();
}

// Close feedback modal
function closeFeedbackModal() {
  feedbackModal.classList.add("hidden");
}

// Update star rating display
function updateStars() {
  stars.forEach((star, index) => {
    if (index < selectedRating) {
      star.classList.remove("far");
      star.classList.add("fas", "active");
    } else {
      star.classList.remove("fas", "active");
      star.classList.add("far");
    }
  });
}

// Submit feedback
function submitFeedback() {
  const feedback = feedbackText.value.trim();

  if (!feedback) {
    showToast("Please enter your feedback");
    return;
  }

  if (selectedRating === 0) {
    showToast("Please select a rating");
    return;
  }

  // In a real app, you would send this to your server
  console.log("Feedback submitted:", {
    feedback,
    rating: selectedRating,
  });

  showToast("Thank you for your feedback!");
  closeFeedbackModal();
}

onAuthStateChanged(auth, async (user) => {
  // Initialize counts
  filterButtons.forEach((button) => {
    const filter = button.dataset.filter;
    if (filter && resultCounts[filter] !== undefined) {
      const countElement = document.createElement("span");
      countElement.className = "searchresult-filter-count";
      countElement.textContent =
        filter === "task" || filter === "project"
          ? `${resultCounts[filter]}+`
          : resultCounts[filter];
      button.appendChild(countElement);
    }
  });

  // Set initial active filter
  setActiveFilter(currentFilter);
  setActiveView(currentView);

  // Initialize star button
  starButton.addEventListener("click", toggleStar);
  updateStarIcon();

  // Initialize saved searches dropdown
  savedSearchesToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    populateSavedSearchesDropdown();
    savedSearchesDropdown.classList.toggle("hidden");
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (
      !savedSearchesDropdown.contains(e.target) &&
      !savedSearchesToggle.contains(e.target)
    ) {
      savedSearchesDropdown.classList.add("hidden");
    }
  });

  // Initialize advanced filters
  const advancedFilterButtons = document.querySelectorAll(
    ".searchresult-filter"
  );
  advancedFilterButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      const filter = button.dataset.filter;

      // Skip if it's a main filter
      if (
        ["task", "message", "project", "portfolio", "goal"].includes(filter)
      ) {
        currentFilter = filter;
        setActiveFilter(currentFilter);
      } else {
        // Toggle advanced filter
        if (activeAdvancedFilters.includes(filter)) {
          activeAdvancedFilters = activeAdvancedFilters.filter(
            (f) => f !== filter
          );
        } else {
          activeAdvancedFilters.push(filter);
        }

        renderActiveFilters();
      }

      const filteredResults = filterResults();
      renderResults(filteredResults);
      updateStats(filteredResults.length);
      updateHeader();
    });
  });

  // Initialize remove filter buttons
  document
    .getElementById("activeFiltersContainer")
    .addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-filter")) {
        const filter = e.target.dataset.filter;
        activeAdvancedFilters = activeAdvancedFilters.filter(
          (f) => f !== filter
        );
        renderActiveFilters();

        const filteredResults = filterResults();
        renderResults(filteredResults);
        updateStats(filteredResults.length);
      }
    });

  // Set initial header state
  updateHeader();

  // Initialize with active advanced filters
  renderActiveFilters();

  // ==================================================
  // FIXED: CLEAR SEARCH FUNCTIONALITY
  // ==================================================

  // Show/hide clear button based on input
  function updateClearButton() {
    if (searchInput.value.trim() !== "") {
      clearSearchBtn.classList.add("visible");
    } else {
      clearSearchBtn.classList.remove("visible");
    }
  }

  searchInput.addEventListener("input", updateClearButton);

  // Clear search functionality
  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchTerm = "";
    updateClearButton();

    // Clear and reload results
    const filteredResults = filterResults();
    renderResults(filteredResults);
    updateStats(filteredResults.length);
    updateHeader();
    updateStarIcon();
  });

  // Initialize clear button visibility
  updateClearButton();
  // ==================================================

  // ==================================================
  // FIXED: INITIAL RENDER OF MOCK RESULTS
  // ==================================================
  // Render initial results AFTER DOM is ready
  const filteredResults = filterResults();
  renderResults(filteredResults);
  updateStats(filteredResults.length);
  // ==================================================

  // Search functionality
  searchInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      searchTerm = e.target.value.toLowerCase();
      const filteredResults = filterResults();
      renderResults(filteredResults);
      updateStats(filteredResults.length);
      updateHeader();
      updateStarIcon();
    }
  });

  // Search button functionality
  document.querySelector(".searchresult-btn").addEventListener("click", () => {
    searchTerm = searchInput.value.toLowerCase();
    const filteredResults = filterResults();
    renderResults(filteredResults);
    updateStats(filteredResults.length);
    updateHeader();
    updateStarIcon();
  });

  // Filter button functionality
  filterButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      // Skip if it's an advanced filter
      if (
        !["task", "message", "project", "portfolio", "goal"].includes(
          button.dataset.filter
        )
      ) {
        return;
      }

      currentFilter = button.dataset.filter;
      setActiveFilter(currentFilter);
      const filteredResults = filterResults();
      renderResults(filteredResults);
      updateStats(filteredResults.length);
      updateHeader();
    });
  });

  // Sort functionality
  sortSelect.addEventListener("change", (e) => {
    currentSort = e.target.value;
    const filteredResults = filterResults();
    renderResults(filteredResults);
  });

  // View functionality
  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.view;
      setActiveView(currentView);
      // In a real app, this would change the view
    });
  });

  // Feedback functionality
  feedbackBtn.addEventListener("click", openFeedbackModal);
  closeModalBtn.addEventListener("click", closeFeedbackModal);
  cancelFeedbackBtn.addEventListener("click", closeFeedbackModal);
  submitFeedbackBtn.addEventListener("click", submitFeedback);

  // Star rating functionality
  stars.forEach((star) => {
    star.addEventListener("click", (e) => {
      selectedRating = parseInt(e.target.dataset.rating);
      updateStars();
    });
  });

  // Close modal when clicking outside
  feedbackModal.addEventListener("click", (e) => {
    if (e.target === feedbackModal) {
      closeFeedbackModal();
    }
  });
});
