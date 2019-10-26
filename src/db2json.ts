import Database from 'async-sqlite';
import process from 'process';
import {
    writeJson,
} from 'fs-extra';
import {
    basename,
    dirname,
} from 'path';

interface Orderbook {
    market: string;
    localTime: number;
    bidPrice: number;
    askPrice: number;
}

interface Trade {
    market: string;
    localTime: number;
    amount: number;
    price: number;
    action: string;
}

interface Market {
    orderbooks: Orderbook[];
    trades: Trade[];
}

(async () => {
    const db = new Database(process.argv[2]);

    console.log('reading');
    await db.start();

    let data = <Market>{};
    let rows: any[];

    rows = await db.sql(`
        SELECT
            markets.name AS market,
            orderbooks.local_time,
            orderbooks.bid_price,
            orderbooks.ask_price
        FROM orderbooks JOIN markets
        ON orderbooks.market_id = markets.id
        ORDER BY local_time ASC
    ;`);
    data.orderbooks = rows.map((row): Orderbook => ({
        market: row.market,
        localTime: row.local_time,
        bidPrice: row.bid_price,
        askPrice: row.ask_price,
    }));

    rows = await db.sql(`
        SELECT
            markets.name AS market,
            trades.local_time,
            trades.price,
            trades.amount,
            trades.action
        FROM trades JOIN markets
        ON trades.market_id = markets.id
        ORDER BY local_time ASC
    ;`);
    data.trades = rows.map((row): Trade => ({
        market: row.market,
        localTime: row.local_time,
        price: row.price,
        amount: row.amount,
        action: row.action,
    }));

    console.log('writing');

    await writeJson(
        `${dirname(process.argv[2])}/${basename(process.argv[2], '.db')}.json`,
        data,
    );

    console.log('closing');

    await db.stop();
})().catch(err => console.error);