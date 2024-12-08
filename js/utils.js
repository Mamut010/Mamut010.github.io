'use strict';

/**
 * Randomly select an item from the given array
 * @template T
 * @param {T[]} items The array of items
 * @returns {T|undefined} The randomly selected item or 'undefined' if the array is empty
 */
const randomItem = (items) => {
    return items.length > 0 ? items[randomIdx(items)] : undefined;
}

/**
 * Randomly select an index within the given array
 * @template T
 * @param {T[]} items The array of items
 * @returns {number} The randomly selected index or -1 if the array is empty
 */
const randomIdx = (items) => {
    if (items.length === 0) {
        return -1;
    }
    return Math.floor(Math.random() * items.length);
}

/**
 * Randomly select an item from the given list based on the given weights
 * @template T
 * @param {T[]} items The list of items
 * @param {number[]} weights The corresponding weights for every item
 * @returns {T|undefined} The randomly selected item or 'undefined' if the list is empty
 * @throws {Error} If the list's length and number of weights do not match
 */
const randomItemWeighted = (items, weights) => {
    if (items.length !== weights.length) {
        throw new Error(`Invalid argument: the number of items and number of weights must match`);
    }
    else if (items.length === 0) {
        return undefined;
    }

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let randomWeight = Math.random() * totalWeight;
    for (let i = 0; i < items.length; i++) {
        randomWeight -= weights[i];
        if (randomWeight < 0) {
            return items[i];
        }
    }
}

class RgbColor {
    /** @type {number} */ r;
    /** @type {number} */ g;
    /** @type {number} */ b;
}

/**
 * 
 * @param {string} hex 
 * @returns {RgbColor}
 */
const hexToRgb = (hex) => {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
}

/**
 * @param {RgbColor} startColor
 * @param {RgbColor} endColor 
 * @param {number} factor 
 * @returns {RgbColor}
 */
const interpolateColor = (startColor, endColor, factor) => {
    return {
        r: Math.round(startColor.r + (endColor.r - startColor.r) * factor),
        g: Math.round(startColor.g + (endColor.g - startColor.g) * factor),
        b: Math.round(startColor.b + (endColor.b - startColor.b) * factor),
    };
}

/**
 * @param {RgbColor} rgb 
 * @returns {string}
 */
const rgbToCss = (rgb) => `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

/**
 * @param {RgbColor} rgb 
 * @param {number} offset 
 * @param {number} blurRadius 
 * @returns {string}
 */
const rgbToTextBorderCss = (rgb, offset, blurRadius) => {
    // Text shadow layers for border effect (multiple layers to create the border)
    return `
        ${rgbToCss(rgb)} -${offset}px -${offset}px ${blurRadius}px,
        ${rgbToCss(rgb)} ${offset}px -${offset}px ${blurRadius}px,
        ${rgbToCss(rgb)} -${offset}px ${offset}px ${blurRadius}px,
        ${rgbToCss(rgb)} ${offset}px ${offset}px ${blurRadius}px
    `;
}

/**
 * @template T
 * @param {T|T[]} value 
 * @param {boolean} newInstance 
 * @returns {T[]}
 */
const asArray = (value, newInstance = false) => {
    if (!Array.isArray(value)) {
        return [value];
    }
    else {
        return newInstance ? [...value] : value;
    }
}

/**
 * @template T
 * @param {T[]} array
 * @param {boolean} newInstance
 * @returns {T[]}
 */
const shuffle = (array, newInstance = false) => {
    if (newInstance) {
        array = [...array];
    }

    let currentIndex = array.length;
  
    // While there remain elements to shuffle...
    while (currentIndex != 0) {
  
        // Pick a remaining element...
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
  
        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }

    return array;
}

/**
 * Return the value or the lower bound if the value is lower than the bound
 * @param {number} value The value
 * @param {number} lowerBound The lower bound
 * @returns The value or the lower bound if the value is lower than the bound
 */
const lowerBoundValue = (value, lowerBound) => Math.max(value, lowerBound);

/**
 * Return the value or the upper bound if the value is higher than the bound
 * @param {number} value The value
 * @param {number} upperBound The upper bound
 * @returns The value or the upper bound if the value is higher than the bound
 */
const upperBoundValue = (value, upperBound) => Math.min(value, upperBound);

/**
 * Return the value or the bound if the value exceeds the bound.
 * @param {number} value The value
 * @param {number} bound The first bound
 * @param {number} nextBound [optional] The next bound, defaulted to 0
 * @returns {number} The value or the bound if the value exceeds the bound
 */
const boundValue = (value, bound, nextBound = 0) => {
    const lowerBound = Math.min(bound, nextBound);
    const upperBound = Math.max(bound, nextBound);

    if (value < lowerBound) {
        return lowerBound;
    }
    else if (value > upperBound) {
        return upperBound;
    }
    else {
        return value;
    }
}

/**
 * @template T
 * @param {T[]} array
 * @param {Iterable<number>} removedIndices 
 * @param {boolean} inplace 
 * @returns {T[]}
 */
const removeIndices = (array, removedIndices, inplace = true) => {
    const indices = removedIndices instanceof Set ? removedIndices : new Set(removedIndices);
    const resultArray = inplace ? array : [...array];
    
    // Use a write pointer to overwrite elements
    let writePointer = 0;

    for (let readPointer = 0; readPointer < resultArray.length; readPointer++) {
        // Copy element only if it's not in the indicesSet
        if (!indices.has(readPointer)) {
            resultArray[writePointer] = resultArray[readPointer];
            writePointer++;
        }
    }

    // Truncate the array to the new size
    resultArray.length = writePointer;
    return resultArray;
}

/**
 * Completely resets an element by replacing it with a new instance.
 * @template {HTMLElement} TElement
 * @param {TElement} element - The element to reset.
 * @returns {TElement} - The fresh new element.
 */
const resetElement = (element) => {
    const newElement = document.createElement(element.tagName);
    element.replaceWith(newElement);
    return newElement;
}

/**
 * @template T
 * @typedef {T extends (infer U)[] ? U : T} SingleOrElementType<T>
 */

/**
 * @template TItems
 * @template {HTMLElement} TElement
 * @template {keyof HTMLElementEventMap} TEventType
 */
class ConditionalEventListenerParams {
    /**
     * @type {TItems}
     */
    items;

    /**
     * @type {(item: SingleOrElementType<TItems>, index: number) => TElement}
     */
    elementSupplier;

    /**
     * @type {number|undefined}
     */
    count = undefined;

    /**
     * @type {TEventType}
     */
    eventType;

    /**
     * @type {((evt: HTMLElementEventMap[TEventType]) => boolean)|undefined}
     */
    eventFilter = undefined;
}

/**
 * @template TItem
 * @template {HTMLElement} TElement
 * @template {keyof HTMLElementEventMap} TEventType
 */
class ConditionalEventListeners {
    /**
     *  @typedef {(HTMLElementEventMap[TEventType])} TEvent
     */

    /**
     * @type {((element: TElement, item: TItem, index: number) => Promise<void>|void)|undefined}
     */
    onEachItem = undefined;

    /**
     * @type {((element: TElement, item: TItem, index: number, evt: TEvent) => Promise<void>|void) | undefined}
     */
    onEachEvent = undefined;
}

/**
 * @template TItems
 * @template {HTMLElement} TElement
 * @template {keyof HTMLElementEventMap} TEventType
 * @param {ConditionalEventListenerParams<TItems, TElement, TEventType>} params
 * @param {ConditionalEventListeners<TItem, TElement, TEventType> | undefined} listeners
 * @returns {Promise<void>}
 */
const conditionalEventListener = (params, listeners = new ConditionalEventListeners()) => {
    /**
     * @typedef {SingleOrElementType<TItems>} TItem
     */

    /**
     * @type {TItem[]}
     */
    const items = asArray(params.items);
    const { elementSupplier, eventType, eventFilter } = params;
    let remaining = lowerBoundValue(params.count ?? items.length, 0);

    return new Promise((resolve, reject) => {
        if (remaining === 0) {
            resolve();
            return;
        }

        try {
            items.forEach(async (item, index) => {
                const element = elementSupplier(item, index);

                const eventHandler = async (evt) => {
                    if (eventFilter && !eventFilter(evt)) {
                        return;
                    }

                    element.removeEventListener(eventType, eventHandler);
                    await listeners.onEachEvent?.(element, item, index, evt);

                    remaining--;
                    if (remaining === 0) {
                        resolve();
                    }
                };
                
                element.addEventListener(eventType, eventHandler);
                await listeners.onEachItem?.(element, item, index);
            });
        }
        catch (err) {
            reject(err);
        }
    });
}