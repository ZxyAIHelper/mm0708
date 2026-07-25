(function (global) {
    'use strict';

    function copyVersion(version) {
        return version ? {
            imageUrl: version.imageUrl,
            instruction: version.instruction,
            createdAt: version.createdAt,
        } : null;
    }

    function createVersionHistory() {
        const versions = [];
        let selectedIndex = -1;

        function add(input) {
            const version = {
                imageUrl: input.imageUrl,
                instruction: input.instruction,
                createdAt: Date.now(),
            };
            versions.push(version);
            selectedIndex = versions.length - 1;
            return copyVersion(version);
        }

        function list() {
            return versions.map(copyVersion);
        }

        function current() {
            return copyVersion(versions[selectedIndex]);
        }

        function select(index) {
            if (
                !Number.isInteger(index)
                || index < 0
                || index >= versions.length
            ) {
                return null;
            }
            selectedIndex = index;
            return current();
        }

        function restore(index) {
            if (
                !Number.isInteger(index)
                || index < 0
                || index >= versions.length
            ) {
                return null;
            }
            return add({
                ...versions[index],
                instruction: `恢复版本 ${index + 1}`,
            });
        }

        return {
            add,
            list,
            current,
            select,
            restore,
        };
    }

    const versionHistory = { createVersionHistory };
    global.VersionHistory = versionHistory;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = versionHistory;
    }
}(globalThis));
