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
  
  if (parts.length === 3 && parts[1] === 'invitation' && parts[2]) {
    invitationId = parts[2];
    console.log("Invitation ID found:", invitationId);
    
    const feedbackElement = document.querySelector(".subtitle");
    
    try {
      feedbackElement.textContent = "Verifying invitation, please wait...";
      const invitationRef = doc(db, "InvitedProjects", invitationId);
      const invitationSnap = await getDoc(invitationRef);
      
      if (!invitationSnap.exists()) {
        throw new Error("This invitation link is invalid or has expired.");
      }
      
      const invitationData = invitationSnap.data();
      if (invitationData.status === 'accepted') {
        throw new Error("This invitation has already been accepted.");
      }
      
      const invitedEmail = invitationData.invitedEmail;
      if (!invitedEmail) {
        throw new Error("This invitation is invalid (missing email).");
      }
      
      // --- NEW LOGIC: Check if a user with this email already exists ---
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", invitedEmail));
      const userQuerySnapshot = await getDocs(q);
      
      if (!userQuerySnapshot.empty) {
        // USER EXISTS: Skip registration and show the welcome/acceptance screen directly.
        const existingUserData = userQuerySnapshot.docs[0].data();
        console.log("Existing user found:", existingUserData.name);
        
        // This function hides the registration form and shows the acceptance view
        showWelcome(existingUserData.name, existingUserData.avatar, existingUserData.email);
        
        // Update the welcome text specifically for a returning user
        document.getElementById("welcome-message").textContent = `Welcome back, ${existingUserData.name}!`;
        feedbackElement.textContent = `You've been invited to a project. Please sign in to accept.`;
        
      } else {
        // USER DOES NOT EXIST: Proceed with the normal pre-fill flow.
        console.log("New user. Displaying registration form.");
        emailInput.value = invitedEmail;
        emailInput.readOnly = true;
        feedbackElement.textContent = `Invited as ${invitedEmail}. Please register or sign in to continue.`;
      }
      // --- END OF NEW LOGIC ---
      
    } catch (error) {
      console.error("Error verifying invitation:", error);
      feedbackElement.textContent = error.message;
      feedbackElement.style.color = "#E53E3E";
      // Disable all forms if the invitation is invalid
      document.getElementById("registration-form").style.display = 'none';
      document.getElementById("google-signin-btn").style.display = 'none';
      document.getElementById("continue-email-link").style.display = 'none';
      document.getElementById("orText").style.display = 'none';
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


// Email registration submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const fullName = fullNameInput.value.trim();

  console.log("Starting email registration for:", email, fullName);

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("User registered:", user.uid);

    await updateProfile(user, { displayName: fullName });
    console.log("Profile updated with display name.");

    // Generate avatar
    const initials = fullName.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('');
    const color = getRandomColor();
    const dataUrl = generateAvatar(initials, color);
    const avatarPath = `users/${user.uid}/profile-picture/avatar.png`;

    const storageRef = ref(storage, avatarPath);
    await uploadString(storageRef, dataUrl, 'data_url');
    console.log("Avatar uploaded to storage:", avatarPath);

    const downloadURL = await getDownloadURL(storageRef);
    console.log("Avatar download URL:", downloadURL);

    if (user && user.uid) {
      const userRef = doc(db, "users", user.uid);

      const userData = {
        id: user.uid,
        name: fullName,
        email: email,
        provider: "email",
        avatar: downloadURL,
        createdAt: new Date().toISOString()
      };

      console.log("Preparing to save user data:", userData);

      try {

  await setDoc(userRef, userData, { merge: true }); 
  console.log("✅ Google user saved in Firestore successfully.");

  const workspaceRef = collection(db, `users/${user.uid}/myworkspace`);
  const newWorkspace = {
    name: "My First Workspace", 
    isSelected: true,
    createdAt: serverTimestamp(), 
    members: [user.uid] 
  };

  await addDoc(workspaceRef, newWorkspace);
  console.log("✅ Default workspace created successfully.");

} catch (error) {
  console.error("❌ Error saving Google user or creating workspace:", error);
}
    } else {
      console.warn("⚠️ User not authenticated. Cannot write to Firestore.");
    }

    showWelcome(fullName, downloadURL, email);
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
      
      // Save user data (your existing logic is great)
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
    
    // Verify the email matches
    if (invitationData.invitedEmail.toLowerCase() !== user.email.toLowerCase()) {
      throw new Error("This invitation is for a different email address. Please log in with the correct account.");
    }
    
    const projectsCollectionGroup = collectionGroup(db, 'projects');

// 2. Query across all 'projects' subcollections to find the one with the matching projectId field.
const q = query(projectsCollectionGroup, where('projectId', '==', projectId));
const projectQuerySnapshot = await getDocs(q);

if (projectQuerySnapshot.empty) {
  // This means no project with that ID was found anywhere.
  throw new Error("The project associated with this invitation no longer exists.");
}

// 3. Get the document snapshot and its reference from the query result.
const projectSnap = projectQuerySnapshot.docs[0]; // The first (and only) document found
const projectRef = projectSnap.ref; // The correct, full path reference to the project document
    
    const projectData = projectSnap.data();
    
    // Find the specific pending invite object to remove
    const pendingInviteToRemove = (projectData.pendingInvites || []).find(p => p.invitationId === invId);
    if (pendingInviteToRemove) {
      batch.update(projectRef, { pendingInvites: arrayRemove(pendingInviteToRemove) });
    }
    
    // Add the new member to the 'members' array
    batch.update(projectRef, {
      members: arrayUnion({ uid: user.uid, role: role }),
      memberUIDs: arrayUnion(user.uid) // Also update the simple memberUIDs array
    });
    
    // 2. Update the invitation status to "accepted" in InvitedProjects
    batch.update(invitationRef, {
      status: "accepted",
      acceptedAt: serverTimestamp(),
      acceptedBy: {
        uid: user.uid,
        name: user.displayName,
        email: user.email
      }
    });
    
    // Commit all the changes at once
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