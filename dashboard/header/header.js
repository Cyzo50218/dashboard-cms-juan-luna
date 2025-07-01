/**
 * header.js
 *
 * Manages all interactive elements within the main application header.
 * - Handles user authentication and profile display.
 * - Provides logout and new workspace functionality.
 * - Manages simple and advanced search/filter UI.
 */

// --- 1. FIREBASE IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, runTransaction, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";
import { showInviteModal } from '/dashboard/components/showEmailModel.js';

// --- 2. FIREBASE INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

// --- 3. UI ELEMENT SELECTORS ---
const ui = {
    // Main Layout & Toggles
    rootdrawer: document.getElementById("rootdrawer"),
    drawer: document.getElementById("dashboardDrawer"),
    menuToggle: document.getElementById("menuToggle"),
    profileToggle: document.getElementById("profileToggle"),
    profileExpand: document.querySelector(".account-expand"),
    createToggle: document.getElementById("createToggle"),
    createExpand: document.querySelector(".create-expand"),

    // Search & Filter
    searchToggle: document.getElementById("searchToggle"),
    searchExpand: document.getElementById("searchExpand"),
    searchInput: document.querySelector('.search-input'),
    cancelSearchIcon: document.querySelector('.cancel-search-icon'),
    searchOptions: document.querySelector('.search-options'),
    recentContainer: document.getElementById('recent-container'),
    savedContainer: document.getElementById('saved-container'),
    searchQueryContainer: document.getElementById('half-query'),
    optionsQuery: document.getElementById('options-query'),
    peopleEmptyState: document.getElementById('people-empty-state'),
    messagesEmptyState: document.getElementById('messages-empty-state'),

    // Main Content Tabs
    mainOptionBtns: document.querySelectorAll(".option-btn"),
    mytaskdisplay: document.getElementById("mytask-display"),
    projectdisplay: document.getElementById("project-display"),
    savedSearchText: document.getElementById('saved-searches-text'),
    savedSearchContainer: document.querySelector('.saved-searches'),

    // Task & Project Specific Buttons
    taskOptionBtns: document.querySelectorAll('.mytask-display .option-btn-tasks'),
    projectOptionBtns: document.querySelectorAll('.project-display .option-btn-tasks'),

    // Invite/Email Modals
    inviteBtnPeople: document.getElementById('email-container-id-people'),
    inviteBtnGeneric: document.getElementById('email-container-id'),

    // Advanced Filter Elements
    filterToggleMenu: document.getElementById("filter-icon"),
    searchFilterMenu: document.getElementById("search-filter"),
    closeFilterBtn: document.getElementById('close-filter-btn'),
    searchContentArea: document.querySelector('.search-content-area'),
    filterSearchInput: document.querySelector('.search-input-filter'),
    typeDropdown: document.getElementById("typeDropdown"),
    plusField: document.getElementById("plus-field"),
    plusIcon: document.getElementById('plus'),
    closeIcon: document.getElementById("plus-field")?.querySelector(".close-icon"),
    newExtraInput: document.getElementById("new-extra-input"),

    // Dynamic Filter Fields
    fields: {
        authors: document.getElementById('authors'),
        collaborators: document.getElementById('collaborators'),
        assignedTo: document.getElementById('assigned-to'),
        owners: document.getElementById('owners'),
        members: document.getElementById('members'),
        locatedGlobal: document.getElementById('locatedGlobal'),
        locatedProjectDropdown: document.getElementById('locatedProjectDropdown'),
        extraField: document.getElementById('extra-field'),
        extraFieldProject: document.getElementById('extra-field-projectdropdown'),
        status: document.getElementById('status-field'),
        statusProject: document.getElementById('status-project-field'),
        dueDate: document.getElementById('due-date-field'),
    },

    // Due Date Filter Components
    dueDateFields: {
        mainDropdown: document.getElementById('dueDateDropdown'),
        extraDropdown: document.getElementById('dueDateDropdownExtra'),
        withinInput: document.getElementById('inputDueDateWithin'),
        dateSelector: document.getElementById('dateSelectorDropdown'),
        rangeStart: document.getElementById('dateRangeOneDropdown'),
        rangeEnd: document.getElementById('dateRangeTwoDropdown'),
        specificDateContainer: document.getElementById('duedate-dropdown-extra'),
        withinContainer: document.getElementById('duedate-dropdown-within'),
        rangeContainer: document.getElementById('duedate-dropdown-date-range'),
        calendars: [
            document.getElementById('calendar'),
            document.getElementById('calendar1'),
            document.getElementById('calendar2')
        ]
    }
};

// --- 4. STATE MANAGEMENT ---
let state = {
    isMessagesTabSelected: false,
    isPeopleTabSelected: false,
    currentMonth: dayjs(),
    filter: {
        type: "Any",
        location: "Anywhere",
        status: "",
        statusProject: "",
        dueDate: "",
        withinDays: null,
        withinUnit: "days",
        rangeStart: null,
        rangeEnd: null,
    }
};

// --- 5. HELPER & UTILITY FUNCTIONS ---

/** Updates the user's profile picture and email in the header. */
async function updateProfileDisplay(user) {
    if (!user) return;
    const mainProfileImg = document.getElementById("profile-picture");
    const expandProfileImg = document.getElementById("profile-picture-expand");
    const expandEmail = document.getElementById("account-email");

    if (expandEmail) expandEmail.textContent = user.email;

    try {
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);
        const avatarUrl = userSnap.exists() && userSnap.data().avatar ? userSnap.data().avatar : (user.photoURL || 'assets/img/default-avatar.png');

        if (mainProfileImg) mainProfileImg.src = avatarUrl;
        if (expandProfileImg) expandProfileImg.src = avatarUrl;
    } catch (error) {
        console.error("Error fetching user avatar from Firestore:", error);
    }
}

// --- 6. CORE UI & AUTHENTICATION HANDLERS ---

/** Signs the current user out and redirects to the login page. */
async function handleLogout() {
    try {
        await signOut(auth);
        window.location.href = '/login/login.html';
    } catch (error) {
        console.error("Error signing out:", error);
    }
}

/** Handles the creation of a new workspace via a prompt. */
async function handleNewWorkspace() {
    // This function requires runTransaction, query, where, serverTimestamp from Firestore
    const currentUser = auth.currentUser;
    if (!currentUser) return alert("You must be logged in to create a workspace.");

    const newWorkspaceName = prompt("Enter a name for your new workspace:");
    if (!newWorkspaceName || !newWorkspaceName.trim()) return;

    const workspacesColRef = collection(db, `users/${currentUser.uid}/myworkspace`);
    try {
        await runTransaction(db, async (transaction) => {
            const selectedQuery = query(workspacesColRef, where("isSelected", "==", true));
            const selectedSnapshot = await transaction.get(selectedQuery);

            if (!selectedSnapshot.empty) {
                const oldSelectedDoc = selectedSnapshot.docs[0];
                const oldWorkspaceRef = doc(workspacesColRef, oldSelectedDoc.id);
                transaction.update(oldWorkspaceRef, { isSelected: false });
            }

            const newWorkspaceRef = doc(workspacesColRef);
            transaction.set(newWorkspaceRef, {
                name: newWorkspaceName.trim(),
                isSelected: true,
                createdAt: serverTimestamp(),
                members: [currentUser.uid]
            });
        });
        alert(`Workspace "${newWorkspaceName.trim()}" created successfully!`);
        window.location.replace('/');
    } catch (error) {
        console.error("Error creating new workspace:", error);
        alert("Failed to create the new workspace. Please try again.");
    }
}

/** Handles clicks outside of specified active menus to close them. */
function handleOutsideClicks(e) {
    const isClickOutside = (element, trigger) =>
        element && !element.classList.contains('hidden') &&
        !element.contains(e.target) && !trigger.contains(e.target);
    
    if (isClickOutside(ui.createExpand, ui.createToggle)) ui.createExpand.classList.add('hidden');
    if (isClickOutside(ui.accountExpand, ui.profileToggle)) ui.accountExpand.classList.add('hidden');
    if (isClickOutside(ui.searchExpand, ui.searchToggle) && !e.target.closest('.dropdown-menu')) {
        ui.searchExpand.classList.add('hidden');
        ui.searchToggle.classList.remove('hidden');
    }
}

// --- 7. SEARCH FUNCTIONALITY ---

// 7.1. Advanced Search (Filter Menu)
function renderCalendar(month) {
    ui.dueDateFields.calendars.forEach((cal, index) => {
        if (!cal) return;
        cal.innerHTML = '';
        const localMonth = month.clone();
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.innerHTML = `<span class="prev-month">&#x2329;</span><span>${localMonth.format('MMMM YYYY')}</span><span class="next-month">&#x232A;</span>`;
        cal.appendChild(header);

        header.querySelector('.prev-month').onclick = () => renderCalendar(state.currentMonth.subtract(1, 'month'));
        header.querySelector('.next-month').onclick = () => renderCalendar(state.currentMonth.add(1, 'month'));

        const days = document.createElement('div');
        days.className = 'calendar-days';
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => {
            const el = document.createElement('div'); el.textContent = d; days.appendChild(el);
        });
        cal.appendChild(days);

        const dates = document.createElement('div');
        dates.className = 'calendar-dates';
        const startDay = localMonth.startOf('month').day();
        for (let i = 0; i < startDay; i++) dates.appendChild(document.createElement('div'));

        for (let d = 1; d <= localMonth.daysInMonth(); d++) {
            const dateEl = document.createElement('div');
            const thisDate = localMonth.date(d);
            dateEl.textContent = d;
            if (thisDate.isSame(dayjs(), 'day')) dateEl.classList.add('today');
            if ((index === 1 && state.filter.rangeStart?.isSame(thisDate, 'day')) || (index === 2 && state.filter.rangeEnd?.isSame(thisDate, 'day'))) {
                dateEl.classList.add('selected');
            }
            dateEl.onclick = () => handleDateSelection(thisDate, index);
            dates.appendChild(dateEl);
        }
        cal.appendChild(dates);
    });
}

function handleDateSelection(date, calendarIndex) {
    const formatted = date.format('YYYY-MM-DD');
    if (calendarIndex === 1) {
        state.filter.rangeStart = date;
        ui.dueDateFields.rangeStart.textContent = formatted;
    } else if (calendarIndex === 2) {
        state.filter.rangeEnd = date;
        ui.dueDateFields.rangeEnd.textContent = formatted;
    } else {
        ui.dueDateFields.dateSelector.textContent = formatted;
    }
    renderCalendar(state.currentMonth);
}

function updateFilterFieldsVisibility(type) {
    Object.values(ui.fields).forEach(f => { if (f) f.classList.add('hidden') });
    state.filter.type = type;

    const show = (keys) => keys.forEach(key => { if (ui.fields[key]) ui.fields[key].classList.remove('hidden') });

    switch (type) {
        case 'Tasks':
            show(['locatedGlobal', 'collaborators', 'assignedTo', 'status', 'dueDate']);
            break;
        case 'Projects':
            show(['owners', 'members', 'locatedProjectDropdown', 'statusProject']);
            break;
        case 'Portfolio':
            show(['owners', 'members']);
            break;
        case 'Messages':
            show(['locatedGlobal', 'collaborators', 'assignedTo', 'authors']);
            break;
        default: // 'Any'
            show(['locatedGlobal', 'collaborators', 'assignedTo']);
            break;
    }
}

function handleDueDateChange(selectedDueDate) {
    state.filter.dueDate = selectedDueDate;
    const { mainDropdown, extraDropdown, withinContainer, rangeContainer, specificDateContainer, rangeStart, rangeEnd } = ui.dueDateFields;

    mainDropdown.textContent = selectedDueDate;
    extraDropdown.textContent = selectedDueDate;
    [withinContainer, rangeContainer, specificDateContainer].forEach(c => c && c.classList.add('hidden'));

    state.filter.rangeStart = null;
    state.filter.rangeEnd = null;
    if(rangeStart) rangeStart.textContent = 'Start';
    if(rangeEnd) rangeEnd.textContent = 'End';

    if (['Yesterday', 'Today', 'Tomorrow', 'Specific Date'].includes(selectedDueDate)) {
        if(specificDateContainer) specificDateContainer.classList.remove('hidden');
    } else if (['Within the last', 'Within the next'].includes(selectedDueDate)) {
        if(withinContainer) withinContainer.classList.remove('hidden');
    } else if (selectedDueDate === 'Date Range') {
        if(rangeContainer) rangeContainer.classList.remove('hidden');
    }
    renderCalendar(state.currentMonth);
}

// --- 8. EVENT LISTENER INITIALIZATION ---
function initializeEventListeners() {
    // Dropdown Toggles
    if (ui.createToggle) ui.createToggle.addEventListener('click', (e) => { e.stopPropagation(); ui.createExpand.classList.toggle('hidden'); });
    if (ui.profileToggle) ui.profileToggle.addEventListener('click', (e) => { e.stopPropagation(); ui.accountExpand.classList.toggle('hidden'); });

    // Search Toggles
    if (ui.searchToggle) ui.searchToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        ui.searchToggle.classList.add('hidden');
        ui.searchExpand.classList.remove('hidden');
    });

    if (ui.filterToggleMenu) ui.filterToggleMenu.addEventListener('click', () => {
        ui.searchFilterMenu.classList.remove('hidden');
        ui.searchContentArea.classList.add('hidden');
    });

    if (ui.closeFilterBtn) ui.closeFilterBtn.addEventListener('click', () => {
        ui.searchFilterMenu.classList.add('hidden');
        ui.searchContentArea.classList.remove('hidden');
    });

    // Main Search Option Tabs
    ui.optionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const wasSelected = btn.classList.contains('selected');
            document.querySelectorAll('.mytask-display, .project-display, #people-query, #message-query').forEach(el => el.classList.add('hidden'));
            ui.optionBtns.forEach(b => b.classList.remove('selected'));
            if(ui.savedContainer) ui.savedContainer.classList.remove('hidden');

            if (!wasSelected) {
                btn.classList.add('selected');
                const targetId = btn.dataset.target;
                const targetElement = document.getElementById(targetId);
                if (targetElement) targetElement.classList.remove('hidden');
                if(ui.savedContainer) ui.savedContainer.classList.add('hidden');
            }
        });
    });

    // Advanced Filter Dropdown Logic
    document.querySelectorAll(".dropdown-menu .dropdown-item").forEach(item => {
        item.addEventListener("click", function(e) {
            e.preventDefault();
            const selectedText = this.textContent.trim();
            const dropdownMenu = this.closest(".dropdown-menu");
            const button = dropdownMenu.previousElementSibling;

            if (button) button.textContent = selectedText;

            switch (dropdownMenu.getAttribute("aria-labelledby")) {
                case 'typeDropdown': updateFilterFieldsVisibility(selectedText); break;
                case 'dueDateDropdown':
                case 'dueDateDropdownExtra':
                    handleDueDateChange(selectedText);
                    break;
            }
        });
    });
    
    // Global Click Listener for closing menus
    document.addEventListener('click', handleOutsideClicks);

    // Logout
    if (ui.logoutBtn) ui.logoutBtn.addEventListener('click', handleLogout);
}


// --- 9. MAIN EXECUTION ---
auth.onAuthStateChanged(user => {
    if (user) {
        console.log("User is authenticated. Initializing header.");
        if (window.lucide) window.lucide.createIcons();
        
        updateProfileDisplay(user);
        initializeEventListeners();
        renderCalendar(state.currentMonth);
    } else {
        console.log("User is not authenticated. Redirecting to login.");
        // window.location.href = '/login/login.html';
    }
});