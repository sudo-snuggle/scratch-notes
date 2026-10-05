// 1. Define the database
const db = new Dexie('MyNotesDB');
db.version(1).stores({
    notes: 'id, parentId, updatedAt' // Index parentId for tree queries
});

// 2. Load and render notes
async function renderNotes() {
    const notes = await db.notes.where('parentId').equals(null).toArray();
    const list = document.getElementById('notesList');
    list.innerHTML = '';
    
    // Sort by most recent
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
    
    notes.forEach(note => {
        const li = document.createElement('li');
        li.textContent = note.content || 'Untitled';
        list.appendChild(li);
    });
}

// 3. Add a new note
async function addNote() {
    const content = prompt('Note content:');
    if (!content) return;
    
    await db.notes.put({
        id: crypto.randomUUID(),
        content: content,
        parentId: null, // top-level note for now
        childIds: [],
        updatedAt: Date.now()
    });
    
    renderNotes();
}

// 4. Wire it up
document.getElementById('addNoteBtn').addEventListener('click', addNote);
renderNotes(); // Initial load