import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

// Keep track of the current section's cleanup logic to prevent memory leaks.
let currentSectionCleanup = null;

/**
 * Parses the browser's URL path into a structured object for the router.
 */
function parseRoute() {
    const pathParts = window.location.pathname.split('/').filter(p => p);
    
    if (pathParts.length === 0) {
        return { section: 'home' }; // Default route for "/"
    }
    
    const resourceType = pathParts[0];
    
    // This handles complex routes like /tasks/123/list/456
    if (resourceType === 'tasks' && pathParts.length > 3) {
        return {
            section: 'tasks',
            accountId: pathParts[1] || null,
            tabId: pathParts[2] || 'list',
            projectId: pathParts[3] || null
        };
    }
    
    // This handles all simple, single-keyword routes
    const simpleRoutes = ['home', 'myworkspace', 'inbox', 'inventory', 'reports', 'goals', 'settings'];
    if (simpleRoutes.includes(resourceType)) {
        return { section: resourceType };
    }
    
    // Fallback for any unknown URL
    return { section: 'home' };
}

/**
 * The main router function. It determines the current route and loads the appropriate section.
 */
function router() {
    const routeParams = parseRoute();
    console.log("Routing to:", routeParams);
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
            currentSectionCleanup = sectionModule.init(routeParams);
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
        if (!response.ok) throw new Error(`Failed to fetch ${url}`);
        const htmlContent = await response.text();

        const folderPath = url.substring(0, url.lastIndexOf('/'));
        const componentName = folderPath.split('/').pop();

        const cssPath = `${folderPath}/${componentName}.css`;
        const jsPath = `${folderPath}/${componentName}.js`;

        // ✅ Remove previous CSS for this component before adding new
        const existingLink = document.querySelector(`link[href="${cssPath}"]`);
        if (!existingLink) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = cssPath;
            link.setAttribute("data-component-style", componentName);
            document.head.appendChild(link);
        }

        container.innerHTML = htmlContent;

        // ✅ Mark this container as having this component
        container.setAttribute("data-loaded-url", url);

        // ✅ Import JS module only once by checking window._loadedComponents
        window._loadedComponents = window._loadedComponents || {};
        if (!window._loadedComponents[jsPath]) {
            await import(jsPath);
            window._loadedComponents[jsPath] = true;
        }

    } catch (err) {
        container.innerHTML = `<p>Error loading component from ${url}</p>`;
        console.error("Failed to load component:", err);
    }
}


// --- APPLICATION INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // --- USER IS LOGGED IN ---
            console.log("Authenticated user found. Initializing dashboard...");
            
            // Load persistent layout components.
            await Promise.all([
                loadHTML("#top-header", "/dashboard/header/header.html"),
                loadHTML("#rootdrawer", "/dashboard/drawer/drawer.html"),
                loadHTML("#right-sidebar", "/dashboard/sidebar/sidebar.html"),
            ]);
            
            // --- GLOBAL NAVIGATION HANDLER ---
            // This single listener handles all SPA routing clicks.
            document.body.addEventListener('click', e => {
                const link = e.target.closest('a[data-link]');
                if (link) {
                    e.preventDefault();
                    history.pushState(null, '', link.href);
                    router();
                }
            });

            window.TaskSidebar?.init();
            
            window.addEventListener('popstate', router); // Handle back/forward buttons
            router(); // Initial route call for the first page load
            
        } else {
            // --- USER IS NOT LOGGED IN ---
            console.log("No authenticated user. Redirecting to /login/...");
            window.location.href = '/login/login.html';
        }
    });
});