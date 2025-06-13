// File: /dashboard/myworkspace/myworkspace.js

/**
 * Initializes the 'My Workspace' section, encapsulating all its logic.
 * Returns a cleanup function to be called by the router when navigating away.
 */
 
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

export function init(params) {
    console.log("My Workspace section initialized.");

    // [1] Use an AbortController for easy and reliable event listener cleanup.
    const controller = new AbortController();

    // [2] Get the main container for this section to scope all queries.
    const workspaceSection = document.querySelector('div[data-section="myworkspace"]');
    if (!workspaceSection) {
        console.error('My Workspace section container not found!');
        return () => {}; // Return an empty cleanup function.
    }
    // --- LOGIC FOR FUNCTIONALITY WITHIN THE WORKSPACE ---

    // ==================================================
    // EDITABLE TEAM DESCRIPTION LOGIC
    // ==================================================
    const descriptionContainer = workspaceSection.querySelector('#description-container');
    const teamDescription = workspaceSection.querySelector('#team-description');

    if (descriptionContainer && teamDescription) {
        const placeholderText = "Click to add team description...";
        if (!teamDescription.textContent.trim()) {
            teamDescription.textContent = placeholderText;
        }

        // Define the handler function separately.
        const handleEditDescriptionClick = () => {
            const currentText = teamDescription.textContent.trim() === placeholderText ? "" : teamDescription.textContent.trim();
            const editor = document.createElement('textarea');
            editor.id = 'description-editor';
            editor.value = currentText;
            descriptionContainer.replaceChild(editor, teamDescription);
            editor.focus();

            const saveChanges = () => {
                let newText = editor.value.trim();
                teamDescription.textContent = newText === "" ? placeholderText : newText;
                // Important: Check if the editor is still in the DOM before replacing
                if (editor.parentNode === descriptionContainer) {
                    descriptionContainer.replaceChild(teamDescription, editor);
                }
            };

            // NOTE: Listeners on dynamically created elements that are then removed
            // from the DOM are automatically garbage collected. No need to add these
            // to the main AbortController.
            editor.addEventListener('blur', saveChanges);
            editor.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    editor.blur(); // Triggers the 'blur' event to save.
                }
            });
        };

        // [3] Attach persistent event listeners using the controller's signal.
        teamDescription.addEventListener('click', handleEditDescriptionClick, { signal: controller.signal });
    }

    // ==================================================
    // ADD STAFF MEMBERS LOGIC
    // ==================================================
    const addStaffBtn = workspaceSection.querySelector('#add-staff-btn');
    if (addStaffBtn) {
        addStaffBtn.addEventListener('click', showEmailModal, { signal: controller.signal });
    }

    // ==================================================
    // OTHER INTERACTIVITY HANDLERS
    // ==================================================
    const inviteBtn = workspaceSection.querySelector('#invite-btn');
    if (inviteBtn) {
        inviteBtn.addEventListener('click', showEmailModal, { signal: controller.signal });
    }

    const createWorkBtn = workspaceSection.querySelector('#create-work-btn');
    if (createWorkBtn) {
        createWorkBtn.addEventListener('click', () => alert('Create work dropdown clicked!'), { signal: controller.signal });
    }

    const createTaskBtn = workspaceSection.querySelector('#create-task-btn');
    if (createTaskBtn) {
        createTaskBtn.addEventListener('click', () => alert('Add Task button clicked!'), { signal: controller.signal });
    }


    // [4] The cleanup function is returned to the router.
    // It will be called when the user navigates away from this section.
    return function cleanup() {
        console.log("Cleaning up 'My Workspace' section listeners...");

        // This single line removes ALL event listeners added with this controller's signal.
        controller.abort();
    };
}
