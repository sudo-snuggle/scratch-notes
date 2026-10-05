function onEditorInput(editor, note, li) {
    const isTrailing = note.id === '__trailing__';
    const full = editor.querySelector('[data-role="full"]');

    if (full && full.textContent.includes('==')) {
        const text = full.textContent;
        const idx = text.indexOf('==');
        const frontText = text.slice(0, idx).replace(/\s+$/, '');
        const backText = text.slice(idx + 2).replace(/^\s+/, '');
        const caretPos = getCaretPosition(full);
        const wasAfterArrow = caretPos > idx + 2;

        full.remove();
        const frontSpan = makePart('front', frontText, note);
        const arrow = makeArrow(note, editor, li);
        const backSpan = makePart('back', backText, note);
        editor.append(frontSpan, arrow, backSpan);

        if (wasAfterArrow) {
            backSpan.focus();
            setCaretPosition(backSpan, Math.max(0, caretPos - idx - 2));
        } else {
            frontSpan.focus();
            setCaretPosition(frontSpan, Math.min(caretPos, frontText.length));
        }

        note.content = `${frontText} == ${backText}`;
        li.classList.remove('empty');
        return;
    }

    note.content = collectContent(editor);
    const total = Array.from(editor.querySelectorAll('.part')).map(p => p.textContent).join('');
    li.classList.toggle('empty', total.trim() === '');
}

function onEditorKeydown(e, editor, note, li) {
    const isTrailing = note.id === '__trailing__';

    if (e.key === 'Backspace') {
        const front = editor.querySelector('[data-role="front"]');
        const back = editor.querySelector('[data-role="back"]');
        if (front && back) {
            const active = document.activeElement;
            if (active === back && back.textContent === '') {
                e.preventDefault();
                const arrow = editor.querySelector('[data-role="arrow"]');
                const newText = front.textContent + ' ==';
                front.textContent = newText;
                arrow?.remove();
                back.remove();
                front.focus();
                setCaretPosition(front, newText.length);
                note.content = newText;
                if (!isTrailing) saveNoteContent(note.id, newText);
                return;
            }
        }
        const full = editor.querySelector('[data-role="full"]');
        if (full && full.textContent === '' && document.activeElement === full && !isTrailing) {
            e.preventDefault();
            deleteNote(note.id);
            return;
        }
    }

    if (e.key === 'Enter') {
        e.preventDefault();
        if (isTrailing) promoteTrailing(editor);
        else handleEnter(note);
        return;
    }

    if (e.key === 'Tab') {
        e.preventDefault();
        if (isTrailing) return;
        handleTab(note, e.shiftKey);
        return;
    }
}

async function handleEnter(note) {
    await saveNoteContent(note.id, note.content || '');
    const fresh = await db.notes.get(note.id);
    if (!fresh) return;
    const newNote = await createNote({
        content: '',
        parentId: fresh.parentId || null,
        afterId: note.id
    });
    window.focusAfterRender = { id: newNote.id, caret: 0 };
    await render();
}

async function handleTab(note, isShift) {
    await saveNoteContent(note.id, note.content || '');
    if (isShift) await outdent(note.id);
    else await indent(note.id);
    const fresh = await db.notes.get(note.id);
    window.focusAfterRender = { id: note.id, caret: (fresh?.content || '').length };
    await render();
}

async function promoteTrailing(editor) {
    const content = collectContent(editor).trim();
    if (!content) return;
    const all = await getFlatNotes();
    const lastId = all.length ? all[all.length - 1].id : null;
    const newNote = await createNote({ content, parentId: null, afterId: lastId });
    window.focusAfterRender = { id: newNote.id, caret: content.length };
    await render();
}