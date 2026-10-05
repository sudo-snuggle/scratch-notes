function parseFlashcard(content) {
    if (!content) return null;
    const idx = content.indexOf('==');
    if (idx === -1) return null;
    return {
        front: content.slice(0, idx).trim(),
        back: content.slice(idx + 2).trim()
    };
}