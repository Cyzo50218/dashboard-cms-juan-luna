import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    fetchSignInMethodsForEmail,
    signInWithEmailAndPassword,
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

// --- 3. GLOBAL STATE ---
let userEmail = ''; // Store the user's email between the two steps

// --- 4. CORE AUTHENTICATION LOGIC ---

/**
 * Checks the user's authentication state on page load.
 * If the user is already logged in, they are redirected to the dashboard.
 */
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User is already signed in:", user.uid);
        // Redirect to the root/dashboard page
        window.location.href = '/dashboard/';
    } else {
        console.log("No user signed in. Ready for login.");
    }
});

/**
 * Handles the first step: email submission.
 * Checks if the email exists in Firebase Authentication.
 */
emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    userEmail = emailInput.value.trim();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);

    if (!userEmail || !isValidEmail) {
        showError(!userEmail ? 'Email is required.' : 'Invalid email address.');
        return;
    }

    try {
        const methods = await fetchSignInMethodsForEmail(auth, userEmail);
        if (methods.length === 0) {
            // This email is not registered.
            showError('Account not found. Please register or try another email.');
        } else {
            // Email exists, proceed to the password step.
            hideMessages();
            slideContainer.classList.add('slide');
        }
    } catch (error) {
        console.error("Error checking email:", error);
        showError("An error occurred. Please try again.");
    }
});

/**
 * Handles the second step: password submission.
 * Attempts to sign the user in with their email and password.
 */
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
        // Successful sign-in is handled by the onAuthStateChanged observer, which will redirect.
    } catch (error) {
        console.error("Sign in error:", error.code);
        hideMessages();
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            showError('Incorrect password. Please try again.');
        } else {
            showError('Failed to sign in. Please try again later.');
        }
    }
});

/**
 * Handles the "Continue with Google" button click.
 * Uses a popup to sign the user in and saves their data to Firestore.
 */
googleSignInBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Save or update user data in Firestore.
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, {
            uid: user.uid,
            name: user.displayName,
            email: user.email,
            provider: "google",
            avatar: user.photoURL,
            createdAt: new Date().toISOString()
        }, { merge: true }); // Use merge to avoid overwriting existing data.

        console.log("Google user data saved to Firestore.");
        // Successful sign-in will be handled by onAuthStateChanged.
        showSuccess('Sign-in successful! Redirecting...');

    } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
            console.error("Google Sign-in error:", error);
            showError('Failed to sign in with Google.');
        }
    }
});


// --- 5. UI HELPER FUNCTIONS & LISTENERS ---

// Listener for the back arrow to return to the email form.
backArrow.addEventListener('click', () => {
    slideContainer.classList.remove('slide');
});

// Listener to toggle password visibility.
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

// Shows an error message in the snackbar.
function showError(message) {
    hideMessages();
    errorMessageEl.textContent = message;
    errorMessageEl.classList.add('show');
    setTimeout(() => errorMessageEl.classList.remove('show'), 3000);
}

// Shows a success message in the snackbar.
function showSuccess(message) {
    hideMessages();
    successMessageEl.textContent = message;
    successMessageEl.classList.add('show');
    setTimeout(() => successMessageEl.classList.remove('show'), 3000);
}

// Hides any visible snackbar messages.
function hideMessages() {
    errorMessageEl.classList.remove('show');
    successMessageEl.classList.remove('show');
}
