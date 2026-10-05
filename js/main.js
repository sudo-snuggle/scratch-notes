async function openPage(pageId) {
    const page = await db.notes.get(pageId);
    if (!page) return;
    document.getElementById('page-title').textContent = page.content || 'Untitled';
    document.getElementById('page-title').contentEditable = 'true';
    document.getElementById('page-title').onblur = async (e) => {
        await renameNote(pageId, e.target.textContent.trim() || 'Untitled');
        await renderSidebar();
    };
    await render();
}

async function boot() {
    await renderSidebar();
    // If there's a page, open the first one
    const pages = (await db.notes.toArray()).filter(n => n.type === 'page');
    if (pages.length > 0) {
        appState.activePageId = pages[0].id;
        await renderSidebar();
        await openPage(pages[0].id);
    } else {
        // No pages yet — show a prompt in the main area
        document.getElementById('page-title').textContent = 'No page selected';
        document.getElementById('page-title').contentEditable = 'false';
    }
}

boot();