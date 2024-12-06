'use strict';

/**
 * Randomly select an item from the given array
 * @param {any[]} items The array of items
 * @returns {any} The randomly selected item or 'undefined' if the array is empty
 */
const randomItem = (items) => {
    if (items.length === 0) {
        return undefined;
    }
    return items[randomIdx(items)];
}

/**
 * Randomly select an index within the given array
 * @param {any[]} items The array of items
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

const hexToRgb = (hex) => {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
}

const interpolateColor = (startColor, endColor, factor) => {
    return {
      r: Math.round(startColor.r + (endColor.r - startColor.r) * factor),
      g: Math.round(startColor.g + (endColor.g - startColor.g) * factor),
      b: Math.round(startColor.b + (endColor.b - startColor.b) * factor),
    };
}

const rgbToCss = (rgb) => {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

const asArray = (value, newInstance = false) => {
    if (!Array.isArray(value)) {
        return [value];
    }
    else {
        return newInstance ? [...value] : value;
    }
}

/**
 * @param {any[]} array
 * @param {boolean} newInstance
 * @returns {any[]}
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