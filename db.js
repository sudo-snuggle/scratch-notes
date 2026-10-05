const db = new Dexie('MyNotesDB');
db.version(2).stores({
    notes: 'id, parentId, order, updatedAt'
});

// Get all notes sorted for flat rendering (children right after parent)
async function getFlatNotes() {
    const all = await db.notes.toArray();
    const byParent = new Map();
    all.forEach(n => {
        const key = n.parentId || 'ROOT';
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(n);
    });
    // Sort siblings by order
    for (const arr of byParent.values()) {
        arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    const flat = [];
    const walk = (parentId, depth) => {
        const children = byParent.get(parentId || 'ROOT') || [];
        for (const note of children) {
            flat.push({ ...note, depth });
            walk(note.id, depth + 1);
        }
    };
    walk(null, 0);
    return flat;
}

// Create a note. If afterId is given, insert right after that note as sibling.
async function createNote({ content = '', parentId = null, afterId = null }) {
    let order;
    if (afterId) {
        const after = await db.notes.get(afterId);
        const siblings = await db.notes.where('parentId').equals(parentId || 'ROOT').toArray();
        const sorted = siblings
            .filter(s => s.parentId === parentId || (!s.parentId && !parentId))
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        const idx = sorted.findIndex(s => s.id === afterId);
        const next = sorted[idx + 1];
        if (next) order = ((after.order || 0) + (next.order || 0)) / 2;
        else order = (after.order || 0) + 1000;
    } else {
        const siblings = await db.notes.toArray();
        const sameLevel = siblings.filter(s => (s.parentId || null) === parentId);
        const max = sameLevel.reduce((m, s) => Math.max(m, s.order || 0), 0);
        order = max + 1000;
    }
    const note = {
        id: crypto.randomUUID(),
        content,
        parentId,
        order,
        updatedAt: Date.now()
    };
    await db.notes.put(note);
    return note;
}