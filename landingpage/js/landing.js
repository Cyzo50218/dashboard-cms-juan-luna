document.addEventListener("DOMContentLoaded", () => {
  // Animate features on scroll
  const featureCards = document.querySelectorAll(".feature-card");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = "1";
          entry.target.style.transform = "translateY(0)";
        }
      });
    },
    { threshold: 0.1 }
  );

  featureCards.forEach((card) => {
    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";
    card.style.transition = "opacity 0.5s ease, transform 0.5s ease";
    observer.observe(card);
  });

  // Simple testimonial slider
  const testimonials = [
    {
      text: "Juan Luna Collections has transformed how our team works. We're 40% more productive since we started using it!",
      author: "Maria Santos",
      role: "Marketing Director, ABC Corp",
      image: "images/testimonial1.jpg",
    },
    {
      text: "The best task management tool we've used. Intuitive interface and powerful features.",
      author: "John Doe",
      role: "CTO, TechStart",
      image: "images/testimonial2.jpg",
    },
  ];

  let currentTestimonial = 0;
  const testimonialElement = document.querySelector(".testimonial");
  const testimonialText = document.querySelector(".testimonial-text");
  const testimonialAuthor = testimonialElement.querySelector("h4");
  const testimonialRole = testimonialElement.querySelector("p");
  const testimonialImage = testimonialElement.querySelector("img");

  function showTestimonial(index) {
    const testimonial = testimonials[index];
    testimonialText.textContent = testimonial.text;
    testimonialAuthor.textContent = testimonial.author;
    testimonialRole.textContent = testimonial.role;
    testimonialImage.src = testimonial.image;
    testimonialImage.alt = testimonial.author;
  }

  // Auto-rotate testimonials every 5 seconds
  setInterval(() => {
    currentTestimonial = (currentTestimonial + 1) % testimonials.length;
    showTestimonial(currentTestimonial);
  }, 5000);
});
