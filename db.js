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
    await db.notes.put(note);  //kill children after parent and elder siblings first
    return note;
}
// Is `maybeDescendantId` a descendant of `ancestorId`?
async function isDescendant(ancestorId, maybeDescendantId) {
    const all = await db.notes.toArray();
    const byId = new Map(all.map(n => [n.id, n]));
    let cur = byId.get(maybeDescendantId);
    while (cur && cur.parentId) {
        if (cur.parentId === ancestorId) return true;
        cur = byId.get(cur.parentId);
    }
    return false;
}

// Move note `dragId` to be right before/after `targetId`, or into it as child.
// position: 'before' | 'after' | 'into'
async function moveNote(dragId, targetId, position) {
    if (dragId === targetId) return;
    if (await isDescendant(dragId, targetId)) return; // refuse invalid move

    const target = await db.notes.get(targetId);
    if (!target) return;

    let newParentId, newOrder;

    if (position === 'into') {
        newParentId = target.id;
        const siblings = (await db.notes.toArray()).filter(
            s => (s.parentId || null) === newParentId
        );
        const max = siblings.reduce((m, s) => Math.max(m, s.order || 0), 0);
        newOrder = max + 1000;
    } else {
        newParentId = target.parentId || null;
        const siblings = (await db.notes.toArray())
            .filter(s => (s.parentId || null) === newParentId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        const idx = siblings.findIndex(s => s.id === targetId);
        if (position === 'before') {
            const prev = siblings[idx - 1];
            newOrder = prev
                ? ((prev.order || 0) + (target.order || 0)) / 2
                : (target.order || 0) - 1000;
        } else {
            const next = siblings[idx + 1];
            newOrder = next
                ? ((target.order || 0) + (next.order || 0)) / 2
                : (target.order || 0) + 1000;
        }
    }

    await db.notes.update(dragId, {
        parentId: newParentId,
        order: newOrder,
        updatedAt: Date.now()
    });
}

// Split "front == back" into parts. Returns null if no == present.
function parseFlashcard(content) {
    const idx = content.indexOf('==');
    if (idx === -1) return null;
    return {
        front: content.slice(0, idx).trim(),
        back: content.slice(idx + 2).trim()
    };
}


async function saveNoteContent(noteId, content) {
    const parsed = parseFlashcard(content);
    const update = { content, updatedAt: Date.now() };
    if (parsed) {
        update.flashcardFront = parsed.front;
        update.flashcardBack = parsed.back;
        // Keep existing direction if there was one
        const existing = await db.notes.get(noteId);
        if (!existing.flashcardDirection) update.flashcardDirection = 'forward';
    } else {
        update.flashcardFront = null;
        update.flashcardBack = null;
        update.flashcardDirection = null;
    }
    await db.notes.update(noteId, update);
}