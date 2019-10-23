"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const async_sqlite_1 = __importDefault(require("async-sqlite"));
const process_1 = __importDefault(require("process"));
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const markets = fs_extra_1.readJsonSync(path_1.join(__dirname, '../cfg/markets.json'));
(async () => {
    const db = new async_sqlite_1.default(process_1.default.argv[2]);
    const data = {};
    console.log('reading');
    await db.start();
    for (const market of markets) {
        data[market] = {};
        let rows;
        rows = await db.sql(`SELECT * FROM "${market}/orderbook";`);
        data[market].orderbook = rows.map((row) => ({
            localTime: row.local_time,
            bidPrice: row.bid_price,
            askPrice: row.ask_price,
        }));
        rows = await db.sql(`SELECT * FROM "${market}/trades";`);
        data[market].trades = rows.map((row) => ({
            localTime: row.local_time,
            price: row.price,
            amount: row.amount,
            action: row.action,
        }));
    }
    console.log('writing');
    await fs_extra_1.writeJson(`${path_1.dirname(process_1.default.argv[2])}/${path_1.basename(process_1.default.argv[2], '.db')}.json`, data);
    console.log('closing');
    await db.stop();
})().catch(err => console.error);
//# sourceMappingURL=db2json.js.map