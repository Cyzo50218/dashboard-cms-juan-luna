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
 * Parses the browser's URL path.
 * -- NO CHANGES NEEDED HERE --
 */
function parseRoute() {
    const pathParts = window.location.pathname.split('/').filter(p => p);
    
    // --- FIX: The "tasks" section should load the "home" module ---
    // The visual content for tasks is in home.html/js
    if (pathParts[0] === 'tasks' && pathParts.length > 3) {
        return {
            section: 'tasks',
            accountId: pathParts[1] || null,
            tabId: pathParts[2] || 'list',
            projectId: pathParts[3] || null
        };
    }
    
    const simpleRoutes = ['home', 'myworkspace', 'inbox', 'reports', 'goals', 'settings'];
    if (pathParts.length === 0 || simpleRoutes.includes(pathParts[0])) {
        return { section: pathParts[0] || 'home' };
    }
    
    return { section: 'home' }; // Fallback
}

/**
 * The main router function.
 * -- NO CHANGES NEEDED HERE --
 */
function router() {
    const routeParams = parseRoute();
    console.log("Routing to:", routeParams);
    loadSection(routeParams);
}

/**
 * Dynamically loads a section's HTML, CSS, and JS module.
 * -- NO CHANGES NEEDED HERE --
 */
async function loadSection(routeParams) {
    if (!routeParams || !routeParams.section) {
        console.error("Invalid route. Defaulting to home.");
        routeParams = { section: 'home' };
    }
    const { section } = routeParams;
    const content = document.getElementById("content");
    
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
 * Updates the visual 'active' state of the main navigation links.
 * -- NO CHANGES NEEDED HERE --
 */
function updateActiveNav(sectionName) {
    const drawer = document.getElementById("dashboardDrawer");
    if (!drawer) return;
    
    drawer.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // --- FIX: Highlight the correct parent nav item ---
    // The page for /tasks/... is 'home', but the nav item is 'my-tasks-link'.
    // A better approach is to not rely on href at all.
    let activeEl;
    if (sectionName === 'home') {
        // If we are on a project page, highlight that project in the drawer
        const routeParams = parseRoute();
        const drawerProjectItem = drawer.querySelector(`.project-item[data-numeric-id="${routeParams.projectId}"]`);
        if (drawerProjectItem) {
            activeEl = drawerProjectItem;
        } else {
            // Fallback to highlighting the main "My Tasks" link
             activeEl = drawer.querySelector('#my-tasks-link')?.closest('.nav-item');
        }
    } else {
         activeEl = drawer.querySelector(`.nav-item a[href="/${sectionName}"]`)?.closest('.nav-item');
    }
    
    if(activeEl) {
        activeEl.classList.add('active');
    }
}

/**
 * Asynchronously loads a component and its resources.
 * -- NO CHANGES NEEDED HERE --
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
        
        await import(jsPath);
        
    } catch (err) {
        container.innerHTML = `<p>Error loading component from ${url}</p>`;
        console.error("Failed to load component:", err);
    }
}

// --- APPLICATION INITIALIZATION (RESTRUCTURED) ---
document.addEventListener("DOMContentLoaded", () => {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("Authenticated user found. Initializing dashboard...");
            
            // --- FIX: Await the loading of essential components ---
            // We ensure the drawer and header are fully loaded and their JS has run
            // BEFORE we set up the router.
            await loadHTML("#top-header", "/dashboard/header/header.html");
            await loadHTML("#rootdrawer", "/dashboard/drawer/drawer.html");
            
            // Now that the drawer logic is guaranteed to be running, we can
            // safely initialize the router.
            initializeRouter();
            
        } else {
            console.log("No authenticated user. Redirecting to /login/...");
            if (!window.location.pathname.includes('/login/')) {
                 window.location.href = '/login/login.html';
            }
        }
    });
});

/**
 * Sets up the global click handler and initial route call.
 * This is now its own function to ensure it only runs after prerequisites are met.
 */
function initializeRouter() {
    // This single listener handles all SPA routing clicks.
    document.body.addEventListener('click', e => {
        const link = e.target.closest('a[data-link]');
        if (link) {
            e.preventDefault();
            // Only push state if the URL is different to avoid duplicate history entries
            if (link.href !== window.location.href) {
                history.pushState(null, '', link.href);
                router();
            }
        }
    });
    
    window.addEventListener('popstate', router); // Handle back/forward buttons
    router(); // Initial route call for the first page load
}