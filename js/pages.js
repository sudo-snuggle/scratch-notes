async function createFolder(name, parentFolderId = null) {
    const all = await db.notes.toArray();
    const siblings = all.filter(s =>
        (s.parentId || null) === parentFolderId && s.type === 'folder'
    );
    const max = siblings.reduce((m, s) => Math.max(m, s.order || 0), 0);
    const folder = {
        id: crypto.randomUUID(),
        type: 'folder',
        content: name,
        parentId: parentFolderId,
        order: max + 1000,
        updatedAt: Date.now()
    };
    await db.notes.put(folder);
    return folder;
}

async function createPage(name, parentFolderId = null) {
    const all = await db.notes.toArray();
    const siblings = all.filter(s =>
        (s.parentId || null) === parentFolderId && s.type === 'page'
    );
    const max = siblings.reduce((m, s) => Math.max(m, s.order || 0), 0);
    const page = {
        id: crypto.randomUUID(),
        type: 'page',
        content: name,
        parentId: parentFolderId,
        order: max + 1000,
        updatedAt: Date.now()
    };
    await db.notes.put(page);
    return page;
}

async function getSidebarTree() {
    const all = await db.notes.toArray();
    return all.filter(n => n.type === 'folder' || n.type === 'page');
}

async function renameNote(id, content) {
    await db.notes.update(id, { content, updatedAt: Date.now() });
}

async function deleteFolder(id) {
    // Delete folder and everything under it
    const all = await db.notes.toArray();
    const toDelete = new Set([id]);
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
}