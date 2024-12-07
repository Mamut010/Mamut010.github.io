'use strict';

const BOARD_ROW_COUNT = 4;
const BOARD_COLUMN_COUNT = 4;
const INITIAL_BLOCK_COUNT = 2;
const SPAWNED_BLOCKS = [Block.of(2), Block.of(4)];
const SPAWNED_WEIGHTS = [90, 10];

const BOARD_STATE_KEY = 'board';
const SCORE_STATE_KEY = 'score';
const MERGEDS_STATE_KEY = 'mergeds';
const SPAWNED_STATE_KEY = 'spawned';
const AUDIO_STATE_KEY = 'audio';

const START_SCORE_COLOR = '#000000';
const START_SCORE_SHADOW_COLOR = '#FF9900';
const END_SCORE_COLOR = "#FFD700";
const END_SCORE_SHADOW_COLOR = "#F5493d";
const END_SCORE_SHADOW_OFFSET = 1;
const END_SCORE_SHADOW_BLUR = 3;
const MAX_SCORE_THRESHOLD = 20000;
const MAX_VALUE_STYLE = 1 << 17;

const scoreElement = document.getElementById('score');
const scoreIncreaseElement = document.getElementById("score-increase");
const gameBoardElement = document.getElementById('game-board');
const gameOverModalBoxElement = document.getElementById('game-over-modal-box');
const gameOverModelOverlay = document.getElementById('game-over-modal-overlay');
const supportDirectionButtons = document.getElementById('support-direction-buttons');
const muteButton = document.getElementById('mute-button');
const volumeSlider = document.getElementById('volume-slider');
const volumeTooltip = document.getElementById('volume-tooltip');

let score = 0;
let stopped = false;
let rendering = false;
/**
 * @type {Point[]}
 */
const mergedPoints = [];
/**
 * @type {Point|undefined}
 */
let spawnedPoint;

const createBgm = (sources) => new AudioPlayer()
    .setSources((sources ?? []).map(src => `audio\\background\\${src}`))
    .setShuffle(true)
    .setVolume(0.5)
    .setMuted(true)
    .setLooping(true);

const createSfx = (sources) => new AudioPlayer()
    .setSources((sources ?? []).map(src => `audio\\sfx\\${src}`))
    .setVolume(0.5)
    .setShuffle(true);

const backgroundMusic = createBgm(AudioSources.background);
const gameOverSfx = createSfx(AudioSources.gameOver);

const game = (() => {
    const board = new Board(BOARD_ROW_COUNT, BOARD_COLUMN_COUNT);
    const strategyFactory = new CachingBoardTraversalStrategyFactory();
    const merger = new IdenticalBlockMerger();
    const operation = new GameBoardOperation(merger);
    const game = new Game(board, strategyFactory, operation);
    game.setOnBlockMergedListener({
        onBlockMerged: (mergedBlock) => score += mergedBlock.getValue()
    });
    return game;
})();

const cellManager = new CellManager(game, gameBoardElement, (cell, value) => addValueStyle(cell, value));

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

const saveGameStates = () => {
    setState(SCORE_STATE_KEY, score);
    setState(BOARD_STATE_KEY, game.getBoard().toJson());
    setState(MERGEDS_STATE_KEY, mergedPoints.map(point => point.toString()));
    setState(SPAWNED_STATE_KEY, spawnedPoint?.toString());
}

const saveAudioStates = () => {
    setState(AUDIO_STATE_KEY, {volume: backgroundMusic.getVolume(), muted: backgroundMusic.isMuted()});
}

const restoreGameStates = () => {
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

const restoreAudioStates = () => {
    const savedAudioState = getState(AUDIO_STATE_KEY);
    if (!savedAudioState) {
        return;
    }

    const audioState = JSON.parse(savedAudioState);
    backgroundMusic.setVolume(audioState.volume);
    backgroundMusic.setMuted(audioState.muted);
}

const hasGameSavedStates = () => {
    const importantKeys = [BOARD_STATE_KEY];
    return importantKeys.every(key => getState(key) !== null);
}

/**
 * 
 * @param {boolean} showIncrease 
 * @returns 
 */
const renderScore = (showIncrease = true) => {
    const oldScore = parseInt(scoreElement.innerText);
    if (oldScore === score) {
        return;
    }

    scoreElement.innerText = score;
    adjustScoreColor();

    if (showIncrease) {
        showScoreIncrease(score - oldScore);
    }
}

/**
 * @param {number} amount
 */
function showScoreIncrease(amount) {
    const text = amount >= 0 ? `+${amount}` : `-${amount}`; 
    scoreIncreaseElement.textContent = text;
    scoreIncreaseElement.classList.add('animate');

    scoreIncreaseElement.addEventListener('animationend', () => {
        scoreIncreaseElement.classList.remove('animate');
    }, { once: true });
}

function adjustScoreColor() {
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
 * @returns {Promise<void>}
 */
const renderInitialGameBoard = () => {
    rendering = true;

    return new Promise((resolve, reject) => {
        try {
            const occupieds = game.getBoard().getOccupiedSlots();
            if (occupieds.length === 0) {
                rendering = false;
                resolve();
                return;
            }

            let remaining = occupieds.length;
            let awaiting = false;

            for (const point of occupieds) {
                const cell = cellManager.create(point);
                if (!cell) {
                    remaining--;
                    return;
                }

                awaiting = true;
        
                /**
                 * @param {AnimationEvent} evt 
                 */
                const onAnimationEnd = (evt) => {
                    if (evt.animationName !== 'fade-in') {
                        return;
                    }

                    cell.removeEventListener('animationend', onAnimationEnd);
                    cell.classList.remove('new-game');

                    remaining--;
                    if (remaining !== 0) {
                        return;
                    }

                    rendering = false;
                    resolve();
                }
        
                cell.classList.add('new-game');
                cell.addEventListener('animationend', onAnimationEnd);
            }
        
            mergedPoints.forEach(point => cellManager.get(point)?.classList.add('merged'));
            if (spawnedPoint) {
                cellManager.get(spawnedPoint)?.classList.add('spawned');
            }
        
            if (!awaiting) {
                rendering = false;
                resolve();
            }
        }
        catch (err) {
            reject(err);
        }
    });
}

/**
 * @param {Map<Point, BlockMove>} moves 
 * @param {Point} spawned
 * @param {Promise<void>}
 */
const renderGame = async (moves, spawned) => {
    rendering = true;

    await renderGameBoard(moves, spawned, () => renderScore(true));

    refreshGameOver();
    if (stopped) {
        gameOverSfx.play();
    }
    
    rendering = false;
}

const removeTemporaryVisuals = () => {
    mergedPoints.forEach(point => cellManager.get(point)?.classList.remove('merged'));
    mergedPoints.length = 0;
    if (spawnedPoint) {
        cellManager.get(spawnedPoint)?.classList.remove('spawned');
    }
}

/**
 * @param {Map<Point, BlockMove>} moves 
 * @param {Point} spawned
 * @param {(() => Promise<void>|void) | undefined} onMergeEnd
 * @returns {Promise<void>}
 */
const renderGameBoard = (moves, spawned, onMergeEnd = undefined) => {
    return new Promise((resolve, reject) => {
        try {
            /**
             * @type {{cell: HTMLElement, cleanUp: (() => void) | undefined, newValue: number}[]}
             */
            const mergeds = [];

            let remaining = moves.size;
            let awaiting = false;

            for (const move of moves.values()) {
                const from = move.from;
                const to = move.to;
                const cell = cellManager.get(from);
                if (!cell) {
                    remaining--;
                    continue;
                }

                awaiting = true;

                /**
                 * @param {TransitionEvent} evt
                 */
                const onTransitionEnd = async (evt) => {
                    if (evt.propertyName !== 'left' && evt.propertyName !== 'top') {
                        return;
                    }

                    cell.removeEventListener('transitionend', onTransitionEnd);

                    remaining--;
                    if (remaining !== 0) {
                        return;
                    }

                    await handleMergedCells(mergeds);
                    await onMergeEnd?.();
                    await spawnNewCell(spawned);
                    resolve();
                }

                cell.addEventListener('transitionend', onTransitionEnd);

                const cleanUp = cellManager.move(from, to);

                if (move.merged) {
                    mergeds.push({
                        cell,
                        cleanUp,
                        newValue: game.blockAt(to)?.getValue(),
                    });
                    mergedPoints.push(to);
                }
            }

            if (!awaiting) {
                resolve();
            }
        }
        catch (err)  {
            reject(err);
        }
    });
}

/**
 * @param {{cell: HTMLElement, cleanUp: (() => void) | undefined, newValue: number}[]} mergeds
 * @returns {Promise<void>}
 */
const handleMergedCells = (mergeds) => {
    return new Promise((resolve, reject) => {
        try {
            if (mergeds.length === 0) {
                resolve();
                return;
            }
        
            let remaining = mergeds.length;
        
            mergeds.forEach(({ cell, cleanUp, newValue }) => {
                /**
                 * @param {AnimationEvent} evt 
                 */
                const onAnimationEnd = (evt) => {
                    if (evt.animationName !== 'bounce-merged-block') {
                        return;
                    }
        
                    cell.removeEventListener('animationend', onAnimationEnd);
                    cell.classList.remove('bounce-merged');
                    cell.classList.add('merged');
                    addValueStyle(cell, newValue);
        
                    remaining--;
                    if (remaining === 0) {
                        resolve();
                    }
                }
        
                cleanUp?.();
                cell.classList.add('bounce-merged');
                cell.addEventListener('animationend', onAnimationEnd);
            });
        }
        catch (err) {
            reject(err);
        }
    });
}

/**
 * @param {Point} spawned
 * @returns {Promise<void>}
 */
const spawnNewCell = (spawned) => {
    return new Promise((resolve, reject) => {
        try {
            const spawnedCell = cellManager.create(spawned);
            if (!spawnedCell) {
                resolve();
                return;
            }
            
            /**
             * @param {AnimationEvent} evt 
             */
            const onAnimationEnd = (evt) => {
                if (evt.animationName === 'fade-in') {
                    spawnedCell.removeEventListener('animationend', onAnimationEnd);
                    resolve();
                }
            }

            spawnedCell.classList.add('spawned');
            spawnedCell.addEventListener('animationend', onAnimationEnd);
        }
        catch (err) {
            reject(err);
        }
    });
}

const refreshGameOver = () => {
    if (stopped) {
        openGameOverModal();
    }
    else {
        closeGameOverModal();
    }
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
    cellManager.clear();
}

const reset = async () => {
    resetStates();
    initGameBoard();
    stopped = isGameOver();

    renderScore(false);
    await renderInitialGameBoard();
    refreshGameOver();
    saveGameStates();
}

const toggleDirectionButtons = () => {
    if (supportDirectionButtons.style.display === 'block') {
        supportDirectionButtons.style.display = 'none';
    }
    else {
        supportDirectionButtons.style.display = 'block';
    }
}

/**
 * @param {Direction[keyof typeof Direction]} direction
 */
const moveInDirection = (direction) => {
    return async () => {
        if (rendering || stopped) {
            return;
        }

        const moves = game.moveBlocks(direction);
        if (moves.size === 0) {
            return;
        }

        const spawned = game.spawnBlockWeighted(SPAWNED_BLOCKS, SPAWNED_WEIGHTS);

        removeTemporaryVisuals();

        spawnedPoint = spawned;
        stopped = isGameOver();

        await renderGame(moves, spawned);
        saveGameStates();
    }
}
const moveUp = moveInDirection(Direction.UP);
const moveDown = moveInDirection(Direction.DOWN);
const moveLeft = moveInDirection(Direction.LEFT);
const moveRight = moveInDirection(Direction.RIGHT);

const startGame = async () => {
    if (!hasGameSavedStates()) {
        initGameBoard();
    }
    else {
        restoreGameStates();
    }

    stopped = isGameOver();
    
    renderScore(false);
    await renderInitialGameBoard();
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

function getVolumePercentage() {
    return Math.round(backgroundMusic.getVolume() * 100);
}

/**
 * @param {number|undefined} percentage 
 */
function updateSliderBackground(percentage = undefined) {
    percentage ??= getVolumePercentage();
    let background;
    if (backgroundMusic.isFadingOut()) {
        background = `linear-gradient(to right, rgba(85, 85, 85, 0.2) ${percentage}%, rgba(221, 221, 221, 0.2) ${percentage}%)`;
    }
    else {
        background = `linear-gradient(to right, #555 ${percentage}%, #ddd ${percentage}%)`;
    }
    volumeSlider.style.background = background;
}

function updateAudioProgress() {
    const percentage = getVolumePercentage();
    volumeSlider.value = backgroundMusic.isMuted() ? 0 : percentage;
    updateSliderBackground(percentage);
    volumeTooltip.textContent = `${percentage}%`;
    volumeTooltip.style.left = `${percentage}%`;
    muteButton.textContent = backgroundMusic.isMuted() ? '🔇' : '🔊';
}

const initUi = () => {
    const initialPopUpMessage = document.getElementById('initial-pop-up-message');
    if (initialPopUpMessage) {
        initialPopUpMessage.textContent = 'Click anywhere to play';
    }
    
    cellManager.initBaseCells();
    updateAudioProgress();
}

const initListeners = () => {
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

    const initialPopUpElement = document.getElementById('initial-pop-up');
    initialPopUpElement?.addEventListener('click', (e) => {
        backgroundMusic.play();
        initialPopUpElement.remove();
    });

    document.getElementById('next-bgm-button')?.addEventListener('click', () => {
        if (backgroundMusic.isFadingOut()) {
            return;
        }

        backgroundMusic.addEventListener('stop', () => {
            backgroundMusic.play();
            volumeSlider.disabled = false;
            volumeSlider.style.cursor = 'pointer';
            updateSliderBackground();
        }, { once: true });

        backgroundMusic.stopFadeOut();

        volumeSlider.disabled = true;
        volumeSlider.style.cursor = 'not-allowed';
        updateSliderBackground();
    });

    muteButton.addEventListener('click', () => {
        backgroundMusic.toggleMuted();
        updateAudioProgress();
        saveAudioStates();
    });

    volumeSlider.addEventListener('input', () => {
        backgroundMusic.setVolume(volumeSlider.value / 100);
        backgroundMusic.setMuted(volumeSlider.value == 0);
        updateAudioProgress();
        saveAudioStates();
    });

    volumeSlider.addEventListener("mousemove", (event) => {
        const sliderRect = volumeSlider.getBoundingClientRect();
        const tooltipX = ((event.clientX - sliderRect.left) / sliderRect.width) * 100; // Tooltip position in %
        volumeTooltip.style.left = `${tooltipX}%`; // Dynamically position tooltip
    });
}

restoreAudioStates();
requestAnimationFrame(() => {
    initUi();
    initListeners();
    startGame();
});