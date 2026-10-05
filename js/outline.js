let flatNotes = [];
let draggedId = null;
const noteEls = new Map();

async function render() {
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

        editor.addEventListener('blur', async () => {
            setTimeout(async () => {
                const text = collectContent(editor).trim();
                if (!text) return;
                await createNote({
                    content: collectContent(editor),
                    parentId: null,
                    afterId: flatNotes[flatNotes.length - 1]?.id
                });
                await render();
            }, 160);
        });

        li.append(bullet, editor);
        outline.appendChild(li);
    }
}

