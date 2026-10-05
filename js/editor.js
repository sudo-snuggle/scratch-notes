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

    // Attach a single set of listeners to the editor itself, not the spans.
    if (!editor.dataset.wired) {
        editor.dataset.wired = '1';
        editor.addEventListener('keydown', (e) => onEditorKeydown(e, editor, note, li));
        editor.addEventListener('input', () => onEditorInput(editor, note, li));
        editor.addEventListener('blur', () => {
            setTimeout(async () => {
                if (document.activeElement?.closest('.note-editor') === editor) return;
                await commitEditor(editor, note, li);
            }, 120);
        });
        editor.addEventListener('focusin', () => li.classList.remove('empty'));
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
    const full = editor.querySelector('[data-role="full"]');
    const front = editor.querySelector('[data-role="front"]');
    const back = editor.querySelector('[data-role="back"]');
    const arrow = editor.querySelector('[data-role="arrow"]');

    // Plain text mode: check if user typed ==
    if (full) {
        const text = full.textContent;
        const idx = text.indexOf('==');
        if (idx !== -1) {
            // Convert in place. Split text at ==
            const frontText = text.slice(0, idx).replace(/\s+$/, '');
            const backText = text.slice(idx + 2);
            const caretWasAfter = getCaretPosition(full) > idx + 2;

            full.remove();
            const newFront = makePart('front', frontText, note);
            const newArrow = makeArrow(note, editor, li);
            const newBack = makePart('back', backText, note);
            editor.append(newFront, newArrow, newBack);

            if (caretWasAfter) {
                newBack.focus();
                setCaretPosition(newBack, (getCaretPosition(full) || 0) - idx - 2);
            } else {
                newFront.focus();
                setCaretPosition(newFront, frontText.length);
            }
            li.classList.remove('empty');
            note.content = `${frontText} == ${backText}`;
            return;
        }
    }

    // Flashcard mode: check if user deleted the ==
    if (front && back && !editor.querySelector('[data-role="full"]')) {
        const combined = front.textContent;
        if (combined.includes('==')) {
            // User typed == inside front — split it
            const idx = combined.indexOf('==');
            const frontText = combined.slice(0, idx).replace(/\s+$/, '');
            const backText = combined.slice(idx + 2);
            front.textContent = frontText;
            back.textContent = backText + back.textContent;
            front.focus();
            setCaretPosition(front, frontText.length);
            return;
        }
    }

    // Live placeholder toggling for empty line class
    const total = Array.from(editor.querySelectorAll('.part')).map(p => p.textContent).join('');
    li.classList.toggle('empty', total.trim() === '');

    // Update in-memory note content
    note.content = collectContent(editor);
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
    // Detect backspace when the last visible char is one of the '='s
    if (e.key === 'Backspace') {
        const front = editor.querySelector('[data-role="front"]');
        const back = editor.querySelector('[data-role="back"]');
        if (front && back) {
            const frontText = front.textContent;
            // If back is empty and user presses backspace in front
            // near the ==, unwind the flashcard.
            const active = document.activeElement;
            if (active === back && back.textContent === '') {
                // Merge: delete arrow and back, restore == to front
                e.preventDefault();
                const arrow = editor.querySelector('[data-role="arrow"]');
                const newText = front.textContent + ' ==';
                front.textContent = newText;
                arrow?.remove();
                back.remove();
                front.focus();
                setCaretPosition(front, newText.length);
                note.content = newText;
                return;
            }
        }
        // If a plain full span is empty, delete the note
        const full = editor.querySelector('[data-role="full"]');
        if (full && full.textContent === '' && document.activeElement === full) {
            e.preventDefault();
            deleteNote(note.id);
            return;
        }
    }

    if (e.key === 'Enter') {
        e.preventDefault();
        commitEditor(editor, note, li).then(async () => {
            const fresh = await db.notes.get(note.id);
            const newNote = await createNote({
                content: '',
                parentId: fresh.parentId || null,
                afterId: note.id
            });
            await render();
            noteEls.get(newNote.id)?.querySelector('.part')?.focus();
        });
        return;
    }

    if (e.key === 'Tab') {
        e.preventDefault();
        commitEditor(editor, note, li).then(async () => {
            if (e.shiftKey) await outdent(note.id);
            else await indent(note.id);
            await render();
            noteEls.get(note.id)?.querySelector('.part')?.focus();
        });
        return;
    }
}

async function commitEditor(editor, note, li) {
    if (!editor) return;
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