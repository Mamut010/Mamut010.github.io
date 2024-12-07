'use strict';

const Direction = Object.freeze({
    UP: Symbol('UP'),
    DOWN: Symbol('DOWN'),
    LEFT: Symbol('LEFT'),
    RIGHT: Symbol('RIGHT'),
});

class Point {
    /**
     * @type {Symbol}
     */
    static #CONSTRUCTOR_KEY = Symbol();

    /**
     * @type {Map<string, Point>}
     */
    static #pool = new Map();

    /**
     * @type {number}
     */
    #row;

    /**
     * @type {number}
     */
    #column;

    /**
     * Private constructor. To instantiate a Point object, use Point.of()
     * @param {number} row
     * @param {number} column
     * @param {Symbol} constructorKey
     */
    constructor(row, column, constructorKey) {
        if (constructorKey !== Point.#CONSTRUCTOR_KEY) {
            throw new Error('The Point() constructor is private. Use Point.of() instead.');
        }
        this.#row = row;
        this.#column = column;
    }

    /**
     * @param {number} row
     * @param {number} column
     * @returns {Point}
     */
    static of(row, column) {
        const key = Point.#paramsToString(row, column);
        let instance = Point.#pool.get(key);
        if (!instance) {
            instance = new Point(row, column, Point.#CONSTRUCTOR_KEY);
            Point.#pool.set(key, instance);
        }
        return instance;
    }

    /**
     * @param {string} str
     * @returns {Point} 
     */
    static parse(str) {
        const tokens = str.split(',');
        if (tokens.length !== 2) {
            throw new Error();
        }

        const row = parseInt(tokens[0]);
        const column = parseInt(tokens[1]);
        if (isNaN(row) || isNaN(column)) {
            throw new Error();
        }
        return Point.of(row, column);
    }

    /**
     * @returns {number}
     */
    row() {
        return this.#row;
    }

    /**
     * @returns {number}
     */
    column() {
        return this.#column;
    }

    /**
     * @param {number} rowDistance
     * @param {number} columnDistance
     * @returns {Point}
     */
    move(rowDistance, columnDistance) {
        return Point.of(this.#row + rowDistance, this.#column + columnDistance);
    }

    /**
     * @param {number} distance
     * @returns {Point}
     */
    moveRow(distance) {
        return this.move(distance, 0);
    }

    /**
     * @param {number} distance
     * @returns {Point}
     */
    moveColumn(distance) {
        return this.move(0, distance);
    }

    /**
     * @returns {string}
     */
    toString() {
        return Point.#paramsToString(this.#row, this.#column);
    }

    /**
     * @param {number} row 
     * @param {number} column 
     * @returns {string}
     */
    static #paramsToString(row, column) {
        return `${row},${column}`;
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
        instance.#blocks = [...other.#blocks];
        instance.#blockCount = other.#blockCount;
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
     * @returns {boolean}
     */
    isWithinBound(row, column) {
        return row >= 0 && row < this.#rowCount && column >= 0 && column < this.#columnCount;
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

    *getEmptySlots() {
        for (let i = 0; i < this.#rowCount; i++) {
            for (let j = 0; j < this.#columnCount; j++) {
                const block = this.#getBlock(i, j);
                if (!block) {
                    yield Point.of(i, j);
                }
            }
        }
    }

    *getOccupiedSlots() {
        for (let i = 0; i < this.#rowCount; i++) {
            for (let j = 0; j < this.#columnCount; j++) {
                const block = this.#getBlock(i, j);
                if (block) {
                    yield Point.of(i, j);
                }
            }
        }
    }

    /**
     * @returns {string}
     */
    toJson() {
        return JSON.stringify({
            rowCount: this.#rowCount,
            columnCount: this.#columnCount,
            values: this.#blocks.map(block => block?.getValue()),
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

class BlockMove {
    /**
     * @type {Point}
     */
    #from;

    /**
     * @type {Point}
     */
    #to;

    /**
     * @type {boolean}
     */
    #merged;

    /**
     * @param {Point} from 
     * @param {Point} to 
     * @param {boolean} merged 
     */
    constructor(from, to, merged) {
        this.#from = from;
        this.#to = to;
        this.#merged = merged;
    }

    from() {
        return this.#from;
    }

    to() {
        return this.#to;
    }

    isMerged() {
        return this.#merged;
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
     * @param {Point} point
     * @param {boolean} isNewRound
     * @param {PointMover} mover
     */
    operate(board, point, isNewRound, mover) {
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

class StatefulBoardOperation extends BoardOperation {
    constructor() {
        super();
        if(this.constructor === StatefulBoardOperation) {
            throw new Error('Interface "StatefulBoardOperation" cannot be instantiated as it is an interface.');
        }
    }

    /**
     * @param {OnBlockMergedListener|undefined} listener 
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

    /**
     * @returns {Map<Point, BlockMove>}
     */
    getMoveMap() {
        throw new Error('Method "moveMap()" must be implemented.');
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
            move: (point, offset) => point.moveRow(-offset)
        };
        
        for (let column = 0; column < board.getColumnCount(); column++) {
            let isNewRound = true;
            for (let row = 0; row < board.getRowCount(); row++) {
                operation.operate(board, Point.of(row, column), isNewRound, mover);
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
            move: (point, offset) => point.moveRow(offset)
        };
        
        for (let column = 0; column < board.getColumnCount(); column++) {
            let isNewRound = true;
            for (let row = board.getRowCount() - 1; row >= 0; row--) {
                operation.operate(board, Point.of(row, column), isNewRound, mover);
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
            move: (point, offset) => point.moveColumn(-offset)
        };
        
        for (let row = 0; row < board.getRowCount(); row++) {
            let isNewRound = true;
            for (let column = 0; column < board.getColumnCount(); column++) {
                operation.operate(board, Point.of(row, column), isNewRound, mover);
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
            move: (point, offset) => point.moveColumn(offset)
        };
        
        for (let row = 0; row < board.getRowCount(); row++) {
            let isNewRound = true;
            for (let column = board.getColumnCount() - 1; column >= 0; column--) {
                operation.operate(board, Point.of(row, column), isNewRound, mover);
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
            this.#cache.set(direction, strategy);
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

class IdenticalBlockMerger extends BlockMerger {
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

class GameBoardOperation extends StatefulBoardOperation {
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
     * @type {Map<Point, BlockMove>}
     */
    #moveMap;

    /**
     * @type {BlockMerger}
     */
    #merger;

    /**
     * @type {OnBlockMergedListener|undefined}
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
        this.#moveMap = new Map();
        this.#merger = merger;
        this.#listener = undefined;
    }

    /**
     * @param {OnBlockMergedListener|undefined} listener 
     */
    prepare(listener = undefined) {
        this.#emptyCount = 0;
        this.#isDstMerged = false;
        this.#didMove = false;
        this.#moveMap.clear();
        this.#listener = listener;
    }

    /**
     * @returns {boolean}
     */
    didMove() {
        return this.#didMove;
    }

    /**
     * @returns {Map<Point, BlockMove>}
     */
    getMoveMap() {
        return this.#moveMap;
    }

    /**
     * @param {Board} board 
     * @param {Point} point
     * @param {boolean} isNewRound 
     * @param {PointMover} mover 
     */
    operate(board, point, isNewRound, mover) {
        if (isNewRound) {
            this.#emptyCount = 0;
            this.#isDstMerged = false;
        }

        const row = point.row();
        const column = point.column();
        if (!board.isWithinBound(row, column)) {
            return;
        }
        else if (!board.blockAt(row, column)) {
            this.#emptyCount++;
            return;
        }

        let offset = 1 + this.#emptyCount;
        let success = false;
        while (offset > 0 && !success) {
            const dstPoint = mover.move(Point.of(row, column), offset);
            const dstRow = dstPoint.row();
            const dstColumn = dstPoint.column();
            
            if (board.isWithinBound(dstRow, dstColumn)) {
                success = this.#moveBlock(board, point, dstPoint);
            }

            offset--;
        }

        if (success) {
            this.#didMove = true;
        }
    }

    /**
     * @param {Board} board 
     * @param {Point} from
     * @param {Point} to
     */
    #moveBlock(board, from, to) {
        const row = from.row();
        const column = from.column();
        const dstRow = to.row();
        const dstColumn = to.column();

        const currentBlock = board.blockAt(row, column);
        const dstBlock = board.blockAt(dstRow, dstColumn);

        let success;
        if (!dstBlock) {
            board.setBlockAt(dstRow, dstColumn, currentBlock);
            board.removeBlockAt(row, column);
            this.#isDstMerged = false;
            success = true;
        }
        else if (!this.#merger.canMerge(currentBlock, dstBlock) || this.#isDstMerged) {
            success = false;
        }
        else {
            const mergedBlock = this.#merger.merge(currentBlock, dstBlock);
            board.setBlockAt(dstRow, dstColumn, mergedBlock);
            board.removeBlockAt(row, column);
            this.#isDstMerged = true;
            this.#emptyCount++;
            success = true;

            this.#notifyListener(currentBlock, dstBlock, mergedBlock);
        }

        if (success) {
            this.#moveMap.set(from, new BlockMove(from, to, this.#isDstMerged));
        }

        return success;
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
     * @type {StatefulBoardOperation}
     */
    #operation;
    
    /**
     * @param {Board} board 
     * @param {BoardTraversalStrategyFactory} strategyFactory 
     * @param {StatefulBoardOperation} operation 
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
     * @returns {void}
     */
    clearBoard() {
        this.#board.clear();
    }

    /**
     * @param {number|Point} rowOrPoint 
     * @param {number|undefined} column
     */
    blockAt(rowOrPoint, column = undefined) {
        if (rowOrPoint instanceof Point) {
            return this.#board.blockAt(rowOrPoint.row(), rowOrPoint.column());
        }
        else {
            return this.#board.blockAt(rowOrPoint, column ?? 0);
        }
    }
    
    /**
     * @returns {boolean}
     */
    isSpawnable() {
        return this.#board.getBlockCount() != this.#board.getSize();
    }

    /**
     * @param {Block} block
     * @return {Point|undefined} The spawned location or undefined if there is no empty slot.
     */
    spawnBlock(block) {
        if (!this.isSpawnable() || !block) {
            return;
        }
        
        const emptySlots = [...this.#board.getEmptySlots()];
        const slot = randomItem(emptySlots);
        this.#board.setBlockAt(slot.row(), slot.column(), block);
        return slot;
    }
    
    /**
     * @param {Block[]} blocks
     * @param {number[]} weights
     * @return {Point|undefined} The spawned location or undefined if there is no empty slot.
     */
    spawnBlockWeighted(blocks, weights) {
        const block = randomItemWeighted(blocks, weights);
        return this.spawnBlock(block);
    }
    
    /**
     * @param {Direction} direction 
     * @return {Map<Point, BlockMove>} The move map
     */
    moveBlocks(direction) {
        const strategy = this.#strategyFactory.create(direction);
        this.#operation.prepare(this.#listener);
        strategy.execute(this.#board, this.#operation);
        return new Map(this.#operation.getMoveMap());
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