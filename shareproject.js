document.addEventListener('DOMContentLoaded', () => {

    const openModalBtn = document.getElementById('openModalBtn');

    openModalBtn.addEventListener('click', () => {
        // Prevent creating multiple modals
        if (document.getElementById('modalBackdrop')) {
            return;
        }
        createShareModal();
    });

    const createShareModal = () => {
        // --- CSS Styles --- (Injected into the head for a modern UI)
        const styles = `
        .hidden { display: none !important; }
            .modal-backdrop {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background-color: rgba(0, 0, 0, 0.6); display: flex;
                justify-content: center; align-items: center; z-index: 1000;
                animation: fadeIn 0.3s ease;
            }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .modal {
                background-color: white; border-radius: 12px;
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
                width: 700px; display: flex; flex-direction: column;
                font-family: 'Inter', sans-serif; animation: slideIn 0.3s ease-out;
            }
            @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            .modal-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 16px 24px; border-bottom: 1px solid #f0f0f0;
            }
            .modal-header h2 { margin: 0; font-size: 18px; font-weight: 600; color: #111; }
            .icon-btn {
                background: none; border: none; cursor: pointer; padding: 6px;
                border-radius: 50%; display: inline-flex; color: #555;
            }
            .icon-btn:hover { background-color: #f4f4f4; }
            .modal-body { padding: 16px 24px; }
            .modal-body > p.section-title { font-size: 14px; font-weight: 500; color: #333; margin: 16px 0 8px 0; }
            .invite-input-wrapper {
                position: relative; /* Added for dropdown positioning */
                display: flex; align-items: center; border: 1px solid #e0e0e0;
                border-radius: 8px; padding: 4px; margin-bottom: 16px;
                transition: all 0.2s ease;
            }
            .invite-input-wrapper:focus-within { border-color: #1267FA; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
            .email-tags-container { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-left: 8px; }
            .email-tag {
                display: flex; align-items: center; background-color: #eef2ff; color: #4338ca;
                padding: 4px 10px; border-radius: 6px; font-size: 14px; font-weight: 500;
            }
            .email-tag .remove-tag { cursor: pointer; margin-left: 8px; font-size: 16px; }
            #email-input {
                flex-grow: 1; border: none; outline: none; padding: 8px;
                font-size: 14px; background: transparent; min-width: 150px;
            }
            .invite-controls { display: flex; align-items: center; gap: 8px; padding-right: 4px;}
            .role-selector, .member-role { position: relative; }
            .dropdown-btn {
                background-color: #fff; border: 1px solid #e0e0e0; border-radius: 6px;
                padding: 8px 12px; cursor: pointer; display: flex; align-items: center;
                font-size: 14px; white-space: nowrap;
            }
            .dropdown-btn:hover { background-color: #f9f9f9; }
            .dropdown-content {
                position: absolute; top: calc(100% + 5px); right: 0; background-color: white;
                border: 1px solid #f0f0f0; border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.08); z-index: 10; width: 300px;
                overflow: hidden; animation: fadeIn 0.2s ease;
            }
            .dropdown-content a { display: block; padding: 12px 16px; text-decoration: none; color: #333; }
            .dropdown-content a:hover { background-color: #f4f4f4; }
            .dropdown-content a.selected { background-color: #eef2ff; }
            .dropdown-content strong { font-weight: 500; display: flex; align-items: center; gap: 8px; }
            .dropdown-content .check-icon { color: #1267FA; }
            .dropdown-content p { font-size: 13px; color: #666; margin: 4px 0 0 0; line-height: 1.4; }
            .invite-btn {
                background-color: #3F7EEB; color: white; border: none;
                padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;
                transition: background-color 0.2s ease;
            }
            .invite-btn:hover { background-color: #1267FA; }
            .access-settings-wrapper { position: relative; }
            .access-settings-btn {
                display: flex; align-items: center; width: 100%; text-align: left;
                padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px; cursor: pointer;
            }
            .access-settings-btn:hover { background-color: #f9f9f9; }
            .access-settings-btn .material-icons { margin-right: 12px; color: #555; }
            .access-settings-btn div { flex-grow: 1; }
            .members-list { margin-top: 16px; }
            .member-item { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
            .member-item:last-child { border-bottom: none; }
            .profile-pic {
                width: 36px; height: 36px; border-radius: 50%; display: flex;
                align-items: center; justify-content: center; color: white;
                font-weight: 500; font-size: 14px; margin-right: 12px;
            }
            .member-info { flex-grow: 1; }
            .member-info strong { font-size: 14px; font-weight: 500; color: #111; }
            .member-info p { font-size: 13px; color: #666; margin: 2px 0 0 0; }
            .member-role .dropdown-btn { background: none; border: none; padding: 4px 8px; color: #555; }
            .member-role .dropdown-btn:hover { background-color: #f4f4f4; }
            .member-role .dropdown-content a.leave { color: #ef4444; }
            .member-role .dropdown-content a.leave:hover { background-color: #fee2e2; }
            .modal-footer {
                padding: 16px 24px; border-top: 1px solid #f0f0f0;
                background-color: #f9fafb; display: flex; justify-content: flex-end;
                border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;
            }
            .copy-link-btn {
                background: none; border: 1px solid #e0e0e0; border-radius: 6px;
                padding: 8px 12px; cursor: pointer; display: flex;
                align-items: center; font-size: 14px; font-weight: 500;
            }
            .copy-link-btn:hover { background-color: #f4f4f4; }
            .copy-link-btn .material-icons { margin-right: 8px; color: #555; }

            /* New styles for user search dropdown */
            .user-search-dropdown {
                position: absolute;
                top: 100%; /* Position below the input wrapper */
                left: 0;
                right: 0;
                background-color: white;
                border: 1px solid #f0f0f0;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                z-index: 20; /* Higher than other dropdowns */
                overflow: hidden;
                max-height: 200px; /* Limit height and enable scroll */
                overflow-y: auto;
            }
            .user-search-dropdown a {
                display: flex;
                align-items: center;
                padding: 8px 16px;
                text-decoration: none;
                color: #333;
            }
            .user-search-dropdown a:hover {
                background-color: #f4f4f4;
            }
            .user-search-dropdown a strong {
                font-weight: 500;
                margin-right: 8px;
            }
            .user-search-dropdown a span {
                font-size: 13px;
                color: #666;
            }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);

        // --- HTML Structure ---
        const modalHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h2>Share Dresmond Shirt Barong Supplier</h2>
                    <button id="closeModalBtn" class="icon-btn"><i class="material-icons">close</i></button>
                </div>
                <div class="modal-body">
                    <div class="invite-input-wrapper">
                        <div id="email-tags" class="email-tags-container"></div>
                        <input type="email" id="email-input" placeholder="Add members by email or name...">
                        <div class="invite-controls">
                            <div class="role-selector">
                                <button id="role-dropdown-btn" class="dropdown-btn">
                                    <span id="selected-role">Editor</span><i class="material-icons">arrow_drop_down</i>
                                </button>
                                <div id="role-dropdown" class="dropdown-content hidden">
                                    <a href="#" data-role="Project admin"><strong>Project admin</strong><p>Full access to change settings and modify.</p></a>
                                    <a href="#" data-role="Editor"><strong>Editor</strong><p>Can add, edit, and delete anything.</p></a>
                                    <a href="#" data-role="Commenter"><strong>Commenter</strong><p>Can comment, but can't edit.</p></a>
                                    <a href="#" data-role="Viewer"><strong>Viewer</strong><p>Can view, but can't add comments.</p></a>
                                </div>
                            </div>
                            <button id="invite-btn" class="invite-btn">Invite</button>
                        </div>
                    </div>
                   
                    <div class="access-settings-wrapper">
                           <button id="access-settings-btn" class="access-settings-btn">
                             <i class="material-icons" id="access-icon">public</i>
                             <div>
                                <strong id="access-title">My Workspace</strong>
                                <p id="access-desc">Everyone at workspace can find and access this project.</p>
                             </div>
                             <i class="material-icons">arrow_drop_down</i>
                           </button>
                           <div id="access-dropdown" class="dropdown-content hidden" style="width: 100%;">
                                <a href="#" data-access="workspace">
                                    <strong><i class="material-icons">public</i> My Workspace</strong>
                                    <p>Everyone at workspace can find and access this project.</p>
                                </a>
                                <a href="#" data-access="private">
                                    <strong><i class="material-icons">lock</i> Private to Members</strong>
                                    <p>Only invited members can find and access this project.</p>
                                </a>
                           </div>
                    </div>

                    <p class="section-title">Project Members</p>
                    <div class="members-list" id="members-list"></div>
                </div>
                <div class="modal-footer">
                    <button class="copy-link-btn"><i class="material-icons">link</i>Copy project link</button>
                </div>
            </div>
        `;
        const modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'modalBackdrop';
        modalBackdrop.className = 'modal-backdrop';
        modalBackdrop.innerHTML = modalHTML;
        document.body.appendChild(modalBackdrop);

        // --- Post-Render Logic and Event Handlers ---
        setupModalLogic();
    };

    const setupModalLogic = () => {
        // --- Mock Data ---
        let membersData = [
            { id: 1, name: 'Task collaborators', email: '', role: 'Editor', isGroup: true },
            { id: 2, name: 'My workspace', email: '2 members', role: 'Editor', isGroup: true },
            { id: 3, name: 'Clinton Ihegoro', email: 'myfavoritemappingswar@gmail.com', role: 'Project admin', isOwner: true },
            { id: 4, name: 'John Wick', email: 'john.wick@example.com', role: 'Editor' },
            { id: 5, name: 'Jane Doe', email: 'jane.doe@example.com', role: 'Viewer' },
            { id: 6, name: 'Peter Jones', email: 'peter.jones@example.com', role: 'Commenter' },
            { id: 7, name: 'Alice Smith', email: 'alice.smith@example.com', role: 'Editor' },
            { id: 8, name: 'Bob Johnson', email: 'bob.johnson@example.com', role: 'Viewer' }
        ];
        const invitedEmails = [];
        const profileColors = ['#4A148C', '#004D40', '#BF360C', '#0D47A1', '#4E342E', '#AD1457', '#006064'];

        // --- DOM Elements ---
        const modalBackdrop = document.getElementById('modalBackdrop');
        const closeModalBtn = document.getElementById('closeModalBtn');
        const emailInput = document.getElementById('email-input');
        const emailTagsContainer = document.getElementById('email-tags');
        const inviteInputWrapper = document.querySelector('.invite-input-wrapper'); // Get the wrapper for dropdown
        const inviteBtn = document.getElementById('invite-btn');
        const roleDropdownBtn = document.getElementById('role-dropdown-btn');
        const roleDropdown = document.getElementById('role-dropdown');
        const selectedRoleSpan = document.getElementById('selected-role');
        const membersList = document.getElementById('members-list');
        const accessSettingsBtn = document.getElementById('access-settings-btn');
        const accessDropdown = document.getElementById('access-dropdown');
        
        // --- Functions ---
        const closeModal = () => modalBackdrop.remove();

        const createProfilePic = (name, isGroup = false) => {
            const pic = document.createElement('div');
            pic.className = 'profile-pic';
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

        const renderMembers = () => {
            membersList.innerHTML = '';
            membersData.forEach(member => {
                const item = document.createElement('div');
                item.className = 'member-item';
                item.dataset.id = member.id;
                const dropdownId = `member-dropdown-${member.id}`;
                item.innerHTML = `
                    <div class="member-info">
                        <strong>${member.name}</strong>
                        <p>${member.email}</p>
                    </div>
                    <div class="member-role">
                        <button class="dropdown-btn member-role-btn">
                            <span>${member.role}</span>
                            <i class="material-icons">arrow_drop_down</i>
                        </button>
                        <div id="${dropdownId}" class="dropdown-content hidden member-dropdown-content">
                            ${member.isOwner ?
                                `<a href="#" class="leave"><i class="material-icons">logout</i> Leave project</a>` :
                                `<a href="#" data-role="Project admin"><strong>Project admin</strong></a>
                                 <a href="#" data-role="Editor"><strong>Editor</strong></a>
                                 <a href="#" data-role="Commenter"><strong>Commenter</strong></a>
                                 <a href="#" data-role="Viewer"><strong>Viewer</strong></a>`
                            }
                        </div>
                    </div>
                `;
                item.prepend(createProfilePic(member.name, member.isGroup));
                membersList.appendChild(item);
            });
        };

        const renderEmailTags = () => {
            emailTagsContainer.innerHTML = '';
            invitedEmails.forEach(email => {
                const tag = document.createElement('div');
                tag.className = 'email-tag';
                tag.innerHTML = `
                    <span>${email}</span>
                    <span class="remove-tag" data-email="${email}">&times;</span>
                `;
                emailTagsContainer.appendChild(tag);
            });

            // Add event listeners to remove tags
            emailTagsContainer.querySelectorAll('.remove-tag').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const emailToRemove = e.target.dataset.email;
                    const index = invitedEmails.indexOf(emailToRemove);
                    if (index > -1) {
                        invitedEmails.splice(index, 1);
                        renderEmailTags();
                    }
                });
            });
        };

        const addEmailTag = (email) => {
            const trimmedEmail = email.trim();
            if (trimmedEmail && !invitedEmails.includes(trimmedEmail)) {
                invitedEmails.push(trimmedEmail);
                renderEmailTags();
            }
            emailInput.value = '';
        };

        const updateAccessSettings = (type) => {
            const icon = document.getElementById('access-icon');
            const title = document.getElementById('access-title');
            const desc = document.getElementById('access-desc');
            if (type === 'workspace') {
                icon.textContent = 'public';
                title.textContent = 'My Workspace';
                desc.textContent = 'Everyone at workspace can find and access this project.';
            } else {
                icon.textContent = 'lock';
                title.textContent = 'Private to Members';
                desc.textContent = 'Only invited members can find and access this project.';
            }
            accessDropdown.classList.add('hidden');
        };

        // --- Event Handlers ---
        document.body.addEventListener('click', (e) => {
            // Close dropdowns if clicked outside
            if (!e.target.closest('.role-selector') && !e.target.closest('.member-role')) {
                document.querySelectorAll('.dropdown-content').forEach(d => d.classList.add('hidden'));
            }
            if (!e.target.closest('.access-settings-wrapper')) {
                accessDropdown.classList.add('hidden');
            }
            // Close user search dropdown if clicked outside
            if (!e.target.closest('.invite-input-wrapper')) {
                const searchDropdown = document.querySelector('.user-search-dropdown');
                if (searchDropdown) searchDropdown.remove();
            }
        });

        closeModalBtn.addEventListener('click', closeModal);
        modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });

        roleDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            roleDropdown.classList.toggle('hidden');
        });
        
        accessSettingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            accessDropdown.classList.toggle('hidden');
        });

        accessDropdown.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link) {
                e.preventDefault();
                updateAccessSettings(link.dataset.access);
            }
        });
        
        emailInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addEmailTag(e.target.value);
            }
        });

        emailInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            let searchDropdown = document.querySelector('.user-search-dropdown');

            if (searchDropdown) {
                searchDropdown.remove(); // Clear previous results
            }

            if (query.length > 0) {
                const filteredMembers = membersData.filter(member => 
                    (member.name && member.name.toLowerCase().includes(query)) ||
                    (member.email && member.email.toLowerCase().includes(query))
                );

                if (filteredMembers.length > 0) {
                    searchDropdown = document.createElement('div');
                    searchDropdown.className = 'user-search-dropdown';

                    filteredMembers.forEach(member => {
                        const searchItem = document.createElement('a');
                        searchItem.href = '#';
                        searchItem.dataset.email = member.email;
                        searchItem.innerHTML = `<strong>${member.name}</strong> <span>(${member.email})</span>`;
                        searchItem.addEventListener('click', (event) => {
                            event.preventDefault();
                            event.stopPropagation(); // Stop propagation to prevent modal close
                            addEmailTag(member.email);
                            emailInput.value = ''; // Clear input after selection
                            searchDropdown.remove(); // Remove dropdown after selection
                        });
                        searchDropdown.appendChild(searchItem);
                    });
                    inviteInputWrapper.appendChild(searchDropdown);
                }
            }
        });

        inviteBtn.addEventListener('click', () => {
            // Here you would typically send the invitedEmails array to your backend
            if (emailInput.value.trim() !== "") {
                addEmailTag(emailInput.value); // Add any remaining text in the input as an email
            }
            alert('Inviting: ' + invitedEmails.join(', '));
            // Clear invited emails after "inviting"
            invitedEmails.length = 0;
            renderEmailTags();
        });


        membersList.addEventListener('click', (e) => {
            e.stopPropagation();
            const button = e.target.closest('.member-role-btn');
            if (button) {
                const dropdown = button.nextElementSibling;
                // Close other dropdowns before opening this one
                document.querySelectorAll('.member-dropdown-content').forEach(d => {
                    if (d !== dropdown) {
                        d.classList.add('hidden');
                    }
                });
                dropdown.classList.toggle('hidden');
            }
            const roleLink = e.target.closest('.member-dropdown-content a[data-role]');
            if (roleLink) {
                e.preventDefault();
                const newRole = roleLink.dataset.role;
                const memberId = parseInt(roleLink.closest('.member-item').dataset.id, 10);
                const member = membersData.find(m => m.id === memberId);
                if (member) member.role = newRole;
                renderMembers();
            } else if (e.target.closest('.member-dropdown-content a.leave')) {
                e.preventDefault();
                const memberId = parseInt(e.target.closest('.member-item').dataset.id, 10);
                membersData = membersData.filter(m => m.id !== memberId);
                renderMembers();
            }
        });

        // --- Initial Setup ---
        renderMembers();
        renderEmailTags(); // Call this to display any pre-existing tags or to initialize the container
    };
});