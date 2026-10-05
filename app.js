let flatNotes = [];
let draggedId = null;
const noteEls = new Map();

async function render() {
    flatNotes = await getFlatNotes();
    const outline = document.getElementById('outline');
    outline.innerHTML = '';
    noteEls.clear();

    for (const note of flatNotes) {
        const li = document.createElement('li');
        li.className = 'line';
        li.style.paddingLeft = `${note.depth * 24}px`;
        li.dataset.id = note.id;

        const bullet = document.createElement('span');
        bullet.className = 'bullet';
        bullet.textContent = '•';
        bullet.draggable = true;

        bullet.addEventListener('dragstart', (e) => {
            draggedId = note.id;
            li.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', note.id);
        });
        bullet.addEventListener('dragend', () => {
            draggedId = null;
            document.querySelectorAll('.line').forEach(el => {
                el.classList.remove('dragging', 'drop-before', 'drop-after', 'drop-into');
            });
        });

        li.addEventListener('dragover', (e) => {
            if (!draggedId || draggedId === note.id) return;
            e.preventDefault();
            const rect = li.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const h = rect.height;
            li.classList.remove('drop-before', 'drop-after', 'drop-into');
            if (y < h * 0.25) li.classList.add('drop-before');
            else if (y > h * 0.75) li.classList.add('drop-after');
            else li.classList.add('drop-into');
        });
        li.addEventListener('dragleave', () => {
            li.classList.remove('drop-before', 'drop-after', 'drop-into');
        });
        li.addEventListener('drop', async (e) => {
            e.preventDefault();
            if (!draggedId || draggedId === note.id) return;
            const position = li.classList.contains('drop-before') ? 'before'
                : li.classList.contains('drop-after') ? 'after'
                : 'into';
            await moveNote(draggedId, note.id, position);
            draggedId = null;
            await render();
        });

        const input = document.createElement('input');
        input.type = 'text';
        input.value = note.content;
        input.placeholder = note.depth === 0 ? 'Type a note…' : '';
        input.dataset.id = note.id;
        if (!note.content) li.classList.add('empty');

        input.addEventListener('input', () => {
            note.content = input.value;
            li.classList.toggle('empty', !input.value);
        });
        input.addEventListener('blur', async () => {
            await db.notes.update(note.id, { content: input.value, updatedAt: Date.now() });
        });
        input.addEventListener('keydown', (e) => handleKey(e, note, input));

        noteEls.set(note.id, input);
        li.append(bullet, input);
        outline.appendChild(li);
    }

    const last = flatNotes[flatNotes.length - 1];
    if (!last || last.content.trim() !== '') {
        const li = document.createElement('li');
        li.className = 'line empty';
        const bullet = document.createElement('span');
        bullet.className = 'bullet';
        bullet.textContent = '•';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = flatNotes.length === 0 ? 'Type your first note…' : 'Type a note…';
        input.addEventListener('keydown', (e) => handleTrailingKey(e, input));
        input.addEventListener('blur', async () => {
            if (input.value.trim()) {
                await createNote({ content: input.value, parentId: null, afterId: last?.id });
                await render();
            }
        });
        li.append(bullet, input);
        outline.appendChild(li);
    }
}

async function handleKey(e, note, input) {
    if (e.key === 'Enter') {
        e.preventDefault();
        await db.notes.update(note.id, { content: input.value, updatedAt: Date.now() });
        const fresh = await db.notes.get(note.id);
        const newNote = await createNote({
            content: '',
            parentId: fresh.parentId || null,
            afterId: note.id
        });
        await render();
        noteEls.get(newNote.id)?.focus();
    }

    if (e.key === 'Tab') {
        e.preventDefault();
        await db.notes.update(note.id, { content: input.value, updatedAt: Date.now() });
        if (e.shiftKey) {
            await outdent(note.id);
        } else {
            await indent(note.id);
        }
        await render();
        noteEls.get(note.id)?.focus();
    }

    if (e.key === 'Backspace' && input.value === '') {
        e.preventDefault();
        await deleteNote(note.id);
    }

    if (e.key === 'ArrowUp') {
        const idx = flatNotes.findIndex(n => n.id === note.id);
        if (idx > 0) { e.preventDefault(); noteEls.get(flatNotes[idx - 1].id)?.focus(); }
    }
    if (e.key === 'ArrowDown') {
        const idx = flatNotes.findIndex(n => n.id === note.id);
        if (idx < flatNotes.length - 1) { e.preventDefault(); noteEls.get(flatNotes[idx + 1].id)?.focus(); }
    }
}

async function handleTrailingKey(e, input) {
    if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        const last = flatNotes[flatNotes.length - 1];
        const newNote = await createNote({
            content: input.value,
            parentId: null,
            afterId: last?.id
        });
        await render();
        noteEls.get(newNote.id)?.focus();
    }
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
    const order = next ? ((parent.order || 0) + (next.order || 0)) / 2 : (parent.order || 0) + 1000;
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

render();