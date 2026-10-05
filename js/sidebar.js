const expandedFolders = new Set();

async function renderSidebar() {
    const items = await getSidebarTree();
    const container = document.getElementById('sidebar-tree');
    container.innerHTML = '';

    const byParent = new Map();
    items.forEach(n => {
        const key = n.parentId || 'ROOT';
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(n);
    });
    for (const arr of byParent.values()) {
        arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    const renderLevel = (parentId, depth) => {
        const children = byParent.get(parentId || 'ROOT') || [];
        for (const item of children) {
            const row = document.createElement('div');
            row.className = 'tree-item';
            if (item.id === appState.activePageId) row.classList.add('active');
            row.style.paddingLeft = `${12 + depth * 14}px`;
            row.dataset.id = item.id;

            const arrow = document.createElement('span');
            arrow.className = 'arrow';

            const icon = document.createElement('span');
            icon.className = 'icon';

            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = item.content || 'Untitled';

            if (item.type === 'folder') {
                const hasChildren = (byParent.get(item.id) || []).length > 0;
                arrow.textContent = hasChildren
                    ? (expandedFolders.has(item.id) ? '▼' : '▶')
                    : '';
                icon.textContent = expandedFolders.has(item.id) ? '📂' : '📁';
                arrow.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (expandedFolders.has(item.id)) expandedFolders.delete(item.id);
                    else expandedFolders.add(item.id);
                    renderSidebar();
                });
            } else {
                icon.textContent = '📄';
            }

            label.addEventListener('dblclick', async (e) => {
                e.stopPropagation();
                const newName = prompt('Rename:', item.content);
                if (newName !== null && newName.trim()) {
                    await renameNote(item.id, newName.trim());
                    renderSidebar();
                    if (item.id === appState.activePageId) {
                        document.getElementById('page-title').textContent = newName.trim();
                    }
                }
            });

            row.addEventListener('click', async () => {
                if (item.type === 'page') {
                    appState.activePageId = item.id;
                    await renderSidebar();
                    await openPage(item.id);
                } else {
                    // Toggle folder
                    if (expandedFolders.has(item.id)) expandedFolders.delete(item.id);
                    else expandedFolders.add(item.id);
                    renderSidebar();
                }
            });

            row.append(arrow, icon, label);

            // Delete button on hover
            const del = document.createElement('span');
            del.textContent = '×';
            del.style.cssText = 'opacity:0;padding:0 4px;color:#999;';
            del.addEventListener('mouseenter', () => del.style.color = '#ef4444');
            del.addEventListener('mouseleave', () => del.style.color = '#999');
            del.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm(`Delete "${item.content}"?`)) return;
                if (item.type === 'folder') await deleteFolder(item.id);
                else await db.notes.delete(item.id);
                if (appState.activePageId === item.id) {
                    appState.activePageId = null;
                    document.getElementById('page-title').textContent = '';
                    document.getElementById('outline').innerHTML = '';
                }
                await renderSidebar();
            });
            row.addEventListener('mouseenter', () => del.style.opacity = '1');
            row.addEventListener('mouseleave', () => del.style.opacity = '0');
            row.appendChild(del);

            container.appendChild(row);

            if (item.type === 'folder' && expandedFolders.has(item.id)) {
                renderLevel(item.id, depth + 1);
            }
        }
    };

    renderLevel(null, 0);

    // Re-render the sidebar if a new folder/page is added via footer buttons
    document.getElementById('addFolderBtn').onclick = async () => {
        const name = prompt('Folder name:', 'New folder');
        if (!name) return;
        await createFolder(name.trim());
        await renderSidebar();
    };
    document.getElementById('addPageBtn').onclick = async () => {
        const name = prompt('Page name:', 'New page');
        if (!name) return;
        const page = await createPage(name.trim());
        appState.activePageId = page.id;
        await renderSidebar();
        await openPage(page.id);
    };
}