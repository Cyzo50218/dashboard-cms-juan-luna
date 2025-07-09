/**
 * emailModal.js
 *
 * This module exports a single function, showInviteModal, which displays a rich
 * modal for inviting people to projects. It is self-contained, handles its own
 * Firebase initialization, fetches project data from Firestore, and returns
 * the user's selections as a Promise. It now uses randomized Lucide icons for projects.
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy, where, collectionGroup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "/services/firebase-config.js";

// List of Lucide icons for a touch of visual variety.
const lucideProjectIcons = [
    'anchor', 'archive', 'award', 'axe', 'banknote', 'beaker', 'bell',
    'bomb', 'book', 'box', 'briefcase', 'building', 'camera', 'candy',
    'clapperboard', 'clipboard', 'cloud', 'compass', 'cpu', 'crown',
    'diamond', 'dice-5', 'drafting-compass', 'feather', 'flag', 'flame',
    'folder', 'gem', 'gift', 'graduation-cap', 'hammer', 'hard-hat',
    'heart-pulse', 'key-round', 'landmark', 'layers', 'leaf', 'lightbulb',
    'map', 'medal', 'mouse-pointer', 'package', 'palette', 'plane',
    'puzzle', 'rocket', 'shield', 'ship', 'sprout', 'star', 'swords',
    'ticket', 'tractor', 'trophy', 'umbrella', 'wallet', 'wrench'
];

/**
 * Safely initializes Firebase and returns the auth and db services.
 */
function getFirebaseServices() {
    const apps = getApps();
    const app = apps.length ? apps[0] : initializeApp(firebaseConfig);
    const db = getFirestore(app, "juanluna-cms-01");
    const auth = getAuth(app);
    return { app, auth, db };
}

/**
 * Injects the necessary CSS for the modal into the document's head.
 */
function injectModalStyles() {
    if (document.getElementById("inviteModalStyles")) return;
    const style = document.createElement("style");
    style.id = "inviteModalStyles";
    style.textContent = `
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
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 2000;
            display: flex;
            flex-direction: column;
            font-size: 14px;
        }
         .tag - color - dot {
         width: 10 px;
         height: 10 px;
         border - radius: 50 % ;
         margin - right: 8 px;
         flex - shrink: 0;
         border: 1 px solid rgba(0, 0, 0, 0.2);
     }
     
     .projectDropdown {
         position: absolute;
         background: rgba(55, 55, 55, 0.95);
         backdrop - filter: blur(10 px);
         border: 1 px solid rgba(255, 255, 255, 0.1);
         border - radius: 10 px;
         max - height: 200 px;
         overflow - y: auto;
         z - index: 2001;
         display: none;
     }
        .dropdown - color - dot {
            width: 12 px;
            height: 12 px;
            border - radius: 50 % ;
            margin - right: 10 px;
            flex - shrink: 0;
        }
        .modalContainer .headerSection { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .modalContainer .closeButton { cursor: pointer; font-size: 22px; color: #aaa; transition: color 0.2s ease; }
        .modalContainer .closeButton:hover { color: #fff; }
        .modalContainer .inputGroup { margin-bottom: 18px; }
        .modalContainer .inputGroup label { display: block; margin-bottom: 6px; color: #ccc; font-weight: 500; }
        .modalContainer .tagInputContainer { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; align-items: flex-start; }
        .modalContainer .emailTagInputContainer { min-height: 80px; }
        .modalContainer .projectTagInputContainer { min-height: 40px; }
        .modalContainer .tag { display: flex; align-items: center; padding: 6px 12px; background: rgba(255, 255, 255, 0.15); border-radius: 20px; color: #e0e0e0; font-size: 14px; }
        .modalContainer .tag svg { margin-right: 8px; color: #ddd; }
        .modalContainer .tag .removeTag { margin-left: 8px; cursor: pointer; font-size: 16px; color: #ccc; }
        .modalContainer .tag .removeTag:hover { color: #fff; }
        .modalContainer .inputField { flex-grow: 1; background: transparent; border: none; color: #fff; font-size: 15px; outline: none; min-width: 150px; resize: none; padding: 4px; }
        .modalContainer .sendButton { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); padding: 12px 24px; color: #fff; border-radius: 16px; cursor: pointer; font-weight: 600; float: right; transition: background 0.3s ease; margin-top: 20px; }
        .modalContainer .sendButton:hover { background: rgba(255, 255, 255, 0.2); }
        .projectDropdown { position: fixed; background: rgba(45, 45, 45, 0.95); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; max-height: 200px; overflow-y: auto; z-index: 2001; display: none; }
        .projectDropdown-item { display: flex; align-items: center; padding: 10px 15px; cursor: pointer; transition: background 0.2s ease; color: #f1f1f1;}
        .projectDropdown-item:hover { background: rgba(255, 255, 255, 0.1); }
        .projectDropdown-item svg { margin-right: 10px; color: #ddd; }
    `;
    document.head.appendChild(style);
}

/**
 * Checks for the Lucide library and renders icons.
 */
function renderLucideIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons({
            attrs: {
                'stroke-width': 1.5,
                width: 16,
                height: 16
            }
        });
    } else {
        console.warn("Lucide library not found. Icons will not be rendered.");
    }
}


/**
 * Opens a modal for inviting users and adding them to projects.
 * @returns {Promise<object|null>} A Promise that resolves with { emails, projects } or null if closed.
 */
export async function showInviteModal() {
    const { auth, db } = getFirebaseServices();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
        alert("Authentication required to invite people.");
        return null;
    }
    
    if (document.querySelector('.modalContainer')) return null;
    
    let projectDataModel = [];
    try {
        const projectsQuery = query(
            collectionGroup(db, 'projects'),
            where('memberUIDs', 'array-contains', currentUser.uid),
            orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(projectsQuery);
        projectDataModel = snapshot.docs.map(doc => {
    const randomIndex = Math.floor(Math.random() * lucideProjectIcons.length);
    return {
        id: doc.id,
        title: doc.data().title || "Untitled Project",
        icon: lucideProjectIcons[randomIndex],
        color: doc.data().color || '#808080'
    };
});
    } catch (error) {
        console.error("Could not fetch projects for modal:", error);
    }
    
    return new Promise((resolve) => {
        injectModalStyles();
        
        const modal = document.createElement('div');
        modal.className = 'modalContainer';
        modal.innerHTML = `
            <div class="headerSection">
                <h2>Invite people to My workspace</h2>
                <span class="closeButton" title="Close">×</span>
            </div>
            <div class="inputGroup">
                <label>Email addresses</label>
                <div class="tagInputContainer emailTagInputContainer">
                    <textarea id="emailInputField" class="inputField" placeholder="name@gmail.com, name@example.com, ..."></textarea>
                </div>
            </div>
            <div class="inputGroup">
                <label>Add to projects</label>
                <div class="tagInputContainer projectTagInputContainer">
                    <textarea id="projectInputField" class="inputField" placeholder="Start typing to add projects..."></textarea>
                </div>
            </div>
            <button class="sendButton">Send</button>
        `;
        document.body.appendChild(modal);
        
        const projectDropdown = document.createElement('div');
        projectDropdown.className = 'projectDropdown';
        document.body.appendChild(projectDropdown);
        
        const emailInputField = modal.querySelector('#emailInputField');
        const emailTagInputContainer = modal.querySelector('.emailTagInputContainer');
        const projectInputField = modal.querySelector('#projectInputField');
        const projectTagInputContainer = modal.querySelector('.projectTagInputContainer');
        
        const addTag = (container, details) => {
    const { text, icon, color } = details;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.dataset.value = text;
    
    // Conditionally add color dot for projects
    const colorDot = color ? `<span class="tag-color-dot" style="background-color: ${color};"></span>` : '';
    
    tag.innerHTML = `${colorDot}<i data-lucide="${icon}"></i> ${text} <span class="removeTag" title="Remove">×</span>`;
    
    container.insertBefore(tag, container.querySelector('.inputField'));
    tag.querySelector('.removeTag').addEventListener('click', () => tag.remove());
    renderLucideIcons();
};

const positionProjectDropdown = () => {
    if (projectDropdown.style.display === 'block') {
        const rect = projectTagInputContainer.getBoundingClientRect();
        projectDropdown.style.top = `${window.scrollY + rect.bottom + 5}px`;
        projectDropdown.style.left = `${window.scrollX + rect.left}px`;
        projectDropdown.style.width = `${rect.width}px`;
    }
};
        const cleanupAndResolve = (value) => {
            window.removeEventListener('resize', positionProjectDropdown);
            window.removeEventListener('scroll', positionProjectDropdown, true);
            projectDropdown.remove();
            modal.remove();
            resolve(value);
        }
        
        // --- Event Listeners ---
        emailInputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                e.preventDefault();
                const email = emailInputField.value.trim();
                if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    addTag(emailTagInputContainer, email, 'user-circle-2');
                    emailInputField.value = '';
                }
            }
        });
        
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
                    item.innerHTML = `
                        <span class="dropdown-color-dot" style="background-color: ${project.color};"></span>
                        <i data-lucide="${project.icon}"></i>
                        <span>${project.title}</span>`;
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
                renderLucideIcons(); // Render icons in the dropdown
            } else {
                projectDropdown.style.display = 'none';
            }
        });
        
        document.addEventListener('click', (event) => {
    if (!projectInputField.contains(event.target) && !projectDropdown.contains(event.target)) {
        projectDropdown.style.display = 'none';
    }
});

modal.querySelector('.closeButton').addEventListener('click', () => cleanupAndResolve(null));

modal.querySelector('.sendButton').addEventListener('click', () => {
    const emails = Array.from(emailTagInputContainer.querySelectorAll('.tag')).map(tag => tag.dataset.value);
    const projects = Array.from(projectTagInputContainer.querySelectorAll('.tag')).map(tag => tag.dataset.value);
    
    if (emails.length === 0) {
        return alert('Please enter at least one email address to invite.');
    }
    
    cleanupAndResolve({ emails, projects });
});

window.addEventListener('resize', positionProjectDropdown);
window.addEventListener('scroll', positionProjectDropdown, true);
});
}