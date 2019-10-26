"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const autonomous_1 = require("autonomous");
const async_sqlite_1 = __importDefault(require("async-sqlite"));
const process_1 = __importDefault(require("process"));
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const events_1 = require("events");
const ACTIVE_CLOSE = 'public-collector';
const markets = fs_extra_1.readJsonSync(path_1.join(__dirname, '../cfg/markets.json'));
const config = fs_extra_1.readJsonSync(path_1.join(__dirname, '../cfg/config.json'));
/*
    这个程序使用标准 sql，没有使用任何 sqlite 方言。
    移植到其他数据库只需修改 SCHEMA_TABLES。
*/
const SCHEMA_TABLES = 'sqlite_master';
class PublicCollector extends autonomous_1.Autonomous {
    constructor() {
        super(...arguments);
        this.db = new async_sqlite_1.default(process_1.default.argv[2]);
        this.center = {};
        this.latest = {};
        this.marketId = new Map();
    }
    async _start() {
        await this.db.start();
        if (!(await this.db.sql(`
            SELECT * FROM ${SCHEMA_TABLES}
            WHERE type = 'table' AND name = 'markets'
        ;`)).length)
            await this.db.sql(`CREATE TABLE markets(
            id      SMALLINT    NOT NULL    UNIQUE,
            name    VARCHAR(30) NOT NULL    UNIQUE
        );`);
        for (const market of markets) {
            let rows = await this.db.sql(`
                SELECT * FROM markets
                WHERE name = '%s'
            ;`, market);
            if (!rows.length) {
                const ids = await this.db.sql(`
                    SELECT * FROM markets
                ;`);
                await this.db.sql(`
                    INSERT INTO markets
                    (id, name)
                    VALUES(%d, '%s')
                ;`, ids.length, market);
                rows = await this.db.sql(`
                    SELECT * FROM markets
                    WHERE name = '%s'
                ;`, market);
            }
            this.marketId.set(market, rows[0].id);
        }
        if (!(await this.db.sql(`
            SELECT * FROM ${SCHEMA_TABLES}
            WHERE type = 'table' AND name = 'trades'
        ;`)).length)
            await this.db.sql(`CREATE TABLE trades(
            market_id   SMALLINT            NOT NULL    REFERENCES markets(id),
            local_time  BIGINT              NOT NULL,
            price       BIGINT              NOT NULL,
            amount      DOUBLE PRECISION    NOT NULL,
            action      CHAR(3)             NOT NULL
        );`);
        if (!(await this.db.sql(`
            SELECT * FROM ${SCHEMA_TABLES}
            WHERE type = 'table' AND name = 'orderbooks'
        ;`)).length)
            await this.db.sql(`CREATE TABLE orderbooks(
            market_id   SMALLINT    NOT NULL    REFERENCES markets(id),
            local_time  BIGINT      NOT NULL,
            bid_price   BIGINT      NOT NULL,
            ask_price   BIGINT      NOT NULL
        );`);
        for (const market of markets) {
            this.center[market] = {
                orderbook: this.connectOrderbook(market),
                trades: this.connectTrades(market),
            };
            this.latest[market] = {};
        }
    }
    connectTrades(market) {
        const centerTrades = new ws_1.default(`${config.PUBLIC_CENTER_BASE_URL}/${market}/trades`);
        centerTrades.on('error', console.error);
        centerTrades.on('close', (code, reason) => {
            if (reason !== ACTIVE_CLOSE) {
                console.error(new Error(`public center for ${market}/trades closed: ${code}`));
                this.stop();
            }
        });
        centerTrades.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                const trades = data;
                for (const trade of trades)
                    this.db.sql(`
                        INSERT INTO trades
                        (market_id, local_time, price, amount, action)
                        VALUES(%d, %d, %d, %d, '%s')
                    ;`, this.marketId.get(market), Date.now(), trade.price, trade.amount, trade.action).catch(err => {
                        console.error(err);
                        this.stop();
                    });
            }
            catch (err) {
                console.error(err);
                this.stop();
            }
        });
        return centerTrades;
    }
    connectOrderbook(market) {
        const centerOrderbook = new ws_1.default(`${config.PUBLIC_CENTER_BASE_URL}/${market}/orderbook`);
        centerOrderbook.on('error', console.error);
        centerOrderbook.on('close', (code, reason) => {
            if (reason !== ACTIVE_CLOSE) {
                console.error(new Error(`public center for ${market}/orderbook closed: ${code}`));
                this.stop();
            }
        });
        centerOrderbook.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                const orderbook = data;
                if (orderbook.asks.length > 0
                    && orderbook.bids.length > 0
                    && !(orderbook.bids[0].price === this.latest[market].maxBidPrice
                        && orderbook.asks[0].price === this.latest[market].minAskPrice)) {
                    this.latest[market].maxBidPrice = orderbook.bids[0].price;
                    this.latest[market].minAskPrice = orderbook.asks[0].price;
                    this.db.sql(`
                        INSERT INTO orderbooks
                        (market_id, local_time, bid_price, ask_price)
                        VALUES(%d, %d, %d, %d)
                    ;`, this.marketId.get(market), Date.now(), orderbook.bids[0].price, orderbook.asks[0].price).catch(err => {
                        console.error(err);
                        this.stop();
                    });
                }
            }
            catch (err) {
                console.error(err);
                this.stop();
            }
        });
        return centerOrderbook;
    }
    async _stop() {
        // 不能先关数据库再关网络，不然数据库永远在等待写入队列数据库写入失败。
        const stopped = [];
        for (const market of markets)
            if (this.center[market]) {
                let center;
                center = this.center[market].trades;
                if (center.readyState < 2)
                    center.close(1000, ACTIVE_CLOSE);
                if (center.readyState < 3)
                    stopped.push(events_1.once(center, 'close'));
                center = this.center[market].orderbook;
                if (center.readyState < 2)
                    center.close(1000, ACTIVE_CLOSE);
                if (center.readyState < 3)
                    stopped.push(events_1.once(center, 'close'));
            }
        await Promise.all(stopped);
        await this.db.stop();
    }
}
exports.PublicCollector = PublicCollector;
exports.default = PublicCollector;
//# sourceMappingURL=index.js.map