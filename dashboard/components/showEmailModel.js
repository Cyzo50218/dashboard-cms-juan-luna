/**
 * emailModal.js
 *
 * This module exports a single function, showInviteModal, which displays a rich
 * modal for inviting people to projects. It fetches project data from Firestore
 * and returns the user's selections as a Promise.
 */

import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

function injectModalStyles() {
    if (document.getElementById("modalStyles")) return;
    const style = document.createElement("style");
    style.id = "modalStyles";
    style.textContent = `
        /* --- All the CSS you provided --- */
        .modalContainer {
            background: rgba(45, 45, 45, 0.6);
            backdrop-filter: blur(20px) saturate(150%);
            -webkit-backdrop-filter: blur(20px) saturate(150%);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 24px;
            border-radius: 20px;
            width: 650px;
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
        /* ... all other styles from your example ... */
        .headerSection { justify-content: space-between; align-items: center; margin-bottom: 20px; display: flex; }
        .closeButton { cursor: pointer; font-size: 22px; color: #aaa; transition: color 0.2s ease; }
        .closeButton:hover { color: #fff; }
        .inputGroup { margin-bottom: 18px; }
        .inputGroup label { display: block; margin-bottom: 6px; color: #ccc; font-weight: 500; }
        .tagInputContainer { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; align-items: flex-start; }
        .emailTagInputContainer { min-height: 80px; }
        .projectTagInputContainer { min-height: 40px; height: auto; overflow-y: auto; }
        .tag { display: flex; align-items: center; padding: 6px 12px; background: rgba(255, 255, 255, 0.15); border-radius: 20px; color: #e0e0e0; font-size: 14px; }
        .tag .removeTag { margin-left: 6px; cursor: pointer; font-size: 16px; color: #ccc; }
        .tag .removeTag:hover { color: #fff; }
        .inputField { flex-grow: 1; background: transparent; border: none; color: #fff; font-size: 15px; outline: none; min-width: 50px; resize: none; padding: 4px; }
        .projectDropdown { position: fixed; background: rgba(45, 45, 45, 0.95); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; max-height: 200px; overflow-y: auto; z-index: 1001; display: none; }
        .projectDropdown-item { display: flex; align-items: center; padding: 10px 15px; cursor: pointer; transition: background 0.2s ease; }
        .projectDropdown-item:hover { background: rgba(255, 255, 255, 0.1); }
        .projectDropdown-item .bx { margin-right: 10px; font-size: 18px; }
        .sendButton { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); padding: 12px 24px; color: #fff; border-radius: 16px; cursor: pointer; font-weight: 600; float: right; transition: background 0.3s ease; margin-top: 20px; }
        .sendButton:hover { background: rgba(255, 255, 255, 0.2); }
    `;
    document.head.appendChild(style);
}

/**
 * Opens a modal for inviting users and adding them to projects.
 * Fetches project data from Firestore.
 * @param {object} firebaseApp - The initialized Firebase app instance.
 * @returns {Promise<object|null>} A Promise that resolves with { emails, projects } or null if closed.
 */
export async function openEmailSelector(firebaseApp) {
    const db = getFirestore(firebaseApp, "juanluna-cms-01");
    const auth = getAuth(firebaseApp);
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
        alert("Authentication required.");
        return null;
    }
    
    // --- Fetch Project Data From Firestore ---
    let projectDataModel = [];
    try {
        const projectsQuery = query(collection(db, `users/${currentUser.uid}/projects`), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(projectsQuery);
        projectDataModel = snapshot.docs.map(doc => ({
            id: doc.id,
            title: doc.data().title, // Using 'title' for consistency
            icon: "bx-folder-open" // Default icon
        }));
    } catch (error) {
        console.error("Could not fetch projects for modal:", error);
    }
    
    // --- Main Promise ---
    return new Promise((resolve) => {
        injectModalStyles();
        if (document.querySelector('.modalContainer')) return resolve(null); // Prevent multiple modals
        
        const modal = document.createElement('div');
        modal.className = 'modalContainer';
        modal.innerHTML = `
            <div class="headerSection">
                <h2>Invite people to My workspace</h2>
                <span class="closeButton">×</span>
            </div>
            <div class="inputGroup">
                <label>Email addresses <i class='bx bx-info-circle'></i></label>
                <div class="tagInputContainer emailTagInputContainer" id="emailTagInputContainer">
                    <textarea id="emailInputField" class="inputField" placeholder="name@gmail.com, name@gmail.com, ..."></textarea>
                </div>
            </div>
            <div class="inputGroup">
                <label>Add to projects <i class='bx bx-info-circle'></i></label>
                <div class="tagInputContainer projectTagInputContainer" id="projectTagInputContainer">
                    <textarea id="projectInputField" class="inputField" placeholder="Start typing to add projects"></textarea>
                </div>
            </div>
            <button class="sendButton">Send</button>
        `;
        document.body.appendChild(modal);
        
        const projectDropdown = document.createElement('div');
        projectDropdown.className = 'projectDropdown';
        document.body.appendChild(projectDropdown);
        
        const emailInputField = modal.querySelector('#emailInputField');
        const emailTagInputContainer = modal.querySelector('#emailTagInputContainer');
        const projectInputField = modal.querySelector('#projectInputField');
        const projectTagInputContainer = modal.querySelector('#projectTagInputContainer');
        
        const cleanup = () => {
            modal.remove();
            projectDropdown.remove();
            window.removeEventListener('resize', positionProjectDropdown);
            window.removeEventListener('scroll', positionProjectDropdown, true);
        };
        
        const addTag = (container, text, iconClass) => { /* Logic from your function */ };
        const positionProjectDropdown = () => { /* Logic from your function */ };
        
        // --- Event Listeners from your function ---
        projectInputField.addEventListener('input', () => {
            const query = projectInputField.value.trim().toLowerCase();
            projectDropdown.innerHTML = '';
            if (!query) {
                projectDropdown.style.display = 'none';
                return;
            }
            
            const existingProjects = new Set(Array.from(projectTagInputContainer.querySelectorAll('.tag')).map(tag => tag.dataset.value.toLowerCase()));
            const filteredProjects = projectDataModel.filter(p => p.title.toLowerCase().includes(query) && !existingProjects.has(p.title.toLowerCase()));
            
            if (filteredProjects.length > 0) {
                filteredProjects.forEach(project => {
                    const item = document.createElement('div');
                    item.className = 'projectDropdown-item';
                    item.innerHTML = `<i class='bx ${project.icon}'></i> <span>${project.title}</span>`;
                    item.onclick = () => {
                        addTag(projectTagInputContainer, project.title, project.icon);
                        projectInputField.value = '';
                        projectDropdown.style.display = 'none';
                        projectInputField.focus();
                    };
                    projectDropdown.appendChild(item);
                });
                projectDropdown.style.display = 'block';
                positionProjectDropdown();
            } else {
                projectDropdown.style.display = 'none';
            }
        });
        
        modal.querySelector('.closeButton').addEventListener('click', () => {
            cleanup();
            resolve(null); // Resolve with null when closed
        });
        
        modal.querySelector('.sendButton').addEventListener('click', () => {
            const emails = Array.from(emailTagInputContainer.querySelectorAll('.tag')).map(tag => tag.dataset.value);
            const projects = Array.from(projectTagInputContainer.querySelectorAll('.tag')).map(tag => tag.dataset.value);
            
            if (emails.length === 0 && projects.length === 0) {
                return alert('Please enter at least one email or project.');
            }
            
            cleanup();
            resolve({ emails, projects }); // Resolve with the collected data
        });
        
        // Add other listeners from your function (focus, resize, scroll, etc.)
        window.addEventListener('resize', positionProjectDropdown);
        window.addEventListener('scroll', positionProjectDropdown, true);
    });
}