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

function showEmailModal() {
    let modalStyles = document.getElementById("modalStyles");
    if (!modalStyles) {
        const style = document.createElement("style");
        style.id = "modalStyles";
        style.textContent = `
            .modalContainer {
                background: rgba(45, 45, 45, 0.6);
                backdrop-filter: blur(20px) saturate(150%);
                -webkit-backdrop-filter: blur(20px) saturate(150%);
                border: 1px solid rgba(255, 255, 255, 0.1);
                padding: 24px;
                border-radius: 20px;
                width: 650px; /* Modal width */
                max-width: 95%;
                color: #f1f1f1;
                font-family: "Inter", "Segoe UI", sans-serif;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
                overflow: hidden;
                transition: all 0.3s ease;
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 1000;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                font-size: 14px;
            }
            .headerSection {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }

            .closeButton {
                cursor: pointer;
                font-size: 22px;
                color: #aaa;
                transition: color 0.2s ease;
            }
            .closeButton:hover {
                color: #fff;
            }
            .inputGroup {
                margin-bottom: 18px;
            }
            .inputGroup label {
                display: block;
                margin-bottom: 6px;
                color: #ccc;
                font-weight: 500;
            }
            .tagInputContainer {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                padding: 10px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 16px;
                align-items: flex-start;
            }
            .emailTagInputContainer {
                min-height: 80px;
            }
            .projectTagInputContainer {
                min-height: 40px;
                height: auto;
                overflow-y: auto;
            }
            .projectTagInputContainer .inputField {
                height: 24px;
                min-height: 24px;
                overflow: hidden;
            }


            .tag {
                display: flex;
                align-items: center;
                padding: 6px 12px;
                background: rgba(255, 255, 255, 0.15);
                border-radius: 20px;
                color: #e0e0e0;
                font-size: 14px;
                font-weight: normal;
            }
            .tag .tagIcon {
                margin-right: 6px;
            }
            .tag .removeTag {
                margin-left: 6px;
                cursor: pointer;
                font-size: 16px;
                color: #ccc;
            }
            .tag .removeTag:hover {
                color: #fff;
            }

            .inputField {
                flex-grow: 1;
                background: transparent;
                border: none;
                color: #fff;
                font-size: 15px;
                outline: none;
                min-width: 50px;
                resize: none;
                overflow-y: auto;
                padding: 4px;
            }
            .inputField::placeholder {
                color: #fff;
                opacity: 0.7;
            }


            .suggestionBox {
                display: none;
                align-items: center;
                padding: 8px 12px;
                background: rgba(255, 255, 255, 0.06);
                border-radius: 14px;
                margin-top: 8px;
                cursor: pointer;
                transition: background 0.2s ease;
            }
            .suggestionBox:hover {
                background: rgba(255, 255, 255, 0.12);
            }
            .suggestionBox span {
                color: #1e90ff;
                margin-left: 8px;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* Project Dropdown Specific Styles */
            .projectDropdown {
                position: fixed;
                background: rgba(45, 45, 45, 0.95);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
                max-height: 300px;
                overflow-y: auto;
                z-index: 99999;
                display: none;
            }
            .projectDropdown-item {
                display: flex;
                align-items: center;
                padding: 10px 15px;
                cursor: pointer;
                transition: background 0.2s ease;
            }
            .projectDropdown-item:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            .projectDropdown-item .bx {
                margin-right: 10px;
                font-size: 18px;
            }
            .projectDropdown-item span {
                color: #f1f1f1;
            }


            .sendButton {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                padding: 12px 24px;
                color: #fff;
                border-radius: 16px;
                cursor: pointer;
                font-weight: 600;
                float: right;
                transition: background 0.3s ease, border 0.3s ease;
                margin-top: 20px;
            }
            .sendButton:hover {
                background: rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.3);
            }
        `;
        document.head.appendChild(style);
    }

    if (document.querySelector('.modalContainer')) return;

    const modal = document.createElement('div');
    modal.className = 'modalContainer';
    modal.innerHTML = `
        <div class="headerSection">
            <h2>Invite people to My workspace</h2>
            <span class="closeButton">×</span>
        </div>
        <div class="inputGroup">
            <label>Email addresses <i class='bx bx-info-circle'></i></label>
            <div class="inputWrapper">
                <div class="tagInputContainer emailTagInputContainer" id="emailTagInputContainer">
                    <textarea id="emailInputField" class="inputField" placeholder="name@gmail.com, name@gmail.com, ..."></textarea>
                </div>
                <div class="suggestionBox" id="emailSuggestionBox">
                    <i class='bx bx-envelope'></i><span id="emailSuggestionText">Invite: h@gmail.com</span>
                </div>
            </div>
        </div>
        <div class="inputGroup">
            <label>Add to projects <i class='bx bx-info-circle'></i></label>
            <div class="inputWrapper">
                <div class="tagInputContainer projectTagInputContainer" id="projectTagInputContainer">
                    <textarea id="projectInputField" class="inputField" placeholder="Start typing to add projects"></textarea>
                </div>
            </div>
        </div>
        <button class="sendButton">Send</button>
    `;

    document.body.appendChild(modal);

    const projectDropdown = document.createElement('div');
    projectDropdown.className = 'projectDropdown';
    projectDropdown.id = 'projectDropdown';
    document.body.appendChild(projectDropdown);

    function addTag(container, text, iconClass) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.setAttribute('data-value', text);
        tag.innerHTML = `<i class='bx ${iconClass}'></i> ${text} <span class="removeTag">×</span>`;
        container.appendChild(tag);

        tag.querySelector('.removeTag').addEventListener('click', () => {
            tag.remove();
        });
    }

    function getRandomVibrantColor() {
        const hue = Math.floor(Math.random() * 360);
        const saturation = 90 + Math.floor(Math.random() * 10);
        const lightness = 60 + Math.floor(Math.random() * 10);
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    const emailInputField = modal.querySelector('#emailInputField');
    const emailSuggestionBox = modal.querySelector('#emailSuggestionBox');
    const emailSuggestionText = modal.querySelector('#emailSuggestionText');
    const emailTagInputContainer = modal.querySelector('#emailTagInputContainer');
    const projectInputField = modal.querySelector('#projectInputField');
    const projectTagInputContainer = modal.querySelector('#projectTagInputContainer');

    const projectDataModel = [
        { name: "My First Project", icon: "bx-folder-open" },
        { name: "Work Tasks", icon: "bx-briefcase" },
        { name: "Personal Ideas", icon: "bx-bulb" },
        { name: "Design Concepts", icon: "bx-palette" },
        { name: "Development Hub", icon: "bx-code-alt" },
        { name: "Marketing Campaigns", icon: "bx-megaphone" },
        { name: "Client XYZ", icon: "bx-group" },
        { name: "Home Budget", icon: "bx-home-alt" },
        { name: "Travel Plans", icon: "bx-plane" },
        { name: "Reading List", icon: "bx-book-open" },
        { name: "Fitness Goals", icon: "bx-dumbbell" },
        { name: "Recipe Collection", icon: "bx-dish" },
        { name: "Meeting Notes", icon: "bx-notepad" },
        { name: "Product Launch", icon: "bx-rocket" }
    ];

    function positionProjectDropdown() {
        if (projectDropdown.style.display === 'block') {
            const rect = projectInputField.getBoundingClientRect();
            projectDropdown.style.top = `${rect.bottom}px`;
            projectDropdown.style.left = `${rect.left}px`;
            projectDropdown.style.width = `${rect.width}px`;
        }
    }

    // --- Email Input Logic ---
    emailInputField.addEventListener('input', () => {
        const value = emailInputField.value.trim();
        if (value) {
            emailSuggestionBox.style.display = 'flex';
            emailSuggestionText.textContent = `Invite: ${value}@gmail.com`;
        } else {
            emailSuggestionBox.style.display = 'none';
        }
    });

    emailSuggestionBox.addEventListener('click', () => {
        const email = emailSuggestionText.textContent.replace('Invite: ', '');
        if (email.match(/^.+@.+\..+$/)) {
            const existingEmails = Array.from(emailTagInputContainer.querySelectorAll('.tag')).map(tag => tag.getAttribute('data-value'));
            if (!existingEmails.includes(email)) {
                // MODIFIED: Use 'bx-user-circle' for email tags
                addTag(emailTagInputContainer, email, 'bx-user-circle');
            }
        } else {
            alert('Invalid email format for suggestion.');
        }
        emailInputField.value = '';
        emailSuggestionBox.style.display = 'none';
        emailInputField.focus();
    });


    // --- Project Input Logic with Dropdown ---
    projectInputField.addEventListener('input', () => {
        const query = projectInputField.value.trim().toLowerCase();
        projectDropdown.innerHTML = '';

        if (query.length > 0) {
            const existingProjectNames = Array.from(projectTagInputContainer.querySelectorAll('.tag'))
                                            .map(tag => tag.getAttribute('data-value').toLowerCase());

            const filteredProjects = projectDataModel.filter(project =>
                project.name.toLowerCase().includes(query) && !existingProjectNames.includes(project.name.toLowerCase())
            );

            if (filteredProjects.length > 0) {
                filteredProjects.forEach(project => {
                    const item = document.createElement('div');
                    item.className = 'projectDropdown-item';
                    const randomColor = getRandomVibrantColor();
                    // MODIFIED: Ensure project.icon is used here for the dropdown icon
                    item.innerHTML = `<i class='bx ${project.icon}' style="color: ${randomColor};"></i> <span>${project.name}</span>`;
                    item.setAttribute('data-project-name', project.name);
                    item.setAttribute('data-project-icon', project.icon);

                    item.addEventListener('click', () => {
                        addTag(projectTagInputContainer, project.name, project.icon);
                        projectInputField.value = '';
                        projectDropdown.style.display = 'none';
                        projectDropdown.innerHTML = '';
                        projectInputField.focus();
                    });
                    projectDropdown.appendChild(item);
                });
                projectDropdown.style.display = 'block';
                positionProjectDropdown();
            } else {
                projectDropdown.style.display = 'none';
            }
        } else {
            projectDropdown.style.display = 'none';
        }
    });

    projectInputField.addEventListener('focus', () => {
        if (projectDropdown.style.display !== 'block' && projectInputField.value.trim().length > 0) {
            projectInputField.dispatchEvent(new Event('input'));
        }
    });

    document.addEventListener('click', (event) => {
        if (!projectInputField.contains(event.target) && !projectDropdown.contains(event.target)) {
            projectDropdown.style.display = 'none';
        }
    });

    window.addEventListener('resize', positionProjectDropdown);
    window.addEventListener('scroll', positionProjectDropdown);


    // --- Close and Send Button Logic ---
    modal.querySelector('.closeButton').addEventListener('click', () => {
        modal.remove();
        projectDropdown.remove();
        window.removeEventListener('resize', positionProjectDropdown);
        window.removeEventListener('scroll', positionProjectDropdown);
    });

    modal.querySelector('.sendButton').addEventListener('click', () => {
        const emails = Array.from(emailTagInputContainer.querySelectorAll('.tag')).map(tag => tag.getAttribute('data-value'));
        const projects = Array.from(projectTagInputContainer.querySelectorAll('.tag')).map(tag => tag.getAttribute('data-value'));

        const pendingEmail = emailInputField.value.trim();
        if (pendingEmail && pendingEmail.match(/^.+@.+\..+$/)) {
            if (!emails.includes(pendingEmail)) {
                emails.push(pendingEmail);
            }
        } else if (pendingEmail) {
            alert('Warning: Unadded text in email field is not a valid email and will be ignored.');
        }

        if (emails.length || projects.length) {
            console.log('Inviting:', { emails, projects });
            alert(`Inviting: Emails: ${emails.join(', ')}\nProjects: ${projects.join(', ')}`);
            modal.remove();
            projectDropdown.remove();
            window.removeEventListener('resize', positionProjectDropdown);
            window.removeEventListener('scroll', positionProjectDropdown);
        } else {
            alert('Please enter at least one email address or project.');
        }
    });
}

document.getElementById('email-container-id-people').addEventListener('click', showEmailModal);
document.getElementById('email-container-id').addEventListener('click', showEmailModal);
