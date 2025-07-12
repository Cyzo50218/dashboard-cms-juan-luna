import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
const functions = getFunctions(app);
console.log("Firebase services initialized.");

// --- Global State ---
let allUsersData = [];

// --- UI Elements ---
const dashboardContainer = document.getElementById('dashboard-container');
const accessDeniedContainer = document.getElementById('access-denied-container');
const userProfileAvatar = document.getElementById('user-profile-avatar');
const userProfileName = document.querySelector('.user-name');
const dashboardUserListContent = document.getElementById('dashboard-user-list-content');
const userCardsContainer = document.getElementById('user-cards-container');
const workspacesContainer = document.getElementById('workspaces-container');
const userSelectForRole = document.getElementById('user-select-role');
const newRoleSelect = document.getElementById('new-role-select');
const changeRoleBtn = document.getElementById('change-role-btn');
const deleteUserSelect = document.getElementById('delete-user-select');
const deleteUserBtn = document.getElementById('delete-user-btn');
const banUserSelect = document.getElementById('ban-user-select');
const banUserBtn = document.getElementById('ban-user-btn');


// --- THEME SWITCHER LOGIC (remains the same) ---
const themeToggle = document.getElementById('theme-toggle');
const applyStoredTheme = () => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.checked = true;
    }
};
themeToggle.addEventListener('change', () => {
    if (themeToggle.checked) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    }
});
applyStoredTheme();

// --- Role Mapping (remains the same) ---
const roleMap = {
    3: { text: 'Admin', className: 'admin' },
    2: { text: 'Guest', className: 'guest' },
    1: { text: 'User', className: 'user' },
    0: { text: 'Developer', className: 'developer' }
};

// --- AUTHENTICATION & ACCESS CONTROL ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is logged in, now check their role in Firestore
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            if (userData.isBanned === true) {
                handleAccessDenied("This account has been suspended.");
                return; // Stop execution immediately
            }

            const userRole = userData.role;

            // Check if the role is Admin (3) or Developer (0)
            if (userRole === 3 || userRole === 0) {
                // --- ACCESS GRANTED ---
                dashboardContainer.classList.remove('hidden');
                accessDeniedContainer.classList.add('hidden');

                // Update the sidebar profile with user's name and avatar
                userProfileName.textContent = userData.name || user.email;
                userProfileAvatar.src = userData.avatar || 'https://via.placeholder.com/40';

                setupRealtimeListener();

                setupNavigation();
            } else {
                // --- ACCESS DENIED ---
                handleAccessDenied();
            }
        } else {
            // User document doesn't exist, treat as an error/denial
            console.error("User document not found for UID:", user.uid);
            handleAccessDenied();
        }
    } else {
        // User is logged out, clear the profile
        userProfileName.textContent = 'Logged Out';
        userProfileAvatar.src = 'https://via.placeholder.com/40';
        // Optional: Redirect to login page
        window.location.href = '/login/login.html';
    }
});

function handleAccessDenied() {
    console.warn("Access Denied.");
    dashboardContainer.classList.add('hidden');
    accessDeniedContainer.classList.remove('hidden');

    // Automatically sign out the user after a few seconds
    setTimeout(() => {
        signOut(auth);
    }, 4000);
}

document.getElementById('logout-btn').addEventListener('click', () => {
    signOut(auth).catch(error => console.error("Logout Error:", error));
});

// --- REAL-TIME DATA LISTENER ---
function setupRealtimeListener() {
    const usersCollectionRef = collection(db, "users");

    onSnapshot(usersCollectionRef, async (snapshot) => {
        console.log("Detected a change in the users collection. Re-fetching data...");

        const userPromises = snapshot.docs.map(async (userDoc) => {
            const userData = userDoc.data();
            userData.id = userDoc.id;

            // Fetch workgroups for each user (this can remain a getDocs call for simplicity)
            const workspaceSubcollectionRef = collection(db, 'users', userDoc.id, 'myworkspace');
            const workspaceSnapshot = await getDocs(workspaceSubcollectionRef);

            userData.workgroups = workspaceSnapshot.docs.map(wsDoc => {
                const wsData = wsDoc.data();
                return {
                    id: wsDoc.id,
                    name: wsData.name || 'Unnamed Workgroup',
                    memberCount: wsData.members ? wsData.members.length : 0,
                    canShowProducts: wsData.canShowProducts || false,
                    canShowInventory: wsData.canShowInventory || false,
                };
            });
            return userData;
        });

        // Update the global cache with the fresh data
        allUsersData = await Promise.all(userPromises);

        // After updating the data, re-render whichever view is currently active
        rerenderActiveView();
    }, (error) => {
        console.error("Error with real-time listener: ", error);
    });
}


// --- DYNAMIC RENDERING ---
function rerenderActiveView() {
    const activeView = document.querySelector('.view:not(.hidden)');
    if (!activeView) {
        renderDashboardUserList(); // Default to dashboard if no view is active
        return;
    }

    renderDashboardUserList();

    switch (activeView.id) {
        case 'users-view':
            renderUserCards();
            break;
        case 'workspaces-view':
            renderWorkspacesView();
            break;
        case 'settings-view':
            renderSettingsView();
            break;
    }
}

// --- NAVIGATION LOGIC ---
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetViewId = item.id.replace('nav-', '') + '-view';

            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            views.forEach(view => view.classList.add('hidden'));
            document.getElementById(targetViewId).classList.remove('hidden');

            // If navigating to users view, render the detailed cards
            if (targetViewId === 'users-view') {
                renderUserCards();
            } else if (targetViewId === 'workspaces-view') {
                renderWorkspacesView(); // New function call
            } else if (targetViewId === 'settings-view') {
                renderSettingsView();
            }
        });
    });
}

// --- DATA FETCHING ---
async function fetchAndCacheAllUsers() {
    if (allUsersData.length > 0) return; // Don't re-fetch if cache exists

    const usersCollectionRef = collection(db, "users");
    try {
        const usersSnapshot = await getDocs(usersCollectionRef);
        const userPromises = usersSnapshot.docs.map(async (userDoc) => {
            const userData = userDoc.data();
            userData.id = userDoc.id;

            const workspaceSubcollectionRef = collection(db, 'users', userDoc.id, 'myworkspace');
            const workspaceSnapshot = await getDocs(workspaceSubcollectionRef);

            // **THIS IS THE CORRECTED PART**
            // It now correctly saves the workspace ID and permissions for each workspace.
            userData.workgroups = workspaceSnapshot.docs.map(wsDoc => {
                const wsData = wsDoc.data();
                return {
                    id: wsDoc.id, // <-- THIS LINE FIXES THE 'UNDEFINED' ERROR
                    name: wsData.name || 'Unnamed Workgroup',
                    memberCount: wsData.members ? wsData.members.length : 0,
                    canShowProducts: wsData.canShowProducts || false,
                    canShowInventory: wsData.canShowInventory || false,
                };
            });
            return userData;
        });
        allUsersData = await Promise.all(userPromises);
    } catch (error) {
        console.error("Error fetching users:", error);
    }
}

// --- RENDERING FUNCTIONS ---

// Renders the simple list for the dashboard
function renderDashboardUserList() {
    dashboardUserListContent.innerHTML = '';
    if (allUsersData.length === 0) {
        dashboardUserListContent.innerHTML = `<p>No users found.</p>`;
        return;
    }
    allUsersData.forEach(userData => {
        renderUserListItem(userData, dashboardUserListContent);
    });
}

function renderWorkspacesView() {
    workspacesContainer.innerHTML = ''; // Clear previous content
    const usersWithWorkspaces = allUsersData.filter(user => user.workgroups && user.workgroups.length > 0);

    if (usersWithWorkspaces.length === 0) {
        workspacesContainer.innerHTML = `<p>No users have workspaces assigned.</p>`;
        return;
    }

    usersWithWorkspaces.forEach(user => {
        const userCard = document.createElement('div');
        userCard.className = 'workspace-user-card';

        // --- NEW LOGIC: Check if user is banned ---
        const isBanned = user.isBanned === true;
        const nameClass = isBanned ? 'user-name banned-user-name' : 'user-name';
        const bannedTagHTML = isBanned ? '<span class="role-badge banned">Banned</span>' : '';

        const workgroupsListHTML = user.workgroups.map(wg => {
            // If user is banned, all checkboxes are unchecked and disabled.
            const productCheckboxState = isBanned ? 'disabled' : (wg.canShowProducts ? 'checked' : '');
            const inventoryCheckboxState = isBanned ? 'disabled' : (wg.canShowInventory ? 'checked' : '');

            return `
            <div class="workspace-item">
                <div class="workspace-info">
                    <span class="workspace-name">${wg.name}</span>
                    <span class="member-count">${wg.memberCount} members</span>
                </div>
                <div class="permission-controls">
                    <label class="permission-control">
                        <input type="checkbox" name="canShowProducts" 
                               data-user-id="${user.id}" data-workspace-id="${wg.id}" 
                               ${productCheckboxState}>
                        <span class="checkbox-display"><span class="material-icons">check</span></span>
                        Show Products Tab
                    </label>
                    <label class="permission-control">
                        <input type="checkbox" name="canShowInventory" 
                               data-user-id="${user.id}" data-workspace-id="${wg.id}" 
                               ${inventoryCheckboxState}>
                        <span class="checkbox-display"><span class="material-icons">check</span></span>
                        Show Inventory Stocks
                    </label>
                </div>
            </div>
            `;
        }).join('');

        userCard.innerHTML = `
            <div class="workspace-user-header">
                <img src="${user.avatar || 'https://via.placeholder.com/40'}" alt="${user.name}'s avatar">
                <span class="${nameClass}">${user.name}</span>
                ${bannedTagHTML}
            </div>
            <div class="user-workspaces-list">
                ${workgroupsListHTML}
            </div>
        `;
        workspacesContainer.appendChild(userCard);
    });
}

// Renders the detailed cards for the "Users" page
function renderUserCards() {
    userCardsContainer.innerHTML = '';
    if (allUsersData.length === 0) {
        userCardsContainer.innerHTML = `<p>No users found.</p>`;
        return;
    }
    // The placeholder logic is now replaced by calling the detailed render function
    allUsersData.forEach(userData => {
        renderUserCard(userData, userCardsContainer);
    });
}

// The new detailed card rendering function you provided
function renderUserCard(userData, container) {
    let formattedDate = 'N/A';
    if (userData.createdAt && typeof userData.createdAt.toDate === 'function') {
        formattedDate = userData.createdAt.toDate().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    let roleInfo;

    // First, check if the user is banned
    if (userData.isBanned === true) {
        roleInfo = { text: 'Banned', className: 'banned' };
    } else {
        // If not banned, use the normal role map
        roleInfo = roleMap[userData.role] || { text: 'Unknown', className: 'guest' };
    }

    const card = document.createElement('div');
    card.className = 'user-card';
    card.innerHTML = `
        <div class="user-card-header">
            <img src="${userData.avatar || 'https://via.placeholder.com/50'}" alt="${userData.name}'s avatar">
            <div>
                <p class="user-name">${userData.name || 'No Name'}</p>
                <p class="user-email">${userData.email}</p>
            </div>
        </div>
        <div class="user-card-body">
            <div class="info-row">
                <span>Joined:</span>
                <span>${formattedDate}</span>
            </div>
            <div class="info-row">
                <span>Provider:</span>
                <span>${userData.provider || 'N/A'}</span>
            </div>
            <div class="info-row">
                <span>Role:</span>
                <span class="role-badge ${roleInfo.className}">${roleInfo.text}</span>
            </div>
        </div>
    `;
    container.appendChild(card);
}

workspacesContainer.addEventListener('change', async (event) => {
    if (event.target.type === 'checkbox') {
        const checkbox = event.target;
        const userId = checkbox.dataset.userId;
        const workspaceId = checkbox.dataset.workspaceId;
        const permissionName = checkbox.name; // e.g., 'canShowProducts'
        const isChecked = checkbox.checked; // true or false

        if (!userId || !workspaceId) return;

        console.log(`Updating ${permissionName} to ${isChecked} for user ${userId}, workspace ${workspaceId}`);

        checkbox.disabled = true; // Disable while saving

        const workspaceDocRef = doc(db, 'users', userId, 'myworkspace', workspaceId);
        try {
            await updateDoc(workspaceDocRef, {
                [permissionName]: isChecked
            });
            console.log("Permission updated successfully!");
            // Also update the local cache so the UI stays in sync without a full reload
            const user = allUsersData.find(u => u.id === userId);
            const workgroup = user.workgroups.find(wg => wg.id === workspaceId);
            workgroup[permissionName] = isChecked;

        } catch (error) {
            console.error("Error updating permission:", error);
            // Revert the checkbox on error
            checkbox.checked = !isChecked;
        } finally {
            checkbox.disabled = false; // Re-enable after saving
        }
    }
});

function renderSettingsView() {
    // Populate both user dropdowns with the cached user data
    populateUserSelect(userSelectForRole);
    populateUserSelect(deleteUserSelect);
    populateUserSelect(banUserSelect);
    updateBanButtonState(banUserSelect.value);
}

function populateUserSelect(selectElement) {
    const selectedValue = selectElement.value;
    selectElement.innerHTML = '<option value="">-- Select a user --</option>';

    // Pre-calculate counts for efficiency
    const developerCount = allUsersData.filter(u => u.role === 0).length;
    const adminCount = allUsersData.filter(u => u.role === 3).length;

    allUsersData.forEach(user => {
        // Prevent admin from selecting themselves to be deleted
        if (user.id === auth.currentUser.uid && selectElement.id === 'delete-user-select') {
            return;
        }

        const option = document.createElement('option');
        option.value = user.id;

        let statusTag = '';
        if (user.isBanned) {
            statusTag = ' (Banned)';
        } else {
            const roleInfo = roleMap[user.role];
            if (roleInfo) {
                statusTag = ` (${roleInfo.text})`;
            }
        }
        
        option.textContent = `${user.name}${statusTag} - ${user.email}`;
        
        // --- NEW LOGIC FOR DELETE PROTECTION ---
        if (selectElement.id === 'delete-user-select') {
            const isLastDeveloper = user.role === 0 && developerCount <= 1;
            const isLastAdmin = user.role === 3 && adminCount <= 1;

            if (isLastDeveloper || isLastAdmin) {
                option.disabled = true;
                option.textContent += ' (Protected)';
            }
        }

        // Logic for banning protected roles
        if (selectElement.id === 'ban-user-select' && (user.role === 3 || user.role === 0)) {
            if (!user.isBanned) {
                 option.disabled = true;
                 option.textContent += ' (Protected)';
            }
        }

        selectElement.appendChild(option);
    });

    selectElement.value = selectedValue;
}

// Event Listener for the "Update Role" button
changeRoleBtn.addEventListener('click', async () => {
    const userId = userSelectForRole.value;
    const newRole = parseInt(newRoleSelect.value, 10);

    if (!userId) {
        alert("Please select a user.");
        return;
    }

    console.log(`Updating role for user ${userId} to ${newRole}`);
    const userDocRef = doc(db, 'users', userId);

    try {
        await updateDoc(userDocRef, { role: newRole });
        alert("User role updated successfully!");

        // Refresh local cache to reflect the change immediately
        const userInCache = allUsersData.find(u => u.id === userId);
        if (userInCache) userInCache.role = newRole;

        // Re-render views if they are visible
        renderDashboardUserList();
        renderUserCards();

    } catch (error) {
        console.error("Error updating role:", error);
        alert("Failed to update user role.");
    }
});

function updateBanButtonState(userId) {
    if (!userId) {
        banUserBtn.textContent = 'Ban User';
        banUserBtn.classList.remove('btn-warning');
        banUserBtn.classList.add('btn-danger');
        return;
    }

    const selectedUser = allUsersData.find(u => u.id === userId);
    if (selectedUser?.isBanned === true) {
        banUserBtn.textContent = 'Unban User';
        banUserBtn.classList.remove('btn-danger');
        banUserBtn.classList.add('btn-warning');
    } else {
        banUserBtn.textContent = 'Ban User';
        banUserBtn.classList.remove('btn-warning');
        banUserBtn.classList.add('btn-danger');
    }
}

banUserSelect.addEventListener('change', () => {
    const selectedUserId = banUserSelect.value;
    updateBanButtonState(selectedUserId);
});

banUserBtn.addEventListener('click', async () => {
    const userId = banUserSelect.value;
    if (!userId) {
        alert("Please select a user.");
        return;
    }

    const selectedUser = allUsersData.find(u => u.id === userId);
    const isCurrentlyBanned = selectedUser.isBanned === true;

    const batch = writeBatch(db);
    const userDocRef = doc(db, 'users', userId);
    const bannedUserDocRef = doc(db, 'BannedUsers', userId);

    if (isCurrentlyBanned) {
        // Unban logic remains the same...
        const confirmation = confirm(`Are you sure you want to unban ${selectedUser.name}?`);
        if (confirmation) {
            batch.update(userDocRef, { isBanned: false });
            batch.delete(bannedUserDocRef);
            try {
                await batch.commit();
                alert("User has been unbanned successfully.");
            } catch (error) {
                console.error("Error unbanning user:", error);
                alert("Failed to unban user.");
            }
        }
    } else {
        // --- BAN LOGIC ---

        // **NEW**: Safeguard check for protected roles
        if (selectedUser.role === 3 || selectedUser.role === 0) {
            alert("Protected Role: Admins and Developers cannot be banned.");
            return; // Stop the function
        }

        const reason = prompt(`Please provide a reason for banning ${selectedUser.name}:`);
        if (!reason) {
            alert("Ban cancelled. A reason is required.");
            return;
        }

        batch.update(userDocRef, { isBanned: true });
        batch.set(bannedUserDocRef, {
            name: selectedUser.name,
            email: selectedUser.email,
            reason: reason,
            bannedTime: serverTimestamp()
        });

        try {
            await batch.commit();
            alert("User has been banned and logged successfully.");
        } catch (error) {
            console.error("Error banning user:", error);
            alert("Failed to ban user.");
        }
    }
});

// Event Listener for the "Delete User" button
deleteUserBtn.addEventListener('click', async () => {
    const userId = deleteUserSelect.value;
    if (!userId) {
        alert("Please select a user to delete.");
        return;
    }

    const selectedUser = allUsersData.find(u => u.id === userId);

    // --- NEW SAFEGUARD LOGIC START ---

    // Check if trying to delete the last Developer
    if (selectedUser.role === 0) {
        const developerCount = allUsersData.filter(u => u.role === 0).length;
        if (developerCount <= 1) {
            alert("Action Prohibited: Cannot delete the last Developer account.");
            return; // Stop the function
        }
    }

    // Check if trying to delete the last Admin
    if (selectedUser.role === 3) {
        const adminCount = allUsersData.filter(u => u.role === 3).length;
        if (adminCount <= 1) {
            alert("Action Prohibited: Cannot delete the last Admin account.");
            return; // Stop the function
        }
    }

    // --- NEW SAFEGUARD LOGIC END ---

    const confirmation = confirm(`ARE YOU ABSOLUTELY SURE?\n\nYou are about to delete ${selectedUser.name}.\nThis will delete their data from the database and their login account permanently.\n\nThis action cannot be undone.`);

    if (confirmation) {
        try {
            // Step 1: Delete the user's document from Firestore.
            await deleteDoc(doc(db, "users", userId));
            console.log("User document deleted from Firestore.");

            // Step 2: Call a Cloud Function to delete the user from Firebase Auth.
            const deleteUserAccount = httpsCallable(functions, 'deleteUserAccount');
            await deleteUserAccount({ uid: userId });

            alert("User account and all data successfully deleted.");

            // Step 3: Remove user from local cache and re-render everything
            allUsersData = allUsersData.filter(u => u.id !== userId);
            rerenderActiveView(); // This will handle all view updates

        } catch (error) {
            console.error("Error deleting user:", error);
            alert("An error occurred while deleting the user. See console for details.");
        }
    }
});

// The function you provided, used for the dashboard list
function renderUserListItem(userData, container) {
    let roleInfo;

    // First, check if the user is banned
    if (userData.isBanned === true) {
        roleInfo = { text: 'Banned', className: 'banned' };
    } else {
        // If not banned, use the normal role map
        roleInfo = roleMap[userData.role] || { text: 'Unknown', className: 'guest' };
    }

    const workgroupsHTML = userData.workgroups.length > 0
        ? `<ul>${userData.workgroups.map(wg => `<li class="workgroup-item"><span class="workgroup-name">${wg.name}</span><span class="member-count">${wg.memberCount} members</span></li>`).join('')}</ul>`
        : '<span>No workgroups assigned</span>';

    const userItem = document.createElement('div');
    userItem.className = 'user-list-item';
    userItem.innerHTML = `
        <div class="user-details">
            <img src="${userData.avatar || 'https://via.placeholder.com/40'}" alt="User Avatar">
            <div class="user-info">
                <p class="user-name">${userData.name || 'N/A'}</p>
                <p class="user-email">${userData.email}</p>
            </div>
        </div>
        <div class="workgroup-list">${workgroupsHTML}</div>
        <div class="user-role"><span class="role-badge ${roleInfo.className}">${roleInfo.text}</span></div>
    `;
    container.appendChild(userItem);
}

// --- Tab Switching Logic ---
document.addEventListener('click', (event) => {
    if (event.target.matches('.tab-link')) {
        const tabId = event.target.getAttribute('data-tab');
        document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
    }
});