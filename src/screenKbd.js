/*
#sh.. integrate this.
should keyrepeat functionality be here/in key ?
but we'd need to reuse repeat

should unify key handling, bool up down
and handle maximize down by flipping fractionscale + autoscale
*/

export const kbdWidth = 200, kbdHeight = 200;

const touchKeyMap = new Map(); // Map<touch.identifier, Element>
let handleKey = null;

function getKeyAtPoint(x, y) {
    return document.elementFromPoint(x, y)?.closest('.key');
}

function activateKey(key) {
    if (key && !key.classList.contains('active')) {
        key.classList.add('active');
        if (handleKey) {
            handleKey(true, key.dataset.key);
        }
    }
}

function deactivateKey(key) {
    if (key && key.classList.contains('active')) {
        key.classList.remove('active');
        if (handleKey) {
            handleKey(false, key.dataset.key);
        }
    }
}

// Handle touch start
function handleTouchStart(e) {
    e.preventDefault();
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
        const touch = touches[i];
        const key = getKeyAtPoint(touch.clientX, touch.clientY);
        if (key) {
            touchKeyMap.set(touch.identifier, key);
            activateKey(key);
        }
    }
}

// Handle touch move
function handleTouchMove(e) {
    e.preventDefault();
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
        const touch = touches[i];
        const currentKey = getKeyAtPoint(touch.clientX, touch.clientY);
        const previousKey = touchKeyMap.get(touch.identifier);

        // If the touch moved to a new key
        if (currentKey !== previousKey) {
            // Deactivate the previous key
            deactivateKey(previousKey);
            // Activate the new key
            if (currentKey) {
                activateKey(currentKey);
                touchKeyMap.set(touch.identifier, currentKey);
            } else {
                touchKeyMap.delete(touch.identifier);
            }
        }
    }
}

// Handle touch end or cancel
function handleTouchEnd(e) {
    e.preventDefault();
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
        const touch = touches[i];
        const key = touchKeyMap.get(touch.identifier);
        if (key) {
            deactivateKey(key);
            touchKeyMap.delete(touch.identifier);
        }
    }
}

// Handle mouse/pointer events for desktop
let mouseKey = null;

function handleMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const key = getKeyAtPoint(e.clientX, e.clientY);
    if (key) {
        mouseKey = key;
        activateKey(key);
    }
}

function handleMouseMove(e) {
    if (!mouseKey) return;
    e.preventDefault();
    e.stopPropagation();
    const currentKey = getKeyAtPoint(e.clientX, e.clientY);
    if (currentKey !== mouseKey) {
        deactivateKey(mouseKey);
        if (currentKey) {
            activateKey(currentKey);
            mouseKey = currentKey;
        } else {
            mouseKey = null;
        }
    }
}

function handleMouseUp(e) {
    if (mouseKey) {
        e.preventDefault();
        e.stopPropagation();
        deactivateKey(mouseKey);
        mouseKey = null;
    }
}

// Handle pointer events (works for both touch and mouse)
let pointerKeyMap = new Map(); // Map<pointerId, Element>

function handlePointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const key = getKeyAtPoint(e.clientX, e.clientY);
    if (key) {
        pointerKeyMap.set(e.pointerId, key);
        activateKey(key);
    }
}

function handlePointerMove(e) {
    if (!pointerKeyMap.has(e.pointerId)) return;
    e.preventDefault();
    e.stopPropagation();
    const currentKey = getKeyAtPoint(e.clientX, e.clientY);
    const previousKey = pointerKeyMap.get(e.pointerId);
    if (currentKey !== previousKey) {
        deactivateKey(previousKey);
        if (currentKey) {
            activateKey(currentKey);
            pointerKeyMap.set(e.pointerId, currentKey);
        } else {
            pointerKeyMap.delete(e.pointerId);
        }
    }
}

function handlePointerUp(e) {
    if (pointerKeyMap.has(e.pointerId)) {
        e.preventDefault();
        e.stopPropagation();
        const key = pointerKeyMap.get(e.pointerId);
        deactivateKey(key);
        pointerKeyMap.delete(e.pointerId);
    }
}

export function initKbdListeners() {
    // Add touch event listeners to keypad areas (for mobile)
    const keypads = document.querySelectorAll('.keypad-part');
    keypads.forEach(keypad => {
        // Touch events (mobile)
        keypad.addEventListener('touchstart', handleTouchStart, { passive: false });
        keypad.addEventListener('touchmove', handleTouchMove, { passive: false });
        keypad.addEventListener('touchend', handleTouchEnd, { passive: false });
        keypad.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        
        // Mouse events (desktop)
        keypad.addEventListener('mousedown', handleMouseDown);
        keypad.addEventListener('mousemove', handleMouseMove);
        keypad.addEventListener('mouseup', handleMouseUp);
        keypad.addEventListener('mouseleave', handleMouseUp);
        
        // Pointer events (works for both touch and mouse)
        keypad.addEventListener('pointerdown', handlePointerDown);
        keypad.addEventListener('pointermove', handlePointerMove);
        keypad.addEventListener('pointerup', handlePointerUp);
        keypad.addEventListener('pointercancel', handlePointerUp);
    });
    
    // Also handle mouse events on document level to catch mouse up outside keypad
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('pointerup', handlePointerUp);
}

export function setKbdHandler(handler) {
    handleKey = handler;
}
