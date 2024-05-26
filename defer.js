SwipeListener(gameBoardElement, {
    minHorizontal: 20,
    minVertical: 20,
    preventScroll: true,
    lockAxis: true,
    mouse: false,
    touch: true,
});
gameBoardElement.addEventListener('swipe', (e) => {
    const directions = e.detail.directions;
    if (directions.top) {
        moveUp();
    }
    if (directions.bottom) {
        moveDown();
    }
    if (directions.left) {
        moveLeft();
    }
    if (directions.right) {
        moveRight();
    }
})