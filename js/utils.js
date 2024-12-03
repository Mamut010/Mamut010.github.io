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