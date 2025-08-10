// Smooth scrolling for anchor links
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const targetId = this.getAttribute("href");
      if (targetId === "#") return;

      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        // Update active nav link
        document.querySelectorAll(".nav-links a").forEach((link) => {
          link.classList.remove("active");
        });
        this.classList.add("active");

        // Smooth scroll to section
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });

  // Add shadow to header on scroll
  const header = document.querySelector(".header");
  if (header) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 50) {
        header.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
        header.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.1)";
        header.style.transition = "all 0.5s ease";
        document.querySelectorAll(".nav-links a").forEach((link) => {
          link.style.textShadow = "none";
        });
      } else {
        header.style.backgroundColor = "transparent";
        header.style.boxShadow = "none";
        document.querySelectorAll(".nav-links a").forEach((link) => {
          link.style.textShadow = "1px 1px 3px rgba(0, 0, 0, 0.5)";
        });
      }
    });
  }

  // Section transition effects with slower animations
  const sections = document.querySelectorAll("section");
  const navLinks = document.querySelectorAll(".nav-links a");

  function activateSection() {
    let current = "";
    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (pageYOffset >= sectionTop - 300) {
        current = section.getAttribute("id");
      }
    });

    navLinks.forEach((link) => {
      link.classList.remove("active");
      if (link.getAttribute("href") === `#${current}`) {
        link.classList.add("active");
      }
    });

    // Add fade effects with slower timing
    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const isVisible =
        rect.top < window.innerHeight - 100 && rect.bottom >= 100;

      if (isVisible) {
        section.style.opacity = "1";
        section.style.transform = "translateY(0)";
        section.style.transition = "opacity 1s ease, transform 1s ease";
      } else {
        section.style.opacity = "0";
        section.style.transform = "translateY(20px)";
      }
    });
  }

  // Initialize sections with opacity 0 and slight offset
  sections.forEach((section) => {
    section.style.opacity = "0";
    section.style.transform = "translateY(20px)";
    section.style.transition = "opacity 1s ease, transform 1s ease";
  });

  // Show first section immediately
  if (sections.length > 0) {
    sections[0].style.opacity = "1";
    sections[0].style.transform = "translateY(0)";
  }

  window.addEventListener("scroll", activateSection);
  activateSection(); // Run once on load

  // Login button functionality
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", (e) => {
      e.preventDefault();
      alert("Login functionality would be implemented here");
      // In a real app, this would show a login modal or similar
    });
  }
});
