import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

document.addEventListener('DOMContentLoaded', async () => {
  const path = window.location.pathname;
  const parts = path.split('/');

  const showInvitationError = (message) => {
    const feedbackElement = document.querySelector(".subtitle");
    console.error("Invitation Error:", message);
    alert(message);
    feedbackElement.textContent = message;
    feedbackElement.style.color = "#E53E3E";
    document.getElementById("registration-form").style.display = 'none';
    document.getElementById("google-signin-btn").style.display = 'none';
    document.getElementById("continue-email-link").style.display = 'none';
    document.getElementById("orText").style.display = 'none';
  };

  const handleRedirectWorkspace = (workspaceId) => {
    if (workspaceId) {
      console.log(`Redirecting to workspace: ${workspaceId}`);
      window.location.href = `/myworkspace/${workspaceId}`;
    }
  };

  if (parts.length === 3 && parts[1] === 'invitation' && parts[2]) {
    invitationId = parts[2];
    console.log("Project Invitation ID found:", invitationId);
    const feedbackElement = document.querySelector(".subtitle");
    try {
      feedbackElement.textContent = "Verifying project invitation, please wait...";
      const invitationRef = doc(db, "InvitedProjects", invitationId);
      const invitationSnap = await getDoc(invitationRef);

      if (!invitationSnap.exists()) return showInvitationError("This project invitation link is invalid or has expired.");
      const invitationData = invitationSnap.data();
      if (invitationData.status === 'accepted') return showInvitationError("This project invitation has already been accepted.");
      const invitedEmail = invitationData.invitedEmail;
      if (!invitedEmail) return showInvitationError("This project invitation is invalid (missing email).");

      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", invitedEmail));
      const userQuerySnapshot = await getDocs(q);

      if (!userQuerySnapshot.empty) {
        const existingUserData = userQuerySnapshot.docs[0].data();
        showWelcome(existingUserData.name, existingUserData.avatar, existingUserData.email);
        document.getElementById("welcome-message").textContent = `Welcome back, ${existingUserData.name}!`;
        feedbackElement.textContent = `You've been invited to a project. Please sign in to accept.`;
      } else {
        emailInput.value = invitedEmail;
        emailInput.readOnly = true;
        feedbackElement.textContent = `Invited to a project as ${invitedEmail}. Please register or sign in.`;
      }
    } catch (error) {
      showInvitationError("An unexpected error occurred. Please check your connection and try again.");
    }
  } else if (parts.length === 3 && parts[1] === 'workspace-invite' && parts[2]) {
    invitationId = parts[2];
    console.log("Workspace Invitation ID found:", invitationId);
    const feedbackElement = document.querySelector(".subtitle");

    try {
      feedbackElement.textContent = "Verifying workspace invitation, please wait...";
      const invitationRef = doc(db, "InvitedWorkspaces", invitationId);
      const invitationSnap = await getDoc(invitationRef);

      if (!invitationSnap.exists()) return showInvitationError("This workspace invitation link is invalid or has expired.");
      const invitationData = invitationSnap.data();
      if (invitationData.status === 'accepted') return showInvitationError("This workspace invitation has already been accepted.");
      const invitedEmail = invitationData.invitedEmail;
      if (!invitedEmail) return showInvitationError("This workspace invitation is invalid (missing email).");

      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", invitedEmail));
      const userQuerySnapshot = await getDocs(q);

      if (!userQuerySnapshot.empty) {
        const existingUserData = userQuerySnapshot.docs[0].data();
        const workspaceId = invitationData.workspaceId;
        sessionStorage.setItem('pendingWorkspaceId', workspaceId);
        showWelcome(existingUserData.name, existingUserData.avatar, existingUserData.email);
        document.getElementById("welcome-message").textContent = `Welcome back, ${existingUserData.name}!`;
        feedbackElement.textContent = `Please sign in to join the workspace. You will be redirected after login.`;
      } else {
        emailInput.value = invitedEmail;
        emailInput.readOnly = true;
        feedbackElement.textContent = `Invited to a workspace as ${invitedEmail}. Please register or sign in.`;
      }
    } catch (error) {
      // LOG THE ACTUAL ERROR to the console to see the real problem
      console.error("Firebase Query Failed:", error);

      showInvitationError("An unexpected error occurred. Please check your connection and try again.");
    }
  } else if (parts.length === 5 && parts[1] === 'tasks' && parts[3] === 'list') {
    const numericProjectId = parts[4];
    console.log("Direct project view link detected for project:", numericProjectId);

    const feedbackElement = document.querySelector(".subtitle");
    const mainTitle = document.querySelector("h2");

    // Hide all forms initially
    document.getElementById("registration-form").style.display = 'none';
    document.getElementById("google-signin-btn").style.display = 'none';
    document.getElementById("continue-email-link").style.display = 'none';
    document.getElementById("orText").style.display = 'none';

    feedbackElement.textContent = "Verifying your access, please wait...";

    // Use onAuthStateChanged for a reliable check of the user's login state
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        // USER IS LOGGED IN
        console.log("User is logged in:", user.email);
        try {
          // Find the project using its numeric ID (assuming this field exists)
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

          // Check if the logged-in user is a member of the project
          if (memberUIDs.includes(user.uid)) {
            // This case is unlikely on a register page, but for completeness:
            // it means the user is logged in and has access, so we can redirect them.
            mainTitle.textContent = "Access Verified";
            feedbackElement.textContent = "Redirecting you to the project...";
            // Redirect them to the page they were trying to access
            window.location.href = window.location.pathname;
          } else {
            // **THIS IS THE KEY LOGIC YOU REQUESTED**
            // User is logged in but with the WRONG account.
            mainTitle.textContent = "Access Denied";
            feedbackElement.textContent = `The account you are signed in with (${user.email}) is not a member of this project. Please sign out and use the correct account.`;
            feedbackElement.style.color = "#E53E3E"; // Red color for error

            // Optionally, you could show a "Sign Out" button here
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
    console.log("Not an invitation link.");
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

// Accept invitation
acceptInvitationBtn?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) {
    alert("Authentication error. Please sign in again.");
    return;
  }
  if (!invitationId) {
    alert("No invitation ID found. Cannot accept invitation.");
    return;
  }

  const path = window.location.pathname;
  if (path.includes('/workspace-invite/')) {
    console.log("Accepting WORKSPACE invitation...");
    await handleWorkspaceInvitationAcceptance(user, invitationId);
  } else if (path.includes('/invitation/')) {
    console.log("Accepting PROJECT invitation...");
    await handleProjectInvitationAcceptance(user, invitationId);
  } else {
    alert("Could not determine invitation type from URL.");
  }
});


// Email Registration Submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const fullName = fullNameInput.value.trim();

  console.log("Starting email registration for:", email, fullName);

  try {
    // Step 1: Create the user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("User registered in Auth:", user.uid);

    // Step 2: Update the user's profile in Firebase Authentication
    await updateProfile(user, { displayName: fullName });
    console.log("Profile updated with display name.");

    // Step 3: Call our single, reusable function to handle ALL database and storage operations.
    // It creates the user doc, generates/uploads the avatar, AND creates the default workspace.
    const photoURL = await saveUserData(user, fullName, email, 'email');

    // Step 4: Show the final welcome screen
    showWelcome(fullName, photoURL, email);

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

      // This also calls our single, reusable function.
      await saveUserData(user, user.displayName, user.email, 'google', user.photoURL);

      showWelcome(user.displayName, user.photoURL, user.email);
    } catch (error) {
      console.error("Google Sign-in error:", error);
      if (error.code !== 'auth/popup-closed-by-user') {
        alert("Error: " + error.message);
      }
    }
  });
});
// Show welcome screen
function showWelcome(name, photoURL, email = '') {
  console.log("Showing welcome view:", name, email);
  document.querySelector("h2").style.display = "none";
  document.querySelector(".subtitle").style.display = "none";
  registrationForm.style.display = "none";
  orText.style.display = "none";
  googleBtn.style.display = "none";
  continueEmailLink.style.display = "none";
  acceptanceView.style.display = "block";

  welcomeMessage.textContent = `Welcome, ${name}!`;

  const photo = document.getElementById("user-photo");
  if (photoURL) {
    photo.src = photoURL;
    console.log("Profile photo set:", photoURL);
  } else {
    // If no photoURL (e.g. email signup without gravatar), generate one
    const initials = name.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('');
    const color = getRandomColor();
    photo.src = generateAvatar(initials, color);
    console.log("Generated avatar for welcome screen.");
  }
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

async function handleWorkspaceInvitationAcceptance(user, invId) {
  console.log(`Accepting workspace invitation ${invId} for user ${user.uid}`);
  acceptInvitationBtn.disabled = true;
  acceptInvitationBtn.textContent = "Processing...";

  const invitationRef = doc(db, "InvitedWorkspaces", invId);
  const userRef = doc(db, "users", user.uid);

  try {
    const invitationSnap = await getDoc(invitationRef);
    if (!invitationSnap.exists()) throw new Error("This invitation is no longer valid or has been deleted.");

    const invitationData = invitationSnap.data();
    if (invitationData.status === 'accepted') throw new Error("This invitation has already been accepted.");
    if (invitationData.invitedEmail.toLowerCase() !== user.email.toLowerCase()) {
      throw new Error("This invitation is for a different email address.");
    }

    const { workspaceId, workspaceRefPath, invitedBy } = invitationData;
    if (!workspaceId || !workspaceRefPath) throw new Error("Invitation is corrupted (missing workspace data).");

    const workspaceRef = doc(db, workspaceRefPath);
    const workspaceSnap = await getDoc(workspaceRef);
    if (!workspaceSnap.exists()) throw new Error("The workspace associated with this invitation no longer exists.");

    // Prepare all database changes in a single batch
    const batch = writeBatch(db);

    // 1. Update the user's document to set their selected workspace
    batch.update(userRef, { selectedWorkspace: workspaceId });

    // 2. Add the user to the workspace's member list
    batch.update(workspaceRef, { members: arrayUnion(user.uid) });

    // 3. Update the invitation status to "accepted"
    batch.update(invitationRef, {
      status: "accepted",
      acceptedAt: serverTimestamp(),
      acceptedBy: { uid: user.uid, name: user.displayName, email: user.email }
    });

    // 4. (Optional but good practice) Clean up the pending invite from the inviter's user document
    if (invitedBy && invitedBy.uid) {
      const inviterUserRef = doc(db, 'users', invitedBy.uid);
      const inviterSnap = await getDoc(inviterUserRef);
      if (inviterSnap.exists()) {
        const pendingInviteToRemove = (inviterSnap.data().workspacePendingInvites || []).find(p => p.invitationId === invId);
        if (pendingInviteToRemove) {
          batch.update(inviterUserRef, { workspacePendingInvites: arrayRemove(pendingInviteToRemove) });
        }
      }
    }

    // Commit all changes at once
    await batch.commit();

    console.log("✅ Workspace invitation accepted successfully!");
    alert("Invitation accepted! You are now a member of the workspace.");

    // Redirect the user to the new workspace
    window.location.href = `/myworkspace/${workspaceId}`;

  } catch (error) {
    console.error("❌ Error accepting workspace invitation:", error);
    alert("Error: " + error.message);
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

  // If the user already exists, we don't need to do anything else here.
  // Just update their data if necessary (e.g., new Google avatar).
  if (!isNewUser) {
    const existingData = userSnap.data();
    const updateData = {
      name: fullName, // Always update name/avatar in case it changed in Google
      avatar: photoURL || existingData.avatar,
    };
    await setDoc(userRef, updateData, { merge: true });
    console.log(`✅ Existing user data for ${email} refreshed.`);
    return photoURL || existingData.avatar;
  }

  // --- Start of New User Setup ---
  console.log("Starting setup for new user...");
  let finalPhotoURL = photoURL;

  // 1. Generate an avatar if one doesn't exist (for email signups)
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

  // 2. Prepare the batch write to ensure atomicity
  const batch = writeBatch(db);

  // 3. Prepare the new workspace document
  // We get its ID *before* committing the batch.
  const workspaceCollectionRef = collection(db, `users/${user.uid}/myworkspace`);
  const newWorkspaceRef = doc(workspaceCollectionRef); // Create a reference with a new ID
  const newWorkspaceData = {
    name: "My First Workspace",
    createdAt: serverTimestamp(),
    members: [user.uid]
  };

  // 4. Prepare the new user document, now INCLUDING the selectedWorkspace ID
  const newUserData = {
    id: user.uid,
    name: fullName,
    email: email,
    provider: provider,
    avatar: finalPhotoURL,
    createdAt: serverTimestamp(),
    selectedWorkspace: newWorkspaceRef.id // Assign the ID directly
  };

  // 5. Add both operations to the batch
  batch.set(userRef, newUserData); // Operation 1: Create the user doc
  batch.set(newWorkspaceRef, newWorkspaceData); // Operation 2: Create the workspace doc

  // 6. Commit the batch
  await batch.commit();
  console.log("✅ New user and default workspace created atomically.");

  return finalPhotoURL;
}