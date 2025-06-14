/*
 * @file list.js
 * @description Controls the List View tab with real-time data using Firestore snapshots.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    collection,
    query,
    where,
    onSnapshot,
    orderBy,
    addDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    serverTimestamp,
    deleteField, // Import deleteField for removing map keys
    arrayUnion,
    getDocs // Keep getDocs for batch operations
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");

// --- Module-Scoped Variables & State ---
// ... (Your existing DOM element and event handler variables) ...
let currentProjectId = null; // Will hold the ID of the currently viewed project
// ... (Your existing activeFilters, activeSortState, allUsers, etc.) ...

// --- Real-time Listener Management ---
// ... (The activeListeners object remains the same) ...

let project = { customColumns: [], sections: [] };
let allTasksFromSnapshot = [];

// --- Real-time Data Loading (attachRealtimeListeners) ---
// ... (The attachRealtimeListeners function from the previous step remains largely the same,
//      but we add one line to store the currentProjectId) ...
function attachRealtimeListeners(userId) {
    detachAllListeners();
    // ... (workspace listener) ...
    activeListeners.workspace = onSnapshot(workspaceQuery, (workspaceSnapshot) => {
        // ...
        activeListeners.project = onSnapshot(projectQuery, (projectSnapshot) => {
            // ...
            const projectId = projectDoc.id;
            currentProjectId = projectId; // <-- STORE THE CURRENT PROJECT ID
            // ... (the rest of the function) ...
        });
    });
}

// --- CORE FIREBASE WRITE OPERATIONS ---

/**
 * Creates a new task document in Firestore.
 * onSnapshot will handle the UI update.
 * @param {string} sectionId The ID of the section to add the task to.
 * @param {object} taskData The core data for the new task.
 */
async function addTaskToFirebase(sectionId, taskData) {
    if (!currentProjectId) return console.error("No project selected.");
    try {
        await addDoc(collection(db, "tasks"), {
            ...taskData,
            projectId: currentProjectId,
            sectionId: sectionId,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Error adding task:", error);
        alert("Error: Could not add the new task.");
    }
}

/**
 * Updates specific properties of a task document in Firestore.
 * @param {string} taskId The ID of the task to update.
 * @param {object} propertiesToUpdate An object with the fields to update.
 */
async function updateTaskInFirebase(taskId, propertiesToUpdate) {
    const taskRef = doc(db, "tasks", taskId);
    try {
        await updateDoc(taskRef, propertiesToUpdate);
    } catch (error) {
        console.error(`Error updating task ${taskId}:`, error);
        alert("Error: Could not save task changes.");
    }
}

/**
 * Creates a new section document in a project's subcollection.
 * @param {object} sectionData The data for the new section (e.g., {title, order}).
 */
async function addSectionToFirebase(sectionData) {
    if (!currentProjectId) return console.error("No project selected.");
    try {
        await addDoc(collection(db, `projects/${currentProjectId}/sections`), sectionData);
    } catch (error) {
        console.error("Error adding section:", error);
        alert("Error: Could not add the new section.");
    }
}

/**
 * Updates a section document in Firestore.
 * @param {string} sectionId The ID of the section to update.
 * @param {object} propertiesToUpdate An object with the fields to update.
 */
async function updateSectionInFirebase(sectionId, propertiesToUpdate) {
    if (!currentProjectId) return console.error("No project selected.");
    const sectionRef = doc(db, `projects/${currentProjectId}/sections`, sectionId);
    try {
        await updateDoc(sectionRef, propertiesToUpdate);
    } catch (error) {
        console.error(`Error updating section ${sectionId}:`, error);
    }
}

/**
 * Updates the project document, typically for managing custom columns.
 * @param {object} propertiesToUpdate An object with fields to update on the project.
 */
async function updateProjectInFirebase(propertiesToUpdate) {
    if (!currentProjectId) return console.error("No project selected.");
    const projectRef = doc(db, "projects", currentProjectId);
    try {
        await updateDoc(projectRef, propertiesToUpdate);
    } catch (error) {
        console.error("Error updating project properties:", error);
        alert("Error: Could not update project settings.");
    }
}

/**
 * Deletes a custom column and all its corresponding data across all tasks in the project.
 * @param {string} columnId The ID of the column to delete.
 */
async function deleteColumnInFirebase(columnId) {
    if (!currentProjectId) return console.error("No project selected.");
    if (!window.confirm('Are you sure you want to delete this column and all its data? This action cannot be undone.')) {
        return;
    }

    const batch = writeBatch(db);

    // 1. Update the project document to remove the column from the array
    const newColumnsArray = project.customColumns.filter(col => col.id !== columnId);
    const projectRef = doc(db, "projects", currentProjectId);
    batch.update(projectRef, { customColumns: newColumnsArray });

    // 2. Find all tasks in the project to remove the custom field key
    const tasksQuery = query(collection(db, "tasks"), where("projectId", "==", currentProjectId));
    try {
        const tasksSnapshot = await getDocs(tasksQuery);
        tasksSnapshot.forEach(taskDoc => {
            const taskRef = doc(db, "tasks", taskDoc.id);
            // Use deleteField() to remove the key from the map
            batch.update(taskRef, { [`customFields.${columnId}`]: deleteField() });
        });

        // 3. Commit the batch
        await batch.commit();
    } catch (error) {
        console.error("Error deleting column and its data:", error);
        alert("Error: Could not completely delete the column.");
    }
}


// --- REFACTORED UI-TRIGGERED FUNCTIONS ---

/**
 * Handles the "Add Section" button click.
 * Creates a new section with a default title and order.
 */
function addSectionBtnListener() {
    const newOrder = project.sections ? project.sections.length : 0;
    addSectionToFirebase({
        title: 'New Section',
        isCollapsed: false,
        order: newOrder
    });
};

/**
 * Creates a new task object and calls the Firebase function to add it.
 * @param {object} section The section object where the task should be added.
 */
function addNewTask(section) {
    const newTaskData = {
        name: '',
        dueDate: '',
        priority: 'Low',
        status: 'On track',
        assignees: [],
        customFields: {},
        isNew: true // This is a client-side flag, won't be saved in Firebase
    };
    // The 'isNew' property will be handled client-side on focus out.
    // Call the firebase function
    addTaskToFirebase(section.id, newTaskData);

    // No need to manipulate local state here, onSnapshot will do it.
    if (section.isCollapsed) {
        // We can, however, provide a better UX by expanding the section
        updateSectionInFirebase(section.id, { isCollapsed: false });
    }
}

/**
 * Handles edits to task names and custom fields on focus out.
 */
bodyFocusOutListener = (e) => {
    // ... (existing code for task name updates) ...
    if (e.target.matches('.task-name')) {
        // ...
        if (task.name !== newName) {
            // CALL FIREBASE UPDATE
            updateTaskInFirebase(taskId, { name: newName });
        }
    } else if (e.target.matches('[data-control="custom"]')) {
        // ... (existing code for parsing newValue) ...
        if (task.customFields[columnId] !== newValue) {
            // CALL FIREBASE UPDATE using dot notation for maps
            updateTaskInFirebase(taskId, { [`customFields.${columnId}`]: newValue });
        }
    } else if (e.target.matches('.section-title')) {
        // NEW: Handle section renaming
        const sectionEl = e.target.closest('.task-section');
        if (sectionEl) {
            const sectionId = sectionEl.dataset.sectionId;
            const newTitle = e.target.innerText.trim();
            const section = project.sections.find(s => s.id === sectionId);
            if (section && section.title !== newTitle) {
                updateSectionInFirebase(sectionId, { title: newTitle });
            }
        }
    }
};

/**
 * Handles all dropdown-based task updates.
 * @param {string} taskId The ID of the task to update.
 * @param {object} newProperties The properties to change.
 */
function updateTask(taskId, newProperties) {
    // This function now exclusively calls the Firebase update function.
    // No local state manipulation is needed.
    updateTaskInFirebase(taskId, newProperties);
}

/**
 * Moves a task to a different section by updating its sectionId field in Firebase.
 */
function moveTaskToSection(taskId, targetSectionId) {
    // Simply update the task's sectionId. onSnapshot will handle the rerender.
    updateTaskInFirebase(taskId, { sectionId: targetSectionId });
}

/**
 * Adds a new custom column by updating the project document in Firebase.
 * @param {object} config Configuration for the new column.
 */
function addNewColumn(config) {
    const newColumn = {
        id: Date.now(), // Using timestamp for simplicity, UUIDs are better in production
        name: config.name,
        type: config.type,
        currency: config.currency || null,
        aggregation: (config.type === 'Costing' || config.type === 'Numbers') ? 'Sum' : null,
        options: config.type === 'Type' ? typeColumnOptions : null
    };

    // Use Firestore's arrayUnion to safely add the new column object
    updateProjectInFirebase({
        customColumns: arrayUnion(newColumn)
    });
}

/**
 * Calls the Firebase function to delete a column.
 * @param {number} columnId The ID of the column to delete.
 */
function deleteColumn(columnId) {
    // The confirmation dialog is now inside the Firebase function
    deleteColumnInFirebase(columnId);
}