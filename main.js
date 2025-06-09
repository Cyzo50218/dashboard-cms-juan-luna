// Keep track of the current section's cleanup logic to prevent memory leaks.
let currentSectionCleanup = null;

/**
 * Parses the browser's URL path into a structured object.
 * This version correctly handles the root path ('/') and ignores 'index.html'.
 */
function parseRoute() {
  const pathParts = window.location.pathname.split('/').filter(p => {
    return p && p !== 'index.html';
  });
  const [section = 'home', accountId = null, tabId = null, projectId = null] = pathParts;
  return { section, accountId, tabId, projectId };
}

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
  
  // Clear the content area and remove old assets.
  content.innerHTML = "";
  document.getElementById("section-css")?.remove();
  content.dataset.section = section;
  
  try {
    // Using absolute paths from the site root is most reliable for localhost.
    const htmlPath = `/dashboard/${section}/${section}.html`;
    const cssPath = `/dashboard/${section}/${section}.css`;
    const jsPath = `/dashboard/${section}/${section}.js?v=${new Date().getTime()}`;
    
    // 1. Load HTML content
    const htmlRes = await fetch(htmlPath);
    if (!htmlRes.ok) throw new Error(`HTML file not found at ${htmlPath} (${htmlRes.status})`);
    content.innerHTML = await htmlRes.text();
    
    // 2. Load CSS stylesheet
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssPath;
    link.id = "section-css";
    document.head.appendChild(link);
    
    // 3. Dynamically import the JavaScript module for the section
    const sectionModule = await import(jsPath);
    
    if (sectionModule.init) {
      currentSectionCleanup = sectionModule.init(routeParams);
    } else {
      console.warn(`Section "${section}" loaded, but it has no export function init().`);
    }
    
  } catch (err) {
    content.innerHTML = `<p>Error loading section: <strong>${section}</strong></p>`;
    console.error(`Failed to load section ${section}:`, err);
    console.dir(err);
  }
  
  updateActiveNav(section);
}

/**
 * The main router function that orchestrates page loads.
 */
function router() {
  const routeParams = parseRoute();
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
      script.defer = true;
      document.body.appendChild(script);
    }
    
    if (url.includes("drawer/drawer.html")) {
      attachDrawerToggleLogic();
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

// --- APPLICATION INITIALIZATION ---
// This block runs once the initial HTML document has been fully loaded and parsed.
// FIXED: Added 'async' keyword here to handle the 'await' for loading HTML.
document.addEventListener("DOMContentLoaded", async () => {
  
  // Load persistent parts of the UI first
  await Promise.all([
    loadHTML("#top-header", "../dashboard/header/header.html"),
    loadHTML("#rootdrawer", "../dashboard/drawer/drawer.html"),
    loadHTML("#right-sidebar", "../dashboard/sidebar/sidebar.html"),
  ]);
  
  // Go through navigation links and add a `data-section` attribute.
  document.querySelectorAll('.nav-item a[href^="#"]').forEach(link => {
    const section = link.getAttribute('href').substring(1);
    link.setAttribute('data-section', section);
  });
  
  // Set up a single, central click handler for all main navigation.
  document.body.addEventListener('click', (e) => {
    const navLink = e.target.closest('a[data-section]');
    if (navLink) {
      e.preventDefault();
      const section = navLink.getAttribute('data-section');
      let newUrl = `/${section}`;
      
      if (section === 'tasks') {
        newUrl = `/tasks/22887391981/list/22887391981`;
      }
      
      history.pushState({ path: newUrl }, '', newUrl);
      router();
    }
  });
  
  // Listen for the 'popstate' event (browser back/forward buttons).
  window.addEventListener('popstate', router);
  
  // Trigger the router on the initial page load.
  router();
});