"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const autonomous_1 = __importDefault(require("autonomous"));
const async_sqlite_1 = __importDefault(require("async-sqlite"));
const process_1 = __importDefault(require("process"));
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const events_1 = require("events");
const ACTIVE_CLOSE = 'public-collector';
const markets = fs_extra_1.readJsonSync(path_1.join(__dirname, '../cfg/markets.json'));
class PublicCollector extends autonomous_1.default {
    constructor() {
        super(...arguments);
        this.db = new async_sqlite_1.default(process_1.default.argv[2]);
        this.center = {};
    }
    async _start() {
        await this.db.start();
        for (const market of markets) {
            await this.db.sql(`CREATE TABLE "${market}/trades"(
                    local_time    BIGINT,
                    price   BIGINT,
                    amount  DOUBLE PRECISION,
                    action  CHAR(3)
                );`).catch(err => {
                if (err.errno !== 1)
                    throw err;
            });
            await this.db.sql(`CREATE TABLE "${market}/orderbook"(
                local_time  BIGINT,
                bid_price   BIGINT,
                ask_price   BIGINT
            );`).catch(err => {
                if (err.errno !== 1)
                    throw err;
            });
            this.center[market] = {
                orderbook: this.connectOrderbook(market),
                trades: this.connectTrades(market),
            };
        }
    }
    connectTrades(market) {
        const centerTrades = new ws_1.default(`ws://localhost:12001/${market}/trades`);
        centerTrades.on('error', console.error);
        centerTrades.on('close', (code, reason) => {
            if (reason !== ACTIVE_CLOSE)
                console.error(new Error(`public center for ${market} closed: ${code}`));
        });
        centerTrades.on('message', (message) => {
            // console.log('trades message');
            try {
                const data = JSON.parse(message);
                const trades = data;
                for (const trade of trades)
                    this.db.sql(`
                        INSERT INTO "${market}/trades"
                        (local_time, price, amount, action)
                        VALUES(%d, %d, %d, '%s')
                    ;`, trade.time, trade.price, trade.amount, trade.action).catch(err => {
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
        const centerOrderbook = new ws_1.default(`ws://localhost:12001/${market}/orderbook`);
        centerOrderbook.on('error', console.error);
        centerOrderbook.on('close', (code, reason) => {
            if (reason !== ACTIVE_CLOSE)
                console.error(new Error(`public center for ${market} closed: ${code}`));
        });
        centerOrderbook.on('message', (message) => {
            // console.log('trades message');
            try {
                const data = JSON.parse(message);
                const orderbook = data;
                if (orderbook.asks.length > 0
                    && orderbook.bids.length > 0)
                    this.db.sql(`
                    INSERT INTO "${market}/orderbook"
                    (local_time, bid_price, ask_price)
                    VALUES(%d, %d, %d)
                ;`, Date.now(), orderbook.bids[0].price, orderbook.asks[0].price).catch(err => {
                        console.error(err);
                        this.stop();
                    });
            }
            catch (err) {
                console.error(err);
                this.stop();
            }
        });
        return centerOrderbook;
    }
    async _stop() {
        // 必须先管网络再关数据库，不然数据库永远在等待写入队列空。
        console.log(0);
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
        console.log(1);
        await this.db.stop();
        console.log(2);
    }
}
exports.PublicCollector = PublicCollector;
exports.default = PublicCollector;
//# sourceMappingURL=index.js.map