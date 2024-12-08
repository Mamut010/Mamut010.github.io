class CellManager {
    /**
     * @type {Game}
     */
    #game;

    /**
     * @type {HTMLElement}
     */
    #container;

    /**
     * @type {((cell: HTMLElement, value: number) => void) | undefined}
     */
    #cellStyler;

    /**
     * @type {DomRecycler<HTMLElement>}
     */
    #cellRecycler;

    /**
     * @type {Map<Point, BaseEntry>}
     */
    #baseEntries = new Map();

    /**
     * @type {Map<Point, DomRecyclerReadOnlyEntry<HTMLElement>>}
     */
    #movingCells = new Map();

    /**
     * @param {Game} game
     * @param {HTMLElement} container
     * @param {((cell: HTMLElement, value: number) => void) | undefined} cellStyler
     */
    constructor(game, container, cellStyler = undefined) {
        this.#game = game;
        this.#container = container;
        this.#cellStyler = cellStyler;
    }

    /**
     * @returns {void}
     */
    initBaseCells() {
        this.#initRecycler();
        this.#initBaseEntries();
        this.#attachResizeObserver();
    }

    /**
     * @returns {void}
     */
    clear() {
        for (const cell of this.#movingCells.values()) {
            cell.remove();
        }

        this.#movingCells.clear();
    }

    /**
     * @param {Point} point 
     * @returns {boolean}
     */
    has(point) {
       return this.#movingCells.has(point); 
    }

    /**
     * @param {Point} point 
     * @returns {HTMLElement|undefined}
     */
    get(point) {
        return this.#movingCells.get(point)?.element;
    }

    /**
     * @param {Point} point
     * @returns {HTMLElement|undefined}
     */
    create(point) {
        if (this.#movingCells.has(point)) {
            return undefined;
        }

        const cell = this.#cellRecycler.getOrCreate();
        const element = cell.element;

        this.#setCellPosAndBound(element, point);
        this.#invokeCellStyler(element, point);
        this.#movingCells.set(point, cell);

        return element;
    }

    /**
     * @param {Point} point
     * @returns {boolean}
     */
    delete(point) {
        const cell = this.#movingCells.get(point);
        if (!cell) {
            return false;
        }

        this.#movingCells.delete(point);
        cell.remove();
        return true;
    }

    /**
     * @param {Point} from 
     * @param {Point} to
     * @returns {(() => void) | undefined}
     */
    move(from, to) {
        const cell = this.#movingCells.get(from);
        if (!cell) {
            return undefined;
        }

        const element = cell.element;
        const toEntry = this.#baseEntries.get(to);
        if (toEntry) {
            element.style.left = `${toEntry.left}px`;
            element.style.top = `${toEntry.top}px`;
        }

        const toCell = this.#movingCells.get(to);
        const cleanUp = toCell ? () => toCell.remove() : undefined; 
        
        this.#movingCells.delete(from);
        this.#movingCells.set(to, cell);
        return cleanUp;
    }

    #initRecycler() {
        this.#cellRecycler = new DomRecycler(() => document.createElement('div'));
        this.#cellRecycler
            .addEventListener('created', (evt) => {
                const cell = evt.target;
                this.#container.appendChild(cell);
                cell.classList.add('game-block');
            })
            .addEventListener('restored', (evt) => evt.target.classList.value = 'game-block');
    }

    #initBaseEntries() {
        const board = this.#game.getBoard();
        for (let i = 0; i < board.getRowCount(); i++) {
            for (let j = 0; j < board.getColumnCount(); j++) {
                const emptyCell = document.createElement('div');
                emptyCell.classList.add('game-block-empty');

                this.#container.appendChild(emptyCell);
                this.#baseEntries.set(Point.of(i, j), new BaseEntry(emptyCell));
            }
        }
    }

    #attachResizeObserver() {
        const resizeObserver = new ResizeObserver((entries) => {
            entries.forEach(_ => this.#handleResize());
        });
        resizeObserver.observe(this.#container);
    }

    #handleResize() {
        for (const [point, cell] of this.#movingCells.entries()) {
            this.#baseEntries.get(point)?.recalculateDimensions();
            const element = cell.element;
            this.#setCellPosAndBound(element, point);
            this.#invokeCellStyler(element, point);
        }
    }

    /**
     * @param {HTMLElement} cell
     * @param {Point} point
     */
    #setCellPosAndBound(cell, point) {
        const entry = this.#baseEntries.get(point);
        if (!entry) {
            return;
        }

        cell.style.left = `${entry.left}px`;
        cell.style.top = `${entry.top}px`;
        cell.style.width = `${entry.width}px`;
        cell.style.height = `${entry.height}px`;
    }

    /**
     * @param {HTMLElement} cell
     * @param {Point} point
     */
    #invokeCellStyler(cell, point) {
        const value = this.#game.blockAt(point)?.getValue();
        if (!value) {
            cell.textContent = '';
        }
        else if (!this.#cellStyler) {
            cell.textContent = value.toString();
        }
        else {
            this.#cellStyler(cell, value);
        }
    }
}

class BaseEntry {
    /**
     * @type {HTMLElement}
     */
    #cell;

    /**
     * @type {number}
     */
    #top;

    /**
     * @type {number}
     */
    #left;

    /**
     * @type {number}
     */
    #width;

    /**
     * @type {number}
     */
    #height;

    /**
     * @param {HTMLElement} cell
     */
    constructor(cell) {
        this.#cell = cell;
        this.recalculateDimensions();
    }

    recalculateDimensions() {
        this.#top = this.#cell.offsetTop;
        this.#left = this.#cell.offsetLeft;
        this.#width = this.#cell.offsetWidth;
        this.#height = this.#cell.offsetHeight;
    }

    get top() {
        return this.#top;
    }

    get left() {
        return this.#left;
    }

    get width() {
        return this.#width;
    }

    get height() {
        return this.#height;
    }
}