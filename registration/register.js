import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFunctions,
    httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
  collectionGroup,
  getDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadString,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from "/services/firebase-config.js";

// Initialize Firebase
console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
const storage = getStorage(app);
const functions = getFunctions(app);
console.log("Firebase initialized.");

let invitationId = null;

// DOM Elements
const orText = document.getElementById("orText");
const googleBtn = document.getElementById("google-signin-btn");
const continueEmailLink = document.getElementById("continue-email-link");
const form = document.getElementById("registration-form");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("toggle-password");
const welcomeMessage = document.getElementById("welcome-message");
const acceptanceView = document.getElementById("acceptance-view");
const registrationForm = document.getElementById("registration-form");
const acceptInvitationBtn = document.getElementById("accept-invitation-btn");
const emailInput = document.getElementById("email");
const fullNameInput = document.getElementById("full-name");
const feedbackElement = document.querySelector(".subtitle");
const mainTitle = document.querySelector("h2");


document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  const parts = path.split('/');
  
  /**
   * Shows an invitation error message and optionally a "Switch Account" button.
   * @param {string} message The error message to display.
   */
  const showInvitationError = (message) => {
    // Clear previous dynamic buttons
    const existingSwitchBtn = document.getElementById('switch-account-btn');
    if (existingSwitchBtn) {
      existingSwitchBtn.remove();
    }
    
    console.error("Invitation Error:", message);
    mainTitle.textContent = "Access Denied";
    feedbackElement.textContent = message;
    feedbackElement.style.color = "#E53E3E"; // Red for error
    
    // Hide all standard login/registration UI elements
    document.getElementById("registration-form").style.display = 'none';
    document.getElementById("google-signin-btn").style.display = 'none';
    document.getElementById("continue-email-link").style.display = 'none';
    document.getElementById("orText").style.display = 'none';
    if (acceptanceView) acceptanceView.style.display = 'none';
    
    // **KEY CHANGE**: Check for the specific "wrong account" message
    if (message.includes("but you are signed in as")) {
      // Create and show the "Switch Account" button
      const switchAccountBtn = document.createElement('button');
      switchAccountBtn.textContent = 'Switch Account';
      switchAccountBtn.id = 'switch-account-btn'; // Assign an ID for styling
      switchAccountBtn.className = 'google-signin-btn'; // Reuse existing button style
      switchAccountBtn.style.marginTop = '20px'; // Add some space
      
      // Append the button right after the feedback message
      feedbackElement.parentNode.insertBefore(switchAccountBtn, feedbackElement.nextSibling);
      
      // Add the sign-out functionality
      switchAccountBtn.onclick = () => {
        console.log("Switching account: signing out...");
        signOut(auth).then(() => {
          console.log("Sign-out successful. Reloading page.");
          window.location.reload();
        }).catch((error) => {
          console.error("Sign-out error", error);
          alert("Could not sign out. Please try again.");
        });
      };
    }
  };
  
  const handleRedirectWorkspace = (workspaceId) => {
    if (workspaceId) {
      console.log(`Redirecting to workspace: ${workspaceId}`);
      window.location.href = `/myworkspace/${workspaceId}`;
    }
  };
  
  // Helper function to process project invitations
  const processProjectInvitation = async (invitationId, user) => {
    feedbackElement.textContent = "Verifying project invitation, please wait...";
    
    try {
      const invitationRef = doc(db, "InvitedProjects", invitationId);
      const invitationSnap = await getDoc(invitationRef);
      
      if (!invitationSnap.exists()) {
        return showInvitationError("This project invitation link is invalid or has expired.");
      }
      
      const invitationData = invitationSnap.data();
      if (invitationData.status === 'accepted') {
        return showInvitationError("This project invitation has already been accepted.");
      }
      
      const invitedEmail = invitationData.invitedEmail;
      if (!invitedEmail) {
        return showInvitationError("This project invitation is invalid (missing email).");
      }
      
      if (user) {
        // User is logged in, check if their email matches
        if (user.email.toLowerCase() === invitedEmail.toLowerCase()) {
          showWelcome(user.displayName, user.photoURL, user.email, user);
        } else {
          showInvitationError(`This invitation is for ${invitedEmail}, but you are signed in as ${user.email}. Please sign out and use the correct account.`);
        }
      } else {
        // No user is logged in, pre-fill email if it exists
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("email", "==", invitedEmail));
        const userQuerySnapshot = await getDocs(q);
        
        if (!userQuerySnapshot.empty) {
          const existingUserData = userQuerySnapshot.docs[0].data();
          mainTitle.textContent = "Invitation to Project";
          feedbackElement.textContent = `Welcome back, ${existingUserData.name}! You've been invited to a project. Please sign in to accept.`;
        } else {
          emailInput.value = invitedEmail;
          emailInput.readOnly = true;
          mainTitle.textContent = "You're Invited!";
          feedbackElement.textContent = `You've been invited to a project as ${invitedEmail}. Please register or sign in to continue.`;
        }
      }
    } catch (error) {
      console.error("Firebase Query Failed:", error);
      showInvitationError("An unexpected error occurred. Please check your connection and try again.");
    }
  };
  
  // Helper function to process workspace invitations
  const processWorkspaceInvitation = async (invitationId, user) => {
    feedbackElement.textContent = "Verifying workspace invitation, please wait...";
    
    try {
      const invitationRef = doc(db, "InvitedWorkspaces", invitationId);
      const invitationSnap = await getDoc(invitationRef);
      
      if (!invitationSnap.exists()) {
        return showInvitationError("This workspace invitation link is invalid or has expired.");
      }
      
      const invitationData = invitationSnap.data();
      if (invitationData.status === 'accepted') {
        return showInvitationError("This workspace invitation has already been accepted.");
      }
      
      const invitedEmail = invitationData.invitedEmail;
      if (!invitedEmail) {
        return showInvitationError("This workspace invitation is invalid (missing email).");
      }
      
      const workspaceId = invitationData.workspaceId;
      sessionStorage.setItem('pendingWorkspaceId', workspaceId);
      
      if (user) {
        // User is logged in
        if (user.email.toLowerCase() === invitedEmail.toLowerCase()) {
          showWelcome(user.displayName, user.photoURL, user.email, user);
        } else {
          showInvitationError(`This invitation is for ${invitedEmail}, but you are signed in as ${user.email}. Please sign out and use the correct account.`);
        }
      } else {
        // No user is logged in
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("email", "==", invitedEmail));
        const userQuerySnapshot = await getDocs(q);
        
        if (!userQuerySnapshot.empty) {
          const existingUserData = userQuerySnapshot.docs[0].data();
          mainTitle.textContent = "Invitation to Workspace";
          feedbackElement.textContent = `Welcome back, ${existingUserData.name}! Please sign in to join the workspace.`;
        } else {
          emailInput.value = invitedEmail;
          emailInput.readOnly = true;
          mainTitle.textContent = "You're Invited!";
          feedbackElement.textContent = `Invited to a workspace as ${invitedEmail}. Please register or sign in.`;
        }
      }
    } catch (error) {
      console.error("Firebase Query Failed:", error);
      showInvitationError("An unexpected error occurred. Please check your connection and try again.");
    }
  };
  
  // ROUTING LOGIC
  if (parts.length === 3 && parts[1] === 'invitation' && parts[2]) {
    invitationId = parts[2];
    console.log("Project Invitation ID found:", invitationId);
    onAuthStateChanged(auth, (user) => {
      processProjectInvitation(invitationId, user);
    });
    
  } else if (parts.length === 3 && parts[1] === 'workspace-invite' && parts[2]) {
    invitationId = parts[2];
    console.log("Workspace Invitation ID found:", invitationId);
    onAuthStateChanged(auth, (user) => {
      processWorkspaceInvitation(invitationId, user);
    });
    
  } else if (parts.length === 5 && parts[1] === 'tasks' && parts[3] === 'list') {
    const numericProjectId = parts[4];
    console.log("Direct project view link detected for project:", numericProjectId);
    
    // Hide all forms initially
    document.getElementById("registration-form").style.display = 'none';
    document.getElementById("google-signin-btn").style.display = 'none';
    document.getElementById("continue-email-link").style.display = 'none';
    document.getElementById("orText").style.display = 'none';
    
    feedbackElement.textContent = "Verifying your access, please wait...";
    
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        // USER IS LOGGED IN
        console.log("User is logged in:", user.email);
        try {
          const projectsCollectionGroup = collectionGroup(db, 'projects');
          const q = query(projectsCollectionGroup, where('numericProjectId', '==', numericProjectId));
          const projectQuerySnapshot = await getDocs(q);
          
          if (projectQuerySnapshot.empty) {
            mainTitle.textContent = "Not Found";
            feedbackElement.textContent = "The project you are looking for does not exist.";
            return;
          }
          
          const projectData = projectQuerySnapshot.docs[0].data();
          const memberUIDs = projectData.memberUIDs || [];
          
          if (memberUIDs.includes(user.uid)) {
            mainTitle.textContent = "Access Verified";
            feedbackElement.textContent = "Redirecting you to the project...";
            window.location.href = window.location.pathname;
          } else {
            // This case uses the same logic, so we can reuse the function.
            showInvitationError(`The account you are signed in with (${user.email}) does not have access to this project. Please sign out and use the correct account.`);
          }
        } catch (error) {
          console.error("Error verifying project access:", error);
          mainTitle.textContent = "Error";
          feedbackElement.textContent = "An error occurred while verifying your access.";
        }
      } else {
        // NO USER IS LOGGED IN
        console.log("No user is logged in.");
        mainTitle.textContent = "Login Required";
        feedbackElement.textContent = "Please sign in or create an account to view this project.";
        
        // Show the login/register options again
        document.getElementById("google-signin-btn").style.display = 'block';
        document.getElementById("continue-email-link").style.display = 'block';
        document.getElementById("orText").style.display = 'block';
      }
    });
    
  } else {
    console.log("Not an invitation link or direct project link.");
    if (document.getElementById("acceptance-view")) {
      document.getElementById("acceptance-view").style.display = "none";
    }
  }
});

// Toggle password visibility
togglePasswordBtn.addEventListener("click", () => {
  passwordInput.type = passwordInput.type === "password" ? "text" : "password";
  togglePasswordBtn.classList.toggle("fa-eye");
  togglePasswordBtn.classList.toggle("fa-eye-slash");
  console.log("Password visibility toggled:", passwordInput.type);
});

// Show email registration form
continueEmailLink.addEventListener("click", (e) => {
  e.preventDefault();
  console.log("Email registration mode activated.");
  form.style.display = "block";
  continueEmailLink.style.display = "none";
  googleBtn.style.display = "none";
  orText.style.display = "none";
});

// Email Registration Submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const fullName = fullNameInput.value.trim();
  
  console.log("Starting email registration for:", email, fullName);
  
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("User registered in Auth:", user.uid);
    
    await updateProfile(user, { displayName: fullName });
    console.log("Profile updated with display name.");
    
    const photoURL = await saveUserData(user, fullName, email, 'email');
    
    // After successful registration, we need to pass the full user object
    showWelcome(fullName, photoURL, email, user);
    
  } catch (error) {
    console.error("Registration error:", error);
    alert("Error: " + error.message);
  }
});


// Google Sign-In
document.querySelectorAll("#google-signin-btn, #google-signin-btn-form").forEach(btn => {
  btn.addEventListener("click", async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      await saveUserData(user, user.displayName, user.email, 'google', user.photoURL);
      
      // After successful sign-in, pass the full user object
      showWelcome(user.displayName, user.photoURL, user.email, user);
    } catch (error) {
      console.error("Google Sign-in error:", error);
      if (error.code !== 'auth/popup-closed-by-user') {
        alert("Error: " + error.message);
      }
    }
  });
});

/**
 * Shows the final welcome/acceptance screen.
 * @param {string} name User's full name.
 * @param {string} photoURL URL for the user's avatar.
 * @param {string} email User's email.
 * @param {object} user The full Firebase user object.
 */
function showWelcome(name, photoURL, email = '', user) {
  console.log("Showing welcome view for:", name);

  // Hide registration/login forms
  mainTitle.style.display = "none";
  feedbackElement.style.display = "none";
  registrationForm.style.display = "none";
  orText.style.display = "none";
  googleBtn.style.display = "none";
  continueEmailLink.style.display = "none";

  // Clear any dynamic buttons like "Switch Account"
  const existingSwitchBtn = document.getElementById('switch-account-btn');
  if (existingSwitchBtn) {
    existingSwitchBtn.remove();
  }

  // Show the acceptance view
  acceptanceView.style.display = "block";
  welcomeMessage.textContent = `Welcome, ${name}!`;

  const acceptFeedback = document.getElementById('acceptance-feedback');
  const path = window.location.pathname;
  if (path.includes('/invitation/')) {
    acceptFeedback.textContent = "You've been invited to join a new project. Click below to accept.";
  } else if (path.includes('/workspace-invite/')) {
    acceptFeedback.textContent = "You've been invited to join a new workspace. Click below to accept.";
  }

  // Set user photo
  const photo = document.getElementById("user-photo");
  if (photoURL) {
    photo.src = photoURL;
  } else {
    const initials = name.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('');
    photo.src = generateAvatar(initials, getRandomColor());
  }

  // --- THIS IS THE CORRECTED PART ---
  // Attach the click listener to call the new handler correctly.
  acceptInvitationBtn.onclick = async () => {
    const auth = getAuth(); // Make sure you have access to the auth instance
    const currentUser = auth.currentUser;
    console.log("Current user at time of click:", currentUser);

    if (!currentUser) {
      alert("Your session has expired. Please refresh the page and sign in again.");
      acceptInvitationBtn.disabled = false;
      return; // Stop before calling the function
    }
    // The 'invitationId' should be a string that was captured when the page loaded.
    if (!invitationId) {
      alert("No invitation ID found. Cannot accept invitation.");
      return;
    }

    // Call the appropriate handler, passing ONLY the invitation ID.
    if (path.includes('/workspace-invite/')) {
      console.log("Accepting WORKSPACE invitation via Cloud Function...");
      await handleWorkspaceInvitationAcceptance(invitationId);
    } else if (path.includes('/invitation/')) {
      console.log("Accepting PROJECT invitation via Cloud Function...");
      // Assuming you have a handleProjectInvitationAcceptance function
      await handleProjectInvitationAcceptance(invitationId);
    } else {
      alert("Could not determine invitation type from URL.");
    }
  };
}

async function handleProjectInvitationAcceptance(user, invId) {
  console.log(`Accepting project invitation ${invId} for user ${user.uid}`);
  acceptInvitationBtn.disabled = true;
  acceptInvitationBtn.textContent = "Processing...";
  
  const invitationRef = doc(db, "InvitedProjects", invId);
  
  try {
    const invitationSnap = await getDoc(invitationRef);
    if (!invitationSnap.exists()) throw new Error("This invitation is no longer valid or has been deleted.");
    
    const invitationData = invitationSnap.data();
    if (invitationData.invitedEmail.toLowerCase() !== user.email.toLowerCase()) {
      throw new Error("This invitation is for a different email address. Please log in with the correct account.");
    }
    
    const projectId = invitationData.projectId;
    const role = invitationData.role;
    const projectsCollectionGroup = collectionGroup(db, 'projects');
    const q = query(projectsCollectionGroup, where('projectId', '==', projectId));
    const projectQuerySnapshot = await getDocs(q);
    
    if (projectQuerySnapshot.empty) throw new Error("The project associated with this invitation no longer exists.");
    
    const projectSnap = projectQuerySnapshot.docs[0];
    const projectRef = projectSnap.ref;
    const projectData = projectSnap.data();
    
    const batch = writeBatch(db);
    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);
    let activeWorkspaceId = null;
    
    if (userSnap.exists() && userSnap.data().selectedWorkspace) {
      activeWorkspaceId = userSnap.data().selectedWorkspace;
    }
    
    const pendingInviteToRemove = (projectData.pendingInvites || []).find(p => p.invitationId === invId);
    if (pendingInviteToRemove) {
      batch.update(projectRef, { pendingInvites: arrayRemove(pendingInviteToRemove) });
    }
    
    batch.update(projectRef, {
      members: arrayUnion({ uid: user.uid, role: role }),
      memberUIDs: arrayUnion(user.uid)
    });
    
    batch.update(invitationRef, {
      status: "accepted",
      acceptedAt: serverTimestamp(),
      acceptedBy: { uid: user.uid, name: user.displayName, email: user.email }
    });
    
    if (activeWorkspaceId) {
      const workspaceRef = doc(db, `users/${user.uid}/myworkspace/${activeWorkspaceId}`);
      batch.set(workspaceRef, { selectedProjectId: projectId }, { merge: true });
    }
    
    await batch.commit();
    
    console.log("✅ Project invitation accepted and project updated successfully!");
    alert("Invitation accepted! You are now a member of the project.");
    
    const numericUserId = stringToNumericString(user.uid);
    const numericProjectId = stringToNumericString(projectId);
    window.location.href = `/tasks/${numericUserId}/list/${numericProjectId}`;
    
  } catch (error) {
    console.error("❌ Error accepting project invitation:", error);
    alert("Error: " + error.message);
    acceptInvitationBtn.disabled = false;
    acceptInvitationBtn.textContent = "Accept Invitation";
  }
}


// Generate initials avatar
function generateAvatar(initials, backgroundColor = '#333') {
  console.log("Generating avatar with initials:", initials, "Color:", backgroundColor);
  const canvas = document.createElement("canvas");
  const size = 96;
  canvas.width = size;
  canvas.height = size;
  
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, size, size);
  
  ctx.font = "bold 40px Roboto, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  ctx.fillText(initials, size / 2, size / 2 + 2);
  
  const dataUrl = canvas.toDataURL("image/png");
  console.log("Avatar generated.");
  return dataUrl;
}

async function handleWorkspaceInvitationAcceptance(invId) {
  try {
    acceptInvitationBtn.disabled = true;
    acceptInvitationBtn.textContent = "Processing...";

    const user = getAuth().currentUser;
    if (!user) {
      throw new Error("User is not authenticated.");
    }
    console.log(await user?.getIdTokenResult())

    // Optional: Force refresh token if needed
    await user.getIdToken(true);

    const acceptInvitation = httpsCallable(functions, 'acceptWorkspaceInvitation');
    const result = await acceptInvitation({ invId });

    const { workspaceId } = result.data;
    alert("Invitation accepted! You are now a member of the workspace.");
    window.location.href = `/myworkspace/${workspaceId}`;

  } catch (error) {
    console.error("❌ Error accepting invitation:", error);
    alert("Error: " + (error.message || "Something went wrong"));
    acceptInvitationBtn.disabled = false;
    acceptInvitationBtn.textContent = "Accept Invitation";
  }
}

// Pick random background color
function getRandomColor() {
  const vibrantColors = ["#F44336", "#E91E63", "#9C27B0", "#3F51B5", "#2196F3", "#009688", "#4CAF50", "#FF9800", "#795548"];
  const color = vibrantColors[Math.floor(Math.random() * vibrantColors.length)];
  console.log("Selected random avatar color:", color);
  return color;
}

function stringToNumericString(str) {
  if (!str) return '';
  return str.split('').map(char => char.charCodeAt(0)).join('');
}

async function saveUserData(user, fullName, email, provider, photoURL = null) {
  if (!user || !user.uid) {
    console.warn("⚠️ User not authenticated. Cannot write to Firestore.");
    return null;
  }
  
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  const isNewUser = !userSnap.exists();
  
  console.log(isNewUser ? "New user detected." : "Existing user detected.");
  
  if (!isNewUser) {
    const existingData = userSnap.data();
    const updateData = {
      name: fullName,
      avatar: photoURL || existingData.avatar,
    };
    await setDoc(userRef, updateData, { merge: true });
    console.log(`✅ Existing user data for ${email} refreshed.`);
    return photoURL || existingData.avatar;
  }
  
  console.log("Starting setup for new user...");
  let finalPhotoURL = photoURL;
  
  if (provider === 'email') {
    const initials = fullName.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('');
    const color = getRandomColor();
    const dataUrl = generateAvatar(initials, color);
    const avatarPath = `users/${user.uid}/profile-picture/avatar.png`;
    const storageRef = ref(storage, avatarPath);
    await uploadString(storageRef, dataUrl, 'data_url');
    finalPhotoURL = await getDownloadURL(storageRef);
    console.log("Generated and uploaded new avatar.");
  }
  
  const batch = writeBatch(db);
  const workspaceCollectionRef = collection(db, `users/${user.uid}/myworkspace`);
  const newWorkspaceRef = doc(workspaceCollectionRef);
  const newWorkspaceData = {
    name: "My First Workspace",
    createdAt: serverTimestamp(),
    members: [user.uid]
  };
  
  const newUserData = {
    id: user.uid,
    name: fullName,
    email: email,
    provider: provider,
    avatar: finalPhotoURL,
    createdAt: serverTimestamp(),
    selectedWorkspace: newWorkspaceRef.id
  };
  
  batch.set(userRef, newUserData);
  batch.set(newWorkspaceRef, newWorkspaceData);
  await batch.commit();
  console.log("✅ New user and default workspace created atomically.");
  
  return finalPhotoURL;
}