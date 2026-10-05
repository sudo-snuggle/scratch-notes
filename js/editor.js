function directionSymbol(dir) {
    if (dir === 'backward') return '←';
    if (dir === 'both') return '↔';
    return '→';
}

function buildEditor(editor, note, li) {
    editor.innerHTML = '';
    const parsed = parseFlashcard(note.content || '');

    if (!parsed) {
        const span = makePart('full', note.content || '', note);
        editor.appendChild(span);
        if (!note.content) li.classList.add('empty');
    } else {
        editor.append(
            makePart('front', parsed.front, note),
            makeArrow(note, editor, li),
            makePart('back', parsed.back, note)
        );
    }

    if (!editor.dataset.wired) {
        editor.dataset.wired = '1';
        editor.addEventListener('keydown', (e) => onEditorKeydown(e, editor, note, li));
        editor.addEventListener('input', () => onEditorInput(editor, note, li));
        editor.addEventListener('focusin', () => li.classList.remove('empty'));
        editor.addEventListener('blur', () => {
            setTimeout(async () => {
                if (document.activeElement?.closest('.note-editor') === editor) return;
                await commitEditor(editor, note, li);
            }, 120);
        });
    }
}

function makePart(role, text, note) {
    const span = document.createElement('span');
    span.className = 'part';
    span.contentEditable = 'true';
    span.textContent = text;
    span.dataset.role = role;
    if (role === 'full') span.dataset.placeholder = note.depth === 0 ? 'Type a note…' : '';
    if (role === 'front') span.dataset.placeholder = 'Front';
    if (role === 'back') span.dataset.placeholder = 'Back';
    return span;
}

function makeArrow(note, editor, li) {
    const arrow = document.createElement('span');
    arrow.className = 'flash-arrow';
    arrow.contentEditable = 'false';
    arrow.dataset.role = 'arrow';
    arrow.textContent = directionSymbol(note.flashcardDirection);
    arrow.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openDirectionMenu(arrow, note, editor, li);
    });
    return arrow;
}

function onEditorInput(editor, note, li) {
    // Trailing fake note: don't auto-convert via DB. Just visual.
    const isTrailing = note.id === '__trailing__';

    const full = editor.querySelector('[data-role="full"]');

    // Detect == typed in plain mode, convert in place WITHOUT losing caret
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

        // Restore caret
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

    // Update in-memory note
    note.content = collectContent(editor);
    const total = Array.from(editor.querySelectorAll('.part')).map(p => p.textContent).join('');
    li.classList.toggle('empty', total.trim() === '');
}

function collectContent(editor) {
    const front = editor.querySelector('[data-role="front"]');
    const back = editor.querySelector('[data-role="back"]');
    const full = editor.querySelector('[data-role="full"]');
    if (full) return full.textContent;
    if (front && back) return `${front.textContent} == ${back.textContent}`;
    return '';
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
        if (isTrailing) {
            promoteTrailing(editor);
            return;
        }
        handleEnter(note);
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

async function commitEditor(editor, note, li) {
    if (!editor) return;
    if (note.id === '__trailing__') return;
    const content = collectContent(editor);
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
    let done = false;
    const walk = (node) => {
        if (done) return true;
        if (node.nodeType === 3) {
            if (charCount + node.length >= pos) {
                range.setStart(node, Math.max(0, pos - charCount));
                range.collapse(true);
                done = true;
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
    if (!done) {
        range.selectNodeContents(el);
        range.collapse(false);
    }
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