/*
 * Frontend helpers for the Cloudflare Pages DokuWiki port.
 *
 * This is a small native replacement for the default template/editor
 * JavaScript paths that cannot run directly in Workers.
 */
/* global document, Event, fetch, FormData, window */
(function () {
  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
      return;
    }

    callback();
  }

  function bindMobileTools() {
    document.querySelectorAll(".mobileTools select").forEach(function (select) {
      select.addEventListener("change", function () {
        if (select.value) {
          window.location.href = select.value;
        }
      });
    });
  }

  function selectedText(textarea, fallback) {
    return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd) || fallback;
  }

  function replaceSelection(textarea, replacement, cursorOffset) {
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var before = textarea.value.slice(0, start);
    var after = textarea.value.slice(end);

    textarea.value = before + replacement + after;
    textarea.focus();

    var cursor = start + (cursorOffset == null ? replacement.length : cursorOffset);
    textarea.setSelectionRange(cursor, cursor);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function wrapSelection(textarea, button) {
    var before = button.dataset.wrapBefore || "";
    var after = button.dataset.wrapAfter || "";
    var placeholder = button.dataset.placeholder || "";
    var text = selectedText(textarea, placeholder);
    var replacement = before + text + after;

    replaceSelection(textarea, replacement, before.length + text.length);
  }

  function wrapLine(textarea, button) {
    var lineBefore = button.dataset.lineBefore || "";
    var lineAfter = button.dataset.lineAfter || "";
    var placeholder = button.dataset.placeholder || "";
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var value = textarea.value;
    var lineStart = value.lastIndexOf("\n", start - 1) + 1;
    var lineEnd = value.indexOf("\n", end);

    if (lineEnd === -1) {
      lineEnd = value.length;
    }

    var text = value.slice(lineStart, lineEnd) || placeholder;
    var replacement = lineBefore + text.replace(/^=+\s*|\s*=+$/g, "") + lineAfter;

    textarea.value = value.slice(0, lineStart) + replacement + value.slice(lineEnd);
    textarea.focus();
    textarea.setSelectionRange(
      lineStart + lineBefore.length,
      lineStart + replacement.length - lineAfter.length
    );
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function prefixSelection(textarea, button) {
    var prefix = button.dataset.prefix || "";
    var placeholder = button.dataset.placeholder || "";
    var text = selectedText(textarea, placeholder);
    var replacement = text
      .split("\n")
      .map(function (line) {
        return line ? prefix + line : prefix.trimEnd();
      })
      .join("\n");

    replaceSelection(textarea, replacement);
  }

  function bindToolbar(form, textarea) {
    form.querySelectorAll("#tool__bar button").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.lineBefore || button.dataset.lineAfter) {
          wrapLine(textarea, button);
          return;
        }

        if (button.dataset.prefix) {
          prefixSelection(textarea, button);
          return;
        }

        wrapSelection(textarea, button);
      });
    });
  }

  function setStatus(status, text) {
    if (status) {
      status.textContent = text;
    }
  }

  async function renderPreview(textarea, preview, status) {
    var url = textarea.dataset.previewUrl;
    var form = textarea.form;
    var id = form ? form.querySelector('input[name="id"]') : null;
    var formData = new FormData();

    if (id) {
      formData.set("id", id.value);
    }

    formData.set("content", textarea.value);

    setStatus(status, "Rendering preview...");

    var response = await fetch(url, {
      method: "POST",
      body: formData,
      headers: {
        accept: "application/json",
        "x-requested-with": "XMLHttpRequest"
      }
    });

    if (!response.ok) {
      throw new Error("Preview failed.");
    }

    var rendered = await response.json();
    preview.hidden = false;
    preview.innerHTML = '<h2>Preview</h2><div class="pad group">' + rendered.html + "</div>";
    setStatus(status, "Preview updated.");
  }

  function bindPreview(form, textarea, status) {
    var button = form.querySelector("#edbtn__preview");
    var preview = form.querySelector("#wiki__preview");

    if (!button || !preview || !textarea.dataset.previewUrl) {
      return;
    }

    button.addEventListener("click", function () {
      button.disabled = true;

      renderPreview(textarea, preview, status)
        .catch(function () {
          setStatus(status, "Preview failed.");
        })
        .finally(function () {
          button.disabled = false;
        });
    });
  }

  async function saveDraft(form, textarea, status, lastSaved) {
    var url = textarea.dataset.draftUrl;
    var id = form.querySelector('input[name="id"]');
    var baseRevisionId = form.querySelector('input[name="baseRevisionId"]');
    var formData = new FormData();

    formData.set("id", id ? id.value : "");
    formData.set("baseRevisionId", baseRevisionId ? baseRevisionId.value : "");
    formData.set("content", textarea.value);

    setStatus(status, "Saving draft...");

    var response = await fetch(url, {
      method: "POST",
      body: formData,
      headers: {
        accept: "application/json",
        "x-requested-with": "XMLHttpRequest"
      }
    });

    if (!response.ok) {
      throw new Error("Draft save failed.");
    }

    lastSaved.value = textarea.value;
    setStatus(status, "Draft saved.");
  }

  function bindDraftAutosave(form, textarea, status) {
    if (!textarea.dataset.draftUrl) {
      return;
    }

    var lastSaved = { value: textarea.value };
    var timer = 0;
    var delay = Number(textarea.dataset.autosaveDelay || 15000);

    textarea.addEventListener("input", function () {
      if (textarea.value === lastSaved.value) {
        return;
      }

      setStatus(status, "Unsaved changes.");
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        saveDraft(form, textarea, status, lastSaved).catch(function () {
          setStatus(status, "Draft autosave failed.");
        });
      }, delay);
    });
  }

  function bindEditor() {
    var form = document.querySelector("#dw__editform");

    if (!form) {
      return;
    }

    var textarea = form.querySelector("textarea.edit");
    var status = form.querySelector("#draft__status");

    if (!textarea) {
      return;
    }

    bindToolbar(form, textarea);
    bindPreview(form, textarea, status);
    bindDraftAutosave(form, textarea, status);
  }

  ready(function () {
    bindMobileTools();
    bindEditor();
  });
})();
