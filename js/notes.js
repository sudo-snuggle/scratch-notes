async function createNote({ content = '', parentId = null, afterId = null }) {
    let order;
    if (afterId) {
        const after = await db.notes.get(afterId);
        const all = await db.notes.toArray();
        const siblings = all
            .filter(s => (s.parentId || null) === parentId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        const idx = siblings.findIndex(s => s.id === afterId);
        const next = siblings[idx + 1];
        if (next) order = ((after.order || 0) + (next.order || 0)) / 2;
        else order = (after.order || 0) + 1000;
    } else {
        const all = await db.notes.toArray();
        const sameLevel = all.filter(s => (s.parentId || null) === parentId);
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

async function saveNoteContent(noteId, content) {
    const parsed = parseFlashcard(content);
    const update = { content, updatedAt: Date.now() };
    if (parsed) {
        update.flashcardFront = parsed.front;
        update.flashcardBack = parsed.back;
        const existing = await db.notes.get(noteId);
        if (!existing.flashcardDirection) update.flashcardDirection = 'forward';
    } else {
        update.flashcardFront = null;
        update.flashcardBack = null;
        update.flashcardDirection = null;
    }
    await db.notes.update(noteId, update);
}

async function indent(noteId) {
    const flat = await getFlatNotes();
    const idx = flat.findIndex(n => n.id === noteId);
    if (idx <= 0) return;
    const prev = flat[idx - 1];
    const siblings = await db.notes.where('parentId').equals(prev.id).toArray();
    const maxOrder = siblings.reduce((m, s) => Math.max(m, s.order || 0), 0);
    await db.notes.update(noteId, {
        parentId: prev.id,
        order: maxOrder + 1000,
        updatedAt: Date.now()
    });
}

async function outdent(noteId) {
    const note = await db.notes.get(noteId);
    if (!note.parentId) return;
    const parent = await db.notes.get(note.parentId);
    if (!parent) return;
    const realSiblings = (await db.notes.toArray()).filter(
        s => (s.parentId || null) === (parent.parentId || null)
    );
    const sorted = realSiblings.sort((a, b) => (a.order || 0) - (b.order || 0));
    const pIdx = sorted.findIndex(s => s.id === parent.id);
    const next = sorted[pIdx + 1];
    const order = next
        ? ((parent.order || 0) + (next.order || 0)) / 2
        : (parent.order || 0) + 1000;
    await db.notes.update(noteId, {
        parentId: parent.parentId || null,
        order,
        updatedAt: Date.now()
    });
}

async function deleteNote(noteId) {
    const all = await db.notes.toArray();
    const toDelete = new Set([noteId]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const n of all) {
            if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
                toDelete.add(n.id);
                changed = true;
            }
        }
    }
    await db.notes.bulkDelete([...toDelete]);
    await render();
}

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

async function moveNote(dragId, targetId, position) {
    if (dragId === targetId) return;
    if (await isDescendant(dragId, targetId)) return;
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