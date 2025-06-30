import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "/services/firebase-config.js";

// --- 1. INITIALIZATION ---
console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "juanluna-cms-01");
console.log("Firebase initialized.");

// --- 2. DOM ELEMENTS ---
const slideContainer = document.getElementById('slideContainer');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessageEl = document.getElementById('errorMessage');
const successMessageEl = document.getElementById('successMessage');
const emailForm = document.getElementById('emailForm');
const passwordForm = document.getElementById('passwordForm');
const backArrow = document.getElementById('backArrow');
const togglePassword = document.getElementById("togglePassword");
const googleSignInBtn = document.querySelector('.google-signin-btn');
const forgotPasswordLinks = document.querySelectorAll('.forgot-password-link'); // Selects both links

// --- 3. GLOBAL STATE ---
let userEmail = ''; // Store the user's email between the two steps

// --- 4. CORE AUTHENTICATION LOGIC ---

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User is already signed in:", user.uid);
        window.location.href = '/';
    } else {
        console.log("No user signed in. Ready for login.");
    }
});

emailForm.addEventListener('submit', (e) => {
    e.preventDefault();
    userEmail = emailInput.value.trim();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);
    if (!isValidEmail) {
        showError('Please enter a valid email address.');
        return;
    }
    hideMessages();
    slideContainer.classList.add('slide');
});

passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passwordInput.value.trim();
    if (!password) {
        showError('Password is required.');
        return;
    }
    try {
        showSuccess('Signing in...');
        await signInWithEmailAndPassword(auth, userEmail, password);
    } catch (error) {
        console.error("Sign in error:", error.code);
        hideMessages();
        if (error.code === 'auth/invalid-credential') {
            showError('Invalid credentials. Please check email or password.');
            passwordInput.value = '';
            slideContainer.classList.remove('slide');
        } else {
            showError('An error occurred. Please try again later.');
        }
    }
});

googleSignInBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        await saveUserData(user, user.displayName, user.email, "google", user.photoURL);
        
        showSuccess('Sign-in successful! Redirecting...');
        
        // Add a small delay before redirecting to allow success message to be seen
        setTimeout(() => {
            window.location.href = '/dashboard'; // Or your desired redirect path
        }, 1500);
        
    } catch (error) {
        // Don't show an error if the user simply closes the popup
        if (error.code !== 'auth/popup-closed-by-user') {
            console.error("Google Sign-In Error:", error);
            showError('Failed to sign in with Google.');
        }
    }
});

// --- NEW: FORGOT PASSWORD LOGIC ---
forgotPasswordLinks.forEach(link => {
    link.addEventListener('click', async (e) => {
        e.preventDefault();
        const emailForReset = emailInput.value.trim();
        if (!emailForReset) {
            showError("Please enter your email address above before clicking 'Forgot Password'.");
            return;
        }

        try {
            await sendPasswordResetEmail(auth, emailForReset);
            // For security, always show a generic success message.
            // Do not confirm if the email exists or not.
            showSuccess("If an account with that email exists, a password reset link has been sent.");
        } catch (error) {
            console.error("Password reset error:", error);
            // Also show a generic message on failure.
            showSuccess("If an account with that email exists, a password reset link has been sent.");
        }
    });
});


// --- 5. UI HELPER FUNCTIONS & LISTENERS ---

backArrow.addEventListener('click', () => {
    slideContainer.classList.remove('slide');
});

togglePassword.addEventListener("click", function() {
    const icon = this.querySelector("i");
    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        icon.classList.remove("bi-eye");
        icon.classList.add("bi-eye-slash");
    } else {
        passwordInput.type = "password";
        icon.classList.remove("bi-eye-slash");
        icon.classList.add("bi-eye");
    }
});

function showError(message) {
    hideMessages();
    errorMessageEl.textContent = message;
    errorMessageEl.classList.add('show');
    setTimeout(() => errorMessageEl.classList.remove('show'), 3000);
}

function showSuccess(message) {
    hideMessages();
    successMessageEl.textContent = message;
    successMessageEl.classList.add('show');
    setTimeout(() => successMessageEl.classList.remove('show'), 3000);
}

function hideMessages() {
    errorMessageEl.classList.remove('show');
    successMessageEl.classList.remove('show');
}

/**
 * Saves or updates user data in Firestore.
 * Crucially, it checks if the user is new and, if so, creates their
 * default workspace and sets it as the selected one.
 * @param {object} user - The Firebase Auth user object.
 * @param {string} fullName - The user's full name.
 * @param {string} email - The user's email.
 * @param {string} provider - The auth provider (e.g., 'google', 'email').
 * @param {string|null} photoURL - The URL for the user's avatar.
 */
async function saveUserData(user, fullName, email, provider, photoURL = null) {
    if (!user || !user.uid) {
        console.warn("⚠️ User not authenticated. Cannot write to Firestore.");
        return null;
    }
    
    const userRef = doc(db, "users", user.uid);
    
    // This is the key step: check if the user document already exists.
    const userSnap = await getDoc(userRef);
    const isNewUser = !userSnap.exists();
    
    console.log(isNewUser ? "New user detected." : "Existing user detected.");
    
    let finalPhotoURL = photoURL;
    // Only generate a new avatar if it's a new user signing up with email
    if (provider === 'email' && isNewUser) {
        const initials = fullName.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('');
        const color = getRandomColor(); // Assuming you have this helper function
        const dataUrl = generateAvatar(initials, color); // Assuming you have this helper
        const avatarPath = `users/${user.uid}/profile-picture/avatar.png`;
        const storageRef = ref(storage, avatarPath);
        await uploadString(storageRef, dataUrl, 'data_url');
        finalPhotoURL = await getDownloadURL(storageRef);
    }
    
    // Prepare the user data. The 'createdAt' field is only added for new users.
    const userData = {
        id: user.uid,
        name: fullName,
        email: email,
        provider: provider,
        avatar: finalPhotoURL,
        ...(isNewUser && { createdAt: serverTimestamp() })
    };
    
    // Save the user data. 'merge: true' prevents overwriting existing fields.
    await setDoc(userRef, userData, { merge: true });
    console.log(`✅ User data for ${email} saved successfully.`);
    
    // This block ONLY runs if the user is brand new.
    if (isNewUser) {
        try {
            const workspaceRef = collection(db, `users/${user.uid}/myworkspace`);
            const newWorkspace = {
                name: "My First Workspace",
                createdAt: serverTimestamp(),
                members: [user.uid]
            };
            
            // Create the new workspace and get its reference
            const newWorkspaceRef = await addDoc(workspaceRef, newWorkspace);
            console.log("✅ Default workspace created successfully for new user.");
            
            // Update the main user document with the ID of the new workspace
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