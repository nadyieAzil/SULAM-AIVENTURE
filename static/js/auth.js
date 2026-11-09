// Supabase authentication and guest-mode handling.
(function () {
  const screen = document.querySelector("#auth-screen");
  const form = document.querySelector("#auth-form");
  const message = document.querySelector("#auth-message");
  const identity = document.querySelector("#auth-identity");
  const password = document.querySelector("#auth-password");
  const submit = document.querySelector("#auth-submit");
  const tabs = {
    login: document.querySelector("#auth-tab-login"),
    signup: document.querySelector("#auth-tab-signup"),
  };
  let client = null;
  let session = null;
  let currentUser = null;
  let authRequired = false;
  let authAvailable = false;
  let mode = "login";
  let previousFocus = null;
  const listeners = new Set();

  function language() {
    return document.documentElement.lang === "en" ? "en" : "ms";
  }

  function text(key) {
    return T[language()][key];
  }

  function setMessage(value = "") {
    message.textContent = value;
  }

  function setMode(nextMode) {
    mode = nextMode;
    tabs.login.setAttribute("aria-selected", String(mode === "login"));
    tabs.signup.setAttribute("aria-selected", String(mode === "signup"));
    submit.dataset.i18n = mode === "signup" ? "auth_signup_submit" : "auth_login_submit";
    submit.textContent = text(submit.dataset.i18n);
    password.autocomplete = mode === "signup" ? "new-password" : "current-password";
    document.querySelector("#auth-privacy").hidden = mode !== "signup";
    setMessage("");
  }

  function close() {
    const shouldRestoreFocus = !screen.hidden && screen.contains(document.activeElement);
    screen.hidden = true;
    screen.setAttribute("aria-hidden", "true");
    setMessage("");
    if (shouldRestoreFocus && previousFocus?.isConnected) previousFocus.focus();
  }

  function open(prompt = "") {
    if (screen.hidden) previousFocus = document.activeElement;
    if (!authAvailable) {
      setMode("login");
      screen.hidden = false;
      screen.setAttribute("aria-hidden", "false");
      identity.disabled = true;
      password.disabled = true;
      submit.disabled = true;
      tabs.login.disabled = true;
      tabs.signup.disabled = true;
      document.querySelector("#auth-guest").focus();
      setMessage(prompt || text("auth_unavailable"));
      return;
    }
    identity.disabled = false;
    password.disabled = false;
    submit.disabled = false;
    tabs.login.disabled = false;
    tabs.signup.disabled = false;
    setMode("login");
    screen.hidden = false;
    screen.setAttribute("aria-hidden", "false");
    setMessage(prompt);
    identity.focus();
  }

  function emit() {
    listeners.forEach(listener => listener(currentUser));
    window.dispatchEvent(new CustomEvent("mathmentor:authchange", {
      detail: { user: currentUser },
    }));
    if (currentUser) close();
  }

  function userLabel(user) {
    const name = user?.user_metadata?.name || user?.user_metadata?.username || user?.email;
    return name || text("account_guest");
  }

  function updateAccount(user) {
    const status = document.querySelector("#account-status");
    status.textContent = user ? `${text("account_signed_in")} ${userLabel(user)}` : text("account_guest");
    document.querySelector("#account-login").hidden = Boolean(user) || !authAvailable;
    document.querySelector("#account-logout").hidden = !user;
  }

  function normalizeIdentity(value) {
    const trimmed = value.trim();
    if (trimmed.includes("@")) return trimmed;
    const username = trimmed.toLowerCase();
    if (!/^[a-z0-9._-]{1,30}$/.test(username)) {
      throw new Error(text("auth_invalid_username"));
    }
    return `${username}@mathmentor.student`;
  }

  function friendlyError(error) {
    const description = String(error?.message || "").toLowerCase();
    if (description.includes("invalid login credentials") || description.includes("invalid credentials")) {
      return text("auth_wrong_password");
    }
    if (description.includes("password") && (description.includes("weak") || description.includes("short") || description.includes("least"))) {
      return text("auth_weak_password");
    }
    if (description.includes("fetch") || description.includes("network") || !navigator.onLine) {
      return text("auth_network_error");
    }
    return error?.message || text("auth_network_error");
  }

  async function initialize() {
    try {
      const response = await fetch("/api/config");
      if (!response.ok) throw new Error(`Configuration request failed (${response.status})`);
      const config = await response.json();
      if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) {
        updateAccount(null);
        return;
      }
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      authAvailable = true;
      authRequired = Boolean(config.authRequired);
      client.auth.onAuthStateChange((_event, nextSession) => {
        session = nextSession;
        currentUser = nextSession?.user || null;
        updateAccount(currentUser);
        emit();
      });
    } catch (error) {
      console.error("Authentication configuration unavailable:", error);
      authAvailable = false;
      authRequired = false;
      updateAccount(null);
      return;
    }

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      session = data.session;
      currentUser = session?.user || null;
      updateAccount(currentUser);
      emit();
    } catch (error) {
      console.error("Session restore failed:", error);
      updateAccount(null);
    }
  }

  const ready = initialize();

  tabs.login.addEventListener("click", () => setMode("login"));
  tabs.signup.addEventListener("click", () => setMode("signup"));
  document.querySelector("#auth-guest").addEventListener("click", close);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!authAvailable) {
      setMessage(text("auth_unavailable"));
      return;
    }
    const rawIdentity = identity.value.trim();
    const rawPassword = password.value;
    if (!rawIdentity || !rawPassword) return;
    if (mode === "signup" && rawPassword.length < 6) {
      setMessage(text("auth_weak_password"));
      password.focus();
      return;
    }

    submit.disabled = true;
    setMessage("");
    try {
      const email = normalizeIdentity(rawIdentity);
      const result = mode === "signup"
        ? await client.auth.signUp({
          email,
          password: rawPassword,
          options: rawIdentity.includes("@") ? undefined : { data: { username: email.split("@")[0] } },
        })
        : await client.auth.signInWithPassword({ email, password: rawPassword });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setMode("login");
        setMessage(text("auth_signup_success"));
        password.value = "";
      } else {
        session = result.data.session;
        currentUser = session?.user || result.data.user || null;
        updateAccount(currentUser);
        emit();
      }
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      submit.disabled = false;
    }
  });

  document.addEventListener("keydown", event => {
    if (screen.hidden) return;
    if (event.key === "Escape" && !authRequired) {
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...screen.querySelectorAll("button:not([disabled]), input:not([disabled])")];
    if (!controls.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.Auth = {
    ready,
    open,
    close,
    isRequired: () => authRequired,
    isAvailable: () => authAvailable,
    client: () => client,
    getToken: async () => {
      await ready;
      if (!client) return null;
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      session = data.session;
      currentUser = session?.user || null;
      return session?.access_token || null;
    },
    user: () => currentUser,
    onChange: listener => {
      listeners.add(listener);
      listener(currentUser);
      return () => listeners.delete(listener);
    },
    signOut: async () => {
      await ready;
      if (!client) return;
      await window.Sync.flush();
      const { error } = await client.auth.signOut();
      if (error) throw error;
      session = null;
      currentUser = null;
      updateAccount(null);
      emit();
    },
    languageChanged: () => {
      if (!screen.hidden) setMode(mode);
      updateAccount(currentUser);
    },
  };
})();
