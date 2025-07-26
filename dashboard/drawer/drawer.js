import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    collection,
    collectionGroup,
    where,
    doc,
    onSnapshot,
    query,
    orderBy,
    runTransaction,
    serverTimestamp,
    getDoc,
    getDocs,
    setDoc,
    updateDoc // Import updateDoc for selectProject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

(function initializeDrawer() {
    if (window.drawerLogicInitialized) return;

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app, "juanluna-cms-01");

    const sidebar = document.getElementById("dashboardDrawer");
    const inventoryLink = document.getElementById('inventory-link');
    const productsLink = document.getElementById('products-link');
    const adminLink = document.getElementById("adminLink");
    if (!sidebar) return;

    // --- Module-level state variables ---
    let projectsData = [];
    let activeWorkspaceId = null;
    let selectedProjectId = null;
    let currentUser = null;
    let unsubscribeProjects = null;
    let unsubscribeUserDoc = null;
    let unsubscribeWorkspace = null;
    // A flag to prevent multiple reload loops
    let isReloading = false;

    function stringToNumericString(str) {
        if (!str) return '';
        return str.split('').map(char => char.charCodeAt(0)).join('');
    }

    const generateColorForName = (name) => {
        const hash = (name || '').split("").reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);

        // Limit hue to a cooler range (e.g., 180–300: green-blue-purple)
        const hue = 180 + (hash % 120); // values between 180 and 300
        const saturation = 50; // softer saturation
        const lightness = 60; // brighter but not glaring

        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };

    function renderProjectsList() {
        const projectsListContainer = sidebar.querySelector('#projects-section .section-items');
        if (!projectsListContainer || !currentUser) return;

        // Filter projects based on their accessLevel and workspace membership
        const visibleProjects = projectsData.filter(project => {
            const isMember = project.memberUIDs && project.memberUIDs.includes(currentUser.uid);

            if (project.accessLevel === 'workspace' && project.workspaceId === activeWorkspaceId) {
                return true; // Show workspace-level projects even if user is not an explicit member
            }

            if (isMember) {
                return true; // Show any project where user is a member
            }

            return false;
        });


        projectsListContainer.innerHTML = '';

        if (visibleProjects.length === 0) {
            projectsListContainer.innerHTML = `<li class="nav-item-empty">No projects yet.</li>`;
            updateMyTasksLink(null);
            return;
        }

        const activeProjects = activeWorkspaceId ? visibleProjects.filter(p => p.workspaceId === activeWorkspaceId) : [];
        const otherProjects = activeWorkspaceId ? visibleProjects.filter(p => p.workspaceId !== activeWorkspaceId) : visibleProjects;

        const renderProjectItem = (project) => {
            const projectLi = document.createElement('li');
            projectLi.classList.add('nav-item-project', 'projects-item');

            if (project.id === selectedProjectId) {
                projectLi.classList.add('selected');
                projectLi.style.setProperty('--project-highlight-color', project.color);
            }

            projectLi.dataset.projectId = project.id;
            const numericUserId = stringToNumericString(currentUser?.uid);
            const numericProjectId = stringToNumericString(project.id);
            const href = `/tasks/${currentUser?.uid}/list/${project.id}`;
            projectLi.innerHTML = `
                <a href="${href}" data-link>
                    <div class="nav-item-main-content">
                        <div class="project-color" style="background-color: ${project.color};"></div>
                        <span>${project.title}</span>
                    </div>
                </a>
            `;
            projectsListContainer.appendChild(projectLi);
        };

        activeProjects.sort((a, b) => a.title.localeCompare(b.title)).forEach(renderProjectItem);
        otherProjects.sort((a, b) => a.title.localeCompare(b.title)).forEach(renderProjectItem);

        const selectedProject = visibleProjects.find(p => p.id === selectedProjectId);
        updateMyTasksLink(selectedProject || visibleProjects[0]);
    }

     function updateMyTasksLink() {
        const myTasksLink = sidebar.querySelector('#my-tasks-link');
        if (!myTasksLink) return;

        // Statically set the href to the desired "My Tasks" page route.
        myTasksLink.href = '/mytasks';
        // Ensure the router handles the click.
        myTasksLink.setAttribute('data-link', '');
    }

    async function handleAddProject() {
        const name = prompt("Enter new project name:");
        if (!name?.trim()) return;
        if (!currentUser) return alert("User not available.");

        try {
            // 1. Get the current user's selectedWorkspaceId
            const userRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userRef);
            const selectedWorkspaceId = userSnap.data()?.selectedWorkspace;
            if (!selectedWorkspaceId) {
                return alert("No workspace selected. Please select a workspace first.");
            }

            // 2. Look for the actual workspace document in any user's collection
            const workspaceGroupQuery = query(
                collectionGroup(db, 'myworkspace'),
                where('workspaceId', '==', selectedWorkspaceId)
            );
            const workspaceGroupSnap = await getDocs(workspaceGroupQuery);

            if (workspaceGroupSnap.empty) {
                return alert("Error: The selected workspace could not be found. It may have been deleted.");
            }

            // This is the reference to the owner's workspace document
            const ownerWorkspaceRef = workspaceGroupSnap.docs[0].ref;
            const projectsColRef = collection(ownerWorkspaceRef, "projects");
            const newProjectRef = doc(projectsColRef);

            // Default Columns, Sections, etc.
            const INITIAL_DEFAULT_COLUMNS = [{
                id: 'assignees',
                name: 'Assignee',
                control: 'assignee'
            }, {
                id: 'dueDate',
                name: 'Due Date',
                control: 'due-date'
            }, {
                id: 'priority',
                name: 'Priority',
                control: 'priority',
                options: [{
                    name: 'High',
                    color: '#EF4D3D'
                }, {
                    name: 'Medium',
                    color: '#FFD15E'
                }, {
                    name: 'Low',
                    color: '#59E166'
                }]
            }, {
                id: 'status',
                name: 'Status',
                control: 'status',
                options: [{
                    name: 'On track',
                    color: '#59E166'
                }, {
                    name: 'At risk',
                    color: '#fff1b8'
                }, {
                    name: 'Off track',
                    color: '#FFD15E'
                }, {
                    name: 'Completed',
                    color: '#878787'
                }]
            }];

            const INITIAL_DEFAULT_SECTIONS = [{
                title: 'Todo',
                order: 0,
                sectionType: 'todo',
                isCollapsed: false
            }, {
                title: 'Doing',
                order: 1,
                sectionType: 'doing',
                isCollapsed: false
            }, {
                title: 'Completed',
                order: 2,
                sectionType: 'completed',
                isCollapsed: true
            }];

            const INITIAL_COLUMN_ORDER = INITIAL_DEFAULT_COLUMNS.map(col => col.id);

            // 3. Transaction: create the project and sections
            await runTransaction(db, async (txn) => {
                txn.set(newProjectRef, {
                    title: name.trim(),
                    projectId: newProjectRef.id,
                    workspaceId: selectedWorkspaceId,
                    memberUIDs: [currentUser.uid],
                    color: generateColorForName(name.trim()),
                    starred: false,
                    createdAt: serverTimestamp(),
                    accessLevel: "private",
                    workspaceRole: "Viewer",
                    project_super_admin_uid: currentUser.uid,
                    project_admin_user: '',
                    members: [{
                        uid: currentUser.uid,
                        role: "Project Owner Admin"
                    }],
                    pendingInvites: [],
                    defaultColumns: INITIAL_DEFAULT_COLUMNS,
                    customColumns: [],
                    columnOrder: INITIAL_COLUMN_ORDER
                });

                txn.set(userRef, {
                    selectedProjectId: newProjectRef.id
                }, {
                    merge: true
                });

                // Create default sections under the new project
                const sectionsColRef = collection(newProjectRef, "sections");
                INITIAL_DEFAULT_SECTIONS.forEach(sectionData => {
                    const sectionRef = doc(sectionsColRef);
                    txn.set(sectionRef, {
                        ...sectionData,
                        createdAt: serverTimestamp()
                    });
                });
            });

            console.log("Project created and set as active successfully!");

            // 4. Update centralized workspace membership (optional/if applicable)
            try {
                const memberDocRef = doc(db, 'workspaces', selectedWorkspaceId, 'members', currentUser.uid);
                await setDoc(memberDocRef, {
                    userId: currentUser.uid,
                    selectedProjectId: newProjectRef.id,
                    selectedProjectWorkspaceVisibility: "private",
                    lastAccessed: serverTimestamp()
                }, {
                    merge: true
                });

                console.log("Centralized workspace membership updated.");
            } catch (membershipError) {
                console.error("Failed to update workspace membership:", membershipError);
            }

        } catch (err) {
            console.error("Project creation failed:", err);
            alert("Failed to create the project. Please try again.");
        }
    }

    async function updateUserWorkspaceMembership(userId, workspaceId, projectId) {
        const selectedProject = projectsData.find(p => p.id === projectId);
        const projectVisibility = selectedProject ? selectedProject.accessLevel : 'private';

        const memberDocRef = doc(db, `workspaces/${workspaceId}/members`, userId);

        try {
            await setDoc(memberDocRef, {
                userId,
                selectedProjectId: projectId,
                selectedProjectWorkspaceVisibility: projectVisibility,
                lastAccessed: serverTimestamp()
            }, { merge: true });

            console.log(`Updated workspace membership`);
            console.log(`User: ${userId}`);
            console.log(`Workspace: ${workspaceId}`);
            console.log(`Project: ${projectId}`);
            console.log(`Visibility: ${projectVisibility}`);
        } catch (error) {
            console.error(`Error updating workspace membership: ${error.message}`);
        }
    }

    async function selectProject(projectIdToSelect) {
        if (!currentUser || !activeWorkspaceId) {
            console.warn('Missing currentUser or activeWorkspaceId');
            return;
        }

        try {
            console.log(`Updated selectedProjectId in user workspace`);
            console.log(`User: ${currentUser.uid}`);
            console.log(`Workspace: ${activeWorkspaceId}`);
            console.log(`Project: ${projectIdToSelect}`);

            const selectedProject = projectsData.find(p => p.id === projectIdToSelect);
            console.log(`Project Workspace: ${selectedProject?.workspaceId}`);
            const projectWorkspaceId = selectedProject?.workspaceId || activeWorkspaceId;

            await updateUserWorkspaceMembership(currentUser.uid, projectWorkspaceId, projectIdToSelect);
        } catch (error) {
            console.error(`Error setting selected project: ${error.message}`);
        }
    }


    sidebar.addEventListener('click', async (e) => {
        const sectionHeader = e.target.closest('.section-header');

        if (e.target.closest('.add-project-btn')) {
            e.stopPropagation();
            handleAddProject();
            document.querySelector('.drawerprojects-dropdown')?.remove();
            return;
        }

        if (sectionHeader) {
            sectionHeader.closest('.nav-section')?.classList.toggle('open');
            return;
        }

        const projectLink = e.target.closest('.projects-item a');
        if (projectLink) {
            e.preventDefault();
            const projectItem = projectLink.closest('.projects-item');
            const projectId = projectItem.dataset.projectId;
            if (projectId && projectId !== selectedProjectId) {
                selectProject(projectId);
                window.router();
            }
        }
    });

    async function findAndListenToWorkspace(activeWorkspaceId) {
        const workspaceQuery = query(
            collectionGroup(db, "myworkspace"),
            where("workspaceId", "==", activeWorkspaceId)
        );


        const snapshot = await getDocs(workspaceQuery);

        if (snapshot.empty) {
            console.warn("No workspace found with ID:", activeWorkspaceId);
            return;
        }

        const matchDoc = snapshot.docs[0];
        const data = matchDoc.data();
        const ownerRef = data.ownerWorkspaceRef;

        if (!ownerRef) {
            console.warn("ownerWorkspaceRef not found on the workspace document.");
            return;
        }

        const workspaceDocRef = doc(db, ownerRef.path); // Convert DocumentReference to usable doc ref

        // Step 2: Start listening
        unsubscribeWorkspace = onSnapshot(workspaceDocRef, (workspaceSnap) => {
            if (workspaceSnap.exists()) {
                const workspaceData = workspaceSnap.data();
                console.log("Real-time workspace data:", workspaceData);

                if (workspaceData.canShowInventory === true) {
                    inventoryLink.classList.remove('hidden');
                } else {
                    inventoryLink.classList.add('hidden');
                }

                if (workspaceData.canShowProducts === true) {
                    productsLink.classList.remove('hidden');
                } else {
                    productsLink.classList.add('hidden');
                }

            } else {
                console.warn("Workspace document does not exist at owner ref.");
                inventoryLink.classList.add('hidden');
                productsLink.classList.add('hidden');
            }
        });
    }


    onAuthStateChanged(auth, async (user) => {
        console.log("Auth state changed.");

        // Cleanup previous listeners
        if (unsubscribeUserDoc) {
            console.log("Unsubscribing from previous userDoc listener.");
            unsubscribeUserDoc();
        }
        if (unsubscribeProjects) {
            console.log("Unsubscribing from previous project listeners.");
            unsubscribeProjects();
        }
        if (unsubscribeWorkspace) unsubscribeWorkspace();

        if (inventoryLink) inventoryLink.classList.add('hidden');
        if (productsLink) productsLink.classList.add('hidden');

        activeWorkspaceId = null;
        selectedProjectId = null;
        projectsData = [];
        currentUser = user;

        if (!user) {
            console.log("User is signed out.");
            renderProjectsList();
            return;
        }

        console.log("User is signed in:", user.uid);

        const userDocRef = doc(db, 'users', user.uid);

        unsubscribeUserDoc = onSnapshot(userDocRef, async (userSnap) => {
            const userData = userSnap.data();
            const newWorkspaceId = userData?.selectedWorkspace || null;
            const role = userData?.role;

            if (adminLink) {
                if (role === 0 || role === 3) {
                    adminLink.classList.remove("hidden");
                    adminLink.querySelector("a").href = "/admin-dashboard/database";
                } else {
                    adminLink.classList.add("hidden");
                }
            }

            // If no selected workspace but user is Admin or Owner, try to find it in someone else's workspace
            if (!newWorkspaceId) {
                console.warn("No active workspace selected.");

                if (role === 0 || role === 3) {
                    // Try finding workspace from any user's /myworkspace
                    const myWorkspaceQuery = query(collectionGroup(db, 'myworkspace'));
                    const allWorkspaceSnaps = await getDocs(myWorkspaceQuery);

                    if (!allWorkspaceSnaps.empty) {
                        const foundWorkspace = allWorkspaceSnaps.docs.find(doc => {
                            const data = doc.data();
                            return data && data.canShowInventory === true;
                        });

                        if (foundWorkspace) {
                            console.log("Found fallback workspace:", foundWorkspace.id);

                            // Temporarily use this workspace for UI logic
                            const workspaceData = foundWorkspace.data();

                            if (workspaceData.canShowInventory) {
                                inventoryLink.classList.remove('hidden');
                            }
                            if (workspaceData.canShowProducts) {
                                productsLink.classList.remove('hidden');
                            }

                            renderProjectsList(); // still show projects
                            return;
                        }
                    }
                }

                renderProjectsList();
                return;
            }

            // If same workspace is already active, do nothing
            if (newWorkspaceId === activeWorkspaceId) {
                return;
            }

            if (unsubscribeWorkspace) {
                console.log("Unsubscribing from old workspace listener.");
                unsubscribeWorkspace();
            }

            activeWorkspaceId = newWorkspaceId;
            console.log("Active workspace set:", activeWorkspaceId);

            findAndListenToWorkspace(activeWorkspaceId);

            const memberDocRef = doc(db, `workspaces/${activeWorkspaceId}/members/${user.uid}`);
            const memberSnap = await getDoc(memberDocRef);

            if (!memberSnap.exists()) {
                console.warn("Workspace membership document not found.");
                selectedProjectId = null;
                renderProjectsList();
                return;
            }

            const newSelectedProjectId = memberSnap.data()?.selectedProjectId || null;
            selectedProjectId = newSelectedProjectId;
            console.log("Selected project:", selectedProjectId);

            // Start listening to projects
            startProjectListeners(user.uid, activeWorkspaceId);
        });

    });

    function startProjectListeners(userId, workspaceId) {
        if (!userId || !workspaceId) {
            console.warn("Missing user ID or workspace ID. Aborting project listeners.");
            return;
        }

        console.log("Initializing real-time project listeners...");

        if (unsubscribeProjects) {
            unsubscribeProjects(); // Clean up previous
        }

        let memberProjectsMap = new Map();
        let workspaceProjectsMap = new Map();

        const mergeAndRenderProjects = () => {
            const allProjectsMap = new Map([...memberProjectsMap, ...workspaceProjectsMap]);
            projectsData = Array.from(allProjectsMap.values());
            console.log("Total visible projects:", projectsData.length);
            renderProjectsList();
        };

        const memberProjectsQuery = query(
            collectionGroup(db, "projects"),
            where("memberUIDs", "array-contains", userId)
        );

        const workspaceProjectsQuery = query(
            collectionGroup(db, "projects"),
            where("accessLevel", "==", "workspace"),
            where("workspaceId", "==", workspaceId)
        );

        const unsubMember = onSnapshot(memberProjectsQuery, (snapshot) => {
            console.log("Member project snapshot updated.");
            memberProjectsMap.clear();
            snapshot.forEach(doc => memberProjectsMap.set(doc.id, { id: doc.id, ...doc.data() }));
            mergeAndRenderProjects();
        });

        const unsubWorkspace = onSnapshot(workspaceProjectsQuery, (snapshot) => {
            console.log("Workspace project snapshot updated.");
            workspaceProjectsMap.clear();
            snapshot.forEach(doc => workspaceProjectsMap.set(doc.id, { id: doc.id, ...doc.data() }));
            mergeAndRenderProjects();
        });

        unsubscribeProjects = () => {
            unsubMember();
            unsubWorkspace();
        };
    }

    window.drawerLogicInitialized = true;
    console.log("Drawer Component Initialized with new data model.");
})();