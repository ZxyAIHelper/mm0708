/**
 * Text Processing Utilities
 */

// Detect delimiter in text
export function detectDelimiter(text) {
    const delimiters = {
        ',': (text.match(/,/g) || []).length,
        ';': (text.match(/;/g) || []).length,
        '\n': (text.match(/\n/g) || []).length,
        ' ': (text.match(/\s+/g) || []).length,
    };

    // Find delimiter with highest count
    let maxCount = 0;
    let detectedDelimiter = ',';

    for (const [delimiter, count] of Object.entries(delimiters)) {
        if (count > maxCount) {
            maxCount = count;
            detectedDelimiter = delimiter;
        }
    }

    return detectedDelimiter;
}

// Parse text into array based on delimiter
export function parseText(text, delimiter = ',') {
    if (!text || text.trim() === '') {
        return [];
    }

    let items;

    if (delimiter === '\n') {
        items = text.split('\n');
    } else if (delimiter === ' ') {
        items = text.split(/\s+/);
    } else if (delimiter === 'auto') {
        const detected = detectDelimiter(text);
        return parseText(text, detected);
    } else {
        // For comma, semicolon, or custom delimiter
        const escapedDelimiter = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        items = text.split(new RegExp(escapedDelimiter));
    }

    return items;
}

// Format array with selected delimiter (supports multiple)
export function formatText(items, delimiters = [',']) {
    if (!Array.isArray(items) || items.length === 0) {
        return '';
    }

    // If single delimiter string, convert to array
    if (typeof delimiters === 'string') {
        delimiters = [delimiters];
    }

    // Join all delimiters together
    const delimiter = delimiters.join('');

    if (delimiter.includes('\n') && delimiters.length === 1) {
        return items.join('\n');
    } else if (delimiter === ' ') {
        return items.join(' ');
    } else {
        return items.join(delimiter);
    }
}

// Trim whitespace from each item
export function trimItems(items) {
    return items.map(item => item.trim());
}

// Remove duplicate items
export function removeDuplicates(items) {
    return [...new Set(items)];
}

// Remove empty items
export function removeEmpty(items) {
    return items.filter(item => item !== '');
}

// Sort items alphabetically
export function sortItems(items) {
    return [...items].sort((a, b) => a.localeCompare(b));
}

// Get stats about the data
export function getStats(items) {
    return {
        totalItems: items.length,
        uniqueItems: new Set(items).size,
        emptyItems: items.filter(item => item === '').length,
    };
}
