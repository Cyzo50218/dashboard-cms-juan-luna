/**
 * emailModal.js
 *
 * This module exports a single function, showInviteModal, which displays a rich
 * modal for inviting people to projects. It is self-contained, handles its own
 * Firebase initialization, fetches project data from Firestore, and returns
 * the user's selections as a Promise. It now uses randomized Lucide icons for projects.
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, collection, getDocs, query, orderBy, where, collectionGroup,
    doc, getDoc, updateDoc, writeBatch, arrayUnion, arrayRemove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "/services/firebase-config.js";
import {
    getFunctions,
    httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);
const sendEmailInvitation = httpsCallable(functions, "sendEmailInvitation");
const sendShareExistingProjectInvitation = httpsCallable(functions, "sendShareExistingProjectInvitation");
const sendEmailWorkspaceInvitation = httpsCallable(functions, "sendEmailWorkspaceInvitation");

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
        .modalContainer .headerSection { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .modalContainer .closeButton { cursor: pointer; font-size: 22px; color: #aaa; transition: color 0.2s ease; }
        .modalContainer .closeButton:hover { color: #fff; }
        .modalContainer .inputGroup { margin-bottom: 18px; }
        .modalContainer .inputGroup label { display: block; margin-bottom: 6px; color: #ccc; font-weight: 500; }
        .modalContainer .sendButton { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); padding: 12px 24px; color: #fff; border-radius: 16px; cursor: pointer; font-weight: 600; float: right; transition: background 0.3s ease; margin-top: 20px; }
        .modalContainer .sendButton:hover { background: rgba(255, 255, 255, 0.2); }
        .modalContainer .tagInputContainer { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; align-items: flex-start; }
        .modalContainer .emailTagInputContainer,
        .modalContainer .projectTagInputContainer { min-height: 10px; }
        .modalContainer .inputField { flex-grow: 1; background: transparent; border: none; color: #fff; font-size: 15px; outline: none; min-width: 150px; resize: none; padding: 4px; }
        .modalContainer .tag { display: flex; align-items: center; padding: 6px 12px; background: rgba(255, 255, 255, 0.15); border-radius: 20px; color: #e0e0e0; font-size: 14px; }
        .modalContainer .tag svg { margin-right: 8px; color: #ddd; }
        .modalContainer .tag .removeTag { margin-left: 8px; cursor: pointer; font-size: 16px; color: #ccc; }
        .modalContainer .tag .removeTag:hover { color: #fff; }
        .projectDropdown,
        .emailDropdown {
            position: absolute;
            background: rgba(55, 55, 55, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 2001;
            display: none;
        }
        .projectDropdown-item,
        .emailDropdown-item {
            display: flex;
            align-items: center;
            padding: 10px 15px;
            cursor: pointer;
            transition: background 0.2s ease;
            color: #f1f1f1;
        }
        .projectDropdown-item:hover,
        .emailDropdown-item:hover { background: rgba(255, 255, 255, 0.1); }
        .projectDropdown-item svg,
        .emailDropdown-item svg { margin-right: 10px; color: #ddd; }
        .emailDropdown-item img {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            margin-right: 12px;
            object-fit: cover;
        }
        .emailDropdown-item .user-details {
            display: flex;
            flex-direction: column;
        }
        .emailDropdown-item .user-details .name {
            font-weight: 500;
        }
        .emailDropdown-item .user-details .email {
            font-size: 12px;
            color: #aaa;
        }
        .tag-avatar {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            margin-right: 8px;
            object-fit: cover;
        }
        .tag-color-dot,
        .dropdown-color-dot {
            height: 12px;
            width: 12px;
            border-radius: 50%;
            margin-right: 10px;
            flex-shrink: 0;
            border: 1px solid rgba(0, 0, 0, 0.2);
        }
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

function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    let c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs((h / 60) % 2 - 1)),
        m = l - c / 2,
        r = 0,
        g = 0,
        b = 0;
    if (0 <= h && h < 60) {
        r = c;
        g = x;
        b = 0;
    }
    else if (60 <= h && h < 120) {
        r = x;
        g = c;
        b = 0;
    }
    else if (120 <= h && h < 180) {
        r = 0;
        g = c;
        b = x;
    }
    else if (180 <= h && h < 240) {
        r = 0;
        g = x;
        b = c;
    }
    else if (240 <= h && h < 300) {
        r = x;
        g = 0;
        b = c;
    }
    else if (300 <= h && h < 360) {
        r = c;
        g = 0;
        b = x;
    }
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    return [r, g, b];
}

function hslToHex(h, s, l) {
    const [r, g, b] = hslToRgb(h, s, l);
    const toHex = (c) => {
        const hex = c.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
    let userDataModel = [];
    let userProfilesMap = {};
    try {
        const projectsQuery = query(
            collectionGroup(db, 'projects'),
            where('memberUIDs', 'array-contains', currentUser.uid),
            orderBy("createdAt", "desc")
        );
        const roleKeys = ["Project Admin", "Project Owner Admin", "Editor"].map(
            role => `${currentUser.uid}:${role}`
        );

        const projectsKnownQuery = query(
            collectionGroup(db, 'projects'),
            where("memberRoleKeys", "array-contains-any", roleKeys)
        );
        const projectSnapshot = await getDocs(projectsKnownQuery);
        const projectMembersSnapshot = await getDocs(projectsQuery);
        projectDataModel = projectSnapshot.docs.map(doc => {
            const randomIndex = Math.floor(Math.random() * lucideProjectIcons.length);
            const colorData = doc.data().color;
            let finalHexColor = '#808080'; // Set a default fallback color
            const matches = colorData.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (matches) {
                const h = parseInt(matches[1], 10);
                const s = parseInt(matches[2], 10);
                const l = parseInt(matches[3], 10);
                finalHexColor = hslToHex(h, s, l);
            }
            return {
                id: doc.id,
                path: doc.ref.path,
                title: doc.data().title || "Untitled Project",
                icon: lucideProjectIcons[randomIndex],
                color: finalHexColor
            };
        });

        const memberUIDs = new Set();
        projectMembersSnapshot.docs.forEach(doc => {
            doc.data().memberUIDs?.forEach(uid => memberUIDs.add(uid));
        });

        if (memberUIDs.size > 0) {
            const userDocs = await getDocs(query(collection(db, 'users'), where('__name__', 'in', Array.from(memberUIDs))));
            userDataModel = userDocs.docs.map(doc => {
                const data = {
                    uid: doc.id,
                    name: doc.data().name || 'Unknown User',
                    email: doc.data().email,
                    avatar: doc.data().avatarUrl || null
                };
                userProfilesMap[doc.id] = data;
                return data;
            });
        }
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

        const emailDropdown = document.createElement('div');
        emailDropdown.className = 'emailDropdown';
        document.body.appendChild(emailDropdown);

        const projectDropdown = document.createElement('div');
        projectDropdown.className = 'projectDropdown';
        document.body.appendChild(projectDropdown);

        const emailInputField = modal.querySelector('#emailInputField');
        const emailTagInputContainer = modal.querySelector('.emailTagInputContainer');
        const projectInputField = modal.querySelector('#projectInputField');
        const projectTagInputContainer = modal.querySelector('.projectTagInputContainer');

        const addTag = (container, details) => {
            const { id, path, text, icon, color, avatar } = details;
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.dataset.value = text;
            if (id) tag.dataset.id = id;
            if (path) tag.dataset.path = path;

            const colorDot = color ? `<span class="tag-color-dot" style="background-color: ${color};"></span>` : '';
            const iconOrAvatar = avatar ?
                `<img src="${avatar}" class="tag-avatar" />` :
                `<i data-lucide="${icon || 'user-circle-2'}"></i>`;

            tag.innerHTML = `${colorDot}${iconOrAvatar} ${text} <span class="removeTag" title="Remove">×</span>`;

            container.insertBefore(tag, container.querySelector('.inputField'));
            tag.querySelector('.removeTag').addEventListener('click', () => tag.remove());
            renderLucideIcons();
        };

        const positionEmailDropdown = () => {
            if (emailDropdown.style.display === 'block') {
                const rect = emailTagInputContainer.getBoundingClientRect();
                emailDropdown.style.top = `${window.scrollY + rect.bottom + 5}px`;
                emailDropdown.style.left = `${window.scrollX + rect.left}px`;
                emailDropdown.style.width = `${rect.width}px`;
            }
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
            emailDropdown.remove();
            modal.remove();
            resolve(value);
        }

        // --- Event Listeners ---
        emailInputField.addEventListener('input', () => {
            const query = emailInputField.value.trim().toLowerCase();
            emailDropdown.innerHTML = '';

            if (!query) {
                emailDropdown.style.display = 'none';
                return;
            }

            const existingEmails = new Set(Array.from(emailTagInputContainer.querySelectorAll('.tag')).map(tag => tag.dataset.value.toLowerCase()));
            const filteredUsers = userDataModel.filter(user =>
                !existingEmails.has(user.email.toLowerCase()) &&
                (user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query))
            );

            if (filteredUsers.length > 0) {
                filteredUsers.forEach(user => {
                    const item = document.createElement('div');
                    item.className = 'emailDropdown-item';
                    const avatarImg = user.avatar ?
                        `<img src="${user.avatar}" alt="${user.name}">` :
                        `<i data-lucide="user-circle-2"></i>`;

                    item.innerHTML = `
                        ${avatarImg}
                        <div class="user-details">
                            <span class="name">${user.name}</span>
                            <span class="email">${user.email}</span>
                        </div>
                    `;
                    item.onclick = () => {
                        addTag(emailTagInputContainer, { text: user.email, avatar: user.avatar });
                        emailInputField.value = '';
                        emailDropdown.style.display = 'none';
                        emailInputField.focus();
                    };
                    emailDropdown.appendChild(item);
                });
                emailDropdown.style.display = 'block';
                positionEmailDropdown();
                renderLucideIcons();
            } else {
                emailDropdown.style.display = 'none';
            }
        });

        emailInputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                // Only add tag if dropdown is not active or there's no exact match
                if (emailDropdown.style.display === 'none') {
                    e.preventDefault();
                    const email = emailInputField.value.trim();
                    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        addTag(emailTagInputContainer, { text: email });
                        emailInputField.value = '';
                    }
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
                        addTag(projectTagInputContainer, {
                            id: project.id,
                            path: project.path,
                            text: project.title,
                            icon: project.icon,
                            color: project.color
                        });
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
            if (!emailInputField.contains(event.target) && !emailDropdown.contains(event.target)) {
                emailDropdown.style.display = 'none';
            }
        });

        modal.querySelector('.closeButton').addEventListener('click', () => cleanupAndResolve(null));

        modal.querySelector('.sendButton').addEventListener('click', async () => {
            const sendButton = modal.querySelector('.sendButton');
            const emails = Array.from(emailTagInputContainer.querySelectorAll('.tag')).map(tag => tag.dataset.value);

            // Collect project IDs and titles directly from the tags' dataset
            const selectedProjects = Array.from(projectTagInputContainer.querySelectorAll('.tag')).map(tag => ({
                id: tag.dataset.id,
                path: tag.dataset.path,
                title: tag.dataset.value
            }));

            if (emails.length === 0) {
                return alert('Please enter at least one email address.');
            }

            const originalBtnText = sendButton.textContent;
            sendButton.disabled = true;
            sendButton.textContent = "Processing...";

            try {
                // Delegate all the complex work to the new processing function
                if (selectedProjects.length > 0) {
                    // SCENARIO 1: Projects ARE selected. Run the detailed project invite process.
                    await processInvites(emails, selectedProjects);
                } else {
                    // SCENARIO 2: NO projects selected. Run the workspace-only invite process.
                    await sendEmailInvitationMyWorkspace(emails);
                }

                cleanupAndResolve(null);

            } catch (e) {
                console.error("An error occurred during the invitation process:", e);
                alert("An unexpected error occurred. Please check the console and try again.");
            } finally {
                sendButton.disabled = false;
                sendButton.textContent = originalBtnText;
            }
        });

        function stringToNumericString(str) {
            if (!str) return '';
            return str.split('').map(char => char.charCodeAt(0)).join('');
        }
        async function getTotalTaskCount(projectId) {
    try {
        // 1. Create a query across the 'tasks' collection group
        const tasksQuery = query(
            collectionGroup(db, 'tasks'),
            where('projectId', '==', projectId) // Filter for the specific project
        );

        // 2. Get the count of documents matching the query
        const tasksSnapshot = await getCount(tasksQuery);
        const totalTasks = tasksSnapshot.data().count;

        console.log(`[Task Count] Found ${totalTasks} tasks for project ${projectId}`);
        return totalTasks;

    } catch (error) {
        console.error(`[Task Count] Failed to get task count for project ${projectId}:`, error);
        return 0; // Return 0 if there's an error
    }
}

        async function processInvites(emails, selectedProjects) {
            const { auth, db } = getFirebaseServices();
            const currentUser = auth.currentUser;
            const batch = writeBatch(db);
            const defaultRole = "Editor";
            let changesMade = 0;
            const failedInvites = [];

            for (const project of selectedProjects) {
                if (!project.path) {
                    console.warn(`Project "${project.title}" is missing a path. Skipping.`);
                    continue;
                }

                // This is now the correct, direct way to get the document reference
                const projectRef = doc(db, project.path);
                const projectSnap = await getDoc(projectRef);

                if (!projectSnap.exists()) {
                    console.warn(`Project at path ${project.path} not found. Skipping.`);
                    continue;
                }

                const projectData = projectSnap.data();

                // The inner loop for emails remains the same
                for (const email of emails) {
                    const existingUserUID = Object.keys(userProfilesMap).find(
                        (uid) => userProfilesMap[uid]?.email === email
                    );

                    if (existingUserUID) {
                        const isAlreadyMember = projectData.members?.some(m => m.uid === existingUserUID);
                        const numericUserId = stringToNumericString(currentUser.uid);
                        const numericProjectId = stringToNumericString(projectData.projectId);
                        const invitationUrl = `https://cms.juanlunacollections.com/tasks/${numericUserId}/list/${numericProjectId}?viewProject=true`; // Replace with your actual URL
                        const totalTasks = await getTotalTaskCount(projectData.projectId);

                        try {
                        // 1. Prepare the payload with the data needed for the email template.
                        const membersForEmail = (projectData.memberUIDs || []).map(uid => ({
                            avatarUrl: userProfilesMap[uid]?.avatar || null
                        }));
                        const inviterProfile = userProfilesMap[currentUser.uid];

                        const payload = {
                            email: email,
                            projectName: projectData.title,
                            invitationUrl: invitationUrl,
                            totalTasks: projectData.tasks?.length || 0,
                            totalTasks: totalTasks,
                            members: membersForEmail,
                            inviterName: inviterProfile?.name, 
                            inviterProfileUrl: inviterProfile?.avatar
                        };
                        
                        await sendShareExistingProjectInvitation(payload);
                        changesMade++;

                    } catch (e) {
                        console.error(`Failed to send share notification to ${email}:`, e);
                        failedInvites.push(email);
                    }
                    } else {
                        // This is a brand new user not in the workspace/projects. Send an invite.
                        const lowerEmail = email.toLowerCase(); // Use a lowercase version for consistency
                        const isAlreadyPending = projectData.pendingInvites?.some(p => p.email.toLowerCase() === lowerEmail);

                        if (!isAlreadyPending) {
                            try {
                                const newInvitationRef = doc(collection(db, "InvitedProjects"));
                                const invitationId = newInvitationRef.id;
                                const invitationUrl = `https://cms.juanlunacollections.com/invitation/${invitationId}`;

                                await sendEmailInvitation({
                                    email: lowerEmail,
                                    projectName: projectData.title,
                                    invitationUrl: invitationUrl,
                                });

                                const inviterProfile = userProfilesMap[currentUser.uid];
                                const mainInviteData = {
                                    invitationId: invitationId,
                                    projectId: projectRef.id,
                                    projectName: projectData.title || "Unnamed Project",
                                    invitedEmail: lowerEmail,
                                    role: defaultRole,
                                    status: "pending",
                                    invitedBy: {
                                        uid: currentUser.uid,
                                        name: inviterProfile?.name || "Workspace Owner",
                                        email: inviterProfile?.email || currentUser.email // Fallback just in case
                                    },
                                    invitedAt: serverTimestamp()
                                };

                                const pendingInviteMarker = {
                                    email: lowerEmail,
                                    role: defaultRole,
                                    invitationId: invitationId,
                                    invitedAt: new Date()
                                };

                                batch.set(newInvitationRef, mainInviteData);
                                batch.update(projectRef, { pendingInvites: arrayUnion(pendingInviteMarker) });
                                changesMade++;

                            } catch (e) {
                                failedInvites.push(email);
                            }
                        }
                    }
                }
            }

            if (changesMade > 0) {
                await batch.commit();
                alert("Successfully sent invitations.");
            } else {
                alert("No new changes were needed. The selected users are already members or have pending invitations.");
            }

            if (failedInvites.length > 0) {
                alert(`Failed to send invitations to: ${failedInvites.join(", ")}`);
            }
        }

        async function sendEmailInvitationMyWorkspace(emails) {
    const { auth, db } = getFirebaseServices();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
        alert("Authentication error. Cannot send workspace invitations.");
        return;
    }
    
    try {
        // --- Step 1: Get All Necessary Document References ---
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists() || !userSnap.data().selectedWorkspace) {
            throw new Error("Could not find the user's selected workspace.");
        }
        
        const workspaceId = userSnap.data().selectedWorkspace;
        const workspaceRef = doc(db, `users/${currentUser.uid}/myworkspace`, workspaceId);
        const workspaceSnap = await getDoc(workspaceRef);
        const workspaceName = workspaceSnap.exists() ? workspaceSnap.data().name : "your workspace";
        
        // --- Step 2: Prepare a Batched Write ---
        const batch = writeBatch(db);
        const successfulInvites = [];
        const failedInvites = [];
        
        // --- Step 3: Loop Through Emails and Queue Operations ---
        for (const email of emails) {
            try {
                let recipientName = null;
                let avatarUrl = null;
                const usersCollectionRef = collection(db, 'users');
                const q = query(usersCollectionRef, where("email", "==", email));
                const querySnapshot = await getDocs(q);
                
                if (!querySnapshot.empty) {
                    // A user with this email was found
                    const foundUserDoc = querySnapshot.docs[0]; // Get the first match
                    const foundUserData = foundUserDoc.data();
                    recipientName = foundUserData.name || null; // Use their display name
                    avatarUrl = foundUserData.avatar || null; // Use their photo URL
                }
                
                // Generate a new, unique ID for the invitation
                const newInviteRef = doc(collection(db, "InvitedWorkspaces"));
                const invitationId = newInviteRef.id;
                
                const inviteData = {
                    invitationId: invitationId,
                    invitedEmail: email,
                    workspaceId: workspaceId,
                    workspaceRefPath: workspaceRef.path,
                    status: "pending",
                    invitedBy: {
                        uid: currentUser.uid,
                        email: currentUser.email,
                        name: currentUser.displayName || "Workspace Owner"
                    },
                    invitedAt: serverTimestamp()
                };
                batch.set(newInviteRef, inviteData);
              const pendingInviteData = {
                    email: email,
                    invitationId: invitationId,
                    workspaceId: workspaceId,
                    invitedAt: new Date()
                };
                batch.update(userRef, {
                    workspacePendingInvites: arrayUnion(pendingInviteData)
                });
                
                // Operation 3: Send the actual email (this happens outside the batch)
                const invitationUrl = `https://cms.juanlunacollections.com/workspace-invite/${invitationId}`;
                await sendEmailWorkspaceInvitation({
                    email: email,
                    workspaceName: workspaceName,
                    recipientName: recipientName,
                    avatarUrl: avatarUrl,
                    inviterName: currentUser.displayName,
                    invitationUrl: invitationUrl
                });
                
                successfulInvites.push(email);
                
            } catch (error) {
                console.error(`Failed to process invitation for ${email}:`, error);
                failedInvites.push(email);
            }
        }
        
        // --- Step 4: Commit allz the queued database operations at once ---
        if (successfulInvites.length > 0) {
            await batch.commit();
            alert(`Successfully sent workspace invitations to ${successfulInvites.length} user(s).`);
        }
        if (failedInvites.length > 0) {
            alert(`Failed to send invitations to: ${failedInvites.join(", ")}.`);
        }
        
    } catch (error) {
        console.error("An error occurred during the invitation process:", error);
        alert("Could not process invitations. Please check the console and try again.");
    }
}

        window.addEventListener('resize', positionProjectDropdown);
        window.addEventListener('scroll', positionProjectDropdown, true);
    });
}