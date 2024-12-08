/**
 * @template {HTMLElement} TElement
 */
class DomRecycler {
    /**
     * @type {() => TElement}
     */
    #creator;

    /**
     * @type {Map<EventType, DomRecyclerEventListenerEntry<TElement>[]>}
     */
    #eventListeners = new Map();

    /**
     * @type {DomRecyclerEntry<TElement>[]}
     */
    #backup = [];

    /**
     * @param {() => TElement} creator
     */
    constructor(creator) {
        this.#creator = creator;
    }

    /**
     * @param {DomRecyclerEventType[keyof typeof DomRecyclerEventType]} eventType 
     * @param {(event: DomRecyclerEvent<TElement>) => void} listener
     * @param {AudioEventOptions|undefined} options
     * @returns {this}
     */
    addEventListener(eventType, listener, options = undefined) {
        let entries = this.#eventListeners.get(eventType);
        if (!entries) {
            entries = [];
            this.#eventListeners.set(eventType, entries);
        }

        options ??= {};
        entries.push({ listener, options });
        return this;
    }

    /**
     * @param {DomRecyclerEventType[keyof typeof DomRecyclerEventType]} eventType
     * @param {(event: DomRecyclerEvent<TElement>) => void} listener
     * @returns {this}
     */
    removeEventListener(eventType, listener) {
        const entries = this.#eventListeners.get(eventType);
        if (!entries) {
            return this;
        }

        const idx = entries.findIndex(entry => entry.listener === listener);
        if (idx >= 0) {
            entries.splice(idx, 1);
            if (entries.length === 0) {
                this.#eventListeners.delete(eventType);
            }
        }
        return this;
    }

    /**
     * @param {(DomRecyclerEventType[keyof typeof DomRecyclerEventType])
     *  |(DomRecyclerEventType[keyof typeof DomRecyclerEventType])[]
     *  |undefined} eventType
     * @return {this}
     */
    removeEventListeners(eventType = undefined) {
        if (typeof eventType === 'undefined') {
            this.#eventListeners.clear();
            return this;
        }

        const eventTypes = asArray(eventType);
        eventTypes.forEach(e => this.#eventListeners.delete(e));
        return this;
    }

    backupSize() {
        return this.#backup.length;
    }

    isBackupEmpty() {
        return this.backupSize() === 0;
    }

    /**
     * Clear the backup and return all elements inside the backup.
     * @returns {TElement[]} All elements inside the backup
     */
    clear() {
        const elements = this.#backup.map(e => e.element);
        this.#backup.length = 0;
        return elements;
    }

    /**
     * @returns {DomRecyclerReadOnlyEntry<TElement>}
     */
    acquire() {
        let entry = this.#backup.pop();

        if (!entry) {
            const element = this.#creator();

            entry = new DomRecyclerEntry(
                element,
                (e) => {
                    this.#addToBackup(e);
                    this.#notifyListeners('removed', e);
                },
                (e) => {
                    this.#restoreStateFromBackup(e);
                    this.#notifyListeners('restored', e);
                }
            );

            this.#notifyListeners('created', entry);
        }
        else {
            entry.restore();
        }

        this.#notifyListeners('invoked', entry);

        return entry;
    }

    /**
     * @param {DomRecyclerEntry<TElement>} entry
     */
    #addToBackup(entry) {
        entry.element.style.display = 'none';
        this.#backup.push(entry);
    }

    /**
     * @param {DomRecyclerEntry<TElement>} entry
     */
    #restoreStateFromBackup(entry) {
        entry.element.style.display = '';
    }

    /**
     * @param {DomRecyclerEventType[keyof typeof DomRecyclerEventType]} eventType
     * @param {DomRecyclerEntry<TElement>|TElement} entryOrElement
     */
    #notifyListeners(eventType, entryOrElement) {
        const eventEntries = this.#eventListeners.get(eventType);
        if (!eventEntries || eventEntries.length === 0) {
            return;
        }

        const element = entryOrElement instanceof DomRecyclerEntry ? entryOrElement.element : entryOrElement;
        const event = new DomRecyclerEvent(eventType, element);
        const removedIndices = new Set();

        eventEntries.forEach((eventEntry, index) => {
            eventEntry.listener(event);

            const options = eventEntry.options;
            if (options?.once) {
                removedIndices.add(index);
            }
        });

        if (removedIndices.size === 0) {
            return;
        }

        removeIndices(eventEntries, removedIndices);
        if (eventEntries.length === 0) {
            this.#eventListeners.delete(eventType);
        }
    }
}

/**
 * @template {HTMLElement} TElement
 */
class DomRecyclerReadOnlyEntry {
    constructor() {
        if(this.constructor === DomRecyclerReadOnlyEntry) {
            throw new Error('Interface "DomRecyclerReadOnlyEntry" cannot be instantiated as it is an interface.');
        }
    }

    /**
     * @readonly
     * @returns {TElement}
     */
    get element() {
        throw new Error('Getter "element" must be implemented.');
    }

    /**
     * @returns {void}
     */
    remove() {
        throw new Error('Method "remove()" must be implemented.');
    }
}

/**
 * @template {HTMLElement} TElement
 * @implements {DomRecyclerReadOnlyEntry<TElement>} 
 */
class DomRecyclerEntry extends DomRecyclerReadOnlyEntry {
    /**
     * @type {TElement}
     */
    #element;

    /**
     * @type {(entry: DomRecyclerEntry<TElement>) => void}
     */
    #remove;

    /**
     * @type {(entry: DomRecyclerEntry<TElement>) => void}
     */
    #restore;

    /**
     * @type {boolean}
     */
    #removed = false;

    /**
     * @param {TElement} element 
     * @param {(entry: DomRecyclerEntry<TElement>) => void} removeFn
     * @param {(entry: DomRecyclerEntry<TElement>) => void} restoreFn
     */
    constructor(element, removeFn, restoreFn) {
        super();
        this.#element = element;
        this.#remove = removeFn;
        this.#restore = restoreFn;
    }

    get element() {
        return this.#element;
    }

    /**
     * @param {TElement} value
     */
    set element(value) {
        this.#element = value;
    }

    restore() {
        if (this.#removed) {
            this.#restore(this);
            this.#removed = false;
        }
    }

    remove() {
        if (!this.#removed) {
            this.#remove(this);
            this.#removed = true;
        }
    }
}

const DomRecyclerEventType = Object.freeze({
    CREATED: 'created',
    INVOKED: 'invoked',
    RESTORED: 'restored',
    REMOVED: 'removed',
});

/**
 * @template {HTMLElement} TElement
 */
class DomRecyclerEventListenerEntry {
    /**
     * @type {(event: DomRecyclerEvent<TElement>) => void}
     */
    listener;

    /**
     * @type {DomRecyclerEventOptions}
     */
    options;
}

/**
 * @template {HTMLElement} TElement
 * @interface
 */
class DomRecyclerEvent {
    /**
     * @type {DomRecyclerEventType[keyof typeof DomRecyclerEventType]}
     */
    #type;

    /**
     * @type {TElement}
     */
    #target;

    /**
     * @param {DomRecyclerEventType[keyof typeof DomRecyclerEventType]} type
     * @param {TElement} target
     */
    constructor(type, target) {
        this.#type = type;
        this.#target = target;
    }

    /**
     * @readonly
     */
    get type() {
        return this.#type;
    }

    /**
     * @readonly
     */
    get target() {
        return this.#target;
    }
}

class DomRecyclerEventOptions {
    /**
     * Specifiy whether the listener should be invoked at most once (it is removed from the listeners list after the invocation).
     * @type {boolean|undefined}
     */
    once = undefined;
}