let hasRenderedFatalError = false;

function normalizeError(reason) {
  if (reason instanceof Error) {
    return reason;
  }

  if (typeof reason === "string") {
    return new Error(reason);
  }

  try {
    return new Error(JSON.stringify(reason));
  } catch {
    return new Error("Unknown application error");
  }
}

function renderFatalError(error) {
  if (hasRenderedFatalError) {
    return;
  }

  hasRenderedFatalError = true;
  console.error("[TWBTD]", error);

  const overlay = document.createElement("section");
  overlay.className = "fatal-error";
  overlay.setAttribute("role", "alert");
  overlay.innerHTML = `
    <div class="fatal-error-card">
      <h2>The door faltered.</h2>
      <p>An unexpected problem occurred. Reload the page to continue.</p>
      <button class="primary-button" type="button" data-reload>Reload</button>
    </div>
  `;

  overlay.querySelector("[data-reload]")?.addEventListener("click", () => {
    window.location.reload();
  }, { once: true });

  document.body.appendChild(overlay);
}

export function initErrorBoundary() {
  window.addEventListener("error", (event) => {
    renderFatalError(normalizeError(event.error ?? event.message));
  });

  window.addEventListener("unhandledrejection", (event) => {
    renderFatalError(normalizeError(event.reason));
  });
}

export function reportFatalError(error) {
  renderFatalError(normalizeError(error));
}
