const db = new Dexie('MyNotesDB');
db.version(2).stores({
    notes: 'id, parentId, order, updatedAt'
});

async function getFlatNotes() {
    const all = await db.notes.toArray();
    const byParent = new Map();
    all.forEach(n => {
        const key = n.parentId || 'ROOT';
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(n);
    });
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