import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    getDoc,
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { firebaseConfig } from "/services/firebase-config.js";



// Keep track of the current section's cleanup logic to prevent memory leaks.
let currentSectionCleanup = null;

/**
 * Parses the browser's URL path into a structured object for the router.
 */
function parseRoute() {
    const pathParts = window.location.pathname.split('/').filter(p => p);
    const queryParams = new URLSearchParams(window.location.search);


    // Default home route
    if (pathParts.length === 0) {
        return { section: 'home' };
    }

    // ✅ Handle /tasks/:accountId/:tabId/:projectId?openTask=
    const resourceType = pathParts[0];
    if (resourceType === 'tasks' && pathParts.length > 3) {
        return {
            section: 'tasks',
            accountId: pathParts[1] || null,
            tabId: pathParts[2] || 'list',
            projectId: pathParts[3] || null,
            openTask: queryParams.get('openTask') || null
        };
    }

    const simpleRoutes = ['home', 'myworkspace', 'inbox', 'inventory', 'reports', 'products', 'searchresults', 'settings'];
    if (simpleRoutes.includes(resourceType)) {
        return { section: resourceType };
    }

    if (pathParts[0]?.startsWith('admin')) {
        return {
            section: 'admin',
            redirectTo: '/admin/admin.html'
        };
    }

    return { section: 'home' };
}



/**
 * The main router function. It determines the current route and loads the appropriate section.
 */
function router() {
    const routeParams = parseRoute();
    console.log("Routing to:", routeParams);

    if (routeParams.redirectTo) {
        window.location.href = routeParams.redirectTo;
        return;
    }

    loadSection(routeParams);
}


window.router = router;

/**
 * Dynamically loads a section's HTML, CSS, and JS module into the main content area.
 * @param {object} routeParams - The object of parameters returned by parseRoute().
 */
let lastLoadedSection = null;

async function loadSection(routeParams) {
    if (!routeParams || !routeParams.section) {
        console.error("Invalid route. Defaulting to home.");
        routeParams = { section: 'home' };
    }

    const { section } = routeParams;
    const content = document.getElementById("content");

    // ✅ Skip full reload if same section
    if (section === lastLoadedSection) {
        console.log(`[Router] Same section "${section}", skipping full reload. Running param-aware init...`);

        const sectionModule = await import(`/dashboard/${section}/${section}.js?v=${new Date().getTime()}`);
        if (sectionModule.init) {
            sectionModule.init(routeParams);  // No cleanup
        }
        return;
    }

    // 🧹 Run cleanup if different section
    if (typeof currentSectionCleanup === 'function') {
        currentSectionCleanup();
        currentSectionCleanup = null;
    }

    // Begin loading
    content.innerHTML = '<div class="section-loader"></div>';
    document.getElementById("section-css")?.remove();
    content.dataset.section = section;

    try {
        const htmlPath = `/dashboard/${section}/${section}.html`;
        const cssPath = `/dashboard/${section}/${section}.css`;
        const jsPath = `/dashboard/${section}/${section}.js?v=${new Date().getTime()}`;

        const htmlRes = await fetch(htmlPath);
        if (!htmlRes.ok) throw new Error(`HTML not found at ${htmlPath}`);
        const sectionHtml = await htmlRes.text();

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssPath;
        link.id = "section-css";
        document.head.appendChild(link);

        const sectionModule = await import(jsPath);

        content.innerHTML = sectionHtml;

        if (sectionModule.init) {
            return sectionModule.init(routeParams);
        }

        lastLoadedSection = section;

    } catch (err) {
        content.innerHTML = `<p>Error loading section: <strong>${section}</strong></p>`;
        console.error(`Failed to load section ${section}:`, err);
    }

    updateActiveNav(section);
}

/**
 * Updates the active navigation item based on the current browser URL.
 */
function updateActiveNav() {
    const drawer = document.getElementById("dashboardDrawer");
    if (!drawer) return;

    const currentPath = window.location.pathname;

    // First, clear the 'active' class from all navigation items
    drawer.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    let linkToActivate = null;

    // --- THIS IS THE NEW, SIMPLIFIED LOGIC ---

    // 1. Check if the current URL is any kind of tasks page.
    if (currentPath.startsWith('/tasks/')) {
        // If it is, find the "My Tasks" link by its unique ID.
        linkToActivate = drawer.querySelector('#my-tasks-link');
    } else {
        // 2. For any other page (e.g., "/home", "/inbox"), find the link with an exact href match.
        linkToActivate = drawer.querySelector(`.nav-item a[href="${currentPath}"]`);
    }

    // 3. If we found a link to activate, add the 'active' class to its parent <li>.
    if (linkToActivate) {
        linkToActivate.closest('.nav-item').classList.add('active');
    }
}

/**
 * Asynchronously loads persistent HTML components like the header and drawer.
 * Also dynamically loads their associated CSS and JS modules.
 */
async function loadHTML(selector, url) {
    const container = document.querySelector(selector);
    if (!container) return;

    // 🛑 Prevent re-loading if already loaded (check by custom attribute)
    if (container.getAttribute("data-loaded-url") === url) {
        console.log(`[loadHTML] Skipping reload of ${url} (already loaded)`);
        return;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url} (HTTP status: ${response.status})`); // More detailed error

        const htmlContent = await response.text();

        const folderPath = url.substring(0, url.lastIndexOf('/'));
        const componentName = folderPath.split('/').pop();

        const cssPath = `${folderPath}/${componentName}.css`;
        const jsPath = `${folderPath}/${componentName}.js`;

        // ✅ Remove previous CSS for this component before adding new
        // Check if a link for this specific component already exists
        let existingLink = document.querySelector(`link[data-component-style="${componentName}"]`);
        if (existingLink && existingLink.href !== cssPath) { // If it exists but is for a different URL, remove it
            existingLink.remove();
            existingLink = null; // Clear reference
        }
        if (!existingLink) { // If no existing or if it was removed
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = cssPath;
            link.setAttribute("data-component-style", componentName); // Use data-attribute for better targeting
            document.head.appendChild(link);
        }

        container.innerHTML = htmlContent;

        // ✅ Mark this container as having this component
        container.setAttribute("data-loaded-url", url);

        // ✅ Import JS module only once by checking window._loadedComponents
        // Use a more robust check for module loading to prevent double execution if module itself is cached
        window._loadedComponents = window._loadedComponents || {};
        if (!window._loadedComponents[jsPath]) {
            // Appending a cache-busting query parameter to the JS path
            // to ensure a fresh load during development, if needed.
            // In production, rely on proper caching headers or versioning.
            const moduleToLoad = `${jsPath}?v=${new Date().getTime()}`;
            await import(moduleToLoad);
            window._loadedComponents[jsPath] = true; // Mark base path as loaded
            console.log(`[loadHTML] Imported JS module: ${jsPath}`);
        } else {
            console.log(`[loadHTML] Skipping JS module import for ${jsPath} (already imported)`);
        }

    } catch (err) {
        container.innerHTML = `<p style="color: red;">Error loading component from ${url}: ${err.message}</p>`; // Display error message
        console.error("Failed to load component:", err); // Fix: Corrected to console.error
        // Provide full error details to console
        console.error("Full error details:", err.stack);
    }
}

function hideInitialLoader() {
    const loader = document.getElementById("initial-loader");
    if (loader) {
        loader.style.opacity = "0";
        setTimeout(() => loader.remove(), 300);
    }
}

// --- APPLICATION INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    const loadingMessages = [
        "Loading your workspace...",
        "Syncing tasks...",
        "Fetching project data...",
        "Preparing your dashboard...",
        "Almost ready..."
    ];

    let currentMsgIndex = 0;
    const loaderTextContainer = document.getElementById("loader-message");

    // --- 👇 CHANGE 1: Declare a variable to hold the interval ID ---
    let messageIntervalId = null;

    function showNextMessage() {
        console.log(`[Loader] Showing next loading message...`);
        const currentSpan = loaderTextContainer.querySelector("span");
        if (!currentSpan) {
            console.warn("[Loader] No current span found. Aborting message transition.");
            return;
        }
        const nextIndex = (currentMsgIndex + 1) % loadingMessages.length;
        const nextMessage = loadingMessages[nextIndex];
        console.log(`[Loader] Transitioning to message #${nextIndex}: "${nextMessage}"`);
        const nextSpan = document.createElement("span");
        nextSpan.textContent = nextMessage;
        nextSpan.classList.add("active");
        currentSpan.classList.remove("active");
        currentSpan.classList.add("exit");
        loaderTextContainer.appendChild(nextSpan);
        setTimeout(() => {
            console.log(`[Loader] Removing previous message: "${currentSpan.textContent}"`);
            currentSpan.remove();
        }, 300);
        currentMsgIndex = nextIndex;
    }

    messageIntervalId = setInterval(showNextMessage, 1000);
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const functions = getFunctions(app);
    const db = getFirestore(app, "juanluna-cms-01");
    const runBackfill = httpsCallable(functions, "runBackfill");
    const runAlgoliaBackfill = httpsCallable(functions, "runAlgoliaBackfill");

    let backfillIntervalId = null;
    let backfillTaskCountIntervalId = null;

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("✅ Authenticated user found. Initializing dashboard...");

            await Promise.all([
                loadHTML("#top-header", "/dashboard/header/header.html"),
                loadHTML("#rootdrawer", "/dashboard/drawer/drawer.html"),
                loadHTML("#right-sidebar", "/dashboard/sidebar/sidebar.html"),
            ]);

            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                const selectedWorkspace = userDoc.data()?.selectedWorkspace;
                if (selectedWorkspace) {
                    const memberRef = doc(db, `workspaces/${selectedWorkspace}/members/${user.uid}`);
                    const memberSnap = await getDoc(memberRef);
                    if (!memberSnap.exists()) {
                        await setDoc(memberRef, {
                            userId: user.uid,
                            selectedProjectId: "",
                            selectedProjectWorkspaceVisibility: "workspace",
                            lastAccessed: serverTimestamp()
                        });
                        console.log(`✅ Member doc initialized in workspaces/${selectedWorkspace}/members/${user.uid}`);
                    } else {
                        console.log(`ℹ️ Member doc already exists.`);
                    }
                } else {
                    console.warn("⚠️ No selectedWorkspace found in user doc.");
                }
            } catch (err) {
                console.error("❌ Error creating member doc:", err.message);
            }

            const runAndLogBackfill = async () => {
                try {
                    const res = await runAlgoliaBackfill();
                    console.log("✅ Periodic Backfill success:", res.data.message);
                } catch (err) {
                    console.error("❌ Periodic Backfill error:", err.message);
                }
            };
            runAndLogBackfill();
            backfillIntervalId = setInterval(runAndLogBackfill, 60_000);

            document.body.addEventListener('click', e => {
                const link = e.target.closest('a[data-link]');
                if (link) {
                    e.preventDefault();
                    history.pushState(null, '', link.href);
                    router();
                }
            });

            window.TaskSidebar?.init();
            window.addEventListener('popstate', router);
            
            // --- 👇 CHANGE 3: Clear the interval right after hiding the loader ---
            setTimeout(() => {
                hideInitialLoader();
                if (messageIntervalId) {
                    clearInterval(messageIntervalId);
                    console.log("✅ Loader hidden and message interval stopped.");
                }
            }, navigator.connection?.effectiveType === '4g' ? 1200 : 1800);
            
            router(); // Initial route load

        } else {
            console.log("⛔ No authenticated user. Redirecting to login...");
            window.location.href = '/login/login.html';

            // Clean up intervals on logout/redirect
            if (backfillIntervalId) {
                clearInterval(backfillIntervalId);
                backfillIntervalId = null;
            }
            if (messageIntervalId) {
                clearInterval(messageIntervalId);
                messageIntervalId = null;
            }
        }
    });
});
