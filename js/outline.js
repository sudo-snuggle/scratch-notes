let flatNotes = [];
let draggedId = null;
const noteEls = new Map();

async function render() {
    const focusTarget = window.focusAfterRender || null;
    window.focusAfterRender = null;

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
        li.dataset.trailing = 'true';

        const bullet = document.createElement('span');
        bullet.className = 'bullet';
        bullet.textContent = '•';

        const editor = document.createElement('div');
        editor.className = 'note-editor';
        const fakeNote = { id: '__trailing__', depth: 0, content: '' };
        buildEditor(editor, fakeNote, li);

        li.append(bullet, editor);
        outline.appendChild(li);
    }

    // Restore focus after render
    if (focusTarget && noteEls.has(focusTarget.id)) {
        const editor = noteEls.get(focusTarget.id);
        const parts = editor.querySelectorAll('.part');
        const target = parts.length > 1 ? parts[1] : parts[0];
        if (target) {
            target.focus();
            const pos = focusTarget.caret ?? target.textContent.length;
            setCaretPosition(target, pos);
        }
    }
}