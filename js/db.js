const db = new Dexie('MyNotesDB');
db.version(3).stores({
    notes: 'id, parentId, order, type, updatedAt'
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

// Notes inside a specific page (outline of that page)
async function getPageNotes(pageId) {
    const all = await db.notes.toArray();
    const inPage = all.filter(n => {
        // A note belongs to a page if walking up parents reaches the page id
        let cur = n;
        while (cur && cur.parentId) {
            if (cur.parentId === pageId) return true;
            cur = all.find(x => x.id === cur.parentId);
            if (!cur) return false;
        }
        return false;
    });
    // Include the direct children of the page
    const directChildren = all.filter(n => n.parentId === pageId);
    const directIds = new Set(directChildren.map(n => n.id));
    const result = all.filter(n =>
        n.id === pageId ||
        directIds.has(n.id) ||
        inPage.some(x => x.id === n.id)
    );
    return result;
}