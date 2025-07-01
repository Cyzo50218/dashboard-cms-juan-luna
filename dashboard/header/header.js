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
    searchExpand: document.querySelector(".search-expand"),
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
    emailContainer: document.querySelectorAll('.email-container'),
    inviteBtnPeople: document.getElementById('email-container-id-people'),
    inviteBtnGeneric: document.getElementById('email-container-id'),

    // Advanced Filter Elements
    filterToggleMenu: document.getElementById("filter-icon"),
    searchFilterMenu: document.getElementById("search-filter"),
    filterSearchInput: document.querySelector('.search-input-filter'),
    clearFilterInputBtn: document.querySelector('.clear-text'),
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
        withinUnitDropdown: document.getElementById('dueDateDropdownWithin'),
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

/**
 * Checks for mobile screen size.
 * @returns {boolean} True if the screen width is 768px or less.
 */
function isMobile() {
    return window.matchMedia("(max-width: 768px)").matches;
}

/**
 * Updates the user's profile picture and email in the header.
 * @param {object} user - The Firebase user object.
 */
async function updateProfileDisplay(user) {
    if (!user) return;

    const mainProfileImg = document.getElementById("profileToggle");
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

/**
 * Signs the current user out and redirects to the login page.
 */
async function handleLogout() {
    try {
        await signOut(auth);
        window.location.href = '/login/login.html';
    } catch (error) {
        console.error("Error signing out:", error);
    }
}

/**
 * Handles the creation of a new workspace via a prompt.
 */
async function handleNewWorkspace() {
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

/**
 * Handles clicks outside of specified active menus to close them.
 * @param {Event} e - The click event object.
 */
function handleOutsideClicks(e) {
    const clickedOutside = (menu, toggle) => menu && toggle && !menu.contains(e.target) && !toggle.contains(e.target);

    if (clickedOutside(ui.createExpand, ui.createToggle) && ui.createExpand.classList.contains("show")) {
        ui.createExpand.classList.add("hidden");
        ui.createExpand.classList.remove("show");
    }
    if (clickedOutside(ui.profileExpand, ui.profileToggle) && ui.profileExpand.classList.contains("show")) {
        ui.profileExpand.classList.add("hidden");
    }
    if (clickedOutside(ui.searchExpand, ui.searchToggle) && !ui.searchExpand.classList.contains("hidden")) {
        ui.searchExpand.classList.add("hidden");
        ui.searchToggle.classList.remove("hidden");
    }
    if (clickedOutside(ui.searchFilterMenu, ui.filterToggleMenu) && !e.target.closest('.calendar-dates div')) {
        if (!ui.searchFilterMenu.classList.contains("hidden")) {
            ui.searchFilterMenu.classList.add("hidden");
            if (!ui.filterToggleMenu.contains(e.target)) {
                ui.searchExpand.classList.remove("hidden");
                ui.searchToggle.classList.add("hidden");
            }
        }
    }
}

// --- 7. SEARCH FUNCTIONALITY ---

// 7.1. Simple Search (Main Search Bar)
function handleMainSearchInput() {
    const value = ui.searchInput.value.trim();
    ui.cancelSearchIcon.classList.toggle('hidden', value === '');
    ui.savedContainer.classList.toggle('hidden', value !== '');
    ui.recentContainer.classList.toggle('hidden', value !== '');
    ui.searchQueryContainer.classList.toggle('hidden', value === '');

    if (value === '') {
        resetToDefaultSearchView();
        return;
    }

    ui.searchQueryContainer.innerHTML = `<div class="skeleton-loader" style="width: 200px;"></div><div class="skeleton-loader" style="width: 500px;"></div>`;
    ui.searchQueryContainer.classList.add("skeleton-active");

    setTimeout(() => {
        ui.searchQueryContainer.classList.remove("skeleton-active");
        ui.searchQueryContainer.innerHTML = '';

        const startsWithKeyword = value.startsWith('with:') || value.startsWith('assignee:') || value.startsWith('in:');
        ui.searchOptions.classList.toggle('hidden', startsWithKeyword);
        ui.optionsQuery.classList.toggle('hidden', !startsWithKeyword);

        if (value.startsWith('with:') || value.startsWith('assignee:')) {
            ui.inviteBtnGeneric.classList.remove('hidden');
        }
    }, 1000);
}

function resetToDefaultSearchView() {
    ui.searchQueryContainer.classList.add("hidden");
    ui.optionsQuery.classList.add("hidden");
    ui.searchOptions.classList.remove("hidden");
    ui.inviteBtnGeneric.classList.add('hidden');
    if (ui.messagesEmptyState) ui.messagesEmptyState.classList.toggle("hidden", !state.isMessagesTabSelected);
    if (ui.peopleEmptyState) ui.peopleEmptyState.classList.toggle("hidden", !state.isPeopleTabSelected);
}

function clearMainSearch() {
    ui.searchInput.value = '';
    ui.cancelSearchIcon.classList.add('hidden');
    ui.savedContainer.classList.remove("hidden");
    ui.searchOptions.classList.remove("hidden");
    ui.recentContainer.classList.remove("hidden");
    ui.inviteBtnGeneric.classList.add('hidden');
    ui.searchInput.focus();
}

// 7.2. Contextual Search (Tasks & Projects Quick Actions)
function setupContextualSearch(prefix, showEmail = false) {
    ui.searchInput.value = prefix;
    ui.cancelSearchIcon.classList.remove('hidden');
    ui.searchOptions.classList.add("hidden");
    ui.savedContainer.classList.add("hidden");
    ui.recentContainer.classList.add("hidden");

    if (showEmail) {
        ui.inviteBtnGeneric.classList.remove('hidden');
        ui.searchQueryContainer.classList.remove("hidden");
        ui.optionsQuery.classList.remove("hidden");
    }
    ui.searchInput.focus();
}

// 7.3. Advanced Search (Filter Menu)
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
            const el = document.createElement('div');
            el.textContent = d;
            days.appendChild(el);
        });
        cal.appendChild(days);

        const dates = document.createElement('div');
        dates.className = 'calendar-dates';
        const startDay = localMonth.startOf('month').day();
        for (let i = 0; i < startDay; i++) {
            dates.appendChild(document.createElement('div'));
        }

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
        ui.dueDateFields.extraDropdown.textContent = formatted;
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
    [withinContainer, rangeContainer, specificDateContainer].forEach(c => c.classList.add('hidden'));

    state.filter.rangeStart = null;
    state.filter.rangeEnd = null;
    rangeStart.textContent = 'Start';
    rangeEnd.textContent = 'End';

    if (['Yesterday', 'Today', 'Tomorrow', 'Specific Date'].includes(selectedDueDate)) {
        specificDateContainer.classList.remove('hidden');
    } else if (['Within the last', 'Within the next'].includes(selectedDueDate)) {
        withinContainer.classList.remove('hidden');
    } else if (selectedDueDate === 'Date Range') {
        rangeContainer.classList.remove('hidden');
    }
    renderCalendar(state.currentMonth);
}

// --- 8. EVENT LISTENER INITIALIZATION ---

function initializeEventListeners() {
    // Core UI
    if (ui.menuToggle) ui.menuToggle.addEventListener("click", () => {
        const isClosed = ui.drawer.classList.toggle("close");
        ui.rootdrawer.style.width = isClosed ? "80px" : "260px";
    });
    if (ui.searchToggle) ui.searchToggle.addEventListener("click", () => {
        ui.searchExpand.classList.remove("hidden");
        ui.searchToggle.classList.add("hidden");
    });
    if (ui.createToggle) ui.createToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        ui.createExpand.classList.remove("hidden");
        ui.createExpand.classList.add("show");
    });
    if (ui.profileToggle) ui.profileToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        ui.profileExpand.classList.remove("hidden");
    });

    document.addEventListener("click", (e) => {
        handleOutsideClicks(e);
        if (e.target.closest('#logout-btn')) handleLogout();
        if (e.target.closest('#add-workspace-btn')) handleNewWorkspace();
    });

    // Main Search
    if (ui.searchInput) ui.searchInput.addEventListener('input', handleMainSearchInput);
    if (ui.cancelSearchIcon) ui.cancelSearchIcon.addEventListener('click', clearMainSearch);

    // Contextual Search
    ui.taskOptionBtns.forEach((btn, index) => btn.addEventListener('click', () => {
        const actions = { 0: ['in: '], 1: ['assignee: ', true], 2: ['with: ', true] };
        setupContextualSearch(...actions[index]);
    }));
    ui.projectOptionBtns.forEach((btn, index) => btn.addEventListener('click', () => {
        const actions = { 0: ['owner: ', true], 1: ['with: ', true] };
        setupContextualSearch(...actions[index]);
    }));

    // Invite Modal
    [ui.inviteBtnPeople, ui.inviteBtnGeneric].forEach(btn => {
        if (btn) btn.addEventListener('click', async () => {
            const result = await showInviteModal();
            console.log(result ? `Invitation details: ${JSON.stringify(result)}` : "Modal closed.");
        });
    });

    // Main Tab Selection
    ui.mainOptionBtns.forEach((btn, index) => {
        btn.addEventListener("click", () => {
            const isSelected = btn.classList.toggle("selected");
            state.isPeopleTabSelected = index === 2 && isSelected;
            state.isMessagesTabSelected = index === 3 && isSelected;

            ui.mainOptionBtns.forEach((otherBtn, otherIndex) => {
                if (index !== otherIndex) {
                    otherBtn.classList.remove("selected");
                    if (isSelected) otherBtn.classList.add("hide");
                }
            });
            if (!isSelected) ui.mainOptionBtns.forEach(b => b.classList.remove("hide"));

            const contentMap = { 0: ui.mytaskdisplay, 1: ui.projectdisplay, 2: ui.peopleEmptyState, 3: ui.messagesEmptyState };
            Object.values(contentMap).forEach(el => { if(el) el.classList.add('hidden') });
            if (isSelected && contentMap[index]) contentMap[index].classList.remove('hidden');
        });
    });

    // Advanced Filter
    if (ui.filterToggleMenu) ui.filterToggleMenu.addEventListener('click', () => {
        ui.searchFilterMenu.classList.remove("hidden");
        ui.searchExpand.classList.add("hidden");
    });

    document.querySelectorAll(".dropdown-menu .dropdown-item").forEach(item => {
        item.addEventListener("click", function(e) {
            e.preventDefault();
            const selectedText = this.textContent.trim();
            const button = this.closest('.dropdown-menu').previousElementSibling;
            if (!button) return;
            button.textContent = selectedText;

            switch (button.id) {
                case 'typeDropdown': updateFilterFieldsVisibility(selectedText); break;
                case 'locatedDropdown':
                case 'locatedDropdownProjects':
                    state.filter.location = selectedText;
                    if (ui.fields.extraField) ui.fields.extraField.classList.toggle('hidden', !['In any of these projects', 'In all of these projects'].includes(selectedText));
                    break;
                case 'dueDateDropdown':
                case 'dueDateDropdownExtra':
                    handleDueDateChange(selectedText);
                    break;
                case 'statusDropdown': state.filter.status = selectedText; break;
                case 'statusProjectDropdown': state.filter.statusProject = selectedText; break;
            }
        });
    });

    if (ui.plusField) ui.plusField.addEventListener("click", () => {
        if (ui.newExtraInput) ui.newExtraInput.classList.remove("hidden");
        if (ui.plusIcon) ui.plusIcon.classList.add("hidden");
        if (ui.closeIcon) ui.closeIcon.style.display = "inline";
    });

    if (ui.closeIcon) ui.closeIcon.addEventListener("click", (e) => {
        e.stopPropagation();
        if (ui.newExtraInput) ui.newExtraInput.classList.add("hidden");
        if (ui.plusIcon) ui.plusIcon.classList.remove("hidden");
        ui.closeIcon.style.display = "none";
    });
}

// --- 9. MAIN EXECUTION ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '/login/login.html';
        return;
    }

    console.log("Header script running for user:", user.uid);
    lucide.createIcons();
    updateProfileDisplay(user);
    initializeEventListeners();
    renderCalendar(state.currentMonth);

    // Set initial UI state
    if(ui.searchQueryContainer) ui.searchQueryContainer.classList.add("hidden");
    if(ui.closeIcon) ui.closeIcon.style.display = "none";
    if(ui.optionsQuery) ui.optionsQuery.classList.add("hidden");
    if(ui.rootdrawer) ui.rootdrawer.style.width = "260px";
});