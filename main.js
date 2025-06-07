// Keep track of the current section's cleanup logic
let currentSectionCleanup = null;

// Load a content section with HTML + JS + CSS (for all swappable sections, including 'home')
async function loadSection(sectionName) {
  const content = document.getElementById("content");

  // Run cleanup for previous section
  if (typeof currentSectionCleanup === 'function') {
    currentSectionCleanup();
    currentSectionCleanup = null;
  }

  // Reset content and remove old assets
  content.innerHTML = "";
  document.getElementById("section-script")?.remove();
  document.getElementById("section-css")?.remove();

  // Set section metadata
  content.dataset.section = sectionName;

  try {
    // Load HTML
    const htmlRes = await fetch(`../dashboard/${sectionName}/${sectionName}.html`);
    content.innerHTML = await htmlRes.text();

    // Load CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `../dashboard/${sectionName}/${sectionName}.css`;
    link.id = "section-css";
    document.head.appendChild(link);

    // Dynamically import JS module
    const sectionModule = await import(`../dashboard/${sectionName}/${sectionName}.js?v=${new Date().getTime()}`);
    if (sectionModule.init) {
      currentSectionCleanup = sectionModule.init(); // Store cleanup
    }
} catch (err) {
    const sectionName = "home"; // Assuming sectionName is 'home' from your example
    content.innerHTML = `<p>Error loading section: ${sectionName}</p>`;

    console.error(`Failed to load section ${sectionName}:`, err);

    // --- Added code to extract more details ---

    // 1. Explicitly log the message and stack if available
    if (err instanceof TypeError || err instanceof Error) {
        console.error(`Error Type: ${err.name}`);
        console.error(`Error Message: ${err.message}`);
        if (err.stack) {
            console.error(`Stack Trace:\n${err.stack}`);
        } else {
            console.error(`No stack trace available for this error.`);
        }
    } else {
        // Fallback for non-Error objects (e.g., if a string was thrown)
        console.error(`Caught non-Error object:`, err);
    }

    // 2. Use console.dir() for a more interactive object inspection
    // This often reveals non-enumerable properties like 'message' and 'stack' in browser consoles.
    console.dir(err);

    // 3. Try JSON.stringify with a replacer to handle non-enumerable properties
    // This is more for getting a string representation that you might send to a server.
    // It's less useful for direct browser console debugging if the above works.
    try {
        const errorDetails = JSON.stringify(err, Object.getOwnPropertyNames(err));
        console.error(`Full error object (JSON stringified):`, errorDetails);
    } catch (jsonErr) {
        console.error(`Could not stringify error object:`, jsonErr);
    }
}



  // Highlight the active nav item
  updateActiveNav(sectionName);
}

function updateActiveNav(sectionName) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeLink = document.querySelector(`.nav-item a[href="#${sectionName}"]`);
  if (activeLink) {
    activeLink.closest('.nav-item').classList.add('active');
  }
}

// Load persistent HTML with optional CSS and JS
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

// Hash-based router
function router() {
  const sectionName = window.location.hash.substring(1) || 'home';
  loadSection(sectionName);
}

// DOM ready
document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([
    loadHTML("#top-header", "../dashboard/header/header.html"),
    loadHTML("#rootdrawer", "../dashboard/drawer/drawer.html"),
  ]);

  window.addEventListener('hashchange', router);
  router(); // Load default

document.body.addEventListener('click', (e) => {
  const navItem = e.target.closest('.nav-item a[href^="#"]');
  if (navItem) {
    const targetHash = navItem.getAttribute("href");
    if (targetHash) {
      window.location.hash = targetHash;
      e.preventDefault(); // avoid default link behavior
    }
  }
});

});
