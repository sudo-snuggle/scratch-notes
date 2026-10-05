function directionSymbol(dir) {
    if (dir === 'backward') return '←';
    if (dir === 'both') return '↔';
    return '→';
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