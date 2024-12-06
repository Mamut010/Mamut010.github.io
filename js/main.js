'use strict';

const BOARD_ROW_COUNT = 1;
const BOARD_COLUMN_COUNT = 4;
const INITIAL_BLOCK_COUNT = 2;
const SPAWNED_BLOCKS = [Block.of(2), Block.of(4)];
const SPAWNED_WEIGHTS = [90, 10];

const BOARD_STATE_KEY = 'board';
const SCORE_STATE_KEY = 'score';
const MERGEDS_STATE_KEY = 'mergeds';
const SPAWNED_STATE_KEY = 'spawned';

const BLOCK_TRANSITION_TIME_MS = 200;
const START_SCORE_COLOR = '#000000';
const START_SCORE_SHADOW_COLOR = '#FF9900';
const END_SCORE_COLOR = "#FFD700";
const END_SCORE_SHADOW_COLOR = "#F5493d";
const END_SCORE_SHADOW_OFFSET = 1;
const END_SCORE_SHADOW_BLUR = 3;
const MAX_SCORE_THRESHOLD = 20000;
const MAX_VALUE_STYLE = 1 << 17;

const scoreElement = document.getElementById('score');
const gameBoardElement = document.getElementById('game-board');
const gameOverModalBoxElement = document.getElementById('game-over-modal-box');
const gameOverModelOverlay = document.getElementById('game-over-modal-overlay');
const supportDirectionButtons = document.getElementById('support-direction-buttons');

let score = 0;
let stopped = false;
let rendering = false;

/**
 * @type {Map<Point, {x: number, y: number, w: number, h: number}>}
 */
const boundingRects = new Map();
/**
 * @type {Map<Point, HTMLElement>}
 */
const emptyCells = new Map();
/**
 * @type {Map<Point, HTMLElement>}
 */
const movingCells = new Map();
/**
 * @type {Point[]}
 */
const mergedPoints = [];
/**
 * @type {Point|undefined}
 */
let spawnedPoint;

const game = (() => {
    const board = new Board(BOARD_ROW_COUNT, BOARD_COLUMN_COUNT);
    const strategyFactory = new CachingBoardTraversalStrategyFactory();
    const merger = new IdenticalBlockMerger();
    const operation = new GameBoardOperation(merger);
    const game = new Game(board, strategyFactory, operation);
    game.setOnBlockMergedListener({
        onBlockMerged: (block1, block2, mergedBlock) => {
            score += mergedBlock.getValue();
        }
    });
    return game;
})();

const createEmptyCells = () => {
    const board = game.getBoard();
    for (let i = 0; i < board.getRowCount(); i++) {
        for (let j = 0; j < board.getColumnCount(); j++) {
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('game-block-empty');

            gameBoardElement.appendChild(emptyCell);
            emptyCells.set(Point.of(i, j), emptyCell);
        }
    }
}

const readBoundingRects = () => {
    boundingRects.clear();

    for (const [point, cell] of emptyCells.entries()) {
        const x = cell.offsetLeft;
        const y = cell.offsetTop;
        const w = cell.offsetWidth;
        const h = cell.offsetHeight;
        boundingRects.set(point, {x, y, w, h});
    }
}

const setState = (key, state) => {
    if (typeof state === 'undefined' || (Array.isArray(state) && state.length === 0)) {
        localStorage.removeItem(key);
        return;
    }

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
    setState(MERGEDS_STATE_KEY, mergedPoints.map(point => point.toString()));
    setState(SPAWNED_STATE_KEY, spawnedPoint?.toString());
}

const restoreStates = () => {
    score = Number(getState(SCORE_STATE_KEY) ?? '0');

    const savedBoardState = getState(BOARD_STATE_KEY);
    if (savedBoardState) {
        const savedBoard = Board.fromJson(savedBoardState);
        const board = game.getBoard();
        for (let i = 0; i < board.getRowCount(); i++) {
            for (let j = 0; j < board.getColumnCount(); j++) {
                const block = savedBoard.blockAt(i, j);
                board.setBlockAt(i, j, block);
            }
        }
    }

    const savedMergedsState = getState(MERGEDS_STATE_KEY);
    if (savedMergedsState) {
        const savedMergeds = JSON.parse(savedMergedsState);
        mergedPoints.push(...savedMergeds.map(str => Point.parse(str)));
    }

    const savedSpawnedState = getState(SPAWNED_STATE_KEY);
    if (savedSpawnedState) {
        spawnedPoint = Point.parse(savedSpawnedState);
    }
}

const hasSavedStates = () => {
    const importantKeys = [BOARD_STATE_KEY];
    return importantKeys.every(key => getState(key) !== null);
}

const renderScore = () => {
    rendering = true;
    const oldScore = parseInt(scoreElement.innerText);
    if (oldScore === score) {
        rendering = false;
        return;
    }

    scoreElement.innerText = score;

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
    rendering = false;
}

/**
 * @param {HTMLElement} cell 
 * @param {number} value 
 */
const addValueStyle = (cell, value) => {
    cell.innerText = value;

    if (value <= MAX_VALUE_STYLE) {
        cell.dataset.value = value;
    }
    else {
        cell.dataset.value = MAX_VALUE_STYLE;

        cell.style.fontSize = '';
        const lengthDiff = value.toString().length - MAX_VALUE_STYLE.toString().length;
        const scalingFactor = 1.15 ** lengthDiff;
        const style = getComputedStyle(cell);
        const maxValueFontSize = parseFloat(style.fontSize);
        const newFontSize = Math.max(maxValueFontSize / scalingFactor, 12);
        cell.style.fontSize = `${newFontSize.toFixed(2)}px`;
    }
}

/**
 * @param {Point} point
 * @param {boolean} spawned
 * @return {HTMLElement}
 */
const createNewMovingCell = (point, spawned = false) => {
    const cell = document.createElement('div');
    cell.classList.add('game-block');

    const rect = boundingRects.get(point);
    movingCells.set(point, cell);
    cell.style.left = `${rect.x}px`;
    cell.style.top = `${rect.y}px`;
    cell.style.width = `${rect.w}px`;
    cell.style.height = `${rect.h}px`;

    gameBoardElement.appendChild(cell);

    const value = game.blockAt(point)?.getValue();
    if (value) {
        addValueStyle(cell, value);
    }

    return cell;
}

const removeMovingCells = () => {
    for (const cell of movingCells.values()) {
        cell.remove();
    }
    movingCells.clear();
}

const renderInitialGameBoard = () => {
    rendering = true;
    for (const point of game.getBoard().getOccupiedSlots()) {
        createNewMovingCell(point);
    }
    mergedPoints.forEach(point => movingCells.get(point)?.classList.add('merged'));
    if (spawnedPoint) {
        movingCells.get(spawnedPoint)?.classList.add('spawned');
    }
    rendering = false;
}

const removeTemporaryVisuals = () => {
    mergedPoints.forEach(point => movingCells.get(point)?.classList.remove('merged'));
    mergedPoints.length = 0;
    if (spawnedPoint) {
        movingCells.get(spawnedPoint)?.classList.remove('spawned');
    }
}

/**
 * @param {Map<Point, BlockMove>} moves 
 * @param {Point} spawned
 * @param {() => void} onRendered
 */
const renderGameBoard = (moves, spawned, onRendered) => {
    rendering = true;
    removeTemporaryVisuals();

    /**
     * @type {{fromCell: HTMLElement, toCell: HTMLElement, replacedValue: number}[]}
     */
    const mergeds = [];

    for (const move of moves.values()) {
        const from = move.from();
        const to = move.to();

        const cell = movingCells.get(from);
        const newPosition = boundingRects.get(to);

        cell.style.left = `${newPosition.x}px`;
        cell.style.top = `${newPosition.y}px`;

        if (move.isMerged()) {
            mergeds.push({
                fromCell: cell,
                toCell: movingCells.get(to),
                replacedValue: game.blockAt(to)?.getValue(),
            });
            mergedPoints.push(to);
        }

        movingCells.delete(from);
        movingCells.set(to, cell);
    }

    spawnedPoint = spawned;
    setTimeout(() => {
        mergeds.forEach(e => {
            e.toCell.style.transform = 'none';
            e.toCell.remove();
            addValueStyle(e.fromCell, e.replacedValue);
            e.fromCell.classList.add('merged');
        });

        const spawnedCell = createNewMovingCell(spawned);
        spawnedCell.classList.add('spawned');

        onRendered();
        rendering = false;
    }, BLOCK_TRANSITION_TIME_MS);
}

const refreshGameOver = () => {
    if (stopped) {
        openGameOverModal();
    }
    else {
        closeGameOverModal();
    }
}

/**
 * @param {Map<Point, BlockMove>} moves 
 * @param {Point} spawned
 */
const renderGame = (moves, spawned) => {
    renderScore();
    renderGameBoard(moves, spawned, () => {
        refreshGameOver();
        if (stopped) {
            gameOverSfx.play();
        }
    });
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

const resetStates = () => {
    game.clearBoard();
    score = 0;
    stopped = false;
    mergedPoints.length = 0;
    spawnedPoint = undefined;
    removeMovingCells();
}

const reset = () => {
    resetStates();
    initGameBoard();
    stopped = isGameOver();
    renderInitialGameBoard();
    refreshGameOver();
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
        if (rendering || stopped) {
            return;
        }

        const moves = game.moveBlocks(direction);
        if (moves.size === 0) {
            return;
        }

        const spawned = game.spawnBlockWeighted(SPAWNED_BLOCKS, SPAWNED_WEIGHTS);

        stopped = isGameOver();
        renderGame(moves, spawned);
        saveStates();
    }
}
const moveUp = moveInDirection(Direction.UP);
const moveDown = moveInDirection(Direction.DOWN);
const moveLeft = moveInDirection(Direction.LEFT);
const moveRight = moveInDirection(Direction.RIGHT);

const startGame = () => {
    if (!hasSavedStates()) {
        initGameBoard();
    }
    else {
        restoreStates();
    }

    stopped = isGameOver();
    renderScore();
    renderInitialGameBoard();
    refreshGameOver();
};

function openGameOverModal() {
    gameOverModalBoxElement.classList.add('show');
    gameOverModelOverlay.classList.add('show');
}
  
function closeGameOverModal() {
    gameOverModalBoxElement.classList.remove('show');
    gameOverModelOverlay.classList.remove('show');
}

const handleResize = () => {
    readBoundingRects();
    for (const [point, cell] of movingCells.entries()) {
        const rect = boundingRects.get(point);
        cell.style.left = `${rect.x}px`;
        cell.style.top = `${rect.y}px`;
        cell.style.width = `${rect.w}px`;
        cell.style.height = `${rect.h}px`;
        addValueStyle(cell, game.blockAt(point)?.getValue() ?? 0);
    }
};

const createBgm = (sources) => new AudioHandler()
    .setSources((sources ?? []).map(src => `audio\\background\\${src}`))
    .setShuffle(true)
    .setLooping(true);

const createSfx = (sources) => new AudioHandler()
    .setSources((sources ?? []).map(src => `audio\\sfx\\${src}`))
    .setShuffle(true);

const backgroundMusic = createBgm(AudioSources.background);
const gameOverSfx = createSfx(AudioSources.gameOver);

const bindListeners = () => {
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
        mouse: false,
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
    document.getElementById('initial-pop-up')?.addEventListener('click', (e) => {
        backgroundMusic.play();
        if (e.target instanceof Element) {
            e.target.remove();
        }
    });
    document.getElementById('next-bgm-button')?.addEventListener('click', () => backgroundMusic.playNext());
}

const initUi = () => {
    createEmptyCells();
    readBoundingRects();
}

const initListeners = () => {
    const gameBoardResizeObserver = new ResizeObserver((entries) => {
        entries.forEach(_ => handleResize());
    });
    gameBoardResizeObserver.observe(gameBoardElement);

    bindListeners();
}

initUi();
initListeners();
startGame();