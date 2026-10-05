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
        span.placeholder = flatNotes.length === 0 ? 'Type your first note…' : 'Type a note…';

        span.addEventListener('keydown', (e) => handleTrailingKey(e, span));
        span.addEventListener('blur', async () => {
            setTimeout(async () => {
                const text = span.textContent.trim();
                if (!text) return;
                const lastNote = flatNotes[flatNotes.length - 1];
                await createNote({
                    content: span.textContent,
                    parentId: null,
                    afterId: lastNote?.id
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

function buildEditor(editor, note, li) {
    editor.innerHTML = '';
    const parsed = parseFlashcard(note.content || '');

    if (!parsed) {
        const span = document.createElement('span');
        span.className = 'part';
        span.contentEditable = 'true';
        span.textContent = note.content || '';
        span.dataset.role = 'full';
        attachEditorEvents(span, note, li, editor);
        editor.appendChild(span);
        if (!note.content) li.classList.add('empty');
    } else {
        const front = document.createElement('span');
        front.className = 'part';
        front.contentEditable = 'true';
        front.textContent = parsed.front;
        front.dataset.role = 'front';
        attachEditorEvents(front, note, li, editor);

        const arrow = document.createElement('span');
        arrow.className = 'flash-arrow';
        arrow.textContent = directionSymbol(note.flashcardDirection);
        arrow.contentEditable = 'false';
        arrow.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openDirectionMenu(arrow, note, editor, li);
        });

        const back = document.createElement('span');
        back.className = 'part';
        back.contentEditable = 'true';
        back.textContent = parsed.back;
        back.dataset.role = 'back';
        attachEditorEvents(back, note, li, editor);

        editor.append(front, arrow, back);
    }
}

function directionSymbol(dir) {
    if (dir === 'backward') return '←';
    if (dir === 'both') return '↔';
    return '→';
}

function attachEditorEvents(span, note, li, editor) {
    span.addEventListener('focus', () => {
        li.classList.remove('empty');
    });

    span.addEventListener('input', () => {
        li.classList.toggle('empty', editor.textContent.trim() === '');
    });

    span.addEventListener('keydown', (e) => handleKey(e, note, span));

    span.addEventListener('blur', async () => {
        setTimeout(async () => {
            if (document.activeElement?.closest('.note-editor') === editor) return;
            await commitEditor(editor, note, li);
        }, 120);
    });

    span.addEventListener('input', () => {
        if (span.dataset.role !== 'full') return;
        if (span.textContent.includes('==')) {
            const caretAt = getCaretPosition(span);
            const content = span.textContent;
            note.content = content;
            buildEditor(editor, { ...note, content }, li);
            const newSpan = editor.querySelector('[data-role="back"]');
            if (newSpan) {
                newSpan.focus();
                setCaretPosition(newSpan, Math.max(0, caretAt - content.indexOf('==') - 2));
            }
        }
    });
}

async function commitEditor(editor, note, li) {
    if (!editor) return;
    const parts = editor.querySelectorAll('.part');
    let content;
    if (parts.length === 1) {
        content = parts[0].textContent;
    } else {
        const front = parts[0].textContent;
        const back = parts[1].textContent;
        content = `${front} == ${back}`;
    }
    if (content !== note.content) {
        note.content = content;
        await saveNoteContent(note.id, content);
    }
}

function getCaretPosition(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
}

function setCaretPosition(el, pos) {
    const range = document.createRange();
    const sel = window.getSelection();
    let charCount = 0;
    const walk = (node) => {
        if (node.nodeType === 3) {
            if (charCount + node.length >= pos) {
                range.setStart(node, pos - charCount);
                range.collapse(true);
                return true;
            }
            charCount += node.length;
        } else {
            for (const child of node.childNodes) {
                if (walk(child)) return true;
            }
        }
        return false;
    };
    walk(el);
    sel.removeAllRanges();
    sel.addRange(range);
}

function openDirectionMenu(anchor, note, editor, li) {
    document.querySelectorAll('.flash-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'flash-menu';

    const options = [
        { value: 'forward', label: '→  Forward (front → back)' },
        { value: 'backward', label: '←  Backward (back → front)' },
        { value: 'both', label: '↔  Both directions' }
    ];

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt.label;
        if (note.flashcardDirection === opt.value) btn.classList.add('active');
        btn.addEventListener('click', async () => {
            await db.notes.update(note.id, {
                flashcardDirection: opt.value,
                updatedAt: Date.now()
            });
            menu.remove();
            const fresh = await db.notes.get(note.id);
            buildEditor(editor, fresh, li);
        });
        menu.appendChild(btn);
    });

    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    document.body.appendChild(menu);

    setTimeout(() => {
        const close = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('mousedown', close);
            }
        };
        document.addEventListener('mousedown', close);
    }, 0);
}

render();