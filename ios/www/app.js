// Faust Notes: Faust patches as notes, edited and run with <faust-editor> (faust-web-component, GRAME).
// Storage: in the iOS app the notes are .dsp files in the Documents folder of the app (visible in
// the Files app), through the "notes" message handler of the native side; in a browser they are
// kept in localStorage.
(function () {
    "use strict";

    const $ = (sel) => document.querySelector(sel);
    const listView = $("#list-view"), editorView = $("#editor-view");
    const notesList = $("#notes"), search = $("#search"), empty = $("#empty");
    const host = $("#editor-host"), titleButton = $("#title"), menu = $("#menu");

    const NEW_NOTE = 'import("stdfaust.lib");\n\nprocess = os.osc(440) * 0.1 <: _, _;\n';

    //------------------------------------------------------------------ storage

    const native = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.notes;

    // native side: postMessage returns a promise (WKScriptMessageHandlerWithReply)
    const nativeStore = {
        list: () => native.postMessage({ cmd: "list" }),
        read: (name) => native.postMessage({ cmd: "read", name }),
        write: (name, code) => native.postMessage({ cmd: "write", name, code }),
        remove: (name) => native.postMessage({ cmd: "remove", name }),
        rename: (name, to) => native.postMessage({ cmd: "rename", name, to }),
        share: (name) => native.postMessage({ cmd: "share", name }),
        import: () => native.postMessage({ cmd: "import" }),
    };

    // browser: { name: { code, mtime } } in localStorage, examples loaded the first time
    const KEY = "faust-notes";
    const load = () => JSON.parse(localStorage.getItem(KEY) || "{}");
    const save = (all) => localStorage.setItem(KEY, JSON.stringify(all));
    const browserStore = {
        async list() {
            let all = load();
            if (!localStorage.getItem(KEY)) {
                const names = await (await fetch("examples/index.json")).json();
                for (const n of names) all[n] = { code: await (await fetch("examples/" + encodeURIComponent(n) + ".dsp")).text(), mtime: Date.now() };
                save(all);
            }
            return Object.entries(all).map(([name, n]) => ({ name, mtime: n.mtime, preview: n.code }));
        },
        async read(name) { return load()[name].code; },
        async write(name, code) { const all = load(); all[name] = { code, mtime: Date.now() }; save(all); },
        async remove(name) { const all = load(); delete all[name]; save(all); },
        async rename(name, to) { const all = load(); all[to] = all[name]; delete all[name]; save(all); },
        async share(name) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([load()[name].code], { type: "text/plain" }));
            a.download = name + ".dsp";
            a.click();
        },
        async import() {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".dsp,.lib,.txt";
            input.multiple = true;
            input.onchange = async () => {
                for (const f of input.files) await browserStore.write(await uniqueName(f.name.replace(/\.[^.]*$/, "")), await f.text());
                showList();
            };
            input.click();
        },
    };

    const store = native ? nativeStore : browserStore;

    // "Untitled", "Untitled 2", ...
    async function uniqueName(base) {
        const names = new Set((await store.list()).map((n) => n.name));
        if (!names.has(base)) return base;
        let i = 2;
        while (names.has(base + " " + i)) i++;
        return base + " " + i;
    }

    //------------------------------------------------------------------ list

    // first line of code that says something (a comment, or the first statement)
    function preview(code) {
        const lines = (code || "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("import(") && !l.startsWith("declare "));
        return lines.length ? lines[0].replace(/^\/\/\s?/, "") : "";
    }

    function formatDate(ms) {
        const d = new Date(ms), now = new Date();
        return d.toDateString() === now.toDateString()
            ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
    }

    let notes = [];

    async function showList() {
        closeEditor();
        notes = (await store.list()).sort((a, b) => b.mtime - a.mtime);
        renderList();
        editorView.hidden = true;
        listView.hidden = false;
    }

    function renderList() {
        const q = search.value.trim().toLowerCase();
        const shown = notes.filter((n) => !q || n.name.toLowerCase().includes(q) || (n.preview || "").toLowerCase().includes(q));
        notesList.replaceChildren(...shown.map((n) => {
            const li = document.createElement("li");
            const name = document.createElement("div");
            name.className = "name";
            name.textContent = n.name;
            const meta = document.createElement("div");
            meta.className = "meta";
            meta.textContent = formatDate(n.mtime) + "  " + preview(n.preview);
            li.append(name, meta);
            li.onclick = () => openNote(n.name);
            return li;
        }));
        empty.hidden = shown.length > 0;
    }

    search.oninput = renderList;
    $("#new").onclick = async () => {
        const name = await uniqueName("Untitled");
        await store.write(name, NEW_NOTE);
        openNote(name);
    };
    $("#import").onclick = () => store.import();

    // called by the native side when files were imported or changed in the Files app
    window.notesChanged = () => { if (!listView.hidden) showList(); };

    //------------------------------------------------------------------ editor

    // the site style inside the shadow DOM of the component, laid out for a phone:
    // code on top, controls / scope / spectrum below, bigger buttons
    const theme = new CSSStyleSheet();
    theme.replaceSync(`
        #root { border: none; border-radius: 0; height: 100%; display: flex; flex-direction: column; background: var(--bg); }
        #controls { background: var(--bg); border-bottom: 1px dashed var(--line); flex: none; }
        #controls .button, #controls .dropdown { min-height: 40px; }
        .button { background: var(--bg); color: var(--fg); min-width: 44px; }
        .button:disabled { color: var(--dim); }
        .button:active { background: var(--bg2); }
        .button svg { height: 18px; }
        .dropdown { font-family: var(--font); font-size: 12px; background: var(--bg); color: var(--fg); max-width: 150px; border: 1px dashed var(--line); }
        #faust { display: none; }
        #content { flex-direction: column; flex: 1; min-height: 0; }
        #editor { width: 100% !important; height: auto !important; flex: 1 1 55%; min-height: 120px; }
        .gutter { display: none !important; }
        #root, #content { width: 100%; max-width: 100vw; overflow: hidden; }
        #sidebar { width: 100% !important; max-width: 100% !important; min-width: 0; flex: 0 0 45%; min-height: 0; flex-direction: column; border-top: 1px dashed var(--line); }
        #sidebar-buttons { flex-direction: row; background: var(--bg); width: 100%; flex: none; border-bottom: 1px dashed var(--line); }
        #ide { display: none; }
        #controls { align-items: center; }
        #sidebar-buttons .button { width: auto; height: 40px; padding: 10px; flex: 1; background: var(--bg); color: var(--dim); }
        #sidebar-buttons .button:hover { background: var(--bg); }
        #sidebar-buttons .tab.active { background: var(--bg); color: var(--fg); box-shadow: inset 0 -2px 0 var(--fg); }
        #sidebar-content { flex: 1; min-width: 0; width: 100%; border-left: none; background: var(--bg); }
        #faust-ui, #faust-input, #faust-diagram { width: 100% !important; max-width: none !important; max-height: none !important; height: 100% !important; overflow: auto; }
        #faust-scope, #faust-spectrum { min-width: 100% !important; height: 100%; }
        .cm-editor { background: var(--bg); color: var(--fg); height: 100%; }
        .cm-scroller { font-family: var(--font) !important; font-size: var(--code-size, 11px); line-height: 1.5; }
        .cm-gutters { background: var(--bg) !important; border-right: 1px dashed var(--line) !important; color: var(--dim); }
        .cm-activeLine, .cm-activeLineGutter { background: rgba(127, 127, 127, 0.08) !important; }
        .cm-cursor { border-left-color: var(--fg) !important; }
    `);

    // code size: pinch with two fingers on the code (9..28 px), remembered
    let codeSize = +localStorage.getItem("code-size") || 11;
    const setCodeSize = (px) => {
        codeSize = Math.min(28, Math.max(9, px));
        document.documentElement.style.setProperty("--code-size", codeSize + "px");
    };
    setCodeSize(codeSize);

    function pinchZoom(el) {
        let start = 0, startSize = codeSize;
        const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        el.addEventListener("touchstart", (e) => {
            if (e.touches.length === 2) { start = dist(e.touches); startSize = codeSize; }
        }, { passive: true });
        el.addEventListener("touchmove", (e) => {
            if (e.touches.length === 2 && start) {
                e.preventDefault();
                setCodeSize(Math.round(startSize * dist(e.touches) / start));
            }
        }, { passive: false });
        el.addEventListener("touchend", (e) => {
            if (start && e.touches.length < 2) { start = 0; localStorage.setItem("code-size", codeSize); }
        });
    }
    // no zoom of the whole page
    document.addEventListener("gesturestart", (e) => e.preventDefault());

    let current = null;         // name of the open note
    let editor = null;
    let saveTimer = null;

    async function openNote(name) {
        const code = await store.read(name);
        current = name;
        titleButton.textContent = name;
        host.replaceChildren();
        editor = document.createElement("faust-editor");
        editor.appendChild(document.createComment(code));
        host.appendChild(editor);
        editor.shadowRoot.adoptedStyleSheets = [...editor.shadowRoot.adoptedStyleSheets, theme];
        pinchZoom(editor.shadowRoot.querySelector("#editor"));
        editor.addEventListener("change", (e) => {
            clearTimeout(saveTimer);
            const text = e.detail;
            saveTimer = setTimeout(() => store.write(name, text), 600);
        });
        listView.hidden = true;
        editorView.hidden = false;
    }

    // save now, stop the audio, remove the editor
    function closeEditor() {
        menu.hidden = true;
        if (!editor) return;
        clearTimeout(saveTimer);
        if (current) store.write(current, editor.code);
        if (editor.stop) editor.stop();
        host.replaceChildren();
        editor = null;
        current = null;
    }

    $("#back").onclick = showList;
    $("#share").onclick = async () => { await store.write(current, editor.code); store.share(current); };
    $("#more").onclick = () => { menu.hidden = !menu.hidden; };

    titleButton.onclick = async () => {
        const to = (prompt("Name", current) || "").trim().replace(/[\/:]/g, "-");
        if (!to || to === current) return;
        await store.write(current, editor.code);
        const name = await uniqueName(to);
        await store.rename(current, name);
        current = name;
        titleButton.textContent = name;
    };

    menu.onclick = async (e) => {
        const action = e.target.dataset.action;
        menu.hidden = true;
        if (action === "duplicate") {
            const name = await uniqueName(current + " copy");
            await store.write(name, editor.code);
            openNote(name);
        } else if (action === "delete" && confirm("Delete \"" + current + "\"?")) {
            const name = current;
            if (editor.stop) editor.stop();
            editor = null;
            current = null;
            await store.remove(name);
            showList();
        }
    };

    showList();
})();
