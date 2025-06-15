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
    const simpleRoutes = ['home', 'myworkspace', 'inbox', 'reports', 'goals', 'settings'];
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
let lastSectionName = null;
let lastRouteParams = null;

async function loadSection(routeParams) {
    if (!routeParams || !routeParams.section) {
        console.error("Invalid route. Defaulting to home.");
        routeParams = { section: 'home' };
    }

    const { section } = routeParams;
    const content = document.getElementById("content");

    // 🔁 Skip reloading if section is the same (but allow param updates)
    if (lastSectionName === section && typeof currentSectionCleanup === 'function') {
        console.log(`[Router] Same section "${section}", skipping reload. Running param-aware init...`);
        currentSectionCleanup(); // optional: clean up before re-initializing
        currentSectionCleanup = null;

        // Dynamically re-import the module to re-call init with new params
        const jsPath = `/dashboard/${section}/${section}.js?v=${new Date().getTime()}`;
        const sectionModule = await import(jsPath);
        if (sectionModule.init) {
            currentSectionCleanup = sectionModule.init(routeParams);
        }
        lastRouteParams = routeParams;
        return;
    }

    // Full reload since section changed
    lastSectionName = section;
    lastRouteParams = routeParams;

    if (typeof currentSectionCleanup === 'function') {
        currentSectionCleanup();
        currentSectionCleanup = null;
    }

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
        } else {
            console.warn(`Section "${section}" has no export function init().`);
        }

    } catch (err) {
        content.innerHTML = `<p>Error loading section: <strong>${section}</strong></p>`;
        console.error(`Failed to load section ${section}:`, err);
    }

    updateActiveNav(section);
}


/**
 * Updates the visual 'active' state of the main navigation links in the drawer.
 * @param {string} sectionName - The name of the currently active section.
 */
function updateActiveNav(sectionName) {
    // This function will be called by the router after a section loads.
    // It assumes the drawer's HTML is already loaded.
    const drawer = document.getElementById("dashboardDrawer");
    if (!drawer) return;
    
    drawer.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // The 'tasks' section should highlight the 'Home' link in the drawer.
    const navKey = sectionName === 'tasks' ? 'home' : sectionName;
    
    const activeLink = drawer.querySelector(`.nav-item a[href="/${navKey}"]`);
    if (activeLink) {
        activeLink.closest('.nav-item').classList.add('active');
    }
}


/**
 * Asynchronously loads persistent HTML components like the header and drawer.
 * Also dynamically loads their associated CSS and JS modules.
 */
async function loadHTML(selector, url) {
    const container = document.querySelector(selector);
    if (!container) return;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url}`);
        container.innerHTML = await response.text();
        
        const folderPath = url.substring(0, url.lastIndexOf('/'));
        const componentName = folderPath.split('/').pop();
        
        const cssPath = `${folderPath}/${componentName}.css`;
        const jsPath = `${folderPath}/${componentName}.js`;
        
        if (!document.querySelector(`link[href="${cssPath}"]`)) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = cssPath;
            document.head.appendChild(link);
        }
        
        // Dynamically import the JS module for the component
        // This allows drawer.js and header.js to be self-contained modules.
        await import(jsPath);
        
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