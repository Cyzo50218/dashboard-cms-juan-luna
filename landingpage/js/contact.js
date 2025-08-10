document.addEventListener("DOMContentLoaded", () => {
  const contactForm = document.getElementById("contactForm");

  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();

      // Get form values
      const name = document.getElementById("name").value;
      const email = document.getElementById("email").value;
      const subject = document.getElementById("subject").value;
      const message = document.getElementById("message").value;

      // Simple validation
      if (!name || !email || !subject || !message) {
        alert("Please fill in all fields");
        return;
      }

      // In a real app, you would send this data to your server
      console.log("Form submitted:", { name, email, subject, message });

      // Show success message
      alert("Thank you for your message! We will get back to you soon.");

      // Reset form
      contactForm.reset();
    });
  }
});
