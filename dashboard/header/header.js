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
import {
  onSnapshot,
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  runTransaction,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";
import { showInviteModal } from '/dashboard/components/showEmailModel.js';



// --- 2. FIREBASE INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
let currentUserId = null;
let recentTasksUnsubscribe = null;
const algoliasearch = window.algoliasearch;

// Safe api public key
const searchClient = algoliasearch(
  'PVAIYN3RSK',
  'fba40703e1406a74dbaaa3042a3baa48'
);

let recentItemsUnsubscribe = null;
let recentProjectsUnsubscribe = null;


let recentTasksData = [];
let recentProjectsData = [];
let recentPeopleData = [];
let recentMessagesData = [];

const exampleRecentTasks = [
{
  id: 'task_abc1',
  name: 'lol',
  project: { name: 'Shop Barongg', color: '#66bb6a' },
  assignees: [],
  status: 'completed' // Added status
},
{
  id: 'task_abc2',
  name: 'Draft project brief',
  project: { name: 'Shop Barongg', color: '#66bb6a' },
  assignees: [{ id: 'user_cl', initials: 'CI' }],
  status: 'on track' // Added status
},
{
  id: 'task_abc3',
  name: 'Alert: Asana invitation could not be delivered to jezz@gmail....',
  project: { name: 'Shop Barongg', color: '#66bb6a' },
  assignees: [{ id: 'user_cl', initials: 'CI' }],
  status: 'at risk' // Added status (or you can use 'error' or 'attention')
},
{
  id: 'task_abc4',
  name: 'Schedule kickoff meeting',
  project: { name: 'Shop Barongg', color: '#66bb6a' },
  assignees: [{ id: 'user_jw', initials: 'JW' }],
  status: 'completed' // Added status
},
{
  id: 'task_abc5',
  name: 'Share timeline with teammates',
  project: { name: 'Shop Barongg', color: '#66bb6a' },
  assignees: [],
  status: 'on track' // Added status
}];

const exampleRecentPeople = [
{
  id: 'user_jw_email',
  name: 'john wick',
  email: 'twicekgamers@gmail.com',
  initials: 'JW'
},
{
  id: 'user_jezz_email',
  name: 'jezz@gmail.com',
  email: 'jezz@gmail.com',
  initials: 'JE'
},
{
  id: 'user_cl_email',
  name: 'clinton.ihegoro120@gmail.com',
  email: 'clinton.ihegoro120@gmail.com',
  initials: 'CI'
}];

const exampleRecentMessages = [
{
  id: 'msg_001',
  title: 'Project Alpha Weekly Sync Notes',
  sender: { name: 'John Doe', initials: 'JD' },
  date: '2025-06-28',
  preview: 'Key decisions from the meeting: Resource allocation, deadline adjustments...'
},
{
  id: 'msg_002',
  title: 'Team Vacation Schedule - July',
  sender: { name: 'Jane Smith', initials: 'JS' },
  date: '2025-06-25',
  preview: 'Please submit your vacation requests by end of week. Reminder about policy changes.'
},
{
  id: 'msg_003',
  title: 'Urgent: Server Maintenance Tonight',
  sender: { name: 'Admin', initials: 'AD' },
  date: '2025-07-02',
  preview: 'Expected downtime 10 PM - 12 AM PST. Please save all your work.'
}];

const exampleRecentProjects = [
{
  id: 'project_req_track_001',
  name: 'Request tracking',
  color: '#2196F3', // Blue color matching Asana's project icon
  tasksCount: 40,
  assignees: [
  {
    id: 'user_john', // Corresponds to user_john's UID
    initials: 'JW',
    avatarUrl: 'https://i.pravatar.cc/150?img=68', // Loadable avatar URL
    role: 'project_lead' // Role within this specific project's context
  },
  {
    id: 'user_cl', // Corresponds to user_clinton's UID
    initials: 'CI',
    avatarUrl: 'https://i.pravatar.cc/150?img=33', // Another loadable avatar URL
    role: 'designer'
  },
  {
    id: 'user_jezz', // Corresponds to user_jezz's UID
    initials: 'JE',
    avatarUrl: 'https://i.pravatar.cc/150?img=12',
    role: 'developer'
  },
  { // This assignee will trigger the 'more_horiz' icon if there are more than 3
    id: 'user_jane',
    initials: 'JD',
    avatarUrl: 'https://i.pravatar.cc/150?img=47',
    role: 'qa_engineer'
  }]
},
{
  id: 'project_website_redesign_002',
  name: 'Website Redesign',
  color: '#FF9800', // Example Orange project color
  tasksCount: 15,
  assignees: [
  {
    id: 'user_jezz',
    initials: 'JE',
    avatarUrl: 'https://i.pravatar.cc/150?img=12',
    role: 'frontend_dev'
  },
  {
    id: 'user_alex',
    initials: 'AS',
    avatarUrl: 'https://i.pravatar.cc/150?img=7',
    role: 'project_manager'
  }]
}];

const mockUsersCollection = [
  {
    id: 'user_john',
    displayName: 'John Wick',
    email: 'john.wick@example.com',
    initials: 'JW',
    avatarUrl: null // You could put a URL here, e.g., 'https://example.com/avatars/john.jpg'
  },
  {
    id: 'user_jezz',
    displayName: 'Jezz Gabriel',
    email: 'jezz@gmail.com',
    initials: 'JE',
    avatarUrl: null
  },
  {
    id: 'user_clinton',
    displayName: 'Clinton Ihegoro',
    email: 'clinton.ihegoro120@gmail.com',
    initials: 'CI',
    avatarUrl: null
  },
  {
    id: 'user_jane',
    displayName: 'Jane Doe',
    email: 'jane.doe@example.com',
    initials: 'JD',
    avatarUrl: null
  },
  {
    id: 'user_alex',
    displayName: 'Alex Smith',
    email: 'alex.smith@example.com',
    initials: 'AS',
    avatarUrl: null
  }
  // You can add more mock user objects here as needed for testing
];

const mockMyWorkspaceCollection = [
{
  id: 'workspace_dev_team_001',
  name: 'Development Team',
  isSelected: true,
  members: [
    { uid: 'user_john', role: 'admin' },
    { uid: 'user_jezz', role: 'member' },
    { uid: 'user_clinton', role: 'guest' }
  ]
},
{
  id: 'workspace_marketing_002',
  name: 'Marketing Campaigns',
  isSelected: false,
  members: [
    { uid: 'user_jezz', role: 'admin' }, // Jezz is admin here, member in 'Development Team'
    { uid: 'user_jane', role: 'member' }
  ]
},
{
  id: 'workspace_hr_portal_003',
  name: 'HR Portal',
  isSelected: true,
  members: [
    { uid: 'user_alex', role: 'owner' } // Alex is the owner of this one
  ]
},
{
  id: 'workspace_personal_004', // A workspace where only the current user (if they are 'user_current_user') is a member
  name: 'My Personal Workspace',
  isSelected: false,
  members: [
    { uid: 'user_john', role: 'owner' } // John is owner here
  ]
}];

function createRecentsInviteEmailButton() {
  const inviteBtn = document.createElement('div');
  inviteBtn.className = 'headersearches-invite-email-button-recents'; // This class will have margin-top: auto
  inviteBtn.innerHTML = `
<div class="invite-icon-wrapper">
    <span class="material-icons-outlined">mail</span>
  </div> 
  <span class ="email-text">Invite teammates via email </span>
    `;
  inviteBtn.addEventListener('click', async () => {
    console.log("Invite button clicked (Recents view), opening modal...");
    const result = await showInviteModal();
    if (result) { /* ... handle result ... */ } else { /* ... */ }
  });
  return inviteBtn;
}

async function updateProfileDisplay(user) {
  if (!user) return;
  
  const mainProfileImg = document.getElementById("profileToggle"); // assuming <img id="profileToggle" />
  const expandProfileImg = document.getElementById("profile-picture-expand"); // class, so use querySelector
  const expandEmail = document.getElementById("account-email");
  
  if (expandEmail) {
    expandEmail.textContent = user.email;
  }
  
  let avatarUrl = user.avatar;
  
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
  mainProfileImg.src = avatarUrl;
  expandProfileImg.src = avatarUrl;
}

function renderAllPeople(people, peopleQueryDiv, peopleEmptyState, emailContainerPeopleId) {
  // Note: No need for `getElementById` calls inside this function anymore.
  // The elements are passed as arguments.
  
  if (!peopleQueryDiv || !peopleEmptyState || !emailContainerPeopleId) {
    console.error("One or more people display elements passed as arguments are null or undefined!");
    return;
  }
  
  // 1. Clear any *previously rendered dynamic list items* from peopleQueryDiv
  Array.from(peopleQueryDiv.children).forEach(child => {
    if (child.classList.contains('headersearches-tasks-recent-item')) {
      peopleQueryDiv.removeChild(child);
    }
  });
  
  // 2. Hide static elements initially before deciding their visibility
  peopleEmptyState.classList.add("hidden");
  emailContainerPeopleId.classList.add("hidden");
  
  // 3. Render the dynamic people list or show empty state
  if (people.length === 0) {
    // Show empty state if no people found
    peopleEmptyState.classList.remove("hidden");
    emailContainerPeopleId.classList.remove('hidden'); // Always show invite button with empty state
  } else {
    // Hide empty state
    emailContainerPeopleId.classList.remove('hidden');
    peopleEmptyState.classList.add("hidden");
    
    const fragment = document.createDocumentFragment();
    people.forEach(person => {
      const personDiv = document.createElement('div');
      personDiv.className = 'headersearches-tasks-recent-item'; // Reusing existing item class
      personDiv.dataset.itemId = person.id;
      const roleOrEmailHtml = person.workspaceRole ?
        `<div class="headersearches-person-roles">${person.workspaceRole.charAt(0).toUpperCase() + person.workspaceRole.slice(1)}</div>` :
        `<div class="headersearches-person-email">${person.email}</div>`;
      personDiv.innerHTML = `
                <span class="material-icons-outlined headersearches-tasks-recent-status-icon">person</span>
                <div class="headersearches-tasks-recent-content">
                    <div class="headersearches-tasks-recent-title">${person.displayName}</div>
                    <div class="headersearches-tasks-recent-meta">${roleOrEmailHtml}</div>
                </div>
                <div class="headersearches-assignee-list">
                    <div class="headersearches-assignee-avatar" ${person.avatarUrl ? `style="background-image: url(${person.avatarUrl});"` : ''}>
                        ${!person.avatarUrl ? person.initials : ''}
                    </div>
                    <span class="material-icons-outlined headersearches-globe-icon">public</span>
                </div>
            `;
      fragment.appendChild(personDiv); // Add to fragment
    });
    
    // Append all new items at once, before the static elements if they exist
    // This ensures dynamic list appears above empty state and invite button
    if (peopleQueryDiv.querySelector('#people-empty-state')) {
      peopleQueryDiv.insertBefore(fragment, peopleEmptyState);
    } else {
      peopleQueryDiv.appendChild(fragment); // Fallback if structure somehow changes
    }
    
    
  }
}

export function fetchRecentItemsFromFirestore(renderFn, displayOptions) {
  if (!currentUserId) {
    console.warn("fetchRecentItemsFromFirestore: No user ID available. Skipping listener setup.");
    return null;
  }
  
  // Unsubscribe from any previous single listener for recent items
  if (recentItemsUnsubscribe) {
    recentItemsUnsubscribe();
    console.log("fetchRecentItemsFromFirestore: Unsubscribed from previous unified listener.");
  }
  
  const recentHistoryRef = collection(db, `users/${currentUserId}/recenthistory`);
  const q = query(recentHistoryRef, orderBy('lastAccessed', 'desc'), limit(15)); // Fetch a reasonable number to cover both tasks & projects
  
  recentItemsUnsubscribe = onSnapshot(q, (querySnapshot) => {
    const fetchedTasks = [];
    const fetchedProjects = [];
    // Add other types here if you decide to store them in recenthistory
    // const fetchedPeople = [];
    // const fetchedMessages = [];
    
    querySnapshot.forEach((docSnap) => {
      const itemData = docSnap.data();
      if (itemData.type === 'task') {
        fetchedTasks.push({
          id: docSnap.id,
          name: itemData.name || 'Untitled Task',
          status: itemData.status || 'unknown',
          assignees: itemData.assignees || [], // Already enriched
          project: {
            name: itemData.projectName || 'Unknown Project',
            color: itemData.projectColor || '#cccccc'
          },
          projectRef: itemData.projectRef // Ensure projectRef is carried through
        });
      } else if (itemData.type === 'project') {
        fetchedProjects.push({
          id: docSnap.id, // The project ID
          name: itemData.projectName || 'Untitled Project', // Use 'name' for project title
          color: itemData.projectColor || '#cccccc', // Use 'color' for project color
          tasksCount: Object.values(itemData.sectionTaskCounts || {}).reduce((sum, count) => sum + count, 0),
          assignees: itemData.memberProfiles || [], // Use memberProfiles directly for project assignees
          projectRef: itemData.projectRef // The actual project reference
        });
      }
      // Add else if for 'people' or 'message' if you decide to store them in recenthistory
    });
    
    // Update global module-level arrays
    recentTasksData = fetchedTasks;
    recentProjectsData = fetchedProjects;
    // recentPeopleData = fetchedPeople; // If fetched from recenthistory
    // recentMessagesData = fetchedMessages; // If fetched from recenthistory
    
    console.log("fetchRecentItemsFromFirestore: Real-time update.");
    console.log("Tasks:", recentTasksData.length, "Projects:", recentProjectsData.length);
    
    // Call the rendering function with filtered global data based on displayOptions
    renderFn(
      displayOptions.showTasks ? recentTasksData : [],
      displayOptions.showPeople ? recentPeopleData : [], // Still using static example for now
      displayOptions.showProjects ? recentProjectsData : [],
      displayOptions.showMessages ? recentMessagesData : [], // Still using static example for now
      displayOptions.taskLimit,
      !displayOptions.showPeople, // hidePeopleContent is inverse of showPeople
      displayOptions.showInviteButton,
      displayOptions.showMessages
    );
    
  }, (error) => {
    console.error("fetchRecentItemsFromFirestore: Error fetching real-time data:", error);
    const recentContainerDiv = document.querySelector("#recent-container > div");
    if (recentContainerDiv) {
      recentContainerDiv.innerHTML = `<div class="search-no-results"><p>Error loading recent items: ${error.message}</p></div>`;
    }
  });
  
  return recentItemsUnsubscribe;
}

export function renderRecentItems(tasks, people, projects, messages, taskLimit = null, hidePeopleContent = false, showInviteButton = false, showRecentMessages = false) {
  const recentContainerDiv = document.querySelector("#recent-container > div");
  if (!recentContainerDiv) {
    console.error("renderRecentItems: Recent container div not found!");
    return;
  }
  
  recentContainerDiv.innerHTML = ''; // Clear previous content
  
  let hasAnyResults = false; // Flag to track if any section has results
  
  // --- Render Projects (from the 'projects' array) ---
  if (projects && projects.length > 0) {
    hasAnyResults = true;
    projects.forEach(project => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'headersearches-tasks-recent-item';
      itemDiv.dataset.itemId = project.id; // Use project.id
      itemDiv.dataset.projectRefPath = project.projectRef?.path;
      
      const maxDisplayAvatars = 3;
      let visibleAssignees = project.assignees.slice(0, maxDisplayAvatars);
      let overflowCount = project.assignees.length - maxDisplayAvatars;
      
      const assigneesHtml = visibleAssignees.map((member, index) => {
        const zIndex = 50 - index;
        const displayName = member.displayName || member.name || 'Unknown User';
        const initials = member.initials || (displayName).split(' ').map(n => n[0]).join('').substring(0, 2);
        
        if (member.avatarUrl && member.avatarUrl.startsWith('https://')) {
          return `
                        <div class="headersearches-assignee-avatar" title="${displayName}" style="z-index: ${zIndex};">
                            <img src="${member.avatarUrl}" alt="${displayName}">
                        </div>`;
        } else if (member.avatar && member.avatar.startsWith('https://')) {
          return `
                        <div class="headersearches-assignee-avatar" title="${displayName}" style="z-index: ${zIndex};">
                            <img src="${member.avatar}" alt="${displayName}">
                        </div>`;
        } else {
          const bgColor = '#' + (member.uid || '000000').substring(0, 6);
          return `<div class="headersearches-assignee-avatar" title="${displayName}" style="background-color: ${bgColor}; color: white; z-index: ${zIndex};">${initials}</div>`;
        }
      }).join('');
      
      const moreAssigneesHtml = overflowCount > 0 ?
        `<div class="headersearches-assignee-list project-more-icon" title="${overflowCount} more members" style="z-index: ${50 - maxDisplayAvatars};">
                    <span class="material-icons-outlined">more_horiz</span>
                </div>` : '';
      
      itemDiv.innerHTML = `
                <span class="headersearches-project-square-icon" style="background-color: ${project.color};"></span>
                <div class="headersearches-tasks-recent-content">
                    <div class="headersearches-tasks-recent-title">${project.name}</div>
                    <div class="headersearches-tasks-recent-meta">
                        <span>${project.tasksCount} tasks</span>
                    </div>
                </div>
                <div class="headersearches-assignee-list">
                    ${assigneesHtml}
                    ${moreAssigneesHtml}
                </div>
            `;
      recentContainerDiv.appendChild(itemDiv);
    });
  }
  
  // --- Render Tasks (from the 'tasks' array) ---
  const tasksToRender = taskLimit ? tasks.slice(0, taskLimit) : tasks;
  if (tasksToRender.length > 0) {
    hasAnyResults = true;
    tasksToRender.forEach(item => { // 'item' is a task
      const itemDiv = document.createElement('div');
      itemDiv.className = 'headersearches-tasks-recent-item';
      itemDiv.dataset.itemId = item.id;
      itemDiv.dataset.projectRefPath = item.projectRef?.path;
      
      let statusIcon;
      let statusClass = '';
      if (item.status === 'Completed') {
        statusIcon = 'check_circle';
        statusClass = 'status-completed';
      } else {
        statusIcon = 'radio_button_unchecked';
      }
      
      const assigneesHtml = item.assignees.map(assignee => {
        const displayName = assignee.name || 'Unknown User';
        const initials = assignee.initials || (displayName).substring(0, 2).toUpperCase();
        return `
                    <div class="headersearches-assignee-avatar" ${assignee.avatarUrl ? `style="background-image: url(${assignee.avatarUrl});"` : ''}>
                        ${!assignee.avatarUrl ? initials : ''}
                    </div>
                `;
      }).join('');
      
      itemDiv.innerHTML = `
                <span class="material-icons-outlined headersearches-tasks-recent-status-icon ${statusClass}">${statusIcon}</span>
                <div class="headersearches-tasks-recent-content">
                    <div class="headersearches-tasks-recent-title">${item.name}</div>
                    <div class="headersearches-tasks-recent-meta">
                        <span class="headersearches-tasks-project-dot" style="background-color: ${item.project.color};"></span>
                        <span class="headersearches-tasks-project-name">${item.project.name}</span>
                    </div>
                </div>
                <div class="headersearches-assignee-list">
                    ${assigneesHtml}
                </div>
            `;
      recentContainerDiv.appendChild(itemDiv);
    });
  }
  
  // --- Render People ---
  if (people.length > 0 && !hidePeopleContent) {
    hasAnyResults = true;
    people.forEach(person => {
      const personDiv = document.createElement('div');
      personDiv.className = 'headersearches-tasks-recent-item';
      personDiv.dataset.itemId = person.id;
      
      const displayName = person.displayName || person.name;
      
      personDiv.innerHTML = `
                <span class="material-icons-outlined headersearches-tasks-recent-status-icon">person</span>
                <div class="headersearches-tasks-recent-content">
                    <div class="headersearches-tasks-recent-title">${displayName}</div>
                    <div class="headersearches-tasks-recent-meta">${person.email || ''}</div>
                </div>
                <div class="headersearches-assignee-list">
                    <div class="headersearches-assignee-avatar" ${person.avatarUrl ? `style="background-image: url(${person.avatarUrl});"` : ''}>
                        ${!person.avatarUrl ? person.initials : ''}
                    </div>
                    <span class="material-icons-outlined headersearches-globe-icon">public</span>
                </div>
            `;
      recentContainerDiv.appendChild(personDiv);
    });
  }
  
  // --- Render Recent Messages ---
  if (showRecentMessages && messages.length > 0) {
    hasAnyResults = true;
    messages.forEach(message => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'headersearches-tasks-recent-item';
      itemDiv.dataset.itemId = message.id;
      
      itemDiv.innerHTML = `
                <span class="material-icons-outlined headersearches-tasks-recent-status-icon">message</span>
                <div class="headersearches-tasks-recent-content">
                    <div class="headersearches-tasks-recent-title">${message.title}</div>
                    <div class="headersearches-tasks-recent-meta">
                        <div class="headersearches-assignee-avatar" ${message.sender.avatarUrl ? `style="background-image: url(${message.sender.avatarUrl});"` : ''}>
                            ${!message.sender.avatarUrl ? message.sender.initials : ''}
                        </div>
                        <span>${message.sender.name}</span>
                        <span class="message-date">${dayjs(message.date).format('MMM D')}</span>
                    </div>
                </div>
                <span class="material-icons-outlined message-star-icon">star_border</span>
            `;
      recentContainerDiv.appendChild(itemDiv);
    });
  }
  
  // --- Consolidated Empty State Check ---
  if (!hasAnyResults) {
    const noResultsDiv = document.createElement('div');
    noResultsDiv.className = 'search-no-results';
    noResultsDiv.innerHTML = `<p>No recent items to display. Start working on a task or project!</p>`;
    recentContainerDiv.appendChild(noResultsDiv);
  }
  
  // --- Render Invite Button (always at the end if applicable) ---
  if (showInviteButton) {
    recentContainerDiv.appendChild(createRecentsInviteEmailButton());
  }
}

function enterSearchResults() {
  const containerDiv = document.createElement('div');
  containerDiv.className = 'enter-search-results-hint';
  containerDiv.innerHTML = `
        <div class="search-icon-wrapper">
            <i class="fas fa-search"></i>
        </div>
        <div class="hint-text">
            Press <span class="enter-key-indicator">Enter</span> to view all results
        </div>
    `;
  
  // Add click listener to the entire hint container
  containerDiv.addEventListener('click', () => {
    // Get the current value from the main search input field
    const input = document.querySelector('.search-input');
    const value = input ? input.value.trim() : ''; // Get value, handle if input not found
    
    // Only redirect if there's actually a search query
    if (value !== '') {
      window.location.href = '/searchresults';
    }
  });
  
  return containerDiv;
}

function hslToHex(h, s, l) {
  const [r, g, b] = hslToRgb(h, s, l);
  const toHex = (c) => {
    const hex = c.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}


async function displaySearchResults(tasks, projects, people, messages) {
  const halfQueryDiv = document.getElementById('half-query');
  if (!halfQueryDiv) {
    console.error("half-query div not found for displaying search results!");
    return;
  }
  
  // Clear previous content
  halfQueryDiv.innerHTML = '';
  halfQueryDiv.classList.remove("skeleton-active");
  
  const fragment = document.createDocumentFragment();
  
  const createSectionHeading = (title) => {
    const heading = document.createElement('h5');
    heading.className = 'search-results-section-heading';
    heading.textContent = title;
    return heading;
  };
  
  // Combine all results into a single array for initial display logic
  let allResults = [];
  
  // Add projects to allResults, maintaining their type for rendering
  projects.forEach(project => allResults.push({ type: 'project', data: project }));
  // Add tasks
  tasks.forEach(task => allResults.push({ type: 'task', data: task }));
  // Add people
  people.forEach(person => allResults.push({ type: 'person', data: person }));
  // Add messages
  messages.forEach(message => allResults.push({ type: 'message', data: message }));
  
  const hasResults = allResults.length > 0;
  const initialDisplayLimit = 4;
  const resultsToDisplay = allResults.slice(0, initialDisplayLimit);
  
  // Render combined results
  if (hasResults) {
    resultsToDisplay.forEach(item => {
      let itemDiv;
      switch (item.type) {
        case 'project':
const project = item.data;
itemDiv = document.createElement('div');
itemDiv.className = 'headersearches-tasks-recent-item search-result-item';
itemDiv.dataset.itemId = project.objectID;

const projectAssigneeUIDs = project.memberUIDs || [];
let assigneesToDisplay = projectAssigneeUIDs.slice(0, 2);
let remainingAssigneesCount = projectAssigneeUIDs.length - assigneesToDisplay.length;

let projectHexColor = project.color || '#cccccc'; 
if (project.color && project.color.startsWith('hsl(')) {
  const hslValues = project.color.match(/\d+(\.\d+)?/g).map(Number);
  if (hslValues.length === 3) {
    projectHexColor = hslToHex(hslValues[0], hslValues[1], hslValues[2]);
  }
}

const assigneesHtmlPromises = assigneesToDisplay.map(async (uid) => {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const avatarUrl = userData.avatar;
      const initials = userData.name ? userData.name.substring(0, 2).toUpperCase() : uid.substring(0, 2).toUpperCase();
      
      if (avatarUrl) {
        return `<div class="headersearches-assignee-avatar" style="background-image: url(${avatarUrl});"></div>`;
      } else {
        return `<div class="headersearches-assignee-avatar">${initials}</div>`;
      }
    }
  } catch (err) {
    console.error(`Could not fetch user ${uid}`, err);
  }
  // Fallback for users not found or with errors
  return `<div class="headersearches-assignee-avatar">${uid.substring(0,2).toUpperCase()}</div>`;
});

// Wait for all the avatar lookups to finish
const assigneesHtml = (await Promise.all(assigneesHtmlPromises)).join('');

const moreAssigneesHtml = remainingAssigneesCount > 0 ?
  `<span class="material-icons-outlined project-more-icon">more_horiz</span>` : '';

itemDiv.innerHTML = `
            <span class="headersearches-project-square-icon" style="background-color: ${project.color || '#cccccc'};"></span>
            <div class="headersearches-tasks-recent-content">
                <div class="headersearches-tasks-recent-title">${project.name}</div>
                <div class="headersearches-tasks-recent-meta">Project</div>
            </div>
            <div class="headersearches-assignee-list">
                ${assigneesHtml}
                ${moreAssigneesHtml}
            </div>
          `;
break;
          
        case 'task':
const task = item.data;
itemDiv = document.createElement('div');
itemDiv.className = 'headersearches-tasks-recent-item search-result-item';
itemDiv.dataset.itemId = task.objectID;

let statusIcon = (task.status === 'Completed') ? 'check_circle' : 'radio_button_unchecked';
let statusClass = (task.status === 'Completed') ? 'status-completed' : '';

// --- FIX IS HERE: LOOKUP FOR TASK ASSIGNEES ---
const taskAssigneeUIDs = task.assignee || [];

// Use Promise.all to fetch all assignee avatars concurrently
const taskAssigneesHtmlPromises = taskAssigneeUIDs.map(async (uid) => {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const avatarUrl = userData.avatar;
      const initials = userData.name ? userData.name.substring(0, 2).toUpperCase() : uid.substring(0, 2).toUpperCase();
      
      if (avatarUrl) {
        return `<div class="headersearches-assignee-avatar" style="background-image: url(${avatarUrl});"></div>`;
      } else {
        return `<div class="headersearches-assignee-avatar">${initials}</div>`;
      }
    }
  } catch (err) {
    console.error(`Could not fetch user ${uid}`, err);
  }
  // Fallback for users not found or with errors
  return `<div class="headersearches-assignee-avatar">${uid.substring(0,2).toUpperCase()}</div>`;
});

// Wait for all the avatar lookups to finish
const taskAssigneesHtml = (await Promise.all(taskAssigneesHtmlPromises)).join('');

// --- LOOKUP FOR PROJECT NAME AND COLOR ---
let projectName = 'Unknown Project';
let projectColor = '#cccccc';

if (task.projectRef) {
  try {
    const projectDocRef = doc(db, task.projectRef);
    const projectSnap = await getDoc(projectDocRef);
    if (projectSnap.exists()) {
      const projectData = projectSnap.data();
      projectName = projectData.name || projectData.title || 'Untitled Project';
      projectColor = projectData.color || '#cccccc';
    }
  } catch (err) {
    console.error(`Could not fetch project ${task.projectRef}`, err);
  }
}

let projectHexColor = projectColor || '#cccccc';
if (projectColor && projectColor.startsWith('hsl(')) {
  const hslValues = projectColor.match(/\d+(\.\d+)?/g).map(Number);
  if (hslValues.length === 3) {
    projectHexColor = hslToHex(hslValues[0], hslValues[1], hslValues[2]);
  }
}

itemDiv.innerHTML = `
          <span class="material-icons-outlined headersearches-tasks-recent-status-icon ${statusClass}">${statusIcon}</span>
          <div class="headersearches-tasks-recent-content">
              <div class="headersearches-tasks-recent-title">${task.title || 'Untitled Task'}</div>
              <div class="headersearches-tasks-recent-meta">
                  <span class="headersearches-tasks-project-dot" style="background-color: ${projectHexColor};"></span>
                  <span class="headersearches-tasks-project-name">${projectName}</span>
              </div>
          </div>
          <div class="headersearches-assignee-list">
              ${taskAssigneesHtml}
          </div>
        `;
break;
          
        case 'person':
          const person = item.data;
          itemDiv = document.createElement('div');
          itemDiv.className = 'headersearches-tasks-recent-item search-result-item';
          itemDiv.dataset.itemId = person.id;
          
          const roleOrEmailHtml = person.workspaceRole ?
            `<div class="headersearches-person-roles">${person.workspaceRole.charAt(0).toUpperCase() + person.workspaceRole.slice(1)}</div>` :
            `<div class="headersearches-person-email">${person.email}</div>`;
          
          itemDiv.innerHTML = `
                            <span class="material-icons-outlined headersearches-tasks-recent-status-icon">person</span>
                            <div class="headersearches-tasks-recent-content">
                                <div class="headersearches-tasks-recent-title">${person.displayName || person.name}</div>
                                <div class="headersearches-tasks-recent-meta">${roleOrEmailHtml}</div>
                            </div>
                            <div class="headersearches-assignee-list">
                                <div class="headersearches-assignee-avatar" ${person.avatarUrl ? `style="background-image: url(${person.avatarUrl});"` : ''}>
                                    ${!person.avatarUrl ? person.initials : ''}
                                </div>
                                <span class="material-icons-outlined headersearches-globe-icon">public</span>
                            </div>
                        `;
          break;
          
        case 'message':
          const message = item.data;
          itemDiv = document.createElement('div');
          itemDiv.className = 'headersearches-tasks-recent-item search-result-item';
          itemDiv.dataset.itemId = message.id;
          
          itemDiv.innerHTML = `
                <span class="material-icons-outlined headersearches-tasks-recent-status-icon">message</span>
                <div class="headersearches-tasks-recent-content">
                  <div class="headersearches-tasks-recent-title">${message.title}</div>
                  <div class="headersearches-tasks-recent-meta">
                    <div class="headersearches-assignee-avatar" ${message.sender.avatarUrl ? `style="background-image: url(${message.sender.avatarUrl});"` : ''}>
                      ${!message.sender.avatarUrl ? message.sender.initials : ''}
                    </div>
                    <span>${message.sender.name}</span>
                    <span class="message-date">${dayjs(message.date).format('MMM D')}</span>
                  </div>
                </div>
                <span class="material-icons-outlined message-star-icon">star_border</span>
              `;
          break;
      }
      if (itemDiv) {
        fragment.appendChild(itemDiv);
      }
    });
    
    // Add the "Press Enter" hint if there are more results than the display limit
    if (allResults.length > initialDisplayLimit) {
      fragment.appendChild(enterSearchResults());
    }
    
  } else {
    // If no results at all, display a generic "No results found" message
    const noResultsDiv = document.createElement('div');
    noResultsDiv.className = 'search-no-results';
    noResultsDiv.innerHTML = `
      <p>No results found for your search.</p>
      <p>Try adjusting your keywords or filters.</p>
    `;
    fragment.appendChild(noResultsDiv);
  }
  
  halfQueryDiv.appendChild(fragment);
  halfQueryDiv.classList.remove('hidden');
}

async function getProcessedWorkspacePeopleData() {
  const processedPeopleMap = new Map(); // Map to store unique PersonData objects by UID
  
  // 1. First, populate the map with all known users from mockUsersCollection.
  //    Initialize their roles as null, which will be updated if they are found in a workspace.
  mockUsersCollection.forEach(user => {
    processedPeopleMap.set(user.id, {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      initials: user.initials,
      avatarUrl: user.avatarUrl,
      workspaceRole: null // Initialize role as null
    });
  });
  
  // 2. Iterate through `mockMyWorkspaceCollection` to extract members and their roles.
  //    Update the `workspaceRole` for users already in `processedPeopleMap`.
  mockMyWorkspaceCollection.forEach(workspace => {
    workspace.members.forEach(member => {
      const userInMap = processedPeopleMap.get(member.uid);
      if (userInMap) {
        // If the user already exists in our map:
        // Prioritize the first role found, or implement a more complex strategy
        // (e.g., if new role is 'admin' and current is 'member', update to 'admin').
        // For simplicity, we assign if null, or you could overwrite for the "latest found" role.
        if (!userInMap.workspaceRole) { // Assign the role if not already assigned
          userInMap.workspaceRole = member.role;
        }
        // If you want to show ALL roles a user has across workspaces:
        // if (!userInMap.allWorkspaceRoles) userInMap.allWorkspaceRoles = [];
        // userInMap.allWorkspaceRoles.push(`${member.role} in ${workspace.name}`);
      } else {
        // This scenario means a user is listed in a workspace member list
        // but doesn't exist in our `mockUsersCollection`.
        // In a real app, this would be an edge case (e.g., user deleted, or data inconsistency).
        // For mock data, ensure `mockUsersCollection` contains all UIDs referenced.
        console.warn(`Member UID '${member.uid}' from workspace '${workspace.name}' not found in mockUsersCollection. Skipping.`);
      }
    });
  });
  let workspacePeople = Array.from(processedPeopleMap.values());
  workspacePeople = workspacePeople.filter(person => person.workspaceRole !== null);
  workspacePeople.sort((a, b) => a.displayName.localeCompare(b.displayName));
  
  return workspacePeople;
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
onAuthStateChanged(auth, async (user) => {
        if (recentItemsUnsubscribe) {
          recentItemsUnsubscribe();
          recentItemsUnsubscribe = null;
        }
        
        if (!user) {
          currentUserId = null;
          recentItemsUnsubscribe = null;
          renderRecentItems([], [], [], [], null, false, true, true);
          window.location.href = '/login/login.html';
          return;
        }
        currentUserId = user.uid;
        
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
        const savedSearchTwoContainer = document.querySelector('.saved-searches-two');
        const recentContainer = document.getElementById('recent-container');
        const savedContainer = document.getElementById('saved-container');
        const halfQuery = document.getElementById('half-query');
        const optionsQuery = document.getElementById('options-query');
        const searchOptions = document.querySelector('.search-options');
        const recentContainerTitle = document.querySelector("#recent-container h4");
        
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
        const peopleQueryDiv = document.getElementById('people-query');
        
        const calendar = document.getElementById('calendar');
        const calendar1 = document.getElementById('calendar1');
        const calendar2 = document.getElementById('calendar2');
        const closeIcon = plusField.querySelector(".close-icon");
        
        const searchHint = document.querySelector('.search-hint');
        const clearIcon = document.querySelector('.clear-icon');
        
        const isSelected3 = optionBtns[3].classList.contains("selected");
        const isSelected2 = optionBtns[2].classList.contains("selected");
        
        let selected = false;
        let searchEmpty = false;
        let selectedOptionBtnIndex = -1;
        
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
          
          const clickedOutsideFilterMenu = !searchFilterMenu.contains(e.target) && !filterToggleMenu.contains(e.target);
          const clickedOutsideCreate = !createExpand.contains(e.target) && !createToggle.contains(e.target);
          const clickedOutsideAccount = !profileExpand.contains(e.target) && !profileToggle.contains(e.target);
          const clickedOutsideSearch = !searchExpand.contains(e.target) && !searchToggle.contains(e.target);
          
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
        
        optionBtns[0].addEventListener("click", async () => {
              const btn = optionBtns[0];
              const isSelected = btn.classList.contains("selected");
              
              if (isSelected) {
                
                // --- Was selected, now deselecting --
                selectedOptionBtnIndex = -1;
                btn.classList.remove("selected");
                optionBtns.forEach(b => b.classList.remove("hide"));
                mytaskdisplay.classList.add("hidden");
                savedSearchText.classList.remove("hidden");
                savedSearchContainer.classList.remove("hidden");
                savedSearchTwoContainer.classList.remove("hidden");
                fetchRecentItemsFromFirestore(renderRecentItems, {
                  showTasks: true,
                  showPeople: true,
                  showProjects: true,
                  showMessages: true,
                  taskLimit: 4, // No specific limit for general view
                  projectLimit: null,
                  showInviteButton: false
                });
                
              } else {
                
                // --- Is NOT selected, now selecting "My Tasks" ---
                selectedOptionBtnIndex = 0;
                btn.classList.add("selected");
                mytaskdisplay.classList.remove("hidden");
                savedSearchText.classList.add("hidden");
                savedSearchTwoContainer.classList.add("hidden");
                savedSearchContainer.classList.add("hidden");
                optionBtns.forEach((b, i) => {
                  if (i !== 0) {
                    b.classList.add("hide");
                    b.classList.remove("selected");
                  }
                });
                fetchRecentItemsFromFirestore(renderRecentItems, {
                  showTasks: true,
                  showPeople: false,
                  showProjects: false,
                  showMessages: false,
                  taskLimit: 4, // Limit tasks
                  projectLimit: null,
                  showInviteButton: false
                });
              }
              
                input.value = ''; // Clear input on option selection
                cancelIcon.classList.add('hidden'); // Hide cancel icon
                searchOptions.classList.remove("hidden"); // Always show filter buttons
                emailContainerId.classList.add('hidden'); // Hide specific email invite
                emailContainerPeopleId.classList.add('hidden'); // Hide people email invite
                messagesEmptyState.classList.add("hidden"); // Hide messages empty state
                peopleEmptyState.classList.add("hidden"); // Hide people empty state
                mytaskdisplay.classList.add("hidden"); // Hide mytask display
              });
            
            optionBtns[1].addEventListener("click", async () => {
              const btn = optionBtns[1];
              const isSelected = btn.classList.contains("selected");
              
              
              if (isSelected) {
                fetchRecentItemsFromFirestore(renderRecentItems, {
                  showTasks: true,
                  showPeople: true,
                  showProjects: true,
                  showMessages: true,
                  taskLimit: 4, // No specific limit for general view
                  projectLimit: null,
                  showInviteButton: false
                });
                selectedOptionBtnIndex = -1;
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
                selectedOptionBtnIndex = 1;
                btn.classList.add("selected");
                projectdisplay.classList.remove("hidden");
                savedSearchText.classList.add("hidden");
                savedSearchContainer.classList.add("hidden");
                savedSearchTwoContainer.classList.add("hidden");
                messagesEmptyState.classList.remove("hidden");
                optionBtns.forEach((b, i) => {
                  if (i !== 1) {
                    b.classList.add("hide");
                    b.classList.remove("selected");
                  }
                });
                fetchRecentItemsFromFirestore(renderRecentItems, {
                  showTasks: false,
                  showPeople: false,
                  showProjects: true,
                  showMessages: false,
                  taskLimit: 4,
                  projectLimit: 5, // Limit projects
                  showInviteButton: false
                });
              }
              input.value = ''; // Clear input on option selection
              cancelIcon.classList.add('hidden'); // Hide cancel icon
              searchOptions.classList.remove("hidden"); // Always show filter buttons
              emailContainerId.classList.add('hidden'); // Hide specific email invite
              emailContainerPeopleId.classList.add('hidden'); // Hide people email invite
              peopleEmptyState.classList.add("hidden"); // Hide people empty state
              mytaskdisplay.classList.add("hidden"); // Hide mytask display
            });
            
            optionBtns[2].addEventListener("click", async () => { // <<< Ensure 'async' is here!
              const btn = optionBtns[2];
              const isSelected = btn.classList.contains("selected");
              //halfQuery.classList.remove("skeleton-active"); // Remove skeleton if it was active
              
              if (isSelected) {
                fetchRecentItemsFromFirestore(renderRecentItems, {
                  showTasks: true,
                  showPeople: true,
                  showProjects: true,
                  showMessages: true,
                  taskLimit: 4, // No specific limit for general view
                  projectLimit: null,
                  showInviteButton: false
                });
                
                selectedOptionBtnIndex = -1;
                btn.classList.remove("selected");
                savedSearchText.classList.remove("hidden");
                savedSearchContainer.classList.remove("hidden");
                savedSearchTwoContainer.classList.remove("hidden");
                recentContainer.classList.remove("hidden");
                savedContainer.classList.remove("hidden");
                emailContainerPeopleId.classList.remove('hidden');
                searchOptions.classList.remove("hidden"); // Ensure the row of filter buttons is visible
                if (peopleQueryDiv) peopleQueryDiv.classList.add('hidden'); // This hides the entire #people-query div
                
                if (peopleEmptyState) peopleEmptyState.classList.add("hidden");
                
                
                if (recentContainerTitle) {
                  recentContainerTitle.classList.remove("hidden");
                }
                optionBtns.forEach(b => {
                  b.classList.remove("hide"); // Ensure no option button is hidden
                  b.classList.remove("selected");
                });
                
              } else {
                
                selectedOptionBtnIndex = 2;
                btn.classList.add("selected");
                savedSearchText.classList.add("hidden");
                savedSearchContainer.classList.add("hidden");
                savedSearchTwoContainer.classList.add("hidden");
                savedContainer.classList.add("hidden");
                if (recentContainer) recentContainer.classList.remove("hidden");
                if (peopleQueryDiv) peopleQueryDiv.classList.add('hidden');
                if (recentContainerTitle) {
                  recentContainerTitle.classList.remove("hidden");
                }
                mytaskdisplay.classList.add("hidden");
                projectdisplay.classList.add("hidden");
                messagesEmptyState.classList.add("hidden");
                optionBtns.forEach((b, i) => {
                  if (i !== 2) {
                    b.classList.add("hide");
                    b.classList.remove("selected");
                  }
                });
                /*
                const processedPeopleData = await getProcessedWorkspacePeopleData();
                if (processedPeopleData.length > 0) {
                  console.log("DEBUG: Data is NOT empty. Showing loading spinner then rendering people.");
                  // Data is NOT empty, show loading spinner then render people
                  if (peopleQueryDiv) {
                    peopleQueryDiv.innerHTML = '<div class="loading-spinner"></div>';
                  }
                  await new Promise(resolve => setTimeout(resolve, 300));
                  renderAllPeople(processedPeopleData, peopleQueryDiv, peopleEmptyState, emailContainerPeopleId);
                } else {
                  console.log("DEBUG: Data IS empty. Directly showing empty state and invite button.");
                  // Data IS empty, directly show empty state and invite button
                  if (peopleQueryDiv) {
                    peopleQueryDiv.innerHTML = ''; // Clear any loading spinner or old content
                    // peopleQueryDiv.classList.remove('hidden'); // Already unhidden above
                  }
                  peopleEmptyState.classList.remove("hidden"); // Show empty state
                  emailContainerPeopleId.classList.remove('hidden'); // Show invite button
                }
                */
                fetchRecentItemsFromFirestore(renderRecentItems, {
                  showTasks: false,
                  showPeople: true,
                  showProjects: false,
                  showMessages: false,
                  taskLimit: 4,
                  projectLimit: 5, // Limit projects
                  showInviteButton: true
                });
              }
              input.value = ''; // Clear input on option selection
              cancelIcon.classList.add('hidden'); // Hide cancel icon
              searchOptions.classList.remove("hidden"); // Always show filter buttons
              emailContainerId.classList.add('hidden'); // Hide specific email invite
              mytaskdisplay.classList.add("hidden"); // Hide mytask display
              projectdisplay.classList.add("hidden"); // Hide project display
            });
            
            optionBtns[3].addEventListener("click", async () => {
              const btn = optionBtns[3];
              const isSelected = btn.classList.contains("selected");
              // halfQuery.classList.remove("skeleton-active");
              
              if (isSelected) {
                fetchRecentItemsFromFirestore(renderRecentItems, {
                  showTasks: true,
                  showPeople: true,
                  showProjects: true,
                  showMessages: true,
                  taskLimit: 4, // No specific limit for general view
                  projectLimit: null,
                  showInviteButton: false
                });
                
                selectedOptionBtnIndex = -1;
                btn.classList.remove("selected");
                optionBtns.forEach(b => b.classList.remove("hide"));
                savedSearchText.classList.remove("hidden");
                savedSearchContainer.classList.remove("hidden");
                savedSearchTwoContainer.classList.remove("hidden");
                recentContainer.classList.remove("hidden");
                messagesEmptyState.classList.add("hidden");
                savedContainer.classList.remove("hidden");
                searchOptions.classList.remove("hidden");
                recentContainer.classList.remove("hidden");
                emailContainerId.classList.add('hidden');
                
                
              } else {
                
                selectedOptionBtnIndex = 3;
                btn.classList.add("selected");
                savedSearchText.classList.add("hidden");
                messagesEmptyState.classList.remove("hidden");
                savedSearchTwoContainer.classList.add("hidden");
                savedSearchContainer.classList.add("hidden");
                optionBtns.forEach((b, i) => {
                  if (i !== 3) {
                    b.classList.add("hide");
                    b.classList.remove("selected");
                  }
                });
                fetchRecentItemsFromFirestore(renderRecentItems, {
                  showTasks: false,
                  showPeople: false,
                  showProjects: false,
                  showMessages: true,
                  taskLimit: 4,
                  projectLimit: 5, // Limit projects
                  showInviteButton: true
                });
              }
              input.value = ''; // Clear input on option selection
              cancelIcon.classList.add('hidden'); // Hide cancel icon
              searchOptions.classList.remove("hidden"); // Always show filter buttons
              emailContainerId.classList.add('hidden'); // Hide specific email invite
              emailContainerPeopleId.classList.add('hidden'); // Hide people email invite
              mytaskdisplay.classList.add("hidden"); // Hide mytask display
              projectdisplay.classList.add("hidden"); // Hide project display
              peopleEmptyState.classList.add("hidden"); // Hide people empty state
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
            
            let searchTimeout = null;
            const DEBOUNCE_DELAY = 300;
            
            input.addEventListener('keydown', (event) => {
              // Check if the "Enter" key was pressed
              if (event.key === 'Enter') {
                const value = input.value.trim();
                // Only redirect if there's actually a search query
                if (value !== '') {
                  window.location.href = '/searchresults';
                }
              }
            });
            
            input.addEventListener('input', async () => {
  const value = input.value.trim();
  
  clearTimeout(searchTimeout);

  if (value !== '') {
    cancelIcon.classList.remove('hidden');
    savedContainer.classList.add("hidden");
    recentContainer.classList.add("hidden");
    searchOptions.classList.add("hidden");
    halfQuery.classList.remove("hidden");
    halfQuery.classList.add("skeleton-active");

    halfQuery.innerHTML = `
      <div class="skeleton-loader" style="width: 200px;"></div>
      <div class="skeleton-loader" style="width: 500px;"></div>
      <div class="skeleton-loader" style="width: 400px;"></div>
    `;

    searchTimeout = setTimeout(async () => {
      try {
        // Perform a multi-index search with Algolia
        const { results } = await searchClient.search([
          {
            indexName: 'projects',
            query: value,
            params: { hitsPerPage: 5 } // Limit results for the dropdown
          },
          {
            indexName: 'tasks',
            query: value,
            params: { hitsPerPage: 5 }
          },
          
        ]);
        
        
        // Extract the hits from the results
        const projects = results[0]?.hits || [];
        const tasks = results[1]?.hits || [];
        console.log("Found Projects:", projects);
console.log("Found Tasks:", tasks);
        /*
        const people = results[2]?.hits || [];
        {
  indexName: 'users', // For searching people's names
  query: value,
  params: { hitsPerPage: 5 }
}*/
        // Your existing rendering function will now display the live results from Algolia
        displaySearchResults(tasks, projects, [], []);

      } catch (err) {
        console.error("Algolia search error:", err);
        halfQuery.classList.remove("skeleton-active");
        halfQuery.innerHTML = `<div class="search-no-results"><p>Error performing search.</p></div>`;
      }
    }, DEBOUNCE_DELAY);

  } else {
    // This is the logic to handle when the search input is cleared
    cancelIcon.classList.add('hidden');
    halfQuery.innerHTML = '';
    halfQuery.classList.add("hidden");
    optionsQuery.classList.add("hidden");
    savedContainer.classList.remove("hidden");
    searchOptions.classList.remove("hidden");

    // Restore the default view (e.g., showing recent items)
    fetchRecentItemsFromFirestore(renderRecentItems, {
      showTasks: true,
      showPeople: true,
      showProjects: true,
      showMessages: true,
      taskLimit: 4,
      projectLimit: null,
      showInviteButton: false
    });
  }
});
            
            document.querySelector('.clear-text').addEventListener('click', function() {
              inputFilter.value = '';
              document.querySelector('.search-input-filter').focus(); // Optional: refocus the input
            });
            
            cancelIcon.addEventListener('click', async () => {
              input.value = '';
              
              input.focus(); // Keep focus on the input after clearing
              cancelIcon.classList.add('hidden');
              savedContainer.classList.remove("hidden");
              searchOptions.classList.remove("hidden");
              recentContainer.classList.remove("hidden");
              emailContainerId.classList.add('hidden');
              halfQuery.classList.add("hidden"); // Corrected
              optionsQuery.classList.add("hidden");
              
              if (selectedOptionBtnIndex === 0) { // Tasks
                mytaskdisplay.classList.remove("hidden");
                fetchRecentItemsFromFirestore(renderRecentItems, {
  showTasks: true,
  showPeople: false,
  showProjects: false,
  showMessages: false,
  taskLimit: 4, // Limit tasks
  projectLimit: null,
  showInviteButton: false
});
              } else if (selectedOptionBtnIndex === 1) { // Projects
                projectdisplay.classList.remove("hidden");
                fetchRecentItemsFromFirestore(renderRecentItems, {
  showTasks: false,
  showPeople: false,
  showProjects: true,
  showMessages: false,
  taskLimit: 4,
  projectLimit: 5, // Limit projects
  showInviteButton: false
});
              } else if (selectedOptionBtnIndex === 2) { // People
                peopleEmptyState.classList.remove("hidden");
                emailContainerPeopleId.classList.remove('hidden');
                fetchRecentItemsFromFirestore(renderRecentItems, {
  showTasks: false,
  showPeople: true,
  showProjects: false,
  showMessages: false,
  taskLimit: 4,
  projectLimit: 5, // Limit projects
  showInviteButton: true
});
              } else if (selectedOptionBtnIndex === 3) { // NEW: Messages
                messagesEmptyState.classList.remove("hidden");
                fetchRecentItemsFromFirestore(renderRecentItems, {
  showTasks: false,
  showPeople: false,
  showProjects: false,
  showMessages: true,
  taskLimit: 4,
  projectLimit: 5, // Limit projects
  showInviteButton: true
});
              } else {
fetchRecentItemsFromFirestore(renderRecentItems, {
  showTasks: true,
  showPeople: true,
  showProjects: true,
  showMessages: true,
  taskLimit: 4,
  projectLimit: null,
  showInviteButton: false
});
              }
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
                  
                  if (selectedType == 'Any') {
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
                  } else if (selectedType == 'Tasks') {
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
                  
                } else if (buttonId === "locatedDropdownProjects") {
                  selectedLocation = selectedText;
                  
                  if (selectedLocation === 'In portfolios' || selectedLocation === 'In teams') {
                    document.getElementById('extra-field-projectdropdown').classList.remove("hidden");
                    
                  } else {
                    
                    document.getElementById('extra-field-projectdropdown').classList.add("hidden");
                    
                  }
                } else if (buttonId === "dueDateDropdown") {
                  document.getElementById('dueDateDropdownExtra').textContent = selectedText;
                  selectedDueDate = selectedText;
                  
                  if (selectedDueDate === 'Yesterday' || selectedDueDate === 'Today' ||
                    selectedDueDate === 'Tomorrow' || selectedDueDate === 'Specific Date') {
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
                  } else if (selectedDueDate === 'Within the last' || selectedDueDate === 'Within the next' ||
                    selectedDueDate === 'Through the next') {
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
                  } else {
                    document.getElementById('duedate-field').classList.remove("hidden");
                    document.getElementById('duedate-dropdown-extra').classList.add("hidden");
                  }
                  
                } else if (buttonId === "dueDateDropdownExtra") {
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
                  
                } else if (buttonId === "dueDateDropdownWithin") {
                  selectedWithinDaysWeeksMonths = selectedText;
                  
                } else if (buttonId === "statusDropdown") {
                  selectedStatus = selectedText;
                  
                } else if (buttonId === "statusProjectDropdown") {
                  selectedStatusProject = selectedText;
                  
                } else {
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
            
            updateProfileDisplay(user);
            
            fetchRecentItemsFromFirestore(renderRecentItems, {
              showTasks: true,
              showPeople: true,
              showProjects: true,
              showMessages: true,
              taskLimit: 4, // No specific limit for general view
              projectLimit: null,
              showInviteButton: false
            });
            
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