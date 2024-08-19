'use strict';

/**
 * Randomly select an item from the given list
 * @param {any[]} items The list of items
 * @returns {any} The randomly selected item or 'undefined' if the list is empty
 */
const randomItem = (items) => {
    if (items.length === 0) {
        return undefined;
    }
    return items[Math.floor(Math.random() * items.length)];
}

/**
 * Randomly select an item from the given list based on the given weights
 * @param {any[]} items The list of items
 * @param {number[]} weights The corresponding weights for every item
 * @returns {any} The randomly selected item or 'undefined' if the list is empty
 */
const randomItemWeighted = (items, weights) => {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let randomWeight = Math.random() * totalWeight;
    for (let i = 0; i < items.length; i++) {
        randomWeight -= weights[i];
        if (randomWeight < 0) {
            return items[i];
        }
    }
}

const Direction = Object.freeze({
    UP: Symbol('UP'),
    DOWN: Symbol('DOWN'),
    LEFT: Symbol('LEFT'),
    RIGHT: Symbol('RIGHT'),
});

class Point {
    /**
     * @type {number}
     */
    #row;

    /**
     * @type {number}
     */
    #column;

    /**
     * @param {number} row 
     * @param {number} column 
     */
    constructor(row, column) {
        this.#row = row;
        this.#column = column;
    }

    /**
     * @returns {number}
     */
    getRow() {
        return this.#row;
    }

    /**
     * @returns {number}
     */
    getColumn() {
        return this.#column;
    }
}

class Block {
    /**
     * @type {Symbol}
     */
    static #CONSTRUCTOR_KEY = Symbol();

    /**
     * @type {Map<number, Block>}
     */
    static #pool = new Map();

    /**
     * @type {number}
     */
    #value;
    
    /**
     * Private constructor. To instantiate a Block object, use Block.of()
     * @param {number} value 
     * @param {Symbol} constructorKey 
     */
    constructor(value, constructorKey) {
        if (constructorKey !== Block.#CONSTRUCTOR_KEY) {
            throw new Error('The Block() constructor is private. Use Block.of() instead.');
        }
        this.#value = value;
    }

    /**
     * @returns {number}
     */
    getValue() {
        return this.#value;
    }

    /**
     * @param {number} value 
     * @returns {Block}
     */
    static of(value) {
        const hash = Block.#computeHash(value);
        let instance = Block.#pool.get(hash);
        if (!instance) {
            instance = new Block(value, Block.#CONSTRUCTOR_KEY);
            Block.#pool.set(hash, instance);
        }
        return instance;
    }

    /**
     * @param {number} value 
     * @returns {number}
     */
    static #computeHash(value) {
        let hash = 7;
        hash = 13 * hash + value;
        return hash;
    }
}

class Board {
    /**
     * @type {(Block|undefined)[]}
     */
    #blocks;

    /**
     * @type number
     */
    #rowCount;

    /**
     * @type number
     */
    #columnCount;

    /**
     * @type number
     */
    #blockCount;

    /**
     * @param {number} rowCount 
     * @param {number} columnCount 
     */
    constructor(rowCount, columnCount) {
        this.#rowCount = rowCount;
        this.#columnCount = columnCount;
        this.#blocks = [];
        this.#blockCount = 0;

        for (let i = 0; i < rowCount * columnCount; i++) {
            this.#blocks.push(undefined);
        }
    }

    /**
     * @param {Board} other 
     * @returns {Board}
     */
    static copy(other) {
        const instance = new Board(other.getRowCount(), other.getColumnCount());

        for (let i = 0; i < instance.getSize(); i++) {
            instance.#blocks[i] = other.#blocks[i];
        }

        return instance;
    }

    /**
     * @param {string} json
     * @returns {Board}
     */
    static fromJson(json) {
        const data = JSON.parse(json);
        const instance = new Board(data.rowCount, data.columnCount);

        for (let i = 0; i < instance.getSize(); i++) {
            const value = data.values[i];
            if (typeof value === 'number') {
                instance.#blocks[i] = Block.of(value);
                instance.#blockCount++;
            }
        }

        return instance;
    }

    /**
     * @returns {number}
     */
    getRowCount() {
        return this.#rowCount;
    }

    /**
     * @returns {number}
     */
    getColumnCount() {
        return this.#columnCount;
    }

    /**
     * @returns {number}
     */
    getSize() {
        return this.#rowCount * this.#columnCount;
    }

    /**
     * @returns {number}
     */
    getBlockCount() {
        return this.#blockCount;
    }

    /**
     * @return {void}
     */
    clear() {
        for (let i = 0; i < this.getSize(); i++) {
            this.#blocks[i] = undefined;
        }
        this.#blockCount = 0;
    }

    /**
     * @param {number} row 
     * @param {number} column
     */
    blockAt(row, column) {
        this.#ensureValidIndices(row, column);
        return this.#getBlock(row, column);
    }

    /**
     * @param {number} row 
     * @param {number} column 
     * @param {Block} block 
     */
    setBlockAt(row, column, block) {
        const oldBlock = this.blockAt(row, column);
                
        if (!oldBlock && block) {
            this.#blockCount++;
        }
        else if (oldBlock && !block) {
            this.#blockCount--;
        }
        
        this.#blocks[this.#computeIndex(row, column)] = block;
    }

    /**
     * @param {number} row 
     * @param {number} column
     */
    removeBlockAt(row, column) {
        this.setBlockAt(row, column, undefined);
    }

    /**
     * @returns {number}
     */
    getHighestValue() {
        let highestValue = -1;
        for (let i = 0; i < this.getRowCount(); i++) {
            for (let j = 0; j < this.getColumnCount(); j++) {
                const block = this.#getBlock(i, j);
                if (block) {
                    highestValue = Math.max(highestValue, block.getValue());
                }
            }
        }
        return highestValue;
    }

    /**
     * @returns {Point[]}
     */
    getEmptySlots() {
        const emptySlots = [];
        for (let i = 0; i < this.getRowCount(); i++) {
            for (let j = 0; j < this.getColumnCount(); j++) {
                const block = this.#getBlock(i, j);
                if (!block) {
                    emptySlots.push(new Point(i, j));
                }
            }
        }
        return emptySlots;
    }

    /**
     * @returns {string}
     */
    toJson() {
        const values = [];
        for (const block of this.#blocks) {
            values.push(block?.getValue());
        }
        return JSON.stringify({
            rowCount: this.#rowCount,
            columnCount: this.#columnCount,
            values
        });
    }

    /**
     * @param {number} row 
     * @param {number} column
     */
    #ensureValidIndices(row, column) {
        if (row < 0 || row >= this.getRowCount() || column < 0 || column >= this.getColumnCount()) {
            throw new Error();
        }
    }

    /**
     * @param {number} row 
     * @param {number} column
     */
    #getBlock(row, column) {
        return this.#blocks[this.#computeIndex(row, column)];
    }

    /**
     * @param {number} row 
     * @param {number} column
     */
    #computeIndex(row, column) {
        return row * this.#columnCount + column;
    }
}

class PointMover {
    constructor() {
        if(this.constructor === PointMover) {
            throw new Error('Interface "PointMover" cannot be instantiated as it is an interface.');
        }
    }

    /**
     * @param {Point} point 
     * @param {number} offset 
     * @return {Point}
     */
    move(point, offset) {
        throw new Error('Method "move()" must be implemented.');
    }
}

class BoardOperation {
    constructor() {
        if(this.constructor === BoardOperation) {
            throw new Error('Interface "BoardOperation" cannot be instantiated as it is an interface.');
        }
    }

    /**
     * @param {Board} board 
     * @param {number} row 
     * @param {number} column 
     * @param {boolean} isNewRound 
     * @param {PointMover} mover 
     */
    operate(board, row, column, isNewRound, mover) {
        throw new Error('Method "operate()" must be implemented.');
    }
}

class OnBlockMergedListener {
    constructor() {
        if(this.constructor === OnBlockMergedListener) {
            throw new Error('Interface "OnBlockMergedListener" cannot be instantiated as it is an interface.');
        }
    }

    /**
     * @param {Block} block1 
     * @param {Block} block2 
     * @param {Block} mergedBlock 
     */
    onBlockMerged(block1, block2, mergedBlock) {
        throw new Error('Method "onBlockMerged()" must be implemented.');
    }
}

class GameBoardOperation extends BoardOperation {
    constructor() {
        super();
        if(this.constructor === GameBoardOperation) {
            throw new Error('Interface "GameBoardOperation" cannot be instantiated as it is an interface.');
        }
    }

    /**
     * @param {OnBlockMergedListener} listener 
     */
    prepare(listener = undefined) {
        throw new Error('Method "prepare()" must be implemented.');
    }

    /**
     * @returns {boolean}
     */
    didMove() {
        throw new Error('Method "didMove()" must be implemented.');
    }
}

class BoardTraversalStrategy {
    constructor() {
        if(this.constructor === BoardTraversalStrategy) {
            throw new Error('Interface "BoardTraversalStrategy" cannot be instantiated as it is an interface.');
        }
    }

    /**
     * @param {Board} board 
     * @param {BoardOperation} operation 
     */
    execute(board, operation) {
        throw new Error('Method "execute()" must be implemented.');
    }
}

class BoardTraversalStrategyFactory {
    constructor() {
        if(this.constructor === BoardTraversalStrategyFactory) {
            throw new Error(
                'Interface "BoardTraversalStrategyFactory" cannot be instantiated as it is an interface.'
            );
        }
    }

    /**
     * @param {Direction} direction
     * @return {BoardTraversalStrategy}
     */
    create(direction) {
        throw new Error('Method "create()" must be implemented.');
    }
}

class BlockMerger {
    constructor() {
        if(this.constructor === BlockMerger) {
            throw new Error('Interface "BlockMerger" cannot be instantiated as it is an interface.');
        }
    }

    /**
     * @param {Block} block1 
     * @param {Block} block2 
     * @return {boolean}
     */
    canMerge(block1, block2) {
        throw new Error('Method "canMerge()" must be implemented.');
    }

    /**
     * @param {Block} block1 
     * @param {Block} block2 
     * @return {Block}
     */
    merge(block1, block2) {
        throw new Error('Method "merge()" must be implemented.');
    }
}

class BoardUpTraversalStrategy extends BoardTraversalStrategy {
    /**
     * @param {Board} board 
     * @param {BoardOperation} operation 
     */
    execute(board, operation) {
        /**
         * @type {PointMover}
         */
        const mover = {
            move: (point, offset) => new Point(point.getRow() - offset, point.getColumn())
        };
        
        for (let column = 0; column < board.getColumnCount(); column++) {
            let isNewRound = true;
            for (let row = 0; row < board.getRowCount(); row++) {
                operation.operate(board, row, column, isNewRound, mover);
                isNewRound = false;
            }
        }
    }
}

class BoardDownTraversalStrategy extends BoardTraversalStrategy {
    /**
     * @param {Board} board 
     * @param {BoardOperation} operation 
     */
    execute(board, operation) {
        /**
         * @type {PointMover}
         */
        const mover = {
            move: (point, offset) => new Point(point.getRow() + offset, point.getColumn())
        };
        
        for (let column = 0; column < board.getColumnCount(); column++) {
            let isNewRound = true;
            for (let row = board.getRowCount() - 1; row >= 0; row--) {
                operation.operate(board, row, column, isNewRound, mover);
                isNewRound = false;
            }
        }
    }
}

class BoardLeftTraversalStrategy extends BoardTraversalStrategy {
    /**
     * @param {Board} board 
     * @param {BoardOperation} operation 
     */
    execute(board, operation) {
        /**
         * @type {PointMover}
         */
        const mover = {
            move: (point, offset) => new Point(point.getRow(), point.getColumn() - offset)
        };
        
        for (let row = 0; row < board.getRowCount(); row++) {
            let isNewRound = true;
            for (let column = 0; column < board.getColumnCount(); column++) {
                operation.operate(board, row, column, isNewRound, mover);
                isNewRound = false;
            }
        }
    }
}

class BoardRightTraversalStrategy extends BoardTraversalStrategy {
    /**
     * @param {Board} board 
     * @param {BoardOperation} operation 
     */
    execute(board, operation) {
        /**
         * @type {PointMover}
         */
        const mover = {
            move: (point, offset) => new Point(point.getRow(), point.getColumn() + offset)
        };
        
        for (let row = 0; row < board.getRowCount(); row++) {
            let isNewRound = true;
            for (let column = board.getColumnCount() - 1; column >= 0; column--) {
                operation.operate(board, row, column, isNewRound, mover);
                isNewRound = false;
            }
        }
    }
}

class CachingBoardTraversalStrategyFactory extends BoardTraversalStrategyFactory {
    /**
     * @type {Map<Direction, BoardTraversalStrategy>}
     */
    #cache = new Map();

    /**
     * @param {Direction} direction
     * @return {BoardTraversalStrategy}
     */
    create(direction) {
        let strategy = this.#cache.get(direction);
        if (!strategy) {
            strategy = this.#createNewStrategy(direction);
            this.#cache.set(strategy);
        }
        return strategy;
    }

    /**
     * @param {Direction} direction
     * @return {BoardTraversalStrategy}
     */
    #createNewStrategy(direction) {
        switch(direction) {
            case Direction.UP: return new BoardUpTraversalStrategy();
            case Direction.DOWN: return new BoardDownTraversalStrategy();
            case Direction.LEFT: return new BoardLeftTraversalStrategy();
            case Direction.RIGHT: return new BoardRightTraversalStrategy();
        };
    }
}

class DefaultBlockMerger extends BlockMerger {
    /**
     * @param {Block} block1 
     * @param {Block} block2 
     * @return {boolean}
     */
    canMerge(block1, block2) {
        return block1.getValue() === block2.getValue();
    }
    
    /**
     * @param {Block} block1 
     * @param {Block} block2 
     * @return {Block}
     */
    merge(block1, block2) {
        const newValue = block1.getValue() + block2.getValue();
        return Block.of(newValue);
    }
}

class DefaultGameBoardOperation extends GameBoardOperation {
    /**
     * @type {number}
     */
    #emptyCount;

    /**
     * @type {boolean}
     */
    #isDstMerged;

    /**
     * @type {boolean}
     */
    #didMove;

    /**
     * @type {BlockMerger}
     */
    #merger;

    /**
     * @type {OnBlockMergedListener}
     */
    #listener;

    /**
     * @param {BlockMerger} merger 
     */
    constructor(merger) {
        super();
        this.#emptyCount = 0;
        this.#isDstMerged = false;
        this.#didMove = false;
        this.#merger = merger;
        this.#listener = undefined;
    }

    /**
     * @param {OnBlockMergedListener} listener 
     */
    prepare(listener = undefined) {
        this.#emptyCount = 0;
        this.#isDstMerged = false;
        this.#didMove = false;
        this.#listener = listener;
    }

    /**
     * @returns {boolean}
     */
    didMove() {
        return this.#didMove;
    }

    /**
     * @param {Board} board 
     * @param {number} row 
     * @param {number} column 
     * @param {boolean} isNewRound 
     * @param {PointMover} mover 
     */
    operate(board, row, column, isNewRound, mover) {
        if (isNewRound) {
            this.#emptyCount = 0;
            this.#isDstMerged = false;
        }

        if (!board.blockAt(row, column)) {
            this.#emptyCount++;
            return;
        }

        let offset = 1 + this.#emptyCount;
        let success = false;
        while (offset > 0 && !success) {
            try {
                success = this.#doPerOffset(board, row, column, offset, mover);
            }
            catch (_) {
                success = false;
            }
            offset--;
        }

        if (success) {
            this.#didMove = true;
        }
    }

    /**
     * @param {Board} board 
     * @param {number} row 
     * @param {number} column 
     * @param {number} offset
     * @param {PointMover} mover 
     */
    #doPerOffset(board, row, column, offset, mover) {
        const currentBlock = board.blockAt(row, column);
        const dstPoint = mover.move(new Point(row, column), offset);
        const dstRow = dstPoint.getRow();
        const dstColumn = dstPoint.getColumn();
        const dstBlock = board.blockAt(dstRow, dstColumn);

        if (!dstBlock) {
            board.setBlockAt(dstRow, dstColumn, currentBlock);
            board.removeBlockAt(row, column);
            this.#isDstMerged = false;
            return true;
        }
        else if (!this.#merger.canMerge(currentBlock, dstBlock) || this.#isDstMerged) {
            return false;
        }
        else {
            const mergedBlock = this.#merger.merge(currentBlock, dstBlock);
            board.setBlockAt(dstRow, dstColumn, mergedBlock);
            board.removeBlockAt(row, column);
            this.#isDstMerged = true;
            this.#emptyCount++;

            this.#notifyListener(currentBlock, dstBlock, mergedBlock);

            return true;
        }
    }

    /**
     * @param {Block} block1 
     * @param {Block} block2 
     * @param {Block} mergedBlock 
     */
    #notifyListener(block1, block2, mergedBlock) {
        this.#listener?.onBlockMerged(block1, block2, mergedBlock);
    }
}

class Game {
    /**
     * @type {Board}
     */
    #board;

    /**
     * @type {BoardTraversalStrategyFactory}
     */
    #strategyFactory;

    /**
     * @type {OnBlockMergedListener | undefined}
     */
    #listener;

    /**
     * @type {GameBoardOperation}
     */
    #operation;
    
    /**
     * @param {Board} board 
     * @param {BoardTraversalStrategyFactory} strategyFactory 
     * @param {GameBoardOperation} operation 
     */
    constructor(board, strategyFactory, operation) {
        this.#board = board;
        this.#strategyFactory = strategyFactory;
        this.#operation = operation;
        this.#listener = undefined;
    }
    
    /**
     * @returns {Board}
     */
    getBoard() {
        return this.#board;
    }
    
    /**
     * @returns {BoardTraversalStrategyFactory}
     */
    getStrategyFactory() {
        return this.#strategyFactory;
    }

    /**
     * @param {OnBlockMergedListener | undefined} listener 
     */
    setOnBlockMergedListener(listener) {
        this.#listener = listener;
    }
    
    /**
     * @returns {boolean}
     */
    isSpawnable() {
        return this.#board.getBlockCount() != this.#board.getSize();
    }

    /**
     * @param {Block} block 
     */
    spawnBlock(block) {
        if (!this.isSpawnable() || !block) {
            return;
        }
        
        const emptySlots = this.#board.getEmptySlots();
        const slot = randomItem(emptySlots);
        this.#board.setBlockAt(slot.getRow(), slot.getColumn(), block);
    }
    
    /**
     * @param {Block[]} blocks 
     * @param {number[]} weights 
     */
    spawnBlockWeighted(blocks, weights) {
        const block = randomItemWeighted(blocks, weights);
        this.spawnBlock(block);
    }
    
    /**
     * @param {Direction} direction 
     * @return {boolean}
     */
    moveBlocks(direction) {
        const strategy = this.#strategyFactory.create(direction);
        this.#operation.prepare(this.#listener);
        strategy.execute(this.#board, this.#operation);
        return this.#operation.didMove();
    }

    /**
     * @param {Direction} direction 
     * @return {boolean}
     */
    tryMoveBlocks(direction) {
        const strategy = this.#strategyFactory.create(direction);
        this.#operation.prepare();
        const tempBoard = Board.copy(this.#board);

        /**
         * @type {BoardOperation}
         */
        const tempOperation = {
            operate: (board, row, column, isNewRound, mover) => {
                if (this.#operation.didMove()) {
                    return;
                }
                this.#operation.operate(board, row, column, isNewRound, mover);
            }
        }
        
        strategy.execute(tempBoard, tempOperation);
        return this.#operation.didMove();
    }
}