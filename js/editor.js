function directionSymbol(dir) {
    if (dir === 'backward') return '←';
    if (dir === 'both') return '↔';
    return '→';
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
        span.dataset.placeholder = note.depth === 0 ? 'Type a note…' : '';
        attachEditorEvents(span, note, li, editor);
        editor.appendChild(span);
        if (!note.content) li.classList.add('empty');
    } else {
        const front = document.createElement('span');
        front.className = 'part';
        front.contentEditable = 'true';
        front.textContent = parsed.front;
        front.dataset.role = 'front';
        front.dataset.placeholder = 'Front';
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
        back.dataset.placeholder = 'Back';
        attachEditorEvents(back, note, li, editor);

        editor.append(front, arrow, back);
    }
}

function attachEditorEvents(span, note, li, editor) {
    span.addEventListener('focus', () => {
        li.classList.remove('empty');
    });

    span.addEventListener('input', () => {
        li.classList.toggle('empty', editor.textContent.trim() === '');
    });

    span.addEventListener('keydown', (e) => {
        // Transform to flashcard only when user presses space after ==
        // or presses Enter / Tab / blurs. This prevents rebuilding
        // the DOM on every keystroke and losing the caret.
        if (e.key === ' ' && span.dataset.role === 'full') {
            const text = span.textContent;
            if (text.includes('==')) {
                e.preventDefault();
                // Insert the space, then transform
                const caretAt = getCaretPosition(span);
                const before = text.slice(0, caretAt);
                const after = text.slice(caretAt);
                span.textContent = before + ' ' + after;
                note.content = span.textContent;
                const newContent = span.textContent;
                buildEditor(editor, { ...note, content: newContent }, li);
                const backSpan = editor.querySelector('[data-role="back"]');
                if (backSpan) {
                    backSpan.focus();
                    setCaretPosition(backSpan, Math.max(0, caretAt - newContent.indexOf('==') - 2 + 1));
                }
                return;
            }
        }

        handleKey(e, note, span);
    });

    span.addEventListener('blur', async () => {
        setTimeout(async () => {
            if (document.activeElement?.closest('.note-editor') === editor) return;
            await commitEditor(editor, note, li);
        }, 120);
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
    let done = false;
    const walk = (node) => {
        if (done) return true;
        if (node.nodeType === 3) {
            if (charCount + node.length >= pos) {
                range.setStart(node, pos - charCount);
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