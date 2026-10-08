// Keep this entry independent of React/editor modules so import failures stay visible.
void import("./renderApp").catch((error: unknown) => {
  console.error("Galley Pad startup failed", error);
  const status = document.getElementById("startup-status");
  if (status) {
    status.setAttribute("role", "alert");
    status.textContent = `Galley Pad could not start: ${error instanceof Error ? error.message : String(error)}. Close this window and try opening the file again.`;
  }
});
