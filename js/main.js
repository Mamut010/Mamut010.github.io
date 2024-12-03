'use strict';

const BOARD_ROW_COUNT = 4;
const BOARD_COLUMN_COUNT = 4;
const INITIAL_BLOCK_COUNT = 2;
const SPAWNED_BLOCKS = [Block.of(2), Block.of(4)];
const SPAWNED_WEIGHTS = [90, 10];

const BOARD_STATE_KEY = 'board';
const SCORE_STATE_KEY = 'score';

const START_SCORE_COLOR = '#000000';
const START_SCORE_SHADOW_COLOR = '#FF9900';
const END_SCORE_COLOR = "#FFD700";
const END_SCORE_SHADOW_COLOR = "#F5493d";
const END_SCORE_SHADOW_OFFSET = 1;
const END_SCORE_SHADOW_BLUR = 3;
const MAX_SCORE_THRESHOLD = 12000;

const scoreElement = document.getElementById('score');
const gameBoardElement = document.getElementById('game-board');
const gameOverElement = document.getElementById('game-over');
const supportDirectionButtons = document.getElementById('support-direction-buttons');

let score = 0;
let stopped = false;

const hexToRgb = (hex) => {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
}

const interpolateColor = (startColor, endColor, factor) => {
    return {
      r: Math.round(startColor.r + (endColor.r - startColor.r) * factor),
      g: Math.round(startColor.g + (endColor.g - startColor.g) * factor),
      b: Math.round(startColor.b + (endColor.b - startColor.b) * factor),
    };
}

const rgbToCss = (rgb) => {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

const game = (() => {
    const board = new Board(BOARD_ROW_COUNT, BOARD_COLUMN_COUNT);
    const strategyFactory = new CachingBoardTraversalStrategyFactory();
    const merger = new IdenticalBlockMerger();
    const operation = new DefaultGameBoardOperation(merger);
    const game = new Game(board, strategyFactory, operation);
    game.setOnBlockMergedListener({
        onBlockMerged: (block1, block2, mergedBlock) => {
            score += mergedBlock.getValue();
        }
    });
    return game;
})();

const setState = (key, state) => {
    if (typeof state !== 'string') {
        state = JSON.stringify(state);
    }
    localStorage.setItem(key, state);
}

const getState = (key) => {
    return localStorage.getItem(key);
}

const saveStates = () => {
    setState(SCORE_STATE_KEY, score);
    setState(BOARD_STATE_KEY, game.getBoard().toJson());
}

const restoreStates = () => {
    score = Number(getState(SCORE_STATE_KEY) ?? '0');
    const savedBoardState = getState(BOARD_STATE_KEY);
    if (!savedBoardState) {
        return;
    }

    const savedBoard = Board.fromJson(savedBoardState);
    const board = game.getBoard();
    for (let i = 0; i < board.getRowCount(); i++) {
        for (let j = 0; j < board.getColumnCount(); j++) {
            const block = savedBoard.blockAt(i, j);
            board.setBlockAt(i, j, block);
        }
    }
}

const hasSavedStates = () => {
    return getState(SCORE_STATE_KEY) && getState(BOARD_STATE_KEY);
}

const renderScore = () => {
    scoreElement.innerHTML = score;

    const scorePercentage = Math.min(score / MAX_SCORE_THRESHOLD, 1);

    // Update text color
    const startColor = hexToRgb(START_SCORE_COLOR);
    const endColor = hexToRgb(END_SCORE_COLOR);
    const interpolatedColor = interpolateColor(startColor, endColor, scorePercentage);
    scoreElement.style.color = rgbToCss(interpolatedColor);

    // Update text shadow
    const shadowStartColor = hexToRgb(START_SCORE_SHADOW_COLOR);
    const shadowEndColor = hexToRgb(END_SCORE_SHADOW_COLOR);
    const interpolatedShadowColor = interpolateColor(shadowStartColor, shadowEndColor, scorePercentage);
    const blurRadius = (END_SCORE_SHADOW_BLUR * scorePercentage).toFixed(2);
    const offset = (END_SCORE_SHADOW_OFFSET * scorePercentage).toFixed(2);

    // Text shadow layers for border effect (multiple layers to create the border)
    const textShadow = `
        ${rgbToCss(interpolatedShadowColor)} -${offset}px -${offset}px ${blurRadius}px,
        ${rgbToCss(interpolatedShadowColor)} ${offset}px -${offset}px ${blurRadius}px,
        ${rgbToCss(interpolatedShadowColor)} -${offset}px ${offset}px ${blurRadius}px,
        ${rgbToCss(interpolatedShadowColor)} ${offset}px ${offset}px ${blurRadius}px
    `;
    scoreElement.style.textShadow = textShadow;
}

const renderGameBoard = () => {
    const board = game.getBoard();
    const cells = [];
    for (let i = 0; i < BOARD_ROW_COUNT; i++) {
        for (let j = 0; j < BOARD_COLUMN_COUNT; j++) {
            const cellElement = document.createElement('div');
            const block = board.blockAt(i, j);
            const cellValue = block?.getValue();
            cellElement.innerText = cellValue ?? '';
            cells.push(cellElement);
        }
    }
    gameBoardElement.replaceChildren(...cells);
}

const refreshGameOver = () => {
    if (stopped) {
        gameOverElement.style.visibility = 'visible';
    }
    else {
        gameOverElement.style.visibility = 'hidden';
    }
}

const renderGame = () => {
    renderScore();
    renderGameBoard();
    refreshGameOver();
}

const initGameBoard = () => {
    for (let i = 0; i < INITIAL_BLOCK_COUNT; i++) {
        game.spawnBlockWeighted(SPAWNED_BLOCKS, SPAWNED_WEIGHTS);
    }
}

const isGameOver = () => {
    if (stopped) {
        return true;
    }

    for (const direction of Object.values(Direction)) {
        if (game.tryMoveBlocks(direction)) {
            return false;
        }
    }
    return true;
}

const reset = () => {
    game.getBoard().clear();
    score = 0;
    stopped = false;
    initGameBoard();
    renderGame();
    saveStates();
}

const toggleDirectionButtons = () => {
    if (supportDirectionButtons.style.display === 'block') {
        supportDirectionButtons.style.display = 'none';
    }
    else {
        supportDirectionButtons.style.display = 'block';
    }
}

const moveInDirection = (direction) => {
    return () => {
        if (stopped || !game.moveBlocks(direction)) {
            return;
        }

        for (let i = 0; i < 10; i++) {
            game.spawnBlockWeighted(SPAWNED_BLOCKS, SPAWNED_WEIGHTS);
        }

        stopped = isGameOver();

        renderGame();
        saveStates();
    }
}
const moveUp = moveInDirection(Direction.UP);
const moveDown = moveInDirection(Direction.DOWN);
const moveLeft = moveInDirection(Direction.LEFT);
const moveRight = moveInDirection(Direction.RIGHT);

document.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'ArrowUp':
            e.preventDefault();
            moveUp();
            break;
        case 'ArrowDown':
            e.preventDefault();
            moveDown();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            moveLeft();
            break;
        case 'ArrowRight':
            e.preventDefault();
            moveRight();
            break;
    }
});

SwipeListener(gameBoardElement, {
    minHorizontal: 20,
    minVertical: 20,
    preventScroll: true,
    lockAxis: true,
    mouse: true,
    touch: true,
});
gameBoardElement.addEventListener('swipe', (e) => {
    const directions = e.detail.directions;
    if (directions.top) {
        e.preventDefault();
        moveUp();
    }
    if (directions.bottom) {
        e.preventDefault();
        moveDown();
    }
    if (directions.left) {
        e.preventDefault();
        moveLeft();
    }
    if (directions.right) {
        e.preventDefault();
        moveRight();
    }
});

document.getElementById('reset-button')?.addEventListener('click', reset);
document.getElementById('toggle-direction-button')?.addEventListener('click', toggleDirectionButtons);

const start = () => {
    if (!hasSavedStates()) {
        initGameBoard();
    }
    else {
        restoreStates();
        stopped = isGameOver();
    }
    renderGame();
};
start();