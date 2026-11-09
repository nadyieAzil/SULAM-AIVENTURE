// Keep local progress authoritative while synchronizing signed-in users.
//
// localStorage keys:
//   mathmentor_owner        user id whose progress is currently in localStorage (absent = guest)
//   mathmentor_needs_sync   "1" when the owner's local progress has changes not yet in the cloud
//   mathmentor_unsynced_<id> unsynced progress stashed at logout, restored on that user's next login
(function () {
  const NEEDS_SYNC_KEY = "mathmentor_needs_sync";
  const OWNER_KEY = "mathmentor_owner";
  const STASH_PREFIX = "mathmentor_unsynced_";
  let getState = null;
  let applyState = null;
  let resetState = null;
  let activeUserId = null;
  let generation = 0;
  let timer = null;
  let inFlight = null;
  let saveAgain = false;
  let loaded = false;   // initial cloud load + merge finished for activeUserId
  let loading = null;   // promise of the running loadUser

  function language() {
    return document.documentElement.lang === "en" ? "en" : "ms";
  }

  function setStatus(state) {
    const indicator = document.querySelector("#sync-status");
    if (!indicator) return;
    indicator.dataset.state = state;
    indicator.textContent = T[language()][`sync_${state}`];
  }

  function hasProgress(state) {
    return Number(state?.xp) > 0
      || Number(state?.correct) > 0
      || Object.keys(state?.topics || {}).length > 0
      || (state?.badges || []).length > 0;
  }

  function isState(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
  }

  function readStash(userId) {
    try {
      const value = JSON.parse(localStorage.getItem(STASH_PREFIX + userId) || "null");
      return isState(value) ? value : null;
    } catch {
      return null;
    }
  }

  function markNeedsSync() {
    localStorage.setItem(NEEDS_SYNC_KEY, "1");
    setStatus("offline");
  }

  function clearNeedsSync() {
    localStorage.removeItem(NEEDS_SYNC_KEY);
    setStatus("saved");
  }

  async function writeState(userId, state) {
    const supabase = Auth.client();
    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      state,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  // Decide which progress the account should keep (TEAMPLAN 3.4 merge rules).
  function chooseState(user, local, cloud) {
    const owner = localStorage.getItem(OWNER_KEY);
    const stash = readStash(user.id);
    // This user's own progress with changes the cloud hasn't seen yet.
    let own = null;
    if (stash) own = stash;
    else if (owner === user.id && localStorage.getItem(NEEDS_SYNC_KEY)) own = local;
    const account = own || (isState(cloud) ? cloud : null);
    // Only a guest's local progress is offered for merging; another user's leftovers are ignored.
    const guest = !owner && hasProgress(local) ? local : null;

    if (guest && account && hasProgress(account)) {
      const guestXp = Number(guest.xp) || 0, accountXp = Number(account.xp) || 0;
      const keepGuest = guestXp >= accountXp
        ? confirm(T[language()].sync_conflict(guestXp, accountXp))
        : !confirm(T[language()].sync_conflict_cloud(guestXp, accountXp));
      return keepGuest ? guest : account;
    }
    if (guest) return guest;          // rule 1: guest progress becomes the account's
    if (account) return account;      // rule 2: take the account's progress
    return owner && owner !== user.id ? null : local; // empty account: upload this device's settings
  }

  async function loadUser(user, expectedGeneration) {
    if (!getState || !applyState) return;
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    setStatus("syncing");
    try {
      const { data, error } = await Auth.client()
        .from("profiles")
        .select("state, updated_at")
        .eq("id", user.id)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      if (expectedGeneration !== generation || Auth.user()?.id !== user.id) return;

      const local = getState();
      const cloud = isState(data?.state) ? data.state : null;
      const chosen = chooseState(user, local, cloud);
      if (chosen && chosen !== local) applyState(chosen);
      if (!chosen && localStorage.getItem(OWNER_KEY) && localStorage.getItem(OWNER_KEY) !== user.id) resetState();
      if (chosen !== cloud) await writeState(user.id, getState());
      if (expectedGeneration !== generation) return;

      localStorage.setItem(OWNER_KEY, user.id);
      localStorage.removeItem(STASH_PREFIX + user.id);
      loaded = true;
      clearNeedsSync();
    } catch (error) {
      if (expectedGeneration !== generation) return;
      console.error("Progress sync failed:", error);
      setStatus("offline");
    }
  }

  function ensureLoaded() {
    const user = Auth.user();
    if (!user || loaded || loading || !navigator.onLine) return loading;
    const requestGeneration = generation;
    loading = loadUser(user, requestGeneration).finally(() => { loading = null; });
    return loading;
  }

  function schedule(delay = 2000) {
    if (!Auth.user()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
  }

  async function flush() {
    const user = Auth.user();
    if (!user || !getState) return;
    clearTimeout(timer);
    timer = null;
    if (!loaded) {
      // Never upload before the merge has run; remember own edits so the merge keeps them.
      if (localStorage.getItem(OWNER_KEY) === user.id) localStorage.setItem(NEEDS_SYNC_KEY, "1");
      if (!navigator.onLine) setStatus("offline");
      return ensureLoaded();
    }
    if (!navigator.onLine) {
      markNeedsSync();
      return;
    }
    if (inFlight) {
      saveAgain = true;
      return inFlight;
    }
    const state = getState();
    setStatus("syncing");
    inFlight = (async () => {
      try {
        await writeState(user.id, state);
        clearNeedsSync();
      } catch (error) {
        console.error("Progress save failed:", error);
        markNeedsSync();
      } finally {
        inFlight = null;
        if (saveAgain) {
          saveAgain = false;
          schedule(0);
        }
      }
    })();
    return inFlight;
  }

  function signedOut(previousUserId) {
    // Keep unsynced progress for that user, then clear the device for the next person.
    if (localStorage.getItem(NEEDS_SYNC_KEY) && localStorage.getItem(OWNER_KEY) === previousUserId) {
      localStorage.setItem(STASH_PREFIX + previousUserId, JSON.stringify(getState()));
    }
    localStorage.removeItem(NEEDS_SYNC_KEY);
    localStorage.removeItem(OWNER_KEY);
    resetState();
  }

  async function handleUser(user) {
    if (!getState || !applyState) return;
    const nextId = user?.id || null;
    if (nextId === activeUserId) return;
    const previousId = activeUserId;
    activeUserId = nextId;
    generation++;
    loaded = false;
    loading = null;
    clearTimeout(timer);
    if (previousId) signedOut(previousId); // also covers switching straight to another account
    if (user) {
      await ensureLoaded();
      if (!loaded && !navigator.onLine) setStatus("offline");
    } else {
      setStatus("saved");
    }
  }

  window.addEventListener("mathmentor:authchange", event => {
    void handleUser(event.detail.user);
  });
  window.addEventListener("online", () => {
    if (!Auth.user()) setStatus("saved");
    else if (!loaded) void ensureLoaded();
    else if (localStorage.getItem(NEEDS_SYNC_KEY)) schedule(0);
  });
  window.addEventListener("offline", () => setStatus("offline"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
  window.addEventListener("beforeunload", () => {
    if (Auth.user()) void flush();
  });

  window.Sync = {
    attach(stateAccessors) {
      getState = stateAccessors.getState;
      applyState = stateAccessors.applyState;
      resetState = stateAccessors.resetState;
      void handleUser(Auth.user());
    },
    schedule,
    flush,
    languageChanged: () => setStatus(document.querySelector("#sync-status")?.dataset.state || "saved"),
  };
})();
