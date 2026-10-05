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
        editor.addEventListener('mousedown', (e) => {
            if (e.target === editor) {
                const parts = editor.querySelectorAll('.part');
                const last = parts[parts.length - 1];
                if (last) {
                    e.preventDefault();
                    last.focus();
                    setCaretPosition(last, last.textContent.length);
                }
            }
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

function collectContent(editor) {
    const front = editor.querySelector('[data-role="front"]');
    const back = editor.querySelector('[data-role="back"]');
    const full = editor.querySelector('[data-role="full"]');
    if (full) return full.textContent;
    if (front && back) return `${front.textContent} == ${back.textContent}`;
    return '';
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