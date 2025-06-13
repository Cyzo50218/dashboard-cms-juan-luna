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
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, {
            uid: user.uid,
            name: user.displayName,
            email: user.email,
            provider: "google",
            avatar: user.photoURL,
            createdAt: new Date().toISOString()
        }, { merge: true });
        showSuccess('Sign-in successful! Redirecting...');
    } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
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
