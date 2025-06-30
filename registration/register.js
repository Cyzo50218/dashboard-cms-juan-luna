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
  
  // --- A new helper function to show an error and stop ---
  const showInvitationError = (message) => {
    const feedbackElement = document.querySelector(".subtitle");
    console.error("Invitation Error:", message);
    
    // 1. Show the browser alert
    alert(message);
    
    // 2. Update the on-page feedback element
    feedbackElement.textContent = message;
    feedbackElement.style.color = "#E53E3E"; // Red color
    
    // 3. Disable all forms
    document.getElementById("registration-form").style.display = 'none';
    document.getElementById("google-signin-btn").style.display = 'none';
    document.getElementById("continue-email-link").style.display = 'none';
    document.getElementById("orText").style.display = 'none';
  };
  
  
  if (parts.length === 3 && parts[1] === 'invitation' && parts[2]) {
    invitationId = parts[2];
    console.log("Invitation ID found:", invitationId);
    
    const feedbackElement = document.querySelector(".subtitle");
    
    try {
      feedbackElement.textContent = "Verifying invitation, please wait...";
      const invitationRef = doc(db, "InvitedProjects", invitationId);
      const invitationSnap = await getDoc(invitationRef);
      
      // Using the new error handler
      if (!invitationSnap.exists()) {
        return showInvitationError("This invitation link is invalid or has expired.");
      }
      
      const invitationData = invitationSnap.data();
      if (invitationData.status === 'accepted') {
        return showInvitationError("This invitation has already been accepted.");
      }
      
      const invitedEmail = invitationData.invitedEmail;
      if (!invitedEmail) {
        return showInvitationError("This invitation is invalid (missing email).");
      }
      
      // Check if a user with this email already exists
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", invitedEmail));
      const userQuerySnapshot = await getDocs(q);
      
      if (!userQuerySnapshot.empty) {
        // USER EXISTS
        const existingUserData = userQuerySnapshot.docs[0].data();
        showWelcome(existingUserData.name, existingUserData.avatar, existingUserData.email);
        document.getElementById("welcome-message").textContent = `Welcome back, ${existingUserData.name}!`;
        feedbackElement.textContent = `You've been invited to a project. Please sign in to accept.`;
        
      } else {
        // USER DOES NOT EXIST
        emailInput.value = invitedEmail;
        emailInput.readOnly = true;
        feedbackElement.textContent = `Invited as ${invitedEmail}. Please register or sign in to continue.`;
      }
      
    } catch (error) {
      // The catch block will now handle unexpected errors (e.g., network failure)
      showInvitationError("An unexpected error occurred. Please check your connection and try again.");
    }
    
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
  await handleInvitationAcceptance(user, invitationId);
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

async function handleInvitationAcceptance(user, invId) {
  console.log(`Accepting invitation ${invId} for user ${user.uid}`);
  acceptInvitationBtn.disabled = true;
  acceptInvitationBtn.textContent = "Processing...";
  
  const invitationRef = doc(db, "InvitedProjects", invId);
  
  try {
    const invitationSnap = await getDoc(invitationRef);
    
    if (!invitationSnap.exists()) {
      throw new Error("This invitation is no longer valid or has been deleted.");
    }
    
    const invitationData = invitationSnap.data();
    console.log("Invitation data:", invitationData);
    
    if (invitationData.invitedEmail.toLowerCase() !== user.email.toLowerCase()) {
      throw new Error("This invitation is for a different email address. Please log in with the correct account.");
    }
    
    const projectId = invitationData.projectId;
    const role = invitationData.role;
    const projectsCollectionGroup = collectionGroup(db, 'projects');
    
    const q = query(projectsCollectionGroup, where('projectId', '==', projectId));
    const projectQuerySnapshot = await getDocs(q);
    
    if (projectQuerySnapshot.empty) {
      throw new Error("The project associated with this invitation no longer exists.");
    }
    
    const projectSnap = projectQuerySnapshot.docs[0];
    const projectRef = projectSnap.ref;
    const projectData = projectSnap.data();
    
    const batch = writeBatch(db);
    
    // ✅ Get the user's active workspace using the new, direct method.
    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);
    let activeWorkspaceId = null;
    
    if (userSnap.exists() && userSnap.data().selectedWorkspace) {
      activeWorkspaceId = userSnap.data().selectedWorkspace;
      console.log("Found active workspace:", activeWorkspaceId);
    } else {
      console.warn("Could not find an active workspace for the user. Skipping auto-selection of the project.");
    }
    
    // --- The old query logic has been completely replaced by the block above ---
    
    // Find the specific pending invite object to remove
    const pendingInviteToRemove = (projectData.pendingInvites || []).find(p => p.invitationId === invId);
    if (pendingInviteToRemove) {
      batch.update(projectRef, { pendingInvites: arrayRemove(pendingInviteToRemove) });
    }
    
    // Add the new member to the project
    batch.update(projectRef, {
      members: arrayUnion({ uid: user.uid, role: role }),
      memberUIDs: arrayUnion(user.uid)
    });
    
    // Update the invitation status
    batch.update(invitationRef, {
      status: "accepted",
      acceptedAt: serverTimestamp(),
      acceptedBy: {
        uid: user.uid,
        name: user.displayName,
        email: user.email
      }
    });
    
    // If an active workspace was found, automatically select the new project for the user.
    if (activeWorkspaceId) {
      const workspaceRef = doc(db, `users/${user.uid}/myworkspace/${activeWorkspaceId}`);
      batch.set(workspaceRef, {
        selectedProjectId: projectId
      }, { merge: true });
    }
    
    // Commit all changes at once
    await batch.commit();
    
    console.log("✅ Invitation accepted and project updated successfully!");
    alert("Invitation accepted! You are now a member of the project.");
    
    const numericUserId = stringToNumericString(user.uid);
    const numericProjectId = stringToNumericString(projectId);
    const href = `/tasks/${numericUserId}/list/${numericProjectId}`;
    console.log(`Redirecting to: ${href}`);
    window.location.href = href;
    
  } catch (error) {
    console.error("❌ Error accepting invitation:", error);
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
  
  let finalPhotoURL = photoURL;
  if (provider === 'email' && isNewUser) {
    const initials = fullName.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('');
    const color = getRandomColor();
    const dataUrl = generateAvatar(initials, color);
    const avatarPath = `users/${user.uid}/profile-picture/avatar.png`;
    const storageRef = ref(storage, avatarPath);
    await uploadString(storageRef, dataUrl, 'data_url');
    finalPhotoURL = await getDownloadURL(storageRef);
  }
  
  const userData = {
    id: user.uid,
    name: fullName,
    email: email,
    provider: provider,
    avatar: finalPhotoURL,
    ...(isNewUser && { createdAt: serverTimestamp() })
  };
  
  await setDoc(userRef, userData, { merge: true });
  console.log(`✅ User data for ${email} saved successfully.`);
  
  if (isNewUser) {
    try {
      const workspaceRef = collection(db, `users/${user.uid}/myworkspace`);
      const newWorkspace = {
        name: "My First Workspace",
        createdAt: serverTimestamp(),
        members: [user.uid]
      };
      
      // ✅ Step 1: Create the new workspace and get its reference.
      const newWorkspaceRef = await addDoc(workspaceRef, newWorkspace);
      console.log("✅ Default workspace created successfully for new user.");
      
      // ✅ Step 2: Update the main user document with the ID of the new workspace.
      // This sets the new workspace as the default 'selectedWorkspace'.
      await updateDoc(userRef, {
        selectedWorkspace: newWorkspaceRef.id
      });
      console.log(`✅ Set '${newWorkspaceRef.id}' as the default selected workspace.`);
      
    } catch (error) {
      console.error("❌ Error creating default workspace:", error);
    }
  }
  
  return finalPhotoURL;
}