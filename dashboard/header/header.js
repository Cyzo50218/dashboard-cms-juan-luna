
/**
 * header.js
 *
 * This script manages all interactive elements within the main application header.
 * It handles user authentication state to display profile information,
 * provides logout and new workspace functionality, and manages the search/filter UI.
 */

// --- 1. FIREBASE IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, runTransaction,
    doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";
import { showInviteModal } from '/dashboard/components/showEmailModel.js';


// --- 2. FIREBASE INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

async function updateProfileDisplay(user) {
  if (!user) return;

  const mainProfileImg = document.getElementById("profileToggle"); // assuming <img id="profileToggle" />
  const expandProfileImg = document.querySelector(".profile-picture-expand"); // class, so use querySelector
  const expandEmail = document.getElementById("account-email");

  if (expandEmail) {
    expandEmail.textContent = user.email;
  }

  let avatarUrl = user.photoURL;

  try {
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.avatar) {
        avatarUrl = userData.avatar;
      }
    }
  } catch (error) {
    console.error("Error fetching user avatar from Firestore:", error);
  }

  // ✅ Update avatar image sources
  if (mainProfileImg && avatarUrl) {
    mainProfileImg.src = avatarUrl;
  }

  if (expandProfileImg && avatarUrl) {
    expandProfileImg.src = avatarUrl;
  }
}


/**
 * Signs the current user out and redirects to the login page.
 */
async function handleLogout() {
  try {
    await signOut(auth);
    console.log("User signed out successfully.");
    window.location.href = '/login/login.html';
  } catch (error) {
    console.error("Error signing out:", error);
  }
}

async function handleNewWorkspace() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        alert("You must be logged in to create a workspace.");
        return;
    }

    const newWorkspaceName = prompt("Enter a name for your new workspace:");
    if (!newWorkspaceName || newWorkspaceName.trim() === '') {
        return;
    }

    const workspacesColRef = collection(db, `users/${currentUser.uid}/myworkspace`);

    try {
        await runTransaction(db, async (transaction) => {
            const selectedWorkspaceQuery = query(workspacesColRef, where("isSelected", "==", true));
            const selectedWorkspacesSnapshot = await transaction.get(selectedWorkspaceQuery);

            if (!selectedWorkspacesSnapshot.empty) {
                const oldSelectedDoc = selectedWorkspacesSnapshot.docs[0];
                const oldWorkspaceRef = doc(db, `users/${currentUser.uid}/myworkspace`, oldSelectedDoc.id);

                const allWorkspacesSnapshot = await transaction.get(query(workspacesColRef));
                const workspaceCount = allWorkspacesSnapshot.size;
                
                const numberToWord = ["First", "Second", "Third", "Fourth", "Fifth"];
                const newName = `My ${numberToWord[workspaceCount] || (workspaceCount + 1) + 'th'} Workspace`;

                const updateData = { isSelected: false };
                if (oldSelectedDoc.data().name.startsWith("My First Workspace")) {
                    updateData.name = newName;
                }
                
                transaction.update(oldWorkspaceRef, updateData);
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
        console.error("Error creating new workspace in transaction:", error);
        alert("Failed to create the new workspace. Please try again.");
    }
}


// --- 4. MAIN SCRIPT LOGIC ---

// This function runs once Firebase confirms the user's authentication state.
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = '/login/login.html';
    return;
  }

const menuToggle = document.getElementById("menuToggle");
const rootdrawer = document.getElementById("rootdrawer");
const filterToggleMenu = document.getElementById("filter-icon"); 
const searchFilterMenu = document.getElementById("search-filter"); 

const drawer = document.getElementById("dashboardDrawer");
const createToggle = document.getElementById("createToggle");
const createExpand = document.querySelector(".create-expand");
const searchToggle = document.getElementById("searchToggle");
const searchExpand = document.querySelector(".search-expand");
const profileToggle = document.getElementById("profileToggle");
const profileExpand = document.querySelector(".account-expand");
const optionBtns = document.querySelectorAll(".option-btn");

const cancelIcon = document.querySelector('.cancel-search-icon');
const mytaskdisplay = document.getElementById("mytask-display");
const taskOptionBtns = document.querySelectorAll('.mytask-display .option-btn-tasks');
const projectdisplay = document.getElementById("project-display");
const projectOptionBtns = document.querySelectorAll('.project-display .option-btn-tasks');
const savedSearchText = document.getElementById('saved-searches-text');
const savedSearchContainer = document.querySelector('.saved-searches');
const recentContainer = document.getElementById('recent-container');
const savedContainer = document.getElementById('saved-container');
const halfQuery = document.getElementById('half-query');
const optionsQuery = document.getElementById('options-query');
const searchOptions = document.querySelector('.search-options');

const emailContainerId = document.getElementById('email-container-id');
const emailContainerPeopleId = document.getElementById('email-container-id-people');
const emailContainer = document.querySelectorAll('.email-container');
const peopleEmptyState = document.getElementById('people-empty-state');
const messagesEmptyState = document.getElementById('messages-empty-state');
const input = document.querySelector('.search-input');
const inputFilter = document.querySelector('.search-input-filter');
const moreTypeInput = document.getElementById("typeInput");
const dropdown = document.getElementById("typeDropdown");

const plusField = document.getElementById("plus-field");
const newExtraInput = document.getElementById("new-extra-input");
const inputExtraDropdown = document.getElementById('dateSelectorDropdown');
const inputDueDateWithin = document.getElementById('inputDueDateWithin');
const inputRangeStartDropdown = document.getElementById('dateRangeOneDropdown');
const inputRangeEndDropdown = document.getElementById('dateRangeTwoDropdown');

const calendar = document.getElementById('calendar');
const calendar1 = document.getElementById('calendar1');
const calendar2 = document.getElementById('calendar2');
const closeIcon = plusField.querySelector(".close-icon");

const searchHint = document.querySelector('.search-hint');
const clearIcon = document.querySelector('.clear-icon');

const isSelected3 = optionBtns[3].classList.contains("selected");
const isSelected2 = optionBtns[2].classList.contains("selected");

let selected = false;
let openCalendar = false;
let selectedPeople = false;

/* search filter */
/* global */
let selectedType = "";
let selectedLocation = "";
let selectedStatus = "";
let selectedStatusProject = '';
let selectedDueDate = "";
let selectedWithinDaysWeeksMonths = "";
let selectedDate = null;
let currentMonth = dayjs();
let rangeStartDate = null;
let rangeEndDate = null;

function isMobile() {
  return window.matchMedia("(max-width: 768px)").matches;
}

  lucide.createIcons();

function updateClearIconVisibility() {
  if (searchHint.textContent.trim() !== "Search...") {
    clearIcon.classList.remove('hidden');
  } else {
    clearIcon.classList.add('hidden');
  }
}


const renderCalendar = (month) => {
  const calendars = [calendar, calendar1, calendar2];

  calendars.forEach((cal, index) => {
    cal.innerHTML = ''; // Clear previous content
    const localMonth = month.clone();

    // Header
    const header = document.createElement('div');
    header.className = 'calendar-header';
    const prevId = `prev-${index}`;
    const nextId = `next-${index}`;
    header.innerHTML = `
      <span id="${prevId}">&#x2329;</span>
      <span>${localMonth.format('MMMM YYYY')}</span>
      <span id="${nextId}">&#x232A;</span>
    `;
    cal.appendChild(header);

    // Days row
    const days = document.createElement('div');
    days.className = 'calendar-days';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => {
      const el = document.createElement('div');
      el.textContent = d[0];
      days.appendChild(el);
    });
    cal.appendChild(days);

    // Dates grid
    const dates = document.createElement('div');
    dates.className = 'calendar-dates';

    const startOfMonth = localMonth.startOf('month');
    const daysInMonth = localMonth.daysInMonth();
    const startDay = startOfMonth.day();

    for (let i = 0; i < startDay; i++) {
      dates.appendChild(document.createElement('div'));
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateEl = document.createElement('div');
      const thisDate = localMonth.date(d);

      dateEl.textContent = d;

      if (thisDate.isSame(dayjs(), 'day')) dateEl.classList.add('today');

      // Highlight selected dates
      if (index === 1 && rangeStartDate && thisDate.isSame(rangeStartDate, 'day')) {
        dateEl.classList.add('selected');
      }
      if (index === 2 && rangeEndDate && thisDate.isSame(rangeEndDate, 'day')) {
        dateEl.classList.add('selected');
      }

      // Optional: highlight dates in range
      if (
        rangeStartDate &&
        rangeEndDate &&
        thisDate.isAfter(rangeStartDate, 'day') &&
        thisDate.isBefore(rangeEndDate, 'day')
      ) {
        dateEl.classList.add('in-range'); // Define this class in CSS if needed
      }

      dateEl.onclick = () => {
        if (index === 1) {
          // Start date calendar
          rangeStartDate = thisDate;
          openCalendar = false;
          inputRangeStartDropdown.textContent = thisDate.format('YYYY-MM-DD');
        } else if (index === 2) {
          // End date calendar
          rangeEndDate = thisDate;
          openCalendar = false;
          inputRangeEndDropdown.textContent = thisDate.format('YYYY-MM-DD');
        } else {
          // General calendar
          selectedDate = thisDate;
          openCalendar = false;
          const formatted = thisDate.format('YYYY-MM-DD');

          if (['Yesterday', 'Today', 'Tomorrow', 'Specific Date'].includes(selectedDueDate)) {
            inputExtraDropdown.textContent = formatted;
          } else if (
            ['Within the last', 'Within the next', 'Through the next'].includes(selectedDueDate)
          ) {
            inputDueDateWithin.textContent = formatted;
          }
        }

        renderCalendar(currentMonth); // Refresh
      };

      dates.appendChild(dateEl);
    }

    cal.appendChild(dates);

    // Navigation handlers
    document.getElementById(prevId).onclick = () => {
      currentMonth = currentMonth.subtract(1, 'month');
      renderCalendar(currentMonth);
    };
    document.getElementById(nextId).onclick = () => {
      currentMonth = currentMonth.add(1, 'month');
      renderCalendar(currentMonth);
    };
  });
};

inputDueDateWithin.addEventListener('input', function() {
  this.value = this.value.replace(/[^0-9]/g, '');
});

renderCalendar(currentMonth);
updateClearIconVisibility();

halfQuery.classList.add("hidden");
closeIcon.style.display = "none";
optionsQuery.classList.add("hidden");

rootdrawer.style.width = "260px";
menuToggle.addEventListener("click", (e) => {
  e.stopPropagation();

  const isClosed = drawer.classList.toggle("close");
  
  if (isClosed) {
    // If drawer is now closed, remove open class
    drawer.classList.remove("open");
    rootdrawer.style.width = "80px";
  } else {
    // If drawer is now open, add open class
    rootdrawer.style.width = "260px";
    drawer.classList.add("open");
  }
});



searchToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  searchExpand.classList.remove("hidden");
  searchToggle.classList.add("hidden"); 
});

createToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  createExpand.classList.remove("hidden");
  createExpand.classList.add("show");
});

profileToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  profileExpand.classList.remove("hidden");
  profileExpand.classList.add("show");
});

filterToggleMenu.addEventListener('click', () => {
  searchFilterMenu.classList.remove("hidden");
  searchExpand.classList.add("hidden");
});

calendar.addEventListener('click', function(e) {
  e.stopPropagation();
  openCalendar = true;
});

document.addEventListener("click", (e) => {
  
  const clickedOutsideFilterMenu =
    !searchFilterMenu.contains(e.target) && !filterToggleMenu.contains(e.target);
  const clickedOutsideCreate =
    !createExpand.contains(e.target) && !createToggle.contains(e.target);
  const clickedOutsideAccount =
    !profileExpand.contains(e.target) && !profileToggle.contains(e.target);
  const clickedOutsideSearch =
    !searchExpand.contains(e.target) && !searchToggle.contains(e.target);

  // Check if the clicked element is part of a calendar date
  const isCalendarDateClick = e.target.closest('.calendar-dates div');


  if (clickedOutsideCreate && !createExpand.classList.contains("hidden")) {
    createExpand.classList.add("hidden");
    createExpand.classList.remove("show");
  }

  // Modified condition for searchFilterMenu
  if (clickedOutsideFilterMenu && !searchFilterMenu.classList.contains("hidden") && !isCalendarDateClick) {
    searchFilterMenu.classList.add("hidden");
    // Only re-show searchExpand and hide searchToggle if searchFilterMenu is being hidden
    // and it's not due to a direct click on searchToggle itself
    if (!filterToggleMenu.contains(e.target)) { // Prevent hiding if filterToggleMenu was clicked to close
      searchExpand.classList.remove("hidden");
      searchToggle.classList.add("hidden");
    }
  }


  if (clickedOutsideSearch && !searchExpand.classList.contains("hidden")) {
    searchExpand.classList.add("hidden");
    searchToggle.classList.remove("hidden");
  }

  if (clickedOutsideAccount && !profileExpand.classList.contains("hidden")) {
    profileExpand.classList.add("hidden");
    profileToggle.classList.remove("hidden");
  }
});


optionBtns[0].addEventListener("click", () => {
  const btn = optionBtns[0];
  const isSelected = btn.classList.contains("selected");

  if (isSelected) {
    btn.classList.remove("selected");
    optionBtns.forEach(b => b.classList.remove("hide"));
    mytaskdisplay.classList.add("hidden");
    savedSearchText.classList.remove("hidden");
    savedSearchContainer.classList.remove("hidden");
  } else {
    btn.classList.add("selected");
    mytaskdisplay.classList.remove("hidden");
    savedSearchText.classList.add("hidden");
    savedSearchContainer.classList.add("hidden");
    optionBtns.forEach((b, i) => {
      if (i !== 0) {
        b.classList.add("hide");
        b.classList.remove("selected");
      }
    });
  }
});

optionBtns[1].addEventListener("click", () => {
  const btn = optionBtns[1];
  const isSelected = btn.classList.contains("selected");

  if (isSelected) {
    btn.classList.remove("selected");
    optionBtns.forEach(b => b.classList.remove("hide"));
    projectdisplay.classList.add("hidden");
    savedSearchText.classList.remove("hidden");
savedSearchContainer.classList.remove("hidden");
savedContainer.classList.remove("hidden");
searchOptions.classList.remove("hidden");
recentContainer.classList.remove("hidden");
emailContainerId.classList.add('hidden');
  } else {
    btn.classList.add("selected");
    projectdisplay.classList.remove("hidden");
    savedSearchText.classList.add("hidden");
savedSearchContainer.classList.add("hidden");
    optionBtns.forEach((b, i) => {
      if (i !== 1) {
        b.classList.add("hide");
        b.classList.remove("selected");
      }
    });
  }
});

optionBtns[2].addEventListener("click", () => {
  const btn = optionBtns[2];
  const isSelected = btn.classList.contains("selected");
  halfQuery.classList.remove("skeleton-active");
  
  if (isSelected) {
    selectedPeople = false
    btn.classList.remove("selected");
    optionBtns.forEach(b => b.classList.remove("hide"));
    savedSearchText.classList.remove("hidden");
savedSearchContainer.classList.remove("hidden");
emailContainerPeopleId.classList.add('hidden');
recentContainer.classList.remove("hidden");
savedContainer.classList.remove("hidden");
searchOptions.classList.remove("hidden");
recentContainer.classList.remove("hidden");
emailContainerPeopleId.classList.add('hidden');
peopleEmptyState.classList.add("hidden");
  } else {
    selectedPeople = true
    btn.classList.add("selected");
    savedSearchText.classList.add("hidden");
    peopleEmptyState.classList.remove("hidden");
    emailContainerPeopleId.classList.remove('hidden');
    recentContainer.classList.add("hidden");
    savedSearchContainer.classList.add("hidden");
    optionBtns.forEach((b, i) => {
      if (i !== 2) {
        b.classList.add("hide");
        b.classList.remove("selected");
      }
    });
  }
});

optionBtns[3].addEventListener("click", () => {
  const btn = optionBtns[3];
  const isSelected = btn.classList.contains("selected");
  halfQuery.classList.remove("skeleton-active");
  
  if (isSelected) {
    selected = false
    btn.classList.remove("selected");
    optionBtns.forEach(b => b.classList.remove("hide"));
    savedSearchText.classList.remove("hidden");
savedSearchContainer.classList.remove("hidden");
recentContainer.classList.remove("hidden");
messagesEmptyState.classList.add("hidden");
savedContainer.classList.remove("hidden");
searchOptions.classList.remove("hidden");
recentContainer.classList.remove("hidden");
emailContainerId.classList.add('hidden');
  } else {
    selected = true
    btn.classList.add("selected");
    savedSearchText.classList.add("hidden");
    messagesEmptyState.classList.remove("hidden");
    
    recentContainer.classList.add("hidden");
    savedSearchContainer.classList.add("hidden");
    optionBtns.forEach((b, i) => {
      if (i !== 3) {
        b.classList.add("hide");
        b.classList.remove("selected");
      }
    });
  }
});

//Tasks
taskOptionBtns[0].addEventListener('click', () => {
  cancelIcon.classList.remove('hidden');
  optionsQuery.classList.add("hidden");
  searchOptions.classList.add("hidden");
  recentContainer.classList.add("hidden");
  input.value = 'in: '; // in_project
  input.focus();
});

taskOptionBtns[1].addEventListener('click', () => {
  cancelIcon.classList.remove('hidden');
  input.value = 'assignee: '; // assigned_to
  emailContainerId.classList.remove('hidden');
  savedContainer.classList.add("hidden");
  recentContainer.classList.add("hidden");
  halfQuery.classList.remove("hidden");
  optionsQuery.classList.remove("hidden");
  searchOptions.classList.add("hidden");
  input.focus();
});

taskOptionBtns[2].addEventListener('click', () => {
  cancelIcon.classList.remove('hidden');
  input.value = 'with: '; // with_collaborator
  emailContainerId.classList.remove('hidden');
  savedContainer.classList.add("hidden");
  recentContainer.classList.add("hidden");
  optionsQuery.classList.remove("hidden");
  halfQuery.classList.remove("hidden");
  searchOptions.classList.add("hidden");
  input.focus();
});

//Projects
projectOptionBtns[0].addEventListener('click', () => {
  cancelIcon.classList.remove('hidden');
  emailContainerId.classList.remove('hidden');
  savedContainer.classList.add("hidden");
  halfQuery.classList.remove("hidden");
  recentContainer.classList.add("hidden");
  optionsQuery.classList.remove("hidden");
  searchOptions.classList.add("hidden");
  input.value = 'assignee: '; // owner
  input.focus();
});

projectOptionBtns[1].addEventListener('click', () => {
  cancelIcon.classList.remove('hidden');
  emailContainerId.classList.remove('hidden');
  savedContainer.classList.add("hidden");
  optionsQuery.classList.remove("hidden");
  recentContainer.classList.add("hidden");
  searchOptions.classList.add("hidden");
  input.value = 'with: '; // with members
  input.focus();
});


input.addEventListener('input', () => {
  
  if (input.value.trim() !== '') {
    cancelIcon.classList.remove('hidden');
    savedContainer.classList.add("hidden");
    recentContainer.classList.add("hidden");
    halfQuery.classList.remove("hidden");
    // skeleton loader
    halfQuery.classList.add("skeleton-active");
    
    
      emailContainerPeopleId.classList.add('hidden');
    
      document.getElementById('email-container-id').classList.add('hidden');
    
    
    peopleEmptyState.classList.add("hidden");
    messagesEmptyState.classList.add("hidden");
    halfQuery.innerHTML = `
      <div class="skeleton-loader" style="width: 200px;"></div>
      <div class="skeleton-loader" style="width: 500px;"></div>
      <div class="skeleton-loader" style="width: 400px;"></div>
    `;

    
    setTimeout(() => {
      halfQuery.classList.remove("skeleton-active");
      const value = input.value.trim();
if (value.startsWith('with:') || value.startsWith('assignee:')) {
  searchOptions.classList.add("hidden");
  halfQuery.classList.remove("hidden");
  optionsQuery.classList.remove("hidden");
  document.getElementById('email-container-id').classList.add('hidden');
  emailContainerId.classList.remove('hidden');
} else if (value.startsWith('in:')) {
  recentContainer.classList.add("hidden");
  searchOptions.classList.add("hidden");
  }else {
  searchOptions.classList.remove("hidden");
  halfQuery.classList.add("hidden");
  optionsQuery.classList.add("hidden");
  document.getElementById('email-container-id').classList.add('hidden');

  }

      halfQuery.innerHTML = ''; 
    }, 1000); 

  } else {
    recentContainer.classList.add("hidden");
  
if (selected) {
  messagesEmptyState.classList.remove("hidden");
  recentContainer.classList.add("hidden");
  halfQuery.classList.remove("skeleton-active");
  console.log('1 not selected');
} else if (selectedPeople) {
  peopleEmptyState.classList.remove("hidden");
  halfQuery.classList.remove("skeleton-active");
  emailContainerPeopleId.classList.remove('hidden');
  savedContainer.classList.add("hidden");
  console.log('2 not selected');
} else{
  console.log('both not selected');
  halfQuery.classList.add("hidden");
  optionsQuery.classList.add("hidden");
  recentContainer.classList.remove("hidden");
}

    cancelIcon.classList.add('hidden');
    savedContainer.classList.remove("hidden");
    
    searchOptions.classList.remove("hidden");
    emailContainerId.classList.add('hidden');
    halfQuery.innerHTML = ''; // Clear results
  }
  
});

document.querySelector('.clear-text').addEventListener('click', function () {
  inputFilter.value = '';
  document.querySelector('.search-input-filter').focus(); // Optional: refocus the input
});

cancelIcon.addEventListener('click', () => {
  input.value = '';
  cancelIcon.classList.add('hidden');
savedContainer.classList.remove("hidden");
searchOptions.classList.remove("hidden");
recentContainer.classList.remove("hidden");
emailContainerId.classList.add('hidden');
  input.focus();
});

emailContainer.forEach(el => {
  el.addEventListener('click', () => {
    emailContainer.forEach(item => item.classList.remove('selected'));
    el.classList.add('selected');
  });
});

document.querySelectorAll(".dropdown-menu .dropdown-item").forEach(item => {
  item.addEventListener("click", function(e) {
    e.preventDefault();

    // Exclude span icon from selected text
    const selectedText = Array.from(this.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent.trim())
      .join("");

    const dropdownMenu = this.closest(".dropdown-menu");
    const buttonId = dropdownMenu.getAttribute("aria-labelledby");
    const button = document.getElementById(buttonId);

    if (button) {
      button.textContent = selectedText;
    }

    // Store the selected value based on which dropdown was used
    if (buttonId === "typeDropdown") {
      selectedType = selectedText;
      console.log("Selected Type:", selectedType);
      
      if (selectedType == 'Any'){
        document.getElementById('authors').classList.add("hidden");
        document.getElementById('locatedGlobal').classList.remove("hidden");
        document.getElementById('locatedProjectDropdown').classList.add("hidden");
        document.getElementById('extra-field').classList.add("hidden");
        document.getElementById('extra-field-projectdropdown').classList.add("hidden");
        document.getElementById('status-field').classList.add("hidden");
        document.getElementById('due-date-field').classList.add("hidden");
        document.getElementById('owners').classList.add("hidden");
        document.getElementById('members').classList.add("hidden");
        document.getElementById('collaborators').classList.remove("hidden");
        document.getElementById('assigned-to').classList.remove("hidden");
        document.getElementById('status-project-field').classList.add("hidden");
      }else if (selectedType == 'Tasks'){
        document.getElementById('authors').classList.add("hidden");
        document.getElementById('locatedGlobal').classList.remove("hidden");
        document.getElementById('locatedProjectDropdown').classList.add("hidden");
        document.getElementById('extra-field-projectdropdown').classList.add("hidden");
        document.getElementById('collaborators').classList.remove("hidden");
        document.getElementById('assigned-to').classList.remove("hidden");
        document.getElementById('status-field').classList.remove("hidden");
        document.getElementById('due-date-field').classList.remove("hidden");
        document.getElementById('owners').classList.add("hidden");
        document.getElementById('members').classList.add("hidden");
        document.getElementById('status-project-field').classList.add("hidden");
      } else if (selectedType === 'Projects') {
        document.getElementById('authors').classList.add("hidden");
        document.getElementById('locatedGlobal').classList.add("hidden");
        document.getElementById('locatedProjectDropdown').classList.remove("hidden");
        document.getElementById('extra-field').classList.add("hidden");
        document.getElementById('status-field').classList.add("hidden");
        document.getElementById('due-date-field').classList.add("hidden");
        document.getElementById('collaborators').classList.add("hidden");
        document.getElementById('assigned-to').classList.add("hidden");
        document.getElementById('owners').classList.remove("hidden");
        document.getElementById('members').classList.remove("hidden");
        document.getElementById('status-project-field').classList.remove("hidden");
        document.getElementById('status-field').classList.add("hidden");
        document.getElementById('due-date-field').classList.add("hidden");
      } else if (selectedType === 'Portfolio') {
        document.getElementById('extra-field-projectdropdown').classList.add("hidden");
        document.getElementById('locatedGlobal').classList.remove("hidden");
        document.getElementById('locatedProjectDropdown').classList.add("hidden");
        document.getElementById('status-field').classList.add("hidden");
        document.getElementById('due-date-field').classList.add("hidden");
        document.getElementById('extra-field').classList.add("hidden");
        document.getElementById('status-field').classList.add("hidden");
        document.getElementById('due-date-field').classList.add("hidden");
        document.getElementById('collaborators').classList.add("hidden");
        document.getElementById('assigned-to').classList.add("hidden");
        document.getElementById('owners').classList.remove("hidden");
        document.getElementById('authors').classList.add("hidden");
        document.getElementById('members').classList.remove("hidden");
        document.getElementById('status-project-field').classList.add("hidden");
        
      } else if (selectedType === 'Messages') {
        document.getElementById('extra-field-projectdropdown').classList.add("hidden");
        document.getElementById('locatedGlobal').classList.remove("hidden");
        document.getElementById('locatedProjectDropdown').classList.add("hidden");
        document.getElementById('status-field').classList.add("hidden");
        document.getElementById('due-date-field').classList.add("hidden");
        document.getElementById('extra-field').classList.add("hidden");
        document.getElementById('status-field').classList.add("hidden");
        document.getElementById('due-date-field').classList.add("hidden");
        document.getElementById('collaborators').classList.remove("hidden");
        document.getElementById('assigned-to').classList.add("hidden");
        document.getElementById('owners').classList.add("hidden");
        document.getElementById('authors').classList.remove("hidden");
        document.getElementById('members').classList.add("hidden");
        document.getElementById('status-project-field').classList.add("hidden");
        
      } else {
        document.getElementById('authors').classList.add("hidden");
        document.getElementById('extra-field-projectdropdown').classList.add("hidden");
        document.getElementById('locatedGlobal').classList.remove("hidden");
        document.getElementById('locatedProjectDropdown').classList.add("hidden");
        document.getElementById('status-field').classList.add("hidden");
        document.getElementById('due-date-field').classList.add("hidden");
        document.getElementById('extra-field').classList.add("hidden");
        document.getElementById('status-field').classList.add("hidden");
        document.getElementById('due-date-field').classList.add("hidden");
        document.getElementById('collaborators').classList.remove("hidden");
        document.getElementById('assigned-to').classList.remove("hidden");
        document.getElementById('owners').classList.add("hidden");
        document.getElementById('members').classList.add("hidden");
        document.getElementById('status-project-field').classList.add("hidden");
        
      }
      
    } else if (buttonId === "locatedDropdown") {
      selectedLocation = selectedText;
      
      if (selectedType === 'Any' || selectedType === 'Tasks' || selectedType === 'Portfolio' || selectedType === 'Messages') {
      if (selectedLocation === 'In any of these projects' || selectedLocation === 'In all of these projects') {
        document.getElementById('plus-field').classList.remove("hidden");
        document.getElementById('extra-field').classList.remove("hidden");
      } else if (selectedLocation === 'Anywhere') {
        document.getElementById('plus-field').classList.add("hidden");
        document.getElementById('extra-field').classList.add("hidden");
      } else {
        document.getElementById('plus-field').classList.add("hidden");
        document.getElementById('extra-field').classList.remove("hidden");
      }
      }

    }else if (buttonId === "locatedDropdownProjects") {
      selectedLocation = selectedText;
      
      if (selectedLocation === 'In portfolios' || selectedLocation === 'In teams') {
        document.getElementById('extra-field-projectdropdown').classList.remove("hidden");
        
      } else {
        
        document.getElementById('extra-field-projectdropdown').classList.add("hidden");
        
      }
     }else if (buttonId === "dueDateDropdown"){
      document.getElementById('dueDateDropdownExtra').textContent = selectedText;
      selectedDueDate = selectedText;
      
      if (selectedDueDate === 'Yesterday' || selectedDueDate === 'Today' 
      || selectedDueDate === 'Tomorrow' || selectedDueDate === 'Specific Date') {
          document.getElementById('duedate-field').classList.add("hidden");
          document.getElementById('duedate-dropdown-extra').classList.remove("hidden");
          document.getElementById('duedate-dropdown-within').classList.add("hidden");

          document.getElementById('duedate-dropdown-date-range').classList.add("hidden");
          rangeStartDate = '';
          rangeEndDate = '';
          inputRangeStartDropdown.textContent = 'Start';
          inputRangeEndDropdown.textContent = 'End';
          inputDueDateWithin.textContent = '';
          renderCalendar(currentMonth);
        }else if(selectedDueDate === 'Within the last' || selectedDueDate === 'Within the next' ||
          selectedDueDate === 'Through the next'){
          document.getElementById('duedate-field').classList.remove("hidden");
          document.getElementById('duedate-dropdown-extra').classList.add("hidden");
          document.getElementById('duedate-dropdown-date-range').classList.add("hidden");
          document.getElementById('duedate-dropdown-within').classList.remove("hidden");
          
          rangeStartDate = '';
          rangeEndDate = '';
          inputRangeStartDropdown.textContent = 'Start';
          inputRangeEndDropdown.textContent = 'End';
          inputExtraDropdown.textContent = '../../..';
          renderCalendar(currentMonth);
        } else if (selectedDueDate === 'Date Range') {
          document.getElementById('duedate-field').classList.remove("hidden");
          document.getElementById('duedate-dropdown-extra').classList.add("hidden");
          document.getElementById('duedate-dropdown-within').classList.add("hidden");
          
          document.getElementById('duedate-dropdown-date-range').classList.remove("hidden");
          inputExtraDropdown.textContent = '../../..';
          inputDueDateWithin.textContent = '';
          renderCalendar(currentMonth);
        }else{
          document.getElementById('duedate-field').classList.remove("hidden");
          document.getElementById('duedate-dropdown-extra').classList.add("hidden");
        }
        
    } else if (buttonId === "dueDateDropdownExtra"){
      document.getElementById('dueDateDropdown').textContent = selectedText;
      selectedDueDate = selectedText;
    
      
      if (selectedDueDate === 'Yesterday' || selectedDueDate === 'Today' ||
        selectedDueDate === 'Tomorrow' || selectedDueDate === 'Specific Date') {
        document.getElementById('duedate-field').classList.add("hidden");
        document.getElementById('duedate-dropdown-extra').classList.remove("hidden");
      } else if (selectedDueDate === 'Within the last' || selectedDueDate === 'Within the next' ||
        selectedDueDate === 'Through the next') {
        document.getElementById('duedate-field').classList.remove("hidden");
        document.getElementById('duedate-dropdown-extra').classList.add("hidden");
        
        document.getElementById('duedate-dropdown-within').classList.remove("hidden");
        
      } else if (selectedDueDate === 'Date Range') {
        document.getElementById('duedate-field').classList.remove("hidden");
        document.getElementById('duedate-dropdown-extra').classList.add("hidden");
      
        document.getElementById('duedate-dropdown-date-range').classList.remove("hidden");
        
      } else {
        document.getElementById('duedate-field').classList.remove("hidden");
        document.getElementById('duedate-dropdown-extra').classList.add("hidden");
      }
      
    } else if (buttonId === "dueDateDropdownWithin"){
      selectedWithinDaysWeeksMonths = selectedText;
      
    } else if (buttonId === "statusDropdown") {
      selectedStatus = selectedText;
      
    } else if (buttonId === "statusProjectDropdown") {
      selectedStatusProject = selectedText;
      
    } else{
      document.getElementById('status-field').classList.add("hidden");
      document.getElementById('due-date-field').classList.add("hidden");
    }
    
  });
});

plusField.addEventListener("click", function() {
  newExtraInput.classList.remove("hidden");
  document.getElementById('plus').classList.add("hidden");
  closeIcon.style.display = "inline";
});

closeIcon.addEventListener("click", function(event) {
  event.stopPropagation(); // Prevent triggering the plusField click
  newExtraInput.classList.add("hidden");
  document.getElementById('plus').classList.remove("hidden");
  closeIcon.style.display = "none";
  
});

const inviteBtnPeople = document.getElementById('email-container-id-people');
const inviteBtnGeneric = document.getElementById('email-container-id');


// 2. Attach the event listener using an 'async' arrow function
if (inviteBtnPeople) {
  inviteBtnPeople.addEventListener('click', async () => {
    console.log("Invite button clicked, opening modal...");
    
    // 3. Call the function and 'await' the result
    const result = await showInviteModal();
    
    // 4. This code will only run AFTER the modal is closed
    if (result) {
      // This block runs if the user clicked "Send"
      console.log("Invitation details:", result);
      console.log("Emails to invite:", result.emails);
      console.log("Add to projects:", result.projects);
      
      // Now you can do something with the data, for example:
      // sendInvitesToFirestore(result.emails, result.projects);
      
    } else {
      // This block runs if the user clicked the '×' to close the modal
      console.log("Modal was closed without sending an invitation.");
    }
  });
}


// Do the same for the other button if it has the same behavior
if (inviteBtnGeneric) {
  inviteBtnGeneric.addEventListener('click', async () => {
    console.log("Invite button clicked, opening modal...");
    const result = await showInviteModal();
    if (result) {
      console.log("Invitation details:", result);
    } else {
      console.log("Modal was closed without sending an invitation.");
    }
  });
}

  // --- USER IS LOGGED IN, PROCEED WITH INITIALIZATION ---
  console.log("Header script running for user:", user.uid);
  
  // Update the profile display with the user's info
  updateProfileDisplay(user);
  
  document.addEventListener("click", (e) => {
    // --- NEW: Handle Logout and New Workspace clicks ---
    if (e.target.closest('#logout-btn')) {
      handleLogout();
      return;
    }
    if (e.target.closest('#add-workspace-btn')) {
      handleNewWorkspace();
      return;
    }
    
  });

});