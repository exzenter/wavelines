const defaultConfig = require('@wordpress/scripts/config/webpack.config');
const path = require('path');

module.exports = {
    ...defaultConfig,
    entry: {
        ...defaultConfig.entry(),
        'wave-worker': path.resolve(process.cwd(), 'src', 'wave-worker.js'),
    },
};
