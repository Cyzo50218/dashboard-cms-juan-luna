/*
 * @file list.js
 * @description Controls both the "My Tasks" view (using taskIndex) and the detailed "Project List" view.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  query,
  where,
  onSnapshot,
  collectionGroup,
  orderBy,
  getDoc,
  getDocs,
  writeBatch,
  updateDoc,
  increment,
  deleteField,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

let taskListHeaderEl,
  taskListBody,
  headerRight,
  addSectionBtn,
  addTaskHeaderBtn;
let bodyClickListener,
  bodyFocusOutListener,
  addTaskHeaderBtnListener,
  addSectionBtnListener;

let currentViewMode = null;
let currentUserId = null;
let lastOpenedTaskId = null;
let allUsersMap = new Map();

let myTasks = [];
let projectsMap = new Map();
let myTasksSort = { field: "dueDate", direction: "asc" };
let myTasksFilter = { hideCompleted: false };
const sortCycle = [
  { field: "dueDate", direction: "asc" },
  { field: "dueDate", direction: "desc" },
  { field: "project", direction: "asc" },
  { field: "project", direction: "desc" },
  { field: "status", direction: "asc" },
  { field: "status", direction: "desc" },
];
let currentSortIndex = 0;

let project = {
  defaultColumns: [],
  customColumns: [],
  sections: [],
};
let allTasksFromSnapshot = [];
let userCanEditProject = false;
let currentProjectRef = null;
let currentProjectId = null;

let activeListeners = {
  user: null,
  project: null,
  sections: null,
  tasks: null,
};

function setupThemeListener() {
  const applyTheme = () => {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    if (prefersDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.classList.remove("dark");
    }
  };

  applyTheme();

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (event) => {
      if (event.matches) {
        document.documentElement.setAttribute("data-theme", "dark");
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
        document.documentElement.classList.remove("dark");
      }
    });
}

export function init(routeParams) {
  setupThemeListener();

  console.log("Initializing List/Tasks module with params:", routeParams);
  const isMyTasksView = window.location.pathname === "/mytasks";
  currentViewMode = isMyTasksView ? "myTasks" : "projectView";
  initializeCommonViewElements();
  const projectIconColor = document.getElementById("project-color");
  setRandomProjectIcon(projectIconColor);

  onAuthStateChanged(auth, (user) => {
    detachAllListeners();
    if (user) {
      currentUserId = user.uid;
      if (isMyTasksView) {
        console.log("Activating 'My Tasks' view...");
        attachMyTasksListeners(user.uid);
      } else {
        const projectIdFromUrl = routeParams.projectId;
        console.log(
          `Activating 'Project View' for project: ${projectIdFromUrl}`
        );
        attachProjectViewListeners(user.uid, projectIdFromUrl);
      }
    } else {
      console.log("User signed out. Clearing views.");
      myTasks = [];
      project = {};
      projectsMap.clear();
      allUsersMap.clear();
      render();
    }
  });

  return function cleanup() {
    console.log(`Cleaning up ${currentViewMode} view...`);
    detachAllListeners();
    if (bodyClickListener)
      taskListBody.removeEventListener("click", bodyClickListener);
    if (bodyFocusOutListener)
      taskListBody.removeEventListener("focusout", bodyFocusOutListener);
    if (addTaskHeaderBtnListener)
      addTaskHeaderBtn.removeEventListener("click", addTaskHeaderBtnListener);
    if (addSectionBtnListener)
      addSectionBtn.removeEventListener("click", addSectionBtnListener);
  };
}

function initializeCommonViewElements() {
  taskListHeaderEl = document.getElementById("listview-header");
  taskListBody = document.getElementById("task-list-body");
  headerRight = document.getElementById("header-right");
  addSectionBtn = document.getElementById("add-section-btn");
  addTaskHeaderBtn = document.querySelector(".add-task-header-btn");
  startOpenTaskPolling();
}

function detachAllListeners() {
  console.log("Detaching all Firestore listeners...");
  Object.values(activeListeners).forEach((unsubscribe) => {
    if (unsubscribe) unsubscribe();
  });
  Object.keys(activeListeners).forEach((key) => (activeListeners[key] = null));
}

function render() {
  if (!taskListBody) return;
  if (currentViewMode === "myTasks") {
    renderMyTasksView();
  } else if (currentViewMode === "projectView") {
    renderProjectView();
  } else {
    taskListBody.innerHTML = `<div class="progress-loading-container"><div class="progress-spinner"></div></div>`;
  }
}

function attachMyTasksListeners(userId) {
  const tasksQuery = query(
    collection(db, "taskIndex"),
    where("assignees", "array-contains", userId),
    orderBy("dueDate", "asc")
  );
  activeListeners.tasks = onSnapshot(
    tasksQuery,
    async (tasksSnapshot) => {
      myTasks = tasksSnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      }));
      await fetchReferencedDataForMyTasks(myTasks);
      render();
    },
    (error) => console.error("[My Tasks] Error:", error)
  );
  setupMyTasksEventListeners();
}

async function fetchReferencedDataForMyTasks(tasks) {
  const projectIds = new Set(tasks.map((t) => t.projectId).filter(Boolean));
  const userIds = new Set(tasks.flatMap((t) => t.assignees || []));
  if (currentUserId) userIds.add(currentUserId);

  if (projectIds.size > 0) {
    const projectsQuery = query(
      collectionGroup(db, "projects"),
      where("projectId", "in", [...projectIds])
    );
    const projectsSnapshot = await getDocs(projectsQuery);
    projectsMap.clear();
    projectsSnapshot.forEach((doc) => {
      const projectData = doc.data();
      projectsMap.set(projectData.projectId, {
        ...projectData,
        id: doc.id,
      });
    });
  }

  if (userIds.size > 0) {
    console.log("Fetching user profiles for UIDs:", [...userIds]);
    const usersQuery = query(
      collection(db, "users"),
      where("id", "in", [...userIds])
    );
    const usersSnapshot = await getDocs(usersQuery);
    console.log(`Found ${usersSnapshot.size} user documents.`);

    allUsersMap.clear();
    usersSnapshot.forEach((doc) => {
      const userData = doc.data();
      allUsersMap.set(doc.id, {
        ...userData,
        id: doc.id,
      });
    });
    console.log("Populated allUsersMap:", allUsersMap);
  }
}

function renderMyTasksView() {
  if (!taskListBody) return;
  if (addTaskHeaderBtn) addTaskHeaderBtn.style.display = "none";
  if (addSectionBtn) addSectionBtn.style.display = "none";

  const tasksToRender = getProcessedMyTasks();

  if (tasksToRender.length === 0) {
    const messageHTML =
      myTasks.length > 0
        ? `<div style="text-align: center; padding: 60px 20px; font-family: sans-serif; color: #555;">
                <i class="material-icons" style="font-size: 48px; margin-bottom: 16px;">filter_list_off</i>
                <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">No Tasks Found</h3>
                <p style="margin: 0; font-size: 14px;">No tasks match your current filter settings.</p>
            </div>`
        : `<div style="text-align: center; padding: 60px 20px; font-family: sans-serif; color: #555;">
                <i class="material-icons" style="font-size: 48px; margin-bottom: 16px;">check_box</i>
                <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">All clear!</h3>
                <p style="margin: 0; font-size: 14px;">You have no tasks assigned to you.</p>
            </div>`;
    taskListBody.innerHTML = messageHTML;
    return;
  }

  const container = document.createElement("div");
  container.className =
    "w-full h-full bg-white overflow-auto juanlunacms-spreadsheetlist-custom-scrollbar";
  const table = document.createElement("div");
  table.className = "min-w-max relative";
  const header = document.createElement("div");
  header.className =
    "flex sticky top-0 z-20 bg-white juanlunacms-spreadsheetlist-sticky-header h-5 border-b border-slate-200";

  header.innerHTML = `
        <div class="sticky left-0 z-10 w-80 md:w-96 lg:w-[400px] flex-shrink-0 px-4 font-semibold text-slate-600 border-r border-slate-200 juanlunacms-spreadsheetlist-left-sticky-pane bg-white flex items-center text-xs">Task Name</div>
        <div class="flex flex-grow">
            <div class="w-44 px-2 flex items-center justify-start font-semibold text-slate-600 border-r border-slate-200 text-xs">Due Date</div>
            <div class="w-56 px-2 flex items-center justify-start font-semibold text-slate-600 border-r border-slate-200 text-xs">Project</div>
            <div class="w-44 px-2 flex items-center justify-start font-semibold text-slate-600 border-r border-slate-200 text-xs">Assignee</div>
            <div class="w-44 px-2 flex items-center justify-start font-semibold text-slate-600 border-r border-slate-200 text-xs">Status</div>
        </div>
    `;

  const body = document.createElement("div");
  tasksToRender.forEach((task) => {
    const taskRow = createTaskRowForMyTasks(task);
    if (taskRow) body.appendChild(taskRow);
  });

  table.appendChild(header);
  table.appendChild(body);
  container.appendChild(table);
  taskListBody.innerHTML = "";
  taskListBody.appendChild(container);
}

function createTaskRowForMyTasks(task) {
  const project = projectsMap.get(task.projectId);
  if (!project) {
    console.warn(
      `Could not render task "${task.name}" (${task.id}) because its project (${task.projectId}) was not found.`
    );
    return null;
  }

  const isCompleted = task.status === "Completed";
  const canEdit = canUserEditTask(task, project);
  const formattedDate = formatDueDate(task.dueDate);
  const commentCount = task.commentCount || 0;
  const likeCount = task.likedAmount || 0;

  const isLikedByCurrentUser = task.likedBy && task.likedBy[currentUserId];

  const row = document.createElement("div");
  row.className = `task-row-wrapper flex group border-b border-slate-200 ${
    isCompleted ? "is-completed" : ""
  }`;
  row.dataset.taskId = task.id;

  row.innerHTML = `
        <div class="group sticky left-0 w-80 md:w-96 lg:w-[400px] flex-shrink-0 flex items-center border-r border-slate-200 group-hover:bg-slate-50 juanlunacms-spreadsheetlist-left-sticky-pane p-1 relative" style="background-color: var(--primary-bg);">
            <label class="juanlunacms-spreadsheetlist-custom-checkbox-container px-2 ml-6" data-control="check">
                <input type="checkbox" ${isCompleted ? "checked" : ""} ${
    !canEdit ? "disabled" : ""
  }>
                <span class="juanlunacms-spreadsheetlist-custom-checkbox"></span>
            </label>
            
            <span class="task-name truncate text-xs flex-grow pr-20" data-control="open-sidebar">${
              task.name || "Untitled Task"
            }</span>
            
            <div class="task-controls absolute right-2 top-0 bottom-0 h-full flex items-center gap-x-2 pl-2 opacity-1">
                ${
                  commentCount > 0
                    ? `<span class="text-xs text-slate-500 font-sans">${commentCount}</span>`
                    : ""
                }
                <span class="material-icons text-slate-500 cursor-pointer hover:text-blue-600" style="font-size: 14px;" data-control="comment">chat_bubble_outline</span>
                
                ${
                  likeCount > 0
                    ? `<span class="text-xs text-slate-500 font-sans">${likeCount}</span>`
                    : ""
                }
                <span class="material-icons cursor-pointer ${
                  isLikedByCurrentUser
                    ? "text-red-500"
                    : "text-slate-500 hover:text-red-500"
                }" style="font-size: 16px;" data-control="like">
                    ${isLikedByCurrentUser ? "favorite" : "favorite_border"}
                </span>
            </div>
        </div>
        <div class="flex-grow flex">
            <div class="w-44 px-2 flex items-center justify-start text-xs" data-control="due-date">
                <span class="date-tag date-${formattedDate.color}">${
    formattedDate.text
  }</span>
            </div>
            <div class="w-56 px-2 flex items-center justify-start text-xs truncate" title="${
              project.title
            }" data-control="open-sidebar">${project.title}</div>
            <div class="w-44 px-2 flex items-center justify-start text-xs" data-control="assignee">${createAssigneeHTML(
              task.assignees
            )}</div>
            <div class="w-44 px-2 flex items-center justify-start text-xs" data-control="status">${createStatusTag(
              task.status,
              project
            )}</div>
        </div>
    `;
  return row;
}

function setupMyTasksEventListeners() {
  bodyClickListener = (e) => {
    const taskRow = e.target.closest(".task-row-wrapper[data-task-id]");
    if (!taskRow) return;
    const taskId = taskRow.dataset.taskId;
    const { task, project } = findTaskAndProject(taskId);
    if (!task || !project) return;
    const controlElement = e.target.closest("[data-control]");
    if (!controlElement) {
      displaySideBarTasks(taskId);
      return;
    }
    const controlType = controlElement.dataset.control;
    if (
      ["check", "like"].includes(controlType) &&
      !canUserEditTask(task, project)
    ) {
      console.warn(`[Permissions] Blocked '${controlType}' action.`);
      return;
    }
    switch (controlType) {
      case "open-sidebar":
      case "comment":
        displaySideBarTasks(taskId);
        break;
      case "check":
        e.stopPropagation();
        handleTaskCompletion(task, project);
        break;
      case "like":
        e.stopPropagation();
        handleTaskLike(task);
        break;
    }
  };
  taskListBody.addEventListener("click", bodyClickListener);

  const sortBtn = document.getElementById("sort-btn");
  const filterBtn = document.getElementById("filter-btn");

  if (sortBtn) {
    sortBtn.addEventListener("click", () => {
      currentSortIndex = (currentSortIndex + 1) % sortCycle.length;
      myTasksSort = sortCycle[currentSortIndex];
      updateSortButtonUI();
      render();
    });
  }

  if (filterBtn) {
    filterBtn.addEventListener("click", () => {
      myTasksFilter.hideCompleted = !myTasksFilter.hideCompleted;
      updateFilterButtonUI();
      render();
    });
  }

  updateSortButtonUI();
  updateFilterButtonUI();
}

async function handleTaskLike(task) {
  if (!currentUserId) return;
  const taskRef = await getTaskRef(task.id);
  if (!taskRef) return;

  const liked = task.likedBy && task.likedBy[currentUserId];

  const propertiesToUpdate = liked
    ? {
        likedAmount: increment(-1),
        [`likedBy.${currentUserId}`]: deleteField(),
      }
    : {
        likedAmount: increment(1),
        [`likedBy.${currentUserId}`]: true,
      };

  await updateTaskInFirebase(task.id, propertiesToUpdate);
}

async function attachProjectViewListeners(userId, projectId) {
  if (!projectId) {
    taskListBody.innerHTML = `<p class="p-8 text-center text-slate-500">No project selected.</p>`;
    return;
  }
  const projectQuery = query(
    collectionGroup(db, "projects"),
    where("projectId", "==", projectId)
  );
  const projectSnapshot = await getDocs(projectQuery);
  if (projectSnapshot.empty) {
    taskListBody.innerHTML = `<p class="p-8 text-center text-slate-500">Project not found or you don't have access.</p>`;
    return;
  }
  currentProjectRef = projectSnapshot.docs[0].ref;
  currentProjectId = projectId;
  activeListeners.project = onSnapshot(currentProjectRef, async (projSnap) => {
    if (!projSnap.exists()) return;
    project = {
      ...projSnap.data(),
      id: projSnap.id,
    };
    updateUserPermissions(project, userId);
    const memberUIDs = project.members?.map((m) => m.uid) || [];
    if (memberUIDs.length > 0) {
      const usersQuery = query(
        collection(db, "users"),
        where("id", "in", memberUIDs)
      );
      const usersSnapshot = await getDocs(usersQuery);

      allUsersMap.clear();
      usersSnapshot.forEach((doc) => {
        const userData = doc.data();

        allUsersMap.set(doc.id, {
          ...userData,
          id: doc.id,
        });
      });
    }

    if (activeListeners.sections) activeListeners.sections();
    const sectionsQuery = query(
      collection(currentProjectRef, "sections"),
      orderBy("order")
    );
    activeListeners.sections = onSnapshot(sectionsQuery, (sectionsSnapshot) => {
      project.sections = sectionsSnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
        tasks: [],
      }));
      distributeTasksToSections(allTasksFromSnapshot);
      render();
    });
    if (activeListeners.tasks) activeListeners.tasks();
    const tasksGroupQuery = query(
      collectionGroup(db, "tasks"),
      where("projectId", "==", projectId)
    );
    activeListeners.tasks = onSnapshot(tasksGroupQuery, (tasksSnapshot) => {
      allTasksFromSnapshot = tasksSnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      }));
      distributeTasksToSections(allTasksFromSnapshot);
      render();
    });
  });
  setupProjectViewEventListeners();
}

function renderProjectView() {
  if (!taskListBody) return;
  if (!project || !project.id) {
    taskListBody.innerHTML = `<div class="progress-loading-container"><div class="progress-spinner"></div><div class="loading-text">Loading project...</div></div>`;
    return;
  }
  addTaskHeaderBtn.style.display = userCanEditProject ? "flex" : "none";
  addSectionBtn.style.display = userCanEditProject ? "flex" : "none";
  let content = `<h2>Project View: ${project.title}</h2><p>(Full spreadsheet grid would be rendered here)</p>`;
  taskListBody.innerHTML = content;
  console.log("Rendered Project View (placeholder)");
}

function updateSortButtonUI() {
  const sortBtn = document.getElementById("sort-btn");
  if (!sortBtn) return;
  const { field, direction } = myTasksSort;
  const fieldName =
    field.charAt(0).toUpperCase() + field.slice(1).replace("Date", " Date");
  sortBtn.innerHTML = `<i class="fas fa-sort"></i> Sort: ${fieldName} (${direction})`;
  sortBtn.classList.add("active-sort-filter");
}

function updateFilterButtonUI() {
  const filterBtn = document.getElementById("filter-btn");
  if (!filterBtn) return;
  if (myTasksFilter.hideCompleted) {
    filterBtn.innerHTML = `<i class="fas fa-filter"></i> Hide Completed`;
    filterBtn.classList.add("active-sort-filter");
  } else {
    filterBtn.innerHTML = `<i class="fas fa-filter"></i> Filter`;
    filterBtn.classList.remove("active-sort-filter");
  }
}

function setupProjectViewEventListeners() {
  console.log("Setting up Project View event listeners (placeholder).");
}

function distributeTasksToSections(tasks) {
  if (!project?.sections) return;
  project.sections.forEach((section) => (section.tasks = []));
  tasks.forEach((task) => {
    const section = project.sections.find((s) => s.id === task.sectionId);
    if (section) section.tasks.push(task);
  });
  project.sections.forEach((section) => {
    section.tasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });
}

function getProcessedMyTasks() {
  let processedTasks = [...myTasks];

  if (myTasksFilter.hideCompleted) {
    processedTasks = processedTasks.filter(
      (task) => task.status !== "Completed"
    );
  }

  processedTasks.sort((a, b) => {
    const field = myTasksSort.field;
    const dir = myTasksSort.direction === "asc" ? 1 : -1;

    let valA, valB;

    switch (field) {
      case "dueDate":
        valA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        valB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        break;
      case "project":
        const projectA = projectsMap.get(a.projectId);
        const projectB = projectsMap.get(b.projectId);
        valA = projectA ? projectA.title.toLowerCase() : "";
        valB = projectB ? projectB.title.toLowerCase() : "";
        break;
      case "status":
        valA = a.status ? a.status.toLowerCase() : "";
        valB = b.status ? b.status.toLowerCase() : "";
        break;
      default:
        valA = a[field] || "";
        valB = b[field] || "";
    }

    if (typeof valA === "string") valA = valA.localeCompare(valB);
    else valA = valA < valB ? -1 : valA > valB ? 1 : 0;

    return valA * dir;
  });

  return processedTasks;
}

function updateUserPermissions(projectData, userId) {
  if (!projectData || !userId) {
    userCanEditProject = false;
    return;
  }
  const userMemberInfo = (projectData.members || []).find(
    (member) => member.uid === userId
  );
  const userRole = userMemberInfo ? userMemberInfo.role : null;
  userCanEditProject = [
    "Project Owner Admin",
    "Project Admin",
    "Editor",
  ].includes(userRole);
}

function startOpenTaskPolling() {
  setInterval(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const taskIdToOpen = urlParams.get("openTask");
    if (taskIdToOpen && taskIdToOpen !== lastOpenedTaskId) {
      if (window.TaskSidebar?.open) {
        await displaySideBarTasks(taskIdToOpen);
        lastOpenedTaskId = taskIdToOpen;
      }
    } else if (!taskIdToOpen && lastOpenedTaskId !== null) {
      lastOpenedTaskId = null;
    }
  }, 1000);
}

function findTaskAndProject(taskId) {
  if (currentViewMode === "myTasks") {
    const task = myTasks.find((t) => t.id === taskId);
    const project = task ? projectsMap.get(task.projectId) : null;
    return {
      task,
      project,
    };
  } else {
    for (const section of project.sections || []) {
      const task = section.tasks.find((t) => t.id === taskId);
      if (task)
        return {
          task,
          project,
        };
    }
    return {
      task: null,
      project: null,
    };
  }
}

function canUserEditTask(task, project) {
  if (!task || !project || !currentUserId) return false;
  const userMemberInfo = (project.members || []).find(
    (member) => member.uid === currentUserId
  );
  const userRole = userMemberInfo ? userMemberInfo.role : null;
  const hasProjectEditPermission = [
    "Project Owner Admin",
    "Project Admin",
    "Editor",
  ].includes(userRole);
  if (hasProjectEditPermission) return true;
  if (userRole === "Viewer" || userRole === "Commentor") {
    return (task.assignees || []).includes(currentUserId);
  }
  return false;
}

function setRandomProjectIcon(iconContainer) {
  const miscellaneousIcons = [
    "anchor",
    "archive",
    "award",
    "axe",
    "banknote",
    "beaker",
    "bell",
    "bomb",
    "book",
    "box",
    "briefcase",
    "building",
    "camera",
    "candy",
    "clapperboard",
    "clipboard",
    "cloud",
    "compass",
    "cpu",
    "crown",
    "diamond",
    "dice-5",
    "drafting-compass",
    "feather",
    "flag",
    "flame",
    "folder",
    "gem",
    "gift",
    "graduation-cap",
    "hammer",
    "hard-hat",
    "heart-pulse",
    "key-round",
    "landmark",
    "layers",
    "leaf",
    "lightbulb",
    "map",
    "medal",
    "mouse-pointer",
    "package",
    "palette",
    "plane",
    "puzzle",
    "rocket",
    "shield",
    "ship",
    "sprout",
    "star",
    "swords",
    "ticket",
    "tractor",
    "trophy",
    "umbrella",
    "wallet",
    "wrench",
  ];
  const iconGlyph = iconContainer.querySelector(".project-icon-glyph");
  if (!iconGlyph) {
    console.error(
      "Could not find the '.project-icon-glyph' element inside the container."
    );
    return;
  }
  const randomIndex = Math.floor(Math.random() * miscellaneousIcons.length);
  const randomIconName = miscellaneousIcons[randomIndex];
  iconGlyph.setAttribute("data-lucide", randomIconName);
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  } else {
    console.warn("Lucide library not found or createIcons not available.");
  }
}

function formatDueDate(dueDateString) {
  if (!dueDateString)
    return {
      text: "No date",
      color: "default",
    };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(dueDateString);
  dueDate.setHours(0, 0, 0, 0);
  const dayDifference =
    (dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
  if (dayDifference < 0)
    return {
      text: "Overdue",
      color: "red",
    };
  if (dayDifference === 0)
    return {
      text: "Today",
      color: "green",
    };
  if (dayDifference === 1)
    return {
      text: "Tomorrow",
      color: "yellow",
    };
  return {
    text: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(dueDate),
    color: "default",
  };
}

function createAssigneeHTML(assigneeIds) {
  if (!assigneeIds || assigneeIds.length === 0)
    return `<span class="text-slate-400">Unassigned</span>`;
  const user = allUsersMap.get(assigneeIds[0]);
  if (!user) return `<span class="text-slate-400">Unknown User</span>`;
  return `
        <div class="flex items-center">
            <img class="profile-picture rounded-avatar" src="${
              user.avatar || "/img/default-avatar.png"
            }" title="${user.name}">
            <span class="assignee-name ml-2 truncate">${user.name}</span>
        </div>
    `;
}

function createStatusTag(statusName, project) {
  if (!statusName || !project) return "";
  const statusColumn = (project.defaultColumns || []).find(
    (c) => c.id === "status"
  );
  const option = (statusColumn?.options || []).find(
    (s) => s.name === statusName
  );
  const color = option?.color || "#cccccc";
  const style = `background-color: ${color}20; color: ${color}; border: 1px solid ${color}80;`;
  return `<div class="status-tag" style="${style}">${statusName}</div>`;
}

async function getTaskRef(taskId) {
  try {
    const indexDocSnap = await getDoc(doc(db, "taskIndex", taskId));
    if (!indexDocSnap.exists()) {
      console.error(`TaskIndex document not found for task ${taskId}.`);
      return null;
    }

    const taskIndexData = indexDocSnap.data();
    const { path } = taskIndexData;

    console.log("Fetched Task Data from taskIndex:", taskIndexData);

    if (!path) {
      console.error(`TaskIndex for ${taskId} is missing the 'path' field.`);
      return null;
    }

    return doc(db, path);
  } catch (error) {
    console.error(`Error fetching task reference for ${taskId}:`, error);
    return null;
  }
}

async function updateTaskInFirebase(taskId, propertiesToUpdate) {
  const taskRef = await getTaskRef(taskId);
  const taskIndexRef = doc(db, "taskIndex", taskId);

  if (!taskRef) {
    console.error(
      `Could not find original task path for ${taskId}. Update aborted.`
    );
    return;
  }

  const batch = writeBatch(db);

  batch.update(taskRef, propertiesToUpdate);
  batch.update(taskIndexRef, propertiesToUpdate);

  try {
    await batch.commit();
    console.log(
      `Successfully updated task ${taskId} in original location and taskIndex.`
    );
  } catch (error) {
    console.error(`Batch update failed for task ${taskId}:`, error);
  }
}

async function handleTaskCompletion(task, project) {
  const isCompleted = task.status === "Completed";
  let propertiesToUpdate = {};
  if (isCompleted) {
    propertiesToUpdate = {
      status: task.previousStatus || "On track",
      previousStatus: deleteField(),
    };
  } else {
    const statusColumn = (project.defaultColumns || []).find(
      (c) => c.id === "status"
    );
    if (!(statusColumn?.options || []).some((o) => o.name === "Completed")) {
      alert("This project doesn't have a 'Completed' status defined.");
      return;
    }
    propertiesToUpdate = {
      status: "Completed",
      previousStatus: task.status || "On track",
    };
  }
  await updateTaskInFirebase(task.id, propertiesToUpdate);
}

async function displaySideBarTasks(taskId) {
  if (!window.TaskSidebar?.open) {
    return console.error("TaskSidebar module is not available.");
  }
  const taskRef = await getTaskRef(taskId);
  if (taskRef) {
    const projectRef = taskRef.parent.parent.parent.parent;
    window.TaskSidebar.open(taskId, projectRef);
  } else {
    console.error(
      `Could not resolve a valid reference for task ${taskId}. Cannot open sidebar.`
    );
  }
}
