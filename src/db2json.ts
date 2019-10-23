import Database from 'async-sqlite';
import process from 'process';
import {
    readJsonSync,
    writeJson,
} from 'fs-extra';
import {
    join,
    basename,
    dirname,
} from 'path';

const markets: string[] = readJsonSync(join(__dirname,
    '../cfg/markets.json'));

interface Orderbook {
    localTime: number;
    bidPrice: number;
    askPrice: number;
}

interface Trade {
    localTime: number;
    amount: number;
    price: number;
    action: string;
}

interface Market {
    orderbook: Orderbook[];
    trades: Trade[];
}

(async () => {
    const db = new Database(process.argv[2]);
    const data: {
        [markets: string]: Market;
    } = {};

    console.log('reading');
    await db.start();

    for (const market of markets) {
        data[market] = <Market>{};
        let rows: any[];

        rows = await db.sql(`SELECT * FROM "${market}/orderbook";`);
        data[market].orderbook = rows.map((row): Orderbook => ({
            localTime: row.local_time,
            bidPrice: row.bid_price,
            askPrice: row.ask_price,
        }));

        rows = await db.sql(`SELECT * FROM "${market}/trades";`);
        data[market].trades = rows.map((row): Trade => ({
            localTime: row.local_time,
            price: row.price,
            amount: row.amount,
            action: row.action,
        }));
    }

    console.log('writing');

    await writeJson(
        `${dirname(process.argv[2])}/${basename(process.argv[2], '.db')}.json`,
        data,
    );

    console.log('closing');

    await db.stop();
})().catch(err => console.error);