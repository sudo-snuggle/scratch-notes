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