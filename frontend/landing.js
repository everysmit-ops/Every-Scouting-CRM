const APPLICATIONS_API = "/api/public/applications";

function landingEl(id) {
  return document.getElementById(id);
}

async function submitApplication(payload) {
  const response = await fetch(APPLICATIONS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Не удалось отправить заявку");
  }
  return data;
}

function pushLandingToast(message, type = "info") {
  const stack = landingEl("toastStack");
  if (!stack || !message) return;
  const node = document.createElement("article");
  node.className = "toast-card";
  if (type === "error") node.classList.add("toast-card-error");
  node.innerHTML = `
    <div class="toast-copy">
      <strong>Every Scouting</strong>
      <div>${message}</div>
    </div>
  `;
  stack.appendChild(node);
  window.setTimeout(() => node.remove(), 4200);
}

function setLandingMessage(message) {
  const node = landingEl("landingMessage");
  if (node) node.textContent = message;
}

function bootstrapLanding() {
  const form = landingEl("applicationForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    try {
      setLandingMessage("Отправляем заявку...");
      await submitApplication({
        name: formData.get("name"),
        contact: formData.get("contact"),
        experience: formData.get("experience"),
        languages: formData.get("languages"),
        motivation: formData.get("motivation"),
      });
      form.reset();
      setLandingMessage("Заявка отправлена и уже доступна главному админу.");
      pushLandingToast("Заявка отправлена и уже доступна главному админу.");
    } catch (error) {
      setLandingMessage(error.message);
      pushLandingToast(error.message, "error");
    }
  });
}

bootstrapLanding();
