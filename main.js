import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    createUserWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    getStorage,
    ref,
    uploadString,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

import { firebaseConfig } from "/services/firebase-config.js";

// Keep track of the current section's cleanup logic to prevent memory leaks.
let currentSectionCleanup = null;

/**
 * Parses the browser's URL path into a structured object.
 * This version correctly handles the root path ('/') and ignores 'index.html'.
 */


/**
 * Dynamically loads a section's HTML, CSS, and JS module into the main content area.
 * @param {object} routeParams - The object of parameters returned by parseRoute().
 */
async function loadSection(routeParams) {
    if (!routeParams || !routeParams.section) {
        console.error("Invalid route parameters received. Defaulting to home.");
        routeParams = { section: 'home' };
    }
    const { section } = routeParams;
    const content = document.getElementById("content");
    
    // Run the cleanup function from the previously loaded section.
    if (typeof currentSectionCleanup === 'function') {
        currentSectionCleanup();
        currentSectionCleanup = null;
    }
    
    // Clear previous content and display the loading indicator immediately.
    content.innerHTML = '<div class="section-loader"></div>';
    document.getElementById("section-css")?.remove();
    content.dataset.section = section;
    
    try {
        // Using absolute paths from the site root is most reliable for localhost.
        const htmlPath = `/dashboard/${section}/${section}.html`;
        const cssPath = `/dashboard/${section}/${section}.css`;
        const jsPath = `/dashboard/${section}/${section}.js?v=${new Date().getTime()}`;
        
        // 1. Fetch HTML content in the background
        const htmlRes = await fetch(htmlPath);
        if (!htmlRes.ok) throw new Error(`HTML file not found at ${htmlPath} (${htmlRes.status})`);
        const sectionHtml = await htmlRes.text(); // Store HTML in a variable instead of directly inserting
        
        // 2. Load CSS stylesheet
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssPath;
        link.id = "section-css";
        document.head.appendChild(link);
        
        // 3. Dynamically import the JavaScript module for the section
        const sectionModule = await import(jsPath);
        
        // 4. All assets are loaded, now replace the loader with the actual HTML.
        content.innerHTML = sectionHtml;
        
        // 5. Initialize the new section's script
        if (sectionModule.init) {
            currentSectionCleanup = sectionModule.init(routeParams);
        } else {
            console.warn(`Section "${section}" loaded, but it has no export function init().`);
        }
        
    } catch (err) {
        // If an error occurs, replace the loader with an error message.
        content.innerHTML = `<p>Error loading section: <strong>${section}</strong></p>`;
        console.error(`Failed to load section ${section}:`, err);
        console.dir(err);
    }
    
    updateActiveNav(section);
}

/**
 * The main router function that orchestrates page loads.
 */
function parseRoute() {
    const pathParts = window.location.pathname.split('/').filter(p => p);

    if (pathParts.length === 0) {
        return { section: 'home' }; // Default route for "/"
    }

    const resourceType = pathParts[0];

    switch (resourceType) {
        case 'tasks':
            // This case handles the complex /tasks URL structure and is working correctly.
            return {
                section: 'tasks',
                accountId: pathParts[1] || null,
                tabId: pathParts[2] || 'list',
                projectId: pathParts[3] || null
            };

        // [THE FIX] Add all of your other simple sections here.
        case 'home':
        case 'myworkspace':
        case 'inbox':
        case 'reports':
        case 'goals':
        case 'settings':
            // This now handles all simple routes that just need the section name.
            return { section: resourceType };
            
        default:
            // If the URL is something unknown, fall back to the home page.
            return { section: 'home' };
    }
}

// Your router function still works perfectly with this new parser.
function router() {
    const routeParams = parseRoute();
    console.log("Routing with keyword-aware parser:", routeParams);
    loadSection(routeParams);
}

/**
 * Updates the visual 'active' state of the main navigation links.
 */
function updateActiveNav(sectionName) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  // This is the correct version that works with our modern router.
  const activeLink = document.querySelector(`.nav-item a[data-section="${sectionName}"]`);
  if (activeLink) {
    activeLink.closest('.nav-item').classList.add('active');
  }
}

// DELETED: The duplicate, incorrect version of updateActiveNav has been removed.

/**
 * Loads persistent HTML components like the header or drawer.
 * This function is left unchanged as requested.
 */
async function loadHTML(selector, url) {
  const container = document.querySelector(selector);
  try {
    const response = await fetch(url);
    container.innerHTML = await response.text();
    
    let cssFileName = null;
    let cssId = null;
    let jsFileName = null;
    let jsId = null;
    
    if (url.includes("header/header.html")) {
      cssFileName = "header.css";
      cssId = "header-css";
      jsFileName = "header.js";
      jsId = "header-js";
    } else if (url.includes("drawer/drawer.html")) {
      cssFileName = "drawer.css";
      cssId = "drawer-css";
      jsFileName = "drawer.js";
      jsId = "drawer-js";
    } else if (url.includes("sidebar/sidebar.html")) {
  cssFileName = "sidebar.css";
  cssId = "sidebar-css";
  jsFileName = "sidebar.js";
  jsId = "sidebar-js";
}
    
    // Load CSS
    if (cssFileName && cssId && !document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      const folderPath = url.substring(0, url.lastIndexOf('/'));
      link.href = `${folderPath}/${cssFileName}`;
      link.id = cssId;
      document.head.appendChild(link);
    }
    
    // Load JS
    if (jsFileName && jsId && !document.getElementById(jsId)) {
      const script = document.createElement("script");
      const folderPath = url.substring(0, url.lastIndexOf('/'));
      script.src = `${folderPath}/${jsFileName}`;
      script.id = jsId;
      script.onload = () => {
  console.log(`${jsFileName} loaded successfully.`);
  // If this is the sidebar script, call its init function now.
  if (jsFileName === 'sidebar.js' && window.TaskSidebar && typeof window.TaskSidebar.init === 'function') {
    window.TaskSidebar.init();
  }
  
};
      script.defer = true;
      document.body.appendChild(script);
    }
    
    
    
  } catch (err) {
    container.innerHTML = `<p>Error loading ${url}</p>`;
    console.error("Failed to load HTML:", err);
  }
}

/**
 * Attaches event listeners for the navigation drawer.
 * This function is left unchanged as requested.
 */
function attachDrawerToggleLogic() {
  const sectionHeaders = document.querySelectorAll('.section-header');
  const drawer = document.getElementById("dashboardDrawer");
  const menuToggle = document.getElementById("menuToggle");
  
  if (drawer) drawer.style.transition = "width 0.3s ease";
  
  if (menuToggle && drawer) {
    menuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const currentWidth = parseInt(getComputedStyle(drawer).width, 10);
      drawer.style.width = currentWidth > 100 ? "80px" : "260px";
    });
  }
  
  sectionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const section = header.closest('.nav-section');
      section.classList.toggle('open');
    });
  });
}

//
// --- APPLICATION INITIALIZATION SPA MAIN ROUTER DASHBOARD ---
//
document.addEventListener("DOMContentLoaded", () => {
    // Initialize Firebase
console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
const storage = getStorage(app);
    
    // This is the authentication gate. Nothing below runs until Firebase confirms the user's status.
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // --- USER IS LOGGED IN ---
            // Proceed with building the dashboard because we have an authenticated user.
            console.log("Authenticated user found:", user.uid, ". Initializing dashboard...");
            
            await Promise.all([
                // Use root-relative paths (starting with '/') for reliability
                loadHTML("#top-header", "/dashboard/header/header.html"),
                loadHTML("#rootdrawer", "/dashboard/drawer/drawer.html"),
                loadHTML("#right-sidebar", "/dashboard/sidebar/sidebar.html"),
            ]);
            
            document.querySelectorAll('.nav-item a[href^="#"]').forEach(link => {
                const section = link.getAttribute('href').substring(1);
                link.setAttribute('data-section', section);
            });
            
            document.body.addEventListener('click', (e) => {
                const navLink = e.target.closest('a[data-section]');
                if (navLink) {
                    e.preventDefault();
                    const section = navLink.getAttribute('data-section');
                    // Hardcoded URL for demonstration purposes
                    const newUrl = (section === 'tasks') ?
                        `/tasks/22887391981/list/22887391981` :
                        `/${section}`;
                    
                    history.pushState({ path: newUrl }, '', newUrl);
                    router(); // This is your router function defined elsewhere
                }
            });
            
            // Listen for the 'popstate' event (browser back/forward buttons).
            window.addEventListener('popstate', router);
            
            // Trigger the router on the initial page load.
            router();
            
            
            
        } else {
            // --- USER IS NOT LOGGED IN ---
            // No authenticated user was found. Redirect to the login page immediately.
            console.log("No authenticated user. Redirecting to /login/...");
            window.location.href = '/login/login.html';
        }
    });
});

