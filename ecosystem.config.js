const { basename } = require('path');

module.exports = {
    apps: [{
        name: basename(__dirname),
        script: './dist/main.js',
        cwd: __dirname,
        wait_ready: true,
        listen_timeout: 10000,
        kill_timeout: 30000, // 随便设个比两个环境变量之和大的数
        env: {
            NODE_ENV: 'production',
            STOP_TIMEOUT: 20000,
            EXIT_TIMEOUT: 5000,
        },
        args: './data/2019-11-14.db',
    }],
};