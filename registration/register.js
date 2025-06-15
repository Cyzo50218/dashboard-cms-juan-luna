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
    serverTimestamp  
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
acceptInvitationBtn?.addEventListener("click", () => {
  console.log("Invitation accepted.");
  alert("Invitation accepted. Redirecting...");
  window.location.href = "./";
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
    console.log("Attempting Google sign-in...");
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      console.log("Google user:", user.uid, user.displayName, user.email);

      // Save user data to Firestore
      if (user && user.uid) {
        const userRef = doc(db, "users", user.uid);

        // --- FIX IS HERE ---
        // Use the properties from the Google 'user' object
        const userData = {
  id: user.uid,
  name: user.displayName, // Use user.displayName from Google
  email: user.email,      // Use user.email from Google
  provider: "google",
  avatar: user.photoURL,  // Use user.photoURL from Google
  createdAt: new Date().toISOString()
};

console.log("Preparing to save Google user data:", userData);

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
        console.warn("⚠️ Google user not authenticated. Cannot write to Firestore.");
      }

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
