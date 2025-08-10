document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();

      // Get form values
      const email = document.getElementById("loginEmail").value;
      const password = document.getElementById("loginPassword").value;
      const rememberMe = document.getElementById("remember").checked;

      // Simple validation
      if (!email || !password) {
        alert("Please fill in all required fields");
        return;
      }

      // In a real app, you would send this data to your server
      console.log("Login submitted:", { email, password, rememberMe });

      // Show success message and redirect (simulated)
      alert("Login successful! Redirecting to your account...");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1000);
    });
  }

  // Social login buttons
  const googleBtn = document.querySelector(".btn-social.google");
  const facebookBtn = document.querySelector(".btn-social.facebook");

  if (googleBtn) {
    googleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      alert("Google login would be implemented here");
      // In a real app, this would trigger Google OAuth flow
    });
  }

  if (facebookBtn) {
    facebookBtn.addEventListener("click", (e) => {
      e.preventDefault();
      alert("Facebook login would be implemented here");
      // In a real app, this would trigger Facebook OAuth flow
    });
  }
});
