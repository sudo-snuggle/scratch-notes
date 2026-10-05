let flatNotes = [];
let draggedId = null;
const noteEls = new Map();

async function render() {
   let flatNotes = [];
let draggedId = null;
const noteEls = new Map();

async function render() {
    if (!appState.activePageId) {
        document.getElementById('outline').innerHTML = '';
        return;
    }

    const focusTarget = window.focusAfterRender || null;
    window.focusAfterRender = null;

    flatNotes = await getFlatNotes();
    // Filter to only notes whose ancestor chain reaches the active page
    const all = await db.notes.toArray();
    const byId = new Map(all.map(n => [n.id, n]));
    const belongsToPage = (id) => {
        let cur = byId.get(id);
        while (cur && cur.parentId) {
            if (cur.parentId === appState.activePageId) return true;
            cur = byId.get(cur.parentId);
        }
        return false;
    };
    flatNotes = flatNotes.filter(n => belongsToPage(n.id));

    // Recompute depth relative to the page
    const computeDepth = (note) => {
        let d = 0;
        let cur = note;
        while (cur && cur.parentId && cur.parentId !== appState.activePageId) {
            d++;
            cur = byId.get(cur.parentId);
        }
        return d;
    };
    flatNotes = flatNotes.map(n => ({ ...n, depth: computeDepth(n) }));

    const outline = document.getElementById('outline');
    outline.innerHTML = '';
    noteEls.clear();

    for (const note of flatNotes) {
        // ... rest of the existing render loop, unchanged ...
    }

    // ... trailing line logic unchanged ...

    if (focusTarget && noteEls.has(focusTarget.id)) {
        // ... unchanged ...
    }
}
}