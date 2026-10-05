async function indent(noteId) {
    const flat = await getFlatNotes();
    const idx = flat.findIndex(n => n.id === noteId);
    if (idx <= 0) return;
    const me = flat[idx];
    const myDepth = me.depth;

    // Walk backward to find the nearest note with depth <= my depth.
    // That becomes my new parent.
    let parent = null;
    for (let i = idx - 1; i >= 0; i--) {
        if (flat[i].depth <= myDepth) {
            parent = flat[i];
            break;
        }
    }
    if (!parent) return;

    const siblings = (await db.notes.toArray()).filter(
        s => (s.parentId || null) === parent.id
    );
    const maxOrder = siblings.reduce((m, s) => Math.max(m, s.order || 0), 0);

    await db.notes.update(noteId, {
        parentId: parent.id,
        order: maxOrder + 1000,
        updatedAt: Date.now()
    });
}