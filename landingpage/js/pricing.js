document.addEventListener("DOMContentLoaded", () => {
  // FAQ accordion functionality
  const faqItems = document.querySelectorAll(".faq-item h3");
  faqItems.forEach((item) => {
    item.addEventListener("click", () => {
      const answer = item.nextElementSibling;
      answer.style.display =
        answer.style.display === "block" ? "none" : "block";
    });
  });

  // Add animation to plan cards
  const planCards = document.querySelectorAll(".plan-card");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.style.opacity = "1";
            entry.target.style.transform = "translateY(0)";
          }, index * 150);
        }
      });
    },
    { threshold: 0.1 }
  );

  planCards.forEach((card) => {
    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";
    card.style.transition = "opacity 0.5s ease, transform 0.5s ease";
    observer.observe(card);
  });
});
