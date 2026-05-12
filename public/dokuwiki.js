/*
 * Frontend helpers for the Cloudflare Pages DokuWiki port.
 *
 * This is a small native replacement for the default template/editor
 * JavaScript paths that cannot run directly in Workers.
 */
/* global AbortController, document, Event, fetch, FormData, navigator, window, XMLHttpRequest */
(function () {
  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
      return;
    }

    callback();
  }

  var isMac = navigator.platform && /mac/i.test(navigator.platform);
  var DOKU_PREFS_COOKIE = "DOKU_PREFS";
  var DokuCookie = {
    data: null,
    getValue: function (key, fallback) {
      this.init();
      return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : fallback;
    },
    setValue: function (key, value) {
      this.init();
      if (value === false || value == null) {
        delete this.data[key];
      } else {
        this.data[key] = String(value);
      }
      writeCookie(DOKU_PREFS_COOKIE, encodeCookieData(this.data), 365);
    },
    init: function () {
      if (this.data) {
        return;
      }
      this.data = decodeCookieData(readCookie(DOKU_PREFS_COOKIE));
    }
  };

  window.DokuCookie = DokuCookie;
  window.DOKU_BASE = window.DOKU_BASE || "/";

  function readCookie(name) {
    var prefix = name + "=";
    var cookie = document.cookie
      .split(";")
      .map(function (part) {
        return part.trim();
      })
      .find(function (part) {
        return part.indexOf(prefix) === 0;
      });

    return cookie ? cookie.slice(prefix.length) : "";
  }

  function writeCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    var secure = window.location.protocol === "https:" ? "; Secure" : "";
    var cookiePath = (window.DOKU_COOKIE_PARAM && window.DOKU_COOKIE_PARAM.path) || "/";
    document.cookie =
      name +
      "=" +
      value +
      "; expires=" +
      expires +
      "; path=" +
      cookiePath +
      "; SameSite=Lax" +
      secure;
  }

  function decodeCookieData(value) {
    var data = {};
    var parts = value ? value.split("#") : [];

    for (var index = 0; index + 1 < parts.length; index += 2) {
      data[decodeURIComponent(parts[index])] = decodeURIComponent(parts[index + 1]);
    }

    return data;
  }

  function encodeCookieData(data) {
    return Object.keys(data)
      .map(function (key) {
        return encodeURIComponent(key) + "#" + encodeURIComponent(data[key]);
      })
      .join("#");
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

  function bindHotkeys() {
    var shortcuts = [];

    document.querySelectorAll("a[accesskey], button[accesskey]").forEach(function (element) {
      var key = element.getAttribute("accesskey");

      if (!key) {
        return;
      }

      shortcuts.push({ key: key.toLowerCase(), element: element });
    });

    if (!shortcuts.length) {
      return;
    }

    document.addEventListener("keydown", function (event) {
      var modifier = isMac ? event.ctrlKey && event.altKey : event.altKey;

      if (!modifier || event.shiftKey || event.metaKey || event.key.length !== 1) {
        return;
      }

      var shortcut = shortcuts.find(function (entry) {
        return entry.key === event.key.toLowerCase();
      });

      if (!shortcut) {
        return;
      }

      event.preventDefault();
      if (shortcut.element.tagName.toLowerCase() === "a") {
        window.location.href = shortcut.element.href;
      } else {
        shortcut.element.click();
      }
    });
  }

  function selectedText(textarea, fallback) {
    return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd) || fallback;
  }

  function currentSelection(textarea) {
    textarea.focus();
    return {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      scroll: textarea.scrollTop
    };
  }

  function pasteText(textarea, selection, replacement, options) {
    var opts = options || {};

    textarea.value =
      textarea.value.slice(0, selection.start) + replacement + textarea.value.slice(selection.end);

    selection.end = selection.start + replacement.length;
    if (opts.startofs) selection.start += opts.startofs;
    if (opts.endofs) selection.end -= opts.endofs;
    if (opts.nosel) selection.start = selection.end;

    textarea.focus();
    textarea.setSelectionRange(selection.start, selection.end);
    textarea.scrollTop = selection.scroll;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function replaceSelection(textarea, replacement, cursorOffset) {
    var selection = currentSelection(textarea);
    var cursor = cursorOffset == null ? replacement.length : cursorOffset;
    pasteText(textarea, selection, replacement, {
      startofs: cursor,
      endofs: replacement.length - cursor
    });
  }

  function fixToolbarText(value) {
    return String(value || "").replace(/\\n/g, "\n");
  }

  function insertTags(textarea, open, close, sample) {
    var selection = currentSelection(textarea);
    var text = textarea.value.slice(selection.start, selection.end);
    var options;

    if (text.charAt(text.length - 1) === " ") {
      selection.end -= 1;
      text = textarea.value.slice(selection.start, selection.end);
    }

    if (!text) {
      text = sample;
      options = {
        startofs: open.length,
        endofs: close.length
      };
    } else {
      options = { nosel: true };
    }

    pasteText(textarea, selection, open + text + close, options);
    pickerClose();
  }

  function formatSelection(textarea, button) {
    insertTags(
      textarea,
      fixToolbarText(button.dataset.open || button.dataset.wrapBefore || ""),
      fixToolbarText(button.dataset.close || button.dataset.wrapAfter || ""),
      fixToolbarText(button.dataset.sample || button.dataset.placeholder || button.title)
    );
  }

  function formatLines(textarea, button) {
    var selection = currentSelection(textarea);
    var open = fixToolbarText(button.dataset.open || button.dataset.prefix || "");
    var close = fixToolbarText(button.dataset.close || "");
    var sample = fixToolbarText(
      button.dataset.sample || button.dataset.placeholder || button.title
    );
    var text = textarea.value.slice(selection.start, selection.end);
    var options;

    if (text) {
      sample = text;
      options = { nosel: true };
    } else {
      options = {
        startofs: open.length,
        endofs: close.length
      };
    }

    pasteText(
      textarea,
      selection,
      open + sample.split("\n").join(close + "\n" + open) + close,
      options
    );
    pickerClose();
  }

  function currentHeadlineLevel(textarea) {
    var form = textarea.form;
    var prefix = form ? form.querySelector('input[name="prefix"]') : null;
    var candidates = [textarea.value.slice(0, textarea.selectionStart)];

    if (prefix) {
      candidates.push(prefix.value);
    }

    for (var index = 0; index < candidates.length; index += 1) {
      var before = "\n" + candidates[index];
      var offset = before.lastIndexOf("\n==");
      if (offset === -1) {
        continue;
      }

      var match = before.slice(offset + 1, offset + 7).match(/^={2,6}/);
      if (match) {
        return 7 - match[0].length;
      }
    }

    return 0;
  }

  function autoHeadline(textarea, button) {
    var level = currentHeadlineLevel(textarea) + Number(button.dataset.mod || 0);
    if (level < 1) level = 1;
    if (level > 5) level = 5;

    var tags = "=".repeat(7 - level);
    insertTags(textarea, tags + " ", " " + tags + "\n", button.dataset.sample || "Headline");
  }

  function pickerClose(except) {
    document.querySelectorAll(".picker").forEach(function (picker) {
      if (except && picker === except) {
        return;
      }

      picker.classList.add("a11y");
      picker.setAttribute("aria-hidden", "true");
    });
  }

  function pickerToggle(pickerId, button) {
    var picker = document.querySelector("#" + pickerId);

    if (!picker) {
      return;
    }

    var open = picker.classList.contains("a11y") || picker.getAttribute("aria-hidden") !== "false";
    pickerClose(picker);

    if (!open) {
      picker.classList.add("a11y");
      picker.setAttribute("aria-hidden", "true");
      return;
    }

    var position = button.getBoundingClientRect();
    var pickerWidth = Math.min(picker.offsetWidth || 300, 300);
    var left = position.left + window.scrollX + 3;
    var maxLeft = window.scrollX + window.innerWidth - pickerWidth - 40;

    if (left > maxLeft) left = maxLeft;
    if (left < window.scrollX) left = window.scrollX;

    picker.classList.remove("a11y");
    picker.setAttribute("aria-hidden", "false");
    picker.style.left = left + "px";
    picker.style.top = position.top + window.scrollY + button.offsetHeight + 3 + "px";
    picker.style.maxWidth = "300px";
  }

  function insertText(textarea, button) {
    replaceSelection(textarea, fixToolbarText(button.dataset.insert || ""));
    pickerClose();
  }

  function bindToolbar(form, textarea) {
    form.addEventListener("click", function (event) {
      var button = event.target.closest ? event.target.closest("button") : null;

      if (!button || !form.contains(button)) {
        return;
      }

      if (button.dataset.pickerTarget) {
        event.preventDefault();
        pickerToggle(button.dataset.pickerTarget, button);
        return;
      }

      if (button.dataset.pickerInsert != null) {
        event.preventDefault();
        replaceSelection(textarea, fixToolbarText(button.dataset.pickerInsert));
        pickerClose();
        return;
      }

      if (button.dataset.linkWizard != null) {
        event.preventDefault();
        openLinkWizard(textarea);
        return;
      }

      if (button.dataset.mediaPopup != null) {
        event.preventDefault();
        openMediaPopup(form);
        return;
      }

      if (!button.dataset.toolbarAction && !button.dataset.wrapBefore && !button.dataset.prefix) {
        return;
      }

      event.preventDefault();
      switch (button.dataset.toolbarAction) {
        case "insert":
          insertText(textarea, button);
          break;
        case "formatln":
          formatLines(textarea, button);
          break;
        case "autohead":
          autoHeadline(textarea, button);
          break;
        case "format":
        default:
          formatSelection(textarea, button);
          break;
      }
    });
  }

  function currentNamespace(form) {
    var id = form.querySelector('input[name="id"]');
    var value = id ? id.value : "";
    var separator = value.lastIndexOf(":");

    return separator > 0 ? value.slice(0, separator) : "";
  }

  function openMediaPopup(form) {
    var namespace = currentNamespace(form);
    var url = "/media-manager";

    if (namespace) {
      url += "?ns=" + encodeURIComponent(namespace);
    }

    window.open(url, "dokuwiki__media", "width=980,height=700,resizable=yes,scrollbars=yes");
  }

  function bindMediaInsertion(textarea) {
    window.addEventListener("message", function (event) {
      var data = event.data || {};

      if (event.origin !== window.location.origin || data.type !== "dokuwiki-media-select") {
        return;
      }

      replaceSelection(textarea, "{{" + data.id + "|" + (data.title || data.id) + "}}");
    });
  }

  function bindEditorSizeControls(textarea) {
    var controls = document.querySelector("#size__ctl");

    if (!controls) {
      return;
    }

    var savedHeight = DokuCookie.getValue("sizeCtl");
    var savedWrap = DokuCookie.getValue("wrapCtl");

    if (savedHeight) {
      textarea.style.height = savedHeight;
    }

    if (savedWrap) {
      textarea.setAttribute("wrap", savedWrap);
    }

    [
      ["Larger", 100],
      ["Smaller", -100],
      ["Wrap", 0]
    ].forEach(function (control) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = control[0];
      button.addEventListener("click", function () {
        if (control[1] === 0) {
          var nextWrap =
            (textarea.getAttribute("wrap") || "soft").toLowerCase() === "off" ? "soft" : "off";
          textarea.setAttribute("wrap", nextWrap);
          DokuCookie.setValue("wrapCtl", nextWrap);
          return;
        }

        textarea.style.height = Math.max(120, textarea.offsetHeight + control[1]) + "px";
        DokuCookie.setValue("sizeCtl", textarea.style.height);
      });
      controls.appendChild(button);
    });
  }

  function bindEditorKeyHelpers(form, textarea) {
    textarea.addEventListener("keydown", function (event) {
      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;
      var before = textarea.value.slice(0, start);
      var lineStart = before.lastIndexOf("\n") + 1;
      var line = before.slice(lineStart);
      var listMatch = line.match(/^(\s{2,}(?:[*-]\s?)?)/);

      if ((event.key === "Enter" || event.key === "NumpadEnter") && event.ctrlKey) {
        var save =
          form.querySelector("#edbtn__save") || form.querySelector('button[type="submit"]');
        if (save) {
          event.preventDefault();
          save.click();
        }
        return;
      }

      if (start !== end || !listMatch) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (/^\s{2,}[*-]\s*$/.test(line)) {
          textarea.value = textarea.value.slice(0, lineStart) + textarea.value.slice(start);
          textarea.setSelectionRange(lineStart, lineStart);
        } else {
          replaceSelection(textarea, "\n" + listMatch[1]);
        }
        return;
      }

      if (event.key === "Backspace" && /\s{2,}[*-]\s?$/.test(line)) {
        event.preventDefault();
        var deleteStart = Math.max(lineStart, start - 2);
        textarea.value = textarea.value.slice(0, deleteStart) + textarea.value.slice(start);
        textarea.setSelectionRange(deleteStart, deleteStart);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }

      if (event.key === " " && /\s{2,}[*-]\s$/.test(line)) {
        event.preventDefault();
        replaceSelection(textarea, "  ");
      }
    });
  }

  function bindUnsavedWarning(form, textarea) {
    var original = textarea.value;
    var dirty = false;

    textarea.addEventListener("input", function () {
      dirty = textarea.value !== original;
    });

    form.addEventListener("submit", function () {
      dirty = false;
    });

    window.addEventListener("beforeunload", function (event) {
      if (!dirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "Unsaved changes will be lost.";
    });
  }

  var linkWizardState = {
    textarea: null,
    selected: -1,
    timer: 0
  };

  function linkWizardElement() {
    var wizard = document.querySelector("#link__wiz");

    if (wizard) {
      return wizard;
    }

    wizard = document.createElement("div");
    wizard.id = "link__wiz";
    wizard.className = "JSpopup";
    wizard.setAttribute("role", "dialog");
    wizard.setAttribute("aria-label", "Link wizard");
    wizard.hidden = true;
    wizard.innerHTML =
      '<button type="button" id="link__wiz_close">Close</button>' +
      '<label for="link__wiz_entry">Link to</label> ' +
      '<input type="text" class="edit" id="link__wiz_entry" autocomplete="off">' +
      '<div id="link__wiz_result" role="listbox"></div>';
    document.body.appendChild(wizard);
    wizard.querySelector("#link__wiz_close").addEventListener("click", closeLinkWizard);
    wizard.querySelector("#link__wiz_entry").addEventListener("keydown", linkWizardKeydown);
    wizard.querySelector("#link__wiz_entry").addEventListener("input", scheduleLinkWizardSearch);
    wizard.querySelector("#link__wiz_result").addEventListener("click", linkWizardClick);

    return wizard;
  }

  function openLinkWizard(textarea) {
    var wizard = linkWizardElement();
    var entry = wizard.querySelector("#link__wiz_entry");
    var form = textarea.form;
    var namespace = form ? currentNamespace(form) : "";
    var selected = selectedText(textarea, "");

    linkWizardState.textarea = textarea;
    linkWizardState.selected = -1;
    linkWizardState.selectionText = selected;
    entry.value = selected || (namespace ? namespace + ":" : "");
    wizard.hidden = false;
    entry.focus();
    runLinkWizardSearch();
  }

  function closeLinkWizard() {
    var wizard = document.querySelector("#link__wiz");
    if (wizard) {
      wizard.hidden = true;
    }
  }

  function scheduleLinkWizardSearch() {
    window.clearTimeout(linkWizardState.timer);
    linkWizardState.timer = window.setTimeout(runLinkWizardSearch, 250);
  }

  async function runLinkWizardSearch() {
    var wizard = linkWizardElement();
    var entry = wizard.querySelector("#link__wiz_entry");
    var result = wizard.querySelector("#link__wiz_result");
    var response = await fetch(
      "/lib/exe/ajax.php?call=linkwiz&q=" + encodeURIComponent(entry.value),
      { headers: { "x-requested-with": "XMLHttpRequest" } }
    );

    if (!response.ok) {
      result.textContent = "Search failed.";
      return;
    }

    result.innerHTML = await response.text();
    linkWizardState.selected = -1;
  }

  function linkWizardKeydown(event) {
    var result = document.querySelector("#link__wiz_result");
    var items = result ? Array.from(result.querySelectorAll("div")) : [];

    if (event.key === "Escape") {
      event.preventDefault();
      closeLinkWizard();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      linkWizardState.selected += event.key === "ArrowDown" ? 1 : -1;
      if (linkWizardState.selected < 0) linkWizardState.selected = items.length - 1;
      if (linkWizardState.selected >= items.length) linkWizardState.selected = 0;
      items.forEach(function (item, index) {
        item.classList.toggle("selected", index === linkWizardState.selected);
      });
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (items[linkWizardState.selected]) {
        insertLinkFromAnchor(items[linkWizardState.selected].querySelector("a"));
      } else {
        insertLink(document.querySelector("#link__wiz_entry").value, "");
      }
    }
  }

  function linkWizardClick(event) {
    var anchor = event.target.closest("a");

    if (!anchor) {
      return;
    }

    event.preventDefault();
    insertLinkFromAnchor(anchor);
  }

  function insertLinkFromAnchor(anchor) {
    var id = anchor.getAttribute("title") || anchor.textContent.trim();
    var title = anchor.parentElement.querySelector("span");

    if (id.endsWith(":")) {
      document.querySelector("#link__wiz_entry").value = id;
      runLinkWizardSearch();
      return;
    }

    insertLink(id, title ? title.textContent.trim() : "");
  }

  function insertLink(id, title) {
    var textarea = linkWizardState.textarea;
    var label = linkWizardState.selectionText || title;
    var syntax = label && label !== id ? "[[" + id + "|" + label + "]]" : "[[" + id + "]]";

    if (textarea && id) {
      replaceSelection(textarea, syntax);
    }

    closeLinkWizard();
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
    var lockToken = form.querySelector('input[name="lockToken"]');
    var sectok = form.querySelector('input[name="sectok"]');
    var formData = new FormData();

    formData.set("id", id ? id.value : "");
    formData.set("baseRevisionId", baseRevisionId ? baseRevisionId.value : "");
    formData.set("content", textarea.value);

    if (lockToken) {
      formData.set("lockToken", lockToken.value);
    }

    if (sectok) {
      formData.set("sectok", sectok.value);
    }

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

    var saved = await response.json();
    lastSaved.value = textarea.value;
    setStatus(status, saved.draft || "Draft saved.");
  }

  function bindDraftAutosave(form, textarea, status) {
    if (!textarea.dataset.draftUrl) {
      return;
    }

    var lastSaved = { value: textarea.value };
    var timer = 0;
    var lastAttempt = Date.now();
    var interval = Number(textarea.dataset.draftRefreshInterval || 30000);

    function scheduleSave() {
      var elapsed = Date.now() - lastAttempt;
      var wait = Math.max(0, interval - elapsed);

      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        if (textarea.value === lastSaved.value) {
          return;
        }

        lastAttempt = Date.now();
        saveDraft(form, textarea, status, lastSaved).catch(function () {
          setStatus(status, "Draft autosave failed.");
        });
      }, wait);
    }

    textarea.addEventListener("input", function () {
      if (textarea.value === lastSaved.value) {
        return;
      }

      setStatus(status, "Unsaved changes.");
      scheduleSave();
    });
  }

  function pageLockFormData(form) {
    var id = form.querySelector('input[name="id"]');
    var lockToken = form.querySelector('input[name="lockToken"]');
    var sectok = form.querySelector('input[name="sectok"]');
    var formData = new FormData();

    formData.set("id", id ? id.value : "");
    formData.set("lockToken", lockToken ? lockToken.value : "");
    formData.set("sectok", sectok ? sectok.value : "");

    return formData;
  }

  async function refreshPageLock(form, status) {
    var url = form.dataset.lockUrl;

    if (!url) {
      return;
    }

    var response = await fetch(url, {
      method: "POST",
      body: pageLockFormData(form),
      headers: {
        accept: "application/json",
        "x-requested-with": "XMLHttpRequest"
      }
    });

    if (!response.ok) {
      throw new Error("Page lock refresh failed.");
    }

    setStatus(status, "Page lock refreshed.");
  }

  function bindPageLock(form, status) {
    var token = form.querySelector('input[name="lockToken"]');

    if (!token || !token.value || !form.dataset.lockUrl) {
      return;
    }

    var submitting = false;
    var warningTimer = 0;
    var warningDelay = Number(form.dataset.lockWarningDelay || 0);

    function resetWarningTimer() {
      if (!warningDelay) {
        return;
      }

      window.clearTimeout(warningTimer);
      warningTimer = window.setTimeout(function () {
        setStatus(status, "This page lock is close to expiring.");
      }, warningDelay);
    }

    form.addEventListener("submit", function () {
      submitting = true;
    });

    var refreshDelay = Number(form.dataset.lockRefreshDelay || 0);

    if (refreshDelay > 0) {
      window.setInterval(function () {
        refreshPageLock(form, status)
          .then(resetWarningTimer)
          .catch(function () {
            setStatus(status, "Page lock refresh failed.");
          });
      }, refreshDelay);
    }

    resetWarningTimer();

    window.addEventListener("pagehide", function () {
      if (submitting || !form.dataset.lockReleaseUrl || !navigator.sendBeacon) {
        return;
      }

      navigator.sendBeacon(form.dataset.lockReleaseUrl, pageLockFormData(form));
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
    bindMediaInsertion(textarea);
    bindEditorSizeControls(textarea);
    bindEditorKeyHelpers(form, textarea);
    bindUnsavedWarning(form, textarea);
    bindPreview(form, textarea, status);
    bindDraftAutosave(form, textarea, status);
    bindPageLock(form, status);
  }

  function bindQuickSearch() {
    var input = document.querySelector("#qsearch__in");
    var output = document.querySelector("#qsearch__out");
    var timer = 0;
    var controller = null;

    if (!input || !output) {
      return;
    }

    function clear() {
      output.hidden = true;
      output.innerHTML = "";
      input.closest("form").classList.remove("searching");
    }

    input.addEventListener("input", function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(async function () {
        var value = input.value.trim();

        if (controller) {
          controller.abort();
        }

        if (!value) {
          clear();
          return;
        }

        controller = new AbortController();
        input.closest("form").classList.add("searching");

        try {
          var response = await fetch(
            "/lib/exe/ajax.php?call=qsearch&q=" + encodeURIComponent(value),
            {
              headers: { "x-requested-with": "XMLHttpRequest" },
              signal: controller.signal
            }
          );
          var html = response.ok ? await response.text() : "";

          if (!html) {
            clear();
            return;
          }

          output.innerHTML = html;
          output.hidden = false;
        } catch (error) {
          if (error.name !== "AbortError") {
            clear();
          }
        } finally {
          input.closest("form").classList.remove("searching");
        }
      }, 500);
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        clear();
      }
    });

    output.addEventListener("click", function (event) {
      if (!event.target.closest("a")) {
        clear();
      }
    });
  }

  function bindSearchAssistant() {
    var form = document.querySelector(".search-results-form");
    var options = form ? form.querySelector(".advancedOptions") : null;

    if (!form || !options) {
      return;
    }

    var button = form.querySelector(".toggleAssistant") || document.createElement("button");
    if (!button.classList.contains("toggleAssistant")) {
      button.type = "button";
      button.className = "toggleAssistant";
      button.textContent = "Search tools";
      form.querySelector("fieldset").prepend(button);
    }
    button.setAttribute("aria-controls", options.id || "dw__search__assist");

    function setOpen(open) {
      options.hidden = !open;
      options.setAttribute("aria-hidden", open ? "false" : "true");
      button.setAttribute("aria-expanded", open ? "true" : "false");
      DokuCookie.setValue("sa", open ? "on" : "off");
    }

    button.addEventListener("click", function () {
      setOpen(options.hidden);
    });

    function setToggleOpen(toggle, open) {
      var list = toggle.querySelector("ul");

      toggle.classList.toggle("open", open);
      if (list) {
        list.setAttribute("aria-expanded", open ? "true" : "false");
      }
    }

    options.querySelectorAll(".toggle div.current").forEach(function (current) {
      function toggleCurrent() {
        var parent = current.parentElement;
        var open = !parent.classList.contains("open");

        options.querySelectorAll(".toggle").forEach(function (other) {
          if (other !== parent) setToggleOpen(other, false);
        });
        setToggleOpen(parent, open);
      }

      current.addEventListener("click", function () {
        toggleCurrent();
      });
      current.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleCurrent();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          options.querySelectorAll(".toggle").forEach(function (other) {
            setToggleOpen(other, false);
          });
        }
      });
    });

    document.addEventListener("click", function (event) {
      if (!options.contains(event.target)) {
        options.querySelectorAll(".toggle").forEach(function (toggle) {
          setToggleOpen(toggle, false);
        });
      }
    });

    options.querySelectorAll(".toggle").forEach(function (toggle) {
      if (!toggle.hasAttribute("aria-haspopup")) {
        toggle.setAttribute("aria-haspopup", "true");
      }
      setToggleOpen(toggle, toggle.classList.contains("open"));
    });

    options.addEventListener("click", function (event) {
      var insert = event.target.closest("[data-search-insert]");
      var query = form.querySelector('input[name="q"]');

      if (!insert || !query) {
        return;
      }

      event.preventDefault();
      query.value = (query.value + " " + insert.dataset.searchInsert).trim();
      query.focus();
    });

    setOpen(DokuCookie.getValue("sa") === "on");
  }

  function bindSectionEditHighlights() {
    document.querySelectorAll("form.btn_secedit").forEach(function (form) {
      var button = form.closest(".secedit");
      var match = button ? button.className.match(/(?:^|\s)editbutton_(\d+)(?:\s|$)/) : null;
      var section = match ? document.querySelector(".sectionedit" + match[1]) : null;

      if (!button || !section) {
        return;
      }

      [form, button].forEach(function (target) {
        target.addEventListener("mouseover", function () {
          button.classList.add("section_highlight");
          section.classList.add("section_highlight");
        });
        target.addEventListener("mouseout", function () {
          button.classList.remove("section_highlight");
          section.classList.remove("section_highlight");
        });
      });
    });
  }

  function mediaDetailUrl(id) {
    return (
      "/media-detail/" +
      id
        .split(":")
        .map(function (part) {
          return encodeURIComponent(part);
        })
        .join("/")
    );
  }

  function bindMediaNamespaceTree(manager) {
    var tree = manager.querySelector("#media__tree");

    if (!tree) {
      return;
    }

    tree.addEventListener("click", function (event) {
      var toggle = event.target.closest("[data-media-tree-toggle]");

      if (!toggle || !tree.contains(toggle)) {
        return;
      }

      var item = toggle.closest("[data-media-tree-item]");
      var depth = Number(item ? item.dataset.depth : 0);
      var expanded = toggle.getAttribute("aria-expanded") === "true";
      var next = item ? item.nextElementSibling : null;

      event.preventDefault();
      toggle.setAttribute("aria-expanded", expanded ? "false" : "true");
      toggle.textContent = expanded ? "+" : "-";

      while (next && next.matches("[data-media-tree-item]")) {
        var nextDepth = Number(next.dataset.depth || 0);

        if (nextDepth <= depth) {
          break;
        }

        if (expanded) {
          next.hidden = true;
          next.querySelectorAll("[data-media-tree-toggle]").forEach(function (childToggle) {
            childToggle.setAttribute("aria-expanded", "false");
            childToggle.textContent = "+";
          });
        } else if (nextDepth === depth + 1) {
          next.hidden = false;
        }

        next = next.nextElementSibling;
      }
    });
  }

  function bindMediaSelection(manager) {
    manager.addEventListener("click", function (event) {
      var link = event.target.closest("a.select[data-media-id]");

      if (!link || !manager.contains(link)) {
        return;
      }

      var target = null;

      if (window.opener && !window.opener.closed) {
        target = window.opener;
      } else if (window.parent && window.parent !== window) {
        target = window.parent;
      }

      if (!target) {
        return;
      }

      event.preventDefault();
      target.postMessage(
        {
          type: "dokuwiki-media-select",
          id: link.dataset.mediaId || "",
          url: link.dataset.mediaUrl || link.getAttribute("href") || "",
          title: link.dataset.mediaTitle || link.textContent.trim()
        },
        window.location.origin
      );
    });
  }

  function bindMediaUpload(manager) {
    var form = manager.querySelector("#dw__upload[data-media-upload]");

    if (!form) {
      return;
    }

    var fileInput = form.querySelector("#upload__file");
    var idInput = form.querySelector("#upload__name");
    var namespaceInput = form.querySelector('input[name="ns"]');
    var progress = form.querySelector("#media__upload_progress");
    var status = form.querySelector("#media__upload_status");

    if (fileInput && idInput) {
      fileInput.addEventListener("change", function () {
        if (idInput.value || !fileInput.files || !fileInput.files.length) {
          return;
        }

        var namespace = namespaceInput ? namespaceInput.value : "";
        var name = fileInput.files[0].name;
        idInput.value = namespace ? namespace + ":" + name : name;
      });
    }

    form.addEventListener("submit", function (event) {
      if (typeof XMLHttpRequest === "undefined") {
        return;
      }

      var data = new FormData(form);
      var xhr = new XMLHttpRequest();
      var buttons = form.querySelectorAll("button");

      event.preventDefault();
      buttons.forEach(function (button) {
        button.disabled = true;
      });

      if (progress) {
        progress.hidden = false;
        progress.removeAttribute("value");
      }

      setStatus(status, "Uploading...");

      xhr.upload.addEventListener("progress", function (uploadEvent) {
        if (!progress || !uploadEvent.lengthComputable) {
          return;
        }

        progress.value = Math.round((uploadEvent.loaded / uploadEvent.total) * 100);
      });

      xhr.addEventListener("load", function () {
        var payload = {};

        try {
          payload = JSON.parse(xhr.responseText || "{}");
        } catch {
          payload = {};
        }

        if (xhr.status >= 200 && xhr.status < 300 && payload.id) {
          setStatus(status, "Upload complete.");
          window.location.href = mediaDetailUrl(payload.id);
          return;
        }

        setStatus(status, payload.error || "Upload failed.");
      });

      xhr.addEventListener("error", function () {
        setStatus(status, "Upload failed.");
      });

      xhr.addEventListener("loadend", function () {
        buttons.forEach(function (button) {
          button.disabled = false;
        });

        if (progress) {
          progress.hidden = true;
        }
      });

      xhr.open(form.method || "POST", form.action);
      xhr.setRequestHeader("accept", "application/json");
      xhr.setRequestHeader("x-requested-with", "XMLHttpRequest");
      xhr.send(data);
    });
  }

  function bindMediaManager() {
    var manager = document.querySelector("#media__manager");

    if (!manager) {
      return;
    }

    bindMediaNamespaceTree(manager);
    bindMediaSelection(manager);
    bindMediaUpload(manager);
  }

  ready(function () {
    bindHotkeys();
    bindMobileTools();
    bindQuickSearch();
    bindSearchAssistant();
    bindSectionEditHighlights();
    bindEditor();
    bindMediaManager();
  });
})();
