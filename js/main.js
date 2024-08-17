'use strict';

const BOARD_ROW_COUNT = 4;
const BOARD_COLUMN_COUNT = 4;
const INITIAL_BLOCK_COUNT = 2;
const SPAWNED_BLOCKS = [Block.of(2), Block.of(4)];
const SPAWNED_WEIGHTS = [90, 10];

const BOARD_STATE_KEY = 'board';
const SCORE_STATE_KEY = 'score';

const scoreElement = document.getElementById('score');
const gameBoardElement = document.getElementById('game-board');
const gameOverElement = document.getElementById('game-over');
const supportDirectionButtons = document.getElementById('support-direction-buttons');

let score = 0;
let stopped = false;
const game = (() => {
    const board = new Board(BOARD_ROW_COUNT, BOARD_COLUMN_COUNT);
    const strategyFactory = new DefaultBoardTraversalStrategyFactory();
    const merger = new DefaultBlockMerger();
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
}

const renderGameBoard = () => {
    for (let i = gameBoardElement.rows.length - 1; i >= 0; i--) {
        gameBoardElement.deleteRow(i);
    }

    const board = game.getBoard();

    for (let i = 0; i < BOARD_ROW_COUNT; i++) {
        const rowElement = gameBoardElement.insertRow();
        for (let j = 0; j < BOARD_COLUMN_COUNT; j++) {
            const cellElement = rowElement.insertCell();
            const block = board.blockAt(i, j);
            const cellValue = block?.getValue();
            cellElement.innerHTML = cellValue ?? '';
        }
    }
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

        game.spawnBlockWeighted(SPAWNED_BLOCKS, SPAWNED_WEIGHTS);

        stopped = isGameOver();

        renderGame();
        saveStates();
    }
}
const moveUp = moveInDirection(Direction.UP);
const moveDown = moveInDirection(Direction.DOWN);
const moveLeft = moveInDirection(Direction.LEFT);
const moveRight = moveInDirection(Direction.RIGHT);

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
});

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