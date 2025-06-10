
    // ==================================================
    // EDITABLE TEAM DESCRIPTION LOGIC
    // ==================================================
    const descriptionContainer = document.getElementById('description-container');
    const teamDescription = document.getElementById('team-description');
    if (descriptionContainer && teamDescription) {
        const placeholderText = "Click to add team description...";
        
        teamDescription.addEventListener('click', () => {
            const currentText = teamDescription.textContent.trim() === placeholderText ? "" : teamDescription.textContent.trim();
            const editor = document.createElement('textarea');
            editor.id = 'description-editor';
            editor.value = currentText;
            descriptionContainer.replaceChild(editor, teamDescription);
            editor.focus();
            
            const saveChanges = () => {
                let newText = editor.value.trim();
                teamDescription.textContent = newText === "" ? placeholderText : newText;
                descriptionContainer.replaceChild(teamDescription, editor);
            };
            
            editor.addEventListener('blur', saveChanges);
            editor.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    editor.blur();
                }
            });
        });
    }
    
    // ==================================================
    // ADD STAFF MEMBERS LOGIC
    // ==================================================
    const addStaffBtn = document.getElementById('add-staff-btn');
    const staffList = document.getElementById('staff-list');
    const staffCountLink = document.getElementById('staff-count-link');
    
    if (addStaffBtn && staffList && staffCountLink) {
        const maxStaff = 10;
        let currentStaffCount = 1;
        
        // Predefined profiles for new staff members
        const newStaffProfiles = [
            { initials: 'JD', bgColor: '#d1e7f7', color: '#3a5f81' },
            { initials: 'MS', bgColor: '#f7d1e7', color: '#813a5f' },
            { initials: 'LP', bgColor: '#d1f7e0', color: '#3a8157' }
        ];
        
        addStaffBtn.addEventListener('click', () => {
            if (currentStaffCount >= maxStaff) {
                return; // Do nothing if the limit is reached
            }
            
            // Get the next profile to add
            const profileToAdd = newStaffProfiles[currentStaffCount - 1];
            
            // Create the new avatar element
            const newAvatar = document.createElement('div');
            newAvatar.className = 'user-avatar-myworkspace';
            newAvatar.textContent = profileToAdd.initials;
            newAvatar.style.backgroundColor = profileToAdd.bgColor;
            newAvatar.style.color = profileToAdd.color;
            
            // Insert the new avatar before the "add" button
            staffList.insertBefore(newAvatar, addStaffBtn);
            
            currentStaffCount++;
            
            // Update the count link
            staffCountLink.textContent = `View all ${currentStaffCount}`;
            
            // If limit is reached, disable the button
            if (currentStaffCount >= maxStaff) {
                addStaffBtn.classList.add('disabled');
            }
        });
    }
    
    // ==================================================
    // OTHER INTERACTIVITY (Example Handlers)
    // ==================================================
    const inviteBtn = document.getElementById('invite-btn');
    if (inviteBtn) inviteBtn.addEventListener('click', showEmailModal);

    const createWorkBtn = document.getElementById('create-work-btn');
    if (createWorkBtn) createWorkBtn.addEventListener('click', () => alert('Create work dropdown clicked!'));
    
    const createTaskBtn = document.getElementById('create-task-btn');
    if (createTaskBtn) createTaskBtn.addEventListener('click', () => alert('Add Task button clicked!'));
