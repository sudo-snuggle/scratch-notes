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

        const editor = document.createElement('div');
        editor.className = 'note-editor';
        editor.dataset.id = note.id;
        buildEditor(editor, note, li);

        noteEls.set(note.id, editor);
        li.append(bullet, editor);
        outline.appendChild(li);
    }

    const last = flatNotes[flatNotes.length - 1];
    if (!last || (last.content || '').trim() !== '') {
        const li = document.createElement('li');
        li.className = 'line empty';
        const bullet = document.createElement('span');
        bullet.className = 'bullet';
        bullet.textContent = '•';

        const editor = document.createElement('div');
        editor.className = 'note-editor';
        const span = document.createElement('span');
        span.className = 'part';
        span.contentEditable = 'true';
        span.dataset.role = 'full';
        span.dataset.trailing = 'true';
        span.dataset.placeholder = flatNotes.length === 0 ? 'Type your first note…' : 'Type a note…';

        span.addEventListener('keydown', (e) => handleTrailingKey(e, span));
        span.addEventListener('keydown', (e) => {
            if (e.key === ' ' && span.textContent.includes('==')) {
                e.preventDefault();
                const text = span.textContent;
                const caretAt = getCaretPosition(span);
                span.textContent = text.slice(0, caretAt) + ' ' + text.slice(caretAt);
                createNote({
                    content: span.textContent,
                    parentId: null,
                    afterId: flatNotes[flatNotes.length - 1]?.id
                }).then(() => render());
            }
        });
        span.addEventListener('blur', async () => {
            setTimeout(async () => {
                const text = span.textContent.trim();
                if (!text) return;
                await createNote({
                    content: span.textContent,
                    parentId: null,
                    afterId: flatNotes[flatNotes.length - 1]?.id
                });
                await render();
            }, 120);
        });

        editor.appendChild(span);
        li.append(bullet, editor);
        outline.appendChild(li);
    }
}

async function handleKey(e, note, span) {
    if (e.key === 'Enter') {
        e.preventDefault();
        await commitEditor(span.closest('.note-editor'), note, span.closest('.line'));
        const fresh = await db.notes.get(note.id);
        const newNote = await createNote({
            content: '',
            parentId: fresh.parentId || null,
            afterId: note.id
        });
        await render();
        const newEl = noteEls.get(newNote.id);
        newEl?.querySelector('.part')?.focus();
    }

    if (e.key === 'Tab') {
        e.preventDefault();
        await commitEditor(span.closest('.note-editor'), note, span.closest('.line'));
        if (e.shiftKey) await outdent(note.id);
        else await indent(note.id);
        await render();
        noteEls.get(note.id)?.querySelector('.part')?.focus();
    }

    if (e.key === 'Backspace' && span.textContent === '' && span.dataset.role === 'full') {
        e.preventDefault();
        await deleteNote(note.id);
    }
}

async function handleTrailingKey(e, span) {
    if (e.key === 'Enter' && span.textContent.trim()) {
        e.preventDefault();
        const last = flatNotes[flatNotes.length - 1];
        const newNote = await createNote({
            content: span.textContent,
            parentId: null,
            afterId: last?.id
        });
        await render();
        const newEl = noteEls.get(newNote.id);
        newEl?.querySelector('.part')?.focus();
    }
}