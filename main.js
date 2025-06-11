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
    let modalStyles = document.getElementById("modalStyles");
    if (!modalStyles) {
        const style = document.createElement("style");
        style.id = "modalStyles";
        style.textContent = `
            .modalContainer {
                background: rgba(45, 45, 45, 0.6);
                backdrop-filter: blur(20px) saturate(150%);
                -webkit-backdrop-filter: blur(20px) saturate(150%);
                border: 1px solid rgba(255, 255, 255, 0.1);
                padding: 24px;
                border-radius: 20px;
                width: 650px; /* Modal width */
                max-width: 95%;
                color: #f1f1f1;
                font-family: "Inter", "Segoe UI", sans-serif;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
                overflow: hidden;
                transition: all 0.3s ease;
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 1000;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                font-size: 14px;
            }
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
            .inputGroup {
                margin-bottom: 18px;
            }
            .inputGroup label {
                display: block;
                margin-bottom: 6px;
                color: #ccc;
                font-weight: 500;
            }
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
                min-height: 40px;
                height: auto;
                overflow-y: auto;
            }
            .projectTagInputContainer .inputField {
                height: 24px;
                min-height: 24px;
                overflow: hidden;
            }


            .tag {
                display: flex;
                align-items: center;
                padding: 6px 12px;
                background: rgba(255, 255, 255, 0.15);
                border-radius: 20px;
                color: #e0e0e0;
                font-size: 14px;
                font-weight: normal;
            }
            .tag .tagIcon {
                margin-right: 6px;
            }
            .tag .removeTag {
                margin-left: 6px;
                cursor: pointer;
                font-size: 16px;
                color: #ccc;
            }
            .tag .removeTag:hover {
                color: #fff;
            }

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
                color: #fff;
                opacity: 0.7;
            }


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

            /* Project Dropdown Specific Styles */
            .projectDropdown {
                position: fixed;
                background: rgba(45, 45, 45, 0.95);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
                max-height: 300px;
                overflow-y: auto;
                z-index: 99999;
                display: none;
            }
            .projectDropdown-item {
                display: flex;
                align-items: center;
                padding: 10px 15px;
                cursor: pointer;
                transition: background 0.2s ease;
            }
            .projectDropdown-item:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            .projectDropdown-item .bx {
                margin-right: 10px;
                font-size: 18px;
            }
            .projectDropdown-item span {
                color: #f1f1f1;
            }


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
                margin-top: 20px;
            }
            .sendButton:hover {
                background: rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.3);
            }
        `;
        document.head.appendChild(style);
    }

    if (document.querySelector('.modalContainer')) return;

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
            </div>
        </div>
        <button class="sendButton">Send</button>
    `;

    document.body.appendChild(modal);

    const projectDropdown = document.createElement('div');
    projectDropdown.className = 'projectDropdown';
    projectDropdown.id = 'projectDropdown';
    document.body.appendChild(projectDropdown);

    function addTag(container, text, iconClass) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.setAttribute('data-value', text);
        tag.innerHTML = `<i class='bx ${iconClass}'></i> ${text} <span class="removeTag">×</span>`;
        container.appendChild(tag);

        tag.querySelector('.removeTag').addEventListener('click', () => {
            tag.remove();
        });
    }

    function getRandomVibrantColor() {
        const hue = Math.floor(Math.random() * 360);
        const saturation = 90 + Math.floor(Math.random() * 10);
        const lightness = 60 + Math.floor(Math.random() * 10);
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    const emailInputField = modal.querySelector('#emailInputField');
    const emailSuggestionBox = modal.querySelector('#emailSuggestionBox');
    const emailSuggestionText = modal.querySelector('#emailSuggestionText');
    const emailTagInputContainer = modal.querySelector('#emailTagInputContainer');
    const projectInputField = modal.querySelector('#projectInputField');
    const projectTagInputContainer = modal.querySelector('#projectTagInputContainer');

    const projectDataModel = [
        { name: "My First Project", icon: "bx-folder-open" },
        { name: "Work Tasks", icon: "bx-briefcase" },
        { name: "Personal Ideas", icon: "bx-bulb" },
        { name: "Design Concepts", icon: "bx-palette" },
        { name: "Development Hub", icon: "bx-code-alt" },
        { name: "Marketing Campaigns", icon: "bx-megaphone" },
        { name: "Client XYZ", icon: "bx-group" },
        { name: "Home Budget", icon: "bx-home-alt" },
        { name: "Travel Plans", icon: "bx-plane" },
        { name: "Reading List", icon: "bx-book-open" },
        { name: "Fitness Goals", icon: "bx-dumbbell" },
        { name: "Recipe Collection", icon: "bx-dish" },
        { name: "Meeting Notes", icon: "bx-notepad" },
        { name: "Product Launch", icon: "bx-rocket" }
    ];

    function positionProjectDropdown() {
        if (projectDropdown.style.display === 'block') {
            const rect = projectInputField.getBoundingClientRect();
            projectDropdown.style.top = `${rect.bottom}px`;
            projectDropdown.style.left = `${rect.left}px`;
            projectDropdown.style.width = `${rect.width}px`;
        }
    }

    // --- Email Input Logic ---
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
        if (email.match(/^.+@.+\..+$/)) {
            const existingEmails = Array.from(emailTagInputContainer.querySelectorAll('.tag')).map(tag => tag.getAttribute('data-value'));
            if (!existingEmails.includes(email)) {
                // MODIFIED: Use 'bx-user-circle' for email tags
                addTag(emailTagInputContainer, email, 'bx-user-circle');
            }
        } else {
            alert('Invalid email format for suggestion.');
        }
        emailInputField.value = '';
        emailSuggestionBox.style.display = 'none';
        emailInputField.focus();
    });


    // --- Project Input Logic with Dropdown ---
    projectInputField.addEventListener('input', () => {
        const query = projectInputField.value.trim().toLowerCase();
        projectDropdown.innerHTML = '';

        if (query.length > 0) {
            const existingProjectNames = Array.from(projectTagInputContainer.querySelectorAll('.tag'))
                                            .map(tag => tag.getAttribute('data-value').toLowerCase());

            const filteredProjects = projectDataModel.filter(project =>
                project.name.toLowerCase().includes(query) && !existingProjectNames.includes(project.name.toLowerCase())
            );

            if (filteredProjects.length > 0) {
                filteredProjects.forEach(project => {
                    const item = document.createElement('div');
                    item.className = 'projectDropdown-item';
                    const randomColor = getRandomVibrantColor();
                    // MODIFIED: Ensure project.icon is used here for the dropdown icon
                    item.innerHTML = `<i class='bx ${project.icon}' style="color: ${randomColor};"></i> <span>${project.name}</span>`;
                    item.setAttribute('data-project-name', project.name);
                    item.setAttribute('data-project-icon', project.icon);

                    item.addEventListener('click', () => {
                        addTag(projectTagInputContainer, project.name, project.icon);
                        projectInputField.value = '';
                        projectDropdown.style.display = 'none';
                        projectDropdown.innerHTML = '';
                        projectInputField.focus();
                    });
                    projectDropdown.appendChild(item);
                });
                projectDropdown.style.display = 'block';
                positionProjectDropdown();
            } else {
                projectDropdown.style.display = 'none';
            }
        } else {
            projectDropdown.style.display = 'none';
        }
    });

    projectInputField.addEventListener('focus', () => {
        if (projectDropdown.style.display !== 'block' && projectInputField.value.trim().length > 0) {
            projectInputField.dispatchEvent(new Event('input'));
        }
    });

    document.addEventListener('click', (event) => {
        if (!projectInputField.contains(event.target) && !projectDropdown.contains(event.target)) {
            projectDropdown.style.display = 'none';
        }
    });

    window.addEventListener('resize', positionProjectDropdown);
    window.addEventListener('scroll', positionProjectDropdown);


    // --- Close and Send Button Logic ---
    modal.querySelector('.closeButton').addEventListener('click', () => {
        modal.remove();
        projectDropdown.remove();
        window.removeEventListener('resize', positionProjectDropdown);
        window.removeEventListener('scroll', positionProjectDropdown);
    });

    modal.querySelector('.sendButton').addEventListener('click', () => {
        const emails = Array.from(emailTagInputContainer.querySelectorAll('.tag')).map(tag => tag.getAttribute('data-value'));
        const projects = Array.from(projectTagInputContainer.querySelectorAll('.tag')).map(tag => tag.getAttribute('data-value'));

        const pendingEmail = emailInputField.value.trim();
        if (pendingEmail && pendingEmail.match(/^.+@.+\..+$/)) {
            if (!emails.includes(pendingEmail)) {
                emails.push(pendingEmail);
            }
        } else if (pendingEmail) {
            alert('Warning: Unadded text in email field is not a valid email and will be ignored.');
        }

        if (emails.length || projects.length) {
            console.log('Inviting:', { emails, projects });
            alert(`Inviting: Emails: ${emails.join(', ')}\nProjects: ${projects.join(', ')}`);
            modal.remove();
            projectDropdown.remove();
            window.removeEventListener('resize', positionProjectDropdown);
            window.removeEventListener('scroll', positionProjectDropdown);
        } else {
            alert('Please enter at least one email address or project.');
        }
    });
}


/**
 * Creates and injects the share project modal into the DOM.
 * This function handles the one-time creation of the UI (CSS and HTML).
 * @param {Event} e - The click event that triggered the modal creation.
 */
const createShareModal = (e) => {
    // Stop the click that opened the modal from bubbling up to the body
    // and potentially triggering a close listener immediately.
    if (e) {
        e.stopPropagation();
    }

    // Prevent creating duplicate modals if one is already in the DOM.
    if (document.getElementById('shareproject-modal-backdrop')) {
        return;
    }

    // --- CSS Styles ---
    const styles = `
    .hidden { display: none !important; }
    .shareproject-modal-backdrop {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.6); display: flex;
        justify-content: center; align-items: center; z-index: 1000;
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .shareproject-modal {
        background-color: white; border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
        width: 750px; display: flex; flex-direction: column;
        font-family: 'Inter', sans-serif; animation: slideIn 0.3s ease-out;
        max-height: 90vh;
        margin: auto;
        position: relative; /* Needed for dropdown positioning */
    }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .shareproject-modal-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 16px 24px; border-bottom: 1px solid #f0f0f0;
    }
    .shareproject-modal-header h2 { margin: 0; font-size: 18px; font-weight: 600; color: #111; }
    .shareproject-icon-btn {
        background: none; border: none; cursor: pointer; padding: 6px;
        border-radius: 50%; display: inline-flex; color: #555;
    }
    .shareproject-icon-btn:hover { background-color: #f4f4f4; }
    .shareproject-modal-body { padding: 16px 24px; overflow-y: auto; }
    .shareproject-modal-body > p.shareproject-section-title { font-size: 14px; font-weight: 500; color: #333; margin: 16px 0 8px 0; }
    .shareproject-invite-input-wrapper {
        position: relative;
        display: flex; align-items: center; border: 1px solid #e0e0e0;
        border-radius: 8px; padding: 4px; margin-bottom: 16px;
        transition: all 0.2s ease;
    }
    .shareproject-invite-input-wrapper:focus-within { border-color: #1267FA; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
    .shareproject-email-tags-container { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-left: 8px; }
    .shareproject-email-tag {
        display: flex; align-items: center; background-color: #eef2ff; color: #4338ca;
        padding: 4px 10px; border-radius: 6px; font-size: 14px; font-weight: 500;
    }
    .shareproject-email-tag .shareproject-remove-tag { cursor: pointer; margin-left: 8px; font-size: 16px; }
    #shareproject-email-input {
        flex-grow: 1; border: none; outline: none; padding: 8px;
        font-size: 14px; background: transparent; min-width: 150px;
    }
    .shareproject-invite-controls { display: flex; align-items: center; gap: 8px; padding-right: 4px;}
    .shareproject-role-selector, .shareproject-member-role { position: relative; }
    .shareproject-dropdown-btn {
        background-color: #fff; border: 1px solid #e0e0e0; border-radius: 6px;
        padding: 8px 12px; cursor: pointer; display: flex; align-items: center;
        font-size: 14px; white-space: nowrap;
    }
    .shareproject-dropdown-btn:hover { background-color: #f9f9f9; }
    .shareproject-dropdown-btn:disabled { background-color: #f9fafb; cursor: not-allowed; color: #555;}
    .shareproject-dropdown-content {
        position: absolute; top: calc(100% + 5px); right: 0; background-color: white;
        border: 1px solid #f0f0f0; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08); z-index: 1010; width: 300px;
        overflow: hidden; animation: fadeIn 0.2s ease;
    }
    .shareproject-dropdown-action {
        display: block; width: 100%; padding: 12px 16px;
        text-decoration: none; color: #333; background: none; border: none;
        cursor: pointer; text-align: left; font-family: 'Inter', sans-serif; font-size: 14px;
    }
    .shareproject-dropdown-action:hover, .shareproject-dropdown-content a.shareproject-remove:hover {
        background-color: #f4f4f4;
    }
    .shareproject-dropdown-content a { display: block; padding: 12px 16px; text-decoration: none; color: #333; }
    .shareproject-dropdown-content strong { font-weight: 500; display: flex; align-items: center; gap: 8px; }
    .shareproject-dropdown-content p { font-size: 13px; color: #666; margin: 4px 0 0 0; line-height: 1.4; }
    .shareproject-invite-btn {
        background-color: #3F7EEB; color: white; border: none;
        padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;
        transition: background-color 0.2s ease;
    }
    .shareproject-invite-btn:hover { background-color: #1267FA; }
    .shareproject-access-settings-wrapper { position: relative; }
    .shareproject-access-settings-btn {
        display: flex;
        align-items: flex-start;
        width: 100%;
        text-align: left;
        padding: 12px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        background: none;
    }
    .shareproject-access-settings-btn:hover { background-color: #f9f9f9; }
    .shareproject-access-settings-btn .material-icons { margin-right: 12px; color: #555; line-height: 1.4; }
    .shareproject-access-settings-btn div { flex-grow: 1; }
    .shareproject-members-list { margin-top: 16px; }
    .shareproject-member-item, .shareproject-pending-item { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .shareproject-member-item:last-child, .shareproject-pending-item:last-child { border-bottom: none; }
    .shareproject-profile-pic {
        width: 36px; height: 36px; border-radius: 50%; display: flex;
        align-items: center; justify-content: center; color: white;
        font-weight: 500; font-size: 14px; margin-right: 12px;
    }
    .shareproject-pending-icon {
        width: 36px; height: 36px; border-radius: 50%; display: flex;
        align-items: center; justify-content: center; margin-right: 12px;
        background-color: #f3f4f6; color: #6b7280;
    }
    .shareproject-member-info { flex-grow: 1; }
    .shareproject-member-info strong { font-size: 14px; font-weight: 500; color: #111; }
    .shareproject-member-info p { font-size: 13px; color: #666; margin: 2px 0 0 0; }
    .shareproject-resend-link { color: #3F7EEB; cursor: pointer; text-decoration: underline; }
    .shareproject-member-role .shareproject-dropdown-btn { background: none; border: none; padding: 4px 8px; color: #555; }
    .shareproject-member-role .shareproject-dropdown-content { width: 300px; } /* Increased width for description */
    .shareproject-member-role .shareproject-dropdown-content a.shareproject-remove { color: #ef4444; }
    .shareproject-modal-footer {
        padding: 16px 24px; border-top: 1px solid #f0f0f0;
        background-color: #f9fafb; display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;
    }
    .shareproject-copy-link-btn, #shareproject-leave-btn {
        background: none; border: 1px solid #e0e0e0; border-radius: 6px;
        padding: 8px 12px; cursor: pointer; display: flex;
        align-items: center; font-size: 14px; font-weight: 500;
    }
    .shareproject-copy-link-btn:hover, #shareproject-leave-btn:hover { background-color: #f4f4f4; }
    #shareproject-leave-btn { color: #ef4444; }
    #shareproject-leave-btn:hover { background-color: #fee2e2; }
    #shareproject-leave-btn .material-icons, .shareproject-copy-link-btn .material-icons { margin-right: 8px; color: #555; }
    #shareproject-leave-btn .material-icons { color: #ef4444; }
    .shareproject-user-search-dropdown {
        position: absolute; top: 100%; left: 0; right: 0;
        background-color: white; border: 1px solid #e0e0e0;
        border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        z-index: 1010; max-height: 200px; overflow-y: auto;
    }
    .shareproject-user-search-dropdown a { display: flex; align-items: center; padding: 8px 16px; text-decoration: none; color: #333; }
    .shareproject-user-search-dropdown a:hover { background-color: #f4f4f4; }
    .shareproject-user-search-dropdown a strong { font-weight: 500; }
    .shareproject-user-search-dropdown a span { font-size: 13px; color: #666; margin-left: 8px; }
    .shareproject-user-search-dropdown a .material-icons { margin-right: 12px; color: #555; }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // --- HTML Structure ---
    const modalHTML = `
    <div class="shareproject-modal">
        <div class="shareproject-modal-header">
            <h2>Share Dresmond Shirt Barong Supplier</h2>
            <button id="shareproject-close-modal-btn" class="shareproject-icon-btn"><i class="material-icons">close</i></button>
        </div>
        <div class="shareproject-modal-body">
            <div id="shareproject-invite-input-wrapper" class="shareproject-invite-input-wrapper">
                <div id="shareproject-email-tags" class="shareproject-email-tags-container"></div>
                <input type="text" id="shareproject-email-input" placeholder="Add members by email or name...">
                <div class="shareproject-invite-controls">
                    <div class="shareproject-role-selector">
                        <button id="shareproject-role-dropdown-btn" class="shareproject-dropdown-btn">
                            <span id="shareproject-selected-role">Editor</span><i class="material-icons">arrow_drop_down</i>
                        </button>
                    </div>
                    <button id="shareproject-invite-btn" class="shareproject-invite-btn">Invite</button>
                </div>
            </div>
            <div id="shareproject-role-dropdown" class="shareproject-dropdown-content hidden"></div>
            <div class="shareproject-access-settings-wrapper">
                <button id="shareproject-access-settings-btn" class="shareproject-access-settings-btn">
                    <i class="material-icons" id="shareproject-access-icon">public</i>
                    <div>
                        <strong id="shareproject-access-title">My Workspace</strong>
                        <p id="shareproject-access-desc">Everyone at workspace can find and access this project.</p>
                    </div>
                    <i class="material-icons">arrow_drop_down</i>
                </button>
            </div>
            <div id="shareproject-access-dropdown" class="shareproject-dropdown-content hidden" style="width: 100%;">
                <a href="#" data-access="workspace">
                    <strong><i class="material-icons">public</i> My Workspace</strong>
                    <p>Everyone at workspace can find and access this project.</p>
                </a>
                <a href="#" data-access="private">
                    <strong><i class="material-icons">lock</i> Private to Members</strong>
                    <p>Only invited members can find and access this project.</p>
                </a>
            </div>
            <p class="shareproject-section-title">Project Members</p>
            <div class="shareproject-members-list" id="shareproject-members-list"></div>
            <div id="shareproject-pending-list"></div>
        </div>
        <div class="shareproject-modal-footer">
            <div id="shareproject-footer-left"></div>
            <button class="shareproject-copy-link-btn"><i class="material-icons">link</i>Copy project link</button>
        </div>
    </div>
    `;
    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'shareproject-modal-backdrop';
    modalBackdrop.className = 'shareproject-modal-backdrop';
    modalBackdrop.innerHTML = modalHTML;
    document.body.appendChild(modalBackdrop);

    // After adding the modal to the DOM, set up its logic
    setupModalLogic();
};


/**
 * Sets up all the interactive logic for the Share Modal.
 * This includes data handling, rendering, and event listeners.
 */
const setupModalLogic = () => {
    // --- Mock Data ---
    const currentUserId = 3;
    let membersData = [
        { id: 1, name: 'Task collaborators', email: '', role: 'Editor', isGroup: true },
        { id: 2, name: 'My workspace', email: '2 members', role: 'Editor', isGroup: true },
        { id: 3, name: 'Clinton Ihegoro', email: 'myfavoritemappingswar@gmail.com', role: 'Project admin', isOwner: true },
        { id: 4, name: 'John Wick', email: 'john.wick@example.com', role: 'Editor' },
        { id: 5, name: 'Jane Doe', email: 'jane.doe@example.com', role: 'Viewer' }
    ];
    let pendingInvitations = [];
    const invitedEmails = [];
    const profileColors = ['#4A148C', '#004D40', '#BF360C', '#0D47A1', '#4E342E', '#AD1457', '#006064'];
    const rolesData = [
        { name: 'Project admin', description: 'Full access to change settings and modify.' },
        { name: 'Editor', description: 'Can add, edit, and delete anything.' },
        { name: 'Commenter', description: "Can comment, but can't edit." },
        { name: 'Viewer', description: "Can view, but can't add comments." }
    ];
    let projectAccessLevel = 'workspace';
    let activeDropdown = null;

    // --- DOM Elements ---
    const modal = document.querySelector('.shareproject-modal');
    const modalBackdrop = document.getElementById('shareproject-modal-backdrop');
    const closeModalBtn = document.getElementById('shareproject-close-modal-btn');
    const emailInput = document.getElementById('shareproject-email-input');
    const emailTagsContainer = document.getElementById('shareproject-email-tags');
    const inviteInputWrapper = document.querySelector('.shareproject-invite-input-wrapper');
    const inviteBtn = document.getElementById('shareproject-invite-btn');
    const roleDropdownBtn = document.getElementById('shareproject-role-dropdown-btn');
    const roleDropdown = document.getElementById('shareproject-role-dropdown');
    const selectedRoleSpan = document.getElementById('shareproject-selected-role');
    const membersList = document.getElementById('shareproject-members-list');
    const pendingList = document.getElementById('shareproject-pending-list');
    const accessSettingsBtn = document.getElementById('shareproject-access-settings-btn');
    const accessDropdown = document.getElementById('shareproject-access-dropdown');
    const footerLeftContainer = document.getElementById('shareproject-footer-left');
    const modalFooter = document.querySelector('.shareproject-modal-footer');

    // --- Functions ---
    const logActivity = (message) => {
        const timestamp = new Date().toISOString();
        console.log(`[Activity Log - ${timestamp}] ${message}`);
    };

    const closeModal = () => {
        const backdrop = document.getElementById('shareproject-modal-backdrop');
        if (backdrop) {
            backdrop.remove();
            logActivity("Share modal closed.");
        }
    };

    const createProfilePic = (name, isGroup = false) => {
        const pic = document.createElement('div');
        pic.className = 'shareproject-profile-pic';
        if (isGroup) {
            const icon = document.createElement('i');
            icon.className = 'material-icons';
            icon.textContent = name.includes('workspace') ? 'people' : 'work';
            pic.style.backgroundColor = '#e5e7eb';
            pic.style.color = '#4b5563';
            pic.appendChild(icon);
        } else {
            pic.textContent = name.split(' ').map(n => n[0]).join('').toUpperCase();
            const hash = name.split("").reduce((a, b) => (a = ((a << 5) - a) + b.charCodeAt(0), a & a), 0);
            pic.style.backgroundColor = profileColors[Math.abs(hash) % profileColors.length];
        }
        return pic;
    };

    const renderAll = () => {
        renderMembers();
        renderPendingInvitations();
        renderFooter();
    };

    const renderMembers = () => {
        membersList.innerHTML = '';
        const visibleMembers = projectAccessLevel === 'private' ?
            membersData.filter(m => !m.isGroup) :
            membersData;
        
        // FIX #2: Count admins to determine if the role change UI should be enabled.
        const adminCount = membersData.filter(m => m.isOwner && !m.isGroup).length;

        visibleMembers.forEach(member => {
            if (!member || !member.name) return;
            const item = document.createElement('div');
            item.className = 'shareproject-member-item';
            item.dataset.id = member.id;
            
            // FIX #2: A member is locked from role changes only if they are the last admin.
            const isLocked = member.isOwner && adminCount <= 1;

            let dropdownLinks = '';
            // Generate dropdown content only if the user is not locked.
            if (!isLocked) {
                const applicableRoles = member.isGroup ?
                    rolesData.filter(r => r.name === 'Editor' || r.name === 'Viewer') :
                    rolesData;

                const memberRoleOptions = applicableRoles.map(role => `<button class="shareproject-dropdown-action" data-role="${role.name}"><strong>${role.name}</strong><p>${role.description}</p></button>`).join('');
                const removeMemberLink = !member.isGroup ? `<a href="#" class="shareproject-remove"><i class="material-icons">person_remove</i> Remove member</a>` : '';
                dropdownLinks = memberRoleOptions + removeMemberLink;
            }

            item.innerHTML = `
                <div class="shareproject-member-info">
                    <strong>${member.name}</strong>
                    <p>${member.email}</p>
                </div>
                <div class="shareproject-member-role">
                    <button class="shareproject-dropdown-btn shareproject-member-role-btn" ${isLocked ? 'disabled' : ''}>
                        <span>${member.role}</span>
                        ${!isLocked ? '<i class="material-icons">arrow_drop_down</i>' : ''}
                    </button>
                    <div id="member-dropdown-${member.id}" class="shareproject-dropdown-content hidden shareproject-member-dropdown-content">
                        ${dropdownLinks}
                    </div>
                </div>
            `;
            item.prepend(createProfilePic(member.name, member.isGroup));
            membersList.appendChild(item);
        });
    };

    const renderPendingInvitations = () => {
        pendingList.innerHTML = '';
        if (pendingInvitations.length > 0 && !document.querySelector('#shareproject-pending-list-title')) {
            const title = document.createElement('p');
            title.id = 'shareproject-pending-list-title';
            title.className = 'shareproject-section-title';
            title.textContent = 'Pending Invitations';
            membersList.insertAdjacentElement('afterend', title);
        } else if (pendingInvitations.length === 0) {
            document.querySelector('#shareproject-pending-list-title')?.remove();
        }

        pendingInvitations.forEach(invite => {
            const item = document.createElement('div');
            item.className = 'shareproject-pending-item';
            item.dataset.id = invite.id;
            const roleOptions = rolesData.map(role => `<button class="shareproject-dropdown-action" data-role="${role.name}"><strong>${role.name}</strong><p>${role.description}</p></button>`).join('');
            let statusHTML = invite.status === 'pending' ? `Invitation sent` : `<a href="#" class="shareproject-resend-link" data-id="${invite.id}">Resend invitation</a>`;

            item.innerHTML = `
                <div class="shareproject-pending-icon"><i class="material-icons">hourglass_top</i></div>
                <div class="shareproject-member-info">
                    <strong>${invite.email}</strong>
                    <p>${statusHTML}</p>
                </div>
                <div class="shareproject-member-role">
                    <button class="shareproject-dropdown-btn shareproject-member-role-btn">
                        <span>${invite.role}</span>
                        <i class="material-icons">arrow_drop_down</i>
                    </button>
                    <div id="pending-dropdown-${invite.id}" class="shareproject-dropdown-content hidden shareproject-member-dropdown-content">
                        ${roleOptions}
                    </div>
                </div>
            `;
            pendingList.appendChild(item);
        });
    };

    const renderFooter = () => {
        footerLeftContainer.innerHTML = '';
        const currentUser = membersData.find(m => m.id === currentUserId);

        if (currentUser) {
            const ownerCount = membersData.filter(m => m.isOwner && !m.isGroup).length;
            if (!currentUser.isOwner || (currentUser.isOwner && ownerCount > 1)) {
                const leaveButton = document.createElement('button');
                leaveButton.id = 'shareproject-leave-btn';
                leaveButton.innerHTML = `<i class="material-icons">logout</i>Leave project`;
                footerLeftContainer.appendChild(leaveButton);
            }
        }
    };

    const renderRoleOptions = () => {
        roleDropdown.innerHTML = rolesData.map(role => `
            <button class="shareproject-dropdown-action" data-role="${role.name}">
                <strong>${role.name}</strong>
                <p>${role.description}</p>
            </button>
        `).join('');
    };

    const addEmailTag = (emailOrName) => {
        const trimmedIdentifier = emailOrName.trim();
        if (trimmedIdentifier && !invitedEmails.includes(trimmedIdentifier)) {
            invitedEmails.push(trimmedIdentifier);
            renderEmailTags();
        }
        emailInput.value = '';
    };

    const renderEmailTags = () => {
        emailTagsContainer.innerHTML = '';
        invitedEmails.forEach(email => {
            const tag = document.createElement('div');
            tag.className = 'shareproject-email-tag';
            tag.innerHTML = `<span>${email}</span><span class="shareproject-remove-tag" data-email="${email}">&times;</span>`;
            emailTagsContainer.appendChild(tag);
        });
        emailTagsContainer.querySelectorAll('.shareproject-remove-tag').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = invitedEmails.indexOf(e.target.dataset.email);
                if (index > -1) {
                    invitedEmails.splice(index, 1);
                    renderEmailTags();
                }
            });
        });
    };

    const positionAndShowDropdown = (dropdownEl, buttonEl) => {
        if (activeDropdown && activeDropdown !== dropdownEl) {
            activeDropdown.classList.add('hidden');
        }
        modal.appendChild(dropdownEl);
        const modalRect = modal.getBoundingClientRect();
        const buttonRect = buttonEl.getBoundingClientRect();
        const top = buttonRect.bottom - modalRect.top + 2;
        const right = modalRect.right - buttonRect.right;
        dropdownEl.style.top = `${top}px`;
        dropdownEl.style.right = `${right}px`;
        dropdownEl.style.left = 'auto';
        dropdownEl.classList.remove('hidden');
        activeDropdown = dropdownEl;
    };

    // --- Event Handlers ---

    closeModalBtn.addEventListener('click', closeModal);

    modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeModal();
    });

    modal.addEventListener('click', (e) => {
        e.stopPropagation();

        const memberDropdownButton = e.target.closest('.shareproject-member-role-btn');
        const mainRoleDropdownButton = e.target.closest('#shareproject-role-dropdown-btn');
        const accessSettingsButton = e.target.closest('#shareproject-access-settings-btn');
        const roleActionButton = e.target.closest('.shareproject-dropdown-action[data-role]');
        const removeLink = e.target.closest('a.shareproject-remove');
        const resendLink = e.target.closest('a.shareproject-resend-link');
        const accessLink = e.target.closest('#shareproject-access-dropdown a[data-access]');

        if (memberDropdownButton || mainRoleDropdownButton || accessSettingsButton) {
            let button, dropdown, positioner;
            if (memberDropdownButton) {
                button = memberDropdownButton;
                dropdown = button.nextElementSibling;
                positioner = button;
            } else if (mainRoleDropdownButton) {
                button = mainRoleDropdownButton;
                dropdown = roleDropdown;
                positioner = button.parentElement;
            } else {
                button = accessSettingsButton;
                dropdown = accessDropdown;
                positioner = button;
            }

            if (dropdown && dropdown.classList.contains('hidden')) {
                positionAndShowDropdown(dropdown, positioner);
            } else if (activeDropdown) {
                activeDropdown.classList.add('hidden');
                activeDropdown = null;
            }
        } else if (roleActionButton) {
            const dropdown = roleActionButton.closest('.shareproject-dropdown-content');
            if (dropdown) {
                const newRole = roleActionButton.dataset.role;
                if (dropdown.id === 'shareproject-role-dropdown') {
                    selectedRoleSpan.textContent = newRole;
                } else {
                    const id = parseFloat(dropdown.id.split('-').pop());
                    let memberToUpdate = membersData.find(m => m.id === id) || pendingInvitations.find(p => p.id === id);

                    if (memberToUpdate && memberToUpdate.role !== newRole) {
                        const adminCount = membersData.filter(m => m.isOwner && !m.isGroup).length;
                        if (memberToUpdate.isOwner && newRole !== 'Project admin' && adminCount <= 1) {
                            alert('You cannot change the role of the last Project Admin. Please assign another Project Admin first.');
                            if (activeDropdown) activeDropdown.classList.add('hidden');
                            activeDropdown = null;
                            return;
                        }
                        logActivity(`Changed role for '${memberToUpdate.name || memberToUpdate.email}' from '${memberToUpdate.role}' to '${newRole}'.`);
                        memberToUpdate.role = newRole;
                        if (!memberToUpdate.isGroup) {
                            memberToUpdate.isOwner = (newRole === 'Project admin');
                        }
                    }
                }
                // FIX #1: Hide the dropdown instead of removing it.
                if (activeDropdown) {
                    activeDropdown.classList.add('hidden');
                }
                activeDropdown = null;
                renderAll();
            }
        } else if (removeLink) {
            const dropdown = removeLink.closest('.shareproject-dropdown-content');
            if (dropdown) {
                const id = parseFloat(dropdown.id.split('-').pop());
                membersData = membersData.filter(m => m.id !== id);
                if (activeDropdown) activeDropdown.classList.add('hidden');
                activeDropdown = null;
                renderAll();
            }
        } else if (accessLink) {
            projectAccessLevel = accessLink.dataset.access;
            if (activeDropdown) activeDropdown.classList.add('hidden');
            activeDropdown = null;
            renderAll();
        } else if (!e.target.closest('.shareproject-dropdown-content')) {
            if (activeDropdown) {
                activeDropdown.classList.add('hidden');
                activeDropdown = null;
            }
        }
    });
    
    // (Other listeners like modalFooter, emailInput, inviteBtn remain the same)
    
    // --- Initial Setup ---
    renderAll();
    renderRoleOptions();
    logActivity("Share modal initialized.");
};

/**
 * This is an example of how to trigger the modal.
 * You would typically have a "Share" button on your page.
 * We'll add one here and attach the event listener to it.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Create a button to open the modal for demonstration
    const openModalButton = document.createElement('button');
    openModalButton.textContent = 'Open Share Modal';
    openModalButton.style.padding = '10px 20px';
    openModalButton.style.position = 'absolute';
    openModalButton.style.top = '20px';
    openModalButton.style.left = '20px';
    document.body.appendChild(openModalButton);

    // Attach the listener to the button
    openModalButton.addEventListener('click', createShareModal);
});
// 
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

