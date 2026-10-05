const db = new Dexie('MyNotesDB');
db.version(1).stores({
    notes: 'id, parentId, updatedAt'
});

// Track which notes are expanded (in memory for now)
const expanded = new Set();

// Load all notes into a map for fast lookup
async function getAllNotes() {
    const notes = await db.notes.toArray();
    const map = new Map();
    notes.forEach(n => map.set(n.id, { ...n, children: [] }));
    return map;
}

// Build the tree from flat records
function buildTree(map) {
    const roots = [];
    for (const note of map.values()) {
        if (note.parentId && map.has(note.parentId)) {
            map.get(note.parentId).children.push(note);
        } else {
            roots.push(note);
        }
    }
    // Sort children by creation order
    const sortRec = (nodes) => {
        nodes.sort((a, b) => a.updatedAt - b.updatedAt);
        nodes.forEach(n => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
}

// Recursively render a note and its children
function renderNote(note, container, depth = 0) {
    const li = document.createElement('li');
    li.style.marginLeft = `${depth * 20}px`;

    const row = document.createElement('div');
    row.className = 'note-row';

    // Expand/collapse arrow if it has children
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = note.children.length > 0
        ? (expanded.has(note.id) ? '▼' : '▶')
        : '•';
    if (note.children.length > 0) {
        arrow.onclick = () => {
            if (expanded.has(note.id)) expanded.delete(note.id);
            else expanded.add(note.id);
            render();
        };
    }

    // The note content
    const text = document.createElement('span');
    text.className = 'note-text';
    text.textContent = note.content || 'Untitled';

    // Add child button
    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.className = 'add-child';
    addBtn.onclick = () => addChild(note.id);

    row.append(arrow, text, addBtn);
    li.appendChild(row);

    // Render children if expanded
    if (expanded.has(note.id) && note.children.length > 0) {
        const childList = document.createElement('ul');
        note.children.forEach(child => renderNote(child, childList, depth + 1));
        li.appendChild(childList);
    }

    container.appendChild(li);
}

// Main render
async function render() {
    const map = await getAllNotes();
    const roots = buildTree(map);
    const list = document.getElementById('notesList');
    list.innerHTML = '';
    roots.forEach(note => renderNote(note, list));
}

// Add a top-level note
async function addNote() {
    const content = prompt('Note content:');
    if (!content) return;
    await db.notes.put({
        id: crypto.randomUUID(),
        content,
        parentId: null,
        updatedAt: Date.now()
    });
    render();
}

// Add a child to a specific note
async function addChild(parentId) {
    const content = prompt('Child note content:');
    if (!content) return;
    await db.notes.put({
        id: crypto.randomUUID(),
        content,
        parentId,
        updatedAt: Date.now()
    });
    expanded.add(parentId); // auto-expand so you see the new child
    render();
}

document.getElementById('addNoteBtn').addEventListener('click', addNote);
render();