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

function showEmailModal() {
  // Inject styles if not already present
  if (!document.getElementById("modalStyles")) {
    const style = document.createElement("style");
    style.id = "modalStyles";
    style.textContent = `
   .modalContainer {
  background: rgba(45, 45, 45, 0.6); /* translucent dark */
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 24px;
  border-radius: 20px;
  width: 400px;
  max-width: 90%;
  color: #f1f1f1;
  font-family: "Inter", "Segoe UI", sans-serif;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  transition: all 0.3s ease;
}

/* Header */
.headerSection {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.closeButton {
  cursor: pointer;
  font-size: 22px;
  color: #aaa;
  transition: color 0.2s ease;
}
.closeButton:hover {
  color: #fff;
}

/* Input Group */
.inputGroup {
  margin-bottom: 18px;
}
.inputGroup label {
  display: block;
  margin-bottom: 6px;
  color: #ccc;
  font-weight: 500;
}

/* Tag Input Area */
.tagInputContainer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  align-items: flex-start;
}
.emailTagInputContainer {
  min-height: 80px;
}
.projectTagInputContainer {
  min-height: 100px;
}

/* Tags */
.tag {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  color: #ffffff;
  font-size: 14px;
}
.tag .tagIcon {
  margin-right: 6px;
}
.tag .removeTag {
  margin-left: 6px;
  cursor: pointer;
  font-size: 16px;
  color: #bbb;
}
.tag .removeTag:hover {
  color: #fff;
}

/* Text Area */
.inputField {
  flex-grow: 1;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 15px;
  outline: none;
  min-width: 50px;
  resize: none;
  overflow-y: auto;
  padding: 4px;
}
.inputField::placeholder {
  color: #888;
}

/* Suggestion Box */
.suggestionBox {
  display: none;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  margin-top: 8px;
  cursor: pointer;
  transition: background 0.2s ease;
}
.suggestionBox:hover {
  background: rgba(255, 255, 255, 0.12);
}
.suggestionBox span {
  color: #1e90ff;
  margin-left: 8px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Send Button */
.sendButton {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 12px 24px;
  color: #fff;
  border-radius: 16px;
  cursor: pointer;
  font-weight: 600;
  float: right;
  transition: background 0.3s ease, border 0.3s ease;
}
.sendButton:hover {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

    `;
    document.head.appendChild(style);
  }

  // Prevent duplicate modals
  if (document.querySelector('.modalContainer')) return;

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'modalContainer';
  modal.innerHTML = `
    <div class="headerSection">
      <h2>Invite people to My workspace</h2>
      <span class="closeButton">×</span>
    </div>
    <div class="inputGroup">
      <label>Email addresses <i class='bx bx-info-circle'></i></label>
      <div class="inputWrapper">
        <div class="tagInputContainer emailTagInputContainer" id="emailTagInputContainer">
          <textarea id="emailInputField" class="inputField" placeholder="name@gmail.com, name@gmail.com, ..."></textarea>
        </div>
        <div class="suggestionBox" id="emailSuggestionBox">
          <i class='bx bx-envelope'></i><span id="emailSuggestionText">Invite: h@gmail.com</span>
        </div>
      </div>
    </div>
    <div class="inputGroup">
      <label>Add to projects <i class='bx bx-info-circle'></i></label>
      <div class="inputWrapper">
        <div class="tagInputContainer projectTagInputContainer" id="projectTagInputContainer">
          <textarea id="projectInputField" class="inputField" placeholder="Start typing to add projects"></textarea>
        </div>
        <div class="suggestionBox" id="projectSuggestionBox">
          <i class='bx bx-folder'></i><span id="projectSuggestionText">Project: h</span>
        </div>
      </div>
    </div>
    <button class="sendButton">Send</button>
  `;

  document.body.appendChild(modal);

  // Add tag utility
  function addTag(container, text, iconClass) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.setAttribute('data-value', text);
    tag.innerHTML = `<i class='bx ${iconClass}'></i> ${text}`;
    container.appendChild(tag);
  }

  // Selectors and logic
  const emailInputField = modal.querySelector('#emailInputField');
  const emailSuggestionBox = modal.querySelector('#emailSuggestionBox');
  const emailSuggestionText = modal.querySelector('#emailSuggestionText');
  const emailTagInputContainer = modal.querySelector('#emailTagInputContainer');
  const projectInputField = modal.querySelector('#projectInputField');
  const projectSuggestionBox = modal.querySelector('#projectSuggestionBox');
  const projectSuggestionText = modal.querySelector('#projectSuggestionText');
  const projectTagInputContainer = modal.querySelector('#projectTagInputContainer');

  const projectDataModel = ["h", "home", "help"];

  emailInputField.addEventListener('input', () => {
    const value = emailInputField.value.trim();
    if (value) {
      emailSuggestionBox.style.display = 'flex';
      emailSuggestionText.textContent = `Invite: ${value}@gmail.com`;
    } else {
      emailSuggestionBox.style.display = 'none';
    }
  });

  emailSuggestionBox.addEventListener('click', () => {
    const email = emailSuggestionText.textContent.replace('Invite: ', '');
    addTag(emailTagInputContainer, email, 'bx-envelope');
    emailInputField.value = '';
    emailSuggestionBox.style.display = 'none';
    emailInputField.focus();
  });

  projectInputField.addEventListener('input', () => {
    const value = projectInputField.value.trim().toLowerCase();
    const suggestion = projectDataModel.find(project => project.startsWith(value));
    if (suggestion) {
      projectSuggestionBox.style.display = 'flex';
      projectSuggestionText.textContent = `Project: ${suggestion}`;
    } else {
      projectSuggestionBox.style.display = 'none';
    }
  });

  projectSuggestionBox.addEventListener('click', () => {
    const project = projectSuggestionText.textContent.replace('Project: ', '');
    addTag(projectTagInputContainer, project, 'bx-folder');
    projectInputField.value = '';
    projectSuggestionBox.style.display = 'none';
    projectInputField.focus();
  });

  modal.querySelector('.closeButton').addEventListener('click', () => {
    modal.remove();
  });

  modal.querySelector('.sendButton').addEventListener('click', () => {
    const emails = Array.from(emailTagInputContainer.querySelectorAll('.tag')).map(tag => tag.getAttribute('data-value'));
    const projects = Array.from(projectTagInputContainer.querySelectorAll('.tag')).map(tag => tag.getAttribute('data-value'));
    if (emails.length || projects.length) {
      console.log('Inviting:', { emails, projects });
    } else {
      alert('Please enter at least one email address or project.');
    }
  });
}

// --- APPLICATION INITIALIZATION ---
// This block runs once the initial HTML document has been fully loaded and parsed.
document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([
    loadHTML("#top-header", "../dashboard/header/header.html"),
    loadHTML("#rootdrawer", "../dashboard/drawer/drawer.html"),
    loadHTML("#right-sidebar", "../dashboard/sidebar/sidebar.html"),
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

