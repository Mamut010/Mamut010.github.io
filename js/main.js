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

const initialPopUpMessage = document.getElementById('initial-pop-up-message');
const scoreElement = document.getElementById('score');
const gameBoardElement = document.getElementById('game-board');
const gameOverModalBoxElement = document.getElementById('game-over-modal-box');
const gameOverModelOverlay = document.getElementById('game-over-modal-overlay');
const supportDirectionButtons = document.getElementById('support-direction-buttons');
const muteButton = document.getElementById('mute-button');
const volumeSlider = document.getElementById('volume-slider');
const volumeTooltip = document.getElementById('volume-tooltip');

let score = 0;
let stopped = false;

/**
 * @type {Set<Point>}
 */
const mergedPoints = new Set();
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

const cellManager = (() => {
    return new CellManager(
        game,
        gameBoardElement,
        (cell, value) => addValueStyle(cell, value)
    );
})();

const scoreIncreaseRecycler = (() => {
    const recycler = new DomRecycler(() => document.createElement('span'));
    recycler
        .addEventListener('created', (evt) => {
            const element = evt.target;
            scoreElement.after(element);
            element.classList.add('score-increase');
        })
        .addEventListener('removed', evt =>  evt.target.className = '')
        .addEventListener('restored', evt => evt.target.classList.add('score-increase'));
    return recycler;
})();

const renderingSignaler = (() => {
    let rendering = 0;
    return {
        start: () => {
            rendering++;
        },

        finish: () => {
            rendering = Math.max(rendering - 1, 0);
        },

        isRendering: () => {
            return rendering !== 0;
        }
    }
})();

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
    setState(MERGEDS_STATE_KEY, applyOnMergePoints(point => point.toString()));
    setState(SPAWNED_STATE_KEY, spawnedPoint?.toString());
}

const saveAudioStates = () => {
    setState(AUDIO_STATE_KEY, {volume: backgroundMusic.getVolume(), muted: backgroundMusic.isMuted()});
}

/**
 * @template TReturn
 * @param {(point: Point) => TReturn} fn
 * @returns {TReturn[]}
 */
const applyOnMergePoints = (fn) => {
    const result = [];
    for (const point of mergedPoints.values()){
        result.push(fn(point));
    }
    return result;
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
        for (const str of savedMergeds) {
            mergedPoints.add(Point.parse(str));
        }
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
 * @returns {Promise<void>}
 */
const renderScore = async (showIncrease = true) => {
    const oldScore = parseInt(scoreElement.innerText);
    if (oldScore === score) {
        return;
    }

    scoreElement.innerText = score;
    adjustScoreColor();

    if (showIncrease) {
        await showScoreIncrease(score - oldScore);
    }
}

/**
 * @param {number} amount
 */
const showScoreIncrease = async (amount) => {
    await conditionalEventListener(
        {
            items: scoreIncreaseRecycler.acquire(),
            elementSupplier: e => e.element,
            eventType: 'animationend',
            eventFilter: evt => evt.animationName === 'float-up-fading-out',
        },
        {
            onEachItem: (ele) => {
                const text = amount >= 0 ? `+${amount}` : `-${amount}`; 
                ele.textContent = text;
            },
            onEachEvent: (_, e) => e.remove(),
        }
    );
}

const adjustScoreColor = () => {
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
    scoreElement.style.textShadow = rgbToTextBorderCss(interpolatedShadowColor, offset, blurRadius);
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
const renderInitialGameBoard = async () => {
    await conditionalEventListener(
        {
            items: game.getBoard().getOccupiedSlots(),
            elementSupplier: point => cellManager.create(point),
            eventType: 'animationend',
            eventFilter: evt => evt.animationName === 'fade-in',
        },
        {
            onEachItem: (cell, point) => {
                if (point === spawnedPoint) {
                    cell.classList.add('spawned');
                }
                else {
                    cell.classList.add('new-game');
                }

                if (mergedPoints.has(point)) {
                    cell.classList.add('merged');
                }
            },
            onEachEvent: cell => cell.classList.remove('new-game'),
        }
    );
}

/**
 * @param {Map<Point, BlockMove>} moves 
 * @param {Point} spawned
 * @param {Promise<void>}
 */
const renderGame = async (moves, spawned) => {
    await renderGameBoard(moves);
    
    renderScore(true);
    spawnNewCell(spawned);
    refreshGameOver();
    if (stopped) {
        gameOverSfx.play();
    }
}

const removeTemporaryVisuals = () => {
    applyOnMergePoints(point => cellManager.get(point)?.classList.remove('merged'));
    mergedPoints.clear();
    if (spawnedPoint) {
        cellManager.get(spawnedPoint)?.classList.remove('spawned');
    }
}

/**
 * @typedef {{cell: HTMLElement, cleanUp: (() => void) | undefined, newValue: number}} MergedCellEntry
 */

/**
 * @param {Map<Point, BlockMove>} moves
 * @returns {Promise<void>}
 */
const renderGameBoard = async (moves) => {
    /**
     * @type {MergedCellEntry[]}
     */
    const mergeds = [];

    await conditionalEventListener(
        {
            items: [...moves.values()],
            elementSupplier: move => cellManager.get(move.from),
            eventType: 'transitionend',
            eventFilter: (evt) => evt.propertyName === 'left' || evt.propertyName === 'top',
        },
        {
            onEachItem: (cell, move) => {
                const { from, to, merged } = move;
                const cleanUp = cellManager.move(from, to);
                
                if (merged) {
                    mergeds.push({
                        cell,
                        cleanUp,
                        newValue: game.blockAt(to)?.getValue(),
                    });
                    mergedPoints.add(to);
                }
            }
        }
    );

    await handleMergedCells(mergeds);
}

/**
 * @param {MergedCellEntry[]} mergeds
 * @returns {Promise<void>}
 */
const handleMergedCells = async (mergeds) => {
    await conditionalEventListener(
        {
            items: mergeds,
            elementSupplier: e => e.cell,
            eventType: 'animationend',
            eventFilter: evt => evt.animationName === 'bounce-merged-block',
        },
        {
            onEachItem: (cell, e) => {
                e.cleanUp?.();
                cell.classList.add('bounce-merged');
            },
            onEachEvent: (cell, e) => {
                cell.classList.remove('bounce-merged');
                cell.classList.add('merged');
                addValueStyle(cell, e.newValue);
            },
        }
    );
}

/**
 * @param {Point} spawned
 * @returns {Promise<void>}
 */
const spawnNewCell = async (spawned) => {
    await conditionalEventListener(
        {
            items: cellManager.create(spawned),
            elementSupplier: cell => cell,
            eventType: 'animationend',
            eventFilter: evt => evt.animationName === 'fade-in',
        },
        {
            onEachItem: cell => cell.classList.add('spawned'),
        }
    );
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
    mergedPoints.clear();
    spawnedPoint = undefined;
    cellManager.clear();
}

const reset = async () => {
    renderingSignaler.start();
    
    resetStates();
    initGameBoard();
    stopped = isGameOver();

    renderScore(false);
    refreshGameOver();
    await renderInitialGameBoard();

    renderingSignaler.finish();
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
        if (renderingSignaler.isRendering() || stopped) {
            return;
        }

        renderingSignaler.start();

        const moves = game.moveBlocks(direction);
        if (moves.size === 0) {
            renderingSignaler.finish();
            return;
        }

        const spawned = game.spawnBlockWeighted(SPAWNED_BLOCKS, SPAWNED_WEIGHTS);

        removeTemporaryVisuals();

        spawnedPoint = spawned;
        stopped = isGameOver();

        await renderGame(moves, spawned);

        renderingSignaler.finish();
        saveGameStates();
    }
}
const moveUp = moveInDirection(Direction.UP);
const moveDown = moveInDirection(Direction.DOWN);
const moveLeft = moveInDirection(Direction.LEFT);
const moveRight = moveInDirection(Direction.RIGHT);

const initGame = async () => {
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
    const initBaseCellPromise = cellManager.initBaseCells();
    updateAudioProgress();

    return initBaseCellPromise;
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

const showInitialLoading = () => {
    renderingSignaler.start();

    const spinner = document.createElement('div');
    spinner.className = 'loader';

    const loadingText = document.createElement('p');
    loadingText.textContent = 'Loading...';

    initialPopUpMessage.append(spinner, loadingText);
}

const showInitialLoaded = () => {
    initialPopUpMessage.textContent = 'Click anywhere to play';

    const initialPopUpElement = document.getElementById('initial-pop-up');
    initialPopUpElement.addEventListener('click', () => {
        backgroundMusic.play();
        initialPopUpElement.remove();
        
        renderingSignaler.finish();
    });
}

const init = async () => {
    showInitialLoading();
    await initUi();
    await initGame();
    initListeners();

    requestAnimationFrame(showInitialLoaded);
};

init();