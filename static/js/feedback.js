(function () {
  const form = document.querySelector("#feedback-form");
  const account = document.querySelector("#feedback-account");
  const issueType = document.querySelector("#feedback-issue-type");
  const description = document.querySelector("#feedback-description");
  const attachment = document.querySelector("#feedback-attachment");
  const submit = document.querySelector("#feedback-submit");
  const status = document.querySelector("#feedback-status");

  function text(key) {
    return T[document.documentElement.lang === "en" ? "en" : "ms"][key];
  }

  function updateAccount(user) {
    const email = user?.email || "";
    account.value = email && !email.toLowerCase().endsWith("@mathmentor.student")
      ? email
      : "";
  }

  function setStatus(message, state = "") {
    status.textContent = message;
    status.dataset.state = state;
  }

  Auth.onChange(updateAccount);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!account.value.trim()) {
      account.setCustomValidity(text("feedback_email_required"));
      account.reportValidity();
      account.setCustomValidity("");
      return;
    }
    if (!description.value.trim()) {
      description.setCustomValidity(text("feedback_description_required"));
      description.reportValidity();
      description.setCustomValidity("");
      return;
    }

    submit.disabled = true;
    setStatus(text("feedback_sending"));
    try {
      const token = await Auth.getToken();
      const body = new FormData();
      body.append("account", account.value.trim());
      body.append("issue_type", issueType.value);
      body.append("description", description.value.trim());
      if (attachment.files[0]) body.append("attachment", attachment.files[0]);
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
      if (!response.ok) {
        let detail = "";
        try {
          detail = (await response.json()).detail || "";
        } catch (error) {
          console.error("Could not read feedback response:", error);
        }
        const messages = {
          401: text("feedback_login"),
          413: text("feedback_attachment_too_large"),
          503: detail === "Feedback email is not configured."
            ? text("feedback_unavailable")
            : text("feedback_failed"),
        };
        throw new Error(messages[response.status] || detail || text("feedback_failed"));
      }
      form.reset();
      updateAccount(Auth.user());
      setStatus(text("feedback_sent"), "success");
    } catch (error) {
      console.error("Feedback submission failed:", error);
      setStatus(error.message || text("feedback_failed"), "error");
    } finally {
      submit.disabled = false;
    }
  });
})();
