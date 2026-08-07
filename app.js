import { initErrorBoundary, reportFatalError } from "./error-boundary.js";
import { saveController } from "./save-controller.js";

const enterButton = document.querySelector("#enter-button");
const statusText = document.querySelector("#status-text");

function bindHomeScreen() {
  enterButton?.addEventListener("click", () => {
    if (statusText) {
      statusText.textContent = "The Tavern is quiet. The way beyond will open from here.";
    }
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
  } catch (error) {
    console.error("[TWBTD] Service worker registration failed.", error);
  }
}

async function bootstrap() {
  initErrorBoundary();

  try {
    saveController.ensureAccount();
    bindHomeScreen();
    await registerServiceWorker();
    document.documentElement.dataset.appReady = "true";
  } catch (error) {
    reportFatalError(error);
  }
}

bootstrap();
