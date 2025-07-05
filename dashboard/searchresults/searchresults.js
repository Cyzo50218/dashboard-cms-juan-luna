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

// Firebase services
let app, auth, db, storage;

// Mock Data
const mockResults = [{
    id: "1",
    type: "task",
    title: "Design landing page for Seasonal Marketing Campaign",
    assignee: "Aalifa",
    assigneeIds: ["user1"],
    dueDate: "2023-10-28",
    project: "Creative Production (Data for...)",
    tags: ["Design", "Marketing"],
    status: "assigned",
}, {
    id: "2",
    type: "task",
    title: "Swag for Marketing Team and Biz Kickoff",
    assignee: "Asifa",
    assigneeIds: ["user2"],
    dueDate: "2023-12-12",
    project: "Creative Production (Data for...)",
    tags: ["Promo", "Event"],
    status: "assigned",
}, {
    id: "3",
    type: "task",
    title: "Japanese Launch Assets",
    assignee: "Arny Love",
    assigneeIds: ["user3"],
    dueDate: "2023-09-11",
    project: "Creative Production APAC",
    tags: ["Localization", "Design"],
    status: "due",
}, {
    id: "4",
    type: "task",
    title: "Help with graphics for our seasonal marketing campaign",
    assignee: "Any Love",
    assigneeIds: ["user4"],
    dueDate: "2024-10-06",
    project: "Creative Production",
    tags: ["Graphics", "Marketing"],
    status: "completed",
}, {
    id: "5",
    type: "task",
    title: "Estimate global marketing impact",
    assignee: "Andrew Webster",
    assigneeIds: ["user5"],
    dueDate: "2023-09-30",
    project: "Project D4",
    tags: ["Analysis", "Report"],
    status: "due",
}, {
    id: "6",
    type: "task",
    title: "Product Voice — FY23 Seasonal Marketing",
    assignee: "Blake Pham",
    assigneeIds: ["user6"],
    dueDate: "2023-10-15",
    project: "Creative Production",
    tags: ["Branding", "Copy"],
    status: "assigned",
}, {
    id: "7",
    type: "task",
    title: 'Sony\'s "All Projects" marketing review',
    assignee: "Blake Pham",
    assigneeIds: ["user6"],
    dueDate: "2023-11-01",
    project: "Customer Experience",
    tags: ["Review", "Client"],
    status: "assigned",
}, {
    id: "8",
    type: "task",
    title: "Core Team Weekly marketing sync",
    assignee: "Blake Pham",
    assigneeIds: ["user6"],
    dueDate: "2023-09-22",
    project: "Core Team Weekly",
    tags: ["Meeting", "Sync"],
    status: "completed",
}, ];

const mockUsers = {
    user1: {
        uid: "user1",
        name: "Aalifa",
        avatar: null
    },
    user2: {
        uid: "user2",
        name: "Asifa",
        avatar: null
    },
    user3: {
        uid: "user3",
        name: "Arny Love",
        avatar: null
    },
    user4: {
        uid: "user4",
        name: "Any Love",
        avatar: null
    },
    user5: {
        uid: "user5",
        name: "Andrew Webster",
        avatar: null
    },
    user6: {
        uid: "user6",
        name: "Blake Pham",
        avatar: null
    },
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
const clearSearchBtn = document.getElementById("clearSearchBtn");
const scrollWrapper = document.querySelector(".horizontal-scrollbar-wrapper");

// State
let currentFilter = "task";
let currentSort = "relevance";
let currentView = "list";
let searchTerm = "marketing";
let isStarred = false;
let activeAdvancedFilters = ["assignee", "dueDate"];
let selectedRating = 0;
let starredSearches = [];

// Counts for filters
const resultCounts = {
    task: 25,
    message: 4,
    project: 17,
    portfolio: 2,
    goal: 0,
    people: 12,
};

// Abort controller for cleaning up event listeners
let eventListenersController = new AbortController();

/**
 * Logs an error with a standardized, descriptive format.
 * @param {string} context - The context where the error occurred (e.g., function name).
 * @param {Error} error - The error object.
 */
function logError(context, error) {
    console.error(`[SearchResults Error] in ${context}:`, error);
}

/**
 * Main initialization function to set up the search results page.
 * @param {User} user - The authenticated Firebase user.
 */
function init(user) {
    console.log("Initializing search results component for user:", user.uid);
    eventListenersController = new AbortController(); // Reset abort controller

    try {
        // Load starred searches from localStorage
        starredSearches = JSON.parse(localStorage.getItem("starredSearches")) || [];

        // Setup initial UI and state
        setupInitialUI();
        attachEventListeners();

        // Initial render of data
        const filteredResults = filterResults();
        renderResults(filteredResults);
        updateStats(filteredResults.length);
        updateHeader();
        updateStarIcon();
        renderActiveFilters();
    } catch (error) {
        logError("init", error);
    }
}

/**
 * Cleans up all event listeners and resets the state.
 */
function cleanup() {
    console.log("Cleaning up search results component.");
    eventListenersController.abort();
    resultsContainer.innerHTML = "";
    document.getElementById("activeFiltersContainer").innerHTML = "";
}

/**
 * Sets up the initial state of the UI elements.
 */
function setupInitialUI() {
    try {
        filterButtons.forEach((button) => {
            const filter = button.dataset.filter;
            if (filter && resultCounts[filter] !== undefined) {
                // Avoid adding duplicate count elements
                if (button.querySelector(".searchresult-filter-count")) {
                    button.querySelector(".searchresult-filter-count").remove();
                }
                const countElement = document.createElement("span");
                countElement.className = "searchresult-filter-count";
                countElement.textContent =
                    filter === "task" || filter === "project" ?
                    `${resultCounts[filter]}+` :
                    resultCounts[filter];
                button.appendChild(countElement);
            }
        });
        setActiveFilter(currentFilter);
        setActiveView(currentView);
        updateClearButton();
    } catch (error) {
        logError("setupInitialUI", error);
    }
}

/**
 * Attaches all necessary event listeners for the component.
 */
function attachEventListeners() {
    const {
        signal
    } = eventListenersController;

    try {
        // Search functionality
        searchInput.addEventListener("keyup", handleSearch, {
            signal
        });
        searchInput.addEventListener("input", updateClearButton, {
            signal
        });
        clearSearchBtn.addEventListener("click", clearSearch, {
            signal
        });
        document.querySelector(".searchresult-btn").addEventListener("click", handleSearchButtonClick, {
            signal
        });

        // Filtering, sorting, and view
        filterButtons.forEach(button => button.addEventListener("click", handleFilterClick, {
            signal
        }));
        sortSelect.addEventListener("change", handleSortChange, {
            signal
        });
        viewButtons.forEach(button => button.addEventListener("click", handleViewChange, {
            signal
        }));

        // Starred searches and actions
        starButton.addEventListener("click", toggleStar, {
            signal
        });
        savedSearchesToggle.addEventListener("click", handleSavedSearchesToggle, {
            signal
        });
        document.addEventListener("click", handleDocumentClickForDropdown, {
            signal
        });

        // Advanced filters
        document.getElementById("activeFiltersContainer").addEventListener("click", handleRemoveFilter, {
            signal
        });

        // Feedback modal
        feedbackBtn.addEventListener("click", openFeedbackModal, {
            signal
        });
        closeModalBtn.addEventListener("click", closeFeedbackModal, {
            signal
        });
        cancelFeedbackBtn.addEventListener("click", closeFeedbackModal, {
            signal
        });
        submitFeedbackBtn.addEventListener("click", submitFeedback, {
            signal
        });
        feedbackModal.addEventListener("click", (e) => e.target === feedbackModal && closeFeedbackModal(), {
            signal
        });
        stars.forEach(star => star.addEventListener("click", handleStarRating, {
            signal
        }));

        // Horizontal scroll sync
        scrollWrapper.addEventListener("scroll", () => (resultsContainer.scrollLeft = scrollWrapper.scrollLeft), {
            signal
        });
        resultsContainer.addEventListener("scroll", () => (scrollWrapper.scrollLeft = resultsContainer.scrollLeft), {
            signal
        });

    } catch (error) {
        logError("attachEventListeners", error);
    }
}

// ==============================================
// EVENT HANDLER FUNCTIONS
// ==============================================

function handleSearch(e) {
    if (e.key === "Enter") {
        searchTerm = e.target.value.toLowerCase();
        performSearch();
    }
}

function handleSearchButtonClick() {
    searchTerm = searchInput.value.toLowerCase();
    performSearch();
}

function clearSearch() {
    searchInput.value = "";
    searchTerm = "";
    updateClearButton();
    performSearch();
}

function handleFilterClick(e) {
    try {
        const filter = e.currentTarget.dataset.filter;
        if (["task", "message", "project", "portfolio", "goal"].includes(filter)) {
            currentFilter = filter;
            setActiveFilter(currentFilter);
        } else {
            // Toggle advanced filter
            if (activeAdvancedFilters.includes(filter)) {
                activeAdvancedFilters = activeAdvancedFilters.filter((f) => f !== filter);
            } else {
                activeAdvancedFilters.push(filter);
            }
            renderActiveFilters();
        }
        performSearch();
        updateHeader();
    } catch (error) {
        logError("handleFilterClick", error);
    }
}

function handleRemoveFilter(e) {
    if (e.target.classList.contains("remove-filter")) {
        try {
            const filter = e.target.dataset.filter;
            activeAdvancedFilters = activeAdvancedFilters.filter((f) => f !== filter);
            renderActiveFilters();
            performSearch();
        } catch (error) {
            logError("handleRemoveFilter", error);
        }
    }
}

function handleSortChange(e) {
    currentSort = e.target.value;
    performSearch();
}

function handleViewChange(e) {
    currentView = e.currentTarget.dataset.view;
    setActiveView(currentView);
    // In a real app, this would change the view rendering logic
    console.log(`View changed to: ${currentView}`);
}

function handleSavedSearchesToggle(e) {
    e.stopPropagation();
    populateSavedSearchesDropdown();
    savedSearchesDropdown.classList.toggle("hidden");
}

function handleDocumentClickForDropdown(e) {
    if (!savedSearchesDropdown.contains(e.target) && !savedSearchesToggle.contains(e.target)) {
        savedSearchesDropdown.classList.add("hidden");
    }
}

function handleStarRating(e) {
    try {
        selectedRating = parseInt(e.target.dataset.rating);
        updateStars();
    } catch (error) {
        logError("handleStarRating", error);
    }
}


// ==============================================
// CORE LOGIC FUNCTIONS
// ==============================================

/**
 * Executes a search, filters, sorts, and renders the results.
 */
function performSearch() {
    try {
        const filteredResults = filterResults();
        renderResults(filteredResults);
        updateStats(filteredResults.length);
        updateHeader();
        updateStarIcon();
    } catch (error) {
        logError("performSearch", error);
    }
}

/**
 * Renders the search results in the container.
 * @param {Array} results - The search results to render.
 */
function renderResults(results) {
    try {
        resultsContainer.innerHTML = "";

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

        const sortedResults = sortResults([...results]);

        if (sortedResults.length === 0) {
            const noResultsMessage = document.createElement('div');
            noResultsMessage.className = 'searchresult-no-results';
            noResultsMessage.textContent = 'No results found. Try a different search term or adjust your filters.';
            resultsContainer.appendChild(noResultsMessage);
            return;
        }

        sortedResults.forEach((item) => {
            const resultItem = document.createElement("div");
            resultItem.className = "searchresult-item";
            resultItem.dataset.id = item.id;

            const formattedDueDate = formatDueDate(item.dueDate);
            let highlightedTitle = item.title;
            let highlightedProject = item.project;

            if (searchTerm) {
                const regex = new RegExp(`(${searchTerm})`, "gi");
                highlightedTitle = item.title.replace(regex, '<span class="searchresult-highlight">$1</span>');
                highlightedProject = item.project.replace(regex, '<span class="searchresult-highlight">$1</span>');
            }

            const tagsHTML = item.tags.map((tag) => `<span class="searchresult-tag">${tag}</span>`).join("");
            const statusClass = `searchresult-status searchresult-status-${item.status}`;
            const statusText = item.status.charAt(0).toUpperCase() + item.status.slice(1);
            const avatarHTML = createAvatarStackHTML(item.assigneeIds, mockUsers);

            resultItem.innerHTML = `
                <div class="searchresult-status-container">
                    <span class="${statusClass}"></span>
                    <span class="status-text">${statusText}</span>
                </div>
                <div class="searchresult-title">
                    <span class="title-text">${highlightedTitle}</span>
                </div>
                <div class="searchresult-details">${avatarHTML}</div>
                <div class="searchresult-details"><i class="fas fa-calendar"></i> ${formattedDueDate}</div>
                <div class="searchresult-details"><i class="fas fa-layer-group"></i> ${highlightedProject}</div>
                <div class="searchresult-details">${tagsHTML}</div>
            `;
            resultItem.addEventListener("click", () => console.log(`Opening task ${item.id}`));
            resultsContainer.appendChild(resultItem);
        });
    } catch (error) {
        logError("renderResults", error);
    }
}

function filterResults() {
    try {
        let filtered = mockResults;

        if (searchTerm) {
            const lowerCaseSearchTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(
                (item) =>
                item.title.toLowerCase().includes(lowerCaseSearchTerm) ||
                item.assignee.toLowerCase().includes(lowerCaseSearchTerm) ||
                item.project.toLowerCase().includes(lowerCaseSearchTerm) ||
                item.tags.some((tag) => tag.toLowerCase().includes(lowerCaseSearchTerm))
            );
        }

        if (currentFilter !== "all") {
            filtered = filtered.filter((item) => item.type === currentFilter);
        }

        return filtered;
    } catch (error) {
        logError("filterResults", error);
        return [];
    }
}

function sortResults(results) {
    try {
        switch (currentSort) {
            case "newest":
                return results.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));
            case "dueDate":
                return results.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
            default: // relevance
                return results;
        }
    } catch (error) {
        logError("sortResults", error);
        return results;
    }
}


// ==============================================
// UTILITY & UI FUNCTIONS
// ==============================================

function updateHeader() {
    searchTitle.textContent = searchTerm ? `"${searchTerm}" Search Results` : "My Recent Tasks";
    const countText = resultCounts[currentFilter] !== undefined ?
        `${currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1)}s (${resultCounts[currentFilter]}${currentFilter === 'task' || currentFilter === 'project' ? '+' : ''})` :
        `Tasks (${resultCounts.task}+)`;
    searchSubtitle.textContent = countText;
}

function updateStats(count) {
    const resultCountElement = searchStats.querySelector(".searchresult-result-count");
    if (resultCountElement) {
        resultCountElement.textContent = count;
    }
}

function renderActiveFilters() {
    const container = document.getElementById("activeFiltersContainer");
    container.innerHTML = "";
    activeAdvancedFilters.forEach((filter) => {
        const span = document.createElement("span");
        span.className = "searchresult-tag";
        span.innerHTML = `${filter.charAt(0).toUpperCase() + filter.slice(1)} <button class="remove-filter" data-filter="${filter}">×</button>`;
        container.appendChild(span);
    });
}

function setActiveFilter(filter) {
    filterButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.filter === filter);
    });
}

function setActiveView(view) {
    viewButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.view === view);
    });
}

function updateClearButton() {
    clearSearchBtn.classList.toggle("visible", searchInput.value.trim() !== "");
}

function formatDueDate(dateString) {
    try {
        const date = new Date(dateString);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.getTime() === today.getTime()) return "Today";
        if (date.getTime() === tomorrow.getTime()) return "Tomorrow";
        if (date.getTime() === yesterday.getTime()) return "Yesterday";
        if (date < today) return "Past due";

        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric"
        });
    } catch (error) {
        logError("formatDueDate", error);
        return "Invalid Date";
    }
}

function createAvatarStackHTML(assigneeIds, allUsers) {
    if (!assigneeIds || assigneeIds.length === 0) return "";

    const maxVisible = 3;
    let visibleAssignees = assigneeIds.slice(0, maxVisible);
    let overflowCount = assigneeIds.length > maxVisible ? assigneeIds.length - (maxVisible - 1) : 0;


    const avatarsHTML = visibleAssignees
        .map((userId, index) => {
            const user = allUsers[userId];
            if (!user) return "";
            const zIndex = 50 - index;
            if (user.avatar) {
                return `<div class="user-avatar" title="${user.name}" style="z-index: ${zIndex};"><img src="${user.avatar}" alt="${user.name}"></div>`;
            } else {
                const initials = (user.name || "?").split(" ").map(n => n[0]).join("").substring(0, 2);
                const bgColor = "#" + (user.uid || "000000").substring(0, 6);
                return `<div class="user-avatar" title="${user.name}" style="background-color: ${bgColor}; color: white; z-index: ${zIndex};">${initials}</div>`;
            }
        })
        .join("");

    const overflowHTML = overflowCount > 0 ? `<div class="user-avatar overflow" style="z-index: ${50 - maxVisible};">+${overflowCount}</div>` : "";

    return `<div class="avatar-stack">${avatarsHTML}${overflowHTML}</div>`;
}

function showToast(message) {
    const existingToast = document.querySelector(".toast");
    if (existingToast) existingToast.remove();

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<i class="fas fa-check-circle"></i> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==============================================
// STARRED SEARCHES & ACTIONS
// ==============================================

async function addSearchQueryToStarred() {
    console.log("Starring search query:", {
        searchTerm,
        currentFilter,
        activeAdvancedFilters
    });
    try {
        // This is where Clinton's Firestore implementation will go.
        // The await call will handle the asynchronous nature of the Firestore operation.
        // await addDoc(collection(db, "starredSearches"), {
        //     term: searchTerm,
        //     filters: activeAdvancedFilters,
        //     typeFilter: currentFilter,
        //     createdAt: serverTimestamp(),
        //     userId: auth.currentUser.uid,
        // });
        console.log("Search parameters prepared for saving to Firestore.");
    } catch (error) {
        logError("addSearchQueryToStarred", error);
        showToast("Error: Could not save search.");
    }
}

function toggleStar() {
    const term = searchInput.value.trim();
    if (!term) return;

    const index = starredSearches.findIndex((s) => s.term === term);
    if (index === -1) {
        starredSearches.push({
            term,
            date: new Date().toISOString()
        });
        isStarred = true;
        addSearchQueryToStarred(); // Call the async function
    } else {
        starredSearches.splice(index, 1);
        isStarred = false;
        // Here you might also want a function to remove it from Firestore
    }

    localStorage.setItem("starredSearches", JSON.stringify(starredSearches));
    updateStarIcon();
    showToast(isStarred ? "Search saved to starred!" : "Search removed from starred");
}

function updateStarIcon() {
    const term = searchInput.value.trim();
    const isCurrentlyStarred = starredSearches.some((s) => s.term === term);
    starButton.innerHTML = isCurrentlyStarred ? '<i class="fas fa-star text-yellow-400"></i>' : '<i class="far fa-star"></i>';
}

function populateSavedSearchesDropdown() {
    try {
        savedSearchesDropdown.innerHTML = "";
        if (starredSearches.length === 0) {
            savedSearchesDropdown.innerHTML = '<div class="text-gray-500 p-2">No saved searches</div>';
            return;
        }

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
                performSearch();
                savedSearchesDropdown.classList.add("hidden");
                showToast(`Loaded search: ${search.term}`);
            });
            savedSearchesDropdown.appendChild(item);
        });

        const divider = document.createElement("div");
        divider.className = "dropdown-divider";
        savedSearchesDropdown.appendChild(divider);

        const actions = [{
            icon: "copy",
            text: "Copy search results link",
            action: copySearchLink
        }, {
            icon: "print",
            text: "Print results",
            action: printSearchResults
        }, {
            icon: "file-export",
            text: "Export to CSV",
            action: exportSearchResults
        }, ];

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

    } catch (error) {
        logError("populateSavedSearchesDropdown", error);
    }
}


function copySearchLink() {
    try {
        const params = new URLSearchParams({
            search: searchInput.value,
            filter: currentFilter,
            sort: currentSort,
            view: currentView,
        });
        const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
        navigator.clipboard.writeText(url).then(() => {
            showToast("Link copied to clipboard!");
            savedSearchesDropdown.classList.add("hidden");
        }).catch(err => {
            logError("copySearchLink.clipboard", err);
            showToast("Failed to copy link");
        });
    } catch (error) {
        logError("copySearchLink", error);
    }
}

function printSearchResults() {
    try {
        const printStyle = document.createElement("style");
        printStyle.innerHTML = `
            @media print {
                body > *:not(#resultsContainer) { display: none !important; }
                #resultsContainer {
                    position: static !important;
                    width: 100% !important;
                    height: auto !important;
                    overflow: visible !important;
                    box-shadow: none !important;
                    border: none !important;
                }
                .searchresult-table-header { position: static !important; }
            }
        `;
        document.head.appendChild(printStyle);
        window.print();
        printStyle.remove();
        savedSearchesDropdown.classList.add("hidden");
    } catch (error) {
        logError("printSearchResults", error);
    }
}

function exportSearchResults() {
    try {
        const results = filterResults();
        if (results.length === 0) {
            showToast("No results to export");
            return;
        }

        let csv = "ID,Type,Title,Assignee,DueDate,Project,Tags,Status\n";
        results.forEach((item) => {
            const assignee = `"${item.assignee.replace(/"/g, '""')}"`;
            const title = `"${item.title.replace(/"/g, '""')}"`;
            const project = `"${item.project.replace(/"/g, '""')}"`;
            const tags = `"${item.tags.join(", ")}"`;
            csv += `"${item.id}","${item.type}",${title},${assignee},"${item.dueDate}",${project},${tags},"${item.status}"\n`;
        });

        const blob = new Blob([csv], {
            type: "text/csv;charset=utf-8;"
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `search_results_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast("Results exported to CSV");
        savedSearchesDropdown.classList.add("hidden");
    } catch (error) {
        logError("exportSearchResults", error);
    }
}

// ==============================================
// FEEDBACK MODAL FUNCTIONS
// ==============================================

function openFeedbackModal() {
    feedbackModal.classList.remove("hidden");
    feedbackText.value = "";
    selectedRating = 0;
    updateStars();
}

function closeFeedbackModal() {
    feedbackModal.classList.add("hidden");
}

function updateStars() {
    stars.forEach((star, index) => {
        star.classList.toggle("fas", index < selectedRating);
        star.classList.toggle("active", index < selectedRating);
        star.classList.toggle("far", index >= selectedRating);
    });
}

function submitFeedback() {
    try {
        const feedback = feedbackText.value.trim();
        if (!feedback || selectedRating === 0) {
            showToast("Please provide a rating and feedback.");
            return;
        }

        console.log("Feedback submitted:", {
            feedback,
            rating: selectedRating
        });
        // In a real app, you would send this to your server
        // try { await sendFeedbackToServer({ feedback, rating: selectedRating }); ... } catch ...

        showToast("Thank you for your feedback!");
        closeFeedbackModal();
    } catch (error) {
        logError("submitFeedback", error);
    }
}

// ==============================================
// APP ENTRY POINT
// ==============================================

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app, "juanluna-cms-01");
    storage = getStorage(app);

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in, initialize the component
            init(user);
        } else {
            // User is signed out, clean up listeners and UI
            cleanup();
            console.log("User is signed out. Search results component is inactive.");
            resultsContainer.innerHTML = '<div class="searchresult-no-results">Please log in to see your tasks.</div>';
        }
    });
} catch (error) {
    logError("Firebase Initialization", error);
    resultsContainer.innerHTML = '<div class="searchresult-no-results">Error: Could not connect to services. Please refresh the page.</div>';
}