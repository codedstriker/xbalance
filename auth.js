/* ==========================================================================
   XBalance authentication and theme controls
   ========================================================================== */

const SUPABASE_URL = "https://moxwhdojgbjvlatkvzgp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1veHdoZG9qZ2JqdmxhdGt2emdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjQ2MTAsImV4cCI6MjEwMzg0MDYxMH0.SQxk4ECN8fcVE4u5FhQ-ZrNqvJ0ToJ5okGVkNOa94gA";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

/**
 * Resolves a local page URL correctly for local hosting and GitHub Pages.
 */
function pageUrl(filename) {
  return new URL(filename, window.location.href).href;
}

function setMessage(message = "", isError = false) {
  const messageElement = document.querySelector("#auth-message");
  messageElement.textContent = message;
  messageElement.classList.toggle("is-error", isError);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("xbalance-theme", theme);

  const toggle = document.querySelector("#theme-toggle");
  if (toggle) {
    const isDark = theme === "dark";
    toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    toggle.innerHTML = `<span aria-hidden="true">${isDark ? "☀" : "◐"}</span>`;
  }
}

function initializeTheme() {
  const savedTheme = localStorage.getItem("xbalance-theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(savedTheme || (systemPrefersDark ? "dark" : "light"));

  document.querySelector("#theme-toggle").addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });
}

function switchAuthView(view) {
  const isSignIn = view === "signin";

  document.querySelector("#signin-form").classList.toggle("is-hidden", !isSignIn);
  document.querySelector("#signup-form").classList.toggle("is-hidden", isSignIn);

  document.querySelectorAll("[data-auth-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authView === view);
  });

  setMessage("");
}

async function signIn(event) {
  event.preventDefault();

  const email = document.querySelector("#signin-email").value.trim();
  const password = document.querySelector("#signin-password").value;

  setMessage("Signing you in…");

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    setMessage(error.message, true);
    return;
  }

  window.location.assign(pageUrl("dashboard.html"));
}

async function signUp(event) {
  event.preventDefault();

  const displayName = document.querySelector("#signup-name").value.trim();
  const email = document.querySelector("#signup-email").value.trim();
  const password = document.querySelector("#signup-password").value;

  setMessage("Creating your account…");

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: pageUrl("index.html")
    }
  });

  if (error) {
    setMessage(error.message, true);
    return;
  }

  if (data.session) {
    window.location.assign(pageUrl("dashboard.html"));
    return;
  }

  setMessage("Account created. Check your email to confirm your account, then sign in.");
}

async function signInWithProvider(provider) {
  setMessage(`Redirecting to ${provider === "github" ? "GitHub" : "Google"}…`);

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: pageUrl("dashboard.html")
    }
  });

  if (error) {
    setMessage(error.message, true);
  }
}

async function redirectAuthenticatedUser() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (session) {
    window.location.replace(pageUrl("dashboard.html"));
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  initializeTheme();
  await redirectAuthenticatedUser();

  document.querySelectorAll("[data-auth-view]").forEach((button) => {
    button.addEventListener("click", () => switchAuthView(button.dataset.authView));
  });

  document.querySelector("#signin-form").addEventListener("submit", signIn);
  document.querySelector("#signup-form").addEventListener("submit", signUp);

  document.querySelectorAll("[data-provider]").forEach((button) => {
    button.addEventListener("click", () => signInWithProvider(button.dataset.provider));
  });
});
