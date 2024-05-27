'use strict';

const randomItem = (items) => {
    return items[Math.floor(Math.random() * items.length)];
}

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
    #row;
    #column;

    constructor(row, column) {
        this.#row = row;
        this.#column = column;
    }

    getRow() {
        return this.#row;
    }

    getColumn() {
        return this.#column;
    }
}

class Block {
    static #CONSTRUCTOR_KEY = Symbol();
    static #pool = new Map();
    #value;
    
    constructor(value, constructorKey) {
        if (constructorKey !== Block.#CONSTRUCTOR_KEY) {
            throw new Error('The Block() constructor is private. Use Block.of() instead.');
        }
        this.#value = value;
    }

    getValue() {
        return this.#value;
    }

    static of(value) {
        const hash = Block.#computeHash(value);
        let instance = Block.#pool.get(hash);
        if (!instance) {
            instance = new Block(value, Block.#CONSTRUCTOR_KEY);
            Block.#pool.set(hash, instance);
        }
        return instance;
    }

    static #computeHash(value) {
        let hash = 7;
        hash = 13 * hash + value;
        return hash;
    }
}

class Board {
    #blocks;
    #rowCount;
    #columnCount;
    #blockCount;

    constructor(rowCount, columnCount) {
        this.#rowCount = rowCount;
        this.#columnCount = columnCount;
        this.#blocks = [];
        this.#blockCount = 0;

        for (let i = 0; i < rowCount * columnCount; i++) {
            this.#blocks.push(undefined);
        }
    }

    static copy(other) {
        const instance = new Board(other.getRowCount(), other.getColumnCount());

        for (let i = 0; i < instance.getSize(); i++) {
            instance.#blocks[i] = other.#blocks[i];
        }

        return instance;
    }

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

    getRowCount() {
        return this.#rowCount;
    }

    getColumnCount() {
        return this.#columnCount;
    }

    getSize() {
        return this.#rowCount * this.#columnCount;
    }

    getBlockCount() {
        return this.#blockCount;
    }

    clear() {
        for (let i = 0; i < this.getSize(); i++) {
            this.#blocks[i] = undefined;
        }
        this.#blockCount = 0;
    }

    blockAt(row, column) {
        this.#ensureValidIndices(row, column);
        return this.#getBlock(row, column);
    }

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

    removeBlockAt(row, column) {
        this.setBlockAt(row, column, undefined);
    }

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

    #ensureValidIndices(row, column) {
        if (row < 0 || row >= this.getRowCount() || column < 0 || column >= this.getColumnCount()) {
            throw new Error();
        }
    }

    #getBlock(row, column) {
        return this.#blocks[this.#computeIndex(row, column)];
    }

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

    operate(board, row, column, isNewRound, mover) {
        throw new Error('Method "operate()" must be implemented.');
    }
}

class BoardTraversalStrategy {
    constructor() {
        if(this.constructor === BoardTraversalStrategy) {
            throw new Error('Interface "BoardTraversalStrategy" cannot be instantiated as it is an interface.');
        }
    }

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

    canMerge(block1, block2) {
        throw new Error('Method "canMerge()" must be implemented.');
    }

    merge(block1, block2) {
        throw new Error('Method "merge()" must be implemented.');
    }
}

class OnBlockMergedListener {
    constructor() {
        if(this.constructor === OnBlockMergedListener) {
            throw new Error('Interface "OnBlockMergedListener" cannot be instantiated as it is an interface.');
        }
    }

    onBlockMerged(block1, block2, mergedBlock) {
        throw new Error('Method "onBlockMerged()" must be implemented.');
    }
}

class DefaultBoardOperation extends BoardOperation {
    #emptyCount;
    #isDstMerged;
    #didMove;
    #merger;
    #listener;

    constructor(merger) {
        super();
        this.#emptyCount = 0;
        this.#isDstMerged = false;
        this.#didMove = false;
        this.#merger = merger;
        this.#listener = undefined;
    }

    prepare(listener = undefined) {
        this.#emptyCount = 0;
        this.#isDstMerged = false;
        this.#didMove = false;
        this.#listener = listener;
    }

    didMove() {
        return this.#didMove;
    }

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

    #doPerOffset(board, row, column, offset, mover) {
        const currentBlock = board.blockAt(row, column);
        const dstPoint = mover.move(new Point(row, column), offset);
        const dstRow = dstPoint.getRow();
        const dstColumn = dstPoint.getColumn();
        const dstBlock = board.blockAt(dstRow, dstColumn);

        if (dstBlock == null) {
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

    #notifyListener(block1, block2, mergedBlock) {
        this.#listener?.onBlockMerged(block1, block2, mergedBlock);
    }
}

class BoardUpTraversalStrategy extends BoardTraversalStrategy {
    execute(board, operation) {
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
    execute(board, operation) {
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
    execute(board, operation) {
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
    execute(board, operation) {
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

class DefaultBoardTraversalStrategyFactory extends BoardTraversalStrategyFactory {
    create(direction) {
        switch(direction) {
            case Direction.UP: return new BoardUpTraversalStrategy();
            case Direction.DOWN: return new BoardDownTraversalStrategy();
            case Direction.LEFT: return new BoardLeftTraversalStrategy();
            case Direction.RIGHT: return new BoardRightTraversalStrategy();
        };
    }
}

class DefaultBlockMerger extends BlockMerger {
    canMerge(block1, block2) {
        return block1.getValue() == block2.getValue();
    }
    
    merge(block1, block2) {
        const newValue = block1.getValue() + block2.getValue();
        return Block.of(newValue);
    }
}

class Game {
    #board;
    #strategyFactory;
    #operation;
    #listener;
    
    constructor(board, strategyFactory, merger) {
        this.#board = board;
        this.#strategyFactory = strategyFactory;
        this.#operation = new DefaultBoardOperation(merger);
        this.#listener = undefined;
    }
    
    getBoard() {
        return this.#board;
    }
    
    getStrategyFactory() {
        return this.#strategyFactory;
    }

    setOnBlockMergedListener(listener) {
        this.#listener = listener;
    }
    
    isSpawnable() {
        return this.#board.getBlockCount() != this.#board.getSize();
    }

    spawnBlock(block) {
        if (!this.isSpawnable() || !block) {
            return;
        }
        
        const emptySlots = this.#board.getEmptySlots();
        const slot = randomItem(emptySlots);
        this.#board.setBlockAt(slot.getRow(), slot.getColumn(), block);
    }
    
    spawnBlockWeighted(blocks, weights) {
        const block = randomItemWeighted(blocks, weights);
        this.spawnBlock(block);
    }
    
    moveBlocks(direction) {
        const strategy = this.#strategyFactory.create(direction);
        this.#operation.prepare(this.#listener);
        strategy.execute(this.#board, this.#operation);
        return this.#operation.didMove();
    }

    tryMoveBlocks(direction) {
        const strategy = this.#strategyFactory.create(direction);
        this.#operation.prepare();
        const tempBoard = Board.copy(this.#board);
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