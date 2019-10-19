const { PublicCollector } = require('./');
const process = require('process');

const publicCollector = new PublicCollector();

publicCollector.start()
    .then(() => console.log('started'));

process.once('SIGINT', () => {
    publicCollector.stop()
        .then(() => console.log('stopped'));
    process.once('SIGINT', () => process.exit(1));
});